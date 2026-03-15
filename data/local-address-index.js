const db = require('../db');
const {
  normalizeHouseToken: normalizeSharedHouseToken,
  isHouseToken: isSharedHouseToken,
  extractHouseToken: extractSharedHouseToken,
} = require('../services/address-service/src/normalization');

const LOCAL_SCOPE = 'local';
const LOCAL_SCOPE_LABEL = 'Локальный справочник';
const TENANT_LOCALITY_CACHE_MS = 60 * 1000;
const GLOBAL_LOCALITY_CACHE_MS = 60 * 1000;
const LOCAL_CONTEXT_RADIUS_KM = 25;
const ADDRESS_SEARCH_LIMIT = 160;
const LOCAL_RESULT_LIMIT = 12;
const ROOT_LOCALITY_NAMES = new Set([
  'новоалтайск',
  'барнаул',
]);
const tenantLocalityCache = new Map();
let allLocalitiesCache = { expiresAt: 0, items: [] };

function normalizeRootLocalityName(value) {
  return normalizeLocalAddressText(value);
}

function isRootLocality(locality) {
  const normalizedName = String(locality && locality.normalized_name || '').trim()
    || normalizeRootLocalityName(locality && locality.name);
  return ROOT_LOCALITY_NAMES.has(normalizedName);
}

function normalizeLocalAddressText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:()[\]{}"'`№]/g, ' ')
    .replace(/[-/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLocalAddressText(value) {
  return normalizeLocalAddressText(value).replace(/\s+/g, '');
}

function escapeLike(value) {
  return String(value || '').replace(/[\\%_]/g, '\\$&');
}

function uniqueStrings(values) {
  const seen = new Set();
  const result = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const value = String(raw || '').trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function splitSearchTokens(value) {
  return normalizeLocalAddressText(value)
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitRawAddressTokens(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,;:()[\]{}"'`№]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isOrdinalAddressPair(token, nextToken) {
  return /^\d+$/.test(String(token || '').trim()) && /^(й|я|ый|ая)$/.test(String(nextToken || '').trim());
}

function isStandaloneHouseToken(token) {
  return isSharedHouseToken(token);
}

function isBlockedHouseFirstToken(nextToken) {
  const value = String(nextToken || '').trim();
  if (!value) return false;
  return /^(лет|года|год|улица|ул|переулок|пер|проспект|пр-кт|проезд|пр-д|шоссе|площадь|пл|бульвар|бул|набережная|наб|линия|аллея|тракт|тупик|дорога|км|километр|микрорайон|мкр|квартал|кв-л|квартал|поселок|посёлок|село|деревня)$/i.test(value);
}

function normalizeLocalHouseNumber(value) {
  return normalizeSharedHouseToken(value);
}

function extractHousePartFromAddressQuery(value) {
  return extractSharedHouseToken(value);
}

function isHouseLikeLocalAddressQuery(value) {
  const normalized = normalizeLocalAddressText(value);
  if (!normalized) return false;
  if (/\b(?:дом|д|корпус|корп|строение|стр|литер|кв|квартира|подъезд|под|этаж|эт)\b/.test(normalized)) {
    return true;
  }
  return Boolean(extractHousePartFromAddressQuery(normalized));
}

function levenshteinDistance(a, b, maxDistance = 3) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left) return right.length;
  if (!right) return left.length;
  const lenDiff = Math.abs(left.length - right.length);
  if (lenDiff > maxDistance) return maxDistance + 1;
  const cols = right.length + 1;
  const prev = new Array(cols);
  const curr = new Array(cols);
  for (let j = 0; j < cols; j += 1) prev[j] = j;
  for (let i = 1; i <= left.length; i += 1) {
    curr[0] = i;
    let minInRow = curr[0];
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost
      );
      if (curr[j] < minInRow) minInRow = curr[j];
    }
    if (minInRow > maxDistance) return maxDistance + 1;
    for (let j = 0; j < cols; j += 1) prev[j] = curr[j];
  }
  return prev[right.length];
}

