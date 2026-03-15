const express = require('express');
let compression;
try {
  compression = require('compression');
} catch (_) {
  compression = null;
}
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { URL, domainToASCII } = require('url');

const db = require('./db');
const helpers = require('./api/helpers');
const { createOrdersEventsHub } = require('./api/ordersEvents');
const { startPolling: startTelegramPolling, handleWebhookUpdate, setWebhook, deleteWebhook } = require('./api/telegramBot');
const { startMaxPolling } = require('./api/maxBotPolling');
const { startTenantTelegramAuthPolling } = require('./api/tgAuthBotPolling');
const {
  readSystemSettings,
  writeSystemSettings,
  getBootstrappedPollingState,
  getEffectiveTelegramBotConfig,
  getEffectiveMapProviderConfig,
  normalizeTelegramBotUsername,
  normalizeTelegramBotToken,
  normalizeTelegramWebhookUrl,
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
} = require('./data/system-settings');
const { searchSystemMapGeocoder, searchSystemAddressSuggest } = require('./data/map-geocoder');
const { searchLocalAddressSuggest } = require('./data/local-address-index');
const {
  isAddressServiceConfigured,
  suggestCities: suggestAddressServiceCities,
  suggestAddresses: suggestAddressServiceAddresses,
  resolveAddress: resolveAddressThroughService,
} = require('./data/address-service-client');

// routers
const makeAuthRouter = require('./api/auth');
const makeAdminClientsRouter = require('./api/admin/clients');
const makeAdminDiscountsRouter = require('./api/admin/discounts');
const makeAdminOrdersRouter = require('./api/admin/orders');
const makeAdminProductsRouter = require('./api/admin/products');
const makeAdminTenantRouter = require('./api/admin/tenant');
const makeAdminStockRouter = require('./api/admin/stock');
const makePublicShopRouter = require('./api/public/shop');
const makePrintApiRouter = require('./api/print');
const makeChatTempRouter = require('./api/chatTemp');

// middleware
const { authMiddleware } = require('./api/middleware/auth');

const app = express();
const TELEGRAM_APP_VERSION = process.env.TG_APP_VERSION || '2';
const APP_CACHE_VERSION = String(TELEGRAM_APP_VERSION || '1.9.23').trim() || '1.9.23';
const STATIC_ASSET_VERSION = String(
  process.env.STATIC_ASSET_VERSION || APP_CACHE_VERSION || ''
).trim();
const SERVICE_WORKER_VERSION = (() => {
  try {
    const stat = fs.statSync(__filename);
    const mtimeVersion = Math.round(stat.mtimeMs || stat.mtime.getTime());
    return `${APP_CACHE_VERSION}-${mtimeVersion}`;
  } catch (e) {
    return APP_CACHE_VERSION;
  }
})();
const PORT = process.env.PORT || 3000;
const PERF_CONSOLE_LOGS_ENABLED = String(process.env.ENABLE_PERF_LOGS || '').trim() === '1';
const TENANT_LOOKUP_CACHE_MS = Number(process.env.TENANT_LOOKUP_CACHE_MS || 60_000);
const STATIC_FILE_VERSION_CACHE_MS = Number(process.env.STATIC_FILE_VERSION_CACHE_MS || 300_000);
const SLOW_REQUEST_LOG_MS = Math.max(0, Number(process.env.SLOW_REQUEST_LOG_MS || 1200) || 1200);
const runtimePollingState = {
  telegram_env_enabled: String(process.env.DISABLE_TELEGRAM_POLLING || '').trim() !== '1',
  telegram_tenant_enabled: String(process.env.DISABLE_TG_AUTH_POLLING || '').trim() !== '1',
};
const tenantLookupCache = new Map();
const staticVersionCache = new Map();
let telegramEnvPollingHandle = null;
let telegramTenantPollingHandle = null;
let fatalErrorLogged = false;

function nowMs() {
  return Number(process.hrtime.bigint()) / 1e6;
}

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

function buildMapGeocoderScopeLabel(scope, countryCode) {
  if (scope === 'country') {
    return String(countryCode || '').toLowerCase() === 'ru' ? 'Россия' : String(countryCode || '').toUpperCase();
  }
  return 'Весь мир';
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

async function fetchMapGeocoderResults(baseUrl, options = {}) {
  const {
    query = '',
    limit = 5,
    language = 'ru',
    countryCode = '',
    mode = 'city',
  } = options || {};
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': String(language || 'ru').trim() || 'ru',
        'User-Agent': 'markin-me-map-geocoder/1.0',
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, error: `UPSTREAM_${response.status}` };
    }
    const payload = await response.json();
    const list = Array.isArray(payload) ? payload : [];
    const filterFn = mode === 'address' ? isAddressLikeGeocoderResult : isCityLikeGeocoderResult;
    const resultType = mode === 'address' ? 'address' : 'city';
    const items = list
      .filter(filterFn)
      .map((entry) => normalizeMapGeocoderResult(entry, countryCode ? 'country' : 'global', resultType))
      .filter(Boolean);
    return { ok: true, items };
  } catch (e) {
    const message = e && e.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : (e && e.message) || 'UPSTREAM_ERROR';
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeoutId);
  }
}

function formatTimingDuration(value) {
  const numeric = Math.max(0, Number(value) || 0);
  return numeric.toFixed(1);
}

function buildServerTimingHeader(totalMs, metrics) {
  const items = [`app;dur=${formatTimingDuration(totalMs)}`];
  const safeMetrics = metrics && typeof metrics === 'object' ? metrics : {};
  const dbQueryMs = Math.max(0, Number(safeMetrics.dbQueryMs || 0) || 0);
  const dbWaitMs = Math.max(0, Number(safeMetrics.dbWaitMs || 0) || 0);
  const dbQueryCount = Math.max(0, Number(safeMetrics.dbQueryCount || 0) || 0);
  const dbWaitCount = Math.max(0, Number(safeMetrics.dbWaitCount || 0) || 0);

  if (dbQueryMs > 0 || dbQueryCount > 0) {
    const desc = dbQueryCount > 0 ? `;desc="${dbQueryCount} queries"` : '';
    items.push(`db;dur=${formatTimingDuration(dbQueryMs)}${desc}`);
  }
  if (dbWaitMs > 0 || dbWaitCount > 0) {
    const desc = dbWaitCount > 0 ? `;desc="${dbWaitCount} acquires"` : '';
    items.push(`dbwait;dur=${formatTimingDuration(dbWaitMs)}${desc}`);
  }

  return items.join(', ');
}

function shouldLogSlowRequest(req) {
  const pathValue = String(req.path || req.originalUrl || '');
  if (!pathValue) return true;
  return !(
    pathValue.startsWith('/static/')
    || pathValue.startsWith('/uploads/')
    || pathValue === '/favicon.ico'
  );
}

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  if (String(process.env.IN_PASSENGER || '').trim() === '1') {
    if (!fatalErrorLogged) {
      fatalErrorLogged = true;
      console.error('IN_PASSENGER=1; process kept alive after uncaught exception for diagnostics.');
    }
    return;
  }
  process.exit(1);
});

Object.assign(runtimePollingState, getBootstrappedPollingState(runtimePollingState));

