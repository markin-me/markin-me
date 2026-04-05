const {
  normalizeText,
  compactText,
  normalizeHouseToken,
  extractHouseToken,
  removeHouseToken,
  stripStreetNoise,
  normalizeStreetSearchValue,
} = require('./normalization');
const config = require('./config');

const STORE_CITY_SELECTOR_ALLOWLIST = Object.freeze([
  'Новоалтайск',
  'Барнаул',
  'Новосибирск',
]);
const STORE_CITY_SELECTOR_ALLOWLIST_KEYS = STORE_CITY_SELECTOR_ALLOWLIST.map((name) => normalizeText(name));

const ROOT_CITY_SCOPE_RULES = Object.freeze({
  'новоалтайск': {
    radiusKm: 25,
    excludeNormalizedNames: new Set(['барнаул']),
    scopeLabel: 'Новоалтайск и рядом',
  },
});

function toNumberOrNull(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function toRadians(value) {
  return Number(value) * (Math.PI / 180);
}

function calculateDistanceKm(left, right) {
  const lat1 = toNumberOrNull(left && left.lat);
  const lng1 = toNumberOrNull(left && left.lng);
  const lat2 = toNumberOrNull(right && right.lat);
  const lng2 = toNumberOrNull(right && right.lng);
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

function getRootCityCenter(rootCity) {
  const metadata = rootCity && rootCity.metadata && typeof rootCity.metadata === 'object'
    ? rootCity.metadata
    : {};
  return {
    lat: toNumberOrNull(metadata.center_lat),
    lng: toNumberOrNull(metadata.center_lng),
  };
}

function hasLeadingHouseToken(value, houseToken) {
  const normalizedHouse = normalizeHouseToken(houseToken);
  const tokens = normalizeText(value).split(' ').map((item) => item.trim()).filter(Boolean);
  if (!normalizedHouse || !tokens.length) return false;
  const maxSpan = Math.min(3, tokens.length);
  for (let span = 1; span <= maxSpan; span += 1) {
    const candidate = normalizeHouseToken(tokens.slice(0, span).join(' '));
    if (candidate && candidate === normalizedHouse) {
      return true;
    }
  }
  return false;
}

function buildStreetSearchQuery(value) {
  const normalized = normalizeText(stripStreetNoise(value));
  if (!normalized) return '';
  if (/^\d+\s+(?:лет)(?:\s+.+)?$/iu.test(normalized)) {
    return normalized;
  }
  if (/^\d{4}\s+(?:года|год|лет)$/iu.test(normalized)) {
    return normalized;
  }
  if (/^\d+-(?:го|й|я|ый|ая)\b/iu.test(normalized)) {
    return normalized;
  }
  const yearOnlyMatch = normalized.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    return `${yearOnlyMatch[1]} года`;
  }
  const ordinalMatch = normalized.match(/^(\d+)\s+(.+)$/);
  if (!ordinalMatch) {
    return normalized;
  }
  const numberPart = ordinalMatch[1];
  const restPart = String(ordinalMatch[2] || '').trim();
  if (!restPart) {
    return normalized;
  }
  if (/^(?:микрорайон|мкр)\b/iu.test(restPart)) {
    return `${numberPart}-й ${restPart}`;
  }
  return `${numberPart}-го ${restPart}`;
}

function buildStreetSearchQuery(value) {
  const normalized = normalizeText(stripStreetNoise(value));
  if (!normalized) return '';
  if (/^\d+\s+(?:\u043b\u0435\u0442)(?:\s+.+)?$/iu.test(normalized)) {
    return normalized;
  }
  if (/^\d{4}\s+(?:\u0433\u043e\u0434\u0430|\u0433\u043e\u0434|\u043b\u0435\u0442)$/iu.test(normalized)) {
    return normalized;
  }
  if (/^\d+-(?:\u0433\u043e|\u0439|\u044f|\u044b\u0439|\u0430\u044f)\b/iu.test(normalized)) {
    return normalized;
  }
  const yearOnlyMatch = normalized.match(/^(\d{4})$/);
  if (yearOnlyMatch) {
    return `${yearOnlyMatch[1]} \u0433\u043e\u0434\u0430`;
  }
  const ordinalMatch = normalized.match(/^(\d+)\s+(.+)$/);
  if (!ordinalMatch) {
    return normalized;
  }
  const numberPart = ordinalMatch[1];
  const restPart = String(ordinalMatch[2] || '').trim();
  if (!restPart) {
    return normalized;
  }
  if (/^(?:\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d|\u043c\u043a\u0440)\b/iu.test(restPart)) {
    return `${numberPart}-\u0439 ${restPart}`;
  }
  if (/^(?:\u043b\u0435\u0442)(?:\s+.+)?$/iu.test(restPart)) {
    return `${numberPart} ${restPart}`;
  }
  return `${numberPart} ${restPart}`;
}

function splitQuery(value) {
  const normalizedQuery = normalizeText(value);
  const normalizedCompact = compactText(value);
  let houseToken = extractHouseToken(value);
  const streetValueWithoutHouse = removeHouseToken(value, houseToken) || value;
  if (
    houseToken
    && (
      hasLeadingHouseToken(value, houseToken)
      || !normalizeStreetSearchValue(streetValueWithoutHouse)
    )
  ) {
    houseToken = '';
  }
  const streetQuery = buildStreetSearchQuery(removeHouseToken(value, houseToken) || value);
  return {
    normalizedQuery,
    normalizedCompact,
    houseToken,
    streetQuery,
  };
}

function splitStreetOnlyQuery(value) {
  const normalizedQuery = normalizeStreetSearchValue(value) || normalizeText(value);
  return {
    normalizedQuery,
    normalizedCompact: compactText(normalizedQuery),
    houseToken: '',
    streetQuery: buildStreetSearchQuery(value) || normalizedQuery,
  };
}

function splitHouseOnlyQuery(value) {
  const normalizedHouse = normalizeHouseToken(value) || extractHouseToken(value) || normalizeText(value);
  return {
    normalizedQuery: normalizeText(value),
    normalizedCompact: compactText(value),
    houseToken: normalizedHouse,
    streetQuery: '',
  };
}

function normalizeStreetComparable(value) {
  return normalizeText(stripStreetNoise(value))
    .replace(/(\d+)\s*-\s*(?:го|й|я|ый|ая)\b/giu, '$1')
    .replace(/(\d+)(?:-го|-й|-я|-ый|-ая)\b/giu, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapCityRow(row) {
  const center = getRootCityCenter(row);
  return {
    id: row.id,
    code: row.code,
    label: row.name,
    value: row.name,
    object_type: 'city',
    source_key: `root-city:${row.code}`,
    city_name: row.name,
    context_display: row.region_name || row.name,
    display: row.name,
    lat: center.lat,
    lng: center.lng,
    confidence: Number(row.score || 0),
  };
}

function mapSearchRow(row) {
  return {
    id: row.id,
    display: row.display,
    label: row.display,
    value: row.display,
    object_type: row.object_type,
    source_key: row.source_key,
    city_name: row.locality_display,
    context_locality: row.context_display || row.locality_display,
    context_display: row.context_display || row.locality_display,
    street: row.street_display || row.street_name || null,
    house: row.house_number || null,
    lat: toNumberOrNull(row.lat),
    lng: toNumberOrNull(row.lng),
    confidence: Number(row.score || 0),
  };
}

function normalizeStreetIdentity(value) {
  return normalizeStreetSearchValue(value).replace(/\s+/g, '');
}

function buildStreetLocalityKey(localityValue, streetValue) {
  const localityKey = normalizeText(localityValue);
  const streetKey = normalizeStreetIdentity(streetValue);
  if (!localityKey || !streetKey) return '';
  return `${localityKey}::${streetKey}`;
}

function getItemLocalityDisplay(item) {
  return String(item && (item.context_display || item.context_locality || item.city_name || item.locality_display) || '').trim();
}

function getItemStreetDisplay(item) {
  return String(item && (item.street || item.street_display || item.street_name || item.display || item.value || item.label) || '').trim();
}

function getQueryStreetSearchValue(queryState) {
  const rawValue = String(queryState && (queryState.streetQuery || queryState.normalizedQuery) || '').trim();
  if (!rawValue) return '';
  return normalizeStreetSearchValue(rawValue) || normalizeText(rawValue);
}

function hasMeaningfulStreetSearchValue(queryState) {
  const streetValue = getQueryStreetSearchValue(queryState);
  if (!streetValue) return false;
  const extractedHouse = extractHouseToken(streetValue);
  if (extractedHouse && hasLeadingHouseToken(streetValue, extractedHouse)) {
    return true;
  }
  const withoutHouse = normalizeText(removeHouseToken(streetValue, extractedHouse));
  return Boolean(withoutHouse || (!extractedHouse && streetValue));
}

function containsNormalizedPhrase(haystack, needle) {
  const normalizedHaystack = normalizeText(haystack);
  const normalizedNeedle = normalizeText(needle);
  if (!normalizedHaystack || !normalizedNeedle) return false;
  return ` ${normalizedHaystack} `.includes(` ${normalizedNeedle} `);
}

function removeNormalizedPhrase(value, phrase) {
  const normalizedValue = normalizeText(value);
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedValue || !normalizedPhrase) return normalizedValue;
  const paddedValue = ` ${normalizedValue} `;
  const paddedPhrase = ` ${normalizedPhrase} `;
  const matchIndex = paddedValue.indexOf(paddedPhrase);
  if (matchIndex === -1) return normalizedValue;
  return `${paddedValue.slice(0, matchIndex)} ${paddedValue.slice(matchIndex + paddedPhrase.length)}`
    .replace(/\s+/g, ' ')
    .trim();
}

function getStreetMatchFlags(queryState, streetValue) {
  const queryValue = normalizeStreetSearchValue(getQueryStreetSearchValue(queryState));
  const normalizedStreet = normalizeStreetSearchValue(streetValue);
  if (!queryValue || !normalizedStreet) {
    return { strict: false, relaxed: false };
  }
  if (queryValue === normalizedStreet) {
    return { strict: true, relaxed: true };
  }
  if (containsNormalizedPhrase(queryValue, normalizedStreet) || containsNormalizedPhrase(normalizedStreet, queryValue)) {
    return { strict: true, relaxed: true };
  }
  const queryCompact = compactText(queryValue);
  const streetCompact = compactText(normalizedStreet);
  if (!queryCompact || !streetCompact) {
    return { strict: false, relaxed: false };
  }
  if (queryCompact === streetCompact) {
    return { strict: true, relaxed: true };
  }
  return {
    strict: false,
    relaxed: streetCompact.includes(queryCompact),
  };
}

function hasExplicitLocalityInQuery(queryState, localityValue, streetValue) {
  const locality = normalizeText(localityValue);
  const street = stripStreetNoise(streetValue) || normalizeText(streetValue);
  const queryValue = getQueryStreetSearchValue(queryState);
  if (!locality || !queryValue) return false;
  if (!containsNormalizedPhrase(queryValue, locality)) return false;
  if (!street) return true;
  const queryWithoutStreet = removeNormalizedPhrase(queryValue, street);
  return containsNormalizedPhrase(queryWithoutStreet, locality);
}

async function loadAddressBackedStreetKeys(db, rootScope, queryState) {
  const searchRootCityIds = Array.isArray(rootScope && rootScope.searchRootCityIds)
    ? rootScope.searchRootCityIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (!searchRootCityIds.length || !rootScope || !rootScope.includesNearby || queryState.houseToken) {
    return new Set();
  }
  const queryValue = getQueryStreetSearchValue(queryState);
  if (!queryValue) return new Set();
  const rows = await fetchCandidatesWithLeadingTokenFallback(db, rootScope, {
    ...queryState,
    houseToken: '',
  }, {
    limit: Math.max(config.queryLimit * 20, 200),
    forceAddress: true,
  });
  return new Set(
    (rows || [])
      .filter((row) => {
        const flags = getStreetMatchFlags(queryState, row && row.street_display);
        return flags.strict || flags.relaxed;
      })
      .map((row) => buildStreetLocalityKey(
        String(row && (row.context_display || row.locality_display) || '').trim(),
        String(row && row.street_display || '').trim()
      ))
      .filter(Boolean)
  );
}

function filterSuggestionItemsByQuery(items, queryState, options = {}) {
  const requiresStreetMatch = hasMeaningfulStreetSearchValue(queryState);
  const rootLocalityKey = normalizeText(options.rootLocality || '');
  const confirmedNearbyStreetKeys = options.confirmedNearbyStreetKeys instanceof Set
    ? options.confirmedNearbyStreetKeys
    : new Set();
  const requireNearbyAddressConfirmation = Boolean(options.requireNearbyAddressConfirmation);
  const preparedItems = (Array.isArray(items) ? items : []).map((item) => {
    const objectType = String(item && item.object_type || '').trim();
    const localityValue = getItemLocalityDisplay(item);
    const streetValue = getItemStreetDisplay(item);
    const streetMatchFlags = getStreetMatchFlags(queryState, streetValue);
    return {
      item,
      objectType,
      localityKey: normalizeText(localityValue),
      streetLocalityKey: buildStreetLocalityKey(localityValue, streetValue),
      streetMatchesStrict: !requiresStreetMatch || streetMatchFlags.strict,
      streetMatchesRelaxed: !requiresStreetMatch || streetMatchFlags.relaxed,
      hasExplicitLocality: hasExplicitLocalityInQuery(queryState, localityValue, streetValue),
      isRootLocality: Boolean(rootLocalityKey) && normalizeText(localityValue) === rootLocalityKey,
    };
  });

  const hasStrictStreetMatches = preparedItems.some((entry) => (
    entry.objectType !== 'context'
    && entry.streetMatchesStrict
  ));

  const explicitLocalityKeys = new Set(
    preparedItems
      .filter((entry) => entry.localityKey && entry.hasExplicitLocality && (
        entry.streetMatchesStrict
        || (!hasStrictStreetMatches && entry.streetMatchesRelaxed)
      ))
      .map((entry) => entry.localityKey)
  );

  return preparedItems
    .filter((entry) => {
      const matchesStreet = entry.streetMatchesStrict
        || (!hasStrictStreetMatches && entry.streetMatchesRelaxed);
      if (explicitLocalityKeys.size && (!entry.localityKey || !explicitLocalityKeys.has(entry.localityKey))) {
        return false;
      }
      if (entry.objectType === 'context') {
        if (explicitLocalityKeys.size) return Boolean(entry.localityKey);
        return !requiresStreetMatch && entry.hasExplicitLocality;
      }
      if (requiresStreetMatch && !matchesStreet) return false;
      if (
        requireNearbyAddressConfirmation
        && !explicitLocalityKeys.size
        && !queryState.houseToken
        && entry.objectType === 'street'
        && !entry.isRootLocality
      ) {
        return Boolean(entry.streetLocalityKey) && confirmedNearbyStreetKeys.has(entry.streetLocalityKey);
      }
      return true;
    })
    .map((entry) => entry.item);
}

function buildScopeFromSearchItem(item) {
  if (!item) return null;
  const objectType = String(item.object_type || '').trim();
  const contextDisplay = getItemLocalityDisplay(item) || null;
  if (objectType === 'street') {
    const streetDisplay = getItemStreetDisplay(item);
    if (!streetDisplay) return null;
    return {
      selected_source_key: String(item.source_key || '').trim() || null,
      selected_object_type: 'street',
      context_display: contextDisplay,
      street_display: streetDisplay,
      lat: toNumberOrNull(item.lat),
      lng: toNumberOrNull(item.lng),
    };
  }
  if (objectType === 'context') {
    return {
      selected_source_key: String(item.source_key || '').trim() || null,
      selected_object_type: 'context',
      context_display: contextDisplay || String(item.display || item.label || item.value || '').trim() || null,
      street_display: '',
      lat: toNumberOrNull(item.lat),
      lng: toNumberOrNull(item.lng),
    };
  }
  return null;
}

function buildScopeFromRow(row) {
  if (!row) return null;
  const objectType = String(row.object_type || '').trim();
  const contextDisplay = String(row.context_display || row.locality_display || '').trim() || null;
  if (objectType === 'street') {
    const streetDisplay = String(row.street_display || row.display || '').trim();
    if (!streetDisplay) return null;
    return {
      selected_source_key: String(row.street_source_key || row.source_key || '').trim() || null,
      selected_object_type: 'street',
      context_display: contextDisplay,
      street_display: streetDisplay,
      lat: toNumberOrNull(row.lat),
      lng: toNumberOrNull(row.lng),
    };
  }
  if (objectType === 'context') {
    return {
      selected_source_key: String(row.context_source_key || row.locality_source_key || row.source_key || '').trim() || null,
      selected_object_type: 'context',
      context_display: contextDisplay || String(row.display || row.locality_display || '').trim() || null,
      street_display: '',
      lat: toNumberOrNull(row.lat),
      lng: toNumberOrNull(row.lng),
    };
  }
  if (objectType === 'address') {
    const streetDisplay = String(row.street_display || '').trim();
    if (!streetDisplay) return null;
    return {
      selected_source_key: String(row.street_source_key || row.source_key || '').trim() || null,
      selected_object_type: 'street',
      context_display: contextDisplay,
      street_display: streetDisplay,
      lat: toNumberOrNull(row.lat),
      lng: toNumberOrNull(row.lng),
    };
  }
  return null;
}

function buildManualAddressDisplay(payload, scope, housePart) {
  const rawStreet = String(payload.address_street || '').trim();
  const rawInput = String(payload.raw_input || payload.address || '').trim();
  if (rawStreet) {
    return [rawStreet, String(housePart || '').trim()].filter(Boolean).join(', ');
  }
  if (rawInput) return rawInput;
  const rawHousePart = String(housePart || '').trim();
  if (scope && scope.street_display) {
    return [scope.street_display, rawHousePart].filter(Boolean).join(', ');
  }
  return rawHousePart;
}

function isNoisyStreetSuggestion(item, queryState) {
  if (!item || String(item.object_type || '').trim() !== 'street') return false;
  if (queryState && queryState.houseToken) return false;
  const display = String(item.display || item.value || item.label || '').trim();
  const sourceKey = String(item.source_key || '').trim();
  if (!display) return false;
  if (sourceKey.startsWith('mysql:derived:derived-street:')) return true;
  const normalizedDisplay = normalizeText(display);
  if (Boolean(extractHouseToken(display))) return true;
  if (/[,:]/.test(display) && /\b(?:кв|квартира|подъезд|под|этаж|эт|комментарий|дом|д)\b/.test(normalizedDisplay)) {
    return true;
  }
  return false;
}

function isSuggestionWithCoordinates(item) {
  return toNumberOrNull(item && item.lat) !== null
    && toNumberOrNull(item && item.lng) !== null
    && toNumberOrNull(item && item.lat) !== 0
    && toNumberOrNull(item && item.lng) !== 0;
}

function collapseStreetSuggestionItems(items) {
  const result = [];
  const streetIndexes = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    if (String(item && item.object_type || '').trim() !== 'street') {
      result.push(item);
      continue;
    }
    const localityKey = normalizeText(getItemLocalityDisplay(item));
    const streetKey = normalizeStreetIdentity(getItemStreetDisplay(item));
    if (!localityKey || !streetKey) {
      result.push(item);
      continue;
    }
    const dedupeKey = `${localityKey}::${streetKey}`;
    const existingIndex = streetIndexes.get(dedupeKey);
    if (existingIndex === undefined) {
      streetIndexes.set(dedupeKey, result.length);
      result.push(item);
      continue;
    }
    const existingItem = result[existingIndex];
    const existingHasCoords = isSuggestionWithCoordinates(existingItem);
    const nextHasCoords = isSuggestionWithCoordinates(item);
    if (existingHasCoords !== nextHasCoords) {
      if (nextHasCoords) result[existingIndex] = item;
      continue;
    }
    const existingLabel = String(existingItem && (existingItem.display || existingItem.value || existingItem.label) || '');
    const nextLabel = String(item && (item.display || item.value || item.label) || '');
    if (nextLabel.length < existingLabel.length) {
      result[existingIndex] = item;
    }
  }
  return result;
}

async function inferStreetScope(db, rootScope, queryState) {
  const streetQuery = String(queryState.streetQuery || '').trim();
  if (!streetQuery) return null;
  const streetQueryState = {
    normalizedQuery: normalizeText(streetQuery),
    normalizedCompact: compactText(streetQuery),
    houseToken: '',
    streetQuery: stripStreetNoise(streetQuery) || streetQuery,
  };
  const streetRows = await fetchAddressCandidates(db, rootScope, streetQueryState, {
    limit: 12,
  });
  const confirmedNearbyStreetKeys = await loadAddressBackedStreetKeys(db, rootScope, streetQueryState);
  const streetItems = collapseStreetSuggestionItems(filterSuggestionItemsByQuery(
    dedupeItems(streetRows.map(mapSearchRow))
      .filter((item) => !isNoisyStreetSuggestion(item, streetQueryState))
      .filter((item) => String(item.object_type || '').trim() === 'street'),
    streetQueryState,
    {
      rootLocality: rootScope && rootScope.rootCity && rootScope.rootCity.name,
      confirmedNearbyStreetKeys,
      requireNearbyAddressConfirmation: Boolean(rootScope && rootScope.includesNearby),
    }
  ));
  if (!streetItems.length) return null;
  const expectedStreetKey = normalizeStreetIdentity(streetQuery);
  const exactStreetItems = streetItems.filter((item) => normalizeStreetIdentity(getItemStreetDisplay(item)) === expectedStreetKey);
  const candidates = exactStreetItems.length ? exactStreetItems : streetItems;
  if (candidates.length !== 1) return null;
  return buildScopeFromSearchItem(candidates[0]);
}

async function resolveManualAddressScope(db, rootScope, queryState, selectedRow) {
  const selectedScope = buildScopeFromRow(selectedRow);
  if (selectedScope) return selectedScope;
  return inferStreetScope(db, rootScope, queryState);
}

async function suggestCities(db, query, options = {}) {
  const normalizedQuery = normalizeText(query);
  const limit = Math.max(1, Math.min(50, Number(options.limit) || config.queryLimit));
  if (!normalizedQuery) {
    const { rows } = await db.query(
      `
        SELECT id,
               code,
               name,
               region_name,
               metadata,
               1.0 AS score
          FROM ads_root_cities
         WHERE is_active = TRUE
           AND normalized_name = ANY($2::text[])
         ORDER BY array_position($2::text[], normalized_name) ASC,
                  char_length(name) ASC,
                  name ASC
         LIMIT $1
      `,
      [limit, STORE_CITY_SELECTOR_ALLOWLIST_KEYS]
    );
    return {
      ok: true,
      data: {
        query: '',
        items: (rows || []).map(mapCityRow),
      },
    };
  }
  const queryPrefix = `${normalizedQuery}%`;
  const queryContains = `%${normalizedQuery}%`;
  const sql = `
    SELECT id,
           code,
           name,
           region_name,
           metadata,
           GREATEST(
             CASE WHEN normalized_name = $1 THEN 1.0 ELSE 0 END,
             CASE WHEN normalized_name LIKE $2 THEN 0.97 ELSE 0 END,
             CASE WHEN normalized_name LIKE $3 THEN 0.90 ELSE 0 END
           ) AS score
      FROM ads_root_cities
     WHERE is_active = TRUE
       AND normalized_name = ANY($4::text[])
       AND (
         normalized_name = $1
         OR normalized_name LIKE $2
         OR normalized_name LIKE $3
       )
     ORDER BY score DESC,
              array_position($4::text[], normalized_name) ASC,
              char_length(name) ASC,
              name ASC
     LIMIT $5
  `;
  const { rows } = await db.query(sql, [
    normalizedQuery,
    queryPrefix,
    queryContains,
    STORE_CITY_SELECTOR_ALLOWLIST_KEYS,
    limit,
  ]);
  return {
    ok: true,
    data: {
      query: String(query || '').trim(),
      items: (rows || []).map(mapCityRow),
    },
  };
}

async function resolveRootCity(db, options = {}) {
  const cityId = Number(options.cityId);
  if (Number.isFinite(cityId) && cityId > 0) {
    const { rows } = await db.query(
      'SELECT id, code, name, normalized_name, region_name, metadata FROM ads_root_cities WHERE id=$1 AND is_active=TRUE LIMIT 1',
      [cityId]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  const cityCode = String(options.cityCode || '').trim();
  if (cityCode) {
    const { rows } = await db.query(
      'SELECT id, code, name, normalized_name, region_name, metadata FROM ads_root_cities WHERE code=$1 AND is_active=TRUE LIMIT 1',
      [cityCode]
    );
    return rows && rows[0] ? rows[0] : null;
  }

  const normalizedCity = normalizeText(options.cityName);
  if (!normalizedCity) return null;
  const { rows } = await db.query(
    'SELECT id, code, name, normalized_name, region_name, metadata FROM ads_root_cities WHERE normalized_name=$1 AND is_active=TRUE LIMIT 2',
    [normalizedCity]
  );
  return rows && rows.length === 1 ? rows[0] : null;
}

async function resolveRootCityScope(db, rootCity) {
  if (!rootCity) {
    return {
      rootCity: null,
      searchRootCityIds: [],
      includesNearby: false,
      scopeLabel: '',
    };
  }

  const rootCityId = Number(rootCity.id);
  const baseScope = {
    rootCity,
    searchRootCityIds: Number.isFinite(rootCityId) && rootCityId > 0 ? [rootCityId] : [],
    includesNearby: false,
    scopeLabel: rootCity.name,
  };
  const rule = ROOT_CITY_SCOPE_RULES[String(rootCity.normalized_name || '').trim()];
  if (!rule) return baseScope;

  const rootCenter = getRootCityCenter(rootCity);
  if (!Number.isFinite(rootCenter.lat) || !Number.isFinite(rootCenter.lng)) {
    return baseScope;
  }

  const { rows } = await db.query(
    'SELECT id, code, name, normalized_name, region_name, metadata FROM ads_root_cities WHERE is_active=TRUE'
  );
  const candidates = (rows || [])
    .map((row) => ({
      row,
      distanceKm: Number(row.id) === rootCityId
        ? 0
        : calculateDistanceKm(rootCenter, getRootCityCenter(row)),
    }))
    .filter(({ row, distanceKm }) => {
      const currentId = Number(row && row.id);
      if (!Number.isFinite(currentId) || currentId <= 0) return false;
      if (currentId === rootCityId) return true;
      if (!Number.isFinite(distanceKm) || distanceKm > rule.radiusKm) return false;
      return !rule.excludeNormalizedNames.has(String(row && row.normalized_name || '').trim());
    })
    .sort((left, right) => {
      const leftIsRoot = Number(left.row && left.row.id) === rootCityId;
      const rightIsRoot = Number(right.row && right.row.id) === rootCityId;
      if (leftIsRoot !== rightIsRoot) return leftIsRoot ? -1 : 1;
      if (left.distanceKm !== right.distanceKm) return left.distanceKm - right.distanceKm;
      return String(left.row && left.row.name || '').localeCompare(String(right.row && right.row.name || ''), 'ru');
    });

  const searchRootCityIds = candidates
    .map(({ row }) => Number(row && row.id))
    .filter((value) => Number.isFinite(value) && value > 0);

  return {
    rootCity,
    searchRootCityIds: searchRootCityIds.length ? searchRootCityIds : baseScope.searchRootCityIds,
    includesNearby: searchRootCityIds.length > 1,
    scopeLabel: rule.scopeLabel || rootCity.name,
  };
}

async function resolveGlobalScope(db) {
  const { rows } = await db.query(
    'SELECT id FROM ads_root_cities WHERE is_active=TRUE ORDER BY id ASC'
  );
  return {
    rootCity: null,
    searchRootCityIds: (rows || [])
      .map((row) => Number(row && row.id))
      .filter((value) => Number.isFinite(value) && value > 0),
    includesNearby: false,
    scopeLabel: 'Россия',
  };
}

async function getSearchRowBySourceKey(db, sourceKey) {
  const resolvedSourceKey = String(sourceKey || '').trim();
  if (!resolvedSourceKey) return null;
  const { rows } = await db.query(
    `SELECT id,
            source_key,
            object_type,
            root_city_id,
            locality_display,
            locality_source_key,
            context_display,
            context_source_key,
            street_display,
            street_source_key,
            house_number,
            display,
            lat,
            lng
       FROM ads_search_index
      WHERE source_key = $1
        AND is_active = TRUE
      LIMIT 1`,
    [resolvedSourceKey]
  );
  return rows && rows[0] ? rows[0] : null;
}

function isRowInsideRootCityScope(row, rootScope) {
  const rowRootCityId = Number(row && row.root_city_id);
  if (!Number.isFinite(rowRootCityId) || rowRootCityId <= 0) return false;
  const searchRootCityIds = Array.isArray(rootScope && rootScope.searchRootCityIds)
    ? rootScope.searchRootCityIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  return searchRootCityIds.includes(rowRootCityId);
}

async function fetchAddressCandidates(db, rootScope, queryState, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || config.queryLimit * 3));
  const selectedRow = options.selectedRow || null;
  const prefersAddress = options.forceAddress === true || Boolean(queryState.houseToken);
  const searchRootCityIds = Array.isArray(rootScope && rootScope.searchRootCityIds)
    ? rootScope.searchRootCityIds.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (!searchRootCityIds.length) return [];

  const conditions = ['root_city_id = ANY($1::bigint[])', 'is_active = TRUE'];
  const params = [searchRootCityIds];
  let nextParam = params.length + 1;

  if (prefersAddress) {
    conditions.push(`object_type = 'address'`);
  } else {
    conditions.push(`object_type IN ('street', 'context')`);
  }

  if (selectedRow && selectedRow.object_type === 'context' && (selectedRow.context_source_key || selectedRow.locality_source_key || selectedRow.source_key)) {
    conditions.push(`context_source_key = $${nextParam}`);
    params.push(String(selectedRow.context_source_key || selectedRow.locality_source_key || selectedRow.source_key));
    nextParam += 1;
  }
  if (selectedRow && selectedRow.object_type === 'street' && (selectedRow.street_source_key || selectedRow.source_key)) {
    conditions.push(`street_source_key = $${nextParam}`);
    params.push(String(selectedRow.street_source_key || selectedRow.source_key));
    nextParam += 1;
  }

  if (prefersAddress && queryState.houseToken) {
    conditions.push(`normalized_house LIKE $${nextParam}`);
    params.push(`${normalizeHouseToken(queryState.houseToken)}%`);
    nextParam += 1;
  }

  const searchQueryValue = prefersAddress && queryState.houseToken
    ? normalizeStreetSearchValue(queryState.streetQuery || queryState.normalizedQuery || '')
    : String(queryState.normalizedQuery || '').trim();
  const queryPrefix = `${searchQueryValue}%`;
  const queryContains = `%${searchQueryValue}%`;
  const compactPrefix = `${compactText(searchQueryValue)}%`;
  const streetContains = queryState.streetQuery ? `%${queryState.streetQuery}%` : queryContains;
  const queryTokens = String(searchQueryValue || '').split(' ').map((token) => token.trim()).filter(Boolean).slice(0, 8);
  const rawQueryTokens = normalizeText(queryState.streetQuery || queryState.normalizedQuery || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8);
  const mergedQueryTokens = Array.from(new Set([...rawQueryTokens, ...queryTokens]));
  const activeQueryTokens = mergedQueryTokens.length > 1 ? mergedQueryTokens : [];
  const tokenConditions = [];
  const searchParamBase = nextParam;
  let tokenParamStart = searchParamBase + 5;
  activeQueryTokens.forEach((token) => {
    tokenConditions.push(`search_text LIKE $${tokenParamStart}`);
    tokenParamStart += 1;
  });
  conditions.push(`(
    normalized_display = $${searchParamBase}
    OR normalized_display LIKE $${searchParamBase + 1}
    OR normalized_display LIKE $${searchParamBase + 2}
    OR normalized_compact LIKE $${searchParamBase + 3}
    OR search_text LIKE $${searchParamBase + 4}
    ${tokenConditions.length > 1 ? `OR (${tokenConditions.join(' AND ')})` : ''}
  )`);
  params.push(
    queryState.normalizedQuery,
    queryPrefix,
    queryContains,
    compactPrefix,
    streetContains
  );
  activeQueryTokens.forEach((token) => {
    params.push(`%${token}%`);
  });
  nextParam = params.length + 1;

  const sql = `
    SELECT id,
           source_key,
           object_type,
           root_city_id,
           locality_display,
           context_display,
           context_source_key,
           street_display,
           street_source_key,
            house_number,
            display,
            lat,
            lng,
            CASE root_city_id
              ${searchRootCityIds.map((rootCityId, index) => `WHEN ${rootCityId} THEN ${index}`).join(' ')}
              ELSE ${searchRootCityIds.length + 1}
            END AS root_scope_rank,
            CASE
              WHEN lat IS NULL OR lng IS NULL OR lat = 0 OR lng = 0 THEN 1
              ELSE 0
            END AS coordinate_rank,
           GREATEST(
             CASE WHEN normalized_display = $${searchParamBase} THEN 1.0 ELSE 0 END,
             CASE WHEN normalized_display LIKE $${searchParamBase + 1} THEN 0.97 ELSE 0 END,
             CASE WHEN normalized_display LIKE $${searchParamBase + 2} THEN 0.91 ELSE 0 END,
             CASE WHEN search_text LIKE $${searchParamBase + 4} THEN 0.84 ELSE 0 END
           ) AS score
      FROM ads_search_index
     WHERE ${conditions.join(' AND ')}
     ORDER BY root_scope_rank ASC, coordinate_rank ASC, score DESC, char_length(display) ASC, display ASC
     LIMIT $${nextParam}
  `;
  params.push(
    limit
  );
  const { rows } = await db.query(sql, params);
  return rows || [];
}

async function fetchCandidatesWithLeadingTokenFallback(db, rootScope, queryState, options = {}) {
  const primaryRows = await fetchAddressCandidates(db, rootScope, queryState, options);
  const rawStreetValue = String(queryState && (queryState.streetQuery || queryState.normalizedQuery) || '').trim();
  const leadingHouseToken = extractHouseToken(rawStreetValue);
  const fallbackStreetValue = (
    leadingHouseToken
    && hasLeadingHouseToken(rawStreetValue, leadingHouseToken)
  )
    ? normalizeStreetSearchValue(removeHouseToken(rawStreetValue, leadingHouseToken))
    : '';
  if (!fallbackStreetValue) {
    return primaryRows;
  }
  const fallbackRows = await fetchAddressCandidates(
    db,
    rootScope,
    splitStreetOnlyQuery(fallbackStreetValue),
    options
  );
  const result = [];
  const seen = new Set();
  for (const row of [...(primaryRows || []), ...(fallbackRows || [])]) {
    const key = String(row && row.source_key || '').trim();
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(row);
  }
  return result;
}

async function fetchGlobalSearchCandidates(db, queryState, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit) || config.queryLimit * 3));
  const prefersAddress = options.forceAddress === true || Boolean(queryState.houseToken);
  const conditions = ['is_active = TRUE'];
  const params = [];
  let nextParam = 1;

  if (prefersAddress) {
    conditions.push(`object_type = 'address'`);
  } else {
    conditions.push(`object_type IN ('street', 'context')`);
  }

  if (prefersAddress && queryState.houseToken) {
    conditions.push(`normalized_house LIKE $${nextParam}`);
    params.push(`${normalizeHouseToken(queryState.houseToken)}%`);
    nextParam += 1;
  }

  const searchQueryValue = prefersAddress && queryState.houseToken
    ? normalizeStreetSearchValue(queryState.streetQuery || queryState.normalizedQuery || '')
    : String(queryState.normalizedQuery || '').trim();
  const queryPrefix = `${searchQueryValue}%`;
  const queryContains = `%${searchQueryValue}%`;
  const compactPrefix = `${compactText(searchQueryValue)}%`;
  const streetContains = queryState.streetQuery ? `%${queryState.streetQuery}%` : queryContains;
  const queryTokens = String(searchQueryValue || '').split(' ').map((token) => token.trim()).filter(Boolean).slice(0, 8);
  const rawQueryTokens = normalizeText(queryState.streetQuery || queryState.normalizedQuery || '')
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, 8);
  const mergedQueryTokens = Array.from(new Set([...rawQueryTokens, ...queryTokens]));
  const activeQueryTokens = mergedQueryTokens.length > 1 ? mergedQueryTokens : [];
  const tokenConditions = [];
  const searchParamBase = nextParam;
  let tokenParamStart = searchParamBase + 5;
  activeQueryTokens.forEach((token) => {
    tokenConditions.push(`search_text LIKE $${tokenParamStart}`);
    tokenParamStart += 1;
  });
  conditions.push(`(
    normalized_display = $${searchParamBase}
    OR normalized_display LIKE $${searchParamBase + 1}
    OR normalized_display LIKE $${searchParamBase + 2}
    OR normalized_compact LIKE $${searchParamBase + 3}
    OR search_text LIKE $${searchParamBase + 4}
    ${tokenConditions.length > 1 ? `OR (${tokenConditions.join(' AND ')})` : ''}
  )`);
  params.push(
    queryState.normalizedQuery,
    queryPrefix,
    queryContains,
    compactPrefix,
    streetContains
  );
  activeQueryTokens.forEach((token) => {
    params.push(`%${token}%`);
  });
  nextParam = params.length + 1;

  const sql = `
    SELECT id,
           source_key,
           object_type,
           root_city_id,
           locality_display,
           context_display,
           context_source_key,
           street_display,
           street_source_key,
           house_number,
           display,
           lat,
           lng,
           CASE
             WHEN lat IS NULL OR lng IS NULL OR lat = 0 OR lng = 0 THEN 1
             ELSE 0
           END AS coordinate_rank,
           GREATEST(
             CASE WHEN normalized_display = $${searchParamBase} THEN 1.0 ELSE 0 END,
             CASE WHEN normalized_display LIKE $${searchParamBase + 1} THEN 0.97 ELSE 0 END,
             CASE WHEN normalized_display LIKE $${searchParamBase + 2} THEN 0.91 ELSE 0 END,
             CASE WHEN search_text LIKE $${searchParamBase + 4} THEN 0.84 ELSE 0 END
           ) AS score
      FROM ads_search_index
     WHERE ${conditions.join(' AND ')}
     ORDER BY coordinate_rank ASC, score DESC, char_length(display) ASC, display ASC
     LIMIT $${nextParam}
  `;
  params.push(limit);
  const { rows } = await db.query(sql, params);
  return rows || [];
}

