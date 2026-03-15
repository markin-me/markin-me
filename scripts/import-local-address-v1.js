require('dotenv').config();

const db = require('../db');
const {
  buildAddressIndexRecord,
  clearTenantLocalityCache,
  upsertLocality,
  replaceLocalityEntries,
  normalizeLocalAddressText,
} = require('../data/local-address-index');

const CLI_FLAGS = new Set(process.argv.slice(2));
const STREETS_ONLY = CLI_FLAGS.has('--streets-only');

const IMPORT_CONFIG = {
  anchor: {
    name: 'Новоалтайск',
    lat: 53.4121560,
    lng: 83.9320738,
  },
  localityRadiusKm: 25,
  addressFetchRadiusKm: 40,
  overpassUrls: [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
  userAgent: 'markin-me-local-address-index/1.0 (+https://localhost:3000)',
  localityTypes: ['city', 'town', 'village', 'hamlet', 'settlement'],
  pauseMs: 2500,
  retryPauseMs: 6000,
  retryCount: 3,
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function toRadians(value) {
  return Number(value) * (Math.PI / 180);
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(Number(lat2) - Number(lat1));
  const dLng = toRadians(Number(lng2) - Number(lng1));
  const a = (
    Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1))
    * Math.cos(toRadians(lat2))
    * Math.sin(dLng / 2) ** 2
  );
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function escapeOverpassRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function fetchOverpassJson(query) {
  let lastError = null;
  for (let attempt = 0; attempt < IMPORT_CONFIG.retryCount; attempt += 1) {
    for (const endpoint of IMPORT_CONFIG.overpassUrls) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': IMPORT_CONFIG.userAgent,
          },
          body: new URLSearchParams({ data: query }),
        });
        const payloadText = await response.text().catch(() => '');
        if (!response.ok) {
          lastError = new Error(`OVERPASS_${response.status}: ${payloadText.slice(0, 240)}`);
          if (response.status === 429 || response.status >= 500) {
            continue;
          }
          throw lastError;
        }
        try {
          return JSON.parse(payloadText);
        } catch (_) {
          lastError = new Error(`OVERPASS_BAD_PAYLOAD: ${payloadText.slice(0, 240)}`);
        }
      } catch (error) {
        lastError = error;
      }
    }
    if (attempt < IMPORT_CONFIG.retryCount - 1) {
      await sleep(IMPORT_CONFIG.retryPauseMs * (attempt + 1));
    }
  }
  throw lastError || new Error('OVERPASS_FAILED');
}

function getElementCenter(element) {
  if (!element || typeof element !== 'object') return null;
  if (Number.isFinite(Number(element.lat)) && Number.isFinite(Number(element.lon))) {
    return { lat: Number(element.lat), lng: Number(element.lon) };
  }
  if (element.center && Number.isFinite(Number(element.center.lat)) && Number.isFinite(Number(element.center.lon))) {
    return { lat: Number(element.center.lat), lng: Number(element.center.lon) };
  }
  return null;
}

async function loadLocalitiesAroundAnchor() {
  const radiusMeters = Math.round(IMPORT_CONFIG.localityRadiusKm * 1000);
  const placeRegex = IMPORT_CONFIG.localityTypes.join('|');
  const query = `
[out:json][timeout:120];
(
  node(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["place"~"^(${placeRegex})$"];
  way(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["place"~"^(${placeRegex})$"];
  relation(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["place"~"^(${placeRegex})$"];
);
out center tags qt;
`;
  const payload = await fetchOverpassJson(query);
  const seen = new Set();
  const localities = [];

  (Array.isArray(payload && payload.elements) ? payload.elements : []).forEach((element) => {
    const tags = element && element.tags ? element.tags : {};
    const name = String(tags.name || '').trim();
    const center = getElementCenter(element);
    if (!name || !center) return;
    const normalized = normalizeLocalAddressText(name);
    if (!normalized || seen.has(normalized)) return;
    const distanceKm = haversineKm(
      IMPORT_CONFIG.anchor.lat,
      IMPORT_CONFIG.anchor.lng,
      center.lat,
      center.lng
    );
    if (distanceKm > IMPORT_CONFIG.localityRadiusKm) return;
    seen.add(normalized);
    localities.push({
      source: 'osm',
      source_key: `${element.type}:${element.id}`,
      name,
      normalized_name: normalized,
      place_type: String(tags.place || '').trim(),
      center_lat: center.lat,
      center_lng: center.lng,
      distance_km: Number(distanceKm.toFixed(3)),
    });
  });

  if (!localities.some((item) => item.normalized_name === normalizeLocalAddressText(IMPORT_CONFIG.anchor.name))) {
    localities.unshift({
      source: 'manual',
      source_key: 'manual:novoaltaysk-anchor',
      name: IMPORT_CONFIG.anchor.name,
      normalized_name: normalizeLocalAddressText(IMPORT_CONFIG.anchor.name),
      place_type: 'town',
      center_lat: IMPORT_CONFIG.anchor.lat,
      center_lng: IMPORT_CONFIG.anchor.lng,
      distance_km: 0,
    });
  }

  localities.sort((left, right) => {
    if (left.distance_km !== right.distance_km) return left.distance_km - right.distance_km;
    return left.name.localeCompare(right.name, 'ru');
  });
  return localities;
}

