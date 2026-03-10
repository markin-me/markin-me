const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const { domainToASCII } = require('url');

const db = require('./db');
const helpers = require('./api/helpers');
const { createOrdersEventsHub } = require('./api/ordersEvents');
const { startPolling: startTelegramPolling, handleWebhookUpdate, setWebhook } = require('./api/telegramBot');
const { startMaxPolling } = require('./api/maxBotPolling');
const { startTenantTelegramAuthPolling } = require('./api/tgAuthBotPolling');

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
const TELEGRAM_APP_VERSION = process.env.TG_APP_VERSION || '1.9.23';
const APP_CACHE_VERSION = String(TELEGRAM_APP_VERSION || '1.9.23').trim() || '1.9.23';
const STATIC_ASSET_VERSION = String(
  process.env.STATIC_ASSET_VERSION || APP_CACHE_VERSION || ''
).trim();
const PORT = process.env.PORT || 3000;
const TENANT_LOOKUP_CACHE_MS = Number(process.env.TENANT_LOOKUP_CACHE_MS || 60_000);
const STATIC_FILE_VERSION_CACHE_MS = Number(process.env.STATIC_FILE_VERSION_CACHE_MS || 300_000);
const SYSTEM_SETTINGS_DIR = path.join(__dirname, 'data');
const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'system-settings.json');
const runtimePollingState = {
  telegram_env_enabled: String(process.env.DISABLE_TELEGRAM_POLLING || '').trim() !== '1',
  telegram_tenant_enabled: String(process.env.DISABLE_TG_AUTH_POLLING || '').trim() !== '1',
};
const tenantLookupCache = new Map();
const staticVersionCache = new Map();
let telegramEnvPollingHandle = null;
let telegramTenantPollingHandle = null;
let fatalErrorLogged = false;

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

function readSystemSettings() {
  try {
    if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.error('System settings read error:', e.message || e);
    return null;
  }
}

function writeSystemSettings(nextState) {
  try {
    if (!fs.existsSync(SYSTEM_SETTINGS_DIR)) {
      fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
    }
    const payload = {
      telegram_env_enabled: Boolean(nextState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(nextState.telegram_tenant_enabled),
      updated_at: new Date().toISOString(),
    };
    fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf8');
  } catch (e) {
    console.error('System settings write error:', e.message || e);
  }
}

function bootstrapSystemSettings() {
  const fromFile = readSystemSettings();
  if (!fromFile) return;
  if (Object.prototype.hasOwnProperty.call(fromFile, 'telegram_env_enabled')) {
    runtimePollingState.telegram_env_enabled = Boolean(fromFile.telegram_env_enabled);
  }
  if (Object.prototype.hasOwnProperty.call(fromFile, 'telegram_tenant_enabled')) {
    runtimePollingState.telegram_tenant_enabled = Boolean(fromFile.telegram_tenant_enabled);
  }
}

bootstrapSystemSettings();

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
  if (STATIC_ASSET_VERSION) return STATIC_ASSET_VERSION;
  const cacheKey = `static:version:${relativePath}`;
  const cached = getFreshCachedValue(staticVersionCache, cacheKey);
  if (cached.hit) return cached.value;

  const filePath = path.join(__dirname, 'static', relativePath);
  const stat = fs.statSync(filePath);
  const version = Math.round(stat.mtimeMs || stat.mtime.getTime());
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
    const tenant = await resolveTenant(req);
    const name = (tenant && (tenant.site_name || tenant.name)) ? (tenant.site_name || tenant.name) : 'Магазин';
    const iconBase = tenant && (
      tenant.android_icon_url ||
      tenant.apple_touch_icon_url ||
      tenant.logo_light_url ||
      tenant.logo_dark_url ||
      tenant.favicon_light_url ||
      tenant.favicon_dark_url
    );

    const icons = [];
    if (iconBase) {
      icons.push({ src: iconBase, sizes: '192x192', purpose: 'any' });
      icons.push({ src: iconBase, sizes: '512x512', purpose: 'any' });
      icons.push({ src: iconBase, sizes: '192x192', purpose: 'maskable' });
      icons.push({ src: iconBase, sizes: '512x512', purpose: 'maskable' });
    }

    res.setHeader('Content-Type', 'application/manifest+json');
    res.json({
      name,
      short_name: name,
      description: (tenant && tenant.site_description) ? tenant.site_description : undefined,
      start_url: '/shop',
      scope: '/',
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
  '/manifest.json',
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
const serviceWorkerWarmPages = ['/dashboard/courier-screen'];
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
  var cache = await caches.open(PAGE_CACHE);
  await Promise.allSettled(WARM_PAGES.map(async function (url) {
    try {
      var response = await fetch(url, { credentials: 'same-origin' });
      if (shouldCacheResponse(response)) {
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

async function networkFirst(request) {
  var cache = await caches.open(PAGE_CACHE);
  try {
    var response = await fetch(request);
    if (shouldCacheResponse(response)) {
      cache.put(request, response.clone()).catch(function () {});
    }
    return response;
  } catch (err) {
    var cached = await cache.match(request) || await cache.match(request.url);
    if (cached) return cached;
    throw err;
  }
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

  if (
    url.pathname.indexOf('/static/') === 0
    || url.pathname === '/manifest.json'
    || url.pathname === '/sw.js'
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === 'navigate' && url.pathname.indexOf('/dashboard') === 0) {
    event.respondWith(networkFirst(request));
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
    telegramBotUsername: (process.env.TELEGRAM_BOT_USERNAME || '').trim()
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
  const token = process.env.TELEGRAM_BOT_TOKEN;
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

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
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

app.put('/api/admin/system/polling', authMiddleware, (req, res) => {
  const hasEnv = Object.prototype.hasOwnProperty.call(req.body || {}, 'telegram_env_enabled');
  const hasTenant = Object.prototype.hasOwnProperty.call(req.body || {}, 'telegram_tenant_enabled');

  if (!hasEnv && !hasTenant) {
    return res.status(400).json({ ok: false, error: 'NO_FIELDS' });
  }

  if (hasEnv) {
    runtimePollingState.telegram_env_enabled = Boolean(req.body.telegram_env_enabled);
    if (runtimePollingState.telegram_env_enabled) startTelegramEnvPollingIfNeeded();
    else stopTelegramEnvPollingIfRunning();
  }

  if (hasTenant) {
    runtimePollingState.telegram_tenant_enabled = Boolean(req.body.telegram_tenant_enabled);
    if (runtimePollingState.telegram_tenant_enabled) startTenantTelegramPollingIfNeeded();
    else stopTenantTelegramPollingIfRunning();
  }

  writeSystemSettings(runtimePollingState);

  return res.json({
    ok: true,
    data: {
      telegram_env_enabled: Boolean(runtimePollingState.telegram_env_enabled),
      telegram_tenant_enabled: Boolean(runtimePollingState.telegram_tenant_enabled),
    },
  });
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
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const webhookUrl = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
  if (telegramToken && runtimePollingState.telegram_env_enabled) {
    if (webhookUrl) {
      setWebhook(telegramToken, webhookUrl)
        .then(() => console.log('📱 Telegram: webhook зарегистрирован', webhookUrl))
        .catch((e) => console.error('Telegram setWebhook error:', e.message));
    } else {
      try {
        telegramEnvPollingHandle = startTelegramPolling(db, telegramToken) || null;
      } catch (e) {
        console.error('Telegram bot start error:', e.message);
      }
    }
  }

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

