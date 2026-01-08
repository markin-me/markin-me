const express = require('express');

module.exports = function makeAdminClientsRouter({ db, helpers }) {
  const router = express.Router();

  /**
   * GET /api/admin/clients
   * query:
   *  - q: search by phone/name
   *  - is_active: 1/0 (optional)
   *  - limit (default 50, max 200)
   *  - offset (default 0)
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const qRaw = helpers.strOrNull(req.query.q);
      const qPhone = qRaw ? helpers.normalizePhone(qRaw) : '';
      const qText = qRaw ? qRaw.trim() : '';

      const isActive =
        req.query.is_active !== undefined
          ? (helpers.toBool(req.query.is_active, true) ? 1 : 0)
          : null;

      let limit = Number(req.query.limit ?? 50);
      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      const where = ['tenant_id=?'];
      const params = [tenantId];

      if (isActive !== null) {
        where.push('is_active=?');
        params.push(isActive);
      }

      if (qText) {
        where.push('(name LIKE ? OR phone LIKE ?)');
        params.push(`%${qText}%`, `%${qPhone || qText}%`);
      }

      const [rows] = await db.query(
        `SELECT
           id, tenant_id,
           name, phone, birthday,
           photo,
           total_orders, total_spent, last_order_date,
           is_active,
           created_at, updated_at
         FROM cust_customers
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(last_order_date, created_at) DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
      );

      const [cntRows] = await db.query(
        `SELECT COUNT(*) AS c
         FROM cust_customers
         WHERE ${where.join(' AND ')}`,
        params
      );

      res.json({
        ok: true,
        data: rows,
        total: Number(cntRows?.[0]?.c || 0),
        limit,
        offset,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id
   */
  router.get('/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           id, tenant_id,
           name, phone, birthday,
           photo,
           total_orders, total_spent, last_order_date,
           is_active,
           created_at, updated_at
         FROM cust_customers
         WHERE tenant_id=? AND id=?
         LIMIT 1`,
        [tenantId, id]
      );

      if (!rows.length) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      res.json({ ok: true, data: rows[0] });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients
   * body: { name?, phone, birthday? }
   */
  router.post('/', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const phone = helpers.normalizePhone(req.body.phone);
      if (!phone || phone.length < 10) {
        return res.status(400).json({ ok: false, error: 'PHONE_REQUIRED' });
      }

      const name = helpers.strOrNull(req.body.name) || 'Клиент';
      const birthday = helpers.strOrNull(req.body.birthday); // YYYY-MM-DD | null

      const [exists] = await db.query(
        `SELECT id FROM cust_customers WHERE tenant_id=? AND phone=? LIMIT 1`,
        [tenantId, phone]
      );
      if (exists.length) {
        return res.json({ ok: true, id: Number(exists[0].id), existed: true });
      }

      const [r] = await db.query(
        `INSERT INTO cust_customers
          (tenant_id, phone, name, birthday, is_active)
         VALUES (?,?,?,?,1)`,
        [tenantId, phone, name, birthday]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      if (String(e?.code || '').includes('ER_DUP_ENTRY')) {
        return res.status(409).json({ ok: false, error: 'PHONE_EXISTS' });
      }
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/addresses
   */
  router.get('/:id/addresses', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           id, tenant_id, customer_id,
           street, house, entrance, floor, apartment, comment,
           is_default, is_active,
           created_at, updated_at
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1
         ORDER BY is_default DESC, updated_at DESC, id DESC`,
        [tenantId, customerId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients/:id/addresses
   * body: { street, house, entrance?, floor?, apartment?, comment?, is_default? }
   */
  router.post('/:id/addresses', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const street = helpers.strOrNull(req.body.street);
      const house = helpers.strOrNull(req.body.house);
      if (!street) return res.status(400).json({ ok: false, error: 'STREET_REQUIRED' });
      if (!house) return res.status(400).json({ ok: false, error: 'HOUSE_REQUIRED' });

      const entrance = helpers.strOrNull(req.body.entrance);
      const floor = helpers.strOrNull(req.body.floor);
      const apartment = helpers.strOrNull(req.body.apartment);
      const comment = helpers.strOrNull(req.body.comment);

      let isDefault = helpers.toBool(req.body.is_default, false) ? 1 : 0;

      await conn.beginTransaction();

      const [cnt] = await conn.query(
        `SELECT COUNT(*) AS c
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND is_active=1`,
        [tenantId, customerId]
      );
      const hasAny = Number(cnt?.[0]?.c || 0) > 0;
      if (!hasAny) isDefault = 1;

      if (isDefault === 1) {
        await conn.query(
          `UPDATE cust_customer_addresses
           SET is_default=0
           WHERE tenant_id=? AND customer_id=?`,
          [tenantId, customerId]
        );
      }

      const [r] = await conn.query(
        `INSERT INTO cust_customer_addresses
          (tenant_id, customer_id, street, house, entrance, floor, apartment, comment, is_default, is_active)
         VALUES (?,?,?,?,?,?,?,?,?,1)`,
        [tenantId, customerId, street, house, entrance, floor, apartment, comment, isDefault]
      );

      await conn.commit();
      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  /**
   * PUT /api/admin/clients/:id/addresses/:addressId/default
   */
  router.put('/:id/addresses/:addressId/default', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      const addressId = Number(req.params.addressId);

      if (!Number.isFinite(customerId) || customerId <= 0 || !Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [a] = await conn.query(
        `SELECT id
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customerId, addressId]
      );
      if (!a.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=0
         WHERE tenant_id=? AND customer_id=?`,
        [tenantId, customerId]
      );

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_default=1
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customerId, addressId]
      );

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  /**
   * DELETE /api/admin/clients/:id/addresses/:addressId
   * soft delete (is_active=0). If deleted default -> set another default.
   */
  router.delete('/:id/addresses/:addressId', async (req, res) => {
    const conn = await db.getConnection();
    try {
      const tenantId = helpers.getTenantId(req);
      const customerId = Number(req.params.id);
      const addressId = Number(req.params.addressId);

      if (!Number.isFinite(customerId) || customerId <= 0 || !Number.isFinite(addressId) || addressId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await conn.beginTransaction();

      const [cur] = await conn.query(
        `SELECT id, is_default
         FROM cust_customer_addresses
         WHERE tenant_id=? AND customer_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, customerId, addressId]
      );
      if (!cur.length) {
        await conn.rollback();
        return res.status(404).json({ ok: false, error: 'ADDRESS_NOT_FOUND' });
      }

      const wasDefault = Number(cur[0].is_default || 0) === 1;

      await conn.query(
        `UPDATE cust_customer_addresses
         SET is_active=0, is_default=0
         WHERE tenant_id=? AND customer_id=? AND id=?`,
        [tenantId, customerId, addressId]
      );

      if (wasDefault) {
        const [any] = await conn.query(
          `SELECT id
           FROM cust_customer_addresses
           WHERE tenant_id=? AND customer_id=? AND is_active=1
           ORDER BY updated_at DESC, id DESC
           LIMIT 1`,
          [tenantId, customerId]
        );
        if (any.length) {
          await conn.query(
            `UPDATE cust_customer_addresses
             SET is_default=1
             WHERE tenant_id=? AND customer_id=? AND id=?`,
            [tenantId, customerId, Number(any[0].id)]
          );
        }
      }

      await conn.commit();
      res.json({ ok: true });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    } finally {
      conn.release();
    }
  });

  return router;
};
