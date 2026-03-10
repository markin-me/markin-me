(function () {
  var CASH_CHANGE_OPTIONS = [
    { value: 'no_change', label: 'Без сдачи' },
    { value: '500', label: '500 ₽' },
    { value: '1000', label: '1000 ₽' },
    { value: '2000', label: '2000 ₽' },
    { value: '5000', label: '5000 ₽' },
    { value: 'other', label: 'Другая сумма' },
  ];
  var paymentMethodsCache = [];
  var paymentMethodsPromise = null;
  var paymentMethodsCacheStorageKey = '';
  var PAYMENT_METHODS_CACHE_VERSION = 1;
  var PAYMENT_METHODS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  function getTenantIdFromStorage() {
    try {
      var tenantRaw = localStorage.getItem('tenant');
      var tenant = tenantRaw ? JSON.parse(tenantRaw) : null;
      var id = Number(tenant && tenant.id || 0);
      return Number.isFinite(id) && id > 0 ? id : 0;
    } catch (err) {
      return 0;
    }
  }

  function getStoreIdFromStorage() {
    try {
      var activeStoreId = Number(localStorage.getItem('activeStoreId') || 0);
      return Number.isFinite(activeStoreId) && activeStoreId > 0 ? activeStoreId : 0;
    } catch (err) {
      return 0;
    }
  }

  function paymentMethodsCacheKey() {
    return 'shared_order_payment_methods_v' + PAYMENT_METHODS_CACHE_VERSION + '_t' + getTenantIdFromStorage() + '_s' + getStoreIdFromStorage();
  }

  function normalizePaymentMethodsPayload(items) {
    return (Array.isArray(items) ? items : []).map(function (item) {
      var code = String(item && item.code || '').trim();
      if (!code) return null;
      return {
        code: code,
        title: String(item && item.title || '').trim(),
        icon: String(item && item.icon || '').trim(),
        is_active: Object.prototype.hasOwnProperty.call(item || {}, 'is_active')
          ? Number(item && item.is_active || 0)
          : 1,
      };
    }).filter(Boolean);
  }

  function readPersistedPaymentMethods() {
    try {
      var raw = localStorage.getItem(paymentMethodsCacheKey());
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      var ts = Number(parsed && parsed.ts || 0);
      if (!(ts > 0) || Date.now() - ts > PAYMENT_METHODS_CACHE_MAX_AGE_MS) return [];
      return normalizePaymentMethodsPayload(parsed && parsed.items);
    } catch (err) {
      return [];
    }
  }

  function persistPaymentMethods(items) {
    try {
      paymentMethodsCacheStorageKey = paymentMethodsCacheKey();
      localStorage.setItem(paymentMethodsCacheKey(), JSON.stringify({
        ts: Date.now(),
        items: normalizePaymentMethodsPayload(items),
      }));
    } catch (err) {}
  }

  function ensurePaymentMethodsHydrated() {
    var cacheKey = paymentMethodsCacheKey();
    if (paymentMethodsCacheStorageKey && paymentMethodsCacheStorageKey !== cacheKey) {
      paymentMethodsCache = [];
      paymentMethodsPromise = null;
    }
    paymentMethodsCacheStorageKey = cacheKey;
    if (Array.isArray(paymentMethodsCache) && paymentMethodsCache.length) return;
    var persisted = readPersistedPaymentMethods();
    if (persisted.length) {
      paymentMethodsCache = persisted;
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalizeText(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function roundMoney(value) {
    var numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round((numeric + Number.EPSILON) * 100) / 100;
  }

  function getOrderId(order) {
    return Number(order && order.id || 0) || 0;
  }

  function getOrderNumber(order) {
    var orderId = getOrderId(order);
    if (orderId > 0) return String(orderId);
    var publicId = String(order && order.public_id || '').trim();
    return publicId || '—';
  }

  function isPaidOrder(order) {
    return Number(order && order.is_paid || 0) === 1;
  }

  function paymentIcon(code) {
    var normalized = normalizeText(code);
    if (!normalized) return 'fa-credit-card';
    if (normalized.indexOf('cash') !== -1 || normalized.indexOf('нал') !== -1) return 'fa-money-bill-wave';
    if (normalized.indexOf('online') !== -1 || normalized.indexOf('онлайн') !== -1) return 'fa-globe';
    return 'fa-credit-card';
  }

  function normalizeIconClass(iconValue) {
    var raw = String(iconValue || '').trim();
    if (!raw) return '';
    if (/^fa[srldb]?\s/i.test(raw) || /^fa-[\w-]+$/i.test(raw)) {
      return raw.indexOf(' ') === -1 ? ('fas ' + raw) : raw;
    }
    return raw;
  }

  function isIconUrl(iconValue) {
    return /^https?:\/\//i.test(String(iconValue || '').trim()) || /^\//.test(String(iconValue || '').trim());
  }

  function isCashPaymentCode(code) {
    var raw = normalizeText(code);
    return raw.indexOf('cash') !== -1 || raw.indexOf('нал') !== -1;
  }

  function renderPaymentMethodIcon(payment) {
    var iconValue = String(payment && payment.icon || '').trim();
    var paymentCode = String(payment && payment.code || '').trim();
    if (!iconValue) return '<i class="fas ' + escapeHtml(paymentIcon(paymentCode)) + '"></i>';
    if (isIconUrl(iconValue)) return '<img src="' + escapeHtml(iconValue) + '" alt="" loading="lazy">';
    return '<i class="' + escapeHtml(normalizeIconClass(iconValue) || ('fas ' + paymentIcon(paymentCode))) + '"></i>';
  }

  function getPaymentLabel(order) {
    var title = String(order && (order.payment_title || order.payment_code) || '').trim();
    if (title) return title;
    if (isCashPaymentCode(order && order.payment_code)) return 'Наличные';
    if (normalizeText(order && order.payment_code).indexOf('online') !== -1) return 'Онлайн';
    return 'Картой / QR';
  }

  function getFallbackPaymentMethods(order) {
    var fallback = [
      { code: 'cash', title: 'Наличные', icon: 'fa-money-bill-wave', is_active: 1 },
      { code: 'card', title: 'Картой / QR', icon: 'fa-credit-card', is_active: 1 },
      { code: 'online', title: 'Онлайн', icon: 'fa-globe', is_active: 1 },
    ];
    var currentCode = String(order && order.payment_code || '').trim();
    if (!currentCode) return fallback;
    var currentTitle = String(order && order.payment_title || '').trim();
    var currentIcon = String(order && order.payment_icon || '').trim();
    var currentIndex = fallback.findIndex(function (item) {
      return normalizeText(item && item.code) === normalizeText(currentCode);
    });
    if (currentIndex === -1) {
      fallback.unshift({
        code: currentCode,
        title: currentTitle || getPaymentLabel(order),
        icon: currentIcon || ('fas ' + paymentIcon(currentCode)),
        is_active: 1,
      });
    } else {
      fallback[currentIndex] = Object.assign({}, fallback[currentIndex], {
        title: currentTitle || fallback[currentIndex].title,
        icon: currentIcon || fallback[currentIndex].icon,
      });
    }
    return fallback;
  }

  function getActivePaymentMethods(order) {
    ensurePaymentMethodsHydrated();
    var source = Array.isArray(paymentMethodsCache) && paymentMethodsCache.length
      ? paymentMethodsCache
      : getFallbackPaymentMethods(order);
    var seen = {};
    return source.filter(function (item) {
      var code = String(item && item.code || '').trim();
      if (!code) return false;
      var key = normalizeText(code);
      if (!key || seen[key]) return false;
      if (Object.prototype.hasOwnProperty.call(item || {}, 'is_active') && Number(item && item.is_active || 0) !== 1) return false;
      seen[key] = true;
      return true;
    }).map(function (item) {
      return Object.assign({}, item, { code: String(item && item.code || '').trim() });
    });
  }

  function ensurePaymentMethodsLoaded(apiJson, order, options) {
    var opts = options || {};
    var cacheOnly = !!opts.cacheOnly;
    ensurePaymentMethodsHydrated();
    if (Array.isArray(paymentMethodsCache) && paymentMethodsCache.length) {
      return Promise.resolve(getActivePaymentMethods(order));
    }
    if (paymentMethodsPromise) {
      return paymentMethodsPromise.then(function () {
        return getActivePaymentMethods(order);
      });
    }
    if (cacheOnly) {
      return Promise.reject(new Error('PAYMENT_METHODS_OFFLINE_UNAVAILABLE'));
    }
    paymentMethodsPromise = apiJson('/api/admin/tenant/order-payments').then(function (json) {
      paymentMethodsCache = normalizePaymentMethodsPayload(json && json.items);
      persistPaymentMethods(paymentMethodsCache);
      return paymentMethodsCache;
    }).catch(function (err) {
      console.error('shared order payment methods load error:', err);
      paymentMethodsCache = readPersistedPaymentMethods();
      return paymentMethodsCache;
    }).finally(function () {
      paymentMethodsPromise = null;
    });
    return paymentMethodsPromise.then(function () {
      return getActivePaymentMethods(order);
    });
  }

  function getPaymentMethodMeta(code, order) {
    var normalizedCode = String(code || '').trim();
    if (!normalizedCode) return null;
    var methods = getActivePaymentMethods(order);
    var matched = methods.find(function (item) {
      return normalizeText(item && item.code) === normalizeText(normalizedCode);
    });
    if (matched) return Object.assign({}, matched);
    var fallback = getFallbackPaymentMethods(order).find(function (item) {
      return normalizeText(item && item.code) === normalizeText(normalizedCode);
    });
    return fallback ? Object.assign({}, fallback) : null;
  }

  function normalizeCashPaymentAmount(value) {
    return String(value == null ? '' : value).replace(/[^\d]/g, '').replace(/^0+(?=\d)/, '');
  }

  function resolveCashPaymentDraft(order, paymentMethods) {
    var methods = Array.isArray(paymentMethods) ? paymentMethods : [];
    var availableCodes = methods.map(function (item) {
      return String(item && item.code || '').trim();
    }).filter(Boolean);
    var currentCode = String(order && order.payment_code || '').trim();
    var paymentCode = availableCodes.indexOf(currentCode) !== -1 ? currentCode : (availableCodes[0] || currentCode || 'cash');
    var changeFrom = Number(order && order.change_from || 0);
    var knownChangeValues = { '500': true, '1000': true, '2000': true, '5000': true };
    var changeType = 'no_change';
    var changeAmount = '';
    if (isCashPaymentCode(paymentCode) && changeFrom > 0) {
      var serialized = String(Math.round(changeFrom));
      if (knownChangeValues[serialized] && Number(serialized) === Number(changeFrom)) {
        changeType = serialized;
      } else {
        changeType = 'other';
        changeAmount = normalizeCashPaymentAmount(changeFrom);
      }
    }
    return {
      paymentCode: paymentCode,
      changeType: changeType,
      changeAmount: changeAmount,
    };
  }

  function resolveCashPaymentChangeFrom(draft) {
    if (!draft || !isCashPaymentCode(draft.paymentCode)) return null;
    var changeType = String(draft.changeType || 'no_change').trim();
    if (changeType === 'no_change') return null;
    if (changeType === 'other') {
      var customValue = Number(normalizeCashPaymentAmount(draft.changeAmount));
      return Number.isFinite(customValue) && customValue > 0 ? customValue : null;
    }
    var presetValue = Number(String(changeType).replace(/[^\d]/g, ''));
    return Number.isFinite(presetValue) && presetValue > 0 ? presetValue : null;
  }

  function validateCashPaymentDraft(draft, orderTotal, paymentMethods) {
    var paymentCode = String(draft && draft.paymentCode || '').trim();
    if (!paymentCode) return 'Выберите способ оплаты';
    var allowedCodes = (Array.isArray(paymentMethods) ? paymentMethods : []).map(function (item) {
      return String(item && item.code || '').trim();
    }).filter(Boolean);
    if (allowedCodes.length && allowedCodes.indexOf(paymentCode) === -1) {
      return 'Выберите доступный способ оплаты';
    }
    if (!isCashPaymentCode(paymentCode)) return '';
    var changeFrom = resolveCashPaymentChangeFrom(draft);
    if (String(draft && draft.changeType || '') === 'other' && !(changeFrom > 0)) {
      return 'Укажите сумму, которую дал клиент';
    }
    if (changeFrom != null && changeFrom <= Number(orderTotal || 0)) {
      return 'Сумма от клиента должна быть больше суммы заказа';
    }
    return '';
  }

  function getRefundableItems(order) {
    if (Array.isArray(order && order.refundable_items) && order.refundable_items.length) {
      return order.refundable_items.map(function (item) {
        return {
          source_item_index: Number(item && item.source_item_index || 0),
          title: String(item && (item.title || item.name || item.product_name) || 'Позиция').trim() || 'Позиция',
          original_qty: Number(item && item.original_qty || 0) || 0,
          refunded_qty: Number(item && item.refunded_qty || 0) || 0,
          remaining_qty: Number(item && item.remaining_qty || 0) || 0,
          original_line_total: roundMoney(item && item.original_line_total || 0),
          refunded_line_total: roundMoney(item && item.refunded_line_total || 0),
          remaining_line_total: roundMoney(item && item.remaining_line_total || 0),
          unit_price: roundMoney(item && item.unit_price || 0),
          item_snapshot: item && typeof item.item_snapshot === 'object' ? item.item_snapshot : {},
        };
      });
    }
    return (Array.isArray(order && order.items) ? order.items : []).map(function (item, index) {
      var qty = Math.max(0, Number(item && (item.qty || item.quantity) || 0));
      var lineTotal = roundMoney(item && (item.line_total || item.total || item.total_price) || 0);
      return {
        source_item_index: index,
        title: String(item && (item.name || item.product_name || item.combo_title) || 'Позиция').trim() || 'Позиция',
        original_qty: qty,
        refunded_qty: 0,
        remaining_qty: qty,
        original_line_total: lineTotal,
        refunded_line_total: 0,
        remaining_line_total: lineTotal,
        unit_price: qty > 0 ? roundMoney(lineTotal / qty) : 0,
        item_snapshot: item && typeof item === 'object' ? item : {},
      };
    });
  }

  function computeRefundLineAmount(item, qty) {
    var numericQty = Math.max(0, Number(qty || 0));
    var remainingQty = Math.max(0, Number(item && item.remaining_qty || 0));
    var originalQty = Math.max(0, Number(item && item.original_qty || 0));
    var remainingLineTotal = roundMoney(item && item.remaining_line_total || 0);
    var originalLineTotal = roundMoney(item && item.original_line_total || 0);
    if (!(numericQty > 0) || !(remainingQty > 0) || !(originalQty > 0)) return 0;
    if (numericQty >= remainingQty) return remainingLineTotal;
    var proportional = roundMoney((originalLineTotal * numericQty) / originalQty);
    return proportional > remainingLineTotal ? remainingLineTotal : proportional;
  }

  function isFullRefundSelection(refundableItems, selectedByIndex) {
    var activeItems = (Array.isArray(refundableItems) ? refundableItems : []).filter(function (item) {
      return Number(item && item.remaining_qty || 0) > 0;
    });
    if (!activeItems.length) return false;
    return activeItems.every(function (item) {
      return Number(selectedByIndex[String(item.source_item_index)] || 0) === Number(item.remaining_qty || 0);
    });
  }

  function getRefundState(order) {
    return normalizeText(order && order.refund_state);
  }

  function getRefundStateTitle(order) {
    var state = getRefundState(order);
    if (state === 'full') return 'Возвращен';
    if (state === 'partial') return 'Частичный возврат';
    return '';
  }

  function normalizeRefundQty(value) {
    var numeric = Math.floor(Number(value || 0));
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return numeric;
  }

  function isAutoAddRefundItem(item) {
    var snapshot = item && item.item_snapshot && typeof item.item_snapshot === 'object'
      ? item.item_snapshot
      : item;
    if (Number(snapshot && snapshot.auto_add || 0) === 1) return true;
    return String(snapshot && (snapshot.product_name || snapshot.name) || '').trim().toLowerCase() === 'приборы';
  }

  function computeRefundOldLineAmount(item, qty) {
    var snapshot = item && item.item_snapshot && typeof item.item_snapshot === 'object'
      ? item.item_snapshot
      : {};
    var originalQty = Math.max(0, Number(item && item.original_qty || snapshot && (snapshot.qty || snapshot.quantity) || 0));
    var selectedQty = Math.max(0, Number(qty || 0));
    if (!(selectedQty > 0) || !(originalQty > 0)) return 0;
    var originalOldLineTotal = roundMoney(
      snapshot && snapshot.old_line_total != null
        ? snapshot.old_line_total
        : snapshot && snapshot.discount && snapshot.discount.original_line_total != null
          ? snapshot.discount.original_line_total
          : 0
    );
    if (!(originalOldLineTotal > 0)) return 0;
    return roundMoney((originalOldLineTotal * selectedQty) / originalQty);
  }

  function buildRefundDisplaySnapshot(item, selectedQty) {
    var snapshot = item && item.item_snapshot && typeof item.item_snapshot === 'object'
      ? item.item_snapshot
      : {};
    var fallbackQty = Math.max(0, Number(item && (item.remaining_qty || item.original_qty) || snapshot && (snapshot.qty || snapshot.quantity) || 0));
    var displayQty = selectedQty > 0 ? normalizeRefundQty(selectedQty) : normalizeRefundQty(fallbackQty);
    if (!(displayQty > 0)) displayQty = Math.max(1, Number(snapshot && (snapshot.qty || snapshot.quantity) || 1));
    var displayLineTotal = selectedQty > 0
      ? computeRefundLineAmount(item, selectedQty)
      : roundMoney(item && item.remaining_line_total || 0);
    var displayOldLineTotal = computeRefundOldLineAmount(item, displayQty);
    var clonedDiscount = snapshot && snapshot.discount && typeof snapshot.discount === 'object'
      ? Object.assign({}, snapshot.discount)
      : {};
    return Object.assign({}, snapshot, {
      qty: displayQty,
      quantity: displayQty,
      line_total: displayLineTotal,
      total: displayLineTotal,
      total_price: displayLineTotal,
      old_line_total: displayOldLineTotal,
      discount: Object.assign({}, clonedDiscount, { original_line_total: displayOldLineTotal }),
    });
  }

  function renderDetailedOrderItemHtml(item, options) {
    options = options || {};
    var money = typeof options.money === 'function'
      ? options.money
      : function (value) { return String(roundMoney(value || 0)) + ' ₽'; };
    var itemIndex = Number(options.itemIndex || 0);

    function toCleanPhotos(value) {
      return (Array.isArray(value) ? value : [])
        .map(function (src) { return String(src || '').trim(); })
        .filter(Boolean)
        .slice(0, 4);
    }

    function mergeVariantUnit(label, unit) {
      var cleanLabel = String(label || '').trim();
      var cleanUnit = String(unit || '').trim();
      if (!cleanLabel) return cleanUnit;
      if (!cleanUnit) return cleanLabel;
      var escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      var measureMatch = cleanLabel.match(new RegExp('^\\s*([\\d.,]+\\s*' + escapedUnit + ')(?:\\b|\\s|$)', 'i'));
      if (measureMatch && String(measureMatch[1] || '').trim()) {
        return String(measureMatch[1] || '').trim();
      }
      var labelLower = cleanLabel.toLowerCase();
      var unitLower = cleanUnit.toLowerCase();
      if (labelLower.endsWith(' ' + unitLower) || labelLower === unitLower) return cleanLabel;
      return (cleanLabel + ' ' + cleanUnit).trim();
    }

    function normalizeVariantUnitLabel(unitRaw) {
      var raw = String(unitRaw || '').trim();
      if (!raw) return '';
      var key = raw.toLowerCase();
      var dict = {
        'штук': 'шт',
        'штука': 'шт',
        'шт': 'шт',
        'грамм': 'г',
        'грамма': 'г',
        'гр': 'г',
        'г': 'г',
        'килограмм': 'кг',
        'килограмма': 'кг',
        'кг': 'кг',
        'миллилитр': 'мл',
        'миллилитра': 'мл',
        'мл': 'мл',
        'литр': 'л',
        'литра': 'л',
        'л': 'л',
      };
      return dict[key] || raw;
    }

    function extractVariantUnitFromGroupTitle(groupTitleRaw) {
      var groupTitle = String(groupTitleRaw || '').trim();
      if (!groupTitle) return '';
      var match = groupTitle.match(/\(([^)]+)\)\s*$/);
      if (!match) return '';
      return normalizeVariantUnitLabel(String(match[1] || '').trim());
    }

    function formatQtyUnitName(qtyRaw, unitRaw, nameRaw) {
      var qtyNum = Number(qtyRaw);
      var qtyText = Number.isFinite(qtyNum)
        ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
        : String(qtyRaw == null ? '' : qtyRaw).trim();
      var unitText = String(unitRaw || '').trim();
      var nameText = String(nameRaw || '').trim();
      return [qtyText, unitText, nameText].filter(Boolean).join(' ').trim();
    }

    function renderThumbHtml(photosRaw, altRaw) {
      var photos = toCleanPhotos(photosRaw);
      if (!photos.length) return '';
      var alt = escapeHtml(String(altRaw || ''));
      if (photos.length === 1) {
        return '<div class="order-item-photo-small"><img src="' + escapeHtml(photos[0]) + '" alt="' + alt + '" /></div>';
      }
      var slots = [photos[0] || '', photos[2] || '', photos[3] || '', photos[1] || ''];
      return '<div class="order-item-photo-small"><span class="new-order-right-cart-thumb-grid">' +
        slots.map(function (src) {
          return src
            ? '<img src="' + escapeHtml(src) + '" alt="" />'
            : '<span class="new-order-right-cart-thumb-cell-empty"></span>';
        }).join('') +
      '</span></div>';
    }

    function compositionPrimaryLine(text) {
      return '<div class="order-item-composition-item order-item-composition-item-primary">' + escapeHtml(String(text || '').trim()) + '</div>';
    }

    function compositionSubLine(text) {
      return '<div class="order-item-composition-item order-item-composition-item-sub">&bull; ' + escapeHtml(String(text || '').trim()) + '</div>';
    }

    if (String(item && item.type || '') === 'combo') {
      var comboNameRaw = String(item && (item.name || item.combo_title) || 'Комбо');
      var comboQty = Math.max(1, Number(item && (item.qty || item.quantity) || 0));
      var comboLineTotal = Number(item && (item.line_total != null ? item.line_total : (item.total != null ? item.total : item.total_price)) || 0);
      var comboOldLineTotal = Number(item && item.old_line_total || 0);
      var comboShowOldPrice = comboOldLineTotal > comboLineTotal;
      var comboPriceHtml = comboShowOldPrice
        ? '<span class="order-item-old-price">' + money(comboOldLineTotal) + '</span><span class="order-item-price-current">' + money(comboLineTotal) + '</span>'
        : '<span class="order-item-price-current">' + money(comboLineTotal) + '</span>';
      var comboSelections = Array.isArray(item && item.selections) ? item.selections : [];
      var comboRows = [];
      comboSelections.forEach(function (selection) {
        var productName = String(selection && selection.product_name || '').trim();
        var variantHead = mergeVariantUnit(selection && selection.variant_label, selection && selection.variant_unit);
        var primaryLine = [variantHead, productName].filter(Boolean).join(' ').trim();
        if (primaryLine) comboRows.push(compositionPrimaryLine('1 x ' + primaryLine));
        var ingredientsDisplay = Array.isArray(selection && selection.ingredients_display) ? selection.ingredients_display : [];
        ingredientsDisplay.forEach(function (ingredient) {
          var ingredientQty = ingredient && (ingredient.qty != null ? ingredient.qty : ingredient.quantity);
          var ingredientQtyNum = Number(ingredientQty);
          if (!Number.isFinite(ingredientQtyNum) || ingredientQtyNum <= 0) return;
          var ingredientLine = formatQtyUnitName(ingredientQty, ingredient && ingredient.unit, ingredient && ingredient.name);
          if (ingredientLine) comboRows.push(compositionSubLine(ingredientLine));
        });
      });

      return '<div class="order-item cash-refund-order-card order-item--combo" data-item-idx="' + String(itemIndex) + '">' +
        '<div class="order-item-line">' +
          renderThumbHtml(item && item.photos, comboNameRaw) +
          '<div class="order-item-content">' +
            '<div class="order-item-title">' + escapeHtml(String(comboQty) + ' x ' + comboNameRaw) + '</div>' +
            (comboRows.length ? '<div class="order-item-composition">' + comboRows.join('') + '</div>' : '') +
            '<div class="order-item-footer"><div class="order-item-price">' + comboPriceHtml + '</div></div>' +
          '</div>' +
        '</div>' +
      '</div>';
    }

    var nameRaw = String(item && (item.product_name || item.name) || 'Позиция');
    var qty = Math.max(1, Number(item && (item.qty || item.quantity) || 0));
    var lineTotal = Number(item && (item.line_total != null ? item.line_total : (item.total != null ? item.total : (item.total_price != null ? item.total_price : (Number(item && item.price || 0) * qty)))) || 0);
    var oldLineTotal = Number(item && item.discount && item.discount.original_line_total || 0);
    var showOldPrice = oldLineTotal > lineTotal;
    var priceHtml = showOldPrice
      ? '<span class="order-item-old-price">' + money(oldLineTotal) + '</span><span class="order-item-price-current">' + money(lineTotal) + '</span>'
      : '<span class="order-item-price-current">' + money(lineTotal) + '</span>';
    var variantLines = [];
    var variants = Array.isArray(item && item.variants) ? item.variants : [];
    variants.forEach(function (variant) {
      var value = String(variant && (variant.label || variant.value) || '').trim();
      var unit = String(
        variant && (
          variant.unit ||
          variant.unit_short_title ||
          variant.unitLabel ||
          variant.unit_title
        ) ||
        extractVariantUnitFromGroupTitle(variant && (variant.group_title || variant.groupTitle) || '')
      ).trim();
      var line = mergeVariantUnit(value, unit);
      if (line) variantLines.push(line);
    });

    var rawFallbackVariantLabel = String(item && (item.variant_label || item.variantLabel) || '').trim();
    var fallbackVariantValue = rawFallbackVariantLabel;
    if (fallbackVariantValue.indexOf(':') !== -1) {
      var valueOnly = String(fallbackVariantValue.split(':').slice(1).join(':')).trim();
      fallbackVariantValue = valueOnly || fallbackVariantValue;
    }
    var fallbackVariantLine = mergeVariantUnit(
      fallbackVariantValue,
      item && (
        item.variant_unit ||
        item.variantUnit
      ) ||
      extractVariantUnitFromGroupTitle(variants[0] && (variants[0].group_title || variants[0].groupTitle) || '')
    );
    if (!variantLines.length && fallbackVariantLine) {
      variantLines.push(fallbackVariantLine);
    } else if (variantLines.length && fallbackVariantLine) {
      var primaryLine = String(variantLines[0] || '').trim();
      var primaryLower = primaryLine.toLowerCase();
      var fallbackLower = fallbackVariantLine.toLowerCase();
      if (primaryLine && fallbackLower !== primaryLower && fallbackLower.indexOf(primaryLower + ' ') === 0) {
        variantLines[0] = fallbackVariantLine;
      }
    }

    var primaryVariantLine = variantLines.length ? variantLines[0] : '';
    var titleText = [primaryVariantLine, nameRaw].filter(Boolean).join(' ').trim() || nameRaw;
    var lines = [];
    if (variantLines.length > 1) lines = lines.concat(variantLines.slice(1));

    var ingredients = (Array.isArray(item && item.ingredients) ? item.ingredients : []).filter(function (ingredient) {
      return Number(ingredient && (ingredient.quantity != null ? ingredient.quantity : ingredient.qty) || 0) > 0;
    });
    ingredients.forEach(function (ingredient) {
      var ingredientQty = ingredient && (ingredient.quantity != null ? ingredient.quantity : ingredient.qty);
      var ingredientUnit = ingredient && (
        ingredient.unit_label ||
        ingredient.unit ||
        ingredient.unitLabel ||
        ingredient.unit_short_title ||
        ingredient.unit_title
      ) || '';
      var ingredientName = ingredient && ingredient.name || 'Ингредиент';
      var ingredientLine = formatQtyUnitName(ingredientQty, ingredientUnit, ingredientName);
      if (ingredientLine) lines.push(ingredientLine);
    });

    var options = (Array.isArray(item && item.options) ? item.options : []).filter(function (option) {
      return Number(option && (option.qty != null ? option.qty : option.quantity) || 0) > 0;
    });
    options.forEach(function (option) {
      var optionVariant = mergeVariantUnit(option && (option.variant_label || option.variantLabel), option && (option.variant_unit || option.variantUnit));
      var optionQtyText = Math.max(1, Number(option && (option.qty || option.quantity || 1) || 1));
      var optionTitle = String(option && option.title || 'Опция').trim();
      var optionLine = optionVariant ? (optionVariant + ' ' + optionTitle).trim() : (String(optionQtyText) + ' ' + optionTitle).trim();
      if (optionLine) lines.push(optionLine);
    });

    return '<div class="order-item cash-refund-order-card" data-item-idx="' + String(itemIndex) + '">' +
      '<div class="order-item-line">' +
        renderThumbHtml(item && item.photos, nameRaw) +
        '<div class="order-item-content">' +
          '<div class="order-item-title">' + escapeHtml(String(qty) + ' x ' + titleText) + '</div>' +
          (lines.length ? '<div class="order-item-composition">' + lines.map(compositionSubLine).join('') + '</div>' : '') +
          '<div class="order-item-footer"><div class="order-item-price">' + priceHtml + '</div></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  function toggleCashPaymentModalSkin(enabled) {
    var appModalEl = document.getElementById('appModal');
    var appModalBodyEl = document.getElementById('appModalBody');
    if (appModalEl) appModalEl.classList.toggle('cash-payment-app-modal', !!enabled);
    if (appModalBodyEl) appModalBodyEl.classList.toggle('cash-payment-app-modal-body', !!enabled);
  }

  function translateOrderSettlementError(err, mode) {
    var code = String(err && err.message || '').trim();
    if (mode === 'refund') {
      if (code === 'BAD_PAYMENT_CODE') return 'Не удалось сохранить выбранный способ возврата';
      if (code === 'BAD_REFUND_ITEMS') return 'Выберите позиции для возврата';
      if (code === 'OVER_REFUND') return 'Нельзя вернуть больше оставшейся суммы';
      if (code === 'ORDER_NOT_PAID') return 'Возврат доступен только для оплаченных заказов';
      if (code === 'NOT_REFUNDABLE') return 'По этому заказу больше нечего возвращать';
      if (code === 'NOT_FOUND') return 'Заказ не найден';
      return code || 'Не удалось оформить возврат';
    }
    if (code === 'BAD_PAYMENT_CODE') return 'Не удалось сохранить выбранный способ оплаты';
    if (code === 'BAD_CHANGE_FROM') return 'Сумма от клиента должна быть больше суммы заказа';
    if (code === 'BAD_IS_PAID') return 'Не удалось подтвердить оплату';
    if (code === 'NOT_FOUND') return 'Заказ не найден';
    return code || 'Не удалось принять оплату';
  }

  function translateCashPaymentError(err) {
    var code = String(err && err.message || '').trim();
    if (code === 'BAD_PAYMENT_CODE') return 'Не удалось сохранить выбранный способ оплаты';
    if (code === 'BAD_CHANGE_FROM') return 'Сумма от клиента должна быть больше суммы заказа';
    if (code === 'BAD_IS_PAID') return 'Не удалось подтвердить оплату';
    if (code === 'NOT_FOUND') return 'Заказ не найден';
    return code || 'Не удалось принять оплату';
  }

  function createCashPaymentModalController(options) {
    var order = options && options.order ? options.order : null;
    var paymentMethods = Array.isArray(options && options.paymentMethods) ? options.paymentMethods : [];
    var money = typeof (options && options.money) === 'function'
      ? options.money
      : function (value) { return String(Number(value || 0)) + ' ₽'; };
    var formatDateTimeNumeric = typeof (options && options.formatDateTimeNumeric) === 'function'
      ? options.formatDateTimeNumeric
      : function () { return ''; };
    var getNumber = typeof (options && options.getOrderNumber) === 'function'
      ? options.getOrderNumber
      : getOrderNumber;
    var totalDue = Number(order && order.total_price || 0) || 0;
    var draft = resolveCashPaymentDraft(order, paymentMethods);
    var host = document.createElement('div');
    var currentError = '';

    function isChangeOptionDisabled(option) {
      if (!option || option.value === 'no_change' || option.value === 'other') return false;
      return Number(String(option.value || '').replace(/[^\d]/g, '')) <= totalDue;
    }

    function setError(message) {
      currentError = String(message || '').trim();
      var errorEl = host.querySelector('[data-cash-payment-error]');
      if (!errorEl) return;
      errorEl.textContent = currentError;
      errorEl.classList.toggle('hidden', !currentError);
    }

    function syncComputedCards() {
      var isCashPayment = isCashPaymentCode(draft.paymentCode);
      var changeFrom = resolveCashPaymentChangeFrom(draft);
      var changeAmount = changeFrom != null ? Math.max(0, changeFrom - totalDue) : 0;
      var receivedCard = host.querySelector('[data-cash-payment-received-card]');
      var changeCard = host.querySelector('[data-cash-payment-change-card]');
      var receivedValue = host.querySelector('[data-cash-payment-received]');
      var changeValue = host.querySelector('[data-cash-payment-change]');
      if (receivedValue) receivedValue.textContent = changeFrom != null ? money(changeFrom) : '—';
      if (changeValue) changeValue.textContent = changeFrom != null && changeFrom > totalDue ? money(changeAmount) : '—';
      if (receivedCard) receivedCard.classList.toggle('hidden', !isCashPayment || changeFrom == null);
      if (changeCard) changeCard.classList.toggle('hidden', !isCashPayment || !(changeFrom != null && changeFrom > totalDue));
    }

    function render(opts) {
      opts = opts || {};
      var isCashPayment = isCashPaymentCode(draft.paymentCode);
      var createdAt = formatDateTimeNumeric(order && order.created_at);
      var customerName = String(order && order.customer_name || '').trim() || 'Клиент';
      var customerPhone = String(order && order.customer_phone || '').trim() || '—';

      var orderHeading = String(order && order.order_heading || '').trim();
      host.className = 'cash-payment-modal';
      host.innerHTML =
        '<div class="cash-payment-order-card">' +
          '<div class="cash-payment-order-kicker">Принять оплату</div>' +
          '<div class="cash-payment-order-meta">' +
            '<div class="cash-payment-order-main">' +
              '<div class="cash-payment-order-number">' + escapeHtml(orderHeading || ('Заказ #' + getNumber(order))) + '</div>' +
              '<div class="cash-payment-order-subtitle">' + escapeHtml(createdAt || '—') + '</div>' +
            '</div>' +
            '<div class="cash-payment-order-total-wrap">' +
              '<span>К оплате</span>' +
              '<strong>' + escapeHtml(money(totalDue)) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Клиент</div>' +
          '<div class="cash-payment-customer-card">' +
            '<div class="cash-payment-customer-row"><span>Имя</span><strong>' + escapeHtml(customerName) + '</strong></div>' +
            '<div class="cash-payment-customer-row"><span>Телефон</span><strong>' + escapeHtml(customerPhone) + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Способ оплаты</div>' +
          '<div class="cash-payment-method-carousel">' +
            '<span class="cash-payment-method-spacer" aria-hidden="true"></span>' +
            paymentMethods.map(function (item) {
              var code = String(item && item.code || '').trim();
              var active = code === String(draft.paymentCode || '').trim();
              return '<button class="cash-payment-method-pill' + (active ? ' is-active' : '') + '" type="button" data-cash-payment-method="' + escapeHtml(code) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
                '<span class="cash-payment-method-pill-icon">' + renderPaymentMethodIcon(item) + '</span>' +
                '<span class="cash-payment-method-pill-title">' + escapeHtml(String(item && item.title || code || 'Оплата')) + '</span>' +
              '</button>';
            }).join('') +
            '<span class="cash-payment-method-spacer" aria-hidden="true"></span>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-amount-grid">' +
          '<div class="cash-payment-amount-card cash-payment-amount-card-primary"><span>К оплате</span><strong>' + escapeHtml(money(totalDue)) + '</strong></div>' +
          '<div class="cash-payment-amount-card hidden" data-cash-payment-received-card><span>Получено</span><strong data-cash-payment-received>—</strong></div>' +
          '<div class="cash-payment-amount-card hidden" data-cash-payment-change-card><span>Сдача</span><strong data-cash-payment-change>—</strong></div>' +
        '</div>' +
        (isCashPayment
          ? '<div class="cash-payment-section">' +
              '<div class="cash-payment-section-title">Сдача</div>' +
              '<div class="cash-payment-change-grid">' +
                CASH_CHANGE_OPTIONS.map(function (option) {
                  var value = String(option && option.value || '').trim();
                  var active = value === String(draft.changeType || 'no_change').trim();
                  var disabled = isChangeOptionDisabled(option);
                  return '<button class="cash-payment-change-pill' + (active ? ' is-active' : '') + (disabled ? ' is-disabled' : '') + '" type="button" data-cash-change-option="' + escapeHtml(value) + '"' + (disabled ? ' disabled' : '') + '>' + escapeHtml(String(option && option.label || value)) + '</button>';
                }).join('') +
              '</div>' +
              (String(draft.changeType || '') === 'other'
                ? '<label class="cash-payment-input-card">' +
                    '<span class="cash-payment-input-label">Сумма от клиента</span>' +
                    '<input class="control" type="text" inputmode="numeric" value="' + escapeHtml(String(draft.changeAmount || '')) + '" placeholder="Больше ' + escapeHtml(money(totalDue)) + '" data-cash-change-input />' +
                  '</label>'
                : '') +
            '</div>'
          : '') +
        '<div class="cash-modal-error hidden" data-cash-payment-error></div>';

      syncComputedCards();
      setError(currentError);
      if (opts.focusChangeInput) {
        window.requestAnimationFrame(function () {
          var input = host.querySelector('[data-cash-change-input]');
          if (input && typeof input.focus === 'function') {
            input.focus();
            if (typeof input.select === 'function') input.select();
          }
        });
      }
    }

    host.addEventListener('click', function (event) {
      var methodBtn = event.target && event.target.closest('[data-cash-payment-method]');
      if (methodBtn) {
        draft.paymentCode = String(methodBtn.getAttribute('data-cash-payment-method') || '').trim();
        if (!isCashPaymentCode(draft.paymentCode)) {
          draft.changeType = 'no_change';
          draft.changeAmount = '';
        }
        setError('');
        render();
        return;
      }
      var changeBtn = event.target && event.target.closest('[data-cash-change-option]');
      if (changeBtn) {
        draft.changeType = String(changeBtn.getAttribute('data-cash-change-option') || 'no_change').trim() || 'no_change';
        if (draft.changeType !== 'other') draft.changeAmount = '';
        setError('');
        render({ focusChangeInput: draft.changeType === 'other' });
      }
    });

    host.addEventListener('input', function (event) {
      var input = event.target && event.target.closest('[data-cash-change-input]');
      if (!input) return;
      draft.changeAmount = normalizeCashPaymentAmount(input.value);
      if (input.value !== draft.changeAmount) input.value = draft.changeAmount;
      setError('');
      syncComputedCards();
    });

    render();

    return {
      host: host,
      getPayload: function () {
        var error = validateCashPaymentDraft(draft, totalDue, paymentMethods);
        if (error) {
          setError(error);
          return null;
        }
        setError('');
        return {
          is_paid: 1,
          payment_code: String(draft.paymentCode || '').trim(),
          change_from: resolveCashPaymentChangeFrom(draft),
        };
      },
      setError: setError,
    };
  }

  function createRefundModalController(options) {
    var order = options && options.order ? options.order : null;
    var paymentMethods = Array.isArray(options && options.paymentMethods) ? options.paymentMethods : [];
    var money = typeof (options && options.money) === 'function'
      ? options.money
      : function (value) { return String(roundMoney(value || 0)) + ' ₽'; };
    var formatDateTimeNumeric = typeof (options && options.formatDateTimeNumeric) === 'function'
      ? options.formatDateTimeNumeric
      : function () { return ''; };
    var getNumber = typeof (options && options.getOrderNumber) === 'function'
      ? options.getOrderNumber
      : getOrderNumber;
    var refundableItems = getRefundableItems(order).filter(function (item) {
      return Number(item && item.remaining_qty || 0) > 0;
    });
    var deliveryRefundableTotal = roundMoney(order && order.delivery_refundable_total || 0);
    var alreadyRefunded = roundMoney(order && order.refunded_total || 0);
    var totalAvailable = roundMoney(order && (order.refundable_total != null ? order.refundable_total : order.total_price) || 0);
    var defaultPaymentCode = String(order && order.payment_code || '').trim();
    var availableCodes = paymentMethods.map(function (item) {
      return String(item && item.code || '').trim();
    }).filter(Boolean);
    var host = document.createElement('div');
    var currentError = '';
    var draft = {
      paymentCode: availableCodes.indexOf(defaultPaymentCode) !== -1 ? defaultPaymentCode : (availableCodes[0] || defaultPaymentCode || 'cash'),
      comment: '',
      selectedByIndex: {},
    };
    var refundableItemsForRender = refundableItems.slice().sort(function (left, right) {
      var leftAuto = isAutoAddRefundItem(left);
      var rightAuto = isAutoAddRefundItem(right);
      if (leftAuto && !rightAuto) return 1;
      if (!leftAuto && rightAuto) return -1;
      return 0;
    });

    refundableItems.forEach(function (item) {
      draft.selectedByIndex[String(item.source_item_index)] = normalizeRefundQty(item.remaining_qty || 0);
    });

    function setError(message) {
      currentError = String(message || '').trim();
      var errorEl = host.querySelector('[data-cash-payment-error]');
      if (!errorEl) return;
      errorEl.textContent = currentError;
      errorEl.classList.toggle('hidden', !currentError);
    }

    function getSelectedQty(item) {
      return normalizeRefundQty(draft.selectedByIndex[String(item.source_item_index)] || 0);
    }

    function setSelectedQty(item, qty) {
      var nextQty = Math.max(0, Math.min(normalizeRefundQty(item.remaining_qty || 0), normalizeRefundQty(qty || 0)));
      if (nextQty > 0) draft.selectedByIndex[String(item.source_item_index)] = nextQty;
      else delete draft.selectedByIndex[String(item.source_item_index)];
    }

    function getPreview() {
      var itemsTotal = refundableItems.reduce(function (sum, item) {
        var qty = getSelectedQty(item);
        if (!(qty > 0)) return sum;
        return sum + computeRefundLineAmount(item, qty);
      }, 0);
      itemsTotal = roundMoney(itemsTotal);
      var includeDelivery = isFullRefundSelection(refundableItems, draft.selectedByIndex) && deliveryRefundableTotal > 0;
      return {
        itemsTotal: itemsTotal,
        deliveryAmount: includeDelivery ? deliveryRefundableTotal : 0,
        totalAmount: roundMoney(itemsTotal + (includeDelivery ? deliveryRefundableTotal : 0)),
        includeDelivery: includeDelivery,
      };
    }

    function render() {
      var createdAt = formatDateTimeNumeric(order && order.created_at);
      var customerName = String(order && order.customer_name || '').trim() || 'Клиент';
      var customerPhone = String(order && order.customer_phone || '').trim() || '—';
      var preview = getPreview();
      host.className = 'cash-payment-modal';
      host.innerHTML =
        '<div class="cash-payment-order-card">' +
          '<div class="cash-payment-order-kicker">Оформить возврат</div>' +
          '<div class="cash-payment-order-meta">' +
            '<div class="cash-payment-order-main">' +
              '<div class="cash-payment-order-number">' + escapeHtml('Заказ #' + getNumber(order)) + '</div>' +
              '<div class="cash-payment-order-subtitle">' + escapeHtml(createdAt || '—') + '</div>' +
            '</div>' +
            '<div class="cash-payment-order-total-wrap">' +
              '<span>Доступно</span>' +
              '<strong>' + escapeHtml(money(totalAvailable)) + '</strong>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Клиент</div>' +
          '<div class="cash-payment-customer-card">' +
            '<div class="cash-payment-customer-row"><span>Имя</span><strong>' + escapeHtml(customerName) + '</strong></div>' +
            '<div class="cash-payment-customer-row"><span>Телефон</span><strong>' + escapeHtml(customerPhone) + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Способ возврата</div>' +
          '<div class="cash-payment-method-carousel">' +
            '<span class="cash-payment-method-spacer" aria-hidden="true"></span>' +
            paymentMethods.map(function (item) {
              var code = String(item && item.code || '').trim();
              var active = code === String(draft.paymentCode || '').trim();
              return '<button class="cash-payment-method-pill' + (active ? ' is-active' : '') + '" type="button" data-cash-payment-method="' + escapeHtml(code) + '" aria-pressed="' + (active ? 'true' : 'false') + '">' +
                '<span class="cash-payment-method-pill-icon">' + renderPaymentMethodIcon(item) + '</span>' +
                '<span class="cash-payment-method-pill-title">' + escapeHtml(String(item && item.title || code || 'Возврат')) + '</span>' +
              '</button>';
            }).join('') +
            '<span class="cash-payment-method-spacer" aria-hidden="true"></span>' +
          '</div>' +
        '</div>' +
        '<div class="cash-payment-amount-grid">' +
          '<div class="cash-payment-amount-card cash-payment-amount-card-primary"><span>К возврату</span><strong>' + escapeHtml(money(preview.totalAmount)) + '</strong></div>' +
          '<div class="cash-payment-amount-card"><span>Уже возвращено</span><strong>' + escapeHtml(money(alreadyRefunded)) + '</strong></div>' +
          '<div class="cash-payment-amount-card"><span>Осталось</span><strong>' + escapeHtml(money(totalAvailable)) + '</strong></div>' +
        '</div>' +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Позиции к возврату</div>' +
          (refundableItems.length
            ? '<div class="cash-refund-list">' + refundableItemsForRender.map(function (item) {
                var key = String(item.source_item_index);
                var selectedQty = getSelectedQty(item);
                var active = selectedQty > 0;
                var displaySnapshot = buildRefundDisplaySnapshot(item, selectedQty);
                var displayAmount = active
                  ? computeRefundLineAmount(item, selectedQty)
                  : roundMoney(item.remaining_line_total || 0);
                return '<div class="cash-refund-item' + (active ? ' is-selected' : '') + '">' +
                  '<button class="cash-refund-toggle' + (active ? ' is-selected' : '') + '" type="button" data-refund-toggle="' + escapeHtml(key) + '" aria-pressed="' + (active ? 'true' : 'false') + '"><i class="fas fa-check"></i></button>' +
                  '<div class="cash-refund-main">' +
                    renderDetailedOrderItemHtml(displaySnapshot, { money: money, itemIndex: Number(item.source_item_index || 0) }) +
                    '<div class="cash-refund-meta">' + escapeHtml(active ? 'К возврату: ' : 'Доступно к возврату: ') + escapeHtml(money(displayAmount)) + '</div>' +
                    '<div class="cash-refund-meta">Осталось: ' + escapeHtml(String(normalizeRefundQty(item.remaining_qty || 0))) + ' шт. · уже возвращено ' + escapeHtml(money(item.refunded_line_total || 0)) + '</div>' +
                    (Number(item.remaining_qty || 0) > 1
                      ? '<div class="cash-refund-qty"><button type="button" class="cash-refund-qty-btn" data-refund-minus="' + escapeHtml(key) + '">−</button><span class="cash-refund-qty-value">' + escapeHtml(String(selectedQty || 0)) + '</span><button type="button" class="cash-refund-qty-btn is-plus" data-refund-plus="' + escapeHtml(key) + '">+</button></div>'
                      : '<div class="cash-refund-meta">Количество к возврату: ' + escapeHtml(String(selectedQty || 0)) + '</div>') +
                  '</div>' +
                '</div>';
              }).join('') + '</div>'
            : '<div class="cash-refund-empty">По этому заказу больше нечего возвращать.</div>') +
        '</div>' +
        (preview.includeDelivery ? '<div class="cash-refund-note"><i class="fas fa-truck"></i><span>Доставка будет возвращена автоматически: ' + escapeHtml(money(preview.deliveryAmount)) + '</span></div>' : '') +
        '<div class="cash-payment-section">' +
          '<div class="cash-payment-section-title">Комментарий</div>' +
          '<label class="cash-payment-input-card">' +
            '<span class="cash-payment-input-label">Причина или заметка</span>' +
            '<textarea class="control cash-refund-textarea" rows="3" placeholder="Например: клиент отказался от позиции" data-refund-comment>' + escapeHtml(draft.comment) + '</textarea>' +
          '</label>' +
        '</div>' +
        '<div class="cash-modal-error hidden" data-cash-payment-error></div>';
      setError(currentError);
    }

    host.addEventListener('click', function (event) {
      var methodBtn = event.target && event.target.closest('[data-cash-payment-method]');
      if (methodBtn) {
        draft.paymentCode = String(methodBtn.getAttribute('data-cash-payment-method') || '').trim();
        setError('');
        render();
        return;
      }
      var toggleBtn = event.target && event.target.closest('[data-refund-toggle]');
      if (toggleBtn) {
        var toggleKey = String(toggleBtn.getAttribute('data-refund-toggle') || '');
        var toggleItem = refundableItems.find(function (item) { return String(item.source_item_index) === toggleKey; }) || null;
        if (!toggleItem) return;
        if (getSelectedQty(toggleItem) > 0) setSelectedQty(toggleItem, 0);
        else setSelectedQty(toggleItem, Number(toggleItem.remaining_qty || 0));
        setError('');
        render();
        return;
      }
      var minusBtn = event.target && event.target.closest('[data-refund-minus]');
      if (minusBtn) {
        var minusKey = String(minusBtn.getAttribute('data-refund-minus') || '');
        var minusItem = refundableItems.find(function (item) { return String(item.source_item_index) === minusKey; }) || null;
        if (!minusItem) return;
        setSelectedQty(minusItem, getSelectedQty(minusItem) - 1);
        setError('');
        render();
        return;
      }
      var plusBtn = event.target && event.target.closest('[data-refund-plus]');
      if (plusBtn) {
        var plusKey = String(plusBtn.getAttribute('data-refund-plus') || '');
        var plusItem = refundableItems.find(function (item) { return String(item.source_item_index) === plusKey; }) || null;
        if (!plusItem) return;
        setSelectedQty(plusItem, getSelectedQty(plusItem) + 1);
        setError('');
        render();
      }
    });

    host.addEventListener('input', function (event) {
      var commentField = event.target && event.target.closest('[data-refund-comment]');
      if (!commentField) return;
      draft.comment = String(commentField.value || '');
      setError('');
    });

    render();

    return {
      host: host,
      getPayload: function () {
        var items = refundableItems.map(function (item) {
          var qty = getSelectedQty(item);
          if (!(qty > 0)) return null;
          return {
            source_item_index: Number(item.source_item_index || 0),
            qty: qty,
          };
        }).filter(Boolean);
        if (!String(draft.paymentCode || '').trim()) {
          setError('Выберите способ возврата');
          return null;
        }
        if (!items.length) {
          setError('Выберите позиции для возврата');
          return null;
        }
        setError('');
        return {
          payment_code: String(draft.paymentCode || '').trim(),
          comment: String(draft.comment || '').trim() || null,
          items: items,
        };
      },
      setError: setError,
    };
  }

  function open(options) {
    options = options || {};
    var order = options.order || null;
    var apiJson = options.apiJson;
    var collectPayloadOnly = !!options.collectPayloadOnly;
    var cacheOnlyPaymentMethods = !!options.cacheOnlyPaymentMethods;
    var money = typeof options.money === 'function' ? options.money : function (value) { return String(value || 0); };
    var formatDateTimeNumeric = typeof options.formatDateTimeNumeric === 'function' ? options.formatDateTimeNumeric : function () { return ''; };
    var getOrderIdFn = typeof options.getOrderId === 'function' ? options.getOrderId : getOrderId;
    var getOrderNumberFn = typeof options.getOrderNumber === 'function' ? options.getOrderNumber : getOrderNumber;
    var isPaidOrderFn = typeof options.isPaidOrder === 'function' ? options.isPaidOrder : isPaidOrder;
    var submitPayload = typeof options.submitPayload === 'function' ? options.submitPayload : null;
    var onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : function () {};
    var onError = typeof options.onError === 'function'
      ? options.onError
      : function (err) { console.error('shared order payment error:', err); };
    var modal = window.AppModal;
    var orderId = getOrderIdFn(order);

    if (typeof apiJson !== 'function') return Promise.resolve(null);
    if (!collectPayloadOnly && !(orderId > 0)) return Promise.resolve(null);

    if (!modal || typeof modal.open !== 'function') {
      if (collectPayloadOnly) return Promise.resolve(null);
      return apiJson('/api/admin/orders/' + orderId + '/paid', {
        method: 'PUT',
        body: { is_paid: 1 },
      }).then(function (json) {
        onSuccess(json && json.data);
        return json && json.data || null;
      }).catch(function (err) {
        onError(err);
        return null;
      });
    }

    return ensurePaymentMethodsLoaded(apiJson, order).then(function (paymentMethods) {
      var methods = Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : getActivePaymentMethods(order);
      var paymentController = createCashPaymentModalController({
        order: order,
        paymentMethods: methods,
        money: money,
        formatDateTimeNumeric: formatDateTimeNumeric,
        getOrderNumber: getOrderNumberFn,
      });
      return new Promise(function (resolve) {
        var resolved = false;
        function finish(value) {
          if (resolved) return;
          resolved = true;
          resolve(value == null ? null : value);
        }
        toggleCashPaymentModalSkin(true);
        modal.open({
          title: 'Принять оплату',
          saveText: 'Принять оплату',
          cancelText: 'Отмена',
          content: paymentController.host,
          onSave: function () {
            var payload = paymentController.getPayload();
            if (!payload) return false;
            if (collectPayloadOnly) {
              finish(payload);
              return true;
            }
            return apiJson('/api/admin/orders/' + orderId + '/paid', {
              method: 'PUT',
              body: payload,
            }).then(function (json) {
              var data = json && json.data || null;
              onSuccess(data);
              finish(data);
              return true;
            }).catch(function (err) {
              paymentController.setError(translateCashPaymentError(err));
              return false;
            });
          },
          onClose: function () {
            toggleCashPaymentModalSkin(false);
            finish(null);
          },
        });
      });
    }).catch(function (err) {
      onError(err);
      return null;
    });
  }

  function open(options) {
    options = options || {};
    var order = options.order || null;
    var apiJson = options.apiJson;
    var collectPayloadOnly = !!options.collectPayloadOnly;
    var cacheOnlyPaymentMethods = !!options.cacheOnlyPaymentMethods;
    var money = typeof options.money === 'function' ? options.money : function (value) { return String(value || 0); };
    var formatDateTimeNumeric = typeof options.formatDateTimeNumeric === 'function' ? options.formatDateTimeNumeric : function () { return ''; };
    var getOrderIdFn = typeof options.getOrderId === 'function' ? options.getOrderId : getOrderId;
    var getOrderNumberFn = typeof options.getOrderNumber === 'function' ? options.getOrderNumber : getOrderNumber;
    var isPaidOrderFn = typeof options.isPaidOrder === 'function' ? options.isPaidOrder : isPaidOrder;
    var submitPayload = typeof options.submitPayload === 'function' ? options.submitPayload : null;
    var onSuccess = typeof options.onSuccess === 'function' ? options.onSuccess : function () {};
    var onError = typeof options.onError === 'function'
      ? options.onError
      : function (err) { console.error('shared order payment error:', err); };
    var modal = window.AppModal;
    var orderId = getOrderIdFn(order);

    if (typeof apiJson !== 'function') return Promise.resolve(null);
    if (!collectPayloadOnly && !(orderId > 0)) return Promise.resolve(null);

    var latestOrderPromise = collectPayloadOnly || !(orderId > 0)
      ? Promise.resolve(order)
      : apiJson('/api/admin/orders/' + orderId).then(function (json) {
          return json && json.data ? json.data : order;
        });

    return latestOrderPromise.then(function (latestOrder) {
      var resolvedOrder = latestOrder || order || null;
      var paid = isPaidOrderFn(resolvedOrder);
      var refundState = getRefundState(resolvedOrder);
      var refundableTotal = roundMoney(resolvedOrder && resolvedOrder.refundable_total != null ? resolvedOrder.refundable_total : 0);
      var mode = paid ? 'refund' : 'payment';

      if (collectPayloadOnly && mode !== 'payment') return null;
      if (mode === 'refund' && !(refundableTotal > 0) && refundState === 'full') return null;
      if (mode === 'refund' && !(refundableTotal > 0)) return null;

      if (!modal || typeof modal.open !== 'function') {
        if (collectPayloadOnly || mode !== 'payment') return null;
        return apiJson('/api/admin/orders/' + orderId + '/paid', {
          method: 'PUT',
          body: { is_paid: 1 },
        }).then(function (json) {
          var data = json && json.data || null;
          onSuccess(data);
          return data;
        }).catch(function (err) {
          onError(err);
          return null;
        });
      }

      return ensurePaymentMethodsLoaded(apiJson, resolvedOrder, {
        cacheOnly: cacheOnlyPaymentMethods,
      }).then(function (paymentMethods) {
        var methods = Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : getActivePaymentMethods(resolvedOrder);
        var controller = mode === 'refund'
          ? createRefundModalController({
              order: resolvedOrder,
              paymentMethods: methods,
              money: money,
              formatDateTimeNumeric: formatDateTimeNumeric,
              getOrderNumber: getOrderNumberFn,
            })
          : createCashPaymentModalController({
              order: resolvedOrder,
              paymentMethods: methods,
              money: money,
              formatDateTimeNumeric: formatDateTimeNumeric,
              getOrderNumber: getOrderNumberFn,
            });

        return new Promise(function (resolve) {
          var resolved = false;
          function finish(value) {
            if (resolved) return;
            resolved = true;
            resolve(value == null ? null : value);
          }

          toggleCashPaymentModalSkin(true);
          modal.open({
            title: mode === 'refund' ? 'Оформить возврат' : 'Принять оплату',
            saveText: mode === 'refund' ? 'Оформить возврат' : 'Принять оплату',
            cancelText: 'Отмена',
            content: controller.host,
            onSave: function () {
              var payload = controller.getPayload();
              if (!payload) return false;
              if (collectPayloadOnly) {
                finish(payload);
                return true;
              }
              if (submitPayload) {
                return Promise.resolve(submitPayload({
                  mode: mode,
                  order: resolvedOrder,
                  orderId: orderId,
                  payload: payload,
                })).then(function (result) {
                  var data = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data')
                    ? result.data
                    : result;
                  if (data) onSuccess(data);
                  finish(data);
                  return true;
                }).catch(function (err) {
                  controller.setError(translateOrderSettlementError(err, mode));
                  return false;
                });
              }
              return apiJson(
                mode === 'refund'
                  ? '/api/admin/orders/' + orderId + '/refunds'
                  : '/api/admin/orders/' + orderId + '/paid',
                {
                  method: mode === 'refund' ? 'POST' : 'PUT',
                  body: payload,
                }
              ).then(function (json) {
                var data = json && json.data || null;
                onSuccess(data);
                finish(data);
                return true;
              }).catch(function (err) {
                controller.setError(translateOrderSettlementError(err, mode));
                return false;
              });
            },
            onClose: function () {
              toggleCashPaymentModalSkin(false);
              finish(null);
            },
          });
        });
      });
    }).catch(function (err) {
      onError(err);
      return null;
    });
  }

  function getRefundStateTitle(order) {
    var state = getRefundState(order);
    if (state === 'full') return 'Возвращено';
    if (state === 'partial') return 'Частичный возврат';
    return '';
  }

  window.SharedOrderPayment = {
    open: open,
    getRefundState: getRefundState,
    getRefundStateTitle: getRefundStateTitle,
    warmCache: function (apiJson, order) {
      return ensurePaymentMethodsLoaded(apiJson, order);
    },
    hasCachedMethods: function (order) {
      return getActivePaymentMethods(order).length > 0;
    },
    getPaymentMethodMeta: getPaymentMethodMeta,
    clearCache: function () {
      paymentMethodsCache = [];
      paymentMethodsPromise = null;
      paymentMethodsCacheStorageKey = '';
    },
  };
})();