function scoreLocalAddressCandidate(query, candidate) {
  const normalizedQuery = normalizeLocalAddressText(query);
  const normalizedCandidate = normalizeLocalAddressText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return -1;
  if (normalizedCandidate === normalizedQuery) return 1500;
  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 1300 - Math.min(240, normalizedCandidate.length - normalizedQuery.length);
  }

  const queryTokens = splitSearchTokens(normalizedQuery);
  const candidateTokens = splitSearchTokens(normalizedCandidate);
  const wordPrefix = queryTokens.every((token) => candidateTokens.some((item) => item.startsWith(token)));
  if (wordPrefix) return 1180 - Math.min(200, candidateTokens.length * 4);

  if (normalizedCandidate.includes(normalizedQuery)) {
    return 980 - Math.min(160, normalizedCandidate.indexOf(normalizedQuery) * 2);
  }

  const compactQuery = compactLocalAddressText(normalizedQuery);
  const compactCandidate = compactLocalAddressText(normalizedCandidate);
  if (compactCandidate === compactQuery) return 1120;
  if (compactCandidate.startsWith(compactQuery)) return 1040;
  if (compactCandidate.includes(compactQuery)) {
    return 920 - Math.min(120, compactCandidate.indexOf(compactQuery) * 2);
  }

  const distance = levenshteinDistance(compactQuery, compactCandidate, 2);
  if (distance <= 2) return 760 - (distance * 90);

  return -1;
}

function rankLocalAddressItems(items, query, candidateFactory, limit = LOCAL_RESULT_LIMIT) {
  const scored = (Array.isArray(items) ? items : []).map((item) => {
    const candidates = uniqueStrings(candidateFactory(item));
    let bestScore = -1;
    for (const candidate of candidates) {
      const score = scoreLocalAddressCandidate(query, candidate);
      if (score > bestScore) bestScore = score;
    }
    return { item, score: bestScore };
  }).filter((entry) => entry.score >= 0);

  scored.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const leftLabel = String(left.item && (left.item.label || left.item.value || left.item.full_address || '') || '');
    const rightLabel = String(right.item && (right.item.label || right.item.value || right.item.full_address || '') || '');
    return leftLabel.localeCompare(rightLabel, 'ru');
  });

  return scored.slice(0, Math.max(1, Number(limit) || LOCAL_RESULT_LIMIT)).map((entry) => entry.item);
}

function buildLocalSearchResponse(query, items, scopeLabel = LOCAL_SCOPE_LABEL) {
  return {
    ok: true,
    data: {
      query: String(query || '').trim(),
      scope: LOCAL_SCOPE,
      scope_label: scopeLabel,
      items: Array.isArray(items) ? items : [],
    },
  };
}

function buildLocalityRecord(locality) {
  const source = String(locality && locality.source || 'osm').trim() || 'osm';
  const sourceKey = String(locality && locality.source_key || '').trim();
  const name = String(locality && locality.name || '').trim();
  const lat = Number(locality && locality.center_lat);
  const lng = Number(locality && locality.center_lng);
  if (!sourceKey || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('LOCALITY_RECORD_INVALID');
  }
  return {
    source,
    source_key: sourceKey,
    name,
    normalized_name: normalizeLocalAddressText(name),
    center_lat: lat,
    center_lng: lng,
    is_active: Number(locality && locality.is_active) === 0 ? 0 : 1,
  };
}

function buildAddressIndexSearchFields(localityName, label, streetName, houseNumber) {
  const normalizedLabel = normalizeLocalAddressText(label);
  const normalizedLabelAlt = normalizeLocalAddressText(
    [houseNumber, streetName].filter(Boolean).join(' ')
  );
  const normalizedCompact = compactLocalAddressText(label);
  const normalizedCompactAlt = compactLocalAddressText(
    [houseNumber, streetName].filter(Boolean).join(' ')
  );
  const normalizedFull = normalizeLocalAddressText([localityName, label].filter(Boolean).join(' '));
  const normalizedFullAlt = normalizeLocalAddressText(
    [localityName, houseNumber, streetName].filter(Boolean).join(' ')
  );
  const searchBlob = uniqueStrings([
    normalizedLabel,
    normalizedLabelAlt,
    normalizedFull,
    normalizedFullAlt,
    normalizeLocalAddressText(streetName),
    normalizeLocalAddressText(houseNumber),
    normalizeLocalAddressText([streetName, houseNumber].filter(Boolean).join(' ')),
    normalizeLocalAddressText([houseNumber, streetName].filter(Boolean).join(' ')),
  ]).join(' | ');

  return {
    normalized_label: normalizedLabel,
    normalized_label_alt: normalizedLabelAlt,
    normalized_compact: normalizedCompact,
    normalized_compact_alt: normalizedCompactAlt,
    search_blob: searchBlob,
  };
}

