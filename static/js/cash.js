// Логика страницы "Касса" — список чеков на основе заказов
(function () {
  try {
    var listEl = document.getElementById('cashList');
    var emptyHintEl = document.getElementById('cashEmptyHint');
    var infoEmptyEl = document.getElementById('cashInfoEmpty');
    var infoContentEl = document.getElementById('cashInfoContent');
    var cashTabsHeaderEl = document.getElementById('cashTabsHeader');
    var cashTabsEl = document.getElementById('cashTabs');

    if (!listEl) return;

    // -----------------------------
    // API helper (как в orders.js)
    // -----------------------------
    async function apiJson(url, opts) {
      opts = opts || {};

      var token = localStorage.getItem('authToken');
      var storeId = localStorage.getItem('activeStoreId') || '1';
      var headers = {};

      if (opts.body) {
        headers['Content-Type'] = 'application/json';
      }
      if (opts.headers) {
        for (var k in opts.headers) headers[k] = opts.headers[k];
      }
      if (token) {
        headers['Authorization'] = 'Bearer ' + token;
      }
      headers['x-store-id'] = storeId;

      var res = await fetch(url, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });

      if (res.status === 401) {
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');
        localStorage.removeItem('tenant');
        window.location.href = '/login';
        throw new Error('UNAUTHORIZED');
      }

      var json = null;
      try {
        json = await res.json();
      } catch (_) {}

      if (!json || json.ok !== true) {
        var err = (json && json.error) || ('API_ERROR (' + res.status + ')');
        throw new Error(err);
      }

      return json;
    }

    // -----------------------------
    // Helpers
    // -----------------------------
    var moneyFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
    function money(v) {
      var n = Number(v || 0);
      return moneyFmt.format(isFinite(n) ? n : 0) + ' ₽';
    }

    function parseLocalDateParts(ts) {
      if (!ts) return null;
      var raw = String(ts).trim();
      var match = raw.match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/
      );
      if (match) {
        return {
          year: Number(match[1]),
          month: Number(match[2]),
          day: Number(match[3]),
          hour: Number(match[4]),
          minute: Number(match[5]),
          second: Number(match[6] || 0)
        };
      }
      var fallback = new Date(raw.replace(' ', 'T'));
      if (isNaN(fallback.getTime())) return null;
      return {
        year: fallback.getFullYear(),
        month: fallback.getMonth() + 1,
        day: fallback.getDate(),
        hour: fallback.getHours(),
        minute: fallback.getMinutes(),
        second: fallback.getSeconds()
      };
    }

    function formatTime(ts) {
      if (!ts) return '';
      var parts = parseLocalDateParts(ts);
      if (!parts) return '';
      var hours = String(parts.hour).padStart(2, '0');
      var minutes = String(parts.minute).padStart(2, '0');
      return hours + ':' + minutes;
    }

    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function paymentIcon(code) {
      if (!code) return 'fa-credit-card';
      var c = String(code).toLowerCase();
      if (c.includes('cash')) return 'fa-money-bill-wave';
      if (c.includes('card')) return 'fa-credit-card';
      if (c.includes('online')) return 'fa-globe';
      return 'fa-credit-card';
    }

    // Позиции «Приборы» и прочие auto_add — в конец списка
    function isAutoAddItem(item) {
      if (Number((item && item.auto_add) || 0) === 1) return true;
      var name = String((item && (item.product_name || item.name)) || '').trim().toLowerCase();
      return name === 'приборы';
    }

    var receiptBoxEl = document.getElementById('cashReceiptBox');

    var tabsState = {
      tabs: [], // { key, orderId, title, order }
      activeKey: null
    };

    function buildTabKey(orderId) {
      return 'order:' + String(orderId);
    }

    function renderTabs() {
      if (!cashTabsHeaderEl || !cashTabsEl) return;
      var hasTabs = tabsState.tabs.length > 0;
      cashTabsHeaderEl.classList.toggle('hidden', !hasTabs);
      if (!hasTabs) {
        cashTabsEl.innerHTML = '';
        if (receiptBoxEl) receiptBoxEl.innerHTML = '';
        if (infoEmptyEl) infoEmptyEl.classList.remove('hidden');
        if (infoContentEl) infoContentEl.classList.add('hidden');
        return;
      }

      cashTabsEl.innerHTML = tabsState.tabs.map(function (tab) {
        var isActive = tab.key === tabsState.activeKey;
        return (
          '<div class="cash-tab ' + (isActive ? 'is-active' : '') + '" data-cash-tab-key="' + tab.key + '">' +
            '<span class="cash-tab-title">' + escapeHtml(tab.title || '') + '</span>' +
            '<button class="cash-tab-close" type="button" data-cash-tab-close="' + tab.key + '" aria-label="Закрыть">×</button>' +
          '</div>'
        );
      }).join('');
    }

    function setActiveTabKey(key) {
      var tab = tabsState.tabs.find(function (t) { return t.key === key; });
      if (!tab) return;
      tabsState.activeKey = key;
      renderTabs();
      renderCashReceipt(tab.order);
      if (infoEmptyEl) infoEmptyEl.classList.add('hidden');
      if (infoContentEl) infoContentEl.classList.remove('hidden');
    }

    function ensureTabForOrder(order) {
      if (!order) return;
      var key = buildTabKey(order.id);
      var title = 'Чек #' + String(order.id);
      var tab = tabsState.tabs.find(function (t) { return t.key === key; });
      if (!tab) {
        tab = { key: key, orderId: order.id, title: title, order: order };
        tabsState.tabs.push(tab);
      } else {
        tab.title = title;
        tab.order = order;
      }
      setActiveTabKey(key);
    }

    function closeTab(key) {
      var idx = tabsState.tabs.findIndex(function (t) { return t.key === key; });
      if (idx === -1) return;
      tabsState.tabs.splice(idx, 1);
      if (tabsState.activeKey === key) {
        var next = tabsState.tabs[idx] || tabsState.tabs[idx - 1] || null;
        tabsState.activeKey = next ? next.key : null;
        if (next) {
          renderTabs();
          renderCashReceipt(next.order);
        } else {
          renderTabs();
        }
      } else {
        renderTabs();
      }
    }

    function buildCashOrderRow(order) {
      var row = document.createElement('div');
      row.className = 'order-row cash-order-row';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('data-order-id', String(order.id));

      var totalText = money(order.total_price || 0);
      var paymentCode = String(order.payment_code || '').toLowerCase();
      var isCash = paymentCode.includes('cash');

      var address =
        order.address ||
        (order.pickup_store_address
          ? (order.pickup_store_name
            ? order.pickup_store_name + ', ' + order.pickup_store_address
            : order.pickup_store_address)
          : '?');

      row.innerHTML =
        '<div class="order-col order-id">' +
          '<div class="order-id-num">' + escapeHtml(order.id) + '</div>' +
          '<div class="order-id-time">' + escapeHtml(formatTime(order.created_at)) + '</div>' +
        '</div>' +

        '<div class="order-col order-main">' +
          '<div class="order-main-line">' +
            '<span class="order-client-name"><i class="fas fa-user"></i> ' + escapeHtml(order.customer_name || '?') + '</span>' +
            '<span class="order-client-phone muted"><i class="fas fa-phone"></i> ' + escapeHtml(order.customer_phone || '?') + '</span>' +
            '<span class="order-address-line"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(address) + '</span>' +
          '</div>' +
        '</div>' +

        '<div class="order-col order-total">' +
          '<button class="order-payment-btn ' + (isCash ? 'order-payment-cash' : 'order-payment-card') + '" type="button">' +
            '<i class="fas ' + paymentIcon(order.payment_code) + '"></i> ' + escapeHtml(totalText) +
          '</button>' +
        '</div>';

      row.addEventListener('click', function () {
        var active = document.querySelector('.cash-order-row.is-active');
        if (active) active.classList.remove('is-active');
        row.classList.add('is-active');
        ensureTabForOrder(order);
      });

      return row;
    }

    // -----------------------------
    // Date filter state + helpers
    // -----------------------------
    var dateState = {
      start: null,
      end: null,
      viewYear: null,
      viewMonth: null
    };

    var dateBtn = document.getElementById('cashDateBtn');
    var dateLabel = document.getElementById('cashDateLabel');
    var datePopover = document.getElementById('cashDatePopover');
    var dateGrid = document.getElementById('cashDateGrid');
    var dateTitle = document.getElementById('cashDateTitle');
    var datePrev = document.getElementById('cashDatePrev');
    var dateNext = document.getElementById('cashDateNext');
    var dateReset = document.getElementById('cashDateReset');

    function toDateKey(d) {
      var yyyy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return yyyy + '-' + mm + '-' + dd;
    }

    function parseDateKey(s) {
      if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
      var parts = s.split('-');
      var y = Number(parts[0]);
      var m = Number(parts[1]);
      var d = Number(parts[2]);
      var date = new Date(y, m - 1, d);
      if (isNaN(date.getTime())) return null;
      return date;
    }

    function formatDateLabel(start, end) {
      if (!start || !end) return 'Сегодня';
      var s = start.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      var e = end.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
      return s === e ? s : (s + ' — ' + e);
    }

    function updateDateLabel() {
      if (dateLabel) dateLabel.textContent = formatDateLabel(dateState.start, dateState.end);
    }

    function openDatePopover() {
      if (!datePopover) return;
      datePopover.classList.remove('hidden');
      if (!dateState.viewYear || !dateState.viewMonth) {
        var base = dateState.start || new Date();
        dateState.viewYear = base.getFullYear();
        dateState.viewMonth = base.getMonth();
      }
      renderDateGrid();
    }

    function closeDatePopover() {
      if (!datePopover) return;
      datePopover.classList.add('hidden');
    }

    function renderDateGrid() {
      if (!dateGrid) return;

      var year = dateState.viewYear;
      var month = dateState.viewMonth;
      if (year == null || month == null) {
        var now = new Date();
        year = now.getFullYear();
        month = now.getMonth();
        dateState.viewYear = year;
        dateState.viewMonth = month;
      }

      var firstOfMonth = new Date(year, month, 1);
      var daysInMonth = new Date(year, month + 1, 0).getDate();
      var offset = (firstOfMonth.getDay() + 6) % 7;

      if (dateTitle) {
        var monthTitle = firstOfMonth.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
        dateTitle.textContent = monthTitle.charAt(0).toUpperCase() + monthTitle.slice(1);
      }

      dateGrid.innerHTML = '';

      for (var i = 0; i < offset; i++) {
        var empty = document.createElement('span');
        empty.className = 'date-empty';
        dateGrid.appendChild(empty);
      }

      var startKey = dateState.start ? toDateKey(dateState.start) : null;
      var endKey = dateState.end ? toDateKey(dateState.end) : null;
      var todayKey = toDateKey(new Date());

      for (var day = 1; day <= daysInMonth; day++) {
        var d = new Date(year, month, day);
        var key = toDateKey(d);

        var isStart = startKey && key === startKey;
        var isEnd = endKey && key === endKey;
        var isRange = startKey && endKey && key > startKey && key < endKey;
        var isToday = key === todayKey;

        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'date-cell' +
          (isStart ? ' is-start' : '') +
          (isEnd ? ' is-end' : '') +
          (isRange ? ' is-in-range' : '') +
          (isToday ? ' is-today' : '');
        cell.textContent = String(day);
        cell.setAttribute('data-date', key);

        dateGrid.appendChild(cell);
      }
    }

    var clickTimer = null;

    function onDateClick(dateKey) {
      var clicked = parseDateKey(dateKey);
      if (!clicked) return;

      if (dateState.start && dateState.end) {
        dateState.start = clicked;
        dateState.end = null;
        renderDateGrid();
        return;
      }

      if (!dateState.start) {
        dateState.start = clicked;
        dateState.end = null;
        renderDateGrid();
        return;
      }

      if (dateState.start && !dateState.end) {
        dateState.end = clicked;
        if (dateState.end < dateState.start) {
          var tmp = dateState.start;
          dateState.start = dateState.end;
          dateState.end = tmp;
        }
        renderDateGrid();
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

      dateState.start = new Date(clicked);
      dateState.end = new Date(clicked);
      renderDateGrid();
      applyDateFilter(true);
    }

    function applyDateFilter(close) {
      updateDateLabel();
      initCash(); // перезагружаем список с учётом новых дат
      if (close) closeDatePopover();
    }

    if (dateBtn && datePopover) {
      dateBtn.addEventListener('click', function () {
        var isOpen = !datePopover.classList.contains('hidden');
        if (isOpen) {
          closeDatePopover();
        } else {
          openDatePopover();
        }
      });
    }

    if (dateGrid) {
      dateGrid.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-date]');
        if (!btn) return;

        if (clickTimer) {
          clearTimeout(clickTimer);
        }
        clickTimer = setTimeout(function () {
          clickTimer = null;
          onDateClick(btn.getAttribute('data-date'));
        }, 250);
      });

      dateGrid.addEventListener('dblclick', function (e) {
        var btn = e.target.closest('[data-date]');
        if (!btn) return;
        onDateDoubleClick(btn.getAttribute('data-date'));
      });
    }

    if (datePrev) {
      datePrev.addEventListener('click', function () {
        if (dateState.viewYear == null || dateState.viewMonth == null) {
          var now = new Date();
          dateState.viewYear = now.getFullYear();
          dateState.viewMonth = now.getMonth();
        }
        dateState.viewMonth--;
        if (dateState.viewMonth < 0) {
          dateState.viewMonth = 11;
          dateState.viewYear--;
        }
        renderDateGrid();
      });
    }

    if (dateNext) {
      dateNext.addEventListener('click', function () {
        if (dateState.viewYear == null || dateState.viewMonth == null) {
          var now = new Date();
          dateState.viewYear = now.getFullYear();
          dateState.viewMonth = now.getMonth();
        }
        dateState.viewMonth++;
        if (dateState.viewMonth > 11) {
          dateState.viewMonth = 0;
          dateState.viewYear++;
        }
        renderDateGrid();
      });
    }

    if (dateReset) {
      dateReset.addEventListener('click', function () {
        dateState.start = null;
        dateState.end = null;
        var now = new Date();
        dateState.viewYear = now.getFullYear();
        dateState.viewMonth = now.getMonth();
        renderDateGrid();
        applyDateFilter(true);
      });
    }

    document.addEventListener('click', function (e) {
      if (!datePopover || datePopover.classList.contains('hidden')) return;
      if (datePopover.contains(e.target)) return;
      if (dateBtn && (e.target === dateBtn || dateBtn.contains(e.target))) return;
      closeDatePopover();
    });

    if (cashTabsEl) {
      cashTabsEl.addEventListener('click', function (e) {
        var closeBtn = e.target.closest('[data-cash-tab-close]');
        if (closeBtn) {
          e.stopPropagation();
          var key = closeBtn.getAttribute('data-cash-tab-close');
          if (key) closeTab(key);
          return;
        }
        var tabEl = e.target.closest('[data-cash-tab-key]');
        if (tabEl) {
          var key2 = tabEl.getAttribute('data-cash-tab-key');
          if (key2) setActiveTabKey(key2);
        }
      });

      cashTabsEl.addEventListener('wheel', function (e) {
        if (e.deltaY !== 0) {
          e.preventDefault();
          cashTabsEl.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    // -----------------------------
    // Receipt preview (right column)
    // -----------------------------
    var receiptBoxEl = document.getElementById('cashReceiptBox');
    var receiptOrderIdEl = document.getElementById('cashReceiptOrderId');

    function formatReceiptDate(order) {
      if (!order || !order.created_at) return '';
      var parts = parseLocalDateParts(order.created_at);
      if (!parts) return '';
      var day = String(parts.day).padStart(2, '0');
      var month = String(parts.month).padStart(2, '0');
      var year = parts.year;
      var hours = String(parts.hour).padStart(2, '0');
      var minutes = String(parts.minute).padStart(2, '0');
      return day + '.' + month + '.' + year + ', ' + hours + ':' + minutes;
    }

    function renderCashReceipt(order) {
      if (!receiptBoxEl || !order) return;

      if (receiptOrderIdEl) {
        receiptOrderIdEl.textContent = String(order.id || '—');
      }

      // ----- Логика максимально совпадает с generateReceiptHTML -----
      var createdParts = parseLocalDateParts(order.created_at);

      var day = createdParts ? String(createdParts.day).padStart(2, '0') : '';
      var month = createdParts ? String(createdParts.month).padStart(2, '0') : '';
      var year = createdParts ? createdParts.year : '';
      var hours = createdParts ? String(createdParts.hour).padStart(2, '0') : '';
      var minutes = createdParts ? String(createdParts.minute).padStart(2, '0') : '';

      var dateStr = day + '.' + month + '.' + year + ', ' + hours + ':' + minutes;

      var methodTitle = order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка");
      var deliverySectionTitle = order.method_code === "pickup" ? "Самовывоз:" : "Доставка:";
      var address = order.address;
      if (!address && order.pickup_store_address) {
        address = order.pickup_store_name
          ? order.pickup_store_name + ', ' + order.pickup_store_address
          : order.pickup_store_address;
      }
      var isUrgent = order.is_urgent || order.urgent || order.time_option_code === "urgent";
      var total = parseFloat(order.total_price || order.total || 0);
      var deliveryCost = Number(order.delivery_cost || 0);
      var changeFromRaw = order.change_from;
      var changeFrom = Number.isFinite(Number(changeFromRaw)) ? Number(changeFromRaw) : 0;
      var paymentTitle = order.payment_method_title || order.payment_title || "";
      var paymentCode = order.payment_code || "";
      var changeAmount = Math.max(0, changeFrom - total);
      var showChange = changeAmount > 0;

      // Упрощённый вариант scheduleText: без часовых поясов, как в generateReceiptHTML
      var scheduleText = "";
      if (order.scheduled_at || order.time_option_title) {
        var tTitle = String(order.time_option_title || "").trim();
        var scheduledAt = order.scheduled_at;
        if (scheduledAt) {
          var scheduledParts = parseLocalDateParts(scheduledAt);
          if (scheduledParts) {
            var hh = String(scheduledParts.hour).padStart(2, '0');
            var mm = String(scheduledParts.minute).padStart(2, '0');
            scheduleText = (tTitle || "Ко времени") + ": " + hh + ":" + mm;
          }
        } else {
          scheduleText = tTitle;
        }
      }

      function receiptTotalStr(val) {
        var n = Number(val);
        if (!isFinite(n)) return "";
        if (n === 0) return "";
        return Math.round(n) === n ? String(Math.round(n)) : n.toFixed(2);
      }

      var items = Array.isArray(order.items) ? order.items.slice() : [];
      if (items.length) {
        items.sort(function (a, b) {
          var aAuto = isAutoAddItem(a);
          var bAuto = isAutoAddItem(b);
          if (aAuto && !bAuto) return 1;
          if (!aAuto && bAuto) return -1;
          return 0;
        });
      }

      var itemsHtml = '';
      if (items.length) {
        items.forEach(function (item) {
          // Комбо: тот же состав, что в админке и у клиента; позиции с количеством 0 не показываем
          if (item.type === "combo") {
            var name = escapeHtml(item.name || item.combo_title || "Комбо");
            var qty = Math.max(1, Number(item.quantity || item.qty || 0) || 1);
            var lineTotal = Number(item.line_total != null ? item.line_total : item.total != null ? item.total : item.total_price != null ? item.total_price : 0);
            var priceStr = receiptTotalStr(lineTotal);
            var qtyStr = qty + " Х";
            var bulletPrefix = "• ";
            var compositionHtml = "";
            var selections = Array.isArray(item.selections) ? item.selections : [];
            selections.forEach(function (sel) {
              compositionHtml += '<div class="receipt-composition-item" style="font-weight: bold;">1 × ' + escapeHtml(sel.product_name || "—") + '</div>';
              var vParts = [sel.variant_label, sel.variant_unit, sel.variant_group_title].filter(Boolean);
              if (vParts.length) {
                compositionHtml += '<div class="receipt-composition-item">' + bulletPrefix + escapeHtml(vParts.join(" ")) + '</div>';
              }
              var ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
              ingredientsDisplay.forEach(function (ing) {
                var rawQty = ing.qty != null ? ing.qty : ing.quantity;
                var numQty = typeof rawQty === "number" ? rawQty : parseFloat(rawQty);
                if (!(numQty > 0)) return;
                var ingName = escapeHtml(ing.name || "");
                var unit = escapeHtml(String(ing.unit || "").trim());
                var parts = [];
                if (rawQty != null && rawQty !== "") parts.push(String(rawQty));
                if (unit) parts.push(unit);
                if (ingName) parts.push(ingName);
                compositionHtml += '<div class="receipt-composition-item">' + bulletPrefix + escapeHtml(parts.join(" ")) + '</div>';
              });
            });
            itemsHtml +=
              '<div class="receipt-item">' +
                '<div class="receipt-item-row">' +
                  '<span class="receipt-item-qty">' + escapeHtml(qtyStr) + '</span>' +
                  '<span class="receipt-item-name">' + name + '</span>' +
                  (priceStr ? '<span class="receipt-item-price">' + escapeHtml(priceStr) + '</span>' : '') +
                '</div>' +
                (compositionHtml ? '<div class="receipt-composition">' + compositionHtml + '</div>' : '') +
              '</div>';
            return;
          }

          var name = escapeHtml(item.product_name || item.name || "Товар");
          var qty = Math.max(1, Number(item.quantity || item.qty || 0) || 1);
          var basePrice = parseFloat(item.price || 0);
          var lineTotal = Number(
            item.line_total != null ? item.line_total :
            item.total != null ? item.total :
            item.total_price != null ? item.total_price :
            (basePrice * qty) || 0
          );
          var priceStr = receiptTotalStr(lineTotal);
          var qtyStr = qty + " Х";
          var bulletPrefix = "• ";

          var variants = Array.isArray(item.variants) ? item.variants : [];
          var variantsHtml = "";
          if (variants.length) {
            variantsHtml = '<div class="receipt-composition">';
            variants.forEach(function (v) {
              var groupTitle = escapeHtml(v.group_title || "Вариант");
              var variantValue = escapeHtml(v.label || v.value || "");
              var formatted = (variantValue ? variantValue + " " + groupTitle : groupTitle).trim();
              variantsHtml += '<div class="receipt-composition-item">' + bulletPrefix + formatted + '</div>';
            });
            variantsHtml += '</div>';
          }

          var ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
          var ingredientsFiltered = ingredients.filter(function (ing) {
            return Number(ing.quantity != null ? ing.quantity : ing.qty != null ? ing.qty : 0) > 0;
          });
          var ingredientsHtml = "";
          if (ingredientsFiltered.length) {
            ingredientsHtml = '<div class="receipt-composition">';
            ingredientsFiltered.forEach(function (ing) {
              var ingName = escapeHtml(ing.name || "Ингредиент");
              var ingQty = Number(ing.quantity != null ? ing.quantity : ing.qty != null ? ing.qty : 0);
              var ingUnit = escapeHtml(
                ing.unit_label || ing.unit || ing.unitLabel || ing.unit_short_title || ing.unit_title || ""
              );
              if (!ingUnit) {
                ingUnit = ingQty > 10 ? "г" : "шт";
              }
              var formattedIng = ingQty + ingUnit + " " + ingName;
              ingredientsHtml += '<div class="receipt-composition-item">' + bulletPrefix + formattedIng + '</div>';
            });
            ingredientsHtml += '</div>';
          }

          var options = Array.isArray(item.options) ? item.options : [];
          var optionsFiltered = options.filter(function (opt) {
            return Number(opt.qty != null ? opt.qty : opt.quantity != null ? opt.quantity : 0) > 0;
          });
          var optionsHtml = "";
          if (optionsFiltered.length) {
            optionsHtml = '<div class="receipt-composition">';
            optionsFiltered.forEach(function (opt) {
              var optName = escapeHtml(opt.title || "Опция");
              var variantLabel = escapeHtml(String(opt.variant_label || opt.variantLabel || "").trim());
              var formattedOpt;
              if (variantLabel) {
                formattedOpt = variantLabel + " " + optName;
              } else {
                var optQty = Math.max(1, Number(opt.qty || 1));
                formattedOpt = optQty + "шт " + optName;
              }
              optionsHtml += '<div class="receipt-composition-item">' + bulletPrefix + formattedOpt + '</div>';
            });
            optionsHtml += '</div>';
          }

          itemsHtml +=
            '<div class="receipt-item">' +
              '<div class="receipt-item-row">' +
                '<span class="receipt-item-qty">' + escapeHtml(qtyStr) + '</span>' +
                '<span class="receipt-item-name">' + name + '</span>' +
                (priceStr ? '<span class="receipt-item-price">' + escapeHtml(priceStr) + '</span>' : '') +
              '</div>' +
              variantsHtml +
              ingredientsHtml +
              optionsHtml +
            '</div>';
        });
      }

      var html = '';
      html += '<div class="receipt-header">ЗАКАЗ #' + escapeHtml(order.id) + '</div>';
      html += '<div class="receipt-date">' + escapeHtml(dateStr) + '</div>';
      html += '<div class="receipt-divider"></div>';

      if (scheduleText || isUrgent) {
        html += '<div class="receipt-section receipt-when-block">';
        html += '<div class="receipt-when-text">' + escapeHtml(scheduleText || (isUrgent ? "Быстрее" : "")) + '</div>';
        html += '</div>';
        html += '<div class="receipt-divider"></div>';
      }

      html += '<div class="receipt-section">';
      if (order.customer_name) html += '<div>' + escapeHtml(order.customer_name) + '</div>';
      if (order.customer_phone) html += '<div>' + escapeHtml(order.customer_phone) + '</div>';
      html += '</div>';

      html += '<div class="receipt-section">';
      html += '<div>' + escapeHtml(methodTitle || "—") + '</div>';
      html += '<div>' + escapeHtml(address || "—") + '</div>';
      html += '</div>';

      if (order.address_comment && String(order.address_comment).trim()) {
        html += '<div class="receipt-section">';
        html += '<div>' + escapeHtml(order.address_comment) + '</div>';
        html += '</div>';
      }
      if (order.comment && String(order.comment).trim()) {
        html += '<div class="receipt-section">';
        html += '<div>' + escapeHtml(order.comment) + '</div>';
        html += '</div>';
      }

      html += '<div class="receipt-divider"></div>';
      html += '<div class="receipt-section">' + itemsHtml + '</div>';
      html += '<div class="receipt-divider"></div>';

      html += '<div class="receipt-section">';
      if (paymentTitle) {
        html += '<div class="receipt-summary-row"><div class="receipt-summary-label">Оплата</div>' +
                '<div class="receipt-summary-value">' + escapeHtml(paymentTitle) + '</div></div>';
      }
      if (showChange) {
        html += '<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача с</div>' +
                '<div class="receipt-summary-value">' + escapeHtml(money(changeFrom)) + '</div></div>';
        html += '<div class="receipt-summary-row"><div class="receipt-summary-label">Сдача</div>' +
                '<div class="receipt-summary-value">' + escapeHtml(money(changeAmount)) + '</div></div>';
      }
      html += '<div class="receipt-summary-row"><div class="receipt-summary-label">Доставка</div>' +
              '<div class="receipt-summary-value">' + escapeHtml(money(deliveryCost)) + '</div></div>';
      html += '<div class="receipt-total">ИТОГО: ' + escapeHtml(money(total)) + '</div>';
      html += '</div>';

      html += '<div style="margin-top: 20px; text-align: center; font-size: 10pt;">';
      html += '<div>Спасибо за заказ!</div>';
      html += '</div>';

      receiptBoxEl.innerHTML = html;
    }

    // -----------------------------
    // Data loading
    // -----------------------------
    async function loadCashOrders() {
      var qs = new URLSearchParams();
      qs.set('limit', '100');
      qs.set('offset', '0');

      if (dateState.start && dateState.end) {
        qs.set('start_date', toDateKey(dateState.start));
        qs.set('end_date', toDateKey(dateState.end));
      }

      var json = await apiJson('/api/admin/orders?' + qs.toString());
      return Array.isArray(json.data) ? json.data : [];
    }

    function renderCashOrders(orders) {
      listEl.innerHTML = '';

      if (!Array.isArray(orders) || !orders.length) {
        if (emptyHintEl) emptyHintEl.classList.remove('hidden');
        return;
      }

      if (emptyHintEl) emptyHintEl.classList.add('hidden');

      // Определяем режим: один день или диапазон
      var singleDay =
        !dateState.start ||
        !dateState.end ||
        toDateKey(dateState.start) === toDateKey(dateState.end);

      if (singleDay) {
        // Простой список, как сейчас
        orders.forEach(function (order) {
          var row = buildCashOrderRow(order);
          listEl.appendChild(row);
        });
        return;
      }

      // Диапазон — группируем по дням и рисуем аккордеон
      var groups = {};
      orders.forEach(function (order) {
        var key = '';
        if (order.created_at) {
          var d = new Date(String(order.created_at).replace(' ', 'T'));
          if (!isNaN(d.getTime())) {
            key = toDateKey(d);
          }
        }
        if (!key) {
          key = 'unknown';
        }
        if (!groups[key]) groups[key] = [];
        groups[key].push(order);
      });

      var dateKeys = Object.keys(groups).filter(function (k) { return k !== 'unknown'; }).sort();
      if (groups.unknown && groups.unknown.length) {
        dateKeys.push('unknown');
      }

      dateKeys.forEach(function (key) {
        var dayOrders = groups[key];
        if (!dayOrders || !dayOrders.length) return;

        var section = document.createElement('div');
        section.className = 'cash-day-section';

        var header = document.createElement('button');
        header.type = 'button';
        header.className = 'cash-day-header';
        header.setAttribute('data-date-key', key);

        var titleSpan = document.createElement('span');
        titleSpan.className = 'cash-day-title';

        if (key === 'unknown') {
          titleSpan.textContent = 'Без даты';
        } else {
          var d = parseDateKey(key);
          if (d) {
            var label = d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
            titleSpan.textContent = label;
          } else {
            titleSpan.textContent = key;
          }
        }

        var countSpan = document.createElement('span');
        countSpan.className = 'cash-day-count';
        countSpan.textContent = dayOrders.length + ' чек(ов)';

        var chevron = document.createElement('span');
        chevron.className = 'cash-day-chevron';
        chevron.innerHTML = '<i class="fas fa-chevron-down"></i>';

        header.appendChild(titleSpan);
        header.appendChild(countSpan);
        header.appendChild(chevron);

        var panel = document.createElement('div');
        panel.className = 'cash-day-panel';

        dayOrders.forEach(function (order) {
          var row = buildCashOrderRow(order);
          panel.appendChild(row);
        });

        // В диапазоне все дни изначально раскрыты
        section.appendChild(header);
        section.appendChild(panel);
        listEl.appendChild(section);

        header.addEventListener('click', function () {
          // В режиме диапазона дни можно сворачивать/разворачивать
          var isCollapsed = section.classList.toggle('is-collapsed');
          if (isCollapsed) {
            panel.classList.add('hidden');
            chevron.classList.add('is-collapsed');
          } else {
            panel.classList.remove('hidden');
            chevron.classList.remove('is-collapsed');
          }
        });
      });
    }

    async function initCash() {
      try {
        if (emptyHintEl) emptyHintEl.classList.remove('hidden');

        var orders = await loadCashOrders();
        renderCashOrders(orders);
      } catch (err) {
        console.error('Cash orders load error:', err);
        if (emptyHintEl) emptyHintEl.classList.remove('hidden');
      }
    }

    // Инициализация: по умолчанию фильтр "Сегодня" и реальная фильтрация по дате
    (async function initCashPage() {
      try {
        var today = new Date();
        dateState.start = today;
        dateState.end = today;
        dateState.viewYear = today.getFullYear();
        dateState.viewMonth = today.getMonth();

        renderDateGrid();
        if (dateLabel) {
          dateLabel.textContent = 'Сегодня';
        } else {
          updateDateLabel();
        }

        await initCash();
      } catch (e) {
        console.error('Cash init error:', e);
        initCash();
      }
    })();
  } catch (e) {
    console.error('Cash page init error:', e);
  }
})();
