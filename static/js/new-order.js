(function () {
  const categoriesListEl = document.getElementById("newOrderCategoriesList");
  const categoriesEmptyEl = document.getElementById("newOrderCategoriesEmpty");
  const productsGridEl = document.getElementById("newOrderProductsGrid");
  const productsEmptyEl = document.getElementById("newOrderProductsEmpty");
  const settingsBtnEl = document.getElementById("newOrderSettingsBtn");
  const cancelEditBtnEl = document.getElementById("newOrderCancelEditBtn");
  const checkoutEditorEl = document.getElementById("newOrderCheckoutEditor");
  const checkoutContentEl = document.getElementById("newOrderCheckoutContent");
  const checkoutAddCategoryBtnEl = document.getElementById("newOrderCheckoutAddCategoryBtn");
  const checkoutBlockChipsEl = document.getElementById("newOrderCheckoutBlockChips");
  const newOrderToolbarEl = document.getElementById("newOrderToolbar");
  const rightTabsHeaderEl = document.getElementById("newOrderTabsHeader");
  const rightTabsEl = document.getElementById("newOrderTabs");
  const rightContentEl = document.getElementById("newOrderRightContent");
  const rightEmptyEl = document.getElementById("newOrderRightEmpty");
  const rightPanelEl = document.getElementById("newOrderRightPanel");
  const rightFooterEl = document.getElementById("newOrderRightFooter");
  if (!categoriesListEl || !productsGridEl) return;

  function ensureShopCssForNewOrder() {
    const id = "newOrderShopCss";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "/static/css/shop.css";
    document.head.appendChild(link);
  }
  ensureShopCssForNewOrder();
  const sharedOrderPayment = window.SharedOrderPayment || null;
  const UTF8_MOJIBAKE_ATTRS = ["title", "aria-label", "placeholder"];
  const UTF8_MOJIBAKE_DECODER = typeof TextDecoder === "function"
    ? new TextDecoder("utf-8", { fatal: true })
    : null;
  const UTF8_MOJIBAKE_CP1251_EXTRA = new Map([
    [0x0402, 0x80], [0x0403, 0x81], [0x201A, 0x82], [0x0453, 0x83], [0x201E, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
    [0x20AC, 0x88], [0x2030, 0x89], [0x0409, 0x8A], [0x2039, 0x8B], [0x040A, 0x8C], [0x040C, 0x8D], [0x040B, 0x8E], [0x040F, 0x8F],
    [0x0452, 0x90], [0x2018, 0x91], [0x2019, 0x92], [0x201C, 0x93], [0x201D, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x2122, 0x99], [0x0459, 0x9A], [0x203A, 0x9B], [0x045A, 0x9C], [0x045C, 0x9D], [0x045B, 0x9E], [0x045F, 0x9F],
    [0x00A0, 0xA0], [0x040E, 0xA1], [0x045E, 0xA2], [0x0408, 0xA3], [0x00A4, 0xA4], [0x0490, 0xA5], [0x00A6, 0xA6], [0x00A7, 0xA7],
    [0x0401, 0xA8], [0x00A9, 0xA9], [0x0404, 0xAA], [0x00AB, 0xAB], [0x00AC, 0xAC], [0x00AD, 0xAD], [0x00AE, 0xAE], [0x0407, 0xAF],
    [0x00B0, 0xB0], [0x00B1, 0xB1], [0x0406, 0xB2], [0x0456, 0xB3], [0x0491, 0xB4], [0x00B5, 0xB5], [0x00B6, 0xB6], [0x00B7, 0xB7],
    [0x0451, 0xB8], [0x2116, 0xB9], [0x0454, 0xBA], [0x00BB, 0xBB], [0x0458, 0xBC], [0x0405, 0xBD], [0x0455, 0xBE], [0x0457, 0xBF],
  ]);
  let utf8MojibakeObserver = null;
  let utf8MojibakeRepairInProgress = false;

  function getUtf8MojibakeScore(value) {
    const source = String(value || "");
    const matches = source.match(/(?:\u0420[\u0400-\u04FF\u0080-\u009F]|\u0421[\u0400-\u04FF]|\u0432[\u0400-\u04FF\u2018-\u2026\u20AC\u2116\u00B9-\u00BE]|\u0413[\u0400-\u04FF\u2013-\u2014\u00D7]|\u00D0.|\u00D1.)/gu);
    return matches ? matches.length : 0;
  }

  function toCp1251Byte(codePoint) {
    if (!Number.isFinite(codePoint)) return null;
    if (codePoint <= 0x7F) return codePoint;
    if (codePoint >= 0x0080 && codePoint <= 0x009F) return codePoint;
    if (codePoint >= 0x0410 && codePoint <= 0x044F) return codePoint - 0x350;
    if (codePoint >= 0x00A0 && codePoint <= 0x00BF) return codePoint;
    return UTF8_MOJIBAKE_CP1251_EXTRA.get(codePoint) ?? null;
  }

  function encodeCp1251(value) {
    const source = String(value || "");
    if (!source) return new Uint8Array(0);
    const bytes = [];
    for (const ch of source) {
      const byte = toCp1251Byte(ch.codePointAt(0));
      if (byte == null) return null;
      bytes.push(byte);
    }
    return Uint8Array.from(bytes);
  }

  function repairUtf8Mojibake(value) {
    const source = String(value || "");
    const sourceScore = getUtf8MojibakeScore(source);
    if (!source || !sourceScore || !UTF8_MOJIBAKE_DECODER) return source;
    const bytes = encodeCp1251(source);
    if (!bytes) return source;
    try {
      const decoded = UTF8_MOJIBAKE_DECODER.decode(bytes);
      if (!decoded || decoded === source) return source;
      return getUtf8MojibakeScore(decoded) < sourceScore ? decoded : source;
    } catch {
      return source;
    }
  }

  function repairUtf8MojibakeNode(node) {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      const current = String(node.nodeValue || "");
      const repaired = repairUtf8Mojibake(current);
      if (repaired !== current) node.nodeValue = repaired;
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node;
    UTF8_MOJIBAKE_ATTRS.forEach((attr) => {
      const current = el.getAttribute(attr);
      if (current == null) return;
      const repaired = repairUtf8Mojibake(current);
      if (repaired !== current) el.setAttribute(attr, repaired);
    });
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      const repairedValue = repairUtf8Mojibake(el.value);
      if (repairedValue !== el.value) {
        el.value = repairedValue;
        el.defaultValue = repairedValue;
      }
      const repairedPlaceholder = repairUtf8Mojibake(el.placeholder);
      if (repairedPlaceholder !== el.placeholder) el.placeholder = repairedPlaceholder;
    }
    const children = el.childNodes;
    for (let i = 0; i < children.length; i += 1) repairUtf8MojibakeNode(children[i]);
  }

  function runUtf8MojibakeRepair(fn) {
    if (utf8MojibakeRepairInProgress) return;
    utf8MojibakeRepairInProgress = true;
    try {
      fn();
    } finally {
      utf8MojibakeRepairInProgress = false;
    }
  }

  function startUtf8MojibakeRepair() {
    if (utf8MojibakeObserver || typeof MutationObserver !== "function" || !document.body) return;
    runUtf8MojibakeRepair(() => repairUtf8MojibakeNode(document.body));
    utf8MojibakeObserver = new MutationObserver((mutations) => {
      runUtf8MojibakeRepair(() => {
        mutations.forEach((mutation) => {
          if (mutation.type === "characterData") {
            repairUtf8MojibakeNode(mutation.target);
            return;
          }
          if (mutation.type === "attributes") {
            repairUtf8MojibakeNode(mutation.target);
            return;
          }
          mutation.addedNodes.forEach((addedNode) => repairUtf8MojibakeNode(addedNode));
        });
      });
    });
    utf8MojibakeObserver.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: UTF8_MOJIBAKE_ATTRS,
    });
  }

  startUtf8MojibakeRepair();
  const CHECKOUT_SCREEN_ID = "__checkout_screen__";
  const CHECKOUT_DRAFT_CACHE_VERSION = 1;
  const CHECKOUT_DRAFT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const CHECKOUT_PRODUCTS_CACHE_VERSION = 3;
  const CHECKOUT_PRODUCTS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const NEW_ORDER_CLIENT_CACHE_VERSION = 1;
  const NEW_ORDER_CLIENT_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  const state = {
    categories: [],
    productCategories: [],
    activeCategoryId: null,
    quantities: new Map(),
    productVariants: new Map(),
    selectedVariants: new Map(),
    currentProducts: [],
    categoryProductsCache: new Map(),
    unitConversions: [],
    productIngredients: new Map(),
    ingredientStateByProduct: new Map(),
    productOptionGroups: new Map(),
    optionGroupDetails: new Map(),
    optionSelections: new Map(),
    optionTargetProductCache: new Map(),
    productByIdCache: new Map(),
    comboDetailsCache: new Map(),
    checkoutSavedDraft: { blocks: [] },
    checkoutCategoryProducts: new Map(),
    checkoutSelectedProductByCategory: new Map(),
    checkoutProductsScrollByCategory: new Map(),
    checkoutVariantsScrollByCategory: new Map(),
    checkoutIngredientsPopoverKey: null,
    checkoutIngredientsPopoverPos: null,
    checkoutMergedPreviewByBlock: new Map(),
    checkoutEditingBlockId: null,
    checkoutEditMode: false,
    checkoutDraft: null,
    rightOrders: [],
    rightActiveOrderId: null,
    rightOpenSelect: null,
    rightDeliveryTypes: [],
    rightPaymentTypes: [],
    rightTimeOptions: [],
    rightOrderStatuses: [],
    rightDeliverySettings: null,
    rightDeliverySettingsReady: false,
    rightDeliverySettingsLoading: false,
    rightDatePickerMonthByOrder: new Map(),
    rightPickupStores: [],
    rightClientLookupCache: new Map(),
    rightClientLookupReqSeq: 0,
    rightClientDiscountsByClientId: new Map(),
    rightClientDiscountsLoadingByClientId: new Set(),
    rightAddressDraftByOrder: new Map(),
    rightClientAddressesByOrder: new Map(),
    rightAddressSelectedIdByOrder: new Map(),
    rightAddressEditingIdByOrder: new Map(),
    rightCartClearConfirmUntilByOrder: new Map(),
    rightCartClearTimerByOrder: new Map(),
    rightDiscountBreakdownOpenByOrder: new Map(),
    rightCheckoutSubmittingByOrder: new Map(),
    rightAutoAddDismissedByOrder: new Map(),
    autoAdd: {
      groups: [],
      items: [],
      byGroupId: new Map(),
      byProductId: new Map(),
    },
    autoAddLoaded: false,
    autoAddLoadPromise: null,
    tenantRounding: null,
    tenantRoundingLoaded: false,
    tenantRoundingPromise: null,
    productModal: {
      productId: 0,
      qty: 1,
      photoIndex: 0,
      expandedOptionItems: new Set(),
      expandedOptionGroups: new Set(),
      mode: "add",
      editOrderId: 0,
      editCartItemId: 0,
    },
    comboModal: {
      comboId: 0,
      combo: null,
      qty: 1,
      mode: "add",
      editOrderId: 0,
      editCartItemId: 0,
      selectedIndexByBlock: [],
      selectionStateByBlock: [],
      view: "main",
      pickerBlockIndex: -1,
      expandedPickerProductIndex: null,
      pickerRenderToken: 0,
    },
    cacheManifest: null,
  };

  let resolveLoadReady = null;
  const loadReadyPromise = new Promise((resolve) => {
    resolveLoadReady = resolve;
  });
  function markLoadReady() {
    if (!resolveLoadReady) return;
    resolveLoadReady();
    resolveLoadReady = null;
  }

  function isCheckoutScreenActive() {
    return String(state.activeCategoryId) === CHECKOUT_SCREEN_ID;
  }

  function updateEditControls() {
    if (!settingsBtnEl) return;
    const icon = settingsBtnEl.querySelector("i");
    if (state.checkoutEditMode) {
      if (icon) icon.className = "fas fa-check";
      settingsBtnEl.setAttribute("aria-label", "РЎРѕС…СЂР°РЅРёС‚СЊ С‡РµСЂРЅРѕРІРёРє СЌРєСЂР°РЅР° РѕС„РѕСЂРјР»РµРЅРёСЏ");
      settingsBtnEl.setAttribute("title", "РЎРѕС…СЂР°РЅРёС‚СЊ С‡РµСЂРЅРѕРІРёРє");
      if (cancelEditBtnEl) cancelEditBtnEl.classList.remove("hidden");
      return;
    }
    if (icon) icon.className = "fas fa-cog";
    settingsBtnEl.setAttribute("aria-label", "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЌРєСЂР°РЅ РѕС„РѕСЂРјР»РµРЅРёСЏ");
    settingsBtnEl.setAttribute("title", "Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ СЌРєСЂР°РЅ РѕС„РѕСЂРјР»РµРЅРёСЏ");
    if (cancelEditBtnEl) cancelEditBtnEl.classList.add("hidden");
  }

  function renderMainContentMode() {
    const checkoutScreenActive = isCheckoutScreenActive();
    if (newOrderToolbarEl) {
      newOrderToolbarEl.classList.toggle("is-checkout-screen", checkoutScreenActive);
    }
    if (checkoutScreenActive) {
      productsGridEl.innerHTML = "";
      productsGridEl.classList.add("hidden");
      if (productsEmptyEl) productsEmptyEl.classList.add("hidden");
      if (checkoutEditorEl) checkoutEditorEl.classList.remove("hidden");
      if (checkoutEditorEl) {
        checkoutEditorEl.classList.toggle("is-readonly", !state.checkoutEditMode);
      }
      renderCheckoutEditorContent();
      updateEditControls();
      return;
    }

    productsGridEl.classList.remove("hidden");
    if (checkoutEditorEl) checkoutEditorEl.classList.add("hidden");
    if (checkoutBlockChipsEl) {
      checkoutBlockChipsEl.innerHTML = "";
      checkoutBlockChipsEl.classList.add("hidden");
    }
    updateEditControls();
  }

  function renderRightOrderTabs() {
    if (!rightTabsEl || !rightContentEl) return;
    const orders = Array.isArray(state.rightOrders) ? state.rightOrders : [];
    if (!orders.length) {
      rightTabsEl.innerHTML = "";
      rightContentEl.innerHTML = "";
      rightContentEl.classList.add("hidden");
      if (rightFooterEl) {
        rightFooterEl.innerHTML = "";
        rightFooterEl.classList.add("hidden");
      }
      if (rightTabsHeaderEl) rightTabsHeaderEl.classList.add("hidden");
      if (rightEmptyEl) rightEmptyEl.classList.remove("hidden");
      state.rightOpenSelect = null;
      resetAllRightCartClearState({ render: false });
      state.rightCheckoutSubmittingByOrder.clear();
      state.rightDiscountBreakdownOpenByOrder.clear();
      state.rightAutoAddDismissedByOrder.clear();
      state.rightClientDiscountsLoadingByClientId.clear();
      closeRightAddressOverlay();
      return;
    }

    rightTabsEl.innerHTML = orders.map((order) => {
      const orderId = Number(order?.id || 0);
      const isActive = orderId === Number(state.rightActiveOrderId || 0);
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-action="right-order-tab-select" data-order-id="${orderId}">
          <span class="product-tab-title">${escapeHtml(String(order?.title || "РќРѕРІС‹Р№ Р·Р°РєР°Р·"))}</span>
          <button class="product-tab-close" type="button" data-action="right-order-tab-close" data-order-id="${orderId}" aria-label="Р—Р°РєСЂС‹С‚СЊ">×</button>
        </div>
      `;
    }).join("");
    rightContentEl.classList.remove("hidden");
    const requestedActiveId = Number(state.rightActiveOrderId || 0);
    let activeIndex = orders.findIndex((order) => Number(order?.id || 0) === requestedActiveId);
    if (activeIndex < 0) activeIndex = 0;
    let active = orders[activeIndex] || orders[0];
    state.rightActiveOrderId = Number(active?.id || 0) || null;
    const activeMode = String(active?.mode || "add").toLowerCase();
    const isEditCheckout = activeMode === "edit" && Number(active?.editOrderId || 0) > 0;
    if (rightTabsHeaderEl) {
      rightTabsHeaderEl.classList.toggle("hidden", isEditCheckout);
    }
    if (rightEmptyEl) rightEmptyEl.classList.add("hidden");
    let form = active?.form && typeof active.form === "object" ? active.form : {};
    const activeOrderId = Number(active?.id || 0);
    if (activeOrderId > 0) {
      const normalizedCart = normalizeRightOrderCartItemsWithAutoAdd(
        activeOrderId,
        Array.isArray(form?.cartItems) ? form.cartItems : []
      );
      const nextForm = { ...form, cartItems: normalizedCart };
      const nextActive = { ...active, form: nextForm };
      state.rightOrders[activeIndex] = nextActive;
      active = nextActive;
      form = nextForm;
    }
    const activeClientId = Number(form?.clientId || 0);
    if (
      activeClientId > 0
      && !state.rightClientDiscountsByClientId.has(activeClientId)
      && !state.rightClientDiscountsLoadingByClientId.has(activeClientId)
    ) {
      void ensureRightClientDiscountsLoaded(activeClientId).then(() => {
        if (Number(state.rightActiveOrderId || 0) === Number(active?.id || 0)) {
          renderRightOrderTabs();
        }
      });
    }
    const cartSummary = getRightOrderCheckoutSummary(active);
    const cartItems = cartSummary.cartItems;
    const orderPayableTotal = cartSummary.payableTotal;
    const deliveryProgressAriaValue = Math.round(cartSummary.progress);
    const deliveryProgressLabelHtml = cartSummary.freeReached
      ? `Бесплатная доставка <i class="fas fa-check shop-delivery-check" aria-hidden="true"></i>`
      : `${cartSummary.deliveryCost > 0 ? `Доставка <strong>${escapeHtml(toMoney(cartSummary.deliveryCost))}</strong>. ` : ""}Ещё <strong>${escapeHtml(toMoney(cartSummary.leftForFree))}</strong> до бесплатной доставки`;
    const clearArmedUntil = Number(state.rightCartClearConfirmUntilByOrder.get(Number(active?.id || 0)) || 0);
    const clearActionEnabled = isEditCheckout || cartItems.length > 0;
    const clearArmed = clearArmedUntil > Date.now() && clearActionEnabled;
    if (clearArmedUntil > 0 && !clearArmed) {
      resetRightCartClearState(Number(active?.id || 0), { render: false });
    }
    const clearBtnClass = isEditCheckout
      ? `shop-cart-clear is-edit-cancel ${clearArmed ? "is-confirm" : ""}`
      : `shop-cart-clear ${clearArmed ? "is-confirm" : ""}`;
    const clearBtnTitle = isEditCheckout
      ? (clearArmed ? "\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c \u043e\u0442\u043c\u0435\u043d\u0443 \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u044f" : "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c \u0440\u0435\u0434\u0430\u043a\u0442\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435")
      : "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c \u043a\u043e\u0440\u0437\u0438\u043d\u0443";
    const clearBtnLabel = clearBtnTitle;
    const clearBtnText = isEditCheckout
      ? (clearArmed ? "\u041e\u0442\u043c\u0435\u043d\u0430" : `<i class="fas fa-arrow-left" aria-hidden="true"></i>`)
      : (clearArmed ? "\u041e\u0447\u0438\u0441\u0442\u0438\u0442\u044c" : "\u00d7");
    const checkoutSubmitting = Boolean(state.rightCheckoutSubmittingByOrder.get(Number(active?.id || 0)));
    const checkoutActionLabel = isEditCheckout
      ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c"
      : "\u041e\u0444\u043e\u0440\u043c\u0438\u0442\u044c";
    const checkoutSubmittingLabel = isEditCheckout
      ? "\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c..."
      : "\u041e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c...";
    const checkoutDisabled = checkoutSubmitting || !cartItems.length;
    const activeOrderStatuses = (Array.isArray(state.rightOrderStatuses) ? state.rightOrderStatuses : [])
      .filter((item) => Number(item?.id || 0) > 0);
    const currentOrderStatusId = Number(form.orderStatusId || 0);
    const currentOrderStatusTitle = String(form.orderStatusTitle || form.orderStatusInitialTitle || "").trim();
    const defaultOrderStatusId = Number(activeOrderStatuses[0]?.id || 0);
    const resolvedOrderStatusId = currentOrderStatusId > 0
      ? currentOrderStatusId
      : (defaultOrderStatusId > 0 ? defaultOrderStatusId : 0);
    if (isEditCheckout && resolvedOrderStatusId > 0 && currentOrderStatusId <= 0) {
      updateRightOrderFormField(Number(active?.id || 0), "orderStatusId", resolvedOrderStatusId);
    }
    if (isEditCheckout && resolvedOrderStatusId > 0 && Number(form.orderStatusInitialId || 0) <= 0) {
      updateRightOrderFormField(Number(active?.id || 0), "orderStatusInitialId", resolvedOrderStatusId);
    }
    const selectedOrderStatusMeta = activeOrderStatuses.find((item) => Number(item?.id || 0) === resolvedOrderStatusId) || null;
    if (isEditCheckout && selectedOrderStatusMeta) {
      const selectedOrderStatusTitle = String(selectedOrderStatusMeta?.title || "").trim();
      if (selectedOrderStatusTitle && selectedOrderStatusTitle !== currentOrderStatusTitle) {
        updateRightOrderFormField(Number(active?.id || 0), "orderStatusTitle", selectedOrderStatusTitle);
      }
    }
    const statusIsOpen = isEditCheckout
      && Number(state.rightOpenSelect?.orderId || 0) === Number(active?.id || 0)
      && String(state.rightOpenSelect?.field || "") === "orderStatusId";
    const statusCurrentLabel = String(selectedOrderStatusMeta?.title || currentOrderStatusTitle || "\u0421\u0442\u0430\u0442\u0443\u0441").trim();
    const statusMenuItemsHtml = activeOrderStatuses.length
      ? activeOrderStatuses.map((status) => `
                <button
                  type="button"
                  class="new-order-right-select-option ${Number(status?.id || 0) === resolvedOrderStatusId ? "is-selected" : ""}"
                  data-action="right-select-option"
                  data-order-id="${Number(active?.id || 0)}"
                  data-field="orderStatusId"
                  data-value="${Number(status?.id || 0)}"
                >${escapeHtml(String(status?.title || "").trim())}</button>
              `).join("")
      : `
              <button
                type="button"
                class="new-order-right-select-option is-selected"
                disabled
              >${escapeHtml(statusCurrentLabel)}</button>
            `;
    const statusSelectHtml = isEditCheckout ? `
          <div class="new-order-right-select-wrap new-order-right-footer-status-wrap is-drop-up ${statusIsOpen ? "is-open" : ""}">
            <button
              type="button"
              class="new-order-right-select-trigger new-order-right-footer-status-trigger"
              data-action="right-select-toggle"
              data-order-id="${Number(active?.id || 0)}"
              data-field="orderStatusId"
            >
              <span>${escapeHtml(statusCurrentLabel)}</span>
              <i class="fas fa-chevron-down"></i>
            </button>
            ${statusIsOpen ? `
            <div class="new-order-right-select-menu no-scrollbar">
              ${statusMenuItemsHtml}
            </div>
            ` : ""}
          </div>
    ` : "";
    const rightFooterHtml = `
      <div class="shop-cart-delivery-progress ${cartSummary.showDeliveryProgress ? "" : "hidden"}">
        <div class="shop-cart-delivery-progress-bar" role="progressbar" aria-valuenow="${deliveryProgressAriaValue}" aria-valuemin="0" aria-valuemax="100">
          <div class="shop-cart-delivery-progress-fill" style="width:${cartSummary.progress}%"></div>
        </div>
        <div class="shop-cart-delivery-progress-label ${cartSummary.freeReached ? "is-free" : ""}">${deliveryProgressLabelHtml}</div>
      </div>
      <div class="shop-cart-footer">
        <div class="shop-cart-footer-actions">
          <button
            class="${clearBtnClass}"
            data-action="right-cart-clear"
            data-order-id="${Number(active?.id || 0)}"
            type="button"
            title="${clearBtnTitle}"
            aria-label="${clearBtnLabel}"
          >${clearBtnText}</button>
          <button
            class="shop-checkout-btn shop-checkout-btn--secondary"
            data-action="right-cart-checkout"
            data-order-id="${Number(active?.id || 0)}"
            type="button"
            ${checkoutDisabled ? "disabled" : ""}
          >${checkoutSubmitting
            ? checkoutSubmittingLabel
            : checkoutActionLabel
          }</button>
          <button
            class="shop-checkout-btn shop-checkout-btn--payment"
            data-action="right-cart-checkout-paid"
            data-order-id="${Number(active?.id || 0)}"
            type="button"
            ${checkoutDisabled ? "disabled" : ""}
          >${checkoutSubmitting
            ? "Принимаем оплату..."
            : "Принять оплату и оформить"
          }</button>
          ${statusSelectHtml}
        </div>
      </div>
    `;
    void ensureRightDeliverySettingsLoaded();
    const activeDeliveryTypes = (Array.isArray(state.rightDeliveryTypes) ? state.rightDeliveryTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const fallbackDeliveryType = activeDeliveryTypes.find((item) => Number(item?.is_default || 0) === 1) || activeDeliveryTypes[0] || null;
    const fallbackPickupMethodCode = String(fallbackDeliveryType?.code || "delivery");
    const pickupMethodLabels = Object.fromEntries(
      activeDeliveryTypes.map((item) => [String(item?.code || ""), String(item?.title || item?.code || "")])
    );
    const pickupMethodOptions = activeDeliveryTypes.map((item) => String(item?.code || "")).filter(Boolean);
    const currentPickupMethod = String(form.pickupMethod || "").trim();
    const resolvedPickupMethod = pickupMethodOptions.includes(currentPickupMethod)
      ? currentPickupMethod
      : fallbackPickupMethodCode;
    const activePaymentTypes = (Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const paymentMethodLabels = Object.fromEntries(
      activePaymentTypes.map((item) => [String(item?.code || ""), String(item?.title || item?.code || "")])
    );
    const paymentMethodOptions = activePaymentTypes.map((item) => String(item?.code || "")).filter(Boolean);
    const fallbackPaymentCode = paymentMethodOptions[0] || "cash";
    const currentPaymentCode = String(form.paymentMethod || "").trim();
    const resolvedPaymentMethod = paymentMethodOptions.includes(currentPaymentCode) ? currentPaymentCode : fallbackPaymentCode;

    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const cookWhenLabels = Object.fromEntries(
      activeTimeOptions.map((item) => [String(item?.code || ""), String(item?.title || item?.code || "")])
    );
    const cookWhenOptions = activeTimeOptions.map((item) => String(item?.code || "")).filter(Boolean);
    const fallbackCookWhenCode = cookWhenOptions[0] || "asap";
    const currentCookWhenCode = String(form.cookWhen || "").trim();
    const resolvedCookWhen = cookWhenOptions.includes(currentCookWhenCode) ? currentCookWhenCode : fallbackCookWhenCode;

    const cookWhenKind = getCookWhenKind(resolvedCookWhen);
    const initialDateByKind = cookWhenKind === "on_date" ? getTomorrowIsoDate() : formatIsoDate(getTodayDate());
    const currentTime = String(form.dateTime || "").trim();
    const currentDate = String(form.scheduledDate || "").trim();
    const resolvedDate = /^\d{4}-\d{2}-\d{2}$/.test(currentDate) ? currentDate : initialDateByKind;
    const effectiveDateForTime = cookWhenKind === "on_date" ? resolvedDate : formatIsoDate(getTodayDate());
    const timeSlots = buildTimeSlotsForOptionWithDate(resolvedCookWhen, effectiveDateForTime);
    const resolvedDateTime = timeSlots.includes(currentTime) ? currentTime : (timeSlots[0] || "18:00");

    const minChangeAmount = Math.max(0, roundPrice(orderPayableTotal)) + 1;

    const selectValues = {
      pickupMethod: resolvedPickupMethod,
      cookWhen: resolvedCookWhen,
      scheduledDate: resolvedDate,
      dateTime: resolvedDateTime,
      paymentMethod: resolvedPaymentMethod,
      changeType: form.changeType || "no_change",
    };
    const isCashPayment = isCashPaymentCode(selectValues.paymentMethod);
    const labels = {
      pickupMethod: pickupMethodLabels,
      cookWhen: cookWhenLabels,
      scheduledDate: { [resolvedDate]: formatDateHuman(resolvedDate) },
      dateTime: Object.fromEntries(timeSlots.map((t) => [t, t])),
      paymentMethod: paymentMethodLabels,
      changeType: { no_change: "РЎРґР°С‡Р° РЅРµ РЅСѓР¶РЅР°", "500": "500", "1000": "1000", "2000": "2000", "5000": "5000", other: "Р”СЂСѓРіР°СЏ СЃСѓРјРјР°" },
    };
    const options = {
      pickupMethod: pickupMethodOptions,
      cookWhen: cookWhenOptions,
      scheduledDate: [resolvedDate],
      dateTime: timeSlots,
      paymentMethod: paymentMethodOptions,
      changeType: ["no_change", "500", "1000", "2000", "5000", "other"],
    };
    const renderSelect = (field, orderId) => {
      const value = selectValues[field];
      const isOpen = Number(state.rightOpenSelect?.orderId || 0) === Number(orderId) && String(state.rightOpenSelect?.field || "") === field;
      return `
        <div class="new-order-right-select-wrap ${isOpen ? "is-open" : ""}">
          <button type="button" class="new-order-right-select-trigger" data-action="right-select-toggle" data-order-id="${orderId}" data-field="${field}">
            <span>${escapeHtml(labels[field]?.[value] || value || "Р’С‹Р±СЂР°С‚СЊ")}</span>
            <i class="fas fa-chevron-down"></i>
          </button>
          ${isOpen ? `
            <div class="new-order-right-select-menu no-scrollbar">
              ${(options[field] || []).map((opt) => `
                <button type="button" class="new-order-right-select-option ${String(opt) === String(value) ? "is-selected" : ""}" data-action="right-select-option" data-order-id="${orderId}" data-field="${field}" data-value="${escapeHtml(String(opt))}">
                  ${escapeHtml(labels[field]?.[opt] || String(opt))}
                </button>
              `).join("")}
            </div>
          ` : ""}
        </div>
      `;
    };
    const rightSummaryHtml = buildRightOrderSummaryCardHtml(
      active,
      cartSummary,
      labels.paymentMethod?.[selectValues.paymentMethod] || selectValues.paymentMethod || "",
      selectValues.paymentMethod
    );
    const renderCartThumb = (item) => {
      const photos = Array.isArray(item?.photos) ? item.photos.filter(Boolean).slice(0, 4) : [];
      if (!photos.length) return `<span class="new-order-right-cart-thumb-placeholder"><i class="fas fa-image"></i></span>`;
      if (photos.length === 1) return `<img class="new-order-right-cart-thumb-single" src="${escapeHtml(String(photos[0]))}" alt="" />`;
      const p1 = photos[0] || "";
      const p2 = photos[1] || "";
      const p3 = photos[2] || "";
      const p4 = photos[3] || "";
      // Layout order: top-left #1, top-right #3, bottom-left #4, bottom-right #2
      const slots = [p1, p3, p4, p2];
      return `
        <span class="new-order-right-cart-thumb-grid">
          ${slots.map((src) => src ? `<img src="${escapeHtml(String(src))}" alt="" />` : `<span class="new-order-right-cart-thumb-cell-empty"></span>`).join("")}
        </span>
      `;
    };
    rightContentEl.innerHTML = `
      <div class="new-order-right-form" data-order-id="${Number(active?.id || 0)}" autocomplete="off">
        <div class="new-order-right-form-row">
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">РќРѕРјРµСЂ С‚РµР»РµС„РѕРЅР°</span>
            <input class="control new-order-right-phone" type="text" inputmode="tel" value="${escapeHtml(formatPhoneRuInput(String(form.phone || "")))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="phone" placeholder="+7 (999) 999-99-99" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_phone_${Number(active?.id || 0)}" />
          </label>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">РРјСЏ</span>
            <input class="control" type="text" value="${escapeHtml(String(form.name || ""))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="name" placeholder="РРјСЏ РєР»РёРµРЅС‚Р°" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_name_${Number(active?.id || 0)}" />
          </label>
        </div>

        <div class="new-order-right-form-row">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">РЎРїРѕСЃРѕР± РїРѕР»СѓС‡РµРЅРёСЏ</span>
            ${renderSelect("pickupMethod", Number(active?.id || 0))}
          </div>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">РђРґСЂРµСЃ</span>
            <span class="new-order-right-address-wrap">
              <input class="control" type="text" value="${escapeHtml(String(form.address || ""))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="address" placeholder="Р’РІРµРґРёС‚Рµ Р°РґСЂРµСЃ" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_address_${Number(active?.id || 0)}" />
              <button type="button" class="new-order-right-address-edit" title="Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ" aria-label="Р”РѕР±Р°РІРёС‚СЊ Р°РґСЂРµСЃ">
                <i class="fas fa-pen"></i>
              </button>
            </span>
          </label>
        </div>

        <div class="new-order-right-form-row ${cookWhenKind !== "asap" ? "is-three-cols" : ""}">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">РљРѕРіРґР° РїСЂРёРіРѕС‚РѕРІРёС‚СЊ</span>
            ${renderSelect("cookWhen", Number(active?.id || 0))}
          </div>
          ${cookWhenKind === "asap" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Р”Р°С‚Р° Рё РІСЂРµРјСЏ</span>
              <div class="new-order-right-time-hint is-single"><span>40-80 РјРёРЅ</span></div>
            </div>
          ` : cookWhenKind === "at_time" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Р”Р°С‚Р°</span>
              <button type="button" class="new-order-right-select-trigger is-static" disabled><span>РЎРµРіРѕРґРЅСЏ</span></button>
            </div>
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Р’СЂРµРјСЏ</span>
              ${renderSelect("dateTime", Number(active?.id || 0))}
            </div>
          ` : `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Р”Р°С‚Р°</span>
              <div class="new-order-right-select-wrap ${Number(state.rightOpenSelect?.orderId || 0) === Number(active?.id || 0) && String(state.rightOpenSelect?.field || "") === "scheduledDate" ? "is-open" : ""}">
                <button type="button" class="new-order-right-select-trigger" data-action="right-select-toggle" data-order-id="${Number(active?.id || 0)}" data-field="scheduledDate">
                  <span>${escapeHtml(formatDateHuman(selectValues.scheduledDate))}</span>
                  <i class="fas fa-chevron-down"></i>
                </button>
                ${Number(state.rightOpenSelect?.orderId || 0) === Number(active?.id || 0) && String(state.rightOpenSelect?.field || "") === "scheduledDate"
                  ? renderDatePickerCalendar(Number(active?.id || 0), selectValues.scheduledDate)
                  : ""
                }
              </div>
            </div>
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Р’СЂРµРјСЏ</span>
              ${renderSelect("dateTime", Number(active?.id || 0))}
            </div>
          `}
        </div>

        <div class="new-order-right-form-row ${isCashPayment && String(selectValues.changeType) === "other" ? "is-payment-three-cols" : ""}">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">РЎРїРѕСЃРѕР± РѕРїР»Р°С‚С‹</span>
            ${renderSelect("paymentMethod", Number(active?.id || 0))}
          </div>
          ${isCashPayment ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">РЎРґР°С‡Р°</span>
              ${String(selectValues.changeType) === "other" ? `
                ${renderSelect("changeType", Number(active?.id || 0))}
              ` : renderSelect("changeType", Number(active?.id || 0))}
            </div>
          ` : `<div class="new-order-right-form-field"></div>`}
          ${isCashPayment && String(selectValues.changeType) === "other" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">РЎСѓРјРјР°</span>
              <input
                class="control new-order-right-change-input"
                type="number"
                min="${minChangeAmount}"
                step="1"
                value="${escapeHtml(String(form.changeAmount || ""))}"
                data-action="right-input-change"
                data-order-id="${Number(active?.id || 0)}"
                data-field="changeAmount"
                placeholder="Р‘РѕР»СЊС€Рµ ${escapeHtml(String(roundPrice(orderPayableTotal)))}"
                autocomplete="new-password"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                readonly
                data-no-autofill="1"
                name="noaf_change_${Number(active?.id || 0)}"
              />
            </div>
          ` : ""}
        </div>

        <label class="new-order-right-form-field is-comment">
          <span class="new-order-right-form-label">РљРѕРјРјРµРЅС‚Р°СЂРёР№</span>
          <textarea class="control new-order-right-comment" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="comment" placeholder="Р’РІРµРґРёС‚Рµ РєРѕРјРјРµРЅС‚Р°СЂРёР№ Рє Р·Р°РєР°Р·Сѓ" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_comment_${Number(active?.id || 0)}">${escapeHtml(String(form.comment || ""))}</textarea>
        </label>

        <div class="new-order-right-divider"></div>

        <div class="new-order-right-cart">
          <div class="new-order-right-cart-list">
            ${cartItems.length ? cartItems.map((item) => {
              const type = String(item?.type || "product");
              const qty = Math.max(1, Number(item?.qty || 1));
              const qtyEditable = isRightOrderAutoQtyEditable(item);
              const autoFreeQty = getRightOrderAutoFreeQty(item);
              const isAutoAddItem = isRightOrderAutoAddItem(item);
              const unitPrice = roundPrice(Number(item?.unit_price || 0));
              const sum = getRightOrderCartLineTotal(item);
              const unitOldPrice = roundPrice(Number(item?.unit_price_before_discount || 0));
              const oldSum = roundPrice(unitOldPrice * qty);
              const hasDiscount = !isAutoAddItem && oldSum > sum;
              const discountPercent = hasDiscount && oldSum > 0
                ? Math.max(1, Math.round(((oldSum - sum) / oldSum) * 100))
                : 0;
              const title = String(item?.name || (type === "combo" ? "РљРѕРјР±Рѕ" : "РўРѕРІР°СЂ"));
              const sections = Array.isArray(item?.sections) ? item.sections : [];
              const optionRows = type === "product"
                ? (() => {
                    const optionItems = Array.isArray(item?.option_items) ? item.option_items : [];
                    return optionItems
                      .map((opt, optIndex) => {
                        const groupId = Number(opt?.group_id || 0);
                        const itemId = Number(opt?.id || 0);
                        const qtyVal = Math.max(0, Number(opt?.qty || 0));
                        if (!(groupId > 0) || !(itemId > 0) || qtyVal <= 0) return null;
                        const details = state.optionGroupDetails.get(groupId);
                        const detailItems = Array.isArray(details?.items) ? details.items : [];
                        const detailItem = detailItems.find((x) => Number(x?.id || 0) === itemId) || null;
                        const detailName = String(detailItem?.name || detailItem?.product_name || opt?.label || "РћРїС†РёСЏ").trim();
                        const groupType = getOptionGroupUiType({ ...(details?.group || {}), items: detailItems });
                        const qtyMin = Math.max(0, Number(detailItem?.qty_min ?? 0));
                        const qtyMaxRaw = Number(detailItem?.qty_max ?? 99);
                        const qtyMax = Number.isFinite(qtyMaxRaw) && qtyMaxRaw > 0 ? qtyMaxRaw : 99;
                        const canMinus = qtyVal > qtyMin;
                        const canPlus = qtyVal < qtyMax;
                        const variants = Array.isArray(detailItem?.variants) ? detailItem.variants : [];
                        const vg = variants[0];
                        const values = Array.isArray(vg?.values) ? vg.values : [];
                        const selectedVariantIndex = Number.isFinite(Number(opt?.variantIndex))
                          ? Number(opt.variantIndex)
                          : getOptionItemDefaultVariantIndex(detailItem);
                        const variantValues = values.map((_, idx) => String(formatOptionVariantLabel(detailItem, idx) || "").trim()).filter(Boolean);
                        const variantLabel = values.length
                          ? String(formatOptionVariantLabel(detailItem, selectedVariantIndex) || "").trim()
                          : "";
                        return {
                          key: `opt-${optIndex}`,
                          rowKind: "option",
                          optionIndex: optIndex,
                          productName: detailName,
                          unitLabel: variantLabel,
                          variantValues,
                          selectedVariantIndex: Number.isFinite(selectedVariantIndex) ? selectedVariantIndex : 0,
                          optionQty: qtyVal,
                          showQtyControls: groupType === "multiple_item",
                          canMinus,
                          canPlus,
                        };
                      })
                      .filter(Boolean);
                  })()
                : [];
              const compositionRows = type === "combo" && sections.length
                ? sections.map((s, index) => ({
                  key: `sec-${index}`,
                  sectionIndex: index,
                  productName: String(s?.product_name || "—").trim(),
                  unitLabel: String(s?.variant?.label || "").trim(),
                  variantValues: Array.isArray(s?.variant?.values) ? s.variant.values.map((v) => String(v || "").trim()).filter(Boolean) : [],
                  selectedVariantIndex: Number.isFinite(Number(s?.variant?.selected_index)) ? Number(s.variant.selected_index) : 0,
                  ingredients: Array.isArray(s?.ingredients) ? s.ingredients : [],
                  rowKind: "combo",
                }))
                : [{
                  key: "product-main",
                  sectionIndex: 0,
                  productName: String(item?.name || "РўРѕРІР°СЂ").trim(),
                  unitLabel: String(item?.variant?.label || "").trim(),
                  variantValues: Array.isArray(item?.variant?.values) ? item.variant.values.map((v) => String(v || "").trim()).filter(Boolean) : [],
                  selectedVariantIndex: Number.isFinite(Number(item?.variant?.selected_index)) ? Number(item.variant.selected_index) : 0,
                  ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [],
                  rowKind: "product",
                  hasOptions: (() => {
                    const productId = Number(item?.product_id || 0);
                    const groups = productId > 0 ? (state.productOptionGroups.get(productId) || []) : [];
                    const selectedOptionItems = Array.isArray(item?.option_items) ? item.option_items : [];
                    return (Array.isArray(groups) && groups.length > 0) || selectedOptionItems.length > 0;
                  })(),
                }];
              const renderCompositionRowHtml = (row) => {
                const comboLineText = row.rowKind === "combo"
                  ? [String(row.unitLabel || "").trim(), String(row.productName || "").trim()].filter(Boolean).join(" ").trim()
                  : "";
                const baseLineRaw = row.rowKind === "combo"
                  ? (comboLineText ? `1 x ${comboLineText}` : `1 x ${String(row.productName || "—").trim() || "—"}`)
                  : (row.unitLabel
                    ? `${String(row.unitLabel || "").trim()} ${String(row.productName || "").trim()}`.trim()
                    : (row.rowKind === "option" ? String(row.productName || "").trim() : ""));
                const baseLine = baseLineRaw ? escapeHtml(baseLineRaw) : "";
                const cartItemIsCombo = String(item?.type || "") === "combo";
                const isCheckoutComposedCombo = cartItemIsCombo && Number(item?.combo_id || 0) <= 0;
                const comboRequireAll = getCartItemCheckoutRequireAll(item);
                const canRemoveComboSection = row.rowKind === "combo"
                  && isCheckoutComposedCombo
                  && comboRequireAll === false
                  && Number.isFinite(Number(row.sectionIndex))
                  && Number(row.sectionIndex) >= 0;
                const canRemoveProductRow = row.rowKind === "product" && row.variantValues.length > 1;
                const removeBtn = (canRemoveProductRow || canRemoveComboSection)
                  ? `
                    <button
                      type="button"
                      class="new-order-right-cart-variant-chip new-order-right-cart-variant-remove"
                      data-action="right-cart-row-remove"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      data-row-kind="${row.rowKind}"
                      data-section-index="${row.sectionIndex}"
                      aria-label="РЈРґР°Р»РёС‚СЊ РїРѕР·РёС†РёСЋ"
                      title="РЈРґР°Р»РёС‚СЊ РїРѕР·РёС†РёСЋ"
                    >×</button>
                  `
                  : "";
                const optionIcon = row.rowKind === "option"
                  ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="РћРїС†РёРё С‚РѕРІР°СЂР°"><i class="fas fa-sliders-h"></i></button>`
                  : "";
                const productOptionIcon = row.rowKind === "product" && row.hasOptions
                  ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="РћРїС†РёРё С‚РѕРІР°СЂР°"><i class="fas fa-sliders-h"></i></button>`
                  : "";
                const chips = row.variantValues.length > 1
                  ? `
                    <div class="new-order-right-cart-variant-scroll no-scrollbar">
                      <div class="new-order-right-cart-variant-row">
                        ${row.rowKind === "option" ? "" : `${removeBtn}${productOptionIcon}`}
                        ${row.variantValues.map((label, variantIndex) => `
                          <button
                            type="button"
                            class="new-order-right-cart-variant-chip ${variantIndex === row.selectedVariantIndex ? "is-selected" : ""}"
                            data-action="right-cart-variant-select"
                            data-order-id="${Number(active?.id || 0)}"
                            data-cart-item-id="${Number(item?.id || 0)}"
                            data-row-kind="${row.rowKind}"
                            data-section-index="${row.sectionIndex}"
                            data-option-index="${Number(row.optionIndex || 0)}"
                            data-variant-index="${variantIndex}"
                          >${escapeHtml(label)}</button>
                        `).join("")}
                      </div>
                    </div>
                  `
                  : "";
                const optionQtyControls = row.rowKind === "option" && row.showQtyControls
                  ? `
                    <div class="new-order-right-cart-ing-controls">
                      <button type="button" class="new-order-right-cart-ing-btn${row.canMinus ? "" : " is-disabled"}" data-action="right-cart-option-qty-minus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">−</button>
                      <span class="new-order-right-cart-ing-qty">${Number(row.optionQty || 0)}</span>
                      <button type="button" class="new-order-right-cart-ing-btn${row.canPlus ? "" : " is-disabled"}" data-action="right-cart-option-qty-plus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">+</button>
                    </div>
                  `
                  : "";
                const optionRemoveBtn = row.rowKind === "option"
                  ? `
                    <button
                      type="button"
                      class="new-order-right-cart-variant-chip new-order-right-cart-variant-remove"
                      data-action="right-cart-option-remove"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      data-option-index="${Number(row.optionIndex || 0)}"
                      aria-label="РЈРґР°Р»РёС‚СЊ РѕРїС†РёСЋ"
                      title="РЈРґР°Р»РёС‚СЊ РѕРїС†РёСЋ"
                    >×</button>
                  `
                  : "";
                const ingredientRows = Array.isArray(row.ingredients) ? row.ingredients : [];
                const ingredientsHtml = ingredientRows.length
                  ? `
                    <div class="new-order-right-cart-ingredients">
                      ${ingredientRows.map((ing, ingIndex) => {
                        const ingName = String(ing?.ingredient_name || "").trim();
                        const qty = Number(ing?.qty || 0);
                        const unitLabel = String(ing?.unit_label || "").trim();
                        const min = Number(ing?.qty_min ?? 0);
                        const max = Number(ing?.qty_max ?? qty);
                        const canMinus = qty > min;
                        const canPlus = qty < max;
                        return `
                          <div class="new-order-right-cart-ing-row">
                            <div class="new-order-right-cart-ing-controls">
                              <button type="button" class="new-order-right-cart-ing-btn${canMinus ? "" : " is-disabled"}" data-action="right-cart-ingredient-minus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-row-kind="${row.rowKind}" data-section-index="${row.sectionIndex}" data-ingredient-index="${ingIndex}">−</button>
                              <span class="new-order-right-cart-ing-qty">${escapeHtml(String(qty))}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</span>
                              <button type="button" class="new-order-right-cart-ing-btn${canPlus ? "" : " is-disabled"}" data-action="right-cart-ingredient-plus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-row-kind="${row.rowKind}" data-section-index="${row.sectionIndex}" data-ingredient-index="${ingIndex}">+</button>
                            </div>
                            <div class="new-order-right-cart-ing-name" title="${escapeHtml(ingName)}">${escapeHtml(ingName)}</div>
                          </div>
                        `;
                      }).join("")}
                    </div>
                  `
                  : "";
                const optionTitle = row.rowKind === "option"
                  ? `<div class="new-order-right-cart-option-title">${
                      row.showQtyControls
                        ? `${escapeHtml(String(Number(row.optionQty || 0)))} ${baseLine || escapeHtml(row.productName || "")}`
                        : (baseLine || escapeHtml(row.productName || ""))
                    }</div>`
                  : "";
                const optionControlsRow = row.rowKind === "option"
                  ? `
                    <div class="new-order-right-cart-option-controls-row">
                      ${optionRemoveBtn}
                      ${optionIcon}
                      ${row.showQtyControls ? optionQtyControls : chips}
                    </div>
                  `
                  : "";
                const productControlsRow = row.rowKind !== "option" && row.variantValues.length <= 1 && (removeBtn || productOptionIcon)
                  ? `<div class="new-order-right-cart-option-controls-row">${removeBtn}${productOptionIcon}</div>`
                  : "";
                const rowClass = row.rowKind === "combo"
                  ? "new-order-right-cart-composition-row new-order-right-cart-combo-row"
                  : "new-order-right-cart-composition-row";
                const comboTitleClass = row.rowKind === "combo" ? "new-order-right-cart-combo-title" : "";
                return `<div class="${rowClass}">${row.rowKind === "option" ? `${optionTitle}${optionControlsRow}` : (baseLine ? `<div class="${comboTitleClass}">${baseLine}</div>` : "")}${row.rowKind === "option" ? "" : `${chips}${productControlsRow}`}${ingredientsHtml}</div>`;
              };
              const compositionBodyHtml = type === "combo" && compositionRows.length
                ? `
                  ${compositionRows.map((row, idx) => `
                    <div class="new-order-right-cart-combo-section${idx > 0 ? " is-separated" : ""}">
                      ${renderCompositionRowHtml(row)}
                    </div>
                  `).join("")}
                  ${optionRows.length ? `<div class="new-order-right-cart-combo-section is-separated">${optionRows.map((row) => renderCompositionRowHtml(row)).join("")}</div>` : ""}
                `
                : [...compositionRows, ...optionRows].map((row) => renderCompositionRowHtml(row)).join("");
              const autoFreeLineHtml = autoFreeQty > 0
                ? `<div class="new-order-right-cart-composition-row">• Бесплатно: ${escapeHtml(formatQtyPlain(autoFreeQty))} шт.</div>`
                : "";
              return `
                <div class="new-order-right-cart-item-wrap" data-cart-item-id="${Number(item?.id || 0)}">
                  <div class="new-order-right-cart-item-tools">
                    <button
                      type="button"
                      class="new-order-right-cart-item-delete"
                      data-action="right-cart-item-delete"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      aria-label="РЈРґР°Р»РёС‚СЊ С‚РѕРІР°СЂ РёР· РєРѕСЂР·РёРЅС‹"
                      title="РЈРґР°Р»РёС‚СЊ С‚РѕРІР°СЂ РёР· РєРѕСЂР·РёРЅС‹"
                    >
                      <i class="fas fa-trash"></i>
                    </button>
                    <button
                      type="button"
                      class="new-order-right-cart-item-copy"
                      data-action="right-cart-item-copy"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      aria-label="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїРѕР·РёС†РёСЋ"
                      title="РЎРєРѕРїРёСЂРѕРІР°С‚СЊ РїРѕР·РёС†РёСЋ"
                    >
                      <i class="far fa-copy"></i>
                    </button>
                    ${type === "combo" && Number(item?.combo_id || 0) > 0 ? `
                    <button
                      type="button"
                      class="new-order-right-cart-item-copy"
                      data-action="right-cart-open-combo"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      data-combo-id="${Number(item?.combo_id || 0)}"
                      aria-label="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РєРѕРјР±Рѕ"
                      title="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РєРѕРјР±Рѕ"
                    >
                      <i class="fas fa-sliders-h"></i>
                    </button>
                    ` : ""}
                    ${qty > 1 ? `
                    <button
                      type="button"
                      class="new-order-right-cart-item-split"
                      data-action="right-cart-item-split"
                      data-order-id="${Number(active?.id || 0)}"
                      data-cart-item-id="${Number(item?.id || 0)}"
                      aria-label="Р Р°Р·РґРµР»РёС‚СЊ РїРѕР·РёС†РёСЋ"
                      title="Р Р°Р·РґРµР»РёС‚СЊ РїРѕР·РёС†РёСЋ"
                    >
                      <i class="fas fa-code-branch"></i>
                    </button>
                    ` : ""}
                  </div>
                  <article class="new-order-right-cart-item">
                  <div class="new-order-right-cart-left">
                    <div class="new-order-right-cart-thumb">${renderCartThumb(item)}</div>
                    <div class="qty-pill qty-pill--muted new-order-right-cart-qty" data-qty-wrap>
                      <button
                        class="qty-pill__btn qty-pill__btn--minus${(qty <= 0 || !qtyEditable) ? " is-disabled" : ""}"
                        type="button"
                        data-action="right-cart-qty-minus"
                        data-order-id="${Number(active?.id || 0)}"
                        data-cart-item-id="${Number(item?.id || 0)}"
                        ${qtyEditable ? "" : "disabled aria-disabled=\"true\""}
                      >−</button>
                      <span class="qty-pill__center" data-qty-value>${qty}</span>
                      <button
                        class="qty-pill__btn qty-pill__btn--plus${!qtyEditable ? " is-disabled" : ""}"
                        type="button"
                        data-action="right-cart-qty-plus"
                        data-order-id="${Number(active?.id || 0)}"
                        data-cart-item-id="${Number(item?.id || 0)}"
                        ${qtyEditable ? "" : "disabled aria-disabled=\"true\""}
                      >+</button>
                    </div>
                  </div>
                  <div class="new-order-right-cart-item-main">
                    <div class="new-order-right-cart-item-title">${qty} × ${escapeHtml(title)}</div>
                    <div class="new-order-right-cart-item-sub">
                      ${compositionBodyHtml}${autoFreeLineHtml}
                    </div>
                  </div>
                  <div class="new-order-right-cart-item-sum-wrap">
                    ${hasDiscount ? `<div class="new-order-right-cart-item-sum-old">${escapeHtml(toMoney(oldSum))}</div>` : ""}
                    <div class="new-order-right-cart-item-sum">${escapeHtml(toMoney(sum))}</div>
                    ${discountPercent > 0 ? `<div class="new-order-right-cart-item-discount">-${discountPercent}%</div>` : ""}
                  </div>
                  </article>
                </div>
              `;
            }).join("") : `<div class="new-order-right-cart-empty">РЎРѕСЃС‚Р°РІ Р·Р°РєР°Р·Р° РїРѕРєР° РїСѓСЃС‚</div>`}
          </div>
          ${rightSummaryHtml}
        </div>
      </div>
    `;
    if (rightFooterEl) {
      rightFooterEl.innerHTML = rightFooterHtml;
      rightFooterEl.classList.toggle("hidden", !cartItems.length);
    }
  }

  function buildRightOrderDraft(orderId, title, opts = {}) {
    const id = Number(orderId || 0) > 0 ? Number(orderId || 0) : Date.now() + Math.floor(Math.random() * 10000);
    const fallbackTitle = String(title || "").trim();
    const mode = String(opts?.mode || "add").toLowerCase() === "edit" ? "edit" : "add";
    const editOrderIdRaw = Number(opts?.editOrderId || 0);
    const editOrderId = mode === "edit" && Number.isFinite(editOrderIdRaw) && editOrderIdRaw > 0 ? editOrderIdRaw : 0;
    const nextNumber = (Array.isArray(state.rightOrders) ? state.rightOrders.length : 0) + 1;
    const resolvedTitle = fallbackTitle || (nextNumber === 1 ? "РќРѕРІС‹Р№ Р·Р°РєР°Р·" : `РќРѕРІС‹Р№ Р·Р°РєР°Р· ${nextNumber}`);
    const activeDeliveryTypes = (Array.isArray(state.rightDeliveryTypes) ? state.rightDeliveryTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const defaultDeliveryType = activeDeliveryTypes.find((item) => Number(item?.is_default || 0) === 1) || activeDeliveryTypes[0] || null;
    const defaultPickupMethodCode = String(defaultDeliveryType?.code || "delivery");
    const activePaymentTypes = (Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const defaultPaymentCode = String((activePaymentTypes[0] || {}).code || "cash");
    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const activeOrderStatuses = Array.isArray(state.rightOrderStatuses) ? state.rightOrderStatuses : [];
    const defaultCookWhenCode = String((activeTimeOptions[0] || {}).code || "asap");
    const defaultOrderStatusId = Number((activeOrderStatuses[0] || {}).id || 0) || null;
    const defaultCookWhenKind = getCookWhenKind(defaultCookWhenCode);
    const defaultScheduledDate = defaultCookWhenKind === "on_date" ? getTomorrowIsoDate() : formatIsoDate(getTodayDate());
    const defaultTime = buildTimeSlotsForOptionWithDate(defaultCookWhenCode, defaultScheduledDate)[0] || "18:00";

    return {
      id,
      title: resolvedTitle,
      mode,
      editOrderId,
      storeId: Number(opts?.storeId || 0) > 0 ? Number(opts.storeId) : null,
      form: {
        phone: "+7",
        clientId: null,
        name: "",
        pickupMethod: defaultPickupMethodCode,
        address: "",
        cookWhen: defaultCookWhenCode,
        scheduledDate: defaultScheduledDate,
        dateTime: defaultTime,
        orderStatusId: defaultOrderStatusId,
        orderStatusInitialId: defaultOrderStatusId,
        orderStatusTitle: "",
        orderStatusInitialTitle: "",
        paymentMethod: defaultPaymentCode,
        changeType: "no_change",
        changeAmount: "",
        comment: "",
        cartItems: [],
      },
    };
  }

  function normalizeRightOrderDraft(sourceDraft) {
    const src = sourceDraft && typeof sourceDraft === "object" ? sourceDraft : {};
    const base = buildRightOrderDraft(
      Number(src?.id || 0),
      String(src?.title || "").trim(),
      {
        mode: String(src?.mode || "add"),
        editOrderId: Number(src?.editOrderId || 0),
      }
    );
    const form = src.form && typeof src.form === "object"
      ? { ...base.form, ...src.form }
      : { ...base.form };
    form.cartItems = Array.isArray(form.cartItems) ? form.cartItems : [];
    form.orderStatusId = Number(form.orderStatusId || 0) > 0 ? Number(form.orderStatusId) : null;
    form.orderStatusInitialId = Number(form.orderStatusInitialId || 0) > 0 ? Number(form.orderStatusInitialId) : form.orderStatusId;
    form.orderStatusTitle = String(form.orderStatusTitle || "").trim();
    form.orderStatusInitialTitle = String(form.orderStatusInitialTitle || "").trim() || form.orderStatusTitle;
    return {
      ...base,
      ...src,
      id: Number(src?.id || base.id),
      title: String(src?.title || base.title || "").trim() || base.title,
      mode: base.mode,
      editOrderId: base.editOrderId,
      storeId: Number(src?.storeId || base.storeId || 0) > 0 ? Number(src?.storeId || base.storeId) : null,
      form,
    };
  }

  function openRightNewOrderTab(opts = {}) {
    const preferredId = Number(opts?.id || 0);
    const preferredTitle = String(opts?.title || "").trim();
    const draft = buildRightOrderDraft(preferredId, preferredTitle);
    state.rightOrders.push(draft);
    void applyReceiveMethodAddress(Number(draft.id || 0));
    state.rightActiveOrderId = Number(draft.id || 0) || null;
    state.rightOpenSelect = null;
    renderRightOrderTabs();
    return Number(draft.id || 0) || null;
  }

  function normalizeRightDeliveryTypeRef(item) {
    return {
      id: Number(item?.id || 0),
      code: String(item?.code || "").trim(),
      title: String(item?.title || "").trim(),
      // Fallback to active for legacy cached snapshots without this field.
      is_active: Number(item?.is_active ?? 1),
      is_default: Number(item?.is_default || 0),
      require_client_data: Number(item?.require_client_data ?? 1),
      show_on_site: Number(item?.show_on_site ?? 1),
      sort: Number(item?.sort || 0),
    };
  }

  async function loadRightDeliveryTypes() {
    try {
      const json = await apiJson("/api/admin/tenant/order-delivery-types");
      const items = Array.isArray(json?.items) ? json.items : [];
      state.rightDeliveryTypes = items
        .map(normalizeRightDeliveryTypeRef)
        .filter((item) => item.code)
        .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    } catch {
      state.rightDeliveryTypes = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadRightPaymentTypes() {
    try {
      const json = await apiJson("/api/admin/tenant/order-payments");
      const items = Array.isArray(json?.items) ? json.items : [];
      state.rightPaymentTypes = items
        .map((item) => ({
          id: Number(item?.id || 0),
          code: String(item?.code || "").trim(),
          title: String(item?.title || "").trim(),
          is_active: Number(item?.is_active || 0),
          sort: Number(item?.sort || 0),
        }))
        .filter((item) => item.code)
        .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    } catch {
      state.rightPaymentTypes = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadRightTimeOptions() {
    try {
      const json = await apiJson("/api/admin/tenant/order-time-options");
      const items = Array.isArray(json?.items) ? json.items : [];
      state.rightTimeOptions = items
        .map((item) => ({
          id: Number(item?.id || 0),
          code: String(item?.code || "").trim(),
          title: String(item?.title || "").trim(),
          is_active: Number(item?.is_active || 0),
          sort: Number(item?.sort || 0),
          has_time_window: Number(item?.has_time_window || 0),
          starts_at: String(item?.starts_at || "").trim(),
          ends_at: String(item?.ends_at || "").trim(),
          step_minutes: Number(item?.step_minutes || 30),
        }))
        .filter((item) => item.code)
        .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    } catch {
      state.rightTimeOptions = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadRightOrderStatuses() {
    try {
      const json = await apiJson("/api/admin/orders/statuses");
      const items = Array.isArray(json?.data) ? json.data : [];
      state.rightOrderStatuses = items
        .map((item) => ({
          id: Number(item?.id || 0),
          code: String(item?.code || "").trim(),
          title: String(item?.title || "").trim(),
          sort: Number(item?.sort || 0),
        }))
        .filter((item) => item.id > 0 && item.title)
        .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    } catch {
      state.rightOrderStatuses = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadRightPickupStores() {
    try {
      const tenantId = getTenantIdFromStorage();
      if (!(tenantId > 0)) {
        state.rightPickupStores = [];
        return;
      }
      const json = await apiJson(`/api/public/tenant/stores?tenant_id=${tenantId}`);
      const stores = Array.isArray(json?.stores) ? json.stores : [];
      state.rightPickupStores = stores
        .map((s) => ({
          id: Number(s?.id || 0),
          name: String(s?.name || "").trim(),
          address: String(s?.address || "").trim(),
          city: String(s?.city || s?.city_name || "").trim(),
          is_active: Number(s?.is_active || 0),
        }))
        .filter((s) => Number(s.is_active || 0) === 1)
        .sort((a, b) => (a.id - b.id));
    } catch {
      state.rightPickupStores = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadRightAutoAdd(opts = {}) {
    const force = opts?.force === true;
    if (state.autoAddLoaded && !force) return;
    if (state.autoAddLoadPromise) return state.autoAddLoadPromise;
    state.autoAddLoadPromise = (async () => {
      try {
        const json = await apiJson("/api/public/auto-add");
        const groups = Array.isArray(json?.data?.groups) ? json.data.groups : [];
        const items = Array.isArray(json?.data?.items) ? json.data.items : [];

        state.autoAdd.groups = groups;
        state.autoAdd.items = items;
        state.autoAdd.byGroupId = new Map(
          groups
            .map((g) => [Number(g?.id || 0), g])
            .filter(([gid]) => Number.isFinite(gid) && gid > 0)
        );
        state.autoAdd.byProductId = new Map(
          items
            .map((it) => [Number(it?.product_id || 0), it])
            .filter(([pid]) => Number.isFinite(pid) && pid > 0)
        );

        const ruleProductIds = [];
        const hintedProducts = [];
        items.forEach((rule) => {
          const groupId = Number(rule?.group_id || 0);
          if (!rule?.group && groupId > 0) {
            rule.group = state.autoAdd.byGroupId.get(groupId) || null;
          }
          const productId = Number(rule?.product_id || rule?.product?.id || 0);
          if (!(productId > 0)) return;
          ruleProductIds.push(productId);
          const hinted = rule?.product && typeof rule.product === "object"
            ? { ...rule.product, id: Number(rule.product?.id || productId) }
            : null;
          if (hinted && Number(hinted?.id || 0) > 0) {
            state.productByIdCache.set(Number(hinted.id), hinted);
            hintedProducts.push(hinted);
          }
        });

        const uniqueRuleIds = [...new Set(ruleProductIds)];
        const missingRuleIds = uniqueRuleIds.filter((pid) => !getProductById(pid));
        const fetchedProducts = [];
        if (missingRuleIds.length) {
          const settled = await Promise.allSettled(missingRuleIds.map((pid) => ensureProductById(pid)));
          settled.forEach((entry) => {
            if (entry.status !== "fulfilled") return;
            if (entry.value && typeof entry.value === "object") fetchedProducts.push(entry.value);
          });
        }

        const preloadProductsMap = new Map();
        [...hintedProducts, ...fetchedProducts].forEach((product) => {
          const pid = Number(product?.id || 0);
          if (!(pid > 0)) return;
          preloadProductsMap.set(pid, product);
        });
        const preloadProducts = Array.from(preloadProductsMap.values());
        if (preloadProducts.length) {
          await loadVariantsForProducts(preloadProducts);
          await loadIngredientsForProducts(preloadProducts);
        }
        state.autoAddLoaded = true;
      } catch {
        const hasCachedRules = Array.isArray(state.autoAdd?.groups) && state.autoAdd.groups.length
          || (Array.isArray(state.autoAdd?.items) && state.autoAdd.items.length);
        if (!hasCachedRules) {
          state.autoAdd.groups = [];
          state.autoAdd.items = [];
          state.autoAdd.byGroupId = new Map();
          state.autoAdd.byProductId = new Map();
          state.autoAddLoaded = false;
        }
      } finally {
        state.autoAddLoadPromise = null;
      }
      schedulePersistBootstrapSnapshot();
    })();
    return state.autoAddLoadPromise;
  }

  function parseTimeToMinutes(value) {
    const raw = String(value || "").trim();
    const m = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function formatIsoDate(value) {
    const d = new Date(value);
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function getTodayDate() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function getTomorrowIsoDate() {
    const d = getTodayDate();
    d.setDate(d.getDate() + 1);
    return formatIsoDate(d);
  }

  function formatDateHuman(isoDate) {
    const [y, m, d] = String(isoDate || "").split("-").map((x) => Number(x));
    if (!y || !m || !d) return "Р—Р°РІС‚СЂР°";
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
  }

  function addMonths(date, delta) {
    const d = new Date(date.getFullYear(), date.getMonth(), 1);
    d.setMonth(d.getMonth() + delta);
    return d;
  }

  function getCookWhenKind(code) {
    const c = String(code || "").trim().toLowerCase();
    if (c === "on_date" || c.includes("date") || c.includes("РґР°С‚Р°")) return "on_date";
    if (c === "at_time" || c.includes("time") || c.includes("РІСЂРµРјСЏ")) return "at_time";
    return "asap";
  }

  function isCashPaymentCode(code) {
    const c = String(code || "").trim().toLowerCase();
    return c === "cash" || c.includes("РЅР°Р»") || c.includes("cash");
  }

  function renderDatePickerCalendar(orderId, selectedIsoDate) {
    const minDate = getTodayDate();
    minDate.setDate(minDate.getDate() + 1);
    const monthFromState = state.rightDatePickerMonthByOrder.get(Number(orderId || 0));
    const baseMonth = monthFromState instanceof Date ? monthFromState : new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    const monthStart = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1);
    const monthTitle = monthStart.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const selected = String(selectedIsoDate || "");
    const minIso = formatIsoDate(minDate);

    const cells = [];
    for (let i = 0; i < firstWeekday; i += 1) cells.push('<span class="new-order-right-calendar-cell is-empty"></span>');
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateIso = formatIsoDate(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
      const isDisabled = dateIso < minIso;
      const isSelected = !isDisabled && dateIso === selected;
      cells.push(
        `<button type="button" class="new-order-right-calendar-cell ${isSelected ? "is-selected" : ""}" ${isDisabled ? "disabled" : ""} data-action="right-date-select" data-order-id="${Number(orderId || 0)}" data-value="${dateIso}">${day}</button>`
      );
    }

    return `
      <div class="new-order-right-calendar">
        <div class="new-order-right-calendar-head">
          <button type="button" class="new-order-right-calendar-nav" data-action="right-date-month-prev" data-order-id="${Number(orderId || 0)}"><i class="fas fa-chevron-left"></i></button>
          <div class="new-order-right-calendar-title">${escapeHtml(monthTitle)}</div>
          <button type="button" class="new-order-right-calendar-nav" data-action="right-date-month-next" data-order-id="${Number(orderId || 0)}"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="new-order-right-calendar-weekdays">
          <span>РџРЅ</span><span>Р’С‚</span><span>РЎСЂ</span><span>Р§С‚</span><span>РџС‚</span><span>РЎР±</span><span>Р’СЃ</span>
        </div>
        <div class="new-order-right-calendar-grid">${cells.join("")}</div>
      </div>
    `;
  }

  function toHHMM(totalMinutes) {
    const m = Number(totalMinutes || 0);
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }

  function buildTimeSlotsForOption(timeOptionCode) {
    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const selected = activeTimeOptions.find((item) => String(item?.code || "") === String(timeOptionCode || "")) || null;
    if (!selected) return ["18:00", "18:30", "19:00", "19:30"];
    if (Number(selected?.has_time_window || 0) !== 1) return ["18:00", "18:30", "19:00", "19:30"];

    const from = parseTimeToMinutes(selected.starts_at);
    const to = parseTimeToMinutes(selected.ends_at);
    const step = Number(selected.step_minutes || 30);
    if (from == null || to == null || !(step > 0) || to < from) return ["18:00", "18:30", "19:00", "19:30"];

    const result = [];
    for (let cur = from; cur <= to; cur += step) result.push(toHHMM(cur));
    return result.length ? result : ["18:00", "18:30", "19:00", "19:30"];
  }

  function ceilToStep(totalMinutes, stepMinutes) {
    const step = Math.max(1, Number(stepMinutes || 1));
    return Math.ceil(totalMinutes / step) * step;
  }

  function buildTimeSlotsForOptionWithDate(timeOptionCode, scheduledDateIso) {
    const baseSlots = buildTimeSlotsForOption(timeOptionCode);
    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const selected = activeTimeOptions.find((item) => String(item?.code || "") === String(timeOptionCode || "")) || null;
    if (!selected) return baseSlots;
    if (Number(selected?.has_time_window || 0) !== 1) return baseSlots;

    const todayIso = formatIsoDate(getTodayDate());
    if (String(scheduledDateIso || "") !== todayIso) return baseSlots;

    const lead = Math.max(0, Number(selected?.lead_minutes || 0));
    const step = Math.max(1, Number(selected?.step_minutes || 30));
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const minAllowed = ceilToStep(nowMinutes + lead, step);
    const filtered = baseSlots.filter((hhmm) => {
      const m = parseTimeToMinutes(hhmm);
      return m != null && m >= minAllowed;
    });
    return filtered.length ? filtered : baseSlots.slice(-1);
  }

  function isPickupLikeMethod(code) {
    const c = String(code || "").trim().toLowerCase();
    if (!c) return false;
    if (c === "delivery") return false;
    if (c.includes("pickup") || c.includes("takeaway") || c.includes("dine") || c.includes("hall")) return true;
    if (c.includes("СЃР°РјРѕРІС‹РІРѕР·") || c.includes("СЃСЃРѕР±РѕР№") || c.includes("СЃ СЃРѕР±РѕР№") || c.includes("РІР·Р°Р»Рµ") || c.includes("РІ Р·Р°Р»Рµ")) return true;
    return false;
  }

  function isDeliveryMethodCode(code) {
    const c = String(code || "").trim().toLowerCase();
    if (!c) return true;
    if (c === "delivery") return true;
    if (c.includes("delivery") || c.includes("РґРѕСЃС‚Р°РІРєР°")) return true;
    return !isPickupLikeMethod(c);
  }

  function getRightOrderPreferredPickupStoreId() {
    const stores = Array.isArray(state.rightPickupStores) ? state.rightPickupStores : [];
    if (!stores.length) return 0;
    const preferredId = getStoreIdFromStorage();
    const preferred = stores.find((s) => Number(s?.id || 0) === preferredId)
      || stores.find((s) => Number(s?.is_default || 0) === 1)
      || stores[0]
      || null;
    const storeId = Number(preferred?.id || 0);
    return Number.isFinite(storeId) && storeId > 0 ? storeId : 0;
  }

  async function ensureRightDeliverySettingsLoaded() {
    if (state.rightDeliverySettingsReady || state.rightDeliverySettingsLoading) return;
    state.rightDeliverySettingsLoading = true;
    try {
      const json = await apiJson("/api/public/delivery-settings");
      state.rightDeliverySettings = json?.data || null;
    } catch {
      state.rightDeliverySettings = null;
    } finally {
      state.rightDeliverySettingsLoading = false;
      state.rightDeliverySettingsReady = true;
      schedulePersistBootstrapSnapshot();
      renderRightOrderTabs();
    }
  }

  function parseRightDiscountDays(value) {
    if (Array.isArray(value)) return value.map((x) => Number(x)).filter((x) => Number.isFinite(x));
    const raw = String(value || "").trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((x) => Number(x)).filter((x) => Number.isFinite(x)) : [];
    } catch {
      return [];
    }
  }

  function parseRightDiscountTimeToMinutes(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    const hh = Number(match[1]);
    const mm = Number(match[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  }

  function isRightClientDiscountActive(discount) {
    if (!discount || typeof discount !== "object") return false;
    const isActiveRaw = discount?.is_active;
    if (!(isActiveRaw === true || Number(isActiveRaw || 0) === 1)) return false;

    const now = new Date();
    const startRaw = String(discount?.starts_at || "").trim();
    if (startRaw) {
      const start = new Date(startRaw);
      if (!Number.isNaN(start.getTime()) && start > now) return false;
    }
    const endRaw = String(discount?.ends_at || "").trim();
    if (endRaw) {
      const end = new Date(endRaw);
      if (!Number.isNaN(end.getTime()) && end < now) return false;
    }

    const scheduleDays = parseRightDiscountDays(discount?.schedule_days);
    if (scheduleDays.length > 0) {
      const currentDay = now.getDay();
      if (!scheduleDays.includes(currentDay)) return false;
    }

    const timeStart = parseRightDiscountTimeToMinutes(discount?.schedule_time_start);
    const timeEnd = parseRightDiscountTimeToMinutes(discount?.schedule_time_end);
    if (timeStart != null || timeEnd != null) {
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (timeStart != null && currentMinutes < timeStart) return false;
      if (timeEnd != null && currentMinutes > timeEnd) return false;
    }

    const usageLimit = Number(discount?.usage_limit || 0);
    const usageCount = Number(discount?.usage_count || 0);
    if (usageLimit > 0 && usageCount >= usageLimit) return false;

    return true;
  }

  function calculateRightDiscountPreview(price, discount) {
    const srcPrice = roundPrice(Number(price || 0));
    if (!(srcPrice > 0) || !discount) return 0;
    const discountType = String(discount?.discount_type || "").trim();
    const discountValue = Number(discount?.discount_value || 0);
    if (!(discountValue > 0)) return 0;

    let discountAmount = 0;
    if (discountType === "percent") {
      discountAmount = srcPrice * (discountValue / 100);
    } else if (discountType === "fixed") {
      discountAmount = discountValue;
    } else if (discountType === "special_price") {
      discountAmount = Math.max(0, srcPrice - discountValue);
    } else {
      return 0;
    }

    const maxDiscountAmount = Number(discount?.max_discount_amount);
    if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
      discountAmount = maxDiscountAmount;
    }
    if (discountAmount > srcPrice) discountAmount = srcPrice;
    return roundPrice(discountAmount);
  }

  function applyBestRightOrderDiscountsPreview(discounts, price) {
    const source = Array.isArray(discounts) ? discounts : [];
    const basePrice = roundPrice(Number(price || 0));
    if (!source.length || !(basePrice > 0)) {
      return { totalDiscount: 0, appliedDiscounts: [] };
    }

    const stackable = source.filter((d) => Number(d?.is_stackable || 0) === 1 || d?.is_stackable === true);
    const nonStackable = source.filter((d) => !(Number(d?.is_stackable || 0) === 1 || d?.is_stackable === true));

    let bestNonStackable = null;
    let bestNonStackableAmount = 0;
    nonStackable.forEach((discount) => {
      const amount = calculateRightDiscountPreview(basePrice, discount);
      if (amount > bestNonStackableAmount) {
        bestNonStackableAmount = amount;
        bestNonStackable = discount;
      }
    });

    let stackableTotal = 0;
    const stackableApplied = [];
    stackable.forEach((discount) => {
      const leftPrice = roundPrice(Math.max(0, basePrice - stackableTotal));
      if (!(leftPrice > 0)) return;
      const amount = calculateRightDiscountPreview(leftPrice, discount);
      if (!(amount > 0)) return;
      stackableTotal = roundPrice(stackableTotal + amount);
      stackableApplied.push({ ...discount, discountAmount: amount });
    });

    if (bestNonStackableAmount > stackableTotal) {
      return {
        totalDiscount: roundPrice(Math.min(basePrice, bestNonStackableAmount)),
        appliedDiscounts: bestNonStackable ? [{ ...bestNonStackable, discountAmount: bestNonStackableAmount }] : [],
      };
    }

    return {
      totalDiscount: roundPrice(Math.min(basePrice, stackableTotal)),
      appliedDiscounts: stackableApplied,
    };
  }

  function normalizeRightClientDiscountRow(row) {
    const src = row && typeof row === "object" ? row : {};
    return {
      id: Number(src?.id || 0),
      title: String(src?.title || "").trim(),
      discount_type: String(src?.discount_type || "").trim(),
      discount_value: Number(src?.discount_value || 0),
      apply_to: String(src?.apply_to || "").trim(),
      is_active: src?.is_active === true ? 1 : Number(src?.is_active || 0),
      starts_at: String(src?.starts_at || "").trim(),
      ends_at: String(src?.ends_at || "").trim(),
      min_order_amount: Number(src?.min_order_amount || 0),
      max_discount_amount: src?.max_discount_amount == null ? null : Number(src.max_discount_amount || 0),
      is_stackable: src?.is_stackable === true ? 1 : Number(src?.is_stackable || 0),
      usage_limit: Number(src?.usage_limit || 0),
      usage_count: Number(src?.usage_count || 0),
      schedule_days: src?.schedule_days ?? null,
      schedule_time_start: String(src?.schedule_time_start || "").trim(),
      schedule_time_end: String(src?.schedule_time_end || "").trim(),
    };
  }

  async function ensureRightClientDiscountsLoaded(clientId) {
    const id = Number(clientId || 0);
    if (!(id > 0)) return [];
    if (state.rightClientDiscountsByClientId.has(id)) {
      const cached = state.rightClientDiscountsByClientId.get(id);
      return Array.isArray(cached) ? cached : [];
    }
    if (state.rightClientDiscountsLoadingByClientId.has(id)) return [];
    state.rightClientDiscountsLoadingByClientId.add(id);
    try {
      const json = await apiJson(`/api/admin/clients/${id}/discounts`);
      const rows = Array.isArray(json?.data) ? json.data : [];
      const normalized = rows.map((row) => normalizeRightClientDiscountRow(row)).filter((row) => row.id > 0);
      state.rightClientDiscountsByClientId.set(id, normalized);
      return normalized;
    } catch {
      state.rightClientDiscountsByClientId.set(id, []);
      return [];
    } finally {
      state.rightClientDiscountsLoadingByClientId.delete(id);
    }
  }

  function getRightOrderCustomerDiscountSummary(order, subtotalAfterItemDiscounts) {
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const clientId = Number(form?.clientId || 0);
    if (!(clientId > 0)) {
      return { amount: 0, titles: [], appliedDiscounts: [] };
    }
    const discounts = state.rightClientDiscountsByClientId.get(clientId);
    const source = Array.isArray(discounts) ? discounts : [];
    if (!source.length) {
      return { amount: 0, titles: [], appliedDiscounts: [] };
    }
    const orderDiscounts = source.filter((discount) => {
      if (String(discount?.apply_to || "").toLowerCase() !== "order") return false;
      if (!isRightClientDiscountActive(discount)) return false;
      const minOrderAmount = Number(discount?.min_order_amount || 0);
      if (minOrderAmount > 0 && Number(subtotalAfterItemDiscounts || 0) < minOrderAmount) return false;
      return true;
    });
    if (!orderDiscounts.length) {
      return { amount: 0, titles: [], appliedDiscounts: [] };
    }
    const preview = applyBestRightOrderDiscountsPreview(orderDiscounts, subtotalAfterItemDiscounts);
    const amount = roundPrice(Math.max(0, Number(preview?.totalDiscount || 0)));
    const appliedDiscounts = Array.isArray(preview?.appliedDiscounts) ? preview.appliedDiscounts : [];
    const titles = [...new Set(
      appliedDiscounts
        .map((row) => String(row?.title || "").trim())
        .filter(Boolean)
    )];
    return { amount, titles, appliedDiscounts };
  }

  function rightAutoAddDismissedKey(groupId, productId) {
    return `${Number(groupId || 0)}:${Number(productId || 0)}`;
  }

  function getRightAutoAddDismissedSet(orderId, { create = false } = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return null;
    const existing = state.rightAutoAddDismissedByOrder.get(id);
    if (existing instanceof Set) return existing;
    if (!create) return null;
    const created = new Set();
    state.rightAutoAddDismissedByOrder.set(id, created);
    return created;
  }

  function clearRightAutoAddDismissed(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    return state.rightAutoAddDismissedByOrder.delete(id);
  }

  function markRightAutoAddDismissed(orderId, groupId, productId) {
    const gid = Number(groupId || 0);
    const pid = Number(productId || 0);
    if (!(gid > 0) || !(pid > 0)) return;
    const set = getRightAutoAddDismissedSet(orderId, { create: true });
    if (!set) return;
    set.add(rightAutoAddDismissedKey(gid, pid));
  }

  function isRightAutoAddDismissed(orderId, groupId, productId) {
    const set = getRightAutoAddDismissedSet(orderId, { create: false });
    if (!set) return false;
    return set.has(rightAutoAddDismissedKey(groupId, productId));
  }

  function clearRightAutoAddDismissedEntry(orderId, groupId, productId) {
    const set = getRightAutoAddDismissedSet(orderId, { create: false });
    if (!set) return false;
    const key = rightAutoAddDismissedKey(groupId, productId);
    const removed = set.delete(key);
    if (set.size === 0) clearRightAutoAddDismissed(orderId);
    return removed;
  }

  function clearRightAutoAddDismissedIfCartEmpty(orderId, cartItems) {
    const hasRows = (Array.isArray(cartItems) ? cartItems : []).some((item) => Math.max(0, Number(item?.qty || 0)) > 0);
    if (!hasRows) clearRightAutoAddDismissed(orderId);
  }

  function getRightAutoRuleByProductId(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return null;
    if (!(state.autoAdd?.byProductId instanceof Map)) return null;
    return state.autoAdd.byProductId.get(pid) || null;
  }

  function parseRightAutoRuleAmount(value) {
    if (value == null || value === "") return 0;
    const direct = Number(value);
    if (Number.isFinite(direct)) return direct;
    const normalized = String(value).trim().replace(",", ".");
    const fallback = Number(normalized);
    return Number.isFinite(fallback) ? fallback : 0;
  }

  function getRightAutoAddDesiredQty(rule) {
    const minQty = Math.max(0, Number(rule?.min_qty || 0));
    const defaultQty = Math.max(0, Number(rule?.default_qty || 0));
    const desired = Math.max(minQty, defaultQty);
    return desired > 0 ? desired : 1;
  }

  function calcRightAutoFreeQty(rule, baseTotal) {
    if (!rule) return 0;
    let freeQty = Math.max(0, parseRightAutoRuleAmount(rule.free_first_qty));
    const amountStep = parseRightAutoRuleAmount(rule.free_per_amount);
    const stepQty = Math.max(0, parseRightAutoRuleAmount(rule.free_per_amount_qty));
    if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
      freeQty += Math.floor(baseTotal / amountStep) * stepQty;
    }
    const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
    if (maxFree != null && Number.isFinite(maxFree)) {
      freeQty = Math.min(freeQty, Math.max(0, maxFree));
    }
    return freeQty;
  }

  function isRightOrderPlainCartItem(item) {
    if (!item || String(item?.type || "product") === "combo") return false;
    const optionItems = Array.isArray(item?.option_items) ? item.option_items : [];
    if (optionItems.length > 0) return false;
    const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
    const hasCustomIngredients = ingredients.some((row) => {
      const qty = Number(row?.qty ?? row?.quantity ?? 0);
      const defaultQty = Number(row?.default_qty ?? qty);
      if (!Number.isFinite(qty) || !Number.isFinite(defaultQty)) return false;
      return Math.abs(qty - defaultQty) > 0.000001;
    });
    if (hasCustomIngredients) return false;
    const selectedVariantIndex = Number(item?.variant?.selected_index);
    const defaultVariantIndex = Number(item?.pricing?.variant_group?.default_value_index);
    if (Number.isFinite(selectedVariantIndex) && Number.isFinite(defaultVariantIndex) && selectedVariantIndex !== defaultVariantIndex) {
      return false;
    }
    return true;
  }

  function buildDefaultIngredientsSnapshotForProduct(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return [];
    const ingredients = state.productIngredients.get(pid) || [];
    return ingredients.map((ing) => {
      const defaultQty = Number(ing.quantity ?? 1);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      return {
        ingredient_id: Number(ing.ingredient_id || 0),
        ingredient_name: String(ing.ingredient_name || ""),
        qty: defaultQty,
        default_qty: defaultQty,
        qty_min: min,
        qty_max: max,
        qty_step: step,
        unit_label: String(ing.unit_short_title || ing.unit_title || ing.unit_code || "").trim(),
        unit_id: Number(ing.unit_id || ing.ingredient_unit_id || 0),
        ingredient_base_unit_id: Number(ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id || 0),
        price_per_unit: Number(pricePerUnit || 0),
      };
    });
  }

  function buildPlainAutoAddCartItem(productId, qty) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return null;
    const product = getProductById(pid);
    if (!product) return null;
    if (!isProductAvailableFlag(product)) return null;
    const safeQty = Math.max(1, Number(qty || 1));
    const productVariants = state.productVariants.get(pid) || [];
    const primaryVariantGroup = productVariants[0] || null;
    const values = Array.isArray(primaryVariantGroup?.values) ? primaryVariantGroup.values : [];
    const rawDefault = primaryVariantGroup?.default_value_index != null ? Number(primaryVariantGroup.default_value_index) : 0;
    const selectedVariantIndex = values.length
      ? Math.max(0, Math.min(values.length - 1, Number.isFinite(rawDefault) ? rawDefault : 0))
      : 0;
    const variantValues = values.map((value) => String(value || "").trim()).filter(Boolean);
    const variantLabel = variantValues.length ? String(variantValues[selectedVariantIndex] || "").trim() : "";

    const item = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      type: "product",
      name: String(product?.name || "Товар"),
      product_id: pid,
      qty: safeQty,
      photos: [String(getProductPhoto(product) || "")].filter(Boolean),
      variant: {
        label: variantLabel,
        values: variantValues,
        selected_index: selectedVariantIndex,
      },
      pricing: {
        base_price: Number(product?.price || 0),
        old_price: Number(product?.old_price || 0),
        option_total: 0,
        discount: product?.discount && typeof product.discount === "object" ? { ...product.discount } : null,
        base_unit_id: Number(product?.base_unit_id || product?.unit_id || 0),
        unit_id: Number(primaryVariantGroup?.unit_id || product?.base_unit_id || product?.unit_id || 0),
        base_qty: Number(product?.base_qty || 1),
        variant_group: primaryVariantGroup ? {
          unit_id: Number(primaryVariantGroup?.unit_id || 0),
          default_value_index: Number(primaryVariantGroup?.default_value_index || 0),
          values: Array.isArray(primaryVariantGroup?.values) ? [...primaryVariantGroup.values] : [],
          discount_tiers: Array.isArray(primaryVariantGroup?.discount_tiers) ? primaryVariantGroup.discount_tiers.map((tier) => ({ ...tier })) : [],
        } : null,
      },
      option_items: [],
      ingredients: buildDefaultIngredientsSnapshotForProduct(pid),
      auto_add: 1,
      auto_add_group_id: null,
    };
    return recalculateCartItemTotals(item);
  }

  function calcRightCartSnapshotUnitPrice(pricing, selectedIndex, fallbackPrice) {
    const basePrice = Number(pricing?.base_price || 0);
    const optionTotal = Number(pricing?.option_total || 0);
    const baseUnitId = Number(pricing?.base_unit_id || 0);
    const unitId = Number(pricing?.unit_id || 0);
    const baseQty = Number(pricing?.base_qty || 1) || 1;
    const variantGroup = pricing?.variant_group || null;
    if (!variantGroup || !Array.isArray(variantGroup.values) || !variantGroup.values.length) {
      return roundPrice(Number(fallbackPrice || basePrice || 0) + optionTotal);
    }
    const productLike = {
      price: basePrice,
      base_unit_id: baseUnitId,
      unit_id: baseUnitId || unitId,
      base_qty: baseQty,
    };
    const next = getVariantUnitPriceByBase(productLike, [variantGroup], Number(selectedIndex || 0), basePrice);
    const resolvedBase = Number.isFinite(Number(next)) ? Number(next) : Number(fallbackPrice || basePrice || 0);
    return roundPrice(resolvedBase + optionTotal);
  }

  function getRightAutoItemUnitParts(item) {
    if (!item || String(item?.type || "product") === "combo") {
      return { baseProductUnit: 0, optionTotal: 0, ingredientDiff: 0, baseUnit: 0 };
    }
    const optionItems = Array.isArray(item?.option_items) ? item.option_items : [];
    const optionTotal = roundPrice(optionItems.reduce((sum, row) => {
      const qty = Math.max(0, Number(row?.qty || 0));
      const basePrice = Number(row?.basePrice || 0);
      const variantDiff = Number(row?.variantDiff || 0);
      return sum + ((basePrice + variantDiff) * qty);
    }, 0));
    const ingredientDiff = roundPrice(calculateIngredientSnapshotDiff(item?.ingredients));
    const selectedVariantIndex = Number.isFinite(Number(item?.variant?.selected_index))
      ? Number(item.variant.selected_index)
      : 0;
    const pricing = item?.pricing && typeof item.pricing === "object" ? item.pricing : null;
    let baseProductUnit = Number(item?.unit_price_before_discount || item?.unit_price || 0);
    if (pricing) {
      baseProductUnit = calcRightCartSnapshotUnitPrice(
        { ...pricing, option_total: 0 },
        selectedVariantIndex,
        Number(pricing?.base_price || baseProductUnit)
      );
    }
    if (!Number.isFinite(baseProductUnit)) baseProductUnit = 0;
    const baseUnit = roundPrice(baseProductUnit + optionTotal + ingredientDiff);
    return {
      baseProductUnit: roundPrice(baseProductUnit),
      optionTotal,
      ingredientDiff,
      baseUnit,
    };
  }

  function computeRightAutoNonAutoTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      if (String(item?.type || "") === "combo") {
        const unitBefore = Number(item?.unit_price_before_discount || item?.unit_price || 0);
        return sum + roundPrice(unitBefore * qty);
      }
      if (Number(item?.auto_add || 0) === 1) return sum;
      const parts = getRightAutoItemUnitParts(item);
      return sum + roundPrice(parts.baseUnit * qty);
    }, 0);
  }

  function computeRightAutoEligibleTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      if (String(item?.type || "") === "combo") {
        const unitBefore = Number(item?.unit_price_before_discount || item?.unit_price || 0);
        return sum + roundPrice(unitBefore * qty);
      }
      const isAuto = Number(item?.auto_add || 0) === 1;
      const parts = getRightAutoItemUnitParts(item);
      if (!isAuto) {
        return sum + roundPrice(parts.baseUnit * qty);
      }
      const rule = getRightAutoRuleByProductId(item?.product_id);
      if (!rule) {
        return sum + roundPrice(parts.baseUnit * qty);
      }
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      const unitPrice = roundPrice(priceOverride + parts.optionTotal + parts.ingredientDiff);
      return sum + roundPrice(unitPrice * qty);
    }, 0);
  }

  function applyRightAutoPricingToCartItem(item, totals) {
    if (!item || String(item?.type || "") === "combo") return item;
    const next = { ...item };
    const rule = getRightAutoRuleByProductId(next?.product_id);
    const isAuto = Number(next?.auto_add || 0) === 1;
    if (!rule || !isAuto) {
      next.auto_add = isAuto ? 1 : 0;
      next.auto_add_group_id = isAuto ? (Number(next?.auto_add_group_id || 0) || null) : null;
      delete next.auto_add_free_qty;
      delete next.auto_add_paid_qty;
      return next;
    }
    const parts = getRightAutoItemUnitParts(next);
    const group = rule.group || null;
    const nonAutoTotal = Number(totals?.nonAutoTotal || 0);
    const autoEligibleTotal = Number(totals?.autoEligibleTotal || nonAutoTotal);
    const baseTotal = group && Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
    const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
      ? Number(rule.price_override)
      : parts.baseProductUnit;
    const unitPrice = roundPrice(priceOverride + parts.optionTotal + parts.ingredientDiff);
    const qty = Math.max(0, Number(next?.qty || 0));
    const freeQty = calcRightAutoFreeQty(rule, baseTotal);
    const paidQty = Math.max(0, qty - freeQty);
    next.auto_add = 1;
    next.auto_add_group_id = Number(next?.auto_add_group_id || rule.group_id || 0) || null;
    next.auto_add_free_qty = Math.max(0, freeQty);
    next.auto_add_paid_qty = paidQty;
    next.unit_price_before_discount = unitPrice;
    next.unit_price = unitPrice;
    next.sum = roundPrice(unitPrice * paidQty);
    if (next.pricing && typeof next.pricing === "object") {
      next.pricing = {
        ...next.pricing,
        unit_before_discount: unitPrice,
        discount_amount: 0,
        discount: null,
      };
    }
    return next;
  }

  function isRightOrderAutoQtyEditable(item) {
    if (Number(item?.auto_add || 0) !== 1) return true;
    const rule = getRightAutoRuleByProductId(item?.product_id);
    const group = rule?.group || null;
    return Number(group?.allow_customer_qty ?? 1) === 1;
  }

  function markRightOrderAutoAddDismissedByCartItem(orderId, item) {
    if (Number(item?.auto_add || 0) !== 1) return;
    const pid = Number(item?.product_id || 0);
    if (!(pid > 0)) return;
    const rule = getRightAutoRuleByProductId(pid);
    const groupId = Number(item?.auto_add_group_id || rule?.group_id || 0);
    if (!(groupId > 0)) return;
    markRightAutoAddDismissed(orderId, groupId, pid);
  }

  function normalizeRightOrderCartItemsWithAutoAdd(orderId, cartItemsRaw) {
    const orderNum = Number(orderId || 0);
    const source = Array.isArray(cartItemsRaw) ? cartItemsRaw : [];
    let cartItems = source
      .map((item) => (item && typeof item === "object" ? recalculateCartItemTotals(item) : null))
      .filter((item) => item && Math.max(0, Number(item?.qty || 0)) > 0);

    const groups = Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [];
    const rules = Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [];
    if (!groups.length || !rules.length) {
      clearRightAutoAddDismissedIfCartEmpty(orderNum, cartItems);
      return cartItems.map((item) => applyRightAutoPricingToCartItem(item, null));
    }

    const hasBaseItems = cartItems.some((item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return false;
      if (String(item?.type || "") === "combo") return true;
      return Number(item?.auto_add || 0) !== 1;
    });

    if (!hasBaseItems) {
      cartItems = cartItems.filter((item) => {
        const qty = Math.max(0, Number(item?.qty || 0));
        if (!qty) return false;
        if (String(item?.type || "") === "combo") return true;
        return Number(item?.auto_add || 0) !== 1;
      });
      clearRightAutoAddDismissed(orderNum);
      return cartItems.map((item) => applyRightAutoPricingToCartItem(item, null));
    }

    const itemsByGroup = new Map();
    rules.forEach((rule) => {
      const gid = Number(rule?.group_id || 0);
      if (!(gid > 0)) return;
      if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
      itemsByGroup.get(gid).push(rule);
    });

    const totals = {
      nonAutoTotal: computeRightAutoNonAutoTotal(cartItems),
      autoEligibleTotal: computeRightAutoEligibleTotal(cartItems),
    };

    const sortedGroups = groups
      .slice()
      .sort((a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0) || Number(a?.id || 0) - Number(b?.id || 0));

    sortedGroups.forEach((group) => {
      const groupId = Number(group?.id || 0);
      if (!(groupId > 0)) return;
      const groupRules = (itemsByGroup.get(groupId) || []).slice().sort(
        (a, b) => (a?.sort_order ?? 0) - (b?.sort_order ?? 0) || Number(a?.id || 0) - Number(b?.id || 0)
      );
      if (!groupRules.length) return;

      const baseTotal = Number(group?.include_auto_in_total || 0) === 1 ? totals.autoEligibleTotal : totals.nonAutoTotal;
      const minAmount = group?.min_cart_amount != null ? Number(group.min_cart_amount) : null;
      const maxAmount = group?.max_cart_amount != null ? Number(group.max_cart_amount) : null;
      const eligible = (minAmount == null || baseTotal >= minAmount) && (maxAmount == null || baseTotal <= maxAmount);

      if (!eligible) {
        groupRules.forEach((rule) => {
          const pid = Number(rule?.product_id || 0);
          if (!(pid > 0)) return;
          cartItems = cartItems.filter((entry) => {
            const sameProduct = Number(entry?.product_id || 0) === pid;
            const isAuto = Number(entry?.auto_add || 0) === 1;
            return !(sameProduct && isAuto);
          });
        });
        return;
      }

      const allowQty = Number(group?.allow_customer_qty ?? 1) === 1;
      groupRules.forEach((rule) => {
        const pid = Number(rule?.product_id || 0);
        if (!(pid > 0)) return;
        const product = getProductById(pid);
        if (product && !isProductAvailableFlag(product)) return;

        const matching = cartItems.filter((entry) => String(entry?.type || "") !== "combo" && Number(entry?.product_id || 0) === pid);
        let selected = matching.find((entry) => Number(entry?.auto_add || 0) === 1) || null;
        if (!selected) selected = matching.find((entry) => isRightOrderPlainCartItem(entry)) || null;
        if (!selected && matching.length === 1) selected = matching[0] || null;

        const dismissed = isRightAutoAddDismissed(orderNum, groupId, pid);
        if (selected && dismissed) clearRightAutoAddDismissedEntry(orderNum, groupId, pid);
        if (!selected && dismissed) return;

        if (selected && Number(selected?.auto_add || 0) !== 1) {
          selected.auto_add = 1;
          selected.auto_add_group_id = groupId;
        } else if (selected && Number(selected?.auto_add_group_id || 0) !== groupId) {
          selected.auto_add_group_id = groupId;
        }

        if (matching.length > 1 && selected) {
          const removable = new Set();
          matching.forEach((candidate) => {
            if (candidate === selected) return;
            if (Number(candidate?.auto_add || 0) === 1 || isRightOrderPlainCartItem(candidate)) {
              removable.add(candidate);
            }
          });
          if (removable.size) {
            cartItems = cartItems.filter((candidate) => !removable.has(candidate));
          }
        }

        const minQty = Math.max(0, Number(rule?.min_qty || 0));
        const defaultQty = Math.max(0, Number(rule?.default_qty || 0));
        const maxQty = rule?.max_qty != null ? Math.max(0, Number(rule.max_qty)) : null;
        const desiredQty = Math.max(minQty, defaultQty);

        if (!selected && desiredQty > 0) {
          const created = buildPlainAutoAddCartItem(pid, desiredQty);
          if (created) {
            created.auto_add = 1;
            created.auto_add_group_id = groupId;
            cartItems.push(created);
            selected = created;
          }
        }

        if (!selected) return;

        let nextQty = Math.max(0, Number(selected?.qty || 0));
        if (!allowQty) {
          nextQty = desiredQty;
        } else {
          if (minQty > 0 && nextQty < minQty) nextQty = minQty;
          if (maxQty != null && nextQty > maxQty) nextQty = maxQty;
        }
        if (maxQty != null && nextQty > maxQty) nextQty = maxQty;

        selected.qty = nextQty;
        if (nextQty <= 0) {
          cartItems = cartItems.filter((entry) => entry !== selected);
        }
      });

      const maxGroupQty = group?.max_items_qty != null ? Number(group.max_items_qty) : null;
      if (maxGroupQty != null && Number.isFinite(maxGroupQty)) {
        const groupItems = groupRules.map((rule) => {
          const pid = Number(rule?.product_id || 0);
          if (!(pid > 0)) return null;
          const item = cartItems.find((entry) => Number(entry?.product_id || 0) === pid && Number(entry?.auto_add || 0) === 1);
          if (!item) return null;
          return { rule, item };
        }).filter(Boolean);

        const totalQty = groupItems.reduce((sum, entry) => sum + Math.max(0, Number(entry?.item?.qty || 0)), 0);
        let overflow = totalQty - maxGroupQty;
        if (overflow > 0) {
          const sortedItems = groupItems.slice().sort((a, b) => {
            const aSort = a?.rule?.sort_order ?? 0;
            const bSort = b?.rule?.sort_order ?? 0;
            return bSort - aSort || Number(b?.rule?.id || 0) - Number(a?.rule?.id || 0);
          });
          sortedItems.forEach((entry) => {
            if (overflow <= 0) return;
            const minQty = Math.max(0, Number(entry?.rule?.min_qty || 0));
            const currentQty = Math.max(0, Number(entry?.item?.qty || 0));
            const reducible = Math.max(0, currentQty - minQty);
            if (reducible <= 0) return;
            const reduceBy = Math.min(reducible, overflow);
            const nextQty = currentQty - reduceBy;
            entry.item.qty = nextQty;
            overflow -= reduceBy;
            if (nextQty <= 0 && minQty <= 0 && Number(entry?.rule?.default_qty || 0) <= 0) {
              cartItems = cartItems.filter((candidate) => candidate !== entry.item);
            }
          });
        }
      }
    });

    cartItems = cartItems
      .map((item) => recalculateCartItemTotals(item))
      .filter((item) => item && Math.max(0, Number(item?.qty || 0)) > 0);

    const totalsAfter = {
      nonAutoTotal: computeRightAutoNonAutoTotal(cartItems),
      autoEligibleTotal: computeRightAutoEligibleTotal(cartItems),
    };
    cartItems = cartItems.map((item) => applyRightAutoPricingToCartItem(item, totalsAfter));
    cartItems = cartItems
      .map((item, index) => ({
        item,
        index,
        autoRank: isRightOrderAutoAddItem(item) ? 1 : 0,
      }))
      .sort((a, b) => a.autoRank - b.autoRank || a.index - b.index)
      .map((entry) => entry.item);
    clearRightAutoAddDismissedIfCartEmpty(orderNum, cartItems);
    return cartItems;
  }

  function updateRightOrderCartItems(orderId, cartItems, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    const index = getRightOrderIndexById(id);
    if (index < 0) return false;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    form.cartItems = normalizeRightOrderCartItemsWithAutoAdd(id, cartItems);
    state.rightOrders[index] = { ...order, form };
    if (opts?.render) renderRightOrderTabs();
    return true;
  }

  function getRightOrderCheckoutSummary(order) {
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const cartItems = Array.isArray(form?.cartItems) ? form.cartItems : [];
    const subtotal = roundPrice(cartItems.reduce((sum, item) => sum + getRightOrderCartLineTotal(item), 0));
    const cartItemsCount = cartItems.reduce((sum, item) => sum + Math.max(1, Number(item?.qty || 1)), 0);
    const customerDiscountSummary = getRightOrderCustomerDiscountSummary(order, subtotal);
    const customerOrderDiscount = roundPrice(Number(customerDiscountSummary?.amount || 0));
    const subtotalAfterCustomerDiscount = roundPrice(Math.max(0, subtotal - customerOrderDiscount));
    const methodCode = String(form?.pickupMethod || "").trim();
    const isDeliveryMethod = isDeliveryMethodCode(methodCode);
    const settings = state.rightDeliverySettings && typeof state.rightDeliverySettings === "object"
      ? state.rightDeliverySettings
      : null;
    const deliveryCost = Math.max(0, Number(settings?.delivery_cost || 0));
    const freeDeliveryFromRaw = Number(settings?.free_delivery_from);
    const freeDeliveryFrom = Number.isFinite(freeDeliveryFromRaw) && freeDeliveryFromRaw > 0 ? freeDeliveryFromRaw : null;
    const deliveryApplied = isDeliveryMethod
      ? (freeDeliveryFrom != null && subtotalAfterCustomerDiscount >= freeDeliveryFrom ? 0 : deliveryCost)
      : 0;
    const payableTotal = roundPrice(subtotalAfterCustomerDiscount + deliveryApplied);
    const progress = freeDeliveryFrom != null && freeDeliveryFrom > 0
      ? Math.max(0, Math.min(100, (subtotalAfterCustomerDiscount / freeDeliveryFrom) * 100))
      : 0;
    const freeReached = freeDeliveryFrom != null && subtotalAfterCustomerDiscount >= freeDeliveryFrom;
    const leftForFree = freeDeliveryFrom != null ? Math.max(0, Math.ceil(freeDeliveryFrom - subtotalAfterCustomerDiscount)) : 0;
    const showDeliveryProgress = isDeliveryMethod && freeDeliveryFrom != null && freeDeliveryFrom > 0 && cartItems.length > 0;
    return {
      cartItems,
      cartItemsCount,
      subtotal,
      subtotalAfterCustomerDiscount,
      customerOrderDiscount,
      customerOrderDiscountTitles: Array.isArray(customerDiscountSummary?.titles) ? customerDiscountSummary.titles : [],
      customerOrderAppliedDiscounts: Array.isArray(customerDiscountSummary?.appliedDiscounts) ? customerDiscountSummary.appliedDiscounts : [],
      deliveryCost,
      deliveryApplied,
      freeDeliveryFrom,
      freeReached,
      leftForFree,
      progress,
      showDeliveryProgress,
      payableTotal,
      isDeliveryMethod,
      methodCode,
      settings,
    };
  }

  function getRightOrderPaymentIconClass(code) {
    const raw = String(code || "").trim().toLowerCase();
    if (!raw) return "fa-credit-card";
    if (raw.includes("cash") || raw.includes("\u043d\u0430\u043b")) return "fa-money-bill-wave";
    if (raw.includes("online") || raw.includes("\u043e\u043d\u043b\u0430\u0439\u043d")) return "fa-globe";
    if (raw.includes("card") || raw.includes("qr") || raw.includes("\u043a\u0430\u0440\u0442")) return "fa-credit-card";
    return "fa-credit-card";
  }

  function isRightOrderAutoAddItem(item) {
    if (Number(item?.auto_add || 0) === 1) return true;
    const name = String(item?.name || item?.product_name || "").trim().toLowerCase();
    return name === "\u043f\u0440\u0438\u0431\u043e\u0440\u044b";
  }

  function getRightOrderAutoFreeQty(item) {
    if (!isRightOrderAutoAddItem(item)) return 0;
    const explicitFree = Number(item?.auto_add_free_qty);
    if (Number.isFinite(explicitFree) && explicitFree > 0) return explicitFree;
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    const paidQty = Number(item?.auto_add_paid_qty);
    if (Number.isFinite(paidQty)) {
      return Math.max(0, qty - Math.max(0, paidQty));
    }
    const lineTotal = getRightOrderCartLineTotal(item);
    return Math.abs(lineTotal) < 0.000001 ? qty : 0;
  }

  function getRightOrderCartLineTotal(item) {
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    const unitPrice = Number(item?.unit_price || item?.price || 0);
    if (isRightOrderAutoAddItem(item)) {
      const paidQtyRaw = Number(item?.auto_add_paid_qty);
      if (Number.isFinite(paidQtyRaw)) {
        const paidQty = Math.max(0, Math.min(qty, paidQtyRaw));
        return roundPrice(unitPrice * paidQty);
      }
      const freeQtyRaw = Number(item?.auto_add_free_qty);
      if (Number.isFinite(freeQtyRaw)) {
        const paidQty = Math.max(0, qty - Math.max(0, freeQtyRaw));
        return roundPrice(unitPrice * paidQty);
      }
    }
    const lineTotal = Number(item?.sum ?? item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(lineTotal)) return roundPrice(lineTotal);
    return roundPrice(unitPrice * qty);
  }

  function buildRightOrderDiscountSummaryFromCart(cartItems, subtotal, opts = {}) {
    const source = Array.isArray(cartItems) ? cartItems : [];
    const subtotalAfterDiscount = roundPrice(Number(subtotal || 0));
    const customerOrderDiscount = roundPrice(Math.max(0, Number(opts?.customerOrderDiscount || 0)));
    const orderDiscountTitles = Array.isArray(opts?.orderDiscountTitles)
      ? opts.orderDiscountTitles.map((x) => String(x || "").trim()).filter(Boolean)
      : [];

    let comboDiscount = 0;
    let productDiscount = 0;
    source.forEach((item) => {
      const lineTotal = getRightOrderCartLineTotal(item);
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const oldLineTotalRaw = Number(item?.old_line_total || item?.discount?.original_line_total || 0);
      const oldUnitPrice = Number(item?.unit_price_before_discount || item?.old_price || 0);
      const oldLineFromUnit = oldUnitPrice > 0 ? roundPrice(oldUnitPrice * qty) : 0;

      let originalLineTotal = lineTotal;
      if (oldLineTotalRaw > originalLineTotal) originalLineTotal = roundPrice(oldLineTotalRaw);
      if (oldLineFromUnit > originalLineTotal) originalLineTotal = oldLineFromUnit;

      const lineDiscount = roundPrice(Math.max(0, originalLineTotal - lineTotal));
      if (!(lineDiscount > 0)) return;

      if (String(item?.type || "") === "combo") {
        comboDiscount += lineDiscount;
      } else if (isRightOrderAutoAddItem(item)) {
        return;
      } else {
        productDiscount += lineDiscount;
      }
    });

    comboDiscount = roundPrice(comboDiscount);
    productDiscount = roundPrice(productDiscount);

    const totalDiscount = roundPrice(comboDiscount + productDiscount + customerOrderDiscount);
    const subtotalBeforeDiscount = roundPrice(Math.max(0, subtotalAfterDiscount + totalDiscount));

    const breakdown = [
      { title: "\u041a\u043e\u043c\u0431\u043e", amount: comboDiscount },
      { title: "\u0422\u043e\u0432\u0430\u0440\u043d\u044b\u0435 \u0441\u043a\u0438\u0434\u043a\u0438", amount: productDiscount },
      { title: "\u041a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0430\u044f \u0441\u043a\u0438\u0434\u043a\u0430", amount: customerOrderDiscount },
    ].filter((entry) => Number(entry.amount || 0) > 0);

    return {
      subtotalBeforeDiscount,
      totalDiscount,
      breakdown,
      orderDiscountTitles,
    };
  }

  function renderRightOrderDiscountBreakdownHtml(summary) {
    if (!summary) return "";
    const rows = Array.isArray(summary?.breakdown) ? summary.breakdown : [];
    let html = "";
    rows.forEach((entry) => {
      html += `<div class="order-summary-discount-breakdown-row">`;
      html += `<span class="order-summary-discount-breakdown-label">${escapeHtml(String(entry?.title || "\u0421\u043a\u0438\u0434\u043a\u0430"))}</span>`;
      html += `<span class="order-summary-discount-breakdown-value">-${escapeHtml(toMoney(Number(entry?.amount || 0)))}</span>`;
      html += `</div>`;
    });
    const titles = Array.isArray(summary?.orderDiscountTitles) ? summary.orderDiscountTitles : [];
    if (titles.length > 0) {
      html += `<div class="order-summary-discount-breakdown-note">\u0421\u043a\u0438\u0434\u043a\u0430 \u043a\u043b\u0438\u0435\u043d\u0442\u0430: ${escapeHtml(titles.join(", "))}</div>`;
    }
    return html;
  }

  function resolveRightOrderChangeFrom(form, paymentCode) {
    if (!isCashPaymentCode(paymentCode)) return 0;
    const changeType = String(form?.changeType || "no_change").trim();
    if (changeType === "no_change") return 0;
    if (changeType === "other") {
      const numeric = Number(String(form?.changeAmount || "").replace(/[^\d]/g, ""));
      return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }
    const numeric = Number(String(changeType).replace(/[^\d]/g, ""));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }

  function buildRightOrderSummaryCardHtml(order, cartSummary, paymentLabel, paymentCode) {
    const orderId = Number(order?.id || 0);
    const cartItems = Array.isArray(cartSummary?.cartItems) ? cartSummary.cartItems : [];
    if (!cartItems.length) return "";

    const discountSummary = buildRightOrderDiscountSummaryFromCart(cartItems, cartSummary?.subtotalAfterCustomerDiscount, {
      customerOrderDiscount: cartSummary?.customerOrderDiscount,
      orderDiscountTitles: cartSummary?.customerOrderDiscountTitles,
    });
    const discountAmount = roundPrice(Number(discountSummary?.totalDiscount || 0));
    const hasDiscount = discountAmount > 0;
    const breakdownRows = Array.isArray(discountSummary?.breakdown) ? discountSummary.breakdown : [];
    const breakdownTitles = Array.isArray(discountSummary?.orderDiscountTitles) ? discountSummary.orderDiscountTitles : [];
    const hasBreakdown = hasDiscount && (breakdownRows.length > 0 || breakdownTitles.length > 0);
    const isBreakdownOpen = hasBreakdown && state.rightDiscountBreakdownOpenByOrder.get(orderId) === true;
    if (!hasBreakdown && orderId > 0) state.rightDiscountBreakdownOpenByOrder.delete(orderId);

    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const changeFrom = resolveRightOrderChangeFrom(form, paymentCode);
    const showChange = changeFrom > 0;
    const total = roundPrice(Number(cartSummary?.payableTotal || 0));
    const changeAmount = showChange ? roundPrice(Math.max(0, changeFrom - total)) : 0;
    const showDeliveryRow = Boolean(cartSummary?.isDeliveryMethod);
    const deliveryCost = roundPrice(Number(cartSummary?.deliveryApplied || 0));
    const payTitle = String(paymentLabel || "").trim() || "\u2014";
    const payIconClass = getRightOrderPaymentIconClass(paymentCode);

    return `
      <div class="info-card order-summary">
        <div class="order-summary-title">\u0421\u0443\u043c\u043c\u044b:</div>
        <div class="order-summary-row">
          <span class="order-summary-label">\u041e\u043f\u043b\u0430\u0442\u0430</span>
          <span class="order-summary-value">
            <span class="order-summary-pay-icon"><i class="fas ${escapeHtml(payIconClass)}"></i></span>
            <span>${escapeHtml(payTitle)}</span>
          </span>
        </div>
        <div class="order-summary-row ${showChange ? "" : "hidden"}">
          <span class="order-summary-label">\u0421\u0434\u0430\u0447\u0430 \u0441</span>
          <span class="order-summary-value">${escapeHtml(toMoney(changeFrom))}</span>
        </div>
        <div class="order-summary-row ${showChange ? "" : "hidden"}">
          <span class="order-summary-label">\u0421\u0434\u0430\u0447\u0430</span>
          <span class="order-summary-value">${escapeHtml(toMoney(changeAmount))}</span>
        </div>
        <div class="order-summary-row ${hasDiscount ? "" : "hidden"}">
          <span class="order-summary-label">\u0421\u0443\u043c\u043c\u0430 \u0442\u043e\u0432\u0430\u0440\u043e\u0432</span>
          <span class="order-summary-value">${escapeHtml(toMoney(Number(discountSummary?.subtotalBeforeDiscount || 0)))}</span>
        </div>
        <div class="order-summary-row ${hasDiscount ? "" : "hidden"}">
          <span class="order-summary-discount-label-wrap">
            <span class="order-summary-label">\u0421\u043a\u0438\u0434\u043a\u0430</span>
            <button
              class="order-summary-discount-info-btn ${hasBreakdown ? "" : "hidden"}"
              type="button"
              data-action="right-order-discount-toggle"
              data-order-id="${orderId}"
              aria-label="\u041f\u043e\u043a\u0430\u0437\u0430\u0442\u044c \u0440\u0430\u0441\u0448\u0438\u0444\u0440\u043e\u0432\u043a\u0443 \u0441\u043a\u0438\u0434\u043a\u0438"
              aria-expanded="${isBreakdownOpen ? "true" : "false"}"
            >
              <i class="fas fa-info"></i>
            </button>
          </span>
          <span class="order-summary-value order-summary-discount">-${escapeHtml(toMoney(discountAmount))}</span>
        </div>
        <div
          class="order-summary-discount-breakdown ${hasBreakdown && isBreakdownOpen ? "is-open" : "hidden"}"
          data-right-discount-breakdown="1"
          aria-hidden="${hasBreakdown && isBreakdownOpen ? "false" : "true"}"
        >${hasBreakdown ? renderRightOrderDiscountBreakdownHtml(discountSummary) : ""}</div>
        <div class="order-summary-row ${showDeliveryRow ? "" : "hidden"}">
          <span class="order-summary-label">\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430</span>
          <span class="order-summary-value">${escapeHtml(toMoney(deliveryCost))}</span>
        </div>
        <div class="order-summary-divider"></div>
        <div class="order-summary-total-row">
          <span class="order-summary-total-label">\u0418\u0422\u041e\u0413\u041e</span>
          <span class="order-summary-total-value">${escapeHtml(toMoney(total))}</span>
        </div>
      </div>
    `;
  }

  function getRightOrderCheckoutSummaryByOrderId(orderId) {
    const id = Number(orderId || 0);
    const order = (Array.isArray(state.rightOrders) ? state.rightOrders : []).find((x) => Number(x?.id || 0) === id) || null;
    if (!order) {
      return {
        cartItems: [],
        cartItemsCount: 0,
        subtotal: 0,
        subtotalAfterCustomerDiscount: 0,
        customerOrderDiscount: 0,
        customerOrderDiscountTitles: [],
        customerOrderAppliedDiscounts: [],
        deliveryCost: 0,
        deliveryApplied: 0,
        freeDeliveryFrom: null,
        freeReached: false,
        leftForFree: 0,
        progress: 0,
        showDeliveryProgress: false,
        payableTotal: 0,
        isDeliveryMethod: true,
        methodCode: "delivery",
        settings: state.rightDeliverySettings || null,
      };
    }
    return getRightOrderCheckoutSummary(order);
  }

  function getRightOrderIndexById(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return -1;
    return (Array.isArray(state.rightOrders) ? state.rightOrders : []).findIndex((order) => Number(order?.id || 0) === id);
  }

  function resetRightCartClearState(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const timer = state.rightCartClearTimerByOrder.get(id);
    if (timer) clearTimeout(timer);
    state.rightCartClearTimerByOrder.delete(id);
    state.rightCartClearConfirmUntilByOrder.delete(id);
    if (opts?.render) renderRightOrderTabs();
  }

  function resetAllRightCartClearState(opts = {}) {
    const keys = Array.from(state.rightCartClearConfirmUntilByOrder.keys());
    keys.forEach((key) => resetRightCartClearState(Number(key || 0), { render: false }));
    if (opts?.render) renderRightOrderTabs();
  }

  function armRightCartClearState(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    resetRightCartClearState(id, { render: false });
    const ttlMs = 6500;
    const until = Date.now() + ttlMs;
    state.rightCartClearConfirmUntilByOrder.set(id, until);
    const timer = setTimeout(() => {
      resetRightCartClearState(id, { render: true });
    }, ttlMs + 10);
    state.rightCartClearTimerByOrder.set(id, timer);
  }

  function mapCartItemIngredientsForPayload(ingredients) {
    return (Array.isArray(ingredients) ? ingredients : [])
      .map((row) => ({
        ingredient_id: Number(row?.ingredient_id || 0),
        qty: Number(row?.qty ?? row?.quantity ?? 0),
      }))
      .filter((row) => row.ingredient_id > 0 && Number.isFinite(row.qty) && row.qty >= 0);
  }

  function resolveOptionItemVariantGroupId(groupId, itemId) {
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!(gid > 0) || !(iid > 0)) return null;
    const details = state.optionGroupDetails.get(gid);
    const items = Array.isArray(details?.items) ? details.items : [];
    const detailItem = items.find((x) => Number(x?.id || 0) === iid) || null;
    if (!detailItem) return null;
    const variants = Array.isArray(detailItem?.variants) ? detailItem.variants : [];
    const vg = variants[0] || null;
    const vgId = Number(vg?.id || vg?.variant_group_id || 0);
    return vgId > 0 ? vgId : null;
  }

  function getCartItemVariantGroupId(item) {
    const directId = Number(item?.variant_group_id || item?.pricing?.variant_group_id || item?.pricing?.variant_group?.id || 0);
    if (directId > 0) return directId;
    const productId = Number(item?.product_id || 0);
    if (!(productId > 0)) return null;
    const groups = state.productVariants.get(productId) || [];
    const vg = Array.isArray(groups) ? groups[0] : null;
    const vgId = Number(vg?.id || vg?.variant_group_id || 0);
    return vgId > 0 ? vgId : null;
  }

  function buildRightOrderPayloadItems(cartItems) {
    const source = Array.isArray(cartItems) ? cartItems : [];
    const out = [];

    source.forEach((item) => {
      const type = String(item?.type || "product");
      const qty = Math.max(1, Number(item?.qty || 1));
      if (type === "combo") {
        const comboId = Number(item?.combo_id || 0);
        const lineTotal = roundPrice(Number(item?.sum || Number(item?.unit_price || 0) * qty));
        const oldLineTotalRaw = roundPrice(Number(item?.unit_price_before_discount || 0) * qty);
        const oldLineTotal = oldLineTotalRaw > lineTotal ? oldLineTotalRaw : 0;
        const seedSelections = getComboSeedSelectionsFromCartItem(item);
        if (!(comboId > 0) && !seedSelections.length) return;
        const selections = seedSelections.map((row) => ({
          product_id: Number(row?.product_id || 0),
          product_name: String(row?.product_name || ""),
          product_photo: String(row?.product_photo || ""),
          variant_label: String(row?.variant_label || ""),
          variant_group_title: String(row?.variant_group_title || ""),
          variant_unit: String(row?.variant_unit || ""),
          variant_value_index: row?.variant_value_index != null ? Number(row.variant_value_index) : null,
          variant_group_id: row?.variant_group_id != null ? Number(row.variant_group_id) : null,
          ingredients_display: Array.isArray(row?.ingredients_display)
            ? row.ingredients_display.map((ing) => ({
              ingredient_id: ing?.ingredient_id != null ? Number(ing.ingredient_id) : null,
              product_id: ing?.product_id != null ? Number(ing.product_id) : null,
              quantity: ing?.quantity != null ? Number(ing.quantity) : (ing?.qty != null ? Number(ing.qty) : null),
              qty: ing?.qty != null ? Number(ing.qty) : (ing?.quantity != null ? Number(ing.quantity) : null),
              unit: String(ing?.unit || ""),
              unit_id: ing?.unit_id != null ? Number(ing.unit_id) : null,
              name: String(ing?.name || ""),
            }))
            : [],
          unit_price_override: row?.unit_price_override != null ? Number(row.unit_price_override) : null,
        })).filter((row) => Number(row.product_id || 0) > 0);

        const comboPayload = {
          type: "combo",
          combo_title: String(item?.combo_title || item?.name || "РљРѕРјР±Рѕ"),
          qty,
          line_total: lineTotal,
          old_line_total: oldLineTotal,
          selections,
        };
        if (comboId > 0) comboPayload.combo_id = comboId;
        out.push(comboPayload);
        return;
      }

      const productId = Number(item?.product_id || 0);
      if (!(productId > 0)) return;
      const lineTotal = getRightOrderCartLineTotal(item);
      const originalLineTotal = roundPrice(Number(item?.unit_price_before_discount || item?.unit_price || 0) * qty);
      const optionItemsSource = Array.isArray(item?.option_items) ? item.option_items : [];
      const optionItems = optionItemsSource
        .map((opt) => {
          const optionId = Number(opt?.id || 0);
          const optionQty = Math.max(0, Number(opt?.qty || 0));
          if (!(optionId > 0) || !(optionQty > 0)) return null;
          const groupId = Number(opt?.group_id || 0);
          const variantValueIndex = Number.isFinite(Number(opt?.variantIndex)) ? Number(opt.variantIndex) : null;
          const variantGroupId = resolveOptionItemVariantGroupId(groupId, optionId);
          return {
            id: optionId,
            group_id: groupId > 0 ? groupId : null,
            qty: optionQty,
            variant_group_id: variantGroupId,
            variant_value_index: variantValueIndex,
          };
        })
        .filter(Boolean);
      const optionItemIds = optionItems.map((opt) => Number(opt.id)).filter((id) => id > 0);
      const variantGroupId = getCartItemVariantGroupId(item);
      const variantValueIndex = Number.isFinite(Number(item?.variant?.selected_index))
        ? Number(item.variant.selected_index)
        : null;
      out.push({
        product_id: productId,
        qty,
        option_item_ids: optionItemIds,
        option_items: optionItems,
        ingredients: mapCartItemIngredientsForPayload(item?.ingredients),
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: String(item?.variant?.label || "").trim() || null,
        auto_add: Number(item?.auto_add || 0) === 1 ? 1 : 0,
        auto_add_group_id: Number(item?.auto_add_group_id || 0) > 0 ? Number(item.auto_add_group_id) : null,
        line_total: lineTotal,
        original_line_total: originalLineTotal,
      });
    });

    return out;
  }

  let rightCheckoutSendingOverlay = null;

  function ensureRightCheckoutSendingOverlay() {
    if (rightCheckoutSendingOverlay && rightCheckoutSendingOverlay.isConnected) return rightCheckoutSendingOverlay;
    const overlay = document.createElement("div");
    overlay.className = "shop-checkout-sending-overlay hidden";
    overlay.innerHTML = `
      <div class="shop-checkout-sending-card">
        <div class="shop-checkout-sending-spinner" aria-hidden="true"></div>
        <div class="shop-checkout-sending-text">\u041f\u043e\u0434\u043e\u0436\u0434\u0438\u0442\u0435, \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u0437\u0430\u043a\u0430\u0437...</div>
      </div>
    `;
    document.body.appendChild(overlay);
    rightCheckoutSendingOverlay = overlay;
    return overlay;
  }

  function setRightCheckoutSendingOverlayVisible(visible) {
    const overlay = ensureRightCheckoutSendingOverlay();
    overlay.classList.toggle("hidden", !visible);
  }

  let newOrderAlertOverlay = null;
  let newOrderAlertTextEl = null;
  let newOrderAlertHideTimer = null;

  function ensureNewOrderAlertStyles() {
    const styleId = "newOrderInlineAlertStyles";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .new-order-alert-overlay{
        position:fixed;
        inset:0;
        z-index:12050;
        display:flex;
        align-items:flex-start;
        justify-content:center;
        padding:84px 12px 12px;
        background:rgba(15,23,42,.18);
        opacity:0;
        pointer-events:none;
        transition:opacity .18s ease;
      }
      .new-order-alert-overlay.hidden{display:none;}
      .new-order-alert-overlay.is-visible{
        opacity:1;
        pointer-events:auto;
      }
      .new-order-alert-card{
        position:relative;
        width:min(560px, calc(100vw - 24px));
        background:#fff;
        border-radius:16px;
        box-shadow:0 20px 48px rgba(15,23,42,.22);
        padding:18px 20px 16px;
        display:grid;
        gap:14px;
      }
      .new-order-alert-close{
        position:absolute;
        top:10px;
        right:10px;
        width:24px;
        height:24px;
        border:none;
        border-radius:999px;
        background:transparent;
        color:#9ca3af;
        font-size:18px;
        line-height:1;
        cursor:pointer;
      }
      .new-order-alert-text{
        color:#0f172a;
        font-size:27px;
        line-height:1.4;
        text-align:center;
        white-space:pre-wrap;
      }
      .new-order-alert-actions{
        display:flex;
        justify-content:center;
      }
      .new-order-alert-btn{
        min-width:80px;
        height:34px;
        border:none;
        border-radius:999px;
        padding:0 24px;
        background:#f97316;
        color:#fff;
        font-weight:800;
        font-size:17px;
        cursor:pointer;
      }
      .new-order-alert-btn:hover{filter:brightness(.95);}
      @media (max-width: 768px){
        .new-order-alert-overlay{padding-top:72px;}
        .new-order-alert-card{border-radius:14px;}
      }
    `;
    document.head.appendChild(style);
  }

  function hideNewOrderAlert() {
    const overlay = newOrderAlertOverlay;
    if (!overlay) return;
    if (newOrderAlertHideTimer) {
      clearTimeout(newOrderAlertHideTimer);
      newOrderAlertHideTimer = null;
    }
    overlay.classList.remove("is-visible");
    newOrderAlertHideTimer = window.setTimeout(() => {
      overlay.classList.add("hidden");
      newOrderAlertHideTimer = null;
    }, 180);
  }

  function ensureNewOrderAlert() {
    if (newOrderAlertOverlay && newOrderAlertOverlay.isConnected) return newOrderAlertOverlay;
    ensureNewOrderAlertStyles();
    const overlay = document.createElement("div");
    overlay.className = "new-order-alert-overlay hidden";
    overlay.innerHTML = `
      <div class="new-order-alert-card" role="dialog" aria-modal="true" aria-live="polite">
        <button type="button" class="new-order-alert-close" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c">\u00D7</button>
        <div class="new-order-alert-text"></div>
        <div class="new-order-alert-actions">
          <button type="button" class="new-order-alert-btn">\u0414\u0430</button>
        </div>
      </div>
    `;
    const closeBtn = overlay.querySelector(".new-order-alert-close");
    const actionBtn = overlay.querySelector(".new-order-alert-btn");
    newOrderAlertTextEl = overlay.querySelector(".new-order-alert-text");
    if (closeBtn) {
      closeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        hideNewOrderAlert();
      });
    }
    if (actionBtn) {
      actionBtn.addEventListener("click", (event) => {
        event.preventDefault();
        hideNewOrderAlert();
      });
    }
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) hideNewOrderAlert();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && newOrderAlertOverlay && !newOrderAlertOverlay.classList.contains("hidden")) {
        hideNewOrderAlert();
      }
    });
    document.body.appendChild(overlay);
    newOrderAlertOverlay = overlay;
    return overlay;
  }

  function showNewOrderAlert(message) {
    const overlay = ensureNewOrderAlert();
    if (!overlay) return;
    if (newOrderAlertHideTimer) {
      clearTimeout(newOrderAlertHideTimer);
      newOrderAlertHideTimer = null;
    }
    if (newOrderAlertTextEl) {
      newOrderAlertTextEl.textContent = String(message || "");
    }
    overlay.classList.remove("hidden");
    requestAnimationFrame(() => {
      overlay.classList.add("is-visible");
    });
  }

  function clearRightOrderCart(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    if (!updateRightOrderCartItems(id, [], { render: false })) return false;
    clearRightAutoAddDismissed(id);
    resetRightCartClearState(id, { render: false });
    return true;
  }

  function formatRightPaymentModalDateTime(value) {
    const raw = String(value || "").trim();
    const resolved = raw ? new Date(raw.replace(" ", "T")) : new Date();
    const date = Number.isNaN(resolved.getTime()) ? new Date() : resolved;
    return date.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function buildRightPaymentModalOrder(order, summary) {
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const phoneDigits = normalizePhoneRu(form.phone);
    const activePaymentTypes = (Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const rawPaymentCode = String(form.paymentMethod || "").trim();
    const paymentCode = String(
      (activePaymentTypes.find((item) => String(item?.code || "").trim() === rawPaymentCode) || activePaymentTypes[0] || {}).code
      || rawPaymentCode
      || "cash"
    ).trim();
    const paymentTitle = String(
      (activePaymentTypes.find((item) => String(item?.code || "").trim() === paymentCode) || {}).title
      || paymentCode
      || ""
    ).trim();
    let changeFrom = null;
    if (isCashPaymentCode(paymentCode)) {
      const changeType = String(form.changeType || "no_change").trim();
      if (changeType === "other") {
        const numeric = Number(String(form.changeAmount || "").replace(/[^\d]/g, ""));
        changeFrom = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      } else if (changeType !== "no_change") {
        const numeric = Number(String(changeType).replace(/[^\d]/g, ""));
        changeFrom = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
      }
    }
    return {
      id: 0,
      public_id: "",
      order_heading: String(order?.title || "").trim() || "Новый заказ",
      created_at: new Date().toISOString().slice(0, 19).replace("T", " "),
      customer_name: String(form.name || "").trim() || "Клиент",
      customer_phone: phoneDigits.length === 11 ? `+${phoneDigits}` : "—",
      total_price: Number(summary?.payableTotal || 0) || 0,
      payment_code: paymentCode,
      payment_title: paymentTitle,
      change_from: changeFrom,
      is_paid: 0,
    };
  }

  function syncRightOrderFormPayment(orderId, paymentPayload) {
    const id = Number(orderId || 0);
    if (!(id > 0) || !paymentPayload || typeof paymentPayload !== "object") return;
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const paymentCode = String(paymentPayload.payment_code || form.paymentMethod || "").trim();
    const changeFrom = Number(paymentPayload.change_from || 0);
    form.paymentMethod = paymentCode || form.paymentMethod || "cash";
    if (!isCashPaymentCode(paymentCode)) {
      form.changeType = "no_change";
      form.changeAmount = "";
    } else if (changeFrom > 0) {
      const serialized = String(Math.round(changeFrom));
      if (["500", "1000", "2000", "5000"].includes(serialized) && Number(serialized) === Number(changeFrom)) {
        form.changeType = serialized;
        form.changeAmount = "";
      } else {
        form.changeType = "other";
        form.changeAmount = serialized;
      }
    } else {
      form.changeType = "no_change";
      form.changeAmount = "";
    }
    state.rightOrders[index] = { ...order, form };
  }

  async function openRightOrderPaymentDraft(order) {
    if (!sharedOrderPayment || typeof sharedOrderPayment.open !== "function") {
      showNewOrderAlert("Не удалось открыть модалку оплаты");
      return null;
    }
    const summary = getRightOrderCheckoutSummary(order);
    return sharedOrderPayment.open({
      order: buildRightPaymentModalOrder(order, summary),
      apiJson,
      money: toMoney,
      formatDateTimeNumeric: formatRightPaymentModalDateTime,
      collectPayloadOnly: true,
      getOrderId: () => 0,
      isPaidOrder: () => false,
      onError: (err) => {
        console.error("new-order payment modal error:", err);
      },
    });
  }

  async function submitRightOrder(orderId, options = {}) {
    const withPayment = options?.withPayment === true;
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    if (state.rightCheckoutSubmittingByOrder.get(id)) return;
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    let order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    form.cartItems = normalizeRightOrderCartItemsWithAutoAdd(id, Array.isArray(form.cartItems) ? form.cartItems : []);
    state.rightOrders[index] = { ...order, form };
    order = state.rightOrders[index] || order;
    const submitMode = String(order?.mode || "add").toLowerCase();
    const editOrderId = Number(order?.editOrderId || 0);
    const isEditSubmit = submitMode === "edit" && editOrderId > 0;
    const summary = getRightOrderCheckoutSummary(order);
    const cartItems = Array.isArray(form.cartItems) ? form.cartItems : [];
    if (!cartItems.length) {
      showNewOrderAlert("\u041a\u043e\u0440\u0437\u0438\u043d\u0430 \u043f\u0443\u0441\u0442\u0430");
      return;
    }

    const phoneDigits = normalizePhoneRu(form.phone);
    const activeDeliveryTypes = (Array.isArray(state.rightDeliveryTypes) ? state.rightDeliveryTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const deliveryMethodOptions = activeDeliveryTypes.map((item) => String(item?.code || "")).filter(Boolean);
    const fallbackDeliveryMethod = String((activeDeliveryTypes.find((item) => Number(item?.is_default || 0) === 1) || activeDeliveryTypes[0] || {}).code || "delivery");
    const rawMethodCode = String(form.pickupMethod || "").trim();
    const methodCode = deliveryMethodOptions.includes(rawMethodCode) ? rawMethodCode : fallbackDeliveryMethod;
    const methodMeta = activeDeliveryTypes.find((item) => String(item?.code || "") === methodCode) || null;
    const requireClientData = Number(methodMeta?.require_client_data ?? 1) !== 0;
    const hasPhoneValue = phoneDigits.length > 1;
    if (requireClientData && phoneDigits.length !== 11) {
      showNewOrderAlert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430");
      return;
    }
    if (!requireClientData && hasPhoneValue && phoneDigits.length !== 11) {
      showNewOrderAlert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u043d\u043e\u043c\u0435\u0440 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430");
      return;
    }

    const customerNameRaw = String(form.name || "").trim();
    const customerName = customerNameRaw || (requireClientData ? "\u041a\u043b\u0438\u0435\u043d\u0442" : null);
    const customerPhone = hasPhoneValue && phoneDigits.length === 11 ? `+${phoneDigits}` : null;

    const activePaymentTypes = (Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const paymentMethodOptions = activePaymentTypes.map((item) => String(item?.code || "")).filter(Boolean);
    const fallbackPaymentCode = paymentMethodOptions[0] || "cash";
    const rawPaymentCode = String(form.paymentMethod || "").trim();
    const paymentCode = paymentMethodOptions.includes(rawPaymentCode) ? rawPaymentCode : fallbackPaymentCode;

    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const cookWhenOptions = activeTimeOptions.map((item) => String(item?.code || "")).filter(Boolean);
    const fallbackCookWhenCode = cookWhenOptions[0] || "asap";
    const rawTimeOptionCode = String(form.cookWhen || "asap").trim() || "asap";
    const timeOptionCode = cookWhenOptions.includes(rawTimeOptionCode) ? rawTimeOptionCode : fallbackCookWhenCode;
    const isDeliveryMethod = isDeliveryMethodCode(methodCode);
    const isPickupMethod = isPickupLikeMethod(methodCode);
    const deliveryAddress = String(form.address || "").trim();
    if (isDeliveryMethod && !deliveryAddress) {
      showNewOrderAlert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438");
      return;
    }
    let pickupStoreId = null;
    if (isPickupMethod) {
      const resolvedStoreId = getRightOrderPreferredPickupStoreId();
      if (!(resolvedStoreId > 0)) {
        showNewOrderAlert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u043f\u0440\u0435\u0434\u0435\u043b\u0438\u0442\u044c \u0442\u043e\u0447\u043a\u0443 \u0441\u0430\u043c\u043e\u0432\u044b\u0432\u043e\u0437\u0430");
        return;
      }
      pickupStoreId = resolvedStoreId;
    }
    if (!paymentCode) {
      showNewOrderAlert("\u0412\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0441\u043f\u043e\u0441\u043e\u0431 \u043e\u043f\u043b\u0430\u0442\u044b");
      return;
    }

    const cookWhenKind = getCookWhenKind(timeOptionCode);
    let scheduledAt = null;
    if (cookWhenKind === "at_time" || cookWhenKind === "on_date") {
      const currentDateValue = String(form.scheduledDate || "").trim();
      const baseDateValue = /^\d{4}-\d{2}-\d{2}$/.test(currentDateValue)
        ? currentDateValue
        : (cookWhenKind === "on_date" ? getTomorrowIsoDate() : formatIsoDate(getTodayDate()));
      const slotsDateValue = cookWhenKind === "on_date" ? baseDateValue : formatIsoDate(getTodayDate());
      const timeSlots = buildTimeSlotsForOptionWithDate(timeOptionCode, slotsDateValue);
      const currentTimeValue = String(form.dateTime || "").trim();
      const timeValue = timeSlots.includes(currentTimeValue) ? currentTimeValue : (timeSlots[0] || currentTimeValue);
      if (!/^\d{1,2}:\d{2}$/.test(timeValue)) {
        showNewOrderAlert("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0432\u0440\u0435\u043c\u044f \u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u044f");
        return;
      }
      const dateValue = cookWhenKind === "on_date"
        ? baseDateValue
        : formatIsoDate(getTodayDate());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        showNewOrderAlert("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0434\u0430\u0442\u0443 \u043f\u0440\u0438\u0433\u043e\u0442\u043e\u0432\u043b\u0435\u043d\u0438\u044f");
        return;
      }
      scheduledAt = `${dateValue} ${timeValue}:00`;
    }

    let changeFrom = null;
    if (isCashPaymentCode(paymentCode)) {
      const changeType = String(form.changeType || "no_change").trim();
      if (changeType !== "no_change") {
        if (changeType === "other") {
          const numeric = Number(String(form.changeAmount || "").replace(/[^\d]/g, ""));
          if (!Number.isFinite(numeric) || numeric <= 0) {
            showNewOrderAlert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0441\u0443\u043c\u043c\u0443 \u0434\u043b\u044f \u0441\u0434\u0430\u0447\u0438");
            return;
          }
          changeFrom = numeric;
        } else {
          const numeric = Number(String(changeType).replace(/[^\d]/g, ""));
          changeFrom = Number.isFinite(numeric) && numeric > 0 ? numeric : null;
        }
      }
      if (changeFrom != null && changeFrom <= summary.payableTotal) {
        showNewOrderAlert(`\u0421\u0443\u043c\u043c\u0430 \u0434\u043b\u044f \u0441\u0434\u0430\u0447\u0438 \u0434\u043e\u043b\u0436\u043d\u0430 \u0431\u044b\u0442\u044c \u0431\u043e\u043b\u044c\u0448\u0435 ${toMoney(summary.payableTotal)}`);
        return;
      }
    }

    const items = buildRightOrderPayloadItems(cartItems);
    if (!items.length) {
      showNewOrderAlert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430");
      return;
    }
    const selectedOrderStatusId = isEditSubmit ? Number(form.orderStatusId || 0) : 0;
    const initialOrderStatusId = isEditSubmit ? Number(form.orderStatusInitialId || 0) : 0;

    const payload = {
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_id: Number(form.clientId || 0) > 0 ? Number(form.clientId) : null,
      method_code: methodCode,
      delivery_address: isDeliveryMethod ? deliveryAddress : null,
      delivery_address_id: isDeliveryMethod
        ? (Number(state.rightAddressSelectedIdByOrder.get(id) || 0) > 0 ? Number(state.rightAddressSelectedIdByOrder.get(id) || 0) : null)
        : null,
      pickup_store_id: pickupStoreId,
      comment: String(form.comment || "").trim() || null,
      time_option_code: timeOptionCode,
      scheduled_at: scheduledAt,
      payment_code: paymentCode,
      change_from: changeFrom,
      items,
    };

    if (withPayment) {
      const paymentPayload = await openRightOrderPaymentDraft(order);
      if (!paymentPayload) return;
      payload.payment_code = String(paymentPayload.payment_code || payload.payment_code || "").trim() || payload.payment_code;
      payload.change_from = isCashPaymentCode(payload.payment_code)
        ? (Number(paymentPayload.change_from || 0) > 0 ? Number(paymentPayload.change_from || 0) : null)
        : null;
      syncRightOrderFormPayment(id, paymentPayload);
    }

    state.rightCheckoutSubmittingByOrder.set(id, true);
    setRightCheckoutSendingOverlayVisible(true);
    renderRightOrderTabs();
    try {
      let submittedPublicId = "";
      let submittedId = 0;
      let paymentStepError = null;
      if (isEditSubmit) {
        const editStoreId = Number(order?.storeId || 0) > 0 ? Number(order.storeId) : null;
        const json = await apiJson(`/api/admin/orders/${editOrderId}`, {
          method: "PUT",
          headers: editStoreId ? { "x-store-id": String(editStoreId) } : undefined,
          body: JSON.stringify(payload),
        });
        if (selectedOrderStatusId > 0 && selectedOrderStatusId !== initialOrderStatusId) {
          await apiJson(`/api/admin/orders/${editOrderId}/status`, {
            method: "PUT",
            headers: editStoreId ? { "x-store-id": String(editStoreId) } : undefined,
            body: JSON.stringify({ status_id: selectedOrderStatusId }),
          });
        }
        submittedId = Number(json?.data?.id || editOrderId || 0);
        submittedPublicId = String(json?.data?.public_id || "").trim();
      } else {
        const json = await apiJson("/api/public/orders", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        submittedPublicId = String(json?.data?.public_id || "").trim();
        submittedId = Number(json?.data?.id || 0);
      }
      if (withPayment && submittedId > 0) {
        try {
          await apiJson(`/api/admin/orders/${submittedId}/paid`, {
            method: "PUT",
            body: JSON.stringify({
              is_paid: 1,
              payment_code: payload.payment_code,
              change_from: payload.change_from,
            }),
          });
        } catch (error) {
          paymentStepError = error;
        }
      }
      const latestIndex = getRightOrderIndexById(id);
      if (!isEditSubmit && latestIndex >= 0) {
        const latestOrder = state.rightOrders[latestIndex] || {};
        const latestForm = latestOrder.form && typeof latestOrder.form === "object" ? { ...latestOrder.form } : {};
        clearRightAutoAddDismissed(id);
        latestForm.cartItems = [];
        latestForm.comment = "";
        latestForm.changeType = "no_change";
        latestForm.changeAmount = "";
        state.rightOrders[latestIndex] = { ...latestOrder, form: latestForm };
      }
      resetRightCartClearState(id, { render: false });
      if (typeof window.updateActiveOrdersBadge === "function") {
        Promise.resolve(window.updateActiveOrdersBadge({ force: true })).catch(() => {});
      }
      document.dispatchEvent(
        new CustomEvent("neworder:order-submitted", {
          detail: {
            draftOrderId: id,
            createdOrderId: !isEditSubmit && submittedId > 0 ? submittedId : null,
            createdOrderPublicId: !isEditSubmit ? (submittedPublicId || null) : null,
            updatedOrderId: isEditSubmit && submittedId > 0 ? submittedId : null,
            updatedOrderPublicId: isEditSubmit ? (submittedPublicId || null) : null,
            submittedMode: isEditSubmit ? "edit" : "create",
          },
        })
      );
      if (paymentStepError) {
        showNewOrderAlert(`${isEditSubmit ? "Заказ сохранен" : "Заказ оформлен"}, но принять оплату не удалось: ${paymentStepError?.message || "UNKNOWN"}`);
      }
    } catch (e) {
      const action = isEditSubmit
        ? "\u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u044f"
        : "\u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u0438\u044f";
      showNewOrderAlert(`\u041e\u0448\u0438\u0431\u043a\u0430 ${action} \u0437\u0430\u043a\u0430\u0437\u0430: ${e?.message || "UNKNOWN"}`);
    } finally {
      state.rightCheckoutSubmittingByOrder.delete(id);
      setRightCheckoutSendingOverlayVisible(false);
      renderRightOrderTabs();
    }
  }

  function getTenantIdFromStorage() {
    try {
      const tenantRaw = localStorage.getItem("tenant");
      const tenant = tenantRaw ? JSON.parse(tenantRaw) : null;
      const id = Number(tenant?.id || 0);
      return Number.isFinite(id) && id > 0 ? id : 0;
    } catch {
      return 0;
    }
  }

  function getStoreIdFromStorage() {
    try {
      const activeStoreId = Number(localStorage.getItem("activeStoreId") || 0);
      if (Number.isFinite(activeStoreId) && activeStoreId > 0) return activeStoreId;
    } catch {}
    try {
      const storeId = Number(localStorage.getItem("store_id") || 0);
      return Number.isFinite(storeId) && storeId > 0 ? storeId : 0;
    } catch {
      return 0;
    }
  }

  function newOrderCacheScopeKey() {
    return `v${NEW_ORDER_CLIENT_CACHE_VERSION}_t${getTenantIdFromStorage()}_s${getStoreIdFromStorage()}`;
  }

  function newOrderManifestCacheKey() {
    return `new_order_manifest_${newOrderCacheScopeKey()}`;
  }

  function newOrderBootstrapCacheKey() {
    return `new_order_bootstrap_${newOrderCacheScopeKey()}`;
  }

  function readJsonCache(key) {
    try {
      const raw = localStorage.getItem(String(key || ""));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeJsonCache(key, value) {
    try {
      localStorage.setItem(String(key || ""), JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function getManifestDomainToken(manifest, domain) {
    return String(manifest?.domains?.[domain]?.token || "").trim();
  }

  function readNewOrderManifestCache() {
    const parsed = readJsonCache(newOrderManifestCacheKey());
    if (!parsed || typeof parsed !== "object") return null;
    const ts = Number(parsed.ts || 0);
    if (!ts || Date.now() - ts > NEW_ORDER_CLIENT_CACHE_MAX_AGE_MS) return null;
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : null;
    if (!data) return null;
    return data;
  }

  function writeNewOrderManifestCache(manifest) {
    const payload = {
      ts: Date.now(),
      data: manifest && typeof manifest === "object" ? manifest : null,
    };
    writeJsonCache(newOrderManifestCacheKey(), payload);
  }

  function areManifestTokensEqual(left, right) {
    const domains = ["categories", "products", "checkout", "refs"];
    return domains.every((domain) => getManifestDomainToken(left, domain) === getManifestDomainToken(right, domain));
  }

  function isManifestDomainChanged(prevManifest, nextManifest, domain) {
    return getManifestDomainToken(prevManifest, domain) !== getManifestDomainToken(nextManifest, domain);
  }

  function mapToObject(mapValue) {
    const out = {};
    if (!(mapValue instanceof Map)) return out;
    mapValue.forEach((value, key) => {
      out[String(key)] = value;
    });
    return out;
  }

  function objectToMap(value) {
    const out = new Map();
    if (!value || typeof value !== "object") return out;
    Object.keys(value).forEach((key) => {
      const numericKey = Number(key);
      out.set(Number.isFinite(numericKey) ? numericKey : key, value[key]);
    });
    return out;
  }

  let bootstrapPersistTimer = null;

  function readBootstrapSnapshot() {
    const parsed = readJsonCache(newOrderBootstrapCacheKey());
    if (!parsed || typeof parsed !== "object") return null;
    const ts = Number(parsed.ts || 0);
    if (!ts || Date.now() - ts > NEW_ORDER_CLIENT_CACHE_MAX_AGE_MS) return null;
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : null;
    return data || null;
  }

  function persistBootstrapSnapshot() {
    const categoryProductsById = {};
    state.categoryProductsCache.forEach((payload, key) => {
      const cid = Number(key || 0);
      if (!(cid > 0)) return;
      const source = Array.isArray(payload?.source) ? payload.source : [];
      const combos = Array.isArray(payload?.combos) ? payload.combos : [];
      categoryProductsById[String(cid)] = { source, combos };
    });

    const snapshot = {
      ts: Date.now(),
      data: {
        manifest: state.cacheManifest && typeof state.cacheManifest === "object" ? state.cacheManifest : null,
        activeCategoryId: state.activeCategoryId,
        categories: Array.isArray(state.categories) ? state.categories : [],
        productCategories: Array.isArray(state.productCategories) ? state.productCategories : [],
        rightDeliveryTypes: Array.isArray(state.rightDeliveryTypes) ? state.rightDeliveryTypes : [],
        rightPaymentTypes: Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [],
        rightTimeOptions: Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [],
        rightOrderStatuses: Array.isArray(state.rightOrderStatuses) ? state.rightOrderStatuses : [],
        rightDeliverySettings: state.rightDeliverySettings && typeof state.rightDeliverySettings === "object"
          ? state.rightDeliverySettings
          : null,
        rightPickupStores: Array.isArray(state.rightPickupStores) ? state.rightPickupStores : [],
        autoAdd: {
          groups: Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [],
          items: Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [],
        },
        unitConversions: Array.isArray(state.unitConversions) ? state.unitConversions : [],
        checkoutSavedDraft: state.checkoutSavedDraft && typeof state.checkoutSavedDraft === "object"
          ? { blocks: Array.isArray(state.checkoutSavedDraft.blocks) ? state.checkoutSavedDraft.blocks : [] }
          : { blocks: [] },
        categoryProductsById,
        productVariantsById: mapToObject(state.productVariants),
        productIngredientsById: mapToObject(state.productIngredients),
        productOptionGroupsById: mapToObject(state.productOptionGroups),
        optionGroupDetailsById: mapToObject(state.optionGroupDetails),
      },
    };
    writeJsonCache(newOrderBootstrapCacheKey(), snapshot);
  }

  function schedulePersistBootstrapSnapshot(delay = 200) {
    if (bootstrapPersistTimer) clearTimeout(bootstrapPersistTimer);
    bootstrapPersistTimer = setTimeout(() => {
      bootstrapPersistTimer = null;
      persistBootstrapSnapshot();
    }, Math.max(0, Number(delay || 0)));
  }

  function hydrateStateFromBootstrapSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return false;
    if (snapshot.manifest && typeof snapshot.manifest === "object") {
      state.cacheManifest = snapshot.manifest;
      writeNewOrderManifestCache(snapshot.manifest);
    }

    state.categories = Array.isArray(snapshot.categories) ? snapshot.categories : [];
    state.productCategories = Array.isArray(snapshot.productCategories) ? snapshot.productCategories : [];
    state.rightDeliveryTypes = (Array.isArray(snapshot.rightDeliveryTypes) ? snapshot.rightDeliveryTypes : [])
      .map(normalizeRightDeliveryTypeRef)
      .filter((item) => item.code)
      .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    state.rightPaymentTypes = Array.isArray(snapshot.rightPaymentTypes) ? snapshot.rightPaymentTypes : [];
    state.rightTimeOptions = Array.isArray(snapshot.rightTimeOptions) ? snapshot.rightTimeOptions : [];
    state.rightOrderStatuses = Array.isArray(snapshot.rightOrderStatuses) ? snapshot.rightOrderStatuses : [];
    state.rightDeliverySettings = snapshot.rightDeliverySettings && typeof snapshot.rightDeliverySettings === "object"
      ? snapshot.rightDeliverySettings
      : null;
    state.rightDeliverySettingsReady = Object.prototype.hasOwnProperty.call(snapshot, "rightDeliverySettings");
    state.rightDeliverySettingsLoading = false;
    state.rightPickupStores = Array.isArray(snapshot.rightPickupStores) ? snapshot.rightPickupStores : [];
    const autoAddSnapshot = snapshot.autoAdd && typeof snapshot.autoAdd === "object" ? snapshot.autoAdd : null;
    const autoAddGroups = Array.isArray(autoAddSnapshot?.groups) ? autoAddSnapshot.groups : [];
    const autoAddItems = Array.isArray(autoAddSnapshot?.items) ? autoAddSnapshot.items : [];
    state.autoAdd.groups = autoAddGroups;
    state.autoAdd.items = autoAddItems;
    state.autoAdd.byGroupId = new Map(
      autoAddGroups
        .map((group) => [Number(group?.id || 0), group])
        .filter(([gid]) => Number.isFinite(gid) && gid > 0)
    );
    state.autoAdd.byProductId = new Map(
      autoAddItems
        .map((item) => [Number(item?.product_id || 0), item])
        .filter(([pid]) => Number.isFinite(pid) && pid > 0)
    );
    autoAddItems.forEach((rule) => {
      const groupId = Number(rule?.group_id || 0);
      if (!rule?.group && groupId > 0) {
        rule.group = state.autoAdd.byGroupId.get(groupId) || null;
      }
    });
    state.autoAddLoaded = autoAddGroups.length > 0 || autoAddItems.length > 0;
    state.autoAddLoadPromise = null;
    state.unitConversions = Array.isArray(snapshot.unitConversions) ? snapshot.unitConversions : [];
    state.checkoutSavedDraft = snapshot.checkoutSavedDraft && typeof snapshot.checkoutSavedDraft === "object"
      ? { blocks: Array.isArray(snapshot.checkoutSavedDraft.blocks) ? snapshot.checkoutSavedDraft.blocks : [] }
      : { blocks: [] };

    state.categoryProductsCache.clear();
    state.checkoutCategoryProducts.clear();
    const categoryProductsById = snapshot.categoryProductsById && typeof snapshot.categoryProductsById === "object"
      ? snapshot.categoryProductsById
      : {};
    Object.keys(categoryProductsById).forEach((key) => {
      const categoryId = Number(key || 0);
      if (!(categoryId > 0)) return;
      const raw = categoryProductsById[key] || {};
      const payload = buildCategoryPayload(raw.source, raw.combos);
      state.categoryProductsCache.set(categoryId, payload);
      state.checkoutCategoryProducts.set(categoryId, payload.activeOnly);
    });

    state.productVariants = objectToMap(snapshot.productVariantsById);
    state.productIngredients = objectToMap(snapshot.productIngredientsById);
    state.productOptionGroups = objectToMap(snapshot.productOptionGroupsById);
    state.optionGroupDetails = objectToMap(snapshot.optionGroupDetailsById);

    state.ingredientStateByProduct.clear();
    state.productIngredients.forEach((list, productId) => {
      const pid = Number(productId || 0);
      if (!(pid > 0)) return;
      state.ingredientStateByProduct.set(pid, createIngredientQtyMap(list));
    });

    const cachedActive = snapshot.activeCategoryId;
    if (String(cachedActive) === CHECKOUT_SCREEN_ID) {
      state.activeCategoryId = CHECKOUT_SCREEN_ID;
    } else {
      const activeId = Number(cachedActive || 0);
      const hasActive = state.categories.some((c) => Number(c?.id || 0) === activeId);
      state.activeCategoryId = hasActive ? activeId : CHECKOUT_SCREEN_ID;
    }
    return true;
  }

  function getStoreAddressForPickupLikeMethod() {
    const stores = Array.isArray(state.rightPickupStores) ? state.rightPickupStores : [];
    if (!stores.length) return "";
    let preferredStoreId = 0;
    try {
      preferredStoreId = Number(localStorage.getItem("store_id") || 0);
    } catch {}
    const preferred = stores.find((s) => Number(s?.id || 0) === preferredStoreId) || stores[0] || null;
    if (!preferred) return "";
    return String(preferred.address || preferred.name || "").trim();
  }

  function normalizePhoneDigits(value) {
    return String(value || "").replace(/[^\d]/g, "");
  }

  function normalizePhoneRu(value) {
    let digits = normalizePhoneDigits(value);
    if (!digits) return "7";
    if (digits.startsWith("8")) digits = `7${digits.slice(1)}`;
    if (!digits.startsWith("7")) {
      digits = digits.length === 10 ? `7${digits}` : `7${digits}`;
    }
    return digits.slice(0, 11);
  }

  function formatPhoneRuInput(value) {
    const digits = normalizePhoneRu(value);
    const rest = digits.slice(1);
    let out = "+7";
    if (!rest.length) return out;
    out += ` (${rest.slice(0, 3)}`;
    if (rest.length >= 3) out += ")";
    if (rest.length > 3) out += ` ${rest.slice(3, 6)}`;
    if (rest.length > 6) out += `-${rest.slice(6, 8)}`;
    if (rest.length > 8) out += `-${rest.slice(8, 10)}`;
    return out;
  }

  function cutLastPhoneDigitPreservePrefix(value) {
    const digits = normalizePhoneRu(value);
    if (!digits || digits.length <= 1) return "+7";
    const next = digits.slice(0, -1);
    return formatPhoneRuInput(next);
  }

  function formatClientAddressLine(address) {
    if (!address || typeof address !== "object") return "";
    const street = repairUtf8Mojibake(String(address.street || "").trim());
    const house = repairUtf8Mojibake(String(address.house || "").trim());
    const entrance = repairUtf8Mojibake(String(address.entrance || "").trim());
    const floor = repairUtf8Mojibake(String(address.floor || "").trim());
    const apartment = repairUtf8Mojibake(String(address.apartment || "").trim());
    const comment = repairUtf8Mojibake(String(address.comment || "").trim());
    const base = [street, house ? `д. ${house}` : ""].filter(Boolean).join(", ");
    const details = [
      entrance ? `под. ${entrance}` : "",
      floor ? `эт. ${floor}` : "",
      apartment ? `кв. ${apartment}` : "",
    ].filter(Boolean).join(", ");
    return [base, details, comment].filter(Boolean).join(", ");
  }

  async function lookupClientByPhoneForRightOrder(orderId, phoneValue) {
    const normalizedDigits = normalizePhoneRu(phoneValue);
    if (normalizedDigits.length !== 11) return;
    const reqSeq = ++state.rightClientLookupReqSeq;
    const cacheKey = normalizedDigits;
    let payload = state.rightClientLookupCache.get(cacheKey) || null;

    if (!payload) {
      const qs = new URLSearchParams();
      qs.set("limit", "1");
      qs.set("offset", "0");
      qs.set("q", normalizedDigits);
      const listJson = await apiJson(`/api/admin/clients?${qs.toString()}`);
      const rows = Array.isArray(listJson?.data) ? listJson.data : [];
      const match = rows.find((client) => normalizePhoneDigits(client?.phone) === normalizedDigits) || rows[0] || null;
      if (!match || !(Number(match?.id || 0) > 0)) {
        payload = { found: false, clientId: 0, name: "", address: "", addresses: [], discounts: [] };
      } else {
        const clientId = Number(match.id);
        const [addressesJson, discountsJson] = await Promise.all([
          apiJson(`/api/admin/clients/${clientId}/addresses`),
          apiJson(`/api/admin/clients/${clientId}/discounts`).catch(() => ({ data: [] })),
        ]);
        const addresses = Array.isArray(addressesJson?.data) ? addressesJson.data : [];
        const discountsRaw = Array.isArray(discountsJson?.data) ? discountsJson.data : [];
        const discounts = discountsRaw.map((row) => normalizeRightClientDiscountRow(row)).filter((row) => row.id > 0);
        const primaryAddress = addresses.find((item) => Number(item?.is_default || 0) === 1) || addresses[0] || null;
        payload = {
          found: true,
          clientId,
          name: String(match?.name || "").trim(),
          address: formatClientAddressLine(primaryAddress),
          addresses,
          discounts,
        };
      }
      state.rightClientLookupCache.set(cacheKey, payload);
    }

    if (reqSeq !== state.rightClientLookupReqSeq) return;
    const index = state.rightOrders.findIndex((order) => Number(order?.id || 0) === Number(orderId || 0));
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    if (payload?.found) {
      form.clientId = Number(payload.clientId || 0) || null;
      form.name = payload.name || form.name || "";
      form.address = payload.address || form.address || "";
      state.rightClientAddressesByOrder.set(Number(orderId || 0), Array.isArray(payload.addresses) ? payload.addresses : []);
      const discounts = Array.isArray(payload.discounts) ? payload.discounts : [];
      state.rightClientDiscountsByClientId.set(Number(payload.clientId || 0), discounts);
    } else {
      form.clientId = null;
      state.rightClientAddressesByOrder.set(Number(orderId || 0), []);
    }
    state.rightOrders[index] = { ...order, form };
    renderRightOrderTabs();
  }

  function updateRightOrderFormField(orderId, field, value) {
    const id = Number(orderId || 0);
    const key = String(field || "").trim();
    if (!(id > 0) || !key) return;
    const index = state.rightOrders.findIndex((order) => Number(order?.id || 0) === id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    if (key === "phone") {
      form[key] = formatPhoneRuInput(value);
    } else {
      form[key] = value;
    }
    state.rightOrders[index] = { ...order, form };
  }

  function getRightAddressOverlayElements() {
    const backdrop = document.getElementById("newOrderRightAddressOverlay");
    const listWrap = document.getElementById("newOrderRightAddressListWrap");
    const list = document.getElementById("newOrderRightAddressList");
    const newBtn = document.getElementById("newOrderRightAddressNewBtn");
    const city = document.getElementById("newOrderRightAddressCity");
    const street = document.getElementById("newOrderRightAddressStreet");
    const house = document.getElementById("newOrderRightAddressHouse");
    const entrance = document.getElementById("newOrderRightAddressEntrance");
    const floor = document.getElementById("newOrderRightAddressFloor");
    const apartment = document.getElementById("newOrderRightAddressApartment");
    const comment = document.getElementById("newOrderRightAddressComment");
    const saveBtn = document.getElementById("newOrderRightAddressSaveBtn");
    const cancelBtn = document.getElementById("newOrderRightAddressCancelBtn");
    return { backdrop, listWrap, list, newBtn, city, street, house, entrance, floor, apartment, comment, saveBtn, cancelBtn };
  }

  function ensureRightAddressOverlay() {
    if (document.getElementById("newOrderRightAddressOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderRightAddressOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet new-order-right-address-sheet">
        <div class="new-order-option-sheet-head">
          <div class="new-order-option-sheet-title">Введите адрес</div>
          <button class="new-order-option-sheet-back" type="button" data-action="right-address-overlay-close"><i class="fas fa-times"></i></button>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar new-order-right-address-body">
          <div class="new-order-right-address-list-wrap hidden" id="newOrderRightAddressListWrap">
            <div class="new-order-right-address-list-head">
              <div class="new-order-right-address-list-title">Адреса клиента</div>
              <button type="button" class="new-order-right-address-new-btn" id="newOrderRightAddressNewBtn">+ Новый адрес</button>
            </div>
            <div class="new-order-right-address-list" id="newOrderRightAddressList"></div>
          </div>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">Город</span>
            <div class="custom-select" id="newOrderRightAddressCity">
              <button type="button" class="custom-select-trigger control">
                <span class="custom-select-value"></span>
                <i class="fas fa-chevron-down custom-select-arrow" aria-hidden="true"></i>
              </button>
              <div class="custom-select-dropdown hidden"></div>
            </div>
          </label>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">Улица</span>
            <input id="newOrderRightAddressStreet" class="control" type="text" autocomplete="off" />
          </label>
          <div class="new-order-right-form-row">
            <label class="new-order-right-form-field">
              <span class="new-order-right-form-label">Дом</span>
              <input id="newOrderRightAddressHouse" class="control" type="text" autocomplete="off" />
            </label>
            <label class="new-order-right-form-field">
              <span class="new-order-right-form-label">Подъезд</span>
              <input id="newOrderRightAddressEntrance" class="control" type="text" autocomplete="off" />
            </label>
          </div>
          <div class="new-order-right-form-row">
            <label class="new-order-right-form-field">
              <span class="new-order-right-form-label">Этаж</span>
              <input id="newOrderRightAddressFloor" class="control" type="text" autocomplete="off" />
            </label>
            <label class="new-order-right-form-field">
              <span class="new-order-right-form-label">Квартира</span>
              <input id="newOrderRightAddressApartment" class="control" type="text" autocomplete="off" />
            </label>
          </div>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">Комментарий курьеру</span>
            <input id="newOrderRightAddressComment" class="control" type="text" autocomplete="off" />
          </label>
        </div>
        <div class="new-order-checkout-categories-footer new-order-right-address-footer">
          <div class="new-order-checkout-categories-actions">
            <button class="new-order-checkout-categories-action-btn is-save" type="button" id="newOrderRightAddressSaveBtn">Сохранить</button>
            <button class="new-order-checkout-categories-action-btn is-cancel" type="button" id="newOrderRightAddressCancelBtn">Отмена</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function normalizeClientAddressRow(row) {
    const item = row && typeof row === "object" ? row : {};
    const text = (value) => repairUtf8Mojibake(String(value || "").trim());
    return {
      id: Number(item.id || 0),
      city: text(item.city),
      street: text(item.street),
      house: text(item.house),
      entrance: text(item.entrance),
      floor: text(item.floor),
      apartment: text(item.apartment),
      comment: text(item.comment),
      is_default: Number(item.is_default || 0),
    };
  }

  function getAddressDraftFromClientAddress(row, fallbackCity = "") {
    const a = normalizeClientAddressRow(row);
    return {
      city: String(a.city || fallbackCity || getDefaultRightAddressCity()).trim(),
      street: a.street,
      house: a.house,
      entrance: a.entrance,
      floor: a.floor,
      apartment: a.apartment,
      comment: a.comment,
    };
  }

  function formatClientAddressShort(row, forcedCity = "") {
    const a = normalizeClientAddressRow(row);
    const city = repairUtf8Mojibake(String(forcedCity || a.city || getDefaultRightAddressCity()).trim());
    const parts = [
      city,
      [a.street, a.house].filter(Boolean).join(" "),
      a.entrance ? `подъезд ${a.entrance}` : "",
      a.floor ? `этаж ${a.floor}` : "",
      a.apartment ? `кв ${a.apartment}` : "",
    ].filter(Boolean);
    return parts.join(", ") || "Без адреса";
  }

  async function getClientIdByOrder(orderId) {
    const id = Number(orderId || 0);
    const idx = state.rightOrders.findIndex((o) => Number(o?.id || 0) === id);
    if (idx < 0) return 0;
    const order = state.rightOrders[idx] || {};
    const form = order.form || {};
    const directId = Number(form.clientId || 0);
    if (directId > 0) return directId;

    const normalizedDigits = normalizePhoneRu(form.phone || "");
    if (normalizedDigits.length !== 11) return 0;
    const cachePayload = state.rightClientLookupCache.get(normalizedDigits);
    if (cachePayload && Number(cachePayload.clientId || 0) > 0) {
      form.clientId = Number(cachePayload.clientId);
      state.rightOrders[idx] = { ...order, form };
      return Number(cachePayload.clientId);
    }
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "1");
      qs.set("offset", "0");
      qs.set("q", normalizedDigits);
      const listJson = await apiJson(`/api/admin/clients?${qs.toString()}`);
      const rows = Array.isArray(listJson?.data) ? listJson.data : [];
      const match = rows.find((client) => normalizePhoneDigits(client?.phone) === normalizedDigits) || rows[0] || null;
      const clientId = Number(match?.id || 0);
      if (clientId > 0) {
        form.clientId = clientId;
        state.rightOrders[idx] = { ...order, form };
        return clientId;
      }
    } catch {}
    return 0;
  }

  async function loadClientAddressesForRightOrder(orderId) {
    const id = Number(orderId || 0);
    const clientId = await getClientIdByOrder(id);
    if (!(clientId > 0)) {
      state.rightClientAddressesByOrder.set(id, []);
      return [];
    }
    try {
      const json = await apiJson(`/api/admin/clients/${clientId}/addresses`);
      const list = (Array.isArray(json?.data) ? json.data : []).map(normalizeClientAddressRow).filter((a) => a.id > 0);
      state.rightClientAddressesByOrder.set(id, list);
      return list;
    } catch {
      state.rightClientAddressesByOrder.set(id, []);
      return [];
    }
  }

  function renderRightAddressList(orderId) {
    const id = Number(orderId || 0);
    const { listWrap, list } = getRightAddressOverlayElements();
    if (!listWrap || !list) return;
    const rows = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];
    if (!rows.length) {
      listWrap.classList.add("hidden");
      list.innerHTML = "";
      return;
    }
    listWrap.classList.remove("hidden");
    const selectedId = Number(state.rightAddressSelectedIdByOrder.get(id) || 0);
    const currentDraft = state.rightAddressDraftByOrder.get(id) || null;
    const cityForRows = String(currentDraft?.city || getDefaultRightAddressCity()).trim();
    list.innerHTML = rows.map((a) => `
      <div class="new-order-right-address-row ${Number(a.id) === selectedId ? "is-selected" : ""}" data-address-id="${Number(a.id)}">
        <button type="button" class="new-order-right-address-radio" data-action="right-address-select" data-address-id="${Number(a.id)}" aria-label="Р’С‹Р±СЂР°С‚СЊ Р°РґСЂРµСЃ"></button>
        <div class="new-order-right-address-row-main">${escapeHtml(formatClientAddressShort(a, cityForRows))}</div>
        <div class="new-order-right-address-row-actions">
          <button type="button" class="new-order-right-address-row-btn" data-action="right-address-edit-item" data-address-id="${Number(a.id)}" aria-label="Р РµРґР°РєС‚РёСЂРѕРІР°С‚СЊ"><i class="fas fa-pen"></i></button>
          <button type="button" class="new-order-right-address-row-btn is-danger" data-action="right-address-del-item" data-address-id="${Number(a.id)}" aria-label="РЈРґР°Р»РёС‚СЊ"><i class="fas fa-times"></i></button>
        </div>
      </div>
    `).join("");
  }

  function initRightAddressCitySelect(wrapEl, selectedValue) {
    if (!wrapEl || !wrapEl.classList.contains("custom-select")) return;
    const trigger = wrapEl.querySelector(".custom-select-trigger");
    const valueEl = wrapEl.querySelector(".custom-select-value");
    const dropdown = wrapEl.querySelector(".custom-select-dropdown");
    if (!trigger || !valueEl || !dropdown) return;

    const stores = Array.isArray(state.rightPickupStores) ? state.rightPickupStores : [];
    const cities = [...new Set(stores.map((s) => String(s?.city || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
    const preferred = String(selectedValue || "").trim();
    const current = preferred && cities.includes(preferred)
      ? preferred
      : (cities[0] || getDefaultRightAddressCity());

    wrapEl.dataset.value = current;
    valueEl.textContent = current || "вЂ”";
    dropdown.innerHTML = "";

    cities.forEach((c) => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = `custom-select-option${c === current ? " is-selected" : ""}`;
      opt.textContent = c;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        wrapEl.dataset.value = c;
        valueEl.textContent = c;
        dropdown.querySelectorAll(".custom-select-option").forEach((node) => node.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      });
      dropdown.appendChild(opt);
    });

    trigger.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !dropdown.classList.contains("hidden");
      if (isOpen) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      } else {
        dropdown.classList.remove("hidden");
        wrapEl.classList.add("is-open");
      }
    };

    const closeHandler = (e) => {
      if (!wrapEl.contains(e.target)) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      }
    };
    document.removeEventListener("click", wrapEl._closeHandler);
    wrapEl._closeHandler = closeHandler;
    document.addEventListener("click", closeHandler);
  }

  function closeRightAddressOverlay() {
    const { backdrop } = getRightAddressOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
  }

  function getDefaultRightAddressCity() {
    const tenant = getTenantFromStorage();
    const direct = repairUtf8Mojibake(String(tenant?.city || tenant?.city_name || "").trim());
    if (direct) return direct;
    return "Новоалтайск";
  }

  function buildRightAddressLine(parts) {
    const city = repairUtf8Mojibake(String(parts?.city || "").trim());
    const street = repairUtf8Mojibake(String(parts?.street || "").trim());
    const house = repairUtf8Mojibake(String(parts?.house || "").trim());
    const entrance = repairUtf8Mojibake(String(parts?.entrance || "").trim());
    const floor = repairUtf8Mojibake(String(parts?.floor || "").trim());
    const apartment = repairUtf8Mojibake(String(parts?.apartment || "").trim());
    const comment = repairUtf8Mojibake(String(parts?.comment || "").trim());
    const head = [city ? `г. ${city}` : "", street ? `ул. ${street}` : "", house ? `д. ${house}` : ""].filter(Boolean).join(", ");
    const details = [entrance ? `под. ${entrance}` : "", floor ? `эт. ${floor}` : "", apartment ? `кв. ${apartment}` : ""].filter(Boolean).join(", ");
    return [head, details, comment].filter(Boolean).join(", ");
  }

  function fillRightAddressInputs(draft) {
    const { city, street, house, entrance, floor, apartment, comment } = getRightAddressOverlayElements();
    if (!city || !street || !house || !entrance || !floor || !apartment || !comment) return;
    initRightAddressCitySelect(city, repairUtf8Mojibake(String(draft?.city || "")));
    street.value = repairUtf8Mojibake(String(draft?.street || ""));
    house.value = repairUtf8Mojibake(String(draft?.house || ""));
    entrance.value = repairUtf8Mojibake(String(draft?.entrance || ""));
    floor.value = repairUtf8Mojibake(String(draft?.floor || ""));
    apartment.value = repairUtf8Mojibake(String(draft?.apartment || ""));
    comment.value = repairUtf8Mojibake(String(draft?.comment || ""));
  }

  function readRightAddressInputs() {
    const { city, street, house, entrance, floor, apartment, comment } = getRightAddressOverlayElements();
    return {
      city: String(city?.dataset?.value || "").trim(),
      street: String(street?.value || "").trim(),
      house: String(house?.value || "").trim(),
      entrance: String(entrance?.value || "").trim(),
      floor: String(floor?.value || "").trim(),
      apartment: String(apartment?.value || "").trim(),
      comment: String(comment?.value || "").trim(),
    };
  }

  async function openRightAddressOverlay(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    ensureRightAddressOverlay();
    const { backdrop, newBtn, saveBtn, cancelBtn } = getRightAddressOverlayElements();
    if (!backdrop || !saveBtn || !cancelBtn) return;

    await loadClientAddressesForRightOrder(id);
    const rows = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];

    const draft = state.rightAddressDraftByOrder.get(id) || {
      city: getDefaultRightAddressCity(),
      street: "",
      house: "",
      entrance: "",
      floor: "",
      apartment: "",
      comment: "",
    };
    const defaultSelected = rows.find((a) => Number(a.is_default || 0) === 1) || rows[0] || null;
    state.rightAddressSelectedIdByOrder.set(id, Number(defaultSelected?.id || 0) || 0);
    state.rightAddressEditingIdByOrder.set(id, 0);
    fillRightAddressInputs(draft);
    renderRightAddressList(id);

    backdrop.classList.remove("hidden");
    backdrop.onclick = (e) => {
      const closeBtn = e.target.closest("[data-action='right-address-overlay-close']");
      if (closeBtn || e.target === backdrop) {
        closeRightAddressOverlay();
        return;
      }
      const selectBtn = e.target.closest("[data-action='right-address-select'][data-address-id]");
      if (selectBtn) {
        const addrId = Number(selectBtn.getAttribute("data-address-id") || 0);
        state.rightAddressSelectedIdByOrder.set(id, addrId);
        state.rightAddressEditingIdByOrder.set(id, 0);
        renderRightAddressList(id);
        return;
      }
      const editBtn = e.target.closest("[data-action='right-address-edit-item'][data-address-id]");
      if (editBtn) {
        const addrId = Number(editBtn.getAttribute("data-address-id") || 0);
        const list = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];
        const row = list.find((a) => Number(a.id) === addrId) || null;
        if (!row) return;
        state.rightAddressEditingIdByOrder.set(id, addrId);
        state.rightAddressSelectedIdByOrder.set(id, addrId);
        fillRightAddressInputs(getAddressDraftFromClientAddress(row, getDefaultRightAddressCity()));
        renderRightAddressList(id);
        return;
      }
      const delBtn = e.target.closest("[data-action='right-address-del-item'][data-address-id]");
      if (delBtn) {
        const addrId = Number(delBtn.getAttribute("data-address-id") || 0);
        if (!(addrId > 0)) return;
        void (async () => {
          const clientId = await getClientIdByOrder(id);
          if (!(clientId > 0)) return;
          await apiJson(`/api/admin/clients/${clientId}/addresses/${addrId}`, { method: "DELETE" });
          const reloaded = await loadClientAddressesForRightOrder(id);
          const nextSelected = reloaded.find((a) => Number(a.is_default || 0) === 1) || reloaded[0] || null;
          state.rightAddressSelectedIdByOrder.set(id, Number(nextSelected?.id || 0) || 0);
          state.rightAddressEditingIdByOrder.set(id, 0);
          renderRightAddressList(id);
        })();
      }
    };

    if (newBtn) {
      newBtn.onclick = () => {
        state.rightAddressEditingIdByOrder.set(id, 0);
        state.rightAddressSelectedIdByOrder.set(id, 0);
        fillRightAddressInputs({
          city: getDefaultRightAddressCity(),
          street: "",
          house: "",
          entrance: "",
          floor: "",
          apartment: "",
          comment: "",
        });
        renderRightAddressList(id);
      };
    }

    cancelBtn.onclick = () => {
      closeRightAddressOverlay();
    };
    saveBtn.onclick = async () => {
      const next = readRightAddressInputs();
      const editingAddressId = Number(state.rightAddressEditingIdByOrder.get(id) || 0);
      const selectedAddressId = Number(state.rightAddressSelectedIdByOrder.get(id) || 0);
      const clientId = await getClientIdByOrder(id);

      if (editingAddressId > 0 && clientId > 0) {
        await apiJson(`/api/admin/clients/${clientId}/addresses/${editingAddressId}`, {
          method: "PUT",
          body: JSON.stringify({
            street: next.street,
            house: next.house,
            entrance: next.entrance || null,
            floor: next.floor || null,
            apartment: next.apartment || null,
            comment: next.comment || null,
          }),
        });
        await loadClientAddressesForRightOrder(id);
      } else if (selectedAddressId > 0) {
        const list = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];
        const selectedRow = list.find((a) => Number(a.id) === selectedAddressId) || null;
        if (selectedRow) {
          const selectedDraft = getAddressDraftFromClientAddress(selectedRow, next.city || getDefaultRightAddressCity());
          state.rightAddressDraftByOrder.set(id, selectedDraft);
          updateRightOrderFormField(id, "address", buildRightAddressLine(selectedDraft));
          closeRightAddressOverlay();
          renderRightOrderTabs();
          return;
        }
      } else if (clientId > 0 && next.street && next.house) {
        await apiJson(`/api/admin/clients/${clientId}/addresses`, {
          method: "POST",
          body: JSON.stringify({
            street: next.street,
            house: next.house,
            entrance: next.entrance || null,
            floor: next.floor || null,
            apartment: next.apartment || null,
            comment: next.comment || null,
            is_default: false,
          }),
        });
        const list = await loadClientAddressesForRightOrder(id);
        const created = list[0] || null;
        if (created) state.rightAddressSelectedIdByOrder.set(id, Number(created.id || 0));
      }

      state.rightAddressDraftByOrder.set(id, next);
      const line = buildRightAddressLine(next);
      updateRightOrderFormField(id, "address", line);
      closeRightAddressOverlay();
      renderRightOrderTabs();
    };
  }

  async function applyReceiveMethodAddress(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const index = state.rightOrders.findIndex((order) => Number(order?.id || 0) === id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const methodCode = String(form.pickupMethod || "").trim();
    if (isPickupLikeMethod(methodCode)) {
      const storeAddress = getStoreAddressForPickupLikeMethod();
      if (!storeAddress) return;
      form.address = storeAddress;
      state.rightOrders[index] = { ...order, form };
      return;
    }

    const clientAddresses = await loadClientAddressesForRightOrder(id);
    const primaryAddress = (Array.isArray(clientAddresses) ? clientAddresses : []).find((item) => Number(item?.is_default || 0) === 1)
      || (Array.isArray(clientAddresses) ? clientAddresses[0] : null)
      || null;
    if (!primaryAddress) return;
    form.address = formatClientAddressLine(primaryAddress);
    state.rightOrders[index] = { ...order, form };
  }

  function getCheckoutBlockChipTitle(block, blockIndex, categoryById) {
    const customTitle = String(block?.title || "").trim();
    if (customTitle) return customTitle;
    const ids = Array.isArray(block?.categoryIds) ? block.categoryIds : [];
    const firstTitle = String((categoryById.get(Number(ids[0] || 0)) || {}).title || "").trim();
    if (!ids.length) return `Р‘Р»РѕРє ${blockIndex + 1}`;
    if (ids.length === 1) return firstTitle || `Р‘Р»РѕРє ${blockIndex + 1}`;
    return firstTitle ? `${firstTitle} +${ids.length - 1}` : `Р‘Р»РѕРє ${blockIndex + 1}`;
  }

  function renderCheckoutBlockChips(blocks, categoryById) {
    if (!checkoutBlockChipsEl) return;
    const list = Array.isArray(blocks) ? blocks : [];
    if (!isCheckoutScreenActive() || !list.length) {
      checkoutBlockChipsEl.innerHTML = "";
      checkoutBlockChipsEl.classList.add("hidden");
      return;
    }
    checkoutBlockChipsEl.innerHTML = list.map((block, index) => `
      <button
        type="button"
        class="new-order-checkout-block-chip"
        data-action="checkout-scroll-to-block"
        data-block-id="${Number(block?.id || 0)}"
        title="${escapeHtml(getCheckoutBlockChipTitle(block, index, categoryById))}"
      >${escapeHtml(getCheckoutBlockChipTitle(block, index, categoryById))}</button>
    `).join("");
    checkoutBlockChipsEl.classList.remove("hidden");
  }

  function normalizeBlock(rawBlock) {
    const rawIds = Array.isArray(rawBlock?.categoryIds) ? rawBlock.categoryIds : [];
    const categoryIds = rawIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
    if (!categoryIds.length) return null;
    const id = Number(rawBlock?.id || 0) || Date.now() + Math.floor(Math.random() * 10000);
    const requireAll = rawBlock?.requireAll == null ? true : Boolean(rawBlock.requireAll);
    const title = String(rawBlock?.title || "").trim().slice(0, 120);
    return { id, title, categoryIds, requireAll };
  }

  function getCheckoutBlocks() {
    const source = state.checkoutEditMode ? state.checkoutDraft : state.checkoutSavedDraft;
    const rawBlocks = Array.isArray(source?.blocks) ? source.blocks : [];
    return rawBlocks.map(normalizeBlock).filter(Boolean);
  }

  function checkoutDraftCacheKey() {
    return `new_order_checkout_draft_v${CHECKOUT_DRAFT_CACHE_VERSION}_t${getTenantIdFromStorage()}`;
  }

  function getCachedProductsToken() {
    const token = getManifestDomainToken(state.cacheManifest, "products")
      || getManifestDomainToken(readNewOrderManifestCache(), "products")
      || "na";
    return String(token || "na").slice(0, 64);
  }

  function checkoutProductsCacheKey(categoryId) {
    return `new_order_checkout_products_v${CHECKOUT_PRODUCTS_CACHE_VERSION}_t${getTenantIdFromStorage()}_s${getStoreIdFromStorage()}_p${getCachedProductsToken()}_c${Number(categoryId || 0)}`;
  }

  function writeDraftCache(blocks) {
    try {
      const payload = {
        ts: Date.now(),
        blocks: (Array.isArray(blocks) ? blocks : []).map(normalizeBlock).filter(Boolean),
      };
      localStorage.setItem(checkoutDraftCacheKey(), JSON.stringify(payload));
    } catch {}
  }

  function readDraftCache() {
    try {
      const raw = localStorage.getItem(checkoutDraftCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      if (!ts || Date.now() - ts > CHECKOUT_DRAFT_CACHE_MAX_AGE_MS) return null;
      const blocks = (Array.isArray(parsed?.blocks) ? parsed.blocks : []).map(normalizeBlock).filter(Boolean);
      return { blocks };
    } catch {
      return null;
    }
  }

  function writeCategoryProductsCache(categoryId, products) {
    const cid = Number(categoryId || 0);
    if (!(cid > 0)) return;
    try {
      localStorage.setItem(
        checkoutProductsCacheKey(cid),
        JSON.stringify({
          ts: Date.now(),
          products: Array.isArray(products) ? products : [],
        })
      );
    } catch {}
  }

  function readCategoryProductsCache(categoryId) {
    const cid = Number(categoryId || 0);
    if (!(cid > 0)) return null;
    try {
      const raw = localStorage.getItem(checkoutProductsCacheKey(cid));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed?.ts || 0);
      if (!ts || Date.now() - ts > CHECKOUT_PRODUCTS_CACHE_MAX_AGE_MS) return null;
      return Array.isArray(parsed?.products) ? parsed.products : [];
    } catch {
      return null;
    }
  }

  function toCheckoutBlocksPayload(sourceBlocks) {
    const blocks = (Array.isArray(sourceBlocks) ? sourceBlocks : [])
      .map(normalizeBlock)
      .filter(Boolean)
      .map((block, index) => ({
        id: Number(block.id || 0),
        title: String(block.title || "").trim().slice(0, 120),
        categoryIds: Array.isArray(block.categoryIds) ? [...block.categoryIds] : [],
        requireAll: block.requireAll == null ? true : Boolean(block.requireAll),
        sortOrder: (index + 1) * 10,
      }));
    return { blocks };
  }

  function getCheckoutBlockById(blockId) {
    const id = Number(blockId || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return getCheckoutBlocks().find((block) => Number(block?.id || 0) === id) || null;
  }

  function inferCheckoutRequireAllByCategoryIds(categoryIds) {
    const target = [...new Set((Array.isArray(categoryIds) ? categoryIds : [])
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0))]
      .sort((a, b) => a - b);
    if (!target.length) return null;
    const blocks = getCheckoutBlocks();
    const matches = blocks.filter((block) => {
      const ids = [...new Set((Array.isArray(block?.categoryIds) ? block.categoryIds : [])
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0))]
        .sort((a, b) => a - b);
      if (ids.length < target.length) return false;
      return target.every((id) => ids.includes(id));
    });
    if (!matches.length) return null;
    if (matches.some((block) => block && block.requireAll === false)) return false;
    return true;
  }

  function getCartItemCheckoutRequireAll(item) {
    if (!item || typeof item !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(item, "checkout_require_all")) {
      return Boolean(item.checkout_require_all);
    }
    const blockId = Number(item?.checkout_block_id || 0);
    if (blockId > 0) {
      const block = getCheckoutBlockById(blockId);
      if (block) return Boolean(block.requireAll);
    }
    const sections = Array.isArray(item?.sections) ? item.sections : [];
    const categoryIds = sections
      .map((section) => Number(section?.category_id || 0))
      .filter((id) => id > 0);
    if (!categoryIds.length) return null;
    return inferCheckoutRequireAllByCategoryIds(categoryIds);
  }

  function getAllCategoryIdsFromBlocks(blocks) {
    const ids = [];
    (Array.isArray(blocks) ? blocks : []).forEach((block) => {
      (Array.isArray(block?.categoryIds) ? block.categoryIds : []).forEach((id) => ids.push(Number(id)));
    });
    return [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))];
  }

  function getCheckoutSectionKey(blockId, categoryId) {
    return `${Number(blockId || 0)}:${Number(categoryId || 0)}`;
  }

  function getCheckoutIngredientsPopoverKey(sectionKey, productId) {
    return `${String(sectionKey || "")}__${Number(productId || 0)}`;
  }

  function isProductAvailableFlag(product) {
    return Number(product?.is_available ?? 1) === 1;
  }

  function getSelectedVariantLabelFromChips(chips) {
    const list = Array.isArray(chips) ? chips : [];
    const selected = list.find((chip) => chip && chip.isSelected);
    return selected ? String(selected.label || "").trim() : "";
  }

  function buildCheckoutBlockSelection(block, categoryById) {
    const safeBlock = normalizeBlock(block);
    if (!safeBlock) return { items: [], total: 0 };
    const items = [];

    safeBlock.categoryIds.forEach((categoryId) => {
      const sectionKey = getCheckoutSectionKey(safeBlock.id, categoryId);
      const products = Array.isArray(state.checkoutCategoryProducts.get(categoryId)) ? state.checkoutCategoryProducts.get(categoryId) : [];
      if (!products.length) return;

      const savedSelectedProductId = Number(state.checkoutSelectedProductByCategory.get(sectionKey) || 0);
      const firstAvailableProductId = safeBlock.requireAll
        ? Number((products.find((p) => isProductAvailableFlag(p)) || {}).id || 0)
        : 0;
      const selectedProductId = products.some((p) => Number(p?.id || 0) === savedSelectedProductId && isProductAvailableFlag(p))
        ? savedSelectedProductId
        : firstAvailableProductId;
      if (!(selectedProductId > 0)) {
        state.checkoutSelectedProductByCategory.delete(sectionKey);
        return;
      }
      if (!Number.isFinite(selectedProductId) || selectedProductId <= 0) return;

      const selectedProduct = products.find((p) => Number(p?.id || 0) === selectedProductId) || null;
      if (!selectedProduct || !isProductAvailableFlag(selectedProduct)) return;
      const selectedVariantIndex = Number(state.selectedVariants.get(selectedProductId));
      const selectedProductVariants = state.productVariants.get(selectedProductId) || [];
      const primaryVariantGroup = selectedProductVariants[0] || null;
      const variantValuesRaw = Array.isArray(primaryVariantGroup?.values) ? primaryVariantGroup.values : [];
      const variantChips = getVariantChipsForProduct(selectedProductId);
      const hasVariants = variantChips.length > 0;
      const defaultVariantIndexRaw = Number(primaryVariantGroup?.default_value_index);
      const selectedVariantSafeIndex = Number.isFinite(selectedVariantIndex)
        ? selectedVariantIndex
        : (Number.isFinite(defaultVariantIndexRaw) ? defaultVariantIndexRaw : 0);
      const currentPricing = getCurrentProductUnitPricing(selectedProduct, selectedProductId);
      const price = roundPrice(Number(currentPricing?.unitPrice || 0));
      const oldPrice = currentPricing?.hasOldPrice
        ? roundPrice(Number(currentPricing?.oldPrice || 0))
        : 0;
      const variantLabel = hasVariants ? getSelectedVariantLabelFromChips(variantChips) : "";
      const categoryTitle = String((categoryById.get(categoryId) || {}).title || "РљР°С‚РµРіРѕСЂРёСЏ");
      const productName = String(selectedProduct?.name || "РўРѕРІР°СЂ");

      state.checkoutSelectedProductByCategory.set(sectionKey, selectedProductId);
      items.push({
        sectionKey,
        categoryId,
        categoryTitle,
        productId: selectedProductId,
        productName,
        variantLabel,
        variantValues: variantChips.map((chip) => String(chip?.label || "").trim()).filter(Boolean),
        selectedVariantIndex: selectedVariantSafeIndex,
        basePrice: Number(selectedProduct?.price || 0),
        oldBasePrice: Number(selectedProduct?.old_price || 0),
        oldPrice: Number.isFinite(oldPrice) ? oldPrice : 0,
        discount: selectedProduct?.discount && typeof selectedProduct.discount === "object" ? { ...selectedProduct.discount } : null,
        baseUnitId: Number(selectedProduct?.base_unit_id || selectedProduct?.unit_id || 0),
        baseQty: Number(selectedProduct?.base_qty || 1),
        variantUnitId: Number(primaryVariantGroup?.unit_id || selectedProduct?.base_unit_id || selectedProduct?.unit_id || 0),
        variantGroup: primaryVariantGroup ? {
          unit_id: Number(primaryVariantGroup?.unit_id || 0),
          default_value_index: Number(primaryVariantGroup?.default_value_index || 0),
          values: variantValuesRaw,
          discount_tiers: Array.isArray(primaryVariantGroup?.discount_tiers) ? primaryVariantGroup.discount_tiers : [],
        } : null,
        ingredients: buildIngredientsSnapshotForProduct(selectedProductId),
        photoUrl: getProductPhoto(selectedProduct),
        price: Number.isFinite(Number(price)) ? roundPrice(Number(price)) : 0,
      });
    });

    const total = roundPrice(items.reduce((sum, item) => sum + Number(item?.price || 0), 0));
    return { items, total };
  }

  function getCheckoutCurrentTotal() {
    const blocks = getCheckoutBlocks();
    if (!blocks.length) return 0;
    const categoryById = new Map((Array.isArray(state.productCategories) ? state.productCategories : []).map((c) => [Number(c?.id || 0), c]));
    return roundPrice(
      blocks.reduce((sum, block) => {
        const selection = buildCheckoutBlockSelection(block, categoryById);
        return sum + Number(selection?.total || 0);
      }, 0)
    );
  }

  function buildCartItemFromCheckoutBlock(block) {
    const safeBlock = normalizeBlock(block);
    if (!safeBlock) return null;
    const categoryById = new Map((Array.isArray(state.productCategories) ? state.productCategories : []).map((c) => [Number(c?.id || 0), c]));
    const selection = buildCheckoutBlockSelection(safeBlock, categoryById);
    const items = Array.isArray(selection?.items) ? selection.items : [];
    if (!items.length) return null;

    const id = Date.now() + Math.floor(Math.random() * 10000);
    const total = roundPrice(Number(selection?.total || 0));
    if (items.length === 1) {
      const one = items[0] || {};
      const variants = Array.isArray(one?.variantValues) ? one.variantValues.map((v) => String(v || "").trim()).filter(Boolean) : [];
      const selectedVariantIndexRaw = Number(one?.selectedVariantIndex);
      const selectedVariantIndex = Number.isFinite(selectedVariantIndexRaw) && selectedVariantIndexRaw >= 0 ? selectedVariantIndexRaw : 0;
      const variantLabel = String(one?.variantLabel || "").trim();
      const unitPrice = roundPrice(Number(one?.price || total));
      const unitOldPriceRaw = roundPrice(Number(one?.oldPrice || 0));
      const unitOldPrice = unitOldPriceRaw > unitPrice ? unitOldPriceRaw : 0;
      return {
        id,
        type: "product",
        name: String(one.productName || "РўРѕРІР°СЂ"),
        checkout_block_id: Number(safeBlock?.id || 0) || null,
        checkout_require_all: Boolean(safeBlock?.requireAll),
        checkout_category_ids: Array.isArray(safeBlock?.categoryIds) ? [...safeBlock.categoryIds] : [],
        product_id: Number(one?.productId || 0),
        category_name: String(one.categoryTitle || ""),
        qty: 1,
        unit_price_before_discount: unitOldPrice,
        unit_price: unitPrice,
        sum: unitPrice,
        variant: {
          label: variantLabel,
          values: variants,
          selected_index: selectedVariantIndex,
        },
        pricing: {
          base_price: Number(one?.basePrice || 0),
          old_price: Number(one?.oldBasePrice || 0),
          discount: one?.discount && typeof one.discount === "object" ? { ...one.discount } : null,
          base_unit_id: Number(one?.baseUnitId || 0),
          unit_id: Number(one?.variantUnitId || 0),
          base_qty: Number(one?.baseQty || 1),
          variant_group: one?.variantGroup ? {
            unit_id: Number(one.variantGroup?.unit_id || 0),
            default_value_index: Number(one.variantGroup?.default_value_index || 0),
            values: Array.isArray(one.variantGroup?.values) ? [...one.variantGroup.values] : [],
            discount_tiers: Array.isArray(one.variantGroup?.discount_tiers) ? one.variantGroup.discount_tiers.map((tier) => ({ ...tier })) : [],
          } : null,
        },
        ingredients: Array.isArray(one?.ingredients) ? one.ingredients.map((row) => ({ ...row })) : [],
        photos: [String(one.photoUrl || "")].filter(Boolean),
      };
    }
    const sumNew = roundPrice(items.reduce((sum, item) => sum + Number(item?.price || 0), 0));
    const sumOld = roundPrice(items.reduce((sum, item) => {
      const itemPrice = roundPrice(Number(item?.price || 0));
      const itemOld = roundPrice(Number(item?.oldPrice || 0));
      return sum + Number(itemOld > itemPrice ? itemOld : itemPrice);
    }, 0));
    const comboDiscountPercent = sumOld > 0 && sumNew < sumOld
      ? Number((((sumOld - sumNew) / sumOld) * 100).toFixed(6))
      : 0;
    return {
      id,
      type: "combo",
      name: getCheckoutBlockChipTitle(safeBlock, 0, categoryById) || "РљРѕРјР±Рѕ",
      checkout_block_id: Number(safeBlock?.id || 0) || null,
      checkout_require_all: Boolean(safeBlock?.requireAll),
      checkout_category_ids: Array.isArray(safeBlock?.categoryIds) ? [...safeBlock.categoryIds] : [],
      qty: 1,
      combo_discount_percent: comboDiscountPercent,
      unit_price_before_discount: sumOld,
      unit_price: sumNew,
      sum: sumNew,
      photos: items.map((item) => String(item?.photoUrl || "")).filter(Boolean).slice(0, 4),
      sections: items.map((item) => ({
        category_id: Number(item?.categoryId || 0),
        category_name: String(item?.categoryTitle || ""),
        product_id: Number(item?.productId || 0),
        product_name: String(item?.productName || ""),
        photo_url: String(item?.photoUrl || ""),
        price: Number(item?.price || 0),
        old_price: Number(item?.oldPrice || item?.price || 0),
        variant: {
          label: String(item?.variantLabel || ""),
          values: Array.isArray(item?.variantValues) ? item.variantValues.map((v) => String(v || "").trim()).filter(Boolean) : [],
          selected_index: Number.isFinite(Number(item?.selectedVariantIndex)) ? Number(item.selectedVariantIndex) : 0,
        },
        pricing: {
          base_price: Number(item?.basePrice || 0),
          old_price: Number(item?.oldBasePrice || 0),
          discount: item?.discount && typeof item.discount === "object" ? { ...item.discount } : null,
          base_unit_id: Number(item?.baseUnitId || 0),
          unit_id: Number(item?.variantUnitId || 0),
          base_qty: Number(item?.baseQty || 1),
          variant_group: item?.variantGroup ? {
            unit_id: Number(item.variantGroup?.unit_id || 0),
            default_value_index: Number(item.variantGroup?.default_value_index || 0),
            values: Array.isArray(item.variantGroup?.values) ? [...item.variantGroup.values] : [],
            discount_tiers: Array.isArray(item.variantGroup?.discount_tiers) ? item.variantGroup.discount_tiers.map((tier) => ({ ...tier })) : [],
          } : null,
        },
        ingredients: Array.isArray(item?.ingredients) ? item.ingredients.map((row) => ({ ...row })) : [],
      })),
    };
  }

  function recalculateCartItemTotals(cartItem) {
    if (!cartItem || typeof cartItem !== "object") return cartItem;
    const item = { ...cartItem };
    const qty = Math.max(1, Number(item.qty || 1));

    const calcSnapshotPrice = (pricing, selectedIndex, fallbackPrice) => {
      const basePrice = Number(pricing?.base_price || 0);
      const optionTotal = Number(pricing?.option_total || 0);
      const baseUnitId = Number(pricing?.base_unit_id || 0);
      const unitId = Number(pricing?.unit_id || 0);
      const baseQty = Number(pricing?.base_qty || 1) || 1;
      const variantGroup = pricing?.variant_group || null;
      if (!variantGroup || !Array.isArray(variantGroup.values) || !variantGroup.values.length) {
        return roundPrice(Number(fallbackPrice || basePrice || 0) + optionTotal);
      }
      const productLike = {
        price: basePrice,
        base_unit_id: baseUnitId,
        unit_id: baseUnitId || unitId,
        base_qty: baseQty,
      };
      const next = getVariantUnitPriceByBase(productLike, [variantGroup], Number(selectedIndex || 0), basePrice);
      const resolvedBase = Number.isFinite(Number(next)) ? Number(next) : Number(fallbackPrice || basePrice || 0);
      return roundPrice(resolvedBase + optionTotal);
    };

    if (String(item.type || "") === "combo") {
      const sections = Array.isArray(item.sections) ? item.sections.map((section) => ({ ...section })) : [];
      const discountPercent = Number(item?.combo_discount_percent ?? item?.discount_percent ?? 0);
      let sumOld = 0;
      const nextSections = sections.map((section) => {
        const variant = section.variant && typeof section.variant === "object" ? { ...section.variant } : {};
        const values = Array.isArray(variant.values) ? variant.values.map((v) => String(v || "").trim()).filter(Boolean) : [];
        const rawIndex = Number(variant.selected_index);
        const safeIndex = values.length ? Math.max(0, Math.min(values.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0)) : 0;
        variant.selected_index = safeIndex;
        if (values.length) variant.label = String(values[safeIndex] || "").trim();
        const ingredientDiff = calculateIngredientSnapshotDiff(section.ingredients);
        const sectionBasePrice = calcSnapshotPrice(
          section.pricing,
          safeIndex,
          Number(section?.pricing?.base_price || 0)
        );
        const sectionOldPrice = roundPrice(sectionBasePrice + ingredientDiff);
        sumOld += sectionOldPrice;
        return { ...section, old_price: sectionOldPrice, price: sectionOldPrice, variant };
      });
      const totalDiscounted = roundPrice(comboDiscountedPrice(sumOld, discountPercent));
      let assigned = 0;
      item.sections = nextSections.map((section, idx) => {
        const oldPrice = roundPrice(Number(section?.old_price || 0));
        let nextPrice = oldPrice;
        if (sumOld > 0 && Number.isFinite(sumOld)) {
          nextPrice = idx === nextSections.length - 1
            ? roundPrice(totalDiscounted - assigned)
            : roundPrice((oldPrice / sumOld) * totalDiscounted);
          assigned += nextPrice;
        }
        return { ...section, price: roundPrice(Math.max(0, nextPrice)), old_price: oldPrice };
      });
      item.unit_price_before_discount = roundPrice(sumOld);
      item.unit_price = roundPrice(item.sections.reduce((sum, section) => sum + Number(section?.price || 0), 0));
      item.photos = item.sections.map((section) => String(section?.photo_url || "")).filter(Boolean).slice(0, 4);
      item.sum = roundPrice(item.unit_price * qty);
      return item;
    }

    const variant = item.variant && typeof item.variant === "object" ? { ...item.variant } : {};
    const values = Array.isArray(variant.values) ? variant.values.map((v) => String(v || "").trim()).filter(Boolean) : [];
    const rawIndex = Number(variant.selected_index);
    const safeIndex = values.length ? Math.max(0, Math.min(values.length - 1, Number.isFinite(rawIndex) ? rawIndex : 0)) : 0;
    variant.selected_index = safeIndex;
    if (values.length) variant.label = String(values[safeIndex] || "").trim();
    item.variant = variant;
    const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
    const optionTotal = roundPrice(optionItems.reduce((sum, row) => {
      const qty = Math.max(0, Number(row?.qty || 0));
      const basePrice = Number(row?.basePrice || 0);
      const variantDiff = Number(row?.variantDiff || 0);
      return sum + ((basePrice + variantDiff) * qty);
    }, 0));
    if (item.pricing && typeof item.pricing === "object") {
      item.pricing = { ...item.pricing, option_total: optionTotal };
    }

    const ingredientDiff = calculateIngredientSnapshotDiff(item.ingredients);
    const basePrice = calcSnapshotPrice(
      item.pricing,
      safeIndex,
      Number(item?.pricing?.base_price || 0)
    );
    const unitBeforeDiscount = roundPrice(basePrice + ingredientDiff);
    const discountAmount = calculateProductDiscountAmount(unitBeforeDiscount, item?.pricing?.discount);
    const oldBasePrice = calcSnapshotPrice(
      item.pricing && typeof item.pricing === "object"
        ? { ...item.pricing, base_price: Number(item?.pricing?.old_price || 0) }
        : item.pricing,
      safeIndex,
      Number(item?.pricing?.old_price || 0)
    );
    const oldFromDb = roundPrice(oldBasePrice + ingredientDiff);
    const unitPrice = roundPrice(Math.max(0, unitBeforeDiscount - discountAmount));
    const hasApiDiscount = discountAmount > 0;
    const oldUnitPrice = hasApiDiscount ? unitBeforeDiscount : oldFromDb;
    const hasOldUnitPrice = Number.isFinite(oldUnitPrice) && oldUnitPrice > unitPrice;
    item.unit_price_before_discount = hasOldUnitPrice ? roundPrice(oldUnitPrice) : 0;
    item.unit_price = unitPrice;
    if (item.pricing && typeof item.pricing === "object") {
      item.pricing = {
        ...item.pricing,
        unit_before_discount: unitBeforeDiscount,
        discount_amount: roundPrice(discountAmount),
      };
    }
    item.sum = roundPrice(item.unit_price * qty);
    return item;
  }

  function calculateProductDiscountAmount(price, discount) {
    const srcPrice = Number(price || 0);
    if (!(srcPrice > 0) || !discount) return 0;
    const discType = String(discount.discount_type || "").trim();
    const discValue = Number(discount.discount_value || 0);
    let discountAmount = 0;
    if (discType === "percent") {
      if (!(discValue > 0)) return 0;
      discountAmount = srcPrice * (discValue / 100);
    } else if (discType === "fixed") {
      if (!(discValue > 0)) return 0;
      discountAmount = discValue;
    } else if (discType === "special_price") {
      discountAmount = Math.max(0, srcPrice - discValue);
    } else {
      return 0;
    }
    const maxDiscountAmount = Number(discount.max_discount_amount);
    if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && discountAmount > maxDiscountAmount) {
      discountAmount = maxDiscountAmount;
    }
    if (discountAmount > srcPrice) discountAmount = srcPrice;
    return Math.round(discountAmount * 100) / 100;
  }

  function getCurrentProductUnitPricing(product, productId) {
    const pid = Number(productId || 0);
    const variants = state.productVariants.get(pid) || [];
    const selectedIndex = getResolvedVariantIndex(pid, variants);
    const ingredientDiff = calculateIngredientPriceDiff(pid);
    const optionDiff = calculateOptionPriceDiff(pid);
    const variantUnit = getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.price || 0));
    const unitBeforeDiscount = roundPrice(Number(variantUnit || 0) + ingredientDiff + optionDiff);
    const discountAmount = calculateProductDiscountAmount(unitBeforeDiscount, product?.discount);
    const unitPrice = roundPrice(Math.max(0, unitBeforeDiscount - discountAmount));

    const variantOld = getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.old_price || 0));
    const oldFromDb = roundPrice(Number(variantOld || 0) + ingredientDiff + optionDiff);
    const hasApiDiscount = discountAmount > 0;
    const oldPrice = hasApiDiscount ? unitBeforeDiscount : oldFromDb;
    const hasOldPrice = Number.isFinite(oldPrice) && oldPrice > unitPrice;

    return {
      unitPrice,
      oldPrice: hasOldPrice ? oldPrice : 0,
      hasOldPrice,
      unitBeforeDiscount,
      discountAmount: roundPrice(discountAmount),
      optionDiff: roundPrice(optionDiff),
    };
  }

  function addCartItemToRightOrder(orderId, cartItem) {
    const id = Number(orderId || 0);
    if (!(id > 0) || !cartItem) return;
    const idx = state.rightOrders.findIndex((o) => Number(o?.id || 0) === id);
    if (idx < 0) return;
    const order = state.rightOrders[idx] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const list = Array.isArray(form.cartItems) ? [...form.cartItems] : [];
    list.push(cartItem);
    updateRightOrderCartItems(id, list, { render: false });
  }

  function getProductById(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return null;
    const fromCurrent = (Array.isArray(state.currentProducts) ? state.currentProducts : []).find((p) => Number(p?.id || 0) === pid);
    if (fromCurrent) return fromCurrent;
    const fromCache = state.productByIdCache.get(pid);
    if (fromCache) return fromCache;
    for (const list of state.checkoutCategoryProducts.values()) {
      const found = (Array.isArray(list) ? list : []).find((p) => Number(p?.id || 0) === pid);
      if (found) return found;
    }
    return null;
  }

  function getSelectedOptionItemsForProduct(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return [];
    const byGroup = state.optionSelections.get(pid);
    if (!(byGroup instanceof Map) || byGroup.size === 0) return [];
    const out = [];
    for (const [groupId, entry] of byGroup.entries()) {
      const rows = Array.isArray(entry?.items) ? entry.items : [];
      rows.forEach((row) => {
        const id = Number(row?.id || 0);
        if (!(id > 0)) return;
        out.push({
          id,
          group_id: Number(groupId || 0),
          label: String(row?.label || "").trim(),
          qty: Math.max(0, Number(row?.qty || 0)),
          basePrice: Number(row?.basePrice || 0),
          variantDiff: Number(row?.variantDiff || 0),
          variantIndex: Number.isFinite(Number(row?.variantIndex)) ? Number(row.variantIndex) : null,
        });
      });
    }
    return out;
  }

  function buildCartItemFromProduct(productId, qty) {
    const pid = Number(productId || 0);
    const safeQty = Math.max(1, Number(qty || 1));
    if (!(pid > 0)) return null;
    const product = getProductById(pid);
    if (!product) return null;
    const productVariants = state.productVariants.get(pid) || [];
    const primaryVariantGroup = productVariants[0] || null;
    const variantChips = getVariantChipsForProduct(pid);
    const variantValues = variantChips.map((chip) => String(chip?.label || "").trim()).filter(Boolean);
    const resolvedVariantIndex = getResolvedVariantIndex(pid, productVariants);
    const selectedVariantIndex = variantValues.length
      ? Math.max(0, Math.min(variantValues.length - 1, Number.isFinite(resolvedVariantIndex) ? resolvedVariantIndex : Number(primaryVariantGroup?.default_value_index || 0)))
      : 0;
    const optionItems = getSelectedOptionItemsForProduct(pid);
    const optionTotal = roundPrice(calculateOptionPriceDiff(pid));
    const variantLabel = variantValues.length ? String(variantValues[selectedVariantIndex] || "").trim() : "";
    const item = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      type: "product",
      name: String(product?.name || "РўРѕРІР°СЂ"),
      product_id: pid,
      qty: safeQty,
      photos: [String(getProductPhoto(product) || "")].filter(Boolean),
      variant: {
        label: variantLabel,
        values: variantValues,
        selected_index: selectedVariantIndex,
      },
      pricing: {
        base_price: Number(product?.price || 0),
        old_price: Number(product?.old_price || 0),
        option_total: optionTotal,
        discount: product?.discount && typeof product.discount === "object" ? { ...product.discount } : null,
        base_unit_id: Number(product?.base_unit_id || product?.unit_id || 0),
        unit_id: Number(primaryVariantGroup?.unit_id || product?.base_unit_id || product?.unit_id || 0),
        base_qty: Number(product?.base_qty || 1),
        variant_group: primaryVariantGroup ? {
          unit_id: Number(primaryVariantGroup?.unit_id || 0),
          default_value_index: Number(primaryVariantGroup?.default_value_index || 0),
          values: Array.isArray(primaryVariantGroup?.values) ? [...primaryVariantGroup.values] : [],
          discount_tiers: Array.isArray(primaryVariantGroup?.discount_tiers) ? primaryVariantGroup.discount_tiers.map((tier) => ({ ...tier })) : [],
        } : null,
      },
      option_items: optionItems,
      ingredients: buildIngredientsSnapshotForProduct(pid),
      auto_add: 0,
      auto_add_group_id: null,
    };
    return recalculateCartItemTotals(item);
  }

  function getProductCardQty(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return 1;
    const rawQty = Number(state.quantities.get(pid));
    if (!Number.isFinite(rawQty)) return 1;
    return Math.max(1, Math.trunc(rawQty));
  }

  function setProductCardQty(productId, qtyRaw) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return;
    const qty = Math.max(1, Math.trunc(Number(qtyRaw || 0)));
    state.quantities.set(pid, qty);
  }

  function toSignatureNumber(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return 0;
    return Math.round(num * 1000000) / 1000000;
  }

  function buildProductConfigSignatureFromCartItem(item) {
    if (!item || typeof item !== "object") return "";
    if (String(item?.type || "product") !== "product") return "";
    const productId = Number(item?.product_id || 0);
    if (!(productId > 0)) return "";

    const variantIndex = Number.isFinite(Number(item?.variant?.selected_index))
      ? Number(item.variant.selected_index)
      : 0;
    const options = (Array.isArray(item?.option_items) ? item.option_items : [])
      .map((row) => ({
        groupId: Number(row?.group_id || 0),
        itemId: Number(row?.id || 0),
        qty: toSignatureNumber(row?.qty),
        variantIndex: Number.isFinite(Number(row?.variantIndex)) ? Number(row.variantIndex) : null,
      }))
      .filter((row) => row.groupId > 0 && row.itemId > 0 && row.qty > 0)
      .sort((a, b) => {
        if (a.groupId !== b.groupId) return a.groupId - b.groupId;
        if (a.itemId !== b.itemId) return a.itemId - b.itemId;
        const aVariant = a.variantIndex == null ? -1 : a.variantIndex;
        const bVariant = b.variantIndex == null ? -1 : b.variantIndex;
        return aVariant - bVariant;
      });
    const ingredients = (Array.isArray(item?.ingredients) ? item.ingredients : [])
      .map((row) => ({
        ingredientId: Number(row?.ingredient_id || 0),
        qty: toSignatureNumber(row?.qty),
        unitId: Number(row?.unit_id || 0),
      }))
      .filter((row) => row.ingredientId > 0)
      .sort((a, b) => a.ingredientId - b.ingredientId);

    return JSON.stringify({
      productId,
      variantIndex,
      options,
      ingredients,
    });
  }

  function upsertProductCardItemQtyInActiveOrder(productId, qtyRaw) {
    const pid = Number(productId || 0);
    const requestedQty = Math.max(0, Math.trunc(Number(qtyRaw || 0)));
    if (!(pid > 0)) return false;

    const signatureSeed = buildCartItemFromProduct(pid, 1);
    if (!signatureSeed) return false;
    const signature = buildProductConfigSignatureFromCartItem(signatureSeed);
    if (!signature) return false;

    if (requestedQty > 0 && !state.rightActiveOrderId) openRightNewOrderTab();
    const orderId = Number(state.rightActiveOrderId || 0);
    if (!(orderId > 0)) return false;
    const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
    if (orderIndex < 0) return false;

    const order = state.rightOrders[orderIndex] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((row) => ({ ...row })) : [];
    const existingIndex = cartItems.findIndex((row) => buildProductConfigSignatureFromCartItem(row) === signature);

    if (requestedQty <= 0) {
      if (existingIndex < 0) return false;
      markRightOrderAutoAddDismissedByCartItem(orderId, cartItems[existingIndex]);
      cartItems.splice(existingIndex, 1);
    } else {
      const nextItem = buildCartItemFromProduct(pid, requestedQty);
      if (!nextItem) return false;
      if (existingIndex >= 0) {
        nextItem.id = Number(cartItems[existingIndex]?.id || nextItem.id);
        cartItems[existingIndex] = nextItem;
      } else {
        cartItems.push(nextItem);
      }
    }

    return updateRightOrderCartItems(orderId, cartItems, { render: false });
  }

  function resetProductCardToDefault(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return;
    const variants = state.productVariants.get(pid) || [];
    if (Array.isArray(variants) && variants.length) {
      const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
      const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
      const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
      state.selectedVariants.set(pid, safeDefault);
    } else {
      state.selectedVariants.delete(pid);
    }

    const ingredients = state.productIngredients.get(pid) || [];
    const qtyMap = new Map();
    ingredients.forEach((ing) => {
      const ingId = Number(ing?.ingredient_id || 0);
      if (!(ingId > 0)) return;
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      let initialQty = Math.max(min, Math.min(max, defaultQty));
      if (step > 0) {
        const stepsFromMin = Math.round((initialQty - min) / step);
        initialQty = min + (stepsFromMin * step);
        initialQty = Math.max(min, Math.min(max, initialQty));
      }
      qtyMap.set(ingId, initialQty);
    });
    state.ingredientStateByProduct.set(pid, qtyMap);

    state.optionSelections.delete(pid);
    state.quantities.set(pid, 1);
  }

  function quickAddProductToCart(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return false;
    if (!state.rightActiveOrderId) openRightNewOrderTab();
    const orderId = Number(state.rightActiveOrderId || 0);
    if (!(orderId > 0)) return false;
    const qtyToAdd = getProductCardQty(pid);
    const cartItem = buildCartItemFromProduct(pid, qtyToAdd);
    if (!cartItem) return false;
    addCartItemToRightOrder(orderId, cartItem);
    resetProductCardToDefault(pid);
    renderRightOrderTabs();
    renderProducts(state.currentProducts);
    return true;
  }

  function comboDiscountedPrice(price, discountPercent) {
    const p = Number(price) || 0;
    const d = Number(discountPercent) || 0;
    return roundPrice(d >= 100 ? 0 : p * (1 - (d / 100)));
  }

  async function ensureProductById(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return null;
    const existing = getProductById(pid);
    if (existing) {
      state.productByIdCache.set(pid, existing);
      return existing;
    }
    if (state.productByIdCache.has(pid)) return state.productByIdCache.get(pid);
    try {
      const json = await apiJson(`/api/public/products/${pid}`);
      const product = json?.data || null;
      state.productByIdCache.set(pid, product);
      return product;
    } catch {
      state.productByIdCache.set(pid, null);
      return null;
    }
  }

  async function resolveComboDetails(comboId) {
    const id = Number(comboId || 0);
    if (!(id > 0)) return null;
    if (state.comboDetailsCache.has(id)) return state.comboDetailsCache.get(id);
    try {
      const json = await apiJson(`/api/public/combos/${id}`);
      const data = json?.data || null;
      state.comboDetailsCache.set(id, data);
      return data;
    } catch {
      state.comboDetailsCache.delete(id);
      return null;
    }
  }

  function getComboOverlayElements() {
    const backdrop = document.getElementById("newOrderComboOverlay");
    const list = document.getElementById("newOrderComboOverlayList");
    const qtyValue = document.getElementById("newOrderComboOverlayQtyValue");
    const addBtn = document.getElementById("newOrderComboOverlayAddBtn");
    const discountBadge = document.getElementById("newOrderComboOverlayDiscount");
    return { backdrop, list, qtyValue, addBtn, discountBadge };
  }

  function ensureComboOverlay() {
    if (document.getElementById("newOrderComboOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderComboOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet new-order-product-sheet new-order-combo-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="combo-overlay-back"><i class="fas fa-arrow-left"></i></button>
          <span id="newOrderComboOverlayDiscount" class="shop-sheet-discount-badge hidden"></span>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar new-order-product-sheet-list" id="newOrderComboOverlayList"></div>
        <div class="new-order-product-sheet-footer shop-pd-footer">
          <div class="qty-pill qty-pill--muted new-order-product-sheet-qty">
            <button class="qty-pill__btn qty-pill__btn--minus" type="button" data-action="combo-overlay-qty-minus">−</button>
            <span class="qty-pill__center" id="newOrderComboOverlayQtyValue">1</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="combo-overlay-qty-plus">+</button>
          </div>
          <button class="shop-checkout-btn shop-pd-action new-order-product-sheet-add shop-combo-action" type="button" id="newOrderComboOverlayAddBtn" data-action="combo-overlay-add">РІ РєРѕСЂР·РёРЅСѓ</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function resetComboModalState() {
    state.comboModal.comboId = 0;
    state.comboModal.combo = null;
    state.comboModal.qty = 1;
    state.comboModal.mode = "add";
    state.comboModal.editOrderId = 0;
    state.comboModal.editCartItemId = 0;
    state.comboModal.selectedIndexByBlock = [];
    state.comboModal.selectionStateByBlock = [];
    state.comboModal.view = "main";
    state.comboModal.pickerBlockIndex = -1;
    state.comboModal.expandedPickerProductIndex = null;
    state.comboModal.pickerRenderToken = 0;
  }

  function closeComboOverlay() {
    const { backdrop, list } = getComboOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
    if (list) list.innerHTML = "";
    resetComboModalState();
  }

  function makeEmptyComboBlockState() {
    return {
      product_id: null,
      variant_label: "",
      variant_group_id: null,
      variant_group_title: "",
      variant_unit: "",
      unit_id: null,
      variant_value_index: null,
      ingredients_display: [],
      unit_price_override: null,
      unit_price_before_discount: null,
    };
  }

  function cloneComboValue(value) {
    if (Array.isArray(value)) return value.map((x) => cloneComboValue(x));
    if (value && typeof value === "object") {
      const out = {};
      Object.keys(value).forEach((k) => { out[k] = cloneComboValue(value[k]); });
      return out;
    }
    return value;
  }

  function getComboSeedSelectionsFromCartItem(item) {
    if (!item || typeof item !== "object") return [];
    const explicit = Array.isArray(item?.selections) ? item.selections : [];
    const sections = Array.isArray(item?.sections) ? item.sections : [];
    if (!sections.length) {
      return explicit.length ? explicit.map((s) => cloneComboValue(s)) : [];
    }

    const maxLength = Math.max(sections.length, explicit.length);
    const out = [];
    for (let idx = 0; idx < maxLength; idx += 1) {
      const section = sections[idx];
      const fallbackRaw = explicit[idx];
      const fallback = fallbackRaw && typeof fallbackRaw === "object" ? fallbackRaw : null;
      if (!section || typeof section !== "object") {
        if (fallback) out.push(cloneComboValue(fallback));
        continue;
      }

      const variant = section?.variant && typeof section.variant === "object" ? section.variant : {};
      const pricing = section?.pricing && typeof section.pricing === "object" ? section.pricing : {};
      const variantGroup = pricing?.variant_group && typeof pricing.variant_group === "object"
        ? pricing.variant_group
        : {};
      const mappedIngredients = Array.isArray(section?.ingredients)
        ? section.ingredients.map((ing) => ({
            ingredient_id: Number(ing?.ingredient_id || 0) || null,
            product_id: Number(ing?.ingredient_id || 0) || null,
            quantity: Number(ing?.qty ?? ing?.quantity ?? 0),
            qty: Number(ing?.qty ?? ing?.quantity ?? 0),
            unit: String(ing?.unit_label || ing?.unit || ""),
            unit_id: Number(ing?.unit_id || 0) || null,
            name: String(ing?.ingredient_name || ing?.name || ""),
          }))
        : [];

      const next = {
        block_index: Number.isFinite(Number(fallback?.block_index)) ? Number(fallback.block_index) : idx,
        block_id: Number(section?.block_id || section?.category_id || fallback?.block_id || 0) || null,
        block_title: String(section?.block_title || section?.category_name || fallback?.block_title || ""),
        product_id: Number(section?.product_id || fallback?.product_id || 0),
        product_name: String(section?.product_name || fallback?.product_name || ""),
        product_photo: String(section?.photo_url || fallback?.product_photo || ""),
        variant_label: String(variant?.label || fallback?.variant_label || ""),
        variant_group_id: Number(
          pricing?.variant_group_id
          || variantGroup?.id
          || variantGroup?.variant_group_id
          || fallback?.variant_group_id
          || 0
        ) || null,
        variant_value_index: Number.isFinite(Number(variant?.selected_index))
          ? Number(variant.selected_index)
          : (Number.isFinite(Number(fallback?.variant_value_index)) ? Number(fallback.variant_value_index) : null),
        unit_id: Number(pricing?.unit_id || fallback?.unit_id || 0) || null,
        variant_group_title: String(section?.variant_group_title || variantGroup?.title || fallback?.variant_group_title || ""),
        variant_unit: String(section?.variant_unit || fallback?.variant_unit || getVariantUnitLabel(variantGroup) || ""),
        unit_price_override: Number.isFinite(Number(section?.price))
          ? Number(section.price)
          : (Number.isFinite(Number(fallback?.unit_price_override)) ? Number(fallback.unit_price_override) : null),
        unit_price_before_discount: Number.isFinite(Number(section?.old_price))
          ? Number(section.old_price)
          : (Number.isFinite(Number(fallback?.unit_price_before_discount)) ? Number(fallback.unit_price_before_discount) : null),
        ingredients_display: mappedIngredients.length
          ? mappedIngredients
          : (Array.isArray(fallback?.ingredients_display) ? fallback.ingredients_display.map((ing) => cloneComboValue(ing)) : []),
      };
      out.push(next);
    }

    return out.filter((row) => Number(row?.product_id || 0) > 0);
  }

  async function hydrateComboBlockSelection(blockIndex, opts = {}) {
    const combo = state.comboModal.combo;
    if (!combo) return;
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const block = blocks[Number(blockIndex)];
    if (!block) return;
    const products = Array.isArray(block?.products) ? block.products : [];
    if (!products.length) return;
    let selectedIdx = Number(state.comboModal.selectedIndexByBlock[blockIndex] || 0);
    if (!Number.isFinite(selectedIdx)) selectedIdx = 0;
    selectedIdx = Math.max(0, Math.min(products.length - 1, selectedIdx));
    state.comboModal.selectedIndexByBlock[blockIndex] = selectedIdx;
    const selected = products[selectedIdx];
    const productId = Number(selected?.product_id || 0);
    if (!(productId > 0)) return;
    const product = await ensureProductById(productId);
    const productLike = product || { id: productId, price: Number(selected?.price || 0) };
    await loadVariantsForProducts([productLike]);
    await loadIngredientsForProducts([productLike]);
    const variants = state.productVariants.get(productId) || [];
    const ingredients = state.productIngredients.get(productId) || [];
    const discountPercent = Number(combo?.discount_percent || 0);
    const preferSavedState = opts?.preferSavedState !== false;
    const currentRaw = state.comboModal.selectionStateByBlock[blockIndex];
    const current = currentRaw && typeof currentRaw === "object" ? currentRaw : makeEmptyComboBlockState();
    const hasSavedForProduct =
      preferSavedState &&
      Number(current?.product_id || 0) === productId &&
      (Number.isFinite(Number(current?.variant_value_index)) || (Array.isArray(current?.ingredients_display) && current.ingredients_display.length > 0));
    const vGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
    const values = Array.isArray(vGroup?.values) ? vGroup.values : [];
    let variantIndex = 0;
    if (hasSavedForProduct && Number.isFinite(Number(current?.variant_value_index))) {
      variantIndex = Number(current.variant_value_index);
    } else if (vGroup?.default_value_index != null && Number.isFinite(Number(vGroup.default_value_index))) {
      variantIndex = Number(vGroup.default_value_index);
    }
    if (values.length) variantIndex = Math.max(0, Math.min(values.length - 1, variantIndex));
    else variantIndex = 0;
    const variantLabel = values.length ? String(values[variantIndex] || "") : "";
    const ingredientQty = new Map();
    if (hasSavedForProduct && Array.isArray(current?.ingredients_display) && current.ingredients_display.length) {
      current.ingredients_display.forEach((ing) => {
        const ingId = Number(ing?.ingredient_id || 0);
        if (ingId > 0) ingredientQty.set(ingId, Number(ing?.qty ?? ing?.quantity ?? 0));
      });
    }
    ingredients.forEach((ing) => {
      const ingId = Number(ing?.ingredient_id || 0);
      if (!(ingId > 0)) return;
      if (!ingredientQty.has(ingId)) ingredientQty.set(ingId, Number(ing?.quantity ?? 0));
    });

    const basePrice = Number(product?.price || selected?.price || 0);
    let unitPriceBeforeDiscount = Array.isArray(variants) && variants.length
      ? Number(getVariantUnitPriceByBase(productLike, variants, variantIndex, basePrice) || 0)
      : basePrice;
    ingredients.forEach((ing) => {
      const ingId = Number(ing?.ingredient_id || 0);
      if (!(ingId > 0)) return;
      const currentQty = Number(ingredientQty.get(ingId) ?? 0);
      const baseQty = Number(ing?.quantity ?? 1);
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
        ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
        : (Number.isFinite(pricePerUnit) ? (currentQty - baseQty) * pricePerUnit : 0);
      unitPriceBeforeDiscount += diff;
    });
    unitPriceBeforeDiscount = Math.max(0, unitPriceBeforeDiscount);
    const nextState = {
      ...makeEmptyComboBlockState(),
      product_id: productId,
      variant_label: String(variantLabel || ""),
      variant_group_id: vGroup && (vGroup.id || vGroup.variant_group_id) ? Number(vGroup.id || vGroup.variant_group_id) : null,
      variant_group_title: String(vGroup?.title || vGroup?.title_label || ""),
      variant_unit: String(vGroup?.unit_short_title || vGroup?.unit_title || vGroup?.unit_code || ""),
      unit_id: vGroup?.unit_id != null ? Number(vGroup.unit_id) : null,
      variant_value_index: Number.isFinite(Number(variantIndex)) ? Number(variantIndex) : 0,
      unit_price_before_discount: roundPrice(unitPriceBeforeDiscount),
      unit_price_override: roundPrice(comboDiscountedPrice(unitPriceBeforeDiscount, discountPercent)),
      ingredients_display: ingredients.map((ing) => {
        const ingId = Number(ing?.ingredient_id || 0);
        const qty = Number(ingredientQty.get(ingId) ?? Number(ing?.quantity ?? 0));
        return {
          ingredient_id: ingId,
          name: String(ing?.ingredient_name || ing?.name || ""),
          qty,
          quantity: qty,
          unit: String(ing?.unit_short_title || ing?.unit_title || ing?.unit_code || ""),
          unit_id: ing?.unit_id != null ? Number(ing.unit_id) : null,
        };
      }),
    };
    state.comboModal.selectionStateByBlock[blockIndex] = nextState;
  }

  async function hydrateComboSelectionsFromDefaults() {
    const combo = state.comboModal.combo;
    if (!combo) return;
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    await Promise.all(blocks.map((_block, idx) => hydrateComboBlockSelection(idx, { preferSavedState: true })));
  }

  function formatQtyPlain(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num)) return "0";
    if (Number.isInteger(num)) return String(num);
    return String(Math.round(num * 1000) / 1000).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  function getComboSelectedProduct(blockIndex) {
    const combo = state.comboModal.combo;
    if (!combo) return null;
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const block = blocks[Number(blockIndex)];
    if (!block) return null;
    const products = Array.isArray(block?.products) ? block.products : [];
    if (!products.length) return null;
    const rawIdx = Number(state.comboModal.selectedIndexByBlock[Number(blockIndex)] || 0);
    const idx = Number.isFinite(rawIdx) ? Math.max(0, Math.min(products.length - 1, rawIdx)) : 0;
    return products[idx] || null;
  }

  function getComboVariantDisplayValues(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return [];
    const variants = state.productVariants.get(pid) || [];
    if (!Array.isArray(variants) || !variants.length) return [];
    const group = variants[0];
    const values = Array.isArray(group?.values) ? group.values : [];
    const unit = getVariantUnitLabel(group);
    return values
      .map((value) => {
        const label = toVariantLabel(value);
        if (!label) return "";
        const hasLetters = /[a-zР°-СЏ]/i.test(label);
        return unit && !hasLetters ? `${label} ${unit}` : label;
      })
      .filter(Boolean);
  }

  function buildComboIngredientSnapshot(productId, ingredientsDisplay) {
    const pid = Number(productId || 0);
    const base = buildIngredientsSnapshotForProduct(pid);
    const selectedRows = Array.isArray(ingredientsDisplay) ? ingredientsDisplay : [];
    if (!base.length || !selectedRows.length) return base;
    const byId = new Map();
    const byName = new Map();
    selectedRows.forEach((row) => {
      const qty = Number(row?.qty ?? row?.quantity ?? 0);
      if (!Number.isFinite(qty)) return;
      const ingId = Number(row?.ingredient_id || 0);
      if (ingId > 0) byId.set(ingId, qty);
      const nameKey = normalizeCompareToken(row?.name || row?.ingredient_name || "");
      if (nameKey) byName.set(nameKey, qty);
    });
    return base.map((row) => {
      const ingId = Number(row?.ingredient_id || 0);
      if (byId.has(ingId)) return { ...row, qty: Number(byId.get(ingId) || 0) };
      const nameKey = normalizeCompareToken(row?.ingredient_name || row?.name || "");
      if (nameKey && byName.has(nameKey)) {
        return { ...row, qty: Number(byName.get(nameKey) || 0) };
      }
      return row;
    });
  }

  function calculateComboOldSum() {
    const combo = state.comboModal.combo;
    if (!combo) return 0;
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    return roundPrice(
      blocks.reduce((sum, _block, idx) => {
        const selected = getComboSelectedProduct(idx);
        if (!selected) return sum;
        const rowState = state.comboModal.selectionStateByBlock[idx] || {};
        const oldPrice = rowState.unit_price_before_discount != null && Number.isFinite(Number(rowState.unit_price_before_discount))
          ? Number(rowState.unit_price_before_discount)
          : Number(selected?.price || 0);
        return sum + oldPrice;
      }, 0)
    );
  }

  function buildComboSelections() {
    const combo = state.comboModal.combo;
    if (!combo) return [];
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const discountPercent = Number(combo?.discount_percent || 0);
    const rows = blocks.map((_block, blockIndex) => {
      const selected = getComboSelectedProduct(blockIndex);
      if (!selected) return null;
      const rawState = state.comboModal.selectionStateByBlock[blockIndex] || {};
      const stateProductId = Number(rawState?.product_id || 0);
      const selectedProductId = Number(selected?.product_id || 0);
      const normalizedState = stateProductId === selectedProductId
        ? rawState
        : makeEmptyComboBlockState();
      const oldPrice = normalizedState.unit_price_before_discount != null && Number.isFinite(Number(normalizedState.unit_price_before_discount))
        ? Number(normalizedState.unit_price_before_discount)
        : Number(selected?.price || 0);
      return {
        blockIndex,
        block: blocks[blockIndex],
        selected,
        state: normalizedState,
        oldPrice: roundPrice(oldPrice),
      };
    }).filter(Boolean);

    if (!rows.length) return [];
    const sumOld = roundPrice(rows.reduce((sum, row) => sum + Number(row?.oldPrice || 0), 0));
    const discountedTotal = roundPrice(comboDiscountedPrice(sumOld, discountPercent));
    const useProportional = sumOld > 0 && Number.isFinite(sumOld);
    let assigned = 0;

    return rows.map((row, idx) => {
      const isLast = idx === rows.length - 1;
      const sectionPrice = useProportional
        ? (isLast ? roundPrice(discountedTotal - assigned) : roundPrice((Number(row.oldPrice || 0) / sumOld) * discountedTotal))
        : roundPrice(comboDiscountedPrice(row.oldPrice, discountPercent));
      assigned += sectionPrice;
      return {
        block_index: Number(row.blockIndex || 0),
        block_id: Number(row?.block?.block_id || 0),
        block_title: String(row?.block?.block_title || "").trim(),
        product_id: Number(row?.selected?.product_id || 0),
        product_name: String(row?.selected?.product_name || "").trim(),
        product_description_short: String(row?.selected?.product_description_short || "").trim(),
        product_photo: String(row?.selected?.product_photo || "").trim(),
        unit_price_override: roundPrice(sectionPrice),
        unit_price_before_discount: roundPrice(row.oldPrice),
        variant_label: String(row?.state?.variant_label || "").trim(),
        variant_group_id: row?.state?.variant_group_id != null ? Number(row.state.variant_group_id) : null,
        variant_value_index: row?.state?.variant_value_index != null ? Number(row.state.variant_value_index) : null,
        unit_id: row?.state?.unit_id != null ? Number(row.state.unit_id) : null,
        variant_group_title: String(row?.state?.variant_group_title || "").trim(),
        variant_unit: String(row?.state?.variant_unit || "").trim(),
        ingredients_display: Array.isArray(row?.state?.ingredients_display)
          ? row.state.ingredients_display.map((ing) => ({ ...ing }))
          : [],
      };
    });
  }

  function renderComboDetailsLinesHtml(selection) {
    const lineRows = [];
    const variantLabel = String(selection?.variant_label || "").trim();
    if (variantLabel) {
      lineRows.push(`• ${escapeHtml(variantLabel)}`);
    }
    const ingredients = Array.isArray(selection?.ingredients_display) ? selection.ingredients_display : [];
    ingredients.forEach((ing) => {
      const qty = Number(ing?.qty ?? ing?.quantity ?? 0);
      const name = String(ing?.name || ing?.ingredient_name || "").trim();
      if (!name) return;
      const unit = String(ing?.unit || ing?.unit_label || "").trim();
      const qtyLabel = formatQtyPlain(qty);
      lineRows.push(`• ${escapeHtml(`${qtyLabel}${unit ? ` ${unit}` : ""} ${name}`.trim())}`);
    });
    if (!lineRows.length) {
      const fallback = String(selection?.product_description_short || "").trim();
      if (!fallback) return "";
      return `<div class="cart-sub-details"><div class="cart-sub-detail-item">${escapeHtml(fallback)}</div></div>`;
    }
    return `<div class="cart-sub-details">${lineRows.map((line) => `<div class="cart-sub-detail-item">${line}</div>`).join("")}</div>`;
  }

  function renderComboOverlayMain() {
    const { list } = getComboOverlayElements();
    if (!list) return;
    const combo = state.comboModal.combo;
    if (!combo) {
      list.innerHTML = "";
      return;
    }
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const selections = buildComboSelections();
    const selByBlock = new Map(selections.map((row) => [Number(row?.block_index || 0), row]));
    const rowsHtml = blocks.map((block, blockIndex) => {
      const selected = getComboSelectedProduct(blockIndex);
      if (!selected) return "";
      const row = selByBlock.get(blockIndex) || {};
      const newPrice = roundPrice(Number(row?.unit_price_override || 0));
      const oldPrice = roundPrice(Number(row?.unit_price_before_discount || Number(selected?.price || 0)));
      const name = String(selected?.product_name || "РўРѕРІР°СЂ");
      const photo = resolveMediaUrl(selected?.product_photo || "");
      const detailsHtml = renderComboDetailsLinesHtml({
        ...row,
        product_description_short: String(selected?.product_description_short || ""),
      });
      return `
        <div class="cart-row shop-combo-row">
          ${photo ? `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="cart-thumb">вЂ”</div>`}
          <div class="cart-mid shop-combo-mid">
            <div class="cart-title">${escapeHtml(name)}</div>
            ${detailsHtml ? `<div class="cart-sub-container">${detailsHtml}</div>` : ""}
            <div class="shop-combo-row-bottom">
              <button type="button" class="shop-combo-replace" data-action="combo-overlay-open-picker" data-block-index="${blockIndex}">Р—Р°РјРµРЅРёС‚СЊ</button>
              ${oldPrice > newPrice ? `<span class="shop-combo-old">${escapeHtml(toMoney(oldPrice))}</span>` : ""}
              <span class="shop-combo-price">${escapeHtml(toMoney(newPrice))}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    list.innerHTML = `
      <div class="shop-combo-view">
        <div class="shop-combo-detail shop-combo-detail-scroll">
          <div class="shop-pd-meta">
            <div class="shop-pd-title">${escapeHtml(String(combo?.title || "РљРѕРјР±Рѕ"))}</div>
          </div>
          ${String(combo?.description || "").trim() ? `<div class="shop-combo-detail-caption">${escapeHtml(String(combo.description || "").trim())}</div>` : ""}
          <div class="shop-combo-list">${rowsHtml || `<div class="shop-combo-picker-empty">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… С‚РѕРІР°СЂРѕРІ</div>`}</div>
        </div>
      </div>
    `;
  }

  async function ensureComboPickerProductConfig(prod) {
    const productId = Number(prod?.product_id || 0);
    if (!(productId > 0)) {
      return {
        productId: 0,
        product: null,
        variants: [],
        ingredients: [],
        hasVariants: false,
        hasIngredients: false,
        hasConfigurable: false,
      };
    }
    const loaded = await ensureProductById(productId);
    const product = loaded || { id: productId, price: Number(prod?.price || 0), base_qty: 1 };
    await Promise.all([
      loadVariantsForProducts([product]),
      loadIngredientsForProducts([product]),
    ]);
    const variants = state.productVariants.get(productId) || [];
    const ingredients = state.productIngredients.get(productId) || [];
    const variantValues = Array.isArray(variants?.[0]?.values) ? variants[0].values : [];
    const hasVariants = variantValues.length > 0;
    const hasIngredients = ingredients.length > 0;
    return {
      productId,
      product,
      variants,
      ingredients,
      hasVariants,
      hasIngredients,
      hasConfigurable: hasVariants || hasIngredients,
    };
  }

  async function selectComboPickerProduct(blockIndexRaw, productIndexRaw, opts = {}) {
    const combo = state.comboModal.combo;
    if (!combo) return false;
    const blockIndex = Number(blockIndexRaw);
    const productIndex = Number(productIndexRaw);
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const block = blocks[blockIndex];
    const products = Array.isArray(block?.products) ? block.products : [];
    if (!Number.isFinite(blockIndex) || blockIndex < 0 || !products.length) return false;
    if (!Number.isFinite(productIndex) || productIndex < 0 || productIndex >= products.length) return false;

    const currentIndex = Number(state.comboModal.selectedIndexByBlock[blockIndex] || 0);
    const changed = !Number.isFinite(currentIndex) || currentIndex !== productIndex;
    if (changed) {
      state.comboModal.selectedIndexByBlock[blockIndex] = productIndex;
      state.comboModal.selectionStateByBlock[blockIndex] = makeEmptyComboBlockState();
    }
    if (changed || opts?.hydrate !== false) {
      await hydrateComboBlockSelection(blockIndex, {
        preferSavedState: changed ? false : opts?.preferSavedState !== false,
      });
    }
    return true;
  }

  function renderComboOverlayPicker(blockIndexRaw) {
    const { list } = getComboOverlayElements();
    if (!list) return;
    const combo = state.comboModal.combo;
    if (!combo) {
      list.innerHTML = "";
      return;
    }
    const blockIndex = Number(blockIndexRaw);
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    const block = blocks[blockIndex];
    if (!Number.isFinite(blockIndex) || blockIndex < 0 || !block) {
      state.comboModal.view = "main";
      state.comboModal.pickerBlockIndex = -1;
      state.comboModal.expandedPickerProductIndex = null;
      renderComboOverlayMain();
      return;
    }

    const products = Array.isArray(block?.products) ? block.products : [];
    if (!products.length) {
      list.innerHTML = `
        <div class="shop-combo-view">
          <div class="shop-combo-detail shop-combo-detail--picker">
            <div class="shop-pd-meta">
              <div class="shop-pd-title">${escapeHtml(String(block?.block_title || "Р’С‹Р±РµСЂРёС‚Рµ С‚РѕРІР°СЂ"))}</div>
            </div>
            <div class="shop-combo-picker-list">
              <div class="shop-combo-picker-empty">РќРµС‚ С‚РѕРІР°СЂРѕРІ РІ Р±Р»РѕРєРµ</div>
            </div>
          </div>
        </div>
      `;
      return;
    }

    let selectedIdx = Number(state.comboModal.selectedIndexByBlock[blockIndex]);
    if (!Number.isFinite(selectedIdx) || selectedIdx < 0 || selectedIdx >= products.length) {
      const defaultIdx = products.findIndex((p) => Number(p?.is_default || 0) === 1);
      selectedIdx = defaultIdx >= 0 ? defaultIdx : 0;
      state.comboModal.selectedIndexByBlock[blockIndex] = selectedIdx;
    }

    const renderToken = Number(state.comboModal.pickerRenderToken || 0) + 1;
    state.comboModal.pickerRenderToken = renderToken;
    list.innerHTML = `<div class="shop-combo-picker-empty">Р—Р°РіСЂСѓР·РєР°...</div>`;

    void (async () => {
      const configs = await Promise.all(products.map((prod) => ensureComboPickerProductConfig(prod)));
      if (Number(state.comboModal.pickerRenderToken || 0) !== renderToken) return;
      if (String(state.comboModal.view || "") !== "picker") return;
      if (Number(state.comboModal.pickerBlockIndex) !== blockIndex) return;

      const rowStateRaw = state.comboModal.selectionStateByBlock[blockIndex] || {};
      let expandedIndex = Number(state.comboModal.expandedPickerProductIndex);
      if (!Number.isFinite(expandedIndex) || expandedIndex < 0 || expandedIndex >= products.length) expandedIndex = null;
      if (expandedIndex != null && expandedIndex !== selectedIdx) expandedIndex = null;
      state.comboModal.expandedPickerProductIndex = expandedIndex;

      const rowsHtml = products.map((prod, idx) => {
        const pid = Number(prod?.product_id || 0);
        const config = configs[idx] || {};
        const isSelected = idx === selectedIdx;
        const stateRow = isSelected && Number(rowStateRaw?.product_id || 0) === pid
          ? rowStateRaw
          : makeEmptyComboBlockState();
        const photo = resolveMediaUrl(prod?.product_photo || "");
        const title = String(prod?.product_name || "РўРѕРІР°СЂ");
        const oldPrice = isSelected && stateRow.unit_price_before_discount != null
          ? roundPrice(Number(stateRow.unit_price_before_discount || 0))
          : roundPrice(Number(prod?.price || 0));
        const newPrice = isSelected && stateRow.unit_price_override != null
          ? roundPrice(Number(stateRow.unit_price_override || 0))
          : roundPrice(comboDiscountedPrice(Number(prod?.price || 0), Number(combo?.discount_percent || 0)));

        const detailsHtml = renderComboDetailsLinesHtml({
          variant_label: String(stateRow?.variant_label || ""),
          ingredients_display: Array.isArray(stateRow?.ingredients_display) ? stateRow.ingredients_display : [],
          product_description_short: String(prod?.product_description_short || ""),
        });

        const showGear = Boolean(config?.hasConfigurable);
        const isExpanded = isSelected && expandedIndex === idx && showGear;
        const variants = Array.isArray(config?.variants) ? config.variants : [];
        const vGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
        const values = Array.isArray(vGroup?.values) ? vGroup.values : [];
        const vTitle = String(vGroup?.title || "Р’Р°СЂРёР°РЅС‚").trim();
        const vUnit = getVariantUnitLabel(vGroup);
        const stateVariantIdxRaw = Number(stateRow?.variant_value_index);
        const safeVariantIdx = values.length
          ? Math.max(
            0,
            Math.min(
              values.length - 1,
              Number.isFinite(stateVariantIdxRaw)
                ? stateVariantIdxRaw
                : Number(vGroup?.default_value_index || 0)
            )
          )
          : 0;

        const variantsHtml = values.length ? `
          <div class="shop-combo-picker-variants">
            <div class="shop-combo-picker-expand-title">${escapeHtml(vTitle || "Р’Р°СЂРёР°РЅС‚")}</div>
            <div class="shop-combo-picker-variants-row">
              ${values.map((value, variantIndex) => {
                const valueLabel = toVariantLabel(value);
                const hasLetters = /[a-zР°-СЏ]/i.test(valueLabel);
                const chip = vUnit && !hasLetters ? `${valueLabel} ${vUnit}` : valueLabel;
                return `<button
                  type="button"
                  class="shop-combo-picker-variant-btn ${variantIndex === safeVariantIdx ? "is-active" : ""}"
                  data-action="combo-overlay-picker-variant"
                  data-block-index="${blockIndex}"
                  data-product-index="${idx}"
                  data-variant-index="${variantIndex}"
                >${escapeHtml(chip)}</button>`;
              }).join("")}
            </div>
          </div>
        ` : "";

        const ingredients = Array.isArray(config?.ingredients) ? config.ingredients : [];
        const ingredientsById = new Map();
        if (Array.isArray(stateRow?.ingredients_display)) {
          stateRow.ingredients_display.forEach((ing) => {
            const ingId = Number(ing?.ingredient_id || 0);
            if (ingId > 0) ingredientsById.set(ingId, Number(ing?.qty ?? ing?.quantity ?? 0));
          });
        }
        const ingredientsRowsHtml = ingredients.map((ing) => {
          const ingId = Number(ing?.ingredient_id || 0);
          if (!(ingId > 0)) return "";
          const step = Math.max(0.0001, Number(ing?.quantity_step ?? 1) || 1);
          const minRaw = Number(ing?.quantity_min);
          const minQty = Number.isFinite(minRaw) ? Math.max(0, minRaw) : 0;
          const maxRaw = Number(ing?.quantity_max);
          const hasMax = Number.isFinite(maxRaw) && maxRaw > 0;
          const maxQty = hasMax ? maxRaw : Infinity;
          const baseQty = Number(ing?.quantity ?? 0);
          const rawQty = ingredientsById.has(ingId) ? Number(ingredientsById.get(ingId) || 0) : baseQty;
          const currentQty = Math.max(minQty, Math.min(maxQty, Number.isFinite(rawQty) ? rawQty : baseQty));
          const minusDisabled = currentQty <= minQty;
          const plusDisabled = currentQty >= maxQty;
          const unitLabel = String(ing?.unit_short_title || ing?.unit_title || ing?.unit_code || "").trim();
          const qtyLabel = `${formatQtyPlain(currentQty)}${unitLabel ? ` ${unitLabel}` : ""}`;
          const ingName = String(ing?.ingredient_name || ing?.name || "").trim();
          const ingPhotoRaw = Array.isArray(ing?.ingredient_photos) && ing.ingredient_photos.length
            ? ing.ingredient_photos[0]
            : (ing?.ingredient_photo || "");
          const ingPhoto = resolveMediaUrl(ingPhotoRaw);
          return `
            <div class="shop-combo-picker-ingredient-row">
              <div class="shop-combo-picker-ingredient-img">
                ${ingPhoto ? `<img src="${escapeHtml(ingPhoto)}" alt="" />` : ``}
              </div>
              <span class="shop-combo-picker-ingredient-name">${escapeHtml(ingName)}</span>
              <div class="shop-combo-picker-ingredient-qty">
                <button
                  type="button"
                  class="shop-combo-picker-ingredient-btn"
                  data-action="combo-overlay-picker-ing-minus"
                  data-block-index="${blockIndex}"
                  data-product-index="${idx}"
                  data-ingredient-id="${ingId}"
                  data-step="${escapeHtml(String(step))}"
                  ${minusDisabled ? "disabled" : ""}
                >−</button>
                <span class="shop-combo-picker-ingredient-qty-val">${escapeHtml(qtyLabel)}</span>
                <button
                  type="button"
                  class="shop-combo-picker-ingredient-btn"
                  data-action="combo-overlay-picker-ing-plus"
                  data-block-index="${blockIndex}"
                  data-product-index="${idx}"
                  data-ingredient-id="${ingId}"
                  data-step="${escapeHtml(String(step))}"
                  ${plusDisabled ? "disabled" : ""}
                >+</button>
              </div>
            </div>
          `;
        }).filter(Boolean).join("");
        const ingredientsHtml = ingredientsRowsHtml ? `
          <div class="shop-combo-picker-ingredients">
            <div class="shop-combo-picker-expand-title">РЎРѕСЃС‚Р°РІ (РјРѕР¶РЅРѕ РЅР°СЃС‚СЂРѕРёС‚СЊ):</div>
            ${ingredientsRowsHtml}
          </div>
        ` : "";

        const expandedHtml = isExpanded ? `
          <div class="shop-combo-picker-expand" data-action="combo-overlay-picker-expand-noop">
            <div class="shop-combo-picker-expand-inner">
              ${variantsHtml}
              ${ingredientsHtml}
            </div>
          </div>
        ` : "";

        return `
          <div
            class="cart-row shop-combo-picker-row ${isSelected ? "is-selected" : ""}"
            role="button"
            tabindex="0"
            data-action="combo-overlay-picker-select"
            data-block-index="${blockIndex}"
            data-product-index="${idx}"
          >
            ${photo ? `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="cart-thumb">вЂ”</div>`}
            <div class="cart-mid shop-combo-picker-mid">
              <div class="cart-title">${escapeHtml(title)}</div>
              ${detailsHtml ? `<div class="cart-sub-container" ${isExpanded ? `style="display:none;"` : ""}>${detailsHtml}</div>` : ""}
            </div>
            <div class="shop-combo-picker-bottom">
              <div class="shop-combo-picker-price">
                ${oldPrice > newPrice ? `<span class="shop-combo-old">${escapeHtml(toMoney(oldPrice))}</span>` : ""}
                <span class="shop-combo-price">${escapeHtml(toMoney(newPrice))}</span>
              </div>
              <div class="shop-combo-picker-actions">
                ${showGear ? `
                  <button
                    type="button"
                    class="shop-combo-picker-gear ${isExpanded ? "is-open" : ""}"
                    title="РќР°СЃС‚СЂРѕР№РєР° СЃРѕСЃС‚Р°РІР° Рё РІР°СЂРёР°РЅС‚РѕРІ"
                    data-action="combo-overlay-picker-gear"
                    data-block-index="${blockIndex}"
                    data-product-index="${idx}"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
                  </button>
                ` : ``}
                <span
                  class="shop-combo-radio ${isSelected ? "is-selected" : ""}"
                  aria-hidden="true"
                  data-action="combo-overlay-picker-radio"
                  data-block-index="${blockIndex}"
                  data-product-index="${idx}"
                ></span>
              </div>
            </div>
            ${expandedHtml}
          </div>
        `;
      }).join("");

      if (Number(state.comboModal.pickerRenderToken || 0) !== renderToken) return;
      if (String(state.comboModal.view || "") !== "picker") return;
      if (Number(state.comboModal.pickerBlockIndex) !== blockIndex) return;
      list.innerHTML = `
        <div class="shop-combo-view">
          <div class="shop-combo-detail shop-combo-detail--picker shop-combo-detail-scroll">
            <div class="shop-pd-meta">
              <div class="shop-pd-title">${escapeHtml(String(block?.block_title || "Р’С‹Р±РµСЂРёС‚Рµ С‚РѕРІР°СЂ"))}</div>
            </div>
            <div class="shop-combo-picker-list">
              ${rowsHtml || `<div class="shop-combo-picker-empty">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… С‚РѕРІР°СЂРѕРІ РІ Р±Р»РѕРєРµ</div>`}
            </div>
          </div>
        </div>
      `;
    })();
  }

  function renderComboOverlay() {
    const { backdrop, qtyValue, addBtn, discountBadge } = getComboOverlayElements();
    if (!backdrop || backdrop.classList.contains("hidden")) return;
    const combo = state.comboModal.combo;
    if (!combo) return;
    const qty = Math.max(1, Number(state.comboModal.qty || 1));
    state.comboModal.qty = qty;
    if (qtyValue) qtyValue.textContent = String(qty);
    const minusBtn = backdrop.querySelector("[data-action='combo-overlay-qty-minus']");
    if (minusBtn) {
      const disabled = qty <= 1;
      minusBtn.disabled = disabled;
      minusBtn.classList.toggle("is-disabled", disabled);
    }
    const plusBtn = backdrop.querySelector("[data-action='combo-overlay-qty-plus']");
    if (plusBtn) {
      plusBtn.disabled = false;
      plusBtn.classList.remove("is-disabled");
    }

    const selections = buildComboSelections();
    const unitOld = roundPrice(selections.reduce((sum, row) => sum + Number(row?.unit_price_before_discount || 0), 0));
    const unitNew = roundPrice(selections.reduce((sum, row) => sum + Number(row?.unit_price_override || 0), 0));
    const totalOld = roundPrice(unitOld * qty);
    const totalNew = roundPrice(unitNew * qty);
    const saveMode = String(state.comboModal.mode || "add") === "edit";

    if (addBtn) {
      addBtn.innerHTML = `
        <span class="shop-pd-action-prices">
          ${totalOld > totalNew ? `<span class="shop-pd-action-old">${escapeHtml(toMoney(totalOld))}</span>` : ""}
          <span class="shop-checkout-total shop-pd-action-price">${escapeHtml(toMoney(totalNew))}</span>
        </span>
        <span class="shop-pd-action-label">${saveMode ? "СЃРѕС…СЂР°РЅРёС‚СЊ" : "РІ РєРѕСЂР·РёРЅСѓ"}</span>
      `;
    }

    const discountPercent = Number(combo?.discount_percent || 0);
    if (discountBadge) {
      if (discountPercent > 0) {
        const text = Number.isInteger(discountPercent)
          ? String(discountPercent)
          : String(Math.round(discountPercent * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
        discountBadge.textContent = `РЎРєРёРґРєР° ${text}%`;
        discountBadge.classList.remove("hidden");
      } else {
        discountBadge.textContent = "";
        discountBadge.classList.add("hidden");
      }
    }

    if (String(state.comboModal.view || "main") === "picker") {
      renderComboOverlayPicker(Number(state.comboModal.pickerBlockIndex || 0));
    } else {
      renderComboOverlayMain();
    }
  }

  async function buildCartItemFromComboOverlay() {
    const combo = state.comboModal.combo;
    if (!combo) return null;
    const comboId = Number(combo?.id || combo?.combo_id || state.comboModal.comboId || 0);
    if (!(comboId > 0)) return null;
    const qty = Math.max(1, Number(state.comboModal.qty || 1));
    const selections = buildComboSelections();
    if (!selections.length) return null;

    const sections = await Promise.all(selections.map(async (sel) => {
      const productId = Number(sel?.product_id || 0);
      if (!(productId > 0)) return null;
      const product = await ensureProductById(productId);
      const variants = state.productVariants.get(productId) || [];
      const vg = variants[0] || null;
      const variantValuesDisplay = getComboVariantDisplayValues(productId);
      const selectedVariantIndexRaw = Number(sel?.variant_value_index);
      const safeVariantIndex = variantValuesDisplay.length
        ? Math.max(0, Math.min(variantValuesDisplay.length - 1, Number.isFinite(selectedVariantIndexRaw) ? selectedVariantIndexRaw : Number(vg?.default_value_index || 0)))
        : 0;
      const variantLabel = String(sel?.variant_label || variantValuesDisplay[safeVariantIndex] || "").trim();
      const ingredients = buildComboIngredientSnapshot(productId, sel?.ingredients_display);
      return {
        block_index: Number(sel?.block_index || 0),
        block_id: Number(sel?.block_id || 0),
        category_id: Number(sel?.block_id || 0),
        category_name: String(sel?.block_title || "").trim(),
        block_title: String(sel?.block_title || "").trim(),
        product_id: productId,
        product_name: String(sel?.product_name || product?.name || "РўРѕРІР°СЂ").trim(),
        photo_url: String(sel?.product_photo || getProductPhoto(product) || "").trim(),
        price: roundPrice(Number(sel?.unit_price_override || 0)),
        old_price: roundPrice(Number(sel?.unit_price_before_discount || 0)),
        variant: {
          label: variantLabel,
          values: variantValuesDisplay,
          selected_index: safeVariantIndex,
        },
        pricing: {
          base_price: Number(product?.price || sel?.unit_price_before_discount || 0),
          old_price: Number(product?.old_price || 0),
          base_unit_id: Number(product?.base_unit_id || product?.unit_id || 0),
          unit_id: Number(sel?.unit_id || vg?.unit_id || product?.base_unit_id || product?.unit_id || 0),
          base_qty: Number(product?.base_qty || 1),
          variant_group: vg ? {
            unit_id: Number(vg?.unit_id || 0),
            default_value_index: Number(vg?.default_value_index || 0),
            values: Array.isArray(vg?.values) ? [...vg.values] : [],
            discount_tiers: Array.isArray(vg?.discount_tiers) ? vg.discount_tiers.map((tier) => ({ ...tier })) : [],
          } : null,
        },
        ingredients: ingredients.map((row) => ({ ...row })),
      };
    }));

    const validSections = sections.filter(Boolean);
    if (!validSections.length) return null;
    const comboDiscountPercent = Number(combo?.discount_percent || 0);
    const item = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      type: "combo",
      combo_id: comboId,
      combo_title: String(combo?.title || "РљРѕРјР±Рѕ").trim(),
      name: String(combo?.title || "РљРѕРјР±Рѕ").trim(),
      qty,
      combo_discount_percent: comboDiscountPercent,
      unit_price_before_discount: roundPrice(validSections.reduce((sum, section) => sum + Number(section?.old_price || section?.price || 0), 0)),
      unit_price: roundPrice(validSections.reduce((sum, section) => sum + Number(section?.price || 0), 0)),
      sum: 0,
      photos: validSections.map((section) => String(section?.photo_url || "").trim()).filter(Boolean).slice(0, 4),
      selections: selections.map((row) => ({ ...row })),
      sections: validSections.map((section) => ({ ...section })),
    };
    return recalculateCartItemTotals(item);
  }

  async function openComboOverlay(comboId, opts = {}) {
    const id = Number(comboId || 0);
    if (!(id > 0)) return;
    ensureComboOverlay();
    const { backdrop, list } = getComboOverlayElements();
    if (!backdrop) return;
    const combo = await resolveComboDetails(id);
    if (!combo) {
      showNewOrderAlert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043a\u043e\u043c\u0431\u043e");
      return;
    }
    closeProductOverlay();
    state.comboModal.comboId = id;
    state.comboModal.combo = combo;
    state.comboModal.qty = Math.max(1, Number(opts?.mode === "edit" ? opts?.cartItem?.qty : 1) || 1);
    state.comboModal.mode = String(opts?.mode || "add") === "edit" ? "edit" : "add";
    state.comboModal.editOrderId = Number(opts?.orderId || 0);
    state.comboModal.editCartItemId = Number(opts?.cartItemId || 0);
    state.comboModal.view = "main";
    state.comboModal.pickerBlockIndex = -1;
    state.comboModal.expandedPickerProductIndex = null;
    state.comboModal.pickerRenderToken = 0;
    const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
    state.comboModal.selectedIndexByBlock = blocks.map((block) => {
      const products = Array.isArray(block?.products) ? block.products : [];
      const defaultIndex = products.findIndex((row) => Number(row?.is_default || 0) === 1);
      return defaultIndex >= 0 ? defaultIndex : 0;
    });
    state.comboModal.selectionStateByBlock = blocks.map(() => makeEmptyComboBlockState());

    const sourceCartItem = opts?.cartItem && typeof opts.cartItem === "object" ? opts.cartItem : null;
    if (sourceCartItem) {
      const seedRows = getComboSeedSelectionsFromCartItem(sourceCartItem);
      seedRows.forEach((seed, blockIndex) => {
        if (blockIndex < 0 || blockIndex >= blocks.length) return;
        const products = Array.isArray(blocks[blockIndex]?.products) ? blocks[blockIndex].products : [];
        const seedProductId = Number(seed?.product_id || 0);
        if (seedProductId > 0) {
          const foundIdx = products.findIndex((row) => Number(row?.product_id || 0) === seedProductId);
          if (foundIdx >= 0) state.comboModal.selectedIndexByBlock[blockIndex] = foundIdx;
        }
        state.comboModal.selectionStateByBlock[blockIndex] = {
          ...makeEmptyComboBlockState(),
          ...cloneComboValue(seed),
          product_id: seedProductId > 0 ? seedProductId : null,
          variant_value_index: seed?.variant_value_index != null ? Number(seed.variant_value_index) : null,
          variant_group_id: seed?.variant_group_id != null ? Number(seed.variant_group_id) : null,
          unit_id: seed?.unit_id != null ? Number(seed.unit_id) : null,
          unit_price_override: seed?.unit_price_override != null ? Number(seed.unit_price_override) : null,
          unit_price_before_discount: seed?.unit_price_before_discount != null ? Number(seed.unit_price_before_discount) : null,
          ingredients_display: Array.isArray(seed?.ingredients_display) ? seed.ingredients_display.map((ing) => ({ ...ing })) : [],
        };
      });
    }

    backdrop.classList.remove("hidden");
    backdrop.onclick = (ev) => {
      if (ev.target === backdrop) closeComboOverlay();
    };
    if (list) list.innerHTML = `<div class="shop-combo-picker-empty">Р—Р°РіСЂСѓР·РєР°...</div>`;
    await hydrateComboSelectionsFromDefaults();
    renderComboOverlay();
    if (list) list.scrollTop = 0;
  }

  function getProductOverlayElements() {
    const backdrop = document.getElementById("newOrderProductOverlay");
    const list = document.getElementById("newOrderProductOverlayList");
    const qtyValue = document.getElementById("newOrderProductOverlayQtyValue");
    const addBtn = document.getElementById("newOrderProductOverlayAddBtn");
    return { backdrop, list, qtyValue, addBtn };
  }

  function ensureProductOverlay() {
    if (document.getElementById("newOrderProductOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderProductOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet new-order-product-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="product-overlay-close"><i class="fas fa-arrow-left"></i></button>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar new-order-product-sheet-list" id="newOrderProductOverlayList"></div>
        <div class="new-order-product-sheet-footer shop-pd-footer">
          <div class="qty-pill qty-pill--muted new-order-product-sheet-qty">
            <button class="qty-pill__btn qty-pill__btn--minus" type="button" data-action="product-overlay-qty-minus">−</button>
            <span class="qty-pill__center" id="newOrderProductOverlayQtyValue">1</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="product-overlay-qty-plus">+</button>
          </div>
          <button class="shop-checkout-btn shop-pd-action new-order-product-sheet-add" type="button" id="newOrderProductOverlayAddBtn" data-action="product-overlay-add">РІ РєРѕСЂР·РёРЅСѓ</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function closeProductOverlay() {
    const { backdrop, list } = getProductOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
    if (list) list.innerHTML = "";
    state.productModal.productId = 0;
    state.productModal.qty = 1;
    state.productModal.photoIndex = 0;
    state.productModal.expandedOptionItems = new Set();
    state.productModal.expandedOptionGroups = new Set();
    state.productModal.mode = "add";
    state.productModal.editOrderId = 0;
    state.productModal.editCartItemId = 0;
  }

  function applyProductOverlayStateFromCartItem(productId, cartItem) {
    const pid = Number(productId || 0);
    if (!(pid > 0) || !cartItem || typeof cartItem !== "object") return;
    const variantIndex = Number(cartItem?.variant?.selected_index);
    if (Number.isFinite(variantIndex) && variantIndex >= 0) {
      state.selectedVariants.set(pid, variantIndex);
    }

    const ingRows = Array.isArray(cartItem?.ingredients) ? cartItem.ingredients : [];
    if (ingRows.length) {
      const qtyMap = new Map();
      ingRows.forEach((ing) => {
        const ingId = Number(ing?.ingredient_id || 0);
        if (!(ingId > 0)) return;
        qtyMap.set(ingId, Number(ing?.qty ?? 0));
      });
      state.ingredientStateByProduct.set(pid, qtyMap);
    }

    const optionItems = Array.isArray(cartItem?.option_items) ? cartItem.option_items : [];
    const byGroup = new Map();
    optionItems.forEach((row) => {
      const groupId = Number(row?.group_id || 0);
      const itemId = Number(row?.id || 0);
      if (!(groupId > 0) || !(itemId > 0)) return;
      const existing = byGroup.get(groupId) || { type: "single", items: [] };
      existing.items.push({
        id: itemId,
        label: String(row?.label || "").trim(),
        qty: Math.max(0, Number(row?.qty || 0)),
        basePrice: Number(row?.basePrice || 0),
        variantDiff: Number(row?.variantDiff || 0),
        variantIndex: Number.isFinite(Number(row?.variantIndex)) ? Number(row.variantIndex) : null,
      });
      byGroup.set(groupId, existing);
    });
    state.optionSelections.set(pid, byGroup);
  }

  function getProductOverlayOptionGroupsHtml(productId) {
    const pid = Number(productId || 0);
    const groups = Array.isArray(state.productOptionGroups.get(pid)) ? state.productOptionGroups.get(pid) : [];
    if (!groups.length) return "";
    const byGroup = state.optionSelections.get(pid) || new Map();
    const expanded = state.productModal.expandedOptionItems instanceof Set ? state.productModal.expandedOptionItems : new Set();
    const expandedGroups = state.productModal.expandedOptionGroups instanceof Set ? state.productModal.expandedOptionGroups : new Set();
    const blocks = groups.map((group) => {
      const groupId = Number(group?.group_id || group?.id || 0);
      if (!(groupId > 0)) return "";
      const details = state.optionGroupDetails.get(groupId);
      const items = Array.isArray(details?.items) ? details.items : [];
      if (!items.length) return "";
      const detailsGroup = details?.group || null;
      const title = String(detailsGroup?.title || group?.title || "РћРїС†РёСЏ").trim() || "РћРїС†РёСЏ";
      const groupType = getOptionGroupUiType({ ...(detailsGroup || group || {}), items });
      const existing = byGroup.get(groupId);
      const selectionItems = Array.isArray(existing?.items) ? existing.items : [];
      const selById = new Map(selectionItems.map((x) => [Number(x?.id || 0), x]));
      const isRequiredRaw = detailsGroup?.is_required ?? group?.is_required ?? false;
      const isRequired = Number(isRequiredRaw) === 1 || isRequiredRaw === true || String(isRequiredRaw).toLowerCase() === "true";

      if (groupType === "single") {
        if (isRequired && selectionItems.length === 0) {
          const firstItem = items[0];
          if (firstItem && Number(firstItem.id || 0) > 0) {
            const entry = {
              id: Number(firstItem.id),
              label: String(firstItem?.name || firstItem?.product_name || "РџРѕР·РёС†РёСЏ"),
              qty: 1,
              basePrice: getOptionItemBasePrice(firstItem),
              variantDiff: 0,
            };
            byGroup.set(groupId, { type: groupType, items: [entry] });
            state.optionSelections.set(pid, byGroup);
            selById.set(entry.id, entry);
          }
        }

        const selectedItem = items.find((it) => selById.has(Number(it?.id || 0))) || null;
        const selectedEntry = selectedItem ? (selById.get(Number(selectedItem.id)) || null) : null;
        const defaultVariantIndex = selectedItem ? getOptionItemDefaultVariantIndex(selectedItem) : 0;
        const activeVariantIndex = Number.isFinite(Number(selectedEntry?.variantIndex))
          ? Number(selectedEntry.variantIndex)
          : defaultVariantIndex;
        const rowPrice = selectedItem
          ? (getOptionItemBasePrice(selectedItem) + (Number.isFinite(Number(activeVariantIndex)) ? getOptionItemVariantDiff(selectedItem, Number(activeVariantIndex)) : 0))
          : 0;
        const selectedPhoto = selectedItem
          ? resolveMediaUrl((Array.isArray(selectedItem?.product_photos_json) && selectedItem.product_photos_json.length) ? selectedItem.product_photos_json[0] : "")
          : "";
        const selectedName = selectedItem
          ? String(selectedItem?.name || selectedItem?.product_name || "РџРѕР·РёС†РёСЏ")
          : "Р’С‹Р±СЂР°С‚СЊ";
        const isGroupOpen = expandedGroups.has(groupId);

        const listCards = [];
        if (!isRequired) {
          listCards.push(`
            <div class="shop-pd-option-card is-clickable" data-action="product-overlay-opt-select-none" data-group-id="${groupId}">
              <div class="shop-pd-option-card-content">
                <div class="shop-pd-option-thumb">вЂ”</div>
                <div class="shop-pd-option-info">
                  <div class="shop-pd-option-name">РќРµ РІС‹Р±РёСЂР°С‚СЊ</div>
                </div>
              </div>
            </div>
          `);
        }
        listCards.push(...items.map((item) => {
          const itemId = Number(item?.id || 0);
          if (!(itemId > 0)) return "";
          const itemPhoto = resolveMediaUrl((Array.isArray(item?.product_photos_json) && item.product_photos_json.length) ? item.product_photos_json[0] : "");
          const itemName = String(item?.name || item?.product_name || "Позиция");
          const allowVariants = Boolean(detailsGroup?.allow_variants ?? group?.allow_variants ?? false);
          const hasVariants = allowVariants && Array.isArray(item?.variants) && item.variants.length && Array.isArray(item.variants[0]?.values) && item.variants[0].values.length;
          const key = `${groupId}:${itemId}`;
          const variantBlockOpen = expanded.has(key);
          const variants = hasVariants ? item.variants[0].values : [];
          const selected = selById.get(itemId);
          const selectedVariantIndex = Number.isFinite(Number(selected?.variantIndex))
            ? Number(selected.variantIndex)
            : getOptionItemDefaultVariantIndex(item);
          const basePrice = getOptionItemBasePrice(item);
          const variantDiff = Number.isFinite(Number(selected?.variantDiff))
            ? Number(selected.variantDiff)
            : (Number.isFinite(Number(selectedVariantIndex)) ? getOptionItemVariantDiff(item, Number(selectedVariantIndex)) : 0);
          const optionPrice = basePrice + variantDiff;
          return `
            <div class="shop-pd-option-card is-clickable ${selById.has(itemId) ? "is-selected" : ""} ${hasVariants ? "has-variants" : ""}">
              <div class="shop-pd-option-card-content" data-action="product-overlay-opt-select-single" data-group-id="${groupId}" data-item-id="${itemId}">
                ${itemPhoto ? `<img class="shop-pd-option-thumb" src="${escapeHtml(itemPhoto)}" alt="" />` : `<div class="shop-pd-option-thumb">вЂ”</div>`}
                <div class="shop-pd-option-info">
                  <div class="shop-pd-option-name">${escapeHtml(itemName)}</div>
                  <div class="shop-pd-option-price">${escapeHtml(toMoney(optionPrice))}</div>
                </div>
                ${hasVariants ? `<button type="button" class="shop-pd-option-gear-btn" data-action="product-overlay-opt-variants-toggle" data-group-id="${groupId}" data-item-id="${itemId}"><i class="fas fa-cog"></i></button>` : ``}
              </div>
              ${hasVariants && variantBlockOpen ? `<div class="shop-pd-option-variant-accordion is-open"><div class="shop-pd-option-variant-scroll">${variants.map((v, idx) => `<button type="button" class="shop-pd-option-variant-btn ${idx === selectedVariantIndex ? "is-selected" : ""}" data-action="product-overlay-opt-variant-select" data-group-id="${groupId}" data-item-id="${itemId}" data-variant-index="${idx}">${escapeHtml(formatOptionVariantLabel(item, idx) || toVariantLabel(v) || String(v || ""))}</button>`).join("")}</div></div>` : ""}
            </div>
          `;
        }).filter(Boolean));

        return `
          <div class="shop-pd-option-accordion">
            <div class="shop-pd-option-summary"><span>${escapeHtml(title)}</span><span></span></div>
            ${!isGroupOpen ? `
              <div class="shop-pd-option-cards">
                <div class="shop-pd-option-card is-clickable" data-action="product-overlay-opt-open-group" data-group-id="${groupId}">
                  <div class="shop-pd-option-card-content">
                    ${selectedPhoto ? `<img class="shop-pd-option-thumb" src="${escapeHtml(selectedPhoto)}" alt="" />` : `<div class="shop-pd-option-thumb">вЂ”</div>`}
                    <div class="shop-pd-option-info">
                      <div class="shop-pd-option-name">${escapeHtml(selectedName)}</div>
                      ${selectedItem ? `<div class="shop-pd-option-price">${escapeHtml(toMoney(rowPrice))}</div>` : ``}
                    </div>
                    <button type="button" class="shop-pd-option-edit" data-action="product-overlay-opt-open-group" data-group-id="${groupId}">РР·РјРµРЅРёС‚СЊ &gt;</button>
                  </div>
                </div>
              </div>
            ` : ""}
            ${isGroupOpen ? `<div class="shop-pd-option-cards">${listCards.join("")}</div>` : `<div class="shop-pd-option-cards hidden"></div>`}
          </div>
        `;
      }

      const cards = items.map((item) => {
        const itemId = Number(item?.id || 0);
        if (!(itemId > 0)) return "";
        const selected = selById.get(itemId);
        const selectedQty = Math.max(0, Number(selected?.qty || 0));
        const isSelected = selectedQty > 0;
        const photos = Array.isArray(item?.product_photos_json) ? item.product_photos_json : [];
        const photoRaw = photos.length ? photos[0] : "";
        const photo = resolveMediaUrl(photoRaw);
        const name = String(item?.name || item?.product_name || "РџРѕР·РёС†РёСЏ");
        const defaultVariantIndex = getOptionItemDefaultVariantIndex(item);
        const activeVariantIndex = Number.isFinite(Number(selected?.variantIndex)) ? Number(selected.variantIndex) : defaultVariantIndex;
        const basePrice = getOptionItemBasePrice(item);
        const variantDiff = Number.isFinite(Number(selected?.variantDiff))
          ? Number(selected.variantDiff)
          : (Number.isFinite(Number(activeVariantIndex)) ? getOptionItemVariantDiff(item, Number(activeVariantIndex)) : 0);
        const rowPrice = basePrice + variantDiff;
        const allowVariants = Boolean(detailsGroup?.allow_variants ?? group?.allow_variants ?? false);
        const hasVariants = allowVariants && Array.isArray(item?.variants) && item.variants.length && Array.isArray(item.variants[0]?.values) && item.variants[0].values.length;
        const key = `${groupId}:${itemId}`;
        const variantBlockOpen = expanded.has(key);
        const variants = hasVariants ? item.variants[0].values : [];
        const selectedVariantIndex = Number.isFinite(Number(activeVariantIndex)) ? Number(activeVariantIndex) : 0;
        const controls = groupType === "multiple_item"
          ? (() => {
              const qMin = Math.max(0, Number(item?.qty_min ?? 0));
              const qMaxRaw = Number(item?.qty_max ?? 99);
              const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
              const minusDisabled = selectedQty <= qMin;
              const plusDisabled = selectedQty >= qMax;
              return `<div class="shop-pd-option-qty-controls">
               <button type="button" class="btn btn-sm shop-pd-option-qty-btn${minusDisabled ? " is-disabled" : ""}" ${minusDisabled ? "disabled" : ""} data-action="product-overlay-opt-qty-minus" data-group-id="${groupId}" data-item-id="${itemId}">−</button>
               <span class="shop-pd-option-qty-value">${selectedQty}</span>
               <button type="button" class="btn btn-sm shop-pd-option-qty-btn${plusDisabled ? " is-disabled" : ""}" ${plusDisabled ? "disabled" : ""} data-action="product-overlay-opt-qty-plus" data-group-id="${groupId}" data-item-id="${itemId}">+</button>
             </div>`;
            })()
          : (groupType === "single"
              ? ``
              : `<button type="button" class="shop-pd-option-radio ${isSelected ? "is-checked" : ""}" data-action="product-overlay-opt-toggle-item" data-group-id="${groupId}" data-item-id="${itemId}"></button>`);
        const rowAction = hasVariants ? `data-action="product-overlay-opt-variants-toggle" data-group-id="${groupId}" data-item-id="${itemId}"` : "";
        return `
          <div class="shop-pd-option-card is-clickable ${isSelected ? "is-selected" : ""} ${hasVariants ? "has-variants" : ""}">
            <div class="shop-pd-option-card-content" ${rowAction}>
              ${photo ? `<img class="shop-pd-option-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="shop-pd-option-thumb">вЂ”</div>`}
              <span class="shop-pd-option-info">
                <span class="shop-pd-option-name">${escapeHtml(name)}</span>
                <span class="shop-pd-option-price">${escapeHtml(toMoney(rowPrice))}</span>
              </span>
              ${hasVariants ? `<button type="button" class="shop-pd-option-gear-btn" data-action="product-overlay-opt-variants-toggle" data-group-id="${groupId}" data-item-id="${itemId}"><i class="fas fa-cog"></i></button>` : ``}
              ${controls}
            </div>
            ${hasVariants && variantBlockOpen ? `<div class="shop-pd-option-variant-accordion is-open"><div class="shop-pd-option-variant-scroll">${variants.map((v, idx) => `<button type="button" class="shop-pd-option-variant-btn ${idx === selectedVariantIndex ? "is-selected" : ""}" data-action="product-overlay-opt-variant-select" data-group-id="${groupId}" data-item-id="${itemId}" data-variant-index="${idx}">${escapeHtml(formatOptionVariantLabel(item, idx) || toVariantLabel(v) || String(v || ""))}</button>`).join("")}</div></div>` : ""}
          </div>
        `;
      }).filter(Boolean).join("");

      return `
        <div class="shop-pd-option-block">
          <div class="shop-pd-section-title">${escapeHtml(title)}</div>
          <div class="shop-pd-option-cards">${cards}</div>
        </div>
      `;
    }).filter(Boolean);

    return blocks.join("");
  }

  function applyProductOverlayOptionAction(productId, action, groupIdRaw, itemIdRaw, variantIndexRaw) {
    const pid = Number(productId || 0);
    const groupId = Number(groupIdRaw || 0);
    const itemId = Number(itemIdRaw || 0);
    if (!(pid > 0) || !(groupId > 0) || !(itemId > 0)) return false;
    const details = state.optionGroupDetails.get(groupId);
    const items = Array.isArray(details?.items) ? details.items : [];
    const item = items.find((x) => Number(x?.id || 0) === itemId);
    if (!item) return false;
    const groupType = getOptionGroupUiType({ ...(details?.group || {}), items });
    const byGroup = state.optionSelections.get(pid) || new Map();
    const existing = byGroup.get(groupId);
    const selectionItems = Array.isArray(existing?.items) ? existing.items.map((x) => ({ ...x })) : [];
    const selById = new Map(selectionItems.map((x) => [Number(x?.id || 0), x]));
    const name = String(item?.name || item?.product_name || "РџРѕР·РёС†РёСЏ");
    const entry = selById.get(itemId) || { id: itemId, label: name, qty: 0, basePrice: getOptionItemBasePrice(item), variantDiff: 0 };
    if (!Number.isFinite(Number(entry.variantIndex))) {
      const dIdx = getOptionItemDefaultVariantIndex(item);
      if (Number.isFinite(Number(dIdx))) {
        entry.variantIndex = Number(dIdx);
        entry.variantDiff = getOptionItemVariantDiff(item, Number(dIdx));
      }
    }

    const persistSelection = () => {
      const nextItems = [];
      for (const value of selById.values()) {
        if (Number(value.qty || 0) > 0) nextItems.push(value);
      }
      if (groupType === "single" && nextItems.length > 1) {
        const keep = nextItems[nextItems.length - 1];
        byGroup.set(groupId, { type: groupType, items: [keep] });
      } else {
        byGroup.set(groupId, { type: groupType, items: nextItems });
      }
      state.optionSelections.set(pid, byGroup);
    };

    if (action === "product-overlay-opt-variants-toggle") {
      const key = `${groupId}:${itemId}`;
      if (state.productModal.expandedOptionItems.has(key)) {
        state.productModal.expandedOptionItems.delete(key);
      } else {
        const prefix = `${groupId}:`;
        Array.from(state.productModal.expandedOptionItems.values()).forEach((k) => {
          if (String(k).startsWith(prefix)) state.productModal.expandedOptionItems.delete(k);
        });
        state.productModal.expandedOptionItems.add(key);
        if (groupType === "single") {
          entry.qty = 1;
          selById.clear();
          selById.set(itemId, entry);
          persistSelection();
        }
      }
      return true;
    }
    if (action === "product-overlay-opt-variant-select") {
      const idx = Number(variantIndexRaw || 0);
      entry.variantIndex = idx;
      entry.variantDiff = getOptionItemVariantDiff(item, idx);
      entry.qty = Math.max(1, Number(entry.qty || 0));
      if (groupType === "single") {
        selById.clear();
      }
      selById.set(itemId, entry);
    } else if (action === "product-overlay-opt-toggle-item") {
      if (groupType === "single") {
        selById.clear();
        entry.qty = 1;
        selById.set(itemId, entry);
      } else {
        entry.qty = Number(entry.qty || 0) > 0 ? 0 : 1;
        selById.set(itemId, entry);
      }
    } else if (action === "product-overlay-opt-qty-minus") {
      const qMin = Math.max(0, Number(item?.qty_min ?? 0));
      entry.qty = Math.max(qMin, Number(entry.qty || 0) - 1);
      selById.set(itemId, entry);
    } else if (action === "product-overlay-opt-qty-plus") {
      const qMaxRaw = Number(item?.qty_max ?? 99);
      const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
      entry.qty = Math.min(qMax, Number(entry.qty || 0) + 1);
      selById.set(itemId, entry);
    } else {
      return false;
    }

    persistSelection();
    return true;
  }

  function getIngredientPhoto(ing) {
    if (!ing || typeof ing !== "object") return "";
    const photoArr = Array.isArray(ing.ingredient_photos) ? ing.ingredient_photos : [];
    const first = photoArr[0];
    const raw = (
      (first && typeof first === "object" ? (first.url || first.path || first.src || "") : first)
      || ing.ingredient_photo
      || ing.photo
      || ""
    );
    return resolveMediaUrl(raw);
  }

  function getProductOverlayIngredientRows(productId) {
    const pid = Number(productId || 0);
    const ingredients = state.productIngredients.get(pid) || [];
    if (!ingredients.length) return [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    return ingredients.map((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      const canMinus = currentQty > min;
      const canPlus = currentQty < max;
      const photo = getIngredientPhoto(ing);
      return `
        <div class="shop-pd-option-card">
          <div class="shop-pd-option-card-content">
            ${photo ? `<img class="shop-pd-option-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="shop-pd-option-thumb">вЂ”</div>`}
            <div class="shop-pd-option-info">
              <div class="shop-pd-option-name" title="${escapeHtml(ing.ingredient_name || "")}">${escapeHtml(ing.ingredient_name || "")}</div>
            </div>
            <div class="shop-pd-ingredient-controls">
              <button class="btn btn-sm qty-btn qty-minus${canMinus ? "" : " is-disabled"}" type="button" ${canMinus ? "" : "disabled"} data-action="ingredient-minus" data-ingredient-id="${ingId}">−</button>
              <div class="qty-display">${escapeHtml(String(currentQty))} ${escapeHtml(unitLabel)}</div>
              <button class="btn btn-sm qty-btn qty-plus${canPlus ? "" : " is-disabled"}" type="button" ${canPlus ? "" : "disabled"} data-action="ingredient-plus" data-ingredient-id="${ingId}">+</button>
            </div>
          </div>
        </div>
      `;
    });
  }

  function renderProductOverlay() {
    const { backdrop, list, qtyValue, addBtn } = getProductOverlayElements();
    const pid = Number(state.productModal.productId || 0);
    const qty = Math.max(1, Number(state.productModal.qty || 1));
    const product = getProductById(pid);
    if (!backdrop || !list || !qtyValue || !addBtn || !product) return;

    const photos = getProductPhotos(product);
    const safePhotos = photos.length ? photos : [""];
    const rawPhotoIndex = Number(state.productModal.photoIndex || 0);
    const photoIndex = Math.max(0, Math.min(safePhotos.length - 1, Number.isFinite(rawPhotoIndex) ? rawPhotoIndex : 0));
    state.productModal.photoIndex = photoIndex;
    const photoUrl = safePhotos[photoIndex] || "";
    const variantChips = getVariantChipsForProduct(pid);
    const variantGroup = (state.productVariants.get(pid) || [])[0] || null;
    const variantTitle = String(variantGroup?.title || "").trim();
    const variantUnitLabel = String(variantGroup?.unit_short_title || variantGroup?.unit_code || variantGroup?.unit_title || "").trim();
    const hasLetters = (v) => /[a-zР°-СЏ]/i.test(String(v || ""));
    const formatVariantLabel = (raw) => {
      const valueText = String(raw || "").trim();
      if (!valueText) return "";
      if (!variantUnitLabel || hasLetters(valueText)) return valueText;
      return `${valueText} ${variantUnitLabel}`;
    };
    const ingredientRows = getProductOverlayIngredientRows(pid);
    const optionGroupsHtml = getProductOverlayOptionGroupsHtml(pid);
    const pricing = getCurrentProductUnitPricing(product, pid);
    const unitPrice = Number(pricing.unitPrice || 0);
    const total = roundPrice(unitPrice * qty);

    qtyValue.textContent = String(qty);
    const saveMode = String(state.productModal.mode || "add") === "edit";
    addBtn.innerHTML = `<span class="shop-pd-action-prices">${pricing.hasOldPrice ? `<span class="shop-pd-action-old">${escapeHtml(toMoney(roundPrice(pricing.oldPrice * qty)))}</span>` : ""}<span class="shop-checkout-total shop-pd-action-price">${escapeHtml(toMoney(total))}</span></span><span class="shop-pd-action-label">${saveMode ? "сохранить" : "в корзину"}</span>`;

    list.innerHTML = `
      <div class="shop-pd">
        <div class="shop-pd-scroll">
          <div class="shop-product-hero">
            <div class="shop-product-hero-media">
              ${photoUrl ? `<img class="shop-product-hero-image" src="${escapeHtml(photoUrl)}" alt="" />` : `<div class="new-order-product-sheet-photo-placeholder"><i class="fas fa-image"></i></div>`}
            </div>
            ${safePhotos.length > 1 ? `<button type="button" class="shop-product-hero-arrow is-prev" data-action="product-overlay-photo-prev"><i class="fas fa-chevron-left"></i></button>` : ""}
            ${safePhotos.length > 1 ? `<button type="button" class="shop-product-hero-arrow is-next" data-action="product-overlay-photo-next"><i class="fas fa-chevron-right"></i></button>` : ""}
            ${safePhotos.length > 1 ? `<div class="shop-product-hero-dots">${safePhotos.map((_, idx) => `<button type="button" class="shop-product-hero-dot ${idx === photoIndex ? "is-active" : ""}" data-action="product-overlay-photo-dot" data-photo-index="${idx}"></button>`).join("")}</div>` : ""}
          </div>
          <div class="shop-pd-meta">
            <div class="shop-pd-title">${escapeHtml(String(product?.name || "РўРѕРІР°СЂ"))}</div>
          </div>
          ${variantChips.length ? `<div class="shop-pd-options">${variantTitle ? `<div class="shop-pd-section-title">${escapeHtml(variantTitle)}</div>` : ""}<div class="shop-pd-option-variant-scroll">${variantChips.map((chip) => `<button class="shop-pd-option-variant-btn ${chip.isSelected ? "is-selected" : ""}" type="button" data-action="product-overlay-variant-select" data-variant-index="${chip.index}">${escapeHtml(formatVariantLabel(chip.label))}</button>`).join("")}</div></div>` : ""}
          ${optionGroupsHtml ? `<div class="shop-pd-options">${optionGroupsHtml}</div>` : ""}
          ${ingredientRows.length ? `<div class="shop-pd-ingredients"><div class="shop-pd-section-title">РЎРѕСЃС‚Р°РІ (РјРѕР¶РЅРѕ РЅР°СЃС‚СЂРѕРёС‚СЊ):</div><div class="shop-pd-option-cards">${ingredientRows.join("")}</div></div>` : ""}
        </div>
      </div>
    `;
  }

  async function openProductOverlay(productId, opts = {}) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return;
    closeComboOverlay();
    ensureProductOverlay();
    const { backdrop, list } = getProductOverlayElements();
    if (!backdrop) return;
    const mode = String(opts?.mode || "add") === "edit" ? "edit" : "add";
    const editOrderId = Number(opts?.orderId || 0);
    const editCartItemId = Number(opts?.cartItemId || 0);
    const sourceCartItem = opts?.cartItem && typeof opts.cartItem === "object" ? opts.cartItem : null;
    state.productModal.productId = pid;
    state.productModal.qty = Math.max(1, Number(mode === "edit" ? sourceCartItem?.qty : 1) || 1);
    state.productModal.photoIndex = 0;
    state.productModal.expandedOptionItems = new Set();
    state.productModal.expandedOptionGroups = new Set();
    state.productModal.mode = mode;
    state.productModal.editOrderId = editOrderId;
    state.productModal.editCartItemId = editCartItemId;
    const optionGroups = Array.isArray(state.productOptionGroups.get(pid)) ? state.productOptionGroups.get(pid) : [];
    const groupIds = optionGroups
      .map((g) => Number(g?.group_id || g?.id || 0))
      .filter((gid) => gid > 0);
    const optionItemsForPrefetch = [];
    if (groupIds.length) {
      const detailsList = await Promise.all(groupIds.map((gid) => loadOptionGroupDetails(gid)));
      detailsList.forEach((details) => {
        const items = Array.isArray(details?.items) ? details.items : [];
        if (items.length) optionItemsForPrefetch.push(...items);
      });
    }
    if (optionItemsForPrefetch.length) {
      await ensureOptionTargetProducts(optionItemsForPrefetch);
    }
    if (mode === "edit" && sourceCartItem) {
      applyProductOverlayStateFromCartItem(pid, sourceCartItem);
    }
    backdrop.classList.remove("hidden");
    backdrop.onclick = (e) => {
      const closeBtn = e.target.closest("[data-action='product-overlay-close']");
      if (closeBtn || e.target === backdrop) {
        closeProductOverlay();
      }
    };
    renderProductOverlay();
    if (list) list.scrollTop = 0;
  }

  function resetCheckoutBlockSelection(block) {
    const safeBlock = normalizeBlock(block);
    if (!safeBlock) return;
    const categoryIds = Array.isArray(safeBlock.categoryIds) ? safeBlock.categoryIds : [];
    categoryIds.forEach((categoryId) => {
      const sectionKey = getCheckoutSectionKey(safeBlock.id, categoryId);
      const products = Array.isArray(state.checkoutCategoryProducts.get(categoryId))
        ? state.checkoutCategoryProducts.get(categoryId)
        : [];
      const defaultProductId = safeBlock.requireAll
        ? Number((products.find((p) => isProductAvailableFlag(p)) || {}).id || 0)
        : 0;
      if (defaultProductId > 0) {
        state.checkoutSelectedProductByCategory.set(sectionKey, defaultProductId);
        const variants = state.productVariants.get(defaultProductId) || [];
        if (Array.isArray(variants) && variants.length) {
          const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
          const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
          const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
          state.selectedVariants.set(defaultProductId, safeDefault);
        }
      } else {
        state.checkoutSelectedProductByCategory.delete(sectionKey);
      }
    });
    state.checkoutMergedPreviewByBlock.delete(Number(safeBlock.id || 0));
  }

  function addCheckoutBlockToRightCartById(blockId) {
    const safeBlockId = Number(blockId || 0);
    if (!(safeBlockId > 0)) return false;
    const block = getCheckoutBlocks().find((item) => Number(item?.id || 0) === safeBlockId) || null;
    if (!block) return false;
    const categoryById = new Map((Array.isArray(state.productCategories) ? state.productCategories : []).map((c) => [Number(c?.id || 0), c]));
    const selection = buildCheckoutBlockSelection(block, categoryById);
    state.checkoutMergedPreviewByBlock.set(safeBlockId, selection.items);
    if (!state.rightActiveOrderId) openRightNewOrderTab();
    const cartItem = buildCartItemFromCheckoutBlock(block);
    if (cartItem && state.rightActiveOrderId) {
      addCartItemToRightOrder(state.rightActiveOrderId, cartItem);
      resetCheckoutBlockSelection(block);
      state.checkoutIngredientsPopoverKey = null;
      state.checkoutIngredientsPopoverPos = null;
    }
    renderRightOrderTabs();
    renderCheckoutEditorContent();
    return true;
  }

  function renderCheckoutEditorContent() {
    if (!checkoutEditorEl || !checkoutContentEl) return;
    const productsScrollSnapshot = new Map(state.checkoutProductsScrollByCategory);
    const variantsScrollSnapshot = new Map(state.checkoutVariantsScrollByCategory);
    const blocks = getCheckoutBlocks();
    if (!blocks.length) {
      checkoutEditorEl.classList.add("is-empty");
      checkoutContentEl.innerHTML = "";
      renderCheckoutBlockChips([], new Map());
      return;
    }

    checkoutEditorEl.classList.remove("is-empty");
    const categoryById = new Map((Array.isArray(state.productCategories) ? state.productCategories : []).map((c) => [Number(c?.id || 0), c]));
    renderCheckoutBlockChips(blocks, categoryById);
    const blocksHtml = blocks.map((block, blockIndex) => {
      const blockSelection = buildCheckoutBlockSelection(block, categoryById);
      const sectionsHtml = block.categoryIds.map((categoryId, sectionIndex) => {
      const isLastSection = sectionIndex === block.categoryIds.length - 1;
      const sectionKey = getCheckoutSectionKey(block.id, categoryId);
      const cat = categoryById.get(categoryId) || null;
      const catTitle = String(cat?.title || "РљР°С‚РµРіРѕСЂРёСЏ");
      const products = Array.isArray(state.checkoutCategoryProducts.get(categoryId)) ? state.checkoutCategoryProducts.get(categoryId) : [];
      const savedSelectedProductId = Number(state.checkoutSelectedProductByCategory.get(sectionKey) || 0);
      const firstAvailableProductId = block.requireAll
        ? Number((products.find((p) => isProductAvailableFlag(p)) || {}).id || 0)
        : 0;
      const selectedProductId = products.some((p) => Number(p?.id || 0) === savedSelectedProductId && isProductAvailableFlag(p))
        ? savedSelectedProductId
        : firstAvailableProductId;
      if (selectedProductId > 0) state.checkoutSelectedProductByCategory.set(sectionKey, selectedProductId);
      else state.checkoutSelectedProductByCategory.delete(sectionKey);
      const productsHtml = products.length
        ? products.map((product) => {
            const photoUrl = getProductPhoto(product);
            const name = String(product?.name || "РўРѕРІР°СЂ");
            const productId = Number(product?.id || 0);
            const isUnavailable = !isProductAvailableFlag(product);
            const hasComposition = Array.isArray(state.productIngredients.get(productId)) && (state.productIngredients.get(productId) || []).length > 0;
            const popoverKey = getCheckoutIngredientsPopoverKey(sectionKey, productId);
            const isCompositionOpen = !isUnavailable && state.checkoutIngredientsPopoverKey === popoverKey;
            const compositionRows = isCompositionOpen ? getCheckoutIngredientRowsForProduct(productId, sectionKey) : [];
            const popoverPos = state.checkoutIngredientsPopoverPos || null;
            const popoverStyle = popoverPos
              ? `left:${Math.round(Number(popoverPos.left || 0))}px;top:${Math.round(Number(popoverPos.top || 0))}px;width:200px;`
              : "";
            return `
              <article class="new-order-checkout-product-item ${productId === selectedProductId ? "is-selected" : ""} ${hasComposition ? "has-composition" : ""} ${isUnavailable ? "is-unavailable" : ""}" data-product-id="${productId}" data-category-id="${categoryId}" data-section-key="${sectionKey}" data-is-available="${isUnavailable ? "0" : "1"}">
                <span class="new-order-checkout-product-photo-wrap">
                  ${photoUrl ? `<img class="new-order-checkout-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<span class="new-order-checkout-product-photo-placeholder"><i class="fas fa-image"></i></span>`}
                </span>
                <span class="new-order-checkout-product-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                ${hasComposition ? `
                  <button type="button" class="new-order-checkout-composition-btn" data-action="checkout-composition-toggle" data-product-id="${productId}" data-section-key="${sectionKey}" aria-label="РќР°СЃС‚СЂРѕРёС‚СЊ СЃРѕСЃС‚Р°РІ" title="РќР°СЃС‚СЂРѕРёС‚СЊ СЃРѕСЃС‚Р°РІ"${isUnavailable ? " disabled" : ""}>вљ™</button>
                  ${isCompositionOpen ? `
                    <div class="new-order-checkout-composition-popover" style="${popoverStyle}">
                      <div class="new-order-checkout-composition-popover-head">РЎРѕСЃС‚Р°РІ</div>
                      <div class="new-order-checkout-composition-list no-scrollbar">
                        ${compositionRows.join("")}
                      </div>
                    </div>
                  ` : ""}
                ` : ""}
              </article>
            `;
          }).join("")
        : `<div class="new-order-checkout-products-empty">Р’ РєР°С‚РµРіРѕСЂРёРё РїРѕРєР° РЅРµС‚ С‚РѕРІР°СЂРѕРІ</div>`;
      const selectedVariantChips = selectedProductId > 0 ? getVariantChipsForProduct(selectedProductId) : [];
      const selectedProduct = products.find((p) => Number(p?.id || 0) === selectedProductId) || null;
      const selectedPricing = selectedProductId > 0 && selectedProduct
        ? getCurrentProductUnitPricing(selectedProduct, selectedProductId)
        : { unitPrice: 0 };
      const priceToShow = roundPrice(Number(selectedPricing?.unitPrice || 0));
      const selectedVariantStockLabel = selectedProductId > 0 && selectedProduct
        ? getCheckoutSelectedVariantStockLabel(selectedProductId, selectedProduct)
        : "";
      const inlineActionsHtml = isLastSection
        ? `
          <div class="new-order-checkout-inline-actions">
            <span class="new-order-checkout-block-total">${escapeHtml(toMoney(blockSelection.total))}</span>
            <button type="button" class="new-order-checkout-add-to-cart-btn" data-action="checkout-block-add" data-block-id="${block.id}">
              Р”РѕР±Р°РІРёС‚СЊ РІ РєРѕСЂР·РёРЅСѓ
            </button>
          </div>
        `
        : "";
      const variantsHtml = `
        <div class="new-order-checkout-variants-wrap ${selectedVariantChips.length ? "" : "is-empty"} ${selectedVariantStockLabel ? "has-stock" : ""} ${isLastSection ? "has-inline-actions" : ""}">
          <div class="new-order-checkout-variants-price">${priceToShow > 0 ? escapeHtml(toMoney(priceToShow)) : ""}</div>
          ${selectedVariantStockLabel
            ? `<div class="new-order-checkout-variants-stock">Остаток: ${escapeHtml(selectedVariantStockLabel)}</div>`
            : ""}
          <div class="new-order-checkout-variants-scroll no-scrollbar" data-section-key="${sectionKey}">
            <div class="new-order-checkout-variants-row">
              ${selectedVariantChips.length
                ? selectedVariantChips.map((chip) => `
                  <button
                    type="button"
                    class="new-order-checkout-variant-chip ${chip.isSelected ? "is-selected" : ""}"
                    data-action="checkout-variant-select"
                    data-product-id="${selectedProductId}"
                    data-section-key="${sectionKey}"
                    data-variant-index="${chip.index}"
                    title="${escapeHtml(chip.label)}"
                  >${escapeHtml(chip.label)}</button>
                `).join("")
                : `<span class="new-order-checkout-variants-placeholder" aria-hidden="true"></span>`
              }
            </div>
          </div>
          ${inlineActionsHtml}
        </div>
      `;
      return `
        <section class="new-order-checkout-category-section" data-category-id="${categoryId}" data-block-id="${block.id}" data-section-key="${sectionKey}" data-require-all="${block.requireAll ? "1" : "0"}">
          <h3 class="new-order-checkout-category-title">${escapeHtml(catTitle)}</h3>
          <div class="new-order-checkout-products-scroll no-scrollbar" data-section-key="${sectionKey}">
            <div class="new-order-checkout-products-row">${productsHtml}</div>
          </div>
          ${variantsHtml}
        </section>
      `;
      }).join("");
      return `
        <section class="new-order-checkout-category-block new-order-checkout-constructor-block" data-block-id="${block.id}">
          <div class="new-order-checkout-block-title">${escapeHtml(getCheckoutBlockChipTitle(block, blockIndex, categoryById))}</div>
          ${state.checkoutEditMode ? `
            <div class="new-order-checkout-block-actions">
              ${blockIndex > 0 ? `
                <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-move-up" data-block-id="${block.id}" aria-label="РЎРґРІРёРЅСѓС‚СЊ Р±Р»РѕРє РІРІРµСЂС…" title="РЎРґРІРёРЅСѓС‚СЊ РІРІРµСЂС…">
                  <i class="fas fa-chevron-up"></i>
                </button>
              ` : ""}
              ${blockIndex < blocks.length - 1 ? `
                <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-move-down" data-block-id="${block.id}" aria-label="РЎРґРІРёРЅСѓС‚СЊ Р±Р»РѕРє РІРЅРёР·" title="РЎРґРІРёРЅСѓС‚СЊ РІРЅРёР·">
                  <i class="fas fa-chevron-down"></i>
                </button>
              ` : ""}
              <button type="button" class="new-order-checkout-block-action-btn new-order-checkout-block-drag-handle" data-action="checkout-block-drag-handle" data-block-id="${block.id}" aria-label="РџРµСЂРµС‚Р°С‰РёС‚СЊ Р±Р»РѕРє" title="РџРµСЂРµС‚Р°С‰РёС‚СЊ Р±Р»РѕРє" draggable="true">
                <i class="fas fa-grip-lines"></i>
              </button>
              <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-edit" data-block-id="${block.id}" aria-label="РР·РјРµРЅРёС‚СЊ Р±Р»РѕРє" title="РР·РјРµРЅРёС‚СЊ Р±Р»РѕРє">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="new-order-checkout-block-action-btn is-danger" data-action="checkout-block-delete" data-block-id="${block.id}" aria-label="РЈРґР°Р»РёС‚СЊ Р±Р»РѕРє" title="РЈРґР°Р»РёС‚СЊ Р±Р»РѕРє">
                <i class="fas fa-times"></i>
              </button>
            </div>
          ` : ""}
          ${sectionsHtml}
        </section>
      `;
    }).join("");

    checkoutContentEl.innerHTML = blocksHtml;
    checkoutContentEl.querySelectorAll(".new-order-checkout-products-scroll[data-section-key]").forEach((row) => {
      const sectionKey = String(row.getAttribute("data-section-key") || "");
      const left = productsScrollSnapshot.get(sectionKey);
      if (Number.isFinite(left)) row.scrollLeft = left;
    });
    checkoutContentEl.querySelectorAll(".new-order-checkout-variants-scroll[data-section-key]").forEach((row) => {
      const sectionKey = String(row.getAttribute("data-section-key") || "");
      const left = variantsScrollSnapshot.get(sectionKey);
      if (Number.isFinite(left)) row.scrollLeft = left;
    });
    bindCheckoutRowsWheel();
  }

  function saveCheckoutScrollBySection(sectionKey, sourceEl) {
    const key = String(sectionKey || "").trim();
    if (!key || !(sourceEl instanceof Element)) return;
    const section = sourceEl.closest(".new-order-checkout-category-section");
    if (!section) return;
    const productsScroll = section.querySelector(".new-order-checkout-products-scroll");
    const variantsScroll = section.querySelector(".new-order-checkout-variants-scroll");
    if (productsScroll) state.checkoutProductsScrollByCategory.set(key, Number(productsScroll.scrollLeft || 0));
    if (variantsScroll) state.checkoutVariantsScrollByCategory.set(key, Number(variantsScroll.scrollLeft || 0));
  }

  function bindCheckoutRowsWheel() {
    // Kept intentionally for backward compatibility; wheel is handled globally in capture phase.
  }

  async function loadCheckoutProductsForSelectedCategories() {
    const selectedIds = getAllCategoryIdsFromBlocks(getCheckoutBlocks());
    if (!selectedIds.length) {
      state.checkoutCategoryProducts.clear();
      schedulePersistBootstrapSnapshot(0);
      renderCheckoutEditorContent();
      return;
    }

    for (const existingId of Array.from(state.checkoutCategoryProducts.keys())) {
      if (!selectedIds.includes(Number(existingId))) state.checkoutCategoryProducts.delete(existingId);
    }

    const missingIds = [];
    const allProducts = [];
    selectedIds.forEach((categoryId) => {
      const cid = Number(categoryId || 0);
      if (!(cid > 0)) return;
      if (state.checkoutCategoryProducts.has(cid)) {
        allProducts.push(...(state.checkoutCategoryProducts.get(cid) || []));
        return;
      }
      const categoryPayload = state.categoryProductsCache.get(cid);
      if (categoryPayload && Array.isArray(categoryPayload.activeOnly)) {
        state.checkoutCategoryProducts.set(cid, categoryPayload.activeOnly);
        allProducts.push(...categoryPayload.activeOnly);
        return;
      }
      const cached = readCategoryProductsCache(cid);
      if (Array.isArray(cached)) {
        const payload = buildCategoryPayload(cached, []);
        state.categoryProductsCache.set(cid, payload);
        state.checkoutCategoryProducts.set(cid, payload.activeOnly);
        allProducts.push(...payload.activeOnly);
        return;
      }
      missingIds.push(cid);
    });

    await Promise.all(missingIds.map(async (categoryId) => {
      try {
        const json = await apiJson(`/api/public/products?category_id=${encodeURIComponent(String(categoryId))}`);
        const source = Array.isArray(json?.data) ? json.data : [];
        const combos = Array.isArray(json?.combos) ? json.combos : [];
        const payload = buildCategoryPayload(source, combos);
        state.categoryProductsCache.set(categoryId, payload);
        state.checkoutCategoryProducts.set(categoryId, payload.activeOnly);
        writeCategoryProductsCache(categoryId, source);
        allProducts.push(...payload.activeOnly);
      } catch {
        state.checkoutCategoryProducts.set(categoryId, []);
      }
    }));
    await loadVariantsForProducts(allProducts);
    await loadIngredientsForProducts(allProducts);
    await loadOptionsForProducts(allProducts);
    state.checkoutIngredientsPopoverKey = null;
    state.checkoutIngredientsPopoverPos = null;
    schedulePersistBootstrapSnapshot(0);

    renderCheckoutEditorContent();
  }

  async function loadCheckoutDraftFromApi(force = false) {
    const cached = force ? null : readDraftCache();
    if (cached && Array.isArray(cached.blocks)) {
      state.checkoutSavedDraft = { blocks: cached.blocks };
      schedulePersistBootstrapSnapshot();
      return;
    }
    const json = await apiJson("/api/checkout-constructor/draft");
    const blocks = Array.isArray(json?.data?.blocks) ? json.data.blocks : [];
    const normalized = blocks.map(normalizeBlock).filter(Boolean);
    state.checkoutSavedDraft = { blocks: normalized };
    writeDraftCache(normalized);
    schedulePersistBootstrapSnapshot();
  }

  async function saveCheckoutDraftToApi(sourceDraft) {
    const payload = toCheckoutBlocksPayload(Array.isArray(sourceDraft?.blocks) ? sourceDraft.blocks : []);
    await apiJson("/api/checkout-constructor/draft", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    writeDraftCache(payload.blocks);
    schedulePersistBootstrapSnapshot();
  }

  async function apiJson(url, opts = {}) {
    const token = localStorage.getItem("authToken");
    const storeId = localStorage.getItem("activeStoreId") || "1";
    const headers = {
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "x-store-id": storeId,
    };
    const res = await fetch(url, { method: opts.method || "GET", headers, body: opts.body });
    const data = await res.json().catch(() => null);
    if (!data || data.ok !== true) throw new Error(data?.error || `API_ERROR_${res.status}`);
    return data;
  }

  function isCheckoutVisible(category) {
    if (!category || typeof category !== "object") return false;
    if (category.checkout_visibility === undefined || category.checkout_visibility === null) return true;
    return Number(category.checkout_visibility) !== 0;
  }

  function isSiteVisibleProduct(product) {
    if (!product || typeof product !== "object") return false;
    if (product.site_visibility === undefined || product.site_visibility === null) return true;
    return Number(product.site_visibility) !== 0;
  }

  function looksLikeUrl(value) {
    return /^(https?:)?\/\//i.test(value) || /^\/(static|uploads)\//i.test(value);
  }

  function resolveMediaUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (looksLikeUrl(raw)) return raw;
    const clean = raw.startsWith("/") ? raw.slice(1) : raw;
    return `/uploads/${clean}`;
  }

  function escapeHtml(value) {
    return repairUtf8Mojibake(String(value || ""))
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getTenantFromStorage() {
    try {
      const t = localStorage.getItem("tenant");
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  }

  function normalizePriceRoundingSettings(source) {
    const modeRaw = source && typeof source === "object"
      ? (typeof source.price_rounding_mode === "string" ? source.price_rounding_mode : source.mode)
      : "none";
    const mode = typeof modeRaw === "string" ? modeRaw : "none";
    const allowed = new Set(["none", "down", "up", "nearest"]);
    const safeMode = allowed.has(mode) ? mode : "none";
    const precisionValue = source && typeof source === "object"
      ? (Object.prototype.hasOwnProperty.call(source, "price_rounding_precision") ? source.price_rounding_precision : source.precision)
      : null;
    const precisionRaw = Number(precisionValue);
    const precision = precisionRaw === 0 ? 0 : 2;
    return { mode: safeMode, precision };
  }

  function updateTenantRoundingStorage(nextSettings) {
    if (!nextSettings || typeof nextSettings !== "object") return;
    try {
      const current = getTenantFromStorage();
      const tenant = current && typeof current === "object" ? { ...current } : {};
      tenant.price_rounding_mode = String(nextSettings.mode || "none");
      tenant.price_rounding_precision = Number(nextSettings.precision) === 0 ? 0 : 2;
      localStorage.setItem("tenant", JSON.stringify(tenant));
    } catch {}
  }

  async function ensureTenantPriceRoundingSettings() {
    if (state.tenantRoundingLoaded && state.tenantRounding) return state.tenantRounding;
    if (state.tenantRoundingPromise) return state.tenantRoundingPromise;

    const storedTenant = getTenantFromStorage();
    const hasStoredRounding = !!(
      storedTenant &&
      typeof storedTenant === "object" &&
      typeof storedTenant.price_rounding_mode === "string" &&
      (Number(storedTenant.price_rounding_precision) === 0 || Number(storedTenant.price_rounding_precision) === 2)
    );
    if (hasStoredRounding) {
      state.tenantRounding = normalizePriceRoundingSettings(storedTenant);
      state.tenantRoundingLoaded = true;
      return state.tenantRounding;
    }

    state.tenantRoundingPromise = (async () => {
      const fallback = normalizePriceRoundingSettings(storedTenant);
      try {
        const json = await apiJson("/api/admin/tenant");
        const tenant = json?.tenant && typeof json.tenant === "object" ? json.tenant : null;
        if (tenant) {
          const next = normalizePriceRoundingSettings(tenant);
          state.tenantRounding = next;
          updateTenantRoundingStorage(next);
        } else {
          state.tenantRounding = fallback;
        }
      } catch {
        state.tenantRounding = fallback;
      } finally {
        state.tenantRoundingLoaded = true;
        state.tenantRoundingPromise = null;
      }
      return state.tenantRounding;
    })();

    return state.tenantRoundingPromise;
  }

  function getPriceRoundingSettings() {
    if (state.tenantRounding && typeof state.tenantRounding === "object") {
      return normalizePriceRoundingSettings(state.tenantRounding);
    }
    return normalizePriceRoundingSettings(getTenantFromStorage());
  }

  function roundPrice(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    const { mode, precision } = getPriceRoundingSettings();
    if (!mode || mode === "none") return n;
    const factor = precision > 0 ? Math.pow(10, precision) : 1;
    if (mode === "up") return Math.ceil(n * factor) / factor;
    if (mode === "down") return Math.floor(n * factor) / factor;
    return Math.round(n * factor) / factor;
  }

  function toMoney(value) {
    const n = roundPrice(Number(value || 0));
    const safe = Number.isFinite(n) ? n : 0;
    return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(safe)} ₽`;
  }

  function formatDiscountPercentLabel(value) {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num <= 0) return "";
    const rounded = Math.round(num * 100) / 100;
    return String(rounded)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*[1-9])0+$/, "$1");
  }

  function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getConversionFactor(fromUnitId, toUnitId) {
    if (!fromUnitId || !toUnitId) return null;
    if (Number(fromUnitId) === Number(toUnitId)) return 1;
    const direct = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(fromUnitId) && Number(c.to_unit_id) === Number(toUnitId) && Number(c.is_active) === 1
    );
    if (direct && Number(direct.factor)) return Number(direct.factor);
    const inverse = state.unitConversions.find(
      (c) => Number(c.from_unit_id) === Number(toUnitId) && Number(c.to_unit_id) === Number(fromUnitId) && Number(c.is_active) === 1
    );
    if (inverse && Number(inverse.factor)) return 1 / Number(inverse.factor);
    return null;
  }

  function getVariantUnitPriceByBase(product, variants, selectedIndex, basePriceRaw) {
    if (!product) return Number(basePriceRaw || 0);
    const basePrice = Number(basePriceRaw || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const selected = Number(selectedIndex);
    if (!Number.isFinite(selected)) return basePrice;

    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;

    const value = Array.isArray(group.values) ? group.values[selected] : null;
    const numericValue = parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;

    const factor = getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return basePrice;
    const qtyInBase = numericValue * Number(factor || 0);
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;

    let unitPrice = basePrice * (qtyInBase / baseQty);
    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selected);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) unitPrice = unitPrice * (1 - discountPercent / 100);
    return unitPrice;
  }

  function getQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  function calculateIngredientPriceDiff(productId) {
    const pid = Number(productId);
    const ingredients = state.productIngredients.get(pid) || [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    let currentTotal = 0;
    let baseTotal = 0;

    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const currentQty = Number(qtyMap.get(ingId) ?? ing.quantity ?? 1);
      const baseQty = Number(ing.quantity ?? 1);
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;

      const currentQtyInBase = getQtyInBase(ing, currentQty);
      const baseQtyInBase = getQtyInBase(ing, baseQty);
      const currentItemTotal = currentQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * currentQtyInBase : 0;
      const baseItemTotal = baseQtyInBase != null && Number.isFinite(pricePerUnit) ? pricePerUnit * baseQtyInBase : 0;
      currentTotal += currentItemTotal;
      baseTotal += baseItemTotal;
    });

    return currentTotal - baseTotal;
  }

  function buildIngredientsSnapshotForProduct(productId) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return [];
    const ingredients = state.productIngredients.get(pid) || [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    return ingredients.map((ing) => {
      const defaultQty = Number(ing.quantity ?? 1);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      return {
        ingredient_id: Number(ing.ingredient_id || 0),
        ingredient_name: String(ing.ingredient_name || ""),
        qty: Number(qtyMap.get(Number(ing.ingredient_id || 0)) ?? defaultQty),
        default_qty: defaultQty,
        qty_min: min,
        qty_max: max,
        qty_step: step,
        unit_label: String(ing.unit_short_title || ing.unit_title || ing.unit_code || "").trim(),
        unit_id: Number(ing.unit_id || ing.ingredient_unit_id || 0),
        ingredient_base_unit_id: Number(ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id || 0),
        price_per_unit: Number(pricePerUnit || 0),
      };
    });
  }

  function getSnapshotQtyInBase(row, qty) {
    const baseUnitId = Number(row?.ingredient_base_unit_id || 0);
    const fromUnitId = Number(row?.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return Number(qty || 0);
    if (baseUnitId === fromUnitId) return Number(qty || 0);
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : Number(qty || 0);
  }

  function calculateIngredientSnapshotDiff(snapshot) {
    const rows = Array.isArray(snapshot) ? snapshot : [];
    let currentTotal = 0;
    let baseTotal = 0;
    rows.forEach((row) => {
      const pricePerUnit = Number(row?.price_per_unit || 0);
      if (!Number.isFinite(pricePerUnit) || pricePerUnit === 0) return;
      const currentQtyInBase = getSnapshotQtyInBase(row, Number(row?.qty || 0));
      const baseQtyInBase = getSnapshotQtyInBase(row, Number(row?.default_qty || 0));
      const currentItemTotal = currentQtyInBase != null ? pricePerUnit * currentQtyInBase : 0;
      const baseItemTotal = baseQtyInBase != null ? pricePerUnit * baseQtyInBase : 0;
      currentTotal += currentItemTotal;
      baseTotal += baseItemTotal;
    });
    return currentTotal - baseTotal;
  }

  function getOptionGroupUiType(group) {
    if (!group) return "single";
    const selectionType = group.selection_type || "single";
    if (selectionType !== "multiple") return "single";
    const items = Array.isArray(group.items) ? group.items : [];
    const hasQtyControls = items.some((item) => Number(item?.qty_max ?? 1) > 1);
    return hasQtyControls ? "multiple_item" : "multiple_group";
  }

  function getOptionItemBasePrice(item) {
    if (!item) return 0;
    const direct = Number(item.price);
    if (Number.isFinite(direct)) return direct;
    if (item.price_mode === "fixed") return Number(item.price_value || 0);
    return Number(item.product_price || 0);
  }

  async function ensureOptionTargetProducts(items) {
    const productIds = (Array.isArray(items) ? items : [])
      .map((item) => Number(item?.target_product_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0 && !state.optionTargetProductCache.has(id));
    const unique = [...new Set(productIds)];
    if (!unique.length) return;
    await Promise.all(unique.map(async (pid) => {
      try {
        const json = await apiJson(`/api/public/products/${pid}`);
        const product = json?.data || null;
        state.optionTargetProductCache.set(pid, product);
      } catch {
        state.optionTargetProductCache.set(pid, null);
      }
    }));
  }

  function getOptionItemVariantUnitPrice(item, selectedIndex) {
    const fallbackPrice = getOptionItemBasePrice(item);
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return fallbackPrice;
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return fallbackPrice;

    const numericValue = parseVariantValueNumber(values[idx]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackPrice;

    const productId = Number(item?.target_product_id || 0);
    const product = productId > 0 ? state.optionTargetProductCache.get(productId) : null;
    let unitPrice = null;

    if (product) {
      const basePrice = Number(product.price || 0);
      const baseUnitId = Number(product.base_unit_id || product.unit_id || variantGroup?.unit_id || 0);
      const baseQty = Number(product.base_qty || 1) || 1;
      const variantUnitId = Number(variantGroup?.unit_id || baseUnitId);
      if (basePrice > 0 && baseUnitId && variantUnitId) {
        const factor = getConversionFactor(variantUnitId, baseUnitId);
        if (factor != null) {
          const qtyInBase = numericValue * Number(factor || 0);
          if (Number.isFinite(qtyInBase) && qtyInBase > 0) {
            unitPrice = basePrice * (qtyInBase / baseQty);
          }
        }
      }
    }

    if (unitPrice == null) {
      const baseValue = parseVariantValueNumber(values[0]);
      if (!Number.isFinite(baseValue) || baseValue <= 0) return fallbackPrice;
      unitPrice = fallbackPrice * (numericValue / baseValue);
    }

    const tiers = Array.isArray(variantGroup?.discount_tiers) ? variantGroup.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === idx);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

  function getOptionItemDefaultVariantIndex(item) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const vg = variants[0];
    const values = Array.isArray(vg?.values) ? vg.values : [];
    if (!values.length) return null;
    const raw = vg?.default_value_index != null ? Number(vg.default_value_index) : 0;
    if (!Number.isFinite(raw) || raw < 0 || raw >= values.length) return 0;
    return raw;
  }

  function getOptionItemVariantDiff(item, selectedIdx) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const vg = variants[0];
    if (!vg || !Array.isArray(vg.values) || !vg.values.length) return 0;
    const unit = getOptionItemVariantUnitPrice(item, selectedIdx);
    return unit - getOptionItemBasePrice(item);
  }

  function formatOptionVariantLabel(item, variantIndex) {
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const vg = variants[0];
    const values = Array.isArray(vg?.values) ? vg.values : [];
    const idx = Number(variantIndex);
    if (!Number.isFinite(idx) || idx < 0 || idx >= values.length) return "";
    const rawValue = values[idx];
    const valueLabel = toVariantLabel(rawValue);
    if (!valueLabel) return "";
    const unit = getVariantUnitLabel(vg);
    const hasLetters = /[a-zР°-СЏ]/i.test(valueLabel);
    return unit && !hasLetters ? `${valueLabel} ${unit}` : valueLabel;
  }

  function applyQuickSingleOptionSelection(productId, groupId, itemId, variantIndexRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const productGroups = state.productOptionGroups.get(pid) || [];
    const baseGroup = Array.isArray(productGroups)
      ? productGroups.find((g) => Number(g?.group_id || g?.id || 0) === gid)
      : null;
    const details = state.optionGroupDetails.get(gid) || null;
    const groupObj = details?.group || baseGroup || null;
    const selectionType = String(groupObj?.selection_type || "single");
    if (selectionType === "multiple") return false;

    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const name = String(item?.name || item?.product_name || "");
    const basePrice = getOptionItemBasePrice(item);
    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    const rawIdx = Number(variantIndexRaw);
    const defaultIdx = getOptionItemDefaultVariantIndex(item);
    let variantIndex = null;
    if (values.length) {
      const fallbackIdx = Number.isFinite(Number(defaultIdx)) ? Number(defaultIdx) : 0;
      const nextIdx = Number.isFinite(rawIdx) ? rawIdx : fallbackIdx;
      variantIndex = Math.max(0, Math.min(values.length - 1, nextIdx));
    }

    const next = {
      id: iid,
      label: name,
      qty: 1,
      basePrice,
      variantDiff: variantIndex != null ? getOptionItemVariantDiff(item, variantIndex) : 0,
    };
    if (variantIndex != null) next.variantIndex = variantIndex;

    byGroup.set(gid, { type: "single", items: [next] });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickMultiOptionToggle(productId, groupId, itemId) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const details = state.optionGroupDetails.get(gid) || null;
    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);

    if (idx >= 0) {
      currentItems.splice(idx, 1);
    } else {
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const defaultIdx = getOptionItemDefaultVariantIndex(item);
      const next = { id: iid, label: name, qty: 1, basePrice, variantDiff: 0 };
      if (Number.isFinite(Number(defaultIdx))) {
        const vi = Number(defaultIdx);
        next.variantIndex = vi;
        next.variantDiff = getOptionItemVariantDiff(item, vi);
      }
      currentItems.push(next);
    }

    byGroup.set(gid, { type: "multiple_group", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickMultiOptionQtyAdjust(productId, groupId, itemId, deltaRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    const delta = Number(deltaRaw || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0 || !Number.isFinite(delta) || delta === 0) return false;

    const details = state.optionGroupDetails.get(gid) || null;
    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const groupType = getOptionGroupUiType({ ...(details?.group || {}), items: detailItems });
    if (groupType !== "multiple_item") return false;

    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);
    const qMinRaw = Number(item?.qty_min ?? 0);
    const qMin = Number.isFinite(qMinRaw) ? Math.max(0, qMinRaw) : 0;
    const qMaxRaw = Number(item?.qty_max ?? 99);
    const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;

    if (idx < 0) {
      if (delta < 0) return true;
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const defaultIdx = getOptionItemDefaultVariantIndex(item);
      let nextQty = Math.max(qMin, delta);
      nextQty = Math.max(0, Math.min(qMax, nextQty));
      if (nextQty <= 0) return true;
      const next = { id: iid, label: name, qty: nextQty, basePrice, variantDiff: 0 };
      if (Number.isFinite(Number(defaultIdx))) {
        const vi = Number(defaultIdx);
        next.variantIndex = vi;
        next.variantDiff = getOptionItemVariantDiff(item, vi);
      }
      currentItems.push(next);
    } else {
      const currentQty = Math.max(0, Number(currentItems[idx]?.qty || 0));
      let nextQty = currentQty + delta;
      nextQty = Math.max(0, Math.min(qMax, nextQty));
      if (nextQty <= 0) {
        currentItems.splice(idx, 1);
      } else {
        currentItems[idx].qty = Math.max(qMin, nextQty);
        if (!Number.isFinite(Number(currentItems[idx].basePrice))) {
          currentItems[idx].basePrice = getOptionItemBasePrice(item);
        }
      }
    }

    byGroup.set(gid, { type: "multiple_item", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function applyQuickOptionVariantSelection(productId, groupId, itemId, variantIndexRaw) {
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    const iid = Number(itemId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return false;

    const productGroups = state.productOptionGroups.get(pid) || [];
    const baseGroup = Array.isArray(productGroups)
      ? productGroups.find((g) => Number(g?.group_id || g?.id || 0) === gid)
      : null;
    const details = state.optionGroupDetails.get(gid) || null;
    const groupObj = details?.group || baseGroup || null;
    const selectionType = String(groupObj?.selection_type || "single");
    const isMultiple = selectionType === "multiple";

    const detailItems = Array.isArray(details?.items) ? details.items : [];
    const item = detailItems.find((x) => Number(x?.id || 0) === iid);
    if (!item) return false;

    const variants = Array.isArray(item?.variants) ? item.variants : [];
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    if (!values.length) return false;

    const rawIdx = Number(variantIndexRaw);
    const fallbackIdx = Number.isFinite(Number(getOptionItemDefaultVariantIndex(item))) ? Number(getOptionItemDefaultVariantIndex(item)) : 0;
    const nextIdx = Number.isFinite(rawIdx) ? rawIdx : fallbackIdx;
    const variantIndex = Math.max(0, Math.min(values.length - 1, nextIdx));

    if (!isMultiple) {
      return applyQuickSingleOptionSelection(pid, gid, iid, variantIndex);
    }

    const byGroup = state.optionSelections.get(pid) || new Map();
    const current = byGroup.get(gid);
    const currentItems = Array.isArray(current?.items) ? current.items.map((x) => ({ ...x })) : [];
    const idx = currentItems.findIndex((x) => Number(x?.id || 0) === iid);
    if (idx < 0) {
      const name = String(item?.name || item?.product_name || "");
      const basePrice = getOptionItemBasePrice(item);
      const next = {
        id: iid,
        label: name,
        qty: 1,
        basePrice,
        variantIndex,
        variantDiff: getOptionItemVariantDiff(item, variantIndex),
      };
      currentItems.push(next);
    } else {
      currentItems[idx].variantIndex = variantIndex;
      currentItems[idx].variantDiff = getOptionItemVariantDiff(item, variantIndex);
      currentItems[idx].qty = Math.max(1, Number(currentItems[idx].qty || 0));
      if (!Number.isFinite(Number(currentItems[idx].basePrice))) {
        currentItems[idx].basePrice = getOptionItemBasePrice(item);
      }
    }

    byGroup.set(gid, { type: "multiple_group", items: currentItems });
    state.optionSelections.set(pid, byGroup);
    renderProducts(state.currentProducts);
    return true;
  }

  function calculateOptionPriceDiff(productId) {
    const pid = Number(productId || 0);
    const byGroup = state.optionSelections.get(pid);
    if (!(byGroup instanceof Map) || byGroup.size === 0) return 0;
    let total = 0;
    for (const [groupIdRaw, entry] of byGroup.entries()) {
      const groupId = Number(groupIdRaw || 0);
      const details = groupId > 0 ? state.optionGroupDetails.get(groupId) : null;
      const items = Array.isArray(details?.items) ? details.items : [];
      const itemsById = new Map(items.map((it) => [Number(it?.id || 0), it]));
      const selections = Array.isArray(entry?.items) ? entry.items : [];
      for (const s of selections) {
        const qty = Math.max(0, Number(s?.qty || 0));
        const selectedId = Number(s?.id || 0);
        const selectedItem = itemsById.get(selectedId);
        const basePrice = selectedItem ? getOptionItemBasePrice(selectedItem) : Number(s?.basePrice || 0);
        const variantDiff = Number(s?.variantDiff || 0);
        total += (basePrice + variantDiff) * qty;
      }
    }
    return total;
  }

  function getProductPhotos(product) {
    const out = [];
    const pushPhoto = (val) => {
      const raw = val && typeof val === "object"
        ? (val.url || val.path || val.src || val.photo || "")
        : val;
      const src = resolveMediaUrl(raw);
      if (!src) return;
      if (!out.includes(src)) out.push(src);
    };
    if (Array.isArray(product?.photos)) product.photos.forEach(pushPhoto);
    if (Array.isArray(product?.photos_json)) product.photos_json.forEach(pushPhoto);
    if (Array.isArray(product?.grid_photos)) product.grid_photos.forEach(pushPhoto);
    if (Array.isArray(product?.grid_photos_thumb)) product.grid_photos_thumb.forEach(pushPhoto);
    if (typeof product?.photos_json === "string" && product.photos_json.trim()) {
      try {
        const parsed = JSON.parse(product.photos_json);
        if (Array.isArray(parsed)) parsed.forEach(pushPhoto);
      } catch {}
    }
    pushPhoto(product?.image_thumb);
    pushPhoto(product?.image_url);
    pushPhoto(product?.image);
    pushPhoto(product?.photo);
    return out;
  }

  function getProductPhoto(product) {
    const photos = getProductPhotos(product);
    return photos[0] || "";
  }

  function renderCategoryIcon(icon) {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      return `<span class="stage-icon"><img src="${escapeHtml(v)}" alt="" /></span>`;
    }
    const cls = v || "fas fa-folder";
    return `<span class="stage-icon"><i class="${escapeHtml(cls)}"></i></span>`;
  }

  function renderCategoryThumb(icon) {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) return `<img src="${escapeHtml(v)}" alt="" />`;
    const cls = v || "fas fa-folder";
    return `<i class="${escapeHtml(cls)}"></i>`;
  }

  function renderCategories() {
    categoriesListEl.innerHTML = "";
    const rows = Array.isArray(state.categories) ? state.categories : [];

    const checkoutScreenActive = String(state.activeCategoryId) === CHECKOUT_SCREEN_ID;
    const checkoutRow = document.createElement("button");
    checkoutRow.type = "button";
    checkoutRow.className = `stage-item ${checkoutScreenActive ? "is-active" : ""}`;
    checkoutRow.setAttribute("data-category-id", CHECKOUT_SCREEN_ID);
    checkoutRow.innerHTML = `
      <span class="stage-icon"><i class="fas fa-desktop"></i></span>
      <span class="stage-meta stage-text"><b>Р­РєСЂР°РЅ РѕС„РѕСЂРјР»РµРЅРёСЏ</b></span>
      <span class="acc-spacer"></span>
    `;
    categoriesListEl.appendChild(checkoutRow);

    if (!rows.length) {
      if (categoriesEmptyEl) categoriesEmptyEl.classList.add("hidden");
      return;
    }
    if (categoriesEmptyEl) categoriesEmptyEl.classList.add("hidden");

    rows.forEach((cat) => {
      const isActive = Number(cat.id) === Number(state.activeCategoryId);
      const row = document.createElement("button");
      row.type = "button";
      row.className = `stage-item ${isActive ? "is-active" : ""}`;
      row.setAttribute("data-category-id", String(cat.id));
      row.innerHTML = `
        ${renderCategoryIcon(cat.icon)}
        <span class="stage-meta stage-text"><b>${escapeHtml(cat.title || "РљР°С‚РµРіРѕСЂРёСЏ")}</b></span>
        <span class="acc-spacer"></span>
      `;
      categoriesListEl.appendChild(row);
    });
  }

  function renderProducts(products) {
    const prevScrollByProduct = new Map();
    Array.from(productsGridEl.querySelectorAll("[data-product-id]")).forEach((card) => {
      const pid = Number(card.getAttribute("data-product-id") || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      const snapshot = {
        optionsRow: 0,
        optionGroups: new Map(),
        optionVariants: new Map(),
      };
      const optionsRow = card.querySelector(".new-order-options");
      if (optionsRow && optionsRow.scrollWidth > optionsRow.clientWidth) {
        snapshot.optionsRow = optionsRow.scrollLeft;
      }
      card.querySelectorAll(".new-order-option-scroll[data-group-id]").forEach((row) => {
        const gid = Number(row.getAttribute("data-group-id") || 0);
        if (!Number.isFinite(gid) || gid <= 0) return;
        if (row.scrollWidth > row.clientWidth) snapshot.optionGroups.set(gid, row.scrollLeft);
      });
      card.querySelectorAll(".new-order-option-tile-variants[data-group-id][data-item-id]").forEach((row) => {
        const gid = Number(row.getAttribute("data-group-id") || 0);
        const iid = Number(row.getAttribute("data-item-id") || 0);
        if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return;
        if (row.scrollWidth > row.clientWidth) snapshot.optionVariants.set(`${gid}:${iid}`, row.scrollLeft);
      });
      prevScrollByProduct.set(pid, snapshot);
    });

    productsGridEl.innerHTML = "";
    const list = Array.isArray(products) ? products : [];

    if (!list.length) {
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "РўРѕРІР°СЂРѕРІ РІ РєР°С‚РµРіРѕСЂРёРё РїРѕРєР° РЅРµС‚";
        productsEmptyEl.classList.remove("hidden");
      }
      return;
    }
    if (productsEmptyEl) productsEmptyEl.classList.add("hidden");

    const restoreQueue = [];
    list.forEach((product) => {
      const pid = Number(product?.id || 0);
      const isComboCard = String(product?.type || "").toLowerCase() === "combo" || Number(product?.is_combo || 0) === 1;
      const isUnavailable = !isProductAvailableFlag(product);
      const qty = getProductCardQty(pid);
      const photoUrl = getProductPhoto(product);
      const pricing = getCurrentProductUnitPricing(product, pid);
      const price = Number(pricing.unitPrice || 0);
      const oldPrice = Number(pricing.oldPrice || 0);
      const hasOldPrice = Boolean(pricing.hasOldPrice);
      const discountPercent = hasOldPrice && oldPrice > price
        ? Math.max(1, Math.round(((oldPrice - price) / oldPrice) * 100))
        : 0;
      const variantChips = getVariantChipsForProduct(pid);
      const ingredientRows = getIngredientRowsForProduct(pid);
      const optionGroups = Array.isArray(state.productOptionGroups.get(pid)) ? state.productOptionGroups.get(pid) : [];
      const primaryOptionGroup = optionGroups[0] || null;
      const hasOptions = optionGroups.length > 0 && Number(primaryOptionGroup?.group_id || primaryOptionGroup?.id || 0) > 0;
      const primaryOptionGroupId = Number(primaryOptionGroup?.group_id || primaryOptionGroup?.id || 0);
      const primaryOptionGroupTitle = String(primaryOptionGroup?.title || "РћРїС†РёРё").trim() || "РћРїС†РёРё";

      const card = document.createElement("article");
      card.className = `new-order-product-card${isUnavailable ? " is-unavailable" : ""}`;
      card.setAttribute("data-is-available", isUnavailable ? "0" : "1");
      if (isComboCard) {
        const comboId = Number(product?.combo_id || product?.id || 0);
        const comboPrice = Number(product?.min_price ?? product?.price ?? 0);
        const comboDiscountPercent = Math.max(0, Number(product?.discount_percent || 0));
        const comboDiscountLabel = formatDiscountPercentLabel(comboDiscountPercent);
        card.setAttribute("data-combo-id", String(comboId));
        card.setAttribute("tabindex", isUnavailable ? "-1" : "0");
        card.innerHTML = `
          ${comboDiscountLabel ? `<span class="shop-sheet-discount-badge new-order-card-discount-badge">-${escapeHtml(comboDiscountLabel)}%</span>` : ""}
          <div class="new-order-product-content no-scrollbar">
            <div class="new-order-product-photo-wrap">
              ${photoUrl ? `<img class="new-order-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<div class="new-order-product-photo-placeholder"><i class="fas fa-image"></i></div>`}
            </div>
            <div class="new-order-product-main">
              <div class="new-order-product-title" title="${escapeHtml(product?.title || product?.name || "РљРѕРјР±Рѕ")}">${escapeHtml(product?.title || product?.name || "РљРѕРјР±Рѕ")}</div>
              ${String(product?.description || "").trim() ? `<div class="new-order-product-subtitle">${escapeHtml(String(product.description || "").trim())}</div>` : ""}
            </div>
          </div>
          <div class="new-order-product-bottom">
            <button class="new-order-add-btn" type="button" data-action="combo-open" data-combo-id="${comboId}" title="Р”РѕР±Р°РІРёС‚СЊ РєРѕРјР±Рѕ"${isUnavailable ? " disabled aria-disabled=\"true\"" : ""}>
              <span class="new-order-add-price">${escapeHtml(toMoney(comboPrice))}</span>
              <span class="new-order-add-plus">+</span>
            </button>
          </div>
        `;
        productsGridEl.appendChild(card);
        return;
      }
      card.setAttribute("data-product-id", String(pid));
      card.innerHTML = `
        ${discountPercent > 0 ? `<span class="shop-sheet-discount-badge new-order-card-discount-badge">-${escapeHtml(formatDiscountPercentLabel(discountPercent))}%</span>` : ""}
        <div class="new-order-product-content no-scrollbar">
          <div class="new-order-product-photo-wrap">
            ${photoUrl ? `<img class="new-order-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<div class="new-order-product-photo-placeholder"><i class="fas fa-image\"></i></div>`}
          </div>
          <div class="new-order-product-main">
            <div class="new-order-product-title" title="${escapeHtml(product?.name || "РўРѕРІР°СЂ")}">${escapeHtml(product?.name || "РўРѕРІР°СЂ")}</div>
            ${variantChips.length ? `<div class="new-order-product-variants no-scrollbar">${variantChips.map((chip) => `<button class="new-order-variant-chip${chip.isSelected ? " is-selected" : ""}" type="button" data-action="variant-select" data-variant-index="${chip.index}" title="${escapeHtml(chip.label)}">${escapeHtml(chip.label)}</button>`).join("")}</div>` : ""}
            ${ingredientRows.length ? `<div class="new-order-ingredients">${ingredientRows.join("")}</div>` : ""}
          </div>
        </div>
        <div class="new-order-product-bottom">
          <div class="qty-pill qty-pill--muted" data-qty-wrap>
            <button class="qty-pill__btn qty-pill__btn--minus${qty <= 1 ? " is-disabled" : ""}" type="button" data-action="qty-minus"${isUnavailable ? " disabled" : ""}>−</button>
            <span class="qty-pill__center" data-qty-value>${qty}</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="qty-plus"${isUnavailable ? " disabled" : ""}>+</button>
          </div>
          ${hasOptions ? `
            <button
              class="new-order-options-btn"
              type="button"
              data-action="product-options-open"
              data-group-id="${primaryOptionGroupId}"
              data-group-title="${escapeHtml(primaryOptionGroupTitle)}"
              title="РћРїС†РёРё"
              ${isUnavailable ? "disabled" : ""}
            >
              <i class="fas fa-sliders-h"></i>
              <span>РћРїС†РёРё</span>
            </button>
          ` : ""}
          <button class="new-order-add-btn" type="button" data-action="product-add-quick" title="Р”РѕР±Р°РІРёС‚СЊ РІ Р·Р°РєР°Р·"${isUnavailable ? " disabled aria-disabled=\"true\"" : ""}>
            <span class="new-order-add-old ${hasOldPrice ? "" : "hidden"}">${hasOldPrice ? escapeHtml(toMoney(oldPrice)) : ""}</span>
            <span class="new-order-add-price">${escapeHtml(toMoney(price))}</span>
            <span class="new-order-add-plus">+</span>
          </button>
        </div>
      `;
      const prev = prevScrollByProduct.get(pid);
      if (prev) restoreQueue.push({ pid, prev });
      productsGridEl.appendChild(card);
    });

    if (restoreQueue.length) {
      requestAnimationFrame(() => {
        restoreQueue.forEach(({ pid, prev }) => {
          const card = productsGridEl.querySelector(`[data-product-id="${pid}"]`);
          if (!card) return;
          const optionsRow = card.querySelector(".new-order-options");
          if (optionsRow && prev.optionsRow > 0) optionsRow.scrollLeft = prev.optionsRow;

          card.querySelectorAll(".new-order-option-scroll[data-group-id]").forEach((row) => {
            const gid = Number(row.getAttribute("data-group-id") || 0);
            if (!Number.isFinite(gid) || gid <= 0) return;
            const left = prev.optionGroups.get(gid);
            if (left != null) row.scrollLeft = left;
          });

          card.querySelectorAll(".new-order-option-tile-variants[data-group-id][data-item-id]").forEach((row) => {
            const gid = Number(row.getAttribute("data-group-id") || 0);
            const iid = Number(row.getAttribute("data-item-id") || 0);
            if (!Number.isFinite(gid) || gid <= 0 || !Number.isFinite(iid) || iid <= 0) return;
            const left = prev.optionVariants.get(`${gid}:${iid}`);
            if (left != null) row.scrollLeft = left;
          });
        });
      });
    }
  }

  function getIngredientRowsForProduct(productId) {
    const pid = Number(productId);
    const ingredients = state.productIngredients.get(pid) || [];
    if (!ingredients.length) return [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();

    return ingredients.map((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      const canMinus = currentQty > min;
      const canPlus = currentQty < max;

      return `
        <div class="new-order-ingredient-row">
          <div class="new-order-ingredient-name" title="${escapeHtml(ing.ingredient_name || "")}">${escapeHtml(ing.ingredient_name || "")}</div>
          <div class="new-order-ingredient-controls">
            <button class="new-order-ingredient-btn${canMinus ? "" : " is-disabled"}" type="button" data-action="ingredient-minus" data-ingredient-id="${ingId}">−</button>
            <span class="new-order-ingredient-qty">${escapeHtml(String(currentQty))} ${escapeHtml(unitLabel)}</span>
            <button class="new-order-ingredient-btn${canPlus ? "" : " is-disabled"}" type="button" data-action="ingredient-plus" data-ingredient-id="${ingId}">+</button>
          </div>
        </div>
      `;
    });
  }

  function adjustIngredientQty(productId, ingredientId, deltaRaw) {
    const pid = Number(productId || 0);
    const ingId = Number(ingredientId || 0);
    const delta = Number(deltaRaw || 0);
    if (!(pid > 0) || !(ingId > 0) || !Number.isFinite(delta) || delta === 0) return false;
    const ingredients = state.productIngredients.get(pid) || [];
    const ing = ingredients.find((x) => Number(x?.ingredient_id || 0) === ingId);
    if (!ing) return false;

    const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
    const defaultQty = Number(ing.quantity ?? 1);
    const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
    const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
    const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
    const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;

    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
    let nextQty = currentQty + (delta > 0 ? step : -step);
    if (step > 0) {
      const stepsFromMin = Math.round((nextQty - min) / step);
      nextQty = min + (stepsFromMin * step);
    }
    nextQty = Math.max(min, Math.min(max, nextQty));
    qtyMap.set(ingId, nextQty);
    state.ingredientStateByProduct.set(pid, qtyMap);
    return true;
  }

  function getCheckoutIngredientRowsForProduct(productId, sectionKey) {
    const pid = Number(productId || 0);
    const key = String(sectionKey || "");
    const ingredients = state.productIngredients.get(pid) || [];
    if (!ingredients.length) return [];
    const qtyMap = state.ingredientStateByProduct.get(pid) || new Map();
    return ingredients.map((ing) => {
      const ingId = Number(ing.ingredient_id || 0);
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const currentQty = Number(qtyMap.get(ingId) ?? defaultQty);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      const canMinus = currentQty > min;
      const canPlus = currentQty < max;
      return `
        <div class="new-order-checkout-ing-row">
          <div class="new-order-checkout-ing-name" title="${escapeHtml(ing.ingredient_name || "")}">${escapeHtml(ing.ingredient_name || "")}</div>
          <div class="new-order-checkout-ing-controls">
            <button class="new-order-checkout-ing-btn${canMinus ? "" : " is-disabled"}" type="button" data-action="checkout-ingredient-minus" data-product-id="${pid}" data-section-key="${escapeHtml(key)}" data-ingredient-id="${ingId}">−</button>
            <span class="new-order-checkout-ing-qty">${escapeHtml(String(currentQty))} ${escapeHtml(unitLabel)}</span>
            <button class="new-order-checkout-ing-btn${canPlus ? "" : " is-disabled"}" type="button" data-action="checkout-ingredient-plus" data-product-id="${pid}" data-section-key="${escapeHtml(key)}" data-ingredient-id="${ingId}">+</button>
          </div>
        </div>
      `;
    });
  }

  function getOptionRowsForProduct(productId) {
    const pid = Number(productId);
    const groups = state.productOptionGroups.get(pid) || [];
    if (!Array.isArray(groups) || !groups.length) return [];
    const selectedByGroup = state.optionSelections.get(pid) || new Map();

    return groups.map((group) => {
      const groupId = Number(group?.group_id || group?.id || 0);
      const title = String(group?.title || "РћРїС†РёСЏ").trim();
      const selected = selectedByGroup.get(groupId);
      const selectedItems = Array.isArray(selected?.items) ? selected.items : [];
      let selectedLabel = "";
      if (selectedItems.length === 1) selectedLabel = String(selectedItems[0]?.label || "").trim();
      else if (selectedItems.length > 1) selectedLabel = `Р’С‹Р±СЂР°РЅРѕ: ${selectedItems.length}`;
      const details = state.optionGroupDetails.get(groupId);
      const detailsGroup = details?.group || null;
      const selectionType = String(detailsGroup?.selection_type || group?.selection_type || "single");
      const isSingle = selectionType !== "multiple";
      const isMultiple = selectionType === "multiple";
      const isRequiredRaw = detailsGroup?.is_required ?? group?.is_required ?? false;
      const isRequired = Number(isRequiredRaw) === 1 || isRequiredRaw === true || String(isRequiredRaw).toLowerCase() === "true";
      const detailItems = Array.isArray(details?.items) ? details.items : [];
      const groupType = getOptionGroupUiType({ ...(detailsGroup || group || {}), items: detailItems });
      const isMultipleItem = groupType === "multiple_item";
      const selectedIds = new Set(selectedItems.map((s) => Number(s?.id || 0)).filter((x) => Number.isFinite(x) && x > 0));
      const selectedByItemId = new Map(
        selectedItems
          .map((s) => [Number(s?.id || 0), s])
          .filter(([id]) => Number.isFinite(id) && id > 0)
      );
      const shouldShowAddCard = isSingle && !isRequired && selectedItems.length === 0;
      const onlySelectedSingleOptional = isSingle && !isRequired && selectedItems.length > 0;
      const renderItems = onlySelectedSingleOptional
        ? detailItems.filter((item) => selectedIds.has(Number(item?.id || 0)))
        : detailItems;
      const tiles = shouldShowAddCard
        ? `
          <button class="new-order-option-tile new-order-option-tile--add" type="button" data-action="option-open" data-group-id="${groupId}" title="Р”РѕР±Р°РІРёС‚СЊ РѕРїС†РёСЋ">
            <span class="new-order-option-add-plus">+</span>
          </button>
        `
        : renderItems.length
        ? renderItems.map((item) => {
            const itemId = Number(item?.id || 0);
            const isSelected = selectedIds.has(itemId);
            const name = String(item?.name || item?.product_name || "РџРѕР·РёС†РёСЏ");
            const selectedEntry = selectedByItemId.get(itemId) || null;
            const selectedQty = Math.max(0, Number(selectedEntry?.qty || 0));
            const variants = Array.isArray(item?.variants) ? item.variants : [];
            const variantGroup = variants[0];
            const variantValues = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
            const defaultVariantIndex = getOptionItemDefaultVariantIndex(item);
            const activeVariantIndex = Number.isFinite(Number(selectedEntry?.variantIndex))
              ? Number(selectedEntry.variantIndex)
              : defaultVariantIndex;
            const optionPrice = getOptionItemBasePrice(item)
              + (Number.isFinite(Number(activeVariantIndex)) ? getOptionItemVariantDiff(item, Number(activeVariantIndex)) : 0);
            const qMaxRaw = Number(item?.qty_max ?? 99);
            const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
            const qtyControlsHtml = isMultipleItem
              ? `<div class="new-order-option-tile-qty">
                  <button class="new-order-option-tile-qty-btn${selectedQty <= 0 ? " is-disabled" : ""}" type="button" data-action="option-quick-qty-minus" data-group-id="${groupId}" data-item-id="${itemId}">−</button>
                   <span class="new-order-option-tile-qty-value">${selectedQty}</span>
                   <button class="new-order-option-tile-qty-btn${selectedQty >= qMax ? " is-disabled" : ""}" type="button" data-action="option-quick-qty-plus" data-group-id="${groupId}" data-item-id="${itemId}">+</button>
                 </div>`
              : "";
            const variantsHtml = !isMultipleItem && variantValues.length && (isSelected || isMultiple)
              ? `<div class="new-order-option-tile-variants no-scrollbar" data-group-id="${groupId}" data-item-id="${itemId}">${variantValues
                  .map((v, idx) => `<span class="new-order-option-tile-variant ${idx === activeVariantIndex ? "is-selected" : ""}" data-action="option-quick-variant" data-group-id="${groupId}" data-item-id="${itemId}" data-variant-index="${idx}" title="${escapeHtml(String(v))}">${escapeHtml(String(v))}</span>`)
                  .join("")}</div>`
              : "";
            const tileAction = isMultiple ? (isMultipleItem ? "option-open" : "option-quick-toggle") : "option-open";
            if (isMultipleItem) {
              return `
                <div class="new-order-option-tile${isSelected ? " is-selected" : ""}" data-group-id="${groupId}" data-item-id="${itemId}" title="${escapeHtml(name)}">
                  <span class="new-order-option-tile-name">${escapeHtml(name)}</span>
                  <span class="new-order-option-tile-price">${escapeHtml(toMoney(optionPrice))}</span>
                  ${qtyControlsHtml}
                </div>
              `;
            }
            return `
              <button class="new-order-option-tile${isSelected ? " is-selected" : ""}" type="button" data-action="${tileAction}" data-group-id="${groupId}" data-item-id="${itemId}" title="${escapeHtml(name)}">
                <span class="new-order-option-tile-name">${escapeHtml(name)}</span>
                <span class="new-order-option-tile-price">${escapeHtml(toMoney(optionPrice))}</span>
                ${variantsHtml}
              </button>
            `;
          }).join("")
        : `
          <button class="new-order-option-tile is-placeholder" type="button" data-action="option-open" data-group-id="${groupId}" title="${escapeHtml(title)}">
            <span class="new-order-option-tile-name">${selectedLabel ? escapeHtml(selectedLabel) : "Р’С‹Р±СЂР°С‚СЊ"}</span>
            <span class="new-order-option-tile-edit">РР·РјРµРЅРёС‚СЊ &gt;</span>
          </button>
        `;
      return `
        <div class="new-order-option-block">
          <div class="new-order-option-title">${escapeHtml(title)}</div>
          <div class="new-order-option-scroll no-scrollbar" data-group-id="${groupId}">${tiles}</div>
        </div>
      `;
    });
  }

  async function loadOptionGroupDetails(groupId) {
    const gid = Number(groupId || 0);
    if (!Number.isFinite(gid) || gid <= 0) return { group: null, items: [] };
    if (state.optionGroupDetails.has(gid)) return state.optionGroupDetails.get(gid);
    try {
      const json = await apiJson(`/api/public/options/groups/${gid}`);
      const data = json && typeof json.data === "object" && json.data ? json.data : { group: null, items: [] };
      const normalized = {
        group: data.group || null,
        items: Array.isArray(data.items) ? data.items : [],
      };
      state.optionGroupDetails.set(gid, normalized);
      schedulePersistBootstrapSnapshot();
      return normalized;
    } catch {
      const fallback = { group: null, items: [] };
      state.optionGroupDetails.set(gid, fallback);
      schedulePersistBootstrapSnapshot();
      return fallback;
    }
  }

  function getOptionOverlayElements() {
    const backdrop = document.getElementById("newOrderOptionOverlay");
    const title = document.getElementById("newOrderOptionOverlayTitle");
    const list = document.getElementById("newOrderOptionOverlayList");
    return { backdrop, title, list };
  }

  function ensureOptionOverlay() {
    if (document.getElementById("newOrderOptionOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderOptionOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="option-overlay-close"><i class="fas fa-arrow-left"></i></button>
          <div class="new-order-option-sheet-title" id="newOrderOptionOverlayTitle">РћРїС†РёСЏ</div>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar" id="newOrderOptionOverlayList"></div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function closeOptionOverlay() {
    const { backdrop, list } = getOptionOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
    if (list) list.innerHTML = "";
  }

  function getCheckoutCategoriesOverlayElements() {
    const backdrop = document.getElementById("newOrderCheckoutCategoriesOverlay");
    const title = document.getElementById("newOrderCheckoutCategoriesOverlayTitle");
    const list = document.getElementById("newOrderCheckoutCategoriesOverlayList");
    const requireAllInput = document.getElementById("newOrderCheckoutRequireAllInput");
    const blockTitleInput = document.getElementById("newOrderCheckoutBlockTitleInput");
    const saveBtn = document.getElementById("newOrderCheckoutCategoriesSaveBtn");
    const cancelBtn = document.getElementById("newOrderCheckoutCategoriesCancelBtn");
    return { backdrop, title, list, requireAllInput, blockTitleInput, saveBtn, cancelBtn };
  }

  function ensureCheckoutCategoriesOverlay() {
    if (document.getElementById("newOrderCheckoutCategoriesOverlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "newOrderCheckoutCategoriesOverlay";
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet">
        <div class="new-order-option-sheet-head">
          <button class="new-order-option-sheet-back" type="button" data-action="checkout-categories-overlay-close"><i class="fas fa-arrow-left"></i></button>
          <div class="new-order-option-sheet-title" id="newOrderCheckoutCategoriesOverlayTitle">РљР°С‚РµРіРѕСЂРёРё</div>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar" id="newOrderCheckoutCategoriesOverlayList"></div>
        <div class="new-order-checkout-categories-footer">
          <label class="new-order-right-form-field">
            <input id="newOrderCheckoutBlockTitleInput" class="control" type="text" placeholder="РќР°Р·РІР°РЅРёРµ Р±Р»РѕРєР°" maxlength="120" />
          </label>
          <label class="switch new-order-checkout-categories-switch">
            <input id="newOrderCheckoutRequireAllInput" class="switch-input" type="checkbox" checked />
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text">РћР±СЏР·Р°С‚РµР»СЊРЅРѕ РІС‹Р±РёСЂР°С‚СЊ РІСЃРµ С‚РѕРІР°СЂС‹</span>
          </label>
          <div class="new-order-checkout-categories-actions">
          <button class="new-order-checkout-categories-action-btn is-save" type="button" id="newOrderCheckoutCategoriesSaveBtn">РЎРѕС…СЂР°РЅРёС‚СЊ</button>
          <button class="new-order-checkout-categories-action-btn is-cancel" type="button" id="newOrderCheckoutCategoriesCancelBtn">РћС‚РјРµРЅР°</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
  }

  function closeCheckoutCategoriesOverlay() {
    const { backdrop, list } = getCheckoutCategoriesOverlayElements();
    if (!backdrop) return;
    backdrop.classList.add("hidden");
    backdrop.onclick = null;
    if (list) list.innerHTML = "";
  }

  function openCheckoutCategoriesOverlay(blockId = null) {
    ensureCheckoutCategoriesOverlay();
    const { backdrop, title, list, requireAllInput, blockTitleInput, saveBtn, cancelBtn } = getCheckoutCategoriesOverlayElements();
    if (!backdrop || !title || !list || !requireAllInput || !blockTitleInput || !saveBtn || !cancelBtn) return;
    const editingBlock = getCheckoutBlockById(blockId);
    state.checkoutEditingBlockId = editingBlock ? Number(editingBlock.id) : null;

    title.textContent = "РљР°С‚РµРіРѕСЂРёРё";
    const rows = (Array.isArray(state.productCategories) ? state.productCategories : [])
      .filter((c) => Number(c?.is_active || 0) === 1);
    const initialSelected = new Set(
      Array.isArray(editingBlock?.categoryIds)
        ? editingBlock.categoryIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
        : []
    );
    const selected = new Set(initialSelected);
    requireAllInput.checked = editingBlock ? Boolean(editingBlock.requireAll) : true;
    blockTitleInput.value = String(editingBlock?.title || "");

    function renderRows() {
      if (!rows.length) {
        list.innerHTML = `<div class="new-order-option-sheet-empty">РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РєР°С‚РµРіРѕСЂРёР№</div>`;
        return;
      }

      list.innerHTML = rows.map((cat) => {
        const name = String(cat?.title || "РљР°С‚РµРіРѕСЂРёСЏ");
        const categoryId = Number(cat?.id || 0);
        const isSelected = selected.has(categoryId);
        return `
          <label class="new-order-option-sheet-item ${isSelected ? "is-selected" : ""}" data-category-id="${categoryId}">
            <input class="new-order-checkout-category-checkbox" type="checkbox" ${isSelected ? "checked" : ""} />
            <span class="new-order-option-sheet-item-thumb">${renderCategoryThumb(cat?.icon)}</span>
            <span class="new-order-option-sheet-item-main">
              <span class="new-order-option-sheet-item-title">${escapeHtml(name)}</span>
            </span>
          </label>
        `;
      }).join("");
    }
    renderRows();

    backdrop.classList.remove("hidden");
    backdrop.onclick = (e) => {
      const closeBtn = e.target.closest("[data-action='checkout-categories-overlay-close']");
      if (closeBtn || e.target === backdrop) {
        closeCheckoutCategoriesOverlay();
        return;
      }
      const row = e.target.closest("[data-category-id]");
      if (!row) return;
      const categoryId = Number(row.getAttribute("data-category-id") || 0);
      if (!Number.isFinite(categoryId) || categoryId <= 0) return;
      if (selected.has(categoryId)) selected.delete(categoryId);
      else selected.add(categoryId);
      renderRows();
    };

    cancelBtn.onclick = () => {
      state.checkoutEditingBlockId = null;
      closeCheckoutCategoriesOverlay();
    };
    saveBtn.onclick = async () => {
      const selectedIds = [...selected].map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
      if (!selectedIds.length) {
        state.checkoutEditingBlockId = null;
        closeCheckoutCategoriesOverlay();
        return;
      }
      if (!state.checkoutDraft || typeof state.checkoutDraft !== "object") {
        state.checkoutDraft = { blocks: [] };
      }
      if (!Array.isArray(state.checkoutDraft.blocks)) state.checkoutDraft.blocks = [];
      if (state.checkoutEditingBlockId) {
        const targetId = Number(state.checkoutEditingBlockId);
        state.checkoutDraft.blocks = state.checkoutDraft.blocks.map((block) => {
          const bid = Number(block?.id || 0);
          if (bid !== targetId) return block;
          return {
            id: bid,
            title: String(blockTitleInput.value || "").trim().slice(0, 120),
            categoryIds: selectedIds,
            requireAll: Boolean(requireAllInput.checked),
          };
        });
      } else {
        state.checkoutDraft.blocks.push({
          id: Date.now() + Math.floor(Math.random() * 10000),
          title: String(blockTitleInput.value || "").trim().slice(0, 120),
          categoryIds: selectedIds,
          requireAll: Boolean(requireAllInput.checked),
        });
      }
      state.checkoutEditingBlockId = null;
      await loadCheckoutProductsForSelectedCategories();
      closeCheckoutCategoriesOverlay();
    };
  }

  async function openOptionOverlay(productId, groupId, fallbackTitle) {
    ensureOptionOverlay();
    const pid = Number(productId || 0);
    const gid = Number(groupId || 0);
    if (!Number.isFinite(pid) || pid <= 0 || !Number.isFinite(gid) || gid <= 0) return;
    const { backdrop, title, list } = getOptionOverlayElements();
    if (!backdrop || !title || !list) return;

    title.textContent = String(fallbackTitle || "РћРїС†РёСЏ");
    list.innerHTML = `<div class="new-order-option-sheet-empty">Р—Р°РіСЂСѓР·РєР°...</div>`;
    backdrop.classList.remove("hidden");

    const details = await loadOptionGroupDetails(gid);
    const group = details?.group || null;
    const sheetTitle = String(group?.title || fallbackTitle || "РћРїС†РёСЏ");
    title.textContent = sheetTitle;
    const items = Array.isArray(details?.items) ? details.items : [];
    await ensureOptionTargetProducts(items);
    const groupType = getOptionGroupUiType({ ...(group || {}), items });

    const byGroup = state.optionSelections.get(pid) || new Map();
    const existing = byGroup.get(gid);
    const selectionItems = Array.isArray(existing?.items) ? existing.items.map((x) => ({ ...x })) : [];
    const selById = new Map(selectionItems.map((x) => [Number(x.id), x]));
    const expandedItemVariants = new Set();

    function itemVariantDiff(item, selectedIdx) {
      return getOptionItemVariantDiff(item, selectedIdx);
    }

    function ensureDefaultSelection() {
      if (groupType === "single" && (!selectionItems.length && group?.is_required) && items.length) {
        const first = items[0];
        const label = String(first?.name || first?.product_name || "");
        const next = { id: Number(first.id), label, qty: 1, basePrice: getOptionItemBasePrice(first), variantDiff: 0 };
        selectionItems.push(next);
        selById.set(next.id, next);
      }
    }
    ensureDefaultSelection();

    function syncSelectionToState() {
      const nextByGroup = state.optionSelections.get(pid) || new Map();
      nextByGroup.set(gid, {
        type: groupType,
        items: selectionItems.filter((x) => Number(x.qty || 0) > 0),
      });
      state.optionSelections.set(pid, nextByGroup);
      renderProducts(state.currentProducts);
    }

    function renderList() {
      if (!items.length) {
        list.innerHTML = `<div class="new-order-option-sheet-empty">Р’ СЌС‚РѕР№ РѕРїС†РёРё РЅРµС‚ РїРѕР·РёС†РёР№</div>`;
        return;
      }
      list.innerHTML = items.map((item) => {
        const itemId = Number(item?.id || 0);
        const selected = selById.get(itemId);
        const selectedQty = Math.max(0, Number(selected?.qty || 0));
        const isSelected = selectedQty > 0;
        const photos = Array.isArray(item?.product_photos_json) ? item.product_photos_json : [];
        const photo = photos.length ? String(photos[0] || "").trim() : "";
        const name = String(item?.name || item?.product_name || "РџРѕР·РёС†РёСЏ");
        const defaultVariantIndex = getOptionItemDefaultVariantIndex(item);
        const activeVariantIndex = Number.isFinite(Number(selected?.variantIndex)) ? Number(selected.variantIndex) : defaultVariantIndex;
        const basePrice = getOptionItemBasePrice(item);
        const variantDiff = Number.isFinite(Number(selected?.variantDiff))
          ? Number(selected.variantDiff)
          : (Number.isFinite(Number(activeVariantIndex)) ? itemVariantDiff(item, activeVariantIndex) : 0);
        const rowPrice = basePrice + variantDiff;
        const hasVariants = Array.isArray(item?.variants) && item.variants.length && Array.isArray(item.variants[0]?.values) && item.variants[0].values.length;
        const variantBlockOpen = expandedItemVariants.has(itemId);
        const variants = hasVariants ? item.variants[0].values : [];
        const selectedVariantIndex = Number.isFinite(Number(activeVariantIndex)) ? Number(activeVariantIndex) : 0;
        const controls = groupType === "multiple_item"
          ? `<div class="new-order-opt-qty">
               <button type="button" class="new-order-opt-qty-btn" data-action="opt-qty-minus" data-item-id="${itemId}">−</button>
               <span class="new-order-opt-qty-value">${selectedQty}</span>
               <button type="button" class="new-order-opt-qty-btn is-plus" data-action="opt-qty-plus" data-item-id="${itemId}">+</button>
             </div>`
          : (groupType === "single"
              ? ``
              : `<button type="button" class="new-order-opt-check ${isSelected ? "is-selected" : ""}" data-action="opt-toggle-item" data-item-id="${itemId}"></button>`);
        const rowAction = hasVariants ? `data-action="opt-variants-toggle" data-item-id="${itemId}"` : "";

        return `
          <div class="new-order-option-sheet-card ${isSelected ? "is-selected" : ""}">
            <div class="new-order-option-sheet-item-row" ${rowAction}>
              <span class="new-order-option-sheet-item-thumb">${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : `<i class="fas fa-image"></i>`}</span>
              <span class="new-order-option-sheet-item-main">
                <span class="new-order-option-sheet-item-title">${escapeHtml(name)}</span>
                <span class="new-order-option-sheet-item-meta">${escapeHtml(toMoney(rowPrice))}</span>
              </span>
              <button type="button" class="new-order-opt-gear ${hasVariants ? "" : "is-disabled"}" data-action="opt-variants-toggle" data-item-id="${itemId}"><i class="fas fa-cog"></i></button>
              ${controls}
            </div>
            ${hasVariants && variantBlockOpen ? `<div class="new-order-opt-variants-row">${variants.map((v, idx) => `<button type="button" class="new-order-opt-variant-btn ${idx === selectedVariantIndex ? "is-selected" : ""}" data-action="opt-variant-select" data-item-id="${itemId}" data-variant-index="${idx}">${escapeHtml(String(v))}</button>`).join("")}</div>` : ""}
          </div>
        `;
      }).join("");
    }

    renderList();

    backdrop.onclick = (e) => {
      const closeBtn = e.target.closest("[data-action='option-overlay-close']");
      if (closeBtn || e.target === backdrop) {
        closeOptionOverlay();
        return;
      }
      const targetBtn = e.target.closest("[data-action]");
      if (!targetBtn) return;
      const action = targetBtn.getAttribute("data-action");
      const itemId = Number(targetBtn.getAttribute("data-item-id") || 0);
      const item = items.find((x) => Number(x?.id || 0) === itemId);
      if (!item || !Number.isFinite(itemId) || itemId <= 0) return;
      const name = String(item?.name || item?.product_name || "РџРѕР·РёС†РёСЏ");
      const entry = selById.get(itemId) || { id: itemId, label: name, qty: 0, basePrice: getOptionItemBasePrice(item), variantDiff: 0 };
      if (!Number.isFinite(Number(entry.variantIndex))) {
        const dIdx = getOptionItemDefaultVariantIndex(item);
        if (Number.isFinite(Number(dIdx))) {
          entry.variantIndex = Number(dIdx);
          entry.variantDiff = itemVariantDiff(item, Number(dIdx));
        }
      }

      if (action === "opt-variants-toggle") {
        if (targetBtn.classList.contains("is-disabled")) return;
        if (expandedItemVariants.has(itemId)) expandedItemVariants.delete(itemId);
        else expandedItemVariants.add(itemId);
        renderList();
        return;
      }
      if (action === "opt-variant-select") {
        const idx = Number(targetBtn.getAttribute("data-variant-index") || 0);
        const currentIdx = Number.isFinite(Number(entry.variantIndex)) ? Number(entry.variantIndex) : null;
        const isSecondClickSameVariant = currentIdx != null && currentIdx === idx && Number(entry.qty || 0) > 0;
        entry.variantIndex = idx;
        entry.variantDiff = itemVariantDiff(item, idx);
        entry.qty = Math.max(1, Number(entry.qty || 0));
        selById.set(itemId, entry);
        if (isSecondClickSameVariant) {
          const nextItemsBeforeClose = [];
          for (const value of selById.values()) {
            if (Number(value.qty || 0) > 0) nextItemsBeforeClose.push(value);
          }
          if (groupType === "single" && nextItemsBeforeClose.length > 1) {
            const keep = nextItemsBeforeClose[nextItemsBeforeClose.length - 1];
            selById.clear();
            selById.set(keep.id, keep);
            selectionItems.splice(0, selectionItems.length, keep);
          } else {
            selectionItems.splice(0, selectionItems.length, ...nextItemsBeforeClose);
          }
          syncSelectionToState();
          closeOptionOverlay();
          return;
        }
      } else if (action === "opt-toggle-item") {
        if (groupType === "single") {
          selById.clear();
          selectionItems.splice(0, selectionItems.length);
          entry.qty = 1;
          selById.set(itemId, entry);
        } else {
          if (Number(entry.qty || 0) > 0) entry.qty = 0;
          else entry.qty = 1;
          selById.set(itemId, entry);
        }
      } else if (action === "opt-qty-minus") {
        const qMin = Math.max(0, Number(item?.qty_min ?? 0));
        const next = Math.max(qMin, Number(entry.qty || 0) - 1);
        entry.qty = next;
        selById.set(itemId, entry);
      } else if (action === "opt-qty-plus") {
        const qMaxRaw = Number(item?.qty_max ?? 99);
        const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
        entry.qty = Math.min(qMax, Number(entry.qty || 0) + 1);
        selById.set(itemId, entry);
      } else {
        return;
      }

      const nextItems = [];
      for (const value of selById.values()) {
        if (Number(value.qty || 0) > 0) nextItems.push(value);
      }
      if (groupType === "single" && nextItems.length > 1) {
        const keep = nextItems[nextItems.length - 1];
        selById.clear();
        selById.set(keep.id, keep);
        selectionItems.splice(0, selectionItems.length, keep);
      } else {
        selectionItems.splice(0, selectionItems.length, ...nextItems);
      }
      syncSelectionToState();
      renderList();
    };
  }

  function toVariantLabel(value) {
    if (value == null) return "";
    if (typeof value === "string" || typeof value === "number") return String(value).trim();
    if (typeof value === "object") {
      const raw = value.label ?? value.value ?? value.title ?? "";
      return String(raw).trim();
    }
    return "";
  }

  function normalizeUnitLabelShort(raw) {
    const src = String(raw || "").trim();
    if (!src) return "";
    const key = src.toLowerCase();
    const dict = {
      "грамм": "г",
      "грамма": "г",
      "граммов": "г",
      "гр": "г",
      "г": "г",
      "килограмм": "кг",
      "килограмма": "кг",
      "килограммов": "кг",
      "кг": "кг",
      "штука": "шт",
      "штук": "шт",
      "шт": "шт",
      "литр": "л",
      "литра": "л",
      "л": "л",
      "миллилитр": "мл",
      "миллилитров": "мл",
      "мл": "мл",
      "gram": "g",
      "g": "g",
      "kg": "kg",
      "pcs": "шт",
      "pc": "шт",
      "piece": "шт",
      "l": "l",
      "ml": "ml",
    };
    return dict[key] || src;
  }

  function getVariantUnitLabel(group) {
    const direct = String(group?.unit_short_title || group?.unit_title || group?.unit_code || "").trim();
    if (direct) return normalizeUnitLabelShort(direct);
    const title = String(group?.title || "").trim();
    const m = title.match(/\(([^)]+)\)/);
    if (m && m[1]) return normalizeUnitLabelShort(m[1]);
    return "";
  }

  function getResolvedVariantIndex(productId, variantsRaw) {
    const pid = Number(productId || 0);
    const variants = Array.isArray(variantsRaw) ? variantsRaw : [];
    if (!(pid > 0) || !variants.length) return 0;
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    if (!values.length) return 0;

    const selectedRaw = Number(state.selectedVariants.get(pid));
    if (Number.isFinite(selectedRaw) && selectedRaw >= 0 && selectedRaw < values.length) {
      return selectedRaw;
    }

    const defaultRaw = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
    const safeDefault = Number.isFinite(defaultRaw) && defaultRaw >= 0 && defaultRaw < values.length ? defaultRaw : 0;
    state.selectedVariants.set(pid, safeDefault);
    return safeDefault;
  }

  function getVariantChipsForProduct(productId) {
    const pid = Number(productId || 0);
    const groups = state.productVariants.get(pid);
    if (!Array.isArray(groups) || !groups.length) return [];

    const chips = [];
    const selectedIndex = getResolvedVariantIndex(pid, groups);
    for (const group of groups) {
      const values = Array.isArray(group?.values) ? group.values : [];
      const unit = getVariantUnitLabel(group);
      values.forEach((value, index) => {
        const label = toVariantLabel(value);
        if (!label) return;
        chips.push({
          label: unit ? `${label} ${unit}` : label,
          index,
          isSelected: index === selectedIndex,
        });
      });
    }
    return chips.slice(0, 60);
  }

  function getCheckoutSelectedVariantStockLabel(productId, product) {
    const pid = Number(productId || product?.id || 0);
    if (!(pid > 0) || !product || typeof product !== "object") return "";
    const stockRaw = product?.stock_qty;
    if (stockRaw == null || stockRaw === "") return "";
    const stockQty = Number(stockRaw);
    if (!Number.isFinite(stockQty) || stockQty <= 0) return "";

    const groups = state.productVariants.get(pid) || [];
    const group = Array.isArray(groups) && groups.length ? groups[0] : null;
    const unitFromGroup = getVariantUnitLabel(group);
    const unitFromProduct = normalizeUnitLabelShort(
      String(product?.unit_short_title || product?.unit_title || product?.unit_code || "").trim()
    );

    let displayQty = stockQty;
    const baseUnitId = Number(product?.base_unit_id || product?.unit_id || group?.unit_id || 0);
    const variantUnitId = Number(group?.unit_id || baseUnitId || 0);
    if (baseUnitId && variantUnitId && baseUnitId !== variantUnitId) {
      const factor = getConversionFactor(baseUnitId, variantUnitId);
      if (factor != null) {
        const converted = stockQty * Number(factor || 0);
        if (Number.isFinite(converted)) displayQty = converted;
      }
    }

    if (!(displayQty > 0)) return "";
    const unitLabel = String(unitFromGroup || unitFromProduct || "").trim();
    const valueText = formatQtyPlain(displayQty);
    if (!valueText) return "";
    return [valueText, unitLabel].filter(Boolean).join(" ").trim();
  }

  async function loadVariantsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productVariants.has(id));
    if (!missingIds.length) return;

    const chunkSize = 200;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      try {
        const json = await apiJson("/api/public/products/batch/variants", {
          method: "POST",
          body: JSON.stringify({ ids: chunk }),
        });
        const data = json && typeof json.data === "object" && json.data ? json.data : {};
        chunk.forEach((id) => {
          const variants = Array.isArray(data[String(id)]) ? data[String(id)] : [];
          state.productVariants.set(id, variants);
          if (!state.selectedVariants.has(id) && variants.length) {
            const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
            const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
            const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
            state.selectedVariants.set(id, safeDefault);
          }
        });
      } catch {
        chunk.forEach((id) => {
          state.productVariants.set(id, []);
        });
      }
    }
    schedulePersistBootstrapSnapshot();
  }

  function createIngredientQtyMap(list) {
    const qtyMap = new Map();
    (Array.isArray(list) ? list : []).forEach((ing) => {
      const ingId = Number(ing?.ingredient_id || 0);
      if (!Number.isFinite(ingId) || ingId <= 0) return;
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      let initialQty = Math.max(min, Math.min(max, defaultQty));
      if (step > 0) {
        const stepsFromMin = Math.round((initialQty - min) / step);
        initialQty = min + (stepsFromMin * step);
        initialQty = Math.max(min, Math.min(max, initialQty));
      }
      qtyMap.set(ingId, initialQty);
    });
    return qtyMap;
  }

  async function loadIngredientsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productIngredients.has(id));
    if (!missingIds.length) return;

    const chunkSize = 200;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      try {
        const json = await apiJson("/api/public/products/batch/ingredients", {
          method: "POST",
          body: JSON.stringify({ ids: chunk }),
        });
        const data = json && typeof json.data === "object" && json.data ? json.data : {};
        chunk.forEach((id) => {
          const list = Array.isArray(data[String(id)]) ? data[String(id)] : [];
          state.productIngredients.set(id, list);
          if (!state.ingredientStateByProduct.has(id)) {
            const qtyMap = createIngredientQtyMap(list);
            state.ingredientStateByProduct.set(id, qtyMap);
          }
        });
      } catch {
        chunk.forEach((id) => {
          state.productIngredients.set(id, []);
        });
      }
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadOptionsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productOptionGroups.has(id));
    if (!missingIds.length) return;
    const chunkSize = 200;
    for (let i = 0; i < missingIds.length; i += chunkSize) {
      const chunk = missingIds.slice(i, i + chunkSize);
      try {
        const json = await apiJson("/api/public/products/batch/option-assignments", {
          method: "POST",
          body: JSON.stringify({ ids: chunk }),
        });
        const data = json && typeof json.data === "object" && json.data ? json.data : {};
        chunk.forEach((id) => {
          const rows = Array.isArray(data[String(id)]) ? data[String(id)] : [];
          state.productOptionGroups.set(id, rows);
        });
      } catch {
        chunk.forEach((id) => {
          state.productOptionGroups.set(id, []);
        });
      }
    }
    schedulePersistBootstrapSnapshot();
  }

  async function loadOptionDetailsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const groupIds = [];
    ids.forEach((pid) => {
      const groups = state.productOptionGroups.get(pid) || [];
      groups.forEach((g) => {
        const gid = Number(g?.group_id || g?.id || 0);
        if (Number.isFinite(gid) && gid > 0 && !state.optionGroupDetails.has(gid)) groupIds.push(gid);
      });
    });
    const unique = [...new Set(groupIds)];
    if (!unique.length) return;
    await Promise.all(unique.map((gid) => loadOptionGroupDetails(gid)));
  }

  async function loadUnitConversions() {
    try {
      const json = await apiJson("/api/public/unit-conversions");
      state.unitConversions = Array.isArray(json?.data) ? json.data : [];
    } catch {
      state.unitConversions = [];
    }
    schedulePersistBootstrapSnapshot();
  }

  function buildComboCardsFromPayload(combos) {
    return (Array.isArray(combos) ? combos : [])
      .filter((c) => Number(c?.is_active ?? 1) === 1)
      .map((c, idx) => ({
        id: 100000000 + Number(c?.id || idx + 1),
        combo_id: Number(c?.id || 0),
        type: "combo",
        is_combo: 1,
        title: String(c?.title || c?.name || "РљРѕРјР±Рѕ"),
        name: String(c?.title || c?.name || "РљРѕРјР±Рѕ"),
        description: String(c?.description || ""),
        discount_percent: Number(c?.discount_percent || 0),
        is_available: Number(c?.is_available ?? 1) === 1 ? 1 : 0,
        min_price: Number(c?.min_price || 0),
        price: Number(c?.min_price || 0),
        image_thumb: c?.image_thumb || null,
        image_url: c?.image_url || null,
        grid_photos: Array.isArray(c?.grid_photos) ? c.grid_photos : [],
        grid_photos_thumb: Array.isArray(c?.grid_photos_thumb) ? c.grid_photos_thumb : [],
      }));
  }

  function buildCategoryPayload(productsSource, combosSource) {
    const source = Array.isArray(productsSource) ? productsSource : [];
    const combos = Array.isArray(combosSource) ? combosSource : [];
    const activeOnly = source.filter((p) => Number(p?.is_active || 0) === 1 && isSiteVisibleProduct(p));
    const comboCards = buildComboCardsFromPayload(combos);
    return {
      source,
      combos,
      activeOnly,
      comboCards,
      currentProducts: [...activeOnly, ...comboCards],
    };
  }

  async function preloadAllCategoryProducts(categoryIds) {
    const ids = [...new Set((Array.isArray(categoryIds) ? categoryIds : [])
      .map((id) => Number(id || 0))
      .filter((id) => Number.isFinite(id) && id > 0))];
    if (!ids.length) return;
    try {
      const json = await apiJson("/api/public/products/batch/categories", {
        method: "POST",
        body: JSON.stringify({ category_ids: ids }),
      });
      const productsByCategory = json && typeof json.data === "object" && json.data ? json.data : {};
      const combosByCategory = json && typeof json.combos === "object" && json.combos ? json.combos : {};
      const allProducts = [];
      ids.forEach((cid) => {
        const source = Array.isArray(productsByCategory[String(cid)]) ? productsByCategory[String(cid)] : [];
        const combos = Array.isArray(combosByCategory[String(cid)]) ? combosByCategory[String(cid)] : [];
        const payload = buildCategoryPayload(source, combos);
        state.categoryProductsCache.set(cid, payload);
        state.checkoutCategoryProducts.set(cid, payload.activeOnly);
        allProducts.push(...payload.activeOnly);
        writeCategoryProductsCache(cid, source);
      });
      await loadVariantsForProducts(allProducts);
      await loadIngredientsForProducts(allProducts);
      await loadOptionsForProducts(allProducts);
      schedulePersistBootstrapSnapshot(0);
    } catch {}
  }

  async function loadProductsForCategory(categoryId, opts = {}) {
    if (!Number.isFinite(Number(categoryId))) return;
    const preferCache = opts.preferCache !== false;
    try {
      const cid = Number(categoryId || 0);
      if (preferCache && state.categoryProductsCache.has(cid)) {
        const cachedPayload = state.categoryProductsCache.get(cid);
        if (cachedPayload && Array.isArray(cachedPayload.activeOnly)) {
          state.checkoutCategoryProducts.set(cid, cachedPayload.activeOnly);
        }
        state.currentProducts = Array.isArray(cachedPayload?.currentProducts) ? cachedPayload.currentProducts : [];
        await loadVariantsForProducts(cachedPayload?.activeOnly || []);
        await loadIngredientsForProducts(cachedPayload?.activeOnly || []);
        await loadOptionsForProducts(cachedPayload?.activeOnly || []);
        renderProducts(state.currentProducts);
        return;
      }

      productsGridEl.innerHTML = "";
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Р—Р°РіСЂСѓР·РєР° С‚РѕРІР°СЂРѕРІ...";
        productsEmptyEl.classList.remove("hidden");
      }
      const json = await apiJson(`/api/public/products?category_id=${encodeURIComponent(String(categoryId))}`);
      const source = Array.isArray(json?.data) ? json.data : [];
      const combos = Array.isArray(json?.combos) ? json.combos : [];
      const payload = buildCategoryPayload(source, combos);
      state.categoryProductsCache.set(cid, payload);
      state.checkoutCategoryProducts.set(cid, payload.activeOnly);
      state.currentProducts = payload.currentProducts;
      await loadVariantsForProducts(payload.activeOnly);
      await loadIngredientsForProducts(payload.activeOnly);
      await loadOptionsForProducts(payload.activeOnly);
      await loadOptionDetailsForProducts(payload.activeOnly);
      writeCategoryProductsCache(cid, payload.source);
      schedulePersistBootstrapSnapshot(0);
      renderProducts(state.currentProducts);
    } catch (e) {
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё С‚РѕРІР°СЂРѕРІ";
        productsEmptyEl.classList.remove("hidden");
      }
    }
  }

  function bindEvents() {
    let draggedCheckoutBlockId = 0;

    function findHorizontalScrollTarget(startEl) {
      const selectors = [
        ".new-order-option-tile-variants",
        ".new-order-option-scroll",
        ".new-order-options",
        ".new-order-product-variants",
      ];
      let node = startEl instanceof Element ? startEl : null;
      while (node && node !== productsGridEl) {
        if (selectors.some((sel) => node.matches(sel)) && node.scrollWidth > node.clientWidth) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    }

    categoriesListEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category-id]");
      if (!btn) return;
      const rawCategoryId = String(btn.getAttribute("data-category-id") || "").trim();
      if (!rawCategoryId) return;
      if (rawCategoryId === CHECKOUT_SCREEN_ID) {
        state.activeCategoryId = CHECKOUT_SCREEN_ID;
        schedulePersistBootstrapSnapshot(0);
        void loadCheckoutProductsForSelectedCategories();
        renderCategories();
        renderMainContentMode();
        return;
      }
      const cid = Number(rawCategoryId);
      if (!Number.isFinite(cid) || cid <= 0) return;
      if (state.checkoutEditMode) {
        state.checkoutEditMode = false;
        state.checkoutDraft = null;
      }
      state.activeCategoryId = cid;
      schedulePersistBootstrapSnapshot(0);
      renderCategories();
      renderMainContentMode();
      loadProductsForCategory(cid);
    });

    const rightInteractionEl = rightPanelEl || rightContentEl;
    if (rightInteractionEl) {
      const isCommentTextarea = (node) => String(node?.tagName || "").toUpperCase() === "TEXTAREA";
      const autosizeCommentField = (field) => {
        if (!isCommentTextarea(field)) return;
        if (!field.classList.contains("is-expanded")) return;
        field.style.height = "auto";
        const minHeight = 40;
        const maxHeight = 150;
        const nextHeight = Math.max(minHeight, Math.min(maxHeight, field.scrollHeight || minHeight));
        field.style.height = `${nextHeight}px`;
        field.scrollTop = field.scrollHeight;
      };
      const collapseCommentField = (field) => {
        if (!isCommentTextarea(field)) return;
        field.classList.remove("is-expanded");
        field.style.height = "";
        field.scrollTop = 0;
      };
      const bindCommentFieldAutogrow = (field) => {
        if (!isCommentTextarea(field)) return;
        if (field.dataset.commentGrowBound === "1") return;
        field.dataset.commentGrowBound = "1";
        collapseCommentField(field);
        field.addEventListener("focus", () => {
          field.classList.add("is-expanded");
          autosizeCommentField(field);
        });
        field.addEventListener("blur", () => {
          collapseCommentField(field);
        });
        field.addEventListener("input", () => {
          autosizeCommentField(field);
        });
      };

      rightInteractionEl.addEventListener("click", (e) => {
        if (state.rightCartClearConfirmUntilByOrder.size) {
          const anyActionTarget = e.target.closest("[data-action]");
          const clearActionTarget = e.target.closest("[data-action='right-cart-clear'][data-order-id]");
          if (anyActionTarget && !clearActionTarget) {
            resetAllRightCartClearState({ render: false });
          }
        }

        const discountToggleBtn = e.target.closest("[data-action='right-order-discount-toggle'][data-order-id]");
        if (discountToggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const orderId = Number(discountToggleBtn.getAttribute("data-order-id") || 0);
          const summaryCard = discountToggleBtn.closest(".order-summary");
          const breakdown = summaryCard ? summaryCard.querySelector("[data-right-discount-breakdown='1']") : null;
          if (!breakdown) return;
          const willOpen = !breakdown.classList.contains("is-open");
          breakdown.classList.toggle("is-open", willOpen);
          breakdown.classList.toggle("hidden", !willOpen);
          breakdown.setAttribute("aria-hidden", willOpen ? "false" : "true");
          discountToggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
          if (orderId > 0) {
            if (willOpen) state.rightDiscountBreakdownOpenByOrder.set(orderId, true);
            else state.rightDiscountBreakdownOpenByOrder.delete(orderId);
          }
          return;
        }

        const addressEditBtn = e.target.closest(".new-order-right-address-edit");
        if (addressEditBtn) {
          const formRoot = addressEditBtn.closest(".new-order-right-form[data-order-id]");
          const orderId = Number(formRoot?.getAttribute("data-order-id") || 0);
          if (orderId > 0) void openRightAddressOverlay(orderId);
          return;
        }

        const addressInput = e.target.closest("[data-action='right-input-change'][data-field='address'][data-order-id]");
        if (addressInput) {
          const currentAddress = String(addressInput.value || "").trim();
          if (!currentAddress) {
            const orderId = Number(addressInput.getAttribute("data-order-id") || 0);
            if (orderId > 0) void openRightAddressOverlay(orderId);
            e.preventDefault();
            return;
          }
        }

        const cartVariantBtn = e.target.closest("[data-action='right-cart-variant-select'][data-order-id][data-cart-item-id][data-row-kind][data-variant-index]");
        if (cartVariantBtn) {
          const orderId = Number(cartVariantBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartVariantBtn.getAttribute("data-cart-item-id") || 0);
          const rowKind = String(cartVariantBtn.getAttribute("data-row-kind") || "");
          const sectionIndex = Number(cartVariantBtn.getAttribute("data-section-index") || 0);
          const optionIndex = Number(cartVariantBtn.getAttribute("data-option-index") || -1);
          const variantIndex = Number(cartVariantBtn.getAttribute("data-variant-index") || -1);
          if (!(orderId > 0) || !(cartItemId > 0) || !rowKind || !Number.isFinite(variantIndex) || variantIndex < 0) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          if (rowKind === "combo") {
            const sections = Array.isArray(item.sections) ? item.sections.map((section) => ({ ...section, variant: section?.variant && typeof section.variant === "object" ? { ...section.variant } : {} })) : [];
            const safeSectionIndex = Number.isFinite(sectionIndex) ? sectionIndex : 0;
            if (safeSectionIndex < 0 || safeSectionIndex >= sections.length) return;
            const section = { ...sections[safeSectionIndex] };
            const values = Array.isArray(section?.variant?.values) ? section.variant.values : [];
            if (!values.length || variantIndex >= values.length) return;
            section.variant.selected_index = variantIndex;
            section.variant.label = String(values[variantIndex] || "").trim();
            sections[safeSectionIndex] = section;
            item.sections = sections;
          } else {
            if (rowKind === "option") {
              const optionItems = Array.isArray(item.option_items) ? item.option_items.map((x) => ({ ...x })) : [];
              if (!(optionIndex >= 0) || optionIndex >= optionItems.length) return;
              const opt = { ...optionItems[optionIndex] };
              const groupId = Number(opt?.group_id || 0);
              const itemId = Number(opt?.id || 0);
              const details = state.optionGroupDetails.get(groupId);
              const detailItems = Array.isArray(details?.items) ? details.items : [];
              const detailItem = detailItems.find((x) => Number(x?.id || 0) === itemId);
              if (!detailItem) return;
              const variants = Array.isArray(detailItem?.variants) ? detailItem.variants : [];
              const vg = variants[0];
              const values = Array.isArray(vg?.values) ? vg.values : [];
              if (!values.length || variantIndex >= values.length) return;
              opt.variantIndex = variantIndex;
              opt.variantDiff = getOptionItemVariantDiff(detailItem, variantIndex);
              optionItems[optionIndex] = opt;
              item.option_items = optionItems;
            } else {
              const variant = item?.variant && typeof item.variant === "object" ? { ...item.variant } : {};
              const values = Array.isArray(variant?.values) ? variant.values : [];
              if (!values.length || variantIndex >= values.length) return;
              variant.selected_index = variantIndex;
              variant.label = String(values[variantIndex] || "").trim();
              item.variant = variant;
            }
          }
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartOpenProductBtn = e.target.closest("[data-action='right-cart-open-product'][data-order-id][data-cart-item-id]");
        if (cartOpenProductBtn) {
          const orderId = Number(cartOpenProductBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartOpenProductBtn.getAttribute("data-cart-item-id") || 0);
          const productId = Number(cartOpenProductBtn.getAttribute("data-product-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          let pid = productId;
          if (!(pid > 0)) {
            const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
            if (orderIndex >= 0) {
              const order = state.rightOrders[orderIndex] || {};
              const form = order.form && typeof order.form === "object" ? order.form : {};
              const cartItems = Array.isArray(form.cartItems) ? form.cartItems : [];
              const item = cartItems.find((x) => Number(x?.id || 0) === cartItemId);
              pid = Number(item?.product_id || 0);
            }
          }
          if (pid > 0) {
            const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
            const sourceItem = orderIndex >= 0
              ? ((Array.isArray(state.rightOrders[orderIndex]?.form?.cartItems) ? state.rightOrders[orderIndex].form.cartItems : []).find((x) => Number(x?.id || 0) === cartItemId) || null)
              : null;
            void openProductOverlay(pid, {
              mode: "edit",
              orderId,
              cartItemId,
              cartItem: sourceItem,
            });
          }
          return;
        }

        const cartOpenComboBtn = e.target.closest("[data-action='right-cart-open-combo'][data-order-id][data-cart-item-id]");
        if (cartOpenComboBtn) {
          const orderId = Number(cartOpenComboBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartOpenComboBtn.getAttribute("data-cart-item-id") || 0);
          let comboId = Number(cartOpenComboBtn.getAttribute("data-combo-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? order.form : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems : [];
          const sourceItem = cartItems.find((x) => Number(x?.id || 0) === cartItemId) || null;
          if (!sourceItem || String(sourceItem?.type || "") !== "combo") return;
          if (!(comboId > 0)) comboId = Number(sourceItem?.combo_id || 0);
          if (!(comboId > 0)) return;
          void openComboOverlay(comboId, {
            mode: "edit",
            orderId,
            cartItemId,
            cartItem: sourceItem,
          });
          return;
        }

        const cartQtyBtn = e.target.closest("[data-action='right-cart-qty-minus'], [data-action='right-cart-qty-plus']");
        if (cartQtyBtn) {
          const action = String(cartQtyBtn.getAttribute("data-action") || "");
          const orderId = Number(cartQtyBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartQtyBtn.getAttribute("data-cart-item-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          if (!isRightOrderAutoQtyEditable(item)) return;
          const currentQty = Math.max(1, Number(item?.qty || 1));
          const nextQty = action === "right-cart-qty-plus"
            ? currentQty + 1
            : Math.max(0, currentQty - 1);
          if (nextQty === currentQty) return;
          if (nextQty <= 0) {
            markRightOrderAutoAddDismissedByCartItem(orderId, item);
            cartItems.splice(itemIndex, 1);
            updateRightOrderCartItems(orderId, cartItems, { render: true });
            return;
          }
          item.qty = nextQty;
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartOptionQtyBtn = e.target.closest("[data-action='right-cart-option-qty-minus'], [data-action='right-cart-option-qty-plus']");
        if (cartOptionQtyBtn) {
          const action = String(cartOptionQtyBtn.getAttribute("data-action") || "");
          const orderId = Number(cartOptionQtyBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartOptionQtyBtn.getAttribute("data-cart-item-id") || 0);
          const optionIndex = Number(cartOptionQtyBtn.getAttribute("data-option-index") || -1);
          if (!(orderId > 0) || !(cartItemId > 0) || !(optionIndex >= 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((x) => ({ ...x })) : [];
          const itemIndex = cartItems.findIndex((x) => Number(x?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          if (String(item?.type || "") === "combo") return;
          const optionItems = Array.isArray(item.option_items) ? item.option_items.map((x) => ({ ...x })) : [];
          if (optionIndex >= optionItems.length) return;
          const opt = { ...optionItems[optionIndex] };
          const groupId = Number(opt?.group_id || 0);
          const itemId = Number(opt?.id || 0);
          const details = state.optionGroupDetails.get(groupId);
          const detailItems = Array.isArray(details?.items) ? details.items : [];
          const detailItem = detailItems.find((x) => Number(x?.id || 0) === itemId);
          const qMin = Math.max(0, Number(detailItem?.qty_min ?? 0));
          const qMaxRaw = Number(detailItem?.qty_max ?? 99);
          const qMax = Number.isFinite(qMaxRaw) && qMaxRaw > 0 ? qMaxRaw : 99;
          const currentQty = Math.max(0, Number(opt?.qty || 0));
          const nextQty = action === "right-cart-option-qty-plus"
            ? Math.min(qMax, currentQty + 1)
            : Math.max(qMin, currentQty - 1);
          if (nextQty === currentQty) return;
          opt.qty = nextQty;
          optionItems[optionIndex] = opt;
          item.option_items = optionItems.filter((x) => Math.max(0, Number(x?.qty || 0)) > 0);
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartOptionRemoveBtn = e.target.closest("[data-action='right-cart-option-remove'][data-order-id][data-cart-item-id][data-option-index]");
        if (cartOptionRemoveBtn) {
          const orderId = Number(cartOptionRemoveBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartOptionRemoveBtn.getAttribute("data-cart-item-id") || 0);
          const optionIndex = Number(cartOptionRemoveBtn.getAttribute("data-option-index") || -1);
          if (!(orderId > 0) || !(cartItemId > 0) || !(optionIndex >= 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((x) => ({ ...x })) : [];
          const itemIndex = cartItems.findIndex((x) => Number(x?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          if (String(item?.type || "") === "combo") return;
          const optionItems = Array.isArray(item.option_items) ? item.option_items.map((x) => ({ ...x })) : [];
          if (optionIndex >= optionItems.length) return;
          optionItems.splice(optionIndex, 1);
          item.option_items = optionItems;
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartItemDeleteBtn = e.target.closest("[data-action='right-cart-item-delete'][data-order-id][data-cart-item-id]");
        if (cartItemDeleteBtn) {
          const orderId = Number(cartItemDeleteBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartItemDeleteBtn.getAttribute("data-cart-item-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const removedItem = cartItems.find((item) => Number(item?.id || 0) === cartItemId) || null;
          const nextItems = cartItems.filter((item) => Number(item?.id || 0) !== cartItemId);
          if (nextItems.length === cartItems.length) return;
          markRightOrderAutoAddDismissedByCartItem(orderId, removedItem);
          updateRightOrderCartItems(orderId, nextItems, { render: true });
          return;
        }

        const cartItemCopyBtn = e.target.closest("[data-action='right-cart-item-copy'][data-order-id][data-cart-item-id]");
        if (cartItemCopyBtn) {
          const orderId = Number(cartItemCopyBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartItemCopyBtn.getAttribute("data-cart-item-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;

          const sourceItem = cartItems[itemIndex];
          let copiedItem = null;
          try {
            copiedItem = JSON.parse(JSON.stringify(sourceItem));
          } catch {
            copiedItem = { ...sourceItem };
          }
          copiedItem.id = Date.now() + Math.floor(Math.random() * 10000);
          copiedItem.qty = 1;
          copiedItem = recalculateCartItemTotals(copiedItem);

          cartItems.splice(itemIndex + 1, 0, copiedItem);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartItemSplitBtn = e.target.closest("[data-action='right-cart-item-split'][data-order-id][data-cart-item-id]");
        if (cartItemSplitBtn) {
          const orderId = Number(cartItemSplitBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartItemSplitBtn.getAttribute("data-cart-item-id") || 0);
          if (!(orderId > 0) || !(cartItemId > 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;

          const sourceItem = { ...cartItems[itemIndex] };
          const sourceQty = Math.max(1, Number(sourceItem?.qty || 1));
          if (sourceQty <= 1) return;

          sourceItem.qty = sourceQty - 1;
          cartItems[itemIndex] = recalculateCartItemTotals(sourceItem);

          let splitItem = null;
          try {
            splitItem = JSON.parse(JSON.stringify(sourceItem));
          } catch {
            splitItem = { ...sourceItem };
          }
          splitItem.id = Date.now() + Math.floor(Math.random() * 10000);
          splitItem.qty = 1;
          splitItem = recalculateCartItemTotals(splitItem);

          cartItems.splice(itemIndex + 1, 0, splitItem);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartRowRemoveBtn = e.target.closest("[data-action='right-cart-row-remove'][data-order-id][data-cart-item-id][data-row-kind]");
        if (cartRowRemoveBtn) {
          const orderId = Number(cartRowRemoveBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartRowRemoveBtn.getAttribute("data-cart-item-id") || 0);
          const rowKind = String(cartRowRemoveBtn.getAttribute("data-row-kind") || "");
          const sectionIndex = Number(cartRowRemoveBtn.getAttribute("data-section-index") || 0);
          if (!(orderId > 0) || !(cartItemId > 0) || !rowKind) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          if (rowKind === "combo" && String(item?.type || "") === "combo") {
            const isCheckoutComposedCombo = Number(item?.combo_id || 0) <= 0;
            const comboRequireAll = getCartItemCheckoutRequireAll(item);
            if (!isCheckoutComposedCombo || comboRequireAll !== false) return;
            const sections = Array.isArray(item.sections) ? item.sections.map((section) => ({ ...section })) : [];
            const safeSectionIndex = Number.isFinite(sectionIndex) ? sectionIndex : -1;
            if (!(safeSectionIndex >= 0) || safeSectionIndex >= sections.length) return;
            sections.splice(safeSectionIndex, 1);
            if (!sections.length) {
              cartItems.splice(itemIndex, 1);
              updateRightOrderCartItems(orderId, cartItems, { render: true });
              return;
            }
            item.sections = sections;
            if (Array.isArray(item.selections)) {
              const filteredSelections = item.selections
                .map((row) => ({ ...row }))
                .filter((_row, idx) => idx !== safeSectionIndex)
                .map((row, idx) => ({ ...row, block_index: idx }));
              item.selections = filteredSelections;
            }
            item.photos = sections
              .map((section) => String(section?.photo_url || "").trim())
              .filter(Boolean)
              .slice(0, 4);
            cartItems[itemIndex] = recalculateCartItemTotals(item);
            updateRightOrderCartItems(orderId, cartItems, { render: true });
            return;
          }
          if (String(item?.type || "") === "combo") return;
          markRightOrderAutoAddDismissedByCartItem(orderId, item);
          cartItems.splice(itemIndex, 1);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartIngredientBtn = e.target.closest("[data-action='right-cart-ingredient-minus'], [data-action='right-cart-ingredient-plus']");
        if (cartIngredientBtn) {
          const action = String(cartIngredientBtn.getAttribute("data-action") || "");
          const orderId = Number(cartIngredientBtn.getAttribute("data-order-id") || 0);
          const cartItemId = Number(cartIngredientBtn.getAttribute("data-cart-item-id") || 0);
          const rowKind = String(cartIngredientBtn.getAttribute("data-row-kind") || "");
          const sectionIndex = Number(cartIngredientBtn.getAttribute("data-section-index") || 0);
          const ingredientIndex = Number(cartIngredientBtn.getAttribute("data-ingredient-index") || -1);
          if (!(orderId > 0) || !(cartItemId > 0) || !(ingredientIndex >= 0)) return;
          const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          if (orderIndex < 0) return;
          const order = state.rightOrders[orderIndex] || {};
          const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
          const itemIndex = cartItems.findIndex((item) => Number(item?.id || 0) === cartItemId);
          if (itemIndex < 0) return;
          const item = { ...cartItems[itemIndex] };
          const deltaSign = action === "right-cart-ingredient-plus" ? 1 : -1;

          const adjustRow = (row) => {
            const next = { ...row };
            const qty = Number(next?.qty || 0);
            const min = Number(next?.qty_min ?? 0);
            const max = Number(next?.qty_max ?? qty);
            const step = Number(next?.qty_step || 1) || 1;
            let nextQty = qty + (deltaSign > 0 ? step : -step);
            nextQty = Math.max(min, Math.min(max, nextQty));
            next.qty = nextQty;
            return next;
          };

          if (rowKind === "combo") {
            const sections = Array.isArray(item.sections) ? item.sections.map((section) => ({ ...section })) : [];
            if (!(sectionIndex >= 0) || sectionIndex >= sections.length) return;
            const section = { ...sections[sectionIndex] };
            const ingredients = Array.isArray(section.ingredients) ? section.ingredients.map((ing) => ({ ...ing })) : [];
            if (ingredientIndex >= ingredients.length) return;
            ingredients[ingredientIndex] = adjustRow(ingredients[ingredientIndex]);
            section.ingredients = ingredients;
            sections[sectionIndex] = section;
            item.sections = sections;
          } else {
            const ingredients = Array.isArray(item.ingredients) ? item.ingredients.map((ing) => ({ ...ing })) : [];
            if (ingredientIndex >= ingredients.length) return;
            ingredients[ingredientIndex] = adjustRow(ingredients[ingredientIndex]);
            item.ingredients = ingredients;
          }

          cartItems[itemIndex] = recalculateCartItemTotals(item);
          updateRightOrderCartItems(orderId, cartItems, { render: true });
          return;
        }

        const cartClearBtn = e.target.closest("[data-action='right-cart-clear'][data-order-id]");
        if (cartClearBtn) {
          const orderId = Number(cartClearBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          const idx = getRightOrderIndexById(orderId);
          if (idx < 0) return;
          const order = state.rightOrders[idx] || {};
          const submitMode = String(order?.mode || "add").toLowerCase();
          const editOrderId = Number(order?.editOrderId || 0);
          const isEditCancelMode = submitMode === "edit" && editOrderId > 0;
          const form = order.form && typeof order.form === "object" ? order.form : {};
          const cartItems = Array.isArray(form.cartItems) ? form.cartItems : [];
          const armedUntil = Number(state.rightCartClearConfirmUntilByOrder.get(orderId) || 0);
          const armed = armedUntil > Date.now();
          if (isEditCancelMode) {
            if (!armed) {
              armRightCartClearState(orderId);
              renderRightOrderTabs();
              return;
            }
            resetRightCartClearState(orderId, { render: false });
            document.dispatchEvent(
              new CustomEvent("neworder:edit-cancel", {
                detail: { orderId: editOrderId },
              })
            );
            return;
          }
          if (!cartItems.length) return;
          if (!armed) {
            armRightCartClearState(orderId);
            renderRightOrderTabs();
            return;
          }
          clearRightOrderCart(orderId);
          renderRightOrderTabs();
          return;
        }

        const checkoutBtn = e.target.closest("[data-action='right-cart-checkout'][data-order-id]");
        if (checkoutBtn) {
          const orderId = Number(checkoutBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          void submitRightOrder(orderId);
          return;
        }

        const checkoutPaidBtn = e.target.closest("[data-action='right-cart-checkout-paid'][data-order-id]");
        if (checkoutPaidBtn) {
          const orderId = Number(checkoutPaidBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          void submitRightOrder(orderId, { withPayment: true });
          return;
        }

        const optionBtn = e.target.closest("[data-action='right-select-option'][data-order-id][data-field][data-value]");
        if (optionBtn) {
          const orderId = Number(optionBtn.getAttribute("data-order-id") || 0);
          const field = String(optionBtn.getAttribute("data-field") || "");
          const value = String(optionBtn.getAttribute("data-value") || "");
          if (orderId > 0 && field) {
            updateRightOrderFormField(orderId, field, value);
            if (field === "changeType" && value !== "other") {
              updateRightOrderFormField(orderId, "changeAmount", "");
            }
            if (field === "cookWhen") {
              const kind = getCookWhenKind(value);
              const nextDate = kind === "on_date" ? getTomorrowIsoDate() : formatIsoDate(getTodayDate());
              if (kind !== "on_date") {
                updateRightOrderFormField(orderId, "scheduledDate", nextDate);
              } else {
                updateRightOrderFormField(orderId, "scheduledDate", nextDate);
              }
              const timeSlots = buildTimeSlotsForOptionWithDate(value, nextDate);
              if (timeSlots.length) {
                updateRightOrderFormField(orderId, "dateTime", timeSlots[0]);
              }
            }
            if (field === "pickupMethod") {
              void (async () => {
                await applyReceiveMethodAddress(orderId);
                renderRightOrderTabs();
              })();
            }
            if (field === "paymentMethod" && !isCashPaymentCode(value)) {
              updateRightOrderFormField(orderId, "changeType", "no_change");
              updateRightOrderFormField(orderId, "changeAmount", "");
            }
            if (field === "orderStatusId") {
              const selectedStatusId = Number(value || 0);
              const selectedStatusTitle = String(
                (Array.isArray(state.rightOrderStatuses) ? state.rightOrderStatuses : [])
                  .find((item) => Number(item?.id || 0) === selectedStatusId)?.title || ""
              ).trim();
              if (selectedStatusTitle) {
                updateRightOrderFormField(orderId, "orderStatusTitle", selectedStatusTitle);
              }
            }
            state.rightOpenSelect = null;
            renderRightOrderTabs();
          }
          return;
        }

        const monthPrevBtn = e.target.closest("[data-action='right-date-month-prev'][data-order-id]");
        if (monthPrevBtn) {
          const orderId = Number(monthPrevBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          const current = state.rightDatePickerMonthByOrder.get(orderId) || new Date();
          state.rightDatePickerMonthByOrder.set(orderId, addMonths(current, -1));
          renderRightOrderTabs();
          return;
        }

        const monthNextBtn = e.target.closest("[data-action='right-date-month-next'][data-order-id]");
        if (monthNextBtn) {
          const orderId = Number(monthNextBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          const current = state.rightDatePickerMonthByOrder.get(orderId) || new Date();
          state.rightDatePickerMonthByOrder.set(orderId, addMonths(current, 1));
          renderRightOrderTabs();
          return;
        }

        const dateSelectBtn = e.target.closest("[data-action='right-date-select'][data-order-id][data-value]");
        if (dateSelectBtn) {
          const orderId = Number(dateSelectBtn.getAttribute("data-order-id") || 0);
          const dateIso = String(dateSelectBtn.getAttribute("data-value") || "");
          if (!(orderId > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return;
          updateRightOrderFormField(orderId, "scheduledDate", dateIso);
          state.rightOpenSelect = null;
          renderRightOrderTabs();
          return;
        }

        const toggleBtn = e.target.closest("[data-action='right-select-toggle'][data-order-id][data-field]");
        if (!toggleBtn) return;
        const orderId = Number(toggleBtn.getAttribute("data-order-id") || 0);
        const field = String(toggleBtn.getAttribute("data-field") || "");
        if (!(orderId > 0) || !field) return;
        if (field === "orderStatusId") {
          const statuses = Array.isArray(state.rightOrderStatuses) ? state.rightOrderStatuses : [];
          if (statuses.length <= 1) {
            void loadRightOrderStatuses().then(() => {
              const stillOpen = Number(state.rightOpenSelect?.orderId || 0) === orderId
                && String(state.rightOpenSelect?.field || "") === field;
              if (stillOpen) renderRightOrderTabs();
            }).catch(() => {});
          }
        }
        const isSameOpen = Number(state.rightOpenSelect?.orderId || 0) === orderId
          && String(state.rightOpenSelect?.field || "") === field;
        state.rightOpenSelect = isSameOpen ? null : { orderId, field };
        if (!isSameOpen && field === "scheduledDate") {
          const idx = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
          const form = idx >= 0 ? (state.rightOrders[idx]?.form || {}) : {};
          const iso = String(form?.scheduledDate || "").trim();
          const base = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date();
          state.rightDatePickerMonthByOrder.set(orderId, new Date(base.getFullYear(), base.getMonth(), 1));
        }
        renderRightOrderTabs();
      });

      rightInteractionEl.addEventListener("input", (e) => {
        const input = e.target.closest("[data-action='right-input-change'][data-order-id][data-field]");
        if (!input) return;
        const orderId = Number(input.getAttribute("data-order-id") || 0);
        const field = String(input.getAttribute("data-field") || "");
        if (!(orderId > 0) || !field) return;
        updateRightOrderFormField(orderId, field, input.value);
        if (field === "phone") {
          const formatted = formatPhoneRuInput(input.value);
          input.value = formatted;
          const normalizedDigits = normalizePhoneRu(formatted);
          if (normalizedDigits.length === 11) {
            void lookupClientByPhoneForRightOrder(orderId, formatted);
          }
        }
        if (field === "changeAmount") {
          const summary = getRightOrderCheckoutSummaryByOrderId(orderId);
          const total = Math.max(0, roundPrice(summary.payableTotal || 0));
          const minAllowed = total + 1;
          const numeric = Number(String(input.value || "").replace(/[^\d]/g, ""));
          if (!Number.isFinite(numeric) || numeric <= 0) {
            input.setCustomValidity("");
          } else if (numeric < minAllowed) {
            input.setCustomValidity(`РњРёРЅРёРјР°Р»СЊРЅР°СЏ СЃСѓРјРјР°: ${minAllowed}`);
          } else {
            input.setCustomValidity("");
          }
          if (typeof input.reportValidity === "function") input.reportValidity();
        }
        if (String(field) === "comment") {
          bindCommentFieldAutogrow(input);
          autosizeCommentField(input);
        }
      });

      rightInteractionEl.addEventListener("keydown", (e) => {
        const input = e.target.closest("[data-action='right-input-change'][data-field='phone']");
        if (!input) return;
        if (e.key !== "Backspace") return;
        const start = Number(input.selectionStart ?? 0);
        const end = Number(input.selectionEnd ?? 0);
        if (start !== end) return;
        if (start !== String(input.value || "").length) return;

        const value = String(input.value || "");
        if (!value) return;
        const lastChar = value.slice(-1);
        if (/\d/.test(lastChar)) return;

        e.preventDefault();
        const nextValue = cutLastPhoneDigitPreservePrefix(value);
        input.value = nextValue;
        const orderId = Number(input.getAttribute("data-order-id") || 0);
        if (orderId > 0) updateRightOrderFormField(orderId, "phone", nextValue);
      });

      rightInteractionEl.addEventListener("focusin", (e) => {
        const commentField = e.target.closest(".new-order-right-comment[data-action='right-input-change']");
        if (commentField) bindCommentFieldAutogrow(commentField);
        const noAutofillInput = e.target.closest("[data-no-autofill='1']");
        if (noAutofillInput && noAutofillInput.hasAttribute("readonly")) {
          noAutofillInput.removeAttribute("readonly");
        }
        const input = e.target.closest("[data-action='right-input-change'][data-field='phone']");
        if (!input) return;
        const current = String(input.value || "").trim();
        if (!current) {
          input.value = "+7";
          const orderId = Number(input.getAttribute("data-order-id") || 0);
          if (orderId > 0) updateRightOrderFormField(orderId, "phone", input.value);
        }
      });

      rightInteractionEl.addEventListener(
        "wheel",
        (e) => {
          const row = e.target.closest(".new-order-right-cart-variant-scroll");
          if (!row || row.scrollWidth <= row.clientWidth) return;
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          row.scrollLeft += delta * 0.45;
          e.preventDefault();
        },
        { passive: false }
      );
    }

    document.addEventListener("click", (e) => {
      if (state.checkoutIngredientsPopoverKey) {
        const path = typeof e.composedPath === "function" ? e.composedPath() : [];
        const keepOpen = path.some((node) => {
          if (!(node instanceof Element)) return false;
          if (node.matches(".new-order-checkout-composition-popover")) return true;
          if (node.matches("[data-action='checkout-composition-toggle']")) return true;
          return false;
        });
        if (!keepOpen) {
          state.checkoutIngredientsPopoverKey = null;
          state.checkoutIngredientsPopoverPos = null;
          if (isCheckoutScreenActive()) renderCheckoutEditorContent();
        }
      }
      const target = e.target instanceof Element ? e.target : null;
      let shouldRenderRight = false;
      if (state.rightCartClearConfirmUntilByOrder.size) {
        const clickedClear = target?.closest("[data-action='right-cart-clear'][data-order-id]");
        if (!clickedClear) {
          resetAllRightCartClearState({ render: false });
          shouldRenderRight = true;
        }
      }
      if (state.rightOpenSelect) {
        const keepSelectOpen = target && (target.closest(".new-order-right-select-wrap") || target.closest(".new-order-right-calendar") || target.closest("[data-action='right-select-toggle']"));
        if (!keepSelectOpen) {
          state.rightOpenSelect = null;
          shouldRenderRight = true;
        }
      }
      if (shouldRenderRight) renderRightOrderTabs();
    });

    if (settingsBtnEl) {
      settingsBtnEl.addEventListener("click", async () => {
        if (state.checkoutEditMode) {
          const draftToSave = {
            blocks: Array.isArray(state.checkoutDraft?.blocks)
              ? state.checkoutDraft.blocks.map((block) => ({
                id: Number(block?.id || 0),
                title: String(block?.title || "").trim().slice(0, 120),
                categoryIds: Array.isArray(block?.categoryIds) ? [...block.categoryIds] : [],
                requireAll: block?.requireAll == null ? true : Boolean(block.requireAll),
              }))
              : [],
          };
          try {
            await saveCheckoutDraftToApi(draftToSave);
          } catch (e) {
            showNewOrderAlert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0447\u0435\u0440\u043d\u043e\u0432\u0438\u043a \u044d\u043a\u0440\u0430\u043d\u0430 \u043e\u0444\u043e\u0440\u043c\u043b\u0435\u043d\u0438\u044f");
            return;
          }
          state.checkoutSavedDraft = draftToSave;
          state.checkoutEditMode = false;
          state.checkoutDraft = null;
          renderMainContentMode();
          return;
        }
        state.activeCategoryId = CHECKOUT_SCREEN_ID;
        state.checkoutEditMode = true;
        state.checkoutDraft = {
          blocks: Array.isArray(state.checkoutSavedDraft?.blocks)
            ? state.checkoutSavedDraft.blocks.map((block) => ({ id: Number(block?.id || 0), title: String(block?.title || ""), categoryIds: Array.isArray(block?.categoryIds) ? [...block.categoryIds] : [], requireAll: block?.requireAll == null ? true : Boolean(block.requireAll) }))
            : [],
        };
        void loadCheckoutProductsForSelectedCategories();
        renderCategories();
        renderMainContentMode();
      });
    }

    if (cancelEditBtnEl) {
      cancelEditBtnEl.addEventListener("click", () => {
        if (!state.checkoutEditMode) return;
        state.checkoutDraft = {
          blocks: Array.isArray(state.checkoutSavedDraft?.blocks)
            ? state.checkoutSavedDraft.blocks.map((block) => ({ id: Number(block?.id || 0), title: String(block?.title || ""), categoryIds: Array.isArray(block?.categoryIds) ? [...block.categoryIds] : [], requireAll: block?.requireAll == null ? true : Boolean(block.requireAll) }))
            : [],
        };
        state.checkoutEditMode = false;
        state.checkoutDraft = null;
        renderMainContentMode();
      });
    }

    if (checkoutAddCategoryBtnEl) {
      checkoutAddCategoryBtnEl.addEventListener("click", () => {
        if (!state.checkoutEditMode || !isCheckoutScreenActive()) return;
        openCheckoutCategoriesOverlay(null);
      });
    }

    if (checkoutContentEl) {
      if (checkoutBlockChipsEl) {
        checkoutBlockChipsEl.addEventListener(
          "wheel",
          (e) => {
            if (checkoutBlockChipsEl.scrollWidth <= checkoutBlockChipsEl.clientWidth) return;
            const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            checkoutBlockChipsEl.scrollLeft += delta;
            e.preventDefault();
            e.stopPropagation();
          },
          { passive: false }
        );

        checkoutBlockChipsEl.addEventListener("click", (e) => {
          const chip = e.target.closest("[data-action='checkout-scroll-to-block'][data-block-id]");
          if (!chip) return;
          const blockId = Number(chip.getAttribute("data-block-id") || 0);
          if (!(blockId > 0)) return;
          const blockEl = checkoutContentEl.querySelector(`.new-order-checkout-constructor-block[data-block-id="${blockId}"]`);
          if (!blockEl) return;
          const scroller = checkoutContentEl.closest(".panel-body");
          if (scroller) {
            const targetTop = blockEl.offsetTop - 160;
            scroller.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
          } else {
            blockEl.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });
      }

      if (rightTabsEl) {
        rightTabsEl.addEventListener("click", (e) => {
          const closeBtn = e.target.closest("[data-action='right-order-tab-close'][data-order-id]");
          if (closeBtn) {
            const orderId = Number(closeBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          const idx = state.rightOrders.findIndex((o) => Number(o?.id || 0) === orderId);
          if (idx < 0) return;
          resetRightCartClearState(orderId, { render: false });
          state.rightDiscountBreakdownOpenByOrder.delete(orderId);
          state.rightCheckoutSubmittingByOrder.delete(orderId);
          clearRightAutoAddDismissed(orderId);
          const wasActive = Number(state.rightActiveOrderId || 0) === orderId;
          state.rightOrders.splice(idx, 1);
          const becameEmpty = state.rightOrders.length === 0;
            if (!state.rightOrders.length) {
              state.rightActiveOrderId = null;
            } else if (wasActive) {
              const next = state.rightOrders[idx] || state.rightOrders[idx - 1] || state.rightOrders[0];
              state.rightActiveOrderId = Number(next?.id || 0) || null;
            }
            state.rightOpenSelect = null;
            closeRightAddressOverlay();
            renderRightOrderTabs();
            if (becameEmpty) {
              document.dispatchEvent(new CustomEvent("neworder:right-tabs-empty"));
            }
            return;
          }

          const tabBtn = e.target.closest("[data-action='right-order-tab-select'][data-order-id]");
          if (!tabBtn) return;
          const orderId = Number(tabBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          state.rightActiveOrderId = orderId;
          state.rightOpenSelect = null;
          closeRightAddressOverlay();
          renderRightOrderTabs();
        });
      }

      checkoutContentEl.addEventListener("dragstart", (e) => {
        const handle = e.target.closest("[data-action='checkout-block-drag-handle'][data-block-id]");
        if (!handle || !state.checkoutEditMode || !state.checkoutDraft) return;
        const blockId = Number(handle.getAttribute("data-block-id") || 0);
        if (!(blockId > 0)) return;
        draggedCheckoutBlockId = blockId;
        const blockEl = handle.closest(".new-order-checkout-constructor-block[data-block-id]");
        if (blockEl) blockEl.classList.add("is-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(blockId));
        }
      });

      checkoutContentEl.addEventListener("dragover", (e) => {
        if (!(draggedCheckoutBlockId > 0) || !state.checkoutEditMode || !state.checkoutDraft) return;
        const targetBlock = e.target.closest(".new-order-checkout-constructor-block[data-block-id]");
        if (!targetBlock) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
      });

      checkoutContentEl.addEventListener("drop", (e) => {
        if (!(draggedCheckoutBlockId > 0) || !state.checkoutEditMode || !state.checkoutDraft) return;
        const targetBlock = e.target.closest(".new-order-checkout-constructor-block[data-block-id]");
        if (!targetBlock) return;
        e.preventDefault();
        const targetBlockId = Number(targetBlock.getAttribute("data-block-id") || 0);
        if (!(targetBlockId > 0) || targetBlockId === draggedCheckoutBlockId) return;
        const blocks = Array.isArray(state.checkoutDraft.blocks) ? [...state.checkoutDraft.blocks] : [];
        const fromIndex = blocks.findIndex((item) => Number(item?.id || 0) === draggedCheckoutBlockId);
        const toIndex = blocks.findIndex((item) => Number(item?.id || 0) === targetBlockId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
        const [moved] = blocks.splice(fromIndex, 1);
        blocks.splice(toIndex, 0, moved);
        state.checkoutDraft.blocks = blocks;
        renderCheckoutEditorContent();
      });

      checkoutContentEl.addEventListener("dragend", () => {
        draggedCheckoutBlockId = 0;
        checkoutContentEl.querySelectorAll(".new-order-checkout-constructor-block.is-dragging").forEach((el) => el.classList.remove("is-dragging"));
      });

      checkoutContentEl.addEventListener("click", (e) => {
        const compositionToggleBtn = e.target.closest("[data-action='checkout-composition-toggle'][data-product-id][data-section-key]");
        if (compositionToggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          const compositionCard = compositionToggleBtn.closest(".new-order-checkout-product-item[data-product-id][data-section-key]");
          if (compositionCard && compositionCard.classList.contains("is-unavailable")) return;
          const productId = Number(compositionToggleBtn.getAttribute("data-product-id") || 0);
          const sectionKey = String(compositionToggleBtn.getAttribute("data-section-key") || "").trim();
          if (!(productId > 0) || !sectionKey) return;
          state.checkoutSelectedProductByCategory.set(sectionKey, productId);
          if (!state.selectedVariants.has(productId)) {
            const variants = state.productVariants.get(productId) || [];
            if (Array.isArray(variants) && variants.length) {
              const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
              const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
              const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
              state.selectedVariants.set(productId, safeDefault);
            }
          }
          const nextKey = getCheckoutIngredientsPopoverKey(sectionKey, productId);
          if (state.checkoutIngredientsPopoverKey === nextKey) {
            state.checkoutIngredientsPopoverKey = null;
            state.checkoutIngredientsPopoverPos = null;
          } else {
            const card = compositionToggleBtn.closest(".new-order-checkout-product-item[data-product-id][data-section-key]");
            const rect = card ? card.getBoundingClientRect() : compositionToggleBtn.getBoundingClientRect();
            const popoverWidth = 200;
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
            const leftBase = Math.round(rect.left);
            const left = Math.max(8, Math.min(leftBase, Math.max(8, viewportWidth - popoverWidth - 8)));
            const top = Math.round(rect.bottom + 8);
            state.checkoutIngredientsPopoverKey = nextKey;
            state.checkoutIngredientsPopoverPos = { left, top };
          }
          saveCheckoutScrollBySection(sectionKey, compositionToggleBtn);
          renderCheckoutEditorContent();
          return;
        }

        const checkoutIngBtn = e.target.closest("[data-action='checkout-ingredient-minus'], [data-action='checkout-ingredient-plus']");
        if (checkoutIngBtn) {
          e.preventDefault();
          e.stopPropagation();
          const action = String(checkoutIngBtn.getAttribute("data-action") || "");
          const productId = Number(checkoutIngBtn.getAttribute("data-product-id") || 0);
          const sectionKey = String(checkoutIngBtn.getAttribute("data-section-key") || "").trim();
          const ingId = Number(checkoutIngBtn.getAttribute("data-ingredient-id") || 0);
          if (!(productId > 0) || !(ingId > 0) || !sectionKey) return;
          const changed = adjustIngredientQty(productId, ingId, action === "checkout-ingredient-plus" ? 1 : -1);
          if (!changed) return;
          saveCheckoutScrollBySection(sectionKey, checkoutIngBtn);
          state.checkoutIngredientsPopoverKey = getCheckoutIngredientsPopoverKey(sectionKey, productId);
          renderCheckoutEditorContent();
          return;
        }

        const productCard = e.target.closest(".new-order-checkout-product-item[data-product-id][data-section-key]");
        if (productCard) {
          if (productCard.classList.contains("is-unavailable")) return;
          const productId = Number(productCard.getAttribute("data-product-id") || 0);
          const sectionKey = String(productCard.getAttribute("data-section-key") || "").trim();
          if (productId > 0 && sectionKey) {
            state.checkoutIngredientsPopoverKey = null;
            state.checkoutIngredientsPopoverPos = null;
            saveCheckoutScrollBySection(sectionKey, productCard);
            const sectionEl = productCard.closest(".new-order-checkout-category-section");
            const requireAll = String(sectionEl?.getAttribute("data-require-all") || "1") === "1";
            const currentSelectedProductId = Number(state.checkoutSelectedProductByCategory.get(sectionKey) || 0);
            if (!requireAll && currentSelectedProductId === productId) {
              state.checkoutSelectedProductByCategory.delete(sectionKey);
            } else {
              state.checkoutSelectedProductByCategory.set(sectionKey, productId);
            }
            renderCheckoutEditorContent();
            return;
          }
        }

        const variantBtn = e.target.closest("[data-action='checkout-variant-select']");
        if (variantBtn) {
          const productId = Number(variantBtn.getAttribute("data-product-id") || 0);
          const sectionKey = String(variantBtn.getAttribute("data-section-key") || "").trim();
          const variantIndex = Number(variantBtn.getAttribute("data-variant-index") || -1);
          if (productId > 0 && sectionKey && Number.isFinite(variantIndex) && variantIndex >= 0) {
            const currentVariantIndex = Number(state.selectedVariants.get(productId));
            if (!state.checkoutEditMode && Number.isFinite(currentVariantIndex) && currentVariantIndex === variantIndex) {
              const blockId = Number(String(sectionKey).split(":")[0] || 0);
              if (blockId > 0) {
                addCheckoutBlockToRightCartById(blockId);
                return;
              }
            }
            saveCheckoutScrollBySection(sectionKey, variantBtn);
            state.selectedVariants.set(productId, variantIndex);
            renderCheckoutEditorContent();
          }
          return;
        }

        const editBlockBtn = e.target.closest("[data-action='checkout-block-edit']");
        if (editBlockBtn) {
          const blockId = Number(editBlockBtn.getAttribute("data-block-id") || 0);
          if (blockId > 0) openCheckoutCategoriesOverlay(blockId);
          return;
        }

        const moveUpBtn = e.target.closest("[data-action='checkout-block-move-up']");
        if (moveUpBtn) {
          const blockId = Number(moveUpBtn.getAttribute("data-block-id") || 0);
          if (!(blockId > 0) || !state.checkoutEditMode || !state.checkoutDraft) return;
          const blocks = Array.isArray(state.checkoutDraft.blocks) ? [...state.checkoutDraft.blocks] : [];
          const index = blocks.findIndex((item) => Number(item?.id || 0) === blockId);
          if (index <= 0) return;
          const [moved] = blocks.splice(index, 1);
          blocks.splice(index - 1, 0, moved);
          state.checkoutDraft.blocks = blocks;
          renderCheckoutEditorContent();
          return;
        }

        const moveDownBtn = e.target.closest("[data-action='checkout-block-move-down']");
        if (moveDownBtn) {
          const blockId = Number(moveDownBtn.getAttribute("data-block-id") || 0);
          if (!(blockId > 0) || !state.checkoutEditMode || !state.checkoutDraft) return;
          const blocks = Array.isArray(state.checkoutDraft.blocks) ? [...state.checkoutDraft.blocks] : [];
          const index = blocks.findIndex((item) => Number(item?.id || 0) === blockId);
          if (index < 0 || index >= blocks.length - 1) return;
          const [moved] = blocks.splice(index, 1);
          blocks.splice(index + 1, 0, moved);
          state.checkoutDraft.blocks = blocks;
          renderCheckoutEditorContent();
          return;
        }

        const deleteBlockBtn = e.target.closest("[data-action='checkout-block-delete']");
        if (deleteBlockBtn) {
          const blockId = Number(deleteBlockBtn.getAttribute("data-block-id") || 0);
          if (!(blockId > 0) || !state.checkoutEditMode || !state.checkoutDraft) return;
          const block = getCheckoutBlockById(blockId);
          const sectionKeys = (Array.isArray(block?.categoryIds) ? block.categoryIds : []).map((cid) => getCheckoutSectionKey(blockId, cid));
          state.checkoutDraft.blocks = (Array.isArray(state.checkoutDraft.blocks) ? state.checkoutDraft.blocks : [])
            .filter((item) => Number(item?.id || 0) !== blockId);
          state.checkoutMergedPreviewByBlock.delete(blockId);
          sectionKeys.forEach((key) => {
            state.checkoutSelectedProductByCategory.delete(key);
            state.checkoutProductsScrollByCategory.delete(key);
            state.checkoutVariantsScrollByCategory.delete(key);
          });
          void loadCheckoutProductsForSelectedCategories();
          return;
        }

        const addBlockBtn = e.target.closest("[data-action='checkout-block-add']");
        if (addBlockBtn) {
          const blockId = Number(addBlockBtn.getAttribute("data-block-id") || 0);
          addCheckoutBlockToRightCartById(blockId);
        }
      });
    }

    const addBtnEl = document.getElementById("newOrderAddBtn");
    if (addBtnEl) {
      addBtnEl.addEventListener("click", () => {
        if (document.body.classList.contains("page-orders")) {
          document.dispatchEvent(new CustomEvent("orders:new-draft-tab-request"));
          return;
        }
        openRightNewOrderTab();
      });
    }

    productsGridEl.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (!actionBtn) return;
      const action = String(actionBtn.getAttribute("data-action") || "");
      if (action === "combo-open") {
        const comboCard = actionBtn.closest(".new-order-product-card[data-combo-id]");
        if (comboCard && comboCard.classList.contains("is-unavailable")) return;
        const comboId = Number(actionBtn.getAttribute("data-combo-id") || comboCard?.getAttribute("data-combo-id") || 0);
        if (comboId > 0) void openComboOverlay(comboId);
        return;
      }
      const card = e.target.closest("[data-product-id]");
      if (!card) return;
      if (card.classList.contains("is-unavailable")) return;
      const pid = Number(card.getAttribute("data-product-id") || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      if (action === "variant-select") {
        const variantIndex = Number(actionBtn.getAttribute("data-variant-index"));
        if (!Number.isFinite(variantIndex) || variantIndex < 0) return;
        const currentIndex = Number(state.selectedVariants.get(pid));
        if (Number.isFinite(currentIndex) && currentIndex === variantIndex) {
          quickAddProductToCart(pid);
          return;
        }
        state.selectedVariants.set(pid, variantIndex);
        renderProducts(state.currentProducts);
        return;
      }
      if (action === "product-add-quick") {
        quickAddProductToCart(pid);
        return;
      }
      if (action === "product-open") {
        void openProductOverlay(pid);
        return;
      }
      if (action === "option-open") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const block = actionBtn.closest(".new-order-option-block");
        const titleEl = block ? block.querySelector(".new-order-option-title") : null;
        const title = titleEl ? titleEl.textContent : "РћРїС†РёСЏ";
        void openOptionOverlay(pid, groupId, title);
        return;
      }
      if (action === "product-options-open") {
        void openProductOverlay(pid);
        return;
      }
      if (action === "option-quick-toggle") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const applied = applyQuickMultiOptionToggle(pid, groupId, itemId);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "РћРїС†РёСЏ";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "option-quick-qty-minus" || action === "option-quick-qty-plus") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const delta = action === "option-quick-qty-plus" ? 1 : -1;
        const applied = applyQuickMultiOptionQtyAdjust(pid, groupId, itemId, delta);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "РћРїС†РёСЏ";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "option-quick-variant") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const variantIndex = Number(actionBtn.getAttribute("data-variant-index") || 0);
        const applied = applyQuickOptionVariantSelection(pid, groupId, itemId, variantIndex);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "РћРїС†РёСЏ";
          void openOptionOverlay(pid, groupId, title);
        }
        return;
      }
      if (action === "ingredient-minus" || action === "ingredient-plus") {
        const ingId = Number(actionBtn.getAttribute("data-ingredient-id") || 0);
        if (!Number.isFinite(ingId) || ingId <= 0) return;
        const changed = adjustIngredientQty(pid, ingId, action === "ingredient-plus" ? 1 : -1);
        if (!changed) return;
        renderProducts(state.currentProducts);
        return;
      }
      if (action === "qty-minus" || action === "qty-plus") {
        const currentQty = getProductCardQty(pid);
        const delta = action === "qty-plus" ? 1 : -1;
        const nextQty = Math.max(1, currentQty + delta);
        if (nextQty === currentQty) return;
        setProductCardQty(pid, nextQty);
        renderProducts(state.currentProducts);
        return;
      }
    });

    productsGridEl.addEventListener("click", (e) => {
      const card = e.target.closest(".new-order-product-card[data-product-id]");
      const interactive = e.target.closest("[data-action], button, input, textarea, select, a");
      if (interactive) return;
      if (card) {
        const pid = Number(card.getAttribute("data-product-id") || 0);
        if (card.classList.contains("is-unavailable")) return;
        if (!(pid > 0)) return;
        void openProductOverlay(pid);
        return;
      }
      const comboCard = e.target.closest(".new-order-product-card[data-combo-id]");
      if (!comboCard) return;
      if (comboCard.classList.contains("is-unavailable")) return;
      const comboId = Number(comboCard.getAttribute("data-combo-id") || 0);
      if (!(comboId > 0)) return;
      void openComboOverlay(comboId);
    });

    productsGridEl.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const comboCard = e.target.closest(".new-order-product-card[data-combo-id]");
      if (!comboCard) return;
      if (comboCard.classList.contains("is-unavailable")) return;
      const interactive = e.target.closest("[data-action], button, input, textarea, select, a");
      if (interactive) return;
      const comboId = Number(comboCard.getAttribute("data-combo-id") || 0);
      if (!(comboId > 0)) return;
      e.preventDefault();
      void openComboOverlay(comboId);
    });

    document.addEventListener("click", (e) => {
      const overlay = document.getElementById("newOrderComboOverlay");
      if (!overlay || overlay.classList.contains("hidden")) return;
      const actionNode = e.target.closest("[data-action]");
      if (!actionNode) return;
      const action = String(actionNode.getAttribute("data-action") || "");
      if (!action.startsWith("combo-overlay-")) return;
      const closePickerToMain = () => {
        state.comboModal.view = "main";
        state.comboModal.pickerBlockIndex = -1;
        state.comboModal.expandedPickerProductIndex = null;
        renderComboOverlay();
        const { list } = getComboOverlayElements();
        if (list) list.scrollTop = 0;
      };

      if (action === "combo-overlay-back") {
        if (String(state.comboModal.view || "main") === "picker") {
          state.comboModal.view = "main";
          state.comboModal.pickerBlockIndex = -1;
          state.comboModal.expandedPickerProductIndex = null;
          renderComboOverlay();
          return;
        }
        closeComboOverlay();
        return;
      }

      if (action === "combo-overlay-open-picker") {
        const blockIndex = Number(actionNode.getAttribute("data-block-index") || 0);
        void (async () => {
          const safeBlockIndex = Number.isFinite(blockIndex) ? blockIndex : 0;
          state.comboModal.view = "picker";
          state.comboModal.pickerBlockIndex = safeBlockIndex;
          state.comboModal.expandedPickerProductIndex = null;
          await hydrateComboBlockSelection(safeBlockIndex, { preferSavedState: true });
          renderComboOverlay();
          const { list } = getComboOverlayElements();
          if (list) list.scrollTop = 0;
        })();
        return;
      }

      if (action === "combo-overlay-picker-expand-noop") {
        return;
      }

      if (action === "combo-overlay-picker-gear") {
        const blockIndex = Number(actionNode.getAttribute("data-block-index") || 0);
        const productIndex = Number(actionNode.getAttribute("data-product-index") || 0);
        void (async () => {
          const selected = await selectComboPickerProduct(blockIndex, productIndex, {
            hydrate: true,
            preferSavedState: true,
          });
          if (!selected) return;
          const currentExpanded = Number(state.comboModal.expandedPickerProductIndex);
          state.comboModal.expandedPickerProductIndex = Number.isFinite(currentExpanded) && currentExpanded === productIndex
            ? null
            : productIndex;
          renderComboOverlay();
        })();
        return;
      }

      if (action === "combo-overlay-picker-radio" || action === "combo-overlay-picker-select") {
        const blockIndex = Number(actionNode.getAttribute("data-block-index") || 0);
        const productIndex = Number(actionNode.getAttribute("data-product-index") || 0);
        void (async () => {
          const selected = await selectComboPickerProduct(blockIndex, productIndex, {
            hydrate: true,
            preferSavedState: true,
          });
          if (!selected) return;
          closePickerToMain();
        })();
        return;
      }

      if (action === "combo-overlay-picker-variant") {
        const blockIndex = Number(actionNode.getAttribute("data-block-index") || 0);
        const productIndex = Number(actionNode.getAttribute("data-product-index") || 0);
        const variantIndex = Number(actionNode.getAttribute("data-variant-index") || 0);
        void (async () => {
          const selected = await selectComboPickerProduct(blockIndex, productIndex, {
            hydrate: true,
            preferSavedState: true,
          });
          if (!selected) return;
          const selectedProduct = getComboSelectedProduct(blockIndex);
          const productId = Number(selectedProduct?.product_id || 0);
          if (!(productId > 0)) return;
          const variants = state.productVariants.get(productId) || [];
          const group = Array.isArray(variants) && variants.length ? variants[0] : null;
          const values = Array.isArray(group?.values) ? group.values : [];
          if (!values.length) return;
          if (!Number.isFinite(variantIndex) || variantIndex < 0 || variantIndex >= values.length) return;
          const rowState = state.comboModal.selectionStateByBlock[blockIndex] || makeEmptyComboBlockState();
          rowState.product_id = productId;
          rowState.variant_value_index = variantIndex;
          rowState.variant_label = String(values[variantIndex] || "");
          state.comboModal.selectionStateByBlock[blockIndex] = rowState;
          await hydrateComboBlockSelection(blockIndex, { preferSavedState: true });
          state.comboModal.view = "picker";
          state.comboModal.pickerBlockIndex = blockIndex;
          state.comboModal.expandedPickerProductIndex = productIndex;
          renderComboOverlay();
        })();
        return;
      }

      if (action === "combo-overlay-picker-ing-minus" || action === "combo-overlay-picker-ing-plus") {
        const blockIndex = Number(actionNode.getAttribute("data-block-index") || 0);
        const productIndex = Number(actionNode.getAttribute("data-product-index") || 0);
        const ingredientId = Number(actionNode.getAttribute("data-ingredient-id") || 0);
        const deltaRaw = Number(actionNode.getAttribute("data-step") || 1);
        const delta = action === "combo-overlay-picker-ing-plus" ? Math.abs(deltaRaw || 1) : -Math.abs(deltaRaw || 1);
        void (async () => {
          if (!(ingredientId > 0) || !Number.isFinite(delta) || delta === 0) return;
          const selected = await selectComboPickerProduct(blockIndex, productIndex, {
            hydrate: true,
            preferSavedState: true,
          });
          if (!selected) return;
          const selectedProduct = getComboSelectedProduct(blockIndex);
          const productId = Number(selectedProduct?.product_id || 0);
          if (!(productId > 0)) return;
          const ingredients = state.productIngredients.get(productId) || [];
          const ingredient = ingredients.find((row) => Number(row?.ingredient_id || 0) === ingredientId);
          if (!ingredient) return;
          const step = Math.max(0.0001, Number(ingredient?.quantity_step ?? Math.abs(delta)) || 1);
          const minRaw = Number(ingredient?.quantity_min);
          const minQty = Number.isFinite(minRaw) ? Math.max(0, minRaw) : 0;
          const maxRaw = Number(ingredient?.quantity_max);
          const hasMax = Number.isFinite(maxRaw) && maxRaw > 0;
          const maxQty = hasMax ? maxRaw : Infinity;

          const rowState = state.comboModal.selectionStateByBlock[blockIndex] || makeEmptyComboBlockState();
          const nextIngredients = Array.isArray(rowState.ingredients_display)
            ? rowState.ingredients_display.map((row) => ({ ...row }))
            : [];
          let idx = nextIngredients.findIndex((row) => Number(row?.ingredient_id || 0) === ingredientId);
          if (idx < 0) {
            const baseQty = Number(ingredient?.quantity ?? 0);
            nextIngredients.push({
              ingredient_id: ingredientId,
              name: String(ingredient?.ingredient_name || ingredient?.name || ""),
              qty: baseQty,
              quantity: baseQty,
              unit: String(ingredient?.unit_short_title || ingredient?.unit_title || ingredient?.unit_code || ""),
              unit_id: ingredient?.unit_id != null ? Number(ingredient.unit_id) : null,
            });
            idx = nextIngredients.length - 1;
          }
          const currentQtyRaw = Number(nextIngredients[idx]?.qty ?? nextIngredients[idx]?.quantity ?? 0);
          const currentQty = Number.isFinite(currentQtyRaw) ? currentQtyRaw : Number(ingredient?.quantity ?? 0);
          let nextQty = currentQty + (delta > 0 ? step : -step);
          nextQty = Math.max(minQty, Math.min(maxQty, nextQty));
          if (!Number.isFinite(nextQty) || nextQty === currentQty) return;

          rowState.product_id = productId;
          rowState.ingredients_display = nextIngredients;
          rowState.ingredients_display[idx].qty = nextQty;
          rowState.ingredients_display[idx].quantity = nextQty;
          state.comboModal.selectionStateByBlock[blockIndex] = rowState;
          await hydrateComboBlockSelection(blockIndex, { preferSavedState: true });
          state.comboModal.view = "picker";
          state.comboModal.pickerBlockIndex = blockIndex;
          state.comboModal.expandedPickerProductIndex = productIndex;
          renderComboOverlay();
        })();
        return;
      }

      if (action === "combo-overlay-qty-minus" || action === "combo-overlay-qty-plus") {
        const delta = action === "combo-overlay-qty-plus" ? 1 : -1;
        state.comboModal.qty = Math.max(1, Number(state.comboModal.qty || 1) + delta);
        renderComboOverlay();
        return;
      }

      if (action === "combo-overlay-add") {
        const mode = String(state.comboModal.mode || "add");
        const orderId = Number(state.comboModal.editOrderId || state.rightActiveOrderId || 0);
        const cartItemId = Number(state.comboModal.editCartItemId || 0);
        void (async () => {
          const cartItem = await buildCartItemFromComboOverlay();
          if (!cartItem) return;
          if (mode === "edit" && orderId > 0 && cartItemId > 0) {
            const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
            if (orderIndex >= 0) {
              const order = state.rightOrders[orderIndex] || {};
              const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
              const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((x) => ({ ...x })) : [];
              const idx = cartItems.findIndex((x) => Number(x?.id || 0) === cartItemId);
              if (idx >= 0) {
                cartItem.id = cartItemId;
                cartItems[idx] = cartItem;
                updateRightOrderCartItems(orderId, cartItems, { render: true });
                closeComboOverlay();
                return;
              }
            }
          }
          if (!state.rightActiveOrderId) openRightNewOrderTab();
          const activeOrderId = Number(state.rightActiveOrderId || 0);
          if (!(activeOrderId > 0)) return;
          addCartItemToRightOrder(activeOrderId, cartItem);
          renderRightOrderTabs();
          closeComboOverlay();
        })();
        return;
      }
    });

    document.addEventListener("keydown", (e) => {
      const overlay = document.getElementById("newOrderComboOverlay");
      if (!overlay || overlay.classList.contains("hidden")) return;
      if (e.key !== "Escape") return;
      if (String(state.comboModal.view || "main") === "picker") {
        state.comboModal.view = "main";
        state.comboModal.pickerBlockIndex = -1;
        state.comboModal.expandedPickerProductIndex = null;
        renderComboOverlay();
        return;
      }
      closeComboOverlay();
    });

    document.addEventListener("click", (e) => {
      const overlay = document.getElementById("newOrderProductOverlay");
      if (!overlay || overlay.classList.contains("hidden")) return;
      const actionNode = e.target.closest("[data-action]");
      if (!actionNode) return;
      const action = String(actionNode.getAttribute("data-action") || "");
      const pid = Number(state.productModal.productId || 0);
      if (!(pid > 0)) return;

      if (action === "product-overlay-close") {
        closeProductOverlay();
        return;
      }
      if (action === "product-overlay-photo-prev" || action === "product-overlay-photo-next") {
        const product = getProductById(pid);
        const photos = getProductPhotos(product);
        if (photos.length > 1) {
          const delta = action === "product-overlay-photo-next" ? 1 : -1;
          const next = (Number(state.productModal.photoIndex || 0) + delta + photos.length) % photos.length;
          state.productModal.photoIndex = next;
          renderProductOverlay();
        }
        return;
      }
      if (action === "product-overlay-photo-dot") {
        const product = getProductById(pid);
        const photos = getProductPhotos(product);
        if (photos.length > 1) {
          const idx = Number(actionNode.getAttribute("data-photo-index") || -1);
          if (Number.isFinite(idx) && idx >= 0 && idx < photos.length) {
            state.productModal.photoIndex = idx;
            renderProductOverlay();
          }
        }
        return;
      }
      if (action === "product-overlay-qty-minus" || action === "product-overlay-qty-plus") {
        const delta = action === "product-overlay-qty-plus" ? 1 : -1;
        state.productModal.qty = Math.max(1, Number(state.productModal.qty || 1) + delta);
        renderProductOverlay();
        return;
      }
      if (action === "product-overlay-variant-select") {
        const variantIndex = Number(actionNode.getAttribute("data-variant-index") || -1);
        if (Number.isFinite(variantIndex) && variantIndex >= 0) {
          state.selectedVariants.set(pid, variantIndex);
          renderProductOverlay();
        }
        return;
      }
      if (action === "product-overlay-options-open") {
        const groupId = Number(actionNode.getAttribute("data-group-id") || 0);
        const title = String(actionNode.getAttribute("data-group-title") || "РћРїС†РёРё");
        if (groupId > 0) {
          void openOptionOverlay(pid, groupId, title);
          window.setTimeout(() => {
            if (!document.getElementById("newOrderProductOverlay")?.classList.contains("hidden")) {
              renderProductOverlay();
            }
          }, 0);
        }
        return;
      }
      if (
        action === "product-overlay-opt-open-group" ||
        action === "product-overlay-opt-select-none" ||
        action === "product-overlay-opt-select-single" ||
        action === "product-overlay-opt-variants-toggle" ||
        action === "product-overlay-opt-variant-select" ||
        action === "product-overlay-opt-toggle-item" ||
        action === "product-overlay-opt-qty-minus" ||
        action === "product-overlay-opt-qty-plus"
      ) {
        const groupId = Number(actionNode.getAttribute("data-group-id") || 0);
        const itemId = Number(actionNode.getAttribute("data-item-id") || 0);
        const variantIndex = Number(actionNode.getAttribute("data-variant-index") || 0);
        if (action === "product-overlay-opt-open-group") {
          if (groupId > 0) {
            state.productModal.expandedOptionGroups.add(groupId);
            renderProductOverlay();
          }
          return;
        }
        if (action === "product-overlay-opt-select-none") {
          if (groupId > 0) {
            const byGroup = state.optionSelections.get(pid) || new Map();
            const details = state.optionGroupDetails.get(groupId);
            const items = Array.isArray(details?.items) ? details.items : [];
            const groupType = getOptionGroupUiType({ ...(details?.group || {}), items });
            byGroup.set(groupId, { type: groupType, items: [] });
            state.optionSelections.set(pid, byGroup);
            state.productModal.expandedOptionGroups.delete(groupId);
            renderProductOverlay();
            renderProducts(state.currentProducts);
          }
          return;
        }
        if (action === "product-overlay-opt-select-single") {
          if (groupId > 0 && itemId > 0) {
            const details = state.optionGroupDetails.get(groupId);
            const items = Array.isArray(details?.items) ? details.items : [];
            const found = items.find((x) => Number(x?.id || 0) === itemId);
            if (found) {
              const defaultVariantIndex = getOptionItemDefaultVariantIndex(found);
              const hasVariantDefault = Number.isFinite(Number(defaultVariantIndex));
              const byGroup = state.optionSelections.get(pid) || new Map();
              byGroup.set(groupId, {
                type: "single",
                items: [{
                  id: itemId,
                  label: String(found?.name || found?.product_name || "РџРѕР·РёС†РёСЏ"),
                  qty: 1,
                  basePrice: getOptionItemBasePrice(found),
                  variantDiff: hasVariantDefault ? getOptionItemVariantDiff(found, Number(defaultVariantIndex)) : 0,
                  ...(hasVariantDefault ? { variantIndex: Number(defaultVariantIndex) } : {}),
                }],
              });
              state.optionSelections.set(pid, byGroup);
              state.productModal.expandedOptionGroups.delete(groupId);
              state.productModal.expandedOptionItems.delete(`${groupId}:${itemId}`);
              renderProductOverlay();
              renderProducts(state.currentProducts);
            }
          }
          return;
        }
        const changed = applyProductOverlayOptionAction(pid, action, groupId, itemId, variantIndex);
        if (!changed) return;
        renderProductOverlay();
        renderProducts(state.currentProducts);
        return;
      }
      if (action === "product-overlay-add") {
        const qty = Math.max(1, Number(state.productModal.qty || 1));
        const mode = String(state.productModal.mode || "add");
        const cartItem = buildCartItemFromProduct(pid, qty);
        if (!cartItem) return;
        if (mode === "edit") {
          const orderId = Number(state.productModal.editOrderId || 0);
          const cartItemId = Number(state.productModal.editCartItemId || 0);
          if (orderId > 0 && cartItemId > 0) {
            const orderIndex = state.rightOrders.findIndex((order) => Number(order?.id || 0) === orderId);
            if (orderIndex >= 0) {
              const order = state.rightOrders[orderIndex] || {};
              const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
              const cartItems = Array.isArray(form.cartItems) ? form.cartItems.map((x) => ({ ...x })) : [];
              const idx = cartItems.findIndex((x) => Number(x?.id || 0) === cartItemId);
              if (idx >= 0) {
                cartItem.id = cartItemId;
                cartItems[idx] = cartItem;
                updateRightOrderCartItems(orderId, cartItems, { render: true });
                closeProductOverlay();
                return;
              }
            }
          }
        }
        if (!state.rightActiveOrderId) openRightNewOrderTab();
        if (!state.rightActiveOrderId) return;
        addCartItemToRightOrder(state.rightActiveOrderId, cartItem);
        renderRightOrderTabs();
        closeProductOverlay();
        return;
      }
      if (action === "ingredient-minus" || action === "ingredient-plus") {
        const ingId = Number(actionNode.getAttribute("data-ingredient-id") || 0);
        if (!(ingId > 0)) return;
        const changed = adjustIngredientQty(pid, ingId, action === "ingredient-plus" ? 1 : -1);
        if (!changed) return;
        renderProductOverlay();
        renderProducts(state.currentProducts);
        return;
      }
    });

    productsGridEl.addEventListener(
      "wheel",
      (e) => {
        const row = findHorizontalScrollTarget(e.target);
        if (!row || row.scrollWidth <= row.clientWidth) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        row.scrollLeft += delta * 0.45;
        e.preventDefault();
      },
      { passive: false }
    );

    document.addEventListener(
      "wheel",
      (e) => {
        const target = e.target instanceof Element
          ? e.target
          : (e.target && e.target.parentElement ? e.target.parentElement : null);
        if (!target) return;
        const row = target.closest(".new-order-checkout-products-scroll, .new-order-checkout-products-row");
        const variantRow = target.closest(".new-order-checkout-variants-scroll, .new-order-checkout-variants-row");
        const targetRow = row || variantRow;
        if (!targetRow) return;
        const scrollEl = targetRow.classList.contains("new-order-checkout-products-scroll") || targetRow.classList.contains("new-order-checkout-variants-scroll")
          ? targetRow
          : (targetRow.closest(".new-order-checkout-products-scroll") || targetRow.closest(".new-order-checkout-variants-scroll"));
        if (!scrollEl) return;

        e.preventDefault();
        e.stopPropagation();
        if (scrollEl.scrollWidth <= scrollEl.clientWidth) return;
        const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        scrollEl.scrollLeft += delta * 1.0;
      },
      { passive: false, capture: true }
    );
  }

  async function fetchNewOrderManifest() {
    try {
      const json = await apiJson("/api/new-order/manifest");
      return json && typeof json.data === "object" && json.data ? json.data : null;
    } catch {
      return null;
    }
  }

  async function loadCategoriesFromApi() {
    const json = await apiJson("/api/prod_categories");
    const source = Array.isArray(json?.data) ? json.data : [];
    state.productCategories = source
      .filter((c) => Number(c?.is_active || 0) === 1)
      .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));
    state.categories = source
      .filter((c) => Number(c?.is_active || 0) === 1 && isCheckoutVisible(c))
      .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));
    schedulePersistBootstrapSnapshot(0);
  }

  async function loadRefsFromApi() {
    await loadUnitConversions();
    await loadRightDeliveryTypes();
    await loadRightPaymentTypes();
    await loadRightTimeOptions();
    await loadRightOrderStatuses();
    await loadRightPickupStores();
    await loadRightAutoAdd({ force: true });
    schedulePersistBootstrapSnapshot(0);
  }

  function ensureValidActiveCategory() {
    if (String(state.activeCategoryId) === CHECKOUT_SCREEN_ID) return;
    const activeId = Number(state.activeCategoryId || 0);
    const hasActive = Array.isArray(state.categories)
      && state.categories.some((c) => Number(c?.id || 0) === activeId);
    if (!hasActive) state.activeCategoryId = CHECKOUT_SCREEN_ID;
  }

  function getPreloadCategoryIds() {
    return [...new Set((Array.isArray(state.categories) ? state.categories : [])
      .map((c) => Number(c?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0))];
  }

  async function renderActiveCategoryContent() {
    ensureValidActiveCategory();
    if (String(state.activeCategoryId) === CHECKOUT_SCREEN_ID) {
      await loadCheckoutProductsForSelectedCategories();
    } else if (state.activeCategoryId) {
      await loadProductsForCategory(state.activeCategoryId, { preferCache: true });
    } else if (productsEmptyEl) {
      productsEmptyEl.textContent = "РќРµС‚ РґРѕСЃС‚СѓРїРЅС‹С… РєР°С‚РµРіРѕСЂРёР№";
      productsEmptyEl.classList.remove("hidden");
    }
    renderMainContentMode();
    if (!state.rightActiveOrderId) openRightNewOrderTab();
    renderRightOrderTabs();
  }

  async function syncDataByManifest(nextManifest, prevManifest, forceFull = false) {
    const categoriesChanged = forceFull || isManifestDomainChanged(prevManifest, nextManifest, "categories");
    const productsChanged = forceFull || isManifestDomainChanged(prevManifest, nextManifest, "products");
    const checkoutChanged = forceFull || isManifestDomainChanged(prevManifest, nextManifest, "checkout");
    const refsChanged = forceFull || isManifestDomainChanged(prevManifest, nextManifest, "refs");

    if (categoriesChanged || !state.categories.length || !state.productCategories.length) {
      await loadCategoriesFromApi();
    }
    ensureValidActiveCategory();

    if (
      refsChanged
      || !state.unitConversions.length
      || !state.rightDeliveryTypes.length
      || !state.rightPaymentTypes.length
      || !state.rightTimeOptions.length
      || !state.rightOrderStatuses.length
      || !state.rightPickupStores.length
      || !state.autoAddLoaded
    ) {
      await loadRefsFromApi();
    }

    if (checkoutChanged || !Array.isArray(state.checkoutSavedDraft?.blocks)) {
      try {
        await loadCheckoutDraftFromApi(checkoutChanged || forceFull);
      } catch {
        state.checkoutSavedDraft = { blocks: [] };
      }
    }

    if (productsChanged || !state.categoryProductsCache.size) {
      state.categoryProductsCache.clear();
      state.checkoutCategoryProducts.clear();
      await preloadAllCategoryProducts(getPreloadCategoryIds());
    }

    schedulePersistBootstrapSnapshot(0);
  }

  function deepCloneJson(value, fallback = null) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function mapOfMapsToObject(source) {
    const out = {};
    if (!(source instanceof Map)) return out;
    source.forEach((inner, key) => {
      const topKey = String(key);
      if (inner instanceof Map) {
        out[topKey] = mapToObject(inner);
      } else if (inner && typeof inner === "object") {
        out[topKey] = deepCloneJson(inner, {});
      }
    });
    return out;
  }

  function objectToMapOfMaps(source) {
    const out = new Map();
    if (!source || typeof source !== "object") return out;
    Object.keys(source).forEach((key) => {
      const topNum = Number(key);
      const topKey = Number.isFinite(topNum) ? topNum : key;
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        out.set(topKey, objectToMap(value));
      }
    });
    return out;
  }

  function serializeOptionSelectionsMap(source) {
    const out = {};
    if (!(source instanceof Map)) return out;
    source.forEach((groupMap, productId) => {
      if (!(groupMap instanceof Map)) return;
      const groupOut = {};
      groupMap.forEach((entry, groupId) => {
        groupOut[String(groupId)] = deepCloneJson(entry, null);
      });
      out[String(productId)] = groupOut;
    });
    return out;
  }

  function deserializeOptionSelectionsMap(source) {
    const out = new Map();
    if (!source || typeof source !== "object") return out;
    Object.keys(source).forEach((productKey) => {
      const groupRaw = source[productKey];
      if (!groupRaw || typeof groupRaw !== "object") return;
      const groupMap = new Map();
      Object.keys(groupRaw).forEach((groupKey) => {
        const gidNum = Number(groupKey);
        const gid = Number.isFinite(gidNum) ? gidNum : groupKey;
        const value = deepCloneJson(groupRaw[groupKey], null);
        if (value && typeof value === "object") groupMap.set(gid, value);
      });
      const pidNum = Number(productKey);
      const pid = Number.isFinite(pidNum) ? pidNum : productKey;
      out.set(pid, groupMap);
    });
    return out;
  }

  function normalizeCompareToken(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function firstOrderVariant(item) {
    const list = Array.isArray(item?.variants) ? item.variants : [];
    return list[0] || null;
  }

  function resolveOrderVariantIndex(productId, orderItem) {
    const pid = Number(productId || 0);
    if (!(pid > 0)) return 0;
    const groups = state.productVariants.get(pid) || [];
    const chips = getVariantChipsForProduct(pid);
    if (!chips.length) return 0;

    const firstVariant = firstOrderVariant(orderItem);
    const explicitIndex = Number(
      firstVariant?.variant_value_index ??
      firstVariant?.selected_index ??
      orderItem?.variant_value_index ??
      orderItem?.variant_index
    );
    if (Number.isFinite(explicitIndex) && explicitIndex >= 0 && explicitIndex < chips.length) {
      return explicitIndex;
    }

    const orderVariantLabel = String(
      firstVariant?.label ||
      firstVariant?.value ||
      orderItem?.variant_label ||
      ""
    ).trim();
    const orderVariantUnit = String(
      firstVariant?.unit ||
      firstVariant?.unit_short_title ||
      firstVariant?.unitLabel ||
      orderItem?.variant_unit ||
      ""
    ).trim();
    const orderVariantGroup = String(firstVariant?.group_title || "").trim();
    const orderToken = normalizeCompareToken([orderVariantLabel, orderVariantUnit, orderVariantGroup].filter(Boolean).join(" "));
    if (orderToken) {
      const matched = chips.find((chip) => {
        const labelToken = normalizeCompareToken(chip?.label || "");
        return labelToken === orderToken || labelToken.startsWith(orderToken) || orderToken.startsWith(labelToken);
      });
      if (matched && Number.isFinite(Number(matched.index))) {
        return Number(matched.index);
      }
    }

    const rawDefault = groups[0]?.default_value_index != null ? Number(groups[0].default_value_index) : 0;
    return Number.isFinite(rawDefault) && rawDefault >= 0 ? rawDefault : 0;
  }

  function buildIngredientQtyMapFromOrder(productId, orderItem) {
    const pid = Number(productId || 0);
    const catalogIngredients = state.productIngredients.get(pid) || [];
    const defaultQtyMap = createIngredientQtyMap(catalogIngredients);
    const fromOrder = Array.isArray(orderItem?.ingredients) ? orderItem.ingredients : [];
    if (!fromOrder.length) return defaultQtyMap;

    const orderById = new Map();
    const orderByName = new Map();
    fromOrder.forEach((row) => {
      const ingId = Number(row?.ingredient_id || 0);
      const qty = Number(row?.quantity ?? row?.qty ?? 0);
      const nameKey = normalizeCompareToken(row?.name || row?.ingredient_name || "");
      if (ingId > 0 && Number.isFinite(qty)) orderById.set(ingId, qty);
      if (nameKey && Number.isFinite(qty)) orderByName.set(nameKey, qty);
    });

    catalogIngredients.forEach((row) => {
      const ingId = Number(row?.ingredient_id || 0);
      if (!(ingId > 0)) return;
      if (orderById.has(ingId)) {
        defaultQtyMap.set(ingId, Number(orderById.get(ingId)));
        return;
      }
      const nameKey = normalizeCompareToken(row?.ingredient_name || row?.name || "");
      if (nameKey && orderByName.has(nameKey)) {
        defaultQtyMap.set(ingId, Number(orderByName.get(nameKey)));
      }
    });
    return defaultQtyMap;
  }

  function resolveOptionVariantIndex(detailItem, optionRow) {
    const variants = Array.isArray(detailItem?.variants) ? detailItem.variants : [];
    const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
    if (!values.length) return null;

    const explicit = Number(
      optionRow?.variant_index ??
      optionRow?.variantIndex ??
      optionRow?.variant_value_index
    );
    if (Number.isFinite(explicit) && explicit >= 0 && explicit < values.length) return explicit;

    const rawLabel = String(optionRow?.variant_label || optionRow?.variantLabel || "").trim();
    const rawUnit = String(optionRow?.variant_unit || optionRow?.variantUnit || "").trim();
    const rawToken = normalizeCompareToken([rawLabel, rawUnit].filter(Boolean).join(" "));
    if (rawToken) {
      for (let idx = 0; idx < values.length; idx += 1) {
        const label = String(formatOptionVariantLabel(detailItem, idx) || toVariantLabel(values[idx]) || "").trim();
        const labelToken = normalizeCompareToken(label);
        if (labelToken === rawToken || labelToken.startsWith(rawToken) || rawToken.startsWith(labelToken)) {
          return idx;
        }
      }
    }

    return getOptionItemDefaultVariantIndex(detailItem);
  }

  async function buildOptionSelectionMapFromOrder(productId, orderItem, product) {
    const pid = Number(productId || 0);
    const options = Array.isArray(orderItem?.options) ? orderItem.options : [];
    if (!(pid > 0) || !options.length) return new Map();

    const groups = state.productOptionGroups.get(pid) || [];
    await loadOptionDetailsForProducts([product]);

    const byGroup = new Map();
    const allGroups = Array.isArray(groups) ? groups : [];
    const findByNameInGroup = (detailItems, titleToken) => (
      detailItems.find((x) => normalizeCompareToken(x?.name || x?.product_name || "") === titleToken) || null
    );

    for (const opt of options) {
      const qtyRaw = Number(opt?.qty ?? opt?.quantity ?? 0);
      if (!(qtyRaw > 0)) continue;
      const optionIdRaw = Number(opt?.id || opt?.option_item_id || opt?.item_id || 0);
      let groupId = Number(opt?.group_id || opt?.option_group_id || 0);
      let detailItem = null;
      let detailItems = [];
      let detailGroup = null;

      if (groupId > 0) {
        const details = state.optionGroupDetails.get(groupId);
        detailItems = Array.isArray(details?.items) ? details.items : [];
        detailGroup = details?.group || null;
        if (optionIdRaw > 0) {
          detailItem = detailItems.find((x) => Number(x?.id || 0) === optionIdRaw) || null;
        }
      }

      if (!detailItem) {
        const optTitleToken = normalizeCompareToken(opt?.title || opt?.name || opt?.label || "");
        for (const group of allGroups) {
          const gid = Number(group?.group_id || group?.id || 0);
          if (!(gid > 0)) continue;
          const details = state.optionGroupDetails.get(gid);
          const items = Array.isArray(details?.items) ? details.items : [];
          const byId = optionIdRaw > 0 ? (items.find((x) => Number(x?.id || 0) === optionIdRaw) || null) : null;
          const byName = !byId && optTitleToken ? findByNameInGroup(items, optTitleToken) : null;
          const found = byId || byName;
          if (found) {
            groupId = gid;
            detailItem = found;
            detailItems = items;
            detailGroup = details?.group || null;
            break;
          }
        }
      }

      if (!(groupId > 0) || !detailItem) continue;

      const groupUiType = getOptionGroupUiType({ ...(detailGroup || {}), items: detailItems });
      const entryType = groupUiType === "multiple_item"
        ? "multiple_item"
        : (groupUiType === "multiple_group" ? "multiple_group" : "single");
      const existing = byGroup.get(groupId) || { type: entryType, items: [] };
      const selectedVariantIndex = resolveOptionVariantIndex(detailItem, opt);
      const hasVariant = Number.isFinite(Number(selectedVariantIndex));
      const rowQty = entryType === "single" || entryType === "multiple_group"
        ? 1
        : Math.max(0, Number(qtyRaw));
      const nextRow = {
        id: Number(detailItem?.id || 0),
        label: String(detailItem?.name || detailItem?.product_name || opt?.title || "РћРїС†РёСЏ"),
        qty: rowQty,
        basePrice: getOptionItemBasePrice(detailItem),
        variantDiff: hasVariant ? getOptionItemVariantDiff(detailItem, Number(selectedVariantIndex)) : 0,
        ...(hasVariant ? { variantIndex: Number(selectedVariantIndex) } : {}),
      };

      if (entryType === "single") {
        byGroup.set(groupId, { type: "single", items: [nextRow] });
      } else if (entryType === "multiple_group") {
        byGroup.set(groupId, {
          type: "multiple_group",
          items: [...existing.items.filter((row) => Number(row?.id || 0) !== Number(nextRow.id)), nextRow],
        });
      } else {
        byGroup.set(groupId, { type: "multiple_item", items: [...existing.items, nextRow] });
      }
    }

    return byGroup;
  }

  function buildFallbackCartProductItem(orderItem) {
    const autoAdd = Number(orderItem?.auto_add || 0) === 1 ? 1 : 0;
    const autoAddGroupIdRaw = Number(orderItem?.auto_add_group_id || 0);
    const autoAddGroupId = autoAdd && autoAddGroupIdRaw > 0 ? autoAddGroupIdRaw : null;
    const qty = Math.max(1, Number(orderItem?.qty || orderItem?.quantity || 1));
    const lineTotal = roundPrice(Number(orderItem?.line_total ?? orderItem?.total ?? orderItem?.total_price ?? orderItem?.price ?? 0));
    const unitPrice = qty > 0 ? roundPrice(lineTotal / qty) : 0;
    const oldLineTotal = roundPrice(Number(orderItem?.discount?.original_line_total || orderItem?.old_line_total || 0));
    const oldUnitPrice = oldLineTotal > lineTotal && qty > 0 ? roundPrice(oldLineTotal / qty) : 0;

    const variants = Array.isArray(orderItem?.variants) ? orderItem.variants : [];
    const firstVariant = variants[0] || null;
    const variantLabel = String(firstVariant?.label || firstVariant?.value || orderItem?.variant_label || "").trim();
    return {
      id: Date.now() + Math.floor(Math.random() * 10000),
      type: "product",
      name: String(orderItem?.product_name || orderItem?.name || "РўРѕРІР°СЂ"),
      product_id: Number(orderItem?.product_id || 0),
      qty,
      photos: (Array.isArray(orderItem?.photos) ? orderItem.photos : []).filter(Boolean).slice(0, 4),
      variant: {
        label: variantLabel,
        values: variantLabel ? [variantLabel] : [],
        selected_index: 0,
      },
      pricing: {
        base_price: unitPrice,
        old_price: oldUnitPrice || unitPrice,
        option_total: 0,
        discount: null,
        base_unit_id: Number(firstVariant?.unit_id || 0),
        unit_id: Number(firstVariant?.unit_id || 0),
        base_qty: 1,
        variant_group: null,
      },
      option_items: [],
      ingredients: [],
      auto_add: autoAdd,
      auto_add_group_id: autoAddGroupId,
      unit_price_before_discount: oldUnitPrice > unitPrice ? oldUnitPrice : 0,
      unit_price: unitPrice,
      sum: lineTotal,
    };
  }

  async function buildCartItemFromOrderProduct(orderItem) {
    const productId = Number(orderItem?.product_id || 0);
    if (!(productId > 0)) return buildFallbackCartProductItem(orderItem);

    const product = await ensureProductById(productId);
    if (!product) return buildFallbackCartProductItem(orderItem);

    await loadVariantsForProducts([product]);
    await loadIngredientsForProducts([product]);
    await loadOptionsForProducts([product]);
    await loadOptionDetailsForProducts([product]);

    const selectedVariantIndex = resolveOrderVariantIndex(productId, orderItem);
    state.selectedVariants.set(productId, selectedVariantIndex);
    state.ingredientStateByProduct.set(productId, buildIngredientQtyMapFromOrder(productId, orderItem));
    const optionSelectionMap = await buildOptionSelectionMapFromOrder(productId, orderItem, product);
    if (optionSelectionMap.size) state.optionSelections.set(productId, optionSelectionMap);
    else state.optionSelections.delete(productId);

    const qty = Math.max(1, Number(orderItem?.qty || orderItem?.quantity || 1));
    const cartItem = buildCartItemFromProduct(productId, qty);
    if (!cartItem) return buildFallbackCartProductItem(orderItem);
    cartItem.id = Date.now() + Math.floor(Math.random() * 10000);
    cartItem.auto_add = Number(orderItem?.auto_add || 0) === 1 ? 1 : 0;
    cartItem.auto_add_group_id = cartItem.auto_add === 1 && Number(orderItem?.auto_add_group_id || 0) > 0
      ? Number(orderItem.auto_add_group_id)
      : null;
    return cartItem;
  }

  function normalizeComboSelectionIngredients(rawList) {
    const source = Array.isArray(rawList) ? rawList : [];
    return source.map((ing) => {
      const qty = Number(ing?.qty ?? ing?.quantity ?? 0);
      return {
        ingredient_id: Number(ing?.ingredient_id || 0),
        name: String(ing?.name || ing?.ingredient_name || ""),
        qty,
        quantity: qty,
        unit: String(ing?.unit || ing?.unit_label || ""),
        unit_id: Number(ing?.unit_id || 0) || null,
      };
    }).filter((row) => row.ingredient_id > 0 || row.name);
  }

  async function buildComboCartItemFromOrderItem(orderItem) {
    const qty = Math.max(1, Number(orderItem?.qty || orderItem?.quantity || 1));
    const lineTotal = roundPrice(Number(orderItem?.line_total ?? orderItem?.total ?? orderItem?.total_price ?? 0));
    const oldLineTotalRaw = roundPrice(Number(orderItem?.old_line_total || orderItem?.discount?.original_line_total || 0));
    const unitPrice = qty > 0 ? roundPrice(lineTotal / qty) : 0;
    const unitOldPrice = oldLineTotalRaw > lineTotal && qty > 0 ? roundPrice(oldLineTotalRaw / qty) : unitPrice;
    const explicitDiscount = Number(orderItem?.combo_discount_percent ?? orderItem?.discount_percent ?? 0);
    const calculatedDiscount = unitOldPrice > unitPrice && unitOldPrice > 0
      ? Number((((unitOldPrice - unitPrice) / unitOldPrice) * 100).toFixed(6))
      : 0;
    const comboDiscountPercent = explicitDiscount > 0 ? explicitDiscount : calculatedDiscount;

    const explicitSelections = Array.isArray(orderItem?.selections) ? orderItem.selections : [];
    let mappedSelections = explicitSelections.length
      ? explicitSelections.map((row) => ({
          product_id: Number(row?.product_id || 0),
          product_name: String(row?.product_name || ""),
          product_photo: String(row?.product_photo || row?.photo_url || ""),
          variant_label: String(row?.variant_label || ""),
          variant_group_id: Number(row?.variant_group_id || 0) || null,
          variant_group_title: String(row?.variant_group_title || ""),
          variant_unit: String(row?.variant_unit || ""),
          variant_value_index: Number.isFinite(Number(row?.variant_value_index)) ? Number(row.variant_value_index) : null,
          unit_id: Number(row?.unit_id || 0) || null,
          unit_price_override: Number(row?.unit_price_override ?? row?.price ?? 0),
          unit_price_before_discount: Number(row?.unit_price_before_discount ?? row?.old_price ?? row?.unit_price_override ?? row?.price ?? 0),
          ingredients_display: normalizeComboSelectionIngredients(row?.ingredients_display),
        }))
      : [];

    const comboId = Number(orderItem?.combo_id || 0);
    const sectionsSource = Array.isArray(orderItem?.sections) ? orderItem.sections : [];
    const fallbackSections = sectionsSource.length
      ? sectionsSource
      : mappedSelections.map((row) => ({
          category_id: Number(row?.block_id || 0),
          category_name: String(row?.block_title || ""),
          product_id: row.product_id,
          product_name: row.product_name,
          photo_url: row.product_photo,
          price: row.unit_price_override,
          old_price: row.unit_price_before_discount,
          variant: {
            label: row.variant_label,
            values: row.variant_label ? [row.variant_label] : [],
            selected_index: Number.isFinite(Number(row.variant_value_index)) ? Number(row.variant_value_index) : 0,
          },
          pricing: {
            base_price: Number(row.unit_price_before_discount || row.unit_price_override || 0),
            old_price: Number(row.unit_price_before_discount || row.unit_price_override || 0),
            option_total: 0,
            discount: null,
            base_unit_id: Number(row.unit_id || 0),
            unit_id: Number(row.unit_id || 0),
            base_qty: 1,
            variant_group: null,
          },
          ingredients: normalizeComboSelectionIngredients(row.ingredients_display).map((ing) => ({
            ingredient_id: Number(ing?.ingredient_id || 0),
            ingredient_name: String(ing?.name || ""),
            qty: Number(ing?.qty || 0),
            default_qty: Number(ing?.qty || 0),
            qty_min: 0,
            qty_max: Number(ing?.qty || 0),
            qty_step: 1,
            unit_label: String(ing?.unit || ""),
            unit_id: Number(ing?.unit_id || 0) || 0,
            ingredient_base_unit_id: Number(ing?.unit_id || 0) || 0,
            price_per_unit: 0,
          })),
        }));

    let sections = fallbackSections.map((section, sectionIndex) => {
      const fallback = mappedSelections[sectionIndex] && typeof mappedSelections[sectionIndex] === "object"
        ? mappedSelections[sectionIndex]
        : null;
      const variant = section?.variant && typeof section.variant === "object" ? section.variant : {};
      const variantLabel = String(variant?.label || section?.variant_label || "").trim();
      const sectionPrice = Number(section?.price || section?.unit_price_override || 0);
      const sectionOld = Number(section?.old_price || section?.unit_price_before_discount || sectionPrice);
      return {
        category_id: Number(section?.category_id || fallback?.block_id || 0),
        category_name: String(section?.category_name || fallback?.block_title || ""),
        product_id: Number(section?.product_id || 0),
        product_name: String(section?.product_name || ""),
        photo_url: String(section?.photo_url || section?.product_photo || ""),
        price: roundPrice(sectionPrice),
        old_price: roundPrice(sectionOld),
        variant: {
          label: variantLabel,
          values: Array.isArray(variant?.values) ? variant.values.map((v) => String(v || "").trim()).filter(Boolean) : (variantLabel ? [variantLabel] : []),
          selected_index: Number.isFinite(Number(variant?.selected_index)) ? Number(variant.selected_index) : 0,
        },
        pricing: {
          base_price: roundPrice(Number(section?.pricing?.base_price || sectionOld || sectionPrice)),
          old_price: roundPrice(Number(section?.pricing?.old_price || sectionOld || sectionPrice)),
          option_total: 0,
          discount: null,
          base_unit_id: Number(section?.pricing?.base_unit_id || section?.pricing?.unit_id || 0),
          unit_id: Number(section?.pricing?.unit_id || 0),
          base_qty: Number(section?.pricing?.base_qty || 1),
          variant_group: section?.pricing?.variant_group ? deepCloneJson(section.pricing.variant_group, null) : null,
        },
        ingredients: (Array.isArray(section?.ingredients) ? section.ingredients : []).map((ing) => ({
          ingredient_id: Number(ing?.ingredient_id || 0),
          ingredient_name: String(ing?.ingredient_name || ing?.name || ""),
          qty: Number(ing?.qty || ing?.quantity || 0),
          default_qty: Number(ing?.default_qty ?? ing?.qty ?? ing?.quantity ?? 0),
          qty_min: Number(ing?.qty_min ?? 0),
          qty_max: Number(ing?.qty_max ?? ing?.qty ?? ing?.quantity ?? 0),
          qty_step: Number(ing?.qty_step || 1),
          unit_label: String(ing?.unit_label || ing?.unit || ""),
          unit_id: Number(ing?.unit_id || 0),
          ingredient_base_unit_id: Number(ing?.ingredient_base_unit_id || ing?.unit_id || 0),
          price_per_unit: Number(ing?.price_per_unit || 0),
        })),
      };
    });

    if (!sectionsSource.length) {
      try {
        const hydratedSections = [];
        const hydratedSelections = [];
        const addHydratedRow = ({
          blockIndex,
          blockId,
          blockTitle,
          productId,
          product,
          selectedProduct,
          seed,
        }) => {
          const variantGroups = state.productVariants.get(productId) || [];
          const variantGroup = Array.isArray(variantGroups) && variantGroups.length ? variantGroups[0] : null;
          const variantValues = getComboVariantDisplayValues(productId);
          const seededVariantIndex = Number(seed?.variant_value_index);
          const defaultVariantIndex = variantGroup?.default_value_index != null
            ? Number(variantGroup.default_value_index)
            : 0;
          let selectedVariantIndex = Number.isFinite(seededVariantIndex) ? seededVariantIndex : defaultVariantIndex;
          if (!Number.isFinite(selectedVariantIndex) || selectedVariantIndex < 0) selectedVariantIndex = 0;
          if (variantValues.length) {
            const hasExplicitIndex = Number.isFinite(seededVariantIndex) && seededVariantIndex >= 0 && seededVariantIndex < variantValues.length;
            if (!hasExplicitIndex) {
              const seededLabelToken = normalizeCompareToken(seed?.variant_label || "");
              if (seededLabelToken) {
                const matchedIndex = variantValues.findIndex((label) => {
                  const token = normalizeCompareToken(label);
                  return token && (token === seededLabelToken || token.startsWith(seededLabelToken) || seededLabelToken.startsWith(token));
                });
                if (matchedIndex >= 0) selectedVariantIndex = matchedIndex;
              }
            }
            selectedVariantIndex = Math.max(0, Math.min(variantValues.length - 1, selectedVariantIndex));
          } else {
            selectedVariantIndex = 0;
          }

          const ingredientsSnapshot = buildComboIngredientSnapshot(productId, seed?.ingredients_display);
          const variantLabel = String(seed?.variant_label || variantValues[selectedVariantIndex] || "").trim();
          const seededOldPrice = Number(seed?.unit_price_before_discount);
          const seededPrice = Number(seed?.unit_price_override);
          const fallbackOldPrice = Number(product?.price || selectedProduct?.price || seededPrice || 0);
          const sectionOldPrice = roundPrice(
            Number.isFinite(seededOldPrice) && seededOldPrice > 0
              ? seededOldPrice
              : fallbackOldPrice
          );
          const sectionPrice = roundPrice(
            Number.isFinite(seededPrice) && seededPrice >= 0
              ? seededPrice
              : comboDiscountedPrice(sectionOldPrice, comboDiscountPercent)
          );
          const variantGroupId = Number(variantGroup?.id || variantGroup?.variant_group_id || 0) || null;
          const variantGroupTitle = String(
            seed?.variant_group_title
            || variantGroup?.title
            || variantGroup?.title_label
            || ""
          ).trim();
          const variantUnit = String(seed?.variant_unit || getVariantUnitLabel(variantGroup) || "").trim();
          const unitId = Number(
            seed?.unit_id
            || variantGroup?.unit_id
            || product?.base_unit_id
            || product?.unit_id
            || 0
          ) || null;
          const photoUrl = String(seed?.product_photo || selectedProduct?.product_photo || getProductPhoto(product) || "").trim();
          const productName = String(seed?.product_name || product?.name || selectedProduct?.product_name || "Товар").trim();
          const safeBlockId = Number(blockId || 0);
          const safeBlockTitle = String(blockTitle || "").trim();

          hydratedSections.push({
            category_id: safeBlockId,
            category_name: safeBlockTitle,
            product_id: productId,
            product_name: productName,
            photo_url: photoUrl,
            price: sectionPrice,
            old_price: sectionOldPrice,
            variant_group_title: variantGroupTitle,
            variant_unit: variantUnit,
            variant: {
              label: variantLabel,
              values: variantValues,
              selected_index: selectedVariantIndex,
            },
            pricing: {
              base_price: roundPrice(Number(product?.price || sectionOldPrice || sectionPrice)),
              old_price: roundPrice(Number(product?.old_price || sectionOldPrice || sectionPrice)),
              option_total: 0,
              discount: null,
              base_unit_id: Number(product?.base_unit_id || product?.unit_id || unitId || 0),
              unit_id: Number(unitId || product?.base_unit_id || product?.unit_id || 0),
              base_qty: Number(product?.base_qty || 1),
              variant_group: variantGroup ? {
                id: variantGroupId,
                variant_group_id: variantGroupId,
                title: variantGroupTitle,
                unit_id: Number(variantGroup?.unit_id || 0),
                default_value_index: Number(variantGroup?.default_value_index || 0),
                values: Array.isArray(variantGroup?.values) ? [...variantGroup.values] : [],
                discount_tiers: Array.isArray(variantGroup?.discount_tiers)
                  ? variantGroup.discount_tiers.map((tier) => ({ ...tier }))
                  : [],
              } : null,
            },
            ingredients: Array.isArray(ingredientsSnapshot)
              ? ingredientsSnapshot.map((ing) => ({ ...ing }))
              : [],
          });

          hydratedSelections.push({
            block_index: Number.isFinite(Number(blockIndex)) ? Number(blockIndex) : 0,
            block_id: safeBlockId > 0 ? safeBlockId : null,
            block_title: safeBlockTitle,
            product_id: productId,
            product_name: productName,
            product_photo: photoUrl,
            variant_label: variantLabel,
            variant_group_id: variantGroupId,
            variant_group_title: variantGroupTitle,
            variant_unit: variantUnit,
            variant_value_index: selectedVariantIndex,
            unit_id: unitId,
            unit_price_override: sectionPrice,
            unit_price_before_discount: sectionOldPrice,
            ingredients_display: Array.isArray(ingredientsSnapshot)
              ? ingredientsSnapshot.map((ing) => ({
                ingredient_id: Number(ing?.ingredient_id || 0),
                name: String(ing?.ingredient_name || ing?.name || ""),
                qty: Number(ing?.qty ?? ing?.quantity ?? 0),
                quantity: Number(ing?.qty ?? ing?.quantity ?? 0),
                unit: String(ing?.unit_label || ing?.unit || ""),
                unit_id: Number(ing?.unit_id || 0) || null,
              }))
              : [],
          });
        };

        if (comboId > 0) {
          const combo = await resolveComboDetails(comboId);
          const blocks = Array.isArray(combo?.blocks) ? combo.blocks : [];
          if (blocks.length) {
            const usedSelectionIndexes = new Set();
            for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
              const block = blocks[blockIndex] || {};
              const blockProducts = Array.isArray(block?.products) ? block.products : [];
              if (!blockProducts.length) continue;

              const blockId = Number(block?.block_id || block?.id || 0);
              let seedIndex = mappedSelections.findIndex((row, idx) => (
                !usedSelectionIndexes.has(idx)
                && blockId > 0
                && Number(row?.block_id || 0) === blockId
              ));
              if (seedIndex < 0 && blockIndex < mappedSelections.length && !usedSelectionIndexes.has(blockIndex)) {
                seedIndex = blockIndex;
              }
              if (seedIndex < 0) {
                seedIndex = mappedSelections.findIndex((row, idx) => (
                  !usedSelectionIndexes.has(idx)
                  && Number(row?.product_id || 0) > 0
                  && blockProducts.some((p) => Number(p?.product_id || 0) === Number(row?.product_id || 0))
                ));
              }
              const seed = seedIndex >= 0 ? mappedSelections[seedIndex] : null;
              if (seedIndex >= 0) usedSelectionIndexes.add(seedIndex);

              const seededProductId = Number(seed?.product_id || 0);
              const selectedProduct = blockProducts.find((p) => Number(p?.product_id || 0) === seededProductId)
                || blockProducts.find((p) => Number(p?.is_default || 0) === 1)
                || blockProducts[0]
                || null;
              const productId = Number(selectedProduct?.product_id || seededProductId || 0);
              if (!(productId > 0)) continue;

              const product = await ensureProductById(productId);
              const productLike = product || {
                id: productId,
                price: Number(
                  selectedProduct?.price
                  || seed?.unit_price_before_discount
                  || seed?.unit_price_override
                  || 0
                ),
              };
              await loadVariantsForProducts([productLike]);
              await loadIngredientsForProducts([productLike]);

              addHydratedRow({
                blockIndex,
                blockId,
                blockTitle: String(block?.block_title || block?.title || "").trim(),
                productId,
                product,
                selectedProduct,
                seed,
              });
            }
          }
        }

        if (!hydratedSections.length && mappedSelections.length) {
          for (let idx = 0; idx < mappedSelections.length; idx += 1) {
            const seed = mappedSelections[idx] || {};
            const productId = Number(seed?.product_id || 0);
            if (!(productId > 0)) continue;
            const product = await ensureProductById(productId);
            const productLike = product || {
              id: productId,
              price: Number(seed?.unit_price_before_discount || seed?.unit_price_override || 0),
            };
            await loadVariantsForProducts([productLike]);
            await loadIngredientsForProducts([productLike]);

            addHydratedRow({
              blockIndex: Number.isFinite(Number(seed?.block_index)) ? Number(seed.block_index) : idx,
              blockId: Number(seed?.block_id || 0),
              blockTitle: String(seed?.block_title || "").trim(),
              productId,
              product,
              selectedProduct: null,
              seed,
            });
          }
        }

        if (hydratedSections.length) {
          sections = hydratedSections;
          mappedSelections = hydratedSelections;
        }
      } catch {}
    }

    const comboCartItem = {
      id: Date.now() + Math.floor(Math.random() * 10000),
      type: "combo",
      combo_id: comboId,
      name: String(orderItem?.name || orderItem?.combo_title || "РљРѕРјР±Рѕ"),
      qty,
      combo_discount_percent: comboDiscountPercent,
      unit_price_before_discount: roundPrice(unitOldPrice),
      unit_price: roundPrice(unitPrice),
      sum: roundPrice(lineTotal),
      photos: (Array.isArray(orderItem?.photos) ? orderItem.photos : []).filter(Boolean).slice(0, 4),
      selections: mappedSelections,
      sections,
    };
    if (!(comboId > 0)) {
      const checkoutCategoryIds = [...new Set(
        (Array.isArray(sections) ? sections : [])
          .map((section) => Number(section?.category_id || 0))
          .filter((id) => Number.isFinite(id) && id > 0)
      )];
      if (checkoutCategoryIds.length) {
        comboCartItem.checkout_category_ids = checkoutCategoryIds;
        const inferredRequireAll = inferCheckoutRequireAllByCategoryIds(checkoutCategoryIds);
        if (inferredRequireAll !== null) {
          comboCartItem.checkout_require_all = Boolean(inferredRequireAll);
        }
      }
    }
    return comboCartItem;
  }

  async function buildDraftSessionFromOrder(order, opts = {}) {
    const src = order && typeof order === "object" ? order : {};
    const orderId = Number(src?.id || 0);
    const titleFromOpts = String(opts?.title || "").trim();
    const draft = buildRightOrderDraft(
      Number(opts?.draftOrderId || 0),
      titleFromOpts || (orderId > 0 ? `№${orderId}` : "РќРѕРІС‹Р№ Р·Р°РєР°Р·"),
      {
        mode: "edit",
        editOrderId: orderId > 0 ? orderId : 0,
        storeId: Number(src?.store_id || src?.storeId || 0) > 0 ? Number(src?.store_id || src?.storeId) : null,
      }
    );

    const orderItems = Array.isArray(src?.items) ? src.items : [];
    const cartItems = [];
    for (const orderItem of orderItems) {
      if (String(orderItem?.type || "") === "combo") {
        cartItems.push(await buildComboCartItemFromOrderItem(orderItem));
        continue;
      }
      cartItems.push(await buildCartItemFromOrderProduct(orderItem));
    }

    const phoneRaw = String(src?.customer_phone || "").trim();
    const normalizedPhone = normalizePhoneRu(phoneRaw);
    const parsedScheduled = String(src?.scheduled_at || "").trim();
    const scheduleMatch = parsedScheduled.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
    const scheduledDate = scheduleMatch ? scheduleMatch[1] : formatIsoDate(getTodayDate());
    const scheduledTime = scheduleMatch ? scheduleMatch[2] : "18:00";
    const timeOptionCode = String(src?.time_option_code || "asap").trim() || "asap";
    const changeFrom = Number(src?.change_from || 0);
    const statusId = Number(src?.status_id || 0);
    const statusTitle = String(src?.status_title || src?.status?.title || "").trim();
    const knownChangeValues = new Set([500, 1000, 2000, 5000]);
    const changeType = changeFrom > 0
      ? (knownChangeValues.has(changeFrom) ? String(changeFrom) : "other")
      : "no_change";

    draft.form = {
      ...draft.form,
      phone: normalizedPhone.length ? `+${normalizedPhone}` : "+7",
      clientId: Number(src?.customer_id || 0) || null,
      name: String(src?.customer_name || "").trim(),
      pickupMethod: String(src?.method_code || draft.form.pickupMethod || "delivery").trim() || "delivery",
      address: String(src?.address || "").trim(),
      cookWhen: timeOptionCode,
      scheduledDate,
      dateTime: scheduledTime,
      orderStatusId: statusId > 0 ? statusId : null,
      orderStatusInitialId: statusId > 0 ? statusId : null,
      orderStatusTitle: statusTitle,
      orderStatusInitialTitle: statusTitle,
      paymentMethod: String(src?.payment_code || draft.form.paymentMethod || "cash").trim() || "cash",
      changeType,
      changeAmount: changeType === "other" ? String(Math.max(0, changeFrom)) : "",
      comment: String(src?.comment || "").trim(),
      cartItems,
    };

    return {
      activeCategoryId: CHECKOUT_SCREEN_ID,
      quantities: {},
      selectedVariants: {},
      ingredientStateByProduct: {},
      optionSelections: {},
      rightOrders: [draft],
      rightActiveOrderId: Number(draft.id || 0) || null,
    };
  }

  function captureCheckoutSession() {
    return {
      activeCategoryId: state.activeCategoryId,
      quantities: mapToObject(state.quantities),
      selectedVariants: mapToObject(state.selectedVariants),
      ingredientStateByProduct: mapOfMapsToObject(state.ingredientStateByProduct),
      optionSelections: serializeOptionSelectionsMap(state.optionSelections),
      rightOrders: deepCloneJson(Array.isArray(state.rightOrders) ? state.rightOrders : [], []),
      rightActiveOrderId: Number(state.rightActiveOrderId || 0) || null,
    };
  }

  async function restoreCheckoutSession(session) {
    const src = session && typeof session === "object" ? session : {};
    const activeCategoryRaw = src.activeCategoryId;
    if (String(activeCategoryRaw) === CHECKOUT_SCREEN_ID) state.activeCategoryId = CHECKOUT_SCREEN_ID;
    else state.activeCategoryId = Number(activeCategoryRaw || 0) || CHECKOUT_SCREEN_ID;

    state.quantities = objectToMap(src.quantities || {});
    state.selectedVariants = objectToMap(src.selectedVariants || {});
    state.ingredientStateByProduct = objectToMapOfMaps(src.ingredientStateByProduct || {});
    state.optionSelections = deserializeOptionSelectionsMap(src.optionSelections || {});
    state.rightOrders = Array.isArray(src.rightOrders)
      ? deepCloneJson(src.rightOrders, []).map((row) => normalizeRightOrderDraft(row))
      : [];
    state.rightActiveOrderId = Number(src.rightActiveOrderId || 0) || null;
    state.rightAutoAddDismissedByOrder.clear();
    state.rightOpenSelect = null;
    closeRightAddressOverlay();

    if (!state.rightOrders.length) {
      openRightNewOrderTab();
    } else if (!state.rightActiveOrderId || !state.rightOrders.some((row) => Number(row?.id || 0) === Number(state.rightActiveOrderId || 0))) {
      state.rightActiveOrderId = Number(state.rightOrders[0]?.id || 0) || null;
    }

    ensureValidActiveCategory();
    renderCategories();
    await renderActiveCategoryContent();
    renderRightOrderTabs();
  }

  function buildBlankDraftSession(opts = {}) {
    const draft = buildRightOrderDraft(Number(opts?.id || 0), String(opts?.title || "").trim());
    return {
      activeCategoryId: CHECKOUT_SCREEN_ID,
      quantities: {},
      selectedVariants: {},
      ingredientStateByProduct: {},
      optionSelections: {},
      rightOrders: [draft],
      rightActiveOrderId: Number(draft.id || 0) || null,
    };
  }

  window.NewOrderBridge = {
    ready: () => loadReadyPromise,
    captureSession: () => captureCheckoutSession(),
    restoreSession: async (session) => {
      await loadReadyPromise;
      await restoreCheckoutSession(session);
    },
    createBlankSession: (opts = {}) => buildBlankDraftSession(opts),
    createSessionFromOrder: async (order, opts = {}) => {
      await loadReadyPromise;
      return buildDraftSessionFromOrder(order, opts);
    },
  };

  async function load() {
    try {
      await ensureTenantPriceRoundingSettings();
      const cachedManifest = readNewOrderManifestCache();
      if (cachedManifest) state.cacheManifest = cachedManifest;

      const bootstrapSnapshot = readBootstrapSnapshot();
      const hydrated = hydrateStateFromBootstrapSnapshot(bootstrapSnapshot);
      if (!state.activeCategoryId) state.activeCategoryId = CHECKOUT_SCREEN_ID;

      if (hydrated) {
        if (!Array.isArray(state.unitConversions) || !state.unitConversions.length) {
          await loadUnitConversions();
        }
        await loadRightAutoAdd({ force: true });
        renderCategories();
        await renderActiveCategoryContent();
      }

      const freshManifest = await fetchNewOrderManifest();
      const prevManifest = state.cacheManifest || cachedManifest || null;
      const nextManifest = freshManifest || state.cacheManifest || cachedManifest || null;
      if (freshManifest) {
        state.cacheManifest = freshManifest;
        writeNewOrderManifestCache(freshManifest);
      }

      if (!nextManifest) {
        if (!hydrated) {
          await loadRefsFromApi();
          await loadCategoriesFromApi();
          try {
            await loadCheckoutDraftFromApi();
          } catch {
            state.checkoutSavedDraft = { blocks: [] };
          }
          await preloadAllCategoryProducts(getPreloadCategoryIds());
        }
      } else {
        const manifestChanged = !areManifestTokensEqual(prevManifest, nextManifest);
        if (!hydrated || manifestChanged) {
          await syncDataByManifest(nextManifest, prevManifest, !hydrated);
        }
      }

      ensureValidActiveCategory();
      renderCategories();
      await renderActiveCategoryContent();
      schedulePersistBootstrapSnapshot(0);
    } catch (e) {
      if (categoriesEmptyEl) {
        categoriesEmptyEl.textContent = "РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РєР°С‚РµРіРѕСЂРёР№";
        categoriesEmptyEl.classList.remove("hidden");
      }
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё";
        productsEmptyEl.classList.remove("hidden");
      }
      renderMainContentMode();
      if (!state.rightActiveOrderId) openRightNewOrderTab();
      renderRightOrderTabs();
    } finally {
      markLoadReady();
    }
  }

  bindEvents();
  load();
})();

