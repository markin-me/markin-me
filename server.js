const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');

const db = require('./db');
const helpers = require('./api/helpers');
const { createOrdersEventsHub } = require('./api/ordersEvents');

// routers
const makeAuthRouter = require('./api/auth');
const makeAdminClientsRouter = require('./api/admin/clients');
const makeAdminOrdersRouter = require('./api/admin/orders');
const makeAdminProductsRouter = require('./api/admin/products');
const makeAdminTenantRouter = require('./api/admin/tenant');
const makePublicShopRouter = require('./api/public/shop');

// middleware
const { authMiddleware } = require('./api/middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Инициализация с обработкой ошибок
let ordersEvents;
try {
  ordersEvents = createOrdersEventsHub();
} catch (err) {
  console.error('Ошибка инициализации ordersEvents:', err);
  process.exit(1);
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/static', express.static('static'));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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
`;
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Cache-Control', 'no-cache');
  res.send(serviceWorkerScript);
});

app.use((req, res, next) => {
  const sub = getSubdomain(req.hostname);
  if (!sub) return next();
  if (req.path.startsWith('/api') || req.path.startsWith('/static') || req.path === '/manifest.json' || req.path === '/sw.js') return next();
  return renderShop(req, res);
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

// Защищённые страницы (проверка авторизации на клиенте через JS)
app.get('/dashboard/cash', (req, res) => res.render('pages/cash'));
app.get('/dashboard/products', (req, res) => res.render('pages/products'));
app.get('/dashboard/orders', (req, res) => res.render('pages/orders'));
app.get('/dashboard/clients', (req, res) => res.render('pages/clients', { activePage: 'clients' }));
app.get('/dashboard/team', (req, res) => res.render('pages/home', { activePage: 'team' }));
app.get('/dashboard/settings', (req, res) => res.render('pages/home', { activePage: 'settings' }));

// ------------------------------
// Shop (витрина)
// ------------------------------
app.get('/shop', renderShop);

app.get('/auth', (req, res) => res.redirect('/login'));

// ------------------------------
// API: Public (публичные роуты должны быть ПЕРЕД админскими)
// ------------------------------
app.use('/api/public', makePublicShopRouter({ db, helpers, ordersEvents }));

// ------------------------------
// API: Admin (требуют авторизации)
// ------------------------------
app.use('/api/admin/clients', authMiddleware, makeAdminClientsRouter({ db, helpers }));
app.use('/api/admin/orders', authMiddleware, makeAdminOrdersRouter({ db, helpers, ordersEvents }));
app.use('/api/admin/tenant', authMiddleware, makeAdminTenantRouter({ db, helpers }));

// товары/категории/сортировка/загрузка — оставляем старые пути /api/prod_* и /api/sort/*
// Применяем middleware ко всем роутам products роутера
const adminProductsRouter = makeAdminProductsRouter({ db, helpers });
adminProductsRouter.use(authMiddleware);
app.use('/api', adminProductsRouter);

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

// ------------------------------
// Start
// ------------------------------
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на ${PORT}`);
  console.log(`📝 Откройте http://localhost:${PORT}/login в браузере`);
}).on('error', (err) => {
  console.error('Ошибка запуска сервера:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`Порт ${PORT} уже занят. Остановите другой процесс или измените PORT.`);
  }
  process.exit(1);
});