function dedupeItems(items) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item && item.source_key || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildHouseStreetScope(selectedRow) {
  if (!selectedRow) return null;
  const streetKey = normalizeStreetIdentity(String(selectedRow.street_display || selectedRow.display || '').trim());
  if (!streetKey) return null;
  return {
    streetKey,
    localityKey: normalizeText(String(selectedRow.context_display || selectedRow.locality_display || '').trim()),
  };
}

function compareHouseSuggestionEntries(left, right, streetScope, rootCityName) {
  const rootLocalityKey = normalizeText(rootCityName);
  const leftLocalityKey = normalizeText(getItemLocalityDisplay(left));
  const rightLocalityKey = normalizeText(getItemLocalityDisplay(right));
  const leftSelectedRank = streetScope && streetScope.localityKey && leftLocalityKey === streetScope.localityKey ? 0 : 1;
  const rightSelectedRank = streetScope && streetScope.localityKey && rightLocalityKey === streetScope.localityKey ? 0 : 1;
  if (leftSelectedRank !== rightSelectedRank) return leftSelectedRank - rightSelectedRank;
  const leftRootRank = rootLocalityKey && leftLocalityKey === rootLocalityKey ? 0 : 1;
  const rightRootRank = rootLocalityKey && rightLocalityKey === rootLocalityKey ? 0 : 1;
  if (leftRootRank !== rightRootRank) return leftRootRank - rightRootRank;
  const leftCoordsRank = isSuggestionWithCoordinates(left) ? 0 : 1;
  const rightCoordsRank = isSuggestionWithCoordinates(right) ? 0 : 1;
  if (leftCoordsRank !== rightCoordsRank) return leftCoordsRank - rightCoordsRank;
  const leftHouse = normalizeHouseToken(left && (left.house || left.house_number) || '');
  const rightHouse = normalizeHouseToken(right && (right.house || right.house_number) || '');
  if (leftHouse.length !== rightHouse.length) return leftHouse.length - rightHouse.length;
  const leftDisplay = String(left && (left.display || left.value || left.label) || '').trim();
  const rightDisplay = String(right && (right.display || right.value || right.label) || '').trim();
  return leftDisplay.localeCompare(rightDisplay, 'ru');
}

