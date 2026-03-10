(function () {
  function toArray(value) {
    return Array.isArray(value) ? value.filter(Boolean) : [];
  }

  function queryAll(root, selector) {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    return Array.from(root.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function roundMoney(value) {
    var numeric = Number(value || 0);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round((numeric + Number.EPSILON) * 100) / 100;
  }

  function clonePlainObject(value) {
    if (!value || typeof value !== "object") return {};
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (err) {
      return Object.assign({}, value);
    }
  }

  function getItemQty(item) {
    return Math.max(0, Number(item && (item.qty != null ? item.qty : item.quantity) || 0) || 0);
  }

  function getItemOldLineTotal(item) {
    var qty = getItemQty(item);
    var lineTotal = roundMoney(
      Number(item && (item.line_total != null ? item.line_total : item.total != null ? item.total : item.total_price) || 0)
    );
    var oldLineTotal = roundMoney(
      Number(item && (item.old_line_total != null
        ? item.old_line_total
        : item.discount && item.discount.original_line_total != null
          ? item.discount.original_line_total
          : 0) || 0)
    );
    var oldPrice = Number(item && item.old_price || 0);
    var oldPriceLineTotal = oldPrice > 0 && qty > 0 ? roundMoney(oldPrice * qty) : 0;
    return Math.max(lineTotal, oldLineTotal, oldPriceLineTotal);
  }

  function buildRefundDisplaySnapshot(refundItem) {
    var snapshot = refundItem && refundItem.item_snapshot && typeof refundItem.item_snapshot === "object"
      ? clonePlainObject(refundItem.item_snapshot)
      : {};
    var refundedQty = Math.max(0, Number(refundItem && refundItem.refunded_qty || 0) || 0);
    var originalQty = getItemQty(snapshot);
    var lineAmount = roundMoney(refundItem && refundItem.line_amount || 0);
    var oldLineTotal = getItemOldLineTotal(snapshot);
    var refundedOldLineTotal = originalQty > 0
      ? roundMoney((oldLineTotal * refundedQty) / originalQty)
      : 0;

    snapshot.qty = refundedQty;
    snapshot.quantity = refundedQty;
    snapshot.line_total = lineAmount;
    snapshot.total = lineAmount;
    snapshot.total_price = lineAmount;
    snapshot.sum = lineAmount;
    snapshot.price = refundedQty > 0 ? roundMoney(lineAmount / refundedQty) : 0;

    if (refundedOldLineTotal > lineAmount) {
      snapshot.old_line_total = refundedOldLineTotal;
      snapshot.old_price = refundedQty > 0 ? roundMoney(refundedOldLineTotal / refundedQty) : 0;
      if (snapshot.discount && typeof snapshot.discount === "object") {
        snapshot.discount = Object.assign({}, snapshot.discount, {
          original_line_total: refundedOldLineTotal
        });
      } else {
        snapshot.discount = { original_line_total: refundedOldLineTotal };
      }
    } else {
      snapshot.old_line_total = 0;
      if (Object.prototype.hasOwnProperty.call(snapshot, "old_price")) delete snapshot.old_price;
      if (snapshot.discount && typeof snapshot.discount === "object") {
        snapshot.discount = Object.assign({}, snapshot.discount);
        delete snapshot.discount.original_line_total;
        if (!Object.keys(snapshot.discount).length) delete snapshot.discount;
      }
    }

    return snapshot;
  }

  function normalizeIconClass(iconValue) {
    var base = String(iconValue || "").trim();
    if (!base) return "";
    if (base.indexOf(" ") !== -1) return base;
    if (base.indexOf("fa-") === 0) return "fas " + base;
    return "fas fa-" + base;
  }

  function isIconUrl(iconValue) {
    var val = String(iconValue || "").trim();
    if (!val) return false;
    return /^https?:\/\//i.test(val) || val.indexOf("/") === 0 || val.indexOf("./") === 0 || val.indexOf("../") === 0;
  }

  function fallbackTimeOptionIcon(codeValue) {
    var code = String(codeValue || "").trim().toLowerCase();
    if (code === "asap" || code === "urgent") return "fas fa-bolt";
    if (code === "at_time") return "fas fa-clock";
    if (code === "on_date") return "fas fa-calendar-day";
    return "";
  }

  function resolveTimeOptionIcon(order) {
    if (!order) return "";
    var storedIcon = String(order.time_option_icon || "").trim();
    if (storedIcon) return storedIcon;
    return fallbackTimeOptionIcon(order.time_option_code);
  }

  function renderOrderTimeIcon(order) {
    var iconValue = resolveTimeOptionIcon(order);
    if (!iconValue) return "";
    var title = String(order && order.time_option_title || "").trim();
    var titleAttr = title ? ' title="' + escapeHtml(title) + '"' : "";
    if (isIconUrl(iconValue)) {
      return '<span class="order-time-icon"' + titleAttr + '><img src="' + escapeHtml(iconValue) + '" alt="" loading="lazy"></span>';
    }
    var iconClass = normalizeIconClass(iconValue);
    if (!iconClass) return "";
    return '<span class="order-time-icon"' + titleAttr + '><i class="' + escapeHtml(iconClass) + '"></i></span>';
  }

  function normalizeApartmentToken(token) {
    var src = String(token || "").trim();
    if (!src) return "";
    var match = src.match(/\b(?:кв(?:артира)?\.?)\s*([\p{L}\d\-\/]+)/iu);
    if (!match || !match[1]) return "";
    return "кв " + match[1];
  }

  function stripApartmentToken(token) {
    var src = String(token || "").trim();
    if (!src) return "";
    return src
      .replace(/\b[\p{L}\d\-\/]+\s*\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?\.?\b/iu, "")
      .replace(/\b\u043a\u0432(?:\u0430\u0440\u0442\u0438\u0440\u0430)?\.?\s*[\p{L}\d\-\/]+\b/iu, "")
      .replace(/\s{2,}/g, " ")
      .replace(/[\s,;]+$/u, "")
      .trim();
  }

  function resolveStandaloneHouseToken(token) {
    var src = String(token || "").trim();
    if (!src) return "";
    var match = src.match(/^(?:\u0434(?:\u043e\u043c)?\.?)\s*([\p{L}\d\-\/]+)$/iu);
    if (match && match[1]) return match[1];
    if (/^\d+[\p{L}\-\/]*$/iu.test(src)) return src;
    return "";
  }

  function normalizeHouseToken(token) {
    var src = String(token || "").trim();
    if (!src) return "";
    var match = src.match(/(?:д(?:ом)?\.?)\s*([\p{L}\d\-\/]+)/iu);
    if (match && match[1]) return match[1];
    if (/^\d+[\p{L}\-\/]*$/iu.test(src)) return src;
    return "";
  }

  function isMetaAddressToken(token) {
    var src = String(token || "").trim().toLowerCase();
    if (!src) return true;
    return /(?:под[ъь]езд|эт(?:аж)?|кв(?:артира)?|офис|коммент|домофон|код)/iu.test(src);
  }

  function looksLikeStreetToken(token) {
    var src = String(token || "").trim();
    if (!src) return false;
    if (isMetaAddressToken(src)) return false;
    var streetRe = /(?:ул\.?|улиц|просп|пр-т|переул|пер\.?|бульвар|бул\.?|наб\.?|шоссе|мкр\.?|микрорайон|пл\.?|площадь|аллея|тракт|дорога|проезд)/iu;
    if (streetRe.test(src)) return true;
    return /\d/.test(src);
  }

  function shortAddressForList(rawAddress) {
    var raw = String(rawAddress || "").trim();
    if (!raw) return "?";
    var tokens = raw.split(",").map(function (value) {
      return String(value || "").trim();
    }).filter(Boolean);
    if (!tokens.length) return raw;
    var cleanedTokens = tokens.map(function (token) {
      return stripApartmentToken(token);
    }).map(function (token) {
      return String(token || "").trim();
    }).filter(Boolean);
    if (!cleanedTokens.length) return raw;
    if (cleanedTokens.length === 1) return cleanedTokens[0];

    var first = cleanedTokens[0];
    var second = cleanedTokens[1];
    if (first && resolveStandaloneHouseToken(second)) return first + ", " + second;
    if (!looksLikeStreetToken(first) && looksLikeStreetToken(second)) return second;

    var streetLike = cleanedTokens.find(function (token) {
      return looksLikeStreetToken(token) && !resolveStandaloneHouseToken(token);
    });
    if (streetLike) return streetLike;
    return first;

    if (!streetPart) {
      var beforeHouse = (houseIdx >= 0 ? streetTokens.slice(0, houseIdx) : streetTokens).filter(function (token) {
        return !isMetaAddressToken(token) && !resolveStandaloneHouseToken(token);
      });
      if (beforeHouse.length) streetPart = beforeHouse[beforeHouse.length - 1] || "";
    }

    if (!streetPart) {
      var fallbackStreetIdx = streetTokens.findIndex(function (token) {
        return !isMetaAddressToken(token) && looksLikeStreetToken(token);
      });
      if (fallbackStreetIdx >= 0) streetPart = streetTokens[fallbackStreetIdx] || "";
    }

    if (streetPart && !/\d/.test(streetPart)) {
      var houseToken = houseIdx >= 0 ? streetTokens[houseIdx] || "" : "";
      var house = resolveStandaloneHouseToken(houseToken);
      if (house) streetPart = (streetPart + " " + house).trim();
    }

    if (!streetPart) streetPart = stripApartmentToken(raw) || raw;
    if (aptPart && !/\b(?:кв(?:артира)?\.?)\s*[\p{L}\d\-\/]+\b/iu.test(streetPart)) {
      return streetPart + ", " + aptPart;
    }
    return streetPart;
  }

  function buildOrderStageCycleButtonHtml(options) {
    var config = options && typeof options === "object" ? options : {};
    var orderId = Number(config.orderId || 0);
    var canCycle = !!config.canCycle;
    var currentTitle = String(config.currentTitle || "").trim() || "Этап";
    var nextTitle = String(config.nextTitle || "").trim() || currentTitle;
    var titleText = String(config.titleText || (canCycle ? (currentTitle + " -> " + nextTitle) : "Финальный статус")).trim() || currentTitle;
    var nextNote = String(config.nextNote || "Сменить").trim() || "Сменить";
    var currentIconHtml = String(config.currentIconHtml || "").trim();
    var nextIconHtml = String(config.nextIconHtml || "").trim();
    var nextStatusId = Number(config.nextStatusId || 0);
    var disabledAttr = canCycle ? "" : " disabled";
    var nextStatusAttr = canCycle && nextStatusId > 0 ? ' data-next-status-id="' + escapeHtml(nextStatusId) + '"' : "";
    return '' +
      '<button class="order-stage-btn' + (canCycle ? '' : ' is-static') + '"' +
        ' type="button"' +
        ' data-action="order-row-status-next"' +
        ' data-order-id="' + escapeHtml(orderId) + '"' +
        nextStatusAttr +
        ' title="' + escapeHtml(titleText) + '"' +
        ' aria-label="' + escapeHtml(titleText) + '"' +
        disabledAttr +
      '>' +
        '<span class="order-stage-btn-icon-shell" aria-hidden="true">' +
          '<span class="order-stage-btn-icon-wrap order-stage-btn-icon-current">' +
            currentIconHtml +
          '</span>' +
          (canCycle ? (
            '<span class="order-stage-btn-icon-wrap order-stage-btn-icon-next">' +
              nextIconHtml +
            '</span>'
          ) : '') +
        '</span>' +
        '<span class="order-stage-btn-content">' +
          '<span class="order-stage-btn-panel order-stage-btn-panel-current">' +
            '<span class="order-stage-btn-current">' + escapeHtml(currentTitle) + '</span>' +
          '</span>' +
          (canCycle ? (
            '<span class="order-stage-btn-panel order-stage-btn-panel-next" aria-hidden="true">' +
              '<span class="order-stage-btn-next">' + escapeHtml(nextTitle) + '</span>' +
              '<span class="order-stage-btn-meta">' + escapeHtml(nextNote) + '</span>' +
            '</span>'
          ) : '') +
        '</span>' +
      '</button>';
  }

  function buildOrderPaymentButtonHtml(options) {
    var config = options && typeof options === "object" ? options : {};
    var paymentTypeClass = String(config.paymentTypeClass || "").trim();
    var paymentStateClass = String(config.paymentStateClass || "").trim();
    var paymentTitle = String(config.paymentTitle || "").trim();
    var paymentTitleAttr = paymentTitle ? ' title="' + escapeHtml(paymentTitle) + '"' : "";
    var paymentIconHtml = String(config.paymentIconHtml || "").trim();
    var totalText = String(config.totalText || "0 ₽").trim() || "0 ₽";
    var statusText = String(config.statusText || "").trim();
    return '' +
      '<button class="' + escapeHtml(["order-payment-btn", paymentTypeClass, paymentStateClass].filter(Boolean).join(" ")) + '"' +
        ' type="button"' + paymentTitleAttr +
      '>' +
        '<span class="order-payment-btn-icon">' + paymentIconHtml + '</span>' +
        '<span class="order-payment-btn-content">' +
          '<span class="order-payment-btn-total">' + escapeHtml(totalText) + '</span>' +
          '<span class="order-payment-btn-status">' + escapeHtml(statusText) + '</span>' +
        '</span>' +
      '</button>';
  }

  function buildOrderClientPhoneHtml(options) {
    var config = options && typeof options === "object" ? options : {};
    var phoneText = String(config.phoneText || "?").trim() || "?";
    var canLink = !!config.canLink;
    var linkAttrsHtml = String(config.linkAttrsHtml || "").trim();
    if (canLink && linkAttrsHtml) {
      return '' +
        '<button type="button" class="order-client-phone muted order-client-phone-link"' + linkAttrsHtml + '>' +
          '<i class="fas fa-phone"></i>' +
          '<span class="order-client-phone-text">' + escapeHtml(phoneText) + '</span>' +
        '</button>';
    }
    return '' +
      '<div class="order-client-phone muted">' +
        '<i class="fas fa-phone"></i>' +
        '<span class="order-client-phone-text">' + escapeHtml(phoneText) + '</span>' +
      '</div>';
  }

  function buildOrderListRowInnerHtml(options) {
    var config = options && typeof options === "object" ? options : {};
    var orderId = Number(config.orderId || 0);
    var orderNumberText = String(config.orderNumberText || orderId || "—").trim() || "—";
    var createdAtText = String(config.createdAtText || "").trim();
    var showMultiSelect = !!config.showMultiSelect;
    var multiSelected = !!config.multiSelected;
    var customerName = String(config.customerName || "?").trim() || "?";
    var customerPhoneHtml = String(config.customerPhoneHtml || "").trim();
    var timeIconHtml = String(config.timeIconHtml || "").trim();
    var addressText = String(config.addressText || "?").trim() || "?";
    var addressCommentText = String(config.addressCommentText || "Нет комментария").trim() || "Нет комментария";
    var stageHtml = String(config.stageHtml || "").trim();
    var paymentHtml = String(config.paymentHtml || "").trim();
    var orderIdHitTag = showMultiSelect ? "label" : "div";
    var orderIdHitAttrs = showMultiSelect
      ? ' data-action="order-multi-select" data-order-id="' + escapeHtml(orderId) + '" title="Выбрать заказ"'
      : ' class="order-id-select-hit order-id-select-hit--readonly"';
    var orderIdHitClass = showMultiSelect ? ' class="order-id-select-hit"' : '';
    var checkboxHtml = showMultiSelect
      ? '<input type="checkbox" class="order-id-select-checkbox" data-role="order-multi-checkbox" aria-label="Выбрать заказ №' + escapeHtml(orderId) + '" tabindex="-1"' + (multiSelected ? " checked" : "") + ' />'
      : "";
    return '' +
      '<div class="order-col order-id">' +
        '<' + orderIdHitTag + (showMultiSelect ? orderIdHitClass + orderIdHitAttrs : orderIdHitAttrs) + '>' +
          checkboxHtml +
          '<div class="order-id-num">' + escapeHtml(orderNumberText) + '</div>' +
          '<div class="order-id-time">' + escapeHtml(createdAtText) + '</div>' +
        '</' + orderIdHitTag + '>' +
      '</div>' +
      '<div class="order-col order-indicators">' + timeIconHtml + '</div>' +
      '<div class="order-col order-client">' +
        '<div class="order-client-name"><i class="fas fa-user"></i><span class="order-client-name-text">' + escapeHtml(customerName) + '</span></div>' +
        customerPhoneHtml +
      '</div>' +
      '<div class="order-col order-address">' +
        '<div class="order-address-line"><i class="fas fa-map-marker-alt"></i> ' + escapeHtml(addressText) + '</div>' +
        '<div class="order-address-comment muted"><i class="far fa-comment"></i> ' + escapeHtml(addressCommentText) + '</div>' +
      '</div>' +
      '<div class="order-col order-stage">' + stageHtml + '</div>' +
      '<div class="order-col order-total">' + paymentHtml + '</div>';
  }

  function getRefundState(order) {
    return String(order && order.refund_state || "").trim().toLowerCase();
  }

  function getRefundStateTitle(order) {
    var explicitTitle = String(order && order.refund_state_title || "").trim();
    if (explicitTitle) return explicitTitle;
    var state = getRefundState(order);
    if (state === "full") return "Возвращено";
    if (state === "partial") return "Частичный возврат";
    return "";
  }

  function getRefundItemTitle(item) {
    return String(
      item && (
        item.title
        || item.name
        || item.product_name
        || item.combo_title
      ) || "Позиция"
    ).trim() || "Позиция";
  }

  function renderRefundHistoryHtml(order, money, formatDateTimeNumeric) {
    var refunds = Array.isArray(order && order.refunds) ? order.refunds : [];
    if (!refunds.length) return "";
    return refunds.map(function (refund) {
      var items = Array.isArray(refund && refund.items) ? refund.items : [];
      var itemsHtml = items.map(function (item) {
        var snapshot = item && item.item_snapshot && typeof item.item_snapshot === "object"
          ? item.item_snapshot
          : {};
        return (
          '<div class="order-refund-history-item-row">' +
            '<span>' + escapeHtml(getRefundItemTitle(snapshot)) + " × " + escapeHtml(String(Number(item && item.refunded_qty || 0) || 0)) + '</span>' +
            '<strong>' + escapeHtml(money(item && item.line_amount || 0)) + '</strong>' +
          '</div>'
        );
      }).join("");
      var deliveryAmount = Number(refund && refund.delivery_amount || 0) || 0;
      var comment = String(refund && refund.comment || "").trim();
      var actor = String(refund && refund.created_by_name || "").trim();
      var paymentTitle = String(refund && (refund.payment_title || refund.payment_code) || "").trim() || "Возврат";
      return (
        '<div class="order-refund-history-item">' +
          '<div class="order-refund-history-item-top">' +
            '<strong>' + escapeHtml(Number(refund && refund.is_full || 0) === 1 ? "Полный возврат" : "Частичный возврат") + '</strong>' +
            '<span>' + escapeHtml(formatDateTimeNumeric(refund && refund.created_at) || "—") + '</span>' +
          '</div>' +
          '<div class="order-refund-history-item-meta">' +
            escapeHtml([paymentTitle, money(refund && refund.total_amount || 0), actor].filter(Boolean).join(" · ")) +
          '</div>' +
          '<div class="order-refund-history-item-lines">' +
            itemsHtml +
            (deliveryAmount > 0
              ? '<div class="order-refund-history-item-row is-delivery"><span>Доставка</span><strong>' + escapeHtml(money(deliveryAmount)) + '</strong></div>'
              : '') +
          '</div>' +
          (comment
            ? '<div class="order-refund-history-item-note">' + escapeHtml(comment) + '</div>'
            : '') +
        '</div>'
      );
    }).join("");
  }

  function renderRefundHistoryHtml(order, money, formatDateTimeNumeric, itemsToHtml) {
    var refunds = Array.isArray(order && order.refunds) ? order.refunds : [];
    if (!refunds.length) return "";
    return refunds.map(function (refund) {
      var items = Array.isArray(refund && refund.items) ? refund.items : [];
      var displayItems = items.map(buildRefundDisplaySnapshot);
      var itemsHtml = "";

      if (displayItems.length && typeof itemsToHtml === "function") {
        itemsHtml = itemsToHtml(displayItems);
      } else {
        itemsHtml = items.map(function (item) {
          var snapshot = item && item.item_snapshot && typeof item.item_snapshot === "object"
            ? item.item_snapshot
            : {};
          return (
            '<div class="order-refund-history-item-row">' +
              '<span>' + escapeHtml(getRefundItemTitle(snapshot)) + " x " + escapeHtml(String(Number(item && item.refunded_qty || 0) || 0)) + '</span>' +
              '<strong>' + escapeHtml(money(item && item.line_amount || 0)) + '</strong>' +
            '</div>'
          );
        }).join("");
      }

      var deliveryAmount = Number(refund && refund.delivery_amount || 0) || 0;
      var comment = String(refund && refund.comment || "").trim();
      var actor = String(refund && refund.created_by_name || "").trim();
      var paymentTitle = String(refund && (refund.payment_title || refund.payment_code) || "").trim() || "\u0412\u043e\u0437\u0432\u0440\u0430\u0442";
      return (
        '<div class="order-refund-history-item">' +
          '<div class="order-refund-history-item-top">' +
            '<strong>' + escapeHtml(Number(refund && refund.is_full || 0) === 1 ? "\u041f\u043e\u043b\u043d\u044b\u0439 \u0432\u043e\u0437\u0432\u0440\u0430\u0442" : "\u0427\u0430\u0441\u0442\u0438\u0447\u043d\u044b\u0439 \u0432\u043e\u0437\u0432\u0440\u0430\u0442") + '</strong>' +
            '<span>' + escapeHtml(formatDateTimeNumeric(refund && refund.created_at) || "\u2014") + '</span>' +
          '</div>' +
          '<div class="order-refund-history-item-meta">' +
            escapeHtml([paymentTitle, money(refund && refund.total_amount || 0), actor].filter(Boolean).join(" · ")) +
          '</div>' +
          '<div class="order-refund-history-item-lines">' +
            itemsHtml +
            (deliveryAmount > 0
              ? '<div class="order-refund-history-item-row is-delivery"><span>\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</span><strong>' + escapeHtml(money(deliveryAmount)) + '</strong></div>'
              : '') +
          '</div>' +
          (comment
            ? '<div class="order-refund-history-item-note">' + escapeHtml(comment) + '</div>'
            : '') +
        '</div>'
      );
    }).join("");
  }

  function setTextAll(list, value) {
    toArray(list).forEach(function (el) {
      el.textContent = value;
    });
  }

  function setHtmlAll(list, value) {
    toArray(list).forEach(function (el) {
      el.innerHTML = value;
    });
  }

  function setHiddenAll(list, hidden) {
    toArray(list).forEach(function (el) {
      el.classList.toggle("hidden", !!hidden);
    });
  }

  function setAttrAll(list, name, value) {
    toArray(list).forEach(function (el) {
      if (value === null || value === undefined) {
        el.removeAttribute(name);
      } else {
        el.setAttribute(name, value);
      }
    });
  }

  function bindTabsWheelScroll(tabsEls) {
    toArray(tabsEls).forEach(function (tabsEl) {
      if (!tabsEl || tabsEl.dataset.wheelBound === "1") return;
      tabsEl.addEventListener("wheel", function (event) {
        var maxScrollLeft = Math.max(0, tabsEl.scrollWidth - tabsEl.clientWidth);
        if (maxScrollLeft <= 0) return;

        var deltaX = Number(event.deltaX || 0);
        var deltaY = Number(event.deltaY || 0);
        var primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
        if (!primaryDelta) return;

        var current = tabsEl.scrollLeft || 0;
        var next = Math.max(0, Math.min(maxScrollLeft, current + primaryDelta));
        if (Math.abs(next - current) < 0.5) return;

        event.preventDefault();
        tabsEl.scrollLeft = next;
      }, { passive: false });
      tabsEl.dataset.wheelBound = "1";
    });
  }

  function renderTabs(options) {
    var headers = toArray(options && options.headers);
    var tabsEls = toArray(options && options.tabsEls);
    var tabs = Array.isArray(options && options.tabs) ? options.tabs : [];
    var activeKey = options && options.activeKey != null ? String(options.activeKey) : null;
    var fallbackTitle = typeof (options && options.getFallbackTitle) === "function"
      ? options.getFallbackTitle
      : function (tab) {
          return tab && tab.type === "client" ? "Клиент" : "Заказ";
        };

    var hasTabs = tabs.length > 0;
    headers.forEach(function (header) {
      header.classList.toggle("hidden", !hasTabs);
    });

    if (!hasTabs) {
      tabsEls.forEach(function (tabsEl) {
        tabsEl.innerHTML = "";
      });
      return;
    }

    var html = tabs.map(function (tab) {
      var key = String(tab && tab.key || "");
      var title = String(tab && tab.title || "").trim() || fallbackTitle(tab);
      var isActive = key === activeKey;
      return (
        '<div class="product-tab ' + (isActive ? "is-active" : "") + '" data-order-tab-key="' + escapeHtml(key) + '">' +
          '<span class="product-tab-title">' + escapeHtml(title) + "</span>" +
          '<button class="product-tab-close" type="button" data-order-tab-close="' + escapeHtml(key) + '" aria-label="Закрыть">&times;</button>' +
        "</div>"
      );
    }).join("");

    tabsEls.forEach(function (tabsEl) {
      tabsEl.innerHTML = html;
    });
  }

  function createInfoRenderer(options) {
    var root = options && options.root ? options.root : document;
    var footerEl = options && options.footerEl ? options.footerEl : null;
    var clientInfoWrap = options && options.clientInfoWrap ? options.clientInfoWrap : null;
    var helpers = options && options.helpers ? options.helpers : {};
    var printButtons = footerEl ? queryAll(footerEl, '[data-action="order-print"]') : [];
    var infoEls = {
      empty: queryAll(root, '[data-info="empty"]'),
      content: queryAll(root, '[data-info="content"]'),
      title: queryAll(root, '[data-info="order-title"]'),
      meta: queryAll(root, '[data-info="order-meta"]'),
      status: queryAll(root, '[data-info="order-status"]'),
      clientName: queryAll(root, '[data-info="client-name"]'),
      clientPhone: queryAll(root, '[data-info="client-phone"]'),
      payMethod: queryAll(root, '[data-info="payment-method"]'),
      payIcon: queryAll(root, '[data-info="payment-icon"]'),
      changeFrom: queryAll(root, '[data-info="change-from"]'),
      changeAmount: queryAll(root, '[data-info="change-amount"]'),
      changeFromRow: queryAll(root, '[data-info="change-from-row"]'),
      changeAmountRow: queryAll(root, '[data-info="change-amount-row"]'),
      subtotalRow: queryAll(root, '[data-info="subtotal-row"]'),
      subtotal: queryAll(root, '[data-info="subtotal"]'),
      discountRow: queryAll(root, '[data-info="discount-row"]'),
      discountAmount: queryAll(root, '[data-info="discount-amount"]'),
      discountInfoBtn: queryAll(root, '[data-info="discount-info-btn"]'),
      discountBreakdown: queryAll(root, '[data-info="discount-breakdown"]'),
      deliveryRow: queryAll(root, '[data-info="delivery-row"]'),
      deliveryCost: queryAll(root, '[data-info="delivery-cost"]'),
      total: queryAll(root, '[data-info="order-total"]'),
      deliveryType: queryAll(root, '[data-info="delivery-type"]'),
      deliveryDatetime: queryAll(root, '[data-info="delivery-datetime"]'),
      deliveryQty: queryAll(root, '[data-info="delivery-qty"]'),
      deliveryUrgent: queryAll(root, '[data-info="delivery-urgent"]'),
      deliveryIntervalRow: queryAll(root, '[data-info="delivery-interval-row"]'),
      deliveryInterval: queryAll(root, '[data-info="delivery-interval"]'),
      deliveryAddressTitle: queryAll(root, '[data-info="delivery-address-title"]'),
      deliveryAddress: queryAll(root, '[data-info="delivery-address"]'),
      deliveryAddressComment: queryAll(root, '[data-info="delivery-address-comment"]'),
      deliveryAddressCommentText: queryAll(root, '[data-info="delivery-address-comment-text"]'),
      orderCommentBlock: queryAll(root, '[data-info="order-comment-block"]'),
      orderCommentText: queryAll(root, '[data-info="order-comment-text"]'),
      itemsList: queryAll(root, '[data-info="items-list"]'),
      refundBadge: queryAll(root, '[data-info="refund-badge"]'),
      refundStateRow: queryAll(root, '[data-info="refund-state-row"]'),
      refundState: queryAll(root, '[data-info="refund-state"]'),
      refundedTotalRow: queryAll(root, '[data-info="refunded-total-row"]'),
      refundedTotal: queryAll(root, '[data-info="refunded-total"]'),
      refundableTotalRow: queryAll(root, '[data-info="refundable-total-row"]'),
      refundableTotal: queryAll(root, '[data-info="refundable-total"]'),
      refundHistoryBlock: queryAll(root, '[data-info="refund-history-block"]'),
      refundHistory: queryAll(root, '[data-info="refund-history"]')
    };

    function setPrintDisabled(disabled) {
      toArray(printButtons).forEach(function (btn) {
        btn.disabled = !!disabled;
      });
    }

    function bindDiscountToggles() {
      toArray(infoEls.discountInfoBtn).forEach(function (btn) {
        if (!btn || btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";
        btn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          var summaryCard = btn.closest(".order-summary");
          if (!summaryCard) return;
          var breakdown = summaryCard.querySelector('[data-info="discount-breakdown"]');
          if (!breakdown) return;
          var willOpen = breakdown.classList.contains("hidden");
          breakdown.classList.toggle("hidden", !willOpen);
          breakdown.classList.toggle("is-open", willOpen);
          btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
          breakdown.setAttribute("aria-hidden", willOpen ? "false" : "true");
        });
      });
    }

    function showEmpty() {
      setHiddenAll(infoEls.empty, false);
      setHiddenAll(infoEls.content, true);
      if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
      if (footerEl) footerEl.classList.add("hidden");
      setPrintDisabled(true);
    }

    function showOrder() {
      setHiddenAll(infoEls.empty, true);
      setHiddenAll(infoEls.content, false);
      if (clientInfoWrap) clientInfoWrap.classList.add("hidden");
      if (footerEl) footerEl.classList.remove("hidden");
    }

    function renderPaymentIconHtml(order) {
      if (typeof helpers.renderOrderPaymentIcon === "function") {
        return helpers.renderOrderPaymentIcon(order);
      }
      var iconClass = typeof helpers.paymentIcon === "function"
        ? helpers.paymentIcon(order && order.payment_code)
        : "fa-credit-card";
      return '<i class="fas ' + escapeHtml(iconClass || "fa-credit-card") + '"></i>';
    }

    function setOrder(order) {
      bindDiscountToggles();

      if (!order) {
        showEmpty();
        setTextAll(infoEls.title, "Заказ не выбран");
        setTextAll(infoEls.meta, "Выберите заказ слева.");
        setHiddenAll(infoEls.meta, true);
        setTextAll(infoEls.status, "—");
        setTextAll(infoEls.clientName, "—");
        setTextAll(infoEls.clientPhone, "—");
        setAttrAll(infoEls.clientPhone, "href", null);
        setAttrAll(infoEls.clientPhone, "data-action", null);
        setAttrAll(infoEls.clientPhone, "data-client-id", null);
        setAttrAll(infoEls.clientPhone, "data-client-phone", null);
        setAttrAll(infoEls.clientPhone, "data-client-name", null);
        setTextAll(infoEls.payMethod, "—");
        infoEls.payIcon.forEach(function (el) {
          el.innerHTML = '<i class="fas fa-credit-card"></i>';
        });
        setTextAll(infoEls.changeFrom, "—");
        setTextAll(infoEls.changeAmount, "—");
        setTextAll(infoEls.subtotal, "—");
        setTextAll(infoEls.discountAmount, "—");
        setTextAll(infoEls.deliveryCost, "—");
        setTextAll(infoEls.total, "—");
        setTextAll(infoEls.deliveryType, "—");
        setTextAll(infoEls.deliveryDatetime, "—");
        setTextAll(infoEls.deliveryQty, "0 шт.");
        setTextAll(infoEls.deliveryInterval, "—");
        setTextAll(infoEls.deliveryAddressTitle, "Адрес доставки");
        setTextAll(infoEls.deliveryAddress, "—");
        setTextAll(infoEls.deliveryAddressCommentText, "");
        setTextAll(infoEls.orderCommentText, "");
        setTextAll(infoEls.refundBadge, "");
        setTextAll(infoEls.refundState, "вЂ”");
        setTextAll(infoEls.refundedTotal, "вЂ”");
        setTextAll(infoEls.refundableTotal, "вЂ”");
        setHtmlAll(infoEls.refundHistory, "");
        setHtmlAll(infoEls.itemsList, '<div class="muted">—</div>');
        setHiddenAll(infoEls.changeFromRow, true);
        setHiddenAll(infoEls.changeAmountRow, true);
        setHiddenAll(infoEls.subtotalRow, true);
        setHiddenAll(infoEls.discountRow, true);
        setHiddenAll(infoEls.deliveryRow, true);
        setHiddenAll(infoEls.refundBadge, true);
        setHiddenAll(infoEls.refundStateRow, true);
        setHiddenAll(infoEls.refundedTotalRow, true);
        setHiddenAll(infoEls.refundableTotalRow, true);
        setHiddenAll(infoEls.refundHistoryBlock, true);
        setHiddenAll(infoEls.deliveryUrgent, true);
        setHiddenAll(infoEls.deliveryIntervalRow, true);
        setHiddenAll(infoEls.deliveryAddressComment, true);
        setHiddenAll(infoEls.orderCommentBlock, true);
        setHiddenAll(infoEls.discountInfoBtn, true);
        setHtmlAll(infoEls.discountBreakdown, "");
        setHiddenAll(infoEls.discountBreakdown, true);
        setAttrAll(infoEls.discountInfoBtn, "aria-expanded", "false");
        setAttrAll(infoEls.discountBreakdown, "aria-hidden", "true");
        if (typeof options.renderInlineStatusMenus === "function") {
          options.renderInlineStatusMenus(null, infoEls);
        }
        setPrintDisabled(true);
        return;
      }

      showOrder();

      var money = typeof helpers.money === "function"
        ? helpers.money
        : function (value) { return String(value == null ? 0 : value); };
      var formatDateTimeNumeric = typeof helpers.formatDateTimeNumeric === "function"
        ? helpers.formatDateTimeNumeric
        : function () { return ""; };
      var formatDateTime = typeof helpers.formatDateTime === "function"
        ? helpers.formatDateTime
        : function () { return ""; };
      var formatScheduleText = typeof helpers.formatScheduleText === "function"
        ? helpers.formatScheduleText
        : function () { return ""; };
      var totalQty = typeof helpers.totalQty === "function"
        ? helpers.totalQty
        : function () { return 0; };
      var buildOrderDiscountSummary = typeof helpers.buildOrderDiscountSummary === "function"
        ? helpers.buildOrderDiscountSummary
        : function () { return { subtotalBeforeDiscount: 0, totalDiscount: 0, breakdown: [], orderDiscountTitles: [] }; };
      var renderOrderDiscountBreakdownHtml = typeof helpers.renderOrderDiscountBreakdownHtml === "function"
        ? helpers.renderOrderDiscountBreakdownHtml
        : function () { return ""; };
      var displayOrder = typeof helpers.getDisplayOrder === "function"
        ? (helpers.getDisplayOrder(order) || order)
        : order;

      setTextAll(infoEls.title, "ЗАКАЗ #" + String(order.id || "—"));
      setTextAll(infoEls.meta, formatDateTimeNumeric(order.created_at) || "—");
      setHiddenAll(infoEls.meta, false);
      setTextAll(infoEls.status, order.status_title || "—");
      if (typeof options.renderInlineStatusMenus === "function") {
        options.renderInlineStatusMenus(order, infoEls);
      }

      var clientName = order.customer_name || "—";
      var clientPhone = order.customer_phone || "—";
      setTextAll(infoEls.clientName, clientName);
      setTextAll(infoEls.clientPhone, clientPhone);

      var clientId = Number(order.customer_id || 0);
      var clientPhoneValue = String(order.customer_phone || "").trim();
      var canOpenClientTab = Boolean(options.enableClientLink) && (clientId > 0 || !!clientPhoneValue);
      setAttrAll(infoEls.clientPhone, "href", canOpenClientTab ? "#" : null);
      setAttrAll(infoEls.clientPhone, "data-action", canOpenClientTab ? "open-client" : null);
      setAttrAll(infoEls.clientPhone, "data-client-id", canOpenClientTab && clientId > 0 ? String(clientId) : null);
      setAttrAll(infoEls.clientPhone, "data-client-phone", canOpenClientTab ? clientPhoneValue : null);
      setAttrAll(infoEls.clientPhone, "data-client-name", canOpenClientTab ? String(clientName || "").trim() : null);

      setTextAll(infoEls.payMethod, order.payment_title || "—");
      infoEls.payIcon.forEach(function (el) {
        el.innerHTML = renderPaymentIconHtml(order);
      });

      var isDelivery = order.method_code === "delivery";
      var deliveryCost = Number(displayOrder && displayOrder.delivery_cost || 0);
      setTextAll(infoEls.deliveryCost, money(deliveryCost));
      setHiddenAll(infoEls.deliveryRow, !isDelivery);
      setTextAll(infoEls.total, money(displayOrder && displayOrder.total_price || 0));

      var changeFrom = Number(order.change_from || 0) || 0;
      var totalPrice = Number(displayOrder && displayOrder.total_price || 0) || 0;
      var hasChange = changeFrom > totalPrice;
      var changeAmount = hasChange ? changeFrom - totalPrice : 0;
      setTextAll(infoEls.changeFrom, money(changeFrom || 0));
      setTextAll(infoEls.changeAmount, money(changeAmount));
      setHiddenAll(infoEls.changeFromRow, !changeFrom);
      setHiddenAll(infoEls.changeAmountRow, !hasChange);

      var discountSummary = buildOrderDiscountSummary(displayOrder);
      var discountAmount = Number(discountSummary.totalDiscount || 0);
      var hasDiscount = discountAmount > 0;
      setTextAll(infoEls.subtotal, money(discountSummary.subtotalBeforeDiscount || 0));
      setTextAll(infoEls.discountAmount, "-" + money(discountAmount));
      setHiddenAll(infoEls.subtotalRow, !hasDiscount);
      setHiddenAll(infoEls.discountRow, !hasDiscount);

      var hasBreakdown = hasDiscount && (
        (Array.isArray(discountSummary.breakdown) && discountSummary.breakdown.length > 0) ||
        (Array.isArray(discountSummary.orderDiscountTitles) && discountSummary.orderDiscountTitles.length > 0)
      );
      setHiddenAll(infoEls.discountInfoBtn, !hasBreakdown);
      setHtmlAll(infoEls.discountBreakdown, hasBreakdown ? renderOrderDiscountBreakdownHtml(discountSummary) : "");
      toArray(infoEls.discountBreakdown).forEach(function (el) {
        el.classList.remove("is-open");
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
      });
      setAttrAll(infoEls.discountInfoBtn, "aria-expanded", "false");

      setTextAll(infoEls.deliveryQty, String(totalQty(displayOrder && displayOrder.items || [])) + " шт.");
      setTextAll(infoEls.deliveryType, order.method_title || (order.method_code === "pickup" ? "Самовывоз" : "Доставка") || "—");
      setTextAll(infoEls.deliveryDatetime, formatDateTime(order.created_at) || "—");
      setTextAll(infoEls.deliveryAddressTitle, order.method_code === "pickup" ? "Адрес самовывоза" : "Адрес доставки");

      var intervalText = formatScheduleText(order, { includeTitle: false }) || String(order.time_option_title || "").trim();
      setTextAll(infoEls.deliveryInterval, intervalText || "—");
      setHiddenAll(infoEls.deliveryIntervalRow, !intervalText);

      var urgent = Boolean(order.is_urgent || order.urgent || order.time_option_code === "urgent");
      setHiddenAll(infoEls.deliveryUrgent, !urgent);

      var address = order.address;
      if (!address && order.pickup_store_address) {
        address = order.pickup_store_name
          ? order.pickup_store_name + ", " + order.pickup_store_address
          : order.pickup_store_address;
      }
      setTextAll(infoEls.deliveryAddress, address || "—");

      var addressComment = order.address_comment || "";
      setTextAll(infoEls.deliveryAddressCommentText, addressComment);
      setHiddenAll(infoEls.deliveryAddressComment, !addressComment);

      var orderComment = order.comment || "";
      setTextAll(infoEls.orderCommentText, orderComment);
      setHiddenAll(infoEls.orderCommentBlock, !orderComment);

      var refundState = getRefundState(order);
      var refundStateTitle = getRefundStateTitle(order);
      var refundedTotal = Number(order && order.refunded_total || 0) || 0;
      var refundableTotal = Number(order && order.refundable_total || 0) || 0;
      var isPaid = Number(order && order.is_paid || 0) === 1;
      var hasRefunds = refundedTotal > 0 || Number(order && order.refunds_count || 0) > 0;
      var displayItems = Array.isArray(displayOrder && displayOrder.items) ? displayOrder.items : [];
      setTextAll(infoEls.refundBadge, refundStateTitle || "");
      setTextAll(infoEls.refundState, refundStateTitle || "—");
      setTextAll(infoEls.refundedTotal, refundedTotal > 0 ? ("-" + money(refundedTotal)) : "—");
      setTextAll(infoEls.refundableTotal, isPaid ? money(refundableTotal) : "—");
      setHtmlAll(infoEls.refundHistory, renderRefundHistoryHtml(order, money, formatDateTimeNumeric, helpers.itemsToHtml));
      setHiddenAll(infoEls.refundBadge, !refundStateTitle);
      setHiddenAll(infoEls.refundStateRow, !hasRefunds);
      setHiddenAll(infoEls.refundedTotalRow, !(refundedTotal > 0));
      setHiddenAll(infoEls.refundableTotalRow, !isPaid);
      setHiddenAll(infoEls.refundHistoryBlock, !hasRefunds);
      if (hasRefunds) {
        setHiddenAll(infoEls.changeFromRow, true);
        setHiddenAll(infoEls.changeAmountRow, true);
      }
      toArray(infoEls.refundBadge).forEach(function (el) {
        el.classList.toggle("is-partial", refundState === "partial");
        el.classList.toggle("is-full", refundState === "full");
      });

      if (typeof helpers.itemsToHtml === "function") {
        setHtmlAll(
          infoEls.itemsList,
          displayItems.length
            ? helpers.itemsToHtml(displayItems)
            : (hasRefunds
              ? '<div class="muted">\u0412\u0441\u0435 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0435\u043d\u044b.</div>'
              : '<div class="muted">-</div>')
        );
      }
      setPrintDisabled(!displayItems.length);

      if (typeof options.afterRender === "function") {
        options.afterRender(order, infoEls, displayOrder);
      }
    }

    return {
      infoEls: infoEls,
      showEmpty: showEmpty,
      showOrder: showOrder,
      setOrder: setOrder
    };
  }

  window.SharedOrderPanel = {
    bindTabsWheelScroll: bindTabsWheelScroll,
    buildOrderClientPhoneHtml: buildOrderClientPhoneHtml,
    buildOrderListRowInnerHtml: buildOrderListRowInnerHtml,
    buildOrderPaymentButtonHtml: buildOrderPaymentButtonHtml,
    buildOrderStageCycleButtonHtml: buildOrderStageCycleButtonHtml,
    renderTabs: renderTabs,
    renderOrderTimeIcon: renderOrderTimeIcon,
    shortAddressForList: shortAddressForList,
    createInfoRenderer: createInfoRenderer
  };
})();
