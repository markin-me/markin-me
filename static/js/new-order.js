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
  const NEW_ORDER_CLIENT_CACHE_VERSION = 2;
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
    rightDeliveryQuoteByOrder: new Map(),
    rightDeliveryQuoteKeyByOrder: new Map(),
    rightDeliveryQuoteLoadingByOrder: new Set(),
    rightDeliveryQuoteReqSeqByOrder: new Map(),
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
    rightBenefitsPreviewByOrder: new Map(),
    rightBenefitsPreviewKeyByOrder: new Map(),
    rightBenefitsPreviewByClientMode: new Map(),
    rightBenefitsLoadingByOrder: new Set(),
    rightBenefitsReqSeqByOrder: new Map(),
    rightBenefitsRefreshTimerByOrder: new Map(),
    rightBenefitsTokenByClientId: new Map(),
    rightBenefitsClaimOptionsByOrder: new Map(),
    rightBenefitsDiscountDetailsById: new Map(),
    rightBenefitsDiscountDetailReqSeq: 0,
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
    benefitsModal: {
      orderId: 0,
      mode: "customer",
      screen: "main",
      title: "Выгоды",
      payload: null,
      promoInputValue: "",
      busy: false,
      mainView: null,
    },
    clientBenefitsCatalogModal: {
      customerId: 0,
      data: null,
      loading: false,
      error: "",
      busyActionKey: "",
    },
    cacheManifest: null,
  };

  let rightOrderTabsRerenderQueued = false;

  let resolveLoadReady = null;
  const loadReadyPromise = new Promise((resolve) => {
    resolveLoadReady = resolve;
  });

  function queueRenderRightOrderTabs() {
    if (rightOrderTabsRerenderQueued) return;
    rightOrderTabsRerenderQueued = true;
    Promise.resolve().then(() => {
      rightOrderTabsRerenderQueued = false;
      renderRightOrderTabs();
    });
  }
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
      const preserveStoredLineTotals = isEditCheckout;
      const normalizedCart = normalizeRightOrderCartItemsWithAutoAdd(
        activeOrderId,
        Array.isArray(form?.cartItems) ? form.cartItems : [],
        { preserveStoredLineTotals }
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
    void ensureRightDeliveryQuoteFresh(active, cartSummary, { render: true });
    const cartItems = cartSummary.cartItems;
    const snapshotForLinePricing = (
      isEditCheckout
      && active?.editCartTouched !== true
      && active?.editPricingSnapshot
      && typeof active.editPricingSnapshot === "object"
    ) ? active.editPricingSnapshot : null;
    const snapshotItemsTotalAfterDiscount = snapshotForLinePricing
      ? Number(
          snapshotForLinePricing?.subtotalAfterDiscount
          ?? snapshotForLinePricing?.subtotal_after_discount
          ?? NaN
        )
      : NaN;
    const linePricingTargetItemsTotal = Number.isFinite(snapshotItemsTotalAfterDiscount)
      ? roundPrice(Math.max(0, snapshotItemsTotalAfterDiscount))
      : roundPrice(Number(cartSummary.subtotalAfterCustomerDiscount || 0));
    const cartLineStates = buildRightOrderCartLineStates(
      cartItems,
      linePricingTargetItemsTotal,
      cartSummary?.benefitsPreview
    );
    const orderPayableTotal = cartSummary.payableTotal;
    const asapEtaLabel = cartSummary.isDeliveryMethod && Number(cartSummary.etaMinutes || 0) > 0
      ? `${Math.round(Number(cartSummary.etaMinutes || 0))} мин`
      : "40-80 мин";
    const deliveryProgressAriaValue = Math.round(cartSummary.progress);
    const deliveryProgressLabelHtml = cartSummary.deliveryProgressState === "reached"
      ? `Бесплатная доставка <i class="fas fa-check shop-delivery-check" aria-hidden="true"></i>`
      : cartSummary.deliveryProgressState === "neutral-no-threshold"
        ? "Бесплатная доставка не настроена"
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
        <div class="shop-cart-delivery-progress-row">
          <div class="shop-cart-delivery-progress-surface">
            <div class="shop-cart-delivery-progress-bar" role="progressbar" aria-valuenow="${deliveryProgressAriaValue}" aria-valuemin="0" aria-valuemax="100">
              <div class="shop-cart-delivery-progress-fill" style="width:${cartSummary.progress}%"></div>
            </div>
            <div class="shop-cart-delivery-progress-label ${cartSummary.deliveryProgressState === "reached" ? "is-free" : ""}">${deliveryProgressLabelHtml}</div>
          </div>
        </div>
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
            class="new-order-right-footer-benefits-btn"
            type="button"
            data-action="right-order-benefits-open"
            data-order-id="${Number(active?.id || 0)}"
            aria-label="Выгоды"
            title="Выгоды"
          >
            <i class="fas fa-tags" aria-hidden="true"></i>
          </button>
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
            <span>${escapeHtml(labels[field]?.[value] || value || "\u0412\u044b\u0431\u0440\u0430\u0442\u044c")}</span>
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
              <div class="new-order-right-time-hint is-single"><span>${escapeHtml(asapEtaLabel)}</span></div>
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
            ${cartItems.length ? cartItems.map((item, itemIndex) => {
              const type = String(item?.type || "product");
              const qty = Math.max(1, Number(item?.qty || 1));
              const isGiftReward = isGiftRewardCartItem(item);
              const qtyEditable = !isGiftReward && isRightOrderAutoQtyEditable(item);
              const autoFreeQty = getRightOrderAutoFreeQty(item);
              const lineState = cartLineStates[itemIndex] || null;
              const sum = lineState
                ? roundPrice(Number(lineState.currentTotal || 0))
                : getRightOrderCartLineTotal(item);
              const fallbackUnitOldPrice = roundPrice(Number(item?.unit_price_before_discount || 0));
              const fallbackOldSum = roundPrice(fallbackUnitOldPrice * qty);
              const oldSum = lineState
                ? roundPrice(Number(lineState.originalTotal || sum))
                : fallbackOldSum;
              const hasDiscount = oldSum > sum;
              const discountPercent = lineState
                ? Math.max(0, Number(lineState.discountPercent || 0))
                : (hasDiscount && oldSum > 0
                  ? Math.max(1, Math.round(((oldSum - sum) / oldSum) * 100))
                  : 0);
              const titleBase = String(item?.name || (type === "combo" ? "РљРѕРјР±Рѕ" : "РўРѕРІР°СЂ"));
              const title = isGiftReward ? `${titleBase} (Подарок)` : titleBase;
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
                const removeBtn = !isGiftReward && (canRemoveProductRow || canRemoveComboSection)
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
                const optionIcon = row.rowKind === "option" && !isGiftReward
                  ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="РћРїС†РёРё С‚РѕРІР°СЂР°"><i class="fas fa-sliders-h"></i></button>`
                  : "";
                const productOptionIcon = row.rowKind === "product" && row.hasOptions && !isGiftReward
                  ? `<button type="button" class="new-order-right-cart-variant-chip new-order-right-cart-variant-option-icon" data-action="right-cart-open-product" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-product-id="${Number(item?.product_id || 0)}" title="РћРїС†РёРё С‚РѕРІР°СЂР°"><i class="fas fa-sliders-h"></i></button>`
                  : "";
                const chips = row.variantValues.length > 1 && !isGiftReward
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
                const optionQtyControls = row.rowKind === "option" && row.showQtyControls && !isGiftReward
                  ? `
                    <div class="new-order-right-cart-ing-controls">
                      <button type="button" class="new-order-right-cart-ing-btn${row.canMinus ? "" : " is-disabled"}" data-action="right-cart-option-qty-minus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">−</button>
                      <span class="new-order-right-cart-ing-qty">${Number(row.optionQty || 0)}</span>
                      <button type="button" class="new-order-right-cart-ing-btn${row.canPlus ? "" : " is-disabled"}" data-action="right-cart-option-qty-plus" data-order-id="${Number(active?.id || 0)}" data-cart-item-id="${Number(item?.id || 0)}" data-option-index="${Number(row.optionIndex || 0)}">+</button>
                    </div>
                  `
                  : "";
                const optionRemoveBtn = row.rowKind === "option" && !isGiftReward
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
                        if (isGiftReward) {
                          return `
                            <div class="new-order-right-cart-ing-row">
                              <div class="new-order-right-cart-ing-qty">${escapeHtml(String(qty))}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</div>
                              <div class="new-order-right-cart-ing-name" title="${escapeHtml(ingName)}">${escapeHtml(ingName)}</div>
                            </div>
                          `;
                        }
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
                const productControlsRow = row.rowKind !== "option" && row.variantValues.length <= 1 && !isGiftReward && (removeBtn || productOptionIcon)
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
                    ${isGiftReward ? "" : `
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
                    `}
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
                    ${!isGiftReward && qty > 1 ? `
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
                    ${isGiftReward ? `
                    <div class="qty-pill qty-pill--muted new-order-right-cart-qty is-disabled" data-qty-wrap>
                      <span class="qty-pill__center" data-qty-value>${qty}</span>
                    </div>
                    ` : `
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
                    `}
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
      rightFooterEl.classList.remove("hidden");
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
      editCartTouched: false,
      storeId: Number(opts?.storeId || 0) > 0 ? Number(opts.storeId) : null,
      editPricingSnapshot: null,
      editPricingBaselineSignature: "",
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
        promo_code: null,
        selected_discount_id: null,
        selected_discount_source: null,
        selected_promo_source: null,
        selected_promo_reward_id: null,
        benefits_preview_mode: null,
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
    form.promo_code = String(form.promo_code || "").trim() || null;
    form.selected_discount_id = Number(form.selected_discount_id || 0) > 0 ? Number(form.selected_discount_id) : null;
    form.selected_discount_source = ["discount", "reward_discount"].includes(String(form.selected_discount_source || "").trim())
      ? String(form.selected_discount_source || "").trim()
      : null;
    form.selected_promo_source = ["promo_code", "reward_promo"].includes(String(form.selected_promo_source || "").trim())
      ? String(form.selected_promo_source || "").trim()
      : null;
    form.selected_promo_reward_id = Number(form.selected_promo_reward_id || 0) > 0 ? Number(form.selected_promo_reward_id) : null;
    form.benefits_preview_mode = String(form.benefits_preview_mode || "").trim()
      ? normalizeRightOrderBenefitsMode(form.benefits_preview_mode)
      : null;
    return {
      ...base,
      ...src,
      id: Number(src?.id || base.id),
      title: String(src?.title || base.title || "").trim() || base.title,
      mode: base.mode,
      editOrderId: base.editOrderId,
      editCartTouched: src?.editCartTouched === true,
      storeId: Number(src?.storeId || base.storeId || 0) > 0 ? Number(src?.storeId || base.storeId) : null,
      editPricingSnapshot: src?.editPricingSnapshot && typeof src.editPricingSnapshot === "object"
        ? src.editPricingSnapshot
        : null,
      editPricingBaselineSignature: String(src?.editPricingBaselineSignature || "").trim(),
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

  function normalizeRightPaymentTypeRef(item) {
    return {
      id: Number(item?.id || 0),
      code: String(item?.code || "").trim(),
      title: String(item?.title || "").trim(),
      is_active: Number(item?.is_active ?? 1),
      sort: Number(item?.sort || 0),
    };
  }

  function normalizeRightTimeOptionRef(item) {
    return {
      id: Number(item?.id || 0),
      code: String(item?.code || "").trim(),
      title: String(item?.title || "").trim(),
      is_active: Number(item?.is_active ?? 1),
      sort: Number(item?.sort || 0),
      has_time_window: Number(item?.has_time_window || 0),
      starts_at: String(item?.starts_at || "").trim(),
      ends_at: String(item?.ends_at || "").trim(),
      step_minutes: Number(item?.step_minutes || 30),
      lead_minutes: Number(item?.lead_minutes || 0),
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
        .map(normalizeRightPaymentTypeRef)
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
        .map(normalizeRightTimeOptionRef)
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
          <span>\u041f\u043d</span><span>\u0412\u0442</span><span>\u0421\u0440</span><span>\u0427\u0442</span><span>\u041f\u0442</span><span>\u0421\u0431</span><span>\u0412\u0441</span>
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

  function normalizeRightDeliveryQuote(source) {
    const src = source && typeof source === "object" ? source : {};
    const normalizeMoney = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? Math.max(0, roundPrice(numeric)) : 0;
    };
    const normalizePositive = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
    };
    const freeRaw = Number(src?.free_delivery_from);
    return {
      source: String(src?.source || "default").trim() || "default",
      has_settings: src?.has_settings === false ? false : true,
      delivery_cost: normalizeMoney(src?.delivery_cost),
      min_order_amount: normalizeMoney(src?.min_order_amount),
      free_delivery_from: Number.isFinite(freeRaw) && freeRaw > 0 ? roundPrice(freeRaw) : null,
      eta_minutes: normalizePositive(src?.eta_minutes),
      delivery_zone_id: normalizePositive(src?.delivery_zone_id),
      delivery_zone_name: String(src?.delivery_zone_name || "").trim() || null,
      delivery_store_id: normalizePositive(src?.delivery_store_id),
    };
  }

  function clearRightDeliveryQuote(orderId, requestKey = null, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const hadQuote = state.rightDeliveryQuoteByOrder.has(id);
    state.rightDeliveryQuoteByOrder.delete(id);
    state.rightDeliveryQuoteLoadingByOrder.delete(id);
    if (requestKey == null) {
      state.rightDeliveryQuoteKeyByOrder.delete(id);
    } else {
      state.rightDeliveryQuoteKeyByOrder.set(id, String(requestKey));
    }
    if (opts?.render && hadQuote) queueRenderRightOrderTabs();
  }

  function getRightOrderQuoteStoreId(order) {
    const explicitStoreId = Number(order?.storeId || 0);
    if (Number.isFinite(explicitStoreId) && explicitStoreId > 0) return explicitStoreId;
    return 0;
  }

  function getRightOrderStoredAddressDraft(orderId, order = null) {
    const id = Number(orderId || 0);
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    if (state.rightAddressDraftByOrder.has(id)) {
      return normalizeRightAddressDraft(state.rightAddressDraftByOrder.get(id), getDefaultRightAddressCity());
    }
    if (form.deliveryAddressDraft && typeof form.deliveryAddressDraft === "object") {
      return normalizeRightAddressDraft(form.deliveryAddressDraft, getDefaultRightAddressCity());
    }
    const selectedId = Number(state.rightAddressSelectedIdByOrder.get(id) || form.deliveryAddressId || 0);
    if (selectedId > 0) {
      const rows = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];
      const selectedRow = rows.find((row) => Number(row?.id || 0) === selectedId) || null;
      if (selectedRow) {
        return getAddressDraftFromClientAddress(selectedRow, getDefaultRightAddressCity());
      }
    }
    return null;
  }

  function hasRightOrderQuoteAddressData(draft) {
    const next = normalizeRightAddressDraft(draft, getDefaultRightAddressCity());
    return Boolean(
      next.city
      && (
        next.address_normalized_display
        || next.street
        || next.house
        || next.address_ref
        || (next.lat != null && next.lng != null)
      )
    );
  }

  function buildRightOrderQuoteAddress(draft) {
    const next = normalizeRightAddressDraft(draft, getDefaultRightAddressCity());
    if (!hasRightOrderQuoteAddressData(next)) return null;
    return {
      city: next.city || null,
      street: next.street || null,
      house: next.house || null,
      entrance: next.entrance || null,
      floor: next.floor || null,
      apartment: next.apartment || null,
      comment: next.comment || null,
      address_ref: next.address_ref || null,
      selected_object_type: next.selected_object_type || null,
      resolved_city_source_key: next.resolved_city_source_key || null,
      address_context_locality: next.address_context_locality || null,
      address_normalized_display: next.address_normalized_display || null,
      lat: next.lat,
      lng: next.lng,
      delivery_zone_id: next.delivery_zone_id,
      delivery_store_id: next.delivery_store_id,
    };
  }

  function buildRightOrderEditPricingSignature(order, opts = {}) {
    const targetOrder = order && typeof order === "object" ? order : {};
    const form = targetOrder.form && typeof targetOrder.form === "object"
      ? targetOrder.form
      : (opts?.form && typeof opts.form === "object" ? opts.form : {});
    const orderId = Number(targetOrder?.id || opts?.orderId || 0);
    const explicitSelectedAddressId = Object.prototype.hasOwnProperty.call(opts || {}, "selectedAddressId")
      ? Number(opts?.selectedAddressId || 0)
      : Number(state.rightAddressSelectedIdByOrder.get(orderId) || form.deliveryAddressId || 0);
    const addressDraft = Object.prototype.hasOwnProperty.call(opts || {}, "addressDraft")
      ? opts?.addressDraft
      : getRightOrderStoredAddressDraft(orderId, targetOrder);
    const quoteAddress = buildRightOrderQuoteAddress(addressDraft);
    return JSON.stringify({
      clientId: Number(form.clientId || 0) || 0,
      phone: normalizePhoneRu(form.phone),
      pickupMethod: String(form.pickupMethod || "").trim() || "delivery",
      selectedAddressId: explicitSelectedAddressId > 0 ? explicitSelectedAddressId : 0,
      address: quoteAddress,
      cookWhen: String(form.cookWhen || "").trim() || "asap",
      scheduledDate: String(form.scheduledDate || "").trim() || "",
      dateTime: String(form.dateTime || "").trim() || "",
      promoCode: normalizeRightOrderBenefitsPromoCode(form.promo_code),
      selectedDiscountId: normalizeRightOrderBenefitsSelectedId(form.selected_discount_id),
      selectedDiscountSource: normalizeRightOrderBenefitsDiscountSource(form.selected_discount_source),
      selectedPromoSource: normalizeRightOrderBenefitsPromoSource(form.selected_promo_source),
      selectedPromoRewardId: normalizeRightOrderBenefitsSelectedId(form.selected_promo_reward_id),
      benefitsPreviewMode: String(form.benefits_preview_mode || "").trim()
        ? normalizeRightOrderBenefitsMode(form.benefits_preview_mode)
        : null,
      items: buildRightOrderPayloadItems(Array.isArray(form.cartItems) ? form.cartItems : []),
    });
  }

  function buildRightOrderStoredPricingSnapshot(order) {
    const src = order && typeof order === "object" ? order : {};
    const deliveryCost = roundPrice(Math.max(0, Number(src?.delivery_cost || 0)));
    const totalPriceRaw = Number(src?.total_price || 0);
    const payableTotal = Number.isFinite(totalPriceRaw)
      ? roundPrice(Math.max(0, totalPriceRaw))
      : NaN;
    const breakdown = buildRightOrderDiscountBreakdownEntries(src?.discounts_json, {
      promoCode: src?.promo_code,
    });
    const breakdownTotal = roundPrice(
      (Array.isArray(breakdown) ? breakdown : []).reduce((sum, entry) => (
        sum + Number(entry?.amount || 0)
      ), 0)
    );
    const storedDiscount = roundPrice(Math.max(0, Number(src?.discount_amount || 0)));
    const totalDiscount = roundPrice(
      breakdown.length > 0 ? breakdownTotal : storedDiscount
    );
    const itemsTotalRaw = Number(src?.items_total);
    const hasItemsTotal = Number.isFinite(itemsTotalRaw);
    const itemsTotal = hasItemsTotal ? roundPrice(Math.max(0, itemsTotalRaw)) : NaN;
    const subtotalAfterDiscount = Number.isFinite(payableTotal)
      ? roundPrice(Math.max(0, payableTotal - deliveryCost))
      : (
          hasItemsTotal
            ? roundPrice(Math.max(0, itemsTotal - totalDiscount))
            : 0
        );
    const computedSubtotalBeforeDiscount = roundPrice(Math.max(0, subtotalAfterDiscount + totalDiscount));
    let subtotalBeforeDiscount = computedSubtotalBeforeDiscount;
    if (hasItemsTotal) {
      const itemsAsBeforeDiscount = itemsTotal;
      const itemsAsAfterDiscount = roundPrice(itemsTotal + totalDiscount);
      const deltaAsBefore = Math.abs(itemsAsBeforeDiscount - computedSubtotalBeforeDiscount);
      const deltaAsAfter = Math.abs(itemsAsAfterDiscount - computedSubtotalBeforeDiscount);
      subtotalBeforeDiscount = deltaAsAfter < deltaAsBefore
        ? itemsAsAfterDiscount
        : itemsAsBeforeDiscount;
      if (subtotalBeforeDiscount < computedSubtotalBeforeDiscount) {
        subtotalBeforeDiscount = computedSubtotalBeforeDiscount;
      }
    }
    const resolvedPayableTotal = Number.isFinite(payableTotal)
      ? payableTotal
      : roundPrice(subtotalAfterDiscount + deliveryCost);
    const hasSnapshot = breakdown.length > 0
      || subtotalBeforeDiscount > 0
      || totalDiscount > 0
      || deliveryCost > 0
      || resolvedPayableTotal > 0;
    if (!hasSnapshot) return null;
    return {
      subtotalBeforeDiscount,
      totalDiscount,
      subtotalAfterDiscount,
      deliveryCost,
      payableTotal: resolvedPayableTotal,
      breakdown,
    };
  }

  function getRightOrderActiveEditPricingSnapshot(order) {
    if (String(order?.mode || "").trim().toLowerCase() !== "edit") return null;
    const snapshot = order?.editPricingSnapshot && typeof order.editPricingSnapshot === "object"
      ? order.editPricingSnapshot
      : null;
    const baselineSignature = String(order?.editPricingBaselineSignature || "").trim();
    if (!snapshot || !baselineSignature) return null;
    const currentSignature = buildRightOrderEditPricingSignature(order);
    return currentSignature === baselineSignature ? snapshot : null;
  }

  function buildRightOrderDeliveryQuoteRequest(order, summary) {
    const orderId = Number(order?.id || 0);
    if (!(orderId > 0)) return null;
    const methodCode = String(summary?.methodCode || order?.form?.pickupMethod || "").trim();
    if (!isDeliveryMethodCode(methodCode)) {
      return {
        orderId,
        key: `pickup:${methodCode}`,
        address: null,
        headers: null,
        subtotal: Number(summary?.subtotalAfterCustomerDiscount || 0) || 0,
      };
    }
    const addressDraft = getRightOrderStoredAddressDraft(orderId, order);
    const address = buildRightOrderQuoteAddress(addressDraft);
    const storeId = getRightOrderQuoteStoreId(order);
    const key = JSON.stringify({
      storeId: storeId > 0 ? storeId : 0,
      methodCode,
      subtotal: roundPrice(Number(summary?.subtotalAfterCustomerDiscount || 0) || 0),
      address,
    });
    return {
      orderId,
      key,
      address,
      subtotal: roundPrice(Number(summary?.subtotalAfterCustomerDiscount || 0) || 0),
      headers: storeId > 0 ? { "x-store-id": String(storeId) } : undefined,
    };
  }

  async function ensureRightDeliveryQuoteFresh(order, summary, opts = {}) {
    const request = buildRightOrderDeliveryQuoteRequest(order, summary);
    const orderId = Number(request?.orderId || order?.id || 0);
    if (!(orderId > 0) || !request) return null;

    if (!request.address) {
      const previousKey = state.rightDeliveryQuoteKeyByOrder.get(orderId);
      if (previousKey !== request.key || state.rightDeliveryQuoteByOrder.has(orderId)) {
        clearRightDeliveryQuote(orderId, request.key, { render: Boolean(opts?.render) });
      } else {
        state.rightDeliveryQuoteLoadingByOrder.delete(orderId);
      }
      return null;
    }

    const previousKey = state.rightDeliveryQuoteKeyByOrder.get(orderId);
    const hasCached = state.rightDeliveryQuoteByOrder.has(orderId);
    const isLoading = state.rightDeliveryQuoteLoadingByOrder.has(orderId);
    if (!opts?.force && previousKey === request.key && (hasCached || isLoading)) {
      return hasCached ? state.rightDeliveryQuoteByOrder.get(orderId) || null : null;
    }

    if (previousKey !== request.key || !hasCached) {
      state.rightDeliveryQuoteByOrder.delete(orderId);
      state.rightDeliveryQuoteKeyByOrder.set(orderId, request.key);
      if (previousKey !== request.key && opts?.render) {
        queueRenderRightOrderTabs();
      }
    }

    const requestSeq = Number(state.rightDeliveryQuoteReqSeqByOrder.get(orderId) || 0) + 1;
    state.rightDeliveryQuoteReqSeqByOrder.set(orderId, requestSeq);
    state.rightDeliveryQuoteLoadingByOrder.add(orderId);

    try {
      const json = await apiJson("/api/public/delivery-quote", {
        method: "POST",
        headers: request.headers,
        body: JSON.stringify({
          subtotal: request.subtotal,
          address: request.address,
        }),
      });
      if (Number(state.rightDeliveryQuoteReqSeqByOrder.get(orderId) || 0) !== requestSeq) return null;
      const quote = normalizeRightDeliveryQuote(json?.data || null);
      state.rightDeliveryQuoteByOrder.set(orderId, quote);
      state.rightDeliveryQuoteKeyByOrder.set(orderId, request.key);
      state.rightDeliveryQuoteLoadingByOrder.delete(orderId);
      if (opts?.render) {
        const isActive = Number(state.rightActiveOrderId || 0) === orderId;
        if (isActive) queueRenderRightOrderTabs();
      }
      return quote;
    } catch {
      if (Number(state.rightDeliveryQuoteReqSeqByOrder.get(orderId) || 0) !== requestSeq) return null;
      clearRightDeliveryQuote(orderId, request.key, { render: Boolean(opts?.render) });
      return null;
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
      if (isGiftRewardCartItem(item)) return sum;
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
      if (isGiftRewardCartItem(item)) return sum;
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

  function isGiftRewardCartItem(item) {
    return Number(item?.is_gift_reward || 0) === 1;
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

  function normalizeRightOrderCartItemsWithAutoAdd(orderId, cartItemsRaw, opts = {}) {
    const orderNum = Number(orderId || 0);
    const source = Array.isArray(cartItemsRaw) ? cartItemsRaw : [];
    const preserveStoredLineTotals = opts?.preserveStoredLineTotals === true;
    if (preserveStoredLineTotals) {
      const preservedItems = source
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const qty = Math.max(0, Number(item?.qty || 0));
          if (!(qty > 0)) return null;
          return { ...item, qty };
        })
        .filter(Boolean);
      const sortedPreservedItems = preservedItems
        .map((item, index) => ({
          item,
          index,
          autoRank: isRightOrderAutoAddItem(item) ? 1 : 0,
        }))
        .sort((a, b) => a.autoRank - b.autoRank || a.index - b.index)
        .map((entry) => entry.item);
      clearRightAutoAddDismissedIfCartEmpty(orderNum, preservedItems);
      return sortedPreservedItems;
    }
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
      if (isGiftRewardCartItem(item)) return false;
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
    const shouldMarkTouched = String(order?.mode || "").trim().toLowerCase() === "edit";
    state.rightOrders[index] = {
      ...order,
      form,
      editCartTouched: shouldMarkTouched ? true : Boolean(order?.editCartTouched),
    };
    invalidateRightDeliveryQuote(id);
    scheduleRightOrderBenefitsRefresh(id);
    if (opts?.render) renderRightOrderTabs();
    return true;
  }

  function cloneRightOrderBenefitsPreviewData(source) {
    return source && typeof source === "object"
      ? deepCloneJson(source, null)
      : null;
  }

  function normalizeRightOrderBenefitsDiscountSource(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "discount" || raw === "reward_discount" ? raw : null;
  }

  function normalizeRightOrderBenefitsPromoSource(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw === "promo_code" || raw === "reward_promo" ? raw : null;
  }

  function normalizeRightOrderBenefitsPromoCode(value) {
    const raw = String(value || "").toUpperCase().trim();
    return raw || null;
  }

  function normalizeRightOrderBenefitsSelectedId(value) {
    const id = Number(value || 0);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  function normalizeRightOrderBenefitsMode(value) {
    return String(value || "").trim().toLowerCase() === "all" ? "all" : "customer";
  }

  function getActiveRightOrderBenefitsMode() {
    return normalizeRightOrderBenefitsMode(state.benefitsModal.mode);
  }

  function getRightOrderBenefitsCacheSlot(orderId, mode = null) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return "";
    return `${id}:${normalizeRightOrderBenefitsMode(mode)}`;
  }

  function getRightOrderBenefitsClientCacheSlot(clientId, mode = null) {
    const id = Number(clientId || 0);
    if (!(id > 0)) return "";
    return `${id}:${normalizeRightOrderBenefitsMode(mode)}`;
  }

  function getRightOrderBenefitsPreferredMode(form, fallbackMode = null) {
    const sourceForm = form && typeof form === "object" ? form : {};
    const storedMode = String(sourceForm.benefits_preview_mode || "").trim();
    if (storedMode) return normalizeRightOrderBenefitsMode(storedMode);
    if (fallbackMode != null) return normalizeRightOrderBenefitsMode(fallbackMode);
    return getActiveRightOrderBenefitsMode();
  }

  function setRightBenefitsModeToggleState(mode = null) {
    window.AdminBenefitsModal?.setModeToggleState(normalizeRightOrderBenefitsMode(mode || getActiveRightOrderBenefitsMode()));
  }

  function isRightOrderBenefitStackable(entry) {
    return entry?.is_stackable === true || Number(entry?.is_stackable || 0) === 1;
  }

  function isRightOrderBenefitSelectable(entry) {
    const disabledReasonCode = String(entry?.disabled_reason_code || "").trim().toUpperCase();
    if (!disabledReasonCode) return true;
    const source = String(entry?.source || "").trim().toLowerCase();
    if ((source === "promo_code" || source === "reward_promo") && disabledReasonCode === "PROMO_NOT_APPLICABLE") {
      return false;
    }
    return ![
      "DISCOUNT_INVALID",
      "DISCOUNT_NOT_AVAILABLE",
      "DISCOUNT_CUSTOMER_LIMIT_REACHED",
      "PROMO_INVALID",
      "PROMO_NOT_AVAILABLE",
      "PROMO_LIMIT_REACHED",
      "PROMO_CUSTOMER_LIMIT_REACHED",
    ].includes(disabledReasonCode);
  }

  function getRightOrderBenefitsActionErrorMessage(err) {
    switch (String(err?.message || "").trim()) {
      case "PROMO_CODE_REQUIRED":
        return "Введите промокод.";
      case "PROMO_INVALID":
        return "Промокод уже недоступен.";
      case "PROMO_NOT_AVAILABLE":
        return "Этот промокод сейчас недоступен.";
      case "PROMO_NOT_APPLICABLE":
        return "Промокод не подходит к текущему заказу.";
      case "PROMO_LIMIT_REACHED":
        return "Лимит использования промокода исчерпан.";
      case "PROMO_CUSTOMER_LIMIT_REACHED":
        return "Этот промокод уже использован.";
      case "DISCOUNT_NOT_APPLICABLE":
        return "Награду пока нельзя забрать.";
      case "DISCOUNT_NOT_AVAILABLE":
        return "Акция сейчас недоступна.";
      case "DISCOUNT_CUSTOMER_LIMIT_REACHED":
        return "Эта скидка уже использована.";
      case "DISCOUNT_INVALID":
        return "Акция больше не найдена.";
      case "REWARD_INVALID":
        return "Подарок уже недоступен.";
      case "REWARD_NOT_APPLICABLE":
        return "Этот подарок пока нельзя получить.";
      default:
        return "Не удалось обновить выгоды.";
    }
  }

  function getRightOrderBenefitsSelectionState(form) {
    const sourceForm = form && typeof form === "object" ? form : {};
    return {
      promoCode: normalizeRightOrderBenefitsPromoCode(sourceForm.promo_code),
      selectedDiscountId: normalizeRightOrderBenefitsSelectedId(sourceForm.selected_discount_id),
      selectedDiscountSource: normalizeRightOrderBenefitsDiscountSource(sourceForm.selected_discount_source),
      selectedPromoSource: normalizeRightOrderBenefitsPromoSource(sourceForm.selected_promo_source),
      selectedPromoRewardId: normalizeRightOrderBenefitsSelectedId(sourceForm.selected_promo_reward_id),
    };
  }

  function hasRightOrderBenefitsSelection(form) {
    const selection = getRightOrderBenefitsSelectionState(form);
    return Boolean(
      selection.promoCode
      || selection.selectedDiscountId
      || selection.selectedPromoRewardId
    );
  }

  function buildRightOrderBenefitsSelectionStateKey({ discountKey = "", promoKey = "" } = {}) {
    const normalizedDiscountKey = String(discountKey || "").trim();
    const normalizedPromoKey = String(promoKey || "").trim();
    if (!normalizedDiscountKey && !normalizedPromoKey) return "__base__";
    if (normalizedDiscountKey && normalizedPromoKey) return `${normalizedDiscountKey}|${normalizedPromoKey}`;
    return normalizedDiscountKey || normalizedPromoKey || "__base__";
  }

  function buildRightOrderBenefitDiscountSelectionKey(entry) {
    const source = normalizeRightOrderBenefitsDiscountSource(entry?.source) || "discount";
    const id = normalizeRightOrderBenefitsSelectedId(
      source === "reward_discount"
        ? (entry?.reward_id || entry?.id)
        : entry?.id
    );
    return source && id ? `${source}:${id}` : "";
  }

  function buildRightOrderBenefitPromoSelectionKey(entry) {
    const source = normalizeRightOrderBenefitsPromoSource(entry?.source) || "promo_code";
    if (source === "reward_promo") {
      const rewardId = normalizeRightOrderBenefitsSelectedId(entry?.reward_id || entry?.id);
      return rewardId ? `${source}:${rewardId}` : "";
    }
    const promoId = normalizeRightOrderBenefitsSelectedId(entry?.id);
    return promoId ? `${source}:${promoId}` : "";
  }

  function buildRightOrderBenefitsLocalDiscountKey(selectedDiscountSource, selectedDiscountId) {
    const source = normalizeRightOrderBenefitsDiscountSource(selectedDiscountSource);
    const id = normalizeRightOrderBenefitsSelectedId(selectedDiscountId);
    return source && id ? `${source}:${id}` : "";
  }

  function buildRightOrderBenefitsLocalPromoKey(previewData, {
    promoCode,
    selectedPromoSource,
    selectedPromoRewardId,
  } = {}) {
    const source = normalizeRightOrderBenefitsPromoSource(selectedPromoSource);
    if (!source) return "";
    if (source === "reward_promo") {
      const rewardId = normalizeRightOrderBenefitsSelectedId(selectedPromoRewardId);
      return rewardId ? `${source}:${rewardId}` : "";
    }
    const normalizedCode = normalizeRightOrderBenefitsPromoCode(promoCode);
    if (!normalizedCode) return "";
    const promoCodeIndex = previewData?.client_calculation?.promo_code_index && typeof previewData.client_calculation.promo_code_index === "object"
      ? previewData.client_calculation.promo_code_index
      : null;
    const indexedSelectionKey = String(promoCodeIndex?.[normalizedCode] || "").trim();
    if (indexedSelectionKey) return indexedSelectionKey;
    const promoCard = Array.isArray(previewData?.promo_codes)
      ? previewData.promo_codes.find((entry) => (
          (normalizeRightOrderBenefitsPromoSource(entry?.source) || "promo_code") === source
          && normalizeRightOrderBenefitsPromoCode(entry?.code) === normalizedCode
        ))
      : null;
    const promoId = normalizeRightOrderBenefitsSelectedId(promoCard?.id);
    return promoId ? `${source}:${promoId}` : "";
  }

  function cloneRightOrderBenefitsSummary(summary) {
    const safeSummary = summary && typeof summary === "object" ? summary : {};
    return {
      subtotal: roundPrice(Number(safeSummary?.subtotal || 0)),
      items_total: roundPrice(Number(safeSummary?.items_total || 0)),
      delivery: roundPrice(Number(safeSummary?.delivery || 0)),
      discount_total: roundPrice(Number(safeSummary?.discount_total || 0)),
      total: roundPrice(Number(safeSummary?.total || 0)),
      discount_breakdown: Array.isArray(safeSummary?.discount_breakdown)
        ? safeSummary.discount_breakdown.map((entry) => ({
            key: String(entry?.key || "").trim(),
            title: String(entry?.title || "").trim(),
            amount: roundPrice(Number(entry?.amount || 0)),
            source_kind: normalizeRightOrderDiscountBreakdownSourceKind(entry),
            promo_code: normalizeRightOrderBenefitsPromoCode(entry?.promoCode || entry?.promo_code),
          }))
        : [],
    };
  }

  function buildRightOrderBenefitsLocalPreviewItems(previewRequest = null) {
    const sourceItems = Array.isArray(previewRequest?.items) ? previewRequest.items : [];
    const useOriginalLineTotalsForBenefits = (
      previewRequest?.use_original_line_totals_for_benefits === true
      || Number(previewRequest?.use_original_line_totals_for_benefits || 0) === 1
    );
    return sourceItems
      .map((rawItem) => {
        if (!rawItem || typeof rawItem !== "object") return null;
        const type = String(rawItem?.type || "").trim().toLowerCase() || "product";
        const qty = Math.max(1, Number(rawItem?.qty || 1) || 1);
        const lineTotalRaw = roundPrice(Math.max(0, Number(rawItem?.line_total || 0) || 0));
        const originalLineTotal = roundPrice(Math.max(
          lineTotalRaw,
          Number(rawItem?.original_line_total ?? rawItem?.old_line_total ?? rawItem?.discount?.original_line_total ?? lineTotalRaw) || lineTotalRaw
        ));
        const lineTotal = useOriginalLineTotalsForBenefits ? originalLineTotal : lineTotalRaw;
        if (type === "combo") {
          const comboId = Number(rawItem?.combo_id || 0) || null;
          if (!comboId) return null;
          const comboItem = {
            type: "combo",
            cart_key: String(rawItem?.cart_key || "").trim() || "",
            combo_id: comboId,
            qty,
            line_total: lineTotal,
            auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
          };
          if (!useOriginalLineTotalsForBenefits && originalLineTotal > lineTotal) {
            comboItem.discount = { original_line_total: originalLineTotal };
          }
          return comboItem;
        }
        const productId = Number(rawItem?.product_id || 0) || null;
        if (!productId) return null;
        const variantGroupId = Number(rawItem?.variant_group_id || 0);
        const variantValueIndex = Number(rawItem?.variant_value_index);
        const optionItems = (Array.isArray(rawItem?.option_items) ? rawItem.option_items : [])
          .map((option) => {
            const optionId = Number(option?.id || option?.option_item_id || 0);
            if (!(optionId > 0)) return null;
            const optionQty = Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1);
            const targetProductId = Number(option?.target_product_id || option?.product_id || 0);
            const optionVariantGroupId = Number(option?.variant_group_id || 0);
            const optionVariantValueIndex = Number(option?.variant_value_index);
            return {
              id: optionId,
              qty: optionQty,
              target_product_id: targetProductId > 0 ? targetProductId : null,
              variant_group_id: optionVariantGroupId > 0 ? optionVariantGroupId : null,
              variant_value_index: Number.isFinite(optionVariantValueIndex) && optionVariantValueIndex >= 0
                ? optionVariantValueIndex
                : null,
            };
          })
          .filter(Boolean);
        const ingredients = (Array.isArray(rawItem?.ingredients) ? rawItem.ingredients : [])
          .map((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || ingredient?.product_id || 0);
            if (!(ingredientId > 0)) return null;
            return {
              ingredient_id: ingredientId,
              qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
            };
          })
          .filter(Boolean);
        const productItem = {
          type: "product",
          cart_key: String(rawItem?.cart_key || "").trim() || "",
          product_id: productId,
          qty,
          line_total: lineTotal,
          auto_add: Number(rawItem?.auto_add || 0) === 1 ? 1 : 0,
          variant_group_id: variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
            ? variantValueIndex
            : null,
          option_items: optionItems,
          ingredients,
        };
        productItem.product_config = normalizeRightOrderBenefitProductConfig(
          rawItem?.product_config || {
            product_id: productId,
            variant_group_id: productItem.variant_group_id,
            variant_value_index: productItem.variant_value_index,
            options: optionItems,
            ingredients,
          },
          productId
        );
        if (!useOriginalLineTotalsForBenefits && originalLineTotal > lineTotal) {
          productItem.discount = { original_line_total: originalLineTotal };
        }
        return productItem;
      })
      .filter(Boolean);
  }

  function buildRightOrderBenefitsLocalProductCategoriesMap(order, previewItems = []) {
    const result = new Map();
    const addCategory = (productId, categoryId) => {
      const normalizedProductId = Number(productId || 0) || 0;
      const normalizedCategoryId = Number(categoryId || 0) || 0;
      if (!(normalizedProductId > 0) || !(normalizedCategoryId > 0)) return;
      if (!result.has(normalizedProductId)) {
        result.set(normalizedProductId, new Set());
      }
      result.get(normalizedProductId).add(normalizedCategoryId);
    };

    const formItems = Array.isArray(order?.form?.cartItems) ? order.form.cartItems : [];
    formItems.forEach((item) => {
      if (!item || item?.type === "combo") return;
      const productId = Number(item?.product?.id || item?.product_id || 0) || 0;
      if (!(productId > 0)) return;
      const product = item?.product || {};
      addCategory(productId, product?.category_id);
      addCategory(productId, product?.categoryId);
      (Array.isArray(product?.category_ids) ? product.category_ids : []).forEach((categoryId) => {
        addCategory(productId, categoryId);
      });
      (Array.isArray(product?.categories) ? product.categories : []).forEach((category) => {
        addCategory(productId, category?.id || category?.category_id || category);
      });
    });

    const currentProducts = Array.isArray(state.currentProducts) ? state.currentProducts : [];
    const currentProductsById = new Map(
      currentProducts
        .map((product) => [Number(product?.id || product?.product_id || 0), product])
        .filter(([productId]) => productId > 0)
    );

    (Array.isArray(previewItems) ? previewItems : []).forEach((item) => {
      if (!item || item?.type === "combo") return;
      const productId = Number(item?.product_id || 0) || 0;
      if (!(productId > 0)) return;
      const product = currentProductsById.get(productId) || null;
      addCategory(productId, product?.category_id);
      addCategory(productId, product?.categoryId);
      (Array.isArray(product?.category_ids) ? product.category_ids : []).forEach((categoryId) => {
        addCategory(productId, categoryId);
      });
      (Array.isArray(product?.categories) ? product.categories : []).forEach((category) => {
        addCategory(productId, category?.id || category?.category_id || category);
      });
    });

    return new Map(
      Array.from(result.entries()).map(([productId, categoryIds]) => [
        productId,
        Array.from(categoryIds.values()),
      ])
    );
  }

  function buildRightOrderBenefitsLocalProductConfigKey(value, fallbackProductId = null) {
    const normalized = normalizeRightOrderBenefitProductConfig(value, fallbackProductId);
    if (!normalized) return "";
    try {
      return JSON.stringify(normalized);
    } catch {
      return "";
    }
  }

  function buildRightOrderBenefitsLocalTargetSets(targetSets = null) {
    const safeTargetSets = targetSets && typeof targetSets === "object" ? targetSets : {};
    const exactProductConfigKeysByProductId = new Map();
    const exactProductConfigs = safeTargetSets.exact_product_configs_by_product_id && typeof safeTargetSets.exact_product_configs_by_product_id === "object"
      ? safeTargetSets.exact_product_configs_by_product_id
      : {};
    Object.entries(exactProductConfigs).forEach(([rawProductId, configs]) => {
      const productId = Number(rawProductId || 0) || 0;
      if (!(productId > 0)) return;
      const keys = new Set(
        (Array.isArray(configs) ? configs : [])
          .map((config) => buildRightOrderBenefitsLocalProductConfigKey(config, productId))
          .filter(Boolean)
      );
      if (keys.size) {
        exactProductConfigKeysByProductId.set(productId, keys);
      }
    });
    return {
      anyProductIds: new Set((Array.isArray(safeTargetSets.any_product_ids) ? safeTargetSets.any_product_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
      categoryIds: new Set((Array.isArray(safeTargetSets.category_ids) ? safeTargetSets.category_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
      comboIds: new Set((Array.isArray(safeTargetSets.combo_ids) ? safeTargetSets.combo_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0)),
      exactProductConfigKeysByProductId,
    };
  }

  function matchRightOrderBenefitsLocalTargetScope(targetSets, item, productCategoriesMap, scope = "product") {
    const normalizedScope = String(scope || "").trim().toLowerCase() || "product";
    const matchesProduct = (() => {
      if (!item || item?.type === "combo") return false;
      const productId = Number(item?.product_id || 0) || 0;
      if (!(productId > 0)) return false;
      if (targetSets?.anyProductIds?.has(productId)) return true;
      const exactConfigs = targetSets?.exactProductConfigKeysByProductId instanceof Map
        ? targetSets.exactProductConfigKeysByProductId.get(productId)
        : null;
      if (!exactConfigs || !exactConfigs.size) return false;
      const itemConfigKey = buildRightOrderBenefitsLocalProductConfigKey(
        item?.product_config || item,
        productId
      );
      return !!(itemConfigKey && exactConfigs.has(itemConfigKey));
    })();
    const matchesCategory = (() => {
      if (!item || item?.type === "combo") return false;
      const productId = Number(item?.product_id || 0) || 0;
      if (!(productId > 0)) return false;
      const categoryIds = productCategoriesMap.get(productId) || [];
      return categoryIds.some((categoryId) => targetSets?.categoryIds?.has(Number(categoryId || 0)));
    })();
    const matchesCombo = !!(item?.type === "combo" && targetSets?.comboIds?.has(Number(item?.combo_id || 0)));
    if (normalizedScope === "product") return matchesProduct;
    if (normalizedScope === "category") return matchesCategory;
    if (normalizedScope === "combo") return matchesCombo;
    return matchesProduct || matchesCategory || matchesCombo;
  }

  function calculateRightOrderBenefitsLocalDiscountAmount(price, discountType, discountValue, maxDiscountAmount = null) {
    const sourcePrice = Number(price || 0);
    if (!(sourcePrice > 0)) return 0;

    const normalizedType = String(discountType || "").trim().toLowerCase();
    const normalizedValue = Number(discountValue || 0);
    let amount = 0;

    if (normalizedType === "percent") {
      if (!(normalizedValue > 0)) return 0;
      amount = sourcePrice * (normalizedValue / 100);
    } else if (normalizedType === "fixed") {
      if (!(normalizedValue > 0)) return 0;
      amount = normalizedValue;
    } else if (normalizedType === "special_price") {
      amount = Math.max(0, sourcePrice - normalizedValue);
    } else {
      return 0;
    }

    const normalizedMaxDiscount = maxDiscountAmount != null ? Number(maxDiscountAmount || 0) : null;
    if (Number.isFinite(normalizedMaxDiscount) && normalizedMaxDiscount > 0) {
      amount = Math.min(amount, normalizedMaxDiscount);
    }
    amount = Math.min(amount, sourcePrice);
    return roundPrice(amount);
  }

  function getRightOrderPricePrecisionFactor() {
    const settings = getPriceRoundingSettings();
    const precisionRaw = Number(settings?.precision);
    const precision = Number.isFinite(precisionRaw) && precisionRaw > 0 ? Math.trunc(precisionRaw) : 0;
    return precision > 0 ? Math.pow(10, precision) : 1;
  }

  function toRightOrderPriceUnits(value, factor) {
    const normalizedFactor = Number(factor || 1) > 0 ? Number(factor || 1) : 1;
    const amount = roundPrice(Math.max(0, Number(value || 0)));
    return Math.max(0, Math.round(amount * normalizedFactor));
  }

  function fromRightOrderPriceUnits(units, factor) {
    const normalizedFactor = Number(factor || 1) > 0 ? Number(factor || 1) : 1;
    return roundPrice(Math.max(0, Number(units || 0)) / normalizedFactor);
  }

  function applyRightOrderLocalOrderDiscountAcrossItemsNoRemainder(items, discountAmount) {
    const workingItems = (Array.isArray(items) ? items : [])
      .map((item) => ({ ...item, discount: item?.discount ? { ...item.discount } : item?.discount }));
    const eligible = [];
    const precisionFactor = getRightOrderPricePrecisionFactor();
    let baseItemsTotalUnits = 0;

    workingItems.forEach((item, index) => {
      const lineTotal = roundPrice(Math.max(0, Number(item?.line_total || 0)));
      const lineTotalUnits = toRightOrderPriceUnits(lineTotal, precisionFactor);
      item.line_total = fromRightOrderPriceUnits(lineTotalUnits, precisionFactor);
      if (!(lineTotalUnits > 0)) return;
      eligible.push({
        index,
        lineTotalUnits,
        position: eligible.length,
      });
      baseItemsTotalUnits += lineTotalUnits;
    });

    const baseItemsTotal = fromRightOrderPriceUnits(baseItemsTotalUnits, precisionFactor);
    if (!(baseItemsTotalUnits > 0) || !eligible.length) {
      return {
        items: workingItems,
        discountAmount: 0,
        itemsTotalAfterDiscount: roundPrice(baseItemsTotal),
      };
    }

    const requestedDiscountUnits = toRightOrderPriceUnits(discountAmount, precisionFactor);
    const targetDiscountUnits = Math.min(requestedDiscountUnits, baseItemsTotalUnits);
    if (!(targetDiscountUnits > 0)) {
      return {
        items: workingItems,
        discountAmount: 0,
        itemsTotalAfterDiscount: roundPrice(baseItemsTotal),
      };
    }

    const allocations = eligible.map((entry) => {
      const lineUnits = Number(entry?.lineTotalUnits || 0);
      const proportionalUnits = (targetDiscountUnits * lineUnits) / baseItemsTotalUnits;
      const roundedDownUnits = Math.floor(proportionalUnits);
      const safeUnits = Math.min(lineUnits, Math.max(0, roundedDownUnits));
      return {
        ...entry,
        lineUnits,
        shareUnits: safeUnits,
        fractionalRemainder: proportionalUnits - roundedDownUnits,
      };
    });
    let appliedDiscountUnits = allocations.reduce((sum, entry) => sum + Number(entry?.shareUnits || 0), 0);
    let remainingDiscountUnits = Math.max(0, targetDiscountUnits - appliedDiscountUnits);
    if (remainingDiscountUnits > 0) {
      const sortedByRemainder = allocations.slice().sort((a, b) => (
        Number(b?.fractionalRemainder || 0) - Number(a?.fractionalRemainder || 0)
        || Number(b?.lineUnits || 0) - Number(a?.lineUnits || 0)
        || Number(a?.position || 0) - Number(b?.position || 0)
      ));
      while (remainingDiscountUnits > 0) {
        let progressed = false;
        for (const entry of sortedByRemainder) {
          const capUnits = Math.max(0, Number(entry?.lineUnits || 0) - Number(entry?.shareUnits || 0));
          if (!(capUnits > 0)) continue;
          entry.shareUnits += 1;
          remainingDiscountUnits -= 1;
          appliedDiscountUnits += 1;
          progressed = true;
          if (!(remainingDiscountUnits > 0)) break;
        }
        if (!progressed) break;
      }
    }

    allocations.forEach((entry) => {
      const lineUnits = Number(entry?.lineUnits || 0);
      const discountUnits = Math.min(lineUnits, Math.max(0, Number(entry?.shareUnits || 0)));
      const nextLineUnits = Math.max(0, lineUnits - discountUnits);
      workingItems[entry.index].line_total = fromRightOrderPriceUnits(nextLineUnits, precisionFactor);
    });

    const itemsTotalAfterDiscount = roundPrice(
      workingItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
    );

    return {
      items: workingItems,
      discountAmount: fromRightOrderPriceUnits(appliedDiscountUnits, precisionFactor),
      itemsTotalAfterDiscount,
    };
  }

  function buildRightOrderBenefitsDisabledReason(errorCode) {
    const normalized = String(errorCode || "").trim().toUpperCase();
    if (!normalized) return "";
    return getRightOrderBenefitsActionErrorMessage({ message: normalized });
  }

  function buildRightOrderBenefitsPromoMinAmountReason(minOrderAmount, itemsTotalBeforePromo) {
    const remainingAmount = roundPrice(Math.max(0, Number(minOrderAmount || 0) - Number(itemsTotalBeforePromo || 0)));
    if (!(remainingAmount > 0)) {
      return buildRightOrderBenefitsDisabledReason("PROMO_NOT_APPLICABLE");
    }
    return `Нужно еще ${toMoney(remainingAmount)} до применения.`;
  }

  function buildRightOrderBenefitsPromoNotApplicableOutcome(previewItems, itemsTotalBeforePromo, {
    disabledReasonCode = "PROMO_NOT_APPLICABLE",
    disabledReason = "",
  } = {}) {
    return {
      isApplicable: false,
      disabledReasonCode,
      disabledReason: disabledReason || buildRightOrderBenefitsDisabledReason(disabledReasonCode),
      discountAmount: 0,
      itemsTotalAfterPromo: roundPrice(Number(itemsTotalBeforePromo || 0)),
      items: previewItems.map((item) => ({ ...item, discount: item?.discount ? { ...item.discount } : item?.discount })),
    };
  }

  function computeRightOrderBenefitsLocalDiscountOutcome(rule, previewItems, productCategoriesMap) {
    const items = previewItems.map((item) => ({ ...item, discount: item?.discount ? { ...item.discount } : item?.discount }));
    const baseItemsTotal = roundPrice(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
    if (!rule) {
      return {
        isApplicable: false,
        errorCode: "DISCOUNT_INVALID",
        disabledReason: buildRightOrderBenefitsDisabledReason("DISCOUNT_INVALID"),
        discountAmount: 0,
        items,
        itemsTotalAfterDiscount: baseItemsTotal,
      };
    }
    if (rule?.server_locked) {
      const errorCode = String(rule?.server_disabled_reason_code || "DISCOUNT_NOT_AVAILABLE").trim().toUpperCase() || "DISCOUNT_NOT_AVAILABLE";
      return {
        isApplicable: false,
        errorCode,
        disabledReason: String(rule?.server_disabled_reason || "").trim() || buildRightOrderBenefitsDisabledReason(errorCode),
        discountAmount: 0,
        items,
        itemsTotalAfterDiscount: baseItemsTotal,
      };
    }

    const applyTo = String(rule?.apply_to || "").trim().toLowerCase() || "order";
    const minOrderAmount = rule?.min_order_amount != null ? Number(rule.min_order_amount || 0) : 0;
    if (applyTo === "order") {
      if (minOrderAmount > 0 && baseItemsTotal < minOrderAmount) {
        return {
          isApplicable: false,
          errorCode: "DISCOUNT_NOT_APPLICABLE",
          disabledReason: buildRightOrderBenefitsDisabledReason("DISCOUNT_NOT_APPLICABLE"),
          discountAmount: 0,
          items,
          itemsTotalAfterDiscount: baseItemsTotal,
        };
      }
      const orderDiscountAmount = calculateRightOrderBenefitsLocalDiscountAmount(
        baseItemsTotal,
        rule?.discount_type,
        rule?.discount_value,
        rule?.max_discount_amount
      );
      if (!(orderDiscountAmount > 0)) {
        return {
          isApplicable: false,
          errorCode: "DISCOUNT_NOT_APPLICABLE",
          disabledReason: buildRightOrderBenefitsDisabledReason("DISCOUNT_NOT_APPLICABLE"),
          discountAmount: 0,
          items,
          itemsTotalAfterDiscount: baseItemsTotal,
        };
      }
      const appliedOrderDiscount = applyRightOrderLocalOrderDiscountAcrossItemsNoRemainder(items, orderDiscountAmount);
      if (!(Number(appliedOrderDiscount?.discountAmount || 0) > 0)) {
        return {
          isApplicable: false,
          errorCode: "DISCOUNT_NOT_APPLICABLE",
          disabledReason: buildRightOrderBenefitsDisabledReason("DISCOUNT_NOT_APPLICABLE"),
          discountAmount: 0,
          items,
          itemsTotalAfterDiscount: baseItemsTotal,
        };
      }
      return {
        isApplicable: true,
        errorCode: "",
        disabledReason: "",
        discountAmount: roundPrice(Number(appliedOrderDiscount.discountAmount || 0)),
        items: Array.isArray(appliedOrderDiscount.items) ? appliedOrderDiscount.items : items,
        itemsTotalAfterDiscount: roundPrice(Number(appliedOrderDiscount.itemsTotalAfterDiscount || baseItemsTotal)),
      };
    }

    const resolvedTargets = buildRightOrderBenefitsLocalTargetSets(rule?.target_sets);
    let itemsDiscount = 0;
    items.forEach((item) => {
      if (!matchRightOrderBenefitsLocalTargetScope(resolvedTargets, item, productCategoriesMap, applyTo === "combo" ? "combo" : applyTo || "any")) {
        return;
      }
      const itemDiscount = calculateRightOrderBenefitsLocalDiscountAmount(
        Number(item?.line_total || 0),
        rule?.discount_type,
        rule?.discount_value,
        rule?.max_discount_amount
      );
      if (!(itemDiscount > 0)) return;
      item.line_total = roundPrice(Math.max(0, Number(item?.line_total || 0) - itemDiscount));
      itemsDiscount += itemDiscount;
    });
    if (!(itemsDiscount > 0)) {
      return {
        isApplicable: false,
        errorCode: "DISCOUNT_NOT_APPLICABLE",
        disabledReason: buildRightOrderBenefitsDisabledReason("DISCOUNT_NOT_APPLICABLE"),
        discountAmount: 0,
        items,
        itemsTotalAfterDiscount: baseItemsTotal,
      };
    }
    return {
      isApplicable: true,
      errorCode: "",
      disabledReason: "",
      discountAmount: roundPrice(itemsDiscount),
      items,
      itemsTotalAfterDiscount: roundPrice(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)),
    };
  }

  function computeRightOrderBenefitsLocalPromoOutcome(rule, previewItems, itemsTotalBeforePromo, productCategoriesMap) {
    const items = previewItems.map((item) => ({ ...item, discount: item?.discount ? { ...item.discount } : item?.discount }));
    const baseItemsTotal = roundPrice(Number(itemsTotalBeforePromo != null
      ? itemsTotalBeforePromo
      : items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)
    ));
    if (!rule) {
      return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal, {
        disabledReasonCode: "PROMO_INVALID",
      });
    }
    if (rule?.server_locked) {
      const disabledReasonCode = String(rule?.server_disabled_reason_code || "PROMO_NOT_AVAILABLE").trim().toUpperCase() || "PROMO_NOT_AVAILABLE";
      return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal, {
        disabledReasonCode,
        disabledReason: String(rule?.server_disabled_reason || "").trim(),
      });
    }

    const runtimeConfig = rule?.runtime_config && typeof rule.runtime_config === "object" ? rule.runtime_config : {};
    const rewardType = String(runtimeConfig?.reward_type || "discount").trim().toLowerCase() || "discount";
    const productRewardType = String(runtimeConfig?.product_reward_type || "gift").trim().toLowerCase() || "gift";
    const applyTo = String(runtimeConfig?.apply_to || "order").trim().toLowerCase() || "order";
    const minOrderAmount = runtimeConfig?.min_order_amount != null
      ? Number(runtimeConfig.min_order_amount || 0)
      : (rule?.min_order_amount != null ? Number(rule.min_order_amount || 0) : 0);
    if (minOrderAmount > 0 && baseItemsTotal < minOrderAmount) {
      return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal, {
        disabledReasonCode: "PROMO_NOT_APPLICABLE",
        disabledReason: buildRightOrderBenefitsPromoMinAmountReason(minOrderAmount, baseItemsTotal),
      });
    }

    const resolvedTargets = buildRightOrderBenefitsLocalTargetSets(rule?.target_sets);
    if (rewardType === "discount") {
      if (applyTo === "order") {
        const promoDiscountAmount = calculateRightOrderBenefitsLocalDiscountAmount(
          baseItemsTotal,
          runtimeConfig?.discount_type,
          runtimeConfig?.discount_value,
          runtimeConfig?.max_discount_amount
        );
        if (!(promoDiscountAmount > 0)) {
          return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
        }
        const appliedPromoDiscount = applyRightOrderLocalOrderDiscountAcrossItemsNoRemainder(items, promoDiscountAmount);
        if (!(Number(appliedPromoDiscount?.discountAmount || 0) > 0)) {
          return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
        }
        return {
          isApplicable: true,
          disabledReasonCode: "",
          disabledReason: "",
          discountAmount: roundPrice(Number(appliedPromoDiscount.discountAmount || 0)),
          items: Array.isArray(appliedPromoDiscount.items) ? appliedPromoDiscount.items : items,
          itemsTotalAfterPromo: roundPrice(Number(appliedPromoDiscount.itemsTotalAfterDiscount || baseItemsTotal)),
        };
      }
      let promoItemsDiscount = 0;
      items.forEach((item) => {
        if (!matchRightOrderBenefitsLocalTargetScope(resolvedTargets, item, productCategoriesMap, applyTo || "any")) {
          return;
        }
        const itemDiscount = calculateRightOrderBenefitsLocalDiscountAmount(
          Number(item?.line_total || 0),
          runtimeConfig?.discount_type,
          runtimeConfig?.discount_value,
          runtimeConfig?.max_discount_amount
        );
        if (!(itemDiscount > 0)) return;
        item.line_total = roundPrice(Math.max(0, Number(item?.line_total || 0) - itemDiscount));
        promoItemsDiscount += itemDiscount;
      });
      if (!(promoItemsDiscount > 0)) {
        return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
      }
      return {
        isApplicable: true,
        disabledReasonCode: "",
        disabledReason: "",
        discountAmount: roundPrice(promoItemsDiscount),
        items,
        itemsTotalAfterPromo: roundPrice(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)),
      };
    }

    if (productRewardType === "gift") {
      const hasTargets = resolvedTargets.anyProductIds.size > 0
        || resolvedTargets.categoryIds.size > 0
        || resolvedTargets.comboIds.size > 0
        || resolvedTargets.exactProductConfigKeysByProductId.size > 0;
      return hasTargets
        ? {
            isApplicable: true,
            disabledReasonCode: "",
            disabledReason: "",
            discountAmount: 0,
            items,
            itemsTotalAfterPromo: baseItemsTotal,
          }
        : buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
    }

    let rewardItemsDiscount = 0;
    items.forEach((item) => {
      if (!matchRightOrderBenefitsLocalTargetScope(resolvedTargets, item, productCategoriesMap, "any")) {
        return;
      }
      const itemDiscount = calculateRightOrderBenefitsLocalDiscountAmount(
        Number(item?.line_total || 0),
        runtimeConfig?.discount_type,
        runtimeConfig?.discount_value,
        runtimeConfig?.max_discount_amount
      );
      if (!(itemDiscount > 0)) return;
      item.line_total = roundPrice(Math.max(0, Number(item?.line_total || 0) - itemDiscount));
      rewardItemsDiscount += itemDiscount;
    });
    if (!(rewardItemsDiscount > 0)) {
      return buildRightOrderBenefitsPromoNotApplicableOutcome(items, baseItemsTotal);
    }
    return {
      isApplicable: true,
      disabledReasonCode: "",
      disabledReason: "",
      discountAmount: roundPrice(rewardItemsDiscount),
      items,
      itemsTotalAfterPromo: roundPrice(items.reduce((sum, item) => sum + Number(item?.line_total || 0), 0)),
    };
  }

  function buildRightOrderBenefitsLocalLineTotalsByCartKey(items = []) {
    return (Array.isArray(items) ? items : []).reduce((acc, item) => {
      const cartKey = String(item?.cart_key || "").trim();
      if (!cartKey) return acc;
      acc[cartKey] = roundPrice(Number(item?.line_total || 0));
      return acc;
    }, {});
  }

  function buildRightOrderBenefitsLocalSummarySnapshot(previewData, subtotalBeforeDiscount, itemsTotalAfterBenefits, discountBreakdown = []) {
    const subtotal = roundPrice(Number(subtotalBeforeDiscount || 0));
    const itemsTotal = roundPrice(Number(itemsTotalAfterBenefits || 0));
    const delivery = roundPrice(Number(previewData?.summary?.delivery || 0));
    return {
      subtotal,
      items_total: itemsTotal,
      delivery,
      discount_total: roundPrice(Math.max(0, subtotal - itemsTotal)),
      total: roundPrice(itemsTotal + delivery),
      discount_breakdown: (Array.isArray(discountBreakdown) ? discountBreakdown : [])
        .filter((entry) => Number(entry?.amount || 0) > 0)
        .map((entry) => ({
          key: String(entry?.key || "").trim(),
          title: String(entry?.title || "").trim() || "Скидка",
          amount: roundPrice(Number(entry?.amount || 0)),
          source_kind: String(entry?.source_kind || "").trim().toLowerCase() || null,
          promo_code: normalizeRightOrderBenefitsPromoCode(entry?.promo_code),
        })),
    };
  }

  function resolveRightOrderBenefitsLocalSummary(previewData, {
    selectedDiscountId,
    selectedDiscountSource,
    selectedPromoId,
    selectedPromoSource,
  } = {}) {
    const summaryStates = previewData?.client_calculation?.summary_states;
    if (!summaryStates || typeof summaryStates !== "object") return null;
    const discountKey = buildRightOrderBenefitsLocalDiscountKey(selectedDiscountSource, selectedDiscountId);
    const promoKey = normalizeRightOrderBenefitsPromoSource(selectedPromoSource) && normalizeRightOrderBenefitsSelectedId(selectedPromoId)
      ? `${normalizeRightOrderBenefitsPromoSource(selectedPromoSource)}:${normalizeRightOrderBenefitsSelectedId(selectedPromoId)}`
      : "";
    const stateKey = buildRightOrderBenefitsSelectionStateKey({ discountKey, promoKey });
    const summary = summaryStates[stateKey]
      || (discountKey ? summaryStates[buildRightOrderBenefitsSelectionStateKey({ discountKey })] : null)
      || (promoKey ? summaryStates[buildRightOrderBenefitsSelectionStateKey({ promoKey })] : null)
      || summaryStates.__base__
      || null;
    return summary ? cloneRightOrderBenefitsSummary(summary) : null;
  }

  function buildRightOrderBenefitsLocalPreviewData(previewData, {
    order = null,
    previewRequest = null,
  } = {}) {
    if (!previewData || typeof previewData !== "object") return null;
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const selection = getRightOrderBenefitsSelectionState(form);
    const selectedDiscountKey = buildRightOrderBenefitsLocalDiscountKey(
      selection.selectedDiscountSource,
      selection.selectedDiscountId
    );
    const selectedPromoKey = buildRightOrderBenefitsLocalPromoKey(previewData, {
      promoCode: selection.promoCode,
      selectedPromoSource: selection.selectedPromoSource,
      selectedPromoRewardId: selection.selectedPromoRewardId,
    });
    const clientCalculation = previewData?.client_calculation && typeof previewData.client_calculation === "object"
      ? previewData.client_calculation
      : null;
    const discountRules = Array.isArray(clientCalculation?.discount_rules) ? clientCalculation.discount_rules : [];
    const promoRules = Array.isArray(clientCalculation?.promo_rules) ? clientCalculation.promo_rules : [];

    if (Number(clientCalculation?.version || 0) >= 2 && (discountRules.length || promoRules.length)) {
      const effectivePreviewRequest = previewRequest && typeof previewRequest === "object"
        ? previewRequest
        : buildRightOrderBenefitsPreviewRequest(order);
      const baseItems = buildRightOrderBenefitsLocalPreviewItems(effectivePreviewRequest);
      const baseItemsTotal = roundPrice(baseItems.reduce((sum, item) => sum + Number(item?.line_total || 0), 0));
      const subtotalBeforeDiscount = roundPrice(baseItems.reduce((sum, item) => {
        const originalLineTotal = Number(item?.discount?.original_line_total || item?.line_total || 0);
        return sum + Math.max(Number(item?.line_total || 0), originalLineTotal);
      }, 0));
      const productCategoriesMap = buildRightOrderBenefitsLocalProductCategoriesMap(order, baseItems);
      const discountRuleOutcomes = new Map(
        discountRules
          .map((rule) => [String(rule?.selection_key || "").trim(), computeRightOrderBenefitsLocalDiscountOutcome(rule, baseItems, productCategoriesMap)])
          .filter(([selectionKey]) => !!selectionKey)
      );
      const selectedDiscountRule = discountRules.find((rule) => String(rule?.selection_key || "").trim() === selectedDiscountKey) || null;
      const selectedDiscountOutcome = selectedDiscountKey ? (discountRuleOutcomes.get(selectedDiscountKey) || null) : null;
      const hasSelectedDiscount = selectedDiscountOutcome?.isApplicable === true;
      const promoSourceItems = hasSelectedDiscount
        ? (Array.isArray(selectedDiscountOutcome?.items) ? selectedDiscountOutcome.items : baseItems)
        : baseItems;
      const promoSourceItemsTotal = hasSelectedDiscount
        ? Number(selectedDiscountOutcome?.itemsTotalAfterDiscount || baseItemsTotal)
        : baseItemsTotal;
      const promoRuleOutcomes = new Map(
        promoRules
          .map((rule) => [String(rule?.selection_key || "").trim(), computeRightOrderBenefitsLocalPromoOutcome(rule, promoSourceItems, promoSourceItemsTotal, productCategoriesMap)])
          .filter(([selectionKey]) => !!selectionKey)
      );
      const selectedPromoRule = promoRules.find((rule) => String(rule?.selection_key || "").trim() === selectedPromoKey) || null;
      const selectedPromoOutcome = selectedPromoKey ? (promoRuleOutcomes.get(selectedPromoKey) || null) : null;
      const canCombineSelectedBenefits = !hasSelectedDiscount || !selectedPromoRule || !selectedDiscountRule
        ? true
        : (isRightOrderBenefitStackable(selectedDiscountRule) && isRightOrderBenefitStackable(selectedPromoRule));
      const hasSelectedPromo = selectedPromoOutcome?.isApplicable === true && canCombineSelectedBenefits;
      const finalItems = hasSelectedPromo
        ? (Array.isArray(selectedPromoOutcome?.items) ? selectedPromoOutcome.items : promoSourceItems)
        : (hasSelectedDiscount ? promoSourceItems : baseItems);
      const finalItemsTotal = hasSelectedPromo
        ? Number(selectedPromoOutcome?.itemsTotalAfterPromo || promoSourceItemsTotal)
        : (hasSelectedDiscount ? promoSourceItemsTotal : baseItemsTotal);

      const discountCards = Array.isArray(previewData?.discounts)
        ? previewData.discounts.map((entry) => {
            const selectionKey = buildRightOrderBenefitDiscountSelectionKey(entry);
            const outcome = selectionKey ? (discountRuleOutcomes.get(selectionKey) || null) : null;
            const isApplicable = outcome ? outcome.isApplicable === true : entry?.is_applicable === true;
            const disabledReasonCode = outcome?.errorCode
              ? String(outcome.errorCode).trim().toUpperCase()
              : String(entry?.disabled_reason_code || "").trim().toUpperCase();
            const disabledReason = isApplicable
              ? ""
              : (String(outcome?.disabledReason || "").trim() || String(entry?.disabled_reason || "").trim());
            return {
              ...entry,
              is_applicable: isApplicable,
              disabled_reason_code: isApplicable ? "" : disabledReasonCode,
              disabled_reason: isApplicable ? "" : disabledReason,
              is_selected: isApplicable && selectionKey === selectedDiscountKey,
            };
          })
        : [];
      const promoCards = Array.isArray(previewData?.promo_codes)
        ? previewData.promo_codes.map((entry) => {
            const selectionKey = buildRightOrderBenefitPromoSelectionKey(entry);
            const outcome = selectionKey ? (promoRuleOutcomes.get(selectionKey) || null) : null;
            const isApplicable = outcome ? outcome.isApplicable === true : entry?.is_applicable === true;
            const disabledReasonCode = outcome?.disabledReasonCode
              ? String(outcome.disabledReasonCode).trim().toUpperCase()
              : String(entry?.disabled_reason_code || "").trim().toUpperCase();
            const disabledReason = isApplicable
              ? ""
              : (String(outcome?.disabledReason || "").trim() || String(entry?.disabled_reason || "").trim());
            return {
              ...entry,
              is_applicable: isApplicable,
              disabled_reason_code: isApplicable ? "" : disabledReasonCode,
              disabled_reason: isApplicable ? "" : disabledReason,
              is_selected: isApplicable && canCombineSelectedBenefits && selectionKey === selectedPromoKey,
            };
          })
        : [];

      const discountBreakdown = [];
      if (hasSelectedDiscount && Number(selectedDiscountOutcome?.discountAmount || 0) > 0) {
        const selectedDiscountCard = discountCards.find((entry) => entry?.is_selected) || null;
        discountBreakdown.push({
          key: `discount_${Number(selectedDiscountRule?.source_discount_id || selectedDiscountRule?.selection_id || 0) || "selected"}`,
          title: String(selectedDiscountCard?.title || "").trim() || "Скидка",
          amount: roundPrice(Number(selectedDiscountOutcome.discountAmount || 0)),
          source_kind: String(selectedDiscountRule?.source || "discount").trim().toLowerCase() || "discount",
          promo_code: null,
        });
      }
      if (hasSelectedPromo && Number(selectedPromoOutcome?.discountAmount || 0) > 0) {
        const selectedPromoCard = promoCards.find((entry) => entry?.is_selected) || null;
        discountBreakdown.push({
          key: `promo_${Number(selectedPromoRule?.selection_id || 0) || "selected"}`,
          title: String(selectedPromoCard?.title || selectedPromoCard?.code || "").trim() || "Промокод",
          amount: roundPrice(Number(selectedPromoOutcome.discountAmount || 0)),
          source_kind: String(selectedPromoRule?.source || "promo_code").trim().toLowerCase() || "promo_code",
          promo_code: normalizeRightOrderBenefitsPromoCode(
            selectedPromoCard?.code || selection.promoCode || ""
          ) || null,
        });
      }

      return {
        ...cloneRightOrderBenefitsPreviewData(previewData),
        discounts: discountCards,
        promo_codes: promoCards,
        summary: buildRightOrderBenefitsLocalSummarySnapshot(
          previewData,
          subtotalBeforeDiscount,
          finalItemsTotal,
          discountBreakdown
        ),
        local_line_totals_by_cart_key: buildRightOrderBenefitsLocalLineTotalsByCartKey(finalItems),
      };
    }

    const selectedPromoId = normalizeRightOrderBenefitsPromoSource(selection.selectedPromoSource) === "reward_promo"
      ? selection.selectedPromoRewardId
      : normalizeRightOrderBenefitsSelectedId(
          Array.isArray(previewData?.promo_codes)
            ? previewData.promo_codes.find((entry) => (
                normalizeRightOrderBenefitsPromoCode(entry?.code) === normalizeRightOrderBenefitsPromoCode(selection.promoCode || "")
              ))?.id
            : null
        );
    const summary = resolveRightOrderBenefitsLocalSummary(previewData, {
      selectedDiscountId: selection.selectedDiscountId,
      selectedDiscountSource: selection.selectedDiscountSource,
      selectedPromoId,
      selectedPromoSource: selection.selectedPromoSource,
    });
    if (!summary) return cloneRightOrderBenefitsPreviewData(previewData);

    return {
      ...cloneRightOrderBenefitsPreviewData(previewData),
      discounts: Array.isArray(previewData?.discounts)
        ? previewData.discounts.map((entry) => ({
            ...entry,
            is_selected: buildRightOrderBenefitDiscountSelectionKey(entry) === selectedDiscountKey,
          }))
        : [],
      promo_codes: Array.isArray(previewData?.promo_codes)
        ? previewData.promo_codes.map((entry) => ({
            ...entry,
            is_selected: buildRightOrderBenefitPromoSelectionKey(entry) === selectedPromoKey,
          }))
        : [],
      summary,
    };
  }

  function resolveRightOrderBenefitsPreviewForOrder(previewData, order) {
    if (!previewData || typeof previewData !== "object") return null;
    const derived = buildRightOrderBenefitsLocalPreviewData(previewData, { order });
    return derived && typeof derived === "object"
      ? derived
      : (cloneRightOrderBenefitsPreviewData(previewData) || null);
  }

  function invalidateRightOrderBenefitsPreview(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    ["customer", "all"].forEach((mode) => {
      const slot = getRightOrderBenefitsCacheSlot(id, mode);
      if (!slot) return;
      state.rightBenefitsPreviewByOrder.delete(slot);
      state.rightBenefitsPreviewKeyByOrder.delete(slot);
      state.rightBenefitsLoadingByOrder.delete(slot);
      state.rightBenefitsReqSeqByOrder.delete(slot);
    });
    state.rightBenefitsClaimOptionsByOrder.delete(id);
  }

  function clearRightOrderBenefitsRefreshTimer(orderId) {
    const id = Number(orderId || 0);
    const timer = state.rightBenefitsRefreshTimerByOrder.get(id);
    if (timer) clearTimeout(timer);
    state.rightBenefitsRefreshTimerByOrder.delete(id);
  }

  async function restoreRightOrderGiftReward(orderId, rewardId, opts = {}) {
    const numericRewardId = Number(rewardId || 0);
    if (!(numericRewardId > 0)) return true;
    const id = Number(orderId || 0);
    const explicitClientId = Number(opts?.clientId || 0);
    let token = explicitClientId > 0
      ? String(state.rightBenefitsTokenByClientId.get(explicitClientId) || "").trim()
      : "";
    if (!token && id > 0) {
      const orderIndex = getRightOrderIndexById(id);
      const currentOrder = orderIndex >= 0 ? (state.rightOrders[orderIndex] || {}) : {};
      const currentClientId = Number(currentOrder?.form?.clientId || 0);
      if (!(explicitClientId > 0) || currentClientId === explicitClientId) {
        token = String(await ensureRightOrderBenefitsCustomerToken(id) || "").trim();
      }
    }
    if (!token) {
      if (!opts?.silent) showNewOrderAlert("Не удалось вернуть подарок в выгоды");
      return false;
    }
    try {
      await apiJson("/api/public/checkout/benefits/restore-gift", {
        method: "POST",
        headers: { "x-customer-token": token },
        body: JSON.stringify({ reward_id: numericRewardId }),
      });
      return true;
    } catch (error) {
      if (String(error?.message || "").trim().toUpperCase() === "REWARD_INVALID") {
        return true;
      }
      if (!opts?.silent) showNewOrderAlert("Не удалось вернуть подарок в выгоды");
      return false;
    }
  }

  async function restoreRightOrderGiftRewardsFromItems(orderId, items, opts = {}) {
    const rewardIds = [...new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => Number(item?.gift_reward_id || 0))
        .filter((rewardId) => rewardId > 0)
    )];
    for (const rewardId of rewardIds) {
      const restored = await restoreRightOrderGiftReward(orderId, rewardId, opts);
      if (!restored) return false;
    }
    return true;
  }

  function shouldRightOrderUseOriginalLineTotalsForBenefits(order) {
    if (String(order?.mode || "").trim().toLowerCase() !== "edit") return false;
    const snapshot = order?.editPricingSnapshot && typeof order.editPricingSnapshot === "object"
      ? order.editPricingSnapshot
      : null;
    if (!snapshot) return false;
    const breakdown = Array.isArray(snapshot?.breakdown) ? snapshot.breakdown : [];
    return breakdown.some((entry) => {
      const sourceKind = normalizeRightOrderDiscountBreakdownSourceKind(entry);
      return sourceKind === "discount" || sourceKind === "promo_code";
    });
  }

  function buildRightOrderBenefitsPreviewRequest(order, opts = {}) {
    const safeOrder = order && typeof order === "object" ? order : {};
    const form = safeOrder.form && typeof safeOrder.form === "object" ? safeOrder.form : {};
    const selection = getRightOrderBenefitsSelectionState(form);
    const previewCartItems = (Array.isArray(form.cartItems) ? form.cartItems : [])
      .filter((item) => Number(item?.is_gift_reward || 0) !== 1);
    const useOriginalLineTotalsForBenefits = shouldRightOrderUseOriginalLineTotalsForBenefits(safeOrder);
    const request = {
      customer_id: Number(form.clientId || 0) > 0 ? Number(form.clientId) : null,
      method_code: String(form.pickupMethod || "").trim() || "delivery",
      promo_code: selection.promoCode,
      selected_discount_id: selection.selectedDiscountId,
      selected_discount_source: selection.selectedDiscountId ? (selection.selectedDiscountSource || "discount") : null,
      selected_promo_source: (selection.promoCode || selection.selectedPromoRewardId)
        ? (selection.selectedPromoSource || "promo_code")
        : null,
      selected_promo_reward_id: selection.selectedPromoRewardId,
      use_original_line_totals_for_benefits: useOriginalLineTotalsForBenefits ? 1 : 0,
      items: buildRightOrderPayloadItems(previewCartItems),
    };
    if (opts?.includeMode) {
      request.mode = normalizeRightOrderBenefitsMode(opts.mode || getActiveRightOrderBenefitsMode());
    }
    return request;
  }

  function buildRightOrderBenefitsPreviewKey(order, mode = null) {
    const safeOrder = order && typeof order === "object" ? order : {};
    const activeMode = normalizeRightOrderBenefitsMode(mode || getActiveRightOrderBenefitsMode());
    const request = buildRightOrderBenefitsPreviewRequest(safeOrder, {
      includeMode: activeMode === "all",
      mode: activeMode,
    });
    const form = safeOrder.form && typeof safeOrder.form === "object" ? safeOrder.form : {};
    return JSON.stringify({
      mode: activeMode,
      customerId: Number(form.clientId || 0) || null,
      phone: normalizePhoneRu(form.phone),
      request,
    });
  }

  function getRightOrderBenefitsPreviewSnapshot(order, opts = {}) {
    const orderId = Number(order?.id || 0);
    if (!(orderId > 0)) return null;
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const clientId = Number(form?.clientId || 0);
    const allowStale = opts?.allowStale === true;
    const allowClientCache = opts?.allowClientCache === true;
    const requestedMode = opts?.mode != null
      ? normalizeRightOrderBenefitsMode(opts.mode)
      : null;
    const modeQueue = requestedMode
      ? (opts?.preferApplied
          ? [requestedMode, ...(requestedMode === "all" ? ["customer"] : ["all"])]
          : [requestedMode])
      : (opts?.preferApplied ? ["all", "customer"] : [getActiveRightOrderBenefitsMode()]);
    const resolvePreview = (preview) => {
      if (!preview) return null;
      if (opts?.resolveForOrder === false) return preview;
      return resolveRightOrderBenefitsPreviewForOrder(preview, order);
    };
    let staleSnapshot = null;
    let staleClientSnapshot = null;
    for (const mode of modeQueue) {
      const slot = getRightOrderBenefitsCacheSlot(orderId, mode);
      const expectedKey = buildRightOrderBenefitsPreviewKey(order, mode);
      const storedKey = String(state.rightBenefitsPreviewKeyByOrder.get(slot) || "");
      const snapshot = state.rightBenefitsPreviewByOrder.get(slot) || null;
      if (allowStale && !staleSnapshot && snapshot) {
        staleSnapshot = snapshot;
      }
      if (expectedKey && storedKey === expectedKey && snapshot) return resolvePreview(snapshot);
      if (allowClientCache && clientId > 0) {
        const clientSlot = getRightOrderBenefitsClientCacheSlot(clientId, mode);
        const clientSnapshot = clientSlot ? (state.rightBenefitsPreviewByClientMode.get(clientSlot) || null) : null;
        if (clientSnapshot && !staleClientSnapshot) {
          staleClientSnapshot = clientSnapshot;
        }
      }
    }
    if (allowStale && staleSnapshot) return resolvePreview(staleSnapshot);
    if (allowClientCache && staleClientSnapshot) return resolvePreview(cloneRightOrderBenefitsPreviewData(staleClientSnapshot));
    return null;
  }

  async function prefetchRightOrderBenefitsModes(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? order.form : {};
    const hasClient = Number(form.clientId || 0) > 0;
    const primaryMode = hasClient ? "customer" : "all";
    const skipModeRaw = String(opts?.skipMode || "").trim();
    const skipMode = skipModeRaw ? normalizeRightOrderBenefitsMode(skipModeRaw) : null;
    const modes = (hasClient ? [primaryMode, "all"] : [primaryMode])
      .filter((mode, index, list) => list.indexOf(mode) === index)
      .filter((mode) => !skipMode || mode !== skipMode);
    await Promise.all(
      modes.map((mode) => loadRightOrderBenefitsPreview(id, {
        force: opts?.force === true,
        render: false,
        renderOverlay: false,
        mode,
      }).catch(() => null))
    );
  }

  function queueRenderRightBenefitsModal(orderId) {
    if (Number(state.benefitsModal.orderId || 0) !== Number(orderId || 0)) return;
    renderRightBenefitsOverlay(Number(orderId || 0));
  }

  function getRightBenefitsMainViewSnapshot(orderId, mode = null) {
    const id = Number(orderId || state.benefitsModal.orderId || 0);
    if (!(id > 0)) return null;
    const activeMode = normalizeRightOrderBenefitsMode(mode || state.benefitsModal.mode);
    const cacheSlot = getRightOrderBenefitsCacheSlot(id, activeMode);
    return state.rightBenefitsPreviewByOrder.get(cacheSlot) || null;
  }

  function getRightBenefitsMainViewRequestKey(orderId, mode = null) {
    const id = Number(orderId || state.benefitsModal.orderId || 0);
    if (!(id > 0)) return "";
    const index = getRightOrderIndexById(id);
    if (index < 0) return "";
    const order = state.rightOrders[index] || {};
    return buildRightOrderBenefitsPreviewKey(order, normalizeRightOrderBenefitsMode(mode || state.benefitsModal.mode));
  }

  function rememberRightBenefitsMainView(orderId, mode, frame) {
    if (!frame?.root || !frame.scrollEl) return;
    const id = Number(orderId || 0);
    const activeMode = normalizeRightOrderBenefitsMode(mode || state.benefitsModal.mode);
    state.benefitsModal.mainView = {
      orderId: id,
      mode: activeMode,
      requestKey: getRightBenefitsMainViewRequestKey(id, activeMode),
      snapshot: getRightBenefitsMainViewSnapshot(id, activeMode),
      root: frame.root,
      scrollEl: frame.scrollEl,
      scrollTop: Number(frame.scrollEl.scrollTop || 0),
    };
  }

  function captureRightBenefitsMainViewScroll() {
    const mainView = state.benefitsModal.mainView;
    if (!mainView?.scrollEl) return;
    mainView.scrollTop = Number(mainView.scrollEl.scrollTop || 0);
  }

  function restoreRightBenefitsMainView(orderId) {
    const id = Number(orderId || state.benefitsModal.orderId || 0);
    if (!(id > 0)) return false;
    const mainView = state.benefitsModal.mainView;
    if (!mainView || Number(mainView.orderId || 0) !== id) return false;
    if (!(mainView.root instanceof Element)) return false;
    const activeMode = normalizeRightOrderBenefitsMode(state.benefitsModal.mode || mainView.mode);
    if (normalizeRightOrderBenefitsMode(mainView.mode) !== activeMode) return false;
    if (mainView.requestKey !== getRightBenefitsMainViewRequestKey(id, activeMode)) return false;
    if (mainView.snapshot !== getRightBenefitsMainViewSnapshot(id, activeMode)) return false;

    window.AdminBenefitsModal?.show({
      title: "Выгоды",
      showBack: false,
      showModeToggle: true,
      mode: activeMode,
      onClose: closeRightBenefitsOverlay,
      onModeChange: (nextMode) => {
        void switchRightBenefitsOverlayMode(nextMode);
      },
      clearBody: false,
    });
    const { body } = getRightBenefitsOverlayElements();
    if (!body) return false;
    if (mainView.root.parentNode !== body) {
      body.innerHTML = "";
      body.appendChild(mainView.root);
    }
    if (mainView.scrollEl) {
      mainView.scrollEl.scrollTop = Number(mainView.scrollTop || 0);
    }
    return true;
  }

  async function ensureRightOrderBenefitsCustomerToken(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return null;
    const clientId = Number(await ensureRightOrderBenefitsCustomerId(id) || 0);
    if (!(clientId > 0)) return null;
    const cachedToken = String(state.rightBenefitsTokenByClientId.get(clientId) || "").trim();
    if (cachedToken) return cachedToken;
    const json = await apiJson(`/api/admin/clients/${clientId}/shop-session`, {
      method: "POST",
    });
    const token = String(json?.data?.token || "").trim();
    if (token) {
      state.rightBenefitsTokenByClientId.set(clientId, token);
      return token;
    }
    return null;
  }

  async function ensureRightOrderBenefitsCustomerId(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return null;
    let index = getRightOrderIndexById(id);
    if (index < 0) return null;
    let order = state.rightOrders[index] || {};
    let form = order.form && typeof order.form === "object" ? order.form : {};
    let clientId = Number(form.clientId || 0);
    if (!(clientId > 0)) {
      const normalizedDigits = normalizePhoneRu(form.phone);
      if (normalizedDigits.length === 11) {
        await lookupClientByPhoneForRightOrder(id, form.phone);
        index = getRightOrderIndexById(id);
        if (index < 0) return null;
        order = state.rightOrders[index] || {};
        form = order.form && typeof order.form === "object" ? order.form : {};
        clientId = Number(form.clientId || 0);
      }
    }
    return clientId > 0 ? clientId : null;
  }

  async function loadRightOrderBenefitsPreview(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return null;
    let index = getRightOrderIndexById(id);
    if (index < 0) return null;
    const requestedMode = normalizeRightOrderBenefitsMode(opts?.mode || getActiveRightOrderBenefitsMode());
    const customerId = Number(await ensureRightOrderBenefitsCustomerId(id) || 0);
    const mode = requestedMode === "customer" && !(customerId > 0)
      ? "all"
      : requestedMode;
    if (Number(state.benefitsModal.orderId || 0) === id && state.benefitsModal.mode !== mode) {
      state.benefitsModal.mode = mode;
      setRightBenefitsModeToggleState(mode);
    }
    index = getRightOrderIndexById(id);
    if (index < 0) return null;
    const order = state.rightOrders[index] || {};

    const cacheSlot = getRightOrderBenefitsCacheSlot(id, mode);
    const requestKey = buildRightOrderBenefitsPreviewKey(order, mode);
    const clientCacheSlot = getRightOrderBenefitsClientCacheSlot(customerId, mode);
    if (!opts?.force && requestKey === String(state.rightBenefitsPreviewKeyByOrder.get(cacheSlot) || "")) {
      const cached = state.rightBenefitsPreviewByOrder.get(cacheSlot) || null;
      if (cached) return cached;
    }
    let seededFromClientCache = false;
    if (!opts?.force && !opts?.prefetchedData && clientCacheSlot) {
      const cachedByClientMode = state.rightBenefitsPreviewByClientMode.get(clientCacheSlot) || null;
      if (cachedByClientMode) {
        const clonedCached = cloneRightOrderBenefitsPreviewData(cachedByClientMode);
        if (clonedCached) {
          state.rightBenefitsPreviewByOrder.set(cacheSlot, clonedCached);
          state.rightBenefitsPreviewKeyByOrder.set(cacheSlot, requestKey);
          seededFromClientCache = true;
          if (opts?.render) {
            renderRightOrderTabs();
            if (opts?.renderOverlay !== false) queueRenderRightBenefitsModal(id);
          }
          if (opts?.skipServerWhenCached) return clonedCached;
        }
      }
    }

    const requestSeq = Number(state.rightBenefitsReqSeqByOrder.get(cacheSlot) || 0) + 1;
    state.rightBenefitsReqSeqByOrder.set(cacheSlot, requestSeq);
    const snapshotBeforeRequest = state.rightBenefitsPreviewByOrder.get(cacheSlot) || null;
    const keyBeforeRequest = String(state.rightBenefitsPreviewKeyByOrder.get(cacheSlot) || "");
    state.rightBenefitsLoadingByOrder.add(cacheSlot);
    if (opts?.render && opts?.renderOverlay !== false) queueRenderRightBenefitsModal(id);

    try {
      let nextData = opts?.prefetchedData && typeof opts.prefetchedData === "object"
        ? cloneRightOrderBenefitsPreviewData(opts.prefetchedData)
        : null;
      if (!nextData) {
        const requestBody = buildRightOrderBenefitsPreviewRequest(order, {
          includeMode: true,
          mode,
        });
        requestBody.customer_id = customerId > 0 ? customerId : null;
        const json = await apiJson("/api/admin/orders/benefits/preview", {
          method: "POST",
          body: JSON.stringify(requestBody),
        });
        nextData = cloneRightOrderBenefitsPreviewData(json?.data || null);
      }
      if (Number(state.rightBenefitsReqSeqByOrder.get(cacheSlot) || 0) !== requestSeq) return null;
      const responseMode = normalizeRightOrderBenefitsMode(nextData?.mode || mode);
      if (responseMode !== mode) {
        state.rightBenefitsLoadingByOrder.delete(cacheSlot);
        state.rightBenefitsReqSeqByOrder.delete(cacheSlot);
        if (Number(state.benefitsModal.orderId || 0) === id && state.benefitsModal.mode !== responseMode) {
          state.benefitsModal.mode = responseMode;
          setRightBenefitsModeToggleState(responseMode);
        }
        return loadRightOrderBenefitsPreview(id, {
          ...opts,
          mode: responseMode,
          prefetchedData: nextData,
        });
      }
      state.rightBenefitsPreviewByOrder.set(cacheSlot, nextData || {});
      state.rightBenefitsPreviewKeyByOrder.set(cacheSlot, requestKey);
      if (clientCacheSlot) {
        state.rightBenefitsPreviewByClientMode.set(
          clientCacheSlot,
          cloneRightOrderBenefitsPreviewData(nextData || {}) || {}
        );
      }
      state.rightBenefitsLoadingByOrder.delete(cacheSlot);
      if (opts?.render) {
        renderRightOrderTabs();
        if (opts?.renderOverlay !== false) queueRenderRightBenefitsModal(id);
      }
      return nextData;
    } catch (error) {
      if (Number(state.rightBenefitsReqSeqByOrder.get(cacheSlot) || 0) !== requestSeq) return null;
      state.rightBenefitsLoadingByOrder.delete(cacheSlot);
      if (snapshotBeforeRequest) {
        state.rightBenefitsPreviewByOrder.set(cacheSlot, snapshotBeforeRequest);
        state.rightBenefitsPreviewKeyByOrder.set(cacheSlot, keyBeforeRequest);
      } else if (!seededFromClientCache) {
        state.rightBenefitsPreviewByOrder.delete(cacheSlot);
        state.rightBenefitsPreviewKeyByOrder.delete(cacheSlot);
      }
      if (opts?.render) {
        renderRightOrderTabs();
        if (opts?.renderOverlay !== false) queueRenderRightBenefitsModal(id);
      }
      throw error;
    }
  }

  function scheduleRightOrderBenefitsRefresh(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    clearRightOrderBenefitsRefreshTimer(id);
    const delay = Math.max(0, Number(opts?.delay ?? 180));
    const timer = setTimeout(() => {
      state.rightBenefitsRefreshTimerByOrder.delete(id);
      const index = getRightOrderIndexById(id);
      if (index < 0) return;
      const order = state.rightOrders[index] || {};
      const form = order.form && typeof order.form === "object" ? order.form : {};
      const hasPreviewState = ["customer", "all"].some((mode) => {
        const slot = getRightOrderBenefitsCacheSlot(id, mode);
        return state.rightBenefitsPreviewByOrder.has(slot) || state.rightBenefitsPreviewKeyByOrder.has(slot);
      });
      const shouldRefresh = hasPreviewState || (
        Number(form.clientId || 0) > 0
        || hasRightOrderBenefitsSelection(form)
        || (Array.isArray(form.cartItems) ? form.cartItems : []).some((item) => Number(item?.is_gift_reward || 0) === 1)
      );
      if (!shouldRefresh) return;
      const refreshMode = getRightOrderBenefitsPreferredMode(form, getActiveRightOrderBenefitsMode());
      void loadRightOrderBenefitsPreview(id, {
        force: true,
        render: opts?.render !== false,
        renderOverlay: opts?.renderOverlay === true,
        mode: refreshMode,
      }).catch(() => {});
    }, delay);
    state.rightBenefitsRefreshTimerByOrder.set(id, timer);
  }

  function clearRightOrderGiftRewardItems(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    const index = getRightOrderIndexById(id);
    if (index < 0) return false;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const currentItems = Array.isArray(form.cartItems) ? form.cartItems : [];
    const nextItems = currentItems.filter((item) => Number(item?.is_gift_reward || 0) !== 1);
    if (nextItems.length === currentItems.length) return false;
    form.cartItems = nextItems;
    state.rightOrders[index] = { ...order, form };
    invalidateRightDeliveryQuote(id);
    invalidateRightOrderBenefitsPreview(id);
    if (opts?.render) renderRightOrderTabs();
    return true;
  }

  function resetRightOrderBenefitsState(orderId, opts = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return false;
    const index = getRightOrderIndexById(id);
    if (index < 0) return false;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    form.promo_code = null;
    form.selected_discount_id = null;
    form.selected_discount_source = null;
    form.selected_promo_source = null;
    form.selected_promo_reward_id = null;
    form.benefits_preview_mode = null;
    const shouldMarkTouched = String(order?.mode || "").trim().toLowerCase() === "edit";
    state.rightOrders[index] = {
      ...order,
      form,
      editCartTouched: shouldMarkTouched ? true : Boolean(order?.editCartTouched),
    };
    invalidateRightOrderBenefitsPreview(id);
    clearRightOrderBenefitsRefreshTimer(id);
    if (opts?.clearGiftItems) {
      clearRightOrderGiftRewardItems(id, { render: false });
    }
    if (opts?.render) renderRightOrderTabs();
    return true;
  }

  function getRightOrderCheckoutSummary(order) {
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const orderId = Number(order?.id || 0);
    const cartItems = Array.isArray(form?.cartItems) ? form.cartItems : [];
    const activeEditPricingSnapshot = getRightOrderActiveEditPricingSnapshot(order);
    const subtotal = roundPrice(cartItems.reduce((sum, item) => sum + getRightOrderCartLineTotal(item), 0));
    const cartItemsCount = cartItems.reduce((sum, item) => sum + Math.max(1, Number(item?.qty || 1)), 0);
    const preferredBenefitsMode = getRightOrderBenefitsPreferredMode(form, null);
    const benefitsPreview = getRightOrderBenefitsPreviewSnapshot(order, preferredBenefitsMode
      ? { mode: preferredBenefitsMode, preferApplied: true, allowStale: true, allowClientCache: true }
      : { preferApplied: true, allowStale: true, allowClientCache: true });
    const benefitsPreviewSummary = (() => {
      const raw = benefitsPreview?.summary && typeof benefitsPreview.summary === "object"
        ? benefitsPreview.summary
        : null;
      if (!raw) return null;
      const next = { ...raw };
      const normalizedBreakdown = buildRightOrderDiscountBreakdownEntries(raw?.discount_breakdown, {
        promoCode: form?.promo_code,
      });
      const breakdownTotal = roundPrice(
        normalizedBreakdown.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0)
      );
      let subtotalValue = Number(raw?.subtotal);
      subtotalValue = Number.isFinite(subtotalValue) ? roundPrice(Math.max(0, subtotalValue)) : NaN;
      let itemsTotalValue = Number(raw?.items_total);
      itemsTotalValue = Number.isFinite(itemsTotalValue) ? roundPrice(Math.max(0, itemsTotalValue)) : NaN;
      let discountTotalValue = Number(raw?.discount_total);
      discountTotalValue = Number.isFinite(discountTotalValue) ? roundPrice(Math.max(0, discountTotalValue)) : NaN;

      if (!Number.isFinite(discountTotalValue)) {
        if (breakdownTotal > 0) {
          discountTotalValue = breakdownTotal;
        } else if (Number.isFinite(subtotalValue) && Number.isFinite(itemsTotalValue)) {
          discountTotalValue = roundPrice(Math.max(0, subtotalValue - itemsTotalValue));
        }
      }
      if (!Number.isFinite(subtotalValue)) {
        if (Number.isFinite(itemsTotalValue) && Number.isFinite(discountTotalValue)) {
          subtotalValue = roundPrice(itemsTotalValue + discountTotalValue);
        } else {
          subtotalValue = roundPrice(Math.max(0, subtotal));
        }
      }
      if (!Number.isFinite(itemsTotalValue)) {
        if (Number.isFinite(discountTotalValue)) {
          itemsTotalValue = roundPrice(Math.max(0, subtotalValue - discountTotalValue));
        } else {
          itemsTotalValue = roundPrice(Math.max(0, subtotalValue));
        }
      }
      if (!Number.isFinite(discountTotalValue)) {
        discountTotalValue = roundPrice(Math.max(0, subtotalValue - itemsTotalValue));
      }
      if (breakdownTotal > 0 && discountTotalValue < breakdownTotal) {
        discountTotalValue = breakdownTotal;
        itemsTotalValue = roundPrice(Math.max(0, subtotalValue - discountTotalValue));
      }

      next.subtotal = subtotalValue;
      next.discount_total = discountTotalValue;
      next.items_total = itemsTotalValue;
      return next;
    })();
    const hasBenefitsPreview = benefitsPreviewSummary && Number.isFinite(Number(benefitsPreviewSummary?.items_total));
    const customerDiscountSummary = hasBenefitsPreview ? null : getRightOrderCustomerDiscountSummary(order, subtotal);
    const customerOrderDiscount = hasBenefitsPreview
      ? roundPrice(Number(benefitsPreviewSummary?.discount_total || 0))
      : roundPrice(Number(customerDiscountSummary?.amount || 0));
    const subtotalAfterCustomerDiscount = hasBenefitsPreview
      ? roundPrice(Number(benefitsPreviewSummary?.items_total || 0))
      : roundPrice(Math.max(0, subtotal - customerOrderDiscount));
    const methodCode = String(form?.pickupMethod || "").trim();
    const isDeliveryMethod = isDeliveryMethodCode(methodCode);
    const settings = state.rightDeliverySettings && typeof state.rightDeliverySettings === "object"
      ? state.rightDeliverySettings
      : null;
    const settingsDeliveryCost = Math.max(0, Number(settings?.delivery_cost || 0));
    const settingsFreeDeliveryFromRaw = Number(settings?.free_delivery_from);
    const settingsFreeDeliveryFrom = Number.isFinite(settingsFreeDeliveryFromRaw) && settingsFreeDeliveryFromRaw > 0
      ? settingsFreeDeliveryFromRaw
      : null;
    const settingsMinOrderAmountRaw = Number(settings?.min_order_amount);
    const settingsMinOrderAmount = Number.isFinite(settingsMinOrderAmountRaw) && settingsMinOrderAmountRaw > 0
      ? settingsMinOrderAmountRaw
      : 0;
    const quote = orderId > 0 ? (state.rightDeliveryQuoteByOrder.get(orderId) || null) : null;
    const deliveryCost = quote
      ? Math.max(0, Number(quote?.delivery_cost || 0))
      : settingsDeliveryCost;
    const quoteFreeDeliveryFrom = Number.isFinite(Number(quote?.free_delivery_from)) && Number(quote?.free_delivery_from) > 0
      ? Number(quote.free_delivery_from)
      : null;
    const freeDeliveryFrom = quoteFreeDeliveryFrom != null ? quoteFreeDeliveryFrom : settingsFreeDeliveryFrom;
    const minOrderAmount = quote
      ? Math.max(0, Number(quote?.min_order_amount || 0))
      : settingsMinOrderAmount;
    const deliveryApplied = isDeliveryMethod
      ? (freeDeliveryFrom != null && subtotalAfterCustomerDiscount >= freeDeliveryFrom ? 0 : deliveryCost)
      : 0;
    const payableTotal = roundPrice(subtotalAfterCustomerDiscount + deliveryApplied);
    const progress = freeDeliveryFrom != null && freeDeliveryFrom > 0
      ? Math.max(0, Math.min(100, (subtotalAfterCustomerDiscount / freeDeliveryFrom) * 100))
      : 0;
    const freeReached = freeDeliveryFrom != null && subtotalAfterCustomerDiscount >= freeDeliveryFrom;
    const leftForFree = freeDeliveryFrom != null ? Math.max(0, Math.ceil(freeDeliveryFrom - subtotalAfterCustomerDiscount)) : 0;
    const deliveryProgressState = !isDeliveryMethod
      ? "hidden"
      : freeDeliveryFrom != null && freeDeliveryFrom > 0
        ? (freeReached ? "reached" : "progress")
        : "neutral-no-threshold";
    const showDeliveryProgress = isDeliveryMethod;
    if (activeEditPricingSnapshot) {
      const snapshotSubtotalBeforeDiscount = roundPrice(Number(activeEditPricingSnapshot?.subtotalBeforeDiscount || 0));
      const snapshotTotalDiscount = roundPrice(Number(activeEditPricingSnapshot?.totalDiscount || 0));
      const snapshotSubtotalAfterDiscount = roundPrice(Number(activeEditPricingSnapshot?.subtotalAfterDiscount || 0));
      const snapshotDeliveryApplied = roundPrice(Number(activeEditPricingSnapshot?.deliveryCost || 0));
      const snapshotPayableTotal = roundPrice(Number(activeEditPricingSnapshot?.payableTotal || 0));
      const snapshotFreeReached = freeDeliveryFrom != null && snapshotSubtotalAfterDiscount >= freeDeliveryFrom;
      const snapshotLeftForFree = freeDeliveryFrom != null
        ? Math.max(0, Math.ceil(freeDeliveryFrom - snapshotSubtotalAfterDiscount))
        : 0;
      const snapshotProgress = freeDeliveryFrom != null && freeDeliveryFrom > 0
        ? Math.max(0, Math.min(100, (snapshotSubtotalAfterDiscount / freeDeliveryFrom) * 100))
        : 0;
      return {
        cartItems,
        cartItemsCount,
        subtotal: snapshotSubtotalBeforeDiscount,
        subtotalAfterCustomerDiscount: snapshotSubtotalAfterDiscount,
        customerOrderDiscount: snapshotTotalDiscount,
        customerOrderDiscountTitles: [],
        customerOrderAppliedDiscounts: [],
        benefitsPreview: null,
        benefitsPreviewSummary: null,
        savedDiscountSummary: {
          subtotalBeforeDiscount: snapshotSubtotalBeforeDiscount,
          totalDiscount: snapshotTotalDiscount,
          breakdown: Array.isArray(activeEditPricingSnapshot?.breakdown)
            ? activeEditPricingSnapshot.breakdown
            : [],
          orderDiscountTitles: [],
        },
        deliveryQuote: quote,
        deliveryQuoteSource: quote?.source || null,
        deliveryCost: snapshotDeliveryApplied,
        deliveryApplied: snapshotDeliveryApplied,
        minOrderAmount,
        freeDeliveryFrom,
        freeReached: snapshotFreeReached,
        leftForFree: snapshotLeftForFree,
        progress: snapshotProgress,
        deliveryProgressState,
        showDeliveryProgress,
        etaMinutes: quote && Number.isFinite(Number(quote?.eta_minutes)) && Number(quote.eta_minutes) > 0
          ? Number(quote.eta_minutes)
          : null,
        deliveryZoneId: quote?.delivery_zone_id != null ? Number(quote.delivery_zone_id) : null,
        deliveryZoneName: String(quote?.delivery_zone_name || "").trim() || null,
        deliveryStoreId: quote?.delivery_store_id != null ? Number(quote.delivery_store_id) : null,
        payableTotal: snapshotPayableTotal,
        isDeliveryMethod,
        methodCode,
        settings,
      };
    }
    return {
      cartItems,
      cartItemsCount,
      subtotal,
      subtotalAfterCustomerDiscount,
      customerOrderDiscount,
      customerOrderDiscountTitles: hasBenefitsPreview
        ? []
        : (Array.isArray(customerDiscountSummary?.titles) ? customerDiscountSummary.titles : []),
      customerOrderAppliedDiscounts: hasBenefitsPreview
        ? []
        : (Array.isArray(customerDiscountSummary?.appliedDiscounts) ? customerDiscountSummary.appliedDiscounts : []),
      benefitsPreview,
      benefitsPreviewSummary,
      savedDiscountSummary: null,
      deliveryQuote: quote,
      deliveryQuoteSource: quote?.source || null,
      deliveryCost,
      deliveryApplied,
      minOrderAmount,
      freeDeliveryFrom,
      freeReached,
      leftForFree,
      progress,
      deliveryProgressState,
      showDeliveryProgress,
      etaMinutes: quote && Number.isFinite(Number(quote?.eta_minutes)) && Number(quote.eta_minutes) > 0
        ? Number(quote.eta_minutes)
        : null,
      deliveryZoneId: quote?.delivery_zone_id != null ? Number(quote.delivery_zone_id) : null,
      deliveryZoneName: String(quote?.delivery_zone_name || "").trim() || null,
      deliveryStoreId: quote?.delivery_store_id != null ? Number(quote.delivery_store_id) : null,
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
    const paidQty = getRightOrderAutoPaidQty(item, qty);
    return Math.max(0, qty - paidQty);
  }

  function getRightOrderAutoPaidQty(item, qtyOverride = null) {
    const qtySource = qtyOverride != null
      ? Number(qtyOverride)
      : Number(item?.qty || item?.quantity || 0);
    const qty = Math.max(0, Number.isFinite(qtySource) ? qtySource : 0);
    if (!isRightOrderAutoAddItem(item)) return qty;
    const paidQtyRaw = Number(item?.auto_add_paid_qty);
    if (Number.isFinite(paidQtyRaw)) {
      return Math.max(0, Math.min(qty, paidQtyRaw));
    }
    const freeQtyRaw = Number(item?.auto_add_free_qty);
    if (Number.isFinite(freeQtyRaw)) {
      return Math.max(0, qty - Math.max(0, freeQtyRaw));
    }
    const lineTotalRaw = Number(item?.sum ?? item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(lineTotalRaw) && Math.abs(lineTotalRaw) < 0.000001) return 0;
    return qty;
  }

  function getRightOrderCartLineTotal(item) {
    const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
    if (isGiftRewardCartItem(item)) return 0;
    const unitPrice = Number(item?.unit_price || item?.price || 0);
    if (isRightOrderAutoAddItem(item)) {
      const paidQty = getRightOrderAutoPaidQty(item, qty);
      return roundPrice(unitPrice * paidQty);
    }
    const lineTotal = Number(item?.sum ?? item?.line_total ?? item?.total ?? item?.total_price);
    if (Number.isFinite(lineTotal)) return roundPrice(lineTotal);
    return roundPrice(unitPrice * qty);
  }

  function getRightOrderStoredOriginalLineTotal(item) {
    const explicitOriginal = Number(item?.discount?.original_line_total || 0);
    const storedOldLine = Number(item?.old_line_total || 0);
    const resolved = Math.max(0, explicitOriginal, storedOldLine);
    return resolved > 0 ? roundPrice(resolved) : 0;
  }

  function getRightOrderCartOriginalLineTotal(item, opts = {}) {
    if (isGiftRewardCartItem(item)) return 0;
    const qty = Math.max(0, Number(opts?.qty ?? item?.qty ?? item?.quantity ?? 0));
    const currentLineTotal = Number.isFinite(Number(opts?.currentLineTotal))
      ? roundPrice(Math.max(0, Number(opts.currentLineTotal)))
      : getRightOrderCartLineTotal(item);
    const storedOriginalLineTotal = Number.isFinite(Number(opts?.storedOriginalLineTotal))
      ? roundPrice(Math.max(0, Number(opts.storedOriginalLineTotal)))
      : getRightOrderStoredOriginalLineTotal(item);
    if (storedOriginalLineTotal > currentLineTotal) return storedOriginalLineTotal;
    const oldUnitPrice = Number(item?.unit_price_before_discount || item?.old_price || 0);
    if (oldUnitPrice > 0) {
      const paidQty = isRightOrderAutoAddItem(item) ? getRightOrderAutoPaidQty(item, qty) : qty;
      const originalFromUnit = roundPrice(oldUnitPrice * paidQty);
      if (originalFromUnit > currentLineTotal) return originalFromUnit;
    }
    return currentLineTotal;
  }

  function distributeRightOrderDiscountAcrossLines(lineStates, extraOrderDiscount) {
    const states = Array.isArray(lineStates) ? lineStates : [];
    const precisionFactor = getRightOrderPricePrecisionFactor();
    const eligible = states
      .map((entry, index) => {
        const baseTotal = roundPrice(Math.max(0, Number(entry?.baseTotal || 0)));
        const baseTotalUnits = toRightOrderPriceUnits(baseTotal, precisionFactor);
        return {
          index,
          position: index,
          baseTotalUnits,
        };
      })
      .filter((entry) => entry.baseTotalUnits > 0);

    const discountsByIndex = new Map();
    if (!eligible.length) return discountsByIndex;

    const totalDiscountUnits = toRightOrderPriceUnits(extraOrderDiscount, precisionFactor);
    if (!(totalDiscountUnits > 0)) return discountsByIndex;

    const baseTotalUnits = eligible.reduce((sum, entry) => sum + Number(entry.baseTotalUnits || 0), 0);
    if (!(baseTotalUnits > 0)) return discountsByIndex;

    const cappedDiscountUnits = Math.min(totalDiscountUnits, baseTotalUnits);
    const allocations = eligible.map((entry) => {
      const proportionalUnits = (cappedDiscountUnits * Number(entry.baseTotalUnits || 0)) / baseTotalUnits;
      const roundedDownUnits = Math.floor(proportionalUnits);
      const safeUnits = Math.min(Number(entry.baseTotalUnits || 0), Math.max(0, roundedDownUnits));
      return {
        ...entry,
        shareUnits: safeUnits,
        fractionalRemainder: proportionalUnits - roundedDownUnits,
      };
    });
    let appliedDiscountUnits = allocations.reduce((sum, entry) => sum + Number(entry?.shareUnits || 0), 0);
    let remainingDiscountUnits = Math.max(0, cappedDiscountUnits - appliedDiscountUnits);
    if (remainingDiscountUnits > 0) {
      const sortedByRemainder = allocations.slice().sort((a, b) => (
        Number(b?.fractionalRemainder || 0) - Number(a?.fractionalRemainder || 0)
        || Number(b?.baseTotalUnits || 0) - Number(a?.baseTotalUnits || 0)
        || Number(a?.position || 0) - Number(b?.position || 0)
      ));
      while (remainingDiscountUnits > 0) {
        let progressed = false;
        for (const entry of sortedByRemainder) {
          const capUnits = Math.max(0, Number(entry?.baseTotalUnits || 0) - Number(entry?.shareUnits || 0));
          if (!(capUnits > 0)) continue;
          entry.shareUnits += 1;
          remainingDiscountUnits -= 1;
          progressed = true;
          if (!(remainingDiscountUnits > 0)) break;
        }
        if (!progressed) break;
      }
    }
    allocations.forEach((entry) => {
      const shareUnits = Math.min(
        Number(entry?.baseTotalUnits || 0),
        Math.max(0, Number(entry?.shareUnits || 0))
      );
      if (!(shareUnits > 0)) return;
      discountsByIndex.set(entry.index, fromRightOrderPriceUnits(shareUnits, precisionFactor));
    });
    return discountsByIndex;
  }

  function buildRightOrderCartLineStates(cartItems, finalItemsTotal, previewData = null) {
    const source = Array.isArray(cartItems) ? cartItems : [];
    const rawLocalLineTotals = previewData?.local_line_totals_by_cart_key
      && typeof previewData.local_line_totals_by_cart_key === "object"
      ? previewData.local_line_totals_by_cart_key
      : null;
    const localLineTotalsByCartKey = rawLocalLineTotals
      ? Object.entries(rawLocalLineTotals).reduce((acc, [rawKey, rawValue]) => {
          const key = String(rawKey || "").trim();
          if (!key) return acc;
          const value = roundPrice(Math.max(0, Number(rawValue || 0)));
          if (!Number.isFinite(value)) return acc;
          acc[key] = value;
          return acc;
        }, {})
      : null;
    const resolveCartLineKey = (item) => {
      const explicitKey = String(item?.cart_key || item?.key || "").trim();
      if (explicitKey) return explicitKey;
      const numericId = Number(item?.id || 0);
      return numericId > 0 ? String(numericId) : "";
    };
    const lineStates = source.map((item) => {
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const baseTotal = roundPrice(Math.max(0, Number(getRightOrderCartLineTotal(item) || 0)));
      const storedOriginalLineTotal = getRightOrderStoredOriginalLineTotal(item);
      const cartLineKey = resolveCartLineKey(item);
      const localLineTotalRaw = cartLineKey && localLineTotalsByCartKey
        ? Number(localLineTotalsByCartKey[cartLineKey])
        : NaN;
      const hasLocalLineTotal = Number.isFinite(localLineTotalRaw);
      const localLineTotal = hasLocalLineTotal
        ? roundPrice(Math.max(0, localLineTotalRaw))
        : baseTotal;
      if (!(qty > 0) || isGiftRewardCartItem(item)) {
        return {
          baseTotal,
          currentTotal: baseTotal,
          originalTotal: baseTotal,
          eligibleForLocal: false,
          hasLocalLineTotal: false,
        };
      }
      const originalTotal = getRightOrderCartOriginalLineTotal(item, {
        qty,
        currentLineTotal: baseTotal,
        storedOriginalLineTotal,
      });
      return {
        baseTotal,
        currentTotal: localLineTotal,
        originalTotal: roundPrice(Math.max(originalTotal, baseTotal, localLineTotal)),
        eligibleForLocal: true,
        hasLocalLineTotal,
      };
    });
    const eligibleForLocalCount = lineStates.reduce((sum, entry) => (
      sum + (entry?.eligibleForLocal ? 1 : 0)
    ), 0);
    const resolvedLocalCount = lineStates.reduce((sum, entry) => (
      sum + (entry?.eligibleForLocal && entry?.hasLocalLineTotal ? 1 : 0)
    ), 0);
    const useLocalLineTotals = eligibleForLocalCount > 0 && resolvedLocalCount === eligibleForLocalCount;
    if (useLocalLineTotals) {
      return lineStates.map((entry) => {
        const currentTotal = roundPrice(Math.max(0, Number(entry?.currentTotal || 0)));
        const originalTotal = roundPrice(Math.max(
          Number(entry?.originalTotal || 0),
          Number(entry?.baseTotal || 0),
          currentTotal
        ));
        let discountPercent = 0;
        if (originalTotal > currentTotal && originalTotal > 0) {
          discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
        }
        if (!Number.isFinite(discountPercent) || discountPercent <= 0) discountPercent = 0;
        if (discountPercent > 100) discountPercent = 100;
        return {
          currentTotal,
          originalTotal: originalTotal > currentTotal ? originalTotal : currentTotal,
          discountPercent,
        };
      });
    }

    const baseLinesTotal = roundPrice(
      lineStates.reduce((sum, entry) => sum + Number(entry?.baseTotal || 0), 0)
    );
    const extraOrderDiscount = roundPrice(Math.max(
      0,
      baseLinesTotal - roundPrice(Number(finalItemsTotal || 0))
    ));
    const distributedByIndex = distributeRightOrderDiscountAcrossLines(lineStates, extraOrderDiscount);

    return lineStates.map((entry, index) => {
      const allocatedDiscount = roundPrice(Number(distributedByIndex.get(index) || 0));
      const currentTotal = roundPrice(Math.max(0, Number(entry?.baseTotal || 0) - allocatedDiscount));
      const originalTotal = roundPrice(Math.max(
        Number(entry?.originalTotal || 0),
        Number(entry?.baseTotal || 0),
        currentTotal
      ));
      let discountPercent = 0;
      if (originalTotal > currentTotal && originalTotal > 0) {
        discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
      }
      if (!Number.isFinite(discountPercent) || discountPercent <= 0) discountPercent = 0;
      if (discountPercent > 100) discountPercent = 100;
      return {
        currentTotal,
        originalTotal: originalTotal > currentTotal ? originalTotal : currentTotal,
        discountPercent,
      };
    });
  }

  function normalizeRightOrderDiscountBreakdownSourceKind(entry) {
    const raw = String(entry?.source_kind || entry?.sourceKind || entry?.source || entry?.kind || "").trim().toLowerCase();
    if (raw === "promo_code" || raw === "reward_promo") return "promo_code";
    if (raw === "reward_discount" || raw === "discount") return "discount";
    const key = String(entry?.key || "").trim().toLowerCase();
    if (key.startsWith("promo_")) return "promo_code";
    if (key.startsWith("discount_")) return "discount";
    return null;
  }

  function buildRightOrderDiscountBreakdownEntries(sourceEntries, opts = {}) {
    const promoCode = normalizeRightOrderBenefitsPromoCode(opts?.promoCode);
    return (Array.isArray(sourceEntries) ? sourceEntries : [])
      .map((entry) => {
        const sourceKind = normalizeRightOrderDiscountBreakdownSourceKind(entry);
        const entryPromoCode = sourceKind === "promo_code"
          ? (normalizeRightOrderBenefitsPromoCode(entry?.promo_code || entry?.code) || promoCode)
          : null;
        return {
          key: String(entry?.key || "").trim() || null,
          title: String(entry?.title || "Скидка").trim() || "Скидка",
          amount: roundPrice(Number(entry?.amount ?? entry?.discount_amount ?? 0)),
          sourceKind,
          promoCode: entryPromoCode,
        };
      })
      .filter((entry) => Number(entry.amount || 0) > 0);
  }

  function buildRightOrderDiscountBreakdownFingerprint(entry) {
    const key = String(entry?.key || "").trim().toLowerCase();
    if (key) return `key:${key}`;
    const sourceKind = String(entry?.sourceKind || entry?.source_kind || "").trim().toLowerCase();
    const title = String(entry?.title || "").trim().toLowerCase();
    const promoCode = normalizeRightOrderBenefitsPromoCode(entry?.promoCode || entry?.promo_code) || "";
    return `row:${sourceKind}:${title}:${promoCode}`;
  }

  function mergeRightOrderDiscountBreakdownEntries(...lists) {
    const merged = [];
    const seen = new Set();
    lists.forEach((list) => {
      (Array.isArray(list) ? list : []).forEach((entry) => {
        const amount = roundPrice(Number(entry?.amount || 0));
        if (!(amount > 0)) return;
        const normalized = {
          key: String(entry?.key || "").trim() || null,
          title: String(entry?.title || "Скидка").trim() || "Скидка",
          amount,
          sourceKind: normalizeRightOrderDiscountBreakdownSourceKind(entry),
          promoCode: normalizeRightOrderBenefitsPromoCode(entry?.promoCode || entry?.promo_code),
        };
        const fingerprint = buildRightOrderDiscountBreakdownFingerprint(normalized);
        if (seen.has(fingerprint)) return;
        seen.add(fingerprint);
        merged.push(normalized);
      });
    });
    return merged;
  }

  function appendRightOrderOtherDiscountEntryIfNeeded(entries, totalDiscount) {
    const targetTotal = roundPrice(Math.max(0, Number(totalDiscount || 0)));
    const normalizedEntries = Array.isArray(entries) ? entries.slice() : [];
    const breakdownTotal = roundPrice(
      normalizedEntries.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0)
    );
    const otherDiscount = roundPrice(Math.max(0, targetTotal - breakdownTotal));
    if (otherDiscount > 0) {
      normalizedEntries.push({
        key: "other_discount",
        title: "Прочие скидки",
        amount: otherDiscount,
        sourceKind: null,
        promoCode: null,
      });
    }
    return normalizedEntries;
  }

  function buildRightOrderItemLevelDiscountSummary(cartItems) {
    const source = Array.isArray(cartItems) ? cartItems : [];
    let comboDiscount = 0;
    let productDiscount = 0;
    let autoAddDiscount = 0;
    source.forEach((item) => {
      if (!item || isGiftRewardCartItem(item)) return;
      const lineTotal = getRightOrderCartLineTotal(item);
      const qty = Math.max(0, Number(item?.qty || item?.quantity || 0));
      const originalLineTotal = getRightOrderCartOriginalLineTotal(item, {
        qty,
        currentLineTotal: lineTotal,
      });

      const lineDiscount = roundPrice(Math.max(0, originalLineTotal - lineTotal));
      if (!(lineDiscount > 0)) return;

      if (String(item?.type || "") === "combo") {
        comboDiscount += lineDiscount;
      } else if (isRightOrderAutoAddItem(item)) {
        autoAddDiscount += lineDiscount;
      } else {
        productDiscount += lineDiscount;
      }
    });

    comboDiscount = roundPrice(comboDiscount);
    productDiscount = roundPrice(productDiscount);
    autoAddDiscount = roundPrice(autoAddDiscount);

    return {
      comboDiscount,
      productDiscount,
      autoAddDiscount,
      totalDiscount: roundPrice(comboDiscount + productDiscount + autoAddDiscount),
      breakdown: [
        { key: "combo_discount", title: "Комбо", amount: comboDiscount },
        { key: "product_discount", title: "Товарные скидки", amount: productDiscount },
        { key: "auto_add_discount", title: "Автодобавление", amount: autoAddDiscount },
      ].filter((entry) => Number(entry.amount || 0) > 0),
    };
  }

  function formatRightOrderDiscountBreakdownTitle(entry) {
    const title = String(entry?.title || "Скидка").trim() || "Скидка";
    const promoCode = normalizeRightOrderBenefitsPromoCode(entry?.promoCode);
    if (!promoCode) return title;
    return `${title} (${promoCode})`;
  }

  function buildRightOrderDiscountSummaryFromCart(cartItems, subtotal, opts = {}) {
    const itemLevelSummary = buildRightOrderItemLevelDiscountSummary(cartItems);
    const benefitsSummary = opts?.benefitsSummary && typeof opts.benefitsSummary === "object"
      ? opts.benefitsSummary
      : null;
    if (benefitsSummary && Number.isFinite(Number(benefitsSummary?.discount_total))) {
      const totalDiscount = roundPrice(Math.max(0, Number(benefitsSummary?.discount_total || 0)));
      const subtotalBeforeDiscountRaw = Number(benefitsSummary?.subtotal);
      const subtotalAfterDiscountRaw = Number(benefitsSummary?.items_total);
      const subtotalAfterDiscount = Number.isFinite(subtotalAfterDiscountRaw)
        ? roundPrice(Math.max(0, subtotalAfterDiscountRaw))
        : roundPrice(Math.max(0, Number(subtotal || 0)));
      let subtotalBeforeDiscount = Number.isFinite(subtotalBeforeDiscountRaw)
        ? roundPrice(Math.max(0, subtotalBeforeDiscountRaw))
        : roundPrice(subtotalAfterDiscount + totalDiscount);
      const minSubtotalBeforeDiscount = roundPrice(subtotalAfterDiscount + totalDiscount);
      if (subtotalBeforeDiscount < minSubtotalBeforeDiscount) {
        subtotalBeforeDiscount = minSubtotalBeforeDiscount;
      }
      let breakdown = buildRightOrderDiscountBreakdownEntries(benefitsSummary?.discount_breakdown, {
        promoCode: opts?.promoCode,
      });
      if (!breakdown.length && totalDiscount > 0) {
        breakdown = mergeRightOrderDiscountBreakdownEntries(itemLevelSummary.breakdown);
      }
      const breakdownTotal = roundPrice(
        breakdown.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0)
      );
      const resolvedTotalDiscount = roundPrice(
        breakdown.length > 0 ? breakdownTotal : totalDiscount
      );
      const minSubtotalBeforeDiscountResolved = roundPrice(subtotalAfterDiscount + resolvedTotalDiscount);
      if (subtotalBeforeDiscount < minSubtotalBeforeDiscountResolved) {
        subtotalBeforeDiscount = minSubtotalBeforeDiscountResolved;
      }
      return {
        subtotalBeforeDiscount,
        totalDiscount: resolvedTotalDiscount,
        breakdown,
        orderDiscountTitles: [],
      };
    }
    const subtotalAfterDiscount = roundPrice(Number(subtotal || 0));
    const customerOrderDiscount = roundPrice(Math.max(0, Number(opts?.customerOrderDiscount || 0)));
    const orderDiscountTitles = Array.isArray(opts?.orderDiscountTitles)
      ? opts.orderDiscountTitles.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const totalDiscount = roundPrice(itemLevelSummary.totalDiscount + customerOrderDiscount);
    let subtotalBeforeDiscount = roundPrice(Math.max(0, subtotalAfterDiscount + totalDiscount));
    let breakdown = mergeRightOrderDiscountBreakdownEntries(
      itemLevelSummary.breakdown,
      customerOrderDiscount > 0
        ? [{ key: "customer_discount", title: "\u041a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0430\u044f \u0441\u043a\u0438\u0434\u043a\u0430", amount: customerOrderDiscount }]
        : []
    );
    const breakdownTotal = roundPrice(
      breakdown.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0)
    );
    const resolvedTotalDiscount = roundPrice(
      breakdown.length > 0 ? breakdownTotal : totalDiscount
    );
    subtotalBeforeDiscount = roundPrice(Math.max(0, subtotalAfterDiscount + resolvedTotalDiscount));

    return {
      subtotalBeforeDiscount,
      totalDiscount: resolvedTotalDiscount,
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
      html += `<span class="order-summary-discount-breakdown-label">${escapeHtml(formatRightOrderDiscountBreakdownTitle(entry))}</span>`;
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

    const savedDiscountSummary = cartSummary?.savedDiscountSummary && typeof cartSummary.savedDiscountSummary === "object"
      ? cartSummary.savedDiscountSummary
      : null;
    const discountSummary = savedDiscountSummary || buildRightOrderDiscountSummaryFromCart(
      cartItems,
      cartSummary?.subtotalAfterCustomerDiscount,
      {
        customerOrderDiscount: cartSummary?.customerOrderDiscount,
        orderDiscountTitles: cartSummary?.customerOrderDiscountTitles,
        benefitsSummary: cartSummary?.benefitsPreviewSummary,
        promoCode: order?.form?.promo_code,
      }
    );
    const discountAmount = roundPrice(Number(discountSummary?.totalDiscount || 0));
    const hasDiscount = discountAmount > 0;
    const breakdownRows = Array.isArray(discountSummary?.breakdown) ? discountSummary.breakdown : [];
    const breakdownTitles = Array.isArray(discountSummary?.orderDiscountTitles) ? discountSummary.orderDiscountTitles : [];
    const hasBreakdown = hasDiscount && (breakdownRows.length > 0 || breakdownTitles.length > 0);
    const isBreakdownOpen = hasBreakdown && state.rightDiscountBreakdownOpenByOrder.get(orderId) === true;
    if (!hasBreakdown && orderId > 0) state.rightDiscountBreakdownOpenByOrder.delete(orderId);

    const form = order?.form && typeof order.form === "object" ? order.form : {};
    const promoCode = normalizeRightOrderBenefitsPromoCode(form.promo_code);
    const hasPromoCode = Boolean(promoCode);
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
        <div class="order-summary-row ${hasPromoCode ? "" : "hidden"}">
          <span class="order-summary-label">Промокод</span>
          <span class="order-summary-value">${hasPromoCode ? escapeHtml(promoCode) : ""}</span>
        </div>
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
        benefitsPreview: null,
        benefitsPreviewSummary: null,
        deliveryQuote: null,
        deliveryQuoteSource: null,
        deliveryCost: 0,
        deliveryApplied: 0,
        minOrderAmount: 0,
        freeDeliveryFrom: null,
        freeReached: false,
        leftForFree: 0,
        progress: 0,
        deliveryProgressState: "hidden",
        showDeliveryProgress: false,
        etaMinutes: null,
        deliveryZoneId: null,
        deliveryZoneName: null,
        deliveryStoreId: null,
        payableTotal: 0,
        savedDiscountSummary: null,
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

  function invalidateRightDeliveryQuote(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    clearRightDeliveryQuote(id, null, { render: false });
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

  function buildRightOrderPayloadItems(cartItems, opts = {}) {
    const source = Array.isArray(cartItems) ? cartItems : [];
    const localLineTotalsRaw = opts?.localLineTotalsByCartKey && typeof opts.localLineTotalsByCartKey === "object"
      ? opts.localLineTotalsByCartKey
      : null;
    const normalizedLocalLineTotals = localLineTotalsRaw
      ? Object.entries(localLineTotalsRaw).reduce((acc, [rawKey, rawValue]) => {
          const key = String(rawKey || "").trim();
          if (!key) return acc;
          const value = roundPrice(Math.max(0, Number(rawValue || 0)));
          if (!Number.isFinite(value)) return acc;
          acc[key] = value;
          return acc;
        }, {})
      : null;
    const resolveCartLineKey = (item) => String(item?.cart_key || item?.key || item?.id || "").trim();
    const localEligibleItems = source.filter((item) => (
      item
      && Math.max(0, Number(item?.qty || item?.quantity || 0)) > 0
      && !isGiftRewardCartItem(item)
    ));
    const useLocalLineTotals = Boolean(
      normalizedLocalLineTotals
      && localEligibleItems.length
      && localEligibleItems.every((item) => {
        const key = resolveCartLineKey(item);
        return key
          && Object.prototype.hasOwnProperty.call(normalizedLocalLineTotals, key)
          && Number.isFinite(Number(normalizedLocalLineTotals[key]));
      })
    );
    const resolveLineTotalForPayload = (item, fallbackValue) => {
      const fallback = roundPrice(Math.max(0, Number(fallbackValue || 0)));
      if (!useLocalLineTotals) return fallback;
      const key = resolveCartLineKey(item);
      if (!key) return fallback;
      const candidate = roundPrice(Math.max(0, Number(normalizedLocalLineTotals[key] || 0)));
      return Number.isFinite(candidate) ? candidate : fallback;
    };
    const out = [];

    source.forEach((item) => {
      const type = String(item?.type || "product");
      const qty = Math.max(1, Number(item?.qty || 1));
      const cartKey = String(item?.cart_key || item?.key || item?.id || "").trim();
      if (type === "combo") {
        const comboId = Number(item?.combo_id || 0);
        const baseLineTotal = roundPrice(Number(item?.sum || Number(item?.unit_price || 0) * qty));
        const lineTotal = resolveLineTotalForPayload(item, baseLineTotal);
        const oldLineTotalRaw = getRightOrderCartOriginalLineTotal(item, {
          qty,
          currentLineTotal: baseLineTotal,
        });
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
          cart_key: cartKey || null,
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
      const baseLineTotal = getRightOrderCartLineTotal(item);
      const lineTotal = resolveLineTotalForPayload(item, baseLineTotal);
      const originalLineTotalRaw = getRightOrderCartOriginalLineTotal(item, {
        qty,
        currentLineTotal: baseLineTotal,
      });
      const originalLineTotal = originalLineTotalRaw > lineTotal ? originalLineTotalRaw : lineTotal;
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
        cart_key: cartKey || null,
        product_id: productId,
        qty,
        option_item_ids: optionItemIds,
        option_items: optionItems,
        ingredients: mapCartItemIngredientsForPayload(item?.ingredients),
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: String(item?.variant?.label || "").trim() || null,
        is_gift_reward: isGiftRewardCartItem(item) ? 1 : 0,
        gift_reward_id: Number(item?.gift_reward_id || 0) > 0 ? Number(item.gift_reward_id) : null,
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
    if (isDeliveryMethod) {
      const refreshBaseSummary = getRightOrderCheckoutSummary(order);
      await ensureRightDeliveryQuoteFresh(order, refreshBaseSummary, { force: true, render: true });
      order = state.rightOrders[index] || order;
    }
    const summary = getRightOrderCheckoutSummary(order);
    const deliveryAddress = String(form.address || "").trim();
    if (isDeliveryMethod && !deliveryAddress) {
      showNewOrderAlert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0430\u0434\u0440\u0435\u0441 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438");
      return;
    }
    if (isDeliveryMethod && Number(summary.minOrderAmount || 0) > 0 && Number(summary.subtotalAfterCustomerDiscount || 0) < Number(summary.minOrderAmount || 0)) {
      showNewOrderAlert(`\u041c\u0438\u043d\u0438\u043c\u0430\u043b\u044c\u043d\u0430\u044f \u0441\u0443\u043c\u043c\u0430 \u0437\u0430\u043a\u0430\u0437\u0430 ${toMoney(summary.minOrderAmount)}`);
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

    const displayedLineStates = buildRightOrderCartLineStates(
      cartItems,
      roundPrice(Number(summary?.subtotalAfterCustomerDiscount || 0)),
      summary?.benefitsPreview
    );
    const localLineTotalsByCartKey = (() => {
      const map = {};
      cartItems.forEach((item, index) => {
        const stateRow = displayedLineStates[index] || null;
        const key = String(item?.cart_key || item?.key || item?.id || "").trim();
        if (!key || !stateRow) return;
        map[key] = roundPrice(Math.max(0, Number(stateRow?.currentTotal || 0)));
      });
      return Object.keys(map).length ? map : null;
    })();
    const items = buildRightOrderPayloadItems(cartItems, { localLineTotalsByCartKey });
    if (!items.length) {
      showNewOrderAlert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0431\u0440\u0430\u0442\u044c \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430");
      return;
    }
    const selectedOrderStatusId = isEditSubmit ? Number(form.orderStatusId || 0) : 0;
    const initialOrderStatusId = isEditSubmit ? Number(form.orderStatusInitialId || 0) : 0;
    const deliveryAddressDraft = isDeliveryMethod ? getRightOrderStoredAddressDraft(id, order) : null;
    const savedDiscountSummary = summary?.savedDiscountSummary && typeof summary.savedDiscountSummary === "object"
      ? summary.savedDiscountSummary
      : null;
    const benefitsPreviewSummary = savedDiscountSummary
      ? null
      : (summary?.benefitsPreviewSummary && typeof summary.benefitsPreviewSummary === "object"
        ? summary.benefitsPreviewSummary
        : null);
    const discountSummary = savedDiscountSummary || buildRightOrderDiscountSummaryFromCart(
      cartItems,
      summary?.subtotalAfterCustomerDiscount,
      {
        benefitsSummary: benefitsPreviewSummary,
        customerOrderDiscount: benefitsPreviewSummary ? 0 : summary?.customerOrderDiscount,
        orderDiscountTitles: benefitsPreviewSummary ? [] : summary?.customerOrderDiscountTitles,
        promoCode: form.promo_code,
      }
    );

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
      promo_code: normalizeRightOrderBenefitsPromoCode(form.promo_code),
      selected_discount_id: normalizeRightOrderBenefitsSelectedId(form.selected_discount_id),
      selected_discount_source: normalizeRightOrderBenefitsDiscountSource(form.selected_discount_source),
      selected_promo_source: normalizeRightOrderBenefitsPromoSource(form.selected_promo_source),
      selected_promo_reward_id: normalizeRightOrderBenefitsSelectedId(form.selected_promo_reward_id),
      benefits_preview_mode: String(form.benefits_preview_mode || "").trim()
        ? normalizeRightOrderBenefitsMode(form.benefits_preview_mode)
        : null,
      items,
    };
    if (savedDiscountSummary) {
      payload.benefits_items_total_override = roundPrice(Number(summary?.subtotalAfterCustomerDiscount || 0));
    } else if (benefitsPreviewSummary) {
      payload.benefits_items_total_override = roundPrice(Number(benefitsPreviewSummary?.items_total || 0));
    }
    if (Number(discountSummary?.totalDiscount || 0) > 0) {
      payload.discount_amount_override = roundPrice(Number(discountSummary?.totalDiscount || 0));
      payload.discounts_json = (Array.isArray(discountSummary?.breakdown) ? discountSummary.breakdown : [])
        .map((entry) => ({
          key: entry.key || null,
          title: entry.title,
          discount_amount: roundPrice(Number(entry?.amount || 0)),
          amount: roundPrice(Number(entry?.amount || 0)),
          apply_to: entry?.key === "combo_discount"
            ? "combo"
            : (entry?.key === "product_discount" || entry?.key === "auto_add_discount" ? "product" : "order"),
          source_kind: entry.sourceKind || null,
          promo_code: entry.promoCode || null,
        }))
        .filter((entry) => Number(entry.discount_amount || 0) > 0);
    }
    if (isDeliveryMethod && deliveryAddressDraft) {
      payload.delivery_address_city = deliveryAddressDraft.city || null;
      payload.delivery_address_street = deliveryAddressDraft.street || null;
      payload.delivery_address_house = deliveryAddressDraft.house || null;
      payload.delivery_address_entrance = deliveryAddressDraft.entrance || null;
      payload.delivery_address_floor = deliveryAddressDraft.floor || null;
      payload.delivery_address_apartment = deliveryAddressDraft.apartment || null;
      payload.address_comment = deliveryAddressDraft.comment || null;
      payload.delivery_address_ref = deliveryAddressDraft.address_ref || null;
      payload.delivery_selected_object_type = deliveryAddressDraft.selected_object_type || null;
      payload.delivery_resolved_city_source_key = deliveryAddressDraft.resolved_city_source_key || null;
      payload.delivery_address_context_locality = deliveryAddressDraft.address_context_locality || null;
      payload.delivery_address_normalized_display = deliveryAddressDraft.address_normalized_display || null;
      payload.delivery_address_lat = deliveryAddressDraft.lat;
      payload.delivery_address_lng = deliveryAddressDraft.lng;
      payload.delivery_zone_id = deliveryAddressDraft.delivery_zone_id;
      payload.delivery_store_id = deliveryAddressDraft.delivery_store_id;
    }

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
        latestForm.promo_code = null;
        latestForm.selected_discount_id = null;
        latestForm.selected_discount_source = null;
        latestForm.selected_promo_source = null;
        latestForm.selected_promo_reward_id = null;
        latestForm.benefits_preview_mode = null;
        state.rightOrders[latestIndex] = { ...latestOrder, form: latestForm };
        invalidateRightOrderBenefitsPreview(id);
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
    state.rightPaymentTypes = (Array.isArray(snapshot.rightPaymentTypes) ? snapshot.rightPaymentTypes : [])
      .map(normalizeRightPaymentTypeRef)
      .filter((item) => item.code)
      .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    state.rightTimeOptions = (Array.isArray(snapshot.rightTimeOptions) ? snapshot.rightTimeOptions : [])
      .map(normalizeRightTimeOptionRef)
      .filter((item) => item.code)
      .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
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
    return buildRightAddressLine(getAddressDraftFromClientAddress(address, getDefaultRightAddressCity()));
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
          primaryAddressId: Number(primaryAddress?.id || 0) || 0,
        };
      }
      state.rightClientLookupCache.set(cacheKey, payload);
    }

    if (reqSeq !== state.rightClientLookupReqSeq) return;
    const index = state.rightOrders.findIndex((order) => Number(order?.id || 0) === Number(orderId || 0));
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const previousClientId = Number(form.clientId || 0) || null;
    const previousGiftItems = Array.isArray(form.cartItems)
      ? form.cartItems.filter((item) => Number(item?.is_gift_reward || 0) === 1)
      : [];
    if (payload?.found) {
      form.clientId = Number(payload.clientId || 0) || null;
      form.name = payload.name || form.name || "";
      form.address = payload.address || form.address || "";
      state.rightClientAddressesByOrder.set(Number(orderId || 0), Array.isArray(payload.addresses) ? payload.addresses : []);
      const primaryAddress = (Array.isArray(payload.addresses) ? payload.addresses : []).find(
        (item) => Number(item?.id || 0) === Number(payload.primaryAddressId || 0)
      ) || null;
      if (Number(payload.primaryAddressId || 0) > 0) {
        state.rightAddressSelectedIdByOrder.set(Number(orderId || 0), Number(payload.primaryAddressId || 0));
      } else {
        state.rightAddressSelectedIdByOrder.delete(Number(orderId || 0));
      }
      state.rightAddressEditingIdByOrder.set(Number(orderId || 0), 0);
      if (primaryAddress) {
        state.rightAddressDraftByOrder.set(
          Number(orderId || 0),
          getAddressDraftFromClientAddress(primaryAddress, getDefaultRightAddressCity())
        );
      }
      const discounts = Array.isArray(payload.discounts) ? payload.discounts : [];
      state.rightClientDiscountsByClientId.set(Number(payload.clientId || 0), discounts);
      if (previousClientId && previousClientId !== Number(payload.clientId || 0)) {
        await restoreRightOrderGiftRewardsFromItems(Number(orderId || 0), previousGiftItems, {
          clientId: previousClientId,
          silent: true,
        });
        clearRightOrderGiftRewardItems(Number(orderId || 0), { render: false });
        form.promo_code = null;
        form.selected_discount_id = null;
        form.selected_discount_source = null;
        form.selected_promo_source = null;
        form.selected_promo_reward_id = null;
        form.benefits_preview_mode = null;
      }
    } else {
      if (previousClientId) {
        await restoreRightOrderGiftRewardsFromItems(Number(orderId || 0), previousGiftItems, {
          clientId: previousClientId,
          silent: true,
        });
        clearRightOrderGiftRewardItems(Number(orderId || 0), { render: false });
      }
      form.clientId = null;
      form.promo_code = null;
      form.selected_discount_id = null;
      form.selected_discount_source = null;
      form.selected_promo_source = null;
      form.selected_promo_reward_id = null;
      form.benefits_preview_mode = null;
      state.rightClientAddressesByOrder.set(Number(orderId || 0), []);
      state.rightAddressSelectedIdByOrder.delete(Number(orderId || 0));
      state.rightAddressEditingIdByOrder.delete(Number(orderId || 0));
      state.rightAddressDraftByOrder.delete(Number(orderId || 0));
    }
    invalidateRightDeliveryQuote(Number(orderId || 0));
    state.rightOrders[index] = { ...order, form };
    invalidateRightOrderBenefitsPreview(Number(orderId || 0));
    scheduleRightOrderBenefitsRefresh(Number(orderId || 0));
    void prefetchRightOrderBenefitsModes(Number(orderId || 0), { force: false });
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
    if (key === "pickupMethod" || key === "address" || key === "clientId") {
      invalidateRightDeliveryQuote(id);
    }
    if (key === "pickupMethod" || key === "clientId" || key === "phone") {
      invalidateRightOrderBenefitsPreview(id);
      scheduleRightOrderBenefitsRefresh(id);
    }
  }

  function createRightOrderBenefitIcon(iconClass) {
    return window.AdminBenefitsModal?.createIcon(iconClass) || document.createElement("i");
  }

  function getRightOrderBenefitRewardIconName(kind) {
    return window.AdminBenefitsModal?.getRewardIconName(kind) || "fa-gift";
  }

  function getRightOrderBenefitRewardKindLabel(kind) {
    const normalizedKind = String(kind || "").trim().toLowerCase();
    if (normalizedKind === "promo_code") return "Промокод";
    if (normalizedKind === "discount") return "Скидка";
    return "Подарок";
  }

  function getRightOrderBenefitGiftProducts(item) {
    return (Array.isArray(item?.products) ? item.products : [])
      .filter((product) => Number(product?.id || product?.product_id || 0) > 0);
  }

  function getRightOrderBenefitSafePhotos(product) {
    const photos = getProductPhotos(product);
    return photos.length ? photos : [""];
  }

  function normalizeRightOrderBenefitProductConfigMode(value, fallback = "any") {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "exact") return "exact";
    if (raw === "any") return "any";
    return String(fallback || "").trim().toLowerCase() === "exact" ? "exact" : "any";
  }

  function normalizeRightOrderBenefitProductConfig(value, fallbackProductId = null) {
    const source = value && typeof value === "object" ? value : null;
    const productId = Number(source?.product_id || fallbackProductId || 0);
    if (!(productId > 0)) return null;
    const options = (Array.isArray(source?.options) ? source.options : [])
      .map((option) => {
        const optionId = Number(option?.id || option?.option_item_id || 0);
        if (!(optionId > 0)) return null;
        const qty = Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1);
        const targetProductId = Number(option?.target_product_id || option?.product_id || 0);
        const groupId = Number(option?.group_id || option?.option_group_id || 0);
        const variantGroupId = Number(option?.variant_group_id || 0);
        const variantValueIndex = Number(option?.variant_value_index);
        return {
          id: optionId,
          qty,
          group_id: groupId > 0 ? groupId : null,
          target_product_id: targetProductId > 0 ? targetProductId : null,
          product_id: targetProductId > 0 ? targetProductId : null,
          variant_group_id: variantGroupId > 0 ? variantGroupId : null,
          variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
            ? variantValueIndex
            : null,
        };
      })
      .filter(Boolean);
    const ingredients = (Array.isArray(source?.ingredients) ? source.ingredients : [])
      .map((ingredient) => {
        const ingredientId = Number(ingredient?.ingredient_id || ingredient?.product_id || 0);
        if (!(ingredientId > 0)) return null;
        return {
          ingredient_id: ingredientId,
          qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
        };
      })
      .filter(Boolean);
    const variantGroupId = Number(source?.variant_group_id || 0);
    const variantValueIndex = Number(source?.variant_value_index);
    return {
      type: "product",
      product_id: productId,
      variant_group_id: variantGroupId > 0 ? variantGroupId : null,
      variant_value_index: Number.isFinite(variantValueIndex) && variantValueIndex >= 0
        ? variantValueIndex
        : null,
      options,
      ingredients,
    };
  }

  function buildRightOrderBenefitAnyConfigText() {
    return "Любой вариант / любой состав";
  }

  function formatRightOrderBenefitIngredientLine(ingredient) {
    const name = String(ingredient?.name || ingredient?.ingredient_name || "").trim();
    if (!name) return "";
    const qty = Number(ingredient?.qty ?? ingredient?.quantity ?? 0);
    const unit = String(ingredient?.unit || ingredient?.unit_label || "").trim();
    if (Number.isFinite(qty) && qty > 0) {
      return unit ? `${name}: ${qty} ${unit}` : `${name}: ${qty}`;
    }
    return name;
  }

  async function resolveRightOrderBenefitConfiguredProduct(item, {
    forceDefaultConfig = false,
  } = {}) {
    const source = item && typeof item === "object" ? { ...item } : {};
    const productId = Number(source?.product_id || source?.id || 0);
    const configMode = normalizeRightOrderBenefitProductConfigMode(source?.config_mode, "any");
    const requestedConfig = normalizeRightOrderBenefitProductConfig(source?.product_config, productId);
    const next = {
      ...source,
      id: Number(source?.id || productId || 0) || null,
      product_id: productId > 0 ? productId : null,
      config_mode: configMode,
      product_config: requestedConfig,
      config_display_lines: Array.isArray(source?.config_display_lines)
        ? source.config_display_lines.slice()
        : [],
    };
    if (!(productId > 0)) {
      if (configMode === "any" && !requestedConfig) {
        next.config_note = buildRightOrderBenefitAnyConfigText();
        next.config_display_lines = [next.config_note];
      }
      return next;
    }
    if (configMode === "any" && !requestedConfig && !forceDefaultConfig) {
      next.config_note = buildRightOrderBenefitAnyConfigText();
      next.config_display_lines = [next.config_note];
      return next;
    }

    try {
      const product = await ensureProductById(productId);
      if (!product) return next;
      await loadVariantsForProducts([product]);
      await loadIngredientsForProducts([product]);
      await loadOptionsForProducts([product]);
      await loadOptionDetailsForProducts([product]);

      const variants = Array.isArray(state.productVariants.get(productId))
        ? state.productVariants.get(productId)
        : [];
      const optionGroups = Array.isArray(state.productOptionGroups.get(productId))
        ? state.productOptionGroups.get(productId)
        : [];
      const ingredientsCatalog = Array.isArray(state.productIngredients.get(productId))
        ? state.productIngredients.get(productId)
        : [];

      const variantGroup = (() => {
        const requestedGroupId = Number(requestedConfig?.variant_group_id || 0);
        if (requestedGroupId > 0) {
          const matched = variants.find((group) => (
            Number(group?.id || group?.variant_group_id || 0) === requestedGroupId
          ));
          if (matched) return matched;
        }
        return variants[0] || null;
      })();
      const variantValues = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
      let variantValueIndex = requestedConfig?.variant_value_index;
      if (!Number.isFinite(Number(variantValueIndex))) {
        variantValueIndex = variantGroup?.default_value_index;
      }
      if (!Number.isFinite(Number(variantValueIndex))) {
        variantValueIndex = variantValues.length ? 0 : null;
      }
      if (variantValues.length && Number.isFinite(Number(variantValueIndex))) {
        variantValueIndex = Math.max(0, Math.min(Number(variantValueIndex), variantValues.length - 1));
      } else if (!Number.isFinite(Number(variantValueIndex))) {
        variantValueIndex = null;
      }
      const variantLabel = Number.isFinite(Number(variantValueIndex)) && variantValues[Number(variantValueIndex)] != null
        ? String(variantValues[Number(variantValueIndex)] || "").trim()
        : "";
      const variantGroupId = Number(variantGroup?.id || variantGroup?.variant_group_id || 0);
      const variantGroupTitle = String(variantGroup?.title || variantGroup?.title_label || "").trim();
      const variantUnit = String(
        variantGroup?.unit_short_title || variantGroup?.unit_title || variantGroup?.unit_code || ""
      ).trim();

      const ingredientQty = new Map();
      ingredientsCatalog.forEach((ingredient) => {
        const ingredientId = Number(ingredient?.ingredient_id || 0);
        if (!(ingredientId > 0)) return;
        ingredientQty.set(ingredientId, Number(ingredient?.quantity ?? 0) || 0);
      });
      (Array.isArray(requestedConfig?.ingredients) ? requestedConfig.ingredients : []).forEach((ingredient) => {
        const ingredientId = Number(ingredient?.ingredient_id || 0);
        if (!(ingredientId > 0)) return;
        ingredientQty.set(ingredientId, Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0);
      });

      const changedIngredients = ingredientsCatalog
        .map((ingredient) => {
          const ingredientId = Number(ingredient?.ingredient_id || 0);
          if (!(ingredientId > 0)) return null;
          const baseQty = Number(ingredient?.quantity ?? 0) || 0;
          const currentQty = Number(ingredientQty.get(ingredientId) ?? baseQty);
          if (Math.abs(currentQty - baseQty) < 0.0001) return null;
          return {
            ingredient_id: ingredientId,
            ingredient_name: String(ingredient?.ingredient_name || ingredient?.name || "").trim(),
            name: String(ingredient?.ingredient_name || ingredient?.name || "").trim(),
            qty: currentQty,
            quantity: currentQty,
            unit_id: ingredient?.unit_id != null ? Number(ingredient.unit_id) : null,
            unit: String(ingredient?.unit_short_title || ingredient?.unit_title || ingredient?.unit_code || "").trim(),
            unit_label: String(ingredient?.unit_short_title || ingredient?.unit_title || ingredient?.unit_code || "").trim(),
          };
        })
        .filter(Boolean);

      const optionItems = (Array.isArray(requestedConfig?.options) ? requestedConfig.options : [])
        .map((option) => {
          const optionId = Number(option?.id || 0);
          if (!(optionId > 0)) return null;
          let optionMeta = null;
          let optionGroupId = Number(option?.group_id || option?.option_group_id || 0) || null;
          optionGroups.some((group) => {
            const groupId = Number(group?.group_id || group?.id || 0) || null;
            const details = groupId ? state.optionGroupDetails.get(groupId) : null;
            const items = Array.isArray(details?.items) ? details.items : [];
            const found = items.find((entry) => Number(entry?.id || entry?.option_item_id || 0) === optionId) || null;
            if (found) {
              optionMeta = found;
              if (!optionGroupId && groupId) optionGroupId = groupId;
              return true;
            }
            return false;
          });
          const selectedVariantIndex = Number.isFinite(Number(option?.variant_value_index))
            ? Number(option.variant_value_index)
            : getOptionItemDefaultVariantIndex(optionMeta);
          const optionPrice = roundPrice(
            Number(getOptionItemBasePrice(optionMeta) || 0)
            + (
              Number.isFinite(Number(selectedVariantIndex))
                ? Number(getOptionItemVariantDiff(optionMeta, Number(selectedVariantIndex)) || 0)
                : 0
            )
          );
          return {
            id: optionId,
            qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
            title: String(optionMeta?.name || optionMeta?.product_name || "").trim(),
            price: optionPrice,
            group_id: optionGroupId,
            target_product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
            product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
            variant_group_id: Number(option?.variant_group_id || 0) || null,
            variant_value_index: Number.isFinite(Number(option?.variant_value_index))
              ? Number(option.variant_value_index)
              : null,
            variant_label: Number.isFinite(Number(selectedVariantIndex))
              ? String(formatOptionVariantLabel(optionMeta, Number(selectedVariantIndex)) || "").trim()
              : "",
          };
        })
        .filter(Boolean);

      const optionTotal = optionItems.reduce((sum, option) => (
        sum + (Number(option?.price || 0) * Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1))
      ), 0);

      let resolvedUnitPrice = Array.isArray(variants) && variants.length
        ? Number(getVariantUnitPriceByBase(product, variants, Number.isFinite(Number(variantValueIndex)) ? Number(variantValueIndex) : 0, Number(product?.price || source?.price || 0)) || 0)
        : Number(product?.price || source?.price || 0);
      resolvedUnitPrice += optionTotal;
      ingredientsCatalog.forEach((ingredient) => {
        const ingredientId = Number(ingredient?.ingredient_id || 0);
        if (!(ingredientId > 0)) return;
        const currentQty = Number(ingredientQty.get(ingredientId) ?? Number(ingredient?.quantity ?? 0) ?? 0);
        const baseQty = Number(ingredient?.quantity ?? 0) || 0;
        const ingredientBaseQty = ingredient?.ingredient_base_qty != null && Number(ingredient.ingredient_base_qty) > 0
          ? Number(ingredient.ingredient_base_qty)
          : 1;
        const ingredientPrice = Number(ingredient?.ingredient_price || 0);
        const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0
          ? ingredientPrice / ingredientBaseQty
          : (ingredientPrice > 0 ? ingredientPrice : 0);
        const pricePerUnit = ingredient?.price_override != null && Number(ingredient.price_override) >= 0
          ? Number(ingredient.price_override)
          : catalogBasePrice;
        const currentQtyInBase = getQtyInBase(ingredient, currentQty);
        const baseQtyInBase = getQtyInBase(ingredient, baseQty);
        const diff = (currentQtyInBase != null && baseQtyInBase != null && Number.isFinite(pricePerUnit))
          ? pricePerUnit * (currentQtyInBase - baseQtyInBase)
          : (Number.isFinite(pricePerUnit) ? (currentQty - baseQty) * pricePerUnit : 0);
        resolvedUnitPrice += diff;
      });
      resolvedUnitPrice = Math.max(0, roundPrice(resolvedUnitPrice));

      const normalizedConfig = {
        type: "product",
        product_id: productId,
        variant_group_id: variantGroupId > 0 ? variantGroupId : null,
        variant_value_index: Number.isFinite(Number(variantValueIndex)) ? Number(variantValueIndex) : null,
        options: optionItems.map((option) => ({
          id: Number(option?.id || 0),
          qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
          group_id: Number(option?.group_id || 0) || null,
          target_product_id: Number(option?.target_product_id || option?.product_id || 0) || null,
          variant_group_id: Number(option?.variant_group_id || 0) || null,
          variant_value_index: Number.isFinite(Number(option?.variant_value_index))
            ? Number(option.variant_value_index)
            : null,
        })),
        ingredients: ingredientsCatalog
          .map((ingredient) => {
            const ingredientId = Number(ingredient?.ingredient_id || 0);
            if (!(ingredientId > 0)) return null;
            return {
              ingredient_id: ingredientId,
              qty: Number(ingredientQty.get(ingredientId) ?? Number(ingredient?.quantity ?? 0) ?? 0),
            };
          })
          .filter(Boolean),
      };

      next.name = String(source?.name || source?.title || product?.name || "").trim() || "Товар";
      next.title = String(source?.title || next.name).trim() || next.name;
      next.description_short = String(source?.description_short || product?.description_short || "").trim();
      next.photos = Array.isArray(source?.photos) && source.photos.length ? source.photos : getRightOrderBenefitSafePhotos(product);
      next.photo_url = String(source?.photo_url || next.photos?.[0] || "").trim() || null;
      next.price = resolvedUnitPrice;
      next.line_total = resolvedUnitPrice;
      next.option_items = optionItems;
      next.option_item_ids = optionItems.map((option) => Number(option?.id || 0)).filter((id) => id > 0);
      next.options = optionItems;
      next.ingredients = changedIngredients;
      next.ingredients_display = changedIngredients;
      next.variant_group_id = normalizedConfig.variant_group_id;
      next.variant_value_index = normalizedConfig.variant_value_index;
      next.variant_label = variantLabel;
      next.variant_group_title = variantGroupTitle;
      next.variant_unit = variantUnit;
      next.variants = variantLabel
        ? [{
            variant_group_id: normalizedConfig.variant_group_id,
            variant_value_index: normalizedConfig.variant_value_index,
            group_title: variantGroupTitle,
            value: variantLabel,
            label: variantLabel,
            unit: variantUnit,
          }]
        : [];
      next.product_config = normalizedConfig;
      const displayLines = [];
      if (variantLabel) {
        displayLines.push([variantGroupTitle, variantLabel, variantUnit].filter(Boolean).join(" ").trim());
      }
      changedIngredients.forEach((ingredient) => {
        const line = formatRightOrderBenefitIngredientLine(ingredient);
        if (line) displayLines.push(line);
      });
      if (!displayLines.length && configMode === "exact") {
        displayLines.push("Только выбранный состав");
      }
      next.config_display_lines = displayLines;
      if (!displayLines.length && configMode === "any" && !requestedConfig && !forceDefaultConfig) {
        next.config_note = buildRightOrderBenefitAnyConfigText();
        next.config_display_lines = [next.config_note];
      }
      return next;
    } catch (error) {
      console.warn("Failed to resolve right-order benefit product config:", productId, error);
      if (configMode === "any" && !requestedConfig) {
        next.config_note = buildRightOrderBenefitAnyConfigText();
        next.config_display_lines = [next.config_note];
      }
      return next;
    }
  }

  function bindRightOrderHorizontalTrack(track) {
    if (window.AdminBenefitsModal?.bindHorizontalTrack) {
      window.AdminBenefitsModal.bindHorizontalTrack(track);
      return;
    }
    if (!track || track.dataset.progressTrackBound === "1") return;

    const dragThresholdPx = 8;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let isMouseDrag = false;
    let isDragging = false;
    let suppressClickUntil = 0;

    const hasOverflow = () => track.scrollWidth > track.clientWidth + 1;
    const markSuppressClick = () => {
      suppressClickUntil = Date.now() + 280;
    };
    const finishPointer = (event) => {
      if (pointerId == null) return;
      if (event && event.pointerId !== pointerId) return;
      if (isMouseDrag) {
        track.classList.remove("is-dragging");
        try {
          track.releasePointerCapture(pointerId);
        } catch {}
      }
      pointerId = null;
      isMouseDrag = false;
      isDragging = false;
    };

    track.addEventListener("pointerdown", (event) => {
      if (!event) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!hasOverflow()) return;
      pointerId = event.pointerId;
      startX = Number(event.clientX || 0);
      startY = Number(event.clientY || 0);
      startLeft = Number(track.scrollLeft || 0);
      isMouseDrag = event.pointerType === "mouse";
      isDragging = false;
      if (isMouseDrag) {
        track.classList.add("is-dragging");
        try {
          track.setPointerCapture(pointerId);
        } catch {}
      }
    });

    track.addEventListener("pointermove", (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      const deltaX = Number(event.clientX || 0) - startX;
      const deltaY = Number(event.clientY || 0) - startY;
      const absDeltaX = Math.abs(deltaX);
      if (!isDragging) {
        if (absDeltaX < dragThresholdPx) return;
        if (!isMouseDrag && absDeltaX <= Math.abs(deltaY)) return;
        isDragging = true;
      }
      markSuppressClick();
      if (!isMouseDrag) return;
      event.preventDefault();
      track.scrollLeft = startLeft - deltaX;
    });

    track.addEventListener("pointerup", finishPointer);
    track.addEventListener("pointercancel", finishPointer);
    track.addEventListener("lostpointercapture", finishPointer);

    track.addEventListener("wheel", (event) => {
      if (!hasOverflow()) return;
      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      if (!Number.isFinite(primaryDelta) || Math.abs(primaryDelta) < 0.5) return;
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const currentLeft = Number(track.scrollLeft || 0);
      const nextLeft = Math.max(0, Math.min(maxScrollLeft, currentLeft + primaryDelta));
      if (Math.abs(nextLeft - currentLeft) < 0.5) return;
      event.preventDefault();
      markSuppressClick();
      track.scrollLeft = nextLeft;
    }, { passive: false });

    track.addEventListener("click", (event) => {
      if (suppressClickUntil <= Date.now()) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = 0;
    }, true);

    track.dataset.progressTrackBound = "1";
  }

  function bindRightOrderWheelTrack(track) {
    if (!track || track.dataset.horizontalWheelBound === "1") return;
    track.addEventListener("wheel", (event) => {
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      if (!(maxScrollLeft > 0)) return;
      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      if (!Number.isFinite(primaryDelta) || Math.abs(primaryDelta) < 0.5) return;
      const currentLeft = Number(track.scrollLeft || 0);
      const nextLeft = Math.max(0, Math.min(maxScrollLeft, currentLeft + primaryDelta));
      if (Math.abs(nextLeft - currentLeft) < 0.5) return;
      event.preventDefault();
      event.stopPropagation();
      track.scrollLeft = nextLeft;
    }, { passive: false, capture: true });
    track.dataset.horizontalWheelBound = "1";
  }

  function isRightOrderCompletedCustomerLimitPromoBenefit(item) {
    return window.AdminBenefitsModal?.isCompletedPromoBenefit(item, {
      sourceResolver: (entry) => {
        const source = String(entry?.source || "").trim().toLowerCase();
        return source === "reward_promo" ? "promo_code" : source;
      },
    }) === true;
  }

  function isRightOrderCompletedCustomerLimitDiscountBenefit(item) {
    return window.AdminBenefitsModal?.isCompletedDiscountBenefit(item) === true;
  }

  function formatRightOrderBenefitsDate(value) {
    return window.AdminBenefitsModal?.formatDate(value) || "";
  }

  function buildRightOrderBenefitCompletedDiscountCard(item) {
    return window.AdminBenefitsModal?.buildCompletedDiscountCard(item) || {};
  }

  function buildRightOrderBenefitCompletedPromoCard(item) {
    return window.AdminBenefitsModal?.buildCompletedPromoCard(item) || {};
  }

  function isRightOrderGiftBenefitVisible(item) {
    const products = getRightOrderBenefitGiftProducts(item);
    return Number(item?.reward_id || item?.id || 0) > 0
      && products.length > 0
      && item?.is_receivable !== false;
  }

  function getRightOrderBenefitsRenderData(previewData) {
    return window.AdminBenefitsModal?.buildRenderData(previewData, {
      mode: normalizeRightOrderBenefitsMode(previewData?.mode),
      isCompletedDiscount: isRightOrderCompletedCustomerLimitDiscountBenefit,
      isCompletedPromo: isRightOrderCompletedCustomerLimitPromoBenefit,
      mapCompletedDiscount: buildRightOrderBenefitCompletedDiscountCard,
      mapCompletedPromo: buildRightOrderBenefitCompletedPromoCard,
      giftVisibility: isRightOrderGiftBenefitVisible,
    }) || { discounts: [], promo_codes: [], gifts: [], progress: [], completed: [] };
  }

  function createRightOrderBenefitsSection(title, emptyText, opts = {}) {
    return window.AdminBenefitsModal?.createSection(title, emptyText, opts) || null;
  }

  function setRightOrderBenefitsSectionItems(sectionRef, items, renderItem) {
    window.AdminBenefitsModal?.setSectionItems(sectionRef, items, renderItem);
  }

  function createRightOrderBenefitsFrame(options = {}) {
    return window.AdminBenefitsModal?.createScrollableFrame(options) || null;
  }

  function bindRightOrderBenefitDetailFallback(node, onOpenDetails) {
    return window.AdminBenefitsModal?.bindDetailFallback(node, onOpenDetails) || node;
  }

  function getRightClientBenefitsCatalogActionKey(prefix, item) {
    const id = Number(item?.id || item?.reward_id || item?.discount_id || 0);
    return id > 0 ? `${prefix}:${id}` : `${prefix}:${String(item?.id || item?.discount_id || "")}`;
  }

  function closeRightClientBenefitsCatalogOverlay() {
    window.AdminBenefitsModal?.hide({ clearBody: false });
    state.clientBenefitsCatalogModal.customerId = 0;
    state.clientBenefitsCatalogModal.data = null;
    state.clientBenefitsCatalogModal.loading = false;
    state.clientBenefitsCatalogModal.error = "";
    state.clientBenefitsCatalogModal.busyActionKey = "";
  }

  function renderRightClientBenefitsCatalogDisplayCard(item) {
    return window.AdminBenefitsModal?.renderDisplayCard(item) || document.createElement("div");
  }

  async function issueRightClientBenefitsCatalogItem(item, issueAction, actionKey) {
    const customerId = Number(state.clientBenefitsCatalogModal.customerId || 0);
    const discountId = Number(item?.discount_id || item?.id || 0);
    const action = String(issueAction || item?.issue_action || "").trim().toLowerCase();
    if (!(customerId > 0) || !(discountId > 0) || !action) {
      throw new Error("BENEFIT_ISSUE_INVALID");
    }
    state.clientBenefitsCatalogModal.busyActionKey = String(actionKey || "");
    renderRightClientBenefitsCatalogOverlay();
    try {
      const json = await apiJson(`/api/admin/clients/${customerId}/benefits/issue`, {
        method: "POST",
        body: JSON.stringify({
          discount_id: discountId,
          issue_action: action,
        }),
      });
      state.clientBenefitsCatalogModal.data = json?.data && typeof json.data === "object" ? json.data : {};
      state.rightClientDiscountsByClientId.delete(customerId);
      void ensureRightClientDiscountsLoaded(customerId);
    } finally {
      state.clientBenefitsCatalogModal.busyActionKey = "";
      renderRightClientBenefitsCatalogOverlay();
    }
  }

  function renderRightClientBenefitsCatalogDiscountCard(item) {
    if (item?.is_issued === true || item?.can_issue !== true) {
      return renderRightClientBenefitsCatalogDisplayCard(item);
    }
    const actionKey = getRightClientBenefitsCatalogActionKey("discount", item);
    return window.AdminBenefitsModal?.renderDiscountCard(item, {
      canToggle: item?.can_issue === true,
      isStackable: isRightOrderBenefitStackable(item),
      actionLabel: "Выдать",
      onAction: (entry) => issueRightClientBenefitsCatalogItem(entry, "discount", actionKey),
      isBusy: state.clientBenefitsCatalogModal.busyActionKey === actionKey,
      disabledReason: item?.issue_disabled_reason || "",
    }) || document.createElement("div");
  }

  function renderRightClientBenefitsCatalogPromoCard(item) {
    if (item?.is_issued === true) {
      const codeText = String(item?.issued_code || item?.code || "").trim()
        || (String(item?.promo_code_mode || "").trim().toLowerCase() === "unique" ? "Уникальный код" : "-");
      return window.AdminBenefitsModal?.renderPromoCard(item, {
        canToggle: false,
        codeText,
        actionLabel: "Выдано",
        disabledReason: "",
      }) || document.createElement("div");
    }
    if (item?.can_issue !== true) {
      return renderRightClientBenefitsCatalogDisplayCard(item);
    }
    const issueAction = String(item?.issue_action || "").trim().toLowerCase();
    const actionKey = getRightClientBenefitsCatalogActionKey("promo", item);
    const codeText = String(item?.issued_code || item?.code || "").trim()
      || (String(item?.promo_code_mode || "").trim().toLowerCase() === "unique" ? "Уникальный код" : "-");
    return window.AdminBenefitsModal?.renderPromoCard(item, {
      canToggle: item?.can_issue === true,
      isStackable: isRightOrderBenefitStackable(item),
      codeText,
      actionLabel: "Выдать",
      onAction: (entry) => issueRightClientBenefitsCatalogItem(entry, issueAction, actionKey),
      isBusy: state.clientBenefitsCatalogModal.busyActionKey === actionKey,
      disabledReason: item?.issue_disabled_reason || "",
    }) || document.createElement("div");
  }

  function renderRightClientBenefitsCatalogOverlay() {
    window.AdminBenefitsModal?.show({
      title: "Выгоды",
      showBack: false,
      showModeToggle: true,
      mode: "all",
      onClose: closeRightClientBenefitsCatalogOverlay,
      onModeChange: () => {
        window.AdminBenefitsModal?.setModeToggleState("all");
      },
    });
    const { body } = getRightBenefitsOverlayElements();
    if (!body) return;
    body.innerHTML = "";

    const frame = createRightOrderBenefitsFrame();
    if (!frame?.root || !frame.scrollEl) return;
    body.appendChild(frame.root);

    const shell = document.createElement("div");
    shell.className = "shop-checkout-benefits-sheet";
    frame.scrollEl.appendChild(shell);

    const hint = document.createElement("div");
    hint.className = "shop-checkout-benefits-hint";
    hint.textContent = "Здесь можно смотреть общие акции и выдавать их клиенту. Применение к заказу доступно только во вкладке «Скидки клиента».";
    shell.appendChild(hint);

    if (state.clientBenefitsCatalogModal.loading) {
      const loading = document.createElement("div");
      loading.className = "shop-checkout-benefits-loading";
      loading.textContent = "Загрузка выгод...";
      shell.appendChild(loading);
      return;
    }

    if (state.clientBenefitsCatalogModal.error) {
      const errorCard = document.createElement("div");
      errorCard.className = "shop-profile-card shop-checkout-benefits-empty";
      errorCard.textContent = "Не удалось загрузить выгоды.";
      shell.appendChild(errorCard);
      return;
    }

    const data = state.clientBenefitsCatalogModal.data && typeof state.clientBenefitsCatalogModal.data === "object"
      ? state.clientBenefitsCatalogModal.data
      : {};
    const discounts = (Array.isArray(data?.discounts) ? data.discounts : [])
      .filter((item) => normalizeRightOrderBenefitDiscountMechanicType(item) === "simple_discount");
    const promos = Array.isArray(data?.promo_codes) ? data.promo_codes : [];

    const discountsSection = createRightOrderBenefitsSection("Скидки", "Общих скидок сейчас нет.");
    const promosSection = createRightOrderBenefitsSection("Промокоды", "Общих промокодов сейчас нет.");
    if (discountsSection?.section) {
      shell.appendChild(discountsSection.section);
      setRightOrderBenefitsSectionItems(discountsSection, discounts, renderRightClientBenefitsCatalogDiscountCard);
    }
    if (promosSection?.section) {
      shell.appendChild(promosSection.section);
      setRightOrderBenefitsSectionItems(promosSection, promos, renderRightClientBenefitsCatalogPromoCard);
    }
  }

  async function openRightClientBenefitsCatalogOverlay(orderId) {
    const customerId = Number(await ensureRightOrderBenefitsCustomerId(orderId) || 0);
    if (!(customerId > 0)) {
      showNewOrderAlert("Сначала выберите клиента для заказа");
      return;
    }
    state.clientBenefitsCatalogModal.customerId = customerId;
    state.clientBenefitsCatalogModal.data = null;
    state.clientBenefitsCatalogModal.error = "";
    state.clientBenefitsCatalogModal.loading = true;
    renderRightClientBenefitsCatalogOverlay();
    try {
      const json = await apiJson(`/api/admin/clients/${customerId}/benefits/catalog`, {
        method: "GET",
      });
      state.clientBenefitsCatalogModal.data = json?.data && typeof json.data === "object" ? json.data : {};
    } catch (error) {
      state.clientBenefitsCatalogModal.error = String(error?.message || "API_ERROR");
    } finally {
      state.clientBenefitsCatalogModal.loading = false;
      renderRightClientBenefitsCatalogOverlay();
    }
  }

  function resolveRightOrderBenefitsActivePromoCode(previewData, order = null) {
    const selectedPromoCard = Array.isArray(previewData?.promo_codes)
      ? previewData.promo_codes.find((entry) => entry?.is_selected && !!normalizeRightOrderBenefitsPromoCode(entry?.code))
      : null;
    const previewCode = normalizeRightOrderBenefitsPromoCode(selectedPromoCard?.code || "");
    if (previewCode) return previewCode;
    const form = order?.form && typeof order.form === "object" ? order.form : {};
    return normalizeRightOrderBenefitsPromoCode(form?.promo_code || state.benefitsModal.promoInputValue || "");
  }

  function renderRightOrderBenefitDiscountCard(item, { onToggle, onOpenDetails } = {}) {
    const node = window.AdminBenefitsModal?.renderDiscountCard(item, {
      isSelected: item?.is_selected === true,
      canToggle: item?.is_selected === true || isRightOrderBenefitSelectable(item),
      isStackable: isRightOrderBenefitStackable(item),
      onAction: onToggle,
      onOpenDetails,
      disabledReason: item?.is_applicable !== true ? item?.disabled_reason : "",
    }) || null;
    return bindRightOrderBenefitDetailFallback(node, () => onOpenDetails?.(item));
  }

  function renderRightOrderBenefitPromoCard(item, { onToggle, onOpenDetails } = {}) {
    const actionMode = String(item?.action_mode || "select").trim().toLowerCase() || "select";
    const node = window.AdminBenefitsModal?.renderPromoCard(item, {
      isSelected: item?.is_selected === true,
      canToggle: actionMode === "redeem_reward"
        ? item?.is_applicable === true
        : (item?.is_selected === true || isRightOrderBenefitSelectable(item)),
      isStackable: isRightOrderBenefitStackable(item),
      actionLabel: actionMode === "redeem_reward" ? "Получить" : "Применить",
      onAction: onToggle,
      onOpenDetails,
      disabledReason: item?.is_applicable !== true ? item?.disabled_reason : "",
    }) || null;
    return bindRightOrderBenefitDetailFallback(node, () => onOpenDetails?.(item));
  }

  function renderRightOrderBenefitGiftCard(item, { onReceive, onOpen } = {}) {
    const products = getRightOrderBenefitGiftProducts(item);
    const primaryProduct = products[0] || null;
    const productCount = Math.max(0, Number(item?.product_count || products.length || 0));
    const titleText = productCount === 1
      ? (String(primaryProduct?.title || item?.title || "").trim() || "Подарок")
      : (String(item?.title || "").trim() || "Подарок");
    const photoUrl = String(item?.photo_url || primaryProduct?.photo_url || "").trim();
    const canReceive = typeof onReceive === "function"
      && Number(item?.reward_id || item?.id || 0) > 0
      && products.length > 0
      && item?.is_receivable !== false;

    const node = window.AdminBenefitsModal?.renderGiftCard(item, {
      titleText,
      photoUrl,
      actionLabel: "Получить",
      canExecute: canReceive,
      onAction: onReceive,
      onOpen,
      rewardKind: "gift",
      showDisabledReason: false,
    }) || null;
    return bindRightOrderBenefitDetailFallback(node, () => onOpen?.(item));
  }

  function renderRightOrderBenefitProgressCard(item, { onClaim, onOpenDetails } = {}) {
    function renderRightOrderBenefitRewardSlot(cardItem) {
      const rewardSlot = cardItem?.progress_visual?.reward_slot && typeof cardItem.progress_visual.reward_slot === "object"
        ? cardItem.progress_visual.reward_slot
        : {};
      const rewardPreview = cardItem?.reward_preview && typeof cardItem.reward_preview === "object"
        ? cardItem.reward_preview
        : {};
      const rewardKind = String(
        rewardSlot?.icon_kind
        || rewardSlot?.kind
        || rewardPreview?.icon_kind
        || rewardPreview?.kind
        || cardItem?.reward_kind
        || ""
      ).trim().toLowerCase() || "gift";
      const rewardTitle = String(rewardSlot?.title || rewardPreview?.title || cardItem?.apply_scope_text || "").trim()
        || getRightOrderBenefitRewardKindLabel(rewardKind);
      const isInteractive = typeof onOpenDetails === "function";
      const slotEl = document.createElement(isInteractive ? "button" : "div");
      if (isInteractive) slotEl.type = "button";
      slotEl.className = "shop-checkout-benefit-progress-reward is-static";
      slotEl.title = rewardTitle;
      slotEl.setAttribute("aria-label", rewardTitle);
      if (rewardSlot?.is_claimable === true || cardItem?.is_claimable === true) {
        slotEl.classList.add("is-claimable");
      }

      const media = document.createElement("span");
      media.className = "shop-checkout-benefit-progress-reward-media";
      const rewardPhotoUrl = String(
        rewardSlot?.photo_url
        || rewardPreview?.photo_url
        || (Array.isArray(rewardPreview?.products) && rewardPreview.products.length === 1
            ? rewardPreview.products[0]?.photo_url
            : "")
      ).trim();
      if (rewardPhotoUrl) {
        const image = document.createElement("img");
        image.src = rewardPhotoUrl;
        image.alt = rewardTitle;
        media.appendChild(image);
      } else {
        media.appendChild(createRightOrderBenefitIcon(getRightOrderBenefitRewardIconName(rewardKind)));
      }
      slotEl.appendChild(media);
      if (isInteractive) {
        slotEl.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenDetails(cardItem);
        });
      }
      return slotEl;
    }

    function renderRightOrderBenefitProgressVisual(cardItem) {
      const progressVisual = cardItem?.progress_visual;
      if (!progressVisual || typeof progressVisual !== "object") return null;

      if (String(progressVisual?.mode || "").trim() === "amount") {
        const amountLayout = document.createElement("div");
        amountLayout.className = "shop-checkout-benefit-progress-amount-layout";

        const amountWrap = document.createElement("div");
        amountWrap.className = "shop-checkout-benefit-progress-amount";

        const progressBar = document.createElement("div");
        progressBar.className = "shop-checkout-benefit-progress-bar";

        const progressFill = document.createElement("div");
        progressFill.className = "shop-checkout-benefit-progress-fill";
        progressFill.style.width = `${Math.max(0, Math.min(100, Number(progressVisual?.progress_ratio || cardItem?.progress_ratio || 0) * 100))}%`;

        progressBar.appendChild(progressFill);
        amountWrap.appendChild(progressBar);
        amountLayout.appendChild(amountWrap);
        return amountLayout;
      }

      const slots = Array.isArray(progressVisual?.slots) ? progressVisual.slots : [];
      if (!slots.length) return null;

      const visualWrap = document.createElement("div");
      visualWrap.className = "shop-checkout-benefit-progress-visual";

      const slotsWrap = document.createElement("div");
      slotsWrap.className = "shop-checkout-benefit-progress-slots";
      if (String(progressVisual?.mode || "").trim() === "orders") {
        slotsWrap.classList.add("is-orders");
      } else {
        slotsWrap.classList.add("is-items");
      }

      slots.forEach((slot) => {
        const slotEl = document.createElement("div");
        slotEl.className = "shop-checkout-benefit-progress-slot";
        const normalizedMode = String(progressVisual?.mode || slot?.kind || "").trim();
        const isOrderSlot = normalizedMode === "orders" || String(slot?.kind || "").trim() === "order";
        slotEl.classList.add(isOrderSlot ? "is-order" : "is-item");
        slotEl.classList.add(slot?.is_filled === true ? "is-filled" : "is-empty");

        const slotTitle = String(slot?.title || "").trim();
        if (slotTitle) {
          slotEl.title = slotTitle;
          slotEl.setAttribute("aria-label", slotTitle);
        }

        const media = document.createElement("span");
        media.className = "shop-checkout-benefit-progress-slot-media";
        if (slot?.is_filled === true && String(slot?.photo_url || "").trim()) {
          const image = document.createElement("img");
          image.src = String(slot.photo_url || "").trim();
          image.alt = slotTitle || "Покупка";
          media.appendChild(image);
        } else {
          const placeholder = document.createElement("span");
          placeholder.className = "shop-checkout-benefit-progress-slot-placeholder";
          if (isOrderSlot) {
            placeholder.appendChild(createRightOrderBenefitIcon("fa-receipt"));
          } else if (slot?.is_filled === true) {
            placeholder.appendChild(createRightOrderBenefitIcon("fa-check"));
          } else {
            placeholder.textContent = "+";
          }
          media.appendChild(placeholder);
        }

        slotEl.appendChild(media);
        slotsWrap.appendChild(slotEl);
      });

      bindRightOrderHorizontalTrack(slotsWrap);
      visualWrap.appendChild(slotsWrap);
      return visualWrap;
    }

    const card = document.createElement("div");
    card.className = "shop-profile-card shop-profile-discount-card shop-checkout-benefit-progress-card";
    if (item?.is_claimable === true) card.classList.add("is-claimable");
    if (item?.is_applicable === false) card.classList.add("is-disabled");
    if (typeof onOpenDetails === "function") {
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.addEventListener("click", () => {
        onOpenDetails(item);
      });
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenDetails(item);
        }
      });
    }

    const layout = document.createElement("div");
    layout.className = "shop-checkout-benefit-progress-layout";

    const rewardPane = document.createElement("div");
    rewardPane.className = "shop-checkout-benefit-progress-reward-pane";
    const rewardSlot = renderRightOrderBenefitRewardSlot(item);
    if (rewardSlot) rewardPane.appendChild(rewardSlot);

    const canClaim = item?.is_claimable === true && typeof onClaim === "function";
    const claimBtn = document.createElement("button");
    claimBtn.type = "button";
    claimBtn.className = "shop-checkout-benefit-progress-claim";
    claimBtn.textContent = "Забрать";
    if (canClaim) claimBtn.classList.add("is-ready");
    claimBtn.disabled = !canClaim;
    claimBtn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canClaim) return;
      await onClaim(item);
    });
    rewardPane.appendChild(claimBtn);
    layout.appendChild(rewardPane);

    const main = document.createElement("div");
    main.className = "shop-checkout-benefit-progress-main";
    const header = document.createElement("div");
    header.className = "shop-profile-discount-header";
    const title = document.createElement("div");
    title.className = "shop-profile-discount-title";
    title.textContent = String(item?.title || "Накопление");
    header.appendChild(title);
    main.appendChild(header);

    const progressWrap = document.createElement("div");
    progressWrap.className = "shop-checkout-benefit-progress-wrap";
    const progressVisual = renderRightOrderBenefitProgressVisual(item);
    if (progressVisual) {
      progressWrap.appendChild(progressVisual);
    } else {
      const fallbackVisual = document.createElement("div");
      fallbackVisual.className = "shop-checkout-benefit-progress-amount-layout";
      const progressBarWrap = document.createElement("div");
      progressBarWrap.className = "shop-checkout-benefit-progress-amount";
      const progressBar = document.createElement("div");
      progressBar.className = "shop-checkout-benefit-progress-bar";
      const progressFill = document.createElement("div");
      progressFill.className = "shop-checkout-benefit-progress-fill";
      progressFill.style.width = `${Math.max(0, Math.min(100, Number(item?.progress_ratio || 0) * 100))}%`;
      progressBar.appendChild(progressFill);
      progressBarWrap.appendChild(progressBar);
      fallbackVisual.appendChild(progressBarWrap);
      progressWrap.appendChild(fallbackVisual);
    }
    main.appendChild(progressWrap);
    layout.appendChild(main);

    card.appendChild(layout);
    if (item?.is_applicable === false && item?.disabled_reason) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = String(item.disabled_reason);
      card.appendChild(note);
    }
    return bindRightOrderBenefitDetailFallback(card, () => onOpenDetails?.(item));
  }

  function renderRightOrderBenefitDisplayCard(item, options = {}) {
    const node = window.AdminBenefitsModal?.renderDisplayCard(item, options) || null;
    return bindRightOrderBenefitDetailFallback(node, () => options.onOpenDetails?.(item));
  }

  function appendRightOrderBenefitProductConfigLines(container, productItem) {
    if (!container) return;
    const lines = Array.isArray(productItem?.config_display_lines)
      ? productItem.config_display_lines.filter((line) => String(line || "").trim())
      : [];
    lines.forEach((line) => {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-product-config-note";
      note.textContent = String(line);
      container.appendChild(note);
    });
  }

  function buildRightOrderBenefitGiftPreview(item) {
    if (item?.reward_preview && typeof item.reward_preview === "object") {
      return item.reward_preview;
    }
    const products = getRightOrderBenefitGiftProducts(item);
    const firstProduct = products[0] || null;
    return {
      kind: "gift",
      title: String(item?.title || "").trim() || "Подарок",
      description: String(item?.description || "").trim() || String(firstProduct?.title || "").trim(),
      badge_text: String(item?.badge_text || "").trim() || "Подарок",
      apply_scope_text: String(item?.apply_scope_text || "").trim(),
      photo_url: String(item?.photo_url || firstProduct?.photo_url || "").trim() || null,
      products,
    };
  }

  function buildRightOrderBenefitRewardPreviewContent(rewardPreview) {
    const preview = rewardPreview && typeof rewardPreview === "object" ? rewardPreview : {};
    const products = Array.isArray(preview?.products) ? preview.products : [];
    const previewKind = String(preview?.kind || preview?.icon_kind || "").trim().toLowerCase() || "gift";

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-benefit-reward-preview-block";

    const hero = document.createElement("div");
    hero.className = "shop-checkout-benefit-reward-preview";

    const media = document.createElement("div");
    media.className = "shop-checkout-benefit-reward-preview-media";
    const previewPhotoUrl = String(preview?.photo_url || "").trim();
    if (previewPhotoUrl) {
      const image = document.createElement("img");
      image.src = previewPhotoUrl;
      image.alt = String(preview?.title || "").trim() || getRightOrderBenefitRewardKindLabel(previewKind);
      media.appendChild(image);
    } else {
      media.appendChild(createRightOrderBenefitIcon(getRightOrderBenefitRewardIconName(previewKind)));
    }
    hero.appendChild(media);

    const meta = document.createElement("div");
    meta.className = "shop-checkout-benefit-reward-preview-meta";

    const title = document.createElement("div");
    title.className = "shop-checkout-benefit-reward-preview-title";
    title.textContent = String(preview?.title || "").trim() || getRightOrderBenefitRewardKindLabel(previewKind);
    meta.appendChild(title);

    const badge = document.createElement("div");
    badge.className = "shop-checkout-benefit-reward-preview-badge";
    badge.textContent = String(preview?.badge_text || "").trim() || getRightOrderBenefitRewardKindLabel(previewKind);
    meta.appendChild(badge);

    if (preview?.description) {
      const desc = document.createElement("div");
      desc.className = "shop-checkout-benefit-reward-preview-desc";
      desc.textContent = String(preview.description);
      meta.appendChild(desc);
    }

    if (preview?.apply_scope_text) {
      const scope = document.createElement("div");
      scope.className = "shop-checkout-benefit-reward-preview-note";
      scope.textContent = String(preview.apply_scope_text);
      meta.appendChild(scope);
    }

    if (String(preview?.code_preview || "").trim()) {
      const code = document.createElement("div");
      code.className = "shop-checkout-benefit-reward-preview-code";
      code.textContent = String(preview.code_preview).trim();
      meta.appendChild(code);
    }

    hero.appendChild(meta);
    wrap.appendChild(hero);

    if (products.length) {
      const productsTitle = document.createElement("div");
      productsTitle.className = "shop-checkout-benefit-modal-subtitle";
      productsTitle.textContent = products.length > 1 ? "Что можно получить" : "Что будет в подарок";
      wrap.appendChild(productsTitle);

      const productsList = document.createElement("div");
      productsList.className = "shop-checkout-benefit-reward-products";
      products.forEach((product) => {
        const productCard = document.createElement("div");
        productCard.className = "shop-checkout-benefit-reward-product";

        const productMedia = document.createElement("div");
        productMedia.className = "shop-checkout-benefit-reward-product-media";
        const productPhotoUrl = String(product?.photo_url || "").trim();
        if (productPhotoUrl) {
          const productImage = document.createElement("img");
          productImage.src = productPhotoUrl;
          productImage.alt = String(product?.title || "").trim() || "Товар";
          productMedia.appendChild(productImage);
        } else {
          productMedia.appendChild(createRightOrderBenefitIcon("fa-box-open"));
        }
        productCard.appendChild(productMedia);

        const productMeta = document.createElement("div");
        productMeta.className = "shop-checkout-benefit-reward-product-meta";

        const productTitle = document.createElement("div");
        productTitle.className = "shop-checkout-benefit-reward-product-title";
        productTitle.textContent = String(product?.title || "").trim() || "Товар";
        productMeta.appendChild(productTitle);

        if (Number(product?.price || 0) > 0 && typeof money === "function") {
          const productPrice = document.createElement("div");
          productPrice.className = "shop-checkout-benefit-reward-product-price";
          productPrice.textContent = money(Number(product.price || 0));
          productMeta.appendChild(productPrice);
        }

        appendRightOrderBenefitProductConfigLines(productMeta, product);
        if (
          Number(product?.id || product?.product_id || 0) > 0
          && (
            normalizeRightOrderBenefitProductConfigMode(product?.config_mode, "any") !== "any"
            || !!product?.product_config
            || normalizeRightOrderBenefitProductConfigMode(product?.config_mode, "any") === "any"
          )
        ) {
          void resolveRightOrderBenefitConfiguredProduct(product).then((resolvedProduct) => {
            if (!productMeta.isConnected) return;
            const existing = productMeta.querySelectorAll(".shop-checkout-benefit-product-config-note");
            existing.forEach((node) => node.remove());
            const priceEl = productMeta.querySelector(".shop-checkout-benefit-reward-product-price");
            if (priceEl && typeof money === "function" && Number(resolvedProduct?.price || 0) > 0) {
              priceEl.textContent = money(Number(resolvedProduct.price || 0));
            }
            appendRightOrderBenefitProductConfigLines(productMeta, resolvedProduct);
          }).catch(() => {});
        }
        productCard.appendChild(productMeta);
        productsList.appendChild(productCard);
      });
      wrap.appendChild(productsList);
    }

    return wrap;
  }

  function buildRightOrderBenefitTargetProductsContent(products, titleText = "Что участвует") {
    const items = Array.isArray(products)
      ? products.filter((product) => Number(product?.id || product?.product_id || 0) > 0)
      : [];
    const wrap = document.createElement("div");
    if (!items.length) return wrap;

    const productsTitle = document.createElement("div");
    productsTitle.className = "shop-checkout-benefit-modal-subtitle";
    productsTitle.textContent = String(titleText || "").trim() || "Что участвует";
    wrap.appendChild(productsTitle);

    const productsList = document.createElement("div");
    productsList.className = "shop-checkout-benefit-reward-products";
    items.forEach((product) => {
      const productCard = document.createElement("div");
      productCard.className = "shop-checkout-benefit-reward-product";

      const productMedia = document.createElement("div");
      productMedia.className = "shop-checkout-benefit-reward-product-media";
      const productPhotoUrl = String(product?.photo_url || "").trim();
      if (productPhotoUrl) {
        const productImage = document.createElement("img");
        productImage.src = productPhotoUrl;
        productImage.alt = String(product?.title || "").trim() || "Товар";
        productMedia.appendChild(productImage);
      } else {
        productMedia.appendChild(createRightOrderBenefitIcon("fa-box-open"));
      }
      productCard.appendChild(productMedia);

      const productMeta = document.createElement("div");
      productMeta.className = "shop-checkout-benefit-reward-product-meta";

      const productTitle = document.createElement("div");
      productTitle.className = "shop-checkout-benefit-reward-product-title";
      productTitle.textContent = String(product?.title || "").trim() || "Товар";
      productMeta.appendChild(productTitle);

      if (Number(product?.price || 0) > 0 && typeof money === "function") {
        const productPrice = document.createElement("div");
        productPrice.className = "shop-checkout-benefit-reward-product-price";
        productPrice.textContent = money(Number(product.price || 0));
        productMeta.appendChild(productPrice);
      }

      appendRightOrderBenefitProductConfigLines(productMeta, product);
      if (
        Number(product?.id || product?.product_id || 0) > 0
        && (
          normalizeRightOrderBenefitProductConfigMode(product?.config_mode, "any") !== "any"
          || !!product?.product_config
          || normalizeRightOrderBenefitProductConfigMode(product?.config_mode, "any") === "any"
        )
      ) {
        void resolveRightOrderBenefitConfiguredProduct(product).then((resolvedProduct) => {
          if (!productMeta.isConnected) return;
          const existing = productMeta.querySelectorAll(".shop-checkout-benefit-product-config-note");
          existing.forEach((node) => node.remove());
          const priceEl = productMeta.querySelector(".shop-checkout-benefit-reward-product-price");
          if (priceEl && typeof money === "function" && Number(resolvedProduct?.price || 0) > 0) {
            priceEl.textContent = money(Number(resolvedProduct.price || 0));
          }
          appendRightOrderBenefitProductConfigLines(productMeta, resolvedProduct);
        }).catch(() => {});
      }
      productCard.appendChild(productMeta);
      productsList.appendChild(productCard);
    });
    wrap.appendChild(productsList);
    return wrap;
  }

  function resolveRightOrderBenefitDiscountSourceId(item) {
    const sourceDiscountId = Number(item?.source_discount_id || item?.discount_id || 0);
    if (sourceDiscountId > 0) return sourceDiscountId;
    const itemId = Number(item?.id || 0);
    return itemId > 0 ? itemId : 0;
  }

  function formatRightOrderBenefitDiscountInfoAmount(value) {
    const amount = Number(value || 0);
    if (!(amount > 0)) return "—";
    if (typeof money === "function") return money(amount);
    return `${Math.round(amount)} ₽`;
  }

  function formatRightOrderBenefitDiscountInfoDate(value) {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "—";
    return parsed.toLocaleDateString("ru-RU");
  }

  function parseRightOrderBenefitDiscountScheduleDays(value) {
    if (Array.isArray(value)) {
      return value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
    }
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
        }
      } catch {}
    }
    return [];
  }

  function formatRightOrderBenefitDiscountScheduleDaysText(value) {
    const days = parseRightOrderBenefitDiscountScheduleDays(value);
    if (!days.length) return "";
    const uniqueDays = Array.from(new Set(days));
    if (uniqueDays.length === 7) return "Ежедневно";
    const sortOrder = [1, 2, 3, 4, 5, 6, 0];
    const labels = {
      1: "Пн",
      2: "Вт",
      3: "Ср",
      4: "Чт",
      5: "Пт",
      6: "Сб",
      0: "Вс",
    };
    uniqueDays.sort((a, b) => sortOrder.indexOf(a) - sortOrder.indexOf(b));
    return uniqueDays.map((day) => labels[day] || "").filter(Boolean).join(", ");
  }

  function formatRightOrderBenefitDiscountTimeValue(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    const matched = raw.match(/^(\d{2}:\d{2})/);
    return matched ? matched[1] : raw;
  }

  function normalizeRightOrderBenefitDiscountMechanicType(discount) {
    const mechanicTypeRaw = String(discount?.mechanic_type || discount?.mechanic?.type || "").trim().toLowerCase();
    if (mechanicTypeRaw === "buy_x_get_y") return "buy_x_get_y";
    if (mechanicTypeRaw === "threshold") return "threshold";
    if (mechanicTypeRaw === "loyalty_progress") return "loyalty_progress";
    return "simple_discount";
  }

  function buildRightOrderBenefitDiscountSubtitle(discount, fallbackItem = null) {
    const mechanicType = normalizeRightOrderBenefitDiscountMechanicType(discount);
    if (mechanicType === "buy_x_get_y") return "Акция 1+1";
    if (mechanicType === "threshold") return "Пороговая акция";
    if (mechanicType === "loyalty_progress") return "Накопительная акция";
    const applyTo = String(discount?.apply_to || fallbackItem?.apply_to || "").trim().toLowerCase();
    const targetMap = {
      order: "весь заказ",
      product: "товар",
      category: "категорию",
      combo: "комбо",
    };
    const target = targetMap[applyTo] || "заказ";
    const activationMode = String(discount?.activation_mode || "").trim().toLowerCase();
    if (activationMode === "promo_code") return `Промокод на ${target}`;
    return `Скидка на ${target}`;
  }

  function buildRightOrderBenefitDiscountApplyText(discount, fallbackItem = null) {
    const mechanicType = normalizeRightOrderBenefitDiscountMechanicType(discount);
    if (mechanicType === "buy_x_get_y") {
      const mechanic = discount?.mechanic && typeof discount.mechanic === "object" ? discount.mechanic : {};
      const buyQty = Math.max(1, Number(mechanic?.buy_qty || 0) || 1);
      const rewardQty = Math.max(1, Number(mechanic?.reward_qty || 0) || 1);
      return `${buyQty}+${rewardQty}`;
    }
    if (mechanicType === "threshold") return "по порогам суммы";
    if (mechanicType === "loyalty_progress") return "по накопительному порогу";
    const applyTo = String(discount?.apply_to || fallbackItem?.apply_to || "").trim().toLowerCase();
    const targetMap = {
      order: "на весь заказ",
      product: "на товар",
      category: "на категорию",
      combo: "на комбо",
    };
    return targetMap[applyTo] || "на заказ";
  }

  function formatRightOrderBenefitIssueModeText(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "manual") return "Вручную";
    if (raw === "code") return "Кодом";
    return "Автоматически";
  }

  function buildRightOrderBenefitDiscountRules(discount) {
    const rules = [];
    const mechanicType = normalizeRightOrderBenefitDiscountMechanicType(discount);
    if (mechanicType === "threshold") {
      rules.push("Применяется лучшая ступень");
    }
    if (mechanicType === "loyalty_progress") {
      const mechanic = discount?.mechanic && typeof discount.mechanic === "object" ? discount.mechanic : {};
      rules.push(`Выдача награды: ${formatRightOrderBenefitIssueModeText(mechanic?.issue_mode)}`);
    }
    return rules;
  }

  function buildRightOrderBenefitDiscountAudienceText(discount) {
    const customers = Array.isArray(discount?.customers) ? discount.customers : [];
    if (!customers.length) return "Все клиенты";
    const customerCount = customers.filter((item) => String(item?.entity_type || "").trim() !== "category").length;
    const categoryCount = customers.filter((item) => String(item?.entity_type || "").trim() === "category").length;
    if (customerCount > 0 && categoryCount > 0) return `Клиенты ${customerCount}, категории ${categoryCount}`;
    if (categoryCount > 0) return categoryCount === 1 ? "Категория клиентов" : `Категории клиентов (${categoryCount})`;
    return customerCount === 1 ? "Выбранный клиент" : `Выбранные клиенты (${customerCount})`;
  }

  function formatRightOrderBenefitDiscountBadgeText(discount, fallbackItem = null) {
    const fallbackText = String(fallbackItem?.badge_text || "").trim() || "Скидка";
    const type = String(discount?.discount_type || fallbackItem?.discount_type || "").trim().toLowerCase();
    const value = Number(discount?.discount_value ?? fallbackItem?.discount_value ?? 0);
    if (type === "fixed" && value > 0) return `-${value} ₽`;
    if (type === "special_price" && value > 0) return `${value} ₽`;
    if (type === "percent" && value > 0) return `-${Math.round(value)}%`;
    return fallbackText;
  }

  function buildRightOrderBenefitDiscountMainBadgeDescriptor(discount, fallbackItem = null) {
    const text = formatRightOrderBenefitDiscountBadgeText(discount, fallbackItem);
    if (!text) return { kind: "none", text: "", icon: "", label: "" };
    return { kind: "text", text, icon: "", label: text };
  }

  function buildRightOrderBenefitDiscountMarketingContent(discount, fallbackItem = null) {
    const sourceDiscount = discount && typeof discount === "object" ? discount : {};
    const sourceItem = fallbackItem && typeof fallbackItem === "object" ? fallbackItem : {};
    const promo = sourceDiscount?.promo && typeof sourceDiscount.promo === "object" ? sourceDiscount.promo : {};
    const activationMode = String(sourceDiscount?.activation_mode || "").trim().toLowerCase();
    const promoEnabled = activationMode === "promo_code" || promo?.enabled === true;
    const promoCodeMode = String(promo?.code_mode || sourceDiscount?.promo_code_mode || "shared").trim().toLowerCase();
    const promoCodeValue = promoCodeMode === "unique"
      ? "Уникальные коды"
      : (String(promo?.shared_code || sourceDiscount?.promo_code || "").trim() || "—");
    const titleText = String(sourceDiscount?.title || sourceItem?.title || "").trim() || "Скидка";
    const subtitleText = buildRightOrderBenefitDiscountSubtitle(sourceDiscount, sourceItem);
    const mainBadge = buildRightOrderBenefitDiscountMainBadgeDescriptor(sourceDiscount, sourceItem);
    const isActive = sourceDiscount?.is_active !== false && Number(sourceDiscount?.is_active || 1) !== 0;
    const hideInBenefits = sourceDiscount?.hide_in_benefits === true || Number(sourceDiscount?.hide_in_benefits || 0) === 1;
    const isStackable = sourceDiscount?.is_stackable === true || Number(sourceDiscount?.is_stackable || 0) === 1;
    const usageCount = Number(sourceDiscount?.usage_count || 0);
    const usageLimit = Number(sourceDiscount?.usage_limit || 0);
    const usagePerCustomer = Number(sourceDiscount?.usage_per_customer || 0);
    const minOrderAmount = Number(sourceDiscount?.min_order_amount || 0);
    const maxDiscountAmount = Number(sourceDiscount?.max_discount_amount || 0);
    const rules = buildRightOrderBenefitDiscountRules(sourceDiscount);
    const products = Array.isArray(sourceDiscount?.products) && sourceDiscount.products.length
      ? sourceDiscount.products
      : (Array.isArray(sourceItem?.products) ? sourceItem.products : []);
    const customers = Array.isArray(sourceDiscount?.customers) ? sourceDiscount.customers : [];
    const weekdaysText = formatRightOrderBenefitDiscountScheduleDaysText(sourceDiscount?.schedule_days);
    const timeStart = formatRightOrderBenefitDiscountTimeValue(sourceDiscount?.schedule_time_start);
    const timeEnd = formatRightOrderBenefitDiscountTimeValue(sourceDiscount?.schedule_time_end);
    const timeText = timeStart && timeEnd
      ? `${timeStart} — ${timeEnd}`
      : (timeStart ? `с ${timeStart}` : (timeEnd ? `до ${timeEnd}` : ""));
    const periodText = sourceDiscount?.starts_at || sourceDiscount?.ends_at
      ? `${formatRightOrderBenefitDiscountInfoDate(sourceDiscount?.starts_at)} — ${formatRightOrderBenefitDiscountInfoDate(sourceDiscount?.ends_at)}`
      : "Без ограничений";
    const disabledReasonText = String(sourceItem?.disabled_reason || "").trim();
    const economyText = maxDiscountAmount > 0
      ? `Экономия: до ${formatRightOrderBenefitDiscountInfoAmount(maxDiscountAmount)}`
      : "Экономия: без ограничения";

    const wrap = document.createElement("div");

    const hero = document.createElement("div");
    hero.className = "discount-info-hero";

    const heroMain = document.createElement("div");
    heroMain.className = "discount-info-hero-main";

    const heroContent = document.createElement("div");
    heroContent.className = "discount-info-hero-content";

    const badges = document.createElement("div");
    badges.className = "discount-info-badges discount-info-badges--right shop-checkout-benefit-discount-meta";

    if (mainBadge.kind !== "none") {
      const mainBadgeEl = document.createElement("span");
      mainBadgeEl.className = "discount-info-hero-badge shop-checkout-benefit-badge shop-checkout-benefit-badge--accent shop-checkout-benefit-discount-badge";
      if (mainBadge.kind === "icon") {
        mainBadgeEl.classList.add("shop-checkout-benefit-badge--icon");
        mainBadgeEl.innerHTML = `<i class="fas ${mainBadge.icon}" aria-hidden="true"></i>`;
        mainBadgeEl.setAttribute("title", mainBadge.label);
        mainBadgeEl.setAttribute("aria-label", mainBadge.label);
      } else {
        mainBadgeEl.textContent = mainBadge.text;
      }
      badges.appendChild(mainBadgeEl);
    }

    const statusBadgeEl = document.createElement("span");
    statusBadgeEl.className = `discount-info-badge shop-checkout-benefit-badge shop-checkout-benefit-badge--icon ${isActive ? "shop-checkout-benefit-badge--accent" : "shop-checkout-benefit-badge--neutral"}`;
    statusBadgeEl.setAttribute("title", isActive ? "Активна" : "Неактивна");
    statusBadgeEl.setAttribute("aria-label", isActive ? "Активна" : "Неактивна");
    statusBadgeEl.innerHTML = `<i class="fas fa-power-off" aria-hidden="true"></i>`;
    badges.appendChild(statusBadgeEl);

    const benefitsBadgeEl = document.createElement("span");
    benefitsBadgeEl.className = "discount-info-badge shop-checkout-benefit-badge shop-checkout-benefit-badge--icon shop-checkout-benefit-badge--accent";
    benefitsBadgeEl.setAttribute("title", hideInBenefits ? "Скрыта в выгодах" : "Показывается в выгодах");
    benefitsBadgeEl.setAttribute("aria-label", hideInBenefits ? "Скрыта в выгодах" : "Показывается в выгодах");
    benefitsBadgeEl.innerHTML = `<i class="fas ${hideInBenefits ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
    badges.appendChild(benefitsBadgeEl);

    if (isStackable) {
      const stackBadgeEl = document.createElement("span");
      stackBadgeEl.className = "discount-info-badge shop-checkout-benefit-badge shop-checkout-benefit-badge--icon shop-checkout-benefit-badge--accent";
      stackBadgeEl.setAttribute("title", "Можно совмещать");
      stackBadgeEl.setAttribute("aria-label", "Можно совмещать");
      stackBadgeEl.innerHTML = `<i class="fas fa-link" aria-hidden="true"></i>`;
      badges.appendChild(stackBadgeEl);
    }
    heroContent.appendChild(badges);

    const titleEl = document.createElement("div");
    titleEl.className = "discount-info-title shop-profile-discount-title";
    titleEl.textContent = titleText;
    heroContent.appendChild(titleEl);

    if (promoEnabled) {
      const promoWrap = document.createElement("div");
      promoWrap.className = "discount-info-hero-promo";
      const promoLabel = document.createElement("div");
      promoLabel.className = "discount-info-hero-promo-label";
      promoLabel.textContent = "Промокод";
      const promoValue = document.createElement("div");
      promoValue.className = "discount-info-hero-promo-value shop-checkout-benefit-main-value is-code";
      promoValue.textContent = promoCodeValue;
      promoWrap.appendChild(promoLabel);
      promoWrap.appendChild(promoValue);
      heroContent.appendChild(promoWrap);
    }

    const subtitleEl = document.createElement("div");
    subtitleEl.className = "discount-info-hero-subtitle";
    subtitleEl.textContent = subtitleText;
    heroContent.appendChild(subtitleEl);

    heroMain.appendChild(heroContent);

    const economyEl = document.createElement("div");
    economyEl.className = "discount-info-hero-economy";
    economyEl.textContent = economyText;
    heroMain.appendChild(economyEl);

    hero.appendChild(heroMain);
    wrap.appendChild(hero);

    const conditionsBlock = document.createElement("div");
    conditionsBlock.className = "discount-info-block";
    conditionsBlock.innerHTML = `
      <div class="discount-info-block-header"><i class="fas fa-map-marker-alt"></i> Условия</div>
      <div class="discount-info-block-body">
        <div class="discount-info-row"><span class="discount-info-row-label">Применяется:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row"><span class="discount-info-row-label">Минимальная сумма:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row"><span class="discount-info-row-label">Максимальная скидка:</span><span class="discount-info-row-value"></span></div>
      </div>
    `;
    const conditionRows = conditionsBlock.querySelectorAll(".discount-info-row-value");
    if (conditionRows[0]) conditionRows[0].textContent = buildRightOrderBenefitDiscountApplyText(sourceDiscount, sourceItem);
    if (conditionRows[1]) conditionRows[1].textContent = minOrderAmount > 0 ? formatRightOrderBenefitDiscountInfoAmount(minOrderAmount) : "без минимальной суммы";
    if (conditionRows[2]) conditionRows[2].textContent = maxDiscountAmount > 0 ? formatRightOrderBenefitDiscountInfoAmount(maxDiscountAmount) : "без ограничения";
    wrap.appendChild(conditionsBlock);

    const limitsBlock = document.createElement("div");
    limitsBlock.className = "discount-info-block";
    limitsBlock.innerHTML = `
      <div class="discount-info-block-header"><i class="fas fa-exclamation-triangle"></i> Ограничения</div>
      <div class="discount-info-block-body">
        <div class="discount-info-row"><span class="discount-info-row-label">На клиента:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row"><span class="discount-info-row-label">Общий лимит:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row"><span class="discount-info-row-label">Использовано:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row discount-info-row--full hidden"><span class="discount-info-row-label">Доп. правила:</span><div class="discount-info-rules"></div></div>
      </div>
    `;
    const limitRows = limitsBlock.querySelectorAll(".discount-info-row-value");
    if (limitRows[0]) limitRows[0].textContent = usagePerCustomer > 0 ? `${usagePerCustomer} на клиента` : "без лимита на клиента";
    if (limitRows[1]) limitRows[1].textContent = usageLimit > 0 ? String(usageLimit) : "без общего лимита";
    if (limitRows[2]) limitRows[2].textContent = String(usageCount);
    const rulesRowEl = limitsBlock.querySelector(".discount-info-row.discount-info-row--full");
    const rulesListEl = limitsBlock.querySelector(".discount-info-rules");
    if (rulesListEl) {
      rulesListEl.innerHTML = "";
      rules.forEach((rule) => {
        const ruleEl = document.createElement("div");
        ruleEl.className = "discount-info-rule-item";
        ruleEl.textContent = rule;
        rulesListEl.appendChild(ruleEl);
      });
    }
    if (rulesRowEl) rulesRowEl.classList.toggle("hidden", !rules.length);
    wrap.appendChild(limitsBlock);

    const periodBlock = document.createElement("div");
    periodBlock.className = "discount-info-block";
    periodBlock.innerHTML = `
      <div class="discount-info-block-header"><i class="fas fa-calendar-alt"></i> Срок действия</div>
      <div class="discount-info-block-body">
        <div class="discount-info-row"><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row hidden"><span class="discount-info-row-label">Дни недели:</span><span class="discount-info-row-value"></span></div>
        <div class="discount-info-row hidden"><span class="discount-info-row-label">Время:</span><span class="discount-info-row-value"></span></div>
      </div>
    `;
    const periodRows = periodBlock.querySelectorAll(".discount-info-row");
    const periodValues = periodBlock.querySelectorAll(".discount-info-row-value");
    if (periodValues[0]) periodValues[0].textContent = periodText;
    if (periodValues[1]) periodValues[1].textContent = weekdaysText || "—";
    if (periodValues[2]) periodValues[2].textContent = timeText || "—";
    if (periodRows[1]) periodRows[1].classList.toggle("hidden", !weekdaysText);
    if (periodRows[2]) periodRows[2].classList.toggle("hidden", !timeText);
    wrap.appendChild(periodBlock);

    const bottomGrid = document.createElement("div");
    bottomGrid.className = "discount-info-bottom-grid";
    bottomGrid.innerHTML = `
      <div class="discount-info-mini-card">
        <div class="discount-info-mini-header"><i class="fas fa-check-circle"></i> Доступно</div>
        <div class="discount-info-mini-body">${isStackable ? "Можно совмещать с другими акциями" : "Не совмещается с другими акциями"}</div>
      </div>
      <div class="discount-info-mini-card">
        <div class="discount-info-mini-header"><i class="fas fa-users"></i> Аудитория</div>
        <div class="discount-info-mini-body">${buildRightOrderBenefitDiscountAudienceText(sourceDiscount)}</div>
      </div>
    `;
    wrap.appendChild(bottomGrid);

    if (products.length) {
      const productsSection = document.createElement("div");
      productsSection.className = "discount-info-section";
      const title = document.createElement("div");
      title.className = "discount-info-section-title";
      title.textContent = "Привязанные позиции";
      productsSection.appendChild(title);
      const chips = document.createElement("div");
      chips.className = "discount-chips";
      products.forEach((product) => {
        const chip = document.createElement("span");
        const entityType = String(product?.entity_type || product?.type || "").trim().toLowerCase();
        chip.className = `discount-chip ${entityType === "category" ? "is-category" : (entityType === "combo" ? "is-combo" : "")}`.trim();
        chip.textContent = String(product?.title || product?.name || "").trim() || `#${Number(product?.entity_id || product?.id || 0)}`;
        chips.appendChild(chip);
      });
      productsSection.appendChild(chips);
      wrap.appendChild(productsSection);
    }

    if (customers.length) {
      const customersSection = document.createElement("div");
      customersSection.className = "discount-info-section";
      const title = document.createElement("div");
      title.className = "discount-info-section-title";
      title.textContent = "Выбранные клиенты";
      customersSection.appendChild(title);
      const chips = document.createElement("div");
      chips.className = "discount-chips";
      customers.forEach((customer) => {
        const chip = document.createElement("span");
        const entityType = String(customer?.entity_type || "").trim().toLowerCase();
        chip.className = `discount-chip ${entityType === "category" ? "is-category" : ""}`.trim();
        chip.textContent = String(customer?.title || customer?.name || "").trim() || `#${Number(customer?.entity_id || customer?.id || 0)}`;
        chips.appendChild(chip);
      });
      customersSection.appendChild(chips);
      wrap.appendChild(customersSection);
    }

    if (disabledReasonText) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = disabledReasonText;
      wrap.appendChild(note);
    }

    return wrap;
  }

  async function loadRightOrderBenefitDiscountDetails(discountId, opts = {}) {
    const id = Number(discountId || 0);
    if (!(id > 0)) return null;
    if (opts?.force !== true && state.rightBenefitsDiscountDetailsById.has(id)) {
      return state.rightBenefitsDiscountDetailsById.get(id) || null;
    }
    const json = await apiJson(`/api/admin/discounts/${id}`);
    const discount = json?.discount && typeof json.discount === "object" ? json.discount : null;
    if (discount) {
      state.rightBenefitsDiscountDetailsById.set(id, discount);
      return discount;
    }
    return null;
  }

  async function renderRightOrderBenefitDiscountDetailContent(host, item, { orderId = 0 } = {}) {
    if (!host) return;
    host.innerHTML = "";
    host.appendChild(buildRightOrderBenefitDiscountMarketingContent(null, item));
    const discountId = resolveRightOrderBenefitDiscountSourceId(item);
    if (!(discountId > 0)) return;

    const reqSeq = Number(state.rightBenefitsDiscountDetailReqSeq || 0) + 1;
    state.rightBenefitsDiscountDetailReqSeq = reqSeq;
    try {
      const discount = await loadRightOrderBenefitDiscountDetails(discountId);
      if (!discount) return;
      if (Number(state.rightBenefitsDiscountDetailReqSeq || 0) !== reqSeq) return;
      if (String(state.benefitsModal.screen || "main") !== "detail") return;
      if (Number(state.benefitsModal.orderId || 0) !== Number(orderId || 0)) return;
      const currentPayload = state.benefitsModal.payload && typeof state.benefitsModal.payload === "object"
        ? state.benefitsModal.payload
        : null;
      if (String(currentPayload?.kind || "").trim() !== "discount") return;
      const currentDiscountId = resolveRightOrderBenefitDiscountSourceId(currentPayload?.item || {});
      if (currentDiscountId !== discountId) return;

      host.innerHTML = "";
      host.appendChild(buildRightOrderBenefitDiscountMarketingContent(discount, item));
    } catch (error) {
      console.warn("Failed to load discount details for benefits modal:", discountId, error);
    }
  }

  function buildRightOrderBenefitCardDetailContent(item, {
    primaryText = "",
    primaryClassName = "",
    isSelected = false,
  } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-benefit-detail-card";

    const badges = document.createElement("div");
    badges.className = "shop-checkout-benefit-detail-badges";

    if (item?.badge_text) {
      const badge = document.createElement("span");
      badge.className = "sp-discount-badge";
      badge.textContent = String(item.badge_text);
      badges.appendChild(badge);
    }

    if (item?.status_text) {
      const status = document.createElement("span");
      status.className = "shop-checkout-benefit-status";
      status.textContent = String(item.status_text);
      badges.appendChild(status);
    }

    if (isSelected) {
      const selected = document.createElement("span");
      selected.className = "shop-checkout-benefit-status is-selected";
      selected.textContent = "Выбрано";
      badges.appendChild(selected);
    }

    if (badges.children.length) wrap.appendChild(badges);

    if (primaryText) {
      const valueEl = document.createElement("div");
      valueEl.className = "shop-checkout-benefit-detail-value";
      if (primaryClassName) valueEl.classList.add(primaryClassName);
      valueEl.textContent = String(primaryText);
      wrap.appendChild(valueEl);
    }

    const info = document.createElement("div");
    info.className = "shop-checkout-benefit-modal-info";

    const appendInfoLine = (label, value) => {
      if (!String(value || "").trim()) return;
      const line = document.createElement("div");
      line.className = "shop-checkout-benefit-modal-line";
      const labelEl = document.createElement("strong");
      labelEl.textContent = label;
      line.appendChild(labelEl);
      line.appendChild(document.createTextNode(" "));
      const valueEl = document.createElement("span");
      valueEl.textContent = String(value);
      line.appendChild(valueEl);
      info.appendChild(line);
    };

    appendInfoLine("Описание:", item?.description || "");
    appendInfoLine("Условие:", item?.apply_scope_text || "");
    appendInfoLine("Статус:", item?.status_text || "");
    appendInfoLine("Причина:", item?.completed_reason_text || "");

    if (Number(item?.discount_amount || 0) > 0 && typeof money === "function") {
      appendInfoLine("Выгода:", money(Number(item.discount_amount || 0)));
    }

    const completedText = formatRightOrderBenefitsDate(item?.completed_at);
    if (completedText) {
      appendInfoLine("Завершено:", completedText);
    }

    const expiresText = formatRightOrderBenefitsDate(item?.expires_at);
    if (expiresText) {
      appendInfoLine("До:", expiresText);
    }

    if (item?.is_applicable !== true && item?.disabled_reason) {
      appendInfoLine("Ограничение:", item.disabled_reason);
    }

    if (info.children.length) wrap.appendChild(info);
    return wrap;
  }

  function buildRightOrderBenefitDiscountDetailContent(item) {
    const wrap = document.createElement("div");
    wrap.appendChild(buildRightOrderBenefitCardDetailContent(item, {
      primaryText: String(item?.badge_text || "").trim() || "Скидка",
      isSelected: item?.is_selected === true,
    }));
    const productsSection = buildRightOrderBenefitTargetProductsContent(item?.products, "Что участвует");
    if (productsSection.childNodes.length) wrap.appendChild(productsSection);
    return wrap;
  }

  function buildRightOrderBenefitPromoDetailContent(item) {
    const wrap = document.createElement("div");
    wrap.appendChild(buildRightOrderBenefitCardDetailContent(item, {
      primaryText: String(item?.code || "").trim() || "Промокод",
      primaryClassName: "is-code",
      isSelected: item?.is_selected === true,
    }));
    const productsSection = buildRightOrderBenefitTargetProductsContent(item?.products, "Что участвует");
    if (productsSection.childNodes.length) wrap.appendChild(productsSection);
    return wrap;
  }

  function formatRightOrderBenefitProgressSummary(item) {
    const rawProgressDisplayValue = item?.progress_display_value ?? item?.progress_value ?? 0;
    const progressDisplayValue = Number(rawProgressDisplayValue || 0);
    const thresholdValue = Number(item?.threshold_value || 0);
    if (String(item?.progress_basis || "").trim() === "amount" && typeof money === "function") {
      return `${money(progressDisplayValue)} / ${money(thresholdValue)}`;
    }
    return `${progressDisplayValue} / ${thresholdValue}`;
  }

  function getRightOrderBenefitProgressProductsData(order, progressItem) {
    const previewData = getRightOrderBenefitsPreviewSnapshot(order, {
      mode: getActiveRightOrderBenefitsMode(),
      preferApplied: true,
      allowStale: true,
      allowClientCache: true,
    });
    const details = previewData?.details && typeof previewData.details === "object"
      ? previewData.details
      : null;
    const map = details?.progress_products_by_discount_id && typeof details.progress_products_by_discount_id === "object"
      ? details.progress_products_by_discount_id
      : null;
    const discountId = Number(progressItem?.discount_id || progressItem?.id || 0);
    if (!map || !(discountId > 0)) return null;
    return map[String(discountId)] || map[discountId] || null;
  }

  function buildRightOrderBenefitProgressDetailContent(order, item) {
    const wrap = document.createElement("div");

    const info = document.createElement("div");
    info.className = "shop-checkout-benefit-modal-info";
    const appendInfoLine = (label, value) => {
      if (!String(value || "").trim()) return;
      const line = document.createElement("div");
      line.className = "shop-checkout-benefit-modal-line";
      const labelEl = document.createElement("strong");
      labelEl.textContent = label;
      line.appendChild(labelEl);
      line.appendChild(document.createTextNode(" "));
      const valueEl = document.createElement("span");
      valueEl.textContent = String(value);
      line.appendChild(valueEl);
      info.appendChild(line);
    };
    appendInfoLine("Прогресс:", formatRightOrderBenefitProgressSummary(item));

    const progressBasis = String(item?.progress_basis || "").trim().toLowerCase();
    const currentValue = Number(item?.progress_display_value ?? item?.progress_value ?? 0);
    const thresholdValue = Number(item?.threshold_value || 0);
    const remainingValue = Math.max(0, thresholdValue - currentValue);
    if (remainingValue > 0) {
      if (progressBasis === "amount" && typeof money === "function") {
        appendInfoLine("Осталось:", money(remainingValue));
      } else if (progressBasis === "orders") {
        appendInfoLine("Осталось заказов:", String(remainingValue));
      } else {
        appendInfoLine("Осталось купить:", String(remainingValue));
      }
    }
    appendInfoLine("Условие:", item?.apply_scope_text || "");
    if (info.children.length) wrap.appendChild(info);

    const rewardTitle = document.createElement("div");
    rewardTitle.className = "shop-checkout-benefit-modal-subtitle";
    rewardTitle.textContent = "Что получим";
    wrap.appendChild(rewardTitle);
    wrap.appendChild(buildRightOrderBenefitRewardPreviewContent(item?.reward_preview));

    const progressProductsData = getRightOrderBenefitProgressProductsData(order, item);
    const productsSection = buildRightOrderBenefitTargetProductsContent(
      progressProductsData?.items,
      progressProductsData?.title || "Что участвует"
    );
    if (progressProductsData?.description) {
      const descriptionEl = document.createElement("div");
      descriptionEl.className = "shop-checkout-benefits-hint";
      descriptionEl.textContent = String(progressProductsData.description);
      wrap.appendChild(descriptionEl);
    }
    if (productsSection.childNodes.length) wrap.appendChild(productsSection);

    return wrap;
  }

  function isRightOrderBenefitDetailItemMatch(left, right) {
    const source = left && typeof left === "object" ? left : null;
    const target = right && typeof right === "object" ? right : null;
    if (!source || !target) return false;
    const idKeys = ["id", "reward_id", "discount_id", "source_discount_id"];
    for (const key of idKeys) {
      const sourceId = Number(source?.[key] || 0);
      const targetId = Number(target?.[key] || 0);
      if (sourceId > 0 && targetId > 0 && sourceId === targetId) {
        return true;
      }
    }
    const sourceCode = String(source?.code || "").trim().toUpperCase();
    const targetCode = String(target?.code || "").trim().toUpperCase();
    if (sourceCode && targetCode && sourceCode === targetCode) {
      return true;
    }
    return String(source?.title || "").trim() === String(target?.title || "").trim()
      && String(source?.badge_text || "").trim() === String(target?.badge_text || "").trim();
  }

  function resolveRightOrderBenefitDetailItem(order, payload) {
    const detailKind = String(payload?.kind || "").trim().toLowerCase();
    const targetItem = payload?.item && typeof payload.item === "object" ? payload.item : null;
    if (!targetItem || !order) return targetItem;
    const previewData = getRightOrderBenefitsPreviewSnapshot(order, {
      mode: getActiveRightOrderBenefitsMode(),
      preferApplied: true,
      allowStale: true,
      allowClientCache: true,
    });
    const data = getRightOrderBenefitsRenderData(previewData);
    let items = [];
    if (detailKind === "discount") {
      items = Array.isArray(data?.discounts) ? data.discounts : [];
    } else if (detailKind === "promo") {
      items = Array.isArray(data?.promo_codes) ? data.promo_codes : [];
    } else if (detailKind === "gift") {
      items = Array.isArray(data?.gifts) ? data.gifts : [];
    } else if (detailKind === "progress") {
      items = Array.isArray(data?.progress) ? data.progress : [];
    } else if (detailKind === "completed") {
      items = Array.isArray(data?.completed) ? data.completed : [];
    }
    return items.find((entry) => isRightOrderBenefitDetailItemMatch(entry, targetItem)) || targetItem;
  }

  function openRightOrderBenefitDetailScreen(orderId, payload = {}) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    captureRightBenefitsMainViewScroll();
    state.benefitsModal.orderId = id;
    state.benefitsModal.screen = "detail";
    state.benefitsModal.title = "Детали акции";
    state.benefitsModal.payload = payload && typeof payload === "object" ? { ...payload } : null;
    renderRightBenefitsOverlay(id);
  }

  function renderRightOrderBenefitDetailScreen(orderId) {
    const id = Number(orderId || 0);
    const payload = state.benefitsModal.payload && typeof state.benefitsModal.payload === "object"
      ? state.benefitsModal.payload
      : null;
    const orderIndex = getRightOrderIndexById(id);
    const order = orderIndex >= 0 ? (state.rightOrders[orderIndex] || {}) : null;
    const detailKind = String(payload?.kind || "").trim().toLowerCase();
    const item = resolveRightOrderBenefitDetailItem(order, payload);
    if (payload && item && payload.item !== item) {
      state.benefitsModal.payload = {
        ...payload,
        item,
      };
    }
    const modalApi = window.AdminBenefitsModal;
    const detailOptions = {
      moneyFormatter: typeof money === "function" ? money : null,
      formatProgressSummary: formatRightOrderBenefitProgressSummary,
    };
    let content = null;
    let extraDescription = "";
    let extraProductsSection = null;
    let actionConfig = null;

    if (detailKind === "discount") {
      content = modalApi?.buildDiscountDetailContent(item, detailOptions)
        || buildRightOrderBenefitDiscountDetailContent(item);
      actionConfig = {
        label: item?.is_selected === true ? "Выбрано" : "Применить",
        enabled: item?.is_selected === true || isRightOrderBenefitSelectable(item),
        current: item?.is_selected === true,
        onClick: async () => {
          await toggleRightOrderBenefitDiscount(id, item);
        },
      };
    } else if (detailKind === "promo") {
      const actionMode = String(item?.action_mode || "select").trim().toLowerCase() || "select";
      content = modalApi?.buildDiscountDetailContent(item, {
        ...detailOptions,
        primaryText: String(item?.code || "").trim() || "Промокод",
        primaryClassName: "is-code",
      }) || buildRightOrderBenefitPromoDetailContent(item);
      actionConfig = {
        label: actionMode === "redeem_reward"
          ? "Получить"
          : (item?.is_selected === true ? "Выбрано" : "Применить"),
        enabled: actionMode === "redeem_reward"
          ? item?.is_applicable === true
          : (item?.is_selected === true || isRightOrderBenefitSelectable(item)),
        current: item?.is_selected === true && actionMode !== "redeem_reward",
        onClick: async () => {
          await toggleRightOrderBenefitPromo(id, item);
        },
      };
    } else if (detailKind === "gift") {
      const actionMode = String(item?.action_mode || "receive").trim().toLowerCase() || "receive";
      if (actionMode === "claim_unique_promo") {
        const codeText = String(item?.code || "").trim();
        content = modalApi?.buildDiscountDetailContent(item, {
          ...detailOptions,
          primaryText: codeText || String(item?.badge_text || "").trim() || "Подарок",
          primaryClassName: codeText ? "is-code" : "",
        }) || buildRightOrderBenefitPromoDetailContent(item);
      } else {
        content = modalApi?.buildRewardPreviewContent(
          modalApi?.buildGiftPreview(item) || buildRightOrderBenefitGiftPreview(item),
          detailOptions
        ) || buildRightOrderBenefitRewardPreviewContent(buildRightOrderBenefitGiftPreview(item));
      }
      actionConfig = {
        label: actionMode === "claim_unique_promo" ? "Забрать" : "Получить",
        enabled: item?.is_receivable !== false
          && Number(actionMode === "claim_unique_promo" ? item?.discount_id : (item?.reward_id || item?.id) || 0) > 0,
        current: false,
        onClick: async () => {
          await receiveRightOrderBenefitGift(id, item);
        },
      };
    } else if (detailKind === "progress") {
      content = modalApi?.buildProgressInfoContent(item, detailOptions)
        || buildRightOrderBenefitProgressDetailContent(order, item);
      const progressProductsData = getRightOrderBenefitProgressProductsData(order, item);
      if (progressProductsData?.description) {
        extraDescription = String(progressProductsData.description || "").trim();
      }
      extraProductsSection = modalApi?.buildTargetProductsContent(
        progressProductsData?.items,
        progressProductsData?.title || "Что участвует",
        detailOptions
      ) || null;
      if (item?.is_claimable === true && String(item?.claim_mode || "").trim().toLowerCase() !== "gift_sheet") {
        actionConfig = {
          label: "Забрать",
          enabled: true,
          current: false,
          onClick: async () => {
            await claimRightOrderBenefitProgress(id, item);
          },
        };
      }
    } else if (detailKind === "completed") {
      const sourceKind = String(item?.source_kind || "").trim().toLowerCase();
      content = modalApi?.buildDiscountDetailContent(item, {
        ...detailOptions,
        primaryText: sourceKind === "promo_code"
          ? (String(item?.code || "").trim() || String(item?.title || "").trim() || "Промокод")
          : undefined,
        primaryClassName: sourceKind === "promo_code" ? "is-code" : "",
      }) || (sourceKind === "promo_code"
        ? buildRightOrderBenefitPromoDetailContent(item)
        : buildRightOrderBenefitDiscountDetailContent(item));
    }

    window.AdminBenefitsModal?.show({
      title: state.benefitsModal.title || "Детали акции",
      showBack: true,
      showModeToggle: false,
      mode: state.benefitsModal.mode,
      onClose: closeRightBenefitsOverlay,
      onBack: () => {
        state.benefitsModal.screen = "main";
        state.benefitsModal.title = "Выгоды";
        state.benefitsModal.payload = null;
        if (!restoreRightBenefitsMainView(Number(state.benefitsModal.orderId || 0))) {
          renderRightBenefitsOverlay(Number(state.benefitsModal.orderId || 0));
        }
      },
    });
    const { body } = getRightBenefitsOverlayElements();
    if (!body) return;
    body.innerHTML = "";

    const frame = createRightOrderBenefitsFrame({ detailFooter: !!actionConfig });
    if (!frame?.root || !frame.scrollEl) return;
    body.appendChild(frame.root);

    const shell = document.createElement("div");
    shell.className = "shop-checkout-benefit-detail-screen";
    frame.scrollEl.appendChild(shell);

    if (content instanceof Element) {
      shell.appendChild(content);
    }
    if (extraDescription) {
      const descriptionEl = document.createElement("div");
      descriptionEl.className = "shop-checkout-benefits-hint";
      descriptionEl.textContent = extraDescription;
      shell.appendChild(descriptionEl);
    }
    if (extraProductsSection instanceof Element && extraProductsSection.childNodes.length) {
      shell.appendChild(extraProductsSection);
    }
    if (frame.footerEl && actionConfig) {
      const actions = document.createElement("div");
      actions.className = "shop-checkout-benefit-detail-footer-actions";
      const actionBtn = document.createElement("button");
      actionBtn.type = "button";
      actionBtn.className = "shop-checkout-benefits-promo-entry-btn shop-checkout-benefit-claim-confirm shop-checkout-benefit-claim-confirm--footer";
      actionBtn.textContent = String(actionConfig.label || "Применить");
      actionBtn.disabled = actionConfig.enabled !== true;
      actionBtn.classList.toggle("is-current", actionConfig.current === true);
      actionBtn.classList.toggle("is-active", actionConfig.enabled === true && actionConfig.current !== true);
      actionBtn.addEventListener("click", async () => {
        if (actionBtn.disabled || typeof actionConfig.onClick !== "function") return;
        actionBtn.disabled = true;
        try {
          await actionConfig.onClick();
        } catch (error) {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
          actionBtn.disabled = actionConfig.enabled !== true;
        }
      });
      actions.appendChild(actionBtn);
      frame.footerEl.appendChild(actions);
    }
  }
  function getRightBenefitsOverlayElements() {
    return window.AdminBenefitsModal?.getElements() || {};
  }

  function ensureRightBenefitsOverlay() {
    window.AdminBenefitsModal?.ensure();
  }

  async function switchRightBenefitsOverlayMode(mode, opts = {}) {
    const nextMode = normalizeRightOrderBenefitsMode(mode);
    const orderId = Number(opts?.orderId || state.benefitsModal.orderId || 0);
    if (state.benefitsModal.mode === nextMode && !opts?.force) {
      setRightBenefitsModeToggleState(nextMode);
      return;
    }
    state.benefitsModal.mode = nextMode;
    state.benefitsModal.screen = "main";
    state.benefitsModal.title = "Выгоды";
    state.benefitsModal.payload = null;
    setRightBenefitsModeToggleState(nextMode);
    if (!(orderId > 0)) return;
    renderRightBenefitsOverlay(orderId);
    try {
      await loadRightOrderBenefitsPreview(orderId, {
        force: opts?.forceReload === true,
        render: true,
        mode: nextMode,
      });
    } catch (error) {
      showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
    }
  }

  function closeRightBenefitsOverlay() {
    if (String(state.benefitsModal.screen || "main") === "main") {
      captureRightBenefitsMainViewScroll();
    }
    window.AdminBenefitsModal?.hide({ clearBody: false });
    state.benefitsModal.orderId = 0;
    state.benefitsModal.mode = "customer";
    state.benefitsModal.screen = "main";
    state.benefitsModal.title = "Выгоды";
    state.benefitsModal.payload = null;
    state.benefitsModal.promoInputValue = "";
    state.benefitsModal.busy = false;
    setRightBenefitsModeToggleState("customer");
  }

  function buildRightOrderGiftClaimOrderItem(optionItem, rewardId) {
    const productId = Number(optionItem?.product_id || optionItem?.id || 0);
    const productConfig = optionItem?.product_config && typeof optionItem.product_config === "object"
      ? optionItem.product_config
      : null;
    const optionRows = (Array.isArray(productConfig?.options) ? productConfig.options : [])
      .map((option) => ({
        id: Number(option?.id || 0),
        qty: Math.max(1, Number(option?.qty ?? option?.quantity ?? 1) || 1),
        group_id: Number(option?.group_id || 0) || null,
        variant_group_id: Number(option?.variant_group_id || 0) || null,
        variant_value_index: Number.isFinite(Number(option?.variant_value_index))
          ? Number(option.variant_value_index)
          : null,
      }))
      .filter((option) => Number(option?.id || 0) > 0);
    const ingredientRows = (Array.isArray(productConfig?.ingredients) ? productConfig.ingredients : [])
      .map((ingredient) => ({
        ingredient_id: Number(ingredient?.ingredient_id || ingredient?.product_id || 0),
        qty: Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
      }))
      .filter((ingredient) => Number(ingredient?.ingredient_id || 0) > 0);
    const oldLineTotal = Math.max(0, Number(optionItem?.price || optionItem?.line_total || optionItem?.old_line_total || 0) || 0);
    return {
      product_id: productId,
      product_name: String(optionItem?.name || optionItem?.title || "").trim(),
      name: String(optionItem?.name || optionItem?.title || "").trim(),
      qty: 1,
      line_total: 0,
      old_line_total: oldLineTotal,
      photos: Array.isArray(optionItem?.photos) ? optionItem.photos.slice() : [],
      variant_group_id: Number(productConfig?.variant_group_id || 0) || null,
      variant_value_index: Number.isFinite(Number(productConfig?.variant_value_index))
        ? Number(productConfig.variant_value_index)
        : null,
      variant_label: String(optionItem?.variant_label || "").trim(),
      variant_group_title: String(optionItem?.variant_group_title || "").trim(),
      variant_unit: String(optionItem?.variant_unit || "").trim(),
      variants: Array.isArray(optionItem?.variants) ? optionItem.variants.map((variant) => ({ ...variant })) : [],
      option_items: optionRows.map((option) => ({ ...option })),
      options: optionRows.map((option) => ({ ...option })),
      ingredients: ingredientRows,
      is_gift_reward: 1,
      gift_reward_id: Number(rewardId || 0) > 0 ? Number(rewardId) : null,
    };
  }

  async function stageRightOrderBenefitGiftRewardInCart(orderId, giftItem, overrideProducts = null) {
    const id = Number(orderId || 0);
    const rewardId = Number(giftItem?.reward_id || giftItem?.id || 0) || null;
    const products = Array.isArray(overrideProducts)
      ? overrideProducts.filter((product) => Number(product?.id || product?.product_id || 0) > 0)
      : getRightOrderBenefitGiftProducts(giftItem);
    if (!(id > 0) || !rewardId || !products.length) {
      return { ok: false, reason: "invalid" };
    }
    const index = getRightOrderIndexById(id);
    if (index < 0) return { ok: false, reason: "invalid" };
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const nextCartItems = Array.isArray(form.cartItems) ? form.cartItems.map((item) => ({ ...item })) : [];
    const startLength = nextCartItems.length;

    for (const productInfo of products) {
      const productId = Number(productInfo?.id || productInfo?.product_id || 0);
      if (!(productId > 0)) continue;
      const product = await ensureProductById(productId);
      if (!product) return { ok: false, reason: "unavailable" };
      const resolvedProductInfo = await resolveRightOrderBenefitConfiguredProduct(productInfo, {
        forceDefaultConfig: true,
      });
      const rewardOrderItem = buildRightOrderGiftClaimOrderItem(resolvedProductInfo, rewardId);
      const cartItem = await buildCartItemFromOrderProduct(rewardOrderItem);
      if (!cartItem) return { ok: false, reason: "unavailable" };
      nextCartItems.push(cartItem);
    }

    if (nextCartItems.length <= startLength) {
      return { ok: false, reason: "invalid" };
    }
    updateRightOrderCartItems(id, nextCartItems, { render: false });
    return { ok: true, reason: "added" };
  }

  async function setRightOrderBenefitsSelection(orderId, selection, opts = {}) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return null;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? { ...order.form } : {};
    const activeMode = normalizeRightOrderBenefitsMode(opts?.mode || getActiveRightOrderBenefitsMode());
    form.promo_code = normalizeRightOrderBenefitsPromoCode(selection?.promoCode);
    form.selected_discount_id = normalizeRightOrderBenefitsSelectedId(selection?.selectedDiscountId);
    form.selected_discount_source = form.selected_discount_id
      ? (normalizeRightOrderBenefitsDiscountSource(selection?.selectedDiscountSource) || "discount")
      : null;
    form.selected_promo_source = (form.promo_code || normalizeRightOrderBenefitsSelectedId(selection?.selectedPromoRewardId))
      ? (normalizeRightOrderBenefitsPromoSource(selection?.selectedPromoSource) || "promo_code")
      : null;
    form.selected_promo_reward_id = normalizeRightOrderBenefitsSelectedId(selection?.selectedPromoRewardId);
    form.benefits_preview_mode = hasRightOrderBenefitsSelection(form) ? activeMode : null;
    const shouldMarkTouched = String(order?.mode || "").trim().toLowerCase() === "edit";
    state.rightOrders[index] = {
      ...order,
      form,
      editCartTouched: shouldMarkTouched ? true : Boolean(order?.editCartTouched),
    };
    state.benefitsModal.promoInputValue = form.promo_code || "";
    if (opts?.render !== false) {
      renderRightOrderTabs();
      if (opts?.renderOverlay !== false) queueRenderRightBenefitsModal(id);
    }
    await loadRightOrderBenefitsPreview(id, {
      force: true,
      render: opts?.render !== false,
      renderOverlay: opts?.renderOverlay !== false,
      prefetchedData: opts?.prefetchedData || null,
      mode: getRightOrderBenefitsPreferredMode(form, activeMode),
    });
    return state.rightOrders[index] || null;
  }

  async function applyRightOrderBenefitsManualPromo(orderId, rawValue) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? order.form : {};
    const selection = getRightOrderBenefitsSelectionState(form);
    const promoCode = normalizeRightOrderBenefitsPromoCode(rawValue || "");
    if (!promoCode) return;
    state.benefitsModal.promoInputValue = promoCode;
    await setRightOrderBenefitsSelection(id, {
      selectedDiscountId: selection.selectedDiscountId,
      selectedDiscountSource: selection.selectedDiscountSource,
      promoCode,
      selectedPromoSource: "promo_code",
      selectedPromoRewardId: null,
    });
  }

  async function toggleRightOrderBenefitDiscount(orderId, discountCard) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? order.form : {};
    const previewData = getRightOrderBenefitsPreviewSnapshot(order, {
      mode: getActiveRightOrderBenefitsMode(),
      preferApplied: true,
      allowStale: true,
      allowClientCache: true,
    });
    const promoCards = Array.isArray(previewData?.promo_codes) ? previewData.promo_codes : [];
    const selection = getRightOrderBenefitsSelectionState(form);
    const source = normalizeRightOrderBenefitsDiscountSource(discountCard?.source) || "discount";
    const nextSelectedDiscountId = discountCard?.is_selected
      ? null
      : normalizeRightOrderBenefitsSelectedId(
          source === "reward_discount" ? (discountCard?.reward_id || discountCard?.id) : discountCard?.id
        );
    let nextPromoCode = selection.promoCode;
    let nextSelectedPromoSource = selection.selectedPromoSource;
    let nextSelectedPromoRewardId = selection.selectedPromoRewardId;
    if (nextSelectedDiscountId && nextPromoCode) {
      const currentPromoCard = promoCards.find((entry) => entry?.is_selected) || null;
      if (currentPromoCard && !(isRightOrderBenefitStackable(discountCard) && isRightOrderBenefitStackable(currentPromoCard))) {
        nextPromoCode = null;
        nextSelectedPromoSource = null;
        nextSelectedPromoRewardId = null;
      }
    }
    await setRightOrderBenefitsSelection(id, {
      selectedDiscountId: nextSelectedDiscountId,
      selectedDiscountSource: nextSelectedDiscountId ? source : null,
      promoCode: nextPromoCode,
      selectedPromoSource: nextSelectedPromoSource,
      selectedPromoRewardId: nextSelectedPromoRewardId,
    });
  }

  async function toggleRightOrderBenefitPromo(orderId, promoCard) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? order.form : {};
    const previewData = getRightOrderBenefitsPreviewSnapshot(order, {
      mode: getActiveRightOrderBenefitsMode(),
      preferApplied: true,
      allowStale: true,
      allowClientCache: true,
    });
    const discountCards = Array.isArray(previewData?.discounts) ? previewData.discounts : [];
    const selection = getRightOrderBenefitsSelectionState(form);
    const actionMode = String(promoCard?.action_mode || "select").trim().toLowerCase() || "select";
    if (actionMode === "redeem_reward") {
      const token = await ensureRightOrderBenefitsCustomerToken(id);
      if (!token) throw new Error("UNAUTHORIZED");
      const json = await apiJson("/api/public/checkout/benefits/redeem-promo", {
        method: "POST",
        headers: { "x-customer-token": token },
        body: JSON.stringify({
          ...buildRightOrderBenefitsPreviewRequest(order),
          promo_code_id: Number(promoCard?.id || 0) || null,
        }),
      });
      await loadRightOrderBenefitsPreview(id, {
        force: true,
        render: true,
        prefetchedData: json?.data || null,
      });
      return;
    }

    const source = normalizeRightOrderBenefitsPromoSource(promoCard?.source) || "promo_code";
    const nextPromoCode = promoCard?.is_selected ? null : normalizeRightOrderBenefitsPromoCode(promoCard?.code);
    const nextSelectedPromoSource = nextPromoCode ? source : null;
    const nextSelectedPromoRewardId = nextPromoCode && source === "reward_promo"
      ? normalizeRightOrderBenefitsSelectedId(promoCard?.reward_id || promoCard?.id)
      : null;
    let nextSelectedDiscountId = selection.selectedDiscountId;
    let nextSelectedDiscountSource = selection.selectedDiscountSource;
    if (nextPromoCode && nextSelectedDiscountId) {
      const currentDiscountCard = discountCards.find((entry) => {
        const entrySource = normalizeRightOrderBenefitsDiscountSource(entry?.source) || "discount";
        const entryId = entrySource === "reward_discount"
          ? normalizeRightOrderBenefitsSelectedId(entry?.reward_id || entry?.id)
          : normalizeRightOrderBenefitsSelectedId(entry?.id);
        return entryId === nextSelectedDiscountId && entrySource === nextSelectedDiscountSource;
      }) || null;
      if (currentDiscountCard && !(isRightOrderBenefitStackable(currentDiscountCard) && isRightOrderBenefitStackable(promoCard))) {
        nextSelectedDiscountId = null;
        nextSelectedDiscountSource = null;
      }
    }
    await setRightOrderBenefitsSelection(id, {
      selectedDiscountId: nextSelectedDiscountId,
      selectedDiscountSource: nextSelectedDiscountSource,
      promoCode: nextPromoCode,
      selectedPromoSource: nextSelectedPromoSource,
      selectedPromoRewardId: nextSelectedPromoRewardId,
    });
  }

  async function receiveRightOrderBenefitGift(orderId, giftItem) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const token = await ensureRightOrderBenefitsCustomerToken(id);
    if (!token) throw new Error("UNAUTHORIZED");
    const json = await apiJson("/api/public/checkout/benefits/receive-gift", {
      method: "POST",
      headers: { "x-customer-token": token },
      body: JSON.stringify({
        ...buildRightOrderBenefitsPreviewRequest(order),
        reward_id: Number(giftItem?.reward_id || giftItem?.id || 0) || null,
      }),
    });
    const products = Array.isArray(json?.data?.products) ? json.data.products : [];
    const stageResult = await stageRightOrderBenefitGiftRewardInCart(id, giftItem, products);
    if (!stageResult?.ok) {
      try {
        await restoreRightOrderGiftReward(id, Number(giftItem?.reward_id || giftItem?.id || 0), { silent: true });
      } catch {}
      if (stageResult?.reason === "unavailable") {
        throw new Error("REWARD_NOT_APPLICABLE");
      }
      throw new Error("REWARD_INVALID");
    }
    await loadRightOrderBenefitsPreview(id, { force: true, render: true });
  }

  async function claimRightOrderBenefitProgress(orderId, progressItem, selectedRewardItems = null) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const token = await ensureRightOrderBenefitsCustomerToken(id);
    if (!token) throw new Error("UNAUTHORIZED");
    const body = {
      ...buildRightOrderBenefitsPreviewRequest(order),
      discount_id: Number(progressItem?.discount_id || progressItem?.id || 0) || null,
    };
    if (Array.isArray(selectedRewardItems) && selectedRewardItems.length) {
      body.selected_reward_items = selectedRewardItems;
    }
    const json = await apiJson("/api/public/checkout/benefits/claim-progress", {
      method: "POST",
      headers: { "x-customer-token": token },
      body: JSON.stringify(body),
    });
    state.benefitsModal.screen = "main";
    state.benefitsModal.title = "Выгоды";
    state.benefitsModal.payload = null;
    await loadRightOrderBenefitsPreview(id, {
      force: true,
      render: true,
      prefetchedData: json?.data || null,
    });
  }

  function buildRightOrderBenefitRewardClaimProductCard(snapshot, {
    getSelectionState,
    onChange,
    mountConfig,
    getExpandedSelectionKey,
    onToggleExpand,
    useCollapsedConfig = false,
  } = {}) {
    const item = snapshot && typeof snapshot === "object" ? snapshot : {};
    const configMode = normalizeRightOrderBenefitProductConfigMode(item?.config_mode, "any");
    const isReadOnlyConfig = configMode !== "any";
    const selectionKey = String(item?.selection_key || "").trim();
    const hasConfigurable = item?.has_configurable === true;
    const isExpanded = useCollapsedConfig && hasConfigurable
      && selectionKey
      && String(typeof getExpandedSelectionKey === "function" ? getExpandedSelectionKey() : "").trim() === selectionKey;
    const hasVisibleExpand = hasConfigurable && (!useCollapsedConfig || isExpanded);
    const card = document.createElement("div");
    card.className = "cart-row shop-combo-picker-row shop-checkout-benefit-claim-card shop-checkout-benefit-claim-combo-card";
    if (isReadOnlyConfig) card.classList.add("is-readonly");
    if (hasVisibleExpand) card.classList.add("is-expanded");

    const photos = Array.isArray(item?.photos) ? item.photos : [];
    const photoUrl = String(item?.photo_url || photos[0] || "").trim();
    if (photoUrl) {
      const image = document.createElement("img");
      image.className = "cart-thumb";
      image.src = photoUrl;
      image.alt = String(item?.name || "").trim() || "Подарок";
      card.appendChild(image);
    } else {
      const media = document.createElement("div");
      media.className = "cart-thumb shop-checkout-benefit-claim-media";
      media.appendChild(createRightOrderBenefitIcon(getRightOrderBenefitRewardIconName("gift")));
      card.appendChild(media);
    }

    const mid = document.createElement("div");
    mid.className = "cart-mid shop-combo-picker-mid";

    const title = document.createElement("div");
    title.className = "cart-title";
    title.textContent = String(item?.name || item?.title || "").trim() || "Подарок";
    mid.appendChild(title);

    const metaRow = document.createElement("div");
    metaRow.className = "shop-checkout-benefit-claim-gift-meta";
    const giftBadge = document.createElement("span");
    giftBadge.className = "shop-checkout-benefit-claim-gift-badge";
    giftBadge.textContent = "Подарок";
    metaRow.appendChild(giftBadge);
    if (isReadOnlyConfig) {
      const modeNote = document.createElement("span");
      modeNote.className = "shop-checkout-benefit-claim-mode-note";
      modeNote.textContent = "Фиксированный состав";
      metaRow.appendChild(modeNote);
    }
    mid.appendChild(metaRow);

    const summaryWrap = document.createElement("div");
    summaryWrap.className = "shop-checkout-benefit-claim-config-summary";
    const syncSummaryLines = (productItem) => {
      summaryWrap.innerHTML = "";
      appendRightOrderBenefitProductConfigLines(summaryWrap, productItem);
      summaryWrap.hidden = !summaryWrap.childElementCount;
    };
    syncSummaryLines(item);
    if (!useCollapsedConfig) summaryWrap.hidden = true;
    mid.appendChild(summaryWrap);

    const bottomRow = document.createElement("div");
    bottomRow.className = "shop-combo-picker-bottom";

    const priceWrap = document.createElement("div");
    priceWrap.className = "shop-combo-picker-price shop-checkout-benefit-claim-price-wrap";
    const priceEl = document.createElement("span");
    priceEl.className = "shop-combo-price";
    priceEl.textContent = typeof money === "function"
      ? money(Number(item?.price || 0))
      : String(Number(item?.price || 0) || 0);
    priceWrap.appendChild(priceEl);
    const priceNote = document.createElement("span");
    priceNote.className = "shop-checkout-benefit-claim-price-note";
    priceNote.textContent = "будет в подарок";
    priceWrap.appendChild(priceNote);
    bottomRow.appendChild(priceWrap);

    const actionsWrap = document.createElement("div");
    actionsWrap.className = "shop-combo-picker-actions shop-checkout-benefit-claim-inline-actions";
    const counter = document.createElement("div");
    counter.className = "shop-checkout-benefit-claim-counter";

    const minusBtn = document.createElement("button");
    minusBtn.type = "button";
    minusBtn.className = "shop-combo-picker-ingredient-btn shop-checkout-benefit-claim-stepper-btn";
    minusBtn.setAttribute("aria-label", "Уменьшить");
    minusBtn.innerHTML = '<span aria-hidden="true">−</span>';
    minusBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onChange === "function") onChange(item, -1);
    });
    counter.appendChild(minusBtn);

    const countEl = document.createElement("div");
    countEl.className = "shop-checkout-benefit-claim-counter-value";
    counter.appendChild(countEl);

    const plusBtn = document.createElement("button");
    plusBtn.type = "button";
    plusBtn.className = "shop-combo-picker-ingredient-btn shop-checkout-benefit-claim-stepper-btn";
    plusBtn.setAttribute("aria-label", "Увеличить");
    plusBtn.innerHTML = '<span aria-hidden="true">+</span>';
    plusBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof onChange === "function") onChange(item, 1);
    });
    counter.appendChild(plusBtn);
    actionsWrap.appendChild(counter);

    let gearBtn = null;
    if (hasConfigurable && useCollapsedConfig) {
      gearBtn = document.createElement("button");
      gearBtn.type = "button";
      gearBtn.className = "shop-combo-picker-gear" + (isExpanded ? " is-open" : "");
      gearBtn.title = "Настроить варианты и состав";
      gearBtn.setAttribute("aria-label", "Настроить варианты и состав");
      gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
      gearBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof onToggleExpand === "function") onToggleExpand(item);
      });
      actionsWrap.appendChild(gearBtn);
    }

    bottomRow.appendChild(actionsWrap);
    card.appendChild(mid);
    card.appendChild(bottomRow);

    if (hasVisibleExpand) {
      const expandWrap = document.createElement("div");
      expandWrap.className = "shop-combo-picker-expand shop-checkout-benefit-claim-expand";
      const expandInner = document.createElement("div");
      expandInner.className = "shop-combo-picker-expand-inner";
      if (typeof mountConfig === "function") {
        const configHost = document.createElement("div");
        configHost.className = "shop-checkout-benefit-claim-config";
        expandInner.appendChild(configHost);
        mountConfig(item, configHost, {
          priceEl,
          isReadOnlyConfig,
          updateSummary: (resolvedItem) => {
            syncSummaryLines(resolvedItem);
          },
        });
      }
      expandWrap.appendChild(expandInner);
      card.appendChild(expandWrap);
    }

    const sync = () => {
      const selectionState = typeof getSelectionState === "function"
        ? (getSelectionState(item) || {})
        : {};
      const count = Math.max(0, Number(selectionState?.count || 0));
      countEl.textContent = String(count);
      minusBtn.disabled = selectionState?.canDecrement === false;
      plusBtn.disabled = selectionState?.canIncrement === false;
      card.classList.toggle("is-selected", count > 0);
      if (gearBtn) gearBtn.classList.toggle("is-open", isExpanded);
    };

    sync();
    return { card, sync };
  }

  async function openRightOrderBenefitGiftClaimScreen(orderId, progressItem) {
    const id = Number(orderId || 0);
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    captureRightBenefitsMainViewScroll();
    const order = state.rightOrders[index] || {};
    const token = await ensureRightOrderBenefitsCustomerToken(id);
    if (!token) throw new Error("UNAUTHORIZED");
    const json = await apiJson("/api/public/checkout/benefits/claim-progress-options", {
      method: "POST",
      headers: { "x-customer-token": token },
      body: JSON.stringify({
        ...buildRightOrderBenefitsPreviewRequest(order),
        discount_id: Number(progressItem?.discount_id || progressItem?.id || 0) || null,
      }),
    });
    const data = json?.data && typeof json.data === "object" ? json.data : {};
    const items = await Promise.all(
      (Array.isArray(data?.items) ? data.items : []).map(async (item, idx) => {
        const productId = Number(item?.product_id || item?.id || 0);
        const normalizedItem = {
          ...(item && typeof item === "object" ? item : {}),
          selection_key: String(item?.selection_key || `${productId}:${idx}`).trim(),
          config_mode: normalizeRightOrderBenefitProductConfigMode(item?.config_mode, "any"),
          product_config: normalizeRightOrderBenefitProductConfig(item?.product_config, productId),
          selected_qty: 0,
        };
        const resolvedItem = await resolveRightOrderBenefitConfiguredProduct(normalizedItem, {
          forceDefaultConfig: true,
        });
        const variantGroups = Array.isArray(state.productVariants.get(productId))
          ? state.productVariants.get(productId)
          : [];
        const ingredients = Array.isArray(state.productIngredients.get(productId))
          ? state.productIngredients.get(productId)
          : [];
        const hasVariants = variantGroups.some((group) => Array.isArray(group?.values) && group.values.length > 0);
        const hasVariableIngredients = ingredients.some((ingredient) => Number(ingredient?.is_variable ?? 1) === 1);
        return {
          ...resolvedItem,
          selection_key: normalizedItem.selection_key,
          selected_qty: 0,
          has_configurable: hasVariants || hasVariableIngredients,
        };
      })
    );
    state.rightBenefitsClaimOptionsByOrder.set(id, {
      progressItem,
      selection_limit: Math.max(0, Number(data?.selection_limit || 0)),
      items,
      expanded_selection_key: "",
    });
    state.benefitsModal.orderId = id;
    state.benefitsModal.screen = "gift-claim";
    state.benefitsModal.title = "Выбрать подарки";
    state.benefitsModal.payload = null;
    renderRightBenefitsOverlay(id);
  }

  function renderRightOrderBenefitGiftClaimScreen(orderId) {
    const id = Number(orderId || 0);
    window.AdminBenefitsModal?.show({
      title: state.benefitsModal.title || "Выбрать подарки",
      showBack: true,
      showModeToggle: false,
      mode: state.benefitsModal.mode,
      onClose: closeRightBenefitsOverlay,
      onBack: () => {
        state.benefitsModal.screen = "main";
        state.benefitsModal.title = "Выгоды";
        state.benefitsModal.payload = null;
        if (!restoreRightBenefitsMainView(Number(state.benefitsModal.orderId || 0))) {
          renderRightBenefitsOverlay(Number(state.benefitsModal.orderId || 0));
        }
      },
    });
    const { body } = getRightBenefitsOverlayElements();
    if (!body) return;
    const claimState = state.rightBenefitsClaimOptionsByOrder.get(id) || null;
    const progressItem = claimState?.progressItem || null;
    const selectionLimit = Math.max(0, Number(claimState?.selection_limit || 0));
    const items = Array.isArray(claimState?.items) ? claimState.items : [];
    const isMobileGiftClaim = window.matchMedia("(max-width: 768px)").matches;
    body.innerHTML = "";

    const frame = createRightOrderBenefitsFrame({ detailFooter: true });
    if (!frame?.root || !frame.scrollEl) return;
    body.appendChild(frame.root);

    const shell = document.createElement("div");
    shell.className = "shop-checkout-benefit-detail-screen";
    frame.scrollEl.appendChild(shell);

    const formatGiftClaimCount = (count) => {
      const normalized = Math.max(0, Number(count || 0));
      const mod10 = normalized % 10;
      const mod100 = normalized % 100;
      if (mod10 === 1 && mod100 !== 11) return "подарок";
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "подарка";
      return "подарков";
    };
    const getTotalSelected = () => items.reduce((sum, item) => sum + Math.max(0, Number(item?.selected_qty || 0)), 0);
    const getSelectionState = (item) => {
      const count = Math.max(0, Number(item?.selected_qty || 0));
      const maxSelectableQty = Math.max(0, Number(item?.max_selectable_qty || 0));
      const totalSelected = getTotalSelected();
      return {
        count,
        canDecrement: count > 0,
        canIncrement: count < maxSelectableQty && totalSelected < selectionLimit,
      };
    };

    const info = document.createElement("div");
    info.className = "shop-checkout-benefit-claim-summary";
    shell.appendChild(info);

    if (!items.length || !(selectionLimit > 0)) {
      const empty = document.createElement("div");
      empty.className = "shop-profile-card shop-checkout-benefits-empty";
      empty.textContent = "Сейчас нет доступных подарков для этой акции.";
      shell.appendChild(empty);
      info.textContent = "Можно забрать 0 подарков";
      return;
    }

    let syncFns = [];
    const getExpandedSelectionKey = () => String(claimState?.expanded_selection_key || "").trim();
    const setExpandedSelectionKey = (value) => {
      if (!claimState) return;
      claimState.expanded_selection_key = String(value || "").trim();
    };
    const getStoredProductConfig = (item) => normalizeRightOrderBenefitProductConfig(
      item?.product_config,
      Number(item?.product_id || item?.id || 0)
    );
    const setStoredProductConfig = (item, config) => {
      item.product_config = normalizeRightOrderBenefitProductConfig(
        config,
        Number(item?.product_id || item?.id || 0)
      );
    };

    const mountGiftClaimConfig = (item, host, ui = {}) => {
      if (!host) return;
      const productId = Number(item?.product_id || item?.id || 0);
      if (!(productId > 0)) return;
      const configMode = normalizeRightOrderBenefitProductConfigMode(item?.config_mode, "any");
      const isReadOnlyConfig = configMode !== "any";
      host.innerHTML = '<div class="shop-checkout-benefit-claim-config-loading">Загрузка вариантов...</div>';
      void (async () => {
        try {
          const product = await ensureProductById(productId);
          if (!product) {
            if (host.isConnected) host.innerHTML = "";
            return;
          }
          await loadVariantsForProducts([product]);
          await loadIngredientsForProducts([product]);
          const variants = Array.isArray(state.productVariants.get(productId))
            ? state.productVariants.get(productId)
            : [];
          const ingredients = (Array.isArray(state.productIngredients.get(productId))
            ? state.productIngredients.get(productId)
            : []).filter((ingredient) => Number(ingredient?.is_variable ?? 1) === 1);
          const resolvedItem = await resolveRightOrderBenefitConfiguredProduct({
            ...item,
            product_config: getStoredProductConfig(item),
          }, { forceDefaultConfig: true });
          if (!host.isConnected) return;
          const currentConfig = normalizeRightOrderBenefitProductConfig(resolvedItem?.product_config, productId);
          if (!currentConfig) {
            host.innerHTML = "";
            return;
          }
          setStoredProductConfig(item, currentConfig);
          host.innerHTML = "";

          const applyResolvedPreview = (resolvedPreviewItem) => {
            if (!resolvedPreviewItem || typeof resolvedPreviewItem !== "object") return;
            item.price = Number(resolvedPreviewItem?.price || item?.price || 0);
            item.line_total = Number(resolvedPreviewItem?.line_total || item?.line_total || item?.price || 0);
            item.product_config = normalizeRightOrderBenefitProductConfig(
              resolvedPreviewItem?.product_config,
              productId
            );
            item.config_display_lines = Array.isArray(resolvedPreviewItem?.config_display_lines)
              ? resolvedPreviewItem.config_display_lines.slice()
              : [];
            item.ingredients_display = Array.isArray(resolvedPreviewItem?.ingredients_display)
              ? resolvedPreviewItem.ingredients_display.slice()
              : [];
            item.ingredients = Array.isArray(resolvedPreviewItem?.ingredients)
              ? resolvedPreviewItem.ingredients.slice()
              : [];
            item.variant_label = String(resolvedPreviewItem?.variant_label || item?.variant_label || "").trim();
            item.variant_group_title = String(resolvedPreviewItem?.variant_group_title || item?.variant_group_title || "").trim();
            item.variant_unit = String(resolvedPreviewItem?.variant_unit || item?.variant_unit || "").trim();
            if (ui?.priceEl?.isConnected && typeof money === "function") {
              ui.priceEl.textContent = money(Number(resolvedPreviewItem?.price || item?.price || 0));
            }
            if (typeof ui?.updateSummary === "function") {
              ui.updateSummary(resolvedPreviewItem);
            }
          };

          const refreshResolvedPreview = () => {
            const nextConfig = getStoredProductConfig(item);
            void resolveRightOrderBenefitConfiguredProduct({
              ...item,
              product_config: nextConfig,
            }, { forceDefaultConfig: true }).then((resolvedPreviewItem) => {
              applyResolvedPreview(resolvedPreviewItem);
            }).catch(() => {});
          };
          refreshResolvedPreview();

          const formatQtyLabel = (value) => {
            const numeric = Number(value);
            if (!Number.isFinite(numeric)) return "0";
            if (Math.abs(numeric - Math.round(numeric)) < 0.0001) return String(Math.round(numeric));
            return String(numeric).replace(".", ",");
          };
          const currentIngredientQty = new Map(
            (Array.isArray(currentConfig?.ingredients) ? currentConfig.ingredients : []).map((ingredient) => [
              Number(ingredient?.ingredient_id || 0),
              Number(ingredient?.qty ?? ingredient?.quantity ?? 0) || 0,
            ])
          );

          const persistConfig = () => {
            setStoredProductConfig(item, {
              type: "product",
              product_id: productId,
              variant_group_id: currentConfig?.variant_group_id ?? null,
              variant_value_index: currentConfig?.variant_value_index ?? null,
              options: Array.isArray(currentConfig?.options) ? currentConfig.options : [],
              ingredients: ingredients.map((ingredient) => ({
                ingredient_id: Number(ingredient?.ingredient_id || 0),
                qty: Number(
                  currentIngredientQty.get(Number(ingredient?.ingredient_id || 0))
                  ?? Number(ingredient?.quantity ?? 0)
                  ?? 0
                ),
              })),
            });
            refreshResolvedPreview();
          };

          const variantGroup = Array.isArray(variants) && variants.length ? variants[0] : null;
          const variantValues = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
          if (variantGroup && variantValues.length) {
            const variantsBlock = document.createElement("div");
            variantsBlock.className = "shop-combo-picker-variants";
            const variantsTitle = document.createElement("div");
            variantsTitle.className = "shop-combo-picker-expand-title";
            variantsTitle.textContent = String(variantGroup?.title || variantGroup?.title_label || "").trim() || "Вариант";
            variantsBlock.appendChild(variantsTitle);
            const variantsRow = document.createElement("div");
            variantsRow.className = "shop-combo-picker-variants-row";
            const unitShort = String(
              variantGroup?.unit_short_title || variantGroup?.unit_title || variantGroup?.unit_code || ""
            ).trim();
            variantValues.forEach((value, valueIndex) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "shop-combo-picker-variant-btn";
              const label = String(value || "").trim();
              btn.textContent = unitShort ? `${label} ${unitShort}` : label;
              if (isReadOnlyConfig) btn.disabled = true;
              const syncBtn = () => {
                btn.classList.toggle("is-active", Number(currentConfig?.variant_value_index ?? 0) === Number(valueIndex));
              };
              syncBtn();
              btn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isReadOnlyConfig) return;
                currentConfig.variant_group_id = Number(variantGroup?.id || variantGroup?.variant_group_id || 0) || null;
                currentConfig.variant_value_index = valueIndex;
                persistConfig();
                variantsRow.querySelectorAll(".shop-combo-picker-variant-btn").forEach((node, nodeIndex) => {
                  node.classList.toggle("is-active", Number(nodeIndex) === Number(valueIndex));
                });
              });
              variantsRow.appendChild(btn);
            });
            variantsBlock.appendChild(variantsRow);
            host.appendChild(variantsBlock);
          }

          if (ingredients.length) {
            const ingredientsBlock = document.createElement("div");
            ingredientsBlock.className = "shop-combo-picker-ingredients";
            const ingredientsTitle = document.createElement("div");
            ingredientsTitle.className = "shop-combo-picker-expand-title";
            ingredientsTitle.textContent = isReadOnlyConfig ? "Состав:" : "Состав (можно настроить):";
            ingredientsBlock.appendChild(ingredientsTitle);
            ingredients.forEach((ingredient) => {
              const ingredientId = Number(ingredient?.ingredient_id || 0);
              if (!(ingredientId > 0)) return;
              const row = document.createElement("div");
              row.className = "shop-combo-picker-ingredient-row";
              const imgWrap = document.createElement("div");
              imgWrap.className = "shop-combo-picker-ingredient-img";
              const ingredientPhoto = Array.isArray(ingredient?.ingredient_photos) && ingredient.ingredient_photos[0]
                ? ingredient.ingredient_photos[0]
                : "";
              if (ingredientPhoto) {
                const image = document.createElement("img");
                image.src = ingredientPhoto;
                image.alt = "";
                imgWrap.appendChild(image);
              }
              row.appendChild(imgWrap);
              const name = document.createElement("span");
              name.className = "shop-combo-picker-ingredient-name";
              name.textContent = String(ingredient?.ingredient_name || ingredient?.name || "").trim();
              row.appendChild(name);
              const qtyWrap = document.createElement("div");
              qtyWrap.className = "shop-combo-picker-ingredient-qty";
              const minusBtn = document.createElement("button");
              minusBtn.type = "button";
              minusBtn.className = "shop-combo-picker-ingredient-btn";
              minusBtn.innerHTML = '<span aria-hidden="true">−</span>';
              const qtyVal = document.createElement("span");
              qtyVal.className = "shop-combo-picker-ingredient-qty-val";
              const plusBtn = document.createElement("button");
              plusBtn.type = "button";
              plusBtn.className = "shop-combo-picker-ingredient-btn";
              plusBtn.textContent = "+";
              const step = Number(ingredient?.quantity_step ?? 1) || 1;
              const minQty = Number(ingredient?.quantity_min ?? ingredient?.quantity ?? 0) || 0;
              const maxQtyRaw = Number(ingredient?.quantity_max);
              const maxQty = Number.isFinite(maxQtyRaw) && maxQtyRaw > 0 ? maxQtyRaw : Infinity;
              const unitShort = String(
                ingredient?.unit_short_title || ingredient?.unit_title || ingredient?.unit_code || ""
              ).trim();
              const syncQty = () => {
                const currentQty = Number(
                  currentIngredientQty.get(ingredientId)
                  ?? Number(ingredient?.quantity ?? 0)
                  ?? 0
                );
                qtyVal.textContent = unitShort ? `${formatQtyLabel(currentQty)} ${unitShort}` : formatQtyLabel(currentQty);
                minusBtn.disabled = isReadOnlyConfig || currentQty <= minQty;
                plusBtn.disabled = isReadOnlyConfig || currentQty >= maxQty;
              };
              minusBtn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isReadOnlyConfig) return;
                const currentQty = Number(currentIngredientQty.get(ingredientId) ?? Number(ingredient?.quantity ?? 0) ?? 0);
                const nextQty = Math.max(minQty, currentQty - step);
                currentIngredientQty.set(ingredientId, nextQty);
                persistConfig();
                syncQty();
              });
              plusBtn.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                if (isReadOnlyConfig) return;
                const currentQty = Number(currentIngredientQty.get(ingredientId) ?? Number(ingredient?.quantity ?? 0) ?? 0);
                const nextQty = Math.min(maxQty, currentQty + step);
                currentIngredientQty.set(ingredientId, nextQty);
                persistConfig();
                syncQty();
              });
              qtyWrap.appendChild(minusBtn);
              qtyWrap.appendChild(qtyVal);
              qtyWrap.appendChild(plusBtn);
              row.appendChild(qtyWrap);
              ingredientsBlock.appendChild(row);
              syncQty();
            });
            host.appendChild(ingredientsBlock);
          }
        } catch (error) {
          console.warn("Failed to mount right-order benefit gift config:", productId, error);
          if (host.isConnected) host.innerHTML = "";
        }
      })();
    };

    const listEl = document.createElement("div");
    listEl.className = "shop-favorites-list shop-checkout-benefit-products-list shop-checkout-benefit-claim-list";
    shell.appendChild(listEl);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn btn-primary shop-checkout-benefit-claim-confirm shop-checkout-benefit-claim-confirm--footer";
    confirmBtn.textContent = "Забрать";
    if (frame.footerEl) {
      frame.footerEl.appendChild(confirmBtn);
    } else {
      const actions = document.createElement("div");
      actions.className = "shop-checkout-benefit-claim-actions";
      actions.appendChild(confirmBtn);
      shell.appendChild(actions);
    }

    const submitGiftClaimSelection = async () => {
      const selectedRewardItems = [];
      items.forEach((item) => {
        const qty = Math.max(0, Number(item?.selected_qty || 0));
        for (let itemIndex = 0; itemIndex < qty; itemIndex += 1) {
          selectedRewardItems.push({
            selection_key: String(item?.selection_key || "").trim(),
            product_id: Number(item?.product_id || item?.id || 0) || null,
            product_config: item?.product_config && typeof item.product_config === "object"
              ? deepCloneJson(item.product_config, null)
              : null,
          });
        }
      });
      if (!selectedRewardItems.length) return;
      try {
        confirmBtn.disabled = true;
        await claimRightOrderBenefitProgress(id, progressItem, selectedRewardItems);
      } catch (error) {
        showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
      } finally {
        confirmBtn.disabled = false;
      }
    };

    const syncSummary = () => {
      const totalSelected = getTotalSelected();
      info.textContent = totalSelected > 0
        ? `Выбрано ${totalSelected} из ${selectionLimit}`
        : `Можно забрать ${selectionLimit} ${formatGiftClaimCount(selectionLimit)}`;
      confirmBtn.disabled = !(totalSelected > 0);
      syncFns.forEach((sync) => sync());
    };

    const renderGiftClaimCards = () => {
      syncFns = [];
      listEl.innerHTML = "";
      items.forEach((item) => {
        const control = buildRightOrderBenefitRewardClaimProductCard(item, {
          getSelectionState,
          mountConfig: mountGiftClaimConfig,
          useCollapsedConfig: isMobileGiftClaim,
          getExpandedSelectionKey,
          onToggleExpand: (targetItem) => {
            const nextSelectionKey = String(targetItem?.selection_key || "").trim();
            if (!nextSelectionKey) return;
            setExpandedSelectionKey(getExpandedSelectionKey() === nextSelectionKey ? "" : nextSelectionKey);
            renderGiftClaimCards();
            syncSummary();
          },
          onChange: (targetItem, delta) => {
            const targetSelectionKey = String(targetItem?.selection_key || "").trim();
            if (!targetSelectionKey || !Number(delta)) return;
            const targetItemRef = items.find((entry) => String(entry?.selection_key || "").trim() === targetSelectionKey);
            if (!targetItemRef) return;
            const currentCount = Math.max(0, Number(targetItemRef?.selected_qty || 0));
            const nextState = getSelectionState(targetItemRef);
            if (delta < 0) {
              if (!nextState.canDecrement) return;
              targetItemRef.selected_qty = Math.max(0, currentCount - 1);
            } else {
              if (!nextState.canIncrement) return;
              targetItemRef.selected_qty = currentCount + 1;
            }
            syncSummary();
          },
        });
        syncFns.push(control.sync);
        listEl.appendChild(control.card);
      });
      syncFns.forEach((sync) => sync());
    };

    renderGiftClaimCards();
    syncSummary();
    confirmBtn.addEventListener("click", () => {
      void submitGiftClaimSelection();
    });
  }

  function renderRightBenefitsMainScreen(order) {
    const orderId = Number(order?.id || 0);
    window.AdminBenefitsModal?.show({
      title: "Выгоды",
      showBack: false,
      showModeToggle: true,
      mode: getActiveRightOrderBenefitsMode(),
      onClose: closeRightBenefitsOverlay,
      onModeChange: (nextMode) => {
        void switchRightBenefitsOverlayMode(nextMode);
      },
    });
    const { body } = getRightBenefitsOverlayElements();
    if (!body) return;
    body.innerHTML = "";

    const frame = createRightOrderBenefitsFrame({ hasFooter: true });
    if (!frame?.root || !frame.scrollEl) return;
    body.appendChild(frame.root);
    rememberRightBenefitsMainView(orderId, getActiveRightOrderBenefitsMode(), frame);

    const shell = document.createElement("div");
    shell.className = "shop-checkout-benefits-sheet";
    frame.scrollEl.appendChild(shell);

    const hint = document.createElement("div");
    hint.className = "shop-checkout-benefits-hint";
    hint.textContent = "Здесь можно выбрать одну скидку и один промокод. Если у обоих включено совмещение, они применяются вместе.";
    shell.appendChild(hint);

    const currentMode = getActiveRightOrderBenefitsMode();
    const previewData = getRightOrderBenefitsPreviewSnapshot(order, {
      mode: currentMode,
      allowStale: true,
      allowClientCache: true,
    });
    const activePromoCode = resolveRightOrderBenefitsActivePromoCode(previewData, order);
    if (frame.footerEl) {
      const promoEntry = window.AdminBenefitsModal?.createPromoEntry({
        value: state.benefitsModal.promoInputValue || activePromoCode,
        activeValue: activePromoCode,
        normalizeValue: (value) => normalizeRightOrderBenefitsPromoCode(value || ""),
        inputName: "newOrderBenefitsPromoCode",
        onInput: (value) => {
          state.benefitsModal.promoInputValue = normalizeRightOrderBenefitsPromoCode(value || "");
        },
        onApply: async (value) => {
          await applyRightOrderBenefitsManualPromo(orderId, value);
        },
        onError: (error) => {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        },
      });
      if (promoEntry?.root) {
        frame.footerEl.appendChild(promoEntry.root);
      }
    }
    const isLoading = state.rightBenefitsLoadingByOrder.has(getRightOrderBenefitsCacheSlot(orderId, currentMode));
    if (!previewData) {
      const loading = document.createElement("div");
      loading.className = "shop-checkout-benefits-loading";
      loading.textContent = isLoading ? "Загрузка выгод..." : "Загружаем выгоды...";
      shell.appendChild(loading);
      if (!isLoading) {
        void loadRightOrderBenefitsPreview(orderId, {
          force: false,
          render: true,
          mode: currentMode,
        }).catch((error) => {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        });
      }
      return;
    }

    const data = getRightOrderBenefitsRenderData(previewData);

    const discountSection = createRightOrderBenefitsSection("Скидки", "Для этого заказа доступных скидок нет.");
    const promoSection = createRightOrderBenefitsSection("Промокоды", "Для этого заказа доступных промокодов нет.");
    const giftSection = createRightOrderBenefitsSection("Подарки", "Здесь появятся доступные подарки.", { horizontal: true });
    const progressSection = createRightOrderBenefitsSection("Накопления", "Здесь появится прогресс накопительных акций.");
    const completedSection = createRightOrderBenefitsSection("Завершенные", "Здесь появятся завершённые выгоды.");

    shell.appendChild(discountSection.section);
    shell.appendChild(promoSection.section);
    shell.appendChild(giftSection.section);
    shell.appendChild(progressSection.section);
    shell.appendChild(completedSection.section);

    setRightOrderBenefitsSectionItems(discountSection, data.discounts, (item) => renderRightOrderBenefitDiscountCard(item, {
      onOpenDetails: (discountItem) => {
        openRightOrderBenefitDetailScreen(orderId, {
          kind: "discount",
          item: discountItem,
        });
      },
      onToggle: async (discountItem) => {
        try {
          await toggleRightOrderBenefitDiscount(orderId, discountItem);
        } catch (error) {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        }
      },
    }));
    setRightOrderBenefitsSectionItems(promoSection, data.promo_codes, (item) => renderRightOrderBenefitPromoCard(item, {
      onOpenDetails: (promoItem) => {
        openRightOrderBenefitDetailScreen(orderId, {
          kind: "promo",
          item: promoItem,
        });
      },
      onToggle: async (promoItem) => {
        try {
          await toggleRightOrderBenefitPromo(orderId, promoItem);
        } catch (error) {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        }
      },
    }));
    setRightOrderBenefitsSectionItems(giftSection, data.gifts, (item) => renderRightOrderBenefitGiftCard(item, {
      onOpen: (giftReward) => {
        openRightOrderBenefitDetailScreen(orderId, {
          kind: "gift",
          item: giftReward,
        });
      },
      onReceive: async (giftReward) => {
        try {
          await receiveRightOrderBenefitGift(orderId, giftReward);
        } catch (error) {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        }
      },
    }));
    bindRightOrderHorizontalTrack(giftSection.list);
    bindRightOrderWheelTrack(giftSection.list);
    setRightOrderBenefitsSectionItems(progressSection, data.progress, (item) => renderRightOrderBenefitProgressCard(item, {
      onOpenDetails: (progressReward) => {
        openRightOrderBenefitDetailScreen(orderId, {
          kind: "progress",
          item: progressReward,
        });
      },
      onClaim: async (progressReward) => {
        try {
          if (String(progressReward?.claim_mode || "").trim().toLowerCase() === "gift_sheet") {
            await openRightOrderBenefitGiftClaimScreen(orderId, progressReward);
            return;
          }
          await claimRightOrderBenefitProgress(orderId, progressReward);
        } catch (error) {
          showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
        }
      },
    }));
    setRightOrderBenefitsSectionItems(completedSection, data.completed, (item) => renderRightOrderBenefitDisplayCard(item, {
      onOpenDetails: (completedItem) => {
        openRightOrderBenefitDetailScreen(orderId, {
          kind: "completed",
          item: completedItem,
        });
      },
    }));
  }

  function renderRightBenefitsOverlay(orderId) {
    const id = Number(orderId || state.benefitsModal.orderId || 0);
    if (!(id > 0)) return;
    ensureRightBenefitsOverlay();
    const { backdrop } = getRightBenefitsOverlayElements();
    if (!backdrop) return;
    backdrop.classList.remove("hidden");
    state.benefitsModal.orderId = id;
    if (String(state.benefitsModal.screen || "main") === "gift-claim") {
      renderRightOrderBenefitGiftClaimScreen(id);
      return;
    }
    if (String(state.benefitsModal.screen || "main") === "detail") {
      renderRightOrderBenefitDetailScreen(id);
      return;
    }
    if (restoreRightBenefitsMainView(id)) {
      return;
    }
    const orderIndex = getRightOrderIndexById(id);
    if (orderIndex < 0) {
      closeRightBenefitsOverlay();
      return;
    }
    renderRightBenefitsMainScreen(state.rightOrders[orderIndex] || {});
  }

  async function openRightBenefitsOverlay(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    const index = getRightOrderIndexById(id);
    if (index < 0) return;
    const order = state.rightOrders[index] || {};
    const form = order.form && typeof order.form === "object" ? order.form : {};
    const customerId = Number(await ensureRightOrderBenefitsCustomerId(id) || 0);
    const cachedMainView = state.benefitsModal.mainView && Number(state.benefitsModal.mainView.orderId || 0) === id
      ? state.benefitsModal.mainView
      : null;
    const initialMode = cachedMainView
      ? normalizeRightOrderBenefitsMode(cachedMainView.mode || "customer")
      : (customerId > 0 ? "customer" : "all");
    state.benefitsModal.orderId = id;
    state.benefitsModal.mode = initialMode;
    state.benefitsModal.screen = "main";
    state.benefitsModal.title = "Выгоды";
    state.benefitsModal.payload = null;
    state.benefitsModal.promoInputValue = normalizeRightOrderBenefitsPromoCode(form.promo_code);
    if (restoreRightBenefitsMainView(id)) {
      return;
    }
    renderRightBenefitsOverlay(id);
    const prefetchSecondaryPromise = prefetchRightOrderBenefitsModes(id, {
      force: false,
      skipMode: initialMode,
    });
    try {
      await loadRightOrderBenefitsPreview(id, {
        force: false,
        render: true,
        mode: initialMode,
      });
      void prefetchSecondaryPromise;
    } catch (error) {
      showNewOrderAlert(getRightOrderBenefitsActionErrorMessage(error));
    }
  }

  let rightAddressMapModeEnabled = null;
  let rightAddressMapModePromise = null;
  const rightAddressLookupState = {
    orderId: 0,
    requestSeq: 0,
    debounceTimer: 0,
    closeTimer: 0,
    items: [],
    activeIndex: -1,
    open: false,
    status: "",
    statusMode: "idle",
    selectedStreet: null,
    selectedAddress: null,
    addressRef: "",
    selectedObjectType: "",
    resolvedCitySourceKey: "",
    contextLocality: "",
    lat: null,
    lng: null,
    deliveryZoneId: null,
    deliveryStoreId: null,
  };

  function getRightAddressOverlayElements() {
    const backdrop = document.getElementById("newOrderRightAddressOverlay");
    const listWrap = document.getElementById("newOrderRightAddressListWrap");
    const list = document.getElementById("newOrderRightAddressList");
    const newBtn = document.getElementById("newOrderRightAddressNewBtn");
    const formBody = document.getElementById("newOrderRightAddressBody");
    const city = document.getElementById("newOrderRightAddressCity");
    const lookupWrap = document.getElementById("newOrderRightAddressLookupWrap");
    const lookup = document.getElementById("newOrderRightAddressLookup");
    const lookupPopover = document.getElementById("newOrderRightAddressLookupPopover");
    const lookupStatus = document.getElementById("newOrderRightAddressLookupStatus");
    const lookupResults = document.getElementById("newOrderRightAddressLookupResults");
    const streetWrap = document.getElementById("newOrderRightAddressStreetWrap");
    const street = document.getElementById("newOrderRightAddressStreet");
    const houseWrap = document.getElementById("newOrderRightAddressHouseWrap");
    const house = document.getElementById("newOrderRightAddressHouse");
    const detailsRow = document.getElementById("newOrderRightAddressDetailsRow");
    const entrance = document.getElementById("newOrderRightAddressEntrance");
    const floor = document.getElementById("newOrderRightAddressFloor");
    const apartment = document.getElementById("newOrderRightAddressApartment");
    const comment = document.getElementById("newOrderRightAddressComment");
    const saveBtn = document.getElementById("newOrderRightAddressSaveBtn");
    const cancelBtn = document.getElementById("newOrderRightAddressCancelBtn");
    return {
      backdrop,
      listWrap,
      list,
      newBtn,
      formBody,
      city,
      lookupWrap,
      lookup,
      lookupPopover,
      lookupStatus,
      lookupResults,
      streetWrap,
      street,
      houseWrap,
      house,
      detailsRow,
      entrance,
      floor,
      apartment,
      comment,
      saveBtn,
      cancelBtn,
    };
  }

  function syncRightAddressMapLayout(enabled) {
    const { formBody, streetWrap, houseWrap } = getRightAddressOverlayElements();
    const isMapMode = Boolean(enabled);
    if (formBody) formBody.classList.toggle("is-map-mode", isMapMode);
    if (streetWrap) streetWrap.classList.toggle("hidden", isMapMode);
    if (houseWrap) houseWrap.classList.toggle("hidden", isMapMode);
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
        <div class="new-order-option-sheet-list no-scrollbar new-order-right-address-body" id="newOrderRightAddressBody">
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
          <label class="new-order-right-form-field hidden" id="newOrderRightAddressLookupWrap">
            <span class="new-order-right-form-label">Адрес</span>
            <div class="shop-address-lookup">
              <input id="newOrderRightAddressLookup" class="control" type="text" autocomplete="off" />
              <div class="shop-address-lookup-popover hidden" id="newOrderRightAddressLookupPopover" role="dialog" aria-label="Подсказки адреса">
                <div class="shop-address-lookup-status" id="newOrderRightAddressLookupStatus"></div>
                <div class="shop-address-lookup-results" id="newOrderRightAddressLookupResults"></div>
              </div>
            </div>
          </label>
          <label class="new-order-right-form-field" id="newOrderRightAddressStreetWrap">
            <span class="new-order-right-form-label">Улица</span>
            <input id="newOrderRightAddressStreet" class="control" type="text" autocomplete="off" />
          </label>
          <div class="new-order-right-form-row is-address-map-details" id="newOrderRightAddressDetailsRow">
            <label class="new-order-right-form-field" id="newOrderRightAddressHouseWrap">
              <span class="new-order-right-form-label">Дом</span>
              <input id="newOrderRightAddressHouse" class="control" type="text" autocomplete="off" />
            </label>
            <label class="new-order-right-form-field">
              <span class="new-order-right-form-label">Подъезд</span>
              <input id="newOrderRightAddressEntrance" class="control" type="text" autocomplete="off" />
            </label>
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

  function normalizeRightAddressCoordinate(value, axis = "lat") {
    const numeric = Number(value);
    const limit = axis === "lat" ? 90 : 180;
    if (!Number.isFinite(numeric) || numeric < -limit || numeric > limit) return null;
    return Number(numeric.toFixed(7));
  }

  function normalizeRightAddressText(value) {
    return repairUtf8Mojibake(String(value || "").replace(/\s+/g, " ").trim());
  }

  function normalizeRightAddressKey(value) {
    return normalizeRightAddressText(value).toLowerCase();
  }

  const RIGHT_ADDRESS_HOUSE_TOKEN_PATTERN = "\\d+[\\dA-Za-zА-Яа-яЁё]*(?:[/-]\\d+[\\dA-Za-zА-Яа-яЁё]*)*";

  function normalizeRightAddressLookupText(value) {
    return normalizeRightAddressText(value)
      .replace(/\s*,\s*/g, ", ")
      .replace(/,+\s*$/g, "")
      .trim();
  }

  function extractRightAddressHouseFromLookupSegment(segment) {
    const normalized = normalizeRightAddressLookupText(segment);
    if (!normalized) return "";
    const directMatch = normalized.match(new RegExp(`^(?:д(?:ом)?\\.?\\s*)?(${RIGHT_ADDRESS_HOUSE_TOKEN_PATTERN})$`, "i"));
    if (directMatch && directMatch[1]) return normalizeRightAddressText(directMatch[1]);
    const tailMatch = normalized.match(new RegExp(`(?:^|\\s)(?:д(?:ом)?\\.?\\s*)?(${RIGHT_ADDRESS_HOUSE_TOKEN_PATTERN})$`, "i"));
    if (tailMatch && tailMatch[1]) return normalizeRightAddressText(tailMatch[1]);
    return "";
  }

  function parseRightAddressStreetHouseFromLookup(value) {
    const normalized = normalizeRightAddressLookupText(value);
    if (!normalized) return { street: "", house: "" };

    const commaPos = normalized.lastIndexOf(",");
    if (commaPos >= 0) {
      const head = normalizeRightAddressLookupText(normalized.slice(0, commaPos)).replace(/[,\s]+$/g, "");
      const tail = normalizeRightAddressLookupText(normalized.slice(commaPos + 1));
      const houseFromTail = extractRightAddressHouseFromLookupSegment(tail);
      if (houseFromTail) {
        return { street: head, house: houseFromTail };
      }
    }

    const fallbackMatch = normalized.match(
      new RegExp(`^(.*?)(?:,|\\s)+(?:д(?:ом)?\\.?\\s*)?(${RIGHT_ADDRESS_HOUSE_TOKEN_PATTERN})$`, "i")
    );
    if (!fallbackMatch) return { street: "", house: "" };
    return {
      street: normalizeRightAddressLookupText(fallbackMatch[1]).replace(/[,\s]+$/g, ""),
      house: normalizeRightAddressText(fallbackMatch[2]),
    };
  }

  function buildRightAddressLookupText(cityValue, contextLocalityValue, streetValue, houseValue, fallbackValue = "") {
    const city = normalizeRightAddressText(cityValue);
    const contextLocality = normalizeRightAddressText(contextLocalityValue);
    const street = normalizeRightAddressText(streetValue);
    const house = normalizeRightAddressText(houseValue);
    const fallback = normalizeRightAddressText(fallbackValue);
    const base = [street, house].filter(Boolean).join(", ") || fallback;
    if (!base) return "";
    if (!contextLocality) return base;
    if (normalizeRightAddressKey(contextLocality) === normalizeRightAddressKey(city)) return base;
    if (normalizeRightAddressKey(base).startsWith(normalizeRightAddressKey(contextLocality))) return base;
    return `${contextLocality}, ${base}`;
  }

  function createBlankRightAddressDraft(overrides = {}) {
    return {
      city: getDefaultRightAddressCity(),
      street: "",
      house: "",
      entrance: "",
      floor: "",
      apartment: "",
      comment: "",
      address_ref: null,
      selected_object_type: null,
      resolved_city_source_key: null,
      address_context_locality: null,
      address_normalized_display: null,
      lat: null,
      lng: null,
      delivery_zone_id: null,
      delivery_store_id: null,
      ...overrides,
    };
  }

  function normalizeRightAddressDraft(source, fallbackCity = "") {
    const item = source && typeof source === "object" ? source : {};
    const base = createBlankRightAddressDraft({
      city: fallbackCity || getDefaultRightAddressCity(),
    });
    return {
      ...base,
      city: normalizeRightAddressText(item.city || base.city),
      street: normalizeRightAddressText(item.street),
      house: normalizeRightAddressText(item.house),
      entrance: normalizeRightAddressText(item.entrance),
      floor: normalizeRightAddressText(item.floor),
      apartment: normalizeRightAddressText(item.apartment),
      comment: normalizeRightAddressText(item.comment),
      address_ref: normalizeRightAddressText(item.address_ref) || null,
      selected_object_type: normalizeRightAddressText(item.selected_object_type) || null,
      resolved_city_source_key: normalizeRightAddressText(item.resolved_city_source_key) || null,
      address_context_locality: normalizeRightAddressText(item.address_context_locality) || null,
      address_normalized_display: normalizeRightAddressText(item.address_normalized_display) || null,
      lat: normalizeRightAddressCoordinate(item.lat, "lat"),
      lng: normalizeRightAddressCoordinate(item.lng, "lng"),
      delivery_zone_id: Number.isFinite(Number(item.delivery_zone_id)) && Number(item.delivery_zone_id) > 0
        ? Number(item.delivery_zone_id)
        : null,
      delivery_store_id: Number.isFinite(Number(item.delivery_store_id)) && Number(item.delivery_store_id) > 0
        ? Number(item.delivery_store_id)
        : null,
    };
  }

  function normalizeClientAddressRow(row) {
    const item = row && typeof row === "object" ? row : {};
    const text = (value) => normalizeRightAddressText(value);
    const normalizeInt = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : null;
    };
    return {
      id: Number(item.id || 0),
      city: text(item.city),
      street: text(item.street),
      house: text(item.house),
      entrance: text(item.entrance),
      floor: text(item.floor),
      apartment: text(item.apartment),
      comment: text(item.comment),
      address_ref: text(item.address_ref),
      selected_object_type: text(item.selected_object_type),
      resolved_city_source_key: text(item.resolved_city_source_key),
      address_context_locality: text(item.address_context_locality),
      address_normalized_display: text(item.address_normalized_display),
      lat: normalizeRightAddressCoordinate(item.lat, "lat"),
      lng: normalizeRightAddressCoordinate(item.lng, "lng"),
      delivery_zone_id: normalizeInt(item.delivery_zone_id),
      delivery_store_id: normalizeInt(item.delivery_store_id),
      is_default: Number(item.is_default || 0),
    };
  }

  function getAddressDraftFromClientAddress(row, fallbackCity = "") {
    return normalizeRightAddressDraft(normalizeClientAddressRow(row), fallbackCity);
  }

  function buildRightAddressLookupDisplay(draft) {
    const next = normalizeRightAddressDraft(draft);
    if (next.selected_object_type === "street") {
      const streetValue = buildRightAddressLookupText(
        next.city,
        next.address_context_locality,
        next.street,
        "",
        next.address_normalized_display
      );
      return streetValue ? `${streetValue}, ` : "";
    }
    return buildRightAddressLookupText(
      next.city,
      next.address_context_locality,
      next.street,
      next.house,
      next.address_normalized_display
    );
  }

  function formatClientAddressShort(row, forcedCity = "") {
    const a = normalizeRightAddressDraft(normalizeClientAddressRow(row), forcedCity);
    const city = normalizeRightAddressText(forcedCity || a.city || getDefaultRightAddressCity());
    const mainAddress = buildRightAddressLookupText(city, a.address_context_locality, a.street, a.house, a.address_normalized_display);
    const parts = [
      city,
      mainAddress,
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
      const selectedId = Number(state.rightAddressSelectedIdByOrder.get(id) || 0);
      if (selectedId > 0 && !state.rightAddressDraftByOrder.has(id)) {
        const selectedRow = list.find((row) => Number(row?.id || 0) === selectedId) || null;
        if (selectedRow) {
          state.rightAddressDraftByOrder.set(id, getAddressDraftFromClientAddress(selectedRow, getDefaultRightAddressCity()));
        }
      }
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

  function initRightAddressCitySelect(wrapEl, selectedValue, onChange = null) {
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
    valueEl.textContent = current || "—";
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
        if (typeof onChange === "function") onChange(c);
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

  async function ensureRightAddressMapMode(forceReload = false) {
    if (!forceReload && rightAddressMapModeEnabled !== null) return rightAddressMapModeEnabled;
    if (!forceReload && rightAddressMapModePromise) return rightAddressMapModePromise;
    rightAddressMapModePromise = (async () => {
      try {
        const json = await apiJson("/api/admin/tenant/map-provider-config");
        rightAddressMapModeEnabled = parseRightAddressBooleanFlag(json?.data?.store_address_map_enabled);
      } catch {
        rightAddressMapModeEnabled = false;
      } finally {
        rightAddressMapModePromise = null;
      }
      return rightAddressMapModeEnabled;
    })();
    return rightAddressMapModePromise;
  }

  function parseRightAddressBooleanFlag(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) && value !== 0;
    const text = normalizeRightAddressText(value).toLowerCase();
    if (!text) return false;
    if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
    if (text === "0" || text === "false" || text === "no" || text === "off" || text === "null" || text === "undefined") {
      return false;
    }
    return Boolean(value);
  }

  function resetRightAddressLookupState() {
    if (rightAddressLookupState.debounceTimer) clearTimeout(rightAddressLookupState.debounceTimer);
    if (rightAddressLookupState.closeTimer) clearTimeout(rightAddressLookupState.closeTimer);
    rightAddressLookupState.requestSeq = 0;
    rightAddressLookupState.items = [];
    rightAddressLookupState.activeIndex = -1;
    rightAddressLookupState.open = false;
    rightAddressLookupState.status = "";
    rightAddressLookupState.statusMode = "idle";
    rightAddressLookupState.selectedStreet = null;
    rightAddressLookupState.selectedAddress = null;
    rightAddressLookupState.addressRef = "";
    rightAddressLookupState.selectedObjectType = "";
    rightAddressLookupState.resolvedCitySourceKey = "";
    rightAddressLookupState.contextLocality = "";
    rightAddressLookupState.lat = null;
    rightAddressLookupState.lng = null;
    rightAddressLookupState.deliveryZoneId = null;
    rightAddressLookupState.deliveryStoreId = null;
  }

  function createRightAddressSuggestionItem(source, fallbackType = "address") {
    const item = source && typeof source === "object" ? source : {};
    const objectType = normalizeRightAddressText(item.object_type || fallbackType) || fallbackType;
    return {
      stage: normalizeRightAddressText(item.stage || (objectType === "address" ? "house" : "address")) || "address",
      object_type: objectType,
      source_key: normalizeRightAddressText(item.source_key),
      label: normalizeRightAddressText(item.label || item.value || item.full_address || item.street_name),
      value: normalizeRightAddressText(item.value || item.label || item.full_address || item.street_name),
      full_address: normalizeRightAddressText(item.full_address || item.value || item.label),
      city_name: normalizeRightAddressText(item.city_name),
      context_locality: normalizeRightAddressText(item.context_locality),
      street_name: normalizeRightAddressText(item.street_name || item.label || item.value),
      house_number: normalizeRightAddressText(item.house_number),
      lat: normalizeRightAddressCoordinate(item.lat, "lat"),
      lng: normalizeRightAddressCoordinate(item.lng, "lng"),
    };
  }

  function getRightAddressItemType(item) {
    return normalizeRightAddressText(item?.object_type || item?.type || item?.stage || "").toLowerCase();
  }

  function getRightAddressStreetValue(item) {
    return normalizeRightAddressText(item?.street_name || item?.value || item?.label);
  }

  function getRightAddressHouseValue(item) {
    return normalizeRightAddressText(item?.house_number);
  }

  function closeRightAddressLookupPopover() {
    const { lookupPopover } = getRightAddressOverlayElements();
    if (lookupPopover) lookupPopover.classList.add("hidden");
    rightAddressLookupState.open = false;
  }

  function getRightAddressSuggestionTitle(item, cityValue = "") {
    const type = getRightAddressItemType(item);
    if (type === "street") {
      return buildRightAddressLookupText(
        cityValue,
        item?.context_locality || item?.city_name,
        getRightAddressStreetValue(item),
        "",
        item?.full_address || item?.value || item?.label
      ) || getRightAddressStreetValue(item);
    }
    if (type === "context-locality") {
      return normalizeRightAddressText(item?.value || item?.label || item?.context_locality);
    }
    return normalizeRightAddressText(item?.full_address || item?.value || item?.label);
  }

  function getRightAddressSuggestionMeta(item, cityValue = "") {
    const type = getRightAddressItemType(item);
    const locality = normalizeRightAddressText(item?.context_locality || item?.city_name);
    if (!locality) return "";
    if (type === "context-locality") return `Поиск: ${cityValue || locality}`;
    return locality;
  }

  function renderRightAddressLookupPopover() {
    const { city, lookupPopover, lookupStatus, lookupResults } = getRightAddressOverlayElements();
    if (!lookupPopover || !lookupStatus || !lookupResults) return;
    lookupStatus.textContent = rightAddressLookupState.status || "";
    lookupStatus.classList.toggle("hidden", !rightAddressLookupState.status);
    lookupStatus.classList.toggle("is-error", rightAddressLookupState.statusMode === "error");
    lookupStatus.classList.toggle("is-loading", rightAddressLookupState.statusMode === "loading");
    lookupResults.innerHTML = "";
    const cityValue = normalizeRightAddressText(city?.dataset?.value || "");
    const items = Array.isArray(rightAddressLookupState.items) ? rightAddressLookupState.items : [];
    items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shop-address-lookup-item" + (index === rightAddressLookupState.activeIndex ? " is-active" : "");
      button.addEventListener("mousedown", (event) => event.preventDefault());
      button.addEventListener("click", () => applyRightAddressSuggestion(item));
      const title = document.createElement("div");
      title.className = "shop-address-lookup-item-title";
      title.textContent = getRightAddressSuggestionTitle(item, cityValue);
      button.appendChild(title);
      const metaText = getRightAddressSuggestionMeta(item, cityValue);
      if (metaText) {
        const meta = document.createElement("div");
        meta.className = "shop-address-lookup-item-meta";
        meta.textContent = metaText;
        button.appendChild(meta);
      }
      lookupResults.appendChild(button);
    });
    const show = Boolean(rightAddressLookupState.status || items.length);
    lookupPopover.classList.toggle("hidden", !show);
    rightAddressLookupState.open = show;
  }

  function getRightAddressLookupContinuation(query) {
    const selectedStreet = rightAddressLookupState.selectedStreet;
    if (!selectedStreet || !selectedStreet.source_key) return { preserve: false, housePart: "" };
    const normalizedQuery = normalizeRightAddressText(query);
    const streetValue = normalizeRightAddressText(getRightAddressStreetValue(selectedStreet));
    if (!normalizedQuery || !streetValue) return { preserve: false, housePart: "" };
    const streetIndex = normalizeRightAddressKey(normalizedQuery).lastIndexOf(normalizeRightAddressKey(streetValue));
    if (streetIndex < 0) return { preserve: false, housePart: "" };
    return {
      preserve: true,
      housePart: normalizedQuery.slice(streetIndex + streetValue.length).replace(/^[,\s]+/, "").trim(),
    };
  }

  function applyRightAddressLookupManualState(value) {
    const nextValue = normalizeRightAddressText(value);
    if (!nextValue) {
      rightAddressLookupState.selectedStreet = null;
      rightAddressLookupState.selectedAddress = null;
      rightAddressLookupState.addressRef = "";
      rightAddressLookupState.selectedObjectType = "";
      rightAddressLookupState.contextLocality = "";
      rightAddressLookupState.lat = null;
      rightAddressLookupState.lng = null;
      rightAddressLookupState.deliveryZoneId = null;
      rightAddressLookupState.deliveryStoreId = null;
      return;
    }
    const selectedStreet = rightAddressLookupState.selectedStreet;
    if (!selectedStreet) {
      rightAddressLookupState.selectedAddress = null;
      rightAddressLookupState.addressRef = "";
      rightAddressLookupState.selectedObjectType = "";
      rightAddressLookupState.lat = null;
      rightAddressLookupState.lng = null;
      rightAddressLookupState.deliveryZoneId = null;
      rightAddressLookupState.deliveryStoreId = null;
      return;
    }
    const streetValue = normalizeRightAddressText(getRightAddressStreetValue(selectedStreet));
    if (!streetValue || normalizeRightAddressKey(nextValue).indexOf(normalizeRightAddressKey(streetValue)) < 0) {
      rightAddressLookupState.selectedStreet = null;
      rightAddressLookupState.selectedAddress = null;
      rightAddressLookupState.addressRef = "";
      rightAddressLookupState.selectedObjectType = "";
      rightAddressLookupState.lat = null;
      rightAddressLookupState.lng = null;
      rightAddressLookupState.deliveryZoneId = null;
      rightAddressLookupState.deliveryStoreId = null;
      return;
    }
    if (rightAddressLookupState.selectedAddress) {
      const selectedHouse = normalizeRightAddressText(getRightAddressHouseValue(rightAddressLookupState.selectedAddress));
      const continuation = getRightAddressLookupContinuation(nextValue);
      if (!selectedHouse || normalizeRightAddressKey(continuation.housePart) !== normalizeRightAddressKey(selectedHouse)) {
        rightAddressLookupState.selectedAddress = null;
        rightAddressLookupState.addressRef = rightAddressLookupState.selectedStreet?.source_key || "";
        rightAddressLookupState.selectedObjectType = rightAddressLookupState.selectedStreet ? "street" : "";
        rightAddressLookupState.lat = null;
        rightAddressLookupState.lng = null;
        rightAddressLookupState.deliveryZoneId = null;
        rightAddressLookupState.deliveryStoreId = null;
      }
    }
  }

  async function searchRightAddressSuggestions(query, requestId) {
    const { city } = getRightAddressOverlayElements();
    const cityValue = normalizeRightAddressText(city?.dataset?.value || "");
    const normalizedQuery = normalizeRightAddressText(query);
    if (!cityValue || !normalizedQuery) {
      rightAddressLookupState.items = [];
      rightAddressLookupState.activeIndex = -1;
      rightAddressLookupState.status = "";
      renderRightAddressLookupPopover();
      closeRightAddressLookupPopover();
      return;
    }

    const continuation = getRightAddressLookupContinuation(normalizedQuery);
    const useHouseStage = Boolean(continuation.preserve && continuation.housePart && rightAddressLookupState.selectedStreet?.source_key);
    const params = new URLSearchParams({
      stage: useHouseStage ? "house" : "address",
      q: useHouseStage ? continuation.housePart : normalizedQuery,
      city: cityValue,
    });
    if (rightAddressLookupState.resolvedCitySourceKey) {
      params.set("city_source_key", rightAddressLookupState.resolvedCitySourceKey);
    }
    if (useHouseStage) {
      params.set("selected_source_key", rightAddressLookupState.selectedStreet.source_key);
    } else if (rightAddressLookupState.selectedObjectType === "context-locality" && rightAddressLookupState.addressRef) {
      params.set("selected_source_key", rightAddressLookupState.addressRef);
    }

    rightAddressLookupState.status = `Поиск: ${cityValue}`;
    rightAddressLookupState.statusMode = "loading";
    renderRightAddressLookupPopover();

    try {
      const json = await apiJson(`/api/admin/system/address-suggest-local?${params.toString()}`);
      if (requestId !== rightAddressLookupState.requestSeq) return;
      const sourceItems = Array.isArray(json?.data?.items) ? json.data.items : [];
      const items = sourceItems
        .map((item) => createRightAddressSuggestionItem(item))
        .filter((item) => {
          const type = getRightAddressItemType(item);
          if (useHouseStage) return type === "address";
          return type === "address" || type === "street" || type === "context-locality";
        });
      rightAddressLookupState.items = items;
      rightAddressLookupState.activeIndex = items.length ? 0 : -1;
      rightAddressLookupState.status = items.length ? `Поиск: ${json?.data?.scope_label || cityValue}` : "Ничего не найдено.";
      rightAddressLookupState.statusMode = items.length ? "ready" : "empty";
      renderRightAddressLookupPopover();
    } catch {
      if (requestId !== rightAddressLookupState.requestSeq) return;
      rightAddressLookupState.items = [];
      rightAddressLookupState.activeIndex = -1;
      rightAddressLookupState.status = "Не удалось получить подсказки адреса.";
      rightAddressLookupState.statusMode = "error";
      renderRightAddressLookupPopover();
    }
  }

  function scheduleRightAddressSuggestions() {
    const { lookup } = getRightAddressOverlayElements();
    if (!lookup || !rightAddressMapModeEnabled) {
      closeRightAddressLookupPopover();
      return;
    }
    applyRightAddressLookupManualState(lookup.value);
    if (rightAddressLookupState.debounceTimer) clearTimeout(rightAddressLookupState.debounceTimer);
    const requestId = ++rightAddressLookupState.requestSeq;
    rightAddressLookupState.debounceTimer = window.setTimeout(() => {
      rightAddressLookupState.debounceTimer = 0;
      void searchRightAddressSuggestions(lookup.value, requestId);
    }, 180);
  }

  function focusRightAddressLookupEnd() {
    const { lookup } = getRightAddressOverlayElements();
    if (!lookup) return;
    const nextLength = String(lookup.value || "").length;
    try {
      lookup.setSelectionRange(nextLength, nextLength);
    } catch {}
  }

  function applyRightAddressSuggestion(item) {
    const elements = getRightAddressOverlayElements();
    if (!elements.lookup || !elements.street || !elements.house) return;
    const selection = createRightAddressSuggestionItem(item);
    const type = getRightAddressItemType(selection);
    const cityValue = normalizeRightAddressText(elements.city?.dataset?.value || "");
    const contextLocality = normalizeRightAddressText(selection.context_locality || selection.city_name || cityValue);
    if (type === "context-locality") {
      rightAddressLookupState.selectedStreet = null;
      rightAddressLookupState.selectedAddress = null;
      rightAddressLookupState.addressRef = selection.source_key || "";
      rightAddressLookupState.selectedObjectType = "context-locality";
      rightAddressLookupState.contextLocality = contextLocality;
      rightAddressLookupState.lat = null;
      rightAddressLookupState.lng = null;
      rightAddressLookupState.deliveryZoneId = null;
      rightAddressLookupState.deliveryStoreId = null;
      elements.lookup.value = contextLocality ? `${contextLocality}, ` : "";
      elements.street.value = "";
      elements.house.value = "";
      closeRightAddressLookupPopover();
      elements.lookup.focus();
      focusRightAddressLookupEnd();
      return;
    }

    const streetValue = getRightAddressStreetValue(selection);
    const houseValue = getRightAddressHouseValue(selection);
    elements.street.value = streetValue;
    elements.house.value = type === "address" ? houseValue : "";
    rightAddressLookupState.contextLocality = contextLocality;
    rightAddressLookupState.selectedStreet = createRightAddressSuggestionItem({
      ...selection,
      object_type: "street",
      street_name: streetValue,
      house_number: "",
      full_address: buildRightAddressLookupText(cityValue, contextLocality, streetValue, "", streetValue),
    }, "street");
    rightAddressLookupState.selectedAddress = type === "address"
      ? createRightAddressSuggestionItem({
        ...selection,
        object_type: "address",
        street_name: streetValue,
        house_number: houseValue,
        full_address: buildRightAddressLookupText(cityValue, contextLocality, streetValue, houseValue, selection.full_address),
      }, "address")
      : null;
    rightAddressLookupState.addressRef = selection.source_key || "";
    rightAddressLookupState.selectedObjectType = type === "address" ? "address" : "street";
    rightAddressLookupState.lat = type === "address" ? selection.lat : null;
    rightAddressLookupState.lng = type === "address" ? selection.lng : null;
    rightAddressLookupState.deliveryZoneId = null;
    rightAddressLookupState.deliveryStoreId = null;
    elements.lookup.value = type === "address"
      ? buildRightAddressLookupText(cityValue, contextLocality, streetValue, houseValue, selection.full_address)
      : `${buildRightAddressLookupText(cityValue, contextLocality, streetValue, "", selection.full_address)}, `;
    closeRightAddressLookupPopover();
    elements.lookup.focus();
    focusRightAddressLookupEnd();
  }

  function hydrateRightAddressLookupStateFromDraft(draft) {
    const next = normalizeRightAddressDraft(draft);
    resetRightAddressLookupState();
    rightAddressLookupState.addressRef = next.address_ref || "";
    rightAddressLookupState.selectedObjectType = next.selected_object_type || "";
    rightAddressLookupState.resolvedCitySourceKey = next.resolved_city_source_key || "";
    rightAddressLookupState.contextLocality = next.address_context_locality || "";
    rightAddressLookupState.lat = next.lat;
    rightAddressLookupState.lng = next.lng;
    rightAddressLookupState.deliveryZoneId = next.delivery_zone_id;
    rightAddressLookupState.deliveryStoreId = next.delivery_store_id;
    if (next.street) {
      rightAddressLookupState.selectedStreet = createRightAddressSuggestionItem({
        source_key: next.selected_object_type === "street" ? next.address_ref : "",
        object_type: "street",
        city_name: next.city,
        context_locality: next.address_context_locality || next.city,
        street_name: next.street,
        full_address: buildRightAddressLookupText(next.city, next.address_context_locality, next.street, "", next.address_normalized_display),
      }, "street");
    }
    if (next.street && next.house && next.selected_object_type === "address") {
      rightAddressLookupState.selectedAddress = createRightAddressSuggestionItem({
        source_key: next.address_ref,
        object_type: "address",
        city_name: next.city,
        context_locality: next.address_context_locality || next.city,
        street_name: next.street,
        house_number: next.house,
        full_address: buildRightAddressLookupText(next.city, next.address_context_locality, next.street, next.house, next.address_normalized_display),
        lat: next.lat,
        lng: next.lng,
      }, "address");
    }
  }

  function closeRightAddressOverlay() {
    const { backdrop } = getRightAddressOverlayElements();
    if (!backdrop) return;
    closeRightAddressLookupPopover();
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
    const next = normalizeRightAddressDraft(parts);
    const city = normalizeRightAddressText(next.city);
    const entrance = normalizeRightAddressText(next.entrance);
    const floor = normalizeRightAddressText(next.floor);
    const apartment = normalizeRightAddressText(next.apartment);
    const comment = normalizeRightAddressText(next.comment);
    const addressLabel = buildRightAddressLookupText(
      city,
      next.address_context_locality,
      next.street,
      next.house,
      next.address_normalized_display
    );
    const head = [city ? `г. ${city}` : "", addressLabel].filter(Boolean).join(", ");
    const details = [entrance ? `под. ${entrance}` : "", floor ? `эт. ${floor}` : "", apartment ? `кв. ${apartment}` : ""].filter(Boolean).join(", ");
    return [head, details, comment].filter(Boolean).join(", ");
  }

  function fillRightAddressInputs(draft, orderId = 0) {
    const {
      city,
      lookupWrap,
      lookup,
      street,
      house,
      entrance,
      floor,
      apartment,
      comment,
    } = getRightAddressOverlayElements();
    if (!city || !street || !house || !entrance || !floor || !apartment || !comment) return;
    const next = normalizeRightAddressDraft(draft);
    initRightAddressCitySelect(city, next.city, () => {
      if (!rightAddressMapModeEnabled) return;
      resetRightAddressLookupState();
      if (lookup) lookup.value = "";
      street.value = "";
      house.value = "";
      closeRightAddressLookupPopover();
      if (orderId > 0) {
        state.rightAddressDraftByOrder.set(
          orderId,
          normalizeRightAddressDraft({ ...next, city: city.dataset.value || next.city }, city.dataset.value || next.city)
        );
      }
    });
    if (lookupWrap) lookupWrap.classList.toggle("hidden", !rightAddressMapModeEnabled);
    syncRightAddressMapLayout(rightAddressMapModeEnabled);
    hydrateRightAddressLookupStateFromDraft(next);
    if (lookup) lookup.value = rightAddressMapModeEnabled ? buildRightAddressLookupDisplay(next) : "";
    street.value = next.street;
    house.value = next.house;
    entrance.value = next.entrance;
    floor.value = next.floor;
    apartment.value = next.apartment;
    comment.value = next.comment;
  }

  function readRightAddressInputs() {
    const { city, lookup, street, house, entrance, floor, apartment, comment } = getRightAddressOverlayElements();
    const lookupDisplayValue = normalizeRightAddressLookupText(lookup?.value || "");
    const parsedLookup = rightAddressMapModeEnabled
      ? parseRightAddressStreetHouseFromLookup(lookupDisplayValue)
      : { street: "", house: "" };
    const selectedStreetValue = normalizeRightAddressText(
      getRightAddressStreetValue(rightAddressLookupState.selectedAddress || rightAddressLookupState.selectedStreet)
    );
    const selectedHouseValue = normalizeRightAddressText(getRightAddressHouseValue(rightAddressLookupState.selectedAddress));
    const streetValue = rightAddressMapModeEnabled
      ? (parsedLookup.street || selectedStreetValue)
      : normalizeRightAddressText(street?.value || "");
    const houseValue = rightAddressMapModeEnabled
      ? (parsedLookup.house || selectedHouseValue)
      : normalizeRightAddressText(house?.value || "");
    return normalizeRightAddressDraft({
      city: String(city?.dataset?.value || "").trim(),
      street: streetValue,
      house: houseValue,
      entrance: String(entrance?.value || "").trim(),
      floor: String(floor?.value || "").trim(),
      apartment: String(apartment?.value || "").trim(),
      comment: String(comment?.value || "").trim(),
      address_ref: rightAddressMapModeEnabled ? (rightAddressLookupState.addressRef || null) : null,
      selected_object_type: rightAddressMapModeEnabled ? (rightAddressLookupState.selectedObjectType || null) : null,
      resolved_city_source_key: rightAddressMapModeEnabled ? (rightAddressLookupState.resolvedCitySourceKey || null) : null,
      address_context_locality: rightAddressMapModeEnabled ? (rightAddressLookupState.contextLocality || null) : null,
      address_normalized_display: rightAddressMapModeEnabled ? (lookupDisplayValue || null) : null,
      lat: rightAddressMapModeEnabled ? rightAddressLookupState.lat : null,
      lng: rightAddressMapModeEnabled ? rightAddressLookupState.lng : null,
      delivery_zone_id: rightAddressMapModeEnabled ? rightAddressLookupState.deliveryZoneId : null,
      delivery_store_id: rightAddressMapModeEnabled ? rightAddressLookupState.deliveryStoreId : null,
    });
  }

  function showRightAddressLookupValidationError(message) {
    const { lookup } = getRightAddressOverlayElements();
    rightAddressLookupState.items = [];
    rightAddressLookupState.activeIndex = -1;
    rightAddressLookupState.status = normalizeRightAddressText(message);
    rightAddressLookupState.statusMode = "error";
    renderRightAddressLookupPopover();
    if (lookup) lookup.focus();
  }

  async function openRightAddressOverlay(orderId) {
    const id = Number(orderId || 0);
    if (!(id > 0)) return;
    ensureRightAddressOverlay();
    rightAddressMapModeEnabled = await ensureRightAddressMapMode(true);
    const { backdrop, newBtn, saveBtn, cancelBtn, lookup, street, house, lookupWrap } = getRightAddressOverlayElements();
    if (!backdrop || !saveBtn || !cancelBtn) return;
    rightAddressLookupState.orderId = id;

    await loadClientAddressesForRightOrder(id);
    const rows = Array.isArray(state.rightClientAddressesByOrder.get(id)) ? state.rightClientAddressesByOrder.get(id) : [];

    const existingSelectedId = Number(state.rightAddressSelectedIdByOrder.get(id) || 0);
    const defaultSelected = rows.find((a) => Number(a.is_default || 0) === 1) || rows[0] || null;
    const selectedRow = rows.find((a) => Number(a.id || 0) === existingSelectedId) || defaultSelected || null;
    const draftSource = state.rightAddressDraftByOrder.has(id)
      ? state.rightAddressDraftByOrder.get(id)
      : (selectedRow ? getAddressDraftFromClientAddress(selectedRow, getDefaultRightAddressCity()) : createBlankRightAddressDraft());
    const draft = normalizeRightAddressDraft(draftSource, getDefaultRightAddressCity());
    state.rightAddressSelectedIdByOrder.set(id, Number(selectedRow?.id || 0) || 0);
    state.rightAddressEditingIdByOrder.set(id, 0);
    fillRightAddressInputs(draft, id);
    renderRightAddressList(id);
    if (lookupWrap) lookupWrap.classList.toggle("hidden", !rightAddressMapModeEnabled);
    syncRightAddressMapLayout(rightAddressMapModeEnabled);

    if (lookup) {
      lookup.oninput = () => {
        scheduleRightAddressSuggestions();
      };
      lookup.onkeydown = (event) => {
        if (!rightAddressLookupState.open) {
          if (event.key === "ArrowDown") {
            scheduleRightAddressSuggestions();
            event.preventDefault();
          }
          return;
        }
        const items = Array.isArray(rightAddressLookupState.items) ? rightAddressLookupState.items : [];
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!items.length) return;
          rightAddressLookupState.activeIndex = Math.min(items.length - 1, rightAddressLookupState.activeIndex + 1);
          renderRightAddressLookupPopover();
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!items.length) return;
          rightAddressLookupState.activeIndex = Math.max(0, rightAddressLookupState.activeIndex - 1);
          renderRightAddressLookupPopover();
          return;
        }
        if (event.key === "Enter") {
          const active = items[rightAddressLookupState.activeIndex] || items[0] || null;
          if (active) {
            event.preventDefault();
            applyRightAddressSuggestion(active);
          }
          return;
        }
        if (event.key === "Escape") {
          closeRightAddressLookupPopover();
        }
      };
      lookup.onfocus = () => {
        if (!rightAddressMapModeEnabled) return;
        if (normalizeRightAddressText(lookup.value)) {
          scheduleRightAddressSuggestions();
        }
      };
      lookup.onblur = () => {
        if (rightAddressLookupState.closeTimer) clearTimeout(rightAddressLookupState.closeTimer);
        rightAddressLookupState.closeTimer = window.setTimeout(() => {
          closeRightAddressLookupPopover();
        }, 120);
      };
    }
    if (street) {
      street.oninput = () => {
        if (!rightAddressMapModeEnabled) return;
        const streetValue = normalizeRightAddressText(street.value);
        const selectedStreetValue = normalizeRightAddressText(getRightAddressStreetValue(rightAddressLookupState.selectedStreet));
        if (!selectedStreetValue || normalizeRightAddressKey(streetValue) !== normalizeRightAddressKey(selectedStreetValue)) {
          rightAddressLookupState.selectedStreet = null;
          rightAddressLookupState.selectedAddress = null;
          rightAddressLookupState.addressRef = "";
          rightAddressLookupState.selectedObjectType = "";
          rightAddressLookupState.lat = null;
          rightAddressLookupState.lng = null;
          rightAddressLookupState.deliveryZoneId = null;
          rightAddressLookupState.deliveryStoreId = null;
        }
      };
    }
    if (house) {
      house.oninput = () => {
        if (!rightAddressMapModeEnabled) return;
        if (rightAddressLookupState.selectedAddress) {
          rightAddressLookupState.selectedAddress = null;
          rightAddressLookupState.addressRef = rightAddressLookupState.selectedStreet?.source_key || "";
          rightAddressLookupState.selectedObjectType = rightAddressLookupState.selectedStreet ? "street" : "";
          rightAddressLookupState.lat = null;
          rightAddressLookupState.lng = null;
          rightAddressLookupState.deliveryZoneId = null;
          rightAddressLookupState.deliveryStoreId = null;
        }
      };
    }

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
        fillRightAddressInputs(getAddressDraftFromClientAddress(row, getDefaultRightAddressCity()), id);
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
        fillRightAddressInputs(createBlankRightAddressDraft(), id);
        renderRightAddressList(id);
      };
    }

    cancelBtn.onclick = () => {
      closeRightAddressOverlay();
    };
    saveBtn.onclick = async () => {
      const next = readRightAddressInputs();
      if (!next.street || !next.house) {
        if (rightAddressMapModeEnabled) {
          showRightAddressLookupValidationError("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0443\u043b\u0438\u0446\u0443 \u0438 \u043d\u043e\u043c\u0435\u0440 \u0434\u043e\u043c\u0430");
          return;
        }
        if (!next.street) {
          alert("Укажите улицу");
          return;
        }
        alert("Укажите дом");
        return;
      }
      const editingAddressId = Number(state.rightAddressEditingIdByOrder.get(id) || 0);
      const selectedAddressId = Number(state.rightAddressSelectedIdByOrder.get(id) || 0);
      const clientId = await getClientIdByOrder(id);

      if (editingAddressId > 0 && clientId > 0) {
        await apiJson(`/api/admin/clients/${clientId}/addresses/${editingAddressId}`, {
          method: "PUT",
          body: JSON.stringify({
            city: next.city || null,
            street: next.street || null,
            house: next.house || null,
            entrance: next.entrance || null,
            floor: next.floor || null,
            apartment: next.apartment || null,
            comment: next.comment || null,
            address_ref: next.address_ref,
            selected_object_type: next.selected_object_type,
            resolved_city_source_key: next.resolved_city_source_key,
            address_context_locality: next.address_context_locality,
            address_normalized_display: next.address_normalized_display,
            lat: next.lat,
            lng: next.lng,
            delivery_zone_id: next.delivery_zone_id,
            delivery_store_id: next.delivery_store_id,
          }),
        });
        const list = await loadClientAddressesForRightOrder(id);
        const updated = list.find((row) => Number(row.id || 0) === editingAddressId) || null;
        if (updated) {
          const selectedDraft = getAddressDraftFromClientAddress(updated, next.city || getDefaultRightAddressCity());
          state.rightAddressDraftByOrder.set(id, selectedDraft);
          updateRightOrderFormField(id, "address", buildRightAddressLine(selectedDraft));
          closeRightAddressOverlay();
          renderRightOrderTabs();
          return;
        }
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
      } else if (clientId > 0 && (next.city || next.street || next.house || next.address_normalized_display)) {
        const createdJson = await apiJson(`/api/admin/clients/${clientId}/addresses`, {
          method: "POST",
          body: JSON.stringify({
            city: next.city || null,
            street: next.street || null,
            house: next.house || null,
            entrance: next.entrance || null,
            floor: next.floor || null,
            apartment: next.apartment || null,
            comment: next.comment || null,
            address_ref: next.address_ref,
            selected_object_type: next.selected_object_type,
            resolved_city_source_key: next.resolved_city_source_key,
            address_context_locality: next.address_context_locality,
            address_normalized_display: next.address_normalized_display,
            lat: next.lat,
            lng: next.lng,
            delivery_zone_id: next.delivery_zone_id,
            delivery_store_id: next.delivery_store_id,
            is_default: false,
          }),
        });
        const createdAddressId = Number(createdJson?.id || 0);
        const list = await loadClientAddressesForRightOrder(id);
        const created = list.find((row) => Number(row.id || 0) === createdAddressId) || null;
        if (created) {
          state.rightAddressSelectedIdByOrder.set(id, Number(created.id || 0));
          const createdDraft = getAddressDraftFromClientAddress(created, next.city || getDefaultRightAddressCity());
          state.rightAddressDraftByOrder.set(id, createdDraft);
          updateRightOrderFormField(id, "address", buildRightAddressLine(createdDraft));
          closeRightAddressOverlay();
          renderRightOrderTabs();
          return;
        }
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
      state.rightAddressDraftByOrder.delete(id);
      state.rightAddressSelectedIdByOrder.delete(id);
      state.rightAddressEditingIdByOrder.delete(id);
      invalidateRightDeliveryQuote(id);
      state.rightOrders[index] = { ...order, form };
      return;
    }

      const clientAddresses = await loadClientAddressesForRightOrder(id);
      const primaryAddress = (Array.isArray(clientAddresses) ? clientAddresses : []).find((item) => Number(item?.is_default || 0) === 1)
      || (Array.isArray(clientAddresses) ? clientAddresses[0] : null)
      || null;
    if (!primaryAddress) return;
    state.rightAddressSelectedIdByOrder.set(id, Number(primaryAddress?.id || 0) || 0);
    state.rightAddressEditingIdByOrder.set(id, 0);
    state.rightAddressDraftByOrder.set(id, getAddressDraftFromClientAddress(primaryAddress, getDefaultRightAddressCity()));
    form.address = formatClientAddressLine(primaryAddress);
    invalidateRightDeliveryQuote(id);
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
      const comboOldLineTotal = roundPrice(Number(item.unit_price_before_discount || 0) * qty);
      item.old_line_total = comboOldLineTotal > item.sum ? comboOldLineTotal : 0;
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
    if (isGiftRewardCartItem(item)) {
      const giftUnitBeforeDiscount = roundPrice(Math.max(
        Number(item?.unit_price_before_discount || 0),
        oldUnitPrice,
        unitBeforeDiscount
      ));
      item.unit_price_before_discount = giftUnitBeforeDiscount > 0 ? giftUnitBeforeDiscount : 0;
      item.unit_price = 0;
      if (item.pricing && typeof item.pricing === "object") {
        item.pricing = {
          ...item.pricing,
          unit_before_discount: giftUnitBeforeDiscount,
          discount_amount: giftUnitBeforeDiscount,
        };
      }
      item.sum = 0;
      item.old_line_total = 0;
      return item;
    }
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
    const paidQtyForOldLine = isRightOrderAutoAddItem(item) ? getRightOrderAutoPaidQty(item, qty) : qty;
    const oldLineTotal = hasOldUnitPrice
      ? roundPrice(Number(item.unit_price_before_discount || 0) * paidQtyForOldLine)
      : 0;
    item.old_line_total = oldLineTotal > item.sum ? oldLineTotal : 0;
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
      isGiftReward: Number(item?.is_gift_reward || 0) === 1 ? 1 : 0,
      giftRewardId: Number(item?.gift_reward_id || 0) > 0 ? Number(item.gift_reward_id) : 0,
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
          ${photo ? `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="cart-thumb">—</div>`}
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
            ${photo ? `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="cart-thumb">—</div>`}
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
                <div class="shop-pd-option-thumb">—</div>
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
                ${itemPhoto ? `<img class="shop-pd-option-thumb" src="${escapeHtml(itemPhoto)}" alt="" />` : `<div class="shop-pd-option-thumb">—</div>`}
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
                    ${selectedPhoto ? `<img class="shop-pd-option-thumb" src="${escapeHtml(selectedPhoto)}" alt="" />` : `<div class="shop-pd-option-thumb">—</div>`}
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
              ${photo ? `<img class="shop-pd-option-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="shop-pd-option-thumb">—</div>`}
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
            ${photo ? `<img class="shop-pd-option-thumb" src="${escapeHtml(photo)}" alt="" />` : `<div class="shop-pd-option-thumb">—</div>`}
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

      rightInteractionEl.addEventListener("click", async (e) => {
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
          const giftRewardId = Number(removedItem?.gift_reward_id || 0);
          const isGiftReward = Number(removedItem?.is_gift_reward || 0) === 1 && giftRewardId > 0;
          if (isGiftReward) {
            const giftBundleItems = cartItems.filter((item) => Number(item?.gift_reward_id || 0) === giftRewardId);
            const restored = await restoreRightOrderGiftRewardsFromItems(orderId, giftBundleItems);
            if (!restored) return;
          }
          const nextItems = isGiftReward
            ? cartItems.filter((item) => Number(item?.gift_reward_id || 0) !== giftRewardId)
            : cartItems.filter((item) => Number(item?.id || 0) !== cartItemId);
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
            const giftItems = cartItems.filter((item) => Number(item?.is_gift_reward || 0) === 1);
            if (giftItems.length) {
              const restored = await restoreRightOrderGiftRewardsFromItems(orderId, giftItems);
              if (!restored) return;
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
          const giftItems = cartItems.filter((item) => Number(item?.is_gift_reward || 0) === 1);
          if (giftItems.length) {
            const restored = await restoreRightOrderGiftRewardsFromItems(orderId, giftItems);
            if (!restored) return;
          }
          clearRightOrderCart(orderId);
          renderRightOrderTabs();
          return;
        }

        const benefitsBtn = e.target.closest("[data-action='right-order-benefits-open'][data-order-id]");
        if (benefitsBtn) {
          const orderId = Number(benefitsBtn.getAttribute("data-order-id") || 0);
          if (!(orderId > 0)) return;
          void openRightClientBenefitsCatalogOverlay(orderId);
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

    document.addEventListener("click", async (e) => {
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
        if (
          document.body.classList.contains("page-orders")
          || document.body.classList.contains("page-courier-screen")
        ) {
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
      is_gift_reward: Number(orderItem?.is_gift_reward || 0) === 1 ? 1 : 0,
      gift_reward_id: Number(orderItem?.gift_reward_id || 0) > 0 ? Number(orderItem.gift_reward_id) : null,
      old_line_total: oldLineTotal > lineTotal ? oldLineTotal : 0,
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
    const lineTotal = roundPrice(Number(orderItem?.line_total ?? orderItem?.total ?? orderItem?.total_price ?? 0));
    const oldLineTotal = roundPrice(Number(orderItem?.discount?.original_line_total || orderItem?.old_line_total || 0));
    const cartItem = buildCartItemFromProduct(productId, qty);
    if (!cartItem) return buildFallbackCartProductItem(orderItem);
    cartItem.id = Date.now() + Math.floor(Math.random() * 10000);
    cartItem.auto_add = Number(orderItem?.auto_add || 0) === 1 ? 1 : 0;
    cartItem.auto_add_group_id = cartItem.auto_add === 1 && Number(orderItem?.auto_add_group_id || 0) > 0
      ? Number(orderItem.auto_add_group_id)
      : null;
    cartItem.is_gift_reward = Number(orderItem?.is_gift_reward || 0) === 1 ? 1 : 0;
    cartItem.gift_reward_id = Number(orderItem?.gift_reward_id || 0) > 0 ? Number(orderItem.gift_reward_id) : null;
    cartItem.old_line_total = oldLineTotal > lineTotal ? oldLineTotal : 0;
    cartItem.unit_price = qty > 0 ? roundPrice(lineTotal / qty) : 0;
    cartItem.unit_price_before_discount = oldLineTotal > lineTotal && qty > 0 ? roundPrice(oldLineTotal / qty) : 0;
    cartItem.sum = lineTotal;
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
      old_line_total: oldLineTotalRaw > lineTotal ? oldLineTotalRaw : 0,
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
    const preserveStoredLineTotals = opts?.preserveStoredLineTotals !== false;
    const normalizedCartItems = normalizeRightOrderCartItemsWithAutoAdd(
      Number(draft.id || 0),
      cartItems,
      { preserveStoredLineTotals }
    );

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
    const benefitsMeta = src?.benefits_meta && typeof src.benefits_meta === "object"
      ? src.benefits_meta
      : null;
    const restoredDiscountId = normalizeRightOrderBenefitsSelectedId(benefitsMeta?.selected_discount_id);
    const restoredDiscountSource = normalizeRightOrderBenefitsDiscountSource(benefitsMeta?.selected_discount_source);
    const restoredPromoSource = normalizeRightOrderBenefitsPromoSource(benefitsMeta?.selected_promo_source);
    const restoredPromoRewardId = normalizeRightOrderBenefitsSelectedId(benefitsMeta?.selected_promo_reward_id);
    const restoredPreviewMode = String(benefitsMeta?.benefits_preview_mode || "").trim()
      ? normalizeRightOrderBenefitsMode(benefitsMeta?.benefits_preview_mode)
      : null;
    const restoredPromoCode = normalizeRightOrderBenefitsPromoCode(src?.promo_code);

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
      promo_code: restoredPromoCode,
      selected_discount_id: restoredDiscountId,
      selected_discount_source: restoredDiscountId
        ? (restoredDiscountSource || "discount")
        : null,
      selected_promo_source: (restoredPromoCode || restoredPromoRewardId)
        ? (restoredPromoSource || (restoredPromoCode ? "promo_code" : null))
        : null,
      selected_promo_reward_id: restoredPromoRewardId,
      benefits_preview_mode: restoredPreviewMode,
      comment: String(src?.comment || "").trim(),
      cartItems: normalizedCartItems,
    };

    const sessionAddressDraft = String(src?.method_code || "").trim().toLowerCase() === "delivery"
      ? normalizeRightAddressDraft({
        city: src?.delivery_address_city || "",
        street: src?.delivery_address_street || "",
        house: src?.delivery_address_house || "",
        entrance: src?.delivery_address_entrance || "",
        floor: src?.delivery_address_floor || "",
        apartment: src?.delivery_address_apartment || "",
        comment: src?.address_comment || "",
        address_ref: src?.delivery_address_ref || null,
        selected_object_type: src?.delivery_selected_object_type || null,
        resolved_city_source_key: src?.delivery_resolved_city_source_key || null,
        address_context_locality: src?.delivery_address_context_locality || null,
        address_normalized_display: src?.delivery_address_normalized_display || src?.address || null,
        lat: src?.delivery_address_lat,
        lng: src?.delivery_address_lng,
        delivery_zone_id: src?.delivery_zone_id,
        delivery_store_id: src?.delivery_store_id,
      }, getDefaultRightAddressCity())
      : null;
    const hasSessionAddressDraft = sessionAddressDraft && hasRightOrderQuoteAddressData(sessionAddressDraft);
    const deliveryAddressId = Number(src?.delivery_address_id || 0);
    draft.editPricingSnapshot = buildRightOrderStoredPricingSnapshot(src);
    draft.editPricingBaselineSignature = buildRightOrderEditPricingSignature(draft, {
      addressDraft: hasSessionAddressDraft ? sessionAddressDraft : null,
      selectedAddressId: deliveryAddressId > 0 ? deliveryAddressId : 0,
    });

    return {
      activeCategoryId: CHECKOUT_SCREEN_ID,
      quantities: {},
      selectedVariants: {},
      ingredientStateByProduct: {},
      optionSelections: {},
      rightOrders: [{ ...draft, editCartTouched: false }],
      rightAddressDraftByOrder: hasSessionAddressDraft ? { [draft.id]: sessionAddressDraft } : {},
      rightAddressSelectedIdByOrder: deliveryAddressId > 0 ? { [draft.id]: deliveryAddressId } : {},
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
      rightAddressDraftByOrder: mapToObject(state.rightAddressDraftByOrder),
      rightAddressSelectedIdByOrder: mapToObject(state.rightAddressSelectedIdByOrder),
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
    state.rightAddressDraftByOrder = objectToMap(src.rightAddressDraftByOrder || {});
    state.rightAddressDraftByOrder.forEach((value, key) => {
      state.rightAddressDraftByOrder.set(key, normalizeRightAddressDraft(value, getDefaultRightAddressCity()));
    });
    state.rightAddressSelectedIdByOrder = objectToMap(src.rightAddressSelectedIdByOrder || {});
    state.rightAddressSelectedIdByOrder.forEach((value, key) => {
      const numeric = Number(value || 0);
      if (Number.isFinite(numeric) && numeric > 0) {
        state.rightAddressSelectedIdByOrder.set(key, numeric);
      } else {
        state.rightAddressSelectedIdByOrder.delete(key);
      }
    });
    state.rightAddressEditingIdByOrder = new Map();
    state.rightClientAddressesByOrder = new Map();
    state.rightDeliveryQuoteByOrder = new Map();
    state.rightDeliveryQuoteKeyByOrder = new Map();
    state.rightDeliveryQuoteLoadingByOrder = new Set();
    state.rightDeliveryQuoteReqSeqByOrder = new Map();
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
    state.rightOrders.forEach((row) => {
      const orderId = Number(row?.id || 0);
      if (orderId > 0) scheduleRightOrderBenefitsRefresh(orderId, { delay: 0 });
    });
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
        } else {
          try {
            await loadRefsFromApi();
          } catch {}
          try {
            await loadCheckoutDraftFromApi(true);
          } catch {}
        }
      } else {
        const manifestChanged = !areManifestTokensEqual(prevManifest, nextManifest);
        if (!hydrated || manifestChanged) {
          await syncDataByManifest(nextManifest, prevManifest, !hydrated);
        } else {
          try {
            await loadRefsFromApi();
          } catch {}
          try {
            await loadCheckoutDraftFromApi(true);
          } catch {}
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




