const { geocodeStoreAddress } = require('./map-geocoder');
const { getTenantMapConfig } = require('./tenant-map-config');
const {
  normalizeLocalAddressText,
  resolveLocalityByInput,
  getLocalAddressIndexRowBySourceKey,
} = require('./local-address-index');
const {
  isAddressServiceConfigured,
  resolveAddress: resolveAddressThroughService,
} = require('./address-service-client');
const { buildDeliveryQuote } = require('./delivery-quote');

let customerAddressIdentityColumnsReady = false;
let ensureCustomerAddressIdentityColumnsPromise = null;

const customerAddressSelectFields = `
  id, tenant_id, store_id, customer_id, city, street, house, entrance, floor, apartment, comment,
  is_default, is_active, created_at, updated_at,
  address_ref, selected_object_type, resolved_city_source_key, address_context_locality, address_normalized_display,
  lat, lng, delivery_zone_id, delivery_store_id
`;

function normalizeCustomerCoordinateValue(value, axis = 'lat') {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const limit = axis === 'lat' ? 90 : 180;
  if (numeric < -limit || numeric > limit) return null;
  return Number(numeric.toFixed(7));
}

function parseCustomerCoordinate(value, axis = 'lat') {
  if (value === undefined) return { value: undefined };
  if (value === null || value === '') return { value: null };
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return { error: axis === 'lat' ? 'INVALID_LAT' : 'INVALID_LNG' };
  }
  const limit = axis === 'lat' ? 90 : 180;
  if (numeric < -limit || numeric > limit) {
    return { error: axis === 'lat' ? 'INVALID_LAT' : 'INVALID_LNG' };
  }
  return { value: Number(numeric.toFixed(7)) };
}

function normalizePositiveIntOrNull(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.round(numeric);
}

function buildCustomerStreetHouseLabel(helpers, streetValue, houseValue) {
  const street = helpers.strOrNull(streetValue);
  const house = helpers.strOrNull(houseValue);
  if (!street) return null;
  return [street, house].filter(Boolean).join(', ');
}

function buildCustomerLookupDisplay(
  helpers,
  cityValue,
  contextLocalityValue,
  streetValue,
  houseValue,
  fallbackValue = null
) {
  const city = helpers.strOrNull(cityValue);
  const contextLocality = helpers.strOrNull(contextLocalityValue);
  const baseLabel = buildCustomerStreetHouseLabel(helpers, streetValue, houseValue)
    || helpers.strOrNull(fallbackValue);
  if (!baseLabel) return null;
  if (!contextLocality) return baseLabel;
  if (normalizeLocalAddressText(contextLocality) === normalizeLocalAddressText(city)) return baseLabel;
  if (normalizeLocalAddressText(baseLabel).startsWith(normalizeLocalAddressText(contextLocality))) return baseLabel;
  return `${contextLocality}, ${baseLabel}`;
}

function serializeCustomerAddress(helpers, row) {
  const source = row && typeof row === 'object' ? row : {};
  return {
    ...source,
    address_ref: helpers.strOrNull(source.address_ref),
    selected_object_type: helpers.strOrNull(source.selected_object_type),
    resolved_city_source_key: helpers.strOrNull(source.resolved_city_source_key),
    address_context_locality: helpers.strOrNull(source.address_context_locality),
    address_normalized_display: helpers.strOrNull(source.address_normalized_display),
    lat: normalizeCustomerCoordinateValue(source.lat, 'lat'),
    lng: normalizeCustomerCoordinateValue(source.lng, 'lng'),
    delivery_zone_id: normalizePositiveIntOrNull(source.delivery_zone_id),
    delivery_store_id: normalizePositiveIntOrNull(source.delivery_store_id),
  };
}

async function ensureCustomerAddressIdentityColumns(db) {
  if (customerAddressIdentityColumnsReady) return true;
  if (ensureCustomerAddressIdentityColumnsPromise) return ensureCustomerAddressIdentityColumnsPromise;

  ensureCustomerAddressIdentityColumnsPromise = (async () => {
    const [columnRows] = await db.query('SHOW COLUMNS FROM cust_customer_addresses');
    const existing = new Set(
      (Array.isArray(columnRows) ? columnRows : [])
        .map((row) => String(row?.Field || '').trim())
        .filter(Boolean)
    );
    const requiredColumns = [
      { name: 'city', sql: "VARCHAR(255) NULL AFTER customer_id" },
      { name: 'address_ref', sql: "VARCHAR(255) NULL AFTER house" },
      { name: 'selected_object_type', sql: "VARCHAR(64) NULL AFTER address_ref" },
      { name: 'resolved_city_source_key', sql: "VARCHAR(255) NULL AFTER selected_object_type" },
      { name: 'address_context_locality', sql: "VARCHAR(255) NULL AFTER resolved_city_source_key" },
      { name: 'address_normalized_display', sql: "VARCHAR(512) NULL AFTER address_context_locality" },
      { name: 'lat', sql: "DECIMAL(10,7) NULL AFTER address_normalized_display" },
      { name: 'lng', sql: "DECIMAL(10,7) NULL AFTER lat" },
      { name: 'delivery_zone_id', sql: "BIGINT UNSIGNED NULL AFTER lng" },
      { name: 'delivery_store_id', sql: "BIGINT UNSIGNED NULL AFTER delivery_zone_id" },
    ];

    for (const column of requiredColumns) {
      if (existing.has(column.name)) continue;
      try {
        await db.query(`ALTER TABLE cust_customer_addresses ADD COLUMN \`${column.name}\` ${column.sql}`);
        existing.add(column.name);
      } catch (error) {
        if (String(error?.code || '') === 'ER_DUP_FIELDNAME') {
          existing.add(column.name);
          continue;
        }
        throw error;
      }
    }

    customerAddressIdentityColumnsReady = requiredColumns.every((column) => existing.has(column.name));
    return customerAddressIdentityColumnsReady;
  })()
    .catch((error) => {
      ensureCustomerAddressIdentityColumnsPromise = null;
      throw error;
    })
    .finally(() => {
      if (customerAddressIdentityColumnsReady) {
        ensureCustomerAddressIdentityColumnsPromise = null;
      }
    });

  return ensureCustomerAddressIdentityColumnsPromise;
}

