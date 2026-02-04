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
  // Products that use a given product as ingredient (for "Пересчитать в составе")
  // GET /api/admin/products/used-as-ingredient/:ingredientId
  // ------------------------------
  router.get('/admin/products/used-as-ingredient/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }
      const [rows] = await db.query(
        `SELECT DISTINCT product_id
         FROM prod_product_ingredients
         WHERE tenant_id=? AND ingredient_id=?
         ORDER BY product_id ASC`,
        [tenantId, ingredientId]
      );
      const product_ids = rows.map((r) => Number(r.product_id)).filter((id) => Number.isFinite(id));
      res.json({ ok: true, product_ids });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // GET one product (for recalc: need base_unit_id, base_qty)
  router.get('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [rows] = await db.query(
        `SELECT p.id, p.name, p.sku, p.description_short, p.description, p.price, p.old_price, p.cost_price,
                p.unit_id, p.base_unit_id, p.base_qty, p.photos_json, p.is_active, p.site_visibility,
                s.qty AS stock_qty
         FROM prod_products p
         LEFT JOIN prod_product_stocks s ON s.tenant_id=p.tenant_id AND s.store_id=? AND s.product_id=p.id
         WHERE p.tenant_id=? AND p.id=? LIMIT 1`,
        [storeId, tenantId, id]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const r = rows[0];
      r.photos = helpers.safeJsonArray(r.photos_json);
      res.json({ ok: true, data: r });
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
      const storeId = helpers.getStoreId(req);
      const allCategoryId = await helpers.getAllCategoryId(db, tenantId);

      const categoryId = Number(req.query.category_id || allCategoryId);
      if (!Number.isFinite(categoryId)) return res.status(400).json({ ok: false, error: 'BAD_CATEGORY_ID' });

      if (categoryId === allCategoryId) {
    const [rows] = await db.query(
        `SELECT p.*, pc.sort_order AS link_sort_order, s.qty AS stock_qty
         FROM prod_products p
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         LEFT JOIN prod_product_categories pc
           ON pc.tenant_id = p.tenant_id AND pc.product_id = p.id AND pc.category_id = ?
         WHERE p.tenant_id=?
         ORDER BY COALESCE(pc.sort_order, 999999) ASC, p.id ASC`,
        [storeId, categoryId, tenantId]
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
        `SELECT p.*, pc.sort_order AS link_sort_order, s.qty AS stock_qty
         FROM prod_product_categories pc
         JOIN prod_products p
           ON p.tenant_id = pc.tenant_id AND p.id = pc.product_id
         LEFT JOIN prod_product_stocks s
           ON s.tenant_id = p.tenant_id AND s.store_id = ? AND s.product_id = p.id
         WHERE pc.tenant_id=? AND pc.category_id=?
         ORDER BY pc.sort_order ASC, pc.id ASC`,
        [storeId, tenantId, categoryId]
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
      const storeId = helpers.getStoreId(req);

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const sku = helpers.strOrNull(req.body.sku);
      const description_short = helpers.strOrNull(req.body.description_short);
      const description = helpers.strOrNull(req.body.description);

      const price = helpers.numOrNull(req.body.price) ?? 0;
      const old_price = helpers.numOrNull(req.body.old_price);
      const cost_price = helpers.numOrNull(req.body.cost_price);
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const stock_qty = helpers.numOrNull(req.body.stock);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      const [result] = await db.query(
        `INSERT INTO prod_products
          (tenant_id, name, sku, description_short, description, price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json, is_active, site_visibility)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId, name, sku, description_short, description,
          price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json,
          is_active, site_visibility
        ]
      );

      const productId = result.insertId;
      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, productId, categoryIds);

      await db.query(
        `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE qty=VALUES(qty)`,
        [tenantId, storeId, productId, stock_qty]
      );

      res.json({ ok: true, id: productId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
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
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const stock_qty = helpers.numOrNull(req.body.stock);

      const is_active = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const site_visibility = helpers.toBool(req.body.site_visibility, true) ? 1 : 0;

      const photosArr = helpers.safeJsonArray(req.body.photos_json || req.body.photos);
      const photos_json = photosArr.length ? JSON.stringify(photosArr.slice(0, 10)) : null;

      await db.query(
        `UPDATE prod_products
         SET name=?, sku=?, description_short=?, description=?, price=?, old_price=?, cost_price=?, unit_id=?, base_unit_id=?, base_qty=?, photos_json=?, is_active=?, site_visibility=?
         WHERE tenant_id=? AND id=?`,
        [
          name, sku, description_short, description,
          price, old_price, cost_price, unit_id, base_unit_id, base_qty, photos_json,
          is_active, site_visibility,
          tenantId, id
        ]
      );

      const categoryIds = Array.isArray(req.body.category_ids) ? req.body.category_ids : [];
      await helpers.setProductCategories(db, tenantId, id, categoryIds);

      await db.query(
        `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
         VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE qty=VALUES(qty)`,
        [tenantId, storeId, id, stock_qty]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // PATCH /api/prod_products/:id — только cost_price, price, base_qty (для пересчёта по составу)
  router.patch('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const cost_price = helpers.numOrNull(req.body.cost_price);
      const price = helpers.numOrNull(req.body.price);
      const base_qty = helpers.numOrNull(req.body.base_qty);
      const updates = [];
      const params = [];
      if (cost_price != null) { updates.push('cost_price=?'); params.push(cost_price); }
      if (price != null) { updates.push('price=?'); params.push(price); }
      if (base_qty != null) { updates.push('base_qty=?'); params.push(base_qty); }
      if (updates.length === 0) return res.json({ ok: true });
      params.push(tenantId, id);
      await db.query(
        `UPDATE prod_products SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
        params
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // DELETE product (hard delete from DB; order history kept in order_orders.items JSON)
  // DELETE /api/prod_products/:id
  // ------------------------------
  router.delete('/prod_products/:id', async (req, res) => {
    let conn;
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      conn = await db.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.query(
        'SELECT id FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!rows.length) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Remove this product where it is used as ingredient in other products (FK has no ON DELETE)
      await conn.query(
        'DELETE FROM prod_product_ingredients WHERE tenant_id=? AND ingredient_id=?',
        [tenantId, id]
      );
      // Remove category links (no FK to prod_products in schema; avoid orphans)
      await conn.query(
        'DELETE FROM prod_product_categories WHERE tenant_id=? AND product_id=?',
        [tenantId, id]
      );
      // Delete product (CASCADE will remove: prod_product_ingredients product_id, prod_product_stocks, prod_variant_assignments)
      await conn.query(
        'DELETE FROM prod_products WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

      await conn.commit();
      conn.release();
      res.json({ ok: true });
    } catch (e) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
        conn.release();
      }
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

  // ------------------------------
  // Options: groups/items/assignments
  // ------------------------------
  router.get('/admin/options/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_option_items i WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS items_count,
                (SELECT COUNT(*) FROM prod_option_assignments a WHERE a.tenant_id=g.tenant_id AND a.group_id=g.id) AS assignments_count
         FROM prod_option_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/options/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [[group]] = await db.query(
        'SELECT * FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!group) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      const [items] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.photos_json AS product_photos_json
        FROM prod_option_items i
        JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.target_product_id
        WHERE i.tenant_id=? AND i.group_id=? AND i.target_type='product'
        ORDER BY i.sort_order ASC, i.id ASC`,
        [tenantId, id]
      );

      const [assignments] = await db.query(
        `SELECT a.*, p.name AS product_name
         FROM prod_option_assignments a
         JOIN prod_products p ON p.tenant_id=a.tenant_id AND p.id=a.assign_id
         WHERE a.tenant_id=? AND a.group_id=? AND a.assign_type='product'
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, id]
      );

      res.json({ ok: true, data: { group, items, assignments } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

router.post('/admin/options/group-bundle', async (req, res) => {
  const tenantId = helpers.getTenantId(req);
  const group = req.body.group || req.body || {};
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

  const title = helpers.strOrNull(group.title);
  if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

  const selectionType = group.selection_type === 'multiple' ? 'multiple' : 'single';

  const minSelect = helpers.numOrNull(group.min_select) ?? 0;
  const maxSelect = helpers.numOrNull(group.max_select);
  const isActive = helpers.toBool(group.is_active, true) ? 1 : 0;

  // ✅ is_required только для single
  const isRequired =
    selectionType === 'single'
      ? (helpers.toBool(group.is_required, true) ? 1 : 0)
      : 0;

  // ✅ allow_variants (переключатель вариантов у пунктов опции)
  const allowVariants = helpers.toBool(group.allow_variants, false) ? 1 : 0;

  const outOfStockAction = helpers.numOrNull(group.out_of_stock_action) ?? 1;

  const sortOrder = helpers.numOrNull(group.sort_order) ?? 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO prod_option_groups
       (tenant_id, title, selection_type, min_select, max_select, is_active, is_required, allow_variants, out_of_stock_action, sort_order)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [tenantId, title, selectionType, minSelect, maxSelect, isActive, isRequired, allowVariants, outOfStockAction, sortOrder]
    );
    const groupId = result.insertId;

    if (items.length) {
      const values = items.map((item, idx) => {
        const priceMode = item.price_mode === 'fixed' ? 'fixed' : 'from_target';

        // ⚠️ ВАЖНО: price_value не должен быть NULL
        // fixed -> обязателен price_value
        // from_target -> ставим 0 (или можно цену target, если у тебя такая логика отдельно)
        let priceValue = 0;
        if (priceMode === 'fixed') {
          const v = helpers.numOrNull(item.price_value);
          if (v == null) throw new Error('PRICE_VALUE_REQUIRED');
          priceValue = v;
        }

        return [
          tenantId,
          groupId,
          'product',
          Number(item.target_product_id),
          priceMode,
          priceValue,
          helpers.numOrNull(item.qty_min) ?? 1,
          helpers.numOrNull(item.qty_max) ?? 1,
          1,
          helpers.numOrNull(item.sort_order) ?? idx * 10
        ];
      });

      await conn.query(
        `INSERT INTO prod_option_items
         (tenant_id, group_id, target_type, target_product_id, price_mode, price_value, qty_min, qty_max, is_active, sort_order)
         VALUES ?`,
        [values]
      );
    }

    if (assignments.length) {
      const values = assignments.map((assignment, idx) => ([
        tenantId,
        groupId,
        'product',
        Number(assignment.assign_id),
        helpers.numOrNull(assignment.priority) ?? 0,
        helpers.numOrNull(assignment.sort_order) ?? idx * 10,
        helpers.numOrNull(assignment.out_of_stock_action) ?? 1,
        1
      ]));
      await conn.query(
        `INSERT INTO prod_option_assignments
         (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           priority=VALUES(priority),
           sort_order=VALUES(sort_order),
           out_of_stock_action=VALUES(out_of_stock_action)`,
        [values]
      );
    }

    await conn.commit();
    res.json({ ok: true, id: groupId });
  } catch (e) {
    await conn.rollback();
    console.error(e);

    if (String(e?.message) === 'PRICE_VALUE_REQUIRED') {
      return res.status(400).json({ ok: false, error: 'PRICE_VALUE_REQUIRED' });
    }

    res.status(500).json({ ok: false, error: 'DB_ERROR' });
  } finally {
    conn.release();
  }
});

router.patch('/admin/options/groups/:id', async (req, res) => {
  try {
    const tenantId = helpers.getTenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const fields = [];
    const values = [];

    // будем знать, к чему переключили тип (если переключили)
    let nextSelectionType = null;

    if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      fields.push('title=?');
      values.push(title);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'selection_type')) {
      nextSelectionType = req.body.selection_type === 'multiple' ? 'multiple' : 'single';
      fields.push('selection_type=?');
      values.push(nextSelectionType);

      // ✅ если перевели в multiple — required всегда 0
      if (nextSelectionType === 'multiple') {
        fields.push('is_required=?');
        values.push(0);
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'min_select')) {
      fields.push('min_select=?');
      values.push(helpers.numOrNull(req.body.min_select) ?? 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'max_select')) {
      fields.push('max_select=?');
      values.push(helpers.numOrNull(req.body.max_select));
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
      fields.push('is_active=?');
      values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'allow_variants')) {
      fields.push('allow_variants=?');
      values.push(helpers.toBool(req.body.allow_variants, false) ? 1 : 0);
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'out_of_stock_action')) {
      const outOfStockAction = helpers.numOrNull(req.body.out_of_stock_action);
      if (outOfStockAction != null) {
        fields.push('out_of_stock_action=?');
        values.push(outOfStockAction);
      }
    }

    // ✅ is_required только для single
    if (Object.prototype.hasOwnProperty.call(req.body, 'is_required')) {
      const incoming = helpers.toBool(req.body.is_required, true) ? 1 : 0;

      // если тип в этом же PATCH не задан — аккуратно обновляем,
      // но только если группа по факту single (проверим в БД)
      if (nextSelectionType == null) {
        const [[row]] = await db.query(
          'SELECT selection_type FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        const currentType = row?.selection_type === 'multiple' ? 'multiple' : 'single';
        if (currentType === 'single') {
          fields.push('is_required=?');
          values.push(incoming);
        } else {
          // multiple -> принудительно 0
          fields.push('is_required=?');
          values.push(0);
        }
      } else {
        // тип задан в этом запросе
        if (nextSelectionType === 'single') {
          fields.push('is_required=?');
          values.push(incoming);
        } else {
          fields.push('is_required=?');
          values.push(0);
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
      fields.push('sort_order=?');
      values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
    }

    if (!fields.length) return res.json({ ok: true });

    values.push(tenantId, id);
    await db.query(
      `UPDATE prod_option_groups
       SET ${fields.join(', ')}
       WHERE tenant_id=? AND id=?`,
      values
    );

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: 'DB_ERROR' });
  }
});

  async function tableExists(conn, tableName) {
    const [[row]] = await conn.query(
      `SELECT COUNT(*) AS cnt
       FROM information_schema.tables
       WHERE table_schema=DATABASE() AND table_name=?`,
      [tableName]
    );
    return Boolean(row && row.cnt);
  }

  router.delete('/admin/options/groups/:id', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const [[group]] = await conn.query(
        'SELECT id FROM prod_option_groups WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE',
        [tenantId, id]
      );
      if (!group) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Каскадное удаление всех связей опции
      // Удаляем items
      await conn.query(
        'DELETE FROM prod_option_items WHERE tenant_id=? AND group_id=?',
        [tenantId, id]
      );

      // Удаляем assignments
      await conn.query(
        'DELETE FROM prod_option_assignments WHERE tenant_id=? AND group_id=?',
        [tenantId, id]
      );

      // Удаляем overrides (если таблица существует)
      if (await tableExists(conn, 'prod_option_overrides')) {
        await conn.query(
          'DELETE FROM prod_option_overrides WHERE tenant_id=? AND group_id=?',
          [tenantId, id]
        );
      }

      // Удаляем exclusions (если таблица существует)
      if (await tableExists(conn, 'prod_option_exclusions')) {
        await conn.query(
          'DELETE FROM prod_option_exclusions WHERE tenant_id=? AND group_id=?',
          [tenantId, id]
        );
      }

      // Удаляем саму группу опций
      await conn.query(
        'DELETE FROM prod_option_groups WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

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

  router.post('/admin/options/groups/:id/items', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ ok: false, error: 'EMPTY' });
    const targetIds = Array.from(new Set(items.map((x) => Number(x.target_product_id)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!targetIds.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, target_product_id
         FROM prod_option_items
         WHERE tenant_id=? AND group_id=? AND target_type='product'
           AND target_product_id IN (${targetIds.map(() => '?').join(',')})`,
        [tenantId, groupId, ...targetIds]
      );
      const map = new Map(existing.map((row) => [Number(row.target_product_id), row]));
      const added = [];
      const updated = [];

      for (const item of items) {
        const targetId = Number(item.target_product_id);
        if (!Number.isFinite(targetId) || targetId <= 0) continue;
        const row = map.get(targetId);
        const priceMode = item.price_mode === 'fixed' ? 'fixed' : 'from_target';
        // Унифицировано: для from_target используем 0 (как в bundle-endpoint)
        const priceValue = priceMode === 'fixed' ? (helpers.numOrNull(item.price_value) ?? 0) : 0;
        const qtyMin = helpers.numOrNull(item.qty_min) ?? 1;
        const qtyMax = helpers.numOrNull(item.qty_max) ?? 1;
        const sortOrder = helpers.numOrNull(item.sort_order) ?? 0;

        if (!row) {
          await conn.query(
            `INSERT INTO prod_option_items
             (tenant_id, group_id, target_type, target_product_id, price_mode, price_value, qty_min, qty_max, is_active, sort_order)
             VALUES (?,?,?,?,?,?,?,?,?,?)`,
            [tenantId, groupId, 'product', targetId, priceMode, priceValue, qtyMin, qtyMax, 1, sortOrder]
          );
          added.push(targetId);
          continue;
        }

        await conn.query(
          `UPDATE prod_option_items
           SET price_mode=?, price_value=?, qty_min=?, qty_max=?, sort_order=?
           WHERE tenant_id=? AND id=?`,
          [priceMode, priceValue, qtyMin, qtyMax, sortOrder, tenantId, row.id]
        );
        updated.push(targetId);
      }

      await conn.commit();
      res.json({ ok: true, added, updated });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/options/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'price_mode')) {
        const priceMode = req.body.price_mode === 'fixed' ? 'fixed' : 'from_target';
        fields.push('price_mode=?');
        values.push(priceMode);
        if (Object.prototype.hasOwnProperty.call(req.body, 'price_value')) {
          // Унифицировано: для from_target используем 0
          values.push(priceMode === 'fixed' ? (helpers.numOrNull(req.body.price_value) ?? 0) : 0);
          fields.push('price_value=?');
        }
      } else if (Object.prototype.hasOwnProperty.call(req.body, 'price_value')) {
        fields.push('price_value=?');
        values.push(helpers.numOrNull(req.body.price_value) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'qty_min')) {
        fields.push('qty_min=?');
        values.push(helpers.numOrNull(req.body.qty_min) ?? 1);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'qty_max')) {
        fields.push('qty_max=?');
        values.push(helpers.numOrNull(req.body.qty_max) ?? 1);
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_option_items
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/options/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_items
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/options/groups/:id/assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const assignIds = Array.isArray(req.body.assign_ids) ? req.body.assign_ids : [];
    const assignmentObjects = Array.isArray(req.body.assignments) ? req.body.assignments : [];
    const normalizedAssignments = assignmentObjects
      .map((item) => ({
        assign_id: Number(item.assign_id ?? item.id),
        out_of_stock_action: helpers.numOrNull(item.out_of_stock_action) ?? 1,
        priority: helpers.numOrNull(item.priority) ?? 0,
        sort_order: helpers.numOrNull(item.sort_order) ?? 0,
      }))
      .filter((item) => Number.isFinite(item.assign_id) && item.assign_id > 0);
    const assignmentMap = new Map(normalizedAssignments.map((item) => [item.assign_id, item]));
    const norm = Array.from(
      new Set([
        ...assignIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0),
        ...normalizedAssignments.map((item) => item.assign_id),
      ])
    );
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const [existing] = await conn.query(
        `SELECT id, assign_id
         FROM prod_option_assignments
         WHERE tenant_id=? AND group_id=? AND assign_type='product'
           AND assign_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, groupId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.assign_id), row]));

      const added = [];
      const skipped = [];

      for (const id of norm) {
        const row = map.get(id);
        if (!row) {
          const payload = assignmentMap.get(id) || { out_of_stock_action: 1, priority: 0, sort_order: 0 };
          await conn.query(
            `INSERT INTO prod_option_assignments
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
             VALUES (?,?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', id, payload.priority, payload.sort_order, payload.out_of_stock_action]
          );
          added.push(id);
          continue;
        }
        skipped.push(id);
      }

      await conn.commit();
      res.json({ ok: true, added, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/options/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const priority = helpers.numOrNull(req.body.priority);
      const sortOrder = helpers.numOrNull(req.body.sort_order);
      const outOfStockAction = helpers.numOrNull(req.body.out_of_stock_action);

      await db.query(
        `UPDATE prod_option_assignments
         SET priority=COALESCE(?, priority),
             sort_order=COALESCE(?, sort_order),
             out_of_stock_action=COALESCE(?, out_of_stock_action)
         WHERE tenant_id=? AND id=?`,
        [priority, sortOrder, outOfStockAction, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/options/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_assignments
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Variants: groups/discount_tiers/assignments
  // ------------------------------
  router.get('/admin/variants/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_variant_assignments a WHERE a.tenant_id=g.tenant_id AND a.variant_group_id=g.id) AS assignments_count
         FROM prod_variant_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );
      for (const r of rows) {
        r.values = helpers.safeJsonArray(r.values);
      }
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/variants/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [[group]] = await db.query(
        'SELECT * FROM prod_variant_groups WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!group) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      group.values = helpers.safeJsonArray(group.values);
      group.default_value_index = group.default_value_index != null ? Number(group.default_value_index) : null;
      
      // debug log removed

      const [tiers] = await db.query(
        `SELECT * FROM prod_variant_discount_tiers
         WHERE tenant_id=? AND variant_group_id=?
         ORDER BY sort_order ASC, min_quantity ASC`,
        [tenantId, id]
      );

      const [assignments] = await db.query(
        `SELECT a.*, p.name AS product_name
         FROM prod_variant_assignments a
         JOIN prod_products p ON p.tenant_id=a.tenant_id AND p.id=a.product_id
         WHERE a.tenant_id=? AND a.variant_group_id=?
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, id]
      );
      // Преобразуем default_value_index в число или null
      assignments.forEach(a => {
        a.default_value_index = a.default_value_index != null ? Number(a.default_value_index) : null;
      });

      res.json({ ok: true, data: { group, tiers, assignments } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/group-bundle', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const group = req.body.group || req.body || {};
    const tiers = Array.isArray(req.body.tiers) ? req.body.tiers : [];
    const assignments = Array.isArray(req.body.assignments) ? req.body.assignments : [];

    const title = helpers.strOrNull(group.title);
    if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

    const unitId = helpers.numOrNull(group.unit_id);
    const values = Array.isArray(group.values) ? JSON.stringify(group.values) : null;
    const isActive = helpers.toBool(group.is_active, true) ? 1 : 0;
    const sortOrder = helpers.numOrNull(group.sort_order) ?? 0;

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      const defaultValueIndexRaw = group.default_value_index;
      // debug log removed
      // Важно: 0 - это валидное значение (первый вариант), поэтому обрабатываем его отдельно
      const defaultValueIndex = defaultValueIndexRaw === null || defaultValueIndexRaw === undefined 
        ? null 
        : (Number.isFinite(Number(defaultValueIndexRaw)) ? Number(defaultValueIndexRaw) : null);
      // debug log removed
      const [result] = await conn.query(
        `INSERT INTO prod_variant_groups
         (tenant_id, title, unit_id, \`values\`, selection_type, is_active, sort_order, default_value_index)
         VALUES (?,?,?,?,'single',?,?,?)`,
        [tenantId, title, unitId, values, isActive, sortOrder, defaultValueIndex]
      );
      const groupId = result.insertId;

      for (let idx = 0; idx < tiers.length; idx++) {
        const tier = tiers[idx];
        const minQuantity = helpers.numOrNull(tier.min_quantity) ?? 1;
        const discountPercent = helpers.numOrNull(tier.discount_percent) ?? 0;
        const tierSortOrder = helpers.numOrNull(tier.sort_order) ?? (idx * 10);

        await conn.query(
          `INSERT INTO prod_variant_discount_tiers
           (tenant_id, variant_group_id, min_quantity, discount_percent, sort_order)
           VALUES (?,?,?,?,?)`,
          [tenantId, groupId, minQuantity, discountPercent, tierSortOrder]
        );
      }

      for (const assignId of assignments) {
        const id = Number(assignId);
        if (!Number.isFinite(id) || id <= 0) continue;

        const [existing] = await conn.query(
          `SELECT id FROM prod_variant_assignments
           WHERE tenant_id=? AND product_id=? AND variant_group_id=?`,
          [tenantId, id, groupId]
        );
        if (existing.length) continue;

        await conn.query(
          `INSERT INTO prod_variant_assignments
           (tenant_id, product_id, variant_group_id, sort_order, is_active)
           VALUES (?,?,?,0,1)`,
          [tenantId, id, groupId]
        );
      }

      await conn.commit();
      res.json({ ok: true, id: groupId });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  // ВАЖНО: этот маршрут должен быть объявлен ПЕРЕД общим маршрутом /:id
  router.patch('/admin/variants/groups/:id/defaultIndex', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      let default_value_index = req.body.default_value_index;
      if (default_value_index !== null && default_value_index !== undefined) {
        default_value_index = Number(default_value_index);
        if (!Number.isFinite(default_value_index) || default_value_index < 0) {
          return res.status(400).json({ ok: false, error: 'INVALID_INDEX' });
        }
      } else {
        default_value_index = null;
      }

      await db.query(
        'UPDATE prod_variant_groups SET default_value_index=? WHERE tenant_id=? AND id=?',
        [default_value_index, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/variants/groups/:id', async (req, res) => {
    // debug logs removed
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      // debug log removed
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
        const title = helpers.strOrNull(req.body.title);
        if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
        fields.push('title=?');
        values.push(title);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'unit_id')) {
        fields.push('unit_id=?');
        values.push(helpers.numOrNull(req.body.unit_id));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'values')) {
        const vals = Array.isArray(req.body.values) ? JSON.stringify(req.body.values) : null;
        fields.push('`values`=?');
        values.push(vals);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        const defaultValueIndex = req.body.default_value_index;
        // debug log removed
        // Важно: 0 - это валидное значение (первый вариант), поэтому обрабатываем его отдельно
        let processedValue;
        if (defaultValueIndex === null || defaultValueIndex === undefined) {
          processedValue = null;
        } else if (Number.isFinite(Number(defaultValueIndex))) {
          processedValue = Number(defaultValueIndex);
        } else {
          processedValue = null;
        }
        // debug log removed
        fields.push('default_value_index=?');
        values.push(processedValue);
        
        // Сохраняем для использования в проверке после UPDATE
        req.body._processedDefaultValueIndex = processedValue;
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      
      // debug logs removed
      
      await db.query(
        `UPDATE prod_variant_groups
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );
      
      // Проверяем, что значение сохранилось
      const [check] = await db.query(
        `SELECT default_value_index, updated_at, title, \`values\` FROM prod_variant_groups WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, id]
      );
      
      const savedValue = check[0]?.default_value_index;
      const requestedValue = req.body.default_value_index;
      
      // debug log removed
      
      // Проверяем, что значение действительно сохранилось
      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        const processedValue = req.body._processedDefaultValueIndex;
        const actualSavedValue = savedValue != null ? Number(savedValue) : null;
        
        if (processedValue !== actualSavedValue) {
          console.error('[API] PATCH /admin/variants/groups/:id - VALUE MISMATCH', {
            processedValue,
            actualSavedValue,
            requestedValue,
            savedValueRaw: savedValue
          });
        } else {
          // debug log removed
        }
      }
      // debug logs removed
      
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/variants/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_variant_groups
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/groups/:id/tiers', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = Number(req.params.id);
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const tiers = Array.isArray(req.body.tiers) ? req.body.tiers : [];
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();

        for (let idx = 0; idx < tiers.length; idx++) {
          const tier = tiers[idx];
          const tierId = Number(tier.id);
          const minQuantity = helpers.numOrNull(tier.min_quantity) ?? 1;
          const discountPercent = helpers.numOrNull(tier.discount_percent) ?? 0;
          const tierSortOrder = helpers.numOrNull(tier.sort_order) ?? (idx * 10);

          if (Number.isFinite(tierId) && tierId > 0) {
            await conn.query(
              `UPDATE prod_variant_discount_tiers
               SET min_quantity=?, discount_percent=?, sort_order=?
               WHERE tenant_id=? AND id=?`,
              [minQuantity, discountPercent, tierSortOrder, tenantId, tierId]
            );
          } else {
            await conn.query(
              `INSERT INTO prod_variant_discount_tiers
               (tenant_id, variant_group_id, min_quantity, discount_percent, sort_order)
               VALUES (?,?,?,?,?)`,
              [tenantId, groupId, minQuantity, discountPercent, tierSortOrder]
            );
          }
        }

        const deleteIds = Array.isArray(req.body.delete_ids) ? req.body.delete_ids : [];
        for (const delId of deleteIds) {
          const id = Number(delId);
          if (!Number.isFinite(id) || id <= 0) continue;
          await conn.query(
            `DELETE FROM prod_variant_discount_tiers WHERE tenant_id=? AND id=?`,
            [tenantId, id]
          );
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
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/variants/groups/:id/assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const groupId = Number(req.params.id);
    if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const assignIds = Array.isArray(req.body.assign_ids) ? req.body.assign_ids : [];
    const norm = Array.from(new Set(assignIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, product_id
         FROM prod_variant_assignments
         WHERE tenant_id=? AND variant_group_id=?
           AND product_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, groupId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.product_id), row]));

      const added = [];
      const skipped = [];

      for (const id of norm) {
        const row = map.get(id);
        if (!row) {
          await conn.query(
            `INSERT INTO prod_variant_assignments
             (tenant_id, product_id, variant_group_id, sort_order, is_active)
             VALUES (?,?,?,0,1)`,
            [tenantId, id, groupId]
          );
          added.push(id);
          continue;
        }
        skipped.push(id);
      }

      await conn.commit();
      res.json({ ok: true, added, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.patch('/admin/variants/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_value_index')) {
        fields.push('default_value_index=?');
        values.push(helpers.numOrNull(req.body.default_value_index));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_variant_assignments
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/variants/assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_variant_assignments
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/products/:id/variants', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [variants] = await db.query(
        `SELECT 
          vg.id,
          vg.title,
          vg.unit_id,
          vg.values,
          vg.is_active,
          vg.sort_order,
          vg.default_value_index AS group_default_value_index,
          va.id AS assignment_id,
          va.variant_group_id,
          va.product_id,
          va.sort_order AS assignment_sort_order,
          va.default_value_index AS assignment_default_value_index,
          u.code AS unit_code,
          u.short_title AS unit_short_title,
          u.title AS unit_title
        FROM prod_variant_assignments va
        JOIN prod_variant_groups vg ON vg.id=va.variant_group_id
        LEFT JOIN prod_units u ON u.id=vg.unit_id AND u.tenant_id=vg.tenant_id
        WHERE va.tenant_id=? AND va.product_id=? AND va.is_active=1 AND vg.is_active=1
        ORDER BY va.sort_order ASC, vg.sort_order ASC`,
        [tenantId, productId]
      );

      for (const v of variants) {
        v.values = helpers.safeJsonArray(v.values);
        v.group_default_value_index = v.group_default_value_index != null ? Number(v.group_default_value_index) : null;
        v.assignment_default_value_index = v.assignment_default_value_index != null ? Number(v.assignment_default_value_index) : null;
        // Определяем дефолтный индекс: сначала из привязки, потом из группы
        v.default_value_index = v.assignment_default_value_index != null ? v.assignment_default_value_index : v.group_default_value_index;
        const [tiers] = await db.query(
          `SELECT min_quantity, discount_percent, sort_order
           FROM prod_variant_discount_tiers
           WHERE tenant_id=? AND variant_group_id=?
           ORDER BY sort_order ASC, min_quantity ASC`,
          [tenantId, v.id]
        );
        v.discount_tiers = tiers;
      }

      res.json({ ok: true, data: variants });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Auto-add items to cart (groups + items)
  // ------------------------------

  router.get('/admin/auto-add/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const [groups] = await db.query(
        `SELECT g.*,
                (SELECT COUNT(*) FROM prod_auto_add_items i
                 WHERE i.tenant_id=g.tenant_id AND i.group_id=g.id) AS items_count
         FROM prod_auto_add_groups g
         WHERE g.tenant_id=?
         ORDER BY g.sort_order ASC, g.id ASC`,
        [tenantId]
      );

      const [items] = await db.query(
        `SELECT i.*,
                p.name AS product_name,
                p.price AS product_price,
                p.photos_json AS product_photos_json
         FROM prod_auto_add_items i
         JOIN prod_products p ON p.tenant_id=i.tenant_id AND p.id=i.product_id
         WHERE i.tenant_id=?
         ORDER BY i.sort_order ASC, i.id ASC`,
        [tenantId]
      );

      for (const it of items) {
        it.product_photos = helpers.safeJsonArray(it.product_photos_json);
      }

      res.json({ ok: true, data: { groups, items } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/auto-add/groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const description = helpers.strOrNull(req.body.description);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const minCartAmount = helpers.numOrNull(req.body.min_cart_amount);
      const maxCartAmount = helpers.numOrNull(req.body.max_cart_amount);
      const includeAutoInTotal = helpers.toBool(req.body.include_auto_in_total, false) ? 1 : 0;
      const maxItemsQty = helpers.numOrNull(req.body.max_items_qty);
      const allowCustomerQty = helpers.toBool(req.body.allow_customer_qty, true) ? 1 : 0;
      const allowCustomerRemove = helpers.toBool(req.body.allow_customer_remove, true) ? 1 : 0;

      const [r] = await db.query(
        `INSERT INTO prod_auto_add_groups
         (tenant_id, title, description, is_active, sort_order, min_cart_amount, max_cart_amount, include_auto_in_total, max_items_qty, allow_customer_qty, allow_customer_remove)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [tenantId, title, description, isActive, sortOrder, minCartAmount, maxCartAmount, includeAutoInTotal, maxItemsQty, allowCustomerQty, allowCustomerRemove]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/auto-add/groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'title')) {
        const title = helpers.strOrNull(req.body.title);
        if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
        fields.push('title=?');
        values.push(title);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'description')) {
        fields.push('description=?');
        values.push(helpers.strOrNull(req.body.description));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'min_cart_amount')) {
        fields.push('min_cart_amount=?');
        values.push(helpers.numOrNull(req.body.min_cart_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_cart_amount')) {
        fields.push('max_cart_amount=?');
        values.push(helpers.numOrNull(req.body.max_cart_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'include_auto_in_total')) {
        fields.push('include_auto_in_total=?');
        values.push(helpers.toBool(req.body.include_auto_in_total, false) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_items_qty')) {
        fields.push('max_items_qty=?');
        values.push(helpers.numOrNull(req.body.max_items_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'allow_customer_qty')) {
        fields.push('allow_customer_qty=?');
        values.push(helpers.toBool(req.body.allow_customer_qty, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'allow_customer_remove')) {
        fields.push('allow_customer_remove=?');
        values.push(helpers.toBool(req.body.allow_customer_remove, true) ? 1 : 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_auto_add_groups
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/auto-add/groups/:id', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await conn.beginTransaction();
      await conn.query(
        `DELETE FROM prod_auto_add_items WHERE tenant_id=? AND group_id=?`,
        [tenantId, id]
      );
      await conn.query(
        `DELETE FROM prod_auto_add_groups WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
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

  router.post('/admin/auto-add/groups/:id/items', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = Number(req.params.id);
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const productId = Number(req.body.product_id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'PRODUCT_REQUIRED' });
      }

      const defaultQty = Math.max(0, Number(req.body.default_qty || 0));
      const minQty = Math.max(0, Number(req.body.min_qty || 0));
      const maxQty = helpers.numOrNull(req.body.max_qty);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const freeFirstQty = Math.max(0, Number(req.body.free_first_qty || 0));
      const freePerAmount = helpers.numOrNull(req.body.free_per_amount);
      const freePerAmountQty = Math.max(1, Number(req.body.free_per_amount_qty || 1));
      const maxFreeQty = helpers.numOrNull(req.body.max_free_qty);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;

      const [r] = await db.query(
        `INSERT INTO prod_auto_add_items
         (tenant_id, group_id, product_id, default_qty, min_qty, max_qty, price_override,
          free_first_qty, free_per_amount, free_per_amount_qty, max_free_qty, is_active, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          tenantId,
          groupId,
          productId,
          defaultQty,
          minQty,
          maxQty,
          priceOverride,
          freeFirstQty,
          freePerAmount,
          freePerAmountQty,
          maxFreeQty,
          isActive,
          sortOrder
        ]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/auto-add/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const fields = [];
      const values = [];

      if (Object.prototype.hasOwnProperty.call(req.body, 'product_id')) {
        const productId = Number(req.body.product_id);
        if (!Number.isFinite(productId) || productId <= 0) {
          return res.status(400).json({ ok: false, error: 'PRODUCT_REQUIRED' });
        }
        fields.push('product_id=?');
        values.push(productId);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'default_qty')) {
        fields.push('default_qty=?');
        values.push(Math.max(0, Number(req.body.default_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'min_qty')) {
        fields.push('min_qty=?');
        values.push(Math.max(0, Number(req.body.min_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_qty')) {
        fields.push('max_qty=?');
        values.push(helpers.numOrNull(req.body.max_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'price_override')) {
        fields.push('price_override=?');
        values.push(helpers.numOrNull(req.body.price_override));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_first_qty')) {
        fields.push('free_first_qty=?');
        values.push(Math.max(0, Number(req.body.free_first_qty || 0)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_per_amount')) {
        fields.push('free_per_amount=?');
        values.push(helpers.numOrNull(req.body.free_per_amount));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'free_per_amount_qty')) {
        fields.push('free_per_amount_qty=?');
        values.push(Math.max(1, Number(req.body.free_per_amount_qty || 1)));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'max_free_qty')) {
        fields.push('max_free_qty=?');
        values.push(helpers.numOrNull(req.body.max_free_qty));
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'is_active')) {
        fields.push('is_active=?');
        values.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }

      if (Object.prototype.hasOwnProperty.call(req.body, 'sort_order')) {
        fields.push('sort_order=?');
        values.push(helpers.numOrNull(req.body.sort_order) ?? 0);
      }

      if (!fields.length) return res.json({ ok: true });

      values.push(tenantId, id);
      await db.query(
        `UPDATE prod_auto_add_items
         SET ${fields.join(', ')}
         WHERE tenant_id=? AND id=?`,
        values
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/auto-add/items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_auto_add_items WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/catalog/categories', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, title, code, sort_order
         FROM prod_categories
         WHERE tenant_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/catalog/products', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const categoryId = helpers.numOrNull(req.query.category_id);
      const q = helpers.strOrNull(req.query.q);

      const params = [];
      let sql =
        `SELECT p.id, p.name, p.price, p.cost_price, p.unit_id, p.base_unit_id, p.base_qty, p.photos_json, p.is_active,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = p.tenant_id AND va.product_id = p.id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_products p`;

      if (categoryId) {
        sql += ` JOIN prod_product_categories pc
                 ON pc.tenant_id=p.tenant_id AND pc.product_id=p.id AND pc.category_id=?`;
        params.push(categoryId);
      }

      sql += ` WHERE p.tenant_id=? AND p.is_active=1`;
      params.push(tenantId);

      if (q) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${q}%`);
      }

      sql += ` ORDER BY p.name ASC, p.id ASC LIMIT 200`;

      const [rows] = await db.query(sql, params);
      
      for (const r of rows) {
        r.photos = helpers.safeJsonArray(r.photos_json);
        r.photos_json = r.photos;
        r.has_variants = r.has_variants != null ? 1 : 0;
        r.has_changeable_composition = r.has_changeable_composition != null ? 1 : 0;
      }
      
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Combo blocks (блоки комбо)
  // ------------------------------
  router.get('/admin/combo-blocks/product-flags', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const idsParam = req.query.ids;
      if (!idsParam || typeof idsParam !== 'string') {
        return res.json({ ok: true, data: [] });
      }
      const ids = idsParam.split(',').map((id) => parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0);
      if (ids.length === 0) return res.json({ ok: true, data: [] });
      const placeholders = ids.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT p.id AS product_id,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = p.tenant_id AND va.product_id = p.id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = p.tenant_id AND pi.product_id = p.id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_products p
         WHERE p.tenant_id=? AND p.id IN (${placeholders})`,
        [tenantId, ...ids]
      );
      const data = rows.map((r) => ({
        product_id: r.product_id,
        has_variants: r.has_variants != null ? 1 : 0,
        has_changeable_composition: r.has_changeable_composition != null ? 1 : 0,
      }));
      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT b.id, b.title, b.sort_order, b.min_select, b.max_select, b.created_at, b.updated_at,
                (SELECT COUNT(*) FROM prod_combo_block_products bp WHERE bp.block_id = b.id) AS products_count
         FROM prod_combo_blocks b
         WHERE b.tenant_id=?
         ORDER BY b.sort_order ASC, b.id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!block) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const [productsRaw] = await db.query(
        `SELECT bp.id, bp.product_id, bp.sort_order, bp.is_default, p.name AS product_name, p.price AS product_price, p.photos_json AS product_photos_json,
           (SELECT 1 FROM prod_variant_assignments va
            INNER JOIN prod_variant_groups vg ON vg.id = va.variant_group_id AND vg.tenant_id = va.tenant_id
            WHERE va.tenant_id = bp.tenant_id AND va.product_id = bp.product_id AND va.is_active = 1 AND vg.is_active = 1 LIMIT 1) AS has_variants,
           (SELECT 1 FROM prod_product_ingredients pi
            WHERE pi.tenant_id = bp.tenant_id AND pi.product_id = bp.product_id AND pi.is_variable = 1 LIMIT 1) AS has_changeable_composition
         FROM prod_combo_block_products bp
         JOIN prod_products p ON p.id = bp.product_id
         WHERE bp.tenant_id=? AND bp.block_id=?
         ORDER BY bp.sort_order ASC, bp.id ASC`,
        [tenantId, id]
      );
      const photos = productsRaw.map((r) => helpers.safeJsonArray(r.product_photos_json));
      const products = productsRaw.map((r, i) => {
        const arr = photos[i];
        const product_photo = Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
        return {
          id: r.id,
          product_id: r.product_id,
          product_name: r.product_name,
          product_price: r.product_price != null ? Number(r.product_price) : 0,
          sort_order: r.sort_order,
          is_default: r.is_default,
          product_photo,
          has_variants: r.has_variants != null ? 1 : 0,
          has_changeable_composition: r.has_changeable_composition != null ? 1 : 0,
        };
      });
      let defaultSet = false;
      for (const p of products) {
        const wasDefault = Number(p.is_default) === 1;
        p.is_default = wasDefault && !defaultSet ? 1 : 0;
        if (wasDefault) defaultSet = true;
      }
      res.json({ ok: true, data: { ...block, products } });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/combo-blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const minSelect = Math.max(0, parseInt(helpers.numOrNull(req.body.min_select), 10) || 1);
      const maxSelect = Math.max(1, parseInt(helpers.numOrNull(req.body.max_select), 10) || 1);
      if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      const [result] = await db.query(
        'INSERT INTO prod_combo_blocks (tenant_id, title, sort_order, min_select, max_select) VALUES (?,?,?,?,?)',
        [tenantId, title.trim(), sortOrder, minSelect, Math.max(minSelect, maxSelect)]
      );
      const blockId = result.insertId;
      const products = Array.isArray(req.body.products) ? req.body.products : [];
      if (products.length) {
        let defaultSet = false;
        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          const productId = Number(p.product_id);
          if (!Number.isFinite(productId) || productId <= 0) continue;
          const isDefault = p.is_default ? 1 : (defaultSet ? 0 : (defaultSet = true, 1));
          await db.query(
            'INSERT INTO prod_combo_block_products (tenant_id, block_id, product_id, sort_order, is_default) VALUES (?,?,?,?,?)',
            [tenantId, blockId, productId, Number(p.sort_order) ?? i, isDefault]
          );
        }
      }
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE id=? LIMIT 1',
        [blockId]
      );
      res.status(201).json({ ok: true, data: block });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[existing]] = await db.query(
        'SELECT id FROM prod_combo_blocks WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const title = helpers.strOrNull(req.body.title);
      const sortOrder = helpers.numOrNull(req.body.sort_order);
      const minSelect = req.body.min_select !== undefined ? Math.max(0, parseInt(req.body.min_select, 10) || 1) : null;
      const maxSelect = req.body.max_select !== undefined ? Math.max(1, parseInt(req.body.max_select, 10) || 1) : null;
      if (title !== null) {
        await db.query('UPDATE prod_combo_blocks SET title=? WHERE tenant_id=? AND id=?', [title.trim(), tenantId, id]);
      }
      if (sortOrder !== undefined && sortOrder !== null) {
        await db.query('UPDATE prod_combo_blocks SET sort_order=? WHERE tenant_id=? AND id=?', [sortOrder, tenantId, id]);
      }
      if (minSelect !== null) {
        await db.query('UPDATE prod_combo_blocks SET min_select=? WHERE tenant_id=? AND id=?', [minSelect, tenantId, id]);
      }
      if (maxSelect !== null) {
        await db.query('UPDATE prod_combo_blocks SET max_select = GREATEST(COALESCE(min_select,1), ?) WHERE tenant_id=? AND id=?', [maxSelect, tenantId, id]);
      }
      if (Array.isArray(req.body.products)) {
        await db.query('DELETE FROM prod_combo_block_products WHERE tenant_id=? AND block_id=?', [tenantId, id]);
        const products = req.body.products;
        let defaultSet = false;
        for (let i = 0; i < products.length; i++) {
          const p = products[i];
          const productId = Number(p.product_id);
          if (!Number.isFinite(productId) || productId <= 0) continue;
          const isDefault = p.is_default ? 1 : (defaultSet ? 0 : (defaultSet = true, 1));
          await db.query(
            'INSERT INTO prod_combo_block_products (tenant_id, block_id, product_id, sort_order, is_default) VALUES (?,?,?,?,?)',
            [tenantId, id, productId, Number(p.sort_order) ?? i, isDefault]
          );
        }
      }
      const [[block]] = await db.query(
        'SELECT id, title, sort_order, min_select, max_select, created_at, updated_at FROM prod_combo_blocks WHERE id=? LIMIT 1',
        [id]
      );
      res.json({ ok: true, data: block });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/combo-blocks/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [result] = await db.query('DELETE FROM prod_combo_blocks WHERE tenant_id=? AND id=?', [tenantId, id]);
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Combo sets (prod_combos) CRUD + blocks
  // ------------------------------
  router.get('/admin/combos', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at
         FROM prod_combos WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!row) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/combos/:id/blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const comboId = Number(req.params.id);
      if (!Number.isFinite(comboId) || comboId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[combo]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, comboId]);
      if (!combo) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const [rows] = await db.query(
        `SELECT sb.id, sb.combo_id, sb.block_id, sb.sort_order, b.title AS block_title
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, comboId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/combos', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      const description = helpers.strOrNull(req.body.description) || null;
      const discountPercent = helpers.numOrNull(req.body.discount_percent) ?? 0;
      const categoryCode = helpers.strOrNull(req.body.category_code) || null;
      const imageUrl = helpers.strOrNull(req.body.image_url) || null;
      const isActive = req.body.is_active === false || req.body.is_active === '0' ? 0 : 1;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      if (!title || !title.trim()) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      const [result] = await db.query(
        'INSERT INTO prod_combos (tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order) VALUES (?,?,?,?,?,?,?,?)',
        [tenantId, title.trim(), description, discountPercent, categoryCode, imageUrl, isActive, sortOrder]
      );
      const comboId = result.insertId;
      const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const blockId = Number(b.block_id);
        if (!Number.isFinite(blockId) || blockId <= 0) continue;
        await db.query(
          'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
          [tenantId, comboId, blockId, Number(b.sort_order) ?? i]
        );
      }
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE id=? LIMIT 1',
        [comboId]
      );
      res.status(201).json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.patch('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[existing]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, id]);
      if (!existing) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      const title = helpers.strOrNull(req.body.title);
      const description = helpers.strOrNull(req.body.description);
      const discountPercent = req.body.discount_percent !== undefined ? (helpers.numOrNull(req.body.discount_percent) ?? 0) : null;
      const categoryCode = req.body.category_code !== undefined ? (helpers.strOrNull(req.body.category_code) || null) : null;
      const imageUrl = req.body.image_url !== undefined ? (helpers.strOrNull(req.body.image_url) || null) : null;
      const isActive = req.body.is_active !== undefined ? (req.body.is_active === false || req.body.is_active === '0' || req.body.is_active === 0 ? 0 : 1) : null;
      const sortOrder = req.body.sort_order !== undefined ? (helpers.numOrNull(req.body.sort_order) ?? 0) : null;
      const updates = [];
      const params = [];
      if (title !== null) { updates.push('title=?'); params.push(title.trim()); }
      if (description !== undefined) { updates.push('description=?'); params.push(description); }
      if (discountPercent !== null) { updates.push('discount_percent=?'); params.push(discountPercent); }
      if (categoryCode !== undefined) { updates.push('category_code=?'); params.push(categoryCode); }
      if (imageUrl !== undefined) { updates.push('image_url=?'); params.push(imageUrl); }
      if (isActive !== null) { updates.push('is_active=?'); params.push(isActive); }
      if (sortOrder !== null) { updates.push('sort_order=?'); params.push(sortOrder); }
      if (updates.length) {
        params.push(tenantId, id);
        await db.query('UPDATE prod_combos SET ' + updates.join(', ') + ' WHERE tenant_id=? AND id=?', params);
      }
      if (Array.isArray(req.body.blocks)) {
        await db.query('DELETE FROM prod_combo_set_blocks WHERE tenant_id=? AND combo_id=?', [tenantId, id]);
        for (let i = 0; i < req.body.blocks.length; i++) {
          const b = req.body.blocks[i];
          const blockId = Number(b.block_id);
          if (!Number.isFinite(blockId) || blockId <= 0) continue;
          await db.query(
            'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
            [tenantId, id, blockId, Number(b.sort_order) ?? i]
          );
        }
      }
      const [[row]] = await db.query(
        'SELECT id, tenant_id, title, description, discount_percent, category_code, image_url, is_active, sort_order, created_at, updated_at FROM prod_combos WHERE id=? LIMIT 1',
        [id]
      );
      res.json({ ok: true, data: row });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/combos/:id/blocks', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const comboId = Number(req.params.id);
      if (!Number.isFinite(comboId) || comboId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [[combo]] = await db.query('SELECT id FROM prod_combos WHERE tenant_id=? AND id=? LIMIT 1', [tenantId, comboId]);
      if (!combo) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      await db.query('DELETE FROM prod_combo_set_blocks WHERE tenant_id=? AND combo_id=?', [tenantId, comboId]);
      const blocks = Array.isArray(req.body.blocks) ? req.body.blocks : [];
      for (let i = 0; i < blocks.length; i++) {
        const b = blocks[i];
        const blockId = Number(b.block_id);
        if (!Number.isFinite(blockId) || blockId <= 0) continue;
        await db.query(
          'INSERT INTO prod_combo_set_blocks (tenant_id, combo_id, block_id, sort_order) VALUES (?,?,?,?)',
          [tenantId, comboId, blockId, Number(b.sort_order) ?? i]
        );
      }
      const [rows] = await db.query(
        `SELECT sb.id, sb.combo_id, sb.block_id, sb.sort_order, b.title AS block_title
         FROM prod_combo_set_blocks sb
         JOIN prod_combo_blocks b ON b.id = sb.block_id AND b.tenant_id = sb.tenant_id
         WHERE sb.tenant_id=? AND sb.combo_id=? ORDER BY sb.sort_order ASC, sb.id ASC`,
        [tenantId, comboId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/combos/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      const [result] = await db.query('DELETE FROM prod_combos WHERE tenant_id=? AND id=?', [tenantId, id]);
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/admin/products/:id/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const [rows] = await db.query(
        `SELECT a.id AS assignment_id, a.group_id, a.priority, a.sort_order, a.is_active, a.out_of_stock_action,
                g.title, g.selection_type, g.min_select, g.max_select
         FROM prod_option_assignments a
         JOIN prod_option_groups g ON g.tenant_id=a.tenant_id AND g.id=a.group_id
         WHERE a.tenant_id=? AND a.assign_type='product' AND a.assign_id=?
         ORDER BY a.sort_order ASC, a.id ASC`,
        [tenantId, productId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/option-assignments', async (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const productId = Number(req.params.id);
    if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
    const groupIds = Array.isArray(req.body.group_ids) ? req.body.group_ids : [];
    const norm = Array.from(new Set(groupIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
    if (!norm.length) return res.status(400).json({ ok: false, error: 'EMPTY' });

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [existing] = await conn.query(
        `SELECT id, group_id, is_active
         FROM prod_option_assignments
         WHERE tenant_id=? AND assign_type='product' AND assign_id=?
           AND group_id IN (${norm.map(() => '?').join(',')})`,
        [tenantId, productId, ...norm]
      );
      const map = new Map(existing.map((row) => [Number(row.group_id), row]));
      const added = [];
      const reenabled = [];
      const skipped = [];

      for (const groupId of norm) {
        const row = map.get(groupId);
        if (!row) {
          await conn.query(
            `INSERT INTO prod_option_assignments
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, out_of_stock_action, is_active)
             VALUES (?,?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', productId, 0, 0, 1]
          );
          added.push(groupId);
          continue;
        }
        if (row.is_active) {
          skipped.push(groupId);
          continue;
        }
        await conn.query(
          `UPDATE prod_option_assignments
           SET is_active=1, priority=0, sort_order=0, out_of_stock_action=COALESCE(out_of_stock_action, 1)
           WHERE tenant_id=? AND id=?`,
          [tenantId, row.id]
        );
        reenabled.push(groupId);
      }

      await conn.commit();
      res.json({ ok: true, added, reenabled, skipped });
    } catch (e) {
      await conn.rollback();
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  async function disableProductAssignment(req, res) {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const groupId = Number(req.params.groupId);
      if (!Number.isFinite(productId) || productId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });
      if (!Number.isFinite(groupId) || groupId <= 0) return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });

      await db.query(
        `UPDATE prod_option_assignments
         SET is_active=0
         WHERE tenant_id=? AND assign_type='product' AND assign_id=? AND group_id=?`,
        [tenantId, productId, groupId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.patch('/admin/products/:id/option-assignments/:groupId', disableProductAssignment);
  router.delete('/admin/products/:id/option-assignments/:groupId', disableProductAssignment);

  // ------------------------------
  // Units: /api/admin/units
  // ------------------------------
  router.get('/admin/units', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const showAll = String(req.query.all || "") === "1";
      const whereActive = showAll ? "" : "AND is_active=1";
      const [rows] = await db.query(
        `SELECT id, code, title, short_title, sort_order, is_active
         FROM prod_units
         WHERE tenant_id=? ${whereActive}
         ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/units', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const shortTitle = helpers.strOrNull(req.body.short_title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const [result] = await db.query(
        `INSERT INTO prod_units
         (tenant_id, code, title, short_title, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, code, title, shortTitle, sortOrder, isActive]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/units/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const code = helpers.strOrNull(req.body.code) || helpers.makeCodeFromTitle(title);
      const shortTitle = helpers.strOrNull(req.body.short_title);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      await db.query(
        `UPDATE prod_units
         SET code=?, title=?, short_title=?, sort_order=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [code, title, shortTitle, sortOrder, isActive, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/units/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `UPDATE prod_units
         SET is_active=0
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Unit conversions: /api/admin/unit-conversions
  // ------------------------------
  router.get('/admin/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const showAll = String(req.query.all || "") === "1";
      const whereActive = showAll ? "" : "AND is_active=1";
      const [rows] = await db.query(
        `SELECT id, from_unit_id, to_unit_id, factor, is_active
         FROM prod_unit_conversions
         WHERE tenant_id=? ${whereActive}
         ORDER BY id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/unit-conversions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const fromUnitId = helpers.numOrNull(req.body.from_unit_id);
      const toUnitId = helpers.numOrNull(req.body.to_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      if (!fromUnitId || !toUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      const [result] = await db.query(
        `INSERT INTO prod_unit_conversions
         (tenant_id, from_unit_id, to_unit_id, factor, is_active)
         VALUES (?, ?, ?, ?, 1)`,
        [tenantId, fromUnitId, toUnitId, factor]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/unit-conversions/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const fromUnitId = helpers.numOrNull(req.body.from_unit_id);
      const toUnitId = helpers.numOrNull(req.body.to_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      if (!fromUnitId || !toUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      await db.query(
        `UPDATE prod_unit_conversions
         SET from_unit_id=?, to_unit_id=?, factor=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [fromUnitId, toUnitId, factor, isActive, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/unit-conversions/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      await db.query(
        `UPDATE prod_unit_conversions
         SET is_active=0
         WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product unit links: /api/admin/products/:id/unit-links
  // ------------------------------
  router.get('/admin/products/:id/unit-links', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const [rows] = await db.query(
        `SELECT id, unit_id, base_unit_id, factor
         FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=?
         ORDER BY id ASC`,
        [tenantId, productId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/unit-links', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      const unitId = helpers.numOrNull(req.body.unit_id);
      const baseUnitId = helpers.numOrNull(req.body.base_unit_id);
      const factor = helpers.numOrNull(req.body.factor);
      if (!unitId || !baseUnitId || !factor) {
        return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });
      }

      const [existing] = await db.query(
        `SELECT id FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=? AND unit_id=? AND base_unit_id=?`,
        [tenantId, productId, unitId, baseUnitId]
      );

      if (existing.length) {
        await db.query(
          `UPDATE prod_product_unit_links
           SET factor=?
           WHERE tenant_id=? AND id=?`,
          [factor, tenantId, existing[0].id]
        );
        return res.json({ ok: true, id: existing[0].id });
      }

      const [result] = await db.query(
        `INSERT INTO prod_product_unit_links
         (tenant_id, product_id, unit_id, base_unit_id, factor)
         VALUES (?, ?, ?, ?, ?)`,
        [tenantId, productId, unitId, baseUnitId, factor]
      );
      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/products/:id/unit-links/:unitId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const unitId = Number(req.params.unitId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
      }

      await db.query(
        `DELETE FROM prod_product_unit_links
         WHERE tenant_id=? AND product_id=? AND unit_id=?`,
        [tenantId, productId, unitId]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Product Ingredients: /api/admin/products/:id/ingredients
  // ------------------------------
  router.get('/admin/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [pcsRows] = await db.query(
        `SELECT id FROM prod_units WHERE tenant_id=? AND code='pcs' LIMIT 1`,
        [tenantId]
      );
      const pcsUnitId = pcsRows.length ? Number(pcsRows[0].id) : null;

      let recipeBaseUnitId = null;
      if (pcsUnitId) {
        const [recipeRows] = await db.query(
          `SELECT base_unit_id FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1`,
          [tenantId, productId]
        );
        if (recipeRows.length && recipeRows[0].base_unit_id) {
          recipeBaseUnitId = Number(recipeRows[0].base_unit_id);
        }
      }

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
           p.cost_price AS ingredient_cost_price,
           p.base_unit_id AS ingredient_base_unit_id,
           p.base_qty AS ingredient_base_qty,
           p.photos_json AS ingredient_photos,
           p.unit_id AS ingredient_unit_id,
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
          AND pul.unit_id=?
          AND (
            (p.base_unit_id = ? AND pul.base_unit_id = ?)
            OR
            (p.base_unit_id <> ? AND pul.base_unit_id = p.base_unit_id)
          )
         WHERE i.tenant_id=? AND i.product_id=?
         ORDER BY i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, pcsUnitId || 0, recipeBaseUnitId || 0, pcsUnitId || 0, tenantId, productId]
      );

      for (const r of rows) {
        r.ingredient_photos = helpers.safeJsonArray(r.ingredient_photos);
      }

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/admin/products/:id/ingredients', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const ingredientId = Number(req.body.ingredient_id);
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      // Get unit_id from ingredient product if not provided
      let unitId = Number(req.body.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        const [ingredientRows] = await db.query(
          `SELECT unit_id FROM prod_products WHERE tenant_id=? AND id=?`,
          [tenantId, ingredientId]
        );
        if (ingredientRows.length && ingredientRows[0].unit_id) {
          unitId = Number(ingredientRows[0].unit_id);
        } else {
          return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
        }
      }

      const quantity = helpers.numOrNull(req.body.quantity) ?? 1;
      const quantityMin = helpers.numOrNull(req.body.quantity_min);
      const quantityMax = helpers.numOrNull(req.body.quantity_max);
      const quantityStep = helpers.numOrNull(req.body.quantity_step);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const isVariable = Number(req.body.is_variable) === 1 ? 1 : 0;
      const sortOrder = Number(req.body.sort_order) || 0;

      // Check if already exists
      const [existing] = await db.query(
        `SELECT id FROM prod_product_ingredients
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [tenantId, productId, ingredientId]
      );

      if (existing.length) {
        return res.status(400).json({ ok: false, error: 'ALREADY_EXISTS' });
      }

      const [result] = await db.query(
        `INSERT INTO prod_product_ingredients
         (tenant_id, product_id, ingredient_id, quantity, unit_id, quantity_min, quantity_max, quantity_step, price_override, is_variable, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, productId, ingredientId, quantity, unitId, quantityMin, quantityMax, quantityStep, priceOverride, isVariable, sortOrder]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/admin/products/:id/ingredients/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      const unitId = Number(req.body.unit_id);
      if (!Number.isFinite(unitId) || unitId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_UNIT_ID' });
      }

      const quantity = helpers.numOrNull(req.body.quantity) ?? 1;
      const quantityMin = helpers.numOrNull(req.body.quantity_min);
      const quantityMax = helpers.numOrNull(req.body.quantity_max);
      const quantityStep = helpers.numOrNull(req.body.quantity_step);
      const priceOverride = helpers.numOrNull(req.body.price_override);
      const isVariable = Number(req.body.is_variable) === 1 ? 1 : 0;
      const sortOrder = Number(req.body.sort_order) || 0;

      await db.query(
        `UPDATE prod_product_ingredients
         SET quantity=?, unit_id=?, quantity_min=?, quantity_max=?, quantity_step=?, price_override=?, is_variable=?, sort_order=?
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [quantity, unitId, quantityMin, quantityMax, quantityStep, priceOverride, isVariable, sortOrder, tenantId, productId, ingredientId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/admin/products/:id/ingredients/:ingredientId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = Number(req.params.id);
      const ingredientId = Number(req.params.ingredientId);
      if (!Number.isFinite(productId) || productId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }
      if (!Number.isFinite(ingredientId) || ingredientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_INGREDIENT_ID' });
      }

      await db.query(
        `DELETE FROM prod_product_ingredients
         WHERE tenant_id=? AND product_id=? AND ingredient_id=?`,
        [tenantId, productId, ingredientId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