function getSystemTelegramConfig(sourceState = readSystemSettings()) {
  return getEffectiveTelegramBotConfig(sourceState);
}

function getSystemMapConfig(sourceState = readSystemSettings()) {
  return getEffectiveMapProviderConfig(sourceState);
}

async function removeTelegramWebhook(token) {
  if (!token) return;
  try {
    await deleteWebhook(token);
  } catch (e) {
    console.error('Telegram deleteWebhook error:', e.message || e);
  }
}

// Инициализация с обработкой ошибок
let ordersEvents;
try {
  ordersEvents = createOrdersEventsHub();
} catch (err) {
  console.error('Ошибка инициализации ordersEvents:', err);
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ extended: true, limit: '60mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const startedAt = nowMs();
  const metrics = typeof db.createEmptyRequestMetrics === 'function'
    ? db.createEmptyRequestMetrics()
    : { dbQueryCount: 0, dbQueryMs: 0, dbWaitCount: 0, dbWaitMs: 0 };
  const originalWriteHead = res.writeHead;

  res.writeHead = function instrumentedWriteHead(...args) {
    if (!res.headersSent) {
      const totalMs = nowMs() - startedAt;
      res.setHeader('Server-Timing', buildServerTimingHeader(totalMs, metrics));
      res.setHeader('X-Response-Time', `${Math.round(totalMs)}ms`);
    }
    return originalWriteHead.apply(this, args);
  };

  res.on('finish', () => {
    const totalMs = nowMs() - startedAt;
    if (PERF_CONSOLE_LOGS_ENABLED && totalMs >= SLOW_REQUEST_LOG_MS && shouldLogSlowRequest(req)) {
      console.warn(
        `[http] slow ${req.method} ${req.originalUrl} ${res.statusCode} ${totalMs.toFixed(1)}ms`
        + ` (db=${Number(metrics.dbQueryCount || 0)}q/${formatTimingDuration(metrics.dbQueryMs)}ms`
        + ` wait=${Number(metrics.dbWaitCount || 0)}a/${formatTimingDuration(metrics.dbWaitMs)}ms)`
      );
    }
  });

  if (typeof db.withRequestMetrics === 'function') {
    return db.withRequestMetrics(metrics, next);
  }
  return next();
});
if (compression) {
  app.use(compression({
    threshold: 1024,
    filter(req, res) {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
  }));
}

// Статика: долгий кэш для изображений, короткий/по умолчанию — для остального
app.use('/static', express.static(path.join(__dirname, 'static'), {
  setHeaders(res, filePath) {
    const isImage = /\.(avif|gif|jpe?g|png|webp|svg|ico)$/i.test(filePath);
    const isVersionedStaticAsset = /\.(?:js|mjs|css|map|woff2?|ttf|otf|eot)$/i.test(filePath);
    if (isImage || isVersionedStaticAsset) {
      // Долгий кэш + валидация по ETag/Last-Modified (Express добавляет сам)
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      // Для не-картинок — более консервативный кэш
      if (!res.getHeader('Cache-Control')) {
        res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      }
    }
  }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  setHeaders(res) {
    if (!res.getHeader('Cache-Control')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

function getFreshCachedValue(cache, key) {
  const entry = cache.get(key);
  if (!entry) return { hit: false, value: null };
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return { hit: false, value: null };
  }
  return { hit: true, value: entry.value };
}

function setCachedValue(cache, key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
  });
}

function cacheTenantRecord(tenant) {
  if (!tenant || typeof tenant !== 'object') return;
  const tenantId = Number(tenant.id);
  if (Number.isFinite(tenantId) && tenantId > 0) {
    setCachedValue(tenantLookupCache, `tenant:id:${tenantId}`, tenant, TENANT_LOOKUP_CACHE_MS);
  }
  const sub = helpers.strOrNull(tenant.subdomain);
  if (sub) {
    setCachedValue(tenantLookupCache, `tenant:sub:${sub.toLowerCase()}`, tenant, TENANT_LOOKUP_CACHE_MS);
  }
  const customAscii = helpers.strOrNull(tenant.custom_domain_ascii);
  if (customAscii) {
    setCachedValue(tenantLookupCache, `tenant:host:${customAscii.toLowerCase()}`, tenant, TENANT_LOOKUP_CACHE_MS);
  }
  const custom = helpers.strOrNull(tenant.custom_domain);
  if (custom) {
    setCachedValue(tenantLookupCache, `tenant:host:${custom.toLowerCase()}`, tenant, TENANT_LOOKUP_CACHE_MS);
  }
}

async function findTenantById(id) {
  const tenantId = Number(id);
  if (!Number.isFinite(tenantId) || tenantId <= 0) return null;

  const cacheKey = `tenant:id:${tenantId}`;
  const cached = getFreshCachedValue(tenantLookupCache, cacheKey);
  if (cached.hit) return cached.value;

  const [rows] = await db.query('SELECT * FROM ten_tenants WHERE id=? LIMIT 1', [tenantId]);
  const tenant = rows[0] || null;
  setCachedValue(tenantLookupCache, cacheKey, tenant, TENANT_LOOKUP_CACHE_MS);
  if (tenant) cacheTenantRecord(tenant);
  return tenant;
}

async function findTenantBySubdomain(subdomain) {
  const sub = helpers.strOrNull(subdomain);
  if (!sub) return null;
  const key = sub.toLowerCase();

  const cacheKey = `tenant:sub:${key}`;
  const cached = getFreshCachedValue(tenantLookupCache, cacheKey);
  if (cached.hit) return cached.value;

  const [rows] = await db.query('SELECT * FROM ten_tenants WHERE subdomain=? LIMIT 1', [key]);
  const tenant = rows[0] || null;
  setCachedValue(tenantLookupCache, cacheKey, tenant, TENANT_LOOKUP_CACHE_MS);
  if (tenant) cacheTenantRecord(tenant);
  return tenant;
}

function getStaticFileVersionCached(relativePath) {
  const cacheKey = `static:version:${relativePath}`;
  const cached = getFreshCachedValue(staticVersionCache, cacheKey);
  if (cached.hit) return cached.value;

  const filePath = path.join(__dirname, 'static', relativePath);
  const stat = fs.statSync(filePath);
  const mtimeVersion = Math.round(stat.mtimeMs || stat.mtime.getTime());
  const version = STATIC_ASSET_VERSION
    ? `${STATIC_ASSET_VERSION}-${mtimeVersion}`
    : mtimeVersion;
  setCachedValue(staticVersionCache, cacheKey, version, STATIC_FILE_VERSION_CACHE_MS);
  return version;
}

// Helper для версионирования статических ресурсов (CSS, JS) по времени изменения файла
app.locals.assetUrl = function assetUrl(src) {
  try {
    if (!src || typeof src !== 'string') return src;
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
    if (!src.startsWith('/static/')) return src;
    const relativePath = src.split('?')[0].replace(/^\/static\//, '');
    const version = getStaticFileVersionCached(relativePath);
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}v=${version}`;
  } catch (e) {
    return src;
  }
};
app.locals.appVersion = APP_CACHE_VERSION;
app.locals.serviceWorkerVersion = SERVICE_WORKER_VERSION;

function toManifestPathname(rawPath) {
  const fallback = '/';
  const raw = String(rawPath || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw, 'https://manifest.local');
    const pathname = String(parsed.pathname || '').trim();
    return pathname.startsWith('/') ? pathname : fallback;
  } catch (e) {
    const cleaned = raw.split('#')[0].split('?')[0].trim();
    if (!cleaned) return fallback;
    return cleaned.startsWith('/') ? cleaned : `/${cleaned.replace(/^\/+/, '')}`;
  }
}

function isBlockedShopManifestPath(pathname) {
  const pathValue = toManifestPathname(pathname);
  return (
    pathValue.startsWith('/dashboard')
    || pathValue.startsWith('/api/')
    || pathValue === '/login'
    || pathValue === '/register'
    || pathValue === '/manifest.json'
    || pathValue === '/sw.js'
    || pathValue === '/telegram/app'
    || pathValue === '/max-app'
  );
}

function normalizeManifestApp(rawApp) {
  return String(rawApp || '').trim().toLowerCase() === 'admin' ? 'admin' : 'shop';
}

function normalizeManifestStartPath(rawStart, options = {}) {
  const appType = normalizeManifestApp(options.appType);
  const tenantHostShop = Boolean(options.tenantHostShop);
  const pathname = toManifestPathname(rawStart);

  if (appType === 'admin') {
    return pathname.startsWith('/dashboard/') ? pathname : '/dashboard/cash';
  }

  if (tenantHostShop) {
    return isBlockedShopManifestPath(pathname) ? '/' : pathname;
  }

  return pathname.startsWith('/shop') ? pathname : '/shop';
}

function normalizeManifestTitle(rawTitle, fallback = '') {
  const value = String(rawTitle || '').replace(/\s+/g, ' ').trim();
  if (value) return value;
  return String(fallback || '').replace(/\s+/g, ' ').trim();
}

function getAdminManifestPageTitle(startPath, fallbackTitle = '') {
  const pathname = normalizeManifestStartPath(startPath, { appType: 'admin' });
  const defaults = {
    '/dashboard/cash': 'Касса',
    '/dashboard/products': 'Товары',
    '/dashboard/orders': 'Заказы',
    '/dashboard/courier-screen': 'Экран курьера',
    '/dashboard/new-order': 'Новый заказ',
    '/dashboard/clients': 'Клиенты',
    '/dashboard/chat': 'Чаты',
    '/dashboard/team': 'Главная',
    '/dashboard/settings': 'Настройки',
  };
  return normalizeManifestTitle(fallbackTitle, defaults[pathname] || 'Админка');
}

function buildAdminManifestId(tenantId, startPath) {
  const normalizedTenantId = Number(tenantId) > 0 ? Number(tenantId) : 0;
  const normalizedPath = normalizeManifestStartPath(startPath, { appType: 'admin' });
  return `/pwa/admin/t${normalizedTenantId}${normalizedPath}`;
}

function resolveManifestIconSrc(rawSrc) {
  const src = String(rawSrc || '').trim();
  if (!src) return '';
  if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
  if (!src.startsWith('/')) return '';

  const localPath = path.join(__dirname, src.replace(/^\/+/, '').replace(/\//g, path.sep));
  try {
    return fs.existsSync(localPath) ? src : '';
  } catch (e) {
    return '';
  }
}

function pickManifestIconSrc(candidates) {
  const list = Array.isArray(candidates) ? candidates : [];
  for (const candidate of list) {
    const resolved = resolveManifestIconSrc(candidate);
    if (resolved) return resolved;
  }
  return '';
}

app.locals.manifestUrl = function manifestUrl(options = {}) {
  const appType = normalizeManifestApp(options.appType);
  const qs = new URLSearchParams();
  qs.set('app', appType);
  qs.set('start', toManifestPathname(options.startPath));
  const tenantId = Number(options.tenantId);
  if (Number.isFinite(tenantId) && tenantId > 0) {
    qs.set('tenant_id', String(tenantId));
  }
  const versionToken = String(options.versionToken || '').trim();
  if (versionToken) {
    qs.set('v', versionToken);
  }
  if (appType === 'admin') {
    const title = normalizeManifestTitle(options.title);
    if (title) {
      qs.set('title', title);
    }
  }
  return `/manifest.json?${qs.toString()}`;
};

app.use((req, res, next) => {
  res.locals.currentPath = toManifestPathname(req.path || '/');
  next();
});

// Helper для версионирования URL картинок по времени изменения файла
app.locals.imageUrl = function imageUrl(src) {
  try {
    if (!src || typeof src !== 'string') return src;

    // Внешние / data-URL не трогаем
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;

    // Работаем только с картинками из /static
    if (!src.startsWith('/static/')) return src;

    const relativePath = src.replace(/^\/static\//, '');
    const version = getStaticFileVersionCached(relativePath);

    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}v=${version}`;
  } catch (e) {
    // Если файла нет или ошибка — возвращаем исходный URL
    return src;
  }
};

function getSubdomain(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return null;
  if (host === 'localhost') return null;
  const parts = host.split('.');

  // shop.localhost -> shop
  if (parts.length === 2 && parts[1] === 'localhost') return parts[0];

  // Для обычных доменов:
  // markin-me.ru (2 части) -> нет субдомена (основной домен)
  // posham.markin-me.ru (3 части) -> posham (субдомен)
  // www.markin-me.ru -> www (но www обычно игнорируется)
  if (parts.length >= 3) {
    const sub = parts[0];
    // Игнорируем www как субдомен
    if (sub === 'www') return null;
    return sub;
  }

  return null;
}

function normalizeHostForMatch(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return '';
  const ascii = String(domainToASCII(host) || '').trim().toLowerCase();
  return ascii || host;
}

async function resolveTenant(req) {
  const host = normalizeHostForMatch(req.hostname);
  const queryTenantId = Number(req.query.tenant_id);
  const querySubdomain = helpers.strOrNull(req.query.subdomain);
  let tenant = null;

  if (Number.isFinite(queryTenantId) && queryTenantId > 0) {
    tenant = await findTenantById(queryTenantId);
  } else if (querySubdomain) {
    tenant = await findTenantBySubdomain(querySubdomain.toLowerCase());
  } else if (host) {
    tenant = await findTenantByHost(host);
  }

  if (!tenant) {
    tenant = await findTenantById(1);
  }

  return tenant;
}

async function findTenantByHost(hostname) {
  const host = normalizeHostForMatch(hostname);
  if (!host) return null;

  const cacheKey = `tenant:host:${host}`;
  const cached = getFreshCachedValue(tenantLookupCache, cacheKey);
  if (cached.hit) return cached.value;

  // Split lookup to keep index-friendly predicates and avoid expensive OR scans.
  const [asciiRows] = await db.query(
    'SELECT * FROM ten_tenants WHERE custom_domain_ascii=? LIMIT 1',
    [host]
  );
  let tenant = asciiRows[0] || null;

  if (!tenant) {
    const [legacyRows] = await db.query(
      'SELECT * FROM ten_tenants WHERE custom_domain=? LIMIT 1',
      [host]
    );
    tenant = legacyRows[0] || null;
  }

  if (!tenant) {
    const sub = getSubdomain(host);
    if (sub) {
      tenant = await findTenantBySubdomain(sub);
    }
  }

  setCachedValue(tenantLookupCache, cacheKey, tenant, TENANT_LOOKUP_CACHE_MS);
  if (tenant) cacheTenantRecord(tenant);
  return tenant;
}

async function isTenantHost(req) {
  const host = normalizeHostForMatch(req.hostname);
  if (!host) return false;
  const tenant = await findTenantByHost(host);
  if (tenant) req._resolvedTenant = tenant;
  return Boolean(tenant && tenant.id);
}

async function renderShop(req, res) {
  try {
    const tenant = req._resolvedTenant || await resolveTenant(req);

    const pageTitle = (tenant && (tenant.site_name || tenant.name)) ? (tenant.site_name || tenant.name) : 'Магазин';
    const tenantId = tenant && tenant.id ? tenant.id : 1;
    res.render('pages/shop', { pageTitle, tenant, tenantId });
  } catch (err) {
    console.error('Ошибка загрузки страницы:', err);
    res.status(500).send('Ошибка загрузки страницы');
  }
}


// ------------------------------
// API: Auth (публичные роуты)
// ------------------------------
app.use(async (req, res, next) => {
  const route = String(req.path || '');
  const isAdminRoute = (
    route === '/login'
    || route === '/register'
    || route.startsWith('/dashboard')
    || route.startsWith('/api/auth')
    || route.startsWith('/api/admin')
  );

  if (!isAdminRoute) return next();

  try {
    const tenantHost = await isTenantHost(req);
    if (!tenantHost) return next();

    if (route.startsWith('/api/')) {
      return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    }

    return renderShop(req, res);
  } catch (err) {
    console.error('Admin host guard error:', err);
    return next();
  }
});

app.use('/api/auth', makeAuthRouter({ db, helpers }));

// ------------------------------
// Pages
// ------------------------------
app.get('/manifest.json', async (req, res) => {
  try {
    const appType = normalizeManifestApp(req.query.app);
    const tenant = await resolveTenant(req);
    const tenantHostShop = Boolean(await findTenantByHost(req.hostname));
    const startPath = normalizeManifestStartPath(req.query.start, {
      appType,
      tenantHostShop,
    });
    const tenantName = (tenant && (tenant.site_name || tenant.name)) ? (tenant.site_name || tenant.name) : 'Магазин';
    const tenantId = Number(tenant && tenant.id ? tenant.id : 0) || 0;
    const adminPageTitle = appType === 'admin'
      ? getAdminManifestPageTitle(startPath, req.query.title)
      : '';
    const scope = appType === 'admin'
      ? '/dashboard/'
      : (tenantHostShop ? '/' : '/shop');
    const manifestName = appType === 'admin'
      ? `${tenantName} Админка`
      : tenantName;
    const manifestShortName = appType === 'admin'
      ? 'Админка'
      : tenantName;
    const name = (tenant && (tenant.site_name || tenant.name)) ? (tenant.site_name || tenant.name) : 'Магазин';
    const iconBase = pickManifestIconSrc(tenant ? [
      tenant.android_icon_url,
      tenant.apple_touch_icon_url,
      tenant.logo_light_url,
      tenant.logo_dark_url,
      tenant.favicon_light_url,
      tenant.favicon_dark_url
    ] : []);

    const icons = [];
    if (iconBase) {
      icons.push({ src: iconBase, sizes: '192x192', purpose: 'any' });
      icons.push({ src: iconBase, sizes: '512x512', purpose: 'any' });
      icons.push({ src: iconBase, sizes: '192x192', purpose: 'maskable' });
      icons.push({ src: iconBase, sizes: '512x512', purpose: 'maskable' });
    }

    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Vary', 'Host');
    res.json({
      id: appType === 'admin'
        ? buildAdminManifestId(tenantId, startPath)
        : `/pwa/shop/t${tenantId}`,
      name: appType === 'admin' ? adminPageTitle : manifestName,
      short_name: appType === 'admin' ? adminPageTitle : manifestShortName,
      description: (tenant && tenant.site_description) ? tenant.site_description : undefined,
      start_url: startPath,
      scope,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons
    });
  } catch (err) {
    console.error('Ошибка генерации manifest:', err);
    res.status(500).json({});
  }
});

// Service Worker для PWA (Android / установка на домашний экран)
const serviceWorkerPrecacheUrls = [
  app.locals.assetUrl('/static/css/style.css'),
  app.locals.assetUrl('/static/js/auth.js'),
  app.locals.assetUrl('/static/js/current-time.js'),
  app.locals.assetUrl('/static/js/theme.js'),
  app.locals.assetUrl('/static/js/sidebar.js'),
  app.locals.assetUrl('/static/js/admin-mobile-nav.js'),
  app.locals.assetUrl('/static/js/chat-sidebar-badge.js'),
  app.locals.assetUrl('/static/js/appModal.js'),
  app.locals.assetUrl('/static/js/shared-order-panel.js'),
  app.locals.assetUrl('/static/js/shared-order-payment.js'),
  app.locals.assetUrl('/static/js/new-order.js'),
  app.locals.assetUrl('/static/js/courier-screen.js'),
  app.locals.assetUrl('/static/js/orders.js')
];
const serviceWorkerWarmPages = [
  '/dashboard/cash',
  '/dashboard/products',
  '/dashboard/orders',
  '/dashboard/courier-screen',
  '/dashboard/new-order',
  '/dashboard/clients',
  '/dashboard/chat',
  '/dashboard/team',
  '/dashboard/settings'
];
const serviceWorkerScript = `
var SW_VERSION = ${JSON.stringify(APP_CACHE_VERSION)};
var STATIC_CACHE = 'admin-static-' + SW_VERSION;
var PAGE_CACHE = 'admin-pages-' + SW_VERSION;
var PRECACHE_URLS = ${JSON.stringify(serviceWorkerPrecacheUrls)};
var WARM_PAGES = ${JSON.stringify(serviceWorkerWarmPages)};

function shouldCacheResponse(response) {
  return !!response && (response.ok || response.type === 'opaqueredirect');
}

async function cacheStaticAssets() {
  var cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(PRECACHE_URLS.map(function (url) {
    return cache.add(url);
  }));
}

async function warmPages() {
  await Promise.allSettled(WARM_PAGES.map(async function (url) {
    try {
      var response = await fetch(url, { credentials: 'same-origin' });
      if (shouldCacheResponse(response)) {
        var cache = await caches.open(PAGE_CACHE);
        await cache.put(url, response.clone());
      }
    } catch (err) {
      return null;
    }
    return null;
  }));
}

async function cacheFirst(request) {
  var cache = await caches.open(STATIC_CACHE);
  var cached = await cache.match(request);
  if (cached) return cached;

  var response = await fetch(request);
  if (shouldCacheResponse(response)) {
    cache.put(request, response.clone()).catch(function () {});
  }
  return response;
}

async function fetchAndCachePage(request) {
  var cache = await caches.open(PAGE_CACHE);
  var response = await fetch(request);
  if (shouldCacheResponse(response)) {
    cache.put(request, response.clone()).catch(function () {});
  }
  return response;
}

async function staleWhileRevalidate(request, event) {
  var cache = await caches.open(PAGE_CACHE);
  var cached = await cache.match(request) || await cache.match(request.url);
  var networkPromise = fetchAndCachePage(request);

  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(networkPromise.catch(function () {}));
  }

  if (cached) return cached;
  return networkPromise;
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all([
      cacheStaticAssets().catch(function () {}),
      warmPages().catch(function () {})
    ]).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key === STATIC_CACHE || key === PAGE_CACHE) return Promise.resolve();
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (!request || request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (err) {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname.indexOf('/api/') === 0) return;

  if (url.pathname === '/manifest.json') {
    event.respondWith(fetch(request));
    return;
  }

  if (
    url.pathname.indexOf('/static/') === 0
    || url.pathname === '/sw.js'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate' && url.pathname.indexOf('/dashboard') === 0) {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

self.addEventListener('push', function (event) {
  var payload = {};
  try {
    payload = event && event.data ? event.data.json() : {};
  } catch (e1) {
    try {
      payload = { body: event && event.data ? event.data.text() : '' };
    } catch (e2) {
      payload = {};
    }
  }
  var title = String((payload && payload.title) || '\\u041d\\u043e\\u0432\\u043e\\u0435 \\u0441\\u043e\\u043e\\u0431\\u0449\\u0435\u043d\u0438\u0435');
  var body = String((payload && payload.body) || '');
  var tag = String((payload && payload.tag) || 'chat-message');
  var url = String((payload && payload.url) || '/shop');
  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      tag: tag,
      renotify: true,
      data: { url: url }
    })
  );
});
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var data = event.notification && event.notification.data ? event.notification.data : {};
  var targetUrl = data && data.url ? String(data.url) : '/shop';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i += 1) {
        var client = clientList[i];
        if (!client || !client.url) continue;
        if (client.url.indexOf(targetUrl) !== -1) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});
`;
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.send(serviceWorkerScript);
});

app.use(async (req, res, next) => {
  if (
    req.path.startsWith('/api')
    || req.path.startsWith('/static')
    || req.path.startsWith('/dashboard')
    || req.path === '/manifest.json'
    || req.path === '/sw.js'
    || req.path === '/max-app'
  ) return next();
  try {
    const tenant = await findTenantByHost(req.hostname);
    if (tenant) {
      req._resolvedTenant = tenant;
      return renderShop(req, res);
    }
  } catch (e) { /* ignore */ }
  return next();
});

app.get('/', (req, res) => res.render('pages/saas'));

app.get('/login', (req, res) => {
  try {
    res.render('pages/auth', { mode: 'login' });
  } catch (err) {
    console.error('Ошибка рендеринга страницы логина:', err);
    res.status(500).send('Ошибка загрузки страницы');
  }
});

app.get('/register', (req, res) => {
  try {
    res.render('pages/auth', { mode: 'register' });
  } catch (err) {
    console.error('Ошибка рендеринга страницы регистрации:', err);
    res.status(500).send('Ошибка загрузки страницы');
  }
});

// Telegram mini app entry-point (versioned redirect)
app.get('/tg-app', (req, res) => {
  try {
    const qs = new URLSearchParams(req.query);
    qs.set('v', TELEGRAM_APP_VERSION);
    const target = `/telegram/app?${qs.toString()}`;
    res.redirect(302, target);
  } catch (err) {
    console.error('Ошибка редиректа /tg-app:', err);
    res.redirect(302, '/');
  }
});

// Telegram mini app: витрина как на /shop или posham.localhost:3000/
app.get('/telegram/app', (req, res) => {
  return renderShop(req, res);
});

function extractMaxAppLaunchToken(req) {
  const candidates = [
    req.query && req.query.ptoken,
    req.query && req.query.token,
    req.query && req.query.startapp,
    req.query && req.query.start,
    req.query && req.query.payload,
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    const prefixed = raw.match(/^(?:ptoken|token|login|auth)[:=](.+)$/i);
    const token = prefixed && prefixed[1] ? String(prefixed[1]).trim() : raw;
    if (token) return token;
  }
  return '';
}

// MAX mini app entry-point.
// If launch payload carries auth token, complete login first and then open mini app.
app.get('/max-app', (req, res) => {
  try {
    const launchToken = extractMaxAppLaunchToken(req);
    if (launchToken) {
      const qs = new URLSearchParams();
      qs.set('ptoken', launchToken);
      qs.set('target', 'miniapp');
      return res.redirect(302, `/api/public/max/finish-login?${qs.toString()}`);
    }
  } catch (err) {
    console.error('Ошибка обработки /max-app launch token:', err);
  }
  return renderShop(req, res);
});

// Защищённые страницы (проверка авторизации на клиенте через JS)
app.get('/dashboard/cash', (req, res) => res.render('pages/cash'));
app.get('/dashboard/products', (req, res) => res.render('pages/products'));
app.get('/dashboard/orders', (req, res) => res.render('pages/orders'));
app.get('/dashboard/courier-screen', (req, res) => res.render('pages/courier-screen'));
app.get('/dashboard/new-order', (req, res) => res.render('pages/new-order'));
app.get('/dashboard/clients', (req, res) => res.render('pages/clients', { activePage: 'clients' }));
app.get('/dashboard/chat', (req, res) => res.render('pages/chat', { activePage: 'chat' }));
app.get('/dashboard/team', (req, res) => res.render('pages/home', { activePage: 'team' }));
app.get('/dashboard/settings', (req, res) =>
  res.render('pages/home', {
    activePage: 'settings',
    telegramBotUsername: getSystemTelegramConfig().telegram_bot_username
  })
);

// ------------------------------
// Shop (витрина)
// ------------------------------
app.get('/shop', renderShop);

app.get('/auth', (req, res) => res.redirect('/login'));

// ------------------------------
// Telegram webhook (публичный, без авторизации)
// ------------------------------
app.post('/api/telegram/webhook', (req, res) => {
  res.sendStatus(200);
  const token = getSystemTelegramConfig().telegram_bot_token;
  const update = req.body;
  if (token && update) {
    handleWebhookUpdate(db, token, update).catch((err) => console.error('Telegram webhook:', err));
  }
});

// ------------------------------
// API: Public (публичные роуты должны быть ПЕРЕД админскими)
// ------------------------------
app.use('/api/public', makePublicShopRouter({ db, helpers, ordersEvents }));
app.use('/api/print', makePrintApiRouter({ db, helpers }));
app.use('/api/chat-temp', makeChatTempRouter());

// ------------------------------
// API: Admin (требуют авторизации)
// ------------------------------
app.use('/api/admin/clients', authMiddleware, makeAdminClientsRouter({ db, helpers }));
app.use('/api/admin/discounts', authMiddleware, makeAdminDiscountsRouter({ db, helpers }));
app.use('/api/admin/orders', authMiddleware, makeAdminOrdersRouter({ db, helpers, ordersEvents }));
app.use('/api/admin/tenant', authMiddleware, makeAdminTenantRouter({ db, helpers }));
app.use('/api/admin/stock', authMiddleware, makeAdminStockRouter({ db, helpers, ordersEvents }));

// товары/категории/сортировка/загрузка — оставляем старые пути /api/prod_* и /api/sort/*
// Применяем middleware ко всем роутам products роутера
const adminProductsRouter = makeAdminProductsRouter({ db, helpers });
app.use('/api', authMiddleware, adminProductsRouter);

// ------------------------------
// Global errors (в т.ч. multer)
// ------------------------------
app.use((err, req, res, next) => {
  if (!err) return next();

  if (err && err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ ok: false, error: 'FILE_TOO_LARGE' });
    if (err.code === 'LIMIT_FILE_COUNT') return res.status(400).json({ ok: false, error: 'TOO_MANY_FILES' });
    return res.status(400).json({ ok: false, error: 'UPLOAD_ERROR' });
  }

  if (err && err.message === 'ONLY_IMAGES') {
    return res.status(400).json({ ok: false, error: 'ONLY_IMAGES' });
  }

  console.error(err);
  return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
});

