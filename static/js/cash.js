(function () {
  if (typeof window !== 'undefined' && window.__cashPageInitialized) return;
  if (typeof window !== 'undefined') {
    window.__cashPageInitialized = true;
  }

  try {
    var filtersEl = document.getElementById('cashJournalFilters');
    var journalListEl = document.getElementById('cashJournalList');
    var journalEmptyEl = document.getElementById('cashJournalEmpty');
    var summaryCardsEl = document.getElementById('cashSummaryCards');
    var sidebarSummaryEl = document.getElementById('cashSidebarSummary');
    var cashRightPaneEl = document.getElementById('cashOrdersRightPane');
    var cashOrderInfoRootEl = document.getElementById('cashOrderInfoRoot');
    var cashOrderTabsHeaderEl = document.getElementById('cashOrderTabsHeader');
    var cashOrderTabsEl = document.getElementById('cashOrderTabs');
    var cashOrderInfoFooterEl = document.getElementById('cashOrderInfoFooter');
    var cashOrderPaymentBtnEl = document.getElementById('cashOrderPaymentBtn');
    var appModalEl = document.getElementById('appModal');
    var appModalBodyEl = document.getElementById('appModalBody');
    var sectionTitleEl = document.getElementById('cashSectionTitle');
    var orderFilterWrapEl = document.getElementById('cashOrderFilterWrap');
    var orderFilterBtnEl = document.getElementById('cashOrderFilterBtn');
    var orderFilterLabelEl = document.getElementById('cashOrderFilterLabel');
    var orderFilterMenuEl = document.getElementById('cashOrderFilterMenu');
    var dateBtn = document.getElementById('cashDateBtn');
    var dateLabel = document.getElementById('cashDateLabel');
    var datePopover = document.getElementById('cashDatePopover');
    var dateGrid = document.getElementById('cashDateGrid');
    var dateTitle = document.getElementById('cashDateTitle');
    var datePrev = document.getElementById('cashDatePrev');
    var dateNext = document.getElementById('cashDateNext');
    var dateReset = document.getElementById('cashDateReset');
    var sharedOrderPanel = window.SharedOrderPanel || null;
    var sharedOrderPayment = window.SharedOrderPayment || null;
    var clientInfoWrap = document.getElementById('clientInfoWrap');
    var clientPhoto = document.getElementById('clientPhoto');
    var clientPhotoPlaceholder = document.getElementById('clientPhotoPlaceholder');
    var clientInfoName = document.getElementById('clientInfoName');
    var clientInfoPhone = document.getElementById('clientInfoPhone');
    var clientInfoBirthday = document.getElementById('clientInfoBirthday');
    var clientContentTabs = document.getElementById('clientContentTabs');
    var clientTabAddresses = document.getElementById('clientTabAddresses');
    var clientTabOrders = document.getElementById('clientTabOrders');
    var clientTabDiscounts = document.getElementById('clientTabDiscounts');
    var clientAddressesList = document.getElementById('clientAddresses');
    var clientOrdersList = document.getElementById('clientOrdersList');
    var clientOrdersListView = document.getElementById('clientOrdersListView');
    var clientOrderDetailView = document.getElementById('clientOrderDetailView');
    var clientDiscountsList = document.getElementById('clientDiscountsList');
    var clientDiscountsEmpty = document.getElementById('clientDiscountsEmpty');
    if (!journalListEl) return;

    var WAIT_TIMEOUT_MS = 20000;
    var WAIT_RETRY_MS = 1500;
    var CASH_CHANGE_OPTIONS = [
      { value: 'no_change', label: 'Без сдачи' },
      { value: '500', label: '500 ₽' },
      { value: '1000', label: '1000 ₽' },
      { value: '2000', label: '2000 ₽' },
      { value: '5000', label: '5000 ₽' },
      { value: 'other', label: 'Другая сумма' },
    ];
    var clickTimer = null;
    var waitAbortController = null;
    var state = {
      statuses: [],
      orders: [],
      paymentMethods: [],
      paymentMethodsPromise: null,
      currentSection: 'orders',
      orderFilter: 'all',
      orderFilterMenuOpen: false,
      dayGroupsCollapsed: {},
      storeTimezone: '+0',
      activeOrderId: 0,
      eventsCursor: 0,
      waitLoopToken: 0,
      loading: false,
      loadPromise: null,
      clientsCache: new Map(),
      date: { start: null, end: null, viewYear: null, viewMonth: null },
    };
    var tabsState = { tabs: [], activeKey: null };

    function apiJson(url, opts) {
      opts = opts || {};
      var token = localStorage.getItem('authToken');
      var storeId = localStorage.getItem('activeStoreId') || '1';
      var headers = {};
      var body = opts.body;
      if (body != null) headers['Content-Type'] = 'application/json';
      if (opts.headers) {
        Object.keys(opts.headers).forEach(function (key) {
          headers[key] = opts.headers[key];
        });
      }
      if (token) headers.Authorization = 'Bearer ' + token;
      headers['x-store-id'] = storeId;
      return fetch(url, {
        method: opts.method || 'GET',
        cache: opts.cache || 'no-store',
        headers: headers,
        signal: opts.signal,
        body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
      }).then(function (res) {
        if (res.status === 401) {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('tenant');
          window.location.href = '/login';
          throw new Error('UNAUTHORIZED');
        }
        return res.json().catch(function () { return null; }).then(function (json) {
          if (!json || json.ok !== true) throw new Error((json && json.error) || ('API_ERROR_' + String(res.status || 0)));
          return json;
        });
      });
    }

    function sleepMs(ms) {
      return new Promise(function (resolve) { window.setTimeout(resolve, Math.max(0, Number(ms || 0))); });
    }

    function isAbortError(err) {
      if (!err) return false;
      var name = String(err.name || '').toLowerCase();
      if (name === 'aborterror') return true;
      var message = String(err.message || '').toLowerCase();
      return message.indexOf('aborted') !== -1;
    }

    function money(value) {
      var numeric = Number(value || 0);
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(Number.isFinite(numeric) ? numeric : 0) + ' ₽';
    }

    function formatCount(value) {
      var numeric = Number(value || 0);
      return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number.isFinite(numeric) ? numeric : 0);
    }

    function escapeHtml(value) {
      return String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function normalizeText(value) {
      return String(value == null ? '' : value).trim().toLowerCase();
    }

    function parseLocalDateParts(ts) {
      if (!ts) return null;
      var raw = String(ts).trim();
      var match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] || 0) };
      }
      var fallback = new Date(raw.replace(' ', 'T'));
      if (isNaN(fallback.getTime())) return null;
      return { year: fallback.getFullYear(), month: fallback.getMonth() + 1, day: fallback.getDate(), hour: fallback.getHours(), minute: fallback.getMinutes(), second: fallback.getSeconds() };
    }

    function partsToDate(parts) {
      if (!parts) return null;
      return new Date(Number(parts.year || 0), Number(parts.month || 1) - 1, Number(parts.day || 1), Number(parts.hour || 0), Number(parts.minute || 0), Number(parts.second || 0), 0);
    }

    function formatTime(ts) {
      var parts = parseLocalDateParts(ts);
      if (!parts) return '';
      return String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
    }

    function formatDateTime(ts) {
      var date = partsToDate(parseLocalDateParts(ts));
      if (!date || isNaN(date.getTime())) return '';
      return date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }

    function formatDateTimeNumeric(ts) {
      var parts = parseLocalDateParts(ts);
      if (!parts) return '';
      return [String(parts.day).padStart(2, '0'), String(parts.month).padStart(2, '0'), String(parts.year || '')].join('.') + ', ' + String(parts.hour).padStart(2, '0') + ':' + String(parts.minute).padStart(2, '0');
    }

    function toDateKey(date) {
      return [String(date.getFullYear()), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
    }

    function getStoreDateNow(timezone) {
      var storeOffsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
      var now = new Date();
      var browserOffsetHours = -now.getTimezoneOffset() / 60;
      return new Date(now.getTime() + (storeOffsetHours - browserOffsetHours) * 60 * 60 * 1000);
    }

    function parseDateKey(value) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return null;
      var parts = String(value).split('-').map(Number);
      var date = new Date(parts[0], parts[1] - 1, parts[2]);
      return isNaN(date.getTime()) ? null : date;
    }

    function totalQty(items) {
      return (Array.isArray(items) ? items : []).reduce(function (sum, item) {
        return sum + Math.max(0, Number(item && (item.qty || item.quantity) || 0));
      }, 0);
    }

    function formatScheduleText(order, opts) {
      opts = opts || {};
      if (!order) return '';
      var title = String(order.time_option_title || '').trim();
      if (!order.scheduled_at) return opts.includeTitle === false ? '' : title;
      var parsed = parseLocalDateParts(order.scheduled_at);
      var date = partsToDate(parsed);
      if (!date || isNaN(date.getTime())) return opts.includeTitle === false ? '' : title;
      var valueText = toDateKey(date) === toDateKey(getStoreDateNow(state.storeTimezone || '+0')) ? formatTime(order.scheduled_at) : formatDateTime(order.scheduled_at);
      if (!valueText) return opts.includeTitle === false ? '' : title;
      return opts.includeTitle === false ? valueText : (title ? title + ': ' + valueText : valueText);
    }

    function paymentIcon(code) {
      if (!code) return 'fa-credit-card';
      var normalized = String(code).toLowerCase();
      if (normalized.indexOf('cash') !== -1) return 'fa-money-bill-wave';
      if (normalized.indexOf('card') !== -1) return 'fa-credit-card';
      if (normalized.indexOf('online') !== -1) return 'fa-globe';
      return 'fa-credit-card';
    }

    function normalizeIconClass(iconValue) {
      var value = String(iconValue || '').trim();
      if (!value) return '';
      if (value.indexOf(' ') !== -1) return value;
      return value.indexOf('fa-') === 0 ? 'fas ' + value : 'fas fa-' + value;
    }

    function isIconUrl(iconValue) {
      var value = String(iconValue || '').trim();
      return /^https?:\/\//i.test(value) || value.indexOf('/') === 0 || value.indexOf('./') === 0 || value.indexOf('../') === 0;
    }

    function renderOrderPaymentIcon(order) {
      var iconValue = String(order && order.payment_icon || '').trim();
      if (!iconValue) return '<i class="fas ' + escapeHtml(paymentIcon(order && order.payment_code)) + '"></i>';
      if (isIconUrl(iconValue)) return '<img src="' + escapeHtml(iconValue) + '" alt="" loading="lazy">';
      return '<i class="' + escapeHtml(normalizeIconClass(iconValue) || ('fas ' + paymentIcon(order && order.payment_code))) + '"></i>';
    }

    function resolveOrderStatusIcon(statusMeta) {
      var raw = String(statusMeta && statusMeta.icon || '').trim();
      return raw || 'fas fa-circle';
    }

    function renderOrderStatusIcon(statusMeta) {
      var iconValue = resolveOrderStatusIcon(statusMeta);
      return isIconUrl(iconValue)
        ? '<img src="' + escapeHtml(iconValue) + '" alt="" loading="lazy">'
        : '<i class="' + escapeHtml(normalizeIconClass(iconValue) || 'fas fa-circle') + '"></i>';
    }

    function normalizeStatusCode(statusMeta) {
      return String(statusMeta && statusMeta.code || '').trim().toLowerCase();
    }

    function isDeliveredStatusMeta(statusMeta) {
      return normalizeStatusCode(statusMeta) === 'delivered';
    }

    function isCanceledStatusMeta(statusMeta) {
      var code = normalizeStatusCode(statusMeta);
      return code === 'canceled' || code === 'cancelled';
    }

    function isFinalStatusMeta(statusMeta) {
      return Number(statusMeta && statusMeta.is_final || 0) === 1 || isCanceledStatusMeta(statusMeta);
    }

    function isForbiddenStatusTransition(fromStatus, toStatus) {
      return isDeliveredStatusMeta(fromStatus) && isCanceledStatusMeta(toStatus);
    }

    function getNextStatusMetaForOrder(order) {
      var sortedStatuses = getSortedStatuses();
      if (!sortedStatuses.length) return null;
      var currentStatusId = Number(order && order.status_id || 0);
      var currentIndex = sortedStatuses.findIndex(function (status) {
        return Number(status && status.id || 0) === currentStatusId;
      });
      var currentStatus = currentIndex >= 0 ? sortedStatuses[currentIndex] : null;
      if (currentIndex < 0) return sortedStatuses[0];
      if (isFinalStatusMeta(currentStatus)) return null;
      var maxOffset = isDeliveredStatusMeta(currentStatus)
        ? Math.max(0, sortedStatuses.length - currentIndex - 1)
        : sortedStatuses.length;
      for (var offset = 1; offset <= maxOffset; offset += 1) {
        var candidate = sortedStatuses[(currentIndex + offset) % sortedStatuses.length];
        if (!candidate) continue;
        if (Number(candidate && candidate.id || 0) === Number(currentStatus && currentStatus.id || 0)) break;
        if (isForbiddenStatusTransition(currentStatus, candidate)) continue;
        return candidate;
      }
      return null;
    }

    function renderOrderStatusHoverCycleButton(order) {
      if (!order) return '';
      var currentStatus = getStatusMetaById(order.status_id) || getSortedStatuses()[0] || null;
      var nextStatus = getNextStatusMetaForOrder(order);
      var nextStatusId = Number(nextStatus && nextStatus.id || 0);
      if (!currentStatus) return '';

      var currentTitle = String(currentStatus && currentStatus.title || '').trim() || 'Этап';
      var isFinal = isFinalStatusMeta(currentStatus);
      var canCycle = !isFinal && nextStatusId > 0 && nextStatusId !== Number(currentStatus && currentStatus.id || 0);
      var nextTitle = canCycle ? (String(nextStatus && nextStatus.title || '').trim() || currentTitle) : currentTitle;
      var titleText = canCycle ? (currentTitle + ' -> ' + nextTitle) : 'Финальный статус';
      var currentIconHtml = renderOrderStatusIcon(currentStatus);
      var nextIconHtml = canCycle ? renderOrderStatusIcon(nextStatus) : '';

      if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderStageCycleButtonHtml === 'function') {
        return sharedOrderPanel.buildOrderStageCycleButtonHtml({
          orderId: order.id,
          canCycle: canCycle,
          currentTitle: currentTitle,
          nextTitle: nextTitle,
          titleText: titleText,
          nextNote: 'Сменить',
          currentIconHtml: currentIconHtml,
          nextIconHtml: nextIconHtml,
          nextStatusId: nextStatusId,
        });
      }

      return '';
    }

    function buildOrderDiscountSummary(order) {
      var items = Array.isArray(order && order.items) ? order.items : [];
      var itemsTotal = items.reduce(function (sum, item) {
        return sum + Number(item && (item.line_total || item.total || item.total_price) || 0);
      }, 0);
      var titles = [];
      (Array.isArray(order && order.discounts_json) ? order.discounts_json : []).forEach(function (row) {
        var title = String(row && (row.title || row.name) || '').trim();
        if (title) titles.push(title);
      });
      return { subtotalBeforeDiscount: Number(order && order.items_total || itemsTotal || 0) + Number(order && order.discount_amount || 0), totalDiscount: Number(order && order.discount_amount || 0), breakdown: [], orderDiscountTitles: titles };
    }

    function renderOrderDiscountBreakdownHtml(summary) {
      var rows = [];
      (Array.isArray(summary && summary.breakdown) ? summary.breakdown : []).forEach(function (item) {
        if (!item) return;
        rows.push('<div class="order-summary-discount-breakdown-row"><span class="order-summary-discount-breakdown-label">' + escapeHtml(String(item.title || item.label || 'Скидка')) + '</span><span class="order-summary-discount-breakdown-value">' + escapeHtml('-' + money(item.amount || 0)) + '</span></div>');
      });
      (Array.isArray(summary && summary.orderDiscountTitles) ? summary.orderDiscountTitles : []).forEach(function (title) {
        rows.push('<div class="order-summary-discount-breakdown-note">' + escapeHtml(String(title || '')) + '</div>');
      });
      return rows.join('');
    }

    function buildOrderDiscountSummary(order) {
      var items = Array.isArray(order && order.items) ? order.items : [];
      var itemsTotal = items.reduce(function (sum, item) {
        return sum + Number(item && (item.line_total || item.total || item.total_price) || 0);
      }, 0);
      var fallbackPromoCode = String(order && order.promo_code || '').trim();
      var breakdown = (Array.isArray(order && order.discounts_json) ? order.discounts_json : []).map(function (row) {
        var key = String(row && row.key || '').trim().toLowerCase();
        var sourceKind = String(row && (row.source_kind || row.source || row.kind) || '').trim().toLowerCase();
        var isPromo = sourceKind === 'promo_code' || sourceKind === 'reward_promo' || key.indexOf('promo_') === 0;
        return {
          title: String(row && (row.title || row.name) || 'Скидка').trim() || 'Скидка',
          amount: Number(row && (row.discount_amount != null ? row.discount_amount : row.amount) || 0),
          promoCode: isPromo ? (String(row && (row.promo_code || row.code) || '').trim() || fallbackPromoCode) : ''
        };
      }).filter(function (row) {
        return Number(row && row.amount || 0) > 0;
      });
      var totalDiscount = Number(order && order.discount_amount || 0);
      if (breakdown.length) {
        var breakdownTotal = breakdown.reduce(function (sum, row) {
          return sum + Number(row && row.amount || 0);
        }, 0);
        if (breakdownTotal > totalDiscount) totalDiscount = breakdownTotal;
      }
      return {
        subtotalBeforeDiscount: Number(order && order.items_total || itemsTotal || 0) + Number(totalDiscount || 0),
        totalDiscount: Number(totalDiscount || 0),
        breakdown: breakdown,
        orderDiscountTitles: []
      };
    }

    function renderOrderDiscountBreakdownHtml(summary) {
      var rows = [];
      (Array.isArray(summary && summary.breakdown) ? summary.breakdown : []).forEach(function (item) {
        if (!item) return;
        var title = String(item.title || item.label || 'Скидка');
        var promoCode = String(item.promoCode || '').trim();
        if (promoCode) title += ' (' + promoCode + ')';
        rows.push('<div class="order-summary-discount-breakdown-row"><span class="order-summary-discount-breakdown-label">' + escapeHtml(title) + '</span><span class="order-summary-discount-breakdown-value">' + escapeHtml('-' + money(item.amount || 0)) + '</span></div>');
      });
      (Array.isArray(summary && summary.orderDiscountTitles) ? summary.orderDiscountTitles : []).forEach(function (title) {
        rows.push('<div class="order-summary-discount-breakdown-note">' + escapeHtml(String(title || '')) + '</div>');
      });
      return rows.join('');
    }

    function parseCashOrderDiscountsJson(order) {
      var raw = order && order.discounts_json;
      if (Array.isArray(raw)) return raw;
      if (!raw) return [];
      try {
        var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }

    function normalizeCashOrderDiscountSourceKind(entry) {
      var raw = String(entry && (entry.source_kind || entry.source || entry.kind) || '').trim().toLowerCase();
      if (raw === 'promo_code' || raw === 'reward_promo') return 'promo_code';
      if (raw === 'reward_discount' || raw === 'discount') return 'discount';
      var key = String(entry && entry.key || '').trim().toLowerCase();
      if (key.indexOf('promo_') === 0) return 'promo_code';
      if (key.indexOf('discount_') === 0) return 'discount';
      return null;
    }

    function buildCashStoredDiscountBreakdown(order) {
      var fallbackPromoCode = String(order && order.promo_code || '').trim() || null;
      return parseCashOrderDiscountsJson(order).map(function (entry) {
        var sourceKind = normalizeCashOrderDiscountSourceKind(entry);
        var promoCode = sourceKind === 'promo_code'
          ? (String(entry && (entry.promo_code || entry.code) || '').trim() || fallbackPromoCode)
          : null;
        return {
          key: String(entry && entry.key || '').trim() || null,
          title: String(entry && (entry.title || entry.name) || 'Скидка').trim() || 'Скидка',
          amount: Number(entry && (entry.discount_amount != null ? entry.discount_amount : entry.amount) || 0),
          sourceKind: sourceKind,
          promoCode: promoCode
        };
      }).filter(function (entry) {
        return Number(entry && entry.amount || 0) > 0;
      });
    }

    function isGiftRewardCashItem(item) {
      return Number(item && item.is_gift_reward || 0) === 1;
    }

    function getCashOrderItemLineTotal(item) {
      var lineTotal = Number(item && (item.line_total != null ? item.line_total : (item.total != null ? item.total : item.total_price)));
      if (Number.isFinite(lineTotal)) return roundMoney(lineTotal);
      var unitPrice = Number(item && (item.price || item.unit_price) || 0);
      var qty = Math.max(0, Number(item && (item.qty || item.quantity) || 0));
      return roundMoney(unitPrice * qty);
    }

    function buildCashDiscountFingerprint(entry) {
      var key = String(entry && entry.key || '').trim().toLowerCase();
      if (key) return 'key:' + key;
      var sourceKind = String(entry && (entry.sourceKind || entry.source_kind) || '').trim().toLowerCase();
      var title = String(entry && entry.title || '').trim().toLowerCase();
      var promoCode = String(entry && (entry.promoCode || entry.promo_code) || '').trim().toUpperCase();
      return 'row:' + sourceKind + ':' + title + ':' + promoCode;
    }

    function mergeCashDiscountBreakdownEntries() {
      var lists = Array.prototype.slice.call(arguments);
      var merged = [];
      var seen = new Set();
      lists.forEach(function (list) {
        (Array.isArray(list) ? list : []).forEach(function (entry) {
          var amount = roundMoney(Number(entry && entry.amount || 0));
          if (!(amount > 0)) return;
          var normalized = {
            key: String(entry && entry.key || '').trim() || null,
            title: String(entry && entry.title || 'Скидка').trim() || 'Скидка',
            amount: amount,
            sourceKind: normalizeCashOrderDiscountSourceKind(entry),
            promoCode: String(entry && (entry.promoCode || entry.promo_code) || '').trim().toUpperCase() || null
          };
          var fingerprint = buildCashDiscountFingerprint(normalized);
          if (seen.has(fingerprint)) return;
          seen.add(fingerprint);
          merged.push(normalized);
        });
      });
      return merged;
    }

    function appendCashOtherDiscountEntryIfNeeded(entries, totalDiscount) {
      var targetTotal = roundMoney(Math.max(0, Number(totalDiscount || 0)));
      var normalizedEntries = Array.isArray(entries) ? entries.slice() : [];
      var breakdownTotal = roundMoney(normalizedEntries.reduce(function (sum, entry) {
        return sum + Number(entry && entry.amount || 0);
      }, 0));
      var otherDiscount = roundMoney(Math.max(0, targetTotal - breakdownTotal));
      if (otherDiscount > 0) {
        normalizedEntries.push({
          key: 'other_discount',
          title: 'Прочие скидки',
          amount: otherDiscount,
          sourceKind: null,
          promoCode: null
        });
      }
      return normalizedEntries;
    }

    function buildCashItemLevelDiscountSummary(items) {
      var comboDiscount = 0;
      var productDiscount = 0;
      var autoAddDiscount = 0;
      (Array.isArray(items) ? items : []).forEach(function (item) {
        if (!item || isGiftRewardCashItem(item)) return;
        var lineTotal = getCashOrderItemLineTotal(item);
        var originalLineTotal = lineTotal;
        var comboOldLineTotal = Number(item && item.old_line_total || 0);
        var discountOriginalLineTotal = Number(item && item.discount && item.discount.original_line_total || 0);
        var oldPrice = Number(item && item.old_price || 0);
        var qty = Math.max(0, Number(item && (item.qty || item.quantity) || 0));
        var oldPriceLineTotal = oldPrice > 0 ? roundMoney(oldPrice * qty) : 0;
        if (String(item && item.type || '') === 'combo' && comboOldLineTotal > lineTotal) {
          originalLineTotal = comboOldLineTotal;
        } else if (discountOriginalLineTotal > lineTotal) {
          originalLineTotal = discountOriginalLineTotal;
        } else if (oldPriceLineTotal > lineTotal) {
          originalLineTotal = oldPriceLineTotal;
        }
        var lineDiscount = roundMoney(Math.max(0, originalLineTotal - lineTotal));
        if (!(lineDiscount > 0)) return;
        if (String(item && item.type || '') === 'combo') {
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
      return {
        totalDiscount: roundMoney(comboDiscount + productDiscount + autoAddDiscount),
        breakdown: [
          { key: 'combo_discount', title: 'Комбо', amount: comboDiscount },
          { key: 'product_discount', title: 'Товарные скидки', amount: productDiscount },
          { key: 'auto_add_discount', title: 'Автодобавление', amount: autoAddDiscount }
        ].filter(function (entry) {
          return Number(entry && entry.amount || 0) > 0;
        })
      };
    }

    function hasStructuredStoredCashDiscountBreakdown(rows) {
      return (Array.isArray(rows) ? rows : []).some(function (entry) {
        var key = String(entry && entry.key || '').trim();
        var sourceKind = String(entry && (entry.sourceKind || entry.source_kind) || '').trim();
        var promoCode = String(entry && (entry.promoCode || entry.promo_code) || '').trim();
        return Boolean(key || sourceKind || promoCode);
      });
    }

    function buildOrderDiscountSummary(order) {
      var items = Array.isArray(order && order.items) ? order.items : [];
      var orderTotal = roundMoney(Number(order && order.total_price || 0));
      var deliveryCost = roundMoney(Number(order && order.delivery_cost || 0));
      var itemsPayableAfterAllDiscounts = roundMoney(Math.max(0, orderTotal - deliveryCost));
      var itemLevelSummary = buildCashItemLevelDiscountSummary(items);
      var itemsTotalAfterItemDiscounts = items.reduce(function (sum, item) {
        return sum + getCashOrderItemLineTotal(item);
      }, 0);
      var storedDiscount = roundMoney(Math.max(0, Number(order && order.discount_amount || 0)));
      var storedBreakdown = buildCashStoredDiscountBreakdown(order);

      if (storedBreakdown.length) {
        var storedStructured = hasStructuredStoredCashDiscountBreakdown(storedBreakdown);
        var storedBreakdownTotal = roundMoney(storedBreakdown.reduce(function (sum, row) {
          return sum + Number(row && row.amount || 0);
        }, 0));
        var storedTotalDiscount = roundMoney(Math.max(storedDiscount, storedBreakdownTotal));
        var breakdown;
        if (storedStructured) {
          breakdown = mergeCashDiscountBreakdownEntries(storedBreakdown, itemLevelSummary.breakdown);
        } else if (storedBreakdown.length === 1) {
          var orderLevelTotal = roundMoney(Math.max(0, storedTotalDiscount - itemLevelSummary.totalDiscount));
          var adjustedStoredBreakdown = orderLevelTotal > 0
            ? [{ key: storedBreakdown[0].key || null, title: storedBreakdown[0].title, amount: orderLevelTotal, sourceKind: storedBreakdown[0].sourceKind || null, promoCode: storedBreakdown[0].promoCode || null }]
            : [];
          breakdown = mergeCashDiscountBreakdownEntries(adjustedStoredBreakdown, itemLevelSummary.breakdown);
        } else {
          breakdown = storedBreakdown.slice();
        }
        storedBreakdownTotal = roundMoney(breakdown.reduce(function (sum, row) {
          return sum + Number(row && row.amount || 0);
        }, 0));
        storedTotalDiscount = roundMoney(Math.max(storedTotalDiscount, storedBreakdownTotal));
        breakdown = appendCashOtherDiscountEntryIfNeeded(breakdown, storedTotalDiscount);
        return {
          subtotalBeforeDiscount: roundMoney(itemsPayableAfterAllDiscounts + storedTotalDiscount),
          totalDiscount: storedTotalDiscount,
          breakdown: breakdown,
          orderDiscountTitles: []
        };
      }

      var customerOrderDiscount = roundMoney(Math.max(0, itemsTotalAfterItemDiscounts - itemsPayableAfterAllDiscounts));
      var totalDiscount = roundMoney(Math.max(storedDiscount, itemLevelSummary.totalDiscount + customerOrderDiscount));
      var breakdown = mergeCashDiscountBreakdownEntries(
        itemLevelSummary.breakdown,
        customerOrderDiscount > 0
          ? [{ key: 'customer_discount', title: 'Клиентская скидка', amount: customerOrderDiscount }]
          : []
      );
      breakdown = appendCashOtherDiscountEntryIfNeeded(breakdown, totalDiscount);
      return {
        subtotalBeforeDiscount: roundMoney(itemsPayableAfterAllDiscounts + totalDiscount),
        totalDiscount: totalDiscount,
        breakdown: breakdown,
        orderDiscountTitles: []
      };
    }

    function isAutoAddItem(item) {
      if (Number(item && item.auto_add || 0) === 1) return true;
      return String(item && (item.product_name || item.name) || '').trim().toLowerCase() === 'приборы';
    }

    function renderItemPhoto(item) {
      var photos = Array.isArray(item && item.photos) ? item.photos.filter(Boolean) : [];
      if (!photos.length) return '';
      return '<div class="order-item-photo-small"><img src="' + escapeHtml(String(photos[0])) + '" alt="' + escapeHtml(String(item && (item.product_name || item.name) || '')) + '" /></div>';
    }

    function collectItemLines(item) {
      var lines = [];
      (Array.isArray(item && item.variants) ? item.variants : []).forEach(function (variant) {
        var value = String(variant && (variant.label || variant.value) || '').trim();
        if (value) lines.push(value);
      });
      (Array.isArray(item && item.ingredients) ? item.ingredients : []).forEach(function (ingredient) {
        var qty = Number(ingredient && (ingredient.quantity || ingredient.qty) || 0);
        if (!(qty > 0)) return;
        var unit = String(ingredient && (ingredient.unit_label || ingredient.unit || ingredient.unit_title) || '').trim();
        var name = String(ingredient && ingredient.name || '').trim();
        lines.push([qty, unit, name].filter(Boolean).join(' '));
      });
      (Array.isArray(item && item.options) ? item.options : []).forEach(function (option) {
        var qty = Number(option && (option.qty || option.quantity) || 0);
        if (!(qty > 0)) return;
        var title = String(option && option.title || '').trim();
        if (title) lines.push(String(qty) + ' ' + title);
      });
      return lines;
    }

    function itemsToHtml(items) {
      if (!Array.isArray(items) || !items.length) return '<div class="muted">—</div>';

      var sorted = items.slice().sort(function (left, right) {
        var leftAuto = isAutoAddItem(left);
        var rightAuto = isAutoAddItem(right);
        if (leftAuto && !rightAuto) return 1;
        if (!leftAuto && rightAuto) return -1;
        return 0;
      });

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

      return sorted.map(function (item, index) {
        if (String(item && item.type || '') === 'combo') {
          var comboNameRaw = String(item && (item.name || item.combo_title) || 'Комбо');
          var comboQty = Math.max(1, Number(item && (item.qty || item.quantity) || 0));
          var comboLineTotal = Number(item && (item.line_total != null ? item.line_total : (item.total != null ? item.total : item.total_price)) || 0);
          var comboOldLineTotal = Number(item && item.old_line_total || 0);
          var comboShowOldPrice = comboOldLineTotal > comboLineTotal;
          var comboPriceHtml = comboShowOldPrice
            ? '<span class="order-item-old-price">' + money(comboOldLineTotal) + '</span><span class="order-item-price-current">' + money(comboLineTotal) + '</span>'
            : '<span class="order-item-price-current">' + money(comboLineTotal) + '</span>';
          var comboTitleHtml = String(comboQty) + ' x ' + escapeHtml(comboNameRaw);
          var comboPhotoHtml = renderThumbHtml(item && item.photos, comboNameRaw);
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

          return '<div class="order-item order-item--combo" data-item-idx="' + String(index) + '">' +
            '<div class="order-item-line">' +
              comboPhotoHtml +
              '<div class="order-item-content">' +
                '<div class="order-item-title">' + comboTitleHtml + '</div>' +
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

        return '<div class="order-item" data-item-idx="' + String(index) + '">' +
          '<div class="order-item-line">' +
            renderThumbHtml(item && item.photos, nameRaw) +
            '<div class="order-item-content">' +
              '<div class="order-item-title">' + escapeHtml(String(qty) + ' x ' + titleText) + '</div>' +
              (lines.length ? '<div class="order-item-composition">' + lines.map(compositionSubLine).join('') + '</div>' : '') +
              '<div class="order-item-footer"><div class="order-item-price">' + priceHtml + '</div></div>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');
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

    function isCanceledOrder(order) {
      var code = normalizeText(order && order.status_code);
      var title = normalizeText(order && order.status_title);
      return code.indexOf('cancel') !== -1 || title.indexOf('отмен') !== -1;
    }

    function isNewOrder(order) {
      if (!order || isCanceledOrder(order)) return false;
      var code = normalizeText(order && order.status_code);
      var title = normalizeText(order && order.status_title);
      return code === 'new' || title.indexOf('нов') === 0;
    }

    function isPaidOrder(order) {
      return Number(order && order.is_paid || 0) === 1;
    }

    function getOrderRefundState(order) {
      if (sharedOrderPayment && typeof sharedOrderPayment.getRefundState === 'function') {
        return sharedOrderPayment.getRefundState(order);
      }
      return normalizeText(order && order.refund_state);
    }

    function getOrderRefundStateTitle(order) {
      if (sharedOrderPayment && typeof sharedOrderPayment.getRefundStateTitle === 'function') {
        return sharedOrderPayment.getRefundStateTitle(order);
      }
      var state = getOrderRefundState(order);
      if (state === 'full') return 'Возвращено';
      if (state === 'partial') return 'Частичный возврат';
      return '';
    }

    function getOrderRefundableTotal(order) {
      var explicit = Number(order && order.refundable_total);
      if (Number.isFinite(explicit)) return explicit;
      if (!isPaidOrder(order)) return 0;
      return Number(order && order.total_price || 0) || 0;
    }

    function isOrderFullyRefunded(order) {
      if (!isPaidOrder(order)) return false;
      var refundedTotal = Number(order && order.refunded_total || 0) || 0;
      return getOrderRefundState(order) === 'full' || (refundedTotal > 0 && getOrderRefundableTotal(order) <= 0.001);
    }

    function hasOrderRefunds(order) {
      var refundedTotal = Number(order && order.refunded_total || 0) || 0;
      var refundsCount = Number(order && order.refunds_count || 0) || 0;
      return refundedTotal > 0 || refundsCount > 0;
    }

    function getDisplayOrder(order) {
      if (!order || !hasOrderRefunds(order)) return order;
      var remainingOrder = order && order.remaining_order;
      if (!remainingOrder || typeof remainingOrder !== 'object') return order;
      return Object.assign({}, order, remainingOrder);
    }

    function getOrderDisplayTotal(order) {
      var displayOrder = getDisplayOrder(order) || order;
      return Number(displayOrder && (displayOrder.total_price != null ? displayOrder.total_price : displayOrder.total) || 0) || 0;
    }

    function isOrderPrintable(order) {
      var displayOrder = getDisplayOrder(order);
      return !!displayOrder && Array.isArray(displayOrder.items) && displayOrder.items.length > 0;
    }

    function getPaymentActionLabel(order) {
      if (!order || !(getOrderId(order) > 0)) return 'Принять оплату';
      if (!isPaidOrder(order)) return 'Принять оплату';
      if (isOrderFullyRefunded(order)) return 'Возвращено';
      return 'Оплачено / Возврат';
    }

    function getPaymentBucket(order) {
      var raw = normalizeText(order && (order.payment_code || order.payment_title));
      if (!raw) return 'card';
      if (raw.indexOf('cash') !== -1 || raw.indexOf('нал') !== -1) return 'cash';
      if (raw.indexOf('online') !== -1 || raw.indexOf('онлайн') !== -1) return 'online';
      return 'card';
    }

    function getPaymentLabel(order) {
      var title = String(order && (order.payment_title || order.payment_code) || '').trim();
      if (title) return title;
      var bucket = getPaymentBucket(order);
      if (bucket === 'cash') return 'Наличные';
      if (bucket === 'online') return 'Онлайн';
      return 'Картой / QR';
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
      var source = Array.isArray(state.paymentMethods) && state.paymentMethods.length
        ? state.paymentMethods
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

    function getSummaryPaymentMethods() {
      var methods = getActivePaymentMethods();
      return Array.isArray(methods) && methods.length ? methods : getFallbackPaymentMethods();
    }

    function getPaymentBucketByValue(value) {
      var raw = normalizeText(value);
      if (!raw) return 'card';
      if (raw.indexOf('cash') !== -1 || raw.indexOf('нал') !== -1) return 'cash';
      if (raw.indexOf('online') !== -1 || raw.indexOf('онлайн') !== -1) return 'online';
      return 'card';
    }

    function ensurePaymentMethodsLoaded(order) {
      if (Array.isArray(state.paymentMethods) && state.paymentMethods.length) {
        return Promise.resolve(getActivePaymentMethods(order));
      }
      if (state.paymentMethodsPromise) {
        return state.paymentMethodsPromise.then(function () {
          return getActivePaymentMethods(order);
        });
      }
      state.paymentMethodsPromise = apiJson('/api/admin/tenant/order-payments').then(function (json) {
        state.paymentMethods = Array.isArray(json && json.items) ? json.items.slice() : [];
        return state.paymentMethods;
      }).catch(function (err) {
        console.error('cash payment methods load error:', err);
        state.paymentMethods = [];
        return state.paymentMethods;
      }).finally(function () {
        state.paymentMethodsPromise = null;
      });
      return state.paymentMethodsPromise.then(function () {
        return getActivePaymentMethods(order);
      });
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

    function buildOrderTabKey(orderId) {
      return 'order:' + String(orderId);
    }

    function buildOrderTabTitle(order) {
      var orderId = Number(order && order.id || 0);
      return orderId > 0 ? '№' + String(orderId) : 'Заказ';
    }

    function buildClientTabKey(clientId) {
      return 'client:' + String(clientId);
    }

    function normalizePhoneDigits(value) {
      return String(value || '').replace(/[^\d]/g, '');
    }

    function formatPhoneDigitsToRU(value) {
      var raw = normalizePhoneDigits(value);
      if (raw.length !== 11) return String(value || '\u2014');
      var digits = raw.charAt(0) === '8' ? ('7' + raw.slice(1)) : raw;
      if (digits.charAt(0) !== '7') return String(value || '\u2014');
      return '+7 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7, 9) + '-' + digits.slice(9, 11);
    }

    function buildClientTabTitle(options) {
      var config = options && typeof options === 'object' ? options : {};
      var client = config.client || null;
      var clientName = String(client && client.name || '').trim();
      if (clientName) return clientName;
      var fallbackName = String(config.name || '').trim();
      if (fallbackName && fallbackName !== '?') return fallbackName;
      var clientPhone = String(client && client.phone || '').trim();
      if (clientPhone) return formatPhoneDigitsToRU(clientPhone);
      var fallbackPhone = String(config.phone || '').trim();
      if (fallbackPhone) return formatPhoneDigitsToRU(fallbackPhone);
      var clientId = Number(client && client.id || config.id || 0);
      return clientId > 0 ? ('\u041a\u043b\u0438\u0435\u043d\u0442 #' + String(clientId)) : '\u041a\u043b\u0438\u0435\u043d\u0442';
    }

    function formatClientDate(value) {
      if (!value) return '\u2014';
      var date = new Date(String(value).replace(' ', 'T'));
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString('ru-RU');
    }

    function formatClientDateTime(value) {
      if (!value) return '\u2014';
      var date = new Date(String(value).replace(' ', 'T'));
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }

    function setClientPhoto(photoUrl) {
      var src = String(photoUrl || '').trim();
      if (src) {
        if (clientPhoto) {
          clientPhoto.src = src;
          clientPhoto.classList.remove('hidden');
        }
        if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.add('hidden');
        return;
      }
      if (clientPhoto) {
        clientPhoto.removeAttribute('src');
        clientPhoto.classList.add('hidden');
      }
      if (clientPhotoPlaceholder) clientPhotoPlaceholder.classList.remove('hidden');
    }

    function getStatusMetaById(statusId) {
      var id = Number(statusId || 0);
      return (Array.isArray(state.statuses) ? state.statuses : []).find(function (status) {
        return Number(status && status.id || 0) === id;
      }) || null;
    }

    function getSortedStatuses() {
      return (Array.isArray(state.statuses) ? state.statuses.slice() : []).filter(function (status) {
        return Number(status && status.id || 0) > 0;
      }).sort(function (left, right) {
        return Number(left && left.sort || 0) - Number(right && right.sort || 0) || Number(left && left.id || 0) - Number(right && right.id || 0);
      });
    }

    function getAllActiveOrders() {
      return (Array.isArray(state.orders) ? state.orders : []).filter(function (order) {
        return getOrderId(order) > 0 && !isCanceledOrder(order);
      });
    }

    function getAllPeriodOrders() {
      return (Array.isArray(state.orders) ? state.orders : []).filter(function (order) {
        return getOrderId(order) > 0;
      });
    }

    function compareOrders(left, right) {
      var leftNew = isNewOrder(left) ? 1 : 0;
      var rightNew = isNewOrder(right) ? 1 : 0;
      if (leftNew !== rightNew) return rightNew - leftNew;
      var leftPaid = isPaidOrder(left) ? 1 : 0;
      var rightPaid = isPaidOrder(right) ? 1 : 0;
      if (leftPaid !== rightPaid) return leftPaid - rightPaid;
      var leftTime = new Date(String(left && left.created_at || 0).replace(' ', 'T')).getTime() || 0;
      var rightTime = new Date(String(right && right.created_at || 0).replace(' ', 'T')).getTime() || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return getOrderId(right) - getOrderId(left);
    }

    function getVisibleOrders() {
      return state.currentSection === 'money' ? getMoneyJournalEntries() : getOrderJournalOrders();
    }

    function getSummary() {
      return state.currentSection === 'money' ? getMoneySummary() : buildOrdersSummary(getOrderJournalOrders());
    }

    function compareMoneyMoves(left, right) {
      var leftTime = new Date(String(left && left.created_at || 0).replace(' ', 'T')).getTime() || 0;
      var rightTime = new Date(String(right && right.created_at || 0).replace(' ', 'T')).getTime() || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return getOrderId(right) - getOrderId(left);
    }

    function getOrderFilterLabel() {
      if (state.orderFilter === 'paid') return 'Оплачены';
      if (state.orderFilter === 'unpaid') return 'Не оплачены';
      return 'Все';
    }

    function getOrderJournalOrders() {
      var list = getAllActiveOrders();
      if (state.orderFilter === 'unpaid') {
        list = list.filter(function (order) { return !isPaidOrder(order); });
      } else if (state.orderFilter === 'paid') {
        list = list.filter(isPaidOrder);
      }
      return list.sort(compareOrders);
    }

    function getMoneyJournalEntries() {
      return getAllActiveOrders().filter(isPaidOrder).sort(compareMoneyMoves);
    }

    function isMultiDayRange() {
      if (!state.date.start || !state.date.end) return false;
      return toDateKey(state.date.start) !== toDateKey(state.date.end);
    }

    function getEntryDayKey(entry) {
      var parts = parseLocalDateParts(entry && entry.created_at);
      if (!parts) return '';
      return [String(parts.year || ''), String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
    }

    function formatJournalDayLabel(dayKey) {
      var date = parseDateKey(dayKey);
      if (!date || isNaN(date.getTime())) return String(dayKey || '');
      return date.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', weekday: 'long' });
    }

    function buildJournalDayGroups(entries) {
      var groups = [];
      var index = {};
      (Array.isArray(entries) ? entries : []).forEach(function (entry) {
        var dayKey = getEntryDayKey(entry);
        if (!dayKey) return;
        if (!index[dayKey]) {
          index[dayKey] = { dayKey: dayKey, items: [], total: 0 };
          groups.push(index[dayKey]);
        }
        index[dayKey].items.push(entry);
        index[dayKey].total += Number(entry && entry.total_price || 0) || 0;
      });
      return groups;
    }

    function renderJournalDayGroups(entries) {
      return buildJournalDayGroups(entries).map(function (group) {
        var collapsed = !Object.prototype.hasOwnProperty.call(state.dayGroupsCollapsed || {}, group.dayKey)
          ? true
          : !!state.dayGroupsCollapsed[group.dayKey];
        var countLabel = state.currentSection === 'money' ? 'движ.' : 'заказ.';
        return '<section class="cash-day-section">' +
          '<button class="cash-day-header" type="button" data-cash-day-toggle="' + escapeHtml(group.dayKey) + '">' +
            '<span class="cash-day-title"><strong>' + escapeHtml(formatJournalDayLabel(group.dayKey)) + '</strong><span class="cash-day-count">' + escapeHtml(formatCount(group.items.length) + ' ' + countLabel + ' · ' + money(group.total)) + '</span></span>' +
            '<span class="cash-day-chevron' + (collapsed ? ' is-collapsed' : '') + '"><i class="fas fa-chevron-down"></i></span>' +
          '</button>' +
          '<div class="cash-day-panel' + (state.currentSection === 'orders' ? ' cash-day-panel--orders' : '') + (collapsed ? ' hidden' : '') + '">' + group.items.map(buildJournalRow).join('') + '</div>' +
        '</section>';
      }).join('');
    }

    function buildStageStats(list) {
      var rows = getSortedStatuses().map(function (status) {
        return {
          id: Number(status && status.id || 0),
          title: String(status && status.title || '—').trim() || '—',
          count: 0,
          amount: 0,
        };
      });
      var index = {};
      rows.forEach(function (row) {
        index[String(row.id)] = row;
      });
      (Array.isArray(list) ? list : []).forEach(function (order) {
        var row = index[String(Number(order && order.status_id || 0))];
        if (!row) return;
        row.count += 1;
        row.amount += getOrderDisplayTotal(order);
      });
      return rows;
    }

    function renderStageStatsTable(rows) {
      var list = Array.isArray(rows) ? rows : [];
      if (!list.length) return '<div class="muted">—</div>';
      return '<div class="cash-stage-balance-table">' +
        '<div class="cash-stage-balance-head"><span>Этап</span><span>Кол-во</span><span>Сумма</span></div>' +
        list.map(function (row) {
          return '<div class="cash-stage-balance-row">' +
            '<span class="cash-stage-balance-title">' + escapeHtml(String(row && row.title || '—')) + '</span>' +
            '<strong>' + escapeHtml(formatCount(row && row.count || 0)) + '</strong>' +
            '<strong>' + escapeHtml(money(row && row.amount || 0)) + '</strong>' +
          '</div>';
        }).join('') +
      '</div>';
    }

    function buildMoneyMethodBreakdown(list, paymentMethods) {
      var methods = (Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : getSummaryPaymentMethods()).map(function (item) {
        return {
          code: String(item && item.code || '').trim(),
          title: String(item && (item.title || item.code) || '').trim() || 'Оплата',
          bucket: getPaymentBucketByValue(item && (item.code || item.title)),
          incomeTotal: 0,
          expenseTotal: 0,
        };
      });
      (Array.isArray(list) ? list : []).forEach(function (order) {
        var total = Number(order && order.total_price || 0) || 0;
        if (!(total > 0)) return;
        var exactKey = normalizeText(order && order.payment_code);
        var target = methods.find(function (item) {
          return normalizeText(item && item.code) === exactKey;
        }) || null;
        if (!target) {
          var bucket = getPaymentBucket(order);
          target = methods.find(function (item) {
            return String(item && item.bucket || '') === String(bucket || '');
          }) || null;
        }
        if (target) target.incomeTotal += total;
      });
      return methods;
    }

    function buildOrdersSummary(list) {
      return (Array.isArray(list) ? list : []).reduce(function (summary, order) {
        summary.totalOrders += 1;
        if (isNewOrder(order)) summary.newOrders += 1;
        if (isPaidOrder(order)) {
          summary.paidOrders += 1;
          var total = getOrderDisplayTotal(order);
          var bucket = getPaymentBucket(order);
          if (bucket === 'cash') summary.cashPaidTotal += total;
          else if (bucket === 'online') summary.onlinePaidTotal += total;
          else summary.cardPaidTotal += total;
        } else {
          summary.unpaidOrders += 1;
        }
        return summary;
      }, { totalOrders: 0, newOrders: 0, unpaidOrders: 0, paidOrders: 0, cashPaidTotal: 0, cardPaidTotal: 0, onlinePaidTotal: 0 });
    }

    function getMoneySummary(list) {
      var entries = Array.isArray(list) ? list.slice() : getMoneyJournalEntries();
      var breakdown = buildMoneyMethodBreakdown(entries, getSummaryPaymentMethods());
      return entries.reduce(function (summary, order) {
        var total = Number(order && order.total_price || 0) || 0;
        summary.incomeTotal += total;
        if (getPaymentBucket(order) === 'cash') summary.cashInRegister += total;
        return summary;
      }, { incomeTotal: 0, expenseTotal: 0, cashInRegister: 0, methodBreakdown: breakdown });
    }

    function renderMoneyMethodCards(summary) {
      return (Array.isArray(summary && summary.methodBreakdown) ? summary.methodBreakdown : []).map(function (method) {
        return '<div class="cash-summary-card"><span>' + escapeHtml(String(method && method.title || 'Оплата')) + '</span><strong>' + escapeHtml(money(method && method.incomeTotal || 0)) + '</strong></div>';
      }).join('');
    }

    function renderMoneyBreakdownRows(summary, fieldName) {
      return (Array.isArray(summary && summary.methodBreakdown) ? summary.methodBreakdown : []).map(function (method) {
        return '<div class="cash-balance-metric"><span>' + escapeHtml(String(method && method.title || 'Оплата')) + '</span><strong>' + escapeHtml(money(method && method[fieldName] || 0)) + '</strong></div>';
      }).join('');
    }

    function getMoneyEntryCreatedAt(entry) {
      return String(entry && entry.created_at || '').trim();
    }

    function getMoneyEntryAmount(entry) {
      var amount = Number(entry && (entry.amount != null ? entry.amount : (entry.total_amount != null ? entry.total_amount : entry.total_price)) || 0);
      return Number.isFinite(amount) ? amount : 0;
    }

    function getMoneyEntrySignedAmount(entry) {
      var amount = getMoneyEntryAmount(entry);
      return String(entry && entry.entry_kind || '') === 'refund' ? -amount : amount;
    }

    function getMoneyEntrySortId(entry) {
      if (String(entry && entry.entry_kind || '') === 'refund') return Number(entry && entry.refund_id || 0) || 0;
      return Number(entry && entry.order_id || entry && entry.id || 0) || 0;
    }

    function getMoneyEntryPaymentCode(entry) {
      return String(
        entry && (
          entry.payment_code
          || entry.paymentCode
          || entry.refund && entry.refund.payment_code
          || entry.order && entry.order.payment_code
        ) || ''
      ).trim();
    }

    function getMoneyEntryPaymentTitle(entry) {
      var directTitle = String(
        entry && (
          entry.payment_title
          || entry.paymentTitle
          || entry.refund && (entry.refund.payment_title || entry.refund.payment_code)
        ) || ''
      ).trim();
      if (directTitle) return directTitle;
      if (entry && entry.order) return getPaymentLabel(entry.order);
      var code = getMoneyEntryPaymentCode(entry);
      if (!code) return 'Оплата';
      var bucket = getPaymentBucketByValue(code);
      if (bucket === 'cash') return 'Наличные';
      if (bucket === 'online') return 'Онлайн';
      return 'Картой / QR';
    }

    function getMoneyEntryBucket(entry) {
      return getPaymentBucketByValue(getMoneyEntryPaymentCode(entry) || getMoneyEntryPaymentTitle(entry));
    }

    function compareMoneyMoves(left, right) {
      var leftTime = new Date(String(getMoneyEntryCreatedAt(left) || 0).replace(' ', 'T')).getTime() || 0;
      var rightTime = new Date(String(getMoneyEntryCreatedAt(right) || 0).replace(' ', 'T')).getTime() || 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return getMoneyEntrySortId(right) - getMoneyEntrySortId(left);
    }

    function getMoneyJournalEntries() {
      return getAllPeriodOrders().reduce(function (entries, order) {
        var orderId = getOrderId(order);
        if (!(orderId > 0)) return entries;
        if (isPaidOrder(order)) {
          var incomeAmount = Number(order && order.total_price || 0) || 0;
          if (incomeAmount > 0) {
            entries.push({
              entry_kind: 'income',
              order_id: orderId,
              id: orderId,
              created_at: order && order.created_at || '',
              amount: incomeAmount,
              payment_code: order && order.payment_code || '',
              payment_title: order && order.payment_title || '',
              order: order,
            });
          }
        }
        (Array.isArray(order && order.refunds) ? order.refunds : []).forEach(function (refund) {
          var refundAmount = Number(refund && refund.total_amount || 0) || 0;
          if (!(refundAmount > 0)) return;
          entries.push({
            entry_kind: 'refund',
            order_id: orderId,
            refund_id: Number(refund && refund.id || 0) || 0,
            created_at: refund && refund.created_at || order && order.created_at || '',
            amount: refundAmount,
            payment_code: refund && refund.payment_code || order && order.payment_code || '',
            payment_title: refund && (refund.payment_title || refund.payment_code) || order && order.payment_title || '',
            order: order,
            refund: refund,
          });
        });
        return entries;
      }, []).sort(compareMoneyMoves);
    }

    function buildJournalDayGroups(entries) {
      var groups = [];
      var index = {};
      (Array.isArray(entries) ? entries : []).forEach(function (entry) {
        var dayKey = getEntryDayKey(entry);
        if (!dayKey) return;
        if (!index[dayKey]) {
          index[dayKey] = { dayKey: dayKey, items: [], total: 0 };
          groups.push(index[dayKey]);
        }
        index[dayKey].items.push(entry);
        index[dayKey].total += state.currentSection === 'money'
          ? getMoneyEntrySignedAmount(entry)
          : getOrderDisplayTotal(entry);
      });
      return groups;
    }

    function buildMoneyMethodBreakdown(list, paymentMethods) {
      var methods = (Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : getSummaryPaymentMethods()).map(function (item) {
        return {
          code: String(item && item.code || '').trim(),
          title: String(item && (item.title || item.code) || '').trim() || 'Оплата',
          bucket: getPaymentBucketByValue(item && (item.code || item.title)),
          incomeTotal: 0,
          expenseTotal: 0,
        };
      });

      function ensureMethod(entry) {
        var exactKey = normalizeText(getMoneyEntryPaymentCode(entry));
        var target = methods.find(function (item) {
          return normalizeText(item && item.code) === exactKey;
        }) || null;
        if (target) return target;

        var bucket = getMoneyEntryBucket(entry);
        target = methods.find(function (item) {
          return String(item && item.bucket || '') === String(bucket || '');
        }) || null;
        if (target) return target;

        target = {
          code: getMoneyEntryPaymentCode(entry) || bucket || 'payment',
          title: getMoneyEntryPaymentTitle(entry),
          bucket: bucket,
          incomeTotal: 0,
          expenseTotal: 0,
        };
        methods.push(target);
        return target;
      }

      (Array.isArray(list) ? list : []).forEach(function (entry) {
        var amount = getMoneyEntryAmount(entry);
        if (!(amount > 0)) return;
        var target = ensureMethod(entry);
        if (!target) return;
        if (String(entry && entry.entry_kind || '') === 'refund') target.expenseTotal += amount;
        else target.incomeTotal += amount;
      });
      return methods;
    }

    function getMoneySummary(list) {
      var entries = Array.isArray(list) ? list.slice() : getMoneyJournalEntries();
      var breakdown = buildMoneyMethodBreakdown(entries, getSummaryPaymentMethods());
      return entries.reduce(function (summary, entry) {
        var amount = getMoneyEntryAmount(entry);
        if (!(amount > 0)) return summary;
        if (String(entry && entry.entry_kind || '') === 'refund') {
          summary.expenseTotal += amount;
          if (getMoneyEntryBucket(entry) === 'cash') summary.cashInRegister -= amount;
        } else {
          summary.incomeTotal += amount;
          if (getMoneyEntryBucket(entry) === 'cash') summary.cashInRegister += amount;
        }
        return summary;
      }, { incomeTotal: 0, expenseTotal: 0, cashInRegister: 0, methodBreakdown: breakdown });
    }

    function renderMoneyMethodCards(summary) {
      return (Array.isArray(summary && summary.methodBreakdown) ? summary.methodBreakdown : []).map(function (method) {
        var netTotal = Number(method && method.incomeTotal || 0) - Number(method && method.expenseTotal || 0);
        return '<div class="cash-summary-card"><span>' + escapeHtml(String(method && method.title || 'Оплата')) + '</span><strong class="' + (netTotal < 0 ? 'is-negative' : '') + '">' + escapeHtml(money(netTotal)) + '</strong></div>';
      }).join('');
    }

    function renderMoneyBreakdownRows(summary, fieldName) {
      return (Array.isArray(summary && summary.methodBreakdown) ? summary.methodBreakdown : []).map(function (method) {
        var amount = Number(method && method[fieldName] || 0);
        var value = fieldName === 'expenseTotal' && amount > 0 ? ('-' + money(amount)) : money(amount);
        return '<div class="cash-balance-metric"><span>' + escapeHtml(String(method && method.title || 'Оплата')) + '</span><strong class="' + (fieldName === 'expenseTotal' && amount > 0 ? 'is-negative' : '') + '">' + escapeHtml(value) + '</strong></div>';
      }).join('');
    }

    function getTabByKey(key) {
      return tabsState.tabs.find(function (tab) {
        return String(tab && tab.key || '') === String(key || '');
      }) || null;
    }

    function getActiveTab() {
      return getTabByKey(tabsState.activeKey);
    }

    function getActiveOrder() {
      var activeTab = getActiveTab();
      if (activeTab && Number(activeTab.orderId || 0) > 0) {
        var fresh = state.orders.find(function (order) {
          return getOrderId(order) === Number(activeTab.orderId || 0);
        }) || null;
        if (fresh) {
          activeTab.order = Object.assign({}, activeTab.order, fresh);
          activeTab.title = buildOrderTabTitle(activeTab.order);
          return activeTab.order;
        }
        return activeTab.order || null;
      }
      return state.orders.find(function (order) {
        return getOrderId(order) === Number(state.activeOrderId || 0);
      }) || null;
    }

    function getActiveClientTab() {
      var activeTab = getActiveTab();
      if (!activeTab || String(activeTab.type || 'order') !== 'client') return null;
      return activeTab;
    }

    function renderFilterState() {
      var isOrdersSection = state.currentSection === 'orders';
      if (!isOrdersSection) state.orderFilterMenuOpen = false;
      if (filtersEl) {
        filtersEl.querySelectorAll('[data-cash-section]').forEach(function (btn) {
          btn.classList.toggle('is-active', String(btn.getAttribute('data-cash-section') || '') === String(state.currentSection || 'orders'));
        });
      }
      if (sectionTitleEl) {
        sectionTitleEl.textContent = state.currentSection === 'money' ? 'Движение денег' : 'Журнал заказов';
      }
      if (orderFilterLabelEl) orderFilterLabelEl.textContent = getOrderFilterLabel();
      if (orderFilterWrapEl) {
        orderFilterWrapEl.classList.toggle('hidden', !isOrdersSection);
        orderFilterWrapEl.classList.toggle('is-open', !!isOrdersSection && !!state.orderFilterMenuOpen);
      }
      if (orderFilterBtnEl) {
        orderFilterBtnEl.setAttribute('aria-expanded', isOrdersSection && state.orderFilterMenuOpen ? 'true' : 'false');
      }
      if (orderFilterMenuEl) {
        orderFilterMenuEl.querySelectorAll('[data-cash-order-filter]').forEach(function (btn) {
          btn.classList.toggle('is-selected', String(btn.getAttribute('data-cash-order-filter') || '') === String(state.orderFilter || 'all'));
        });
      }
    }

    function closeOrderFilterMenu() {
      if (!state.orderFilterMenuOpen) return;
      state.orderFilterMenuOpen = false;
      renderFilterState();
    }

    function renderSummaryCards() {
      if (!summaryCardsEl) return;
      if (state.currentSection === 'money') {
        var moneySummary = getMoneySummary();
        summaryCardsEl.innerHTML =
          '<div class="cash-summary-card"><span>Приход</span><strong>' + escapeHtml(money(moneySummary.incomeTotal)) + '</strong></div>' +
          '<div class="cash-summary-card"><span>Расход</span><strong>' + escapeHtml(money(moneySummary.expenseTotal)) + '</strong></div>' +
          '<div class="cash-summary-card"><span>В кассе</span><strong>' + escapeHtml(money(moneySummary.cashInRegister)) + '</strong></div>' +
          renderMoneyMethodCards(moneySummary);
        return;
      }
      var summary = buildOrdersSummary(getOrderJournalOrders());
      summaryCardsEl.innerHTML =
        '<div class="cash-summary-card"><span>Новые</span><strong>' + escapeHtml(formatCount(summary.newOrders)) + '</strong></div>' +
        '<div class="cash-summary-card"><span>Не оплачены</span><strong>' + escapeHtml(formatCount(summary.unpaidOrders)) + '</strong></div>' +
        '<div class="cash-summary-card"><span>Оплачены</span><strong>' + escapeHtml(formatCount(summary.paidOrders)) + '</strong></div>' +
        '<div class="cash-summary-card"><span>Наличные</span><strong>' + escapeHtml(money(summary.cashPaidTotal)) + '</strong></div>' +
        '<div class="cash-summary-card"><span>Картой / QR</span><strong>' + escapeHtml(money(summary.cardPaidTotal)) + '</strong></div>' +
        '<div class="cash-summary-card"><span>Онлайн</span><strong>' + escapeHtml(money(summary.onlinePaidTotal)) + '</strong></div>';
    }

    function renderSidebarSummary() {
      if (!sidebarSummaryEl) return;
      var ordersSummary = buildOrdersSummary(getAllActiveOrders());
      var stageStats = buildStageStats(getAllPeriodOrders());
      var moneySummary = getMoneySummary();
      sidebarSummaryEl.innerHTML =
        '<div class="cash-balance-card">' +
          '<div class="cash-balance-card-title">Заказы за период</div>' +
          '<div class="cash-balance-metrics">' +
            '<div class="cash-balance-metric"><span>Всего заказов</span><strong>' + escapeHtml(formatCount(ordersSummary.totalOrders)) + '</strong></div>' +
            '<div class="cash-balance-metric"><span>Новые</span><strong>' + escapeHtml(formatCount(ordersSummary.newOrders)) + '</strong></div>' +
            '<div class="cash-balance-metric"><span>Не оплачены</span><strong>' + escapeHtml(formatCount(ordersSummary.unpaidOrders)) + '</strong></div>' +
            '<div class="cash-balance-metric"><span>Оплачены</span><strong>' + escapeHtml(formatCount(ordersSummary.paidOrders)) + '</strong></div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-balance-card">' +
          '<div class="cash-balance-card-title">Этапы заказов</div>' +
          renderStageStatsTable(stageStats) +
        '</div>' +
        '<div class="cash-balance-card">' +
          '<div class="cash-balance-card-title">Деньги за период</div>' +
          '<div class="cash-balance-metrics">' +
            '<div class="cash-balance-metric"><span>Денег в кассе</span><strong>' + escapeHtml(money(moneySummary.cashInRegister)) + '</strong></div>' +
            '<div class="cash-balance-metric"><span>Приход</span><strong>' + escapeHtml(money(moneySummary.incomeTotal)) + '</strong></div>' +
            '<div class="cash-balance-metric"><span>Расход</span><strong>' + escapeHtml(money(moneySummary.expenseTotal)) + '</strong></div>' +
          '</div>' +
          '<div class="cash-balance-group">' +
            '<div class="cash-balance-group-title">Приход по оплатам</div>' +
            '<div class="cash-balance-metrics">' + renderMoneyBreakdownRows(moneySummary, 'incomeTotal') + '</div>' +
          '</div>' +
          '<div class="cash-balance-group">' +
            '<div class="cash-balance-group-title">Расход по оплатам</div>' +
            '<div class="cash-balance-metrics">' + renderMoneyBreakdownRows(moneySummary, 'expenseTotal') + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="cash-balance-card">' +
          '<div class="cash-balance-card-title">Операции кассы</div>' +
          '<div class="cash-balance-actions">' +
            '<button class="btn btn-ghost cash-balance-action-btn" type="button">Пересчет кассы</button>' +
            '<button class="btn btn-ghost cash-balance-action-btn" type="button">Изъять</button>' +
            '<button class="btn btn-ghost cash-balance-action-btn" type="button">Внести</button>' +
          '</div>' +
        '</div>';
    }

    function closeInlineStatusMenus() {
      if (!cashRightPaneEl) return;
      cashRightPaneEl.querySelectorAll('[data-role="order-inline-status"]').forEach(function (wrap) { wrap.classList.remove('is-open'); });
      cashRightPaneEl.querySelectorAll('[data-role="order-status-menu"]').forEach(function (dropdown) { dropdown.classList.add('hidden'); });
      cashRightPaneEl.querySelectorAll('[data-action="order-status-menu-toggle"]').forEach(function (btn) { btn.setAttribute('aria-expanded', 'false'); });
    }

    function renderInlineStatusMenus(order) {
      if (!cashRightPaneEl) return;
      var menus = cashRightPaneEl.querySelectorAll('[data-role="order-status-menu"]');
      if (!menus.length) return;
      var currentStatusId = Number(order && order.status_id || 0);
      var html = getSortedStatuses().map(function (status) {
        var statusId = Number(status && status.id || 0);
        return '<button class="order-status-inline-option' + (statusId === currentStatusId ? ' is-selected' : '') + '" type="button" data-action="order-status-menu-select" data-status-id="' + String(statusId) + '" role="option" aria-selected="' + (statusId === currentStatusId ? 'true' : 'false') + '">' + escapeHtml(String(status && status.title || '—')) + '</button>';
      }).join('');
      menus.forEach(function (menu) { menu.innerHTML = html; });
      closeInlineStatusMenus();
    }

    function setStatusControlsDisabled(disabled) {
      if (cashRightPaneEl) {
        cashRightPaneEl.querySelectorAll('[data-action="order-status-next"], [data-action="order-status-menu-toggle"]').forEach(function (btn) { btn.disabled = !!disabled; });
      }
      if (journalListEl) {
        journalListEl.querySelectorAll('[data-action="order-row-status-next"]').forEach(function (btn) { btn.disabled = !!disabled; });
      }
    }

    var cashInfoRenderer = sharedOrderPanel && cashRightPaneEl ? sharedOrderPanel.createInfoRenderer({
      root: cashRightPaneEl,
      footerEl: cashOrderInfoFooterEl,
      clientInfoWrap: clientInfoWrap,
      enableClientLink: true,
      helpers: {
        money: money,
        formatDateTime: formatDateTime,
        formatDateTimeNumeric: formatDateTimeNumeric,
        formatScheduleText: formatScheduleText,
        totalQty: totalQty,
        buildOrderDiscountSummary: buildOrderDiscountSummary,
        renderOrderDiscountBreakdownHtml: renderOrderDiscountBreakdownHtml,
        renderOrderPaymentIcon: renderOrderPaymentIcon,
        paymentIcon: paymentIcon,
        getDisplayOrder: getDisplayOrder,
        itemsToHtml: itemsToHtml,
      },
      renderInlineStatusMenus: renderInlineStatusMenus,
      afterRender: function (order) { syncCashPaymentFooter(order); },
    }) : null;

    function setNodesHidden(nodes, hidden) {
      (Array.isArray(nodes) ? nodes : []).forEach(function (node) {
        if (node) node.classList.toggle('hidden', !!hidden);
      });
    }

    function showClientInfo() {
      if (cashInfoRenderer && cashInfoRenderer.infoEls) {
        setNodesHidden(cashInfoRenderer.infoEls.empty, true);
        setNodesHidden(cashInfoRenderer.infoEls.content, true);
      } else if (cashOrderInfoRootEl) {
        cashOrderInfoRootEl.querySelectorAll('[data-info="empty"], [data-info="content"]').forEach(function (node) {
          node.classList.add('hidden');
        });
      }
      if (clientInfoWrap) clientInfoWrap.classList.remove('hidden');
      if (cashOrderInfoFooterEl) cashOrderInfoFooterEl.classList.add('hidden');
    }

    function setClientContentTab(tabName) {
      var nextTab = ['addresses', 'orders', 'discounts'].indexOf(String(tabName || '')) >= 0
        ? String(tabName)
        : 'addresses';
      var activeClientTab = getActiveClientTab();
      if (activeClientTab) activeClientTab.activeContentTab = nextTab;
      if (clientContentTabs) {
        clientContentTabs.querySelectorAll('[data-ctab]').forEach(function (btn) {
          btn.classList.toggle('is-active', btn.getAttribute('data-ctab') === nextTab);
        });
      }
      [clientTabAddresses, clientTabOrders, clientTabDiscounts].forEach(function (panel) {
        if (!panel) return;
        panel.classList.toggle('is-active', panel.getAttribute('data-ctab') === nextTab);
      });
      if (clientOrdersListView) clientOrdersListView.classList.remove('hidden');
      if (clientOrderDetailView) clientOrderDetailView.classList.add('hidden');
    }

    if (clientContentTabs && clientContentTabs.dataset.bound !== '1') {
      clientContentTabs.dataset.bound = '1';
      clientContentTabs.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest('[data-ctab]');
        if (!btn) return;
        event.preventDefault();
        event.stopPropagation();
        setClientContentTab(btn.getAttribute('data-ctab'));
      });
    }

    function renderClientAddressesHtml(addresses) {
      var list = Array.isArray(addresses) ? addresses : [];
      if (!list.length) return '<div class="muted" style="padding:4px 0;">\u0410\u0434\u0440\u0435\u0441\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.</div>';
      return list.map(function (address) {
        var main = [address && address.street, address && address.house].map(function (value) {
          return String(value || '').trim();
        }).filter(Boolean).join(', ');
        var details = [];
        if (address && address.entrance) details.push('\u043f\u043e\u0434\u044a\u0435\u0437\u0434 ' + address.entrance);
        if (address && address.floor) details.push('\u044d\u0442\u0430\u0436 ' + address.floor);
        if (address && address.apartment) details.push('\u043a\u0432 ' + address.apartment);
        var fullAddress = [main, details.join(', ')].filter(Boolean).join(', ') || String(address && address.address || '\u2014');
        var isDefault = Number(address && address.is_default || 0) === 1;
        var commentText = String(address && address.comment || '').trim();
        return '' +
          '<div class="shop-profile-card shop-profile-card--compact">' +
            '<div class="shop-address-card">' +
              '<div class="shop-address-card-main">' +
                '<div class="shop-address-card-title">' +
                  escapeHtml(fullAddress) +
                  (isDefault ? '<span class="muted"> \u2022 \u043e\u0441\u043d\u043e\u0432\u043d\u043e\u0439</span>' : '') +
                '</div>' +
                (commentText ? ('<div class="shop-address-card-sub">' + escapeHtml(commentText) + '</div>') : '') +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('');
    }

    function renderClientOrdersHistoryHtml(clientOrders) {
      var list = Array.isArray(clientOrders) ? clientOrders : [];
      if (!list.length) return '<div class="muted" style="padding:4px 0;">\u0417\u0430\u043a\u0430\u0437\u043e\u0432 \u043f\u043e\u043a\u0430 \u043d\u0435\u0442.</div>';
      return list.map(function (order) {
        var orderId = Number(order && order.id || 0);
        var title = orderId > 0 ? ('\u0417\u0430\u043a\u0430\u0437 #' + String(orderId)) : '\u0417\u0430\u043a\u0430\u0437';
        var statusTitle = String(order && order.status_title || '').trim();
        var metaParts = [formatClientDateTime(order && order.created_at)];
        if (statusTitle) metaParts.push(statusTitle);
        var openAttrs = orderId > 0
          ? ' data-action="open-order-from-client" data-order-id="' + escapeHtml(orderId) + '" role="button" tabindex="0"'
          : '';
        return '' +
          '<div class="shop-profile-card order-client-history-card"' + openAttrs + '>' +
            '<div><strong>' + escapeHtml(title) + '</strong></div>' +
            '<div class="muted">' + escapeHtml(metaParts.join(' \u2022 ')) + '</div>' +
            '<div><strong>' + escapeHtml(money(order && order.total_price || 0)) + '</strong></div>' +
          '</div>';
      }).join('');
    }

    function renderClientDiscountsHtml(discounts) {
      var list = Array.isArray(discounts) ? discounts : [];
      if (!list.length) return '';
      return list.map(function (discount) {
        var discountType = String(discount && discount.discount_type || '');
        var valueText = discountType === 'percent'
          ? String(discount && discount.discount_value || 0) + '%'
          : (discountType === 'fixed'
            ? ('-' + String(discount && discount.discount_value || 0) + '\u20bd')
            : (String(discount && discount.discount_value || 0) + '\u20bd'));
        var linkTypeText = String(discount && discount.link_type || '') === 'direct'
          ? '\u041d\u0430\u043f\u0440\u044f\u043c\u0443\u044e'
          : ('\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f: ' + String(discount && (discount.category_title || '\u2014') || '\u2014'));
        var statusClass = discount && discount.is_active ? '' : 'inactive';
        return '' +
          '<div class="discount-row">' +
            '<div class="discount-row-icon"><i class="fas fa-percentage"></i></div>' +
            '<div class="discount-row-info">' +
              '<div class="discount-row-title">' + escapeHtml(discount && discount.title || '\u0421\u043a\u0438\u0434\u043a\u0430') + '</div>' +
              '<div class="discount-row-meta">' + escapeHtml(linkTypeText) + '</div>' +
            '</div>' +
            '<div class="discount-row-value">' + escapeHtml(valueText) + '</div>' +
            '<div class="discount-row-status ' + statusClass + '"></div>' +
          '</div>';
      }).join('');
    }

    function renderClientTabState(tab, options) {
      var config = options && typeof options === 'object' ? options : {};
      var client = tab && tab.client || null;
      var fallbackName = String(tab && tab.fallbackName || '').trim();
      var fallbackPhone = String(tab && tab.fallbackPhone || '').trim();
      if (clientInfoName) clientInfoName.textContent = client && client.name || fallbackName || '\u2014';
      if (clientInfoPhone) {
        var phoneValue = client && client.phone || fallbackPhone || '\u2014';
        clientInfoPhone.textContent = formatPhoneDigitsToRU(phoneValue);
      }
      if (clientInfoBirthday) clientInfoBirthday.textContent = formatClientDate(client && client.birthday);
      setClientPhoto(client && client.photo || '');
      setClientContentTab(tab && tab.activeContentTab || 'addresses');
      if (config.loading) {
        if (clientAddressesList) clientAddressesList.innerHTML = '<div class="muted">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</div>';
        if (clientOrdersList) clientOrdersList.innerHTML = '<div class="muted">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</div>';
        if (clientDiscountsList) clientDiscountsList.innerHTML = '<div class="muted">\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026</div>';
        if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add('hidden');
        return;
      }
      if (config.error) {
        if (clientAddressesList) clientAddressesList.innerHTML = '<div class="muted">' + escapeHtml(config.error) + '</div>';
        if (clientOrdersList) clientOrdersList.innerHTML = '';
        if (clientDiscountsList) clientDiscountsList.innerHTML = '';
        if (clientDiscountsEmpty) clientDiscountsEmpty.classList.add('hidden');
        return;
      }
      if (clientAddressesList) clientAddressesList.innerHTML = renderClientAddressesHtml(tab && tab.addresses);
      if (clientOrdersList) clientOrdersList.innerHTML = renderClientOrdersHistoryHtml(tab && tab.orders);
      var discounts = Array.isArray(tab && tab.discounts) ? tab.discounts : [];
      if (clientDiscountsList) clientDiscountsList.innerHTML = renderClientDiscountsHtml(discounts);
      if (clientDiscountsEmpty) clientDiscountsEmpty.classList.toggle('hidden', discounts.length > 0);
    }

    async function loadClientTabData(tab, options) {
      var config = options && typeof options === 'object' ? options : {};
      if (!tab || String(tab.type || '') !== 'client' || tab.loading) return;
      if (!config.forceReload && tab.client && Array.isArray(tab.addresses) && Array.isArray(tab.orders) && Array.isArray(tab.discounts)) return;
      tab.loading = true;
      tab.error = null;
      if (tabsState.activeKey === tab.key) {
        showClientInfo();
        renderClientTabState(tab, { loading: true });
      }
      try {
        var results = await Promise.allSettled([
          apiJson('/api/admin/clients/' + String(tab.clientId)),
          apiJson('/api/admin/clients/' + String(tab.clientId) + '/addresses'),
          apiJson('/api/admin/clients/' + String(tab.clientId) + '/orders'),
          apiJson('/api/admin/clients/' + String(tab.clientId) + '/discounts')
        ]);
        var clientRes = results[0];
        var addressesRes = results[1];
        var ordersRes = results[2];
        var discountsRes = results[3];
        if (clientRes.status !== 'fulfilled') throw (clientRes.reason || new Error('CLIENT_LOAD_FAILED'));
        if (addressesRes.status !== 'fulfilled') throw (addressesRes.reason || new Error('CLIENT_ADDRESSES_LOAD_FAILED'));
        if (ordersRes.status !== 'fulfilled') throw (ordersRes.reason || new Error('CLIENT_ORDERS_LOAD_FAILED'));
        tab.client = clientRes.value && clientRes.value.data || null;
        tab.addresses = Array.isArray(addressesRes.value && addressesRes.value.data) ? addressesRes.value.data : [];
        tab.orders = Array.isArray(ordersRes.value && ordersRes.value.data) ? ordersRes.value.data : [];
        tab.discounts = discountsRes.status === 'fulfilled' && Array.isArray(discountsRes.value && discountsRes.value.data)
          ? discountsRes.value.data
          : [];
        tab.error = null;
        tab.title = buildClientTabTitle({
          client: tab.client,
          name: tab.fallbackName,
          phone: tab.fallbackPhone,
          id: tab.clientId
        });
        state.clientsCache.set(Number(tab.clientId), {
          client: tab.client,
          addresses: tab.addresses,
          orders: tab.orders,
          discounts: tab.discounts
        });
        renderTabs();
        if (tabsState.activeKey === tab.key) {
          showClientInfo();
          renderClientTabState(tab);
        }
      } catch (error) {
        console.error(error);
        tab.error = '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u043a\u043b\u0438\u0435\u043d\u0442\u0430';
        if (tabsState.activeKey === tab.key) {
          showClientInfo();
          renderClientTabState(tab, { error: tab.error });
        }
      } finally {
        tab.loading = false;
      }
    }

    async function activateClientTab(tab) {
      if (!tab || String(tab.type || '') !== 'client') return;
      var cached = state.clientsCache.get(Number(tab.clientId));
      if (cached && !tab.client) {
        tab.client = cached.client || null;
        tab.addresses = Array.isArray(cached.addresses) ? cached.addresses : [];
        tab.orders = Array.isArray(cached.orders) ? cached.orders : [];
        tab.discounts = Array.isArray(cached.discounts) ? cached.discounts : [];
        tab.title = buildClientTabTitle({
          client: tab.client,
          name: tab.fallbackName,
          phone: tab.fallbackPhone,
          id: tab.clientId
        });
        renderTabs();
      }
      showClientInfo();
      renderClientTabState(tab, {
        loading: !tab.client || !Array.isArray(tab.addresses) || !Array.isArray(tab.orders) || !Array.isArray(tab.discounts)
      });
      await loadClientTabData(tab);
    }

    async function findClientIdByPhone(phoneValue) {
      var digits = normalizePhoneDigits(phoneValue);
      if (!digits) return null;
      var localMatch = (Array.isArray(state.orders) ? state.orders : []).find(function (order) {
        return normalizePhoneDigits(order && order.customer_phone) === digits;
      }) || null;
      if (localMatch) {
        var localId = Number(localMatch && localMatch.customer_id || 0);
        if (localId > 0) return localId;
      }
      var qs = new URLSearchParams();
      qs.set('limit', '1');
      qs.set('offset', '0');
      qs.set('q', digits);
      var json = await apiJson('/api/admin/clients?' + qs.toString());
      var rows = Array.isArray(json && json.data) ? json.data : [];
      var match = rows.find(function (client) {
        return normalizePhoneDigits(client && client.phone) === digits;
      }) || rows[0] || null;
      var clientId = Number(match && match.id || 0);
      return clientId > 0 ? clientId : null;
    }

    async function ensureClientTab(options) {
      var config = options && typeof options === 'object' ? options : {};
      var clientId = Number(config.clientId || 0);
      var clientPhone = String(config.clientPhone || '').trim();
      var clientName = String(config.clientName || '').trim();
      var shouldActivate = config.activate !== false;
      if (!(clientId > 0)) {
        if (!clientPhone) return null;
        clientId = await findClientIdByPhone(clientPhone);
      }
      if (!(clientId > 0)) return null;
      var key = buildClientTabKey(clientId);
      var tab = getTabByKey(key);
      if (!tab) {
        tab = {
          key: key,
          type: 'client',
          clientId: clientId,
          title: buildClientTabTitle({ name: clientName, phone: clientPhone, id: clientId }),
          fallbackName: clientName,
          fallbackPhone: clientPhone,
          activeContentTab: 'addresses',
          client: null,
          addresses: null,
          orders: null,
          discounts: null,
          loading: false,
          error: null
        };
        tabsState.tabs.push(tab);
      } else {
        tab.type = 'client';
        if (!tab.fallbackName && clientName) tab.fallbackName = clientName;
        if (!tab.fallbackPhone && clientPhone) tab.fallbackPhone = clientPhone;
        if (!tab.activeContentTab) tab.activeContentTab = 'addresses';
        tab.title = buildClientTabTitle({
          client: tab.client,
          name: tab.fallbackName,
          phone: tab.fallbackPhone,
          id: clientId
        });
      }
      if (shouldActivate) setActiveOrderTab(key);
      else renderTabs();
      return tab;
    }

    function renderTabs() {
      if (cashOrderTabsHeaderEl) cashOrderTabsHeaderEl.classList.remove('hidden');
      if (!sharedOrderPanel) {
        if (cashOrderTabsEl) cashOrderTabsEl.innerHTML = '';
        return;
      }
      sharedOrderPanel.renderTabs({
        headers: cashOrderTabsHeaderEl ? [cashOrderTabsHeaderEl] : [],
        tabsEls: cashOrderTabsEl ? [cashOrderTabsEl] : [],
        tabs: tabsState.tabs,
        activeKey: tabsState.activeKey,
      });
    }

    function syncCashPaymentFooter(order) {
      if (!cashOrderPaymentBtnEl) return;
      if (!order) {
        cashOrderPaymentBtnEl.textContent = 'Принять оплату';
        cashOrderPaymentBtnEl.disabled = false;
        return;
      }
      var paid = isPaidOrder(order);
      cashOrderPaymentBtnEl.textContent = paid ? 'Оплачено' : 'Принять оплату';
      cashOrderPaymentBtnEl.disabled = paid;
    }

    function renderRightPane() {
      var activeTab = getActiveTab();
      var activeClientTab = getActiveClientTab();
      var activeOrder = activeClientTab ? null : getActiveOrder();
      var showHome = !activeTab || (!activeOrder && !activeClientTab);
      if (cashOrderTabsHeaderEl) cashOrderTabsHeaderEl.classList.remove('hidden');
      if (sidebarSummaryEl) sidebarSummaryEl.classList.toggle('hidden', !showHome);
      if (cashOrderInfoRootEl) cashOrderInfoRootEl.classList.toggle('hidden', showHome);
      if (showHome) {
        if (cashInfoRenderer) cashInfoRenderer.setOrder(null);
        syncCashPaymentFooter(null);
        return;
      }
      if (activeClientTab) {
        syncCashPaymentFooter(null);
        activateClientTab(activeClientTab).catch(console.error);
        return;
      }
      if (cashInfoRenderer) cashInfoRenderer.setOrder(activeOrder);
    }

    function buildJournalRow(order) {
      if (state.currentSection === 'money') {
        var moneyTitle = 'Приход по заказу #' + getOrderNumber(order);
        var moneyCustomer = String(order && order.customer_name || '').trim() || 'Клиент';
        return '<div class="cash-journal-entry cash-journal-entry--static"><div class="cash-journal-entry-icon"><i class="fas fa-arrow-down"></i></div><div class="cash-journal-entry-main"><div class="cash-journal-entry-top"><strong>' + escapeHtml(moneyTitle) + '</strong><span>' + escapeHtml(formatTime(order && order.created_at)) + '</span></div><div class="cash-journal-entry-sub">' + escapeHtml(moneyCustomer) + '</div><div class="cash-journal-entry-meta">' + escapeHtml([getPaymentLabel(order), 'Приход'].join(' · ')) + '</div></div><div class="cash-journal-entry-amount">' + escapeHtml(money(order && order.total_price || 0)) + '</div></div>';
      }
      var isActive = getOrderId(order) === Number(state.activeOrderId || 0);
      var title = 'Заказ #' + getOrderNumber(order);
      var customer = String(order && order.customer_name || '').trim() || 'Клиент';
      var metaParts = [];
      if (isNewOrder(order)) metaParts.push('Новый');
      metaParts.push(getPaymentLabel(order));
      metaParts.push(isPaidOrder(order) ? 'Оплачен' : 'Не оплачен');
      return '<button class="cash-journal-entry ' + (isActive ? 'is-active' : '') + '" type="button" data-order-id="' + String(getOrderId(order)) + '"><div class="cash-journal-entry-icon"><i class="fas ' + (isPaidOrder(order) ? 'fa-circle-check' : 'fa-bag-shopping') + '"></i></div><div class="cash-journal-entry-main"><div class="cash-journal-entry-top"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(formatTime(order && order.created_at)) + '</span></div><div class="cash-journal-entry-sub">' + escapeHtml(customer) + '</div><div class="cash-journal-entry-meta">' + escapeHtml(metaParts.join(' · ')) + '</div></div><div class="cash-journal-entry-amount">' + escapeHtml(money(getOrderDisplayTotal(order))) + '</div></button>';
    }

    function buildJournalRow(order) {
      if (state.currentSection === 'money') {
        var entry = order || {};
        var entryOrder = entry.order || null;
        var refund = entry.refund || null;
        var isRefund = String(entry && entry.entry_kind || '') === 'refund';
        var moneyTitle = (isRefund ? 'Возврат по заказу #' : 'Приход по заказу #') + getOrderNumber(entryOrder || entry);
        var moneyCustomer = String(entryOrder && entryOrder.customer_name || '').trim() || 'Клиент';
        var metaParts = [getMoneyEntryPaymentTitle(entry), isRefund ? 'Расход' : 'Приход'];
        if (isRefund && String(refund && refund.comment || '').trim()) metaParts.push(String(refund.comment).trim());
        return '<div class="cash-journal-entry cash-journal-entry--static' + (isRefund ? ' cash-journal-entry--refund' : '') + '"><div class="cash-journal-entry-icon"><i class="fas ' + (isRefund ? 'fa-rotate-left' : 'fa-arrow-down') + '"></i></div><div class="cash-journal-entry-main"><div class="cash-journal-entry-top"><strong>' + escapeHtml(moneyTitle) + '</strong><span>' + escapeHtml(formatTime(getMoneyEntryCreatedAt(entry))) + '</span></div><div class="cash-journal-entry-sub">' + escapeHtml(moneyCustomer) + '</div><div class="cash-journal-entry-meta">' + escapeHtml(metaParts.join(' · ')) + '</div></div><div class="cash-journal-entry-amount' + (isRefund ? ' is-negative' : '') + '">' + escapeHtml((isRefund ? '-' : '') + money(getMoneyEntryAmount(entry))) + '</div></div>';
      }
      var isActive = getOrderId(order) === Number(state.activeOrderId || 0);
      var title = 'Заказ #' + getOrderNumber(order);
      var customer = String(order && order.customer_name || '').trim() || 'Клиент';
      var metaParts = [];
      if (sharedOrderPanel && typeof sharedOrderPanel.buildOrderListRowInnerHtml === 'function') {
        var orderId = getOrderId(order);
        var rawAddress = order && order.address
          || (order && order.pickup_store_address
            ? (order.pickup_store_name ? String(order.pickup_store_name) + ', ' + String(order.pickup_store_address) : String(order.pickup_store_address))
            : '?');
        var shortAddressDisplay = typeof sharedOrderPanel.shortAddressForList === 'function'
          ? sharedOrderPanel.shortAddressForList(rawAddress)
          : (String(rawAddress || '').trim() || '?');
        var addressCommentDisplay = String(order && order.comment || '').trim() || 'Нет комментария';
        var customerNameShared = String(order && order.customer_name || '').trim() || 'Клиент';
        var customerId = Number(order && order.customer_id || 0);
        var customerPhoneRaw = String(order && order.customer_phone || '').trim();
        var customerPhone = customerPhoneRaw === '?' ? '' : customerPhoneRaw;
        var canOpenClient = customerId > 0 || !!customerPhone;
        var customerPhoneLineHtml = typeof sharedOrderPanel.buildOrderClientPhoneHtml === 'function'
          ? sharedOrderPanel.buildOrderClientPhoneHtml({
            phoneText: String(order && order.customer_phone || '?'),
            canLink: canOpenClient,
            linkAttrsHtml: canOpenClient
              ? ' data-action="open-client" data-client-id="' + (customerId > 0 ? String(customerId) : '') + '" data-client-phone="' + escapeHtml(customerPhone) + '" data-client-name="' + escapeHtml(String(order && order.customer_name || '')) + '"'
              : ''
          })
          : '<div class="order-client-phone muted"><i class="fas fa-phone"></i><span class="order-client-phone-text">' + escapeHtml(String(order && order.customer_phone || '?')) + '</span></div>';
        var timeIconHtml = typeof sharedOrderPanel.renderOrderTimeIcon === 'function'
          ? sharedOrderPanel.renderOrderTimeIcon(order)
          : '';
        var stageHtml = renderOrderStatusHoverCycleButton(order);
        var payment = String(order && order.payment_title || '').trim();
        var paymentCode = String(order && order.payment_code || '').toLowerCase();
        var isCash = paymentCode.indexOf('cash') !== -1;
        var isFullyRefunded = isOrderFullyRefunded(order);
        var paymentStatusText = isFullyRefunded ? 'Возврат' : (isPaidOrder(order) ? 'Оплачено' : 'Не оплачено');
        var paymentStateClass = isFullyRefunded
          ? 'order-payment-refund'
          : (isPaidOrder(order) ? 'order-payment-paid' : 'order-payment-unpaid');
        var paymentHtml = typeof sharedOrderPanel.buildOrderPaymentButtonHtml === 'function'
          ? sharedOrderPanel.buildOrderPaymentButtonHtml({
            paymentTypeClass: isCash ? 'order-payment-cash' : 'order-payment-card',
            paymentStateClass: paymentStateClass,
            paymentTitle: payment,
            paymentIconHtml: renderOrderPaymentIcon(order),
            totalText: money(getOrderDisplayTotal(order)),
            statusText: paymentStatusText
          })
          : '';
        return '<div class="order-row order-list-card js-order js-cash-order-row ' + (isActive ? 'is-active' : '') + '" role="button" tabindex="0" data-order-id="' + String(orderId) + '">' +
          sharedOrderPanel.buildOrderListRowInnerHtml({
            orderId: orderId,
            orderNumberText: String(getOrderNumber(order)),
            createdAtText: formatTime(order && order.created_at),
            showMultiSelect: false,
            multiSelected: false,
            customerName: customerNameShared,
            customerPhoneHtml: customerPhoneLineHtml,
            timeIconHtml: timeIconHtml,
            addressText: shortAddressDisplay,
            addressCommentText: addressCommentDisplay,
            stageHtml: stageHtml,
            paymentHtml: paymentHtml
          }) +
        '</div>';
      }
      var refundTitle = getOrderRefundStateTitle(order);
      if (isNewOrder(order)) metaParts.push('Новый');
      metaParts.push(getPaymentLabel(order));
      metaParts.push(isPaidOrder(order) ? 'Оплачен' : 'Не оплачен');
      if (refundTitle) metaParts.push(refundTitle);
      return '<button class="cash-journal-entry ' + (isActive ? 'is-active' : '') + '" type="button" data-order-id="' + String(getOrderId(order)) + '"><div class="cash-journal-entry-icon"><i class="fas ' + (isPaidOrder(order) ? 'fa-circle-check' : 'fa-bag-shopping') + '"></i></div><div class="cash-journal-entry-main"><div class="cash-journal-entry-top"><strong>' + escapeHtml(title) + '</strong><span>' + escapeHtml(formatTime(order && order.created_at)) + '</span></div><div class="cash-journal-entry-sub">' + escapeHtml(customer) + '</div><div class="cash-journal-entry-meta">' + escapeHtml(metaParts.join(' · ')) + '</div></div><div class="cash-journal-entry-amount">' + escapeHtml(money(getOrderDisplayTotal(order))) + '</div></button>';
    }

    function renderJournal() {
      renderFilterState();
      var orders = state.currentSection === 'money' ? getMoneyJournalEntries() : getOrderJournalOrders();
      journalListEl.classList.toggle('cash-journal-list--orders', state.currentSection === 'orders');
      journalListEl.innerHTML = isMultiDayRange()
        ? renderJournalDayGroups(orders)
        : orders.map(buildJournalRow).join('');
      if (journalEmptyEl) {
        journalEmptyEl.textContent = state.currentSection === 'money' ? 'Движений денег пока нет' : 'Заказов пока нет';
        journalEmptyEl.classList.toggle('hidden', orders.length > 0);
      }
    }

    function syncTabsWithLatestOrders() {
      tabsState.tabs.forEach(function (tab) {
        if (String(tab && tab.type || 'order') === 'client') return;
        var fresh = state.orders.find(function (order) {
          return getOrderId(order) === Number(tab && tab.orderId || 0);
        }) || null;
        if (fresh) {
          tab.order = Object.assign({}, tab.order, fresh);
          tab.title = buildOrderTabTitle(tab.order);
        }
      });
      if (tabsState.activeKey && !getTabByKey(tabsState.activeKey)) tabsState.activeKey = null;
      var activeTab = getActiveTab();
      if (activeTab && String(activeTab.type || 'order') === 'client') {
        state.activeOrderId = 0;
        return;
      }
      var activeOrder = getActiveOrder();
      state.activeOrderId = tabsState.activeKey && activeOrder ? getOrderId(activeOrder) : 0;
    }

    function goHome() {
      tabsState.activeKey = null;
      state.activeOrderId = 0;
      closeInlineStatusMenus();
      renderAll();
    }

    function setActiveOrderTab(key) {
      var tab = getTabByKey(key);
      if (!tab) return;
      tabsState.activeKey = key;
      state.activeOrderId = String(tab && tab.type || 'order') === 'client' ? 0 : Number(tab && tab.orderId || 0);
      closeInlineStatusMenus();
      renderAll();
    }

    function ensureOrderTab(order) {
      if (!(getOrderId(order) > 0)) return null;
      var key = buildOrderTabKey(order.id);
      var tab = getTabByKey(key);
      if (!tab) {
        tab = { key: key, type: 'order', orderId: Number(order.id || 0), title: buildOrderTabTitle(order), order: Object.assign({}, order) };
        tabsState.tabs.push(tab);
      } else {
        tab.type = 'order';
        tab.order = Object.assign({}, tab.order, order);
        tab.title = buildOrderTabTitle(tab.order);
      }
      setActiveOrderTab(key);
      return tab;
    }

    function closeOrderTab(key) {
      var index = tabsState.tabs.findIndex(function (tab) { return String(tab && tab.key || '') === String(key || ''); });
      if (index === -1) return;
      var wasActive = String(tabsState.activeKey || '') === String(key || '');
      tabsState.tabs.splice(index, 1);
      if (wasActive) {
        var next = tabsState.tabs[index] || tabsState.tabs[index - 1] || null;
        tabsState.activeKey = next ? next.key : null;
        state.activeOrderId = next && String(next.type || 'order') !== 'client' ? Number(next.orderId || 0) : 0;
      }
      renderAll();
    }

    function updateOrderInState(order) {
      var orderId = getOrderId(order);
      if (!(orderId > 0)) return;
      var index = state.orders.findIndex(function (row) { return getOrderId(row) === orderId; });
      if (index === -1) state.orders.unshift(order);
      else state.orders[index] = Object.assign({}, state.orders[index], order);
      syncTabsWithLatestOrders();
    }

    function removeOrderFromState(orderId) {
      var id = Number(orderId || 0);
      if (!(id > 0)) return false;
      var index = state.orders.findIndex(function (row) { return getOrderId(row) === id; });
      if (index === -1) return false;
      state.orders.splice(index, 1);
      syncTabsWithLatestOrders();
      return true;
    }

    function orderMatchesActiveDateRange(order) {
      if (!(getOrderId(order) > 0)) return false;
      if (!state.date.start || !state.date.end) return true;
      var parts = parseLocalDateParts(order && (order.scheduled_at || order.created_at));
      if (!parts) return false;
      var key = [String(parts.year || ''), String(parts.month).padStart(2, '0'), String(parts.day).padStart(2, '0')].join('-');
      var startKey = toDateKey(state.date.start);
      var endKey = toDateKey(state.date.end);
      return key >= startKey && key <= endKey;
    }

    function applyOrderChange(order) {
      var orderId = getOrderId(order);
      if (!(orderId > 0)) return false;
      if (!orderMatchesActiveDateRange(order)) return removeOrderFromState(orderId);
      updateOrderInState(order);
      return true;
    }

    function buildDateQuery(qs) {
      if (state.date.start && state.date.end) {
        qs.set('start_date', toDateKey(state.date.start));
        qs.set('end_date', toDateKey(state.date.end));
      }
      return qs;
    }

    function loadStoreTimezone() {
      return apiJson('/api/admin/tenant/current-time').then(function (json) {
        if (json && json.data && json.data.storeTimezone != null) state.storeTimezone = String(json.data.storeTimezone || '+0');
      }).catch(function (err) {
        console.error('cash timezone load error:', err);
      });
    }

    function formatDateLabel(start, end) {
      if (!start || !end) return 'Сегодня';
      var startText = start.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      var endText = end.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      return startText === endText ? startText : startText + ' — ' + endText;
    }

    function updateDateLabel() {
      if (dateLabel) dateLabel.textContent = formatDateLabel(state.date.start, state.date.end);
    }

    function resetDateStateToToday(baseDate) {
      var today = baseDate instanceof Date && !Number.isNaN(baseDate.getTime())
        ? new Date(baseDate)
        : getStoreDateNow(state.storeTimezone || '+0');
      state.date.start = today;
      state.date.end = new Date(today);
      state.date.viewYear = today.getFullYear();
      state.date.viewMonth = today.getMonth();
      updateDateLabel();
    }

    function ensureDateStateInitialized() {
      if (!state.date.start || !state.date.end) {
        var today = getStoreDateNow(state.storeTimezone || '+0');
        state.date.start = today;
        state.date.end = today;
      }
      var hasValidViewYear = Number.isInteger(state.date.viewYear);
      var hasValidViewMonth = Number.isInteger(state.date.viewMonth) && state.date.viewMonth >= 0 && state.date.viewMonth <= 11;
      if (!hasValidViewYear || !hasValidViewMonth) {
        var baseDate = state.date.start || getStoreDateNow(state.storeTimezone || '+0');
        state.date.viewYear = baseDate.getFullYear();
        state.date.viewMonth = baseDate.getMonth();
      }
      updateDateLabel();
    }

    function openDatePopover() {
      if (!datePopover) return;
      datePopover.classList.remove('hidden');
      if (dateBtn) dateBtn.setAttribute('aria-expanded', 'true');
    }

    function closeDatePopover() {
      if (!datePopover) return;
      datePopover.classList.add('hidden');
      if (dateBtn) dateBtn.setAttribute('aria-expanded', 'false');
    }

    function renderCalendar() {
      if (!dateGrid || !dateTitle) return;
      var first = new Date(state.date.viewYear, state.date.viewMonth, 1);
      var daysInMonth = new Date(state.date.viewYear, state.date.viewMonth + 1, 0).getDate();
      var offset = (first.getDay() + 6) % 7;
      var todayKey = toDateKey(getStoreDateNow(state.storeTimezone || '+0'));
      var titleText = first.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
      dateTitle.textContent = titleText.charAt(0).toUpperCase() + titleText.slice(1);
      var cells = [];
      for (var emptyIdx = 0; emptyIdx < offset; emptyIdx += 1) cells.push('<span class="date-empty"></span>');
      for (var day = 1; day <= daysInMonth; day += 1) {
        var currentDate = new Date(state.date.viewYear, state.date.viewMonth, day);
        var key = toDateKey(currentDate);
        var startKey = state.date.start ? toDateKey(state.date.start) : null;
        var endKey = state.date.end ? toDateKey(state.date.end) : null;
        var classes = ['date-cell'];
        if (startKey && key === startKey) classes.push('is-start');
        if (endKey && key === endKey) classes.push('is-end');
        if (startKey && endKey && key > startKey && key < endKey) classes.push('is-in-range');
        if (key === todayKey) classes.push('is-today');
        cells.push('<button class="' + classes.join(' ') + '" type="button" data-date="' + key + '">' + String(day) + '</button>');
      }
      dateGrid.innerHTML = cells.join('');
    }

    function applyDateFilter(closePopoverAfter) {
      state.dayGroupsCollapsed = {};
      updateDateLabel();
      Promise.all([loadStatuses(), loadOrders()]).then(function () { renderAll(); }).catch(console.error);
      if (closePopoverAfter) closeDatePopover();
    }

    function onDateClick(dateKey) {
      var clicked = parseDateKey(dateKey);
      if (!clicked) return;
      if (state.date.start && state.date.end) {
        state.date.start = clicked;
        state.date.end = null;
        renderCalendar();
        return;
      }
      if (!state.date.start) {
        state.date.start = clicked;
        state.date.end = null;
        renderCalendar();
        return;
      }
      if (!state.date.end) {
        state.date.end = clicked;
        if (state.date.end < state.date.start) {
          var tmp = state.date.start;
          state.date.start = state.date.end;
          state.date.end = tmp;
        }
        renderCalendar();
        applyDateFilter(true);
      }
    }

    function onDateDoubleClick(dateKey) {
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      var clicked = parseDateKey(dateKey);
      if (!clicked) return;
      state.date.start = new Date(clicked);
      state.date.end = new Date(clicked);
      renderCalendar();
      applyDateFilter(true);
    }

    function resetDateFilter() {
      var today = getStoreDateNow(state.storeTimezone || '+0');
      state.date.start = today;
      state.date.end = today;
      state.date.viewYear = today.getFullYear();
      state.date.viewMonth = today.getMonth();
      renderCalendar();
      applyDateFilter(true);
    }

    function loadStatuses() {
      var qs = buildDateQuery(new URLSearchParams());
      return apiJson('/api/admin/orders/statuses?' + qs.toString()).then(function (json) {
        state.statuses = Array.isArray(json && json.data) ? json.data.slice() : [];
        renderInlineStatusMenus(getActiveOrder());
      }).catch(function (err) {
        console.error('cash statuses load error:', err);
      });
    }

    function loadOrders() {
      if (state.loadPromise) return state.loadPromise;
      state.loading = true;
      var qs = buildDateQuery(new URLSearchParams());
      qs.set('limit', '500');
      qs.set('offset', '0');
      state.loadPromise = apiJson('/api/admin/orders?' + qs.toString()).then(function (json) {
        state.orders = Array.isArray(json && json.data) ? json.data.slice() : [];
        syncTabsWithLatestOrders();
      }).catch(function (err) {
        console.error('cash orders load error:', err);
      }).finally(function () {
        state.loading = false;
        state.loadPromise = null;
        renderAll();
      });
      return state.loadPromise;
    }

    function printOrderReceipt(order) {
      if (!(getOrderId(order) > 0)) return;
      if (!isOrderPrintable(order)) return;
      var displayOrder = getDisplayOrder(order) || order;
      var lines = (Array.isArray(displayOrder && displayOrder.items) ? displayOrder.items : []).map(function (item) {
        var qty = Math.max(1, Number(item && (item.qty || item.quantity) || 1));
        var title = String(item && (item.product_name || item.name || item.combo_title) || 'Позиция');
        return '<div style="display:flex;justify-content:space-between;gap:8px;"><span>' + escapeHtml(String(qty) + ' x ' + title) + '</span><span>' + escapeHtml(money(item && (item.line_total || item.total || item.total_price) || 0)) + '</span></div>';
      }).join('');
      var html = '<!doctype html><html><head><meta charset="utf-8"><title>Чек</title></head><body style="font-family:Courier New,monospace;padding:16px;"><h3 style="margin:0 0 8px;">Заказ #' + escapeHtml(getOrderNumber(displayOrder)) + '</h3><div style="margin-bottom:4px;">' + escapeHtml(formatDateTime(displayOrder.created_at)) + '</div><div style="margin-bottom:4px;">' + escapeHtml(String(displayOrder.customer_name || 'Клиент')) + '</div><div style="margin-bottom:12px;">' + escapeHtml(String(displayOrder.customer_phone || '')) + '</div><div style="display:grid;gap:6px;margin-bottom:12px;">' + lines + '</div><div style="display:flex;justify-content:space-between;font-weight:700;"><span>Итого</span><span>' + escapeHtml(money(displayOrder.total_price || 0)) + '</span></div></body></html>';
      var width = 400;
      var height = 600;
      var left = (screen.width / 2) - (width / 2);
      var top = (screen.height / 2) - (height / 2);
      var printWindow = window.open('', '_blank', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);
      if (!printWindow) return;
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.onload = function () {
        setTimeout(function () { printWindow.print(); }, 250);
      };
      printWindow.addEventListener('afterprint', function () { printWindow.close(); });
    }

    function updateOrderStatus(orderId, statusId) {
      var currentOrderId = Number(orderId || 0);
      var nextStatusId = Number(statusId || 0);
      if (!(currentOrderId > 0) || !(nextStatusId > 0)) return Promise.resolve();
      var previous = state.orders.find(function (row) { return getOrderId(row) === currentOrderId; }) || null;
      var optimistic = previous ? Object.assign({}, previous) : null;
      var previousMeta = previous ? (getStatusMetaById(previous.status_id) || null) : null;
      var nextMeta = getStatusMetaById(nextStatusId);
      if (isFinalStatusMeta(previousMeta) || isForbiddenStatusTransition(previousMeta, nextMeta)) return Promise.resolve();
      if (optimistic && nextMeta) {
        optimistic.status_id = nextStatusId;
        optimistic.status_title = nextMeta.title || optimistic.status_title;
        optimistic.status_code = nextMeta.code || optimistic.status_code;
        optimistic.status_color = nextMeta.color || optimistic.status_color;
        updateOrderInState(optimistic);
        renderAll();
      }
      return apiJson('/api/admin/orders/' + String(currentOrderId) + '/status', {
        method: 'PUT',
        body: { status_id: nextStatusId },
      }).then(function () {
        return loadOrders();
      }).catch(function (err) {
        if (previous) {
          updateOrderInState(previous);
          renderAll();
        }
        throw err;
      });
    }

    function cycleActiveOrderStatus() {
      var order = getActiveOrder();
      var currentOrderId = getOrderId(order);
      if (!(currentOrderId > 0)) return;
      var nextStatus = getNextStatusMetaForOrder(order);
      if (!nextStatus) return;
      setStatusControlsDisabled(true);
      updateOrderStatus(currentOrderId, nextStatus.id).catch(console.error).finally(function () {
        setStatusControlsDisabled(false);
      });
    }

    function selectActiveOrderStatus(statusId) {
      var order = getActiveOrder();
      var currentOrderId = getOrderId(order);
      var nextStatusId = Number(statusId || 0);
      if (!(currentOrderId > 0) || !(nextStatusId > 0)) return;
      if (Number(order && order.status_id || 0) === nextStatusId) {
        closeInlineStatusMenus();
        return;
      }
      setStatusControlsDisabled(true);
      updateOrderStatus(currentOrderId, nextStatusId).catch(console.error).finally(function () {
        setStatusControlsDisabled(false);
        closeInlineStatusMenus();
      });
    }

    function toggleCashPaymentModalSkin(enabled) {
      if (appModalEl) appModalEl.classList.toggle('cash-payment-app-modal', !!enabled);
      if (appModalBodyEl) appModalBodyEl.classList.toggle('cash-payment-app-modal-body', !!enabled);
    }

    function translateCashPaymentError(err) {
      var code = String(err && err.message || '').trim();
      if (code === 'BAD_PAYMENT_CODE') return 'Не удалось сохранить выбранный способ оплаты';
      if (code === 'BAD_CHANGE_FROM') return 'Сумма от клиента должна быть больше суммы заказа';
      if (code === 'BAD_IS_PAID') return 'Не удалось подтвердить оплату';
      if (code === 'NOT_FOUND') return 'Заказ не найден';
      return code || 'Не удалось принять оплату';
    }

    function createCashPaymentModalController(order, paymentMethods) {
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

        host.className = 'cash-payment-modal';
        host.innerHTML =
          '<div class="cash-payment-order-card">' +
            '<div class="cash-payment-order-kicker">Принять оплату</div>' +
            '<div class="cash-payment-order-meta">' +
              '<div class="cash-payment-order-main">' +
                '<div class="cash-payment-order-number">Заказ #' + escapeHtml(getOrderNumber(order)) + '</div>' +
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

    function openMarkPaidDialog(order) {
      var orderId = getOrderId(order);
      if (!(orderId > 0) || isPaidOrder(order)) return;
      if (sharedOrderPayment && typeof sharedOrderPayment.open === 'function') {
        return sharedOrderPayment.open({
          order: order,
          apiJson: apiJson,
          money: money,
          formatDateTimeNumeric: formatDateTimeNumeric,
          getOrderId: getOrderId,
          getOrderNumber: getOrderNumber,
          isPaidOrder: isPaidOrder,
          onSuccess: function (updatedOrder) {
            updateOrderInState(updatedOrder);
            renderAll();
          },
          onError: function (err) {
            console.error('cash payment modal init error:', err);
          },
        });
      }
      var modal = window.AppModal;
      var orderId = getOrderId(order);
      if (!(orderId > 0) || isPaidOrder(order)) return;
      if (!modal || typeof modal.open !== 'function') {
        return apiJson('/api/admin/orders/' + orderId + '/paid', { method: 'PUT', body: { is_paid: 1 } }).then(function (json) {
          updateOrderInState(json && json.data);
          renderAll();
        }).catch(function (err) {
          console.error('cash paid update error:', err);
        });
      }
      ensurePaymentMethodsLoaded(order).then(function (paymentMethods) {
        var methods = Array.isArray(paymentMethods) && paymentMethods.length ? paymentMethods : getActivePaymentMethods(order);
        var paymentController = createCashPaymentModalController(order, methods);
        toggleCashPaymentModalSkin(true);
        modal.open({
          title: 'Принять оплату',
          saveText: 'Принять оплату',
          cancelText: 'Отмена',
          content: paymentController.host,
          onSave: function () {
            var payload = paymentController.getPayload();
            if (!payload) return false;
            return apiJson('/api/admin/orders/' + orderId + '/paid', {
              method: 'PUT',
              body: payload,
            }).then(function (json) {
              updateOrderInState(json && json.data);
              renderAll();
              return true;
            }).catch(function (err) {
              paymentController.setError(translateCashPaymentError(err));
              return false;
            });
          },
          onClose: function () {
            toggleCashPaymentModalSkin(false);
          },
        });
      }).catch(function (err) {
        console.error('cash payment modal init error:', err);
      });
    }

    function syncCashPaymentFooter(order) {
      if (!cashOrderPaymentBtnEl) return;
      if (!order) {
        cashOrderPaymentBtnEl.textContent = 'Принять оплату';
        cashOrderPaymentBtnEl.disabled = true;
        return;
      }
      cashOrderPaymentBtnEl.textContent = getPaymentActionLabel(order);
      cashOrderPaymentBtnEl.disabled = isOrderFullyRefunded(order);
    }

    function openMarkPaidDialog(order) {
      var orderId = getOrderId(order);
      if (!(orderId > 0) || isOrderFullyRefunded(order)) return;
      if (sharedOrderPayment && typeof sharedOrderPayment.open === 'function') {
        return sharedOrderPayment.open({
          order: order,
          apiJson: apiJson,
          money: money,
          formatDateTimeNumeric: formatDateTimeNumeric,
          getOrderId: getOrderId,
          getOrderNumber: getOrderNumber,
          isPaidOrder: isPaidOrder,
          onSuccess: function (updatedOrder) {
            updateOrderInState(updatedOrder);
            renderAll();
          },
          onError: function (err) {
            console.error('cash payment modal init error:', err);
          },
        });
      }
      if (isPaidOrder(order)) return;
      return apiJson('/api/admin/orders/' + orderId + '/paid', { method: 'PUT', body: { is_paid: 1 } }).then(function (json) {
        updateOrderInState(json && json.data);
        renderAll();
      }).catch(function (err) {
        console.error('cash paid update error:', err);
      });
    }

    function bootstrapEventsCursor() {
      return apiJson('/api/admin/orders/changes?since=0').then(function (json) {
        var cursor = Number(json && json.cursor || 0);
        if (Number.isFinite(cursor) && cursor > 0) state.eventsCursor = cursor;
      }).catch(function (err) {
        console.error('cash events bootstrap error:', err);
      });
    }

    function fetchOrderChanges() {
      return apiJson('/api/admin/orders/changes?since=' + String(Number(state.eventsCursor || 0))).then(function (json) {
        var cursor = Number(json && json.cursor || 0);
        if (Number.isFinite(cursor) && cursor > 0) state.eventsCursor = Math.max(Number(state.eventsCursor || 0), cursor);
        var changes = Array.isArray(json && json.data) ? json.data : [];
        var changed = false;
        changes.forEach(function (evt) {
          var eventId = Number(evt && evt.id || 0);
          if (Number.isFinite(eventId) && eventId > 0) state.eventsCursor = Math.max(Number(state.eventsCursor || 0), eventId);
          var eventName = String(evt && evt.event || '').toLowerCase();
          if (eventName !== 'order.created' && eventName !== 'order.updated') return;
          if (applyOrderChange(evt && evt.data)) changed = true;
        });
        if (changed) renderAll();
      });
    }

    function waitForOrderChanges() {
      var qs = new URLSearchParams({
        since: String(Number(state.eventsCursor || 0)),
        timeout_ms: String(WAIT_TIMEOUT_MS),
        _ts: String(Date.now()),
      });
      var controller = new AbortController();
      waitAbortController = controller;
      return apiJson('/api/admin/orders/changes/wait?' + qs.toString(), { signal: controller.signal }).then(function (json) {
        return json && json.data ? json.data : {};
      }).finally(function () {
        if (waitAbortController === controller) {
          waitAbortController = null;
        }
      });
    }

    function stopWaitLoop() {
      state.waitLoopToken += 1;
      if (waitAbortController) {
        try { waitAbortController.abort(); } catch {}
        waitAbortController = null;
      }
    }

    function startWaitLoop() {
      if (document.visibilityState && document.visibilityState !== 'visible') return;
      var token = ++state.waitLoopToken;
      (async function runWaitLoop() {
        if (!(Number(state.eventsCursor || 0) > 0)) await bootstrapEventsCursor();
        while (token === state.waitLoopToken) {
          try {
            var data = await waitForOrderChanges();
            var cursor = Number(data && data.cursor || 0);
            if (data && data.changed === true) {
              try {
                await fetchOrderChanges();
              } catch (deltaErr) {
                console.error('cash changes fetch error:', deltaErr);
                if (Number.isFinite(cursor) && cursor > 0) state.eventsCursor = cursor;
                await loadOrders();
              }
            } else if (Number.isFinite(cursor) && cursor > 0 && !(Number(state.eventsCursor || 0) > 0)) {
              state.eventsCursor = cursor;
            }
          } catch (err) {
            if (isAbortError(err)) return;
            console.error('cash wait loop error:', err);
            await sleepMs(WAIT_RETRY_MS);
          }
        }
      })().catch(function (err) {
        console.error('cash wait init error:', err);
      });
    }

    function renderAll() {
      syncTabsWithLatestOrders();
      renderSummaryCards();
      renderSidebarSummary();
      renderJournal();
      renderTabs();
      renderRightPane();
    }

    if (sharedOrderPanel && cashOrderTabsEl) sharedOrderPanel.bindTabsWheelScroll([cashOrderTabsEl]);

    if (filtersEl) {
      filtersEl.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest('[data-cash-section]');
        if (!btn) return;
        state.currentSection = String(btn.getAttribute('data-cash-section') || 'orders');
        state.orderFilterMenuOpen = false;
        renderAll();
      });
    }

    if (orderFilterWrapEl) {
      orderFilterWrapEl.addEventListener('click', function (event) {
        var target = event.target;
        var filterBtn = target && target.closest('#cashOrderFilterBtn');
        if (filterBtn) {
          event.preventDefault();
          event.stopPropagation();
          state.orderFilterMenuOpen = !state.orderFilterMenuOpen;
          renderFilterState();
          return;
        }
        var optionBtn = target && target.closest('[data-cash-order-filter]');
        if (!optionBtn) return;
        event.preventDefault();
        event.stopPropagation();
        state.orderFilter = String(optionBtn.getAttribute('data-cash-order-filter') || 'all');
        state.orderFilterMenuOpen = false;
        renderAll();
      });
    }

    journalListEl.addEventListener('click', function (event) {
      var dayToggle = event.target && event.target.closest('[data-cash-day-toggle]');
      if (dayToggle) {
        event.preventDefault();
        event.stopPropagation();
        var dayKey = String(dayToggle.getAttribute('data-cash-day-toggle') || '').trim();
        if (dayKey) {
          var isCollapsed = !Object.prototype.hasOwnProperty.call(state.dayGroupsCollapsed || {}, dayKey)
            ? true
            : !!state.dayGroupsCollapsed[dayKey];
          state.dayGroupsCollapsed[dayKey] = !isCollapsed;
          renderJournal();
        }
        return;
      }
      if (state.currentSection !== 'orders') return;
      var stageBtn = event.target && event.target.closest('[data-action="order-row-status-next"]');
      if (stageBtn) {
        event.preventDefault();
        event.stopPropagation();
        var stageOrderId = Number(stageBtn.getAttribute('data-order-id') || 0);
        var nextStatusId = Number(stageBtn.getAttribute('data-next-status-id') || 0);
        if (!(stageOrderId > 0) || !(nextStatusId > 0)) return;
        setStatusControlsDisabled(true);
        updateOrderStatus(stageOrderId, nextStatusId).catch(console.error).finally(function () {
          setStatusControlsDisabled(false);
        });
        return;
      }
      var openClientBtn = event.target && event.target.closest('[data-action="open-client"]');
      if (openClientBtn) {
        event.preventDefault();
        event.stopPropagation();
        var clientId = Number(openClientBtn.getAttribute('data-client-id') || 0);
        var clientPhone = String(openClientBtn.getAttribute('data-client-phone') || '').trim();
        var clientName = String(openClientBtn.getAttribute('data-client-name') || '').trim();
        if (clientPhone === '?') clientPhone = '';
        ensureClientTab({
          clientId: clientId,
          clientPhone: clientPhone,
          clientName: clientName,
          activate: true
        }).catch(console.error);
        return;
      }
      if (event.target && event.target.closest('.order-payment-btn')) {
        event.stopPropagation();
        return;
      }
      var row = event.target && event.target.closest('.js-order');
      if (!row) return;
      var orderId = Number(row.getAttribute('data-order-id') || 0);
      var order = state.orders.find(function (item) { return getOrderId(item) === orderId; }) || null;
      if (!order) return;
      ensureOrderTab(order);
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (orderFilterWrapEl && state.orderFilterMenuOpen && (!target || !orderFilterWrapEl.contains(target))) {
        closeOrderFilterMenu();
      }
      var tabCloseBtn = target && target.closest('[data-order-tab-close]');
      if (tabCloseBtn && cashRightPaneEl && cashRightPaneEl.contains(tabCloseBtn)) {
        event.preventDefault();
        event.stopPropagation();
        closeOrderTab(tabCloseBtn.getAttribute('data-order-tab-close'));
        return;
      }
      var tabBtn = target && target.closest('[data-order-tab-key]');
      if (tabBtn && cashRightPaneEl && cashRightPaneEl.contains(tabBtn)) {
        event.preventDefault();
        setActiveOrderTab(tabBtn.getAttribute('data-order-tab-key'));
        return;
      }
      var openOrderFromClientBtn = target && target.closest('[data-action="open-order-from-client"]');
      if (openOrderFromClientBtn && cashRightPaneEl && cashRightPaneEl.contains(openOrderFromClientBtn)) {
        event.preventDefault();
        event.stopPropagation();
        var clientOrderId = Number(openOrderFromClientBtn.getAttribute('data-order-id') || 0);
        if (!(clientOrderId > 0)) return;
        var clientOrder = state.orders.find(function (item) { return getOrderId(item) === clientOrderId; }) || null;
        if (!clientOrder) {
          apiJson('/api/admin/orders/' + String(clientOrderId)).then(function (json) {
            var loadedOrder = json && json.data || null;
            if (loadedOrder) ensureOrderTab(loadedOrder);
          }).catch(console.error);
          return;
        }
        ensureOrderTab(clientOrder);
        return;
      }
      var openClientBtn = target && target.closest('[data-action="open-client"]');
      if (openClientBtn && cashRightPaneEl && cashRightPaneEl.contains(openClientBtn)) {
        event.preventDefault();
        event.stopPropagation();
        var infoClientId = Number(openClientBtn.getAttribute('data-client-id') || 0);
        var infoClientPhone = String(openClientBtn.getAttribute('data-client-phone') || '').trim();
        var infoClientName = String(openClientBtn.getAttribute('data-client-name') || '').trim();
        var activeOrder = getActiveOrder();
        if (!(infoClientId > 0) && activeOrder) infoClientId = Number(activeOrder.customer_id || 0);
        if (!infoClientPhone && activeOrder) infoClientPhone = String(activeOrder.customer_phone || '').trim();
        if (!infoClientName && activeOrder) infoClientName = String(activeOrder.customer_name || '').trim();
        if (infoClientPhone === '?') infoClientPhone = '';
        ensureClientTab({
          clientId: infoClientId,
          clientPhone: infoClientPhone,
          clientName: infoClientName,
          activate: true
        }).catch(console.error);
        return;
      }
      var homeBtn = target && target.closest('[data-action="order-tabs-home"]');
      if (homeBtn && cashRightPaneEl && cashRightPaneEl.contains(homeBtn)) {
        event.preventDefault();
        event.stopPropagation();
        goHome();
        return;
      }
      var markPaidBtn = target && target.closest('[data-cash-action="mark-paid"]');
      if (markPaidBtn && cashRightPaneEl && cashRightPaneEl.contains(markPaidBtn)) {
        event.preventDefault();
        event.stopPropagation();
        var activeOrder = getActiveOrder();
        if (activeOrder) openMarkPaidDialog(activeOrder);
        return;
      }
      var statusOptionBtn = target && target.closest('[data-action="order-status-menu-select"]');
      if (statusOptionBtn && cashRightPaneEl && cashRightPaneEl.contains(statusOptionBtn)) {
        event.preventDefault();
        event.stopPropagation();
        selectActiveOrderStatus(Number(statusOptionBtn.getAttribute('data-status-id') || 0));
        return;
      }
      var statusToggleBtn = target && target.closest('[data-action="order-status-menu-toggle"]');
      if (statusToggleBtn && cashRightPaneEl && cashRightPaneEl.contains(statusToggleBtn)) {
        event.preventDefault();
        event.stopPropagation();
        var wrap = statusToggleBtn.closest('[data-role="order-inline-status"]');
        if (!wrap) return;
        var shouldOpen = !wrap.classList.contains('is-open');
        closeInlineStatusMenus();
        if (shouldOpen) {
          wrap.classList.add('is-open');
          var dropdown = wrap.querySelector('[data-role="order-status-menu"]');
          if (dropdown) dropdown.classList.remove('hidden');
          statusToggleBtn.setAttribute('aria-expanded', 'true');
        }
        return;
      }
      var statusNextBtn = target && target.closest('[data-action="order-status-next"]');
      if (statusNextBtn && cashRightPaneEl && cashRightPaneEl.contains(statusNextBtn)) {
        event.preventDefault();
        event.stopPropagation();
        cycleActiveOrderStatus();
        return;
      }
      var printBtn = target && target.closest('[data-action="order-print"]');
      if (printBtn && cashRightPaneEl && cashRightPaneEl.contains(printBtn)) {
        event.preventDefault();
        event.stopPropagation();
        var orderForPrint = getActiveOrder();
        if (orderForPrint && isOrderPrintable(orderForPrint)) printOrderReceipt(orderForPrint);
        return;
      }
      var editBtn = target && target.closest('[data-action="order-edit"]');
      if (editBtn && cashRightPaneEl && cashRightPaneEl.contains(editBtn)) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (cashRightPaneEl && !target.closest('[data-role="order-inline-status"]')) closeInlineStatusMenus();
    });

    if (dateBtn && datePopover) {
      dateBtn.addEventListener('click', function (event) {
        event.stopPropagation();
        if (datePopover.classList.contains('hidden')) openDatePopover();
        else closeDatePopover();
      });
      document.addEventListener('click', function (event) {
        if (!datePopover || datePopover.classList.contains('hidden')) return;
        if (event.target.closest('#cashDatePopover') || event.target.closest('#cashDateBtn')) return;
        closeDatePopover();
        if (state.date.start && !state.date.end) {
          state.date.end = state.date.start;
          applyDateFilter(true);
        }
      });
    }

    if (dateGrid) {
      dateGrid.addEventListener('click', function (event) {
        var btn = event.target && event.target.closest('[data-date]');
        if (!btn) return;
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(function () {
          clickTimer = null;
          onDateClick(btn.getAttribute('data-date'));
        }, 250);
      });
      dateGrid.addEventListener('dblclick', function (event) {
        var btn = event.target && event.target.closest('[data-date]');
        if (!btn) return;
        onDateDoubleClick(btn.getAttribute('data-date'));
      });
    }

    if (datePrev) {
      datePrev.addEventListener('click', function () {
        state.date.viewMonth -= 1;
        if (state.date.viewMonth < 0) {
          state.date.viewMonth = 11;
          state.date.viewYear -= 1;
        }
        renderCalendar();
      });
    }

    if (dateNext) {
      dateNext.addEventListener('click', function () {
        state.date.viewMonth += 1;
        if (state.date.viewMonth > 11) {
          state.date.viewMonth = 0;
          state.date.viewYear += 1;
        }
        renderCalendar();
      });
    }

    if (dateReset) {
      dateReset.addEventListener('click', function () { resetDateFilter(); });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        stopWaitLoop();
        return;
      }
      loadOrders();
      startWaitLoop();
    });

    window.addEventListener('pagehide', function () {
      stopWaitLoop();
    });

    window.addEventListener('beforeunload', function () {
      stopWaitLoop();
    });

    document.addEventListener('tenantStoreChanged', function () {
      stopWaitLoop();
      state.orders = [];
      state.statuses = [];
      state.paymentMethods = [];
      state.paymentMethodsPromise = null;
      state.clientsCache.clear();
      state.activeOrderId = 0;
      state.eventsCursor = 0;
      tabsState.tabs = [];
      tabsState.activeKey = null;
      loadStoreTimezone().finally(function () {
        resetDateStateToToday();
        ensureDateStateInitialized();
        renderCalendar();
        bootstrapEventsCursor().finally(function () {
          Promise.all([loadStatuses(), loadOrders(), ensurePaymentMethodsLoaded()]).finally(function () {
            renderAll();
            startWaitLoop();
          });
        });
      });
    });

    loadStoreTimezone().finally(function () {
      resetDateStateToToday();
      ensureDateStateInitialized();
      renderCalendar();
      renderAll();
      bootstrapEventsCursor().finally(function () {
        Promise.all([loadStatuses(), loadOrders(), ensurePaymentMethodsLoaded()]).finally(function () {
          renderAll();
          startWaitLoop();
        });
      });
    });
  } catch (err) {
    console.error('cash page init error:', err);
  }
})();
