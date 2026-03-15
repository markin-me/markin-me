require('dotenv').config();

const db = require('../db');
const {
  buildAddressIndexRecord,
  clearTenantLocalityCache,
  upsertLocality,
  replaceLocalityEntries,
  normalizeLocalAddressText,
} = require('../data/local-address-index');

const IMPORT_CONFIG = {
  anchor: {
    name: '\u041d\u043e\u0432\u043e\u0430\u043b\u0442\u0430\u0439\u0441\u043a',
    lat: 53.4121560,
    lng: 83.9320738,
  },
  localityRadiusKm: 25,
  overpassUrls: [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ],
  userAgent: 'markin-me-local-address-index/2.0 (+https://localhost:3000)',
  localityTypes: ['city', 'town', 'village', 'hamlet', 'settlement'],
  pauseMs: 1800,
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

  const anchorNormalizedName = normalizeLocalAddressText(IMPORT_CONFIG.anchor.name);
  if (!localities.some((item) => item.normalized_name === anchorNormalizedName)) {
    localities.unshift({
      source: 'manual',
      source_key: 'manual:novoaltaysk-anchor',
      name: IMPORT_CONFIG.anchor.name,
      normalized_name: anchorNormalizedName,
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

async function loadActiveLocalities() {
  const [rows] = await db.query(
    `SELECT id, source, source_key, name, normalized_name, center_lat, center_lng, is_active
       FROM sys_address_localities
      WHERE is_active=1
      ORDER BY name ASC`
  );
  return Array.isArray(rows) ? rows : [];
}

function getLocalityAddressRadiusKm(locality) {
  const placeType = String(locality && locality.place_type || '').trim().toLowerCase();
  switch (placeType) {
    case 'city':
      return 18;
    case 'town':
      return 10;
    case 'village':
    case 'settlement':
      return 6;
    case 'hamlet':
      return 4;
    default:
      return 8;
  }
}

function buildLocalityAddressQuery(locality) {
  const centerLat = Number(locality && locality.center_lat);
  const centerLng = Number(locality && locality.center_lng);
  const radiusMeters = Math.round(getLocalityAddressRadiusKm(locality) * 1000);
  return `
[out:json][timeout:180];
(
  node(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:street"];
  way(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:street"];
  relation(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:street"];
  node(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:place"];
  way(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:place"];
  relation(around:${radiusMeters},${centerLat},${centerLng})["addr:housenumber"]["addr:place"];
);
out center tags qt;
`;
}

function normalizeAddressLocalityTag(tags) {
  return normalizeLocalAddressText(
    (tags && (tags['addr:city'] || tags['addr:place'] || tags['is_in:city'] || tags['addr:suburb'])) || ''
  );
}

function normalizeAddressStreet(tags) {
  return String(
    tags && (tags['addr:street'] || tags['addr:place'] || tags['official_name'] || tags.name) || ''
  ).trim();
}

function getAddressObjectType(tags) {
  const hasStreet = String(tags && tags['addr:street'] || '').trim();
  const hasPlace = String(tags && tags['addr:place'] || '').trim();
  return !hasStreet && hasPlace ? 'place' : 'address';
}

function buildSourceKey(element) {
  return `osm:${String(element && element.type || '').trim()}:${String(element && element.id || '').trim()}`;
}

function pickLocalityForCandidate(candidate, localitiesByNormalizedName, localitiesById) {
  const taggedLocality = candidate && candidate.normalizedLocalityTag
    ? localitiesByNormalizedName.get(candidate.normalizedLocalityTag)
    : null;
  if (taggedLocality) return taggedLocality;

  const assignments = Array.isArray(candidate && candidate.assignments) ? candidate.assignments.slice() : [];
  assignments.sort((left, right) => {
    if (left.distanceKm !== right.distanceKm) return left.distanceKm - right.distanceKm;
    return left.localityId - right.localityId;
  });
  const nearest = assignments[0];
  return nearest ? (localitiesById.get(Number(nearest.localityId)) || null) : null;
}

function mergeBySourceKey(entries) {
  const merged = new Map();
  for (const item of Array.isArray(entries) ? entries : []) {
    if (!item || !item.source_key) continue;
    merged.set(String(item.source_key), item);
  }
  return Array.from(merged.values());
}

function stripKnownCityPrefix(address, cityName) {
  const raw = String(address || '').trim();
  const city = String(cityName || '').trim();
  if (!raw) return '';
  if (!city) return raw;
  const pattern = new RegExp(`^(?:\\u0433\\.?\\s*)?${escapeOverpassRegex(city)}\\s*,?\\s*`, 'i');
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

  return entries;
}

async function loadGlobalOsmCandidates(activeLocalities) {
  const localitiesByNormalizedName = new Map();
  const localitiesById = new Map();
  const successfulLocalityIds = new Set();
  const candidatesBySourceKey = new Map();

  for (const locality of Array.isArray(activeLocalities) ? activeLocalities : []) {
    const normalizedName = String(locality && locality.normalized_name || '').trim();
    if (normalizedName && !localitiesByNormalizedName.has(normalizedName)) {
      localitiesByNormalizedName.set(normalizedName, locality);
    }
    localitiesById.set(Number(locality.id), locality);
  }

  for (const locality of Array.isArray(activeLocalities) ? activeLocalities : []) {
    console.log(`OSM houses: ${locality.name}`);
    try {
      const payload = await fetchOverpassJson(buildLocalityAddressQuery(locality));
      successfulLocalityIds.add(Number(locality.id));

      (Array.isArray(payload && payload.elements) ? payload.elements : []).forEach((element) => {
        const tags = element && element.tags ? element.tags : {};
        const streetName = normalizeAddressStreet(tags);
        const houseNumber = String(tags && tags['addr:housenumber'] || '').trim();
        const center = getElementCenter(element);
        if (!streetName || !houseNumber || !center) return;

        const sourceKey = buildSourceKey(element);
        const distanceKm = haversineKm(
          Number(locality.center_lat),
          Number(locality.center_lng),
          center.lat,
          center.lng
        );
        const normalizedLocalityTag = normalizeAddressLocalityTag(tags);
        let candidate = candidatesBySourceKey.get(sourceKey);
        if (!candidate) {
          candidate = {
            sourceKey,
            streetName,
            houseNumber,
            lat: center.lat,
            lng: center.lng,
            objectType: getAddressObjectType(tags),
            normalizedLocalityTag,
            assignments: [],
          };
          candidatesBySourceKey.set(sourceKey, candidate);
        }
        candidate.assignments.push({
          localityId: Number(locality.id),
          distanceKm: Number(distanceKm.toFixed(3)),
        });
      });
    } catch (error) {
      console.error(`  OSM houses failed for ${locality.name}: ${error && error.message ? error.message : error}`);
    }
    await sleep(IMPORT_CONFIG.pauseMs);
  }

  const groupedByLocality = new Map();
  for (const candidate of candidatesBySourceKey.values()) {
    const locality = pickLocalityForCandidate(candidate, localitiesByNormalizedName, localitiesById);
    if (!locality || !successfulLocalityIds.has(Number(locality.id))) continue;

    const label = `${candidate.streetName}, ${candidate.houseNumber}`;
    const record = buildAddressIndexRecord(locality, {
      source: 'osm',
      source_key: candidate.sourceKey,
      object_type: candidate.objectType,
      label,
      full_address: `${locality.name}, ${label}`,
      street_name: candidate.streetName,
      house_number: candidate.houseNumber,
      lat: candidate.lat,
      lng: candidate.lng,
    });
    if (!groupedByLocality.has(Number(locality.id))) {
      groupedByLocality.set(Number(locality.id), []);
    }
    groupedByLocality.get(Number(locality.id)).push(record);
  }

  return {
    groupedByLocality,
    successfulLocalityIds,
  };
}

async function main() {
  console.log(`Local address houses import v2: ${IMPORT_CONFIG.anchor.name} + ${IMPORT_CONFIG.localityRadiusKm}km`);
  const localitySeeds = await loadLocalitiesAroundAnchor();
  console.log(`Discovered localities: ${localitySeeds.length}`);

  const placeTypesByLocality = new Map();
  for (const localitySeed of localitySeeds) {
    placeTypesByLocality.set(
      normalizeLocalAddressText(localitySeed && localitySeed.name),
      String(localitySeed && localitySeed.place_type || '').trim()
    );
    await upsertLocality(localitySeed);
  }

  const activeLocalities = (await loadActiveLocalities()).map((item) => ({
    ...item,
    place_type: placeTypesByLocality.get(String(item && item.normalized_name || '').trim()) || '',
  }));
  console.log(`Active localities to import: ${activeLocalities.length}`);

  const { groupedByLocality, successfulLocalityIds } = await loadGlobalOsmCandidates(activeLocalities);
  const imported = [];

  for (const locality of activeLocalities) {
    if (!successfulLocalityIds.has(Number(locality.id))) continue;

    const osmEntries = groupedByLocality.get(Number(locality.id)) || [];
    const internalEntries = await loadInternalKnownAddresses(locality);
    const mergedEntries = mergeBySourceKey([...osmEntries, ...internalEntries]);
    await replaceLocalityEntries(locality.id, mergedEntries, ['address', 'place']);
    imported.push({
      locality: locality.name,
      osm: osmEntries.length,
      internal: internalEntries.length,
      total: mergedEntries.length,
    });
    console.log(`Imported ${locality.name}: osm ${osmEntries.length}, internal ${internalEntries.length}, total ${mergedEntries.length}`);
  }

  clearTenantLocalityCache();
  console.log('Import completed.');
  imported.sort((left, right) => left.locality.localeCompare(right.locality, 'ru'));
  imported.forEach((item) => {
    console.log(`  ${item.locality}: ${item.total}`);
  });
}

main().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exit(1);
});
