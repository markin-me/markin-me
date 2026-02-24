const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');

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
const TELEGRAM_APP_VERSION = process.env.TG_APP_VERSION || '9';
const PORT = process.env.PORT || 3000;
const SYSTEM_SETTINGS_DIR = path.join(__dirname, 'data');
const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'system-settings.json');
const runtimePollingState = {
  telegram_env_enabled: String(process.env.DISABLE_TELEGRAM_POLLING || '').trim() !== '1',
  telegram_tenant_enabled: String(process.env.DISABLE_TG_AUTH_POLLING || '').trim() !== '1',
};
let telegramEnvPollingHandle = null;
let telegramTenantPollingHandle = null;

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
    if (isImage) {
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

// Helper для версионирования статических ресурсов (CSS, JS) по времени изменения файла
app.locals.assetUrl = function assetUrl(src) {
  try {
    if (!src || typeof src !== 'string') return src;
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
    if (!src.startsWith('/static/')) return src;
    const relativePath = src.split('?')[0].replace(/^\/static\//, '');
    const filePath = path.join(__dirname, 'static', relativePath);
    const stat = fs.statSync(filePath);
    const version = Math.round(stat.mtimeMs || stat.mtime.getTime());
    const separator = src.includes('?') ? '&' : '?';
    return `${src}${separator}v=${version}`;
  } catch (e) {
    return src;
  }
};

// Helper для версионирования URL картинок по времени изменения файла
app.locals.imageUrl = function imageUrl(src) {
  try {
    if (!src || typeof src !== 'string') return src;

    // Внешние / data-URL не трогаем
    if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;

    // Работаем только с картинками из /static
    if (!src.startsWith('/static/')) return src;

    const relativePath = src.replace(/^\/static\//, '');
    const filePath = path.join(__dirname, 'static', relativePath);

    const stat = fs.statSync(filePath);
    const mtime = stat.mtimeMs || stat.mtime.getTime();
    const version = Math.round(mtime);

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

async function resolveTenant(req) {
  const host = String(req.hostname || '').toLowerCase();
  const queryTenantId = Number(req.query.tenant_id);
  const querySubdomain = helpers.strOrNull(req.query.subdomain);
  let tenant = null;

  if (Number.isFinite(queryTenantId) && queryTenantId > 0) {
    const [rows] = await db.query('SELECT * FROM ten_tenants WHERE id=? LIMIT 1', [queryTenantId]);
    tenant = rows[0] || null;
  } else if (querySubdomain) {
    const [rows] = await db.query('SELECT * FROM ten_tenants WHERE subdomain=? LIMIT 1', [querySubdomain.toLowerCase()]);
    tenant = rows[0] || null;
  } else if (host) {
    const [custom] = await db.query('SELECT * FROM ten_tenants WHERE custom_domain=? LIMIT 1', [host]);
    if (custom.length) {
      tenant = custom[0];
    } else {
      const sub = getSubdomain(host);
      if (sub) {
        const [rows] = await db.query('SELECT * FROM ten_tenants WHERE subdomain=? LIMIT 1', [sub]);
        tenant = rows[0] || null;
      }
    }
  }

  if (!tenant) {
    const [rows] = await db.query('SELECT * FROM ten_tenants WHERE id=1 LIMIT 1');
    tenant = rows[0] || null;
  }

  return tenant;
}

async function renderShop(req, res) {
  try {
    const tenant = await resolveTenant(req);

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
const serviceWorkerScript = `
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function () {});
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
  var title = String((payload && payload.title) || '\\u041d\\u043e\\u0432\\u043e\\u0435 \\u0441\\u043e\\u043e\\u0431\\u0449\\u0435\\u043d\\u0438\\u0435');
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
  res.setHeader('Cache-Control', 'no-cache');
  res.send(serviceWorkerScript);
});

app.use(async (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/static') || req.path === '/manifest.json' || req.path === '/sw.js') return next();
  const sub = getSubdomain(req.hostname);
  if (sub) return renderShop(req, res);
  // Проверка custom_domain — если домен привязан к тенанту, показываем витрину
  const host = String(req.hostname || '').toLowerCase();
  if (host) {
    try {
      const [rows] = await db.query('SELECT id FROM ten_tenants WHERE custom_domain=? LIMIT 1', [host]);
      if (rows.length) return renderShop(req, res);
    } catch (e) { /* ignore */ }
  }
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

// Защищённые страницы (проверка авторизации на клиенте через JS)
app.get('/dashboard/cash', (req, res) => res.render('pages/cash'));
app.get('/dashboard/products', (req, res) => res.render('pages/products'));
app.get('/dashboard/orders', (req, res) => res.render('pages/orders'));
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
app.listen(PORT, () => {
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
}).on('error', (err) => {
  console.error('Ошибка запуска сервера:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Остановите другой процесс или измените PORT.`);
  }
  process.exit(1);
});
