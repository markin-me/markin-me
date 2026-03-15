const {
  normalizeLocalAddressText,
} = require('./local-address-index');

const ADDRESS_SERVICE_BASE_URL = String(process.env.ADDRESS_SERVICE_URL || '').trim().replace(/\/+$/, '');
const ADDRESS_SERVICE_TOKEN = String(process.env.ADDRESS_SERVICE_TOKEN || '').trim();
const ADDRESS_SERVICE_TIMEOUT_MS = Math.max(1000, Number(process.env.ADDRESS_SERVICE_TIMEOUT_MS || 4500) || 4500);

function isAddressServiceConfigured() {
  return Boolean(ADDRESS_SERVICE_BASE_URL);
}

function buildUrl(pathname, params = {}) {
  const url = new URL(`${ADDRESS_SERVICE_BASE_URL}${pathname}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

async function requestAddressService(pathname, options = {}) {
  if (!isAddressServiceConfigured()) {
    return { ok: false, error: 'ADDRESS_SERVICE_NOT_CONFIGURED' };
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ADDRESS_SERVICE_TIMEOUT_MS);
  try {
    const method = String(options.method || 'GET').toUpperCase();
    const url = method === 'GET'
      ? buildUrl(pathname, options.query)
      : new URL(`${ADDRESS_SERVICE_BASE_URL}${pathname}`);
    const headers = {
      Accept: 'application/json',
    };
    if (ADDRESS_SERVICE_TOKEN) {
      headers['x-address-service-token'] = ADDRESS_SERVICE_TOKEN;
    }
    let body;
    if (method !== 'GET' && options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        error: payload && payload.error ? payload.error : 'ADDRESS_SERVICE_UPSTREAM_ERROR',
        data: payload && payload.data ? payload.data : null,
        status: response.status,
      };
    }
    return payload && typeof payload === 'object'
      ? payload
      : { ok: false, error: 'ADDRESS_SERVICE_BAD_PAYLOAD' };
  } catch (error) {
    return {
      ok: false,
      error: error && error.name === 'AbortError'
        ? 'ADDRESS_SERVICE_TIMEOUT'
        : 'ADDRESS_SERVICE_UNAVAILABLE',
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function mapCitySuggestItemsToLegacy(items) {
  return (Array.isArray(items) ? items : []).map((item) => ({
    label: String(item && (item.label || item.value || item.display) || '').trim(),
    value: String(item && (item.value || item.label || item.display) || '').trim(),
    object_type: 'city',
    stage: 'city',
    source_key: String(item && item.source_key || '').trim(),
    city_name: String(item && (item.city_name || item.value || item.label || item.display) || '').trim(),
    context_locality: String(item && (item.context_display || item.city_name || item.value || item.label) || '').trim(),
    normalized_city: normalizeLocalAddressText(item && (item.city_name || item.value || item.label || item.display)),
    normalized_address: '',
    full_address: String(item && (item.display || item.value || item.label) || '').trim(),
    lat: item && item.lat !== undefined && item.lat !== null ? Number(item.lat) : null,
    lng: item && item.lng !== undefined && item.lng !== null ? Number(item.lng) : null,
    confidence: Number(item && item.confidence || 0) || 0,
  })).filter((item) => item.city_name);
}

function mapAddressSuggestItemsToLegacy(items, stage = 'street') {
  return (Array.isArray(items) ? items : []).map((item) => {
    const objectType = String(item && item.object_type || '').trim() === 'context'
      ? 'context-locality'
      : String(item && item.object_type || '').trim();
    const rawValue = String(item && (item.value || item.label || item.display) || '').trim();
    const cityName = String(item && item.city_name || '').trim();
    const contextLocality = String(item && (item.context_locality || item.context_display || cityName) || '').trim();
    const streetName = String(item && (item.street || item.street_name) || '').trim();
    const houseNumber = String(item && (item.house || item.house_number) || '').trim();
    const shortAddress = [streetName || rawValue, houseNumber].filter(Boolean).join(', ') || rawValue;
    const fullAddressParts = [];
    if (cityName) fullAddressParts.push(cityName);
    if (
      contextLocality
      && normalizeLocalAddressText(contextLocality) !== normalizeLocalAddressText(cityName)
    ) {
      fullAddressParts.push(contextLocality);
    }
    fullAddressParts.push(shortAddress);
    const fullAddress = fullAddressParts.filter(Boolean).join(', ');
    const value = stage === 'house'
      ? (houseNumber || rawValue)
      : (stage === 'address' ? fullAddress : (streetName || rawValue));
    return {
      label: stage === 'address' ? shortAddress : value,
      value,
      object_type: objectType || 'address',
      stage: stage === 'house' ? 'house' : 'address',
      source_key: String(item && item.source_key || '').trim(),
      city_name: cityName,
      context_locality: contextLocality,
      normalized_city: normalizeLocalAddressText(cityName),
      normalized_address: normalizeLocalAddressText(stage === 'address' ? fullAddress : value),
      street_name: streetName,
      house_number: houseNumber,
      full_address: fullAddress,
      lat: item && item.lat !== undefined ? Number(item.lat) : null,
      lng: item && item.lng !== undefined ? Number(item.lng) : null,
      confidence: Number(item && item.confidence || 0) || 0,
    };
  }).filter((item) => item.value);
}

async function suggestCities(query, options = {}) {
  const result = await requestAddressService('/internal/address/city-suggest', {
    method: 'GET',
    query: {
      q: query,
      limit: options.limit,
    },
  });
  if (!result.ok) return result;
  return {
    ok: true,
    data: {
      query: String(query || '').trim(),
      scope: 'address-service',
      scope_label: 'Адресный сервис',
      items: mapCitySuggestItemsToLegacy(result.data && result.data.items),
    },
  };
}

async function suggestAddresses(query, options = {}) {
  const stage = String(options.stage || 'street').trim().toLowerCase() || 'street';
  const result = await requestAddressService('/internal/address/suggest', {
    method: 'GET',
    query: {
      stage,
      q: query,
      city: options.city,
      city_id: options.cityId,
      city_code: options.cityCode,
      selected_source_key: options.selectedSourceKey,
      limit: options.limit,
    },
  });
  if (!result.ok) return result;
  const cityName = result.data && result.data.city && result.data.city.name
    ? result.data.city.name
    : String(options.city || '').trim();
  return {
    ok: true,
    data: {
      query: String(query || '').trim(),
      scope: 'address-service',
      scope_label: result.data && result.data.scope_label
        ? String(result.data.scope_label).trim()
        : (cityName ? `Адресный сервис: ${cityName}` : 'Адресный сервис'),
      items: mapAddressSuggestItemsToLegacy(result.data && result.data.items, stage),
    },
  };
}

async function resolveAddress(payload) {
  return requestAddressService('/internal/address/resolve', {
    method: 'POST',
    body: payload,
  });
}

module.exports = {
  isAddressServiceConfigured,
  suggestCities,
  suggestAddresses,
  resolveAddress,
};