function startTelegramEnvPollingIfNeeded() {
  if (!runtimePollingState.telegram_env_enabled) return;
  if (telegramEnvPollingHandle) return;

  const systemTelegramConfig = getSystemTelegramConfig();
  const telegramToken = systemTelegramConfig.telegram_bot_token;
  const webhookUrl = systemTelegramConfig.telegram_webhook_url;
  if (!telegramToken || webhookUrl) return;

  try {
    telegramEnvPollingHandle = startTelegramPolling(db, telegramToken) || null;
  } catch (e) {
    console.error('Telegram bot start error:', e.message);
  }
}

function stopTelegramEnvPollingIfRunning() {
  if (!telegramEnvPollingHandle) return;
  try {
    if (typeof telegramEnvPollingHandle.stop === 'function') telegramEnvPollingHandle.stop();
  } catch (e) {
    console.error('Telegram bot stop error:', e.message || e);
  } finally {
    telegramEnvPollingHandle = null;
  }
}

async function syncSystemTelegramRuntime(previousConfig = null) {
  const nextConfig = getSystemTelegramConfig();
  const previousToken = previousConfig && typeof previousConfig === 'object'
    ? String(previousConfig.telegram_bot_token || '').trim()
    : '';
  const previousWebhookUrl = previousConfig && typeof previousConfig === 'object'
    ? String(previousConfig.telegram_webhook_url || '').trim()
    : '';
  const nextToken = String(nextConfig.telegram_bot_token || '').trim();
  const nextWebhookUrl = String(nextConfig.telegram_webhook_url || '').trim();

  stopTelegramEnvPollingIfRunning();

  if (previousToken && previousToken !== nextToken) {
    await removeTelegramWebhook(previousToken);
  }

  if (!runtimePollingState.telegram_env_enabled || !nextToken) {
    const tokenToDisable = nextToken || previousToken;
    if (tokenToDisable && (nextWebhookUrl || previousWebhookUrl)) {
      await removeTelegramWebhook(tokenToDisable);
    }
    return nextConfig;
  }

  if (nextWebhookUrl) {
    try {
      await setWebhook(nextToken, nextWebhookUrl);
    } catch (e) {
      console.error('Telegram setWebhook error:', e.message || e);
    }
    return nextConfig;
  }

  await removeTelegramWebhook(nextToken);
  startTelegramEnvPollingIfNeeded();
  return nextConfig;
}

