const http = require("http");

const BOT_HOST = "127.0.0.1";
const BOT_PORT = 7788;

function money(v) {
  const n = Number(v || 0);
  const formatted = n.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  return formatted + " ₽";
}

function escapeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function formatDateTime(createdAt) {
  const createdAtStr = String(createdAt || "").replace(" ", "T");
  const date = new Date(createdAtStr);
  if (isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year}, ${hours}:${minutes}`;
}

function buildReceiptLayout(order) {
  const lines = [];
  const header = `ЗАКАЗ #${order.id}`;
  const dateStr = formatDateTime(order.created_at);

  lines.push({ type: "text", text: header, align: "center", size: 16, bold: true });
  if (dateStr) {
    lines.push({ type: "text", text: dateStr, align: "center" });
  }
  lines.push({ type: "divider" });

  const isUrgent = order.is_urgent || order.urgent || order.timeOptionCode === "urgent";
  const scheduleText = order.timeOptionTitle || (isUrgent ? "Быстрее" : "");
  if (scheduleText || isUrgent) {
    lines.push({ type: "text", text: scheduleText || "Быстрее", align: "center", bold: true });
    lines.push({ type: "divider" });
  }

  if (order.customer_name) lines.push({ type: "text", text: escapeText(order.customer_name) });
  if (order.customer_phone) lines.push({ type: "text", text: escapeText(order.customer_phone) });

  const methodTitle = order.methodTitle || (order.methodCode === "pickup" ? "Самовывоз" : "Доставка");
  let address = order.address;
  if (!address && order.pickupStoreAddress) {
    address = order.pickupStoreName
      ? `${order.pickupStoreName}, ${order.pickupStoreAddress}`
      : order.pickupStoreAddress;
  }
  lines.push({ type: "text", text: escapeText(methodTitle || "—") });
  lines.push({ type: "text", text: escapeText(address || "—") });

  if (order.comment) {
    lines.push({ type: "text", text: "Комментарий:", bold: true });
    lines.push({ type: "text", text: escapeText(order.comment) });
  }

  lines.push({ type: "divider" });

  const receiptItems = Array.isArray(order.items) ? order.items.slice() : [];
  receiptItems.forEach((item) => {
    const name = escapeText(item.product_name || item.name || "Товар");
    const qty = Math.max(1, Number(item.quantity || item.qty || 1));
    const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? 0);
    const qtyStr = `${qty} Х`;

    lines.push({ type: "columns", left: `${qtyStr} ${name}`.trim(), right: money(lineTotal) });

    const bulletPrefix = "• ";

    const variants = Array.isArray(item.variants) ? item.variants : [];
    variants.forEach((v) => {
      const groupTitle = escapeText(v.group_title || "Вариант");
      const variantValue = escapeText(v.label || v.value || "");
      const groupTitleTrimmed = groupTitle.trim().toLowerCase();
      const variantTrimmed = variantValue.trim().toLowerCase();
      let formatted = `${variantValue} ${groupTitle}`.trim();
      if (variantTrimmed && groupTitleTrimmed) {
        if (variantTrimmed.endsWith(" " + groupTitleTrimmed) || variantTrimmed.endsWith(groupTitleTrimmed)) {
          formatted = variantValue;
        }
      }
      lines.push({ type: "text", text: `${bulletPrefix}${formatted}`.trim(), indent: 2 });
    });

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    ingredients
      .filter((ing) => Number(ing.quantity ?? ing.qty ?? 0) > 0)
      .forEach((ing) => {
        const ingName = escapeText(ing.name || "Ингредиент");
        const ingQty = Number(ing.quantity ?? ing.qty ?? 0);
        let ingUnit = escapeText(ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || "");
        if (!ingUnit) {
          ingUnit = ingQty > 10 ? "г" : "шт";
        }
        const formatted = `${ingQty}${ingUnit} ${ingName}`.trim();
        lines.push({ type: "text", text: `${bulletPrefix}${formatted}`.trim(), indent: 2 });
      });

    const options = Array.isArray(item.options) ? item.options : [];
    options
      .filter((opt) => Number(opt.qty ?? opt.quantity ?? 0) > 0)
      .forEach((opt) => {
        const optName = escapeText(opt.title || "Опция");
        const variantLabel = escapeText((opt.variant_label || opt.variantLabel || "").trim());
        let formatted;
        if (variantLabel) {
          formatted = `${variantLabel} ${optName}`;
        } else {
          const optQty = Math.max(1, Number(opt.qty || 1));
          formatted = `${optQty}шт ${optName}`;
        }
        lines.push({ type: "text", text: `${bulletPrefix}${formatted}`.trim(), indent: 2 });
      });
  });

  lines.push({ type: "divider" });

  const total = parseFloat(order.total_price || order.total || 0);
  const deliveryCost = Number(order.delivery_cost || 0);
  const changeFromRaw = order.change_from;
  const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
  const paymentTitle = order.paymentTitle || "";
  const changeAmount = Math.max(0, changeFrom - total);
  const showChange = changeAmount > 0;

  if (paymentTitle) {
    lines.push({ type: "columns", left: "Оплата", right: escapeText(paymentTitle) });
  }
  if (showChange) {
    lines.push({ type: "columns", left: "Сдача с", right: money(changeFrom) });
    lines.push({ type: "columns", left: "Сдача", right: money(changeAmount) });
  }
  lines.push({ type: "columns", left: "Доставка", right: money(deliveryCost) });

  lines.push({ type: "divider" });
  lines.push({ type: "text", text: `ИТОГО: ${money(total)}`, align: "center", size: 14, bold: true });
  lines.push({ type: "divider" });
  lines.push({ type: "text", text: "Спасибо за заказ!", align: "center" });

  return {
    width_mm: 80,
    margin_mm: 5,
    font: { name: "Courier New", size: 11, bold: true },
    lines,
  };
}

async function getPrintToken(db, tenantId, storeId) {
  const [rows] = await db.query(
    `SELECT token FROM print_api_tokens WHERE tenant_id=? AND store_id=? AND is_active=1 ORDER BY id DESC LIMIT 1`,
    [tenantId, storeId]
  );
  return rows[0]?.token || null;
}

function postToBot(token, payload) {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = http.request(
      {
        hostname: BOT_HOST,
        port: BOT_PORT,
        path: "/print",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": body.length,
          "X-Api-Key": token || "",
        },
        timeout: 2000,
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => resolve(true));
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.write(body);
    req.end();
  });
}

async function sendOrderToPrintBot({ db, order, tenantId, storeId }) {
  if (!order) return false;
  const statusId = Number(order.status_id ?? order.statusId ?? order.statusID ?? 0);
  if (statusId !== 1) return false;
  const resolvedTenantId = Number(tenantId || order.tenant_id || order.tenantId || order.tenantID || order.tenant);
  const resolvedStoreId = Number(storeId || order.store_id || order.storeId || order.storeID || order.store);
  if (!resolvedTenantId || !resolvedStoreId) return false;

  const token = await getPrintToken(db, resolvedTenantId, resolvedStoreId);
  if (!token) return false;

  const layout = buildReceiptLayout(order);
  const payload = { order, layout };
  await postToBot(token, payload);
  return true;
}

module.exports = { sendOrderToPrintBot, buildReceiptLayout };
