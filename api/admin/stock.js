const express = require('express');

module.exports = function makeAdminStockRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();

  function publishStockChanged(tenantId, storeId, payload = {}) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== 'function') return;
      ordersEvents.publish(tenantId, storeId, 'stock.changed', {
        tenant_id: Number(tenantId),
        store_id: Number(storeId),
        ...payload,
      });
    } catch (err) {
      console.error('publishStockChanged error:', err);
    }
  }

  function toPositiveInt(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return Math.trunc(n);
  }

  function roundQty(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n * 1000) / 1000;
  }

  let stockPurchasePriceColumnPromise = null;
  async function hasStockPurchasePriceColumn() {
    if (!stockPurchasePriceColumnPromise) {
      stockPurchasePriceColumnPromise = db.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE()
           AND TABLE_NAME='prod_stock_document_items'
           AND COLUMN_NAME='purchase_price'
         LIMIT 1`
      )
        .then(([rows]) => rows.length > 0)
        .catch((err) => {
          console.warn('hasStockPurchasePriceColumn check failed:', err?.message || err);
          return false;
        });
    }
    return stockPurchasePriceColumnPromise;
  }

  let stockPurchaseTotalColumnPromise = null;
  async function hasStockPurchaseTotalColumn() {
    if (!stockPurchaseTotalColumnPromise) {
      stockPurchaseTotalColumnPromise = db.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA=DATABASE()
           AND TABLE_NAME='prod_stock_document_items'
           AND COLUMN_NAME='purchase_total'
         LIMIT 1`
      )
        .then(([rows]) => rows.length > 0)
        .catch((err) => {
          console.warn('hasStockPurchaseTotalColumn check failed:', err?.message || err);
          return false;
        });
    }
    return stockPurchaseTotalColumnPromise;
  }

  function createUnitFactorResolver(conn, tenantId) {
    const unitConvCache = new Map();
    const productUnitCache = new Map();

    async function getGeneralConversion(fromUnitId, toUnitId) {
      if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
      const key = `${Number(fromUnitId)}_${Number(toUnitId)}`;
      if (unitConvCache.has(key)) return unitConvCache.get(key);

      const [direct] = await conn.query(
        `SELECT factor
         FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1
         LIMIT 1`,
        [tenantId, fromUnitId, toUnitId]
      );
      if (direct.length && direct[0].factor) {
        const factor = Number(direct[0].factor);
        unitConvCache.set(key, factor);
        return factor;
      }

      const [inverse] = await conn.query(
        `SELECT factor
         FROM prod_unit_conversions
         WHERE tenant_id=? AND from_unit_id=? AND to_unit_id=? AND is_active=1
         LIMIT 1`,
        [tenantId, toUnitId, fromUnitId]
      );
      if (inverse.length && inverse[0].factor) {
        const factor = 1 / Number(inverse[0].factor);
        unitConvCache.set(key, factor);
        return factor;
      }

      unitConvCache.set(key, null);
      return null;
    }

    async function getProductConversion(productId, fromUnitId, toUnitId) {
      if (!productId || !fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;
      const key = `${Number(productId)}_${Number(fromUnitId)}_${Number(toUnitId)}`;
      if (productUnitCache.has(key)) return productUnitCache.get(key);

      const [rows] = await conn.query(
        `SELECT unit_id, base_unit_id, factor
         FROM prod_product_unit_links
         WHERE tenant_id=?
           AND product_id=?
           AND (
             (unit_id=? AND base_unit_id=?)
             OR
             (unit_id=? AND base_unit_id=?)
           )
         LIMIT 1`,
        [tenantId, productId, fromUnitId, toUnitId, toUnitId, fromUnitId]
      );

      if (!rows.length || !rows[0].factor) {
        productUnitCache.set(key, null);
        return null;
      }

      const row = rows[0];
      let factor = Number(row.factor);
      if (Number(row.unit_id) === Number(toUnitId) && Number(row.base_unit_id) === Number(fromUnitId)) {
        factor = factor !== 0 ? 1 / factor : null;
      }

      factor = factor && Number.isFinite(factor) ? factor : null;
      productUnitCache.set(key, factor);
      return factor;
    }

    return async function resolveUnitFactor(fromUnitId, toUnitId, productId = null) {
      if (!fromUnitId || !toUnitId || Number(fromUnitId) === Number(toUnitId)) return 1;

      const general = await getGeneralConversion(fromUnitId, toUnitId);
      if (general != null) return general;

      if (!productId) return null;
      return getProductConversion(productId, fromUnitId, toUnitId);
    };
  }

  async function loadProductsByIds(conn, tenantId, productIds) {
    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(toPositiveInt).filter(Boolean))];
    if (!ids.length) return new Map();
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await conn.query(
      `SELECT id, unit_id, base_unit_id
       FROM prod_products
       WHERE tenant_id=? AND id IN (${placeholders})`,
      [tenantId, ...ids]
    );
    const map = new Map();
    rows.forEach((row) => {
      const id = toPositiveInt(row?.id);
      if (!id) return;
      map.set(id, {
        id,
        unit_id: toPositiveInt(row?.unit_id),
        base_unit_id: toPositiveInt(row?.base_unit_id),
      });
    });
    return map;
  }

  async function convertDocumentItemQtyToBase(item, product, resolveUnitFactor) {
    const qty = roundQty(item?.qty);
    if (qty <= 0) return 0;

    const productId = toPositiveInt(product?.id || item?.product_id);
    const fromUnitId = toPositiveInt(item?.unit_id)
      || toPositiveInt(product?.base_unit_id)
      || toPositiveInt(product?.unit_id);
    const baseUnitId = toPositiveInt(product?.base_unit_id)
      || toPositiveInt(product?.unit_id)
      || fromUnitId;

    if (!fromUnitId || !baseUnitId || fromUnitId === baseUnitId) {
      return qty;
    }

    const factor = await resolveUnitFactor(fromUnitId, baseUnitId, productId);
    if (!Number.isFinite(Number(factor)) || Number(factor) <= 0) {
      return null;
    }

    return roundQty(qty * Number(factor));
  }

  // =============================================
  // GET /documents — список документов
  // =============================================
  router.get('/documents', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const where = ['d.tenant_id=?', 'd.store_id=?'];
      const params = [tenantId, storeId];

      const type = helpers.strOrNull(req.query.type);
      if (type && ['in', 'out', 'order'].includes(type)) {
        where.push('d.type=?');
        params.push(type);
      }

      const status = helpers.strOrNull(req.query.status);
      if (status && ['draft', 'posted'].includes(status)) {
        where.push('d.status=?');
        params.push(status);
      }

      let limit = Number(req.query.limit ?? 50);
      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      const purchasePriceColumnAvailable = await hasStockPurchasePriceColumn();
      const purchaseTotalColumnAvailable = await hasStockPurchaseTotalColumn();
      const totalSpentSumSelect = purchaseTotalColumnAvailable
        ? `(SELECT COALESCE(SUM(COALESCE(i.purchase_total, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_spent_sum,`
        : (purchasePriceColumnAvailable
          ? `(SELECT COALESCE(SUM(i.qty * COALESCE(i.purchase_price, i.cost_price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_spent_sum,`
          : `(SELECT COALESCE(SUM(i.qty * COALESCE(i.cost_price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_spent_sum,`);

      const [rows] = await db.query(
        `SELECT d.*,
                u.name AS created_by_name,
                (SELECT COUNT(*) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS items_count,
                (SELECT COALESCE(SUM(i.qty * COALESCE(i.cost_price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_cost_sum,
                (SELECT COALESCE(SUM(i.qty * COALESCE(i.price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_sale_sum,
                ${totalSpentSumSelect}
                (SELECT o.id
                 FROM order_orders o
                 WHERE o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.stock_document_id=d.id
                 ORDER BY o.id DESC
                 LIMIT 1) AS order_id,
                (SELECT o.public_id
                 FROM order_orders o
                 WHERE o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.stock_document_id=d.id
                 ORDER BY o.id DESC
                 LIMIT 1) AS order_public_id,
                (SELECT o.total_price
                 FROM order_orders o
                 WHERE o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.stock_document_id=d.id
                 ORDER BY o.id DESC
                 LIMIT 1) AS order_total_price
         FROM prod_stock_documents d
         LEFT JOIN app_users u ON u.id = d.created_by
         WHERE ${where.join(' AND ')}
         ORDER BY d.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [cntRows] = await db.query(
        `SELECT COUNT(*) AS c FROM prod_stock_documents d WHERE ${where.join(' AND ')}`,
        params
      );

      res.json({ ok: true, data: rows, total: cntRows[0].c });
    } catch (e) {
      console.error('stock GET /documents error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // GET /documents/:id — документ с позициями
  // =============================================
  router.get('/documents/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [docs] = await db.query(
        `SELECT d.*, u.name AS created_by_name,
                (SELECT o.id
                 FROM order_orders o
                 WHERE o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.stock_document_id=d.id
                 ORDER BY o.id DESC
                 LIMIT 1) AS order_id,
                (SELECT o.public_id
                 FROM order_orders o
                 WHERE o.tenant_id=d.tenant_id AND o.store_id=d.store_id AND o.stock_document_id=d.id
                 ORDER BY o.id DESC
                 LIMIT 1) AS order_public_id
         FROM prod_stock_documents d
         LEFT JOIN app_users u ON u.id = d.created_by
         WHERE d.tenant_id=? AND d.store_id=? AND d.id=?
         LIMIT 1`,
        [tenantId, storeId, id]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const [items] = await db.query(
        `SELECT i.*, p.name AS product_name, p.sku, p.photos_json,
                p.cost_price AS product_cost_price, p.price AS product_price,
                p.base_qty AS product_base_qty,
                p.unit_id AS product_unit_id, p.base_unit_id AS product_base_unit_id,
                un.short_title AS unit_short
         FROM prod_stock_document_items i
         LEFT JOIN prod_products p ON p.id = i.product_id
         LEFT JOIN prod_units un ON un.id = i.unit_id
         WHERE i.document_id=?
         ORDER BY i.id`,
        [id]
      );

      let order = null;
      if (String(docs[0]?.type || '') === 'order') {
        const [orderRows] = await db.query(
          `SELECT id, public_id, total_price, created_at, items
           FROM order_orders
           WHERE tenant_id=? AND store_id=? AND stock_document_id=?
           ORDER BY id DESC
           LIMIT 1`,
          [tenantId, storeId, id]
        );
        if (orderRows.length) {
          const row = orderRows[0];
          let parsedItems = [];
          try {
            const parsed = row.items ? JSON.parse(row.items) : [];
            if (Array.isArray(parsed)) parsedItems = parsed;
          } catch {
            parsedItems = [];
          }
          order = {
            id: Number(row.id),
            public_id: row.public_id || null,
            total_price: Number(row.total_price || 0),
            created_at: row.created_at || null,
            items: parsedItems,
          };
        }
      }

      res.json({ ok: true, data: { ...docs[0], items, order } });
    } catch (e) {
      console.error('stock GET /documents/:id error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // POST /documents — создать документ
  // =============================================
  router.post('/documents', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const userId = req.user?.userId || null;

      const type = helpers.strOrNull(req.body.type);
      if (!type || !['in', 'out'].includes(type)) {
        return res.status(400).json({ ok: false, error: 'BAD_TYPE' });
      }

      const comment = helpers.strOrNull(req.body.comment);
      const number = helpers.strOrNull(req.body.number);

      const [result] = await db.query(
        `INSERT INTO prod_stock_documents (tenant_id, store_id, type, status, number, comment, created_by)
         VALUES (?, ?, ?, 'draft', ?, ?, ?)`,
        [tenantId, storeId, type, number, comment, userId]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error('stock POST /documents error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // PUT /documents/:id — обновить черновик
  // =============================================
  router.put('/documents/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем что документ существует и в статусе draft
      const [docs] = await db.query(
        'SELECT status FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
        [tenantId, storeId, id]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      if (docs[0].status !== 'draft') {
        return res.status(400).json({ ok: false, error: 'ALREADY_POSTED' });
      }

      const comment = helpers.strOrNull(req.body.comment);
      const number = helpers.strOrNull(req.body.number);

      await db.query(
        'UPDATE prod_stock_documents SET comment=?, number=? WHERE id=?',
        [comment, number, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error('stock PUT /documents/:id error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // DELETE /documents/:id — удалить черновик
  // =============================================
  router.delete('/documents/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [docs] = await db.query(
        'SELECT status FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
        [tenantId, storeId, id]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }
      if (docs[0].status !== 'draft') {
        return res.status(400).json({ ok: false, error: 'CANNOT_DELETE_POSTED' });
      }

      // CASCADE удалит позиции автоматически
      await db.query(
        'DELETE FROM prod_stock_documents WHERE id=?',
        [id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error('stock DELETE /documents/:id error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // POST /documents/:id/items — добавить позицию
  // =============================================
  router.post('/documents/:id/items', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const docId = Number(req.params.id);

      if (!Number.isFinite(docId) || docId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем документ
      const [docs] = await db.query(
        'SELECT status FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
        [tenantId, storeId, docId]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'DOC_NOT_FOUND' });
      }
      if (docs[0].status !== 'draft') {
        return res.status(400).json({ ok: false, error: 'ALREADY_POSTED' });
      }

      const productId = helpers.numOrNull(req.body.product_id);
      if (!productId) {
        return res.status(400).json({ ok: false, error: 'PRODUCT_REQUIRED' });
      }

      const [productRows] = await db.query(
        `SELECT id, unit_id, base_unit_id
         FROM prod_products
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, productId]
      );
      if (!productRows.length) {
        return res.status(404).json({ ok: false, error: 'PRODUCT_NOT_FOUND' });
      }
      const product = productRows[0];

      const [existingRows] = await db.query(
        `SELECT id
         FROM prod_stock_document_items
         WHERE tenant_id=? AND document_id=? AND product_id=?
         LIMIT 1`,
        [tenantId, docId, productId]
      );
      if (existingRows.length) {
        return res.status(409).json({ ok: false, error: 'ITEM_ALREADY_EXISTS', id: Number(existingRows[0].id) });
      }

      const qty = helpers.numOrNull(req.body.qty) ?? 0;
      const unitId = helpers.numOrNull(req.body.unit_id)
        ?? toPositiveInt(product?.base_unit_id)
        ?? toPositiveInt(product?.unit_id)
        ?? null;
      const costPrice = helpers.numOrNull(req.body.cost_price);
      const price = helpers.numOrNull(req.body.price);
      const purchasePrice = helpers.numOrNull(req.body.purchase_price);
      const purchaseTotal = helpers.numOrNull(req.body.purchase_total);
      const purchasePriceColumnAvailable = await hasStockPurchasePriceColumn();
      const purchaseTotalColumnAvailable = await hasStockPurchaseTotalColumn();

      let result;
      if (purchasePriceColumnAvailable && purchaseTotalColumnAvailable) {
        [result] = await db.query(
          `INSERT INTO prod_stock_document_items (tenant_id, document_id, product_id, qty, unit_id, cost_price, price, purchase_price, purchase_total)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, docId, productId, qty, unitId, costPrice, price, purchasePrice, purchaseTotal]
        );
      } else if (purchasePriceColumnAvailable) {
        [result] = await db.query(
          `INSERT INTO prod_stock_document_items (tenant_id, document_id, product_id, qty, unit_id, cost_price, price, purchase_price)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, docId, productId, qty, unitId, costPrice, price, purchasePrice]
        );
      } else {
        [result] = await db.query(
          `INSERT INTO prod_stock_document_items (tenant_id, document_id, product_id, qty, unit_id, cost_price, price)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, docId, productId, qty, unitId, costPrice, price]
        );
      }

      res.json({ ok: true, id: result.insertId });
    } catch (e) {
      console.error('stock POST /documents/:id/items error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // PUT /documents/:docId/items/:itemId — обновить позицию
  // =============================================
  router.put('/documents/:docId/items/:itemId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const docId = Number(req.params.docId);
      const itemId = Number(req.params.itemId);

      if (!Number.isFinite(docId) || docId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем что документ draft
      const [docs] = await db.query(
        'SELECT status FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
        [tenantId, storeId, docId]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'DOC_NOT_FOUND' });
      }
      if (docs[0].status !== 'draft') {
        return res.status(400).json({ ok: false, error: 'ALREADY_POSTED' });
      }

      const qty = helpers.numOrNull(req.body.qty) ?? 0;
      const unitId = helpers.numOrNull(req.body.unit_id);
      const costPrice = helpers.numOrNull(req.body.cost_price);
      const price = helpers.numOrNull(req.body.price);
      const purchasePrice = helpers.numOrNull(req.body.purchase_price);
      const purchaseTotal = helpers.numOrNull(req.body.purchase_total);
      const purchasePriceColumnAvailable = await hasStockPurchasePriceColumn();
      const purchaseTotalColumnAvailable = await hasStockPurchaseTotalColumn();

      if (purchasePriceColumnAvailable && purchaseTotalColumnAvailable) {
        await db.query(
          'UPDATE prod_stock_document_items SET qty=?, unit_id=?, cost_price=?, price=?, purchase_price=?, purchase_total=? WHERE id=? AND document_id=?',
          [qty, unitId, costPrice, price, purchasePrice, purchaseTotal, itemId, docId]
        );
      } else if (purchasePriceColumnAvailable) {
        await db.query(
          'UPDATE prod_stock_document_items SET qty=?, unit_id=?, cost_price=?, price=?, purchase_price=? WHERE id=? AND document_id=?',
          [qty, unitId, costPrice, price, purchasePrice, itemId, docId]
        );
      } else {
        await db.query(
          'UPDATE prod_stock_document_items SET qty=?, unit_id=?, cost_price=?, price=? WHERE id=? AND document_id=?',
          [qty, unitId, costPrice, price, itemId, docId]
        );
      }

      res.json({ ok: true });
    } catch (e) {
      console.error('stock PUT items error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // DELETE /documents/:docId/items/:itemId — удалить позицию
  // =============================================
  router.delete('/documents/:docId/items/:itemId', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const docId = Number(req.params.docId);
      const itemId = Number(req.params.itemId);

      if (!Number.isFinite(docId) || docId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Проверяем что документ draft
      const [docs] = await db.query(
        'SELECT status FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1',
        [tenantId, storeId, docId]
      );

      if (!docs.length) {
        return res.status(404).json({ ok: false, error: 'DOC_NOT_FOUND' });
      }
      if (docs[0].status !== 'draft') {
        return res.status(400).json({ ok: false, error: 'ALREADY_POSTED' });
      }

      await db.query(
        'DELETE FROM prod_stock_document_items WHERE id=? AND document_id=?',
        [itemId, docId]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error('stock DELETE items error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // =============================================
  // POST /documents/:id/post — провести документ
  // =============================================
  router.post('/documents/:id/post', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        conn.release();
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      // Получаем документ
      const [docs] = await conn.query(
        'SELECT * FROM prod_stock_documents WHERE tenant_id=? AND store_id=? AND id=? LIMIT 1 FOR UPDATE',
        [tenantId, storeId, id]
      );

      if (!docs.length) {
        await conn.rollback();
        conn.release();
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      if (docs[0].status !== 'draft') {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ ok: false, error: 'ALREADY_POSTED' });
      }

      // Получаем позиции
      const [items] = await conn.query(
        'SELECT * FROM prod_stock_document_items WHERE document_id=?',
        [id]
      );

      if (!items.length) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ ok: false, error: 'NO_ITEMS' });
      }

      const docType = docs[0].type;
      const productIds = [...new Set(items.map((item) => toPositiveInt(item?.product_id)).filter(Boolean))];
      const productsById = await loadProductsByIds(conn, tenantId, productIds);
      const resolveUnitFactor = createUnitFactorResolver(conn, tenantId);

      // Обновляем остатки
      for (const item of items) {
        const productId = toPositiveInt(item?.product_id);
        if (!productId) continue;

        const product = productsById.get(productId) || { id: productId, unit_id: null, base_unit_id: null };
        const qtyForStock = await convertDocumentItemQtyToBase(item, product, resolveUnitFactor);

        if (qtyForStock == null) {
          const fromUnitId = toPositiveInt(item?.unit_id);
          const toUnitId = toPositiveInt(product?.base_unit_id) || toPositiveInt(product?.unit_id) || null;
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            ok: false,
            error: 'UNIT_CONVERSION_NOT_FOUND',
            product_id: productId,
            from_unit_id: fromUnitId,
            to_unit_id: toUnitId,
          });
        }

        if (docType === 'in') {
          // Приход: увеличиваем остаток
          await conn.query(
            `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE qty = COALESCE(qty, 0) + VALUES(qty)`,
            [tenantId, storeId, productId, qtyForStock]
          );
        } else if (docType === 'out') {
          // Списание: уменьшаем остаток
          await conn.query(
            `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
             VALUES (?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE qty = COALESCE(qty, 0) - ?`,
            [tenantId, storeId, productId, qtyForStock]
          );
        } else {
          await conn.rollback();
          conn.release();
          return res.status(400).json({ ok: false, error: 'BAD_DOC_TYPE_FOR_POST' });
        }
      }

      // Помечаем документ как проведённый
      await conn.query(
        'UPDATE prod_stock_documents SET status=?, posted_at=NOW() WHERE id=?',
        ['posted', id]
      );

      await conn.commit();
      conn.release();

      const stockChangedProductIds = Array.from(
        new Set(
          items
            .map((it) => Number(it?.product_id))
            .filter((pid) => Number.isFinite(pid) && pid > 0)
        )
      );
      if (stockChangedProductIds.length) {
        publishStockChanged(tenantId, storeId, {
          source: 'stock.document_post',
          doc_id: id,
          doc_type: docType,
          product_ids: stockChangedProductIds,
        });
      }

      res.json({ ok: true });
    } catch (e) {
      await conn.rollback();
      conn.release();
      console.error('stock POST /documents/:id/post error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
