const crypto = require('crypto');

const {
  buildLegacyDeliveryPriceTiers,
  normalizeDeliveryEtaMinutes,
  normalizeDeliveryMoney,
  normalizeDeliveryPriceTiersForOutput,
  summarizeDeliveryPriceTiers,
} = require('./delivery-price-tiers');

const DELIVERY_ZONE_DEFAULT_COLOR = '#ff7a00';

const deliveryTables = Object.freeze({
  zones: 'ten_delivery_zones',
  zoneStores: 'ten_delivery_zone_stores',
  zoneTiers: 'ten_delivery_zone_price_tiers',
  settings: 'ten_delivery_settings',
  settingStores: 'ten_delivery_settings_stores',
  settingTiers: 'ten_delivery_setting_price_tiers',
});

function normalizeDeliveryZoneColor(value) {
  const raw = String(value || '').trim();
  if (!raw) return DELIVERY_ZONE_DEFAULT_COLOR;
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const [, r, g, b] = raw.toLowerCase();
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return DELIVERY_ZONE_DEFAULT_COLOR;
}

function normalizeDeliveryZoneMoney(value) {
  return normalizeDeliveryMoney(value);
}

function normalizeDeliveryZoneEtaMinutes(value) {
  return normalizeDeliveryEtaMinutes(value);
}

function normalizeDeliveryZoneCoordinate(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < min || numeric > max) return null;
  return Number(numeric.toFixed(7));
}

function normalizeDeliveryZonePoint(point) {
  if (!Array.isArray(point) || point.length < 2) return null;
  const lng = normalizeDeliveryZoneCoordinate(point[0], -180, 180);
  const lat = normalizeDeliveryZoneCoordinate(point[1], -90, 90);
  if (lat === null || lng === null) return null;
  return [lng, lat];
}

function closeDeliveryZoneRing(points) {
  if (!Array.isArray(points) || !points.length) return points;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) return points;
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return points.concat([[first[0], first[1]]]);
}

function normalizeDeliveryZoneRing(ring) {
  if (!Array.isArray(ring)) return null;
  const normalized = ring
    .map((point) => normalizeDeliveryZonePoint(point))
    .filter(Boolean);
  const closed = closeDeliveryZoneRing(normalized);
  return Array.isArray(closed) && closed.length >= 4 ? closed : null;
}

function normalizeDeliveryZonePolygon(polygon) {
  if (!Array.isArray(polygon)) return null;
  const rings = polygon
    .map((ring) => normalizeDeliveryZoneRing(ring))
    .filter(Boolean);
  return rings.length ? rings : null;
}

function normalizeDeliveryZoneGeometry(rawValue) {
  let source = rawValue;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (_) {
      return null;
    }
  }
  if (!source || typeof source !== 'object') return null;
  if (source.type === 'Feature') {
    source = source.geometry;
  }
  if (!source || typeof source !== 'object') return null;

  let type = String(source.type || '').trim();
  let coordinates = source.coordinates;
  if (type === 'Polygon') {
    type = 'MultiPolygon';
    coordinates = [coordinates];
  }
  if (type !== 'MultiPolygon' || !Array.isArray(coordinates)) return null;

  const polygons = coordinates
    .map((polygon) => normalizeDeliveryZonePolygon(polygon))
    .filter(Boolean);
  if (!polygons.length) return null;

  return {
    type: 'MultiPolygon',
    coordinates: polygons,
  };
}

function serializeDeliveryZoneRow(row, extras = {}) {
  const source = row && typeof row === 'object' ? row : {};
  const storeIds = Array.isArray(extras.store_ids)
    ? extras.store_ids
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right)
    : [];
  const tiers = normalizeDeliveryPriceTiersForOutput(extras.price_tiers);

  return {
    id: Number(source.id || 0),
    tenant_id: Number(source.tenant_id || 0),
    name: String(source.name || '').trim(),
    color: normalizeDeliveryZoneColor(source.color),
    eta_minutes: normalizeDeliveryZoneEtaMinutes(source.eta_minutes),
    is_active: Number(source.is_active) === 1 ? 1 : 0,
    geometry: normalizeDeliveryZoneGeometry(source.geometry_json),
    created_at: source.created_at || null,
    updated_at: source.updated_at || null,
    store_ids: storeIds,
    price_tiers: tiers,
  };
}