function buildLocalityAddressQuery(localityName) {
  const radiusMeters = Math.round(IMPORT_CONFIG.addressFetchRadiusKm * 1000);
  const localityRegex = escapeOverpassRegex(localityName);
  return `
[out:json][timeout:180];
(
  node(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:city"~"^${localityRegex}$",i];
  way(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:city"~"^${localityRegex}$",i];
  relation(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:city"~"^${localityRegex}$",i];
  node(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:place"~"^${localityRegex}$",i];
  way(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:place"~"^${localityRegex}$",i];
  relation(around:${radiusMeters},${IMPORT_CONFIG.anchor.lat},${IMPORT_CONFIG.anchor.lng})["addr:housenumber"]["addr:place"~"^${localityRegex}$",i];
);
out center tags qt;
`;
}

function getLocalityStreetRadiusKm(locality) {
  const placeType = String(locality && locality.place_type || '').trim().toLowerCase();
  switch (placeType) {
    case 'city':
      return 20;
    case 'town':
      return 12;
    case 'village':
    case 'settlement':
      return 7;
    case 'hamlet':
      return 4;
    default:
      return 9;
  }
}

function buildLocalityStreetQuery(locality) {
  const centerLat = Number(locality && locality.center_lat);
  const centerLng = Number(locality && locality.center_lng);
  const radiusMeters = Math.round(getLocalityStreetRadiusKm(locality) * 1000);
  return `
[out:json][timeout:180];
(
  way(around:${radiusMeters},${centerLat},${centerLng})["highway"]["name"];
  relation(around:${radiusMeters},${centerLat},${centerLng})["highway"]["name"];
  node(around:${radiusMeters},${centerLat},${centerLng})["place"~"^(suburb|quarter|neighbourhood|allotments)$"]["name"];
  way(around:${radiusMeters},${centerLat},${centerLng})["place"~"^(suburb|quarter|neighbourhood|allotments)$"]["name"];
  relation(around:${radiusMeters},${centerLat},${centerLng})["place"~"^(suburb|quarter|neighbourhood|allotments)$"]["name"];
);
out center tags qt;
`;
}

async function loadLocalityAddresses(locality) {
  const payload = await fetchOverpassJson(buildLocalityAddressQuery(locality.name));
  const items = [];
  const seen = new Set();

  (Array.isArray(payload && payload.elements) ? payload.elements : []).forEach((element) => {
    const tags = element && element.tags ? element.tags : {};
    const streetName = String(tags['addr:street'] || tags['addr:place'] || '').trim();
    const houseNumber = String(tags['addr:housenumber'] || '').trim();
    const center = getElementCenter(element);
    if (!streetName || !houseNumber || !center) return;
    const label = `${streetName}, ${houseNumber}`;
    const dedupeKey = normalizeLocalAddressText(label);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    items.push(buildAddressIndexRecord(locality, {
      source: 'osm',
      source_key: `osm:${element.type}:${element.id}`,
      object_type: tags['addr:place'] ? 'place' : 'address',
      label,
      full_address: `${locality.name}, ${label}`,
      street_name: streetName,
      house_number: houseNumber,
      lat: center.lat,
      lng: center.lng,
    }));
  });

  items.sort((left, right) => left.label.localeCompare(right.label, 'ru'));
  return items;
}

function buildStreetIndexRecord(locality, source, sourceKey, streetName, lat = null, lng = null) {
  const resolvedStreetName = String(streetName || '').trim();
  if (!resolvedStreetName) return null;
  return buildAddressIndexRecord(locality, {
    source,
    source_key: sourceKey,
    object_type: 'street',
    label: resolvedStreetName,
    full_address: `${locality.name}, ${resolvedStreetName}`,
    street_name: resolvedStreetName,
    house_number: '',
    lat,
    lng,
  });
}

