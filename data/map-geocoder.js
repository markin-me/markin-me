const { getEffectiveMapProviderConfig } = require('./system-settings');

const GEOCODER_CACHE_TTL_MS = 5 * 60 * 1000;
const GEOCODER_STALE_TTL_MS = 30 * 60 * 1000;
const GEOCODER_MIN_INTERVAL_MS = 1100;
const geocoderResponseCache = new Map();
const geocoderInFlightRequests = new Map();
let geocoderLastRequestAt = 0;
let geocoderRequestQueue = Promise.resolve();

function buildMapGeocoderScopeLabel(scope, countryCode) {
  if (scope === 'country') {
    return String(countryCode || '').toLowerCase() === 'ru' ? 'Россия' : String(countryCode || '').toUpperCase();
  }
  return 'Весь мир';
}

function delay(ms) {
  const timeout = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function buildGeocoderRequestCacheKey(baseUrl, options = {}) {
  const {
    query = '',
    limit = 5,
    language = 'ru',
    countryCode = '',
    mode = 'city',
  } = options || {};
  return JSON.stringify({
    baseUrl: String(baseUrl || '').trim(),
    query: String(query || '').trim(),
    limit: Number(limit) || 0,
    language: String(language || '').trim(),
    countryCode: String(countryCode || '').trim(),
    mode: String(mode || '').trim(),
  });
}

function getGeocoderCachedResponse(cacheKey, options = {}) {
  const maxAge = options && options.allowStale ? GEOCODER_STALE_TTL_MS : GEOCODER_CACHE_TTL_MS;
  const cached = geocoderResponseCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - Number(cached.savedAt || 0) > maxAge) {
    if (!options || !options.allowStale) {
      geocoderResponseCache.delete(cacheKey);
    }
    return options && options.allowStale ? cached.value : null;
  }
  return cached.value;
}

function setGeocoderCachedResponse(cacheKey, value) {
  geocoderResponseCache.set(cacheKey, {
    savedAt: Date.now(),
    value,
  });
}

async function runGeocoderRequestWithThrottle(task) {
  const previous = geocoderRequestQueue;
  let releaseQueue = null;
  geocoderRequestQueue = new Promise((resolve) => {
    releaseQueue = resolve;
  });
  await previous;
  try {
    const waitMs = Math.max(0, GEOCODER_MIN_INTERVAL_MS - (Date.now() - geocoderLastRequestAt));
    if (waitMs > 0) {
      await delay(waitMs);
    }
    geocoderLastRequestAt = Date.now();
    return await task();
  } finally {
    if (releaseQueue) releaseQueue();
  }
}

function isCityLikeGeocoderResult(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const category = String(raw.category || raw.class || '').trim().toLowerCase();
  const type = String(raw.type || '').trim().toLowerCase();
  const addressType = String(raw.addresstype || '').trim().toLowerCase();
  const blockedTypes = new Set(['suburb', 'quarter', 'neighbourhood', 'district', 'borough', 'city_block']);
  if (blockedTypes.has(type) || blockedTypes.has(addressType)) return false;
  if (category === 'place') return true;
  const allowedTypes = new Set(['city', 'town', 'village', 'hamlet', 'municipality', 'locality']);
  return allowedTypes.has(type) || allowedTypes.has(addressType);
}

function isAddressLikeGeocoderResult(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  if (isCityLikeGeocoderResult(raw)) return false;
  const label = String(raw.display_name || raw.name || '').trim();
  if (!label) return false;
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const category = String(raw.category || raw.class || '').trim().toLowerCase();
  const type = String(raw.type || raw.addresstype || '').trim().toLowerCase();
  const blockedTypes = new Set(['administrative', 'state', 'province', 'county', 'region', 'country']);
  if (blockedTypes.has(type)) return false;
  if (category === 'boundary' || category === 'place') return false;
  const addressHints = [
    'road',
    'pedestrian',
    'footway',
    'path',
    'house_number',
    'neighbourhood',
    'suburb',
    'quarter',
    'borough',
    'building',
    'amenity',
    'shop',
    'office',
    'tourism',
    'highway',
  ];
  if (addressHints.some((key) => String(address[key] || '').trim())) return true;
  const addressTypes = new Set([
    'house',
    'building',
    'road',
    'street',
    'pedestrian',
    'footway',
    'path',
    'amenity',
    'shop',
    'office',
    'tourism',
    'attraction',
    'residential',
  ]);
  if (addressTypes.has(type)) return true;
  return Boolean(extractMapGeocoderCityName(raw));
}

