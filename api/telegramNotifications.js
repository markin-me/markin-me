/**
 * Отправка уведомлений о новых заказах в Telegram.
 * Формат сообщения 1 в 1 как печатный чек.
 */
const TELEGRAM_API = 'https://api.telegram.org/bot';

async function sendNewOrderNotification(tenantId, storeId, orderPayload, { db, botToken }) {
  if (!botToken || typeof botToken !== 'string' || botToken.trim() === '') return;

  // 1. Получаем chat_id из привязок на уровне филиала (ten_store_telegram)
  const [storeRows] = await db.query(
    `SELECT telegram_chat_id FROM ten_store_telegram
     WHERE tenant_id = ? AND store_id = ? AND telegram_chat_id IS NOT NULL`,
    [tenantId, storeId]
  );

  // 2. Получаем chat_id из глобальных привязок (ten_tenant_telegram + ten_tenant_telegram_stores)
  const [globalRows] = await db.query(
    `SELECT DISTINCT t.telegram_chat_id
     FROM ten_tenant_telegram t
     INNER JOIN ten_tenant_telegram_stores ts ON ts.tenant_telegram_id = t.id AND ts.is_enabled = 1
     WHERE t.tenant_id = ? AND ts.store_id = ? AND t.telegram_chat_id IS NOT NULL`,
    [tenantId, storeId]
  );

  // Объединяем chat_id, убираем дубликаты
  const chatIds = new Set();
  storeRows.forEach(r => chatIds.add(String(r.telegram_chat_id)));
  globalRows.forEach(r => chatIds.add(String(r.telegram_chat_id)));

  if (chatIds.size === 0) return;

  const opts = {};
  const adminBase = (process.env.ADMIN_BASE_URL || process.env.ORDER_LINK_BASE || '').trim();
  if (adminBase && orderPayload.id) {
    const path = adminBase.includes('/dashboard') ? '' : '/dashboard/orders';
    opts.orderUrl = `Открыть заказы: ${adminBase.replace(/\/$/, '')}${path}`;
  }
  const text = formatOrderMessage(orderPayload, opts);
  const apiBase = `${TELEGRAM_API}${botToken.trim()}`;

  for (const chatId of chatIds) {
    try {
      await fetch(`${apiBase}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
      });
    } catch (err) {
      console.error('Telegram sendNewOrderNotification:', err.message);
    }
  }
}

function escapeTg(s) {
  return String(s ?? '').trim();
}

function money(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return '0 ₽';
  return (Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2)) + ' ₽';
}

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
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeOrderDiscountBreakdownSourceKind(entry) {
  const raw = String(entry?.source_kind ?? entry?.sourceKind ?? entry?.source ?? entry?.kind ?? '').trim().toLowerCase();
  if (raw === 'promo_code' || raw === 'reward_promo') return 'promo_code';
  if (raw === 'reward_discount' || raw === 'discount') return 'discount';
  const key = String(entry?.key || '').trim().toLowerCase();
  if (key.startsWith('promo_')) return 'promo_code';
  if (key.startsWith('discount_')) return 'discount';
  return null;
}

function buildOrderStoredDiscountBreakdown(order) {
  const fallbackPromoCode = String(order?.promo_code || '').trim() || null;
  return parseOrderDiscountsJson(order)
    .map((entry) => {
      const sourceKind = normalizeOrderDiscountBreakdownSourceKind(entry);
      const promoCode = sourceKind === 'promo_code'
        ? (String(entry?.promo_code || entry?.code || '').trim() || fallbackPromoCode)
        : null;
      return {
        title: String(entry?.title || entry?.name || 'Скидка').trim() || 'Скидка',
        amount: roundMoney(Number(entry?.discount_amount ?? entry?.amount ?? 0)),
        sourceKind,
        promoCode,
      };
    })
    .filter((entry) => entry.amount > 0 && entry.sourceKind);
}

function buildOrderDiscountSummary(order) {
  const orderTotal = roundMoney(Number(order?.total_price || order?.total || 0));
  const deliveryCost = roundMoney(Number(order?.delivery_cost || 0));
  const items = Array.isArray(order?.items) ? order.items : [];

  let itemsTotalAfterItemDiscounts = 0;
  let comboDiscount = 0;
  let productDiscount = 0;
  let autoAddDiscount = 0;

  items.forEach((item) => {
    const lineTotal = getOrderItemLineTotal(item);
    itemsTotalAfterItemDiscounts += lineTotal;
    const originalLineTotal = Math.max(
      0,
      Number(item?.old_line_total || 0),
      Number(item?.original_line_total || 0),
      Number(item?.discount?.original_line_total || 0)
    );
    const itemDiscount = originalLineTotal > lineTotal
      ? roundMoney(originalLineTotal - lineTotal)
      : 0;
    if (!(itemDiscount > 0)) return;
    if (String(item?.type || '') === 'combo') comboDiscount = roundMoney(comboDiscount + itemDiscount);
    else if (isAutoAddItem(item)) autoAddDiscount = roundMoney(autoAddDiscount + itemDiscount);
    else productDiscount = roundMoney(productDiscount + itemDiscount);
  });

  const storedDiscount = roundMoney(Math.max(0, Number(order?.discount_amount || 0)));
  let breakdown = storedDiscount > 0
    ? [
        { title: 'Комбо', amount: comboDiscount },
        { title: 'Товарные скидки', amount: productDiscount },
        { title: 'Автодобавление', amount: autoAddDiscount },
      ].filter((entry) => entry.amount > 0)
    : [];
  let knownDiscount = breakdown.reduce((sum, entry) => roundMoney(sum + entry.amount), 0);

  buildOrderStoredDiscountBreakdown(order).forEach((entry) => {
    const title = entry.sourceKind === 'promo_code'
      ? (entry.promoCode ? `Промокод ${entry.promoCode}` : entry.title)
      : entry.title;
    const existing = breakdown.find((item) => item.title === title);
    if (existing) existing.amount = roundMoney(existing.amount + entry.amount);
    else breakdown.push({ title, amount: entry.amount });
  });
  knownDiscount = breakdown.reduce((sum, entry) => roundMoney(sum + entry.amount), 0);

  const customerOrderDiscount = Math.max(0, roundMoney(storedDiscount - knownDiscount));
  if (customerOrderDiscount > 0) {
    breakdown = [
      { title: 'Клиентская скидка', amount: customerOrderDiscount },
      ...breakdown,
    ];
    knownDiscount = roundMoney(knownDiscount + customerOrderDiscount);
  }

  const otherDiscount = Math.max(0, roundMoney(storedDiscount - knownDiscount));
  if (otherDiscount > 0) breakdown.push({ title: 'Прочие скидки', amount: otherDiscount });

  const totalDiscount = storedDiscount;
  const subtotalBeforeDiscount = totalDiscount > 0
    ? roundMoney(itemsTotalAfterItemDiscounts + totalDiscount)
    : roundMoney(orderTotal - deliveryCost);

  return { subtotalBeforeDiscount, totalDiscount, breakdown };
}

function parseOrderBenefitsMeta(order) {
  const raw = order?.benefits_meta || order?.benefits_meta_json;
  if (!raw) return {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildOrderBonusSummary(order) {
  const meta = parseOrderBenefitsMeta(order);
  const accrualAmount = roundMoney(Math.max(0, Number(meta?.bonus_accrual_amount || 0)));
  const blocked = meta?.bonus_accrual_blocked_by_redeem === true
    || meta?.bonus_accrual_blocked_by_redeem === 'true'
    || Number(meta?.bonus_accrual_blocked_by_redeem || 0) === 1;
  if (accrualAmount > 0 || blocked) return { visible: true, amount: accrualAmount, blocked };
  return { visible: false, amount: 0, blocked: false };
}

/** Формат времени/даты для "Ко времени" и "На дату" — без часового пояса. */
function formatScheduledAt(scheduledAt, timeOptionCode) {
  if (scheduledAt == null) return '';
  let day, m, y, timeStr;
  if (scheduledAt instanceof Date && !Number.isNaN(scheduledAt.getTime())) {
    y = scheduledAt.getFullYear();
    m = String(scheduledAt.getMonth() + 1).padStart(2, '0');
    day = String(scheduledAt.getDate()).padStart(2, '0');
    const h = String(scheduledAt.getHours()).padStart(2, '0');
    const min = String(scheduledAt.getMinutes()).padStart(2, '0');
    timeStr = `${h}:${min}`;
  } else {
    const s = String(scheduledAt).trim();
    if (!s) return '';
    // Дата + время: "2026-02-07 12:30:00" или "2026-02-07T12:30:00"
    const dateTimeMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (dateTimeMatch) {
      y = dateTimeMatch[1];
      m = dateTimeMatch[2];
      day = dateTimeMatch[3];
      const h = String(dateTimeMatch[4]).padStart(2, '0');
      const min = dateTimeMatch[5];
      timeStr = `${h}:${min}`;
    } else {
      // Только время: "12:30" или "12:30:00" (для "Ко времени")
      const timeOnlyMatch = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
      if (timeOnlyMatch) {
        timeStr = `${String(timeOnlyMatch[1]).padStart(2, '0')}:${timeOnlyMatch[2]}`;
        if (timeOptionCode === 'at_time') return timeStr;
        // для on_date без даты — вернуть хотя бы время
        return timeStr;
      }
      return '';
    }
  }
  if (timeOptionCode === 'at_time') return timeStr; // только "12:30"
  if (timeOptionCode === 'on_date') return `${day}.${m}.${y}, ${timeStr}`; // "07.02.2026, 12:30"
  return `${day}.${m}.${y}, ${timeStr}`;
}

function formatOrderMessage(p, opts = {}) {
  const lines = [];

  // 1. ЗАКАЗ #id
  lines.push(`ЗАКАЗ #${p.id}`);

  // 2. Дата (как в чеке: DD.MM.YYYY, HH:MM)
  const createdAtStr = String(p.created_at || '').replace(' ', 'T');
  const date = new Date(createdAtStr);
  if (!Number.isNaN(date.getTime())) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    lines.push(`${day}.${month}.${year}, ${hours}:${minutes}`);
  }

  lines.push('—');

  // 3. Когда (Быстрее / Ко времени: 12:30 / На дату: 07.02.2026, 12:30)
  const isUrgent = Boolean(p.is_urgent || p.urgent || (p.time_option_code && String(p.time_option_code).toLowerCase() === 'urgent'));
  const scheduleText = p.time_option_title && String(p.time_option_title).trim();
  const timeOptionCode = p.time_option_code ? String(p.time_option_code).trim() : '';
  // Передаём p.scheduled_at как есть (Date или строка), не приводим к строке — иначе Date превращается в "Sat Feb 07 ... GMT+0700" и не парсится
  const formattedScheduled = formatScheduledAt(p.scheduled_at, timeOptionCode);
  if (scheduleText || isUrgent || formattedScheduled) {
    const whenText = isUrgent ? 'Быстрее' : (formattedScheduled && scheduleText ? `${scheduleText}: ${formattedScheduled}` : scheduleText || formattedScheduled || '');
    if (whenText) lines.push(whenText);
    lines.push('—');
  }

  // 4. Клиент
  if (p.customer_name) lines.push(escapeTg(p.customer_name));
  if (p.customer_phone) lines.push(escapeTg(p.customer_phone));
  lines.push('');

  // 5. Способ и адрес
  const methodTitle = p.method_title || (p.method_code === 'pickup' ? 'Самовывоз' : 'Доставка');
  let address = p.address;
  if (!address && (p.pickup_store_address || p.pickupStoreAddress)) {
    const storeName = p.pickup_store_name || p.pickupStoreName || '';
    const storeAddr = p.pickup_store_address || p.pickupStoreAddress || '';
    address = storeName ? `${storeName}, ${storeAddr}` : storeAddr;
  }
  lines.push(escapeTg(methodTitle));
  lines.push(escapeTg(address || '—'));
  lines.push('');

  // 6. Комментарий к адресу (без заголовка, как в чеке)
  if (p.address_comment && String(p.address_comment).trim()) {
    lines.push(escapeTg(p.address_comment));
  }
  // 7. Комментарий к заказу (без заголовка)
  if (p.comment && String(p.comment).trim()) {
    lines.push(escapeTg(p.comment));
  }

  lines.push('—');

  // 8. Состав заказа (сортировка как в чеке: авто-добавление в конец)
  const items = Array.isArray(p.items) ? p.items.slice() : [];
  items.sort((a, b) => {
    const aAuto = isAutoAddItem(a);
    const bAuto = isAutoAddItem(b);
    if (aAuto && !bAuto) return 1;
    if (!aAuto && bAuto) return -1;
    return 0;
  });

  let lastItemGroupKey = '';
  items.forEach((item) => {
    const itemGroupKey = item.type === 'combo' ? 'combo' : 'product';
    if (itemGroupKey !== lastItemGroupKey) {
      if (lastItemGroupKey) lines.push('—');
      lines.push(itemGroupKey === 'combo' ? 'КОМБО' : 'ТОВАРЫ');
      lastItemGroupKey = itemGroupKey;
    }

    if (item.type === 'combo') {
      const name = item.name || item.combo_title || 'Комбо';
      const qty = Math.max(1, Number(item.quantity || item.qty || 1));
      const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? 0);
      const priceStr = receiptTotalStr(lineTotal);
      lines.push(`${qty} Х ${escapeTg(name)}${priceStr ? ' ' + priceStr : ''}`);
      const selections = Array.isArray(item.selections) ? item.selections : [];
      selections.forEach((sel) => {
        const productName = sel.product_name || '—';
        lines.push(`• 1 × ${escapeTg(productName)}`);
        const vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
        if (vParts.length) lines.push(`• ${escapeTg(vParts.join(' '))}`);
        const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
        ingredientsDisplay.forEach((ing) => {
          const rawQty = ing.qty ?? ing.quantity;
          const numQty = typeof rawQty === 'number' ? rawQty : parseFloat(rawQty);
          if (!Number.isFinite(numQty) || numQty <= 0) return;
          const ingName = ing.name || '';
          const unit = String(ing.unit || '').trim();
          const parts = [];
          if (rawQty != null && rawQty !== '') parts.push(String(rawQty));
          if (unit) parts.push(unit);
          if (ingName) parts.push(ingName);
          lines.push(`• ${escapeTg(parts.join(' '))}`);
        });
      });
      return;
    }

    const name = item.product_name || item.name || 'Товар';
    const qty = Math.max(1, Number(item.quantity || item.qty || 1));
    const lineTotal = Number(item.line_total ?? item.total ?? item.total_price ?? (Number(item.price || 0) * qty) ?? 0);
    const priceStr = receiptTotalStr(lineTotal);
    lines.push(`${qty} Х ${escapeTg(name)}${priceStr ? ' ' + priceStr : ''}`);

    const variants = Array.isArray(item.variants) ? item.variants : [];
    variants.forEach((v) => {
      const groupTitle = v.group_title || 'Вариант';
      const variantValue = v.label || v.value || '';
      const trimmed = String(variantValue).trim();
      const groupTrimmed = String(groupTitle).trim();
      let formatted;
      if (trimmed && groupTrimmed) {
        const lower = trimmed.toLowerCase();
        const groupLower = groupTrimmed.toLowerCase();
        if (lower.endsWith(' ' + groupLower) || lower.endsWith(groupLower)) {
          formatted = variantValue;
        } else {
          formatted = `${variantValue} ${groupTitle}`.trim();
        }
      } else {
        formatted = `${variantValue} ${groupTitle}`.trim();
      }
      if (formatted) lines.push(`• ${escapeTg(formatted)}`);
    });

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const ingredientsFiltered = ingredients.filter((ing) => Number(ing.quantity ?? ing.qty ?? 0) > 0);
    ingredientsFiltered.forEach((ing) => {
      const ingName = ing.name || 'Ингредиент';
      const ingQty = Number(ing.quantity ?? ing.qty ?? 0);
      let ingUnit = ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || '';
      if (!ingUnit) ingUnit = ingQty > 10 ? 'г' : 'шт';
      lines.push(`• ${ingQty}${ingUnit} ${escapeTg(ingName)}`);
    });

    const options = Array.isArray(item.options) ? item.options : [];
    const optionsFiltered = options.filter((opt) => Number(opt.qty ?? opt.quantity ?? 0) > 0);
    optionsFiltered.forEach((opt) => {
      const optName = opt.title || 'Опция';
      const variantLabel = String(opt.variant_label || opt.variantLabel || '').trim();
      const formatted = variantLabel ? `${variantLabel} ${optName}` : `${Math.max(1, Number(opt.qty || 1))}шт ${optName}`;
      lines.push(`• ${escapeTg(formatted)}`);
    });
  });

  lines.push('—');

  // 9. Оплата, сдача, доставка, итого
  const total = parseFloat(p.total_price || p.total || 0);
  const deliveryCost = Number(p.delivery_cost || 0);
  const changeFromRaw = p.change_from;
  const changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
  const changeAmount = Math.max(0, changeFrom - total);
  const showChange = changeAmount > 0;
  const paymentTitle = p.payment_method_title || p.payment_title || '';
  const discountSummary = buildOrderDiscountSummary(p);
  const discountAmount = Number(discountSummary.totalDiscount || 0);
  const subtotal = Number(discountSummary.subtotalBeforeDiscount || 0);
  const receiptPromoCode = String(p?.promo_code || '').trim();
  const bonusSummary = buildOrderBonusSummary(p);
  const showBonusRow = Boolean(bonusSummary.visible);
  const bonusValue = bonusSummary.blocked && !(bonusSummary.amount > 0)
    ? '0 ₽'
    : `+${money(bonusSummary.amount || 0)}`;

  if (paymentTitle) lines.push(`Оплата ${escapeTg(paymentTitle)}`);
  if (showChange) lines.push(`Сдача с ${money(changeFrom)}`);
  if (showChange) lines.push(`Сдача ${money(changeAmount)}`);
  if (discountAmount > 0) lines.push(`Сумма товаров ${money(subtotal)}`);
  if (discountAmount > 0) lines.push(`Скидка -${money(discountAmount)}`);
  if (receiptPromoCode) lines.push(`Промокод ${escapeTg(receiptPromoCode)}`);
  lines.push(`Доставка ${money(deliveryCost)}`);
  if (showBonusRow) lines.push(`Бонусы ${bonusValue}`);
  lines.push(`ИТОГО: ${money(total)}`);

  lines.push('');
  lines.push('Спасибо за заказ!');

  if (opts.orderUrl) lines.push('', opts.orderUrl);

  return lines.join('\n');
}

module.exports = { sendNewOrderNotification, formatOrderMessage };