async function buildScopedStreetLookupItems(db, rootCity, rootScope, queryState, limit) {
  const streetQueryState = splitStreetOnlyQuery(queryState.streetQuery || queryState.normalizedQuery || '');
  if (!hasMeaningfulStreetSearchValue(streetQueryState)) {
    return [];
  }
  const rows = await fetchCandidatesWithLeadingTokenFallback(db, rootScope, streetQueryState, {
    limit: Math.max(limit * 4, config.queryLimit * 4),
  });
  const confirmedNearbyStreetKeys = await loadAddressBackedStreetKeys(db, rootScope, streetQueryState);
  return collapseStreetSuggestionItems(
    filterSuggestionItemsByQuery(
      dedupeItems(rows.map(mapSearchRow))
        .filter((item) => !isNoisyStreetSuggestion(item, streetQueryState))
        .filter((item) => String(item && item.object_type || '').trim() === 'street'),
      streetQueryState,
      {
        rootLocality: rootCity && rootCity.name,
        confirmedNearbyStreetKeys,
        requireNearbyAddressConfirmation: Boolean(rootScope && rootScope.includesNearby),
      }
    )
  ).slice(0, limit);
}

async function buildScopedAddressLookupItems(db, rootCity, rootScope, queryState, limit) {
  const requestedHouse = normalizeHouseToken(queryState.houseToken);
  const requiresStreetMatch = hasMeaningfulStreetSearchValue(queryState);
  const rows = await fetchAddressCandidates(db, rootScope, queryState, {
    limit: Math.max(limit * 4, config.queryLimit * 4),
    forceAddress: true,
  });
  return dedupeItems(rows.map(mapSearchRow))
    .filter((item) => String(item && item.object_type || '').trim() === 'address')
    .filter((item) => {
      if (!requestedHouse) return true;
      const itemHouse = normalizeHouseToken(item && item.house || '');
      return Boolean(itemHouse) && itemHouse.startsWith(requestedHouse);
    })
    .filter((item) => {
      if (!requiresStreetMatch) return true;
      const flags = getStreetMatchFlags(queryState, item && (item.street || item.street_display || item.street_name) || '');
      return flags.strict || flags.relaxed;
    })
    .sort((left, right) => compareHouseSuggestionEntries(left, right, null, rootCity && rootCity.name))
    .slice(0, limit);
}

