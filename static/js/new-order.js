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
  const rightTabsHeaderEl = document.getElementById("newOrderTabsHeader");
  const rightTabsEl = document.getElementById("newOrderTabs");
  const rightContentEl = document.getElementById("newOrderRightContent");
  const rightEmptyEl = document.getElementById("newOrderRightEmpty");
  if (!categoriesListEl || !productsGridEl) return;
  const CHECKOUT_SCREEN_ID = "__checkout_screen__";
  const CHECKOUT_DRAFT_CACHE_VERSION = 1;
  const CHECKOUT_DRAFT_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
  const CHECKOUT_PRODUCTS_CACHE_VERSION = 1;
  const CHECKOUT_PRODUCTS_CACHE_MAX_AGE_MS = 2 * 60 * 1000;

  const state = {
    categories: [],
    productCategories: [],
    activeCategoryId: null,
    quantities: new Map(),
    productVariants: new Map(),
    selectedVariants: new Map(),
    currentProducts: [],
    unitConversions: [],
    productIngredients: new Map(),
    ingredientStateByProduct: new Map(),
    productOptionGroups: new Map(),
    optionGroupDetails: new Map(),
    optionSelections: new Map(),
    optionTargetProductCache: new Map(),
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
    rightDatePickerMonthByOrder: new Map(),
    rightPickupStores: [],
    rightClientLookupCache: new Map(),
    rightClientLookupReqSeq: 0,
    rightAddressDraftByOrder: new Map(),
    rightClientAddressesByOrder: new Map(),
    rightAddressSelectedIdByOrder: new Map(),
    rightAddressEditingIdByOrder: new Map(),
  };

  function isCheckoutScreenActive() {
    return String(state.activeCategoryId) === CHECKOUT_SCREEN_ID;
  }

  function updateEditControls() {
    if (!settingsBtnEl) return;
    const icon = settingsBtnEl.querySelector("i");
    if (state.checkoutEditMode) {
      if (icon) icon.className = "fas fa-check";
      settingsBtnEl.setAttribute("aria-label", "Сохранить черновик экрана оформления");
      settingsBtnEl.setAttribute("title", "Сохранить черновик");
      if (cancelEditBtnEl) cancelEditBtnEl.classList.remove("hidden");
      return;
    }
    if (icon) icon.className = "fas fa-cog";
    settingsBtnEl.setAttribute("aria-label", "Редактировать экран оформления");
    settingsBtnEl.setAttribute("title", "Редактировать экран оформления");
    if (cancelEditBtnEl) cancelEditBtnEl.classList.add("hidden");
  }

  function renderMainContentMode() {
    const checkoutScreenActive = isCheckoutScreenActive();
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
      if (rightTabsHeaderEl) rightTabsHeaderEl.classList.add("hidden");
      if (rightEmptyEl) rightEmptyEl.classList.remove("hidden");
      state.rightOpenSelect = null;
      closeRightAddressOverlay();
      return;
    }

    rightTabsEl.innerHTML = orders.map((order) => {
      const orderId = Number(order?.id || 0);
      const isActive = orderId === Number(state.rightActiveOrderId || 0);
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-action="right-order-tab-select" data-order-id="${orderId}">
          <span class="product-tab-title">${escapeHtml(String(order?.title || "Новый заказ"))}</span>
          <button class="product-tab-close" type="button" data-action="right-order-tab-close" data-order-id="${orderId}" aria-label="Закрыть">×</button>
        </div>
      `;
    }).join("");
    rightContentEl.classList.remove("hidden");
    if (rightTabsHeaderEl) rightTabsHeaderEl.classList.remove("hidden");
    if (rightEmptyEl) rightEmptyEl.classList.add("hidden");

    const active = orders.find((order) => Number(order?.id || 0) === Number(state.rightActiveOrderId || 0)) || orders[0];
    state.rightActiveOrderId = Number(active?.id || 0) || null;
    const form = active?.form || {};
    const cartItems = Array.isArray(form?.cartItems) ? form.cartItems : [];
    const cartSubtotal = roundPrice(cartItems.reduce((sum, item) => sum + Number(item?.sum || 0), 0));
    const cartItemsCount = cartItems.reduce((sum, item) => sum + Math.max(1, Number(item?.qty || 1)), 0);
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

    const orderTotal = getCheckoutCurrentTotal();
    const minChangeAmount = Math.max(0, roundPrice(orderTotal)) + 1;

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
      changeType: { no_change: "Сдача не нужна", "500": "500", "1000": "1000", "2000": "2000", "5000": "5000", other: "Другая сумма" },
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
            <span>${escapeHtml(labels[field]?.[value] || value || "Выбрать")}</span>
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
            <span class="new-order-right-form-label">Номер телефона</span>
            <input class="control new-order-right-phone" type="text" inputmode="tel" value="${escapeHtml(formatPhoneRuInput(String(form.phone || "")))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="phone" placeholder="+7 (999) 999-99-99" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_phone_${Number(active?.id || 0)}" />
          </label>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">Имя</span>
            <input class="control" type="text" value="${escapeHtml(String(form.name || ""))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="name" placeholder="Имя клиента" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_name_${Number(active?.id || 0)}" />
          </label>
        </div>

        <div class="new-order-right-form-row">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">Способ получения</span>
            ${renderSelect("pickupMethod", Number(active?.id || 0))}
          </div>
          <label class="new-order-right-form-field">
            <span class="new-order-right-form-label">Адрес</span>
            <span class="new-order-right-address-wrap">
              <input class="control" type="text" value="${escapeHtml(String(form.address || ""))}" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="address" placeholder="Введите адрес" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_address_${Number(active?.id || 0)}" />
              <button type="button" class="new-order-right-address-edit" title="Добавить адрес" aria-label="Добавить адрес">
                <i class="fas fa-pen"></i>
              </button>
            </span>
          </label>
        </div>

        <div class="new-order-right-form-row ${cookWhenKind !== "asap" ? "is-three-cols" : ""}">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">Когда приготовить</span>
            ${renderSelect("cookWhen", Number(active?.id || 0))}
          </div>
          ${cookWhenKind === "asap" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Дата и время</span>
              <div class="new-order-right-time-hint is-single"><span>40-80 мин</span></div>
            </div>
          ` : cookWhenKind === "at_time" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Дата</span>
              <button type="button" class="new-order-right-select-trigger is-static" disabled><span>Сегодня</span></button>
            </div>
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Время</span>
              ${renderSelect("dateTime", Number(active?.id || 0))}
            </div>
          ` : `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Дата</span>
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
              <span class="new-order-right-form-label">Время</span>
              ${renderSelect("dateTime", Number(active?.id || 0))}
            </div>
          `}
        </div>

        <div class="new-order-right-form-row ${isCashPayment && String(selectValues.changeType) === "other" ? "is-payment-three-cols" : ""}">
          <div class="new-order-right-form-field">
            <span class="new-order-right-form-label">Способ оплаты</span>
            ${renderSelect("paymentMethod", Number(active?.id || 0))}
          </div>
          ${isCashPayment ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Сдача</span>
              ${String(selectValues.changeType) === "other" ? `
                ${renderSelect("changeType", Number(active?.id || 0))}
              ` : renderSelect("changeType", Number(active?.id || 0))}
            </div>
          ` : `<div class="new-order-right-form-field"></div>`}
          ${isCashPayment && String(selectValues.changeType) === "other" ? `
            <div class="new-order-right-form-field">
              <span class="new-order-right-form-label">Сумма</span>
              <input
                class="control new-order-right-change-input"
                type="number"
                min="${minChangeAmount}"
                step="1"
                value="${escapeHtml(String(form.changeAmount || ""))}"
                data-action="right-input-change"
                data-order-id="${Number(active?.id || 0)}"
                data-field="changeAmount"
                placeholder="Больше ${escapeHtml(String(roundPrice(orderTotal)))}"
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
          <span class="new-order-right-form-label">Комментарий</span>
          <textarea class="control new-order-right-comment" data-action="right-input-change" data-order-id="${Number(active?.id || 0)}" data-field="comment" placeholder="Введите комментарий к заказу" autocomplete="new-password" autocorrect="off" autocapitalize="off" spellcheck="false" readonly data-no-autofill="1" name="noaf_comment_${Number(active?.id || 0)}">${escapeHtml(String(form.comment || ""))}</textarea>
        </label>

        <div class="new-order-right-divider"></div>

        <div class="new-order-right-cart">
          <div class="new-order-right-cart-list">
            ${cartItems.length ? cartItems.map((item) => {
              const type = String(item?.type || "product");
              const qty = Math.max(1, Number(item?.qty || 1));
              const unitPrice = roundPrice(Number(item?.unit_price || 0));
              const sum = roundPrice(Number(item?.sum || unitPrice * qty));
              const title = String(item?.name || (type === "combo" ? "Комбо" : "Товар"));
              const sections = Array.isArray(item?.sections) ? item.sections : [];
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
                  productName: String(item?.name || "Товар").trim(),
                  unitLabel: String(item?.variant?.label || "").trim(),
                  variantValues: Array.isArray(item?.variant?.values) ? item.variant.values.map((v) => String(v || "").trim()).filter(Boolean) : [],
                  selectedVariantIndex: Number.isFinite(Number(item?.variant?.selected_index)) ? Number(item.variant.selected_index) : 0,
                  ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [],
                  rowKind: "product",
                }];
              return `
                <article class="new-order-right-cart-item" data-cart-item-id="${Number(item?.id || 0)}">
                  <div class="new-order-right-cart-left">
                    <div class="new-order-right-cart-thumb">${renderCartThumb(item)}</div>
                    <div class="qty-pill qty-pill--muted new-order-right-cart-qty" data-qty-wrap>
                      <button
                        class="qty-pill__btn qty-pill__btn--minus${qty <= 0 ? " is-disabled" : ""}"
                        type="button"
                        data-action="right-cart-qty-minus"
                        data-order-id="${Number(active?.id || 0)}"
                        data-cart-item-id="${Number(item?.id || 0)}"
                      >−</button>
                      <span class="qty-pill__center" data-qty-value>${qty}</span>
                      <button
                        class="qty-pill__btn qty-pill__btn--plus"
                        type="button"
                        data-action="right-cart-qty-plus"
                        data-order-id="${Number(active?.id || 0)}"
                        data-cart-item-id="${Number(item?.id || 0)}"
                      >+</button>
                    </div>
                  </div>
                  <div class="new-order-right-cart-item-main">
                    <div class="new-order-right-cart-item-title">${qty} х ${escapeHtml(title)}</div>
                    <div class="new-order-right-cart-item-sub">
                      ${compositionRows.map((row) => {
                        const baseLine = row.rowKind === "product"
                          ? escapeHtml(row.unitLabel || "")
                          : (row.unitLabel ? `${escapeHtml(row.unitLabel)} · ${escapeHtml(row.productName)}` : escapeHtml(row.productName));
                        const removeBtn = row.variantValues.length > 1
                          ? `
                            <button
                              type="button"
                              class="new-order-right-cart-variant-chip new-order-right-cart-variant-remove"
                              data-action="right-cart-row-remove"
                              data-order-id="${Number(active?.id || 0)}"
                              data-cart-item-id="${Number(item?.id || 0)}"
                              data-row-kind="${row.rowKind}"
                              data-section-index="${row.sectionIndex}"
                              aria-label="Удалить позицию"
                              title="Удалить позицию"
                            >×</button>
                          `
                          : "";
                        const chips = row.variantValues.length > 1
                          ? `
                            <div class="new-order-right-cart-variant-scroll no-scrollbar">
                              <div class="new-order-right-cart-variant-row">
                                ${removeBtn}
                                ${row.variantValues.map((label, variantIndex) => `
                                  <button
                                    type="button"
                                    class="new-order-right-cart-variant-chip ${variantIndex === row.selectedVariantIndex ? "is-selected" : ""}"
                                    data-action="right-cart-variant-select"
                                    data-order-id="${Number(active?.id || 0)}"
                                    data-cart-item-id="${Number(item?.id || 0)}"
                                    data-row-kind="${row.rowKind}"
                                    data-section-index="${row.sectionIndex}"
                                    data-variant-index="${variantIndex}"
                                  >${escapeHtml(label)}</button>
                                `).join("")}
                              </div>
                            </div>
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
                        return `<div class="new-order-right-cart-composition-row">${baseLine ? `<div>${baseLine}</div>` : ""}${chips}${ingredientsHtml}</div>`;
                      }).join("")}
                    </div>
                  </div>
                  <div class="new-order-right-cart-item-sum">${escapeHtml(toMoney(sum))}</div>
                </article>
              `;
            }).join("") : `<div class="new-order-right-cart-empty">Состав заказа пока пуст</div>`}
          </div>
          <div class="new-order-right-cart-total">
            <span>Итого (${cartItemsCount})</span>
            <strong>${escapeHtml(toMoney(cartSubtotal))}</strong>
          </div>
        </div>
      </div>
    `;
  }

  function openRightNewOrderTab() {
    const nextNumber = (Array.isArray(state.rightOrders) ? state.rightOrders.length : 0) + 1;
    const id = Date.now() + Math.floor(Math.random() * 10000);
    const title = nextNumber === 1 ? "Новый заказ" : `Новый заказ ${nextNumber}`;
    const activeDeliveryTypes = (Array.isArray(state.rightDeliveryTypes) ? state.rightDeliveryTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const defaultDeliveryType = activeDeliveryTypes.find((item) => Number(item?.is_default || 0) === 1) || activeDeliveryTypes[0] || null;
    const defaultPickupMethodCode = String(defaultDeliveryType?.code || "delivery");
    const activePaymentTypes = (Array.isArray(state.rightPaymentTypes) ? state.rightPaymentTypes : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const defaultPaymentCode = String((activePaymentTypes[0] || {}).code || "cash");
    const activeTimeOptions = (Array.isArray(state.rightTimeOptions) ? state.rightTimeOptions : [])
      .filter((item) => Number(item?.is_active || 0) === 1);
    const defaultCookWhenCode = String((activeTimeOptions[0] || {}).code || "asap");
    const defaultCookWhenKind = getCookWhenKind(defaultCookWhenCode);
    const defaultScheduledDate = defaultCookWhenKind === "on_date" ? getTomorrowIsoDate() : formatIsoDate(getTodayDate());
    const defaultTime = buildTimeSlotsForOptionWithDate(defaultCookWhenCode, defaultScheduledDate)[0] || "18:00";

    state.rightOrders.push({
      id,
      title,
      form: {
        phone: "+7",
        clientId: null,
        name: "",
        pickupMethod: defaultPickupMethodCode,
        address: "",
        cookWhen: defaultCookWhenCode,
        scheduledDate: defaultScheduledDate,
        dateTime: defaultTime,
        paymentMethod: defaultPaymentCode,
        changeType: "no_change",
        changeAmount: "",
        comment: "",
        cartItems: [],
      },
    });
    void applyReceiveMethodAddress(id);
    state.rightActiveOrderId = id;
    state.rightOpenSelect = null;
    renderRightOrderTabs();
  }

  async function loadRightDeliveryTypes() {
    try {
      const json = await apiJson("/api/admin/tenant/order-delivery-types");
      const items = Array.isArray(json?.items) ? json.items : [];
      state.rightDeliveryTypes = items
        .map((item) => ({
          id: Number(item?.id || 0),
          code: String(item?.code || "").trim(),
          title: String(item?.title || "").trim(),
          is_active: Number(item?.is_active || 0),
          is_default: Number(item?.is_default || 0),
          sort: Number(item?.sort || 0),
        }))
        .filter((item) => item.code)
        .sort((a, b) => (a.sort - b.sort) || (a.id - b.id));
    } catch {
      state.rightDeliveryTypes = [];
    }
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
    if (!y || !m || !d) return "Завтра";
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
    if (c === "on_date" || c.includes("date") || c.includes("дата")) return "on_date";
    if (c === "at_time" || c.includes("time") || c.includes("время")) return "at_time";
    return "asap";
  }

  function isCashPaymentCode(code) {
    const c = String(code || "").trim().toLowerCase();
    return c === "cash" || c.includes("нал") || c.includes("cash");
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
          <span>Пн</span><span>Вт</span><span>Ср</span><span>Чт</span><span>Пт</span><span>Сб</span><span>Вс</span>
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
    if (c.includes("самовывоз") || c.includes("ссобой") || c.includes("с собой") || c.includes("взале") || c.includes("в зале")) return true;
    return false;
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
    const street = String(address.street || "").trim();
    const house = String(address.house || "").trim();
    const entrance = String(address.entrance || "").trim();
    const floor = String(address.floor || "").trim();
    const apartment = String(address.apartment || "").trim();
    const comment = String(address.comment || "").trim();
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
        payload = { found: false, clientId: 0, name: "", address: "", addresses: [] };
      } else {
        const clientId = Number(match.id);
        const addressesJson = await apiJson(`/api/admin/clients/${clientId}/addresses`);
        const addresses = Array.isArray(addressesJson?.data) ? addressesJson.data : [];
        const primaryAddress = addresses.find((item) => Number(item?.is_default || 0) === 1) || addresses[0] || null;
        payload = {
          found: true,
          clientId,
          name: String(match?.name || "").trim(),
          address: formatClientAddressLine(primaryAddress),
          addresses,
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
    return {
      id: Number(item.id || 0),
      city: String(item.city || "").trim(),
      street: String(item.street || "").trim(),
      house: String(item.house || "").trim(),
      entrance: String(item.entrance || "").trim(),
      floor: String(item.floor || "").trim(),
      apartment: String(item.apartment || "").trim(),
      comment: String(item.comment || "").trim(),
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
    const city = String(forcedCity || a.city || getDefaultRightAddressCity()).trim();
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
        <button type="button" class="new-order-right-address-radio" data-action="right-address-select" data-address-id="${Number(a.id)}" aria-label="Выбрать адрес"></button>
        <div class="new-order-right-address-row-main">${escapeHtml(formatClientAddressShort(a, cityForRows))}</div>
        <div class="new-order-right-address-row-actions">
          <button type="button" class="new-order-right-address-row-btn" data-action="right-address-edit-item" data-address-id="${Number(a.id)}" aria-label="Редактировать"><i class="fas fa-pen"></i></button>
          <button type="button" class="new-order-right-address-row-btn is-danger" data-action="right-address-del-item" data-address-id="${Number(a.id)}" aria-label="Удалить"><i class="fas fa-times"></i></button>
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
    const direct = String(tenant?.city || tenant?.city_name || "").trim();
    if (direct) return direct;
    return "Новоалтайск";
  }

  function buildRightAddressLine(parts) {
    const city = String(parts?.city || "").trim();
    const street = String(parts?.street || "").trim();
    const house = String(parts?.house || "").trim();
    const entrance = String(parts?.entrance || "").trim();
    const floor = String(parts?.floor || "").trim();
    const apartment = String(parts?.apartment || "").trim();
    const comment = String(parts?.comment || "").trim();
    const head = [city ? `г. ${city}` : "", street ? `ул. ${street}` : "", house ? `д. ${house}` : ""].filter(Boolean).join(", ");
    const details = [entrance ? `под. ${entrance}` : "", floor ? `эт. ${floor}` : "", apartment ? `кв. ${apartment}` : ""].filter(Boolean).join(", ");
    return [head, details, comment].filter(Boolean).join(", ");
  }

  function fillRightAddressInputs(draft) {
    const { city, street, house, entrance, floor, apartment, comment } = getRightAddressOverlayElements();
    if (!city || !street || !house || !entrance || !floor || !apartment || !comment) return;
    initRightAddressCitySelect(city, String(draft?.city || ""));
    street.value = String(draft?.street || "");
    house.value = String(draft?.house || "");
    entrance.value = String(draft?.entrance || "");
    floor.value = String(draft?.floor || "");
    apartment.value = String(draft?.apartment || "");
    comment.value = String(draft?.comment || "");
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
    if (!ids.length) return `Блок ${blockIndex + 1}`;
    if (ids.length === 1) return firstTitle || `Блок ${blockIndex + 1}`;
    return firstTitle ? `${firstTitle} +${ids.length - 1}` : `Блок ${blockIndex + 1}`;
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

  function checkoutProductsCacheKey(categoryId) {
    return `new_order_checkout_products_v${CHECKOUT_PRODUCTS_CACHE_VERSION}_t${getTenantIdFromStorage()}_c${Number(categoryId || 0)}`;
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
      const defaultSelectedProductId = safeBlock.requireAll ? Number(products[0]?.id || 0) : 0;
      const selectedProductId = products.some((p) => Number(p?.id || 0) === savedSelectedProductId)
        ? savedSelectedProductId
        : defaultSelectedProductId;
      if (!Number.isFinite(selectedProductId) || selectedProductId <= 0) return;

      const selectedProduct = products.find((p) => Number(p?.id || 0) === selectedProductId) || null;
      if (!selectedProduct) return;
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
      const ingredientDiff = calculateIngredientPriceDiff(selectedProductId);
      const priceRaw = hasVariants
        ? getVariantUnitPriceByBase(
            selectedProduct,
            selectedProductVariants,
            selectedVariantSafeIndex,
            Number(selectedProduct?.price || 0)
          )
        : Number(selectedProduct?.price || 0);
      const price = roundPrice(Number(priceRaw || 0) + Number(ingredientDiff || 0));
      const variantLabel = hasVariants ? getSelectedVariantLabelFromChips(variantChips) : "";
      const categoryTitle = String((categoryById.get(categoryId) || {}).title || "Категория");
      const productName = String(selectedProduct?.name || "Товар");

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
      return {
        id,
        type: "product",
        name: String(one.productName || "Товар"),
        qty: 1,
        unit_price: total,
        sum: total,
        variant: {
          label: variantLabel,
          values: variants,
          selected_index: selectedVariantIndex,
        },
        pricing: {
          base_price: Number(one?.basePrice || 0),
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
    return {
      id,
      type: "combo",
      name: getCheckoutBlockChipTitle(safeBlock, 0, categoryById) || "Комбо",
      qty: 1,
      unit_price: total,
      sum: total,
      photos: items.map((item) => String(item?.photoUrl || "")).filter(Boolean).slice(0, 4),
      sections: items.map((item) => ({
        category_id: Number(item?.categoryId || 0),
        category_name: String(item?.categoryTitle || ""),
        product_id: Number(item?.productId || 0),
        product_name: String(item?.productName || ""),
        photo_url: String(item?.photoUrl || ""),
        price: Number(item?.price || 0),
        variant: {
          label: String(item?.variantLabel || ""),
          values: Array.isArray(item?.variantValues) ? item.variantValues.map((v) => String(v || "").trim()).filter(Boolean) : [],
          selected_index: Number.isFinite(Number(item?.selectedVariantIndex)) ? Number(item.selectedVariantIndex) : 0,
        },
        pricing: {
          base_price: Number(item?.basePrice || 0),
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
      const baseUnitId = Number(pricing?.base_unit_id || 0);
      const unitId = Number(pricing?.unit_id || 0);
      const baseQty = Number(pricing?.base_qty || 1) || 1;
      const variantGroup = pricing?.variant_group || null;
      if (!variantGroup || !Array.isArray(variantGroup.values) || !variantGroup.values.length) {
        return roundPrice(Number(fallbackPrice || basePrice || 0));
      }
      const productLike = {
        price: basePrice,
        base_unit_id: baseUnitId,
        unit_id: baseUnitId || unitId,
        base_qty: baseQty,
      };
      const next = getVariantUnitPriceByBase(productLike, [variantGroup], Number(selectedIndex || 0), basePrice);
      return roundPrice(Number.isFinite(Number(next)) ? Number(next) : Number(fallbackPrice || basePrice || 0));
    };

    if (String(item.type || "") === "combo") {
      const sections = Array.isArray(item.sections) ? item.sections.map((section) => ({ ...section })) : [];
      let nextUnitPrice = 0;
      item.sections = sections.map((section) => {
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
        const sectionPrice = roundPrice(sectionBasePrice + ingredientDiff);
        nextUnitPrice += sectionPrice;
        return { ...section, price: sectionPrice, variant };
      });
      item.unit_price = roundPrice(nextUnitPrice);
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
    const ingredientDiff = calculateIngredientSnapshotDiff(item.ingredients);
    const basePrice = calcSnapshotPrice(
      item.pricing,
      safeIndex,
      Number(item?.pricing?.base_price || 0)
    );
    item.unit_price = roundPrice(basePrice + ingredientDiff);
    item.sum = roundPrice(item.unit_price * qty);
    return item;
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
    form.cartItems = list;
    state.rightOrders[idx] = { ...order, form };
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
      const defaultProductId = safeBlock.requireAll ? Number(products[0]?.id || 0) : 0;
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
      const catTitle = String(cat?.title || "Категория");
      const products = Array.isArray(state.checkoutCategoryProducts.get(categoryId)) ? state.checkoutCategoryProducts.get(categoryId) : [];
      const savedSelectedProductId = Number(state.checkoutSelectedProductByCategory.get(sectionKey) || 0);
      const defaultSelectedProductId = block.requireAll ? Number(products[0]?.id || 0) : 0;
      const selectedProductId = products.some((p) => Number(p?.id || 0) === savedSelectedProductId)
        ? savedSelectedProductId
        : defaultSelectedProductId;
      if (selectedProductId > 0) state.checkoutSelectedProductByCategory.set(sectionKey, selectedProductId);
      const productsHtml = products.length
        ? products.map((product) => {
            const photoUrl = getProductPhoto(product);
            const name = String(product?.name || "Товар");
            const productId = Number(product?.id || 0);
            const hasComposition = Array.isArray(state.productIngredients.get(productId)) && (state.productIngredients.get(productId) || []).length > 0;
            const popoverKey = getCheckoutIngredientsPopoverKey(sectionKey, productId);
            const isCompositionOpen = state.checkoutIngredientsPopoverKey === popoverKey;
            const compositionRows = isCompositionOpen ? getCheckoutIngredientRowsForProduct(productId, sectionKey) : [];
            const popoverPos = state.checkoutIngredientsPopoverPos || null;
            const popoverStyle = popoverPos
              ? `left:${Math.round(Number(popoverPos.left || 0))}px;top:${Math.round(Number(popoverPos.top || 0))}px;width:200px;`
              : "";
            return `
              <article class="new-order-checkout-product-item ${productId === selectedProductId ? "is-selected" : ""} ${hasComposition ? "has-composition" : ""}" data-product-id="${productId}" data-category-id="${categoryId}" data-section-key="${sectionKey}">
                <span class="new-order-checkout-product-photo-wrap">
                  ${photoUrl ? `<img class="new-order-checkout-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<span class="new-order-checkout-product-photo-placeholder"><i class="fas fa-image"></i></span>`}
                </span>
                <span class="new-order-checkout-product-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                ${hasComposition ? `
                  <button type="button" class="new-order-checkout-composition-btn" data-action="checkout-composition-toggle" data-product-id="${productId}" data-section-key="${sectionKey}" aria-label="Настроить состав" title="Настроить состав">⚙</button>
                  ${isCompositionOpen ? `
                    <div class="new-order-checkout-composition-popover" style="${popoverStyle}">
                      <div class="new-order-checkout-composition-popover-head">Состав</div>
                      <div class="new-order-checkout-composition-list no-scrollbar">
                        ${compositionRows.join("")}
                      </div>
                    </div>
                  ` : ""}
                ` : ""}
              </article>
            `;
          }).join("")
        : `<div class="new-order-checkout-products-empty">В категории пока нет товаров</div>`;
      const selectedVariantChips = selectedProductId > 0 ? getVariantChipsForProduct(selectedProductId) : [];
      const selectedProduct = products.find((p) => Number(p?.id || 0) === selectedProductId) || null;
      const selectedVariantIndex = Number(state.selectedVariants.get(selectedProductId));
      const selectedProductVariants = state.productVariants.get(selectedProductId) || [];
      const selectedIngredientDiff = selectedProductId > 0 ? calculateIngredientPriceDiff(selectedProductId) : 0;
      const selectedVariantPrice = selectedProductId > 0
        ? getVariantUnitPriceByBase(
            selectedProduct,
            selectedProductVariants,
            Number.isFinite(selectedVariantIndex) ? selectedVariantIndex : 0,
            Number(selectedProduct?.price || 0)
          )
        : 0;
      const fallbackProductPrice = Number(selectedProduct?.price || 0);
      const baseShown = selectedVariantChips.length ? selectedVariantPrice : fallbackProductPrice;
      const priceToShow = roundPrice(Number(baseShown || 0) + Number(selectedIngredientDiff || 0));
      const inlineActionsHtml = isLastSection
        ? `
          <div class="new-order-checkout-inline-actions">
            <span class="new-order-checkout-block-total">${escapeHtml(toMoney(blockSelection.total))}</span>
            <button type="button" class="new-order-checkout-add-to-cart-btn" data-action="checkout-block-add" data-block-id="${block.id}">
              Добавить в корзину
            </button>
          </div>
        `
        : "";
      const variantsHtml = `
        <div class="new-order-checkout-variants-wrap ${selectedVariantChips.length ? "" : "is-empty"} ${isLastSection ? "has-inline-actions" : ""}">
          <div class="new-order-checkout-variants-price">${priceToShow > 0 ? escapeHtml(toMoney(priceToShow)) : ""}</div>
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
                <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-move-up" data-block-id="${block.id}" aria-label="Сдвинуть блок вверх" title="Сдвинуть вверх">
                  <i class="fas fa-chevron-up"></i>
                </button>
              ` : ""}
              ${blockIndex < blocks.length - 1 ? `
                <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-move-down" data-block-id="${block.id}" aria-label="Сдвинуть блок вниз" title="Сдвинуть вниз">
                  <i class="fas fa-chevron-down"></i>
                </button>
              ` : ""}
              <button type="button" class="new-order-checkout-block-action-btn new-order-checkout-block-drag-handle" data-action="checkout-block-drag-handle" data-block-id="${block.id}" aria-label="Перетащить блок" title="Перетащить блок" draggable="true">
                <i class="fas fa-grip-lines"></i>
              </button>
              <button type="button" class="new-order-checkout-block-action-btn" data-action="checkout-block-edit" data-block-id="${block.id}" aria-label="Изменить блок" title="Изменить блок">
                <i class="fas fa-pen"></i>
              </button>
              <button type="button" class="new-order-checkout-block-action-btn is-danger" data-action="checkout-block-delete" data-block-id="${block.id}" aria-label="Удалить блок" title="Удалить блок">
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
      const cached = readCategoryProductsCache(cid);
      if (Array.isArray(cached)) {
        const activeCached = cached.filter((p) => Number(p?.is_active || 0) === 1 && isSiteVisibleProduct(p));
        state.checkoutCategoryProducts.set(cid, activeCached);
        allProducts.push(...activeCached);
        return;
      }
      missingIds.push(cid);
    });

    await Promise.all(missingIds.map(async (categoryId) => {
      try {
        const json = await apiJson(`/api/prod_products?category_id=${encodeURIComponent(String(categoryId))}&list=1`);
        const source = Array.isArray(json?.data) ? json.data : [];
        const active = source.filter((p) => Number(p?.is_active || 0) === 1 && isSiteVisibleProduct(p));
        state.checkoutCategoryProducts.set(categoryId, active);
        writeCategoryProductsCache(categoryId, source);
        allProducts.push(...active);
      } catch {
        state.checkoutCategoryProducts.set(categoryId, []);
      }
    }));
    await loadVariantsForProducts(allProducts);
    await loadIngredientsForProducts(allProducts);
    state.checkoutIngredientsPopoverKey = null;
    state.checkoutIngredientsPopoverPos = null;

    renderCheckoutEditorContent();
  }

  async function loadCheckoutDraftFromApi() {
    const cached = readDraftCache();
    if (cached && Array.isArray(cached.blocks)) {
      state.checkoutSavedDraft = { blocks: cached.blocks };
      return;
    }
    const json = await apiJson("/api/checkout-constructor/draft");
    const blocks = Array.isArray(json?.data?.blocks) ? json.data.blocks : [];
    const normalized = blocks.map(normalizeBlock).filter(Boolean);
    state.checkoutSavedDraft = { blocks: normalized };
    writeDraftCache(normalized);
  }

  async function saveCheckoutDraftToApi(sourceDraft) {
    const payload = toCheckoutBlocksPayload(Array.isArray(sourceDraft?.blocks) ? sourceDraft.blocks : []);
    await apiJson("/api/checkout-constructor/draft", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    writeDraftCache(payload.blocks);
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

  function escapeHtml(value) {
    return String(value || "")
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

  function getPriceRoundingSettings() {
    const tenant = getTenantFromStorage();
    const modeRaw = tenant?.price_rounding_mode;
    const mode = typeof modeRaw === "string" ? modeRaw : "none";
    const allowed = new Set(["none", "down", "up", "nearest"]);
    const safeMode = allowed.has(mode) ? mode : "none";
    const precisionRaw = Number(tenant?.price_rounding_precision);
    const precision = precisionRaw === 0 ? 0 : 2;
    return { mode: safeMode, precision };
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
    if (item.price != null && Number.isFinite(Number(item.price))) return Number(item.price);
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
        const json = await apiJson(`/api/prod_products/${pid}`);
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
    for (const entry of byGroup.values()) {
      const selections = Array.isArray(entry?.items) ? entry.items : [];
      for (const s of selections) {
        const qty = Math.max(0, Number(s?.qty || 0));
        const basePrice = Number(s?.basePrice || 0);
        const variantDiff = Number(s?.variantDiff || 0);
        total += (basePrice + variantDiff) * qty;
      }
    }
    return total;
  }

  function getProductPhoto(product) {
    if (Array.isArray(product?.photos) && product.photos.length) return String(product.photos[0] || "").trim();
    if (Array.isArray(product?.photos_json) && product.photos_json.length) return String(product.photos_json[0] || "").trim();
    if (typeof product?.photos_json === "string" && product.photos_json.trim()) {
      try {
        const parsed = JSON.parse(product.photos_json);
        if (Array.isArray(parsed) && parsed.length) return String(parsed[0] || "").trim();
      } catch {}
    }
    return "";
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
      <span class="stage-meta stage-text"><b>Экран оформления</b></span>
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
        <span class="stage-meta stage-text"><b>${escapeHtml(cat.title || "Категория")}</b></span>
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
        productsEmptyEl.textContent = "Товаров в категории пока нет";
        productsEmptyEl.classList.remove("hidden");
      }
      return;
    }
    if (productsEmptyEl) productsEmptyEl.classList.add("hidden");

    const restoreQueue = [];
    list.forEach((product) => {
      const pid = Number(product?.id || 0);
      const qty = Number(state.quantities.get(pid) || 0);
      const photoUrl = getProductPhoto(product);
      const selectedIndex = Number(state.selectedVariants.get(pid));
      const variants = state.productVariants.get(pid) || [];
      const ingredientDiff = calculateIngredientPriceDiff(pid);
      const optionDiff = calculateOptionPriceDiff(pid);
      const price = roundPrice(getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.price || 0)) + ingredientDiff + optionDiff);
      const oldPrice = roundPrice(getVariantUnitPriceByBase(product, variants, selectedIndex, Number(product?.old_price || 0)) + ingredientDiff + optionDiff);
      const hasOldPrice = Number.isFinite(oldPrice) && oldPrice > 0 && oldPrice > price;
      const variantChips = getVariantChipsForProduct(pid);
      const ingredientRows = getIngredientRowsForProduct(pid);
      const optionRows = getOptionRowsForProduct(pid);

      const card = document.createElement("article");
      card.className = "new-order-product-card";
      card.setAttribute("data-product-id", String(pid));
      card.innerHTML = `
        <div class="new-order-product-photo-wrap">
          ${photoUrl ? `<img class="new-order-product-photo" src="${escapeHtml(photoUrl)}" alt="" />` : `<div class="new-order-product-photo-placeholder"><i class="fas fa-image\"></i></div>`}
        </div>
        <div class="new-order-product-main">
          <div class="new-order-product-title" title="${escapeHtml(product?.name || "Товар")}">${escapeHtml(product?.name || "Товар")}</div>
          ${variantChips.length ? `<div class="new-order-product-variants no-scrollbar">${variantChips.map((chip) => `<button class="new-order-variant-chip${chip.isSelected ? " is-selected" : ""}" type="button" data-action="variant-select" data-variant-index="${chip.index}" title="${escapeHtml(chip.label)}">${escapeHtml(chip.label)}</button>`).join("")}</div>` : ""}
          ${ingredientRows.length ? `<div class="new-order-ingredients">${ingredientRows.join("")}</div>` : ""}
        </div>
        ${optionRows.length ? `<div class="new-order-options">${optionRows.join("")}</div>` : ""}
        <div class="new-order-product-bottom">
          <div class="qty-pill qty-pill--muted" data-qty-wrap>
            <button class="qty-pill__btn qty-pill__btn--minus" type="button" data-action="qty-minus">−</button>
            <span class="qty-pill__center" data-qty-value>${qty}</span>
            <button class="qty-pill__btn qty-pill__btn--plus" type="button" data-action="qty-plus">+</button>
          </div>
          <button class="new-order-add-btn" type="button" title="Добавить в заказ">
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
      const title = String(group?.title || "Опция").trim();
      const selected = selectedByGroup.get(groupId);
      const selectedItems = Array.isArray(selected?.items) ? selected.items : [];
      let selectedLabel = "";
      if (selectedItems.length === 1) selectedLabel = String(selectedItems[0]?.label || "").trim();
      else if (selectedItems.length > 1) selectedLabel = `Выбрано: ${selectedItems.length}`;
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
          <button class="new-order-option-tile new-order-option-tile--add" type="button" data-action="option-open" data-group-id="${groupId}" title="Добавить опцию">
            <span class="new-order-option-add-plus">+</span>
          </button>
        `
        : renderItems.length
        ? renderItems.map((item) => {
            const itemId = Number(item?.id || 0);
            const isSelected = selectedIds.has(itemId);
            const name = String(item?.name || item?.product_name || "Позиция");
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
            <span class="new-order-option-tile-name">${selectedLabel ? escapeHtml(selectedLabel) : "Выбрать"}</span>
            <span class="new-order-option-tile-edit">Изменить &gt;</span>
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
      return normalized;
    } catch {
      const fallback = { group: null, items: [] };
      state.optionGroupDetails.set(gid, fallback);
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
          <div class="new-order-option-sheet-title" id="newOrderOptionOverlayTitle">Опция</div>
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
          <div class="new-order-option-sheet-title" id="newOrderCheckoutCategoriesOverlayTitle">Категории</div>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar" id="newOrderCheckoutCategoriesOverlayList"></div>
        <div class="new-order-checkout-categories-footer">
          <label class="new-order-right-form-field">
            <input id="newOrderCheckoutBlockTitleInput" class="control" type="text" placeholder="Название блока" maxlength="120" />
          </label>
          <label class="switch new-order-checkout-categories-switch">
            <input id="newOrderCheckoutRequireAllInput" class="switch-input" type="checkbox" checked />
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text">Обязательно выбирать все товары</span>
          </label>
          <div class="new-order-checkout-categories-actions">
          <button class="new-order-checkout-categories-action-btn is-save" type="button" id="newOrderCheckoutCategoriesSaveBtn">Сохранить</button>
          <button class="new-order-checkout-categories-action-btn is-cancel" type="button" id="newOrderCheckoutCategoriesCancelBtn">Отмена</button>
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

    title.textContent = "Категории";
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
        list.innerHTML = `<div class="new-order-option-sheet-empty">Нет доступных категорий</div>`;
        return;
      }

      list.innerHTML = rows.map((cat) => {
        const name = String(cat?.title || "Категория");
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

    title.textContent = String(fallbackTitle || "Опция");
    list.innerHTML = `<div class="new-order-option-sheet-empty">Загрузка...</div>`;
    backdrop.classList.remove("hidden");

    const details = await loadOptionGroupDetails(gid);
    const group = details?.group || null;
    const sheetTitle = String(group?.title || fallbackTitle || "Опция");
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
        list.innerHTML = `<div class="new-order-option-sheet-empty">В этой опции нет позиций</div>`;
        return;
      }
      list.innerHTML = items.map((item) => {
        const itemId = Number(item?.id || 0);
        const selected = selById.get(itemId);
        const selectedQty = Math.max(0, Number(selected?.qty || 0));
        const isSelected = selectedQty > 0;
        const photos = Array.isArray(item?.product_photos_json) ? item.product_photos_json : [];
        const photo = photos.length ? String(photos[0] || "").trim() : "";
        const name = String(item?.name || item?.product_name || "Позиция");
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
      const name = String(item?.name || item?.product_name || "Позиция");
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

  function getVariantChipsForProduct(productId) {
    const groups = state.productVariants.get(Number(productId));
    if (!Array.isArray(groups) || !groups.length) return [];

    const chips = [];
    const selectedIndex = Number(state.selectedVariants.get(Number(productId)));
    for (const group of groups) {
      const values = Array.isArray(group?.values) ? group.values : [];
      const defaultIndex = Number.isFinite(Number(group?.default_value_index)) ? Number(group.default_value_index) : -1;
      const unit = String(group?.unit_short_title || group?.unit_title || group?.unit_code || "").trim();
      values.forEach((value, index) => {
        const label = toVariantLabel(value);
        if (!label) return;
        chips.push({
          label: unit ? `${label} ${unit}` : label,
          index,
          isSelected: Number.isFinite(selectedIndex) ? index === selectedIndex : index === defaultIndex,
        });
      });
    }
    return chips.slice(0, 60);
  }

  async function loadVariantsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);

    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productVariants.has(id));
    if (!missingIds.length) return;

    await Promise.all(
      missingIds.map(async (id) => {
        try {
          const json = await apiJson(`/api/admin/products/${id}/variants`);
          const variants = Array.isArray(json?.data) ? json.data : [];
          state.productVariants.set(id, variants);
          if (!state.selectedVariants.has(id) && variants.length) {
            const values = Array.isArray(variants[0]?.values) ? variants[0].values : [];
            const rawDefault = variants[0]?.default_value_index != null ? Number(variants[0].default_value_index) : 0;
            const safeDefault = Number.isFinite(rawDefault) && rawDefault >= 0 && rawDefault < values.length ? rawDefault : 0;
            state.selectedVariants.set(id, safeDefault);
          }
        } catch {
          state.productVariants.set(id, []);
        }
      })
    );
  }

  async function loadIngredientsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productIngredients.has(id));
    if (!missingIds.length) return;

    try {
      const json = await apiJson("/api/public/products/batch/ingredients", {
        method: "POST",
        body: JSON.stringify({ ids: missingIds }),
      });
      const data = json && typeof json.data === "object" && json.data ? json.data : {};

      missingIds.forEach((id) => {
        const list = Array.isArray(data[String(id)]) ? data[String(id)] : [];
        state.productIngredients.set(id, list);
        if (!state.ingredientStateByProduct.has(id)) {
          const qtyMap = new Map();
          list.forEach((ing) => {
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
          state.ingredientStateByProduct.set(id, qtyMap);
        }
      });
    } catch {
      missingIds.forEach((id) => {
        state.productIngredients.set(id, []);
      });
    }
  }

  async function loadOptionsForProducts(products) {
    const ids = (Array.isArray(products) ? products : [])
      .map((p) => Number(p?.id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    const uniqueIds = [...new Set(ids)];
    const missingIds = uniqueIds.filter((id) => !state.productOptionGroups.has(id));
    if (!missingIds.length) return;
    try {
      const json = await apiJson("/api/public/products/batch/option-assignments", {
        method: "POST",
        body: JSON.stringify({ ids: missingIds }),
      });
      const data = json && typeof json.data === "object" && json.data ? json.data : {};
      missingIds.forEach((id) => {
        const rows = Array.isArray(data[String(id)]) ? data[String(id)] : [];
        state.productOptionGroups.set(id, rows);
      });
    } catch {
      missingIds.forEach((id) => {
        state.productOptionGroups.set(id, []);
      });
    }
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
  }

  async function loadProductsForCategory(categoryId) {
    if (!Number.isFinite(Number(categoryId))) return;
    try {
      productsGridEl.innerHTML = "";
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Загрузка товаров...";
        productsEmptyEl.classList.remove("hidden");
      }
      const json = await apiJson(`/api/prod_products?category_id=${encodeURIComponent(String(categoryId))}&list=1`);
      const source = Array.isArray(json.data) ? json.data : [];
      const activeOnly = source.filter((p) => Number(p?.is_active || 0) === 1 && isSiteVisibleProduct(p));
      state.currentProducts = activeOnly;
      await loadVariantsForProducts(activeOnly);
      await loadIngredientsForProducts(activeOnly);
      await loadOptionsForProducts(activeOnly);
      await loadOptionDetailsForProducts(activeOnly);
      renderProducts(activeOnly);
    } catch (e) {
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Ошибка загрузки товаров";
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
      renderCategories();
      renderMainContentMode();
      loadProductsForCategory(cid);
    });

    if (rightContentEl) {
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

      rightContentEl.addEventListener("click", (e) => {
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
            const variant = item?.variant && typeof item.variant === "object" ? { ...item.variant } : {};
            const values = Array.isArray(variant?.values) ? variant.values : [];
            if (!values.length || variantIndex >= values.length) return;
            variant.selected_index = variantIndex;
            variant.label = String(values[variantIndex] || "").trim();
            item.variant = variant;
          }
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          form.cartItems = cartItems;
          state.rightOrders[orderIndex] = { ...order, form };
          renderRightOrderTabs();
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
          const currentQty = Math.max(1, Number(item?.qty || 1));
          const nextQty = action === "right-cart-qty-plus"
            ? currentQty + 1
            : Math.max(0, currentQty - 1);
          if (nextQty === currentQty) return;
          if (nextQty <= 0) {
            cartItems.splice(itemIndex, 1);
            form.cartItems = cartItems;
            state.rightOrders[orderIndex] = { ...order, form };
            renderRightOrderTabs();
            return;
          }
          item.qty = nextQty;
          cartItems[itemIndex] = recalculateCartItemTotals(item);
          form.cartItems = cartItems;
          state.rightOrders[orderIndex] = { ...order, form };
          renderRightOrderTabs();
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

          if (rowKind === "combo") {
            const sections = Array.isArray(item.sections)
              ? item.sections.map((section) => ({ ...section, variant: section?.variant && typeof section.variant === "object" ? { ...section.variant } : {} }))
              : [];
            const safeSectionIndex = Number.isFinite(sectionIndex) ? sectionIndex : 0;
            if (safeSectionIndex < 0 || safeSectionIndex >= sections.length) return;
            sections.splice(safeSectionIndex, 1);
            if (!sections.length) {
              cartItems.splice(itemIndex, 1);
            } else {
              if (sections.length === 1) {
                const single = sections[0] || {};
                const nextItem = {
                  ...item,
                  type: "product",
                  name: String(single?.product_name || item?.name || "Товар"),
                  photos: [String(single?.photo_url || "")].filter(Boolean),
                  ingredients: Array.isArray(single?.ingredients) ? single.ingredients.map((ing) => ({ ...ing })) : [],
                  variant: single?.variant && typeof single.variant === "object"
                    ? { ...single.variant }
                    : { label: "" },
                  pricing: single?.pricing && typeof single.pricing === "object"
                    ? { ...single.pricing }
                    : null,
                };
                delete nextItem.sections;
                cartItems[itemIndex] = recalculateCartItemTotals(nextItem);
              } else {
                item.sections = sections;
                item.photos = sections.map((section) => String(section?.photo_url || "")).filter(Boolean).slice(0, 4);
                cartItems[itemIndex] = recalculateCartItemTotals(item);
              }
            }
          } else {
            cartItems.splice(itemIndex, 1);
          }

          form.cartItems = cartItems;
          state.rightOrders[orderIndex] = { ...order, form };
          renderRightOrderTabs();
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
          form.cartItems = cartItems;
          state.rightOrders[orderIndex] = { ...order, form };
          renderRightOrderTabs();
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

      rightContentEl.addEventListener("input", (e) => {
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
          const total = Math.max(0, roundPrice(getCheckoutCurrentTotal()));
          const minAllowed = total + 1;
          const numeric = Number(String(input.value || "").replace(/[^\d]/g, ""));
          if (!Number.isFinite(numeric) || numeric <= 0) {
            input.setCustomValidity("");
          } else if (numeric < minAllowed) {
            input.setCustomValidity(`Минимальная сумма: ${minAllowed}`);
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

      rightContentEl.addEventListener("keydown", (e) => {
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

      rightContentEl.addEventListener("focusin", (e) => {
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

      rightContentEl.addEventListener(
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
      if (!state.rightOpenSelect) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && (target.closest(".new-order-right-select-wrap") || target.closest(".new-order-right-calendar") || target.closest("[data-action='right-select-toggle']"))) return;
      state.rightOpenSelect = null;
      renderRightOrderTabs();
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
            alert("Не удалось сохранить черновик экрана оформления");
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
            const wasActive = Number(state.rightActiveOrderId || 0) === orderId;
            state.rightOrders.splice(idx, 1);
            if (!state.rightOrders.length) {
              state.rightActiveOrderId = null;
            } else if (wasActive) {
              const next = state.rightOrders[idx] || state.rightOrders[idx - 1] || state.rightOrders[0];
              state.rightActiveOrderId = Number(next?.id || 0) || null;
            }
            state.rightOpenSelect = null;
            closeRightAddressOverlay();
            renderRightOrderTabs();
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
        openRightNewOrderTab();
      });
    }

    productsGridEl.addEventListener("click", (e) => {
      const actionBtn = e.target.closest("[data-action]");
      if (!actionBtn) return;
      const card = e.target.closest("[data-product-id]");
      if (!card) return;
      const pid = Number(card.getAttribute("data-product-id") || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      const action = actionBtn.getAttribute("data-action") || "";
      if (action === "variant-select") {
        const variantIndex = Number(actionBtn.getAttribute("data-variant-index"));
        if (!Number.isFinite(variantIndex) || variantIndex < 0) return;
        state.selectedVariants.set(pid, variantIndex);
        renderProducts(state.currentProducts);
        return;
      }
      if (action === "option-open") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const block = actionBtn.closest(".new-order-option-block");
        const titleEl = block ? block.querySelector(".new-order-option-title") : null;
        const title = titleEl ? titleEl.textContent : "Опция";
        void openOptionOverlay(pid, groupId, title);
        return;
      }
      if (action === "option-quick-toggle") {
        const groupId = Number(actionBtn.getAttribute("data-group-id") || 0);
        const itemId = Number(actionBtn.getAttribute("data-item-id") || 0);
        const applied = applyQuickMultiOptionToggle(pid, groupId, itemId);
        if (!applied) {
          const block = actionBtn.closest(".new-order-option-block");
          const titleEl = block ? block.querySelector(".new-order-option-title") : null;
          const title = titleEl ? titleEl.textContent : "Опция";
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
          const title = titleEl ? titleEl.textContent : "Опция";
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
          const title = titleEl ? titleEl.textContent : "Опция";
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
      const currentQty = Number(state.quantities.get(pid) || 0);
      const nextQty = action === "qty-plus" ? currentQty + 1 : Math.max(0, currentQty - 1);
      state.quantities.set(pid, nextQty);
      const qtyEl = card.querySelector("[data-qty-value]");
      if (qtyEl) qtyEl.textContent = String(nextQty);
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

  async function load() {
    try {
      await loadUnitConversions();
      await loadRightDeliveryTypes();
      await loadRightPaymentTypes();
      await loadRightTimeOptions();
      await loadRightPickupStores();
      try {
        await loadCheckoutDraftFromApi();
      } catch {
        state.checkoutSavedDraft = { blocks: [] };
      }
      const json = await apiJson("/api/prod_categories");
      const source = Array.isArray(json.data) ? json.data : [];
      state.productCategories = source
        .filter((c) => Number(c?.is_active || 0) === 1)
        .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));
      state.categories = source
        .filter((c) => Number(c?.is_active || 0) === 1 && isCheckoutVisible(c))
        .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));

      state.activeCategoryId = CHECKOUT_SCREEN_ID;
      renderCategories();

      if (String(state.activeCategoryId) === CHECKOUT_SCREEN_ID) {
        await loadCheckoutProductsForSelectedCategories();
      } else if (state.activeCategoryId) {
        await loadProductsForCategory(state.activeCategoryId);
      } else if (productsEmptyEl) {
        productsEmptyEl.textContent = "Нет доступных категорий";
        productsEmptyEl.classList.remove("hidden");
      }
      renderMainContentMode();
      renderRightOrderTabs();
    } catch (e) {
      if (categoriesEmptyEl) {
        categoriesEmptyEl.textContent = "Ошибка загрузки категорий";
        categoriesEmptyEl.classList.remove("hidden");
      }
      if (productsEmptyEl) {
        productsEmptyEl.textContent = "Ошибка загрузки";
        productsEmptyEl.classList.remove("hidden");
      }
      renderMainContentMode();
      renderRightOrderTabs();
    }
  }

  bindEvents();
  load();
})();
