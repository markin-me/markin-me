(function () {
  const MODAL_ID = "adminBenefitsOverlay";
  const TITLE_ID = "adminBenefitsTitle";
  const BODY_ID = "adminBenefitsBody";
  const BACK_ID = "adminBenefitsBackBtn";
  const CLOSE_ID = "adminBenefitsCloseBtn";
  const TOGGLE_ID = "adminBenefitsModeToggle";

  const state = {
    handlers: {
      onClose: null,
      onBack: null,
      onModeChange: null,
    },
  };

  function ensure() {
    if (document.getElementById(MODAL_ID)) return;
    const wrap = document.createElement("div");
    wrap.id = MODAL_ID;
    wrap.className = "new-order-option-overlay hidden";
    wrap.innerHTML = `
      <div class="new-order-option-sheet new-order-benefits-sheet">
        <div class="new-order-option-sheet-head new-order-benefits-head">
          <div class="new-order-benefits-head-top">
            <button class="new-order-option-sheet-back hidden" type="button" id="${BACK_ID}" aria-label="Назад">
              <i class="fas fa-arrow-left"></i>
            </button>
            <div class="new-order-option-sheet-title" id="${TITLE_ID}">Выгоды</div>
            <button class="new-order-option-sheet-back" type="button" id="${CLOSE_ID}" aria-label="Закрыть">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div class="shop-delivery-toggle new-order-benefits-mode-toggle" id="${TOGGLE_ID}" aria-label="Режим выгод">
            <button class="shop-delivery-toggle-btn is-active" type="button" data-mode="customer" aria-pressed="true">Скидки клиента</button>
            <button class="shop-delivery-toggle-btn" type="button" data-mode="all" aria-pressed="false">Все акции</button>
          </div>
        </div>
        <div class="new-order-option-sheet-list no-scrollbar new-order-benefits-body" id="${BODY_ID}"></div>
      </div>
    `;
    document.body.appendChild(wrap);

    wrap.addEventListener("click", (event) => {
      if (event.target !== wrap) return;
      if (typeof state.handlers.onClose === "function") {
        state.handlers.onClose();
      }
    });

    const closeBtn = document.getElementById(CLOSE_ID);
    if (closeBtn) {
      closeBtn.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof state.handlers.onClose === "function") {
          state.handlers.onClose();
        }
      });
    }

    const backBtn = document.getElementById(BACK_ID);
    if (backBtn) {
      backBtn.addEventListener("click", (event) => {
        event.preventDefault();
        if (typeof state.handlers.onBack === "function") {
          state.handlers.onBack();
        }
      });
    }

    const modeToggle = document.getElementById(TOGGLE_ID);
    if (modeToggle) {
      modeToggle.addEventListener("click", (event) => {
        const target = event.target instanceof Element
          ? event.target.closest(".shop-delivery-toggle-btn[data-mode]")
          : null;
        if (!target) return;
        event.preventDefault();
        if (typeof state.handlers.onModeChange === "function") {
          state.handlers.onModeChange(String(target.getAttribute("data-mode") || "").trim() || "customer");
        }
      });
    }
  }

  function getElements() {
    return {
      backdrop: document.getElementById(MODAL_ID),
      title: document.getElementById(TITLE_ID),
      body: document.getElementById(BODY_ID),
      backBtn: document.getElementById(BACK_ID),
      closeBtn: document.getElementById(CLOSE_ID),
      modeToggle: document.getElementById(TOGGLE_ID),
    };
  }

  function normalizeMode(value) {
    return String(value || "").trim().toLowerCase() === "all" ? "all" : "customer";
  }

  function setModeToggleState(mode) {
    const { modeToggle } = getElements();
    if (!modeToggle) return;
    const activeMode = normalizeMode(mode);
    Array.from(modeToggle.querySelectorAll(".shop-delivery-toggle-btn[data-mode]")).forEach((button) => {
      const buttonMode = normalizeMode(button.getAttribute("data-mode") || "customer");
      const isActive = buttonMode === activeMode;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function show(config = {}) {
    ensure();
    state.handlers.onClose = typeof config.onClose === "function" ? config.onClose : null;
    state.handlers.onBack = typeof config.onBack === "function" ? config.onBack : null;
    state.handlers.onModeChange = typeof config.onModeChange === "function" ? config.onModeChange : null;

    const { backdrop, title, body, backBtn, modeToggle } = getElements();
    if (!backdrop || !title || !body) return;
    backdrop.classList.remove("hidden");
    title.textContent = String(config.title || "Выгоды");
    backBtn.classList.toggle("hidden", config.showBack !== true);
    modeToggle.classList.toggle("hidden", config.showModeToggle === false);
    setModeToggleState(config.mode || "customer");
    if (config.clearBody !== false) body.innerHTML = "";
  }

  function hide() {
    const { backdrop, body } = getElements();
    if (backdrop) backdrop.classList.add("hidden");
    if (body) body.innerHTML = "";
    state.handlers.onClose = null;
    state.handlers.onBack = null;
    state.handlers.onModeChange = null;
  }

  function formatDate(value) {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleDateString("ru-RU");
  }

  function isCompletedDiscountBenefit(item, { sourceResolver } = {}) {
    const resolveSource = typeof sourceResolver === "function"
      ? sourceResolver
      : ((entry) => String(entry?.source || "").trim().toLowerCase());
    const source = resolveSource(item);
    return (source === "discount" || source === "reward_discount")
      && String(item?.disabled_reason_code || "").trim().toUpperCase() === "DISCOUNT_CUSTOMER_LIMIT_REACHED";
  }

  function isCompletedPromoBenefit(item, { sourceResolver } = {}) {
    const resolveSource = typeof sourceResolver === "function"
      ? sourceResolver
      : ((entry) => String(entry?.source || "").trim().toLowerCase());
    if (resolveSource(item) !== "promo_code") return false;
    const disabledReasonCode = String(item?.disabled_reason_code || "").trim().toUpperCase();
    if (disabledReasonCode === "PROMO_CUSTOMER_LIMIT_REACHED") return true;
    if (disabledReasonCode !== "PROMO_LIMIT_REACHED") return false;
    const usagePerCustomer = Number(item?.usage_per_customer || 0);
    const customerUsageCount = Number(item?.customer_usage_count || 0);
    return usagePerCustomer > 0 && customerUsageCount >= usagePerCustomer;
  }

  function buildCompletedDiscountCard(item) {
    return {
      ...(item && typeof item === "object" ? item : {}),
      id: Number(item?.id || 0) || null,
      kind: "completed",
      source_kind: "discount",
      title: String(item?.title || "").trim() || "Скидка",
      description: String(item?.description || "").trim(),
      badge_text: String(item?.badge_text || "").trim(),
      status_text: "Завершён",
      completed_reason_text: String(item?.disabled_reason || "").trim(),
      apply_scope_text: String(item?.apply_scope_text || "").trim(),
      expires_at: item?.expires_at || null,
      completed_at: item?.completed_at || null,
    };
  }

  function buildCompletedPromoCard(item) {
    const code = String(item?.code || "").trim();
    const promoTitle = String(item?.title || "").trim();
    const description = promoTitle && code && promoTitle !== code
      ? promoTitle
      : String(item?.description || "").trim();
    return {
      ...(item && typeof item === "object" ? item : {}),
      id: Number(item?.id || 0) || null,
      kind: "completed",
      source_kind: "promo_code",
      title: code || promoTitle || "Промокод",
      description,
      badge_text: String(item?.badge_text || "").trim(),
      status_text: "Завершён",
      completed_reason_text: String(item?.disabled_reason || "").trim(),
      apply_scope_text: String(item?.apply_scope_text || "").trim(),
      expires_at: item?.expires_at || null,
      completed_at: item?.completed_at || null,
    };
  }

  function buildRenderData(previewData, options = {}) {
    const data = previewData && typeof previewData === "object" ? previewData : {};
    const mode = normalizeMode(options.mode || data?.mode);
    const discountsRaw = Array.isArray(data?.discounts) ? data.discounts.slice() : [];
    const promosRaw = Array.isArray(data?.promo_codes) ? data.promo_codes.slice() : [];
    const completed = Array.isArray(data?.completed) ? data.completed.slice() : [];
    const discounts = [];
    const promoCodes = [];
    const isCompletedDiscount = typeof options.isCompletedDiscount === "function"
      ? options.isCompletedDiscount
      : ((item) => isCompletedDiscountBenefit(item));
    const isCompletedPromo = typeof options.isCompletedPromo === "function"
      ? options.isCompletedPromo
      : ((item) => isCompletedPromoBenefit(item));
    const mapCompletedDiscount = typeof options.mapCompletedDiscount === "function"
      ? options.mapCompletedDiscount
      : ((item) => buildCompletedDiscountCard(item));
    const mapCompletedPromo = typeof options.mapCompletedPromo === "function"
      ? options.mapCompletedPromo
      : ((item) => buildCompletedPromoCard(item));
    const giftVisibility = typeof options.giftVisibility === "function"
      ? options.giftVisibility
      : (() => true);

    discountsRaw.forEach((item) => {
      if (mode !== "all" && isCompletedDiscount(item)) {
        completed.push(mapCompletedDiscount(item));
        return;
      }
      discounts.push(item);
    });

    promosRaw.forEach((item) => {
      if (mode !== "all" && isCompletedPromo(item)) {
        completed.push(mapCompletedPromo(item));
        return;
      }
      promoCodes.push(item);
    });

    return {
      mode,
      discounts,
      promo_codes: promoCodes,
      gifts: (Array.isArray(data?.gifts) ? data.gifts : []).filter((item) => giftVisibility(item)),
      progress: Array.isArray(data?.progress) ? data.progress : [],
      completed,
    };
  }

  function createSection(title, emptyText, opts = {}) {
    const section = document.createElement("section");
    section.className = "shop-checkout-benefits-section";

    const head = document.createElement("div");
    head.className = "shop-checkout-benefits-section-head";

    const titleEl = document.createElement("div");
    titleEl.className = "shop-checkout-benefits-section-title";
    titleEl.textContent = title;
    head.appendChild(titleEl);

    const countEl = document.createElement("div");
    countEl.className = "shop-checkout-benefits-section-count";
    countEl.textContent = "0";
    head.appendChild(countEl);
    section.appendChild(head);

    const list = document.createElement("div");
    list.className = "shop-checkout-benefits-list";
    if (opts?.horizontal === true) {
      list.classList.add("shop-checkout-benefits-list--horizontal", "is-gifts");
    }
    section.appendChild(list);

    const empty = document.createElement("div");
    empty.className = "shop-profile-card shop-checkout-benefits-empty hidden";
    empty.textContent = emptyText;
    section.appendChild(empty);

    return { section, list, countEl, empty };
  }

  function setSectionItems(sectionRef, items, renderItem) {
    if (!sectionRef?.list || !sectionRef?.empty || !sectionRef?.countEl) return;
    const rows = Array.isArray(items) ? items : [];
    sectionRef.list.innerHTML = "";
    sectionRef.countEl.textContent = String(rows.length);
    sectionRef.empty.classList.toggle("hidden", rows.length > 0);
    rows.forEach((item) => {
      const node = typeof renderItem === "function" ? renderItem(item) : null;
      if (node) sectionRef.list.appendChild(node);
    });
  }

  function createIcon(iconClass) {
    const icon = document.createElement("i");
    icon.className = `fas ${iconClass}`;
    icon.setAttribute("aria-hidden", "true");
    return icon;
  }

  function getRewardIconName(kind) {
    const normalized = String(kind || "").trim().toLowerCase();
    if (normalized === "promo_code") return "fa-ticket-alt";
    if (normalized === "discount") return "fa-percent";
    return "fa-gift";
  }

  function bindCardActivation(card, handler) {
    if (!(card instanceof Element) || typeof handler !== "function") return;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.addEventListener("click", () => handler());
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handler();
    });
  }

  function renderDiscountCard(item, options = {}) {
    const isSelected = options.isSelected === true || item?.is_selected === true;
    const canToggle = options.canToggle === true;
    const onOpenDetails = typeof options.onOpenDetails === "function" ? options.onOpenDetails : null;
    const onAction = typeof options.onAction === "function" ? options.onAction : null;
    const card = document.createElement("div");
    card.className = "shop-profile-card shop-profile-discount-card shop-checkout-benefit-discount-card";
    if (isSelected) card.classList.add("is-selected");
    if (!canToggle && !isSelected) card.classList.add("is-disabled");
    if (onOpenDetails || (onAction && canToggle)) {
      bindCardActivation(card, () => {
        if (onOpenDetails) {
          onOpenDetails(item);
          return;
        }
        if (onAction && canToggle) {
          void onAction(item);
        }
      });
    }

    const head = document.createElement("div");
    head.className = "shop-checkout-benefit-card-head";
    const title = document.createElement("div");
    title.className = "shop-profile-discount-title";
    title.textContent = String(options.title || item?.title || "Скидка");
    head.appendChild(title);
    if (options.isStackable === true) {
      const meta = document.createElement("div");
      meta.className = "shop-checkout-benefit-discount-meta";
      const badge = document.createElement("span");
      badge.className = "shop-checkout-benefit-stackable-badge";
      badge.appendChild(createIcon("fa-link"));
      meta.appendChild(badge);
      head.appendChild(meta);
    }
    card.appendChild(head);

    const primaryRow = document.createElement("div");
    primaryRow.className = "shop-checkout-benefit-primary-row";
    const valueEl = document.createElement("div");
    valueEl.className = "shop-checkout-benefit-main-value";
    valueEl.textContent = String(options.valueText || item?.badge_text || "Скидка");
    primaryRow.appendChild(valueEl);

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "shop-checkout-benefit-apply-btn";
    actionBtn.textContent = isSelected ? "Выбрано" : String(options.actionLabel || "Применить");
    actionBtn.classList.add(isSelected ? "is-selected" : (canToggle ? "is-ready" : "is-conflict"));
    actionBtn.disabled = !canToggle || !onAction || options.isBusy === true;
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!onAction) return;
      void onAction(item);
    });
    primaryRow.appendChild(actionBtn);
    card.appendChild(primaryRow);

    const disabledReason = String(options.disabledReason || item?.disabled_reason || "").trim();
    if (disabledReason) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = disabledReason;
      card.appendChild(note);
    }
    return card;
  }

  function renderPromoCard(item, options = {}) {
    const normalizedCode = String(item?.code || "").trim();
    const isSelected = options.isSelected === true || item?.is_selected === true;
    const canToggle = options.canToggle === true;
    const actionLabel = String(options.actionLabel || "Применить");
    const onOpenDetails = typeof options.onOpenDetails === "function" ? options.onOpenDetails : null;
    const onAction = typeof options.onAction === "function" ? options.onAction : null;
    const card = document.createElement("div");
    card.className = "shop-profile-card shop-checkout-benefit-promo-card";
    if (isSelected) card.classList.add("is-selected");
    if (!canToggle && !isSelected) card.classList.add("is-disabled");
    if (onOpenDetails || (onAction && canToggle)) {
      bindCardActivation(card, () => {
        if (onOpenDetails) {
          onOpenDetails(item);
          return;
        }
        if (onAction && canToggle) {
          void onAction(item);
        }
      });
    }

    const head = document.createElement("div");
    head.className = "shop-checkout-benefit-card-head";
    const title = document.createElement("div");
    title.className = "shop-profile-discount-title";
    title.textContent = String(options.title || item?.title || "Промокод");
    head.appendChild(title);
    if (options.isStackable === true) {
      const meta = document.createElement("div");
      meta.className = "shop-checkout-benefit-discount-meta";
      const badge = document.createElement("span");
      badge.className = "shop-checkout-benefit-stackable-badge";
      badge.appendChild(createIcon("fa-link"));
      meta.appendChild(badge);
      head.appendChild(meta);
    }
    card.appendChild(head);

    const primaryRow = document.createElement("div");
    primaryRow.className = "shop-checkout-benefit-primary-row";
    const codeEl = document.createElement("div");
    codeEl.className = "shop-checkout-benefit-main-value is-code";
    codeEl.textContent = String(options.codeText || normalizedCode || "-");
    primaryRow.appendChild(codeEl);

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "shop-checkout-benefit-apply-btn";
    actionBtn.textContent = isSelected && actionLabel === "Применить" ? "Выбрано" : actionLabel;
    actionBtn.classList.add(isSelected && actionLabel === "Применить" ? "is-selected" : (canToggle ? "is-ready" : "is-conflict"));
    actionBtn.disabled = !canToggle || !onAction || options.isBusy === true;
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!onAction) return;
      void onAction(item);
    });
    primaryRow.appendChild(actionBtn);
    card.appendChild(primaryRow);

    const disabledReason = String(options.disabledReason || item?.disabled_reason || "").trim();
    if (disabledReason) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = disabledReason;
      card.appendChild(note);
    }
    return card;
  }

  function renderGiftCard(item, options = {}) {
    const titleText = String(options.titleText || item?.title || "").trim() || "Подарок";
    const photoUrl = String(options.photoUrl || item?.photo_url || "").trim();
    const onOpen = typeof options.onOpen === "function" ? options.onOpen : null;
    const onAction = typeof options.onAction === "function" ? options.onAction : null;
    const canExecute = options.canExecute === true;
    const isBusy = options.isBusy === true;
    const card = document.createElement("div");
    card.className = "shop-profile-card shop-checkout-benefit-gift-card";
    if (isBusy) card.classList.add("is-claim-loading");
    if (onOpen) {
      bindCardActivation(card, () => onOpen(item));
    }

    const media = document.createElement("div");
    media.className = "shop-checkout-benefit-gift-media";
    if (photoUrl) {
      const img = document.createElement("img");
      img.src = photoUrl;
      img.alt = titleText;
      media.appendChild(img);
    } else {
      media.appendChild(createIcon(getRewardIconName(options.rewardKind || "gift")));
    }
    card.appendChild(media);

    const title = document.createElement("div");
    title.className = "shop-checkout-benefit-gift-title";
    title.textContent = titleText;
    card.appendChild(title);

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "shop-checkout-benefit-gift-action";
    actionBtn.textContent = isBusy ? "Загрузка..." : String(options.actionLabel || "Получить");
    if (canExecute && !isBusy) actionBtn.classList.add("is-ready");
    actionBtn.disabled = !canExecute || !onAction || options.disableWhileBusy === true || isBusy;
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!onAction) return;
      void onAction(item);
    });
    card.appendChild(actionBtn);

    const disabledReason = String(options.disabledReason || "").trim();
    if (disabledReason) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = disabledReason;
      card.appendChild(note);
    }
    return card;
  }

  function renderProgressCard(item, options = {}) {
    const ratio = Math.max(0, Math.min(1, Number(options.ratio ?? item?.progress_ratio ?? 0)));
    const canAction = options.canAction === true;
    const isBusy = options.isBusy === true;
    const card = document.createElement("div");
    card.className = "shop-profile-card shop-profile-discount-card shop-checkout-benefit-progress-card";
    if (canAction) card.classList.add("is-claimable");
    if (item?.is_applicable === false) card.classList.add("is-disabled");
    if (typeof options.onOpenDetails === "function") {
      bindCardActivation(card, () => options.onOpenDetails(item));
    }

    const layout = document.createElement("div");
    layout.className = "shop-checkout-benefit-progress-layout";

    const rewardPane = document.createElement("div");
    rewardPane.className = "shop-checkout-benefit-progress-reward-pane";
    if (typeof options.renderRewardPane === "function") {
      const customPane = options.renderRewardPane(item);
      if (customPane) {
        rewardPane.appendChild(customPane);
      }
    } else {
      const rewardSlot = document.createElement("div");
      rewardSlot.className = "shop-checkout-benefit-progress-reward is-static";
      const rewardMedia = document.createElement("span");
      rewardMedia.className = "shop-checkout-benefit-progress-reward-media";
      const rewardPhoto = String(options.rewardPhotoUrl || item?.reward_preview?.photo_url || "").trim();
      if (rewardPhoto) {
        const img = document.createElement("img");
        img.src = rewardPhoto;
        img.alt = String(options.rewardTitle || item?.title || "Награда");
        rewardMedia.appendChild(img);
      } else {
        rewardMedia.appendChild(createIcon(getRewardIconName(options.rewardKind || item?.reward_kind || "gift")));
      }
      rewardSlot.appendChild(rewardMedia);
      rewardPane.appendChild(rewardSlot);
    }

    const actionBtn = document.createElement("button");
    actionBtn.type = "button";
    actionBtn.className = "shop-checkout-benefit-progress-claim";
    actionBtn.textContent = isBusy ? "Загрузка..." : String(options.actionLabel || "Забрать");
    if (canAction && !isBusy) actionBtn.classList.add("is-ready");
    actionBtn.disabled = !canAction || typeof options.onAction !== "function";
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (typeof options.onAction !== "function") return;
      void options.onAction(item);
    });
    rewardPane.appendChild(actionBtn);
    layout.appendChild(rewardPane);

    const main = document.createElement("div");
    main.className = "shop-checkout-benefit-progress-main";
    const titleWrap = document.createElement("div");
    titleWrap.className = "shop-profile-discount-header";
    const title = document.createElement("div");
    title.className = "shop-profile-discount-title";
    title.textContent = String(options.title || item?.title || "Накопление");
    titleWrap.appendChild(title);
    main.appendChild(titleWrap);

    const progressWrap = document.createElement("div");
    progressWrap.className = "shop-checkout-benefit-progress-wrap";
    if (typeof options.renderProgressVisual === "function") {
      const visual = options.renderProgressVisual(item);
      if (visual) {
        progressWrap.appendChild(visual);
      }
    }
    if (!progressWrap.children.length) {
      const amountLayout = document.createElement("div");
      amountLayout.className = "shop-checkout-benefit-progress-amount-layout";
      const amount = document.createElement("div");
      amount.className = "shop-checkout-benefit-progress-amount";
      const bar = document.createElement("div");
      bar.className = "shop-checkout-benefit-progress-bar";
      const fill = document.createElement("div");
      fill.className = "shop-checkout-benefit-progress-fill";
      fill.style.width = `${Math.round(ratio * 100)}%`;
      bar.appendChild(fill);
      amount.appendChild(bar);
      amountLayout.appendChild(amount);
      progressWrap.appendChild(amountLayout);
    }
    main.appendChild(progressWrap);
    layout.appendChild(main);
    card.appendChild(layout);

    const disabledReason = String(options.disabledReason || item?.disabled_reason || "").trim();
    if (disabledReason) {
      const note = document.createElement("div");
      note.className = "shop-checkout-benefit-disabled-reason";
      note.textContent = disabledReason;
      card.appendChild(note);
    }
    return card;
  }

  function renderDisplayCard(item, options = {}) {
    const card = document.createElement("div");
    card.className = "shop-profile-card shop-profile-discount-card shop-checkout-benefit-display-card";
    if (typeof options.onOpenDetails === "function") {
      bindCardActivation(card, () => options.onOpenDetails(item));
      card.setAttribute("aria-label", `Открыть детали: ${String(item?.title || "Выгода").trim() || "Выгода"}`);
    }

    const header = document.createElement("div");
    header.className = "shop-profile-discount-header";
    const title = document.createElement("div");
    title.className = "shop-profile-discount-title";
    title.textContent = String(item?.title || "Выгода");
    header.appendChild(title);
    const meta = document.createElement("div");
    meta.className = "shop-checkout-benefit-discount-meta";
    if (item?.badge_text) {
      const badge = document.createElement("span");
      badge.className = "sp-discount-badge";
      badge.textContent = String(item.badge_text);
      meta.appendChild(badge);
    }
    if (item?.status_text) {
      const status = document.createElement("span");
      status.className = "shop-checkout-benefit-status";
      status.textContent = String(item.status_text);
      meta.appendChild(status);
    }
    if (meta.children.length) header.appendChild(meta);
    card.appendChild(header);

    if (item?.description) {
      const desc = document.createElement("div");
      desc.className = "shop-profile-discount-desc";
      desc.textContent = String(item.description);
      card.appendChild(desc);
    }

    const details = document.createElement("div");
    details.className = "shop-profile-discount-details";
    const completedReasonText = String(item?.completed_reason_text || "").trim();
    if (completedReasonText) {
      const reasonLine = document.createElement("div");
      reasonLine.textContent = completedReasonText;
      details.appendChild(reasonLine);
    } else if (item?.apply_scope_text) {
      const scopeLine = document.createElement("div");
      scopeLine.textContent = String(item.apply_scope_text);
      details.appendChild(scopeLine);
    }
    const completedText = formatDate(item?.completed_at);
    if (completedText) {
      const line = document.createElement("div");
      line.textContent = `Завершено ${completedText}`;
      details.appendChild(line);
    }
    const expiresText = formatDate(item?.expires_at);
    if (expiresText) {
      const line = document.createElement("div");
      line.textContent = `До ${expiresText}`;
      details.appendChild(line);
    }
    if (details.children.length) card.appendChild(details);
    return card;
  }

  window.AdminBenefitsModal = {
    ensure,
    getElements,
    show,
    hide,
    normalizeMode,
    setModeToggleState,
    formatDate,
    isCompletedDiscountBenefit,
    isCompletedPromoBenefit,
    buildCompletedDiscountCard,
    buildCompletedPromoCard,
    buildRenderData,
    createSection,
    setSectionItems,
    createIcon,
    getRewardIconName,
    renderDiscountCard,
    renderPromoCard,
    renderGiftCard,
    renderProgressCard,
    renderDisplayCard,
  };
})();