function buildAddressIndexRecord(locality, entry) {
  const localityName = String(locality && locality.name || '').trim();
  const localityId = Number(locality && locality.id);
  const source = String(entry && entry.source || 'osm').trim() || 'osm';
  const sourceKey = String(entry && entry.source_key || '').trim();
  const objectType = String(entry && entry.object_type || 'address').trim() || 'address';
  const label = String(entry && entry.label || '').trim();
  const fullAddress = String(entry && entry.full_address || [localityName, label].filter(Boolean).join(', ')).trim();
  const streetName = String(entry && entry.street_name || '').trim();
  const houseNumber = String(entry && entry.house_number || '').trim();
  const lat = entry && entry.lat !== undefined && entry.lat !== null ? Number(entry.lat) : null;
  const lng = entry && entry.lng !== undefined && entry.lng !== null ? Number(entry.lng) : null;

  if (!localityId || !sourceKey || !label) {
    throw new Error('ADDRESS_INDEX_RECORD_INVALID');
  }

  const searchFields = buildAddressIndexSearchFields(localityName, label, streetName, houseNumber);
  return {
    locality_id: localityId,
    source,
    source_key: sourceKey,
    object_type: objectType,
    label,
    full_address: fullAddress,
    street_name: streetName || null,
    house_number: houseNumber || null,
    normalized_label: searchFields.normalized_label,
    normalized_label_alt: searchFields.normalized_label_alt,
    normalized_compact: searchFields.normalized_compact,
    normalized_compact_alt: searchFields.normalized_compact_alt,
    search_blob: searchFields.search_blob,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

async function upsertLocality(record) {
  const locality = buildLocalityRecord(record);
  await db.query(
    `INSERT INTO sys_address_localities
      (source, source_key, name, normalized_name, center_lat, center_lng, is_active)
     VALUES (?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
      name=VALUES(name),
      normalized_name=VALUES(normalized_name),
      center_lat=VALUES(center_lat),
      center_lng=VALUES(center_lng),
      is_active=VALUES(is_active)`,
    [
      locality.source,
      locality.source_key,
      locality.name,
      locality.normalized_name,
      locality.center_lat,
      locality.center_lng,
      locality.is_active,
    ]
  );

  const [rows] = await db.query(
    `SELECT id, source, source_key, name, normalized_name, center_lat, center_lng, is_active
       FROM sys_address_localities
      WHERE source=? AND source_key=?
      LIMIT 1`,
    [locality.source, locality.source_key]
  );
  return rows && rows[0] ? rows[0] : null;
}

async function replaceLocalityEntries(localityId, entries, objectTypes = null) {
  const resolvedLocalityId = Number(localityId);
  if (!resolvedLocalityId) {
    throw new Error('LOCALITY_ID_REQUIRED');
  }
  const rows = Array.isArray(entries) ? entries.slice() : [];
  const resolvedTypes = uniqueStrings(
    Array.isArray(objectTypes) && objectTypes.length
      ? objectTypes
      : rows.map((item) => item && item.object_type)
  );
  if (resolvedTypes.length) {
    await db.query(
      `DELETE FROM sys_address_index
        WHERE locality_id=?
          AND object_type IN (${resolvedTypes.map(() => '?').join(', ')})`,
      [resolvedLocalityId, ...resolvedTypes]
    );
  }
  if (!rows.length) return;

  const chunkSize = 200;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(', ');
    const params = [];
    chunk.forEach((item) => {
      params.push(
        item.locality_id,
        item.source,
        item.source_key,
        item.object_type,
        item.label,
        item.full_address,
        item.street_name,
        item.house_number,
        item.normalized_label,
        item.normalized_label_alt,
        item.normalized_compact,
        item.normalized_compact_alt,
        item.search_blob,
        item.lat
      );
      params.push(item.lng);
    });
    await db.query(
      `INSERT INTO sys_address_index
        (locality_id, source, source_key, object_type, label, full_address, street_name, house_number, normalized_label, normalized_label_alt, normalized_compact, normalized_compact_alt, search_blob, lat, lng)
       VALUES ${chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(', ')}`,
      chunk.flatMap((item) => [
        item.locality_id,
        item.source,
        item.source_key,
        item.object_type,
        item.label,
        item.full_address,
        item.street_name,
        item.house_number,
        item.normalized_label,
        item.normalized_label_alt,
        item.normalized_compact,
        item.normalized_compact_alt,
        item.search_blob,
        item.lat,
        item.lng,
      ])
    );
  }
}

async function getTenantAccessibleLocalities(tenantId) {
  const resolvedTenantId = Number(tenantId);
  if (!resolvedTenantId) return [];
  const cacheKey = String(resolvedTenantId);
  const cached = tenantLocalityCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.items.slice();
  }

  const [cityRows] = await db.query(
    `SELECT DISTINCT TRIM(city) AS city
       FROM ten_stores
      WHERE tenant_id=?
        AND NULLIF(TRIM(city), '') IS NOT NULL`,
    [resolvedTenantId]
  );
  const normalizedCities = uniqueStrings(
    (Array.isArray(cityRows) ? cityRows : []).map((row) => normalizeLocalAddressText(row && row.city))
  );
  if (!normalizedCities.length) {
    tenantLocalityCache.set(cacheKey, { expiresAt: now + TENANT_LOCALITY_CACHE_MS, items: [] });
    return [];
  }

  const [rows] = await db.query(
    `SELECT id, name, normalized_name, center_lat, center_lng
       FROM sys_address_localities
      WHERE is_active=1
        AND normalized_name IN (${normalizedCities.map(() => '?').join(', ')})
      ORDER BY name ASC`,
    normalizedCities
  );
  const items = Array.isArray(rows) ? rows : [];
  tenantLocalityCache.set(cacheKey, { expiresAt: now + TENANT_LOCALITY_CACHE_MS, items });
  return items.slice();
}

