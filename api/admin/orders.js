
const express = require("express");
const { sendOrderToPrintBot } = require("../printPush");

module.exports = function makeAdminOrdersRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();

  function parseDateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)) return null;
    return s;
  }

  function normalizeDateRange(startRaw, endRaw) {
    const start = parseDateParam(startRaw);
    const end = parseDateParam(endRaw);
    if (!start && !end) return null;
    if (start && !end) return { start, end: start };
    if (!start && end) return { start: end, end };
    return start <= end ? { start, end } : { start: end, end: start };
  }

  async function getStoreTimezone(tenantId, storeId) {
    let storeTimezone = '+0';
    if (storeId) {
      const [rows] = await db.query(
        'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (rows[0]?.timezone) {
        storeTimezone = rows[0].timezone;
      }
    }
    if (!storeTimezone || storeTimezone === '+0') {
      const [tenantRows] = await db.query(
        'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (tenantRows[0]?.timezone) {
        storeTimezone = tenantRows[0].timezone;
      }
    }
    return storeTimezone || '+0';
  }

  async function fetchOrderPayload(tenantId, storeId, id, opts = {}) {
    const storeTimezone = opts.storeTimezone ?? await getStoreTimezone(tenantId, storeId);
    const [rows] = await db.query(
      `
      SELECT
        o.id,
        o.public_id,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        o.customer_id,
        o.customer_name,
        o.customer_phone,
        o.address,
        o.comment,
        o.address_comment,
        o.cutlery_qty,
        o.change_from,
        o.total_price,
        o.delivery_cost,
        o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id,
        o.payment_id,
        o.time_option_id,
        o.status_id,
        o.pickup_store_id,

        s.code AS statusCode,
        s.title AS statusTitle,

        p.code AS paymentCode,
        p.title AS paymentTitle,

        m.code AS methodCode,
        m.title AS methodTitle,

        t.code AS timeOptionCode,
        t.title AS timeOptionTitle,

        c.telegram_user_id AS customerTelegramId,

        ps.name AS pickupStoreName,
        ps.address AS pickupStoreAddress,

        ca.comment AS address_comment_from_cust
      FROM order_orders o
      LEFT JOIN order_statuses s
        ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p
        ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m
        ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t
        ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
      LEFT JOIN cust_customers c
        ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
      LEFT JOIN ten_stores ps
        ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
      LEFT JOIN cust_customer_addresses ca
        ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
      WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
      LIMIT 1
      `,
      [tenantId, storeId, id]
    );

    if (!rows.length) return null;
    const r = rows[0];

    let items = [];
    try {
      const parsed = r.items ? JSON.parse(r.items) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch {}
    const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
    const totalPrice = Number(r.total_price || 0);
    let deliveryCost = 0;
    if ((r.methodCode ?? null) === 'delivery') {
      const diff = totalPrice - itemsTotal;
      const computed = diff > 0 ? diff : 0;
      const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
      deliveryCost = stored && stored > 0 ? stored : computed;
    }

    return {
      id: r.id,
      public_id: r.public_id || null,
      created_at: helpers.utcToStoreDateTime(r.created_at, storeTimezone),
      customer_id: r.customer_id,
      customer_name: r.customer_name,
      customer_phone: r.customer_phone,
      address: r.address,
      comment: r.comment,
      address_comment: (r.address_comment && String(r.address_comment).trim()) ? r.address_comment : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim()) ? r.address_comment_from_cust : null,
      cutlery_qty: r.cutlery_qty,
      change_from: r.change_from,
      total_price: totalPrice,
      items_total: itemsTotal,
      delivery_cost: deliveryCost,
      items,
      scheduled_at: r.scheduled_at,
      delivery_type_id: r.delivery_type_id,
      payment_id: r.payment_id,
      time_option_id: r.time_option_id,
      status_id: r.status_id,

      status_code: r.statusCode ?? null,
      status_title: r.statusTitle ?? null,

      payment_code: r.paymentCode ?? null,
      payment_title: r.paymentTitle ?? null,

      method_code: r.methodCode ?? null,
      method_title: r.methodTitle ?? null,

      time_option_code: r.timeOptionCode ?? null,
      time_option_title: r.timeOptionTitle ?? null,

      telegram_user_id: r.customerTelegramId ?? null,

      pickup_store_id: r.pickup_store_id ?? null,
      pickup_store_name: r.pickupStoreName ?? null,
      pickup_store_address: r.pickupStoreAddress ?? null,
    };
  }

  // ---------------------------
  // statuses summary (counts)
  // ---------------------------
  // GET /api/admin/orders/statuses
  router.get("/statuses", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const storeOffsetMinutes = helpers.parseTimezoneOffsetToMinutes(storeTimezone);

      // Use scheduled_at if available, otherwise fall back to created_at
      const joinDate = range
        ? "AND DATE(COALESCE(o.scheduled_at, TIMESTAMPADD(MINUTE, ?, o.created_at))) BETWEEN ? AND ?"
        : "";

      const params = [];
      if (range) params.push(storeOffsetMinutes, range.start, range.end);
      params.push(tenantId, storeId);

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
          AND o.store_id = s.store_id
          AND o.status_id = s.id
          AND o.is_active = 1
          ${joinDate}
        WHERE s.tenant_id = ? AND s.store_id = ? AND s.is_active = 1
        GROUP BY s.id
        ORDER BY s.sort ASC, s.id ASC
        `,
        params
      );

      const data = rows.map((r) => ({
        ...r,
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
      const storeId = helpers.getStoreId(req);

      const statusId = Number(req.query.status_id || 0);
      const limit = Math.min(200, Math.max(10, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const storeOffsetMinutes = helpers.parseTimezoneOffsetToMinutes(storeTimezone);

      let where = `o.tenant_id=? AND o.store_id=? AND o.is_active=1`;
      const params = [tenantId, storeId];

      if (Number.isFinite(statusId) && statusId > 0) {
        where += ` AND o.status_id=?`;
        params.push(statusId);
      }

      if (range) {
        // Use scheduled_at if available, otherwise fall back to created_at
        where += ` AND DATE(COALESCE(o.scheduled_at, TIMESTAMPADD(MINUTE, ?, o.created_at))) BETWEEN ? AND ?`;
        params.push(storeOffsetMinutes, range.start, range.end);
      }

      const orderBy = (Number.isFinite(statusId) && statusId > 0)
        ? `o.status_sort DESC, o.created_at DESC, o.id DESC`
        : `o.created_at DESC, o.id DESC`;

      const [rows] = await db.query(
        `
        SELECT
          o.id,
          o.public_id,
          DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          o.customer_id,
          o.customer_name,
          o.customer_phone,
          o.promo_code,
          o.address,
          o.comment,
          o.address_comment,
          o.cutlery_qty,
          o.change_from,
          o.total_price,
          o.delivery_cost,
          o.items,
          DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
          o.delivery_type_id,
          o.payment_id,
          o.time_option_id,
          o.status_id,

          s.code AS statusCode,
          s.title AS statusTitle,
          s.color AS statusColor,

          p.code AS paymentCode,
          p.title AS paymentTitle,

          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle,

          c.telegram_user_id AS customerTelegramId,

          o.pickup_store_id,
          ps.name AS pickupStoreName,
          ps.address AS pickupStoreAddress,

          ca.comment AS address_comment_from_cust
        FROM order_orders o
        LEFT JOIN order_statuses s
          ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
        LEFT JOIN order_payments p
          ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
        LEFT JOIN order_delivery_types m
          ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
        LEFT JOIN order_time_options t
          ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
        LEFT JOIN cust_customers c
          ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
        LEFT JOIN ten_stores ps
          ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
        LEFT JOIN cust_customer_addresses ca
          ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ? OFFSET ?
        `,
        [...params, limit, offset]
      );

      const data = rows.map((r) => {
        let items = [];
        try {
          const parsed = r.items ? JSON.parse(r.items) : [];
          if (Array.isArray(parsed)) items = parsed;
        } catch {}
        const itemsTotal = items.reduce((sum, item) => sum + Number(item.line_total || 0), 0);
        const totalPrice = Number(r.total_price || 0);
        let deliveryCost = 0;
        if ((r.methodCode ?? null) === 'delivery') {
          const diff = totalPrice - itemsTotal;
          const computed = diff > 0 ? diff : 0;
          const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
          deliveryCost = stored && stored > 0 ? stored : computed;
        }

        const effectiveAddressComment = (r.address_comment && String(r.address_comment).trim())
          ? r.address_comment
          : (r.address_comment_from_cust && String(r.address_comment_from_cust).trim())
            ? r.address_comment_from_cust
            : null;

        return {
          ...r,
          address_comment: effectiveAddressComment,
          created_at: helpers.utcToStoreDateTime(r.created_at, storeTimezone),
          items,
          total_price: totalPrice,
          items_total: itemsTotal,
          delivery_cost: deliveryCost,

          status_code: r.statusCode ?? null,
          status_title: r.statusTitle ?? null,
          status_color: r.statusColor ?? null,

          payment_code: r.paymentCode ?? null,
          payment_title: r.paymentTitle ?? null,

          method_code: r.methodCode ?? null,
          method_title: r.methodTitle ?? null,

          time_option_code: r.timeOptionCode ?? null,
          time_option_title: r.timeOptionTitle ?? null,

          telegram_user_id: r.customerTelegramId ?? null,

          pickup_store_id: r.pickup_store_id ?? null,
          pickup_store_name: r.pickupStoreName ?? null,
          pickup_store_address: r.pickupStoreAddress ?? null,
        };
      });

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });


  // ---------------------------
  // SSE
  // ---------------------------
  // GET /api/admin/orders/events
  router.get("/events", (req, res) => {
    const tenantId = helpers.getTenantId(req);
    const storeId = helpers.getStoreId(req);
    ordersEvents.attach(req, res, tenantId, storeId);
  });

  // GET /api/admin/orders/changes?since=cursor
  router.get("/changes", (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = req.query.since;
      const data = ordersEvents.getChanges(tenantId, storeId, since);
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
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      res.json({ ok: true, data: payload });
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
      const storeId = helpers.getStoreId(req);
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
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [statusId, tenantId, storeId, id]
      );

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (payload) {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
        sendOrderToPrintBot({ db, order: payload, tenantId, storeId }).catch(() => {});
      }

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // reorder orders in status
  // ---------------------------
  // PUT /api/admin/orders/reorder
  router.put("/reorder", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const statusId = Number(req.body.status_id);
      const orderedIdsRaw = Array.isArray(req.body.orderedIds) ? req.body.orderedIds : [];

      if (!Number.isFinite(statusId) || statusId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      const orderedIds = orderedIdsRaw
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x) && x > 0);

      if (orderedIds.length > 1000) {
        return res.status(400).json({ ok: false, error: "TOO_MANY_IDS" });
      }

      if (!orderedIds.length) {
        return res.json({ ok: true });
      }

      const seen = new Set();
      const uniqIds = [];
      for (const id of orderedIds) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniqIds.push(id);
      }

      const n = uniqIds.length;
      const caseSql = uniqIds.map(() => "WHEN ? THEN ?").join(" ");
      const inSql = uniqIds.map(() => "?").join(",");
      const params = [];

      uniqIds.forEach((id, idx) => {
        params.push(id, (n - idx) * 10);
      });

      await db.query(
        `
        UPDATE order_orders
        SET status_sort = CASE id ${caseSql} ELSE status_sort END
        WHERE tenant_id=? AND store_id=? AND status_id=? AND is_active=1 AND id IN (${inSql})
        `,
        [...params, tenantId, storeId, statusId, ...uniqIds]
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
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      await db.query(
        `UPDATE order_orders SET is_active=0 WHERE tenant_id=? AND store_id=? AND id=?`,
        [tenantId, storeId, id]
      );

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });


  return router;
};
