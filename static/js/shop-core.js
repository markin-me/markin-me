  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const isShopPage = () => document.body && document.body.classList.contains("page-shop");

  // Custom select component
  function initCustomSelect(wrapEl, selectedValue) {
    if (!wrapEl || !wrapEl.classList.contains("custom-select")) return;
    const trigger = wrapEl.querySelector(".custom-select-trigger");
    const valueEl = wrapEl.querySelector(".custom-select-value");
    const dropdown = wrapEl.querySelector(".custom-select-dropdown");
    if (!trigger || !valueEl || !dropdown) return;

    const stores = window._pickupStores || [];
    const cities = [...new Set(stores.map(s => s.city).filter(Boolean))].sort();
    const placeholder = str(
      wrapEl.dataset.placeholder
      || trigger.getAttribute("aria-label")
      || "Выберите"
    ).trim() || "Выберите";
    const current = (selectedValue && cities.includes(selectedValue)) ? selectedValue : (cities[0] || "");

    wrapEl.dataset.value = current;
    valueEl.textContent = current || placeholder;
    valueEl.classList.toggle("is-placeholder", !current);
    dropdown.innerHTML = "";

    cities.forEach(c => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "custom-select-option" + (c === current ? " is-selected" : "");
      opt.textContent = c;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        wrapEl.dataset.value = c;
        valueEl.textContent = c;
        valueEl.classList.remove("is-placeholder");
        dropdown.querySelectorAll(".custom-select-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
        wrapEl.dispatchEvent(new Event("change"));
      });
      dropdown.appendChild(opt);
    });

    // toggle
    trigger.onclick = (e) => {
      e.stopPropagation();
      const open = !dropdown.classList.contains("hidden");
      if (open) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      } else {
        dropdown.classList.remove("hidden");
        wrapEl.classList.add("is-open");
      }
    };

    // close on outside click
    const closeHandler = (e) => {
      if (!wrapEl.contains(e.target)) {
        dropdown.classList.add("hidden");
        wrapEl.classList.remove("is-open");
      }
    };
    document.removeEventListener("click", wrapEl._csClose);
    wrapEl._csClose = closeHandler;
    document.addEventListener("click", closeHandler);
  }

  function initPickupCitySelector() {
    if (!elPickupCitySelector || !elPickupCityChip || !elPickupCityDropdown) return;

    const stores = window._pickupStores || [];
    const cities = [...new Set(stores.map(s => s.city).filter(Boolean))].sort();

    elPickupCitySelector.classList.remove("hidden");

    // Update chip text
    const updateChipText = () => {
      const text = state._selectedPickupCity || "Все города";
      const textEl = elPickupCityChip.querySelector(".chip-city-text");
      if (textEl) textEl.textContent = text;

    };

    // Render options
    elPickupCityDropdown.innerHTML = "";

    // Option "All cities"
    const allOption = document.createElement("button");
    allOption.type = "button";
    allOption.className = "chip-city-option" + (!state._selectedPickupCity ? " is-selected" : "");
    allOption.textContent = "Все города";
    allOption.addEventListener("click", (e) => {
      e.stopPropagation();
      state._selectedPickupCity = null;
      updateChipText();
      elPickupCityDropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
      allOption.classList.add("is-selected");
      elPickupCityDropdown.classList.add("hidden");
      elPickupCityChip.classList.remove("is-open");
      renderAddressPickupList();
    });
    elPickupCityDropdown.appendChild(allOption);

    // City options
    cities.forEach(city => {
      const opt = document.createElement("button");
      opt.type = "button";
      opt.className = "chip-city-option" + (city === state._selectedPickupCity ? " is-selected" : "");
      opt.textContent = city;
      opt.addEventListener("click", (e) => {
        e.stopPropagation();
        state._selectedPickupCity = city;
        updateChipText();
        elPickupCityDropdown.querySelectorAll(".chip-city-option").forEach(o => o.classList.remove("is-selected"));
        opt.classList.add("is-selected");
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
        renderAddressPickupList();
      });
      elPickupCityDropdown.appendChild(opt);
    });

    updateChipText();

    // Toggle dropdown
    elPickupCityChip.onclick = (e) => {
      e.stopPropagation();
      const isOpen = !elPickupCityDropdown.classList.contains("hidden");
      if (isOpen) {
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
      } else {
        elPickupCityDropdown.classList.remove("hidden");
        elPickupCityChip.classList.add("is-open");
      }
    };

    // Close on outside click
    const closeHandler = (e) => {
      if (!elPickupCitySelector.contains(e.target)) {
        elPickupCityDropdown.classList.add("hidden");
        elPickupCityChip.classList.remove("is-open");
      }
    };
    document.removeEventListener("click", elPickupCitySelector._closeHandler);
    elPickupCitySelector._closeHandler = closeHandler;
    document.addEventListener("click", closeHandler);
  }

  const getShopBasePath = () => {
    const pathname = String(window.location.pathname || "");
    return pathname.startsWith("/shop") ? "/shop" : "/";
  };

  // -----------------------------
  // DOM
  // -----------------------------
  const elCatsList =
    $("#shopCategoriesList") ||
    $("#shopCatsList") ||
    $("[data-shop-categories]");

  const elProductsGrid =
    $("#shopProductsGrid") ||
    $("#shopProductsList") ||
    $("[data-shop-products]");
  const elProductsScroller = document.querySelector(".shop-products-panel .panel-body");

  const elCategoryTitle =
    $("#shopCategoryTitle") ||
    $("#shopToolbarTitle") ||
    $("[data-shop-category-title]");
  const elCatChipsWrap = $("#shopCatChipsWrap");
  const elCatSheetTriggerBtn = $("#shopCatSheetTriggerBtn");
  const elCatChips = $("#shopCatChips");
  const elCatalogPromoBlock = $("#shopCatalogPromoBlock");

  const elCartList =
    $("#shopCartList") ||
    $("#shopCartItems") ||
    $("[data-shop-cart]");

  const elCartContent = $("#shopCartContent");
  const elCartHeaderTitle = $("#shopCartHeaderTitle");
  const elCartBackBtn = $("#shopCartBackBtn");
  const elCartHeaderModeWrap = $("#shopCartHeaderModeWrap");

  // address (right cart panel)
  const elAddressChip = $("#shopAddressChip");
  const elAddressContent = $("#shopAddressContent");
  const elAddressListView = $("#shopAddressListView");
  const elAddressFormView = $("#shopAddressFormView");
  const elAddressList = $("#shopAddressList");
  const elAddressPickupList = $("#shopAddressPickupList");
  const elAddressListTitle = $("#shopAddressListTitle");
  const elAddressConfirmBtn = $("#shopAddressConfirmBtn");
  const elAddressToggleDeliveryBtn = $("#shopAddressToggleDelivery");
  const elAddressTogglePickupBtn = $("#shopAddressTogglePickup");
  const elPickupListTop = $("#shopPickupListTop");
  const elPickupCitySelector = $("#shopPickupCitySelector");
  const elPickupCityChip = $("#shopPickupCityChip");
  const elPickupCityDropdown = $("#shopPickupCityDropdown");

  const elAddressNewBtn = $("#shopAddressNewBtn");
  const elAddressSaveBtn = $("#shopAddressSaveBtn");
  const elAddressCancelBtn = $("#shopAddressCancelBtn");

  // pickup store (right cart panel)
  const elPickupContent = $("#shopPickupContent");
  const elPickupListView = $("#shopPickupListView");
  const elPickupList = $("#shopPickupList");

  const elAddrCity = $("#shopAddrCity");
  const elAddrLookupWrap = $("#shopAddrLookupWrap");
  const elAddrLookup = $("#shopAddrLookup");
  const elAddrLookupPopover = $("#shopAddrLookupPopover");
  const elAddrLookupStatus = $("#shopAddrLookupStatus");
  const elAddrLookupResults = $("#shopAddrLookupResults");
  const elAddrStreet = $("#shopAddrStreet");
  const elAddrHouse = $("#shopAddrHouse");
  const elAddrEntrance = $("#shopAddrEntrance");
  const elAddrFloor = $("#shopAddrFloor");
  const elAddrApartment = $("#shopAddrApartment");
  const elAddrComment = $("#shopAddrComment");
  const elAddrStreetWrap = elAddrStreet ? elAddrStreet.closest(".shop-address-form-row") : null;
  const elAddrHouseWrap = elAddrHouse ? elAddrHouse.closest(".shop-address-form-field") : null;
  const elAddrDetailsRow = elAddrHouseWrap
    ? elAddrHouseWrap.closest(".shop-address-form-row--grid")
    : (elAddrEntrance ? elAddrEntrance.closest(".shop-address-form-row--grid") : null);

  const elCartTotal =
    $("#shopCartTotal") ||
    $("[data-shop-cart-total]");

  const elCartEmpty =
    $("#shopCartEmpty") ||
    $("[data-shop-cart-empty]");

  const elProductsEmpty =
    $("#shopProductsEmpty") ||
    $("#shopEmptyState") ||
    $("[data-shop-products-empty]");

  const elNavCategories = $("#shopNavCategories");
  const elNavHome = $("#shopNavHome");
  const elNavMenu = $("#shopNavMenu");
  const elNavCart = $("#shopNavCart");
  const elNavProfile = $("#shopNavProfile");
  const elNavFav = $("#shopNavFav");
  const elNavChat = $("#shopCompanyChatOpenBtn");
  const elCatalogDeliveryWidget = $("#shopCatalogDeliveryWidget");
  const elHomeBonusCard = $("#shopHomeBonusCard");

  const elNavCartBadge = $("#shopNavCartBadge") || $("#shopCartBadge");
  const elCartOpenDesktop = $("#shopCartOpenDesktopBtn");

  // header profile (? header.ejs ???? id)
  const elHeaderFavoritesBtn = $("#shopHeaderFavBtn");
  const elHeaderProfileBtn = $("#shopProfileBtn");
  const elCompanyChatOpenBtn = $("#shopCompanyChatOpenBtn");
  const elActiveOrdersBadge = $("#shopActiveOrdersBadge");
  const elActiveOrdersBadgeMobile = $("#shopActiveOrdersBadgeMobile");
  const elActiveOrdersSheetCollapsed = $("#shopActiveOrdersSheetCollapsed");
  
  // ????????? ?????? ?????????? ? ???????
  const elMobileProductActions = $("#shopMobileProductActions");
  const elMobileQtyWrap = $("#shopMobileQtyWrap");
  const elMobileAddToCartBtn = $("#shopMobileAddToCartBtn");
  const elMobileProductPrice = $("#shopMobileProductPrice");
  const elMobileProductLabel = $("#shopMobileProductLabel");
  
  // ????????? ?????? ???????
  const elMobileCartActions = $("#shopMobileCartActions");
  const elMobileCartActionsCart = $("#shopMobileCartActionsCart");
  const elMobileCartActionsCheckout = $("#shopMobileCartActionsCheckout");
  const elMobileCartActionsBenefits = $("#shopMobileCartActionsBenefits");
  const elMobileCartActionsGiftClaim = $("#shopMobileCartActionsGiftClaim");
  const elMobileBonusCardsActions = $("#shopMobileBonusCardsActions");
  const elMobileBonusCardsActionBtn = $("#shopMobileBonusCardsActionBtn");
  const elMobileCartClearBtn = $("#shopMobileCartClearBtn");
  const elMobileCheckoutBtn = $("#shopMobileCheckoutBtn");
  const elMobileGiftClaimBtn = $("#shopMobileGiftClaimBtn");
  const elMobileCartTotal = $("#shopMobileCartTotal");
  const elMobileDeliveryProgressWrap = $("#shopMobileDeliveryProgressWrap");
  const elMobileDeliveryProgressFill = $("#shopMobileDeliveryProgressFill");
  const elMobileDeliveryProgressLabel = $("#shopMobileDeliveryProgressLabel");
  const elMobileDeliveryProgressBar = document.querySelector(".shop-mobile-delivery-progress-bar");
  const elMobileCheckoutBackBtn = $("#shopMobileCheckoutBackBtn");
  const elMobileCheckoutSubmitBtn = $("#shopMobileCheckoutSubmitBtn");
  const elMobileBenefitsPromoWrap = $("#shopMobileBenefitsPromoWrap");
  const elMobileBenefitsInlineApplyBtn = $("#shopMobileBenefitsInlineApplyBtn");
  const elMobileOrderDetailsActions = $("#shopMobileOrderDetailsActions");
  const elMobileOrderRepeatBtn = $("#shopMobileOrderRepeatBtn");
  const elMobileOrderTotalBtn = $("#shopMobileOrderTotalBtn");
  const elMobileOrderTotalValue = $("#shopMobileOrderTotalValue");
  const elMobileAddressActions = $("#shopMobileAddressActions");
  const elMobileAddressSaveBtn = $("#shopMobileAddressSaveBtn");
  const elMobileAddressCancelBtn = $("#shopMobileAddressCancelBtn");
  const elMobileAddressConfirm = $("#shopMobileAddressConfirm");
  
  // ????????? ????????? ??????
  let mobileProductActionsState = {
    qtyPill: null,
    onQtyMinus: null,
    onQtyPlus: null,
    onAddToCart: null,
  };

  // desktop cart footer
  const elCartFooter = $("#shopCartFooter");
  const elCartFooterActions = $("#shopCartFooterActions");
  const elDesktopDeliveryProgressWrap = $("#shopCartDeliveryProgress");
  const elDesktopDeliveryProgressFill = $("#shopCartDeliveryProgressFill");
  const elDesktopDeliveryProgressLabel = $("#shopCartDeliveryProgressLabel");
  const elDesktopCartBenefitsTriggerBtn = $("#shopCartBenefitsTriggerBtn");
  const elCheckoutFooterActions = $("#shopCheckoutFooterActions");
  const elOrderDetailsFooterActions = $("#shopOrderDetailsFooterActions");
  const elOrderDetailsRepeatBtn = $("#shopOrderDetailsRepeatBtn");
  const elOrderDetailsTotalBtn = $("#shopOrderDetailsTotalBtn");
  const elOrderDetailsTotalValue = $("#shopOrderDetailsTotalValue");
  const elCheckoutBtn = $("#shopCheckoutBtn");
  const elCartClearBtn = $("#shopCartClearBtn");
  const elCheckoutBackBtn = $("#shopCheckoutBackBtn");
  const elCheckoutSubmitBtn = $("#shopCheckoutSubmitBtn");
  const elCheckoutContent = $("#shopCheckoutContent");
  const elCheckoutBenefitsContent = $("#shopCheckoutBenefitsContent");
  const elCheckoutBenefitDetailContent = $("#shopCheckoutBenefitDetailContent");
  const elProfileContent = $("#shopProfileContent");
  const elProductContent = $("#shopProductContent");
  const elProfileHeaderActions = $("#shopProfileHeaderActions");
  const elProfileCloseBtn = $("#shopProfileCloseBtn");
  const elProfileSettingsBtn = $("#shopProfileSettingsBtn");
  const elProfileMenu = $("#shopProfileMenu");
  const elProfileEditBtn = $("#shopProfileEditBtn");
  const elProfileLogoutBtn = $("#shopProfileLogoutBtn");

  const __shopHasRequiredDom = !!(elProductsGrid && elCatsList);

  // -----------------------------
  // Tenant
  // -----------------------------
  function getTenantId() {
    const meta = document.querySelector('meta[name="tenant_id"]');
    if (meta && meta.content) {
      const n = Number(meta.content);
      if (Number.isFinite(n) && n > 0) return n;
    }
    try {
      const u = new URL(window.location.href);
      const q = Number(u.searchParams.get("tenant_id"));
      if (Number.isFinite(q) && q > 0) return q;
    } catch {}
    return 1;
  }

  function getActiveStoreId() {
    const stored = localStorage.getItem("activeStoreId");
    const n = Number(stored);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  const tenantId = getTenantId();
  const CART_KEY = `shop_cart_t${tenantId}`;
  const FAV_KEY = `shop_fav_t${tenantId}`;
  const LAST_ORDER_KEY = `shop_last_order_public_t${tenantId}`;
  const CHECKOUT_DRAFT_KEY = `shop_checkout_draft_t${tenantId}`;
  const ADDRESS_DRAFT_KEY = `shop_address_draft_t${tenantId}`;
  const AUTO_ADD_DISMISSED_KEY = `shop_auto_add_dismissed_t${tenantId}_s${getActiveStoreId()}`;
  const CATALOG_SNAPSHOT_VERSION = 1;
  const CATALOG_SNAPSHOT_MAX_AGE_MS = 6 * 60 * 60 * 1000;
  const CATALOG_SNAPSHOT_KEY = `shop_catalog_snapshot_v${CATALOG_SNAPSHOT_VERSION}_t${tenantId}_s${getActiveStoreId()}`;
  const ORDER_ROUNDING_CACHE_VERSION = 1;
  const ORDER_ROUNDING_CACHE_KEY = `shop_order_rounding_cache_v${ORDER_ROUNDING_CACHE_VERSION}_t${tenantId}`;

  const CUSTOMER_TOKEN_KEY = `shop_customer_token_t${tenantId}`;
  const CUSTOMER_CACHE_KEY = `shop_customer_cache_t${tenantId}`;
  const REFERRAL_CODE_KEY = `shop_referral_code_t${tenantId}`;
  let meBootstrapPromise = null;
  let meBootstrapToken = "";
  let meBootstrapLoaded = false;

  // -----------------------------
  // Format helpers
  // -----------------------------
  const moneyFmt = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 });

  function getTenantFromStorage() {
    try {
      const t = localStorage.getItem("tenant");
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  }

  const PRICE_ROUNDING_DEFAULT = { mode: "none", precision: 2 };
  let priceRoundingRuntime = { ...PRICE_ROUNDING_DEFAULT };

  function normalizePriceRoundingSettings(source) {
    const modeRaw = source && typeof source === "object"
      ? (typeof source.price_rounding_mode === "string"
        ? source.price_rounding_mode
        : (typeof source.priceRoundingMode === "string" ? source.priceRoundingMode : source.mode))
      : "none";
    const mode = typeof modeRaw === "string" ? modeRaw : "none";
    const allowed = new Set(["none", "down", "up", "nearest"]);
    const safeMode = allowed.has(mode) ? mode : "none";
    const precisionValue = source && typeof source === "object"
      ? (Object.prototype.hasOwnProperty.call(source, "price_rounding_precision")
        ? source.price_rounding_precision
        : (Object.prototype.hasOwnProperty.call(source, "priceRoundingPrecision")
          ? source.priceRoundingPrecision
          : source.precision))
      : null;
    const precisionRaw = Number(precisionValue);
    const precision = precisionRaw === 0 ? 0 : 2;
    return { mode: safeMode, precision };
  }

  function loadCachedPriceRoundingSettings() {
    try {
      const raw = localStorage.getItem(ORDER_ROUNDING_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return normalizePriceRoundingSettings(parsed);
    } catch {
      return null;
    }
  }

  function saveCachedPriceRoundingSettings(settings) {
    try {
      localStorage.setItem(ORDER_ROUNDING_CACHE_KEY, JSON.stringify(settings || PRICE_ROUNDING_DEFAULT));
    } catch {}
  }

  function applyPriceRoundingSettings(settings, { persist = true } = {}) {
    const normalized = normalizePriceRoundingSettings(settings);
    priceRoundingRuntime = normalized;
    if (persist) saveCachedPriceRoundingSettings(normalized);
    return normalized;
  }

  function hasExplicitPriceRoundingSettings(source) {
    if (!source || typeof source !== "object") return false;
    return (
      Object.prototype.hasOwnProperty.call(source, "price_rounding_mode")
      || Object.prototype.hasOwnProperty.call(source, "price_rounding_precision")
      || Object.prototype.hasOwnProperty.call(source, "priceRoundingMode")
      || Object.prototype.hasOwnProperty.call(source, "priceRoundingPrecision")
      || Object.prototype.hasOwnProperty.call(source, "mode")
      || Object.prototype.hasOwnProperty.call(source, "precision")
    );
  }

  function applyPriceRoundingSettingsFromOrderConfig(config, { persist = true } = {}) {
    if (!config || typeof config !== "object") return priceRoundingRuntime;
    if (!hasExplicitPriceRoundingSettings(config)) return priceRoundingRuntime;
    return applyPriceRoundingSettings(config, { persist });
  }

  function setShopOrderConfigSnapshot(config, { persistRounding = true } = {}) {
    const normalizedConfig = config && typeof config === "object" ? config : null;
    window.__shopOrderConfig = normalizedConfig;
    if (normalizedConfig) {
      applyPriceRoundingSettingsFromOrderConfig(normalizedConfig, { persist: persistRounding });
    }
    return window.__shopOrderConfig || null;
  }

  function getShopOrderConfigSnapshot() {
    return window.__shopOrderConfig && typeof window.__shopOrderConfig === "object"
      ? window.__shopOrderConfig
      : null;
  }

  const bootOrderConfig = getShopOrderConfigSnapshot();
  if (bootOrderConfig && hasExplicitPriceRoundingSettings(bootOrderConfig)) {
    applyPriceRoundingSettingsFromOrderConfig(bootOrderConfig, { persist: true });
  } else {
    const cachedRounding = loadCachedPriceRoundingSettings();
    if (cachedRounding) {
      applyPriceRoundingSettings(cachedRounding, { persist: false });
    }
  }

  window.setShopOrderConfigSnapshot = setShopOrderConfigSnapshot;
  window.getShopOrderConfigSnapshot = getShopOrderConfigSnapshot;

  function parseBooleanFlag(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) && value !== 0;
    const text = str(value).trim().toLowerCase();
    if (!text) return false;
    if (text === "1" || text === "true" || text === "yes" || text === "on") return true;
    if (text === "0" || text === "false" || text === "no" || text === "off" || text === "null" || text === "undefined") {
      return false;
    }
    return Boolean(value);
  }

  function isAddressMapModeEnabled() {
    const orderConfig = window.__shopOrderConfig && typeof window.__shopOrderConfig === "object"
      ? window.__shopOrderConfig
      : null;
    if (orderConfig && Object.prototype.hasOwnProperty.call(orderConfig, "storeAddressMapEnabled")) {
      return parseBooleanFlag(orderConfig.storeAddressMapEnabled);
    }
    const tenant = getTenantFromStorage();
    if (tenant && Object.prototype.hasOwnProperty.call(tenant, "store_address_map_enabled")) {
      return parseBooleanFlag(tenant.store_address_map_enabled);
    }
    return false;
  }

  function getPriceRoundingSettings() {
    return { ...priceRoundingRuntime };
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

  function money(v) {
    const n = roundPrice(Number(v || 0));
    return moneyFmt.format(Number.isFinite(n) ? n : 0) + " ₽";
  }

  function moneyNoSign(v) {
    const n = roundPrice(Number(v || 0));
    return moneyFmt.format(Number.isFinite(n) ? n : 0);
  }

  function str(v) {
    return v === undefined || v === null ? "" : String(v);
  }

  function toFiniteNumberOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function escapeHtml(s) {
    if (s === null || s === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(s);
    return div.innerHTML;
  }

  function normalizeShopHexColor(value, fallback) {
    const text = String(value || "").trim();
    return /^#[0-9a-fA-F]{6}$/.test(text) ? text.toLowerCase() : fallback;
  }

  function normalizeShopOpacity(value, fallback = 90) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(100, Math.round(parsed)));
  }

  function buildShopRgbaColor(color, opacity) {
    const hex = normalizeShopHexColor(color, "#ffffff").replace("#", "");
    const alpha = normalizeShopOpacity(opacity, 90) / 100;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function normalizeShopCardPercent(value, fallback = 0) {
    const parsed = Number(String(value ?? "").replace(",", "."));
    if (!Number.isFinite(parsed)) return Math.max(0, Number(fallback) || 0);
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 1,
    }).format(Math.max(0, Math.round(parsed * 10) / 10));
  }

  function formatShopBonusNumber(value, fallback = 0) {
    const parsed = Number(value);
    const safe = Number.isFinite(parsed) ? parsed : Number(fallback) || 0;
    return new Intl.NumberFormat("ru-RU", {
      maximumFractionDigits: 2,
    }).format(safe);
  }

  function getShopBonusCoinIconHtml(size = '1.1em', margin = '4px') {
    const logo = state.homeBonusConfig?.settings?.bonus_coin_logo;
    if (logo) {
      return `<img src="${escapeHtml(logo)}" class="bonus-coin-icon" style="width:${size};height:${size};display:inline-block;vertical-align:middle;margin-top:-2px;margin-left:${margin};" alt="" />`;
    }
    return '₽';
  }

  function formatShopBonusMoney(value) {
    return `${formatShopBonusNumber(Math.max(0, Math.floor(Number(value || 0))))} ${getShopBonusCoinIconHtml()}`;
  }

  function formatShopBonusPercent(value, fallback = 0) {
    return `${formatShopBonusNumber(value, fallback)}%`;
  }

  function formatShopBonusFavoriteCategoriesRange(level) {
    const min = Math.max(0, Number(level?.favorite_categories_min_bonus_percent || 0));
    const max = Math.max(0, Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || 0));
    if (min > 0 && max > 0 && Math.abs(max - min) >= 0.0001) {
      return `${formatShopBonusNumber(min, 0)}-${formatShopBonusNumber(max, 0)}%`;
    }
    return formatShopBonusPercent(max, 0);
  }

  function getShopBonusModalSetting(key) {
    const settings = Array.isArray(state.homeBonusConfig?.modal_settings) ? state.homeBonusConfig.modal_settings : [];
    const item = settings.find((row) => String(row?.key || "") === key) || null;
    if (!item) return null;
    return {
      ...item,
      image_url: item.image_url || item.imageUrl || "",
      description: item.description || "",
      is_enabled: item.is_enabled === false || item.enabled === false ? false : true,
    };
  }

  function getShopBonusLevelById(levelId) {
    const numericId = Number(levelId || 0);
    const levels = Array.isArray(state.homeBonusConfig?.levels) ? state.homeBonusConfig.levels : [];
    return levels.find((level) => Number(level?.id || 0) === numericId) || null;
  }

  function getShopBonusModalDefaultIcon(key) {
    if (key === "level-up") return "fa-arrow-up";
    if (key === "level-down") return "fa-arrow-down";
    return "fa-user-plus";
  }

  function buildShopBonusProgramModalImageHtml(setting, key) {
    const imageUrl = String(setting?.image_url || "").trim();
    if (imageUrl) {
      return `<img src="${escapeHtml(imageUrl)}" alt="" />`;
    }
    return `<i class="fas ${escapeHtml(getShopBonusModalDefaultIcon(key))}" aria-hidden="true"></i>`;
  }

  function buildShopBonusProgramModalStatsHtml(level, options = {}) {
    const reward = Math.max(0, Number(options.totalRewardBonusAmount ?? level?.reward_bonus_amount ?? 0));
    const cashback = formatShopBonusPercent(level?.cashback_percent, 0);
    const redeem = formatShopBonusPercent(level?.redeem_percent, 0);
    return `
      <div class="shop-bonus-program-modal-stats">
        <div class="shop-bonus-program-modal-stat">
          <strong>${formatShopBonusMoney(reward)}</strong>
        </div>
        <div class="shop-bonus-program-modal-stat">
          <i class="fas fa-undo-alt" aria-hidden="true"></i>
          <strong>${escapeHtml(cashback)}</strong>
        </div>
        <div class="shop-bonus-program-modal-stat">
          <i class="fas fa-minus-circle" aria-hidden="true"></i>
          <strong>${escapeHtml(redeem)}</strong>
        </div>
      </div>
    `;
  }

  function buildShopBonusProgramModalDetailsHtml(steps = []) {
    const rows = Array.isArray(steps) ? steps.filter((step) => Number(step?.to_level_id || 0) > 0) : [];
    if (rows.length < 2) return "";
    return `
      <div class="shop-bonus-program-modal-details" data-bonus-modal-details>
        <button class="shop-bonus-program-modal-details-toggle" type="button" data-bonus-modal-details-toggle aria-expanded="false">
          <span>Подробнее</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
        <div class="shop-bonus-program-modal-details-list" data-bonus-modal-details-list hidden>
          ${rows.map((step) => {
            const title = String(step?.to_level_title || "").trim() || "Уровень";
            const reward = Math.max(0, Number(step?.reward_bonus_amount || 0));
            return `
              <div class="shop-bonus-program-modal-details-row">
                <span>${escapeHtml(title)}</span>
                <strong>+${formatShopBonusMoney(reward)}</strong>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  function openShopBonusProgramModal(options = {}) {
    const modalKey = String(options.modalKey || "join");
    const setting = getShopBonusModalSetting(modalKey);
    if (setting && setting.is_enabled === false) {
      if (typeof options.onConfirm === "function") void options.onConfirm();
      return;
    }
    document.querySelectorAll(".shop-bonus-program-modal-overlay").forEach((node) => node.remove());
    const level = options.level || options.toLevel || getHomeBonusFirstLevel(state.homeBonusConfig);
    const title = String(setting?.title || options.title || "").trim() || (
      modalKey === "level-up" ? "\u041f\u043e\u0432\u044b\u0448\u0435\u043d\u0438\u0435 \u0443\u0440\u043e\u0432\u043d\u044f"
        : modalKey === "level-down" ? "\u041f\u043e\u043d\u0438\u0436\u0435\u043d\u0438\u0435 \u0443\u0440\u043e\u0432\u043d\u044f"
          : "\u041f\u0440\u0438\u0441\u043e\u0435\u0434\u0438\u043d\u0435\u043d\u0438\u0435 \u043a \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0435"
    );
    const description = String(setting?.description || options.description || "").trim();
    const fromTitle = String(options.fromLevel?.title || options.fromLevelTitle || "").trim();
    const toTitle = String(options.toLevel?.title || level?.title || options.toLevelTitle || "").trim();
    const transitionHtml = (modalKey === "level-up" || modalKey === "level-down") && (fromTitle || toTitle)
      ? `<div class="shop-bonus-program-modal-transition">
          <span>${escapeHtml(fromTitle || "\u0423\u0440\u043e\u0432\u0435\u043d\u044c")}</span>
          <i class="fas ${modalKey === "level-down" ? "fa-arrow-down" : "fa-arrow-right"}" aria-hidden="true"></i>
          <span>${escapeHtml(toTitle || "\u0423\u0440\u043e\u0432\u0435\u043d\u044c")}</span>
        </div>`
      : "";
    const overlay = document.createElement("div");
    overlay.className = "shop-bonus-program-modal-overlay";
    overlay.innerHTML = `
      <div class="shop-bonus-program-modal" role="dialog" aria-modal="true">
        <div class="shop-bonus-program-modal-image">${buildShopBonusProgramModalImageHtml(setting, modalKey)}</div>
        <div class="shop-bonus-program-modal-title">${escapeHtml(title)}</div>
        ${description ? `<div class="shop-bonus-program-modal-description">${escapeHtml(description)}</div>` : ""}
        ${transitionHtml}
        ${buildShopBonusProgramModalStatsHtml(level, options)}
        ${buildShopBonusProgramModalDetailsHtml(options.levelSteps)}
        <button class="shop-bonus-program-modal-confirm" type="button">${"\u041f\u043e\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u044c"}</button>
      </div>
    `;
    const confirmBtn = overlay.querySelector(".shop-bonus-program-modal-confirm");
    const detailsToggle = overlay.querySelector("[data-bonus-modal-details-toggle]");
    const detailsList = overlay.querySelector("[data-bonus-modal-details-list]");
    detailsToggle?.addEventListener("click", () => {
      const expanded = detailsToggle.getAttribute("aria-expanded") === "true";
      detailsToggle.setAttribute("aria-expanded", expanded ? "false" : "true");
      if (detailsList) detailsList.hidden = expanded;
    });
    confirmBtn?.addEventListener("click", async () => {
      if (confirmBtn.disabled) return;
      confirmBtn.disabled = true;
      try {
        if (typeof options.onConfirm === "function") {
          await options.onConfirm();
        }
        overlay.remove();
      } finally {
        if (document.body.contains(overlay)) confirmBtn.disabled = false;
      }
    });
    document.body.appendChild(overlay);
  }

  function maybeShowPendingBonusModalEvent() {
    const event = state.homeBonusConfig?.pending_modal_event;
    const eventId = Number(event?.id || 0);
    if (!(eventId > 0) || state._homeBonusModalEventId === eventId) return;
    const modalKey = String(event.modal_key || (event.event_type === "level_down" ? "level-down" : "level-up"));
    const setting = getShopBonusModalSetting(modalKey);
    if (setting && setting.is_enabled === false) return;
    const fromLevel = getShopBonusLevelById(event.from_level_id) || { title: event.from_level_title || "" };
    const toLevel = getShopBonusLevelById(event.to_level_id) || { title: event.to_level_title || "" };
    const eventIds = Array.isArray(event.event_ids) ? event.event_ids.map((id) => Number(id || 0)).filter((id) => id > 0) : [];
    state._homeBonusModalEventId = eventId;
    openShopBonusProgramModal({
      modalKey,
      fromLevel,
      toLevel,
      level: toLevel,
      fromLevelTitle: event.from_level_title || "",
      toLevelTitle: event.to_level_title || "",
      levelSteps: event.level_steps || [],
      totalRewardBonusAmount: event.total_reward_bonus_amount,
      onConfirm: async () => {
        await apiJson("/api/public/bonus/modal-events/confirm", {
          method: "POST",
          body: { event_id: eventId, event_ids: eventIds.length ? eventIds : [eventId] },
        });
        if (state.homeBonusConfig?.pending_modal_event?.id === eventId) {
          state.homeBonusConfig.pending_modal_event = null;
        }
      },
    });
  }

  function formatShopBonusPeriod(value, unit) {
    const n = Math.max(0, Math.floor(Number(value || 0)));
    const u = String(unit || "").trim();
    if (u === "immediate") return "Сразу";
    if (u === "forever") return "Бессрочно";
    if (!n) return "Сразу";
    if (u === "hours") return `${n} ч`;
    if (u === "days") return `${n} дн.`;
    if (u === "months") return `${n} мес.`;
    return String(n);
  }

  function getShopBonusRanges(level) {
    return (Array.isArray(level?.order_bonus_ranges) ? level.order_bonus_ranges : [])
      .map((row) => ({
        amount: Math.max(0, Number(row?.amount || 0)),
        percent: Math.max(0, Number(row?.percent || 0)),
      }))
      .filter((row) => row.amount > 0 && row.percent > 0)
      .sort((a, b) => a.amount - b.amount);
  }

  function getShopBonusRangeSummary(level) {
    const rows = getShopBonusRanges(level);
    if (!rows.length) return "Не настроено";
    const first = rows[0];
    const percents = rows.map((row) => row.percent);
    const minPercent = Math.min(...percents);
    const maxPercent = Math.max(...percents);
    const percentText = minPercent === maxPercent
      ? `+${formatShopBonusPercent(minPercent)}`
      : `от ${formatShopBonusPercent(minPercent)} до ${formatShopBonusPercent(maxPercent)}`;
    return `от ${money(first.amount)} и выше / ${percentText}`;
  }

  function getShopBonusRangeDetails(level) {
    const rows = getShopBonusRanges(level);
    return rows.map((row, index) => {
      const next = rows[index + 1] || null;
      const amountText = next
        ? `от ${money(row.amount)} до ${money(Math.max(row.amount, next.amount - 1))}`
        : `от ${money(row.amount)} и более`;
      return `${index + 1}. ${amountText} / +${formatShopBonusPercent(row.percent)}`;
    });
  }

  function getHomeBonusActionText(accessType) {
    const type = String(accessType || "").trim();
    if (type === "join") return "Присоединиться";
    if (type === "paid") return "Подключить";
    return "Участвовать";
  }

  function isHomeBonusJoined(config = state.homeBonusConfig) {
    const account = config && typeof config === "object" ? config.account : null;
    return !!account?.joined_at && Number(account?.id || 0) > 0;
  }

  function getHomeBonusJoinActionText() {
    return getCustomerToken() ? "Присоединиться" : "Войти и присоединиться";
  }

  function getHomeBonusSheetActionText(level) {
    const isAuthorized = !!getCustomerToken();
    const type = String(level?.access_type || "").trim();
    if (type === "paid") return isAuthorized ? "Подключить" : "Войти и подключить";
    return isAuthorized ? "Присоединиться" : "Войти и присоединиться";
  }

  function getBonusLevelPreviewBalance(level) {
    const account = state.homeBonusConfig?.account || null;
    if (!account) return 0;
    return Number(account.balance || 0);
  }

  function getCartBonusAccountLevel() {
    const config = state.homeBonusConfig && typeof state.homeBonusConfig === "object" ? state.homeBonusConfig : null;
    const account = config?.account && typeof config.account === "object" ? config.account : null;
    if (!account?.joined_at || !(Number(account?.id || 0) > 0)) return null;
    const levelId = Number(account?.level_id || 0);
    const levels = Array.isArray(config?.levels) ? config.levels : [];
    if (levelId > 0) {
      const currentLevel = levels.find((level) => Number(level?.id || 0) === levelId);
      if (currentLevel) return currentLevel;
    }
    return getHomeBonusFirstLevel(config);
  }

  function refreshCartBonusSectionAfterConfigLoad(listEl = null, totalEl = null) {
    const targetList = listEl || openCartSheetCtx?.listEl || elCartList;
    const targetTotal = totalEl || openCartSheetCtx?.totalEl || elCartTotal;
    if (!targetList || !targetTotal) return;
    if (targetList.dataset.cartBonusConfigRefreshPending === "1") return;
    const token = getCustomerToken();
    if (!token || typeof loadHomeBonusConfig !== "function") return;
    targetList.dataset.cartBonusConfigRefreshPending = "1";
    loadHomeBonusConfig()
      .then(() => {
        if (!targetList.isConnected) return;
        const rendered = renderCartInto(targetList, targetTotal, null);
        if (openCartSheetCtx?.listEl === targetList) {
          if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", rendered.items.length === 0);
          if (openCartSheetCtx.checkoutBtn) {
            openCartSheetCtx.checkoutBtn.disabled = rendered.items.length === 0;
            const totalSpan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
            if (totalSpan) totalSpan.textContent = money(computeCartTotals(rendered.items).total);
          }
          appendUpsellToList(targetList);
        }
        if (typeof window.syncShopCartPricingSummaryUi === "function") {
          Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        delete targetList.dataset.cartBonusConfigRefreshPending;
      });
  }

  function buildCartBonusJoinSection() {
    const config = state.homeBonusConfig && typeof state.homeBonusConfig === "object" ? state.homeBonusConfig : null;
    if (!getCustomerToken() || !config?.settings?.bonus_program_enabled || isHomeBonusJoined(config)) return null;
    const levels = Array.isArray(config?.levels) ? config.levels : [];
    const level = levels.find((item) => String(item?.access_type || "") === "join") || getHomeBonusFirstLevel(config);
    if (!level) return null;
    const reward = Math.max(0, Number(level?.reward_bonus_amount || 0));
    const cashback = formatShopBonusPercent(level?.cashback_percent, 0);
    const redeem = formatShopBonusPercent(level?.redeem_percent, 0);
    const section = document.createElement("section");
    section.className = "shop-cart-bonus-redeem-section shop-cart-bonus-join-section";
    section.innerHTML = `
      <div class="shop-bonus-level-balance-card shop-cart-bonus-redeem-card shop-cart-bonus-join-card">
        <div class="shop-cart-bonus-join-copy">
          <div class="shop-cart-bonus-join-title">Присоединитесь к бонусной программе</div>
          <div class="shop-cart-bonus-join-text">и получайте бонусы за заказы</div>
        </div>
        <div class="shop-cart-bonus-join-stats">
          <div class="shop-cart-bonus-join-reward">${formatShopBonusMoney(reward)} <span>за вступление</span></div>
          <div class="shop-cart-bonus-join-percents">
            <span>Кэшбэк: ${escapeHtml(cashback)}</span>
            <span>Списание: до ${escapeHtml(redeem)}</span>
          </div>
        </div>
        <button class="shop-cart-bonus-join-btn" type="button" data-cart-bonus-join-button>Присоединиться</button>
      </div>
    `;
    return section;
  }

  function buildCartBonusRedeemSection() {
    const level = getCartBonusAccountLevel();
    if (!level) return buildCartBonusJoinSection();
    const balance = Math.max(0, Number(state.homeBonusConfig?.account?.balance || 0));
    const canRedeem = balance > 0;
    const allowRedeemAndAccrue = Number(state.homeBonusConfig?.settings?.allow_redeem_and_accrue || 0) === 1;
    const redeemLabel = allowRedeemAndAccrue ? "Списать и начислить" : "Списать";
    if (!canRedeem && state.cartBonusRedeemEnabled) {
      state.cartBonusRedeemEnabled = false;
    }
    const section = document.createElement("section");
    section.className = "shop-cart-bonus-redeem-section";
    const coinName = state.homeBonusConfig?.settings?.bonus_coin_name || "Бонусы";
    section.innerHTML = `
      <div class="shop-bonus-level-balance-card shop-cart-bonus-redeem-card">
        <div class="shop-cart-bonus-redeem-head">
          <div class="shop-bonus-level-balance-main">
            <div class="shop-bonus-level-balance-label">${escapeHtml(coinName)}</div>
            <div class="shop-bonus-level-balance-value">${formatShopBonusMoney(balance)}</div>
          </div>
          <div class="shop-cart-bonus-redeem-available">
            <div class="shop-cart-bonus-redeem-available-label">Можно списать</div>
            <div class="shop-cart-bonus-redeem-available-value" data-cart-bonus-redeem-available>${formatShopBonusMoney(0)}</div>
          </div>
        </div>
        <div class="shop-cart-bonus-redeem-actions">
          <button class="shop-cart-bonus-action-pill shop-cart-bonus-action-pill--accrual${state.cartBonusRedeemEnabled && canRedeem ? "" : " is-active"}" type="button" data-cart-bonus-accrual-button>
            <span class="shop-cart-bonus-action-pill__label">Начислить</span>
            <span class="shop-cart-bonus-action-pill__amount" data-cart-bonus-accrual-amount>+${formatShopBonusMoney(0)}</span>
          </button>
          <button class="shop-cart-bonus-action-pill shop-cart-bonus-action-pill--redeem${state.cartBonusRedeemEnabled && canRedeem ? " is-active" : ""}${canRedeem ? "" : " is-disabled"}" type="button" data-cart-bonus-redeem-button ${canRedeem ? "" : "disabled"}>
            <span class="shop-cart-bonus-action-pill__label" data-cart-bonus-redeem-label>${escapeHtml(redeemLabel)}</span>
            <span class="shop-cart-bonus-action-pill__amount" data-cart-bonus-redeem-button-amount>-${formatShopBonusMoney(0)}</span>
          </button>
          <input class="shop-cart-bonus-redeem-input" type="checkbox" data-cart-bonus-redeem-toggle ${state.cartBonusRedeemEnabled && canRedeem ? "checked" : ""} ${canRedeem ? "" : "disabled"} />
        </div>
      </div>
    `;
    return section;
  }

  function bindCartBonusRedeemSection(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll(".shop-cart-bonus-redeem-section").forEach((section) => {
      if (section.dataset.cartBonusRedeemEventsBound === "1") return;
      section.dataset.cartBonusRedeemEventsBound = "1";
      ["click", "mousedown", "mouseup", "pointerdown", "pointerup", "touchstart", "touchend", "input", "change"].forEach((eventName) => {
        const listenerOptions = eventName === "touchstart" || eventName === "touchend" ? { passive: true } : undefined;
        section.addEventListener(eventName, (event) => {
          event.stopPropagation();
        }, listenerOptions);
      });
    });
    rootEl.querySelectorAll("[data-cart-bonus-redeem-toggle]").forEach((input) => {
      if (input.dataset.cartBonusRedeemBound === "1") return;
      input.dataset.cartBonusRedeemBound = "1";
      input.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const balance = Math.max(0, Number(state.homeBonusConfig?.account?.balance || 0));
        const nextEnabled = balance > 0 && !!input.checked;
        state.cartBonusRedeemChoiceVersion = Number(state.cartBonusRedeemChoiceVersion || 0) + 1;
        state.cartBonusRedeemEnabled = nextEnabled;
        input.checked = state.cartBonusRedeemEnabled;
        if (typeof window.invalidateShopCartPricingSnapshotCache === "function") {
          window.invalidateShopCartPricingSnapshotCache();
        }
        if (typeof window.refreshShopCartBonusRedeemUi === "function") {
          try {
            window.refreshShopCartBonusRedeemUi();
          } catch (error) {
            console.warn("Failed to refresh cart bonus redeem UI:", error);
          }
        } else if (typeof window.refreshShopCartPricingLocalUi === "function") {
          try {
            window.refreshShopCartPricingLocalUi();
          } catch (error) {
            console.warn("Failed to refresh cart pricing after bonus redeem toggle:", error);
          }
        } else if (typeof window.syncShopCartPricingSummaryUi === "function") {
          Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
        }
      });
    });
    rootEl.querySelectorAll("[data-cart-bonus-redeem-button]").forEach((button) => {
      if (button.dataset.cartBonusRedeemButtonBound === "1") return;
      button.dataset.cartBonusRedeemButtonBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled || button.classList.contains("is-disabled")) return;
        const section = button.closest(".shop-cart-bonus-redeem-section");
        const input = section?.querySelector("[data-cart-bonus-redeem-toggle]");
        if (!input || input.disabled) return;
        state.cartBonusRedeemChoiceVersion = Number(state.cartBonusRedeemChoiceVersion || 0) + 1;
        input.checked = true;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    rootEl.querySelectorAll("[data-cart-bonus-accrual-button]").forEach((button) => {
      if (button.dataset.cartBonusAccrualButtonBound === "1") return;
      button.dataset.cartBonusAccrualButtonBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const section = button.closest(".shop-cart-bonus-redeem-section");
        const input = section?.querySelector("[data-cart-bonus-redeem-toggle]");
        if (!input) return;
        state.cartBonusRedeemChoiceVersion = Number(state.cartBonusRedeemChoiceVersion || 0) + 1;
        input.checked = false;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    });
    rootEl.querySelectorAll("[data-cart-bonus-join-button]").forEach((button) => {
      if (button.dataset.cartBonusJoinButtonBound === "1") return;
      button.dataset.cartBonusJoinButtonBound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.disabled) return;
        void joinHomeBonusProgram({
          onSuccess: () => {
            if (!openCartSheetCtx?.listEl || !openCartSheetCtx?.totalEl) return;
            const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
            if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
            if (openCartSheetCtx.checkoutBtn) {
              openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
              const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
              if (tspan) tspan.textContent = money(computeCartTotals(items).total);
            }
            appendUpsellToList(openCartSheetCtx.listEl);
            if (typeof window.syncShopCartPricingSummaryUi === "function") {
              Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
            }
          },
        });
      });
    });
  }

  function setBonusCardsSheetHeader(active) {
    const header = document.querySelector(".app-modal-header");
    if (!header) return;
    header.classList.toggle("is-shop-sheet-shell", !!active);
  }

  function buildBonusLevelPreviewCardHtml(level, options = {}) {
    const isHomeCard = options.homeCard === true;
    const stackedTitle = options.stackedTitle !== false;
    const showQr = options.showQr !== false;
    const mainColor = normalizeShopHexColor(level?.main_color || level?.design_color, "#46b13b");
    const baseColor = normalizeShopHexColor(level?.base_color, "#1f8d2e");
    const contentColor = normalizeShopHexColor(level?.content_color, "#ffffff");
    const titleColor = normalizeShopHexColor(level?.title_color, "#1f2937");
    const cashbackValue = normalizeShopCardPercent(level?.cashback_percent, 1);
    const favoriteCategoryBonusText = formatShopBonusFavoriteCategoriesRange(level);
    const favoriteCategoryLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const favoriteCategoryPreviewHtml = buildBonusLevelPreviewFavoriteCategoriesHtml(level, contentColor, favoriteCategoryLimit);
    const showTitle = level?.show_title_on_card !== false;
    const titleStyle = level?.title_background_enabled === false
      ? `color:${escapeHtml(titleColor)};background:transparent;padding:0;border-radius:0;${showTitle ? "" : "display:none;"}`
      : `color:${escapeHtml(titleColor)};background:${escapeHtml(buildShopRgbaColor(level?.title_background_color || "#ffffff", level?.title_background_opacity))};padding:2px 10px;border-radius:999px;${showTitle ? "" : "display:none;"}`;
    const qrStyle = level?.qr_enabled === false ? "display:none;" : "";

    const coinName = state.homeBonusConfig?.settings?.bonus_coin_name || "Бонусы";
    const isPaid = level?.access_type === "paid";
    const programName = isPaid
      ? (state.homeBonusConfig?.settings?.bonus_program_name_paid || state.homeBonusConfig?.settings?.bonus_program_name || "")
      : (state.homeBonusConfig?.settings?.bonus_program_name_base || state.homeBonusConfig?.settings?.bonus_program_name || "");
    const programLogo = isPaid
      ? (state.homeBonusConfig?.settings?.bonus_program_logo_paid || state.homeBonusConfig?.settings?.bonus_program_logo || "")
      : (state.homeBonusConfig?.settings?.bonus_program_logo_base || state.homeBonusConfig?.settings?.bonus_program_logo || "");
    const levelTitle = level?.title || "Уровень";
    const logoSize = stackedTitle ? "2.6em" : "1.1em";
    const logoHtml = programLogo ? `<img class="shop-home-bonus-card__program-logo" src="${escapeHtml(programLogo)}" style="width:${logoSize};height:${logoSize};border-radius:2px;margin-right:${stackedTitle ? "0" : "4px"};object-fit:contain;display:inline-block;vertical-align:middle;">` : "";
    const titleHtml = stackedTitle
      ? `${logoHtml}<span class="shop-home-bonus-card__title-text"><span class="shop-home-bonus-card__program-name">${escapeHtml(programName)}</span><span class="shop-home-bonus-card__level-name">${escapeHtml(levelTitle)}</span></span>`
      : `${logoHtml}<span style="font-weight:600;margin-right:4px;">${escapeHtml(programName)}</span><span style="opacity:0.8;">${escapeHtml(levelTitle)}</span>`;

    return `
      <div class="bonus-level-preview-card" style="background:${escapeHtml(baseColor)};">
        <div class="bonus-level-preview-main" style="background:${escapeHtml(mainColor)};color:${escapeHtml(contentColor)};">
          <div class="bonus-level-preview-title${stackedTitle ? " shop-home-bonus-card__title" : ""}" style="${titleStyle}">${titleHtml}</div>
          <div class="bonus-level-preview-bonus-label" style="color:${escapeHtml(contentColor)};">${escapeHtml(coinName)}</div>
          <div class="bonus-level-preview-bonus-value" style="color:${escapeHtml(contentColor)};">${formatShopBonusMoney(getBonusLevelPreviewBalance(level))}</div>
          ${showQr ? `<div class="bonus-level-preview-qr" style="${qrStyle}"><span>QR</span></div>` : ""}
        </div>
        <div class="bonus-level-preview-sub" style="color:${escapeHtml(contentColor)};">
          <div class="bonus-level-preview-cashback-side" role="button" tabindex="0" data-open-bonus-preview-cashback>
            <div class="bonus-level-preview-cashback-icon" style="color:${escapeHtml(contentColor)};"><i class="fas fa-undo-alt" aria-hidden="true"></i></div>
            <div class="bonus-level-preview-cashback-value" style="color:${escapeHtml(contentColor)};">${escapeHtml(`${cashbackValue}%`)}</div>
          </div>
          <div class="bonus-level-preview-category-side${favoriteCategoryLimit > 0 ? "" : " hidden"}" role="button" tabindex="0" data-open-bonus-preview-favorite-categories>
            ${favoriteCategoryPreviewHtml}
            <div class="bonus-level-preview-category-value" style="color:${escapeHtml(contentColor)};">${escapeHtml(favoriteCategoryBonusText)}</div>
          </div>
        </div>
      </div>
    `;
  }

  function getHomeReferralCardSettings(config = state.homeBonusConfig) {
    const settings = config?.settings && typeof config.settings === "object" ? config.settings : {};
    if (settings.referral_program_enabled !== true) return null;
    const levels = Array.isArray(config?.referral_levels) ? config.referral_levels : [];
    const firstLevel = levels.find((level) => level?.is_active !== false) || null;
    const totalPercent = getHomeReferralPercentTotal(firstLevel?.percent, config);
    return {
      mainColor: normalizeShopHexColor(settings.referral_card_main_color, "#f3f4f6"),
      baseColor: normalizeShopHexColor(settings.referral_card_base_color, "#d1d5db"),
      contentColor: normalizeShopHexColor(settings.referral_card_content_color, "#64748b"),
      buttonColor: normalizeShopHexColor(settings.referral_card_button_color, "#ff6a00"),
      qrEnabled: settings.referral_card_qr_enabled !== false,
      titleBackgroundEnabled: settings.referral_card_title_background_enabled !== false,
      titleBackgroundColor: normalizeShopHexColor(settings.referral_card_title_background_color, "#ffffff"),
      titleBackgroundOpacity: normalizeShopOpacity(settings.referral_card_title_background_opacity, 90),
      percent: formatShopBonusNumber(totalPercent, 0),
    };
  }

  function getHomeCurrentBonusLevelForReferral(config = state.homeBonusConfig) {
    const levels = Array.isArray(config?.levels) ? config.levels : [];
    if (!levels.length) return null;
    const accountLevelId = Number(config?.account?.level_id || 0);
    if (accountLevelId > 0) {
      const current = levels.find((level) => Number(level?.id || 0) === accountLevelId);
      if (current) return current;
    }
    return levels.find((level) => level?.is_active !== false) || levels[0] || null;
  }

  function getHomeReferralBonusExtraPercent(config = state.homeBonusConfig) {
    const level = getHomeCurrentBonusLevelForReferral(config);
    const value = Number(level?.referral_bonus_percent || 0);
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }

  function getHomeReferralPercentTotal(basePercent, config = state.homeBonusConfig) {
    const base = Number(basePercent || 0);
    const safeBase = Number.isFinite(base) ? Math.max(0, base) : 0;
    return safeBase + getHomeReferralBonusExtraPercent(config);
  }

  function buildHomeReferralCardHtml(config = state.homeBonusConfig) {
    const design = getHomeReferralCardSettings(config);
    if (!design) return "";
    const titleStyle = design.titleBackgroundEnabled
      ? `color:${escapeHtml(design.contentColor)};background:${escapeHtml(buildShopRgbaColor(design.titleBackgroundColor, design.titleBackgroundOpacity))};padding:2px 10px;border-radius:999px;`
      : `color:${escapeHtml(design.contentColor)};background:transparent;padding:0;border-radius:0;`;
    const qrStyle = design.qrEnabled ? "" : "display:none;";
    return `
      <div class="bonus-level-preview-card shop-home-referral-card__preview" data-open-referrals-sheet style="background:${escapeHtml(design.baseColor)};">
        <div class="bonus-level-preview-main" style="background:${escapeHtml(design.mainColor)};color:${escapeHtml(design.contentColor)};">
          <div class="bonus-level-preview-title" style="${titleStyle}">Рефералы</div>
          <div class="bonus-level-preview-bonus-label" style="color:${escapeHtml(design.contentColor)};">Рефералов</div>
          <div class="bonus-level-preview-bonus-value" data-home-referral-invite-count style="color:${escapeHtml(design.contentColor)};">${escapeHtml(String(Number(config?.referral_stats?.referrals_total || 0)))}</div>
          <div class="bonus-level-preview-qr" data-home-referral-qr style="${qrStyle}"><span>QR</span></div>
        </div>
        <div class="bonus-level-preview-sub" style="color:${escapeHtml(design.contentColor)};">
          <div class="bonus-level-preview-cashback-side">
            <div class="bonus-level-preview-cashback-icon" style="color:${escapeHtml(design.contentColor)};"><i class="fas fa-user-plus" aria-hidden="true"></i></div>
            <div class="bonus-level-preview-cashback-value" style="color:${escapeHtml(design.contentColor)};">${escapeHtml(`${design.percent}%`)}</div>
          </div>
          <div class="shop-home-referral-invite-side">
            <button class="shop-home-referral-invite-pill" type="button" data-home-referral-share style="background:${escapeHtml(design.buttonColor)};">Пригласить друга</button>
          </div>
        </div>
      </div>
    `;
  }

  let homeReferralQrLibraryPromise = null;
  function getHomeReferralQrStylingCtor() {
    return typeof window.QRCodeStyling === "function"
      ? window.QRCodeStyling
      : (window.QRCodeStyling && typeof window.QRCodeStyling.default === "function"
        ? window.QRCodeStyling.default
        : (window.QRCodeStyling && typeof window.QRCodeStyling.QRCodeStyling === "function"
          ? window.QRCodeStyling.QRCodeStyling
          : null));
  }

  function loadHomeReferralQrScript(src, key, isReady) {
    if (isReady()) return Promise.resolve(true);
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[data-shop-referral-qr-lib="${key}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(isReady()), { once: true });
        existing.addEventListener("error", () => resolve(false), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.shopReferralQrLib = key;
      script.addEventListener("load", () => resolve(isReady()), { once: true });
      script.addEventListener("error", () => resolve(false), { once: true });
      document.head.appendChild(script);
    });
  }

  function ensureHomeReferralQrLibrary() {
    if (getHomeReferralQrStylingCtor() || typeof window.QRCode === "function") return Promise.resolve(true);
    if (homeReferralQrLibraryPromise) return homeReferralQrLibraryPromise;
    homeReferralQrLibraryPromise = loadHomeReferralQrScript(
      "/static/vendor/qr-code-styling.min.js",
      "styling",
      () => !!getHomeReferralQrStylingCtor()
    ).then((styledReady) => {
      if (styledReady) return true;
      return loadHomeReferralQrScript(
        "/static/vendor/qrcode/qrcode.min.js?v=20260406a",
        "basic",
        () => typeof window.QRCode === "function"
      );
    });
    return homeReferralQrLibraryPromise;
  }

  function renderHomeReferralQr(mount, inviteUrl) {
    if (!mount) return;
    const url = str(inviteUrl || "");
    mount.dataset.qrUrl = url;
    mount.innerHTML = "";
    mount.classList.remove("is-rendered", "is-styled");
    if (!url) {
      mount.innerHTML = "<span>QR</span>";
      return;
    }
    mount.title = url;
    const QrCodeStylingCtor = getHomeReferralQrStylingCtor();
    if (!QrCodeStylingCtor && typeof window.QRCode !== "function") {
      mount.innerHTML = "<span>QR</span>";
      ensureHomeReferralQrLibrary().then((ready) => {
        if (ready && mount.isConnected && mount.dataset.qrUrl === url) {
          renderHomeReferralQr(mount, url);
        }
      });
      return;
    }
    try {
      if (typeof QrCodeStylingCtor === "function") {
        const qr = new QrCodeStylingCtor({
          width: 92,
          height: 92,
          type: "svg",
          data: url,
          margin: 0,
          qrOptions: {
            errorCorrectionLevel: "M",
          },
          dotsOptions: {
            color: "#000000",
            type: "classy-rounded",
          },
          cornersSquareOptions: {
            color: "#000000",
            type: "extra-rounded",
          },
          cornersDotOptions: {
            color: "#000000",
            type: "dot",
          },
          backgroundOptions: {
            color: "#ffffff",
          },
        });
        qr.append(mount);
        mount.classList.add("is-rendered", "is-styled");
        return;
      }
      new window.QRCode(mount, {
        text: url,
        width: 92,
        height: 92,
        colorDark: "#111827",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel?.M || 0,
      });
      mount.classList.add("is-rendered");
    } catch {
      mount.innerHTML = "<span>QR</span>";
    }
  }

  function renderHomeReferralCardData(data = null) {
    if (!elHomeBonusCard || !data) return;
    const countNode = elHomeBonusCard.querySelector("[data-home-referral-invite-count]");
    if (countNode) countNode.textContent = String(Math.max(0, Math.floor(Number(data?.stats?.referrals_total || 0))));
    elHomeBonusCard.querySelectorAll("[data-home-referral-share]").forEach((button) => {
      button.dataset.referralInviteUrl = str(data?.invite_url || "");
    });
    renderHomeReferralQr(elHomeBonusCard.querySelector("[data-home-referral-qr]"), data?.invite_url || "");
  }

  function resetHomeReferralStatsCache() {
    resetHomeReferralStatsCache();
    state._homeReferralStatsLoadedAt = 0;
  }

  function getCachedHomeReferralStats(maxAgeMs = 60000) {
    const token = getCustomerToken();
    if (!token || state._homeReferralStatsToken !== token || !state._homeReferralStats) return null;
    const loadedAt = Number(state._homeReferralStatsLoadedAt || 0);
    if (maxAgeMs > 0 && loadedAt > 0 && Date.now() - loadedAt > maxAgeMs) return null;
    return state._homeReferralStats;
  }

  function loadHomeReferralStats(options = {}) {
    const loadOptions = options && typeof options === "object" ? options : {};
    const token = getCustomerToken();
    if (!token || !isHomeBonusJoined()) return Promise.resolve(null);
    if (state._homeReferralStatsToken && state._homeReferralStatsToken !== token) {
      resetHomeReferralStatsCache();
    }
    const cached = loadOptions.force ? null : getCachedHomeReferralStats(loadOptions.maxAgeMs ?? 60000);
    if (cached) return Promise.resolve(cached);
    if (state._homeReferralStatsLoading) return state._homeReferralStatsLoading;
    state._homeReferralStatsToken = token;
    state._homeReferralStatsLoading = apiJson("/api/public/bonus/referrals")
      .then((json) => {
        state._homeReferralStats = json?.data || null;
        state._homeReferralStatsToken = token;
        state._homeReferralStatsLoadedAt = Date.now();
        renderHomeReferralCardData(state._homeReferralStats);
        return state._homeReferralStats;
      })
      .catch((err) => {
        console.error("Failed to load referral stats:", err);
        throw err;
      })
      .finally(() => {
        state._homeReferralStatsLoading = null;
      });
    return state._homeReferralStatsLoading;
  }

  function refreshHomeReferralCardData() {
    const token = getCustomerToken();
    if (!token || !isHomeBonusJoined()) return;
    const cached = getCachedHomeReferralStats(60000);
    if (cached) {
      renderHomeReferralCardData(cached);
      return;
    }
    loadHomeReferralStats()
      .catch((err) => {
        console.error("Failed to load referral card stats:", err);
      });
  }

  function buildBonusCardsAdvantageRow(label, value, options = {}) {
    const info = options.info === true;
    const delta = String(options.delta || "").trim();
    return `
      <div class="shop-bonus-cards-advantage-row">
        <div class="shop-bonus-cards-advantage-label">${escapeHtml(label)}</div>
        <div class="shop-bonus-cards-advantage-value">
          <span>${value}</span>
          ${delta ? `<span class="shop-bonus-cards-advantage-delta">${escapeHtml(delta)}</span>` : ""}
          ${info ? '<button class="shop-bonus-cards-info-btn" type="button" data-bonus-range-info aria-label="Подробнее">i</button>' : ""}
        </div>
      </div>
    `;
  }

  function formatShopBonusCompareDelta(value, baseValue, suffix = "%") {
    const current = Number(value || 0);
    const base = Number(baseValue || 0);
    const diff = current - base;
    if (Math.abs(diff) < 0.0001) return "";
    const sign = diff > 0 ? "+" : "-";
    const abs = Math.abs(diff);
    const formatted = suffix === "%"
      ? formatShopBonusPercent(abs, 0)
      : String(Math.round(abs));
    return `${sign}${formatted}`;
  }

  function buildBonusCardsAdvantagesHtml(level, settings, baseLevel = null) {
    const favoriteBonus = Math.max(0, Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || 0));
    const favoriteLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const baseFavoriteBonus = Math.max(0, Number(baseLevel?.favorite_categories_max_bonus_percent || baseLevel?.favorite_categories_bonus_percent || 0));
    const baseFavoriteLimit = Math.max(0, Math.floor(Number(baseLevel?.favorite_categories_limit || 0)));
    const favoriteBonusDelta = baseLevel ? formatShopBonusCompareDelta(favoriteBonus, baseFavoriteBonus) : "";
    const favoriteLimitDelta = baseLevel ? formatShopBonusCompareDelta(favoriteLimit, baseFavoriteLimit, "") : "";
    const favoriteDelta = [favoriteBonusDelta ? `кэшбек ${favoriteBonusDelta}` : "", favoriteLimitDelta ? `категории ${favoriteLimitDelta}` : ""].filter(Boolean).join(" · ");
    const favoriteText = favoriteBonus > 0 || favoriteLimit > 0
      ? `Кэшбек: +${formatShopBonusFavoriteCategoriesRange(level)} / Количество категорий: ${favoriteLimit}`
      : "Не настроено";
    return `
      <div class="shop-bonus-cards-advantages" data-bonus-cards-advantages>
        ${buildBonusCardsAdvantageRow("Кэшбек, %", formatShopBonusPercent(level?.cashback_percent, 0), { delta: baseLevel ? formatShopBonusCompareDelta(level?.cashback_percent, baseLevel?.cashback_percent) : "" })}
        ${buildBonusCardsAdvantageRow("Можно списывать, %", formatShopBonusPercent(level?.redeem_percent, 0), { delta: baseLevel ? formatShopBonusCompareDelta(level?.redeem_percent, baseLevel?.redeem_percent) : "" })}
        ${buildBonusCardsAdvantageRow("Доп % за рефералов", formatShopBonusPercent(level?.referral_bonus_percent, 0), { delta: baseLevel ? formatShopBonusCompareDelta(level?.referral_bonus_percent, baseLevel?.referral_bonus_percent) : "" })}
        ${buildBonusCardsAdvantageRow("Одновременно списывать и начислять", settings?.allow_redeem_and_accrue ? "Да" : "Нет")}
        ${buildBonusCardsAdvantageRow("Станут активны", formatShopBonusPeriod(level?.activation_delay_value, level?.activation_delay_unit))}
        ${buildBonusCardsAdvantageRow("Время жизни бонусов", formatShopBonusPeriod(level?.lifetime_value, level?.lifetime_unit))}
        ${buildBonusCardsAdvantageRow("Дополнительные бонусы за сумму заказа", getShopBonusRangeSummary(level), { info: getShopBonusRanges(level).length > 0 })}
        ${buildBonusCardsAdvantageRow("Доп. бонус за покупку любимых категорий", favoriteText, { delta: favoriteDelta })}
        <div class="shop-bonus-cards-info-popover hidden" data-bonus-range-popover></div>
      </div>
    `;
  }

  function buildBonusCardsConditionsHtml(level) {
    return buildBonusCardsConditionsProgressHtml(level);
    if (String(level?.access_type || "").trim() !== "conditions") return "";
    const rows = [];
    const amount = Math.max(0, Number(progress.amount_target || level?.requirement_amount || 0));
    const orders = Math.max(0, Math.floor(Number(progress.orders_target || level?.requirement_orders || 0)));
    const referrals = Math.max(0, Math.floor(Number(progress.referrals_target || level?.requirement_referrals || 0)));
    if (amount > 0) rows.push({ icon: "💰", title: "Сумма заказов", value: `0 ₽ / ${formatShopBonusMoney(amount)}` });
    if (orders > 0) rows.push({ icon: "🛒", title: "Количество заказов", value: `0 / ${orders}` });
    if (referrals > 0) rows.push({ icon: "👥", title: "Рефералы", value: `0 / ${referrals}` });
    if (!rows.length) return "";
    const matchCount = Math.min(rows.length, Math.max(1, Math.floor(Number(level?.requirement_match_count || 1))));
    return `
      <div class="shop-bonus-cards-conditions">
        <div class="shop-bonus-cards-conditions-title">До нового уровня</div>
        <div class="shop-bonus-cards-conditions-subtitle">Выполните ${matchCount} из ${rows.length} условий:</div>
        <div class="shop-bonus-cards-conditions-list">
          ${rows.map((row) => `
            <div class="shop-bonus-cards-progress-item">
              <div class="shop-bonus-cards-progress-icon" aria-hidden="true">${escapeHtml(row.icon)}</div>
              <div class="shop-bonus-cards-progress-main">
                <div class="shop-bonus-cards-progress-title">${escapeHtml(row.title)}</div>
                <div class="shop-bonus-cards-progress-value">${escapeHtml(row.value)}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }

  function getShopBonusProgressRatio(current, target) {
    const currentValue = Math.max(0, Number(current || 0));
    const targetValue = Math.max(0, Number(target || 0));
    if (!(targetValue > 0)) return 0;
    return Math.max(0, Math.min(100, (currentValue / targetValue) * 100));
  }

  function getHomeBonusConditionRows(level) {
    const hasProgress = !!(level?.progress && typeof level.progress === "object");
    const progress = hasProgress ? level.progress : {};
    const rows = [];
    const amount = Math.max(0, Number(progress.amount_target || level?.requirement_amount || 0));
    const orders = Math.max(0, Math.floor(Number(progress.orders_target || level?.requirement_orders || 0)));
    const referrals = Math.max(0, Math.floor(Number(progress.referrals_target || level?.requirement_referrals || 0)));
    const amountCurrent = Math.max(0, Number(progress.amount_current || 0));
    const ordersCurrent = Math.max(0, Math.floor(Number(progress.orders_current || 0)));
    const referralsCurrent = Math.max(0, Math.floor(Number(progress.referrals_current || 0)));
    const bonusAccrued = Math.max(0, Number(progress.bonus_accrued_target || level?.requirement_bonus_accrued || 0));
    const bonusRedeemed = Math.max(0, Number(progress.bonus_redeemed_target || level?.requirement_bonus_redeemed || 0));
    const bonusAccruedCurrent = Math.max(0, Number(progress.bonus_accrued_current || 0));
    const bonusRedeemedCurrent = Math.max(0, Number(progress.bonus_redeemed_current || 0));

    if (amount > 0) rows.push({
      icon: "рџ’°",
      title: "РЎСѓРјРјР° Р·Р°РєР°Р·РѕРІ",
      value: `${money(amountCurrent)} / ${money(amount)}`,
      current: amountCurrent,
      target: amount,
    });
    if (orders > 0) rows.push({
      icon: "рџ›’",
      title: "РљРѕР»РёС‡РµСЃС‚РІРѕ Р·Р°РєР°Р·РѕРІ",
      value: `${ordersCurrent} / ${orders}`,
      current: ordersCurrent,
      target: orders,
    });
    if (referrals > 0) rows.push({
      icon: "рџ‘Ґ",
      title: "Р РµС„РµСЂР°Р»С‹",
      value: `${referralsCurrent} / ${referrals}`,
      current: referralsCurrent,
      target: referrals,
    });
    if (bonusAccrued > 0) rows.push({
      icon: "+",
      title: "РќР°РєРѕРїРёС‚СЊ Р±РѕРЅСѓСЃРѕРІ",
      value: `${formatShopBonusMoney(bonusAccruedCurrent)} / ${formatShopBonusMoney(bonusAccrued)}`,
      current: bonusAccruedCurrent,
      target: bonusAccrued,
    });
    if (bonusRedeemed > 0) rows.push({
      icon: "-",
      title: "РџРѕС‚СЂР°С‚РёС‚СЊ Р±РѕРЅСѓСЃРѕРІ",
      value: `${formatShopBonusMoney(bonusRedeemedCurrent)} / ${formatShopBonusMoney(bonusRedeemed)}`,
      current: bonusRedeemedCurrent,
      target: bonusRedeemed,
    });
    return rows;
  }

  function getHomeBonusConditionMatchCount(level, rows = null) {
    const list = Array.isArray(rows) ? rows : getHomeBonusConditionRows(level);
    if (!list.length) return 0;
    const progress = level?.progress && typeof level.progress === "object" ? level.progress : {};
    return Math.min(list.length, Math.max(1, Math.floor(Number(progress.match_count || level?.requirement_match_count || 1))));
  }

  function getHomeBonusConditionsProgressRatio(level) {
    const rows = getHomeBonusConditionRows(level);
    const matchCount = getHomeBonusConditionMatchCount(level, rows);
    if (!rows.length || !(matchCount > 0)) return 0;
    const ratios = rows
      .map((row) => getShopBonusProgressRatio(row.current, row.target) / 100)
      .sort((a, b) => b - a)
      .slice(0, matchCount);
    const total = ratios.reduce((sum, value) => sum + Math.max(0, Math.min(1, value)), 0);
    return Math.max(0, Math.min(1, total / matchCount));
  }

  function buildBonusCardsProgressItemHtml(row) {
    const ratio = getShopBonusProgressRatio(row.current, row.target);
    return `
      <div class="shop-bonus-cards-progress-item">
        <div class="shop-bonus-cards-progress-icon" aria-hidden="true">${escapeHtml(row.icon)}</div>
        <div class="shop-bonus-cards-progress-main">
          <div class="shop-bonus-cards-progress-title">${escapeHtml(row.title)}</div>
          <div class="shop-bonus-cards-progress-value">${row.value}</div>
          <div class="shop-bonus-cards-progress-bar" aria-hidden="true">
            <div class="shop-bonus-cards-progress-fill" style="width:${ratio}%;"></div>
          </div>
        </div>
      </div>
    `;
  }

  function buildBonusCardsConditionsProgressHtml(level) {
    if (String(level?.access_type || "").trim() !== "conditions") return "";
    const hasProgress = !!(level?.progress && typeof level.progress === "object");
    const progress = hasProgress ? level.progress : {};
    const accountLevelId = Number(state.homeBonusConfig?.account?.level_id || 0);
    const isRetention = String(progress.scope || "").trim() === "retention";
    if (accountLevelId > 0) {
      const nextLevel = getHomeBonusNextLevelById(accountLevelId);
      const isNextLevel = nextLevel && Number(nextLevel?.id || 0) === Number(level?.id || 0);
      const isCurrentRetention = isRetention && accountLevelId === Number(level?.id || 0);
      if (!isNextLevel && !isCurrentRetention) return "";
    }
    const isCurrentLevel = accountLevelId > 0 && accountLevelId === Number(level?.id || 0);
    if (isCurrentLevel && !hasProgress) return "";
    const rows = [];
    const amount = Math.max(0, Number(progress.amount_target || level?.requirement_amount || 0));
    const orders = Math.max(0, Math.floor(Number(progress.orders_target || level?.requirement_orders || 0)));
    const referrals = Math.max(0, Math.floor(Number(progress.referrals_target || level?.requirement_referrals || 0)));
    const amountCurrent = Math.max(0, Number(progress.amount_current || 0));
    const ordersCurrent = Math.max(0, Math.floor(Number(progress.orders_current || 0)));
    const referralsCurrent = Math.max(0, Math.floor(Number(progress.referrals_current || 0)));
    const bonusAccrued = Math.max(0, Number(progress.bonus_accrued_target || level?.requirement_bonus_accrued || 0));
    const bonusRedeemed = Math.max(0, Number(progress.bonus_redeemed_target || level?.requirement_bonus_redeemed || 0));
    const bonusAccruedCurrent = Math.max(0, Number(progress.bonus_accrued_current || 0));
    const bonusRedeemedCurrent = Math.max(0, Number(progress.bonus_redeemed_current || 0));

    if (amount > 0) rows.push({
      icon: "💰",
      title: "Сумма заказов",
      value: `${money(amountCurrent)} / ${money(amount)}`,
      current: amountCurrent,
      target: amount,
    });
    if (orders > 0) rows.push({
      icon: "🛒",
      title: "Количество заказов",
      value: `${ordersCurrent} / ${orders}`,
      current: ordersCurrent,
      target: orders,
    });
    if (referrals > 0) rows.push({
      icon: "👥",
      title: "Рефералы",
      value: `${referralsCurrent} / ${referrals}`,
      current: referralsCurrent,
      target: referrals,
    });
    if (bonusAccrued > 0) rows.push({
      icon: "+",
      title: "Накопить бонусов",
      value: `${formatShopBonusMoney(bonusAccruedCurrent)} / ${formatShopBonusMoney(bonusAccrued)}`,
      current: bonusAccruedCurrent,
      target: bonusAccrued,
    });
    if (bonusRedeemed > 0) rows.push({
      icon: "-",
      title: "Потратить бонусов",
      value: `${formatShopBonusMoney(bonusRedeemedCurrent)} / ${formatShopBonusMoney(bonusRedeemed)}`,
      current: bonusRedeemedCurrent,
      target: bonusRedeemed,
    });
    if (!rows.length) return "";
    const matchCount = getHomeBonusConditionMatchCount(level, rows);

    return `
      <div class="shop-bonus-cards-conditions">
        <div class="shop-bonus-cards-conditions-title">${isRetention ? "Удержание уровня" : "До нового уровня"}</div>
        <div class="shop-bonus-cards-conditions-subtitle">Выполните ${matchCount} из ${rows.length} условий:</div>
        <div class="shop-bonus-cards-conditions-list">
          ${rows.map(buildBonusCardsProgressItemHtml).join("")}
        </div>
      </div>
    `;
  }

  function updateBonusCardsSheetAdvantages(wrap, levels, activeIndex) {
    const host = wrap?.querySelector("[data-bonus-cards-advantages-host]");
    const conditionsHost = wrap?.querySelector("[data-bonus-cards-conditions-host]");
    if (!host) return;
    const index = Math.max(0, Math.min(levels.length - 1, Number(activeIndex || 0)));
    const level = levels[index];
    const baseLevelId = Number(state.homeBonusConfig?.account?.level_id || 0);
    const baseLevel = baseLevelId > 0
      ? levels.find((item) => Number(item?.id || 0) === baseLevelId) || null
      : null;
    if (conditionsHost) {
      const conditionsHtml = buildBonusCardsConditionsProgressHtml(level);
      conditionsHost.innerHTML = conditionsHtml;
      conditionsHost.classList.toggle("hidden", !conditionsHtml);
    }
    host.innerHTML = buildBonusCardsAdvantagesHtml(level, state.homeBonusConfig?.settings || {}, baseLevel);
    if (elMobileBonusCardsActionBtn) {
      elMobileBonusCardsActionBtn.textContent = getHomeBonusSheetActionText(level);
      elMobileBonusCardsActionBtn.onclick = () => {
        if (String(level?.access_type || "").trim() === "paid") {
          if (!getCustomerToken() && typeof openProfileSheet === "function") {
            openProfileSheet();
          }
          return;
        }
        void joinHomeBonusProgram();
      };
    }
    const infoBtn = host.querySelector("[data-bonus-range-info]");
    const popover = host.querySelector("[data-bonus-range-popover]");
    if (!infoBtn || !popover) return;
    infoBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      const rows = getShopBonusRangeDetails(levels[index]);
      popover.innerHTML = rows.map((row) => `<div>${escapeHtml(row)}</div>`).join("");
      popover.classList.toggle("hidden");
    });
  }

  function renderBonusCardsSheetContent(wrap, options = {}) {
    if (!wrap) return;
    const data = state.homeBonusConfig && typeof state.homeBonusConfig === "object" ? state.homeBonusConfig : null;
    const levels = data?.settings?.bonus_program_enabled === true && Array.isArray(data.levels)
      ? data.levels.filter((level) => level && String(level.title || "").trim())
      : [];
    if (!levels.length) {
      wrap.innerHTML = "";
      return;
    }
    if (data?.settings?.bonus_program_name) {
      const modalTitle = document.querySelector(".app-modal-title");
      if (modalTitle) modalTitle.textContent = data.settings.bonus_program_name;
    }

    wrap.innerHTML = `
      <div class="shop-bonus-cards-carousel">
        <button class="shop-bonus-cards-carousel__arrow shop-bonus-cards-carousel__arrow--prev" type="button" aria-label="Предыдущая карта">
          <i class="fas fa-chevron-left" aria-hidden="true"></i>
        </button>
        <div class="shop-bonus-cards-carousel__track" data-bonus-cards-track>
          ${levels.map((level) => `
            <div class="shop-bonus-cards-carousel__slide">
              ${buildBonusLevelPreviewCardHtml(level)}
            </div>
          `).join("")}
        </div>
        <button class="shop-bonus-cards-carousel__arrow shop-bonus-cards-carousel__arrow--next" type="button" aria-label="Следующая карта">
          <i class="fas fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      <div class="shop-bonus-cards-conditions-host" data-bonus-cards-conditions-host></div>
      <div class="shop-bonus-cards-advantages-host" data-bonus-cards-advantages-host></div>
    `;

    const track = wrap.querySelector("[data-bonus-cards-track]");
    const initialLevelId = Number(options.initialLevelId || 0);
    const initialIndex = initialLevelId > 0
      ? Math.max(0, levels.findIndex((level) => Number(level?.id || 0) === initialLevelId))
      : 0;
    let activeIndex = initialIndex;
    let scrollTimer = null;
    const getActiveIndex = () => {
      if (!track) return 0;
      const slides = Array.from(track.querySelectorAll(".shop-bonus-cards-carousel__slide"));
      if (!slides.length) return 0;
      const trackRect = track.getBoundingClientRect();
      const center = trackRect.left + trackRect.width / 2;
      let bestIndex = 0;
      let bestDistance = Infinity;
      slides.forEach((slide, index) => {
        const rect = slide.getBoundingClientRect();
        const slideCenter = rect.left + rect.width / 2;
        const distance = Math.abs(slideCenter - center);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      });
      return bestIndex;
    };
    const syncActiveAdvantages = () => {
      const nextIndex = getActiveIndex();
      if (nextIndex === activeIndex && wrap.querySelector("[data-bonus-cards-advantages]")) return;
      activeIndex = nextIndex;
      updateBonusCardsSheetAdvantages(wrap, levels, activeIndex);
    };
    const scrollToStep = (direction) => {
      if (!track) return;
      const firstSlide = track.querySelector(".shop-bonus-cards-carousel__slide");
      const step = firstSlide ? firstSlide.getBoundingClientRect().width : track.clientWidth;
      track.scrollBy({ left: direction * Math.max(1, step), behavior: "smooth" });
    };
    const scrollToIndex = (index) => {
      if (!track) return;
      const slides = Array.from(track.querySelectorAll(".shop-bonus-cards-carousel__slide"));
      const slide = slides[Math.max(0, Math.min(slides.length - 1, Number(index || 0)))];
      if (!slide) return;
      const left = slide.offsetLeft - Math.max(0, (track.clientWidth - slide.clientWidth) / 2);
      track.scrollTo({ left: Math.max(0, left), behavior: "auto" });
    };
    wrap.querySelector(".shop-bonus-cards-carousel__arrow--prev")?.addEventListener("click", () => scrollToStep(-1));
    wrap.querySelector(".shop-bonus-cards-carousel__arrow--next")?.addEventListener("click", () => scrollToStep(1));
    track?.addEventListener("scroll", () => {
      if (scrollTimer) clearTimeout(scrollTimer);
      scrollTimer = setTimeout(syncActiveAdvantages, 90);
    }, { passive: true });
    requestAnimationFrame(() => scrollToIndex(activeIndex));
    updateBonusCardsSheetAdvantages(wrap, levels, activeIndex);
    bindBonusCardsPreviewActions(wrap, levels, {
      returnTo: "bonus-cards",
      bonusCardsReturnTo: options.returnTo,
      bonusCardsSourceLevel: options.sourceLevel,
    });
    levels.filter(isHomeBonusFavoriteCategoriesEnabled).forEach((level) => {
      void loadHomeBonusFavoriteCategories(level).then(() => {
        updateBonusLevelPreviewFavoriteCategories(wrap, level);
        bindBonusCardsPreviewActions(wrap, levels, {
          returnTo: "bonus-cards",
          bonusCardsReturnTo: options.returnTo,
          bonusCardsSourceLevel: options.sourceLevel,
        });
      }).catch(() => {});
    });
  }

  function openHomeBonusCardsSheet(options = {}) {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet";
    renderBonusCardsSheetContent(wrap, options);
    sheetNavigationState.type = "bonus-cards";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = {
      returnTo: options.returnTo || null,
      sourceLevel: options.sourceLevel || null,
    };
    window.AppModal.open({
      title: state.homeBonusConfig?.settings?.bonus_program_name || "Бонусная программа",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: (event) => {
        const returnTo = options.returnTo || sheetNavigationState.data?.returnTo || null;
        const sourceLevel = options.sourceLevel || sheetNavigationState.data?.sourceLevel || null;
        setBonusCardsSheetHeader(false);
        if (elMobileCartActions) elMobileCartActions.classList.add("hidden");
        if (elMobileBonusCardsActions) elMobileBonusCardsActions.classList.add("hidden");
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        if (shouldReturnToBonusLevelOnClose(event) && returnTo === "bonus-level") {
          returnToBonusLevelSheet(sourceLevel);
        }
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("bonus-cards-sheet-open");
    void loadHomeBonusConfig().then(() => renderBonusCardsSheetContent(wrap, options));
  }

  function getHomeBonusOrderedLevels() {
    const levels = Array.isArray(state.homeBonusConfig?.levels) ? state.homeBonusConfig.levels : [];
    return levels
      .filter((item) => item && String(item.title || "").trim())
      .slice()
      .sort((a, b) => (Number(a?.sort_order || 0) - Number(b?.sort_order || 0)) || (Number(a?.id || 0) - Number(b?.id || 0)));
  }

  function getHomeBonusNextLevelById(levelId) {
    const currentId = Number(levelId || 0);
    if (!(currentId > 0)) return null;
    const ordered = getHomeBonusOrderedLevels();
    const index = ordered.findIndex((item) => Number(item?.id || 0) === currentId);
    return index >= 0 ? (ordered[index + 1] || null) : null;
  }

  function getHomeBonusNextLevel(level) {
    return getHomeBonusNextLevelById(Number(level?.id || 0));
  }

  function getHomeBonusLevelProgressRatio(level) {
    return getHomeBonusConditionsProgressRatio(level);
  }

  function buildHomeBonusLevelProgressHtml(level) {
    const nextLevel = getHomeBonusNextLevel(level);
    const progressLevel = nextLevel || level;
    const progressRows = getHomeBonusConditionRows(progressLevel);
    const rawProgressPercent = Math.round(getHomeBonusLevelProgressRatio(progressLevel) * 100);
    const progressPercent = nextLevel || progressRows.length
      ? rawProgressPercent
      : 100;
    const customer = getCustomerCache() || {};
    const customerPhoto = String(customer?.photo || "").trim();
    const customerName = String(customer?.name || customer?.full_name || customer?.phone || "Профиль").trim() || "Профиль";
    return `
      <button class="shop-bonus-level-progress-card" type="button" data-open-bonus-cards-current>
        <div class="shop-bonus-level-progress-avatar" aria-hidden="true">
          ${customerPhoto ? `<img src="${escapeHtml(customerPhoto)}" alt="" loading="lazy" />` : '<i class="fas fa-user"></i>'}
        </div>
        <div class="shop-bonus-level-progress-main">
          <div class="shop-bonus-level-progress-name">${escapeHtml(customerName)} • <span style="font-weight:400;opacity:0.8;">${escapeHtml(level?.title || "Уровень")}</span></div>
          <div class="shop-bonus-level-progress-track" aria-label="Прогресс до следующего уровня">
            <div class="shop-bonus-level-progress-fill" style="width:${escapeHtml(String(progressPercent))}%;"></div>
          </div>
        </div>
      </button>
    `;
  }

  function closeShopProfileBonusConditionsPopover() {
    document.querySelectorAll(".shop-profile-bonus-conditions-popover").forEach((node) => node.remove());
  }

  function openShopProfileBonusConditionsPopover(trigger, level) {
    if (!trigger) return;
    const nextLevel = getHomeBonusNextLevel(level);
    const conditionsHtml = nextLevel
      ? buildBonusCardsConditionsProgressHtml(nextLevel)
      : buildBonusCardsConditionsProgressHtml(level) || `
        <div class="shop-bonus-cards-conditions">
          <div class="shop-bonus-cards-conditions-title">Максимальный уровень достигнут</div>
          <div class="shop-bonus-cards-conditions-subtitle">Вы уже на последнем уровне бонусной программы.</div>
        </div>
      `;
    if (!conditionsHtml) return;
    const existing = document.querySelector(".shop-profile-bonus-conditions-popover");
    if (existing && existing._sourceTrigger === trigger) {
      existing.remove();
      return;
    }
    closeShopProfileBonusConditionsPopover();
    const popover = document.createElement("div");
    popover.className = "shop-profile-bonus-conditions-popover";
    popover._sourceTrigger = trigger;
    popover.innerHTML = conditionsHtml;
    popover.addEventListener("click", (event) => event.stopPropagation());
    document.body.appendChild(popover);

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = popover.getBoundingClientRect();
    const gap = 8;
    const left = Math.max(12, Math.min(window.innerWidth - popoverRect.width - 12, triggerRect.left + (triggerRect.width - popoverRect.width) / 2));
    const top = Math.max(12, Math.min(window.innerHeight - popoverRect.height - 12, triggerRect.bottom + gap));
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    setTimeout(() => {
      const close = (event) => {
        if (popover.contains(event.target) || trigger.contains(event.target)) return;
        popover.remove();
        document.removeEventListener("click", close, true);
        document.removeEventListener("touchstart", close, true);
      };
      document.addEventListener("click", close, true);
      document.addEventListener("touchstart", close, true);
    }, 0);
  }
  window.openShopProfileBonusConditionsPopover = openShopProfileBonusConditionsPopover;

  function formatShopBonusDateTime(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function getBonusTransactionTypeMeta(type) {
    const key = String(type || "").trim();
    if (key === "accrual") return { label: "Начисление", sign: "+", tone: "plus" };
    if (key === "referral_accrual") return { label: "Рефералы", sign: "+", tone: "plus" };
    if (key === "redeem") return { label: "Списание", sign: "-", tone: "minus" };
    if (key === "expire") return { label: "Сгорание", sign: "-", tone: "minus" };
    if (key === "refund") return { label: "Возврат", sign: "+", tone: "plus" };
    if (key === "level_up") return { label: "Новый уровень", sign: "", tone: "neutral" };
    if (key === "join") return { label: "Вступление", sign: "", tone: "neutral" };
    return { label: "Корректировка", sign: "", tone: "neutral" };
  }

  function getBonusTransactionReasonText(item, meta) {
    const raw = String(item?.reason || item?.source || "").trim();
    const orderMatch = raw.match(/^order:(\d+):([^:]+)$/);
    if (orderMatch) {
      const orderId = orderMatch[1];
      const action = orderMatch[2];
      if (action === "bonus_accrual") return `Бонусы за заказ #${orderId}`;
      if (action === "bonus_redeem") return `Списано в заказе #${orderId}`;
      return `Заказ #${orderId}`;
    }
    const referralLevelMatch = raw.match(/^level_percent:[^:]*:(\d+):L(\d+):/);
    if (referralLevelMatch) {
      return `Бонус за заказ реферала ${referralLevelMatch[2]}-го уровня`;
    }
    if (/^first_purchase:/.test(raw)) return "Бонус за первую покупку друга";
    if (raw === "level_up" || item?.type === "level_up") return "Переход на новый уровень";
    if (raw === "join" || item?.type === "join") return "Бонус за присоединение к программе";
    if (item?.level_title) return String(item.level_title || "").trim();
    return meta?.label || "Движение бонусов";
  }

  function isVisibleBonusTransaction(item) {
    const raw = String(item?.reason || item?.source || "").trim();
    return raw !== "bonus_reserve" && !/^order:\d+:bonus_reserve$/.test(raw);
  }

  function buildBonusTransactionsHtml(items, filter = "all") {
    const rows = Array.isArray(items) ? items : [];
    const visibleRows = rows.filter(isVisibleBonusTransaction);
    const filtered = filter === "all" ? visibleRows : visibleRows.filter((item) => String(item?.type || "") === filter);
    if (!filtered.length) {
      return '<div class="shop-bonus-sheet-empty">Движений пока нет</div>';
    }
    return `
      <div class="shop-bonus-accruals-list">
        ${filtered.map((item) => {
          const meta = getBonusTransactionTypeMeta(item?.type);
          const amount = Math.abs(Number(item?.amount || 0));
          const reason = getBonusTransactionReasonText(item, meta);
          const dateText = formatShopBonusDateTime(item?.created_at);
          const amountText = amount > 0 ? `${meta.sign}${formatShopBonusMoney(amount)}` : `0 ${getShopBonusCoinIconHtml()}`;
          return `
            <div class="shop-bonus-accrual-row">
              <div class="shop-bonus-accrual-main">
                <div class="shop-bonus-accrual-title">${escapeHtml(meta.label)}</div>
                <div class="shop-bonus-accrual-subtitle">${escapeHtml(reason)}</div>
              </div>
              <div class="shop-bonus-accrual-side">
                <div class="shop-bonus-accrual-amount is-${escapeHtml(meta.tone)}">${amountText}</div>
                <div class="shop-bonus-accrual-date">${escapeHtml(dateText)}</div>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function shouldReturnToBonusLevelOnClose(event) {
    return String(event?.reason || "").trim() === "close";
  }

  function returnToBonusLevelSheet(level) {
    if (!level) return;
    setTimeout(() => {
      openHomeBonusLevelSheet(level);
    }, 0);
  }

  function returnToBonusCardsSheet(level, options = {}) {
    setTimeout(() => {
      openHomeBonusCardsSheet({
        initialLevelId: Number(level?.id || 0) || 0,
        returnTo: options.bonusCardsReturnTo,
        sourceLevel: options.bonusCardsSourceLevel,
      });
    }, 0);
  }

  function returnFromBonusNestedSheet(level, options = {}) {
    const returnTo = options && typeof options === "object" ? options.returnTo : null;
    if (returnTo === false || returnTo === "none") {
      if (window.AppModal?.isOpen?.()) window.AppModal.close("sheet");
      return;
    }
    if (returnTo === "bonus-cards") {
      returnToBonusCardsSheet(level, options);
      return;
    }
    returnToBonusLevelSheet(level);
  }

  function maybeReturnFromBonusNestedSheet(event, level, options = {}) {
    if (!shouldReturnToBonusLevelOnClose(event)) return;
    const returnTo = options && typeof options === "object" ? options.returnTo : null;
    if (returnTo === false || returnTo === "none") return;
    returnFromBonusNestedSheet(level, options);
  }

  async function openHomeBonusAccrualsSheet(options = {}) {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const sourceLevel = options && typeof options === "object" ? options.sourceLevel : null;
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet shop-bonus-accruals-sheet";
    const filters = [
      ["all", "Все"],
      ["accrual", "Начисления"],
      ["redeem", "Списания"],
      ["expire", "Сгорания"],
      ["referral_accrual", "Рефералы"],
    ];
    let activeFilter = "all";
    let transactions = [];
    const render = (status = "") => {
      wrap.innerHTML = `
        <div class="shop-bonus-accruals-filter-bar">
          <div class="shop-bonus-sheet-chips">
            ${filters.map(([value, label]) => `
              <button class="shop-bonus-sheet-chip${value === activeFilter ? " is-active" : ""}" type="button" data-bonus-transaction-filter="${escapeHtml(value)}">${escapeHtml(label)}</button>
            `).join("")}
          </div>
        </div>
        <div class="shop-bonus-accruals-host no-scrollbar">
          ${status || buildBonusTransactionsHtml(transactions, activeFilter)}
        </div>
      `;
      wrap.querySelectorAll("[data-bonus-transaction-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeFilter = String(btn.dataset.bonusTransactionFilter || "all");
          render();
        });
      });
    };
    render('<div class="shop-bonus-sheet-empty">Загружаем...</div>');
    sheetNavigationState.type = "bonus-accruals";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = null;
    window.AppModal.open({
      title: "Начисления",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: (event) => {
        setBonusCardsSheetHeader(false);
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        if (shouldReturnToBonusLevelOnClose(event)) {
          returnToBonusLevelSheet(sourceLevel);
        }
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("bonus-accruals-sheet-open");
    if (!getCustomerToken()) {
      render('<div class="shop-bonus-sheet-empty">Войдите, чтобы увидеть начисления</div>');
      return;
    }
    try {
      const json = await apiJson("/api/public/bonus/transactions");
      transactions = Array.isArray(json?.data) ? json.data : [];
      render();
    } catch (err) {
      console.error("load bonus transactions error:", err);
      render('<div class="shop-bonus-sheet-empty">Не удалось загрузить начисления</div>');
    }
  }

  function getHomeBonusFavoriteCategoriesCacheKey() {
    return "current";
  }

  function getHomeBonusFavoriteCategoriesCache(levelId) {
    const key = getHomeBonusFavoriteCategoriesCacheKey(levelId);
    return state.homeBonusFavoriteCategoriesByLevel.get(key) || null;
  }

  function getHomeBonusSelectedFavoriteCategories(level) {
    const cache = getHomeBonusFavoriteCategoriesCache(Number(level?.id || 0));
    const selectedIds = Array.isArray(cache?.selected_ids) ? cache.selected_ids.map((id) => Number(id || 0)) : [];
    const categories = Array.isArray(cache?.categories) ? cache.categories : [];
    return selectedIds
      .map((id) => categories.find((item) => Number(item?.id || 0) === id))
      .filter(Boolean);
  }

  function buildBonusLevelPreviewFavoriteCategoriesHtml(level, contentColor, fallbackCount = 0) {
    const selected = getHomeBonusSelectedFavoriteCategories(level);
    if (selected.length) {
      const visible = selected.slice(0, 3);
      const hiddenCount = Math.max(0, selected.length - visible.length);
      return `
        <div class="bonus-level-preview-category-icons" data-bonus-level-preview-favorites="${escapeHtml(String(Number(level?.id || 0)))}" style="color:${escapeHtml(contentColor)};" aria-hidden="true">
          ${visible.map((category) => {
            const icon = String(category?.icon || "").trim();
            const title = String(category?.title || "").trim();
            return `<span class="bonus-level-preview-category-thumb" title="${escapeHtml(title)}">${icon ? `<img src="${escapeHtml(icon)}" alt="" loading="lazy" />` : '<i class="fas fa-tag" aria-hidden="true"></i>'}</span>`;
          }).join("")}
          ${hiddenCount > 0 ? `<span class="bonus-level-preview-category-more">+${escapeHtml(String(hiddenCount))}</span>` : ""}
        </div>
      `;
    }
    return `
      <div class="bonus-level-preview-category-icon" data-bonus-level-preview-favorites="${escapeHtml(String(Number(level?.id || 0)))}" style="color:${escapeHtml(contentColor)};" aria-hidden="true">
        <span></span><span></span><span></span><span></span>
        <div class="bonus-level-preview-category-count" style="color:${escapeHtml(contentColor)};">${escapeHtml(String(fallbackCount))}</div>
      </div>
    `;
  }

  function updateBonusLevelPreviewFavoriteCategories(root, level) {
    if (!root || typeof root.querySelectorAll !== "function") return;
    const levelId = Number(level?.id || 0);
    if (!(levelId > 0)) return;
    const contentColor = normalizeShopHexColor(level?.content_color, "#ffffff");
    const favoriteCategoryLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const html = buildBonusLevelPreviewFavoriteCategoriesHtml(level, contentColor, favoriteCategoryLimit);
    root.querySelectorAll(`[data-bonus-level-preview-favorites="${String(levelId)}"]`).forEach((node) => {
      node.outerHTML = html;
    });
  }

  async function loadHomeBonusFavoriteCategories(level, options = {}) {
    const levelId = Number(level?.id || 0);
    if (!(levelId > 0)) return null;
    const key = getHomeBonusFavoriteCategoriesCacheKey(levelId);
    const pendingKey = `${key}:${levelId}`;
    if (!options.force) {
      const cached = state.homeBonusFavoriteCategoriesByLevel.get(key);
      if (cached && Number(cached?.level_id || 0) === levelId) return cached;
      const pending = state._homeBonusFavoriteCategoriesLoading.get(pendingKey);
      if (pending) return pending;
    }
    const pending = apiJson(`/api/public/bonus/favorite-categories?level_id=${encodeURIComponent(String(levelId))}`)
      .then((json) => {
        const data = json?.data && typeof json.data === "object" ? json.data : null;
        state.homeBonusFavoriteCategoriesByLevel.set(key, data);
        return data;
      })
      .finally(() => {
        state._homeBonusFavoriteCategoriesLoading.delete(pendingKey);
      });
    state._homeBonusFavoriteCategoriesLoading.set(pendingKey, pending);
    return pending;
  }

  function buildBonusCategoryIconHtml(category) {
    const icon = String(category?.icon || "").trim();
    const title = String(category?.title || "").trim();
    if (icon) {
      return `<span class="shop-bonus-category-icon" title="${escapeHtml(title)}"><img src="${escapeHtml(icon)}" alt="" loading="lazy" /></span>`;
    }
    return `<span class="shop-bonus-category-icon" title="${escapeHtml(title)}"><i class="fas fa-tag" aria-hidden="true"></i></span>`;
  }

  function buildHomeBonusSiteMenuTitleHtml(title) {
    const words = String(title || "").trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (!words.length) return "";
    return words.map((word) => `<span>${escapeHtml(word)}</span>`).join("");
  }

  function getHomeBonusSiteMenuBenefitsSection(key) {
    const normalizedKey = String(key || "").trim();
    if (normalizedKey === "promocodes") return "promos";
    if (normalizedKey === "discounts") return "discounts";
    if (normalizedKey === "gifts") return "gifts";
    if (normalizedKey === "tasks") return "progress";
    return "";
  }

  function buildHomeBonusSiteMenuRowHtml(config = state.homeBonusConfig) {
    const allowedKeys = new Set(["benefits", "promocodes", "discounts", "gifts", "tasks"]);
    const items = (Array.isArray(config?.site_menu_items) ? config.site_menu_items : [])
      .filter((item) => item && allowedKeys.has(String(item.key || "")) && item.enabled !== false)
      .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    if (!items.length) return "";
    return `
      <div class="shop-bonus-site-menu-scroll no-scrollbar" aria-label="\u041f\u0443\u043d\u043a\u0442\u044b \u043c\u0435\u043d\u044e">
        ${items.map((item) => {
          const title = String(item?.title || "").trim();
          const iconUrl = String(item?.icon_url || "").trim();
          const iconClass = String(item?.icon_class || "fas fa-circle").trim();
          const benefitsSection = getHomeBonusSiteMenuBenefitsSection(item?.key);
          const benefitsCountKey = benefitsSection || "benefits";
          return `
            <button class="shop-bonus-site-menu-item" type="button" data-open-shop-benefits-section="${escapeHtml(benefitsSection)}" data-shop-benefits-count-key="${escapeHtml(benefitsCountKey)}">
              <span class="shop-bonus-site-menu-icon" aria-hidden="true">
                ${iconUrl
                  ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" />`
                  : `<i class="${escapeHtml(iconClass)}"></i>`}
                <span class="shop-bonus-site-menu-badge hidden" data-shop-benefits-count-badge>0</span>
              </span>
              <span class="shop-bonus-site-menu-title">${buildHomeBonusSiteMenuTitleHtml(title)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function formatReferralBonusValue(value, signed = false) {
    const amount = Math.round(Number(value || 0));
    if (signed && amount > 0) return `+${moneyFmt.format(amount)}`;
    return moneyFmt.format(amount);
  }

  function formatReferralOrdersText(count) {
    const value = Math.max(0, Math.floor(Number(count || 0)));
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) return `${value} заказ`;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${value} заказа`;
    return `${value} заказов`;
  }

  function buildReferralAvatarHtml(referral) {
    const photo = str(referral?.photo || "").trim();
    if (photo) return `<img src="${escapeHtml(photo)}" alt="" loading="lazy" />`;
    const orders = Number(referral?.orders_count || 0);
    const depth = Math.max(1, Math.floor(Number(referral?.level_depth || 1)));
    const icon = depth > 1 ? "fas fa-users" : (orders > 0 ? "fas fa-user-check" : "fas fa-user");
    return `<i class="${icon}" aria-hidden="true"></i>`;
  }

  function buildHomeReferralsSheetHtml(data = null, loading = false, error = "") {
    const stats = data?.stats || {};
    const inviteUrl = str(data?.invite_url || "");
    const levels = Array.isArray(data?.levels) ? data.levels : [];
    const referrals = Array.isArray(data?.referrals) ? data.referrals : [];
    const referralExtraPercent = getHomeReferralBonusExtraPercent();
    const levelBonusBlocksHtml = levels.length
      ? `
        <div class="shop-referrals-level-bonus-row" style="grid-template-columns:repeat(${escapeHtml(String(Math.max(1, levels.length)))},minmax(0,1fr));">
          ${levels.map((level) => {
            const depth = Math.max(1, Math.floor(Number(level?.depth || level?.invited_count || 0)));
            const title = str(level?.title || `${depth}-й уровень`);
            const basePercentText = formatShopBonusPercent(level?.percent, 0);
            const extraPercentText = referralExtraPercent > 0
              ? `<span class="shop-referrals-level-bonus-extra">+${escapeHtml(formatShopBonusPercent(referralExtraPercent, 0))}</span>`
              : "";
            return `
              <div class="shop-referrals-level-bonus-card">
                <span class="shop-referrals-level-bonus-title">${escapeHtml(title)}</span>
                <strong>${escapeHtml(basePercentText)}${extraPercentText}</strong>
              </div>
            `;
          }).join("")}
        </div>
      `
      : "";
    const chips = [
      `<button class="shop-referrals-filter-chip is-active" type="button" data-referrals-filter="all">Все</button>`,
      ...levels.map((level) => {
        const depth = Math.max(1, Math.floor(Number(level?.depth || level?.invited_count || 0)));
        const title = str(level?.title || `${depth}-го уровня`);
        return `<button class="shop-referrals-filter-chip" type="button" data-referrals-filter="${escapeHtml(depth)}">${escapeHtml(title)}</button>`;
      }),
    ].join("");
    const rowsHtml = referrals.length
      ? referrals.map((referral) => {
        const depth = Math.max(1, Math.floor(Number(referral?.level_depth || 1)));
        const name = str(referral?.name || "Клиент");
        const levelTitle = str(referral?.level_title || `${depth}-й ур.`);
        const rewardAmount = Number(referral?.reward_amount || 0);
        return `
          <div class="shop-referrals-row" data-referral-level="${escapeHtml(depth)}">
            <div class="shop-referrals-avatar" aria-hidden="true">${buildReferralAvatarHtml(referral)}</div>
            <div class="shop-referrals-row-main">
              <strong>${escapeHtml(name)}</strong>
              <span>${escapeHtml(formatReferralOrdersText(referral?.orders_count))}</span>
            </div>
            <div class="shop-referrals-row-side">
              <span>${escapeHtml(levelTitle)}</span>
              <strong>${formatReferralBonusValue(rewardAmount, true)} ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
            </div>
          </div>
        `;
      }).join("")
      : `<div class="shop-referrals-empty">${escapeHtml(loading ? "Загрузка..." : (error || "Рефералов пока нет"))}</div>`;
    return `
      <div class="shop-referrals-stats-row">
        <div class="shop-referrals-stat-card">
          <div class="shop-referrals-stat-title">Бонусы</div>
          <div class="shop-referrals-stat-line">
            <span>Всего</span>
            <strong>${formatReferralBonusValue(stats.bonuses_total)} ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
          <div class="shop-referrals-stat-line">
            <span>В этом месяце</span>
            <strong>${formatReferralBonusValue(stats.bonuses_month)} ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
        </div>
        <div class="shop-referrals-stat-card">
          <div class="shop-referrals-stat-title">Рефералы</div>
          <div class="shop-referrals-stat-line">
            <span>Всего</span>
            <strong>${moneyFmt.format(Number(stats.referrals_total || 0))}</strong>
          </div>
          <div class="shop-referrals-stat-line">
            <span>В этом месяце</span>
            <strong>${moneyFmt.format(Number(stats.referrals_month || 0))}</strong>
          </div>
        </div>
      </div>
      ${levelBonusBlocksHtml}
      <div class="shop-referrals-invite-card">
        <div class="shop-referrals-link-row">
          <div class="shop-referrals-link-text">${escapeHtml(inviteUrl || "Ссылка появится после загрузки")}</div>
          <button class="shop-referrals-copy-btn" type="button" data-referrals-copy-link aria-label="Скопировать ссылку">
            <i class="fas fa-copy" aria-hidden="true"></i>
          </button>
        </div>
        <button class="shop-referrals-invite-btn" type="button" data-referrals-share-link>Пригласить друга</button>
      </div>
      <div class="shop-referrals-filter-sticky">
        <div class="shop-referrals-filter-chips no-scrollbar" role="tablist" aria-label="Фильтр рефералов">
          ${chips}
        </div>
      </div>
      <div class="shop-referrals-list" aria-label="Список рефералов">
        ${rowsHtml}
      </div>
    `;
  }

  async function getHomeReferralInviteUrl() {
    const token = getCustomerToken();
    if (!token) return "";
    const data = await loadHomeReferralStats();
    return str(data?.invite_url || "");
  }

  async function copyHomeReferralInviteUrl(inviteUrl) {
    const url = str(inviteUrl || "");
    if (!url) return false;
    try {
      await navigator.clipboard.writeText(url);
      if (typeof showToast === "function") showToast("Ссылка скопирована");
      return true;
    } catch {
      return false;
    }
  }

  async function shareHomeReferralInviteUrl(inviteUrl) {
    const url = str(inviteUrl || "");
    if (!url) return false;
    if (navigator.share) {
      try {
        await navigator.share({ title: document.title || "Приглашение", url });
        return true;
      } catch (err) {
        if (String(err?.name || "") === "AbortError") return false;
      }
    }
    return copyHomeReferralInviteUrl(url);
  }

  function bindHomeReferralsSheetActions(wrap, data = null) {
    if (!wrap) return;
    const inviteUrl = str(data?.invite_url || "");
    const copyInviteUrl = async () => {
      await copyHomeReferralInviteUrl(inviteUrl);
    };
    wrap.querySelectorAll("[data-referrals-copy-link]").forEach((button) => {
      button.addEventListener("click", copyInviteUrl);
    });
    wrap.querySelectorAll("[data-referrals-share-link]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!inviteUrl) return;
        await shareHomeReferralInviteUrl(inviteUrl);
      });
    });
    wrap.querySelectorAll("[data-referrals-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        const filter = button.dataset.referralsFilter || "all";
        wrap.querySelectorAll("[data-referrals-filter]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        wrap.querySelectorAll("[data-referral-level]").forEach((row) => {
          row.classList.toggle("hidden", filter !== "all" && row.dataset.referralLevel !== filter);
        });
      });
    });
  }

  function openHomeReferralsSheet() {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet shop-referrals-sheet";
    wrap.innerHTML = `
      <div class="shop-referrals-stats-row">
        <div class="shop-referrals-stat-card">
          <div class="shop-referrals-stat-title">Бонусы</div>
          <div class="shop-referrals-stat-line">
            <span>Всего</span>
            <strong>0 ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
          <div class="shop-referrals-stat-line">
            <span>В этом месяце</span>
            <strong>0 ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
        </div>
        <div class="shop-referrals-stat-card">
          <div class="shop-referrals-stat-title">Рефералы</div>
          <div class="shop-referrals-stat-line">
            <span>Всего</span>
            <strong>0</strong>
          </div>
          <div class="shop-referrals-stat-line">
            <span>В этом месяце</span>
            <strong>0</strong>
          </div>
        </div>
      </div>
      <div class="shop-referrals-invite-card">
        <div class="shop-referrals-link-row">
          <div class="shop-referrals-link-text">https://example.com/ref</div>
          <button class="shop-referrals-copy-btn" type="button" aria-label="Скопировать ссылку">
            <i class="fas fa-copy" aria-hidden="true"></i>
          </button>
        </div>
        <button class="shop-referrals-invite-btn" type="button">Пригласить друга</button>
      </div>
      <div class="shop-referrals-filter-sticky">
        <div class="shop-referrals-filter-chips no-scrollbar" role="tablist" aria-label="Фильтр рефералов">
          <button class="shop-referrals-filter-chip is-active" type="button" data-referrals-filter="all">Все</button>
          <button class="shop-referrals-filter-chip" type="button" data-referrals-filter="1">1-го уровня</button>
          <button class="shop-referrals-filter-chip" type="button" data-referrals-filter="2">2-го уровня</button>
          <button class="shop-referrals-filter-chip" type="button" data-referrals-filter="3">3-го уровня</button>
        </div>
      </div>
      <div class="shop-referrals-list" aria-label="Список рефералов">
        <div class="shop-referrals-row" data-referral-level="1">
          <div class="shop-referrals-avatar" aria-hidden="true">
            <i class="fas fa-user"></i>
          </div>
          <div class="shop-referrals-row-main">
            <strong>Анна</strong>
            <span>0 заказов</span>
          </div>
          <div class="shop-referrals-row-side">
            <span>1-й ур.</span>
            <strong>0 ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
        </div>
        <div class="shop-referrals-row" data-referral-level="1">
          <div class="shop-referrals-avatar" aria-hidden="true">
            <i class="fas fa-user-check"></i>
          </div>
          <div class="shop-referrals-row-main">
            <strong>Иван</strong>
            <span>1 заказ</span>
          </div>
          <div class="shop-referrals-row-side">
            <span>1-й ур.</span>
            <strong>+35 ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
        </div>
        <div class="shop-referrals-row" data-referral-level="2">
          <div class="shop-referrals-avatar" aria-hidden="true">
            <i class="fas fa-users"></i>
          </div>
          <div class="shop-referrals-row-main">
            <strong>Мария</strong>
            <span>2 заказа</span>
          </div>
          <div class="shop-referrals-row-side">
            <span>2-й ур.</span>
            <strong>+12 ${getShopBonusCoinIconHtml('1em', '2px')}</strong>
          </div>
        </div>
      </div>
    `;
    const cachedReferralsData = getCachedHomeReferralStats(0);
    wrap.innerHTML = buildHomeReferralsSheetHtml(cachedReferralsData, !cachedReferralsData);
    bindHomeReferralsSheetActions(wrap, cachedReferralsData);
    loadHomeReferralStats()
      .then((json) => {
        const data = json || {};
        wrap.innerHTML = buildHomeReferralsSheetHtml(data, false);
        bindHomeReferralsSheetActions(wrap, data);
      })
      .catch(() => {
        if (cachedReferralsData) return;
        wrap.innerHTML = buildHomeReferralsSheetHtml(null, false, "Не удалось загрузить рефералов");
        bindHomeReferralsSheetActions(wrap, null);
      });
    sheetNavigationState.type = "referrals";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = null;
    window.AppModal.open({
      title: "Рефералы",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: () => {
        setBonusCardsSheetHeader(false);
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        if (shouldReturnToBonusLevelOnClose(event) && returnTo === "bonus-level") {
          returnToBonusLevelSheet(sourceLevel);
        }
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("referrals-sheet-open");
  }

  function bindHomeReferralCard(root = document) {
    const host = root && typeof root.querySelectorAll === "function" ? root : document;
    host.querySelectorAll("[data-home-referral-share]").forEach((button) => {
      if (button.dataset.homeReferralShareBound === "1") return;
      button.dataset.homeReferralShareBound = "1";
      button.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        let inviteUrl = str(button.dataset.referralInviteUrl || "");
        try {
          if (!inviteUrl) inviteUrl = await getHomeReferralInviteUrl();
        } catch (err) {
          console.error("Failed to load referral invite url:", err);
        }
        if (!inviteUrl) {
          if (typeof showToast === "function") showToast("Не удалось получить ссылку приглашения");
          return;
        }
        await shareHomeReferralInviteUrl(inviteUrl);
      });
    });
    host.querySelectorAll("[data-open-referrals-sheet]").forEach((card) => {
      if (card.dataset.referralsSheetBound === "1") return;
      card.dataset.referralsSheetBound = "1";
      card.addEventListener("click", (event) => {
        if (event.target?.closest?.("[data-home-referral-share]")) return;
        event.preventDefault();
        event.stopPropagation();
        openHomeReferralsSheet();
      });
    });
  }

  window.buildHomeBonusLevelProgressHtml = buildHomeBonusLevelProgressHtml;

  function buildHomeMainSiteMenuRowHtml(config = state.homeBonusConfig) {
    const allowedKeys = new Set(["my-orders", "favorites", "benefits", "addresses", "bought-before", "tasks", "product-rating"]);
    const items = (Array.isArray(config?.site_menu_items) ? config.site_menu_items : [])
      .filter((item) => item && allowedKeys.has(String(item.key || "")) && item.enabled !== false)
      .sort((a, b) => Number(a?.sort_order || 0) - Number(b?.sort_order || 0));
    if (!items.length) return "";
    return `
      <div class="shop-bonus-site-menu-scroll shop-home-site-menu-scroll no-scrollbar" aria-label="\u041f\u0443\u043d\u043a\u0442\u044b \u043c\u0435\u043d\u044e">
        ${items.map((item) => {
          const key = String(item?.key || "").trim();
          const title = String(item?.title || "").trim();
          const iconUrl = String(item?.icon_url || "").trim();
          const iconClass = String(item?.icon_class || "fas fa-circle").trim();
          const benefitsSection = getHomeBonusSiteMenuBenefitsSection(key);
          const benefitsCountKey = benefitsSection || (key === "benefits" ? "benefits" : "");
          return `
            <button class="shop-bonus-site-menu-item" type="button" data-shop-home-site-menu-key="${escapeHtml(key)}"${benefitsCountKey ? ` data-shop-benefits-count-key="${escapeHtml(benefitsCountKey)}"` : ""}>
              <span class="shop-bonus-site-menu-icon" aria-hidden="true">
                ${iconUrl
                  ? `<img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" />`
                  : `<i class="${escapeHtml(iconClass)}"></i>`}
                ${benefitsCountKey ? '<span class="shop-bonus-site-menu-badge hidden" data-shop-benefits-count-badge>0</span>' : ""}
              </span>
              <span class="shop-bonus-site-menu-title">${buildHomeBonusSiteMenuTitleHtml(title)}</span>
            </button>
          `;
        }).join("")}
      </div>
    `;
  }

  function collectHomeActiveOrderPreviewPhotos(items, maxPhotos = 8) {
    const out = [];
    const pushPhoto = (value) => {
      const src = String(value || "").trim();
      if (!src || out.length >= maxPhotos) return;
      out.push(src);
    };
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (out.length >= maxPhotos) return;
      if (String(item?.type || "").trim() === "combo") {
        (Array.isArray(item?.combo_items) ? item.combo_items : []).forEach((comboItem) => {
          (Array.isArray(comboItem?.photos) ? comboItem.photos : []).forEach((photo) => pushPhoto(photo));
          pushPhoto(comboItem?.product_photo || comboItem?.photo || "");
        });
        (Array.isArray(item?.photos) ? item.photos : []).forEach((photo) => pushPhoto(photo));
        return;
      }
      const photos = Array.isArray(item?.photos) ? item.photos : [];
      if (photos.length) pushPhoto(photos[0]);
      else pushPhoto(item?.product_photo || item?.photo || "");
    });
    return out;
  }

  function buildHomeActiveOrderCardHtml(order) {
    return `
      <button class="shop-profile-card shop-home-active-order-card shop-order-summary-card" type="button" data-home-active-order-id="${escapeHtml(String(Number(order?.id || 0) || ""))}">
        ${buildShopOrderSummaryCardInnerHtml(order)}
      </button>
    `;
  }

  function buildCatalogActiveOrderCardHtml(order) {
    return `
      <button class="shop-profile-card shop-home-active-order-card shop-order-summary-card shop-catalog-active-order-card" type="button" data-home-active-order-id="${escapeHtml(String(Number(order?.id || 0) || ""))}">
        ${buildShopOrderSummaryCardInnerHtml(order)}
      </button>
    `;
  }

  function buildShopOrderSummaryCardInnerHtml(order, options = {}) {
    const createdAt = new Date(order?.created_at || "");
    const dateText = Number.isFinite(createdAt.getTime())
      ? createdAt.toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "\u2014";
    const addressText = formatCatalogActiveOrderAddress(order);
    const maxPhotos = Math.max(1, Number(options?.maxPhotos || 8) || 8);
    const previewPhotos = collectHomeActiveOrderPreviewPhotos(order?.items, maxPhotos);
    return `
        <div class="shop-order-summary-card__head">
          <strong>\u0417\u0430\u043a\u0430\u0437 #${escapeHtml(String(order?.id || ""))}</strong>
          <span>${escapeHtml(dateText)}</span>
        </div>
        ${addressText ? `
          <div class="shop-order-summary-card__address">
            <i class="fas fa-location-dot" aria-hidden="true"></i>
            <span>${escapeHtml(addressText)}</span>
          </div>
        ` : ""}
        ${previewPhotos.length ? `
          <div class="shop-profile-order-photos">
            ${previewPhotos.map((src) => `<img class="shop-profile-order-photo" src="${escapeHtml(src)}" alt="" loading="lazy" decoding="async" />`).join("")}
          </div>
        ` : ""}
        <div class="shop-order-summary-card__actions">
          <span class="shop-order-summary-card__pill shop-order-summary-card__status">${escapeHtml(order?.status_title || "\u2014")}</span>
          <span class="shop-order-summary-card__pill shop-order-summary-card__price">${money(order?.total_price || 0)}</span>
        </div>
    `;
  }

  function formatCatalogActiveOrderAddress(order) {
    const street = String(order?.delivery_address_street || order?.address_street || "").trim();
    const house = String(order?.delivery_address_house || order?.address_house || "").trim();
    const apartment = String(order?.delivery_address_apartment || order?.address_apartment || "").trim();
    if (street || house) {
      const line = [street, house].filter(Boolean).join(" ");
      return apartment ? `${line}, \u043a\u0432 ${apartment}` : line;
    }
    const fullAddress = String(order?.address || order?.delivery_address || "").trim();
    if (!fullAddress) return "";
    const parts = fullAddress.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length > 1) return parts.slice(1, 3).join(", ");
    return fullAddress;
  }

  window.buildShopOrderSummaryCardInnerHtml = buildShopOrderSummaryCardInnerHtml;

  function renderHomeActiveOrdersBlock() {
    const host = elHomeBonusCard?.querySelector?.("[data-home-active-orders]");
    if (!host) return;
    const orders = Array.isArray(window._activeOrders) ? window._activeOrders : [];
    if (!orders.length) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `
      <div class="shop-home-active-orders-title">Активные заказы</div>
      <div class="shop-home-active-orders-scroll no-scrollbar">
        ${orders.map((order) => buildHomeActiveOrderCardHtml(order)).join("")}
      </div>
    `;
    host.classList.remove("hidden");
    host.querySelectorAll("[data-home-active-order-id]").forEach((button) => {
      if (button.dataset.homeActiveOrderBound === "1") return;
      button.addEventListener("click", async () => {
        const orderId = Number(button.dataset.homeActiveOrderId || 0);
        if (!(orderId > 0)) return;
        try {
          await ensureShopLateLoaded();
          if (typeof window.openShopActiveOrderDetails === "function") {
            window._activeOrdersSourceScreen = "home";
            await window.openShopActiveOrderDetails(orderId);
            restoreHomeNavAfterHomeSiteMenuOpen();
          }
        } catch (err) {
          console.error("open home active order error:", err);
        }
      });
      button.dataset.homeActiveOrderBound = "1";
    });
  }

  function renderCatalogPromoBlock() {
    const host = elCatalogPromoBlock;
    if (!host) return;
    const orders = Array.isArray(window._activeOrders) ? window._activeOrders : [];
    if (!orders.length) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }
    host.innerHTML = `
      <div class="shop-catalog-promo-block__scroll no-scrollbar">
        ${orders.map((order) => buildCatalogActiveOrderCardHtml(order)).join("")}
      </div>
    `;
    host.classList.remove("hidden");
    host.querySelectorAll("[data-home-active-order-id]").forEach((button) => {
      if (button.dataset.catalogActiveOrderBound === "1") return;
      button.addEventListener("click", async () => {
        const orderId = Number(button.dataset.homeActiveOrderId || 0);
        if (!(orderId > 0)) return;
        try {
          await ensureShopLateLoaded();
          if (typeof window.openShopActiveOrderDetails === "function") {
            window._activeOrdersSourceScreen = "catalog";
            await window.openShopActiveOrderDetails(orderId);
            if (typeof setActiveNav === "function") setActiveNav("menu");
          }
        } catch (err) {
          console.error("open catalog active order error:", err);
        }
      });
      button.dataset.catalogActiveOrderBound = "1";
    });
  }

  function applyHomeBonusSiteMenuBadges(wrap, counts = null) {
    if (!wrap || !wrap.querySelectorAll) return;
    const safeCounts = counts && typeof counts === "object" ? counts : {};
    wrap.querySelectorAll("[data-shop-benefits-count-key]").forEach((button) => {
      const badge = button.querySelector("[data-shop-benefits-count-badge]");
      if (!badge) return;
      const key = String(button.dataset.shopBenefitsCountKey || "").trim();
      const count = Math.max(0, Number(safeCounts[key] || 0));
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.toggle("hidden", count <= 0);
    });
  }

  async function updateHomeBonusSiteMenuBadges(wrap) {
    if (!wrap || !wrap.querySelector("[data-shop-benefits-count-badge]")) return;
    try {
      await ensureShopLateLoaded();
      if (typeof window.getShopBenefitsSectionCounts !== "function") return;
      const counts = await window.getShopBenefitsSectionCounts();
      applyHomeBonusSiteMenuBadges(wrap, counts);
    } catch (err) {
      console.error("update shop bonus menu badges error:", err);
      applyHomeBonusSiteMenuBadges(wrap, null);
    }
  }

  async function openHomeBonusSiteMenuBenefits(section = "", sourceLevel = null) {
    try {
      await ensureShopLateLoaded();
      if (typeof window.openShopBenefitsSheet === "function") {
        await window.openShopBenefitsSheet({
          sourceScreen: "bonus-level",
          section: String(section || "").trim(),
          returnContext: {
            levelId: Number(sourceLevel?.id || 0) || null,
          },
        });
      }
    } catch (err) {
      console.error("open shop benefits from bonus menu error:", err);
      showToast("Не удалось открыть выгоды");
    }
  }

  function bindHomeBonusSiteMenuRow(wrap, sourceLevel = null) {
    if (!wrap || !wrap.querySelectorAll) return;
    wrap.querySelectorAll("[data-open-shop-benefits-section]").forEach((button) => {
      if (button.dataset.shopBenefitsBound === "1") return;
      button.addEventListener("click", () => {
        void openHomeBonusSiteMenuBenefits(button.dataset.openShopBenefitsSection || "", sourceLevel);
      });
      button.dataset.shopBenefitsBound = "1";
    });
  }

  function restoreHomeNavAfterHomeSiteMenuOpen() {
    if (typeof setActiveNav !== "function") return;
    setActiveNav("home");
    requestAnimationFrame(() => {
      if (typeof setActiveNav === "function") setActiveNav("home");
    });
    setTimeout(() => {
      if (typeof setActiveNav === "function") setActiveNav("home");
    }, 120);
  }

  async function openHomeMainSiteMenuItem(key) {
    const normalizedKey = String(key || "").trim();
    try {
      await ensureShopLateLoaded();
      if (normalizedKey === "my-orders" && typeof window.openProfileOrdersSheet === "function") {
        await window.openProfileOrdersSheet({ sourceScreen: "home" });
        restoreHomeNavAfterHomeSiteMenuOpen();
        return;
      }
      if (normalizedKey === "favorites" && typeof openFavoritesSheet === "function") {
        openFavoritesSheet({ force: true, forceOpen: true, sourceScreen: "home-site-menu" });
        restoreHomeNavAfterHomeSiteMenuOpen();
        return;
      }
      if (normalizedKey === "addresses" && typeof openCartSheet === "function") {
        openCartSheet();
        if (openCartSheetCtx && typeof openCartSheetCtx === "object") {
          openCartSheetCtx.sourceScreen = "home";
          openCartSheetCtx.benefitsSourceScreen = "";
          if (typeof openCartSheetCtx.showSheetAddressList === "function") {
            openCartSheetCtx.showSheetAddressList("header");
          }
        }
        restoreHomeNavAfterHomeSiteMenuOpen();
        return;
      }
      if ((normalizedKey === "benefits" || normalizedKey === "tasks") && typeof window.openShopBenefitsSheet === "function") {
        await window.openShopBenefitsSheet({
          sourceScreen: "home-site-menu",
          section: normalizedKey === "tasks" ? "progress" : "",
        });
        restoreHomeNavAfterHomeSiteMenuOpen();
      }
    } catch (err) {
      console.error("open home site menu item error:", err);
    }
  }

  function bindHomeMainSiteMenuRow(wrap) {
    if (!wrap || !wrap.querySelectorAll) return;
    wrap.querySelectorAll("[data-shop-home-site-menu-key]").forEach((button) => {
      if (button.dataset.homeSiteMenuBound === "1") return;
      button.addEventListener("click", () => {
        void openHomeMainSiteMenuItem(button.dataset.shopHomeSiteMenuKey || "");
      });
      button.dataset.homeSiteMenuBound = "1";
    });
  }

  function isHomeBonusFavoriteCategoriesEnabled(level) {
    return level?.favorite_categories_enabled === true
      && Number(level?.favorite_category_group_id || 0) > 0
      && Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0))) > 0
      && Math.max(0, Number(level?.favorite_categories_bonus_percent || 0)) > 0
      && Math.max(0, Math.floor(Number(level?.favorite_categories_count || 0))) > 0;
  }

  function buildHomeBonusFavoriteCategoriesSlotHtml(level) {
    const levelId = Number(level?.id || 0);
    const cache = getHomeBonusFavoriteCategoriesCache(levelId);
    const selectedIds = Array.isArray(cache?.selected_ids) ? cache.selected_ids.map((id) => Number(id || 0)) : [];
    const categories = Array.isArray(cache?.categories) ? cache.categories : [];
    const selected = selectedIds
      .map((id) => categories.find((item) => Number(item?.id || 0) === id))
      .filter(Boolean);
    if (selected.length) {
      const visible = selected.slice(0, 3);
      const hiddenCount = Math.max(0, selected.length - visible.length);
      return `
        <button class="shop-bonus-level-category-icons" type="button" data-open-bonus-favorite-categories>
          ${visible.map(buildBonusCategoryIconHtml).join("")}
          ${hiddenCount > 0 ? `<span class="shop-bonus-category-more">+${escapeHtml(String(hiddenCount))}</span>` : ""}
        </button>
      `;
    }
    return '<button class="shop-bonus-level-metric-action" type="button" data-open-bonus-favorite-categories>Выбрать</button>';
  }

  function updateHomeBonusFavoriteCategoriesSlot(wrap, level) {
    const slot = wrap?.querySelector("[data-bonus-favorite-categories-slot]");
    if (!slot) return;
    slot.innerHTML = buildHomeBonusFavoriteCategoriesSlotHtml(level);
    slot.querySelector("[data-open-bonus-favorite-categories]")?.addEventListener("click", () => {
      void openHomeBonusFavoriteCategoriesSheet(level);
    });
  }

  function bindBonusLevelPreviewCardActions(root, level, options = {}) {
    if (!root || !level) return;
    const bindAction = (selector, handler) => {
      root.querySelectorAll(selector).forEach((node) => {
        if (node.dataset.bonusPreviewActionBound === "1") return;
        node.dataset.bonusPreviewActionBound = "1";
        node.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          handler();
        });
        node.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          handler();
        });
      });
    };
    bindAction("[data-open-bonus-preview-cashback]", () => {
      openHomeBonusCashbackSheet(level, options);
    });
    if (isHomeBonusFavoriteCategoriesEnabled(level)) {
      bindAction("[data-open-bonus-preview-favorite-categories]", () => {
        void openHomeBonusFavoriteCategoriesSheet(level, options);
      });
    }
  }

  function bindBonusCardsPreviewActions(wrap, levels, options = {}) {
    if (!wrap || !Array.isArray(levels)) return;
    Array.from(wrap.querySelectorAll(".shop-bonus-cards-carousel__slide")).forEach((slide, index) => {
      bindBonusLevelPreviewCardActions(slide, levels[index], options);
    });
  }

  async function openHomeBonusFavoriteCategoriesSheet(level, options = {}) {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const levelId = Number(level?.id || 0);
    if (!(levelId > 0)) return;
    if (!isHomeBonusFavoriteCategoriesEnabled(level)) return;
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet shop-bonus-favorite-categories-sheet";
    const renderLoading = () => {
      wrap.innerHTML = '<div class="shop-bonus-sheet-empty">Загружаем...</div>';
    };
    const render = (data) => {
      const categories = Array.isArray(data?.categories) ? data.categories : [];
      const limit = Math.max(0, Math.floor(Number(data?.limit || level?.favorite_categories_limit || 0)));
      const selectedIds = new Set((Array.isArray(data?.selected_ids) ? data.selected_ids : []).map((id) => Number(id || 0)).filter((id) => id > 0));
      const locked = data?.locked === true || (limit > 0 && selectedIds.size >= limit);
      const remaining = Math.max(0, limit - selectedIds.size);
      wrap.innerHTML = `
        <div class="shop-bonus-favorite-categories-note">${locked ? "Выбранные категории" : `Можно выбрать: ${escapeHtml(String(remaining || limit))}`}</div>
        <div class="shop-bonus-favorite-categories-list">
          ${categories.length ? categories.map((category) => {
            const categoryId = Number(category?.id || 0);
            const checked = selectedIds.has(categoryId);
            const bonusPercent = Math.max(0, Number(category?.bonus_percent || category?.bonusPercent || 0));
            return `
              <button class="shop-bonus-favorite-category${checked ? " is-selected" : ""}${checked || locked ? " is-locked" : ""}" type="button" data-bonus-favorite-category-id="${escapeHtml(String(categoryId))}" ${checked || locked ? "disabled" : ""}>
                ${buildBonusCategoryIconHtml(category)}
                <span class="shop-bonus-favorite-category-title">${escapeHtml(category?.title || "")}</span>
                ${bonusPercent > 0 ? `<span class="shop-bonus-favorite-category-percent">+${escapeHtml(formatShopBonusPercent(bonusPercent, 0))}</span>` : ""}
              </button>
            `;
          }).join("") : '<div class="shop-bonus-sheet-empty">Категории не настроены</div>'}
        </div>
        ${locked || !categories.length || !(limit > 0) ? "" : `<button class="shop-bonus-favorite-categories-save" type="button" data-save-bonus-favorite-categories>${getCustomerToken() ? "Сохранить" : "Войти и выбрать"}</button>`}
      `;
      if (locked || !categories.length || !(limit > 0)) return;
      const picked = new Set(selectedIds);
      const syncPicked = () => {
        wrap.querySelectorAll("[data-bonus-favorite-category-id]").forEach((btn) => {
          const categoryId = Number(btn.dataset.bonusFavoriteCategoryId || 0);
          btn.classList.toggle("is-selected", picked.has(categoryId));
        });
        const saveBtn = wrap.querySelector("[data-save-bonus-favorite-categories]");
        if (saveBtn) saveBtn.disabled = picked.size <= selectedIds.size || picked.size > limit;
      };
      wrap.querySelectorAll("[data-bonus-favorite-category-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const categoryId = Number(btn.dataset.bonusFavoriteCategoryId || 0);
          if (!(categoryId > 0)) return;
          if (selectedIds.has(categoryId)) return;
          if (picked.has(categoryId)) picked.delete(categoryId);
          else if (picked.size < limit) picked.add(categoryId);
          syncPicked();
        });
      });
      wrap.querySelector("[data-save-bonus-favorite-categories]")?.addEventListener("click", async () => {
        if (!getCustomerToken()) {
          if (typeof openProfileSheet === "function") {
            openProfileSheet({
              onLoginSuccess: () => {
                void openHomeBonusFavoriteCategoriesSheet(level, options);
              },
            });
          }
          return;
        }
        try {
          const json = await apiJson("/api/public/bonus/favorite-categories", {
            method: "POST",
            body: { level_id: levelId, category_ids: Array.from(picked) },
          });
          const nextData = {
            ...data,
            selected_ids: Array.isArray(json?.data?.selected_ids) ? json.data.selected_ids : Array.from(picked),
            locked: json?.data?.locked === true,
          };
          state.homeBonusFavoriteCategoriesByLevel.set(getHomeBonusFavoriteCategoriesCacheKey(levelId), nextData);
          returnFromBonusNestedSheet(level, options);
        } catch (err) {
          console.error("save bonus favorite categories error:", err);
        }
      });
      syncPicked();
    };
    renderLoading();
    sheetNavigationState.type = "bonus-favorite-categories";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = { levelId };
    window.AppModal.open({
      title: "Выбрать категории",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: (event) => {
        setBonusCardsSheetHeader(false);
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        maybeReturnFromBonusNestedSheet(event, level, options);
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("bonus-favorite-categories-sheet-open");
    try {
      const data = await loadHomeBonusFavoriteCategories(level, { force: true });
      render(data || {});
    } catch (err) {
      console.error("load bonus favorite categories error:", err);
      wrap.innerHTML = '<div class="shop-bonus-sheet-empty">Не удалось загрузить категории</div>';
    }
  }

  function openHomeBonusCashbackSheet(level, options = {}) {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet shop-bonus-cashback-sheet";
    const coinName = state.homeBonusConfig?.settings?.bonus_coin_name || "Бонусы";
    
    const favoriteBonus = Math.max(0, Number(level?.favorite_categories_max_bonus_percent || level?.favorite_categories_bonus_percent || 0));
    const favoriteLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const favoriteText = favoriteBonus > 0 || favoriteLimit > 0
      ? `${favoriteLimit} кат. / +${formatShopBonusFavoriteCategoriesRange(level)}`
      : "Не настроено";

    wrap.innerHTML = `
      <div class="shop-bonus-level-sheet" style="padding: 5px 15px;">
        <div class="shop-bonus-level-metric-card" style="width: 100%; margin-bottom: 12px;">
          <div class="shop-bonus-level-metric-label">Кэшбек, %</div>
          <div class="shop-bonus-level-metric-value"><span>${escapeHtml(formatShopBonusPercent(level?.cashback_percent, 0))}</span></div>
        </div>
        
        <div class="shop-bonus-level-metric-card" style="width: 100%; margin-bottom: 12px;">
          <div class="shop-bonus-level-metric-label">Списание, %</div>
          <div class="shop-bonus-level-metric-value"><span>${escapeHtml(formatShopBonusPercent(level?.redeem_percent, 0))}</span></div>
        </div>

        <div class="shop-bonus-level-metric-card" style="width: 100%; margin-bottom: 12px;">
          <div class="shop-bonus-level-metric-label">Доп % за рефералов</div>
          <div class="shop-bonus-level-metric-value"><span>+${escapeHtml(formatShopBonusPercent(level?.referral_bonus_percent, 0))}</span></div>
        </div>

        <div class="shop-bonus-level-metric-card" style="width: 100%; margin-bottom: 12px;">
          <div class="shop-bonus-level-metric-label">Любимые категории</div>
          <div class="shop-bonus-level-metric-value"><span>${escapeHtml(favoriteText)}</span></div>
        </div>

        <div class="shop-bonus-level-metric-card" style="width: 100%; margin-bottom: 12px; min-height: 80px;">
          <div class="shop-bonus-level-metric-label">${escapeHtml(coinName)} за сумму заказа</div>
          <div class="shop-bonus-level-metric-value" style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
             <span style="font-size: 0.85em; text-align: left; padding-right: 10px;">${getShopBonusRangeSummary(level)}</span>
             ${getShopBonusRanges(level).length > 0 ? '<button type="button" class="shop-bonus-range-info-btn" data-bonus-ranges-info-btn style="background: #f0f0f0; border: none; border-radius: 50%; width: 28px; height: 28px; color: #666; flex-shrink: 0; display: flex; align-items: center; justify-content: center; padding: 0;"><i class="fas fa-info" style="font-size: 12px;"></i></button>' : ""}
          </div>
        </div>
      </div>
    `;

    // Логика поповера рядом с кнопкой "i"
    wrap.querySelector("[data-bonus-ranges-info-btn]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      
      // Если поповер уже открыт, закрываем его
      const existing = document.querySelector(".shop-bonus-active-popover");
      if (existing) {
        existing.remove();
        if (existing._sourceBtn === btn) return; // Если кликнули по той же кнопке, просто закрыли
      }

      const rows = getShopBonusRangeDetails(level);
      
      const popover = document.createElement("div");
      popover.className = "shop-bonus-active-popover";
      popover._sourceBtn = btn;
      popover.style = "position: fixed; background: #fff; border-radius: 12px; padding: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.15); z-index: 100000; font-size: 13px; line-height: 1.5; border: 1px solid #eee; max-width: 260px; pointer-events: auto;";
      popover.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #111;">Пороги начисления:</div>
        ${rows.map((row) => `<div style="margin-bottom: 4px; color: #444;">${escapeHtml(row)}</div>`).join("")}
      `;
      
      // Запрещаем кликам внутри поповера закрывать его
      popover.addEventListener("click", (ev) => ev.stopPropagation());
      
      document.body.appendChild(popover);
      
      const rect = btn.getBoundingClientRect();
      const popRect = popover.getBoundingClientRect();
      
      let top = rect.top - popRect.height - 8;
      if (top < 10) top = rect.bottom + 8;
      
      let left = rect.right - popRect.width;
      if (left < 10) left = 10;
      
      popover.style.top = `${top}px`;
      popover.style.left = `${left}px`;
      
      const close = () => {
        popover.remove();
        document.removeEventListener("click", close);
      };
      setTimeout(() => document.addEventListener("click", close), 0);
    });

    sheetNavigationState.type = "bonus-cashback";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = { levelId: Number(level?.id || 0) || null };
    window.AppModal.open({
      title: "Кэшбек",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: (event) => {
        setBonusCardsSheetHeader(false);
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
        maybeReturnFromBonusNestedSheet(event, level, options);
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("bonus-cashback-sheet-open");
  }

  function openHomeBonusLevelSheet(level) {
    if (!window.AppModal || typeof window.AppModal.open !== "function") return;
    const title = String(level?.title || "Уровень").trim() || "Уровень";
    const favoriteLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const favoriteBonusText = formatShopBonusFavoriteCategoriesRange(level);
    const favoriteCategoriesText = `${favoriteLimit} категорий · ${favoriteBonusText}`;
    const favoriteCategoriesEnabled = isHomeBonusFavoriteCategoriesEnabled(level);
    const wrap = document.createElement("div");
    wrap.className = "shop-cart-sheet shop-bonus-cards-sheet shop-bonus-level-sheet";
    const coinName = state.homeBonusConfig?.settings?.bonus_coin_name || "Бонусы";
    wrap.innerHTML = `
      ${buildHomeBonusLevelProgressHtml(level)}
      <div class="shop-bonus-level-balance-card">
        <div class="shop-bonus-level-balance-main">
          <div class="shop-bonus-level-balance-label">${escapeHtml(coinName)}</div>
          <div class="shop-bonus-level-balance-value">${formatShopBonusMoney(getBonusLevelPreviewBalance(level))}</div>
        </div>
        <button class="shop-bonus-level-accruals-link" type="button">Начисления &gt;</button>
      </div>
    `;
    wrap.insertAdjacentHTML("beforeend", `
      <div class="shop-bonus-level-metric-row${favoriteCategoriesEnabled ? "" : " shop-bonus-level-metric-row--single"}">
        <div class="shop-bonus-level-metric-card" data-open-bonus-cashback style="cursor:pointer;">
          <div class="shop-bonus-level-metric-label">Кэшбек</div>
          <div class="shop-bonus-level-metric-value">
            <i class="fas fa-undo-alt" aria-hidden="true"></i>
            <span>${escapeHtml(formatShopBonusPercent(level?.cashback_percent, 0))}</span>
          </div>
        </div>
        ${favoriteCategoriesEnabled ? `<div class="shop-bonus-level-metric-card">
          <div class="shop-bonus-level-metric-label">${escapeHtml(favoriteCategoriesText)}</div>
          <div data-bonus-favorite-categories-slot>
            ${buildHomeBonusFavoriteCategoriesSlotHtml(level)}
          </div>
        </div>` : ""}
      </div>
      ${buildHomeBonusSiteMenuRowHtml()}
    `);
    sheetNavigationState.type = "bonus-level";
    sheetNavigationState.screen = "main";
    sheetNavigationState.data = { levelId: Number(level?.id || 0) || null };
    window.AppModal.open({
      title: state.homeBonusConfig?.settings?.bonus_program_name || "Бонусная программа",
      content: wrap,
      showCancel: false,
      showSave: false,
      onClose: () => {
        setBonusCardsSheetHeader(false);
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove(
            "shop-cart-sheet-body",
            "shop-cart-sheet-screen-benefits",
            "shop-bonus-cards-sheet-body"
          );
        }
        sheetNavigationState.type = null;
        sheetNavigationState.screen = null;
        sheetNavigationState.data = null;
      },
    });
    if (window.AppModal?.body) {
      window.AppModal.body.classList.add(
        "shop-cart-sheet-body",
        "shop-cart-sheet-screen-benefits",
        "shop-bonus-cards-sheet-body"
      );
    }
    setBonusCardsSheetHeader(true);
    syncMobileUiState("bonus-level-sheet-open");
    wrap.querySelector("[data-open-bonus-cards-current]")?.addEventListener("click", () => {
      const accountLevelId = Number(state.homeBonusConfig?.account?.level_id || 0);
      openHomeBonusCardsSheet({
        initialLevelId: accountLevelId || Number(level?.id || 0) || 0,
        returnTo: "bonus-level",
        sourceLevel: level,
      });
    });
    wrap.querySelector(".shop-bonus-level-accruals-link")?.addEventListener("click", () => {
      void openHomeBonusAccrualsSheet({ sourceLevel: level });
    });
    wrap.querySelector("[data-open-bonus-cashback]")?.addEventListener("click", () => {
      openHomeBonusCashbackSheet(level);
    });
    bindHomeBonusSiteMenuRow(wrap, level);
    void updateHomeBonusSiteMenuBadges(wrap);
    if (favoriteCategoriesEnabled) {
      updateHomeBonusFavoriteCategoriesSlot(wrap, level);
      void loadHomeBonusFavoriteCategories(level).then(() => {
        updateHomeBonusFavoriteCategoriesSlot(wrap, level);
      }).catch((err) => {
        console.error("load bonus favorite categories error:", err);
      });
    }
  }

  window.returnToShopBonusLevelSheet = function returnToShopBonusLevelSheet(levelId = null) {
    const numericLevelId = Number(levelId || 0);
    const levels = Array.isArray(state.homeBonusConfig?.levels) ? state.homeBonusConfig.levels : [];
    const level = levels.find((item) => Number(item?.id || 0) === numericLevelId)
      || getHomeBonusFirstLevel(state.homeBonusConfig);
    if (level) openHomeBonusLevelSheet(level);
  };

  function bindHomeBonusLevelTitle(level) {
    const titleEl = elHomeBonusCard?.querySelector?.(".bonus-level-preview-title");
    if (!titleEl) return;
    titleEl.setAttribute("role", "button");
    titleEl.setAttribute("tabindex", "0");
    titleEl.addEventListener("click", (event) => {
      event.stopPropagation();
      openHomeBonusLevelSheet(level);
    });
    titleEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openHomeBonusLevelSheet(level);
    });
  }

  function invalidateHomeBonusConfig() {
    state.homeBonusConfig = null;
    state._homeBonusToken = "";
    state._homeBonusLoading = null;
  }

  async function refreshHomeBonusConfigUi(options = {}) {
    invalidateHomeBonusConfig();
    const config = await loadHomeBonusConfig(options);
    const sheet = document.querySelector(".shop-bonus-cards-sheet");
    if (sheet) renderBonusCardsSheetContent(sheet);
    syncMobileUiState("bonus-config-refresh");
    return config;
  }
  window.refreshShopHomeBonusConfigUi = refreshHomeBonusConfigUi;

  async function joinHomeBonusProgram(options = {}) {
    const joinOptions = options && typeof options === "object" ? options : {};
    const token = getCustomerToken();
    if (!token) {
      if (typeof openProfileSheet === "function") {
        const reopenBonusSheet = sheetNavigationState.type === "bonus-cards";
        openProfileSheet({
          onLoginSuccess: () => {
            if (window.AppModal?.isOpen?.() && sheetNavigationState.type === "profile") {
              window.AppModal.close("sheet");
            }
            void joinHomeBonusProgram({ reopenBonusSheet, confirmed: true, showJoinModalAfterSuccess: true });
          },
        });
      }
      return;
    }
    if (!joinOptions.confirmed) {
      const config = await loadHomeBonusConfig({ force: true, skipPendingModal: true });
      const levels = Array.isArray(config?.levels) ? config.levels : [];
      const level = levels.find((item) => String(item?.access_type || "") === "join") || getHomeBonusFirstLevel(config);
      openShopBonusProgramModal({
        modalKey: "join",
        level,
        onConfirm: () => joinHomeBonusProgram({ ...joinOptions, confirmed: true }),
      });
      return;
    }
    if (joinHomeBonusProgram._busy) return;
    joinHomeBonusProgram._busy = true;
    if (elMobileBonusCardsActionBtn) elMobileBonusCardsActionBtn.disabled = true;
    const homeActionBtn = elHomeBonusCard?.querySelector?.(".shop-home-bonus-card__action");
    if (homeActionBtn) homeActionBtn.disabled = true;
    try {
      const joinJson = await apiJson("/api/public/bonus/join", { method: "POST", body: {} });
      await refreshHomeBonusConfigUi();
      if (typeof joinOptions.onSuccess === "function") joinOptions.onSuccess(joinJson);
      const joinedNow = !joinJson?.data?.already_joined;
      if (joinOptions.reopenBonusSheet) {
        openHomeBonusCardsSheet();
      }
      if ((joinedNow || joinOptions.showJoinModalAfterSuccess) && joinOptions.showJoinModalAfterSuccess) {
        openShopBonusProgramModal({
          modalKey: "join",
          level: getHomeBonusFirstLevel(state.homeBonusConfig),
        });
      }
      if (!joinJson?.data?.already_joined && typeof showToast === "function") showToast("Вы присоединились к бонусной программе");
    } catch (err) {
      const msg = String(err?.message || "");
      if (err?.httpStatus === 401 || msg === "UNAUTHORIZED") {
        clearCustomer();
        if (typeof openProfileSheet === "function") {
          const reopenBonusSheet = sheetNavigationState.type === "bonus-cards";
          openProfileSheet({
            onLoginSuccess: () => {
              if (window.AppModal?.isOpen?.() && sheetNavigationState.type === "profile") {
                window.AppModal.close("sheet");
              }
              void joinHomeBonusProgram({ reopenBonusSheet, confirmed: true, showJoinModalAfterSuccess: true });
            },
          });
        }
        return;
      }
      console.error("Failed to join bonus program:", err);
      if (typeof showToast === "function") showToast("Не удалось присоединиться к бонусной программе");
    } finally {
      joinHomeBonusProgram._busy = false;
      if (elMobileBonusCardsActionBtn) elMobileBonusCardsActionBtn.disabled = false;
      if (homeActionBtn) homeActionBtn.disabled = false;
    }
  }

  // -----------------------------
  // Adaptive Image Optimization
  // -----------------------------
  /**
   * ?????????? URL ??? ?????? ???????? ??????????? (??В корзине пусто???? WebP/AVIF)
   * @param {string} imageUrl - ???????? URL ???????????
   * @param {string} format - ??????: 'webp' | 'avif' | 'original'
   * @returns {string}
   */
  function getImageUrlForFormat(imageUrl, format = 'original') {
    if (!imageUrl || imageUrl === '/static/img/placeholder.png') return imageUrl;

    // ??????? URL ?? ???????
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;

    if (format === 'original') return imageUrl;

    // WebP: ??????????? ?????? ???? URL ??? .webp (???? ????? ????).
    // ??? ?????? .jpg/.png ?? ??????????? .webp ? ?????? ??? ???, ????? 404.
    if (format === 'webp') {
      if (imageUrl.endsWith('.webp')) return imageUrl;
      return imageUrl;
    }

    // AVIF ???? ?? ???????????? ? ?????????? ????????
    if (format === 'avif') {
      return imageUrl;
    }

    return imageUrl;
  }

  /**
   * ??????? ???????????????? ??????????? ??? ?????? ????????? (???ka ???????, ??????? ? ?.?.)
   * @param {string} imageUrl - URL ????????? ???????????
   * @param {Object} options - ????????? ???????
   * @param {string} options.type - ??? ?????????????: 'product-grid' | 'product-hero' | 'cart-thumb' | 'thumb' | 'custom'
   * @param {string} options.sizes - ??????? sizes (??? type='custom')
   * @param {string} options.srcset - ????????? srcset (???? ????? ?????????????? ??????????????)
   * @param {boolean} options.usePicture - ???????????? ?? picture ? WebP/AVIF (?? ????????? false)
   * @param {string} options.alt - alt??????
   * @param {string} options.className - CSS??????
   * @param {boolean} options.priority - ??????? ????????? ???????? (hero / ?????? ????????)
   * @returns {HTMLImageElement|HTMLPictureElement}
   */
  function createOptimizedImage(imageUrl, options = {}) {
    const {
      type = 'product-grid',
      sizes: customSizes,
      srcset: customSrcset,
      usePicture = false,
      alt = '',
      className = '',
      priority = false,
    } = options;

    // ????????? sizes ??? ?????? ????? ???????????
    const sizesMap = {
      'product-grid': '(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw',
      'product-hero': '(max-width: 768px) 100vw, 350px',
      'cart-thumb': '92px',
      'thumb': '52px',
      'custom': customSizes || '100vw'
    };

    const finalUrl = imageUrl || '/static/img/placeholder.png';
    const finalSizes = sizesMap[type] || sizesMap['custom'];
    const cacheKey = [
      usePicture ? "1" : "0",
      finalUrl,
      String(customSrcset || ""),
      finalSizes,
      className,
      alt,
      priority ? "1" : "0",
    ].join("|");
    const cachedTemplate = getOptimizedImageTemplate(cacheKey);
    if (cachedTemplate) return cachedTemplate;

    // Picture ? WebP ?????? ????? URL ??? ????? ?? .webp (???? ???? ?? ???????).
    // ??? ?????? .jpg/.png ?????????? ???? img, ????? ?? ??????????? ?????????????? .webp.
    if (usePicture && finalUrl.endsWith('.webp')) {
      const picture = document.createElement('picture');
      const webpSource = document.createElement('source');
      webpSource.type = 'image/webp';
      webpSource.srcset = finalUrl;
      picture.appendChild(webpSource);
      const img = document.createElement('img');
      if (className) img.className = className;
      img.alt = alt;
      img.loading = priority ? 'eager' : 'lazy';
      if (priority && 'fetchPriority' in img) {
        img.fetchPriority = 'high';
      }
      img.src = finalUrl;
      if (customSrcset) img.srcset = customSrcset;
      img.sizes = finalSizes;
      picture.appendChild(img);
      setOptimizedImageTemplate(cacheKey, picture);
      return picture.cloneNode(true);
    }

    // ??????? img ??????? ? ??????????? ??????????
    const img = document.createElement('img');
    if (className) img.className = className;
    img.alt = alt;
    img.loading = priority ? 'eager' : 'lazy';
    if (priority && 'fetchPriority' in img) {
      img.fetchPriority = 'high';
    }

    if (customSrcset) {
      img.srcset = customSrcset;
      img.sizes = finalSizes;
      // src ???????????? ??? fallback ??? ?????? ?????????
      img.src = finalUrl;
    } else {
      // ???? ?????????? ???? URL, ?? ? ?????????? sizes ??В корзине пусто??????
      img.src = finalUrl;
      img.sizes = finalSizes;
    }

    setOptimizedImageTemplate(cacheKey, img);
    return img.cloneNode(true);
  }

  const optimizedImageTemplateCache = new Map();
  const OPTIMIZED_IMAGE_TEMPLATE_LIMIT = 300;

  function getOptimizedImageTemplate(key) {
    const cacheKey = String(key || "");
    if (!cacheKey || !optimizedImageTemplateCache.has(cacheKey)) return null;
    const node = optimizedImageTemplateCache.get(cacheKey);
    optimizedImageTemplateCache.delete(cacheKey);
    optimizedImageTemplateCache.set(cacheKey, node);
    return node.cloneNode(true);
  }

  function setOptimizedImageTemplate(key, node) {
    const cacheKey = String(key || "");
    if (!cacheKey || !node || !node.cloneNode) return;
    if (optimizedImageTemplateCache.has(cacheKey)) {
      optimizedImageTemplateCache.delete(cacheKey);
    }
    optimizedImageTemplateCache.set(cacheKey, node.cloneNode(true));
    while (optimizedImageTemplateCache.size > OPTIMIZED_IMAGE_TEMPLATE_LIMIT) {
      const oldestKey = optimizedImageTemplateCache.keys().next().value;
      if (!oldestKey) break;
      optimizedImageTemplateCache.delete(oldestKey);
    }
  }

  const preloadedImages = new Set();
  function preloadImageOnce(url, opts = {}) {
    if (!url || preloadedImages.has(url)) return;
    preloadedImages.add(url);
    try {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = url;
      if (opts.fetchPriority && 'fetchPriority' in link) {
        link.fetchPriority = opts.fetchPriority;
      }
      document.head.appendChild(link);
    } catch {
      // fallback: warm cache without blocking render
      try {
        const img = new Image();
        img.src = url;
      } catch {}
    }
  }

  function prioritizeAboveFoldCardImages(maxCards = 16, extraPx = 200) {
    try {
      if (!elProductsGrid) return;
      const cards = Array.from(elProductsGrid.querySelectorAll(".sp-card"));
      let taken = 0;
      for (const card of cards) {
        if (taken >= maxCards) break;
        const r = card.getBoundingClientRect();
        if (r.bottom < -extraPx) continue;
        if (r.top > (window.innerHeight || 0) + extraPx) break;
        const imgs = card.querySelectorAll("img.sp-img-lqip, img.sp-img-full");
        imgs.forEach((img) => {
          try { img.loading = "eager"; } catch {}
          try { img.decoding = "async"; } catch {}
          try { if ("fetchPriority" in img) img.fetchPriority = "high"; } catch {}
          const url = img.currentSrc || img.src || img.getAttribute("src");
          preloadImageOnce(url, { fetchPriority: "high" });
        });
        taken += 1;
      }
    } catch {}
  }

  function looksLikeUrl(s) {
    if (!s) return false;
    const v = String(s);
    return (
      v.startsWith("http://") ||
      v.startsWith("https://") ||
      v.startsWith("/static/") ||
      v.startsWith("/uploads/") ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(v)
    );
  }

  function runWhenIdle(fn, timeout = 2500) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout });
      return;
    }
    setTimeout(fn, timeout);
  }

  function safePhotos(p) {
    if (Array.isArray(p?.photos)) return p.photos.filter(Boolean);
    if (typeof p?.photos_json === "string") {
      try {
        const arr = JSON.parse(p.photos_json);
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  function normalizePhone(v) {
    const s = String(v || "").trim();
    const digits = s.replace(/[^\d]/g, "");
    if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
      return "7" + digits.slice(1);
    }
    return digits;
  }

  function formatPhonePlus7(raw) {
    const d = normalizePhone(raw);
    if (!d) return "+7";
    // d = 7XXXXXXXXXX
    if (d.length === 11 && d.startsWith("7")) {
      const p1 = d.slice(1, 4);
      const p2 = d.slice(4, 7);
      const p3 = d.slice(7, 9);
      const p4 = d.slice(9, 11);
      return `+7 (${p1}) ${p2}-${p3}-${p4}`;
    }
    return raw;
  }

  function formatBirthdayDisplay(raw) {
    const v = str(raw || "").trim();
    if (!v) return "?";
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(v)) return v;
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}.${m[2]}.${m[1]}`;
    return v;
  }

  // -----------------------------
  // Customer token/cache
  // -----------------------------
  function getCustomerToken() {
    try { return localStorage.getItem(CUSTOMER_TOKEN_KEY) || ""; } catch { return ""; }
  }
  function dispatchCustomerProfileChanged(reason) {
    if (typeof window === "undefined") return;
    try {
      const detail = {
        reason: String(reason || ""),
        tenantId: Number(tenantId) || 0,
        tokenKey: CUSTOMER_TOKEN_KEY,
        cacheKey: CUSTOMER_CACHE_KEY,
        hasToken: !!getCustomerToken(),
        customer: getCustomerCache(),
      };
      window.dispatchEvent(new CustomEvent("shop:customer-profile-changed", { detail: detail }));
    } catch {}
  }
  function setCustomerToken(t) {
    try {
      if (!t) localStorage.removeItem(CUSTOMER_TOKEN_KEY);
      else localStorage.setItem(CUSTOMER_TOKEN_KEY, String(t));
    } catch {}
    dispatchCustomerProfileChanged("token");
  }
  function setCustomerCache(c) {
    try {
      if (!c) localStorage.removeItem(CUSTOMER_CACHE_KEY);
      else localStorage.setItem(CUSTOMER_CACHE_KEY, JSON.stringify(c));
    } catch {}
    dispatchCustomerProfileChanged("cache");
  }
  function getCustomerCache() {
    try {
      const raw = localStorage.getItem(CUSTOMER_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
  function normalizeReferralCode(value) {
    const code = str(value || "").trim().slice(0, 96);
    return /^[a-zA-Z0-9_-]+$/.test(code) ? code : "";
  }
  function captureReferralCodeFromUrl() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const code = normalizeReferralCode(
        params.get("ref")
        || params.get("referral")
        || params.get("referral_code")
        || params.get("referralCode")
      );
      if (code) localStorage.setItem(REFERRAL_CODE_KEY, code);
    } catch {}
  }
  function getStoredReferralCode() {
    try { return normalizeReferralCode(localStorage.getItem(REFERRAL_CODE_KEY) || ""); } catch { return ""; }
  }
  function clearCustomer(options = {}) {
    const fullReset = !!(options && options.fullReset);
    setCustomerToken("");
    try { localStorage.removeItem("shop_customer_token"); } catch {}
    setCustomerCache(null);
    resetFavoritesCache();
    meBootstrapPromise = null;
    meBootstrapToken = "";
    meBootstrapLoaded = false;
    state.homeBonusConfig = null;
    state._homeBonusToken = "";
    state._homeBonusLoading = null;
    state._homeBonusModalEventId = null;
    state._homeReferralStats = null;
    state._homeReferralStatsToken = "";
    state._homeReferralStatsLoading = null;
    if (state.homeBonusFavoriteCategoriesByLevel instanceof Map) {
      state.homeBonusFavoriteCategoriesByLevel.clear();
    }
    if (state._homeBonusFavoriteCategoriesLoading instanceof Map) {
      state._homeBonusFavoriteCategoriesLoading.clear();
    }
    state.cartBonusRedeemEnabled = false;
    state.cartBonusRedeemAvailableAmount = 0;
    state.addresses = [];
    state.selectedAddress = null;
    state._addressesInitialized = false;
    state.addressEditingId = null;
    state._addressFormResolved = null;
    state._addressFormBackMode = null;
    state._addressListBackMode = null;
    state._addressPendingAddress = null;
    state._addressPendingPickupStoreId = null;
    if (fullReset) {
      clearAddressDraft();
      try { window._activeOrders = []; } catch {}
      try { window._savedActiveOrdersForBack = []; } catch {}
      try { window._activeOrdersSourceScreen = ""; } catch {}
      setSelectedAddress(null);
      renderHomeActiveOrdersBlock();
      renderCatalogPromoBlock();
      renderHomeBonusCard();
      void loadHomeBonusConfig({ force: true, skipPendingModal: true });
      if (typeof window.updateActiveOrdersBadge === "function") {
        window.updateActiveOrdersBadge({ force: true }).catch(() => {});
      }
    }
    dispatchCustomerProfileChanged("clear");
    if (typeof window.invalidateBenefitsStore === "function") {
      window.invalidateBenefitsStore({ orderChanged: true, detailsChanged: true });
    }
    if (typeof window.syncBenefitsBadgesUi === "function") {
      window.syncBenefitsBadgesUi(0);
    }
  }
  captureReferralCodeFromUrl();

  // -----------------------------
  // API
  // -----------------------------
  async function apiJson(url, opts = {}) {
    const token = getCustomerToken();
    const referralCode = getStoredReferralCode();
    const headers = {
      "x-tenant-id": String(tenantId),
      "x-store-id": String(getActiveStoreId()),
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { "x-customer-token": token } : {}),
      ...(referralCode ? { "x-referral-code": referralCode } : {}),
      ...(opts.headers || {}),
    };

    const res = await fetch(url, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });

    const json = await res.json().catch(() => null);
    if (!json || json.ok !== true) {
      const err = json?.error || `API_ERROR (${res.status})`;
      const e = new Error(err);
      e.httpStatus = res.status;
      e.payload = json || null;
      throw e;
    }
    return json;
  }

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    categories: [],
    activeCategoryId: null,
    activeCategoryTitle: "Каталог",
    productsByCategory: new Map(),
    combosByCategory: new Map(),
    productCache: new Map(),
    stockLevels: new Map(),
    cart: loadCart(),
    optionGroupCache: new Map(),
    productOptionsCache: new Map(),
    unitConversions: [],
    autoAdd: {
      groups: [],
      items: [],
      byProductId: new Map(),
      byGroupId: new Map(),
    },
    autoAddDismissed: loadAutoAddDismissed(),
    homeBonusConfig: null,
    _homeBonusToken: "",
    _homeBonusLoading: null,
    _homeBonusModalEventId: null,
    _homeReferralStats: null,
    _homeReferralStatsToken: "",
    _homeReferralStatsLoading: null,
    _homeReferralStatsLoadedAt: 0,
    homeBonusFavoriteCategoriesByLevel: new Map(),
    _homeBonusFavoriteCategoriesLoading: new Map(),
    cartBonusRedeemEnabled: false,
    cartBonusRedeemAvailableAmount: 0,
    cartBonusRedeemChoiceVersion: 0,

    // addresses (cart header chip)
    addresses: [],
    selectedAddress: null,
    _addressesInitialized: false,
    addressEditingId: null,
    _addressFormResolved: null,
    _addressFormBackMode: null,
    _addressListBackMode: null,
    _addressListMode: "delivery",
    _addressPendingAddress: null,
    _addressPendingPickupStoreId: null,
    _selectedPickupCity: null,
  };
  const addressLookupState = {
    open: false,
    items: [],
    activeIndex: -1,
    status: "",
    mode: "idle",
    requestSeq: 0,
    debounceTimer: null,
  };
  let mobileUiState = {
    isMobile: false,
    tab: "menu",
    panel: "menu",
    footerMode: "nav",
    cartViewMode: "cart",
    sheet: {
      open: false,
      type: null,
      screen: null,
    },
    lastReason: "init",
    lastUpdatedAt: Date.now(),
  };
  let mobileUiStateSyncQueued = false;
  let mobileUiStateQueuedReason = "";
  let openCartSheetCtx = null;
  let categoryHeaders = [];
  let isProgrammaticCategoryScroll = false;
  let categoryScrollRaf = null;
  const STOCK_SYNC_INTERVAL_MS = 120000;
  let stockEventsSource = null;
  let stockEventsStoreId = null;
  let stockEventsReconnectTimer = null;
  let stockEventsWaitLoopStarted = false;
  let stockEventsWaitLoopToken = 0;
  let stockEventsWaitSupported = true;
  let stockEventsCursor = 0;
  let stockEventsCursorPrimed = false;
  let stockEventsWaitAbortController = null;
  let stockRefreshDebounceTimer = null;
  let stockRefreshInFlight = false;
  let stockRefreshPending = false;
  let stockSyncIntervalHandle = null;
  let stockSyncWakeupBound = false;
  let autoAddLoadPromise = null;
  let autoAddLoaded = false;
  let upsellLoadPromise = null;
  let upsellLoaded = false;
  let cartEnhancersDataLoadPromise = null;
  let cartEnhancersPreloadPromise = null;
  let cartEnhancersRefreshPromise = null;
  let cartEnhancersLastRefreshSignature = "";
  const upsellDefaultConfigCache = new Map();
  let upsellConfigObserver = null;
  let upsellConfigObserverRoot = null;
  let upsellConfigBatchTimer = null;
  const upsellConfigBatchPendingIds = new Set();
  let cartUiRevision = 1;
  let cartUiRenderedRevision = 0;

  function markCartUiDirty() {
    cartUiRevision += 1;
  }

  function normalizeStockQty(rawQty) {
    if (rawQty === undefined) return undefined;
    if (rawQty === null || rawQty === "") return null;
    const n = Number(rawQty);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 1000) / 1000;
  }

  function toStockBool(rawValue, fallback = undefined) {
    if (rawValue === undefined || rawValue === null || rawValue === "") return fallback;
    if (typeof rawValue === "boolean") return rawValue;
    const n = Number(rawValue);
    if (Number.isFinite(n)) return n !== 0;
    const text = String(rawValue).trim().toLowerCase();
    if (!text) return fallback;
    if (text === "true" || text === "yes" || text === "on") return true;
    if (text === "false" || text === "no" || text === "off") return false;
    return fallback;
  }

  function getStockLevelEntry(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    if (!(state.stockLevels instanceof Map)) state.stockLevels = new Map();
    return state.stockLevels.get(pid) || null;
  }

  function upsertStockLevelRow(rawRow, source = "unknown") {
    if (!rawRow || typeof rawRow !== "object") return false;
    const pid = Number(
      rawRow.productId ||
      rawRow.product_id ||
      rawRow.id ||
      rawRow.product_id_num ||
      0
    );
    if (!Number.isFinite(pid) || pid <= 0) return false;

    const prev = getStockLevelEntry(pid) || {};
    const next = { ...prev, productId: pid };

    let qtyRaw = undefined;
    if (Object.prototype.hasOwnProperty.call(rawRow, "qty")) qtyRaw = rawRow.qty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "availableQty")) qtyRaw = rawRow.availableQty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "available_qty")) qtyRaw = rawRow.available_qty;
    else if (Object.prototype.hasOwnProperty.call(rawRow, "stock_qty")) qtyRaw = rawRow.stock_qty;
    const qty = normalizeStockQty(qtyRaw);
    const hasQty = qty !== undefined;

    if (hasQty) {
      next.qty = qty;
      next.isUnlimited = qty === null;
    }

    const requiredQty = normalizeStockQty(
      rawRow.requiredQty !== undefined ? rawRow.requiredQty : rawRow.required_qty
    );
    if (requiredQty !== undefined) next.requiredQty = requiredQty;

    const remainingQty = normalizeStockQty(
      rawRow.remainingQty !== undefined ? rawRow.remainingQty : rawRow.remaining_qty
    );
    if (remainingQty !== undefined) next.remainingQty = remainingQty;

    const explicitUnlimited = toStockBool(
      rawRow.isUnlimited !== undefined ? rawRow.isUnlimited : rawRow.is_unlimited,
      undefined
    );
    if (explicitUnlimited !== undefined) next.isUnlimited = explicitUnlimited;

    const explicitAvailable = toStockBool(
      rawRow.isAvailable !== undefined ? rawRow.isAvailable : (rawRow.is_available !== undefined ? rawRow.is_available : rawRow.available),
      undefined
    );
    if (hasQty && qty === null) {
      // null stock means unlimited availability regardless of explicit flags
      next.isUnlimited = true;
      next.isAvailable = true;
      next.canFulfill = true;
    } else if (explicitAvailable !== undefined) {
      next.isAvailable = explicitAvailable;
    } else if (hasQty) {
      next.isAvailable = qty > 0;
    }

    const explicitCanFulfill = toStockBool(
      rawRow.canFulfill !== undefined ? rawRow.canFulfill : rawRow.can_fulfill,
      undefined
    );
    if (explicitCanFulfill !== undefined) {
      next.canFulfill = explicitCanFulfill;
    } else if (requiredQty !== undefined && hasQty && qty !== null) {
      next.canFulfill = qty + 1e-9 >= Number(requiredQty || 0);
    } else if (hasQty && qty === null) {
      next.canFulfill = true;
    }

    const productNameRaw =
      rawRow.productName !== undefined ? rawRow.productName : rawRow.product_name;
    if (productNameRaw !== undefined && productNameRaw !== null) {
      next.productName = String(productNameRaw || "").trim();
    }

    next.updatedAt = Date.now();
    next.source = String(source || "unknown");

    const changed =
      prev.qty !== next.qty ||
      prev.requiredQty !== next.requiredQty ||
      prev.remainingQty !== next.remainingQty ||
      prev.isUnlimited !== next.isUnlimited ||
      prev.isAvailable !== next.isAvailable ||
      prev.canFulfill !== next.canFulfill ||
      prev.productName !== next.productName;

    if (!(state.stockLevels instanceof Map)) state.stockLevels = new Map();
    state.stockLevels.set(pid, next);

    const cachedProduct = state.productCache.get(pid);
    if (cachedProduct && hasQty) {
      cachedProduct.stock_qty = qty;
    }

    return changed;
  }

  function mergeStockLevels(rows, source = "unknown") {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return false;
    let changed = false;
    list.forEach((row) => {
      if (upsertStockLevelRow(row, source)) changed = true;
    });
    return changed;
  }

  function extractStockLevelsFromPayload(payload) {
    if (!payload || typeof payload !== "object") return [];
    if (Array.isArray(payload.stock_levels)) return payload.stock_levels;
    if (Array.isArray(payload.stockLevels)) return payload.stockLevels;
    return [];
  }

  function cacheStockFromProductPayload(product, source = "product_payload") {
    const pid = Number(product?.id || product?.product_id || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    const row = { productId: pid };
    if (Object.prototype.hasOwnProperty.call(product || {}, "stock_qty")) {
      row.qty = product.stock_qty;
    }
    if (product?.is_available !== undefined && product?.is_available !== null) {
      row.isAvailable = Number(product.is_available) === 1 || product.is_available === true;
    }
    return upsertStockLevelRow(row, source);
  }

  function extractStockEventProductIds(event) {
    const raw = String(event?.data || "").trim();
    if (!raw) return [];
    try {
      const payload = JSON.parse(raw);
      const ids = Array.isArray(payload?.product_ids) ? payload.product_ids : [];
      return ids
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    } catch {
      return [];
    }
  }

  function closeStockEventsSource() {
    if (stockEventsSource) {
      try { stockEventsSource.close(); } catch {}
    }
    stockEventsSource = null;
    stockEventsStoreId = null;
  }

  function queueStockAvailabilityRefresh(reason = "stock_sync", delayMs = 250) {
    const delay = Math.max(0, Number(delayMs || 0));
    if (stockRefreshDebounceTimer) clearTimeout(stockRefreshDebounceTimer);
    stockRefreshDebounceTimer = setTimeout(() => {
      stockRefreshDebounceTimer = null;
      void refreshAvailabilityAfterStockChange(reason);
    }, delay);
  }

  async function refreshAvailabilityAfterStockChange(reason = "stock_sync") {
    if (stockRefreshInFlight) {
      stockRefreshPending = true;
      return;
    }
    stockRefreshInFlight = true;
    try {
      const openedProductId = Number(openProductCtx?.productId || 0);
      if (Number.isFinite(openedProductId) && openedProductId > 0) {
        try {
          const json = await apiJson(`/api/public/products/${openedProductId}`);
          const product = json?.data || null;
          if (product) {
            if (!Array.isArray(product.photos)) product.photos = safePhotos(product);
            cacheStockFromProductPayload(product, "product_refresh_opened");
            product.is_available = isProductAvailable(product);
            state.productCache.set(openedProductId, product);
          }
        } catch {}

      }

      await warmupCartProducts();
      pruneUnavailableCartItems();
    } catch (e) {
      console.warn("Stock sync refresh failed:", reason, e);
    } finally {
      stockRefreshInFlight = false;
      if (stockRefreshPending) {
        stockRefreshPending = false;
        queueStockAvailabilityRefresh("stock_sync_pending", 100);
      }
    }
  }

  function getStoredTenantSnapshot() {
    try {
      const raw = localStorage.getItem("tenant");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function normalizeTenantChatWidgetEnabled(rawValue) {
    const normalized = String(rawValue == null ? "" : rawValue).trim().toLowerCase();
    return !(
      rawValue === false
      || rawValue === 0
      || normalized === "0"
      || normalized === "false"
    );
  }

  function isStorefrontChatWidgetEnabled() {
    const tenant = getStoredTenantSnapshot();
    if (tenant && typeof tenant === "object" && Object.prototype.hasOwnProperty.call(tenant, "chat_widget_enabled")) {
      return normalizeTenantChatWidgetEnabled(tenant.chat_widget_enabled);
    }
    const button = document.getElementById("shopCompanyChatOpenBtn");
    return !!(button && !button.classList.contains("hidden"));
  }

  function persistStorefrontChatWidgetEnabled(enabled) {
    try {
      const tenant = getStoredTenantSnapshot();
      const nextTenant = tenant && typeof tenant === "object" ? tenant : {};
      nextTenant.chat_widget_enabled = enabled !== false ? 1 : 0;
      localStorage.setItem("tenant", JSON.stringify(nextTenant));
    } catch {}
  }

  function syncStorefrontChatButtonVisibility(enabled) {
    const button = document.getElementById("shopCompanyChatOpenBtn");
    const unreadBadge = document.getElementById("shopCompanyChatUnreadBadge");
    if (!button) return;
    button.classList.toggle("hidden", enabled === false);
    if (enabled === false) {
      button.setAttribute("aria-hidden", "true");
      button.setAttribute("tabindex", "-1");
      button.removeAttribute("data-unread-count");
      if (unreadBadge) {
        unreadBadge.textContent = "";
        unreadBadge.classList.add("hidden");
      }
      return;
    }
    button.removeAttribute("aria-hidden");
    button.removeAttribute("tabindex");
  }

  function broadcastStorefrontChatWidgetChanged(enabled) {
    try {
      window.dispatchEvent(new CustomEvent("shop:tenant-chat-widget-changed", {
        detail: {
          chat_widget_enabled: enabled !== false ? 1 : 0,
          is_enabled: enabled !== false,
        },
      }));
    } catch {}
  }

  let chatWidgetChangeApplySeq = 0;

  async function resolveStorefrontChatWidgetEnabledFromApi(fallbackEnabled) {
    const fallback = fallbackEnabled !== false;
    try {
      const json = await apiJson(`/api/public/tenant/chat-settings?_ts=${Date.now()}`);
      if (!json || json.ok !== true) return fallback;
      const settings = json.settings && typeof json.settings === "object" ? json.settings : {};
      const raw = settings.chat_widget_enabled
        ?? settings.is_enabled
        ?? settings.enabled
        ?? settings.chat_enabled;
      if (raw === undefined) return fallback;
      return normalizeTenantChatWidgetEnabled(raw);
    } catch {
      return fallback;
    }
  }

  async function syncStorefrontChatWidgetStateOnBoot() {
    const cachedEnabled = isStorefrontChatWidgetEnabled();
    syncStorefrontChatButtonVisibility(cachedEnabled);
    if (cachedEnabled) {
      ensureShopChatLoaded().catch(function () {});
    }

    const resolved = await resolveStorefrontChatWidgetEnabledFromApi(cachedEnabled);
    if (resolved === cachedEnabled) return;

    persistStorefrontChatWidgetEnabled(resolved);
    syncStorefrontChatButtonVisibility(resolved);
    if (resolved) {
      ensureShopChatLoaded().catch(function () {});
    }
    broadcastStorefrontChatWidgetChanged(resolved);
  }

  async function applyTenantChatWidgetChangedEvent(evtData) {
    const data = evtData && typeof evtData === "object" ? evtData : {};
    const rawEnabled = data.chat_widget_enabled
      ?? data.is_enabled
      ?? data.enabled;
    if (rawEnabled === undefined) return;
    const seq = ++chatWidgetChangeApplySeq;
    const wasEnabled = isStorefrontChatWidgetEnabled();
    let enabled = normalizeTenantChatWidgetEnabled(rawEnabled);
    if (enabled && !wasEnabled) {
      enabled = await resolveStorefrontChatWidgetEnabledFromApi(false);
    }
    if (seq !== chatWidgetChangeApplySeq) return;
    persistStorefrontChatWidgetEnabled(enabled);
    syncStorefrontChatButtonVisibility(enabled);
    if (enabled) {
      ensureShopChatLoaded().catch(function () {});
    }
    broadcastStorefrontChatWidgetChanged(enabled);
  }

  function ensurePublicStockEventsConnection() {
    const currentStoreId = Number(getActiveStoreId() || 0) || 1;
    stockEventsStoreId = currentStoreId;
    startPublicStockEventsWaitLoop();
  }

  async function waitForPublicStockEventsChange(options = {}) {
    if (!stockEventsWaitSupported) {
      return { changed: false, cursor: Number(stockEventsCursor || 0) || 0 };
    }
    const qs = new URLSearchParams({
      since: String(Number(stockEventsCursor || 0) || 0),
      timeout_ms: "20000",
      bootstrap_cursor: options.bootstrap === true ? "1" : "0",
      _ts: String(Date.now()),
    });
    const controller = new AbortController();
    stockEventsWaitAbortController = controller;
    try {
      const json = await apiJson(`/api/public/changes/wait?${qs.toString()}`, { signal: controller.signal });
      const data = json?.data || {};
      const nextCursor = Number(data.cursor || 0);
      return {
        changed: data.changed === true,
        cursor: Number.isFinite(nextCursor) && nextCursor >= 0 ? nextCursor : Number(stockEventsCursor || 0) || 0,
      };
    } finally {
      if (stockEventsWaitAbortController === controller) {
        stockEventsWaitAbortController = null;
      }
    }
  }

  async function fetchPublicStockEventsSince(sinceCursor) {
    const since = Number(sinceCursor || 0);
    const qs = new URLSearchParams({
      since: String(Number.isFinite(since) && since > 0 ? since : 0),
      _ts: String(Date.now()),
    });
    const json = await apiJson(`/api/public/changes?${qs.toString()}`);
    const events = Array.isArray(json?.data) ? json.data : [];
    return events;
  }

  async function applyStockChangedEvent(evtData) {
    const data = evtData && typeof evtData === "object" ? evtData : {};
    const stockLevels = extractStockLevelsFromPayload(data);
    if (stockLevels.length) {
      mergeStockLevels(stockLevels, "stock_event");
      pruneUnavailableCartItems();
      return;
    }

    const productIds = Array.isArray(data.product_ids)
      ? data.product_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!productIds.length) return;
    await refreshProductsByIds(productIds);
    pruneUnavailableCartItems();
  }

  function shouldWatchPublicChangesLoop() {
    return true;
  }

  function startPublicStockEventsWaitLoop() {
    if (stockEventsWaitLoopStarted) return;
    stockEventsWaitLoopStarted = true;
    stockEventsWaitLoopToken += 1;
    const token = stockEventsWaitLoopToken;

    (async function runWaitLoop() {
      while (stockEventsWaitLoopStarted && token === stockEventsWaitLoopToken) {
        if (!shouldWatchPublicChangesLoop()) {
          stockEventsCursor = 0;
          stockEventsCursorPrimed = false;
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        if (!stockEventsWaitSupported) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }
        try {
          const prevCursor = Number(stockEventsCursor || 0) || 0;
          const waited = await waitForPublicStockEventsChange({ bootstrap: !stockEventsCursorPrimed });
          if (!stockEventsWaitLoopStarted || token !== stockEventsWaitLoopToken) break;
          stockEventsCursorPrimed = true;
          stockEventsCursor = Number(waited.cursor || stockEventsCursor || 0) || 0;
          if (!waited.changed) continue;

          const events = await fetchPublicStockEventsSince(prevCursor);
          for (const evt of events) {
            const eventName = String(evt?.event || "").toLowerCase();
            if (eventName === "stock.changed") {
              await applyStockChangedEvent(evt?.data || {});
              continue;
            }
            if (eventName === "tenant.chat_widget.changed") {
              await applyTenantChatWidgetChangedEvent(evt?.data || {});
            }
          }
        } catch (e) {
          if (e?.name === "AbortError") {
            continue;
          }
          const msg = String(e?.message || "");
          if (e?.httpStatus === 404 || e?.httpStatus === 405 || e?.httpStatus === 410 || msg === "EVENTS_UNAVAILABLE") {
            stockEventsWaitSupported = false;
          }
          if (e?.httpStatus === 401 || msg === "UNAUTHORIZED") {
            stockEventsCursor = 0;
            stockEventsCursorPrimed = false;
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }
          await new Promise((resolve) => setTimeout(resolve, 1200));
        }
      }
    })().catch(() => {});
  }

  function bindStockSyncWakeupHandlers() {
    if (stockSyncWakeupBound) return;
    stockSyncWakeupBound = true;

    const wakeup = () => {
      ensurePublicStockEventsConnection();
      queueStockAvailabilityRefresh("stock_sync_wakeup", 200);
    };

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wakeup();
    });
    window.addEventListener("focus", wakeup, { passive: true });
    window.addEventListener("beforeunload", () => {
      closeStockEventsSource();
      if (stockEventsReconnectTimer) {
        clearTimeout(stockEventsReconnectTimer);
        stockEventsReconnectTimer = null;
      }
    });
    document.addEventListener("tenantStoreChanged", () => {
      stockEventsCursor = 0;
      stockEventsCursorPrimed = false;
      stockEventsWaitSupported = true;
    });
  }

  function startStockSync() {
    ensurePublicStockEventsConnection();
    bindStockSyncWakeupHandlers();

    if (!stockSyncIntervalHandle) {
      stockSyncIntervalHandle = setInterval(() => {
        ensurePublicStockEventsConnection();
        queueStockAvailabilityRefresh("stock_sync_interval", 0);
      }, STOCK_SYNC_INTERVAL_MS);
    }
  }

  // -----------------------------
  // Categories helpers
  // -----------------------------
  function isAllCategory(cat) {
    return String(cat?.code || "").toLowerCase() === "all";
  }

  function getVisibleCategories() {
    return state.categories.filter((c) => !isAllCategory(c));
  }

  function updateCategoriesActiveUi() {
    $$(".shop-cat-item", elCatsList).forEach((x) => {
      const id = Number(x.getAttribute("data-cat-id"));
      x.classList.toggle("is-active", Number(state.activeCategoryId) === id);
    });

    if (elCatChips) {
      $$(".shop-cat-chip", elCatChips).forEach((x) => {
        const id = Number(x.getAttribute("data-cat-id"));
        x.classList.toggle("is-active", Number(state.activeCategoryId) === id);
      });
    }
  }
  
  function isMobileViewport() {
    return window.matchMedia("(max-width: 768px)").matches;
  }

  function isVisibleNode(el) {
    return !!(el && !el.classList.contains("hidden"));
  }

  function getCurrentMobileTabFromDom() {
    const active = document.querySelector(".shop-nav-btn.is-active");
    if (!active) return null;
    const raw = String(active.getAttribute("data-tab") || "").trim().toLowerCase();
    if (raw === "categories") return "menu";
    if (raw === "home" || raw === "menu" || raw === "benefits" || raw === "cart" || raw === "fav" || raw === "chat" || raw === "profile") {
      return raw;
    }
    return null;
  }

  function resolveMobilePanelSnapshot(sheetOpen, sheetType, sheetScreen, sheetData = null) {
    if (sheetOpen) {
      if (sheetType === "cart") {
        if (sheetScreen === "benefits") return "benefits";
        if (sheetScreen === "benefitDetail") {
          if (String(sheetData?.benefitDetailMode || "").trim() === "gift-claim") return "benefit-gift-claim";
          if (String(sheetData?.benefitDetailMode || "").trim() === "gift-action") return "benefit-gift-claim";
          if (String(sheetData?.benefitDetailMode || "").trim() === "benefit-apply") return "benefit-apply";
          return "sheet";
        }
        if (sheetScreen === "checkout") return "checkout";
        if (sheetScreen === "addressList" || sheetScreen === "pickupList") return "address-list";
        if (sheetScreen === "addressForm") return "address-form";
        if (sheetScreen === "product" || sheetScreen === "combo" || sheetScreen === "comboPicker") return "product";
        return "cart";
      }
      if (sheetType === "categories") return "categories";
      if (sheetType === "bonus-cards") return "bonus-cards";
      if (sheetType === "profile") return sheetScreen === "orderDetails" ? "profile-order-details" : "profile";
      if (sheetType === "favorites") return "favorites";
      if (sheetType === "activeOrders") return sheetScreen === "details" ? "active-orders-details" : "active-orders-list";
      return "sheet";
    }

    let mode = "";
    try {
      mode = String(cartViewMode || "");
    } catch {}

    if (mode === "checkout") return "checkout";
    if (mode === "address") {
      if (isVisibleNode(elAddressFormView)) return "address-form";
      return "address-list";
    }
    if (mode === "product") return "product";
    if (mode === "profile") return "profile";
    if (mode === "favorites") return "favorites";
    if (mode === "cart") return "cart";
    return "menu";
  }

  function resolveMobileFooterModeSnapshot() {
    if (isVisibleNode(elMobileProductActions)) return "product-actions";
    if (isVisibleNode(elMobileAddressActions)) return "address-actions";
    if (isVisibleNode(elMobileAddressConfirm)) return "address-confirm";
    if (isVisibleNode(elMobileOrderDetailsActions)) return "order-details-actions";
    if (isVisibleNode(elActiveOrdersSheetCollapsed)) return "active-orders-collapsed";
    if (isVisibleNode(elMobileCartActions)) {
      if (isVisibleNode(elMobileCartActionsGiftClaim)) return "gift-claim-actions";
      if (isVisibleNode(elMobileBonusCardsActions)) return "bonus-cards-actions";
      if (isVisibleNode(elMobileBenefitsInlineApplyBtn)) return "benefits-nav-actions";
      if (isVisibleNode(elMobileCartActionsBenefits)) return "benefits-actions";
      if (isVisibleNode(elMobileCartActionsCheckout)) return "checkout-actions";
      if (isVisibleNode(elMobileCartActionsCart)) return "cart-actions";
      return "cart-actions";
    }
    return "nav";
  }

  function resolveMobileFooterModeByPanel(panel, opts = {}) {
    const options = opts && typeof opts === "object" ? opts : {};
    const isCartSheetOpen = Boolean(options.sheetOpen) && String(options.sheetType || "") === "cart";
    const panelName = String(panel || "");
    const benefitsSourceScreen = String(options.sheetData?.benefitsSourceScreen || "").trim().toLowerCase();
    if (panelName === "benefit-gift-claim") return isCartSheetOpen ? "gift-claim-actions" : "nav";
    if (panelName === "benefit-apply") return isCartSheetOpen ? "benefit-apply-actions" : "nav";
    if (panelName === "bonus-cards") {
      return Boolean(options.sheetOpen) && String(options.sheetType || "") === "bonus-cards" && !isHomeBonusJoined()
        ? "bonus-cards-actions"
        : "nav";
    }
    if (panelName === "benefits") {
      if (!isCartSheetOpen) return "nav";
      if (benefitsSourceScreen === "nav") return "benefits-nav-actions";
      if (benefitsSourceScreen === "cart-service" || benefitsSourceScreen === "bonus-level") return "nav";
      return "benefits-actions";
    }
    if (panelName === "checkout") return isCartSheetOpen ? "checkout-actions" : "nav";
    if (panelName === "cart") {
      if (!isCartSheetOpen) return "nav";
      const resolvedItems = cartItemsResolved();
      const cartItemsCount = Array.isArray(resolvedItems) ? resolvedItems.length : 0;
      return cartItemsCount > 0 ? "cart-actions" : "nav";
    }
    if (panelName === "address-form") return "address-actions";
    if (panelName === "address-list") return "address-confirm";
    if (panelName === "product") return "product-actions";
    if (panelName === "profile-order-details") return "order-details-actions";
    if (
      panelName === "menu" ||
      panelName === "categories" ||
      panelName === "profile" ||
      panelName === "favorites" ||
      panelName === "active-orders-details" ||
      panelName === "active-orders-list" ||
      panelName === "sheet"
    ) {
      return "nav";
    }
    return null;
  }

  function renderMobileBottomByState(snapshot, reason = "renderMobileBottomByState") {
    const stateSnapshot = snapshot && typeof snapshot === "object" ? snapshot : window.getShopMobileUiState();
    const isMobile = Boolean(stateSnapshot && stateSnapshot.isMobile);
    const panelName = String(stateSnapshot?.panel || "").trim();
    const isBenefitsPanel = panelName === "benefits" || panelName === "benefit-gift-claim" || panelName === "benefit-apply";
    if (!isMobile) {
      document.body.classList.remove("shop-benefits-sheet-open");
      return;
    }

    const normalizeTab = (rawTab) => {
      const t = String(rawTab || "").toLowerCase();
      if (t === "categories") return "menu";
      if (t === "home" || t === "menu" || t === "benefits" || t === "cart" || t === "fav" || t === "chat" || t === "profile") return t;
      return "menu";
    };

    const tab = normalizeTab(stateSnapshot.tab);
    const navMap = {
      home: elNavHome,
      menu: elNavMenu,
      benefits: elNavCategories,
      cart: elNavCart,
      fav: elNavFav,
      chat: elNavChat,
      profile: elNavProfile,
    };

    Object.keys(navMap).forEach((key) => {
      const btn = navMap[key];
      if (!btn) return;
      const active = key === tab;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    document.body.classList.toggle("shop-home-tab-active", tab === "home");

    const modeRaw = String(stateSnapshot.footerMode || "nav");
    const sheetOpen = Boolean(stateSnapshot?.sheet?.open);
    const sheetType = String(stateSnapshot?.sheet?.type || "").trim();
    const benefitsInnerOverlayOpen = document.body.classList.contains("shop-benefits-overlay-open");
    let mode = modeRaw || "nav";
    if ((mode === "cart-actions" || mode === "cart-empty-actions" || mode === "checkout-actions" || mode === "benefits-actions" || mode === "benefits-nav-actions" || mode === "gift-claim-actions" || mode === "benefit-apply-actions") && !(sheetOpen && sheetType === "cart")) {
      mode = "nav";
    }
    if (mode === "bonus-cards-actions" && (!(sheetOpen && sheetType === "bonus-cards") || isHomeBonusJoined())) {
      mode = "nav";
    }
    if (benefitsInnerOverlayOpen && panelName === "benefits") {
      mode = "nav";
    }
    document.body.classList.toggle("shop-benefits-sheet-open", isBenefitsPanel);
    const setVisible = (el, visible) => {
      if (!el) return;
      el.classList.toggle("hidden", !visible);
    };

    const showProductActions = mode === "product-actions";
    const showCartActions = mode === "cart-actions" || mode === "cart-empty-actions" || mode === "checkout-actions" || mode === "benefits-actions" || mode === "benefits-nav-actions" || mode === "gift-claim-actions" || mode === "benefit-apply-actions" || mode === "bonus-cards-actions";
    const showCartActionsCart = mode === "cart-actions";
    const showCartActionsCheckout = mode === "checkout-actions";
    const showCartActionsBenefits = mode === "benefits-actions";
    const showCartActionsBenefitsNav = mode === "benefits-nav-actions";
    const showCartActionsGiftClaim = mode === "gift-claim-actions";
    const showCartActionsBenefitApply = mode === "benefit-apply-actions";
    const showBonusCardsActions = mode === "bonus-cards-actions";
    const showAddressActions = mode === "address-actions";
    const showAddressConfirm = mode === "address-confirm";
    const showOrderDetailsActions = mode === "order-details-actions";
    const showActiveOrdersCollapsed = mode === "active-orders-collapsed";

    setVisible(elMobileProductActions, showProductActions);
    setVisible(elMobileCartActions, showCartActions);
    setVisible(elMobileCartActionsCart, showCartActionsCart);
    setVisible(elMobileCartActionsCheckout, showCartActionsCheckout);
    setVisible(elMobileCartActionsBenefits, showCartActionsBenefits || showCartActionsBenefitApply);
    setVisible(elMobileCartActionsGiftClaim, showCartActionsGiftClaim);
    setVisible(elMobileBonusCardsActions, showBonusCardsActions);
    setVisible(elMobileBenefitsPromoWrap, showCartActionsBenefits || showCartActionsBenefitsNav);
    setVisible(elMobileBenefitsInlineApplyBtn, showCartActionsBenefitsNav);
    setVisible(elMobileAddressActions, showAddressActions);
    setVisible(elMobileAddressConfirm, showAddressConfirm);
    setVisible(elMobileOrderDetailsActions, showOrderDetailsActions);

    if ((showCartActionsBenefits || showCartActionsBenefitsNav) && elMobileDeliveryProgressWrap) {
      elMobileDeliveryProgressWrap.classList.add("hidden");
    }

    if (elActiveOrdersSheetCollapsed) {
      if (showActiveOrdersCollapsed) {
        elActiveOrdersSheetCollapsed.classList.remove("hidden");
      } else if (sheetOpen || mode !== "nav") {
        // Collapsed active-orders bar is only allowed on main nav when no sheet is open.
        elActiveOrdersSheetCollapsed.classList.add("hidden");
      }
    }

    if (mode === "cart-actions" || mode === "checkout-actions") {
      try {
        if (typeof updateMobileDeliveryProgress === "function") updateMobileDeliveryProgress();
      } catch {}
    }

    window.__shopMobileBottomRender = {
      reason: String(reason || "render"),
      mode,
      tab,
      ts: Date.now(),
    };
  }

  function emitMobileUiStateChange() {
    try {
      document.dispatchEvent(new CustomEvent("shop:mobile-ui-state-change", {
        detail: window.getShopMobileUiState(),
      }));
    } catch {}
  }

  function setMobileUiStateSnapshot(nextState, reason = "setMobileUiStateSnapshot", opts = {}) {
    const previous = mobileUiState;
    const next = {
      ...previous,
      ...(nextState || {}),
      sheet: {
        ...(previous.sheet || {}),
        ...((nextState && nextState.sheet) || {}),
      },
      lastReason: String(reason || "state-update"),
      lastUpdatedAt: Date.now(),
    };

    const changed =
      previous.isMobile !== next.isMobile ||
      previous.tab !== next.tab ||
      previous.panel !== next.panel ||
      previous.footerMode !== next.footerMode ||
      previous.cartViewMode !== next.cartViewMode ||
      (previous.sheet?.open !== next.sheet?.open) ||
      (previous.sheet?.type !== next.sheet?.type) ||
      (previous.sheet?.screen !== next.sheet?.screen);

    mobileUiState = next;
    window.__shopMobileUiState = next;
    if (changed && !opts.silent) emitMobileUiStateChange();
    return changed;
  }

  function syncMobileUiState(reason = "syncMobileUiState") {
    const isMobile = isMobileViewport();
    const sheetOpen = !!(window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen());
    const sheetType = String(sheetNavigationState?.type || "").trim() || null;
    const sheetScreen = String(sheetNavigationState?.screen || "").trim() || null;
    const panel = resolveMobilePanelSnapshot(sheetOpen, sheetType, sheetScreen, sheetNavigationState?.data);
    const footerMode = resolveMobileFooterModeByPanel(panel, {
      sheetOpen,
      sheetType,
      sheetScreen,
      sheetData: sheetNavigationState?.data,
    }) || resolveMobileFooterModeSnapshot();
    const currentTab = getCurrentMobileTabFromDom();

    let cartModeSnapshot = "";
    try {
      cartModeSnapshot = String(cartViewMode || "");
    } catch {}

    let tab = currentTab || "menu";
    if (!currentTab) {
      if (panel === "categories") tab = "menu";
      else if (panel === "benefits" || panel === "benefit-gift-claim" || panel === "benefit-apply") tab = "benefits";
      else if (panel === "cart" || panel === "checkout") tab = "cart";
      else if (panel === "profile") tab = "profile";
      else if (panel === "favorites") tab = "fav";
      else tab = "menu";
    }
    if (tab !== "home") document.body.classList.remove("shop-home-tab-active");

    return setMobileUiStateSnapshot(
      {
        isMobile,
        tab,
        panel,
        footerMode,
        cartViewMode: cartModeSnapshot || "cart",
        sheet: {
          open: sheetOpen,
          type: sheetType,
          screen: sheetScreen,
        },
      },
      reason
    );
  }

  function queueMobileUiStateSync(reason = "queueMobileUiStateSync") {
    mobileUiStateQueuedReason = String(reason || mobileUiStateQueuedReason || "queue");
    if (mobileUiStateSyncQueued) return;
    mobileUiStateSyncQueued = true;
    const flush = () => {
      mobileUiStateSyncQueued = false;
      const syncReason = mobileUiStateQueuedReason || "queued-sync";
      mobileUiStateQueuedReason = "";
      syncMobileUiState(syncReason);
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(flush);
      return;
    }
    setTimeout(flush, 0);
  }

  window.getShopMobileUiState = function getShopMobileUiState() {
    const snapshot = mobileUiState || {};
    return {
      ...snapshot,
      sheet: {
        ...(snapshot.sheet || {}),
      },
    };
  };
  window.syncShopMobileUiState = function syncShopMobileUiState(reason) {
    return syncMobileUiState(String(reason || "external-sync"));
  };
  window.queueShopMobileUiStateSync = queueMobileUiStateSync;
  window.renderShopMobileBottomByState = function renderShopMobileBottomByState(reason = "external-render") {
    renderMobileBottomByState(window.getShopMobileUiState(), String(reason || "external-render"));
  };

  if (!window.__shopMobileUiViewportWatcherBound) {
    window.__shopMobileUiViewportWatcherBound = true;
    window.addEventListener("resize", () => queueMobileUiStateSync("viewport-resize"), { passive: true });
    window.addEventListener("orientationchange", () => queueMobileUiStateSync("viewport-orientation"), { passive: true });
  }

  if (!window.__shopMobileUiRenderBound) {
    window.__shopMobileUiRenderBound = true;
    document.addEventListener("shop:mobile-ui-state-change", (event) => {
      const detail = event && event.detail && typeof event.detail === "object"
        ? event.detail
        : window.getShopMobileUiState();
      renderMobileBottomByState(detail, "shop:mobile-ui-state-change");
    });
  }

  // ??????? ???????????? ????????? ????????? ? bottom sheets ??? ????????? ?????? "?????"
  const __sheetNavigationStateRaw = {
    type: null, // 'cart' | 'categories' | 'profile' | 'activeOrders' | 'order' | 'product' | null
    screen: null, // ??????? ????? ?????? sheet
    data: null, // ?????????????? ?????? (????????, cartKey ??? product)
  };
  let sheetNavigationState = new Proxy(__sheetNavigationStateRaw, {
    set(target, prop, value) {
      if (target[prop] === value) return true;
      target[prop] = value;
      queueMobileUiStateSync(`sheetNavigationState.${String(prop)}`);
      return true;
    },
    get(target, prop) {
      return target[prop];
    },
  });

  // ??????? ????????? ?????? "?????" ?? Android
  function handleAndroidBackButton() {
    // ?????????, ?????? ?? bottom sheet ????? AppModal
    if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
      // ???????????? ????????? ?????? bottom sheet ? ??????????? ?? ????
      if (sheetNavigationState.type === 'cart') {
        return handleCartSheetBack();
      } else if (sheetNavigationState.type === 'activeOrders') {
        return handleActiveOrdersSheetBack();
      } else if (sheetNavigationState.type === 'categories' || 
                 sheetNavigationState.type === 'profile' ||
                 sheetNavigationState.type === 'favorites') {
        // ??????? bottom sheets ??? ????????? - ?????? ?????????
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // ????????? ?????? bottom sheets (orders.js, products.js)
    const orderSheet = document.getElementById('orderSheet');
    if (orderSheet && orderSheet.classList.contains('is-open')) {
      // ????????? bottom sheet ?? orders.js
      if (typeof window.closeOrderSheet === 'function') {
        window.closeOrderSheet();
      } else {
        orderSheet.classList.remove('is-open');
        const backdrop = document.getElementById('sheetBackdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('sheet-open');
      }
      return true;
    }
    
    const productSheet = document.getElementById('productSheet');
    if (productSheet && productSheet.classList.contains('is-open')) {
      // ????????? bottom sheet ?? products.js
      if (typeof window.closeProductSheet === 'function') {
        window.closeProductSheet();
      } else {
        productSheet.classList.remove('is-open');
        const backdrop = document.getElementById('productSheetBackdrop');
        if (backdrop) backdrop.classList.remove('is-active');
        document.body.classList.remove('sheet-open');
      }
      return true;
    }
    
    return false; // ?? ??????????, ????В корзине пусто? ????
  }

  // ????????? ?????? "?????" ??? ???????
  function handleCartSheetBack() {
    if (!openCartSheetCtx) {
      closeShopSheetIfOpen();
      return true;
    }

    const showCartSheetScreen = () => {
      if (typeof openCartSheetCtx?.showSheetCart === "function") {
        openCartSheetCtx.showSheetCart();
        return true;
      }
      closeShopSheetIfOpen();
      return false;
    };

    const showCheckoutSheetScreen = () => {
      if (typeof openCartSheetCtx?.showSheetCheckout === "function") {
        openCartSheetCtx.showSheetCheckout();
        return true;
      }
      closeShopSheetIfOpen();
      return false;
    };

    const showAddressListSheetScreen = (backMode) => {
      if (typeof openCartSheetCtx?.showSheetAddressList === "function") {
        openCartSheetCtx.showSheetAddressList(backMode);
        return true;
      }
      closeShopSheetIfOpen();
      return false;
    };

    const showPickupListSheetScreen = () => {
      if (typeof openCartSheetCtx?.showSheetPickupList === "function") {
        openCartSheetCtx.showSheetPickupList();
        return true;
      }
      closeShopSheetIfOpen();
      return false;
    };
    
    const { checkoutEl, benefitsEl, benefitDetailEl, productEl, listEl } = openCartSheetCtx;
    const addressWrap = checkoutEl?.parentElement?.querySelector('.shop-address-content');
    const addressListView = addressWrap?.querySelector('.shop-address-list-view');
    const addressFormView = addressWrap?.querySelector('.shop-address-form-view');
    const pickupWrapEl = checkoutEl?.parentElement?.querySelector('.shop-pickup-content');

    // ????????В корзине пусто
    if (pickupWrapEl && !pickupWrapEl.classList.contains('hidden')) {
      const pickupBackMode = openCartSheetCtx?.addressBackMode || "checkout";
      if (pickupBackMode === "header") {
        closeShopSheetIfOpen();
      } else if (pickupBackMode === "profile") {
        returnToProfileFromSheet();
      } else if (pickupBackMode === "cart") {
        showCartSheetScreen();
      } else {
        showCheckoutSheetScreen();
      }
      return true;
    } else if (benefitDetailEl && !benefitDetailEl.classList.contains('hidden')) {
      const customBackHandler = sheetNavigationState.data?.customBackHandler;
      if (typeof customBackHandler === "function") {
        customBackHandler();
        return true;
      }
      if (typeof openCartSheetCtx?.showSheetBenefits === "function") {
        openCartSheetCtx.showSheetBenefits();
      }
      return true;
    } else if (benefitsEl && !benefitsEl.classList.contains('hidden')) {
      const benefitsBackScreen = String(openCartSheetCtx?.benefitsSourceScreen || "").trim().toLowerCase();
      if (benefitsBackScreen === "nav" || benefitsBackScreen === "home-site-menu") {
        closeShopSheetIfOpen();
        if (benefitsBackScreen === "home-site-menu" && typeof setActiveNav === "function") {
          setActiveNav("home");
        }
      } else if (benefitsBackScreen === "bonus-level") {
        const levelId = Number(openCartSheetCtx?.benefitsReturnContext?.levelId || sheetNavigationState?.data?.returnContext?.levelId || 0);
        if (typeof window.returnToShopBonusLevelSheet === "function") {
          window.returnToShopBonusLevelSheet(levelId);
        } else {
          closeShopSheetIfOpen();
        }
      } else if (benefitsBackScreen === "cart" || benefitsBackScreen === "cart-service") {
        showCartSheetScreen();
      } else {
        showCheckoutSheetScreen();
      }
      return true;
    } else if (productEl && !productEl.classList.contains('hidden')) {
      // ?????: ???? ?????? ????? "????????" ? ??? ????? ? ???????? ????????????? ?????
      if (openCartSheetCtx?.comboStepBack && typeof openCartSheetCtx.comboStepBack === "function") {
        openCartSheetCtx.comboStepBack();
        return true;
      }
      const customBackHandler = sheetNavigationState.data?.customBackHandler;
      if (typeof customBackHandler === "function") {
        if (elMobileProductActions) elMobileProductActions.classList.add("hidden");
        if (typeof window._comboStepBackCallback !== "undefined") {
          window._comboStepBackCallback = null;
        }
        if (openCartSheetCtx && typeof openCartSheetCtx === "object") {
          openCartSheetCtx.comboStepBack = null;
        }
        openCartSheetCtx = null;
        if (window.AppModal?.body) {
          window.AppModal.body.classList.remove("shop-cart-sheet-body");
        }
        customBackHandler();
        return true;
      }
      // ?? ?????? ?????? - ???????????? ? ??????? ??? ????????? sheet
      const cartKey = sheetNavigationState.data?.cartKey;
      if (cartKey) {
        showCartSheetScreen();
        return true;
      } else {
        closeShopSheetIfOpen();
        return true;
      }
    } else if (addressFormView && !addressFormView.classList.contains('hidden')) {
      const addressFormReturnScreen = String(openCartSheetCtx?.addressFormReturnScreen || "").trim().toLowerCase();
      if (addressFormReturnScreen === "profile") {
        returnToProfileFromSheet();
        return true;
      }
      if (addressFormReturnScreen === "header") {
        closeShopSheetIfOpen();
        return true;
      }
      if (addressFormReturnScreen === "checkout") {
        showCheckoutSheetScreen();
        return true;
      }
      if (addressFormReturnScreen === "pickuplist") {
        showPickupListSheetScreen();
        return true;
      }
      if (addressFormReturnScreen === "cart") {
        showCartSheetScreen();
        return true;
      }
      showAddressListSheetScreen(openCartSheetCtx?.addressBackMode || "cart");
      return true;
    } else if (addressListView && !addressListView.classList.contains('hidden')) {
      const backMode = openCartSheetCtx?.addressBackMode || "cart";
      if (backMode === "header") {
        closeShopSheetIfOpen();
      } else if (backMode === "profile") {
        returnToProfileFromSheet();
      } else if (backMode === "checkout") {
        showCheckoutSheetScreen();
      } else {
        showCartSheetScreen();
      }
      return true;
    } else if (checkoutEl && !checkoutEl.classList.contains('hidden')) {
      // ?? ?????????? ?????? - ???????????? ? ???????
      showCartSheetScreen();
      return true;
    } else if (listEl && !listEl.classList.contains('hidden')) {
      // ?? ??????? - ????????? sheet
      closeShopSheetIfOpen();
      return true;
    }
    
    // Fallback - ????????? sheet
    closeShopSheetIfOpen();
    return true;
  }

  function shouldUseCartSheetCloseAsBack() {
    if (!window.AppModal || typeof window.AppModal.isOpen !== "function" || !window.AppModal.isOpen()) {
      return false;
    }
    if (sheetNavigationState.type !== "cart") {
      return false;
    }
    const screen = String(sheetNavigationState.screen || "").trim();
    return (
      screen === "addressList"
      || screen === "addressForm"
      || screen === "pickupList"
      || screen === "benefitDetail"
    );
  }

  const appModalCloseBtn = document.getElementById("appModalCloseBtn");
  if (appModalCloseBtn && !appModalCloseBtn._shopCartNativeBackBound) {
    const nativeCartSheetCloseHandler = (event) => {
      if (!shouldUseCartSheetCloseAsBack()) return;
      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") {
        event.stopImmediatePropagation();
      }
      handleCartSheetBack();
    };
    appModalCloseBtn.addEventListener("click", nativeCartSheetCloseHandler, true);
    appModalCloseBtn._shopCartNativeBackBound = true;
  }

  // ????????? ?????? "?????" ??? ???????? ???????
  function handleActiveOrdersSheetBack() {
    // ???? ?В корзине пусто? - ???????????? ? ??????
    if (sheetNavigationState.screen === 'details') {
      const savedOrders = window._savedActiveOrdersForBack || [];
      if (savedOrders && savedOrders.length > 0) {
        // ??????? ??????? showActiveOrdersList В корзине пусто????
        // ??? ?????????? ?????? ??????? init, ??????? ????? ??????? ?? ????? ?????????
        // ??? ?????????? ?????? ????????? ? ???????, ???? ??? ???????? ?????????
        const activeOrders = window._activeOrders || [];
        if (activeOrders.length > 1 || savedOrders.length > 1) {
          // ???В корзине пусто????, ?????????? ??????
          // ?????????? ?????? ????????? В корзине пусто ??????? ?????????
          // ??? ????? ????? ????? ??????? ? ?????????, ??? ??? ??????????
          // ???????? ?????????? ???????? ???? - ????????В корзине пусто???
          const wrap = document.createElement("div");
          wrap.className = "shop-active-orders-sheet";
          
          const list = document.createElement("div");
          list.className = "shop-active-orders-list";
          
          savedOrders.forEach(order => {
            const card = document.createElement("div");
            card.className = "shop-active-order-card";
            card.style.cursor = "pointer";
            card.style.padding = "16px";
            card.style.borderBottom = "1px solid var(--color-border, #e5e5e5)";
            
            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.justifyContent = "space-between";
            header.style.alignItems = "center";
            header.style.marginBottom = "8px";
            
            const orderNum = document.createElement("div");
            orderNum.style.fontWeight = "600";
            orderNum.textContent = `Заказ #${order.id}`;
            
            const status = document.createElement("div");
            status.style.color = "var(--shop-buy, #f97316)";
            status.style.fontSize = "14px";
            status.textContent = order.status_title || "";
            
            header.appendChild(orderNum);
            header.appendChild(status);
            
            const meta = document.createElement("div");
            meta.style.fontSize = "13px";
            meta.style.color = "var(--color-text-muted, #666)";
            meta.style.marginBottom = "8px";
            meta.textContent = new Date(order.created_at).toLocaleString("ru-RU");
            
            const footer = document.createElement("div");
            footer.style.display = "flex";
            footer.style.justifyContent = "space-between";
            footer.style.alignItems = "center";
            
            const total = document.createElement("div");
            total.style.fontWeight = "600";
            total.textContent = money(order.total_price || 0);
            
            const itemsCount = document.createElement("div");
            itemsCount.style.fontSize = "13px";
            itemsCount.style.color = "var(--color-text-muted, #666)";
            const itemsNum = order.items_count || (order.items && order.items.length) || 0;
            itemsCount.textContent = `${itemsNum} ${itemsNum === 1 ? "позиция" : itemsNum < 5 ? "позиции" : "позиций"}`;
            
            footer.appendChild(total);
            footer.appendChild(itemsCount);
            
            card.appendChild(header);
            card.appendChild(meta);
            card.appendChild(footer);
            
            card.addEventListener("click", async () => {
              await showActiveOrderDetails(order.id);
            });
            
            list.appendChild(card);
          });
          
          wrap.appendChild(list);
          
          window.AppModal.setTitle("Активные заказы");
          window.AppModal.setContent(wrap);
          
          // ??????? ?????? ????? ?? ??????
          const modalHeader = document.querySelector(".app-modal-header");
          if (modalHeader) {
            const backBtn = modalHeader.querySelector(".app-modal-back-btn");
            if (backBtn) {
              backBtn.remove();
            }
          }
          
          // ????????? ????????? ?????????
          sheetNavigationState.screen = 'list';
          return true;
        } else {
          // ???? ????? ????, ????????? sheet
          closeShopSheetIfOpen();
          return true;
        }
      } else {
        // ???? ?????? ????, ????????? sheet
        closeShopSheetIfOpen();
        return true;
      }
    }
    
    // ?? ?????? ??? fallback - ????????? sheet
    closeShopSheetIfOpen();
    return true;
  }
  let openProductCtx = null;
  let cartViewMode = "cart";
  let previousPanelMode = "cart";
  let previousPanelProductId = null;
  queueMobileUiStateSync("cartViewMode.init");

  function normalizeCart(raw) {
    if (Array.isArray(raw)) {
      return raw
        .map((item) => {
          if (item?.type === "combo") {
            const qty = Math.max(0, Number(item?.qty || 0));
            if (qty <= 0) return null;
            return {
              key: item.key || "combo-" + (item.combo_id || "") + "-" + Date.now(),
              type: "combo",
              combo_id: item.combo_id,
              combo_title: item.combo_title || "Комбо",
              qty,
              selections: Array.isArray(item.selections) ? item.selections : [],
              unit_price_before_discount: item.unit_price_before_discount != null ? Number(item.unit_price_before_discount) : null,
            };
          }
          const productId = Number(item?.product_id);
          const qty = Math.max(0, Number(item?.qty || 0));
          const isDormantAutoAdd = Number(item?.auto_add || 0) === 1 && qty <= 0;
          if (!Number.isFinite(productId) || (qty <= 0 && !isDormantAutoAdd)) return null;
          const optionItems = Array.isArray(item?.option_items) ? item.option_items : [];
          const optionIds = Array.isArray(item?.option_item_ids) ? item.option_item_ids : optionItems.map((opt) => opt.id);
          const normalizedOptionIds = optionIds.map(Number).filter(Number.isFinite);
          const normalizedVariantGroupId = toFiniteNumberOrNull(item?.variant_group_id);
          const normalizedVariantValueIndex = toFiniteNumberOrNull(item?.variant_value_index);
          const hasVariantSelection = normalizedVariantGroupId !== null && normalizedVariantValueIndex !== null;
          const variantSelection = hasVariantSelection
            ? { group_id: normalizedVariantGroupId, value_index: normalizedVariantValueIndex }
            : null;
          const isGiftReward = Number(item?.is_gift_reward || 0) === 1;
          const giftRewardId = toFiniteNumberOrNull(item?.gift_reward_id);
          const normalizedOptionItems = optionItems.length
            ? optionItems.map((opt) => {
              const optionVariantGroupId = toFiniteNumberOrNull(opt.variant_group_id);
              const optionVariantValueIndex = toFiniteNumberOrNull(opt.variant_value_index);
              const hasOptionVariant = optionVariantGroupId !== null && optionVariantValueIndex !== null;
              const optionTargetProductId = toFiniteNumberOrNull(
                opt?.target_product_id !== undefined ? opt.target_product_id : opt?.product_id
              );
              return {
                id: Number(opt.id),
                title: str(opt.title || opt.name || ""),
                price: Number(opt.price || 0),
                qty: Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1,
                target_product_id: optionTargetProductId,
                product_id: optionTargetProductId,
                // ???????? ?????
                variant_group_id: hasOptionVariant ? optionVariantGroupId : null,
                variant_value_index: hasOptionVariant ? optionVariantValueIndex : null,
                variant_label: hasOptionVariant ? str(opt.variant_label || "") : "",
                variant_price_diff: hasOptionVariant ? Number(opt.variant_price_diff || 0) : 0,
              };
            })
            : normalizedOptionIds.map((id) => ({
              id,
              title: "",
              price: 0,
              qty: 1,
              target_product_id: null,
              product_id: null,
              variant_group_id: null,
              variant_value_index: null,
              variant_label: "",
              variant_price_diff: 0,
            }));
          // ??????????????? ??????????? ?? ??????????? ??????
          const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
          
          return {
            key: isGiftReward
              ? (str(item?.key || "").trim() || `${makeCartKey(productId, normalizedOptionItems, ingredients, variantSelection)}:gift:${giftRewardId || Date.now()}`)
              : makeCartKey(productId, normalizedOptionItems, ingredients, variantSelection),
            product_id: productId,
            qty,
            option_item_ids: normalizedOptionItems.map((opt) => opt.id),
            option_items: normalizedOptionItems,
            ingredients: ingredients,
            ingredient_price_diff: Number(item?.ingredient_price_diff || 0),
            variant_group_id: normalizedVariantGroupId,
            variant_value_index: normalizedVariantValueIndex,
            variant_label: hasVariantSelection ? str(item.variant_label || "") : "",
            variant_group_title: hasVariantSelection ? str(item?.variant_group_title || "") : "",
            variant_unit: hasVariantSelection ? str(item?.variant_unit || item?.variantUnit || "") : "",
            variant_unit_price: hasVariantSelection ? Number(item.variant_unit_price || 0) : 0,
            unit_price_override: item?.unit_price_override != null ? Number(item.unit_price_override) : null,
            is_gift_reward: isGiftReward ? 1 : 0,
            gift_reward_id: giftRewardId,
            auto_add: Number(item?.auto_add || 0) ? 1 : 0,
            auto_add_group_id: toFiniteNumberOrNull(item?.auto_add_group_id),
          };
        })
        .filter(Boolean);
    }

    if (raw && typeof raw === "object") {
      return Object.keys(raw)
        .map((k) => {
          const productId = Number(k);
          const qty = Math.max(0, Number(raw[k] || 0));
          if (!Number.isFinite(productId) || qty <= 0) return null;
          return {
            key: makeCartKey(productId, []),
            product_id: productId,
            qty,
            option_item_ids: [],
            option_items: [],
            variant_group_id: null,
            variant_value_index: null,
            variant_label: "",
            variant_group_title: "",
            variant_unit: "",
            variant_unit_price: 0,
            auto_add: 0,
            auto_add_group_id: null,
          };
        })
        .filter(Boolean);
    }

    return [];
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return normalizeCart(parsed);
    } catch {}
    return [];
  }

  function saveCart() {
    markCartUiDirty();
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch {}
  }

  function loadAutoAddDismissed() {
    try {
      const raw = localStorage.getItem(AUTO_ADD_DISMISSED_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.map((x) => String(x)).filter(Boolean));
    } catch {
      return new Set();
    }
  }

  function applyAutoAddRules() {
    const groups = Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [];
    const rules = Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [];
    if (!groups.length || !rules.length) return false;

    let changed = false;

    const hasBaseItems = state.cart.some((item) => {
      const qty = Number(item.qty || 0);
      if (qty <= 0) return false;
      if (item.type === "combo") return true;
      const pid = Number(item.product_id || item.id);
      if (!Number.isFinite(pid)) return false;
      return Number(item.auto_add || 0) !== 1;
    });

    if (!hasBaseItems) {
      const before = state.cart.length;
      state.cart = state.cart.filter((item) => {
        const qty = Number(item.qty || 0);
        if (qty <= 0) return false;
        return Number(item.auto_add || 0) !== 1;
      });
      if (state.cart.length !== before) {
        changed = true;
      }
      if (state.cart.length === 0) {
        if (state.autoAddDismissed.size) {
          clearAllAutoAddDismissed();
          changed = true;
        }
      }
      return changed;
    }

    const itemsByGroup = new Map();
    rules.forEach((rule) => {
      const gid = Number(rule.group_id);
      if (!Number.isFinite(gid)) return;
      if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
      itemsByGroup.get(gid).push(rule);
    });

    const totals = computeCartTotals(cartItemsResolved());
    const nonAutoTotal = totals.nonAutoTotal;
    const autoEligibleTotal = totals.autoEligibleTotal;

    const sortedGroups = groups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0));

    sortedGroups.forEach((group) => {
      const groupId = Number(group.id);
      if (!Number.isFinite(groupId)) return;
      const groupRules = (itemsByGroup.get(groupId) || []).slice().sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0)
      );
      if (!groupRules.length) return;

      const baseTotal = Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
      const minAmount = group.min_cart_amount != null ? Number(group.min_cart_amount) : null;
      const maxAmount = group.max_cart_amount != null ? Number(group.max_cart_amount) : null;
      const minOk = minAmount == null || baseTotal >= minAmount;
      const maxOk = maxAmount == null || baseTotal <= maxAmount;
      const eligible = minOk && maxOk;

      if (!eligible) {
        groupRules.forEach((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return;
          const key = makeCartKey(pid, []);
          if (getCartItemByKey(key)) {
            state.cart = state.cart.filter((x) => x.key !== key);
            changed = true;
          }
        });
        return;
      }

      const allowQty = Number(group.allow_customer_qty ?? 1) === 1;

      groupRules.forEach((rule) => {
        const pid = Number(rule.product_id);
        if (!Number.isFinite(pid)) return;

        const p = state.productCache.get(pid);
        if (p && !isProductAvailable(p)) return;

        const key = makeCartKey(pid, []);
        const matching = state.cart.filter((x) => Number(x.product_id || x.id) === pid);
        let item = matching.find((x) => Number(x.auto_add || 0) === 1) || null;
        if (!item) {
          item = matching.find((x) => isPlainCartItem(x)) || null;
        }
        if (!item && matching.length === 1) {
          item = matching[0] || null;
        }

        const dismissed = isAutoAddDismissed(groupId, pid);
        if (item && dismissed) {
          clearAutoAddDismissed(groupId, pid);
        }
        if (!item && dismissed) return;

        if (item && Number(item.auto_add || 0) !== 1) {
          item.auto_add = 1;
          item.auto_add_group_id = groupId;
          changed = true;
        }

        if (matching.length > 1 && item) {
          matching.forEach((candidate) => {
            if (candidate === item) return;
            if (Number(candidate.auto_add || 0) === 1 || isPlainCartItem(candidate)) {
              const idx = state.cart.indexOf(candidate);
              if (idx !== -1) {
                state.cart.splice(idx, 1);
                changed = true;
              }
            }
          });
        }

        const minQty = Math.max(0, Number(rule.min_qty || 0));
        const defaultQty = Math.max(0, Number(rule.default_qty || 0));
        const maxQty = rule.max_qty != null ? Math.max(0, Number(rule.max_qty)) : null;
        const desired = Math.max(minQty, defaultQty);
        const keepDormantZeroQty = Number(item?.auto_add || 0) === 1 && Math.max(0, Number(item?.qty || 0)) <= 0;

        if (!item && desired > 0) {
          item = {
            key,
            product_id: pid,
            qty: desired,
            option_item_ids: [],
            option_items: [],
            ingredients: [],
            ingredient_price_diff: 0,
            variant_group_id: null,
            variant_value_index: null,
            variant_label: "",
            variant_unit_price: 0,
            auto_add: 1,
            auto_add_group_id: groupId,
          };
          state.cart.push(item);
          changed = true;
        }

        if (!item) return;

        let nextQty = Math.max(0, Number(item.qty || 0));
        if (keepDormantZeroQty) {
          nextQty = 0;
        } else if (!allowQty) {
          nextQty = desired;
        } else {
          if (minQty > 0 && nextQty < minQty) nextQty = minQty;
          if (maxQty != null && nextQty > maxQty) nextQty = maxQty;
        }
        if (maxQty != null && nextQty > maxQty) nextQty = maxQty;

        if (nextQty !== item.qty) {
          item.qty = nextQty;
          changed = true;
        }
        if (nextQty <= 0 && Number(item.auto_add || 0) !== 1) {
          state.cart = state.cart.filter((x) => x !== item && x.key !== key);
          changed = true;
        }
      });

      const maxGroupQty = group.max_items_qty != null ? Number(group.max_items_qty) : null;
      if (maxGroupQty != null && Number.isFinite(maxGroupQty)) {
        const groupItems = groupRules.map((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return null;
          const key = makeCartKey(pid, []);
          const item = getCartItemByKey(key);
          if (!item) return null;
          return { rule, item, key };
        }).filter(Boolean);

        const totalQty = groupItems.reduce((sum, entry) => sum + Math.max(0, Number(entry.item.qty || 0)), 0);
        let overflow = totalQty - maxGroupQty;
        if (overflow > 0) {
          const sortedItems = groupItems.slice().sort((a, b) => {
            const aSort = a.rule.sort_order ?? 0;
            const bSort = b.rule.sort_order ?? 0;
            return bSort - aSort || Number(b.rule.id || 0) - Number(a.rule.id || 0);
          });
          sortedItems.forEach((entry) => {
            if (overflow <= 0) return;
            const minQty = Math.max(0, Number(entry.rule.min_qty || 0));
            const currentQty = Math.max(0, Number(entry.item.qty || 0));
            const reducible = Math.max(0, currentQty - minQty);
            if (reducible <= 0) return;
            const reduceBy = Math.min(reducible, overflow);
            const nextQty = currentQty - reduceBy;
            entry.item.qty = nextQty;
            overflow -= reduceBy;
            changed = true;
            if (
              nextQty <= 0 &&
              minQty <= 0 &&
              Number(entry.rule.default_qty || 0) <= 0 &&
              Number(entry.item?.auto_add || 0) !== 1
            ) {
              state.cart = state.cart.filter((x) => x.key !== entry.key);
            }
          });
        }
      }
    });

    return changed;
  }

  function pruneUnavailableCartItems() {
    const displayItems = cartItemsResolved(state.cart, { includeDormantAutoAdd: true, includeUnavailable: true });
    const hasUnavailable = displayItems.some((item) => item?.is_unavailable === true);
    if (hasUnavailable) markCartUiDirty();
    return hasUnavailable;
  }

  function makeCartKey(productId, optionItemsOrIds, ingredients = [], variantSelection = null) {
    const entries = (Array.isArray(optionItemsOrIds) ? optionItemsOrIds : [])
      .map((opt) => {
        if (typeof opt === "number") return { id: opt, qty: 1, variant_group_id: null, variant_value_index: null };
        if (!opt || typeof opt !== "object") return null;
        const id = Number(opt.id);
        if (!Number.isFinite(id)) return null;
        const qty = Math.max(0, Number(opt.qty || opt.quantity || 1)) || 1;
        // ????????? ???????? ????? ? ?????
        const variantGroupId = Number(opt.variant_group_id);
        const variantIndex = Number(opt.variant_value_index);
        const hasVariant = Number.isFinite(variantGroupId) && Number.isFinite(variantIndex);
        return { 
          id, 
          qty, 
          variant_group_id: hasVariant ? variantGroupId : null, 
          variant_value_index: hasVariant ? variantIndex : null 
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        // ????????? ??????? ?? id, ????? ?? ????????
        if (a.id !== b.id) return a.id - b.id;
        if (a.variant_group_id !== b.variant_group_id) {
          const aVg = a.variant_group_id ?? 0;
          const bVg = b.variant_group_id ?? 0;
          return aVg - bVg;
        }
        const aVi = a.variant_value_index ?? 0;
        const bVi = b.variant_value_index ?? 0;
        return aVi - bVi;
      });
    const optionPart = entries.map((entry) => {
      let part = `${entry.id}${entry.qty !== 1 ? `x${entry.qty}` : ""}`;
      // ????????В корзине пусто ? ????, ???? ?? ????
      if (entry.variant_group_id != null && entry.variant_value_index != null) {
        part += `v${entry.variant_group_id}-${entry.variant_value_index}`;
      }
      return part;
    }).join(",");
    
    // ????????? ??????????? ? ???? ??? ?????????? ????????
    const ingEntries = (Array.isArray(ingredients) ? ingredients : [])
      .map((ing) => {
        const id = Number(ing.ingredient_id || ing.id);
        const qty = Number(ing.quantity ?? ing.qty ?? 1);
        if (!Number.isFinite(id)) return null;
        return { id, qty };
      })
      .filter(Boolean)
      .sort((a, b) => a.id - b.id);
    const ingPart = ingEntries.map((entry) => `${entry.id}x${entry.qty}`).join(",");
    
    const variantGroupId = Number(variantSelection?.group_id);
    const variantIndex = Number(variantSelection?.value_index);
    const variantPart = Number.isFinite(variantGroupId) && Number.isFinite(variantIndex)
      ? `v${variantGroupId}-${variantIndex}`
      : "";

    const keyParts = [Number(productId), optionPart || "", ingPart || "", variantPart || ""].filter(Boolean).join(":");
    return keyParts;
  }

  function cartQty(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return 0;
    return state.cart.reduce((sum, item) => {
      if (Number(item.product_id) !== pid) return sum;
      return sum + Number(item.qty || 0);
    }, 0);
  }

  // ---------------------------------------------------------------------------
  // Локальный расчёт потребления stock
  // ---------------------------------------------------------------------------

  /**
   * Количество единиц stock, которое потребляет один «юнит» продукта/опции/ингредиента.
   * Учитывает вариант (если есть) и конверсию единиц.
   *   product     — объект продукта из productCache (нужны base_qty, base_unit_id)
   *   variantLabel — строка варианта, напр. "3" или "3 шт" (из variant_label)
   *   variantUnitId — unit_id группы вариантов
   * Возвращает число (по умолчанию product.base_qty || 1).
   */
  function calcConsumedPerUnit(product, variantLabel, variantUnitId) {
    if (!product) return 1;
    // Пробуем распарсить числовое значение из варианта
    if (variantLabel != null && variantLabel !== "") {
      const numericValue = parseVariantValueNumber(variantLabel);
      if (Number.isFinite(numericValue) && numericValue > 0) {
        const baseUnitId = Number(product.base_unit_id || product.unit_id || 0);
        const fromUnitId = Number(variantUnitId || 0);
        if (fromUnitId > 0 && baseUnitId > 0) {
          if (fromUnitId === baseUnitId) return numericValue;
          const factor = getConversionFactor(fromUnitId, baseUnitId);
          if (factor != null) {
            const inBase = numericValue * factor;
            if (Number.isFinite(inBase) && inBase > 0) return inBase;
          }
        }
        // Если нет конверсии но есть числовое значение — возвращаем как есть
        return numericValue;
      }
    }
    // Фолбэк: base_qty продукта (по умолчанию 1)
    const bq = Number(product.base_qty || 1);
    return Number.isFinite(bq) && bq > 0 ? bq : 1;
  }

  /**
   * Считает суммарное потребление stock для productId по всей корзине.
   * Учитывает: основной товар, option items, ingredients, combo selections.
   */
  function resolveOptionTargetProductId(optionItem) {
    const direct = Number(optionItem?.target_product_id || optionItem?.product_id || 0);
    if (Number.isFinite(direct) && direct > 0) return direct;

    const optionItemId = Number(optionItem?.id || 0);
    if (!Number.isFinite(optionItemId) || optionItemId <= 0) return 0;
    if (!(state.optionGroupCache instanceof Map) || state.optionGroupCache.size === 0) return 0;

    for (const details of state.optionGroupCache.values()) {
      const items = Array.isArray(details?.items) ? details.items : [];
      const matched = items.find((it) => Number(it?.id || 0) === optionItemId);
      if (!matched) continue;
      const matchedPid = Number(matched?.target_product_id || matched?.product_id || 0);
      if (Number.isFinite(matchedPid) && matchedPid > 0) return matchedPid;
    }
    return 0;
  }

  function calcProductStockConsumed(productId, sourceCart) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return 0;
    const cart = Array.isArray(sourceCart) ? sourceCart : state.cart;
    let total = 0;

    for (const item of cart) {
      if (!item) continue;
      const itemQty = Math.max(0, Number(item.qty || 0));
      if (!itemQty) continue;

      // ----- Combo -----
      if (item.type === "combo") {
        const selections = Array.isArray(item.selections) ? item.selections : [];
        for (const sel of selections) {
          const selPid = Number(sel?.product_id || 0);
          // Combo selection — основной продукт
          if (selPid === pid) {
            const selProduct = state.productCache.get(selPid);
            const variantLabel = sel?.variant_label || sel?.variant_value || "";
            const variantGroupId = Number(sel?.variant_group_id || 0);
            const selVariants = selProduct && Array.isArray(selProduct.variants) ? selProduct.variants : [];
            const variantUnitId = Number(sel?.unit_id || 0)
              || (variantGroupId > 0 && selVariants.length ? Number(selVariants[0]?.unit_id || 0) : 0);
            total += calcConsumedPerUnit(selProduct, variantLabel, variantUnitId) * itemQty;
          }
          // Combo selection — ingredients
          const selIngredients = Array.isArray(sel?.ingredients_display)
            ? sel.ingredients_display
            : (Array.isArray(sel?.ingredients) ? sel.ingredients : []);
          for (const ing of selIngredients) {
            const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
            if (ingPid !== pid) continue;
            const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
            if (ingQty <= 0) continue;
            const ingProduct = state.productCache.get(ingPid);
            const ingUnitId = Number(ing?.unit_id || 0);
            if (ingProduct && ingUnitId) {
              const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
              if (baseUnitId && ingUnitId !== baseUnitId) {
                const factor = getConversionFactor(ingUnitId, baseUnitId);
                if (factor != null) {
                  total += ingQty * factor * itemQty;
                  continue;
                }
              }
            }
            total += ingQty * itemQty;
          }
        }
        continue;
      }

      // ----- Regular product -----
      const itemPid = Number(item.product_id || 0);

      // Основной товар
      if (itemPid === pid) {
        const product = state.productCache.get(itemPid);
        const variantLabel = item.variant_label || "";
        const variants = product && Array.isArray(product.variants) ? product.variants : [];
        const variantUnitId = Number(variants[0]?.unit_id || 0);
        total += calcConsumedPerUnit(product, variantLabel, variantUnitId) * itemQty;
      }

      // Option items
      const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
      for (const opt of optionItems) {
        const optPid = resolveOptionTargetProductId(opt);
        if (optPid !== pid) continue;
        const optQty = Math.max(0, Number(opt?.qty || 1));
        const optProduct = state.productCache.get(optPid);
        const optVariantLabel = opt?.variant_label || "";
        const optVariants = optProduct && Array.isArray(optProduct.variants) ? optProduct.variants : [];
        const optVariantGroupId = Number(opt?.variant_group_id || 0);
        const optVariantUnitId = Number(opt?.unit_id || 0)
          || (optVariantGroupId > 0 && optVariants.length ? Number(optVariants[0]?.unit_id || 0) : 0);
        total += calcConsumedPerUnit(optProduct, optVariantLabel, optVariantUnitId) * optQty * itemQty;
      }

      // Ingredients
      const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
      for (const ing of ingredients) {
        const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
        if (ingPid !== pid) continue;
        const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
        if (ingQty <= 0) continue;
        const ingProduct = state.productCache.get(ingPid);
        const ingUnitId = Number(ing?.unit_id || 0);
        if (ingProduct && ingUnitId) {
          const baseUnitId = Number(ingProduct.base_unit_id || ingProduct.unit_id || 0);
          if (baseUnitId && ingUnitId !== baseUnitId) {
            const factor = getConversionFactor(ingUnitId, baseUnitId);
            if (factor != null) {
              total += ingQty * factor * itemQty;
              continue;
            }
          }
        }
        total += ingQty * itemQty;
      }
    }

    return total;
  }

  /**
   * Доступный остаток stock для productId (уже вычтена корзина).
   * Возвращает Infinity если stock unlimited, число >= 0 иначе.
   */
  function getAvailableStock(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return Infinity;
    const entry = getStockLevelEntry(pid);
    if (!entry) return Infinity;
    if (entry.qty === null || entry.qty === undefined) return Infinity;
    if (entry.isUnlimited) return Infinity;
    const stockQty = Number(entry.qty);
    if (!Number.isFinite(stockQty)) return Infinity;
    return Math.max(0, stockQty - calcProductStockConsumed(pid));
  }

  /**
   * Сколько ещё можно «добавить» для productId с учётом дополнительного потребления
   * (то что набрано в текущем пикере, но ещё не в корзине).
   */
  function getProductRemainingForPicker(productId, additionalConsumed) {
    const available = getAvailableStock(productId);
    if (!Number.isFinite(available)) return Infinity;
    const extra = Number(additionalConsumed || 0);
    return Math.max(0, available - extra);
  }

  // ---------------------------------------------------------------------------
  // Локальная проверка доступности составных блюд (ингредиенты по умолчанию)
  // ---------------------------------------------------------------------------

  const productIngredientRequirementsCache = new Map();

  function normalizeIngredientRequirementInBase(ingredientRow) {
    const rawQty = Number(ingredientRow?.quantity ?? ingredientRow?.qty ?? 0);
    if (!Number.isFinite(rawQty) || rawQty <= 0) return 0;
    const inBase = getQtyInBase(ingredientRow, rawQty);
    if (Number.isFinite(inBase) && inBase > 0) return inBase;
    return rawQty;
  }

  async function ensureProductIngredientRequirements(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return new Map();

    const cached = productIngredientRequirementsCache.get(pid);
    if (cached?.status === "ready" || cached?.status === "error") {
      return cached.requirements instanceof Map ? cached.requirements : new Map();
    }
    if (cached?.status === "pending" && cached.promise) {
      return cached.promise;
    }

    const promise = (async () => {
      try {
        const json = await apiJson('/api/public/products/batch/ingredients', {
          method: 'POST',
          body: { ids: [pid] },
        });
        const rows = Array.isArray(json?.data?.[pid])
          ? json.data[pid]
          : (Array.isArray(json?.data?.[String(pid)]) ? json.data[String(pid)] : []);
        const requirements = new Map();
        for (const ing of rows) {
          const depPid = Number(ing?.ingredient_id || 0);
          if (!Number.isFinite(depPid) || depPid <= 0) continue;
          const amount = normalizeIngredientRequirementInBase(ing);
          if (!(amount > 0)) continue;
          requirements.set(depPid, Number(requirements.get(depPid) || 0) + amount);
        }
        productIngredientRequirementsCache.set(pid, {
          status: "ready",
          requirements,
        });
        return requirements;
      } catch (err) {
        productIngredientRequirementsCache.set(pid, {
          status: "error",
          requirements: new Map(),
        });
        return new Map();
      } finally {
        // Когда требования догрузились — сразу пересчитываем видимые карточки
        scheduleSyncAllProductCardsFromCart();
      }
    })();

    productIngredientRequirementsCache.set(pid, {
      status: "pending",
      promise,
      requirements: new Map(),
    });
    return promise;
  }

  async function batchLoadIngredientRequirements(productIds) {
    const ids = [];
    for (const rawId of productIds) {
      const pid = Number(rawId || 0);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      const cached = productIngredientRequirementsCache.get(pid);
      if (cached?.status === "ready" || cached?.status === "error") continue;
      ids.push(pid);
    }
    if (!ids.length) return;

    try {
      const json = await apiJson('/api/public/products/batch/ingredients', {
        method: 'POST',
        body: { ids },
      });
      const data = json?.data || {};
      for (const pid of ids) {
        const rows = Array.isArray(data[pid]) ? data[pid] : [];
        const requirements = new Map();
        for (const ing of rows) {
          const depPid = Number(ing?.ingredient_id || 0);
          if (!Number.isFinite(depPid) || depPid <= 0) continue;
          const amount = normalizeIngredientRequirementInBase(ing);
          if (!(amount > 0)) continue;
          requirements.set(depPid, Number(requirements.get(depPid) || 0) + amount);
        }
        productIngredientRequirementsCache.set(pid, { status: "ready", requirements });
      }
    } catch (err) {
      for (const pid of ids) {
        if (!productIngredientRequirementsCache.has(pid) || productIngredientRequirementsCache.get(pid)?.status === "pending") {
          productIngredientRequirementsCache.set(pid, { status: "error", requirements: new Map() });
        }
      }
    }
    scheduleSyncAllProductCardsFromCart();
  }

  function getProductIngredientRequirementsSync(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return new Map();
    const cached = productIngredientRequirementsCache.get(pid);
    if (!cached) {
      return null;
    }
    if (cached.status === "pending") return null;
    return cached.requirements instanceof Map ? cached.requirements : new Map();
  }

  function isProductBlockedByIngredientRequirements(productId) {
    const requirements = getProductIngredientRequirementsSync(productId);
    // Пока требования не догружены — не блокируем карточку преждевременно.
    if (!(requirements instanceof Map)) return false;
    if (!requirements.size) return false;

    for (const [depPid, requiredAmount] of requirements.entries()) {
      if (!(requiredAmount > 0)) continue;
      const remaining = getAvailableStock(depPid);
      if (!Number.isFinite(remaining)) continue;
      if (remaining + 1e-9 < requiredAmount) {
        return true;
      }
    }
    return false;
  }

  function cartCountTotal() {
    return state.cart.reduce((sum, item) => sum + Number(item.qty || 0), 0);
  }

  function isDormantAutoAddCartItem(item) {
    if (!item || item.type === "combo") return false;
    if (Number(item?.auto_add || 0) !== 1) return false;
    const pid = Number(item?.product_id || item?.id || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    return Math.max(0, Number(item?.qty || 0)) <= 0;
  }

  function getCartItemByKey(key) {
    return state.cart.find((item) => item.key === key) || null;
  }

  function isResolvedCartItemUnavailable(item) {
    if (!item) return false;
    if (item.type === "combo") {
      return !canUseCartDraftForProductIds(state.cart, collectComboCartAffectedProductIds(item));
    }

    const product = item.product || null;
    const pid = Number(product?.id || item.product_id || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    if (product && !isProductAvailable(product)) return true;
    return !canUseCartDraftForProductIds(state.cart, collectRegularCartAffectedProductIds(pid));
  }

  function cartItemsResolved(sourceCart = state.cart, opts = {}) {
    const includeDormantAutoAdd = opts?.includeDormantAutoAdd === true;
    const includeUnavailable = opts?.includeUnavailable === true;
    const items = [];
    const safeCart = Array.isArray(sourceCart) ? sourceCart : [];
    for (const item of safeCart) {
      if (item.type === "combo") {
        const qty = Math.max(0, Number(item.qty || 0));
        if (!qty) continue;
        const unitPrice = (item.selections || []).reduce((s, sel) => s + Number(sel.unit_price_override || 0), 0);
        const resolvedCombo = {
          key: item.key,
          type: "combo",
          combo_id: item.combo_id,
          category_id: item.category_id != null ? Number(item.category_id) : null,
          combo_category_id: item.combo_category_id != null ? Number(item.combo_category_id) : null,
          combo_title: item.combo_title || "Комбо",
          qty,
          selections: Array.isArray(item.selections) ? item.selections : [],
          unit_price_override: roundPrice(unitPrice),
          unit_price_before_discount: item.unit_price_before_discount != null ? Number(item.unit_price_before_discount) : null,
          auto_add: 0,
          auto_add_group_id: null,
        };
        resolvedCombo.is_unavailable = isResolvedCartItemUnavailable(resolvedCombo);
        if (includeUnavailable || !resolvedCombo.is_unavailable) items.push(resolvedCombo);
        continue;
      }
      const pid = Number(item.product_id);
      const qty = Math.max(0, Number(item.qty || 0));
      const isDormantAutoAdd = includeDormantAutoAdd && isDormantAutoAddCartItem(item);
      if ((!qty && !isDormantAutoAdd) || !Number.isFinite(pid)) continue;
      const p = state.productCache.get(pid);
      if (!p) continue;
      const variantGroupId = toFiniteNumberOrNull(item.variant_group_id);
      const variantValueIndex = toFiniteNumberOrNull(item.variant_value_index);
      const hasVariantSelection = variantGroupId !== null && variantValueIndex !== null;
      const resolvedItem = {
        key: item.key,
        product: p,
        qty,
        option_item_ids: Array.isArray(item.option_item_ids) ? item.option_item_ids : [],
        option_items: Array.isArray(item.option_items) ? item.option_items : [],
        ingredients: Array.isArray(item.ingredients) ? item.ingredients : [],
        ingredient_price_diff: Number(item.ingredient_price_diff || 0),
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        variant_label: hasVariantSelection ? str(item.variant_label || "") : "",
        variant_group_title: hasVariantSelection ? str(item?.variant_group_title || "") : "",
        variant_unit: hasVariantSelection ? str(item?.variant_unit || item?.variantUnit || "") : "",
        variant_unit_price: hasVariantSelection ? Number(item.variant_unit_price || 0) : 0,
        unit_price_override: item.unit_price_override != null ? Number(item.unit_price_override) : null,
        is_gift_reward: Number(item.is_gift_reward || 0) === 1,
        gift_reward_id: toFiniteNumberOrNull(item.gift_reward_id),
        auto_add: Number(item.auto_add || 0),
        auto_add_group_id: toFiniteNumberOrNull(item.auto_add_group_id),
      };
      resolvedItem.is_unavailable = isResolvedCartItemUnavailable(resolvedItem);
      if (includeUnavailable || !resolvedItem.is_unavailable) items.push(resolvedItem);
    }
    return items;
  }

  function cloneCartState(cartItems = state.cart) {
    try {
      if (typeof structuredClone === "function") {
        return structuredClone(Array.isArray(cartItems) ? cartItems : []);
      }
    } catch {}
    try {
      return JSON.parse(JSON.stringify(Array.isArray(cartItems) ? cartItems : []));
    } catch {
      return Array.isArray(cartItems) ? cartItems.map((it) => ({ ...it })) : [];
    }
  }

  function toStockVariantValue(rawLabel) {
    const text = str(rawLabel || "").trim();
    if (!text) return "";
    const colonPos = text.indexOf(":");
    if (colonPos >= 0) {
      const right = text.slice(colonPos + 1).trim();
      return right || text;
    }
    return text;
  }

  function buildStockCheckItemsPayloadFromResolved(resolvedItems) {
    const safeItems = Array.isArray(resolvedItems) ? resolvedItems : [];
    return safeItems.map((item) => {
      if (item?.type === "combo") {
        const selections = Array.isArray(item.selections) ? item.selections : [];
        return {
          cart_key: item.key || null,
          type: "combo",
          combo_id: item.combo_id || null,
          qty: Math.max(1, Number(item.qty || 1)),
          selections: selections.map((sel) => ({
            product_id: Number(sel.product_id || 0) || null,
            variant_group_id: sel.variant_group_id != null ? Number(sel.variant_group_id) : null,
            variant_value_index: sel.variant_value_index != null ? Number(sel.variant_value_index) : null,
            variant_label: str(sel.variant_label || ""),
            unit_id: sel.unit_id != null ? Number(sel.unit_id) : null,
            ingredients_display: Array.isArray(sel.ingredients_display)
              ? sel.ingredients_display.map((ing) => ({
                  ingredient_id: ing.ingredient_id != null ? Number(ing.ingredient_id) : null,
                  product_id: ing.product_id != null ? Number(ing.product_id) : null,
                  quantity: ing.quantity != null ? Number(ing.quantity) : null,
                  qty: ing.qty != null ? Number(ing.qty) : null,
                  unit_id: ing.unit_id != null ? Number(ing.unit_id) : null,
                }))
              : [],
          })),
        };
      }

      const variantGroupId = toFiniteNumberOrNull(item?.variant_group_id);
      const variantValueIndex = toFiniteNumberOrNull(item?.variant_value_index);
      const variantLabel = toStockVariantValue(item?.variant_label || "");
      const hasVariant = variantGroupId !== null && variantValueIndex !== null && !!variantLabel;

      return {
        cart_key: item?.key || null,
        product_id: Number(item?.product?.id || item?.product_id || 0) || null,
        qty: Math.max(1, Number(item?.qty || 1)),
        option_item_ids: Array.isArray(item?.option_item_ids) ? item.option_item_ids : [],
        option_items: Array.isArray(item?.option_items) ? item.option_items : [],
        ingredients: Array.isArray(item?.ingredients) ? item.ingredients : [],
        variant_group_id: hasVariant ? variantGroupId : null,
        variant_value_index: hasVariant ? variantValueIndex : null,
        variant_label: hasVariant ? variantLabel : null,
        variants: hasVariant
          ? [{
              variant_group_id: variantGroupId,
              variant_value_index: variantValueIndex,
              value: variantLabel,
              label: variantLabel,
            }]
          : undefined,
      };
    });
  }

  function extractStockShortagesFromError(err) {
    const shortagesRaw = Array.isArray(err?.payload?.data?.shortages) ? err.payload.data.shortages : [];
    return shortagesRaw
      .map((row) => {
        const productId = Number(row?.productId || row?.product_id || 0);
        if (!Number.isFinite(productId) || productId <= 0) return null;
        return {
          productId,
          requiredQty: Number(row?.requiredQty ?? row?.required_qty ?? 0) || 0,
          availableQty: row?.availableQty == null ? null : Number(row.availableQty),
          productName: str(row?.productName || row?.product_name || "").trim(),
        };
      })
      .filter(Boolean);
  }

  function getShortageProductIds(shortages) {
    const ids = new Set();
    (Array.isArray(shortages) ? shortages : []).forEach((row) => {
      const pid = Number(row?.productId || row?.product_id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });
    return Array.from(ids);
  }

  async function refreshProductsByIds(productIds) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    try {
      const json = await apiJson('/api/public/products/batch/by-ids', {
        method: 'POST',
        body: { ids },
      });
      const data = json?.data && typeof json.data === "object" ? json.data : {};
      ids.forEach((pid) => {
        const product = data[pid] || data[String(pid)] || null;
        if (!product || typeof product !== "object") return;
        if (!Array.isArray(product.photos)) product.photos = safePhotos(product);
        cacheStockFromProductPayload(product, "product_refresh_by_id");
        product.is_available = isProductAvailable(product);
        state.productCache.set(pid, product);
      });
    } catch {}
  }

  function syncCartUiAfterStateChange() {
    scheduleSyncAllProductCardsFromCart();
    renderCart();
    updateCartBadge();

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      appendUpsellToList(openCartSheetCtx.listEl);
    }
    if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
  }

  async function checkStockForItemsPayload(itemsPayload, opts = {}) {
    const safeItems = Array.isArray(itemsPayload) ? itemsPayload : [];
    if (!safeItems.length) return { available: true, shortages: [], stockLevels: [] };

    const finalizeOutOfStock = async (shortages, stockLevels) => {
      if (opts.refreshOnOut !== false) {
        const refreshIds = new Set(getShortageProductIds(shortages));
        stockLevels.forEach((row) => {
          const pid = Number(row?.productId || row?.product_id || 0);
          if (Number.isFinite(pid) && pid > 0) refreshIds.add(pid);
        });
        await refreshProductsByIds(Array.from(refreshIds));
      }
      if (opts.showToastOnOut) {
        showToast(opts.toastMessage || "Больше нет в наличии");
      }
      return { available: false, shortages, stockLevels };
    };

    try {
      const json = await apiJson("/api/public/orders/stock-check", {
        method: "POST",
        body: { items: safeItems },
      });

      const payloadData = json?.data || null;
      const stockLevels = extractStockLevelsFromPayload(payloadData);
      if (stockLevels.length) {
        mergeStockLevels(stockLevels, payloadData?.available === false ? "stock_check_out" : "stock_check_success");
      }

      if (payloadData?.available === false) {
        const shortages = extractStockShortagesFromError({
          payload: { data: payloadData },
        });
        return finalizeOutOfStock(shortages, stockLevels);
      }

      return { available: true, shortages: [], stockLevels };
    } catch (e) {
      // Backward compatibility for servers that still return 409 OUT_OF_STOCK.
      if (String(e?.message || "") !== "OUT_OF_STOCK") throw e;
      const shortages = extractStockShortagesFromError(e);
      const stockLevels = extractStockLevelsFromPayload(e?.payload?.data || null);
      if (stockLevels.length) {
        mergeStockLevels(stockLevels, "stock_check_out");
      }
      return finalizeOutOfStock(shortages, stockLevels);
    }
  }

  async function validateCurrentCartStock(opts = {}) {
    const itemsPayload = buildStockCheckItemsPayloadFromResolved(cartItemsResolved());
    return checkStockForItemsPayload(itemsPayload, opts);
  }

  let __cartStockRecheckSeq = 0;
  let __cartStockRecheckTimer = null;
  let __cartStockRecheckSnapshot = [];
  let __cartStockRecheckOpts = {};
  const ENABLE_LIVE_CART_STOCK_RECHECK = true;
  function queueCartStockRecheck(previousCartSnapshot, opts = {}) {
    if (!ENABLE_LIVE_CART_STOCK_RECHECK) return;
    __cartStockRecheckSnapshot = cloneCartState(previousCartSnapshot || []);
    __cartStockRecheckOpts = { ...(opts || {}) };
    const seq = ++__cartStockRecheckSeq;

    if (__cartStockRecheckTimer) {
      clearTimeout(__cartStockRecheckTimer);
      __cartStockRecheckTimer = null;
    }

    __cartStockRecheckTimer = setTimeout(() => {
      __cartStockRecheckTimer = null;
      const snapshot = cloneCartState(__cartStockRecheckSnapshot || []);
      const localOpts = { ...(__cartStockRecheckOpts || {}) };

      (async () => {
        try {
          const check = await validateCurrentCartStock({
            refreshOnOut: localOpts.refreshOnOut !== false,
            showToastOnOut: false,
          });
          if (seq !== __cartStockRecheckSeq) return;
          if (check.available) return;

          state.cart = snapshot;
          saveCart();
          syncCartUiAfterStateChange();
          if (localOpts.showToast !== false) {
            showToast(localOpts.toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
          }
        } catch (e) {
          console.warn("Stock recheck failed:", e);
        }
      })();
    }, 180);
  }

  const cartQtyHardLimitByKey = new Map();

  function getCartQtyHardLimit(cartKey) {
    const key = String(cartKey || "");
    if (!key) return null;
    const value = Number(cartQtyHardLimitByKey.get(key));
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function setCartQtyHardLimit(cartKey, qty) {
    const key = String(cartKey || "");
    const value = Number(qty);
    if (!key || !Number.isFinite(value) || value < 0) return false;
    const prev = getCartQtyHardLimit(key);
    if (prev != null && Math.abs(prev - value) < 1e-9) return false;
    cartQtyHardLimitByKey.set(key, value);
    return true;
  }

  function clearCartQtyHardLimit(cartKey) {
    const key = String(cartKey || "");
    if (!key) return false;
    return cartQtyHardLimitByKey.delete(key);
  }

  function cleanupCartQtyHardLimits() {
    const activeKeys = new Set((Array.isArray(state.cart) ? state.cart : []).map((it) => String(it?.key || "")));
    const toDelete = [];
    cartQtyHardLimitByKey.forEach((_v, key) => {
      if (!activeKeys.has(String(key || ""))) toDelete.push(key);
    });
    toDelete.forEach((key) => cartQtyHardLimitByKey.delete(key));
    return toDelete.length > 0;
  }

  function isCartQtyPlusBlocked(cartKey, currentQty) {
    const limit = getCartQtyHardLimit(cartKey);
    if (limit == null) return false;
    const qty = Number(currentQty || 0);
    if (!Number.isFinite(qty)) return false;
    return qty >= limit - 1e-9;
  }

  function refreshQtyLimitUi() {
    scheduleSyncAllProductCardsFromCart();
    renderCart();
    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      appendUpsellToList(openCartSheetCtx.listEl);
    }
    if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
  }

  function resolveCartKeyForQtyChange(pid, delta, cartKey, cartRef = state.cart) {
    let targetKey = cartKey;
    const safeCart = Array.isArray(cartRef) ? cartRef : [];
    if (targetKey == null && delta < 0) {
      let lastIdx = -1;
      for (let i = safeCart.length - 1; i >= 0; i--) {
        if (Number(safeCart[i]?.product_id) === Number(pid)) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx >= 0) targetKey = safeCart[lastIdx].key;
    }
    if (targetKey == null) targetKey = makeCartKey(pid, []);
    return String(targetKey || "");
  }

  function applyQtyChangeOnCartDraft(cartDraft, pid, delta, targetKey) {
    const safeCart = Array.isArray(cartDraft) ? cartDraft : [];
    let item = safeCart.find((x) => String(x?.key || "") === String(targetKey || "")) || null;
    if (!item && delta > 0) {
      item = {
        key: targetKey,
        product_id: pid,
        qty: 0,
        option_item_ids: [],
        option_items: [],
        auto_add: 0,
        auto_add_group_id: null,
      };
      safeCart.push(item);
    }
    const prevQty = Number(item?.qty || 0);
    let nextQty = prevQty;
    if (item) {
      nextQty = Math.max(0, prevQty + delta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        const idx = safeCart.findIndex((x) => String(x?.key || "") === String(targetKey || ""));
        if (idx >= 0) safeCart.splice(idx, 1);
      }
    }
    return { prevQty, nextQty };
  }

  function canUseCartDraftForProductIds(draftCart, productIds) {
    const ids = Array.isArray(productIds)
      ? productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!ids.length) return true;
    for (const depPid of ids) {
      const stockEntry = getStockLevelEntry(depPid);
      if (!stockEntry || stockEntry.qty === null || stockEntry.qty === undefined || stockEntry.isUnlimited) {
        continue;
      }
      const stockQty = Number(stockEntry.qty);
      if (!Number.isFinite(stockQty)) continue;
      const consumed = calcProductStockConsumed(depPid, draftCart);
      if (consumed > stockQty + 1e-9) return false;
    }
    return true;
  }

  function collectRegularCartAffectedProductIds(productId) {
    const pid = Number(productId || 0);
    const ids = new Set();
    if (Number.isFinite(pid) && pid > 0) ids.add(pid);

    const requirements = getProductIngredientRequirementsSync(pid);
    if (requirements === null) {
      ensureProductIngredientRequirements(pid).catch(() => {});
    }
    if (requirements instanceof Map) {
      requirements.forEach((_requiredQty, depPid) => {
        const id = Number(depPid || 0);
        if (Number.isFinite(id) && id > 0) ids.add(id);
      });
    }

    return Array.from(ids);
  }

  function collectComboCartAffectedProductIds(comboItem) {
    const ids = new Set();
    const selections = Array.isArray(comboItem?.selections) ? comboItem.selections : [];

    for (const sel of selections) {
      const selPid = Number(sel?.product_id || 0);
      if (Number.isFinite(selPid) && selPid > 0) {
        ids.add(selPid);
        const requirements = getProductIngredientRequirementsSync(selPid);
        if (requirements === null) {
          ensureProductIngredientRequirements(selPid).catch(() => {});
        }
        if (requirements instanceof Map) {
          requirements.forEach((_requiredQty, depPid) => {
            const id = Number(depPid || 0);
            if (Number.isFinite(id) && id > 0) ids.add(id);
          });
        }
      }

      const selIngredients = Array.isArray(sel?.ingredients_display)
        ? sel.ingredients_display
        : (Array.isArray(sel?.ingredients) ? sel.ingredients : []);
      for (const ing of selIngredients) {
        const ingPid = Number(ing?.ingredient_id || ing?.product_id || 0);
        if (Number.isFinite(ingPid) && ingPid > 0) ids.add(ingPid);
      }
    }

    return Array.from(ids);
  }

  function canIncreaseComboCartItemBeforeApply(targetKey, delta, opts = {}) {
    const key = String(targetKey || "");
    const safeDelta = Number(delta || 0);
    const showToastOnOut = opts.showToastOnOut !== false;
    const toastMessage = opts.toastMessage || null;

    const currentItem = state.cart.find(
      (x) => String(x?.key || "") === key && String(x?.type || "") === "combo"
    ) || null;
    const currentQty = Number(currentItem?.qty || 0);

    if (!currentItem || !Number.isFinite(safeDelta) || safeDelta <= 0) {
      return { allowed: false, targetKey: key, currentQty, nextQty: currentQty };
    }

    const draft = cloneCartState(state.cart);
    const draftItem = draft.find(
      (x) => String(x?.key || "") === key && String(x?.type || "") === "combo"
    );
    if (!draftItem) {
      return { allowed: false, targetKey: key, currentQty, nextQty: currentQty };
    }

    const nextQty = Math.max(1, Number(draftItem.qty || 0) + safeDelta);
    draftItem.qty = nextQty;

    const affectedProducts = collectComboCartAffectedProductIds(draftItem);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    if (!allowed && showToastOnOut) {
      showToast(toastMessage || "Больше нет в наличии");
    }

    return { allowed, targetKey: key, currentQty, nextQty };
  }

  function canIncreaseRegularCartItemBeforeApply(pid, delta, targetKey, opts = {}) {
    const safePid = Number(pid || 0);
    const safeDelta = Number(delta || 0);
    const showToastOnOut = opts.showToastOnOut !== false;
    const toastMessage = opts.toastMessage || null;
    const currentQty = Number(getCartItemByKey(targetKey)?.qty || 0);

    if (!Number.isFinite(safePid) || safePid <= 0 || !Number.isFinite(safeDelta) || safeDelta <= 0) {
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    if (isCartQtyPlusBlocked(targetKey, currentQty)) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    if (isProductBlockedByIngredientRequirements(safePid)) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty: currentQty };
    }

    const draft = cloneCartState(state.cart);
    const { nextQty } = applyQtyChangeOnCartDraft(draft, safePid, safeDelta, targetKey);
    const affectedProducts = collectRegularCartAffectedProductIds(safePid);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    if (!allowed) {
      if (showToastOnOut) showToast(toastMessage || "\u0411\u043e\u043b\u044c\u0448\u0435 \u043d\u0435\u0442 \u0432 \u043d\u0430\u043b\u0438\u0447\u0438\u0438");
      return { allowed: false, targetKey, currentQty, nextQty };
    }

    return { allowed: true, targetKey, currentQty, nextQty };
  }

  function refreshNextRegularCartItemLimitLocal(pid, targetKey, expectedQty) {
    const currentItem = getCartItemByKey(targetKey);
    const currentQty = Number(currentItem?.qty || 0);
    if (!currentItem || currentQty <= 0 || currentQty !== Number(expectedQty)) {
      if (clearCartQtyHardLimit(targetKey)) refreshQtyLimitUi();
      return;
    }

    const safePid = Number(pid || 0);
    if (!Number.isFinite(safePid) || safePid <= 0) {
      if (clearCartQtyHardLimit(targetKey)) refreshQtyLimitUi();
      return;
    }

    const draft = cloneCartState(state.cart);
    const draftItem = draft.find((x) => String(x?.key || "") === String(targetKey || ""));
    if (!draftItem) return;
    draftItem.qty = Math.max(1, Number(draftItem.qty || 0) + 1);

    const affectedProducts = collectRegularCartAffectedProductIds(safePid);
    const allowed = canUseCartDraftForProductIds(draft, affectedProducts);

    let changed = false;
    if (!allowed) {
      changed = setCartQtyHardLimit(targetKey, currentQty);
    } else {
      changed = clearCartQtyHardLimit(targetKey);
    }
    if (changed) refreshQtyLimitUi();
  }

  function optionItemsTotal(optionItems) {
    return (Array.isArray(optionItems) ? optionItems : []).reduce((sum, opt) => {
      const qty = Math.max(0, Number(opt?.qty || opt?.quantity || 1)) || 1;
      return sum + Number(opt?.price || 0) * qty;
    }, 0);
  }

  function getAutoRuleByProductId(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid)) return null;
    const rule = state.autoAdd?.byProductId?.get(pid) || null;
    if (rule && !rule.group && state.autoAdd?.byGroupId) {
      rule.group = state.autoAdd.byGroupId.get(Number(rule.group_id)) || null;
    }
    return rule;
  }

  function makeAutoAddDismissKey(groupId, productId) {
    const gid = Number(groupId);
    const pid = Number(productId);
    if (!Number.isFinite(gid) || !Number.isFinite(pid)) return null;
    return `${gid}:${pid}`;
  }

  function saveAutoAddDismissed() {
    markCartUiDirty();
    try {
      localStorage.setItem(AUTO_ADD_DISMISSED_KEY, JSON.stringify(Array.from(state.autoAddDismissed)));
    } catch {}
  }

  function isAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return false;
    return state.autoAddDismissed.has(key);
  }

  function markAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return;
    if (!state.autoAddDismissed.has(key)) {
      state.autoAddDismissed.add(key);
      saveAutoAddDismissed();
    }
  }

  function clearAutoAddDismissed(groupId, productId) {
    const key = makeAutoAddDismissKey(groupId, productId);
    if (!key) return;
    if (state.autoAddDismissed.delete(key)) {
      saveAutoAddDismissed();
    }
  }

  function markAutoAddDismissedByProduct(productId) {
    const rule = getAutoRuleByProductId(productId);
    if (!rule) return;
    markAutoAddDismissed(rule.group_id, productId);
  }

  function clearAutoAddDismissedByProduct(productId) {
    const rule = getAutoRuleByProductId(productId);
    if (!rule) return;
    clearAutoAddDismissed(rule.group_id, productId);
  }

  function clearAllAutoAddDismissed() {
    if (!state.autoAddDismissed.size) return;
    state.autoAddDismissed.clear();
    saveAutoAddDismissed();
  }

  function clearAutoAddDismissedIfCartEmpty() {
    if (cartCountTotal() !== 0) return;
    clearAllAutoAddDismissed();
  }

  function getAutoAddDesiredQty(rule) {
    const minQty = Math.max(0, Number(rule?.min_qty || 0));
    const defaultQty = Math.max(0, Number(rule?.default_qty || 0));
    const desired = Math.max(minQty, defaultQty);
    return desired > 0 ? desired : 1;
  }

  function isPlainCartItem(item) {
    if (!item) return false;
    const optionItems = Array.isArray(item.option_items) ? item.option_items : [];
    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    const hasOptions = optionItems.length > 0;
    const hasIngredients = ingredients.length > 0;
    const hasVariant =
      toFiniteNumberOrNull(item.variant_group_id) !== null ||
      toFiniteNumberOrNull(item.variant_value_index) !== null;
    return !hasOptions && !hasIngredients && !hasVariant;
  }

  function parseRuleAmount(val) {
    if (val == null || val === "") return 0;
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const s = String(val).trim().replace(",", ".");
    const n2 = Number(s);
    return Number.isFinite(n2) ? n2 : 0;
  }

  function calcAutoFreeQty(rule, baseTotal) {
    if (!rule) return 0;
    let freeQty = Math.max(0, parseRuleAmount(rule.free_first_qty));
    const amountStep = parseRuleAmount(rule.free_per_amount);
    const stepQty = Math.max(0, parseRuleAmount(rule.free_per_amount_qty));
    if (amountStep > 0 && stepQty > 0 && baseTotal > 0) {
      freeQty += Math.floor(baseTotal / amountStep) * stepQty;
    }
    const maxFree = rule.max_free_qty != null ? Number(rule.max_free_qty) : null;
    if (maxFree != null && Number.isFinite(maxFree)) {
      freeQty = Math.min(freeQty, Math.max(0, maxFree));
    }
    return freeQty;
  }

  function getItemUnitParts(item) {
    // ????? ????: unit_price_override ??? ????????? variant_unit_price; ????? ? ???? ???????? (????? ??? ?????????????? ? variant_unit_price: 0)
    const ov = item?.unit_price_override != null ? Number(item.unit_price_override) : null;
    const vp = item?.variant_unit_price != null ? Number(item.variant_unit_price) : null;
    const baseProductUnit = Number(
      (ov != null ? ov : (vp != null && vp !== 0 ? vp : null)) ?? item?.product?.price ?? 0
    );
    const optionTotal = optionItemsTotal(item?.option_items || []);
    const ingredientDiff = Number(item?.ingredient_price_diff || 0);
    const baseUnit = baseProductUnit + optionTotal + ingredientDiff;
    return { baseProductUnit, optionTotal, ingredientDiff, baseUnit };
  }

  function computeNonAutoTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      if (Number(item?.auto_add || 0) === 1) return sum;
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const { baseUnit } = getItemUnitParts(item);
      const unitPrice = roundPrice(baseUnit);
      const lineTotal = roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

  function computeAutoEligibleTotal(items) {
    return (Array.isArray(items) ? items : []).reduce((sum, item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return sum;
      const isAuto = Number(item?.auto_add || 0) === 1;
      if (!isAuto) {
        const parts = getItemUnitParts(item);
        const unitPrice = roundPrice(parts.baseUnit);
        const lineTotal = roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      const rule = getAutoRuleByProductId(item?.product?.id || item?.product_id);
      const parts = getItemUnitParts(item);
      if (!rule) {
        const unitPrice = roundPrice(parts.baseUnit);
        const lineTotal = roundPrice(unitPrice * qty);
        return sum + lineTotal;
      }
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      const unitPrice = roundPrice(priceOverride + parts.optionTotal + parts.ingredientDiff);
      const lineTotal = roundPrice(unitPrice * qty);
      return sum + lineTotal;
    }, 0);
  }

  function computeItemPricing(item, totals) {
    const qty = Math.max(0, Number(item?.qty || 0));
    const rule = getAutoRuleByProductId(item?.product?.id || item?.product_id);
    const isAuto = Number(item?.auto_add || 0) === 1;
    const parts = getItemUnitParts(item);
    let unitPrice = parts.baseUnit;
    let paidQty = qty;
    let freeQty = 0;
    let isAutoItem = false;
    let discountAmount = 0;
    let discountInfo = null;

    if (rule && isAuto) {
      const group = rule.group || null;
      const nonAutoTotal = totals?.nonAutoTotal ?? 0;
      const autoEligibleTotal = totals?.autoEligibleTotal ?? nonAutoTotal;
      const baseTotal = group && Number(group.include_auto_in_total || 0) === 1 ? autoEligibleTotal : nonAutoTotal;
      // ????????В корзине пусто?????????: ???? ? ??????? ?? ?????? ???? (null/0) ? ????? ???? ??????
      const priceOverride = (rule.price_override != null && Number(rule.price_override) > 0)
        ? Number(rule.price_override)
        : parts.baseProductUnit;
      unitPrice = priceOverride + parts.optionTotal + parts.ingredientDiff;
      freeQty = calcAutoFreeQty(rule, baseTotal);
      paidQty = Math.max(0, qty - freeQty);
      isAutoItem = true;
    }

    unitPrice = roundPrice(unitPrice);
    let lineTotal = roundPrice(unitPrice * paidQty);

    function calculateProductDiscountAmount(price, discount) {
      const srcPrice = Number(price || 0);
      if (!(srcPrice > 0) || !discount) return 0;

      const discType = String(discount.discount_type || "").trim();
      const discValue = Number(discount.discount_value || 0);
      if (!(discValue > 0)) return 0;

      let amount = 0;
      if (discType === "percent") {
        amount = srcPrice * (discValue / 100);
      } else if (discType === "fixed") {
        amount = discValue;
      } else if (discType === "special_price") {
        amount = Math.max(0, srcPrice - discValue);
      } else {
        return 0;
      }

      const maxDiscountAmount = Number(discount.max_discount_amount);
      if (Number.isFinite(maxDiscountAmount) && maxDiscountAmount > 0 && amount > maxDiscountAmount) {
        amount = maxDiscountAmount;
      }
      if (amount > srcPrice) amount = srcPrice;
      return Math.round(amount * 100) / 100;
    }

    // Применяем скидку если есть
    const product = item?.product;
    const buyXGetYRule = !isAutoItem ? getCatalogBuyXGetYRule(product) : null;
    const buyXGetYApplication = calculateCatalogBuyXGetYApplication(paidQty, buyXGetYRule);
    const buyXGetYFreeQty = buyXGetYApplication.freeQty;
    let benefitsExcludedLineTotal = 0;
    if (buyXGetYFreeQty > 0) {
      const buyXGetYDiscountAmount = roundPrice(unitPrice * buyXGetYFreeQty);
      if (buyXGetYDiscountAmount > 0) {
        discountAmount = roundPrice(discountAmount + buyXGetYDiscountAmount);
        discountInfo = {
          id: buyXGetYRule.id,
          title: buyXGetYRule.title,
          discount_type: "buy_x_get_y",
          discount_value: buyXGetYRule.rewardQty,
          discount_amount: buyXGetYDiscountAmount,
        };
        lineTotal = roundPrice(Math.max(0, lineTotal - buyXGetYDiscountAmount));
      }
      if (buyXGetYRule && !buyXGetYRule.isStackable) {
        benefitsExcludedLineTotal = roundPrice(unitPrice * Math.max(0, Number(buyXGetYApplication.paidParticipatingQty || 0)));
      }
    }
    if (product?.discount && product.discount.discount_amount > 0 && !isAutoItem) {
      discountInfo = discountInfo || product.discount;
      // Рассчитываем скидку на lineTotal
      const simpleDiscountBase = benefitsExcludedLineTotal > 0
        ? roundPrice(unitPrice * Math.max(0, paidQty - Number(buyXGetYApplication.participatingQty || 0)))
        : lineTotal;
      const simpleDiscountAmount = calculateProductDiscountAmount(simpleDiscountBase, product.discount);
      discountAmount = roundPrice(discountAmount + simpleDiscountAmount);
      lineTotal = roundPrice(lineTotal - simpleDiscountAmount);
    }

    benefitsExcludedLineTotal = roundPrice(Math.min(lineTotal, Math.max(0, benefitsExcludedLineTotal)));
    return { lineTotal, unitPrice, paidQty, freeQty, isAuto: isAutoItem, parts, discountAmount, discountInfo, benefitsExcludedLineTotal };
  }

  function computeCartTotals(items) {
    const nonAutoTotal = computeNonAutoTotal(items);
    const autoEligibleTotal = computeAutoEligibleTotal(items);
    let total = 0;
    let totalDiscount = 0;
    let totalBeforeDiscount = 0;
    
    (Array.isArray(items) ? items : []).forEach((item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return;
      
      if (item.type === "combo") {
        // Для комбо: unit_price_before_discount содержит сумму до скидки комбо
        const unitPrice = Number(item.unit_price_override || 0);
        const unitPriceOld = Number(item.unit_price_before_discount || 0) || unitPrice;
        const lineTotal = roundPrice(unitPrice * qty);
        total += lineTotal;
        totalBeforeDiscount += roundPrice(unitPriceOld * qty);
        // Скидка комбо = разница между старой и новой ценой
        if (unitPriceOld > unitPrice) {
          totalDiscount += roundPrice((unitPriceOld - unitPrice) * qty);
        }
      } else {
        const pricing = computeItemPricing(item, { nonAutoTotal, autoEligibleTotal });
        total += pricing.lineTotal;
        totalDiscount += pricing.discountAmount || 0;
        
        // Рассчитываем оригинальную цену до всех скидок
        const product = item?.product;
        const parts = pricing.parts || {};
        
        // Приоритет: original_price (API) > old_price (админка) > unitPrice
        let originalUnit = pricing.unitPrice;
        if (product?.original_price && Number(product.original_price) > 0) {
          // Цена до API-скидки + опции + ингредиенты
          originalUnit = roundPrice(Number(product.original_price) + (parts.optionTotal || 0) + (parts.ingredientDiff || 0));
        } else if (product?.old_price && Number(product.old_price) > pricing.unitPrice) {
          // Старая цена из админки + опции + ингредиенты
          originalUnit = roundPrice(Number(product.old_price) + (parts.optionTotal || 0) + (parts.ingredientDiff || 0));
        }
        
        // Для auto_add товаров учитываем только платные позиции.
        // Важно: 0 (полностью бесплатные позиции) должен оставаться 0, без fallback на qty.
        const paidQty = Number.isFinite(Number(pricing.paidQty))
          ? Math.max(0, Number(pricing.paidQty))
          : qty;
        totalBeforeDiscount += roundPrice(originalUnit * paidQty);
        
        // Если old_price > текущей цены и нет API-скидки, добавляем эту разницу к totalDiscount
        if (!pricing.discountAmount && product?.old_price && Number(product.old_price) > pricing.unitPrice) {
          const oldPriceDiff = roundPrice((Number(product.old_price) - pricing.unitPrice + (parts.optionTotal || 0) + (parts.ingredientDiff || 0)) * paidQty);
          // Уже учтено в totalBeforeDiscount, добавляем в totalDiscount
          totalDiscount += roundPrice((originalUnit - pricing.unitPrice) * paidQty);
        }
      }
    });
    
    return { nonAutoTotal, autoEligibleTotal, total, totalDiscount, totalBeforeDiscount };
  }

  function cartLinePrice(product, optionItems) {
    return Number(product?.price || 0) + optionItemsTotal(optionItems);
  }

  function formatOptionTitles(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items.map((opt) => str(opt.title || opt.name || "")).filter(Boolean).join(", ");
  }

  // ?????????????? ????????: ????????? ???????? ? ???????? ?????? ?? variant_label
  function formatVariant(variantLabel) {
    if (!variantLabel || !variantLabel.trim()) return null;
    // variant_label ????? ?????? "???????? ??????: ????????" (???????? "???????: 1 ??" ??? "????: 200?")
    const parts = variantLabel.split(":");
    if (parts.length >= 2) {
      const groupTitle = parts[0].trim();
      const value = parts.slice(1).join(":").trim();
      if (!value) return null;
      return `${value} ${groupTitle}`;
    }
    // ???? ?????? ???????????, ?????????? ??? ????
    return variantLabel.trim();
  }

  // ?????????????? ???????????: ????????????????? ???????? (??????? ? 0 ?? ??????????)
  function formatIngredient(ing) {
    const name = str(ing.ingredient_name || "");
    if (!name) return null;
    const qty = Number(ing.quantity ?? ing.qty ?? 1);
    if (qty <= 0) return null;
    const unit = str(ing.unit_label || "");
    // ??????: ????????????????? ???????? (???????? "150? ???????????? ????")
    return `${qty}${unit} ${name}`.trim();
  }

  // ?????????????? ?????: ????????????????? ????????
  function formatOption(opt) {
    const name = str(opt.title || opt.name || "");
    if (!name) return null;
    
    // ???? ? ????? ???? ??????? (variant_label), ?????????? ??? ?????? ?????????? "??"
    const variantLabel = str(opt.variant_label || "").trim();
    if (variantLabel) {
      // variant_label ??? ???????? ???????? ? ???????? (???????? "200?")
      return `${variantLabel} ${name}`;
    }
    
    // ???? ???????? ???, ?????????? ??????????? ?????? ? ???????????
    const optQty = Math.max(1, Number(opt.qty || 1));
    // ??? ????В корзине пусто? "??", ?? ????? ???? ? ????????
    // ??????: ????????????????? ???????? (???????? "1?? ???????????? ????")
    return `${optQty}шт ${name}`;
  }

  function mergeVariantUnitForOrder(labelRaw, unitRaw) {
    const cleanLabel = str(labelRaw || "").trim();
    const cleanUnit = str(unitRaw || "").trim();
    if (!cleanLabel) return cleanUnit;
    if (!cleanUnit) return cleanLabel;
    const escapedUnit = cleanUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const measureMatch = cleanLabel.match(new RegExp(`^\\s*([\\d.,]+\\s*${escapedUnit})(?:\\b|\\s|$)`, "i"));
    if (measureMatch && str(measureMatch[1] || "").trim()) {
      return str(measureMatch[1] || "").trim();
    }
    const labelLower = cleanLabel.toLowerCase();
    const unitLower = cleanUnit.toLowerCase();
    if (labelLower.endsWith(` ${unitLower}`) || labelLower === unitLower) return cleanLabel;
    return `${cleanLabel} ${cleanUnit}`.trim();
  }

  function extractVariantValueForOrder(labelRaw, groupTitleRaw) {
    const rawLabel = str(labelRaw || "").trim();
    if (!rawLabel) return "";

    const groupTitle = str(groupTitleRaw || "").trim();
    let value = rawLabel;
    if (groupTitle) {
      const escapedGroupTitle = groupTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      value = value.replace(new RegExp(`^${escapedGroupTitle}(?:\\s*\\([^)]*\\))?\\s*:\\s*`, "i"), "").trim();
    }
    if (!value) value = rawLabel;

    if (value.includes(":")) {
      const right = str(value.split(":").slice(1).join(":")).trim();
      if (right) value = right;
    }
    return value.trim();
  }

  function isDefaultVariantLabelForOrder(valueRaw) {
    const value = str(valueRaw || "").trim().toLowerCase();
    return value === "не указано" || value === "не указано:";
  }

  function normalizeVariantDisplayLineForOrder(lineRaw, groupTitleRaw) {
    let line = str(lineRaw || "").trim();
    if (!line) return "";

    const groupTitle = str(groupTitleRaw || "").trim();
    if (groupTitle) {
      const escapedGroupTitle = groupTitle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      line = line.replace(new RegExp(`\\s+${escapedGroupTitle}(?:\\s*\\([^)]*\\))?\\s*$`, "i"), "").trim();
    }

    if (!line) return "";
    const compactMatch = line.match(/^([\d.,]+\s+[^\s()]+)\s+.+$/);
    if (compactMatch && (groupTitle || line.includes("("))) {
      return str(compactMatch[1] || "").trim();
    }
    return line;
  }

  function buildVariantDisplayLineForOrder(labelRaw, unitRaw, groupTitleRaw) {
    const variantValue = extractVariantValueForOrder(labelRaw, groupTitleRaw);
    let line = mergeVariantUnitForOrder(variantValue, unitRaw);
    line = normalizeVariantDisplayLineForOrder(line, groupTitleRaw);
    if (!line) return "";
    if (isDefaultVariantLabelForOrder(line)) return "";
    return line;
  }

  window.extractVariantValueForOrder = extractVariantValueForOrder;
  window.buildVariantDisplayLineForOrder = buildVariantDisplayLineForOrder;

  function formatQtyUnitNameForOrder(qtyRaw, unitRaw, nameRaw) {
    const qtyNum = Number(qtyRaw);
    const qtyText = Number.isFinite(qtyNum)
      ? String(Number.isInteger(qtyNum) ? qtyNum : Number(qtyNum.toFixed(3)))
      : str(qtyRaw ?? "").trim();
    const unitText = str(unitRaw || "").trim();
    const nameText = str(nameRaw || "").trim();
    return [qtyText, unitText, nameText].filter(Boolean).join(" ").trim();
  }

  function formatIngredientLineForOrder(ing) {
    const rawQty = ing?.qty ?? ing?.quantity;
    const numQty = Number(rawQty);
    if (!Number.isFinite(numQty) || numQty <= 0) return "";
    const unitText = str(
      ing?.unit ||
      ing?.unit_label ||
      ing?.unitLabel ||
      ing?.unit_short_title ||
      ing?.unit_title ||
      ""
    ).trim();
    const nameText = str(ing?.name || ing?.ingredient_name || ing?.ingredientName || "").trim();
    return formatQtyUnitNameForOrder(rawQty, unitText, nameText);
  }

  function formatOptionLineForOrder(opt) {
    const qtyText = Math.max(1, Number(opt?.qty || opt?.quantity || 1));
    const title = str(opt?.title || opt?.name || "").trim();
    if (!title) return "";
    const variantLine = buildVariantDisplayLineForOrder(
      opt?.variant_label || opt?.variantLabel,
      opt?.variant_unit || opt?.variantUnit,
      opt?.variant_group_title || opt?.group_title || ""
    );
    return variantLine ? `${variantLine} ${title}`.trim() : `${qtyText} ${title}`.trim();
  }

  // ?????????????? ?????? ?????? - ???????? ? ?????????? ??????? ??? ????????????? ? bottom sheet
  function normalizeFavoriteOptionItemsFromCart(optionItems) {
    const items = Array.isArray(optionItems) ? optionItems : [];
    return items
      .map((opt) => {
        const id = Number(opt?.id || 0);
        if (!Number.isFinite(id) || id <= 0) return null;
        const qty = Math.max(1, Number(opt?.qty ?? opt?.quantity ?? 1));
        const targetProductId = toFiniteNumberOrNull(opt?.target_product_id ?? opt?.product_id);
        return {
          id,
          title: str(opt?.title || opt?.name || ""),
          name: str(opt?.name || opt?.title || ""),
          price: Number(opt?.price || 0),
          qty,
          quantity: qty,
          target_product_id: targetProductId,
          product_id: targetProductId,
          variant_group_id: toFiniteNumberOrNull(opt?.variant_group_id),
          variant_value_index: toFiniteNumberOrNull(opt?.variant_value_index),
          variant_label: str(opt?.variant_label || ""),
          variant_group_title: str(opt?.variant_group_title || opt?.group_title || ""),
          variant_unit: str(opt?.variant_unit || opt?.unit || ""),
          unit_id: toFiniteNumberOrNull(opt?.unit_id),
          variant_price_diff: Number(opt?.variant_price_diff || 0),
        };
      })
      .filter(Boolean);
  }

  function normalizeFavoriteIngredientsFromCart(ingredients) {
    const list = Array.isArray(ingredients) ? ingredients : [];
    return list
      .map((ing) => {
        const ingredientId = Number(ing?.ingredient_id || 0);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
        const quantityRaw = Number(ing?.quantity ?? ing?.qty ?? 0);
        const quantity = Number.isFinite(quantityRaw) ? quantityRaw : 0;
        return {
          ingredient_id: ingredientId,
          ingredient_name: str(ing?.ingredient_name || ing?.name || ""),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity,
          qty: quantity,
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit_label: str(ing?.unit_label || ing?.unit || ""),
          unit: str(ing?.unit || ing?.unit_label || ""),
        };
      })
      .filter(Boolean);
  }

  function buildFavoriteSnapshotFromResolvedItem(resolvedItem, { pricing = null, oldLineTotal = null } = {}) {
    if (!resolvedItem || typeof resolvedItem !== "object") return null;

    if (String(resolvedItem.type || "") === "combo") {
      const comboId = Number(resolvedItem.combo_id || 0);
      if (!Number.isFinite(comboId) || comboId <= 0) return null;
      const qty = Math.max(1, Number(resolvedItem.qty || 1));
      const unitPrice = Number(resolvedItem.unit_price_override || 0);
      const lineTotal = roundPrice(unitPrice * qty);
      const oldLine = oldLineTotal != null
        ? roundPrice(Number(oldLineTotal || 0))
        : roundPrice((Number(resolvedItem.unit_price_before_discount || 0) || unitPrice) * qty);
      const selections = (Array.isArray(resolvedItem.selections) ? resolvedItem.selections : []).map((sel) => ({
        product_id: toFiniteNumberOrNull(sel?.product_id),
        product_name: str(sel?.product_name || ""),
        product_photo: str(sel?.product_photo || ""),
        variant_label: str(sel?.variant_label || ""),
        variant_group_id: toFiniteNumberOrNull(sel?.variant_group_id),
        variant_value_index: toFiniteNumberOrNull(sel?.variant_value_index),
        variant_group_title: str(sel?.variant_group_title || ""),
        variant_unit: str(sel?.variant_unit || ""),
        unit_id: toFiniteNumberOrNull(sel?.unit_id),
        unit_price_override: sel?.unit_price_override != null ? Number(sel.unit_price_override) : null,
        unit_price_before_discount: sel?.unit_price_before_discount != null ? Number(sel.unit_price_before_discount) : null,
        ingredients_display: (Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : []).map((ing) => ({
          ingredient_id: toFiniteNumberOrNull(ing?.ingredient_id),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity: Number(ing?.quantity ?? ing?.qty ?? 0),
          qty: Number(ing?.qty ?? ing?.quantity ?? 0),
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit: str(ing?.unit || ing?.unit_label || ""),
        })),
      }));
      const photos = selections.map((sel) => str(sel.product_photo || "")).filter(Boolean);

      return {
        type: "combo",
        combo_id: comboId,
        combo_title: str(resolvedItem.combo_title || "Комбо"),
        name: str(resolvedItem.combo_title || resolvedItem.name || "Комбо"),
        qty,
        price: Number(unitPrice || 0),
        line_total: Number(lineTotal || 0),
        old_line_total: oldLine > lineTotal ? Number(oldLine) : 0,
        unit_price_before_discount: Number(resolvedItem.unit_price_before_discount || 0),
        photos,
        selections,
      };
    }

    const product = resolvedItem.product || null;
    const productId = Number(resolvedItem.product_id || product?.id || 0);
    if (!Number.isFinite(productId) || productId <= 0) return null;
    const qty = Math.max(1, Number(resolvedItem.qty || 1));
    const selectedOptionItems = normalizeFavoriteOptionItemsFromCart(
      Array.isArray(resolvedItem.option_items) ? resolvedItem.option_items : []
    );
    const ingredients = normalizeFavoriteIngredientsFromCart(
      Array.isArray(resolvedItem.ingredients) ? resolvedItem.ingredients : []
    );
    const variantGroupId = toFiniteNumberOrNull(resolvedItem.variant_group_id);
    const variantValueIndex = toFiniteNumberOrNull(resolvedItem.variant_value_index);
    const variantGroupTitle = str(
      resolvedItem.variant_group_title ||
      resolvedItem?.variant?.group_title ||
      resolvedItem?.variant?.variant_group_title ||
      ""
    ).trim();
    const variantUnit = str(
      resolvedItem.variant_unit ||
      resolvedItem?.variant?.unit ||
      resolvedItem?.variant?.unit_label ||
      ""
    ).trim();
    const variantLabel = extractVariantValueForOrder(
      resolvedItem.variant_label || resolvedItem?.variant?.label || resolvedItem?.variant?.value || "",
      variantGroupTitle
    );
    const hasVariant = variantLabel || (variantGroupId != null && variantValueIndex != null);
    const variantDiff = Number(resolvedItem.variant_unit_price || 0) - Number(product?.price || 0);

    let pricingData = pricing;
    if (!pricingData) {
      const resolvedItems = cartItemsResolved();
      const totals = {
        nonAutoTotal: computeNonAutoTotal(resolvedItems),
        autoEligibleTotal: computeAutoEligibleTotal(resolvedItems),
      };
      pricingData = computeItemPricing(
        {
          product,
          qty,
          option_items: selectedOptionItems,
          ingredients,
          ingredient_price_diff: Number(resolvedItem.ingredient_price_diff || 0),
          variant_label: variantLabel,
          variant_unit_price: Number(resolvedItem.variant_unit_price || 0),
          unit_price_override:
            resolvedItem.unit_price_override != null
              ? Number(resolvedItem.unit_price_override)
              : null,
          auto_add: Number(resolvedItem.auto_add || 0),
          auto_add_group_id: toFiniteNumberOrNull(resolvedItem.auto_add_group_id),
        },
        totals
      );
    }

    const lineTotal = roundPrice(Number(pricingData?.lineTotal || 0));
    const unitPrice = roundPrice(Number(pricingData?.unitPrice || (qty > 0 ? lineTotal / qty : 0)));
    const oldLineFromArg = oldLineTotal != null ? roundPrice(Number(oldLineTotal || 0)) : 0;
    const oldPricePerUnit = Number(product?.old_price || 0);
    const oldLineFromProduct = oldPricePerUnit > 0 ? roundPrice(oldPricePerUnit * qty) : 0;
    const originalLineTotal = oldLineFromArg > 0 ? oldLineFromArg : oldLineFromProduct;
    const showOldLine = originalLineTotal > lineTotal;

    const variantEntries = hasVariant
      ? [{
        variant_group_id: variantGroupId,
        variant_value_index: variantValueIndex,
        group_title: variantGroupTitle,
        variant_group_title: variantGroupTitle,
        value: variantLabel,
        label: variantLabel,
        unit: variantUnit,
        price_diff: Number.isFinite(variantDiff) ? variantDiff : 0,
      }]
      : [];

    return {
      type: "product",
      product_id: productId,
      name: str(product?.name || resolvedItem.name || "Товар"),
      qty,
      price: Number(unitPrice || 0),
      old_price: showOldLine ? roundPrice(originalLineTotal / qty) : Number(oldPricePerUnit || 0),
      line_total: Number(lineTotal || 0),
      photos: safePhotos(product),
      option_item_ids: selectedOptionItems.map((opt) => Number(opt.id)),
      options: selectedOptionItems,
      option_items: selectedOptionItems,
      ingredients,
      variant_group_id: variantGroupId,
      variant_value_index: variantValueIndex,
      variant_label: variantLabel,
      variant_group_title: variantGroupTitle,
      variant_unit: variantUnit,
      variant_unit_price: Number(resolvedItem.variant_unit_price || 0),
      variants: variantEntries,
      discount: showOldLine ? { original_line_total: Number(originalLineTotal) } : null,
    };
  }

  window.formatOrderItem = function formatOrderItem(item) {
    if (item.type === "combo") {
      const selections = Array.isArray(item.selections) ? item.selections : [];
      const selectionPhotos = selections
        .map((sel) => str(sel?.product_photo || "").trim())
        .filter(Boolean);
      const fallbackPhotos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
      const photos = (selectionPhotos.length ? selectionPhotos : fallbackPhotos).slice(0, 4);
      const comboGridOrder = [0, 2, 3, 1];
      const itemQty = Math.max(1, Number(item.qty || item.quantity || 1));
      const comboTitle = str(item.name || item.combo_title || "Комбо").trim() || "Комбо";

      let html = `<div class="cart-row cart-row--combo">`;
      html += `<div class="cart-combo-thumb">`;
      for (let i = 0; i < 4; i += 1) {
        const photo = photos[comboGridOrder[i]] || "";
        const cellClass = `cart-combo-thumb__cell${photo ? "" : " cart-combo-thumb__cell--empty"}`;
        html += `<div class="${cellClass}">`;
        if (photo) {
          html += `<img class="cart-thumb" src="${escapeHtml(photo)}" alt="" />`;
        }
        html += `</div>`;
      }
      html += `</div>`;

      html += `<div class="cart-mid">`;
      html += `<div class="cart-title">${itemQty} x ${escapeHtml(comboTitle)}</div>`;
      if (selections.length) {
        html += `<div class="cart-sub-container cart-combo-details" style="margin-top: 4px; padding-left: 8px;">`;
        selections.forEach((sel) => {
          const productName = str(sel?.product_name || "").trim();
          const variantLine = buildVariantDisplayLineForOrder(
            sel?.variant_label,
            sel?.variant_unit,
            sel?.variant_group_title
          );
          const primaryLine = [variantLine, productName].filter(Boolean).join(" ").trim() || (productName || "Товар");

          html += `<div class="cart-combo-detail-block">`;
          html += `<div class="cart-combo-detail-name" style="font-weight: 600;">1 x ${escapeHtml(primaryLine)}</div>`;

          const ingredientsDisplay = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
          ingredientsDisplay.forEach((ing) => {
            const line = formatIngredientLineForOrder(ing);
            if (!line) return;
            html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">&bull; ${escapeHtml(line)}</div>`;
          });

          html += `</div>`;
        });
        html += `</div>`;
      }
      html += `</div>`;

      const comboLineTotalRaw = Number(item.line_total);
      const comboLineTotal = Number.isFinite(comboLineTotalRaw)
        ? comboLineTotalRaw
        : Number(item.price || 0);
      const comboOldLineTotal = Number(item.old_line_total || 0);
      const comboShowOld = comboOldLineTotal > comboLineTotal;
      const comboPriceHtml = comboShowOld
        ? `<span class="cart-old">${money(comboOldLineTotal)}</span>${money(comboLineTotal)}`
        : money(comboLineTotal);
      html += `<div class="cart-right"><div class="cart-price">${comboPriceHtml}</div></div>`;
      html += `</div>`;
      return html;
    }

    const photos = Array.isArray(item.photos) ? item.photos.filter(Boolean) : [];
    const mainPhoto = photos[0] || "/static/img/placeholder.png";
    const itemQty = Math.max(1, Number(item.qty || item.quantity || 1));
    const productName = str(item.name || "Товар").trim() || "Товар";

    const variantLines = [];
    const variants = Array.isArray(item.variants) ? item.variants : [];
    variants.forEach((v) => {
      const line = buildVariantDisplayLineForOrder(
        v?.label || v?.value,
        v?.unit || v?.unit_short_title || v?.unitLabel || "",
        v?.group_title || ""
      );
      if (line) variantLines.push(line);
    });
    if (!variantLines.length) {
      const fallbackVariant = buildVariantDisplayLineForOrder(
        item?.variant_label,
        item?.variant_unit || item?.variantUnit || "",
        item?.variant_group_title || ""
      );
      if (fallbackVariant) variantLines.push(fallbackVariant);
    }

    const primaryVariantLine = variantLines.length ? variantLines[0] : "";
    const titleBase = [primaryVariantLine, productName].filter(Boolean).join(" ").trim() || productName;
    const titleText = Number(item?.is_gift_reward || 0) === 1 ? `${titleBase} (Подарок)` : titleBase;

    const detailLines = [];
    if (variantLines.length > 1) detailLines.push(...variantLines.slice(1));

    const ingredients = Array.isArray(item.ingredients) ? item.ingredients : [];
    ingredients.forEach((ing) => {
      const line = formatIngredientLineForOrder(ing);
      if (line) detailLines.push(line);
    });

    const options = Array.isArray(item.options) ? item.options : [];
    options.forEach((opt) => {
      if (Number(opt?.qty ?? opt?.quantity ?? 0) <= 0) return;
      const line = formatOptionLineForOrder(opt);
      if (line) detailLines.push(line);
    });

    let html = `<div class="cart-row">`;
    html += `<img class="cart-thumb" src="${escapeHtml(mainPhoto)}" alt="" />`;
    html += `<div class="cart-mid">`;
    html += `<div class="cart-title">${itemQty} x ${escapeHtml(titleText)}</div>`;

    if (detailLines.length > 0) {
      html += `<div class="cart-sub-container">`;
      html += `<div class="cart-sub-details" style="display: block; margin-top: 4px; padding-left: 8px;">`;
      detailLines.forEach((line) => {
        html += `<div class="cart-sub-detail-item" style="font-size: 0.9em; color: var(--color-text-muted, #666); margin-top: 2px;">&bull; ${escapeHtml(line)}</div>`;
      });
      html += `</div>`;
      html += `</div>`;
    }

    html += `</div>`;

    const itemLineTotalRaw = Number(item.line_total);
    const itemLineTotal = Number.isFinite(itemLineTotalRaw)
      ? itemLineTotalRaw
      : Number(item.price || 0);
    const discountOriginal = item.discount?.original_line_total;
    const itemOldPrice = Number(item.old_price || 0);
    const qtyForOldPrice = Number(item.qty || item.quantity || 1);
    const itemOldLineTotal = discountOriginal || (itemOldPrice > 0 ? itemOldPrice * qtyForOldPrice : 0);
    const itemShowOld = itemOldLineTotal > itemLineTotal;
    const itemPriceHtml = itemShowOld
      ? `<span class="cart-old">${money(itemOldLineTotal)}</span>${money(itemLineTotal)}`
      : money(itemLineTotal);
    html += `<div class="cart-right">`;
    html += `<div class="cart-price">${itemPriceHtml}</div>`;
    html += `</div>`;

    html += `</div>`;
    return html;
  };

  // -----------------------------
  // Cart warmup: ensure products for all cart items are in cache
  // (????? ??????? ?? ???????? ?В корзине пусто???? ?????????)
  // -----------------------------
  async function ensureProductForWarmup(pid) {
    const id = Number(pid);
    if (!Number.isFinite(id)) return null;
    if (state.productCache.has(id)) return state.productCache.get(id);

    if (typeof ensureProduct === "function") {
      return ensureProduct(id);
    }

    // Late bundle may not be loaded yet during first paint.
    try {
      await ensureShopLateLoaded();
    } catch {}

    if (typeof ensureProduct === "function") {
      return ensureProduct(id);
    }

    // Fallback to a direct fetch so warmup never throws on missing late API.
    const json = await apiJson(`/api/public/products/${id}`);
    const p = json.data;
    if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
    cacheStockFromProductPayload(p, "product_warmup");
    p.is_available = isProductAvailable(p);
    state.productCache.set(id, p);
    return p;
  }

  async function warmupCartProducts() {
    const missing = [];
    for (const item of state.cart) {
      const pid = Number(item.product_id);
      const qty = Number(item.qty || 0);
      if (!qty || !Number.isFinite(pid)) continue;
      if (!state.productCache.has(pid)) missing.push(pid);
    }
    if (!missing.length) return;

    try {
      await refreshProductsByIds(missing);
    } catch (e) {
      console.warn("warmupCartProducts: failed to load products", e);
    }
  }

  function mergeProductIntoCache(product, stockSource = "product_cache_merge") {
    if (!product || typeof product !== "object") return null;
    const pid = Number(product.id || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const current = state.productCache.get(pid);
    const merged = current && typeof current === "object"
      ? { ...current, ...product }
      : { ...product };
    if (!Array.isArray(merged.photos)) merged.photos = safePhotos(merged);
    cacheStockFromProductPayload(merged, stockSource);
    merged.is_available = isProductAvailable(merged);
    state.productCache.set(pid, merged);
    return merged;
  }

  function loadFavs() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? new Set(arr.map((x) => Number(x))) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveFavs(set) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)));
    } catch {}
  }

  const favoritesCacheState = {
    loaded: false,
    items: [],
    byId: new Map(),
  };

  function normalizeFavoriteApiRow(row) {
    if (!row || typeof row !== "object") return null;
    const id = Number(row.id || 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    const itemRaw = row.item && typeof row.item === "object"
      ? row.item
      : (row.item_json && typeof row.item_json === "object" ? row.item_json : null);
    if (!itemRaw || typeof itemRaw !== "object") return null;
    return {
      id,
      item_signature: str(row.item_signature || row.signature || ""),
      item_type: str(row.item_type || row.type || ""),
      product_id: toFiniteNumberOrNull(row.product_id),
      combo_id: toFiniteNumberOrNull(row.combo_id),
      title: str(row.title || ""),
      photo: str(row.photo || ""),
      item: itemRaw,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
    };
  }

  function setFavoritesCache(items) {
    const list = Array.isArray(items) ? items : [];
    favoritesCacheState.items = list.map(normalizeFavoriteApiRow).filter(Boolean);
    favoritesCacheState.byId = new Map(favoritesCacheState.items.map((fav) => [Number(fav.id), fav]));
    favoritesCacheState.loaded = true;
  }

  function resetFavoritesCache() {
    favoritesCacheState.loaded = false;
    favoritesCacheState.items = [];
    favoritesCacheState.byId = new Map();
  }

  function getCachedFavorites() {
    if (!favoritesCacheState.loaded) return [];
    return favoritesCacheState.items.slice();
  }

  async function fetchFavoritesList({ force = false } = {}) {
    const token = getCustomerToken();
    if (!token) {
      resetFavoritesCache();
      return [];
    }

    if (!force && favoritesCacheState.loaded) {
      return getCachedFavorites();
    }

    const json = await apiJson("/api/public/me/favorites");
    const rows = Array.isArray(json.data) ? json.data : [];
    setFavoritesCache(rows);
    return getCachedFavorites();
  }

  async function addFavoriteItemSnapshot(item) {
    const token = getCustomerToken();
    if (!token) {
      const err = new Error("UNAUTHORIZED");
      err.httpStatus = 401;
      throw err;
    }
    const json = await apiJson("/api/public/me/favorites", {
      method: "POST",
      body: { item },
    });
    const row = normalizeFavoriteApiRow(json?.data || null);
    if (row) {
      if (!favoritesCacheState.loaded) favoritesCacheState.loaded = true;
      const prevIdx = favoritesCacheState.items.findIndex((fav) => Number(fav.id) === Number(row.id));
      if (prevIdx >= 0) favoritesCacheState.items.splice(prevIdx, 1);
      favoritesCacheState.items.unshift(row);
      favoritesCacheState.byId.set(Number(row.id), row);
    }
    return row;
  }

  async function removeFavoriteById(favoriteId) {
    const id = Number(favoriteId || 0);
    if (!Number.isFinite(id) || id <= 0) return false;
    const token = getCustomerToken();
    if (!token) {
      const err = new Error("UNAUTHORIZED");
      err.httpStatus = 401;
      throw err;
    }
    await apiJson(`/api/public/me/favorites/${id}`, { method: "DELETE" });
    if (favoritesCacheState.loaded) {
      favoritesCacheState.items = favoritesCacheState.items.filter((fav) => Number(fav.id) !== id);
      favoritesCacheState.byId.delete(id);
    }
    return true;
  }

  function promptFavoritesLogin() {
    showToast("Войдите в профиль, чтобы использовать избранное");
    if (typeof openProfileSheet === "function") {
      try {
        openProfileSheet();
      } catch {}
    }
  }

  window.shopFavoritesApi = {
    list: fetchFavoritesList,
    add: addFavoriteItemSnapshot,
    remove: removeFavoriteById,
    clearCache: resetFavoritesCache,
    getCached: getCachedFavorites,
  };

  function loadCheckoutDraft() {
    try {
      const raw = localStorage.getItem(CHECKOUT_DRAFT_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : {};
    } catch {
      return {};
    }
  }

  function saveCheckoutDraft(draft) {
    const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
    const nextDraftRaw = draft && typeof draft === "object" ? { ...draft } : {};
    let nextDraft = nextDraftRaw;

    if (Object.keys(nextDraftRaw).length > 0) {
      const prevDraft = loadCheckoutDraft();
      nextDraft = { ...nextDraftRaw };

      const carryForward = (key) => {
        if (!hasOwn(nextDraft, key) && hasOwn(prevDraft, key)) {
          nextDraft[key] = prevDraft[key];
        }
      };

      const discountExplicitlyCleared = hasOwn(nextDraft, "selected_discount_id")
        && (nextDraft.selected_discount_id == null || String(nextDraft.selected_discount_id).trim() === "" || Number(nextDraft.selected_discount_id) === 0);

      if (discountExplicitlyCleared) {
        if (!hasOwn(nextDraft, "selected_discount_source")) {
          nextDraft.selected_discount_source = null;
        }
      } else {
        carryForward("selected_discount_id");
        carryForward("selected_discount_source");
      }

      const hasPromoCode = hasOwn(nextDraft, "promo_code");
      const promoCodeValue = hasPromoCode ? String(nextDraft.promo_code ?? "").trim() : "";
      const hasPromoRewardId = hasOwn(nextDraft, "selected_promo_reward_id");
      const hasPromoSource = hasOwn(nextDraft, "selected_promo_source");
      const promoSelectionExplicit = hasPromoSource || hasPromoRewardId;
      const promoRewardIdValue = hasPromoRewardId
        ? Number(nextDraft.selected_promo_reward_id || 0)
        : 0;
      const promoExplicitlyCleared = hasPromoCode
        && !promoCodeValue
        && promoSelectionExplicit
        && (!hasPromoRewardId || !(Number.isFinite(promoRewardIdValue) && promoRewardIdValue > 0));

      if (!promoSelectionExplicit) {
        carryForward("promo_code");
        carryForward("selected_promo_source");
        carryForward("selected_promo_reward_id");
        carryForward("benefits_selected_promo_mode");
      } else if (promoExplicitlyCleared) {
        if (!hasOwn(nextDraft, "selected_promo_source")) {
          nextDraft.selected_promo_source = null;
        }
        if (!hasOwn(nextDraft, "selected_promo_reward_id")) {
          nextDraft.selected_promo_reward_id = null;
        }
        if (!hasOwn(nextDraft, "benefits_selected_promo_mode")) {
          nextDraft.benefits_selected_promo_mode = null;
        }
      } else {
        carryForward("promo_code");
        carryForward("selected_promo_source");
        carryForward("selected_promo_reward_id");
        carryForward("benefits_selected_promo_mode");
      }

      carryForward("benefits_promo_input_value");
      carryForward("benefits_applied_snapshot");
    }

    try {
      localStorage.setItem(CHECKOUT_DRAFT_KEY, JSON.stringify(nextDraft));
    } catch {}
    if (typeof window.syncShopCartPricingSummaryUi === "function") {
      Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
    }
    if (typeof window.handleShopBenefitsOrderStateChange === "function") {
      window.handleShopBenefitsOrderStateChange("saveCheckoutDraft");
    }
  }


  // -----------------------------
  // Addresses (cart chip + form)
  // -----------------------------
  function loadAddressDraft() {
    try {
      const raw = localStorage.getItem(ADDRESS_DRAFT_KEY);
      const obj = raw ? JSON.parse(raw) : null;
      return obj && typeof obj === "object" ? obj : null;
    } catch {
      return null;
    }
  }

  function saveAddressDraft(addr) {
    try {
      if (!addr) {
        localStorage.removeItem(ADDRESS_DRAFT_KEY);
        return;
      }
      localStorage.setItem(ADDRESS_DRAFT_KEY, JSON.stringify(addr));
    } catch {}
  }

  function clearAddressDraft() {
    try { localStorage.removeItem(ADDRESS_DRAFT_KEY); } catch {}
  }

  function normalizeAddressCoordinate(value, axis = "lat") {
    const raw = str(value).trim();
    if (!raw) return null;
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return null;
    const limit = axis === "lat" ? 90 : 180;
    if (numeric < -limit || numeric > limit) return null;
    return Number(numeric.toFixed(7));
  }

  function normalizeAddressId(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    return Math.round(numeric);
  }

  function buildAddressLookupDisplay(address) {
    const source = address && typeof address === "object" ? address : {};
    const city = str(source.city).trim();
    const locality = str(source.address_context_locality || source.context_locality).trim();
    const street = str(source.street).trim();
    const house = str(source.house).trim();
    const normalized = str(source.address_normalized_display).trim();
    const base = [street, house].filter(Boolean).join(", ").trim() || normalized;
    if (!base) return "";
    if (!locality || locality.toLowerCase() === city.toLowerCase()) return base;
    if (base.toLowerCase().startsWith(locality.toLowerCase())) return base;
    return `${locality}, ${base}`;
  }

  function getAddressLookupItemType(item) {
    const rawType = str(item && (item.object_type || item.selected_object_type)).trim().toLowerCase();
    if (rawType === "street") return "street";
    if (rawType === "context-locality" || rawType === "place" || rawType === "context") return "context-locality";
    return "address";
  }

  function buildAddressLookupSelectionDisplay(item, cityValue = "") {
    const source = item && typeof item === "object" ? item : {};
    const itemType = getAddressLookupItemType(source);
    const city = str(cityValue || source.city_name).trim();
    const context = str(source.context_locality || source.city_name || city).trim();
    if (itemType === "context-locality") {
      return context ? `${context}, ` : "";
    }

    const street = str(source.street_name || source.value || source.label).trim();
    const house = str(source.house_number || source.house).trim();
    const display = buildAddressLookupDisplay({
      city,
      street,
      house: itemType === "address" ? house : "",
      address_context_locality: context,
      address_normalized_display: str(source.full_address || source.value || source.label).trim() || street,
    });
    if (itemType === "street" && display) {
      return `${display}, `.replace(/\s*,\s*$/, ", ");
    }
    return display;
  }

  function buildAddressLookupSuggestionTitle(item, cityValue = "") {
    const source = item && typeof item === "object" ? item : {};
    const itemType = getAddressLookupItemType(source);
    if (itemType === "context-locality") {
      return str(source.context_locality || source.city_name || source.value || source.label).trim();
    }
    if (itemType === "street") {
      return str(source.street_name || source.value || source.label).trim();
    }
    return buildAddressLookupDisplay({
      city: str(cityValue || source.city_name).trim(),
      street: str(source.street_name || source.value || source.label).trim(),
      house: str(source.house_number || source.house).trim(),
      address_context_locality: str(source.context_locality || source.city_name).trim(),
      address_normalized_display: str(source.full_address || source.value || source.label).trim(),
    }) || str(source.full_address || source.value || source.label).trim();
  }

  function buildAddressLookupIntermediateState(item, cityValue = "", currentResolved = null) {
    const source = item && typeof item === "object" ? item : {};
    const current = currentResolved && typeof currentResolved === "object" ? currentResolved : {};
    const display = buildAddressLookupSelectionDisplay(source, cityValue);
    return {
      address_ref: str(source.source_key || source.selected_source_key).trim() || null,
      selected_object_type: getAddressLookupItemType(source),
      resolved_city_source_key: str(current.resolved_city_source_key || source.locality_source_key).trim() || null,
      address_context_locality: str(source.context_locality || source.city_name).trim() || null,
      address_normalized_display: display || null,
      lat: null,
      lng: null,
      delivery_zone_id: null,
      delivery_store_id: null,
      _lookup_prefix: display || null,
    };
  }

  function shouldPreserveAddressLookupResolution(resolvedState, nextValue) {
    const resolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const selectedType = str(resolved.selected_object_type).trim().toLowerCase();
    if (selectedType !== "street" && selectedType !== "context-locality") return false;
    const lookupValue = str(nextValue).trim().toLowerCase();
    const prefix = str(resolved._lookup_prefix || resolved.address_normalized_display).trim().toLowerCase();
    if (!lookupValue || !prefix) return false;
    return lookupValue === prefix || lookupValue.startsWith(prefix);
  }

  function extractResolvedAddressState(source) {
    const address = source && typeof source === "object" ? source : {};
    return {
      address_ref: str(address.address_ref).trim() || null,
      selected_object_type: str(address.selected_object_type).trim() || null,
      resolved_city_source_key: str(address.resolved_city_source_key).trim() || null,
      address_context_locality: str(address.address_context_locality || address.context_locality).trim() || null,
      address_normalized_display: str(address.address_normalized_display).trim() || buildAddressLookupDisplay(address) || null,
      lat: normalizeAddressCoordinate(address.lat, "lat"),
      lng: normalizeAddressCoordinate(address.lng, "lng"),
      delivery_zone_id: normalizeAddressId(address.delivery_zone_id),
      delivery_store_id: normalizeAddressId(address.delivery_store_id),
    };
  }

  function resetAddressFormResolvedState(source = null) {
    state._addressFormResolved = extractResolvedAddressState(source);
  }

  function clearAddressFormResolution({ syncLookupFromFields = true, clearLookup = false } = {}) {
    const current = state._addressFormResolved || {};
    state._addressFormResolved = {
      address_ref: null,
      selected_object_type: null,
      resolved_city_source_key: current.resolved_city_source_key || null,
      address_context_locality: null,
      address_normalized_display: null,
      lat: null,
      lng: null,
      delivery_zone_id: null,
      delivery_store_id: null,
    };
    if (elAddrLookup) {
      if (clearLookup) {
        elAddrLookup.value = "";
      } else if (syncLookupFromFields) {
        elAddrLookup.value = buildAddressLookupDisplay({
          city: elAddrCity?.dataset?.value || "",
          street: elAddrStreet?.value || "",
          house: elAddrHouse?.value || "",
          address_context_locality: "",
        });
      }
    }
  }

  function syncAddressFormMapLayout(enabled) {
    const isMapMode = Boolean(enabled);
    if (elAddrStreetWrap) {
      elAddrStreetWrap.classList.toggle("hidden", isMapMode);
    }
    if (elAddrHouseWrap) {
      elAddrHouseWrap.classList.toggle("hidden", isMapMode);
    }
    if (elAddrDetailsRow) {
      elAddrDetailsRow.classList.toggle("shop-address-form-row--map-details", isMapMode);
    }
  }

  function syncAddressLookupResolutionFromInputValue(value) {
    if (shouldPreserveAddressLookupResolution(state._addressFormResolved, value)) {
      state._addressFormResolved = {
        ...(state._addressFormResolved || {}),
        address_normalized_display: str(value).trim() || null,
        lat: null,
        lng: null,
        delivery_zone_id: null,
        delivery_store_id: null,
      };
      return;
    }
    clearAddressFormResolution({ syncLookupFromFields: false });
  }

  function isCurrentAddressLookupValue(value, resolvedState = null) {
    const normalizedValue = normalizeAddressLookupText(value).toLowerCase();
    if (!normalizedValue) return false;

    const resolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const normalizedResolved = normalizeAddressLookupText(str(resolved.address_normalized_display).trim()).toLowerCase();
    if (!normalizedResolved || normalizedValue !== normalizedResolved) return false;

    const selectedType = str(resolved.selected_object_type).trim().toLowerCase();
    return (
      selectedType === "address"
      || !!str(resolved.address_ref).trim()
      || resolved.lat != null
      || resolved.lng != null
      || !!resolved.delivery_zone_id
      || !!resolved.delivery_store_id
    );
  }

  function buildCurrentAddressLookupSuggestion(value, resolvedState = null, cityValue = "") {
    const resolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    if (!isCurrentAddressLookupValue(value, resolved)) return null;

    const display = normalizeAddressLookupText(value);
    if (!display) return null;

    const parsed = parseAddressStreetHouseFromLookup(display);
    return {
      __current_address_hint: true,
      object_type: "address",
      selected_object_type: "address",
      source_key: str(resolved.address_ref).trim(),
      city_name: str(cityValue).trim(),
      context_locality: str(resolved.address_context_locality).trim(),
      street_name: str(parsed.street).trim(),
      house_number: str(parsed.house).trim(),
      value: display,
      label: display,
      full_address: display,
      address_normalized_display: display,
      lat: resolved.lat == null ? null : Number(resolved.lat),
      lng: resolved.lng == null ? null : Number(resolved.lng),
    };
  }

  function showCurrentAddressLookupSuggestion() {
    if (!isAddressMapModeEnabled() || !elAddrLookup) return false;

    const hintItem = buildCurrentAddressLookupSuggestion(
      elAddrLookup.value,
      state._addressFormResolved,
      getAddressLookupCityValue()
    );
    if (!hintItem) return false;

    clearAddressLookupDebounce();
    addressLookupState.requestSeq += 1;
    setAddressLookupItems([hintItem]);
    setAddressLookupStatus("", "ready");
    return true;
  }

  function buildManualAddressLookupSuggestion(value, cityValue = "", resolvedState = null) {
    const display = normalizeAddressLookupText(value);
    if (!display) return null;

    const parsed = parseAddressStreetHouseFromLookup(display);
    const street = str(parsed.street).trim();
    const house = str(parsed.house).trim();
    if (!street || !house) return null;

    const resolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const city = str(cityValue).trim();
    const contextLocality = str(resolved.address_context_locality || city).trim() || city;
    return {
      __manual_address_hint: true,
      object_type: "manual",
      selected_object_type: "manual",
      source_key: "",
      city_name: city,
      context_locality: contextLocality,
      street_name: street,
      house_number: house,
      value: display,
      label: display,
      full_address: display,
      address_normalized_display: display,
      lat: null,
      lng: null,
    };
  }

  function appendManualAddressLookupSuggestion(items, value, cityValue = "", resolvedState = null) {
    const baseItems = Array.isArray(items) ? items.slice() : [];
    const manualItem = buildManualAddressLookupSuggestion(value, cityValue, resolvedState);
    if (!manualItem) return baseItems;

    const manualDisplay = normalizeAddressLookupText(
      str(manualItem.full_address || manualItem.value || "").trim()
    ).toLowerCase();
    if (!manualDisplay) return baseItems;

    const hasSameAddress = baseItems.some((item) => {
      if (item && item.__manual_address_hint === true) return true;
      if (getAddressLookupItemType(item) !== "address") return false;
      const itemDisplay = normalizeAddressLookupText(buildAddressLookupDisplay({
        city: str(cityValue || item.city_name).trim(),
        street: str(item.street_name || item.value || item.label).trim(),
        house: str(item.house_number || item.house).trim(),
        address_context_locality: str(item.context_locality || item.city_name).trim(),
        address_normalized_display: str(item.full_address || item.value || item.label).trim(),
      })).toLowerCase();
      return !!itemDisplay && itemDisplay === manualDisplay;
    });
    if (hasSameAddress) return baseItems;
    return baseItems.concat([manualItem]);
  }

  function getAddressLookupContinuationInfo(value, resolvedState = null) {
    const lookupValue = str(value).trim();
    const currentResolved = resolvedState && typeof resolvedState === "object" ? resolvedState : {};
    const selectedType = getAddressLookupItemType(currentResolved);
    const selectedSourceKey = str(currentResolved.address_ref).trim();
    const rawCitySourceKey = str(currentResolved.resolved_city_source_key).trim();
    const citySourceKey = rawCitySourceKey.startsWith("root-city:") ? rawCitySourceKey : "";
    if (!lookupValue) {
      return {
        preserve: false,
        stage: "address",
        query: "",
        selectedSourceKey: "",
        citySourceKey,
      };
    }

    if (shouldPreserveAddressLookupResolution(currentResolved, lookupValue)) {
      const prefix = str(currentResolved._lookup_prefix || currentResolved.address_normalized_display).trim();
      const suffix = prefix && lookupValue.toLowerCase().startsWith(prefix.toLowerCase())
        ? str(lookupValue.slice(prefix.length)).trim()
        : lookupValue;
      return {
        preserve: true,
        stage: selectedType === "street" && suffix ? "house" : "address",
        query: suffix || lookupValue,
        selectedSourceKey: selectedType === "street" || selectedType === "context-locality" ? selectedSourceKey : "",
        citySourceKey,
      };
    }

    return {
      preserve: false,
      stage: "address",
      query: lookupValue,
      selectedSourceKey: "",
      citySourceKey,
    };
  }

  const ADDRESS_LOOKUP_HOUSE_TOKEN_PATTERN = "\\d+[\\dA-Za-zА-Яа-яЁё]*(?:[/-]\\d+[\\dA-Za-zА-Яа-яЁё]*)*";

  function normalizeAddressLookupText(value) {
    return str(value)
      .replace(/\s+/g, " ")
      .replace(/\s*,\s*/g, ", ")
      .replace(/,+\s*$/g, "")
      .trim();
  }

  function extractAddressHouseFromLookupSegment(segment) {
    const value = normalizeAddressLookupText(segment);
    if (!value) return "";
    const directMatch = value.match(new RegExp(`^(?:д(?:ом)?\\.?\\s*)?(${ADDRESS_LOOKUP_HOUSE_TOKEN_PATTERN})$`, "i"));
    if (directMatch && directMatch[1]) return str(directMatch[1]).trim();
    const tailMatch = value.match(new RegExp(`(?:^|\\s)(?:д(?:ом)?\\.?\\s*)?(${ADDRESS_LOOKUP_HOUSE_TOKEN_PATTERN})$`, "i"));
    if (tailMatch && tailMatch[1]) return str(tailMatch[1]).trim();
    return "";
  }

  function parseAddressStreetHouseFromLookup(value) {
    const normalized = normalizeAddressLookupText(value);
    if (!normalized) return { street: "", house: "" };

    const commaPos = normalized.lastIndexOf(",");
    if (commaPos >= 0) {
      const head = normalizeAddressLookupText(normalized.slice(0, commaPos)).replace(/[,\s]+$/g, "");
      const tail = normalizeAddressLookupText(normalized.slice(commaPos + 1));
      const houseFromTail = extractAddressHouseFromLookupSegment(tail);
      if (houseFromTail) {
        return { street: head, house: houseFromTail };
      }
    }

    const fallbackMatch = normalized.match(
      new RegExp(`^(.*?)(?:,|\\s)+(?:д(?:ом)?\\.?\\s*)?(${ADDRESS_LOOKUP_HOUSE_TOKEN_PATTERN})$`, "i")
    );
    if (!fallbackMatch) return { street: "", house: "" };
    return {
      street: normalizeAddressLookupText(fallbackMatch[1]).replace(/[,\s]+$/g, ""),
      house: str(fallbackMatch[2]).trim(),
    };
  }

  function normalizeAddressPayload(p) {
    const a = p && typeof p === "object" ? p : {};
    const normalizedDisplay = str(a.address_normalized_display).trim() || buildAddressLookupDisplay(a) || "";
    const parsedLookupStreetHouse = parseAddressStreetHouseFromLookup(normalizedDisplay);
    const streetFromInput = str(a.street).trim();
    const houseFromInput = str(a.house).trim();
    const out = {
      city: str(a.city).trim() || null,
      street: streetFromInput || parsedLookupStreetHouse.street,
      house: houseFromInput || parsedLookupStreetHouse.house,
      entrance: str(a.entrance).trim(),
      floor: str(a.floor).trim(),
      apartment: str(a.apartment).trim(),
      comment: str(a.comment).trim(),
      address_ref: str(a.address_ref).trim() || null,
      selected_object_type: str(a.selected_object_type).trim() || null,
      resolved_city_source_key: str(a.resolved_city_source_key).trim() || null,
      address_context_locality: str(a.address_context_locality || a.context_locality).trim() || null,
      address_normalized_display: normalizeAddressLookupText(normalizedDisplay) || null,
      lat: normalizeAddressCoordinate(a.lat, "lat"),
      lng: normalizeAddressCoordinate(a.lng, "lng"),
      delivery_zone_id: normalizeAddressId(a.delivery_zone_id),
      delivery_store_id: normalizeAddressId(a.delivery_store_id),
    };
    if (!out.entrance) out.entrance = null;
    if (!out.floor) out.floor = null;
    if (!out.apartment) out.apartment = null;
    if (!out.comment) out.comment = null;
    if (out.lat == null || out.lng == null) {
      out.delivery_zone_id = null;
      out.delivery_store_id = null;
    }
    return out;
  }

  function formatAddressLine(a) {
    if (!a) return "";
    const city = str(a.city).trim();
    const street = str(a.street).trim();
    const house = str(a.house).trim();

    const parts = [];
    if (city) parts.push(city);
    if (street || house) parts.push([street, house].filter(Boolean).join(" ").trim());

    if (a.entrance) parts.push(`подъезд ${str(a.entrance).trim()}`);
    if (a.floor) parts.push(`этаж ${str(a.floor).trim()}`);
    if (a.apartment) parts.push(`кв ${str(a.apartment).trim()}`);

    return parts.filter(Boolean).join(", ");
  }

  function getSelectedAddressLine() {
    return state.selectedAddress ? formatAddressLine(state.selectedAddress) : "";
  }

  const HEADER_STREET_TYPE_PREFIX_RE = /^\s*(?:(?:улица|ул\.?)|(?:проспект|просп\.?|пр-т|пр-кт)|(?:переулок|пер\.?)|(?:проезд|пр-д)|(?:бульвар|бул\.?|б-р)|(?:площадь|пл\.?)|(?:шоссе|ш\.?)|(?:аллея|ал\.?)|(?:набережная|наб\.?)|(?:тупик|туп\.?)|(?:тракт|тр\.?)|(?:линия|лин\.?)|(?:микрорайон|мкр\.?|мкрн\.?)|(?:квартал|кв-л)|(?:дорога|дор\.?))\s+/i;
  const HEADER_STREET_TYPE_SUFFIX_RE = /\s+(?:(?:улица|ул\.?)|(?:проспект|просп\.?|пр-т|пр-кт)|(?:переулок|пер\.?)|(?:проезд|пр-д)|(?:бульвар|бул\.?|б-р)|(?:площадь|пл\.?)|(?:шоссе|ш\.?)|(?:аллея|ал\.?)|(?:набережная|наб\.?)|(?:тупик|туп\.?)|(?:тракт|тр\.?)|(?:линия|лин\.?)|(?:микрорайон|мкр\.?|мкрн\.?)|(?:квартал|кв-л)|(?:дорога|дор\.?))\.?\s*$/i;
  const HEADER_STREET_KEEP_TYPE_RE = /(?:^|[\s,.-])(?:\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d|\u043c\u043a\u0440\.?|\u043c\u043a\u0440\u043d\.?|(?:\u043a\u0432\u0430\u0440\u0442\u0430\u043b|\u043a\u0432-\u043b))(?=$|[\s,.-])/i;

  function normalizeHeaderStreetName(streetRaw) {
    const street = str(streetRaw).trim();
    if (!street) return "";
    if (HEADER_STREET_KEEP_TYPE_RE.test(street)) {
      return street;
    }
    const strippedPrefix = street.replace(HEADER_STREET_TYPE_PREFIX_RE, "").trim();
    const strippedSuffix = strippedPrefix.replace(HEADER_STREET_TYPE_SUFFIX_RE, "").trim();
    return strippedSuffix || strippedPrefix || street;
  }

  function formatHeaderAddressStreetHouseApartment(a) {
    if (!a) return "";
    const street = normalizeHeaderStreetName(a.street) || str(a.street).trim();
    const house = str(a.house).trim();
    const apartment = str(a.apartment).trim();

    const base = [street, house].filter(Boolean).join(" ").trim();
    if (!base) return "";
    if (!apartment) return base;
    return `${base}, кв ${apartment}`;
  }

  function formatHeaderPickupStoreAddress(store) {
    if (!store) return "";
    const rawAddress = str(store.address).trim();
    const fallback = rawAddress || str(store.name).trim();
    if (!rawAddress) return fallback;

    const parts = rawAddress.split(",").map((part) => str(part).trim()).filter(Boolean);
    if (!parts.length) return fallback;

    let house = "";
    let street = "";
    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const part = parts[i];
      if (!/\d/.test(part)) continue;
      house = part;
      street = i > 0 ? parts[i - 1] : "";
      break;
    }

    if (!street) {
      street = parts.length >= 2 ? parts[parts.length - 2] : parts[parts.length - 1];
    }

    const normalizedStreet = normalizeHeaderStreetName(street);
    const compact = [normalizedStreet, house].filter(Boolean).join(" ").trim();
    return compact || fallback;
  }

  function formatAddressStreetHouseApartment(a) {
    if (!a) return "";
    const street = str(a.street).trim();
    const house = str(a.house).trim();
    const apartment = str(a.apartment).trim();

    const base = [street, house].filter(Boolean).join(" ").trim();
    if (!base) return "";
    if (!apartment) return base;
    return `${base}, кв ${apartment}`;
  }

  function getAddressLookupCityValue() {
    return str(elAddrCity?.dataset?.value || "").trim();
  }

  function clearAddressLookupDebounce() {
    if (!addressLookupState.debounceTimer) return;
    clearTimeout(addressLookupState.debounceTimer);
    addressLookupState.debounceTimer = null;
  }

  function renderAddressLookupPopover() {
    if (!elAddrLookupPopover || !elAddrLookupStatus || !elAddrLookupResults) return;
    const isVisible = addressLookupState.open && (
      addressLookupState.mode !== "idle" ||
      addressLookupState.items.length > 0
    );
    elAddrLookupPopover.classList.toggle("hidden", !isVisible);

    const statusText = str(addressLookupState.status).trim();
    elAddrLookupStatus.textContent = statusText;
    elAddrLookupStatus.classList.toggle("hidden", !statusText);
    elAddrLookupStatus.classList.toggle("is-error", addressLookupState.mode === "error");
    elAddrLookupStatus.classList.toggle("is-loading", addressLookupState.mode === "loading");

    elAddrLookupResults.innerHTML = "";
    addressLookupState.items.forEach((item, index) => {
      const isManualHint = item && item.__manual_address_hint === true;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "shop-address-lookup-item";
      if (index === addressLookupState.activeIndex) button.classList.add("is-active");
      button.setAttribute("aria-selected", index === addressLookupState.activeIndex ? "true" : "false");

      const title = document.createElement("div");
      title.className = "shop-address-lookup-item-title";
      title.textContent = isManualHint
        ? "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u0440\u0443\u0447\u043d\u043e\u0439 \u0430\u0434\u0440\u0435\u0441"
        : buildAddressLookupSuggestionTitle(item, getAddressLookupCityValue());
      button.appendChild(title);

      const metaText = isManualHint
        ? str(item.full_address || item.value || item.label).trim()
        : str(item.context_locality || item.city_name).trim();
      if (metaText) {
        const meta = document.createElement("div");
        meta.className = "shop-address-lookup-item-meta";
        meta.textContent = metaText;
        button.appendChild(meta);
      }

      button.addEventListener("mouseenter", () => {
        if (addressLookupState.activeIndex === index) return;
        addressLookupState.activeIndex = index;
        renderAddressLookupPopover();
      });
      button.addEventListener("click", async () => {
        await applyAddressLookupSuggestion(item);
      });

      elAddrLookupResults.appendChild(button);
    });
  }

  function closeAddressLookupPopover() {
    clearAddressLookupDebounce();
    addressLookupState.requestSeq += 1;
    addressLookupState.open = false;
    addressLookupState.items = [];
    addressLookupState.activeIndex = -1;
    addressLookupState.status = "";
    addressLookupState.mode = "idle";
    renderAddressLookupPopover();
  }

  function setAddressLookupStatus(message, mode = "idle") {
    addressLookupState.status = str(message).trim();
    addressLookupState.mode = str(mode).trim() || "idle";
    if (addressLookupState.mode !== "idle" || addressLookupState.items.length) {
      addressLookupState.open = true;
    }
    renderAddressLookupPopover();
  }

  function setAddressLookupItems(items) {
    addressLookupState.items = Array.isArray(items) ? items.slice() : [];
    addressLookupState.activeIndex = addressLookupState.items.length ? 0 : -1;
    if (addressLookupState.items.length) {
      addressLookupState.open = true;
      if (addressLookupState.mode === "idle" || addressLookupState.mode === "loading" || addressLookupState.mode === "empty") {
        addressLookupState.mode = "ready";
      }
    }
    renderAddressLookupPopover();
  }

  async function applyAddressLookupSuggestion(item) {
    const selectedItem = item && typeof item === "object" ? item : null;
    if (!selectedItem) return;
    const city = getAddressLookupCityValue();
    if (selectedItem.__current_address_hint === true) {
      closeAddressLookupPopover();
      return;
    }
    if (selectedItem.__manual_address_hint === true) {
      const manualDisplay = normalizeAddressLookupText(
        str(selectedItem.full_address || selectedItem.value || selectedItem.label || elAddrLookup?.value || "").trim()
      );
      const parsed = parseAddressStreetHouseFromLookup(manualDisplay);
      if (elAddrLookup) {
        elAddrLookup.value = manualDisplay;
        elAddrLookup.focus();
        const caretPos = elAddrLookup.value.length;
        try {
          elAddrLookup.setSelectionRange(caretPos, caretPos);
        } catch (_) {}
      }
      if (elAddrStreet) elAddrStreet.value = str(parsed.street).trim();
      if (elAddrHouse) elAddrHouse.value = str(parsed.house).trim();
      const currentResolved = state._addressFormResolved && typeof state._addressFormResolved === "object"
        ? state._addressFormResolved
        : {};
      state._addressFormResolved = {
        ...extractResolvedAddressState({
          resolved_city_source_key: currentResolved.resolved_city_source_key,
          address_context_locality: str(selectedItem.context_locality || selectedItem.city_name || city).trim() || null,
          address_normalized_display: manualDisplay || null,
          selected_object_type: "manual",
        }),
        _lookup_prefix: null,
      };
      closeAddressLookupPopover();
      return;
    }
    const selectedType = getAddressLookupItemType(selectedItem);
    if (selectedType !== "address") {
      const nextCity = str(selectedItem.city_name || city).trim();
      if (nextCity && elAddrCity) {
        initCustomSelect(elAddrCity, nextCity);
      }
      const nextState = buildAddressLookupIntermediateState(selectedItem, nextCity || city, state._addressFormResolved);
      if (elAddrLookup) {
        elAddrLookup.value = str(nextState.address_normalized_display).trim();
        elAddrLookup.focus();
        const caretPos = elAddrLookup.value.length;
        try {
          elAddrLookup.setSelectionRange(caretPos, caretPos);
        } catch (_) {}
      }
      if (elAddrStreet) {
        elAddrStreet.value = selectedType === "street"
          ? str(selectedItem.street_name || selectedItem.value || selectedItem.label).trim()
          : "";
      }
      if (elAddrHouse) elAddrHouse.value = "";
      state._addressFormResolved = nextState;
      closeAddressLookupPopover();
      return;
    }

    const subtotal = computeCartTotals(cartItemsResolved()).total;
    try {
      const json = await apiJson("/api/public/address-resolve", {
        method: "POST",
        body: {
          subtotal,
          city,
          street: selectedItem.street_name || "",
          house: selectedItem.house_number || "",
          address_ref: selectedItem.source_key || "",
          selected_object_type: selectedItem.object_type || "address",
          address_context_locality: selectedItem.context_locality || selectedItem.city_name || "",
          address_normalized_display: selectedItem.full_address || selectedItem.value || selectedItem.label || "",
          lat: selectedItem.lat,
          lng: selectedItem.lng,
        },
      });
      const data = json?.data || {};
      if (data.city && elAddrCity) {
        initCustomSelect(elAddrCity, data.city);
      }
      if (elAddrLookup) {
        elAddrLookup.value = str(data.address_normalized_display || buildAddressLookupDisplay(data)).trim();
      }
      if (elAddrStreet) elAddrStreet.value = str(data.street || selectedItem.street_name || "").trim();
      if (elAddrHouse) elAddrHouse.value = str(data.house || selectedItem.house_number || "").trim();
      state._addressFormResolved = {
        ...extractResolvedAddressState({
          address_ref: data.address_ref,
          selected_object_type: data.selected_object_type,
          resolved_city_source_key: data.resolved_city_source_key,
          address_context_locality: data.context_locality,
          address_normalized_display: data.address_normalized_display,
          lat: data.lat,
          lng: data.lng,
          delivery_zone_id: data.delivery_zone_id,
          delivery_store_id: data.delivery_store_id,
        }),
        _lookup_prefix: str(data.address_normalized_display || buildAddressLookupDisplay(data)).trim() || null,
      };
      closeAddressLookupPopover();
      if (typeof updateMobileDeliveryProgress === "function") {
        Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
      }
    } catch (error) {
      console.error(error);
      setAddressLookupItems([]);
      setAddressLookupStatus("Не удалось получить адрес.", "error");
    }
  }

  async function searchAddressLookupSuggestions(query, requestId) {
    const normalizedQuery = str(query).trim();
    const city = getAddressLookupCityValue();
    const continuation = getAddressLookupContinuationInfo(normalizedQuery, state._addressFormResolved);
    const apiQuery = normalizeAddressLookupText(str(continuation.query).trim());
    const minLength = continuation.stage === "house" ? 1 : 2;
    if (!apiQuery || apiQuery.length < minLength) {
      closeAddressLookupPopover();
      return;
    }
    if (!city) {
      setAddressLookupItems([]);
      setAddressLookupStatus("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u044b\u0431\u0435\u0440\u0438\u0442\u0435 \u0433\u043e\u0440\u043e\u0434.", "error");
      return;
    }
    addressLookupState.open = true;
    setAddressLookupStatus("\u0418\u0449\u0435\u043c \u0430\u0434\u0440\u0435\u0441...", "loading");
    try {
      const params = new URLSearchParams({
        stage: continuation.stage,
        q: apiQuery,
        city,
      });
      if (continuation.citySourceKey) {
        params.set("city_source_key", continuation.citySourceKey);
      }
      if (continuation.selectedSourceKey) {
        params.set("selected_source_key", continuation.selectedSourceKey);
      }
      const response = await fetch("/api/public/address-suggest?" + params.toString(), {
        headers: {
          "x-tenant-id": String(tenantId),
        },
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.error || "ADDRESS_SUGGEST_FAILED");
      }
      if (requestId !== addressLookupState.requestSeq) return;
      const rawItems = Array.isArray(json?.data?.items) ? json.data.items : [];
      const items = appendManualAddressLookupSuggestion(rawItems, normalizedQuery, city, state._addressFormResolved);
      if (!items.length) {
        setAddressLookupItems([]);
        setAddressLookupStatus("\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.", "empty");
        return;
      }
      setAddressLookupItems(items);
      if (!rawItems.length && items.length === 1 && items[0].__manual_address_hint === true) {
        setAddressLookupStatus("\u0422\u043e\u0447\u043d\u043e\u0433\u043e \u0441\u043e\u0432\u043f\u0430\u0434\u0435\u043d\u0438\u044f \u043d\u0435\u0442. \u041c\u043e\u0436\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u0440\u0443\u0447\u043d\u043e\u0439 \u0430\u0434\u0440\u0435\u0441.", "ready");
      } else {
        setAddressLookupStatus("\u041f\u043e\u0438\u0441\u043a: " + str(json?.data?.scope_label || city).trim(), "ready");
      }
    } catch (error) {
      if (requestId !== addressLookupState.requestSeq) return;
      console.error(error);
      const fallbackItems = appendManualAddressLookupSuggestion([], normalizedQuery, city, state._addressFormResolved);
      if (fallbackItems.length) {
        setAddressLookupItems(fallbackItems);
        setAddressLookupStatus("\u041c\u043e\u0436\u043d\u043e \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043a\u0430\u043a \u0440\u0443\u0447\u043d\u043e\u0439 \u0430\u0434\u0440\u0435\u0441.", "ready");
        return;
      }
      setAddressLookupItems([]);
      setAddressLookupStatus("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0430\u0434\u0440\u0435\u0441\u0430.", "error");
    }
  }

  function scheduleAddressLookupSuggestions() {
    if (!isAddressMapModeEnabled() || !elAddrLookup) return;
    const normalizedValue = str(elAddrLookup.value).trim();
    const continuation = getAddressLookupContinuationInfo(normalizedValue, state._addressFormResolved);
    const minLength = continuation.stage === "house" ? 1 : 2;
    clearAddressLookupDebounce();
    addressLookupState.requestSeq += 1;
    if (!normalizedValue || str(continuation.query).trim().length < minLength) {
      closeAddressLookupPopover();
      return;
    }
    const requestId = addressLookupState.requestSeq;
    addressLookupState.debounceTimer = setTimeout(() => {
      addressLookupState.debounceTimer = null;
      searchAddressLookupSuggestions(normalizedValue, requestId);
    }, 180);
  }

  function isDesktopViewport() {
    try {
      return !!(window.matchMedia && window.matchMedia("(min-width: 769px)").matches);
    } catch {
      return false;
    }
  }

  function getHeaderPickupStore() {
    if (window._deliveryMode !== "pickup" || !window._selectedPickupStoreId) return null;
    const stores = window._pickupStores || [];
    if (!Array.isArray(stores) || !stores.length) return null;
    return stores.find((s) => Number(s.id) === Number(window._selectedPickupStoreId)) || null;
  }

  const DEFAULT_CART_MODE_ETA_LABEL = "\u0417\u0430 40-80 \u043c\u0438\u043d\u0443\u0442";
  let cartModeHeaderMetaState = {
    etaText: DEFAULT_CART_MODE_ETA_LABEL,
    deliveryText: "",
    hoursText: "",
    deliveryProgressVisible: false,
    deliveryProgressValue: 0,
    deliveryProgressLabelHtml: "",
    deliveryProgressFree: false,
  };

  function getCartHeaderAddressLine() {
    const pickupStore = getHeaderPickupStore();
    if (pickupStore) return formatHeaderPickupStoreAddress(pickupStore);
    return formatHeaderAddressStreetHouseApartment(state.selectedAddress);
  }

  let cartHeaderStoresLoadPromise = null;

  function ensureStoresForHeaderStatus() {
    const cachedStores = window._pickupStores;
    if (Array.isArray(cachedStores) && cachedStores.length) {
      return Promise.resolve(cachedStores);
    }
    if (cartHeaderStoresLoadPromise) {
      return cartHeaderStoresLoadPromise;
    }
    cartHeaderStoresLoadPromise = (async () => {
      try {
        const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.ok && Array.isArray(data.stores)) {
          window._pickupStores = data.stores;
          return data.stores;
        }
      } catch (e) {
        console.warn("Failed to load stores for cart header status:", e);
      }
      return Array.isArray(window._pickupStores) ? window._pickupStores : [];
    })().finally(() => {
      cartHeaderStoresLoadPromise = null;
    });
    return cartHeaderStoresLoadPromise;
  }

  function getHeaderDeliveryStore() {
    const stores = Array.isArray(window._pickupStores) ? window._pickupStores : [];
    if (!stores.length) return null;

    const address = state.selectedAddress || null;
    const candidateIds = [
      Number(address?.delivery_store_id || 0),
      Number(address?.store_id || 0),
      Number(getActiveStoreId() || 0),
    ].filter((id) => Number.isFinite(id) && id > 0);

    for (const id of candidateIds) {
      const byId = stores.find((s) => Number(s?.id) === id);
      if (byId) return byId;
    }

    const addressCity = str(address?.city || "").trim().toLowerCase();
    if (addressCity) {
      const byCity = stores.filter((s) => str(s?.city || "").trim().toLowerCase() === addressCity);
      if (byCity.length === 1) return byCity[0];
      if (byCity.length > 1) {
        const activeId = Number(getActiveStoreId() || 0);
        return byCity.find((s) => Number(s?.id) === activeId) || byCity[0];
      }
    }

    return null;
  }

  function getCartHeaderStatusStore() {
    if (window._deliveryMode === "pickup") {
      return getHeaderPickupStore();
    }
    return getHeaderDeliveryStore();
  }

  function findNextStoreOpeningForList(storeHours, timezone) {
    if (!Array.isArray(storeHours) || !storeHours.length) return null;

    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const currentMinutes = localDate.getHours() * 60 + localDate.getMinutes();

    const parseTimeToMinutes = (timeStr) => {
      const match = str(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
      if (!match) return null;
      return Number(match[1]) * 60 + Number(match[2]);
    };

    for (let offset = 0; offset < 7; offset += 1) {
      const dayToCheck = (currentDay + offset) % 7;
      const entry = storeHours.find((row) => Number(row?.day_of_week) === dayToCheck);
      if (!entry || Number(entry.is_closed) === 1) continue;

      const opensAt = parseTimeToMinutes(entry.opens_at);
      if (opensAt === null) continue;
      if (offset === 0 && currentMinutes >= opensAt) continue;

      return {
        time: String(entry.opens_at || "").slice(0, 5),
        isToday: offset === 0,
      };
    }

    return null;
  }

  function getCartHeaderOperatingText(store) {
    if (!store) return "";

    const statusInfo = getStoreStatusInfoForList(store);
    const statusText = str(statusInfo?.text || "").trim();
    const timeMatch = statusText.match(/(\d{2}:\d{2})/);
    if (statusInfo?.open && timeMatch?.[1]) {
      return `Принимаем заказы до ${timeMatch[1]}`;
    }

    const nextOpening = findNextStoreOpeningForList(store.storeHours, store.timezone);
    if (nextOpening?.time) {
      return `Принимаем заказы с ${nextOpening.time}`;
    }

    const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
    return hoursRange ? `Принимаем заказы ${hoursRange}` : "";
  }

  let cartHeaderOrderConfigPromise = null;

  async function ensureOrderConfigForHeader() {
    const existingConfig = getShopOrderConfigSnapshot();
    if (existingConfig) {
      applyPriceRoundingSettingsFromOrderConfig(existingConfig, { persist: true });
      return existingConfig;
    }
    if (cartHeaderOrderConfigPromise) {
      return cartHeaderOrderConfigPromise;
    }
    cartHeaderOrderConfigPromise = (async () => {
      try {
        const resp = await fetch("/api/public/order-config");
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.ok && data.data) {
          const mergedConfig = existingConfig && typeof existingConfig === "object"
            ? { ...existingConfig, ...data.data }
            : data.data;
          return setShopOrderConfigSnapshot(mergedConfig, { persistRounding: true });
        }
      } catch (e) {
        console.warn("Failed to preload order config for cart header:", e);
      }
      return getShopOrderConfigSnapshot();
    })().finally(() => {
      cartHeaderOrderConfigPromise = null;
    });
    return cartHeaderOrderConfigPromise;
  }

  function getCartHeaderLocalDayIndex(timezone) {
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    return new Date(localMs).getDay();
  }

  function getCartHeaderHoursEntryForToday(hours, timezone) {
    if (!Array.isArray(hours) || !hours.length) return null;
    const currentDay = getCartHeaderLocalDayIndex(timezone);
    return hours.find((entry) => Number(entry?.day_of_week) === currentDay) || null;
  }

  function getCartHeaderHoursRangeParts(entry) {
    if (!entry || Number(entry?.is_closed) === 1) return null;
    const opens = entry?.opens_at ? String(entry.opens_at).slice(0, 5) : "";
    const closes = entry?.closes_at ? String(entry.closes_at).slice(0, 5) : "";
    if (!opens && !closes) return null;
    return { opens, closes };
  }

  function getImmediateCartHeaderPickupHoursText() {
    const store = getHeaderPickupStore();
    if (!store) return "";
    const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
    if (hoursRange) {
      return `Время работы ${hoursRange}`;
    }
    const nextOpening = findNextStoreOpeningForList(store.storeHours, store.timezone);
    return nextOpening?.time ? `Время работы с ${nextOpening.time}` : "";
  }

  function getImmediateCartHeaderDeliveryHoursText() {
    const config = window.__shopOrderConfig || null;
    if (!config) return "";
    const deliveryHours = Array.isArray(config.storeDeliveryHours) && config.storeDeliveryHours.length
      ? config.storeDeliveryHours
      : (Array.isArray(config.storeHours) ? config.storeHours : []);
    const timezone = str(config.storeTimezone || "").trim() || "+0";
    const todayEntry = getCartHeaderHoursEntryForToday(deliveryHours, timezone);
    const hoursRange = getCartHeaderHoursRangeParts(todayEntry);
    if (hoursRange?.opens && hoursRange?.closes) {
      return `Доставка с ${hoursRange.opens} до ${hoursRange.closes}`;
    }
    if (hoursRange?.opens) {
      return `Доставка с ${hoursRange.opens}`;
    }
    const nextOpening = findNextStoreOpeningForList(deliveryHours, timezone);
    return nextOpening?.time ? `Доставка с ${nextOpening.time}` : "";
  }

  function getResolvedCartHeaderHoursText(mode = null, store = null) {
    const resolvedMode = mode === "pickup" ? "pickup" : "delivery";
    const resolvedStore = store || getCartHeaderStatusStore();
    const preferredText = resolvedMode === "pickup"
      ? getImmediateCartHeaderPickupHoursText()
      : getImmediateCartHeaderDeliveryHoursText();
    return str(preferredText || getCartHeaderOperatingText(resolvedStore) || "").trim();
  }

  function syncImmediateCartHeaderHoursText(mode = null) {
    const resolvedMode = mode === "pickup" ? "pickup" : "delivery";
    const hoursText = getResolvedCartHeaderHoursText(resolvedMode);
    cartModeHeaderMetaState.hoursText = hoursText || "";
    return hoursText;
  }

  function getCatalogDeliveryMethodMeta(mode) {
    const config = getShopOrderConfigSnapshot();
    const methods = Array.isArray(config?.methods) ? config.methods : [];
    const method = mode === "pickup"
      ? (methods.find((item) => str(item?.code).trim() !== "delivery") || null)
      : (methods.find((item) => str(item?.code).trim() === "delivery") || null);
    return {
      title: str(method?.title || "").trim() || (mode === "pickup" ? "\u0421\u0430\u043c\u043e\u0432\u044b\u0432\u043e\u0437" : "\u0414\u043e\u0441\u0442\u0430\u0432\u043a\u0430"),
      icon: str(method?.icon || "").trim() || (mode === "pickup" ? "fas fa-store" : "fas fa-truck"),
    };
  }

  function setCatalogDeliveryIcon(target, iconRaw, fallback) {
    if (!target) return;
    const resolvedIcon = str(iconRaw || fallback || "").trim() || "fas fa-circle";
    if (target.dataset.icon === resolvedIcon) return;
    target.dataset.icon = resolvedIcon;
    target.innerHTML = "";
    const isUrl = resolvedIcon.includes("/") || resolvedIcon.startsWith("http");
    if (isUrl) {
      const img = document.createElement("img");
      img.src = resolvedIcon;
      img.alt = "";
      target.appendChild(img);
      return;
    }
    const icon = document.createElement("i");
    if (resolvedIcon.includes(" ")) {
      icon.className = resolvedIcon;
    } else if (resolvedIcon.startsWith("fa-")) {
      icon.className = `fas ${resolvedIcon}`;
    } else {
      icon.className = `fas fa-${resolvedIcon}`;
    }
    icon.setAttribute("aria-hidden", "true");
    target.appendChild(icon);
  }

  function getCatalogPickupHoursText() {
    const stores = Array.isArray(window._pickupStores) ? window._pickupStores : [];
    if (!stores.length) return getResolvedCartHeaderHoursText("pickup") || "";
    const candidateIds = [
      Number(window._selectedPickupStoreId || 0),
      Number(getActiveStoreId() || 0),
    ].filter((id) => Number.isFinite(id) && id > 0);
    let store = null;
    for (const id of candidateIds) {
      store = stores.find((item) => Number(item?.id) === id) || null;
      if (store) break;
    }
    if (!store) store = stores[0] || null;
    if (!store) return "";
    const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
    if (hoursRange) return `\u0441 ${hoursRange.replace(/\s*-\s*/, " \u0434\u043e ")}`;
    const nextOpening = findNextStoreOpeningForList(store.storeHours, store.timezone);
    return nextOpening?.time ? `\u0441 ${nextOpening.time}` : "";
  }

  function getCatalogDeliveryHoursText() {
    const text = str(getResolvedCartHeaderHoursText("delivery") || "").trim();
    const range = text.match(/(\d{2}:\d{2})\s*(?:-|до|\u0434\u043e)\s*(\d{2}:\d{2})/i);
    if (range) return `\u0441 ${range[1]} \u0434\u043e ${range[2]}`;
    const single = text.match(/(\d{2}:\d{2})/);
    return single ? `\u0441 ${single[1]}` : text;
  }

  function updateCatalogDeliveryWidgetUi() {
    if (!elCatalogDeliveryWidget) return;
    const mode = window._deliveryMode === "pickup" ? "pickup" : "delivery";
    const deliveryMeta = getCatalogDeliveryMethodMeta("delivery");
    const pickupMeta = getCatalogDeliveryMethodMeta("pickup");

    const deliveryTitle = elCatalogDeliveryWidget.querySelector('[data-role="delivery-title"]');
    const pickupTitle = elCatalogDeliveryWidget.querySelector('[data-role="pickup-title"]');
    const deliveryHours = elCatalogDeliveryWidget.querySelector('[data-role="delivery-hours"]');
    const pickupHours = elCatalogDeliveryWidget.querySelector('[data-role="pickup-hours"]');
    const deliveryIcon = elCatalogDeliveryWidget.querySelector('[data-role="delivery-icon"]');
    const pickupIcon = elCatalogDeliveryWidget.querySelector('[data-role="pickup-icon"]');
    const addressBtn = elCatalogDeliveryWidget.querySelector('[data-role="address"]');
    const addressText = elCatalogDeliveryWidget.querySelector('[data-role="address-text"]');
    const addressIcon = elCatalogDeliveryWidget.querySelector(".shop-catalog-delivery-widget__address-icon");

    if (deliveryTitle) deliveryTitle.textContent = deliveryMeta.title;
    if (pickupTitle) pickupTitle.textContent = pickupMeta.title;
    if (deliveryHours) {
      deliveryHours.innerHTML = `<span>\u0414\u043e\u0441\u0442\u0430\u0432\u043b\u044f\u0435\u043c</span><span>${escapeHtml(getCatalogDeliveryHoursText())}</span>`;
    }
    if (pickupHours) {
      pickupHours.innerHTML = `<span>\u0412\u0440\u0435\u043c\u044f \u0440\u0430\u0431\u043e\u0442\u044b</span><span>${escapeHtml(getCatalogPickupHoursText())}</span>`;
    }
    setCatalogDeliveryIcon(deliveryIcon, deliveryMeta.icon, "fas fa-truck");
    setCatalogDeliveryIcon(pickupIcon, pickupMeta.icon, "fas fa-store");

    elCatalogDeliveryWidget.querySelectorAll(".shop-catalog-delivery-widget__mode").forEach((button) => {
      const active = button.getAttribute("data-mode") === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    const line = str(getCartHeaderAddressLine() || "").trim();
    const placeholder = getCartModeHeaderPlaceholder(mode);
    if (addressText) addressText.textContent = line || placeholder;
    if (addressBtn) {
      addressBtn.classList.toggle("is-placeholder", !line);
      addressBtn.setAttribute("aria-label", line || placeholder);
      addressBtn.title = line || placeholder;
    }
    if (addressIcon) {
      addressIcon.className = "fas fa-location-dot shop-catalog-delivery-widget__address-icon";
    }
  }

  function bindCatalogDeliveryWidget() {
    if (!elCatalogDeliveryWidget || elCatalogDeliveryWidget.dataset.bound === "1") return;
    elCatalogDeliveryWidget.querySelectorAll(".shop-catalog-delivery-widget__mode").forEach((button) => {
      button.addEventListener("click", () => {
        void setCartModeHeaderMode(button.getAttribute("data-mode"));
      });
    });
    const addressBtn = elCatalogDeliveryWidget.querySelector('[data-role="address"]');
    if (addressBtn) {
      addressBtn.addEventListener("click", () => {
        const mode = window._deliveryMode === "pickup" ? "pickup" : "delivery";
        void openAddressEditorFromCheckout({ preferredMode: mode, backMode: "header" });
      });
    }
    elCatalogDeliveryWidget.dataset.bound = "1";
    updateCatalogDeliveryWidgetUi();
  }

  function getHomeBonusFirstLevel(config) {
    const data = config && typeof config === "object" ? config : null;
    if (!data?.settings?.bonus_program_enabled) return null;
    const levels = Array.isArray(data.levels) ? data.levels : [];
    const accountLevelId = Number(data.account?.level_id || 0);
    if (accountLevelId > 0) {
      const currentLevel = levels.find((level) => Number(level?.id || 0) === accountLevelId);
      if (currentLevel) return currentLevel;
    }
    return levels.find((level) => level && String(level.title || "").trim()) || null;
  }

  function renderHomeBonusCard() {
    if (!elHomeBonusCard) return;
    const level = getHomeBonusFirstLevel(state.homeBonusConfig);
    const showReferralCard = !!getCustomerToken() && isHomeBonusJoined();
    const referralCardHtml = showReferralCard ? buildHomeReferralCardHtml(state.homeBonusConfig) : "";
    if (!level && !referralCardHtml) {
      elHomeBonusCard.classList.add("hidden");
      elHomeBonusCard.innerHTML = "";
      return;
    }

    if (isHomeBonusJoined()) {
      const bonusCardHtml = level ? buildBonusLevelPreviewCardHtml(level, { homeCard: true, showQr: false })
        .replace('class="bonus-level-preview-card"', 'class="bonus-level-preview-card shop-home-bonus-card__preview"') : "";
      elHomeBonusCard.innerHTML = `
        <div class="shop-home-cards-scroll no-scrollbar">
          <div class="shop-home-cards-track">
            ${bonusCardHtml ? `<div class="shop-home-cards-slide">${bonusCardHtml}</div>` : ""}
            ${referralCardHtml ? `<div class="shop-home-cards-slide">${referralCardHtml}</div>` : ""}
          </div>
        </div>
        ${buildHomeMainSiteMenuRowHtml()}
        <div class="shop-home-active-orders hidden" data-home-active-orders></div>
      `;
      const balanceEl = elHomeBonusCard.querySelector(".shop-home-bonus-card__preview .bonus-level-preview-bonus-value");
      if (balanceEl) balanceEl.innerHTML = formatShopBonusMoney(getBonusLevelPreviewBalance(level));
      if (level) bindHomeBonusLevelTitle(level);
      if (level) bindBonusLevelPreviewCardActions(elHomeBonusCard, level, { returnTo: "none" });
      bindHomeReferralCard(elHomeBonusCard);
      refreshHomeReferralCardData();
      if (level && isHomeBonusFavoriteCategoriesEnabled(level)) {
        void loadHomeBonusFavoriteCategories(level).then(() => {
          updateBonusLevelPreviewFavoriteCategories(elHomeBonusCard, level);
          bindBonusLevelPreviewCardActions(elHomeBonusCard, level, { returnTo: "none" });
        }).catch(() => {});
      }
      bindHomeMainSiteMenuRow(elHomeBonusCard);
      void updateHomeBonusSiteMenuBadges(elHomeBonusCard);
      renderHomeActiveOrdersBlock();
      renderCatalogPromoBlock();
      elHomeBonusCard.classList.remove("hidden");
      return;
    }

    const mainColor = "#f3f4f6";
    const baseColor = "#d1d5db";
    const contentColor = "#64748b";
    const titleColor = "#64748b";
    const cashbackValue = normalizeShopCardPercent(level?.cashback_percent, 1);
    const favoriteCategoryBonusText = formatShopBonusFavoriteCategoriesRange(level);
    const favoriteCategoryLimit = Math.max(0, Math.floor(Number(level?.favorite_categories_limit || 0)));
    const showTitle = level?.show_title_on_card !== false;
    const titleStyle = level?.title_background_enabled === false
      ? `color:${escapeHtml(titleColor)};background:transparent;padding:0;border-radius:0;${showTitle ? "" : "display:none;"}`
      : `color:${escapeHtml(titleColor)};background:#ffffff;padding:2px 10px;border-radius:999px;${showTitle ? "" : "display:none;"}`;
    const qrStyle = level?.qr_enabled === false ? "display:none;" : "";
    const actionText = "Присоединиться";

    const isPaid = level?.access_type === "paid";
    const programName = isPaid
      ? (state.homeBonusConfig?.settings?.bonus_program_name_paid || state.homeBonusConfig?.settings?.bonus_program_name || "")
      : (state.homeBonusConfig?.settings?.bonus_program_name_base || state.homeBonusConfig?.settings?.bonus_program_name || "");
    const programLogo = isPaid
      ? (state.homeBonusConfig?.settings?.bonus_program_logo_paid || state.homeBonusConfig?.settings?.bonus_program_logo || "")
      : (state.homeBonusConfig?.settings?.bonus_program_logo_base || state.homeBonusConfig?.settings?.bonus_program_logo || "");
    const levelTitle = level?.title || "Уровень";
    const logoHtml = programLogo ? `<img class="shop-home-bonus-card__program-logo" src="${escapeHtml(programLogo)}" style="width:2.6em;height:2.6em;border-radius:2px;margin-right:0;object-fit:contain;display:inline-block;vertical-align:middle;">` : "";

    const bonusCardHtml = level ? `
      <div class="bonus-level-preview-card shop-home-bonus-card__preview" style="background:${escapeHtml(baseColor)};">
        <div class="bonus-level-preview-main" style="background:${escapeHtml(mainColor)};color:${escapeHtml(contentColor)};">
          <div class="bonus-level-preview-title shop-home-bonus-card__title" style="${titleStyle}">
            ${logoHtml}<span class="shop-home-bonus-card__title-text"><span class="shop-home-bonus-card__program-name">${escapeHtml(programName)}</span><span class="shop-home-bonus-card__level-name">${escapeHtml(levelTitle)}</span></span>
          </div>
          <button class="shop-home-bonus-card__action" type="button">${escapeHtml(actionText)}</button>
        </div>
        <div class="bonus-level-preview-sub" style="color:${escapeHtml(contentColor)};">
          <div class="bonus-level-preview-cashback-side" role="button" tabindex="0" data-open-bonus-preview-cashback>
            <div class="bonus-level-preview-cashback-icon" style="color:${escapeHtml(contentColor)};"><i class="fas fa-undo-alt" aria-hidden="true"></i></div>
            <div class="bonus-level-preview-cashback-value" style="color:${escapeHtml(contentColor)};">${escapeHtml(`${cashbackValue}%`)}</div>
          </div>
          <div class="bonus-level-preview-category-side${favoriteCategoryLimit > 0 ? "" : " hidden"}" role="button" tabindex="0" data-open-bonus-preview-favorite-categories>
            <div class="bonus-level-preview-category-icon" style="color:${escapeHtml(contentColor)};" aria-hidden="true">
              <span></span><span></span><span></span><span></span>
              <div class="bonus-level-preview-category-count" style="color:${escapeHtml(contentColor)};">${escapeHtml(String(favoriteCategoryLimit))}</div>
            </div>
            <div class="bonus-level-preview-category-value" style="color:${escapeHtml(contentColor)};">${escapeHtml(favoriteCategoryBonusText)}</div>
          </div>
        </div>
      </div>
    ` : "";
    elHomeBonusCard.innerHTML = `
      <div class="shop-home-cards-scroll no-scrollbar">
        <div class="shop-home-cards-track">
          ${bonusCardHtml ? `<div class="shop-home-cards-slide">${bonusCardHtml}</div>` : ""}
          ${referralCardHtml ? `<div class="shop-home-cards-slide">${referralCardHtml}</div>` : ""}
        </div>
      </div>
      ${buildHomeMainSiteMenuRowHtml()}
      <div class="shop-home-active-orders hidden" data-home-active-orders></div>
    `;
    const actionBtn = elHomeBonusCard.querySelector(".shop-home-bonus-card__action");
    if (actionBtn) actionBtn.addEventListener("click", () => {
      openHomeBonusCardsSheet();
    });
    if (level) bindBonusLevelPreviewCardActions(elHomeBonusCard, level, { returnTo: "none" });
    bindHomeReferralCard(elHomeBonusCard);
    bindHomeMainSiteMenuRow(elHomeBonusCard);
    void updateHomeBonusSiteMenuBadges(elHomeBonusCard);
    renderHomeActiveOrdersBlock();
    renderCatalogPromoBlock();
    elHomeBonusCard.classList.remove("hidden");
  }

  window.renderShopHomeActiveOrdersBlock = () => {
    renderHomeActiveOrdersBlock();
    renderCatalogPromoBlock();
  };

  async function loadHomeBonusConfig(options = {}) {
    const loadOptions = options && typeof options === "object" ? options : {};
    if (!elHomeBonusCard) return null;
    const token = getCustomerToken();
    if (loadOptions.force) {
      state.homeBonusConfig = null;
      state._homeBonusLoading = null;
    }
    if (state.homeBonusConfig && state._homeBonusToken === token) return state.homeBonusConfig;
    if (state._homeBonusLoading) return state._homeBonusLoading;
    if (state._homeBonusToken !== token) state.homeBonusConfig = null;
    state._homeBonusToken = token;
    state._homeBonusLoading = apiJson("/api/public/bonus/config")
      .then((json) => {
        state.homeBonusConfig = json?.data && typeof json.data === "object" ? json.data : null;
        renderHomeBonusCard();
        if (openCartSheetCtx?.listEl && openCartSheetCtx?.totalEl) {
          const rendered = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
          if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", rendered.items.length === 0);
          if (openCartSheetCtx.checkoutBtn) {
            openCartSheetCtx.checkoutBtn.disabled = rendered.items.length === 0;
            const totalSpan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
            if (totalSpan) totalSpan.textContent = money(computeCartTotals(rendered.items).total);
          }
          appendUpsellToList(openCartSheetCtx.listEl);
          if (typeof window.syncShopCartPricingSummaryUi === "function") {
            Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
          }
        }
        if (!loadOptions.skipPendingModal) maybeShowPendingBonusModalEvent();
        return state.homeBonusConfig;
      })
      .catch((err) => {
        console.error("Failed to load bonus config:", err);
        elHomeBonusCard.classList.add("hidden");
        elHomeBonusCard.innerHTML = "";
        return null;
      })
      .finally(() => {
        state._homeBonusLoading = null;
      });
    return state._homeBonusLoading;
  }

  function getCartModeHeaderMetaSnapshot() {
    const store = getCartHeaderStatusStore();
    const mode = window._deliveryMode === "pickup" ? "pickup" : "delivery";
    return {
      mode,
      addressLine: str(getCartHeaderAddressLine() || "").trim(),
      hoursText: getResolvedCartHeaderHoursText(mode, store),
      storeId: store?.id != null ? Number(store.id) : null,
    };
  }

  async function getCartModeHeaderMetaSnapshotAsync({ ensureStores = false } = {}) {
    if (ensureStores) {
      await ensureStoresForHeaderStatus().catch(() => []);
    }
    return getCartModeHeaderMetaSnapshot();
  }

  function setCartModeHeaderMetaState(next = {}) {
    const source = next && typeof next === "object" ? next : {};
    cartModeHeaderMetaState = {
      ...cartModeHeaderMetaState,
      ...source,
    };
    updateCartModeHeaderUi();
    return cartModeHeaderMetaState;
  }

  window.getShopCartModeHeaderMetaSnapshot = getCartModeHeaderMetaSnapshotAsync;
  window.setShopCartModeHeaderMetaState = setCartModeHeaderMetaState;

  function getHeaderStoreStatusText() {
    if (!getCartHeaderAddressLine()) return "";
    const store = getCartHeaderStatusStore();
    if (!store) return "";

    const statusInfo = getStoreStatusInfoForList(store);
    if (statusInfo && str(statusInfo.text).trim()) {
      return str(statusInfo.text).trim();
    }

    const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
    return str(hoursRange || "").trim();
  }

  function getCartHeaderStoreStatusText() {
    if (!isDesktopViewport()) return "";
    return getHeaderStoreStatusText();
  }

  function getCartHeaderModeIconClass() {
    return window._deliveryMode === "pickup" ? "fa-store" : "fa-location-dot";
  }

  function renderCartHeaderAddressTitle(titleText) {
    if (!elCartHeaderTitle) return;
    elCartHeaderTitle.innerHTML = `
      <i class="fas ${getCartHeaderModeIconClass()} shop-cart-header-mode-icon" aria-hidden="true"></i>
      <span class="shop-cart-header-title-main">
        <span class="shop-cart-header-title-text-row">
          <span class="shop-cart-header-title-text"></span>
          <i class="fas fa-chevron-right shop-cart-header-title-arrow" aria-hidden="true"></i>
        </span>
        <span class="shop-cart-header-title-sub hidden"></span>
      </span>
    `;
    const textEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-text");
    if (textEl) textEl.textContent = str(titleText || "");
  }

  function setCartHeaderStatusLine(statusText) {
    if (!elCartHeaderTitle) return;
    const subEl = elCartHeaderTitle.querySelector(".shop-cart-header-title-sub");
    if (!subEl) return;
    const text = str(statusText || "").trim();
    const show = Boolean(text) && isDesktopViewport();
    subEl.textContent = show ? text : "";
    subEl.classList.toggle("hidden", !show);
  }

  function updateCartHeaderStoreStatus({ ensureStores = false } = {}) {
    const statusText = getCartHeaderStoreStatusText();
    setCartHeaderStatusLine(statusText);
    if (statusText || !ensureStores || !isDesktopViewport()) return;

    ensureStoresForHeaderStatus()
      .then(() => {
        setCartHeaderStatusLine(getCartHeaderStoreStatusText());
      })
      .catch(() => {});
  }

  function setMobileHeaderStatusLine(statusText) {
    const statusEl = document.getElementById("shopMobileHeaderStatus");
    if (!statusEl) return;
    const text = str(statusText || "").trim();
    statusEl.textContent = text;
    statusEl.classList.toggle("hidden", !text);
  }

  function updateMobileHeaderStoreStatus({ ensureStores = false } = {}) {
    const statusText = getHeaderStoreStatusText();
    setMobileHeaderStatusLine(statusText);
    if (statusText || !ensureStores) return;

    ensureStoresForHeaderStatus()
      .then(() => {
        setMobileHeaderStatusLine(getHeaderStoreStatusText());
      })
      .catch(() => {});
  }

  function syncSelectedAddressToCheckoutDraft() {
    const line = getSelectedAddressLine();
    const addressComment = (state.selectedAddress && state.selectedAddress.comment)
      ? String(state.selectedAddress.comment).trim()
      : null;
    try {
      const d = loadCheckoutDraft();
      d.delivery_address = line || "";
      d.address_comment = addressComment || null;
      saveCheckoutDraft(d);
    } catch {}
  }

  function getCartModeHeaderPlaceholder(mode) {
    return mode === "pickup" ? "Выберите точку самовывоза" : "Укажите адрес доставки";
  }

  function updateCartModeHeaderUi(root = document) {
    const scope = root && typeof root.querySelectorAll === "function" ? root : document;
    const mode = window._deliveryMode === "pickup" ? "pickup" : "delivery";
    const line = str(getCartHeaderAddressLine() || "").trim();
    const text = line || getCartModeHeaderPlaceholder(mode);
    const iconClass = mode === "pickup" ? "fa-store" : "fa-location-dot";
    const etaText = str(cartModeHeaderMetaState?.etaText || "").trim() || DEFAULT_CART_MODE_ETA_LABEL;
    const deliveryText = mode === "delivery" ? str(cartModeHeaderMetaState?.deliveryText || "").trim() : "";
    const hoursText = str(cartModeHeaderMetaState?.hoursText || "").trim();
    const deliveryProgressVisible =
      mode === "delivery" &&
      !!cartModeHeaderMetaState?.deliveryProgressVisible &&
      Boolean(str(cartModeHeaderMetaState?.deliveryProgressLabelHtml || "").trim());
    const deliveryProgressValue = Math.max(
      0,
      Math.min(100, Number(cartModeHeaderMetaState?.deliveryProgressValue || 0))
    );
    const deliveryProgressLabelHtml =
      mode === "delivery" ? str(cartModeHeaderMetaState?.deliveryProgressLabelHtml || "").trim() : "";
    const deliveryProgressFree = mode === "delivery" && !!cartModeHeaderMetaState?.deliveryProgressFree;
    const headers = [];
    if (scope && typeof scope.matches === "function" && scope.matches(".shop-cart-mode-header")) {
      headers.push(scope);
    }
    headers.push(...scope.querySelectorAll(".shop-cart-mode-header"));

    headers.forEach((headerEl) => {
      const addressBtn = headerEl.querySelector(".shop-cart-mode-header__address");
      const iconEl = headerEl.querySelector(".shop-cart-mode-header__address-icon");
      const textEl = headerEl.querySelector(".shop-cart-mode-header__address-text");
      const deliveryBtn = headerEl.querySelector('.shop-delivery-toggle-btn[data-mode="delivery"]');
      const pickupBtn = headerEl.querySelector('.shop-delivery-toggle-btn[data-mode="pickup"]');
      const etaValueEl = headerEl.querySelector('[data-cart-meta="eta"] .shop-cart-mode-header__meta-value');
      const deliveryItemEl = headerEl.querySelector('[data-cart-meta="delivery"]');
      const deliveryValueEl = deliveryItemEl?.querySelector(".shop-cart-mode-header__meta-value");
      const hoursItemEl = headerEl.querySelector('[data-cart-meta="hours"]');
      const hoursValueEl = hoursItemEl?.querySelector(".shop-cart-mode-header__meta-value");
      const deliveryProgressEl = headerEl.querySelector('[data-cart-meta="delivery-progress"]');
      const deliveryProgressBarEl = deliveryProgressEl?.querySelector(".shop-cart-mode-header__progress-bar");
      const deliveryProgressFillEl = deliveryProgressEl?.querySelector(".shop-cart-mode-header__progress-fill");
      const deliveryProgressLabelEl = deliveryProgressEl?.querySelector(".shop-cart-mode-header__progress-label");

      if (deliveryBtn) deliveryBtn.classList.toggle("is-active", mode === "delivery");
      if (pickupBtn) pickupBtn.classList.toggle("is-active", mode === "pickup");
      if (addressBtn) {
        addressBtn.classList.toggle("is-placeholder", !line);
        addressBtn.setAttribute("aria-label", text);
        addressBtn.title = text;
      }
      if (iconEl) iconEl.className = `fas ${iconClass} shop-cart-mode-header__address-icon`;
      if (textEl) textEl.textContent = text;
      if (etaValueEl) etaValueEl.textContent = etaText;
      if (deliveryItemEl) deliveryItemEl.classList.toggle("hidden", !deliveryText);
      if (deliveryValueEl) deliveryValueEl.textContent = deliveryText;
      if (hoursItemEl) hoursItemEl.classList.toggle("hidden", !hoursText);
      if (hoursValueEl) hoursValueEl.textContent = hoursText;
      if (deliveryProgressEl) deliveryProgressEl.classList.toggle("hidden", !deliveryProgressVisible);
      if (deliveryProgressBarEl) {
        deliveryProgressBarEl.setAttribute("aria-valuenow", String(Math.round(deliveryProgressValue)));
      }
      if (deliveryProgressFillEl) deliveryProgressFillEl.style.width = `${deliveryProgressVisible ? deliveryProgressValue : 0}%`;
      if (deliveryProgressLabelEl) {
        deliveryProgressLabelEl.classList.toggle("is-free", deliveryProgressVisible && deliveryProgressFree);
        deliveryProgressLabelEl.innerHTML = deliveryProgressVisible ? deliveryProgressLabelHtml : "";
      }
    });
    updateCatalogDeliveryWidgetUi();
  }

  async function openCartModeAddressSelector(triggerEl) {
    const isSheetTrigger = !!(triggerEl && triggerEl.closest && triggerEl.closest(".shop-cart-sheet"));
    await refreshAddressState();
    const token = getCustomerToken();
    const hasList = token ? (state.addresses || []).length > 0 : !!loadAddressDraft();
    const isPickupMode = window._deliveryMode === "pickup";
    const prefill = loadAddressDraft() || state.selectedAddress || null;
    if (!isSheetTrigger) {
      openCartSheet();
    }
    if (!openCartSheetCtx) return;

    const backMode = isSheetTrigger ? "cart" : "desktop-panel";
    if (isPickupMode || hasList || getSelectedAddressLine()) {
      if (typeof openCartSheetCtx.showSheetAddressList === "function") {
        openCartSheetCtx.showSheetAddressList(backMode);
      }
      return;
    }
    if (typeof openCartSheetCtx.showSheetAddressForm === "function") {
      await openCartSheetCtx.showSheetAddressForm(prefill, null, backMode);
    }
  }

  async function setCartModeHeaderMode(mode) {
    const nextMode = mode === "pickup" ? "pickup" : "delivery";

    if (nextMode === "pickup") {
      const stores = await ensurePickupStoresLoadedForAddressList();
      const pickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
      window._selectedPickupStoreId = pickupStoreId ? Number(pickupStoreId) : null;
      window._deliveryMode = "pickup";

      const pickupDraft = loadCheckoutDraft();
      pickupDraft.method_code = "takeaway";
      pickupDraft.method_user_selected = true;
      pickupDraft.pickup_store_id = window._selectedPickupStoreId || null;
      saveCheckoutDraft(pickupDraft);

      if (window._updatePickupAddressCallback) {
        try { window._updatePickupAddressCallback(); } catch {}
      }
    } else {
      window._deliveryMode = "delivery";

      const deliveryDraft = loadCheckoutDraft();
      deliveryDraft.method_code = "delivery";
      deliveryDraft.method_user_selected = true;
      deliveryDraft.pickup_store_id = null;
      saveCheckoutDraft(deliveryDraft);
      syncSelectedAddressToCheckoutDraft();
    }

    window._checkoutMethodCode = nextMode === "pickup" ? "takeaway" : "delivery";
    syncImmediateCartHeaderHoursText(nextMode);
    updateHeaderAddressWidget();
    updateAddressChip();
    updateCartModeHeaderUi();
    if (typeof updateMobileDeliveryProgress === "function") {
      Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
    }
  }

  function buildCartModeHeader() {
    const section = document.createElement("section");
    section.className = "shop-cart-mode-header";

    const toggleWrap = document.createElement("div");
    toggleWrap.className = "shop-cart-mode-header__toggle-wrap";

    const toggle = document.createElement("div");
    toggle.className = "shop-delivery-toggle";

    const deliveryBtn = document.createElement("button");
    deliveryBtn.type = "button";
    deliveryBtn.className = "shop-delivery-toggle-btn";
    deliveryBtn.dataset.mode = "delivery";
    deliveryBtn.textContent = "Доставка";

    const pickupBtn = document.createElement("button");
    pickupBtn.type = "button";
    pickupBtn.className = "shop-delivery-toggle-btn";
    pickupBtn.dataset.mode = "pickup";
    pickupBtn.textContent = "Самовывоз";

    toggle.appendChild(deliveryBtn);
    toggle.appendChild(pickupBtn);
    toggleWrap.appendChild(toggle);

    const addressBtn = document.createElement("button");
    addressBtn.type = "button";
    addressBtn.className = "shop-cart-mode-header__address";
    addressBtn.innerHTML = `
      <i class="fas fa-location-dot shop-cart-mode-header__address-icon" aria-hidden="true"></i>
      <span class="shop-cart-mode-header__address-text"></span>
      <i class="fas fa-chevron-right shop-cart-mode-header__address-arrow" aria-hidden="true"></i>
    `;

    const meta = document.createElement("div");
    meta.className = "shop-cart-mode-header__meta";
    meta.innerHTML = `
      <div class="shop-cart-mode-header__meta-row">
        <div class="shop-cart-mode-header__meta-item" data-cart-meta="eta">
          <i class="fas fa-truck shop-cart-mode-header__meta-icon" aria-hidden="true"></i>
          <span class="shop-cart-mode-header__meta-value">${DEFAULT_CART_MODE_ETA_LABEL}</span>
        </div>
        <div class="shop-cart-mode-header__meta-item shop-cart-mode-header__meta-item--plain hidden" data-cart-meta="delivery">
          <span class="shop-cart-mode-header__meta-value"></span>
        </div>
      </div>
      <div class="shop-cart-mode-header__meta-row">
        <div class="shop-cart-mode-header__meta-item hidden" data-cart-meta="hours">
          <i class="fas fa-clock shop-cart-mode-header__meta-icon" aria-hidden="true"></i>
          <span class="shop-cart-mode-header__meta-value"></span>
        </div>
      </div>
    `;

    const progress = document.createElement("div");
    progress.className = "shop-cart-mode-header__progress hidden";
    progress.dataset.cartMeta = "delivery-progress";
    progress.innerHTML = `
        <div class="shop-cart-mode-header__progress-surface">
          <div class="shop-cart-mode-header__progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">
            <div class="shop-cart-mode-header__progress-fill"></div>
          </div>
          <div class="shop-cart-mode-header__progress-label"></div>
        </div>
    `;

    section.appendChild(toggleWrap);
    section.appendChild(addressBtn);
    section.appendChild(meta);
    section.appendChild(progress);
    updateCartModeHeaderUi(section);
    return section;
  }

  const cartModeHeaderStickyRegistry = new WeakMap();
  const CART_MODE_HEADER_COLLAPSE_FALLBACK = 52;
  const CART_MODE_HEADER_EXPAND_FALLBACK = 12;

  function ensureCartModeHeaderStickyProxy(rootEl, headerEl, stateEntry = null) {
    if (!rootEl || !headerEl || !headerEl.parentNode) {
      return {
        proxyHost: null,
        proxyEl: null,
      };
    }

    const existingHost = stateEntry?.proxyHost || null;
    const existingProxy = stateEntry?.proxyEl || null;
    if (
      existingHost &&
      existingProxy &&
      existingHost.isConnected &&
      existingProxy.isConnected &&
      existingHost.parentNode === headerEl.parentNode &&
      existingHost.nextElementSibling === headerEl
    ) {
      existingProxy.classList.add("shop-cart-mode-header--sticky-proxy", "is-condensed");
      existingHost.classList.remove("is-visible");
      updateCartModeHeaderUi(existingHost);
      return {
        proxyHost: existingHost,
        proxyEl: existingProxy,
      };
    }

    if (existingHost && existingHost.isConnected) {
      existingHost.remove();
    }

    const proxyHost = document.createElement("div");
    proxyHost.className = "shop-cart-mode-header-sticky-host";

    const proxyEl = headerEl.cloneNode(true);
    proxyEl.classList.add("shop-cart-mode-header--sticky-proxy", "is-condensed");
    proxyEl
      .querySelectorAll("[data-cart-mode-address-bound], [data-cart-mode-toggle-bound]")
      .forEach((node) => {
        node.removeAttribute("data-cart-mode-address-bound");
        node.removeAttribute("data-cart-mode-toggle-bound");
      });

    proxyHost.appendChild(proxyEl);
    headerEl.parentNode.insertBefore(proxyHost, headerEl);
    updateCartModeHeaderUi(proxyHost);
    if (typeof bindCartItemsSectionControls === "function") {
      bindCartItemsSectionControls(proxyHost);
    }

    return {
      proxyHost,
      proxyEl,
    };
  }

  function measureCartModeHeaderStickyThresholds(headerEl, proxyEl = null) {
    if (!headerEl) {
      return {
        collapseAt: CART_MODE_HEADER_COLLAPSE_FALLBACK,
        expandAt: CART_MODE_HEADER_EXPAND_FALLBACK,
      };
    }

    const expandedHeight = Math.max(
      0,
      Number(headerEl.offsetHeight || headerEl.getBoundingClientRect?.().height || headerEl.scrollHeight || 0)
    );
    const condensedHeight = Math.max(
      0,
      Number(proxyEl?.offsetHeight || proxyEl?.getBoundingClientRect?.().height || proxyEl?.scrollHeight || 0)
    );
    const collapseDistance = Math.max(0, expandedHeight - condensedHeight);
    const collapseAt = Math.max(
      CART_MODE_HEADER_COLLAPSE_FALLBACK,
      Math.round(collapseDistance)
    );
    const expandAt = Math.max(
      8,
      Math.min(collapseAt - 16, CART_MODE_HEADER_EXPAND_FALLBACK)
    );

    return {
      collapseAt,
      expandAt,
    };
  }

  function resolveCartModeHeaderScrollContainer(rootEl, headerEl = null) {
    const root = rootEl || headerEl?.closest?.(".shop-cart-list") || headerEl;
    if (!root) return null;
    const sheetRoot = root.closest?.(".shop-cart-sheet");
    if (sheetRoot) {
      return root.matches?.(".shop-cart-list") ? root : root.querySelector?.(".shop-cart-list");
    }
    return root.closest?.(".shop-cart-content") || root;
  }

  function syncCartModeHeaderSticky(container, { forceExpand = null } = {}) {
    if (!container) return;
    const stateEntry = cartModeHeaderStickyRegistry.get(container);
    if (
      !stateEntry ||
      !stateEntry.headerEl ||
      !stateEntry.headerEl.isConnected ||
      !stateEntry.proxyHost ||
      !stateEntry.proxyEl ||
      !stateEntry.proxyHost.isConnected ||
      !stateEntry.proxyEl.isConnected
    ) {
      return;
    }

    const currentTop = Math.max(0, Number(container.scrollTop || 0));
    let condensed = !!stateEntry.condensed;
    const thresholds = measureCartModeHeaderStickyThresholds(stateEntry.headerEl, stateEntry.proxyEl);
    stateEntry.collapseAt = thresholds.collapseAt;
    stateEntry.expandAt = thresholds.expandAt;

    if (forceExpand === true || currentTop <= 6) {
      condensed = false;
    } else if (forceExpand === false) {
      condensed = true;
    } else if (!condensed && currentTop >= stateEntry.collapseAt) {
      condensed = true;
    } else if (condensed && currentTop <= stateEntry.expandAt) {
      condensed = false;
    }

    stateEntry.proxyHost.classList.toggle("is-visible", condensed);
    stateEntry.condensed = condensed;
    stateEntry.lastTop = currentTop;
  }

  function unbindCartModeHeaderSticky(container) {
    if (!container) return;
    const stateEntry = cartModeHeaderStickyRegistry.get(container);
    if (!stateEntry) return;
    if (stateEntry.onScroll) {
      container.removeEventListener("scroll", stateEntry.onScroll);
    }
    if (stateEntry.proxyHost && stateEntry.proxyHost.isConnected) {
      stateEntry.proxyHost.remove();
    }
    cartModeHeaderStickyRegistry.delete(container);
  }

  function bindCartModeHeaderSticky(rootEl) {
    if (!rootEl || !rootEl.querySelector) return;
    const headerEl = rootEl.querySelector(".shop-cart-mode-header:not(.shop-cart-mode-header--sticky-proxy)");
    if (!headerEl) return;

    const container = resolveCartModeHeaderScrollContainer(rootEl, headerEl);
    if (!container) return;

    let stateEntry = cartModeHeaderStickyRegistry.get(container);
    if (!stateEntry) {
      stateEntry = {
        headerEl,
        lastTop: Math.max(0, Number(container.scrollTop || 0)),
        condensed: false,
        collapseAt: CART_MODE_HEADER_COLLAPSE_FALLBACK,
        expandAt: CART_MODE_HEADER_EXPAND_FALLBACK,
        proxyHost: null,
        proxyEl: null,
        framePending: false,
        onScroll: null,
      };
      stateEntry.onScroll = () => {
        if (stateEntry.framePending) return;
        stateEntry.framePending = true;
        requestAnimationFrame(() => {
          stateEntry.framePending = false;
          syncCartModeHeaderSticky(container);
        });
      };
      container.addEventListener("scroll", stateEntry.onScroll, { passive: true });
      cartModeHeaderStickyRegistry.set(container, stateEntry);
    }

    stateEntry.headerEl = headerEl;
    const proxyParts = ensureCartModeHeaderStickyProxy(rootEl, headerEl, stateEntry);
    stateEntry.proxyHost = proxyParts.proxyHost;
    stateEntry.proxyEl = proxyParts.proxyEl;
    stateEntry.lastTop = Math.max(0, Number(container.scrollTop || 0));
    const thresholds = measureCartModeHeaderStickyThresholds(headerEl, stateEntry.proxyEl);
    stateEntry.collapseAt = thresholds.collapseAt;
    stateEntry.expandAt = thresholds.expandAt;
    syncCartModeHeaderSticky(container, { forceExpand: stateEntry.lastTop <= 6 });
  }

  window.bindShopCartModeHeaderSticky = bindCartModeHeaderSticky;
  window.syncShopCartModeHeaderSticky = syncCartModeHeaderSticky;

function updateAddressChip() {
  const line = getCartHeaderAddressLine();

  // chip ????? ??? ?????? ???????, ?? ? ???????/?????????? ?? ?????
  if (elAddressChip) {
    elAddressChip.textContent = line || "Укажите адрес";
    elAddressChip.classList.toggle("chip-plus", !line);
    elAddressChip.title = line || "";
  }

  // ???? ?????? ?????? ????? ???????/?????????? В корзине пусто???? ???????
  const headerEl = document.querySelector(".shop-cart-header");
  const isAddrTitle = !!headerEl && headerEl.classList.contains("is-address-title");
  const isCartLike = cartViewMode === "cart" || cartViewMode === "checkout";

  if (isCartLike && isAddrTitle && elCartHeaderTitle) {
    // ?????: ?? ?????? textContent, ? ?????? + ????????
    const t = line || "Укажите адрес";
    renderCartHeaderAddressTitle(t);

    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
    elCartHeaderTitle.classList.add("is-clickable-address-title");
    updateCartHeaderStoreStatus({ ensureStores: true });
  }

  updateCartModeHeaderUi();
}

function updateHeaderAddressWidget() {
  const textEl = document.getElementById("headerAddressText");
  const iconEl = document.querySelector(".header-address-icon");
  if (!textEl) return;

  let hasAddressText = false;

  // Pickup mode
  if (window._deliveryMode === "pickup" && window._selectedPickupStoreId) {
    const stores = window._pickupStores || [];
    const store = stores.find((s) => Number(s.id) === Number(window._selectedPickupStoreId));
    if (store) {
      textEl.textContent = formatHeaderPickupStoreAddress(store) || "Самовывоз";
      textEl.classList.remove("is-placeholder");
      hasAddressText = true;
      if (iconEl) {
        iconEl.classList.remove("fa-location-dot");
        iconEl.classList.add("fa-store");
      }
    }
  }

  // Delivery mode (default)
  if (!hasAddressText) {
    if (iconEl) {
      iconEl.classList.remove("fa-store");
      iconEl.classList.add("fa-location-dot");
    }
    const a = state.selectedAddress;
    if (a) {
      const headerAddressText = formatHeaderAddressStreetHouseApartment(a);
      if (headerAddressText) {
        textEl.textContent = headerAddressText;
        textEl.classList.remove("is-placeholder");
        hasAddressText = true;
      } else {
        textEl.textContent = "Укажите адрес доставки";
        textEl.classList.add("is-placeholder");
      }
    } else {
      textEl.textContent = "Укажите адрес доставки";
      textEl.classList.add("is-placeholder");
    }
  }

  updateMobileHeaderStoreStatus({ ensureStores: hasAddressText });
  updateCartModeHeaderUi();
}

function setCartHeader({
  title,
  showAddressChip = true,
  showProfileActions = false,
  showBack = false,
  onBack = null,
  showFav = false,
  hideTitle = false,

  // ????? ?????? ????????? (???????/??????????)
  addressAsTitle = false,

  // NEW: ??????? ???????? (??? ?????? ???????)
  showClose = false,
  onClose = null,
  showAddressModeToggle = false,
  hideHeaderShell = false,
  useSheetHeaderShell = false,
} = {}) {
  const headerEl = document.querySelector(".shop-cart-header");

  // --- ensure close button (creates once) ---
  let closeBtn = document.querySelector("#shopCartCloseBtn");
  if (!closeBtn && headerEl) {
    const right = headerEl.querySelector(".shop-cart-header-right");
    if (right) {
      closeBtn = document.createElement("button");
      closeBtn.id = "shopCartCloseBtn";
      closeBtn.type = "button";
      closeBtn.className = "btn btn-icon shop-cart-close hidden";
      closeBtn.setAttribute("aria-label", "Закрыть");
      closeBtn.innerHTML = `<i class="fas fa-times"></i>`;
      right.appendChild(closeBtn);
    }
  }

  if (closeBtn) {
    closeBtn.classList.toggle("hidden", !showClose);
    closeBtn.onclick = typeof onClose === "function" ? onClose : null;
  }

  // --- title render ---
  if (elCartHeaderTitle && typeof title === "string") {
    if (addressAsTitle) {
      renderCartHeaderAddressTitle(title);
      updateCartHeaderStoreStatus({ ensureStores: true });

      elCartHeaderTitle.classList.add("is-clickable-address-title");
    } else {
      // ??????? ?????
      elCartHeaderTitle.textContent = title;
      elCartHeaderTitle.classList.remove("is-clickable-address-title");
    }
  }

  // title show/hide
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("hidden", !!hideTitle);

  // address chip / profile actions / back
  if (elAddressChip) elAddressChip.classList.toggle("hidden", !showAddressChip);
  if (elProfileHeaderActions) elProfileHeaderActions.classList.toggle("hidden", !showProfileActions);
  if (elCartBackBtn) {
    elCartBackBtn.classList.toggle("hidden", !showBack);
    elCartBackBtn.onclick = typeof onBack === "function" ? onBack : null;
  }

  // fav (desktop panel header)
  const elCartFavBtn = $("#shopCartFavBtn");
  if (elCartFavBtn) elCartFavBtn.classList.toggle("hidden", !showFav);

  if (!showProfileActions && elProfileMenu) elProfileMenu.classList.add("hidden");

  if (elCartHeaderModeWrap) {
    elCartHeaderModeWrap.classList.toggle("hidden", !showAddressModeToggle);
  }
  if (headerEl) {
    headerEl.classList.toggle("is-address-mode", !!showAddressModeToggle);
    headerEl.classList.toggle("is-shell-hidden", !!hideHeaderShell && isDesktopViewport());
    headerEl.classList.toggle("is-sheet-shell", !!useSheetHeaderShell && isDesktopViewport());
  }

  // ????? ?????? ??? ??????????
  if (headerEl) headerEl.classList.toggle("is-address-title", !!addressAsTitle);
  if (elCartHeaderTitle) elCartHeaderTitle.classList.toggle("is-address-title", !!addressAsTitle);
}

function setSheetHeaderMode(
  mode,
  { onBack, discountBadge, favoriteBuildSnapshot, favoriteAfterToggle, showBackInHeader = true } = {}
) {
  const header = document.querySelector(".app-modal-header");
  if (!header) return;

  // Удаляем предыдущий бейдж скидки
  const oldBadge = header.querySelector(".shop-sheet-discount-badge");
  if (oldBadge) oldBadge.remove();

  // ??????? ?????? ??????? ?В корзине пусто?, ????? ?? ???? ???В корзине пусто ???????? ? ?????? ??????
  const orderBackBtn = header.querySelector(".app-modal-back-btn");
  if (orderBackBtn) orderBackBtn.remove();

  // ??????? ????? ??????? (? ?????? ??????? AppModal ?? ????? ?????????? ??-???????)
  const closeBtn =
    header.querySelector(".app-modal-close") ||
    header.querySelector("[data-modal-close]") ||
    header.querySelector("button[aria-label='Закрыть']") ||
    header.querySelector("button[aria-label='Close']") ||
    header.querySelector(".modal-close") ||
    header.querySelector(".btn-close");

  // title (???? ???? ????????? ???????)
  const titleEl =
    header.querySelector(".app-modal-title") ||
    header.querySelector(".modal-title") ||
    header.querySelector("[data-modal-title]");

  // ensure back btn (left)
  let backBtn = header.querySelector("#shopSheetBackBtn");
  if (!backBtn) {
    backBtn = document.createElement("button");
    backBtn.id = "shopSheetBackBtn";
    backBtn.type = "button";
    backBtn.className = "btn btn-icon shop-sheet-back";
    backBtn.setAttribute("aria-label", "Назад");
    backBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;
    header.prepend(backBtn);
  }
  if (backBtn.parentElement !== header) {
    header.prepend(backBtn);
  }

  // ensure fav btn (right)
  let favBtn = header.querySelector("#shopSheetFavBtn");
  if (!favBtn) {
    favBtn = document.createElement("button");
    favBtn.id = "shopSheetFavBtn";
    favBtn.type = "button";
    favBtn.className = "btn btn-icon shop-sheet-fav";
    favBtn.setAttribute("aria-label", "Избранное");
    favBtn.innerHTML = `<i class="fas fa-heart"></i>`;
    header.appendChild(favBtn);
  }

  // bind back handler (????????? ?????? ???)
  backBtn.onclick = () => {
    if (typeof onBack === "function") onBack();
  };
  backBtn.setAttribute("aria-label", "Назад");
  backBtn.innerHTML = `<i class="fas fa-arrow-left"></i>`;

  const isProduct = mode === "product";
  const isOrder = mode === "order";
  const isSubscreen = mode === "subscreen";

  // Product: ???????? ?/?, ?????? ?, ?????? title
  // Order: ???????? ?, ?????? ?, ???????? title
  backBtn.classList.toggle("hidden", (!isProduct && !isOrder && !isSubscreen) || showBackInHeader === false);
  favBtn.classList.toggle("hidden", !isProduct);

  if (isProduct) {
    const nextFavBtn = favBtn.cloneNode(true);
    favBtn.replaceWith(nextFavBtn);
    favBtn = nextFavBtn;
    favBtn.classList.remove("is-active", "is-busy");
    delete favBtn.dataset.favoriteId;

    if (typeof favoriteBuildSnapshot === "function") {
      bindFavoriteButtonsForCartRow(
        [favBtn],
        () => favoriteBuildSnapshot(),
        {
          afterToggle:
            typeof favoriteAfterToggle === "function" ? favoriteAfterToggle : undefined,
        }
      );
    }
  }

  if (closeBtn) closeBtn.classList.toggle("hidden", isProduct || isOrder);
  if (titleEl) titleEl.classList.toggle("hidden", isProduct);

  // Бейдж скидки по центру хедера
  if (discountBadge) {
    const badge = document.createElement("span");
    badge.className = "shop-sheet-discount-badge";
    badge.textContent = discountBadge;
    favBtn.before(badge);
  }
}

  function setCartFooterMode(mode) {
    if (!elCartFooter) return;
    const isHidden = mode === "hidden";
    elCartFooter.classList.toggle("hidden", isHidden);
    if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", mode !== "cart");
    if (elCheckoutFooterActions) elCheckoutFooterActions.classList.toggle("hidden", mode !== "checkout");
    if (elOrderDetailsFooterActions) elOrderDetailsFooterActions.classList.toggle("hidden", mode !== "order-details");
    if (elDesktopDeliveryProgressWrap) {
      elDesktopDeliveryProgressWrap.classList.toggle("hidden", mode === "order-details");
    }
  }

  function hideDesktopBenefitsPanels({ clearDetail = false } = {}) {
    if (elCheckoutBenefitsContent) {
      elCheckoutBenefitsContent.classList.add("hidden");
    }
    if (elCheckoutBenefitDetailContent) {
      elCheckoutBenefitDetailContent.classList.add("hidden");
      if (clearDetail) {
        elCheckoutBenefitDetailContent.innerHTML = "";
      }
    }
  }

  function getDesktopCheckoutActions() {
    return { submitBtn: elCheckoutSubmitBtn, backBtn: elCheckoutBackBtn };
  }

  function getDesktopCheckoutOverlayHost(create = false) {
    if (!elCheckoutContent) return null;
    const existingHost = elCheckoutContent.closest(".shop-checkout-overlay-host--desktop");
    if (existingHost) return existingHost;
    if (!create) return null;
    const parent = elCheckoutContent.parentElement;
    if (!parent) return null;
    const host = document.createElement("div");
    host.className = "shop-checkout-overlay-host shop-checkout-overlay-host--desktop hidden";
    const backdrop = document.createElement("button");
    backdrop.type = "button";
    backdrop.className = "shop-checkout-overlay-backdrop";
    backdrop.setAttribute("aria-label", "Закрыть оформление");
    const panel = document.createElement("section");
    panel.className = "shop-checkout-overlay-panel shop-checkout-overlay-panel--desktop";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Оформление заказа");
    const header = document.createElement("div");
    header.className = "shop-checkout-overlay-header";
    const title = document.createElement("div");
    title.className = "shop-checkout-overlay-title";
    title.textContent = "Оформление заказа";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "shop-checkout-overlay-close";
    closeBtn.setAttribute("aria-label", "Закрыть оформление");
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
    const footerHost = document.createElement("div");
    footerHost.className = "shop-checkout-overlay-footer";
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);
    host.appendChild(backdrop);
    host.appendChild(panel);
    parent.insertBefore(host, elCheckoutContent);
    panel.appendChild(elCheckoutContent);
    panel.appendChild(footerHost);
    host.__footerHost = footerHost;
    host.__actionsOriginParent = elCheckoutFooterActions ? elCheckoutFooterActions.parentElement : null;
    const handleClose = () => {
      showCartView();
    };
    backdrop.addEventListener("click", handleClose);
    closeBtn.addEventListener("click", handleClose);
    return host;
  }

  function setDesktopCheckoutOverlayActive(active) {
    const nextActive = !!active;
    const overlayHost = getDesktopCheckoutOverlayHost(nextActive);
    if (overlayHost) {
      overlayHost.classList.toggle("hidden", !nextActive);
      overlayHost.classList.toggle("is-active", nextActive);
      overlayHost.closest(".shop-cart")?.classList.toggle("shop-cart--checkout-overlay-active", nextActive);
      const footerHost = overlayHost.__footerHost;
      const actionsOriginParent = overlayHost.__actionsOriginParent;
      if (elCheckoutFooterActions && footerHost) {
        if (nextActive) {
          footerHost.appendChild(elCheckoutFooterActions);
          elCheckoutFooterActions.classList.remove("hidden");
        } else {
          (actionsOriginParent || overlayHost.parentElement)?.appendChild(elCheckoutFooterActions);
          elCheckoutFooterActions.classList.add("hidden");
          elCheckoutFooterActions.classList.remove("is-order-success");
        }
      }
    }
    document.body.classList.toggle("shop-checkout-overlay-open", nextActive);
    if (elCheckoutContent) {
      elCheckoutContent.classList.toggle("shop-checkout-content--overlay", nextActive);
      if (!nextActive) {
        elCheckoutContent.scrollTop = 0;
      }
    }
  }

  async function openDesktopCheckoutView({ onBack = showCartView } = {}) {
    if (!elCheckoutContent) return;
    showCheckoutView();
    await openCheckoutView({
      container: elCheckoutContent,
      onBack,
      onShowBenefits: showDesktopBenefitsView,
      hasAddressEditor: true,
      isSheet: false,
      actions: getDesktopCheckoutActions(),
      onEditAddress: async () => {
        window._deliveryMode = "delivery";
        await openAddressEditorFromCheckout({ preferredMode: "delivery", backMode: "desktop-panel" });
      },
      onEditPickup: async () => {
        window._deliveryMode = "pickup";
        await openAddressEditorFromCheckout({ preferredMode: "pickup", backMode: "desktop-panel" });
      },
    });
  }

  function applyTheme(nextTheme) {
    const root = document.documentElement;
    const next = nextTheme === "dark" ? "dark" : "light";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    const btn = document.getElementById("theme-toggle");
    if (btn) {
      const icon = btn.querySelector("i");
      if (icon) icon.className = next === "dark" ? "fas fa-sun" : "fas fa-moon";
    }
  }

  function getCurrentTheme() {
    return document.documentElement.getAttribute("data-theme") || "light";
  }

  function setHeaderFavoritesButtonActive(isActive = false) {
    if (!elHeaderFavoritesBtn) return;
    const active = Boolean(isActive);
    elHeaderFavoritesBtn.classList.toggle("is-active", active);
    elHeaderFavoritesBtn.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function cleanupDesktopFavoritesPanelIfNeeded() {
    const cleanupFn = window.__shopDesktopFavoritesCleanup;
    if (typeof cleanupFn !== "function") return;
    window.__shopDesktopFavoritesCleanup = null;
    try {
      cleanupFn();
    } catch (e) {
      console.warn("Failed to cleanup desktop favorites panel:", e);
    }
  }

  window.setHeaderFavoritesButtonActive = setHeaderFavoritesButtonActive;

  function setSelectedAddress(addr) {
    state.selectedAddress = addr || null;
    updateAddressChip();
    updateHeaderAddressWidget();
    syncSelectedAddressToCheckoutDraft();
    if (typeof window.warmCheckoutDeliveryConditions === "function") {
      Promise.resolve(window.warmCheckoutDeliveryConditions("selected-address")).catch(() => {});
    }
    if (typeof updateMobileDeliveryProgress === "function") {
      Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
    }

    // ???В корзине пусто?? checkout ? ??????? ????
    try {
      if (window.AppModal && window.AppModal.isOpen && window.AppModal.isOpen()) {
        const inp = window.AppModal.body?.querySelector?.('[data-role="delivery-address"]');
        if (inp) inp.value = getSelectedAddressLine();
      }
    } catch {}

    document.querySelectorAll('[data-role="delivery-address"]').forEach((inp) => {
      inp.value = getSelectedAddressLine();
    });
  }

function showCartView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "cart";
  openProductCtx = null;
  if (typeof window._comboStepBackCallback !== "undefined") window._comboStepBackCallback = null;
  window._checkoutMethodCode = window._deliveryMode === "pickup" ? "takeaway" : "delivery";
  setDesktopCheckoutOverlayActive(false);

  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCartContent) elCartContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  hideDesktopBenefitsPanels({ clearDetail: true });

  const line = getCartHeaderAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    hideTitle: false,
    showAddressChip: false,
    showProfileActions: false,
    showBack: true,
    onBack: () => backAfterAddressSelection(),
    showFav: false,
    addressAsTitle: true,
    showClose: false,
    hideHeaderShell: true,
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("cart");
  syncCartFooterVisibilityForCartMode(cartItemsResolved().length);
  renderCartIfDirty();
  if (typeof window.syncShopCartPricingSummaryUi === "function") {
    Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
  }
  if (typeof window.syncShopCartBenefitsServiceUi === "function") {
    Promise.resolve(window.syncShopCartBenefitsServiceUi(elCartList || elCartContent || document)).catch(() => {});
  }
  updateCartModeHeaderUi();
  if (typeof updateMobileDeliveryProgress === "function") {
    Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
  }
  queueMobileUiStateSync("showCartView");
}

function showCheckoutView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "checkout";
  openProductCtx = null;
  if (elCartContent) elCartContent.classList.remove("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elPickupContent) elPickupContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.remove("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  hideDesktopBenefitsPanels({ clearDetail: true });

  const line = getCartHeaderAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    hideTitle: false,
    showAddressChip: false,
    showProfileActions: false,
    showBack: true,
    onBack: () => backAfterAddressSelection(),
    showFav: false,
    addressAsTitle: true,
    showClose: false,
    hideHeaderShell: true,
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("cart");
  syncCartFooterVisibilityForCartMode(cartItemsResolved().length);
  renderCartIfDirty();
  if (typeof window.syncShopCartPricingSummaryUi === "function") {
    Promise.resolve(window.syncShopCartPricingSummaryUi()).catch(() => {});
  }
  if (typeof window.syncShopCartBenefitsServiceUi === "function") {
    Promise.resolve(window.syncShopCartBenefitsServiceUi(elCartList || elCartContent || document)).catch(() => {});
  }
  updateCartModeHeaderUi();
  if (typeof updateMobileDeliveryProgress === "function") {
    Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
  }
  setDesktopCheckoutOverlayActive(true);
  queueMobileUiStateSync("showCheckoutView");
}

function showAddressListView(backMode = "cart", opts = {}) {
  if (!elAddressContent || !elAddressListView || !elAddressFormView) return;

  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "address";
  openProductCtx = null;
  setDesktopCheckoutOverlayActive(false);
  state._addressListBackMode = backMode;
  state._addressPendingAddress = state.selectedAddress ? { ...state.selectedAddress } : null;
  state._addressPendingPickupStoreId = window._selectedPickupStoreId ? Number(window._selectedPickupStoreId) : null;

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  hideDesktopBenefitsPanels({ clearDetail: true });

  elAddressContent.classList.remove("hidden");
  elAddressListView.classList.remove("hidden");
  elAddressFormView.classList.add("hidden");
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

  setCartHeader({
    title: "",
    showAddressChip: false,     // IMPORTANT: ??? ???????
    showProfileActions: false,
    showBack: true,
    onBack: () => backAfterAddressSelection(),
    showFav: false,
    hideTitle: true,
    addressAsTitle: false,      // IMPORTANT: ??? ??????? ???
    showClose: true,            // ??????? ??????
    onClose: () => backAfterAddressSelection(),
    showAddressModeToggle: true,
  });

  setCartFooterMode("hidden");
  const preferredMode = (opts && (opts.preferredMode === "pickup" || opts.preferredMode === "delivery"))
    ? opts.preferredMode
    : (window._deliveryMode === "pickup" ? "pickup" : "delivery");
  setAddressListMode(preferredMode, { rerender: false });
  renderAddressList();
  if (typeof updateMobileDeliveryProgress === "function") {
    Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
  }
  queueMobileUiStateSync("showAddressListView");
}

async function showAddressFormView(prefill, editingId, backMode) {
  if (!elAddressContent || !elAddressFormView || !elAddressListView) return;

  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  setDesktopCheckoutOverlayActive(false);
  const addressMapModeEnabled = isAddressMapModeEnabled();
  state.addressEditingId = editingId ? Number(editingId) : null;
  state._addressFormBackMode = backMode || (state.selectedAddress ? "list" : "cart");
  cartViewMode = "address";
  openProductCtx = null;

  // ensure stores loaded for city selector
  if (!window._pickupStores || !window._pickupStores.length) {
    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : null;
      if (tenantId) {
        const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
        const data = await resp.json();
        if (data?.ok && Array.isArray(data.stores)) window._pickupStores = data.stores;
      }
    } catch {}
  }
  if (elAddrCity) {
    initCustomSelect(elAddrCity, prefill?.city);
  }
  resetAddressFormResolvedState(addressMapModeEnabled ? (prefill || null) : null);
  if (elAddrLookupWrap) {
    elAddrLookupWrap.classList.toggle("hidden", !addressMapModeEnabled);
  }
  syncAddressFormMapLayout(addressMapModeEnabled);
  if (elAddrLookup) {
    elAddrLookup.value = addressMapModeEnabled ? buildAddressLookupDisplay(prefill || {}) : "";
  }
  closeAddressLookupPopover();
  if (elAddrStreet) elAddrStreet.value = str(prefill?.street || "");
  if (elAddrHouse) elAddrHouse.value = str(prefill?.house || "");
  if (elAddrEntrance) elAddrEntrance.value = str(prefill?.entrance || "");
  if (elAddrFloor) elAddrFloor.value = str(prefill?.floor || "");
  if (elAddrApartment) elAddrApartment.value = str(prefill?.apartment || "");
  if (elAddrComment) elAddrComment.value = str(prefill?.comment || "");

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  hideDesktopBenefitsPanels({ clearDetail: true });

  elAddressContent.classList.remove("hidden");
  elAddressFormView.classList.remove("hidden");
  elAddressListView.classList.add("hidden");
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");

  const line = getSelectedAddressLine();
  const t = line || "Укажите адрес";

  setCartHeader({
    title: t,
    showAddressChip: false,
    showProfileActions: false,
    showBack: false,
    showFav: false,
    hideTitle: false,
    addressAsTitle: false,
    showClose: true,
    onClose: () => backAfterAddressSelection(),
  });

  if (elCartHeaderTitle) {
    elCartHeaderTitle.classList.toggle("is-empty-address", !line);
  }

  setCartFooterMode("hidden");
  if (typeof updateMobileDeliveryProgress === "function") {
    Promise.resolve(updateMobileDeliveryProgress()).catch(() => {});
  }
  queueMobileUiStateSync("showAddressFormView");
  setTimeout(() => {
    try {
      (addressMapModeEnabled ? elAddrLookup : elAddrStreet)?.focus?.();
    } catch {}
  }, 0);
}

function showPickupListView(backMode = "checkout") {
  if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
  showAddressListView(backMode, { preferredMode: "pickup" });
}

  function showProfileView() {
    cleanupDesktopFavoritesPanelIfNeeded();
    setHeaderFavoritesButtonActive(false);
    cartViewMode = "profile";
    openProductCtx = null;
    setDesktopCheckoutOverlayActive(false);
    if (elCartContent) elCartContent.classList.add("hidden");
    if (elAddressContent) elAddressContent.classList.add("hidden");
    if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
    if (elProductContent) elProductContent.classList.add("hidden");
    if (elProfileContent) elProfileContent.classList.remove("hidden");
    hideDesktopBenefitsPanels({ clearDetail: true });
    setCartHeader({ title: "Профиль", showAddressChip: false, showProfileActions: true, showBack: false });
    setCartFooterMode("hidden");
    queueMobileUiStateSync("showProfileView");
  }

  function rememberPreviousPanel() {
    if (cartViewMode === "profile") return;
    previousPanelMode = cartViewMode;
    previousPanelProductId = openProductCtx?.productId || null;
  }

  async function restorePreviousPanel() {
    if (previousPanelMode === "favorites" && typeof openFavoritesSheet === "function") {
      await openFavoritesSheet({ force: false, forceOpen: true });
      return;
    }
    if (previousPanelMode === "product" && previousPanelProductId) {
      await openProductDetails(previousPanelProductId);
      return;
    }
    if (previousPanelMode === "checkout" && elCheckoutContent) {
      await openDesktopCheckoutView({ onBack: showCartView });
      return;
    }
    if (previousPanelMode === "address") {
      showAddressListView(state._addressListBackMode || "cart");
      return;
    }
    showCartView();
  }

function showProductView() {
  cleanupDesktopFavoritesPanelIfNeeded();
  setHeaderFavoritesButtonActive(false);
  cartViewMode = "product";
  setDesktopCheckoutOverlayActive(false);

  if (elCartContent) elCartContent.classList.add("hidden");
  if (elAddressContent) elAddressContent.classList.add("hidden");
  if (elCheckoutContent) elCheckoutContent.classList.add("hidden");
  if (elProfileContent) elProfileContent.classList.add("hidden");
  if (elProductContent) elProductContent.classList.remove("hidden");
  hideDesktopBenefitsPanels({ clearDetail: true });

  // Product mode (desktop header): ? ?????, ? ??????, title+chip ??????
  setCartHeader({
    title: "",
    hideTitle: true,
    showAddressChip: false,
    showProfileActions: false,
    showBack: true,
    onBack: () => {
      void restorePreviousPanel();
    },
    showFav: true,
  });

  setCartFooterMode("hidden");
  queueMobileUiStateSync("showProductView");
}

  async function reloadAddressesFromServer() {
    try {
      const json = await apiJson("/api/public/me/addresses");
      state.addresses = Array.isArray(json.data) ? json.data : [];
    } catch {
      state.addresses = [];
    }
  }

  function invalidateMeBootstrap() {
    meBootstrapPromise = null;
    meBootstrapLoaded = false;
    meBootstrapToken = "";
  }

  async function loadMeBootstrap({ force = false } = {}) {
    const token = getCustomerToken();
    if (!token) return null;

    if (force) invalidateMeBootstrap();

    if (meBootstrapLoaded && meBootstrapToken === token) {
      return {
        customer: getCustomerCache(),
        addresses: Array.isArray(state.addresses) ? state.addresses : [],
      };
    }
    if (meBootstrapPromise) return meBootstrapPromise;

    meBootstrapPromise = (async () => {
      try {
        const json = await apiJson("/api/public/me/bootstrap");
        const payload = json?.data || {};
        const customer = payload?.customer || null;
        const addresses = Array.isArray(payload?.addresses) ? payload.addresses : [];
        if (customer) setCustomerCache(customer);
        state.addresses = addresses;
        meBootstrapLoaded = true;
        meBootstrapToken = token;
        return { customer, addresses };
      } catch (e) {
        if (String(e?.message || "").includes("UNAUTHORIZED")) {
          clearCustomer();
          state.addresses = [];
          return null;
        }
        throw e;
      } finally {
        meBootstrapPromise = null;
      }
    })();

    return meBootstrapPromise;
  }
  window.loadShopMeBootstrap = loadMeBootstrap;

  function pickDefaultAddress(list) {
    const arr = Array.isArray(list) ? list : [];
    return arr.find(a => Number(a.is_default) === 1) || arr[0] || null;
  }

  async function syncDraftAddressToAccountIfNeeded() {
    const token = getCustomerToken();
    if (!token) return false;
    const cachedCustomer = getCustomerCache();
    if (!cachedCustomer) return false;

    const draft = loadAddressDraft();
    if (!draft) return false;

    const payload = normalizeAddressPayload(draft);
    if (!payload.street || !payload.house) return false;

    try {
      await apiJson("/api/public/me/addresses", { method: "POST", body: { ...payload, is_default: 1 } });
      clearAddressDraft();
      return true;
    } catch (e) {
      // ?? ????????? ?????????
      console.error(e);
      return false;
    }
  }

  async function refreshAddressState(opts = {}) {
    const force = !!opts?.force;
    const token = getCustomerToken();
    if (token) {
      const boot = await loadMeBootstrap({ force });
      const me = boot?.customer || null;
      if (me) {
        const syncedDraft = await syncDraftAddressToAccountIfNeeded();
        if (syncedDraft) {
          await loadMeBootstrap({ force: true });
        }
        const sel = pickDefaultAddress(state.addresses);
        state._addressesInitialized = true;
        setSelectedAddress(sel ? sel : null);
        return;
      }
    }

    // guest / token invalid
    state.addresses = [];
    const draft = loadAddressDraft();
    state._addressesInitialized = true;
    setSelectedAddress(draft ? { ...draft, _local: true } : null);
  }

  function backAfterAddressSelection() {
    const back = state._addressListBackMode || state._addressFormBackMode || "cart";
    if (back === "profile") {
      openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
      return;
    }
    if (back === "checkout" && elCheckoutContent) {
      void openDesktopCheckoutView({ onBack: showCartView });
      return;
    }
    showCartView();
  }

  function attachDoubleDelete(btn, onConfirm, { timeout = 2500 } = {}) {
    const originalHtml = btn.innerHTML;
    const originalTitle = btn.title || "";
    let timer = null;
    const mobileCheckoutLabel = "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C";

    const setMobileCheckoutCompact = (compact) => {
      if (!elMobileCheckoutBtn || !elMobileCartTotal) return;
      if (compact) {
        elMobileCheckoutBtn.dataset.compactSumOnly = "1";
        elMobileCheckoutBtn.textContent = "";
        elMobileCheckoutBtn.appendChild(elMobileCartTotal);
        return;
      }
      if (elMobileCheckoutBtn.dataset.compactSumOnly !== "1") return;
      delete elMobileCheckoutBtn.dataset.compactSumOnly;
      elMobileCheckoutBtn.textContent = `${mobileCheckoutLabel} \u00B7 `;
      elMobileCheckoutBtn.appendChild(elMobileCartTotal);
    };

    const reset = () => {
      btn.classList.remove("is-confirm");
      btn.dataset.confirming = "";
      btn.innerHTML = originalHtml;
      btn.title = originalTitle;
      btn.setAttribute("aria-label", originalTitle || "Удалить");
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (btn.dataset.confirming === "1") {
        reset();
        await onConfirm();
        return;
      }

      btn.dataset.confirming = "1";
      btn.classList.add("is-confirm");
      btn.innerHTML = "Удалить?";
      btn.title = "Нажмите ещё раз чтобы удалить";
      btn.setAttribute("aria-label", "Удалить? Нажмите ещё раз чтобы удалить");
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, timeout);
    });

    btn.addEventListener("blur", reset);
  }

  function isSameAddressRef(a, b) {
    if (!a || !b) return false;
    if (a.id && b.id) return Number(a.id) === Number(b.id);
    return !!a._local && !!b._local;
  }

  function normalizePhoneForTel(raw) {
    return str(raw || "").replace(/[^\d+]/g, "").replace(/^8/, "+7").replace(/^7/, "+7");
  }

  function formatPickupPhone(raw) {
    const digits = str(raw || "").replace(/\D/g, "");
    const normalized = digits.length === 11 ? digits : (digits.length === 10 ? "7" + digits : digits);
    if (normalized.length === 11) {
      return `+${normalized[0]} ${normalized.slice(1, 4)} ${normalized.slice(4, 7)}-${normalized.slice(7, 9)}-${normalized.slice(9, 11)}`;
    }
    return str(raw || "");
  }

  function getStoreTodayHoursRangeForList(storeHours, timezone) {
    if (!Array.isArray(storeHours) || !storeHours.length) return "";
    const offsetHours = Number.isNaN(Number(timezone)) ? 0 : Number(timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + offsetHours * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = storeHours.find((h) => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return "";
    const opens = entry.opens_at ? String(entry.opens_at).slice(0, 5) : "";
    const closes = entry.closes_at ? String(entry.closes_at).slice(0, 5) : "";
    return (opens && closes) ? `${opens} - ${closes}` : "";
  }

  function getStoreStatusInfoForList(store) {
    if (!Array.isArray(store?.storeHours) || !store.storeHours.length) return null;
    const tz = Number.isNaN(Number(store.timezone)) ? 0 : Number(store.timezone);
    const now = new Date();
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
    const localMs = utcMs + tz * 60 * 60 * 1000;
    const localDate = new Date(localMs);
    const currentDay = localDate.getDay();
    const entry = store.storeHours.find((h) => Number(h.day_of_week) === currentDay);
    if (!entry || Number(entry.is_closed) === 1) return { open: false, text: "Закрыто - выходной" };

    const opens = entry.opens_at ? String(entry.opens_at).slice(0, 5) : "";
    const closes = entry.closes_at ? String(entry.closes_at).slice(0, 5) : "";
    if (!opens || !closes) return null;

    const hhmm = localDate.getHours() * 60 + localDate.getMinutes();
    const [oh, om] = opens.split(":").map(Number);
    const [ch, cm] = closes.split(":").map(Number);
    const openMin = oh * 60 + om;
    const closeMin = ch * 60 + cm;

    if (hhmm >= openMin && hhmm < closeMin) {
      return { open: true, text: `Открыто до ${closes}` };
    }
    return { open: false, text: `Закрыто до ${opens}` };
  }

  function ensureValidPickupStoreIdForAddressList(stores) {
    const ids = (Array.isArray(stores) ? stores : [])
      .map((s) => Number(s?.id))
      .filter((id) => Number.isFinite(id));

    if (!ids.length) {
      state._addressPendingPickupStoreId = null;
      return null;
    }

    const pendingId = Number(state._addressPendingPickupStoreId);
    if (Number.isFinite(pendingId) && ids.includes(pendingId)) {
      return pendingId;
    }

    const selectedId = Number(window._selectedPickupStoreId);
    if (Number.isFinite(selectedId) && ids.includes(selectedId)) {
      state._addressPendingPickupStoreId = selectedId;
      return selectedId;
    }

    const draft = loadCheckoutDraft();
    const draftId = Number(draft.pickup_store_id);
    if (Number.isFinite(draftId) && ids.includes(draftId)) {
      state._addressPendingPickupStoreId = draftId;
      window._selectedPickupStoreId = draftId;
      return draftId;
    }

    const activeStoreId = Number(localStorage.getItem("activeStoreId"));
    const fallbackId = (Number.isFinite(activeStoreId) && ids.includes(activeStoreId))
      ? activeStoreId
      : ids[0];

    state._addressPendingPickupStoreId = fallbackId;
    window._selectedPickupStoreId = fallbackId;
    return fallbackId;
  }

  async function ensurePickupStoresLoadedForAddressList() {
    if (window._pickupStores && window._pickupStores.length) {
      ensureValidPickupStoreIdForAddressList(window._pickupStores);
      return window._pickupStores;
    }

    try {
      const metaTenant = document.querySelector('meta[name="tenant_id"]');
      const tenantId = metaTenant ? Number(metaTenant.content) : null;
      if (!tenantId) return [];

      const resp = await fetch(`/api/public/tenant/stores?tenant_id=${tenantId}`);
      const data = await resp.json();
      if (data?.ok && Array.isArray(data.stores)) {
        window._pickupStores = data.stores;
        ensureValidPickupStoreIdForAddressList(window._pickupStores);
        return window._pickupStores;
      }
    } catch {}

    return [];
  }

  function setAddressListMode(mode, { rerender = true } = {}) {
    const nextMode = mode === "pickup" ? "pickup" : "delivery";
    state._addressListMode = nextMode;

    const isPickup = nextMode === "pickup";
    if (elAddressToggleDeliveryBtn) elAddressToggleDeliveryBtn.classList.toggle("is-active", !isPickup);
    if (elAddressTogglePickupBtn) elAddressTogglePickupBtn.classList.toggle("is-active", isPickup);

    const top = elAddressListView ? elAddressListView.querySelector(".shop-address-list-top") : null;
    if (top) top.classList.toggle("hidden", isPickup);

    // Show/hide pickup header with city selector
    if (elPickupListTop) elPickupListTop.classList.toggle("hidden", !isPickup);

    if (elAddressListTitle) {
      elAddressListTitle.textContent = isPickup ? "Точки самовывоза" : "Мои адреса";
    }

    if (elAddressList) elAddressList.classList.toggle("hidden", isPickup);
    if (elAddressPickupList) elAddressPickupList.classList.toggle("hidden", !isPickup);
    if (elAddressConfirmBtn) {
      elAddressConfirmBtn.textContent = isPickup ? "Заказать здесь" : "Доставить сюда";
    }

    if (rerender) renderAddressList();
  }

  function renderAddressList() {
    if (state._addressListMode === "pickup") {
      void renderAddressPickupList();
      return;
    }
    renderAddressDeliveryList();
  }

  function renderAddressDeliveryList() {
    if (!elAddressList) return;

    elAddressList.innerHTML = "";
    if (elAddressPickupList) elAddressPickupList.innerHTML = "";

    const token = getCustomerToken();
    const list = (token ? state.addresses : []) || [];
    const localDraft = loadAddressDraft();
    const local = (!token && localDraft) ? [{ ...localDraft, id: null, _local: true }] : [];
    const effectiveList = token ? list : local;

    if (!effectiveList.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Адресов пока нет.";
      elAddressList.appendChild(empty);
      state._addressPendingAddress = null;
      if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = true;
      return;
    }

    let pendingAddress = state._addressPendingAddress;
    if (!pendingAddress || !effectiveList.some((a) => isSameAddressRef(a, pendingAddress))) {
      pendingAddress = effectiveList.find((a) => isSameAddressRef(a, state.selectedAddress)) || effectiveList[0] || null;
      state._addressPendingAddress = pendingAddress ? { ...pendingAddress } : null;
    }
    if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = !state._addressPendingAddress;

    const updateRadios = () => {
      elAddressList.querySelectorAll(".shop-address-row").forEach((row) => {
        const rid = row.dataset.addrId;
        const isLocal = row.dataset.addrLocal === "1";
        const match = state._addressPendingAddress
          ? rid && state._addressPendingAddress.id
            ? Number(rid) === Number(state._addressPendingAddress.id)
            : isLocal && !!state._addressPendingAddress._local
          : false;
        row.classList.toggle("is-selected", match);
      });
    };

    effectiveList.forEach((a) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";
      if (a.id) row.dataset.addrId = String(a.id);
      if (a._local) row.dataset.addrLocal = "1";
      if (state._addressPendingAddress && isSameAddressRef(a, state._addressPendingAddress)) {
        row.classList.add("is-selected");
      }

      const radio = document.createElement("div");
      radio.className = "shop-address-radio";
      row.appendChild(radio);

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      const titleEl = document.createElement("div");
      titleEl.className = "shop-address-card-title";
      titleEl.textContent = formatAddressLine(a) || "";
      main.appendChild(titleEl);

      const sub = a.comment ? str(a.comment) : "";
      if (sub) {
        const subEl = document.createElement("div");
        subEl.className = "shop-address-card-sub";
        subEl.textContent = sub;
        main.appendChild(subEl);
      }

      const actions = document.createElement("div");
      actions.className = "shop-address-actions shop-address-actions--compact";

      const btnEdit = document.createElement("button");
      btnEdit.type = "button";
      btnEdit.className = "shop-address-action-icon";
      btnEdit.innerHTML = `<i class="fas fa-pen"></i>`;
      btnEdit.addEventListener("click", (e) => {
        e.stopPropagation();
        showAddressFormView(a, token ? a.id : null, "list");
      });
      actions.appendChild(btnEdit);

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "shop-address-action-icon is-danger";
      btnDel.title = "Удалить";
      btnDel.innerHTML = `<i class="fas fa-times"></i>`;
      attachDoubleDelete(btnDel, async () => {
        if (token && a.id) {
          try {
            await apiJson(`/api/public/me/addresses/${a.id}`, { method: "DELETE" });
            await refreshAddressState({ force: true });
            if (state._addressPendingAddress && isSameAddressRef(a, state._addressPendingAddress)) {
              state._addressPendingAddress = null;
            }
            renderAddressList();
          } catch (err) {
            alert("Не удалось удалить адрес");
          }
          return;
        }

        clearAddressDraft();
        setSelectedAddress(null);
        state._addressPendingAddress = null;
        renderAddressList();
      });
      actions.appendChild(btnDel);

      card.appendChild(main);
      card.appendChild(actions);
      row.appendChild(card);

      row.addEventListener("click", () => {
        state._addressPendingAddress = { ...a };
        if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = false;
        updateRadios();
      });

      elAddressList.appendChild(row);
    });
  }

  async function renderAddressPickupList() {
    if (!elAddressPickupList) return;

    elAddressPickupList.innerHTML = "";
    if (elAddressList) elAddressList.innerHTML = "";

    const allStores = await ensurePickupStoresLoadedForAddressList();

    // Initialize city selector
    initPickupCitySelector();

    // Filter by selected city
    const stores = state._selectedPickupCity
      ? allStores.filter(s => s.city === state._selectedPickupCity)
      : allStores;

    if (!stores.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "16px";
      empty.textContent = state._selectedPickupCity
        ? `Нет точек самовывоза в городе ${state._selectedPickupCity}.`
        : "Нет доступных точек самовывоза.";
      elAddressPickupList.appendChild(empty);
      state._addressPendingPickupStoreId = null;
      if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = true;
      return;
    }

    let pendingPickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
    state._addressPendingPickupStoreId = pendingPickupStoreId;
    if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = !pendingPickupStoreId;

    const updatePickupRadios = () => {
      elAddressPickupList.querySelectorAll(".shop-address-row").forEach((row) => {
        const sid = Number(row.dataset.storeId);
        row.classList.toggle("is-selected", Number.isFinite(sid) && Number(sid) === Number(pendingPickupStoreId));
      });
    };

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row shop-pickup-inline-row";
      row.dataset.storeId = String(store.id);

      if (Number(store.id) === Number(pendingPickupStoreId)) row.classList.add("is-selected");
      if (store.isOpen === false) row.classList.add("is-closed");

      const radio = document.createElement("div");
      radio.className = "shop-address-radio";
      row.appendChild(radio);

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      if (store.city) {
        const cityEl = document.createElement("div");
        cityEl.className = "shop-pickup-city";
        cityEl.textContent = store.city;
        main.appendChild(cityEl);
      }

      const addrEl = document.createElement("div");
      addrEl.className = "shop-pickup-address";
      addrEl.textContent = store.address || store.name || (`Точка #${store.id}`);
      main.appendChild(addrEl);

      const statusInfo = getStoreStatusInfoForList(store);
      if (statusInfo) {
        const statusEl = document.createElement("div");
        statusEl.className = "shop-pickup-status " + (statusInfo.open ? "is-open" : "is-closed");
        statusEl.textContent = statusInfo.text;
        main.appendChild(statusEl);
      }

      const hoursRange = getStoreTodayHoursRangeForList(store.storeHours, store.timezone);
      if (hoursRange) {
        const hoursRow = document.createElement("div");
        hoursRow.className = "shop-pickup-info-row";
        const label = document.createElement("span");
        label.className = "shop-pickup-info-label";
        label.textContent = "Время работы";
        const value = document.createElement("span");
        value.className = "shop-pickup-info-value";
        value.textContent = hoursRange;
        hoursRow.appendChild(label);
        hoursRow.appendChild(value);
        main.appendChild(hoursRow);
      }

      if (store.phone) {
        const phoneRow = document.createElement("div");
        phoneRow.className = "shop-pickup-info-row";

        const label = document.createElement("span");
        label.className = "shop-pickup-info-label";
        label.textContent = "Телефон";

        const link = document.createElement("a");
        link.className = "shop-pickup-phone-link";
        link.href = `tel:${normalizePhoneForTel(store.phone)}`;
        link.textContent = formatPickupPhone(store.phone);
        link.addEventListener("click", (e) => e.stopPropagation());

        phoneRow.appendChild(label);
        phoneRow.appendChild(link);
        main.appendChild(phoneRow);
      }

      card.appendChild(main);
      row.appendChild(card);

      row.addEventListener("click", () => {
        pendingPickupStoreId = Number(store.id);
        state._addressPendingPickupStoreId = pendingPickupStoreId;
        if (elAddressConfirmBtn) elAddressConfirmBtn.disabled = false;
        updatePickupRadios();
      });

      elAddressPickupList.appendChild(row);
    });
  }

  async function confirmAddressListSelection() {
    const mode = state._addressListMode === "pickup" ? "pickup" : "delivery";

    if (mode === "pickup") {
      const stores = await ensurePickupStoresLoadedForAddressList();
      const pickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
      if (!pickupStoreId) return;

      const resolvedPickupStoreId = Number(pickupStoreId);
      state._addressPendingPickupStoreId = resolvedPickupStoreId;
      window._selectedPickupStoreId = resolvedPickupStoreId;
      window._deliveryMode = "pickup";

      const draft = loadCheckoutDraft();
      draft.method_code = "takeaway";
      draft.method_user_selected = true;
      draft.pickup_store_id = resolvedPickupStoreId;
      saveCheckoutDraft(draft);

      if (window._updatePickupAddressCallback) {
        try { window._updatePickupAddressCallback(); } catch {}
      }

      updateHeaderAddressWidget();
      updateAddressChip();
      backAfterAddressSelection();
      return;
    }

    const pendingAddress = state._addressPendingAddress;
    if (!pendingAddress) return;

    const token = getCustomerToken();
    if (token && pendingAddress.id) {
      try {
        await apiJson(`/api/public/me/addresses/${pendingAddress.id}/default`, { method: "PUT" });
        await refreshAddressState({ force: true });
      } catch (e) {
        alert("Не удалось выбрать адрес");
        return;
      }
    } else {
      const localAddress = pendingAddress._local
        ? { ...pendingAddress, _local: true }
        : { ...pendingAddress };
      setSelectedAddress(localAddress);
    }

    window._deliveryMode = "delivery";
    const draft = loadCheckoutDraft();
    draft.method_code = "delivery";
    draft.method_user_selected = true;
    draft.pickup_store_id = null;
    saveCheckoutDraft(draft);

    updateHeaderAddressWidget();
    updateAddressChip();
    backAfterAddressSelection();
  }

  function renderPickupList() {
    if (!elPickupList) return;

    elPickupList.innerHTML = "";

    // ???????? ?????? ????? ?? ?????????? ?????????? pickupStores (??????????? ? buildCheckoutForm)
    const stores = window._pickupStores || [];

    if (!stores.length) {
      elPickupList.innerHTML = `<div class="muted">Нет доступных точек самовывоза.</div>`;
      return;
    }

    const currentStoreId = window._selectedPickupStoreId || null;

    stores.forEach((store) => {
      const row = document.createElement("div");
      row.className = "shop-address-row";

      const isSelected = currentStoreId && Number(store.id) === Number(currentStoreId);
      if (isSelected) row.classList.add("is-selected");

      // ????????? ????? ??? ???????? ?????
      if (store.isOpen === false) row.classList.add("is-closed");

      // ??????? ????? ?? ?????? (????? ????? ? ??????)
      const fullAddress = store.address || store.name || 'Точка #' + store.id;

      const card = document.createElement("div");
      card.className = "shop-address-card";

      const main = document.createElement("div");
      main.className = "shop-address-card-main";

      const titleEl = document.createElement("div");
      titleEl.className = "shop-address-card-title";
      titleEl.textContent = store.name || 'Точка ' + store.id;
      main.appendChild(titleEl);

      const subEl = document.createElement("div");
      subEl.className = "shop-address-card-sub";
      subEl.textContent = fullAddress;
      main.appendChild(subEl);

      // ????????? ???? ?????? ?? ???????
      const hoursText = formatTodayHours(store.storeHours, store.timezone);
      if (hoursText) {
        const hoursEl = document.createElement("div");
        hoursEl.className = "shop-address-card-hours";
        hoursEl.textContent = hoursText;
        main.appendChild(hoursEl);
      }

      card.appendChild(main);

      if (isSelected) {
        const checkIcon = document.createElement("div");
        checkIcon.className = "shop-address-check-icon";
        checkIcon.innerHTML = `<i class="fas fa-check"></i>`;
        card.appendChild(checkIcon);
      }

      row.appendChild(card);

      row.addEventListener("click", async () => {
        window._deliveryMode = "pickup";
        window._selectedPickupStoreId = Number(store.id);

        // ????????? ???? ? ????? ???????
        if (window._updatePickupAddressCallback) {
          window._updatePickupAddressCallback();
        }

        // ???????????? ? ??????
        const back = state._pickupListBackMode || "checkout";
        if (back === "checkout" && elCheckoutContent) {
          await openDesktopCheckoutView({ onBack: showCartView });
        } else {
          showCartView();
        }
      });

      elPickupList.appendChild(row);
    });
  }

  async function openAddressEditorFromCheckout({ preferredMode, backMode = "desktop-panel" } = {}) {
    await refreshAddressState();
    const token = getCustomerToken();
    const hasList = token ? (state.addresses || []).length : !!loadAddressDraft();
    const prefill = state.selectedAddress && !state.selectedAddress._local
      ? state.selectedAddress
      : (loadAddressDraft() || state.selectedAddress);
    const currentPickupMode = window._deliveryMode === "pickup";
    const resolvedMode =
      preferredMode === "pickup"
        ? "pickup"
        : preferredMode === "delivery"
          ? "delivery"
          : (currentPickupMode ? "pickup" : "delivery");

    window._deliveryMode = resolvedMode;
    openCartSheet();
    if (!openCartSheetCtx) return;

    if (resolvedMode === "pickup" || hasList || getSelectedAddressLine()) {
      if (typeof openCartSheetCtx.showSheetAddressList === "function") {
        openCartSheetCtx.showSheetAddressList(backMode || "desktop-panel");
      }
      return;
    }
    if (typeof openCartSheetCtx.showSheetAddressForm === "function") {
      await openCartSheetCtx.showSheetAddressForm(prefill || null, null, backMode || "desktop-panel");
    }
  }

async function initAddresses() {
  async function openAddressFlow(fromMode = "cart") {
    await refreshAddressState();
    const token = getCustomerToken();
    const hasList = token ? (state.addresses || []).length > 0 : !!loadAddressDraft();
    const isPickupMode = window._deliveryMode === "pickup";
    const resolvedBackMode =
      fromMode === "checkout"
        ? "checkout"
        : fromMode === "header"
          ? "header"
          : fromMode === "desktop-panel"
            ? "desktop-panel"
            : "cart";
    openCartSheet();
    if (!openCartSheetCtx) return;
    if (isPickupMode || hasList || getSelectedAddressLine()) {
      if (typeof openCartSheetCtx.showSheetAddressList === "function") {
        openCartSheetCtx.showSheetAddressList(resolvedBackMode);
      }
    }
    else if (typeof openCartSheetCtx.showSheetAddressForm === "function") {
      await openCartSheetCtx.showSheetAddressForm(loadAddressDraft(), null, resolvedBackMode);
    }
  }

  // chip (???? ?? ????) ? ????? ???????? ??? fallback
  if (elAddressChip) {
    elAddressChip.addEventListener("click", async () => {
      await openAddressFlow("cart");
    });
  }

  // header address widget (mobile)
  const headerAddrBtn = document.getElementById("headerAddressButton");
  if (headerAddrBtn) {
    headerAddrBtn.addEventListener("click", async () => {
      const isCartSheetOpen =
        !!window.AppModal &&
        typeof window.AppModal.isOpen === "function" &&
        window.AppModal.isOpen() &&
        sheetNavigationState.type === "cart";
      if (!isCartSheetOpen) openCartSheet();
      if (openCartSheetCtx?.showSheetAddressList) {
        openCartSheetCtx.showSheetAddressList("header");
      }
      if (typeof setActiveNav === "function") setActiveNav("menu");
    });
  }

  // ???????: ???? ?? ????????? ??????? (??????)
  if (elCartHeaderTitle) {
    elCartHeaderTitle.addEventListener("click", async (e) => {
      // ?????? ???????/??????????
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;
      e.preventDefault();
      e.stopPropagation();
      await openAddressFlow("cart");
    });
  }

  // ?????????: ???? ????????? ????????????? ? ????? ???? ?? ????? ?????? ???????
  const cartHeader = document.querySelector(".shop-cart-header");
  if (cartHeader) {
    cartHeader.addEventListener("click", async (e) => {
      // ?????? ???????/??????????
      if (!(cartViewMode === "cart" || cartViewMode === "checkout")) return;

      // ????????? ?????? ???? ???? ??? ? ???? ?????????
      const t = e.target;
      const clickedTitle =
        (elCartHeaderTitle && (t === elCartHeaderTitle || elCartHeaderTitle.contains(t))) ||
        (t && t.closest && t.closest("#shopCartHeaderTitle"));

      if (!clickedTitle) return;

      e.preventDefault();
      e.stopPropagation();
      await openAddressFlow("cart");
    });
  }

  // + ????? ?????
  if (elAddressNewBtn) {
    elAddressNewBtn.addEventListener("click", () => showAddressFormView(null, null, "list"));
  }

  if (elAddressToggleDeliveryBtn) {
    elAddressToggleDeliveryBtn.addEventListener("click", () => setAddressListMode("delivery"));
  }
  if (elAddressTogglePickupBtn) {
    elAddressTogglePickupBtn.addEventListener("click", () => setAddressListMode("pickup"));
  }
  if (elAddressConfirmBtn) {
    elAddressConfirmBtn.addEventListener("click", async () => {
      await confirmAddressListSelection();
    });
  }

  if (elAddrLookup) {
    elAddrLookup.addEventListener("input", () => {
      if (!isAddressMapModeEnabled()) return;
      syncAddressLookupResolutionFromInputValue(elAddrLookup.value);
      scheduleAddressLookupSuggestions();
    });
    elAddrLookup.addEventListener("focus", () => {
      if (!isAddressMapModeEnabled()) return;
      if (str(elAddrLookup.value).trim().length >= 2) {
        if (showCurrentAddressLookupSuggestion()) return;
        scheduleAddressLookupSuggestions();
      }
    });
    elAddrLookup.addEventListener("keydown", async (event) => {
      if (!addressLookupState.open || !addressLookupState.items.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        addressLookupState.activeIndex = Math.min(addressLookupState.items.length - 1, addressLookupState.activeIndex + 1);
        renderAddressLookupPopover();
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        addressLookupState.activeIndex = Math.max(0, addressLookupState.activeIndex - 1);
        renderAddressLookupPopover();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        closeAddressLookupPopover();
        return;
      }
      if (event.key === "Enter") {
        const activeItem = addressLookupState.items[addressLookupState.activeIndex] || addressLookupState.items[0];
        if (!activeItem) return;
        event.preventDefault();
        await applyAddressLookupSuggestion(activeItem);
      }
    });
  }

  if (elAddrCity) {
    elAddrCity.addEventListener("change", () => {
      if (!isAddressMapModeEnabled()) return;
      closeAddressLookupPopover();
      resetAddressFormResolvedState(null);
      if (elAddrLookup) elAddrLookup.value = "";
      if (elAddrStreet) elAddrStreet.value = "";
      if (elAddrHouse) elAddrHouse.value = "";
    });
  }

  [elAddrStreet, elAddrHouse].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      if (!isAddressMapModeEnabled()) return;
      const resolved = state._addressFormResolved || {};
      if (!resolved.address_ref && resolved.lat == null && resolved.lng == null && !resolved.delivery_zone_id && !resolved.delivery_store_id) {
        return;
      }
      clearAddressFormResolution({ syncLookupFromFields: true });
    });
  });

  document.addEventListener("click", (event) => {
    if (!elAddrLookupWrap || !elAddrLookupWrap.contains(event.target)) {
      closeAddressLookupPopover();
    }
  });

  // ??????
  if (elAddressCancelBtn) {
    elAddressCancelBtn.addEventListener("click", () => {
      const back = state._addressFormBackMode || "cart";
      if (back === "list") {
        showAddressListView(state._addressListBackMode || "cart", { preferredMode: state._addressListMode });
      }
      else if (back === "checkout") {
        if (elCheckoutContent) {
          void openDesktopCheckoutView({ onBack: showCartView });
        } else {
          showCartView();
        }
      } else if (back === "profile") {
        openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
      } else showCartView();
    });
  }

  // ?????????
  if (elAddressSaveBtn) {
    elAddressSaveBtn.addEventListener("click", async () => {
      const addressMapModeEnabled = isAddressMapModeEnabled();
      const payload = normalizeAddressPayload({
        city: elAddrCity?.dataset?.value || "",
        address_normalized_display: addressMapModeEnabled ? elAddrLookup?.value : "",
        street: elAddrStreet?.value,
        house: elAddrHouse?.value,
        entrance: elAddrEntrance?.value,
        floor: elAddrFloor?.value,
        apartment: elAddrApartment?.value,
        comment: elAddrComment?.value,
        ...(addressMapModeEnabled ? (state._addressFormResolved || {}) : {}),
      });
      if (!payload.city) return alert("Укажите город");
      if (!payload.street || !payload.house) {
        if (addressMapModeEnabled) {
          setAddressLookupStatus("\u0423\u043a\u0430\u0436\u0438\u0442\u0435 \u0443\u043b\u0438\u0446\u0443 \u0438 \u043d\u043e\u043c\u0435\u0440 \u0434\u043e\u043c\u0430", "error");
          elAddrLookup?.focus?.();
          return;
        }
        if (!payload.street) return alert("Укажите улицу");
        return alert("Укажите дом");
      }
      elAddressSaveBtn.disabled = true;
      elAddressSaveBtn.textContent = "Сохранение...";

      try {
        const me = await fetchMeSafe();
        const token = getCustomerToken();

        if (me && token) {
          if (state.addressEditingId) {
            await apiJson(`/api/public/me/addresses/${state.addressEditingId}`, {
              method: "PUT",
              body: payload,
            });
          } else {
            await apiJson("/api/public/me/addresses", {
              method: "POST",
              body: { ...payload, is_default: 1 },
            });
          }
          await refreshAddressState({ force: true });

          // ????? ?????????? ? ???????? ?????
          if (state._addressFormBackMode === "profile") {
            await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
          } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
            await openDesktopCheckoutView({ onBack: showCartView });
          } else {
            showCartView();
          }
        } else {
          // guest
          saveAddressDraft(payload);
          setSelectedAddress({ ...payload, _local: true });

          if (state._addressFormBackMode === "profile") {
            await openProfilePanel(null, { forceOpen: true, initialTab: "addresses" });
          } else if (state._addressFormBackMode === "checkout" && elCheckoutContent) {
            await openDesktopCheckoutView({ onBack: showCartView });
          } else {
            showCartView();
          }
        }
      } catch (e) {
        console.error(e);
        alert("Не удалось сохранить адрес");
      } finally {
        elAddressSaveBtn.disabled = false;
        elAddressSaveBtn.textContent = "Сохранить";
      }
    });
  }

  await refreshAddressState();
  updateAddressChip();
  // Restore delivery mode from checkout draft
  try {
    const draft = loadCheckoutDraft();
    if (draft.method_code === "takeaway" || draft.method_code === "pickup") {
      window._deliveryMode = "pickup";
      if (draft.pickup_store_id) window._selectedPickupStoreId = Number(draft.pickup_store_id);
    } else {
      window._deliveryMode = "delivery";
    }
  } catch {}
  try {
    await Promise.all([
      ensureStoresForHeaderStatus().catch(() => []),
      ensureOrderConfigForHeader().catch(() => null),
    ]);
  } catch {}
  if (window._deliveryMode === "pickup" && (!window._selectedPickupStoreId || !getHeaderPickupStore())) {
    const stores = Array.isArray(window._pickupStores) ? window._pickupStores : [];
    const pickupStoreId = ensureValidPickupStoreIdForAddressList(stores);
    if (pickupStoreId) {
      window._selectedPickupStoreId = Number(pickupStoreId);
    }
  }
  syncImmediateCartHeaderHoursText(window._deliveryMode === "pickup" ? "pickup" : "delivery");
  updateHeaderAddressWidget();
  updateAddressChip();
  updateCartModeHeaderUi();
}

  // -----------------------------
  // UI: qty animation (photo overlay)
  // -----------------------------
  function animateNumber(el, newValue, dir) {
    const prev = el.getAttribute("data-v") || el.textContent.trim() || "0";
    const next = String(newValue);
    el.setAttribute("data-v", next);

    if (!prev || prev === next) {
      el.textContent = next;
      return;
    }

    el.innerHTML = "";
    const oldSpan = document.createElement("span");
    oldSpan.className = "qty-num qty-old";
    oldSpan.textContent = prev;

    const newSpan = document.createElement("span");
    newSpan.className = "qty-num qty-new";
    newSpan.textContent = next;

    el.appendChild(oldSpan);
    el.appendChild(newSpan);

    oldSpan.style.transform = "translateX(0)";
    oldSpan.style.opacity = "1";
    newSpan.style.transform = "translateX(0) scale(0.8)";
    newSpan.style.opacity = "0";

    void el.offsetWidth;

    requestAnimationFrame(() => {
      oldSpan.style.transform = dir === "inc" ? "translateX(-105%) scale(0.9)" : "translateX(105%) scale(0.9)";
      oldSpan.style.opacity = "0";
      newSpan.style.transform = "translateX(0) scale(1)";
      newSpan.style.opacity = "1";
    });

    setTimeout(() => {
      el.innerHTML = "";
      el.textContent = next;
    }, 320);
  }

  // -----------------------------
  // Categories
  // -----------------------------
  function createCatIcon(icon) {
    const wrap = document.createElement("div");
    wrap.className = "shop-cat-icon";

    const v = str(icon).trim();
    if (looksLikeUrl(v)) {
      const img = createOptimizedImage(v, {
        type: 'thumb',
        className: 'shop-cat-icon-img',
        alt: '',
        usePicture: true,
      });
      wrap.appendChild(img);
      return wrap;
    }

    if (v) {
      const i = document.createElement("i");
      i.className = v;
      wrap.appendChild(i);
      return wrap;
    }

    const dot = document.createElement("div");
    dot.className = "shop-cat-icon-ph";
    wrap.appendChild(dot);
    return wrap;
  }

  function setActiveCategory(categoryId, title, { scroll = false } = {}) {
    const id = Number(categoryId);
    if (!Number.isFinite(id)) return;

    const nextTitle = str(title || "Категория");
    state.activeCategoryId = id;
    state.activeCategoryTitle = nextTitle;
    if (elCategoryTitle) elCategoryTitle.textContent = nextTitle;

    updateCategoriesActiveUi();
    scrollChipsToCategory(id);

    if (scroll) scrollToCategory(id);
  }

  function scrollToCategory(categoryId) {
    const id = Number(categoryId);
    if (!Number.isFinite(id)) return;
    const header = elProductsGrid?.querySelector?.(`.shop-category-header[data-cat-id="${id}"]`);
    if (!header) return;

    isProgrammaticCategoryScroll = true;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      const headerH = Number(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0;
      const chipsH = elCatChipsWrap?.getBoundingClientRect ? elCatChipsWrap.getBoundingClientRect().height : 0;
      const offset = headerH + chipsH + 55;
      const rect = header.getBoundingClientRect();
      const top = window.scrollY + rect.top - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    } else {
      const scroller = elProductsScroller;
      const padTop = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop || "0") : 0;
      const offset = Math.max(0, padTop || 0) + 55;
      if (elProductsScroller && typeof elProductsScroller.scrollTo === "function") {
        const top = header.offsetTop - offset;
        elProductsScroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      } else if (typeof header.scrollIntoView === "function") {
        header.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }

    setTimeout(() => {
      isProgrammaticCategoryScroll = false;
      // После завершения программного скролла ещё раз выравниваем чипы,
      // чтобы правило привязки к левому краю сработало и при выборе через список категорий.
      scrollChipsToCategory(state.activeCategoryId);
    }, 450);
  }

  function refreshCategoryHeaders() {
    categoryHeaders = Array.from(elProductsGrid?.querySelectorAll?.(".shop-category-header") || []);
  }

  function scrollChipsToCategory(categoryId) {
    const id = Number(categoryId);
    if (!Number.isFinite(id) || !elCatChips) return;
    const chip = elCatChips.querySelector(`.shop-cat-chip[data-cat-id="${id}"]`);
    if (!chip) return;

    const scroller = elCatChips;
    const wrap = elCatChipsWrap || elCatChips;
    if (!scroller || !wrap) return;

    // Делаем так, чтобы активный чип оказывался у левого края (с небольшим отступом)
    const stopBeforeTrigger = window.matchMedia("(max-width: 768px)").matches && elCatSheetTriggerBtn
      ? (elCatSheetTriggerBtn.offsetWidth || 40) + 12
      : 12;
    let target = Math.max(0, chip.offsetLeft - stopBeforeTrigger);

    // Если уже почти на нужном месте — не дёргаем скролл
    const current = scroller.scrollLeft || 0;
    if (Math.abs(current - target) < 2) return;
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ left: target, behavior: "smooth" });
    } else {
      scroller.scrollLeft = target;
    }
  }

  function updateActiveCategoryFromScroll() {
    if (!categoryHeaders.length) return;
    if (isProgrammaticCategoryScroll) return;

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    let containerTop = 0;
    let offset = 0;
    if (isMobile) {
      const headerH = Number(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0;
      const chipsH = elCatChipsWrap?.getBoundingClientRect ? elCatChipsWrap.getBoundingClientRect().height : 0;
      offset = headerH + chipsH + 105;
      containerTop = 0;
    } else {
      containerTop = elProductsScroller?.getBoundingClientRect
        ? elProductsScroller.getBoundingClientRect().top
        : 0;
      const scroller = elProductsScroller;
      const padTop = scroller ? Number.parseFloat(getComputedStyle(scroller).paddingTop || "0") : 0;
      offset = Math.max(0, padTop || 0) + 105;
    }

    let activeHeader = categoryHeaders[0];
    if (!isMobile && elProductsScroller) {
      const scrollTop = elProductsScroller.scrollTop || 0;
      for (const h of categoryHeaders) {
        const top = h.offsetTop - scrollTop;
        if (top <= offset) activeHeader = h;
        else break;
      }
    } else {
      for (const h of categoryHeaders) {
        const top = h.getBoundingClientRect().top - containerTop;
        if (top <= offset) activeHeader = h;
        else break;
      }
    }

    const nextId = Number(activeHeader?.dataset?.catId);
    if (!Number.isFinite(nextId) || nextId === Number(state.activeCategoryId)) return;
    const nextTitle = activeHeader?.dataset?.catTitle || "";
    setActiveCategory(nextId, nextTitle, { scroll: false });
    ensureCategoryLoaded(nextId, { limit: 200 });
  }

  function bindCategoryScrollSpy() {
    if (bindCategoryScrollSpy._bound) return;
    bindCategoryScrollSpy._bound = true;
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const scroller = isMobile ? window : (elProductsScroller || window);
    if (!scroller || !scroller.addEventListener) return;
    scroller.addEventListener("scroll", () => {
      if (categoryScrollRaf) return;
      categoryScrollRaf = requestAnimationFrame(() => {
        categoryScrollRaf = null;
        updateActiveCategoryFromScroll();
      });
    });

    // Desktop fallback: also listen on window in case scroll container changes
    if (!isMobile && scroller !== window) {
      window.addEventListener("scroll", () => {
        if (categoryScrollRaf) return;
        categoryScrollRaf = requestAnimationFrame(() => {
          categoryScrollRaf = null;
          updateActiveCategoryFromScroll();
        });
      });
    }
  }

  function renderCategories() {
    elCatsList.innerHTML = "";

    getVisibleCategories().forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-cat-item";
      btn.setAttribute("data-cat-id", String(c.id));

      if (Number(state.activeCategoryId) === Number(c.id)) btn.classList.add("is-active");

      btn.appendChild(createCatIcon(c.icon));

      const text = document.createElement("div");
      text.className = "shop-cat-text";

      const title = document.createElement("div");
      title.className = "shop-cat-title";
      title.textContent = str(c.title);

      text.appendChild(title);
      btn.appendChild(text);

      btn.addEventListener("click", () => {
        selectCategory(c.id, c.title);
        closeShopSheetIfOpen();
      });

      elCatsList.appendChild(btn);
    });
  }

  function renderCategoryChips() {
    if (!elCatChips) return;
    elCatChips.innerHTML = "";

    const openCategoriesChipSheet = () => {
      const openSheet = () => {
        const isCategoriesSheetOpen =
          Boolean(window.AppModal && typeof window.AppModal.isOpen === "function" && window.AppModal.isOpen())
          && sheetNavigationState.type === "categories";
        if (isCategoriesSheetOpen) {
          if (typeof closeShopSheetIfOpen === "function") closeShopSheetIfOpen();
          return;
        }
        if (typeof closeShopSheetIfOpen === "function") closeShopSheetIfOpen();
        if (typeof window.openCategoriesSheet === "function") {
          window.openCategoriesSheet();
        }
      };

      if (window.__shopLateLoaded && typeof window.openCategoriesSheet === "function") {
        openSheet();
        return;
      }

      ensureShopLateLoaded().then(() => {
        openSheet();
      });
    };

    if (elCatSheetTriggerBtn) {
      elCatSheetTriggerBtn.onclick = openCategoriesChipSheet;
    }

    const triggerBtn = document.createElement("button");
    triggerBtn.type = "button";
    triggerBtn.className = "shop-cat-chip shop-cat-chip--sheet-trigger";
    triggerBtn.setAttribute("aria-label", "Категории");
    triggerBtn.setAttribute("title", "Категории");
    triggerBtn.innerHTML = '<i class="fas fa-list" aria-hidden="true"></i>';
    triggerBtn.addEventListener("click", openCategoriesChipSheet);
    elCatChips.appendChild(triggerBtn);

    getVisibleCategories().forEach((c) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "shop-cat-chip";
      btn.setAttribute("data-cat-id", String(c.id));
      btn.textContent = str(c.title);
      if (Number(state.activeCategoryId) === Number(c.id)) btn.classList.add("is-active");

      btn.addEventListener("click", () => {
        selectCategory(c.id, c.title);
      });

      elCatChips.appendChild(btn);
    });

    if (elCatChipsWrap) elCatChipsWrap.classList.remove("hidden");
    scrollChipsToCategory(state.activeCategoryId);
    bindCategoryChipsWheelScroll();
  }

  function bindCategoryChipsWheelScroll() {
    if (!elCatChips || elCatChips.dataset.wheelBound === "1") return;
    const tabletMq = window.matchMedia("(min-width: 769px) and (max-width: 1199px)");
    const onWheel = (event) => {
      if (!tabletMq.matches) return;
      const scroller = elCatChips;
      const maxScrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      if (maxScrollLeft <= 0) return;

      const deltaX = Number(event.deltaX || 0);
      const deltaY = Number(event.deltaY || 0);
      const primaryDelta = Math.abs(deltaX) > Math.abs(deltaY) ? deltaX : deltaY;
      if (!primaryDelta) return;

      const current = scroller.scrollLeft || 0;
      const next = Math.max(0, Math.min(maxScrollLeft, current + primaryDelta));
      if (Math.abs(next - current) < 0.5) return;

      event.preventDefault();
      scroller.scrollLeft = next;
    };
    elCatChips.addEventListener("wheel", onWheel, { passive: false });
    elCatChips.dataset.wheelBound = "1";
  }

  // -----------------------------
  // Pills
  // -----------------------------
  function createQtyPill({
    variant = "buy",
    big = false,
    centerText = "",
    centerHtml = "",
    minusEnabled = true,
    plusEnabled = true,
  } = {}) {
    const pill = document.createElement("div");
    pill.className = "qty-pill";
    if (variant === "muted") pill.classList.add("qty-pill--muted");
    if (big) pill.classList.add("qty-pill--big");

    const btnMinus = document.createElement("button");
    btnMinus.type = "button";
    btnMinus.className = "qty-pill__btn qty-pill__btn--minus";
    btnMinus.textContent = "−";
    if (!minusEnabled) {
      btnMinus.classList.add("is-disabled");
      btnMinus.disabled = true;
    }

    const center = document.createElement("div");
    center.className = "qty-pill__center";
    if (centerHtml) center.innerHTML = centerHtml;
    else center.textContent = centerText;

    const btnPlus = document.createElement("button");
    btnPlus.type = "button";
    btnPlus.className = "qty-pill__btn qty-pill__btn--plus";
    btnPlus.textContent = "+";
    if (!plusEnabled) {
      btnPlus.classList.add("is-disabled");
      btnPlus.disabled = true;
    }

    pill.appendChild(btnMinus);
    pill.appendChild(center);
    pill.appendChild(btnPlus);

    return { pill, btnMinus, btnPlus, center };
  }

  function formatCatalogDiscountBadgeAmount(amount) {
    const value = roundPrice(Number(amount || 0));
    if (!(value > 0)) return "";
    return `-${moneyNoSign(value)} ₽`;
  }

  function catalogMoneyNoKopeks(value) {
    const n = Number(value || 0);
    return moneyNoSign(Number.isFinite(n) ? Math.round(n) : 0);
  }

  function getCatalogProductDiscountBadge(product, calculatedPrice = null) {
    if (!product || typeof product !== "object") return "";

    const apiDiscount = product.discount;
    const apiDiscountAmount = roundPrice(Number(apiDiscount?.discount_amount || 0));
    if (apiDiscount && apiDiscountAmount > 0) {
      const discountType = str(apiDiscount.discount_type || "").trim().toLowerCase();
      const discountValue = Number(apiDiscount.discount_value || 0);
      if (discountType === "percent" && discountValue > 0) {
        return `-${Math.round(discountValue)}%`;
      }
      return formatCatalogDiscountBadgeAmount(apiDiscountAmount);
    }

    const currentPriceRaw = calculatedPrice != null
      ? Number(calculatedPrice)
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    const currentPrice = roundPrice(Number.isFinite(currentPriceRaw) ? currentPriceRaw : 0);
    const originalPriceRaw = product.original_price != null
      ? Number(product.original_price)
      : Number(product.old_price || 0);
    const originalPrice = roundPrice(Number.isFinite(originalPriceRaw) ? originalPriceRaw : 0);
    if (!(originalPrice > currentPrice && currentPrice >= 0)) return "";

    const percent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
    if (percent > 0) return `-${percent}%`;
    return formatCatalogDiscountBadgeAmount(originalPrice - currentPrice);
  }

  function getCatalogComboDiscountBadge(combo) {
    const discountPercent = Number(combo?.discount_percent || 0) || 0;
    if (!(discountPercent > 0)) return "";
    return `-${Math.round(discountPercent)}%`;
  }

  function createCatalogDiscountBadge(badgeText) {
    const text = str(badgeText || "").trim();
    if (!text) return null;
    const badge = document.createElement("div");
    badge.className = "sp-card-discount-badge sp-combo-discount";
    badge.textContent = text;
    return badge;
  }

  function getCatalogBuyXGetYBadgeText(product) {
    const source = product?.buy_x_get_y_badge;
    if (!source || typeof source !== "object") return "";
    const directText = str(source.badge_text || "").trim();
    const plusMatch = directText.match(/^(\d+)\s*\+\s*(\d+)$/);
    const equalsMatch = directText.match(/^(\d+)\s*=\s*(\d+)$/);
    const hasQty = source.buy_qty != null || source.reward_qty != null || !!plusMatch || !!equalsMatch;
    if (!hasQty) return directText;
    const buyQty = Math.max(1, Math.floor(Number(source.buy_qty ?? plusMatch?.[1] ?? equalsMatch?.[2] ?? 0)) || 1);
    const rewardQtyFromEquals = equalsMatch ? Math.max(1, Number(equalsMatch[1] || 0) - Number(equalsMatch[2] || 0)) : 0;
    const rewardQty = Math.max(1, Math.floor(Number(source.reward_qty ?? plusMatch?.[2] ?? rewardQtyFromEquals ?? 0)) || 1);
    if (buyQty > 0 && rewardQty > 0) return `${buyQty + rewardQty}=${buyQty}`;
    return directText;
  }

  function createCatalogBuyXGetYBadge(product) {
    const text = getCatalogBuyXGetYBadgeText(product);
    if (!text) return null;
    const badge = document.createElement("div");
    badge.className = "sp-card-bogo-badge";
    badge.textContent = text;
    return badge;
  }

  function isCatalogProductConfigurable(product) {
    const cfg = product?.blocks_config && typeof product.blocks_config === "object"
      ? product.blocks_config
      : null;
    return Boolean(
      cfg?.variants ||
      cfg?.options ||
      cfg?.ingredients ||
      (Array.isArray(product?.variants) && product.variants.length) ||
      (Array.isArray(product?.options) && product.options.length) ||
      (Array.isArray(product?.ingredients) && product.ingredients.length)
    );
  }

  function getCatalogMediaPillLabel(product, availableForAdd = true) {
    if (!availableForAdd) return "Раскупили";
    return isCatalogProductConfigurable(product) ? "Настроить" : "";
  }

  function createCatalogMediaPill(product, availableForAdd = true) {
    const label = getCatalogMediaPillLabel(product, availableForAdd);
    if (!label) return null;
    const pill = document.createElement("div");
    pill.className = "sp-media-pill";
    pill.setAttribute("data-media-pill", "1");
    pill.classList.toggle("is-sold-out", label === "Раскупили");
    pill.innerHTML = `<span class="sp-media-pill__text">${escapeHtml(label)}</span>${label === "Настроить" ? '<span class="sp-media-pill__chevron" aria-hidden="true">›</span>' : ""}`;
    return pill;
  }

  function getCatalogProductTitle(product) {
    const name = str(product?.name || "").trim();
    const variantLabel = str(product?.default_variant?.variant_label || "").trim();
    return [variantLabel, name].filter(Boolean).join(" ") || name;
  }

  function getCatalogProductDefaultLines(product) {
    return (Array.isArray(product?.catalog_default_lines) ? product.catalog_default_lines : [])
      .map((line) => str(line || "").trim())
      .filter(Boolean)
      .slice(0, 2);
  }

  function getCatalogBuyXGetYRule(product) {
    const source = product?.buy_x_get_y_badge;
    if (!source || typeof source !== "object") return null;
    const badgeText = str(source.badge_text || "").trim();
    const plusMatch = badgeText.match(/^(\d+)\s*\+\s*(\d+)$/);
    const equalsMatch = badgeText.match(/^(\d+)\s*=\s*(\d+)$/);
    const hasQty = source.buy_qty != null || source.reward_qty != null || !!plusMatch || !!equalsMatch;
    if (!hasQty) return null;
    const buyQty = Math.max(1, Math.floor(Number(source.buy_qty ?? plusMatch?.[1] ?? equalsMatch?.[2] ?? 0)) || 1);
    const rewardQtyFromEquals = equalsMatch ? Math.max(1, Number(equalsMatch[1] || 0) - Number(equalsMatch[2] || 0)) : 0;
    const rewardQty = Math.max(1, Math.floor(Number(source.reward_qty ?? plusMatch?.[2] ?? rewardQtyFromEquals ?? 0)) || 1);
    const repeatMode = str(source.repeat_mode || "").trim().toLowerCase() === "repeat" ? "repeat" : "single";
    return {
      id: Number(source.id || 0) || null,
      title: str(source.title || source.badge_text || "1+1").trim() || "1+1",
      buyQty,
      rewardQty,
      repeatMode,
      isStackable: Number(source.is_stackable || 0) === 1 || source.is_stackable === true,
    };
  }

  function calculateCatalogBuyXGetYApplication(qty, rule) {
    const itemQty = Math.max(0, Math.floor(Number(qty || 0)));
    if (!rule) {
      return {
        applications: 0,
        freeQty: 0,
        participatingQty: 0,
        paidParticipatingQty: 0,
      };
    }
    const buyQty = Math.max(1, Math.floor(Number(rule?.buyQty || 0)) || 1);
    const rewardQty = Math.max(1, Math.floor(Number(rule?.rewardQty || 0)) || 1);
    const groupQty = buyQty + rewardQty;
    if (!(itemQty >= groupQty)) {
      return {
        applications: 0,
        freeQty: 0,
        participatingQty: 0,
        paidParticipatingQty: 0,
      };
    }
    const applications = rule?.repeatMode === "repeat" ? Math.floor(itemQty / groupQty) : 1;
    const freeQty = Math.min(itemQty, applications * rewardQty);
    const participatingQty = Math.min(itemQty, applications * groupQty);
    return {
      applications,
      freeQty,
      participatingQty,
      paidParticipatingQty: Math.max(0, participatingQty - freeQty),
    };
  }

  function calculateCatalogBuyXGetYFreeQty(qty, rule) {
    return calculateCatalogBuyXGetYApplication(qty, rule).freeQty;
  }

  function syncCatalogProductDiscountBadge(card, product, calculatedPrice = null) {
    if (!card || !product) return;
    const media = $(".sp-media", card);
    if (!media) return;
    const badgeText = getCatalogProductDiscountBadge(product, calculatedPrice);
    const currentBadge = media.querySelector(".sp-card-discount-badge");
    if (!badgeText) {
      if (currentBadge) currentBadge.remove();
      return;
    }
    if (currentBadge) {
      currentBadge.textContent = badgeText;
      return;
    }
    const badge = createCatalogDiscountBadge(badgeText);
    if (badge) media.appendChild(badge);
  }

  function catalogCenterHtml(product, qty, calculatedPrice = null) {
    const old = Number(product.old_price || 0);
    let price = calculatedPrice != null
      ? calculatedPrice
      : (product.display_price != null ? Number(product.display_price) : Number(product.price || 0));
    let showOld = old > 0 && old > price;

    // Обработка скидок из API (бейдж теперь на картинке, здесь только цена)
    if (product.discount && product.discount.discount_amount > 0) {
      const originalPrice = Number(product.original_price || price);
      const discountedPrice = Number(product.discounted_price || price);
      
      // Отображаем старую цену зачёркнутой
      if (!showOld && originalPrice > discountedPrice) {
        showOld = true;
        price = discountedPrice;
      }
    }

    if (qty > 0) return `${catalogMoneyNoKopeks(price)} ₽`;
    if (showOld) {
      const oldPrice = product.discount ? Number(product.original_price) : old;
      return `<span class="sp-old-price">${catalogMoneyNoKopeks(oldPrice)} ₽</span>${catalogMoneyNoKopeks(price)} ₽`;
    }
    return `${catalogMoneyNoKopeks(price)} ₽`;
  }

  function isProductAvailable(product) {
    if (!product) return true;
    const explicitAvailability =
      product.is_available !== undefined && product.is_available !== null
        ? Number(product.is_available) === 1 || product.is_available === true
        : null;

    const pid = Number(product.id || product.product_id || 0);
    const stockEntry = Number.isFinite(pid) && pid > 0 ? getStockLevelEntry(pid) : null;
    const stockAvailability = stockEntry
      ? (
          stockEntry.isAvailable !== undefined && stockEntry.isAvailable !== null
            ? !!stockEntry.isAvailable
            : (stockEntry.qty === undefined || stockEntry.qty === null ? true : Number(stockEntry.qty) > 0)
        )
      : null;

    if (explicitAvailability === false || stockAvailability === false) return false;
    if (explicitAvailability === true) return true;
    if (stockAvailability !== null) return stockAvailability;

    if (product.stock_qty !== undefined && product.stock_qty !== null) {
      return Number(product.stock_qty) !== 0;
    }
    return true;
  }

  // ??? ??? ???????????? ??? ?? ?????????
  const defaultPriceCache = new Map();

  /**
   * ???????????? ???? ?????? ? ?????? ???????? ? ????? ?? ?????????
   */
  async function calculateDefaultPrice(product) {
    const productId = product.id;
    
    // ????????? ???
    if (defaultPriceCache.has(productId)) {
      return defaultPriceCache.get(productId);
    }

    let price = Number(product.price || 0);

    try {
      // ????????? ????????
      const variants = await resolveProductVariants(productId);
      
      // ???? ???? ????????, ????? ???? ???????? ?? ????????? (?????????????? ??? ?????????)
      if (variants.length > 0 && variants[0].values?.length > 0) {
        const variant = variants[0];
        // ?????????? default_value_index (?????????????? ??? ?????????), ???? ?????, ????? 0
        const defaultIndex = variant.default_value_index != null 
          ? Number(variant.default_value_index) 
          : 0;
        // ????????? ??? ?????? ????????
        const validIndex = defaultIndex >= 0 && defaultIndex < variant.values.length ? defaultIndex : 0;
        const variantState = {
          selectedIndex: validIndex,
          value: variant.values[validIndex],
          label: String(variant.values[validIndex]),
        };
        price = getVariantUnitPrice(product, variants, variantState);
      }

      // ????????? ?????
      const optionGroups = await resolveProductOptionGroups(productId);
      
      // ????????? ????????? ???????????? ????? ?? ?????????
      for (const group of optionGroups) {
        const groupType = getOptionGroupUiType(group);
        
        if (groupType === "single" && group.is_required && group.items?.length > 0) {
          // ??? single ? is_required ? ????? ?????? ??????? ??? ?????????
          const defaultItem = group.items[0];
          const defaultItemPrice = getOptionItemResolvedDefaultPrice(defaultItem);
          if (Number.isFinite(defaultItemPrice)) {
            price += defaultItemPrice;
          }
        } else if (groupType === "multiple_item" || groupType === "multiple_group") {
          const minSelect = Math.max(0, Number(group?.min_select ?? 0));
          if (minSelect <= 0) continue;

          let selectedCount = 0;
          for (const item of (group.items || [])) {
            if (selectedCount >= minSelect) break;
            const qtyMin = Number(item?.qty_min ?? 0);
            const defaultQty = qtyMin > 0 ? qtyMin : 1;
            if (item.price) {
              price += Number(item.price || 0) * defaultQty;
            }
            selectedCount += 1;
          }
        }
      }
    } catch (e) {
      console.error("Error calculating default price:", e);
    }

    // ????????? ? ???
    price = roundPrice(price);
    defaultPriceCache.set(productId, price);
    return price;
  }

  /**
   * ?????????? ????????? ???? ?? ???????? ??????
   */
  async function updateCardPrice(card, product) {
    const qty = cartQty(product.id);
    const calculatedPrice = await calculateDefaultPrice(product);
    
    const center = card.querySelector(".qty-pill__center");
    if (center) {
      center.innerHTML = catalogCenterHtml(product, qty, calculatedPrice);
    }
    syncCatalogProductDiscountBadge(card, product, calculatedPrice);
  }

  let __shopChatPromise = null;
  function ensureShopChatLoaded() {
    if (__shopChatPromise) return __shopChatPromise;
    __shopChatPromise = new Promise((resolve) => {
      if (window.__shopChatLoaded) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-shop-chat]');
      if (existing) {
        existing.addEventListener('load', () => {
          window.__shopChatLoaded = true;
          resolve();
        });
        existing.addEventListener('error', () => {
          __shopChatPromise = null;
          resolve();
        });
        return;
      }
      var url = window.__shopChatUrl || '/static/js/shop-company-chat.js';
      var sc = document.createElement('script');
      sc.src = url;
      sc.defer = true;
      sc.dataset.shopChat = '1';
      sc.onload = () => {
        window.__shopChatLoaded = true;
        resolve();
      };
      sc.onerror = () => {
        __shopChatPromise = null;
        resolve();
      };
      document.head.appendChild(sc);
    });
    return __shopChatPromise;
  }

  let __shopLatePromise = null;
  function ensureShopLateLoaded() {
    if (__shopLatePromise) return __shopLatePromise;
    __shopLatePromise = new Promise((resolve) => {
      if (window.__shopLateLoaded) {
        resolve();
        return;
      }
      const existing = document.querySelector('script[data-shop-late]');
      if (existing) {
        existing.addEventListener('load', () => {
          window.__shopLateLoaded = true;
          if (!window.__shopLateInitDone && typeof initShopLate === "function") {
            window.__shopLateInitDone = true;
            initShopLate();
          }
          resolve();
        });
        existing.addEventListener('error', () => { resolve(); });
        return;
      }
      const s = document.createElement('script');
      s.src = window.__shopLateUrl || '/static/js/shop-late.js';
      s.defer = true;
      s.dataset.shopLate = '1';
      s.onload = () => {
        window.__shopLateLoaded = true;
        if (!window.__shopLateInitDone && typeof initShopLate === "function") {
          window.__shopLateInitDone = true;
          initShopLate();
        }
        resolve();
      };
      s.onerror = () => { resolve(); };
      document.head.appendChild(s);
    });
    return __shopLatePromise;
  }

  function openProductDetails(productId, opts = {}) {
    try {
      if (stockEventsWaitAbortController) stockEventsWaitAbortController.abort();
    } catch {}
    return ensureShopLateLoaded().then(() => {
      if (typeof window.openProductDetails === "function" && window.openProductDetails !== openProductDetails) {
        return window.openProductDetails(productId, opts);
      }
    });
  }

  function bindShopWarmups() {
    if (bindShopWarmups._bound) return;
    bindShopWarmups._bound = true;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;

      // After first real user interaction we can warm up non-critical features.
      runWhenIdle(() => {
        try { ensureShopLateLoaded(); } catch {}
      }, 1500);

      runWhenIdle(() => {
        try {
          if (state.activeCategoryId != null) {
            ensureCategoryLoaded(state.activeCategoryId, { limit: 200 });
          }
        } catch {}
      }, 2000);

      runWhenIdle(() => {
        try { preloadCartEnhancers(); } catch {}
      }, 900);
    };

    ["pointerdown", "touchstart", "wheel", "keydown"].forEach((evt) => {
      window.addEventListener(evt, start, { passive: true, once: true });
    });

    const warmByCartIntent = () => {
      try { preloadCartEnhancers(); } catch {}
    };
    [elCartOpenDesktop, elNavCart, elMobileCheckoutBtn].forEach((el) => {
      if (!el || !el.addEventListener) return;
      el.addEventListener("pointerenter", warmByCartIntent, { passive: true, once: true });
      el.addEventListener("touchstart", warmByCartIntent, { passive: true, once: true });
      el.addEventListener("focus", warmByCartIntent, { passive: true, once: true });
    });
  }

  function bindLateActionDelegates() {
    if (bindLateActionDelegates._bound) return;
    bindLateActionDelegates._bound = true;

    const bindClickLazy = (el) => {
      if (!el || !el.addEventListener) return;
      el.addEventListener(
        "click",
        (e) => {
          if (window.__shopLateLoaded) return;
          e.preventDefault();
          e.stopPropagation();
          const prevDisabled = !!el.disabled;
          try { el.disabled = true; } catch {}
          ensureShopLateLoaded().then(() => {
            try { el.disabled = prevDisabled; } catch {}
            try { el.click(); } catch {}
          });
        },
        { capture: true }
      );
    };

    // Core renders cart immediately; late bundle wires complex flows (checkout, clear with confirm, etc.).
    bindClickLazy(elCheckoutBtn);
    bindClickLazy(elCartClearBtn);

    if (elCompanyChatOpenBtn && elCompanyChatOpenBtn.addEventListener) {
      elCompanyChatOpenBtn.addEventListener(
        "click",
        (e) => {
          if (window.__shopChatLoaded) return;
          e.preventDefault();
          e.stopPropagation();
          ensureShopChatLoaded().then(() => {
            try { elCompanyChatOpenBtn.click(); } catch {}
          });
        },
        { capture: true }
      );
    }
  }

  function openComboDetails(comboId, opts = {}) {
    try {
      if (stockEventsWaitAbortController) stockEventsWaitAbortController.abort();
    } catch {}
    return ensureShopLateLoaded().then(() => {
      if (typeof window.openComboDetails === "function" && window.openComboDetails !== openComboDetails) {
        return window.openComboDetails(comboId, opts);
      }
    });
  }

  let comboDetailsPrefetchFlushTimer = null;
  const comboDetailsPrefetchPendingIds = new Set();
  let comboDetailsPrefetchPendingLimit = 8;
  let comboDetailsPrefetchPendingDelayMs = 220;
  const INITIAL_CATALOG_SKELETON_CARDS = 8;
  const INITIAL_CATALOG_SKELETON_CATEGORIES = 10;
  const INITIAL_CATALOG_PREFETCH_PRODUCTS = 14;
  const INITIAL_CATALOG_PREFETCH_COMBOS = 6;
  const INITIAL_CATALOG_WARM_TIMEOUT_MS = 1400;

  function renderCategoriesSkeleton(count = INITIAL_CATALOG_SKELETON_CATEGORIES) {
    if (!elCatsList) return;
    const n = Math.max(1, Number(count || 0));
    const frag = document.createDocumentFragment();
    elCatsList.innerHTML = "";
    for (let i = 0; i < n; i += 1) {
      const item = document.createElement("div");
      item.className = "shop-cat-item shop-cat-item--skeleton";
      item.setAttribute("aria-hidden", "true");

      const icon = document.createElement("div");
      icon.className = "shop-cat-icon shop-skeleton-shimmer";
      item.appendChild(icon);

      const text = document.createElement("div");
      text.className = "shop-cat-text";
      const line = document.createElement("div");
      line.className = "shop-cat-title shop-skeleton-shimmer shop-cat-title--skeleton";
      text.appendChild(line);
      item.appendChild(text);

      frag.appendChild(item);
    }
    elCatsList.appendChild(frag);
  }

  function renderProductsSkeleton(count = INITIAL_CATALOG_SKELETON_CARDS) {
    if (!elProductsGrid) return;
    const n = Math.max(2, Number(count || 0));
    const frag = document.createDocumentFragment();
    elProductsGrid.innerHTML = "";
    if (elProductsEmpty) elProductsEmpty.classList.add("hidden");

    for (let i = 0; i < n; i += 1) {
      const card = document.createElement("article");
      card.className = "sp-card sp-card--skeleton";
      card.setAttribute("aria-hidden", "true");

      const media = document.createElement("div");
      media.className = "sp-media shop-skeleton-shimmer";
      card.appendChild(media);

      const info = document.createElement("div");
      info.className = "sp-info";

      const title = document.createElement("div");
      title.className = "shop-skeleton-shimmer sp-skel-line sp-skel-line--title";
      info.appendChild(title);

      const sub = document.createElement("div");
      sub.className = "shop-skeleton-shimmer sp-skel-line sp-skel-line--sub";
      info.appendChild(sub);

      const bottom = document.createElement("div");
      bottom.className = "sp-bottom";
      const btn = document.createElement("div");
      btn.className = "shop-skeleton-shimmer sp-skel-pill";
      bottom.appendChild(btn);
      info.appendChild(bottom);

      card.appendChild(info);
      frag.appendChild(card);
    }
    elProductsGrid.appendChild(frag);
  }

  function collectInitialCatalogWarmIds(opts = {}) {
    const productIds = [];
    const comboIds = [];
    const productLimit = Math.max(1, Number(opts.productLimit || INITIAL_CATALOG_PREFETCH_PRODUCTS));
    const comboLimit = Math.max(0, Number(opts.comboLimit || INITIAL_CATALOG_PREFETCH_COMBOS));
    const wantedCategoryIds = Array.isArray(opts.categoryIds)
      ? new Set(
        opts.categoryIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
      )
      : null;
    const categories = getVisibleCategories().filter((c) => {
      if (!wantedCategoryIds || !wantedCategoryIds.size) return true;
      return wantedCategoryIds.has(Number(c?.id || 0));
    });

    for (const c of categories) {
      const cid = Number(c?.id || 0);
      if (!Number.isFinite(cid) || cid <= 0) continue;

      const products = Array.isArray(state.productsByCategory?.get(cid))
        ? state.productsByCategory.get(cid)
        : [];
      for (const p of products) {
        const pid = Number(p?.id || 0);
        if (!Number.isFinite(pid) || pid <= 0) continue;
        productIds.push(pid);
        if (productIds.length >= productLimit) break;
      }

      const combos = Array.isArray(state.combosByCategory?.get(cid))
        ? state.combosByCategory.get(cid)
        : [];
      for (const combo of combos) {
        const comboId = Number(combo?.id || 0);
        if (!Number.isFinite(comboId) || comboId <= 0) continue;
        comboIds.push(comboId);
        if (comboIds.length >= comboLimit) break;
      }

      if (
        productIds.length >= productLimit &&
        comboIds.length >= comboLimit
      ) {
        break;
      }
    }

    return {
      productIds: Array.from(new Set(productIds)).slice(0, productLimit),
      comboIds: Array.from(new Set(comboIds)).slice(0, comboLimit),
    };
  }

  async function warmInitialCatalogInteractionData(opts = {}) {
    const productLimit = Math.max(1, Number(opts.productLimit || INITIAL_CATALOG_PREFETCH_PRODUCTS));
    const comboLimit = Math.max(0, Number(opts.comboLimit || INITIAL_CATALOG_PREFETCH_COMBOS));
    const { productIds, comboIds } = collectInitialCatalogWarmIds({
      categoryIds: opts.categoryIds,
      productLimit,
      comboLimit,
    });
    if (!productIds.length && !comboIds.length) return true;

    try {
      await ensureShopLateLoaded();
    } catch (err) {
      console.warn("warmInitialCatalogInteractionData: shop-late load failed", err);
      return false;
    }

    const warmTask = (async () => {
      if (typeof window.warmInitialCatalogPayload === "function") {
        await window.warmInitialCatalogPayload({
          productIds,
          comboIds,
          productLimit,
          comboLimit,
        });
        if (productIds.length) {
          const productsById = new Map();
          productIds.forEach((id) => {
            const product = state.productCache.get(Number(id));
            if (product) productsById.set(Number(id), product);
          });
          await warmUpsellDefaultConfigBatch(productIds, productsById);
        }
        return;
      }

      if (typeof window.prefetchProductDetailsConfig === "function" && productIds.length) {
        window.prefetchProductDetailsConfig(productIds, {
          limit: productIds.length,
          delayMs: 0,
        });
      }
      if (typeof window.prefetchComboDetails === "function" && comboIds.length) {
        window.prefetchComboDetails(comboIds, {
          limit: comboIds.length,
          delayMs: 0,
          preloadProductConfigs: true,
          eager: true,
        });
      }
      if (productIds.length) {
        const productsById = new Map();
        productIds.forEach((id) => {
          const product = state.productCache.get(Number(id));
          if (product) productsById.set(Number(id), product);
        });
        await warmUpsellDefaultConfigBatch(productIds, productsById);
      }
      await new Promise((resolve) => setTimeout(resolve, 120));
    })();

    const timeoutMs = Math.max(
      0,
      Number(opts.timeoutMs || INITIAL_CATALOG_WARM_TIMEOUT_MS)
    );
    try {
      const result = await Promise.race([
        warmTask.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), timeoutMs)),
      ]);
      if (!result) {
        console.warn("warmInitialCatalogInteractionData: first screen warm timed out");
      }
      return !!result;
    } catch (err) {
      console.warn("warmInitialCatalogInteractionData: first screen warm failed", err);
      return false;
    }
  }

  function scheduleComboDetailsPrefetch(comboIds, opts = {}) {
    const ids = Array.isArray(comboIds)
      ? comboIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
      : [];
    if (!ids.length) return;

    ids.forEach((id) => comboDetailsPrefetchPendingIds.add(id));

    const limit = Number(opts.limit || 0);
    if (Number.isFinite(limit) && limit > 0) {
      comboDetailsPrefetchPendingLimit = Math.max(comboDetailsPrefetchPendingLimit, Math.floor(limit));
    }
    const delayMs = Number(opts.delayMs);
    if (Number.isFinite(delayMs) && delayMs >= 0) {
      comboDetailsPrefetchPendingDelayMs = Math.min(comboDetailsPrefetchPendingDelayMs, Math.floor(delayMs));
    }

    if (comboDetailsPrefetchFlushTimer) {
      clearTimeout(comboDetailsPrefetchFlushTimer);
      comboDetailsPrefetchFlushTimer = null;
    }
    comboDetailsPrefetchFlushTimer = setTimeout(() => {
      comboDetailsPrefetchFlushTimer = null;
      const pendingIds = Array.from(comboDetailsPrefetchPendingIds);
      comboDetailsPrefetchPendingIds.clear();
      const limitToUse = Math.max(1, Number(comboDetailsPrefetchPendingLimit || 8), pendingIds.length);
      comboDetailsPrefetchPendingLimit = 8;
      comboDetailsPrefetchPendingDelayMs = 220;
      if (!pendingIds.length) return;

      ensureShopLateLoaded().then(() => {
        if (typeof window.prefetchComboDetails === "function") {
          window.prefetchComboDetails(pendingIds, {
            limit: limitToUse,
            delayMs: 0,
            preloadProductConfigs: true,
            eager: true,
          });
        }
      }).catch(() => {});
    }, Math.max(0, Number(comboDetailsPrefetchPendingDelayMs || 0)));
  }

  // -----------------------------
  // Products (???????? ?? ??????)
  // -----------------------------
  function renderProducts(opts = {}) {
    const appendOnly = !!opts.appendOnly;
    const allowCritical = !appendOnly;
    if (!appendOnly) {
      elProductsGrid.innerHTML = "";
    }

    const categories = getVisibleCategories();
    let totalProducts = 0;
    const CRITICAL_PRODUCT_CARDS = 16;
    let globalCardIndex = 0; // ???????? ?????? ???????? (?????? + ?????) ??? ????????????? ???????????

    categories.forEach((c) => {
      const cid = Number(c.id);
      if (!Number.isFinite(cid)) return;

      let header = elProductsGrid.querySelector(`.shop-category-header[data-cat-id="${cid}"]`);
      if (!header) {
        header = document.createElement("div");
        header.className = "shop-category-header";
        header.setAttribute("data-cat-id", String(cid));
        header.setAttribute("data-cat-title", str(c.title));
        header.textContent = str(c.title);
        elProductsGrid.appendChild(header);
      } else if (!appendOnly) {
        header.setAttribute("data-cat-title", str(c.title));
        header.textContent = str(c.title);
      }

      let insertBefore = null;
      const existingProductIds = appendOnly ? new Set() : null;
      const existingComboIds = appendOnly ? new Set() : null;
      if (appendOnly) {
        let n = header.nextSibling;
        while (n) {
          if (n.nodeType === 1 && n.classList && n.classList.contains("shop-category-header")) {
            insertBefore = n;
            break;
          }
          n = n.nextSibling;
        }

        let m = header.nextSibling;
        while (m && m !== insertBefore) {
          if (m.nodeType === 1 && m.classList && m.classList.contains("sp-card")) {
            const pid = Number(m.getAttribute("data-product-id"));
            if (Number.isFinite(pid)) existingProductIds.add(pid);
            const coid = Number(m.getAttribute("data-combo-id"));
            if (Number.isFinite(coid)) existingComboIds.add(coid);
          }
          m = m.nextSibling;
        }
      }

      const products = state.productsByCategory.get(cid) || [];
      totalProducts += products.length;
      const frag = document.createDocumentFragment();
      const prefetchProductIds = [];
      const prefetchComboIds = [];

      products.forEach((p) => {
        const id = Number(p.id);
        if (!Number.isFinite(id)) return;
        if (appendOnly && existingProductIds && existingProductIds.has(id)) return;
        prefetchProductIds.push(id);
        const qty = cartQty(id);
        const available = isProductAvailable(p);
        const photos = safePhotos(p);
        const mainPhoto = photos[0] || "";
        const gridPhoto = p.photo_thumb || mainPhoto || "";
        const previewPhoto = p.photo_lqip || p.photo_thumb || mainPhoto || "/static/img/placeholder.png";

        const card = document.createElement("article");
        card.className = "sp-card";
        card.setAttribute("data-product-id", String(id));
        card.setAttribute("data-qty", String(qty));
        if (qty > 0) card.classList.add("is-in-cart");

        const media = document.createElement("div");
        media.className = "sp-media";

        const isCriticalCard = allowCritical && globalCardIndex < CRITICAL_PRODUCT_CARDS;
        if (isCriticalCard) {
          preloadImageOnce(gridPhoto || mainPhoto || "/static/img/placeholder.png", { fetchPriority: 'high' });
        }

        // LQIP-?????? (????? ???????????? ????????? previewPhoto, ???? ?????? ??? ??????)
        const imgPreview = createOptimizedImage(previewPhoto, {
          type: 'product-grid',
          className: 'sp-img sp-img-lqip',
          alt: '',
          usePicture: false,
          priority: isCriticalCard,
        });
        media.appendChild(imgPreview);

        // ??????????? ??????????? ?????? (createOptimizedImage ????? ??????? <picture> ??? .webp)
        const imgFull = createOptimizedImage(gridPhoto || mainPhoto || "/static/img/placeholder.png", {
          type: 'product-grid',
          className: 'sp-img sp-img-full',
          alt: '',
          usePicture: true,
          priority: isCriticalCard,
        });
        const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
        if (fullImgEl) {
          fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
          fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
        }
        media.appendChild(imgFull);
        if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");

        const overlay = document.createElement("div");
        overlay.className = "sp-qtyOverlay";
        if (qty <= 0) overlay.classList.add("hidden");

        const qBox = document.createElement("div");
        qBox.className = "qty-carousel";
        qBox.textContent = String(qty || "");
        qBox.setAttribute("data-v", String(qty || 0));

        overlay.appendChild(qBox);
        media.appendChild(overlay);

        const productDiscountBadge = createCatalogDiscountBadge(getCatalogProductDiscountBadge(p));
        if (productDiscountBadge) media.appendChild(productDiscountBadge);
        const productBuyXGetYBadge = createCatalogBuyXGetYBadge(p);
        if (productBuyXGetYBadge) media.appendChild(productBuyXGetYBadge);
        const mediaPill = createCatalogMediaPill(p, available);
        if (mediaPill) media.appendChild(mediaPill);

        card.appendChild(media);

        const info = document.createElement("div");
        info.className = "sp-info";

        const title = document.createElement("div");
        title.className = "sp-title";
        title.textContent = getCatalogProductTitle(p);
        info.appendChild(title);

        const sub = document.createElement("div");
        sub.className = "sp-sub";
        const defaultLines = getCatalogProductDefaultLines(p);
        if (defaultLines.length) {
          sub.classList.add("sp-sub--defaults");
          defaultLines.forEach((lineText) => {
            const line = document.createElement("div");
            line.className = "sp-sub-line";
            line.textContent = "\u2022 " + lineText;
            sub.appendChild(line);
          });
        } else {
          sub.textContent = str(p.description_short || "");
        }
        info.appendChild(sub);

        const bottom = document.createElement("div");
        bottom.className = "sp-bottom";

        const { pill, btnMinus, btnPlus, center } = createQtyPill({
          variant: available ? "buy" : "muted",
          centerHtml: catalogCenterHtml(p, qty),
          minusEnabled: qty > 0 && available,
          plusEnabled: available,
        });

        if (qty <= 0) pill.classList.add("is-empty");
        else pill.classList.add("has-qty");
        if (!available) pill.classList.add("qty-pill--no-action");
        if (!available) card.classList.add("is-unavailable");

        bottom.appendChild(pill);
        info.appendChild(bottom);
        card.appendChild(info);

        btnPlus.addEventListener("click", async (e) => {
          e.stopPropagation();
          if (btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
          btnPlus.disabled = true;
          btnPlus.classList.add("is-disabled");
          let added = false;
          try {
            await addUpsellToCart(p, elCartList);
            added = true;
          } finally {
            const nextQty = cartQty(id);
            elProductsGrid
              .querySelectorAll(`.sp-card[data-product-id="${id}"]`)
              .forEach((cardEl) => applyCardState(cardEl, p, nextQty, added ? "inc" : null));
          }
        });

        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          changeQty(id, -1);
        });

        card.addEventListener("click", () => openProductDetails(id));

        frag.appendChild(card);
        applyCardState(card, p, qty, null);

        // ???? ? ??????? ?? ?????? display_price ? ?????????? ?????????? ???????? ? ????????? ????
        // display_price calculation is deferred for performance (handled in shop-late/product details)

        globalCardIndex += 1;
      });

      if (typeof window.prefetchProductDetailsConfig === "function" && prefetchProductIds.length) {
        window.prefetchProductDetailsConfig(prefetchProductIds, {
          limit: appendOnly ? 4 : 8,
          delayMs: appendOnly ? 140 : 260,
        });
      }

      // ???????? ?????-??????? ? ???? ?????????
      const combos = state.combosByCategory.get(cid) || [];
      combos.forEach((combo) => {
        const comboId = Number(combo.id);
        if (!Number.isFinite(comboId)) return;
        if (appendOnly && existingComboIds && existingComboIds.has(comboId)) return;
        if (!isComboCatalogEntryAvailable(combo)) return;
        prefetchComboIds.push(comboId);
        const card = document.createElement("article");
        card.className = "sp-card sp-card--combo";
        card.setAttribute("data-combo-id", String(comboId));

        const media = document.createElement("div");
        media.className = "sp-media sp-media--combo";

        const gridPhotos = Array.isArray(combo.grid_photos) ? combo.grid_photos : [];
        const gridThumbs = Array.isArray(combo.grid_photos_thumb) ? combo.grid_photos_thumb : [];
        const singleImage = (combo.image_url || "").trim();
        const singleImageThumb = (combo.image_thumb || "").trim();
        // ??????? ???? ? ????? 2?2: ?????? 0,1,2,3 ? ???? 1, 3, 4, 2 (??????? 0, 2, 3, 1)
        const comboGridOrder = [0, 2, 3, 1];
        const isCriticalCard = allowCritical && globalCardIndex < CRITICAL_PRODUCT_CARDS;

        if (singleImage) {
          const finalImage = singleImageThumb || singleImage;
          const previewUrl = combo.image_lqip || finalImage;
          if (isCriticalCard) {
            preloadImageOnce(finalImage, { fetchPriority: 'high' });
          }

          const imgPreview = createOptimizedImage(previewUrl, {
            type: "product-grid",
            className: "sp-img sp-img-lqip",
            alt: "",
            priority: isCriticalCard,
          });
          media.appendChild(imgPreview);

          const imgFull = createOptimizedImage(finalImage, {
            type: "product-grid",
            className: "sp-img sp-img-full",
            alt: "",
            priority: isCriticalCard,
          });
          const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
          if (fullImgEl) {
            fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
            fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
          }
          media.appendChild(imgFull);
          if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
        } else if (gridPhotos.length > 0) {
          const grid = document.createElement("div");
          grid.className = "sp-combo-grid";
          for (let i = 0; i < 4; i++) {
            const cell = document.createElement("div");
            cell.className = "sp-combo-grid__cell";
            const src = gridPhotos[comboGridOrder[i]] || "";
            const thumb = gridThumbs[comboGridOrder[i]] || "";
            const finalSrc = thumb || src;
            if (finalSrc) {
              const previewUrl = finalSrc; // ??? ??????? ???? ????? ?????????? ????????? LQIP ??? ??????
              if (isCriticalCard) {
                preloadImageOnce(finalSrc, { fetchPriority: 'high' });
              }

              const imgPreview = createOptimizedImage(previewUrl, {
                type: "product-grid",
                className: "sp-img sp-img-lqip",
                alt: "",
                priority: isCriticalCard,
              });
              cell.appendChild(imgPreview);

              const imgFull = createOptimizedImage(finalSrc, {
                type: "product-grid",
                className: "sp-img sp-img-full",
                alt: "",
                priority: isCriticalCard,
              });
              const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
              if (fullImgEl) {
                fullImgEl.addEventListener("load", () => cell.classList.add("is-loaded"));
                fullImgEl.addEventListener("error", () => cell.classList.add("is-loaded"));
              }
              cell.appendChild(imgFull);
              if (fullImgEl && fullImgEl.complete) cell.classList.add("is-loaded");
            } else {
              cell.classList.add("sp-combo-grid__cell--empty");
            }
            grid.appendChild(cell);
          }
          media.appendChild(grid);
        } else {
          const imgPreview = createOptimizedImage("/static/img/placeholder.png", {
            type: "product-grid",
            className: "sp-img sp-img-lqip",
            alt: "",
            priority: isCriticalCard,
          });
          media.appendChild(imgPreview);

          const imgFull = createOptimizedImage("/static/img/placeholder.png", {
            type: "product-grid",
            className: "sp-img sp-img-full",
            alt: "",
            priority: isCriticalCard,
          });
          const fullImgEl = imgFull.tagName === 'PICTURE' ? imgFull.querySelector('img') : imgFull;
          if (fullImgEl) {
            fullImgEl.addEventListener("load", () => media.classList.add("is-loaded"));
            fullImgEl.addEventListener("error", () => media.classList.add("is-loaded"));
          }
          media.appendChild(imgFull);
          if (fullImgEl && fullImgEl.complete) media.classList.add("is-loaded");
        }

        const comboDiscountBadge = createCatalogDiscountBadge(getCatalogComboDiscountBadge(combo));
        if (comboDiscountBadge) media.appendChild(comboDiscountBadge);

        card.appendChild(media);

        const info = document.createElement("div");
        info.className = "sp-info";

        const title = document.createElement("div");
        title.className = "sp-title sp-title--two-lines";
        title.textContent = str(combo.title);
        info.appendChild(title);

        const sub = document.createElement("div");
        sub.className = "sp-sub sp-sub--one-line";
        sub.textContent = str(combo.description || "");
        info.appendChild(sub);

        const bottom = document.createElement("div");
        bottom.className = "sp-bottom";
        const minPrice = Number(combo.min_price) || 0;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "sp-combo-btn";
        btn.innerHTML = `<span class="sp-combo-btn__text">от ${catalogMoneyNoKopeks(minPrice)} ₽</span><span class="sp-combo-btn__arrow" aria-hidden="true">›</span>`;
        bottom.appendChild(btn);
        info.appendChild(bottom);
        card.appendChild(info);

        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          openComboDetails(comboId);
        });
        card.addEventListener("click", (e) => {
          if (!e.target.closest(".sp-combo-btn")) openComboDetails(comboId);
        });
        const warmComboDetailsOnIntent = () => {
          scheduleComboDetailsPrefetch([comboId], { limit: 1, delayMs: 0 });
        };
        card.addEventListener("pointerenter", warmComboDetailsOnIntent, { passive: true, once: true });
        card.addEventListener("touchstart", warmComboDetailsOnIntent, { passive: true, once: true });
        btn.addEventListener("focus", warmComboDetailsOnIntent, { once: true });

        frag.appendChild(card);
        totalProducts += 1;
        globalCardIndex += 1;
      });

      if (prefetchComboIds.length) {
        scheduleComboDetailsPrefetch(prefetchComboIds, {
          limit: appendOnly ? 4 : 12,
          delayMs: appendOnly ? 100 : 180,
        });
      }
      if (appendOnly) {
        elProductsGrid.insertBefore(frag, insertBefore);
      } else {
        elProductsGrid.appendChild(frag);
      }
    });

    if (!appendOnly && elProductsEmpty) {
      if (totalProducts === 0) elProductsEmpty.classList.remove("hidden");
      else elProductsEmpty.classList.add("hidden");
    }

    updateCartBadge();
    refreshCategoryHeaders();
  }

  function applyCardState(card, product, qty, dir) {
    const media = $(".sp-media", card);
    const overlay = $(".sp-qtyOverlay", card);
    const qtyBox = $(".qty-carousel", card);

    const pill = $(".qty-pill", card);
    const btnMinus = $(".qty-pill__btn--minus", card);
    const btnPlus = $(".qty-pill__btn--plus", card);
    const center = $(".qty-pill__center", card);
    let mediaPill = media ? $("[data-media-pill]", media) : null;
    const stockAvailable = isProductAvailable(product);
    const pid = Number(product?.id || 0);
    const remaining = Number.isFinite(pid) && pid > 0 ? getAvailableStock(pid) : Infinity;
    const plusBlockedByLimit = stockAvailable && Number.isFinite(remaining) && remaining <= 0;
    const plusBlockedByIngredients =
      stockAvailable && Number.isFinite(pid) && pid > 0 ? isProductBlockedByIngredientRequirements(pid) : false;
    const availableForAdd = stockAvailable && !plusBlockedByLimit && !plusBlockedByIngredients;

    card.setAttribute("data-qty", String(qty));
    card.classList.toggle("is-unavailable", !availableForAdd);

    if (qty > 0) {
      card.classList.add("is-in-cart");
      if (overlay) overlay.classList.remove("hidden");
      if (qtyBox) {
        if (dir) animateNumber(qtyBox, qty, dir);
        else {
          qtyBox.textContent = String(qty);
          qtyBox.setAttribute("data-v", String(qty));
        }
      }
      if (media) media.classList.add("is-dim");
    } else {
      card.classList.remove("is-in-cart");
      if (overlay) overlay.classList.add("hidden");
      if (qtyBox) {
        qtyBox.textContent = "";
        qtyBox.setAttribute("data-v", "0");
      }
      if (media) media.classList.toggle("is-dim", !availableForAdd);
    }

    if (pill) {
      pill.classList.toggle("is-empty", qty <= 0);
      pill.classList.toggle("has-qty", qty > 0);
      pill.classList.toggle("qty-pill--muted", !stockAvailable);
      pill.classList.toggle("qty-pill--no-action", !availableForAdd);
    }
    if (btnMinus) {
      const minusDisabled = qty <= 0;
      btnMinus.innerHTML = qty === 1 ? '<i class="fas fa-trash" aria-hidden="true"></i>' : "-";
      btnMinus.setAttribute("aria-label", qty === 1 ? "Удалить" : "Уменьшить");
      btnMinus.classList.toggle("is-disabled", minusDisabled);
      btnMinus.disabled = minusDisabled;
    }
    if (btnPlus) {
      const plusDisabled = !availableForAdd;
      btnPlus.classList.toggle("is-disabled", plusDisabled);
      btnPlus.disabled = plusDisabled;
    }
    if (center) {
      syncCatalogProductDiscountBadge(card, product, defaultPriceCache.get(product.id));
      const cachedPrice = defaultPriceCache.get(product.id);
      center.innerHTML = catalogCenterHtml(product, qty, cachedPrice);
    }
    if (media) {
      const mediaPillLabel = getCatalogMediaPillLabel(product, availableForAdd);
      if (mediaPillLabel) {
        if (!mediaPill) {
          mediaPill = createCatalogMediaPill(product, availableForAdd);
          if (mediaPill) media.appendChild(mediaPill);
        } else {
          mediaPill.classList.toggle("is-sold-out", mediaPillLabel === "Раскупили");
          mediaPill.innerHTML = `<span class="sp-media-pill__text">${escapeHtml(mediaPillLabel)}</span>${mediaPillLabel === "Настроить" ? '<span class="sp-media-pill__chevron" aria-hidden="true">›</span>' : ""}`;
        }
      } else if (mediaPill) {
        mediaPill.remove();
      }
    }
  }

  // -----------------------------
  // Cart render
  // -----------------------------
  function sortCartItemsForDisplay(items) {
    const normal = [];
    const auto = [];
    (Array.isArray(items) ? items : []).forEach((item) => {
      if (item?.type === "combo") normal.push(item);
      else if (Number(item?.auto_add || 0) === 1) auto.push(item);
      else normal.push(item);
    });
    auto.sort((a, b) => {
      const nameA = String(a?.product?.name || "");
      const nameB = String(b?.product?.name || "");
      return nameA.localeCompare(nameB, "ru", { sensitivity: "base" });
    });
    return normal.concat(auto);
  }

  function isFavoriteUnauthorizedError(err) {
    if (!err) return false;
    if (Number(err.httpStatus || 0) === 401) return true;
    const msg = String(err.message || "");
    return msg === "UNAUTHORIZED" || msg.includes("UNAUTHORIZED");
  }

  function setFavoriteButtonsActive(buttons, active) {
    (Array.isArray(buttons) ? buttons : []).forEach((btn) => {
      if (!btn) return;
      btn.classList.toggle("is-active", !!active);
    });
  }

  function setFavoriteButtonsBusy(buttons, busy) {
    (Array.isArray(buttons) ? buttons : []).forEach((btn) => {
      if (!btn) return;
      btn.disabled = !!busy;
      btn.classList.toggle("is-busy", !!busy);
    });
  }

  function bindFavoriteButtonsForCartRow(buttons, buildSnapshot, { afterToggle } = {}) {
    const allButtons = (Array.isArray(buttons) ? buttons : []).filter(Boolean);
    if (!allButtons.length) return;

    let favoriteId = null;
    let isBusy = false;
    const syncActive = () => {
      setFavoriteButtonsActive(allButtons, !!favoriteId);
      allButtons.forEach((btn) => {
        if (!btn) return;
        if (favoriteId) btn.dataset.favoriteId = String(favoriteId);
        else delete btn.dataset.favoriteId;
      });
    };
    syncActive();

    const handleClick = async (event) => {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (isBusy) return;

      const token = getCustomerToken();
      if (!token) {
        promptFavoritesLogin();
        return;
      }

      isBusy = true;
      setFavoriteButtonsBusy(allButtons, true);

      try {
        if (favoriteId) {
          await removeFavoriteById(favoriteId);
          favoriteId = null;
          syncActive();
          showToast("Удалено из избранного");
          if (navigator.vibrate) navigator.vibrate(10);
          if (typeof afterToggle === "function") afterToggle({ active: false, favoriteId: null });
          return;
        }

        const snapshot = typeof buildSnapshot === "function" ? buildSnapshot() : null;
        if (!snapshot) {
          showToast("Не удалось сохранить в избранное");
          return;
        }

        const saved = await addFavoriteItemSnapshot(snapshot);
        favoriteId = Number(saved?.id || 0) || null;
        syncActive();
        showToast("Добавлено в избранное");
        if (navigator.vibrate) navigator.vibrate(10);
        if (typeof afterToggle === "function") afterToggle({ active: true, favoriteId });
      } catch (err) {
        if (isFavoriteUnauthorizedError(err)) {
          promptFavoritesLogin();
        } else {
          console.warn("Failed to toggle favorite:", err);
          showToast("Не удалось обновить избранное");
        }
      } finally {
        isBusy = false;
        setFavoriteButtonsBusy(allButtons, false);
      }
    };

    allButtons.forEach((btn) => {
      btn.addEventListener("click", handleClick);
    });
  }

  const CART_SECTION_CLEAR_ICON_HTML = '<i class="fas fa-trash-can"></i>';

  function computeCartDiscountMeta(lineStateOrTotal, originalLineTotal) {
    const lineState = lineStateOrTotal && typeof lineStateOrTotal === "object"
      ? lineStateOrTotal
      : null;
    const isGiftReward = lineState
      ? (lineState.isGiftReward === true || Number(lineState.is_gift_reward || 0) === 1)
      : false;
    const currentTotal = roundPrice(Number(lineState ? lineState.currentTotal : lineStateOrTotal) || 0);
    if (isGiftReward) {
      return {
        currentTotal,
        originalTotal: 0,
        showOld: false,
        discountPercent: 0,
      };
    }
    const originalTotal = roundPrice(Number(lineState ? lineState.originalTotal : originalLineTotal) || 0);
    const showOld = originalTotal > currentTotal;
    let discountPercent = lineState ? Math.round(Number(lineState.discountPercent || 0)) : 0;
    if ((!Number.isFinite(discountPercent) || discountPercent <= 0) && showOld && originalTotal > 0) {
      discountPercent = Math.round(((originalTotal - currentTotal) / originalTotal) * 100);
    }
    if (!Number.isFinite(discountPercent) || discountPercent <= 0) discountPercent = 0;
    if (discountPercent > 100) discountPercent = 100;
    return {
      currentTotal,
      originalTotal: showOld ? originalTotal : 0,
      showOld,
      discountPercent,
    };
  }

  function applyCartPriceGroupState(currentEl, oldEl, badgeEl, lineStateOrTotal, originalLineTotal) {
    const meta = computeCartDiscountMeta(lineStateOrTotal, originalLineTotal);
    if (currentEl) currentEl.textContent = money(meta.currentTotal);
    if (oldEl) {
      oldEl.textContent = meta.showOld ? money(meta.originalTotal) : "";
      oldEl.classList.toggle("hidden", !meta.showOld);
    }
    if (badgeEl) {
      const showBadge = meta.discountPercent > 0;
      badgeEl.textContent = showBadge ? `-${meta.discountPercent}%` : "";
      badgeEl.classList.toggle("hidden", !showBadge);
    }
    return meta;
  }

  function setCartPriceGroupDomState(priceGroupEl, lineStateOrTotal, originalLineTotal) {
    if (!priceGroupEl || !priceGroupEl.querySelector) return null;
    let effectiveLineStateOrTotal = lineStateOrTotal;
    let effectiveOriginalLineTotal = originalLineTotal;
    const rowHost = priceGroupEl.closest(".shop-cart-item-row[data-cart-key], .cart-row[data-cart-key], .cart-swipe-container[data-cart-key]");
    const cartKey = String(rowHost?.getAttribute?.("data-cart-key") || "").trim();
    const cartItem = cartKey && typeof getCartItemByKey === "function"
      ? getCartItemByKey(cartKey)
      : null;
    const isGiftReward = Number(cartItem?.is_gift_reward || 0) === 1;
    if (isGiftReward) {
      if (effectiveLineStateOrTotal && typeof effectiveLineStateOrTotal === "object") {
        effectiveLineStateOrTotal = {
          ...effectiveLineStateOrTotal,
          isGiftReward: true,
          is_gift_reward: 1,
          originalTotal: Number(effectiveLineStateOrTotal.currentTotal || 0),
          discountPercent: 0,
        };
      } else {
        effectiveOriginalLineTotal = Number(effectiveLineStateOrTotal || 0);
      }
    }
    return applyCartPriceGroupState(
      priceGroupEl.querySelector(".cart-price"),
      priceGroupEl.querySelector(".cart-old"),
      priceGroupEl.querySelector(".cart-discount-badge"),
      effectiveLineStateOrTotal,
      effectiveOriginalLineTotal
    );
  }

  window.setShopCartPriceGroupDomState = setCartPriceGroupDomState;

  function createCartPriceGroup(lineTotal, originalLineTotal) {
    const wrap = document.createElement("div");
    wrap.className = "cart-price-group";

    const stack = document.createElement("div");
    stack.className = "cart-price-stack";

    const currentEl = document.createElement("div");
    currentEl.className = "cart-price";

    const oldEl = document.createElement("div");
    oldEl.className = "cart-old hidden";

    stack.appendChild(currentEl);
    stack.appendChild(oldEl);
    wrap.appendChild(stack);

    const badgeEl = document.createElement("span");
    badgeEl.className = "sp-discount-badge sp-discount-badge--cart cart-discount-badge hidden";
    wrap.appendChild(badgeEl);

    const sync = (nextLineTotal, nextOriginalLineTotal) =>
      applyCartPriceGroupState(currentEl, oldEl, badgeEl, nextLineTotal, nextOriginalLineTotal);

    sync(lineTotal, originalLineTotal);

    return {
      wrap,
      currentEl,
      oldEl,
      badgeEl,
      sync,
    };
  }

  function bindCartItemsSectionControls(rootEl) {
    if (!rootEl || !rootEl.querySelectorAll) return;
    rootEl.querySelectorAll(".shop-cart-items-section__clear").forEach((btn) => {
      if (!btn || btn.dataset.twostepClearBound === "1") return;
      attachTwoStepClear(btn, () => clearCartAll(), {
        defaultHtml: CART_SECTION_CLEAR_ICON_HTML,
        confirmText: "Очистить корзину?",
        compactCheckout: false,
      });
      btn.dataset.twostepClearBound = "1";
    });
    rootEl.querySelectorAll(".shop-cart-mode-header__address").forEach((btn) => {
      if (!btn || btn.dataset.cartModeAddressBound === "1") return;
      btn.addEventListener("click", () => {
        void openCartModeAddressSelector(btn);
      });
      btn.dataset.cartModeAddressBound = "1";
    });
    rootEl.querySelectorAll(".shop-cart-mode-header .shop-delivery-toggle-btn").forEach((btn) => {
      if (!btn || btn.dataset.cartModeToggleBound === "1") return;
      btn.addEventListener("click", () => {
        void setCartModeHeaderMode(btn.dataset.mode);
      });
      btn.dataset.cartModeToggleBound = "1";
    });
  }

  function buildCartBenefitsServiceSection() {
    const section = document.createElement("section");
    section.className = "shop-cart-benefits-service-section hidden";
    section.dataset.cartBenefitsService = "1";
    section.innerHTML = `
      <div class="shop-cart-benefits-service-card">
        <button
          type="button"
          class="shop-cart-benefits-service-row hidden"
          data-cart-benefits-trigger="discounts"
          aria-label="\u041e\u0442\u043a\u0440\u044b\u0442\u044c \u0441\u043a\u0438\u0434\u043a\u0438"
        >
          <span class="shop-cart-benefits-service-row-main">
            <span class="shop-cart-benefits-service-title">\u0421\u043a\u0438\u0434\u043a\u0438</span>
            <span class="shop-cart-benefits-service-badge hidden" data-cart-benefits-badge="discounts">0</span>
          </span>
          <i class="fas fa-chevron-right shop-cart-benefits-service-arrow" aria-hidden="true"></i>
        </button>
        <button
          type="button"
          class="shop-cart-benefits-service-row hidden"
          data-cart-benefits-trigger="gifts"
          aria-label="Открыть подарки"
        >
          <span class="shop-cart-benefits-service-row-main">
            <span class="shop-cart-benefits-service-title">Подарки</span>
            <span class="shop-cart-benefits-service-badge hidden" data-cart-benefits-badge="gifts">0</span>
          </span>
          <i class="fas fa-chevron-right shop-cart-benefits-service-arrow" aria-hidden="true"></i>
        </button>
        <div class="shop-cart-benefits-service-divider hidden" data-cart-benefits-divider></div>
        <div class="shop-cart-benefits-service-promo-block">
          <button
            type="button"
            class="shop-cart-benefits-service-row"
            data-cart-benefits-trigger="promos"
            aria-label="Открыть промокоды"
          >
            <span class="shop-cart-benefits-service-row-main">
              <span class="shop-cart-benefits-service-title">Промокоды</span>
              <span class="shop-cart-benefits-service-badge hidden" data-cart-benefits-badge="promos">0</span>
            </span>
            <i class="fas fa-chevron-right shop-cart-benefits-service-arrow" aria-hidden="true"></i>
          </button>
          <div class="shop-cart-benefits-service-promo-entry">
            <input
              class="control shop-cart-benefits-service-promo-input"
              data-cart-benefits-promo-input
              type="text"
              name="shopCartBenefitsPromoCode"
              placeholder="Введите промокод"
              autocomplete="new-password"
              autocorrect="off"
              autocapitalize="characters"
              spellcheck="false"
              inputmode="text"
              enterkeyhint="done"
              aria-autocomplete="none"
              data-lpignore="true"
              data-form-type="other"
              data-1p-ignore="true"
              data-bwignore="true"
            />
            <button
              type="button"
              class="shop-cart-benefits-service-promo-apply"
              data-cart-benefits-promo-apply
              disabled
            >
              Применить
            </button>
          </div>
        </div>
      </div>
    `;
    return section;
  }

  function buildCartEmptyStateSection() {
    const section = document.createElement("section");
    section.className = "shop-cart-items-section shop-cart-items-section--empty";

    const body = document.createElement("div");
    body.className = "shop-cart-items-section__body";

    const emptySheet = document.createElement("div");
    emptySheet.className = "shop-cart-empty-sheet";
    emptySheet.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="fas fa-shopping-cart"></i></div>
        <div class="empty-title">Корзина пуста</div>
        <div class="empty-text">Добавьте товары из каталога</div>
      </div>
    `;

    body.appendChild(emptySheet);
    section.appendChild(body);
    return section;
  }

  function renderCartEmptyStateIntoList(listEl, cartModeHeader = null) {
    if (!listEl) return;
    listEl.innerHTML = "";
    if (cartModeHeader && !listEl.contains(cartModeHeader)) {
      listEl.appendChild(cartModeHeader);
    }
    listEl.appendChild(buildCartEmptyStateSection());
  }

  function renderCartInto(listEl, totalEl, emptyPlaceholderEl, opts = {}) {
    const bindInteractive = opts?.bindInteractive !== false;
    const activeItems = cartItemsResolved();
    const items = sortCartItemsForDisplay(cartItemsResolved(state.cart, { includeDormantAutoAdd: true, includeUnavailable: true }))
      .sort((a, b) => Number(a?.is_unavailable === true) - Number(b?.is_unavailable === true));
    const comboIdsForPrefetch = activeItems
      .filter((item) => item && item.type === "combo")
      .map((item) => Number(item.combo_id || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    if (comboIdsForPrefetch.length) {
      scheduleComboDetailsPrefetch(comboIdsForPrefetch, { limit: 6, delayMs: 120 });
    }
    if (listEl) listEl.innerHTML = "";
    const cartModeHeader = listEl ? buildCartModeHeader() : null;
    if (cartModeHeader && listEl) {
      listEl.appendChild(cartModeHeader);
    }

    if (!items.length) {
      if (emptyPlaceholderEl) emptyPlaceholderEl.classList.add("hidden");
      if (listEl) {
        renderCartEmptyStateIntoList(listEl, cartModeHeader);
      }
      if (totalEl) totalEl.textContent = money(0);
      if (listEl && bindInteractive) {
        bindCartItemsSectionControls(listEl);
        bindCartModeHeaderSticky(listEl);
      }
      return { items: activeItems, total: 0, displayItems: items };
    }

    if (emptyPlaceholderEl) emptyPlaceholderEl.classList.add("hidden");

    let total = 0;
    const totals = {
      nonAutoTotal: computeNonAutoTotal(activeItems),
      autoEligibleTotal: computeAutoEligibleTotal(activeItems),
    };
    const itemsSection = listEl ? document.createElement("section") : null;
    let itemsSectionBody = null;
    if (itemsSection && listEl) {
      itemsSection.className = "shop-cart-items-section";

      const sectionHeader = document.createElement("div");
      sectionHeader.className = "shop-cart-items-section__header";

      const titleWrap = document.createElement("div");
      titleWrap.className = "shop-cart-items-section__title-wrap";

      const titleEl = document.createElement("div");
      titleEl.className = "shop-cart-items-section__title";
      titleEl.textContent = "Товары";
      titleWrap.appendChild(titleEl);

      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "shop-cart-items-section__clear";
      clearBtn.innerHTML = CART_SECTION_CLEAR_ICON_HTML;
      clearBtn.title = "Очистить корзину";
      clearBtn.setAttribute("aria-label", "Очистить корзину");

      sectionHeader.appendChild(titleWrap);
      sectionHeader.appendChild(clearBtn);

      itemsSectionBody = document.createElement("div");
      itemsSectionBody.className = "shop-cart-items-section__body";

      itemsSection.appendChild(sectionHeader);
      itemsSection.appendChild(itemsSectionBody);
      listEl.appendChild(itemsSection);
    }

    const appendCartNode = (node) => {
      if (!node) return;
      if (itemsSectionBody) {
        itemsSectionBody.appendChild(node);
        return;
      }
      if (listEl) listEl.appendChild(node);
    };

    items.forEach((item) => {
      if (item.type === "combo") {
        const isUnavailable = item?.is_unavailable === true;
        const { key, combo_id: comboId, combo_title: comboTitle, qty, selections } = item;
        const unitPrice = Number(item.unit_price_override || 0);
        const lineTotal = roundPrice(unitPrice * qty);
        if (!isUnavailable) total += lineTotal;
        const unitPriceOld = Number(item.unit_price_before_discount || 0) || unitPrice;
        const lineTotalOld = roundPrice(unitPriceOld * qty);

        const swipeContainer = document.createElement("div");
        swipeContainer.className = "cart-swipe-container cart-combo-container shop-cart-item-container";
        swipeContainer.setAttribute("data-cart-key", String(key || ""));

        const swipeActions = document.createElement("div");
        swipeActions.className = "cart-swipe-actions";
        const favBtn = document.createElement("button");
        favBtn.type = "button";
        favBtn.className = "cart-swipe-btn cart-swipe-fav";
        favBtn.innerHTML = '<i class="fas fa-heart"></i>';
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "cart-swipe-btn cart-swipe-delete";
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (navigator.vibrate) navigator.vibrate(20);
          deleteCartItemWithAnimation(swipeContainer, null, key);
        });
        swipeActions.appendChild(favBtn);
        swipeActions.appendChild(deleteBtn);
        swipeContainer.appendChild(swipeActions);

        const row = document.createElement("div");
        row.className = "cart-row cart-swipe-content cart-row--combo shop-cart-item-row";
        if (isUnavailable) row.classList.add("is-unavailable");
        row.setAttribute("data-cart-key", String(key || ""));
        row.addEventListener("click", (e) => {
          if (swipeContainer.classList.contains("is-swiped")) {
            e.stopPropagation();
            resetSwipe(swipeContainer);
            return;
          }
          if (isUnavailable) return;
          if (comboId != null && Number.isFinite(Number(comboId))) {
            openComboDetails(Number(comboId), { cartKey: key });
          }
        });

        const grid = document.createElement("div");
        grid.className = "cart-combo-thumb";
        const photos = (selections || []).slice(0, 4).map((s) => s.product_photo || "");
        const comboGridOrder = [0, 2, 3, 1];
        for (let i = 0; i < 4; i++) {
          const photo = photos[comboGridOrder[i]] || "";
          const cell = document.createElement("div");
          cell.className = "cart-combo-thumb__cell" + (photo ? "" : " cart-combo-thumb__cell--empty");
          if (photo) {
            const img = createOptimizedImage(photo, { type: "cart-thumb", className: "cart-thumb", alt: "" });
            cell.appendChild(img);
          }
          grid.appendChild(cell);
        }
        row.appendChild(grid);

        const mid = document.createElement("div");
        mid.className = "cart-mid";
        const t = document.createElement("div");
        t.className = "cart-title";
        const comboTitleText = str(comboTitle || "Комбо");
        t.textContent = `${qty} x ${comboTitleText}`;
        mid.appendChild(t);

        const subContainer = document.createElement("div");
        subContainer.className = "cart-sub-container cart-combo-details";
        (selections || []).forEach((sel) => {
          const productName = String(sel.product_name || "").trim();
          const variantLine = buildVariantDisplayLineForOrder(
            sel?.variant_label,
            sel?.variant_unit,
            sel?.variant_group_title
          );
          const primaryLine = [variantLine, productName].filter(Boolean).join(" ").trim() || (productName || "Товар");
          const ingredientsDisplay = Array.isArray(sel.ingredients_display) ? sel.ingredients_display : [];
          const selBlock = document.createElement("div");
          selBlock.className = "cart-combo-detail-block";
          const nameLine = document.createElement("div");
          nameLine.className = "cart-combo-detail-name";
          nameLine.textContent = "1 x " + primaryLine;
          selBlock.appendChild(nameLine);
          const detailsWrap = document.createElement("div");
          detailsWrap.className = "cart-sub-details";
          ingredientsDisplay.forEach((ing) => {
            const lineText = formatIngredientLineForOrder(ing);
            if (!lineText) return;
            const line = document.createElement("div");
            line.className = "cart-sub-detail-item";
            line.textContent = "\u2022 " + lineText;
            detailsWrap.appendChild(line);
          });
          if (detailsWrap.childNodes.length) selBlock.appendChild(detailsWrap);
          subContainer.appendChild(selBlock);
        });
        mid.appendChild(subContainer);

        const q = document.createElement("div");
        q.className = "cart-qty";
        const comboPlusBlockedByLimit = !canIncreaseComboCartItemBeforeApply(key, +1, {
          showToastOnOut: false,
        }).allowed;
        const { pill, btnMinus, btnPlus, center } = createQtyPill({
          variant: "muted",
          centerText: String(qty),
          // Минус всегда активен при qty > 0 — при qty = 1 будет работать как удаление
          minusEnabled: qty > 0,
          plusEnabled: !comboPlusBlockedByLimit,
        });
        const comboInitialLineState = getImmediateShopCartLineState(key, getImmediateShopCartPricingSnapshot());
        const comboPriceState = comboInitialLineState
          ? createCartPriceGroup(
              Number(comboInitialLineState.currentTotal || 0),
              Number(comboInitialLineState.originalTotal || 0)
            )
          : createCartPriceGroup(lineTotal, lineTotalOld);
        const desktopActions = document.createElement("div");
        desktopActions.className = "cart-desktop-actions";
        const desktopFavBtn = document.createElement("button");
        desktopFavBtn.type = "button";
        desktopFavBtn.className = "cart-desktop-btn cart-desktop-fav";
        desktopFavBtn.innerHTML = '<i class="fas fa-heart"></i>';
        desktopFavBtn.title = "В избранное";
        const desktopDeleteBtn = document.createElement("button");
        desktopDeleteBtn.type = "button";
        desktopDeleteBtn.className = "cart-desktop-btn cart-desktop-delete";
        desktopDeleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        desktopDeleteBtn.title = "Удалить";
        desktopDeleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteCartItemWithAnimation(swipeContainer, null, key);
        });
        desktopActions.appendChild(desktopFavBtn);
        desktopActions.appendChild(desktopDeleteBtn);
        bindFavoriteButtonsForCartRow(
          [favBtn, desktopFavBtn],
          () => buildFavoriteSnapshotFromResolvedItem(item, { oldLineTotal: lineTotalOld }),
          {
            afterToggle: () => {
              if (swipeContainer.classList.contains("is-swiped")) {
                resetSwipe(swipeContainer);
              }
            },
          }
        );
        const updateComboQty = () => {
          const cartItem = state.cart.find((x) => x.key === key);
          const newQty = Math.max(1, Number(cartItem?.qty || 0));
          center.textContent = String(newQty);
          t.textContent = `${newQty} x ${comboTitleText}`;
          // Минус не блокируем на qty = 1 — он должен работать как удаление
          btnMinus.classList.toggle("is-disabled", newQty <= 0);
          const pricingSnapshot = getImmediateShopCartPricingSnapshot();
          const currentLineState = getImmediateShopCartLineState(key, pricingSnapshot);
          if (currentLineState && typeof window.setShopCartPriceGroupDomState === "function") {
            window.setShopCartPriceGroupDomState(comboPriceState.wrap, currentLineState);
          } else {
            const nextLineTotal = roundPrice(unitPrice * newQty);
            const originalUnit = Number(cartItem?.unit_price_before_discount || 0) || unitPrice;
            const nextOriginalLineTotal = roundPrice(originalUnit * newQty);
            comboPriceState.sync(nextLineTotal, nextOriginalLineTotal);
          }
          const plusGate = canIncreaseComboCartItemBeforeApply(key, +1, {
            showToastOnOut: false,
          });
          btnPlus.disabled = !plusGate.allowed;
          btnPlus.classList.toggle("is-disabled", !plusGate.allowed);
        };
        btnPlus.addEventListener("click", (e) => {
          e.stopPropagation();
          if (btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
          const gate = canIncreaseComboCartItemBeforeApply(key, +1, {
            showToastOnOut: true,
            toastMessage: "Больше нет в наличии",
          });
          if (!gate.allowed) {
            updateComboQty();
            return;
          }
          const previousCartSnapshot = cloneCartState(state.cart);
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem) return;
          cartItem.qty = Math.max(1, Number(cartItem.qty || 0) + 1);
          saveCart();
          updateComboQty();
          updateCartTotalsUiOnly();
          queueCartStockRecheck(previousCartSnapshot, {
            toastMessage: "Больше нет в наличии",
          });
        });
        btnMinus.addEventListener("click", (e) => {
          e.stopPropagation();
          const cartItem = state.cart.find((x) => x.key === key);
          if (!cartItem) return;
          cartItem.qty = Math.max(0, Number(cartItem.qty || 0) - 1);
          if (cartItem.qty < 1) {
            removeFromCartByKey(key, null);
            swipeContainer.remove();
          } else {
            saveCart();
            updateComboQty();
          }
          updateCartTotalsUiOnly();
        });
        if (isUnavailable) {
          const soldOutBadge = document.createElement("div");
          soldOutBadge.className = "cart-sold-out-badge";
          soldOutBadge.textContent = "\u0420\u0430\u0441\u043a\u0443\u043f\u0438\u043b\u0438";
          q.appendChild(soldOutBadge);
        } else {
          q.appendChild(pill);
        }
        const bottomRow = document.createElement("div");
        bottomRow.className = "cart-bottom-row";
        const bottomMain = document.createElement("div");
        bottomMain.className = "cart-bottom-row__main";
        bottomMain.appendChild(comboPriceState.wrap);
        bottomRow.appendChild(bottomMain);
        const bottomControls = document.createElement("div");
        bottomControls.className = "cart-bottom-row__controls";
        bottomControls.appendChild(q);
        bottomControls.appendChild(desktopActions);
        bottomRow.appendChild(bottomControls);
        mid.appendChild(bottomRow);
        row.appendChild(mid);

        initSwipeGesture(swipeContainer, row, null, key);
        swipeContainer.appendChild(row);
        appendCartNode(swipeContainer);
        return;
      }

      const {
        product,
        qty,
        key,
        option_items: optionItems,
        ingredients: cartIngredients,
        ingredient_price_diff = 0,
        variant_label: variantLabel,
        variant_unit_price: variantUnitPrice,
      } = item;
      const isUnavailable = item?.is_unavailable === true;
      const pricing = computeItemPricing(
        {
          product,
          qty,
          option_items: optionItems,
          ingredients: cartIngredients,
          ingredient_price_diff,
          variant_label: variantLabel,
          variant_unit_price: variantUnitPrice,
          unit_price_override: item.unit_price_override != null ? Number(item.unit_price_override) : null,
          auto_add: Number(item.auto_add || 0),
          auto_add_group_id: toFiniteNumberOrNull(item.auto_add_group_id),
        },
        totals
      );
      const rule = pricing.isAuto ? getAutoRuleByProductId(product.id) : null;
      const group = rule?.group || null;
      const isGiftReward = item?.is_gift_reward === true;
      const allowQty = isGiftReward
        ? false
        : (!pricing.isAuto || !group ? true : Number(group.allow_customer_qty ?? 1) === 1);
      const allowRemove = true;
      const old = Number(product.old_price || 0);
      const parts = pricing.parts;
      const oldUnit = old > 0 ? (old + parts.optionTotal + parts.ingredientDiff) : 0;
      if (!isUnavailable) total += pricing.lineTotal;

      // ?????-?????????
      const swipeContainer = document.createElement("div");
      swipeContainer.className = "cart-swipe-container shop-cart-item-container";
      swipeContainer.setAttribute("data-cart-key", String(key || ""));

      // ?????? ???????? (?? ?????????)
      const swipeActions = document.createElement("div");
      swipeActions.className = "cart-swipe-actions";

      const favBtn = document.createElement("button");
      favBtn.type = "button";
      favBtn.className = "cart-swipe-btn cart-swipe-fav";
      favBtn.innerHTML = '<i class="fas fa-heart"></i>';
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "cart-swipe-btn cart-swipe-delete";
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowRemove) return;
        // Haptic feedback
        if (navigator.vibrate) navigator.vibrate(20);
        // ??????? ? ?????????
        deleteCartItemWithAnimation(swipeContainer, product.id, key);
      });
      if (!allowRemove) {
        deleteBtn.disabled = true;
        deleteBtn.style.pointerEvents = "none";
        deleteBtn.style.opacity = "0.5";
      }

      swipeActions.appendChild(favBtn);
      swipeActions.appendChild(deleteBtn);
      swipeContainer.appendChild(swipeActions);

      // ???????? ?????????? ????????
      const row = document.createElement("div");
      row.className = "cart-row cart-swipe-content shop-cart-item-row";
      if (isUnavailable) row.classList.add("is-unavailable");
      row.setAttribute("data-product-id", String(product.id));
      row.setAttribute("data-cart-key", String(key || ""));
      row.addEventListener("click", (e) => {
        // ?? ????????? ???? ????? ???????
        if (swipeContainer.classList.contains("is-swiped")) {
          e.stopPropagation();
          resetSwipe(swipeContainer);
          return;
        }
        if (isUnavailable) return;
        if (isGiftReward) {
          openProductDetails(product.id, { cartKey: key, prefillItem: item, readOnly: true });
          return;
        }
        openProductDetails(product.id, { cartKey: key });
      });

      const photos = safePhotos(product);
      const mainPhoto = photos[0] || "";

      const img = createOptimizedImage(mainPhoto || "/static/img/placeholder.png", {
        type: 'cart-thumb',
        className: 'cart-thumb',
        alt: '',
        usePicture: true,
      });
      if (img && img.classList) img.classList.add("cart-thumb-node");
      const thumbWrap = document.createElement("div");
      thumbWrap.className = "cart-thumb-wrap";
      thumbWrap.appendChild(img);
      const cartBuyXGetYBadge = createCatalogBuyXGetYBadge(product);
      if (cartBuyXGetYBadge) {
        cartBuyXGetYBadge.classList.add("cart-bogo-badge");
        thumbWrap.appendChild(cartBuyXGetYBadge);
      }
      row.appendChild(thumbWrap);

      const mid = document.createElement("div");
      mid.className = "cart-mid";

      const t = document.createElement("div");
      t.className = "cart-title";
      const productNameText = str(product?.name || item?.name || "Товар");
      const primaryVariantLine = buildVariantDisplayLineForOrder(
        variantLabel,
        item?.variant_unit || item?.variantUnit || "",
        item?.variant_group_title || item?.variantGroupTitle || ""
      );
      const titleBase = [primaryVariantLine, productNameText].filter(Boolean).join(" ").trim() || productNameText;
      const titleText = isGiftReward ? `${titleBase} (Подарок)` : titleBase;
      t.textContent = `${qty} x ${titleText}`;
      mid.appendChild(t);

      // ????????? ???????? ? ?????????? ???????: ???????? ? ??????????? ? ?????
      const ingredientParts = [];
      const optionParts = [];
      
      // 2. ??????????? (???????) ? ?? ?????????? ? ??????????? 0
      if (Array.isArray(cartIngredients) && cartIngredients.length > 0) {
        cartIngredients.forEach(ing => {
          if (Number(ing.quantity ?? ing.qty ?? 0) <= 0) return;
          const formatted = formatIngredientLineForOrder(ing);
          if (formatted) ingredientParts.push(formatted);
        });
      }
      
      // 3. ????? (????????) ? ?? ?????????? ? ??????????? 0
      if (Array.isArray(optionItems) && optionItems.length > 0) {
        optionItems.forEach(opt => {
          if (Number(opt.qty ?? opt.quantity ?? 0) <= 0) return;
          const formatted = formatOptionLineForOrder(opt);
          if (formatted) optionParts.push(formatted);
        });
      }

      const autoFreeQtyHint = pricing.isAuto
        ? Math.max(
            0,
            Number(pricing.freeQty || 0),
            Number(pricing.lineTotal || 0) <= 0 && qty > 0 ? qty : 0
          )
        : 0;
      if (autoFreeQtyHint > 0) {
        optionParts.push(`Бесплатно: ${autoFreeQtyHint} шт.`);
      }
      
      // ?????????? ??? ????????
      const allParts = [...ingredientParts, ...optionParts];
      
      // ??????? ????????? ??? ???????? (????? ???????????)
      const subContainer = document.createElement("div");
      subContainer.className = "cart-sub-container";
      
      if (allParts.length > 0) {
        // ????????? ?????? ??????? (??? В корзине пусто?)
        const subDetails = document.createElement("div");
        subDetails.className = "cart-sub-details";
        
        allParts.forEach(part => {
          const detailItem = document.createElement("div");
          detailItem.className = "cart-sub-detail-item";
          detailItem.textContent = `\u2022 ${part}`;
          subDetails.appendChild(detailItem);
        });
        
        subContainer.appendChild(subDetails);
      } else {
        // ???? ??? ?????????, ?????? ?????? ??????
        subContainer.style.display = "none";
      }
      
      mid.appendChild(subContainer);

      const q = document.createElement("div");
      q.className = "cart-qty";

      const plusBlockedByLimit = allowQty && isCartQtyPlusBlocked(key, qty);
      const { pill, btnMinus, btnPlus, center } = createQtyPill({
        variant: "muted",
        centerText: String(qty),
        minusEnabled: qty > 0 && allowQty,
        plusEnabled: allowQty && !plusBlockedByLimit,
      });
      pill.classList.toggle("is-empty", qty <= 0);
      let qtyControlNode = pill;
      if (isUnavailable) {
        const soldOutBadge = document.createElement("div");
        soldOutBadge.className = "cart-sold-out-badge";
        soldOutBadge.textContent = "\u0420\u0430\u0441\u043a\u0443\u043f\u0438\u043b\u0438";
        qtyControlNode = soldOutBadge;
      } else if (isGiftReward) {
        const fixedQty = document.createElement("div");
        fixedQty.className = "qty-pill qty-pill--muted cart-gift-fixed-qty is-disabled";
        const fixedCenter = document.createElement("span");
        fixedCenter.className = "qty-pill__center";
        fixedCenter.innerHTML = '<i class="fas fa-gift" aria-hidden="true"></i>';
        fixedCenter.setAttribute("aria-label", "Подарок");
        fixedCenter.setAttribute("title", "Подарок");
        fixedQty.appendChild(fixedCenter);
        qtyControlNode = fixedQty;
      }

      const syncRegularRowQtyUi = () => {
        if (!row.isConnected) return 0;
        const cartItem = getCartItemByKey(key);
        const newQty = Math.max(0, Number(cartItem?.qty || 0));

        center.textContent = String(newQty);
        t.textContent = `${newQty} x ${titleText}`;

        const resolvedItems = cartItemsResolved();
        const displayItems = cartItemsResolved(state.cart, { includeDormantAutoAdd: true });
        const pricingSnapshot = getImmediateShopCartPricingSnapshot();
        const currentLineState = getImmediateShopCartLineState(key, pricingSnapshot);
        if (currentLineState && typeof window.setShopCartPriceGroupDomState === "function") {
          window.setShopCartPriceGroupDomState(priceState.wrap, currentLineState);
        }
        const currentItemResolved = displayItems.find((x) => String(x?.key || "") === String(key || ""));
        if (!currentLineState && currentItemResolved) {
          const currentTotals = {
            nonAutoTotal: computeNonAutoTotal(resolvedItems),
            autoEligibleTotal: computeAutoEligibleTotal(resolvedItems),
          };
          const currentPricing = computeItemPricing(currentItemResolved, currentTotals);
          const currentParts = currentPricing.parts || {};
          const currentOld = Number(currentItemResolved.product?.old_price || 0);
          const currentOldUnit = currentOld > 0
            ? (currentOld + Number(currentParts.optionTotal || 0) + Number(currentParts.ingredientDiff || 0))
            : 0;
          const currentHasDiscount = Number(currentPricing.discountAmount || 0) > 0;
          const currentShowOld =
            !isGiftReward &&
            !currentPricing.isAuto &&
            (currentHasDiscount || (currentOldUnit > 0 && currentOldUnit > currentPricing.unitPrice));
          const currentOriginalLineTotal = isGiftReward
            ? 0
            : currentHasDiscount
            ? (currentPricing.lineTotal + Number(currentPricing.discountAmount || 0))
            : (currentOldUnit * newQty);

          priceState.sync(
            currentPricing.lineTotal,
            currentShowOld ? currentOriginalLineTotal : 0
          );
        }

        const plusBlockedNow = !allowQty || isCartQtyPlusBlocked(key, newQty);
        btnPlus.disabled = plusBlockedNow;
        btnPlus.classList.toggle("is-disabled", plusBlockedNow);
        const minusDisabledNow = !allowQty || newQty <= 0;
        btnMinus.disabled = minusDisabledNow;
        btnMinus.classList.toggle("is-disabled", minusDisabledNow);
        pill.classList.toggle("is-empty", newQty <= 0);
        return newQty;
      };

      btnPlus.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!allowQty || btnPlus.disabled || btnPlus.classList.contains("is-disabled")) return;
        await changeQty(product.id, +1, null, key, { skipCartRerender: true });
        syncRegularRowQtyUi();
      });
      btnMinus.addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!allowQty || btnMinus.disabled || btnMinus.classList.contains("is-disabled")) return;
        const currentQty = Number(getCartItemByKey(key)?.qty || 0);
        if (currentQty <= 1) {
          const currentItem = getCartItemByKey(key);
          if (Number(currentItem?.auto_add || 0) === 1) {
            await changeQty(product.id, -1, null, key, { skipCartRerender: true });
            syncRegularRowQtyUi();
            return;
          }
          deleteCartItemWithAnimation(swipeContainer, product.id, key);
          return;
        }
        const canLightUpdate = currentQty > 1;
        await changeQty(product.id, -1, null, key, { skipCartRerender: canLightUpdate });
        if (canLightUpdate) syncRegularRowQtyUi();
      });
      if (!allowQty) {
        btnPlus.disabled = true;
        btnMinus.disabled = true;
        pill.classList.add("is-disabled");
      } else {
        btnPlus.disabled = plusBlockedByLimit;
        btnPlus.classList.toggle("is-disabled", plusBlockedByLimit);
      }

      q.appendChild(qtyControlNode);
      const hasDiscount = pricing.discountAmount > 0;
      const showOld = !isGiftReward && !pricing.isAuto && (hasDiscount || (oldUnit > 0 && oldUnit > pricing.unitPrice));
      const originalLineTotal = isGiftReward
        ? 0
        : hasDiscount
          ? (pricing.lineTotal + pricing.discountAmount)
          : (oldUnit * qty);
      const initialLineState = getImmediateShopCartLineState(key, getImmediateShopCartPricingSnapshot());
      const initialLineCurrentTotal = Number(initialLineState?.currentTotal || pricing.lineTotal || 0);
      const initialLineOriginalTotal = isGiftReward
        ? 0
        : Number(initialLineState?.originalTotal || 0);
      const priceState = initialLineState
        ? createCartPriceGroup(
            initialLineCurrentTotal,
            initialLineOriginalTotal
          )
        : createCartPriceGroup(pricing.lineTotal, showOld ? originalLineTotal : 0);

      // ?????????? ?????? ????????
      const desktopActions = document.createElement("div");
      desktopActions.className = "cart-desktop-actions";

      const desktopFavBtn = document.createElement("button");
      desktopFavBtn.type = "button";
      desktopFavBtn.className = "cart-desktop-btn cart-desktop-fav";
      desktopFavBtn.innerHTML = '<i class="fas fa-heart"></i>';
      desktopFavBtn.title = "В избранное";
      const desktopDeleteBtn = document.createElement("button");
      desktopDeleteBtn.type = "button";
      desktopDeleteBtn.className = "cart-desktop-btn cart-desktop-delete";
      desktopDeleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      desktopDeleteBtn.title = "Удалить";
      desktopDeleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!allowRemove) return;
        deleteCartItemWithAnimation(swipeContainer, product.id, key);
      });
      if (!allowRemove) {
        desktopDeleteBtn.disabled = true;
        desktopDeleteBtn.style.pointerEvents = "none";
        desktopDeleteBtn.style.opacity = "0.5";
      }

      desktopActions.appendChild(desktopFavBtn);
      desktopActions.appendChild(desktopDeleteBtn);
      bindFavoriteButtonsForCartRow(
        [favBtn, desktopFavBtn],
        () =>
          buildFavoriteSnapshotFromResolvedItem(item, {
            pricing,
            oldLineTotal: showOld ? originalLineTotal : null,
          }),
        {
          afterToggle: () => {
            if (swipeContainer.classList.contains("is-swiped")) {
              resetSwipe(swipeContainer);
            }
          },
        }
      );
      const bottomRow = document.createElement("div");
      bottomRow.className = "cart-bottom-row";
      const bottomMain = document.createElement("div");
      bottomMain.className = "cart-bottom-row__main";
      bottomMain.appendChild(priceState.wrap);
      bottomRow.appendChild(bottomMain);
      const bottomControls = document.createElement("div");
      bottomControls.className = "cart-bottom-row__controls";
      bottomControls.appendChild(q);
      bottomControls.appendChild(desktopActions);
      bottomRow.appendChild(bottomControls);
      mid.appendChild(bottomRow);
      row.appendChild(mid);

      swipeContainer.appendChild(row);

      // ????????????? ?????-??????
      initSwipeGesture(swipeContainer, row, product.id, key);

      appendCartNode(swipeContainer);
    });

    const hasBaseItems = activeItems.some((item) => {
      const qty = Number(item?.qty || 0);
      if (qty <= 0) return false;
      if (item?.type === "combo") return true;
      const pid = Number(item?.product?.id || item?.product_id);
      if (!Number.isFinite(pid)) return false;
      return Number(item?.auto_add || 0) !== 1;
    });

    if (listEl && hasBaseItems && state.autoAddDismissed.size) {
      const cartProductIds = new Set(
        activeItems
          .map((item) => Number(item?.product?.id || item?.product_id))
          .filter((pid) => Number.isFinite(pid))
      );
      const groups = Array.isArray(state.autoAdd?.groups) ? state.autoAdd.groups : [];
      const rules = Array.isArray(state.autoAdd?.items) ? state.autoAdd.items : [];
      const itemsByGroup = new Map();
      rules.forEach((rule) => {
        const gid = Number(rule.group_id);
        if (!Number.isFinite(gid)) return;
        if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
        itemsByGroup.get(gid).push(rule);
      });

      const sortedGroups = groups
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0));

      sortedGroups.forEach((group) => {
        const groupId = Number(group.id);
        if (!Number.isFinite(groupId)) return;
        const groupRules = (itemsByGroup.get(groupId) || []).slice().sort(
          (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || Number(a.id || 0) - Number(b.id || 0)
        );
        if (!groupRules.length) return;

        const baseTotal = Number(group.include_auto_in_total || 0) === 1 ? totals.autoEligibleTotal : totals.nonAutoTotal;
        const minAmount = group.min_cart_amount != null ? Number(group.min_cart_amount) : null;
        const maxAmount = group.max_cart_amount != null ? Number(group.max_cart_amount) : null;
        const minOk = minAmount == null || baseTotal >= minAmount;
        const maxOk = maxAmount == null || baseTotal <= maxAmount;
        const eligible = minOk && maxOk;
        if (!eligible) return;

        groupRules.forEach((rule) => {
          const pid = Number(rule.product_id);
          if (!Number.isFinite(pid)) return;
          if (cartProductIds.has(pid)) return;
          if (!isAutoAddDismissed(groupId, pid)) return;

          const product = state.productCache.get(pid) || rule.product;
          if (!product) return;
          if (!isProductAvailable(product)) return;

          const row = document.createElement("div");
          row.className = "cart-row is-auto-ghost shop-cart-item-row";
          row.setAttribute("data-product-id", String(product.id));
          row.addEventListener("click", () => {
            openProductDetails(product.id);
          });

          const photos = safePhotos(product);
          const mainPhoto = photos[0] || "";
          const img = createOptimizedImage(mainPhoto || "/static/img/placeholder.png", {
            type: "cart-thumb",
            className: "cart-thumb",
            alt: "",
          });
          row.appendChild(img);

          const mid = document.createElement("div");
          mid.className = "cart-mid";

          const t = document.createElement("div");
          t.className = "cart-title";
          t.textContent = `${str(product.name)} × 0`;
          mid.appendChild(t);

          const subContainer = document.createElement("div");
          subContainer.className = "cart-sub-container";
          subContainer.textContent = "Рекомендуемое";
          mid.appendChild(subContainer);

          const q = document.createElement("div");
          q.className = "cart-qty";
          const { pill, btnMinus, btnPlus, center } = createQtyPill({
            variant: "muted",
            centerText: "0",
            minusEnabled: false,
          });
          btnMinus.disabled = true;
          pill.classList.add("is-disabled");

          btnPlus.addEventListener("click", async (e) => {
            e.stopPropagation();
            clearAutoAddDismissed(groupId, pid);
            const desiredQty = getAutoAddDesiredQty(rule);
            const targetKey = makeCartKey(pid, []);
            await changeQty(pid, desiredQty, null, targetKey);
            const restored = getCartItemByKey(targetKey) || state.cart.find((x) => Number(x.product_id || x.id) === pid) || null;
            if (restored) {
              restored.auto_add = 1;
              restored.auto_add_group_id = groupId;
            }
            center.textContent = String(getCartItemByKey(targetKey)?.qty || restored?.qty || 0);
          });

          q.appendChild(pill);
          const ghostPriceState = createCartPriceGroup(0, 0);

          const bottomRow = document.createElement("div");
          bottomRow.className = "cart-bottom-row";
          const bottomMain = document.createElement("div");
          bottomMain.className = "cart-bottom-row__main";
          bottomMain.appendChild(ghostPriceState.wrap);
          bottomRow.appendChild(bottomMain);
          const bottomControls = document.createElement("div");
          bottomControls.className = "cart-bottom-row__controls";
          bottomControls.appendChild(q);
          bottomRow.appendChild(bottomControls);
          mid.appendChild(bottomRow);
          row.appendChild(mid);

          appendCartNode(row);
        });
      });
    }

    if (listEl) {
      listEl.appendChild(buildCartBenefitsServiceSection());
      const bonusRedeemSection = buildCartBonusRedeemSection();
      if (bonusRedeemSection) listEl.appendChild(bonusRedeemSection);
      else refreshCartBonusSectionAfterConfigLoad(listEl, totalEl);

      const pricingSummarySection = document.createElement("section");
      pricingSummarySection.className = "shop-cart-pricing-summary-section hidden";
      pricingSummarySection.innerHTML = `
        <div class="shop-cart-pricing-summary-card">
          <div class="shop-cart-pricing-summary-content">
            <div class="shop-cart-pricing-summary-loading">Пересчитываем суммы...</div>
          </div>
        </div>
      `;
      listEl.appendChild(pricingSummarySection);
    }

    if (totalEl) totalEl.textContent = money(total);
    if (listEl && bindInteractive) {
      bindCartItemsSectionControls(listEl);
      bindCartModeHeaderSticky(listEl);
      if (typeof window.syncShopCartBenefitsServiceUi === "function") {
        Promise.resolve(window.syncShopCartBenefitsServiceUi(listEl)).catch(() => {});
      }
      bindCartBonusRedeemSection(listEl);
    }
    return { items: activeItems, total, displayItems: items };
  }

  // ========== ?????-?????????? ??? ??????? ==========
  let currentSwipedContainer = null;
  const SWIPE_THRESHOLD = 10; // px ??? ?????? ??????
  const SWIPE_ACTIONS_WIDTH = 120; // ?????? ???? ??????
  const DELETE_THRESHOLD = 0.6; // 60% ?????? ??? ????????

  function showToast(message) {
    // ??????? ?????????? toast ???? ????
    const existing = document.querySelector(".shop-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "shop-toast";
    toast.textContent = message;
    document.body.appendChild(toast);

    // ??????????
    requestAnimationFrame(() => {
      toast.classList.add("is-visible");
    });

    // ???????? ????? 2 ???
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function resetSwipe(container, animate = true) {
    if (!container) return;
    const content = container.querySelector(".cart-swipe-content");
    if (!content) return;

    if (animate) {
      content.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    }
    content.style.transform = "translateX(0)";
    container.classList.remove("is-swiped");

    if (currentSwipedContainer === container) {
      currentSwipedContainer = null;
    }

    if (animate) {
      setTimeout(() => {
        content.style.transition = "";
      }, 300);
    }
  }

  function resetAllSwipes() {
    document.querySelectorAll(".cart-swipe-container.is-swiped").forEach(c => resetSwipe(c));
  }

  async function restoreGiftRewardToBenefits(rewardId) {
    const numericRewardId = Number(rewardId || 0);
    if (!(numericRewardId > 0)) return null;
    const token = typeof getCustomerToken === "function" ? str(getCustomerToken() || "").trim() : "";
    if (!token) {
      showToast("Не удалось вернуть подарок в выгоды");
      return null;
    }
    try {
      const response = await apiJson("/api/public/checkout/benefits/restore-gift", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-customer-token": token,
        },
        body: { reward_id: numericRewardId },
      });
      return response?.data && typeof response.data === "object"
        ? response.data
        : { reward_id: numericRewardId };
    } catch (error) {
      console.error("Failed to restore gift reward:", error);
      showToast("Не удалось вернуть подарок в выгоды");
      return null;
    }
  }

  function removeCartNodesByKeys(cartKeys) {
    const keys = Array.isArray(cartKeys) ? cartKeys : [];
    keys.forEach((rawKey) => {
      const normalizedKey = String(rawKey || "");
      if (!normalizedKey) return;
      const escapedKey = (typeof CSS !== "undefined" && typeof CSS.escape === "function")
        ? CSS.escape(normalizedKey)
        : normalizedKey.replace(/([\"\\])/g, "\\$1");
      document
        .querySelectorAll(`.cart-swipe-container[data-cart-key="${escapedKey}"], .cart-row[data-cart-key="${escapedKey}"]`)
        .forEach((node) => {
          if (node && node.parentNode) node.remove();
        });
    });
  }

  function finalizeCartAfterRemoval(removedItems) {
    const safeRemovedItems = Array.isArray(removedItems) ? removedItems : [];
    safeRemovedItems.forEach((removedItem) => {
      if (!removedItem) return;
      const pid = Number(removedItem.product_id || removedItem.id);
      if (Number.isFinite(pid) && Number(removedItem.auto_add || 0) === 1) {
        markAutoAddDismissedByProduct(pid);
      }
    });

    applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();
    scheduleSyncAllProductCardsFromCart();
    updateCartBadge();

    const items = cartItemsResolved();
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (openCartSheetCtx) {
      if (openCartSheetCtx.footerEl) {
        openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      }
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        const total = computeCartTotals(items).total;
        if (tspan) tspan.textContent = money(total);
        if (isMobile && elMobileCheckoutBtn) {
          elMobileCheckoutBtn.disabled = items.length === 0;
        }
      }
      if (openCartSheetCtx.totalEl) {
        openCartSheetCtx.totalEl.textContent = money(computeCartTotals(items).total);
      }
      if (items.length === 0 && openCartSheetCtx.listEl) {
        renderCartEmptyStateIntoList(openCartSheetCtx.listEl, buildCartModeHeader());
      }
    }

    if (isMobile) updateMobileDeliveryProgress();
    if (isMobile && elMobileCartActions) {
      if (items.length === 0) {
        elMobileCartActionsCart?.classList.add("hidden");
        elMobileCartActionsCheckout?.classList.add("hidden");
        updateMobileDeliveryProgress();
      } else {
        elMobileCartActionsCart?.classList.remove("hidden");
        updateMobileDeliveryProgress();
      }
    }

    markCartUiDirty();
    if (items.length === 0) {
      renderCart(true);
      return;
    }

    if (elCartEmpty) elCartEmpty.classList.add("hidden");
    if (elCartList) appendUpsellToList(elCartList);
    if (openCartSheetCtx?.listEl && openCartSheetCtx.listEl !== elCartList) {
      appendUpsellToList(openCartSheetCtx.listEl);
    }
    updateCartTotalsUiOnly();
    cartUiRenderedRevision = cartUiRevision;
  }

  function removeGiftRewardBundleFromCart(rewardId) {
    const numericRewardId = Number(rewardId || 0);
    if (!(numericRewardId > 0)) return false;
    const removedItems = [];
    const removedKeys = [];
    state.cart = state.cart.filter((item) => {
      if (Number(item?.gift_reward_id || 0) !== numericRewardId) return true;
      removedItems.push(item);
      const itemKey = String(item?.key || "");
      if (itemKey) removedKeys.push(itemKey);
      return false;
    });
    if (!removedItems.length) return false;
    removeCartNodesByKeys(removedKeys);
    finalizeCartAfterRemoval(removedItems);
    return true;
  }

  async function deleteCartItemWithAnimation(container, productId, cartKey) {
    if (!container) return;
    if (container.dataset.removing === "1") return;
    container.dataset.removing = "1";

    const cartItem = cartKey ? getCartItemByKey(cartKey) : null;
    const isGiftReward = Number(cartItem?.is_gift_reward || 0) === 1;
    const giftRewardId = Number(cartItem?.gift_reward_id || 0);
    const benefitsSourcePreviewRequest = typeof window.getBenefitsStoreSnapshot === "function"
      ? (window.getBenefitsStoreSnapshot()?.lastPreviewRequest || null)
      : null;
    let restoredGiftData = null;
    if (isGiftReward) {
      restoredGiftData = await restoreGiftRewardToBenefits(giftRewardId);
      if (!restoredGiftData) {
        delete container.dataset.removing;
        return;
      }
    }

    const content = container.querySelector(".cart-swipe-content");
    if (content) {
      content.style.transition = "transform 0.3s ease-out";
      content.style.transform = "translateX(-100%)";
    }

    container.style.transition = "height 0.3s ease-out, opacity 0.3s ease-out, margin 0.3s ease-out, padding 0.3s ease-out";
    container.style.overflow = "hidden";

    setTimeout(() => {
      const height = container.offsetHeight;
      container.style.height = height + "px";

      requestAnimationFrame(() => {
        container.style.height = "0";
        container.style.opacity = "0";
        container.style.marginTop = "0";
        container.style.marginBottom = "0";
        container.style.paddingTop = "0";
        container.style.paddingBottom = "0";
      });
    }, 50);

    setTimeout(() => {
      if (isGiftReward && giftRewardId > 0) {
        removeGiftRewardBundleFromCart(giftRewardId);
        if (typeof window.applyCheckoutBenefitGiftRestoredLocally === "function") {
          try {
            const appliedLocally = window.applyCheckoutBenefitGiftRestoredLocally({
              rewardId: giftRewardId,
              giftCard: restoredGiftData?.gift_card || null,
              sourcePreviewRequest: benefitsSourcePreviewRequest,
              reopenHost: false,
            });
            if (!appliedLocally && typeof window.handleShopBenefitsOrderStateChange === "function") {
              window.handleShopBenefitsOrderStateChange("gift.restore.fallback");
            }
          } catch {}
        } else if (typeof window.handleShopBenefitsOrderStateChange === "function") {
          window.handleShopBenefitsOrderStateChange("gift.restore.fallback");
        }
      } else {
        removeFromCartByKey(cartKey, productId);
      }
      container.remove();
    }, 350);
  }

function removeFromCartByKey(cartKey, productId) {
    const idx = state.cart.findIndex(item => {
      if (cartKey && item.key === cartKey) return true;
      if (!cartKey && item.id === productId && !item.key) return true;
      return false;
    });
    if (idx !== -1) {
      const removedItem = state.cart[idx];
      state.cart.splice(idx, 1);
      const removedKey = String(removedItem?.key || cartKey || "");
      removeCartNodesByKeys(removedKey ? [removedKey] : []);
      finalizeCartAfterRemoval(removedItem ? [removedItem] : []);
      return;
      applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      saveCart();
      scheduleSyncAllProductCardsFromCart();
      updateCartBadge();

      // ????????? footer ? ?????? ??????????
      const items = cartItemsResolved();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (openCartSheetCtx) {
        if (openCartSheetCtx.footerEl) {
          openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        }
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          const total = computeCartTotals(items).total;
          if (tspan) tspan.textContent = money(total);
          if (isMobile && elMobileCheckoutBtn) {
            elMobileCheckoutBtn.disabled = items.length === 0;
          }
        }
        if (openCartSheetCtx.totalEl) {
          openCartSheetCtx.totalEl.textContent = money(computeCartTotals(items).total);
        }
        // ???В корзине пусто - ???????? ?????????
        if (items.length === 0 && openCartSheetCtx.listEl) {
          renderCartEmptyStateIntoList(openCartSheetCtx.listEl, buildCartModeHeader());
        }
        // Перестраиваем апселл: удалённый товар должен снова появиться в списке
      }

      // ???????: ???????? ?????? В корзине пусто???? ???????? (????? ? ????????)
      if (isMobile) updateMobileDeliveryProgress();
      // ???????: ??? ?????В корзине пусто??? ?????? ?????? (? ? ????????), ??????? ????????? ???????? ????????
      if (isMobile && elMobileCartActions) {
        if (items.length === 0) {
          elMobileCartActionsCart?.classList.add("hidden");
          elMobileCartActionsCheckout?.classList.add("hidden");
          updateMobileDeliveryProgress();
        } else {
          elMobileCartActionsCart?.classList.remove("hidden");
          updateMobileDeliveryProgress();
        }
      }

      // ????????В корзине пусто??
      markCartUiDirty();
      if (items.length === 0) {
        renderCart(true);
        return;
      }

      if (elCartEmpty) elCartEmpty.classList.add("hidden");
      if (elCartList) appendUpsellToList(elCartList);
      if (openCartSheetCtx?.listEl && openCartSheetCtx.listEl !== elCartList) {
        appendUpsellToList(openCartSheetCtx.listEl);
      }
      updateCartTotalsUiOnly();
      cartUiRenderedRevision = cartUiRevision;
    }
  }

  function isComboCatalogBlockProductAddable(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return false;
    const product = state.productCache.get(pid);
    if (!product) return true;

    const stockAvailable = isProductAvailable(product);
    if (!stockAvailable) return false;
    if (isProductBlockedByIngredientRequirements(pid)) return false;

    const remaining = getAvailableStock(pid);
    if (!Number.isFinite(remaining)) return true;

    const requiredPerUnit = calcConsumedPerUnit(product, null, null);
    const required = Number.isFinite(requiredPerUnit) && requiredPerUnit > 0 ? requiredPerUnit : 1;
    return remaining + 1e-9 >= required;
  }

  function isComboCatalogEntryAvailable(combo) {
    const blocks = Array.isArray(combo?.block_product_ids) ? combo.block_product_ids : [];
    if (!blocks.length) return true;

    for (const block of blocks) {
      const pids = Array.isArray(block)
        ? block.map((pid) => Number(pid || 0)).filter((pid) => Number.isFinite(pid) && pid > 0)
        : [];
      if (!pids.length) return false;
      if (!pids.some((pid) => isComboCatalogBlockProductAddable(pid))) return false;
    }
    return true;
  }

  function initSwipeGesture(container, content, productId, cartKey) {
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isDragging = false;
    let isHorizontal = null;
    const containerWidth = () => container.offsetWidth || 300;

    function onTouchStart(e) {
      if (e.touches.length !== 1) return;
      
      // ???????? ?????? ??????
      if (currentSwipedContainer && currentSwipedContainer !== container) {
        resetSwipe(currentSwipedContainer);
      }

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      currentX = container.classList.contains("is-swiped") ? -SWIPE_ACTIONS_WIDTH : 0;
      isDragging = false;
      isHorizontal = null;
      content.style.transition = "";
    }

    function onTouchMove(e) {
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      // ?????????? ??????????? ??? ?????? ????????
      if (isHorizontal === null && (Math.abs(deltaX) > SWIPE_THRESHOLD || Math.abs(deltaY) > SWIPE_THRESHOLD)) {
        isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      }

      // ???? ???????????? ???????? - ?? ?????????????
      if (isHorizontal === false) return;

      // ???? ?????????????? - ????????
      if (isHorizontal === true) {
        isDragging = true;
        
        let newX = currentX + deltaX;
        
        // ???????????: ?? ?????? ?????? ??? 0, ?? ?????? ????? ??? 60% ??????
        const maxLeft = -containerWidth() * DELETE_THRESHOLD;
        newX = Math.max(maxLeft, Math.min(20, newX)); // ????????? bounce ??????
        
        content.style.transform = `translateX(${newX}px)`;

        // Haptic ??? ?????????? ?????? ????????
        if (newX <= maxLeft + 5 && newX > maxLeft - 5) {
          if (navigator.vibrate) navigator.vibrate(10);
        }
      }
    }

    function onTouchEnd(e) {
      if (!isDragging) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - startX;
      let finalX = currentX + deltaX;

      const width = containerWidth();
      const deleteThreshold = -width * DELETE_THRESHOLD;

      content.style.transition = "transform 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)";

      if (finalX <= deleteThreshold) {
        // ???????
        if (navigator.vibrate) navigator.vibrate(20);
        deleteCartItemWithAnimation(container, productId, cartKey);
      } else if (finalX < -SWIPE_ACTIONS_WIDTH / 2) {
        // ????????? ?? ???????
        content.style.transform = `translateX(-${SWIPE_ACTIONS_WIDTH}px)`;
        container.classList.add("is-swiped");
        currentSwipedContainer = container;
      } else {
        // ?????????? ?????
        content.style.transform = "translateX(0)";
        container.classList.remove("is-swiped");
        if (currentSwipedContainer === container) {
          currentSwipedContainer = null;
        }
      }

      setTimeout(() => {
        content.style.transition = "";
      }, 300);

      isDragging = false;
      isHorizontal = null;
    }

    content.addEventListener("touchstart", onTouchStart, { passive: true });
    content.addEventListener("touchmove", onTouchMove, { passive: true });
    content.addEventListener("touchend", onTouchEnd, { passive: true });
  }

  // ????? ?????? ??? ????? ??? ????????
  document.addEventListener("click", (e) => {
    if (currentSwipedContainer && !currentSwipedContainer.contains(e.target)) {
      resetSwipe(currentSwipedContainer);
    }
  });

  function syncCartFooterVisibilityForCartMode(itemsCount) {
    if (!elCartFooter || cartViewMode !== "cart") return;
    const hasItems = Number(itemsCount || 0) > 0;

    elCartFooter.classList.toggle("hidden", !hasItems);
    if (elDesktopDeliveryProgressWrap) elDesktopDeliveryProgressWrap.classList.add("hidden");
    if (elCartFooterActions) elCartFooterActions.classList.toggle("hidden", !hasItems);
  }

  function renderCart(force = false) {
    if (!elCartList) return;
    if (!force && cartUiRenderedRevision === cartUiRevision) {
      updateMobileDeliveryProgress();
      queueMobileUiStateSync("renderCart.noop");
      return;
    }

    const { items, total } = renderCartInto(elCartList, elCartTotal, elCartEmpty);

    syncCartFooterVisibilityForCartMode(items.length);
    if (elCheckoutBtn) elCheckoutBtn.disabled = items.length === 0;

    if (elCheckoutBtn) {
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(total);
    }
    updateMobileDeliveryProgress();
    appendUpsellToList(elCartList);
    if (items.length > 0 && typeof ensureShopLateLoaded === "function") {
      Promise.resolve(ensureShopLateLoaded()).then(() => {
        if (typeof window.syncShopCartPricingSummaryUi === "function") {
          return window.syncShopCartPricingSummaryUi();
        }
        return null;
      }).then(() => {
        if (typeof window.handleShopBenefitsOrderStateChange === "function") {
          window.handleShopBenefitsOrderStateChange("renderCart");
        }
      }).catch(() => {});
    } else if (typeof window.handleShopBenefitsOrderStateChange === "function") {
      window.handleShopBenefitsOrderStateChange("renderCart.empty");
    }
    cartUiRenderedRevision = cartUiRevision;
    queueMobileUiStateSync("renderCart.rendered");
  }

  function renderCartIfDirty(force = false) {
    renderCart(force);
  }

function updateCartBadge() {
  const n = cartCountTotal();

  // ????????? badge
  if (elNavCartBadge) {
    elNavCartBadge.textContent = String(n);
    if (n > 0) elNavCartBadge.classList.remove("hidden");
    else elNavCartBadge.classList.add("hidden");
  }

  // ???? ???? desktop badge (???????????)
  if (elCartOpenDesktop) {
    const b = $("#shopCartBadge", elCartOpenDesktop);
    if (b) {
      b.textContent = String(n);
      if (n > 0) b.classList.remove("hidden");
      else b.classList.add("hidden");
    }
  }

  // bounce ?????? ????? ?????????? ???????????
  const prev = window.__lastCartCountForNav || 0;
  if (n > prev && typeof bounceCartNav === "function") bounceCartNav();
  window.__lastCartCountForNav = n;
  if (typeof window.syncBenefitsBadgesUi === "function") {
    const benefitsCount = typeof window.getAvailableBenefitsCount === "function"
      ? window.getAvailableBenefitsCount()
      : null;
    window.syncBenefitsBadgesUi(benefitsCount);
  }
  if (typeof window.handleShopBenefitsOrderStateChange === "function") {
    window.handleShopBenefitsOrderStateChange("updateCartBadge");
  }
}

  let clearCartAllBusy = false;

  async function clearCartAll(options = {}) {
    if (clearCartAllBusy) return false;
    clearCartAllBusy = true;
    try {
      const shouldRestoreGiftRewards = options?.restoreGiftRewards !== false;
      const previousCartSnapshot = cloneCartState(state.cart);
      const giftRewardIds = Array.from(
        new Set(
          previousCartSnapshot
            .map((item) => Number(item?.gift_reward_id || 0))
            .filter((rewardId) => Number.isFinite(rewardId) && rewardId > 0)
        )
      );
      const benefitsSourcePreviewRequest = typeof window.getBenefitsStoreSnapshot === "function"
        ? (window.getBenefitsStoreSnapshot()?.lastPreviewRequest || null)
        : null;
      const restoredGiftRewards = [];

      if (shouldRestoreGiftRewards) {
        for (const rewardId of giftRewardIds) {
          const restoredGiftData = await restoreGiftRewardToBenefits(rewardId);
          if (!restoredGiftData) {
            return false;
          }
          restoredGiftRewards.push({
            rewardId,
            giftCard: restoredGiftData?.gift_card || null,
          });
        }
      }

      state.cart = [];
      clearAllAutoAddDismissed();
      applyAutoAddRules();
      saveCart();

      if (restoredGiftRewards.length && typeof window.applyCheckoutBenefitGiftRestoredLocally === "function") {
        let appliedAtLeastOnce = false;
        restoredGiftRewards.forEach(({ rewardId, giftCard }) => {
          try {
            const applied = window.applyCheckoutBenefitGiftRestoredLocally({
              rewardId,
              giftCard,
              sourcePreviewRequest: benefitsSourcePreviewRequest,
              reopenHost: false,
            });
            appliedAtLeastOnce = appliedAtLeastOnce || applied === true;
          } catch {}
        });
        if (!appliedAtLeastOnce && typeof window.handleShopBenefitsOrderStateChange === "function") {
          window.handleShopBenefitsOrderStateChange("clearCartAll.giftRestoreFallback");
        }
      } else if (restoredGiftRewards.length && typeof window.handleShopBenefitsOrderStateChange === "function") {
        window.handleShopBenefitsOrderStateChange("clearCartAll.giftRestoreFallback");
      }

      scheduleSyncAllProductCardsFromCart();
      prioritizeAboveFoldCardImages();
      renderCart();
      updateCartBadge();

      if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
        const { items } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        if (openCartSheetCtx.checkoutBtn) openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        appendUpsellToList(openCartSheetCtx.listEl);
      }

      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (isMobile && elMobileCartActions) {
        if (elMobileCartActionsCart) elMobileCartActionsCart.classList.add("hidden");
        if (elMobileCartActionsCheckout) elMobileCartActionsCheckout.classList.add("hidden");
        updateMobileDeliveryProgress();
      }
      queueMobileUiStateSync("clearCartAll");
      return true;
    } finally {
      clearCartAllBusy = false;
    }
  }

  const twoStepClearRegistry = new Set();
  let twoStepClearDocumentBound = false;

  function ensureTwoStepClearDocumentBinding() {
    if (twoStepClearDocumentBound) return;
    twoStepClearDocumentBound = true;
    document.addEventListener("click", (event) => {
      twoStepClearRegistry.forEach((entry) => {
        if (!entry?.btn || !entry.btn.isConnected) {
          twoStepClearRegistry.delete(entry);
          return;
        }
        if (!entry.isArmed()) return;
        if (entry.btn.contains(event.target)) return;
        entry.reset();
      });
    });
  }

  function attachTwoStepClear(btn, onConfirm, options = {}) {
    if (!btn) return;
    let armed = false;
    let timer = null;
    const mobileCheckoutLabel = "\u041E\u0444\u043E\u0440\u043C\u0438\u0442\u044C";
    const compactCheckout = options.compactCheckout !== false;
    const defaultText = Object.prototype.hasOwnProperty.call(options, "defaultText")
      ? String(options.defaultText ?? "")
      : "×";
    const defaultHtml = options.defaultHtml != null ? String(options.defaultHtml) : null;
    const confirmText = String(options.confirmText || "Очистить корзину");

    const renderDefaultState = () => {
      if (defaultHtml != null) {
        btn.innerHTML = defaultHtml;
      } else {
        btn.textContent = defaultText;
      }
    };

    const setMobileCheckoutCompact = (compact) => {
      if (!compactCheckout) return;
      if (!elMobileCheckoutBtn || !elMobileCartTotal) return;
      if (compact) {
        elMobileCheckoutBtn.dataset.compactSumOnly = "1";
        elMobileCheckoutBtn.textContent = "";
        elMobileCheckoutBtn.appendChild(elMobileCartTotal);
        return;
      }
      if (elMobileCheckoutBtn.dataset.compactSumOnly !== "1") return;
      delete elMobileCheckoutBtn.dataset.compactSumOnly;
      elMobileCheckoutBtn.textContent = `${mobileCheckoutLabel} \u00B7 `;
      elMobileCheckoutBtn.appendChild(elMobileCartTotal);
    };

    const reset = () => {
      armed = false;
      btn.classList.remove("is-confirm");
      renderDefaultState();
      btn.title = "Очистить корзину";
      btn.setAttribute("aria-label", "Очистить корзину");
      if (timer) clearTimeout(timer);
      timer = null;
      setMobileCheckoutCompact(false);
    };

    const arm = () => {
      armed = true;
      btn.classList.add("is-confirm");
      btn.textContent = confirmText;
      btn.title = confirmText;
      btn.setAttribute("aria-label", confirmText);
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 6500);
      setMobileCheckoutCompact(true);
    };

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (cartCountTotal() <= 0) return;
      if (!armed) {
        arm();
        return;
      }
      reset();
      onConfirm();
    });

    if (btn.__twoStepClearEntry) {
      twoStepClearRegistry.delete(btn.__twoStepClearEntry);
    }
    const entry = {
      btn,
      isArmed: () => armed,
      reset,
    };
    btn.__twoStepClearEntry = entry;
    twoStepClearRegistry.add(entry);
    ensureTwoStepClearDocumentBinding();
    reset();
  }

  let __syncAllCardsTimer = null;
  function syncAllProductCardsFromCart() {
    if (!elProductsGrid) return;
    const cards = elProductsGrid.querySelectorAll(".sp-card[data-product-id]");
    cards.forEach((card) => {
      const pid = Number(card.getAttribute("data-product-id"));
      if (!Number.isFinite(pid)) return;
      const p = state.productCache.get(pid);
      if (!p) return;
      applyCardState(card, p, cartQty(pid));
    });
  }

  function scheduleSyncAllProductCardsFromCart() {
    if (__syncAllCardsTimer) return;
    __syncAllCardsTimer = setTimeout(() => {
      __syncAllCardsTimer = null;
      syncAllProductCardsFromCart();
    }, 0);
  }

  function buildCartKeySignature(cartItems = state.cart) {
    const list = Array.isArray(cartItems) ? cartItems : [];
    return list
      .map((item) => String(item?.key || ""))
      .filter(Boolean)
      .sort()
      .join("|");
  }

  function buildCartProductIdsSignature(cartItems = state.cart) {
    const ids = new Set();
    const list = Array.isArray(cartItems) ? cartItems : [];
    list.forEach((item) => {
      const qty = Math.max(0, Number(item?.qty || 0));
      if (!qty) return;
      const pid = Number(item?.product_id || item?.id || 0);
      if (Number.isFinite(pid) && pid > 0) ids.add(pid);
    });
    return Array.from(ids).sort((a, b) => a - b).join(",");
  }

  function getImmediateShopCartPricingSnapshot() {
    if (typeof window.getShopCartPricingSnapshot !== "function") return null;
    try {
      const snapshot = window.getShopCartPricingSnapshot();
      return snapshot && typeof snapshot === "object" ? snapshot : null;
    } catch {
      return null;
    }
  }

  function getImmediateShopCartLineState(cartKey, snapshot = null) {
    const normalizedKey = String(cartKey || "").trim();
    if (!normalizedKey) return null;
    const effectiveSnapshot = snapshot && typeof snapshot === "object"
      ? snapshot
      : getImmediateShopCartPricingSnapshot();
    const lineStates = Array.isArray(effectiveSnapshot?.lineStates)
      ? effectiveSnapshot.lineStates
      : [];
    return lineStates.find((entry) => String(entry?.key || "").trim() === normalizedKey) || null;
  }

  function syncImmediateCartPricingUi(reason = "") {
    const normalizedReason = String(reason || "").trim() || "cart.fastUpdate";
    if (typeof window.queueShopCartPricingSummaryUi === "function") {
      window.queueShopCartPricingSummaryUi(normalizedReason);
    } else if (typeof window.syncShopCartPricingSummaryUi === "function") {
      Promise.resolve(window.syncShopCartPricingSummaryUi({ reason: normalizedReason })).catch(() => {});
    } else if (typeof updateMobileDeliveryProgress === "function") {
      updateMobileDeliveryProgress();
    }
    if (typeof window.handleShopBenefitsOrderStateChange === "function") {
      window.handleShopBenefitsOrderStateChange(normalizedReason);
    }
  }

  function updateCartTotalsUiOnly() {
    const items = cartItemsResolved();
    const totals = computeCartTotals(items);
    const pricingSnapshot = getImmediateShopCartPricingSnapshot();
    const total = pricingSnapshot && pricingSnapshot.visible !== false
      ? roundPrice(Number(pricingSnapshot.total || 0))
      : Number(totals.total || 0);
    if (elCartTotal) elCartTotal.textContent = money(total);

    syncCartFooterVisibilityForCartMode(items.length);
    if (elCheckoutBtn) {
      elCheckoutBtn.disabled = items.length === 0;
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(total);
    }

    if (openCartSheetCtx) {
      if (openCartSheetCtx.footerEl) {
        openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      }
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      if (openCartSheetCtx.totalEl) {
        openCartSheetCtx.totalEl.textContent = money(total);
      }
    }

    syncImmediateCartPricingUi("updateCartTotalsUiOnly");
    return { items, total };
  }

  function extractRenderedCartNodeKey(node) {
    if (!node || node.nodeType !== 1) return "";
    const direct = String(node.getAttribute("data-cart-key") || "");
    return direct;
  }

  function captureRenderedCartRowsByKey(listEl) {
    const rowsByKey = new Map();
    if (!listEl) return rowsByKey;
    const nodes = listEl.querySelectorAll(".cart-swipe-container[data-cart-key], .cart-row[data-cart-key]");
    nodes.forEach((node) => {
      const key = extractRenderedCartNodeKey(node);
      if (!key || rowsByKey.has(key)) return;
      rowsByKey.set(key, node);
    });
    return rowsByKey;
  }

  function renderCartIntoWithRowReuse(listEl, totalEl, emptyPlaceholderEl, reuseRowsByKey, reuseUpsellNode = null, skipReuseKeys = null) {
    if (!listEl) return renderCartInto(listEl, totalEl, emptyPlaceholderEl);
    const tempList = document.createElement("div");
    const tempTotal = document.createElement("span");
    const rendered = renderCartInto(tempList, tempTotal, null, { bindInteractive: false });
    const reusable = reuseRowsByKey instanceof Map ? reuseRowsByKey : new Map();
    const skipReuseSet = skipReuseKeys instanceof Set
      ? skipReuseKeys
      : new Set(Array.isArray(skipReuseKeys) ? skipReuseKeys.map((entry) => String(entry || "").trim()).filter(Boolean) : []);

    const nextNodes = Array.from(tempList.children);
    const fragment = document.createDocumentFragment();
    nextNodes.forEach((nextNode) => {
      const key = extractRenderedCartNodeKey(nextNode);
      const canReuse = key && !skipReuseSet.has(key);
      const reusedNode = canReuse ? reusable.get(key) : null;
      if (reusedNode) {
        reusable.delete(key);
        fragment.appendChild(reusedNode);
      } else {
        fragment.appendChild(nextNode);
      }
    });

    const keepUpsellInPlace =
      reuseUpsellNode &&
      reuseUpsellNode.nodeType === 1 &&
      reuseUpsellNode.parentNode === listEl;
    if (keepUpsellInPlace) {
      const currentChildren = Array.from(listEl.children);
      currentChildren.forEach((child) => {
        if (child === reuseUpsellNode) return;
        child.remove();
      });
      listEl.insertBefore(fragment, reuseUpsellNode);
      if (reuseUpsellNode !== listEl.lastElementChild) {
        listEl.appendChild(reuseUpsellNode);
      }
    } else {
      listEl.innerHTML = "";
      listEl.appendChild(fragment);
      if (reuseUpsellNode && reuseUpsellNode.nodeType === 1) {
        listEl.appendChild(reuseUpsellNode);
      }
    }

    if (totalEl) totalEl.textContent = money(rendered.total);
    if (emptyPlaceholderEl) emptyPlaceholderEl.classList.toggle("hidden", rendered.items.length > 0);
    bindCartItemsSectionControls(listEl);
    bindCartModeHeaderSticky(listEl);
    bindCartBonusRedeemSection(listEl);
    return rendered;
  }

  function captureUpsellScrollState(listEl) {
    if (!listEl) return null;
    const scrollEl = listEl.querySelector(".shop-cart-upsell-scroll");
    if (!scrollEl) return null;
    return {
      left: Number(scrollEl.scrollLeft || 0),
      max: Math.max(0, Number(scrollEl.scrollWidth || 0) - Number(scrollEl.clientWidth || 0)),
    };
  }

  function restoreUpsellScrollState(listEl, state) {
    if (!listEl || !state) return;
    const scrollEl = listEl.querySelector(".shop-cart-upsell-scroll");
    if (!scrollEl) return;
    const currentMax = Math.max(0, Number(scrollEl.scrollWidth || 0) - Number(scrollEl.clientWidth || 0));
    const safeLeft = Math.min(Math.max(0, Number(state.left || 0)), currentMax);
    scrollEl.scrollLeft = safeLeft;
  }

  function refreshCartUiAfterMutation({
    reason = "cart.fastMutation",
    forceFull = false,
    changedCartKeys = null,
  } = {}) {
    if (!elCartList || forceFull) {
      renderCart(true);
      updateCartBadge();
      if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
        const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          if (tspan) tspan.textContent = money(total);
        }
        appendUpsellToList(openCartSheetCtx.listEl);
      }
      return;
    }

    const skipReuseSet = changedCartKeys instanceof Set
      ? changedCartKeys
      : new Set(Array.isArray(changedCartKeys) ? changedCartKeys.map((entry) => String(entry || "").trim()).filter(Boolean) : []);

    const mainUpsellBlockBefore = elCartList.querySelector(".shop-cart-upsell") || null;
    const mainUpsellScrollBefore = captureUpsellScrollState(elCartList);
    const mainRowsBefore = captureRenderedCartRowsByKey(elCartList);

    const sheetListEl = openCartSheetCtx?.listEl || null;
    const isSameListAsMain = !!sheetListEl && sheetListEl === elCartList;
    const sheetUpsellBlockBefore = !isSameListAsMain && sheetListEl
      ? sheetListEl.querySelector(".shop-cart-upsell")
      : null;
    const sheetUpsellScrollBefore = !isSameListAsMain && sheetListEl
      ? captureUpsellScrollState(sheetListEl)
      : null;
    const sheetRowsBefore = !isSameListAsMain && sheetListEl
      ? captureRenderedCartRowsByKey(sheetListEl)
      : new Map();

    const mainRendered = renderCartIntoWithRowReuse(
      elCartList,
      elCartTotal,
      elCartEmpty,
      mainRowsBefore,
      mainUpsellBlockBefore,
      skipReuseSet
    );
    syncCartFooterVisibilityForCartMode(mainRendered.items.length);
    if (elCheckoutBtn) {
      elCheckoutBtn.disabled = mainRendered.items.length === 0;
      const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
      if (totalSpan) totalSpan.textContent = money(mainRendered.total);
    }
    appendUpsellToList(elCartList);
    restoreUpsellScrollState(elCartList, mainUpsellScrollBefore);
    cartUiRenderedRevision = cartUiRevision;

    if (sheetListEl && openCartSheetCtx?.totalEl) {
      const sheetRendered = isSameListAsMain
        ? mainRendered
        : renderCartIntoWithRowReuse(
          sheetListEl,
          openCartSheetCtx.totalEl,
          null,
          sheetRowsBefore,
          sheetUpsellBlockBefore,
          skipReuseSet
        );
      if (openCartSheetCtx.footerEl) {
        openCartSheetCtx.footerEl.classList.toggle("hidden", sheetRendered.items.length === 0);
      }
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = sheetRendered.items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(sheetRendered.total);
      }
      appendUpsellToList(sheetListEl);
      if (isSameListAsMain) {
        restoreUpsellScrollState(sheetListEl, mainUpsellScrollBefore);
      } else {
        restoreUpsellScrollState(sheetListEl, sheetUpsellScrollBefore);
      }
    }

    updateCartTotalsUiOnly();
    if (typeof window.refreshShopCartPricingLocalUi === "function") {
      window.refreshShopCartPricingLocalUi();
    }
    updateCartBadge();
    queueMobileUiStateSync(reason || "cart.fastMutation");
  }
  if (typeof window !== "undefined") {
    window.refreshCartUiAfterMutation = refreshCartUiAfterMutation;
  }

  // -----------------------------
  // Qty change
  // -----------------------------
  async function changeQty(productId, delta, optionalCartNumEl, cartKey, opts = {}) {
    const pid = Number(productId);
    const qtyDelta = Number(delta);
    if (!Number.isFinite(pid) || !Number.isFinite(qtyDelta) || qtyDelta === 0) return Number(cartQty(pid) || 0);

    const skipCartRerender = opts?.skipCartRerender !== false;
    const cartProductsBefore = buildCartProductIdsSignature(state.cart);

    const wasEmpty = cartCountTotal() === 0;
    const p = state.productCache.get(pid);
    if (qtyDelta > 0 && p && !isProductAvailable(p)) return Number(cartQty(pid) || 0);

    const targetKey = resolveCartKeyForQtyChange(pid, qtyDelta, cartKey, state.cart);
    if (!targetKey) return Number(cartQty(pid) || 0);

    if (qtyDelta > 0) {
      const gate = canIncreaseRegularCartItemBeforeApply(pid, qtyDelta, targetKey);
      if (!gate.allowed) {
        const limitChanged = setCartQtyHardLimit(targetKey, Math.max(0, Number(gate.currentQty || 0)));
        if (limitChanged) refreshQtyLimitUi();
        return Number(gate.currentQty || cartQty(pid) || 0);
      }
      clearCartQtyHardLimit(targetKey);
    } else if (qtyDelta < 0) {
      clearCartQtyHardLimit(targetKey);
    }

    const previousCartSnapshot = qtyDelta > 0 ? cloneCartState(state.cart) : null;
    let item = getCartItemByKey(targetKey);
    let nextQty = 0;

    if (!item && qtyDelta > 0) {
      item = {
        key: targetKey,
        product_id: pid,
        qty: 0,
        option_item_ids: [],
        option_items: [],
        auto_add: 0,
        auto_add_group_id: null,
      };
      state.cart.push(item);
      if (wasEmpty) {
        clearAllAutoAddDismissed();
      }
    }

    if (item) {
      const prevQty = Number(item.qty || 0);
      nextQty = Math.max(0, prevQty + qtyDelta);
      item.qty = nextQty;
      if (nextQty <= 0) {
        clearCartQtyHardLimit(targetKey);
        if (Number(item.auto_add || 0) !== 1) {
          state.cart = state.cart.filter((x) => x.key !== targetKey);
        }
      }
    }

    const autoChanged = applyAutoAddRules();
    if (autoChanged) {
      nextQty = Number(getCartItemByKey(targetKey)?.qty || 0);
      scheduleSyncAllProductCardsFromCart();
    }
    const cartProductsAfter = buildCartProductIdsSignature(state.cart);
    const cartProductsChanged = cartProductsBefore !== cartProductsAfter;
    const limitsCleaned = cleanupCartQtyHardLimits();
    clearAutoAddDismissedIfCartEmpty();
    const currentItem = getCartItemByKey(targetKey);
    if (currentItem && Number(currentItem.qty || 0) > 0 && Number(currentItem.auto_add || 0) === 1) {
      clearAutoAddDismissedByProduct(pid);
    }
    saveCart();
    scheduleSyncAllProductCardsFromCart();

    const cards = elProductsGrid.querySelectorAll(`.sp-card[data-product-id="${pid}"]`);
    if (cards.length && p) {
      cards.forEach((card) => applyCardState(card, p, cartQty(pid), qtyDelta > 0 ? "inc" : "dec"));
    }

    if (optionalCartNumEl) animateNumber(optionalCartNumEl, nextQty || 0, qtyDelta > 0 ? "inc" : "dec");

    const shouldFullRerender = !skipCartRerender || autoChanged;
    if (shouldFullRerender) {
      renderCart();
    } else {
      if (typeof refreshCartUiAfterMutation === "function") {
        refreshCartUiAfterMutation({
          reason: "changeQty.light",
          changedCartKeys: [targetKey],
        });
      } else {
        updateCartTotalsUiOnly();
        if (cartProductsChanged) {
          appendUpsellToList(elCartList);
          if (openCartSheetCtx?.listEl && openCartSheetCtx.listEl !== elCartList) {
            appendUpsellToList(openCartSheetCtx.listEl);
          }
        }
        updateCartBadge();
      }
    }
    if (shouldFullRerender) {
      updateCartBadge();
    }

    if (shouldFullRerender && openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      appendUpsellToList(openCartSheetCtx.listEl);
      if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();
    }

    if (qtyDelta > 0) {
      const currentQtyForKey = Number(getCartItemByKey(targetKey)?.qty || 0);
      if (currentQtyForKey > 0) {
        refreshNextRegularCartItemLimitLocal(pid, targetKey, currentQtyForKey);
      } else {
        clearCartQtyHardLimit(targetKey);
      }
    } else if (qtyDelta < 0) {
      clearCartQtyHardLimit(targetKey);
    }

    if (qtyDelta > 0 && previousCartSnapshot) {
      queueCartStockRecheck(previousCartSnapshot, {
        toastMessage: "Больше нет в наличии",
      });
    }

    if (limitsCleaned) scheduleSyncAllProductCardsFromCart();
    return Number(nextQty || 0);
  }

  // -----------------------------
  // Category select + lazy load
  // -----------------------------
  const __loadingCategoryIds = new Set();
  const __categoryLoadLimit = new Map();

  async function ensureCategoryLoaded(categoryId, opts = {}) {
    const cid = Number(categoryId);
    if (!Number.isFinite(cid)) return [];
    if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();

    const limitRaw = Number(opts.limit);
    const desired = (Number.isFinite(limitRaw) && limitRaw > 0) ? Math.min(200, Math.max(1, limitRaw)) : 0;

    const existing = state.productsByCategory.get(cid);
    const loadedLimit = Number(__categoryLoadLimit.get(cid) || 0) || 0;
    if (existing && (!desired || loadedLimit >= desired)) return existing;
    if (__loadingCategoryIds.has(cid)) return existing || [];

    const reqLimit = desired || Math.max(loadedLimit || 0, 24) || 24;
    __loadingCategoryIds.add(cid);
    __categoryLoadLimit.set(cid, reqLimit);
    try {
      await loadProductsForCategory(cid, { limit: reqLimit, lite: true });
      renderProducts({ appendOnly: true });
      prioritizeAboveFoldCardImages();
      void warmInitialCatalogInteractionData({
        categoryIds: [cid],
        productLimit: INITIAL_CATALOG_PREFETCH_PRODUCTS,
        comboLimit: INITIAL_CATALOG_PREFETCH_COMBOS,
      });
      return state.productsByCategory.get(cid) || [];
    } finally {
      __loadingCategoryIds.delete(cid);
    }
  }

  async function selectCategory(categoryId, title) {
    setActiveCategory(categoryId, title, { scroll: true });
    // Don't block click -> scroll; load in background.
    ensureCategoryLoaded(categoryId, { limit: 200 });
    await warmupCartProducts();
    renderCart();
  }

  function mapToPlainObject(sourceMap) {
    const out = {};
    if (!(sourceMap instanceof Map)) return out;
    sourceMap.forEach((value, key) => {
      const id = Number(key);
      if (!Number.isFinite(id)) return;
      out[String(id)] = value;
    });
    return out;
  }

  function saveCatalogSnapshotFromState() {
    try {
      const payload = {
        v: CATALOG_SNAPSHOT_VERSION,
        ts: Date.now(),
        activeCategoryId: Number(state.activeCategoryId || 0) || null,
        categories: Array.isArray(state.categories) ? state.categories : [],
        productsByCategory: mapToPlainObject(state.productsByCategory),
        combosByCategory: mapToPlainObject(state.combosByCategory),
      };
      localStorage.setItem(CATALOG_SNAPSHOT_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadCatalogSnapshotFromStorage() {
    try {
      const raw = localStorage.getItem(CATALOG_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (Number(parsed.v) !== Number(CATALOG_SNAPSHOT_VERSION)) return null;
      const ts = Number(parsed.ts || 0);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      if (Date.now() - ts > CATALOG_SNAPSHOT_MAX_AGE_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function applyCatalogSnapshot(snapshot) {
    const categories = Array.isArray(snapshot?.categories) ? snapshot.categories : [];
    if (!categories.length) return false;

    state.categories = categories;
    state.productsByCategory = new Map();
    state.combosByCategory = new Map();

    const productsByCategory = snapshot?.productsByCategory && typeof snapshot.productsByCategory === "object"
      ? snapshot.productsByCategory
      : {};
    Object.keys(productsByCategory).forEach((rawKey) => {
      const cid = Number(rawKey);
      if (!Number.isFinite(cid)) return;
      const listRaw = Array.isArray(productsByCategory[rawKey]) ? productsByCategory[rawKey] : [];
      const list = listRaw
        .filter((p) => p && typeof p === "object")
        .map((p) => {
          const row = { ...p };
          if (!Array.isArray(row.photos)) row.photos = safePhotos(row);
          return row;
        });
      list.forEach((p) => {
        const pid = Number(p.id || 0);
        if (!Number.isFinite(pid) || pid <= 0) return;
        cacheStockFromProductPayload(p, "snapshot_restore");
        p.is_available = isProductAvailable(p);
        state.productCache.set(pid, p);
      });
      state.productsByCategory.set(cid, list);
    });

    const combosByCategory = snapshot?.combosByCategory && typeof snapshot.combosByCategory === "object"
      ? snapshot.combosByCategory
      : {};
    Object.keys(combosByCategory).forEach((rawKey) => {
      const cid = Number(rawKey);
      if (!Number.isFinite(cid)) return;
      state.combosByCategory.set(cid, Array.isArray(combosByCategory[rawKey]) ? combosByCategory[rawKey] : []);
    });

    const visible = getVisibleCategories();
    const wantedId = Number(snapshot?.activeCategoryId || 0);
    const active = visible.find((c) => Number(c.id) === wantedId) || visible[0] || null;
    if (active) {
      setActiveCategory(active.id, active.title, { scroll: false });
    } else {
      state.activeCategoryId = null;
      state.activeCategoryTitle = "\u041a\u0430\u0442\u0430\u043b\u043e\u0433";
      if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
    }

    renderCategories();
    renderCategoryChips();
    renderProducts();
    updateCartBadge();
    return true;
  }

  function restoreCatalogSnapshotForFastPaint() {
    const snapshot = loadCatalogSnapshotFromStorage();
    if (!snapshot) return false;
    return applyCatalogSnapshot(snapshot);
  }

  async function loadCategories() {
    const json = await apiJson("/api/public/categories");
    state.categories = Array.isArray(json.data) ? json.data : [];
  }

  let shopBootstrapPromise = null;

  function applyShopBootstrapData(data) {
    if (!data || typeof data !== "object") return null;
    if (Array.isArray(data.categories)) {
      state.categories = data.categories;
    }
    if (data.orderConfig && typeof data.orderConfig === "object") {
      setShopOrderConfigSnapshot(data.orderConfig, { persistRounding: true });
    }
    if (Array.isArray(data.unitConversions)) {
      state.unitConversions = data.unitConversions;
    }
    return data;
  }

  async function loadShopBootstrap() {
    if (shopBootstrapPromise) return shopBootstrapPromise;
    shopBootstrapPromise = apiJson("/api/public/shop/bootstrap")
      .then((json) => applyShopBootstrapData(json?.data || null))
      .finally(() => {
        shopBootstrapPromise = null;
      });
    return shopBootstrapPromise;
  }

  async function loadAutoAdd() {
    if (autoAddLoaded) return;
    if (autoAddLoadPromise) return autoAddLoadPromise;
    autoAddLoadPromise = (async () => {
    try {
      const json = await apiJson("/api/public/auto-add");
      const groups = Array.isArray(json.data?.groups) ? json.data.groups : [];
      const items = Array.isArray(json.data?.items) ? json.data.items : [];
      state.autoAdd.groups = groups;
      state.autoAdd.items = items;
      state.autoAdd.byGroupId = new Map(
        groups
          .map((g) => [Number(g.id), g])
          .filter(([gid]) => Number.isFinite(gid))
      );
      state.autoAdd.byProductId = new Map(
        items
          .map((it) => [Number(it.product_id), it])
          .filter(([pid]) => Number.isFinite(pid))
      );

      items.forEach((it) => {
        if (!it.group && Number.isFinite(Number(it.group_id))) {
          it.group = state.autoAdd.byGroupId.get(Number(it.group_id)) || null;
        }
        const p = it.product;
        if (!p) return;
        const mergedProduct = mergeProductIntoCache(p, "auto_add_product");
        if (mergedProduct) {
          it.product = mergedProduct;
        }
      });
      autoAddLoaded = true;
    } catch (e) {
      console.warn("Failed to load auto-add rules", e);
      state.autoAdd.groups = [];
      state.autoAdd.items = [];
      state.autoAdd.byProductId = new Map();
      state.autoAdd.byGroupId = new Map();
      autoAddLoaded = false;
    } finally {
      autoAddLoadPromise = null;
    }
    })();
    return autoAddLoadPromise;
  }

  async function loadUpsellProducts() {
    if (upsellLoaded) return;
    if (upsellLoadPromise) return upsellLoadPromise;
    upsellLoadPromise = (async () => {
    try {
      const json = await apiJson(`/api/public/cart-upsell`);
      state.upsellProducts = Array.isArray(json.data) ? json.data : [];
      const productsById = new Map();
      state.upsellProducts.forEach((product) => {
        if (!product || typeof product !== "object") return;
        const pid = Number(product.id || 0);
        if (!Number.isFinite(pid) || pid <= 0) return;
        const mergedProduct = mergeProductIntoCache(product, "cart_upsell_product") || product;
        productsById.set(pid, mergedProduct);
      });
      if (productsById.size) {
        void warmUpsellDefaultConfigBatch(Array.from(productsById.keys()), productsById).catch(() => {});
      }
      upsellLoaded = true;
    } catch (e) {
      console.warn("Failed to load upsell products", e);
      state.upsellProducts = [];
      upsellLoaded = false;
    } finally {
      upsellLoadPromise = null;
      }
    })();
    return upsellLoadPromise;
  }

  function buildImmediateUpsellDefaults(product, cacheEntry = null) {
    const cachedData = cacheEntry && cacheEntry.data && typeof cacheEntry.data === "object"
      ? cacheEntry.data
      : null;
    const defaultVariant = product?.default_variant && typeof product.default_variant === "object"
      ? product.default_variant
      : null;
    const baseUnitPrice = Number(
      cachedData?.variant_unit_price
      ?? defaultVariant?.variant_unit_price
      ?? product?.display_price
      ?? product?.price
      ?? 0
    );
    return {
      option_item_ids: Array.isArray(cachedData?.option_item_ids) ? cachedData.option_item_ids : [],
      option_items: Array.isArray(cachedData?.option_items) ? cachedData.option_items : [],
      ingredients: Array.isArray(cachedData?.ingredients) ? cachedData.ingredients : [],
      ingredient_price_diff: Number(cachedData?.ingredient_price_diff || 0),
      variant_group_id: cachedData?.variant_group_id != null
        ? Number(cachedData.variant_group_id)
        : toFiniteNumberOrNull(defaultVariant?.variant_group_id),
      variant_value_index: cachedData?.variant_value_index != null
        ? Number(cachedData.variant_value_index)
        : toFiniteNumberOrNull(defaultVariant?.variant_value_index),
      variant_label: str(cachedData?.variant_label || defaultVariant?.variant_label || ""),
      variant_unit_price: Number.isFinite(baseUnitPrice) ? baseUnitPrice : 0,
    };
  }

  function hasCompleteUpsellVariantDefaults(defaults) {
    if (!defaults || typeof defaults !== "object") return false;
    const groupId = Number(defaults.variant_group_id);
    const valueIndex = Number(defaults.variant_value_index);
    const label = str(defaults.variant_label || "").trim();
    const unitPrice = Number(defaults.variant_unit_price || 0);
    return Number.isFinite(groupId)
      && Number.isFinite(valueIndex)
      && !!label
      && unitPrice > 0;
  }

  function shouldLoadFullUpsellDefaultsBeforeAdd(product, cacheEntry, defaults) {
    if (cacheEntry?.data) return false;
    const defaultVariant = product?.default_variant && typeof product.default_variant === "object"
      ? product.default_variant
      : null;
    return !!defaultVariant && !hasCompleteUpsellVariantDefaults(defaults);
  }

  async function loadCartEnhancersData() {
    if (cartEnhancersDataLoadPromise) return cartEnhancersDataLoadPromise;
    cartEnhancersDataLoadPromise = (async () => {
      await Promise.allSettled([loadAutoAdd(), loadUpsellProducts()]);
    })().finally(() => {
      cartEnhancersDataLoadPromise = null;
    });
    return cartEnhancersDataLoadPromise;
  }

  function getCartEnhancersRefreshSignature() {
    const cartSig = Array.isArray(state.cart)
      ? state.cart
        .map((item) => [
          String(item?.key || ""),
          String(item?.type || ""),
          Number(item?.product_id || item?.id || 0),
          Number(item?.qty || 0),
          Number(item?.auto_add || 0),
          Number(item?.auto_add_group_id || 0),
        ].join(":"))
        .join("|")
      : "";
    const dismissedSig = state.autoAddDismissed instanceof Set
      ? Array.from(state.autoAddDismissed).sort().join("|")
      : "";
    const autoAddSig = autoAddLoaded
      ? [
        (state.autoAdd?.groups || []).map((group) => Number(group?.id || 0)).join(","),
        (state.autoAdd?.items || []).map((item) => Number(item?.product_id || item?.id || 0)).join(","),
      ].join("::")
      : "pending";
    const upsellSig = upsellLoaded
      ? (state.upsellProducts || []).map((product) => Number(product?.id || 0)).join(",")
      : "pending";
    return [cartSig, dismissedSig, autoAddSig, upsellSig].join("|||");
  }

  async function refreshCartAfterEnhancersLoaded(opts = {}) {
    if (cartEnhancersRefreshPromise) return cartEnhancersRefreshPromise;
    const force = !!opts.force;
    const beforeSignature = getCartEnhancersRefreshSignature();
    if (!force && beforeSignature === cartEnhancersLastRefreshSignature) return false;

    cartEnhancersRefreshPromise = (async () => {
      const autoChanged = applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      if (autoChanged) {
        saveCart();
        scheduleSyncAllProductCardsFromCart();
      }

      await warmupCartProducts();
      renderCart(true);
      updateCartBadge();

      if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
        const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          if (tspan) tspan.textContent = money(total);
        }
        appendUpsellToList(openCartSheetCtx.listEl);
      }
      if (window.matchMedia("(max-width: 768px)").matches) updateMobileDeliveryProgress();

      cartEnhancersLastRefreshSignature = getCartEnhancersRefreshSignature();
      return autoChanged;
    })().finally(() => {
      cartEnhancersRefreshPromise = null;
    });

    return cartEnhancersRefreshPromise;
  }

  function getUpsellDefaultConfigCacheEntry(productId) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    return upsellDefaultConfigCache.get(pid) || null;
  }

  function warmUpsellDefaultConfig(productId, sourceProduct) {
    const pid = Number(productId || 0);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    const cached = getUpsellDefaultConfigCacheEntry(pid);
    if (cached && cached.promise) return cached.promise;

    const promise = buildUpsellDefaultCartConfig(pid, sourceProduct)
      .then((cfg) => {
        upsellDefaultConfigCache.set(pid, { promise: Promise.resolve(cfg), data: cfg, ts: Date.now() });
        return cfg;
      })
      .catch((err) => {
        upsellDefaultConfigCache.delete(pid);
        throw err;
      });

    upsellDefaultConfigCache.set(pid, { promise, data: null, ts: Date.now() });
    return promise;
  }

  async function warmUpsellDefaultConfigBatch(productIds, productsById) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    const unresolved = ids.filter((id) => !upsellDefaultConfigCache.has(id));
    if (!unresolved.length) return;

    const byId = productsById instanceof Map ? productsById : new Map();
    const inflight = unresolved
      .map((id) => upsellDefaultConfigCache.get(id)?.promise)
      .filter(Boolean);
    const requestIds = unresolved.filter((id) => !upsellDefaultConfigCache.get(id)?.promise);
    if (!requestIds.length) {
      await Promise.allSettled(inflight);
      return;
    }

    let resolveShared;
    let rejectShared;
    const sharedPromise = new Promise((resolve, reject) => {
      resolveShared = resolve;
      rejectShared = reject;
    });
    requestIds.forEach((id) => {
      upsellDefaultConfigCache.set(id, { promise: sharedPromise, data: null, ts: Date.now() });
    });

    const resolved = new Set();

    try {
      const json = await apiJson('/api/public/products/batch/default-cart-config', {
        method: 'POST',
        body: { ids: requestIds },
      });
      const data = json?.data && typeof json.data === "object" ? json.data : {};
      requestIds.forEach((pid) => {
        const cfg = data[pid];
        if (!cfg || typeof cfg !== "object") return;
        upsellDefaultConfigCache.set(pid, { promise: Promise.resolve(cfg), data: cfg, ts: Date.now() });
        resolved.add(pid);
      });
    } catch (err) {
      requestIds.forEach((pid) => upsellDefaultConfigCache.delete(pid));
      rejectShared(err);
      await Promise.allSettled(inflight);
      return;
    }

    const fallbackIds = requestIds.filter((id) => !resolved.has(id));
    if (!fallbackIds.length) {
      resolveShared(true);
      await Promise.allSettled(inflight);
      return;
    }

    fallbackIds.forEach((pid) => upsellDefaultConfigCache.delete(pid));
    await Promise.all(fallbackIds.map(async (pid) => {
      const src = byId.get(pid) || null;
      try {
        await warmUpsellDefaultConfig(pid, src);
      } catch {}
    }));
    resolveShared(true);
    await Promise.allSettled(inflight);
  }

  function queueUpsellConfigBatch(productIds, productsById, opts = {}) {
    const ids = Array.isArray(productIds)
      ? Array.from(new Set(productIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)))
      : [];
    if (!ids.length) return;

    const unresolved = ids.filter((id) => !upsellDefaultConfigCache.has(id));
    if (!unresolved.length) return;
    unresolved.forEach((id) => upsellConfigBatchPendingIds.add(id));

    const flush = async () => {
      const batchIds = Array.from(upsellConfigBatchPendingIds).filter((id) => !upsellDefaultConfigCache.has(id));
      upsellConfigBatchPendingIds.clear();
      if (!batchIds.length) return;

      const byId = productsById instanceof Map ? productsById : new Map();
      await warmUpsellDefaultConfigBatch(batchIds, byId);
    };

    if (upsellConfigBatchTimer) clearTimeout(upsellConfigBatchTimer);
    const delayMs = Math.max(0, Number(opts.delayMs ?? 80));
    upsellConfigBatchTimer = setTimeout(() => {
      upsellConfigBatchTimer = null;
      flush().catch(() => {});
    }, delayMs);
  }

  function ensureUpsellConfigObserver(scrollEl, productsById) {
    if (!scrollEl) return;
    const byId = productsById instanceof Map ? productsById : new Map();
    if (!("IntersectionObserver" in window)) {
      const ids = Array.from(byId.keys()).slice(0, 6);
      queueUpsellConfigBatch(ids, byId, { delayMs: 0 });
      return;
    }

    if (upsellConfigObserver && upsellConfigObserverRoot !== scrollEl) {
      try { upsellConfigObserver.disconnect(); } catch {}
      upsellConfigObserver = null;
      upsellConfigObserverRoot = null;
    }

    if (!upsellConfigObserver) {
      upsellConfigObserverRoot = scrollEl;
      upsellConfigObserver = new IntersectionObserver((entries) => {
        const ids = [];
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const pid = Number(entry.target?.dataset?.productId || 0);
          if (!Number.isFinite(pid) || pid <= 0) return;
          ids.push(pid);
        });
        if (ids.length) queueUpsellConfigBatch(ids, byId, { delayMs: 60 });
      }, {
        root: scrollEl,
        rootMargin: "120px 0px",
        threshold: 0.01,
      });
    }

    const cards = scrollEl.querySelectorAll(".cart-upsell-card");
    cards.forEach((card) => {
      const pid = Number(card?.dataset?.productId || 0);
      if (!Number.isFinite(pid) || pid <= 0) return;
      if (upsellConfigObserver) upsellConfigObserver.observe(card);
    });

    const initialIds = Array.from(cards)
      .slice(0, 4)
      .map((card) => Number(card?.dataset?.productId || 0))
      .filter((id) => Number.isFinite(id) && id > 0);
    queueUpsellConfigBatch(initialIds, byId, { delayMs: 0 });
  }

  async function preloadCartEnhancers() {
    if (cartEnhancersPreloadPromise) return cartEnhancersPreloadPromise;
    cartEnhancersPreloadPromise = (async () => {
      await loadCartEnhancersData();
      await refreshCartAfterEnhancersLoaded();
    })().finally(() => {
      cartEnhancersPreloadPromise = null;
    });
    return cartEnhancersPreloadPromise;
  }

  function _createUpsellCard(p, scrollEl, upsellEl, listEl) {
    const price = p.display_price != null ? p.display_price : (p.price || 0);
    const thumb = p.thumb || (Array.isArray(p.photos) && p.photos[0]) || "";
    const buyXGetYBadgeText = getCatalogBuyXGetYBadgeText(p);
    const card = document.createElement("div");
    card.className = "cart-upsell-card";
    card.dataset.productId = String(p.id);

    // Формируем подпись с названием варианта если есть
    var descText = "";
    if (p.default_variant && p.default_variant.variant_label) {
      descText = escapeHtml(p.default_variant.variant_label);
    }

    card.innerHTML =
      '<div class="cart-upsell-photo">' +
        (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy" />' : '<div class="cart-upsell-no-photo"></div>') +
        (buyXGetYBadgeText ? '<span class="sp-card-bogo-badge cart-upsell-bogo-badge">' + escapeHtml(buyXGetYBadgeText) + '</span>' : '') +
      '</div>' +
      '<div class="cart-upsell-name">' + escapeHtml(p.name || "") + '</div>' +
      (descText ? '<div class="cart-upsell-desc">' + descText + '</div>' : '') +
      '<button class="cart-upsell-btn" type="button">' + money(price) + '</button>';
    card.addEventListener("click", function() {
      if (card.dataset.busy === "1") return;
      card.dataset.busy = "1";
      const btn = card.querySelector(".cart-upsell-btn");
      if (btn) btn.disabled = true;
      Promise.resolve(addUpsellToCart(p, listEl)).catch(() => {
        delete card.dataset.busy;
        if (btn) btn.disabled = false;
      });
    });
    return card;
  }

  function _syncUpsellVisibility(scrollEl, upsellEl) {
    var titleEl = upsellEl.querySelector(".shop-cart-upsell-title");
    var hasCards = scrollEl && scrollEl.querySelector(".cart-upsell-card");
    if (titleEl) titleEl.style.display = hasCards ? "" : "none";
    if (scrollEl) scrollEl.style.display = hasCards ? "" : "none";
  }

  function appendUpsellToList(listEl) {
    if (!listEl) return;
    var allProducts = state.upsellProducts || [];
    if (allProducts.length === 0) {
      var old = listEl.querySelector(".shop-cart-upsell");
      if (old) old.remove();
      return;
    }

    var cartProductIds = new Set(
      (state.cart || []).map(function(ci) { return Number(ci.product_id); }).filter(Boolean)
    );
    var visibleIds = new Set(
      allProducts.filter(function(p) { return !cartProductIds.has(Number(p.id)); }).map(function(p) { return Number(p.id); })
    );

    var upsellEl = listEl.querySelector(".shop-cart-upsell");
    var scrollEl;

    if (!upsellEl) {
      // Создаём блок с нуля
      upsellEl = document.createElement("div");
      upsellEl.className = "shop-cart-upsell";
      var titleEl = document.createElement("div");
      titleEl.className = "shop-cart-upsell-title";
      titleEl.textContent = "Добавить к заказу?";
      scrollEl = document.createElement("div");
      scrollEl.className = "shop-cart-upsell-scroll";
      scrollEl.addEventListener("wheel", function(e) {
        if (scrollEl.scrollWidth > scrollEl.clientWidth) {
          e.preventDefault();
          scrollEl.scrollLeft += e.deltaY;
        }
      }, { passive: false });
      upsellEl.appendChild(titleEl);
      upsellEl.appendChild(scrollEl);
      listEl.appendChild(upsellEl);
    } else {
      scrollEl = upsellEl.querySelector(".shop-cart-upsell-scroll");
      if (!scrollEl) {
        scrollEl = document.createElement("div");
        scrollEl.className = "shop-cart-upsell-scroll";
        upsellEl.appendChild(scrollEl);
      }
      // Убеждаемся что блок в конце listEl
      if (upsellEl.parentNode === listEl && upsellEl !== listEl.lastElementChild) {
        listEl.appendChild(upsellEl);
      }
    }

    // Синхронизируем карточки: убираем лишние, добавляем недостающие
    var existingCards = scrollEl.querySelectorAll(".cart-upsell-card");
    var presentIds = new Set();
    existingCards.forEach(function(card) {
      var pid = Number(card.dataset.productId);
      if (!visibleIds.has(pid)) {
        card.remove();
      } else {
        presentIds.add(pid);
      }
    });

    // Добавляем недостающие карточки
    allProducts.forEach(function(p) {
      var pid = Number(p.id);
      if (visibleIds.has(pid) && !presentIds.has(pid)) {
        scrollEl.appendChild(_createUpsellCard(p, scrollEl, upsellEl, listEl));
      }
    });

    _syncUpsellVisibility(scrollEl, upsellEl);
    const visibleProducts = allProducts.filter((p) => visibleIds.has(Number(p.id)));
    const productsById = new Map(visibleProducts.map((p) => [Number(p.id), p]));
    ensureUpsellConfigObserver(scrollEl, productsById);
  }

    function formatUpsellVariantValueLabel(value, unitShortTitle) {
    const rawValue = str(value || "").trim();
    const unit = str(unitShortTitle || "").trim();
    if (!rawValue) return "";
    if (!unit) return rawValue;
    const hasLetters = /[a-zа-я]/i.test(rawValue);
    return hasLetters ? rawValue : `${rawValue} ${unit}`;
  }

  async function buildUpsellDefaultCartConfig(pid, sourceProduct) {
    const productId = Number(pid || 0);
    if (!Number.isFinite(productId) || productId <= 0) {
      return {
        option_item_ids: [],
        option_items: [],
        ingredients: [],
        ingredient_price_diff: 0,
        variant_group_id: null,
        variant_value_index: null,
        variant_label: "",
        variant_unit_price: 0,
      };
    }

    let product = state.productCache.get(productId) || null;
    if (!product) {
      try {
        const productJson = await apiJson(`/api/public/products/${productId}`);
        product = productJson?.data || null;
      } catch {}
    }
    if (!product && sourceProduct && typeof sourceProduct === "object") {
      product = sourceProduct;
    }
    if (!product) {
      return {
        option_item_ids: [],
        option_items: [],
        ingredients: [],
        ingredient_price_diff: 0,
        variant_group_id: null,
        variant_value_index: null,
        variant_label: "",
        variant_unit_price: 0,
      };
    }

    try {
      const json = await apiJson('/api/public/products/batch/default-cart-config', {
        method: 'POST',
        body: { ids: [productId] },
      });
      const cfg = json?.data?.[productId];
      if (cfg && typeof cfg === "object") {
        return {
          option_item_ids: Array.isArray(cfg.option_item_ids) ? cfg.option_item_ids : [],
          option_items: Array.isArray(cfg.option_items) ? cfg.option_items : [],
          ingredients: Array.isArray(cfg.ingredients) ? cfg.ingredients : [],
          ingredient_price_diff: Number(cfg.ingredient_price_diff || 0),
          variant_group_id: cfg.variant_group_id != null ? Number(cfg.variant_group_id) : null,
          variant_value_index: cfg.variant_value_index != null ? Number(cfg.variant_value_index) : null,
          variant_label: str(cfg.variant_label || ""),
          variant_unit_price: Number(cfg.variant_unit_price || 0),
        };
      }
    } catch {}

    let variants = [];
    let optionAssignments = [];
    let ingredientsRaw = [];
    const [variantsRes, assignmentsRes, ingredientsRes] = await Promise.allSettled([
      apiJson('/api/public/products/batch/variants', {
        method: 'POST',
        body: { ids: [productId] },
      }),
      apiJson('/api/public/products/batch/option-assignments', {
        method: 'POST',
        body: { ids: [productId] },
      }),
      apiJson('/api/public/products/batch/ingredients', {
        method: 'POST',
        body: { ids: [productId] },
      }),
    ]);
    if (variantsRes.status === "fulfilled") {
      variants = Array.isArray(variantsRes.value?.data?.[productId]) ? variantsRes.value.data[productId] : [];
    }
    if (assignmentsRes.status === "fulfilled") {
      optionAssignments = Array.isArray(assignmentsRes.value?.data?.[productId]) ? assignmentsRes.value.data[productId] : [];
    }
    if (ingredientsRes.status === "fulfilled") {
      ingredientsRaw = Array.isArray(ingredientsRes.value?.data?.[productId]) ? ingredientsRes.value.data[productId] : [];
    }

    let variantGroupId = null;
    let variantValueIndex = null;
    let variantLabel = "";
    let variantUnitPrice = Number(product.price || 0);
    const firstVariantGroup = Array.isArray(variants) && variants.length > 0 ? variants[0] : null;
    const variantValues = Array.isArray(firstVariantGroup?.values) ? firstVariantGroup.values : [];
    if (firstVariantGroup && variantValues.length > 0) {
      const rawIdx = firstVariantGroup.default_value_index != null ? Number(firstVariantGroup.default_value_index) : 0;
      const safeIdx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < variantValues.length ? rawIdx : 0;
      const valueLabel = formatUpsellVariantValueLabel(
        variantValues[safeIdx],
        firstVariantGroup.unit_short_title || firstVariantGroup.unit_code || firstVariantGroup.unit_title || ""
      );
      variantGroupId = Number(firstVariantGroup.id || firstVariantGroup.variant_group_id || 0) || null;
      variantValueIndex = safeIdx;
      variantLabel = valueLabel;
      variantUnitPrice = Number(
        getVariantUnitPrice(product, variants, {
          selectedIndex: safeIdx,
          value: variantValues[safeIdx],
          label: valueLabel,
        }) || product.price || 0
      );
    }

    const selectedOptionItems = [];
    const activeAssignments = (Array.isArray(optionAssignments) ? optionAssignments : [])
      .filter((assignment) => Number(assignment?.is_active ?? 1) === 1);
    const assignmentGroupIds = activeAssignments
      .map((assignment) => Number(assignment?.group_id || 0))
      .filter((groupId, index, source) => Number.isFinite(groupId) && groupId > 0 && source.indexOf(groupId) === index);
    let optionGroupsById = {};
    if (assignmentGroupIds.length) {
      try {
        const groupsJson = await apiJson('/api/public/options/groups/batch', {
          method: 'POST',
          body: { ids: assignmentGroupIds },
        });
        optionGroupsById = groupsJson?.data && typeof groupsJson.data === "object" ? groupsJson.data : {};
      } catch {}
    }
    const groups = activeAssignments.map((assignment) => {
      const groupId = Number(assignment?.group_id || 0);
      if (!Number.isFinite(groupId) || groupId <= 0) return null;
      return { assignment, details: optionGroupsById[groupId] || optionGroupsById[String(groupId)] || null };
    });

    groups.forEach((entry) => {
      if (!entry || !entry.details) return;
      const assignment = entry.assignment || {};
      const details = entry.details || {};
      const groupMeta = details.group || details || {};
      const items = (Array.isArray(details.items) ? details.items : [])
        .filter((item) => Number(item?.is_active ?? 1) === 1);
      if (!items.length) return;

      const selectionType = str(groupMeta.selection_type || assignment.selection_type || "single").trim().toLowerCase() || "single";
      const minSelect = Number(groupMeta.min_select ?? assignment.min_select ?? 0);
      const requiredSingle = selectionType === "single" && (Number(groupMeta.is_required || 0) === 1 || minSelect > 0);

      const addDefaultOptionItem = (item, qty) => {
        const safeQty = Math.max(1, Number(qty || 1));
        const targetProductId = Number(item?.target_product_id || item?.product_id || 0);
        const out = {
          id: Number(item.id),
          title: str(item.title || item.name || ""),
          name: str(item.name || item.title || ""),
          price: Number(item.price || 0),
          qty: safeQty,
          quantity: safeQty,
          target_product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
          product_id: Number.isFinite(targetProductId) && targetProductId > 0 ? targetProductId : null,
        };

        const itemVariants = Array.isArray(item?.variants) ? item.variants : [];
        const firstItemVariantGroup = itemVariants.length ? itemVariants[0] : null;
        const itemVariantValues = Array.isArray(firstItemVariantGroup?.values) ? firstItemVariantGroup.values : [];
        if (firstItemVariantGroup && itemVariantValues.length > 0) {
          const rawVariantIdx = firstItemVariantGroup.default_value_index != null ? Number(firstItemVariantGroup.default_value_index) : 0;
          const safeVariantIdx = Number.isFinite(rawVariantIdx) && rawVariantIdx >= 0 && rawVariantIdx < itemVariantValues.length ? rawVariantIdx : 0;
          const variantUnitPriceForOption = Number(getOptionItemVariantUnitPrice(item, firstItemVariantGroup, safeVariantIdx) || out.price || 0);
          out.variant_group_id = Number(firstItemVariantGroup.id || firstItemVariantGroup.variant_group_id || 0) || null;
          out.variant_value_index = safeVariantIdx;
          out.variant_label = formatUpsellVariantValueLabel(
            itemVariantValues[safeVariantIdx],
            firstItemVariantGroup.unit_short_title || firstItemVariantGroup.unit_code || firstItemVariantGroup.unit_title || ""
          );
          out.variant_price_diff = roundPrice(variantUnitPriceForOption - Number(out.price || 0));
          out.price = variantUnitPriceForOption;
        }

        selectedOptionItems.push(out);
      };

      if (selectionType === "single") {
        if (requiredSingle) addDefaultOptionItem(items[0], 1);
        return;
      }

      if (selectionType === "multiple_group" || selectionType === "multiple_item" || selectionType === "multiple") {
        const requiredCount = Number.isFinite(minSelect) ? Math.max(0, Math.floor(minSelect)) : 0;
        if (requiredCount <= 0) {
          return;
        }

        let selectedCount = 0;
        items.forEach((item) => {
          if (selectedCount >= requiredCount) return;
          const qtyMin = Number(item?.qty_min ?? 0);
          const defaultQty = qtyMin > 0 ? qtyMin : 1;
          addDefaultOptionItem(item, defaultQty);
          selectedCount += 1;
        });
      }
    });

    const ingredients = (Array.isArray(ingredientsRaw) ? ingredientsRaw : [])
      .map((ing) => {
        const ingredientId = Number(ing?.ingredient_id || ing?.id || 0);
        if (!Number.isFinite(ingredientId) || ingredientId <= 0) return null;
        const quantity = Number(ing?.quantity ?? ing?.qty ?? 0);
        if (!(quantity > 0)) return null;
        return {
          ingredient_id: ingredientId,
          ingredient_name: str(ing?.ingredient_name || ing?.name || ""),
          name: str(ing?.name || ing?.ingredient_name || ""),
          quantity,
          qty: quantity,
          unit_id: toFiniteNumberOrNull(ing?.unit_id),
          unit_label: str(ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ing?.unit || ""),
          unit: str(ing?.unit || ing?.unit_short_title || ing?.unit_label || ing?.unit_title || ing?.unit_code || ""),
        };
      })
      .filter(Boolean);

    return {
      option_item_ids: selectedOptionItems.map((it) => Number(it.id)).filter((id) => Number.isFinite(id) && id > 0),
      option_items: selectedOptionItems,
      ingredients,
      ingredient_price_diff: 0,
      variant_group_id: variantGroupId,
      variant_value_index: variantValueIndex,
      variant_label: variantLabel,
      variant_unit_price: Number(variantUnitPrice || 0),
    };
  }

  async function addUpsellToCart(p, listEl) {
    const effectiveProduct = mergeProductIntoCache(p, "cart_upsell_add") || p;
    const pid = Number(effectiveProduct.id);
    if (!Number.isFinite(pid)) return;
    const wasEmpty = cartCountTotal() === 0;
    const mainUpsellBlockBefore = elCartList?.querySelector(".shop-cart-upsell") || null;
    const sheetUpsellBlockBefore = openCartSheetCtx?.listEl
      ? openCartSheetCtx.listEl.querySelector(".shop-cart-upsell")
      : null;
    const mainUpsellScrollBefore = captureUpsellScrollState(elCartList);
    const sheetUpsellScrollBefore = openCartSheetCtx?.listEl
      ? captureUpsellScrollState(openCartSheetCtx.listEl)
      : null;
    const mainRowsBefore = captureRenderedCartRowsByKey(elCartList);
    const sheetRowsBefore = openCartSheetCtx?.listEl
      ? captureRenderedCartRowsByKey(openCartSheetCtx.listEl)
      : new Map();

    const cachedDefaults = getUpsellDefaultConfigCacheEntry(pid);
    let defaults = buildImmediateUpsellDefaults(effectiveProduct, cachedDefaults);
    if (!cachedDefaults?.data) {
      const defaultsPromise = warmUpsellDefaultConfig(pid, effectiveProduct);
      if (isCatalogProductConfigurable(effectiveProduct) || shouldLoadFullUpsellDefaultsBeforeAdd(effectiveProduct, cachedDefaults, defaults)) {
        defaults = await defaultsPromise;
      } else {
        void defaultsPromise.catch(() => {});
      }
    }
    const normalizedVariantUnitPrice = Number(defaults?.variant_unit_price || 0);
    const normalizedVariantGroupId = defaults?.variant_group_id != null ? Number(defaults.variant_group_id) : null;
    const normalizedVariantValueIndex = defaults?.variant_value_index != null ? Number(defaults.variant_value_index) : null;
    const normalizedVariantLabel = str(defaults?.variant_label || "");

    // Upsell flow: ignore option groups entirely (keep only product + variant + ingredients).
    const optionItems = Array.isArray(defaults.option_items) ? defaults.option_items : [];
    const ingredients = Array.isArray(defaults.ingredients) ? defaults.ingredients : [];
    const hasVariant =
      Number.isFinite(Number(normalizedVariantGroupId)) &&
      Number.isFinite(Number(normalizedVariantValueIndex));
    const variantSelection = hasVariant
      ? {
          group_id: Number(normalizedVariantGroupId),
          value_index: Number(normalizedVariantValueIndex),
        }
      : null;

    const key = makeCartKey(pid, optionItems, ingredients, variantSelection);
    const existing = getCartItemByKey(key);
    if (existing) {
      existing.qty += 1;
      existing.option_item_ids = Array.isArray(defaults.option_item_ids) ? defaults.option_item_ids : [];
      existing.option_items = optionItems;
      existing.ingredients = ingredients;
      existing.ingredient_price_diff = Number(defaults.ingredient_price_diff || 0);
      existing.variant_group_id = hasVariant ? Number(normalizedVariantGroupId) : null;
      existing.variant_value_index = hasVariant ? Number(normalizedVariantValueIndex) : null;
      existing.variant_label = hasVariant ? str(normalizedVariantLabel || "") : "";
      existing.variant_unit_price = hasVariant ? Number(normalizedVariantUnitPrice || 0) : 0;
    } else {
      state.cart.push({
        key: key,
        product_id: pid,
        qty: 1,
        option_item_ids: Array.isArray(defaults.option_item_ids) ? defaults.option_item_ids : [],
        option_items: optionItems,
        ingredients: ingredients,
        ingredient_price_diff: Number(defaults.ingredient_price_diff || 0),
        variant_group_id: hasVariant ? Number(normalizedVariantGroupId) : null,
        variant_value_index: hasVariant ? Number(normalizedVariantValueIndex) : null,
        variant_label: hasVariant ? str(normalizedVariantLabel || "") : "",
        variant_unit_price: hasVariant ? Number(normalizedVariantUnitPrice || 0) : 0,
        auto_add: 0,
        auto_add_group_id: null,
      });
    }
    if (wasEmpty) {
      clearAllAutoAddDismissed();
    }
    const autoChanged = applyAutoAddRules();
    clearAutoAddDismissedIfCartEmpty();
    saveCart();

    const canReuseRows = !autoChanged;
    if (canReuseRows) {
      const { items, total } = renderCartIntoWithRowReuse(
        elCartList,
        elCartTotal,
        elCartEmpty,
        mainRowsBefore,
        mainUpsellBlockBefore,
        [key]
      );
      syncCartFooterVisibilityForCartMode(items.length);
      if (elCheckoutBtn) {
        elCheckoutBtn.disabled = items.length === 0;
        const totalSpan = $("#shopCartTotal", elCheckoutBtn) || $(".shop-checkout-total", elCheckoutBtn);
        if (totalSpan) totalSpan.textContent = money(total);
      }
      appendUpsellToList(elCartList);
      restoreUpsellScrollState(elCartList, mainUpsellScrollBefore);
      updateMobileDeliveryProgress();
      cartUiRenderedRevision = cartUiRevision;
    } else {
      renderCart();
      restoreUpsellScrollState(elCartList, mainUpsellScrollBefore);
    }

    if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
      const isSameListAsMain = openCartSheetCtx.listEl === elCartList;
      const rendered = isSameListAsMain
        ? { items: cartItemsResolved(), total: computeCartTotals(cartItemsResolved()).total }
        : (canReuseRows
          ? renderCartIntoWithRowReuse(
            openCartSheetCtx.listEl,
            openCartSheetCtx.totalEl,
            null,
            sheetRowsBefore,
            sheetUpsellBlockBefore,
            [key]
          )
          : renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null));
      const items = rendered.items;
      const total = rendered.total;
      if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
      if (openCartSheetCtx.checkoutBtn) {
        openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
        const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
        if (tspan) tspan.textContent = money(total);
      }
      const isMobileUpsell = window.matchMedia("(max-width: 768px)").matches;
      if (isMobileUpsell && elMobileCartActions) {
        elMobileCartActionsCart?.classList.toggle("hidden", items.length === 0);
        updateMobileDeliveryProgress();
      }
      appendUpsellToList(openCartSheetCtx.listEl);
      if (isSameListAsMain) {
        restoreUpsellScrollState(openCartSheetCtx.listEl, mainUpsellScrollBefore);
      } else {
        restoreUpsellScrollState(openCartSheetCtx.listEl, sheetUpsellScrollBefore);
      }
    }

    updateCartTotalsUiOnly();
    const hasItemsNow = cartItemsResolved().length > 0;
    updateCartBadge();
    if (elMobileCheckoutBtn) {
      elMobileCheckoutBtn.disabled = !hasItemsNow;
    }
    if (window.matchMedia("(max-width: 768px)").matches && elMobileCartActionsCart) {
      elMobileCartActionsCart.classList.toggle("hidden", !hasItemsNow);
    }
  }

  async function loadUnitConversions() {
    if (Array.isArray(state.unitConversions) && state.unitConversions.length) return;
    try {
      const json = await apiJson("/api/public/unit-conversions");
      state.unitConversions = Array.isArray(json.data) ? json.data : [];
    } catch (e) {
      console.error("Failed to load unit conversions", e);
      state.unitConversions = [];
    }
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

  function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getOptionItemDefaultVariantIndex(optionItem) {
    const variants = Array.isArray(optionItem?.variants) ? optionItem.variants : [];
    const variantGroup = variants[0];
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return null;
    const rawIndex = variantGroup?.default_value_index != null ? Number(variantGroup.default_value_index) : 0;
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || rawIndex >= values.length) return 0;
    return rawIndex;
  }

  /**
   * ???? ??????-????? ? ?????? ?????????? ???????? (?????? ?????).
   * ???????????? ??? ????? ?????? (??/?, ?/?? ? ?.?.): ?????????? ??????????? ??? ??? ????????? ???????? ??????.
   */
  function getOptionItemVariantUnitPrice(optionItem, variantGroup, selectedIndex) {
    const fallbackPrice = Number(optionItem?.price || 0);
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return fallbackPrice;
    const values = Array.isArray(variantGroup?.values) ? variantGroup.values : [];
    if (!values.length) return fallbackPrice;

    const numericValue = parseVariantValueNumber(values[idx]);
    if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackPrice;

    const productId = Number(optionItem?.target_product_id || 0);
    const product = productId > 0 ? state.productCache.get(productId) : null;

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

    // ???? ?В корзине пусто???? ????? ?????/??????????? ? ?????????В корзине пусто???? ?? ???? ?????
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

  function getOptionItemVariantPriceDiff(optionItem, variantGroup, selectedIndex) {
    const unitPrice = Number(getOptionItemVariantUnitPrice(optionItem, variantGroup, selectedIndex) || 0);
    const productId = Number(optionItem?.target_product_id || 0);
    const targetProduct = productId > 0 ? state.productCache.get(productId) : null;
    const basePrice = targetProduct
      ? Number(targetProduct.price || 0)
      : Number(optionItem?.price || 0);
    if (!Number.isFinite(unitPrice) || !Number.isFinite(basePrice)) return 0;
    return unitPrice - basePrice;
  }

  function getOptionItemResolvedDefaultPrice(optionItem) {
    const basePrice = Number(optionItem?.price || 0);
    if (!Number.isFinite(basePrice)) return 0;
    const variants = Array.isArray(optionItem?.variants) ? optionItem.variants : [];
    const variantGroup = variants[0];
    const defaultVariantIndex = getOptionItemDefaultVariantIndex(optionItem);
    if (!variantGroup || !Number.isFinite(Number(defaultVariantIndex))) {
      return basePrice;
    }
    return basePrice + getOptionItemVariantPriceDiff(optionItem, variantGroup, Number(defaultVariantIndex));
  }

  function getVariantUnitPrice(product, variants, variantState) {
    if (!product) return 0;
    const basePrice = Number(product.price || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const selectedIndex = Number(variantState?.selectedIndex);
    if (!Number.isFinite(selectedIndex)) return basePrice;

    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;

    const value = Array.isArray(group.values) ? group.values[selectedIndex] : null;
    const numericValue = parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;

    const factor = getConversionFactor(variantUnitId, baseUnitId);
    const effectiveFactor = factor != null ? Number(factor || 0) : 1;
    const qtyInBase = numericValue * effectiveFactor;
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;

    let unitPrice = basePrice * (qtyInBase / baseQty);

    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === selectedIndex);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) {
      unitPrice = unitPrice * (1 - discountPercent / 100);
    }
    return unitPrice;
  }

  function getQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    
    // ??? ????????? ????? pcs ?????????? ingredient_pcs_factor ???? ????
    // ????????? ????? ??? ???????, ??? ??? ??? ??????? ? ?????? ?????? ? ??????
    // ?????? ????? ?????????? ????? ????????? ????? getConversionFactor
    
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  function ensureCachedProductCategoryIds(product, fallbackCategoryId = 0) {
    if (!product || typeof product !== "object") return product;
    const ids = [
      ...(Array.isArray(product.category_ids) ? product.category_ids.map((categoryId) => Number(categoryId || 0)) : []),
      Number(product.category_id || 0),
      Number(product._category_id || 0),
      Number(fallbackCategoryId || 0),
    ].filter((categoryId, index, source) => categoryId > 0 && source.indexOf(categoryId) === index);
    if (ids.length) {
      product.category_ids = ids;
      if (!(Number(product.category_id || 0) > 0)) product.category_id = ids[0];
    }
    return product;
  }

  async function loadProductsByCategory() {
    const categories = getVisibleCategories();
    const categoryIds = categories.map(c => Number(c.id));

    let productsByCategory = {};
    let combosByCategory = {};

    try {
      const json = await apiJson('/api/public/products/batch/categories', {
        method: 'POST',
        body: { category_ids: categoryIds },
      });
      productsByCategory = json.data || {};
      combosByCategory = json.combos || {};
    } catch (e) {
      console.warn("loadProductsByCategory: batch failed, falling back", e);
      // fallback: загружаем по одному
      const entries = await Promise.all(
        categories.map(async (c) => {
          try {
            const json = await apiJson(`/api/public/products?category_id=${encodeURIComponent(c.id)}`);
            combosByCategory[c.id] = Array.isArray(json.combos) ? json.combos : [];
            return [Number(c.id), Array.isArray(json.data) ? json.data : []];
          } catch (e2) {
            combosByCategory[c.id] = [];
            return [Number(c.id), []];
          }
        })
      );
      for (const [id, list] of entries) productsByCategory[id] = list;
    }

    const entries = categoryIds.map(id => {
      const list = Array.isArray(productsByCategory[id]) ? productsByCategory[id] : [];
      for (const p of list) {
        ensureCachedProductCategoryIds(p, id);
        if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
        cacheStockFromProductPayload(p, "products_by_category");
        p.is_available = isProductAvailable(p);
        state.productCache.set(Number(p.id), p);
      }
      state.combosByCategory.set(id, Array.isArray(combosByCategory[id]) ? combosByCategory[id] : []);
      return [id, list];
    });

    state.productsByCategory = new Map(entries);
    saveCatalogSnapshotFromState();
    if (pruneUnavailableCartItems()) {
      renderCart();
      updateCartBadge();
      if (openCartSheetCtx && openCartSheetCtx.listEl && openCartSheetCtx.totalEl) {
        const { items, total } = renderCartInto(openCartSheetCtx.listEl, openCartSheetCtx.totalEl, null);
        if (openCartSheetCtx.footerEl) openCartSheetCtx.footerEl.classList.toggle("hidden", items.length === 0);
        if (openCartSheetCtx.checkoutBtn) {
          openCartSheetCtx.checkoutBtn.disabled = items.length === 0;
          const tspan = $(".shop-sheet-checkout-total", openCartSheetCtx.checkoutBtn);
          if (tspan) tspan.textContent = money(total);
        }
        appendUpsellToList(openCartSheetCtx.listEl);
      }
    }
  }

  // ??????? ????????: ?????? ???? ????????? (??? ???????? LCP).
  async function loadProductsForCategory(categoryId, opts = {}) {
    const cid = Number(categoryId);
    if (!Number.isFinite(cid)) return [];
    try {
      // ??В корзине пусто?? ????? "lite" ?????: ??????? ?????, ?????В корзине пусто????? ?? ???????.
      // ?????? ????? ?????????? ????? ????? loadProductsByCategory().
      const lite = opts && opts.lite !== false;
      const limitRaw = Number(opts && opts.limit);
      const limit = (Number.isFinite(limitRaw) && limitRaw > 0) ? Math.min(200, Math.max(1, limitRaw)) : 24;
      const url = lite
        ? `/api/public/products?category_id=${encodeURIComponent(cid)}&lite=1&limit=${encodeURIComponent(limit)}`
        : `/api/public/products?category_id=${encodeURIComponent(cid)}`;
      const json = await apiJson(url);
      const list = Array.isArray(json.data) ? json.data : [];
      for (const p of list) {
        const fallbackCategoryId = Number(p?._category_id || json?.category_id || cid || 0);
        ensureCachedProductCategoryIds(p, fallbackCategoryId);
        if (!Array.isArray(p.photos)) p.photos = safePhotos(p);
        cacheStockFromProductPayload(p, "products_for_category");
        p.is_available = isProductAvailable(p);
        state.productCache.set(Number(p.id), p);
      }
      const combos = Array.isArray(json.combos) ? json.combos : [];
      // В lite режиме не перезаписываем комбо пустым массивом, если они уже загружены
      if (combos.length || !lite) {
        state.combosByCategory.set(cid, combos);
      }
      if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();
      state.productsByCategory.set(cid, list);
      saveCatalogSnapshotFromState();
      try { if (lite) __categoryLoadLimit.set(cid, limit); } catch {}
      return list;
    } catch (e) {
      console.warn("loadProductsForCategory: failed for category", cid, e);

      // ?????????? ????????????, ??? ??????? ?? ??????????
      try {
        const statusEl = document.getElementById("shopToolbarStatus");
        if (statusEl) {
          statusEl.textContent = "Ошибка загрузки каталога";
          statusEl.classList.remove("hidden");
        }
      } catch {}

      state.combosByCategory.set(cid, []);
      if (!(state.productsByCategory instanceof Map)) state.productsByCategory = new Map();
      state.productsByCategory.set(cid, []);
      return [];
    } finally {
      if (pruneUnavailableCartItems()) {
        renderCart();
        updateCartBadge();
      }
    }
  }

  async function refreshShopData() {
    const statusEl = document.getElementById("shopToolbarStatus");
    const showStatus = (text) => {
      if (statusEl) {
        statusEl.textContent = text || "";
        statusEl.classList.toggle("hidden", !text);
      }
    };
    showStatus("Загружаем...");
    try {
      if (!await loadShopBootstrap().catch(() => null)) {
        await loadCategories();
      }
      renderCategories();
      renderCategoryChips();
      if (typeof updateStoreStatus === "function") if (typeof updateStoreStatus === "function") updateStoreStatus();
      const visible = getVisibleCategories();
      const stillActive = visible.some((c) => Number(c.id) === Number(state.activeCategoryId));
      if (!stillActive && visible.length) {
        const first = visible[0];
        setActiveCategory(first.id, first.title, { scroll: false });
      } else if (!visible.length) {
        state.activeCategoryId = null;
        state.activeCategoryTitle = "Каталог";
        if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
      }

      // ?????? ??В корзине пусто???? ?????, ????? ?????? ? ????? ???? ???????? ??? ?????????.
      if (visible.length) {
        await loadProductsByCategory();
      } else {
        state.productsByCategory = new Map();
        state.combosByCategory = new Map();
      }
      renderProducts();
      if (Number.isFinite(Number(state.activeCategoryId)) && Number(state.activeCategoryId) > 0) {
        void warmInitialCatalogInteractionData({
          categoryIds: [Number(state.activeCategoryId)],
          productLimit: INITIAL_CATALOG_PREFETCH_PRODUCTS,
          comboLimit: INITIAL_CATALOG_PREFETCH_COMBOS,
        });
      }
      renderCart();
      updateCartBadge();
      saveCatalogSnapshotFromState();
    } finally {
      showStatus("");
    }
  }

  let shopPullRefreshState = null;

  function isMobilePullRefreshAvailable() {
    if (!isShopPage()) return false;
    if (!("ontouchstart" in window) && Number(navigator.maxTouchPoints || 0) <= 0) return false;
    if (window.matchMedia && !window.matchMedia("(max-width: 768px)").matches) return false;
    if (document.body?.classList.contains("modal-open") || document.body?.classList.contains("sheet-open")) return false;
    if (window.AppModal?.isOpen?.()) return false;
    return true;
  }

  function getShopPullRefreshScrollTop() {
    return Math.max(0, Number(window.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0));
  }

  function ensureShopPullRefreshIndicator() {
    let indicator = document.querySelector("[data-shop-pull-refresh]");
    if (indicator) return indicator;
    indicator = document.createElement("div");
    indicator.className = "shop-pull-refresh";
    indicator.setAttribute("data-shop-pull-refresh", "1");
    indicator.setAttribute("aria-hidden", "true");
    indicator.innerHTML = '<span class="shop-pull-refresh__spinner"></span>';
    document.body.appendChild(indicator);
    return indicator;
  }

  function setShopPullRefreshProgress(distance, refreshing = false) {
    const indicator = ensureShopPullRefreshIndicator();
    const clamped = Math.max(0, Math.min(96, Number(distance || 0)));
    indicator.classList.toggle("is-visible", clamped > 4 || refreshing);
    indicator.classList.toggle("is-ready", clamped >= 76 || refreshing);
    indicator.classList.toggle("is-refreshing", !!refreshing);
    indicator.style.setProperty("--shop-pull-refresh-y", `${Math.round(clamped)}px`);
  }

  async function runShopPullRefresh() {
    setShopPullRefreshProgress(76, true);
    window.location.reload();
    setTimeout(() => {
      setShopPullRefreshProgress(0, false);
      if (shopPullRefreshState) shopPullRefreshState.refreshing = false;
    }, 1200);
  }

  function bindShopPullToRefresh() {
    if (shopPullRefreshState) return;
    shopPullRefreshState = {
      startX: 0,
      startY: 0,
      pulling: false,
      refreshing: false,
      distance: 0,
    };
    const stateRef = shopPullRefreshState;
    const threshold = 76;

    document.addEventListener("touchstart", (event) => {
      if (stateRef.refreshing || !isMobilePullRefreshAvailable()) return;
      const touch = event.touches && event.touches[0];
      if (!touch || getShopPullRefreshScrollTop() > 1) return;
      stateRef.startX = touch.clientX;
      stateRef.startY = touch.clientY;
      stateRef.distance = 0;
      stateRef.pulling = false;
    }, { passive: true });

    document.addEventListener("touchmove", (event) => {
      if (stateRef.refreshing || !isMobilePullRefreshAvailable()) return;
      const touch = event.touches && event.touches[0];
      if (!touch || getShopPullRefreshScrollTop() > 1) return;
      const dy = touch.clientY - stateRef.startY;
      const dx = Math.abs(touch.clientX - stateRef.startX);
      if (dy <= 0 || dx > dy) return;
      stateRef.pulling = true;
      stateRef.distance = Math.min(96, dy * 0.55);
      setShopPullRefreshProgress(stateRef.distance, false);
      if (stateRef.distance > 8) event.preventDefault();
    }, { passive: false });

    const finishPull = () => {
      if (!stateRef.pulling || stateRef.refreshing) return;
      const shouldRefresh = stateRef.distance >= threshold;
      stateRef.pulling = false;
      stateRef.distance = 0;
      if (shouldRefresh) {
        stateRef.refreshing = true;
        void runShopPullRefresh();
      } else {
        setShopPullRefreshProgress(0, false);
      }
    };

    document.addEventListener("touchend", finishPull, { passive: true });
    document.addEventListener("touchcancel", finishPull, { passive: true });
  }


// -----------------------------
// Init (core)
// -----------------------------
const SHOP_SPLASH_MIN_VISIBLE_MS = 1500;
const SHOP_SPLASH_INTERACTION_READY_MIN_MS = 2500;
const SHOP_SPLASH_INTERACTION_READY_MAX_MS = 7000;
const SHOP_SPLASH_PRODUCTS_READY_MAX_MS = 4500;
const SHOP_SPLASH_FADE_OUT_MS = 350;
const __shopSplashStartedAt = Date.now();
let __shopSplashHideScheduled = false;
let __shopSplashHidden = false;

function scheduleHideShopSplash(minVisibleMs = SHOP_SPLASH_MIN_VISIBLE_MS) {
  if (__shopSplashHidden || __shopSplashHideScheduled) return;
  const splashEl = document.getElementById("shopSplash");
  if (!splashEl) {
    __shopSplashHidden = true;
    return;
  }

  __shopSplashHideScheduled = true;
  const elapsedMs = Date.now() - __shopSplashStartedAt;
  const waitMs = Math.max(0, Number(minVisibleMs || 0) - elapsedMs);

  setTimeout(() => {
    const el = document.getElementById("shopSplash");
    if (!el) {
      __shopSplashHidden = true;
      return;
    }
    el.classList.add("is-done");
    setTimeout(() => {
      try { el.remove(); } catch {}
      __shopSplashHidden = true;
    }, SHOP_SPLASH_FADE_OUT_MS);
  }, waitMs);
}

function withShopSplashTimeout(promise, timeoutMs) {
  const waitMs = Math.max(0, Number(timeoutMs || 0));
  return Promise.race([
    Promise.resolve(promise),
    new Promise((resolve) => setTimeout(() => resolve(false), waitMs)),
  ]);
}

function scheduleAllProductIngredientBatch() {
  const allProductIds = [];
  if (state.productsByCategory instanceof Map) {
    state.productsByCategory.forEach(function(products) {
      for (var i = 0; i < products.length; i++) {
        var pid = Number(products[i]?.id);
        if (Number.isFinite(pid) && pid > 0) allProductIds.push(pid);
      }
    });
  }
  if (allProductIds.length) batchLoadIngredientRequirements(allProductIds).catch(function() {});
}

async function initCore() {
  try {
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
    try { bindIosBackSwipeGuard(); } catch {}
    try { bindMobileZoomGuard(); } catch {}
    try { bindMobilePortraitGuard(); } catch {}
    if (isShopPage()) {
      document.body.classList.add("shop-main");
    } else {
      document.body.classList.remove("shop-main");
    }

    const hasSnapshotPaint = restoreCatalogSnapshotForFastPaint();
    if (hasSnapshotPaint) {
      try {
        if (typeof updateStoreStatus === "function") updateStoreStatus();
      } catch {}
      try { prioritizeAboveFoldCardImages(); } catch {}
    } else {
      renderCategoriesSkeleton();
      renderProductsSkeleton();
    }

    const shopBootstrapData = await loadShopBootstrap().catch(() => null);
    if (!shopBootstrapData) {
      await loadCategories();
    }
    const orderConfigBootstrapPromise = shopBootstrapData?.orderConfig
      ? Promise.resolve(shopBootstrapData.orderConfig)
      : ensureOrderConfigForHeader().catch(() => null);
    const homeBonusConfigPromise = loadHomeBonusConfig().catch(() => null);
    renderCategories();
    renderCategoryChips();
    if (typeof updateStoreStatus === "function") if (typeof updateStoreStatus === "function") updateStoreStatus();

    const visibleCategories = getVisibleCategories();
    const first = visibleCategories[0] || null;
    if (first) {
      setActiveCategory(first.id, first.title, { scroll: false });
    } else {
      state.activeCategoryId = null;
      state.activeCategoryTitle = "Каталог";
      if (elCategoryTitle) elCategoryTitle.textContent = state.activeCategoryTitle;
    }

    // Загружаем адрес параллельно с товарами, чтобы хедер обновился как можно раньше
    const addressPromise = refreshAddressState().then(() => {
      updateAddressChip();
    }).catch(() => {});
    const cartEnhancersStartupPromise = loadCartEnhancersData();

    // ????? ?????? ??В корзине пусто???? (?????? + ?????),
    // ????? ??????? ??? ????????? ????? ??? ?????????.
    let productsReadyForFirstPaint = true;
    let productsLoadPromise = Promise.resolve(true);
    if (visibleCategories.length) {
      productsLoadPromise = loadProductsByCategory()
        .then(() => true)
        .catch((err) => {
          console.warn("loadProductsByCategory: initial load failed", err);
          return false;
        });
      productsReadyForFirstPaint = await withShopSplashTimeout(
        productsLoadPromise,
        SHOP_SPLASH_PRODUCTS_READY_MAX_MS
      );
    } else {
      state.productsByCategory = new Map();
      state.combosByCategory = new Map();
    }

    await orderConfigBootstrapPromise;

    if (productsReadyForFirstPaint) {
      renderProducts();
      prioritizeAboveFoldCardImages();
    } else {
      productsLoadPromise.then((ok) => {
        if (!ok) return;
        renderProducts();
        prioritizeAboveFoldCardImages();
        scheduleAllProductIngredientBatch();
        if (Number.isFinite(Number(state.activeCategoryId)) && Number(state.activeCategoryId) > 0) {
          void warmInitialCatalogInteractionData({
            categoryIds: [Number(state.activeCategoryId)],
            productLimit: INITIAL_CATALOG_PREFETCH_PRODUCTS,
            comboLimit: INITIAL_CATALOG_PREFETCH_COMBOS,
          });
        }
      }).catch(() => {});
    }
    const shopLateReadyPromise = ensureShopLateLoaded().catch(() => false);
    let firstInteractionWarmPromise = Promise.resolve(false);
    if (productsReadyForFirstPaint && Number.isFinite(Number(state.activeCategoryId)) && Number(state.activeCategoryId) > 0) {
      firstInteractionWarmPromise = warmInitialCatalogInteractionData({
        categoryIds: [Number(state.activeCategoryId)],
        productLimit: INITIAL_CATALOG_PREFETCH_PRODUCTS,
        comboLimit: INITIAL_CATALOG_PREFETCH_COMBOS,
      }).catch(() => false);
    }
    void homeBonusConfigPromise;
    cartEnhancersStartupPromise.then(() => {
      const startupAutoChanged = applyAutoAddRules();
      clearAutoAddDismissedIfCartEmpty();
      if (startupAutoChanged) {
        saveCart();
        scheduleSyncAllProductCardsFromCart();
      }
      cartEnhancersLastRefreshSignature = getCartEnhancersRefreshSignature();
      renderCart(true);
      updateCartBadge();
    }).catch(() => {});

    // Убираем loader — контент готов
    await withShopSplashTimeout(
      Promise.allSettled([
        shopLateReadyPromise,
        firstInteractionWarmPromise,
        addressPromise,
      ]),
      SHOP_SPLASH_INTERACTION_READY_MAX_MS
    );
    scheduleHideShopSplash(SHOP_SPLASH_INTERACTION_READY_MIN_MS);

    // Batch-загрузка ингредиентов для всех товаров одним запросом
    if (productsReadyForFirstPaint) scheduleAllProductIngredientBatch();

    void addressPromise;

    // Перед первым "боевым" рендером корзины прогреваем товары из корзины,
    // чтобы сразу использовать тот же путь и те же данные, что и при
    // последующих обновлениях (после любых действий пользователя).
    void warmupCartProducts().then(() => {
      renderCart(true);
      updateCartBadge();
    }).catch(() => {});
    renderCart();
    // Apply cart-header address mode immediately on first paint.
    showCartView();
    bindCatalogDeliveryWidget();
    updateCatalogDeliveryWidgetUi();
    updateCartBadge();
    try { void preloadCartEnhancers(); } catch {}
    bindLateActionDelegates();
    try { window.scrollTo(0, 0); } catch {}

    bindCategoryScrollSpy();
    bindShopWarmups();
    bindShopPullToRefresh();
    syncStorefrontChatWidgetStateOnBoot().catch(function () {});
    startStockSync();

    // Раньше initShopLate/ensureShopLateLoaded запускались только после первого клика.
    // Теперь мы инициализируем late-часть сразу после загрузки магазина,
    // чтобы корзина и остальные элементы не зависели от первого взаимодействия.
    try {
      ensureShopLateLoaded();
    } catch {}
  } catch (e) {
    console.error(e);
    scheduleHideShopSplash();
  }
}

if (__shopHasRequiredDom) initCore();

// Late-loaded on shop-late.js. Core keeps a safe no-op to avoid ReferenceError during first paint.
function updateMobileDeliveryProgress() {}
async function showDesktopBenefitsView() {}

let __iosBackSwipeGuardBound = false;
function bindIosBackSwipeGuard() {
  if (__iosBackSwipeGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isAppleTouch = /iP(hone|od|ad)/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isAppleTouch) return;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  const EDGE_PX = 24;
  const SWIPE_TRIGGER_PX = 18;
  const VERTICAL_TOLERANCE_PX = 14;

  document.addEventListener("touchstart", (event) => {
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = startX <= EDGE_PX;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!tracking) return;
    const touch = event.touches && event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - startX;
    const dy = Math.abs(touch.clientY - startY);
    if (dx > SWIPE_TRIGGER_PX && dy < VERTICAL_TOLERANCE_PX) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener("touchend", () => {
    tracking = false;
  }, { passive: true });
  document.addEventListener("touchcancel", () => {
    tracking = false;
  }, { passive: true });

  __iosBackSwipeGuardBound = true;
}

let __mobileZoomGuardBound = false;
function bindMobileZoomGuard() {
  if (__mobileZoomGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isMobile) return;

  // iOS Safari pinch gesture event.
  document.addEventListener("gesturestart", (event) => {
    event.preventDefault();
  }, { passive: false });

  // Prevent double-tap zoom while keeping single taps intact.
  let lastTouchEnd = 0;
  document.addEventListener("touchend", (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  __mobileZoomGuardBound = true;
}

let __mobilePortraitGuardBound = false;
function bindMobilePortraitGuard() {
  if (__mobilePortraitGuardBound) return;
  if (!isShopPage()) return;

  const ua = String(navigator.userAgent || "");
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (!isMobile) return;

  try {
    if (screen.orientation && typeof screen.orientation.lock === "function") {
      screen.orientation.lock("portrait").catch(() => {});
    }
  } catch {}

  let guard = document.getElementById("shopPortraitGuard");
  if (!guard) {
    guard = document.createElement("div");
    guard.id = "shopPortraitGuard";
    guard.className = "shop-portrait-guard hidden";
    guard.innerHTML = '<div class="shop-portrait-guard-card">\u041f\u043e\u0432\u0435\u0440\u043d\u0438\u0442\u0435 \u0443\u0441\u0442\u0440\u043e\u0439\u0441\u0442\u0432\u043e \u0432 \u043f\u043e\u0440\u0442\u0440\u0435\u0442\u043d\u044b\u0439 \u0440\u0435\u0436\u0438\u043c</div>';
    document.body.appendChild(guard);
  }

  const updatePortraitGuard = () => {
    const isLandscape = window.matchMedia("(orientation: landscape)").matches;
    const isSmallScreen = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 900;
    const shouldBlock = isLandscape && isSmallScreen;
    guard.classList.toggle("hidden", !shouldBlock);
    document.body.classList.toggle("shop-portrait-guard-active", shouldBlock);
  };

  updatePortraitGuard();
  window.addEventListener("resize", updatePortraitGuard, { passive: true });
  window.addEventListener("orientationchange", updatePortraitGuard, { passive: true });

  __mobilePortraitGuardBound = true;
}