async function loadLocalityStreets(locality) {
  const payload = await fetchOverpassJson(buildLocalityStreetQuery(locality));
  const items = [];
  const seen = new Set();

  (Array.isArray(payload && payload.elements) ? payload.elements : []).forEach((element) => {
    const tags = element && element.tags ? element.tags : {};
    const streetName = String(tags.name || '').trim();
    if (!streetName) return;
    const dedupeKey = normalizeLocalAddressText(streetName);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    const center = getElementCenter(element);
    const record = buildStreetIndexRecord(
      locality,
      'osm',
      `street:${locality.id}:${element.type}:${element.id}`,
      streetName,
      center ? center.lat : null,
      center ? center.lng : null
    );
    if (!record) return;
    seen.add(dedupeKey);
    items.push(record);
  });

  items.sort((left, right) => left.label.localeCompare(right.label, 'ru'));
  return items;
}

function stripKnownCityPrefix(address, cityName) {
  const raw = String(address || '').trim();
  const city = String(cityName || '').trim();
  if (!raw) return '';
  if (!city) return raw;
  const pattern = new RegExp(`^(?:г\\.?\\s*)?${escapeOverpassRegex(city)}\\s*,?\\s*`, 'i');
  return raw.replace(pattern, '').trim();
}

async function loadInternalKnownAddresses(locality) {
  const cityName = String(locality && locality.name || '').trim();
  if (!cityName) return [];
  const entries = [];
  const seen = new Set();

  const [storeRows] = await db.query(
    `SELECT tenant_id, id, address
       FROM ten_stores
      WHERE NULLIF(TRIM(city), '') IS NOT NULL
        AND LOWER(TRIM(city)) = LOWER(?)`,
    [cityName]
  );
  (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
    const address = stripKnownCityPrefix(row && row.address, cityName);
    if (!address) return;
    const dedupeKey = normalizeLocalAddressText(address);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push(buildAddressIndexRecord(locality, {
      source: 'internal',
      source_key: `store:${row.tenant_id}:${row.id}`,
      object_type: 'address',
      label: address,
      full_address: `${cityName}, ${address}`,
      street_name: address,
      house_number: '',
      lat: null,
      lng: null,
    }));
  });

  const [customerRows] = await db.query(
    `SELECT id, street, house
       FROM cust_customer_addresses
      WHERE NULLIF(TRIM(city), '') IS NOT NULL
        AND LOWER(TRIM(city)) = LOWER(?)`,
    [cityName]
  );
  (Array.isArray(customerRows) ? customerRows : []).forEach((row) => {
    const street = String(row && row.street || '').trim();
    const house = String(row && row.house || '').trim();
    const label = [street, house].filter(Boolean).join(', ');
    if (!label) return;
    const dedupeKey = normalizeLocalAddressText(label);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push(buildAddressIndexRecord(locality, {
      source: 'internal',
      source_key: `customer-address:${row.id}`,
      object_type: 'address',
      label,
      full_address: `${cityName}, ${label}`,
      street_name: street,
      house_number: house,
      lat: null,
      lng: null,
    }));
  });

  const [orderRows] = await db.query(
    `SELECT id, address
       FROM order_orders
      WHERE NULLIF(TRIM(address), '') IS NOT NULL
        AND LOWER(TRIM(address)) LIKE LOWER(CONCAT('%', ?, '%'))`,
    [cityName]
  );
  (Array.isArray(orderRows) ? orderRows : []).forEach((row) => {
    const shortAddress = stripKnownCityPrefix(row && row.address, cityName);
    if (!shortAddress) return;
    const dedupeKey = normalizeLocalAddressText(shortAddress);
    if (!dedupeKey || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    entries.push(buildAddressIndexRecord(locality, {
      source: 'internal',
      source_key: `order:${row.id}`,
      object_type: 'address',
      label: shortAddress,
      full_address: `${cityName}, ${shortAddress}`,
      street_name: shortAddress,
      house_number: '',
      lat: null,
      lng: null,
    }));
  });

  return entries;
}

async function loadDerivedStreetEntries(locality) {
  const localityId = Number(locality && locality.id);
  if (!localityId) return [];
  const [rows] = await db.query(
    `SELECT street_name, lat, lng
       FROM sys_address_index
      WHERE locality_id=?
        AND object_type IN ('address', 'place')
        AND NULLIF(TRIM(street_name), '') IS NOT NULL
      ORDER BY street_name ASC`,
    [localityId]
  );
  const seen = new Set();
  const items = [];
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const streetName = String(row && row.street_name || '').trim();
    const dedupeKey = normalizeLocalAddressText(streetName);
    if (!streetName || !dedupeKey || seen.has(dedupeKey)) return;
    const record = buildStreetIndexRecord(
      locality,
      'derived',
      `derived-street:${localityId}:${dedupeKey}`,
      streetName,
      row && row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
      row && row.lng !== null && row.lng !== undefined ? Number(row.lng) : null
    );
    if (!record) return;
    seen.add(dedupeKey);
    items.push(record);
  });
  return items;
}

