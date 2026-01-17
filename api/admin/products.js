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
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);

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
      const unit_id = helpers.numOrNull(req.body.unit_id);
      const base_unit_id = helpers.numOrNull(req.body.base_unit_id);
      const base_qty = helpers.numOrNull(req.body.base_qty);

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

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // DELETE product (soft delete)
  // DELETE /api/prod_products/:id
  // ------------------------------
  router.delete('/prod_products/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем существование товара
      const [rows] = await db.query(
        'SELECT id FROM prod_products WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Soft delete: устанавливаем is_active=0 и site_visibility=0
      // Данные товара в заказах сохраняются в JSON поле items
      await db.query(
        `UPDATE prod_products
         SET is_active=0, site_visibility=0
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

  const sortOrder = helpers.numOrNull(group.sort_order) ?? 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO prod_option_groups
       (tenant_id, title, selection_type, min_select, max_select, is_active, is_required, sort_order)
       VALUES (?,?,?,?,?,?,?,?)`,
      [tenantId, title, selectionType, minSelect, maxSelect, isActive, isRequired, sortOrder]
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
        1
      ]));
      await conn.query(
        `INSERT INTO prod_option_assignments
         (tenant_id, group_id, assign_type, assign_id, priority, sort_order, is_active)
         VALUES ?
         ON DUPLICATE KEY UPDATE
           priority=VALUES(priority),
           sort_order=VALUES(sort_order)`,
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
        const priceValue = priceMode === 'fixed' ? helpers.numOrNull(item.price_value) : null;
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
          values.push(priceMode === 'fixed' ? helpers.numOrNull(req.body.price_value) : null);
          fields.push('price_value=?');
        }
      } else if (Object.prototype.hasOwnProperty.call(req.body, 'price_value')) {
        fields.push('price_value=?');
        values.push(helpers.numOrNull(req.body.price_value));
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
    const norm = Array.from(new Set(assignIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)));
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
          await conn.query(
            `INSERT INTO prod_option_assignments
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, is_active)
             VALUES (?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', id, 0, 0]
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

      await db.query(
        `UPDATE prod_option_assignments
         SET priority=COALESCE(?, priority),
             sort_order=COALESCE(?, sort_order)
         WHERE tenant_id=? AND id=?`,
        [priority, sortOrder, tenantId, id]
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
        `SELECT p.id, p.name, p.price, p.cost_price, p.unit_id, p.base_unit_id, p.base_qty
         FROM prod_products p`;

      if (categoryId) {
        sql += ` JOIN prod_product_categories pc
                 ON pc.tenant_id=p.tenant_id AND pc.product_id=p.id AND pc.category_id=?`;
        params.push(categoryId);
      }

      sql += ` WHERE p.tenant_id=?`;
      params.push(tenantId);

      if (q) {
        sql += ` AND p.name LIKE ?`;
        params.push(`%${q}%`);
      }

      sql += ` ORDER BY p.name ASC, p.id ASC LIMIT 200`;

      const [rows] = await db.query(sql, params);
      res.json({ ok: true, data: rows });
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
        `SELECT a.id AS assignment_id, a.group_id, a.priority, a.sort_order, a.is_active,
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
             (tenant_id, group_id, assign_type, assign_id, priority, sort_order, is_active)
             VALUES (?,?,?,?,?,?,1)`,
            [tenantId, groupId, 'product', productId, 0, 0]
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
           SET is_active=1, priority=0, sort_order=0
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
         (tenant_id, store_id, code, title, short_title, sort_order, is_active)
         VALUES (?, 1, ?, ?, ?, ?, ?)`,
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
         (tenant_id, store_id, from_unit_id, to_unit_id, factor, is_active)
         VALUES (?, 1, ?, ?, ?, 1)`,
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
         (tenant_id, store_id, product_id, unit_id, base_unit_id, factor)
         VALUES (?, 1, ?, ?, ?, ?)`,
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
          AND pul.base_unit_id=p.base_unit_id
          AND pul.unit_id=?
         WHERE i.tenant_id=? AND i.product_id=?
         ORDER BY i.sort_order ASC, i.id ASC`,
        [pcsUnitId || 0, tenantId, productId]
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
         (tenant_id, store_id, product_id, ingredient_id, quantity, unit_id, quantity_min, quantity_max, quantity_step, price_override, is_variable, sort_order)
         VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
