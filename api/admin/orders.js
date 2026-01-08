const express = require("express");

module.exports = function makeAdminOrdersRouter({ db, helpers }) {
  const router = express.Router();

  // ---------------------------
  // statuses summary (counts)
  // ---------------------------
  // GET /api/admin/orders/statuses
  router.get("/statuses", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const [rows] = await db.query(
        `
        SELECT
          s.id,
          s.code,
          s.title,
          s.subtitle,
          s.icon,
          s.color,
          s.sort,
          COUNT(o.id) AS cnt
        FROM order_statuses s
        LEFT JOIN order_orders o
          ON o.tenant_id = s.tenant_id
          AND o.status_id = s.id
          AND o.is_active = 1
        WHERE s.tenant_id = ? AND s.is_active = 1
        GROUP BY s.id
        ORDER BY s.sort ASC, s.id ASC
        `,
        [tenantId]
      );

      const data = rows.map((r) => ({
        ...r,
        // совместимость с фронтом
        count: Number(r.cnt || 0),
        cnt: Number(r.cnt || 0),
      }));

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // orders list
  // ---------------------------
  // GET /api/admin/orders
  router.get("/", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);

      const statusId = Number(req.query.status_id || 0);
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));

      let where = `o.tenant_id=? AND o.is_active=1`;
      const params = [tenantId];

      if (Number.isFinite(statusId) && statusId > 0) {
        where += ` AND o.status_id=?`;
        params.push(statusId);
      }

      const orderBy = (Number.isFinite(statusId) && statusId > 0)
        ? `o.status_sort DESC, o.created_at DESC, o.id DESC`
        : `o.created_at DESC, o.id DESC`;

      const [rows] = await db.query(
        `
        SELECT
          o.id,
          o.public_id,
          o.created_at,
          o.customer_id,
          o.customer_name,
          o.customer_phone,
          o.promo_code,
          o.address,
          o.comment,
          o.cutlery_qty,
          o.change_from,
          o.total_price,
          o.items,
          o.scheduled_at,
          o.delivery_type_id,
          o.payment_id,
          o.time_option_id,
          o.status_id,

          s.code AS statusCode,
          s.title AS statusTitle,
          s.color AS statusColor,

          p.code AS paymentCode,
          p.title AS paymentTitle,

          -- ПЕРЕИМЕНОВАНО: order_methods -> order_delivery_types
          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle
        FROM order_orders o
        LEFT JOIN order_statuses s
          ON s.tenant_id=o.tenant_id AND s.id=o.status_id
        LEFT JOIN order_payments p
          ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
        LEFT JOIN order_delivery_types m
          ON m.tenant_id=o.tenant_id AND m.id=o.delivery_type_id
        LEFT JOIN order_time_options t
          ON t.tenant_id=o.tenant_id AND t.id=o.time_option_id
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      // parse items JSON
      const data = rows.map((r) => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}

        return {
          ...r,
          items,
          total_price: Number(r.total_price || 0),

          // совместимость с фронтом (snake_case)
          status_code: r.statusCode ?? null,
          status_title: r.statusTitle ?? null,
          status_color: r.statusColor ?? null,

          payment_code: r.paymentCode ?? null,
          payment_title: r.paymentTitle ?? null,

          method_code: r.methodCode ?? null,
          method_title: r.methodTitle ?? null,

          time_option_code: r.timeOptionCode ?? null,
          time_option_title: r.timeOptionTitle ?? null,
        };
      });

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // order details
  // ---------------------------
  // GET /api/admin/orders/:id
  router.get("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      const [rows] = await db.query(
        `
        SELECT
          o.*,
          s.code AS statusCode,
          s.title AS statusTitle,
          s.color AS statusColor,

          p.code AS paymentCode,
          p.title AS paymentTitle,

          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle
        FROM order_orders o
        LEFT JOIN order_statuses s
          ON s.tenant_id=o.tenant_id AND s.id=o.status_id
        LEFT JOIN order_payments p
          ON p.tenant_id=o.tenant_id AND p.id=o.payment_id
        LEFT JOIN order_delivery_types m
          ON m.tenant_id=o.tenant_id AND m.id=o.delivery_type_id
        LEFT JOIN order_time_options t
          ON t.tenant_id=o.tenant_id AND t.id=o.time_option_id
        WHERE o.tenant_id=? AND o.id=? AND o.is_active=1
        LIMIT 1
        `,
        [tenantId, id]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const r = rows[0];
      let items = [];
      try {
        const parsed = r.items ? JSON.parse(r.items) : [];
        if (Array.isArray(parsed)) items = parsed;
      } catch {}

      res.json({
        ok: true,
        data: {
          ...r,
          items,
          total_price: Number(r.total_price || 0),

          // совместимость с фронтом (snake_case)
          status_code: r.statusCode ?? null,
          status_title: r.statusTitle ?? null,
          status_color: r.statusColor ?? null,

          payment_code: r.paymentCode ?? null,
          payment_title: r.paymentTitle ?? null,

          method_code: r.methodCode ?? null,
          method_title: r.methodTitle ?? null,

          time_option_code: r.timeOptionCode ?? null,
          time_option_title: r.timeOptionTitle ?? null,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // change status
  // ---------------------------
  // PUT /api/admin/orders/:id/status
  router.put("/:id/status", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      const statusId = Number(req.body.status_id);

      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!Number.isFinite(statusId) || statusId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      await db.query(
        `UPDATE order_orders
         SET status_id=?
         WHERE tenant_id=? AND id=?`,
        [statusId, tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // reorder внутри статуса
  // ---------------------------
  // PUT /api/admin/orders/reorder
  router.put("/reorder", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const statusId = Number(req.body.status_id);
      const orderedIdsRaw = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];

      if (!Number.isFinite(statusId) || statusId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      // нормализуем ids
      const orderedIds = orderedIdsRaw
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);

      // ограничение на всякий случай
      if (orderedIds.length > 1000) {
        return res.status(400).json({ ok: false, error: "TOO_MANY_IDS" });
      }

      // пустой список — ок
      if (!orderedIds.length) {
        return res.json({ ok: true });
      }

      // убираем дубликаты, сохраняя порядок
      const seen = new Set();
      const uniqIds = [];
      for (const id of orderedIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniqIds.push(id);
      }

      const n = uniqIds.length;

      // CASE WHEN ? THEN ? ...
      const caseSql = uniqIds.map(() => "WHEN ? THEN ?").join(" ");
      const inSql = uniqIds.map(() => "?").join(",");
      const params = [];

      // делаем так, чтобы верхний элемент имел больший status_sort
      uniqIds.forEach((id, idx) => {
        params.push(id, (n - idx) * 10);
      });

      await db.query(
        `
        UPDATE order_orders
        SET status_sort = CASE id ${caseSql} ELSE status_sort END
        WHERE tenant_id=? AND status_id=? AND is_active=1 AND id IN (${inSql})
        `,
        [...params, tenantId, statusId, ...uniqIds]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // deactivate order
  // ---------------------------
  // DELETE /api/admin/orders/:id
  router.delete("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      await db.query(
        `UPDATE order_orders SET is_active=0 WHERE tenant_id=? AND id=?`,
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  return router;
};
