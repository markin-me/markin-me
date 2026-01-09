const express = require('express');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

module.exports = function makeAdminProductsRouter({ db, helpers }) {
  const router = express.Router();

  // ------------------------------
  // Upload: product images (up to 10)
  // POST /api/upload/product-images
  // ------------------------------
  const uploadStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'products', String(tenantId));
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const upload = multer({
    storage: uploadStorage,
    limits: { files: 10, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload/product-images', upload.array('images', 10), (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const files = req.files || [];
      const urls = files.map((f) => `/static/uploads/products/${tenantId}/${f.filename}`);
      res.json({ ok: true, urls });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Upload: category icon
  // POST /api/upload/category-icon
  // ------------------------------
  const categoryIconStorage = multer.diskStorage({
    destination(req, file, cb) {
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'categories');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const categoryIconUpload = multer({
    storage: categoryIconStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload/category-icon', categoryIconUpload.single('icon'), (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ ok: false, error: 'ICON_REQUIRED' });
      const url = `/static/uploads/categories/${file.filename}`;
      res.json({ ok: true, url });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Categories: /api/prod_categories
  // ------------------------------
  router.get('/prod_categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const rows = await helpers.ensureDefaultCategories(db, tenantId);
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/prod_categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const icon = helpers.strOrNull(req.body.icon);

      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const sort_order =
        helpers.numOrNull(req.body.sort_order) ??
        (await helpers.nextSortOrderForCategories(db, tenantId, 10));

      const [result] = await db.query(
        'INSERT INTO prod_categories (tenant_id, code, title, icon, site_visibility, is_active, sort_order) VALUES (?,?,?,?,?,?,?)',
        [tenantId, code, title, icon, site_visibility, is_active, sort_order]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/prod_categories/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const icon = helpers.strOrNull(req.body.icon);
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;
      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const sort_order = helpers.numOrNull(req.body.sort_order);

      await db.query(
        `UPDATE prod_categories
         SET code=?, title=?, icon=?, site_visibility=?, is_active=?, sort_order=COALESCE(?, sort_order)
         WHERE tenant_id=? AND id=?`,
        [code, title, icon, site_visibility, is_active, sort_order, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product categories (chips)
  // GET /api/prod_products/:id/categories
  // ------------------------------
  router.get('/prod_products/:id/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT c.id, c.code, c.title, c.icon
         FROM prod_product_categories pc
         JOIN prod_categories c
           ON c.tenant_id = pc.tenant_id AND c.id = pc.category_id
         WHERE pc.tenant_id=? AND pc.product_id=?
         ORDER BY c.sort_order ASC, c.id ASC`,
        [tenantId, productId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Products: /api/prod_products
  // ------------------------------
  router.get('/prod_products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const allCategoryId = await helpers.getAllCategoryId(db, tenantId);

      const categoryId = Number(req.query.category_id || allCategoryId);
      if (!Number.isFinite(categoryId)) return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });

      if (categoryId === allCategoryId) {
        const [rows] = await db.query(
          `SELECT p.*, pc.sort_order AS link_sort_order
           FROM prod_products p
           LEFT JOIN prod_product_categories pc
             ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
           WHERE p.tenant_id=?
           ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
          [categoryId, tenantId]
        );

        const missing = [];
        for (const r of rows) {
          r.photos = helpers.safeJsonArray(r.photos_json);
          if (r.link_sort_order == null) missing.push(r);
        }

        if (missing.length) {
          let next = await helpers.nextSortOrderForCategory(db, tenantId, categoryId, 10);
          for (const r of missing) {
            await db.query(
              `INSERT INTO prod_product_categories (tenant_id, product_id, category_id, sort_order)
               VALUES (?,?,?,?)
               ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)`,
              [tenantId, r.id, categoryId, next]
            );
            r.link_sort_order = next;
            next += 10;
          }
          rows.sort(
            (a, b) =>
              (a.link_sort_order ?? 999999) - (b.link_sort_order ?? 999999) ||
              a.id - b.id
          );
        }

        return res.json({ ok: true, data: rows, category_id: categoryId });
      }

      const [rows] = await db.query(
        `SELECT p.*, pc.sort_order AS link_sort_order
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         WHERE pc.tenant_id=? AND pc.category_id=?
         ORDER BY pc.sort_order ASC, pc.id ASC`,
        [tenantId, categoryId]
      );

      for (const r of rows) r.photos = helpers.safeJsonArray(r.photos_json);

      res.json({ ok: true, data: rows, category_id: categoryId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/prod_products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const sku = helpers.strOrNull(req.body.sku);
      const description_short = helpers.strOrNull(req.body.description_short);
      const description = helpers.strOrNull(req.body.description);

      const price = helpers.numOrNull(req.body.price) ?? 0;
      const old_price = helpers.numOrNull(req.body.old_price);
      const cost_price = helpers.numOrNull(req.body.cost_price);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      const [result] = await db.query(
        `INSERT INTO prod_products
          (tenant_id, name, sku, description_short, description, price, old_price, cost_price, photos_json, is_active, site_visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId, name, sku, description_short, description,
          price, old_price, cost_price, photos_json,
          is_active, site_visibility
        ]
      );

      const productId = result.insertId;
      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, productId, categoryIds);

      res.json({ ok: true, id: productId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const sku = helpers.strOrNull(req.body.sku);
      const description_short = helpers.strOrNull(req.body.description_short);
      const description = helpers.strOrNull(req.body.description);

      const price = helpers.numOrNull(req.body.price) ?? 0;
      const old_price = helpers.numOrNull(req.body.old_price);
      const cost_price = helpers.numOrNull(req.body.cost_price);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      await db.query(
        `UPDATE prod_products
         SET name=?, sku=?, description_short=?, description=?, price=?, old_price=?, cost_price=?, photos_json=?, is_active=?, site_visibility=?
         WHERE tenant_id=? AND id=?`,
        [
          name, sku, description_short, description,
          price, old_price, cost_price, photos_json,
          is_active, site_visibility,
          tenantId, id
        ]
      );

      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, id, categoryIds);

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Sorting
  // POST /api/sort/prod_categories
  // POST /api/sort/prod_products
  // ------------------------------
  router.post('/sort/prod_categories', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const ids = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];
    const norm = ids.map(x => Number(x)).filter(x => Number.isFinite(x));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let sort = 0;
      for (const id of norm) {
        await conn.query(
          'UPDATE prod_categories SET sort_order=? WHERE tenant_id=? AND id=?',
          [sort, tenantId, id]
        );
        sort += 10;
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/sort/prod_products', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const categoryId = Number(req.body.category_id);
    const ids = Array.isArray(req.body.orderedProductIds) ? req.body.orderedProductIds : [];

    if (!Number.isFinite(categoryId)) return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });
    const norm = ids.map(x => Number(x)).filter(x => Number.isFinite(x));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      let sort = 0;
      for (const productId of norm) {
        await conn.query(
          `INSERT INTO prod_product_categories (tenant_id, product_id, category_id, sort_order)
           VALUES (?,?,?,?)
           ON DUPLICATE KEY UPDATE sort_order=VALUES(sort_order)`,
          [tenantId, productId, categoryId, sort]
        );
        sort += 10;
      }
      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  return router;
};
