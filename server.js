const express = require('express');
const cors = require('cors');
const path = require('path');

const db = require('./db');
const helpers = require('./api/helpers');

// routers
const makeAdminClientsRouter = require('./api/admin/clients');
const makeAdminOrdersRouter = require('./api/admin/orders');
const makeAdminProductsRouter = require('./api/admin/products');
const makePublicShopRouter = require('./api/public/shop');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/static', express.static('static'));

app.set('view engine', 'ejs');
app.set('views', 'views');

// ------------------------------
// Pages
// ------------------------------
app.get('/', (req, res) => res.redirect('/dashboard/products'));

app.get('/dashboard/products', (req, res) => res.render('pages/products'));
app.get('/dashboard/orders', (req, res) => res.render('pages/orders'));
app.get('/dashboard/clients', (req, res) => res.render('pages/clients', { activePage: 'clients' }));
app.get('/dashboard/team', (req, res) => res.render('pages/home', { activePage: 'team' }));
app.get('/dashboard/settings', (req, res) => res.render('pages/home', { activePage: 'settings' }));

// ------------------------------
// Shop (витрина)
// ------------------------------
app.get('/shop', (req, res) => res.render('pages/shop'));

// ------------------------------
// API: Admin
// ------------------------------
app.use('/api/admin/clients', makeAdminClientsRouter({ db, helpers }));
app.use('/api/admin/orders', makeAdminOrdersRouter({ db, helpers }));

// товары/категории/сортировка/загрузка — оставляем старые пути /api/prod_* и /api/sort/*
app.use('/api', makeAdminProductsRouter({ db, helpers }));

// ------------------------------
// API: Public
// ------------------------------
app.use('/api/public', makePublicShopRouter({ db, helpers }));

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
});