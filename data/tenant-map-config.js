const {
  normalizeMapProviderName,
  normalizeMapTileUrl,
  normalizeMapAttribution,
  normalizeMapMaxZoom,
  normalizeMapSubdomains,
  normalizeMapGeocoderProviderName,
  normalizeMapGeocoderSearchUrl,
  normalizeMapGeocoderCountryCode,
  normalizeMapGeocoderLanguage,
  normalizeMapGeocoderResultLimit,
  normalizeMapStoreAddressEnabled,
  normalizeDeliveryZonePolygonProvider,
} = require('./system-settings');

const tenantMapConfigColumns = [
  {
    name: 'map_provider_name',
    sql: "varchar(120) DEFAULT NULL COMMENT 'Tenant map tile provider name'",
  },
  {
    name: 'map_tile_url',
    sql: "varchar(2048) DEFAULT NULL COMMENT 'Tenant map tile URL template'",
  },
  {
    name: 'map_attribution',
    sql: "text DEFAULT NULL COMMENT 'Tenant map attribution HTML'",
  },
  {
    name: 'map_max_zoom',
    sql: "tinyint unsigned DEFAULT 22 COMMENT 'Tenant map max zoom'",
  },
  {
    name: 'map_subdomains',
    sql: "varchar(255) DEFAULT NULL COMMENT 'Tenant map subdomains list'",
  },
  {
    name: 'map_geocoder_provider_name',
    sql: "varchar(120) DEFAULT NULL COMMENT 'Tenant geocoder provider name'",
  },
  {
    name: 'map_geocoder_search_url',
    sql: "varchar(2048) DEFAULT NULL COMMENT 'Tenant geocoder search endpoint'",
  },
  {
    name: 'map_geocoder_country_code',
    sql: "varchar(8) DEFAULT 'ru' COMMENT 'Tenant geocoder country code'",
  },
  {
    name: 'map_geocoder_language',
    sql: "varchar(16) DEFAULT 'ru' COMMENT 'Tenant geocoder language'",
  },
  {
    name: 'map_geocoder_result_limit',
    sql: "tinyint unsigned NOT NULL DEFAULT 5 COMMENT 'Tenant geocoder result limit'",
  },
  {
    name: 'store_address_map_enabled',
    sql: "tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Enable address lookup with map for this tenant'",
  },
  {
    name: 'delivery_zone_polygon_provider',
    sql: "varchar(64) DEFAULT 'Leaflet-Geoman' COMMENT 'Tenant delivery zone polygon provider'",
  },
  {
    name: 'map_provider_accounts_json',
    sql: "text DEFAULT NULL COMMENT 'JSON list of tenant map provider accounts'",
  },
];

let tenantMapConfigColumnsReady = false;
let ensureTenantMapConfigColumnsPromise = null;