function clearTenantLocalityCache() {
  tenantLocalityCache.clear();
}

async function getAllActiveLocalities() {
  const now = Date.now();
  if (allLocalitiesCache.items.length && allLocalitiesCache.expiresAt > now) {
    return allLocalitiesCache.items.slice();
  }
  const [rows] = await db.query(
    `SELECT id, source, source_key, name, normalized_name, center_lat, center_lng, is_active
       FROM sys_address_localities
      WHERE is_active=1
      ORDER BY name ASC`
  );
  const items = Array.isArray(rows) ? rows : [];
  allLocalitiesCache = {
    expiresAt: now + GLOBAL_LOCALITY_CACHE_MS,
    items,
  };
  return items.slice();
}

async function getRootLocalities() {
  const localities = await getAllActiveLocalities();
  return localities.filter((item) => isRootLocality(item));
}

async function resolveLocalityByInput(city, options = {}) {
  const sourceKey = String(options && options.sourceKey || '').trim();
  const localities = options && options.rootOnly
    ? await getRootLocalities()
    : await getAllActiveLocalities();
  if (sourceKey) {
    return localities.find((item) => String(item && item.source_key || '').trim() === sourceKey) || null;
  }
  const normalizedCity = normalizeLocalAddressText(city);
  if (!normalizedCity) return null;
  const matches = localities.filter((item) => String(item && item.normalized_name || '').trim() === normalizedCity);
  return matches.length === 1 ? matches[0] : null;
}

async function getLocalAddressIndexRowBySourceKey(sourceKey) {
  const resolvedSourceKey = String(sourceKey || '').trim();
  if (!resolvedSourceKey) return null;
  const [rows] = await db.query(
    `SELECT idx.id,
            idx.locality_id,
            idx.source,
            idx.source_key,
            idx.object_type,
            idx.label,
            idx.full_address,
            idx.street_name,
            idx.house_number,
            idx.lat,
            idx.lng,
            loc.source_key AS locality_source_key,
            loc.name AS locality_name,
            loc.normalized_name AS locality_normalized_name
       FROM sys_address_index idx
       JOIN sys_address_localities loc ON loc.id=idx.locality_id
      WHERE idx.source_key=?
      LIMIT 1`,
    [resolvedSourceKey]
  );
  return rows && rows[0] ? rows[0] : null;
}

function toRadians(value) {
  return Number(value) * (Math.PI / 180);
}

