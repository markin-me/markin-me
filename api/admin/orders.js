
const express = require("express");
const { sendOrderToPrintBot } = require("../printPush");
const { applyStockDeductionForOrderItems } = require("../helpers/orderStock");
const discountHelpers = require("../helpers/discounts");

module.exports = function makeAdminOrdersRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();
  let orderDeliveryTypeColumnsReady = false;
  let ensureOrderDeliveryTypeColumnsPromise = null;

  async function ensureOrderDeliveryTypeColumns() {
    if (orderDeliveryTypeColumnsReady) return true;
    if (ensureOrderDeliveryTypeColumnsPromise) return ensureOrderDeliveryTypeColumnsPromise;

    ensureOrderDeliveryTypeColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM order_delivery_types');
      const existing = new Set((columnRows || []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      const requiredColumns = [
        {
          name: 'require_client_data',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Обязательны ли данные клиента (имя/телефон)'",
        },
        {
          name: 'show_on_site',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'Показывать способ на сайте'",
        },
      ];

      for (const column of requiredColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE order_delivery_types ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      orderDeliveryTypeColumnsReady = requiredColumns.every((column) => existing.has(column.name));
      return orderDeliveryTypeColumnsReady;
    })()
      .catch((err) => {
        ensureOrderDeliveryTypeColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (orderDeliveryTypeColumnsReady) {
          ensureOrderDeliveryTypeColumnsPromise = null;
        }
      });

    return ensureOrderDeliveryTypeColumnsPromise;
  }

  function publishStockChanged(tenantId, storeId, payload = {}) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== "function") return;
      ordersEvents.publish(tenantId, storeId, "stock.changed", {
        tenant_id: Number(tenantId),
        store_id: Number(storeId),
        ...payload,
      });
    } catch (err) {
      console.error("publishStockChanged error:", err);
    }
  }

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
        o.store_id,
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
        o.discount_amount,
        o.discounts_json,
        o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id,
        o.payment_id,
        o.time_option_id,
        o.status_id,
        o.pickup_store_id,

        s.code AS statusCode,
        s.title AS statusTitle,
        s.color AS statusColor,

        p.code AS paymentCode,
        p.title AS paymentTitle,
        p.icon AS paymentIcon,

        m.code AS methodCode,
        m.title AS methodTitle,

        t.code AS timeOptionCode,
        t.title AS timeOptionTitle,
        t.icon AS timeOptionIcon,

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
    let discountsJson = [];
    try {
      const parsedDiscounts = r.discounts_json ? JSON.parse(r.discounts_json) : [];
      if (Array.isArray(parsedDiscounts)) discountsJson = parsedDiscounts;
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
      store_id: r.store_id,
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
      discount_amount: Number(r.discount_amount || 0),
      discounts_json: discountsJson,
      items,
      scheduled_at: r.scheduled_at,
      delivery_type_id: r.delivery_type_id,
      payment_id: r.payment_id,
      time_option_id: r.time_option_id,
      status_id: r.status_id,

      status_code: r.statusCode ?? null,
      status_title: r.statusTitle ?? null,
      status_color: r.statusColor ?? null,

      payment_code: r.paymentCode ?? null,
      payment_title: r.paymentTitle ?? null,
      payment_icon: r.paymentIcon ?? null,

      method_code: r.methodCode ?? null,
      method_title: r.methodTitle ?? null,

      time_option_code: r.timeOptionCode ?? null,
      time_option_title: r.timeOptionTitle ?? null,
      time_option_icon: r.timeOptionIcon ?? null,

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
          o.discount_amount,
          o.discounts_json,
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
          p.icon AS paymentIcon,

          m.code AS methodCode,
          m.title AS methodTitle,

          t.code AS timeOptionCode,
          t.title AS timeOptionTitle,
          t.icon AS timeOptionIcon,

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
        let discountsJson = [];
        try {
          const parsedDiscounts = r.discounts_json ? JSON.parse(r.discounts_json) : [];
          if (Array.isArray(parsedDiscounts)) discountsJson = parsedDiscounts;
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
          discount_amount: Number(r.discount_amount || 0),
          discounts_json: discountsJson,

          status_code: r.statusCode ?? null,
          status_title: r.statusTitle ?? null,
          status_color: r.statusColor ?? null,

          payment_code: r.paymentCode ?? null,
          payment_title: r.paymentTitle ?? null,
          payment_icon: r.paymentIcon ?? null,

          method_code: r.methodCode ?? null,
          method_title: r.methodTitle ?? null,

          time_option_code: r.timeOptionCode ?? null,
          time_option_title: r.timeOptionTitle ?? null,
          time_option_icon: r.timeOptionIcon ?? null,

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

  // GET /api/admin/orders/changes?since=cursor
  router.get("/changes", (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = req.query.since;
      const data = ordersEvents.getChanges(tenantId, storeId, since);
      const cursor = ordersEvents.getCurrentCursor(tenantId, storeId);
      res.json({ ok: true, data, cursor });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/changes/wait?since=cursor&timeout_ms=20000
  router.get("/changes/wait", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const since = Number(req.query.since || 0);
      const timeoutMs = Number(req.query.timeout_ms || req.query.timeout || 20000);
      const cursorNow = ordersEvents.getCurrentCursor(tenantId, storeId);

      if (Number.isFinite(since) && since > 0 && cursorNow > since) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }
      if ((!Number.isFinite(since) || since <= 0) && cursorNow > 0) {
        return res.json({ ok: true, data: { changed: true, timeout: false, cursor: cursorNow } });
      }

      const waitResult = await ordersEvents.waitForChanges(tenantId, storeId, timeoutMs);
      const cursor = Number(waitResult?.cursor || ordersEvents.getCurrentCursor(tenantId, storeId) || 0);
      const changed = Number.isFinite(cursor) && cursor > (Number.isFinite(since) ? since : 0);

      return res.json({
        ok: true,
        data: {
          changed,
          timeout: waitResult?.timeout === true,
          cursor,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/new-count
  router.get("/new-count", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const [rows] = await db.query(
        `SELECT COUNT(*) AS cnt
         FROM order_orders o
         LEFT JOIN order_statuses s
           ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
         WHERE o.tenant_id=? AND o.store_id=? AND o.is_active=1
           AND COALESCE(s.is_final, 0)=0
           AND (
             LOWER(COALESCE(s.code, ''))='new'
             OR LOWER(COALESCE(s.title, '')) LIKE 'нов%'
           )`,
        [tenantId, storeId]
      );
      const total = Math.max(0, Number(rows?.[0]?.cnt || 0));
      res.json({ ok: true, data: { total } });
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
    const conn = await db.getConnection();
    let transactionStarted = false;
    let connectionReleased = false;
    const safeRelease = () => {
      if (!connectionReleased) {
        conn.release();
        connectionReleased = true;
      }
    };
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const statusId = Number(req.body.status_id);

      if (!Number.isFinite(id) || id <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!Number.isFinite(statusId) || statusId <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      await conn.beginTransaction();
      transactionStarted = true;

      const [statusRows] = await conn.query(
        `SELECT id
         FROM order_statuses
         WHERE tenant_id=? AND store_id=? AND id=?
         LIMIT 1`,
        [tenantId, storeId, statusId]
      );
      if (!statusRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_STATUS_ID" });
      }

      const [orderRows] = await conn.query(
        `SELECT id, public_id, items, stock_deducted_at, stock_document_id
         FROM order_orders
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1
         FOR UPDATE`,
        [tenantId, storeId, id]
      );
      if (!orderRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const [tenantRows] = await conn.query(
        `SELECT order_stock_deduct_mode, order_stock_deduct_status_id
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const orderRow = orderRows[0];
      const deductMode = String(tenantRows[0]?.order_stock_deduct_mode || "on_create").trim();
      let deductStatusId = Number(tenantRows[0]?.order_stock_deduct_status_id || 0) || null;

      if (deductMode === "on_status" && !deductStatusId) {
        const [fallbackRows] = await conn.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=? AND is_active=1
             AND (code='delivered' OR (is_final=1 AND code<>'canceled'))
           ORDER BY (code='delivered') DESC, sort ASC, id ASC
           LIMIT 1`,
          [tenantId, storeId]
        );
        if (fallbackRows.length) {
          deductStatusId = Number(fallbackRows[0].id);
        }
      }

      let stockDeductedAt = orderRow.stock_deducted_at || null;
      let stockDocumentId = orderRow.stock_document_id != null ? Number(orderRow.stock_document_id) : null;
      let stockChangedProductIds = [];
      const shouldDeductNow =
        deductMode === "on_status" &&
        !stockDeductedAt &&
        deductStatusId != null &&
        Number(statusId) === Number(deductStatusId);

      if (shouldDeductNow) {
        let orderItems = [];
        try {
          const parsed = orderRow.items ? JSON.parse(orderRow.items) : [];
          if (Array.isArray(parsed)) orderItems = parsed;
        } catch {
          orderItems = [];
        }

        try {
          const deductionResult = await applyStockDeductionForOrderItems({
            db: conn,
            tenantId,
            storeId,
            items: orderItems,
            orderId: Number(orderRow.id),
            publicId: orderRow.public_id || null,
            createdBy: req.user?.userId || null,
          });
          stockDeductedAt = deductionResult?.stockDeductedAt || helpers.formatUtcDateTime(Date.now());
          stockDocumentId = deductionResult?.stockDocumentId || null;
          stockChangedProductIds = Array.from(
            new Set(
              (Array.isArray(deductionResult?.deductions) ? deductionResult.deductions : [])
                .map((d) => Number(d?.productId))
                .filter((pid) => Number.isFinite(pid) && pid > 0)
            )
          );
        } catch (stockErr) {
          if (stockErr && stockErr.code === "OUT_OF_STOCK") {
            await conn.rollback();
            transactionStarted = false;
            safeRelease();
            return res.status(409).json({ ok: false, error: "OUT_OF_STOCK" });
          }
          throw stockErr;
        }
      }

      await conn.query(
        `UPDATE order_orders
         SET status_id=?,
             stock_deducted_at=COALESCE(?, stock_deducted_at),
             stock_document_id=COALESCE(?, stock_document_id)
         WHERE tenant_id=? AND store_id=? AND id=?`,
        [statusId, stockDeductedAt, stockDocumentId, tenantId, storeId, id]
      );

      await conn.commit();
      transactionStarted = false;
      safeRelease();

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (payload) {
        if (ordersEvents && typeof ordersEvents.publish === "function") {
          ordersEvents.publish(tenantId, storeId, "order.updated", payload);
        }
        sendOrderToPrintBot({ db, order: payload, tenantId, storeId }).catch(() => {});
      }
      if (stockChangedProductIds.length) {
        publishStockChanged(tenantId, storeId, {
          source: "order.status_update",
          order_id: Number(id),
          product_ids: stockChangedProductIds,
        });
      }

      res.json({ ok: true });
    } catch (e) {
      if (transactionStarted) {
        try {
          await conn.rollback();
        } catch {}
      }
      safeRelease();
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
  // PUT /api/admin/orders/:id
  router.put("/:id", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }

      const [existingRows] = await db.query(
        `SELECT id, public_id, customer_id, promo_code, address_comment, cutlery_qty, discounts_json
         FROM order_orders
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1
         LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!existingRows.length) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      const existing = existingRows[0] || {};

      const methodCode = String(req.body?.method_code || "").trim();
      const paymentCode = String(req.body?.payment_code || "").trim();
      const timeOptionCode = String(req.body?.time_option_code || "").trim();
      if (!methodCode) return res.status(400).json({ ok: false, error: "BAD_METHOD_CODE" });
      if (!paymentCode) return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      if (!timeOptionCode) return res.status(400).json({ ok: false, error: "BAD_TIME_OPTION_CODE" });
      await ensureOrderDeliveryTypeColumns();

      const [[deliveryTypeRows], [paymentRows], [timeOptionRows]] = await Promise.all([
        db.query(
          `SELECT id, require_client_data FROM order_delivery_types
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, methodCode]
        ),
        db.query(
          `SELECT id FROM order_payments
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, paymentCode]
        ),
        db.query(
          `SELECT id FROM order_time_options
           WHERE tenant_id=? AND code=? AND is_active=1
           LIMIT 1`,
          [tenantId, timeOptionCode]
        ),
      ]);
      const deliveryTypeRow = Array.isArray(deliveryTypeRows) ? deliveryTypeRows[0] : null;
      const paymentRow = Array.isArray(paymentRows) ? paymentRows[0] : null;
      const timeOptionRow = Array.isArray(timeOptionRows) ? timeOptionRows[0] : null;

      const deliveryTypeId = Number(deliveryTypeRow?.id || 0);
      const requireClientData = Number(deliveryTypeRow?.require_client_data ?? 1) !== 0;
      const paymentId = Number(paymentRow?.id || 0);
      const timeOptionId = Number(timeOptionRow?.id || 0);
      if (!(deliveryTypeId > 0)) return res.status(400).json({ ok: false, error: "BAD_METHOD_CODE" });
      if (!(paymentId > 0)) return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      if (!(timeOptionId > 0)) return res.status(400).json({ ok: false, error: "BAD_TIME_OPTION_CODE" });

      const customerNameRaw = helpers.strOrNull(req.body?.customer_name);
      const customerName = customerNameRaw || (requireClientData ? "Клиент" : null);
      const phoneDigits = String(req.body?.customer_phone || "").replace(/\D/g, "");
      const hasPhone = phoneDigits.length > 0;
      if (requireClientData && phoneDigits.length !== 11) {
        return res.status(400).json({ ok: false, error: "BAD_CUSTOMER_PHONE" });
      }
      if (!requireClientData && hasPhone && phoneDigits.length !== 11) {
        return res.status(400).json({ ok: false, error: "BAD_CUSTOMER_PHONE" });
      }
      const customerPhone = hasPhone && phoneDigits.length === 11 ? `+${phoneDigits}` : null;
      const customerIdRaw = Number(req.body?.customer_id || 0);
      const existingCustomerId = Number(existing?.customer_id || 0);
      const customerId = customerIdRaw > 0
        ? customerIdRaw
        : (existingCustomerId > 0 ? existingCustomerId : null);

      const isDeliveryMethod = String(methodCode).trim().toLowerCase() === "delivery";
      const deliveryAddress = helpers.strOrNull(req.body?.delivery_address);
      if (isDeliveryMethod && !deliveryAddress) {
        return res.status(400).json({ ok: false, error: "BAD_DELIVERY_ADDRESS" });
      }
      const deliveryAddressIdRaw = Number(req.body?.delivery_address_id || 0);
      const deliveryAddressId = isDeliveryMethod && deliveryAddressIdRaw > 0 ? deliveryAddressIdRaw : null;
      const pickupStoreIdRaw = Number(req.body?.pickup_store_id || 0);
      const pickupStoreId = !isDeliveryMethod && pickupStoreIdRaw > 0 ? pickupStoreIdRaw : null;

      const comment = helpers.strOrNull(req.body?.comment);
      const addressComment = Object.prototype.hasOwnProperty.call(req.body || {}, "address_comment")
        ? helpers.strOrNull(req.body?.address_comment)
        : helpers.strOrNull(existing?.address_comment);
      const promoCode = Object.prototype.hasOwnProperty.call(req.body || {}, "promo_code")
        ? helpers.strOrNull(req.body?.promo_code)
        : helpers.strOrNull(existing?.promo_code);
      const cutleryQty = Object.prototype.hasOwnProperty.call(req.body || {}, "cutlery_qty")
        ? Math.max(0, Number(req.body?.cutlery_qty || 0))
        : Math.max(0, Number(existing?.cutlery_qty || 0));
      const changeFromRaw = Number(req.body?.change_from);
      const changeFrom = Number.isFinite(changeFromRaw) && changeFromRaw > 0 ? changeFromRaw : null;
      const scheduledAt = helpers.strOrNull(req.body?.scheduled_at) || null;

      const [tenantRows] = await db.query(
        `SELECT price_rounding_mode, price_rounding_precision
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
      const roundingModeRaw = String(tenantRows?.[0]?.price_rounding_mode || "none").trim();
      const roundingPrecisionRaw = Number(tenantRows?.[0]?.price_rounding_precision);
      const allowedRounding = new Set(["none", "down", "up", "nearest"]);
      const roundingMode = allowedRounding.has(roundingModeRaw) ? roundingModeRaw : "none";
      const roundingPrecision = roundingPrecisionRaw === 0 ? 0 : 2;
      const roundMoney = (value) => {
        const n = Number(value || 0);
        if (!Number.isFinite(n)) return 0;
        if (roundingMode === "none") return n;
        const factor = roundingPrecision > 0 ? Math.pow(10, roundingPrecision) : 1;
        if (roundingMode === "up") return Math.ceil((n + Number.EPSILON) * factor) / factor;
        if (roundingMode === "down") return Math.floor((n + Number.EPSILON) * factor) / factor;
        return Math.round((n + Number.EPSILON) * factor) / factor;
      };
      const itemsRaw = Array.isArray(req.body?.items) ? req.body.items : [];
      if (!itemsRaw.length) {
        return res.status(400).json({ ok: false, error: "EMPTY_ITEMS" });
      }

      const items = [];
      for (const rawItem of itemsRaw) {
        const qty = Math.max(1, Number(rawItem?.qty || rawItem?.quantity || 1));
        const lineTotal = roundMoney(Number(rawItem?.line_total ?? rawItem?.sum ?? rawItem?.total ?? 0));
        const originalLineTotal = roundMoney(Number(rawItem?.original_line_total ?? rawItem?.old_line_total ?? lineTotal));

        if (String(rawItem?.type || "").toLowerCase() === "combo" || Number(rawItem?.combo_id || 0) > 0) {
          const comboId = Number(rawItem?.combo_id || 0);
          items.push({
            type: "combo",
            combo_id: comboId > 0 ? comboId : null,
            name: String(rawItem?.name || rawItem?.combo_title || "Комбо").trim() || "Комбо",
            qty,
            line_total: lineTotal,
            old_line_total: originalLineTotal,
            sections: Array.isArray(rawItem?.sections) ? rawItem.sections : [],
            selections: Array.isArray(rawItem?.selections) ? rawItem.selections : [],
          });
          continue;
        }

        const productId = Number(rawItem?.product_id || 0);
        if (!(productId > 0)) continue;

        const optionItems = Array.isArray(rawItem?.option_items)
          ? rawItem.option_items
            .map((opt) => {
              const optionId = Number(opt?.id || 0);
              const optionQty = Math.max(0, Number(opt?.qty || 0));
              if (!(optionId > 0) || !(optionQty > 0)) return null;
              const groupId = Number(opt?.group_id || 0);
              const variantGroupId = Number(opt?.variant_group_id || 0);
              const variantValueIndex = Number(opt?.variant_value_index);
              return {
                id: optionId,
                group_id: groupId > 0 ? groupId : null,
                qty: optionQty,
                variant_group_id: variantGroupId > 0 ? variantGroupId : null,
                variant_value_index: Number.isFinite(variantValueIndex) ? variantValueIndex : null,
              };
            })
            .filter(Boolean)
          : [];
        const optionItemIdsFromBody = Array.isArray(rawItem?.option_item_ids)
          ? rawItem.option_item_ids.map((x) => Number(x)).filter((x) => x > 0)
          : [];
        const optionItemIds = optionItemIdsFromBody.length
          ? optionItemIdsFromBody
          : optionItems.map((opt) => Number(opt.id)).filter((x) => x > 0);

        items.push({
          product_id: productId,
          qty,
          option_item_ids: optionItemIds,
          option_items: optionItems,
          ingredients: Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [],
          variant_group_id: Number(rawItem?.variant_group_id || 0) || null,
          variant_value_index: Number.isFinite(Number(rawItem?.variant_value_index)) ? Number(rawItem.variant_value_index) : null,
          variant_label: helpers.strOrNull(rawItem?.variant_label),
          line_total: lineTotal,
          old_line_total: originalLineTotal,
        });
      }

      const toText = (value) => String(value == null ? "" : value).trim();
      const productIds = [...new Set(
        items
          .map((item) => Number(item?.product_id || 0))
          .filter((id) => id > 0)
      )];
      const optionIds = [...new Set(
        items
          .flatMap((item) => Array.isArray(item?.option_item_ids) ? item.option_item_ids : [])
          .map((id) => Number(id))
          .filter((id) => id > 0)
      )];
      const ingredientPairs = [];
      items.forEach((item) => {
        const productId = Number(item?.product_id || 0);
        if (!(productId > 0)) return;
        const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
        ingredients.forEach((ing) => {
          const ingredientId = Number(ing?.ingredient_id || ing?.product_id || 0);
          if (ingredientId > 0) ingredientPairs.push({ productId, ingredientId });
        });
      });
      const ingredientProductIds = [...new Set(ingredientPairs.map((pair) => pair.productId))];
      const ingredientIds = [...new Set(ingredientPairs.map((pair) => pair.ingredientId))];
      const variantGroupIds = [...new Set(
        items
          .map((item) => Number(item?.variant_group_id || 0))
          .filter((id) => id > 0)
      )];

      const productMetaById = new Map();
      if (productIds.length) {
        const [productRows] = await db.query(
          `SELECT id, name, price, old_price, photos_json
           FROM prod_products
           WHERE tenant_id=? AND id IN (${productIds.map(() => "?").join(",")})`,
          [tenantId, ...productIds]
        );
        productRows.forEach((row) => {
          let photos = [];
          try {
            const parsed = row?.photos_json ? JSON.parse(row.photos_json) : [];
            if (Array.isArray(parsed)) photos = parsed.map((x) => toText(x)).filter(Boolean);
          } catch {}
          productMetaById.set(Number(row.id), {
            name: toText(row?.name),
            price: Number(row?.price || 0),
            old_price: Number(row?.old_price || 0),
            photos,
          });
        });
      }

      const optionMetaById = new Map();
      if (optionIds.length) {
        const [optionRows] = await db.query(
          `SELECT oi.id,
                  oi.target_product_id,
                  oi.price_mode,
                  oi.price_value,
                  p.name AS product_name,
                  p.price AS product_price
           FROM prod_option_items oi
           LEFT JOIN prod_products p
             ON p.tenant_id=oi.tenant_id AND p.id=oi.target_product_id
           WHERE oi.tenant_id=? AND oi.id IN (${optionIds.map(() => "?").join(",")})`,
          [tenantId, ...optionIds]
        );
        optionRows.forEach((row) => {
          let optionPrice = 0;
          const mode = String(row?.price_mode || "").trim().toLowerCase();
          if (mode === "fixed") {
            optionPrice = Number(row?.price_value || 0);
          } else if (mode === "delta") {
            optionPrice = Number(row?.product_price || 0) + Number(row?.price_value || 0);
          } else {
            optionPrice = Number(row?.product_price || 0);
          }
          optionMetaById.set(Number(row.id), {
            title: toText(row?.product_name),
            price: roundMoney(optionPrice),
            target_product_id: Number(row?.target_product_id || 0) || null,
          });
        });
      }

      const ingredientMetaByKey = new Map();
      if (ingredientProductIds.length && ingredientIds.length) {
        const [ingredientRows] = await db.query(
          `SELECT i.product_id,
                  i.ingredient_id,
                  i.unit_id,
                  p.name AS ingredient_name,
                  u.short_title AS unit_short_title,
                  u.title AS unit_title,
                  u.code AS unit_code
           FROM prod_product_ingredients i
           LEFT JOIN prod_products p
             ON p.tenant_id=i.tenant_id AND p.id=i.ingredient_id
           LEFT JOIN prod_units u
             ON u.tenant_id=i.tenant_id AND u.id=i.unit_id
           WHERE i.tenant_id=?
             AND i.product_id IN (${ingredientProductIds.map(() => "?").join(",")})
             AND i.ingredient_id IN (${ingredientIds.map(() => "?").join(",")})`,
          [tenantId, ...ingredientProductIds, ...ingredientIds]
        );
        ingredientRows.forEach((row) => {
          const key = `${Number(row?.product_id || 0)}:${Number(row?.ingredient_id || 0)}`;
          ingredientMetaByKey.set(key, {
            unit_id: Number(row?.unit_id || 0) || null,
            ingredient_name: toText(row?.ingredient_name),
            unit_short_title: toText(row?.unit_short_title),
            unit_title: toText(row?.unit_title),
            unit_code: toText(row?.unit_code),
          });
        });
      }

      const variantMetaById = new Map();
      if (variantGroupIds.length) {
        const [variantRows] = await db.query(
          `SELECT id, title, \`values\`
           FROM prod_variant_groups
           WHERE tenant_id=? AND id IN (${variantGroupIds.map(() => "?").join(",")})`,
          [tenantId, ...variantGroupIds]
        );
        variantRows.forEach((row) => {
          let values = [];
          try {
            const parsed = row?.values ? JSON.parse(row.values) : [];
            if (Array.isArray(parsed)) values = parsed;
          } catch {}
          variantMetaById.set(Number(row.id), {
            title: toText(row?.title),
            values,
          });
        });
      }

      for (const item of items) {
        const lineTotal = roundMoney(Number(item?.line_total || 0));
        const oldLineTotal = roundMoney(Number(item?.old_line_total ?? lineTotal));
        const qty = Math.max(1, Number(item?.qty || item?.quantity || 1));
        item.qty = qty;
        item.line_total = lineTotal;
        item.old_line_total = oldLineTotal;

        if (String(item?.type || "").toLowerCase() === "combo" || Number(item?.combo_id || 0) > 0) {
          const comboTitle = toText(item?.combo_title || item?.name) || "\u041a\u043e\u043c\u0431\u043e";
          const comboSelections = Array.isArray(item?.selections) ? item.selections : [];
          const normalizedSelections = comboSelections.map((sel) => {
            const out = sel && typeof sel === "object" ? { ...sel } : {};
            out.product_id = Number(sel?.product_id || 0) || null;
            out.product_name = toText(sel?.product_name);
            out.product_photo = toText(sel?.product_photo);
            out.variant_label = toText(sel?.variant_label);
            out.variant_group_title = toText(sel?.variant_group_title);
            out.variant_unit = toText(sel?.variant_unit);
            out.variant_value_index = Number.isFinite(Number(sel?.variant_value_index)) ? Number(sel.variant_value_index) : null;
            out.variant_group_id = Number(sel?.variant_group_id || 0) || null;
            const unitPriceOverride = Number(sel?.unit_price_override);
            if (Number.isFinite(unitPriceOverride)) {
              out.unit_price_override = unitPriceOverride;
            }
            const unitPriceBeforeDiscount = Number(sel?.unit_price_before_discount);
            if (Number.isFinite(unitPriceBeforeDiscount)) {
              out.unit_price_before_discount = unitPriceBeforeDiscount;
            }
            out.ingredients_display = Array.isArray(sel?.ingredients_display)
              ? sel.ingredients_display.map((ing) => {
                const next = ing && typeof ing === "object" ? { ...ing } : {};
                next.ingredient_id = Number(ing?.ingredient_id || ing?.product_id || 0) || null;
                next.product_id = Number(ing?.product_id || ing?.ingredient_id || 0) || null;
                next.quantity = Number(ing?.quantity ?? ing?.qty ?? 0);
                next.qty = Number(ing?.qty ?? ing?.quantity ?? 0);
                next.unit = toText(ing?.unit);
                next.unit_id = Number(ing?.unit_id || 0) || null;
                next.name = toText(ing?.name);
                return next;
              })
              : [];
            return out;
          });
          const comboRawPhotos = Array.isArray(item?.photos)
            ? item.photos.map((x) => toText(x)).filter(Boolean)
            : [];
          const comboDerivedPhotos = normalizedSelections.map((sel) => toText(sel?.product_photo)).filter(Boolean);
          item.type = "combo";
          item.combo_title = comboTitle;
          item.name = comboTitle;
          item.selections = normalizedSelections;
          item.photos = comboRawPhotos.length ? comboRawPhotos : comboDerivedPhotos;
          item.price = qty > 0 ? roundMoney(lineTotal / qty) : 0;
          item.old_price = qty > 0 ? roundMoney(oldLineTotal / qty) : 0;
          continue;
        }

        const productId = Number(item?.product_id || 0);
        if (!(productId > 0)) continue;
        const productMeta = productMetaById.get(productId) || null;
        const rawPhotos = Array.isArray(item?.photos) ? item.photos.map((x) => toText(x)).filter(Boolean) : [];
        const optionIdsForItem = Array.isArray(item?.option_item_ids)
          ? item.option_item_ids.map((id) => Number(id)).filter((id) => id > 0)
          : [];
        const optionRowsSource = Array.isArray(item?.option_items) && item.option_items.length
          ? item.option_items
          : optionIdsForItem.map((id) => ({ id, qty: 1 }));
        const optionRows = optionRowsSource
          .map((opt) => {
            const optionId = Number(opt?.id || 0);
            if (!(optionId > 0)) return null;
            const optionMeta = optionMetaById.get(optionId) || null;
            const optionQty = Math.max(1, Number(opt?.qty || opt?.quantity || 1));
            const groupId = Number(opt?.group_id || 0);
            const optionVariantGroupId = Number(opt?.variant_group_id || 0);
            const optionVariantValueIndex = Number(opt?.variant_value_index);
            const optionPriceRaw = Number(opt?.price);
            const optionPrice = Number.isFinite(optionPriceRaw) ? optionPriceRaw : Number(optionMeta?.price || 0);
            const optionTitle = toText(opt?.title || optionMeta?.title);
            const optionVariantLabel = toText(opt?.variant_label);
            const out = {
              id: optionId,
              title: optionTitle,
              price: roundMoney(optionPrice),
              qty: optionQty,
            };
            const targetProductId = Number(optionMeta?.target_product_id || 0);
            if (targetProductId > 0) out.target_product_id = targetProductId;
            if (groupId > 0) out.group_id = groupId;
            if (optionVariantGroupId > 0) out.variant_group_id = optionVariantGroupId;
            if (Number.isFinite(optionVariantValueIndex)) out.variant_value_index = optionVariantValueIndex;
            if (optionVariantLabel) out.variant_label = optionVariantLabel;
            return out;
          })
          .filter(Boolean);

        const ingredients = (Array.isArray(item?.ingredients) ? item.ingredients : [])
          .map((ing) => {
            const ingredientId = Number(ing?.ingredient_id || ing?.product_id || 0);
            if (!(ingredientId > 0)) return null;
            const ingredientQty = Number(ing?.qty ?? ing?.quantity ?? 0);
            if (!Number.isFinite(ingredientQty) || ingredientQty < 0) return null;
            const meta = ingredientMetaByKey.get(`${productId}:${ingredientId}`) || null;
            const unitId = Number(ing?.unit_id || meta?.unit_id || 0);
            const unitLabel = toText(
              ing?.unit_label
              || ing?.unit
              || meta?.unit_short_title
              || meta?.unit_title
              || meta?.unit_code
            );
            const row = {
              ingredient_id: ingredientId,
              quantity: ingredientQty,
              qty: ingredientQty,
            };
            const ingName = toText(ing?.name || meta?.ingredient_name);
            if (ingName) row.name = ingName;
            if (unitId > 0) row.unit_id = unitId;
            if (unitLabel) row.unit_label = unitLabel;
            const ingPrice = Number(ing?.price);
            if (Number.isFinite(ingPrice)) row.price = roundMoney(ingPrice);
            const ingTotal = Number(ing?.total);
            if (Number.isFinite(ingTotal)) row.total = roundMoney(ingTotal);
            return row;
          })
          .filter(Boolean);

        const variantGroupId = Number(item?.variant_group_id || 0);
        const variantValueIndexRaw = Number(item?.variant_value_index);
        const variantValueIndex = Number.isFinite(variantValueIndexRaw) ? variantValueIndexRaw : null;
        const variantLabel = toText(item?.variant_label);
        const variants = [];
        if (variantGroupId > 0 && Number.isFinite(variantValueIndex) && variantValueIndex >= 0) {
          const variantMeta = variantMetaById.get(variantGroupId) || null;
          let value = "";
          if (variantMeta && Array.isArray(variantMeta.values) && variantMeta.values[variantValueIndex] != null) {
            value = toText(variantMeta.values[variantValueIndex]);
          }
          const label = variantLabel || value;
          variants.push({
            variant_group_id: variantGroupId,
            variant_value_index: variantValueIndex,
            group_title: toText(variantMeta?.title),
            value: value || label,
            label: label || value,
            price_diff: 0,
          });
        }

        const unitPriceRaw = Number(item?.price);
        const fallbackUnitPrice = qty > 0 ? lineTotal / qty : Number(productMeta?.price || 0);
        const oldPriceRaw = Number(item?.old_price);
        const fallbackOldPrice = qty > 0 ? oldLineTotal / qty : Number(productMeta?.old_price || 0);
        item.type = "product";
        item.name = toText(item?.name || productMeta?.name) || "\u0422\u043e\u0432\u0430\u0440";
        item.photos = rawPhotos.length ? rawPhotos : (Array.isArray(productMeta?.photos) ? productMeta.photos : []);
        item.price = roundMoney(Number.isFinite(unitPriceRaw) ? unitPriceRaw : fallbackUnitPrice);
        item.old_price = roundMoney(Math.max(0, Number.isFinite(oldPriceRaw) && oldPriceRaw > 0 ? oldPriceRaw : fallbackOldPrice));
        item.option_item_ids = optionIdsForItem.length
          ? [...new Set(optionIdsForItem)]
          : optionRows.map((opt) => Number(opt.id)).filter((id) => id > 0);
        item.option_items = optionRows;
        item.options = optionRows;
        item.ingredients = ingredients;
        item.variant_group_id = variantGroupId > 0 ? variantGroupId : null;
        item.variant_value_index = Number.isFinite(variantValueIndex) && variantValueIndex >= 0 ? variantValueIndex : null;
        item.variant_label = variantLabel || null;
        item.variants = variants;
        if (oldLineTotal > lineTotal) {
          item.discount = { original_line_total: oldLineTotal };
        } else if (item.discount && typeof item.discount === "object") {
          delete item.discount;
        }
      }

      if (!items.length) {
        return res.status(400).json({ ok: false, error: "EMPTY_ITEMS" });
      }

      const itemsTotal = roundMoney(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
      const oldItemsTotal = roundMoney(items.reduce((sum, item) => {
        const line = Number(item?.line_total || 0);
        const old = Number(item?.old_line_total || line);
        return sum + (old > line ? old : line);
      }, 0));
      const itemLevelDiscountAmount = roundMoney(Math.max(0, oldItemsTotal - itemsTotal));

      let customerOrderDiscountAmount = 0;
      let appliedOrderDiscounts = [];
      if (Number(customerId || 0) > 0 && itemsTotal > 0) {
        const orderDiscountsForCustomer = await discountHelpers.getOrderDiscounts(
          db,
          tenantId,
          storeId,
          customerId,
          itemsTotal
        );
        if (Array.isArray(orderDiscountsForCustomer) && orderDiscountsForCustomer.length) {
          const applied = discountHelpers.applyBestDiscounts(orderDiscountsForCustomer, itemsTotal);
          customerOrderDiscountAmount = roundMoney(Math.max(0, Number(applied?.totalDiscount || 0)));
          appliedOrderDiscounts = Array.isArray(applied?.appliedDiscounts) ? applied.appliedDiscounts : [];
        }
      }
      const itemsTotalAfterDiscounts = roundMoney(Math.max(0, itemsTotal - customerOrderDiscountAmount));
      const discountAmount = roundMoney(itemLevelDiscountAmount + customerOrderDiscountAmount);

      let deliveryCost = 0;
      if (isDeliveryMethod) {
        let minOrderAmount = 0;
        let freeDeliveryFrom = null;
        const [settingsRows] = await db.query(
          `SELECT ds.delivery_cost, ds.min_order_amount, ds.free_delivery_from
           FROM ten_delivery_settings ds
           JOIN ten_delivery_settings_stores dss
             ON dss.delivery_setting_id = ds.id AND dss.tenant_id = ds.tenant_id
           WHERE ds.tenant_id=? AND dss.store_id=? AND ds.is_active=1
           LIMIT 1`,
          [tenantId, storeId]
        );
        if (settingsRows.length) {
          const settings = settingsRows[0];
          deliveryCost = roundMoney(Number(settings?.delivery_cost || 0));
          minOrderAmount = Number(settings?.min_order_amount || 0);
          freeDeliveryFrom = settings?.free_delivery_from != null ? Number(settings.free_delivery_from) : null;
        }
        if (minOrderAmount > 0 && itemsTotalAfterDiscounts < minOrderAmount) {
          return res.status(409).json({ ok: false, error: "MIN_ORDER", min_order_amount: minOrderAmount });
        }
        if (freeDeliveryFrom != null && itemsTotalAfterDiscounts >= freeDeliveryFrom) {
          deliveryCost = 0;
        }
      }
      const totalPrice = roundMoney(itemsTotalAfterDiscounts + deliveryCost);

      let discountsJson = [];
      if (Array.isArray(req.body?.discounts_json)) {
        discountsJson = req.body.discounts_json;
      } else {
        try {
          const parsed = existing?.discounts_json ? JSON.parse(existing.discounts_json) : [];
          if (Array.isArray(parsed)) discountsJson = parsed;
        } catch {}
      }
      discountsJson = (Array.isArray(discountsJson) ? discountsJson : [])
        .filter((row) => String(row?.apply_to || "").trim().toLowerCase() !== "order");
      if (customerOrderDiscountAmount > 0 && appliedOrderDiscounts.length) {
        discountsJson.push(
          ...appliedOrderDiscounts.map((row) => ({
            discount_id: Number(row?.id || 0),
            title: toText(row?.title),
            discount_type: toText(row?.discount_type),
            discount_value: Number(row?.discount_value || 0),
            discount_amount: roundMoney(Number(row?.discountAmount || 0)),
            apply_to: "order",
          }))
        );
      }

      await db.query(
        `UPDATE order_orders
         SET customer_id=?,
             customer_name=?,
             customer_phone=?,
             promo_code=?,
             address=?,
             delivery_address_id=?,
             pickup_store_id=?,
             comment=?,
             address_comment=?,
             cutlery_qty=?,
             change_from=?,
             items=?,
             total_price=?,
             delivery_cost=?,
             discount_amount=?,
             discounts_json=?,
             delivery_type_id=?,
             payment_id=?,
             time_option_id=?,
             scheduled_at=?
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1`,
        [
          customerId,
          customerName,
          customerPhone,
          promoCode,
          isDeliveryMethod ? deliveryAddress : null,
          deliveryAddressId,
          pickupStoreId,
          comment,
          addressComment,
          cutleryQty,
          changeFrom,
          JSON.stringify(items),
          totalPrice,
          deliveryCost,
          discountAmount,
          JSON.stringify(discountsJson),
          deliveryTypeId,
          paymentId,
          timeOptionId,
          scheduledAt,
          tenantId,
          storeId,
          id,
        ]
      );

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (payload && ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.json({
        ok: true,
        data: {
          id,
          public_id: payload?.public_id || existing?.public_id || null,
        },
      });
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
