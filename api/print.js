const express = require("express");
const { buildOrderRefundState } = require("./helpers/orderRefunds");

module.exports = function makePrintApiRouter({ db, helpers }) {
  const router = express.Router();
  const HTML_JOB_PREFIX = "__HTML_BASE64__:";

  function encodeHtmlJobPayload(html) {
    const rawHtml = String(html || "");
    if (!rawHtml.trim()) return "";
    return `${HTML_JOB_PREFIX}${Buffer.from(rawHtml, "utf-8").toString("base64")}`;
  }

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
    if (rows.length) {
      return Number(rows[0].id);
    }

    const [rowsByTitle] = await db.query(
      "SELECT id FROM order_statuses WHERE tenant_id=? AND store_id=? AND is_active=1 AND title LIKE ? ORDER BY sort ASC, id ASC LIMIT 1",
      [tenantId, storeId, "%Нов%"]
    );
    if (rowsByTitle.length) {
      return Number(rowsByTitle[0].id);
    }
    return null;
  }

  async function resolveToken(token) {
    let rows;
    try {
      [rows] = await db.query(
        `SELECT
           id, tenant_id, store_id, is_active,
           notify_new_order_enabled, notify_new_message_enabled,
           sound_new_order_url, sound_new_message_url
         FROM print_api_tokens
         WHERE token=? LIMIT 1`,
        [token]
      );
    } catch (err) {
      if (String(err?.code || "") !== "ER_BAD_FIELD_ERROR") throw err;
      const [legacyRows] = await db.query(
        "SELECT id, tenant_id, store_id, is_active FROM print_api_tokens WHERE token=? LIMIT 1",
        [token]
      );
      rows = (legacyRows || []).map((row) => ({
        ...row,
        notify_new_order_enabled: 1,
        notify_new_message_enabled: 1,
        sound_new_order_url: null,
        sound_new_message_url: null
      }));
    }
    if (!rows.length) return null;
    const row = rows[0];
    if (!Number(row.is_active)) return null;
    return row;
  }

  async function touchTokenUsage(tokenId) {
    if (!tokenId) return;
    await db.query(
      "UPDATE print_api_tokens SET last_used_at=NOW() WHERE id=?",
      [tokenId]
    );
  }

  async function getStoreClock(tenantId, storeId) {
    const timezone = await getStoreTimezone(tenantId, storeId);
    const offsetMinutes = helpers.parseTimezoneOffsetToMinutes(timezone ?? "+0");
    const shiftedNowMs = Date.now() + offsetMinutes * 60 * 1000;
    return {
      timezone,
      nowSql: helpers.formatUtcDateTime(shiftedNowMs),
      staleBeforeSql: helpers.formatUtcDateTime(shiftedNowMs - 5 * 60 * 1000),
    };
  }

  async function fetchRefundRecordsForOrder(tenantId, storeId, orderId, storeTimezone) {
    if (!(Number(tenantId) > 0) || !(Number(storeId) > 0) || !(Number(orderId) > 0)) return [];
    try {
      const [rows] = await db.query(
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
        WHERE r.tenant_id=? AND r.store_id=? AND r.order_id=?
        ORDER BY r.created_at DESC, r.id DESC, ri.id ASC
        `,
        [tenantId, storeId, orderId]
      );

      const refunds = [];
      for (const row of rows) {
        const refundId = Number(row?.refund_id || 0);
        if (!(refundId > 0)) continue;
        let refund = refunds.find((item) => Number(item?.id || 0) === refundId) || null;
        if (!refund) {
          refund = {
            id: refundId,
            order_id: Number(row?.order_id || 0) || null,
            payment_id: Number(row?.payment_id || 0) || null,
            payment_code: row?.payment_code || null,
            payment_title: row?.payment_title || null,
            payment_icon: row?.payment_icon || null,
            items_total: Number(row?.items_total || 0) || 0,
            delivery_amount: Number(row?.delivery_amount || 0) || 0,
            total_amount: Number(row?.total_amount || 0) || 0,
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
          refunds.push(refund);
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
          refunded_qty: Number(row?.refunded_qty || 0) || 0,
          unit_price: Number(row?.unit_price || 0) || 0,
          line_amount: Number(row?.line_amount || 0) || 0,
          item_snapshot: itemSnapshot,
        });
      }

      return refunds;
    } catch (err) {
      if (String(err?.code || "") === "ER_NO_SUCH_TABLE") return [];
      throw err;
    }
  }

  function hasOrderRefunds(order) {
    const refundedTotal = Number(order?.refunded_total || 0) || 0;
    const refundsCount = Number(order?.refunds_count || 0) || 0;
    return refundedTotal > 0 || refundsCount > 0;
  }

  function getDisplayOrder(order) {
    if (!order || !hasOrderRefunds(order)) return order;
    if (!order.remaining_order || typeof order.remaining_order !== "object") return order;
    return {
      ...order,
      ...order.remaining_order,
    };
  }

  async function claimNextPrintJob(tokenRow) {
    const tenantId = Number(tokenRow.tenant_id);
    const storeId = Number(tokenRow.store_id);
    const tokenId = Number(tokenRow.id);
    const storeClock = await getStoreClock(tenantId, storeId);
    const staleBeforeSql = storeClock.staleBeforeSql || helpers.formatUtcDateTime(Date.now() - 5 * 60 * 1000);
    const nowSql = storeClock.nowSql || helpers.formatUtcDateTime(Date.now());
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query(
        `
        SELECT id, order_id, public_id, job_name, pdf_base64, attempts
        FROM print_jobs
        WHERE tenant_id=? AND store_id=? AND token_id=?
          AND (
            status='pending'
            OR (status='processing' AND locked_at < ?)
          )
        ORDER BY created_at ASC, id ASC
        LIMIT 1
        FOR UPDATE
        `,
        [tenantId, storeId, tokenId, staleBeforeSql]
      );

      if (!rows.length) {
        await conn.commit();
        return null;
      }

      const job = rows[0];
      await conn.query(
        `
        UPDATE print_jobs
        SET status='processing', attempts=attempts+1, locked_at=?, last_error=NULL, updated_at=?
        WHERE id=?
        `,
        [nowSql, nowSql, job.id]
      );
      await conn.commit();
      return {
        ...job,
        attempts: Number(job.attempts || 0) + 1
      };
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      conn.release();
    }
  }

  function toDateKey(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  async function buildOrderTemplateHtml(tenantId, storeId, orderId) {
    if (!Number.isFinite(Number(tenantId)) || !Number.isFinite(Number(storeId)) || !Number.isFinite(Number(orderId))) {
      return null;
    }

    const [orderRows] = await db.query(
      `
      SELECT
        o.id, o.public_id,
        DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
        o.customer_id, o.customer_name, o.customer_phone,
        o.address, o.comment, o.address_comment, o.cutlery_qty,
        o.change_from, o.total_price, o.delivery_cost,
        o.discount_amount, o.discounts_json, o.items,
        DATE_FORMAT(o.scheduled_at, '%Y-%m-%d %H:%i:%s') AS scheduled_at,
        o.delivery_type_id, o.payment_id, o.time_option_id, o.status_id,
        o.pickup_store_id,

        s.code AS statusCode, s.title AS statusTitle,
        p.code AS paymentCode, p.title AS paymentTitle,
        m.code AS methodCode, m.title AS methodTitle,
        t.code AS timeOptionCode, t.title AS timeOptionTitle,
        c.telegram_user_id AS customerTelegramId,
        ps.name AS pickupStoreName, ps.address AS pickupStoreAddress,
        ca.comment AS address_comment_from_cust
      FROM order_orders o
      LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
      LEFT JOIN order_payments p ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
      LEFT JOIN order_delivery_types m ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
      LEFT JOIN order_time_options t ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
      LEFT JOIN cust_customers c ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
      LEFT JOIN ten_stores ps ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
      LEFT JOIN cust_customer_addresses ca ON ca.tenant_id=o.tenant_id AND ca.id=o.delivery_address_id AND ca.is_active=1
      WHERE o.tenant_id=? AND o.store_id=? AND o.id=? LIMIT 1
      `,
      [tenantId, storeId, orderId]
    );

    if (!orderRows.length) {
      return null;
    }

    const order = orderRows[0];

    let items = [];
    try {
      const parsed = order.items ? JSON.parse(order.items) : [];
      if (Array.isArray(parsed)) items = parsed;
    } catch {}

    let discountsJson = [];
    try {
      const parsed = order.discounts_json ? JSON.parse(order.discounts_json) : [];
      if (Array.isArray(parsed)) discountsJson = parsed;
    } catch {}

    order.items = items;
    order.discounts_json = discountsJson;
    const storeTimezone = await getStoreTimezone(tenantId, storeId);
    order.created_at = helpers.utcToStoreDateTime(order.created_at, storeTimezone) || order.created_at;
    order.scheduled_at = normalizeScheduledAtForPrint(order, storeTimezone) || order.scheduled_at;
    order.address_comment = (order.address_comment && String(order.address_comment).trim())
      ? order.address_comment
      : (order.address_comment_from_cust && String(order.address_comment_from_cust).trim())
        ? order.address_comment_from_cust
        : null;
    order.payment_title = order.paymentTitle ?? null;
    order.payment_code = order.paymentCode ?? null;
    order.method_title = order.methodTitle ?? null;
    order.method_code = order.methodCode ?? null;
    order.time_option_title = order.timeOptionTitle ?? null;
    order.time_option_code = order.timeOptionCode ?? null;
    order.pickup_store_name = order.pickupStoreName ?? null;
    order.pickup_store_address = order.pickupStoreAddress ?? null;
    Object.assign(
      order,
      buildOrderRefundState(
        order,
        await fetchRefundRecordsForOrder(tenantId, storeId, orderId, storeTimezone)
      )
    );

    return generateReceiptHtmlForOrder(order, storeTimezone);
  }

  function parseLocalDate(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const match = raw.match(
      /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
    );
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = Number(match[4]);
      const minute = Number(match[5]);
      const second = Number(match[6] || 0);
      const date = new Date(year, month - 1, day, hour, minute, second, 0);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    const fallback = new Date(raw.replace(" ", "T"));
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  function formatTime(value) {
    const date = parseLocalDate(value);
    if (!date) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function formatDateTime(value) {
    const date = parseLocalDate(value);
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = date.getMonth();
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const monthNames = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
    return `${day} ${monthNames[month]} ${year}, ${hours}:${minutes}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });
  function money(v) {
    const n = Number(v || 0);
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function getStoreDateNow(timezone) {
    const now = new Date();
    const localOffsetMinutes = -now.getTimezoneOffset();
    const storeOffsetMinutes = helpers.parseTimezoneOffsetToMinutes(timezone ?? "+0");
    const shiftMinutes = storeOffsetMinutes - localOffsetMinutes;
    return new Date(now.getTime() + shiftMinutes * 60 * 1000);
  }

  function formatScheduleText(order, timezone, { includeTitle = true } = {}) {
    if (!order) return "";
    const title = String(order.time_option_title || "").trim();
    const scheduledAt = order.scheduled_at;
    if (!scheduledAt) return includeTitle ? title : "";

    const date = parseLocalDate(scheduledAt);
    if (!date) return includeTitle ? title : "";

    const code = String(order.time_option_code || "").trim();
    const storeNow = getStoreDateNow(timezone ?? "+0");
    const isToday = toDateKey(date) === toDateKey(storeNow);
    const showDate = code === "on_date" ? true : code === "at_time" ? false : !isToday;
    const valueText = showDate ? formatDateTime(scheduledAt) : formatTime(scheduledAt);
    if (!valueText) return includeTitle ? title : "";
    if (includeTitle && title) return `${title}: ${valueText}`;
    return valueText;
  }

  function normalizeScheduledAtForPrint(order, timezone) {
    if (!order) return "";
    const rawValue = String(order.scheduled_at || "").trim();
    if (!rawValue) return "";

    const optionCode = String(order.time_option_code || "").trim().toLowerCase();
    if (optionCode !== "at_time") return rawValue;

    const created = parseLocalDate(order.created_at);
    const scheduledRaw = parseLocalDate(rawValue);
    if (!created || !scheduledRaw) return rawValue;

    // If "at_time" is already not earlier than created_at, keep as-is.
    const diffRawMinutes = Math.round((scheduledRaw.getTime() - created.getTime()) / 60000);
    if (diffRawMinutes >= -30) return rawValue;

    // Try interpreting scheduled_at as UTC and shift to store timezone.
    const shiftedValue = helpers.utcToStoreDateTime(rawValue, timezone ?? "+0");
    if (!shiftedValue || shiftedValue === rawValue) return rawValue;
    const scheduledShifted = parseLocalDate(shiftedValue);
    if (!scheduledShifted) return rawValue;

    const diffShiftedMinutes = Math.round((scheduledShifted.getTime() - created.getTime()) / 60000);
    if (diffShiftedMinutes >= -30) {
      return shiftedValue;
    }
    return rawValue;
  }

  function roundMoney(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function getOrderItemLineTotal(item) {
    const lineTotal = Number(item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(lineTotal)) return roundMoney(lineTotal);
    const unitPrice = Number(item?.price || 0);
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    return roundMoney(unitPrice * qty);
  }

  function parseOrderDiscountsJson(order) {
    const raw = order?.discounts_json;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function isAutoAddItem(item) {
    if (Number(item?.auto_add || 0) === 1) return true;
    const name = String(item?.product_name || item?.name || "").trim().toLowerCase();
    return name === "приборы";
  }

  function buildOrderDiscountSummary(order) {
    const orderTotal = roundMoney(Number(order?.total_price || 0));
    const deliveryCost = roundMoney(Number(order?.delivery_cost || 0));
    const items = Array.isArray(order?.items) ? order.items : [];
    const discountsList = parseOrderDiscountsJson(order);

    let itemsTotalAfterItemDiscounts = 0;
    let comboDiscount = 0;
    let productDiscount = 0;
    let autoAddDiscount = 0;

    items.forEach((item) => {
      const lineTotal = getOrderItemLineTotal(item);
      itemsTotalAfterItemDiscounts += lineTotal;

      let originalLineTotal = lineTotal;
      const comboOldLineTotal = Number(item?.old_line_total || 0);
      const discountOriginalLineTotal = Number(item?.discount?.original_line_total || 0);
      const oldPrice = Number(item?.old_price || 0);
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const oldPriceLineTotal = oldPrice > 0 ? roundMoney(oldPrice * qty) : 0;

      if (String(item?.type || "") === "combo" && comboOldLineTotal > lineTotal) {
        originalLineTotal = comboOldLineTotal;
      } else if (discountOriginalLineTotal > lineTotal) {
        originalLineTotal = discountOriginalLineTotal;
      } else if (oldPriceLineTotal > lineTotal) {
        originalLineTotal = oldPriceLineTotal;
      }

      const lineDiscount = roundMoney(Math.max(0, originalLineTotal - lineTotal));
      if (!(lineDiscount > 0)) return;

      if (String(item?.type || "") === "combo") {
        comboDiscount += lineDiscount;
      } else if (isAutoAddItem(item)) {
        autoAddDiscount += lineDiscount;
      } else {
        productDiscount += lineDiscount;
      }
    });

    comboDiscount = roundMoney(comboDiscount);
    productDiscount = roundMoney(productDiscount);
    autoAddDiscount = roundMoney(autoAddDiscount);

    const itemsPayableAfterAllDiscounts = roundMoney(Math.max(0, orderTotal - deliveryCost));
    const customerOrderDiscount = roundMoney(Math.max(0, itemsTotalAfterItemDiscounts - itemsPayableAfterAllDiscounts));
    const itemLevelDiscount = roundMoney(comboDiscount + productDiscount + autoAddDiscount);
    const calculatedDiscount = roundMoney(itemLevelDiscount + customerOrderDiscount);
    const storedDiscount = roundMoney(Math.max(0, Number(order?.discount_amount || 0)));
    const totalDiscount = storedDiscount > calculatedDiscount ? storedDiscount : calculatedDiscount;
    const subtotalBeforeDiscount = roundMoney(itemsPayableAfterAllDiscounts + totalDiscount);

    const breakdown = [
      { title: "Комбо", amount: comboDiscount },
      { title: "Товарные скидки", amount: productDiscount },
      { title: "Автодобавление", amount: autoAddDiscount },
      { title: "Клиентская скидка", amount: customerOrderDiscount },
    ].filter((entry) => Number(entry.amount || 0) > 0);

    const breakdownTotal = roundMoney(
      breakdown.reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
    );
    const otherDiscount = roundMoney(Math.max(0, totalDiscount - breakdownTotal));
    if (otherDiscount > 0) breakdown.push({ title: "Прочие скидки", amount: otherDiscount });

    const orderDiscountTitles = [];
    discountsList.forEach((entry) => {
      if (String(entry?.apply_to || "").toLowerCase() !== "order") return;
      const title = String(entry?.title || "").trim();
      if (title && !orderDiscountTitles.includes(title)) orderDiscountTitles.push(title);
    });

    return {
      subtotalBeforeDiscount,
      totalDiscount,
      breakdown,
      orderDiscountTitles,
    };
  }

  // GET /api/print/token-info - РїСЂРѕРІРµСЂРєР° С‚РѕРєРµРЅР° Рё РёРЅС„РѕСЂРјР°С†РёСЏ Рѕ С‚РѕС‡РєРµ
  router.get("/token-info", async (req, res) => {
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
      const [stores] = await db.query(
        "SELECT name FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1",
        [tenantId, storeId]
      );
      const storeName = stores[0]?.name || `Филиал #${storeId}`;
      let tenantSoundNewOrder = null;
      let tenantSoundNewMessage = null;
      try {
        const [tenantRows] = await db.query(
          "SELECT sound_new_order_url, sound_new_message_url FROM ten_tenants WHERE id=? LIMIT 1",
          [tenantId]
        );
        tenantSoundNewOrder = tenantRows?.[0]?.sound_new_order_url || null;
        tenantSoundNewMessage = tenantRows?.[0]?.sound_new_message_url || null;
      } catch {}

      res.json({
        ok: true,
        data: {
          tenant_id: tenantId,
          store_id: storeId,
          store_name: storeName,
          notifications: {
            new_order_enabled: Number(tokenRow.notify_new_order_enabled || 0) === 1,
            new_message_enabled: Number(tokenRow.notify_new_message_enabled || 0) === 1,
            sound_new_order_url: tokenRow.sound_new_order_url || tenantSoundNewOrder || null,
            sound_new_message_url: tokenRow.sound_new_message_url || tenantSoundNewMessage || null
          }
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // POST /api/print/agent/heartbeat - СЃРѕСЃС‚РѕСЏРЅРёРµ Р»РѕРєР°Р»СЊРЅРѕРіРѕ Р°РіРµРЅС‚Р° РїРµС‡Р°С‚Рё
  router.post("/agent/heartbeat", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const printerNameRaw = req.body?.printer_name;
      const printerOnlineRaw = req.body?.printer_online;
      const agentNameRaw = req.body?.agent_name;
      const agentVersionRaw = req.body?.agent_version;
      const runningRaw = req.body?.running;

      const printerName = printerNameRaw == null ? null : String(printerNameRaw).trim().slice(0, 255);
      const printerOnline = printerOnlineRaw === true || printerOnlineRaw === "true" || printerOnlineRaw === 1 || printerOnlineRaw === "1" ? 1 : 0;
      const agentName = agentNameRaw == null ? null : String(agentNameRaw).trim().slice(0, 255);
      const agentVersion = agentVersionRaw == null ? null : String(agentVersionRaw).trim().slice(0, 64);
      let running = runningRaw === false || runningRaw === "false" || runningRaw === 0 || runningRaw === "0" ? 0 : 1;
      if (printerOnlineRaw !== undefined && printerOnlineRaw !== null) {
        running = printerOnline;
      }

      await db.query(
        `
        UPDATE print_api_tokens
        SET
          printer_name=?,
          agent_name=?,
          agent_version=?,
          last_heartbeat_at=NOW(),
          last_used_at=NOW(),
          agent_running=?
        WHERE id=? AND tenant_id=? AND store_id=?
        `,
        [
          printerName || null,
          agentName || null,
          agentVersion || null,
          running,
          Number(tokenRow.id),
          Number(tokenRow.tenant_id),
          Number(tokenRow.store_id)
        ]
      );

      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/jobs/next - РїРѕР»СѓС‡РёС‚СЊ СЃР»РµРґСѓСЋС‰СѓСЋ Р·Р°РґР°С‡Сѓ РїРµС‡Р°С‚Рё
  router.get("/jobs/next", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const job = await claimNextPrintJob(tokenRow);
      await touchTokenUsage(tokenRow.id);

      if (!job) {
        return res.json({ ok: true, data: null });
      }

      let jobPayload = job.pdf_base64 || "";
      const jobOrderId = Number(job.order_id || 0);
      if (jobOrderId > 0 && String(jobPayload).startsWith(HTML_JOB_PREFIX)) {
        const freshHtml = await buildOrderTemplateHtml(
          Number(tokenRow.tenant_id),
          Number(tokenRow.store_id),
          jobOrderId
        );
        const freshPayload = encodeHtmlJobPayload(freshHtml);
        if (freshPayload) {
          jobPayload = freshPayload;
          if (freshPayload !== String(job.pdf_base64 || "")) {
            const storeClock = await getStoreClock(Number(tokenRow.tenant_id), Number(tokenRow.store_id));
            const nowSql = storeClock.nowSql || helpers.formatUtcDateTime(Date.now());
            await db.query(
              `
              UPDATE print_jobs
              SET pdf_base64=?, updated_at=?
              WHERE id=? AND tenant_id=? AND store_id=? AND token_id=?
              `,
              [
                freshPayload,
                nowSql,
                Number(job.id),
                Number(tokenRow.tenant_id),
                Number(tokenRow.store_id),
                Number(tokenRow.id)
              ]
            );
          }
        }
      }

      return res.json({
        ok: true,
        data: {
          job_id: Number(job.id),
          job_name: job.job_name || "CRM Receipt",
          attempts: Number(job.attempts || 0),
          order: {
            id: Number(job.order_id || 0) || null,
            public_id: job.public_id || null
          },
          pdf_base64: jobPayload
        }
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // POST /api/print/jobs/:id/ack - РїРѕРґС‚РІРµСЂР¶РґРµРЅРёРµ СѓСЃРїРµС€РЅРѕР№ РїРµС‡Р°С‚Рё
  // GET /api/print/messages/next?after_id=123 - СЃРѕР±С‹С‚РёРµ РЅРѕРІРѕРіРѕ РІС…РѕРґСЏС‰РµРіРѕ СЃРѕРѕР±С‰РµРЅРёСЏ С‡Р°С‚Р°
  router.get("/messages/next", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const afterId = Number(req.query.after_id || 0);
      const safeAfterId = Number.isFinite(afterId) && afterId > 0 ? afterId : 0;
      let rows = [];
      try {
        [rows] = await db.query(
          `
          SELECT id, client_id, text, created_at
          FROM chat_messages
          WHERE tenant_id=? AND direction='in' AND id > ?
          ORDER BY id ASC
          LIMIT 1
          `,
          [Number(tokenRow.tenant_id), safeAfterId]
        );
      } catch (err) {
        if (String(err?.code || "") === "ER_NO_SUCH_TABLE") {
          await touchTokenUsage(tokenRow.id);
          return res.json({ ok: true, data: null });
        }
        throw err;
      }

      await touchTokenUsage(tokenRow.id);

      if (!rows.length) {
        return res.json({ ok: true, data: null });
      }

      const row = rows[0] || {};
      return res.json({
        ok: true,
        data: {
          id: Number(row.id || 0) || null,
          client_id: Number(row.client_id || 0) || null,
          text: String(row.text || "").slice(0, 500),
          created_at: row.created_at || null
        }
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/poll?after_message_id=123
  // Единый polling канал: одновременно возвращает задачу печати и событие нового сообщения.
  router.get("/poll", async (req, res) => {
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

      const job = await claimNextPrintJob(tokenRow);
      let jobData = null;
      if (job) {
        let jobPayload = job.pdf_base64 || "";
        const jobOrderId = Number(job.order_id || 0);
        if (jobOrderId > 0 && String(jobPayload).startsWith(HTML_JOB_PREFIX)) {
          const freshHtml = await buildOrderTemplateHtml(tenantId, storeId, jobOrderId);
          const freshPayload = encodeHtmlJobPayload(freshHtml);
          if (freshPayload) {
            jobPayload = freshPayload;
            if (freshPayload !== String(job.pdf_base64 || "")) {
              const storeClock = await getStoreClock(tenantId, storeId);
              const nowSql = storeClock.nowSql || helpers.formatUtcDateTime(Date.now());
              await db.query(
                `
                UPDATE print_jobs
                SET pdf_base64=?, updated_at=?
                WHERE id=? AND tenant_id=? AND store_id=? AND token_id=?
                `,
                [freshPayload, nowSql, Number(job.id), tenantId, storeId, Number(tokenRow.id)]
              );
            }
          }
        }
        jobData = {
          job_id: Number(job.id),
          job_name: job.job_name || "CRM Receipt",
          attempts: Number(job.attempts || 0),
          order: {
            id: Number(job.order_id || 0) || null,
            public_id: job.public_id || null
          },
          pdf_base64: jobPayload
        };
      }

      const rawAfterMessageId = Number(req.query.after_message_id ?? req.query.after_id ?? 0);
      const initCursorMode = Number.isFinite(rawAfterMessageId) && rawAfterMessageId < 0;
      const afterMessageId = Number.isFinite(rawAfterMessageId) && rawAfterMessageId > 0 ? rawAfterMessageId : 0;

      let messageEvent = null;
      let messageCursor = afterMessageId;
      try {
        if (initCursorMode) {
          const [cursorRows] = await db.query(
            "SELECT MAX(id) AS last_id FROM chat_messages WHERE tenant_id=? AND direction='in'",
            [tenantId]
          );
          messageCursor = Number(cursorRows?.[0]?.last_id || 0) || 0;
        } else {
          const [rows] = await db.query(
            `
            SELECT id, client_id, text, created_at
            FROM chat_messages
            WHERE tenant_id=? AND direction='in' AND id > ?
            ORDER BY id ASC
            LIMIT 1
            `,
            [tenantId, afterMessageId]
          );
          if (rows.length) {
            const row = rows[0] || {};
            const eventId = Number(row.id || 0) || 0;
            messageCursor = eventId > 0 ? eventId : afterMessageId;
            messageEvent = {
              id: eventId || null,
              client_id: Number(row.client_id || 0) || null,
              text: String(row.text || "").slice(0, 500),
              created_at: row.created_at || null
            };
          }
        }
      } catch (err) {
        if (String(err?.code || "") !== "ER_NO_SUCH_TABLE") throw err;
      }

      await touchTokenUsage(tokenRow.id);
      return res.json({
        ok: true,
        data: {
          job: jobData,
          message_event: messageEvent,
          message_cursor: messageCursor
        }
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/jobs/cursor - С‚РµРєСѓС‰РёР№ РєСѓСЂСЃРѕСЂ Р·Р°РґР°С‡ РїРµС‡Р°С‚Рё (Р±РµР· РІС‹РґР°С‡Рё Р·Р°РґР°РЅРёСЏ)
  router.get("/jobs/cursor", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const [rows] = await db.query(
        `
        SELECT MAX(id) AS last_id
        FROM print_jobs
        WHERE tenant_id=? AND store_id=? AND token_id=?
        `,
        [Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
      );
      const lastId = Number(rows?.[0]?.last_id || 0) || 0;
      await touchTokenUsage(tokenRow.id);
      return res.json({ ok: true, data: { last_id: lastId } });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/messages/cursor - С‚РµРєСѓС‰РёР№ РєСѓСЂСЃРѕСЂ РІС…РѕРґСЏС‰РёС… СЃРѕРѕР±С‰РµРЅРёР№ С‡Р°С‚Р° (Р±РµР· РІС‹РґР°С‡Рё СЃРѕР±С‹С‚РёСЏ)
  router.get("/messages/cursor", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      let lastId = 0;
      try {
        const [rows] = await db.query(
          `
          SELECT MAX(id) AS last_id
          FROM chat_messages
          WHERE tenant_id=? AND direction='in'
          `,
          [Number(tokenRow.tenant_id)]
        );
        lastId = Number(rows?.[0]?.last_id || 0) || 0;
      } catch (err) {
        if (String(err?.code || "") !== "ER_NO_SUCH_TABLE") throw err;
      }

      await touchTokenUsage(tokenRow.id);
      return res.json({ ok: true, data: { last_id: lastId } });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  router.post("/jobs/:id/ack", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_JOB_ID" });
      }
      const storeClock = await getStoreClock(Number(tokenRow.tenant_id), Number(tokenRow.store_id));
      const nowSql = storeClock.nowSql || helpers.formatUtcDateTime(Date.now());

      const [result] = await db.query(
        `
        UPDATE print_jobs
        SET status='done', locked_at=NULL, acked_at=?, last_error=NULL, updated_at=?
        WHERE id=? AND tenant_id=? AND store_id=? AND token_id=? AND status='processing'
        `,
        [nowSql, nowSql, jobId, Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
      );

      if (!Number(result.affectedRows || 0)) {
        const [rows] = await db.query(
          `
          SELECT status
          FROM print_jobs
          WHERE id=? AND tenant_id=? AND store_id=? AND token_id=?
          LIMIT 1
          `,
          [jobId, Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });
        }
        if (rows[0].status !== "done") {
          return res.status(409).json({ ok: false, error: "JOB_NOT_IN_PROCESSING" });
        }
      }

      await touchTokenUsage(tokenRow.id);
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // POST /api/print/jobs/:id/fail - РѕС€РёР±РєР° РїРµС‡Р°С‚Рё
  router.post("/jobs/:id/fail", async (req, res) => {
    try {
      const apiKey = req.get("X-Api-Key") || req.headers["x-api-key"];
      if (!apiKey) {
        return res.status(401).json({ ok: false, error: "API_KEY_REQUIRED" });
      }

      const tokenRow = await resolveToken(String(apiKey).trim());
      if (!tokenRow) {
        return res.status(403).json({ ok: false, error: "API_KEY_INVALID" });
      }

      const jobId = Number(req.params.id);
      if (!Number.isFinite(jobId) || jobId <= 0) {
        return res.status(400).json({ ok: false, error: "BAD_JOB_ID" });
      }
      const storeClock = await getStoreClock(Number(tokenRow.tenant_id), Number(tokenRow.store_id));
      const nowSql = storeClock.nowSql || helpers.formatUtcDateTime(Date.now());

      const errorText = String(req.body?.error || "PRINT_FAILED").slice(0, 2000);
      const [result] = await db.query(
        `
        UPDATE print_jobs
        SET
          status=CASE WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
          locked_at=NULL,
          last_error=?,
          updated_at=?
        WHERE id=? AND tenant_id=? AND store_id=? AND token_id=? AND status='processing'
        `,
        [errorText, nowSql, jobId, Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
      );

      if (!Number(result.affectedRows || 0)) {
        const [rows] = await db.query(
          `
          SELECT status, attempts
          FROM print_jobs
          WHERE id=? AND tenant_id=? AND store_id=? AND token_id=?
          LIMIT 1
          `,
          [jobId, Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
        );
        if (!rows.length) {
          return res.status(404).json({ ok: false, error: "JOB_NOT_FOUND" });
        }
        return res.status(409).json({
          ok: false,
          error: "JOB_NOT_IN_PROCESSING",
          data: { status: rows[0].status, attempts: Number(rows[0].attempts || 0) }
        });
      }

      const [rows] = await db.query(
        `
        SELECT status, attempts
        FROM print_jobs
        WHERE id=? AND tenant_id=? AND store_id=? AND token_id=?
        LIMIT 1
        `,
        [jobId, Number(tokenRow.tenant_id), Number(tokenRow.store_id), Number(tokenRow.id)]
      );

      await touchTokenUsage(tokenRow.id);
      return res.json({
        ok: true,
        data: {
          status: rows[0]?.status || null,
          attempts: Number(rows[0]?.attempts || 0)
        }
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/template/:orderId - РїРѕР»СѓС‡РёС‚СЊ С€Р°Р±Р»РѕРЅ РїРµС‡Р°С‚Рё РґР»СЏ Р·Р°РєР°Р·Р°
  router.get("/template/:orderId", async (req, res) => {
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
      const orderId = Number(req.params.orderId);
      const html = await buildOrderTemplateHtml(tenantId, storeId, orderId);
      if (!html) {
        return res.json({ ok: true, data: null });
      }

      res.json({
        ok: true,
        data: { html }
      });
    } catch (e) {
      console.error(`[PRINT API] Error fetching template for order ${req.params.orderId}:`, e.message);
      console.error(e.stack);
      res.status(500).json({ ok: false, error: "DB_ERROR", message: e.message });
    }
  });

  function generateReceiptHtmlForOrder(order, storeTimezone) {
    try {
      const receiptOrder = getDisplayOrder(order) || order;
      const hasRefunds = hasOrderRefunds(order);
      const createdAtRaw = String(receiptOrder.created_at || "");
      const createdAtDate = parseLocalDate(createdAtRaw);
      const day = createdAtDate ? String(createdAtDate.getDate()).padStart(2, "0") : "";
      const month = createdAtDate ? String(createdAtDate.getMonth() + 1).padStart(2, "0") : "";
      const year = createdAtDate ? createdAtDate.getFullYear() : "";
      const hours = createdAtDate ? String(createdAtDate.getHours()).padStart(2, "0") : "";
      const minutes = createdAtDate ? String(createdAtDate.getMinutes()).padStart(2, "0") : "";
      const dateStr = createdAtDate ? `${day}.${month}.${year}, ${hours}:${minutes}` : createdAtRaw;

      const methodTitle = receiptOrder.method_title || (receiptOrder.method_code === "pickup" ? "Самовывоз" : "Доставка");
      let address = receiptOrder.address;
      if (!address && receiptOrder.pickup_store_address) {
        address = receiptOrder.pickup_store_name
          ? `${receiptOrder.pickup_store_name}, ${receiptOrder.pickup_store_address}`
          : receiptOrder.pickup_store_address;
      }
      const isUrgent = receiptOrder.is_urgent || receiptOrder.urgent || receiptOrder.time_option_code === "urgent";
      const total = parseFloat(receiptOrder.total_price || receiptOrder.total || 0);
      const deliveryCost = Number(receiptOrder.delivery_cost || 0);
      const changeFromRaw = receiptOrder.change_from;
      const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
      const paymentTitle = receiptOrder.payment_method_title || receiptOrder.payment_title || "";
      const changeAmount = Math.max(0, changeFrom - total);
      const showChange = !hasRefunds && changeAmount > 0;
      const scheduleText = formatScheduleText(receiptOrder, storeTimezone, { includeTitle: true });

      function receiptTotalStr(val) {
        const n = Number(val);
        if (!Number.isFinite(n)) return "";
        if (n === 0) return "";
        return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
      }

      const receiptItems = Array.isArray(receiptOrder.items) ? receiptOrder.items.slice().sort((a, b) => {
        const aAuto = isAutoAddItem(a);
        const bAuto = isAutoAddItem(b);
        if (aAuto && !bAuto) return 1;
        if (!aAuto && bAuto) return -1;
        return 0;
      }) : [];
      const comboItems = receiptItems.filter((item) => String(item?.type || "") === "combo");
      const productItems = receiptItems.filter((item) => String(item?.type || "") !== "combo");
      const itemGroups = [];
      if (comboItems.length) itemGroups.push({ key: "combo", title: "КОМБО", items: comboItems });
      if (productItems.length) itemGroups.push({ key: "product", title: "ТОВАРЫ", items: productItems });

      function mergeVariantUnit(label, unit) {
        const cleanLabel = String(label || "").trim();
        const cleanUnit = String(unit || "").trim();
        if (!cleanLabel) return cleanUnit;
        if (!cleanUnit) return cleanLabel;
        const labelLower = cleanLabel.toLowerCase();
        const unitLower = cleanUnit.toLowerCase();
        if (labelLower.endsWith(` ${unitLower}`) || labelLower === unitLower) return cleanLabel;
        return `${cleanLabel} ${cleanUnit}`.trim();
      }

      function formatQtyUnitName(qtyRaw, unitRaw, nameRaw) {
        const qtyNum = Number(qtyRaw);
        const qtyText = Number.isFinite(qtyNum)
          ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
          : String(qtyRaw ?? "").trim();
        const unitText = String(unitRaw || "").trim();
        const nameText = String(nameRaw || "").trim();
        return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
      }

      function renderLinePrice(item, fallbackTotal = 0) {
        const lineTotal = Number(item?.line_total ?? item?.total ?? item?.total_price ?? fallbackTotal);
        const oldLineTotal = Number(item?.old_line_total || item?.discount?.original_line_total || 0);
        const showOldPrice = oldLineTotal > lineTotal;
        return showOldPrice
          ? `<span class="receipt-old-price">${receiptTotalStr(oldLineTotal)}</span>${receiptTotalStr(lineTotal)}`
          : receiptTotalStr(lineTotal);
      }

      function renderComboItem(item) {
        const name = escapeHtml(item?.name || item?.combo_title || "Комбо");
        const qty = Math.max(1, Number(item?.quantity || item?.qty || 1));
        const qtyStr = `${qty} x`;
        const priceStr = renderLinePrice(item, 0);
        const selections = Array.isArray(item?.selections) ? item.selections : [];
        const compositionLines = [];

        selections.forEach((sel) => {
          const productName = String(sel?.product_name || "").trim() || "Товар";
          const variantHead = mergeVariantUnit(sel?.variant_label, sel?.variant_unit);
          const primaryLine = [variantHead, productName].filter(Boolean).join(" ").trim();
          if (primaryLine) {
            compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--group">1 x ${escapeHtml(primaryLine)}</div>`);
          }
          const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
          ingredientsDisplay.forEach((ing) => {
            const ingQty = ing?.qty ?? ing?.quantity;
            const ingNumQty = Number(ingQty);
            if (!Number.isFinite(ingNumQty) || ingNumQty <= 0) return;
            const line = formatQtyUnitName(ingQty, ing?.unit, ing?.name);
            if (!line) return;
            compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
          });
        });

        const compositionHtml = compositionLines.length
          ? `<div class="receipt-composition">${compositionLines.join("")}</div>`
          : "";

        return `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${name}</span>
              ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ""}
            </div>
            ${compositionHtml}
          </div>
        `;
      }

      function renderProductItem(item) {
        const rawName = String(item?.product_name || item?.name || "Товар").trim() || "Товар";
        const qty = Math.max(1, Number(item?.quantity || item?.qty || 1));
        const basePrice = parseFloat(item?.price || 0);
        const qtyStr = `${qty} x`;
        const priceStr = renderLinePrice(item, basePrice * qty);
        const compositionLines = [];
        const variants = Array.isArray(item?.variants) ? item.variants : [];
        variants.forEach((v) => {
          const value = String(v?.label || v?.value || "").trim();
          const unit = String(v?.unit || v?.unit_short_title || v?.unitLabel || v?.unit_title || "").trim();
          const line = mergeVariantUnit(value, unit);
          if (line) compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
        });
        const ingredients = (Array.isArray(item?.ingredients) ? item.ingredients : [])
          .filter((ing) => Number(ing?.quantity ?? ing?.qty ?? 0) > 0);
        ingredients.forEach((ing) => {
          const line = formatQtyUnitName(
            ing?.quantity ?? ing?.qty,
            ing?.unit_label || ing?.unit || ing?.unitLabel || ing?.unit_short_title || ing?.unit_title || "",
            ing?.name || "Ингредиент"
          );
          if (line) compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
        });
        const options = (Array.isArray(item?.options) ? item.options : [])
          .filter((opt) => Number(opt?.qty ?? opt?.quantity ?? 0) > 0);
        options.forEach((opt) => {
          const variant = mergeVariantUnit(opt?.variant_label || opt?.variantLabel, opt?.variant_unit || opt?.variantUnit);
          const title = String(opt?.title || "Опция").trim();
          const line = variant
            ? `${variant} ${title}`.trim()
            : `${Math.max(1, Number(opt?.qty || opt?.quantity || 1))} ${title}`.trim();
          if (line) compositionLines.push(`<div class="receipt-composition-item receipt-composition-item--sub">&bull; ${escapeHtml(line)}</div>`);
        });
        const compositionHtml = compositionLines.length
          ? `<div class="receipt-composition">${compositionLines.join("")}</div>`
          : "";
        return `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${escapeHtml(rawName)}</span>
              ${priceStr ? `<span class="receipt-item-price">${priceStr}</span>` : ""}
            </div>
            ${compositionHtml}
          </div>
        `;
      }

      let itemsHtml = "";
      if (itemGroups.length) {
        itemsHtml = itemGroups.map((group, idx) => {
          const bodyHtml = group.items
            .map((item) => group.key === "combo" ? renderComboItem(item) : renderProductItem(item))
            .join("");
          return `
            <div class="receipt-items-group receipt-items-group--${group.key}">
              <div class="receipt-items-group-title">${group.title}</div>
              <div class="receipt-items-group-list">${bodyHtml}</div>
            </div>
            ${idx < itemGroups.length - 1 ? '<div class="receipt-items-type-divider"></div>' : ''}
          `;
        }).join("");
      } else {
        itemsHtml = '<div class="receipt-empty">\u0412\u0441\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u044b.</div>';
      }

      const receiptDiscountSummary = buildOrderDiscountSummary(receiptOrder);
      const discountAmount = Number(receiptDiscountSummary.totalDiscount || 0);
      const subtotal = Number(receiptDiscountSummary.subtotalBeforeDiscount || 0);

      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек заказа #${receiptOrder.id}</title>
  <style>
    @media print {
      @page {
        size: 80mm auto;
        margin: 0;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        margin: 0;
        padding: 5mm 3mm;
        font-family: 'Courier New', monospace;
        font-size: 11pt;
        font-weight: bold;
        line-height: 1.3;
        width: 80mm;
        max-width: 80mm;
        box-sizing: border-box;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      margin: 0;
      padding: 5mm 3mm;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      font-weight: bold;
      line-height: 1.3;
      width: 80mm;
      max-width: 80mm;
      box-sizing: border-box;
      background: white;
    }
    .receipt-header {
      text-align: center;
      font-weight: bold;
      font-size: 16pt;
      margin-bottom: 10px;
    }
    .receipt-date {
      text-align: center;
      margin-bottom: 10px;
      border-bottom: 1px dashed #000;
      padding-bottom: 10px;
    }
    .receipt-section {
      margin: 10px 0;
    }
    .receipt-section-title {
      font-weight: bold;
      margin-bottom: 5px;
    }
    .receipt-items-group {
      margin: 0;
      padding: 0;
    }
    .receipt-items-group-title {
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: .2px;
      margin: 2px 0 5px;
    }
    .receipt-items-group-list {
      margin: 0;
      padding: 0 0 0 2px;
    }
    .receipt-items-type-divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .receipt-item {
      margin: 0;
      padding: 3px 0 2px;
    }
    .receipt-item + .receipt-item {
      border-top: 1px dotted #000;
      margin-top: 3px;
      padding-top: 4px;
    }
    .receipt-item-row {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .receipt-item-qty {
      flex-shrink: 0;
    }
    .receipt-item-name {
      flex: 1;
      min-width: 0;
      word-wrap: break-word;
    }
    .receipt-item-price {
      flex-shrink: 0;
      text-align: right;
    }
    .receipt-composition {
      margin: 2px 0 1px;
      font-size: 9pt;
    }
    .receipt-composition-item {
      margin: 1px 0;
      word-wrap: break-word;
    }
    .receipt-composition-item--group {
      margin-left: 8px;
    }
    .receipt-composition-item--sub {
      margin-left: 16px;
    }
    .receipt-total {
      text-align: center;
      font-weight: bold;
      font-size: 14pt;
      margin: 15px 0;
      border-top: 1px dashed #000;
      border-bottom: 1px dashed #000;
      padding: 10px 0;
    }
    .receipt-summary-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-top: 4px;
    }
    .receipt-summary-label {
      flex: 1;
    }
    .receipt-summary-value {
      flex-shrink: 0;
      text-align: right;
    }
    .receipt-urgent {
      text-align: center;
      font-weight: bold;
      color: #d00;
      margin: 10px 0;
    }
    .receipt-divider {
      border-top: 1px dashed #000;
      margin: 10px 0;
    }
    .receipt-when-block {
      font-weight: bold;
    }
    .receipt-when-text {
      font-weight: bold;
    }
    .receipt-old-price {
      text-decoration: line-through;
      margin-right: 4px;
    }
    .receipt-empty {
      text-align: center;
      padding: 8px 0;
    }
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #${receiptOrder.id}</div>
  <div class="receipt-date">${dateStr}</div>
  
  <div class="receipt-divider"></div>
  ${(scheduleText || isUrgent) ? `
  <div class="receipt-section receipt-when-block">
    <div class="receipt-when-text">${escapeHtml(scheduleText || (isUrgent ? "Быстрее" : ""))}</div>
  </div>
  <div class="receipt-divider"></div>
  ` : ""}
  
  <div class="receipt-section">
    ${receiptOrder.customer_name ? `<div>${escapeHtml(receiptOrder.customer_name)}</div>` : ""}
    ${receiptOrder.customer_phone ? `<div>${escapeHtml(receiptOrder.customer_phone)}</div>` : ""}
  </div>
  
  <div class="receipt-section">
    <div>${escapeHtml(methodTitle || "-")}</div>
    <div>${escapeHtml(address || "-")}</div>
  </div>
  
  ${(receiptOrder.address_comment && receiptOrder.address_comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(receiptOrder.address_comment)}</div>
  </div>
  ` : ""}
  ${(receiptOrder.comment && receiptOrder.comment.trim()) ? `
  <div class="receipt-section">
    <div>${escapeHtml(receiptOrder.comment)}</div>
  </div>
  ` : ""}
  
  <div class="receipt-divider"></div>
  
  <div class="receipt-section">
    ${itemsHtml}
  </div>
  
  <div class="receipt-divider"></div>

  <div class="receipt-section">
    ${paymentTitle ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Оплата</div><div class="receipt-summary-value">${escapeHtml(paymentTitle)}</div></div>` : ""}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача с</div><div class="receipt-summary-value">${money(changeFrom)}</div></div>` : ""}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача</div><div class="receipt-summary-value">${money(changeAmount)}</div></div>` : ""}
    ${discountAmount > 0 ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сумма товаров</div><div class="receipt-summary-value">${money(subtotal)}</div></div>` : ""}
    ${discountAmount > 0 ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Скидка</div><div class="receipt-summary-value">-${money(discountAmount)}</div></div>` : ""}
    <div class="receipt-summary-row"><div class="receipt-summary-label">Доставка</div><div class="receipt-summary-value">${money(deliveryCost)}</div></div>
    <div class="receipt-total">ИТОГО: ${money(total)}</div>
  </div>
  
  <div style="margin-top: 20px; text-align: center; font-size: 10pt;">
    <div>Спасибо за заказ!</div>
  </div>
</body>
</html>
    `;
    } catch (err) {
      console.error("Error in generateReceiptHtmlForOrder:", err);
      throw err;
    }
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
      
      // РџСЂРѕРІРµСЂСЏРµРј РїР°СЂР°РјРµС‚СЂ status_id РІ Р·Р°РїСЂРѕСЃРµ
      let statusId = req.query.status_id ? Number(req.query.status_id) : null;
      
      // Р•СЃР»Рё status_id РЅРµ СѓРєР°Р·Р°РЅ, РёС‰РµРј СЃС‚Р°С‚СѓСЃ РїРѕ РєРѕРґСѓ "new"
      if (!statusId) {
        statusId = await findNewStatusId(tenantId, storeId);
      }
      
      if (!statusId) {
        return res.json({ ok: true, data: [] });
      }

      const limitRaw = Number(req.query.limit || 100);
      const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 100;

      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      
      // РџРѕРґРіРѕС‚РѕРІРёРј WHERE СѓСЃР»РѕРІРёРµ РґР»СЏ С„РёР»СЊС‚СЂР°С†РёРё РїРѕ РґР°С‚Рµ
      let dateCondition = "";
      let queryParams = [tenantId, storeId, statusId];
      
      // Р•СЃР»Рё СѓРєР°Р·Р°РЅ РїР°СЂР°РјРµС‚СЂ "today", С„РёР»СЊС‚СЂСѓРµРј РЅР° Р·Р°РєР°Р·С‹ Р·Р° СЃРµРіРѕРґРЅСЏ РІ С‡Р°СЃРѕРІРѕРј РїРѕСЏСЃРµ С…СЂР°РЅРёР»РёС‰Р°
      if (req.query.today === "true" || req.query.today === "1") {
        // РџР°СЂСЃРёРј С‡Р°СЃРѕРІРѕР№ РїРѕСЏСЃ (РЅР°РїСЂРёРјРµСЂ, "+0", "+3", "-5")
        const tzMatch = String(storeTimezone).match(/^([+-]?\d+)$/);
        let tzOffset = 0;
        if (tzMatch) {
          tzOffset = parseInt(tzMatch[1]);
        }
        
        // UTC РґР°С‚Р° СЃРµР№С‡Р°СЃ
        const now = new Date();
        // Р”Р°С‚Р° РІ С‡Р°СЃРѕРІРѕРј РїРѕСЏСЃРµ С…СЂР°РЅРёР»РёС‰Р° (РґРѕР±Р°РІР»СЏРµРј СЃРјРµС‰РµРЅРёРµ)
        const offset = tzOffset * 60 * 60 * 1000;
        const storeNow = new Date(now.getTime() + offset);
        
        // РќР°С‡Р°Р»Рѕ РґРЅСЏ РІ UTC РєРѕС‚РѕСЂРѕРµ СЃРѕРѕС‚РІРµС‚СЃС‚РІСѓРµС‚ РЅР°С‡Р°Р»Сѓ РґРЅСЏ РІ С‡Р°СЃРѕРІРѕРј РїРѕСЏСЃРµ С…СЂР°РЅРёР»РёС‰Р°
        // Р”РµРЅСЊ РїРѕ UTC = Р”РµРЅСЊ РІ store timezone РјРёРЅСѓСЃ СЃРґРІРёРі
        const storeDateStr = storeNow.toISOString().split('T')[0];
        
        dateCondition = " AND DATE(o.created_at) = ?";
        queryParams.push(storeDateStr);
      } else if (req.query.start_date && req.query.end_date) {
        // Р•СЃР»Рё СѓРєР°Р·Р°РЅС‹ start_date Рё end_date
        dateCondition = " AND DATE(o.created_at) >= ? AND DATE(o.created_at) <= ?";
        queryParams.push(String(req.query.start_date));
        queryParams.push(String(req.query.end_date));
      }
      
      queryParams.push(limit);

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
        WHERE o.tenant_id=? AND o.store_id=? AND o.status_id=? AND o.is_active=1${dateCondition}
        ORDER BY o.created_at ASC, o.id ASC
        LIMIT ?
        `,
        queryParams
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