function calculateLocalityDistanceKm(left, right) {
  const lat1 = Number(left && left.center_lat);
  const lng1 = Number(left && left.center_lng);
  const lat2 = Number(right && right.center_lat);
  const lng2 = Number(right && right.center_lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Number.POSITIVE_INFINITY;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

async function getLocalitySearchScope(baseLocality, radiusKm = LOCAL_CONTEXT_RADIUS_KM) {
  if (!baseLocality || !Number(baseLocality.id)) return [];
  const localities = await getAllActiveLocalities();
  return localities
    .map((item) => ({
      item,
      distance: item.id === baseLocality.id ? 0 : calculateLocalityDistanceKm(baseLocality, item),
    }))
    .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= radiusKm)
    .sort((left, right) => {
      if (left.distance !== right.distance) return left.distance - right.distance;
      return String(left.item && left.item.name || '').localeCompare(String(right.item && right.item.name || ''), 'ru');
    })
    .map((entry) => entry.item);
}

function buildLocalCityItems(localities) {
  return (Array.isArray(localities) ? localities : []).map((item) => ({
    label: String(item && item.name || '').trim(),
    value: String(item && item.name || '').trim(),
    object_type: 'city',
    stage: 'city',
    source_key: String(item && item.source_key || '').trim(),
    city_name: String(item && item.name || '').trim(),
    context_locality: String(item && item.name || '').trim(),
    normalized_city: String(item && item.normalized_name || '').trim(),
    normalized_address: '',
    full_address: String(item && item.name || '').trim(),
    lat: item && item.center_lat !== undefined && item.center_lat !== null ? Number(item.center_lat) : null,
    lng: item && item.center_lng !== undefined && item.center_lng !== null ? Number(item.center_lng) : null,
  })).filter((item) => item.city_name);
}

async function searchLocalCitySuggest(query, options = {}) {
  const localities = await getRootLocalities();
  const items = rankLocalAddressItems(
    buildLocalCityItems(localities),
    query,
    (item) => [item.city_name, item.label, item.value],
    options.limit
  );
  return buildLocalSearchResponse(query, items);
}

async function resolveTenantLocality(tenantId, city) {
  const normalizedCity = normalizeLocalAddressText(city);
  if (!normalizedCity) return null;
  const localities = await getTenantAccessibleLocalities(tenantId);
  return localities.find((item) => String(item && item.normalized_name || '').trim() === normalizedCity) || null;
}

async function searchLocalAddressRowsInScope(baseLocality, query, options = {}) {
  const normalizedQuery = normalizeLocalAddressText(query);
  const compactQuery = compactLocalAddressText(query);
  const queryTokens = uniqueStrings(
    splitSearchTokens(query).filter((token) => token.length >= 3 && !/^\d+$/.test(token))
  );
  if (!normalizedQuery || !baseLocality || !Number(baseLocality.id)) {
    return { rows: [], scopeLabelName: String(baseLocality && baseLocality.name || '').trim() };
  }

  const selectedRow = options && options.selectedRow ? options.selectedRow : null;
  let localityIds = [];
  let scopeLabelName = String(baseLocality && baseLocality.name || '').trim();
  let prefixSql = '';
  let prefixParams = [];

  if (selectedRow && String(selectedRow.object_type || '').trim() === 'place' && Number(selectedRow.locality_id)) {
    localityIds = [Number(selectedRow.locality_id)];
    scopeLabelName = String(selectedRow.locality_name || baseLocality.name || '').trim();
  } else if (
    selectedRow
    && ['street', 'address'].includes(String(selectedRow.object_type || '').trim())
    && Number(selectedRow.locality_id)
  ) {
    const selectedStreetName = String(selectedRow.street_name || selectedRow.label || '').trim();
    const scopeLocalities = await getLocalitySearchScope(baseLocality);
    localityIds = scopeLocalities.map((item) => Number(item && item.id)).filter(Boolean);
    scopeLabelName = String(baseLocality.name || '').trim() || String(selectedRow.locality_name || '').trim();
    prefixSql = `
      (
        (idx.object_type='street' AND idx.street_name=?)
        OR
        (idx.object_type='address' AND idx.street_name=?)
      )
      AND
    `;
    prefixParams = [
      selectedStreetName,
      selectedStreetName,
    ];
  } else {
    const scopeLocalities = await getLocalitySearchScope(baseLocality);
    localityIds = scopeLocalities.map((item) => Number(item && item.id)).filter(Boolean);
  }

  if (!localityIds.length) {
    localityIds = [Number(baseLocality.id)];
  }

  const searchSqlParts = [
    'idx.normalized_label LIKE CONCAT(?, \'%\')',
    'OR idx.normalized_label_alt LIKE CONCAT(?, \'%\')',
    'OR idx.normalized_compact LIKE CONCAT(?, \'%\')',
    'OR idx.normalized_compact_alt LIKE CONCAT(?, \'%\')',
    'OR idx.search_blob LIKE CONCAT(\'%\', ?, \'%\')',
  ];
  const searchParams = [
    escapeLike(normalizedQuery),
    escapeLike(normalizedQuery),
    escapeLike(compactQuery),
    escapeLike(compactQuery),
    escapeLike(normalizedQuery),
  ];

  queryTokens.forEach((token) => {
    searchSqlParts.push('OR idx.search_blob LIKE CONCAT(\'%\', ?, \'%\')');
    searchParams.push(escapeLike(token));
  });

  const [rows] = await db.query(
    `SELECT idx.id,
            idx.locality_id,
            idx.source,
            idx.source_key,
            idx.object_type,
            idx.label,
            idx.full_address,
            idx.street_name,
            idx.house_number,
            idx.lat,
            idx.lng,
            idx.normalized_label,
            idx.normalized_label_alt,
            idx.normalized_compact,
            idx.normalized_compact_alt,
            idx.search_blob,
            loc.source_key AS locality_source_key,
            loc.name AS locality_name,
            loc.normalized_name AS locality_normalized_name
       FROM sys_address_index idx
       JOIN sys_address_localities loc ON loc.id=idx.locality_id
      WHERE idx.locality_id IN (${localityIds.map(() => '?').join(', ')})
        AND (
          idx.object_type <> 'street'
          OR EXISTS (
            SELECT 1
              FROM sys_address_index rel
             WHERE rel.locality_id=idx.locality_id
               AND rel.object_type IN ('address', 'place')
               AND NULLIF(TRIM(rel.street_name), '') IS NOT NULL
               AND LOWER(TRIM(rel.street_name)) = LOWER(TRIM(idx.street_name))
             LIMIT 1
          )
        )
        AND ${prefixSql}(
          ${searchSqlParts.join(' ')}
        )
      ORDER BY CHAR_LENGTH(idx.label) ASC, idx.label ASC
      LIMIT ?`,
    [...localityIds, ...prefixParams, ...searchParams, ADDRESS_SEARCH_LIMIT]
  );

  return {
    rows: Array.isArray(rows) ? rows : [],
    scopeLabelName,
  };
}

async function searchLocalAddressRows(localityId, query) {
  const normalizedQuery = normalizeLocalAddressText(query);
  const compactQuery = compactLocalAddressText(query);
  const queryTokens = uniqueStrings(
    splitSearchTokens(query).filter((token) => token.length >= 3 && !/^\d+$/.test(token))
  );
  if (!normalizedQuery) return [];

  const sqlParts = [
    'locality_id=?',
    'AND (',
    'normalized_label LIKE CONCAT(?, \'%\')',
    'OR normalized_label_alt LIKE CONCAT(?, \'%\')',
    'OR normalized_compact LIKE CONCAT(?, \'%\')',
    'OR normalized_compact_alt LIKE CONCAT(?, \'%\')',
    'OR search_blob LIKE CONCAT(\'%\', ?, \'%\')',
  ];
  const params = [
    Number(localityId),
    escapeLike(normalizedQuery),
    escapeLike(normalizedQuery),
    escapeLike(compactQuery),
    escapeLike(compactQuery),
    escapeLike(normalizedQuery),
  ];

  queryTokens.forEach((token) => {
    sqlParts.push('OR search_blob LIKE CONCAT(\'%\', ?, \'%\')');
    params.push(escapeLike(token));
  });

  sqlParts.push(')');

  const [rows] = await db.query(
    `SELECT idx.id, idx.object_type, idx.label, idx.full_address, idx.street_name, idx.house_number, idx.lat, idx.lng, idx.normalized_label, idx.normalized_label_alt, idx.normalized_compact, idx.normalized_compact_alt, idx.search_blob
       FROM sys_address_index idx
      WHERE ${sqlParts.join(' ')}
        AND (
          idx.object_type <> 'street'
          OR EXISTS (
            SELECT 1
              FROM sys_address_index rel
             WHERE rel.locality_id=idx.locality_id
               AND rel.object_type IN ('address', 'place')
               AND NULLIF(TRIM(rel.street_name), '') IS NOT NULL
               AND LOWER(TRIM(rel.street_name)) = LOWER(TRIM(idx.street_name))
             LIMIT 1
          )
        )
      ORDER BY CHAR_LENGTH(label) ASC, label ASC
      LIMIT ?`,
    [...params, ADDRESS_SEARCH_LIMIT]
  );
  return Array.isArray(rows) ? rows : [];
}

function buildLocalAddressItems(rows, localityName) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const rawType = String(row && row.object_type || 'address').trim();
    const hasHouseNumber = String(row && row.house_number || '').trim();
    const objectType = rawType === 'street'
      ? 'street'
      : (rawType === 'place' && !hasHouseNumber ? 'context-locality' : 'address');
    return {
      label: String(row && row.label || '').trim(),
      value: String(row && row.label || '').trim(),
      object_type: objectType,
      stage: 'address',
      source_key: String(row && row.source_key || '').trim(),
      locality_source_key: String(row && row.locality_source_key || '').trim(),
      city_name: String(row && row.locality_name || localityName || '').trim(),
      context_locality: String(row && row.locality_name || localityName || '').trim(),
      normalized_city: String(row && row.locality_normalized_name || normalizeLocalAddressText(localityName)).trim(),
      normalized_address: normalizeLocalAddressText(row && row.label),
      street_name: String(row && row.street_name || '').trim(),
      house_number: String(row && row.house_number || '').trim(),
      full_address: String(row && row.full_address || '').trim(),
      lat: row && row.lat !== null && row.lat !== undefined ? Number(row.lat) : null,
      lng: row && row.lng !== null && row.lng !== undefined ? Number(row.lng) : null,
    };
  }).filter((item) => item.label);
}