async function buildScopedHouseItemsByStreet(db, rootCity, rootScope, streetRow, houseToken, limit) {
  const streetScope = buildHouseStreetScope(streetRow);
  const requestedHouse = normalizeHouseToken(houseToken);
  const streetSearchValue = String(streetRow && (streetRow.street_display || streetRow.display) || '').trim();
  if (!streetScope || !streetScope.streetKey || !requestedHouse || !streetSearchValue) {
    return [];
  }
  const searchRootCityIds = Array.isArray(rootScope && rootScope.searchRootCityIds)
    ? rootScope.searchRootCityIds.map((value) => Number(value)).filter(Number.isFinite)
    : [];
  if (!searchRootCityIds.length) {
    return [];
  }
  const params = [
    searchRootCityIds,
    `${requestedHouse}%`,
    streetSearchValue,
  ];
  const conditions = [
    'is_active = TRUE',
    "object_type = 'address'",
    'root_city_id = ANY($1::int[])',
    'normalized_house LIKE $2',
    'street_display = $3',
  ];
  params.push(Math.max(limit * 16, config.queryLimit * 16));
  const sql = `
    SELECT id,
           source_key,
           object_type,
           root_city_id,
           locality_display,
           context_display,
           context_source_key,
           street_display,
           street_source_key,
           house_number,
           display,
           lat,
           lng
      FROM ads_search_index
     WHERE ${conditions.join(' AND ')}
     ORDER BY char_length(house_number) ASC, display ASC
     LIMIT $${params.length}
  `;
  const { rows } = await db.query(sql, params);
  return dedupeItems((rows || []).map(mapSearchRow))
    .filter((item) => String(item && item.object_type || '').trim() === 'address')
    .filter((item) => {
      const itemHouse = normalizeHouseToken(item && item.house || '');
      return Boolean(itemHouse) && itemHouse.startsWith(requestedHouse);
    })
    .filter((item) => normalizeStreetIdentity(item && (item.street || item.street_display || item.street_name) || '') === streetScope.streetKey)
    .sort((left, right) => compareHouseSuggestionEntries(left, right, streetScope, rootCity && rootCity.name))
    .slice(0, limit);
}