async function loadDeliveryZonesForTenant(db, tenantId) {
  const resolvedTenantId = Number(tenantId || 0);
  if (!Number.isFinite(resolvedTenantId) || resolvedTenantId <= 0) return [];

  try {
    const [rows] = await db.query(
      `SELECT id, tenant_id, name, color, eta_minutes, is_active, geometry_json, created_at, updated_at
       FROM \`${deliveryTables.zones}\`
       WHERE tenant_id=?
       ORDER BY id ASC`,
      [resolvedTenantId]
    );

    const zoneIds = (Array.isArray(rows) ? rows : [])
      .map((row) => Number(row && row.id))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!zoneIds.length) return [];

    const placeholders = zoneIds.map(() => '?').join(', ');
    const storeMap = new Map();
    const tiersMap = new Map();

    const [storeRows] = await db.query(
      `SELECT delivery_zone_id, store_id
       FROM \`${deliveryTables.zoneStores}\`
       WHERE tenant_id=? AND delivery_zone_id IN (${placeholders})`,
      [resolvedTenantId, ...zoneIds]
    );
    (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
      const zoneId = Number(row && row.delivery_zone_id);
      const storeId = Number(row && row.store_id);
      if (!Number.isFinite(zoneId) || !Number.isFinite(storeId) || storeId <= 0) return;
      if (!storeMap.has(zoneId)) storeMap.set(zoneId, []);
      storeMap.get(zoneId).push(storeId);
    });

    const [tierRows] = await db.query(
      `SELECT delivery_zone_id, min_order_amount, delivery_cost, sort_order
       FROM \`${deliveryTables.zoneTiers}\`
       WHERE tenant_id=? AND delivery_zone_id IN (${placeholders})
       ORDER BY delivery_zone_id ASC, sort_order ASC, id ASC`,
      [resolvedTenantId, ...zoneIds]
    );
    (Array.isArray(tierRows) ? tierRows : []).forEach((row) => {
      const zoneId = Number(row && row.delivery_zone_id);
      if (!Number.isFinite(zoneId)) return;
      if (!tiersMap.has(zoneId)) tiersMap.set(zoneId, []);
      tiersMap.get(zoneId).push({
        min_order_amount: row.min_order_amount,
        delivery_cost: row.delivery_cost,
        sort_order: row.sort_order,
      });
    });

    return (Array.isArray(rows) ? rows : [])
      .map((row) => serializeDeliveryZoneRow(row, {
        store_ids: storeMap.get(Number(row && row.id)) || [],
        price_tiers: tiersMap.get(Number(row && row.id)) || [],
      }))
      .filter((zone) => zone && zone.id > 0 && zone.geometry);
  } catch (error) {
    if (String(error && error.code || '') === 'ER_NO_SUCH_TABLE') {
      return [];
    }
    throw error;
  }
}

function isPointOnSegment(point, left, right) {
  const [px, py] = point;
  const [x1, y1] = left;
  const [x2, y2] = right;
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > 1e-10) return false;
  const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2);
  return dot <= 1e-10;
}

