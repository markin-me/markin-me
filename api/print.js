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
    const [rows] = await db.query(
      "SELECT id, tenant_id, store_id, is_active FROM print_api_tokens WHERE token=? LIMIT 1",
      [token]
    );
    if (!rows.length) return null;
    const row = rows[0];
    if (!Number(row.is_active)) return null;
    return row;
  }

  function parseScheduleDate(value) {
    if (value instanceof Date) {
      return Number.isFinite(value.getTime()) ? value : null;
    }
    if (value === undefined || value === null) {
      return null;
    }
    const normalized = String(value).replace(" ", "T");
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toDateKey(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  function formatTimeValue(date) {
    if (!date) return "";
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
  }

  function formatDateTimeValue(date) {
    if (!date) return "";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year}, ${hours}:${minutes}`;
  }

  function getStoreDateNow(timezone) {
    const now = new Date();
    const localOffsetMinutes = -now.getTimezoneOffset();
    const storeOffsetMinutes = helpers.parseTimezoneOffsetToMinutes(timezone ?? "+0");
    const shiftMinutes = storeOffsetMinutes - localOffsetMinutes;
    return new Date(now.getTime() + shiftMinutes * 60 * 1000);
  }

  function formatReceiptScheduleText(order, timezone) {
    if (!order) return "";
    const title = String(order.timeOptionTitle || "").trim();
    const scheduledDate = parseScheduleDate(order.scheduled_at);
    if (!scheduledDate) {
      return title;
    }
    const code = String(order.timeOptionCode || "").trim();
    const storeNow = getStoreDateNow(timezone ?? "+0");
    const showDate =
      code === "on_date"
        ? true
        : code === "at_time"
        ? false
        : toDateKey(scheduledDate) !== toDateKey(storeNow);
    const valueText = showDate ? formatDateTimeValue(scheduledDate) : formatTimeValue(scheduledDate);
    if (!valueText) {
      return title;
    }
    return title ? `${title}: ${valueText}` : valueText;
  }

  // GET /api/print/token-info - проверка токена и информация о точке
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

      res.json({
        ok: true,
        data: {
          tenant_id: tenantId,
          store_id: storeId,
          store_name: storeName,
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: "DB_ERROR" });
    }
  });

  // GET /api/print/template/:orderId - получить шаблон печати для заказа
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
      // Получаем заказ с полными данными (как в admin orders API)
      const [orderRows] = await db.query(
        `
        SELECT
          o.id, o.public_id,
          DATE_FORMAT(o.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
          o.customer_id, o.customer_name, o.customer_phone,
          o.address, o.comment, o.cutlery_qty,
          o.change_from, o.total_price, o.delivery_cost,
          o.items, o.scheduled_at,
          o.delivery_type_id, o.payment_id, o.time_option_id, o.status_id,
          o.pickup_store_id,
          
          s.code AS statusCode, s.title AS statusTitle,
          p.code AS paymentCode, p.title AS paymentTitle,
          m.code AS methodCode, m.title AS methodTitle,
          t.code AS timeOptionCode, t.title AS timeOptionTitle,
          c.telegram_user_id AS customerTelegramId,
          ps.name AS pickupStoreName, ps.address AS pickupStoreAddress
        FROM order_orders o
        LEFT JOIN order_statuses s ON s.tenant_id=o.tenant_id AND s.store_id=o.store_id AND s.id=o.status_id
        LEFT JOIN order_payments p ON p.tenant_id=o.tenant_id AND p.store_id=o.store_id AND p.id=o.payment_id
        LEFT JOIN order_delivery_types m ON m.tenant_id=o.tenant_id AND m.store_id=o.store_id AND m.id=o.delivery_type_id
        LEFT JOIN order_time_options t ON t.tenant_id=o.tenant_id AND t.store_id=o.store_id AND t.id=o.time_option_id
        LEFT JOIN cust_customers c ON c.tenant_id=o.tenant_id AND c.store_id=o.store_id AND c.id=o.customer_id
        LEFT JOIN ten_stores ps ON ps.tenant_id=o.tenant_id AND ps.id=o.pickup_store_id
        WHERE o.tenant_id=? AND o.store_id=? AND o.id=? LIMIT 1
        `,
        [tenantId, storeId, orderId]
      );

      if (!orderRows.length) {
        return res.json({ ok: true, data: null });
      }

      const order = orderRows[0];
      
      // Парсим JSON поля
      let items = [];
      try {
        const parsed = order.items ? JSON.parse(order.items) : [];
        if (Array.isArray(parsed)) items = parsed;
      } catch {}
      
      order.items = items;
      const storeTimezone = await getStoreTimezone(tenantId, storeId);

      // Теперь генерируем HTML ровно как в  orders.js
      const html = generateReceiptHtmlForOrder(order, storeTimezone);

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
    // Вспомогательные функции (переведены из orders.js)
    function money(v) {
      const n = Number(v || 0);
      const formatted = n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
      return formatted + ' ₽';
    }

    function escapeHtml(s) {
      if (!s) return '';
      return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    try {
      // Форматируем дату (из БД уже в timezone филиала)
      const createdAtRaw = order.created_at;
      let dateStr = '';
      const createdAtStr = String(createdAtRaw || '').replace(' ', 'T');
      const date = new Date(createdAtStr);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        dateStr = `${day}.${month}.${year}, ${hours}:${minutes}`;
      } else if (createdAtRaw) {
        dateStr = String(createdAtRaw);
      }

      // Используем правильные названия полей из БД (они переименованы в SELECT)
      const methodTitle = order.methodTitle || (order.methodCode === "pickup" ? "Самовывоз" : "Доставка");
      const deliverySectionTitle = order.methodCode === "pickup" ? "Самовывоз:" : "Доставка:";
      
      let address = order.address;
      if (!address && order.pickupStoreAddress) {
        address = order.pickupStoreName
          ? `${order.pickupStoreName}, ${order.pickupStoreAddress}`
          : order.pickupStoreAddress;
      }

      const isUrgent = order.is_urgent || order.urgent || order.timeOptionCode === "urgent";
      const total = parseFloat(order.total_price || order.total || 0);
      const deliveryCost = Number(order.delivery_cost || 0);
      const changeFromRaw = order.change_from;
      const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
      const paymentTitle = order.paymentTitle || "";
      const changeAmount = Math.max(0, changeFrom - total);
      const showChange = changeAmount > 0;
      const scheduleText = formatReceiptScheduleText(order, storeTimezone) || (isUrgent ? "Быстрее" : "");

      function receiptTotalStr(val) {
        const n = Number(val);
        if (!Number.isFinite(n)) return '';
        if (n === 0) return '';
        return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
      }

      function isAutoAddItem(item) {
        if (Number(item?.auto_add || 0) === 1) return true;
        const name = String(item?.product_name || item?.name || '').trim().toLowerCase();
        return name === 'приборы';
      }

      const receiptItems = Array.isArray(order.items)
        ? order.items.slice().sort((a, b) => {
            const aAuto = isAutoAddItem(a);
            const bAuto = isAutoAddItem(b);
            if (aAuto && !bAuto) return 1;
            if (!aAuto && bAuto) return -1;
            return 0;
          })
        : [];

      let itemsHtml = '';
      if (receiptItems.length) {
        receiptItems.forEach(item => {
          if (item.type === 'combo') {
            const name = escapeHtml(item.name || item.combo_title || 'Комбо');
            const qty = Math.max(1, Number(item.quantity || item.qty || 1));
            const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? 0);
            const priceStr = receiptTotalStr(lineTotal);
            const qtyStr = `${qty} Х`;
            const bulletPrefix = '• ';

            const selections = Array.isArray(item.selections) ? item.selections : [];
            let compositionHtml = '';
            selections.forEach((sel) => {
              const productName = escapeHtml(sel.product_name || '—');
              compositionHtml += `<div class="receipt-composition-item" style="font-weight: bold;">1 × ${productName}</div>`;
              const vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
              if (vParts.length) {
                compositionHtml += `<div class="receipt-composition-item">${bulletPrefix}${escapeHtml(vParts.join(' '))}</div>`;
              }
              const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
              ingredientsDisplay.forEach((ing) => {
                const rawQty = ing.qty ?? ing.quantity;
                const numQty = typeof rawQty === 'number' ? rawQty : parseFloat(rawQty);
                if (!Number.isFinite(numQty) || numQty <= 0) return;
                const ingName = escapeHtml(ing.name || '');
                const unit = escapeHtml(String(ing.unit || '').trim());
                const parts = [];
                if (rawQty != null && rawQty !== '') parts.push(String(rawQty));
                if (unit) parts.push(unit);
                if (ingName) parts.push(ingName);
                compositionHtml += `<div class="receipt-composition-item">${bulletPrefix}${escapeHtml(parts.join(' '))}</div>`;
              });
            });

            itemsHtml += `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${name}</span>
              ${priceStr ? `<span class="receipt-item-price">${escapeHtml(priceStr)}</span>` : ''}
            </div>
            ${compositionHtml ? '<div class="receipt-composition">' + compositionHtml + '</div>' : ''}
          </div>
        `;
            return;
          }
          const name = escapeHtml(item.product_name || item.name || 'Товар');
          const qty = Math.max(1, Number(item.quantity || item.qty || 1));
          const basePrice = parseFloat(item.price || 0);
          const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? (basePrice * qty) ?? 0);
          const priceStr = receiptTotalStr(lineTotal);
          const qtyStr = `${qty} Х`;
          const bulletPrefix = '• ';

          // Варианты товара (первыми)
          const variants = Array.isArray(item.variants) ? item.variants : [];
          let variantsHtml = '';
          if (variants.length) {
            variantsHtml = '<div class="receipt-composition">';
            variants.forEach((v) => {
              const groupTitle = escapeHtml(v.group_title || "Вариант");
              const variantValue = escapeHtml(v.label || v.value || "");
              const variantValueTrimmed = variantValue.trim();
              const groupTitleTrimmed = groupTitle.trim();
              let formatted;
              if (variantValueTrimmed && groupTitleTrimmed) {
                const variantLower = variantValueTrimmed.toLowerCase();
                const groupLower = groupTitleTrimmed.toLowerCase();
                if (variantLower.endsWith(" " + groupLower) || variantLower.endsWith(groupLower)) {
                  formatted = variantValue;
                } else {
                  formatted = `${variantValue} ${groupTitle}`.trim();
                }
              } else {
                formatted = `${variantValue} ${groupTitle}`.trim();
              }
              variantsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
            });
            variantsHtml += '</div>';
          }

          // Ингредиенты товара (вторыми) — не показываем с количеством 0
          const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
          const ingredientsFilteredReceipt = ingredients.filter((ing) => Number(ing.quantity ?? ing.qty ?? 0) > 0);
          let ingredientsHtml = '';
          if (ingredientsFilteredReceipt.length) {
            ingredientsHtml = '<div class="receipt-composition">';
            ingredientsFilteredReceipt.forEach((ing) => {
              const ingName = escapeHtml(ing.name || "Ингредиент");
              const ingQty = Number(ing.quantity ?? ing.qty ?? 0);
              let ingUnit = escapeHtml(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
              if (!ingUnit) {
                ingUnit = ingQty > 10 ? "г" : "шт";
              }
              const formatted = `${ingQty}${ingUnit} ${ingName}`;
              ingredientsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
            });
            ingredientsHtml += '</div>';
          }

          // Опции товара (третьими) — не показываем с количеством 0
          const options = Array.isArray(item.options) ? item.options : [];
          const optionsFilteredReceipt = options.filter((opt) => Number(opt.qty ?? opt.quantity ?? 0) > 0);
          let optionsHtml = '';
          if (optionsFilteredReceipt.length) {
            optionsHtml = '<div class="receipt-composition">';
            optionsFilteredReceipt.forEach((opt) => {
              const optName = escapeHtml(opt.title || "Опция");
              const variantLabel = escapeHtml((opt.variant_label || opt.variantLabel || "").trim());
              let formatted;
              if (variantLabel) {
                formatted = `${variantLabel} ${optName}`;
              } else {
                const optQty = Math.max(1, Number(opt.qty || 1));
                formatted = `${optQty}шт ${optName}`;
              }
              optionsHtml += `<div class="receipt-composition-item">${bulletPrefix}${formatted}</div>`;
            });
            optionsHtml += '</div>';
          }

          itemsHtml += `
          <div class="receipt-item">
            <div class="receipt-item-row">
              <span class="receipt-item-qty">${escapeHtml(qtyStr)}</span>
              <span class="receipt-item-name">${name}</span>
              ${priceStr ? `<span class="receipt-item-price">${escapeHtml(priceStr)}</span>` : ''}
            </div>
            ${variantsHtml}
            ${ingredientsHtml}
            ${optionsHtml}
          </div>
        `;
        });
      }

      // Полный HTML документ с CSS стилями для печати
      return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек заказа #${order.id}</title>
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
      .no-print { display: none !important; }
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
    .receipt-item {
      margin: 5px 0;
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
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #${order.id}</div>
  <div class="receipt-date">${dateStr}</div>
  
  <div class="receipt-divider"></div>
  ${(scheduleText || isUrgent) ? `
  <div class="receipt-section receipt-when-block">
    <div class="receipt-when-text">${escapeHtml(scheduleText || (isUrgent ? "Быстрее" : ""))}</div>
  </div>
  <div class="receipt-divider"></div>
  ` : ''}
  
  <div class="receipt-section">
    ${order.customer_name ? `<div>${escapeHtml(order.customer_name)}</div>` : ''}
    ${order.customer_phone ? `<div>${escapeHtml(order.customer_phone)}</div>` : ''}
  </div>
  
  <div class="receipt-section">
    <div>${escapeHtml(methodTitle || "—")}</div>
    <div>${escapeHtml(address || "—")}</div>
  </div>
  
  ${order.comment ? `
  <div class="receipt-section">
    <div class="receipt-section-title">Комментарий:</div>
    <div>${escapeHtml(order.comment)}</div>
  </div>
  ` : ''}
  
  <div class="receipt-divider"></div>
  
  <div class="receipt-section">
    ${itemsHtml}
  </div>
  
  <div class="receipt-divider"></div>

  <div class="receipt-section">
    ${paymentTitle ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Оплата</div><div class="receipt-summary-value">${escapeHtml(paymentTitle)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача с</div><div class="receipt-summary-value">${money(changeFrom)}</div></div>` : ''}
    ${showChange ? `<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача</div><div class="receipt-summary-value">${money(changeAmount)}</div></div>` : ''}
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
      
      // Проверяем параметр status_id в запросе
      let statusId = req.query.status_id ? Number(req.query.status_id) : null;
      
      // Если status_id не указан, ищем статус по коду "new"
      if (!statusId) {
        statusId = await findNewStatusId(tenantId, storeId);
      }
      
      if (!statusId) {
        return res.json({ ok: true, data: [] });
      }

      const limitRaw = Number(req.query.limit || 100);
      const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 100;

      const storeTimezone = await getStoreTimezone(tenantId, storeId);
      
      // Подготовим WHERE условие для фильтрации по дате
      let dateCondition = "";
      let queryParams = [tenantId, storeId, statusId];
      
      // Если указан параметр "today", фильтруем на заказы за сегодня в часовом поясе хранилища
      if (req.query.today === "true" || req.query.today === "1") {
        // Парсим часовой пояс (например, "+0", "+3", "-5")
        const tzMatch = String(storeTimezone).match(/^([+-]?\d+)$/);
        let tzOffset = 0;
        if (tzMatch) {
          tzOffset = parseInt(tzMatch[1]);
        }
        
        // UTC дата сейчас
        const now = new Date();
        // Дата в часовом поясе хранилища (добавляем смещение)
        const offset = tzOffset * 60 * 60 * 1000;
        const storeNow = new Date(now.getTime() + offset);
        
        // Начало дня в UTC которое соответствует началу дня в часовом поясе хранилища
        // День по UTC = День в store timezone минус сдвиг
        const storeDateStr = storeNow.toISOString().split('T')[0];
        
        dateCondition = " AND DATE(o.created_at) = ?";
        queryParams.push(storeDateStr);
      } else if (req.query.start_date && req.query.end_date) {
        // Если указаны start_date и end_date
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

