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

  function hide(options = {}) {
    const { backdrop, body } = getElements();
    if (backdrop) backdrop.classList.add("hidden");
    if (body && options.clearBody !== false) body.innerHTML = "";
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

  function createScrollableFrame(options = {}) {
    const useDetailFooter = options.detailFooter === true;
    const hasFooter = options.hasFooter === true || useDetailFooter;

    if (useDetailFooter) {
      const root = document.createElement("div");
      root.className = "shop-checkout-benefit-detail-content--with-footer admin-benefits-scroll-frame admin-benefits-scroll-frame--detail";

      const scrollEl = document.createElement("div");
      scrollEl.className = "shop-checkout-benefit-detail-scroll";
      root.appendChild(scrollEl);

      let footerEl = null;
      if (hasFooter) {
        footerEl = document.createElement("div");
        footerEl.className = "shop-checkout-benefit-detail-footer";
        root.appendChild(footerEl);
      }

      return { root, scrollEl, footerEl };
    }

    const root = document.createElement("div");
    root.className = "shop-checkout-benefits-modal-shell admin-benefits-scroll-frame";
    if (hasFooter) root.classList.add("has-footer");

    const scrollEl = document.createElement("div");
    scrollEl.className = "shop-checkout-benefits-modal-scroll";
    root.appendChild(scrollEl);

    let footerEl = null;
    if (hasFooter) {
      footerEl = document.createElement("div");
      footerEl.className = "shop-checkout-benefits-modal-footer";
      root.appendChild(footerEl);
    }

    return { root, scrollEl, footerEl };
  }

  function bindHorizontalTrack(track) {
    if (!track || track.dataset.progressTrackBound === "1") return;

    const dragThresholdPx = 8;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let isMouseDrag = false;
    let isDragging = false;
    let isVerticalIntent = false;
    let hasPointerCapture = false;
    let suppressClickUntil = 0;

    const hasOverflow = () => track.scrollWidth > track.clientWidth + 1;
    const isInteractiveTarget = (target) => {
      if (!(target instanceof Element)) return false;
      return Boolean(target.closest('button, a, input, textarea, select, label'));
    };
    const markSuppressClick = () => {
      suppressClickUntil = Date.now() + 280;
    };
    const finishPointer = (event) => {
      if (pointerId == null) return;
      if (event && event.pointerId !== pointerId) return;
      if (isMouseDrag || hasPointerCapture) {
        track.classList.remove("is-dragging");
        try {
          track.releasePointerCapture(pointerId);
        } catch {}
      }
      pointerId = null;
      isMouseDrag = false;
      isDragging = false;
      isVerticalIntent = false;
      hasPointerCapture = false;
    };

    track.addEventListener("pointerdown", (event) => {
      if (!event) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (!hasOverflow()) return;
      if (isInteractiveTarget(event.target)) return;
      pointerId = event.pointerId;
      startX = Number(event.clientX || 0);
      startY = Number(event.clientY || 0);
      startLeft = Number(track.scrollLeft || 0);
      isMouseDrag = event.pointerType === "mouse";
      isDragging = false;
      isVerticalIntent = false;
      hasPointerCapture = false;
      if (isMouseDrag) {
        track.classList.add("is-dragging");
        try {
          track.setPointerCapture(pointerId);
          hasPointerCapture = true;
        } catch {}
      }
    });

    track.addEventListener("pointermove", (event) => {
      if (pointerId == null || event.pointerId !== pointerId) return;
      const deltaX = Number(event.clientX || 0) - startX;
      const deltaY = Number(event.clientY || 0) - startY;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      if (!isMouseDrag && !isDragging && !isVerticalIntent) {
        if (absDeltaY >= dragThresholdPx && absDeltaY > absDeltaX) {
          isVerticalIntent = true;
          finishPointer(event);
          return;
        }
      }
      if (isVerticalIntent) return;
      if (!isDragging) {
        if (absDeltaX < dragThresholdPx) return;
        if (!isMouseDrag && absDeltaX <= absDeltaY) return;
        isDragging = true;
        track.classList.add("is-dragging");
        if (!isMouseDrag) {
          try {
            track.setPointerCapture(pointerId);
            hasPointerCapture = true;
          } catch {}
        }
      }
      markSuppressClick();
      event.preventDefault();
      track.scrollLeft = startLeft - deltaX;
    });

    track.addEventListener("pointerup", finishPointer);
    track.addEventListener("pointercancel", finishPointer);
    track.addEventListener("lostpointercapture", finishPointer);

    const handleWheel = (event) => {
      if (!hasOverflow()) return;
      const deltaX = Number(event.deltaX || event.wheelDeltaX || 0);
      const deltaY = Number(event.deltaY || (typeof event.wheelDelta === "number" ? -event.wheelDelta : 0) || 0);
      const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      if (!Number.isFinite(primaryDelta) || Math.abs(primaryDelta) < 0.5) return;
      const maxScrollLeft = Math.max(0, track.scrollWidth - track.clientWidth);
      const currentLeft = Number(track.scrollLeft || 0);
      const nextLeft = Math.max(0, Math.min(maxScrollLeft, currentLeft + primaryDelta));
      if (Math.abs(nextLeft - currentLeft) < 0.5) return;
      event.preventDefault();
      event.stopPropagation();
      markSuppressClick();
      track.scrollLeft = nextLeft;
    };

    track.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    track.addEventListener("mousewheel", handleWheel, { passive: false, capture: true });

    track.addEventListener("click", (event) => {
      if (suppressClickUntil <= Date.now()) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickUntil = 0;
    }, true);

    track.dataset.progressTrackBound = "1";
  }

  function createPromoEntry(options = {}) {
    const normalizeValue = typeof options.normalizeValue === "function"
      ? options.normalizeValue
      : ((value) => String(value || ""));
    const applyLabel = String(options.applyLabel || "Применить");
    const currentLabel = String(options.currentLabel || "Активен");
    const activeValue = normalizeValue(options.activeValue || "");

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-benefits-promo-entry";

    const input = document.createElement("input");
    input.className = "control shop-checkout-benefits-promo-entry-input";
    input.type = "text";
    input.name = String(options.inputName || "adminBenefitsPromoCode");
    input.placeholder = String(options.placeholder || "Введите промокод");
    input.autocomplete = "new-password";
    input.autocorrect = "off";
    input.autocapitalize = "characters";
    input.spellcheck = false;
    input.setAttribute("data-lpignore", "true");
    input.value = normalizeValue(options.value || "");

    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "shop-checkout-benefits-promo-entry-btn";
    applyBtn.textContent = applyLabel;

    const syncState = () => {
      const currentValue = normalizeValue(input.value || "");
      const hasValue = !!currentValue;
      const isCurrentPromo = !!currentValue && currentValue === activeValue;
      const isBusy = applyBtn.dataset.loading === "1";
      applyBtn.disabled = isBusy || !hasValue || isCurrentPromo;
      applyBtn.classList.toggle("is-active", !isBusy && hasValue && !isCurrentPromo);
      applyBtn.classList.toggle("is-current", !isBusy && isCurrentPromo);
      applyBtn.setAttribute("aria-pressed", isCurrentPromo ? "true" : "false");
      if (!isBusy) {
        applyBtn.textContent = isCurrentPromo ? currentLabel : applyLabel;
      }
    };

    input.addEventListener("input", () => {
      const normalizedValue = normalizeValue(input.value || "");
      if (input.value !== normalizedValue) {
        input.value = normalizedValue;
      }
      if (typeof options.onInput === "function") {
        options.onInput(input.value || "");
      }
      syncState();
    });

    applyBtn.addEventListener("click", async () => {
      if (applyBtn.disabled || typeof options.onApply !== "function") return;
      applyBtn.dataset.loading = "1";
      applyBtn.disabled = true;
      try {
        await options.onApply(input.value || "");
      } catch (error) {
        if (typeof options.onError === "function") {
          options.onError(error);
        } else {
          throw error;
        }
      } finally {
        delete applyBtn.dataset.loading;
        syncState();
      }
    });

    wrap.appendChild(input);
    wrap.appendChild(applyBtn);
    syncState();
    return { root: wrap, input, applyBtn, syncState };
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

  function createBenefitBadge(text, tone = "neutral") {
    const normalizedText = String(text || "").trim();
    if (!normalizedText) return null;
    const badge = document.createElement("span");
    badge.className = "shop-checkout-benefit-badge";
    if (tone === "accent") {
      badge.classList.add("shop-checkout-benefit-badge--accent");
    } else if (tone === "selected") {
      badge.classList.add("shop-checkout-benefit-badge--selected");
    } else {
      badge.classList.add("shop-checkout-benefit-badge--neutral");
    }
    badge.textContent = normalizedText;
    return badge;
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

  function bindDetailFallback(node, onOpenDetails) {
    if (!(node instanceof Element) || typeof onOpenDetails !== "function" || node.dataset.detailFallbackBound === "1") {
      return node;
    }
    node.addEventListener("pointerup", (event) => {
      if (typeof event.button === "number" && event.button !== 0) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target && target.closest("a, input, textarea, select, label")) return;
      const actionButton = target ? target.closest("button") : null;
      if (actionButton) {
        const isReadyAction = actionButton.classList.contains("is-ready")
          || actionButton.classList.contains("is-selected")
          || actionButton.classList.contains("btn-primary");
        if (isReadyAction) return;
      }
      event.preventDefault();
      event.stopPropagation();
      onOpenDetails();
    }, true);
    node.dataset.detailFallbackBound = "1";
    return node;
  }

  function renderDiscountCard(item, options = {}) {
    const isSelected = options.isSelected === true || item?.is_selected === true;
    const canToggle = options.canToggle === true;
    const isStackable = options.isStackable === true;
    const primaryText = String(options.valueText || item?.badge_text || "").trim() || "Скидка";
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
    if (isStackable) {
      const meta = document.createElement("div");
      meta.className = "shop-checkout-benefit-discount-meta";
      const discountBadge = createBenefitBadge(primaryText, "accent");
      if (discountBadge) {
        discountBadge.classList.add("shop-checkout-benefit-discount-badge");
        meta.appendChild(discountBadge);
      }
      const badge = document.createElement("span");
      badge.className = "shop-checkout-benefit-badge shop-checkout-benefit-badge--accent shop-checkout-benefit-badge--icon shop-checkout-benefit-stackable-badge";
      badge.title = "Можно совмещать";
      badge.setAttribute("aria-label", "Можно совмещать");
      badge.appendChild(createIcon("fa-link"));
      if (onOpenDetails) {
        badge.tabIndex = 0;
        badge.setAttribute("role", "button");
        badge.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenDetails(item);
        });
        badge.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onOpenDetails(item);
        });
      }
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
    actionBtn.disabled = options.isBusy === true || (!canToggle && !onOpenDetails) || (!onAction && !onOpenDetails);
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canToggle && onOpenDetails) {
        onOpenDetails(item);
        return;
      }
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
    const isStackable = options.isStackable === true;
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
    if (isStackable) {
      const meta = document.createElement("div");
      meta.className = "shop-checkout-benefit-discount-meta";
      const stackBadgeText = String(item?.badge_text || "").trim();
      if (stackBadgeText) {
        const discountBadge = createBenefitBadge(stackBadgeText, "accent");
        if (discountBadge) {
          discountBadge.classList.add("shop-checkout-benefit-discount-badge");
          meta.appendChild(discountBadge);
        }
      }
      const badge = document.createElement("span");
      badge.className = "shop-checkout-benefit-badge shop-checkout-benefit-badge--accent shop-checkout-benefit-badge--icon shop-checkout-benefit-stackable-badge";
      badge.title = "Можно совмещать";
      badge.setAttribute("aria-label", "Можно совмещать");
      badge.appendChild(createIcon("fa-link"));
      if (onOpenDetails) {
        badge.tabIndex = 0;
        badge.setAttribute("role", "button");
        badge.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onOpenDetails(item);
        });
        badge.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onOpenDetails(item);
        });
      }
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
    actionBtn.disabled = options.isBusy === true || (!canToggle && !onOpenDetails) || (!onAction && !onOpenDetails);
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canToggle && onOpenDetails) {
        onOpenDetails(item);
        return;
      }
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
    const actionMode = String(item?.action_mode || "receive").trim().toLowerCase() || "receive";
    const isPromoClaimAction = actionMode === "claim_unique_promo";
    const productCount = Math.max(0, Number(item?.product_count || 0));
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
    if (!isPromoClaimAction && productCount > 1) {
      const countBadge = document.createElement("span");
      countBadge.className = "shop-checkout-benefit-gift-count";
      countBadge.textContent = String(productCount);
      media.appendChild(countBadge);
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
    actionBtn.disabled = options.disableWhileBusy === true || isBusy || (!canExecute && !onOpen) || (!onAction && !onOpen);
    actionBtn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!canExecute && onOpen) {
        onOpen(item);
        return;
      }
      if (!onAction) return;
      void onAction(item);
    });
    card.appendChild(actionBtn);

    if (isPromoClaimAction) {
      const loadingOverlay = document.createElement("div");
      loadingOverlay.className = "shop-checkout-benefit-gift-loading";
      loadingOverlay.innerHTML = '<div class="shop-checkout-sending-spinner" aria-hidden="true"></div>';
      card.appendChild(loadingOverlay);
    }

    const disabledReason = options.showDisabledReason === true ? String(options.disabledReason || "").trim() : "";
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

    if (options.hideAction !== true) {
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
    }
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
      const progressVisual = item?.progress_visual;
      if (progressVisual && typeof progressVisual === "object") {
        if (String(progressVisual?.mode || "").trim() === "amount") {
          const amountLayout = document.createElement("div");
          amountLayout.className = "shop-checkout-benefit-progress-amount-layout";
          const amount = document.createElement("div");
          amount.className = "shop-checkout-benefit-progress-amount";
          const bar = document.createElement("div");
          bar.className = "shop-checkout-benefit-progress-bar";
          const fill = document.createElement("div");
          fill.className = "shop-checkout-benefit-progress-fill";
          fill.style.width = `${Math.max(0, Math.min(100, Number(progressVisual?.progress_ratio ?? item?.progress_ratio ?? 0) * 100))}%`;
          bar.appendChild(fill);
          amount.appendChild(bar);
          amountLayout.appendChild(amount);
          progressWrap.appendChild(amountLayout);
        } else {
          const slots = Array.isArray(progressVisual?.slots) ? progressVisual.slots : [];
          if (slots.length) {
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
              const isOrderSlot = String(progressVisual?.mode || slot?.kind || "").trim() === "orders"
                || String(slot?.kind || "").trim() === "order";
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
                  placeholder.appendChild(createIcon("fa-receipt"));
                } else if (slot?.is_filled === true) {
                  placeholder.appendChild(createIcon("fa-check"));
                } else {
                  placeholder.textContent = "+";
                }
                media.appendChild(placeholder);
              }
              slotEl.appendChild(media);
              slotsWrap.appendChild(slotEl);
            });
            bindHorizontalTrack(slotsWrap);
            visualWrap.appendChild(slotsWrap);
            progressWrap.appendChild(visualWrap);
          }
        }
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

  function getRewardKindLabel(kind) {
    const normalized = String(kind || "").trim().toLowerCase();
    if (normalized === "promo_code") return "Промокод";
    if (normalized === "discount") return "Скидка";
    return "Подарок";
  }

  function getGiftProducts(item) {
    const directProducts = Array.isArray(item?.products) ? item.products : [];
    if (directProducts.length) return directProducts.filter((product) => Number(product?.id || product?.product_id || 0) > 0);
    const rewardPreviewProducts = Array.isArray(item?.reward_preview?.products) ? item.reward_preview.products : [];
    return rewardPreviewProducts.filter((product) => Number(product?.id || product?.product_id || 0) > 0);
  }

  function buildGiftPreview(item) {
    if (item?.reward_preview && typeof item.reward_preview === "object") {
      return item.reward_preview;
    }
    const products = getGiftProducts(item);
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

  function buildRewardPreviewContent(rewardPreview, options = {}) {
    const preview = rewardPreview && typeof rewardPreview === "object" ? rewardPreview : {};
    const products = Array.isArray(preview?.products) ? preview.products : [];
    const previewKind = String(preview?.kind || preview?.icon_kind || "").trim().toLowerCase() || "gift";
    const moneyFormatter = typeof options.moneyFormatter === "function" ? options.moneyFormatter : null;

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-benefit-reward-preview-block";

    const hero = document.createElement("div");
    hero.className = "shop-checkout-benefit-reward-preview";

    const media = document.createElement("div");
    media.className = "shop-checkout-benefit-reward-preview-media";
    if (String(preview?.photo_url || "").trim()) {
      const image = document.createElement("img");
      image.src = String(preview.photo_url || "").trim();
      image.alt = String(preview?.title || "").trim() || getRewardKindLabel(previewKind);
      media.appendChild(image);
    } else {
      media.appendChild(createIcon(getRewardIconName(previewKind)));
    }
    hero.appendChild(media);

    const meta = document.createElement("div");
    meta.className = "shop-checkout-benefit-reward-preview-meta";

    const title = document.createElement("div");
    title.className = "shop-checkout-benefit-reward-preview-title";
    title.textContent = String(preview?.title || "").trim() || getRewardKindLabel(previewKind);
    meta.appendChild(title);

    const badge = createBenefitBadge(
      String(preview?.badge_text || "").trim() || getRewardKindLabel(previewKind),
      "accent"
    );
    if (badge) {
      badge.classList.add("shop-checkout-benefit-reward-preview-badge");
      meta.appendChild(badge);
    }

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
      code.textContent = String(preview.code_preview);
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
        if (String(product?.photo_url || "").trim()) {
          const productImage = document.createElement("img");
          productImage.src = String(product.photo_url || "").trim();
          productImage.alt = String(product?.title || "").trim() || "Товар";
          productMedia.appendChild(productImage);
        } else {
          productMedia.appendChild(createIcon("fa-box-open"));
        }
        productCard.appendChild(productMedia);

        const productMeta = document.createElement("div");
        productMeta.className = "shop-checkout-benefit-reward-product-meta";

        const productTitle = document.createElement("div");
        productTitle.className = "shop-checkout-benefit-reward-product-title";
        productTitle.textContent = String(product?.title || "").trim() || "Товар";
        productMeta.appendChild(productTitle);

        if (Number(product?.price || 0) > 0 && moneyFormatter) {
          const productPrice = document.createElement("div");
          productPrice.className = "shop-checkout-benefit-reward-product-price";
          productPrice.textContent = moneyFormatter(Number(product.price || 0));
          productMeta.appendChild(productPrice);
        }

        productCard.appendChild(productMeta);
        productsList.appendChild(productCard);
      });
      wrap.appendChild(productsList);
    }

    return wrap;
  }

  function buildTargetProductsContent(products, titleText = "Что участвует", options = {}) {
    const items = Array.isArray(products)
      ? products.filter((product) => Number(product?.id || product?.product_id || 0) > 0)
      : [];
    const moneyFormatter = typeof options.moneyFormatter === "function" ? options.moneyFormatter : null;
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
      if (String(product?.photo_url || "").trim()) {
        const productImage = document.createElement("img");
        productImage.src = String(product.photo_url || "").trim();
        productImage.alt = String(product?.title || "").trim() || "Товар";
        productMedia.appendChild(productImage);
      } else {
        productMedia.appendChild(createIcon("fa-box-open"));
      }
      productCard.appendChild(productMedia);

      const productMeta = document.createElement("div");
      productMeta.className = "shop-checkout-benefit-reward-product-meta";

      const productTitle = document.createElement("div");
      productTitle.className = "shop-checkout-benefit-reward-product-title";
      productTitle.textContent = String(product?.title || "").trim() || "Товар";
      productMeta.appendChild(productTitle);

      if (Number(product?.price || 0) > 0 && moneyFormatter) {
        const productPrice = document.createElement("div");
        productPrice.className = "shop-checkout-benefit-reward-product-price";
        productPrice.textContent = moneyFormatter(Number(product.price || 0));
        productMeta.appendChild(productPrice);
      }

      productCard.appendChild(productMeta);
      productsList.appendChild(productCard);
    });
    wrap.appendChild(productsList);
    return wrap;
  }

  function buildCardDetailContent(item, options = {}) {
    const primaryText = String(options.primaryText || "").trim();
    const primaryClassName = String(options.primaryClassName || "").trim();
    const isSelected = options.isSelected === true;
    const moneyFormatter = typeof options.moneyFormatter === "function" ? options.moneyFormatter : null;

    const wrap = document.createElement("div");
    wrap.className = "shop-checkout-benefit-detail-card";

    const badges = document.createElement("div");
    badges.className = "shop-checkout-benefit-detail-badges";

    if (item?.badge_text) {
      const badge = createBenefitBadge(item.badge_text, "accent");
      if (badge) {
        badge.classList.add("shop-checkout-benefit-discount-badge");
        badges.appendChild(badge);
      }
    }

    if (item?.status_text) {
      const status = createBenefitBadge(item.status_text, "neutral");
      if (status) {
        status.classList.add("shop-checkout-benefit-status");
        badges.appendChild(status);
      }
    }

    if (isSelected) {
      const selected = createBenefitBadge("Выбрано", "selected");
      if (selected) {
        selected.classList.add("shop-checkout-benefit-status", "is-selected");
        badges.appendChild(selected);
      }
    }

    if (badges.children.length) wrap.appendChild(badges);

    if (primaryText) {
      const valueEl = document.createElement("div");
      valueEl.className = "shop-checkout-benefit-detail-value";
      if (primaryClassName) valueEl.classList.add(primaryClassName);
      valueEl.textContent = primaryText;
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
    if (Number(item?.discount_amount || 0) > 0 && moneyFormatter) {
      appendInfoLine("Выгода:", moneyFormatter(Number(item.discount_amount || 0)));
    }
    const expiresText = formatDate(item?.expires_at);
    if (expiresText) appendInfoLine("До:", expiresText);
    const completedText = formatDate(item?.completed_at);
    if (completedText) appendInfoLine("Завершено:", completedText);
    if (item?.status_text) appendInfoLine("Статус:", item.status_text);
    if (!item?.is_applicable && item?.disabled_reason) {
      appendInfoLine("Ограничение:", item.disabled_reason);
    }

    if (info.children.length) wrap.appendChild(info);
    return wrap;
  }

  function buildDiscountDetailContent(item, options = {}) {
    const wrap = document.createElement("div");
    wrap.appendChild(buildCardDetailContent(item, {
      primaryText: String(options.primaryText || item?.badge_text || "").trim() || "Скидка",
      primaryClassName: String(options.primaryClassName || "").trim(),
      isSelected: options.isSelected === true || item?.is_selected === true,
      moneyFormatter: options.moneyFormatter,
    }));
    const productsSection = buildTargetProductsContent(item?.products, "Что участвует", options);
    if (productsSection.childNodes.length) wrap.appendChild(productsSection);
    return wrap;
  }

  function buildProgressInfoContent(item, options = {}) {
    const wrap = document.createElement("div");
    const info = document.createElement("div");
    info.className = "shop-checkout-benefit-modal-info";
    const moneyFormatter = typeof options.moneyFormatter === "function" ? options.moneyFormatter : null;
    const formatProgressSummary = typeof options.formatProgressSummary === "function"
      ? options.formatProgressSummary
      : null;
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
    if (formatProgressSummary) {
      appendInfoLine("Прогресс:", formatProgressSummary(item));
    }
    const progressBasis = String(item?.progress_basis || "").trim().toLowerCase();
    const currentValue = Number(item?.progress_display_value ?? item?.progress_value ?? 0);
    const thresholdValue = Number(item?.threshold_value || 0);
    const remainingValue = Math.max(0, thresholdValue - currentValue);
    if (remainingValue > 0) {
      if (progressBasis === "amount" && moneyFormatter) {
        appendInfoLine("Осталось:", moneyFormatter(remainingValue));
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
    wrap.appendChild(buildRewardPreviewContent(item?.reward_preview, options));
    return wrap;
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
    createScrollableFrame,
    bindHorizontalTrack,
    bindDetailFallback,
    buildGiftPreview,
    buildRewardPreviewContent,
    buildTargetProductsContent,
    buildCardDetailContent,
    buildDiscountDetailContent,
    buildProgressInfoContent,
    createPromoEntry,
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
