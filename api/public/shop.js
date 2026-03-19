const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { sendNewOrderNotification } = require('../telegramNotifications');
const { sendOrderToPrintBot } = require('../printPush');
const {
  getEffectiveTelegramBotConfig,
} = require('../../data/system-settings');
const { geocodeStoreAddress } = require('../../data/map-geocoder');
const { getTenantMapConfig } = require('../../data/tenant-map-config');
const {
  normalizeLocalAddressText,
  resolveLocalityByInput,
  getLocalAddressIndexRowBySourceKey,
  searchLocalAddressSuggest,
} = require('../../data/local-address-index');
const {
  isAddressServiceConfigured,
  suggestCities: suggestAddressServiceCities,
  suggestAddresses: suggestAddressServiceAddresses,
  resolveAddress: resolveAddressThroughService,
} = require('../../data/address-service-client');
const {
  buildDeliveryQuote,
  loadDefaultDeliverySettings,
} = require('../../data/delivery-quote');
const {
  customerAddressSelectFields: sharedCustomerAddressSelectFields,
  ensureCustomerAddressIdentityColumns: ensureSharedCustomerAddressIdentityColumns,
  loadCustomerAddressById: loadSharedCustomerAddressById,
  normalizeCustomerAddressPayload: normalizeSharedCustomerAddressPayload,
  resolveCustomerAddressPayload: resolveSharedCustomerAddressPayload,
  serializeCustomerAddress: serializeSharedCustomerAddress,
} = require('../../data/customer-address');
const discountHelpers = require('../helpers/discounts');
const {
  makeLinkToken,
  buildMaxDeepLink,
  getTenantMaxBotId,
  getTenantMaxBotToken,
  sendMaxMessage,
  confirmMaxLink,
  notifyCustomerLogin,
} = require('../maxIntegration');
const {
  applyStockDeductionForOrderItems,
  checkStockAvailabilityForOrderItems,
} = require('../helpers/orderStock');
const TELEGRAM_API = 'https://api.telegram.org/bot';

module.exports = function makePublicShopRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();
  let orderDeliveryTypeColumnsReady = false;
  let ensureOrderDeliveryTypeColumnsPromise = null;
  let discountProductConfigColumnReady = false;
  let ensureDiscountProductConfigColumnPromise = null;
  let discountHideInBenefitsColumnReady = false;
  let ensureDiscountHideInBenefitsColumnPromise = null;
  let customerAddressIdentityColumnsReady = false;
  let ensureCustomerAddressIdentityColumnsPromise = null;
  let customerBenefitPromoStorageReady = false;
  let ensureCustomerBenefitPromoStoragePromise = null;
  const PUBLIC_CACHE_TTL_MS = Object.freeze({
    categories: 30000,
    cartUpsell: 15000,
    products: 15000,
    productsBatchCategories: 30000,
    productsBatchIngredients: 30000,
    productsBatchVariants: 30000,
    productsBatchOptionAssignments: 30000,
    productById: 15000,
    comboById: 8000,
    productIngredients: 30000,
    productVariants: 30000,
    productOptionAssignments: 30000,
    optionGroupById: 8000,
  });
  const publicResponseCache = new Map();
  const publicResponseInflight = new Map();
  const PUBLIC_CACHE_MAX_KEYS = 2000;

  async function ensureOrderDeliveryTypeColumns() {
    if (orderDeliveryTypeColumnsReady) return true;
    if (ensureOrderDeliveryTypeColumnsPromise) return ensureOrderDeliveryTypeColumnsPromise;

    ensureOrderDeliveryTypeColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM order_delivery_types');
      const existing = new Set((columnRows || []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      const requiredColumns = [
        {
          name: 'require_client_data',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'РћР±СЏР·Р°С‚РµР»СЊРЅС‹ Р»Рё РґР°РЅРЅС‹Рµ РєР»РёРµРЅС‚Р° (РёРјСЏ/С‚РµР»РµС„РѕРЅ)'",
        },
        {
          name: 'show_on_site',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'РџРѕРєР°Р·С‹РІР°С‚СЊ СЃРїРѕСЃРѕР± РЅР° СЃР°Р№С‚Рµ'",
        },
      ];

      for (const column of requiredColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE order_delivery_types ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      orderDeliveryTypeColumnsReady = requiredColumns.every((column) => existing.has(column.name));
      return orderDeliveryTypeColumnsReady;
    })()
      .catch((err) => {
        ensureOrderDeliveryTypeColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (orderDeliveryTypeColumnsReady) {
          ensureOrderDeliveryTypeColumnsPromise = null;
        }
      });

    return ensureOrderDeliveryTypeColumnsPromise;
  }

  async function ensureDiscountProductConfigColumn() {
    if (discountProductConfigColumnReady) return true;
    if (ensureDiscountProductConfigColumnPromise) return ensureDiscountProductConfigColumnPromise;

    ensureDiscountProductConfigColumnPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM mkt_discount_products');
      const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      if (!existing.has('product_config_json')) {
        try {
          await db.query('ALTER TABLE mkt_discount_products ADD COLUMN `product_config_json` LONGTEXT NULL AFTER `combo_id`');
          existing.add('product_config_json');
        } catch (err) {
          if (String(err?.code || '') !== 'ER_DUP_FIELDNAME') throw err;
          existing.add('product_config_json');
        }
      }
      discountProductConfigColumnReady = existing.has('product_config_json');
      return discountProductConfigColumnReady;
    })()
      .catch((err) => {
        ensureDiscountProductConfigColumnPromise = null;
        throw err;
      })
      .finally(() => {
        if (discountProductConfigColumnReady) {
          ensureDiscountProductConfigColumnPromise = null;
        }
      });

    return ensureDiscountProductConfigColumnPromise;
  }

  async function ensureDiscountHideInBenefitsColumn() {
    if (discountHideInBenefitsColumnReady) return true;
    if (ensureDiscountHideInBenefitsColumnPromise) return ensureDiscountHideInBenefitsColumnPromise;

    ensureDiscountHideInBenefitsColumnPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM mkt_discounts');
      const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      if (!existing.has('hide_in_benefits')) {
        try {
          await db.query('ALTER TABLE mkt_discounts ADD COLUMN `hide_in_benefits` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`');
          existing.add('hide_in_benefits');
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add('hide_in_benefits');
          } else {
            console.warn('hide_in_benefits column is not available for public shop:', err?.code || err?.message || err);
          }
        }
      }
      discountHideInBenefitsColumnReady = existing.has('hide_in_benefits');
      return discountHideInBenefitsColumnReady;
    })()
      .catch((err) => {
        ensureDiscountHideInBenefitsColumnPromise = null;
        throw err;
      })
      .finally(() => {
        ensureDiscountHideInBenefitsColumnPromise = null;
      });

    return ensureDiscountHideInBenefitsColumnPromise;
  }

  const customerAddressSelectFields = `
    id, tenant_id, store_id, customer_id, city, street, house, entrance, floor, apartment, comment,
    is_default, is_active, created_at, updated_at,
    address_ref, selected_object_type, resolved_city_source_key, address_context_locality, address_normalized_display,
    lat, lng, delivery_zone_id, delivery_store_id
  `;

  function isStoreAddressMapModeEnabled(config = null) {
    if (config && typeof config === 'object') {
      return Boolean(config.store_address_map_enabled);
    }
    return false;
  }

  function normalizePublicCoordinateValue(value, axis = 'lat') {
    if (value == null || value === '') return null;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    const limit = axis === 'lat' ? 90 : 180;
    if (numeric < -limit || numeric > limit) return null;
    return Number(numeric.toFixed(7));
  }

  function parsePublicCoordinate(value, axis = 'lat') {
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

  function buildCustomerStreetHouseLabel(streetValue, houseValue) {
    const street = helpers.strOrNull(streetValue);
    const house = helpers.strOrNull(houseValue);
    if (!street) return null;
    return [street, house].filter(Boolean).join(', ');
  }

  function buildCustomerLookupDisplay(cityValue, contextLocalityValue, streetValue, houseValue, fallbackValue = null) {
    const city = helpers.strOrNull(cityValue);
    const contextLocality = helpers.strOrNull(contextLocalityValue);
    const baseLabel = buildCustomerStreetHouseLabel(streetValue, houseValue) || helpers.strOrNull(fallbackValue);
    if (!baseLabel) return null;
    if (!contextLocality) return baseLabel;
    if (normalizeLocalAddressText(contextLocality) === normalizeLocalAddressText(city)) return baseLabel;
    if (normalizeLocalAddressText(baseLabel).startsWith(normalizeLocalAddressText(contextLocality))) return baseLabel;
    return `${contextLocality}, ${baseLabel}`;
  }

  function serializeCustomerAddress(row) {
    const source = row && typeof row === 'object' ? row : {};
    return {
      ...source,
      address_ref: helpers.strOrNull(source.address_ref),
      selected_object_type: helpers.strOrNull(source.selected_object_type),
      resolved_city_source_key: helpers.strOrNull(source.resolved_city_source_key),
      address_context_locality: helpers.strOrNull(source.address_context_locality),
      address_normalized_display: helpers.strOrNull(source.address_normalized_display),
      lat: normalizePublicCoordinateValue(source.lat, 'lat'),
      lng: normalizePublicCoordinateValue(source.lng, 'lng'),
      delivery_zone_id: normalizePositiveIntOrNull(source.delivery_zone_id),
      delivery_store_id: normalizePositiveIntOrNull(source.delivery_store_id),
    };
  }

  async function ensureCustomerAddressIdentityColumns() {
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

  function normalizeCustomerAddressPayload(source) {
    const body = source && typeof source === 'object' ? source : {};
    const latResult = parsePublicCoordinate(body.lat, 'lat');
    if (latResult.error) return { ok: false, error: latResult.error };
    const lngResult = parsePublicCoordinate(body.lng, 'lng');
    if (lngResult.error) return { ok: false, error: lngResult.error };

    const city = helpers.strOrNull(body.city);
    const street = String(body.street || '').trim();
    const house = String(body.house || '').trim();
    const addressContextLocality = helpers.strOrNull(body.address_context_locality || body.context_locality);
    const lookupDisplay = buildCustomerLookupDisplay(
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

  async function loadCustomerAddressById(tenantId, customerId, addressId) {
    if (!tenantId || !customerId || !addressId) return null;
    await ensureCustomerAddressIdentityColumns();
    const [rows] = await db.query(
      `SELECT ${customerAddressSelectFields}
       FROM cust_customer_addresses
       WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
       LIMIT 1`,
      [tenantId, customerId, addressId]
    );
    return rows && rows[0] ? serializeCustomerAddress(rows[0]) : null;
  }

  async function resolvePublicAddressPayload(tenantId, storeId, payload = {}) {
    const normalizedResult = normalizeCustomerAddressPayload(payload);
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
          normalizedDisplay = buildCustomerLookupDisplay(city, contextLocality, street, house, selectedRow.label || selectedRow.full_address);
        }
        if (lat == null) lat = normalizePublicCoordinateValue(selectedRow.lat, 'lat');
        if (lng == null) lng = normalizePublicCoordinateValue(selectedRow.lng, 'lng');
        if (!selectedObjectType) selectedObjectType = helpers.strOrNull(selectedRow.object_type) || 'address';
      }
    }

    if (isAddressServiceConfigured() && (addressRef || normalizedDisplay || buildCustomerStreetHouseLabel(street, house))) {
      try {
        const serviceResult = await resolveAddressThroughService({
          city,
          city_code: resolvedCitySourceKey ? String(resolvedCitySourceKey).replace(/^root-city:/, '') : null,
          address: normalizedDisplay || buildCustomerStreetHouseLabel(street, house),
          address_street: street,
          address_house: house,
          selected_source_key: addressRef,
          selected_object_type: selectedObjectType,
          selected_context_locality: contextLocality,
          raw_input: normalizedDisplay || buildCustomerStreetHouseLabel(street, house),
          confirm_normalized: true,
        });
        if (serviceResult && serviceResult.ok && serviceResult.data) {
          const serviceData = serviceResult.data;
          city = helpers.strOrNull(city) || helpers.strOrNull(serviceData.city_name) || city;
          street = helpers.strOrNull(serviceData.street_display) || street;
          house = helpers.strOrNull(serviceData.house_number) || house;
          contextLocality = helpers.strOrNull(serviceData.context_display) || contextLocality || city;
          normalizedDisplay = buildCustomerLookupDisplay(
            city,
            contextLocality,
            street,
            house,
            serviceData.normalized_display || normalizedDisplay
          );
          addressRef = helpers.strOrNull(serviceData.address_ref) || addressRef;
          selectedObjectType = helpers.strOrNull(serviceData.selected_object_type) || selectedObjectType || 'address';
          if (lat == null) lat = normalizePublicCoordinateValue(serviceData.lat, 'lat');
          if (lng == null) lng = normalizePublicCoordinateValue(serviceData.lng, 'lng');
        }
      } catch (error) {
        console.warn('resolve public address via service failed:', error);
      }
    }

    if ((lat == null || lng == null) && (normalizedDisplay || (street && house))) {
      const geocodeQuery = [contextLocality || city, normalizedDisplay || buildCustomerStreetHouseLabel(street, house)]
        .filter(Boolean)
        .join(', ');
      if (geocodeQuery) {
        const tenantMapConfig = await getTenantMapConfig(db, tenantId);
        const geocode = await geocodeStoreAddress(geocodeQuery, { sourceState: tenantMapConfig || {} });
        if (geocode && geocode.ok && geocode.data && geocode.data.item) {
          lat = normalizePublicCoordinateValue(geocode.data.item.lat, 'lat');
          lng = normalizePublicCoordinateValue(geocode.data.item.lng, 'lng');
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
      storeId,
      subtotal: payload && payload.subtotal != null ? Number(payload.subtotal || 0) : 0,
      address: { lat, lng },
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
        address_normalized_display: buildCustomerLookupDisplay(city, contextLocality, street, house, normalizedDisplay),
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

  // ------------------------------
  // Upload: customer avatar
  // POST /api/public/me/photo (field: photo|avatar)
  // ------------------------------
  const avatarStorage = multer.diskStorage({
    destination(req, file, cb) {
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      cb(null, name);
    }
  });

  const avatarUpload = multer({
    storage: avatarStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  // ------------------------------
  // small utils (local)
  // ------------------------------
  function safeJsonArray(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean);
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function getThumbUrl(url) {
    if (!url) return null;
    if (typeof helpers.getThumbUrlIfExists === 'function') {
      return helpers.getThumbUrlIfExists(url);
    }
    return null;
  }

  async function isTenantMaxLoginEnabled(tenantId) {
    const [rows] = await db.query(
      'SELECT max_login_enabled FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) return false;
    return Number(rows[0].max_login_enabled || 0) === 1;
  }

  async function isTenantTgLoginEnabled(tenantId) {
    const [rows] = await db.query(
      'SELECT tg_login_enabled FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    if (!rows.length) return false;
    return Number(rows[0].tg_login_enabled || 0) === 1;
  }

  async function sendTenantTelegramText({ tenantId, telegramUserId, text }) {
    const [rows] = await db.query(
      'SELECT telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    const botToken = String(rows[0]?.telegram_bot_token || '').trim();
    if (!botToken) throw new Error('TG_BOT_NOT_CONFIGURED');
    if (!telegramUserId) throw new Error('TG_USER_NOT_LINKED');

    const res = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: String(telegramUserId),
        text: String(text || ''),
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new Error(`TG_SEND_FAILED:${data?.description || `HTTP_${res.status}`}`);
    }
    return true;
  }

  function attachProductThumbs(row) {
    const photos = Array.isArray(row?.photos) ? row.photos : [];
    const main = photos[0] || null;
    row.photo_thumb = getThumbUrl(main);
    return row;
  }

  function attachComboThumbs(combo) {
    combo.image_thumb = getThumbUrl(combo.image_url);
    if (Array.isArray(combo.grid_photos)) {
      combo.grid_photos_thumb = combo.grid_photos.map((u) => getThumbUrl(u));
    }
    return combo;
  }

  function publishStockChanged(tenantId, storeId, payload = {}) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== 'function') return;
      ordersEvents.publish(tenantId, storeId, 'stock.changed', {
        tenant_id: Number(tenantId),
        store_id: Number(storeId),
        ...payload,
      });
    } catch (err) {
      console.error('publishStockChanged error:', err);
    }
  }

  function str(v) {
    return v === undefined || v === null ? '' : String(v);
  }

  function stableCachePart(value) {
    if (Array.isArray(value)) return value.map((v) => stableCachePart(v));
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).sort().forEach((k) => {
        out[k] = stableCachePart(value[k]);
      });
      return out;
    }
    return value;
  }

  function makePublicCacheKey(prefix, parts) {
    return `${String(prefix || 'public')}::${JSON.stringify(stableCachePart(parts || {}))}`;
  }

  function getPublicCache(key) {
    const hit = publicResponseCache.get(key);
    if (!hit) return null;
    if (hit.expiresAt <= Date.now()) {
      publicResponseCache.delete(key);
      return null;
    }
    return hit.data;
  }

  function prunePublicCacheIfNeeded() {
    if (publicResponseCache.size <= PUBLIC_CACHE_MAX_KEYS) return;
    const entries = Array.from(publicResponseCache.entries());
    entries.sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0));
    const overflow = publicResponseCache.size - PUBLIC_CACHE_MAX_KEYS;
    for (let i = 0; i < overflow; i += 1) {
      publicResponseCache.delete(entries[i][0]);
    }
  }

  function setPublicCache(key, data, ttlMs) {
    const ttl = Math.max(1000, Number(ttlMs || 0));
    publicResponseCache.set(key, {
      data,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttl,
    });
    prunePublicCacheIfNeeded();
  }

  async function loadPublicCachedPayload(cacheKey, ttlMs, loader) {
    const cached = getPublicCache(cacheKey);
    if (cached) return { payload: cached, cacheState: 'HIT' };

    const inflight = publicResponseInflight.get(cacheKey);
    if (inflight) {
      const payload = await inflight;
      return { payload, cacheState: 'WAIT' };
    }

    const task = (async () => {
      const fresh = await loader();
      setPublicCache(cacheKey, fresh, ttlMs);
      return fresh;
    })().finally(() => {
      publicResponseInflight.delete(cacheKey);
    });

    publicResponseInflight.set(cacheKey, task);
    const payload = await task;
    return { payload, cacheState: 'MISS' };
  }

  const CHAT_ASSISTANT_GENDER_MALE = 'm';
  const CHAT_ASSISTANT_GENDER_FEMALE = 'f';
  const DEFAULT_CHAT_ASSISTANT_GENDER = CHAT_ASSISTANT_GENDER_MALE;
  const DEFAULT_CHAT_ASSISTANT_NAME = '\u041d\u044f\u043c-\u041d\u044f\u043c';
  const DEFAULT_CHAT_WELCOME_MESSAGE =
    '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
    '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
    '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
    '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
    '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
  const DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE =
    '\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u0430\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u0446\u0430 \u041d\u044f\u043c-\u041d\u044f\u043c!\n' +
    '\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' +
    '\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 ' +
    '\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 ' +
    '\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.';
  const CHAT_QUICK_ORDER_ID = 'order';
  const CHAT_QUICK_ORDER_QUESTION = '\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?';
  const DEFAULT_CHAT_QUICK_QUESTION_ITEMS = Object.freeze([
    {
      id: CHAT_QUICK_ORDER_ID,
      type: 'order',
      question: CHAT_QUICK_ORDER_QUESTION,
      answer: '',
      enabled: true,
    },
    {
      id: 'quality',
      type: 'custom',
      question: '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430',
      answer:
        '\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. ' +
        '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, ' +
        '\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.',
      enabled: true,
    },
    {
      id: 'completeness',
      type: 'custom',
      question: '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430',
      answer:
        '\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, ' +
        '\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.',
      enabled: true,
    },
    {
      id: 'other',
      type: 'custom',
      question: '\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441',
      answer:
        '\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.',
      enabled: true,
    },
  ]);
  const CHAT_QUICK_DEFAULT_ANSWER_BY_KEY = Object.freeze({
    '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430':
      '\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. ' +
      '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, ' +
      '\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.',
    '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430':
      '\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, ' +
      '\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.',
    '\u0434\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441':
      '\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.',
  });
  const CHAT_QUICK_QUESTIONS_MAX = 6;

  function normalizeAssistantGender(value) {
    const raw = str(value).trim().toLowerCase();
    if (raw === CHAT_ASSISTANT_GENDER_FEMALE || raw === 'f' || raw === 'female' || raw === '\u0436') {
      return CHAT_ASSISTANT_GENDER_FEMALE;
    }
    return DEFAULT_CHAT_ASSISTANT_GENDER;
  }

  function getDefaultWelcomeMessageByGender(gender) {
    return normalizeAssistantGender(gender) === CHAT_ASSISTANT_GENDER_FEMALE
      ? DEFAULT_CHAT_WELCOME_MESSAGE_FEMALE
      : DEFAULT_CHAT_WELCOME_MESSAGE;
  }

  function cloneDefaultChatQuickQuestionItems() {
    return DEFAULT_CHAT_QUICK_QUESTION_ITEMS.map((item) => ({
      id: String(item.id || ''),
      type: item.id === CHAT_QUICK_ORDER_ID ? 'order' : 'custom',
      question: String(item.question || ''),
      answer: item.id === CHAT_QUICK_ORDER_ID ? '' : String(item.answer || ''),
      enabled: item.enabled !== false,
    }));
  }

  function normalizeChatQuickQuestionKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\u0451/g, '\u0435')
      .replace(/[!?.,;:()[\]{}"'`~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeChatQuickQuestionText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  }

  function normalizeChatQuickQuestionAnswer(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\s+\n/g, '\n')
      .trim()
      .slice(0, 1200);
  }

  function normalizeChatQuickQuestionEnabled(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback !== false;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback !== false;
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
    const numeric = Number(normalized);
    if (Number.isFinite(numeric)) return numeric !== 0;
    return fallback !== false;
  }

  function normalizeChatQuickQuestionId(value, index) {
    const source = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 48);
    if (source && source !== CHAT_QUICK_ORDER_ID) return source;
    return `custom-${index + 1}`;
  }

  function isOrderQuickQuestionLike(value) {
    const normalized = normalizeChatQuickQuestionKey(value);
    if (!normalized) return false;
    return normalized.includes('\u0433\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437')
      || normalized.includes('\u0433\u0434\u0435 \u0437\u0430\u043a\u0430\u0437');
  }

  function getDefaultQuickQuestionAnswer(value) {
    const key = normalizeChatQuickQuestionKey(value);
    return String(CHAT_QUICK_DEFAULT_ANSWER_BY_KEY[key] || '');
  }

  function parseTenantChatQuickQuestionsConfig(rawValue) {
    let parsed = [];
    if (Array.isArray(rawValue)) {
      parsed = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        parsed = [];
      } else {
        try {
          const value = JSON.parse(trimmed);
          parsed = Array.isArray(value) ? value : [];
        } catch {
          parsed = [];
        }
      }
    } else if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.items)) {
      parsed = rawValue.items;
    }

    if (!parsed.length) return cloneDefaultChatQuickQuestionItems();

    const maxCustomItems = Math.max(0, CHAT_QUICK_QUESTIONS_MAX - 1);
    const customCandidates = [];
    let orderEnabled = true;
    let orderDefined = false;

    parsed.forEach((item, index) => {
      if (customCandidates.length >= maxCustomItems) return;

      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        const question = normalizeChatQuickQuestionText(item);
        if (!question) return;
        if (isOrderQuickQuestionLike(question) && index === 0) {
          orderEnabled = true;
          orderDefined = true;
          return;
        }
        customCandidates.push({
          id: '',
          question,
          answer: getDefaultQuickQuestionAnswer(question),
          enabled: true,
        });
        return;
      }

      if (!item || typeof item !== 'object') return;

      const source = item;
      const question = normalizeChatQuickQuestionText(
        source.question ?? source.label ?? source.title ?? source.text ?? ''
      );
      const rawId = String(source.id ?? source.key ?? source.code ?? '').trim();
      const rawType = String(source.type ?? '').trim().toLowerCase();
      const isOrder = (
        rawId === CHAT_QUICK_ORDER_ID
        || rawType === CHAT_QUICK_ORDER_ID
        || normalizeChatQuickQuestionEnabled(source.is_order, false)
        || (index === 0 && isOrderQuickQuestionLike(question))
      );

      if (isOrder) {
        orderEnabled = normalizeChatQuickQuestionEnabled(
          source.enabled ?? source.is_enabled ?? source.active,
          true
        );
        orderDefined = true;
        return;
      }

      if (!question) return;
      const hasExplicitAnswer = (
        Object.prototype.hasOwnProperty.call(source, 'answer')
        || Object.prototype.hasOwnProperty.call(source, 'reply')
        || Object.prototype.hasOwnProperty.call(source, 'response')
        || Object.prototype.hasOwnProperty.call(source, 'message')
      );
      let answer = normalizeChatQuickQuestionAnswer(
        source.answer ?? source.reply ?? source.response ?? source.message ?? ''
      );
      if (!answer && !hasExplicitAnswer) answer = getDefaultQuickQuestionAnswer(question);
      customCandidates.push({
        id: rawId,
        question,
        answer,
        enabled: normalizeChatQuickQuestionEnabled(
          source.enabled ?? source.is_enabled ?? source.active,
          true
        ),
      });
    });

    const usedIds = new Set([CHAT_QUICK_ORDER_ID]);
    const customItems = [];
    customCandidates.slice(0, maxCustomItems).forEach((item, index) => {
      let id = normalizeChatQuickQuestionId(item.id, index);
      if (usedIds.has(id)) {
        let seq = index + 1;
        while (usedIds.has(`custom-${seq}`)) seq += 1;
        id = `custom-${seq}`;
      }
      usedIds.add(id);
      customItems.push({
        id,
        type: 'custom',
        question: String(item.question || ''),
        answer: normalizeChatQuickQuestionAnswer(item.answer || ''),
        enabled: item.enabled !== false,
      });
    });

    return [
      {
        id: CHAT_QUICK_ORDER_ID,
        type: 'order',
        question: CHAT_QUICK_ORDER_QUESTION,
        answer: '',
        enabled: orderDefined ? orderEnabled !== false : true,
      },
      ...customItems,
    ];
  }

  function buildEnabledChatQuickQuestionLabels(config) {
    return (Array.isArray(config) ? config : [])
      .filter((item) => item && item.enabled !== false)
      .map((item) => normalizeChatQuickQuestionText(item.question))
      .filter(Boolean)
      .slice(0, CHAT_QUICK_QUESTIONS_MAX);
  }

  function buildPublicTenantChatSettings(tenantRow) {
    const row = tenantRow && typeof tenantRow === 'object' ? tenantRow : {};
    const assistantGender = normalizeAssistantGender(row.chat_assistant_gender);
    const assistantName = str(row.chat_assistant_name).trim() || DEFAULT_CHAT_ASSISTANT_NAME;
    const welcomeMessage = str(row.chat_welcome_message) || getDefaultWelcomeMessageByGender(assistantGender);
    const welcomeEnabledRaw = row.chat_welcome_enabled;
    const welcomeEnabledNorm = str(welcomeEnabledRaw).trim().toLowerCase();
    const welcomeEnabled = !(
      welcomeEnabledRaw === false
      || welcomeEnabledRaw === 0
      || welcomeEnabledNorm === '0'
      || welcomeEnabledNorm === 'false'
    );
    const quickQuestionsEnabledRaw = row.chat_quick_questions_enabled;
    const quickQuestionsEnabledNorm = str(quickQuestionsEnabledRaw).trim().toLowerCase();
    const quickQuestionsEnabled = !(
      quickQuestionsEnabledRaw === false
      || quickQuestionsEnabledRaw === 0
      || quickQuestionsEnabledNorm === '0'
      || quickQuestionsEnabledNorm === 'false'
    );
    const chatWidgetRaw = row.chat_widget_enabled;
    const chatWidgetNorm = str(chatWidgetRaw).trim().toLowerCase();
    const isEnabled = !(
      chatWidgetRaw === false
      || chatWidgetRaw === 0
      || chatWidgetNorm === '0'
      || chatWidgetNorm === 'false'
    );
    const operatorName =
      str(row.chat_operator_name).trim()
      || str(row.site_name).trim()
      || str(row.name).trim()
      || '\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440';
    const quickQuestionsConfig = parseTenantChatQuickQuestionsConfig(row.chat_quick_questions_json);
    const quickQuestions = buildEnabledChatQuickQuestionLabels(quickQuestionsConfig);
    const snapshot = {
      assistant_name: assistantName,
      assistant_gender: assistantGender,
      welcome_message: welcomeMessage,
      welcome_enabled: welcomeEnabled,
      operator_name: operatorName,
      quick_questions: quickQuestions,
      quick_questions_config: quickQuestionsConfig,
      quick_questions_enabled: quickQuestionsEnabled,
      is_enabled: isEnabled,
    };
    if (!publicDiscountText(row?.name).trim()) snapshot.name = 'Товар';
    return snapshot;
  }

  function normalizePhoneLookupCandidates(phoneRaw) {
    const sourceDigits = str(phoneRaw).replace(/[^\d]/g, '');
    if (!sourceDigits) return [];

    const digits = sourceDigits.slice(-32);
    const candidates = new Set();

    function pushVariant(value) {
      const normalized = String(helpers.normalizePhone(value) || '').replace(/[^\d]/g, '');
      if (normalized.length < 10) return;
      candidates.add(normalized);
    }

    function pushTenDigitVariants(tenDigits) {
      if (!/^\d{10}$/.test(tenDigits)) return;
      pushVariant(tenDigits);
      pushVariant(`7${tenDigits}`);
      pushVariant(`8${tenDigits}`);
    }

    pushVariant(digits);

    if (digits.length === 10) {
      pushTenDigitVariants(digits);
    }

    if (digits.length >= 11) {
      for (let idx = 0; idx <= digits.length - 11; idx += 1) {
        const seq11 = digits.slice(idx, idx + 11);
        if (/^[78]\d{10}$/.test(seq11)) {
          pushVariant(seq11);
          pushTenDigitVariants(seq11.slice(1));
        }
      }
      pushVariant(digits.slice(-11));
      pushTenDigitVariants(digits.slice(-10));
    }

    return Array.from(candidates).slice(0, 20);
  }
  router.get('/changes', (req, res) => {
    try {
      if (!ordersEvents || typeof ordersEvents.getChanges !== 'function') {
        return res.status(503).json({ ok: false, error: 'EVENTS_UNAVAILABLE' });
      }
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = req.query.since;
      const data = ordersEvents.getChanges(tenantId, storeId, since);
      return res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, from_unit_id, to_unit_id, factor, is_active
         FROM prod_unit_conversions
         WHERE tenant_id=? AND is_active=1`,
        [tenantId]
      );
      return res.json({ ok: true, data: rows || [] });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/changes/wait', async (req, res) => {
    try {
      if (!ordersEvents || typeof ordersEvents.waitForChanges !== 'function') {
        return res.status(503).json({ ok: false, error: 'EVENTS_UNAVAILABLE' });
      }

      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const since = Number(req.query.since || 0);
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);
      const cursorNow = ordersEvents.getCurrentCursor(tenantId, storeId);

      if (Number.isFinite(since) && since > 0 && cursorNow > since) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }
      if ((!Number.isFinite(since) || since <= 0) && cursorNow > 0) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }

      const waitResult = await ordersEvents.waitForChanges(tenantId, storeId, timeoutMs);
      const cursor = Number(waitResult?.cursor || ordersEvents.getCurrentCursor(tenantId, storeId) || 0);
      const changed = Number.isFinite(cursor) && cursor > (Number.isFinite(since) ? since : 0);

      return res.json({
        ok: true,
        data: {
          changed,
          timeout: waitResult?.timeout === true,
          cursor,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function parseVariantValueNumber(value) {
    const s = String(value ?? '').replace(',', '.');
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getProductIsAvailableSql(productAlias = 'p', stockAlias = 's') {
    return `
      (${stockAlias}.qty IS NULL OR ${stockAlias}.qty > 0)
      AND NOT EXISTS (
        SELECT 1
        FROM prod_product_ingredients i
        JOIN prod_product_stocks si
          ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
        WHERE i.tenant_id=${productAlias}.tenant_id AND i.product_id=${productAlias}.id
          AND si.qty IS NOT NULL AND si.qty <= 0
      )
      AND NOT EXISTS (
        SELECT 1
        FROM prod_option_assignments oa
        JOIN prod_option_groups og
          ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
        WHERE oa.tenant_id=${productAlias}.tenant_id
          AND oa.assign_type='product' AND oa.assign_id=${productAlias}.id
          AND oa.is_active=1
          AND og.is_active=1
          AND COALESCE(og.out_of_stock_action, 1)=0
          AND NOT EXISTS (
            SELECT 1
            FROM prod_option_items oi
            JOIN prod_products op
              ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
            LEFT JOIN prod_product_stocks ops
              ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
            WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
              AND oi.target_type='product'
              AND oi.is_active=1
              AND op.is_active=1
              AND op.site_visibility=1
              AND (ops.qty IS NULL OR ops.qty > 0)
              AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients ip
                JOIN prod_product_stocks ips
                  ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                  AND ips.qty IS NOT NULL AND ips.qty <= 0
              )
          )
      )
    `;
  }

  function getConversionFactorMap(tenantId, db) {
    const map = new Map();
    return async function getConversionFactor(fromUnitId, toUnitId) {
      if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) {
        return 1;
      }
      const key = `${Number(fromUnitId)}_${Number(toUnitId)}`;
      if (map.has(key)) {
        return map.get(key);
      }
      const [direct] = await db.query(
        `SELECT factor FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
        [tenantId, fromUnitId, toUnitId]
      );
      if (direct.length && direct[0].factor) {
        const f = Number(direct[0].factor);
        map.set(key, f);
        return f;
      }
      const [inverse] = await db.query(
        `SELECT factor FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
        [tenantId, toUnitId, fromUnitId]
      );
      if (inverse.length && inverse[0].factor) {
        const f = 1 / Number(inverse[0].factor);
        map.set(key, f);
        return f;
      }
      map.set(key, null);
      return null;
    };
  }

  function getTierDiscountPercentForVariantIndex(tiers, variantIndex) {
    const list = Array.isArray(tiers) ? tiers : [];
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0) return 0;
    // Support both 0-based and 1-based tier ordering from DB.
    const exact = list.find((t) => Number(t?.sort_order) === idx);
    if (exact) return Number(exact.discount_percent || 0) || 0;
    const oneBased = list.find((t) => Number(t?.sort_order) === idx + 1);
    if (oneBased) return Number(oneBased.discount_percent || 0) || 0;
    return 0;
  }

  async function computeDisplayPriceForProduct(product, variant, getConversionFactor, roundPrice) {
    const basePrice = Number(product.price || 0);

    if (!variant || !variant.values || !variant.values.length) {
      return roundPrice(basePrice);
    }

    const defaultIndex = variant.default_value_index != null ? Number(variant.default_value_index) : 0;
    const selectedIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
    const value = variant.values[selectedIndex];
    const numericValue = parseVariantValueNumber(value);

    if (!Number.isFinite(numericValue)) {
      return roundPrice(basePrice);
    }

    const baseUnitId = Number(product.base_unit_id || product.unit_id || variant.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(variant.unit_id || 0);

    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) {
      return roundPrice(basePrice);
    }

    const factor = await getConversionFactor(variantUnitId, baseUnitId);

    if (factor == null) {
      return roundPrice(basePrice);
    }

    const qtyInBase = numericValue * Number(factor || 0);

    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) {
      return roundPrice(basePrice);
    }

    let unitPrice = basePrice * (qtyInBase / baseQty);

    const tiers = Array.isArray(variant.discount_tiers) ? variant.discount_tiers : [];
    const discountPercent = getTierDiscountPercentForVariantIndex(tiers, selectedIndex);

    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }

    return roundPrice(unitPrice);
  }

  /**
   * Р СљР С‘Р Р…Р С‘Р СР В°Р В»РЎРЉР Р…Р В°РЎРЏ Р Р†Р С•Р В·Р СР С•Р В¶Р Р…Р В°РЎРЏ РЎвЂ Р ВµР Р…Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В° РЎРѓ РЎС“РЎвЂЎРЎвЂРЎвЂљР С•Р С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р† (Р С—Р С•РЎР‚РЎвЂ Р С‘Р в„–/Р С•Р В±РЎР‰РЎвЂР СР С•Р Р†).
   * Р вЂўРЎРѓР В»Р С‘ РЎС“ РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р ВµРЎРѓРЎвЂљРЎРЉ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ РІР‚вЂќ Р С—Р ВµРЎР‚Р ВµР В±Р С‘РЎР‚Р В°Р ВµР С Р Р†РЎРѓР Вµ Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘РЎРЏ Р С‘ Р Р†Р С•Р В·Р Р†РЎР‚Р В°РЎвЂ°Р В°Р ВµР С Р СР С‘Р Р…Р С‘Р СРЎС“Р С; Р С‘Р Р…Р В°РЎвЂЎР Вµ РІР‚вЂќ Р В±Р В°Р В·Р С•Р Р†РЎС“РЎР‹ РЎвЂ Р ВµР Р…РЎС“.
   */
  async function computeMinPriceForProduct(product, variant, getConversionFactor, roundPrice) {
    const basePrice = Number(product.price || 0);
    if (!variant || !variant.values || !variant.values.length) return roundPrice(basePrice);

    const baseUnitId = Number(product.base_unit_id || product.unit_id || variant.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(variant.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return roundPrice(basePrice);

    const factor = await getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return roundPrice(basePrice);

    const tiers = Array.isArray(variant.discount_tiers) ? variant.discount_tiers : [];
    let minPrice = Infinity;

    for (let selectedIndex = 0; selectedIndex < variant.values.length; selectedIndex++) {
      const value = variant.values[selectedIndex];
      const numericValue = parseVariantValueNumber(value);
      if (!Number.isFinite(numericValue)) continue;
      const qtyInBase = numericValue * Number(factor || 0);
      if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) continue;

      let unitPrice = basePrice * (qtyInBase / baseQty);
      const discountPercent = getTierDiscountPercentForVariantIndex(tiers, selectedIndex);
      if (discountPercent !== 0) {
        unitPrice = unitPrice * (1 - discountPercent / 100);
      }
      if (unitPrice < minPrice) minPrice = unitPrice;
    }

    if (!Number.isFinite(minPrice)) return roundPrice(basePrice);
    return roundPrice(minPrice);
  }

  async function enrichProductsWithDisplayPrice(rows, tenantId) {
    if (!rows.length) return;
    const productIds = [...new Set(rows.map((r) => Number(r.id)).filter(Boolean))];
    if (!productIds.length) return;

    const [tenantRows] = await db.query(
      'SELECT price_rounding_mode, price_rounding_precision FROM ten_tenants WHERE id=? LIMIT 1',
      [tenantId]
    );
    const roundingModeRaw = tenantRows[0]?.price_rounding_mode || 'none';
    const roundingPrecisionRaw = Number(tenantRows[0]?.price_rounding_precision);
    const allowedRounding = new Set(['none', 'down', 'up', 'nearest']);
    const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : 'none';
    const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;

    function roundPrice(value) {
      const n = Number(value || 0);
      if (!Number.isFinite(n)) return 0;
      if (roundingMode === 'none') return n;
      const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
      if (roundingMode === 'up') return Math.ceil(n * factor) / factor;
      if (roundingMode === 'down') return Math.floor(n * factor) / factor;
      return Math.round(n * factor) / factor;
    }

    const getConversionFactor = getConversionFactorMap(tenantId, db);

    const placeholders = productIds.map(() => '?').join(',');
    const [vaRows] = await db.query(
      `SELECT va.product_id, va.variant_group_id,
              COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
              vg.unit_id, vg.values, vg.sort_order
       FROM prod_variant_assignments va
       JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
       WHERE va.tenant_id = ? AND va.product_id IN (${placeholders})
         AND va.is_active = 1 AND vg.is_active = 1
       ORDER BY va.sort_order ASC, vg.sort_order ASC`,
      [tenantId, ...productIds]
    );

    const variantGroupIds = [...new Set(vaRows.map((r) => Number(r.variant_group_id)).filter(Boolean))];
    let tiersByGroup = new Map();
    if (variantGroupIds.length) {
      const tierPlaceholders = variantGroupIds.map(() => '?').join(',');
      const [tierRows] = await db.query(
        `SELECT variant_group_id, min_quantity, discount_percent, sort_order
         FROM prod_variant_discount_tiers
         WHERE tenant_id = ? AND variant_group_id IN (${tierPlaceholders})
         ORDER BY variant_group_id, sort_order ASC`,
        [tenantId, ...variantGroupIds]
      );
      for (const t of tierRows) {
        const gid = Number(t.variant_group_id);
        if (!tiersByGroup.has(gid)) tiersByGroup.set(gid, []);
        tiersByGroup.get(gid).push({
          min_quantity: t.min_quantity,
          discount_percent: t.discount_percent,
          sort_order: t.sort_order,
        });
      }
    }

    const variantByProductId = new Map();
    for (const r of vaRows) {
      const pid = Number(r.product_id);
      if (variantByProductId.has(pid)) continue;
      const values = safeJsonArray(r.values);
      if (!values.length) continue;
      const defaultIdx = r.default_value_index != null ? Number(r.default_value_index) : 0;
      const tiers = tiersByGroup.get(Number(r.variant_group_id)) || [];
      variantByProductId.set(pid, {
        unit_id: r.unit_id,
        values,
        default_value_index: defaultIdx >= 0 && defaultIdx < values.length ? defaultIdx : 0,
        discount_tiers: tiers,
      });
    }

    for (const row of rows) {
      const variant = variantByProductId.get(Number(row.id));
      row.display_price = await computeDisplayPriceForProduct(row, variant, getConversionFactor, roundPrice);
    }
  }

  /**
   * Р С›Р В±Р С•Р С–Р В°РЎвЂљР С‘РЎвЂљРЎРЉ РЎвЂљР С•Р Р†Р В°РЎР‚РЎвЂ№ Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘Р ВµР в„– Р С• РЎРѓР С”Р С‘Р Т‘Р С”Р В°РЎвЂ¦
   * @param {Object[]} rows - Р СР В°РЎРѓРЎРѓР С‘Р Р† РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†
   * @param {number} tenantId
   * @param {number} storeId
   */
  async function enrichProductsWithDiscounts(rows, tenantId, storeId) {
    if (!rows.length) return;
    
    const productIds = rows.map(r => Number(r.id)).filter(Boolean);
    if (!productIds.length) return;

    // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘ Р Т‘Р В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°
    const placeholders = productIds.map(() => '?').join(',');
    const [catRows] = await db.query(
      `SELECT product_id, category_id FROM prod_product_categories
       WHERE tenant_id = ? AND product_id IN (${placeholders})`,
      [tenantId, ...productIds]
    );
    
    const catByProduct = new Map();
    for (const r of catRows) {
      const pid = Number(r.product_id);
      if (!catByProduct.has(pid)) catByProduct.set(pid, []);
      catByProduct.get(pid).push(Number(r.category_id));
    }

    // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р Р†РЎРѓР Вµ Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р Р…Р В° РЎвЂљР С•Р Р†Р В°РЎР‚РЎвЂ№ Р С‘ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘
    const [discountRows] = await db.query(
      `SELECT d.*, dp.product_id, dp.category_id, dp.combo_id
       FROM mkt_discounts d
       JOIN mkt_discount_products dp ON dp.discount_id = d.id AND dp.tenant_id = d.tenant_id
       WHERE d.tenant_id = ? AND d.store_id = ? AND d.is_active = 1
         AND (dp.product_id IN (${placeholders}) OR dp.category_id IS NOT NULL)`,
      [tenantId, storeId, ...productIds]
    );

    // Р вЂњРЎР‚РЎС“Р С—Р С—Р С‘РЎР‚РЎС“Р ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р С—Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В°Р С Р С‘ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎРЏР С
    const discountsByProduct = new Map();
    const discountsByCategory = new Map();

    for (const disc of discountRows) {
      if (disc.product_id) {
        const pid = Number(disc.product_id);
        if (!discountsByProduct.has(pid)) discountsByProduct.set(pid, []);
        discountsByProduct.get(pid).push(disc);
      }
      if (disc.category_id) {
        const cid = Number(disc.category_id);
        if (!discountsByCategory.has(cid)) discountsByCategory.set(cid, []);
        discountsByCategory.get(cid).push(disc);
      }
    }

    // Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р С” Р С”Р В°Р В¶Р Т‘Р С•Р СРЎС“ РЎвЂљР С•Р Р†Р В°РЎР‚РЎС“
    for (const row of rows) {
      const pid = Number(row.id);
      const discounts = [];
      const seenIds = new Set();

      // Р СџРЎР‚РЎРЏР СРЎвЂ№Р Вµ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р Р…Р В° РЎвЂљР С•Р Р†Р В°РЎР‚
      const directDiscounts = discountsByProduct.get(pid) || [];
      for (const d of directDiscounts) {
        if (!seenIds.has(d.id) && discountHelpers.isDiscountActive(d)) {
          discounts.push(d);
          seenIds.add(d.id);
        }
      }

      // Р РЋР С”Р С‘Р Т‘Р С”Р С‘ Р С—Р С• Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎРЏР С РЎвЂљР С•Р Р†Р В°РЎР‚Р В°
      const cats = catByProduct.get(pid) || [];
      for (const catId of cats) {
        const catDiscounts = discountsByCategory.get(catId) || [];
        for (const d of catDiscounts) {
          if (!seenIds.has(d.id) && discountHelpers.isDiscountActive(d)) {
            discounts.push(d);
            seenIds.add(d.id);
          }
        }
      }

      if (discounts.length > 0) {
        // Р РЋР С•РЎР‚РЎвЂљР С‘РЎР‚РЎС“Р ВµР С Р С—Р С• Р С—РЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљРЎС“
        discounts.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        const best = discounts[0];
        const price = Number(row.display_price || row.price || 0);
        
        row.discount = {
          id: best.id,
          title: best.title,
          discount_type: best.discount_type,
          discount_value: Number(best.discount_value),
          discount_amount: discountHelpers.calculateDiscount(
            price,
            best.discount_type,
            Number(best.discount_value),
            best.max_discount_amount ? Number(best.max_discount_amount) : null
          ),
        };
        row.original_price = price;
        row.discounted_price = Math.max(0, price - row.discount.discount_amount);
      } else {
        row.discount = null;
        row.original_price = null;
        row.discounted_price = null;
      }
    }
  }

  function parseBirthdayDDMMYYYY(input) {
    const s = str(input).trim();
    // dd.mm.yyyy
    const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    if (!m) return null;

    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);

    if (!Number.isFinite(dd) || !Number.isFinite(mm) || !Number.isFinite(yyyy)) return null;
    if (yyyy < 1900 || yyyy > 2100) return null;
    if (mm < 1 || mm > 12) return null;
    if (dd < 1 || dd > 31) return null;

    // check real date
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    if (d.getUTCFullYear() !== yyyy || d.getUTCMonth() !== (mm - 1) || d.getUTCDate() !== dd) return null;

    // MySQL DATE
    const MM = String(mm).padStart(2, '0');
    const DD = String(dd).padStart(2, '0');
    return `${yyyy}-${MM}-${DD}`;
  }

  function makeToken32() {
    // session/public id РІР‚вЂњ 32 hex or uuid without dashes
    if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '');
    return crypto.randomBytes(16).toString('hex');
  }

  function makeUuid36() {
    // nice public id (fits varchar(36))
    if (crypto.randomUUID) return crypto.randomUUID();
    const hex = crypto.randomBytes(16).toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  async function dualWriteAuthToken(connOrDb, payload) {
    try {
      await connOrDb.query(
        `INSERT INTO cust_customer_auth_tokens
         (tenant_id, customer_id, provider, purpose, token, expires_at, used_at, provider_user_id, phone, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
        [
          Number(payload.tenantId),
          payload.customerId == null ? null : Number(payload.customerId),
          String(payload.provider),
          String(payload.purpose),
          String(payload.token),
          payload.expiresAt,
          payload.usedAt || null,
          payload.providerUserId || null,
          payload.phone || null,
          payload.createdAt || null,
        ]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_TOKEN_FAILED:', err.message || err);
    }
  }

  async function dualWriteSession(connOrDb, payload) {
    try {
      await connOrDb.query(
        `INSERT INTO cust_customer_sessions
         (tenant_id, store_id, customer_id, token, expires_at, is_active, user_agent, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           expires_at=VALUES(expires_at),
           is_active=VALUES(is_active),
           user_agent=COALESCE(VALUES(user_agent), user_agent),
           ip_address=COALESCE(VALUES(ip_address), ip_address)`,
        [
          Number(payload.tenantId),
          Number(payload.storeId || 1),
          Number(payload.customerId),
          String(payload.token),
          payload.expiresAt || null,
          Number(payload.isActive == null ? 1 : payload.isActive),
          payload.userAgent || null,
          payload.ipAddress || null,
        ]
      );
    } catch (err) {
      console.error('AUTH_DUAL_WRITE_SESSION_FAILED:', err.message || err);
    }
  }

  async function getActiveStatusIdDefault(tenantId, storeId) {
    // Р С—РЎР‚Р С•Р В±РЎС“Р ВµР С "new", Р ВµРЎРѓР В»Р С‘ Р Р…Р ВµРЎвЂљ РІР‚вЂќ Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р в„– Р С—Р С• sort
    const [r1] = await db.query(
      `SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND code='new' AND is_active=1 LIMIT 1`,
      [tenantId, storeId]
    );
    if (r1.length) return Number(r1[0].id);

    const [r2] = await db.query(
      `SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY sort ASC, id ASC LIMIT 1`,
      [tenantId, storeId]
    );
    return r2.length ? Number(r2[0].id) : null;
  }

  async function getCustomerByToken(tenantId, token) {
    if (!token) return null;
    const sessionTable = 'cust_customer_sessions';
    const [rows] = await db.query(
      `SELECT
         s.id AS session_id,
         s.token,
         s.expires_at,
         s.is_active AS session_active,
         c.id AS customer_id,
         c.name,
         c.phone,
         DATE_FORMAT(c.birthday, '%Y-%m-%d') AS birthday,
         c.photo,
         c.is_active
       FROM ${sessionTable} s
       JOIN cust_customers c
         ON c.tenant_id=s.tenant_id AND c.id=s.customer_id
       WHERE s.tenant_id=? AND s.token=? AND s.is_active=1
       LIMIT 1`,
      [tenantId, token]
    );

    if (!rows.length) return null;

    const r = rows[0];
    if (Number(r.is_active || 0) !== 1) return null;

    if (r.expires_at) {
      const exp = new Date(r.expires_at);
      if (!Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) return null;
    }

    // Sliding session: refresh TTL only when expiry is near.
    // This reduces write pressure under frequent /me, /me/orders, /me/addresses calls.
    try {
      await db.query(
        `UPDATE ${sessionTable}
         SET expires_at=DATE_ADD(NOW(), INTERVAL 30 DAY)
         WHERE id=? AND tenant_id=? AND is_active=1
           AND (expires_at IS NULL OR expires_at < DATE_ADD(NOW(), INTERVAL 7 DAY))`,
        [Number(r.session_id), tenantId]
      );
    } catch {}

    const data = {
      id: Number(r.customer_id),
      name: r.name,
      phone: r.phone,
      birthday: r.birthday || null,
      photo: r.photo || null,
    };
    return data;
  }


  async function pickIdByCodeOrFirstActive({ tenantId, storeId, table, code }) {
    const c = str(code).trim();
    if (c) {
      const [r] = await db.query(
        `SELECT id FROM ${table} WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1 LIMIT 1`,
        [tenantId, storeId, c]
      );
      if (r.length) return Number(r[0].id);
    }

    const [r2] = await db.query(
      `SELECT id FROM ${table} WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY sort ASC, id ASC LIMIT 1`,
      [tenantId, storeId]
    );
    return r2.length ? Number(r2[0].id) : null;
  }

  async function getStoreTimezone(tenantId, storeId) {
    let storeTimezone = '+0';
    if (storeId) {
      const [rows] = await db.query(
        'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (rows[0]?.timezone) {
        storeTimezone = rows[0].timezone;
      }
    }
    if (!storeTimezone || storeTimezone === '+0') {
      const [tenantRows] = await db.query(
        'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (tenantRows[0]?.timezone) {
        storeTimezone = tenantRows[0].timezone;
      }
    }
    return storeTimezone || '+0';
  }

  async function fetchOrderPayload(tenantId, storeId, id, opts = {}) {
    const storeTimezone = opts.storeTimezone ?? await getStoreTimezone(tenantId, storeId);
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.public_id,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
        o.customer_id,
        o.customer_name,
        o.customer_phone,
        o.address,
        o.comment,
        o.address_comment,
        o.cutlery_qty,
        o.change_from,
        o.total_price,
        o.delivery_cost,
        o.discount_amount,
        o.discounts_json,
        o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id,
        o.payment_id,
        o.is_paid,
        o.time_option_id,
        o.status_id,

        s.code AS statusCode,
        s.title AS statusTitle,

        p.code AS paymentCode,
        p.title AS paymentTitle,

        m.code AS methodCode,
        m.title AS methodTitle,

        t.code AS timeOptionCode,
        t.title AS timeOptionTitle,

        ca.comment AS address_comment_from_cust
      FROM order_orders o
      LEFT JOIN order_statuses s
        ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p
        ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m
        ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t
        ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
      LEFT JOIN cust_customer_addresses ca
        ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
      WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
      LIMIT 1
      `,
      [tenantId, storeId, id]
    );

    if (!rows.length) return null;
    const r = rows[0];

    let items = [];
    try {
      const parsed = r.items ? JSON.parse(r.items) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
    let discountsJson = [];
    try {
      const parsedDiscounts = r.discounts_json ? JSON.parse(r.discounts_json) : [];
      if (Array.isArray(parsedDiscounts)) discountsJson = parsedDiscounts;
    } catch {}
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalPrice = Number(r.total_price || 0);
    let deliveryCost = 0;
    if ((r.methodCode ?? null) === 'delivery') {
      const diff = totalPrice - itemsTotal;
      const computed = diff > 0 ? diff : 0;
      const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
      deliveryCost = stored && stored > 0 ? stored : computed;
    }

    const snapshot = {
      id: r.id,
      public_id: r.public_id || null,
      created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address,
      comment: r.comment,
      address_comment: (r.address_comment && String(r.address_comment).trim()) ? r.address_comment : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim()) ? r.address_comment_from_cust : null,
      cutlery_qty: r.cutlery_qty,
      change_from: r.change_from,
      total_price: totalPrice,
      items_total: itemsTotal,
      delivery_cost: deliveryCost,
      discount_amount: Number(r.discount_amount || 0),
      discounts_json: discountsJson,
      items,
      scheduled_at: r.scheduled_at,
      delivery_type_id: r.delivery_type_id,
      payment_id: r.payment_id,
      is_paid: Number(r.is_paid || 0) === 1 ? 1 : 0,
      time_option_id: r.time_option_id,
      status_id: r.status_id,

      status_code: r.statusCode ?? null,
      status_title: r.statusTitle ?? null,

      payment_code: r.paymentCode ?? null,
      payment_title: r.paymentTitle ?? null,

      method_code: r.methodCode ?? null,
      method_title: r.methodTitle ?? null,

      time_option_code: r.timeOptionCode ?? null,
      time_option_title: r.timeOptionTitle ?? null,
    };
  }

  function toPositiveIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  }

  function toNonNegativeIntOrNull(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.trunc(n);
  }

  function toFiniteNumberOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function normalizeFavoriteIngredients(rawList, maxItems = 64) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const ingredientId = toPositiveIntOrNull(raw.ingredient_id || raw.product_id || raw.id);
      if (!ingredientId) continue;
      const quantityRaw = Number(raw.quantity ?? raw.qty ?? 0);
      const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
      out.push({
        ingredient_id: ingredientId,
        ingredient_name: str(raw.ingredient_name || raw.name || '').trim(),
        name: str(raw.name || raw.ingredient_name || '').trim(),
        quantity,
        qty: quantity,
        unit_id: toPositiveIntOrNull(raw.unit_id),
        unit_label: str(raw.unit_label || raw.unit || '').trim(),
        unit: str(raw.unit || raw.unit_label || '').trim(),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteOptionItems(rawList, maxItems = 64) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const optionId = toPositiveIntOrNull(raw.id || raw.option_item_id);
      if (!optionId) continue;

      const qtyRaw = Number(raw.qty ?? raw.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const targetProductId = toPositiveIntOrNull(raw.target_product_id || raw.product_id);
      const variantSource =
        raw.variant && typeof raw.variant === 'object'
          ? raw.variant
          : (Array.isArray(raw.variants) ? raw.variants[0] : null);
      const variantGroupId = toPositiveIntOrNull(raw.variant_group_id ?? variantSource?.variant_group_id);
      const variantValueIndex = toNonNegativeIntOrNull(raw.variant_value_index ?? variantSource?.variant_value_index);
      out.push({
        id: optionId,
        title: str(raw.title || raw.name || '').trim(),
        name: str(raw.name || raw.title || '').trim(),
        price: Number(raw.price || 0),
        qty,
        quantity: qty,
        target_product_id: targetProductId,
        product_id: targetProductId,
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: str(raw.variant_label || variantSource?.label || variantSource?.value || '').trim(),
        variant_price_diff: Number(raw.variant_price_diff || 0),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteComboSelections(rawList, maxItems = 24) {
    const list = Array.isArray(rawList) ? rawList : [];
    const out = [];
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const productId = toPositiveIntOrNull(raw.product_id || raw.id || raw.product?.id);
      if (!productId) continue;
      const variantSource =
        raw.variant && typeof raw.variant === 'object'
          ? raw.variant
          : (Array.isArray(raw.variants) ? raw.variants[0] : null);
      const rawIngredients = Array.isArray(raw.ingredients_display)
        ? raw.ingredients_display
        : (Array.isArray(raw.ingredients) ? raw.ingredients : []);
      out.push({
        product_id: productId,
        product_name: str(raw.product_name || raw.name || '').trim(),
        product_photo: str(raw.product_photo || raw.photo || '').trim(),
        variant_label: str(raw.variant_label || variantSource?.label || variantSource?.value || '').trim(),
        variant_group_id: toPositiveIntOrNull(raw.variant_group_id ?? variantSource?.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(raw.variant_value_index ?? variantSource?.variant_value_index),
        variant_group_title: str(raw.variant_group_title || variantSource?.group_title || '').trim(),
        variant_unit: str(raw.variant_unit || variantSource?.unit || '').trim(),
        unit_id: toPositiveIntOrNull(raw.unit_id),
        unit_price_override: toFiniteNumberOrNull(raw.unit_price_override),
        unit_price_before_discount: toFiniteNumberOrNull(raw.unit_price_before_discount),
        ingredients_display: normalizeFavoriteIngredients(rawIngredients, 64).map((ing) => ({
          ingredient_id: ing.ingredient_id,
          name: str(ing.name || ing.ingredient_name || '').trim(),
          quantity: ing.quantity,
          qty: ing.qty,
          unit_id: ing.unit_id,
          unit: str(ing.unit || ing.unit_label || '').trim(),
        })),
      });
      if (out.length >= maxItems) break;
    }
    return out;
  }

  function normalizeFavoriteItemSnapshot(rawItem) {
    if (!rawItem || typeof rawItem !== 'object') return null;
    const typeRaw = str(rawItem.type || '').trim().toLowerCase();
    const hasComboId = toPositiveIntOrNull(rawItem.combo_id || rawItem.combo?.id);

    if (typeRaw === 'combo' || hasComboId) {
      const comboId = hasComboId;
      if (!comboId) return null;
      const qtyRaw = Number(rawItem.qty ?? rawItem.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const selections = normalizeFavoriteComboSelections(rawItem.selections, 24);
      const photos = safeJsonArray(rawItem.photos);
      const derivedPhotos = selections
        .map((sel) => str(sel.product_photo || '').trim())
        .filter(Boolean);
      const lineTotalRaw = Number(rawItem.line_total);
      const priceRaw = Number(rawItem.price);
      const unitPrice = Number.isFinite(priceRaw)
        ? priceRaw
        : (qty > 0 && Number.isFinite(lineTotalRaw) ? lineTotalRaw / qty : 0);
      const lineTotal = Number.isFinite(lineTotalRaw)
        ? lineTotalRaw
        : Number(unitPrice * qty);

      return {
        type: 'combo',
        combo_id: comboId,
        combo_title: str(rawItem.combo_title || rawItem.name || '').trim() || '\u041a\u043e\u043c\u0431\u043e',
        name: str(rawItem.name || rawItem.combo_title || '').trim() || '\u041a\u043e\u043c\u0431\u043e',
        qty,
        price: Number(unitPrice || 0),
        line_total: Number(lineTotal || 0),
        old_line_total: Number(rawItem.old_line_total || 0),
        unit_price_before_discount: Number(rawItem.unit_price_before_discount || 0),
        photos: photos.length ? photos : derivedPhotos,
        selections,
      };
    }

    const productId = toPositiveIntOrNull(rawItem.product_id || rawItem.id || rawItem.product?.id);
    if (!productId) return null;
    const qtyRaw = Number(rawItem.qty ?? rawItem.quantity ?? 1);
    const qty = Number.isFinite(qtyRaw) ? Math.max(1, Math.trunc(qtyRaw)) : 1;

    const rawOptions = [
      ...(Array.isArray(rawItem.option_items) ? rawItem.option_items : []),
      ...(Array.isArray(rawItem.options) ? rawItem.options : []),
    ];
    const options = normalizeFavoriteOptionItems(rawOptions, 64);
    const ingredients = normalizeFavoriteIngredients(rawItem.ingredients, 64);

    const variantFromArray = Array.isArray(rawItem.variants) ? rawItem.variants[0] : null;
    const variantGroupId = toPositiveIntOrNull(rawItem.variant_group_id ?? variantFromArray?.variant_group_id);
    const variantValueIndex = toNonNegativeIntOrNull(rawItem.variant_value_index ?? variantFromArray?.variant_value_index);
    const variantLabel = str(
      rawItem.variant_label ||
      variantFromArray?.label ||
      variantFromArray?.value ||
      ''
    ).trim();
    const variantGroupTitle = str(variantFromArray?.group_title || '').trim();
    const variantValue = str(variantFromArray?.value || variantLabel || '').trim();

    const hasVariantSelection =
      variantGroupId &&
      variantValueIndex !== null &&
      (variantLabel || variantValue);

    const variants = hasVariantSelection
      ? [{
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        group_title: variantGroupTitle,
        value: variantValue || variantLabel,
        label: variantLabel || variantValue,
        price_diff: Number(variantFromArray?.price_diff || 0),
      }]
      : [];

    const lineTotalRaw = Number(rawItem.line_total);
    const priceRaw = Number(rawItem.price);
    const unitPrice = Number.isFinite(priceRaw)
      ? priceRaw
      : (qty > 0 && Number.isFinite(lineTotalRaw) ? lineTotalRaw / qty : 0);
    const lineTotal = Number.isFinite(lineTotalRaw)
      ? lineTotalRaw
      : Number(unitPrice * qty);

    return {
      type: 'product',
      product_id: productId,
      name: str(rawItem.name || rawItem.product_name || '').trim() || '\u0422\u043e\u0432\u0430\u0440',
      qty,
      price: Number(unitPrice || 0),
      old_price: Number(rawItem.old_price || 0),
      line_total: Number(lineTotal || 0),
      photos: safeJsonArray(rawItem.photos),
      option_item_ids: options.map((opt) => opt.id),
      options,
      option_items: options,
      ingredients,
      variant_group_id: hasVariantSelection ? variantGroupId : null,
      variant_value_index: hasVariantSelection ? variantValueIndex : null,
      variant_label: hasVariantSelection ? variantLabel : '',
      variants,
      discount: rawItem.discount && typeof rawItem.discount === 'object'
        ? {
          original_line_total: toFiniteNumberOrNull(rawItem.discount.original_line_total),
        }
        : null,
    };
  }

  function buildFavoriteSignaturePayload(item) {
    if (!item || typeof item !== 'object') return null;
    if (str(item.type).toLowerCase() === 'combo') {
      const comboId = toPositiveIntOrNull(item.combo_id);
      if (!comboId) return null;
      const selections = (Array.isArray(item.selections) ? item.selections : []).map((sel) => {
        const ingredients = (Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [])
          .map((ing) => ({
            ingredient_id: toPositiveIntOrNull(ing.ingredient_id),
            qty: Number(ing.qty ?? ing.quantity ?? 0),
          }))
          .filter((ing) => ing.ingredient_id)
          .sort((a, b) => a.ingredient_id - b.ingredient_id);
        return {
          product_id: toPositiveIntOrNull(sel.product_id),
          variant_group_id: toPositiveIntOrNull(sel.variant_group_id),
          variant_value_index: toNonNegativeIntOrNull(sel.variant_value_index),
          ingredients,
        };
      });
      return {
        type: 'combo',
        combo_id: comboId,
        selections,
      };
    }

    const productId = toPositiveIntOrNull(item.product_id);
    if (!productId) return null;
    const options = (Array.isArray(item.option_items) ? item.option_items : [])
      .map((opt) => ({
        id: toPositiveIntOrNull(opt.id),
        qty: Math.max(1, Number(opt.qty ?? opt.quantity ?? 1)),
        target_product_id: toPositiveIntOrNull(opt.target_product_id || opt.product_id),
        variant_group_id: toPositiveIntOrNull(opt.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(opt.variant_value_index),
      }))
      .filter((opt) => opt.id)
      .sort((a, b) => (
        a.id - b.id ||
        Number(a.target_product_id || 0) - Number(b.target_product_id || 0) ||
        Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0) ||
        Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
      ));

    const ingredients = (Array.isArray(item.ingredients) ? item.ingredients : [])
      .map((ing) => ({
        ingredient_id: toPositiveIntOrNull(ing.ingredient_id || ing.product_id),
        qty: Number(ing.qty ?? ing.quantity ?? 0),
      }))
      .filter((ing) => ing.ingredient_id)
      .sort((a, b) => a.ingredient_id - b.ingredient_id);

    return {
      type: 'product',
      product_id: productId,
      variant_group_id: toPositiveIntOrNull(item.variant_group_id),
      variant_value_index: toNonNegativeIntOrNull(item.variant_value_index),
      options,
      ingredients,
    };
  }

  function buildFavoriteSignature(item) {
    const payload = buildFavoriteSignaturePayload(item);
    if (!payload) return null;
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  function normalizePublicProductConfigPayload(value, fallbackProductId = null) {
    const source = parsePublicDiscountObject(value, null);
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const productId = toPositiveIntOrNull(source.product_id || fallbackProductId);
    if (!productId) return null;
    const options = (Array.isArray(source.options) ? source.options : [])
      .map((option) => ({
        id: toPositiveIntOrNull(option?.id),
        qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
        target_product_id: toPositiveIntOrNull(option?.target_product_id || option?.product_id),
        variant_group_id: toPositiveIntOrNull(option?.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(option?.variant_value_index),
      }))
      .filter((option) => option.id)
      .sort((a, b) => (
        a.id - b.id
        || Number(a.target_product_id || 0) - Number(b.target_product_id || 0)
        || Number(a.variant_group_id || 0) - Number(b.variant_group_id || 0)
        || Number(a.variant_value_index || 0) - Number(b.variant_value_index || 0)
      ));
    const ingredients = (Array.isArray(source.ingredients) ? source.ingredients : [])
      .map((ingredient) => ({
        ingredient_id: toPositiveIntOrNull(ingredient?.ingredient_id || ingredient?.product_id),
        qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0),
      }))
      .filter((ingredient) => ingredient.ingredient_id)
      .sort((a, b) => a.ingredient_id - b.ingredient_id);
    return {
      type: 'product',
      product_id: productId,
      variant_group_id: toPositiveIntOrNull(source.variant_group_id),
      variant_value_index: toNonNegativeIntOrNull(source.variant_value_index),
      options,
      ingredients,
    };
  }

  function buildPublicProductConfigSignature(value, fallbackProductId = null) {
    const payload = normalizePublicProductConfigPayload(value, fallbackProductId);
    if (!payload) return null;
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  function normalizePublicProductConfigMode(value, fallback = 'any') {
    const raw = publicDiscountText(value).toLowerCase();
    if (raw === 'exact') return 'exact';
    if (raw === 'any') return 'any';
    const fallbackRaw = publicDiscountText(fallback).toLowerCase();
    return fallbackRaw === 'exact' ? 'exact' : 'any';
  }

  function getPublicDiscountProductsConfigMode(discountOrMechanic, fallback = 'any') {
    const source = discountOrMechanic && typeof discountOrMechanic === 'object'
      ? discountOrMechanic
      : {};
    const mechanic = parsePublicDiscountObject(
      source?.mechanic_config_json ?? source,
      {}
    );
    return normalizePublicProductConfigMode(
      source?.products_config_mode ?? mechanic?.products_config_mode,
      fallback
    );
  }

  function normalizePublicDiscountTargetRow(row, fallbackMode = 'any') {
    if (!row || typeof row !== 'object') return null;
    const productId = Number(row?.product_id || row?.entity_id || row?.id || 0);
    const categoryId = Number(row?.category_id || row?.entity_id || row?.id || 0);
    const comboId = Number(row?.combo_id || row?.entity_id || row?.id || 0);
    const explicitType = publicDiscountText(row?.entity_type || row?.target_type).toLowerCase();
    const entityType = ['product', 'category', 'combo'].includes(explicitType)
      ? explicitType
      : (productId > 0
          ? 'product'
          : categoryId > 0
            ? 'category'
            : comboId > 0
              ? 'combo'
              : '');
    if (!entityType) return null;
    const configMode = entityType === 'product'
      ? normalizePublicProductConfigMode(row?.config_mode ?? fallbackMode, fallbackMode)
      : 'any';
    return {
      ...row,
      entity_type: entityType,
      product_id: productId > 0 ? productId : null,
      category_id: categoryId > 0 ? categoryId : null,
      combo_id: comboId > 0 ? comboId : null,
      config_mode: configMode,
      product_config: entityType === 'product'
        ? normalizePublicProductConfigPayload(row?.product_config ?? row?.product_config_json, productId)
        : null,
    };
  }

  function buildPublicGiftRewardSelectionKey(row, index = 0) {
    const productId = Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0) || 0;
    const signature = buildPublicProductConfigSignature(
      row?.product_config ?? row?.product_config_json,
      productId
    ) || 'any';
    const safeIndex = Math.max(0, Math.trunc(Number(index || 0) || 0));
    return `${productId}:${signature}:${safeIndex}`;
  }

  function addPublicExactProductSignature(map, productId, signature) {
    if (!(productId > 0) || !signature) return;
    if (!map.has(productId)) {
      map.set(productId, new Set());
    }
    map.get(productId).add(signature);
  }

  function extractFavoritePreview(item) {
    const snapshot = item && typeof item === 'object' ? item : {};
    const isCombo = str(snapshot.type || '').toLowerCase() === 'combo';
    if (isCombo) {
      const comboPhotos = safeJsonArray(snapshot.photos);
      const fallbackPhoto = (Array.isArray(snapshot.selections) ? snapshot.selections : [])
        .map((sel) => str(sel?.product_photo || '').trim())
        .find(Boolean) || null;
      return {
        itemType: 'combo',
        productId: null,
        comboId: toPositiveIntOrNull(snapshot.combo_id),
        title: str(snapshot.combo_title || snapshot.name || '').trim() || '\u041a\u043e\u043c\u0431\u043e',
        photo: comboPhotos[0] || fallbackPhoto,
      };
    }
    const photos = safeJsonArray(snapshot.photos);
    return {
      itemType: 'product',
      productId: toPositiveIntOrNull(snapshot.product_id),
      comboId: null,
      title: str(snapshot.name || '').trim() || '\u0422\u043e\u0432\u0430\u0440',
      photo: photos[0] || null,
    };
  }

  function parseFavoriteItemJson(rawJson) {
    if (!rawJson) return null;
    if (typeof rawJson === 'object') return rawJson;
    if (typeof rawJson !== 'string') return null;
    try {
      const parsed = JSON.parse(rawJson);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  // ------------------------------
  // AUTH
  // ------------------------------

  // POST /api/public/auth/phone-status
  // body: { phone }
  router.post('/auth/phone-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const [rows] = await db.query(
        `SELECT id, phone_verified_at
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) {
        return res.json({ ok: true, exists: false, requires_messenger_login: false });
      }

      const row = rows[0];
      const [tenantRows] = await db.query(
        `SELECT tg_login_enabled, max_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const tenantCfg = tenantRows[0] || {};
      const hasMessengerLogin = Number(tenantCfg.tg_login_enabled || 0) === 1 || Number(tenantCfg.max_login_enabled || 0) === 1;

      return res.json({
        ok: true,
        exists: true,
        requires_messenger_login: Boolean(row.phone_verified_at) && hasMessengerLogin,
      });
    } catch (e) {
      console.error('AUTH_PHONE_STATUS_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/messenger-code/send
  // body: { phone }
  router.post('/auth/messenger-code/send', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const [rows] = await db.query(
        `SELECT id, is_active, phone_verified_at, telegram_user_id, max_user_id
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      const row = rows[0];
      if (Number(row.is_active || 0) !== 1) return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
      if (!row.phone_verified_at) return res.status(409).json({ ok: false, error: 'BIRTHDAY_LOGIN_REQUIRED' });

      const [tenantRows] = await db.query(
        `SELECT tg_login_enabled, max_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const tenantCfg = tenantRows[0] || {};
      const tgEnabled = Number(tenantCfg.tg_login_enabled || 0) === 1;
      const maxEnabled = Number(tenantCfg.max_login_enabled || 0) === 1;

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=?, phone_verify_expires_at=?, updated_at=NOW()
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [code, expiresAt, tenantId, Number(row.id)]
      );

      const messageText = `\u041a\u043e\u0434 \u0432\u0445\u043e\u0434\u0430: ${code}. \u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f: 24 \u0447\u0430\u0441\u0430.`;
      let sentVia = null;
      let lastSendErr = null;

      // Priority: MAX (if tenant enabled) -> Telegram (fallback if tenant enabled)
      if (maxEnabled && row.max_user_id) {
        try {
          await sendMaxMessage({
            db,
            tenantId,
            maxUserId: row.max_user_id,
            text: messageText,
          });
          sentVia = 'max';
        } catch (maxErr) {
          lastSendErr = maxErr;
        }
      }
      if (!sentVia && tgEnabled && row.telegram_user_id) {
        try {
          await sendTenantTelegramText({
            tenantId,
            telegramUserId: row.telegram_user_id,
            text: messageText,
          });
          sentVia = 'telegram';
        } catch (tgErr) {
          lastSendErr = tgErr;
        }
      }
      if (!sentVia) {
        if (!tgEnabled && !maxEnabled) {
          return res.status(409).json({ ok: false, error: 'MESSENGER_LOGIN_DISABLED' });
        }
        if ((maxEnabled && !row.max_user_id) && (tgEnabled && !row.telegram_user_id)) {
          return res.status(409).json({ ok: false, error: 'MESSENGER_NOT_LINKED' });
        }
        if (lastSendErr) throw lastSendErr;
        return res.status(409).json({ ok: false, error: 'MESSENGER_NOT_AVAILABLE' });
      }

      return res.json({ ok: true, sent_via: sentVia, ttl_sec: 86400 });
    } catch (e) {
      console.error('AUTH_MESSENGER_CODE_SEND_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'SEND_FAILED' });
    }
  });

  // POST /api/public/auth/messenger-code/verify
  // body: { phone, code }
  router.post('/auth/messenger-code/verify', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const phone = helpers.normalizePhone(str(req.body.phone));
      const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 4);
      if (!phone || phone.length < 10) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      if (code.length !== 4) return res.status(400).json({ ok: false, error: 'CODE_INVALID' });

      const [rows] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, photo,
                is_active, phone_verified_at, phone_verify_code, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND phone=?
         LIMIT 1`,
        [tenantId, phone]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      const row = rows[0];
      if (Number(row.is_active || 0) !== 1) return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
      if (!row.phone_verified_at) return res.status(409).json({ ok: false, error: 'BIRTHDAY_LOGIN_REQUIRED' });
      if (!row.phone_verify_code || !row.phone_verify_expires_at) {
        return res.status(400).json({ ok: false, error: 'CODE_NOT_REQUESTED' });
      }
      if (Date.now() > new Date(row.phone_verify_expires_at).getTime()) {
        return res.status(400).json({ ok: false, error: 'CODE_EXPIRED' });
      }
      if (String(row.phone_verify_code) !== code) {
        return res.status(400).json({ ok: false, error: 'CODE_INVALID' });
      }

      const customerId = Number(row.id);
      const token = makeToken32();
      await dualWriteSession(db, {
        tenantId,
        storeId: 1,
        customerId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=NULL, phone_verify_expires_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );

      return res.json({
        ok: true,
        token,
        customer: {
          id: row.id,
          name: row.name,
          phone: row.phone,
          birthday: row.birthday || null,
          photo: row.photo || null,
        },
      });
    } catch (e) {
      console.error('AUTH_MESSENGER_CODE_VERIFY_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/login
  // body: { phone, birthday } ; birthday = dd.mm.yyyy
  router.post('/auth/login', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const phoneRaw = str(req.body.phone);
      const phone = helpers.normalizePhone(phoneRaw);

      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const birthday = parseBirthdayDDMMYYYY(req.body.birthday);
      if (!birthday) {
        return res.status(400).json({ ok: false, error: 'BIRTHDAY_REQUIRED' });
      }

      // Р С‘РЎвЂ°Р ВµР С Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°
      const [ex] = await db.query(
        `SELECT c.id, c.name, c.phone, DATE_FORMAT(c.birthday, '%Y-%m-%d') AS birthday, c.is_active, c.phone_verified_at,
                t.tg_login_enabled, t.max_login_enabled
         FROM cust_customers c
         JOIN ten_tenants t ON t.id = c.tenant_id
         WHERE c.tenant_id=? AND c.phone=?
         LIMIT 1`,
        [tenantId, phone]
      );

      let customerId = null;

      if (!ex.length) {
        // РЎРѓР С•Р В·Р Т‘Р В°РЎвЂР С Р Р…Р С•Р Р†Р С•Р С–Р С• Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°
        const [ins] = await db.query(
          `INSERT INTO cust_customers
           (tenant_id, name, phone, birthday, is_active, registration_date)
           VALUES (?,?,?,?,1, CURDATE())`,
          [tenantId, '\u041a\u043b\u0438\u0435\u043d\u0442', phone, birthday]
        );
        customerId = Number(ins.insertId);
      } else {
        const c = ex[0];
        if (Number(c.is_active || 0) !== 1) {
          return res.status(403).json({ ok: false, error: 'CLIENT_BLOCKED' });
        }
        const hasMessengerLogin = Number(c.tg_login_enabled || 0) === 1 || Number(c.max_login_enabled || 0) === 1;
        if (c.phone_verified_at && hasMessengerLogin) {
          return res.status(403).json({ ok: false, error: 'MESSENGER_LOGIN_REQUIRED' });
        }

        customerId = Number(c.id);

        // Р ВµРЎРѓР В»Р С‘ birthday РЎС“Р В¶Р Вµ Р ВµРЎРѓРЎвЂљРЎРЉ РІР‚вЂќ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С
        if (c.birthday && String(c.birthday) !== String(birthday)) {
          return res.status(401).json({ ok: false, error: 'WRONG_BIRTHDAY' });
        }

        // Р ВµРЎРѓР В»Р С‘ birthday Р В±РЎвЂ№Р В» NULL РІР‚вЂќ Р В·Р В°Р С—Р С‘РЎв‚¬Р ВµР С (Р С—Р ВµРЎР‚Р Р†РЎвЂ№Р в„– Р Р†РЎвЂ¦Р С•Р Т‘)
        if (!c.birthday) {
          await db.query(
            `UPDATE cust_customers SET birthday=? WHERE tenant_id=? AND id=?`,
            [birthday, tenantId, customerId]
          );
        }
      }

      // РЎРѓР С•Р В·Р Т‘Р В°РЎвЂР С РЎРѓР ВµРЎРѓРЎРѓР С‘РЎР‹
      const token = makeToken32();

      // РЎРѓРЎР‚Р С•Р С” 30 Р Т‘Р Р…Р ВµР в„–
      await dualWriteSession(db, {
        tenantId,
        storeId: 1,
        customerId,
        token,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      const [me] = await db.query(
        `SELECT id, name, phone, DATE_FORMAT(birthday, '%Y-%m-%d') AS birthday, photo
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );

      res.json({ ok: true, token, customer: me[0] || null });

      setImmediate(async () => {
        try {
          await notifyCustomerLogin({ db, tenantId, customerId });
        } catch (err) {
          console.error('MAX login notify error:', err.message || err);
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/max/link-token
  // headers: x-customer-token
  router.post('/max/link-token', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const tenantBotId = await getTenantMaxBotId(db, tenantId);
      const tenantBotToken = await getTenantMaxBotToken(db, tenantId);
      if (!tenantBotId || !tenantBotToken) {
        return res.status(409).json({ ok: false, error: 'MAX_BOT_NOT_CONFIGURED' });
      }

      const linkToken = makeLinkToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await dualWriteAuthToken(db, {
        tenantId,
        customerId: Number(customer.id),
        provider: 'max',
        purpose: 'link',
        token: linkToken,
        expiresAt,
      });

      res.json({
        ok: true,
        token: linkToken,
        link: buildMaxDeepLink(linkToken, tenantBotId),
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/tg/link-token
  // headers: x-customer-token
  router.post('/tg/link-token', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        'SELECT telegram_bot_username, telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const row = rows[0] || {};
      const username = String(row.telegram_bot_username || '').trim().replace(/^@/, '');
      const token = String(row.telegram_bot_token || '').trim();
      if (!username || !token) {
        return res.status(409).json({ ok: false, error: 'TG_BOT_NOT_CONFIGURED' });
      }

      const linkToken = makeLinkToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await dualWriteAuthToken(db, {
        tenantId,
        customerId: Number(customer.id),
        provider: 'tg',
        purpose: 'link',
        token: linkToken,
        expiresAt,
      });

      const link = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(linkToken)}`;
      res.json({
        ok: true,
        token: linkToken,
        link,
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/max/auth-link
  // Public link for "Login via MAX" (without existing customer session)
  router.get('/max/auth-link', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      if (!(await isTenantMaxLoginEnabled(tenantId))) {
        return res.json({ ok: true, link: null, disabled: true });
      }
      const tenantBotId = await getTenantMaxBotId(db, tenantId);
      const tenantBotToken = await getTenantMaxBotToken(db, tenantId);
      if (!tenantBotId || !tenantBotToken) {
        return res.status(409).json({ ok: false, error: 'MAX_BOT_NOT_CONFIGURED' });
      }

      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];
      const firstHeaderValue = (raw, fallback = '') => {
        if (!raw) return fallback;
        if (Array.isArray(raw)) return String(raw[0]).trim();
        return String(raw).split(',')[0].trim();
      };
      const protocol = firstHeaderValue(forwardedProto, req.protocol || 'https');
      const hostHeader = firstHeaderValue(forwardedHost, req.get('host') || 'localhost:3000');
      const origin = `${protocol}://${hostHeader}`;
      const loginOriginToken = makeToken32();

      await db.query(
        `INSERT INTO cust_customer_auth_tokens
         (tenant_id, customer_id, provider, purpose, token, expires_at, used_at, provider_user_id, phone, created_at)
         VALUES (?, NULL, 'max', 'pending', ?, DATE_ADD(NOW(), INTERVAL 10 YEAR), NULL, ?, 'login_origin', NOW())`,
        [tenantId, loginOriginToken, origin]
      );

      const link = `https://max.ru/${encodeURIComponent(tenantBotId)}?start=${encodeURIComponent(loginOriginToken)}`;
      return res.json({ ok: true, link });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/tg/auth-link
  // Public link for "Login via Telegram" (without existing customer session)
  router.get('/tg/auth-link', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      if (!(await isTenantTgLoginEnabled(tenantId))) {
        return res.json({ ok: true, link: null, disabled: true });
      }

      const [rows] = await db.query(
        'SELECT telegram_bot_username, telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const row = rows[0] || {};
      const username = String(row.telegram_bot_username || '').trim().replace(/^@/, '');
      const token = String(row.telegram_bot_token || '').trim();
      if (!username || !token) {
        return res.status(409).json({ ok: false, error: 'TG_BOT_NOT_CONFIGURED' });
      }

      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];
      const firstHeaderValue = (raw, fallback = '') => {
        if (!raw) return fallback;
        if (Array.isArray(raw)) return String(raw[0]).trim();
        return String(raw).split(',')[0].trim();
      };
      const protocol = firstHeaderValue(forwardedProto, req.protocol || 'https');
      const hostHeader = firstHeaderValue(forwardedHost, req.get('host') || 'localhost:3000');
      const origin = `${protocol}://${hostHeader}`;
      const loginOriginToken = makeToken32();

      await db.query(
        `INSERT INTO cust_customer_auth_tokens
         (tenant_id, customer_id, provider, purpose, token, expires_at, used_at, provider_user_id, phone, created_at)
         VALUES (?, NULL, 'tg', 'pending', ?, DATE_ADD(NOW(), INTERVAL 10 YEAR), NULL, ?, 'login_origin', NOW())`,
        [tenantId, loginOriginToken, origin]
      );

      const link = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(loginOriginToken)}`;
      return res.json({ ok: true, link });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/max/finish-login?token=...
  // One-time MAX login token exchange -> customer session + redirect to site/miniapp
  router.get('/max/finish-login', async (req, res) => {
    const loginToken = str(req.query.token);
    const persistentToken = str(req.query.ptoken);
    const isPersistent = !!persistentToken;
    const effectiveToken = persistentToken || loginToken;
    const target = str(req.query.target).toLowerCase() === 'miniapp' ? 'miniapp' : 'site';
    if (!effectiveToken) return res.status(400).send('TOKEN_REQUIRED');

    const maxLoginReadTable = 'cust_customer_auth_tokens';
    const conn = await db.getConnection();
    try {
      const purposeFilter = 'login';
      const [tenantRows] = await conn.query(
        `SELECT t.max_login_enabled
         FROM ${maxLoginReadTable} lt
         JOIN ten_tenants t ON t.id = lt.tenant_id
         WHERE lt.token=? AND lt.provider='max' AND lt.purpose=?
         LIMIT 1`,
        [effectiveToken, purposeFilter]
      );
      if (!tenantRows.length || Number(tenantRows[0].max_login_enabled || 0) !== 1) {
        return res.status(403).send('MAX_LOGIN_DISABLED');
      }

      await conn.beginTransaction();

      let rows = [];
      if (isPersistent) {
        [rows] = await conn.query(
          `SELECT id, tenant_id, customer_id
           FROM ${maxLoginReadTable}
           WHERE token=? AND provider='max' AND purpose='login'
           LIMIT 1
           FOR UPDATE`,
          [effectiveToken]
        );
      } else {
        [rows] = await conn.query(
          `SELECT id, tenant_id, customer_id
           FROM ${maxLoginReadTable}
           WHERE token=? AND provider='max' AND purpose='login' AND used_at IS NULL AND expires_at > NOW()
           LIMIT 1
           FOR UPDATE`,
          [effectiveToken]
        );
      }
      if (!rows.length) {
        await conn.rollback();
        return res.status(400).send('TOKEN_INVALID_OR_EXPIRED');
      }

      const row = rows[0];
      const tenantId = Number(row.tenant_id);
      const customerId = Number(row.customer_id);

      const [customerRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, customerId]
      );
      if (!customerRows.length || Number(customerRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return res.status(404).send('CUSTOMER_NOT_FOUND');
      }

      const sessionToken = makeToken32();
      await dualWriteSession(conn, {
        tenantId,
        storeId: 1,
        customerId,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: 1,
      });

      if (!isPersistent) {
        await conn.query(
          `UPDATE cust_customer_auth_tokens
           SET used_at=NOW()
           WHERE tenant_id=? AND provider='max' AND purpose='login' AND token=? AND used_at IS NULL
           LIMIT 1`,
          [tenantId, effectiveToken]
        );
      }

      await conn.commit();

      const redirectUrl = target === 'miniapp'
        ? `/max-app?tenant_id=${tenantId}&max_login=1`
        : `/shop?tenant_id=${tenantId}&max_login=1`;
      const html = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script>
try {
  localStorage.setItem('shop_customer_token', ${JSON.stringify(sessionToken)});
  localStorage.setItem('shop_customer_token_t${tenantId}', ${JSON.stringify(sessionToken)});
} catch (e) {}
window.location.replace(${JSON.stringify(redirectUrl)});
</script>
</body>
</html>`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    } catch (e) {
      await conn.rollback();
      console.error('MAX_FINISH_LOGIN_ERROR:', e);
      return res.status(500).send('DB_ERROR');
    } finally {
      conn.release();
    }
  });

  // GET /api/public/tg/finish-login?token=...
  // One-time Telegram login token exchange -> customer session + redirect to site/miniapp
  router.get('/tg/finish-login', async (req, res) => {
    const loginToken = str(req.query.token);
    const persistentToken = str(req.query.ptoken);
    const isPersistent = !!persistentToken;
    const effectiveToken = persistentToken || loginToken;
    const target = str(req.query.target).toLowerCase() === 'miniapp' ? 'miniapp' : 'site';
    if (!effectiveToken) return res.status(400).send('TOKEN_REQUIRED');

    const tgLoginReadTable = 'cust_customer_auth_tokens';
    const conn = await db.getConnection();
    try {
      const purposeFilter = 'login';
      const [tenantRows] = await conn.query(
        `SELECT t.tg_login_enabled
         FROM ${tgLoginReadTable} lt
         JOIN ten_tenants t ON t.id = lt.tenant_id
         WHERE lt.token=? AND lt.provider='tg' AND lt.purpose=?
         LIMIT 1`,
        [effectiveToken, purposeFilter]
      );
      if (!tenantRows.length || Number(tenantRows[0].tg_login_enabled || 0) !== 1) {
        return res.status(403).send('TG_LOGIN_DISABLED');
      }

      await conn.beginTransaction();

      let rows = [];
      if (isPersistent) {
        [rows] = await conn.query(
          `SELECT id, tenant_id, customer_id
           FROM ${tgLoginReadTable}
           WHERE token=? AND provider='tg' AND purpose='login'
           LIMIT 1
           FOR UPDATE`,
          [effectiveToken]
        );
      } else {
        [rows] = await conn.query(
          `SELECT id, tenant_id, customer_id
           FROM ${tgLoginReadTable}
           WHERE token=? AND provider='tg' AND purpose='login' AND used_at IS NULL AND expires_at > NOW()
           LIMIT 1
           FOR UPDATE`,
          [effectiveToken]
        );
      }
      if (!rows.length) {
        await conn.rollback();
        return res.status(400).send('TOKEN_INVALID_OR_EXPIRED');
      }

      const tokenRow = rows[0];
      const tenantId = Number(tokenRow.tenant_id);
      const customerId = Number(tokenRow.customer_id);

      const [customerRows] = await conn.query(
        `SELECT id, is_active
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1
         FOR UPDATE`,
        [tenantId, customerId]
      );
      if (!customerRows.length || Number(customerRows[0].is_active || 0) !== 1) {
        await conn.rollback();
        return res.status(404).send('CUSTOMER_NOT_FOUND');
      }

      const sessionToken = makeLinkToken();
      const sessionExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      await dualWriteSession(conn, {
        tenantId,
        storeId: 1,
        customerId,
        token: sessionToken,
        expiresAt: sessionExpiresAt,
        isActive: 1,
        userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
        ipAddress: String(req.ip || req.connection?.remoteAddress || '').slice(0, 64),
      });

      if (!isPersistent) {
        await conn.query(
          `UPDATE cust_customer_auth_tokens
           SET used_at=NOW()
           WHERE tenant_id=? AND provider='tg' AND purpose='login' AND token=? AND used_at IS NULL
           LIMIT 1`,
          [tenantId, effectiveToken]
        );
      }

      await conn.commit();

      const redirectUrl = target === 'miniapp'
        ? `/tg-app?tenant_id=${tenantId}&tg_login=1`
        : `/shop?tenant_id=${tenantId}&tg_login=1`;
      const html = `<!doctype html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body>
<script>
try {
  localStorage.setItem('shop_customer_token', ${JSON.stringify(sessionToken)});
  localStorage.setItem('shop_customer_token_t${tenantId}', ${JSON.stringify(sessionToken)});
} catch (e) {}
window.location.replace(${JSON.stringify(redirectUrl)});
</script>
</body>
</html>`;
      return res.set('content-type', 'text/html; charset=utf-8').send(html);
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error('TG finish login error:', e);
      return res.status(500).send('SERVER_ERROR');
    } finally {
      conn.release();
    }
  });

  // GET /api/public/max/link-status
  // headers: x-customer-token
  router.get('/max/link-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT max_user_id, phone, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );

      if (!rows.length) {
        return res.json({ ok: true, linked: false, data: null });
      }

      return res.json({
        ok: true,
        linked: true,
        data: {
          max_user_id: rows[0].max_user_id,
          phone: rows[0].phone,
          linked_at: rows[0].updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/tg/link-status
  // headers: x-customer-token
  router.get('/tg/link-status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT telegram_user_id, phone, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );

      if (!rows.length) {
        return res.json({ ok: true, linked: false, data: null });
      }

      const tgUserId = String(rows[0].telegram_user_id || '').trim();
      if (!tgUserId) {
        return res.json({ ok: true, linked: false, data: null });
      }

      return res.json({
        ok: true,
        linked: true,
        data: {
          telegram_user_id: tgUserId,
          phone: rows[0].phone,
          linked_at: rows[0].updated_at,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/max/link-confirm
  // body: { token, max_user_id, phone }
  router.post('/max/link-confirm', async (req, res) => {
    try {
      const secret = String(process.env.MAX_BOT_INTERNAL_SECRET || '').trim();
      if (!secret) return res.status(503).json({ ok: false, error: 'MAX_SECRET_NOT_CONFIGURED' });

      const givenSecret = str(req.headers['x-max-bot-secret']);
      if (!givenSecret || givenSecret !== secret) {
        return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      }

      const result = await confirmMaxLink({
        db,
        helpers,
        token: req.body.token,
        maxUserId: req.body.max_user_id,
        phone: req.body.phone,
      });

      if (!result.ok) {
        return res.status(result.status || 400).json({ ok: false, error: result.error || 'LINK_FAILED' });
      }

      return res.json({
        ok: true,
        data: {
          tenant_id: result.tenantId,
          customer_id: result.customerId,
          max_user_id: result.maxUserId,
          phone: result.phone,
        },
      });
    } catch (e) {
      console.error('MAX link confirm error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/phone-verification/status
  router.get('/phone-verification/status', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT phone_verified_at, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0] || {};
      return res.json({
        ok: true,
        data: {
          verified: Boolean(row.phone_verified_at),
          phone_verified_at: row.phone_verified_at || null,
          expires_at: row.phone_verify_expires_at || null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/phone-verification/send
  router.post('/phone-verification/send', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [rows] = await db.query(
        `SELECT id, max_user_id, telegram_user_id
         FROM cust_customers
         WHERE tenant_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });

      const code = String(Math.floor(1000 + Math.random() * 9000));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.query(
        `UPDATE cust_customers
         SET phone_verify_code=?, phone_verify_expires_at=?, phone_verified_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [code, expiresAt, tenantId, Number(customer.id)]
      );

      const messageText = `\u041a\u043e\u0434 \u043f\u043e\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0435\u043d\u0438\u044f \u043d\u043e\u043c\u0435\u0440\u0430: ${code}. \u0421\u0440\u043e\u043a \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u044f: 24 \u0447\u0430\u0441\u0430.`;
      let sentVia = '';

      try {
        await sendTenantTelegramText({
          tenantId,
          telegramUserId: row.telegram_user_id,
          text: messageText,
        });
        sentVia = 'telegram';
      } catch {
        if (!row.max_user_id) {
          return res.status(409).json({ ok: false, error: 'TG_NOT_LINKED_AND_MAX_NOT_LINKED' });
        }

        await sendMaxMessage({
          db,
          tenantId,
          maxUserId: row.max_user_id,
          text: messageText,
        });
        sentVia = 'max';
      }

      return res.json({
        ok: true,
        data: {
          expires_at: expiresAt.toISOString(),
          sent_via: sentVia,
        },
      });
    } catch (e) {
      console.error('PHONE_VERIFY_SEND_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'SEND_FAILED' });
    }
  });

  // POST /api/public/phone-verification/verify
  // body: { code }
  router.post('/phone-verification/verify', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const code = String(req.body?.code || '').replace(/\D/g, '').slice(0, 4);
      if (code.length !== 4) return res.status(400).json({ ok: false, error: 'CODE_INVALID' });

      const [rows] = await db.query(
        `SELECT phone_verify_code, phone_verify_expires_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0];
      if (!row) return res.status(404).json({ ok: false, error: 'CUSTOMER_NOT_FOUND' });
      if (!row.phone_verify_code || !row.phone_verify_expires_at) {
        return res.status(400).json({ ok: false, error: 'CODE_NOT_REQUESTED' });
      }

      const expMs = new Date(row.phone_verify_expires_at).getTime();
      if (!Number.isFinite(expMs) || expMs < Date.now()) {
        return res.status(400).json({ ok: false, error: 'CODE_EXPIRED' });
      }
      if (String(row.phone_verify_code) !== code) {
        return res.status(400).json({ ok: false, error: 'CODE_INVALID' });
      }

      await db.query(
        `UPDATE cust_customers
         SET phone_verified_at=NOW(), phone_verify_code=NULL, phone_verify_expires_at=NULL, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [tenantId, Number(customer.id)]
      );

      return res.json({ ok: true, data: { verified: true } });
    } catch (e) {
      console.error('PHONE_VERIFY_CHECK_ERROR:', e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/logout
  router.post('/auth/logout', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token'] || req.body.token);

      if (!token) return res.json({ ok: true });

      await db.query(
        `UPDATE cust_customer_sessions
         SET is_active=0, revoked_at=NOW()
         WHERE tenant_id=? AND token=?`,
        [tenantId, token]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me
  router.get('/me', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);

      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      res.json({ ok: true, customer });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/auth/link-token
  // body: { provider: 'max' | 'tg' }
  // headers: x-customer-token
  router.post('/auth/link-token', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const provider = str(req.body?.provider || '').toLowerCase();
      if (provider !== 'max' && provider !== 'tg') {
        return res.status(400).json({ ok: false, error: 'BAD_PROVIDER' });
      }

      if (provider === 'max') {
        const tenantBotId = await getTenantMaxBotId(db, tenantId);
        const tenantBotToken = await getTenantMaxBotToken(db, tenantId);
        if (!tenantBotId || !tenantBotToken) {
          return res.status(409).json({ ok: false, error: 'MAX_BOT_NOT_CONFIGURED' });
        }

        const linkToken = makeLinkToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await dualWriteAuthToken(db, {
          tenantId,
          customerId: Number(customer.id),
          provider: 'max',
          purpose: 'link',
          token: linkToken,
          expiresAt,
        });

        return res.json({
          ok: true,
          provider: 'max',
          token: linkToken,
          link: buildMaxDeepLink(linkToken, tenantBotId),
          expires_at: expiresAt.toISOString(),
        });
      }

      const [rows] = await db.query(
        'SELECT telegram_bot_username, telegram_bot_token FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const row = rows[0] || {};
      const username = String(row.telegram_bot_username || '').trim().replace(/^@/, '');
      const token = String(row.telegram_bot_token || '').trim();
      if (!username || !token) {
        return res.status(409).json({ ok: false, error: 'TG_BOT_NOT_CONFIGURED' });
      }

      const linkToken = makeLinkToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await dualWriteAuthToken(db, {
        tenantId,
        customerId: Number(customer.id),
        provider: 'tg',
        purpose: 'link',
        token: linkToken,
        expiresAt,
      });

      const link = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(linkToken)}`;
      return res.json({
        ok: true,
        provider: 'tg',
        token: linkToken,
        link,
        expires_at: expiresAt.toISOString(),
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/settings-bootstrap
  // Combines profile settings-related statuses for lazy loading on Settings tab.
  router.get('/me/settings-bootstrap', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const sessionToken = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, sessionToken);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const [tenantRows] = await db.query(
        `SELECT max_login_enabled, tg_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const tenantRow = tenantRows[0] || {};
      const maxLoginEnabled = Number(tenantRow.max_login_enabled || 0) === 1;
      const tgLoginEnabled = Number(tenantRow.tg_login_enabled || 0) === 1;

      const [rows] = await db.query(
        `SELECT max_user_id, telegram_user_id, phone,
                phone_verified_at, phone_verify_expires_at, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, Number(customer.id)]
      );
      const row = rows[0] || {};
      const maxUserId = String(row.max_user_id || '').trim();
      const tgUserId = String(row.telegram_user_id || '').trim();

      return res.json({
        ok: true,
        data: {
          auth_options: {
            max_login_enabled: maxLoginEnabled,
            tg_login_enabled: tgLoginEnabled,
          },
          max: {
            linked: !!maxUserId,
            max_user_id: maxUserId || null,
            phone: row.phone || null,
            linked_at: row.updated_at || null,
          },
          tg: {
            linked: !!tgUserId,
            telegram_user_id: tgUserId || null,
            phone: row.phone || null,
            linked_at: row.updated_at || null,
          },
          phone_verification: {
            verified: Boolean(row.phone_verified_at),
            phone_verified_at: row.phone_verified_at || null,
            expires_at: row.phone_verify_expires_at || null,
          },
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/bootstrap
  // Returns customer profile + active addresses in one payload for first-page bootstrap.
  router.get('/me/bootstrap', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      await ensureSharedCustomerAddressIdentityColumns(db);

      const [addresses] = await db.query(
        `SELECT
           ${sharedCustomerAddressSelectFields}
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1
         ORDER BY is_default DESC, updated_at DESC, id DESC`,
        [tenantId, customer.id]
      );

      return res.json({
        ok: true,
        data: {
          customer,
          addresses: Array.isArray(addresses) ? addresses.map((row) => serializeSharedCustomerAddress(helpers, row)) : [],
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/tenant/chat-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT *
         FROM ten_tenants
         WHERE id=? AND is_active=1
         LIMIT 1`,
        [tenantId]
      );
      const tenant = rows[0];
      if (!tenant) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }
      return res.json({
        ok: true,
        tenant_id: Number(tenant.id || tenantId),
        settings: buildPublicTenantChatSettings(tenant),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/auth/options', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT max_login_enabled, tg_login_enabled
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const row = rows && rows[0] ? rows[0] : {};
      return res.json({
        ok: true,
        data: {
          max_login_enabled: Number(row.max_login_enabled || 0) === 1,
          tg_login_enabled: Number(row.tg_login_enabled || 0) === 1,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/tenant/stores', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT tenant_id, id, code, name, city, address, phone, timezone, is_active
         FROM ten_stores
         WHERE tenant_id=? AND is_active=1
         ORDER BY id ASC`,
        [tenantId]
      );

      // Р вЂќР В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎвЂћР С‘Р В»Р С‘Р В°Р В»Р В° Р В·Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С РЎвЂЎР В°РЎРѓРЎвЂ№ РЎР‚Р В°Р В±Р С•РЎвЂљРЎвЂ№ Р С‘ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С РЎРѓРЎвЂљР В°РЎвЂљРЎС“РЎРѓ
      const storesWithHours = await Promise.all(rows.map(async (store) => {
        const [storeHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        const storeTimezone = store.timezone || "+0";
        const isOpen = isStoreOpenNow(storeHours, storeTimezone);

        return {
          ...store,
          storeHours,
          isOpen
        };
      }));

      res.json({ ok: true, stores: storesWithHours });
    } catch (err) {
      console.error('Р С›РЎв‚¬Р С‘Р В±Р С”Р В° Р С—Р С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘РЎРЏ РЎвЂљР С•РЎвЂЎР ВµР С” Р С—РЎР‚Р С•Р Т‘Р В°Р В¶:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/address-suggest', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const stage = String((req.query && req.query.stage) || 'address').trim().toLowerCase() || 'address';
      const query = String((req.query && req.query.q) || '').trim();
      const city = String((req.query && req.query.city) || '').trim();
      const citySourceKey = String((req.query && req.query.city_source_key) || '').trim();
      const selectedSourceKey = String((req.query && req.query.selected_source_key) || '').trim();

      if (isAddressServiceConfigured()) {
        const result = stage === 'city'
          ? await suggestAddressServiceCities(query, { limit: req.query && req.query.limit })
          : await suggestAddressServiceAddresses(query, {
            stage,
            city,
            cityCode: citySourceKey ? citySourceKey.replace(/^root-city:/, '') : '',
            selectedSourceKey,
            limit: req.query && req.query.limit,
          });
        if (!result || !result.ok) {
          const error = result && result.error ? result.error : 'ADDRESS_SERVICE_UNAVAILABLE';
          const status = (
            error === 'STAGE_REQUIRED'
            || error === 'QUERY_REQUIRED'
            || error === 'CITY_REQUIRED'
          ) ? 400 : 503;
          return res.status(status).json({ ok: false, error });
        }
        return res.json({ ok: true, data: result.data });
      }

      const result = await searchLocalAddressSuggest(stage, query, {
        city,
        citySourceKey,
        selectedSourceKey,
        tenantId,
      });
      if (!result || !result.ok) {
        const error = result && result.error ? result.error : 'LOCAL_ADDRESS_INDEX_FAILED';
        const status = (
          error === 'STAGE_REQUIRED'
          || error === 'QUERY_REQUIRED'
          || error === 'CITY_REQUIRED'
        ) ? 400 : error === 'LOCAL_ADDRESS_INDEX_NOT_READY' ? 503 : 502;
        return res.status(status).json({ ok: false, error });
      }

      return res.json({ ok: true, data: result.data });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/address-resolve', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const result = await resolveSharedCustomerAddressPayload({
        db,
        helpers,
        tenantId,
        storeId,
        payload: req.body || {},
      });
      if (!result || !result.ok) {
        const error = result && result.error ? result.error : 'ADDRESS_RESOLVE_FAILED';
        return res.status(400).json({ ok: false, error });
      }
      return res.json({ ok: true, data: result.data });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/delivery-quote', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const subtotal = Math.max(0, Number(req.body?.subtotal || req.body?.total || 0) || 0);
      const token = str(req.headers['x-customer-token']);
      const customer = token ? await getCustomerByToken(tenantId, token) : null;
      const deliveryAddressId = normalizePositiveIntOrNull(req.body && req.body.delivery_address_id);
      let address = null;

      if (deliveryAddressId && customer) {
        address = await loadSharedCustomerAddressById({
          db,
          helpers,
          tenantId,
          customerId: customer.id,
          addressId: deliveryAddressId,
        });
      }

      if (!address) {
        const source = req.body && typeof req.body.address === 'object'
          ? req.body.address
          : (req.body || {});
        const normalizedResult = normalizeSharedCustomerAddressPayload(helpers, source);
        if (!normalizedResult.ok) {
          return res.status(400).json({ ok: false, error: normalizedResult.error });
        }
        address = normalizedResult.data;
      }

      const quote = await buildDeliveryQuote({
        db,
        tenantId,
        storeId,
        subtotal,
        address,
      });

      return res.json({
        ok: true,
        data: {
          source: quote.source,
          has_settings: Boolean(quote.has_settings),
          delivery_cost: Number(quote.delivery_cost || 0),
          min_order_amount: Number(quote.min_order_amount || 0),
          free_delivery_from: quote.free_delivery_from != null ? Number(quote.free_delivery_from) : null,
          eta_minutes: quote.eta_minutes != null ? Number(quote.eta_minutes) : null,
          delivery_zone_id: quote.delivery_zone_id != null ? Number(quote.delivery_zone_id) : null,
          delivery_zone_name: quote.delivery_zone_name || null,
          delivery_store_id: quote.delivery_store_id != null ? Number(quote.delivery_store_id) : null,
        },
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /stores-availability
   * Returns all stores with their current open/closed status
   * Used when customer selects a city to show which stores can accept orders
   */
  router.get('/stores-availability', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const city = req.query.city;

      if (!city) {
        return res.status(400).json({ ok: false, error: 'CITY_REQUIRED' });
      }

      // Get all stores in this city
      const [stores] = await db.query(
        `SELECT id, name, city, address, phone, timezone, is_active
         FROM ten_stores
         WHERE tenant_id=? AND city=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, city]
      );

      // For each store, check if it's currently open
      const storesWithStatus = await Promise.all(stores.map(async (store) => {
        // Get store hours
        const [storeHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        // Get delivery hours
        const [deliveryHours] = await db.query(
          `SELECT day_of_week, opens_at, closes_at, is_closed
           FROM ten_store_delivery_hours
           WHERE tenant_id=? AND store_id=?
           ORDER BY day_of_week ASC`,
          [tenantId, store.id]
        );

        const storeTimezone = store.timezone || "+0";
        const isOpen = isStoreOpenNow(storeHours, storeTimezone);
        const deliveryIsOpen = isStoreDeliveryOpenNow(deliveryHours, storeTimezone);

        return {
          ...store,
          isOpen,
          deliveryIsOpen,
          storeHours,
          deliveryHours
        };
      }));

      res.json({
        ok: true,
        stores: storesWithStatus
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // PUT /api/public/me  body: { name }
  router.put('/me', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      await db.query(
        `UPDATE cust_customers
         SET name=?
         WHERE tenant_id=? AND id=?`,
        [name, tenantId, customer.id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/photo (multipart/form-data, field: photo|avatar)
  router.post(
    '/me/photo',
    avatarUpload.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'avatar', maxCount: 1 }
    ]),
    async (req, res) => {
      try {
        const tenantId = helpers.getTenantId(req);
        const token = str(req.headers['x-customer-token']);
        const customer = await getCustomerByToken(tenantId, token);
        if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

        const file =
          (req.files && req.files.photo && req.files.photo[0]) ||
          (req.files && req.files.avatar && req.files.avatar[0]);

        if (!file) return res.status(400).json({ ok: false, error: 'PHOTO_REQUIRED' });

        // Р РЋР С•Р В·Р Т‘Р В°РЎвЂР С WebP-Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљ Р В°Р Р†Р В°РЎвЂљР В°РЎР‚Р В° (Р С•РЎР‚Р С‘Р С–Р С‘Р Р…Р В°Р В» Р С•РЎРѓРЎвЂљР В°РЎвЂРЎвЂљРЎРѓРЎРЏ Р С”Р В°Р С” fallback)
        const originalPath = file.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'avatars', file.filename);
        const [tenantRows] = await db.query(
          'SELECT img_webp_quality, img_main_width, img_webp_aggressive, img_delete_original FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        const imgSettings = tenantRows[0] || {};
        const webpQuality = imgSettings.img_webp_quality ?? 82;
        const mainWidth = imgSettings.img_main_width ?? 1200;
        const webpAggressive = (imgSettings.img_webp_aggressive ?? 0) == 1;
        const deleteOriginal = (imgSettings.img_delete_original ?? 1) == 1;

        const convertedPath = await helpers.ensureWebpVariant(originalPath, {
          quality: webpQuality,
          width: mainWidth,
          aggressive: webpAggressive,
          recompress: true,
          forceUnique: true,
        });
        if (!convertedPath || !/\.webp$/i.test(String(convertedPath))) {
          return res.status(500).json({ ok: false, error: 'IMAGE_CONVERSION_FAILED' });
        }
        if (deleteOriginal) {
          const sameFile = path.resolve(String(convertedPath)) === path.resolve(String(originalPath));
          if (!sameFile) fs.unlink(originalPath, () => {});
        }
        const staticRoot = path.join(__dirname, '..', '..', 'static');
        const rel = path.relative(staticRoot, convertedPath).replace(/\\/g, '/');
        const photoUrl = `/static/${rel}`;

        await db.query(
          `UPDATE cust_customers
           SET photo=?
           WHERE tenant_id=? AND id=?`,
          [photoUrl, tenantId, customer.id]
        );

        res.json({ ok: true, photoUrl });
      } catch (e) {
        console.error(e);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    }
  );

  // DELETE /api/public/me/photo
  router.delete('/me/photo', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      await db.query(
        `UPDATE cust_customers
         SET photo=NULL
         WHERE tenant_id=? AND id=?`,
        [tenantId, customer.id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/addresses
  router.get('/me/addresses', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      await ensureSharedCustomerAddressIdentityColumns(db);

      const [rows] = await db.query(
        `SELECT
           ${sharedCustomerAddressSelectFields}
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1
         ORDER BY is_default DESC, updated_at DESC, id DESC`,
        [tenantId, customer.id]
      );

      res.json({ ok: true, data: Array.isArray(rows) ? rows.map((row) => serializeSharedCustomerAddress(helpers, row)) : [] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/addresses
  router.post('/me/addresses', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      await ensureSharedCustomerAddressIdentityColumns(db);

      const payloadResult = normalizeSharedCustomerAddressPayload(helpers, req.body);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      const payload = payloadResult.data;
      const city = payload.city;
      const street = payload.street;
      const house = payload.house;
      const entrance = payload.entrance;
      const floor = payload.floor;
      const apartment = payload.apartment;
      const comment = payload.comment;

      let isDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS c
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1`,
        [tenantId, customer.id]
      );
      const hasAny = Number(cnt?.[0]?.c || 0) > 0;
      if (!hasAny) isDefault = 1;

      if (isDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customer.id]
        );
      }

      const [r] = await conn.query(
        `INSERT INTO cust_customer_addresses
         (tenant_id, customer_id, city, street, house, entrance, floor, apartment, comment, is_default, is_active,
          address_ref, selected_object_type, resolved_city_source_key, address_context_locality, address_normalized_display,
          lat, lng, delivery_zone_id, delivery_store_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          customer.id,
          city,
          street,
          house,
          entrance,
          floor,
          apartment,
          comment,
          isDefault,
          payload.address_ref,
          payload.selected_object_type,
          payload.resolved_city_source_key,
          payload.address_context_locality,
          payload.address_normalized_display,
          payload.lat,
          payload.lng,
          payload.delivery_zone_id,
          payload.delivery_store_id,
        ]
      );

      await conn.commit();
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });


  // PUT /api/public/me/addresses/:id
  // body: { street, house, entrance?, floor?, apartment?, comment?, is_default? }
  router.put('/me/addresses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });
      await ensureSharedCustomerAddressIdentityColumns(db);

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const payloadResult = normalizeSharedCustomerAddressPayload(helpers, req.body);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      const payload = payloadResult.data;
      const city = payload.city;
      const street = payload.street;
      const house = payload.house;
      const entrance = payload.entrance;
      const floor = payload.floor;
      const apartment = payload.apartment;
      const comment = payload.comment;

      const makeDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      if (makeDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customer.id]
        );
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET city=?, street=?, house=?, entrance=?, floor=?, apartment=?, comment=?,
             address_ref=?, selected_object_type=?, resolved_city_source_key=?, address_context_locality=?, address_normalized_display=?,
             lat=?, lng=?, delivery_zone_id=?, delivery_store_id=?${makeDefault === 1 ? ', is_default=1' : ''}
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [
          city,
          street,
          house,
          entrance,
          floor,
          apartment,
          comment,
          payload.address_ref,
          payload.selected_object_type,
          payload.resolved_city_source_key,
          payload.address_context_locality,
          payload.address_normalized_display,
          payload.lat,
          payload.lng,
          payload.delivery_zone_id,
          payload.delivery_store_id,
          tenantId,
          customer.id,
          addressId,
        ]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });


  // DELETE /api/public/me/addresses/:id
  router.delete('/me/addresses/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id, is_default
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      const wasDefault = Number(cur[0].is_default || 0) === 1;

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_active=0, is_default=0
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customer.id, addressId]
      );

      if (wasDefault) {
        const [any] = await conn.query(
          `SELECT id
           FROM cust_customer_addresses
           WHERE tenant_id=? AND customer_id=? AND is_active=1
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
          [tenantId, customer.id]
        );
        if (any.length) {
          await conn.query(
            `UPDATE cust_customer_addresses
             SET is_default=1
             WHERE tenant_id=? AND customer_id=? AND id=?`,
            [tenantId, customer.id, Number(any[0].id)]
          );
        }
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // PUT /api/public/me/addresses/:id/default
  router.put('/me/addresses/:id/default', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const addressId = Number(req.params.id);
      if (!Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [a] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customer.id, addressId]
      );
      if (!a.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=0
         WHERE tenant_id=? AND customer_id=?`,
        [tenantId, customer.id]
      );

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=1
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customer.id, addressId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // GET /api/public/orders/by-phone
  // public endpoint for chat assistant: finds active orders by customer phone
  router.get('/orders/by-phone', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const phone = str(req.query.phone || req.query.q);
      const phoneCandidates = normalizePhoneLookupCandidates(phone);
      if (!phoneCandidates.length) {
        return res.status(400).json({ ok: false, error: 'BAD_PHONE' });
      }

      let limit = Number(req.query.limit ?? 5);
      if (!Number.isFinite(limit) || limit <= 0) limit = 5;
      if (limit > 200) limit = 200;
      limit = Math.floor(limit);

      const fetchLimit = limit + 1;
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const placeholders = phoneCandidates.map(() => '?').join(', ');
      const [rows] = await db.query(
        `SELECT
           o.id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
           o.total_price, o.items, o.public_id,
           s.title AS status_title, s.code AS status_code, s.is_final AS status_is_final,
           p.title AS payment_title, p.code AS payment_code
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         LEFT JOIN order_payments p
           ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
         LEFT JOIN cust_customers c
           ON c.tenant_id=o.tenant_id AND c.id=o.customer_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.is_active=1
           AND COALESCE(s.is_final, 0)=0
           AND (
             o.customer_phone IN (${placeholders})
             OR c.phone IN (${placeholders})
           )
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ?`,
        [tenantId, storeId, ...phoneCandidates, ...phoneCandidates, fetchLimit]
      );

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      const data = pageRows.map((r) => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}

        return {
          id: Number(r.id),
          public_id: r.public_id || null,
          created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
          total_price: Number(r.total_price || 0),
          status_title: r.status_title || null,
          status_code: r.status_code || null,
          status_is_final: r.status_is_final ? Number(r.status_is_final) : 0,
          payment_title: r.payment_title || null,
          payment_code: r.payment_code || null,
          items,
        };
      });

      res.json({
        ok: true,
        data,
        paging: {
          limit,
          has_more: hasMore,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/orders
  router.get('/me/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      let limit = Number(req.query.limit ?? 50);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      limit = Math.floor(limit);

      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(offset) || offset < 0) offset = 0;
      if (offset > 100000) offset = 100000;
      offset = Math.floor(offset);

      let statusIsFinal = null;
      if (req.query.status_is_final !== undefined) {
        const parsedStatusIsFinal = Number(req.query.status_is_final);
        if (parsedStatusIsFinal === 0 || parsedStatusIsFinal === 1) {
          statusIsFinal = parsedStatusIsFinal;
        }
      }

      const fetchLimit = limit + 1;
      const storeTimezone = await getStoreTimezone(tenantId, storeId);

      let summary = null;
      if (statusIsFinal !== null) {
        const [summaryRows] = await db.query(
          `SELECT
             SUM(CASE WHEN COALESCE(s.is_final, 0) = 1 THEN 1 ELSE 0 END) AS completed_count,
             SUM(CASE WHEN COALESCE(s.is_final, 0) = 1 THEN 0 ELSE 1 END) AS active_count
           FROM order_orders o
           LEFT JOIN order_statuses s
             ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
           WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1`,
          [tenantId, storeId, customer.id]
        );
        const summaryRow = summaryRows?.[0] || {};
        summary = {
          active_count: Math.max(0, Number(summaryRow.active_count || 0)),
          completed_count: Math.max(0, Number(summaryRow.completed_count || 0)),
        };
        summary.total_count = summary.active_count + summary.completed_count;
      }

      const [rows] = await db.query(
        `SELECT
           o.id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at_utc,
           o.total_price, o.items, o.public_id,
           s.title AS status_title, s.code AS status_code, s.is_final AS status_is_final,
           p.title AS payment_title, p.code AS payment_code
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         LEFT JOIN order_payments p
           ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
           AND (? IS NULL OR COALESCE(s.is_final, 0)=?)
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT ?
         OFFSET ?`,
        [tenantId, storeId, customer.id, statusIsFinal, statusIsFinal, fetchLimit, offset]
      );

      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;

      const data = pageRows.map(r => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
        return {
          id: Number(r.id),
          public_id: r.public_id || null,
          created_at: helpers.utcToStoreDateTime(r.created_at_utc ?? r.created_at, storeTimezone),
          total_price: Number(r.total_price || 0),
          status_title: r.status_title || null,
          status_code: r.status_code || null,
          status_is_final: r.status_is_final ? Number(r.status_is_final) : 0,
          payment_title: r.payment_title || null,
          payment_code: r.payment_code || null,
          items,
        };
      });

      res.json({
        ok: true,
        data,
        ...(summary ? { summary } : {}),
        paging: {
          limit,
          offset,
          next_offset: hasMore ? offset + data.length : null,
          has_more: hasMore,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET /api/public/me/orders/:id
  router.get('/me/orders/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const orderId = Number(req.params.id);
      if (!Number.isFinite(orderId) || orderId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, orderId);
      if (!payload) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Р СџРЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С, РЎвЂЎРЎвЂљР С• Р В·Р В°Р С”Р В°Р В· Р С—РЎР‚Р С‘Р Р…Р В°Р Т‘Р В»Р ВµР В¶Р С‘РЎвЂљ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљРЎС“
      if (Number(payload.customer_id) !== Number(customer.id)) {
        return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
      }

      res.json({ ok: true, data: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Р РЋР С”Р С‘Р Т‘Р С”Р С‘ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°
  // ------------------------------
  // GET /api/public/me/favorites
  router.get('/me/favorites', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      let limit = Number(req.query.limit ?? 200);
      if (!Number.isFinite(limit) || limit <= 0) limit = 200;
      if (limit > 500) limit = 500;

      const [rows] = await db.query(
        `SELECT
           id,
           item_signature,
           item_type,
           product_id,
           combo_id,
           title,
           photo,
           item_json,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=?
         ORDER BY updated_at DESC, id DESC
         LIMIT ?`,
        [tenantId, storeId, customer.id, limit]
      );

      const data = rows
        .map((row) => {
          const item = parseFavoriteItemJson(row.item_json);
          if (!item) return null;
          return {
            id: Number(row.id),
            item_signature: row.item_signature || null,
            item_type: row.item_type || null,
            product_id: row.product_id != null ? Number(row.product_id) : null,
            combo_id: row.combo_id != null ? Number(row.combo_id) : null,
            title: row.title || null,
            photo: row.photo || null,
            item,
            created_at: row.created_at || null,
            updated_at: row.updated_at || null,
          };
        })
        .filter(Boolean);

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // POST /api/public/me/favorites
  // body: { item }
  router.post('/me/favorites', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const rawItem =
        (req.body && req.body.item && typeof req.body.item === 'object' ? req.body.item : null) ||
        (req.body && typeof req.body === 'object' ? req.body : null);
      const item = normalizeFavoriteItemSnapshot(rawItem);
      if (!item) {
        return res.status(400).json({ ok: false, error: 'BAD_ITEM' });
      }

      const signature = buildFavoriteSignature(item);
      if (!signature) {
        return res.status(400).json({ ok: false, error: 'BAD_ITEM' });
      }

      const preview = extractFavoritePreview(item);
      const itemType = preview.itemType === 'combo' ? 'combo' : 'product';
      const itemJson = JSON.stringify(item);

      const [ins] = await db.query(
        `INSERT INTO cust_customer_favorites
         (tenant_id, store_id, customer_id, item_signature, item_type, product_id, combo_id, title, photo, item_json)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           id = LAST_INSERT_ID(id),
           item_type = VALUES(item_type),
           product_id = VALUES(product_id),
           combo_id = VALUES(combo_id),
           title = VALUES(title),
           photo = VALUES(photo),
           item_json = VALUES(item_json),
           updated_at = CURRENT_TIMESTAMP`,
        [
          tenantId,
          storeId,
          customer.id,
          signature,
          itemType,
          preview.productId,
          preview.comboId,
          preview.title,
          preview.photo,
          itemJson,
        ]
      );

      const favoriteId = Number(ins.insertId || 0);
      if (!favoriteId) {
        return res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }

      const [rows] = await db.query(
        `SELECT
           id,
           item_signature,
           item_type,
           product_id,
           combo_id,
           title,
           photo,
           item_json,
           DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i:%s') AS updated_at
         FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, customer.id, favoriteId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const row = rows[0];
      const parsedItem = parseFavoriteItemJson(row.item_json);
      if (!parsedItem) {
        return res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }

      res.json({
        ok: true,
        data: {
          id: Number(row.id),
          item_signature: row.item_signature || null,
          item_type: row.item_type || null,
          product_id: row.product_id != null ? Number(row.product_id) : null,
          combo_id: row.combo_id != null ? Number(row.combo_id) : null,
          title: row.title || null,
          photo: row.photo || null,
          item: parsedItem,
          created_at: row.created_at || null,
          updated_at: row.updated_at || null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // DELETE /api/public/me/favorites/:id
  router.delete('/me/favorites/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const favoriteId = Number(req.params.id);
      if (!Number.isFinite(favoriteId) || favoriteId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [del] = await db.query(
        `DELETE FROM cust_customer_favorites
         WHERE tenant_id=? AND store_id=? AND customer_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, customer.id, favoriteId]
      );

      if (Number(del.affectedRows || 0) < 1) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function publicDiscountText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function parsePublicDiscountObject(value, fallback = {}) {
    if (!value) return fallback;
    if (typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
      } catch {}
    }
    return fallback;
  }

  function normalizePublicMechanicType(value) {
    const raw = publicDiscountText(value).toLowerCase();
    if (['simple_discount', 'buy_x_get_y', 'threshold', 'loyalty_progress'].includes(raw)) return raw;
    return 'simple_discount';
  }

  function getPublicSimpleDiscountVariant(discount) {
    const config = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const fallback = publicDiscountText(discount?.activation_mode).toLowerCase() === 'promo_code'
      ? 'promo_code'
      : publicDiscountText(discount?.discount_type).toLowerCase();
    const raw = publicDiscountText(config?.simple_variant ?? config?.variant ?? fallback).toLowerCase();
    if (['promo_code', 'percent', 'fixed', 'special_price'].includes(raw)) return raw;
    return fallback === 'promo_code' ? 'promo_code' : 'percent';
  }

  function isPublicPromoSimpleDiscount(discount) {
    return normalizePublicMechanicType(discount?.mechanic_type) === 'simple_discount'
      && getPublicSimpleDiscountVariant(discount) === 'promo_code';
  }

  function isPublicAutomaticSimpleDiscount(discount) {
    return normalizePublicMechanicType(discount?.mechanic_type) === 'simple_discount'
      && getPublicSimpleDiscountVariant(discount) !== 'promo_code';
  }

  function isHiddenBenefitsDiscount(discount) {
    return Number(discount?.hide_in_benefits || 0) === 1 || discount?.hide_in_benefits === true;
  }

  function isPromoSourceVisibleToCustomer(promoRow, customerId, { allowSaved = false } = {}) {
    const codeMode = publicDiscountText(promoRow?.code_mode).toLowerCase();
    const assignedCustomerId = Number(promoRow?.assigned_customer_id || 0);
    if (codeMode === 'shared') return true;
    if (assignedCustomerId > 0) {
      return assignedCustomerId === Number(customerId || 0);
    }
    return allowSaved && (Number(promoRow?.is_saved_for_customer || 0) === 1 || promoRow?.is_saved_for_customer === true);
  }


  function formatPublicDiscountBadgeText(discountType, discountValue) {
    const type = publicDiscountText(discountType).toLowerCase();
    const value = Number(discountValue);
    if (!Number.isFinite(value) || value <= 0) return '';
    if (type === 'percent') return '-' + Math.round(value) + '%';
    if (type === 'fixed') return '-' + value + ' \u20bd';
    if (type === 'special_price') return String(value) + ' \u20bd';
    return '';
  }

  function formatPublicApplyScopeText(applyTo) {
    const raw = publicDiscountText(applyTo).toLowerCase();
    if (raw === 'order') return '\u041d\u0430 \u0432\u0435\u0441\u044c \u0437\u0430\u043a\u0430\u0437';
    if (raw === 'product') return '\u041d\u0430 \u0442\u043e\u0432\u0430\u0440\u044b';
    if (raw === 'category') return '\u041d\u0430 \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438 \u0442\u043e\u0432\u0430\u0440\u043e\u0432';
    if (raw === 'combo') return '\u041d\u0430 \u043a\u043e\u043c\u0431\u043e';
    return '';
  }

  function buildPublicDiscountBenefitCard(discount) {
    return {
      id: Number(discount?.id || 0),
      kind: 'discount',
      title: publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(discount?.description),
      badge_text: formatPublicDiscountBadgeText(discount?.discount_type, discount?.discount_value),
      apply_scope_text: formatPublicApplyScopeText(discount?.apply_to),
      expires_at: discount?.ends_at || null,
      is_stackable: Number(discount?.is_stackable || 0) === 1,
      priority: Number(discount?.priority || 0),
      discount_type: publicDiscountText(discount?.discount_type).toLowerCase() || 'percent',
      discount_value: Number(discount?.discount_value || 0),
      apply_to: publicDiscountText(discount?.apply_to).toLowerCase() || 'order',
      min_order_amount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
      max_discount_amount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
    };
  }

  function getPublicPromoRewardMeta(discount) {
    const config = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const reward = parsePublicDiscountObject(config?.promo_reward, {});
    const rewardType = publicDiscountText(
      reward?.reward_type
        ?? (
          ['gift', 'product_discount'].includes(publicDiscountText(reward?.reward_kind).toLowerCase())
            ? 'product'
            : 'discount'
        )
    ).toLowerCase() === 'product'
      ? 'product'
      : 'discount';
    const productRewardType = ['gift', 'product_discount'].includes(publicDiscountText(reward?.product_reward_type ?? reward?.reward_kind).toLowerCase())
      ? publicDiscountText(reward?.product_reward_type ?? reward?.reward_kind).toLowerCase()
      : 'gift';

    if (rewardType === 'product') {
      if (productRewardType === 'gift') {
        return {
          badge_text: '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
          description: publicDiscountText(discount?.description) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a \u043f\u043e \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0443',
          apply_scope_text: '\u041d\u0430 \u0442\u043e\u0432\u0430\u0440\u044b',
        };
      }
      return {
        badge_text: formatPublicDiscountBadgeText(reward?.discount_type, reward?.discount_value) || '\u0421\u043a\u0438\u0434\u043a\u0430',
        description: publicDiscountText(discount?.description) || '\u0421\u043a\u0438\u0434\u043a\u0430 \u043d\u0430 \u0442\u043e\u0432\u0430\u0440 \u043f\u043e \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0443',
        apply_scope_text: '\u041d\u0430 \u0442\u043e\u0432\u0430\u0440\u044b',
      };
    }

    return {
      badge_text: formatPublicDiscountBadgeText(reward?.discount_type, reward?.discount_value) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(discount?.description) || '\u0421\u043a\u0438\u0434\u043a\u0430 \u043f\u043e \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0443',
      apply_scope_text: formatPublicApplyScopeText(reward?.apply_to ?? discount?.apply_to),
    };
  }

  function buildPublicPromoCodeCards(discount, promoRows, customerId) {
    const rewardMeta = getPublicPromoRewardMeta(discount);
    return (Array.isArray(promoRows) ? promoRows : [])
      .filter((row) => isPromoSourceVisibleToCustomer(row, customerId, {
        allowSaved: Number(row?.is_saved_for_customer || 0) === 1 || row?.is_saved_for_customer === true,
      }))
      .map((row) => ({
        id: Number(row?.promo_code_id || row?.id || 0),
        kind: 'promo_code',
        title: publicDiscountText(discount?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
        description: rewardMeta.description,
        badge_text: rewardMeta.badge_text,
        apply_scope_text: rewardMeta.apply_scope_text,
        expires_at: discount?.ends_at || null,
        code: publicDiscountText(row?.code),
        is_copyable: true,
        is_stackable: Number(discount?.is_stackable || 0) === 1,
        usage_limit: row?.usage_limit == null ? null : Number(row.usage_limit || 0),
        usage_count: Number(row?.usage_count || 0),
        status_text: publicDiscountText(row?.code_mode).toLowerCase() === 'shared'
          ? '\u041e\u0431\u0449\u0438\u0439'
          : '\u041f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439',
      }))
      .filter((card) => card.code);
  }

  function toPublicRewardStatusText(status) {
    const raw = publicDiscountText(status).toLowerCase();
    if (raw === 'used') return '\u0418\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043d\u043e';
    if (raw === 'expired') return '\u0418\u0441\u0442\u0435\u043a\u043b\u043e';
    return '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u043e';
  }

  function getDiscountTargetEntityType(row) {
    const explicitType = publicDiscountText(row?.entity_type || row?.target_type || row?.type).toLowerCase();
    if (['product', 'category', 'combo'].includes(explicitType)) return explicitType;
    if (Number(row?.product_id || 0) > 0) return 'product';
    if (Number(row?.category_id || 0) > 0) return 'category';
    if (Number(row?.combo_id || 0) > 0) return 'combo';
    return '';
  }

  function buildGenericDiscountTargetSets(rows) {
    const productIds = new Set();
    const anyProductIds = new Set();
    const exactProductSignaturesByProductId = new Map();
    const categoryIds = new Set();
    const comboIds = new Set();

    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const entityType = getDiscountTargetEntityType(row);
      const productId = Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
      const categoryId = Number(row?.category_id ?? row?.entity_id ?? row?.id ?? 0);
      const comboId = Number(row?.combo_id ?? row?.entity_id ?? row?.id ?? 0);
      if (entityType === 'product' && productId > 0) {
        productIds.add(productId);
        const configMode = normalizePublicProductConfigMode(row?.config_mode, 'any');
        const signature = configMode === 'exact'
          ? buildPublicProductConfigSignature(row?.product_config ?? row?.product_config_json, productId)
          : null;
        if (signature) {
          addPublicExactProductSignature(exactProductSignaturesByProductId, productId, signature);
        } else if (configMode !== 'exact') {
          anyProductIds.add(productId);
        }
        return;
      }
      if (entityType === 'category' && categoryId > 0) {
        categoryIds.add(categoryId);
        return;
      }
      if (entityType === 'combo' && comboId > 0) {
        comboIds.add(comboId);
      }
    });

    return { productIds, anyProductIds, exactProductSignaturesByProductId, categoryIds, comboIds };
  }

  function buildPublicProductTargetSets(rows) {
    const targetSets = buildGenericDiscountTargetSets(rows);
    return {
      productIds: targetSets.productIds,
      anyProductIds: targetSets.anyProductIds,
      exactProductSignaturesByProductId: targetSets.exactProductSignaturesByProductId,
      categoryIds: targetSets.categoryIds,
    };
  }

  function matchDiscountTargetProduct(targetSets, item) {
    if (!item || item.type === 'combo') return false;
    const productId = Number(item?.product_id || 0);
    if (!(productId > 0)) return false;
    if (targetSets?.anyProductIds instanceof Set && targetSets.anyProductIds.has(productId)) {
      return true;
    }
    const exactSignatures = targetSets?.exactProductSignaturesByProductId instanceof Map
      ? targetSets.exactProductSignaturesByProductId.get(productId)
      : null;
    if (!exactSignatures || !exactSignatures.size) return false;
    const itemSignature = buildFavoriteSignature(item);
    return !!(itemSignature && exactSignatures.has(itemSignature));
  }

  function matchDiscountTargetCategory(targetSets, item, productCategoriesMap) {
    if (!item || item.type === 'combo') return false;
    const productId = Number(item?.product_id || 0);
    if (!(productId > 0)) return false;
    const categoryIds = productCategoriesMap.get(productId) || [];
    return categoryIds.some((categoryId) => targetSets?.categoryIds?.has(Number(categoryId || 0)));
  }

  function matchDiscountTargetCombo(targetSets, item) {
    return !!(item?.type === 'combo' && targetSets?.comboIds?.has(Number(item?.combo_id || 0)));
  }

  function matchDiscountTargetScope(targetSets, item, productCategoriesMap, scope = 'product') {
    const normalizedScope = publicDiscountText(scope).toLowerCase() || 'product';
    if (normalizedScope === 'product') {
      return matchDiscountTargetProduct(targetSets, item);
    }
    if (normalizedScope === 'category') {
      return matchDiscountTargetCategory(targetSets, item, productCategoriesMap);
    }
    if (normalizedScope === 'combo') {
      return matchDiscountTargetCombo(targetSets, item);
    }
    return matchDiscountTargetProduct(targetSets, item)
      || matchDiscountTargetCategory(targetSets, item, productCategoriesMap)
      || matchDiscountTargetCombo(targetSets, item);
  }

  function buildPublicDiscountPreviewTargets(discount, rows) {
    const applyTo = publicDiscountText(discount?.apply_to).toLowerCase();
    if (!['product', 'category'].includes(applyTo)) {
      return { productIds: new Set(), categoryIds: new Set() };
    }
    return buildPublicProductTargetSets(rows);
  }

  function clonePreviewItems(items) {
    return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
  }

  function getPreviewItemsTotal(items) {
    return roundPromoMoney(
      (Array.isArray(items) ? items : []).reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
    );
  }

  function computeSimpleDiscountPreviewOutcome({
    discount,
    baseItems,
    baseItemsTotal,
    productCategoriesMap,
    targetSets,
  }) {
    if (!discount) {
      return { items: clonePreviewItems(baseItems), itemsTotal: roundPromoMoney(baseItemsTotal || 0), discountAmount: 0 };
    }

    const items = clonePreviewItems(baseItems);
    const itemsTotal = roundPromoMoney(baseItemsTotal || 0);
    const applyTo = publicDiscountText(discount?.apply_to).toLowerCase();

    if (applyTo === 'order') {
      const minOrderAmount = discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : 0;
      if (minOrderAmount > 0 && itemsTotal < minOrderAmount) {
        return { items, itemsTotal, discountAmount: 0 };
      }
      const discountAmount = discountHelpers.calculateDiscount(
        itemsTotal,
        discount?.discount_type,
        Number(discount?.discount_value || 0),
        discount?.max_discount_amount != null ? Number(discount.max_discount_amount) : null
      );
      return {
        items,
        itemsTotal: roundPromoMoney(Math.max(0, itemsTotal - Number(discountAmount || 0))),
        discountAmount: roundPromoMoney(discountAmount),
      };
    }

    const sets = targetSets || { productIds: new Set(), categoryIds: new Set() };
    let discountAmount = 0;
    for (const item of items) {
      const matches = matchDiscountTargetScope(sets, item, productCategoriesMap, applyTo);
      if (!matches) continue;

      const lineTotal = Number(item?.line_total || 0);
      const lineDiscount = discountHelpers.calculateDiscount(
        lineTotal,
        discount?.discount_type,
        Number(discount?.discount_value || 0),
        discount?.max_discount_amount != null ? Number(discount.max_discount_amount) : null
      );
      if (!(lineDiscount > 0)) continue;
      item.line_total = roundPromoMoney(Math.max(0, lineTotal - lineDiscount));
      discountAmount += lineDiscount;
    }

    return {
      items,
      itemsTotal: getPreviewItemsTotal(items),
      discountAmount: roundPromoMoney(discountAmount),
    };
  }

  function createManualDiscountCard(discount, outcome, extra = {}) {
    return {
      ...buildPublicDiscountBenefitCard(discount),
      discount_amount: roundPromoMoney(outcome?.discountAmount || 0),
      is_stackable: Number(discount?.is_stackable || 0) === 1,
      is_selected: false,
      disabled_reason: '',
      source: extra.source || 'discount',
      reward_id: extra.rewardId || null,
      products: Array.isArray(extra.products) ? extra.products : [],
    };
  }

  function parsePublicRewardPayload(row) {
    return parsePublicDiscountObject(row?.reward_payload_json, {});
  }

  function buildRewardTargetPayload(rows, configMode = 'any') {
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const productId = Number(row?.product_id ?? row?.entity_id ?? 0) || null;
        const categoryId = Number(row?.category_id ?? row?.entity_id ?? 0) || null;
        const comboId = Number(row?.combo_id ?? row?.entity_id ?? 0) || null;
        const entityTypeRaw = publicDiscountText(row?.entity_type).toLowerCase();
        const entityType = ['product', 'category', 'combo'].includes(entityTypeRaw)
          ? entityTypeRaw
          : (productId ? 'product' : (categoryId ? 'category' : (comboId ? 'combo' : '')));
        if (!entityType) return null;
        return {
          entity_type: entityType,
          entity_id: entityType === 'product'
            ? productId
            : entityType === 'category'
              ? categoryId
              : comboId,
          product_id: productId,
          category_id: categoryId,
          combo_id: comboId,
          config_mode: entityType === 'product'
            ? normalizePublicProductConfigMode(row?.config_mode ?? configMode, configMode)
            : 'any',
          product_config: entityType === 'product'
            ? normalizePublicProductConfigPayload(row?.product_config ?? row?.product_config_json, productId)
            : null,
        };
      })
      .filter(Boolean);
  }

  function getRewardPayloadTargetRows(payload) {
    const source = Array.isArray(payload?.targets) && payload.targets.length
      ? payload.targets
      : (Array.isArray(payload?.products) ? payload.products : []);
    return buildRewardTargetPayload(source);
  }

  function attachRewardSourceMetadata(payload, meta = {}) {
    const nextPayload = payload && typeof payload === 'object' ? { ...payload } : {};
    nextPayload.source_kind = publicDiscountText(meta.sourceKind ?? nextPayload.source_kind).toLowerCase() || null;
    nextPayload.source_discount_id = Number(meta.sourceDiscountId ?? nextPayload.source_discount_id ?? 0) || null;
    nextPayload.source_promo_code_id = Number(meta.sourcePromoCodeId ?? nextPayload.source_promo_code_id ?? 0) || null;
    nextPayload.source_code = publicDiscountText(meta.sourceCode ?? nextPayload.source_code) || null;
    nextPayload.source_title = publicDiscountText(meta.sourceTitle ?? nextPayload.source_title) || null;
    nextPayload.claimed_from = publicDiscountText(meta.claimedFrom ?? nextPayload.claimed_from).toLowerCase() || null;
    return nextPayload;
  }


  function normalizePublicGiftRewardProducts(products, availableProductIds = null) {
    const availableIds = availableProductIds instanceof Set ? availableProductIds : null;
    return (Array.isArray(products) ? products : []).map((product) => {
      const productId = Number(product?.id || product?.product_id || 0) || null;
      const isAvailable = availableIds
        ? (productId > 0 && availableIds.has(productId))
        : (product?.is_available !== false);
      return {
        ...product,
        id: productId,
        is_available: isAvailable,
      };
    });
  }

  function buildPublicGiftRewardCard(rewardRow, availableProductIds = null) {
    const payload = parsePublicRewardPayload(rewardRow);
    const products = normalizePublicGiftRewardProducts(payload?.products, availableProductIds);
    const firstProduct = products[0] || null;
    const count = products.length;
    const countText = count > 1 ? ', ' + count + ' \u0442\u043e\u0432\u0430\u0440\u0430' : '';
    const hasUnavailableProducts = products.some((product) => product?.id > 0 && product?.is_available !== true);
    return {
      id: Number(rewardRow?.id || 0),
      discount_id: Number(payload?.source_discount_id || rewardRow?.discount_id || 0) || null,
      kind: 'gift',
      title: publicDiscountText(payload?.title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      description: publicDiscountText(payload?.description) || publicDiscountText(firstProduct?.title),
      badge_text: publicDiscountText(payload?.badge_text) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      apply_scope_text: count
        ? (publicDiscountText(firstProduct?.title) || '\u0422\u043e\u0432\u0430\u0440') + countText
        : '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043f\u043e\u0434\u0430\u0440\u043e\u043a',
      expires_at: null,
      is_selected: false,
      is_applicable: Number(rewardRow?.id || 0) > 0,
      disabled_reason: hasUnavailableProducts ? 'GIFT_UNAVAILABLE' : '',
      action_mode: 'receive',
      is_receivable: Number(rewardRow?.id || 0) > 0 && count > 0 && !hasUnavailableProducts,
      has_unavailable_products: hasUnavailableProducts,
      reward_id: Number(rewardRow?.id || 0) || null,
      reward_status: toPublicRewardStatusText(rewardRow?.status),
      product_count: count,
      photo_url: firstProduct?.photo_url || null,
      total_value: Number(payload?.total_value || 0),
      products,
      reward_preview: {
        kind: 'gift',
        title: publicDiscountText(payload?.title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
        description: publicDiscountText(payload?.description) || publicDiscountText(firstProduct?.title),
        badge_text: publicDiscountText(payload?.badge_text) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
        apply_scope_text: count
          ? (publicDiscountText(firstProduct?.title) || '\u0422\u043e\u0432\u0430\u0440') + countText
          : '\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0439 \u043f\u043e\u0434\u0430\u0440\u043e\u043a',
        photo_url: firstProduct?.photo_url || null,
        products,
      },
    };
  }

  async function loadPublicGiftRewardAvailableProductIds(tenantId, storeId, rewardRows, queryRunner = null) {
    const productIds = [...new Set(
      (Array.isArray(rewardRows) ? rewardRows : []).flatMap((rewardRow) => {
        const payload = parsePublicRewardPayload(rewardRow);
        return (Array.isArray(payload?.products) ? payload.products : [])
          .map((product) => Number(product?.id || product?.product_id || 0))
          .filter((id) => id > 0);
      })
    )];
    if (!productIds.length) return new Set();
    const availableProducts = await loadCheckoutBenefitRewardClaimProducts(
      queryRunner,
      tenantId,
      storeId,
      productIds
    );
    return new Set(
      (Array.isArray(availableProducts) ? availableProducts : [])
        .map((product) => Number(product?.product_id || 0))
        .filter((id) => id > 0)
    );
  }

  function buildPublicRewardDiscountSource(rewardRow) {
    const payload = parsePublicRewardPayload(rewardRow);
    const discount = {
      id: Number(rewardRow?.id || 0),
      title: publicDiscountText(payload?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(payload?.description),
      discount_type: publicDiscountText(payload?.discount_type || 'percent').toLowerCase() || 'percent',
      discount_value: Number(payload?.discount_value || 0),
      apply_to: publicDiscountText(payload?.apply_to || 'order').toLowerCase() || 'order',
      max_discount_amount: payload?.max_discount_amount != null ? Number(payload.max_discount_amount || 0) : null,
      min_order_amount: payload?.min_order_amount != null ? Number(payload.min_order_amount || 0) : null,
      is_stackable: payload?.is_stackable ? 1 : 0,
    };
    const targetRows = getRewardPayloadTargetRows(payload);
    return {
      discount,
      targetRows,
      targetSets: buildDiscountProductTargetSets(targetRows),
      rewardId: Number(rewardRow?.id || 0) || null,
      payload,
    };
  }

  function normalizePublicProgressSlotCount(value) {
    const normalized = Number(value || 0);
    if (!Number.isFinite(normalized)) return 0;
    return Math.max(0, Math.floor(normalized));
  }

  function getPublicProgressDisplayValue(progressBasis, progressValue, thresholdValue, pendingRewardCount) {
    const basis = publicDiscountText(progressBasis).toLowerCase() || 'orders';
    const threshold = Number(thresholdValue || 0);
    const current = Number(progressValue || 0);
    const pendingCount = normalizePublicProgressSlotCount(pendingRewardCount);
    if (!(threshold > 0)) return Math.max(0, current);

    if (basis === 'amount') {
      if (pendingCount > 0) return threshold;
      const remainder = current % threshold;
      if (remainder === 0 && current > 0) return Math.min(current, threshold);
      return Math.max(0, Math.min(threshold, remainder || current));
    }

    const normalizedThreshold = normalizePublicProgressSlotCount(threshold);
    const normalizedCurrent = normalizePublicProgressSlotCount(current);
    if (!(normalizedThreshold > 0)) return normalizedCurrent;
    if (pendingCount > 0) return normalizedThreshold;
    const remainder = normalizedCurrent % normalizedThreshold;
    if (remainder === 0 && normalizedCurrent > 0) return Math.min(normalizedCurrent, normalizedThreshold);
    return Math.max(0, Math.min(normalizedThreshold, remainder || normalizedCurrent));
  }

  function normalizePublicProgressPendingRewardMode(value) {
    return publicDiscountText(value).toLowerCase() === 'single_pending' ? 'single_pending' : 'stack';
  }

  function getPublicProgressRewardQty(mechanic) {
    const rewardQty = Number(mechanic?.reward_qty || 0);
    if (!Number.isFinite(rewardQty) || rewardQty <= 0) return 1;
    return Math.max(1, Math.floor(rewardQty));
  }

  function getPublicProgressBenefitState(discount, progressRow) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const progressBasis = publicDiscountText(mechanic?.progress_basis).toLowerCase() || 'orders';
    const thresholdValue = Number(mechanic?.threshold_value || mechanic?.buy_qty || 0);
    const progressValue = Number(progressRow?.progress_value || 0);
    const pendingRewardCount = Number(progressRow?.pending_reward_count || 0);
    const rewardKind = publicDiscountText(mechanic?.reward_kind).toLowerCase() || 'gift';
    const rewardQty = getPublicProgressRewardQty(mechanic);
    const pendingRewardMode = normalizePublicProgressPendingRewardMode(mechanic?.pending_reward_mode);
    const rewardConfig = parsePublicDiscountObject(mechanic?.reward, {});
    const displayProgressValue = getPublicProgressDisplayValue(
      progressBasis,
      progressValue,
      thresholdValue,
      pendingRewardCount
    );
    const progressRatio = thresholdValue > 0
      ? Math.max(0, Math.min(1, Number(displayProgressValue || 0) / thresholdValue))
      : 0;
    const redemptionMode = publicDiscountText(mechanic?.redemption_mode).toLowerCase() || 'reset';
    const rewardText = rewardKind === 'promo_code'
      ? '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434'
      : rewardKind === 'discount'
        ? '\u0421\u043a\u0438\u0434\u043a\u0430'
        : '\u041f\u043e\u0434\u0430\u0440\u043e\u043a';
    const progressText = progressBasis === 'amount'
      ? `${Math.min(displayProgressValue, thresholdValue || displayProgressValue)} / ${thresholdValue || 0} \u20bd`
      : `${Math.min(displayProgressValue, thresholdValue || displayProgressValue)} / ${thresholdValue || 0}`;
    return {
      mechanic,
      progressBasis,
      thresholdValue,
      progressValue,
      pendingRewardCount,
      rewardKind,
      rewardQty,
      pendingRewardMode,
      rewardConfig,
      displayProgressValue,
      progressRatio,
      redemptionMode,
      rewardText,
      progressText,
    };
  }

  function getPublicProgressQualifyingScopeMode(discount) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const scopeMode = publicDiscountText(mechanic?.qualifying_scope_mode).toLowerCase();
    return ['product', 'category'].includes(scopeMode) ? scopeMode : 'none';
  }

  function getPublicProgressInteractionMode(discount, state = null) {
    const progressState = state && typeof state === 'object'
      ? state
      : getPublicProgressBenefitState(discount, null);
    if (
      publicDiscountText(progressState?.progressBasis).toLowerCase() === 'items'
      && ['product', 'category'].includes(getPublicProgressQualifyingScopeMode(discount))
    ) {
      return 'products_sheet';
    }
    return 'info_modal';
  }

  function getPublicProgressClaimMode(discount, state = null) {
    const progressState = state && typeof state === 'object'
      ? state
      : getPublicProgressBenefitState(discount, null);
    return publicDiscountText(progressState?.rewardKind).toLowerCase() === 'gift'
      ? 'gift_sheet'
      : 'direct';
  }

  function collectPublicProgressQualifyingCategoryIds(discount) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    return [...new Set(
      (Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [])
        .map((row) => {
          const entityType = publicDiscountText(row?.entity_type).toLowerCase();
          if (entityType && entityType !== 'category') return 0;
          return Number(row?.category_id ?? row?.entity_id ?? row?.id ?? 0);
        })
        .filter((id) => id > 0)
    )];
  }

  function collectPublicProgressRewardProductIds(discount) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const giftProductIds = (Array.isArray(mechanic?.reward?.gift_products) ? mechanic.reward.gift_products : [])
      .map((row) => Number(row?.entity_id ?? row?.product_id ?? row?.id ?? 0))
      .filter((id) => id > 0);
    const discountProductIds = (Array.isArray(mechanic?.reward?.discount?.products) ? mechanic.reward.discount.products : [])
      .map((row) => Number(row?.entity_id ?? row?.product_id ?? row?.id ?? 0))
      .filter((id) => id > 0);
    return [...new Set([...giftProductIds, ...discountProductIds])];
  }

  function buildPublicProgressGiftRewardPreview(discount, state, productsMap, availableRewardProductIds = null) {
    const payload = buildGiftRewardPayload(discount, state?.mechanic || {}, productsMap);
    const products = normalizePublicGiftRewardProducts(payload?.products, availableRewardProductIds)
      .filter((product) => product?.is_available === true);
    const firstProduct = products[0] || null;
    const productCount = products.length;
    const countText = productCount > 1 ? `, ${productCount} товара` : '';
    return {
      kind: 'gift',
      icon_kind: 'gift',
      title: publicDiscountText(payload?.title) || 'Подарок',
      description: publicDiscountText(payload?.description) || publicDiscountText(firstProduct?.title),
      badge_text: publicDiscountText(payload?.badge_text) || 'Подарок',
      apply_scope_text: productCount
        ? `${publicDiscountText(firstProduct?.title) || 'Товар'}${countText}`
        : (state?.rewardText || 'Подарок'),
      photo_url: publicDiscountText(firstProduct?.photo_url) || null,
      product_count: productCount,
      total_value: Number(payload?.total_value || 0),
      products,
    };
  }

  function buildPublicProgressDiscountRewardPreview(discount, state, productsMap) {
    const payload = buildDiscountRewardPayload(discount, state?.mechanic || {}, productsMap);
    const products = Array.isArray(payload?.products) ? payload.products : [];
    return {
      kind: 'discount',
      icon_kind: 'discount',
      title: publicDiscountText(payload?.title) || 'Скидка',
      description: publicDiscountText(payload?.description),
      badge_text: formatPublicDiscountBadgeText(payload?.discount_type, payload?.discount_value) || 'Скидка',
      apply_scope_text: formatPublicApplyScopeText(payload?.apply_to) || 'Скидка',
      discount_type: publicDiscountText(payload?.discount_type || 'percent').toLowerCase() || 'percent',
      discount_value: Number(payload?.discount_value || 0),
      max_discount_amount: payload?.max_discount_amount != null ? Number(payload.max_discount_amount || 0) : null,
      min_order_amount: payload?.min_order_amount != null ? Number(payload.min_order_amount || 0) : null,
      is_stackable: Number(payload?.is_stackable || 0) === 1 || payload?.is_stackable === true,
      products,
      photo_url: null,
    };
  }

  function buildPublicProgressPromoRewardPreview(discount, state) {
    const reward = parsePublicDiscountObject(state?.mechanic?.reward, {});
    const promoSource = parsePublicDiscountObject(reward?.promo_code, {});
    const sourceCode = publicDiscountText(promoSource?.source_code);
    return {
      kind: 'promo_code',
      icon_kind: 'promo_code',
      title: publicDiscountText(discount?.title) || 'Промокод',
      description: publicDiscountText(discount?.description) || 'Промокод в подарок',
      badge_text: 'Промокод',
      apply_scope_text: sourceCode ? `Источник: ${sourceCode}` : 'Промокод в подарок',
      code_preview: sourceCode || null,
      source_code: sourceCode || null,
    };
  }

  function buildPublicProgressRewardPreview(discount, state, productsMap = new Map(), availableRewardProductIds = null) {
    if (!discount) return null;
    const rewardKind = publicDiscountText(state?.rewardKind).toLowerCase() || 'gift';
    if (rewardKind === 'discount') {
      return buildPublicProgressDiscountRewardPreview(discount, state, productsMap);
    }
    if (rewardKind === 'promo_code') {
      return buildPublicProgressPromoRewardPreview(discount, state);
    }
    return buildPublicProgressGiftRewardPreview(discount, state, productsMap, availableRewardProductIds);
  }

  function buildPublicProgressRewardSlot(state, rewardPreview) {
    const preview = rewardPreview && typeof rewardPreview === 'object' ? rewardPreview : {};
    const previewProducts = Array.isArray(preview?.products) ? preview.products : [];
    const firstProduct = previewProducts[0] || null;
    const rewardKind = publicDiscountText(preview?.kind || state?.rewardKind).toLowerCase() || 'gift';
    return {
      kind: rewardKind,
      icon_kind: rewardKind,
      title: publicDiscountText(preview?.title) || state?.rewardText || 'Награда',
      badge_text: publicDiscountText(preview?.badge_text) || state?.rewardText || 'Награда',
      subtitle: publicDiscountText(preview?.apply_scope_text),
      photo_url: rewardKind === 'gift'
        ? (publicDiscountText(preview?.photo_url || firstProduct?.photo_url) || null)
        : null,
      product_count: Number(preview?.product_count || previewProducts.length || 0),
      code_preview: publicDiscountText(preview?.code_preview || preview?.source_code) || null,
      is_claimable: Number(state?.pendingRewardCount || 0) > 0,
      pending_reward_count: Number(state?.pendingRewardCount || 0),
    };
  }

  function buildPublicProgressBenefitCard(discount, progressRow, progressVisual = null, extra = null) {
    const state = getPublicProgressBenefitState(discount, progressRow);
    const rewardPreview = extra && typeof extra === 'object' ? (extra.rewardPreview || null) : null;
    return {
      id: Number(discount?.id || 0),
      kind: 'progress',
      title: publicDiscountText(discount?.title) || '\u041d\u0430\u043a\u043e\u043f\u0438\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u0430\u043a\u0446\u0438\u044f',
      description: publicDiscountText(discount?.description) || `\u041f\u0440\u043e\u0433\u0440\u0435\u0441\u0441: ${state.progressText}`,
      badge_text: state.pendingRewardCount > 0 ? `${state.pendingRewardCount}` : state.progressText,
      apply_scope_text: state.pendingRewardCount > 0 ? `\u041c\u043e\u0436\u043d\u043e \u0437\u0430\u0431\u0440\u0430\u0442\u044c: ${state.rewardText}` : `\u0421\u043b\u0435\u0434\u0443\u044e\u0449\u0430\u044f \u043d\u0430\u0433\u0440\u0430\u0434\u0430: ${state.rewardText}`,
      expires_at: discount?.ends_at || null,
      is_claimable: state.pendingRewardCount > 0,
      pending_reward_count: state.pendingRewardCount,
      progress_value: state.progressValue,
      progress_display_value: state.displayProgressValue,
      threshold_value: state.thresholdValue,
      progress_basis: state.progressBasis,
      progress_ratio: state.progressRatio,
      reward_kind: state.rewardKind,
      reward_qty: state.rewardQty,
      pending_reward_mode: state.pendingRewardMode,
      claim_mode: getPublicProgressClaimMode(discount, state),
      reward_config: state.rewardConfig,
      discount_id: Number(discount?.id || 0),
      redemption_mode: state.redemptionMode,
      interaction_mode: extra && typeof extra === 'object'
        ? (publicDiscountText(extra.interactionMode).toLowerCase() || getPublicProgressInteractionMode(discount, state))
        : getPublicProgressInteractionMode(discount, state),
      qualifying_scope_mode: extra && typeof extra === 'object'
        ? (publicDiscountText(extra.qualifyingScopeMode).toLowerCase() || getPublicProgressQualifyingScopeMode(discount))
        : getPublicProgressQualifyingScopeMode(discount),
      reward_preview: rewardPreview,
      progress_visual: progressVisual && typeof progressVisual === 'object' ? progressVisual : null,
    };
  }

  function buildPublicRewardPromoCard(rewardRow) {
    const payload = parsePublicRewardPayload(rewardRow);
    const code = publicDiscountText(payload?.code || payload?.source_code);
    return {
      id: Number(rewardRow?.id || 0),
      kind: 'promo_code',
      title: publicDiscountText(payload?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
      description: publicDiscountText(payload?.description),
      badge_text: publicDiscountText(payload?.badge_text) || '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
      apply_scope_text: publicDiscountText(payload?.apply_scope_text),
      expires_at: payload?.expires_at || null,
      code,
      is_copyable: false,
      is_stackable: Number(payload?.is_stackable || 0) === 1 || payload?.is_stackable === true,
      usage_limit: null,
      usage_count: 0,
      status_text: publicDiscountText(payload?.status_text) || '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
      is_applicable: Number(rewardRow?.id || 0) > 0,
      disabled_reason: '',
      is_selected: false,
      source: 'reward_promo',
      action_mode: 'select',
      reward_id: Number(rewardRow?.id || 0) || null,
      products: Array.isArray(payload?.products) ? payload.products : [],
    };
  }

  function buildPublicCompletedSourcePromoCardFromRewardRow(rewardRow) {
    const payload = parsePublicRewardPayload(rewardRow);
    return {
      id: `completed_source_promo_${Number(rewardRow?.id || 0)}`,
      kind: 'completed',
      title: publicDiscountText(payload?.source_code) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
      description: publicDiscountText(payload?.source_title) || publicDiscountText(payload?.title),
      status_text: '\u0417\u0430\u0432\u0435\u0440\u0448\u0435\u043d\u043e',
      completed_at: rewardRow?.claimed_at || rewardRow?.updated_at || rewardRow?.created_at || null,
      source_kind: publicDiscountText(payload?.source_kind).toLowerCase() || 'promo_code',
    };
  }

  function buildPublicCompletedRewardCardFromRewardRow(rewardRow) {
    const payload = parsePublicRewardPayload(rewardRow);
    const rewardType = publicDiscountText(rewardRow?.reward_type).toLowerCase();
    const title = publicDiscountText(payload?.title)
      || (rewardType === 'promo_code'
        ? '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434'
        : rewardType === 'discount'
          ? '\u0421\u043a\u0438\u0434\u043a\u0430'
          : '\u041f\u043e\u0434\u0430\u0440\u043e\u043a');
    return {
      id: `completed_reward_${Number(rewardRow?.id || 0)}`,
      kind: rewardType === 'promo_code' ? 'promo_code' : rewardType === 'discount' ? 'discount' : 'gift',
      title,
      description: publicDiscountText(payload?.description),
      status_text: toPublicRewardStatusText(rewardRow?.status),
      completed_at: rewardRow?.used_at || rewardRow?.updated_at || rewardRow?.created_at || null,
      source_kind: publicDiscountText(payload?.source_kind).toLowerCase() || rewardType,
    };
  }

  function buildPublicCompletedCardsFromRewardRows(rewardRows) {
    const completed = [];
    const seenKeys = new Set();
    for (const rewardRow of Array.isArray(rewardRows) ? rewardRows : []) {
      const payload = parsePublicRewardPayload(rewardRow);
      const sourcePromoId = Number(payload?.source_promo_code_id || 0);
      if (
        sourcePromoId > 0
        && publicDiscountText(payload?.claimed_from).toLowerCase() === 'promo'
      ) {
        const sourceKey = `source_promo_${Number(rewardRow?.id || 0)}`;
        if (!seenKeys.has(sourceKey)) {
          seenKeys.add(sourceKey);
          completed.push(buildPublicCompletedSourcePromoCardFromRewardRow(rewardRow));
        }
      }

      const rewardType = publicDiscountText(rewardRow?.reward_type).toLowerCase();
      const rewardStatus = publicDiscountText(rewardRow?.status).toLowerCase();
      if (rewardStatus === 'available' || !['discount', 'promo_code'].includes(rewardType)) continue;
      const rewardKey = `reward_${Number(rewardRow?.id || 0)}`;
      if (seenKeys.has(rewardKey)) continue;
      seenKeys.add(rewardKey);
      completed.push(buildPublicCompletedRewardCardFromRewardRow(rewardRow));
    }
    return completed;
  }

  async function loadCustomerAssignedPromoDiscounts(tenantId, storeId, customerId) {
    if (!(Number(customerId || 0) > 0)) return [];
    const [rows] = await db.query(
      `SELECT DISTINCT d.*
         FROM mkt_discount_promo_codes pc
         INNER JOIN mkt_discounts d
           ON d.id = pc.discount_id
          AND d.tenant_id = pc.tenant_id
        WHERE pc.tenant_id = ?
          AND (pc.store_id = ? OR pc.store_id = 0 OR pc.store_id IS NULL)
          AND pc.assigned_customer_id = ?
          AND pc.is_active = 1
          AND d.is_active = 1`,
      [tenantId, storeId, customerId]
    );

    return (Array.isArray(rows) ? rows : [])
      .filter((discount) => discountHelpers.isDiscountActive(discount) && isPublicPromoSimpleDiscount(discount));
  }

  function normalizeBenefitPromoSourceRow(row, { isSavedForCustomer = false } = {}) {
    if (!row || typeof row !== 'object') return null;
    const promoCodeId = Number(row?.promo_code_id || row?.id || 0);
    const discountId = Number(row?.discount_id || 0);
    if (!(promoCodeId > 0) || !(discountId > 0)) return null;
    return {
      ...row,
      id: promoCodeId,
      promo_code_id: promoCodeId,
      discount_id: discountId,
      is_active: Number(row?.is_active ?? row?.promo_is_active ?? 0) === 1 ? 1 : 0,
      is_saved_for_customer: isSavedForCustomer ? 1 : (Number(row?.is_saved_for_customer || 0) === 1 ? 1 : 0),
    };
  }

  async function loadBenefitPromoSourceRowsByDiscountIds(tenantId, storeId, discountIds, { includeInactive = false } = {}) {
    const ids = [...new Set((Array.isArray(discountIds) ? discountIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return [];
    const activeSql = includeInactive ? '' : ' AND is_active = 1';
    const [rows] = await db.query(
      `SELECT id AS promo_code_id,
              discount_id,
              code,
              code_mode,
              usage_limit,
              usage_count,
              assigned_customer_id,
              is_active
         FROM mkt_discount_promo_codes
        WHERE tenant_id = ?
          AND (store_id = ? OR store_id = 0 OR store_id IS NULL)
          AND discount_id IN (?)${activeSql}`,
      [tenantId, storeId, ids]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizeBenefitPromoSourceRow(row))
      .filter(Boolean);
  }

  async function loadCustomerSavedBenefitPromoCodeIds(tenantId, storeId, customerId, discountIds = []) {
    const normalizedCustomerId = Number(customerId || 0);
    const ids = [...new Set((Array.isArray(discountIds) ? discountIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!(normalizedCustomerId > 0) || !ids.length) return new Set();
    try {
      await ensureCustomerBenefitPromoStorage();
    } catch (error) {
      console.warn('mkt_customer_benefit_promos storage is unavailable for public benefits:', error?.code || error?.message || error);
      return new Set();
    }
    let rows;
    try {
      [rows] = await db.query(
        `SELECT promo_code_id
           FROM mkt_customer_benefit_promos
          WHERE tenant_id = ?
            AND store_id = ?
            AND customer_id = ?
            AND discount_id IN (?)`,
        [tenantId, storeId, normalizedCustomerId, ids]
      );
    } catch (error) {
      if (!isDiscountRuntimeTableMissingError(error)) {
        console.warn('Failed to load saved customer promo ids for public benefits:', error?.code || error?.message || error);
        return new Set();
      }
      try {
        await ensureCustomerBenefitPromoStorage();
        [rows] = await db.query(
          `SELECT promo_code_id
             FROM mkt_customer_benefit_promos
            WHERE tenant_id = ?
              AND store_id = ?
              AND customer_id = ?
              AND discount_id IN (?)`,
          [tenantId, storeId, normalizedCustomerId, ids]
        );
      } catch (retryError) {
        console.warn('Failed to restore saved customer promo storage for public benefits:', retryError?.code || retryError?.message || retryError);
        return new Set();
      }
    }
    return new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => Number(row?.promo_code_id || 0))
        .filter((id) => id > 0)
    );
  }

  async function loadBenefitPromoRowsMap({
    tenantId,
    storeId,
    customerId,
    discounts,
    includeInactive = false,
  }) {
    const promoDiscounts = (Array.isArray(discounts) ? discounts : [])
      .filter((discount) => isPublicPromoSimpleDiscount(discount));
    const discountById = new Map(
      promoDiscounts
        .map((discount) => [Number(discount?.id || 0), discount])
        .filter(([discountId]) => discountId > 0)
    );
    const promoDiscountIds = [...discountById.keys()];
    if (!promoDiscountIds.length) return new Map();

    const [promoRows, savedPromoCodeIds] = await Promise.all([
      loadBenefitPromoSourceRowsByDiscountIds(tenantId, storeId, promoDiscountIds, { includeInactive }),
      loadCustomerSavedBenefitPromoCodeIds(tenantId, storeId, customerId, promoDiscountIds),
    ]);
    const rowsByDiscountId = new Map();
    const seenPromoCodeIds = new Set();

    for (const rawRow of promoRows) {
      const discountId = Number(rawRow?.discount_id || 0);
      const discount = discountById.get(discountId);
      if (!discount) continue;
      const promoCodeId = Number(rawRow?.promo_code_id || rawRow?.id || 0);
      const isSavedForCustomer = savedPromoCodeIds.has(promoCodeId);
      const row = normalizeBenefitPromoSourceRow(rawRow, { isSavedForCustomer });
      if (!row) continue;

      if (isHiddenBenefitsDiscount(discount) && !isSavedForCustomer) continue;
      if (!isPromoSourceVisibleToCustomer(row, customerId, { allowSaved: isSavedForCustomer })) continue;
      if (seenPromoCodeIds.has(promoCodeId)) continue;
      seenPromoCodeIds.add(promoCodeId);

      if (!rowsByDiscountId.has(discountId)) rowsByDiscountId.set(discountId, []);
      rowsByDiscountId.get(discountId).push(row);
    }

    return rowsByDiscountId;
  }

  let ensureDiscountRuntimeTablesPromise = null;
  let discountRuntimeTablesReady = false;

  function isDiscountRuntimeTableMissingError(error) {
    if (String(error?.code || '') !== 'ER_NO_SUCH_TABLE') return false;
    const message = String(error?.sqlMessage || error?.message || '').toLowerCase();
    return message.includes('mkt_discount_rewards')
      || message.includes('mkt_discount_progress')
      || message.includes('mkt_customer_benefit_promos');
  }

  async function ensureDiscountRuntimeTables() {
    if (discountRuntimeTablesReady) return;
    if (!ensureDiscountRuntimeTablesPromise) {
      ensureDiscountRuntimeTablesPromise = (async () => {
        await db.query(
          `CREATE TABLE IF NOT EXISTS \`mkt_discount_progress\` (
             \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
             \`tenant_id\` int NOT NULL DEFAULT '1',
             \`customer_id\` int NOT NULL,
             \`discount_id\` int UNSIGNED NOT NULL,
             \`progress_value\` decimal(12,2) NOT NULL DEFAULT '0.00',
             \`pending_reward_count\` int UNSIGNED NOT NULL DEFAULT '0',
             \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
             \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
             PRIMARY KEY (\`id\`),
             UNIQUE KEY \`uq_mkt_discount_progress_customer\` (\`tenant_id\`,\`customer_id\`,\`discount_id\`),
             KEY \`idx_mkt_discount_progress_discount\` (\`tenant_id\`,\`discount_id\`)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
        await db.query(
          `CREATE TABLE IF NOT EXISTS \`mkt_discount_rewards\` (
             \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
             \`tenant_id\` int NOT NULL DEFAULT '1',
             \`customer_id\` int NOT NULL,
             \`discount_id\` int UNSIGNED NOT NULL,
             \`reward_type\` enum('gift','promo_code','discount') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'gift',
             \`reward_payload_json\` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
             \`status\` enum('available','used','expired') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'available',
             \`claimed_at\` timestamp NULL DEFAULT NULL,
             \`used_at\` timestamp NULL DEFAULT NULL,
             \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
             \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
             PRIMARY KEY (\`id\`),
             KEY \`idx_mkt_discount_rewards_customer_status\` (\`tenant_id\`,\`customer_id\`,\`status\`),
             KEY \`idx_mkt_discount_rewards_discount\` (\`tenant_id\`,\`discount_id\`)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
        await db.query(
          `CREATE TABLE IF NOT EXISTS \`mkt_customer_benefit_promos\` (
             \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
             \`tenant_id\` int NOT NULL DEFAULT '1',
             \`store_id\` int NOT NULL DEFAULT '1',
             \`customer_id\` int NOT NULL,
             \`promo_code_id\` int UNSIGNED NOT NULL,
             \`discount_id\` int UNSIGNED NOT NULL,
             \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
             \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
             PRIMARY KEY (\`id\`),
             UNIQUE KEY \`uq_mkt_customer_benefit_promos_customer_promo\` (\`tenant_id\`,\`store_id\`,\`customer_id\`,\`promo_code_id\`),
             KEY \`idx_mkt_customer_benefit_promos_customer\` (\`tenant_id\`,\`store_id\`,\`customer_id\`),
             KEY \`idx_mkt_customer_benefit_promos_promo\` (\`tenant_id\`,\`promo_code_id\`),
             KEY \`idx_mkt_customer_benefit_promos_discount\` (\`tenant_id\`,\`discount_id\`),
             CONSTRAINT \`fk_mkt_customer_benefit_promos_promo\`
               FOREIGN KEY (\`promo_code_id\`) REFERENCES \`mkt_discount_promo_codes\` (\`id\`) ON DELETE CASCADE,
             CONSTRAINT \`fk_mkt_customer_benefit_promos_discount\`
               FOREIGN KEY (\`discount_id\`) REFERENCES \`mkt_discounts\` (\`id\`) ON DELETE CASCADE
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
        );
        customerBenefitPromoStorageReady = true;
        discountRuntimeTablesReady = true;
      })().catch((error) => {
        discountRuntimeTablesReady = false;
        customerBenefitPromoStorageReady = false;
        throw error;
      }).finally(() => {
        ensureDiscountRuntimeTablesPromise = null;
      });
    }
    await ensureDiscountRuntimeTablesPromise;
  }

  async function ensureCustomerBenefitPromoStorage() {
    if (customerBenefitPromoStorageReady) return;
    if (ensureCustomerBenefitPromoStoragePromise) return ensureCustomerBenefitPromoStoragePromise;
    ensureCustomerBenefitPromoStoragePromise = (async () => {
      await ensureDiscountRuntimeTables();
      await db.query(
        `CREATE TABLE IF NOT EXISTS \`mkt_customer_benefit_promos\` (
           \`id\` int UNSIGNED NOT NULL AUTO_INCREMENT,
           \`tenant_id\` int NOT NULL DEFAULT '1',
           \`store_id\` int NOT NULL DEFAULT '1',
           \`customer_id\` int NOT NULL,
           \`promo_code_id\` int UNSIGNED NOT NULL,
           \`discount_id\` int UNSIGNED NOT NULL,
           \`created_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
           \`updated_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (\`id\`),
           UNIQUE KEY \`uq_mkt_customer_benefit_promos_customer_promo\` (\`tenant_id\`,\`store_id\`,\`customer_id\`,\`promo_code_id\`),
           KEY \`idx_mkt_customer_benefit_promos_customer\` (\`tenant_id\`,\`store_id\`,\`customer_id\`),
           KEY \`idx_mkt_customer_benefit_promos_promo\` (\`tenant_id\`,\`promo_code_id\`),
           KEY \`idx_mkt_customer_benefit_promos_discount\` (\`tenant_id\`,\`discount_id\`),
           CONSTRAINT \`fk_mkt_customer_benefit_promos_promo\`
             FOREIGN KEY (\`promo_code_id\`) REFERENCES \`mkt_discount_promo_codes\` (\`id\`) ON DELETE CASCADE,
           CONSTRAINT \`fk_mkt_customer_benefit_promos_discount\`
             FOREIGN KEY (\`discount_id\`) REFERENCES \`mkt_discounts\` (\`id\`) ON DELETE CASCADE
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      );
      customerBenefitPromoStorageReady = true;
    })()
      .catch((err) => {
        customerBenefitPromoStorageReady = false;
        ensureCustomerBenefitPromoStoragePromise = null;
        throw err;
      })
      .finally(() => {
        if (customerBenefitPromoStorageReady) {
          ensureCustomerBenefitPromoStoragePromise = null;
        }
      });
    return ensureCustomerBenefitPromoStoragePromise;
  }

  async function loadCustomerRewardRows(tenantId, customerId, { statuses = null, rewardType = null } = {}) {
    if (!(Number(customerId || 0) > 0)) return [];
    const params = [tenantId, customerId];
    let statusSql = '';
    const normalizedStatuses = Array.isArray(statuses)
      ? [...new Set(statuses.map((status) => publicDiscountText(status).toLowerCase()).filter(Boolean))]
      : [];
    if (normalizedStatuses.length) {
      statusSql = ' AND r.status IN (?)';
      params.push(normalizedStatuses);
    }
    let typeSql = '';
    if (rewardType) {
      typeSql = ' AND r.reward_type = ?';
      params.push(rewardType);
    }
    const sql = `SELECT r.*, d.title AS discount_title, d.description AS discount_description
       FROM mkt_discount_rewards r
       LEFT JOIN mkt_discounts d
         ON d.id = r.discount_id
        AND d.tenant_id = r.tenant_id
      WHERE r.tenant_id = ?
        AND r.customer_id = ?
        ${statusSql}${typeSql}
      ORDER BY r.created_at DESC, r.id DESC`;
    let rows;
    try {
      [rows] = await db.query(sql, params);
    } catch (error) {
      if (!isDiscountRuntimeTableMissingError(error)) throw error;
      await ensureDiscountRuntimeTables();
      [rows] = await db.query(sql, params);
    }
    return Array.isArray(rows) ? rows : [];
  }

  async function loadCustomerAvailableRewardRows(tenantId, customerId, rewardType = null) {
    return loadCustomerRewardRows(tenantId, customerId, {
      statuses: ['available'],
      rewardType,
    });
  }

  async function loadCustomerProgressMap(tenantId, customerId, discountIds) {
    const ids = Array.isArray(discountIds)
      ? [...new Set(discountIds.map((id) => Number(id)).filter((id) => id > 0))]
      : [];
    if (!(Number(customerId || 0) > 0) || !ids.length) return new Map();
    const sql = `SELECT *
       FROM mkt_discount_progress
      WHERE tenant_id = ?
        AND customer_id = ?
        AND discount_id IN (?)`;
    let rows;
    try {
      [rows] = await db.query(sql, [tenantId, customerId, ids]);
    } catch (error) {
      if (!isDiscountRuntimeTableMissingError(error)) throw error;
      await ensureDiscountRuntimeTables();
      [rows] = await db.query(sql, [tenantId, customerId, ids]);
    }
    return new Map(
      (Array.isArray(rows) ? rows : []).map((row) => [Number(row?.discount_id || 0), row])
    );
  }

  async function loadCheckoutRewardProductsByIds(tenantId, productIds) {
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return new Map();
    const [rows] = await db.query(
      `SELECT id, name, price, old_price, photos_json
         FROM prod_products
        WHERE tenant_id = ? AND id IN (?)`,
      [tenantId, ids]
    );
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      let photoUrl = null;
      try {
        const photos = JSON.parse(row?.photos_json || '[]');
        if (Array.isArray(photos) && photos.length) {
          photoUrl = getThumbUrl(photos[0]) || photos[0];
        }
      } catch {}
      result.set(Number(row?.id || 0), {
        id: Number(row?.id || 0),
        title: publicDiscountText(row?.name),
        price: Number(row?.price || row?.old_price || 0),
        photo_url: photoUrl,
      });
    }
    return result;
  }

  async function loadCheckoutProductCategoriesMap(tenantId, productIds) {
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return new Map();
    const [rows] = await db.query(
      `SELECT product_id, category_id
         FROM prod_product_categories
        WHERE tenant_id = ? AND product_id IN (?)`,
      [tenantId, ids]
    );
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const productId = Number(row?.product_id || 0);
      const categoryId = Number(row?.category_id || 0);
      if (!(productId > 0) || !(categoryId > 0)) continue;
      if (!result.has(productId)) result.set(productId, []);
      result.get(productId).push(categoryId);
    }
    return result;
  }

  function buildCheckoutBenefitProductSnapshot(row) {
    const productId = Number(row?.id || 0);
    if (!(productId > 0)) return null;
    let photos = [];
    try {
      const rawPhotos = JSON.parse(row?.photos_json || '[]');
      if (Array.isArray(rawPhotos)) {
        photos = rawPhotos
          .map((photo) => getThumbUrl(photo) || photo)
          .filter(Boolean);
      }
    } catch {}
    const price = Number(row?.price || row?.old_price || 0);
    const oldPrice = Number(row?.old_price || 0);
    const snapshot = {
      type: 'product',
      product_id: productId,
      name: publicDiscountText(row?.name) || 'Товар',
      description_short: publicDiscountText(row?.description_short),
      qty: 1,
      price,
      old_price: oldPrice > price ? oldPrice : 0,
      line_total: price,
      stock_qty: row?.stock_qty != null ? Number(row.stock_qty) : null,
      is_available: row?.is_available != null
        ? (Number(row.is_available || 0) === 1 || row.is_available === true)
        : (row?.stock_qty == null || Number(row.stock_qty) > 0),
      photos,
    };
    if (!publicDiscountText(row?.name).trim()) snapshot.name = 'Товар';
    if (!publicDiscountText(row?.name).trim()) snapshot.name = "\u0422\u043e\u0432\u0430\u0440";
    return snapshot;
  }

  async function loadCheckoutBenefitProductSnapshotsByIds(tenantId, productIds) {
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return [];
    const [rows] = await db.query(
      `SELECT id, name, description_short, price, old_price, photos_json
         FROM prod_products
        WHERE tenant_id = ?
          AND id IN (?)
          AND is_active = 1
          AND site_visibility = 1
        ORDER BY name ASC, id ASC`,
      [tenantId, ids]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => buildCheckoutBenefitProductSnapshot(row))
      .filter(Boolean);
  }

  async function loadCheckoutBenefitProductSnapshotsByCategoryIds(tenantId, categoryIds) {
    const ids = [...new Set((Array.isArray(categoryIds) ? categoryIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return [];
    const [rows] = await db.query(
      `SELECT DISTINCT p.id, p.name, p.description_short, p.price, p.old_price, p.photos_json
         FROM prod_product_categories pc
         INNER JOIN prod_products p
           ON p.tenant_id = pc.tenant_id
          AND p.id = pc.product_id
        WHERE pc.tenant_id = ?
          AND pc.category_id IN (?)
          AND p.is_active = 1
          AND p.site_visibility = 1
        ORDER BY p.name ASC, p.id ASC`,
      [tenantId, ids]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => buildCheckoutBenefitProductSnapshot(row))
      .filter(Boolean);
  }

  async function loadCheckoutBenefitRewardClaimProducts(queryRunner, tenantId, storeId, productIds) {
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return [];
    const runner = queryRunner && typeof queryRunner.query === 'function' ? queryRunner : db;
    const [rows] = await runner.query(
      `SELECT p.id, p.name, p.description_short, p.price, p.old_price, p.photos_json,
              s.qty AS stock_qty
         FROM prod_products p
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id
          AND s.store_id = ?
          AND s.product_id = p.id
        WHERE p.tenant_id = ?
          AND p.id IN (?)
          AND p.is_active = 1
          AND p.site_visibility = 1
        ORDER BY p.name ASC, p.id ASC`,
      [storeId, tenantId, ids]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        ...row,
        is_available: row?.stock_qty == null || Number(row.stock_qty) > 0,
      }))
      .map((row) => buildCheckoutBenefitProductSnapshot(row))
      .filter((row) => row?.is_available === true);
  }

  async function loadPromoSourceRowById(conn, tenantId, storeId, promoCodeId) {
    const normalizedPromoCodeId = Number(promoCodeId || 0);
    if (!(normalizedPromoCodeId > 0)) return null;
    await ensureDiscountHideInBenefitsColumn();
    const [rows] = await conn.query(
      `SELECT pc.id AS promo_code_id,
              pc.discount_id,
              pc.store_id AS promo_store_id,
              pc.code,
              pc.code_mode,
              pc.is_active AS promo_is_active,
              pc.usage_limit AS promo_usage_limit,
              pc.usage_count AS promo_usage_count,
              pc.assigned_customer_id,
              d.*
         FROM mkt_discount_promo_codes pc
         INNER JOIN mkt_discounts d
           ON d.id = pc.discount_id
          AND d.tenant_id = pc.tenant_id
          AND (d.store_id = pc.store_id OR d.store_id = 0 OR d.store_id IS NULL)
        WHERE pc.tenant_id = ?
          AND (pc.store_id = ? OR pc.store_id = 0 OR pc.store_id IS NULL)
          AND pc.id = ?
        ORDER BY pc.store_id DESC, pc.id DESC
        LIMIT 1`,
      [tenantId, storeId, normalizedPromoCodeId]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function loadPromoSourceRowByCode(conn, tenantId, storeId, code) {
    const normalizedCode = normalizeOrderPromoCode(code);
    if (!normalizedCode) return null;
    await ensureDiscountHideInBenefitsColumn();
    const [rows] = await conn.query(
      `SELECT pc.id AS promo_code_id,
              pc.discount_id,
              pc.store_id AS promo_store_id,
              pc.code,
              pc.code_mode,
              pc.is_active AS promo_is_active,
              pc.usage_limit AS promo_usage_limit,
              pc.usage_count AS promo_usage_count,
              pc.assigned_customer_id,
              d.*
         FROM mkt_discount_promo_codes pc
         INNER JOIN mkt_discounts d
           ON d.id = pc.discount_id
          AND d.tenant_id = pc.tenant_id
          AND (d.store_id = pc.store_id OR d.store_id = 0 OR d.store_id IS NULL)
        WHERE pc.tenant_id = ?
          AND (pc.store_id = ? OR pc.store_id = 0 OR pc.store_id IS NULL)
          AND UPPER(REPLACE(pc.code, ' ', '')) = ?
        ORDER BY pc.store_id DESC, pc.id DESC
        LIMIT 1`,
      [tenantId, storeId, normalizedCode]
    );
    return Array.isArray(rows) && rows.length ? rows[0] : null;
  }

  async function loadDiscountTargetRows(conn, tenantId, discountId) {
    const normalizedDiscountId = Number(discountId || 0);
    if (!(normalizedDiscountId > 0)) return [];
    await ensureDiscountProductConfigColumn();
    const [rows] = await conn.query(
      `SELECT dp.product_id,
              dp.category_id,
              dp.combo_id,
              dp.product_config_json,
              d.mechanic_config_json
         FROM mkt_discount_products dp
         INNER JOIN mkt_discounts d
           ON d.id = dp.discount_id
          AND d.tenant_id = dp.tenant_id
        WHERE dp.tenant_id = ?
          AND dp.discount_id = ?`,
      [tenantId, normalizedDiscountId]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizePublicDiscountTargetRow(
        row,
        getPublicDiscountProductsConfigMode(row, 'any')
      ))
      .filter(Boolean);
  }

  async function insertCustomerRewardRow(conn, {
    tenantId,
    customerId,
    discountId,
    rewardType,
    payload,
  }) {
    const normalizedCustomerId = Number(customerId || 0);
    const normalizedDiscountId = Number(discountId || 0);
    const normalizedRewardType = publicDiscountText(rewardType).toLowerCase();
    if (!(normalizedCustomerId > 0) || !(normalizedDiscountId > 0)) {
      throw new Error('INVALID_REWARD_TARGET');
    }
    if (!['gift', 'discount', 'promo_code'].includes(normalizedRewardType)) {
      throw new Error('INVALID_REWARD_TYPE');
    }
    const [result] = await conn.query(
      `INSERT INTO mkt_discount_rewards
       (tenant_id, customer_id, discount_id, reward_type, reward_payload_json, status, claimed_at)
       VALUES (?, ?, ?, ?, ?, 'available', NOW())`,
      [
        tenantId,
        normalizedCustomerId,
        normalizedDiscountId,
        normalizedRewardType,
        JSON.stringify(payload || {}),
      ]
    );
    return Number(result?.insertId || 0) || null;
  }

  async function buildRewardPayloadFromPromoSource(conn, {
    tenantId,
    storeId,
    discount,
    promoRow,
    generatedCode = '',
  }) {
    const sourceDiscountId = Number(discount?.id || discount?.discount_id || 0);
    const targetRows = await loadDiscountTargetRows(conn, tenantId, sourceDiscountId);
    const productIds = targetRows
      .map((row) => Number(row?.product_id || 0))
      .filter((id) => id > 0);
    const productsMap = await loadCheckoutRewardProductsByIds(tenantId, productIds);
    const rewardMeta = getPublicPromoRewardMeta(discount);
    const runtimeConfig = getPromoRuntimeConfig(discount);

    if (runtimeConfig.rewardType === 'discount' || runtimeConfig.productRewardType === 'product_discount') {
      return {
        rewardType: 'discount',
        payload: attachRewardSourceMetadata(
          buildRuntimeDiscountRewardPayload({
            title: publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
            description: rewardMeta.description || publicDiscountText(discount?.description),
            discountType: runtimeConfig.discountType,
            discountValue: runtimeConfig.discountValue,
            applyTo: runtimeConfig.rewardType === 'discount' ? runtimeConfig.applyTo : 'product',
            maxDiscountAmount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
            minOrderAmount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
            isStackable: Number(discount?.is_stackable || 0) === 1,
            targetRows,
            productsMap,
            configMode: normalizePublicProductConfigMode(
              parsePublicDiscountObject(discount?.mechanic_config_json, {})?.products_config_mode,
              'any'
            ),
            extra: {
              badge_text: rewardMeta.badge_text,
              apply_scope_text: rewardMeta.apply_scope_text,
              expires_at: discount?.ends_at || null,
            },
          }),
          {
            sourceKind: 'promo_code',
            sourceDiscountId: sourceDiscountId || null,
            sourcePromoCodeId: Number(promoRow?.promo_code_id || 0) || null,
            sourceCode: publicDiscountText(promoRow?.code),
            sourceTitle: publicDiscountText(discount?.title),
            claimedFrom: 'promo',
          }
        ),
      };
    }

    if (runtimeConfig.productRewardType === 'gift') {
      return {
        rewardType: 'gift',
        payload: attachRewardSourceMetadata(
          buildRuntimeGiftRewardPayload({
            title: publicDiscountText(discount?.title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
            description: rewardMeta.description || publicDiscountText(discount?.description),
            targetRows,
            productsMap,
            configMode: normalizePublicProductConfigMode(
              parsePublicDiscountObject(discount?.mechanic_config_json, {})?.products_config_mode,
              'any'
            ),
            extra: {
              apply_scope_text: rewardMeta.apply_scope_text,
            },
          }),
          {
            sourceKind: 'promo_code',
            sourceDiscountId: sourceDiscountId || null,
            sourcePromoCodeId: Number(promoRow?.promo_code_id || 0) || null,
            sourceCode: publicDiscountText(promoRow?.code),
            sourceTitle: publicDiscountText(discount?.title),
            claimedFrom: 'promo',
          }
        ),
      };
    }

    const rewardCode = publicDiscountText(generatedCode)
      || await generateUniqueRewardPromoCode(conn, tenantId, storeId, publicDiscountText(promoRow?.code) || 'BONUS');
    const data = {
      rewardType: 'promo_code',
      payload: attachRewardSourceMetadata(
        buildRuntimePromoRewardPayload({
          title: publicDiscountText(discount?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
          description: rewardMeta.description || publicDiscountText(discount?.description),
          code: rewardCode,
          statusText: '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
          badgeText: rewardMeta.badge_text || '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
          applyScopeText: rewardMeta.apply_scope_text,
          isStackable: Number(discount?.is_stackable || 0) === 1,
          expiresAt: discount?.ends_at || null,
          runtimeConfig,
          targetRows,
          productsMap,
          configMode: normalizePublicProductConfigMode(
            parsePublicDiscountObject(discount?.mechanic_config_json, {})?.products_config_mode,
            'any'
          ),
        }),
        {
          sourceKind: 'promo_code',
          sourceDiscountId: sourceDiscountId || null,
          sourcePromoCodeId: Number(promoRow?.promo_code_id || 0) || null,
          sourceCode: publicDiscountText(promoRow?.code),
          sourceTitle: publicDiscountText(discount?.title),
          claimedFrom: 'promo',
        }
      ),
    };
  }

  function collectLoyaltyProgressGiftRewardTargetRows(mechanic) {
    const configMode = normalizePublicProductConfigMode(
      mechanic?.gift_products_config_mode ?? mechanic?.reward?.gift_products_config_mode,
      'any'
    );
    return (Array.isArray(mechanic?.reward?.gift_products) ? mechanic.reward.gift_products : [])
      .map((row) => ({
        ...row,
        product_id: Number(row?.entity_id || row?.product_id || row?.id || 0),
        config_mode: normalizePublicProductConfigMode(row?.config_mode ?? configMode, configMode),
      }))
      .filter((row) => Number(row?.product_id || 0) > 0);
  }

  function buildGiftRewardPayloadFromTargetRows(discount, targetRows, productsMap) {
    const configMode = normalizePublicProductConfigMode(
      Array.isArray(targetRows) && targetRows.length
        ? targetRows[0]?.config_mode
        : 'any',
      'any'
    );
    const payload = buildRuntimeGiftRewardPayload({
      title: publicDiscountText(discount?.title) || 'Подарок',
      description: publicDiscountText(discount?.description),
      targetRows,
      productsMap,
      configMode,
    });
    if (!publicDiscountText(discount?.title).trim()) payload.title = 'Подарок';
    if (!publicDiscountText(discount?.title).trim()) payload.title = "\u041f\u043e\u0434\u0430\u0440\u043e\u043a";
    return payload;
  }

  async function buildRewardPayloadFromLoyaltyProgress(conn, {
    tenantId,
    storeId,
    discount,
    selectedRewardProductId = null,
    selectedRewardSelectionKey = null,
    selectedRewardProductConfig = null,
  }) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const rewardKind = publicDiscountText(mechanic?.reward_kind).toLowerCase() || 'gift';
    const sourceDiscountId = Number(discount?.id || 0) || null;

    if (rewardKind === 'discount') {
      const productIds = (Array.isArray(mechanic?.reward?.discount?.products) ? mechanic.reward.discount.products : [])
        .map((row) => Number(row?.entity_id || row?.product_id || row?.id || 0))
        .filter((id) => id > 0);
      const productsMap = await loadCheckoutRewardProductsByIds(tenantId, productIds);
      return {
        rewardType: 'discount',
        payload: attachRewardSourceMetadata(
          buildDiscountRewardPayload(discount, mechanic, productsMap),
          {
            sourceKind: 'loyalty_progress',
            sourceDiscountId,
            sourceTitle: publicDiscountText(discount?.title),
            claimedFrom: 'loyalty',
          }
        ),
      };
    }

    if (rewardKind === 'promo_code') {
      const promoSource = parsePublicDiscountObject(mechanic?.reward?.promo_code, {});
      const sourcePromoRow = await loadPromoSourceRowById(
        conn,
        tenantId,
        storeId,
        Number(promoSource?.source_promo_code_id || 0)
      );
      if (!sourcePromoRow) {
        throw Object.assign(new Error('PROMO_INVALID'), { code: 'PROMO_INVALID' });
      }
      const rewardCode = await generateUniqueRewardPromoCode(
        conn,
        tenantId,
        storeId,
        publicDiscountText(promoSource?.source_code || sourcePromoRow?.code) || 'BONUS'
      );
      const rewardDefinition = await buildRewardPayloadFromPromoSource(conn, {
        tenantId,
        storeId,
        discount: sourcePromoRow,
        promoRow: sourcePromoRow,
        generatedCode: rewardCode,
      });
      rewardDefinition.payload = attachRewardSourceMetadata(rewardDefinition.payload, {
        sourceKind: 'loyalty_progress',
        sourceDiscountId,
        sourcePromoCodeId: Number(promoSource?.source_promo_code_id || sourcePromoRow?.promo_code_id || 0) || null,
        sourceCode: publicDiscountText(promoSource?.source_code || sourcePromoRow?.code),
        sourceTitle: publicDiscountText(discount?.title),
        claimedFrom: 'loyalty',
      });
      return rewardDefinition;
    }

    const rewardTargetRows = collectLoyaltyProgressGiftRewardTargetRows(mechanic);
    const normalizedSelectedRewardProductId = Number(selectedRewardProductId || 0);
    const normalizedSelectedRewardSelectionKey = publicDiscountText(selectedRewardSelectionKey);
    const selectedTargetRows = normalizedSelectedRewardSelectionKey
      ? (() => {
          const targetRow = rewardTargetRows.find((row, index) => (
            buildPublicGiftRewardSelectionKey(row, index) === normalizedSelectedRewardSelectionKey
          )) || null;
          return targetRow ? [targetRow] : [];
        })()
      : normalizedSelectedRewardProductId > 0
      ? (() => {
          const targetRow = rewardTargetRows.find((row) => Number(row?.product_id || 0) === normalizedSelectedRewardProductId) || null;
          return targetRow ? [targetRow] : [];
        })()
      : rewardTargetRows;
    if (!selectedTargetRows.length) {
      throw Object.assign(new Error('REWARD_NOT_APPLICABLE'), { code: 'REWARD_NOT_APPLICABLE' });
    }
    const productsMap = await loadCheckoutRewardProductsByIds(
      tenantId,
      [...new Set(selectedTargetRows.map((row) => Number(row?.product_id || 0)).filter((id) => id > 0))]
    );
    return {
      rewardType: 'gift',
      payload: attachRewardSourceMetadata(
        buildGiftRewardPayloadFromTargetRows(
          discount,
          selectedTargetRows.map((row) => {
            if (normalizePublicProductConfigMode(row?.config_mode, 'any') !== 'any') return row;
            const productId = Number(row?.product_id || 0);
            const selectedConfig = normalizePublicProductConfigPayload(selectedRewardProductConfig, productId);
            if (!selectedConfig) return row;
            return {
              ...row,
              product_config: selectedConfig,
            };
          }),
          productsMap
        ),
        {
          sourceKind: 'loyalty_progress',
          sourceDiscountId,
          sourceTitle: publicDiscountText(discount?.title),
          claimedFrom: 'loyalty',
        }
      ),
    };
  }

  function applyClaimedProgressRedemption({
    progressValue,
    pendingRewardCount,
    claimedCount = 1,
    thresholdValue,
    pendingRewardMode,
  }) {
    const safePendingRewardCount = Math.max(0, Number(pendingRewardCount || 0));
    const safeClaimedCount = Math.max(0, Math.min(safePendingRewardCount, Math.floor(Number(claimedCount || 0) || 0)));
    const nextPendingRewardCount = Math.max(0, safePendingRewardCount - safeClaimedCount);
    const normalizedThreshold = Number(thresholdValue || 0);
    const normalizedPendingMode = normalizePublicProgressPendingRewardMode(pendingRewardMode);
    let nextProgressValue = Math.max(0, Number(progressValue || 0));

    if (normalizedPendingMode === 'single_pending') {
      if (nextPendingRewardCount <= 0) {
        nextProgressValue = 0;
      } else if (normalizedThreshold > 0) {
        nextProgressValue = Math.min(nextProgressValue, normalizedThreshold);
      }
    }

    return {
      progressValue: roundPromoMoney(nextProgressValue),
      pendingRewardCount: nextPendingRewardCount,
    };
  }

  function parsePublicProgressOrderItems(rawItems) {
    let items = rawItems;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }
    if (!Array.isArray(items)) return [];
    return items
      .map((rawItem) => {
        if (!rawItem || typeof rawItem !== 'object') return null;
        const productId = Number(rawItem?.product_id || rawItem?.id || rawItem?.product?.id || 0);
        const qtyRaw = Number(rawItem?.qty ?? rawItem?.quantity ?? 0);
        const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.max(1, Math.floor(qtyRaw)) : 1;
        const lineTotalRaw = Number(rawItem?.line_total ?? rawItem?.total ?? rawItem?.total_price ?? 0);
        const priceRaw = Number(rawItem?.price ?? rawItem?.unit_price ?? 0);
        const photos = Array.isArray(rawItem?.photos)
          ? rawItem.photos.map((photo) => publicDiscountText(photo)).filter(Boolean)
          : [];
        const fallbackPhoto = publicDiscountText(
          rawItem?.product_photo || rawItem?.photo || rawItem?.photo_url || rawItem?.product?.photo_url
        );
        const normalizedType = publicDiscountText(
          rawItem?.type || (Number(rawItem?.combo_id || rawItem?.combo?.id || 0) > 0 ? 'combo' : 'product')
        ).toLowerCase() || 'product';
        const optionItems = ([
          ...(Array.isArray(rawItem?.option_items) ? rawItem.option_items : []),
          ...(Array.isArray(rawItem?.options) ? rawItem.options : []),
        ])
          .map((option) => ({
            id: Number(option?.id || 0) || null,
            qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
            target_product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
            variant_group_id: Number(option?.variant_group_id || 0) || null,
            variant_value_index: Number.isFinite(Number(option?.variant_value_index))
              ? Number(option.variant_value_index)
              : null,
          }))
          .filter((option) => Number(option?.id || 0) > 0);
        const ingredients = (Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [])
          .map((ingredient) => ({
            ingredient_id: Number(ingredient?.ingredient_id || ingredient?.product_id || 0) || null,
            qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
          }))
          .filter((ingredient) => Number(ingredient?.ingredient_id || 0) > 0);
        const variantGroupId = Number(rawItem?.variant_group_id || 0);
        const variantValueIndex = Number(rawItem?.variant_value_index);
        return {
          type: normalizedType,
          product_id: productId > 0 ? productId : null,
          qty,
          line_total: Number.isFinite(lineTotalRaw)
            ? lineTotalRaw
            : (Number.isFinite(priceRaw) ? Number(priceRaw * qty) : 0),
          auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
          title: publicDiscountText(
            rawItem?.product_name || rawItem?.name || rawItem?.title || rawItem?.product?.name || rawItem?.product?.title
          ) || '\u0422\u043e\u0432\u0430\u0440',
          photo_url: photos[0] || fallbackPhoto || '',
          option_items: optionItems,
          ingredients,
          variant_group_id: Number.isFinite(variantGroupId) && variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
            ? variantValueIndex
            : null,
        };
      })
      .filter(Boolean);
  }

  function collectCheckoutLoyaltyMatchedItems(discount, items, productCategoriesMap) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const scopeMode = publicDiscountText(mechanic?.qualifying_scope_mode).toLowerCase() || 'none';
    const targets = buildPublicProductTargetSets(mechanic?.qualifying_items || []);
    const sourceItems = (Array.isArray(items) ? items : []).filter((item) => Number(item?.auto_add || 0) !== 1);

    return sourceItems.filter((item) => {
      if (scopeMode === 'none') return true;
      return matchDiscountTargetScope(targets, item, productCategoriesMap, scopeMode);
    });
  }

  function computeCheckoutLoyaltyProgressIncrement(discount, items, productCategoriesMap) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const progressBasis = publicDiscountText(mechanic?.progress_basis).toLowerCase() || 'orders';
    const matchedItems = collectCheckoutLoyaltyMatchedItems(discount, items, productCategoriesMap);

    if (!matchedItems.length) return 0;
    if (progressBasis === 'amount') {
      return roundPromoMoney(matchedItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
    }
    if (progressBasis === 'items') {
      return matchedItems.reduce((sum, item) => sum + Math.max(1, Number(item?.qty || 0)), 0);
    }
    return 1;
  }

  function collectPublicProgressQualifyingProductIds(discount) {
    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    return [...new Set(
      (Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [])
        .map((row) => {
          const entityType = publicDiscountText(row?.entity_type).toLowerCase();
          if (entityType && entityType !== 'product') return 0;
          return Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
        })
        .filter((id) => id > 0)
    )];
  }

  function normalizePublicProgressVisualProductEntry(entry, productsMap) {
    if (!entry || typeof entry !== 'object') return null;
    const productId = Number(entry?.product_id || 0);
    const product = productId > 0 ? (productsMap.get(productId) || null) : null;
    const title = publicDiscountText(entry?.title || entry?.name || product?.title) || '\u0422\u043e\u0432\u0430\u0440';
    const photoUrl = publicDiscountText(
      entry?.photo_url
      || entry?.photo
      || product?.photo_url
    );
    return {
      product_id: productId > 0 ? productId : null,
      title,
      photo_url: photoUrl || null,
    };
  }

  function buildPublicProgressFallbackUnits(discount, productsMap, count) {
    const safeCount = normalizePublicProgressSlotCount(count);
    if (!(safeCount > 0)) return [];

    const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const sourceRows = Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [];
    const baseUnits = sourceRows
      .map((row) => {
        const entityType = publicDiscountText(row?.entity_type).toLowerCase();
        if (entityType && entityType !== 'product') return null;
        return normalizePublicProgressVisualProductEntry({
          product_id: Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0),
          title: publicDiscountText(row?.title || row?.name),
          photo_url: publicDiscountText(row?.photo || row?.photo_url),
        }, productsMap);
      })
      .filter(Boolean);

    if (!baseUnits.length) return [];
    return Array.from({ length: safeCount }, (_, index) => ({ ...baseUnits[index % baseUnits.length] }));
  }

  function buildPublicProgressOrderSlots(state) {
    const slotCount = normalizePublicProgressSlotCount(state?.thresholdValue);
    if (!(slotCount > 0)) return null;
    const filledCount = Math.max(
      0,
      Math.min(slotCount, normalizePublicProgressSlotCount(state?.displayProgressValue))
    );
    return {
      mode: 'orders',
      slot_count: slotCount,
      filled_count: filledCount,
      slots: Array.from({ length: slotCount }, (_, index) => ({
        index: index + 1,
        kind: 'order',
        is_filled: index < filledCount,
      })),
    };
  }

  function buildPublicProgressAmountVisual(state) {
    const thresholdValue = Math.max(0, Number(state?.thresholdValue || 0));
    return {
      mode: 'amount',
      current_value: Math.max(0, Number(state?.displayProgressValue || 0)),
      threshold_value: thresholdValue,
      progress_ratio: thresholdValue > 0
        ? Math.max(0, Math.min(1, Number(state?.progressRatio || 0)))
        : 0,
    };
  }

  function buildPublicProgressItemsVisual({
    discount,
    state,
    orders,
    productCategoriesMap,
    productsMap,
  }) {
    const slotCount = normalizePublicProgressSlotCount(state?.thresholdValue);
    if (!(slotCount > 0)) return null;

    const filledCount = Math.max(
      0,
      Math.min(slotCount, normalizePublicProgressSlotCount(state?.displayProgressValue))
    );
    const discountStoreId = Number(discount?.store_id || 0);
    const scopedOrders = discountStoreId > 0
      ? orders.filter((order) => Number(order?.store_id || 0) === discountStoreId)
      : orders;
    const recentUnits = [];

    for (const order of scopedOrders) {
      const matchedItems = collectCheckoutLoyaltyMatchedItems(
        discount,
        Array.isArray(order?.items) ? order.items : [],
        productCategoriesMap
      );
      for (const matchedItem of matchedItems) {
        const normalizedUnit = normalizePublicProgressVisualProductEntry(matchedItem, productsMap) || {
          product_id: Number(matchedItem?.product_id || 0) || null,
          title: publicDiscountText(matchedItem?.title) || '\u0422\u043e\u0432\u0430\u0440',
          photo_url: null,
        };
        const qty = Math.max(1, Number(matchedItem?.qty || 0));
        for (let index = 0; index < qty; index += 1) {
          recentUnits.push(normalizedUnit);
          if (recentUnits.length > slotCount) recentUnits.shift();
        }
      }
    }

    const fallbackUnits = buildPublicProgressFallbackUnits(discount, productsMap, filledCount);
    const filledUnits = recentUnits.slice(-filledCount).map((unit) => ({ ...unit }));
    while (filledUnits.length < filledCount) {
      const fallbackUnit = fallbackUnits[filledUnits.length] || null;
      filledUnits.push(fallbackUnit ? { ...fallbackUnit } : null);
    }

    return {
      mode: 'items',
      slot_count: slotCount,
      filled_count: filledCount,
      slots: Array.from({ length: slotCount }, (_, index) => {
        if (index >= filledCount) {
          return {
            index: index + 1,
            kind: 'item',
            is_filled: false,
            product_id: null,
            title: '',
            photo_url: null,
          };
        }
        const unit = filledUnits[index] || null;
        return {
          index: index + 1,
          kind: 'item',
          is_filled: true,
          product_id: Number(unit?.product_id || 0) || null,
          title: publicDiscountText(unit?.title),
          photo_url: publicDiscountText(unit?.photo_url) || null,
        };
      }),
    };
  }

  async function loadCustomerProgressHistoryOrders(tenantId, customerId) {
    if (!(Number(customerId || 0) > 0)) return [];
    const [rows] = await db.query(
      `SELECT id, store_id, items
         FROM order_orders
        WHERE tenant_id = ?
          AND customer_id = ?
        ORDER BY created_at ASC, id ASC`,
      [tenantId, customerId]
    );
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        id: Number(row?.id || 0),
        store_id: Number(row?.store_id || 0),
        items: parsePublicProgressOrderItems(row?.items),
      }))
      .filter((row) => row.id > 0);
  }

  async function buildCustomerProgressVisualMap({
    tenantId,
    storeId,
    customerId,
    discounts,
    progressMap,
  }) {
    const discountRows = Array.isArray(discounts)
      ? discounts.filter((discount) => Number(discount?.id || 0) > 0)
      : [];
    if (!discountRows.length) return new Map();

    const orders = customerId > 0
      ? await loadCustomerProgressHistoryOrders(tenantId, customerId)
      : [];
    const historyProductIds = [...new Set(
      orders.flatMap((order) => (
        (Array.isArray(order?.items) ? order.items : [])
          .map((item) => Number(item?.product_id || 0))
          .filter((id) => id > 0)
      ))
    )];
    const qualifyingProductIds = [...new Set(
      discountRows.flatMap((discount) => collectPublicProgressQualifyingProductIds(discount))
    )];
    const rewardProductIds = [...new Set(
      discountRows.flatMap((discount) => collectPublicProgressRewardProductIds(discount))
    )];
    const [productCategoriesMap, productsMap, availableRewardProducts] = await Promise.all([
      historyProductIds.length
        ? loadCheckoutProductCategoriesMap(tenantId, historyProductIds)
        : Promise.resolve(new Map()),
      [...new Set([...historyProductIds, ...qualifyingProductIds, ...rewardProductIds])].length
        ? loadCheckoutRewardProductsByIds(
            tenantId,
            [...new Set([...historyProductIds, ...qualifyingProductIds, ...rewardProductIds])]
          )
        : Promise.resolve(new Map()),
      rewardProductIds.length
        ? loadCheckoutBenefitRewardClaimProducts(
            null,
            tenantId,
            storeId,
            rewardProductIds
          )
        : Promise.resolve([]),
    ]);
    const availableRewardProductIds = new Set(
      (Array.isArray(availableRewardProducts) ? availableRewardProducts : [])
        .map((product) => Number(product?.product_id || 0))
        .filter((id) => id > 0)
    );

    const visualMap = new Map();
    const rewardPreviewMap = new Map();
    for (const discount of discountRows) {
      const discountId = Number(discount?.id || 0);
      const state = getPublicProgressBenefitState(discount, progressMap.get(discountId) || null);
      const rewardPreview = buildPublicProgressRewardPreview(discount, state, productsMap, availableRewardProductIds);
      const rewardSlot = buildPublicProgressRewardSlot(state, rewardPreview);
      let visual = null;
      if (state.progressBasis === 'amount') {
        visual = buildPublicProgressAmountVisual(state);
      } else if (state.progressBasis === 'items') {
        visual = buildPublicProgressItemsVisual({
          discount,
          state,
          orders,
          productCategoriesMap,
          productsMap,
        });
      } else {
        visual = buildPublicProgressOrderSlots(state);
      }
      if (visual && typeof visual === 'object') {
        visual = {
          ...visual,
          reward_slot: rewardSlot,
        };
      } else {
        visual = {
          mode: publicDiscountText(state.progressBasis).toLowerCase() || 'orders',
          reward_slot: rewardSlot,
        };
      }
      visualMap.set(discountId, visual);
      rewardPreviewMap.set(discountId, rewardPreview);
    }
    return { visualMap, rewardPreviewMap };
  }

  async function buildPublicProgressBenefitCards({ tenantId, storeId, customerId, discounts }) {
    const discountRows = Array.isArray(discounts)
      ? discounts.filter((discount) => Number(discount?.id || 0) > 0)
      : [];
    if (!discountRows.length) return [];

    const progressMap = await loadCustomerProgressMap(
      tenantId,
      customerId,
      discountRows.map((discount) => Number(discount?.id || 0))
    );
    const {
      visualMap: progressVisualMap,
      rewardPreviewMap,
    } = await buildCustomerProgressVisualMap({
      tenantId,
      storeId,
      customerId,
      discounts: discountRows,
      progressMap,
    });

    return discountRows.map((discount) => {
      const discountId = Number(discount?.id || 0);
      return buildPublicProgressBenefitCard(
        discount,
        progressMap.get(discountId) || null,
        progressVisualMap.get(discountId) || null,
        {
          rewardPreview: rewardPreviewMap.get(discountId) || null,
          interactionMode: getPublicProgressInteractionMode(discount),
          qualifyingScopeMode: getPublicProgressQualifyingScopeMode(discount),
        }
      );
    });
  }

  async function generateUniqueRewardPromoCode(conn, tenantId, storeId, baseCode) {
    const seed = publicDiscountText(baseCode).toUpperCase() || 'BONUS';
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
      const nextCode = `${seed}-${suffix}`.slice(0, 64);
      const [rows] = await conn.query(
        `SELECT id
           FROM mkt_discount_promo_codes
          WHERE tenant_id = ?
            AND (store_id = ? OR store_id = 0 OR store_id IS NULL)
            AND code = ?
          LIMIT 1`,
        [tenantId, storeId, nextCode]
      );
      if (!Array.isArray(rows) || !rows.length) return nextCode;
    }
    return `${seed}-${Date.now()}`.slice(0, 64);
  }

  function normalizeSelectedRewardIds(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0)
    )];
  }

  function normalizeSelectedRewardItems(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const productId = Number(entry?.product_id || 0);
        if (!(productId > 0)) return null;
        return {
          selection_key: publicDiscountText(entry?.selection_key),
          product_id: productId,
          product_config: normalizePublicProductConfigPayload(entry?.product_config, productId),
        };
      })
      .filter(Boolean);
  }

  function normalizeSelectedDiscountId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  async function loadDiscountTargetRowsMap(tenantId, discountIds) {
    const ids = [...new Set((Array.isArray(discountIds) ? discountIds : []).map((id) => Number(id)).filter((id) => id > 0))];
    if (!ids.length) return new Map();
    await ensureDiscountProductConfigColumn();
    const [rows] = await db.query(
      `SELECT dp.discount_id,
              dp.product_id,
              dp.category_id,
              dp.combo_id,
              dp.product_config_json,
              d.mechanic_config_json
         FROM mkt_discount_products dp
         INNER JOIN mkt_discounts d
           ON d.id = dp.discount_id
          AND d.tenant_id = dp.tenant_id
        WHERE dp.tenant_id = ?
          AND dp.discount_id IN (?)`,
      [tenantId, ids]
    );
    const result = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const discountId = Number(row?.discount_id || 0);
      if (!(discountId > 0)) continue;
      if (!result.has(discountId)) result.set(discountId, []);
      const normalizedRow = normalizePublicDiscountTargetRow(
        row,
        getPublicDiscountProductsConfigMode(row, 'any')
      );
      if (normalizedRow) {
        result.get(discountId).push(normalizedRow);
      }
    }
    return result;
  }

  function chooseDefaultDiscountCard(cards, requestedId = null) {
    const availableCards = Array.isArray(cards)
      ? cards.filter((card) => Number(card?.discount_amount || 0) > 0)
      : [];
    if (!availableCards.length) return null;
    const requestedDiscountId = normalizeSelectedDiscountId(requestedId);
    if (requestedDiscountId !== null) {
      const requestedCard = availableCards.find((card) => Number(card?.id || 0) === requestedDiscountId);
      if (requestedCard) return requestedCard;
    }
    return availableCards.slice().sort((a, b) => {
      const amountDiff = Number(b?.discount_amount || 0) - Number(a?.discount_amount || 0);
      if (amountDiff !== 0) return amountDiff;
      const priorityDiff = Number(b?.priority || 0) - Number(a?.priority || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return Number(a?.id || 0) - Number(b?.id || 0);
    })[0] || null;
  }


  function buildRewardProductsPayload(items, productsMap, configMode = 'any') {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const productId = Number(item?.entity_id || item?.product_id || item?.id || 0);
        if (!(productId > 0)) return null;
        const product = productsMap.get(productId) || null;
        const productConfig = normalizePublicProductConfigPayload(item?.product_config ?? item?.product_config_json, productId);
        return {
          id: productId,
          title: publicDiscountText(item?.title) || publicDiscountText(product?.title) || '\u0422\u043e\u0432\u0430\u0440',
          photo_url: product?.photo_url || null,
          price: Number(product?.price || 0),
          config_mode: normalizePublicProductConfigMode(item?.config_mode ?? configMode, configMode),
          product_config: productConfig,
        };
      })
      .filter(Boolean);
  }

  function buildGiftRewardPayload(discount, mechanic, productsMap) {
    const configMode = normalizePublicProductConfigMode(
      mechanic?.gift_products_config_mode ?? mechanic?.reward?.gift_products_config_mode,
      'any'
    );
    return buildRuntimeGiftRewardPayload({
      title: publicDiscountText(discount?.title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      description: publicDiscountText(discount?.description),
      targetRows: mechanic?.reward?.gift_products,
      productsMap,
      configMode,
    });
    const products = buildRewardProductsPayload(mechanic?.reward?.gift_products, productsMap);
    return {
      title: publicDiscountText(discount?.title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      description: publicDiscountText(discount?.description),
      badge_text: '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      total_value: roundPromoMoney(products.reduce((sum, product) => sum + Number(product?.price || 0), 0)),
      products,
    };
  }

  function buildDiscountRewardPayload(discount, mechanic, productsMap) {
    const reward = parsePublicDiscountObject(mechanic?.reward, {});
    const rewardDiscount = parsePublicDiscountObject(reward?.discount, {});
    const configMode = normalizePublicProductConfigMode(
      rewardDiscount?.products_config_mode ?? mechanic?.reward_products_config_mode,
      'any'
    );
    return buildRuntimeDiscountRewardPayload({
      title: publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(discount?.description),
      discountType: rewardDiscount?.discount_type || discount?.discount_type || 'percent',
      discountValue: rewardDiscount?.discount_value || 0,
      applyTo: rewardDiscount?.apply_to || discount?.apply_to || 'order',
      maxDiscountAmount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
      minOrderAmount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
      isStackable: Number(discount?.is_stackable || 0) === 1,
      targetRows: rewardDiscount?.products,
      productsMap,
      configMode,
    });
    return {
      title: publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(discount?.description),
      discount_type: publicDiscountText(rewardDiscount?.discount_type || discount?.discount_type || 'percent').toLowerCase() || 'percent',
      discount_value: Number(rewardDiscount?.discount_value || 0),
      apply_to: publicDiscountText(rewardDiscount?.apply_to || discount?.apply_to || 'order').toLowerCase() || 'order',
      max_discount_amount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
      min_order_amount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
      is_stackable: Number(discount?.is_stackable || 0) === 1,
      products: buildRewardProductsPayload(rewardDiscount?.products, productsMap),
    };
  }

  async function buildCustomerBenefitsResponse({ tenantId, storeId, customerId }) {
    const customerDiscounts = await loadCustomerBenefitDiscountRows(tenantId, storeId, customerId);
    const automaticDiscountRows = customerDiscounts.filter((discount) => (
      isPublicAutomaticSimpleDiscount(discount) && !isHiddenBenefitsDiscount(discount)
    ));
    const automaticDiscountIds = automaticDiscountRows
      .map((discount) => Number(discount?.id || 0))
      .filter((id) => id > 0);
    let automaticTargetsByDiscountId = new Map();
    let automaticTargetProductsMap = new Map();
    if (automaticDiscountIds.length) {
      automaticTargetsByDiscountId = await loadDiscountTargetRowsMap(tenantId, automaticDiscountIds);
      automaticTargetProductsMap = await loadCheckoutRewardProductsByIds(
        tenantId,
        [...new Set(
          [...automaticTargetsByDiscountId.values()].flatMap((rows) => (
            (Array.isArray(rows) ? rows : [])
              .map((row) => Number(row?.product_id || 0))
              .filter((id) => id > 0)
          ))
        )]
      );
    }
    const automaticDiscounts = automaticDiscountRows.map((discount) => ({
      ...buildPublicDiscountBenefitCard(discount),
      products: buildRewardProductsPayload(
        automaticTargetsByDiscountId.get(Number(discount?.id || 0)) || [],
        automaticTargetProductsMap,
        getPublicDiscountProductsConfigMode(discount, 'any')
      ),
    }));

    const promoDiscounts = customerDiscounts.filter((discount) => isPublicPromoSimpleDiscount(discount));
    const promoDiscountIds = promoDiscounts
      .map((discount) => Number(discount?.id || 0))
      .filter((id) => id > 0);

    let promoCodes = [];
    let promoTargetsByDiscountId = new Map();
    let promoTargetProductsMap = new Map();
    if (promoDiscountIds.length) {
      const promoRowsByDiscountId = await loadBenefitPromoRowsMap({
        tenantId,
        storeId,
        customerId,
        discounts: promoDiscounts,
        includeInactive: false,
      });
      promoTargetsByDiscountId = await loadDiscountTargetRowsMap(tenantId, promoDiscountIds);
      promoTargetProductsMap = await loadCheckoutRewardProductsByIds(
        tenantId,
        [...new Set(
          [...promoTargetsByDiscountId.values()].flatMap((rows) => (
            (Array.isArray(rows) ? rows : [])
              .map((row) => Number(row?.product_id || 0))
              .filter((id) => id > 0)
          ))
        )]
      );
      promoCodes = promoDiscounts.flatMap((discount) => {
        const targetRows = promoTargetsByDiscountId.get(Number(discount?.id || 0)) || [];
        const visiblePromoRows = promoRowsByDiscountId.get(Number(discount?.id || 0)) || [];
        if (!visiblePromoRows.length) return [];
        return buildPublicPromoCodeCards(
          discount,
          visiblePromoRows,
          customerId
        ).map((card) => ({
          ...card,
          products: buildRewardProductsPayload(
            targetRows,
            promoTargetProductsMap,
            getPublicDiscountProductsConfigMode(discount, 'any')
          ),
        }));
      });
    }

    const rewardRows = await loadCustomerAvailableRewardRows(tenantId, customerId);
    const availableGiftRewardProductIds = await loadPublicGiftRewardAvailableProductIds(tenantId, storeId, rewardRows);
    const giftRewards = rewardRows
      .filter((row) => publicDiscountText(row?.reward_type).toLowerCase() === 'gift')
      .map((row) => buildPublicGiftRewardCard(row, availableGiftRewardProductIds));
    const rewardDiscounts = rewardRows
      .filter((row) => publicDiscountText(row?.reward_type).toLowerCase() === 'discount')
      .map((row) => {
        const rewardSource = buildPublicRewardDiscountSource(row);
        return {
          ...buildPublicDiscountBenefitCard(rewardSource.discount),
          products: Array.isArray(rewardSource?.payload?.products) ? rewardSource.payload.products : [],
        };
      });

    const loyaltyDiscounts = customerDiscounts.filter((discount) => normalizePublicMechanicType(discount?.mechanic_type) === 'loyalty_progress');
    const progress = await buildPublicProgressBenefitCards({
      tenantId,
      storeId,
      customerId,
      discounts: loyaltyDiscounts,
    });

    return {
      discounts: [...automaticDiscounts, ...rewardDiscounts],
      promo_codes: promoCodes,
      gifts: giftRewards,
      progress,
    };
  }

  async function loadCustomerBenefitDiscountRows(tenantId, storeId, customerId) {
    const hasHideInBenefitsColumn = await ensureDiscountHideInBenefitsColumn();
    const [customerCats] = await db.query(
      `SELECT category_id
         FROM cust_customer_category_links
        WHERE tenant_id = ? AND customer_id = ?`,
      [tenantId, customerId]
    ).catch((err) => {
      console.warn('cust_customer_category_links not available for /me/benefits:', err?.code || err?.message || err);
      return [[]];
    });

    const categoryIdSet = new Set(
      (Array.isArray(customerCats) ? customerCats : [])
        .map((row) => Number(row?.category_id || 0))
        .filter((id) => id > 0)
    );

    const [rows] = await db.query(
      `SELECT d.id, d.store_id, d.title, d.description, d.discount_type, d.discount_value,
              d.apply_to, d.min_order_amount, d.max_discount_amount, d.is_stackable,
              d.usage_limit, d.usage_per_customer, d.usage_count,
              d.starts_at, d.ends_at, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
              d.priority, d.is_active, ${hasHideInBenefitsColumn ? 'd.hide_in_benefits' : '0 AS hide_in_benefits'}, d.activation_mode, d.reward_type, d.promo_code_mode,
              d.unique_code_usage_limit, d.mechanic_type, d.mechanic_config_json,
              dc.target_type, dc.customer_id, dc.customer_category_id
         FROM mkt_discounts d
         LEFT JOIN mkt_discount_customers dc
           ON dc.discount_id = d.id
          AND dc.tenant_id = d.tenant_id
        WHERE d.tenant_id = ?
          AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL)
          AND d.is_active = 1`,
      [tenantId, storeId]
    );

    const byDiscountId = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const discountId = Number(row?.id || 0);
      if (!(discountId > 0)) continue;

      let entry = byDiscountId.get(discountId);
      if (!entry) {
        entry = {
          discount: { ...row },
          hasTargets: false,
          matches: false,
        };
        byDiscountId.set(discountId, entry);
      }

      const hasTargetRow = Boolean(
        publicDiscountText(row?.target_type)
        || Number(row?.customer_id || 0) > 0
        || Number(row?.customer_category_id || 0) > 0
      );
      if (!hasTargetRow) continue;

      entry.hasTargets = true;
      if (publicDiscountText(row?.target_type).toLowerCase() === 'all') {
        entry.matches = true;
      }
      if (Number(row?.customer_id || 0) === Number(customerId || 0)) {
        entry.matches = true;
      }
      if (categoryIdSet.has(Number(row?.customer_category_id || 0))) {
        entry.matches = true;
      }
    }

    return [...byDiscountId.values()]
      .filter((entry) => {
        if (!entry?.discount) return false;
        if (!discountHelpers.isDiscountActive(entry.discount)) return false;
        return !entry.hasTargets || entry.matches;
      })
      .map((entry) => entry.discount)
      .sort((a, b) => {
        const priorityDiff = Number(b?.priority || 0) - Number(a?.priority || 0);
        if (priorityDiff !== 0) return priorityDiff;
        return Number(a?.id || 0) - Number(b?.id || 0);
      });
  }

  router.get('/me/benefits', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const data = await buildCustomerBenefitsResponse({
        tenantId,
        storeId,
        customerId: customer.id,
      });

      return res.json({
        ok: true,
        data,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/me/discounts', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = customer.id;

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘, Р С—РЎР‚Р С‘Р Р†РЎРЏР В·Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р Р…Р В°Р С—РЎР‚РЎРЏР СРЎС“РЎР‹ Р С” Р С”Р В»Р С‘Р ВµР Р…РЎвЂљРЎС“
      // store_id = 0 Р С‘Р В»Р С‘ РЎРѓР С•Р Р†Р С—Р В°Р Т‘Р В°Р ВµРЎвЂљ РЎРѓ РЎвЂљР ВµР С”РЎС“РЎвЂ°Р С‘Р С store_id - РЎРѓР С”Р С‘Р Т‘Р С”Р В° Р С—РЎР‚Р С‘Р СР ВµР Р…Р С‘Р СР В°
      const [directDiscounts] = await db.query(
        `SELECT d.id, d.store_id, d.title, d.description, d.discount_type, d.discount_value,
                d.apply_to, d.min_order_amount, d.max_discount_amount, d.is_stackable,
                d.usage_limit, d.usage_count,
                d.starts_at, d.ends_at, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                d.is_active,
                'direct' AS link_type
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL) AND dc.customer_id = ?`,
        [tenantId, storeId, customerId]
      );

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В° Р С‘Р В· РЎвЂљР В°Р В±Р В»Р С‘РЎвЂ РЎвЂ№ РЎРѓР Р†РЎРЏР В·Р ВµР в„– (Р ВµРЎРѓР В»Р С‘ РЎвЂљР В°Р В±Р В»Р С‘РЎвЂ Р В° РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†РЎС“Р ВµРЎвЂљ)
      let categoryIds = [];
      try {
        const [customerCats] = await db.query(
          `SELECT category_id FROM cust_customer_category_links WHERE tenant_id = ? AND customer_id = ?`,
          [tenantId, customerId]
        );
        categoryIds = customerCats.map(c => Number(c.category_id));
      } catch (catErr) {
        // Р СћР В°Р В±Р В»Р С‘РЎвЂ Р В° Р СР С•Р В¶Р ВµРЎвЂљ Р Р…Р Вµ РЎРѓРЎС“РЎвЂ°Р ВµРЎРѓРЎвЂљР Р†Р С•Р Р†Р В°РЎвЂљРЎРЉ - Р С—РЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С
        console.warn('cust_customer_category_links Р Р…Р Вµ Р Р…Р В°Р в„–Р Т‘Р ВµР Р…Р В°, Р С—РЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С:', catErr.code);
      }

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р С—Р С• Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎРЏР С Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°
      let categoryDiscounts = [];
      if (categoryIds.length > 0) {
        const [catDisc] = await db.query(
          `SELECT d.id, d.store_id, d.title, d.description, d.discount_type, d.discount_value,
                  d.apply_to, d.min_order_amount, d.max_discount_amount, d.is_stackable,
                  d.usage_limit, d.usage_count,
                  d.starts_at, d.ends_at, d.schedule_days, d.schedule_time_start, d.schedule_time_end,
                  d.is_active,
                  'category' AS link_type
           FROM mkt_discounts d
           JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
           WHERE d.tenant_id = ? AND (d.store_id = ? OR d.store_id = 0 OR d.store_id IS NULL) AND dc.customer_category_id IN (?)`,
          [tenantId, storeId, categoryIds]
        );
        categoryDiscounts = catDisc;
      }

      // Р С›Р В±РЎР‰Р ВµР Т‘Р С‘Р Р…РЎРЏР ВµР С Р С‘ РЎС“Р Т‘Р В°Р В»РЎРЏР ВµР С Р Т‘РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂљРЎвЂ№
      const allDiscounts = [...directDiscounts, ...categoryDiscounts];
      const uniqueDiscounts = [];
      const seenIds = new Set();

      for (const discount of allDiscounts) {
        if (!seenIds.has(discount.id)) {
          // Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С РЎвЂћР В»Р В°Р С– Р В°Р С”РЎвЂљР С‘Р Р†Р Р…Р С•РЎРѓРЎвЂљР С‘ Р Т‘Р В»РЎРЏ Р С•РЎвЂљР С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘РЎРЏ Р Р…Р В° РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР ВµР Р…Р Т‘Р Вµ
          discount.is_currently_active = discountHelpers.isDiscountActive(discount);
          uniqueDiscounts.push(discount);
          seenIds.add(discount.id);
        }
      }

      res.json({ ok: true, data: uniqueDiscounts });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // PUBLIC SHOP: categories/products
  // ------------------------------

  router.get('/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const cacheKey = makePublicCacheKey('categories', { tenantId, storeId });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      const [rows] = await db.query(
        `SELECT id, tenant_id, code, title, icon, site_visibility, is_active, sort_order
         FROM prod_categories
         WHERE tenant_id=? AND is_active=1 AND site_visibility=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );

      const payload = { ok: true, data: rows };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.categories);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * Р С™Р С•Р СР В±Р С•-Р В±Р В»Р С•Р С”Р С‘ Р Т‘Р В»РЎРЏ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В°: РЎвЂљР С•Р В»РЎРЉР С”Р С• Р В±Р В»Р С•Р С”Р С‘ Р С‘ РЎвЂљР С•Р В»РЎРЉР С”Р С• РЎвЂљР С•Р Р†Р В°РЎР‚РЎвЂ№, Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…РЎвЂ№Р Вµ Р Р…Р В° РЎРѓР В°Р в„–РЎвЂљР Вµ
   * (is_active=1, site_visibility=1). Р СћР С•Р Р†Р В°РЎР‚РЎвЂ№ РЎРѓ Р С•РЎРѓРЎвЂљР В°РЎвЂљР С”Р С•Р С 0 / Р Р†РЎвЂ№Р С”Р В»РЎР‹РЎвЂЎР ВµР Р…Р Р…РЎвЂ№Р Вµ Р Р† Р В±Р В»Р С•Р С”Р Вµ Р С•РЎРѓРЎвЂљР В°РЎР‹РЎвЂљРЎРѓРЎРЏ,
   * Р Р…Р С• Р Р† Р С•РЎвЂљР Р†Р ВµРЎвЂљ Р Р…Р Вµ Р С—Р С•Р С—Р В°Р Т‘Р В°РЎР‹РЎвЂљ РІР‚вЂќ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљ Р С‘РЎвЂ¦ Р Р…Р Вµ Р Р†Р С‘Р Т‘Р С‘РЎвЂљ.
   */
  router.get('/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productIsAvailableSql = getProductIsAvailableSql('p', 's');

      const [blocks] = await db.query(
        `SELECT id, title, sort_order, min_select, max_select FROM prod_combo_blocks
         WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );

      const result = [];
      for (const block of blocks) {
        const [productsRaw] = await db.query(
          `SELECT bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.price, p.photos_json AS product_photos_json
           FROM prod_combo_block_products bp
           JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE bp.tenant_id=? AND bp.block_id=? AND p.is_active=1 AND p.site_visibility=1
             AND ${productIsAvailableSql}
           ORDER BY bp.sort_order ASC, bp.id ASC`,
          [storeId, tenantId, block.id, storeId, storeId, storeId]
        );
        const products = productsRaw.map((r) => {
          const photos = safeJsonArray(r.product_photos_json);
          return {
            product_id: r.product_id,
            product_name: r.product_name,
            price: Number(r.price) || 0,
            sort_order: r.sort_order,
            is_default: Number(r.is_default) === 1,
            product_photo: photos.length ? photos[0] : null,
          };
        });
        let defaultSet = false;
        for (const p of products) {
          const wasDefault = p.is_default;
          p.is_default = wasDefault && !defaultSet;
          if (wasDefault) defaultSet = true;
        }
        result.push({ id: block.id, title: block.title, sort_order: block.sort_order, min_select: block.min_select ?? 1, max_select: block.max_select ?? 1, products });
      }

      res.json({ ok: true, data: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * Р С›Р Т‘Р С‘Р Р… Р С”Р С•Р СР В±Р С•-Р Р…Р В°Р В±Р С•РЎР‚ Р Т‘Р В»РЎРЏ Р СР В°Р С–Р В°Р В·Р С‘Р Р…Р В°: Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р С”Р С•Р СР В±Р С• + Р В±Р В»Р С•Р С”Р С‘ РЎРѓ РЎвЂљР С•Р Р†Р В°РЎР‚Р В°Р СР С‘ (Р Т‘Р В»РЎРЏ РЎРЊР С”РЎР‚Р В°Р Р…Р В° Р Р†РЎвЂ№Р В±Р С•РЎР‚Р В°).
   */
  router.get('/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productIsAvailableSql = getProductIsAvailableSql('p', 's');
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const cacheKey = makePublicCacheKey('combo-by-id', { tenantId, storeId, id });
      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.comboById,
        async () => {
          const [[combo]] = await db.query(
            `SELECT id, title, description, discount_percent, image_url
             FROM prod_combos WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1`,
            [tenantId, id]
          );
          if (!combo) {
            const err = new Error('NOT_FOUND');
            err.httpStatus = 404;
            throw err;
          }

          const [setBlocks] = await db.query(
            `SELECT sb.block_id, sb.sort_order, b.title AS block_title, b.min_select, b.max_select
             FROM prod_combo_set_blocks sb
             JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
             WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
            [tenantId, id]
          );

          const blocks = [];
          for (const sb of setBlocks) {
            const [productsRaw] = await db.query(
              `SELECT bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.description_short AS product_description_short, p.price, p.photos_json AS product_photos_json
               FROM prod_combo_block_products bp
               JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
               LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
               WHERE bp.tenant_id=? AND bp.block_id=? AND p.is_active=1 AND p.site_visibility=1
                 AND ${productIsAvailableSql}
               ORDER BY bp.sort_order ASC, bp.id ASC`,
              [storeId, tenantId, sb.block_id, storeId, storeId, storeId]
            );
            const minSelect = Math.max(1, Number(sb.min_select) || 1);
            if (!productsRaw.length) {
              const err = new Error('OUT_OF_STOCK');
              err.httpStatus = 409;
              throw err;
            }
            const products = productsRaw.map((r) => {
              const photos = safeJsonArray(r.product_photos_json);
              return {
                product_id: r.product_id,
                product_name: r.product_name,
                product_description_short: r.product_description_short || null,
                price: Number(r.price) || 0,
                sort_order: r.sort_order,
                is_default: Number(r.is_default) === 1,
                product_photo: photos.length ? photos[0] : null,
              };
            });
            let defaultSet = false;
            for (const p of products) {
              const wasDefault = p.is_default;
              p.is_default = wasDefault && !defaultSet;
              if (wasDefault) defaultSet = true;
            }
            blocks.push({
              block_id: sb.block_id,
              block_title: sb.block_title || '',
              min_select: minSelect,
              max_select: Math.max(1, Number(sb.max_select) || 1),
              products,
            });
          }

          return {
            ok: true,
            data: {
              id: combo.id,
              title: combo.title || '',
              description: combo.description || '',
              discount_percent: Number(combo.discount_percent) || 0,
              image_url: combo.image_url || null,
              blocks,
            },
          };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      if (e?.httpStatus === 404 || e?.message === 'NOT_FOUND') {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      if (e?.httpStatus === 409 || e?.message === 'OUT_OF_STOCK') {
        return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
      }
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function resolveCategoryIdFromQuery(tenantId, req) {
    const code = helpers.strOrNull(req.query.category_code);
    if (code) {
      const [r] = await db.query(
        'SELECT id FROM prod_categories WHERE tenant_id=? AND code=? LIMIT 1',
        [tenantId, code]
      );
      if (r.length) return Number(r[0].id);
    }

    const byId = Number(req.query.category_id);
    if (Number.isFinite(byId) && byId > 0) return byId;

    // fallback: "all"
    const [all] = await db.query(
      `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
      [tenantId]
    );
    return all.length ? Number(all[0].id) : null;
  }

  /**
   * Р С™Р С•Р СР В±Р С•-Р Р…Р В°Р В±Р С•РЎР‚РЎвЂ№ Р Т‘Р В»РЎРЏ Р С”Р В°РЎвЂљР В°Р В»Р С•Р С–Р В°: Р С—Р С• Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘ (category_code), РЎРѓ min_price Р С‘ РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ 2x2 РЎРѓР ВµРЎвЂљР С”Р С‘.
   * Р РЋР В°Р СР В°РЎРЏ Р Р…Р С‘Р В·Р С”Р В°РЎРЏ РЎвЂ Р ВµР Р…Р В° Р’В«Р С›РЎвЂљ X Р В Р’В»: Р С—Р С• Р С”Р В°Р В¶Р Т‘Р С•Р СРЎС“ Р В±Р В»Р С•Р С”РЎС“ Р В±Р ВµРЎР‚РЎвЂР С min_select РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р† РЎРѓ Р Р…Р В°Р С‘Р СР ВµР Р…РЎРЉРЎв‚¬Р ВµР в„– Р Р†Р С•Р В·Р СР С•Р В¶Р Р…Р С•Р в„– РЎвЂ Р ВµР Р…Р С•Р в„–
   * (РЎРѓ РЎС“РЎвЂЎРЎвЂРЎвЂљР С•Р С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р†/Р С—Р С•РЎР‚РЎвЂ Р С‘Р в„– РІР‚вЂќ Р В±Р ВµРЎР‚РЎвЂРЎвЂљРЎРѓРЎРЏ Р СР С‘Р Р…Р С‘Р СРЎС“Р С Р С—Р С• Р Р†РЎРѓР ВµР С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В°Р С РЎвЂљР С•Р Р†Р В°РЎР‚Р В°), РЎРѓРЎС“Р СР СР С‘РЎР‚РЎС“Р ВµР С, Р С—РЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С РЎРѓР С”Р С‘Р Т‘Р С”РЎС“ Р С”Р С•Р СР В±Р С•.
   */
  async function getCombosForCategory(tenantId, storeId, categoryId) {
    const [[catRow]] = await db.query(
      'SELECT id, code FROM prod_categories WHERE tenant_id=? AND id=? LIMIT 1',
      [tenantId, categoryId]
    );
    if (!catRow) return [];
    const categoryCode = (catRow.code || '').trim().toLowerCase();
    if (categoryCode === 'all') return [];

    const [combos] = await db.query(
      `SELECT id, title, description, discount_percent, image_url, sort_order
       FROM prod_combos
       WHERE tenant_id=? AND is_active=1 AND (category_code = ? OR (category_code IS NULL AND ? = ''))
       ORDER BY sort_order ASC, id ASC`,
      [tenantId, categoryCode, categoryCode]
    );
    if (!combos.length) return [];

    const roundPrice = (v) => Math.round(Number(v) * 100) / 100;
    const getConversionFactor = getConversionFactorMap(tenantId, db);
    const productIsAvailableSql = getProductIsAvailableSql('p', 's');
    const result = [];

    for (const combo of combos) {
      const [setBlocks] = await db.query(
        `SELECT sb.block_id, b.min_select
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=?
         ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, combo.id]
      );

      if (!setBlocks.length) continue;

      let minPriceSum = 0;
      const gridPhotos = [];
      let comboIsAvailable = true;
      const blockIds = setBlocks.map((sb) => Number(sb.block_id)).filter((id) => Number.isFinite(id) && id > 0);
      if (!blockIds.length) continue;

      const [allBlockProductsRaw] = await db.query(
        `SELECT bp.block_id, p.id, p.price, p.photos_json, p.base_unit_id, p.base_qty, p.unit_id,
                CASE WHEN ${productIsAvailableSql} THEN 1 ELSE 0 END AS is_available
         FROM prod_combo_block_products bp
         JOIN prod_products p ON p.id = bp.product_id AND p.tenant_id = bp.tenant_id
         LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE bp.tenant_id=? AND bp.block_id IN (${blockIds.map(() => '?').join(',')})
           AND p.is_active=1 AND p.site_visibility=1
         ORDER BY bp.block_id ASC, bp.sort_order ASC, bp.id ASC`,
        [storeId, storeId, storeId, storeId, tenantId, ...blockIds]
      );

      const blockProductsById = new Map();
      for (const row of allBlockProductsRaw) {
        const bid = Number(row.block_id);
        if (!blockProductsById.has(bid)) blockProductsById.set(bid, []);
        blockProductsById.get(bid).push(row);
      }

      const allProductIds = [...new Set(allBlockProductsRaw.map((r) => Number(r.id)).filter(Boolean))];
      let variantByProductId = new Map();
      if (allProductIds.length) {
        const [vaRows] = await db.query(
          `SELECT va.product_id, va.variant_group_id,
                  COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
                  vg.unit_id, vg.values, vg.sort_order
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
           WHERE va.tenant_id=? AND va.product_id IN (${allProductIds.map(() => '?').join(',')})
             AND va.is_active=1 AND vg.is_active=1
           ORDER BY va.sort_order ASC, vg.sort_order ASC`,
          [tenantId, ...allProductIds]
        );

        const variantGroupIds = [...new Set(vaRows.map((r) => Number(r.variant_group_id)).filter(Boolean))];
        const tiersByGroup = new Map();
        if (variantGroupIds.length) {
          const [tierRows] = await db.query(
            `SELECT variant_group_id, min_quantity, discount_percent, sort_order
             FROM prod_variant_discount_tiers
             WHERE tenant_id=? AND variant_group_id IN (${variantGroupIds.map(() => '?').join(',')})
             ORDER BY variant_group_id, sort_order ASC`,
            [tenantId, ...variantGroupIds]
          );
          for (const t of tierRows) {
            const gid = Number(t.variant_group_id);
            if (!tiersByGroup.has(gid)) tiersByGroup.set(gid, []);
            tiersByGroup.get(gid).push({
              min_quantity: t.min_quantity,
              discount_percent: t.discount_percent,
              sort_order: t.sort_order,
            });
          }
        }

        variantByProductId = new Map();
        for (const r of vaRows) {
          const pid = Number(r.product_id);
          if (variantByProductId.has(pid)) continue;
          const values = safeJsonArray(r.values);
          if (!values.length) continue;
          variantByProductId.set(pid, {
            unit_id: r.unit_id,
            values,
            default_value_index: r.default_value_index != null ? Number(r.default_value_index) : 0,
            discount_tiers: tiersByGroup.get(Number(r.variant_group_id)) || [],
          });
        }
      }

      for (const sb of setBlocks) {
        const minSelect = Math.max(1, Number(sb.min_select) || 1);
        const blockProductsRaw = blockProductsById.get(Number(sb.block_id)) || [];
        if (!blockProductsRaw.length) {
          comboIsAvailable = false;
          break;
        }
        const availableProductsRaw = blockProductsRaw.filter((row) => Number(row?.is_available || 0) === 1);
        if (availableProductsRaw.length < minSelect) {
          comboIsAvailable = false;
        }
        const pricingCandidatesRaw = availableProductsRaw.length >= minSelect
          ? availableProductsRaw
          : blockProductsRaw;

        const productsWithMinPrice = await Promise.all(
          pricingCandidatesRaw.map(async (r) => {
            const variant = variantByProductId.get(Number(r.id));
            const minP = await computeMinPriceForProduct(r, variant, getConversionFactor, roundPrice);
            return { ...r, minPrice: minP };
          })
        );
        productsWithMinPrice.sort((a, b) => (a.minPrice || 0) - (b.minPrice || 0));
        const selected = productsWithMinPrice.slice(0, minSelect);
        let blockSum = 0;
        for (const r of selected) {
          blockSum += Number(r.minPrice || 0);
          if (gridPhotos.length < 4) {
            const photos = safeJsonArray(r.photos_json);
            if (photos.length) gridPhotos.push(photos[0]);
          }
        }
        minPriceSum += roundPrice(blockSum);
      }

      const discountPercent = Number(combo.discount_percent) || 0;
      const minPrice = discountPercent > 0
        ? roundPrice(minPriceSum * (1 - discountPercent / 100))
        : roundPrice(minPriceSum);

      const gridPhotosFinal = gridPhotos.slice(0, 4);
      const entry = {
        id: combo.id,
        title: combo.title || '',
        description: combo.description || '',
        discount_percent: discountPercent,
        is_available: comboIsAvailable ? 1 : 0,
        image_url: combo.image_url || null,
        min_price: minPrice,
        grid_photos: gridPhotosFinal,
        block_product_ids: setBlocks.map((sb) => {
          const rows = blockProductsById.get(Number(sb.block_id)) || [];
          return rows
            .map((r) => Number(r.id || 0))
            .filter((pid) => Number.isFinite(pid) && pid > 0);
        }),
      };
      attachComboThumbs(entry);
      result.push(entry);
    }

    return result;
  }

  const COMBOS_CACHE_TTL_MS = 15000;
  const combosByCategoryCache = new Map();
  const combosByCategoryInflight = new Map();

  function getCombosCacheKey(tenantId, storeId, categoryId) {
    return `${Number(tenantId) || 0}:${Number(storeId) || 0}:${Number(categoryId) || 0}`;
  }

  async function getCombosForCategoryCached(tenantId, storeId, categoryId) {
    const key = getCombosCacheKey(tenantId, storeId, categoryId);
    const now = Date.now();
    const cached = combosByCategoryCache.get(key);
    if (cached && cached.expiresAt > now) return cached.data;

    const inflight = combosByCategoryInflight.get(key);
    if (inflight) return inflight;

    const p = (async () => {
      const data = await getCombosForCategory(tenantId, storeId, categoryId);
      combosByCategoryCache.set(key, {
        data,
        expiresAt: Date.now() + COMBOS_CACHE_TTL_MS,
      });
      return data;
    })().finally(() => {
      combosByCategoryInflight.delete(key);
    });

    combosByCategoryInflight.set(key, p);
    return p;
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const list = Array.isArray(items) ? items : [];
    const cap = Math.max(1, Number(limit) || 1);
    const results = new Array(list.length);
    let index = 0;

    const workers = Array.from({ length: Math.min(cap, list.length) }, async () => {
      while (true) {
        const i = index++;
        if (i >= list.length) break;
        results[i] = await mapper(list[i], i);
      }
    });
    await Promise.all(workers);
    return results;
  }

  router.get('/cart-upsell', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const cacheKey = makePublicCacheKey('cart-upsell', { tenantId, storeId });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      const [rows] = await db.query(
        `SELECT p.id, p.tenant_id, p.name, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
                s.qty AS stock_qty,
                EXISTS(
                  SELECT 1
                  FROM prod_option_assignments oa
                  JOIN prod_option_groups og ON og.tenant_id = oa.tenant_id AND og.id = oa.group_id
                  WHERE oa.tenant_id = p.tenant_id
                    AND oa.assign_type = 'product' AND oa.assign_id = p.id
                    AND oa.is_active = 1 AND og.is_active = 1
                  LIMIT 1
                ) AS has_options
         FROM prod_categories c
         JOIN prod_product_categories pc ON pc.tenant_id = c.tenant_id AND pc.category_id = c.id
         JOIN prod_products p ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE c.tenant_id = ? AND c.cart_visibility = 1 AND c.is_active = 1
           AND p.is_active = 1 AND p.site_visibility = 1
         GROUP BY p.id
         ORDER BY c.sort_order ASC, pc.sort_order ASC, p.id ASC
         LIMIT 30`,
        [storeId, tenantId]
      );

      for (const r of rows) {
        r.photos = safeJsonArray(r.photos_json);
        r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
        attachProductThumbs(r);
      }
      await enrichProductsWithDisplayPrice(rows, tenantId);
      await enrichProductsWithDiscounts(rows, tenantId, storeId);

      // Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р Т‘Р ВµРЎвЂћР С•Р В»РЎвЂљР Р…Р С•Р С–Р С• Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В° Р Т‘Р В»РЎРЏ Р С”Р С•РЎР‚РЎР‚Р ВµР С”РЎвЂљР Р…Р С•Р С–Р С• Р Т‘Р С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ Р Р† Р С”Р С•РЎР‚Р В·Р С‘Р Р…РЎС“
      const upsellProductIds = rows.map(r => Number(r.id)).filter(Boolean);
      if (upsellProductIds.length) {
        const phUpsell = upsellProductIds.map(() => '?').join(',');
        const [vaUpsellRows] = await db.query(
          `SELECT va.product_id, va.variant_group_id,
                  COALESCE(va.default_value_index, vg.default_value_index) AS default_value_index,
                  vg.unit_id, vg.values,
                  u.short_title AS unit_short_title
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
           LEFT JOIN prod_units u ON u.id = vg.unit_id
           WHERE va.tenant_id = ? AND va.product_id IN (${phUpsell})
             AND va.is_active = 1 AND vg.is_active = 1
           ORDER BY va.sort_order ASC, vg.sort_order ASC`,
          [tenantId, ...upsellProductIds]
        );
        const variantMap = new Map();
        for (const r of vaUpsellRows) {
          const pid = Number(r.product_id);
          if (variantMap.has(pid)) continue;
          const values = safeJsonArray(r.values);
          if (!values.length) continue;
          const defaultIdx = r.default_value_index != null ? Number(r.default_value_index) : 0;
          const idx = defaultIdx >= 0 && defaultIdx < values.length ? defaultIdx : 0;
          variantMap.set(pid, {
            variant_group_id: Number(r.variant_group_id),
            variant_value_index: idx,
            variant_label: String(values[idx]) + (r.unit_short_title ? ' ' + r.unit_short_title : ''),
          });
        }
        for (const row of rows) {
          const v = variantMap.get(Number(row.id));
          if (v) {
            v.variant_unit_price = row.display_price;
            row.default_variant = v;
          }
        }
      }

      const payload = { ok: true, data: rows };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.cartUpsell);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const categoryId = await resolveCategoryIdFromQuery(tenantId, req);
      if (!Number.isFinite(categoryId)) {
        return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
      }
      const lite = helpers.toBool(req.query.lite, false);
      const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 0)) || 0;
      const cacheKey = makePublicCacheKey('products', {
        tenantId,
        storeId,
        categoryId,
        lite: lite ? 1 : 0,
        limit,
      });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      // Р вЂРЎвЂ№РЎРѓРЎвЂљРЎР‚РЎвЂ№Р в„– "lite" РЎР‚Р ВµР В¶Р С‘Р С Р Т‘Р В»РЎРЏ Р С—Р ВµРЎР‚Р Р†Р С•Р С–Р С• РЎРЊР С”РЎР‚Р В°Р Р…Р В° Р Р†Р С‘РЎвЂљРЎР‚Р С‘Р Р…РЎвЂ№:
      // - Р СР С‘Р Р…Р С‘Р СР В°Р В»РЎРЉР Р…РЎвЂ№Р в„– Р Р…Р В°Р В±Р С•РЎР‚ Р С—Р С•Р В»Р ВµР в„–
      // - РЎС“Р С—РЎР‚Р С•РЎвЂ°РЎвЂР Р…Р Р…Р В°РЎРЏ Р Т‘Р С•РЎРѓРЎвЂљРЎС“Р С—Р Р…Р С•РЎРѓРЎвЂљРЎРЉ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р С—Р С• stock_qty)
      // - Р С•Р С–РЎР‚Р В°Р Р…Р С‘РЎвЂЎР ВµР Р…Р С‘Р Вµ Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р В°
      // Р СњРЎС“Р В¶Р ВµР Р…, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ LCP-Р С”Р В°РЎР‚РЎвЂљР С‘Р Р…Р С”Р В° Р Р…Р В°РЎвЂЎР С‘Р Р…Р В°Р В»Р В° Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљРЎРЉРЎРѓРЎРЏ РЎРѓРЎР‚Р В°Р В·РЎС“, Р В° Р Р…Р Вµ Р С—Р С•РЎРѓР В»Р Вµ РЎвЂљРЎРЏР В¶РЎвЂР В»РЎвЂ№РЎвЂ¦ Р С—Р С•Р Т‘Р В·Р В°Р С—РЎР‚Р С•РЎРѓР С•Р Р†.
      if (lite) {
        // "all"
        const [all] = await db.query(
          `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
          [tenantId]
        );
        const allCategoryId = all.length ? Number(all[0].id) : null;

        const limSql = limit > 0 ? `LIMIT ${Number(limit)}` : '';

        if (allCategoryId && categoryId === allCategoryId) {
          const [rows] = await db.query(
            `SELECT p.id, p.tenant_id, p.name, p.description_short, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
              s.qty AS stock_qty,
              pc.sort_order AS link_sort_order
             FROM prod_products p
             LEFT JOIN prod_product_stocks s
               ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
             LEFT JOIN prod_product_categories pc
               ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
             WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
             ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC
             ${limSql}`,
            [storeId, categoryId, tenantId]
          );
          for (const r of rows) {
            r.photos = safeJsonArray(r.photos_json);
            r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
            attachProductThumbs(r);
          }
          await enrichProductsWithDisplayPrice(rows, tenantId);
          await enrichProductsWithDiscounts(rows, tenantId, storeId);
          const payload = { ok: true, data: rows, combos: [], category_id: categoryId, lite: true };
          setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.products);
          res.set('x-public-cache', 'MISS');
          return res.json(payload);
        }

        const [rows] = await db.query(
          `SELECT p.id, p.tenant_id, p.name, p.description_short, p.price, p.base_qty, p.base_unit_id, p.unit_id, p.photos_json,
            s.qty AS stock_qty,
            pc.sort_order AS link_sort_order
           FROM prod_product_categories pc
           JOIN prod_products p
             ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           WHERE pc.tenant_id=? AND pc.category_id=?
             AND p.is_active=1 AND p.site_visibility=1
           ORDER BY pc.sort_order ASC, pc.id ASC
           ${limSql}`,
          [storeId, tenantId, categoryId]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = (r.stock_qty == null || Number(r.stock_qty) > 0);
          attachProductThumbs(r);
        }
        await enrichProductsWithDisplayPrice(rows, tenantId);
        await enrichProductsWithDiscounts(rows, tenantId, storeId);
        const payload = { ok: true, data: rows, combos: [], category_id: categoryId, lite: true };
        setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.products);
        res.set('x-public-cache', 'MISS');
        return res.json(payload);
      }

      // "all"
      const [all] = await db.query(
        `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
        [tenantId]
      );
      const allCategoryId = all.length ? Number(all[0].id) : null;

      if (allCategoryId && categoryId === allCategoryId) {
        const [rows] = await db.query(
          `SELECT p.*, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients i
                JOIN prod_product_stocks si
                  ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                  AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           LEFT JOIN prod_product_categories pc
             ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
           WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [storeId, storeId, storeId, storeId, categoryId, tenantId]
        );

        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
        }
        await enrichProductsWithDisplayPrice(rows, tenantId);
        await enrichProductsWithDiscounts(rows, tenantId, storeId);
        const combos = await getCombosForCategoryCached(tenantId, storeId, categoryId);
        const payload = { ok: true, data: rows, combos, category_id: categoryId };
        setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.products);
        res.set('x-public-cache', 'MISS');
        return res.json(payload);
      }

      const [rows] = await db.query(
        `SELECT p.*, pc.sort_order AS link_sort_order,
          s.qty AS stock_qty,
          CASE
            WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
              SELECT 1
              FROM prod_product_ingredients i
              JOIN prod_product_stocks si
                ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
              WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                AND si.qty IS NOT NULL AND si.qty <= 0
            ) AND NOT EXISTS (
              SELECT 1
              FROM prod_option_assignments oa
              JOIN prod_option_groups og
                ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
              WHERE oa.tenant_id=p.tenant_id
                AND oa.assign_type='product' AND oa.assign_id=p.id
                AND oa.is_active=1
                AND og.is_active=1
                AND COALESCE(og.out_of_stock_action, 1)=0
                AND NOT EXISTS (
                  SELECT 1
                  FROM prod_option_items oi
                  JOIN prod_products op
                    ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                  LEFT JOIN prod_product_stocks ops
                    ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                  WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                    AND oi.target_type='product'
                    AND oi.is_active=1
                    AND op.is_active=1
                    AND op.site_visibility=1
                    AND (ops.qty IS NULL OR ops.qty > 0)
                    AND NOT EXISTS (
                      SELECT 1
                      FROM prod_product_ingredients ip
                      JOIN prod_product_stocks ips
                        ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                      WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                        AND ips.qty IS NOT NULL AND ips.qty <= 0
                    )
                )
            )
            THEN 1 ELSE 0
          END AS is_available
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE pc.tenant_id=? AND pc.category_id=?
           AND p.is_active=1 AND p.site_visibility=1
         ORDER BY pc.sort_order ASC, pc.id ASC`,
        [storeId, storeId, storeId, storeId, tenantId, categoryId]
      );

      for (const r of rows) {
        r.photos = safeJsonArray(r.photos_json);
        r.is_available = Number(r.is_available || 0) === 1;
        attachProductThumbs(r);
      }
      await enrichProductsWithDisplayPrice(rows, tenantId);
      await enrichProductsWithDiscounts(rows, tenantId, storeId);
      const combos = await getCombosForCategoryCached(tenantId, storeId, categoryId);
      const payload = { ok: true, data: rows, combos, category_id: categoryId };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.products);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Р вЂР В°РЎвЂљРЎвЂЎ-Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р В° Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљР С•Р Р† Р С—Р С• Р Р…Р ВµРЎРѓР С”Р С•Р В»РЎРЉР С”Р С‘Р С Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎРЏР С Р В·Р В° Р С•Р Т‘Р С‘Р Р… Р В·Р В°Р С—РЎР‚Р С•РЎРѓ
  router.post('/products/batch/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const rawIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : [];
      const categoryIds = rawIds.map(Number).filter(n => Number.isFinite(n) && n > 0);
      if (!categoryIds.length) return res.json({ ok: true, data: {} });
      if (categoryIds.length > 50) return res.status(400).json({ ok: false, error: 'TOO_MANY' });
      const sortedCategoryIds = Array.from(new Set(categoryIds)).sort((a, b) => a - b);
      const cacheKey = makePublicCacheKey('products-batch-categories', {
        tenantId,
        storeId,
        categoryIds: sortedCategoryIds,
      });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      // Р С›Р С—РЎР‚Р ВµР Т‘Р ВµР В»РЎРЏР ВµР С "all"-Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘РЎР‹
      const [allRows] = await db.query(
        `SELECT id FROM prod_categories WHERE tenant_id=? AND code='all' LIMIT 1`,
        [tenantId]
      );
      const allCategoryId = allRows.length ? Number(allRows[0].id) : null;

      // Р В Р В°Р В·Р Т‘Р ВµР В»РЎРЏР ВµР С: Р С•Р В±РЎвЂ№РЎвЂЎР Р…РЎвЂ№Р Вµ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘ Р С‘ "all"
      const normalIds = categoryIds.filter(id => id !== allCategoryId);
      const hasAll = allCategoryId && categoryIds.includes(allCategoryId);

      const productIsAvailableSql = getProductIsAvailableSql('p', 's');
      const allProducts = []; // { ...product, _category_id }

      // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљРЎвЂ№ Р С•Р В±РЎвЂ№РЎвЂЎР Р…РЎвЂ№РЎвЂ¦ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р в„– Р С•Р Т‘Р Р…Р С‘Р С Р В·Р В°Р С—РЎР‚Р С•РЎРѓР С•Р С
      if (normalIds.length) {
        const ph = normalIds.map(() => '?').join(',');
        const [rows] = await db.query(
          `SELECT p.*, pc.category_id AS _category_id, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1 FROM prod_product_ingredients i
                JOIN prod_product_stocks si ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1 FROM prod_option_assignments oa
                JOIN prod_option_groups og ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1 AND og.is_active=1 AND COALESCE(og.out_of_stock_action,1)=0
                  AND NOT EXISTS (
                    SELECT 1 FROM prod_option_items oi
                    JOIN prod_products op ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product' AND oi.is_active=1 AND op.is_active=1 AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1 FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_product_categories pc
           JOIN prod_products p ON p.tenant_id=pc.tenant_id AND p.id=pc.product_id
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           WHERE pc.tenant_id=? AND pc.category_id IN (${ph})
             AND p.is_active=1 AND p.site_visibility=1
           ORDER BY pc.category_id ASC, pc.sort_order ASC, pc.id ASC`,
          [storeId, storeId, storeId, storeId, tenantId, ...normalIds]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
          allProducts.push(r);
        }
      }

      // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљРЎвЂ№ "all"-Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘
      if (hasAll) {
        const [rows] = await db.query(
          `SELECT p.*, ? AS _category_id, pc.sort_order AS link_sort_order,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1 FROM prod_product_ingredients i
                JOIN prod_product_stocks si ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1 FROM prod_option_assignments oa
                JOIN prod_option_groups og ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1 AND og.is_active=1 AND COALESCE(og.out_of_stock_action,1)=0
                  AND NOT EXISTS (
                    SELECT 1 FROM prod_option_items oi
                    JOIN prod_products op ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product' AND oi.is_active=1 AND op.is_active=1 AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1 FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
           LEFT JOIN prod_product_categories pc ON pc.tenant_id=p.tenant_id AND pc.product_id=p.id AND pc.category_id=?
           WHERE p.tenant_id=? AND p.is_active=1 AND p.site_visibility=1
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [allCategoryId, storeId, storeId, storeId, storeId, allCategoryId, tenantId]
        );
        for (const r of rows) {
          r.photos = safeJsonArray(r.photos_json);
          r.is_available = Number(r.is_available || 0) === 1;
          attachProductThumbs(r);
          allProducts.push(r);
        }
      }

      // Р С›Р В±Р С•Р С–Р В°РЎвЂ°Р В°Р ВµР С Р Р†РЎРѓР Вµ Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљРЎвЂ№ Р В·Р В° Р С•Р Т‘Р С‘Р Р… Р С—РЎР‚Р С•РЎвЂ¦Р С•Р Т‘
      await enrichProductsWithDisplayPrice(allProducts, tenantId);
      await enrichProductsWithDiscounts(allProducts, tenantId, storeId);

      // Р вЂњРЎР‚РЎС“Р С—Р С—Р С‘РЎР‚РЎС“Р ВµР С Р С—Р С• category_id
      const productsByCategory = {};
      for (const id of categoryIds) productsByCategory[id] = [];
      for (const p of allProducts) {
        const cid = Number(p._category_id);
        if (productsByCategory[cid]) productsByCategory[cid].push(p);
      }

      // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р С”Р С•Р СР В±Р С• Р Т‘Р В»РЎРЏ Р Р†РЎРѓР ВµРЎвЂ¦ Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р в„– Р С—Р В°РЎР‚Р В°Р В»Р В»Р ВµР В»РЎРЉР Р…Р С•
      const combosResults = await mapWithConcurrency(categoryIds, 4, async (id) => {
        try {
          const combos = await getCombosForCategoryCached(tenantId, storeId, id);
          return [id, combos];
        } catch {
          return [id, []];
        }
      });
      const combosByCategory = {};
      for (const [id, combos] of combosResults) combosByCategory[id] = combos;

      const payload = { ok: true, data: productsByCategory, combos: combosByCategory };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.productsBatchCategories);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const cacheKey = makePublicCacheKey('products-by-id', { tenantId, storeId, id });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      const [rows] = await db.query(
        `SELECT p.*,
            s.qty AS stock_qty,
            CASE
              WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients i
                JOIN prod_product_stocks si
                  ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                  AND si.qty IS NOT NULL AND si.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
         FROM prod_products p
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE p.tenant_id=? AND p.id=? AND p.is_active=1 AND p.site_visibility=1
         LIMIT 1`,
        [storeId, storeId, storeId, storeId, tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const p = rows[0];
      p.photos = safeJsonArray(p.photos_json);
      attachProductThumbs(p);
      p.is_available = Number(p.is_available || 0) === 1;

      await enrichProductsWithDisplayPrice([p], tenantId);
      await enrichProductsWithDiscounts([p], tenantId, storeId);

      const payload = { ok: true, data: p };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.productById);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const cacheKey = makePublicCacheKey('product-ingredients', { tenantId, storeId, productId });
      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productIngredients,
        async () => {
          const [pcsRows] = await db.query(
            `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
            [tenantId]
          );
          const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

          const [rows] = await db.query(
            `SELECT 
               i.id,
               i.ingredient_id,
               i.quantity,
               i.unit_id,
               i.quantity_min,
               i.quantity_max,
               i.quantity_step,
               i.price_override,
               i.is_variable,
               i.sort_order,
               p.name AS ingredient_name,
               p.price AS ingredient_price,
               p.base_unit_id AS ingredient_base_unit_id,
               p.base_qty AS ingredient_base_qty,
               p.unit_id AS ingredient_unit_id,
               p.photos_json AS ingredient_photos,
               u.code AS unit_code,
               u.title AS unit_title,
               u.short_title AS unit_short_title,
               pul.factor AS ingredient_pcs_factor
             FROM prod_product_ingredients i
             JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
             JOIN prod_units u ON u.id=i.unit_id
             LEFT JOIN prod_product_unit_links pul
               ON pul.tenant_id=i.tenant_id
              AND pul.product_id=i.ingredient_id
              AND pul.base_unit_id=p.base_unit_id
              AND pul.unit_id=?
             WHERE i.tenant_id=? AND i.product_id=?
               AND (i.is_variable = 1 OR i.is_variable IS NULL)
             ORDER BY i.sort_order ASC, i.id ASC`,
            [pcsUnitId || 0, tenantId, productId]
          );

          for (const r of rows) {
            r.ingredient_photos = safeJsonArray(r.ingredient_photos);
          }

          return { ok: true, data: rows };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Batch ingredients for multiple products in one request
  router.post('/products/batch/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
      if (!ids.length) return res.json({ ok: true, data: {} });
      if (ids.length > 200) return res.status(400).json({ ok: false, error: 'TOO_MANY' });
      const sortedIds = Array.from(new Set(ids)).sort((a, b) => a - b);
      const cacheKey = makePublicCacheKey('products-batch-ingredients', {
        tenantId,
        ids: sortedIds,
      });

      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productsBatchIngredients,
        async () => {
          const [pcsRows] = await db.query(
            `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
            [tenantId]
          );
          const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

          const placeholders = sortedIds.map(() => '?').join(',');
          const [rows] = await db.query(
            `SELECT
               i.product_id,
               i.id,
               i.ingredient_id,
               i.quantity,
               i.unit_id,
               i.quantity_min,
               i.quantity_max,
               i.quantity_step,
               i.price_override,
               i.is_variable,
               i.sort_order,
               p.name AS ingredient_name,
               p.price AS ingredient_price,
               p.base_unit_id AS ingredient_base_unit_id,
               p.base_qty AS ingredient_base_qty,
               p.unit_id AS ingredient_unit_id,
               p.photos_json AS ingredient_photos,
               u.code AS unit_code,
               u.title AS unit_title,
               u.short_title AS unit_short_title,
               pul.factor AS ingredient_pcs_factor
             FROM prod_product_ingredients i
             JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
             JOIN prod_units u ON u.id=i.unit_id
             LEFT JOIN prod_product_unit_links pul
               ON pul.tenant_id=i.tenant_id
              AND pul.product_id=i.ingredient_id
              AND pul.base_unit_id=p.base_unit_id
              AND pul.unit_id=?
             WHERE i.tenant_id=? AND i.product_id IN (${placeholders})
               AND (i.is_variable = 1 OR i.is_variable IS NULL)
             ORDER BY i.product_id ASC, i.sort_order ASC, i.id ASC`,
            [pcsUnitId || 0, tenantId, ...sortedIds]
          );

          const result = {};
          for (const r of rows) {
            r.ingredient_photos = safeJsonArray(r.ingredient_photos);
            const pid = Number(r.product_id);
            if (!result[pid]) result[pid] = [];
            result[pid].push(r);
          }

          return { ok: true, data: result };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Batch variants for multiple products in one request
  router.post('/products/batch/variants', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
      if (!ids.length) return res.json({ ok: true, data: {} });
      if (ids.length > 200) return res.status(400).json({ ok: false, error: 'TOO_MANY' });
      const sortedIds = Array.from(new Set(ids)).sort((a, b) => a - b);
      const cacheKey = makePublicCacheKey('products-batch-variants', {
        tenantId,
        ids: sortedIds,
      });

      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productsBatchVariants,
        async () => {
          const placeholders = sortedIds.map(() => '?').join(',');
          const [variantRows] = await db.query(
            `SELECT
               va.product_id,
               vg.id,
               vg.title,
               vg.unit_id,
               vg.values,
               vg.default_value_index AS group_default_value_index,
               va.default_value_index AS assignment_default_value_index,
               u.code AS unit_code,
               u.title AS unit_title,
               u.short_title AS unit_short_title
             FROM prod_variant_assignments va
             JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
             LEFT JOIN prod_units u ON u.id=vg.unit_id
             WHERE va.tenant_id=?
               AND va.product_id IN (${placeholders})
               AND va.is_active=1 AND vg.is_active=1
             ORDER BY va.product_id ASC, va.sort_order ASC, vg.sort_order ASC`,
            [tenantId, ...sortedIds]
          );

          const groupIds = Array.from(
            new Set(variantRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0))
          );
          const tiersByGroupId = new Map();
          if (groupIds.length) {
            const tierPlaceholders = groupIds.map(() => '?').join(',');
            const [tiers] = await db.query(
              `SELECT variant_group_id, min_quantity, discount_percent, sort_order
               FROM prod_variant_discount_tiers
               WHERE tenant_id=? AND variant_group_id IN (${tierPlaceholders})
               ORDER BY variant_group_id ASC, sort_order ASC, min_quantity ASC`,
              [tenantId, ...groupIds]
            );
            for (const t of tiers) {
              const gid = Number(t.variant_group_id);
              if (!tiersByGroupId.has(gid)) tiersByGroupId.set(gid, []);
              tiersByGroupId.get(gid).push(t);
            }
          }

          const result = {};
          for (const v of variantRows) {
            const pid = Number(v.product_id);
            if (!result[pid]) result[pid] = [];
            const groupDefaultIdx = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
            const assignmentDefaultIdx = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
            result[pid].push({
              id: Number(v.id),
              title: str(v.title || ""),
              unit_id: v.unit_id ? Number(v.unit_id) : null,
              unit_code: str(v.unit_code || ""),
              unit_title: str(v.unit_title || ""),
              unit_short_title: str(v.unit_short_title || ""),
              values: safeJsonArray(v.values),
              default_value_index: assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx,
              discount_tiers: tiersByGroupId.get(Number(v.id)) || [],
            });
          }

          return { ok: true, data: result };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // Batch option assignments for multiple products in one request
  router.post('/products/batch/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
      if (!ids.length) return res.json({ ok: true, data: {} });
      if (ids.length > 200) return res.status(400).json({ ok: false, error: 'TOO_MANY' });

      const sortedIds = Array.from(new Set(ids)).sort((a, b) => a - b);
      const cacheKey = makePublicCacheKey('products-batch-option-assignments', {
        tenantId,
        storeId,
        ids: sortedIds,
      });

      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productsBatchOptionAssignments,
        async () => {
          const placeholders = sortedIds.map(() => '?').join(',');
          const [rows] = await db.query(
            `SELECT
               a.assign_id AS product_id,
               a.id AS assignment_id,
               a.group_id,
               a.priority,
               a.sort_order,
               a.is_active,
               a.selection_type AS assignment_selection_type,
               a.min_select AS assignment_min_select,
               a.max_select AS assignment_max_select,
               g.title,
               g.selection_type AS group_selection_type,
               g.min_select AS group_min_select,
               g.max_select AS group_max_select,
               g.is_required,
               g.out_of_stock_action
             FROM prod_option_assignments a
             JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
             WHERE a.tenant_id=?
               AND a.assign_type='product'
               AND a.assign_id IN (${placeholders})
               AND a.is_active=1
               AND g.is_active=1
             ORDER BY a.assign_id ASC, a.sort_order ASC, a.id ASC`,
            [tenantId, ...sortedIds]
          );

          const result = {};
          sortedIds.forEach((pid) => { result[pid] = []; });
          rows.forEach((r) => {
            const pid = Number(r.product_id);
            if (!Number.isFinite(pid) || pid <= 0) return;
            if (!result[pid]) result[pid] = [];
            result[pid].push({
              assignment_id: Number(r.assignment_id),
              group_id: Number(r.group_id),
              title: str(r.title || ''),
              selection_type: r.assignment_selection_type || r.group_selection_type || 'single',
              min_select: r.assignment_min_select ?? r.group_min_select ?? 0,
              max_select: r.assignment_max_select ?? r.group_max_select ?? null,
              is_required: Number(r.is_required ?? 0) === 1,
              is_active: Number(r.is_active || 0) === 1,
              out_of_stock_action: r.out_of_stock_action == null ? 1 : Number(r.out_of_stock_action),
              priority: Number(r.priority || 0),
              sort_order: Number(r.sort_order || 0),
            });
          });

          return { ok: true, data: result };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/products/batch/default-cart-config', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const ids = Array.isArray(req.body?.ids)
        ? Array.from(new Set(req.body.ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)))
        : [];
      if (!ids.length) return res.json({ ok: true, data: {} });
      if (ids.length > 100) return res.status(400).json({ ok: false, error: 'TOO_MANY' });

      const toNum = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const parseVariantValueNumber = (value) => {
        const s = String(value ?? '').replace(',', '.');
        const m = s.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : NaN;
      };
      const formatVariantValueLabel = (value, unitShortTitle) => {
        const rawValue = str(value || '').trim();
        const unit = str(unitShortTitle || '').trim();
        if (!rawValue) return '';
        if (!unit) return rawValue;
        const hasLetters = /[a-zР°-СЏ]/i.test(rawValue);
        return hasLetters ? rawValue : `${rawValue} ${unit}`;
      };
      const getSimpleVariantPrice = (basePrice, values, selectedIndex, discountTiers) => {
        const price = Number(basePrice || 0);
        const idx = Number(selectedIndex);
        const list = Array.isArray(values) ? values : [];
        if (!list.length || !Number.isFinite(idx) || idx < 0 || idx >= list.length) return price;
        const baseValue = parseVariantValueNumber(list[0]);
        const selectedValue = parseVariantValueNumber(list[idx]);
        if (Number.isFinite(baseValue) && baseValue > 0 && Number.isFinite(selectedValue) && selectedValue > 0) {
          let out = price * (selectedValue / baseValue);
          const tiers = Array.isArray(discountTiers) ? discountTiers : [];
          const tier = tiers.find((t) => Number(t.sort_order) === idx);
          const discountPercent = Number(tier?.discount_percent || 0) || 0;
          if (discountPercent !== 0) out = out * (1 - discountPercent / 100);
          return out;
        }
        return price;
      };

      const [productRows] = await db.query(
        `SELECT id, name, price, base_unit_id, base_qty, unit_id
         FROM prod_products
         WHERE tenant_id=? AND id IN (${ids.map(() => '?').join(',')})`,
        [tenantId, ...ids]
      );
      const productsById = new Map(productRows.map((r) => [Number(r.id), r]));

      const [pcsRows] = await db.query(
        `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
        [tenantId]
      );
      const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : 0;

      const [ingredientRows] = await db.query(
        `SELECT
           i.product_id,
           i.id,
           i.ingredient_id,
           i.quantity,
           i.unit_id,
           i.quantity_min,
           i.quantity_max,
           i.quantity_step,
           i.price_override,
           i.is_variable,
           i.sort_order,
           p.name AS ingredient_name,
           p.photos_json AS ingredient_photos,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title,
           pul.factor AS ingredient_pcs_factor
         FROM prod_product_ingredients i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
         JOIN prod_units u ON u.id=i.unit_id
         LEFT JOIN prod_product_unit_links pul
           ON pul.tenant_id=i.tenant_id
          AND pul.product_id=i.ingredient_id
          AND pul.base_unit_id=p.base_unit_id
          AND pul.unit_id=?
         WHERE i.tenant_id=? AND i.product_id IN (${ids.map(() => '?').join(',')})
           AND (i.is_variable = 1 OR i.is_variable IS NULL)
         ORDER BY i.product_id ASC, i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, tenantId, ...ids]
      );
      const ingredientsByProductId = new Map();
      for (const r of ingredientRows) {
        const pid = Number(r.product_id);
        if (!ingredientsByProductId.has(pid)) ingredientsByProductId.set(pid, []);
        r.ingredient_photos = safeJsonArray(r.ingredient_photos);
        ingredientsByProductId.get(pid).push(r);
      }

      const [variantRows] = await db.query(
        `SELECT
           va.product_id,
           vg.id,
           vg.title,
           vg.unit_id,
           vg.values,
           vg.default_value_index AS group_default_value_index,
           va.default_value_index AS assignment_default_value_index,
           u.code AS unit_code,
           u.title AS unit_title,
           u.short_title AS unit_short_title
         FROM prod_variant_assignments va
         JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
         LEFT JOIN prod_units u ON u.id=vg.unit_id
         WHERE va.tenant_id=?
           AND va.product_id IN (${ids.map(() => '?').join(',')})
           AND va.is_active=1 AND vg.is_active=1
         ORDER BY va.product_id ASC, va.sort_order ASC, vg.sort_order ASC`,
        [tenantId, ...ids]
      );
      const groupIds = Array.from(new Set(variantRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0)));
      const tiersByGroupId = new Map();
      if (groupIds.length) {
        const [tiers] = await db.query(
          `SELECT variant_group_id, min_quantity, discount_percent, sort_order
           FROM prod_variant_discount_tiers
           WHERE tenant_id=? AND variant_group_id IN (${groupIds.map(() => '?').join(',')})
           ORDER BY variant_group_id ASC, sort_order ASC, min_quantity ASC`,
          [tenantId, ...groupIds]
        );
        for (const t of tiers) {
          const gid = Number(t.variant_group_id);
          if (!tiersByGroupId.has(gid)) tiersByGroupId.set(gid, []);
          tiersByGroupId.get(gid).push(t);
        }
      }
      const variantsByProductId = new Map();
      for (const v of variantRows) {
        const pid = Number(v.product_id);
        if (!variantsByProductId.has(pid)) variantsByProductId.set(pid, []);
        const groupDefaultIdx = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
        const assignmentDefaultIdx = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
        variantsByProductId.get(pid).push({
          id: Number(v.id),
          title: str(v.title || ''),
          unit_id: v.unit_id ? Number(v.unit_id) : null,
          unit_code: str(v.unit_code || ''),
          unit_title: str(v.unit_title || ''),
          unit_short_title: str(v.unit_short_title || ''),
          values: safeJsonArray(v.values),
          default_value_index: assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx,
          discount_tiers: tiersByGroupId.get(Number(v.id)) || [],
        });
      }

      const [assignmentRows] = await db.query(
        `SELECT
           a.assign_id AS product_id,
           a.id AS assignment_id,
           a.group_id,
           a.priority,
           a.sort_order,
           a.is_active,
           a.selection_type AS assignment_selection_type,
           a.min_select AS assignment_min_select,
           a.max_select AS assignment_max_select,
           g.title,
           g.selection_type AS group_selection_type,
           g.min_select AS group_min_select,
           g.max_select AS group_max_select,
           g.is_required,
           g.out_of_stock_action,
           g.is_active AS group_is_active
         FROM prod_option_assignments a
         JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
         WHERE a.tenant_id=?
           AND a.assign_type='product'
           AND a.assign_id IN (${ids.map(() => '?').join(',')})
           AND a.is_active=1
           AND g.is_active=1
         ORDER BY a.assign_id ASC, a.sort_order ASC, a.id ASC`,
        [tenantId, ...ids]
      );

      const assignmentsByProductId = new Map();
      const optionGroupIds = new Set();
      for (const r of assignmentRows) {
        const pid = Number(r.product_id);
        if (!assignmentsByProductId.has(pid)) assignmentsByProductId.set(pid, []);
        assignmentsByProductId.get(pid).push({
          assignment_id: Number(r.assignment_id),
          group_id: Number(r.group_id),
          title: str(r.title || ''),
          selection_type: r.assignment_selection_type || r.group_selection_type || 'single',
          min_select: r.assignment_min_select ?? r.group_min_select ?? 0,
          max_select: r.assignment_max_select ?? r.group_max_select ?? null,
          is_required: Number(r.is_required ?? 0) === 1,
          is_active: Number(r.is_active || 0) === 1,
          out_of_stock_action: r.out_of_stock_action == null ? 1 : Number(r.out_of_stock_action),
          priority: Number(r.priority || 0),
          sort_order: Number(r.sort_order || 0),
        });
        optionGroupIds.add(Number(r.group_id));
      }

      const optionGroupDetailsById = new Map();
      if (optionGroupIds.size > 0) {
        const groupIdsArr = Array.from(optionGroupIds).filter((n) => Number.isFinite(n) && n > 0);
        const [groupRows] = await db.query(
          `SELECT id, title, selection_type, min_select, max_select, is_required, allow_variants, is_active
           FROM prod_option_groups
           WHERE tenant_id=? AND id IN (${groupIdsArr.map(() => '?').join(',')})`,
          [tenantId, ...groupIdsArr]
        );
        const groupMetaById = new Map(groupRows.map((g) => [Number(g.id), g]));

        const [itemRows] = await db.query(
          `SELECT
             i.id,
             i.group_id,
             i.target_product_id,
             i.price_mode,
             i.price_value,
             i.qty_min,
             i.qty_max,
             i.is_active,
             i.sort_order,
             p.name AS product_name,
             p.price AS product_price,
             p.photos_json AS product_photos_json
           FROM prod_option_items i
           JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
           LEFT JOIN prod_product_stocks ps
             ON ps.tenant_id = p.tenant_id AND ps.store_id = ? AND ps.product_id = p.id
           WHERE i.tenant_id=?
             AND i.group_id IN (${groupIdsArr.map(() => '?').join(',')})
             AND i.target_type='product'
             AND i.is_active=1
             AND p.is_active=1
             AND p.site_visibility=1
             AND (ps.qty IS NULL OR ps.qty > 0)
           ORDER BY i.group_id ASC, i.sort_order ASC, i.id ASC`,
          [storeId, tenantId, ...groupIdsArr]
        );

        const targetOptionProductIds = Array.from(new Set(
          itemRows.map((r) => Number(r.target_product_id)).filter((n) => Number.isFinite(n) && n > 0)
        ));
        const optionVariantsByProductId = new Map();
        if (targetOptionProductIds.length > 0) {
          const [ovRows] = await db.query(
            `SELECT
               va.product_id,
               vg.id,
               vg.title,
               vg.unit_id,
               vg.values,
               vg.default_value_index AS group_default_value_index,
               va.default_value_index AS assignment_default_value_index,
               u.code AS unit_code,
               u.title AS unit_title,
               u.short_title AS unit_short_title
             FROM prod_variant_assignments va
             JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
             LEFT JOIN prod_units u ON u.id=vg.unit_id
             WHERE va.tenant_id=?
               AND va.product_id IN (${targetOptionProductIds.map(() => '?').join(',')})
               AND va.is_active=1 AND vg.is_active=1
             ORDER BY va.product_id ASC, va.sort_order ASC, vg.sort_order ASC`,
            [tenantId, ...targetOptionProductIds]
          );
          const ovGroupIds = Array.from(new Set(ovRows.map((r) => Number(r.id)).filter((n) => Number.isFinite(n) && n > 0)));
          const ovTiersByGroupId = new Map();
          if (ovGroupIds.length) {
            const [ovTiers] = await db.query(
              `SELECT variant_group_id, min_quantity, discount_percent, sort_order
               FROM prod_variant_discount_tiers
               WHERE tenant_id=? AND variant_group_id IN (${ovGroupIds.map(() => '?').join(',')})
               ORDER BY variant_group_id ASC, sort_order ASC, min_quantity ASC`,
              [tenantId, ...ovGroupIds]
            );
            for (const t of ovTiers) {
              const gid = Number(t.variant_group_id);
              if (!ovTiersByGroupId.has(gid)) ovTiersByGroupId.set(gid, []);
              ovTiersByGroupId.get(gid).push(t);
            }
          }
          for (const v of ovRows) {
            const pid = Number(v.product_id);
            if (!optionVariantsByProductId.has(pid)) optionVariantsByProductId.set(pid, []);
            const groupDefaultIdx = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
            const assignmentDefaultIdx = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
            optionVariantsByProductId.get(pid).push({
              id: Number(v.id),
              title: str(v.title || ''),
              unit_id: v.unit_id ? Number(v.unit_id) : null,
              unit_code: str(v.unit_code || ''),
              unit_title: str(v.unit_title || ''),
              unit_short_title: str(v.unit_short_title || ''),
              values: safeJsonArray(v.values),
              default_value_index: assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx,
              discount_tiers: ovTiersByGroupId.get(Number(v.id)) || [],
            });
          }
        }

        const groupItems = new Map();
        for (const item of itemRows) {
          const gid = Number(item.group_id);
          if (!groupItems.has(gid)) groupItems.set(gid, []);
          const targetProductId = Number(item.target_product_id || 0);
          const variants = optionVariantsByProductId.get(targetProductId) || [];
          groupItems.get(gid).push({
            id: Number(item.id),
            target_product_id: targetProductId,
            title: str(item.product_name || ''),
            name: str(item.product_name || ''),
            product_price: Number(item.product_price || 0),
            price_mode: str(item.price_mode || 'from_target'),
            price_value: Number(item.price_value || 0),
            price: str(item.price_mode || '') === 'fixed'
              ? Number(item.price_value || 0)
              : Number(item.product_price || 0),
            qty_min: Number(item.qty_min ?? 1),
            qty_max: Number(item.qty_max ?? 1),
            is_active: Number(item.is_active || 0) === 1,
            product_photos_json: safeJsonArray(item.product_photos_json),
            variants,
          });
        }

        for (const gid of groupIdsArr) {
          const meta = groupMetaById.get(Number(gid));
          if (!meta) continue;
          optionGroupDetailsById.set(Number(gid), {
            group: {
              id: Number(meta.id),
              title: str(meta.title || ''),
              selection_type: meta.selection_type || 'single',
              min_select: meta.min_select ?? 0,
              max_select: meta.max_select ?? null,
              is_required: Number(meta.is_required ?? 0) === 1,
              allow_variants: Number(meta.allow_variants ?? 0) === 1,
              is_active: Number(meta.is_active || 0) === 1,
            },
            items: groupItems.get(Number(gid)) || [],
          });
        }
      }

      const result = {};
      for (const pid of ids) {
        const product = productsById.get(Number(pid));
        if (!product) continue;
        const variants = variantsByProductId.get(Number(pid)) || [];
        const optionAssignments = assignmentsByProductId.get(Number(pid)) || [];
        const ingredientsRaw = ingredientsByProductId.get(Number(pid)) || [];

        let variantGroupId = null;
        let variantValueIndex = null;
        let variantLabel = '';
        let variantUnitPrice = Number(product.price || 0);
        const firstVariantGroup = Array.isArray(variants) && variants.length > 0 ? variants[0] : null;
        const variantValues = Array.isArray(firstVariantGroup?.values) ? firstVariantGroup.values : [];
        if (firstVariantGroup && variantValues.length > 0) {
          const rawIdx = firstVariantGroup.default_value_index != null ? Number(firstVariantGroup.default_value_index) : 0;
          const safeIdx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < variantValues.length ? rawIdx : 0;
          const valueLabel = formatVariantValueLabel(
            variantValues[safeIdx],
            firstVariantGroup.unit_short_title || firstVariantGroup.unit_code || firstVariantGroup.unit_title || ''
          );
          const groupTitle = str(firstVariantGroup.title || '').trim();
          variantGroupId = Number(firstVariantGroup.id || 0) || null;
          variantValueIndex = safeIdx;
          variantLabel = groupTitle ? `${groupTitle}: ${valueLabel}` : valueLabel;
          variantUnitPrice = getSimpleVariantPrice(
            Number(product.price || 0),
            variantValues,
            safeIdx,
            firstVariantGroup.discount_tiers || []
          );
        }

        const selectedOptionItems = [];
        const activeAssignments = optionAssignments.filter((a) => Number(a?.is_active ?? 1) === 1);
        activeAssignments.forEach((assignment) => {
          const groupId = Number(assignment?.group_id || 0);
          if (!Number.isFinite(groupId) || groupId <= 0) return;
          const details = optionGroupDetailsById.get(groupId) || null;
          if (!details) return;
          const groupMeta = details.group || {};
          const items = (Array.isArray(details.items) ? details.items : [])
            .filter((item) => Number(item?.is_active ?? 1) === 1);
          if (!items.length) return;

          const selectionType = str(groupMeta.selection_type || assignment.selection_type || 'single').trim().toLowerCase() || 'single';
          const minSelect = Number(groupMeta.min_select ?? assignment.min_select ?? 0);
          const requiredSingle = selectionType === 'single' && (Number(groupMeta.is_required || 0) === 1 || minSelect > 0);

          const addDefaultOptionItem = (item, qty) => {
            const safeQty = Math.max(1, Number(qty || 1));
            const targetProductId = Number(item?.target_product_id || item?.product_id || 0);
            const out = {
              id: Number(item.id),
              title: str(item.title || item.name || ''),
              name: str(item.name || item.title || ''),
              price: Number(item.price || 0),
              qty: safeQty,
              quantity: safeQty,
              target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
              product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
            };

            const itemVariants = Array.isArray(item?.variants) ? item.variants : [];
            const firstItemVariantGroup = itemVariants.length ? itemVariants[0] : null;
            const itemVariantValues = Array.isArray(firstItemVariantGroup?.values) ? firstItemVariantGroup.values : [];
            if (firstItemVariantGroup && itemVariantValues.length > 0) {
              const rawVariantIdx = firstItemVariantGroup.default_value_index != null
                ? Number(firstItemVariantGroup.default_value_index)
                : 0;
              const safeVariantIdx = Number.isFinite(rawVariantIdx) && rawVariantIdx >= 0 && rawVariantIdx < itemVariantValues.length
                ? rawVariantIdx
                : 0;
              const variantUnitPriceForOption = getSimpleVariantPrice(
                Number(out.price || 0),
                itemVariantValues,
                safeVariantIdx,
                firstItemVariantGroup.discount_tiers || []
              );
              out.variant_group_id = Number(firstItemVariantGroup.id || 0) || null;
              out.variant_value_index = safeVariantIdx;
              out.variant_label = formatVariantValueLabel(
                itemVariantValues[safeVariantIdx],
                firstItemVariantGroup.unit_short_title || firstItemVariantGroup.unit_code || firstItemVariantGroup.unit_title || ''
              );
              out.variant_price_diff = Number(variantUnitPriceForOption || 0) - Number(out.price || 0);
              out.price = Number(variantUnitPriceForOption || 0);
            }

            selectedOptionItems.push(out);
          };

          if (selectionType === 'single') {
            if (requiredSingle) addDefaultOptionItem(items[0], 1);
            return;
          }

          if (selectionType === 'multiple_group' || selectionType === 'multiple_item' || selectionType === 'multiple') {
            const requiredCount = Number.isFinite(minSelect) ? Math.max(0, Math.floor(minSelect)) : 0;
            if (requiredCount <= 0) return;

            let selectedCount = 0;
            items.forEach((item) => {
              if (selectedCount >= requiredCount) return;
              const qtyMin = Number(item?.qty_min ?? 0);
              const defaultQty = qtyMin > 0 ? qtyMin : 1;
              addDefaultOptionItem(item, defaultQty);
              selectedCount += 1;
            });
          }
        });

        const ingredients = ingredientsRaw
          .map((ing) => {
            const ingredientId = Number(ing?.ingredient_id || ing?.id || 0);
            if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
            const quantity = Number(ing?.quantity ?? ing?.qty ?? 0);
            if (!(quantity > 0)) return null;
            return {
              ingredient_id: ingredientId,
              ingredient_name: str(ing?.ingredient_name || ing?.name || ''),
              name: str(ing?.name || ing?.ingredient_name || ''),
              quantity,
              qty: quantity,
              unit_id: toNum(ing?.unit_id, null),
              unit_label: str(ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ing?.unit || ''),
              unit: str(ing?.unit || ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ''),
            };
          })
          .filter(Boolean);

        result[pid] = {
          option_item_ids: selectedOptionItems.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0),
          option_items: selectedOptionItems,
          ingredients,
          ingredient_price_diff: 0,
          variant_group_id: variantGroupId,
          variant_value_index: variantValueIndex,
          variant_label: variantLabel,
          variant_unit_price: Number(variantUnitPrice || 0),
        };
      }

      res.json({ ok: true, data: result });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const cacheKey = makePublicCacheKey('product-option-assignments', { tenantId, storeId, productId });
      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productOptionAssignments,
        async () => {
          const [productCheck] = await db.query(
            `SELECT id FROM prod_products
             WHERE tenant_id=? AND id=? AND is_active=1 AND site_visibility=1
             LIMIT 1`,
            [tenantId, productId]
          );
          if (!productCheck.length) {
            const err = new Error('NOT_FOUND');
            err.httpStatus = 404;
            throw err;
          }

          const [rows] = await db.query(
            `SELECT
               a.id AS assignment_id,
               a.group_id,
               a.priority,
               a.sort_order,
               a.is_active,
               a.selection_type AS assignment_selection_type,
               a.min_select AS assignment_min_select,
               a.max_select AS assignment_max_select,
               g.title,
               g.selection_type AS group_selection_type,
               g.min_select AS group_min_select,
               g.max_select AS group_max_select,
               g.is_required,
               g.out_of_stock_action
             FROM prod_option_assignments a
             JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
             WHERE a.tenant_id=?
               AND a.assign_type='product'
               AND a.assign_id=?
               AND a.is_active=1
               AND g.is_active=1
             ORDER BY a.sort_order ASC, a.id ASC`,
            [tenantId, productId]
          );

          const assignments = rows.map((r) => ({
            assignment_id: Number(r.assignment_id),
            group_id: Number(r.group_id),
            title: str(r.title || ''),
            selection_type: r.assignment_selection_type || r.group_selection_type || 'single',
            min_select: r.assignment_min_select ?? r.group_min_select ?? 0,
            max_select: r.assignment_max_select ?? r.group_max_select ?? null,
            is_required: Number(r.is_required ?? 0) === 1,
            is_active: Number(r.is_active || 0) === 1,
            out_of_stock_action: r.out_of_stock_action == null ? 1 : Number(r.out_of_stock_action),
            priority: Number(r.priority || 0),
            sort_order: Number(r.sort_order || 0),
          }));

          return { ok: true, data: assignments };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      if (e?.httpStatus === 404 || e?.message === 'NOT_FOUND') {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });
  router.get('/options/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const cacheKey = makePublicCacheKey('option-group-by-id', { tenantId, storeId, id });
      const cached = getPublicCache(cacheKey);
      if (cached) {
        res.set('x-public-cache', 'HIT');
        return res.json(cached);
      }

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С–РЎР‚РЎС“Р С—Р С—РЎС“ Р С•Р С—РЎвЂ Р С‘Р в„–
      let group;
      try {
        const [rows] = await db.query(
          `SELECT * FROM prod_option_groups 
           WHERE tenant_id=? AND id=? AND is_active=1 
           LIMIT 1`,
          [tenantId, id]
        );
        group = rows[0] || null;
      } catch (dbError) {
        console.error('DB query error in /options/groups/:id:', dbError);
        if (dbError.code === 'ETIMEDOUT' || dbError.code === 'ECONNREFUSED') {
          return res.status(503).json({ ok: false, error: 'DB_CONNECTION_ERROR', message: '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u0442\u044c\u0441\u044f \u043a \u0431\u0430\u0437\u0435 \u0434\u0430\u043d\u043d\u044b\u0445' });
        }
        throw dbError;
      }
      
      if (!group) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљРЎвЂ№ Р С•Р С—РЎвЂ Р С‘Р С‘ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ РЎвЂљР С•Р Р†Р В°РЎР‚РЎвЂ№)
      const [items] = await db.query(
        `SELECT 
           i.id,
           i.group_id,
           i.target_product_id,
           i.target_type,
           i.price_mode,
           i.price_value,
           i.qty_min,
           i.qty_max,
           i.is_active,
           i.sort_order,
           p.name AS product_name,
           p.price AS product_price,
           p.photos_json AS product_photos_json
         FROM prod_option_items i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
         LEFT JOIN prod_product_stocks ps
           ON ps.tenant_id = p.tenant_id AND ps.store_id = ? AND ps.product_id = p.id
         WHERE i.tenant_id=? 
           AND i.group_id=? 
           AND i.target_type='product'
           AND i.is_active=1
           AND p.is_active=1
           AND p.site_visibility=1
           AND (ps.qty IS NULL OR ps.qty > 0)
           AND NOT EXISTS (
             SELECT 1
             FROM prod_product_ingredients pi
             JOIN prod_product_stocks psi
               ON psi.tenant_id=pi.tenant_id AND psi.store_id=? AND psi.product_id=pi.ingredient_id
             WHERE pi.tenant_id=p.tenant_id AND pi.product_id=p.id
               AND psi.qty IS NOT NULL AND psi.qty <= 0
           )
           AND NOT EXISTS (
             SELECT 1
             FROM prod_option_assignments oa
             JOIN prod_option_groups og
               ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
             WHERE oa.tenant_id=p.tenant_id
               AND oa.assign_type='product' AND oa.assign_id=p.id
               AND oa.is_active=1
               AND og.is_active=1
               AND COALESCE(og.out_of_stock_action, 1)=0
               AND NOT EXISTS (
                 SELECT 1
                 FROM prod_option_items oi
                 JOIN prod_products op
                   ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                 LEFT JOIN prod_product_stocks ops
                   ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                 WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                   AND oi.target_type='product'
                   AND oi.is_active=1
                   AND op.is_active=1
                   AND op.site_visibility=1
                   AND (ops.qty IS NULL OR ops.qty > 0)
                   AND NOT EXISTS (
                     SELECT 1
                     FROM prod_product_ingredients ip
                     JOIN prod_product_stocks ips
                       ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                     WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                       AND ips.qty IS NOT NULL AND ips.qty <= 0
                   )
               )
           )
         ORDER BY i.sort_order ASC, i.id ASC`,
        [storeId, tenantId, id, storeId, storeId, storeId]
      );

      // Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµР С Р Р†РЎРѓР Вµ product_id Р Т‘Р В»РЎРЏ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р†
      const productIds = items.map(item => Number(item.target_product_id)).filter(Number.isFinite);
      
      // Р вЂ”Р В°Р С–РЎР‚РЎС“Р В¶Р В°Р ВµР С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ Р Т‘Р В»РЎРЏ Р Р†РЎРѓР ВµРЎвЂ¦ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†-Р С•Р С—РЎвЂ Р С‘Р в„– Р С•Р Т‘Р Р…Р С‘Р С Р В·Р В°Р С—РЎР‚Р С•РЎРѓР С•Р С
      let variantsByProductId = new Map();
      let tiersByGroupId = new Map();
      if (productIds.length > 0) {
        const [variantAssignments] = await db.query(
          `SELECT 
             va.product_id,
             vg.id AS variant_group_id,
             vg.title AS variant_title,
             vg.unit_id,
             vg.values AS variant_values,
             vg.default_value_index AS group_default_value_index,
             va.default_value_index AS assignment_default_value_index,
             u.code AS unit_code,
             u.title AS unit_title,
             u.short_title AS unit_short_title,
             va.sort_order
           FROM prod_variant_assignments va
           JOIN prod_variant_groups vg ON vg.id = va.variant_group_id
           LEFT JOIN prod_units u ON u.id = vg.unit_id
           WHERE va.tenant_id = ? 
             AND va.product_id IN (${productIds.map(() => '?').join(',')})
             AND va.is_active = 1 AND vg.is_active = 1
           ORDER BY va.product_id, va.sort_order ASC`,
          [tenantId, ...productIds]
        );

        // Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµР С Р Р†РЎРѓР Вµ id Р С–РЎР‚РЎС“Р С—Р С— Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р†, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р С—Р С•Р Т‘РЎвЂљРЎРЏР Р…РЎС“РЎвЂљРЎРЉ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘/Р Р…Р В°Р Т‘Р В±Р В°Р Р†Р С”Р С‘
        const variantGroupIds = Array.from(
          new Set(variantAssignments.map((va) => Number(va.variant_group_id)).filter(Number.isFinite))
        );
        if (variantGroupIds.length > 0) {
          const [tiers] = await db.query(
            `SELECT variant_group_id, min_quantity, discount_percent, sort_order
             FROM prod_variant_discount_tiers
             WHERE tenant_id=? AND variant_group_id IN (${variantGroupIds.map(() => '?').join(',')})
             ORDER BY variant_group_id ASC, sort_order ASC, min_quantity ASC`,
            [tenantId, ...variantGroupIds]
          );
          for (const t of tiers) {
            const gid = Number(t.variant_group_id);
            if (!tiersByGroupId.has(gid)) tiersByGroupId.set(gid, []);
            tiersByGroupId.get(gid).push({
              min_quantity: t.min_quantity,
              discount_percent: t.discount_percent,
              sort_order: t.sort_order,
            });
          }
        }
        
        // Р вЂњРЎР‚РЎС“Р С—Р С—Р С‘РЎР‚РЎС“Р ВµР С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ Р С—Р С• product_id
        for (const va of variantAssignments) {
          const pid = Number(va.product_id);
          if (!variantsByProductId.has(pid)) {
            variantsByProductId.set(pid, []);
          }
          const groupDefaultIdx = va.group_default_value_index != null ? Number(va.group_default_value_index) : null;
          const assignmentDefaultIdx = va.assignment_default_value_index != null ? Number(va.assignment_default_value_index) : null;
          // Р С›Р С—РЎР‚Р ВµР Т‘Р ВµР В»РЎРЏР ВµР С Р Т‘Р ВµРЎвЂћР С•Р В»РЎвЂљР Р…РЎвЂ№Р в„– Р С‘Р Р…Р Т‘Р ВµР С”РЎРѓ: РЎРѓР Р…Р В°РЎвЂЎР В°Р В»Р В° Р С‘Р В· Р С—РЎР‚Р С‘Р Р†РЎРЏР В·Р С”Р С‘, Р С—Р С•РЎвЂљР С•Р С Р С‘Р В· Р С–РЎР‚РЎС“Р С—Р С—РЎвЂ№
          const defaultIdx = assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx;
          const groupId = Number(va.variant_group_id);
          variantsByProductId.get(pid).push({
            variant_group_id: groupId,
            title: str(va.variant_title || ""),
            unit_id: va.unit_id ? Number(va.unit_id) : null,
            unit_code: str(va.unit_code || ""),
            unit_title: str(va.unit_title || ""),
            unit_short_title: str(va.unit_short_title || ""),
            values: safeJsonArray(va.variant_values),
            default_value_index: defaultIdx,
            discount_tiers: tiersByGroupId.get(groupId) || [],
          });
        }
      }

      // Р СњР С•РЎР‚Р СР В°Р В»Р С‘Р В·РЎС“Р ВµР С РЎРЊР В»Р ВµР СР ВµР Р…РЎвЂљРЎвЂ№
      const normalizedItems = items.map((item) => {
        const photos = safeJsonArray(item.product_photos_json);
        const productId = Number(item.target_product_id);
        const variants = variantsByProductId.get(productId) || [];
        
        return {
          id: Number(item.id),
          target_product_id: productId,
          name: str(item.product_name || ""),
          product_name: str(item.product_name || ""),
          product_price: Number(item.product_price || 0),
          product_photos_json: photos,
          price_mode: item.price_mode || "from_target",
          price_value: Number(item.price_value || 0),
          qty_min: Number(item.qty_min ?? 1),
          qty_max: Number(item.qty_max ?? 1),
          is_active: Number(item.is_active || 0) === 1,
          sort_order: Number(item.sort_order || 0),
          // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ РЎвЂљР С•Р Р†Р В°РЎР‚Р В°-Р С•Р С—РЎвЂ Р С‘Р С‘
          variants: variants,
        };
      });

      const payload = {
        ok: true,
        data: {
          group: {
            id: Number(group.id),
            title: str(group.title || ""),
            selection_type: group.selection_type || "single",
            min_select: group.min_select ?? 0,
            max_select: group.max_select ?? null,
            is_required: Number(group.is_required ?? 0) === 1,
            allow_variants: Number(group.allow_variants ?? 0) === 1,
            is_active: Number(group.is_active || 0) === 1,
          },
          items: normalizedItems,
        },
      };
      setPublicCache(cacheKey, payload, PUBLIC_CACHE_TTL_MS.optionGroupById);
      res.set('x-public-cache', 'MISS');
      res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/products/:id/variants', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const cacheKey = makePublicCacheKey('product-variants', { tenantId, storeId, productId });
      const { payload, cacheState } = await loadPublicCachedPayload(
        cacheKey,
        PUBLIC_CACHE_TTL_MS.productVariants,
        async () => {
          const [variants] = await db.query(
            `SELECT
               vg.id,
               vg.title,
               vg.unit_id,
               vg.values,
               vg.is_active,
               vg.sort_order,
               vg.default_value_index AS group_default_value_index,
               va.default_value_index AS assignment_default_value_index,
               u.code AS unit_code,
               u.title AS unit_title,
               u.short_title AS unit_short_title,
               va.sort_order AS assignment_sort_order
             FROM prod_variant_assignments va
             JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
             LEFT JOIN prod_units u ON u.id=vg.unit_id
             WHERE va.tenant_id=? AND va.product_id=?
               AND va.is_active=1 AND vg.is_active=1
             ORDER BY va.sort_order ASC, vg.sort_order ASC`,
            [tenantId, productId]
          );

          for (const v of variants) {
            v.values = safeJsonArray(v.values);
            const groupDefaultIdx = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
            const assignmentDefaultIdx = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
            v.default_value_index = assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx;
            const [tiers] = await db.query(
              `SELECT min_quantity, discount_percent, sort_order
               FROM prod_variant_discount_tiers
               WHERE tenant_id=? AND variant_group_id=?
               ORDER BY sort_order ASC, min_quantity ASC`,
              [tenantId, v.id]
            );
            v.discount_tiers = tiers;
          }

          return { ok: true, data: variants };
        }
      );

      res.set('x-public-cache', cacheState);
      return res.json(payload);
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });
  function parseDeliveryTimeMinutes(value) {
    if (!value) return null;
    const [hours, mins] = String(value).split(":");
    const h = Number(hours);
    const m = Number(mins);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Math.max(0, Math.min(24 * 60, h * 60 + m));
  }

  function getStoreLocalTimestamp(offsetValue) {
    const offsetHours = Number.isNaN(Number(offsetValue)) ? 0 : Number(offsetValue);
    const offsetMinutes = Math.round(offsetHours * 60);
    return Date.now() + offsetMinutes * 60 * 1000;
  }

  function isStoreDeliveryOpenNow(hours, timezoneOffset) {
    if (!Array.isArray(hours) || !hours.length) return false;
    if (!timezoneOffset && timezoneOffset !== 0) timezoneOffset = "+0";
    const ts = getStoreLocalTimestamp(timezoneOffset);
    const local = new Date(ts);
    const day = local.getUTCDay();
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const entry = hours.find((row) => Number(row.day_of_week) === day);
    if (!entry) return false;
    if (Number(entry.is_closed) === 1) return false;
    const opens = parseDeliveryTimeMinutes(entry.opens_at);
    const closes = parseDeliveryTimeMinutes(entry.closes_at);
    if (opens === null || closes === null) return false;
    return minutes >= opens && minutes < closes;
  }

  /**
   * Check if store is currently open (based on regular hours, not delivery hours)
   */
  function isStoreOpenNow(hours, timezoneOffset) {
    if (!Array.isArray(hours) || !hours.length) return false;
    if (!timezoneOffset && timezoneOffset !== 0) timezoneOffset = "+0";
    const ts = getStoreLocalTimestamp(timezoneOffset);
    const local = new Date(ts);
    const day = local.getUTCDay();
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const entry = hours.find((row) => Number(row.day_of_week) === day);
    if (!entry) return false;
    if (Number(entry.is_closed) === 1) return false;
    const opens = parseDeliveryTimeMinutes(entry.opens_at);
    const closes = parseDeliveryTimeMinutes(entry.closes_at);
    if (opens === null || closes === null) return false;
    return minutes >= opens && minutes < closes;
  }

  // ------------------------------
  // order-config (Р Т‘Р В»РЎРЏ Р С•РЎвЂћР С•РЎР‚Р СР В»Р ВµР Р…Р С‘РЎРЏ)
  // Р вЂ™Р С’Р вЂ“Р СњР С›: РЎвЂљР Р†Р С•Р в„– РЎвЂћРЎР‚Р С•Р Р…РЎвЂљ Р В¶Р Т‘РЎвЂРЎвЂљ methods / payments / timeOptions
  // ------------------------------
  router.get('/order-config', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      await ensureOrderDeliveryTypeColumns();

      const [statuses] = await db.query(
        `SELECT id, code, title, subtitle, icon, color, sort
         FROM order_statuses
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [payments] = await db.query(
        `SELECT id, code, title, icon, sort
         FROM order_payments
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      // Р СџР вЂўР В Р вЂўР ВР СљР вЂўР СњР С›Р вЂ™Р С’Р СњР С›: order_delivery_types (Р В±РЎвЂ№Р Р†РЎв‚¬Р В°РЎРЏ order_methods)
      const [methods] = await db.query(
        `SELECT id, code, title, icon, sort, is_default, require_client_data
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=? AND is_active=1 AND show_on_site=1
         ORDER BY is_default DESC, sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [timeOptions] = await db.query(
        `SELECT id, code, title, icon, description,
                has_time_window, starts_at, ends_at, step_minutes, lead_minutes, sort
         FROM order_time_options
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort ASC, id ASC`,
        [tenantId, storeId]
      );

      const [storeRows] = await db.query(
        'SELECT id, timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      const store = storeRows[0] || null;
      const storeTimezone = store?.timezone || "+0";

      const [storeHours] = await db.query(
        `SELECT day_of_week, opens_at, closes_at, is_closed
         FROM ten_store_hours
         WHERE tenant_id=? AND store_id=?
         ORDER BY day_of_week ASC`,
        [tenantId, storeId]
      );

      const [deliveryHours] = await db.query(
        `SELECT day_of_week, opens_at, closes_at, is_closed
         FROM ten_store_delivery_hours
         WHERE tenant_id=? AND store_id=?
         ORDER BY day_of_week ASC`,
        [tenantId, storeId]
      );

      const storeIsOpen = isStoreOpenNow(storeHours, storeTimezone);
      const deliveryIsOpen = isStoreDeliveryOpenNow(deliveryHours, storeTimezone);
      const tenantMapConfig = await getTenantMapConfig(db, tenantId);

      res.json({
        ok: true,
        data: {
          statuses,
          payments,
          methods,
          timeOptions,
          storeHours,
          storeDeliveryHours: deliveryHours,
          storeTimezone,
          storeIsOpen,
          deliveryIsOpen,
          storeAddressMapEnabled: isStoreAddressMapModeEnabled(tenantMapConfig),
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // pre-check cart stock availability (without deduction)
  // ------------------------------
  router.post('/orders/stock-check', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!items.length) {
        return res.json({
          ok: true,
          data: {
            available: true,
            shortages: [],
            stock_levels: [],
          },
        });
      }

      const checkResult = await checkStockAvailabilityForOrderItems({
        db,
        tenantId,
        storeId,
        items,
      });

      if (!checkResult.available) {
        return res.json({
          ok: true,
          data: {
            available: false,
            shortages: checkResult.shortages,
            stock_levels: Array.isArray(checkResult.stockLevels) ? checkResult.stockLevels : [],
          },
        });
      }

      return res.json({
        ok: true,
        data: {
          available: true,
          shortages: [],
          stock_levels: Array.isArray(checkResult.stockLevels) ? checkResult.stockLevels : [],
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function normalizeOrderPromoCode(value) {
    return str(value).replace(/\s+/g, '').toUpperCase();
  }

  function normalizeCheckoutPreviewItems(rawItems) {
    let items = rawItems;
    if (typeof items === 'string') {
      try {
        items = JSON.parse(items);
      } catch {
        items = [];
      }
    }

    const normalizedItems = [];
    const productIds = new Set();
    let subtotalBeforeDiscount = 0;
    let itemsBaseTotal = 0;

    for (const rawItem of Array.isArray(items) ? items : []) {
      if (!rawItem || typeof rawItem !== 'object') continue;

      const type = publicDiscountText(
        rawItem?.type || (Number(rawItem?.combo_id || rawItem?.combo?.id || 0) > 0 ? 'combo' : 'product')
      ).toLowerCase() || 'product';
      const qtyRaw = Number(rawItem?.qty ?? rawItem?.quantity ?? 1);
      const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.max(1, Math.trunc(qtyRaw)) : 1;
      const lineTotalRaw = Number(
        rawItem?.line_total
        ?? rawItem?.total
        ?? rawItem?.total_price
        ?? ((Number(rawItem?.price ?? rawItem?.unit_price ?? 0) || 0) * qty)
      );
      const lineTotal = roundPromoMoney(Math.max(0, Number.isFinite(lineTotalRaw) ? lineTotalRaw : 0));
      const originalLineTotalRaw = Number(
        rawItem?.original_line_total
        ?? rawItem?.old_line_total
        ?? rawItem?.discount?.original_line_total
        ?? lineTotal
      );
      const originalLineTotal = roundPromoMoney(
        Math.max(lineTotal, Number.isFinite(originalLineTotalRaw) ? originalLineTotalRaw : lineTotal)
      );

      if (type === 'combo') {
        const comboId = Number(rawItem?.combo_id || rawItem?.combo?.id || 0) || null;
        if (!comboId) continue;
        const item = {
          type: 'combo',
          combo_id: comboId,
          qty,
          line_total: lineTotal,
          combo_title: publicDiscountText(rawItem?.combo_title || rawItem?.name) || null,
          auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
        };
        if (originalLineTotal > lineTotal) {
          item.discount = { original_line_total: originalLineTotal };
        }
        normalizedItems.push(item);
        subtotalBeforeDiscount += originalLineTotal;
        itemsBaseTotal += lineTotal;
        continue;
      }

      const productId = Number(rawItem?.product_id || rawItem?.id || rawItem?.product?.id || 0) || null;
      if (!productId) continue;
      productIds.add(productId);

      const item = {
        type: 'product',
        product_id: productId,
        qty,
        line_total: lineTotal,
        auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
        variant_group_id: toPositiveIntOrNull(rawItem?.variant_group_id),
        variant_value_index: toNonNegativeIntOrNull(rawItem?.variant_value_index),
        option_items: (Array.isArray(rawItem?.option_items) ? rawItem.option_items : (Array.isArray(rawItem?.options) ? rawItem.options : []))
          .map((option) => ({
            id: toPositiveIntOrNull(option?.id || option?.option_item_id),
            qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
            target_product_id: toPositiveIntOrNull(option?.target_product_id || option?.product_id),
            variant_group_id: toPositiveIntOrNull(option?.variant_group_id),
            variant_value_index: toNonNegativeIntOrNull(option?.variant_value_index),
          }))
          .filter((option) => option.id),
        ingredients: (Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [])
          .map((ingredient) => ({
            ingredient_id: toPositiveIntOrNull(ingredient?.ingredient_id || ingredient?.product_id),
            qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0),
          }))
          .filter((ingredient) => ingredient.ingredient_id),
      };
      item.product_config = normalizePublicProductConfigPayload(item, productId);
      if (originalLineTotal > lineTotal) {
        item.discount = { original_line_total: originalLineTotal };
      }
      normalizedItems.push(item);
      subtotalBeforeDiscount += originalLineTotal;
      itemsBaseTotal += lineTotal;
    }

    return {
      items: normalizedItems,
      productIds: [...productIds],
      subtotalBeforeDiscount: roundPromoMoney(subtotalBeforeDiscount),
      itemsBaseTotal: roundPromoMoney(itemsBaseTotal),
    };
  }

  function normalizeCheckoutDiscountSource(value) {
    const raw = publicDiscountText(value).toLowerCase();
    return ['discount', 'reward_discount'].includes(raw) ? raw : null;
  }

  function normalizeCheckoutPromoSource(value) {
    const raw = publicDiscountText(value).toLowerCase();
    return ['promo_code', 'reward_promo'].includes(raw) ? raw : null;
  }

  function isPromoRewardRedeemAction(discount) {
    const config = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const reward = parsePublicDiscountObject(config?.promo_reward, {});
    const explicitMode = publicDiscountText(
      reward?.action_mode ?? reward?.issue_mode ?? reward?.runtime_mode
    ).toLowerCase();
    if (['redeem', 'redeem_reward'].includes(explicitMode)) return true;
    const runtime = getPromoRuntimeConfig(discount);
    return runtime.rewardType === 'product';
  }

  function buildRuntimeDiscountRewardPayload({
    title,
    description,
    discountType,
    discountValue,
    applyTo,
    maxDiscountAmount = null,
    minOrderAmount = null,
    isStackable = false,
    targetRows = [],
    productsMap = new Map(),
    configMode = 'any',
    extra = {},
  }) {
    return {
      title: publicDiscountText(title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      description: publicDiscountText(description),
      discount_type: publicDiscountText(discountType || 'percent').toLowerCase() || 'percent',
      discount_value: Number(discountValue || 0),
      apply_to: publicDiscountText(applyTo || 'order').toLowerCase() || 'order',
      max_discount_amount: maxDiscountAmount != null ? Number(maxDiscountAmount || 0) : null,
      min_order_amount: minOrderAmount != null ? Number(minOrderAmount || 0) : null,
      is_stackable: Number(isStackable || 0) === 1 || isStackable === true,
      targets: buildRewardTargetPayload(targetRows, configMode),
      products: buildRewardProductsPayload(targetRows, productsMap, configMode),
      ...extra,
    };
  }

  function buildRuntimeGiftRewardPayload({
    title,
    description,
    targetRows = [],
    productsMap = new Map(),
    configMode = 'any',
    extra = {},
  }) {
    const products = buildRewardProductsPayload(targetRows, productsMap, configMode);
    return {
      title: publicDiscountText(title) || '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      description: publicDiscountText(description),
      badge_text: '\u041f\u043e\u0434\u0430\u0440\u043e\u043a',
      total_value: roundPromoMoney(products.reduce((sum, product) => sum + Number(product?.price || 0), 0)),
      products,
      targets: buildRewardTargetPayload(targetRows, configMode),
      ...extra,
    };
  }

  function buildRuntimePromoRewardPayload({
    title,
    description,
    code,
    statusText = '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
    badgeText = '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
    applyScopeText = '',
    isStackable = false,
    expiresAt = null,
    runtimeConfig = {},
    targetRows = [],
    productsMap = new Map(),
    configMode = 'any',
    extra = {},
  }) {
    return {
      title: publicDiscountText(title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
      description: publicDiscountText(description),
      code: publicDiscountText(code),
      badge_text: publicDiscountText(badgeText) || '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
      status_text: publicDiscountText(statusText) || '\u041d\u0430\u0433\u0440\u0430\u0434\u0430',
      apply_scope_text: publicDiscountText(applyScopeText),
      expires_at: expiresAt || null,
      is_stackable: Number(isStackable || 0) === 1 || isStackable === true,
      promo_reward_type: publicDiscountText(runtimeConfig?.rewardType || 'discount').toLowerCase() || 'discount',
      product_reward_type: publicDiscountText(runtimeConfig?.productRewardType || 'gift').toLowerCase() || 'gift',
      discount_type: publicDiscountText(runtimeConfig?.discountType || 'percent').toLowerCase() || 'percent',
      discount_value: Number(runtimeConfig?.discountValue || 0),
      apply_to: publicDiscountText(runtimeConfig?.applyTo || 'order').toLowerCase() || 'order',
      max_discount_amount: runtimeConfig?.maxDiscountAmount != null ? Number(runtimeConfig.maxDiscountAmount || 0) : null,
      min_order_amount: runtimeConfig?.minOrderAmount != null ? Number(runtimeConfig.minOrderAmount || 0) : null,
      targets: buildRewardTargetPayload(targetRows, configMode),
      products: buildRewardProductsPayload(targetRows, productsMap, configMode),
      ...extra,
    };
  }

  function getPromoRuntimeConfig(discount) {
    const config = parsePublicDiscountObject(discount?.mechanic_config_json, {});
    const reward = parsePublicDiscountObject(config?.promo_reward, {});
    const rewardKind = publicDiscountText(reward?.reward_kind).toLowerCase();
    const rewardType = publicDiscountText(
      reward?.reward_type ?? (['gift', 'product_discount'].includes(rewardKind) ? 'product' : 'discount')
    ).toLowerCase() === 'product'
      ? 'product'
      : 'discount';
    const productRewardType = ['gift', 'product_discount'].includes(publicDiscountText(reward?.product_reward_type ?? rewardKind).toLowerCase())
      ? publicDiscountText(reward?.product_reward_type ?? rewardKind).toLowerCase()
      : 'gift';

    return {
      rewardType,
      productRewardType,
      applyTo: publicDiscountText(reward?.apply_to ?? discount?.apply_to).toLowerCase() || 'order',
      discountType: publicDiscountText(reward?.discount_type ?? discount?.discount_type).toLowerCase() || 'percent',
      discountValue: Number(reward?.discount_value ?? discount?.discount_value ?? 0),
    };
  }

  function buildDiscountProductTargetSets(rows) {
    return buildGenericDiscountTargetSets(rows);
  }

  function roundPromoMoney(value) {
    return Math.round(Number(value || 0) * 100) / 100;
  }


  function mergeItemDiscountMeta(item, title, amount, originalLineTotal) {
    const discountAmount = Number(amount || 0);
    if (!(discountAmount > 0) || !item) return;

    if (item.discount) {
      item.discount.amount = roundPromoMoney(Number(item.discount.amount || 0) + discountAmount);
      return;
    }

    item.discount = {
      id: null,
      title: title || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
      amount: roundPromoMoney(discountAmount),
      original_line_total: roundPromoMoney(originalLineTotal),
    };
  }

  function buildPromoUsageRecord(discount, promoRow, discountAmount, extra = {}) {
    return {
      discount_id: Number(discount?.discount_id || discount?.id || 0),
      promo_code_id: Number(promoRow?.promo_code_id || 0) || null,
      title: publicDiscountText(discount?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
      discount_type: extra.discount_type || null,
      discount_value: extra.discount_value ?? null,
      discount_amount: roundPromoMoney(Number(discountAmount || 0)),
      apply_to: extra.apply_to || 'promo_code',
      product_id: extra.product_id || null,
    };
  }

  function buildDiscountUsageRecord(discount, discountAmount, extra = {}) {
    return {
      discount_id: Number(discount?.discount_id || discount?.id || 0),
      promo_code_id: null,
      title: publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
      discount_type: extra.discount_type || publicDiscountText(discount?.discount_type).toLowerCase() || null,
      discount_value: extra.discount_value ?? Number(discount?.discount_value ?? 0),
      discount_amount: roundPromoMoney(Number(discountAmount || 0)),
      apply_to: extra.apply_to || publicDiscountText(discount?.apply_to).toLowerCase() || 'discount',
      product_id: extra.product_id || null,
    };
  }

  function cloneCheckoutBenefitItems(items) {
    return (Array.isArray(items) ? items : []).map((item) => {
      const next = item && typeof item === 'object' ? { ...item } : {};
      if (next.discount && typeof next.discount === 'object') {
        next.discount = { ...next.discount };
      }
      return next;
    });
  }

  function isCheckoutBenefitStackable(entry) {
    return Number(entry?.is_stackable || 0) === 1 || entry?.is_stackable === true;
  }

  function canCombineCheckoutBenefits(discount, promo) {
    if (!discount || !promo) return true;
    return isCheckoutBenefitStackable(discount) && isCheckoutBenefitStackable(promo);
  }


  function buildDiscountPreviewDisabledReason(errorCode) {
    switch (publicDiscountText(errorCode).toUpperCase()) {
      case 'DISCOUNT_CUSTOMER_LIMIT_REACHED':
        return '\u0412\u044b \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043b\u0438 \u044d\u0442\u0443 \u0441\u043a\u0438\u0434\u043a\u0443 \u043c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u0440\u0430\u0437.';
      case 'DISCOUNT_NOT_APPLICABLE':
        return '\u041d\u0435 \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442 \u043a \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0437\u0430\u043a\u0430\u0437\u0443.';
      case 'DISCOUNT_NOT_AVAILABLE':
        return '\u0421\u0435\u0439\u0447\u0430\u0441 \u044d\u0442\u0430 \u0441\u043a\u0438\u0434\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0430.';
      case 'DISCOUNT_INVALID':
      default:
        return '\u0421\u043a\u0438\u0434\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430.';
    }
  }

  function getRewardPromoRuntimeConfig(payload) {
    return {
      rewardType: publicDiscountText(payload?.promo_reward_type || 'discount').toLowerCase() || 'discount',
      productRewardType: publicDiscountText(payload?.product_reward_type || 'gift').toLowerCase() || 'gift',
      applyTo: publicDiscountText(payload?.apply_to || 'order').toLowerCase() || 'order',
      discountType: publicDiscountText(payload?.discount_type || 'percent').toLowerCase() || 'percent',
      discountValue: Number(payload?.discount_value || 0),
      maxDiscountAmount: payload?.max_discount_amount != null ? Number(payload.max_discount_amount || 0) : null,
      minOrderAmount: payload?.min_order_amount != null ? Number(payload.min_order_amount || 0) : null,
    };
  }

  function computeCheckoutPromoPreviewEffect({
    runtimeConfig,
    targetSets,
    sourceItems,
    sourceItemsTotal = null,
    productCategoriesMap,
  }) {
    const previewItems = cloneCheckoutBenefitItems(sourceItems);
    const itemsTotalBeforePromo = sourceItemsTotal != null
      ? roundPromoMoney(Number(sourceItemsTotal || 0))
      : roundPromoMoney(previewItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
    const rewardType = publicDiscountText(runtimeConfig?.rewardType || 'discount').toLowerCase() || 'discount';
    const productRewardType = publicDiscountText(runtimeConfig?.productRewardType || 'gift').toLowerCase() || 'gift';
    const applyTo = publicDiscountText(runtimeConfig?.applyTo || 'order').toLowerCase() || 'order';
    const discountType = publicDiscountText(runtimeConfig?.discountType || 'percent').toLowerCase() || 'percent';
    const discountValue = Number(runtimeConfig?.discountValue || 0);
    const maxDiscountAmount = runtimeConfig?.maxDiscountAmount != null
      ? Number(runtimeConfig.maxDiscountAmount || 0)
      : null;
    const minOrderAmount = runtimeConfig?.minOrderAmount != null
      ? Number(runtimeConfig.minOrderAmount || 0)
      : null;
    const resolvedTargets = targetSets || { productIds: new Set(), categoryIds: new Set(), comboIds: new Set() };

    if (minOrderAmount > 0 && itemsTotalBeforePromo < minOrderAmount) {
      return buildPromoNotApplicablePreviewOutcome(
        previewItems,
        itemsTotalBeforePromo,
        buildPromoMinAmountDisabledReason(minOrderAmount, itemsTotalBeforePromo)
      );
    }

    if (rewardType === 'discount') {
      if (applyTo === 'order') {
        const promoOrderDiscount = discountHelpers.calculateDiscount(
          itemsTotalBeforePromo,
          discountType,
          discountValue,
          maxDiscountAmount
        );
        if (!(promoOrderDiscount > 0)) {
          return buildPromoNotApplicablePreviewOutcome(previewItems, itemsTotalBeforePromo);
        }

        return {
          isApplicable: true,
          disabledReason: '',
          discountAmount: roundPromoMoney(promoOrderDiscount),
          itemsTotalAfterPromo: roundPromoMoney(Math.max(0, itemsTotalBeforePromo - promoOrderDiscount)),
          items: previewItems,
        };
      }

      let promoItemsDiscount = 0;
      for (const item of previewItems) {
        const matchesScope = matchDiscountTargetScope(resolvedTargets, item, productCategoriesMap, applyTo);
        if (!matchesScope) continue;

        const promoItemDiscount = discountHelpers.calculateDiscount(
          Number(item.line_total || 0),
          discountType,
          discountValue,
          maxDiscountAmount
        );
        if (!(promoItemDiscount > 0)) continue;

        item.line_total = roundPromoMoney(Math.max(0, Number(item.line_total || 0) - promoItemDiscount));
        promoItemsDiscount += promoItemDiscount;
      }

      if (!(promoItemsDiscount > 0)) {
        return buildPromoNotApplicablePreviewOutcome(previewItems, itemsTotalBeforePromo);
      }

      return {
        isApplicable: true,
        disabledReason: '',
        discountAmount: roundPromoMoney(promoItemsDiscount),
        itemsTotalAfterPromo: roundPromoMoney(Math.max(0, itemsTotalBeforePromo - promoItemsDiscount)),
        items: previewItems,
      };
    }

    if (productRewardType === 'gift') {
      if (resolvedTargets.productIds.size < 1) {
        return buildPromoNotApplicablePreviewOutcome(previewItems, itemsTotalBeforePromo);
      }
      return {
        isApplicable: true,
        disabledReason: '',
        discountAmount: 0,
        itemsTotalAfterPromo: itemsTotalBeforePromo,
        items: previewItems,
      };
    }

    let rewardItemsDiscount = 0;
    for (const item of previewItems) {
      const matchesReward = matchDiscountTargetScope(resolvedTargets, item, productCategoriesMap, 'any');
      if (!matchesReward) continue;

      const rewardDiscount = discountHelpers.calculateDiscount(
        Number(item.line_total || 0),
        discountType,
        discountValue,
        maxDiscountAmount
      );
      if (!(rewardDiscount > 0)) continue;

      item.line_total = roundPromoMoney(Math.max(0, Number(item.line_total || 0) - rewardDiscount));
      rewardItemsDiscount += rewardDiscount;
    }

    if (!(rewardItemsDiscount > 0)) {
      return buildPromoNotApplicablePreviewOutcome(previewItems, itemsTotalBeforePromo);
    }

    return {
      isApplicable: true,
      disabledReason: '',
      discountAmount: roundPromoMoney(rewardItemsDiscount),
      itemsTotalAfterPromo: roundPromoMoney(Math.max(0, itemsTotalBeforePromo - rewardItemsDiscount)),
      items: previewItems,
    };
  }

  function resolveSelectedCheckoutDiscountEntry({
    selectedDiscountId,
    selectedDiscountSource,
    discountEntries,
    allDiscountRows,
  }) {
    const normalizedId = normalizeSelectedDiscountId(selectedDiscountId);
    if (normalizedId === null) {
      return { entry: null, errorCode: '' };
    }
    const source = normalizeCheckoutDiscountSource(selectedDiscountSource) || 'discount';
    const entry = (Array.isArray(discountEntries) ? discountEntries : []).find((item) => (
      publicDiscountText(item?.source).toLowerCase() === source
      && Number(item?.selectionId || 0) === normalizedId
    )) || null;
    if (entry) {
      return { entry, errorCode: '' };
    }
    if (source === 'discount') {
      const knownAutomaticDiscount = (Array.isArray(allDiscountRows) ? allDiscountRows : [])
        .find((discount) => Number(discount?.id || 0) === normalizedId && isPublicAutomaticSimpleDiscount(discount));
      return {
        entry: null,
        errorCode: knownAutomaticDiscount ? 'DISCOUNT_NOT_AVAILABLE' : 'DISCOUNT_INVALID',
      };
    }
    return { entry: null, errorCode: 'DISCOUNT_INVALID' };
  }

  function resolveSelectedCheckoutPromoEntry({
    promoCode,
    selectedPromoSource,
    selectedPromoRewardId,
    promoEntries,
  }) {
    const normalizedCode = normalizeOrderPromoCode(promoCode);
    if (!normalizedCode) {
      return { entry: null, errorCode: '' };
    }
    const source = normalizeCheckoutPromoSource(selectedPromoSource) || 'promo_code';
    const rewardId = Number(selectedPromoRewardId || 0) || null;
    const entry = (Array.isArray(promoEntries) ? promoEntries : []).find((item) => {
      const sameSource = publicDiscountText(item?.source).toLowerCase() === source;
      if (!sameSource) return false;
      if (source === 'reward_promo') {
        return Number(item?.rewardId || 0) === Number(rewardId || 0)
          && normalizeOrderPromoCode(item?.card?.code) === normalizedCode;
      }
      return normalizeOrderPromoCode(item?.card?.code) === normalizedCode;
    }) || null;
    if (entry && publicDiscountText(entry?.card?.action_mode).toLowerCase() === 'select') {
      return { entry, errorCode: '' };
    }
    return { entry: null, errorCode: 'PROMO_INVALID' };
  }

  function resolveSelectedCheckoutDiscount({ selectedDiscountId, availableDiscounts, allDiscountRows }) {
    const normalizedId = normalizeSelectedDiscountId(selectedDiscountId);
    if (normalizedId === null) {
      return { discount: null, errorCode: '' };
    }

    const availableDiscount = (Array.isArray(availableDiscounts) ? availableDiscounts : [])
      .find((discount) => Number(discount?.id || 0) === normalizedId) || null;
    if (availableDiscount) {
      return { discount: availableDiscount, errorCode: '' };
    }

    const knownAutomaticDiscount = (Array.isArray(allDiscountRows) ? allDiscountRows : [])
      .find((discount) => Number(discount?.id || 0) === normalizedId && isPublicAutomaticSimpleDiscount(discount));

    return {
      discount: null,
      errorCode: knownAutomaticDiscount ? 'DISCOUNT_NOT_AVAILABLE' : 'DISCOUNT_INVALID',
    };
  }

  function applySelectedDiscountToItems({
    discount,
    items,
    targetRows,
    productCategoriesMap,
    applyItemMeta = false,
    collectUsageRecords = false,
  }) {
    const nextItems = cloneCheckoutBenefitItems(items);
    const applyTo = publicDiscountText(discount?.apply_to).toLowerCase() || 'order';
    const maxDiscountAmount = discount?.max_discount_amount != null ? Number(discount.max_discount_amount) : null;
    const discountType = publicDiscountText(discount?.discount_type).toLowerCase() || 'percent';
    const discountValue = Number(discount?.discount_value || 0);
    const baseItemsTotal = roundPromoMoney(
      nextItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
    );

    if (applyTo === 'order') {
      const minOrderAmount = discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : 0;
      if (minOrderAmount > 0 && baseItemsTotal < minOrderAmount) {
        return {
          isApplicable: false,
          errorCode: 'DISCOUNT_NOT_APPLICABLE',
          discountAmount: 0,
          items: nextItems,
          itemsTotalAfterDiscount: baseItemsTotal,
          usageRecords: [],
        };
      }

      const orderDiscountAmount = discountHelpers.calculateDiscount(
        baseItemsTotal,
        discountType,
        discountValue,
        maxDiscountAmount
      );
      if (!(orderDiscountAmount > 0)) {
        return {
          isApplicable: false,
          errorCode: 'DISCOUNT_NOT_APPLICABLE',
          discountAmount: 0,
          items: nextItems,
          itemsTotalAfterDiscount: baseItemsTotal,
          usageRecords: [],
        };
      }

      return {
        isApplicable: true,
        errorCode: '',
        discountAmount: roundPromoMoney(orderDiscountAmount),
        items: nextItems,
        itemsTotalAfterDiscount: roundPromoMoney(Math.max(0, baseItemsTotal - orderDiscountAmount)),
        usageRecords: collectUsageRecords
          ? [buildDiscountUsageRecord(discount, orderDiscountAmount, { apply_to: 'order' })]
          : [],
      };
    }

    const targets = buildDiscountProductTargetSets(targetRows);
    let itemDiscountTotal = 0;
    const usageRecords = [];

    for (const item of nextItems) {
      const matches = matchDiscountTargetScope(targets, item, productCategoriesMap, applyTo === 'combo' ? 'combo' : applyTo || 'any');
      if (!matches) continue;

      const baseLineTotal = roundPromoMoney(Number(item?.line_total || 0));
      const lineDiscountAmount = discountHelpers.calculateDiscount(
        baseLineTotal,
        discountType,
        discountValue,
        maxDiscountAmount
      );
      if (!(lineDiscountAmount > 0)) continue;

      item.line_total = roundPromoMoney(Math.max(0, baseLineTotal - lineDiscountAmount));
      if (applyItemMeta) {
        mergeItemDiscountMeta(
          item,
          publicDiscountText(discount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
          lineDiscountAmount,
          item?.discount?.original_line_total || baseLineTotal
        );
      }

      itemDiscountTotal += lineDiscountAmount;
      if (collectUsageRecords) {
        usageRecords.push(buildDiscountUsageRecord(discount, lineDiscountAmount, {
          apply_to: applyTo,
          product_id: item?.type === 'product' ? Number(item?.product_id || 0) || null : null,
        }));
      }
    }

    if (!(itemDiscountTotal > 0)) {
      return {
        isApplicable: false,
        errorCode: 'DISCOUNT_NOT_APPLICABLE',
        discountAmount: 0,
        items: nextItems,
        itemsTotalAfterDiscount: baseItemsTotal,
        usageRecords,
      };
    }

    return {
      isApplicable: true,
      errorCode: '',
      discountAmount: roundPromoMoney(itemDiscountTotal),
      items: nextItems,
      itemsTotalAfterDiscount: roundPromoMoney(
        nextItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
      ),
      usageRecords,
    };
  }


  function addCheckoutPreviewBreakdownAmount(targetMap, key, title, amount) {
    const normalizedKey = publicDiscountText(key) || ('row_' + (targetMap.size + 1));
    const normalizedTitle = publicDiscountText(title) || '\u0421\u043a\u0438\u0434\u043a\u0430';
    const normalizedAmount = roundPromoMoney(Number(amount || 0));
    if (!(normalizedAmount > 0)) return;

    const current = targetMap.get(normalizedKey);
    if (current) {
      current.amount = roundPromoMoney(Number(current.amount || 0) + normalizedAmount);
      return;
    }

    targetMap.set(normalizedKey, {
      key: normalizedKey,
      title: normalizedTitle,
      amount: normalizedAmount,
    });
  }

  function buildCheckoutBenefitSelectionEntryKey(source, id) {
    const normalizedSource = publicDiscountText(source).toLowerCase();
    const normalizedId = Number(id || 0);
    if (!normalizedSource || !(normalizedId > 0)) return '';
    return `${normalizedSource}:${normalizedId}`;
  }

  function buildCheckoutBenefitSelectionStateKey(discountKey = '', promoKey = '') {
    const normalizedDiscountKey = publicDiscountText(discountKey);
    const normalizedPromoKey = publicDiscountText(promoKey);
    if (!normalizedDiscountKey && !normalizedPromoKey) return '__base__';
    if (normalizedDiscountKey && normalizedPromoKey) {
      return `${normalizedDiscountKey}|${normalizedPromoKey}`;
    }
    return normalizedDiscountKey || normalizedPromoKey || '__base__';
  }

  function cloneCheckoutPreviewBreakdownMap(sourceMap) {
    const result = new Map();
    if (!(sourceMap instanceof Map)) return result;
    for (const [key, entry] of sourceMap.entries()) {
      result.set(key, entry && typeof entry === 'object' ? { ...entry } : entry);
    }
    return result;
  }

  function resolveCheckoutPreviewDeliveryAmount(methodCode, itemsTotalAfterBenefits, deliveryRules = null) {
    if (publicDiscountText(methodCode).toLowerCase() !== 'delivery') return 0;
    const deliveryCost = Number(deliveryRules?.cost || 0);
    const freeFrom = deliveryRules?.freeFrom != null
      ? Number(deliveryRules.freeFrom)
      : null;
    if (freeFrom != null && Number(itemsTotalAfterBenefits || 0) >= freeFrom) return 0;
    return roundPromoMoney(deliveryCost);
  }

  function buildCheckoutPreviewSummarySnapshot({
    subtotalBeforeDiscount,
    itemsTotalAfterBenefits,
    methodCode,
    deliveryRules,
    breakdownMap,
  }) {
    const normalizedSubtotal = roundPromoMoney(Number(subtotalBeforeDiscount || 0));
    const normalizedItemsTotal = roundPromoMoney(Number(itemsTotalAfterBenefits || 0));
    const delivery = resolveCheckoutPreviewDeliveryAmount(
      methodCode,
      normalizedItemsTotal,
      deliveryRules
    );
    const discountBreakdown = [...(breakdownMap instanceof Map ? breakdownMap.values() : [])]
      .filter((entry) => Number(entry?.amount || 0) > 0)
      .map((entry) => ({
        key: publicDiscountText(entry?.key),
        title: publicDiscountText(entry?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
        amount: roundPromoMoney(Number(entry?.amount || 0)),
      }));
    const discountTotal = roundPromoMoney(
      Math.max(0, normalizedSubtotal - normalizedItemsTotal)
    );
    return {
      subtotal: normalizedSubtotal,
      items_total: normalizedItemsTotal,
      delivery: roundPromoMoney(delivery),
      discount_total: discountTotal,
      total: roundPromoMoney(normalizedItemsTotal + Number(delivery || 0)),
      discount_breakdown: discountBreakdown,
    };
  }

  function buildCheckoutBenefitsClientCalculationMatrix({
    subtotalBeforeDiscount,
    itemsBaseTotal,
    methodCode,
    deliveryRules,
    discountEntries,
    promoEntries,
    productCategoriesMap,
  }) {
    const summaryStates = {};
    const normalizedDiscountEntries = Array.isArray(discountEntries) ? discountEntries : [];
    const normalizedPromoEntries = Array.isArray(promoEntries) ? promoEntries : [];

    summaryStates.__base__ = buildCheckoutPreviewSummarySnapshot({
      subtotalBeforeDiscount,
      itemsTotalAfterBenefits: itemsBaseTotal,
      methodCode,
      deliveryRules,
      breakdownMap: new Map(),
    });

    normalizedPromoEntries.forEach((promoEntry) => {
      const promoKey = buildCheckoutBenefitSelectionEntryKey(
        promoEntry?.source,
        promoEntry?.source === 'reward_promo'
          ? promoEntry?.rewardId
          : promoEntry?.card?.id
      );
      if (!promoKey) return;
      const promoBreakdownMap = new Map();
      let promoItemsTotal = roundPromoMoney(Number(itemsBaseTotal || 0));
      if (promoEntry?.baseOutcome?.isApplicable) {
        promoItemsTotal = roundPromoMoney(Number(promoEntry.baseOutcome.itemsTotalAfterPromo || promoItemsTotal));
        addCheckoutPreviewBreakdownAmount(
          promoBreakdownMap,
          `promo_${Number(promoEntry?.rewardId || promoEntry?.card?.id || 0)}`,
          publicDiscountText(promoEntry?.card?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
          Number(promoEntry?.baseOutcome?.discountAmount || 0)
        );
      }
      summaryStates[buildCheckoutBenefitSelectionStateKey('', promoKey)] =
        buildCheckoutPreviewSummarySnapshot({
        subtotalBeforeDiscount,
        itemsTotalAfterBenefits: promoItemsTotal,
        methodCode,
        deliveryRules,
        breakdownMap: promoBreakdownMap,
      });
    });

    normalizedDiscountEntries.forEach((discountEntry) => {
      const discountKey = buildCheckoutBenefitSelectionEntryKey(
        discountEntry?.source,
        discountEntry?.selectionId
      );
      if (!discountKey) return;

      const discountBreakdownMap = new Map();
      let discountItemsTotal = roundPromoMoney(Number(itemsBaseTotal || 0));
      const discountOutcome = discountEntry?.outcome?.isApplicable ? discountEntry.outcome : null;
      if (discountOutcome) {
        discountItemsTotal = roundPromoMoney(Number(discountOutcome.itemsTotalAfterDiscount || discountItemsTotal));
        addCheckoutPreviewBreakdownAmount(
          discountBreakdownMap,
          `discount_${Number(discountEntry?.sourceDiscountId || discountEntry?.selectionId || 0)}`,
          publicDiscountText(discountEntry?.card?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
          Number(discountOutcome.discountAmount || 0)
        );
      }

      const discountSummary = buildCheckoutPreviewSummarySnapshot({
        subtotalBeforeDiscount,
        itemsTotalAfterBenefits: discountItemsTotal,
        methodCode,
        deliveryRules,
        breakdownMap: discountBreakdownMap,
      });
      summaryStates[buildCheckoutBenefitSelectionStateKey(discountKey, '')] = discountSummary;

      normalizedPromoEntries.forEach((promoEntry) => {
        const promoKey = buildCheckoutBenefitSelectionEntryKey(
          promoEntry?.source,
          promoEntry?.source === 'reward_promo'
            ? promoEntry?.rewardId
            : promoEntry?.card?.id
        );
        if (!promoKey) return;
        if (!canCombineCheckoutBenefits(discountEntry?.card, promoEntry?.card)) return;

        const pairBreakdownMap = cloneCheckoutPreviewBreakdownMap(discountBreakdownMap);
        let pairItemsTotal = discountItemsTotal;
        let pairPromoOutcome = null;
        if (discountOutcome) {
          pairPromoOutcome = computeCheckoutPromoPreviewEffect({
            runtimeConfig: promoEntry?.runtimeConfig,
            targetSets: promoEntry?.targetSets,
            sourceItems: discountOutcome.items,
            sourceItemsTotal: discountOutcome.itemsTotalAfterDiscount,
            productCategoriesMap,
          });
        } else {
          pairPromoOutcome = promoEntry?.baseOutcome || null;
        }

        if (pairPromoOutcome?.isApplicable) {
          pairItemsTotal = roundPromoMoney(Number(pairPromoOutcome.itemsTotalAfterPromo || pairItemsTotal));
          addCheckoutPreviewBreakdownAmount(
            pairBreakdownMap,
            `promo_${Number(promoEntry?.rewardId || promoEntry?.card?.id || 0)}`,
            publicDiscountText(promoEntry?.card?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
            Number(pairPromoOutcome.discountAmount || 0)
          );
        }

        summaryStates[buildCheckoutBenefitSelectionStateKey(discountKey, promoKey)] =
          buildCheckoutPreviewSummarySnapshot({
            subtotalBeforeDiscount,
            itemsTotalAfterBenefits: pairItemsTotal,
            methodCode,
            deliveryRules,
            breakdownMap: pairBreakdownMap,
          });
      });
    });

    return {
      version: 1,
      summary_states: summaryStates,
    };
  }


  const promoPreviewMoneyFormatter = new Intl.NumberFormat('ru-RU', {
    maximumFractionDigits: 2,
  });

  function formatPromoPreviewMoney(value) {
    const normalizedValue = roundPromoMoney(Number(value || 0));
    return `${promoPreviewMoneyFormatter.format(Number.isFinite(normalizedValue) ? normalizedValue : 0)} ₽`;
  }

  function buildPromoPreviewDisabledReason(errorCode) {
    switch (publicDiscountText(errorCode).toUpperCase()) {
      case 'PROMO_LIMIT_REACHED':
        return '\u041b\u0438\u043c\u0438\u0442 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434\u0430 \u0438\u0441\u0447\u0435\u0440\u043f\u0430\u043d.';
      case 'PROMO_CUSTOMER_LIMIT_REACHED':
        return '\u0412\u044b \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u043e\u0432\u0430\u043b\u0438 \u044d\u0442\u043e\u0442 \u043f\u0440\u043e\u043c\u043e\u043a\u043e\u0434 \u043c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u043e\u0435 \u0447\u0438\u0441\u043b\u043e \u0440\u0430\u0437.';
      case 'PROMO_NOT_APPLICABLE':
        return '\u041d\u0435 \u043f\u043e\u0434\u0445\u043e\u0434\u0438\u0442 \u043a \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0437\u0430\u043a\u0430\u0437\u0443.';
      case 'PROMO_NOT_AVAILABLE':
      default:
        return '\u0421\u0435\u0439\u0447\u0430\u0441 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u0435\u043d \u0434\u043b\u044f \u044d\u0442\u043e\u0433\u043e \u043a\u043b\u0438\u0435\u043d\u0442\u0430.';
    }
  }

  function buildPromoMinAmountDisabledReason(minOrderAmount, itemsTotalBeforePromo) {
    const remainingAmount = roundPromoMoney(Math.max(0, Number(minOrderAmount || 0) - Number(itemsTotalBeforePromo || 0)));
    if (!(remainingAmount > 0)) {
      return buildPromoPreviewDisabledReason('PROMO_NOT_APPLICABLE');
    }
    return `Нужно ещё ${formatPromoPreviewMoney(remainingAmount)} до применения.`;
  }

  function buildPromoNotApplicablePreviewOutcome(previewItems, itemsTotalBeforePromo, disabledReason = '') {
    return {
      isApplicable: false,
      disabledReasonCode: 'PROMO_NOT_APPLICABLE',
      disabledReason: publicDiscountText(disabledReason) || buildPromoPreviewDisabledReason('PROMO_NOT_APPLICABLE'),
      discountAmount: 0,
      itemsTotalAfterPromo: itemsTotalBeforePromo,
      items: previewItems,
    };
  }

  async function buildCheckoutBenefitsPreviewData({
    tenantId,
    storeId,
    customer,
    draft,
  }) {
    const customerId = Number(customer?.id || 0) || null;
    const normalizedDraft = draft && typeof draft === 'object' ? draft : {};
    const promoCode = normalizeOrderPromoCode(normalizedDraft?.promo_code);
    const selectedDiscountId = normalizeSelectedDiscountId(normalizedDraft?.selected_discount_id);
    const selectedDiscountSource = normalizeCheckoutDiscountSource(normalizedDraft?.selected_discount_source)
      || (selectedDiscountId !== null ? 'discount' : null);
    const selectedPromoSource = normalizeCheckoutPromoSource(normalizedDraft?.selected_promo_source)
      || (promoCode ? 'promo_code' : null);
    const selectedPromoRewardId = normalizeSelectedDiscountId(normalizedDraft?.selected_promo_reward_id);
    const methodCode = publicDiscountText(normalizedDraft?.method_code).toLowerCase() || 'takeaway';
    const {
      items: normalizedItems,
      productIds,
      subtotalBeforeDiscount,
      itemsBaseTotal,
    } = normalizeCheckoutPreviewItems(normalizedDraft?.items);

    const customerBenefitDiscountRows = customerId > 0
      ? await loadCustomerBenefitDiscountRows(tenantId, storeId, customerId)
      : [];
    const automaticDiscountRows = customerBenefitDiscountRows.filter((discount) => (
      isPublicAutomaticSimpleDiscount(discount) && !isHiddenBenefitsDiscount(discount)
    ));
    const automaticDiscountIds = automaticDiscountRows
      .map((discount) => Number(discount?.id || 0))
      .filter((id) => id > 0);
    let automaticDiscountCustomerUsageMap = new Map();
    if (customerId > 0 && automaticDiscountIds.length) {
      const [automaticDiscountUsageRows] = await db.query(
        `SELECT discount_id, COUNT(*) AS usage_count
           FROM mkt_discount_usage
          WHERE tenant_id = ? AND customer_id = ? AND discount_id IN (?)
          GROUP BY discount_id`,
        [tenantId, customerId, automaticDiscountIds]
      );
      automaticDiscountCustomerUsageMap = new Map(
        (Array.isArray(automaticDiscountUsageRows) ? automaticDiscountUsageRows : []).map((row) => [
          Number(row?.discount_id || 0),
          Number(row?.usage_count || 0),
        ])
      );
    }
    const automaticDiscounts = automaticDiscountRows.slice();
    const rewardRows = customerId > 0
      ? await loadCustomerRewardRows(tenantId, customerId, { statuses: ['available', 'used', 'expired'] })
      : [];
    const availableRewardRows = rewardRows.filter((row) => publicDiscountText(row?.status).toLowerCase() === 'available');
    const completedCards = buildPublicCompletedCardsFromRewardRows(rewardRows);
    const redeemedSourcePromoIds = new Set(
      rewardRows
        .map((row) => {
          const payload = parsePublicRewardPayload(row);
          return publicDiscountText(payload?.claimed_from).toLowerCase() === 'promo'
            ? Number(payload?.source_promo_code_id || 0)
            : 0;
        })
        .filter((id) => id > 0)
    );
    const breakdownMap = new Map();

    const productCategoriesMap = await loadCheckoutProductCategoriesMap(tenantId, productIds);

    const baseItems = cloneCheckoutBenefitItems(normalizedItems);
    const discountTargetsById = await loadDiscountTargetRowsMap(
      tenantId,
      automaticDiscounts.map((discount) => Number(discount?.id || 0))
    );
    const discountTargetPreviewProductsMap = await loadCheckoutRewardProductsByIds(
      tenantId,
      [...new Set(
        [...discountTargetsById.values()].flatMap((rows) => (
          (Array.isArray(rows) ? rows : [])
            .map((row) => Number(row?.product_id || 0))
            .filter((id) => id > 0)
        ))
      )]
    );
    const discountEntries = [];
    const discountCards = automaticDiscounts.map((discount) => {
      const discountId = Number(discount?.id || 0);
      const targetRows = discountTargetsById.get(discountId) || [];
      const customerUsageCount = Number(automaticDiscountCustomerUsageMap.get(discountId) || 0);
      const perCustomerLimit = Number(discount?.usage_per_customer || 0);
      const outcome = perCustomerLimit > 0 && customerUsageCount >= perCustomerLimit
        ? {
            isApplicable: false,
            errorCode: 'DISCOUNT_CUSTOMER_LIMIT_REACHED',
            discountAmount: 0,
            items: cloneCheckoutBenefitItems(baseItems),
            itemsTotalAfterDiscount: roundPromoMoney(itemsBaseTotal),
            usageRecords: [],
          }
        : applySelectedDiscountToItems({
            discount,
            items: baseItems,
            targetRows,
            productCategoriesMap,
          });
      const isSelected = selectedDiscountSource === 'discount'
        && selectedDiscountId !== null
        && discountId === selectedDiscountId;
      const card = {
        ...buildPublicDiscountBenefitCard(discount),
        discount_amount: roundPromoMoney(Number(outcome?.discountAmount || 0)),
        is_applicable: outcome?.isApplicable === true,
        disabled_reason_code: outcome?.isApplicable ? '' : publicDiscountText(outcome?.errorCode),
        disabled_reason: outcome?.isApplicable ? '' : buildDiscountPreviewDisabledReason(outcome?.errorCode),
        is_selected: Boolean(isSelected),
        source: 'discount',
        reward_id: null,
        products: buildRewardProductsPayload(
          targetRows,
          discountTargetPreviewProductsMap,
          getPublicDiscountProductsConfigMode(discount, 'any')
        ),
      };
      discountEntries.push({
        source: 'discount',
        selectionId: discountId,
        rewardId: null,
        sourceDiscountId: discountId,
        discount,
        targetRows,
        outcome,
        card,
      });
      return card;
    });

    for (const rewardRow of availableRewardRows) {
      if (publicDiscountText(rewardRow?.reward_type).toLowerCase() !== 'discount') continue;
      const rewardSource = buildPublicRewardDiscountSource(rewardRow);
      const rewardId = Number(rewardSource?.rewardId || rewardRow?.id || 0);
      const outcome = applySelectedDiscountToItems({
        discount: rewardSource.discount,
        items: baseItems,
        targetRows: rewardSource.targetRows || [],
        productCategoriesMap,
      });
      const isSelected = selectedDiscountSource === 'reward_discount'
        && selectedDiscountId !== null
        && rewardId === selectedDiscountId;
      const card = {
        ...buildPublicDiscountBenefitCard(rewardSource.discount),
        discount_amount: roundPromoMoney(Number(outcome?.discountAmount || 0)),
        is_applicable: outcome?.isApplicable === true,
        disabled_reason_code: outcome?.isApplicable ? '' : publicDiscountText(outcome?.errorCode),
        disabled_reason: outcome?.isApplicable ? '' : buildDiscountPreviewDisabledReason(outcome?.errorCode),
        is_selected: Boolean(isSelected),
        source: 'reward_discount',
        reward_id: rewardId || null,
        products: Array.isArray(rewardSource?.payload?.products) ? rewardSource.payload.products : [],
      };
      discountEntries.push({
        source: 'reward_discount',
        selectionId: rewardId,
        rewardId,
        sourceDiscountId: Number(rewardRow?.discount_id || 0) || null,
        discount: rewardSource.discount,
        targetRows: rewardSource.targetRows || [],
        outcome,
        rewardRow,
        card,
      });
      discountCards.push(card);
    }

    const {
      entry: selectedDiscountEntry,
    } = resolveSelectedCheckoutDiscountEntry({
      selectedDiscountId,
      selectedDiscountSource,
      discountEntries,
      allDiscountRows: automaticDiscountRows,
    });
    const selectedDiscountCard = selectedDiscountEntry?.card || null;
    const selectedDiscount = selectedDiscountEntry?.discount || null;
    const selectedDiscountOutcome = selectedDiscountEntry?.outcome?.isApplicable
      ? selectedDiscountEntry.outcome
      : null;

    const itemsAfterSelectedDiscount = selectedDiscountOutcome?.isApplicable
      ? cloneCheckoutBenefitItems(selectedDiscountOutcome.items)
      : cloneCheckoutBenefitItems(baseItems);
    let itemsTotalAfterBenefits = selectedDiscountOutcome?.isApplicable
      ? roundPromoMoney(selectedDiscountOutcome.itemsTotalAfterDiscount)
      : roundPromoMoney(itemsBaseTotal);

    if (selectedDiscountOutcome?.isApplicable && Number(selectedDiscountOutcome.discountAmount || 0) > 0) {
      addCheckoutPreviewBreakdownAmount(
        breakdownMap,
        `discount_${Number(selectedDiscount?.id || 0)}`,
        publicDiscountText(selectedDiscount?.title) || '\u0421\u043a\u0438\u0434\u043a\u0430',
        Number(selectedDiscountOutcome.discountAmount || 0)
      );
    }

    const promoDiscounts = customerBenefitDiscountRows.filter((discount) => isPublicPromoSimpleDiscount(discount));
    const promoDiscountIds = promoDiscounts
      .map((discount) => Number(discount?.id || 0))
      .filter((id) => id > 0);

    let promoRowsByDiscountId = new Map();
    let promoTargetsByDiscountId = new Map();
    let promoCustomerUsageMap = new Map();
    let promoTargetPreviewProductsMap = new Map();

    if (promoDiscountIds.length) {
      promoRowsByDiscountId = await loadBenefitPromoRowsMap({
        tenantId,
        storeId,
        customerId,
        discounts: promoDiscounts,
        includeInactive: true,
      });
      promoTargetsByDiscountId = await loadDiscountTargetRowsMap(tenantId, promoDiscountIds);
      promoTargetPreviewProductsMap = await loadCheckoutRewardProductsByIds(
        tenantId,
        [...new Set(
          [...promoTargetsByDiscountId.values()].flatMap((rows) => (
            (Array.isArray(rows) ? rows : [])
              .map((row) => Number(row?.product_id || 0))
              .filter((id) => id > 0)
          ))
        )]
      );

      if (customerId > 0) {
        const [promoUsageRows] = await db.query(
          `SELECT discount_id, COUNT(*) AS usage_count
             FROM mkt_discount_usage
            WHERE tenant_id = ? AND customer_id = ? AND discount_id IN (?)
            GROUP BY discount_id`,
          [tenantId, customerId, promoDiscountIds]
        );
        promoCustomerUsageMap = new Map(
          (Array.isArray(promoUsageRows) ? promoUsageRows : []).map((row) => [
            Number(row?.discount_id || 0),
            Number(row?.usage_count || 0),
          ])
        );
      }
    }

    function computeRegularPromoPreviewOutcome(discount, promoRow, targetSets) {
      const previewItems = cloneCheckoutBenefitItems(baseItems);
      const itemsTotalBeforePromo = roundPromoMoney(
        previewItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
      );

      if (!promoRow || !discount) {
        return {
          isApplicable: false,
          disabledReasonCode: 'PROMO_INVALID',
          disabledReason: buildPromoPreviewDisabledReason('PROMO_INVALID'),
          discountAmount: 0,
          itemsTotalAfterPromo: itemsTotalBeforePromo,
          items: previewItems,
        };
      }

      if (Number(promoRow?.is_active || 0) !== 1 || !discountHelpers.isDiscountActive(discount)) {
        return {
          isApplicable: false,
          disabledReasonCode: 'PROMO_NOT_AVAILABLE',
          disabledReason: buildPromoPreviewDisabledReason('PROMO_NOT_AVAILABLE'),
          discountAmount: 0,
          itemsTotalAfterPromo: itemsTotalBeforePromo,
          items: previewItems,
        };
      }

      if (Number(promoRow?.usage_limit || 0) > 0 && Number(promoRow?.usage_count || 0) >= Number(promoRow?.usage_limit || 0)) {
        return {
          isApplicable: false,
          disabledReasonCode: 'PROMO_LIMIT_REACHED',
          disabledReason: buildPromoPreviewDisabledReason('PROMO_LIMIT_REACHED'),
          discountAmount: 0,
          itemsTotalAfterPromo: itemsTotalBeforePromo,
          items: previewItems,
        };
      }

      if (Number(promoRow?.assigned_customer_id || 0) > 0 && Number(promoRow?.assigned_customer_id || 0) !== Number(customerId || 0)) {
        return {
          isApplicable: false,
          disabledReasonCode: 'PROMO_NOT_AVAILABLE',
          disabledReason: buildPromoPreviewDisabledReason('PROMO_NOT_AVAILABLE'),
          discountAmount: 0,
          itemsTotalAfterPromo: itemsTotalBeforePromo,
          items: previewItems,
        };
      }

      if (Number(discount?.usage_per_customer || 0) > 0 && Number(customerId || 0) > 0) {
        const customerUsageCount = Number(promoCustomerUsageMap.get(Number(discount?.id || 0)) || 0);
        if (customerUsageCount >= Number(discount?.usage_per_customer || 0)) {
          return {
            isApplicable: false,
            disabledReasonCode: 'PROMO_CUSTOMER_LIMIT_REACHED',
            disabledReason: buildPromoPreviewDisabledReason('PROMO_CUSTOMER_LIMIT_REACHED'),
            discountAmount: 0,
            itemsTotalAfterPromo: itemsTotalBeforePromo,
            items: previewItems,
          };
        }
      }

      return computeCheckoutPromoPreviewEffect({
        runtimeConfig: {
          ...getPromoRuntimeConfig(discount),
          maxDiscountAmount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
          minOrderAmount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
        },
        targetSets,
        sourceItems: baseItems,
        sourceItemsTotal: itemsTotalBeforePromo,
        productCategoriesMap,
      });
    }

    const promoEntries = [];
    const promoCards = [];
    for (const discount of promoDiscounts) {
      const rewardMeta = getPublicPromoRewardMeta(discount);
      const rows = promoRowsByDiscountId.get(Number(discount?.id || 0)) || [];
      const targetRows = promoTargetsByDiscountId.get(Number(discount?.id || 0)) || [];
      const targetSets = buildDiscountProductTargetSets(targetRows);
      const actionMode = isPromoRewardRedeemAction(discount) ? 'redeem_reward' : 'select';
      for (const row of rows) {
        if (redeemedSourcePromoIds.has(Number(row?.promo_code_id || 0))) continue;

        const code = publicDiscountText(row?.code);
        const codeMode = publicDiscountText(row?.code_mode).toLowerCase();
        if (!code) continue;

        const baseOutcome = computeRegularPromoPreviewOutcome(discount, row, targetSets);
        const currentOutcome = selectedDiscountOutcome?.isApplicable
          ? computeCheckoutPromoPreviewEffect({
              runtimeConfig: {
                ...getPromoRuntimeConfig(discount),
                maxDiscountAmount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
                minOrderAmount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
              },
              targetSets,
              sourceItems: itemsAfterSelectedDiscount,
              sourceItemsTotal: selectedDiscountOutcome.itemsTotalAfterDiscount,
              productCategoriesMap,
            })
          : baseOutcome;
        const isRequestedSelected = actionMode === 'select'
          && selectedPromoSource === 'promo_code'
          && promoCode
          && normalizeOrderPromoCode(code) === promoCode;
        const canKeepSelected = !selectedDiscountOutcome?.isApplicable
          || canCombineCheckoutBenefits(selectedDiscountCard, { is_stackable: isCheckoutBenefitStackable(discount) });
        const card = {
          id: Number(row?.promo_code_id || 0),
          kind: 'promo_code',
          title: publicDiscountText(discount?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
          description: rewardMeta.description,
          badge_text: rewardMeta.badge_text,
          apply_scope_text: rewardMeta.apply_scope_text,
          expires_at: discount?.ends_at || null,
          code,
          is_copyable: true,
          is_stackable: isCheckoutBenefitStackable(discount),
          usage_limit: row?.usage_limit == null ? null : Number(row.usage_limit || 0),
          usage_count: Number(row?.usage_count || 0),
          status_text: codeMode === 'shared' ? '\u041e\u0431\u0449\u0438\u0439' : '\u041f\u0435\u0440\u0441\u043e\u043d\u0430\u043b\u044c\u043d\u044b\u0439',
          is_applicable: currentOutcome.isApplicable === true,
          disabled_reason_code: currentOutcome.isApplicable ? '' : publicDiscountText(currentOutcome?.disabledReasonCode),
          disabled_reason: currentOutcome.isApplicable ? '' : currentOutcome.disabledReason,
          is_selected: Boolean(isRequestedSelected && currentOutcome.isApplicable === true && canKeepSelected),
          source: 'promo_code',
          action_mode: actionMode,
          reward_id: null,
          products: buildRewardProductsPayload(
            targetRows,
            promoTargetPreviewProductsMap,
            getPublicDiscountProductsConfigMode(discount, 'any')
          ),
        };
        promoCards.push(card);
        promoEntries.push({
          source: 'promo_code',
          rewardId: null,
          selectionCode: code,
          discount,
          promoRow: row,
          runtimeConfig: {
            ...getPromoRuntimeConfig(discount),
            maxDiscountAmount: discount?.max_discount_amount != null ? Number(discount.max_discount_amount || 0) : null,
            minOrderAmount: discount?.min_order_amount != null ? Number(discount.min_order_amount || 0) : null,
          },
          targetSets,
          baseOutcome,
          card,
        });
      }
    }

    for (const rewardRow of availableRewardRows) {
      if (publicDiscountText(rewardRow?.reward_type).toLowerCase() !== 'promo_code') continue;
      const payload = parsePublicRewardPayload(rewardRow);
      const targetRows = getRewardPayloadTargetRows(payload);
      const targetSets = buildDiscountProductTargetSets(targetRows);
      const runtimeConfig = getRewardPromoRuntimeConfig(payload);
      const baseOutcome = computeCheckoutPromoPreviewEffect({
        runtimeConfig,
        targetSets,
        sourceItems: baseItems,
        sourceItemsTotal: itemsBaseTotal,
        productCategoriesMap,
      });
      const currentOutcome = selectedDiscountOutcome?.isApplicable
        ? computeCheckoutPromoPreviewEffect({
            runtimeConfig,
            targetSets,
            sourceItems: itemsAfterSelectedDiscount,
            sourceItemsTotal: selectedDiscountOutcome.itemsTotalAfterDiscount,
            productCategoriesMap,
          })
        : baseOutcome;
      const isRequestedSelected = selectedPromoSource === 'reward_promo'
        && selectedPromoRewardId !== null
        && Number(rewardRow?.id || 0) === Number(selectedPromoRewardId || 0)
        && normalizeOrderPromoCode(payload?.code || payload?.source_code) === promoCode;
      const canKeepSelected = !selectedDiscountOutcome?.isApplicable
        || canCombineCheckoutBenefits(selectedDiscountCard, {
          is_stackable: Number(payload?.is_stackable || 0) === 1 || payload?.is_stackable === true,
        });
      const card = {
        ...buildPublicRewardPromoCard(rewardRow),
        is_applicable: currentOutcome.isApplicable === true,
        disabled_reason_code: currentOutcome.isApplicable ? '' : publicDiscountText(currentOutcome?.disabledReasonCode),
        disabled_reason: currentOutcome.isApplicable ? '' : currentOutcome.disabledReason,
        is_selected: Boolean(isRequestedSelected && currentOutcome.isApplicable === true && canKeepSelected),
      };
      promoCards.push(card);
      promoEntries.push({
        source: 'reward_promo',
        rewardId: Number(rewardRow?.id || 0) || null,
        selectionCode: publicDiscountText(payload?.code || payload?.source_code),
        discount: {
          id: Number(payload?.source_discount_id || rewardRow?.discount_id || 0) || null,
          title: publicDiscountText(payload?.title) || publicDiscountText(rewardRow?.discount_title),
          is_stackable: Number(payload?.is_stackable || 0) === 1 || payload?.is_stackable === true,
        },
        promoRow: {
          promo_code_id: Number(payload?.source_promo_code_id || 0) || null,
          code: publicDiscountText(payload?.code || payload?.source_code),
        },
        runtimeConfig,
        targetSets,
        baseOutcome,
        rewardRow,
        card,
      });
    }

    const { entry: selectedPromoEntry } = resolveSelectedCheckoutPromoEntry({
      promoCode,
      selectedPromoSource,
      selectedPromoRewardId,
      promoEntries,
    });
    const selectedPromoCard = selectedPromoEntry?.card || null;
    let promoOutcomeForSummary = null;
    if (
      selectedPromoEntry
      && selectedPromoEntry?.baseOutcome?.isApplicable
      && (!selectedDiscountOutcome?.isApplicable || canCombineCheckoutBenefits(selectedDiscountCard, selectedPromoEntry?.card))
    ) {
      promoOutcomeForSummary = selectedDiscountOutcome?.isApplicable
        ? computeCheckoutPromoPreviewEffect({
            runtimeConfig: selectedPromoEntry.runtimeConfig,
            targetSets: selectedPromoEntry.targetSets,
            sourceItems: itemsAfterSelectedDiscount,
            sourceItemsTotal: selectedDiscountOutcome.itemsTotalAfterDiscount,
            productCategoriesMap,
          })
        : selectedPromoEntry.baseOutcome;
      if (promoOutcomeForSummary?.isApplicable) {
        itemsTotalAfterBenefits = roundPromoMoney(promoOutcomeForSummary.itemsTotalAfterPromo);
      }
      if (Number(promoOutcomeForSummary?.discountAmount || 0) > 0) {
        addCheckoutPreviewBreakdownAmount(
          breakdownMap,
          `promo_${Number(selectedPromoCard?.reward_id || selectedPromoCard?.id || 0)}`,
          publicDiscountText(selectedPromoCard?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
          Number(promoOutcomeForSummary.discountAmount || 0)
        );
      }
    }

    const availableGiftRewardProductIds = await loadPublicGiftRewardAvailableProductIds(tenantId, storeId, availableRewardRows);
    const giftCards = availableRewardRows
      .filter((row) => publicDiscountText(row?.reward_type).toLowerCase() === 'gift')
      .map((row) => buildPublicGiftRewardCard(row, availableGiftRewardProductIds));

    const loyaltyDiscounts = customerBenefitDiscountRows.filter(
      (discount) => normalizePublicMechanicType(discount?.mechanic_type) === 'loyalty_progress'
    );
    const progress = await buildPublicProgressBenefitCards({
      tenantId,
      storeId,
      customerId,
      discounts: loyaltyDiscounts,
    });

    let deliveryRules = null;
    if (methodCode === 'delivery') {
      const [settings] = await db.query(
        `SELECT ds.delivery_cost, ds.free_delivery_from
           FROM ten_delivery_settings ds
           JOIN ten_delivery_settings_stores dss
             ON dss.delivery_setting_id = ds.id
            AND dss.tenant_id = ds.tenant_id
          WHERE ds.tenant_id = ?
            AND dss.store_id = ?
            AND ds.is_active = 1
          LIMIT 1`,
        [tenantId, storeId]
      );
      if (Array.isArray(settings) && settings.length) {
        const current = settings[0];
        deliveryRules = {
          cost: Number(current?.delivery_cost || 0),
          freeFrom: current?.free_delivery_from != null ? Number(current.free_delivery_from) : null,
        };
      }
    }
    const clientCalculation = buildCheckoutBenefitsClientCalculationMatrix({
      subtotalBeforeDiscount,
      itemsBaseTotal,
      methodCode,
      deliveryRules,
      discountEntries,
      promoEntries,
      productCategoriesMap,
    });
    const summary = buildCheckoutPreviewSummarySnapshot({
      subtotalBeforeDiscount,
      itemsTotalAfterBenefits,
      methodCode,
      deliveryRules,
      breakdownMap,
    });

    return {
      discounts: discountCards,
      promo_codes: promoCards,
      gifts: giftCards,
      progress,
      completed: completedCards,
      summary,
      client_calculation: clientCalculation,
    };
  }

  async function resolveCheckoutProgressClaimContext({
    tenantId,
    storeId,
    customer,
    draft,
    discountId,
  }) {
    const customerId = Number(customer?.id || 0) || null;
    const normalizedDiscountId = Number(discountId || 0);
    if (!(normalizedDiscountId > 0) || !(customerId > 0)) {
      throw Object.assign(new Error('DISCOUNT_INVALID'), { code: 'DISCOUNT_INVALID' });
    }

    const preview = await buildCheckoutBenefitsPreviewData({
      tenantId,
      storeId,
      customer,
      draft,
    });
    const progressCard = (Array.isArray(preview?.progress) ? preview.progress : [])
      .find((entry) => Number(entry?.discount_id || entry?.id || 0) === normalizedDiscountId);
    if (!progressCard) {
      throw Object.assign(new Error('DISCOUNT_INVALID'), { code: 'DISCOUNT_INVALID' });
    }
    if (progressCard?.is_claimable !== true || Number(progressCard?.pending_reward_count || 0) < 1) {
      throw Object.assign(new Error('DISCOUNT_NOT_APPLICABLE'), { code: 'DISCOUNT_NOT_APPLICABLE' });
    }

    const customerBenefitDiscountRows = await loadCustomerBenefitDiscountRows(tenantId, storeId, customerId);
    const loyaltyDiscount = customerBenefitDiscountRows.find((discount) => (
      Number(discount?.id || 0) === normalizedDiscountId
      && normalizePublicMechanicType(discount?.mechanic_type) === 'loyalty_progress'
    )) || null;
    if (!loyaltyDiscount) {
      throw Object.assign(new Error('DISCOUNT_NOT_AVAILABLE'), { code: 'DISCOUNT_NOT_AVAILABLE' });
    }

    return {
      customerId,
      preview,
      progressCard,
      loyaltyDiscount,
    };
  }

  async function buildCheckoutProgressGiftClaimOptionsData({
    tenantId,
    storeId,
    customer,
    draft,
    discountId,
    queryRunner = null,
  }) {
    const {
      progressCard,
      loyaltyDiscount,
    } = await resolveCheckoutProgressClaimContext({
      tenantId,
      storeId,
      customer,
      draft,
      discountId,
    });

    if (publicDiscountText(progressCard?.reward_kind).toLowerCase() !== 'gift') {
      throw Object.assign(new Error('DISCOUNT_NOT_APPLICABLE'), { code: 'DISCOUNT_NOT_APPLICABLE' });
    }

    const mechanic = parsePublicDiscountObject(loyaltyDiscount?.mechanic_config_json, {});
    const rewardTargetRows = collectLoyaltyProgressGiftRewardTargetRows(mechanic);
    const productIds = [...new Set(
      rewardTargetRows
        .map((row) => Number(row?.product_id || 0))
        .filter((id) => id > 0)
    )];
    const selectionLimit = Math.max(0, Number(progressCard?.pending_reward_count || 0));
    const productSnapshots = await loadCheckoutBenefitRewardClaimProducts(
      queryRunner,
      tenantId,
      storeId,
      productIds
    );
    const productSnapshotMap = new Map(
      productSnapshots.map((item) => [Number(item?.product_id || 0), item])
    );

    const items = [];
    rewardTargetRows.forEach((targetRow, targetIndex) => {
      const productId = Number(targetRow?.product_id || 0);
      if (!(productId > 0)) return;
      const snapshot = productSnapshotMap.get(productId);
      if (!snapshot || snapshot.is_available !== true) return;
      const stockQty = snapshot.stock_qty != null ? Math.max(0, Math.floor(Number(snapshot.stock_qty || 0))) : null;
      items.push({
        ...snapshot,
        config_mode: normalizePublicProductConfigMode(targetRow?.config_mode, 'any'),
        product_config: normalizePublicProductConfigPayload(
          targetRow?.product_config ?? targetRow?.product_config_json,
          productId
        ),
        selection_key: buildPublicGiftRewardSelectionKey(targetRow, targetIndex),
        max_selectable_qty: stockQty == null
          ? selectionLimit
          : Math.max(0, Math.min(selectionLimit, stockQty)),
      });
    });

    const data = {
      discount_id: Number(progressCard?.discount_id || progressCard?.id || 0) || null,
      title: publicDiscountText(loyaltyDiscount?.title) || 'Накопительная акция',
      description: publicDiscountText(loyaltyDiscount?.description),
      pending_reward_count: selectionLimit,
      selection_limit: selectionLimit,
      reward_qty: Number(progressCard?.reward_qty || 1) || 1,
      pending_reward_mode: normalizePublicProgressPendingRewardMode(progressCard?.pending_reward_mode),
      items,
    };
    if (!publicDiscountText(loyaltyDiscount?.title).trim()) data.title = 'Накопительная акция';
    if (!publicDiscountText(loyaltyDiscount?.title).trim()) {
      data.title = "\u041d\u0430\u043a\u043e\u043f\u0438\u0442\u0435\u043b\u044c\u043d\u0430\u044f \u0430\u043a\u0446\u0438\u044f";
    }
    return data;
  }

  async function buildCheckoutProgressProductsSheetData({
    tenantId,
    storeId,
    customerId,
    discountId,
  }) {
    const normalizedDiscountId = Number(discountId || 0);
    if (!(normalizedDiscountId > 0) || !(Number(customerId || 0) > 0)) {
      throw Object.assign(new Error('DISCOUNT_INVALID'), { code: 'DISCOUNT_INVALID' });
    }

    const customerBenefitDiscountRows = await loadCustomerBenefitDiscountRows(tenantId, storeId, customerId);
    const loyaltyDiscount = customerBenefitDiscountRows.find((discount) => (
      Number(discount?.id || 0) === normalizedDiscountId
      && normalizePublicMechanicType(discount?.mechanic_type) === 'loyalty_progress'
    )) || null;
    if (!loyaltyDiscount) {
      throw Object.assign(new Error('DISCOUNT_NOT_AVAILABLE'), { code: 'DISCOUNT_NOT_AVAILABLE' });
    }

    if (getPublicProgressInteractionMode(loyaltyDiscount) !== 'products_sheet') {
      throw Object.assign(new Error('DISCOUNT_NOT_APPLICABLE'), { code: 'DISCOUNT_NOT_APPLICABLE' });
    }

    const qualifyingScopeMode = getPublicProgressQualifyingScopeMode(loyaltyDiscount);
    let items = [];
    if (qualifyingScopeMode === 'product') {
      const mechanic = parsePublicDiscountObject(loyaltyDiscount?.mechanic_config_json, {});
      const rows = Array.isArray(mechanic?.qualifying_items) ? mechanic.qualifying_items : [];
      const productRows = rows
        .map((row) => {
          const entityType = publicDiscountText(row?.entity_type).toLowerCase();
          if (entityType && entityType !== 'product') return null;
          const productId = Number(row?.product_id ?? row?.entity_id ?? row?.id ?? 0);
          if (!(productId > 0)) return null;
          return {
            product_id: productId,
            config_mode: normalizePublicProductConfigMode(
              row?.config_mode ?? mechanic?.qualifying_items_config_mode,
              'any'
            ),
            product_config: normalizePublicProductConfigPayload(
              row?.product_config ?? row?.product_config_json,
              productId
            ),
          };
        })
        .filter(Boolean);
      const snapshots = await loadCheckoutBenefitProductSnapshotsByIds(
        tenantId,
        productRows.map((row) => Number(row?.product_id || 0))
      );
      const snapshotMap = new Map(
        (Array.isArray(snapshots) ? snapshots : []).map((snapshot) => [Number(snapshot?.product_id || 0), snapshot])
      );
      items = productRows
        .map((row) => {
          const snapshot = snapshotMap.get(Number(row?.product_id || 0));
          if (!snapshot) return null;
          return {
            ...snapshot,
            config_mode: row.config_mode,
            product_config: row.product_config,
          };
        })
        .filter(Boolean);
    } else if (qualifyingScopeMode === 'category') {
      items = await loadCheckoutBenefitProductSnapshotsByCategoryIds(
        tenantId,
        collectPublicProgressQualifyingCategoryIds(loyaltyDiscount)
      );
    }

    const data = {
      discount_id: normalizedDiscountId,
      qualifying_scope_mode: qualifyingScopeMode,
      title: publicDiscountText(loyaltyDiscount?.title) || 'Подходящие товары',
      description: publicDiscountText(loyaltyDiscount?.description),
      items,
    };
    if (!publicDiscountText(loyaltyDiscount?.title).trim()) data.title = 'Подходящие товары';
    if (!publicDiscountText(loyaltyDiscount?.title).trim()) {
      data.title = "\u041f\u043e\u0434\u0445\u043e\u0434\u044f\u0449\u0438\u0435 \u0442\u043e\u0432\u0430\u0440\u044b";
    }
    return data;
  }

  router.post('/checkout/benefits/preview', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const data = await buildCheckoutBenefitsPreviewData({
        tenantId,
        storeId,
        customer,
        draft: req.body,
      });

      return res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/attach-promo', async (req, res) => {
    let conn = null;
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = Number(customer?.id || 0) || null;
      const normalizedCode = normalizeOrderPromoCode(req.body?.code);
      if (!(customerId > 0) || !normalizedCode) {
        return res.status(409).json({ ok: false, error: 'PROMO_CODE_REQUIRED' });
      }

      conn = await db.getConnection();

      const promoRow = await loadPromoSourceRowByCode(conn, tenantId, storeId, normalizedCode);
      if (!promoRow || !discountHelpers.isPromoSimpleDiscount(promoRow) || isPromoRewardRedeemAction(promoRow)) {
        return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
      }
      if (!discountHelpers.isDiscountActive(promoRow) || Number(promoRow.promo_is_active || 0) !== 1) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }
      if (
        Number(promoRow.promo_usage_limit || 0) > 0
        && Number(promoRow.promo_usage_count || 0) >= Number(promoRow.promo_usage_limit || 0)
      ) {
        return res.status(409).json({ ok: false, error: 'PROMO_LIMIT_REACHED' });
      }
      if (
        Number(promoRow.assigned_customer_id || 0) > 0
        && Number(promoRow.assigned_customer_id || 0) !== Number(customerId || 0)
      ) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      const customerCategoryIds = await discountHelpers.getCustomerCategoryIds(db, tenantId, customerId);
      const [promoAudienceRows] = await conn.query(
        `SELECT target_type, customer_id, customer_category_id
           FROM mkt_discount_customers
          WHERE tenant_id = ? AND discount_id = ?`,
        [tenantId, Number(promoRow.discount_id || 0)]
      );
      if (!discountHelpers.matchDiscountAudience(promoAudienceRows, customerId, customerCategoryIds)) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      const visibility = isHiddenBenefitsDiscount(promoRow) ? 'hidden' : 'public';
      if (visibility === 'hidden') {
        await ensureCustomerBenefitPromoStorage();
        await conn.query(
          `INSERT INTO mkt_customer_benefit_promos (
             tenant_id, store_id, customer_id, promo_code_id, discount_id
           ) VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             discount_id = VALUES(discount_id),
             updated_at = CURRENT_TIMESTAMP`,
          [
            tenantId,
            storeId,
            customerId,
            Number(promoRow.promo_code_id || 0),
            Number(promoRow.discount_id || 0),
          ]
        );
      }

      return res.json({
        ok: true,
        data: {
          promo_code_id: Number(promoRow.promo_code_id || 0) || null,
          discount_id: Number(promoRow.discount_id || 0) || null,
          visibility,
          code: publicDiscountText(promoRow.code),
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      if (conn) conn.release();
    }
  });

  router.post('/checkout/benefits/progress-products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const data = await buildCheckoutProgressProductsSheetData({
        tenantId,
        storeId,
        customerId: Number(customer?.id || 0),
        discountId: Number(req.body?.discount_id || 0),
      });

      return res.json({ ok: true, data });
    } catch (e) {
      if (['DISCOUNT_INVALID', 'DISCOUNT_NOT_AVAILABLE', 'DISCOUNT_NOT_APPLICABLE'].includes(String(e?.code || e?.message || ''))) {
        return res.status(409).json({ ok: false, error: String(e?.code || e?.message || 'DISCOUNT_INVALID') });
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/claim-progress-options', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const data = await buildCheckoutProgressGiftClaimOptionsData({
        tenantId,
        storeId,
        customer,
        draft: req.body,
        discountId: Number(req.body?.discount_id || 0),
      });

      return res.json({ ok: true, data });
    } catch (e) {
      if (['DISCOUNT_INVALID', 'DISCOUNT_NOT_AVAILABLE', 'DISCOUNT_NOT_APPLICABLE'].includes(String(e?.code || e?.message || ''))) {
        return res.status(409).json({ ok: false, error: String(e?.code || e?.message || 'DISCOUNT_INVALID') });
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/receive-gift', async (req, res) => {
    let conn = null;
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = Number(customer?.id || 0) || null;
      const rewardId = Number(req.body?.reward_id || 0);
      if (!(rewardId > 0) || !(customerId > 0)) {
        return res.status(409).json({ ok: false, error: 'REWARD_INVALID' });
      }

      await ensureDiscountRuntimeTables();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT *
           FROM mkt_discount_rewards
          WHERE tenant_id = ?
            AND customer_id = ?
            AND id = ?
            AND reward_type = 'gift'
            AND status = 'available'
          LIMIT 1`,
        [tenantId, customerId, rewardId]
      );
      const rewardRow = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!rewardRow) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'REWARD_INVALID' });
      }

      const payload = parsePublicRewardPayload(rewardRow);
      const products = Array.isArray(payload?.products) ? payload.products : [];
      if (!products.length) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'REWARD_NOT_APPLICABLE' });
      }

      const availableProducts = await loadCheckoutBenefitRewardClaimProducts(
        conn,
        tenantId,
        helpers.getStoreId(req),
        products.map((product) => Number(product?.id || 0)).filter((id) => id > 0)
      );
      const availableProductIds = new Set(
        availableProducts.map((product) => Number(product?.product_id || 0)).filter((id) => id > 0)
      );
      const hasUnavailableProducts = products.some((product) => !availableProductIds.has(Number(product?.id || 0)));
      if (hasUnavailableProducts || !availableProducts.length) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'REWARD_NOT_APPLICABLE' });
      }

      await conn.query(
        `UPDATE mkt_discount_rewards
            SET status = 'used', used_at = NOW(), updated_at = NOW()
          WHERE tenant_id = ?
            AND customer_id = ?
            AND id = ?
            AND status = 'available'`,
        [tenantId, customerId, rewardId]
      );

      await conn.commit();
      conn.release();
      conn = null;

      return res.json({
        ok: true,
        data: {
          reward_id: rewardId,
          products,
        },
      });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        try { conn.release(); } catch {}
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/restore-gift', async (req, res) => {
    let conn = null;
    try {
      const tenantId = helpers.getTenantId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = Number(customer?.id || 0) || null;
      const rewardId = Number(req.body?.reward_id || 0);
      if (!(rewardId > 0) || !(customerId > 0)) {
        return res.status(409).json({ ok: false, error: 'REWARD_INVALID' });
      }

      await ensureDiscountRuntimeTables();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        `SELECT id
           FROM mkt_discount_rewards
          WHERE tenant_id = ?
            AND customer_id = ?
            AND id = ?
            AND reward_type = 'gift'
            AND status = 'used'
          LIMIT 1`,
        [tenantId, customerId, rewardId]
      );
      const rewardRow = Array.isArray(rows) && rows.length ? rows[0] : null;
      if (!rewardRow) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'REWARD_INVALID' });
      }

      await conn.query(
        `UPDATE mkt_discount_rewards
            SET status = 'available', used_at = NULL, updated_at = NOW()
          WHERE tenant_id = ?
            AND customer_id = ?
            AND id = ?
            AND reward_type = 'gift'
            AND status = 'used'`,
        [tenantId, customerId, rewardId]
      );

      await conn.commit();
      conn.release();
      conn = null;

      return res.json({
        ok: true,
        data: {
          reward_id: rewardId,
        },
      });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        try { conn.release(); } catch {}
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/redeem-promo', async (req, res) => {
    let conn = null;
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = Number(customer?.id || 0) || null;
      const promoCodeId = Number(req.body?.promo_code_id || 0);
      if (!(promoCodeId > 0) || !(customerId > 0)) {
        return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
      }

      const preview = await buildCheckoutBenefitsPreviewData({
        tenantId,
        storeId,
        customer,
        draft: req.body,
      });
      const previewCard = (Array.isArray(preview?.promo_codes) ? preview.promo_codes : [])
        .find((card) => Number(card?.id || 0) === promoCodeId && publicDiscountText(card?.source).toLowerCase() === 'promo_code');
      if (!previewCard || publicDiscountText(previewCard?.action_mode).toLowerCase() !== 'redeem_reward') {
        return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
      }
      if (previewCard?.is_applicable !== true) {
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
      }

      await ensureDiscountRuntimeTables();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const promoRow = await loadPromoSourceRowById(conn, tenantId, storeId, promoCodeId);
      if (!promoRow || !discountHelpers.isPromoSimpleDiscount(promoRow) || !discountHelpers.isDiscountActive(promoRow)) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
      }

      if (Number(promoRow.promo_is_active || 0) !== 1) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      if (
        Number(promoRow.promo_usage_limit || 0) > 0
        && Number(promoRow.promo_usage_count || 0) >= Number(promoRow.promo_usage_limit || 0)
      ) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_LIMIT_REACHED' });
      }

      if (
        Number(promoRow.assigned_customer_id || 0) > 0
        && Number(promoRow.assigned_customer_id || 0) !== Number(customerId || 0)
      ) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      const customerCategoryIds = await discountHelpers.getCustomerCategoryIds(db, tenantId, customerId);
      const [promoAudienceRows] = await conn.query(
        `SELECT target_type, customer_id, customer_category_id
           FROM mkt_discount_customers
          WHERE tenant_id = ? AND discount_id = ?`,
        [tenantId, Number(promoRow.discount_id || 0)]
      );
      if (!discountHelpers.matchDiscountAudience(promoAudienceRows, customerId, customerCategoryIds)) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
      }

      if (Number(promoRow.usage_per_customer || 0) > 0) {
        const [[promoCustomerUsage]] = await conn.query(
          `SELECT COUNT(*) AS usage_count
             FROM mkt_discount_usage
            WHERE tenant_id = ? AND discount_id = ? AND customer_id = ?`,
          [tenantId, Number(promoRow.discount_id || 0), Number(customerId || 0)]
        );
        if (Number(promoCustomerUsage?.usage_count || 0) >= Number(promoRow.usage_per_customer || 0)) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'PROMO_CUSTOMER_LIMIT_REACHED' });
        }
      }

      const {
        items: previewItems,
        productIds,
        itemsBaseTotal,
      } = normalizeCheckoutPreviewItems(req.body?.items);
      const productCategoriesMap = await loadCheckoutProductCategoriesMap(tenantId, productIds);
      const targetRows = await loadDiscountTargetRows(conn, tenantId, Number(promoRow.discount_id || 0));
      const effect = computeCheckoutPromoPreviewEffect({
        runtimeConfig: {
          ...getPromoRuntimeConfig(promoRow),
          maxDiscountAmount: promoRow?.max_discount_amount != null ? Number(promoRow.max_discount_amount || 0) : null,
          minOrderAmount: promoRow?.min_order_amount != null ? Number(promoRow.min_order_amount || 0) : null,
        },
        targetSets: buildDiscountProductTargetSets(targetRows),
        sourceItems: previewItems,
        sourceItemsTotal: itemsBaseTotal,
        productCategoriesMap,
      });
      if (!effect?.isApplicable) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
      }

      const rewardDefinition = await buildRewardPayloadFromPromoSource(conn, {
        tenantId,
        storeId,
        discount: promoRow,
        promoRow,
      });
      await insertCustomerRewardRow(conn, {
        tenantId,
        customerId,
        discountId: Number(promoRow.discount_id || 0),
        rewardType: rewardDefinition.rewardType,
        payload: rewardDefinition.payload,
      });

      await conn.commit();
      conn.release();
      conn = null;

      const data = await buildCheckoutBenefitsPreviewData({
        tenantId,
        storeId,
        customer,
        draft: req.body,
      });
      return res.json({ ok: true, data });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        try { conn.release(); } catch {}
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/checkout/benefits/claim-progress', async (req, res) => {
    let conn = null;
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const token = str(req.headers['x-customer-token']);
      const customer = await getCustomerByToken(tenantId, token);
      if (!customer) return res.status(401).json({ ok: false, error: 'UNAUTHORIZED' });

      const customerId = Number(customer?.id || 0) || null;
      const discountId = Number(req.body?.discount_id || 0);
      if (!(discountId > 0) || !(customerId > 0)) {
        return res.status(409).json({ ok: false, error: 'DISCOUNT_INVALID' });
      }
      const {
        progressCard,
        loyaltyDiscount,
      } = await resolveCheckoutProgressClaimContext({
        tenantId,
        storeId,
        customer,
        draft: req.body,
        discountId,
      });

      await ensureDiscountRuntimeTables();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [progressRows] = await conn.query(
        `SELECT *
           FROM mkt_discount_progress
          WHERE tenant_id = ? AND customer_id = ? AND discount_id = ?
          LIMIT 1`,
        [tenantId, customerId, discountId]
      );
      const progressRow = Array.isArray(progressRows) && progressRows.length ? progressRows[0] : null;
      if (!progressRow || Number(progressRow?.pending_reward_count || 0) < 1) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'DISCOUNT_NOT_APPLICABLE' });
      }
      const mechanic = parsePublicDiscountObject(loyaltyDiscount?.mechanic_config_json, {});
      const rewardKind = publicDiscountText(progressCard?.reward_kind || mechanic?.reward_kind).toLowerCase() || 'gift';
      const pendingRewardMode = normalizePublicProgressPendingRewardMode(
        progressCard?.pending_reward_mode || mechanic?.pending_reward_mode
      );
      let selectedRewardItems = normalizeSelectedRewardItems(req.body?.selected_reward_items);
      const selectedRewardProductIds = Array.isArray(req.body?.selected_reward_product_ids)
        ? req.body.selected_reward_product_ids
            .map((id) => Number(id || 0))
            .filter((id) => id > 0)
        : [];
      if (!selectedRewardItems.length && selectedRewardProductIds.length) {
        selectedRewardItems = selectedRewardProductIds.map((productId) => ({
          selection_key: '',
          product_id: productId,
          product_config: null,
        }));
      }
      let claimedCount = 1;

      if (rewardKind === 'gift') {
        const claimOptions = await buildCheckoutProgressGiftClaimOptionsData({
          tenantId,
          storeId,
          customer,
          draft: req.body,
          discountId,
          queryRunner: conn,
        });
        const selectionLimit = Math.max(0, Number(claimOptions?.selection_limit || 0));
        if (!selectionLimit || !claimOptions?.items?.length) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'DISCOUNT_NOT_APPLICABLE' });
        }
        if (!selectedRewardItems.length || selectedRewardItems.length > selectionLimit) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'DISCOUNT_NOT_APPLICABLE' });
        }

        const optionItems = Array.isArray(claimOptions?.items) ? claimOptions.items : [];
        const optionMap = new Map();
        const optionProductMap = new Map();
        optionItems.forEach((item) => {
          const selectionKey = publicDiscountText(item?.selection_key);
          const productId = Number(item?.product_id || 0);
          if (selectionKey) optionMap.set(selectionKey, item);
          if (productId > 0) {
            if (!optionProductMap.has(productId)) optionProductMap.set(productId, []);
            optionProductMap.get(productId).push(item);
          }
        });
        const selectedCounts = new Map();
        const selectedProductUsage = new Map();
        const selectedResolvedItems = [];
        for (const selectedItem of selectedRewardItems) {
          const requestedProductId = Number(selectedItem?.product_id || 0);
          const requestedSelectionKey = publicDiscountText(selectedItem?.selection_key);
          let option = requestedSelectionKey ? (optionMap.get(requestedSelectionKey) || null) : null;
          if (!option && requestedProductId > 0) {
            const productOptions = optionProductMap.get(requestedProductId) || [];
            const usedCount = Number(selectedProductUsage.get(requestedProductId) || 0);
            option = productOptions[usedCount] || productOptions[0] || null;
            selectedProductUsage.set(requestedProductId, usedCount + 1);
          }
          if (!option) {
            await conn.rollback();
            return res.status(409).json({ ok: false, error: 'REWARD_NOT_APPLICABLE' });
          }
          const resolvedSelectionKey = publicDiscountText(option?.selection_key) || String(requestedProductId);
          selectedCounts.set(resolvedSelectionKey, Number(selectedCounts.get(resolvedSelectionKey) || 0) + 1);
          selectedResolvedItems.push({
            selection_key: resolvedSelectionKey,
            product_id: Number(option?.product_id || requestedProductId || 0),
            product_config: normalizePublicProductConfigPayload(
              selectedItem?.product_config,
              Number(option?.product_id || requestedProductId || 0)
            ),
          });
        }
        for (const [selectionKey, count] of selectedCounts.entries()) {
          const option = optionMap.get(selectionKey) || null;
          const maxSelectableQty = Math.max(0, Number(option?.max_selectable_qty || 0));
          if (!(maxSelectableQty > 0) || count > maxSelectableQty) {
            await conn.rollback();
            return res.status(409).json({ ok: false, error: 'REWARD_NOT_APPLICABLE' });
          }
        }

        for (const selectedItem of selectedResolvedItems) {
          const rewardDefinition = await buildRewardPayloadFromLoyaltyProgress(conn, {
            tenantId,
            storeId,
            discount: loyaltyDiscount,
            selectedRewardProductId: selectedItem.product_id,
            selectedRewardSelectionKey: selectedItem.selection_key,
            selectedRewardProductConfig: selectedItem.product_config,
          });
          await insertCustomerRewardRow(conn, {
            tenantId,
            customerId,
            discountId,
            rewardType: rewardDefinition.rewardType,
            payload: rewardDefinition.payload,
          });
        }
        claimedCount = selectedResolvedItems.length;
      } else {
        const rewardDefinition = await buildRewardPayloadFromLoyaltyProgress(conn, {
          tenantId,
          storeId,
          discount: loyaltyDiscount,
        });
        await insertCustomerRewardRow(conn, {
          tenantId,
          customerId,
          discountId,
          rewardType: rewardDefinition.rewardType,
          payload: rewardDefinition.payload,
        });
        claimedCount = 1;
      }

      const nextProgressState = applyClaimedProgressRedemption({
        progressValue: Number(progressRow?.progress_value || 0),
        pendingRewardCount: Number(progressRow?.pending_reward_count || 0),
        claimedCount,
        thresholdValue: Number(progressCard?.threshold_value || 0),
        pendingRewardMode,
      });
      await conn.query(
        `UPDATE mkt_discount_progress
            SET progress_value = ?, pending_reward_count = ?, updated_at = NOW()
          WHERE tenant_id = ? AND customer_id = ? AND discount_id = ?`,
        [
          nextProgressState.progressValue,
          nextProgressState.pendingRewardCount,
          tenantId,
          customerId,
          discountId,
        ]
      );

      await conn.commit();
      conn.release();
      conn = null;

      const data = await buildCheckoutBenefitsPreviewData({
        tenantId,
        storeId,
        customer,
        draft: req.body,
      });
      return res.json({ ok: true, data });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch {}
        try { conn.release(); } catch {}
      }
      if (e?.code === 'PROMO_INVALID') {
        return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
      }
      if (['DISCOUNT_INVALID', 'DISCOUNT_NOT_AVAILABLE', 'DISCOUNT_NOT_APPLICABLE', 'REWARD_NOT_APPLICABLE'].includes(String(e?.code || e?.message || ''))) {
        return res.status(409).json({ ok: false, error: String(e?.code || e?.message || 'DISCOUNT_NOT_APPLICABLE') });
      }
      console.error(e);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // create order
  // ------------------------------
  router.post('/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      let orderStoreId = storeId;
      await ensureOrderDeliveryTypeColumns();

      const [tenantRows] = await db.query(
        'SELECT price_rounding_mode, price_rounding_precision, order_stock_deduct_mode, order_stock_deduct_status_id FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const roundingModeRaw = tenantRows[0]?.price_rounding_mode || 'none';
      const roundingPrecisionRaw = Number(tenantRows[0]?.price_rounding_precision);
      const stockDeductModeRaw = String(tenantRows[0]?.order_stock_deduct_mode || 'on_create').trim();
      const stockDeductMode = stockDeductModeRaw === 'on_status' ? 'on_status' : 'on_create';
      const allowedRounding = new Set(['none', 'down', 'up', 'nearest']);
      const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : 'none';
      const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;

      function roundPrice(value) {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return 0;
        if (roundingMode === 'none') return n;
        const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
        if (roundingMode === 'up') return Math.ceil(n * factor) / factor;
        if (roundingMode === 'down') return Math.floor(n * factor) / factor;
        return Math.round(n * factor) / factor;
      }

      // auth customer (optional)
      const token = str(req.headers['x-customer-token']);
      const authCustomer = token ? await getCustomerByToken(tenantId, token) : null;

      const items = Array.isArray(req.body.items) ? req.body.items : [];
      if (!items.length) return res.status(400).json({ ok: false, error: 'EMPTY_ITEMS' });

      const paymentCode = helpers.strOrNull(req.body.payment_code);
      const methodCode = helpers.strOrNull(req.body.method_code);
      const timeOptionCode = helpers.strOrNull(req.body.time_option_code);

      // map code -> id
      const paymentId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_payments',
        code: paymentCode,
      });

      const deliveryTypeId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_delivery_types',
        code: methodCode,
      });

      const timeOptionId = await pickIdByCodeOrFirstActive({
        tenantId,
        storeId,
        table: 'order_time_options',
        code: timeOptionCode,
      });

      if (!paymentId) return res.status(500).json({ ok: false, error: 'NO_PAYMENTS' });
      if (!deliveryTypeId) return res.status(500).json({ ok: false, error: 'NO_METHODS' });
      if (!timeOptionId) return res.status(500).json({ ok: false, error: 'NO_TIME_OPTIONS' });

      const [deliveryTypeRows] = await db.query(
        `SELECT require_client_data
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, storeId, deliveryTypeId]
      );
      const selectedDeliveryType = Array.isArray(deliveryTypeRows) ? deliveryTypeRows[0] : null;
      const requireClientData = Number(selectedDeliveryType?.require_client_data ?? 1) !== 0;

      // customer data:
      let customerId = authCustomer?.id || null;

      let customerName = helpers.strOrNull(req.body.customer_name);
      let customerPhone = helpers.normalizePhone(req.body.customer_phone);

      if (authCustomer) {
        customerPhone = authCustomer.phone; // РЎвЂљР ВµР В»Р ВµРЎвЂћР С•Р Р… Р Р…Р Вµ Р СР ВµР Р…РЎРЏР ВµР С
        if (!customerName) customerName = authCustomer.name || (requireClientData ? '\u041a\u043b\u0438\u0435\u043d\u0442' : null);
      } else {
        if (requireClientData && !customerPhone) return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
        if (!customerName) customerName = requireClientData ? '\u041a\u043b\u0438\u0435\u043d\u0442' : null;
      }

      // ensure customer exists if not authed
      if (!customerId && customerPhone) {
        const [ex] = await db.query(
          `SELECT id FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 1`,
          [tenantId, customerPhone]
        );
        if (ex.length) {
          customerId = Number(ex[0].id);
          // Р С•Р В±Р Р…Р С•Р Р†Р С‘Р С Р С‘Р СРЎРЏ Р ВµРЎРѓР В»Р С‘ Р С—РЎР‚Р С‘РЎв‚¬Р В»Р С•
          if (customerName) {
            await db.query(
              `UPDATE cust_customers SET name=? WHERE tenant_id=? AND id=?`,
              [customerName, tenantId, customerId]
            );
          }
        } else {
          const [ins] = await db.query(
            `INSERT INTO cust_customers
             (tenant_id, name, phone, is_active, registration_date)
             VALUES (?,?,?,?, CURDATE())`,
            [tenantId, customerName, customerPhone, 1]
          );
          customerId = Number(ins.insertId);
        }
      }

      // product_ids РЎвЂљР С•Р В»РЎРЉР С”Р С• РЎС“ Р С•Р В±РЎвЂ№РЎвЂЎР Р…РЎвЂ№РЎвЂ¦ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†; Р С”Р С•Р СР В±Р С• Р С—РЎР‚Р С‘РЎвЂ¦Р С•Р Т‘РЎРЏРЎвЂљ РЎРѓ type === 'combo'
      const ids = items
        .filter(it => it.type !== 'combo')
        .map(it => Number(it.product_id))
        .filter(n => Number.isFinite(n) && n > 0);
      const hasCombos = items.some(it => it.type === 'combo');
      if (!ids.length && !hasCombos) return res.status(400).json({ ok: false, error: 'BAD_ITEMS' });

      // availability check for products (stock + ingredients) РІР‚вЂќ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р ВµРЎРѓР В»Р С‘ Р Р† Р В·Р В°Р С”Р В°Р В·Р Вµ Р ВµРЎРѓРЎвЂљРЎРЉ Р С•Р В±РЎвЂ№РЎвЂЎР Р…РЎвЂ№Р Вµ РЎвЂљР С•Р Р†Р В°РЎР‚РЎвЂ№
      if (ids.length) {
        const [availability] = await db.query(
          `SELECT p.id,
              CASE
                WHEN (s.qty IS NULL OR s.qty > 0) AND NOT EXISTS (
                  SELECT 1
                  FROM prod_product_ingredients i
                  JOIN prod_product_stocks si
                    ON si.tenant_id=i.tenant_id AND si.store_id=? AND si.product_id=i.ingredient_id
                  WHERE i.tenant_id=p.tenant_id AND i.product_id=p.id
                    AND si.qty IS NOT NULL AND si.qty <= 0
                ) AND NOT EXISTS (
                  SELECT 1
                  FROM prod_option_assignments oa
                  JOIN prod_option_groups og
                    ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                  WHERE oa.tenant_id=p.tenant_id
                    AND oa.assign_type='product' AND oa.assign_id=p.id
                    AND oa.is_active=1
                    AND og.is_active=1
                    AND COALESCE(og.out_of_stock_action, 1)=0
                    AND NOT EXISTS (
                      SELECT 1
                      FROM prod_option_items oi
                      JOIN prod_products op
                        ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                      LEFT JOIN prod_product_stocks ops
                        ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                      WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                        AND oi.target_type='product'
                        AND oi.is_active=1
                        AND op.is_active=1
                        AND op.site_visibility=1
                        AND (ops.qty IS NULL OR ops.qty > 0)
                        AND NOT EXISTS (
                          SELECT 1
                          FROM prod_product_ingredients ip
                          JOIN prod_product_stocks ips
                            ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                          WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                            AND ips.qty IS NOT NULL AND ips.qty <= 0
                        )
                    )
                )
                THEN 1 ELSE 0
              END AS is_available
           FROM prod_products p
           LEFT JOIN prod_product_stocks s
             ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
           WHERE p.tenant_id=? AND p.id IN (${ids.map(() => '?').join(',')})`,
          [storeId, storeId, storeId, storeId, tenantId, ...ids]
        );

        const foundIds = new Set(availability.map(r => Number(r.id)));
        const notAvailable = availability.some(r => Number(r.is_available || 0) !== 1);
        const missing = ids.some((id) => !foundIds.has(Number(id)));
        if (notAvailable || missing) {
          return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
        }
      }

      let byId = new Map();
      if (ids.length) {
        const [products] = await db.query(
          `SELECT id, name, price, old_price, photos_json, unit_id, base_unit_id, base_qty, cost_price
           FROM prod_products
           WHERE tenant_id=? AND id IN (${ids.map(() => '?').join(',')})`,
          [tenantId, ...ids]
        );
        byId = new Map(products.map(p => [Number(p.id), p]));
      }

      const [autoAddRows] = await db.query(
        `SELECT i.*
         FROM prod_auto_add_items i
         JOIN prod_auto_add_groups g
           ON g.tenant_id=i.tenant_id AND g.id=i.group_id
         WHERE i.tenant_id=? AND i.is_active=1 AND g.is_active=1`,
        [tenantId]
      );
      const autoRulesByProduct = new Map(autoAddRows.map(r => [Number(r.product_id), r]));

      function calcAutoFreeQty(rule, baseTotal) {
        let freeQty = Math.max(0, Number(rule.free_first_qty || 0));
        const amountStep = Number(rule.free_per_amount || 0);
        const stepQty = Math.max(0, Number(rule.free_per_amount_qty || 0));
        if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
          freeQty += Math.floor(baseTotal / amountStep) * stepQty;
        }
        const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
        if (maxFree != null && Number.isFinite(maxFree)) {
          freeQty = Math.min(freeQty, Math.max(0, maxFree));
        }
        return freeQty;
      }

      let nonAutoItemsTotal = 0;
      for (const it of items) {
        if (it.type === 'combo') {
          const lineTotalFromRequest = Number(it.line_total);
          if (Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0) {
            nonAutoItemsTotal += roundPrice(lineTotalFromRequest);
          }
          continue;
        }
        const pid = Number(it.product_id);
        const p = byId.get(pid);
        if (!p) continue;
        if (autoRulesByProduct.has(pid)) continue;
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const basePrice = Number(p.price || 0);
        const lineTotalFromRequest = Number(it.line_total);
        const useLineTotalFromRequest = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0;
        const lineTotalRaw = useLineTotalFromRequest ? lineTotalFromRequest : basePrice * qty;
        const lineTotal = roundPrice(lineTotalRaw);
        nonAutoItemsTotal += lineTotal;
      }

      // ============ Р В Р С’Р РЋР В§Р вЂўР Сћ Р РЋР С™Р ВР вЂќР С›Р С™ ============
      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В° (Р С—РЎР‚Р С‘Р Р†РЎРЏР В·Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р Р…Р В°Р С—РЎР‚РЎРЏР СРЎС“РЎР‹ Р С‘Р В»Р С‘ РЎвЂЎР ВµРЎР‚Р ВµР В· Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘)
      let orderDiscountAmount = 0;
      const appliedDiscounts = [];
      
      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С”Р В°РЎвЂљР ВµР С–Р С•РЎР‚Р С‘Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р† Р Т‘Р В»РЎРЏ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р С‘ РЎРѓР С”Р С‘Р Т‘Р С•Р С”
      const productCategoriesMap = new Map();
      if (ids.length) {
        const catPlaceholders = ids.map(() => '?').join(',');
        const [catRows] = await db.query(
          `SELECT product_id, category_id FROM prod_product_categories
           WHERE tenant_id = ? AND product_id IN (${catPlaceholders})`,
          [tenantId, ...ids]
        );
        for (const cr of catRows) {
          const pid = Number(cr.product_id);
          if (!productCategoriesMap.has(pid)) productCategoriesMap.set(pid, []);
          productCategoriesMap.get(pid).push(Number(cr.category_id));
        }
      }

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р В°Р С”РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р Вµ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р Т‘Р В»РЎРЏ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В° Р С‘ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р†
      const customerCategoryIds = customerId
        ? await discountHelpers.getCustomerCategoryIds(db, tenantId, customerId)
        : [];
      const customerBenefitDiscountRows = customerId
        ? await loadCustomerBenefitDiscountRows(tenantId, storeId, customerId)
        : [];
      const automaticBenefitDiscountRows = customerBenefitDiscountRows.filter((discount) => isPublicAutomaticSimpleDiscount(discount));
      const availableBenefitDiscounts = customerId
        ? await discountHelpers.getActiveDiscountsForCustomer(db, tenantId, storeId, customerId)
        : [];
      const selectedDiscountId = normalizeSelectedDiscountId(req.body.selected_discount_id);
      const selectedDiscountSource = normalizeCheckoutDiscountSource(req.body.selected_discount_source)
        || (selectedDiscountId !== null ? 'discount' : null);
      const promoCode = normalizeOrderPromoCode(req.body.promo_code);
      const selectedPromoSource = normalizeCheckoutPromoSource(req.body.selected_promo_source)
        || (promoCode ? 'promo_code' : null);
      const selectedPromoRewardId = normalizeSelectedDiscountId(req.body.selected_promo_reward_id);
      const availableRewardRows = customerId
        ? await loadCustomerAvailableRewardRows(tenantId, customerId)
        : [];
      const availableRewardDiscountRows = availableRewardRows.filter((row) => publicDiscountText(row?.reward_type).toLowerCase() === 'discount');
      const availableRewardPromoRows = availableRewardRows.filter((row) => publicDiscountText(row?.reward_type).toLowerCase() === 'promo_code');
      const benefitDiscountTargetsById = await loadDiscountTargetRowsMap(
        tenantId,
        availableBenefitDiscounts.map((discount) => Number(discount?.id || 0))
      );
      const discountEntries = [];
      for (const discount of availableBenefitDiscounts) {
        const discountId = Number(discount?.id || 0);
        discountEntries.push({
          source: 'discount',
          selectionId: discountId,
          rewardId: null,
          discount,
          targetRows: benefitDiscountTargetsById.get(discountId) || [],
          rewardRow: null,
        });
      }
      for (const rewardRow of availableRewardDiscountRows) {
        const rewardSource = buildPublicRewardDiscountSource(rewardRow);
        const rewardId = Number(rewardRow?.id || 0) || null;
        discountEntries.push({
          source: 'reward_discount',
          selectionId: rewardId,
          rewardId,
          discount: rewardSource.discount,
          targetRows: rewardSource.targetRows || [],
          rewardRow,
        });
      }
      const { entry: selectedDiscountEntry, errorCode: selectedDiscountResolveError } = resolveSelectedCheckoutDiscountEntry({
        selectedDiscountId,
        selectedDiscountSource,
        discountEntries,
        allDiscountRows: automaticBenefitDiscountRows,
      });
      const selectedDiscount = selectedDiscountEntry?.discount || null;
      const selectedRewardDiscountRow = publicDiscountText(selectedDiscountEntry?.source).toLowerCase() === 'reward_discount'
        ? selectedDiscountEntry?.rewardRow || null
        : null;
      if (selectedDiscountId !== null && !selectedDiscount) {
        return res.status(409).json({ ok: false, error: selectedDiscountResolveError || 'DISCOUNT_INVALID' });
      }
      const customerDiscounts = [];
      await ensureDiscountProductConfigColumn();
      
      // Р СљР В°Р С—Р В° РЎРѓР С”Р С‘Р Т‘Р С•Р С” Р Т‘Р В»РЎРЏ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р† (product_id -> discount)
      const productDiscountMap = new Map();
      
      // Р вЂќР В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р С–Р С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚РЎРЏР ВµР С Р С—РЎР‚Р С‘Р СР ВµР Р…Р С‘Р СРЎвЂ№Р Вµ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘
      for (const pid of ids) {
        const categoryIds = productCategoriesMap.get(pid) || [];
        const productDiscounts = await discountHelpers.getActiveDiscountsForProduct(
          db,
          tenantId,
          storeId,
          pid,
          categoryIds,
          customerDiscounts
        );
        
        if (productDiscounts.length > 0) {
          // Р вЂР ВµРЎР‚Р ВµР С Р В»РЎС“РЎвЂЎРЎв‚¬РЎС“РЎР‹ РЎРѓР С”Р С‘Р Т‘Р С”РЎС“ (РЎРѓ Р Р…Р В°Р С‘Р Р†РЎвЂ№РЎРѓРЎв‚¬Р С‘Р С Р С—РЎР‚Р С‘Р С•РЎР‚Р С‘РЎвЂљР ВµРЎвЂљР С•Р С)
          productDiscountMap.set(pid, productDiscounts);
        }
      }

      const normItems = [];
      let total = 0;

      // Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµР С Р Р†РЎРѓР Вµ option_item_ids Р Т‘Р В»РЎРЏ Р С—Р С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘РЎРЏ Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘Р С‘ Р С‘Р В· Р вЂР вЂќ
      const allOptionItemIds = [];
      for (const it of items) {
        const optionIds = Array.isArray(it.option_item_ids) ? it.option_item_ids : [];
        optionIds.forEach(id => {
          const numId = Number(id);
          if (Number.isFinite(numId) && numId > 0 && !allOptionItemIds.includes(numId)) {
            allOptionItemIds.push(numId);
          }
        });
      }

      // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ Р С•Р В± Р С•Р С—РЎвЂ Р С‘РЎРЏРЎвЂ¦ Р С‘Р В· Р вЂР вЂќ
      const optionItemsMap = new Map();
      if (allOptionItemIds.length) {
        const placeholders = allOptionItemIds.map(() => '?').join(',');
        const [optionRows] = await db.query(
          `SELECT 
            i.id,
            i.price_mode,
            i.price_value,
            p.id AS product_id,
            p.name AS product_name,
            p.price AS product_price,
            CASE
              WHEN p.id IS NULL THEN 0
              WHEN (ps.qty IS NULL OR ps.qty > 0) AND NOT EXISTS (
                SELECT 1
                FROM prod_product_ingredients pi
                JOIN prod_product_stocks psi
                  ON psi.tenant_id=pi.tenant_id AND psi.store_id=? AND psi.product_id=pi.ingredient_id
                WHERE pi.tenant_id=p.tenant_id AND pi.product_id=p.id
                  AND psi.qty IS NOT NULL AND psi.qty <= 0
              ) AND NOT EXISTS (
                SELECT 1
                FROM prod_option_assignments oa
                JOIN prod_option_groups og
                  ON og.tenant_id=oa.tenant_id AND og.id=oa.group_id
                WHERE oa.tenant_id=p.tenant_id
                  AND oa.assign_type='product' AND oa.assign_id=p.id
                  AND oa.is_active=1
                  AND og.is_active=1
                  AND COALESCE(og.out_of_stock_action, 1)=0
                  AND NOT EXISTS (
                    SELECT 1
                    FROM prod_option_items oi
                    JOIN prod_products op
                      ON op.tenant_id=oi.tenant_id AND op.id=oi.target_product_id
                    LEFT JOIN prod_product_stocks ops
                      ON ops.tenant_id=op.tenant_id AND ops.store_id=? AND ops.product_id=op.id
                    WHERE oi.tenant_id=oa.tenant_id AND oi.group_id=oa.group_id
                      AND oi.target_type='product'
                      AND oi.is_active=1
                      AND op.is_active=1
                      AND op.site_visibility=1
                      AND (ops.qty IS NULL OR ops.qty > 0)
                      AND NOT EXISTS (
                        SELECT 1
                        FROM prod_product_ingredients ip
                        JOIN prod_product_stocks ips
                          ON ips.tenant_id=ip.tenant_id AND ips.store_id=? AND ips.product_id=ip.ingredient_id
                        WHERE ip.tenant_id=op.tenant_id AND ip.product_id=op.id
                          AND ips.qty IS NOT NULL AND ips.qty <= 0
                      )
                  )
              )
              THEN 1 ELSE 0
            END AS is_available
          FROM prod_option_items i
          LEFT JOIN prod_products p 
            ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
          LEFT JOIN prod_product_stocks ps
            ON ps.tenant_id = p.tenant_id AND ps.store_id = ? AND ps.product_id = p.id
          WHERE i.tenant_id=? AND i.id IN (${placeholders}) AND i.is_active=1`,
          [storeId, storeId, storeId, storeId, tenantId, ...allOptionItemIds]
        );

        if (optionRows.some((row) => Number(row.is_available || 0) !== 1)) {
          return res.status(409).json({ ok: false, error: 'OUT_OF_STOCK' });
        }

        optionRows.forEach((row) => {
          let optionPrice = 0;
          if (row.price_mode === 'fixed') {
            optionPrice = Number(row.price_value || 0);
          } else if (row.price_mode === 'from_target' || row.price_mode === 'delta') {
            optionPrice = Number(row.product_price || 0);
            if (row.price_mode === 'delta') {
              optionPrice += Number(row.price_value || 0);
            }
          }

          optionItemsMap.set(Number(row.id), {
            id: Number(row.id),
            title: row.product_name || '',
            price: optionPrice,
            target_product_id: row.product_id != null ? Number(row.product_id) : null,
          });
        });
        }

      for (const it of items) {
        if (it.type === 'combo') {
          const qty = Math.max(1, Number(it.qty || it.quantity || 1));
          const lineTotalFromRequest = Number(it.line_total);
          const lineTotal = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0
            ? roundPrice(lineTotalFromRequest)
            : roundPrice(0);
          total += lineTotal;
          const oldLineTotalFromRequest = Number(it.old_line_total) || 0;
          const selections = Array.isArray(it.selections) ? it.selections : [];
          const photos = [];
          selections.forEach((s) => {
            if (s.product_photo) photos.push(s.product_photo);
          });
          normItems.push({
            type: 'combo',
            combo_id: it.combo_id,
            name: it.combo_title || '\u041a\u043e\u043c\u0431\u043e',
            qty,
            price: qty > 0 ? roundPrice(lineTotal / qty) : 0,
            old_price: oldLineTotalFromRequest > 0 && qty > 0 ? roundPrice(oldLineTotalFromRequest / qty) : 0,
            line_total: lineTotal,
            old_line_total: oldLineTotalFromRequest,
            photos,
            selections: selections.map((s) => ({
              product_id: s.product_id,
              product_name: s.product_name,
              product_photo: s.product_photo,
              variant_group_id: s.variant_group_id != null ? Number(s.variant_group_id) : undefined,
              variant_value_index: s.variant_value_index != null ? Number(s.variant_value_index) : undefined,
              unit_id: s.unit_id != null ? Number(s.unit_id) : undefined,
              variant_label: s.variant_label,
              variant_group_title: s.variant_group_title,
              variant_unit: s.variant_unit,
              ingredients_display: Array.isArray(s.ingredients_display)
                ? s.ingredients_display.map((ing) => ({
                    ingredient_id: ing.ingredient_id != null ? Number(ing.ingredient_id) : undefined,
                    product_id: ing.product_id != null ? Number(ing.product_id) : undefined,
                    quantity: ing.quantity != null ? Number(ing.quantity) : undefined,
                    qty: ing.qty != null ? Number(ing.qty) : undefined,
                    unit: ing.unit,
                    unit_id: ing.unit_id != null ? Number(ing.unit_id) : undefined,
                    name: ing.name,
                  }))
                : [],
            })),
            auto_add: 0,
          });
          continue;
        }

        const pid = Number(it.product_id);
        const qty = Math.max(1, Number(it.qty || it.quantity || 1));
        const p = byId.get(pid);
        if (!p) continue;

        const basePrice = Number(p.price || 0);
        const oldPrice = Number(p.old_price || 0);

        // Р вЂ™Р С’Р вЂ“Р СњР С›: Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С line_total Р С‘Р В· Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В° (РЎС“Р В¶Р Вµ Р С—Р С•РЎРѓРЎвЂЎР С‘РЎвЂљР В°Р Р… Р Р…Р В° РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР Вµ)
        // Р СњР Вµ Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С РЎвЂ Р ВµР Р…РЎС“ Р В·Р В°Р Р…Р С•Р Р†Р С•, РЎвЂЎРЎвЂљР С•Р В±РЎвЂ№ Р С‘Р В·Р В±Р ВµР В¶Р В°РЎвЂљРЎРЉ Р Т‘Р Р†Р С•Р в„–Р Р…Р С•Р С–Р С• Р С—Р С•Р Т‘РЎРѓРЎвЂЎР ВµРЎвЂљР В° Р В±Р В°Р В·Р С•Р Р†Р С•Р в„– РЎвЂ Р ВµР Р…РЎвЂ№
        const lineTotalFromRequest = Number(it.line_total);
        const useLineTotalFromRequest = Number.isFinite(lineTotalFromRequest) && lineTotalFromRequest >= 0;

        // Р С›Р В±РЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С Р С•Р С—РЎвЂ Р С‘Р С‘ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Т‘Р В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ РЎРѓР С•РЎРѓРЎвЂљР В°Р Р†Р В°, Р Р…Р Вµ Р Т‘Р В»РЎРЏ Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР ВµРЎвЂљР В° РЎвЂ Р ВµР Р…РЎвЂ№)
        const options = [];
        
        // Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµР С Р С•Р С—РЎвЂ Р С‘Р С‘: Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С option_items Р С‘Р В· Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В° (РЎРѓ qty), Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ, Р С‘Р Р…Р В°РЎвЂЎР Вµ option_item_ids
        const optionItemsFromRequest = Array.isArray(it.option_items) && it.option_items.length > 0
          ? it.option_items
          : [];
        const optionIdsFromRequest = Array.isArray(it.option_item_ids) ? it.option_item_ids : [];
        
        // Р РЋР С•Р В·Р Т‘Р В°Р ВµР С map Р Т‘Р В»РЎРЏ Р В±РЎвЂ№РЎРѓРЎвЂљРЎР‚Р С•Р С–Р С• Р С—Р С•Р С‘РЎРѓР С”Р В° qty Р С‘ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р† Р С‘Р В· Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В°
        const qtyMap = new Map();
        const optionVariantsMap = new Map(); // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ Р Т‘Р В»РЎРЏ Р С”Р В°Р В¶Р Т‘Р С•Р в„– Р С•Р С—РЎвЂ Р С‘Р С‘
        optionItemsFromRequest.forEach(opt => {
          const id = Number(opt.id);
          if (Number.isFinite(id) && id > 0) {
            qtyMap.set(id, Math.max(1, Number(opt.qty || opt.quantity || 1)));
            // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р С• Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР Вµ Р С•Р С—РЎвЂ Р С‘Р С‘, Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
            if (opt.variant_group_id != null && opt.variant_value_index != null) {
              optionVariantsMap.set(id, {
                variant_group_id: Number(opt.variant_group_id),
                variant_value_index: Number(opt.variant_value_index),
                variant_label: str(opt.variant_label || ""),
                variant_price_diff: Number(opt.variant_price_diff || 0),
              });
            }
          }
        });

        // Р С›Р В±РЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С Р С•Р С—РЎвЂ Р С‘Р С‘: Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С option_item_ids Р С”Р В°Р С” Р С•РЎРѓР Р…Р С•Р Р†Р Р…Р С•Р в„– РЎРѓР С—Р С‘РЎРѓР С•Р С”
        const allOptionIds = new Set();
        optionItemsFromRequest.forEach(opt => {
          const id = Number(opt.id);
          if (Number.isFinite(id) && id > 0) allOptionIds.add(id);
        });
        optionIdsFromRequest.forEach(id => {
          const numId = Number(id);
          if (Number.isFinite(numId) && numId > 0) allOptionIds.add(numId);
        });

        for (const optId of allOptionIds) {
          const optInfo = optionItemsMap.get(optId);
          if (!optInfo) continue; // Р СџРЎР‚Р С•Р С—РЎС“РЎРѓР С”Р В°Р ВµР С Р С•Р С—РЎвЂ Р С‘Р С‘, Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№РЎвЂ¦ Р Р…Р ВµРЎвЂљ Р Р† Р вЂР вЂќ

          const optQty = qtyMap.get(optId) || 1; // Р С™Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С• Р С‘Р В· Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В° Р С‘Р В»Р С‘ 1 Р С—Р С• РЎС“Р СР С•Р В»РЎвЂЎР В°Р Р…Р С‘РЎР‹
          const optPrice = optInfo.price; // Р В¦Р ВµР Р…Р В° Р Р†РЎРѓР ВµР С–Р Т‘Р В° Р С‘Р В· Р вЂР вЂќ
          // Р СњР вЂў Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С” optionsTotal - РЎвЂ Р ВµР Р…Р В° РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† line_total

          const optionEntry = {
            id: optId,
            title: optInfo.title,
            price: optPrice,
            qty: optQty,
            target_product_id: optInfo.target_product_id || undefined,
          };
          
          // Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р Т‘Р В°Р Р…Р Р…РЎвЂ№Р Вµ Р С• Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР Вµ Р С•Р С—РЎвЂ Р С‘Р С‘, Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
          const optVariant = optionVariantsMap.get(optId);
          if (optVariant) {
            optionEntry.variant_group_id = optVariant.variant_group_id;
            optionEntry.variant_value_index = optVariant.variant_value_index;
            optionEntry.variant_label = optVariant.variant_label;
            optionEntry.variant_price_diff = optVariant.variant_price_diff;
          }

          options.push(optionEntry);
        }

        // Р С›Р В±РЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С Р С‘Р Р…Р С–РЎР‚Р ВµР Т‘Р С‘Р ВµР Р…РЎвЂљРЎвЂ№ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Т‘Р В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ РЎРѓР С•РЎРѓРЎвЂљР В°Р Р†Р В°, Р Р…Р Вµ Р Т‘Р В»РЎРЏ Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР ВµРЎвЂљР В° РЎвЂ Р ВµР Р…РЎвЂ№)
        const ingredients = [];
        
        const cartIngredients = Array.isArray(it.ingredients) ? it.ingredients : [];
        if (cartIngredients.length) {
          // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ Р С•Р В± Р С‘Р Р…Р С–РЎР‚Р ВµР Т‘Р С‘Р ВµР Р…РЎвЂљР В°РЎвЂ¦ Р С‘Р В· Р вЂР вЂќ
          const ingIds = cartIngredients.map(ci => Number(ci.ingredient_id)).filter(n => Number.isFinite(n) && n > 0);
          if (ingIds.length) {
            const [ingRows] = await db.query(
              `SELECT
                i.id,
                i.ingredient_id,
                i.unit_id,
                i.price_override,
                p.price AS ingredient_price,
                p.name AS ingredient_name,
                p.base_unit_id AS ingredient_base_unit_id,
                p.base_qty AS ingredient_base_qty,
                u.short_title AS unit_short_title,
                u.title AS unit_title,
                u.code AS unit_code
              FROM prod_product_ingredients i
              JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
              LEFT JOIN prod_units u ON u.id=i.unit_id AND u.tenant_id=i.tenant_id
              WHERE i.tenant_id=? AND i.product_id=? AND i.ingredient_id IN (${ingIds.map(() => '?').join(',')})`,
              [tenantId, pid, ...ingIds]
            );

            const ingMap = new Map(ingRows.map(r => [Number(r.ingredient_id), r]));
            
            // Р В¤РЎС“Р Р…Р С”РЎвЂ Р С‘РЎРЏ Р Т‘Р В»РЎРЏ Р С—Р С•Р В»РЎС“РЎвЂЎР ВµР Р…Р С‘РЎРЏ РЎвЂћР В°Р С”РЎвЂљР С•РЎР‚Р В° Р С”Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘Р С‘ Р СР ВµР В¶Р Т‘РЎС“ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р В°Р СР С‘
            async function getConversionFactor(fromUnitId, toUnitId, productIdForPul = null) {
              if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
              
              // Р СџРЎР‚РЎРЏР СР В°РЎРЏ Р С”Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ Р С‘Р В· prod_unit_conversions
              const [direct] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, fromUnitId, toUnitId]
              );
              if (direct.length && direct[0].factor) return Number(direct[0].factor);
              
              // Р С›Р В±РЎР‚Р В°РЎвЂљР Р…Р В°РЎРЏ Р С”Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ
              const [inverse] = await db.query(
                `SELECT factor FROM prod_unit_conversions 
                 WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1 LIMIT 1`,
                [tenantId, toUnitId, fromUnitId]
              );
              if (inverse.length && inverse[0].factor) return 1 / Number(inverse[0].factor);
              
              // Р С™Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР В°РЎвЂ Р С‘РЎРЏ РЎвЂЎР ВµРЎР‚Р ВµР В· prod_product_unit_links (Р ВµРЎРѓР В»Р С‘ РЎС“Р С”Р В°Р В·Р В°Р Р… product_id)
              if (productIdForPul) {
                const [pul] = await db.query(
                  `SELECT factor FROM prod_product_unit_links
                   WHERE tenant_id=? AND product_id=? AND base_unit_id=? AND unit_id=? LIMIT 1`,
                  [tenantId, productIdForPul, toUnitId, fromUnitId]
                );
                if (pul.length && pul[0].factor) return Number(pul[0].factor);
              }
              
              return null;
            }
            
            for (const cartIng of cartIngredients) {
              const ingId = Number(cartIng.ingredient_id);
              const ingQtyRaw = Number(cartIng.qty ?? cartIng.quantity ?? 0);
              if (!Number.isFinite(ingQtyRaw)) continue;
              const ingQty = Math.max(0, ingQtyRaw);
              const ingInfo = ingMap.get(ingId);
              if (!ingInfo) continue;

              // Р СџР ВµРЎР‚Р ВµР Р†Р С•Р Т‘Р С‘Р С quantity Р Р† Р В±Р В°Р В·Р С•Р Р†РЎС“РЎР‹ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р С‘Р В·Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ
              let qtyInBase = ingQty;
              const ingredientBaseQty = ingInfo.ingredient_base_qty != null && Number(ingInfo.ingredient_base_qty) > 0 
                ? Number(ingInfo.ingredient_base_qty) 
                : 1;
              const ingredientUnitId = Number(ingInfo.unit_id || 0);
              const ingredientBaseUnitId = Number(ingInfo.ingredient_base_unit_id || 0);
              
              // Р вЂўРЎРѓР В»Р С‘ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р В° Р С‘Р В·Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ Р С‘Р Р…Р С–РЎР‚Р ВµР Т‘Р С‘Р ВµР Р…РЎвЂљР В° Р С•РЎвЂљР В»Р С‘РЎвЂЎР В°Р ВµРЎвЂљРЎРѓРЎРЏ Р С•РЎвЂљ Р В±Р В°Р В·Р С•Р Р†Р С•Р в„–, Р С”Р С•Р Р…Р Р†Р ВµРЎР‚РЎвЂљР С‘РЎР‚РЎС“Р ВµР С
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId) {
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  qtyInBase = ingQty * factor;
                }
              }

              // Р В Р В°РЎРѓРЎРѓРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С РЎвЂ Р ВµР Р…РЎС“ РЎРѓ РЎС“РЎвЂЎР ВµРЎвЂљР С•Р С base_qty
              let ingPricePerUnit = 0;
              
              if (ingInfo.price_override != null) {
                // Р вЂўРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ price_override - Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Р ВµР С–Р С• Р С”Р В°Р С” РЎвЂ Р ВµР Р…РЎС“ Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† Р В±Р В°Р В·Р С•Р Р†Р С•Р в„– Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ Р С‘Р В·Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ
                ingPricePerUnit = Number(ingInfo.price_override);
              } else {
                // Р В Р В°РЎРѓРЎРѓРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С РЎвЂ Р ВµР Р…РЎС“ Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р С‘Р В· base_qty
                const ingredientPrice = Number(ingInfo.ingredient_price || 0);
                
                if (ingredientBaseQty > 0 && ingredientPrice > 0) {
                  // Р В¦Р ВµР Р…Р В° Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ (Р Р† Р В±Р В°Р В·Р С•Р Р†Р С•Р в„– Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ) = РЎвЂ Р ВµР Р…Р В° РЎвЂљР С•Р Р†Р В°РЎР‚Р В° / base_qty
                  ingPricePerUnit = ingredientPrice / ingredientBaseQty;
                } else if (ingredientPrice > 0) {
                  ingPricePerUnit = ingredientPrice;
                }
              }
              
              // Р ВРЎвЂљР С•Р С–Р С•Р Р†Р В°РЎРЏ РЎвЂ Р ВµР Р…Р В° Р С‘Р Р…Р С–РЎР‚Р ВµР Т‘Р С‘Р ВµР Р…РЎвЂљР В° = РЎвЂ Р ВµР Р…Р В° Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ * Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†Р С• (Р Р† Р В±Р В°Р В·Р С•Р Р†Р С•Р в„– Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ)
              // Р СњР вЂў Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С” ingredientsTotal - РЎвЂ Р ВµР Р…Р В° РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† line_total
              const ingTotal = ingPricePerUnit * qtyInBase;

              // Р вЂќР В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ: price Р Т‘Р С•Р В»Р В¶Р Р…Р В° Р В±РЎвЂ№РЎвЂљРЎРЉ РЎвЂ Р ВµР Р…Р С•Р в„– Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† РЎвЂљР С•Р в„– Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ Р С‘Р В·Р СР ВµРЎР‚Р ВµР Р…Р С‘РЎРЏ, Р Р† Р С”Р С•РЎвЂљР С•РЎР‚Р С•Р в„– РЎС“Р С”Р В°Р В·Р В°Р Р…Р С• quantity
              // ingPricePerUnit - РЎРЊРЎвЂљР С• РЎвЂ Р ВµР Р…Р В° Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† Р В±Р В°Р В·Р С•Р Р†Р С•Р в„– Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ (base_unit_id)
              // quantity (ingQty) РЎС“Р С”Р В°Р В·Р В°Р Р…Р С• Р Р† unit_id
              // Р СњРЎС“Р В¶Р Р…Р С• Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР С‘РЎвЂљР В°РЎвЂљРЎРЉ РЎвЂ Р ВµР Р…РЎС“ Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Т‘Р В»РЎРЏ unit_id
              let priceForDisplay = ingPricePerUnit;
              
              // Р вЂўРЎРѓР В»Р С‘ quantity Р Р† РЎвЂљР С•Р в„– Р В¶Р Вµ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ Р Вµ, РЎвЂЎРЎвЂљР С• Р С‘ Р В±Р В°Р В·Р С•Р Р†Р В°РЎРЏ, price РЎС“Р В¶Р Вµ Р С—РЎР‚Р В°Р Р†Р С‘Р В»РЎРЉР Р…РЎвЂ№Р в„–
              if (ingredientUnitId && ingredientBaseUnitId && ingredientUnitId !== ingredientBaseUnitId && ingQty > 0) {
                // Р вЂўРЎРѓР В»Р С‘ Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎвЂ№ РЎР‚Р В°Р В·Р Р…РЎвЂ№Р Вµ, Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С РЎвЂ Р ВµР Р…РЎС“ Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† unit_id
                const factor = await getConversionFactor(ingredientUnitId, ingredientBaseUnitId, ingId);
                if (factor != null && factor > 0) {
                  // priceForDisplay = РЎвЂ Р ВµР Р…Р В° Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† unit_id
                  // Р вЂўРЎРѓР В»Р С‘ quantity Р Р† unit_id, Р В° РЎвЂ Р ВµР Р…Р В° Р В·Р В° Р ВµР Т‘Р С‘Р Р…Р С‘РЎвЂ РЎС“ Р Р† base_unit_id = ingPricePerUnit,
                  // РЎвЂљР С• РЎвЂ Р ВµР Р…Р В° Р В·Р В° unit_id = ingPricePerUnit * factor
                  // (Р С—Р С•РЎвЂљР С•Р СРЎС“ РЎвЂЎРЎвЂљР С• 1 unit_id = factor * base_unit_id)
                  priceForDisplay = ingPricePerUnit * factor;
                }
              }

              // Р С’Р В»РЎРЉРЎвЂљР ВµРЎР‚Р Р…Р В°РЎвЂљР С‘Р Р†Р Р…РЎвЂ№Р в„– РЎР‚Р В°РЎРѓРЎвЂЎР ВµРЎвЂљ: Р ВµРЎРѓР В»Р С‘ total РЎС“Р В¶Р Вµ Р С—Р С•РЎРѓРЎвЂЎР С‘РЎвЂљР В°Р Р…, Р СР С•Р В¶Р Р…Р С• Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљРЎРЉ Р ВµР С–Р С•
              // priceForDisplay = ingTotal / ingQty (Р ВµРЎРѓР В»Р С‘ ingQty > 0)
              if (ingQty > 0 && ingTotal > 0) {
                priceForDisplay = ingTotal / ingQty;
              }

              ingredients.push({
                ingredient_id: ingId,
                name: ingInfo.ingredient_name || '',
                quantity: ingQty,
                unit_id: ingredientUnitId || undefined,
                price: priceForDisplay,
                total: ingTotal,
                unit_label: ingInfo.unit_short_title || ingInfo.unit_title || ingInfo.unit_code || '',
              });
            }
          }
        }

        // Р С›Р В±РЎР‚Р В°Р В±Р В°РЎвЂљРЎвЂ№Р Р†Р В°Р ВµР С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ (РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Т‘Р В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ РЎРѓР С•РЎРѓРЎвЂљР В°Р Р†Р В°, Р Р…Р Вµ Р Т‘Р В»РЎРЏ Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР ВµРЎвЂљР В° РЎвЂ Р ВµР Р…РЎвЂ№)
        let variantData = null;
        const variantGroupId = Number(it.variant_group_id);
        const variantValueIndex = Number(it.variant_value_index);
        const variantLabel = str(it.variant_label || "");
        
        if (variantGroupId && Number.isFinite(variantValueIndex)) {
          // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ Р С• Р С–РЎР‚РЎС“Р С—Р С—Р Вµ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р† Р С‘Р В· Р вЂР вЂќ
          const [variantGroupRows] = await db.query(
            `SELECT id, title, unit_id
             FROM prod_variant_groups
             WHERE tenant_id=? AND id=? AND is_active=1
             LIMIT 1`,
            [tenantId, variantGroupId]
          );
          
          if (variantGroupRows.length) {
            const vg = variantGroupRows[0];
            const groupTitle = str(vg.title || "");
            
            // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В°
            const [variantValuesRows] = await db.query(
              `SELECT \`values\`
               FROM prod_variant_groups
               WHERE tenant_id=? AND id=?
               LIMIT 1`,
              [tenantId, variantGroupId]
            );
            
            let variantValue = variantLabel;
            if (variantValuesRows.length && variantValuesRows[0].values) {
              try {
                const values = JSON.parse(variantValuesRows[0].values);
                if (Array.isArray(values) && values[variantValueIndex] != null) {
                  variantValue = String(values[variantValueIndex]);
                }
              } catch {}
            }
            
            // Р вЂўРЎРѓР В»Р С‘ variant_label РЎРѓР С•Р Т‘Р ВµРЎР‚Р В¶Р С‘РЎвЂљ "Р СњР В°Р В·Р Р†Р В°Р Р…Р С‘Р Вµ: Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ", Р С‘Р В·Р Р†Р В»Р ВµР С”Р В°Р ВµР С Р В·Р Р…Р В°РЎвЂЎР ВµР Р…Р С‘Р Вµ
            if (variantLabel.includes(":")) {
              const parts = variantLabel.split(":");
              if (parts.length > 1) {
                variantValue = parts.slice(1).join(":").trim();
              }
            }
            
            // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ Р Р…Р Вµ Р Т‘Р С•Р В±Р В°Р Р†Р В»РЎРЏРЎР‹РЎвЂљ Р Т‘Р С•Р С—Р В»Р В°РЎвЂљРЎС“ - Р С•Р Р…Р С‘ Р С—Р ВµРЎР‚Р ВµРЎРѓРЎвЂЎР С‘РЎвЂљРЎвЂ№Р Р†Р В°РЎР‹РЎвЂљ РЎвЂ Р ВµР Р…РЎС“ Р С—РЎР‚Р С•Р С—Р С•РЎР‚РЎвЂ Р С‘Р С•Р Р…Р В°Р В»РЎРЉР Р…Р С• Р С”Р С•Р В»Р С‘РЎвЂЎР ВµРЎРѓРЎвЂљР Р†РЎС“
            // variant_unit_price РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† line_total, Р С—Р С•РЎРЊРЎвЂљР С•Р СРЎС“ price_diff Р Р†РЎРѓР ВµР С–Р Т‘Р В° 0
            variantData = {
              variant_group_id: variantGroupId,
              variant_value_index: variantValueIndex,
              group_title: groupTitle,
              unit_id: Number(vg.unit_id || 0) || undefined,
              value: variantValue,
              label: variantValue, // Р вЂќР В»РЎРЏ Р С•РЎвЂљР С•Р В±РЎР‚Р В°Р В¶Р ВµР Р…Р С‘РЎРЏ
              price_diff: 0, // Р вЂ™Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ Р Р…Р Вµ Р С‘Р СР ВµРЎР‹РЎвЂљ Р Т‘Р С•Р С—Р В»Р В°РЎвЂљРЎвЂ№, РЎвЂ Р ВµР Р…Р В° РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† variant_unit_price
            };
          }
        }

        // Р ВРЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С line_total Р С‘Р В· Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В° (РЎС“Р В¶Р Вµ Р С—Р С•РЎРѓРЎвЂЎР С‘РЎвЂљР В°Р Р… Р Р…Р В° РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР Вµ)
        // Р вЂўРЎРѓР В»Р С‘ line_total Р Р…Р Вµ Р С—Р ВµРЎР‚Р ВµР Т‘Р В°Р Р…, Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Р В±Р В°Р В·Р С•Р Р†РЎС“РЎР‹ РЎвЂ Р ВµР Р…РЎС“ РЎвЂљР С•Р Р†Р В°РЎР‚Р В° (Р Т‘Р В»РЎРЏ РЎвЂљР С•Р Р†Р В°РЎР‚Р С•Р Р† Р В±Р ВµР В· Р С•Р С—РЎвЂ Р С‘Р в„–/Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР С•Р Р†/РЎРѓР С•РЎРѓРЎвЂљР В°Р Р†Р В°)
        const autoRule = autoRulesByProduct.get(pid);
        let unitPrice = basePrice;
        let paidQty = qty;
        let lineTotal = useLineTotalFromRequest ? lineTotalFromRequest : basePrice * qty;
        if (autoRule) {
          unitPrice = autoRule.price_override != null ? Number(autoRule.price_override) : basePrice;
          const freeQty = calcAutoFreeQty(autoRule, nonAutoItemsTotal);
          paidQty = Math.max(0, qty - freeQty);
          lineTotal = paidQty * unitPrice;
        }

        unitPrice = roundPrice(unitPrice);
        if (autoRule) {
          lineTotal = roundPrice(unitPrice * paidQty);
        } else {
          lineTotal = roundPrice(useLineTotalFromRequest ? lineTotalFromRequest : unitPrice * paidQty);
        }

        // Р В Р В°РЎРѓРЎвЂЎР ВµРЎвЂљ РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р Т‘Р В»РЎРЏ РЎвЂљР С•Р Р†Р В°РЎР‚Р В°
        // Р СњР вЂў Р С—РЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С РЎРѓР С”Р С‘Р Т‘Р С”РЎС“ Р ВµРЎРѓР В»Р С‘:
        // - line_total РЎС“Р В¶Р Вµ Р С—Р ВµРЎР‚Р ВµР Т‘Р В°Р Р… РЎРѓ РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР В° (РЎРѓР С”Р С‘Р Т‘Р С”Р В° РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† РЎвЂ Р ВµР Р…Р Вµ)
        // - РЎРЊРЎвЂљР С• auto-add РЎвЂљР С•Р Р†Р В°РЎР‚
        let itemDiscountAmount = 0;
        let itemAppliedDiscount = null;
        const productDiscountCandidates = Array.isArray(productDiscountMap.get(pid))
          ? productDiscountMap.get(pid)
          : [];
        const productDiscount = productDiscountCandidates.find((candidate) => (
          matchDiscountTargetScope(
            buildDiscountProductTargetSets(candidate?.targetRows || []),
            {
              type: 'product',
              product_id: pid,
              option_items: options,
              ingredients,
              variant_group_id: variantData?.variant_group_id ?? null,
              variant_value_index: variantData?.variant_value_index ?? null,
            },
            productCategoriesMap,
            publicDiscountText(candidate?.apply_to).toLowerCase() || 'product'
          )
        )) || null;
        if (productDiscount && !autoRule && !useLineTotalFromRequest) {
          itemDiscountAmount = discountHelpers.calculateDiscount(
            lineTotal,
            productDiscount.discount_type,
            Number(productDiscount.discount_value),
            productDiscount.max_discount_amount ? Number(productDiscount.max_discount_amount) : null
          );
          if (itemDiscountAmount > 0) {
            itemAppliedDiscount = {
              discount_id: productDiscount.id,
              title: productDiscount.title,
              discount_type: productDiscount.discount_type,
              discount_value: Number(productDiscount.discount_value),
              discount_amount: itemDiscountAmount,
              apply_to: 'product',
              product_id: pid,
            };
            orderDiscountAmount += itemDiscountAmount;
            appliedDiscounts.push(itemAppliedDiscount);
          }
        } else if (productDiscount && !autoRule && useLineTotalFromRequest) {
          // Р вЂўРЎРѓР В»Р С‘ line_total Р С—Р ВµРЎР‚Р ВµР Т‘Р В°Р Р… РЎРѓ РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР В°, Р Р…Р С• Р ВµРЎРѓРЎвЂљРЎРЉ РЎРѓР С”Р С‘Р Т‘Р С”Р В° РІР‚вЂќ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ Р С• РЎРѓР С”Р С‘Р Т‘Р С”Р Вµ
          // Р В±Р ВµР В· Р С—Р С•Р Р†РЎвЂљР С•РЎР‚Р Р…Р С•Р С–Р С• РЎР‚Р В°РЎРѓРЎвЂЎРЎвЂРЎвЂљР В° (РЎРѓР С”Р С‘Р Т‘Р С”Р В° РЎС“Р В¶Р Вµ РЎС“РЎвЂЎРЎвЂљР ВµР Р…Р В° Р Р† line_total)
          const estimatedDiscount = discountHelpers.calculateDiscount(
            unitPrice * paidQty, // Р В¦Р ВµР Р…Р В° Р В±Р ВµР В· РЎРѓР С”Р С‘Р Т‘Р С”Р С‘
            productDiscount.discount_type,
            Number(productDiscount.discount_value),
            productDiscount.max_discount_amount ? Number(productDiscount.max_discount_amount) : null
          );
          if (estimatedDiscount > 0) {
            itemDiscountAmount = estimatedDiscount;
            orderDiscountAmount += estimatedDiscount;
            itemAppliedDiscount = {
              discount_id: productDiscount.id,
              title: productDiscount.title,
              discount_type: productDiscount.discount_type,
              discount_value: Number(productDiscount.discount_value),
              discount_amount: estimatedDiscount,
              apply_to: 'product',
              product_id: pid,
            };
            appliedDiscounts.push(itemAppliedDiscount);
          }
        }
        
        // Р вЂўРЎРѓР В»Р С‘ line_total Р С—Р ВµРЎР‚Р ВµР Т‘Р В°Р Р… РЎРѓ РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР В° - Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Р ВµР С–Р С• Р С”Р В°Р С” Р ВµРЎРѓРЎвЂљРЎРЉ (РЎРѓР С”Р С‘Р Т‘Р С”Р В° РЎС“Р В¶Р Вµ Р С—РЎР‚Р С‘Р СР ВµР Р…Р ВµР Р…Р В°)
        // Р ВР Р…Р В°РЎвЂЎР Вµ - Р Р†РЎвЂ№РЎвЂЎР С‘РЎвЂљР В°Р ВµР С РЎРѓР С”Р С‘Р Т‘Р С”РЎС“
        const lineTotalAfterDiscount = useLineTotalFromRequest ? lineTotal : roundPrice(lineTotal - itemDiscountAmount);
        total += lineTotalAfterDiscount;

        // Р СџР С•Р В»РЎС“РЎвЂЎР В°Р ВµР С РЎвЂћР С•РЎвЂљР С• РЎвЂљР С•Р Р†Р В°РЎР‚Р В° Р Т‘Р В»РЎРЏ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…Р ВµР Р…Р С‘РЎРЏ Р Р† Р В·Р В°Р С”Р В°Р В·Р Вµ
        let photos = [];
        try {
          if (p.photos_json) {
            const parsed = JSON.parse(p.photos_json);
            if (Array.isArray(parsed)) photos = parsed;
          }
        } catch {}

        const isGiftReward = Number(it?.is_gift_reward || 0) === 1;
        const giftRewardId = Number(it?.gift_reward_id || 0) > 0 ? Number(it.gift_reward_id) : null;
        const itemEntry = {
          product_id: pid,
          name: p.name,
          qty,
          price: isGiftReward ? 0 : unitPrice,
          old_price: oldPrice,
          line_total: lineTotalAfterDiscount,
          photos, // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С РЎвЂћР С•РЎвЂљР С• Р Т‘Р В»РЎРЏ Р С•РЎвЂљРЎвЂЎР ВµРЎвЂљР С•Р Р†
          options: options.length > 0 ? options : undefined, // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р С•Р С—РЎвЂ Р С‘Р С‘ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р ВµРЎРѓР В»Р С‘ Р С•Р Р…Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
          ingredients: ingredients.length > 0 ? ingredients : undefined, // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р С‘Р Р…Р С–РЎР‚Р ВµР Т‘Р С‘Р ВµР Р…РЎвЂљРЎвЂ№ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р ВµРЎРѓР В»Р С‘ Р С•Р Р…Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
          variants: variantData ? [variantData] : undefined, // Р РЋР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљРЎвЂ№ РЎвЂљР С•Р В»РЎРЉР С”Р С• Р ВµРЎРѓР В»Р С‘ Р С•Р Р…Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
          auto_add: Number(it.auto_add || 0) === 1 ? 1 : 0, // Р вЂќР В»РЎРЏ РЎРѓР С•РЎР‚РЎвЂљР С‘РЎР‚Р С•Р Р†Р С”Р С‘: Р В°Р Р†РЎвЂљР С•Р Т‘Р С•Р В±Р В°Р Р†Р В»Р ВµР Р…Р С‘РЎРЏ (Р С—РЎР‚Р С‘Р В±Р С•РЎР‚РЎвЂ№) Р Р† Р С”Р С•Р Р…Р ВµРЎвЂ  РЎРѓР С—Р С‘РЎРѓР С”Р В°
        };
        
        // Р вЂќР С•Р В±Р В°Р Р†Р В»РЎРЏР ВµР С Р С‘Р Р…РЎвЂћР С•РЎР‚Р СР В°РЎвЂ Р С‘РЎР‹ Р С• РЎРѓР С”Р С‘Р Т‘Р С”Р Вµ Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ
        if (isGiftReward) {
          itemEntry.is_gift_reward = 1;
          itemEntry.gift_reward_id = giftRewardId;
        }
        if (itemAppliedDiscount) {
          // original_line_total - РЎвЂ Р ВµР Р…Р В° Р Т‘Р С• РЎРѓР С”Р С‘Р Т‘Р С”Р С‘
          // Р ВРЎРѓР С—Р С•Р В»РЎРЉР В·РЎС“Р ВµР С Р С—Р ВµРЎР‚Р ВµР Т‘Р В°Р Р…Р Р…РЎвЂ№Р в„– original_line_total, Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ (РЎРѓ РЎС“РЎвЂЎРЎвЂРЎвЂљР С•Р С Р Р†Р В°РЎР‚Р С‘Р В°Р Р…РЎвЂљР В°)
          const originalLineTotalFromRequest = Number(it.original_line_total) || 0;
          const originalLineTotal = originalLineTotalFromRequest > 0
            ? roundPrice(originalLineTotalFromRequest)
            : (useLineTotalFromRequest 
                ? roundPrice(lineTotal + itemDiscountAmount) 
                : lineTotal);
          itemEntry.discount = {
            id: itemAppliedDiscount.discount_id,
            title: itemAppliedDiscount.title,
            amount: itemAppliedDiscount.discount_amount,
            original_line_total: originalLineTotal,
          };
        }
        
        normItems.push(itemEntry);
      }

      if (!normItems.length) return res.status(400).json({ ok: false, error: 'NO_PRODUCTS' });

      if (selectedDiscount) {
        const selectedDiscountOutcome = applySelectedDiscountToItems({
          discount: selectedDiscount,
          items: normItems,
          targetRows: Array.isArray(selectedDiscountEntry?.targetRows) ? selectedDiscountEntry.targetRows : [],
          productCategoriesMap,
          applyItemMeta: true,
          collectUsageRecords: true,
        });
        if (!selectedDiscountOutcome?.isApplicable) {
          return res.status(409).json({ ok: false, error: selectedDiscountOutcome?.errorCode || 'DISCOUNT_NOT_APPLICABLE' });
        }
        orderDiscountAmount += roundPrice(Number(selectedDiscountOutcome.discountAmount || 0));
        total = roundPrice(Number(selectedDiscountOutcome.itemsTotalAfterDiscount || total));
        normItems.length = 0;
        normItems.push(...selectedDiscountOutcome.items);
        appliedDiscounts.push(...(Array.isArray(selectedDiscountOutcome.usageRecords) ? selectedDiscountOutcome.usageRecords : []));
      }

      // Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ Р С”Р В»Р С‘Р ВµР Р…РЎвЂљР В° Р Р…Р В° Р Р†Р ВµРЎРѓРЎРЉ Р В·Р В°Р С”Р В°Р В· (Р ВµРЎРѓР В»Р С‘ Р ВµРЎРѓРЎвЂљРЎРЉ)
      const orderDiscountsForCustomer = await discountHelpers.getOrderDiscounts(
        db,
        tenantId,
        storeId,
        customerId,
        total,
        customerDiscounts
      );
      if (orderDiscountsForCustomer.length > 0) {
        // Р СџРЎР‚Р С‘Р СР ВµР Р…РЎРЏР ВµР С РЎРѓР С”Р С‘Р Т‘Р С”Р С‘ РЎРѓ РЎС“РЎвЂЎР ВµРЎвЂљР С•Р С is_stackable
        const { totalDiscount, appliedDiscounts: orderApplied } = discountHelpers.applyBestDiscounts(orderDiscountsForCustomer, total);
        if (totalDiscount > 0) {
          orderDiscountAmount += totalDiscount;
          total = roundPrice(total - totalDiscount);
          for (const od of orderApplied) {
            appliedDiscounts.push({
              discount_id: od.id,
              title: od.title,
              discount_type: od.discount_type,
              discount_value: Number(od.discount_value),
              discount_amount: od.discountAmount,
              apply_to: 'order',
            });
          }
        }
      }

      const selectedRewardPromoRow = selectedPromoSource === 'reward_promo'
        ? (availableRewardPromoRows.find((row) => Number(row?.id || 0) === Number(selectedPromoRewardId || 0)) || null)
        : null;

      if (promoCode) {
        if (selectedPromoSource === 'reward_promo') {
          if (!selectedRewardPromoRow) {
            return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
          }

          const rewardPayload = parsePublicRewardPayload(selectedRewardPromoRow);
          const rewardCode = normalizeOrderPromoCode(rewardPayload?.code || rewardPayload?.source_code);
          if (!rewardCode || rewardCode !== promoCode) {
            return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
          }

          const rewardPromoDiscount = {
            id: Number(rewardPayload?.source_discount_id || selectedRewardPromoRow?.discount_id || 0) || null,
            discount_id: Number(rewardPayload?.source_discount_id || selectedRewardPromoRow?.discount_id || 0) || null,
            title: publicDiscountText(rewardPayload?.title) || publicDiscountText(selectedRewardPromoRow?.discount_title),
            is_stackable: Number(rewardPayload?.is_stackable || 0) === 1 || rewardPayload?.is_stackable === true,
          };
          if (selectedDiscount && !canCombineCheckoutBenefits(selectedDiscount, rewardPromoDiscount)) {
            return res.status(409).json({ ok: false, error: 'BENEFITS_CONFLICT' });
          }

          const rewardPromoRuntime = getRewardPromoRuntimeConfig(rewardPayload);
          const rewardPromoMinOrderAmount = rewardPromoRuntime?.minOrderAmount != null
            ? Number(rewardPromoRuntime.minOrderAmount || 0)
            : 0;
          if (rewardPromoMinOrderAmount > 0 && roundPrice(total) < rewardPromoMinOrderAmount) {
            return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
          }
          const rewardPromoTargetRows = getRewardPayloadTargetRows(rewardPayload);
          const rewardPromoTargets = buildDiscountProductTargetSets(rewardPromoTargetRows);
          const rewardPromoMaxDiscountAmount = rewardPromoRuntime?.maxDiscountAmount != null
            ? Number(rewardPromoRuntime.maxDiscountAmount || 0)
            : null;
          const rewardPromoUsageSource = {
            discount_id: Number(rewardPayload?.source_discount_id || selectedRewardPromoRow?.discount_id || 0) || null,
            title: publicDiscountText(rewardPayload?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
            is_stackable: rewardPromoDiscount.is_stackable,
          };
          const rewardPromoUsageRow = {
            promo_code_id: null,
            code: publicDiscountText(rewardPayload?.code || rewardPayload?.source_code),
          };

          if (rewardPromoRuntime.rewardType === 'discount') {
            if (rewardPromoRuntime.applyTo === 'order') {
              const promoOrderDiscount = discountHelpers.calculateDiscount(
                total,
                rewardPromoRuntime.discountType,
                rewardPromoRuntime.discountValue,
                rewardPromoMaxDiscountAmount
              );
              if (!(promoOrderDiscount > 0)) {
                return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
              }
              total = roundPrice(total - promoOrderDiscount);
              orderDiscountAmount += promoOrderDiscount;
              appliedDiscounts.push(buildPromoUsageRecord(rewardPromoUsageSource, rewardPromoUsageRow, promoOrderDiscount, {
                apply_to: 'order',
                discount_type: rewardPromoRuntime.discountType,
                discount_value: rewardPromoRuntime.discountValue,
              }));
            } else {
              let rewardPromoItemsDiscount = 0;

              for (const item of normItems) {
                if (item.type === 'combo') continue;
                const matchesScope = matchDiscountTargetScope(
                  rewardPromoTargets,
                  item,
                  productCategoriesMap,
                  rewardPromoRuntime.applyTo
                );
                if (!matchesScope) continue;

                const baseLineTotal = roundPrice(Number(item.line_total || 0));
                const promoItemDiscount = discountHelpers.calculateDiscount(
                  baseLineTotal,
                  rewardPromoRuntime.discountType,
                  rewardPromoRuntime.discountValue,
                  rewardPromoMaxDiscountAmount
                );
                if (!(promoItemDiscount > 0)) continue;

                item.line_total = roundPrice(baseLineTotal - promoItemDiscount);
                mergeItemDiscountMeta(
                  item,
                  publicDiscountText(rewardPromoUsageSource?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
                  promoItemDiscount,
                  item.discount?.original_line_total || baseLineTotal
                );
                rewardPromoItemsDiscount += promoItemDiscount;
                appliedDiscounts.push(buildPromoUsageRecord(rewardPromoUsageSource, rewardPromoUsageRow, promoItemDiscount, {
                  apply_to: rewardPromoRuntime.applyTo,
                  discount_type: rewardPromoRuntime.discountType,
                  discount_value: rewardPromoRuntime.discountValue,
                  product_id: Number(item.product_id || 0) || null,
                }));
              }

              if (!(rewardPromoItemsDiscount > 0)) {
                return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
              }

              orderDiscountAmount += rewardPromoItemsDiscount;
              total = roundPrice(total - rewardPromoItemsDiscount);
            }
          } else if (rewardPromoRuntime.productRewardType === 'gift') {
            const rewardProductIds = [...rewardPromoTargets.productIds];
            if (!rewardProductIds.length) {
              return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
            }

            const [rewardProducts] = await db.query(
              `SELECT id, name, price, old_price, photos_json
                 FROM prod_products
                WHERE tenant_id = ? AND id IN (?) AND is_active = 1 AND site_visibility = 1`,
              [tenantId, rewardProductIds]
            );
            const rewardProductsById = new Map(
              (Array.isArray(rewardProducts) ? rewardProducts : []).map((row) => [Number(row?.id || 0), row])
            );

            let giftCount = 0;
            let giftDiscountAmount = 0;
            for (const rewardProductId of rewardProductIds) {
              const rewardProduct = rewardProductsById.get(Number(rewardProductId || 0));
              if (!rewardProduct) continue;
              giftCount += 1;
              giftDiscountAmount += Number(rewardProduct.price || 0);
              let photos = [];
              try {
                const parsedPhotos = JSON.parse(rewardProduct.photos_json || '[]');
                if (Array.isArray(parsedPhotos)) photos = parsedPhotos;
              } catch {}

              normItems.push({
                product_id: Number(rewardProduct.id || 0),
                name: rewardProduct.name,
                qty: 1,
                price: 0,
                old_price: Number(rewardProduct.price || rewardProduct.old_price || 0),
                line_total: 0,
                photos,
                auto_add: 1,
              });
            }

            if (!(giftCount > 0)) {
              return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
            }

            orderDiscountAmount += roundPrice(giftDiscountAmount);
            appliedDiscounts.push(buildPromoUsageRecord(rewardPromoUsageSource, rewardPromoUsageRow, giftDiscountAmount, {
              apply_to: 'gift',
            }));
          } else {
            let rewardItemsDiscount = 0;
            for (const item of normItems) {
              if (item.type === 'combo') continue;
              const matchesReward = matchDiscountTargetScope(
                rewardPromoTargets,
                item,
                productCategoriesMap,
                'any'
              );
              if (!matchesReward) continue;

              const baseLineTotal = roundPrice(Number(item.line_total || 0));
              const rewardDiscount = discountHelpers.calculateDiscount(
                baseLineTotal,
                rewardPromoRuntime.discountType,
                rewardPromoRuntime.discountValue,
                rewardPromoMaxDiscountAmount
              );
              if (!(rewardDiscount > 0)) continue;

              item.line_total = roundPrice(baseLineTotal - rewardDiscount);
              mergeItemDiscountMeta(
                item,
                publicDiscountText(rewardPromoUsageSource?.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
                rewardDiscount,
                item.discount?.original_line_total || baseLineTotal
              );
              rewardItemsDiscount += rewardDiscount;
              appliedDiscounts.push(buildPromoUsageRecord(rewardPromoUsageSource, rewardPromoUsageRow, rewardDiscount, {
                apply_to: 'product',
                discount_type: rewardPromoRuntime.discountType,
                discount_value: rewardPromoRuntime.discountValue,
                product_id: Number(item.product_id || 0) || null,
              }));
            }

            if (!(rewardItemsDiscount > 0)) {
              return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
            }

            orderDiscountAmount += rewardItemsDiscount;
            total = roundPrice(total - rewardItemsDiscount);
          }
        } else {
          const [[promoRow]] = await db.query(
          `SELECT pc.id AS promo_code_id, pc.discount_id, pc.code, pc.code_mode, pc.is_active AS promo_is_active,
                  pc.usage_limit AS promo_usage_limit, pc.usage_count AS promo_usage_count, pc.assigned_customer_id,
                  d.*
             FROM mkt_discount_promo_codes pc
             INNER JOIN mkt_discounts d
               ON d.id = pc.discount_id
              AND d.tenant_id = pc.tenant_id
              AND (d.store_id = pc.store_id OR d.store_id = 0 OR d.store_id IS NULL)
            WHERE pc.tenant_id = ?
              AND (pc.store_id = ? OR pc.store_id = 0 OR pc.store_id IS NULL)
              AND UPPER(REPLACE(pc.code, ' ', '')) = ?
            ORDER BY pc.store_id DESC, pc.id DESC
            LIMIT 1`,
          [tenantId, orderStoreId, promoCode]
        );

        if (!promoRow || !discountHelpers.isPromoSimpleDiscount(promoRow) || !discountHelpers.isDiscountActive(promoRow)) {
          return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
        }
        if (isPromoRewardRedeemAction(promoRow)) {
          return res.status(409).json({ ok: false, error: 'PROMO_INVALID' });
        }

        if (Number(promoRow.promo_is_active || 0) !== 1) {
          return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
        }

        if (Number(promoRow.promo_usage_limit || 0) > 0 && Number(promoRow.promo_usage_count || 0) >= Number(promoRow.promo_usage_limit || 0)) {
          return res.status(409).json({ ok: false, error: 'PROMO_LIMIT_REACHED' });
        }

        if (Number(promoRow.assigned_customer_id || 0) > 0 && Number(promoRow.assigned_customer_id || 0) !== Number(customerId || 0)) {
          return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
        }

        const [promoAudienceRows] = await db.query(
          `SELECT target_type, customer_id, customer_category_id
             FROM mkt_discount_customers
            WHERE tenant_id = ? AND discount_id = ?`,
          [tenantId, Number(promoRow.discount_id || 0)]
        );

        if (!discountHelpers.matchDiscountAudience(promoAudienceRows, customerId, customerCategoryIds)) {
          return res.status(409).json({ ok: false, error: 'PROMO_NOT_AVAILABLE' });
        }

        if (Number(promoRow.usage_per_customer || 0) > 0 && Number(customerId || 0) > 0) {
          const [[promoCustomerUsage]] = await db.query(
            `SELECT COUNT(*) AS usage_count
               FROM mkt_discount_usage
              WHERE tenant_id = ? AND discount_id = ? AND customer_id = ?`,
            [tenantId, Number(promoRow.discount_id || 0), Number(customerId || 0)]
          );
          if (Number(promoCustomerUsage?.usage_count || 0) >= Number(promoRow.usage_per_customer || 0)) {
            return res.status(409).json({ ok: false, error: 'PROMO_CUSTOMER_LIMIT_REACHED' });
          }
        }

        if (selectedDiscount && !canCombineCheckoutBenefits(selectedDiscount, promoRow)) {
          return res.status(409).json({ ok: false, error: 'BENEFITS_CONFLICT' });
        }

        const promoRuntime = getPromoRuntimeConfig(promoRow);
        const promoTargetRows = await loadDiscountTargetRows(db, tenantId, Number(promoRow.discount_id || 0));
        const promoTargets = buildDiscountProductTargetSets(promoTargetRows);
        const promoMinOrderAmount = promoRow?.min_order_amount != null ? Number(promoRow.min_order_amount || 0) : 0;
        if (promoMinOrderAmount > 0 && roundPrice(total) < promoMinOrderAmount) {
          return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
        }

        if (promoRuntime.rewardType === 'discount') {
          if (promoRuntime.applyTo === 'order') {
            const promoOrderDiscount = discountHelpers.calculateDiscount(
              total,
              promoRuntime.discountType,
              promoRuntime.discountValue,
              promoRow.max_discount_amount ? Number(promoRow.max_discount_amount) : null
            );
            if (!(promoOrderDiscount > 0)) {
              return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
            }
            total = roundPrice(total - promoOrderDiscount);
            orderDiscountAmount += promoOrderDiscount;
            appliedDiscounts.push(buildPromoUsageRecord(promoRow, promoRow, promoOrderDiscount, {
              apply_to: 'order',
              discount_type: promoRuntime.discountType,
              discount_value: promoRuntime.discountValue,
            }));
          } else {
            let promoItemsDiscount = 0;

            for (const item of normItems) {
              if (item.type === 'combo') continue;
              const matchesScope = matchDiscountTargetScope(
                promoTargets,
                item,
                productCategoriesMap,
                promoRuntime.applyTo
              );
              if (!matchesScope) continue;

              const baseLineTotal = roundPrice(Number(item.line_total || 0));
              const promoItemDiscount = discountHelpers.calculateDiscount(
                baseLineTotal,
                promoRuntime.discountType,
                promoRuntime.discountValue,
                promoRow.max_discount_amount ? Number(promoRow.max_discount_amount) : null
              );
              if (!(promoItemDiscount > 0)) continue;

              item.line_total = roundPrice(baseLineTotal - promoItemDiscount);
              mergeItemDiscountMeta(
                item,
                publicDiscountText(promoRow.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
                promoItemDiscount,
                item.discount?.original_line_total || baseLineTotal
              );
              promoItemsDiscount += promoItemDiscount;
              appliedDiscounts.push(buildPromoUsageRecord(promoRow, promoRow, promoItemDiscount, {
                apply_to: promoRuntime.applyTo,
                discount_type: promoRuntime.discountType,
                discount_value: promoRuntime.discountValue,
                product_id: Number(item.product_id || 0) || null,
              }));
            }

            if (!(promoItemsDiscount > 0)) {
              return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
            }

            orderDiscountAmount += promoItemsDiscount;
            total = roundPrice(total - promoItemsDiscount);
          }
        } else if (promoRuntime.productRewardType === 'gift') {
          const rewardProductIds = [...promoTargets.productIds];
          if (!rewardProductIds.length) {
            return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
          }

          const [rewardProducts] = await db.query(
            `SELECT id, name, price, old_price, photos_json
               FROM prod_products
              WHERE tenant_id = ? AND id IN (?) AND is_active = 1 AND site_visibility = 1`,
            [tenantId, rewardProductIds]
          );

          const rewardProductsById = new Map(
            (Array.isArray(rewardProducts) ? rewardProducts : []).map((row) => [Number(row?.id || 0), row])
          );

          let giftCount = 0;
          let giftDiscountAmount = 0;
          for (const rewardProductId of rewardProductIds) {
            const rewardProduct = rewardProductsById.get(Number(rewardProductId || 0));
            if (!rewardProduct) continue;
            giftCount += 1;
            giftDiscountAmount += Number(rewardProduct.price || 0);
            let photos = [];
            try {
              const parsedPhotos = JSON.parse(rewardProduct.photos_json || '[]');
              if (Array.isArray(parsedPhotos)) photos = parsedPhotos;
            } catch {}

            normItems.push({
              product_id: Number(rewardProduct.id || 0),
              name: rewardProduct.name,
              qty: 1,
              price: 0,
              old_price: Number(rewardProduct.price || rewardProduct.old_price || 0),
              line_total: 0,
              photos,
              auto_add: 1,
            });
          }

          if (!(giftCount > 0)) {
            return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
          }

          orderDiscountAmount += roundPrice(giftDiscountAmount);
          appliedDiscounts.push(buildPromoUsageRecord(promoRow, promoRow, giftDiscountAmount, {
            apply_to: 'gift',
          }));
        } else {
          let rewardItemsDiscount = 0;
          for (const item of normItems) {
            if (item.type === 'combo') continue;
            const matchesReward = matchDiscountTargetScope(
              promoTargets,
              item,
              productCategoriesMap,
              'any'
            );
            if (!matchesReward) continue;

            const baseLineTotal = roundPrice(Number(item.line_total || 0));
            const rewardDiscount = discountHelpers.calculateDiscount(
              baseLineTotal,
              promoRuntime.discountType,
              promoRuntime.discountValue,
              promoRow.max_discount_amount ? Number(promoRow.max_discount_amount) : null
            );
            if (!(rewardDiscount > 0)) continue;

            item.line_total = roundPrice(baseLineTotal - rewardDiscount);
            mergeItemDiscountMeta(
              item,
              publicDiscountText(promoRow.title) || '\u041f\u0440\u043e\u043c\u043e\u043a\u043e\u0434',
              rewardDiscount,
              item.discount?.original_line_total || baseLineTotal
            );
            rewardItemsDiscount += rewardDiscount;
            appliedDiscounts.push(buildPromoUsageRecord(promoRow, promoRow, rewardDiscount, {
              apply_to: 'product',
              discount_type: promoRuntime.discountType,
              discount_value: promoRuntime.discountValue,
              product_id: Number(item.product_id || 0) || null,
            }));
          }

          if (!(rewardItemsDiscount > 0)) {
            return res.status(409).json({ ok: false, error: 'PROMO_NOT_APPLICABLE' });
          }

          orderDiscountAmount += rewardItemsDiscount;
          total = roundPrice(total - rewardItemsDiscount);
        }
        }
      }

      const rewardUsageIds = [
        Number(selectedRewardDiscountRow?.id || 0),
        selectedPromoSource === 'reward_promo' ? Number(selectedRewardPromoRow?.id || 0) : 0,
      ].filter((id) => Number.isInteger(id) && id > 0);
      const benefitNormItems = normItems.filter((item) => Number(item?.is_gift_reward || 0) !== 1);
      const loyaltyProgressUpdates = customerId
        ? customerBenefitDiscountRows
            .filter((discount) => normalizePublicMechanicType(discount?.mechanic_type) === 'loyalty_progress')
          .map((discount) => {
              const mechanic = parsePublicDiscountObject(discount?.mechanic_config_json, {});
              return {
                discountId: Number(discount?.id || 0),
                increment: computeCheckoutLoyaltyProgressIncrement(discount, benefitNormItems, productCategoriesMap),
                thresholdValue: Number(mechanic?.threshold_value || 0),
                rewardQty: getPublicProgressRewardQty(mechanic),
                pendingRewardMode: normalizePublicProgressPendingRewardMode(mechanic?.pending_reward_mode),
              };
            })
            .filter((entry) => entry.discountId > 0 && Number(entry.increment || 0) > 0)
        : [];

      const discountsJson = appliedDiscounts.length > 0 ? JSON.stringify(appliedDiscounts) : null;

      const itemsJson = JSON.stringify(normItems);
      let deliveryCost = 0;
      const isDeliveryMethod = str(methodCode).trim() === 'delivery';
      const deliveryAddressId = (isDeliveryMethod && Number.isFinite(Number(req.body.delivery_address_id)) && Number(req.body.delivery_address_id) > 0)
        ? Number(req.body.delivery_address_id)
        : null;
      if (isDeliveryMethod) {
        let resolvedDeliveryAddress = null;
        if (deliveryAddressId && authCustomer) {
          resolvedDeliveryAddress = await loadSharedCustomerAddressById({
            db,
            helpers,
            tenantId,
            customerId: authCustomer.id,
            addressId: deliveryAddressId,
          });
          if (!resolvedDeliveryAddress) {
            return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
          }
        }

        const inlineAddressResult = normalizeSharedCustomerAddressPayload(helpers, {
          city: req.body.delivery_address_city,
          street: req.body.delivery_address_street,
          house: req.body.delivery_address_house,
          entrance: req.body.delivery_address_entrance,
          floor: req.body.delivery_address_floor,
          apartment: req.body.delivery_address_apartment,
          comment: req.body.address_comment,
          address_ref: req.body.delivery_address_ref,
          selected_object_type: req.body.delivery_selected_object_type,
          resolved_city_source_key: req.body.delivery_resolved_city_source_key,
          address_context_locality: req.body.delivery_address_context_locality,
          address_normalized_display: req.body.delivery_address_normalized_display || req.body.delivery_address,
          lat: req.body.delivery_address_lat,
          lng: req.body.delivery_address_lng,
          delivery_zone_id: req.body.delivery_zone_id,
          delivery_store_id: req.body.delivery_store_id,
        });
        if (!inlineAddressResult.ok) {
          return res.status(400).json({ ok: false, error: inlineAddressResult.error });
        }

        const deliveryQuote = await buildDeliveryQuote({
          db,
          tenantId,
          storeId,
          subtotal: total,
          address: resolvedDeliveryAddress || inlineAddressResult.data,
        });

        const minOrderAmount = Number(deliveryQuote.min_order_amount || 0);

        if (minOrderAmount > 0 && total < minOrderAmount) {
          return res.status(409).json({ ok: false, error: 'MIN_ORDER', min_order_amount: minOrderAmount });
        }

        deliveryCost = Number(deliveryQuote.delivery_cost || 0);
        if (deliveryQuote.delivery_store_id != null && Number.isFinite(Number(deliveryQuote.delivery_store_id))) {
          orderStoreId = Number(deliveryQuote.delivery_store_id);
        }

        total += deliveryCost;
      }

      // Timezone РЎвЂћР С‘Р В»Р С‘Р В°Р В»Р В°, Р С” Р С”Р С•РЎвЂљР С•РЎР‚Р С•Р СРЎС“ Р С—РЎР‚Р С‘Р Р†РЎРЏР В·Р В°Р Р… Р В·Р В°Р С”Р В°Р В· (orderStoreId)
      const storeTimezone = await getStoreTimezone(tenantId, orderStoreId);

      // Р С’Р Т‘РЎР‚Р ВµРЎРѓ Р С‘ РЎвЂљР С•РЎвЂЎР С”Р В° РЎРѓР В°Р СР С•Р Р†РЎвЂ№Р Р†Р С•Р В·Р В° Р Р…РЎС“Р В¶Р Р…РЎвЂ№ Р Т‘Р В»РЎРЏ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С”Р С‘ Р Т‘РЎС“Р В±Р В»РЎРЏ (РЎвЂЎР С‘РЎвЂљР В°Р ВµР С Р Т‘Р С• Р Р…Р ВµРЎвЂ)
      const deliveryAddress = helpers.strOrNull(req.body.delivery_address);
      const pickupStoreId = Number.isFinite(Number(req.body.pickup_store_id)) ? Number(req.body.pickup_store_id) : null;
      const addrForDup = (deliveryAddress && String(deliveryAddress).trim()) ? String(deliveryAddress).trim() : '';
      const pickupIdForDup = (pickupStoreId && Number.isFinite(pickupStoreId)) ? pickupStoreId : 0;

      // Р РЋР ВµРЎР‚Р Р†Р ВµРЎР‚Р Р…Р В°РЎРЏ Р В·Р В°РЎвЂ°Р С‘РЎвЂљР В° Р С•РЎвЂљ Р Т‘РЎС“Р В±Р В»Р ВµР в„– (Р Т‘Р Р†Р С•Р в„–Р Р…Р В°РЎРЏ Р С•РЎвЂљР С—РЎР‚Р В°Р Р†Р С”Р В° / Р С—Р С•Р Р†РЎвЂљР С•РЎР‚ Р В·Р В°Р С—РЎР‚Р С•РЎРѓР В°). Р С›Р С”Р Р…Р С• 60 РЎРѓР ВµР С”.
      // created_at Р Р† Р вЂР вЂќ РЎвЂ¦РЎР‚Р В°Р Р…Р С‘РЎвЂљРЎРѓРЎРЏ Р Р† UTC РІР‚вЂќ РЎРѓРЎР‚Р В°Р Р†Р Р…Р С‘Р Р†Р В°Р ВµР С РЎвЂљР С•Р В¶Р Вµ Р Р† UTC.
      const forceNew = req.body.force_new === true || req.body.force_new === 'true';
      if (!forceNew) {
        const dupThresholdStr = helpers.formatUtcDateTime(Date.now() - 60000);
        const [recentDup] = await db.query(
          `SELECT id, public_id, total_price
           FROM order_orders
           WHERE tenant_id=? AND store_id=? AND is_active=1
             AND customer_phone=?
             AND total_price=?
             AND items=?
             AND COALESCE(address, '') = ?
             AND COALESCE(pickup_store_id, 0) = ?
             AND created_at >= ?
           ORDER BY id DESC
           LIMIT 1`,
          [tenantId, orderStoreId, customerPhone, total, itemsJson, addrForDup, pickupIdForDup, dupThresholdStr]
        );
        if (recentDup.length) {
          const dup = recentDup[0];
          return res.json({
            ok: true,
            data: {
              id: dup.id,
              public_id: dup.public_id,
              duplicate: true,
              needConfirmation: true,
              existingOrder: { id: dup.id, public_id: dup.public_id, total_price: dup.total_price }
            }
          });
        }
      }

      const statusId = await getActiveStatusIdDefault(tenantId, orderStoreId);
      if (!statusId) return res.status(500).json({ ok: false, error: 'NO_STATUSES' });

      const addrLine = (str(methodCode).trim() === 'delivery') ? deliveryAddress : null;

      const comment = helpers.strOrNull(req.body.comment);
      const addressComment = helpers.strOrNull(req.body.address_comment);
      const promoCodeForOrder = promoCode || null;

      const cutleryQty = Math.max(0, Number(req.body.cutlery_qty || 0));
      const changeFrom = Number.isFinite(Number(req.body.change_from)) ? Number(req.body.change_from) : null;

      const scheduledAt = helpers.strOrNull(req.body.scheduled_at) || null;

      const publicId = makeUuid36();

      // created_at Р Р† Р вЂР вЂќ РЎРѓР С•РЎвЂ¦РЎР‚Р В°Р Р…РЎРЏР ВµР С РЎвЂљР С•Р В»РЎРЉР С”Р С• Р Р† UTC.
      const createdAt = helpers.formatUtcDateTime(Date.now());
      let stockDeductedAt = null;
      let stockDocumentId = null;
      let stockChangedProductIds = [];

      let orderId = null;
      if (customerId && (rewardUsageIds.length || loyaltyProgressUpdates.length)) {
        await ensureDiscountRuntimeTables();
      }
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        if (stockDeductMode === 'on_create') {
          const deductionResult = await applyStockDeductionForOrderItems({
            db: conn,
            tenantId,
            storeId: orderStoreId,
            items: normItems,
            publicId,
            createdBy: null,
          });
          stockDeductedAt = deductionResult?.stockDeductedAt || null;
          stockDocumentId = deductionResult?.stockDocumentId || null;
          stockChangedProductIds = Array.from(
            new Set(
              (Array.isArray(deductionResult?.deductions) ? deductionResult.deductions : [])
                .map((d) => Number(d?.productId))
                .filter((id) => Number.isFinite(id) && id > 0)
            )
          );
        } else {
          const stockCheck = await checkStockAvailabilityForOrderItems({
            db: conn,
            tenantId,
            storeId: orderStoreId,
            items: normItems,
          });
          if (!stockCheck.available) {
            const stockErr = new Error('OUT_OF_STOCK');
            stockErr.code = 'OUT_OF_STOCK';
            stockErr.shortages = stockCheck.shortages || [];
            throw stockErr;
          }
        }

        // Р вЂ™Р С’Р вЂ“Р СњР С›: Р Р…Р С‘Р С”Р В°Р С”Р С‘РЎвЂ¦ updated_at РЎвЂљРЎС“РЎвЂљ Р Р…Р ВµРЎвЂљ (Р Р† РЎвЂљР Р†Р С•Р ВµР в„– РЎвЂљР В°Р В±Р В»Р С‘РЎвЂ Р Вµ order_orders Р ВµР С–Р С• Р Р…Р ВµРЎвЂљ)
        const [r] = await conn.query(
          `INSERT INTO order_orders
           (tenant_id, store_id, customer_id, customer_name, customer_phone, promo_code,
            address, delivery_address_id, pickup_store_id, comment, address_comment, cutlery_qty, change_from,
            items, total_price, delivery_cost, discount_amount, discounts_json,
            delivery_type_id, payment_id, time_option_id,
            status_id, status_sort, scheduled_at, created_at, stock_deducted_at, stock_document_id,
            created_via, is_active, public_id)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'web', 1, ?)`,
          [
            tenantId,
            orderStoreId,
            customerId,
            customerName,
            customerPhone,
            promoCodeForOrder,
            addrLine,
            deliveryAddressId,
            pickupStoreId,
            comment,
            addressComment,
            cutleryQty,
            changeFrom,
            itemsJson,
            total,
            deliveryCost,
            orderDiscountAmount,
            discountsJson,
            deliveryTypeId,
            paymentId,
            timeOptionId,
            statusId,
            0, // status_sort
            scheduledAt,
            createdAt,
            stockDeductedAt,
            stockDocumentId,
            publicId,
          ]
        );

        orderId = Number(r.insertId || 0);

        if (stockDocumentId) {
          await conn.query(
            `UPDATE prod_stock_documents
             SET number=?, comment=?
             WHERE tenant_id=? AND store_id=? AND id=?`,
            [
              `ORD-${orderId}`,
              `\u0410\u0432\u0442\u043e\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443 #${orderId} (${publicId})`,
              tenantId,
              orderStoreId,
              stockDocumentId,
            ]
          );
        }

        if (rewardUsageIds.length && customerId) {
          await conn.query(
            `UPDATE mkt_discount_rewards
                SET status = 'used', used_at = NOW(), updated_at = NOW()
              WHERE tenant_id = ?
                AND customer_id = ?
                AND status = 'available'
                AND id IN (?)`,
            [tenantId, customerId, rewardUsageIds]
          );
        }

        if (loyaltyProgressUpdates.length && customerId) {
          const [existingProgressRows] = await conn.query(
            `SELECT discount_id, progress_value, pending_reward_count
               FROM mkt_discount_progress
              WHERE tenant_id = ? AND customer_id = ? AND discount_id IN (?)`,
            [tenantId, customerId, loyaltyProgressUpdates.map((entry) => entry.discountId)]
          );
          const existingProgressMap = new Map(
            (Array.isArray(existingProgressRows) ? existingProgressRows : []).map((row) => [
              Number(row?.discount_id || 0),
              row,
            ])
          );

          for (const progressUpdate of loyaltyProgressUpdates) {
            const discountId = Number(progressUpdate?.discountId || 0);
            if (!(discountId > 0)) continue;
            const currentRow = existingProgressMap.get(discountId) || null;
            const currentProgressValue = Number(currentRow?.progress_value || 0);
            const currentPendingRewardCount = Number(currentRow?.pending_reward_count || 0);
            const increment = Number(progressUpdate?.increment || 0);
            const thresholdValue = Number(progressUpdate?.thresholdValue || 0);
            const rewardQty = getPublicProgressRewardQty({ reward_qty: progressUpdate?.rewardQty });
            const pendingRewardMode = normalizePublicProgressPendingRewardMode(progressUpdate?.pendingRewardMode);
            let nextProgressValue = currentProgressValue;
            let nextPendingRewardCount = currentPendingRewardCount;

            if (!(pendingRewardMode === 'single_pending' && currentPendingRewardCount > 0)) {
              const rawNextProgressValue = roundPromoMoney(currentProgressValue + increment);
              const completedBefore = thresholdValue > 0 ? Math.floor(currentProgressValue / thresholdValue) : 0;
              const completedAfter = thresholdValue > 0 ? Math.floor(rawNextProgressValue / thresholdValue) : 0;
              const gainedThresholds = Math.max(0, completedAfter - completedBefore);
              const gainedRewards = gainedThresholds * rewardQty;

              nextProgressValue = rawNextProgressValue;
              nextPendingRewardCount = Math.max(0, currentPendingRewardCount + gainedRewards);

              if (pendingRewardMode === 'single_pending' && gainedThresholds > 0 && thresholdValue > 0) {
                nextProgressValue = Math.min(rawNextProgressValue, thresholdValue);
              }
            }

            await conn.query(
              `INSERT INTO mkt_discount_progress
               (tenant_id, customer_id, discount_id, progress_value, pending_reward_count)
               VALUES (?, ?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE
                 progress_value = VALUES(progress_value),
                 pending_reward_count = VALUES(pending_reward_count),
                 updated_at = NOW()`,
              [
                tenantId,
                customerId,
                discountId,
                nextProgressValue,
                nextPendingRewardCount,
              ]
            );
          }
        }

        await conn.commit();
      } catch (txErr) {
        await conn.rollback();
        conn.release();
        if (txErr && txErr.code === 'OUT_OF_STOCK') {
          return res.status(409).json({
            ok: false,
            error: 'OUT_OF_STOCK',
            data: { shortages: Array.isArray(txErr.shortages) ? txErr.shortages : [] },
          });
        }
        throw txErr;
      }
      conn.release();

      // Р вЂ”Р В°Р С—Р С‘РЎРѓРЎвЂ№Р Р†Р В°Р ВµР С Р С‘РЎРѓР С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°Р Р…Р С‘Р Вµ РЎРѓР С”Р С‘Р Т‘Р С•Р С”
      res.json({ ok: true, data: { id: orderId, public_id: publicId } });

      // Heavy post-actions run in background, response is already sent.
      setImmediate(async () => {
        try {
          const usageMap = new Map();
          for (const appliedDiscount of appliedDiscounts) {
            const discountId = Number(appliedDiscount?.discount_id || 0);
            if (!(discountId > 0)) continue;
            const promoCodeId = Number(appliedDiscount?.promo_code_id || 0) || 0;
            const key = `${discountId}:${promoCodeId}`;
            const usageRecord = usageMap.get(key) || {
              discount_id: discountId,
              promo_code_id: promoCodeId || null,
              discount_amount: 0,
            };
            usageRecord.discount_amount += Number(appliedDiscount?.discount_amount || 0);
            usageMap.set(key, usageRecord);
          }

          for (const usageRecord of usageMap.values()) {
            try {
              await discountHelpers.recordDiscountUsage(
                db,
                tenantId,
                usageRecord.discount_id,
                orderId,
                customerId,
                usageRecord.discount_amount,
                usageRecord.promo_code_id || null
              );
            } catch (discountErr) {
              console.error('Failed to record discount usage:', discountErr);
            }
          }

          const payload = await fetchOrderPayload(tenantId, orderStoreId, orderId, { storeTimezone });

          if (payload) {
            if (ordersEvents && typeof ordersEvents.publish === 'function') {
              ordersEvents.publish(tenantId, orderStoreId, 'order.created', payload);
            }
            const botToken = getEffectiveTelegramBotConfig().telegram_bot_token;
            if (botToken) {
              sendNewOrderNotification(tenantId, orderStoreId, payload, { db, botToken }).catch((err) =>
                console.error('Telegram new order notify:', err)
              );
            }
            sendOrderToPrintBot({ db, order: payload, tenantId, storeId: orderStoreId }).catch(() => {});
          }

          if (stockChangedProductIds.length) {
            publishStockChanged(tenantId, orderStoreId, {
              source: 'order.create',
              order_id: orderId,
              product_ids: stockChangedProductIds,
            });
          }
        } catch (postErr) {
          console.error('Order post-actions error:', postErr);
        }
      });

      return;
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });


  // ------------------------------
  // Auto-add items config (public)
  // ------------------------------
  router.get('/auto-add', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [groupRows] = await db.query(
        `SELECT id, title, description, sort_order,
                min_cart_amount, max_cart_amount, include_auto_in_total,
                max_items_qty, allow_customer_qty, allow_customer_remove
         FROM prod_auto_add_groups
         WHERE tenant_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      const groups = groupRows.map((g) => ({
        id: Number(g.id),
        title: g.title,
        description: g.description,
        sort_order: Number(g.sort_order || 0),
        min_cart_amount: g.min_cart_amount != null ? Number(g.min_cart_amount) : null,
        max_cart_amount: g.max_cart_amount != null ? Number(g.max_cart_amount) : null,
        include_auto_in_total: Number(g.include_auto_in_total || 0),
        max_items_qty: g.max_items_qty != null ? Number(g.max_items_qty) : null,
        allow_customer_qty: Number(g.allow_customer_qty ?? 1),
        allow_customer_remove: Number(g.allow_customer_remove ?? 1),
      }));

      const [rows] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.old_price AS product_old_price,
                p.photos_json AS product_photos_json,
                p.base_unit_id AS product_base_unit_id,
                p.unit_id AS product_unit_id,
                p.base_qty AS product_base_qty,
                s.qty AS stock_qty
         FROM prod_auto_add_items i
         JOIN prod_auto_add_groups g
           ON g.tenant_id=i.tenant_id AND g.id=i.group_id
         JOIN prod_products p
           ON p.tenant_id=i.tenant_id AND p.id=i.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE i.tenant_id=? AND i.is_active=1 AND g.is_active=1 AND p.is_active=1
         ORDER BY g.sort_order ASC, i.sort_order ASC, i.id ASC`,
        [storeId, tenantId]
      );

      // Р РЋР С•Р В±Р С‘РЎР‚Р В°Р ВµР С Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљРЎвЂ№ Р Т‘Р В»РЎРЏ РЎР‚Р В°РЎРѓРЎвЂЎРЎвЂРЎвЂљР В° display_price
      const productIds = [...new Set(rows.map(r => Number(r.product_id)).filter(Boolean))];
      const displayPriceMap = new Map();

      if (productIds.length > 0) {
        // Р В¤Р С•РЎР‚Р СР С‘РЎР‚РЎС“Р ВµР С Р СР В°РЎРѓРЎРѓР С‘Р Р† Р С—РЎР‚Р С•Р Т‘РЎС“Р С”РЎвЂљР С•Р Р† Р Т‘Р В»РЎРЏ enrichProductsWithDisplayPrice
        const productsForEnrich = rows.map(r => ({
          id: Number(r.product_id),
          price: Number(r.product_price || 0),
          base_unit_id: r.product_base_unit_id,
          unit_id: r.product_unit_id,
          base_qty: r.product_base_qty,
        }));

        // Р Р€Р Т‘Р В°Р В»РЎРЏР ВµР С Р Т‘РЎС“Р В±Р В»Р С‘Р С”Р В°РЎвЂљРЎвЂ№ Р С—Р С• id
        const uniqueProducts = [];
        const seenIds = new Set();
        for (const p of productsForEnrich) {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            uniqueProducts.push(p);
          }
        }

        await enrichProductsWithDisplayPrice(uniqueProducts, tenantId);

        for (const p of uniqueProducts) {
          displayPriceMap.set(p.id, p.display_price);
        }
      }

      const items = rows.map((r) => ({
        id: Number(r.id),
        group_id: Number(r.group_id),
        product_id: Number(r.product_id),
        default_qty: Number(r.default_qty || 0),
        min_qty: Number(r.min_qty || 0),
        max_qty: r.max_qty != null ? Number(r.max_qty) : null,
        price_override: r.price_override != null ? Number(r.price_override) : null,
        free_first_qty: Number(r.free_first_qty || 0),
        free_per_amount: r.free_per_amount != null ? Number(r.free_per_amount) : null,
        free_per_amount_qty: Number(r.free_per_amount_qty || 0),
        max_free_qty: r.max_free_qty != null ? Number(r.max_free_qty) : null,
        sort_order: Number(r.sort_order || 0),
        product: {
          id: Number(r.product_id),
          name: r.product_name || "",
          price: Number(r.product_price || 0),
          old_price: Number(r.product_old_price || 0),
          photos: helpers.safeJsonArray(r.product_photos_json),
          stock_qty: r.stock_qty != null ? Number(r.stock_qty) : null,
          display_price: displayPriceMap.get(Number(r.product_id)) ?? Number(r.product_price || 0),
        },
      }));

      res.json({ ok: true, data: { groups, items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/public/delivery-settings
   * Р вЂ™Р С•Р В·Р Р†РЎР‚Р В°РЎвЂ°Р В°Р ВµРЎвЂљ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”Р С‘ Р Т‘Р С•РЎРѓРЎвЂљР В°Р Р†Р С”Р С‘ Р Т‘Р В»РЎРЏ РЎвЂљР ВµР С”РЎС“РЎвЂ°Р ВµР С–Р С• РЎвЂћР С‘Р В»Р С‘Р В°Р В»Р В°
   */
  router.get('/delivery-settings', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      // Р ВРЎвЂ°Р ВµР С Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р в„–Р С”РЎС“ Р Т‘Р С•РЎРѓРЎвЂљР В°Р Р†Р С”Р С‘, Р С—РЎР‚Р С‘Р Р†РЎРЏР В·Р В°Р Р…Р Р…РЎС“РЎР‹ Р С” РЎвЂљР ВµР С”РЎС“РЎвЂ°Р ВµР СРЎС“ РЎвЂћР С‘Р В»Р С‘Р В°Р В»РЎС“
      // РС‰РµРј РЅР°СЃС‚СЂРѕР№РєСѓ РґРѕСЃС‚Р°РІРєРё, РїСЂРёРІСЏР·Р°РЅРЅСѓСЋ Рє С‚РµРєСѓС‰РµРјСѓ С„РёР»РёР°Р»Сѓ
      const defaultSettings = await loadDefaultDeliverySettings(db, tenantId, storeId);
      return res.json({
        ok: true,
        data: {
          delivery_cost: Number(defaultSettings.delivery_cost || 0),
          min_order_amount: Number(defaultSettings.min_order_amount || 0),
          free_delivery_from: defaultSettings.free_delivery_from != null ? Number(defaultSettings.free_delivery_from) : null,
          eta_minutes: defaultSettings.eta_minutes != null ? Number(defaultSettings.eta_minutes) : null,
          price_tiers: Array.isArray(defaultSettings.price_tiers) ? defaultSettings.price_tiers : [],
          has_settings: Boolean(defaultSettings.has_settings)
        }
      });

        // Р СњР ВµРЎвЂљ Р Р…Р В°РЎРѓРЎвЂљРЎР‚Р С•Р ВµР С” - Р Т‘Р С•РЎРѓРЎвЂљР В°Р Р†Р С”Р В° Р В±Р ВµРЎРѓР С—Р В»Р В°РЎвЂљР Р…Р В°РЎРЏ, Р В±Р ВµР В· Р С•Р С–РЎР‚Р В°Р Р…Р С‘РЎвЂЎР ВµР Р…Р С‘Р в„–
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
