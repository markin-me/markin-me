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

// ------------------------------
// API: Auth (публичные роуты)
// ------------------------------
app.use('/api/auth', makeAuthRouter({ db, helpers }));

// ------------------------------
// Pages
// ------------------------------
app.get('/', (req, res) => res.redirect('/login'));

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
app.get('/dashboard/products', (req, res) => res.render('pages/products'));
app.get('/dashboard/orders', (req, res) => res.render('pages/orders'));
app.get('/dashboard/clients', (req, res) => res.render('pages/clients', { activePage: 'clients' }));
app.get('/dashboard/team', (req, res) => res.render('pages/home', { activePage: 'team' }));
app.get('/dashboard/settings', (req, res) => res.render('pages/home', { activePage: 'settings' }));

// ------------------------------
// Shop (витрина)
// ------------------------------
app.get('/shop', (req, res) => res.render('pages/shop'));

// Редирект /auth на /login
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
