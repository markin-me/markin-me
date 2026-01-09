const express = require('express');

module.exports = function makeAdminOptionsRouter({ db, helpers }) {
  const router = express.Router();

  function toInt(v, fallback = null) {
    const n = Number(v);
    if (!Number.isFinite(n)) return fallback;
    return n;
  }

  // ------------------------------
  // Option groups
  // ------------------------------
  router.get('/option-groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const [rows] = await db.query(
        `SELECT * FROM prod_option_groups WHERE tenant_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/option-groups', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const selectionType = helpers.strOrNull(req.body.selection_type) || 'single';
      const minSelect = helpers.numOrNull(req.body.min_select) ?? 0;
      const maxSelect = helpers.numOrNull(req.body.max_select) ?? 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const [r] = await db.query(
        `INSERT INTO prod_option_groups (tenant_id, title, selection_type, min_select, max_select, sort_order, is_active)
         VALUES (?,?,?,?,?,?,?)`,
        [tenantId, title, selectionType, minSelect, maxSelect, sortOrder, isActive]
      );
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/option-groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const selectionType = helpers.strOrNull(req.body.selection_type) || 'single';
      const minSelect = helpers.numOrNull(req.body.min_select) ?? 0;
      const maxSelect = helpers.numOrNull(req.body.max_select) ?? 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      await db.query(
        `UPDATE prod_option_groups
         SET title=?, selection_type=?, min_select=?, max_select=?, sort_order=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [title, selectionType, minSelect, maxSelect, sortOrder, isActive, tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/option-groups/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `UPDATE prod_option_groups SET is_active=0 WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Option items
  // ------------------------------
  router.get('/option-groups/:id/items', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = toInt(req.params.id);
      if (!groupId) return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });

      const [rows] = await db.query(
        `SELECT * FROM prod_option_items WHERE tenant_id=? AND group_id=? ORDER BY sort_order ASC, id ASC`,
        [tenantId, groupId]
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/option-groups/:id/items', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const groupId = toInt(req.params.id);
      if (!groupId) return res.status(400).json({ ok: false, error: 'BAD_GROUP_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const priceMode = helpers.strOrNull(req.body.price_mode) || 'fixed';
      const price = helpers.numOrNull(req.body.price) ?? 0;
      const targetType = helpers.strOrNull(req.body.target_type) || 'custom';
      const targetId = helpers.numOrNull(req.body.target_id);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const [r] = await db.query(
        `INSERT INTO prod_option_items
         (tenant_id, group_id, title, price_mode, price, target_type, target_id, sort_order, is_active)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [tenantId, groupId, title, priceMode, price, targetType, targetId, sortOrder, isActive]
      );
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/option-items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const priceMode = helpers.strOrNull(req.body.price_mode) || 'fixed';
      const price = helpers.numOrNull(req.body.price) ?? 0;
      const targetType = helpers.strOrNull(req.body.target_type) || 'custom';
      const targetId = helpers.numOrNull(req.body.target_id);
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      await db.query(
        `UPDATE prod_option_items
         SET title=?, price_mode=?, price=?, target_type=?, target_id=?, sort_order=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [title, priceMode, price, targetType, targetId, sortOrder, isActive, tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/option-items/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `UPDATE prod_option_items SET is_active=0 WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Assignments
  // ------------------------------
  router.get('/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const assignType = helpers.strOrNull(req.query.assign_type);
      const assignId = helpers.numOrNull(req.query.assign_id);

      let where = 'tenant_id=?';
      const params = [tenantId];

      if (assignType) {
        where += ' AND assign_type=?';
        params.push(assignType);
      }
      if (assignId) {
        where += ' AND assign_id=?';
        params.push(assignId);
      }

      const [rows] = await db.query(
        `SELECT * FROM prod_option_assignments WHERE ${where} ORDER BY priority DESC, sort_order ASC, id ASC`,
        params
      );
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/option-assignments', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const assignType = helpers.strOrNull(req.body.assign_type);
      const assignId = helpers.numOrNull(req.body.assign_id);
      const groupId = helpers.numOrNull(req.body.group_id);
      if (!assignType || !assignId || !groupId) return res.status(400).json({ ok: false, error: 'BAD_ASSIGNMENT' });

      const priority = helpers.numOrNull(req.body.priority) ?? 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      const [r] = await db.query(
        `INSERT INTO prod_option_assignments
         (tenant_id, assign_type, assign_id, group_id, priority, sort_order, is_active)
         VALUES (?,?,?,?,?,?,?)`,
        [tenantId, assignType, assignId, groupId, priority, sortOrder, isActive]
      );
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/option-assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const assignType = helpers.strOrNull(req.body.assign_type);
      const assignId = helpers.numOrNull(req.body.assign_id);
      const groupId = helpers.numOrNull(req.body.group_id);
      if (!assignType || !assignId || !groupId) return res.status(400).json({ ok: false, error: 'BAD_ASSIGNMENT' });

      const priority = helpers.numOrNull(req.body.priority) ?? 0;
      const sortOrder = helpers.numOrNull(req.body.sort_order) ?? 0;
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;

      await db.query(
        `UPDATE prod_option_assignments
         SET assign_type=?, assign_id=?, group_id=?, priority=?, sort_order=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [assignType, assignId, groupId, priority, sortOrder, isActive, tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/option-assignments/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_assignments WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Exclusions
  // ------------------------------
  router.get('/option-exclusions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = helpers.numOrNull(req.query.product_id);
      let sql = `SELECT * FROM prod_option_exclusions WHERE tenant_id=?`;
      const params = [tenantId];
      if (productId) {
        sql += ' AND product_id=?';
        params.push(productId);
      }
      const [rows] = await db.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/option-exclusions', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = helpers.numOrNull(req.body.product_id);
      const groupId = helpers.numOrNull(req.body.group_id);
      if (!productId || !groupId) return res.status(400).json({ ok: false, error: 'BAD_EXCLUSION' });

      const [r] = await db.query(
        `INSERT INTO prod_option_exclusions (tenant_id, product_id, group_id)
         VALUES (?,?,?)`,
        [tenantId, productId, groupId]
      );
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/option-exclusions/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_exclusions WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Overrides
  // ------------------------------
  router.get('/option-overrides', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = helpers.numOrNull(req.query.product_id);
      let sql = `SELECT * FROM prod_option_overrides WHERE tenant_id=?`;
      const params = [tenantId];
      if (productId) {
        sql += ' AND product_id=?';
        params.push(productId);
      }
      const [rows] = await db.query(sql, params);
      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/option-overrides', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const productId = helpers.numOrNull(req.body.product_id);
      const groupId = helpers.numOrNull(req.body.group_id);
      if (!productId || !groupId) return res.status(400).json({ ok: false, error: 'BAD_OVERRIDE' });

      const selectionType = helpers.strOrNull(req.body.selection_type);
      const minSelect = helpers.numOrNull(req.body.min_select);
      const maxSelect = helpers.numOrNull(req.body.max_select);
      const sortOrder = helpers.numOrNull(req.body.sort_order);

      const [r] = await db.query(
        `INSERT INTO prod_option_overrides
         (tenant_id, product_id, group_id, selection_type, min_select, max_select, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [tenantId, productId, groupId, selectionType, minSelect, maxSelect, sortOrder]
      );
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/option-overrides/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      const selectionType = helpers.strOrNull(req.body.selection_type);
      const minSelect = helpers.numOrNull(req.body.min_select);
      const maxSelect = helpers.numOrNull(req.body.max_select);
      const sortOrder = helpers.numOrNull(req.body.sort_order);

      await db.query(
        `UPDATE prod_option_overrides
         SET selection_type=?, min_select=?, max_select=?, sort_order=?
         WHERE tenant_id=? AND id=?`,
        [selectionType, minSelect, maxSelect, sortOrder, tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/option-overrides/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ ok: false, error: 'BAD_ID' });

      await db.query(
        `DELETE FROM prod_option_overrides WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );
      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