function hasOwn(target, key) {
  return Boolean(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function isAbsoluteHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function isValidMapTileUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (!raw.includes('{z}') || !raw.includes('{x}') || !raw.includes('{y}')) return false;
  const candidate = raw
    .replace('{s}', 'a')
    .replace('{z}', '0')
    .replace('{x}', '0')
    .replace('{y}', '0');
  return isAbsoluteHttpUrl(candidate);
}

function isValidGeocoderSearchUrl(value) {
  return isAbsoluteHttpUrl(value);
}

function nullableString(value) {
  const normalized = String(value || '').trim();
  return normalized ? normalized : null;
}

function normalizeTenantMapConfig(source) {
  const raw = source && typeof source === 'object' ? source : {};
  const maxZoom = normalizeMapMaxZoom(raw.map_max_zoom ?? raw.max_zoom);
  const geocoderResultLimit = normalizeMapGeocoderResultLimit(
    raw.map_geocoder_result_limit ?? raw.geocoder_result_limit
  );
  const mapEnabled = normalizeMapStoreAddressEnabled(raw.store_address_map_enabled);

  return {
    provider_name: normalizeMapProviderName(raw.map_provider_name ?? raw.provider_name),
    tile_url: normalizeMapTileUrl(raw.map_tile_url ?? raw.tile_url),
    attribution: normalizeMapAttribution(raw.map_attribution ?? raw.attribution),
    max_zoom: maxZoom == null ? 22 : maxZoom,
    subdomains: normalizeMapSubdomains(raw.map_subdomains ?? raw.subdomains),
    geocoder_provider_name: normalizeMapGeocoderProviderName(
      raw.map_geocoder_provider_name ?? raw.geocoder_provider_name
    ),
    geocoder_search_url: normalizeMapGeocoderSearchUrl(
      raw.map_geocoder_search_url ?? raw.geocoder_search_url
    ),
    geocoder_country_code: normalizeMapGeocoderCountryCode(
      raw.map_geocoder_country_code ?? raw.geocoder_country_code
    ) || 'ru',
    geocoder_language: normalizeMapGeocoderLanguage(
      raw.map_geocoder_language ?? raw.geocoder_language
    ) || 'ru',
    geocoder_result_limit: geocoderResultLimit == null ? 5 : geocoderResultLimit,
    store_address_map_enabled: mapEnabled,
    delivery_zone_polygon_provider: normalizeDeliveryZonePolygonProvider(
      raw.delivery_zone_polygon_provider
    ),
    delivery_zone_polygon_enabled: mapEnabled,
  };
}

function buildTenantMapConfigUpdate(body, currentConfig) {
  const payload = body && typeof body === 'object' ? body : {};
  const current = normalizeTenantMapConfig(currentConfig);

  const hasProviderName = hasOwn(payload, 'provider_name');
  const hasTileUrl = hasOwn(payload, 'tile_url');
  const hasAttribution = hasOwn(payload, 'attribution');
  const hasMaxZoom = hasOwn(payload, 'max_zoom');
  const hasSubdomains = hasOwn(payload, 'subdomains');
  const hasGeocoderProviderName = hasOwn(payload, 'geocoder_provider_name');
  const hasGeocoderSearchUrl = hasOwn(payload, 'geocoder_search_url');
  const hasGeocoderCountryCode = hasOwn(payload, 'geocoder_country_code');
  const hasGeocoderLanguage = hasOwn(payload, 'geocoder_language');
  const hasGeocoderResultLimit = hasOwn(payload, 'geocoder_result_limit');
  const hasStoreAddressMapEnabled = hasOwn(payload, 'store_address_map_enabled');
  const hasDeliveryZonePolygonProvider = hasOwn(payload, 'delivery_zone_polygon_provider');

  if (
    !hasProviderName
    && !hasTileUrl
    && !hasAttribution
    && !hasMaxZoom
    && !hasSubdomains
    && !hasGeocoderProviderName
    && !hasGeocoderSearchUrl
    && !hasGeocoderCountryCode
    && !hasGeocoderLanguage
    && !hasGeocoderResultLimit
    && !hasStoreAddressMapEnabled
    && !hasDeliveryZonePolygonProvider
  ) {
    return { ok: false, error: 'NO_FIELDS' };
  }

  const providerName = hasProviderName
    ? normalizeMapProviderName(payload.provider_name)
    : current.provider_name;
  const tileUrl = hasTileUrl
    ? normalizeMapTileUrl(payload.tile_url)
    : current.tile_url;
  const attribution = hasAttribution
    ? normalizeMapAttribution(payload.attribution)
    : current.attribution;
  const maxZoom = hasMaxZoom
    ? normalizeMapMaxZoom(payload.max_zoom)
    : current.max_zoom;
  const subdomains = hasSubdomains
    ? normalizeMapSubdomains(payload.subdomains)
    : current.subdomains;
  const geocoderProviderName = hasGeocoderProviderName
    ? normalizeMapGeocoderProviderName(payload.geocoder_provider_name)
    : current.geocoder_provider_name;
  const geocoderSearchUrl = hasGeocoderSearchUrl
    ? normalizeMapGeocoderSearchUrl(payload.geocoder_search_url)
    : current.geocoder_search_url;
  const geocoderCountryCode = hasGeocoderCountryCode
    ? normalizeMapGeocoderCountryCode(payload.geocoder_country_code)
    : current.geocoder_country_code;
  const geocoderLanguage = hasGeocoderLanguage
    ? normalizeMapGeocoderLanguage(payload.geocoder_language)
    : current.geocoder_language;
  const geocoderResultLimit = hasGeocoderResultLimit
    ? normalizeMapGeocoderResultLimit(payload.geocoder_result_limit)
    : current.geocoder_result_limit;
  const storeAddressMapEnabled = hasStoreAddressMapEnabled
    ? normalizeMapStoreAddressEnabled(payload.store_address_map_enabled)
    : Boolean(current.store_address_map_enabled);
  const deliveryZonePolygonProvider = hasDeliveryZonePolygonProvider
    ? normalizeDeliveryZonePolygonProvider(payload.delivery_zone_polygon_provider)
    : normalizeDeliveryZonePolygonProvider(current.delivery_zone_polygon_provider);

  const hasTileConfig = Boolean(providerName || tileUrl || attribution || subdomains);
  const hasGeocoderConfig = Boolean(geocoderProviderName || geocoderSearchUrl);

  if (hasTileConfig) {
    if (!tileUrl) {
      return { ok: false, error: 'TILE_URL_REQUIRED' };
    }
    if (!isValidMapTileUrl(tileUrl)) {
      return { ok: false, error: 'INVALID_TILE_URL' };
    }
    if (maxZoom == null || maxZoom < 0 || maxZoom > 22) {
      return { ok: false, error: 'INVALID_MAX_ZOOM' };
    }
  }

  if (hasGeocoderConfig) {
    if (!geocoderSearchUrl) {
      return { ok: false, error: 'GEOCODER_SEARCH_URL_REQUIRED' };
    }
    if (!isValidGeocoderSearchUrl(geocoderSearchUrl)) {
      return { ok: false, error: 'INVALID_GEOCODER_SEARCH_URL' };
    }
    if (geocoderResultLimit == null || geocoderResultLimit < 1 || geocoderResultLimit > 10) {
      return { ok: false, error: 'INVALID_GEOCODER_RESULT_LIMIT' };
    }
  }

  return {
    ok: true,
    data: {
      provider_name: providerName,
      tile_url: tileUrl,
      attribution,
      max_zoom: maxZoom == null ? 22 : maxZoom,
      subdomains,
      geocoder_provider_name: geocoderProviderName,
      geocoder_search_url: geocoderSearchUrl,
      geocoder_country_code: geocoderCountryCode || 'ru',
      geocoder_language: geocoderLanguage || 'ru',
      geocoder_result_limit: geocoderResultLimit == null ? 5 : geocoderResultLimit,
      store_address_map_enabled: Boolean(storeAddressMapEnabled),
      delivery_zone_polygon_provider: deliveryZonePolygonProvider,
      delivery_zone_polygon_enabled: Boolean(storeAddressMapEnabled),
    },
  };
}

function getTenantMapConfigSelectSql(options = {}) {
  const includeAccounts = Boolean(options.includeAccounts);
  const columns = [
    'id',
    'map_provider_name',
    'map_tile_url',
    'map_attribution',
    'map_max_zoom',
    'map_subdomains',
    'map_geocoder_provider_name',
    'map_geocoder_search_url',
    'map_geocoder_country_code',
    'map_geocoder_language',
    'map_geocoder_result_limit',
    'store_address_map_enabled',
    'delivery_zone_polygon_provider',
  ];
  if (includeAccounts) {
    columns.push('map_provider_accounts_json');
  }
  return columns.join(', ');
}

async function ensureTenantMapConfigColumns(db) {
  if (tenantMapConfigColumnsReady) return true;
  if (ensureTenantMapConfigColumnsPromise) return ensureTenantMapConfigColumnsPromise;

  ensureTenantMapConfigColumnsPromise = (async () => {
    const [columnRows] = await db.query('SHOW COLUMNS FROM ten_tenants');
    const existing = new Set(
      (Array.isArray(columnRows) ? columnRows : [])
        .map((row) => String(row?.Field || '').trim())
        .filter(Boolean)
    );

    for (const column of tenantMapConfigColumns) {
      if (existing.has(column.name)) continue;
      try {
        await db.query(`ALTER TABLE ten_tenants ADD COLUMN \`${column.name}\` ${column.sql}`);
        existing.add(column.name);
      } catch (err) {
        if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
          existing.add(column.name);
          continue;
        }
        throw err;
      }
    }

    tenantMapConfigColumnsReady = tenantMapConfigColumns.every((column) => existing.has(column.name));
    return tenantMapConfigColumnsReady;
  })()
    .catch((err) => {
      ensureTenantMapConfigColumnsPromise = null;
      throw err;
    })
    .finally(() => {
      if (tenantMapConfigColumnsReady) {
        ensureTenantMapConfigColumnsPromise = null;
      }
    });

  return ensureTenantMapConfigColumnsPromise;
}