function isPointInRing(point, ring) {
  if (!Array.isArray(ring) || ring.length < 4) return false;
  let inside = false;
  for (let index = 0, lastIndex = ring.length - 1; index < ring.length; lastIndex = index, index += 1) {
    const left = ring[index];
    const right = ring[lastIndex];
    if (!left || !right) continue;
    if (isPointOnSegment(point, left, right)) return true;

    const xi = Number(left[0]);
    const yi = Number(left[1]);
    const xj = Number(right[0]);
    const yj = Number(right[1]);

    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && (point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function isPointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || !polygon.length) return false;
  if (!isPointInRing(point, polygon[0])) return false;
  for (let index = 1; index < polygon.length; index += 1) {
    if (isPointInRing(point, polygon[index])) return false;
  }
  return true;
}

function geometryContainsPoint(geometry, lat, lng) {
  const normalized = normalizeDeliveryZoneGeometry(geometry);
  if (!normalized) return false;
  const point = [Number(lng), Number(lat)];
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return false;
  return normalized.coordinates.some((polygon) => isPointInPolygon(point, polygon));
}

function findMatchingDeliveryZone(zones, coordinates = {}) {
  const lat = Number(coordinates.lat);
  const lng = Number(coordinates.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const list = Array.isArray(zones) ? zones : [];
  for (const zone of list) {
    if (!zone || Number(zone.is_active) !== 1) continue;
    if (geometryContainsPoint(zone.geometry, lat, lng)) {
      return zone;
    }
  }
  return null;
}

function getZoneTierSummary(zone, subtotal) {
  return summarizeDeliveryPriceTiers(zone && zone.price_tiers, subtotal);
}

function buildDeliverySettingsRevision({ tenantId, storeId, defaultSetting, zones }) {
  const payload = {
    tenant_id: Number(tenantId || 0) || 0,
    store_id: Number(storeId || 0) || 0,
    default_setting: {
      has_settings: Boolean(defaultSetting && defaultSetting.has_settings),
      id: Number(defaultSetting && defaultSetting.id || 0) || 0,
      name: String(defaultSetting && defaultSetting.name || '').trim(),
      delivery_cost: Number(defaultSetting && defaultSetting.delivery_cost || 0),
      min_order_amount: Number(defaultSetting && defaultSetting.min_order_amount || 0),
      free_delivery_from: defaultSetting && defaultSetting.free_delivery_from != null
        ? Number(defaultSetting.free_delivery_from)
        : null,
      eta_minutes: defaultSetting && defaultSetting.eta_minutes != null
        ? Number(defaultSetting.eta_minutes)
        : null,
      default_store_id: defaultSetting && defaultSetting.default_store_id != null
        ? Number(defaultSetting.default_store_id)
        : null,
      price_tiers: normalizeDeliveryPriceTiersForOutput(defaultSetting && defaultSetting.price_tiers),
    },
    zones: (Array.isArray(zones) ? zones : [])
      .map((zone) => ({
        id: Number(zone && zone.id || 0) || 0,
        name: String(zone && zone.name || '').trim(),
        color: normalizeDeliveryZoneColor(zone && zone.color),
        eta_minutes: zone && zone.eta_minutes != null ? Number(zone.eta_minutes) : null,
        is_active: Number(zone && zone.is_active) === 1 ? 1 : 0,
        geometry: normalizeDeliveryZoneGeometry(zone && zone.geometry),
        store_ids: Array.isArray(zone && zone.store_ids)
          ? zone.store_ids
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value) && value > 0)
            .sort((left, right) => left - right)
          : [],
        price_tiers: normalizeDeliveryPriceTiersForOutput(zone && zone.price_tiers),
      }))
      .filter((zone) => zone.id > 0)
      .sort((left, right) => left.id - right.id),
  };

  return crypto
    .createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('hex');
}

