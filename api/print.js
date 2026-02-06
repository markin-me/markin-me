const express = require("express");

module.exports = function makePrintApiRouter({ db, helpers }) {
  const router = express.Router();

  async function getStoreTimezone(tenantId, storeId) {
    let storeTimezone = "+0";
    if (storeId) {
      const [rows] = await db.query(
        "SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1",
        [tenantId, storeId]
      );
      if (rows[0]?.timezone) {
        storeTimezone = rows[0].timezone;
      }
    }
    if (!storeTimezone || storeTimezone === "+0") {
      const [tenantRows] = await db.query(
        "SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1",
        [tenantId]
      );
      if (tenantRows[0]?.timezone) {
        storeTimezone = tenantRows[0].timezone;
      }
    }
    return storeTimezone || "+0";
  }

  async function findNewStatusId(tenantId, storeId) {
    const [rows] = await db.query(
      "SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 AND code=? LIMIT 1",
      [tenantId, storeId, "new"]
    );
    if (rows.length) return Number(rows[0].id);

    const [rowsByTitle] = await db.query(
      "SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 AND title LIKE ? ORDER BY sort ASC, id ASC LIMIT 1",
      [tenantId, storeId, "%Нов%"]
    );
    if (rowsByTitle.length) return Number(rowsByTitle[0].id);
    return null;
  }

  async function resolveToken(token) {
    const [rows] = await db.query(
      "SELECT id, tenant_id, store_id, is_active FROM print_api_tokens WHERE token=? LIMIT 1",
      [token]
    );
    if (!rows.length) return null;
    const row = rows[0];
    if (!Number(row.is_active)) return null;
    return row;
  }

  // GET /api/print/orders
  router.get("/orders", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const tenantId = Number(tokenRow.tenant_id);
      const storeId = Number(tokenRow.store_id);
      const statusId = await findNewStatusId(tenantId, storeId);
      if (!statusId) {
        return res.json({ ok: true, data: [] });
      }

      const limitRaw = Number(req.query.limit || 100);
      const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 100;

      const storeTimezone = await getStoreTimezone(tenantId, storeId);

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
          o.cutlery_qty,
          o.change_from,
          o.total_price,
          o.delivery_cost,
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

          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle,

          c.telegram_user_id AS customerTelegramId,

          o.pickup_store_id,
          ps.name AS pickupStoreName,
          ps.address AS pickupStoreAddress
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
        WHERE o.tenant_id=? AND o.store_id=? AND o.status_id=? AND o.is_active=1
        ORDER BY o.created_at ASC, o.id ASC
        LIMIT ?
        `,
        [tenantId, storeId, statusId, limit]
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
        if ((r.methodCode ?? null) === "delivery") {
          const diff = totalPrice - itemsTotal;
          const computed = diff > 0 ? diff : 0;
          const stored = r.delivery_cost != null ? Number(r.delivery_cost || 0) : null;
          deliveryCost = stored && stored > 0 ? stored : computed;
        }

        return {
          ...r,
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

      await db.query(
        "UPDATE print_api_tokens SET last_used_at=NOW() WHERE id=?",
        [tokenRow.id]
      );

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  return router;
};
