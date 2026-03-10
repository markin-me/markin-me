
const express = require("express");
const { sendOrderToPrintBot } = require("../printPush");
const { applyStockDeductionForOrderItems } = require("../helpers/orderStock");
const discountHelpers = require("../helpers/discounts");
const {
  roundMoney,
  buildOrderRefundState,
  buildRefundPlan,
} = require("../helpers/orderRefunds");

module.exports = function makeAdminOrdersRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();
  let orderDeliveryTypeColumnsReady = false;
  let ensureOrderDeliveryTypeColumnsPromise = null;
  let refundTablesReady = false;
  let ensureRefundTablesPromise = null;

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

  async function ensureRefundTables() {
    if (refundTablesReady) return true;
    if (ensureRefundTablesPromise) return ensureRefundTablesPromise;

    ensureRefundTablesPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS order_refunds (
          id INT NOT NULL AUTO_INCREMENT,
          tenant_id INT NOT NULL,
          store_id INT NOT NULL,
          order_id INT NOT NULL,
          payment_id INT DEFAULT NULL,
          payment_code VARCHAR(50) NOT NULL,
          payment_title VARCHAR(100) DEFAULT NULL,
          payment_icon VARCHAR(255) DEFAULT NULL,
          items_total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          delivery_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          comment TEXT DEFAULT NULL,
          is_full TINYINT(1) NOT NULL DEFAULT 0,
          created_by_user_id INT DEFAULT NULL,
          created_by_name VARCHAR(150) DEFAULT NULL,
          created_by_email VARCHAR(150) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_order_refunds_order (tenant_id, store_id, order_id),
          KEY idx_order_refunds_created (tenant_id, store_id, created_at)
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS order_refund_items (
          id INT NOT NULL AUTO_INCREMENT,
          tenant_id INT NOT NULL,
          store_id INT NOT NULL,
          order_id INT NOT NULL,
          refund_id INT NOT NULL,
          source_item_index INT NOT NULL,
          item_snapshot LONGTEXT NOT NULL,
          refunded_qty DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          line_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_order_refund_items_refund (tenant_id, store_id, refund_id),
          KEY idx_order_refund_items_order (tenant_id, store_id, order_id, source_item_index)
        )
      `);
      refundTablesReady = true;
      return true;
    })()
      .catch((err) => {
        ensureRefundTablesPromise = null;
        throw err;
      })
      .finally(() => {
        if (refundTablesReady) ensureRefundTablesPromise = null;
      });

    return ensureRefundTablesPromise;
  }

  async function fetchRefundRecordsMap(executor, tenantId, storeId, orderIds, opts = {}) {
    await ensureRefundTables();
    const ids = [...new Set(
      (Array.isArray(orderIds) ? orderIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )];
    const refundMap = new Map();
    if (!ids.length) return refundMap;

    const storeTimezone = opts.storeTimezone ?? null;
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await executor.query(
      `
      SELECT
        r.id AS refund_id,
        r.order_id,
        r.payment_id,
        r.payment_code,
        r.payment_title,
        r.payment_icon,
        r.items_total,
        r.delivery_amount,
        r.total_amount,
        r.comment,
        r.is_full,
        r.created_by_user_id,
        r.created_by_name,
        r.created_by_email,
        DATE_FORMAT(r.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        ri.id AS refund_item_id,
        ri.source_item_index,
        ri.refunded_qty,
        ri.unit_price,
        ri.line_amount,
        ri.item_snapshot
      FROM order_refunds r
      LEFT JOIN order_refund_items ri
        ON ri.tenant_id=r.tenant_id
       AND ri.store_id=r.store_id
       AND ri.refund_id=r.id
      WHERE r.tenant_id=? AND r.store_id=? AND r.order_id IN (${placeholders})
      ORDER BY r.created_at DESC, r.id DESC, ri.id ASC
      `,
      [tenantId, storeId, ...ids]
    );

    for (const row of rows) {
      const orderId = Number(row?.order_id || 0);
      if (!(orderId > 0)) continue;
      if (!refundMap.has(orderId)) refundMap.set(orderId, []);
      const list = refundMap.get(orderId);
      const refundId = Number(row?.refund_id || 0);
      let refund = list.find((item) => Number(item?.id || 0) === refundId) || null;
      if (!refund) {
        refund = {
          id: refundId,
          order_id: orderId,
          payment_id: Number(row?.payment_id || 0) || null,
          payment_code: row?.payment_code || null,
          payment_title: row?.payment_title || null,
          payment_icon: row?.payment_icon || null,
          items_total: roundMoney(row?.items_total || 0),
          delivery_amount: roundMoney(row?.delivery_amount || 0),
          total_amount: roundMoney(row?.total_amount || 0),
          comment: row?.comment || null,
          is_full: Number(row?.is_full || 0) === 1 ? 1 : 0,
          created_by_user_id: Number(row?.created_by_user_id || 0) || null,
          created_by_name: row?.created_by_name || null,
          created_by_email: row?.created_by_email || null,
          created_at: storeTimezone
            ? helpers.utcToStoreDateTime(row?.created_at, storeTimezone)
            : row?.created_at,
          items: [],
        };
        list.push(refund);
      }

      const refundItemId = Number(row?.refund_item_id || 0);
      if (!(refundItemId > 0)) continue;
      let itemSnapshot = {};
      try {
        const parsed = row?.item_snapshot ? JSON.parse(row.item_snapshot) : {};
        if (parsed && typeof parsed === "object") itemSnapshot = parsed;
      } catch {}
      refund.items.push({
        id: refundItemId,
        source_item_index: Number(row?.source_item_index || 0),
        refunded_qty: Number(row?.refunded_qty || 0),
        unit_price: roundMoney(row?.unit_price || 0),
        line_amount: roundMoney(row?.line_amount || 0),
        item_snapshot: itemSnapshot,
      });
    }

    return refundMap;
  }

  async function attachRefundDataToOrders(executor, tenantId, storeId, orders, opts = {}) {
    await ensureRefundTables();
    const list = Array.isArray(orders) ? orders : [];
    if (!list.length) return list;
    const refundMap = await fetchRefundRecordsMap(executor, tenantId, storeId, list.map((order) => order?.id), opts);
    return list.map((order) => ({
      ...order,
      ...buildOrderRefundState(order, refundMap.get(Number(order?.id || 0)) || []),
    }));
  }

  async function resolveRefundActorSnapshot(conn, tenantId, req) {
    const userId = Number(req.user?.userId || 0) || null;
    const fallbackEmail = String(req.user?.email || "").trim() || null;
    if (!(userId > 0)) {
      return {
        createdByUserId: null,
        createdByName: fallbackEmail || "Оператор",
        createdByEmail: fallbackEmail,
      };
    }

    const [rows] = await conn.query(
      `SELECT name, email
         FROM app_users
        WHERE tenant_id=? AND id=?
        LIMIT 1`,
      [tenantId, userId]
    );
    const row = rows[0] || null;
    return {
      createdByUserId: userId,
      createdByName: String(row?.name || "").trim() || fallbackEmail || "Оператор",
      createdByEmail: String(row?.email || fallbackEmail || "").trim() || null,
    };
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

  function setOrdersNoStore(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }

  function pad2(value) {
    return String(Number(value) || 0).padStart(2, '0');
  }

  function addDaysToDateKey(dateKey, days) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const next = new Date(Date.UTC(year || 0, (month || 1) - 1, day || 1));
    next.setUTCDate(next.getUTCDate() + Number(days || 0));
    return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  }

  function formatUtcDateTime(ms) {
    const date = new Date(ms);
    return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}:${pad2(date.getUTCSeconds())}`;
  }

  function localDateKeyToUtcDateTime(dateKey, offsetMinutes) {
    const [year, month, day] = String(dateKey || '').split('-').map(Number);
    const utcMs = Date.UTC(year || 0, (month || 1) - 1, day || 1, 0, 0, 0) - (Number(offsetMinutes || 0) * 60 * 1000);
    return formatUtcDateTime(utcMs);
  }

  function buildOrderDateBounds(range, storeTimezone) {
    if (!range) return null;
    const offsetMinutes = helpers.parseTimezoneOffsetToMinutes(storeTimezone);
    const nextDayKey = addDaysToDateKey(range.end, 1);
    return {
      scheduledStart: `${range.start} 00:00:00`,
      scheduledEndExclusive: `${nextDayKey} 00:00:00`,
      createdStartUtc: localDateKeyToUtcDateTime(range.start, offsetMinutes),
      createdEndUtcExclusive: localDateKeyToUtcDateTime(nextDayKey, offsetMinutes),
    };
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
        o.is_paid,
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

    const basePayload = {
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
      is_paid: Number(r.is_paid || 0) === 1 ? 1 : 0,
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
    const [payload] = await attachRefundDataToOrders(db, tenantId, storeId, [basePayload], { storeTimezone });
    return payload || basePayload;
  }

  // ---------------------------
  // statuses summary (counts)
  // ---------------------------
  // GET /api/admin/orders/statuses
  router.get("/statuses", async (req, res) => {
    try {
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const bounds = buildOrderDateBounds(range, storeTimezone);

      const joinDate = bounds
        ? `AND (
             (o.scheduled_at IS NOT NULL AND o.scheduled_at >= ? AND o.scheduled_at < ?)
             OR
             (o.scheduled_at IS NULL AND o.created_at >= ? AND o.created_at < ?)
           )`
        : "";

      const params = [];
      if (bounds) {
        params.push(
          bounds.scheduledStart,
          bounds.scheduledEndExclusive,
          bounds.createdStartUtc,
          bounds.createdEndUtcExclusive
        );
      }
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
      setOrdersNoStore(res);
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);

      const statusId = Number(req.query.status_id || 0);
      const limit = Math.min(500, Math.max(10, Number(req.query.limit || 50)));
      const offset = Math.max(0, Number(req.query.offset || 0));
      const range = normalizeDateRange(req.query.start_date, req.query.end_date);
      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      const bounds = buildOrderDateBounds(range, storeTimezone);

      let where = `o.tenant_id=? AND o.store_id=? AND o.is_active=1`;
      const params = [tenantId, storeId];

      if (Number.isFinite(statusId) && statusId > 0) {
        where += ` AND o.status_id=?`;
        params.push(statusId);
      }

      if (bounds) {
        where += ` AND (
          (o.scheduled_at IS NOT NULL AND o.scheduled_at >= ? AND o.scheduled_at < ?)
          OR
          (o.scheduled_at IS NULL AND o.created_at >= ? AND o.created_at < ?)
        )`;
        params.push(
          bounds.scheduledStart,
          bounds.scheduledEndExclusive,
          bounds.createdStartUtc,
          bounds.createdEndUtcExclusive
        );
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
          o.is_paid,
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

      const baseData = rows.map((r) => {
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
          is_paid: Number(r.is_paid || 0) === 1 ? 1 : 0,

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
      const data = await attachRefundDataToOrders(db, tenantId, storeId, baseData, { storeTimezone });

      res.json({ ok: true, data });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/admin/orders/changes?since=cursor
  router.get("/changes", (req, res) => {
    try {
      setOrdersNoStore(res);
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
      setOrdersNoStore(res);
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
  // change paid flag
  // ---------------------------
  // PUT /api/admin/orders/:id/paid
  router.put("/:id/paid", async (req, res) => {
    try {
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const isPaidRaw = Number(req.body?.is_paid);
      const hasPaymentCode = Object.prototype.hasOwnProperty.call(req.body || {}, "payment_code");
      const hasChangeFrom = Object.prototype.hasOwnProperty.call(req.body || {}, "change_from");
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!(isPaidRaw === 0 || isPaidRaw === 1)) {
        return res.status(400).json({ ok: false, error: "BAD_IS_PAID" });
      }

      const [existingRows] = await db.query(
        `SELECT o.id,
                o.total_price,
                o.change_from,
                o.payment_id,
                p.code AS payment_code
           FROM order_orders o
      LEFT JOIN order_payments p
             ON p.tenant_id=o.tenant_id
            AND p.store_id=o.store_id
            AND p.id=o.payment_id
          WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
          LIMIT 1`,
        [tenantId, storeId, id]
      );
      if (!existingRows.length) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const existing = existingRows[0] || {};
      let nextPaymentId = Number(existing.payment_id || 0) > 0 ? Number(existing.payment_id) : null;
      let effectivePaymentCode = String(existing.payment_code || "").trim().toLowerCase();

      if (hasPaymentCode) {
        const paymentCode = String(req.body?.payment_code || "").trim();
        if (!paymentCode) {
          return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
        }
        const [paymentRows] = await db.query(
          `SELECT id, code
             FROM order_payments
            WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1
            LIMIT 1`,
          [tenantId, storeId, paymentCode]
        );
        if (!paymentRows.length) {
          return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
        }
        nextPaymentId = Number(paymentRows[0]?.id || 0) > 0 ? Number(paymentRows[0].id) : null;
        effectivePaymentCode = String(paymentRows[0]?.code || paymentCode).trim().toLowerCase();
      }

      const totalPrice = Number(existing.total_price || 0);
      const isCashPayment = effectivePaymentCode.includes("cash") || effectivePaymentCode.includes("нал");
      let nextChangeFrom = Number(existing.change_from || 0) > 0 ? Number(existing.change_from) : null;

      if (!isCashPayment) {
        nextChangeFrom = null;
      } else if (hasChangeFrom) {
        const rawChangeFrom = req.body?.change_from;
        if (rawChangeFrom == null || rawChangeFrom === "") {
          nextChangeFrom = null;
        } else {
          const numericChangeFrom = Number(rawChangeFrom);
          if (!Number.isFinite(numericChangeFrom) || numericChangeFrom <= 0) {
            nextChangeFrom = null;
          } else if (numericChangeFrom <= totalPrice) {
            return res.status(400).json({ ok: false, error: "BAD_CHANGE_FROM" });
          } else {
            nextChangeFrom = numericChangeFrom;
          }
        }
      }

      const [result] = await db.query(
        `UPDATE order_orders
         SET is_paid=?,
             payment_id=?,
             change_from=?
         WHERE tenant_id=? AND store_id=? AND id=? AND is_active=1`,
        [isPaidRaw, nextPaymentId, nextChangeFrom, tenantId, storeId, id]
      );
      if (!Number(result?.affectedRows || 0)) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      if (ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.json({ ok: true, data: payload });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // ---------------------------
  // create refund
  // ---------------------------
  // POST /api/admin/orders/:id/refunds
  router.post("/:id/refunds", async (req, res) => {
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
      await ensureRefundTables();
      const tenantId = helpers.getTenantId(req);
      const storeId = helpers.getStoreId(req);
      const id = Number(req.params.id);
      const paymentCode = String(req.body?.payment_code || "").trim();
      const comment = helpers.strOrNull(req.body?.comment);
      const itemsInput = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!Number.isFinite(id) || id <= 0) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_ID" });
      }
      if (!paymentCode) {
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      }

      await conn.beginTransaction();
      transactionStarted = true;

      const [orderRows] = await conn.query(
        `
        SELECT
          o.id,
          o.items,
          o.total_price,
          o.delivery_cost,
          o.is_paid
        FROM order_orders o
        WHERE o.tenant_id=? AND o.store_id=? AND o.id=? AND o.is_active=1
        LIMIT 1
        FOR UPDATE
        `,
        [tenantId, storeId, id]
      );
      if (!orderRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }

      const orderRow = orderRows[0] || {};
      let items = [];
      try {
        const parsed = orderRow.items ? JSON.parse(orderRow.items) : [];
        if (Array.isArray(parsed)) items = parsed;
      } catch {}

      const [paymentRows] = await conn.query(
        `
        SELECT id, code, title, icon
        FROM order_payments
        WHERE tenant_id=? AND store_id=? AND code=? AND is_active=1
        LIMIT 1
        `,
        [tenantId, storeId, paymentCode]
      );
      if (!paymentRows.length) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(400).json({ ok: false, error: "BAD_PAYMENT_CODE" });
      }

      const refundMap = await fetchRefundRecordsMap(conn, tenantId, storeId, [id]);
      const orderForRefund = {
        id,
        items,
        total_price: roundMoney(orderRow.total_price || 0),
        delivery_cost: roundMoney(orderRow.delivery_cost || 0),
        is_paid: Number(orderRow.is_paid || 0) === 1 ? 1 : 0,
      };
      const refundPlan = buildOrderRefundState(orderForRefund, refundMap.get(id) || []);
      const plannedRefund = buildRefundPlan(orderForRefund, refundMap.get(id) || [], itemsInput);

      if (!plannedRefund.ok) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        const errorCode = String(plannedRefund.error || "BAD_REFUND_ITEMS");
        const statusCode = errorCode === "ORDER_NOT_PAID" || errorCode === "NOT_REFUNDABLE"
          ? 409
          : 400;
        return res.status(statusCode).json({ ok: false, error: errorCode, data: refundPlan });
      }

      const payment = paymentRows[0] || {};
      const actor = await resolveRefundActorSnapshot(conn, tenantId, req);
      const [refundResult] = await conn.query(
        `
        INSERT INTO order_refunds (
          tenant_id,
          store_id,
          order_id,
          payment_id,
          payment_code,
          payment_title,
          payment_icon,
          items_total,
          delivery_amount,
          total_amount,
          comment,
          is_full,
          created_by_user_id,
          created_by_name,
          created_by_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          tenantId,
          storeId,
          id,
          Number(payment.id || 0) || null,
          String(payment.code || paymentCode).trim(),
          String(payment.title || paymentCode).trim() || null,
          String(payment.icon || "").trim() || null,
          roundMoney(plannedRefund.items_total || 0),
          roundMoney(plannedRefund.delivery_amount || 0),
          roundMoney(plannedRefund.total_amount || 0),
          comment,
          Number(plannedRefund.is_full || 0) === 1 ? 1 : 0,
          actor.createdByUserId,
          actor.createdByName,
          actor.createdByEmail,
        ]
      );

      const refundId = Number(refundResult?.insertId || 0);
      if (!(refundId > 0)) {
        throw new Error("REFUND_INSERT_FAILED");
      }

      if (Array.isArray(plannedRefund.items) && plannedRefund.items.length) {
        const placeholders = plannedRefund.items.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const params = [];
        plannedRefund.items.forEach((item) => {
          params.push(
            tenantId,
            storeId,
            id,
            refundId,
            Number(item.source_item_index || 0),
            JSON.stringify(item.item_snapshot || {}),
            Number(item.refunded_qty || 0),
            roundMoney(item.unit_price || 0),
            roundMoney(item.line_amount || 0)
          );
        });
        await conn.query(
          `
          INSERT INTO order_refund_items (
            tenant_id,
            store_id,
            order_id,
            refund_id,
            source_item_index,
            item_snapshot,
            refunded_qty,
            unit_price,
            line_amount
          ) VALUES ${placeholders}
          `,
          params
        );
      }

      await conn.commit();
      transactionStarted = false;
      safeRelease();

      const payload = await fetchOrderPayload(tenantId, storeId, id);
      if (!payload) {
        return res.status(404).json({ ok: false, error: "NOT_FOUND" });
      }
      if (ordersEvents && typeof ordersEvents.publish === "function") {
        ordersEvents.publish(tenantId, storeId, "order.updated", payload);
      }

      res.status(201).json({ ok: true, data: payload });
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
        `SELECT id, code
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
        `SELECT id, public_id, items, status_id, stock_deducted_at, stock_document_id
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

      const orderRow = orderRows[0];
      const currentStatusId = Number(orderRow?.status_id || 0);
      let currentStatusCode = "";
      if (currentStatusId > 0) {
        const [currentStatusRows] = await conn.query(
          `SELECT code
           FROM order_statuses
           WHERE tenant_id=? AND store_id=? AND id=?
           LIMIT 1`,
          [tenantId, storeId, currentStatusId]
        );
        currentStatusCode = String(currentStatusRows[0]?.code || "").trim().toLowerCase();
      }
      const targetStatusCode = String(statusRows[0]?.code || "").trim().toLowerCase();
      const isCanceledTarget = targetStatusCode === "canceled" || targetStatusCode === "cancelled";
      if (currentStatusCode === "delivered" && isCanceledTarget) {
        await conn.rollback();
        transactionStarted = false;
        safeRelease();
        return res.status(409).json({ ok: false, error: "INVALID_STATUS_TRANSITION" });
      }

      const [tenantRows] = await conn.query(
        `SELECT order_stock_deduct_mode, order_stock_deduct_status_id
         FROM ten_tenants
         WHERE id=?
         LIMIT 1`,
        [tenantId]
      );
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