async function loadDefaultDeliverySettings(db, tenantId, storeId) {
  const resolvedTenantId = Number(tenantId || 0);
  const resolvedStoreId = Number(storeId || 0);
  if (!Number.isFinite(resolvedTenantId) || resolvedTenantId <= 0 || !Number.isFinite(resolvedStoreId) || resolvedStoreId <= 0) {
    return {
      has_settings: false,
      delivery_cost: 0,
      min_order_amount: 0,
      free_delivery_from: null,
      eta_minutes: null,
      price_tiers: [],
      default_store_id: null,
      id: null,
      name: null,
    };
  }

  let setting = null;
  let hasEtaColumn = true;
  try {
    const [rows] = await db.query(
      `SELECT ds.id, ds.name, ds.eta_minutes, ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from, ds.default_store_id
       FROM \`${deliveryTables.settings}\` ds
       JOIN \`${deliveryTables.settingStores}\` dss ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
       WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
       ORDER BY ds.id ASC
       LIMIT 1`,
      [resolvedTenantId, resolvedStoreId]
    );
    setting = Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (error) {
    const code = String(error && error.code || '');
    if (code !== 'ER_BAD_FIELD_ERROR') throw error;
    hasEtaColumn = false;
    const [rows] = await db.query(
      `SELECT ds.id, ds.name, ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from, ds.default_store_id
       FROM \`${deliveryTables.settings}\` ds
       JOIN \`${deliveryTables.settingStores}\` dss ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
       WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
       ORDER BY ds.id ASC
       LIMIT 1`,
      [resolvedTenantId, resolvedStoreId]
    );
    setting = Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  if (!setting) {
    return {
      has_settings: false,
      delivery_cost: 0,
      min_order_amount: 0,
      free_delivery_from: null,
      eta_minutes: null,
      price_tiers: [],
      default_store_id: null,
      id: null,
      name: null,
    };
  }

  let priceTiers = [];
  try {
    const [tierRows] = await db.query(
      `SELECT min_order_amount, delivery_cost, sort_order
       FROM \`${deliveryTables.settingTiers}\`
       WHERE tenant_id=? AND delivery_setting_id=?
       ORDER BY sort_order ASC, id ASC`,
      [resolvedTenantId, setting.id]
    );
    priceTiers = normalizeDeliveryPriceTiersForOutput(tierRows);
  } catch (error) {
    const code = String(error && error.code || '');
    if (code !== 'ER_NO_SUCH_TABLE') throw error;
  }

  if (!priceTiers.length) {
    priceTiers = buildLegacyDeliveryPriceTiers(setting);
  }

  const legacySummary = summarizeDeliveryPriceTiers(priceTiers, 0);
  return {
    has_settings: true,
    id: Number(setting.id || 0) || null,
    name: String(setting.name || '').trim() || null,
    delivery_cost: Number(legacySummary.delivery_cost || 0),
    min_order_amount: Number(legacySummary.min_order_amount || 0),
    free_delivery_from: legacySummary.free_delivery_from != null ? Number(legacySummary.free_delivery_from) : null,
    eta_minutes: hasEtaColumn && setting.eta_minutes != null ? Number(setting.eta_minutes) : null,
    price_tiers: priceTiers,
    default_store_id: setting.default_store_id != null ? Number(setting.default_store_id) : null,
  };
}

function buildDefaultQuote(setting, subtotal) {
  const source = setting && typeof setting === 'object' ? setting : {};
  const tiers = Array.isArray(source.price_tiers) && source.price_tiers.length
    ? source.price_tiers
    : buildLegacyDeliveryPriceTiers(source);
  const tierSummary = summarizeDeliveryPriceTiers(tiers, subtotal);
  return {
    source: 'default',
    has_settings: Boolean(source.has_settings),
    delivery_cost: Number(tierSummary.delivery_cost || 0),
    min_order_amount: Number(tierSummary.min_order_amount || 0),
    free_delivery_from: tierSummary.free_delivery_from != null ? Number(tierSummary.free_delivery_from) : null,
    eta_minutes: source.eta_minutes != null ? Number(source.eta_minutes) : null,
    delivery_zone_id: null,
    delivery_zone_name: null,
    delivery_store_id: source.default_store_id != null ? Number(source.default_store_id) : null,
    default_store_id: source.default_store_id != null ? Number(source.default_store_id) : null,
    price_tiers: tiers,
  };
}

async function buildDeliveryQuote({ db, tenantId, storeId, subtotal, address }) {
  const resolvedStoreId = Number(storeId || 0);
  const defaultSetting = await loadDefaultDeliverySettings(db, tenantId, resolvedStoreId);
  const lat = Number(address && address.lat);
  const lng = Number(address && address.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return buildDefaultQuote(defaultSetting, subtotal);
  }

  const zones = await loadDeliveryZonesForTenant(db, tenantId);
  const deliveryRevision = buildDeliverySettingsRevision({
    tenantId,
    storeId: resolvedStoreId,
    defaultSetting,
    zones,
  });
  const fallbackQuote = {
    ...buildDefaultQuote(defaultSetting, subtotal),
    delivery_revision: deliveryRevision,
  };

  const matchedZone = findMatchingDeliveryZone(zones, { lat, lng });
  if (!matchedZone) {
    return fallbackQuote;
  }

  const tierSummary = getZoneTierSummary(matchedZone, subtotal);
  const storeIds = Array.isArray(matchedZone.store_ids)
    ? matchedZone.store_ids
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((left, right) => left - right)
    : [];

  return {
    source: 'zone',
    has_settings: true,
    delivery_cost: Number(tierSummary.delivery_cost || 0),
    min_order_amount: Number(tierSummary.min_order_amount || 0),
    free_delivery_from: tierSummary.free_delivery_from != null ? Number(tierSummary.free_delivery_from) : null,
    eta_minutes: matchedZone.eta_minutes != null ? Number(matchedZone.eta_minutes) : null,
    delivery_zone_id: Number(matchedZone.id || 0) || null,
    delivery_zone_name: matchedZone.name || null,
    delivery_store_id: storeIds.length ? storeIds[0] : (fallbackQuote.delivery_store_id || null),
    default_store_id: fallbackQuote.default_store_id,
    price_tiers: Array.isArray(matchedZone.price_tiers) ? matchedZone.price_tiers : [],
    delivery_revision: deliveryRevision,
  };
}

module.exports = {
  buildDeliveryQuote,
  buildDeliverySettingsRevision,
  buildDefaultQuote,
  loadDefaultDeliverySettings,
  loadDeliveryZonesForTenant,
  findMatchingDeliveryZone,
  getZoneTierSummary,
  normalizeDeliveryZoneGeometry,
  geometryContainsPoint,
};
