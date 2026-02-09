const express = require('express');

module.exports = function makeAdminDiscountsRouter({ db, helpers }) {
  const router = express.Router();

  /**
   * GET /api/admin/discounts
   * Получить список всех скидок
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [discounts] = await db.query(
        `SELECT 
          id, title, description, discount_type, discount_value,
          apply_to, min_order_amount, max_discount_amount,
          starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
          usage_limit, usage_per_customer, usage_count,
          priority, is_stackable, is_active, created_at, updated_at
        FROM mkt_discounts
        WHERE tenant_id = ? AND store_id = ? AND is_active = 1
        ORDER BY priority DESC, created_at DESC`,
        [tenantId, storeId]
      );

      return res.json({ ok: true, discounts });
    } catch (err) {
      console.error('GET /api/admin/discounts error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/all
   * Получить все скидки (включая неактивные)
   */
  router.get('/all', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [discounts] = await db.query(
        `SELECT 
          id, title, description, discount_type, discount_value,
          apply_to, min_order_amount, max_discount_amount,
          starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
          usage_limit, usage_per_customer, usage_count,
          priority, is_stackable, is_active, created_at, updated_at
        FROM mkt_discounts
        WHERE tenant_id = ? AND store_id = ?
        ORDER BY priority DESC, created_at DESC`,
        [tenantId, storeId]
      );

      return res.json({ ok: true, discounts });
    } catch (err) {
      console.error('GET /api/admin/discounts/all error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/stats
   * Статистика использования скидок
   */
  router.get('/stats', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;

      const [stats] = await db.query(
        `SELECT 
          d.id, d.title, d.usage_count,
          COALESCE(SUM(u.discount_amount), 0) AS total_discount_amount,
          COUNT(u.id) AS usage_records
        FROM mkt_discounts d
        LEFT JOIN mkt_discount_usage u ON u.discount_id = d.id
        WHERE d.tenant_id = ? AND d.store_id = ?
        GROUP BY d.id
        ORDER BY total_discount_amount DESC`,
        [tenantId, storeId]
      );

      return res.json({ ok: true, stats });
    } catch (err) {
      console.error('GET /api/admin/discounts/stats error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/:id
   * Получить скидку по ID с привязками
   */
  router.get('/:id', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[discount]] = await db.query(
        `SELECT * FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      // Получить привязки к клиентам с названиями
      const [customerRows] = await db.query(
        `SELECT dc.*, 
                c.name AS customer_name, c.phone AS customer_phone,
                cc.title AS category_title
         FROM mkt_discount_customers dc
         LEFT JOIN cust_customers c ON c.id = dc.customer_id
         LEFT JOIN cust_categories cc ON cc.id = dc.customer_category_id
         WHERE dc.discount_id = ? AND dc.tenant_id = ?`,
        [discountId, tenantId]
      );

      // Получить привязки к товарам с названиями
      const [productRows] = await db.query(
        `SELECT dp.*, 
                p.name AS product_title,
                pc.title AS category_title,
                cb.title AS combo_title
         FROM mkt_discount_products dp
         LEFT JOIN prod_products p ON p.id = dp.product_id
         LEFT JOIN prod_categories pc ON pc.id = dp.category_id
         LEFT JOIN prod_combos cb ON cb.id = dp.combo_id
         WHERE dp.discount_id = ? AND dp.tenant_id = ?`,
        [discountId, tenantId]
      );

      // Преобразуем в формат {entity_type, entity_id, title}
      const customers = customerRows.map(row => {
        if (row.customer_id) {
          return { entity_type: 'customer', entity_id: row.customer_id, title: row.customer_name || row.customer_phone || `Клиент #${row.customer_id}` };
        }
        if (row.customer_category_id) {
          return { entity_type: 'category', entity_id: row.customer_category_id, title: row.category_title || `Категория #${row.customer_category_id}` };
        }
        return null;
      }).filter(Boolean);

      const products = productRows.map(row => {
        if (row.product_id) {
          return { entity_type: 'product', entity_id: row.product_id, title: row.product_title || `Товар #${row.product_id}` };
        }
        if (row.category_id) {
          return { entity_type: 'category', entity_id: row.category_id, title: row.category_title || `Категория #${row.category_id}` };
        }
        if (row.combo_id) {
          return { entity_type: 'combo', entity_id: row.combo_id, title: row.combo_title || `Комбо #${row.combo_id}` };
        }
        return null;
      }).filter(Boolean);

      return res.json({
        ok: true,
        discount: {
          ...discount,
          customers,
          products,
        },
      });
    } catch (err) {
      console.error('GET /api/admin/discounts/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * POST /api/admin/discounts
   * Создать новую скидку
   */
  router.post('/', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const {
        title,
        description,
        discount_type,
        discount_value,
        apply_to,
        min_order_amount,
        max_discount_amount,
        starts_at,
        ends_at,
        schedule_days,
        schedule_time_start,
        schedule_time_end,
        usage_limit,
        usage_per_customer,
        priority,
        is_stackable,
        is_active,
        customers,
        products,
      } = req.body;

      if (!title || title.trim() === '') {
        return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      }

      if (!discount_value || discount_value <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_DISCOUNT_VALUE' });
      }

      const [result] = await db.query(
        `INSERT INTO mkt_discounts (
          tenant_id, store_id, title, description, discount_type, discount_value,
          apply_to, min_order_amount, max_discount_amount,
          starts_at, ends_at, schedule_days, schedule_time_start, schedule_time_end,
          usage_limit, usage_per_customer, priority, is_stackable, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          storeId,
          title.trim(),
          description || null,
          discount_type || 'percent',
          discount_value,
          apply_to || 'order',
          min_order_amount || null,
          max_discount_amount || null,
          starts_at || null,
          ends_at || null,
          schedule_days ? JSON.stringify(schedule_days) : null,
          schedule_time_start || null,
          schedule_time_end || null,
          usage_limit || null,
          usage_per_customer || null,
          priority || 0,
          is_stackable ? 1 : 0,
          is_active !== false ? 1 : 0,
        ]
      );

      const discountId = result.insertId;

      // Сохранить привязки к клиентам
      if (customers && Array.isArray(customers) && customers.length > 0) {
        for (const c of customers) {
          // Поддержка нового формата {entity_type, entity_id}
          const targetType = c.entity_type || c.target_type || 'all';
          const customerId = targetType === 'customer' ? (c.entity_id || c.customer_id) : (c.customer_id || null);
          const categoryId = targetType === 'category' ? (c.entity_id || c.customer_category_id) : (c.customer_category_id || null);
          await db.query(
            `INSERT INTO mkt_discount_customers (tenant_id, discount_id, target_type, customer_id, customer_category_id)
             VALUES (?, ?, ?, ?, ?)`,
            [tenantId, discountId, targetType, customerId, categoryId]
          );
        }
      }

      // Сохранить привязки к товарам
      if (products && Array.isArray(products) && products.length > 0) {
        for (const p of products) {
          // Поддержка нового формата {entity_type, entity_id}
          const targetType = p.entity_type || p.target_type || 'all';
          const productId = targetType === 'product' ? (p.entity_id || p.product_id) : (p.product_id || null);
          const categoryId = targetType === 'category' ? (p.entity_id || p.category_id) : (p.category_id || null);
          const comboId = targetType === 'combo' ? (p.entity_id || p.combo_id) : (p.combo_id || null);
          await db.query(
            `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [tenantId, discountId, targetType, productId, categoryId, comboId]
          );
        }
      }

      return res.json({ ok: true, id: discountId });
    } catch (err) {
      console.error('POST /api/admin/discounts error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * PUT /api/admin/discounts/:id
   * Обновить скидку
   */
  router.put('/:id', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const {
        title,
        description,
        discount_type,
        discount_value,
        apply_to,
        min_order_amount,
        max_discount_amount,
        starts_at,
        ends_at,
        schedule_days,
        schedule_time_start,
        schedule_time_end,
        usage_limit,
        usage_per_customer,
        priority,
        is_stackable,
        is_active,
        customers,
        products,
      } = req.body;

      // Проверить существование
      const [[existing]] = await db.query(
        `SELECT id FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!existing) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      await db.query(
        `UPDATE mkt_discounts SET
          title = ?, description = ?, discount_type = ?, discount_value = ?,
          apply_to = ?, min_order_amount = ?, max_discount_amount = ?,
          starts_at = ?, ends_at = ?, schedule_days = ?, schedule_time_start = ?, schedule_time_end = ?,
          usage_limit = ?, usage_per_customer = ?, priority = ?, is_stackable = ?, is_active = ?
        WHERE id = ? AND tenant_id = ?`,
        [
          title?.trim() || existing.title,
          description || null,
          discount_type || 'percent',
          discount_value || 0,
          apply_to || 'order',
          min_order_amount || null,
          max_discount_amount || null,
          starts_at || null,
          ends_at || null,
          schedule_days ? JSON.stringify(schedule_days) : null,
          schedule_time_start || null,
          schedule_time_end || null,
          usage_limit || null,
          usage_per_customer || null,
          priority || 0,
          is_stackable ? 1 : 0,
          is_active !== false ? 1 : 0,
          discountId,
          tenantId,
        ]
      );

      // Обновить привязки к клиентам
      if (customers !== undefined) {
        await db.query(`DELETE FROM mkt_discount_customers WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
        if (Array.isArray(customers) && customers.length > 0) {
          for (const c of customers) {
            // Поддержка нового формата {entity_type, entity_id}
            const targetType = c.entity_type || c.target_type || 'all';
            const customerId = targetType === 'customer' ? (c.entity_id || c.customer_id) : (c.customer_id || null);
            const categoryId = targetType === 'category' ? (c.entity_id || c.customer_category_id) : (c.customer_category_id || null);
            await db.query(
              `INSERT INTO mkt_discount_customers (tenant_id, discount_id, target_type, customer_id, customer_category_id)
               VALUES (?, ?, ?, ?, ?)`,
              [tenantId, discountId, targetType, customerId, categoryId]
            );
          }
        }
      }

      // Обновить привязки к товарам
      if (products !== undefined) {
        await db.query(`DELETE FROM mkt_discount_products WHERE discount_id = ? AND tenant_id = ?`, [discountId, tenantId]);
        if (Array.isArray(products) && products.length > 0) {
          for (const p of products) {
            // Поддержка нового формата {entity_type, entity_id}
            const targetType = p.entity_type || p.target_type || 'all';
            const productId = targetType === 'product' ? (p.entity_id || p.product_id) : (p.product_id || null);
            const categoryId = targetType === 'category' ? (p.entity_id || p.category_id) : (p.category_id || null);
            const comboId = targetType === 'combo' ? (p.entity_id || p.combo_id) : (p.combo_id || null);
            await db.query(
              `INSERT INTO mkt_discount_products (tenant_id, discount_id, target_type, product_id, category_id, combo_id)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [tenantId, discountId, targetType, productId, categoryId, comboId]
            );
          }
        }
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('PUT /api/admin/discounts/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/discounts/:id
   * Удалить скидку
   */
  router.delete('/:id', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [result] = await db.query(
        `DELETE FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error('DELETE /api/admin/discounts/:id error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * POST /api/admin/discounts/:id/toggle
   * Переключить активность скидки
   */
  router.post('/:id/toggle', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      const [[discount]] = await db.query(
        `SELECT is_active FROM mkt_discounts WHERE id = ? AND tenant_id = ? AND store_id = ?`,
        [discountId, tenantId, storeId]
      );

      if (!discount) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const newStatus = discount.is_active ? 0 : 1;

      await db.query(
        `UPDATE mkt_discounts SET is_active = ? WHERE id = ? AND tenant_id = ?`,
        [newStatus, discountId, tenantId]
      );

      return res.json({ ok: true, is_active: newStatus === 1 });
    } catch (err) {
      console.error('POST /api/admin/discounts/:id/toggle error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  /**
   * GET /api/admin/discounts/:id/orders
   * Получить заказы, в которых использовалась скидка
   */
  router.get('/:id/orders', async (req, res) => {
    try {
      const tenantId = req.tenantId || 1;
      const storeId = req.storeId || 1;
      const discountId = parseInt(req.params.id, 10);

      if (!discountId || discountId <= 0) {
        return res.status(400).json({ ok: false, error: 'INVALID_ID' });
      }

      // Получаем заказы из истории использования скидки
      const [orders] = await db.query(
        `SELECT 
          u.id AS usage_id,
          u.order_id,
          u.customer_id,
          u.discount_amount,
          u.used_at,
          o.public_id,
          o.customer_name,
          o.customer_phone,
          o.total_price,
          o.created_at AS order_created_at,
          o.status_id
        FROM mkt_discount_usage u
        LEFT JOIN order_orders o ON o.id = u.order_id
        WHERE u.discount_id = ? AND u.tenant_id = ?
        ORDER BY u.used_at DESC
        LIMIT 100`,
        [discountId, tenantId]
      );

      return res.json({ ok: true, orders });
    } catch (err) {
      console.error('GET /api/admin/discounts/:id/orders error:', err);
      return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  return router;
};