async function suggestGlobalAddressLookup(db, options = {}) {
  const rawQuery = String(options.query || '').trim();
  const queryState = splitQuery(rawQuery);
  if (!queryState.normalizedQuery) {
    return { ok: false, error: 'QUERY_REQUIRED' };
  }
  const globalScope = await resolveGlobalScope(db);
  if (!globalScope.searchRootCityIds.length) {
    return {
      ok: true,
      data: {
        query: rawQuery,
        scope_label: globalScope.scopeLabel,
        items: [],
      },
    };
  }

  const limit = Math.max(1, Math.min(50, Number(options.limit) || config.queryLimit));
  const requestedHouse = normalizeHouseToken(queryState.houseToken);
  const items = [];

  if (requestedHouse) {
    const addressRows = await fetchGlobalSearchCandidates(db, queryState, {
      limit: Math.max(limit * 4, config.queryLimit * 4),
      forceAddress: true,
    });
    const addressItems = dedupeItems(addressRows.map(mapSearchRow))
      .filter((item) => String(item && item.object_type || '').trim() === 'address')
      .filter((item) => {
        const itemHouse = normalizeHouseToken(item && (item.house || item.house_number) || '');
        return Boolean(itemHouse) && itemHouse.startsWith(requestedHouse);
      })
      .sort((left, right) => compareHouseSuggestionEntries(left, right, null, ''));
    items.push(...addressItems);
  }

  const streetQueryState = splitStreetOnlyQuery(queryState.streetQuery || rawQuery);
  if (hasMeaningfulStreetSearchValue(streetQueryState)) {
    const streetRows = await fetchGlobalSearchCandidates(db, streetQueryState, {
      limit: Math.max(limit * 4, config.queryLimit * 4),
    });
    const streetItems = collapseStreetSuggestionItems(
      filterSuggestionItemsByQuery(
        dedupeItems(streetRows.map(mapSearchRow))
          .filter((item) => !isNoisyStreetSuggestion(item, streetQueryState))
          .filter((item) => String(item && item.object_type || '').trim() === 'street'),
        streetQueryState,
        {
          rootLocality: '',
          confirmedNearbyStreetKeys: new Set(),
          requireNearbyAddressConfirmation: false,
        }
      )
    );
    items.push(...streetItems);
  }

  return {
    ok: true,
    data: {
      query: rawQuery,
      scope_label: globalScope.scopeLabel,
      items: dedupeItems(items).slice(0, limit),
    },
  };
}