async function getTenantMapConfigRow(db, tenantId, options = {}) {
  const normalizedTenantId = Number(tenantId);
  if (!Number.isFinite(normalizedTenantId) || normalizedTenantId <= 0) return null;
  await ensureTenantMapConfigColumns(db);
  const [rows] = await db.query(
    `SELECT ${getTenantMapConfigSelectSql(options)} FROM ten_tenants WHERE id=? LIMIT 1`,
    [normalizedTenantId]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function getTenantMapConfig(db, tenantId, options = {}) {
  const row = await getTenantMapConfigRow(db, tenantId, options);
  return row ? normalizeTenantMapConfig(row) : null;
}

async function saveTenantMapConfig(db, tenantId, body) {
  const row = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
  if (!row) {
    return { ok: false, error: 'TENANT_NOT_FOUND' };
  }

  const nextResult = buildTenantMapConfigUpdate(body, row);
  if (!nextResult.ok) {
    return nextResult;
  }

  const nextConfig = nextResult.data;
  await db.query(
    `UPDATE ten_tenants
        SET map_provider_name=?,
            map_tile_url=?,
            map_attribution=?,
            map_max_zoom=?,
            map_subdomains=?,
            map_geocoder_provider_name=?,
            map_geocoder_search_url=?,
            map_geocoder_country_code=?,
            map_geocoder_language=?,
            map_geocoder_result_limit=?,
            store_address_map_enabled=?,
            delivery_zone_polygon_provider=?
      WHERE id=?`,
    [
      nullableString(nextConfig.provider_name),
      nullableString(nextConfig.tile_url),
      nullableString(nextConfig.attribution),
      Number(nextConfig.max_zoom),
      nullableString(nextConfig.subdomains),
      nullableString(nextConfig.geocoder_provider_name),
      nullableString(nextConfig.geocoder_search_url),
      String(nextConfig.geocoder_country_code || 'ru'),
      String(nextConfig.geocoder_language || 'ru'),
      Number(nextConfig.geocoder_result_limit || 5),
      nextConfig.store_address_map_enabled ? 1 : 0,
      String(nextConfig.delivery_zone_polygon_provider || 'Leaflet-Geoman'),
      Number(tenantId),
    ]
  );

  return {
    ok: true,
    row: {
      ...row,
      map_provider_name: nullableString(nextConfig.provider_name),
      map_tile_url: nullableString(nextConfig.tile_url),
      map_attribution: nullableString(nextConfig.attribution),
      map_max_zoom: Number(nextConfig.max_zoom),
      map_subdomains: nullableString(nextConfig.subdomains),
      map_geocoder_provider_name: nullableString(nextConfig.geocoder_provider_name),
      map_geocoder_search_url: nullableString(nextConfig.geocoder_search_url),
      map_geocoder_country_code: String(nextConfig.geocoder_country_code || 'ru'),
      map_geocoder_language: String(nextConfig.geocoder_language || 'ru'),
      map_geocoder_result_limit: Number(nextConfig.geocoder_result_limit || 5),
      store_address_map_enabled: nextConfig.store_address_map_enabled ? 1 : 0,
      delivery_zone_polygon_provider: String(nextConfig.delivery_zone_polygon_provider || 'Leaflet-Geoman'),
    },
    data: nextConfig,
  };
}

module.exports = {
  ensureTenantMapConfigColumns,
  getTenantMapConfigSelectSql,
  getTenantMapConfigRow,
  getTenantMapConfig,
  normalizeTenantMapConfig,
  buildTenantMapConfigUpdate,
  saveTenantMapConfig,
};