function normalizeCustomerAddressPayload(helpers, source) {
  const body = source && typeof source === 'object' ? source : {};
  const latResult = parseCustomerCoordinate(body.lat, 'lat');
  if (latResult.error) return { ok: false, error: latResult.error };
  const lngResult = parseCustomerCoordinate(body.lng, 'lng');
  if (lngResult.error) return { ok: false, error: lngResult.error };

  const city = helpers.strOrNull(body.city);
  const street = String(body.street || '').trim();
  const house = String(body.house || '').trim();
  const addressContextLocality = helpers.strOrNull(body.address_context_locality || body.context_locality);
  const lookupDisplay = buildCustomerLookupDisplay(
    helpers,
    city,
    addressContextLocality,
    street,
    house,
    body.address_normalized_display || body.address
  );
  const lat = latResult.value === undefined ? null : latResult.value;
  const lng = lngResult.value === undefined ? null : lngResult.value;

  return {
    ok: true,
    data: {
      city,
      street,
      house,
      entrance: helpers.strOrNull(body.entrance),
      floor: helpers.strOrNull(body.floor),
      apartment: helpers.strOrNull(body.apartment),
      comment: helpers.strOrNull(body.comment),
      address_ref: helpers.strOrNull(body.address_ref || body.selected_source_key),
      selected_object_type: helpers.strOrNull(body.selected_object_type),
      resolved_city_source_key: helpers.strOrNull(body.resolved_city_source_key),
      address_context_locality: addressContextLocality,
      address_normalized_display: lookupDisplay,
      lat,
      lng,
      delivery_zone_id: lat != null && lng != null ? normalizePositiveIntOrNull(body.delivery_zone_id) : null,
      delivery_store_id: lat != null && lng != null ? normalizePositiveIntOrNull(body.delivery_store_id) : null,
    },
  };
}

async function loadCustomerAddressById({ db, helpers, tenantId, customerId, addressId }) {
  if (!tenantId || !customerId || !addressId) return null;
  await ensureCustomerAddressIdentityColumns(db);
  const [rows] = await db.query(
    `SELECT ${customerAddressSelectFields}
       FROM cust_customer_addresses
      WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
      LIMIT 1`,
    [tenantId, customerId, addressId]
  );
  return rows && rows[0] ? serializeCustomerAddress(helpers, rows[0]) : null;
}