function formatLocalAddressDisplay(baseCityName, contextLocality, addressLabel) {
  const baseCity = String(baseCityName || '').trim();
  const context = String(contextLocality || '').trim();
  const address = String(addressLabel || '').trim();
  if (!address) return '';
  if (!context) return address;
  if (normalizeLocalAddressText(context) === normalizeLocalAddressText(baseCity)) return address;
  if (normalizeLocalAddressText(address).startsWith(normalizeLocalAddressText(context))) return address;
  return `${context}, ${address}`;
}

function scoreLocalAddressItem(query, item) {
  const candidates = uniqueStrings([
    item && item.label,
    item && item.full_address,
    [item && item.street_name, item && item.house_number].filter(Boolean).join(' '),
    [item && item.house_number, item && item.street_name].filter(Boolean).join(' '),
  ]);
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = scoreLocalAddressCandidate(query, candidate);
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

function sortLocalAddressItemsByType(items, query, limit = LOCAL_RESULT_LIMIT) {
  const prefersAddress = isHouseLikeLocalAddressQuery(query);
  const list = (Array.isArray(items) ? items : []).map((item, index) => ({ item, index }));
  list.sort((leftEntry, rightEntry) => {
    const left = leftEntry.item;
    const right = rightEntry.item;
    const leftType = String(left && left.object_type || 'address').trim();
    const rightType = String(right && right.object_type || 'address').trim();
    const leftRank = prefersAddress
      ? (leftType === 'street' ? 1 : 0)
      : (leftType === 'street' ? 0 : 1);
    const rightRank = prefersAddress
      ? (rightType === 'street' ? 1 : 0)
      : (rightType === 'street' ? 0 : 1);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return leftEntry.index - rightEntry.index;
  });
  return list
    .slice(0, Math.max(1, Number(limit) || LOCAL_RESULT_LIMIT))
    .map((entry) => entry.item);
}

function doesLocalAddressItemMatchHousePart(item, housePart) {
  const normalizedHousePart = normalizeLocalHouseNumber(housePart);
  if (!normalizedHousePart) return true;
  const candidateHouse = normalizeLocalHouseNumber(item && item.house_number);
  if (!candidateHouse) return false;
  return candidateHouse === normalizedHousePart || candidateHouse.startsWith(normalizedHousePart);
}

async function searchLocalAddressSuggest(stage, query, options = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedQuery = String(query || '').trim();
  if (!normalizedStage) {
    return { ok: false, error: 'STAGE_REQUIRED' };
  }
  if (!normalizedQuery) {
    return { ok: false, error: 'QUERY_REQUIRED' };
  }

  try {
    if (normalizedStage === 'city') {
      return searchLocalCitySuggest(normalizedQuery, options);
    }

    if (!['address', 'street', 'house'].includes(normalizedStage)) {
      return { ok: false, error: 'UNSUPPORTED_STAGE' };
    }

    const city = String(options.city || '').trim();
    const citySourceKey = String(options.citySourceKey || '').trim();
    const selectedSourceKey = String(options.selectedSourceKey || '').trim();
    if (!city) {
      if (normalizedStage === 'address') {
        return buildLocalSearchResponse(normalizedQuery, []);
      }
      return { ok: false, error: 'CITY_REQUIRED' };
    }

    const locality = await resolveLocalityByInput(city, { sourceKey: citySourceKey, rootOnly: true });
    if (!locality) {
      return buildLocalSearchResponse(normalizedQuery, []);
    }
    if (normalizedStage === 'house' && !selectedSourceKey) {
      return buildLocalSearchResponse(normalizedQuery, []);
    }

    const selectedRow = selectedSourceKey
      ? await getLocalAddressIndexRowBySourceKey(selectedSourceKey)
      : null;
    const scopedRows = await searchLocalAddressRowsInScope(locality, normalizedQuery, { selectedRow });
    const prefersAddress = normalizedStage === 'house' || (normalizedStage === 'address' && isHouseLikeLocalAddressQuery(normalizedQuery));
    const normalizedHousePart = normalizeLocalHouseNumber(
      normalizedStage === 'house'
        ? normalizedQuery
        : extractHousePartFromAddressQuery(normalizedQuery)
    );
    const baseNormalizedCity = String(locality && locality.normalized_name || '').trim();
    const rankedItems = buildLocalAddressItems(scopedRows.rows, locality.name)
      .filter((item) => {
        const itemType = String(item && item.object_type || 'address').trim();
        if (normalizedStage === 'street') {
          return itemType === 'street';
        }
        if (normalizedStage === 'house') {
          if (itemType !== 'address') return false;
          return doesLocalAddressItemMatchHousePart(item, normalizedHousePart);
        }
        if (!prefersAddress) return true;
        if (itemType !== 'address') return true;
        return doesLocalAddressItemMatchHousePart(item, normalizedHousePart);
      })
      .map((item) => ({ item, score: scoreLocalAddressItem(normalizedQuery, item) }))
      .filter((entry) => entry.score >= 0)
      .sort((leftEntry, rightEntry) => {
        const leftType = String(leftEntry.item && leftEntry.item.object_type || 'address').trim();
        const rightType = String(rightEntry.item && rightEntry.item.object_type || 'address').trim();
        const leftRank = prefersAddress
          ? (leftType === 'address' ? 0 : (leftType === 'street' ? 1 : 2))
          : (leftType === 'street' ? 0 : (leftType === 'context-locality' ? 1 : 2));
        const rightRank = prefersAddress
          ? (rightType === 'address' ? 0 : (rightType === 'street' ? 1 : 2))
          : (rightType === 'street' ? 0 : (rightType === 'context-locality' ? 1 : 2));
        if (leftRank !== rightRank) return leftRank - rightRank;
        const leftCityRank = String(leftEntry.item && leftEntry.item.normalized_city || '').trim() === baseNormalizedCity ? 0 : 1;
        const rightCityRank = String(rightEntry.item && rightEntry.item.normalized_city || '').trim() === baseNormalizedCity ? 0 : 1;
        if (leftCityRank !== rightCityRank) return leftCityRank - rightCityRank;
        if (rightEntry.score !== leftEntry.score) return rightEntry.score - leftEntry.score;
        const leftLabel = String(leftEntry.item && (leftEntry.item.label || leftEntry.item.value || leftEntry.item.full_address) || '');
        const rightLabel = String(rightEntry.item && (rightEntry.item.label || rightEntry.item.value || rightEntry.item.full_address) || '');
        return leftLabel.localeCompare(rightLabel, 'ru');
      });

    const limitedItems = rankedItems.map((entry) => entry.item)
      .filter((item, index, list) => list.findIndex((candidate) => {
        const leftType = String(candidate && candidate.object_type || '').trim();
        const rightType = String(item && item.object_type || '').trim();
        const leftKey = leftType === 'context-locality'
          ? `${leftType}::${normalizeLocalAddressText(candidate && (candidate.context_locality || candidate.city_name || candidate.value))}`
          : (
            leftType === 'street'
              ? `${leftType}::${normalizeLocalAddressText(candidate && candidate.context_locality)}::${normalizeLocalAddressText(candidate && (candidate.street_name || candidate.value))}`
              : (String(candidate && candidate.source_key || '').trim() || `${leftType}::${normalizeLocalAddressText(candidate && candidate.value)}::${normalizeLocalAddressText(candidate && candidate.context_locality)}`)
          );
        const rightKey = rightType === 'context-locality'
          ? `${rightType}::${normalizeLocalAddressText(item && (item.context_locality || item.city_name || item.value))}`
          : (
            rightType === 'street'
              ? `${rightType}::${normalizeLocalAddressText(item && item.context_locality)}::${normalizeLocalAddressText(item && (item.street_name || item.value))}`
              : (String(item && item.source_key || '').trim() || `${rightType}::${normalizeLocalAddressText(item && item.value)}::${normalizeLocalAddressText(item && item.context_locality)}`)
          );
        return leftKey === rightKey;
      }) === index)
      .slice(0, Math.max(1, Number(options.limit) || LOCAL_RESULT_LIMIT));

    return buildLocalSearchResponse(normalizedQuery, limitedItems, `${LOCAL_SCOPE_LABEL}: ${scopedRows.scopeLabelName || locality.name}`);
  } catch (error) {
    if (error && error.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, error: 'LOCAL_ADDRESS_INDEX_NOT_READY' };
    }
    console.error('Local address index search error:', error && error.message ? error.message : error);
    return { ok: false, error: 'LOCAL_ADDRESS_INDEX_FAILED' };
  }
}

module.exports = {
  LOCAL_SCOPE_LABEL,
  normalizeLocalAddressText,
  compactLocalAddressText,
  buildLocalityRecord,
  buildAddressIndexRecord,
  upsertLocality,
  replaceLocalityEntries,
  clearTenantLocalityCache,
  resolveLocalityByInput,
  getLocalAddressIndexRowBySourceKey,
  searchLocalAddressSuggest,
  isHouseLikeLocalAddressQuery,
};