function startTenantTelegramPollingIfNeeded() {
  if (!runtimePollingState.telegram_tenant_enabled) return;
  if (telegramTenantPollingHandle) return;
  try {
    telegramTenantPollingHandle = startTenantTelegramAuthPolling(db, helpers) || null;
  } catch (e) {
    console.error('TG auth polling start error:', e.message || e);
  }
}

function stopTenantTelegramPollingIfRunning() {
  if (!telegramTenantPollingHandle) return;
  try {
    if (typeof telegramTenantPollingHandle.stop === 'function') telegramTenantPollingHandle.stop();
  } catch (e) {
    console.error('TG auth polling stop error:', e.message || e);
  } finally {
    telegramTenantPollingHandle = null;
  }
}

app.get('/api/admin/system/polling', authMiddleware, (req, res) => {
  return res.json({
    ok: true,
    data: {
      telegram_env_enabled: Boolean(runtimePollingState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(runtimePollingState.telegram_tenant_enabled),
    },
  });
});

app.put('/api/admin/system/polling', authMiddleware, async (req, res) => {
  const hasEnv = Object.prototype.hasOwnProperty.call(req.body || {}, 'telegram_env_enabled');
  const hasTenant = Object.prototype.hasOwnProperty.call(req.body || {}, 'telegram_tenant_enabled');

  if (!hasEnv && !hasTenant) {
    return res.status(400).json({ ok: false, error: 'NO_FIELDS' });
  }

  const previousConfig = hasEnv ? getSystemTelegramConfig() : null;

  if (hasEnv) {
    runtimePollingState.telegram_env_enabled = Boolean(req.body.telegram_env_enabled);
  }

  if (hasTenant) {
    runtimePollingState.telegram_tenant_enabled = Boolean(req.body.telegram_tenant_enabled);
    if (runtimePollingState.telegram_tenant_enabled) startTenantTelegramPollingIfNeeded();
    else stopTenantTelegramPollingIfRunning();
  }

  writeSystemSettings(runtimePollingState, { defaults: runtimePollingState });

  if (hasEnv) {
    await syncSystemTelegramRuntime(previousConfig);
  }

  return res.json({
    ok: true,
    data: {
      telegram_env_enabled: Boolean(runtimePollingState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(runtimePollingState.telegram_tenant_enabled),
    },
  });
});

app.get('/api/admin/system/telegram-bot', authMiddleware, (req, res) => {
  return res.json({
    ok: true,
    data: {
      ...getSystemTelegramConfig(),
      telegram_env_enabled: Boolean(runtimePollingState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(runtimePollingState.telegram_tenant_enabled),
    },
  });
});

app.put('/api/admin/system/telegram-bot', authMiddleware, async (req, res) => {
  const body = req.body || {};
  const hasUsername = hasOwn(body, 'telegram_bot_username');
  const hasToken = hasOwn(body, 'telegram_bot_token');
  const hasWebhook = hasOwn(body, 'telegram_webhook_url');
  const hasEnvEnabled = hasOwn(body, 'telegram_env_enabled');
  const hasTenantEnabled = hasOwn(body, 'telegram_tenant_enabled');
  const hasConfigFields = hasUsername || hasToken || hasWebhook;

  if (!hasConfigFields && !hasEnvEnabled && !hasTenantEnabled) {
    return res.status(400).json({ ok: false, error: 'NO_FIELDS' });
  }

  const previousConfig = getSystemTelegramConfig();
  const telegramBotUsername = hasUsername
    ? normalizeTelegramBotUsername(body.telegram_bot_username)
    : previousConfig.telegram_bot_username;
  const telegramBotToken = hasToken
    ? normalizeTelegramBotToken(body.telegram_bot_token)
    : previousConfig.telegram_bot_token;
  const telegramWebhookUrl = hasWebhook
    ? normalizeTelegramWebhookUrl(body.telegram_webhook_url)
    : previousConfig.telegram_webhook_url;
  const isClearingConfig = !telegramBotUsername && !telegramBotToken && !telegramWebhookUrl;

  if (hasConfigFields && !telegramBotToken && !isClearingConfig) {
    return res.status(400).json({ ok: false, error: 'TOKEN_REQUIRED' });
  }

  if (telegramWebhookUrl && !isAbsoluteHttpUrl(telegramWebhookUrl)) {
    return res.status(400).json({ ok: false, error: 'INVALID_WEBHOOK_URL' });
  }

  if (hasEnvEnabled) {
    runtimePollingState.telegram_env_enabled = Boolean(body.telegram_env_enabled);
  }

  if (hasTenantEnabled) {
    runtimePollingState.telegram_tenant_enabled = Boolean(body.telegram_tenant_enabled);
    if (runtimePollingState.telegram_tenant_enabled) startTenantTelegramPollingIfNeeded();
    else stopTenantTelegramPollingIfRunning();
  }

  const savedState = writeSystemSettings(
    {
      telegram_bot_username: telegramBotUsername,
      telegram_bot_token: telegramBotToken,
      telegram_webhook_url: telegramWebhookUrl,
      telegram_env_enabled: runtimePollingState.telegram_env_enabled,
      telegram_tenant_enabled: runtimePollingState.telegram_tenant_enabled,
    },
    { defaults: runtimePollingState }
  );

  if (!savedState) {
    return res.status(500).json({ ok: false, error: 'SYSTEM_SETTINGS_WRITE_FAILED' });
  }

  if (hasConfigFields || hasEnvEnabled) {
    await syncSystemTelegramRuntime(previousConfig);
  }

  return res.json({
    ok: true,
    data: {
      ...getSystemTelegramConfig(savedState),
      telegram_env_enabled: Boolean(runtimePollingState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(runtimePollingState.telegram_tenant_enabled),
    },
  });
});

app.get('/api/admin/system/map-provider', authMiddleware, (req, res) => {
  return res.json({
    ok: true,
    data: getSystemMapConfig(),
  });
});

app.put('/api/admin/system/map-provider', authMiddleware, (req, res) => {
  const body = req.body || {};
  const hasProviderName = hasOwn(body, 'provider_name');
  const hasTileUrl = hasOwn(body, 'tile_url');
  const hasAttribution = hasOwn(body, 'attribution');
  const hasMaxZoom = hasOwn(body, 'max_zoom');
  const hasSubdomains = hasOwn(body, 'subdomains');
  const hasGeocoderProviderName = hasOwn(body, 'geocoder_provider_name');
  const hasGeocoderSearchUrl = hasOwn(body, 'geocoder_search_url');
  const hasGeocoderCountryCode = hasOwn(body, 'geocoder_country_code');
  const hasGeocoderLanguage = hasOwn(body, 'geocoder_language');
  const hasGeocoderResultLimit = hasOwn(body, 'geocoder_result_limit');
  const hasStoreAddressMapEnabled = hasOwn(body, 'store_address_map_enabled');

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
  ) {
    return res.status(400).json({ ok: false, error: 'NO_FIELDS' });
  }

  const currentConfig = getSystemMapConfig();
  const providerName = hasProviderName
    ? normalizeMapProviderName(body.provider_name)
    : currentConfig.provider_name;
  const tileUrl = hasTileUrl
    ? normalizeMapTileUrl(body.tile_url)
    : currentConfig.tile_url;
  const attribution = hasAttribution
    ? normalizeMapAttribution(body.attribution)
    : currentConfig.attribution;
  const maxZoom = hasMaxZoom
    ? normalizeMapMaxZoom(body.max_zoom)
    : currentConfig.max_zoom;
  const subdomains = hasSubdomains
    ? normalizeMapSubdomains(body.subdomains)
    : currentConfig.subdomains;
  const geocoderProviderName = hasGeocoderProviderName
    ? normalizeMapGeocoderProviderName(body.geocoder_provider_name)
    : currentConfig.geocoder_provider_name;
  const geocoderSearchUrl = hasGeocoderSearchUrl
    ? normalizeMapGeocoderSearchUrl(body.geocoder_search_url)
    : currentConfig.geocoder_search_url;
  const geocoderCountryCode = hasGeocoderCountryCode
    ? normalizeMapGeocoderCountryCode(body.geocoder_country_code)
    : currentConfig.geocoder_country_code;
  const geocoderLanguage = hasGeocoderLanguage
    ? normalizeMapGeocoderLanguage(body.geocoder_language)
    : currentConfig.geocoder_language;
  const geocoderResultLimit = hasGeocoderResultLimit
    ? normalizeMapGeocoderResultLimit(body.geocoder_result_limit)
    : currentConfig.geocoder_result_limit;
  const storeAddressMapEnabled = hasStoreAddressMapEnabled
    ? normalizeMapStoreAddressEnabled(body.store_address_map_enabled)
    : Boolean(currentConfig.store_address_map_enabled);
  const hasTileConfig = Boolean(providerName || tileUrl || attribution || subdomains);
  const hasGeocoderConfig = Boolean(geocoderProviderName || geocoderSearchUrl);

  if (hasTileConfig) {
    if (!tileUrl) {
      return res.status(400).json({ ok: false, error: 'TILE_URL_REQUIRED' });
    }
    if (!isValidMapTileUrl(tileUrl)) {
      return res.status(400).json({ ok: false, error: 'INVALID_TILE_URL' });
    }
    if (maxZoom == null || maxZoom < 0 || maxZoom > 22) {
      return res.status(400).json({ ok: false, error: 'INVALID_MAX_ZOOM' });
    }
  }

  if (hasGeocoderConfig) {
    if (!geocoderSearchUrl) {
      return res.status(400).json({ ok: false, error: 'GEOCODER_SEARCH_URL_REQUIRED' });
    }
    if (!isValidGeocoderSearchUrl(geocoderSearchUrl)) {
      return res.status(400).json({ ok: false, error: 'INVALID_GEOCODER_SEARCH_URL' });
    }
    if (geocoderResultLimit == null || geocoderResultLimit < 1 || geocoderResultLimit > 10) {
      return res.status(400).json({ ok: false, error: 'INVALID_GEOCODER_RESULT_LIMIT' });
    }
  }

  const savedState = writeSystemSettings(
    {
      provider_name: providerName,
      tile_url: tileUrl,
      attribution,
      max_zoom: maxZoom,
      subdomains,
      geocoder_provider_name: geocoderProviderName,
      geocoder_search_url: geocoderSearchUrl,
      geocoder_country_code: geocoderCountryCode,
      geocoder_language: geocoderLanguage,
      geocoder_result_limit: geocoderResultLimit,
      store_address_map_enabled: storeAddressMapEnabled,
    },
    { defaults: runtimePollingState }
  );

  if (!savedState) {
    return res.status(500).json({ ok: false, error: 'SYSTEM_SETTINGS_WRITE_FAILED' });
  }

  return res.json({
    ok: true,
    data: getSystemMapConfig(savedState),
  });
});

app.get('/api/admin/system/map-geocode', authMiddleware, async (req, res) => {
  const query = String((req.query && req.query.q) || '').trim();
  const result = await searchSystemMapGeocoder(query);
  if (!result || !result.ok) {
    const error = result && result.error ? result.error : 'GEOCODER_UPSTREAM_ERROR';
    const status = error === 'QUERY_REQUIRED' || error === 'GEOCODER_NOT_CONFIGURED' ? 400 : 502;
    return res.status(status).json({ ok: false, error });
  }
  return res.json({ ok: true, data: result.data });
});

app.get('/api/admin/system/address-suggest', authMiddleware, async (req, res) => {
  const stage = String((req.query && req.query.stage) || '').trim().toLowerCase();
  const query = String((req.query && req.query.q) || '').trim();
  const city = String((req.query && req.query.city) || '').trim();
  const street = String((req.query && req.query.street) || '').trim();
  const result = await searchSystemAddressSuggest(stage, query, { city, street });
  if (!result || !result.ok) {
    const error = result && result.error ? result.error : 'GEOCODER_UPSTREAM_ERROR';
    const status = (
      error === 'STAGE_REQUIRED'
      || error === 'QUERY_REQUIRED'
      || error === 'CITY_REQUIRED'
      || error === 'STREET_REQUIRED'
      || error === 'GEOCODER_NOT_CONFIGURED'
    ) ? 400 : error === 'GEOCODER_RATE_LIMITED' ? 429 : 502;
    return res.status(status).json({ ok: false, error });
  }
  return res.json({ ok: true, data: result.data });
});

app.get('/internal/address/city-suggest', authMiddleware, async (req, res) => {
  if (!isAddressServiceConfigured()) {
    return res.status(503).json({ ok: false, error: 'ADDRESS_SERVICE_NOT_CONFIGURED' });
  }
  const query = String((req.query && req.query.q) || '').trim();
  const result = await suggestAddressServiceCities(query, {
    limit: req.query && req.query.limit,
  });
  if (!result || !result.ok) {
    const error = result && result.error ? result.error : 'ADDRESS_SERVICE_UNAVAILABLE';
    const status = error === 'QUERY_REQUIRED' ? 400 : 503;
    return res.status(status).json({ ok: false, error });
  }
  return res.json({ ok: true, data: result.data });
});

app.get('/internal/address/suggest', authMiddleware, async (req, res) => {
  if (!isAddressServiceConfigured()) {
    return res.status(503).json({ ok: false, error: 'ADDRESS_SERVICE_NOT_CONFIGURED' });
  }
  const stage = String((req.query && req.query.stage) || '').trim().toLowerCase() || 'street';
  const query = String((req.query && req.query.q) || '').trim();
  const city = String((req.query && req.query.city) || '').trim();
  const cityId = String((req.query && req.query.city_id) || '').trim();
  const cityCode = String((req.query && req.query.city_code) || '').trim();
  const selectedSourceKey = String((req.query && req.query.selected_source_key) || '').trim();
  const result = await suggestAddressServiceAddresses(query, {
    stage,
    city,
    cityId,
    cityCode,
    selectedSourceKey,
    limit: req.query && req.query.limit,
  });
  if (!result || !result.ok) {
    const error = result && result.error ? result.error : 'ADDRESS_SERVICE_UNAVAILABLE';
    const status = (
      error === 'QUERY_REQUIRED'
      || error === 'CITY_REQUIRED'
    ) ? 400 : 503;
    return res.status(status).json({ ok: false, error });
  }
  return res.json({ ok: true, data: result.data });
});

app.post('/internal/address/resolve', authMiddleware, async (req, res) => {
  if (!isAddressServiceConfigured()) {
    return res.status(503).json({ ok: false, error: 'ADDRESS_SERVICE_NOT_CONFIGURED' });
  }
  const result = await resolveAddressThroughService(req.body || {});
  if (!result || !result.ok) {
    const error = result && result.error ? result.error : 'ADDRESS_SERVICE_UNAVAILABLE';
    const status = (
      error === 'ADDRESS_REQUIRED'
      || error === 'CITY_REQUIRED'
      || error === 'CITY_SELECTION_REQUIRED'
      || error === 'HOUSE_REQUIRED'
      || error === 'ADDRESS_NOT_FOUND'
    ) ? 400 : 503;
    return res.status(status).json({ ok: false, error, data: result && result.data ? result.data : undefined });
  }
  return res.json(result);
});

app.get('/api/admin/system/address-suggest-local', authMiddleware, async (req, res) => {
  const stage = String((req.query && req.query.stage) || '').trim().toLowerCase();
  const query = String((req.query && req.query.q) || '').trim();
  const city = String((req.query && req.query.city) || '').trim();
  const citySourceKey = String((req.query && req.query.city_source_key) || '').trim();
  const selectedSourceKey = String((req.query && req.query.selected_source_key) || '').trim();
  if (isAddressServiceConfigured()) {
    const result = stage === 'city'
      ? await suggestAddressServiceCities(query, { limit: req.query && req.query.limit })
      : await suggestAddressServiceAddresses(query, {
        stage: stage || 'street',
        city,
        cityId: String((req.query && req.query.city_id) || '').trim(),
        cityCode: String((req.query && req.query.city_code) || '').trim(),
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
    tenantId: req.user && req.user.tenantId,
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
});

// ------------------------------
// Start
// ------------------------------
function resolveListenTarget() {
  const listen = String(process.env.LISTEN || '').trim();
  if (!listen) return { port: Number(PORT) || 3000 };

  // Passenger often provides LISTEN as host:port, e.g. 127.0.0.1:61065
  const idx = listen.lastIndexOf(':');
  if (idx > 0) {
    const host = listen.slice(0, idx).trim();
    const portRaw = listen.slice(idx + 1).trim();
    const port = Number(portRaw);
    if (host && Number.isFinite(port) && port > 0) {
      return { host, port };
    }
  }

  const port = Number(listen);
  if (Number.isFinite(port) && port > 0) {
    return { port };
  }

  return { path: listen };
}

const listenTarget = resolveListenTarget();
const server = listenTarget.path
  ? app.listen(listenTarget.path)
  : app.listen(listenTarget.port, listenTarget.host);

server.on('listening', () => {
  const bindLabel = listenTarget.path
    ? listenTarget.path
    : `${listenTarget.host || '0.0.0.0'}:${listenTarget.port}`;
  console.log(`Server bind target: ${bindLabel}`);
  console.log(`Passenger mode: ${String(process.env.IN_PASSENGER || '').trim() === '1' ? 'yes' : 'no'}`);
  console.log(`🚀 Сервер запущен на ${PORT}`);
  console.log(`📝 Откройте http://localhost:${PORT}/login в браузере`);
  syncSystemTelegramRuntime().catch((e) => console.error('Telegram runtime sync error:', e.message || e));

  try {
    startMaxPolling(db, helpers);
  } catch (e) {
    console.error('MAX bot start error:', e.message || e);
  }

  if (runtimePollingState.telegram_tenant_enabled) {
    try {
      telegramTenantPollingHandle = startTenantTelegramAuthPolling(db, helpers) || null;
    } catch (e) {
      console.error('TG auth polling start error:', e.message || e);
    }
  }
});

server.on('error', (err) => {
  console.error('Ошибка запуска сервера:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Остановите другой процесс или измените PORT.`);
  }
  process.exit(1);
});