async function suggestAddresses(db, options = {}) {
  const stage = String(options.stage || 'street').trim().toLowerCase() || 'street';
  const queryState = stage === 'house'
    ? splitHouseOnlyQuery(options.query)
    : (stage === 'address' ? splitQuery(options.query) : splitStreetOnlyQuery(options.query));
  if (!queryState.normalizedQuery) {
    return { ok: false, error: 'QUERY_REQUIRED' };
  }
  if (
    stage === 'address'
    && !String(options.city || '').trim()
    && !String(options.cityId || '').trim()
    && !String(options.cityCode || '').trim()
  ) {
    return suggestGlobalAddressLookup(db, options);
  }
  const rootCity = await resolveRootCity(db, {
    cityId: options.cityId,
    cityCode: options.cityCode,
    cityName: options.city,
  });
  if (!rootCity) {
    return { ok: false, error: 'CITY_REQUIRED' };
  }
  const rootScope = await resolveRootCityScope(db, rootCity);
  const selectedRow = options.selectedSourceKey
    ? await getSearchRowBySourceKey(db, options.selectedSourceKey)
    : null;
  const scopedSelectedRow = isRowInsideRootCityScope(selectedRow, rootScope) ? selectedRow : null;
  const streetScopedRow = scopedSelectedRow && scopedSelectedRow.object_type === 'address'
    ? {
      ...scopedSelectedRow,
      object_type: 'street',
      source_key: scopedSelectedRow.street_source_key || scopedSelectedRow.source_key,
    }
    : scopedSelectedRow;

  if (stage === 'house') {
    if (!streetScopedRow || streetScopedRow.object_type !== 'street') {
      return {
        ok: true,
        data: {
          query: String(options.query || '').trim(),
          city: {
            id: rootCity.id,
            code: rootCity.code,
            name: rootCity.name,
          },
          scope_label: rootScope.scopeLabel || rootCity.name,
          items: [],
        },
      };
    }
    const houseLimit = Math.max(1, Math.min(50, Number(options.limit) || config.queryLimit));
    const items = await buildScopedHouseItemsByStreet(
      db,
      rootCity,
      rootScope,
      streetScopedRow,
      queryState.houseToken,
      houseLimit
    );
    return {
      ok: true,
      data: {
        query: String(options.query || '').trim(),
        city: {
          id: rootCity.id,
          code: rootCity.code,
          name: rootCity.name,
        },
        scope_label: rootScope.scopeLabel || rootCity.name,
        items,
      },
    };
  }

  if (stage === 'address') {
    const addressLimit = Math.max(1, Math.min(50, Number(options.limit) || config.queryLimit));
    const requestedHouse = normalizeHouseToken(queryState.houseToken);
    const streetItems = await buildScopedStreetLookupItems(db, rootCity, rootScope, queryState, addressLimit);
    let addressItems = requestedHouse
      ? await buildScopedAddressLookupItems(db, rootCity, rootScope, queryState, addressLimit)
      : [];
    if (requestedHouse && !addressItems.length && streetItems.length) {
      const fallbackItems = [];
      for (const streetItem of streetItems.slice(0, 4)) {
        const streetRow = await getSearchRowBySourceKey(db, streetItem && streetItem.source_key);
        if (!streetRow) continue;
        fallbackItems.push(...await buildScopedHouseItemsByStreet(
          db,
          rootCity,
          rootScope,
          streetRow,
          requestedHouse,
          addressLimit
        ));
      }
      addressItems = dedupeItems(fallbackItems).slice(0, addressLimit);
    }
    const items = dedupeItems([...(addressItems || []), ...(streetItems || [])]).slice(0, addressLimit);
    return {
      ok: true,
      data: {
        query: String(options.query || '').trim(),
        city: {
          id: rootCity.id,
          code: rootCity.code,
          name: rootCity.name,
        },
        scope_label: rootScope.scopeLabel || rootCity.name,
        items,
      },
    };
  }

  let effectiveItems;
  if (streetScopedRow) {
    const rows = await fetchAddressCandidates(db, rootScope, queryState, {
      selectedRow: streetScopedRow,
      limit: options.limit,
    });
    const confirmedNearbyStreetKeys = await loadAddressBackedStreetKeys(db, rootScope, queryState);
    effectiveItems = collapseStreetSuggestionItems(
      filterSuggestionItemsByQuery(
        dedupeItems(rows.map(mapSearchRow))
          .filter((item) => !isNoisyStreetSuggestion(item, queryState))
          .filter((item) => String(item && item.object_type || '').trim() === 'street'),
        queryState,
        {
          rootLocality: rootCity.name,
          confirmedNearbyStreetKeys,
          requireNearbyAddressConfirmation: Boolean(rootScope.includesNearby),
        }
      )
    );
  } else {
    effectiveItems = await buildScopedStreetLookupItems(
      db,
      rootCity,
      rootScope,
      queryState,
      Math.max(1, Math.min(50, Number(options.limit) || config.queryLimit))
    );
  }
  return {
    ok: true,
    data: {
      query: String(options.query || '').trim(),
      city: {
        id: rootCity.id,
        code: rootCity.code,
        name: rootCity.name,
      },
      scope_label: rootScope.scopeLabel || rootCity.name,
      items: effectiveItems,
    },
  };
}