function mergeStreetEntries(osmEntries, derivedEntries) {
  const merged = new Map();
  (Array.isArray(osmEntries) ? osmEntries : []).forEach((item) => {
    const dedupeKey = normalizeLocalAddressText(item && item.street_name);
    if (!dedupeKey || merged.has(dedupeKey)) return;
    merged.set(dedupeKey, item);
  });
  (Array.isArray(derivedEntries) ? derivedEntries : []).forEach((item) => {
    const dedupeKey = normalizeLocalAddressText(item && item.street_name);
    if (!dedupeKey || merged.has(dedupeKey)) return;
    merged.set(dedupeKey, item);
  });
  return Array.from(merged.values()).sort((left, right) => left.label.localeCompare(right.label, 'ru'));
}

async function loadActiveLocalities() {
  const [rows] = await db.query(
    `SELECT id, source, source_key, name, normalized_name, center_lat, center_lng, is_active
       FROM sys_address_localities
      WHERE is_active=1
      ORDER BY name ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

async function main() {
  console.log(`Local address index import: ${IMPORT_CONFIG.anchor.name} + ${IMPORT_CONFIG.localityRadiusKm}km${STREETS_ONLY ? ' [streets-only]' : ''}`);
  const rawLocalities = await loadLocalitiesAroundAnchor();
  console.log(`Discovered localities: ${rawLocalities.length}`);

  const placeTypesByLocality = new Map();
  for (const localitySeed of rawLocalities) {
    placeTypesByLocality.set(
      normalizeLocalAddressText(localitySeed && localitySeed.name),
      String(localitySeed && localitySeed.place_type || '').trim()
    );
    await upsertLocality(localitySeed);
  }

  const activeLocalities = await loadActiveLocalities();
  console.log(`Active localities to import: ${activeLocalities.length}`);

  const imported = [];
  const failed = [];
  for (const baseLocality of activeLocalities) {
    try {
      const locality = {
        ...baseLocality,
        place_type: placeTypesByLocality.get(String(baseLocality && baseLocality.normalized_name || '').trim()) || '',
      };
      console.log(`Locality: ${locality.name}`);

      let addressCount = 0;
      if (!STREETS_ONLY) {
        const osmEntries = await loadLocalityAddresses(locality);
        const internalEntries = await loadInternalKnownAddresses(locality);
        const mergedByKey = new Map();
        [...osmEntries, ...internalEntries].forEach((item) => {
          if (!item || !item.source_key) return;
          mergedByKey.set(item.source_key, item);
        });
        const mergedEntries = Array.from(mergedByKey.values());
        await replaceLocalityEntries(locality.id, mergedEntries, ['address', 'place']);
        addressCount = mergedEntries.length;
        console.log(`  addresses: osm ${osmEntries.length}, internal ${internalEntries.length}, total ${mergedEntries.length}`);
      }

      const osmStreetEntries = await loadLocalityStreets(locality);
      const derivedStreetEntries = await loadDerivedStreetEntries(locality);
      const mergedStreetEntries = mergeStreetEntries(osmStreetEntries, derivedStreetEntries);
      await replaceLocalityEntries(locality.id, mergedStreetEntries, ['street']);
      console.log(`  streets: osm ${osmStreetEntries.length}, derived ${derivedStreetEntries.length}, total ${mergedStreetEntries.length}`);
      imported.push({
        locality: locality.name,
        addresses: addressCount,
        streets: mergedStreetEntries.length,
      });
    } catch (error) {
      const message = error && error.message ? error.message : String(error || 'UNKNOWN_ERROR');
      console.error(`  error: ${message}`);
      failed.push({ locality: baseLocality.name, error: message });
    }
    await sleep(IMPORT_CONFIG.pauseMs);
  }

  clearTenantLocalityCache();
  console.log('Import completed.');
  imported.forEach((item) => {
    console.log(`  ${item.locality}: addresses ${item.addresses}, streets ${item.streets}`);
  });
  if (failed.length) {
    console.log('Failed localities:');
    failed.forEach((item) => {
      console.log(`  ${item.locality}: ${item.error}`);
    });
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('Local address index import failed:', error && error.message ? error.message : error);
  process.exit(1);
});