function normalizeGeocoderBoundingBox(value) {
  if (!Array.isArray(value) || value.length < 4) return null;
  const south = Number(value[0]);
  const north = Number(value[1]);
  const west = Number(value[2]);
  const east = Number(value[3]);
  if (![south, north, west, east].every(Number.isFinite)) return null;
  return [south, north, west, east];
}

function extractMapGeocoderCityName(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const candidates = [
    address.city,
    address.town,
    address.village,
    address.municipality,
    address.locality,
    address.hamlet,
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function normalizeAddressSuggestKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\u0451/g, '\u0435')
    .replace(/[.,;:()[\]{}"'`~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddressSuggestCityKey(value) {
  return normalizeAddressSuggestKey(value)
    .replace(/\b(?:г|город)\.?\s+/g, '')
    .trim();
}

function normalizeAddressSuggestStreetKey(value) {
  return normalizeAddressSuggestKey(value)
    .replace(/\b(?:улица|ул|проспект|пр-кт|просп|переулок|пер|бульвар|бул|площадь|пл|шоссе|ш|проезд|пр-д|набережная|наб|тракт|тупик|туп|аллея|линия|микрорайон|мкр)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAddressSuggestHouseKey(value) {
  return normalizeAddressSuggestKey(value)
    .replace(/\s+/g, '')
    .trim();
}

function isLooseAddressSuggestMatch(candidate, expected, normalizer = normalizeAddressSuggestKey) {
  const candidateKey = normalizer(candidate);
  const expectedKey = normalizer(expected);
  if (!candidateKey || !expectedKey) return false;
  return candidateKey === expectedKey || candidateKey.includes(expectedKey) || expectedKey.includes(candidateKey);
}

function dedupeGeocoderEntries(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const placeId = Number(entry.place_id);
    const key = Number.isFinite(placeId) && placeId > 0
      ? `place:${placeId}`
      : [
        String(entry.display_name || entry.name || '').trim().toLowerCase(),
        String(entry.lat || '').trim(),
        String(entry.lon || '').trim(),
      ].join('::');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function computeAddressSuggestLevenshtein(leftValue, rightValue) {
  const left = String(leftValue || '');
  const right = String(rightValue || '');
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) matrix[row][0] = row;
  for (let col = 0; col < cols; col += 1) matrix[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
    }
  }
  return matrix[left.length][right.length];
}

function getAddressSuggestMatchScore(query, candidate, normalizer = normalizeAddressSuggestKey) {
  const queryKey = normalizer(query);
  const candidateKey = normalizer(candidate);
  if (!queryKey || !candidateKey) return Number.POSITIVE_INFINITY;
  if (candidateKey === queryKey) return 0;
  if (candidateKey.startsWith(queryKey)) return 10 + (candidateKey.length - queryKey.length) / 100;
  const wordParts = candidateKey.split(' ').filter(Boolean);
  const wordPrefixIndex = wordParts.findIndex((part) => part.startsWith(queryKey));
  if (wordPrefixIndex >= 0) return 20 + wordPrefixIndex;
  const containsIndex = candidateKey.indexOf(queryKey);
  if (containsIndex >= 0) return 30 + containsIndex / 10;
  const compactQuery = queryKey.replace(/\s+/g, '');
  const compactCandidate = candidateKey.replace(/\s+/g, '');
  const threshold = compactQuery.length >= 10 ? 4 : compactQuery.length >= 7 ? 3 : 2;
  const sample = compactCandidate.slice(0, Math.min(compactCandidate.length, compactQuery.length + 4));
  const sampleDistance = computeAddressSuggestLevenshtein(compactQuery, sample);
  if (sampleDistance <= threshold) return 50 + sampleDistance;
  let bestWordDistance = Number.POSITIVE_INFINITY;
  wordParts.forEach((part) => {
    const nextSample = part.slice(0, Math.min(part.length, compactQuery.length + 4));
    bestWordDistance = Math.min(bestWordDistance, computeAddressSuggestLevenshtein(compactQuery, nextSample));
  });
  if (bestWordDistance <= threshold) return 70 + bestWordDistance;
  return Number.POSITIVE_INFINITY;
}

function rankAddressSuggestItems(items, query, options = {}) {
  const list = Array.isArray(items) ? items : [];
  const getCandidate = typeof options.getCandidate === 'function'
    ? options.getCandidate
    : ((item) => String(item && (item.value || item.label) || '').trim());
  const normalizer = typeof options.normalizer === 'function'
    ? options.normalizer
    : normalizeAddressSuggestKey;
  const getKey = typeof options.getKey === 'function'
    ? options.getKey
    : ((item) => String(item && (item.value || item.label) || '').trim().toLowerCase());
  const limit = Math.max(1, Number(options.limit) || list.length || 1);
  const ranked = new Map();
  list.forEach((item, index) => {
    const key = String(getKey(item) || '').trim().toLowerCase();
    if (!key) return;
    const score = getAddressSuggestMatchScore(query, getCandidate(item), normalizer);
    if (!Number.isFinite(score)) return;
    const current = ranked.get(key);
    if (!current || score < current.score || (score === current.score && index < current.index)) {
      ranked.set(key, { item, score, index });
    }
  });
  return Array.from(ranked.values())
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

function firstNonEmptyString(candidates) {
  for (const candidate of candidates || []) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function extractMapGeocoderStreetName(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const street = firstNonEmptyString([
    address.road,
    address.pedestrian,
    address.footway,
    address.path,
    address.cycleway,
    address.residential,
    address.street,
    address.avenue,
    address.boulevard,
    address.highway,
  ]);
  if (street) return street;
  const fallback = String(raw.name || '').trim();
  if (fallback && !/\d/.test(fallback)) return fallback;
  return '';
}

function extractMapGeocoderHouseNumber(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const address = raw.address && typeof raw.address === 'object' ? raw.address : {};
  const direct = firstNonEmptyString([
    address.house_number,
    address.house,
    address.building,
  ]);
  if (direct) return direct;

  const firstPart = String(raw.display_name || raw.name || '').split(',')[0].trim();
  if (!firstPart) return '';
  const match = firstPart.match(/(\d+[0-9a-zа-я\/-]*(?:\s*(?:к|корп|корпус|стр|строение|лит|литера)\.?\s*[0-9a-zа-я\/-]+)*)$/i);
  return match ? String(match[1] || '').trim() : '';
}

function dedupeAddressSuggestItems(items, getKey) {
  const list = Array.isArray(items) ? items : [];
  const keyFn = typeof getKey === 'function' ? getKey : ((item) => String(item && item.value || '').trim().toLowerCase());
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = String(keyFn(item) || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildAddressSuggestFullAddress(cityName, streetName, houseNumber) {
  return [cityName, streetName, houseNumber]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(', ');
}

function buildAddressSuggestShortLabel(entry) {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const displayParts = String(raw.display_name || '')
    .split(',')
    .map((part) => String(part || '').trim())
    .filter(Boolean);
  if (!displayParts.length) {
    return String(raw.name || '').trim();
  }

  const cityName = extractMapGeocoderCityName(raw);
  const cityKey = normalizeAddressSuggestCityKey(cityName);
  const nonCityParts = displayParts.filter((part) => {
    if (!cityKey) return true;
    return normalizeAddressSuggestCityKey(part) !== cityKey;
  });
  const sourceParts = nonCityParts.length ? nonCityParts : displayParts;

  const collected = [];
  for (const part of sourceParts) {
    const normalizedPart = normalizeAddressSuggestKey(part);
    if (!normalizedPart) continue;
    collected.push(part);
    if (collected.length >= 2) break;
  }

  if (collected.length) {
    return collected.join(', ');
  }

  return firstNonEmptyString([
    displayParts.slice(0, 2).join(', '),
    raw.name,
  ]);
}

function normalizeMapGeocoderResult(entry, scope, resultType = 'city') {
  const raw = entry && typeof entry === 'object' ? entry : {};
  const lat = Number(raw.lat);
  const lng = Number(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const cityName = extractMapGeocoderCityName(raw);
  return {
    label: String(raw.display_name || raw.name || '').trim(),
    city_name: cityName || (resultType === 'address'
      ? ''
      : String(raw.name || raw.display_name || '').trim().split(',')[0].trim()),
    lat,
    lng,
    bounding_box: normalizeGeocoderBoundingBox(raw.boundingbox),
    scope,
    result_type: resultType === 'address' ? 'address' : 'city',
  };
}

function getSystemMapGeocoderConfig(sourceState) {
  const config = getEffectiveMapProviderConfig(sourceState);
  return {
    geocoder_search_url: String(config.geocoder_search_url || '').trim(),
    geocoder_country_code: String(config.geocoder_country_code || 'ru').trim() || 'ru',
    geocoder_language: String(config.geocoder_language || 'ru').trim() || 'ru',
    geocoder_result_limit: Number(config.geocoder_result_limit || 5) || 5,
  };
}

async function fetchMapGeocoderResults(baseUrl, options = {}) {
  const {
    query = '',
    limit = 5,
    language = 'ru',
    countryCode = '',
    mode = 'city',
  } = options || {};
  const cacheKey = buildGeocoderRequestCacheKey(baseUrl, options);
  const cached = getGeocoderCachedResponse(cacheKey);
  if (cached) {
    return cached;
  }
  if (geocoderInFlightRequests.has(cacheKey)) {
    return geocoderInFlightRequests.get(cacheKey);
  }
  const url = new URL(String(baseUrl || '').trim());
  url.searchParams.set('q', String(query || '').trim());
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(limit));
  if (mode === 'city') {
    url.searchParams.set('featureType', 'settlement');
  }
  url.searchParams.set('accept-language', String(language || 'ru').trim() || 'ru');
  if (countryCode) {
    url.searchParams.set('countrycodes', String(countryCode || '').trim());
  }

  const requestPromise = runGeocoderRequestWithThrottle(async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Language': String(language || 'ru').trim() || 'ru',
          'User-Agent': 'markin-me-map-geocoder/1.0',
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        if (response.status === 429) {
          const stale = getGeocoderCachedResponse(cacheKey, { allowStale: true });
          if (stale) return stale;
        }
        return { ok: false, error: `UPSTREAM_${response.status}` };
      }
      const payload = await response.json();
      const list = Array.isArray(payload) ? payload : [];
      const filterFn = mode === 'address' ? isAddressLikeGeocoderResult : isCityLikeGeocoderResult;
      const resultType = mode === 'address' ? 'address' : 'city';
      const filtered = list.filter(filterFn);
      const result = {
        ok: true,
        items: filtered
          .map((entry) => normalizeMapGeocoderResult(entry, countryCode ? 'country' : 'global', resultType))
          .filter(Boolean),
        entries: filtered,
      };
      setGeocoderCachedResponse(cacheKey, result);
      return result;
    } catch (err) {
      const stale = getGeocoderCachedResponse(cacheKey, { allowStale: true });
      if (stale) return stale;
      const message = err && err.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : (err && err.message) || 'UPSTREAM_ERROR';
      return { ok: false, error: message };
    } finally {
      clearTimeout(timeoutId);
    }
  });

  geocoderInFlightRequests.set(cacheKey, requestPromise);
  try {
    return await requestPromise;
  } finally {
    geocoderInFlightRequests.delete(cacheKey);
  }
}

function normalizeGeocoderFailure(errorCode) {
  if (String(errorCode || '').trim() === 'UPSTREAM_429') {
    return 'GEOCODER_RATE_LIMITED';
  }
  if (String(errorCode || '').startsWith('UPSTREAM')) {
    return 'GEOCODER_UPSTREAM_ERROR';
  }
  return String(errorCode || '').trim() || 'GEOCODER_UPSTREAM_ERROR';
}

async function searchSystemMapGeocoder(query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return { ok: false, error: 'QUERY_REQUIRED' };
  }
  const config = getSystemMapGeocoderConfig(options.sourceState);
  if (!config.geocoder_search_url) {
    return { ok: false, error: 'GEOCODER_NOT_CONFIGURED' };
  }

  const searchOrder = [
    { scope: 'country', countryCode: config.geocoder_country_code, mode: 'city' },
    { scope: 'global', countryCode: '', mode: 'city' },
    { scope: 'country', countryCode: config.geocoder_country_code, mode: 'address' },
    { scope: 'global', countryCode: '', mode: 'address' },
  ];

  for (const step of searchOrder) {
    const search = await fetchMapGeocoderResults(config.geocoder_search_url, {
      query: normalizedQuery,
      limit: config.geocoder_result_limit,
      language: config.geocoder_language,
      countryCode: step.countryCode,
      mode: step.mode,
    });
    if (!search.ok) {
      return { ok: false, error: normalizeGeocoderFailure(search.error) };
    }
    if (search.items.length) {
      return {
        ok: true,
        data: {
          query: normalizedQuery,
          scope: step.scope,
          scope_label: buildMapGeocoderScopeLabel(step.scope, config.geocoder_country_code),
          items: search.items,
        },
      };
    }
  }

  return {
    ok: true,
    data: {
      query: normalizedQuery,
      scope: 'global',
      scope_label: buildMapGeocoderScopeLabel('global', config.geocoder_country_code),
      items: [],
    },
  };
}

async function geocodeStoreAddress(address, options = {}) {
  const normalizedAddress = String(address || '').trim();
  if (!normalizedAddress) {
    return { ok: false, error: 'ADDRESS_REQUIRED' };
  }
  const config = getSystemMapGeocoderConfig(options.sourceState);
  if (!config.geocoder_search_url) {
    return { ok: false, error: 'GEOCODER_NOT_CONFIGURED' };
  }

  const searchOrder = [
    { scope: 'country', countryCode: config.geocoder_country_code },
    { scope: 'global', countryCode: '' },
  ];

  for (const step of searchOrder) {
    const search = await fetchMapGeocoderResults(config.geocoder_search_url, {
      query: normalizedAddress,
      limit: config.geocoder_result_limit,
      language: config.geocoder_language,
      countryCode: step.countryCode,
      mode: 'address',
    });
    if (!search.ok) {
      return { ok: false, error: normalizeGeocoderFailure(search.error) };
    }
    if (search.items.length) {
      const item = search.items[0];
      if (!String(item.city_name || '').trim()) {
        return { ok: false, error: 'ADDRESS_CITY_NOT_FOUND' };
      }
      if (!Number.isFinite(Number(item.lat)) || !Number.isFinite(Number(item.lng))) {
        return { ok: false, error: 'ADDRESS_COORDINATES_NOT_FOUND' };
      }
      return {
        ok: true,
        data: {
          query: normalizedAddress,
          scope: step.scope,
          scope_label: buildMapGeocoderScopeLabel(step.scope, config.geocoder_country_code),
          item,
        },
      };
    }
  }

  return { ok: false, error: 'ADDRESS_NOT_FOUND' };
}

function buildAddressSuggestScopePayload(scope, countryCode) {
  return {
    scope,
    scope_label: buildMapGeocoderScopeLabel(scope, countryCode),
  };
}

function getAddressSuggestSearchOrder(config, mode = 'address') {
  return [
    { scope: 'country', countryCode: config.geocoder_country_code, mode },
    { scope: 'global', countryCode: '', mode },
  ];
}

function getAddressSuggestLimit(configLimit, stage) {
  const base = Number(configLimit) || 5;
  if (stage === 'house') return Math.max(base, 12);
  if (stage === 'street') return Math.max(base, 14);
  return Math.max(base, 12);
}

function buildCitySuggestItems(items, query, limit) {
  const normalized = Array.isArray(items)
    ? items.map((item) => {
      const cityName = String(item && (item.city_name || item.label) || '').trim();
      if (!cityName) return null;
      return {
        label: cityName,
        value: cityName,
        stage: 'city',
        city_name: cityName,
        street_name: '',
        house_number: '',
        full_address: cityName,
      };
    }).filter(Boolean)
    : [];
  return rankAddressSuggestItems(normalized, query, {
    normalizer: normalizeAddressSuggestCityKey,
    getCandidate: (item) => String(item && (item.city_name || item.value || item.label) || '').trim(),
    getKey: (item) => normalizeAddressSuggestCityKey(item && (item.city_name || item.value || item.label)),
    limit,
  });
}

function buildStreetSuggestItems(entries, cityName, query, limit) {
  const expectedCity = String(cityName || '').trim();
  const items = (Array.isArray(entries) ? entries : []).map((entry) => {
    const resolvedCity = extractMapGeocoderCityName(entry);
    const streetName = extractMapGeocoderStreetName(entry);
    if (!resolvedCity || !streetName) return null;
    if (!isLooseAddressSuggestMatch(resolvedCity, expectedCity, normalizeAddressSuggestCityKey)) return null;
    return {
      label: streetName,
      value: streetName,
      stage: 'street',
      city_name: resolvedCity,
      street_name: streetName,
      house_number: '',
      full_address: buildAddressSuggestFullAddress(resolvedCity, streetName, ''),
    };
  }).filter(Boolean);
  return rankAddressSuggestItems(items, query, {
    normalizer: normalizeAddressSuggestStreetKey,
    getCandidate: (item) => String(item && (item.street_name || item.value || item.label) || '').trim(),
    getKey: (item) => `${normalizeAddressSuggestCityKey(item && item.city_name)}::${normalizeAddressSuggestStreetKey(item && (item.street_name || item.value || item.label))}`,
    limit,
  });
}

function buildHouseSuggestItems(entries, cityName, streetName, query, limit) {
  const expectedCity = String(cityName || '').trim();
  const expectedStreet = String(streetName || '').trim();
  const items = (Array.isArray(entries) ? entries : []).map((entry) => {
    const resolvedCity = extractMapGeocoderCityName(entry);
    const resolvedStreet = extractMapGeocoderStreetName(entry);
    const houseNumber = extractMapGeocoderHouseNumber(entry);
    if (!resolvedCity || !resolvedStreet || !houseNumber) return null;
    if (!isLooseAddressSuggestMatch(resolvedCity, expectedCity, normalizeAddressSuggestCityKey)) return null;
    if (!isLooseAddressSuggestMatch(resolvedStreet, expectedStreet, normalizeAddressSuggestStreetKey)) return null;
    return {
      label: houseNumber,
      value: houseNumber,
      stage: 'house',
      city_name: resolvedCity,
      street_name: resolvedStreet,
      house_number: houseNumber,
      full_address: buildAddressSuggestFullAddress(resolvedCity, resolvedStreet, houseNumber),
    };
  }).filter(Boolean);
  return rankAddressSuggestItems(items, query, {
    normalizer: normalizeAddressSuggestHouseKey,
    getCandidate: (item) => String(item && (item.house_number || item.value || item.label) || '').trim(),
    getKey: (item) => `${normalizeAddressSuggestCityKey(item && item.city_name)}::${normalizeAddressSuggestStreetKey(item && item.street_name)}::${normalizeAddressSuggestHouseKey(item && (item.house_number || item.value || item.label))}`,
    limit,
  });
}

function buildAddressSuggestItems(entries, cityName, query, limit) {
  const expectedCity = String(cityName || '').trim();
  const items = (Array.isArray(entries) ? entries : []).map((entry) => {
    const resolvedCity = extractMapGeocoderCityName(entry);
    const addressLabel = buildAddressSuggestShortLabel(entry);
    if (!resolvedCity || !addressLabel) return null;
    if (!isLooseAddressSuggestMatch(resolvedCity, expectedCity, normalizeAddressSuggestCityKey)) return null;
    return {
      label: addressLabel,
      value: addressLabel,
      stage: 'address',
      city_name: resolvedCity,
      street_name: '',
      house_number: '',
      full_address: [resolvedCity, addressLabel].filter(Boolean).join(', '),
    };
  }).filter(Boolean);

  return rankAddressSuggestItems(items, query, {
    normalizer: normalizeAddressSuggestKey,
    getCandidate: (item) => String(item && (item.value || item.label || item.full_address) || '').trim(),
    getKey: (item) => `${normalizeAddressSuggestCityKey(item && item.city_name)}::${normalizeAddressSuggestKey(item && (item.value || item.label || item.full_address))}`,
    limit,
  });
}

function buildAddressSuggestQueryVariants(stage, query, options = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedQuery = String(query || '').trim();
  const city = String(options.city || '').trim();
  const street = String(options.street || '').trim();
  const hasStreetTypePrefix = /^(?:улица|ул\.?|проспект|пр-кт|просп\.?|переулок|пер\.?|бульвар|бул\.?|площадь|пл\.?|шоссе|ш\.?|проезд|пр-д|набережная|наб\.?|тракт|тупик|туп\.?|аллея|линия|микрорайон|мкр\.?)\b/i.test(normalizedQuery);
  const variants = [];
  const seen = new Set();
  const push = (value) => {
    const nextValue = String(value || '').trim();
    const key = nextValue.toLowerCase();
    if (!nextValue || seen.has(key)) return;
    seen.add(key);
    variants.push(nextValue);
  };

  if (normalizedStage === 'street') {
    push(`${normalizedQuery}, ${city}`);
    push(`${city}, ${normalizedQuery}`);
    if (!hasStreetTypePrefix) {
      push(`улица ${normalizedQuery}, ${city}`);
    }
    return variants;
  }

  if (normalizedStage === 'house') {
    push(`${street}, ${normalizedQuery}, ${city}`);
    push(`${city}, ${street}, ${normalizedQuery}`);
    push(`${street} ${normalizedQuery}, ${city}`);
    return variants;
  }

  if (normalizedStage === 'address') {
    push(`${normalizedQuery}, ${city}`);
    push(`${city}, ${normalizedQuery}`);

    const commaParts = normalizedQuery
      .split(',')
      .map((part) => String(part || '').trim())
      .filter(Boolean);
    if (commaParts.length >= 2) {
      const reversed = commaParts.slice(1).concat(commaParts[0]).join(', ');
      push(`${reversed}, ${city}`);
      push(`${city}, ${reversed}`);
    }

    const numberLeadingMatch = normalizedQuery.match(/^(\d+[0-9a-zа-я\/-]*)\s+(.+)$/i);
    if (numberLeadingMatch) {
      const houseNumber = String(numberLeadingMatch[1] || '').trim();
      const addressTail = String(numberLeadingMatch[2] || '').trim();
      if (houseNumber && addressTail) {
        push(`${addressTail}, ${houseNumber}, ${city}`);
        push(`${city}, ${addressTail}, ${houseNumber}`);
      }
    }

    push(normalizedQuery);
    return variants;
  }

  push(normalizedQuery);
  return variants;
}

async function searchSystemAddressSuggest(stage, query, options = {}) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  const normalizedQuery = String(query || '').trim();
  const city = String(options.city || '').trim();
  const street = String(options.street || '').trim();
  const validStages = new Set(['city', 'street', 'house', 'address']);

  if (!validStages.has(normalizedStage)) {
    return { ok: false, error: 'STAGE_REQUIRED' };
  }
  if (!normalizedQuery || normalizedQuery.length < (normalizedStage === 'house' ? 1 : 2)) {
    return { ok: false, error: 'QUERY_REQUIRED' };
  }
  if ((normalizedStage === 'street' || normalizedStage === 'house' || normalizedStage === 'address') && !city) {
    return { ok: false, error: 'CITY_REQUIRED' };
  }
  if (normalizedStage === 'house' && !street) {
    return { ok: false, error: 'STREET_REQUIRED' };
  }

  const config = getSystemMapGeocoderConfig(options.sourceState);
  if (!config.geocoder_search_url) {
    return { ok: false, error: 'GEOCODER_NOT_CONFIGURED' };
  }

  if (normalizedStage === 'city') {
    const limit = getAddressSuggestLimit(config.geocoder_result_limit, normalizedStage);
    for (const step of getAddressSuggestSearchOrder(config, 'city')) {
      const search = await fetchMapGeocoderResults(config.geocoder_search_url, {
        query: normalizedQuery,
        limit,
        language: config.geocoder_language,
        countryCode: step.countryCode,
        mode: step.mode,
      });
      if (!search.ok) {
        return { ok: false, error: normalizeGeocoderFailure(search.error) };
      }
      const items = buildCitySuggestItems(search.items, normalizedQuery, limit);
      if (items.length) {
        return {
          ok: true,
          data: {
            stage: normalizedStage,
            query: normalizedQuery,
            ...buildAddressSuggestScopePayload(step.scope, config.geocoder_country_code),
            items,
          },
        };
      }
    }
    return {
      ok: true,
      data: {
        stage: normalizedStage,
        query: normalizedQuery,
        ...buildAddressSuggestScopePayload('global', config.geocoder_country_code),
        items: [],
      },
    };
  }

  const limit = getAddressSuggestLimit(config.geocoder_result_limit, normalizedStage);
  const queryVariants = buildAddressSuggestQueryVariants(normalizedStage, normalizedQuery, { city, street });

  for (const step of getAddressSuggestSearchOrder(config, 'address')) {
    let collectedEntries = [];
    let items = [];
    for (let index = 0; index < queryVariants.length; index += 1) {
      const search = await fetchMapGeocoderResults(config.geocoder_search_url, {
        query: queryVariants[index],
        limit,
        language: config.geocoder_language,
        countryCode: step.countryCode,
        mode: 'address',
      });
      if (!search.ok) {
        return { ok: false, error: normalizeGeocoderFailure(search.error) };
      }
      collectedEntries = dedupeGeocoderEntries(collectedEntries.concat(search.entries || []));
      if (normalizedStage === 'street') {
        items = buildStreetSuggestItems(collectedEntries, city, normalizedQuery, limit);
      } else if (normalizedStage === 'house') {
        items = buildHouseSuggestItems(collectedEntries, city, street, normalizedQuery, limit);
      } else {
        items = buildAddressSuggestItems(collectedEntries, city, normalizedQuery, limit);
      }
      if (items.length) {
        return {
          ok: true,
          data: {
            stage: normalizedStage,
            query: normalizedQuery,
            city_name: city,
            street_name: normalizedStage === 'house' ? street : '',
            ...buildAddressSuggestScopePayload(step.scope, config.geocoder_country_code),
            items,
          },
        };
      }
    }
    if (items.length) {
      return {
        ok: true,
        data: {
          stage: normalizedStage,
          query: normalizedQuery,
          city_name: city,
          street_name: normalizedStage === 'house' ? street : '',
          ...buildAddressSuggestScopePayload(step.scope, config.geocoder_country_code),
          items,
        },
      };
    }
  }

  return {
    ok: true,
      data: {
        stage: normalizedStage,
        query: normalizedQuery,
        city_name: city,
        street_name: normalizedStage === 'house' ? street : '',
        ...buildAddressSuggestScopePayload('global', config.geocoder_country_code),
        items: [],
      },
  };
}

module.exports = {
  buildMapGeocoderScopeLabel,
  fetchMapGeocoderResults,
  getSystemMapGeocoderConfig,
  searchSystemMapGeocoder,
  geocodeStoreAddress,
  searchSystemAddressSuggest,
};
