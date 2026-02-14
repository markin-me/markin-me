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

      const [rows] = await db.query(
        `SELECT d.*,
                u.name AS created_by_name,
                (SELECT COUNT(*) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS items_count,
                (SELECT COALESCE(SUM(i.qty * COALESCE(i.cost_price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_cost_sum,
                (SELECT COALESCE(SUM(i.qty * COALESCE(i.price, 0)), 0) FROM prod_stock_document_items i WHERE i.document_id = d.id) AS total_sale_sum,
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

      const qty = helpers.numOrNull(req.body.qty) ?? 0;
      const unitId = helpers.numOrNull(req.body.unit_id);
      const costPrice = helpers.numOrNull(req.body.cost_price);
      const price = helpers.numOrNull(req.body.price);

      const [result] = await db.query(
        `INSERT INTO prod_stock_document_items (tenant_id, document_id, product_id, qty, unit_id, cost_price, price)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, docId, productId, qty, unitId, costPrice, price]
      );

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

      await db.query(
        'UPDATE prod_stock_document_items SET qty=?, unit_id=?, cost_price=?, price=? WHERE id=? AND document_id=?',
        [qty, unitId, costPrice, price, itemId, docId]
      );

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

      // Обновляем остатки
      for (const item of items) {
        if (docType === 'in') {
          // Приход: увеличиваем остаток
          await conn.query(
            `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE qty = COALESCE(qty, 0) + VALUES(qty)`,
            [tenantId, storeId, item.product_id, item.qty]
          );
        } else if (docType === 'out') {
          // Списание: уменьшаем остаток
          await conn.query(
            `INSERT INTO prod_product_stocks (tenant_id, store_id, product_id, qty)
             VALUES (?, ?, ?, 0)
             ON DUPLICATE KEY UPDATE qty = COALESCE(qty, 0) - ?`,
            [tenantId, storeId, item.product_id, item.qty]
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
