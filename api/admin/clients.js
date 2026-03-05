const express = require('express');

module.exports = function makeAdminClientsRouter({ db, helpers }) {
  const router = express.Router();

  /**
   * Вспомогательная функция для построения WHERE clause из условий фильтра
   */
  function buildFilterWhereClause(conditions, tenantId) {
    if (!conditions || !conditions.rules || !conditions.rules.length) {
      return { whereClause: '', params: [] };
    }

    const logic = conditions.logic === 'OR' ? ' OR ' : ' AND ';
    const clauses = [];
    const params = [];

    for (const rule of conditions.rules) {
      const { field, operator, value } = rule;
      
      // Поддерживаемые поля
      const allowedFields = ['total_orders', 'total_spent', 'last_order_date', 'registration_date', 'is_active', 'created_at'];
      if (!allowedFields.includes(field)) continue;

      // Обработка относительных дат (например -30d, -7d)
      let actualValue = value;
      if (typeof value === 'string' && value.match(/^-\d+d$/)) {
        const days = parseInt(value.slice(1, -1), 10);
        actualValue = `DATE_SUB(CURDATE(), INTERVAL ${days} DAY)`;
        
        switch (operator) {
          case '>=':
            clauses.push(`${field} >= ${actualValue}`);
            break;
          case '<=':
            clauses.push(`${field} <= ${actualValue}`);
            break;
          case '>':
            clauses.push(`${field} > ${actualValue}`);
            break;
          case '<':
            clauses.push(`${field} < ${actualValue}`);
            break;
          default:
            break;
        }
      } else {
        // Обычные значения
        switch (operator) {
          case '=':
            clauses.push(`${field} = ?`);
            params.push(actualValue);
            break;
          case '!=':
            clauses.push(`${field} != ?`);
            params.push(actualValue);
            break;
          case '>=':
            clauses.push(`${field} >= ?`);
            params.push(actualValue);
            break;
          case '<=':
            clauses.push(`${field} <= ?`);
            params.push(actualValue);
            break;
          case '>':
            clauses.push(`${field} > ?`);
            params.push(actualValue);
            break;
          case '<':
            clauses.push(`${field} < ?`);
            params.push(actualValue);
            break;
          default:
            break;
        }
      }
    }

    if (!clauses.length) {
      return { whereClause: '', params: [] };
    }

    return {
      whereClause: ` AND (${clauses.join(logic)})`,
      params
    };
  }

  /**
   * GET /api/admin/clients
   * query:
   *  - q: search by phone/name
   *  - is_active: 1/0 (optional)
   *  - filter_id: ID кастомного фильтра (optional)
   *  - limit (default 50, max 200)
   *  - offset (default 0)
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const qRaw = helpers.strOrNull(req.query.q);
      const qPhone = qRaw ? helpers.normalizePhone(qRaw) : '';
      const qText = qRaw ? qRaw.trim() : '';

      const isActive =
        req.query.is_active !== undefined
          ? (helpers.toBool(req.query.is_active, true) ? 1 : 0)
          : null;

      const filterId = req.query.filter_id ? Number(req.query.filter_id) : null;
      const sortRaw = helpers.strOrNull(req.query.sort) || 'last_desc';

      let limit = Number(req.query.limit ?? 50);
      let offset = Number(req.query.offset ?? 0);
      if (!Number.isFinite(limit) || limit <= 0) limit = 50;
      if (limit > 200) limit = 200;
      if (!Number.isFinite(offset) || offset < 0) offset = 0;

      const orderByMap = {
        last_desc: 'COALESCE(last_order_date, created_at) DESC, id DESC',
        name_asc: "CASE WHEN name IS NULL OR name='' THEN 1 ELSE 0 END ASC, name ASC, id DESC",
        orders_desc: 'total_orders DESC, id DESC',
        created_desc: 'created_at DESC, id DESC',
      };
      const orderBy = orderByMap[sortRaw] || orderByMap.last_desc;

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

      // Применяем кастомный фильтр если указан
      let customFilterClause = '';
      let customFilterParams = [];
      if (filterId && Number.isFinite(filterId) && filterId > 0) {
        const [filterRows] = await db.query(
          `SELECT conditions FROM cust_categories WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1 LIMIT 1`,
          [tenantId, storeId, filterId]
        );
        if (filterRows.length) {
          const conditions = typeof filterRows[0].conditions === 'string'
            ? JSON.parse(filterRows[0].conditions)
            : filterRows[0].conditions;
          const result = buildFilterWhereClause(conditions, tenantId);
          customFilterClause = result.whereClause;
          customFilterParams = result.params;
        }
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
         WHERE ${where.join(' AND ')}${customFilterClause}
         ORDER BY ${orderBy}
         LIMIT ? OFFSET ?`,
        [...params, ...customFilterParams, limit, offset]
      );

      const [cntRows] = await db.query(
        `SELECT COUNT(*) AS c
         FROM cust_customers
         WHERE ${where.join(' AND ')}${customFilterClause}`,
        [...params, ...customFilterParams]
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
   * GET /api/admin/clients/:id/orders/header-candidate
   * Priority:
   *   1) latest active (non-final)
   *   2) latest completed (final, non-cancelled)
   *   3) latest cancelled
   */
  router.get('/:id/orders/header-candidate', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           o.id, o.public_id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           o.total_price, o.items, o.status_id,
           s.code AS status_code,
           s.title AS status_title,
           s.color AS status_color,
           COALESCE(s.is_final, 0) AS status_is_final
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
         ORDER BY
           CASE
             WHEN COALESCE(s.is_final, 0)=0 THEN 0
             WHEN (
               LOWER(COALESCE(s.code, '')) IN ('canceled', 'cancelled')
               OR LOWER(COALESCE(s.title, '')) LIKE 'отмен%%'
               OR LOWER(COALESCE(s.title, '')) LIKE 'cancel%%'
             ) THEN 2
             ELSE 1
           END ASC,
           o.created_at DESC,
           o.id DESC
         LIMIT 1`,
        [tenantId, storeId, customerId]
      );

      const row = rows[0] || null;
      res.json({ ok: true, data: row || null });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/orders
   */
  router.get('/:id/orders', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const customerId = Number(req.params.id);
      if (!Number.isFinite(customerId) || customerId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const [rows] = await db.query(
        `SELECT
           o.id, o.public_id,
           DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
           o.total_price, o.items, o.status_id,
           s.title AS status_title, s.color AS status_color
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.customer_id=? AND o.is_active=1
         ORDER BY o.created_at DESC, o.id DESC
         LIMIT 50`,
        [tenantId, storeId, customerId]
      );

      res.json({ ok: true, data: rows });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
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

  // ============================================
  // MARKETING FILTERS
  // ============================================

  /**
   * GET /api/admin/clients/filters
   * Получить все кастомные фильтры
   */
  router.get('/filters/list', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, title, icon, color, conditions, sort_order, is_active, created_at, updated_at
         FROM cust_categories
         WHERE tenant_id=? AND store_id=? AND is_active=1
         ORDER BY sort_order ASC, id ASC`,
        [tenantId, storeId]
      );

      // Подсчитываем количество клиентов для каждого фильтра
      const filtersWithCounts = await Promise.all(rows.map(async (filter) => {
        let conditions;
        try {
          conditions = typeof filter.conditions === 'string' 
            ? JSON.parse(filter.conditions) 
            : (filter.conditions || { logic: 'AND', rules: [] });
        } catch (e) {
          conditions = { logic: 'AND', rules: [] };
        }
        
        const { whereClause, params } = buildFilterWhereClause(conditions, tenantId);
        
        const [countRows] = await db.query(
          `SELECT COUNT(*) AS c FROM cust_customers WHERE tenant_id=? AND store_id=? ${whereClause}`,
          [tenantId, storeId, ...params]
        );
        
        return {
          ...filter,
          conditions,
          count: Number(countRows?.[0]?.c || 0)
        };
      }));

      res.json({ ok: true, data: filtersWithCounts });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/clients/filters
   * Создать новый фильтр
   * body: { title, icon?, color?, conditions }
   */
  router.post('/filters', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const title = helpers.strOrNull(req.body.title);
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });

      const icon = helpers.strOrNull(req.body.icon) || 'fa-filter';
      const color = helpers.strOrNull(req.body.color);
      const conditions = req.body.conditions || { logic: 'AND', rules: [] };

      // Получаем следующий sort_order
      const [maxSort] = await db.query(
        `SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_sort
         FROM cust_categories
         WHERE tenant_id=? AND store_id=?`,
        [tenantId, storeId]
      );
      const sortOrder = Number(maxSort?.[0]?.next_sort || 1);

      const [r] = await db.query(
        `INSERT INTO cust_categories
          (tenant_id, store_id, title, icon, color, conditions, sort_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [tenantId, storeId, title, icon, color, JSON.stringify(conditions), sortOrder]
      );

      res.json({ ok: true, id: r.insertId });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/clients/filters/:id
   * Обновить фильтр
   */
  router.put('/filters/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      const updates = [];
      const params = [];

      if (req.body.title !== undefined) {
        updates.push('title=?');
        params.push(helpers.strOrNull(req.body.title) || 'Фильтр');
      }
      if (req.body.icon !== undefined) {
        updates.push('icon=?');
        params.push(helpers.strOrNull(req.body.icon) || 'fa-filter');
      }
      if (req.body.color !== undefined) {
        updates.push('color=?');
        params.push(helpers.strOrNull(req.body.color));
      }
      if (req.body.conditions !== undefined) {
        updates.push('conditions=?');
        params.push(JSON.stringify(req.body.conditions));
      }
      if (req.body.sort_order !== undefined) {
        updates.push('sort_order=?');
        params.push(Number(req.body.sort_order) || 0);
      }

      if (!updates.length) {
        return res.status(400).json({ ok: false, error: 'NO_CHANGES' });
      }

      params.push(tenantId, storeId, id);

      await db.query(
        `UPDATE cust_categories
         SET ${updates.join(', ')}
         WHERE tenant_id=? AND store_id=? AND id=?`,
        params
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/clients/filters/:id
   * Удалить фильтр (soft delete)
   */
  router.delete('/filters/:id', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      await db.query(
        `UPDATE cust_categories
         SET is_active=0
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [tenantId, storeId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/clients/:id/discounts
   * Получить скидки, привязанные к клиенту (напрямую или через категории)
   */
  router.get('/:id/discounts', async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const clientId = Number(req.params.id);

      if (!Number.isFinite(clientId) || clientId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_ID' });
      }

      // Получаем категории клиента
      const [customerCategories] = await db.query(
        `SELECT cc.id
         FROM cust_categories cc
         WHERE cc.tenant_id = ? AND cc.store_id = ? AND cc.is_active = 1`,
        [tenantId, storeId]
      );

      // Для каждой категории проверяем попадает ли клиент в неё
      // Это упрощённая версия - в реальности нужно проверять условия фильтра
      // Пока берём все скидки привязанные напрямую к клиенту

      // Скидки привязанные напрямую к клиенту
      const [directDiscounts] = await db.query(
        `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value, 
                d.apply_to, d.is_active, d.starts_at, d.ends_at,
                'direct' AS link_type
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         WHERE d.tenant_id = ? AND d.store_id = ? AND dc.customer_id = ?`,
        [tenantId, storeId, clientId]
      );

      // Скидки по категориям клиента (все категории где target_type='all' или есть customer_category_id)
      const [categoryDiscounts] = await db.query(
        `SELECT DISTINCT d.id, d.title, d.discount_type, d.discount_value,
                d.apply_to, d.is_active, d.starts_at, d.ends_at,
                'category' AS link_type, cc.title AS category_title
         FROM mkt_discounts d
         JOIN mkt_discount_customers dc ON dc.discount_id = d.id AND dc.tenant_id = d.tenant_id
         JOIN cust_categories cc ON cc.id = dc.customer_category_id AND cc.tenant_id = dc.tenant_id
         WHERE d.tenant_id = ? AND d.store_id = ? AND dc.customer_category_id IS NOT NULL`,
        [tenantId, storeId]
      );

      // Объединяем и убираем дубликаты
      const allDiscounts = [...directDiscounts];
      const existingIds = new Set(directDiscounts.map(d => d.id));
      
      for (const discount of categoryDiscounts) {
        if (!existingIds.has(discount.id)) {
          allDiscounts.push(discount);
          existingIds.add(discount.id);
        }
      }

      res.json({ ok: true, data: allDiscounts });
    } catch (e) {
      console.error('GET /api/admin/clients/:id/discounts error:', e);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