async function resolveCustomerAddressPayload({
  db,
  helpers,
  tenantId,
  storeId,
  payload = {},
  storeAddressMapEnabled,
}) {
  const normalizedResult = normalizeCustomerAddressPayload(helpers, payload);
  if (!normalizedResult.ok) return normalizedResult;

  const data = normalizedResult.data;
  let city = data.city;
  let street = data.street;
  let house = data.house;
  let addressRef = data.address_ref;
  let selectedObjectType = data.selected_object_type;
  let resolvedCitySourceKey = data.resolved_city_source_key;
  let contextLocality = data.address_context_locality;
  let normalizedDisplay = data.address_normalized_display;
  let lat = data.lat;
  let lng = data.lng;

  if (!resolvedCitySourceKey && city) {
    const resolvedCity = await resolveLocalityByInput(city, { rootOnly: true });
    resolvedCitySourceKey = resolvedCity && resolvedCity.source_key ? String(resolvedCity.source_key).trim() : null;
  }

  if (addressRef) {
    const selectedRow = await getLocalAddressIndexRowBySourceKey(addressRef);
    if (selectedRow) {
      if (!city) city = helpers.strOrNull(payload.city) || helpers.strOrNull(selectedRow.locality_name);
      if (!contextLocality) contextLocality = helpers.strOrNull(selectedRow.locality_name);
      if (!street) street = helpers.strOrNull(selectedRow.street_name) || helpers.strOrNull(selectedRow.label);
      if (!house) house = helpers.strOrNull(selectedRow.house_number);
      if (!normalizedDisplay) {
        normalizedDisplay = buildCustomerLookupDisplay(
          helpers,
          city,
          contextLocality,
          street,
          house,
          selectedRow.label || selectedRow.full_address
        );
      }
      if (lat == null) lat = normalizeCustomerCoordinateValue(selectedRow.lat, 'lat');
      if (lng == null) lng = normalizeCustomerCoordinateValue(selectedRow.lng, 'lng');
      if (!selectedObjectType) selectedObjectType = helpers.strOrNull(selectedRow.object_type) || 'address';
    }
  }

  if (isAddressServiceConfigured() && (addressRef || normalizedDisplay || buildCustomerStreetHouseLabel(helpers, street, house))) {
    try {
      const serviceResult = await resolveAddressThroughService({
        city,
        city_code: resolvedCitySourceKey ? String(resolvedCitySourceKey).replace(/^root-city:/, '') : null,
        address: normalizedDisplay || buildCustomerStreetHouseLabel(helpers, street, house),
        address_street: street,
        address_house: house,
        selected_source_key: addressRef,
        selected_object_type: selectedObjectType,
        selected_context_locality: contextLocality,
        raw_input: normalizedDisplay || buildCustomerStreetHouseLabel(helpers, street, house),
        confirm_normalized: true,
      });
      if (serviceResult && serviceResult.ok && serviceResult.data) {
        const serviceData = serviceResult.data;
        city = helpers.strOrNull(city) || helpers.strOrNull(serviceData.city_name) || city;
        street = helpers.strOrNull(serviceData.street_display) || street;
        house = helpers.strOrNull(serviceData.house_number) || house;
        contextLocality = helpers.strOrNull(serviceData.context_display) || contextLocality || city;
        normalizedDisplay = buildCustomerLookupDisplay(
          helpers,
          city,
          contextLocality,
          street,
          house,
          serviceData.normalized_display || normalizedDisplay
        );
        addressRef = helpers.strOrNull(serviceData.address_ref) || addressRef;
        selectedObjectType = helpers.strOrNull(serviceData.selected_object_type) || selectedObjectType || 'address';
        if (lat == null) lat = normalizeCustomerCoordinateValue(serviceData.lat, 'lat');
        if (lng == null) lng = normalizeCustomerCoordinateValue(serviceData.lng, 'lng');
      }
    } catch (error) {
      console.warn('resolve customer address via service failed:', error);
    }
  }

  if ((lat == null || lng == null) && (normalizedDisplay || (street && house))) {
    const geocodeQuery = [contextLocality || city, normalizedDisplay || buildCustomerStreetHouseLabel(helpers, street, house)]
      .filter(Boolean)
      .join(', ');
    if (geocodeQuery) {
      const tenantMapConfig = await getTenantMapConfig(db, tenantId);
      const geocode = await geocodeStoreAddress(geocodeQuery, { sourceState: tenantMapConfig || {} });
      if (geocode && geocode.ok && geocode.data && geocode.data.item) {
        lat = normalizeCustomerCoordinateValue(geocode.data.item.lat, 'lat');
        lng = normalizeCustomerCoordinateValue(geocode.data.item.lng, 'lng');
        if (!city) city = helpers.strOrNull(geocode.data.item.city_name) || city;
      }
    }
  }

  if (!street) {
    return { ok: false, error: 'STREET_REQUIRED' };
  }
  if (!house) {
    return { ok: false, error: 'HOUSE_REQUIRED' };
  }

  const quote = await buildDeliveryQuote({
    db,
    tenantId,
    storeId: Number(storeId || 0) > 0 ? Number(storeId) : 1,
    subtotal: payload && payload.subtotal != null ? Number(payload.subtotal || 0) : 0,
    address: { lat, lng },
    storeAddressMapEnabled,
  });

  return {
    ok: true,
    data: {
      city: city || null,
      street,
      house,
      context_locality: contextLocality || null,
      address_ref: addressRef || null,
      selected_object_type: selectedObjectType || null,
      resolved_city_source_key: resolvedCitySourceKey || null,
      address_normalized_display: buildCustomerLookupDisplay(helpers, city, contextLocality, street, house, normalizedDisplay),
      lat,
      lng,
      delivery_zone_id: quote.delivery_zone_id,
      delivery_zone_name: quote.delivery_zone_name,
      delivery_store_id: quote.delivery_store_id,
      delivery_cost: quote.delivery_cost,
      min_order_amount: quote.min_order_amount,
      free_delivery_from: quote.free_delivery_from,
      eta_minutes: quote.eta_minutes,
      source: quote.source,
      quote_source: quote.source,
    },
  };
}

module.exports = {
  customerAddressSelectFields,
  buildCustomerLookupDisplay,
  buildCustomerStreetHouseLabel,
  ensureCustomerAddressIdentityColumns,
  loadCustomerAddressById,
  normalizeCustomerAddressPayload,
  normalizeCustomerCoordinateValue,
  normalizePositiveIntOrNull,
  parseCustomerCoordinate,
  resolveCustomerAddressPayload,
  serializeCustomerAddress,
};
