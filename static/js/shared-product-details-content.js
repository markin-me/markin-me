// Shared implementation used by the storefront and administrative order entry.
SharedProductRuntime.register(function (runtime) {
  "use strict";

function buildProductDetailsContent(
  product,
  optionGroups,
  selectionState,
  ingredients,
  ingredientState,
  variants,
  variantState,
  {
    onBack,
    mode,
    onSelectionChange,
    onIngredientChange,
    onVariantChange,
    canSelectVariantIndex = null,
    canDraftMutationApply = null,
    qtyPill,
    onQtyMinus,
    onQtyPlus,
    onQtyCenterClick,
    setDefaultVariantForOptionItem = () => {},
    guardDraftMutation = null,
  } = {}
) {
  const wrap = document.createElement("div");
  wrap.className = "shop-pd";

  const scroll = document.createElement("div");
  scroll.className = "shop-pd-scroll";

  const productBlocksConfig = product?.blocks_config && typeof product.blocks_config === "object"
    ? product.blocks_config
    : {};

  function formatProductNutritionValue(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return "0";
    const rounded = Math.round(num * 100) / 100;
    return String(rounded).replace(".", ",");
  }

  function readProductNutritionNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const num = Number(String(value).replace(",", "."));
    return Number.isFinite(num) ? num : null;
  }

  function calcProductNutritionKcal(values) {
    const protein = readProductNutritionNumber(values?.protein);
    const fat = readProductNutritionNumber(values?.fat);
    const carbs = readProductNutritionNumber(values?.carbs);
    if (protein == null || fat == null || carbs == null) return null;
    return Math.round((protein * 4 + fat * 9 + carbs * 4) * 100) / 100;
  }

  function normalizeProductNutrition(values) {
    const protein = readProductNutritionNumber(values?.protein);
    const fat = readProductNutritionNumber(values?.fat);
    const carbs = readProductNutritionNumber(values?.carbs);
    const kcal = readProductNutritionNumber(values?.kcal);
    return {
      kcal: kcal != null ? kcal : calcProductNutritionKcal({ protein, fat, carbs }),
      protein,
      fat,
      carbs,
    };
  }

  function addNutritionPortion(target, source, grams, multiplier = 1) {
    const nutrition = normalizeProductNutrition(source);
    const qtyGrams = Number(grams);
    const qtyMultiplier = Number(multiplier || 1);
    if (!Number.isFinite(qtyGrams) || qtyGrams === 0 || !Number.isFinite(qtyMultiplier) || qtyMultiplier <= 0) return 0;
    ["protein", "fat", "carbs"].forEach((key) => {
      const value = nutrition[key];
      if (value != null) target[key] += value * qtyGrams / 100 * qtyMultiplier;
    });
    return qtyGrams * qtyMultiplier;
  }

  function addNutritionValues(target, source, multiplier = 1) {
    const nutrition = normalizeProductNutrition(source);
    const qtyMultiplier = Number(multiplier || 1);
    if (!Number.isFinite(qtyMultiplier) || qtyMultiplier <= 0) return;
    ["protein", "fat", "carbs"].forEach((key) => {
      const value = nutrition[key];
      if (value != null) target[key] += value * qtyMultiplier;
    });
  }

  function cloneNutritionTotals(values = {}) {
    const nutrition = normalizeProductNutrition(values);
    return {
      protein: nutrition.protein != null ? nutrition.protein : 0,
      fat: nutrition.fat != null ? nutrition.fat : 0,
      carbs: nutrition.carbs != null ? nutrition.carbs : 0,
    };
  }

  function nutritionPer100FromTotals(totals, grams) {
    const qtyGrams = readProductNutritionNumber(grams);
    if (qtyGrams == null || qtyGrams <= 0) return null;
    return normalizeProductNutrition({
      protein: Number(totals?.protein || 0) / qtyGrams * 100,
      fat: Number(totals?.fat || 0) / qtyGrams * 100,
      carbs: Number(totals?.carbs || 0) / qtyGrams * 100,
    });
  }

  function parseProductNutritionVariantValue(value) {
    const match = String(value ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getSelectedVariantGrams(variantGroups, stateEntry) {
    const groups = Array.isArray(variantGroups) ? variantGroups : [];
    const group = groups[0] || null;
    const idx = Number(stateEntry?.selectedIndex ?? stateEntry?.variant_value_index ?? group?.default_value_index);
    const values = Array.isArray(group?.values) ? group.values : [];
    if (!group || !Number.isFinite(idx) || idx < 0 || idx >= values.length) return null;
    const value = parseProductNutritionVariantValue(values[idx]);
    const factor = readProductNutritionNumber(group.unit_to_grams_factor);
    if (!Number.isFinite(value) || value <= 0 || factor == null || factor <= 0) return null;
    return value * factor;
  }

  function getProductBaseNutritionGrams(sourceProduct) {
    return readProductNutritionNumber(sourceProduct?.nutrition_portion_grams ?? sourceProduct?.base_qty_grams);
  }

  function addConfiguredProductNutrition(target, sourceProduct, sourceVariants, sourceVariantState, multiplier = 1) {
    const selectedGrams = getSelectedVariantGrams(sourceVariants, sourceVariantState);
    const baseGrams = getProductBaseNutritionGrams(sourceProduct);
    const grams = selectedGrams != null ? selectedGrams : baseGrams;
    const per100 = sourceProduct?.nutrition_per_100g && typeof sourceProduct.nutrition_per_100g === "object"
      ? sourceProduct.nutrition_per_100g
      : null;
    const portion = sourceProduct?.nutrition_per_portion && typeof sourceProduct.nutrition_per_portion === "object"
      ? sourceProduct.nutrition_per_portion
      : null;
    const qtyMultiplier = Number(multiplier || 1);
    if (grams != null && per100) {
      return addNutritionPortion(target, per100, grams, qtyMultiplier);
    }
    if (portion) {
      addNutritionValues(target, portion, qtyMultiplier);
      return baseGrams != null ? baseGrams * qtyMultiplier : 0;
    }
    return 0;
  }

  function getCurrentProductNutritionTotals() {
    const totals = { protein: 0, fat: 0, carbs: 0 };
    let totalGrams = 0;
    const activeIngredients = Array.isArray(ingredients) ? ingredients : [];
    if (activeIngredients.length) {
      const basePortion = product?.nutrition_per_portion && typeof product.nutrition_per_portion === "object"
        ? product.nutrition_per_portion
        : null;
      const recipeTotals = basePortion
        ? cloneNutritionTotals(basePortion)
        : { protein: 0, fat: 0, carbs: 0 };
      let recipeGrams = getProductBaseNutritionGrams(product) || 0;
      activeIngredients.forEach((ing) => {
        const ingId = Number(ing.ingredient_id || 0);
        const stateEntry = ingredientState?.get(ingId);
        const qty = stateEntry && stateEntry.quantity !== undefined ? Number(stateEntry.quantity) : Number(ing.quantity ?? 1);
        const baseQty = Number(ing.quantity ?? 1);
        const calcQty = basePortion ? qty - baseQty : qty;
        const unitToGrams = readProductNutritionNumber(ing.unit_to_grams_factor);
        const diffGrams = unitToGrams != null ? calcQty * unitToGrams : null;
        recipeGrams += addNutritionPortion(recipeTotals, ing.nutrition_per_100g, diffGrams);
      });
      const recipePer100 = nutritionPer100FromTotals(recipeTotals, recipeGrams);
      const selectedVariantGrams = getSelectedVariantGrams(variants, variantState);
      const selectedGrams = selectedVariantGrams != null ? selectedVariantGrams : recipeGrams;
      if (recipePer100 && selectedGrams > 0) {
        totalGrams += addNutritionPortion(totals, recipePer100, selectedGrams);
      } else {
        addNutritionValues(totals, recipeTotals);
        totalGrams += recipeGrams;
      }
    } else {
      totalGrams += addConfiguredProductNutrition(totals, product, variants, variantState);
    }

    runtime.collectSelectedOptionItems(optionGroups, selectionState).forEach((item) => {
      const itemQty = Number(item.qty || 1) || 1;
      totalGrams += addConfiguredProductNutrition(totals, item, item.variants, item, itemQty);
    });

    totals.kcal = calcProductNutritionKcal(totals);
    return { totals, totalGrams };
  }

  let nutritionMode = "per100";
  let refreshNutritionCard = () => {};

  function appendProductNutritionCard() {
    if (productBlocksConfig.nutrition !== true) return;
    const nutrition = product?.nutrition_per_100g && typeof product.nutrition_per_100g === "object"
      ? product.nutrition_per_100g
      : null;
    if (!nutrition) return;
    const hasAnyValue = ["kcal", "protein", "fat", "carbs"].some((key) => Number.isFinite(Number(nutrition[key])));
    if (!hasAnyValue) return;

    const card = document.createElement("div");
    card.className = "shop-pd-nutrition-card";
    card.innerHTML = `
      <div class="shop-pd-nutrition-head">
        <div>
          <div class="shop-pd-nutrition-title">КБЖУ</div>
          <div class="shop-pd-nutrition-subtitle" data-nutrition-subtitle>Значения на 100 г</div>
        </div>
        <div class="shop-pd-nutrition-actions" role="group" aria-label="Режим КБЖУ">
          <button class="shop-pd-nutrition-mode is-active" type="button" data-nutrition-mode="per100">100 г</button>
          <button class="shop-pd-nutrition-mode" type="button" data-nutrition-mode="portion">Порция</button>
        </div>
      </div>
      <div class="shop-pd-nutrition-grid">
        <div class="shop-pd-nutrition-cell"><span>Ккал</span><strong data-nutrition-value="kcal">${runtime.escapeHtml(formatProductNutritionValue(nutrition.kcal))}</strong></div>
        <div class="shop-pd-nutrition-cell"><span>Белки</span><strong data-nutrition-value="protein">${runtime.escapeHtml(formatProductNutritionValue(nutrition.protein))}</strong></div>
        <div class="shop-pd-nutrition-cell"><span>Жиры</span><strong data-nutrition-value="fat">${runtime.escapeHtml(formatProductNutritionValue(nutrition.fat))}</strong></div>
        <div class="shop-pd-nutrition-cell"><span>Углеводы</span><strong data-nutrition-value="carbs">${runtime.escapeHtml(formatProductNutritionValue(nutrition.carbs))}</strong></div>
      </div>
    `;
    const subtitle = card.querySelector("[data-nutrition-subtitle]");
    const valueEls = {
      kcal: card.querySelector('[data-nutrition-value="kcal"]'),
      protein: card.querySelector('[data-nutrition-value="protein"]'),
      fat: card.querySelector('[data-nutrition-value="fat"]'),
      carbs: card.querySelector('[data-nutrition-value="carbs"]'),
    };
    refreshNutritionCard = () => {
      const current = getCurrentProductNutritionTotals();
      const values = nutritionMode === "portion"
        ? current.totals
        : (
            current.totalGrams > 0
              ? normalizeProductNutrition({
                  protein: current.totals.protein / current.totalGrams * 100,
                  fat: current.totals.fat / current.totalGrams * 100,
                  carbs: current.totals.carbs / current.totalGrams * 100,
                })
              : nutrition
          );
      if (subtitle) subtitle.textContent = nutritionMode === "portion" ? "Значения на порцию" : "Значения на 100 г";
      Object.keys(valueEls).forEach((key) => {
        if (valueEls[key]) valueEls[key].textContent = formatProductNutritionValue(values[key]);
      });
      card.querySelectorAll("[data-nutrition-mode]").forEach((btn) => {
        btn.classList.toggle("is-active", btn.dataset.nutritionMode === nutritionMode);
      });
    };
    card.querySelectorAll("[data-nutrition-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        nutritionMode = btn.dataset.nutritionMode === "portion" ? "portion" : "per100";
        refreshNutritionCard();
      });
    });
    scroll.appendChild(card);
    refreshNutritionCard();
  }

  function appendProductDescriptionCard() {
    if (productBlocksConfig.description !== true) return;
    const text = runtime.str(product?.description || "").trim();
    if (!text) return;

    const card = document.createElement("div");
    card.className = "shop-pd-info-card shop-pd-description-card";
    const title = document.createElement("div");
    title.className = "shop-pd-info-card-title";
    title.textContent = "Описание";
    const body = document.createElement("div");
    body.className = "shop-pd-info-card-body";
    body.textContent = text;
    card.appendChild(title);
    card.appendChild(body);
    scroll.appendChild(card);
  }

  function appendProductClientCompositionCard() {
    if (productBlocksConfig.ingredients !== true) return;
    const text = runtime.str(product?.client_composition || "").trim();
    if (!text) return;

    const card = document.createElement("div");
    card.className = "shop-pd-info-card shop-pd-composition-card";
    const title = document.createElement("div");
    title.className = "shop-pd-info-card-title";
    title.textContent = "Состав";
    const body = document.createElement("div");
    body.className = "shop-pd-info-card-body";
    body.textContent = text;
    card.appendChild(title);
    card.appendChild(body);
    scroll.appendChild(card);
  }

  // Умный скролл: при раскрытии секций (например, опций) доскролливаем так,
  // чтобы блок оказался сразу под хедером на мобильных.
  function smartScrollIntoView(targetEl) {
    try {
      if (!targetEl || !scroll) return;

      // Только мобильный режим — на десктопе и так всё видно.
      if (!window.matchMedia || !window.matchMedia("(max-width: 768px)").matches) {
        return;
      }

      const header = document.querySelector("header");
      let offset = 0;
      if (header) {
        const headerRect = header.getBoundingClientRect();
        const headerH =
          headerRect.height ||
          header.offsetHeight ||
          parseFloat(getComputedStyle(header).height) ||
          0;
        // Немного запаса под хедером
        offset = headerH + 8;
      }

      const scrollRect = scroll.getBoundingClientRect();
      const targetRect = targetEl.getBoundingClientRect();

      // Положение верха блока относительно начала скролл-контейнера
      const currentTop = targetRect.top - scrollRect.top;
      const desiredTop = offset;
      const delta = currentTop - desiredTop;

      // Если и так почти на месте — ничего не делаем
      if (Math.abs(delta) < 4) return;

      scroll.scrollBy({
        top: delta,
        behavior: "smooth",
      });
    } catch {
      // В случае ошибки просто не скроллим, чтобы не ломать UX
    }
  }

  // Плавное открытие/закрытие списка (аккордеон по высоте),
  // чтобы не было резких "схлопываний"
  function slideDown(listEl, duration = 180) {
    if (!listEl) return;
    listEl.classList.remove("hidden");
    listEl.style.overflow = "hidden";
    listEl.style.maxHeight = "0px";

    // Следующий кадр — анимируем до полной высоты
    const run = () => {
      const full = listEl.scrollHeight || 0;
      listEl.style.transition = `max-height ${duration}ms ease`;
      listEl.style.maxHeight = `${full}px`;
    };
    if (window.requestAnimationFrame) {
      requestAnimationFrame(run);
    } else {
      run();
    }

    const onEnd = () => {
      listEl.style.maxHeight = "";
      listEl.style.overflow = "";
      listEl.style.transition = "";
      listEl.removeEventListener("transitionend", onEnd);
    };
    listEl.addEventListener("transitionend", onEnd);
  }

  function slideUp(listEl, duration = 180, afterHide) {
    if (!listEl) {
      if (typeof afterHide === "function") afterHide();
      return;
    }
    const full = listEl.scrollHeight || 0;
    listEl.style.overflow = "hidden";
    listEl.style.maxHeight = `${full}px`;
    listEl.style.transition = `max-height ${duration}ms ease`;

    // Следующий кадр — анимируем до 0
    const run = () => {
      listEl.style.maxHeight = "0px";
    };
    if (window.requestAnimationFrame) {
      requestAnimationFrame(run);
    } else {
      run();
    }

    const onEnd = () => {
      listEl.classList.add("hidden");
      listEl.style.maxHeight = "";
      listEl.style.overflow = "";
      listEl.style.transition = "";
      listEl.removeEventListener("transitionend", onEnd);
      if (typeof afterHide === "function") afterHide();
    };
    listEl.addEventListener("transitionend", onEnd);
  }

  function setOptionVariantAccordionState(accordionEl, open, duration = 220) {
    if (!accordionEl) return;
    const willOpen = !!open;
    const OPEN_PADDING_TOP_PX = 8;
    const OPEN_MARGIN_TOP_PX = 8;
    const OPEN_BORDER_TOP_WIDTH_PX = 1;
    const currentTeardown = accordionEl.__variantAccordionTeardown;
    if (typeof currentTeardown === "function") {
      try { currentTeardown(); } catch {}
      accordionEl.__variantAccordionTeardown = null;
    }

    if (willOpen) {
      accordionEl.classList.add("is-open");
      accordionEl.style.display = "block";
      const full = accordionEl.scrollHeight || 0;
      accordionEl.style.overflow = "hidden";
      accordionEl.style.maxHeight = "0px";
      accordionEl.style.opacity = "0";
      accordionEl.style.paddingTop = "0px";
      accordionEl.style.marginTop = "0px";
      accordionEl.style.borderTopWidth = "0px";
      accordionEl.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease, padding-top ${duration}ms ease, margin-top ${duration}ms ease, border-top-width ${duration}ms ease`;
      const run = () => {
        const target = accordionEl.scrollHeight || full;
        accordionEl.style.maxHeight = `${target}px`;
        accordionEl.style.opacity = "1";
        accordionEl.style.paddingTop = `${OPEN_PADDING_TOP_PX}px`;
        accordionEl.style.marginTop = `${OPEN_MARGIN_TOP_PX}px`;
        accordionEl.style.borderTopWidth = `${OPEN_BORDER_TOP_WIDTH_PX}px`;
      };
      if (window.requestAnimationFrame) requestAnimationFrame(run);
      else run();
      const onEnd = () => {
        accordionEl.style.maxHeight = "";
        accordionEl.style.overflow = "";
        accordionEl.style.transition = "";
        accordionEl.removeEventListener("transitionend", onEnd);
        accordionEl.__variantAccordionTeardown = null;
      };
      accordionEl.__variantAccordionTeardown = onEnd;
      accordionEl.addEventListener("transitionend", onEnd);
      return;
    }

    if (!accordionEl.classList.contains("is-open")) {
      accordionEl.style.display = "none";
      return;
    }
    const full = accordionEl.scrollHeight || 0;
    accordionEl.style.display = "block";
    accordionEl.style.overflow = "hidden";
    accordionEl.style.maxHeight = `${full}px`;
    accordionEl.style.opacity = "1";
    const computed = window.getComputedStyle(accordionEl);
    accordionEl.style.paddingTop = computed.paddingTop || `${OPEN_PADDING_TOP_PX}px`;
    accordionEl.style.marginTop = computed.marginTop || `${OPEN_MARGIN_TOP_PX}px`;
    accordionEl.style.borderTopWidth = computed.borderTopWidth || `${OPEN_BORDER_TOP_WIDTH_PX}px`;
    accordionEl.style.transition = `max-height ${duration}ms ease, opacity ${duration}ms ease, padding-top ${duration}ms ease, margin-top ${duration}ms ease, border-top-width ${duration}ms ease`;
    const run = () => {
      accordionEl.style.maxHeight = "0px";
      accordionEl.style.opacity = "0";
      accordionEl.style.paddingTop = "0px";
      accordionEl.style.marginTop = "0px";
      accordionEl.style.borderTopWidth = "0px";
    };
    if (window.requestAnimationFrame) requestAnimationFrame(run);
    else run();
    const onEnd = () => {
      accordionEl.classList.remove("is-open");
      accordionEl.style.display = "none";
      accordionEl.style.maxHeight = "";
      accordionEl.style.opacity = "";
      accordionEl.style.paddingTop = "";
      accordionEl.style.marginTop = "";
      accordionEl.style.borderTopWidth = "";
      accordionEl.style.overflow = "";
      accordionEl.style.transition = "";
      accordionEl.removeEventListener("transitionend", onEnd);
      accordionEl.__variantAccordionTeardown = null;
    };
    accordionEl.__variantAccordionTeardown = onEnd;
    accordionEl.addEventListener("transitionend", onEnd);
  }

  /* ================= HERO (ФОТО + СТРЕЛКИ DESKTOP + СВАЙП MOBILE + DOTS) ================= */

  const photos = runtime.safePhotos(product);
  let activeIndex = 0;

  const hero = document.createElement("div");
  hero.className = "shop-product-hero";

  const media = document.createElement("div");
  media.className = "shop-product-hero-media";

  const img = runtime.createOptimizedImage(photos[0] || "/static/img/placeholder.png", {
    type: 'product-hero',
    className: 'shop-product-hero-image',
    alt: '',
    priority: true,
  });
  img.style.objectFit = "cover";
  media.appendChild(img);
  const bogoBadge = typeof runtime.createCatalogBuyXGetYBadge === "function"
    ? runtime.createCatalogBuyXGetYBadge(product)
    : null;
  if (bogoBadge) {
    bogoBadge.classList.add("shop-product-hero-bogo-badge");
    media.appendChild(bogoBadge);
  }

  hero.appendChild(media);

  let dots = null;

  function setActive(nextIndex) {
    if (!photos.length) return;

    const len = photos.length;
    let i = Number(nextIndex);

    if (!Number.isFinite(i)) i = 0;
    i = (i % len + len) % len;

    if (activeIndex === i) return;
    activeIndex = i;

    img.src = photos[i] || "/static/img/placeholder.png";

    if (dots) {
      dots.querySelectorAll(".shop-product-hero-dot").forEach((d, idx) => {
        d.classList.toggle("is-active", idx === i);
      });
    }
  }

  // стрелки (desktop; на мобилке скрываются CSS-ом)
  if (photos.length > 1) {
    const btnPrev = document.createElement("button");
    btnPrev.type = "button";
    btnPrev.className = "shop-product-hero-arrow is-prev";
    btnPrev.innerHTML = `<i class="fas fa-chevron-left"></i>`;
    btnPrev.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(activeIndex - 1);
    });

    const btnNext = document.createElement("button");
    btnNext.type = "button";
    btnNext.className = "shop-product-hero-arrow is-next";
    btnNext.innerHTML = `<i class="fas fa-chevron-right"></i>`;
    btnNext.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      setActive(activeIndex + 1);
    });

    hero.appendChild(btnPrev);
    hero.appendChild(btnNext);
  }

  // dots + клики по точкам
  if (photos.length > 1) {
    dots = document.createElement("div");
    dots.className = "shop-product-hero-dots";

    photos.forEach((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className =
        "shop-product-hero-dot" + (i === 0 ? " is-active" : "");

      dot.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        setActive(i);
      });

      dots.appendChild(dot);
    });

    hero.appendChild(dots);
  }

  // свайп (mobile)
  if (photos.length > 1) {
    let startX = 0;
    let startY = 0;
    let tracking = false;

    media.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        tracking = true;
        startX = t.clientX;
        startY = t.clientY;
      },
      { passive: true }
    );

    media.addEventListener(
      "touchend",
      (e) => {
        if (!tracking) return;
        tracking = false;

        const t = e.changedTouches && e.changedTouches[0];
        if (!t) return;

        const dx = t.clientX - startX;
        const dy = t.clientY - startY;

        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) setActive(activeIndex + 1);
          else setActive(activeIndex - 1);
        }
      },
      { passive: true }
    );
  }

  scroll.appendChild(hero);

  const runGuardedMutation = (mutator, opts = {}) => {
    if (typeof mutator !== "function") return false;
    if (typeof guardDraftMutation !== "function") {
      mutator();
      return true;
    }
    return !!guardDraftMutation(mutator, opts);
  };

  const canApplyDraftMutation = (mutator) => {
    if (typeof mutator !== "function") return true;
    if (typeof canDraftMutationApply === "function") {
      try {
        return canDraftMutationApply(mutator) !== false;
      } catch {
        return true;
      }
    }
    return true;
  };

  const variantAvailabilityRefreshers = [];
  const registerVariantAvailabilityRefresher = (refreshFn) => {
    if (typeof refreshFn === "function") {
      variantAvailabilityRefreshers.push(refreshFn);
    }
  };
  const refreshVariantAvailability = ({ showToastOnOut = false, forceNow = false } = {}) => {
    if (!variantAvailabilityRefreshers.length) return Promise.resolve();
    return Promise.all(
      variantAvailabilityRefreshers.map((refreshFn) =>
        Promise.resolve(refreshFn({ showToastOnOut, forceNow })).catch(() => {})
      )
    ).then(() => {});
  };

  const createOptionVariantAvailabilityController = ({
    values = [],
    getSelectedIndex,
    setDraftForIndex,
    isOptionItemSelected,
  } = {}) => {
    const buttonsByIndex = new Map();
    const availabilityByIndex = new Map();
    let refreshSeq = 0;
    let refreshTimer = null;

    const applyButtonState = (idx) => {
      const btn = buttonsByIndex.get(Number(idx));
      if (!btn) return;
      const selectedIdx = Number(typeof getSelectedIndex === "function" ? getSelectedIndex() : -1);
      const isSelected = selectedIdx === Number(idx);
      const knownAvailable = availabilityByIndex.has(Number(idx))
        ? availabilityByIndex.get(Number(idx)) !== false
        : true;
      const shouldDisable = !knownAvailable && !isSelected;
      btn.classList.toggle("is-unavailable", shouldDisable);
      btn.disabled = shouldDisable;
      btn.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    };

    const refreshNow = () => {
      if (!Array.isArray(values) || !values.length) return;

      const selectedNow = typeof isOptionItemSelected === "function" ? !!isOptionItemSelected() : true;
      if (!selectedNow) {
        values.forEach((_, idx) => {
          availabilityByIndex.set(Number(idx), true);
          applyButtonState(idx);
        });
        return;
      }

      values.forEach((_, idx) => {
        const allowed = canApplyDraftMutation(() => {
          if (typeof setDraftForIndex === "function") {
            setDraftForIndex(idx);
          }
        });
        availabilityByIndex.set(Number(idx), allowed);
        applyButtonState(idx);
      });
    };

    const scheduleRefresh = ({ forceNow = false } = {}) => {
      if (refreshTimer) {
        clearTimeout(refreshTimer);
        refreshTimer = null;
      }
      if (forceNow) {
        refreshNow();
        return;
      }
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        refreshNow();
      }, 20);
    };

    const registerButton = (idx, btn) => {
      if (!btn) return;
      const key = Number(idx);
      buttonsByIndex.set(key, btn);
      availabilityByIndex.set(key, true);
      applyButtonState(key);
    };

    return {
      applyButtonState,
      scheduleRefresh,
      registerButton,
    };
  };

  /* ================= META ПОД ФОТО ================= */

  const meta = document.createElement("div");
  meta.className = "shop-pd-meta";

  const title = document.createElement("div");
  title.className = "shop-pd-title";
  title.textContent = runtime.str(product.name);

  // Цена отображается только в кнопке «В корзину» (shop-pd-action-price)

  const shortDescText = runtime.str(product.description_short || "").trim();
  const shortDesc = document.createElement("div");
  shortDesc.className = "shop-pd-short";
  if (shortDescText) shortDesc.textContent = shortDescText;

  meta.appendChild(title);
  if (shortDescText) meta.appendChild(shortDesc);

  scroll.appendChild(meta);

  /* ================= VARIANTS (SHOP) ================= */
  if (Array.isArray(variants) && variants.length) {
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup.values) ? variantGroup.values : [];
    const unitLabel =
      runtime.str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();

    const variantWrap = document.createElement("div");
    variantWrap.className = "shop-pd-options";

    const variantSectionTitle = document.createElement("div");
    variantSectionTitle.className = "shop-pd-section-title shop-pd-variants-title";
    variantSectionTitle.textContent = "Варианты товара:";
    variantWrap.appendChild(variantSectionTitle);

    const variantTitle = document.createElement("div");
    variantTitle.className = "shop-pd-variant-group-title";
    variantTitle.textContent = variantGroup.title || "Варианты";
    variantWrap.appendChild(variantTitle);

    const valuesWrap = document.createElement("div");
    valuesWrap.className = "shop-pd-option-cards";
    valuesWrap.style.display = "flex";
    valuesWrap.style.gap = "8px";
    valuesWrap.style.overflowX = "auto";
    valuesWrap.style.flexWrap = "nowrap";
    valuesWrap.style.paddingBottom = "4px";

    const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
    const formatValueLabel = (val) => {
      const valueText = runtime.str(val);
      if (!valueText) return "";
      if (!unitLabel || hasLetters(valueText)) return valueText;
      return `${valueText} ${unitLabel}`;
    };

    const variantButtonsByIndex = new Map();
    const variantAvailabilityByIndex = new Map();
    let variantAvailabilityRefreshSeq = 0;
    let variantAvailabilityRefreshTimer = null;

    const applyVariantButtonState = (idx) => {
      const btn = variantButtonsByIndex.get(Number(idx));
      if (!btn) return;
      const selectedIdx = Number(variantState.selectedIndex);
      const isSelected = selectedIdx === Number(idx);
      const knownAvailable = variantAvailabilityByIndex.has(Number(idx))
        ? variantAvailabilityByIndex.get(Number(idx)) !== false
        : true;
      const shouldDisable = !knownAvailable && !isSelected;
      btn.classList.toggle("is-unavailable", shouldDisable);
      btn.disabled = shouldDisable;
      btn.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
    };

    const applySelectedIndex = (idx) => {
      variantState.selectedIndex = idx;
      variantState.value = values[idx];
      variantState.label = formatValueLabel(values[idx]);
      valuesWrap.querySelectorAll("[data-variant-index]").forEach((btn) => {
        const buttonIndex = Number(btn.dataset.variantIndex);
        btn.classList.toggle("is-selected", buttonIndex === idx);
        applyVariantButtonState(buttonIndex);
      });
    };

    const setSelectedIndex = async (
      idx,
      { showToastOnOut = true, guard = true } = {}
    ) => {
      if (!Number.isFinite(Number(idx))) return false;
      const nextIdx = Number(idx);
      const mutator = () => applySelectedIndex(nextIdx);
      const applied = guard
        ? await runGuardedMutation(mutator, { showToastOnOut })
        : (mutator(), true);
      if (!applied) return false;
      if (typeof onVariantChange === "function") {
        refreshNutritionCard();
        onVariantChange();
      }
      return true;
    };

    const getDraftQtyForVariantCheck = () => {
      const centerText = runtime.str(qtyPill?.center?.textContent || "").trim();
      const qtyNum = Number(centerText);
      if (!Number.isFinite(qtyNum) || qtyNum <= 0) return 1;
      return qtyNum;
    };

    const refreshVariantAvailabilityNow = () => {
      if (typeof canSelectVariantIndex !== "function" || !values.length) return;
      const desiredQty = getDraftQtyForVariantCheck();

      values.forEach((_, idx) => {
        const available = canSelectVariantIndex(idx, { desiredQty }) !== false;
        variantAvailabilityByIndex.set(Number(idx), available);
        applyVariantButtonState(idx);
      });

      const selectedIdx = Number(variantState.selectedIndex);
      const selectedAvailable =
        !Number.isFinite(selectedIdx) ||
        selectedIdx < 0 ||
        variantAvailabilityByIndex.get(selectedIdx) !== false;

      if (!selectedAvailable) {
        const fallbackIdx = values.findIndex((_, idx) =>
          variantAvailabilityByIndex.get(Number(idx)) !== false
        );
        if (fallbackIdx >= 0 && fallbackIdx !== selectedIdx) {
          setSelectedIndex(fallbackIdx, { showToastOnOut: false, guard: false });
        }
      }
    };

    const scheduleVariantAvailabilityRefresh = ({ forceNow = false } = {}) => {
      if (variantAvailabilityRefreshTimer) {
        clearTimeout(variantAvailabilityRefreshTimer);
        variantAvailabilityRefreshTimer = null;
      }
      if (forceNow) {
        refreshVariantAvailabilityNow();
        return;
      }
      variantAvailabilityRefreshTimer = setTimeout(() => {
        variantAvailabilityRefreshTimer = null;
        refreshVariantAvailabilityNow();
      }, 20);
    };

    registerVariantAvailabilityRefresher(scheduleVariantAvailabilityRefresh);

    values.forEach((value, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-pd-option-card is-clickable";
      btn.style.width = "auto";
      btn.style.flex = "0 0 auto";
      btn.dataset.variantIndex = String(idx);
      btn.textContent = formatValueLabel(value);
      if (variantState.selectedIndex === idx) {
        btn.classList.add("is-selected");
      }
      variantButtonsByIndex.set(Number(idx), btn);
      variantAvailabilityByIndex.set(Number(idx), true);
      applyVariantButtonState(idx);
      btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        await setSelectedIndex(idx, { showToastOnOut: true, guard: true });
      });
      valuesWrap.appendChild(btn);
    });

    variantWrap.appendChild(valuesWrap);
    scroll.appendChild(variantWrap);

    // Инициализируем выбранный вариант: используем default_value_index из API (индивидуальный или групповой)
    if (Number.isFinite(variantState.selectedIndex) && !variantState.label) {
      void setSelectedIndex(variantState.selectedIndex, {
        showToastOnOut: false,
        guard: false,
      });
    } else if (!Number.isFinite(variantState.selectedIndex) && values.length) {
      // Используем default_value_index (индивидуальный или групповой), если задан, иначе 0
      const defaultIndex = variantGroup.default_value_index != null 
        ? Number(variantGroup.default_value_index) 
        : 0;
      // Проверяем что индекс валидный
      const validIndex = defaultIndex >= 0 && defaultIndex < values.length ? defaultIndex : 0;
      void setSelectedIndex(validIndex, {
        showToastOnOut: false,
        guard: false,
      });
    }

    scheduleVariantAvailabilityRefresh({ showToastOnOut: false, forceNow: true });
  }

  /* ================= OPTIONS (БЕЗ ИЗМЕНЕНИЙ) ================= */

  let optionsWrap = null;
  if (optionGroups.length) {
    optionsWrap = document.createElement("div");
    optionsWrap.className = "shop-pd-options";

    const optionsTitle = document.createElement("div");
    optionsTitle.className = "shop-pd-section-title shop-pd-options-title";
    optionsTitle.textContent = "Опции товара:";
    optionsWrap.appendChild(optionsTitle);

    const getOptionWord = (count) => {
      const abs = Math.abs(Number(count || 0));
      const mod10 = abs % 10;
      const mod100 = abs % 100;
      if (mod10 === 1 && mod100 !== 11) return "опции";
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "опций";
      return "опций";
    };

    const getOptionGroupSelectedCount = (groupState, groupType) => {
      if (!groupState) return 0;
      if (groupType === "single") return Number(groupState.selectedId || 0) > 0 ? 1 : 0;
      if (groupType === "multiple_group") return groupState.selectedIds?.size || 0;
      if (groupType === "multiple_item") {
        let count = 0;
        groupState.qtyById?.forEach((qty) => {
          if (Number(qty || 0) > 0) count += 1;
        });
        return count;
      }
      return 0;
    };

    const getOptionGroupMaxCount = (group, groupState, groupType) => {
      const stateMax = Number(groupState?.maxSelect);
      if (Number.isFinite(stateMax) && stateMax > 0) return stateMax;
      const groupMax = Number(group?.max_select);
      if (Number.isFinite(groupMax) && groupMax > 0) return groupMax;
      if (groupType === "single") return 1;
      if (groupType === "multiple_item") {
        const totalMax = (group.items || []).reduce((sum, item) => {
          const max = Number(item?.qty_max ?? 1);
          return sum + (Number.isFinite(max) && max > 0 ? 1 : 0);
        }, 0);
        return totalMax || 1;
      }
      return Math.max(1, (group.items || []).length);
    };

    const getOptionGroupHint = (group, groupState, groupType) => {
      const maxCount = getOptionGroupMaxCount(group, groupState, groupType);
      if (group?.is_required) {
        const selectedCount = getOptionGroupSelectedCount(groupState, groupType);
        return `Выбрано ${selectedCount} из ${maxCount} ${getOptionWord(maxCount)}`;
      }
      return `Выберите до ${maxCount} ${getOptionWord(maxCount)}`;
    };
    const expandedOptionGroups = runtime.renderProductDetailsInto._expandedOptionGroups || new Map();
    runtime.renderProductDetailsInto._expandedOptionGroups = expandedOptionGroups;

    const getOptionVariantContext = (item, groupState, allowVariants) => {
      const itemId = Number(item?.id);
      const variantGroup = allowVariants && Array.isArray(item?.variants) ? item.variants[0] : null;
      const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
      const hasVariants = Boolean(variantGroup && values.length);
      const unitLabel = runtime.str(
        variantGroup?.unit_short_title ||
        variantGroup?.unit_code ||
        variantGroup?.unit_title ||
        ""
      ).trim();
      const hasLetters = (value) => /[a-zа-я]/i.test(String(value || ""));
      const formatValueLabel = (value) => {
        const valueText = runtime.str(value);
        if (!valueText) return "";
        if (!unitLabel || hasLetters(valueText)) return valueText;
        return `${valueText} ${unitLabel}`;
      };
      const currentVariant = groupState?.variantByItemId?.get(itemId);
      const defaultIdx = variantGroup?.default_value_index != null
        ? Number(variantGroup.default_value_index)
        : (values.length ? 0 : null);
      const selectedIdx = Number.isFinite(Number(currentVariant?.variant_value_index))
        ? Number(currentVariant.variant_value_index)
        : defaultIdx;

      if (
        hasVariants &&
        !currentVariant &&
        Number.isFinite(selectedIdx) &&
        selectedIdx >= 0 &&
        selectedIdx < values.length
      ) {
        groupState.variantByItemId.set(
          itemId,
          runtime.buildOptionItemVariantState(item, variantGroup, selectedIdx, values[selectedIdx])
        );
      }

      return {
        hasVariants,
        variantGroup,
        values,
        selectedIdx: Number.isFinite(Number(selectedIdx)) ? Number(selectedIdx) : null,
        formatValueLabel,
      };
    };

    const createOptionProductSpinSide = (side, enabled, onClick) => {
      if (!enabled) {
        const placeholder = document.createElement("span");
        placeholder.className = `shop-pd-option-product-spin-placeholder is-${side}`;
        return placeholder;
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `shop-pd-option-product-spin-btn is-${side}`;
      btn.textContent = side === "minus" ? "−" : "+";
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onClick === "function") onClick(e);
      });
      return btn;
    };

    const renderOptionProductSpinCenter = (center, item, variantData, variantLabel, qtyMultiplier = 1) => {
      if (!center) return;
      const pricing = runtime.getOptionItemDisplayPricing(item, variantData);
      const qty = Math.max(1, Number(qtyMultiplier || 1));
      const currentTotal = runtime.roundPrice(Number(pricing.currentPrice || 0) * qty);
      const oldTotal = pricing.showOld
        ? runtime.roundPrice(Number(pricing.originalPrice || 0) * qty)
        : 0;
      center.innerHTML = "";

      const oldPrice = document.createElement("div");
      oldPrice.className = "shop-pd-option-product-old";
      oldPrice.textContent = pricing.showOld ? runtime.money(oldTotal) : "";
      center.appendChild(oldPrice);

      const price = document.createElement("div");
      price.className = "shop-pd-option-product-price";
      price.textContent = runtime.money(currentTotal);
      center.appendChild(price);

      const value = document.createElement("div");
      value.className = "shop-pd-option-product-value";
      value.textContent = variantLabel || "";
      center.appendChild(value);
    };

    const createOptionProductCard = ({
      item,
      groupState,
      groupType,
      allowVariants,
      isSelected,
      isUnavailable,
      onCardClick,
      onVariantChange,
      selectForSpin,
      resetQty,
      selectedQty = 0,
      qtyText = "",
      canQtyMinus = false,
      canQtyPlus = false,
      onQtyMinus,
      onQtyPlus,
    }) => {
      const itemId = Number(item.id);
      const variantCtx = getOptionVariantContext(item, groupState, allowVariants);
      const currentVariant = groupState.variantByItemId.get(itemId);
      const variantLabel = variantCtx.hasVariants && variantCtx.selectedIdx != null
        ? variantCtx.formatValueLabel(variantCtx.values[variantCtx.selectedIdx])
        : "";
      const photoQty = Number(selectedQty || 0);
      const pricing = runtime.getOptionItemDisplayPricing(item, currentVariant);

      const card = document.createElement("div");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.className = "shop-pd-option-product-card";
      card.classList.toggle("is-selected", !!isSelected);
      card.classList.toggle("is-unavailable", !!isUnavailable);
      card.addEventListener("click", (e) => {
        e.preventDefault();
        if (typeof onCardClick === "function") onCardClick(e);
      });
      card.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        if (typeof onCardClick === "function") onCardClick(e);
      });

      const photoWrap = document.createElement("div");
      photoWrap.className = "shop-pd-option-product-photo";
      if (item.photo) {
        photoWrap.appendChild(runtime.createOptimizedImage(item.photo, {
          type: "thumb",
          className: "shop-pd-option-product-img",
          alt: "",
        }));
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "shop-pd-option-product-img is-placeholder";
        placeholder.textContent = "—";
        photoWrap.appendChild(placeholder);
      }
      if (isSelected && photoQty > 0) {
        const qtyOverlay = document.createElement("div");
        qtyOverlay.className = "shop-pd-option-product-photo-qty";
        qtyOverlay.textContent = variantLabel || String(photoQty);
        photoWrap.appendChild(qtyOverlay);
      }
      card.appendChild(photoWrap);

      if (pricing.badgeText) {
        const badge = document.createElement("span");
        badge.className = "shop-pd-option-product-discount";
        badge.textContent = pricing.badgeText;
        card.appendChild(badge);
      }

      if (groupType === "multiple_item" && isSelected && typeof resetQty === "function") {
        const reset = document.createElement("button");
        reset.type = "button";
        reset.className = "shop-pd-option-product-reset";
        reset.textContent = "×";
        reset.setAttribute("aria-label", "Сбросить количество");
        reset.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          resetQty();
        });
        card.appendChild(reset);
      }

      const name = document.createElement("div");
      name.className = "shop-pd-option-product-name";
      name.textContent = runtime.str(item.title);
      card.appendChild(name);

      const spin = document.createElement("div");
      spin.className = "shop-pd-option-product-spin";
      const center = document.createElement("div");
      center.className = "shop-pd-option-product-spin-center";

      const canSwitchVariant = (nextIdx) => {
        if (!variantCtx.hasVariants) return false;
        if (!Number.isFinite(nextIdx) || nextIdx < 0 || nextIdx >= variantCtx.values.length) return false;
        if (!isSelected) return true;
        return canApplyDraftMutation(() => {
          groupState.variantByItemId.set(
            itemId,
            runtime.buildOptionItemVariantState(item, variantCtx.variantGroup, nextIdx, variantCtx.values[nextIdx])
          );
        });
      };
      const currentIdx = variantCtx.selectedIdx;
      const prevIdx = Number.isFinite(currentIdx) ? currentIdx - 1 : null;
      const nextIdx = Number.isFinite(currentIdx) ? currentIdx + 1 : null;
      const hasPrevVariant = variantCtx.hasVariants && canSwitchVariant(prevIdx);
      const hasNextVariant = variantCtx.hasVariants && canSwitchVariant(nextIdx);

      const applyVariantIdx = (idx) => {
        if (!canSwitchVariant(idx)) return;
        const mutator = () => {
          if (!isSelected && typeof selectForSpin === "function" && selectForSpin() === false) {
            return;
          }
          groupState.variantByItemId.set(
            itemId,
            runtime.buildOptionItemVariantState(item, variantCtx.variantGroup, idx, variantCtx.values[idx])
          );
        };
        const applied = runGuardedMutation(mutator, { showToastOnOut: true });
        if (!applied) return;
        if (typeof onVariantChange === "function") onVariantChange();
      };

      const useQtyButtons = groupType !== "multiple_item";
      const leftEnabled = variantCtx.hasVariants ? hasPrevVariant : (useQtyButtons && canQtyMinus);
      const rightEnabled = variantCtx.hasVariants ? hasNextVariant : (useQtyButtons && canQtyPlus);
      const leftAction = variantCtx.hasVariants ? () => applyVariantIdx(prevIdx) : onQtyMinus;
      const rightAction = variantCtx.hasVariants ? () => applyVariantIdx(nextIdx) : onQtyPlus;

      spin.appendChild(createOptionProductSpinSide("minus", leftEnabled, leftAction));
      renderOptionProductSpinCenter(
        center,
        item,
        currentVariant,
        variantLabel,
        groupType === "multiple_item" ? selectedQty : 1
      );
      spin.appendChild(center);
      spin.appendChild(createOptionProductSpinSide("plus", rightEnabled, rightAction));
      card.appendChild(spin);

      return card;
    };

    const renderProductOptionCardsGroup = (group, groupState, groupType, titleText, { append = true } = {}) => {
      if (!["single", "multiple_group", "multiple_item"].includes(groupType)) return false;

      const allowVariants = Boolean(group.allow_variants);
      const block = document.createElement("div");
      block.className = "shop-pd-option-block shop-pd-option-product-block";

      const titleRow = document.createElement("div");
      titleRow.className = "shop-pd-option-product-head";
      const minSelect = groupState.minSelect ?? group.min_select ?? 0;
      const maxSelect = groupState.maxSelect ?? group.max_select ?? null;
      const titleName = document.createElement("div");
      titleName.className = "shop-pd-section-title shop-pd-option-product-title";
      titleName.textContent = titleText;
      const titleHint = document.createElement("div");
      titleHint.className = "shop-pd-option-product-hint";
      titleHint.textContent = getOptionGroupHint(group, groupState, groupType);
      titleRow.appendChild(titleName);
      titleRow.appendChild(titleHint);
      block.appendChild(titleRow);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "shop-pd-option-product-cards";
      block.appendChild(itemsWrap);

      const rerender = () => {
        const nextBlock = renderProductOptionCardsGroup(group, groupState, groupType, titleText, { append: false });
        if (nextBlock && block.parentNode) block.replaceWith(nextBlock);
      };
      const notifyChanged = () => {
        refreshNutritionCard();
        if (typeof onSelectionChange === "function") onSelectionChange();
      };

      if (groupType === "single" && group?.is_required && (!groupState.selectedId || Number(groupState.selectedId) <= 0)) {
        const firstAvailable = (group.items || []).find((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          if (!(Number.isFinite(optionProductId) && optionProductId > 0)) return true;
          return canApplyDraftMutation(() => {
            groupState.selectedId = itemId;
          });
        });
        if (firstAvailable?.id) groupState.selectedId = Number(firstAvailable.id);
      }

      const groupKey = Number(group?.id || 0) || titleText;
      const isExpanded = expandedOptionGroups.get(groupKey) === true;
      let availableCardCount = 0;

      (group.items || []).forEach((item) => {
        const itemId = Number(item.id);
        const optionProductId = Number(item.target_product_id || 0);
        const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;

        let selected = false;
        let unavailable = false;
        let qtyText = "";
        let canQtyMinus = false;
        let canQtyPlus = false;
        let onQtyMinus = null;
        let onQtyPlus = null;

        if (groupType === "single") {
          selected = Number(groupState.selectedId || 0) === itemId;
          unavailable = !selected && hasOptionProductId && !canApplyDraftMutation(() => {
            groupState.selectedId = itemId;
          });
          if (unavailable) return;
        } else if (groupType === "multiple_group") {
          selected = groupState.selectedIds.has(itemId);
          unavailable = !selected && hasOptionProductId && !canApplyDraftMutation(() => {
            groupState.selectedIds.add(itemId);
          });
          if (unavailable) return;
        } else if (groupType === "multiple_item") {
          const itemMin = Number(item.qty_min ?? 1);
          const itemMax = Number(item.qty_max ?? 1);
          const currentQty = Number(groupState.qtyById.get(itemId) || 0);
          selected = currentQty > 0;
          const canApplyOptionQtyMutation = (nextQty) => {
            if (!hasOptionProductId) return true;
            const safeQty = Math.max(0, Number(nextQty || 0));
            return canApplyDraftMutation(() => {
              if (safeQty > 0) groupState.qtyById.set(itemId, safeQty);
              else groupState.qtyById.delete(itemId);
            });
          };
          const targetQty = Math.max(currentQty, itemMin, 1);
          unavailable = !selected && !canApplyOptionQtyMutation(targetQty);
          if (unavailable) return;
          qtyText = currentQty > 0 ? `${currentQty} шт` : "";
          canQtyMinus = currentQty > itemMin;
          canQtyPlus = currentQty < itemMax && canApplyOptionQtyMutation(currentQty > 0 ? currentQty + 1 : Math.max(itemMin, 1));
          onQtyMinus = () => {
            const current = Number(groupState.qtyById.get(itemId) || 0);
            const nextQty = Math.max(itemMin, current - 1);
            groupState.qtyById.set(itemId, nextQty);
            rerender();
            notifyChanged();
          };
          onQtyPlus = () => {
            const current = Number(groupState.qtyById.get(itemId) || 0);
            const nextQty = current > 0 ? Math.min(itemMax, current + 1) : Math.max(itemMin, 1);
            const applied = runGuardedMutation(() => {
              groupState.qtyById.set(itemId, nextQty);
              if (allowVariants && typeof setDefaultVariantForOptionItem === "function") {
                setDefaultVariantForOptionItem(item, groupState.variantByItemId);
              }
            }, { showToastOnOut: true });
            if (!applied) return;
            rerender();
            notifyChanged();
          };
        }

        availableCardCount += 1;
        if (!isExpanded && availableCardCount > 3) return;

        const card = createOptionProductCard({
          item,
          groupState,
          groupType,
          allowVariants,
          isSelected: selected,
          isUnavailable: unavailable,
          qtyText,
          selectedQty: groupType === "multiple_item"
            ? Number(groupState.qtyById.get(itemId) || 0)
            : (selected ? 1 : 0),
          canQtyMinus,
          canQtyPlus,
          onQtyMinus,
          onQtyPlus,
          resetQty: () => {
            groupState.qtyById.delete(itemId);
            rerender();
            notifyChanged();
          },
          selectForSpin: () => {
            if (selected) return true;
            if (groupType === "single") {
              groupState.selectedId = itemId;
              return true;
            }
            if (groupType === "multiple_group") {
              const count = groupState.selectedIds.size;
              if (maxSelect != null && count >= maxSelect) return false;
              groupState.selectedIds.add(itemId);
              return true;
            }
            if (groupType === "multiple_item") {
              const itemMin = Number(item.qty_min ?? 1);
              groupState.qtyById.set(itemId, Math.max(itemMin, 1));
              return true;
            }
            return true;
          },
          onVariantChange: () => {
            rerender();
            notifyChanged();
          },
          onCardClick: () => {
            if (groupType === "single") {
              if (selected && !group?.is_required) {
                groupState.selectedId = 0;
              } else if (!selected) {
                const applied = runGuardedMutation(() => {
                  groupState.selectedId = itemId;
                  if (allowVariants && typeof setDefaultVariantForOptionItem === "function") {
                    setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                  }
                }, { showToastOnOut: true });
                if (!applied) return;
              }
            } else if (groupType === "multiple_group") {
              const count = groupState.selectedIds.size;
              if (selected) {
                if (minSelect > 0 && count <= minSelect) return;
                groupState.selectedIds.delete(itemId);
              } else {
                if (maxSelect != null && count >= maxSelect) return;
                const applied = runGuardedMutation(() => {
                  groupState.selectedIds.add(itemId);
                  if (allowVariants && typeof setDefaultVariantForOptionItem === "function") {
                    setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                  }
                }, { showToastOnOut: true });
                if (!applied) return;
              }
            } else if (groupType === "multiple_item") {
              const current = Number(groupState.qtyById.get(itemId) || 0);
              const itemMin = Number(item.qty_min ?? 1);
              const itemMax = Number(item.qty_max ?? 1);
              const nextQty = current > 0 ? Math.min(itemMax, current + 1) : Math.max(itemMin, 1);
              if (nextQty <= current) return;
              const applied = runGuardedMutation(() => {
                groupState.qtyById.set(itemId, nextQty);
                if (allowVariants && typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
              }, { showToastOnOut: true });
              if (!applied) return;
            }
            rerender();
            notifyChanged();
          },
        });
        itemsWrap.appendChild(card);
      });

      if (availableCardCount > 3) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "shop-pd-option-product-more";
        toggle.textContent = isExpanded ? "Показать меньше" : "Показать все";
        toggle.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          expandedOptionGroups.set(groupKey, !isExpanded);
          rerender();
        });
        block.appendChild(toggle);
      }

      if (append) optionsWrap.appendChild(block);
      return block;
    };

    optionGroups.forEach((group) => {
      const groupState = selectionState.get(group.id);
      const groupType = groupState?.type || runtime.getOptionGroupUiType(group);
      const titleText = group.title || "Опция";
      if (renderProductOptionCardsGroup(group, groupState, groupType, titleText)) return;

      if (groupType === "single") {
        if (
          group?.is_required &&
          (!groupState.selectedId || Number(groupState.selectedId) <= 0)
        ) {
          const first = (group.items || [])[0];
          if (first?.id) groupState.selectedId = Number(first.id);
        }

        const block = document.createElement("div");
        block.className = "shop-pd-option-accordion";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-option-summary";
        titleRow.innerHTML = `<span>${titleText}</span><span></span>`;
        block.appendChild(titleRow);

        const slotWrap = document.createElement("div");
        slotWrap.className = "shop-pd-option-cards";
        block.appendChild(slotWrap);

        const list = document.createElement("div");
        list.className = "shop-pd-option-cards hidden";
        block.appendChild(list);

        const findSelected = () =>
          (group.items || []).find(
            (it) => Number(it.id) === Number(groupState.selectedId)
          ) || null;

        const openList = () => {
          slotWrap.classList.add("hidden");
          list.classList.remove("hidden");
          // При раскрытии прокручиваем карточку так, чтобы блок опции оказался под хедером
          if (block) {
            if (window.requestAnimationFrame) {
              requestAnimationFrame(() => smartScrollIntoView(block));
            } else {
              smartScrollIntoView(block);
            }
          }
        };
        const closeList = () => {
          // Если уже закрыто — ничего не делаем
          if (list.classList.contains("hidden")) return;

          // Плавно схлопываем список по высоте за 300мс.
          // Скролл не трогаем — остаёмся на том же месте.
          slideUp(list, 300, () => {
            slotWrap.classList.remove("hidden");
          });
        };

        function renderSlot() {
          slotWrap.innerHTML = "";
          const selected = findSelected();
          const selectedId = selected ? Number(selected.id) : null;
          
          // Варианты выбранной опции
          const itemVariants = selected && Array.isArray(selected.variants) ? selected.variants : [];
          const hasVariants = itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;
          
          // Функция для расчёта цены с учётом варианта
          const getPriceWithVariant = () => {
            const basePrice = Number(selected?.price || 0);
            if (!selectedId) return basePrice;
            const variantData = groupState.variantByItemId.get(selectedId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          card.style.position = "relative";
          if (hasVariants) {
            card.classList.add("has-variants");
          }

          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";

          const thumbWrap = document.createElement("div");
          thumbWrap.className = "shop-pd-option-thumb-wrap";
          const thumb = document.createElement(
            selected?.photo ? "img" : "div"
          );
          thumb.className = "shop-pd-option-thumb";
          if (selected?.photo) thumb.src = selected.photo;
          else thumb.textContent = "—";
          thumbWrap.appendChild(thumb);
          if (selected) {
            runtime.decorateOptionItemThumb(thumbWrap, selected, groupState.variantByItemId.get(selectedId));
          }
          cardContent.appendChild(thumbWrap);

          const info = document.createElement("div");
          info.className = "shop-pd-option-info";
          info.style.flex = "1";
          info.style.minWidth = "0";
          
          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          let variantLabelEl = null;
          if (selected && hasVariants) {
            variantLabelEl = document.createElement("span");
            const savedVariant = groupState.variantByItemId.get(selectedId);
            if (savedVariant && savedVariant.variant_label) {
              variantLabelEl.textContent = savedVariant.variant_label + " ";
            }
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = selected ? runtime.str(selected.title) : "Выбрать";
          
          if (variantLabelEl && variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          info.appendChild(firstLine);
          
          // Вторая строка: цена
          const priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          if (selected) {
            runtime.renderOptionItemPrice(priceEl, selected, groupState.variantByItemId.get(selectedId));
          }
          info.appendChild(priceEl);
          
          cardContent.appendChild(info);

          // ВАЖНО: для single шестерёнка НЕ должна быть на выбранной карточке.
          // Её показываем только внутри списка после "Изменить".

          card.appendChild(cardContent);

          // Кнопка "Изменить" в правом верхнем углу
          const edit = document.createElement("button");
          edit.type = "button";
          edit.className = "shop-pd-option-edit";
          edit.textContent = "Изменить >";
          edit.style.cssText = `
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            padding: 4px 8px;
            color: var(--text-muted, #888);
            font-size: 13px;
            cursor: pointer;
            z-index: 10;
          `;
          edit.addEventListener("click", (e) => {
            e.stopPropagation();
            openList();
          });
          card.appendChild(edit);
          card.addEventListener("click", openList);
          slotWrap.appendChild(card);
        }

        // ===== ДОБАВИЛИ "ПУСТУЮ" КАРТОЧКУ ДЛЯ НЕОБЯЗАТЕЛЬНОЙ ОПЦИИ =====
        if (!group?.is_required) {
          const emptyCard = document.createElement("div");
          emptyCard.className = "shop-pd-option-card is-clickable";
          emptyCard.addEventListener("click", () => {
            groupState.selectedId = 0; // сброс выбора
            renderSlot();
            closeList();
            refreshNutritionCard();
            if (onSelectionChange) onSelectionChange();
          });

          emptyCard.innerHTML = `
            <div class="shop-pd-option-thumb">—</div>
            <div class="shop-pd-option-info">
              <div class="shop-pd-option-name">Не выбирать</div>
            </div>
          `;
          list.appendChild(emptyCard);
        }
        // =================================================================

        // Контроллеры аккордеонов вариантов внутри этой группы,
        // чтобы одновременно был открыт только один.
        const singleVariantControllers = [];

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const isOptionUnavailableNow = () => {
            if (!hasOptionProductId) return false;
            const allowed = canApplyDraftMutation(() => {
              groupState.selectedId = itemId;
            });
            return !allowed;
          };
          const isSelectedNow = () => Number(groupState.selectedId || 0) === itemId;
          const shouldHideCardNow = () => !isSelectedNow() && isOptionUnavailableNow();
          if (shouldHideCardNow()) return;
          const allowVariants = Boolean(group.allow_variants);
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = "shop-pd-option-card is-clickable";
          if (hasVariants) card.classList.add("has-variants");
          const refreshOptionCardState = () => {
            const isSelected = isSelectedNow();
            const unavailable = !isSelected && isOptionUnavailableNow();
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
          };
          refreshOptionCardState();

          // content row
          const row = document.createElement("div");
          row.className = "shop-pd-option-card-content";

          const thumbWrap = document.createElement("div");
          thumbWrap.className = "shop-pd-option-thumb-wrap";
          if (item.photo) {
            const img = runtime.createOptimizedImage(item.photo, {
              type: 'thumb',
              className: 'shop-pd-option-thumb',
              alt: ''
            });
            thumbWrap.appendChild(img);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "shop-pd-option-thumb";
            placeholder.textContent = "—";
            thumbWrap.appendChild(placeholder);
          }
          row.appendChild(thumbWrap);

          const infoWrap = document.createElement("div");
          infoWrap.className = "shop-pd-option-info";

          const nameWrap = document.createElement("div");
          nameWrap.className = "shop-pd-option-name";
          nameWrap.textContent = runtime.str(item.title);
          infoWrap.appendChild(nameWrap);

          if (hasVariants) {
            const variantLabel = document.createElement("div");
            variantLabel.className = "shop-pd-option-variant-label";
            variantLabel.style.display = "none";
            infoWrap.appendChild(variantLabel);
          }

          const initialPriceEl = document.createElement("div");
          initialPriceEl.className = "shop-pd-option-price";
          infoWrap.appendChild(initialPriceEl);

          row.appendChild(infoWrap);

          let variantLabelEl = hasVariants ? row.querySelector(".shop-pd-option-variant-label") : null;
          const priceEl = row.querySelector(".shop-pd-option-price");
          if (priceEl) {
            runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
          }
          runtime.decorateOptionItemThumb(thumbWrap, item, groupState.variantByItemId.get(itemId));
          const savedVariant = groupState.variantByItemId.get(itemId);
          
          // Автоматически выбираем дефолтный вариант при рендере, если он ещё не выбран
          if (hasVariants && !savedVariant) {
            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            if (values.length > 0) {
              const unitLabel = runtime.str(
                variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || ""
              ).trim();
              const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
              const formatValueLabel = (val) => {
                const valueText = runtime.str(val);
                if (!valueText) return "";
                if (!unitLabel || hasLetters(valueText)) return valueText;
                return `${valueText} ${unitLabel}`;
              };
              
              // Определяем дефолтный индекс: сначала из группы, потом первый (0)
              const defaultIdx = variantGroup.default_value_index != null 
                ? Number(variantGroup.default_value_index) 
                : (values.length > 0 ? 0 : null);
              
              if (defaultIdx != null && defaultIdx >= 0 && defaultIdx < values.length) {
                // Рассчитываем цену дефолтного варианта
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
                const priceDiff = unitPrice - Number(item.price || 0);
                
                // Сохраняем дефолтный вариант в state
                groupState.variantByItemId.set(
                  itemId,
                  runtime.buildOptionItemVariantState(item, variantGroup, defaultIdx, values[defaultIdx])
                );
                
                // Обновляем отображение цены и лейбла варианта
                if (priceEl) {
                  runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
                }
                runtime.decorateOptionItemThumb(thumbWrap, item, groupState.variantByItemId.get(itemId));
                if (variantLabelEl) {
                  variantLabelEl.textContent = formatValueLabel(values[defaultIdx]);
                  variantLabelEl.style.display = "block";
                }
              }
            }
          } else if (variantLabelEl && savedVariant?.variant_label) {
            // Если вариант уже выбран, обновляем отображение
            variantLabelEl.textContent = savedVariant.variant_label;
            variantLabelEl.style.display = "block";
            if (priceEl) {
              runtime.renderOptionItemPrice(priceEl, item, savedVariant);
            }
            runtime.decorateOptionItemThumb(thumbWrap, item, savedVariant);
          }

          // gear + accordion (only inside list for single)
          let gearBtn = null;
          let variantAccordion = null;
          let accordionOpen = false;

          const setGearState = (open) => {
            accordionOpen = !!open;
            if (!gearBtn || !variantAccordion) return;
            setOptionVariantAccordionState(variantAccordion, accordionOpen);
            gearBtn.classList.toggle("is-open", accordionOpen);
          };

          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              if (accordionOpen) {
                setGearState(false);
              } else {
                singleVariantControllers.forEach((ctrl) => {
                  if (ctrl.itemId !== itemId) ctrl.setOpen(false);
                });
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                groupState.selectedId = itemId;
                refreshNutritionCard();
                if (typeof onSelectionChange === "function") onSelectionChange();
                setGearState(true);
              }
            });

            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = runtime.str(
              variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || ""
            ).trim();
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = runtime.str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(
                itemId,
                runtime.buildOptionItemVariantState(item, variantGroup, defaultIdx, values[defaultIdx])
              );
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(
                  itemId,
                  runtime.buildOptionItemVariantState(item, variantGroup, idx, values[idx])
                );
              },
              isOptionItemSelected: () => Number(groupState.selectedId || 0) === itemId,
            });
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);
              if (selectedIdx === idx) {
                variantBtn.style.background = "var(--accent-color, #ff7a00)";
                variantBtn.style.color = "#fff";
                variantBtn.style.borderColor = "var(--accent-color, #ff7a00)";
              }

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;

                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                const applied = await runGuardedMutation(() => {

                // 1) Фиксируем выбранный вариант для этой опции
                groupState.variantByItemId.set(
                  itemId,
                  runtime.buildOptionItemVariantState(item, variantGroup, idx, value)
                );

                // 2) Сразу считаем, что выбран именно этот товар-опция
                //    (последний кликнутый вариант = актуальный выбор группы)
                groupState.selectedId = itemId;
                }, { showToastOnOut: true });
                if (!applied) return;

                // 3) Мгновенно обновляем цену и вариант в карточке списка
                if (priceEl) {
                  runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
                }

                // 4) Перекрашиваем кнопки вариантов в скролле
                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  const isSel = btnIdx === idx;
                  btn.classList.toggle("is-selected", isSel);
                  if (isSel) {
                    btn.style.background = "var(--accent-color, #ff7a00)";
                    btn.style.color = "#fff";
                    btn.style.borderColor = "var(--accent-color, #ff7a00)";
                  } else {
                    btn.style.background = "var(--bg-secondary, #f5f5f5)";
                    btn.style.color = "var(--text-primary, #333)";
                    btn.style.borderColor = "var(--border-color, #ddd)";
                  }
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                // 5) Обновляем подпись варианта в первой строке (вариант + название)
                if (variantLabelEl) {
                  variantLabelEl.textContent = formatValueLabel(value) + " ";
                }

                // 6) Обновляем summary-карточку, чтобы сверху сразу отобразился новый вариант
                renderSlot();

                // 7) Уведомляем об изменении — пересчёт цены на кнопке "В корзину" и т.п.
                refreshNutritionCard();
                if (typeof onSelectionChange === "function") onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);
            row.appendChild(gearBtn);

            // Регистрируем контроллер для управления открытым аккордеоном
            singleVariantControllers.push({
              itemId,
              setOpen: setGearState,
            });
          }

          card.appendChild(row);
          if (variantAccordion) card.appendChild(variantAccordion);

          // Выбор товара (клик по карточке) — но не по шестерёнке/вариантам
          card.addEventListener("click", async (e) => {
            if (e.target.closest(".shop-pd-option-gear-btn") || e.target.closest(".shop-pd-option-variant-accordion")) {
              return;
            }
            if (Number(groupState.selectedId || 0) !== itemId && isOptionUnavailableNow()) {
              runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
              return;
            }
            const applied = runGuardedMutation(() => {
              groupState.selectedId = itemId;
              if (hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                setDefaultVariantForOptionItem(item, groupState.variantByItemId);
              }
            }, { showToastOnOut: true });
            if (!applied) return;
            renderSlot();
            closeList();
            refreshNutritionCard();
            if (typeof onSelectionChange === "function") onSelectionChange();
          });

          // Доступность рассчитывается локально в isOptionUnavailableNow()

          list.appendChild(card);
        });

        renderSlot();
        optionsWrap.appendChild(block);
        return;
      }

      // Обработка типа "multiple_group" - несколько товаров с общим лимитом группы
      if (groupType === "multiple_group") {
        const allowVariants = Boolean(group.allow_variants);
        const block = document.createElement("div");
        block.className = "shop-pd-option-block";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-section-title";
        const minSelect = groupState.minSelect ?? group.min_select ?? 0;
        const maxSelect = groupState.maxSelect ?? group.max_select ?? null;
        const limitText = minSelect > 0 || maxSelect != null 
          ? ` (${minSelect > 0 ? `мин: ${minSelect}` : ""}${minSelect > 0 && maxSelect != null ? ", " : ""}${maxSelect != null ? `макс: ${maxSelect}` : ""})`
          : "";
        titleRow.textContent = `${titleText}${limitText}`;
        block.appendChild(titleRow);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "shop-pd-option-cards";
        block.appendChild(itemsWrap);

        const updateSelectedCount = () => {
          const selectedCount = groupState.selectedIds.size;
          const isValid = (minSelect === 0 || selectedCount >= minSelect) && 
                         (maxSelect == null || selectedCount <= maxSelect);
          
          // Обновляем состояние валидности (можно добавить визуальную индикацию)
          return { count: selectedCount, isValid };
        };

        // Контроллеры аккордеонов вариантов для multiple_group,
        // чтобы одновременно был открыт только один.
        const multiVariantControllers = [];

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const isOptionUnavailableNow = () => {
            if (!hasOptionProductId) return false;
            const allowed = canApplyDraftMutation(() => {
              groupState.selectedIds.add(itemId);
            });
            return !allowed;
          };
          const isSelectedNow = () => groupState.selectedIds.has(itemId);
          if (!isSelectedNow() && isOptionUnavailableNow()) return;
          const isSelected = isSelectedNow();

          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = `shop-pd-option-card is-clickable ${isSelected ? "is-selected" : ""}`;
          card.classList.toggle("is-unavailable", !isSelected && isOptionUnavailableNow());
          if (hasVariants) {
            card.classList.add("has-variants");
          }
          
          // Функция для расчёта цены с учётом варианта
          const getPriceWithVariant = () => {
            const basePrice = Number(item.price || 0);
            const variantData = groupState.variantByItemId.get(itemId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };
          
          const checkbox = document.createElement("span");
          checkbox.className = "shop-pd-option-radio" + (isSelected ? " is-checked" : "");
          checkbox.checked = isSelected;
          
          // Элементы для обновления
          let priceEl = null;
          let variantLabelEl = null;
          
          const updateCard = () => {
            const newIsSelected = isSelectedNow();
            const unavailable = !newIsSelected && isOptionUnavailableNow();
            card.classList.toggle("is-selected", newIsSelected);
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
            checkbox.checked = newIsSelected;
            checkbox.classList.toggle("is-checked", newIsSelected);
            if (priceEl) {
              runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
            }
            if (thumbWrap) {
              runtime.decorateOptionItemThumb(thumbWrap, item, groupState.variantByItemId.get(itemId));
            }
            if (variantLabelEl) {
              const variantData = groupState.variantByItemId.get(itemId);
              if (variantData && variantData.variant_label) {
                variantLabelEl.textContent = variantData.variant_label + " ";
              } else {
                variantLabelEl.textContent = "";
              }
            }
          };
          
          // Основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";

          // Фото
          const thumbWrap = document.createElement("div");
          thumbWrap.className = "shop-pd-option-thumb-wrap";
          if (item.photo) {
            const img = runtime.createOptimizedImage(item.photo, {
              type: 'thumb',
              className: 'shop-pd-option-thumb',
              alt: ''
            });
            thumbWrap.appendChild(img);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "shop-pd-option-thumb";
            placeholder.textContent = "—";
            thumbWrap.appendChild(placeholder);
          }
          runtime.decorateOptionItemThumb(thumbWrap, item, groupState.variantByItemId.get(itemId));
          cardContent.appendChild(thumbWrap);

          // Информация
          const infoWrap = document.createElement("div");
          infoWrap.className = "shop-pd-option-info";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          if (hasVariants) {
            variantLabelEl = document.createElement("span");
            const savedVariant = groupState.variantByItemId.get(itemId);
            if (savedVariant && savedVariant.variant_label) {
              variantLabelEl.textContent = savedVariant.variant_label + " ";
            }
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = runtime.str(item.title);
          
          if (variantLabelEl && variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          infoWrap.appendChild(firstLine);

          // Вторая строка: цена
          priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
          infoWrap.appendChild(priceEl);

          cardContent.appendChild(infoWrap);

          // Шестерёнка для вариантов
          let gearBtn = null;
          let variantAccordion = null;
          
          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;
            cardContent.appendChild(gearBtn);
            cardContent.appendChild(checkbox);

            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = runtime.str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();
            
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = runtime.str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(
                itemId,
                runtime.buildOptionItemVariantState(item, variantGroup, defaultIdx, values[defaultIdx])
              );
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(
                  itemId,
                  runtime.buildOptionItemVariantState(item, variantGroup, idx, values[idx])
                );
              },
              isOptionItemSelected: () => groupState.selectedIds.has(itemId),
            });
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;
                
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                const applyVariantChange = () => {
                  groupState.variantByItemId.set(
                    itemId,
                    runtime.buildOptionItemVariantState(item, variantGroup, idx, value)
                  );
                };
                if (groupState.selectedIds.has(itemId)) {
                  const applied = await runGuardedMutation(applyVariantChange, {
                    showToastOnOut: true,
                  });
                  if (!applied) return;
                } else {
                  applyVariantChange();
                }

                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  btn.classList.toggle("is-selected", btnIdx === idx);
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                updateCard();
                refreshNutritionCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);

            let accordionOpen = false;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              if (accordionOpen) {
                // Перед открытием закрываем другие аккордеоны в группе
                multiVariantControllers.forEach((ctrl) => {
                  if (ctrl.itemId !== itemId) ctrl.close();
                });
                // Дефолтный подсвеченный вариант
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                setOptionVariantAccordionState(variantAccordion, true);
                gearBtn.classList.add("is-open");
                updateCard();
                refreshNutritionCard();
                if (typeof onSelectionChange === "function") onSelectionChange();
              } else {
                setOptionVariantAccordionState(variantAccordion, false);
                gearBtn.classList.remove("is-open");
              }
            });

            // Регистрируем контроллер, чтобы можно было закрыть этот аккордеон при открытии другого
            multiVariantControllers.push({
              itemId,
              close: () => {
                accordionOpen = false;
                setOptionVariantAccordionState(variantAccordion, false);
                gearBtn.classList.remove("is-open");
              },
            });
          }

          // Если нет вариантов — чекбокс добавляем после инфо (справа)
          if (!hasVariants) {
            cardContent.appendChild(checkbox);
          }

          card.appendChild(cardContent);

          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          card.addEventListener("click", async (e) => {
            // Не переключаем если кликнули на шестерёнку или вариант
            if (e.target.closest(".shop-pd-option-gear-btn") || e.target.closest(".shop-pd-option-variant-accordion")) {
              return;
            }

            const { count } = updateSelectedCount();
            const currentlySelected = groupState.selectedIds.has(itemId);
            const maxReached = maxSelect != null && count >= maxSelect && !currentlySelected;
            
            if (maxReached) {
              return;
            }

            if (currentlySelected) {
              groupState.selectedIds.delete(itemId);
            } else {
              if (isOptionUnavailableNow()) {
                runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
                return;
              }
              const applied = runGuardedMutation(() => {
                groupState.selectedIds.add(itemId);
                if (hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
              }, { showToastOnOut: true });
              if (!applied) return;
            }

            updateCard();
            refreshNutritionCard();
            if (onSelectionChange) onSelectionChange();
          });
          
          itemsWrap.appendChild(card);

        });

        optionsWrap.appendChild(block);
        return;
      }

      // Обработка типа "multiple_item" - несколько товаров с индивидуальными лимитами
      if (groupType === "multiple_item") {
        const allowVariants = Boolean(group.allow_variants);
        const block = document.createElement("div");
        block.className = "shop-pd-option-block";

        const titleRow = document.createElement("div");
        titleRow.className = "shop-pd-section-title";
        titleRow.textContent = titleText;
        block.appendChild(titleRow);

        const itemsWrap = document.createElement("div");
        itemsWrap.className = "shop-pd-option-cards";
        block.appendChild(itemsWrap);

        (group.items || []).forEach((item) => {
          const itemId = Number(item.id);
          const optionProductId = Number(item.target_product_id || 0);
          const hasOptionProductId = Number.isFinite(optionProductId) && optionProductId > 0;
          const itemMin = item.qty_min ?? 1;
          const itemMax = item.qty_max ?? 1;
          const canApplyOptionQtyMutation = (nextQty) => {
            if (!hasOptionProductId) return true;
            const safeQty = Math.max(0, Number(nextQty || 0));
            return canApplyDraftMutation(() => {
              if (safeQty > 0) groupState.qtyById.set(itemId, safeQty);
              else groupState.qtyById.delete(itemId);
            });
          };
          const isOptionUnavailableNow = () => {
            const currentOptQty = groupState.qtyById.get(itemId) || 0;
            const targetQty = Math.max(currentOptQty, 1);
            return !canApplyOptionQtyMutation(targetQty);
          };
          const isOptionUnavailableForPlus = () => {
            const currentOptQty = groupState.qtyById.get(itemId) || 0;
            const nextQty = currentOptQty === 0
              ? Math.max(itemMin, 1)
              : Math.min(itemMax, currentOptQty + 1);
            if (nextQty <= currentOptQty) return false;
            return !canApplyOptionQtyMutation(nextQty);
          };
          const isSelectedNow = () => (Number(groupState.qtyById.get(itemId)) || 0) > 0;
          if (!isSelectedNow() && isOptionUnavailableNow()) return;
          // Текущее количество из state
          const currentQty = groupState.qtyById.get(itemId) || 0;
          const isSelected = currentQty > 0;
          
          // Варианты товара-опции
          const itemVariants = Array.isArray(item.variants) ? item.variants : [];
          const hasVariants = allowVariants && itemVariants.length > 0 && itemVariants[0]?.values?.length > 0;

          const card = document.createElement("div");
          card.className = `shop-pd-option-card ${isSelected ? "is-selected" : ""}`;
          card.classList.toggle("is-unavailable", !isSelected && isOptionUnavailableNow());

          const qtyControls = document.createElement("div");
          qtyControls.className = "shop-pd-option-qty-controls";
          qtyControls.style.display = "flex";
          qtyControls.style.gap = "8px";
          qtyControls.style.alignItems = "center";
          qtyControls.style.marginLeft = "auto";

          const btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.className = "btn btn-sm shop-pd-option-qty-btn";
          btnMinus.textContent = "−";
          // Кнопка "-" отключена если qty <= itemMin (обязательные опции нельзя убрать)
          btnMinus.disabled = currentQty <= itemMin;
          btnMinus.addEventListener("click", (e) => {
            e.stopPropagation();
            const current = groupState.qtyById.get(itemId) || 0;
            // Уменьшаем, но не ниже itemMin
            const newQty = Math.max(itemMin, current - 1);
            if (newQty > 0) {
              groupState.qtyById.set(itemId, newQty);
              if (hasVariants && typeof setDefaultVariantForOptionItem === "function") setDefaultVariantForOptionItem(item, groupState.variantByItemId);
            } else {
              groupState.qtyById.delete(itemId);
            }
            updateItemCard();
            refreshNutritionCard();
            if (onSelectionChange) onSelectionChange();
          });

          const qtyDisplay = document.createElement("span");
          qtyDisplay.style.minWidth = "24px";
          qtyDisplay.style.textAlign = "center";
          qtyDisplay.textContent = String(currentQty);

          const btnPlus = document.createElement("button");
          btnPlus.type = "button";
          btnPlus.className = "btn btn-sm shop-pd-option-qty-btn";
          btnPlus.textContent = "+";
          btnPlus.disabled = currentQty >= itemMax || isOptionUnavailableForPlus();

          const bindPressFx = (btn) => {
            if (!btn) return;
            const pressOn = () => {
              if (btn.disabled) return;
              btn.classList.add("is-pressed");
            };
            const pressOff = () => btn.classList.remove("is-pressed");
            btn.addEventListener("pointerdown", pressOn);
            btn.addEventListener("pointerup", pressOff);
            btn.addEventListener("pointercancel", pressOff);
            btn.addEventListener("pointerleave", pressOff);
            btn.addEventListener("blur", pressOff);
          };
          bindPressFx(btnMinus);
          bindPressFx(btnPlus);
          btnPlus.addEventListener("click", (e) => {
            e.stopPropagation();
            if (isOptionUnavailableForPlus()) {
              btnPlus.disabled = true;
              runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
              return;
            }
            const current = groupState.qtyById.get(itemId) || 0;
            let newQty;
            if (current === 0) {
              newQty = Math.max(itemMin, 1);
            } else {
              newQty = Math.min(itemMax, current + 1);
            }
            const applied = runGuardedMutation(() => {
              groupState.qtyById.set(itemId, newQty);
              if (newQty > 0 && hasVariants && typeof setDefaultVariantForOptionItem === "function") {
                setDefaultVariantForOptionItem(item, groupState.variantByItemId);
              }
            }, { showToastOnOut: true });
            if (!applied) {
              btnPlus.disabled = true;
              return;
            }
            updateItemCard();
            refreshNutritionCard();
            if (onSelectionChange) onSelectionChange();
          });

          qtyControls.appendChild(btnMinus);
          qtyControls.appendChild(qtyDisplay);
          qtyControls.appendChild(btnPlus);

          // Функция для расчёта цены опции с учётом варианта
          const getItemPriceWithVariant = () => {
            const basePrice = Number(item.price || 0);
            const variantData = groupState.variantByItemId.get(itemId);
            if (variantData && Number.isFinite(variantData.variant_price_diff)) {
              return basePrice + variantData.variant_price_diff;
            }
            return basePrice;
          };

          // Элемент для отображения выбранного варианта
          let variantLabelEl = null;
          let priceEl = null;
          let _optionVariantCtrl = null;

          const updateItemCard = () => {
            const newQty = groupState.qtyById.get(itemId) || 0;
            const newIsSelected = newQty > 0;
            const unavailable = !newIsSelected && isOptionUnavailableNow();
            card.classList.toggle("is-selected", newIsSelected);
            card.classList.toggle("is-unavailable", unavailable);
            card.style.display = unavailable ? "none" : "";
            qtyDisplay.textContent = String(newQty);
            // Кнопка "-" отключена если qty <= itemMin (обязательные опции нельзя убрать)
            btnMinus.disabled = newQty <= itemMin;
            btnPlus.disabled = newQty >= itemMax || isOptionUnavailableForPlus();

            // Обновляем цену с учётом варианта
            if (priceEl) {
              runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
            }

            // Обновляем отображение выбранного варианта
            if (variantLabelEl) {
              const variantData = groupState.variantByItemId.get(itemId);
              if (variantData && variantData.variant_label) {
                variantLabelEl.textContent = variantData.variant_label + " ";
              } else {
                variantLabelEl.textContent = "";
              }
            }

            // Обновляем доступность вариантов при изменении qty
            if (_optionVariantCtrl) {
              _optionVariantCtrl.scheduleRefresh();
            }
          };

          // Создаём основной контент карточки
          const cardContent = document.createElement("div");
          cardContent.className = "shop-pd-option-card-content";
          cardContent.style.display = "flex";
          cardContent.style.alignItems = "center";
          cardContent.style.width = "100%";
          cardContent.style.gap = "8px";

          // Фото
          if (item.photo) {
            const img = runtime.createOptimizedImage(item.photo, {
              type: 'thumb',
              className: 'shop-pd-option-thumb',
              alt: ''
            });
            cardContent.appendChild(img);
          } else {
            const placeholder = document.createElement("div");
            placeholder.className = "shop-pd-option-thumb";
            placeholder.textContent = "—";
            cardContent.appendChild(placeholder);
          }

          // Информация (название, вариант, цена)
          const infoWrap = document.createElement("div");
          infoWrap.className = "shop-pd-option-info";

          // Первая строка: вариант + название
          const firstLine = document.createElement("div");
          firstLine.className = "shop-pd-option-name";
          
          variantLabelEl = document.createElement("span");
          variantLabelEl.style.fontSize = "inherit";
          variantLabelEl.style.fontWeight = "inherit";
          variantLabelEl.style.color = "inherit";
          const savedVariant = groupState.variantByItemId.get(itemId);
          if (savedVariant && savedVariant.variant_label) {
            variantLabelEl.textContent = savedVariant.variant_label + " ";
          }
          
          const nameEl = document.createElement("span");
          nameEl.textContent = runtime.str(item.title);
          
          if (variantLabelEl.textContent) {
            firstLine.appendChild(variantLabelEl);
          }
          firstLine.appendChild(nameEl);
          infoWrap.appendChild(firstLine);

          // Вторая строка: цена
          priceEl = document.createElement("div");
          priceEl.className = "shop-pd-option-price";
          runtime.renderOptionItemPrice(priceEl, item, groupState.variantByItemId.get(itemId));
          infoWrap.appendChild(priceEl);

          cardContent.appendChild(infoWrap);

          // Шестерёнка для вариантов (если есть варианты)
          let gearBtn = null;
          let variantAccordion = null;
          
          if (hasVariants) {
            gearBtn = document.createElement("button");
            gearBtn.type = "button";
            gearBtn.className = "shop-pd-option-gear-btn";
            gearBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>`;

            // Аккордеон с вариантами
            variantAccordion = document.createElement("div");
            variantAccordion.className = "shop-pd-option-variant-accordion";

            const variantScroll = document.createElement("div");
            variantScroll.className = "shop-pd-option-variant-scroll";

            // Drag-to-scroll для мыши
            let isDown = false;
            let startX;
            let scrollLeft;
            variantScroll.addEventListener("mousedown", (e) => {
              isDown = true;
              variantScroll.style.cursor = "grabbing";
              startX = e.pageX - variantScroll.offsetLeft;
              scrollLeft = variantScroll.scrollLeft;
            });
            variantScroll.addEventListener("mouseleave", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mouseup", () => {
              isDown = false;
              variantScroll.style.cursor = "grab";
            });
            variantScroll.addEventListener("mousemove", (e) => {
              if (!isDown) return;
              e.preventDefault();
              const x = e.pageX - variantScroll.offsetLeft;
              const walk = (x - startX) * 1.5;
              variantScroll.scrollLeft = scrollLeft - walk;
            });

            // Рендерим варианты (берём первую группу)
            const variantGroup = itemVariants[0];
            const values = variantGroup.values || [];
            const unitLabel = runtime.str(variantGroup.unit_short_title || variantGroup.unit_code || variantGroup.unit_title || "").trim();
            
            const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
            const formatValueLabel = (val) => {
              const valueText = runtime.str(val);
              if (!valueText) return "";
              if (!unitLabel || hasLetters(valueText)) return valueText;
              return `${valueText} ${unitLabel}`;
            };

            // Текущий выбранный индекс
            const currentVariant = groupState.variantByItemId.get(itemId);
            // Определяем дефолтный индекс: сначала из привязки, потом из группы, потом первый (0)
            const defaultIdx = variantGroup.default_value_index != null ? Number(variantGroup.default_value_index) : 
                              (values.length > 0 ? 0 : null);
            let selectedIdx = currentVariant?.variant_value_index ?? defaultIdx;
            
            // Если вариант еще не выбран, но есть дефолт - автоматически выбираем его
            if (selectedIdx != null && !currentVariant && defaultIdx != null && values[defaultIdx] != null) {
              const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, defaultIdx);
              const priceDiff = unitPrice - Number(item.price || 0);
              groupState.variantByItemId.set(
                itemId,
                runtime.buildOptionItemVariantState(item, variantGroup, defaultIdx, values[defaultIdx])
              );
            }

            const optionVariantAvailabilityCtrl = createOptionVariantAvailabilityController({
              values,
              getSelectedIndex: () => Number(groupState.variantByItemId.get(itemId)?.variant_value_index),
              setDraftForIndex: (idx) => {
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);
                groupState.variantByItemId.set(
                  itemId,
                  runtime.buildOptionItemVariantState(item, variantGroup, idx, values[idx])
                );
              },
              isOptionItemSelected: () => (Number(groupState.qtyById.get(itemId)) || 0) > 0,
            });
            _optionVariantCtrl = optionVariantAvailabilityCtrl;
            registerVariantAvailabilityRefresher(optionVariantAvailabilityCtrl.scheduleRefresh);

            values.forEach((value, idx) => {
              const variantBtn = document.createElement("button");
              variantBtn.type = "button";
              variantBtn.className = `shop-pd-option-variant-btn ${selectedIdx === idx ? "is-selected" : ""}`;
              variantBtn.textContent = formatValueLabel(value);
              variantBtn.dataset.variantIndex = String(idx);
              optionVariantAvailabilityCtrl.registerButton(idx, variantBtn);

              variantBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (variantBtn.disabled) return;

                // Обновляем выбранный вариант в state
                const unitPrice = runtime.getOptionItemVariantUnitPrice(item, variantGroup, idx);
                const priceDiff = unitPrice - Number(item.price || 0);

                const applyVariantChange = () => {
                  groupState.variantByItemId.set(
                    itemId,
                    runtime.buildOptionItemVariantState(item, variantGroup, idx, value)
                  );
                };
                if ((Number(groupState.qtyById.get(itemId)) || 0) > 0) {
                  const applied = await runGuardedMutation(applyVariantChange, {
                    showToastOnOut: true,
                  });
                  if (!applied) return;
                } else {
                  applyVariantChange();
                }

                // Обновляем UI всех кнопок вариантов
                variantScroll.querySelectorAll(".shop-pd-option-variant-btn").forEach((btn) => {
                  const btnIdx = Number(btn.dataset.variantIndex);
                  btn.classList.toggle("is-selected", btnIdx === idx);
                  optionVariantAvailabilityCtrl.applyButtonState(btnIdx);
                });

                // Обновляем карточку (цена, лейбл варианта)
                updateItemCard();
                refreshNutritionCard();
                if (onSelectionChange) onSelectionChange();
              });

              variantScroll.appendChild(variantBtn);
            });

            optionVariantAvailabilityCtrl.scheduleRefresh({ forceNow: true });

            variantAccordion.appendChild(variantScroll);

            let accordionOpen = false;
            gearBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              accordionOpen = !accordionOpen;
              if (accordionOpen) {
                if (typeof setDefaultVariantForOptionItem === "function") {
                  setDefaultVariantForOptionItem(item, groupState.variantByItemId);
                }
                refreshNutritionCard();
                if (typeof onSelectionChange === "function") onSelectionChange();
              }
              setOptionVariantAccordionState(variantAccordion, accordionOpen);
              gearBtn.classList.toggle("is-open", accordionOpen);
            });

            cardContent.appendChild(gearBtn);
          }

          cardContent.appendChild(qtyControls);
          card.appendChild(cardContent);
          
          // Добавляем аккордеон после основного контента
          if (variantAccordion) {
            card.appendChild(variantAccordion);
          }

          if (hasVariants) {
            card.classList.add("has-variants");
          }

          itemsWrap.appendChild(card);

        });

        optionsWrap.appendChild(block);
        return;
      }
    });

  }

  /* ================= INGREDIENTS ================= */
  if (ingredients && ingredients.length > 0) {
    const ingredientsWrap = document.createElement("div");
    ingredientsWrap.className = "shop-pd-ingredients";

    const title = document.createElement("div");
    title.className = "shop-pd-section-title shop-pd-ingredient-title";
    title.textContent = "Состав товара:";
    ingredientsWrap.appendChild(title);

    const ingredientsCards = document.createElement("div");
    ingredientsCards.className = "shop-pd-ingredient-cards";
    ingredientsWrap.appendChild(ingredientsCards);

    ingredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const hasIngredientProductId = Number.isFinite(ingId) && ingId > 0;
      const isIngUnavailableForPlus = () => {
        if (!hasIngredientProductId) return false;
        const currentIngQty = Number(ingredientState?.get(ingId)?.quantity ?? ing.quantity ?? 1);
        const step = Number(ing.quantity_step || 1) || 1;
        const nextQty = currentIngQty + step;
        const allowed = canApplyDraftMutation(() => {
          const stateEntry = ingredientState.get(ingId);
          const nextState = stateEntry && typeof stateEntry === "object"
            ? { ...stateEntry, quantity: nextQty }
            : { quantity: nextQty };
          ingredientState.set(ingId, nextState);
        });
        return !allowed;
      };
      const isVariable = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      const state = (() => {
        const entry = ingredientState?.get(ingId);
        if (entry && typeof entry === "object") return { ...entry };
        return {
        quantity: Number(ing.quantity ?? 1),
        };
      })();

      // Получаем min/max/step из данных ингредиента (для переменного: null/не число min = 0, иначе defaultQty)
      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      
      // Начальное количество: берем из state или из ing.quantity, затем ограничиваем и округляем до шага
      let initialQty = isVariable ? (state.quantity ?? defaultQty) : defaultQty;
      initialQty = Math.max(min, Math.min(max, initialQty));
      
      // Округляем до шага при инициализации (относительно min)
      let currentQty = initialQty;
      if (step > 0) {
        // Формула: min + round((value - min) / step) * step
        const stepsFromMin = Math.round((initialQty - min) / step);
        currentQty = min + (stepsFromMin * step);
        // Убеждаемся, что после округления значение все еще в пределах min/max
        currentQty = Math.max(min, Math.min(max, currentQty));
      }
      
      // Сохраняем округленное значение в state
      state.quantity = currentQty;
      ingredientState?.set(ingId, state);
      const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
      
      const block = document.createElement("div");
      block.className = "shop-pd-option-card shop-pd-ingredient-card";
      block.setAttribute("data-ingredient-id", ingId);

      const cardContent = document.createElement("div");
      cardContent.className = "shop-pd-option-card-content shop-pd-ingredient-card-content";

      const photo = document.createElement("div");
      photo.className = "shop-pd-option-thumb shop-pd-ingredient-photo";
      if (ing.ingredient_photos && ing.ingredient_photos.length > 0) {
        const img = runtime.createOptimizedImage(ing.ingredient_photos[0], {
          type: 'thumb',
          className: '',
          alt: ''
        });
        photo.appendChild(img);
      } else {
        photo.textContent = "—";
      }

      const info = document.createElement("div");
      info.className = "shop-pd-option-info shop-pd-ingredient-info";

      const name = document.createElement("div");
      name.className = "shop-pd-option-name shop-pd-ingredient-name";
      name.textContent = ing.ingredient_name || "";

      const qtyDisplay = document.createElement("div");
      qtyDisplay.className = "shop-pd-ingredient-qty-value";
      qtyDisplay.textContent = `${currentQty} ${unitLabel}`.trim();
      const createIngredientQtyPlaceholder = (side) => {
        const placeholder = document.createElement("span");
        placeholder.className = `shop-pd-ingredient-qty-placeholder shop-pd-ingredient-qty-placeholder--${side}`;
        placeholder.setAttribute("aria-hidden", "true");
        return placeholder;
      };

      if (isVariable) {
        const controls = document.createElement("div");
        controls.className = "shop-pd-ingredient-controls";
        const canMinus = currentQty > min;
        const canPlus = currentQty < max && !isIngUnavailableForPlus();

        let btnMinus = null;
        if (canMinus) {
          btnMinus = document.createElement("button");
          btnMinus.type = "button";
          btnMinus.className = "shop-pd-ingredient-qty-btn shop-pd-ingredient-qty-btn--minus";
          btnMinus.setAttribute("data-action", "ingredient-minus");
          btnMinus.textContent = "−";
        }

        let btnPlus = null;
        if (canPlus) {
          btnPlus = document.createElement("button");
          btnPlus.type = "button";
          btnPlus.className = "shop-pd-ingredient-qty-btn shop-pd-ingredient-qty-btn--plus";
          btnPlus.setAttribute("data-action", "ingredient-plus");
          btnPlus.textContent = "+";
        }

        const bindPressFx = (btn) => {
          if (!btn) return;
          const pressOn = () => {
            if (btn.disabled) return;
            btn.classList.add("is-pressed");
          };
          const pressOff = () => btn.classList.remove("is-pressed");
          btn.addEventListener("pointerdown", pressOn);
          btn.addEventListener("pointerup", pressOff);
          btn.addEventListener("pointercancel", pressOff);
          btn.addEventListener("pointerleave", pressOff);
          btn.addEventListener("blur", pressOff);
        };
        bindPressFx(btnMinus);
        bindPressFx(btnPlus);

        controls.appendChild(btnMinus || createIngredientQtyPlaceholder("minus"));
        controls.appendChild(qtyDisplay);
        controls.appendChild(btnPlus || createIngredientQtyPlaceholder("plus"));

        info.appendChild(name);
        info.appendChild(controls);
        
        cardContent.appendChild(photo);
        cardContent.appendChild(info);

        // Handlers: минус — вычитаем шаг, округляем до шага от min, ограничиваем min..max
        if (btnMinus) btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
          let newQty = currentStateQty - step;
          // Для переменного: если после вычитания получилось ≤0 — разрешаем 0 (на случай если min в данных не 0)
          if (isVariable && newQty <= 0) {
            newQty = 0;
          } else {
            if (step > 0) {
              const stepsFromMin = Math.round((newQty - min) / step);
              newQty = min + (stepsFromMin * step);
            }
            newQty = Math.max(min, Math.min(max, newQty));
          }
          if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
            const prevState = ingredientState?.get(ingId);
            const nextState = prevState && typeof prevState === "object"
              ? { ...prevState, quantity: newQty }
              : { quantity: newQty };
            ingredientState?.set(ingId, nextState);
            refreshNutritionCard();
            onIngredientChange();
          }
        });

        if (btnPlus) btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          if (isIngUnavailableForPlus()) {
            runtime.showToast("\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
            return;
          }
          const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? currentQty);
          let newQty = currentStateQty + step;
          if (step > 0) {
            const stepsFromMin = Math.round((newQty - min) / step);
            newQty = min + (stepsFromMin * step);
          }
          newQty = Math.max(min, Math.min(max, newQty));
          if (newQty !== currentStateQty && typeof onIngredientChange === "function") {
            const applied = runGuardedMutation(() => {
              const prevState = ingredientState?.get(ingId);
              const nextState = prevState && typeof prevState === "object"
                ? { ...prevState, quantity: newQty }
                : { quantity: newQty };
              ingredientState?.set(ingId, nextState);
            }, { showToastOnOut: true });
            if (!applied) {
              return;
            }
            refreshNutritionCard();
            onIngredientChange();
          }
        });

      } else {
        const controls = document.createElement("div");
        controls.className = "shop-pd-ingredient-controls shop-pd-ingredient-controls--fixed";
        controls.appendChild(qtyDisplay);

        info.appendChild(name);
        info.appendChild(controls);
        
        cardContent.appendChild(photo);
        cardContent.appendChild(info);
      }

      block.appendChild(cardContent);

      ingredientsCards.appendChild(block);
    });

    ingredientsCards.addEventListener("click", (e) => {
      const btn = e.target && e.target.closest
        ? e.target.closest('[data-action="ingredient-minus"], [data-action="ingredient-plus"]')
        : null;
      if (!btn || !ingredientsCards.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();

      const block = btn.closest("[data-ingredient-id]");
      const ingId = Number(block?.getAttribute("data-ingredient-id") || 0);
      if (!Number.isFinite(ingId) || ingId <= 0) return;
      const ing = ingredients.find((item) => Number(item?.ingredient_id || 0) === ingId);
      if (!ing) return;

      const isVariableIng = ing.is_variable == null ? true : Number(ing.is_variable) === 1;
      if (!isVariableIng) return;

      const defaultQty = Number(ing.quantity ?? 1);
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : 0;
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      const currentStateQty = Number(ingredientState?.get(ingId)?.quantity ?? defaultQty);
      const isPlus = btn.getAttribute("data-action") === "ingredient-plus";

      let newQty = currentStateQty + (isPlus ? step : -step);
      if (!isPlus && newQty <= 0) {
        newQty = 0;
      } else {
        if (step > 0) {
          const stepsFromMin = Math.round((newQty - min) / step);
          newQty = min + (stepsFromMin * step);
        }
        newQty = Math.max(min, Math.min(max, newQty));
      }
      if (newQty === currentStateQty) return;

      const applyNextQty = () => {
        const prevState = ingredientState?.get(ingId);
        const nextState = prevState && typeof prevState === "object"
          ? { ...prevState, quantity: newQty }
          : { quantity: newQty };
        ingredientState?.set(ingId, nextState);
      };

      if (isPlus) {
        const applied = runGuardedMutation(applyNextQty, { showToastOnOut: true });
        if (!applied) return;
      } else {
        applyNextQty();
      }

      refreshNutritionCard();
      if (typeof onIngredientChange === "function") onIngredientChange();
    }, true);

    scroll.appendChild(ingredientsWrap);
  }

  if (optionsWrap) {
    scroll.appendChild(optionsWrap);
  }

  appendProductDescriptionCard();
  appendProductNutritionCard();
  appendProductClientCompositionCard();

  const actionCard = runtime.createProductBuyXGetYActionCard(product);
  if (actionCard) scroll.appendChild(actionCard);

  wrap.appendChild(scroll);

  const footer = document.createElement("div");
  footer.className = "shop-pd-footer";

  const qtyWrap = document.createElement("div");
  qtyWrap.className = "qty-pill-wrap";
  if (qtyPill?.pill) qtyWrap.appendChild(qtyPill.pill);

  // ===== qty pill handlers (ТОЛЬКО ПОДКЛЮЧИЛИ КЛИКИ) =====
  if (qtyPill?.btnMinus && typeof onQtyMinus === "function") {
    qtyPill.btnMinus.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyMinus();
    });
  }

  if (qtyPill?.btnPlus && typeof onQtyPlus === "function") {
    qtyPill.btnPlus.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyPlus();
    });
  }

  if (qtyPill?.center && typeof onQtyCenterClick === "function") {
    qtyPill.center.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onQtyCenterClick();
    });
  }
  // =======================================================

  const actionBtn = document.createElement("button");
  actionBtn.type = "button";
  actionBtn.className = "shop-checkout-btn shop-pd-action";

  footer.appendChild(qtyWrap);
  footer.appendChild(actionBtn);
  wrap.appendChild(footer);

  return { wrap, actionBtn, qtyWrap, basePriceEl: null, refreshVariantAvailability, refreshNutritionCard, heroMedia: media };
}

  return { buildProductDetailsContent };
});