async function resolveAddress(db, payload = {}) {
  const addressStreet = String(payload.address_street || '').trim();
  const addressHouse = String(payload.address_house || '').trim();
  const address = String(payload.address || '').trim()
    || [addressStreet, addressHouse].filter(Boolean).join(', ');
  if (!address && !addressStreet) return { ok: false, error: 'ADDRESS_REQUIRED' };

  const rootCity = await resolveRootCity(db, {
    cityId: payload.city_id,
    cityCode: payload.city_code,
    cityName: payload.city,
  });
  if (!rootCity) return { ok: false, error: 'CITY_SELECTION_REQUIRED' };
  const rootScope = await resolveRootCityScope(db, rootCity);

  const queryState = addressStreet
    ? {
      normalizedQuery: normalizeText(addressStreet),
      normalizedCompact: compactText(addressStreet),
      houseToken: normalizeHouseToken(addressHouse),
      streetQuery: stripStreetNoise(addressStreet) || addressStreet,
    }
    : splitQuery(address);
  const selectedRow = payload.selected_source_key
    ? await getSearchRowBySourceKey(db, payload.selected_source_key)
    : null;
  const scopedSelectedRow = isRowInsideRootCityScope(selectedRow, rootScope) ? selectedRow : null;
  const selectedObjectType = String(payload.selected_object_type || '').trim();

  if (scopedSelectedRow && scopedSelectedRow.object_type === 'address' && selectedObjectType === 'address') {
    return {
      ok: true,
      data: {
        resolved: true,
        address_ref: scopedSelectedRow.source_key,
        selected_source_key: scopedSelectedRow.source_key,
        selected_object_type: 'address',
        typed_house_part: String(addressHouse || payload.typed_house_part || scopedSelectedRow.house_number || '').trim() || null,
        city: rootCity.name,
        normalized_display: scopedSelectedRow.display,
        context_display: scopedSelectedRow.context_display || scopedSelectedRow.locality_display,
        street_display: scopedSelectedRow.street_display || null,
        house_number: scopedSelectedRow.house_number || null,
        lat: toNumberOrNull(scopedSelectedRow.lat),
        lng: toNumberOrNull(scopedSelectedRow.lng),
      },
    };
  }

  const manualHousePart = String(addressHouse || payload.typed_house_part || queryState.houseToken || extractHouseToken(address) || '').trim();
  if (!manualHousePart) {
    return { ok: false, error: 'HOUSE_REQUIRED' };
  }

  const suggestions = await suggestAddresses(db, {
    stage: 'house',
    cityId: rootCity.id,
    query: manualHousePart,
    selectedSourceKey: payload.selected_source_key,
    limit: 10,
  });
  if (!suggestions.ok) return suggestions;

  const addressItems = (suggestions.data.items || []).filter((item) => item.object_type === 'address');
  if (!addressItems.length) {
    const manualScope = await resolveManualAddressScope(db, rootScope, queryState, scopedSelectedRow);
    if (!manualScope) {
      return { ok: false, error: 'ADDRESS_NOT_FOUND' };
    }
    return {
      ok: true,
      data: {
        resolved: true,
        address_ref: null,
        selected_source_key: manualScope.selected_source_key,
        selected_object_type: manualScope.selected_object_type,
        typed_house_part: manualHousePart,
        city: rootCity.name,
        normalized_display: buildManualAddressDisplay(payload, manualScope, manualHousePart),
        context_display: manualScope.context_display || rootCity.name,
        street_display: manualScope.street_display || addressStreet || null,
        house_number: manualHousePart,
        lat: toNumberOrNull(manualScope.lat),
        lng: toNumberOrNull(manualScope.lng),
      },
    };
  }

  const normalizedManualHouse = normalizeHouseToken(manualHousePart);
  const exactItems = addressItems.filter((item) => normalizeHouseToken(item.house || '') === normalizedManualHouse);
  if (exactItems.length > 1) {
    return {
      ok: true,
      data: {
        resolved: false,
        needs_choice: true,
        candidates: exactItems,
      },
    };
  }

  if (exactItems.length === 1) {
    const candidate = exactItems[0];
    return {
      ok: true,
      data: {
        resolved: true,
        address_ref: candidate.source_key,
        selected_source_key: candidate.source_key,
        selected_object_type: 'address',
        typed_house_part: manualHousePart,
        city: rootCity.name,
        normalized_display: candidate.display,
        context_display: candidate.context_display || candidate.city_name,
        street_display: candidate.street || null,
        house_number: candidate.house || manualHousePart,
        lat: toNumberOrNull(candidate.lat),
        lng: toNumberOrNull(candidate.lng),
      },
    };
  }

  const manualScope = await resolveManualAddressScope(db, rootScope, queryState, scopedSelectedRow);
  if (manualScope) {
    return {
      ok: true,
      data: {
        resolved: true,
        address_ref: null,
        selected_source_key: manualScope.selected_source_key,
        selected_object_type: manualScope.selected_object_type,
        typed_house_part: manualHousePart,
        city: rootCity.name,
        normalized_display: buildManualAddressDisplay(payload, manualScope, manualHousePart),
        context_display: manualScope.context_display || rootCity.name,
        street_display: manualScope.street_display || addressStreet || null,
        house_number: manualHousePart,
        lat: toNumberOrNull(manualScope.lat),
        lng: toNumberOrNull(manualScope.lng),
      },
    };
  }

  if (addressItems.length > 1) {
    return {
      ok: true,
      data: {
        resolved: false,
        needs_choice: true,
        candidates: addressItems,
      },
    };
  }

  return { ok: false, error: 'ADDRESS_NOT_FOUND' };
}

module.exports = {
  suggestCities,
  suggestAddresses,
  resolveAddress,
};
