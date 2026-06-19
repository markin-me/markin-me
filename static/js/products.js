(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const TENANT_ID = (() => {
    const fromMeta = Number(document.querySelector('meta[name="tenant_id"]')?.content || 0);
    if (Number.isFinite(fromMeta) && fromMeta > 0) return fromMeta;
    try {
      const raw = localStorage.getItem("tenant");
      const parsed = raw ? JSON.parse(raw) : null;
      const fromStorage = Number(parsed?.id || 0);
      if (Number.isFinite(fromStorage) && fromStorage > 0) return fromStorage;
    } catch {}
    return 1;
  })();
  const PRODUCT_BLOCK_DEFINITIONS = Object.freeze([
    { key: "nutrition", label: "КБЖУ" },
    { key: "description", label: "Описание" },
    { key: "variants", label: "Варианты товара" },
    { key: "options", label: "Опции" },
    { key: "ingredients", label: "Состав" },
    { key: "promotions", label: "Участие в акциях" },
  ]);
  const PRODUCT_FOOTER_BLOCK_CHIP_DEFINITIONS = PRODUCT_BLOCK_DEFINITIONS;
  const PRODUCT_FULFILLMENT_MODES = Object.freeze([
    { value: "stock", label: "Со склада" },
    { value: "made_to_order", label: "Под заказ" },
  ]);

  function normalizeProductFulfillmentMode(value) {
    return String(value || "").trim() === "made_to_order" ? "made_to_order" : "stock";
  }

  function getProductFulfillmentModeLabel(value) {
    const normalized = normalizeProductFulfillmentMode(value);
    return PRODUCT_FULFILLMENT_MODES.find((item) => item.value === normalized)?.label || PRODUCT_FULFILLMENT_MODES[0].label;
  }

  function getDefaultProductBlocksConfig() {
    return {
      nutrition: false,
      description: false,
      variants: false,
      options: false,
      ingredients: false,
      promotions: false,
    };
  }

  function normalizeProductBlocksConfig(rawValue, fallbackValue = null) {
    let parsed = rawValue;
    if (typeof parsed === "string") {
      const trimmed = parsed.trim();
      if (!trimmed) parsed = null;
      else {
        try {
          parsed = JSON.parse(trimmed);
        } catch {
          parsed = null;
        }
      }
    }
    const fallback = fallbackValue && typeof fallbackValue === "object"
      ? fallbackValue
      : getDefaultProductBlocksConfig();
    const out = {};
    PRODUCT_BLOCK_DEFINITIONS.forEach(({ key }) => {
      out[key] = Boolean(parsed && typeof parsed === "object" && parsed[key] != null ? parsed[key] : fallback[key]);
    });
    return out;
  }

  function normalizeProductValueSource(value) {
    return String(value || "").trim() === "auto" ? "auto" : "manual";
  }

  const PRODUCTS_TOOLBAR_FILTERS_STORAGE_KEY = "products:toolbar-filters:v1";
  const PRODUCTS_TOOLBAR_MODE_KEYS = Object.freeze(["products", "options", "variants"]);
  const PRODUCTS_TOOLBAR_SEARCH_DEBOUNCE_MS = 220;
  const PRODUCTS_TOOLBAR_FILTER_DEFINITIONS = Object.freeze({
    products: [
      { key: "active", label: "Активные" },
      { key: "inactive", label: "Неактивные" },
      { key: "visible", label: "Видимые" },
      { key: "hidden", label: "Скрытые" },
      { key: "in_stock", label: "В наличии" },
      { key: "ended", label: "Закончились" },
      { key: "fulfillment_stock", label: "Со склада" },
      { key: "fulfillment_made_to_order", label: "Под заказ" },
    ],
    options: [
      { key: "active", label: "Активные" },
      { key: "inactive", label: "Неактивные" },
    ],
    variants: [
      { key: "active", label: "Активные" },
      { key: "inactive", label: "Неактивные" },
    ],
  });

  function normalizeProductsToolbarQuery(value) {
    return String(value || "").trim();
  }

  function getDefaultProductsToolbarFilters(mode) {
    if (mode === "products") {
      return {
        active: true,
        inactive: true,
        visible: true,
        hidden: false,
        in_stock: true,
        ended: true,
        fulfillment_stock: true,
        fulfillment_made_to_order: true,
      };
    }
    return {
      active: true,
      inactive: true,
    };
  }

  function normalizeProductsToolbarFilters(mode, rawFilters = null) {
    const defaults = getDefaultProductsToolbarFilters(mode);
    const source = rawFilters && typeof rawFilters === "object" ? rawFilters : {};
    const out = {};
    Object.keys(defaults).forEach((key) => {
      out[key] = source[key] == null ? defaults[key] : Boolean(source[key]);
    });
    return out;
  }

  function loadStoredProductsToolbarFilters() {
    const out = {};
    try {
      const raw = localStorage.getItem(PRODUCTS_TOOLBAR_FILTERS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      PRODUCTS_TOOLBAR_MODE_KEYS.forEach((mode) => {
        out[mode] = normalizeProductsToolbarFilters(mode, parsed?.[mode]);
      });
    } catch {
      PRODUCTS_TOOLBAR_MODE_KEYS.forEach((mode) => {
        out[mode] = normalizeProductsToolbarFilters(mode);
      });
    }
    return out;
  }

  // left
  const categoriesNav = $("#categoriesNav");
  const addCategoryBtn = $("#addCategoryBtn");
  const productsAccordion = $("#productsAccordion");

  // center
  const toolbarText = $("#productsToolbarText");
  const toolbarIcon = $("#productsToolbarIcon");
  const productsToolbarControls = $("#productsToolbarControls");
  const productsSearchWrap = $("#productsSearchWrap");
  const productsSearchInput = $("#productsSearchInput");
  const productsSearchToggle = $("#productsSearchToggle");
  const productsFilterWrap = $("#productsFilterWrap");
  const productsFilterToggle = $("#productsFilterToggle");
  const productsFilterDropdown = $("#productsFilterDropdown");
  const addMainBtn = $("#addMainBtn");
  const addMainWrapper = $("#addMainWrapper");
  const addMainDropdown = $("#addMainDropdown");
  const productsList = $("#productsList");
  const productsEmptyHint = $("#productsEmptyHint");
  const productsScrollEl = productsList ? productsList.closest(".panel-body") : null;
  const productsBulkFooter = $("#productsBulkFooter");
  const productsBulkSelectedCount = $("#productsBulkSelectedCount");
  const productsBulkToggleAllInput = $("#productsBulkToggleAllInput");
  const productsBulkActions = $("#productsBulkActions");
  const productsBulkCancelBtn = $("#productsBulkCancelBtn");
  const productsBulkApplyBtn = $("#productsBulkApplyBtn");
  const productsBulkActionsSelectedCount = $("#productsBulkActionsSelectedCount");
  const productsBulkMenuWrap = $("#productsBulkMenuWrap");
  const productsBulkMenuToggleBtn = $("#productsBulkMenuToggleBtn");
  const productsBulkMenu = $("#productsBulkMenu");
  const categoriesMainList = $("#categoriesMainList");
  const categoriesEmptyHint = $("#categoriesEmptyHint");
  const optionsGroupsList = $("#optionsGroupsList");
  const optionsGroupsEmpty = $("#optionsGroupsEmpty");
  const variantsGroupsList = $("#variantsGroupsList");
  const variantsGroupsEmpty = $("#variantsGroupsEmpty");
  const autoAddGroupsList = $("#autoAddGroupsList");
  const autoAddGroupsEmpty = $("#autoAddGroupsEmpty");
  const unitsListEl = $("#unitsList");
  const unitsEmptyHint = $("#unitsEmptyHint");
  
  // Unit info panel elements
  const unitInfo = $("#unitInfo");
  const comboEmpty = $("#comboEmpty");
  const comboInfo = $("#comboInfo");
  const comboBlockForm = $("#comboBlockForm");
  const comboBlockTitleInput = $("#comboBlockTitle");
  const comboBlockSortOrderInput = $("#comboBlockSortOrder");
  const comboBlockMinSelectInput = $("#comboBlockMinSelect");
  const comboBlockMaxSelectInput = $("#comboBlockMaxSelect");
  const comboBlocksList = $("#comboBlocksList");
  const comboBlocksEmptyHint = $("#comboBlocksEmptyHint");

  // stock
  const stockInList = $("#stockInList");
  const stockInEmpty = $("#stockInEmpty");
  const stockOutList = $("#stockOutList");
  const stockOutEmpty = $("#stockOutEmpty");
  const stockMovementsList = $("#stockMovementsList");
  const stockMovementsEmpty = $("#stockMovementsEmpty");
  const stockDocEmpty = $("#stockDocEmpty");
  const comboBlockProductsList = $("#comboBlockProductsList");
  const comboBlockProductsAddBtn = $("#comboBlockProductsAddBtn");
  const comboBlockLevelGroup = $("#comboBlockLevelGroup");
  const comboBlockLevelPicker = $("#comboBlockLevelPicker");
  const comboBlockPickerTabs = $("#comboBlockPickerTabs");
  const comboBlockPickerSearch = $("#comboBlockPickerSearch");
  const comboBlockPickerSelectAll = $("#comboBlockPickerSelectAll");
  const comboBlockPickerSelectAllLabel = $("#comboBlockPickerSelectAllLabel");
  const comboBlockPickerList = $("#comboBlockPickerList");
  const unitLevelGroup = $("#unitLevelGroup");
  const unitLevelPicker = $("#unitLevelPicker");
  const unitForm = $("#unitForm");
  const unitTitleInput = $("#unitTitle");
  const unitShortTitleInput = $("#unitShortTitle");
  const unitIsActiveInput = $("#unitIsActive");
  const unitConversionsList = $("#unitConversionsList");
  const unitConversionsAddBtn = $("#unitConversionsAddBtn");
  const unitPickerSearch = $("#unitPickerSearch");
  const unitPickerList = $("#unitPickerList");

  // right info
  const productEmpty = $("#productEmpty");
  const productInfo = $("#productInfo");
  const categoryEmpty = $("#categoryEmpty");
  const categoryInfo = $("#categoryInfo");
  const optionEmpty = $("#optionEmpty");
  const autoAddEmpty = $("#autoAddEmpty");
  const optionGroupInfo = $("#optionGroupInfo");
  const autoAddGroupInfo = $("#autoAddGroupInfo");
  const autoAddGroupForm = $("#autoAddGroupForm");
  const autoAddGroupTitleInput = $("#autoAddGroupTitle");
  const autoAddGroupDescInput = $("#autoAddGroupDesc");
  const autoAddGroupSortInput = $("#autoAddGroupSort");
  const autoAddGroupIsActiveInput = $("#autoAddGroupIsActive");
  const autoAddMinAmountInput = $("#autoAddMinAmount");
  const autoAddMaxAmountInput = $("#autoAddMaxAmount");
  const autoAddIncludeAutoTotalInput = $("#autoAddIncludeAutoTotal");
  const autoAddMaxItemsQtyInput = $("#autoAddMaxItemsQty");
  const autoAddAllowCustomerQtyInput = $("#autoAddAllowCustomerQty");
  const autoAddAllowCustomerRemoveInput = $("#autoAddAllowCustomerRemove");
  const autoAddLevelGroup = $("#autoAddLevelGroup");
  const autoAddLevelPicker = $("#autoAddLevelPicker");
  const autoAddPickerTabs = $("#autoAddPickerTabs");
  const autoAddPickerSearch = $("#autoAddPickerSearch");
  const autoAddPickerSelectAll = $("#autoAddPickerSelectAll");
  const autoAddPickerSelectAllLabel = $("#autoAddPickerSelectAllLabel");
  const autoAddPickerList = $("#autoAddPickerList");
  const autoAddItemsList = $("#autoAddItemsList");
  const autoAddItemsAddBtn = $("#autoAddItemsAddBtn");
  const variantGroupInfo = $("#variantGroupInfo");
  const variantLevelGroup = $("#variantLevelGroup");
  const variantGroupForm = $("#variantGroupForm");
  const variantGroupTitleInput = $("#variantGroupTitle");
  const variantGroupUnitIdInput = $("#variantGroupUnitId");
  const variantGroupDefaultValueIndexInput = $("#variantGroupDefaultValueIndex");
  const variantGroupSortInput = $("#variantGroupSortOrder");
  const variantItemsList = $("#variantItemsList");
  const variantItemsAddBtn = $("#variantItemsAddBtn");
  const variantAssignmentsList = $("#variantAssignmentsList");
  const variantAssignmentsAddBtn = $("#variantAssignmentsAddBtn");
  const productInfoHeader = $("#productInfoHeader");
  const productHeaderActions = $("#productHeaderActions");
  const productMoreBtn = $("#productMoreBtn");
  const productDropdown = $("#productDropdown");
  const optionHeaderActions = $("#optionHeaderActions");
  const optionHeaderBackBtn = $("#optionHeaderBackBtn");
  const optionHeaderPrimaryBtn = $("#optionHeaderPrimaryBtn");
  const optionHeaderDeleteBtn = $("#optionHeaderDeleteBtn");
  const optionHeaderCloseBtn = $("#optionHeaderCloseBtn");
  const closeProductInfoBtn = $("#closeProductInfoBtn");
  const editProductBtn = $("#editProductBtn");
  const productTabsHeader = $("#productTabsHeader");
  const productTabs = $("#productTabs");

  const productTitle = $("#productTitle");
  const productSku = $("#productSku");
  const productPrice = $("#productPrice");
  const productOldPrice = $("#productOldPrice");
  const productCostPrice = $("#productCostPrice");
  const productBaseUnit = $("#productBaseUnit");
  const productBaseQty = $("#productBaseQty");
  const productStatus = $("#productStatus");
  const productDescShort = $("#productDescShort");
  const productDesc = $("#productDesc");

  const infoCategoryChips = $("#infoCategoryChips");
  const infoMainPhoto = $("#infoMainPhoto");
  const infoPhotoPlaceholder = $("#infoPhotoPlaceholder");
  const infoPhotoThumbs = $("#infoPhotoThumbs");

  const categoryIconImg = $("#categoryIconImg");
  const categoryIconPlaceholder = $("#categoryIconPlaceholder");
  const categoryStatus = $("#categoryStatus");
  const categoryVisibility = $("#categoryVisibility");
  const categoryCartVisibility = $("#categoryCartVisibility");

  const optionLevelGroup = $("#optionLevelGroup");
  const optionLevelPicker = $("#optionLevelPicker");
  const optionGroupForm = $("#optionGroupForm");
  const optionGroupTitleInput = $("#optionGroupTitle");
  const optionGroupSelectionInput = $("#optionGroupSelectionType");
  const optionGroupLimitsRow = $("#optionGroupLimitsRow");
  const optionGroupMinInput = $("#optionGroupMinSelect");
  const optionGroupMaxInput = $("#optionGroupMaxSelect");
  const optionGroupSortInput = $("#optionGroupSortOrder");
  const optionGroupOutOfStockActionInput = $("#optionGroupOutOfStockAction");
  const optionItemsList = $("#optionItemsList");
  const optionItemsCount = $("#optionItemsCount");
  const optionItemsAddBtn = $("#optionItemsAddBtn");
  const optionAssignmentsList = $("#optionAssignmentsList");
  const optionAssignmentsCount = $("#optionAssignmentsCount");
  const optionAssignmentsAddBtn = $("#optionAssignmentsAddBtn");
  const optionPickerTabs = $("#optionPickerTabs");
  const optionPickerSearch = $("#optionPickerSearch");
  const optionPickerSelectAll = $("#optionPickerSelectAll");
  const optionPickerSelectAllLabel = $("#optionPickerSelectAllLabel");
  const optionPickerList = $("#optionPickerList");
  const productOptionsAccordion = $("#productOptionsAccordion");
  const productIngredientsAccordion = $("#productIngredientsAccordion");

  // sheet (mobile)
  const sheet = $("#productSheet");
  const sheetBackdrop = $("#productSheetBackdrop");
  const sheetHost = $("#productSheetHost");
  const sheetCloseBtn = $("#productSheetCloseBtn");
  const detailsDesktopHost = $("#productInfoPanel .panel-body");
  const productInfoBody = $("#productInfoBody");

  // Navigation stack for right panel
  const navigationStack = [];
  let currentNavigationState = null;
  let suspendedProductNavigation = null;
  let productRowsDragSuppressClickUntil = 0;
  const productRowsDragState = {
    armed: false,
    active: false,
    enabled: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    currentY: 0,
    anchorRow: null,
    dragRows: [],
    placeholder: null,
    ghost: null,
    scrollRAF: 0,
    moveHandler: null,
    upHandler: null,
    saving: false,
  };

  // Navigation functions
  function pushNavigationState(state) {
    if (currentNavigationState) {
      navigationStack.push(currentNavigationState);
    }
    currentNavigationState = state;
    showNavigationState(state);
  }

  function popNavigationState() {
    // Call onClose for current state if exists
    if (currentNavigationState?.onClose) {
      currentNavigationState.onClose();
    }
    
    // Return to previous state (pop from stack)
    if (navigationStack.length > 0) {
      currentNavigationState = navigationStack.pop();
      showNavigationState(currentNavigationState);
    } else {
      // No more states in stack - return to empty
      currentNavigationState = null;
      showDetailsEmpty();
    }
  }
  
  function clearNavigationStack() {
    // Completely clear navigation stack and return to empty state; remove only dynamic editor, keep static panels (comboSetInfo etc.)
    navigationStack.length = 0;
    currentNavigationState = null;
    if (productInfoBody) {
      const wrapper = productInfoBody.querySelector(".product-editor-wrapper");
      if (wrapper) wrapper.remove();
    }
    const footer = $("#productInfoFooter");
    if (footer) {
      footer.classList.add("hidden");
    }
    showDetailsEmpty();
  }

  function showNavigationState(state) {
    if (!state) {
      showDetailsEmpty();
      return;
    }

    // Hide all default content
    if (productInfo) productInfo.classList.add("hidden");
    if (categoryInfo) categoryInfo.classList.add("hidden");
    if (optionGroupInfo) optionGroupInfo.classList.add("hidden");
    if (variantGroupInfo) variantGroupInfo.classList.add("hidden");
    if (unitInfo) unitInfo.classList.add("hidden");
    if (productEmpty) productEmpty.classList.add("hidden");
    if (categoryEmpty) categoryEmpty.classList.add("hidden");
    if (optionEmpty) optionEmpty.classList.add("hidden");
    
    // For product/category edit: hide combo-set and other panels; show editor without destroying static content (avoids overlap when switching tabs)
    if (productInfoBody && (state.type === "product-edit" || state.type === "product-view" || state.type === "category-edit" || state.type === "category-view")) {
      const comboSetInfo = document.getElementById("comboSetInfo");
      if (comboSetInfo) comboSetInfo.classList.add("hidden");
      const existingEditors = productInfoBody.querySelectorAll(".product-editor-wrapper");
      existingEditors.forEach((editor) => editor.classList.add("hidden"));
    } else if (productInfoBody && (state.type === "option-picker" || state.type === "ingredient-picker" || state.type === "option-edit")) {
      productInfoBody.innerHTML = "";
    }

    // Show/hide header based on state
    if (productInfoHeader) {
      // Hide main header when picker is open
      if (state.type === "option-picker" || state.type === "ingredient-picker") {
        productInfoHeader.classList.add("hidden");
      } else {
        productInfoHeader.classList.remove("hidden");
        const headerLeft = productInfoHeader.querySelector(".product-info-header-left");
        const actions = productInfoHeader.querySelector(".product-info-header-actions");
        
        // Always show title and SKU
        if (headerLeft) headerLeft.classList.remove("hidden");
      
        // Always show fixed buttons (three dots, edit/save, close)
        if (actions && state.type !== "option-edit") {
          const defaultEditBtn = actions.querySelector("#editProductBtn");
          const defaultCloseBtn = actions.querySelector("#closeProductInfoBtn");
          const moreBtn = actions.querySelector("#productMoreBtn");
          
          // Always show all buttons
          if (defaultEditBtn) defaultEditBtn.classList.remove("hidden");
          if (defaultCloseBtn) defaultCloseBtn.classList.remove("hidden");
          if (moreBtn) moreBtn.classList.remove("hidden");
          
          // Update edit button icon based on state
          if (defaultEditBtn) {
            if (state.type === "product-edit" || state.type === "category-edit") {
              // In edit mode - show checkmark (save)
              defaultEditBtn.innerHTML = '<i class="fas fa-check"></i>';
              defaultEditBtn.title = "Сохранить";
              defaultEditBtn.setAttribute("aria-label", "Сохранить");
            } else {
              // In view mode - show pencil (edit)
              defaultEditBtn.innerHTML = '<i class="fas fa-pen"></i>';
              defaultEditBtn.title = "Редактировать";
              defaultEditBtn.setAttribute("aria-label", "Редактировать");
            }
          }
          
          // Update close button behavior based on state
          if (defaultCloseBtn) {
            if (state.type === "product-edit" || state.type === "category-edit") {
              // In edit mode - cancel changes
              defaultCloseBtn.title = "Отменить";
              defaultCloseBtn.setAttribute("aria-label", "Отменить");
            } else {
              // In view mode - close panel
              defaultCloseBtn.title = "Закрыть";
              defaultCloseBtn.setAttribute("aria-label", "Закрыть");
            }
          }
          
          // Restore title and SKU if returning to product-edit or category-edit
          if (state.type === "product-edit" && state.savedTitle && state.savedSku) {
            if (productTitle) productTitle.textContent = state.savedTitle;
            if (productSku) productSku.textContent = state.savedSku;
          }
          if (state.type === "category-edit" && state.savedTitle && state.savedSku) {
            if (productTitle) productTitle.textContent = state.savedTitle;
            if (productSku) productSku.textContent = state.savedSku;
          }
        }
      }
    }

    // Show appropriate content based on state type
    if (state.type === "product-edit" || state.type === "product-view" || state.type === "category-edit" || state.type === "category-view") {
      if (state.content) {
        // Ensure productInfoBody exists; do not clear body so combo-set tab can switch back without losing DOM
        const body = productInfoBody || document.querySelector("#productInfoBody");
        if (body) {
          if (state.content.parentNode === body) {
            state.content.classList.remove("hidden");
          } else {
            body.appendChild(state.content);
          }
          body.classList.remove("hidden");
          // Make sure body is visible
          if (body.parentElement) {
            body.parentElement.classList.remove("hidden");
          }
        } else {
          console.error("productInfoBody not found");
        }
      } else {
        console.error("state.content is missing for " + state.type);
      }
      // Show footer in edit mode
      if (state.type === "product-edit") {
        showProductFooterEdit();
      } else {
        showProductFooterView();
      }
    } else if (state.type === "option-edit") {
      showOptionGroupDetails(state.optionGroupDetails, { mode: state.optionPanel.mode || "view" });
    } else if (state.type === "unit-edit" || state.type === "unit-view") {
      if (state.unitDetails) {
        showUnitDetails(state.unitDetails, { mode: state.unitPanel.mode || "view" });
      }
    } else if (state.type === "option-picker") {
      if (state.content) {
        productInfoBody.innerHTML = "";
        productInfoBody.appendChild(state.content);
      }
    } else if (state.type === "ingredient-picker") {
      if (state.content) {
        productInfoBody.innerHTML = "";
        productInfoBody.appendChild(state.content);
      }
    } else {
      showDetailsEmpty();
    }
  }

  function hasProductEditInNavigation() {
    if (currentNavigationState?.type === "product-edit") return true;
    return navigationStack.some((s) => s.type === "product-edit");
  }

  function suspendProductNavigationIfNeeded() {
    if (!hasProductEditInNavigation()) return false;
    const stackSnapshot = navigationStack.slice();
    const fallbackProductId =
      currentNavigationState?.product?.id ||
      stackSnapshot.find((s) => s.type === "product-edit")?.product?.id ||
      null;
    suspendedProductNavigation = {
      current: currentNavigationState,
      stack: stackSnapshot,
      selectedProductId: state.selectedProductId || fallbackProductId,
    };
    return true;
  }

  function restoreSuspendedProductNavigation() {
    if (!suspendedProductNavigation) return false;
    const { current, stack, selectedProductId } = suspendedProductNavigation;
    suspendedProductNavigation = null;

    navigationStack.length = 0;
    stack.forEach((item) => navigationStack.push(item));
    currentNavigationState = current;

    if (selectedProductId != null) {
      state.selectedProductId = selectedProductId;
      if (productsList) {
        $$(".order-row", productsList).forEach((row) => {
          row.classList.toggle("is-active", Number(row.dataset.id) === Number(selectedProductId));
        });
      }
    }

    if (currentNavigationState) {
      showNavigationState(currentNavigationState);
    } else {
      showDetailsEmpty();
    }
    return true;
  }

  // Store editing states for multiple products
  const editingProducts = new Map(); // Map<productId, { navigationState, draft, ... }>
  const editingCategories = new Map(); // Map<categoryId, { navigationState }>
  const categoryViewStates = new Map(); // Map<categoryId, { wrapper, form, ... }>
  const editingOptions = new Map(); // Map<optionGroupId, { mode, optionDraft, snapshotData }>
  const editingVariants = new Map(); // Map<variantGroupId, { mode, variantDraft, snapshotData }>
  const editingCombos = new Map(); // Map<comboTabId, { mode, blockDraft, products }>
  const editingAutoAdds = new Map(); // Map<autoAddGroupId, { mode, autoAddDraft, snapshotData }>

  function getDefaultProductsBulkActions() {
    return {
      activate: false,
      deactivate: false,
      show: false,
      hide: false,
      infinite_stock: false,
      zero_stock: false,
      fulfillment_stock: false,
      fulfillment_made_to_order: false,
    };
  }

  const state = {
    mode: "products", // products | categories | ...
    categories: [],
    products: [],
    productsOffset: 0,
    productsTotal: 0,
    productsHasMore: true,
    productsLoading: false,
    productsByCategoryCache: new Map(),
    productDetailsCache: new Map(),
    productViewCache: new Map(),
    comboSetDetailsCache: new Map(),
    comboRowPhotosCache: new Map(),
    currentCategoryId: null,
    allCategoryId: null,
    selectedProductId: null,
    selectedProductIds: new Set(),
    productsBulkActions: getDefaultProductsBulkActions(),
    productsBulkApplying: false,
    productRowVariantsExpanded: new Set(),
    productRowVariantsCache: new Map(),
    productRowVariantsLoading: new Set(),
    productOpenInflight: new Map(),
    productsToolbar: (() => {
      const stored = loadStoredProductsToolbarFilters();
      return {
        products: { query: "", searchOpen: false, filters: stored.products },
        options: { query: "", searchOpen: false, filters: stored.options },
        variants: { query: "", searchOpen: false, filters: stored.variants },
      };
    })(),
    productsToolbarFilterOpen: false,
    selectedCategoryId: null,
    selectedProductCategories: [], // full objects
    optionGroups: [],
    variantGroups: [],
    autoAddGroups: [],
    autoAddItems: [],
    selectedAutoAddGroupId: null,
    selectedOptionGroupId: null,
    selectedVariantGroupId: null,
    autoAddGroupDetails: null,
    optionGroupDetails: null,
    variantGroupDetails: null,
    optionGroupCache: new Map(),
    variantGroupCache: new Map(),
    selectedProductOptionAssignments: [],
    catalogCategories: [],
    units: [],
    unitConversions: [],
    optionPanel: {
      level: "empty", // empty | group | picker
      mode: "view", // view | edit | create
      pickerMode: "items", // items | assignments
      pickerSelection: new Set(),
      pickerCategoryId: null,
      pickerProducts: [],
      pickerQuery: "",
      pickerTabsScrollLeft: 0,
      pickerInitialSelection: new Set(),
      returnTo: null,
      formSnapshot: null,
      snapshotMode: null,
      snapshotData: null,
      itemsDirty: false,
      activeToggleBusy: false,
    },
    optionDraft: null,
    autoAddPanel: {
      level: "empty",
      mode: "view", // view | edit | create
      itemsDirty: false,
      tabKey: null,
      snapshotData: null,
      pickerSelection: new Set(),
      pickerCategoryId: null,
      pickerProducts: [],
      pickerQuery: "",
      pickerTabsScrollLeft: 0,
      pickerInitialSelection: new Set(),
    },
    autoAddDraft: null,
    variantPanel: {
      level: "empty", // empty | group | picker
      mode: "view", // view | edit | create
      pickerMode: "assignments",
      pickerSelection: new Set(),
      pickerCategoryId: null,
      pickerProducts: [],
      pickerQuery: "",
      pickerTabsScrollLeft: 0,
      pickerInitialSelection: new Set(),
      returnTo: null,
      formSnapshot: null,
      snapshotMode: null,
      snapshotData: null,
      itemsDirty: false,
      activeToggleBusy: false,
      tabKey: null,
    },
    variantDraft: null,
    selectedUnitId: null,
    unitDetails: null,
      unitPanel: {
      level: "empty", // empty | group | picker
      mode: "view", // view | edit | create
      pickerMode: "conversion",
      pickerSelection: null, // selected unit id for conversion
      pickerQuery: "",
      returnTo: null,
      formSnapshot: null,
      snapshotMode: null,
      snapshotData: null,
      itemsDirty: false,
      tabKey: null,
    },
    unitDraft: null,
    comboPanel: {
      level: "empty", // empty | group | picker
      mode: "view", // view | edit | create
      tabKey: null,
      pickerCategoryId: null,
      pickerQuery: "",
      pickerSelection: new Set(),
      pickerTabsScrollLeft: 0,
    },
    comboBlockDraft: null, // { title, sort_order }
    comboBlockProducts: [], // [{ product_id, name?, sort_order, is_default }]
    comboBlocks: [], // list of blocks for center
    selectedComboBlockId: null,
    stockDocuments: [],
    stockDocDetail: null, // текущий открытый документ с items
    comboSetPanel: {
      mode: "create", // create | view | edit
      comboId: null,
      blocks: [], // [{ block_id, block_title, sort_order }] — один блок можно добавить несколько раз
      blockPickerOpen: false,
      blockPickerSelection: new Set(),
      photos: [], // [{ kind: 'url', url }] — как у товара, image_url = photos[0]?.url
      activePhotoIdx: -1,
      categoryIds: [], // id категорий (как у товара), category_code = первый по code
    },
  };

  let variantPickerSavedFooterState = null;
  let variantPickerSavedHandlers = null;
  let optionPanelPickerSavedFooterState = null;
  let optionPanelPickerSavedHandlers = null;
  let autoAddPickerSavedFooterState = null;
  let autoAddPickerSavedHandlers = null;
  let unitPickerSavedFooterState = null;
  let unitPickerSavedHandlers = null;
  let comboBlockPickerSavedFooterState = null;
  let comboBlockPickerSavedHandlers = null;
  const autoAddSearchTimers = new Map();
  const PRODUCTS_PAGE_LIMIT = 80;
  const PRODUCTS_SCROLL_THRESHOLD_PX = 220;
  let productsRequestToken = 0;
  let productsToolbarSearchTimer = null;

  function schedulePersistProductsCache(delay = 180) {
    return;
  }

  function normalizeCategoryCacheKey(categoryId) {
    const id = Number(categoryId || 0);
    const safeId = Number.isFinite(id) && id > 0 ? String(id) : "0";
    const query = normalizeProductsToolbarQuery(state.productsToolbar?.products?.query || "").toLowerCase();
    return `${safeId}::${query}`;
  }

  function getCachedCategoryProducts(categoryId) {
    if (!(state.productsByCategoryCache instanceof Map)) {
      state.productsByCategoryCache = new Map();
      return null;
    }
    const key = normalizeCategoryCacheKey(categoryId);
    const cached = state.productsByCategoryCache.get(key);
    if (!cached || typeof cached !== "object") return null;
    return {
      products: Array.isArray(cached.products) ? cached.products : [],
      productsOffset: Math.max(0, Number(cached.productsOffset || 0)),
      productsTotal: Math.max(0, Number(cached.productsTotal || 0)),
      productsHasMore: Boolean(cached.productsHasMore),
      combosInCategory: Array.isArray(cached.combosInCategory) ? cached.combosInCategory : [],
    };
  }

  function setCachedCategoryProducts(categoryId, payload) {
    if (!(state.productsByCategoryCache instanceof Map)) {
      state.productsByCategoryCache = new Map();
    }
    const key = normalizeCategoryCacheKey(categoryId);
    state.productsByCategoryCache.set(key, {
      products: Array.isArray(payload?.products) ? payload.products : [],
      productsOffset: Math.max(0, Number(payload?.productsOffset || 0)),
      productsTotal: Math.max(0, Number(payload?.productsTotal || 0)),
      productsHasMore: Boolean(payload?.productsHasMore),
      combosInCategory: Array.isArray(payload?.combosInCategory) ? payload.combosInCategory : [],
      ts: Date.now(),
    });
  }

  function getProductsToolbarState(mode = state.mode) {
    if (!PRODUCTS_TOOLBAR_MODE_KEYS.includes(mode)) return null;
    return state.productsToolbar?.[mode] || null;
  }

  function persistProductsToolbarFilters() {
    try {
      const payload = {};
      PRODUCTS_TOOLBAR_MODE_KEYS.forEach((mode) => {
        payload[mode] = normalizeProductsToolbarFilters(mode, state.productsToolbar?.[mode]?.filters);
      });
      localStorage.setItem(PRODUCTS_TOOLBAR_FILTERS_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function isProductsToolbarModeVisible(mode = state.mode) {
    return PRODUCTS_TOOLBAR_MODE_KEYS.includes(mode);
  }

  function getProductsToolbarSearchPlaceholder(mode = state.mode) {
    if (mode === "products") return "Название или SKU...";
    return "Поиск по названию...";
  }

  function isFiniteProductStockValue(product) {
    return product?.stock_qty != null && Number.isFinite(Number(product.stock_qty));
  }

  function filterProductsCollection(items) {
    const filters = normalizeProductsToolbarFilters("products", state.productsToolbar?.products?.filters);
    return (Array.isArray(items) ? items : []).filter((product) => {
      const isActive = Number(product?.is_active || 0) === 1;
      const isVisible = Number(product?.site_visibility || 0) === 1;
      const activeAllowed = isActive ? filters.active : filters.inactive;
      const visibilityAllowed = isVisible ? filters.visible : filters.hidden;
      if (!activeAllowed || !visibilityAllowed) return false;

      const fulfillmentMode = normalizeProductFulfillmentMode(product?.fulfillment_mode);
      const fulfillmentAllowed = fulfillmentMode === "made_to_order"
        ? filters.fulfillment_made_to_order
        : filters.fulfillment_stock;
      if (!fulfillmentAllowed) return false;

      const hasFiniteStock = isFiniteProductStockValue(product);
      const isEnded = hasFiniteStock && Number(product.stock_qty) <= 0;
      return isEnded ? filters.ended : filters.in_stock;
    });
  }

  function getFilteredOptionGroups() {
    const toolbarState = getProductsToolbarState("options");
    const query = normalizeProductsToolbarQuery(toolbarState?.query || "").toLowerCase();
    const filters = normalizeProductsToolbarFilters("options", toolbarState?.filters);
    return (Array.isArray(state.optionGroups) ? state.optionGroups : []).filter((group) => {
      const title = String(group?.title || "").toLowerCase();
      if (query && !title.includes(query)) return false;
      return Number(group?.is_active || 0) === 1 ? filters.active : filters.inactive;
    });
  }

  function getFilteredVariantGroups() {
    const toolbarState = getProductsToolbarState("variants");
    const query = normalizeProductsToolbarQuery(toolbarState?.query || "").toLowerCase();
    const filters = normalizeProductsToolbarFilters("variants", toolbarState?.filters);
    return (Array.isArray(state.variantGroups) ? state.variantGroups : []).filter((group) => {
      const title = String(group?.title || "").toLowerCase();
      if (query && !title.includes(query)) return false;
      return Number(group?.is_active || 0) === 1 ? filters.active : filters.inactive;
    });
  }

  function shouldHideProductCombos() {
    return normalizeProductsToolbarQuery(state.productsToolbar?.products?.query || "").length > 0;
  }

  function getCachedProductDetails(productId) {
    if (!(state.productDetailsCache instanceof Map)) {
      state.productDetailsCache = new Map();
      return null;
    }
    const id = Number(productId || 0);
    if (!(id > 0)) return null;
    const cached = state.productDetailsCache.get(id);
    if (!cached || typeof cached !== "object") return null;
    return {
      product: cached.product && typeof cached.product === "object" ? cached.product : null,
      categories: Array.isArray(cached.categories) ? cached.categories : [],
      optionAssignments: Array.isArray(cached.optionAssignments) ? cached.optionAssignments : [],
      ingredients: Array.isArray(cached.ingredients) ? cached.ingredients : null,
    };
  }

  function setCachedProductDetails(productId, payload) {
    if (!(state.productDetailsCache instanceof Map)) {
      state.productDetailsCache = new Map();
    }
    const id = Number(productId || 0);
    if (!(id > 0)) return;
    const existing = state.productDetailsCache.get(id) || {};
    state.productDetailsCache.set(id, {
      product: payload?.product && typeof payload.product === "object" ? payload.product : (existing.product || null),
      categories: Array.isArray(payload?.categories) ? payload.categories : (Array.isArray(existing.categories) ? existing.categories : []),
      optionAssignments: Array.isArray(payload?.optionAssignments) ? payload.optionAssignments : (Array.isArray(existing.optionAssignments) ? existing.optionAssignments : []),
      ingredients: Array.isArray(payload?.ingredients) ? payload.ingredients : (Array.isArray(existing.ingredients) ? existing.ingredients : null),
      ts: Date.now(),
    });
  }

  function clearCachedProductDetails(productId) {
    const id = Number(productId || 0);
    if (!(id > 0)) return;
    if (state.productDetailsCache instanceof Map) {
      state.productDetailsCache.delete(id);
    }
  }

  function getCachedProductView(productId) {
    if (!(state.productViewCache instanceof Map)) {
      state.productViewCache = new Map();
      return null;
    }
    const id = Number(productId || 0);
    if (!(id > 0)) return null;
    const cached = state.productViewCache.get(id);
    return cached instanceof HTMLElement ? cached : null;
  }

  function setCachedProductView(productId, element) {
    if (!(state.productViewCache instanceof Map)) {
      state.productViewCache = new Map();
    }
    const id = Number(productId || 0);
    if (!(id > 0)) return;
    if (!(element instanceof HTMLElement)) return;
    state.productViewCache.set(id, element);
  }

  function clearCachedProductView(productId) {
    if (!(state.productViewCache instanceof Map)) {
      state.productViewCache = new Map();
      return;
    }
    const id = Number(productId || 0);
    if (id > 0) {
      state.productViewCache.delete(id);
      return;
    }
    state.productViewCache.clear();
  }

  function getCachedComboSetDetails(comboId) {
    if (!(state.comboSetDetailsCache instanceof Map)) {
      state.comboSetDetailsCache = new Map();
      return null;
    }
    const id = Number(comboId || 0);
    if (!(id > 0)) return null;
    const cached = state.comboSetDetailsCache.get(id);
    if (!cached || typeof cached !== "object") return null;
    return {
      combo: cached.combo && typeof cached.combo === "object" ? cached.combo : null,
      blocks: Array.isArray(cached.blocks) ? cached.blocks : [],
    };
  }

  function setCachedComboSetDetails(comboId, payload) {
    if (!(state.comboSetDetailsCache instanceof Map)) {
      state.comboSetDetailsCache = new Map();
    }
    const id = Number(comboId || 0);
    if (!(id > 0)) return;
    state.comboSetDetailsCache.set(id, {
      combo: payload?.combo && typeof payload.combo === "object" ? payload.combo : null,
      blocks: Array.isArray(payload?.blocks) ? payload.blocks : [],
      ts: Date.now(),
    });
  }

  function clearCachedComboSetDetails(comboId) {
    if (!(state.comboSetDetailsCache instanceof Map)) {
      state.comboSetDetailsCache = new Map();
      return;
    }
    const id = Number(comboId || 0);
    if (id > 0) {
      state.comboSetDetailsCache.delete(id);
      return;
    }
    state.comboSetDetailsCache.clear();
  }

  function getCachedComboRowPhotos(comboId) {
    if (!(state.comboRowPhotosCache instanceof Map)) {
      state.comboRowPhotosCache = new Map();
      return null;
    }
    const id = Number(comboId || 0);
    if (!(id > 0)) return null;
    const cached = state.comboRowPhotosCache.get(id);
    return Array.isArray(cached) ? cached.slice(0, 4) : null;
  }

  function setCachedComboRowPhotos(comboId, urls) {
    if (!(state.comboRowPhotosCache instanceof Map)) {
      state.comboRowPhotosCache = new Map();
    }
    const id = Number(comboId || 0);
    if (!(id > 0)) return;
    const normalized = Array(4).fill(null).map((_, index) => {
      const value = Array.isArray(urls) ? urls[index] : null;
      const text = value == null ? "" : String(value).trim();
      return text || null;
    });
    state.comboRowPhotosCache.set(id, normalized);
  }

  function clearCachedComboRowPhotos(comboId) {
    if (!(state.comboRowPhotosCache instanceof Map)) {
      state.comboRowPhotosCache = new Map();
      return;
    }
    const id = Number(comboId || 0);
    if (id > 0) {
      state.comboRowPhotosCache.delete(id);
      return;
    }
    state.comboRowPhotosCache.clear();
  }

  // ---------------- API ----------------

  async function api(url, opts) {
    // Получаем токен и store_id из localStorage
    const token = localStorage.getItem('authToken');
    const storeId = localStorage.getItem('activeStoreId') || '1';
    const headers = {
      "Content-Type": "application/json",
      "x-tenant-id": String(TENANT_ID),
      "x-store-id": storeId,
      ...(opts?.headers || {}),
    };

    // Добавляем токен авторизации, если он есть
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const res = await fetch(url, {
      headers,
      ...opts,
    });
    
    // Если 401 - перенаправляем на логин
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
      throw new Error('UNAUTHORIZED');
    }
    
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || `HTTP_${res.status}`);
    }
    return data;
  }

  async function apiUploadImages(files) {
    const token = localStorage.getItem('authToken');
    const fd = new FormData();
    files.forEach((f) => fd.append("images", f));
    const headers = { "x-tenant-id": String(TENANT_ID) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch("/api/upload/product-images", {
      method: "POST",
      headers,
      body: fd
    });
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
      throw new Error('UNAUTHORIZED');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `HTTP_${res.status}`);
    return { urls: data.urls || [], sizes: data.sizes || [] };
  }

  async function apiUploadCategoryIcon(file) {
    const token = localStorage.getItem('authToken');
    const fd = new FormData();
    fd.append("icon", file);
    const headers = { "x-tenant-id": String(TENANT_ID) };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const res = await fetch("/api/upload/category-icon", {
      method: "POST",
      headers,
      body: fd,
    });
    if (res.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
      throw new Error('UNAUTHORIZED');
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || data.ok === false) throw new Error((data && data.error) || `HTTP_${res.status}`);
    return data.url || "";
  }

  async function apiGetOptionGroups() {
    return api("/api/admin/options/groups");
  }

  async function apiGetOptionGroup(id, { productId = null } = {}) {
    const params = new URLSearchParams();
    if (Number.isFinite(Number(productId)) && Number(productId) > 0) {
      params.set("product_id", String(Number(productId)));
    }
    const qs = params.toString();
    return api(`/api/admin/options/groups/${id}${qs ? `?${qs}` : ""}`);
  }

  async function apiCreateOptionGroup(payload) {
    return api("/api/admin/options/group-bundle", { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiPatchOptionGroup(id, payload) {
    return api(`/api/admin/options/groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteOptionGroup(id) {
    return api(`/api/admin/options/groups/${id}`, { method: "DELETE" });
  }

  async function apiAddGroupItems(groupId, items) {
    return api(`/api/admin/options/groups/${groupId}/items`, {
      method: "POST",
      body: JSON.stringify({ items }),
    });
  }

  async function apiAddGroupAssignments(groupId, assignments) {
    const hasObjects = Array.isArray(assignments) && assignments.some((a) => typeof a === "object");
    const body = hasObjects ? { assignments } : { assign_ids: assignments };
    return api(`/api/admin/options/groups/${groupId}/assignments`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async function apiPatchItem(id, payload) {
    return api(`/api/admin/options/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteItem(id) {
    return api(`/api/admin/options/items/${id}`, { method: "DELETE" });
  }

  async function apiPatchAssignment(id, payload) {
    return api(`/api/admin/options/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiDeleteAssignment(id) {
    return api(`/api/admin/options/assignments/${id}`, { method: "DELETE" });
  }

  // Variant API functions
  async function apiGetVariantGroups() {
    return api("/api/admin/variants/groups");
  }

  async function apiGetVariantGroup(id, { productId = null } = {}) {
    const params = new URLSearchParams();
    if (Number.isFinite(Number(productId)) && Number(productId) > 0) {
      params.set("product_id", String(Number(productId)));
    }
    const qs = params.toString();
    return api(`/api/admin/variants/groups/${id}${qs ? `?${qs}` : ""}`);
  }

  async function apiCreateVariantGroup(payload) {
    return api("/api/admin/variants/group-bundle", { method: "POST", body: JSON.stringify(payload) });
  }

  // Отдельный endpoint для сохранения только default_value_index
  async function apiSetVariantGroupDefaultIndex(groupId, index) {
    const url = `/api/admin/variants/groups/${groupId}/defaultIndex`;
    try {
      const data = await api(url, {
        method: "PATCH",
        body: JSON.stringify({ default_value_index: index }),
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  async function apiPatchVariantGroup(id, payload) {
    const url = `/api/admin/variants/groups/${id}`;
    const body = JSON.stringify(payload);
    try {
      const data = await api(url, {
        method: "PATCH",
        body: body,
      });
      return data;
    } catch (error) {
      throw error;
    }
  }

  async function apiDeleteVariantGroup(id) {
    return api(`/api/admin/variants/groups/${id}`, { method: "DELETE" });
  }

  async function apiSaveVariantGroupTiers(groupId, payload) {
    return api(`/api/admin/variants/groups/${groupId}/tiers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function apiAddVariantGroupAssignments(groupId, assignIds) {
    return api(`/api/admin/variants/groups/${groupId}/assignments`, {
      method: "POST",
      body: JSON.stringify({ assign_ids: assignIds }),
    });
  }

  async function apiPatchVariantAssignment(id, payload) {
    return api(`/api/admin/variants/assignments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  async function apiDeleteVariantAssignment(id) {
    return api(`/api/admin/variants/assignments/${id}`, { method: "DELETE" });
  }

  // Auto-add API functions
  async function apiGetAutoAddGroups() {
    return api("/api/admin/auto-add/groups");
  }
  async function apiCreateAutoAddGroup(payload) {
    return api("/api/admin/auto-add/groups", { method: "POST", body: JSON.stringify(payload) });
  }
  async function apiPatchAutoAddGroup(id, payload) {
    return api(`/api/admin/auto-add/groups/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  async function apiDeleteAutoAddGroup(id) {
    return api(`/api/admin/auto-add/groups/${id}`, { method: "DELETE" });
  }
  async function apiCreateAutoAddItem(groupId, payload) {
    return api(`/api/admin/auto-add/groups/${groupId}/items`, { method: "POST", body: JSON.stringify(payload) });
  }
  async function apiPatchAutoAddItem(id, payload) {
    return api(`/api/admin/auto-add/items/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  async function apiDeleteAutoAddItem(id) {
    return api(`/api/admin/auto-add/items/${id}`, { method: "DELETE" });
  }

  async function apiGetCatalogCategories() {
    return api("/api/admin/catalog/categories");
  }

  async function apiGetCatalogProducts({ categoryId, query }) {
    const params = new URLSearchParams();
    if (categoryId) params.set("category_id", String(categoryId));
    if (query) params.set("q", query);
    const qs = params.toString();
    return api(`/api/admin/catalog/products${qs ? `?${qs}` : ""}`);
  }

  async function apiGetComboBlocks() {
    return api("/api/admin/combo-blocks");
  }
  async function apiGetComboBlock(id) {
    return api(`/api/admin/combo-blocks/${id}`);
  }
  async function apiPostComboBlock(payload) {
    return api("/api/admin/combo-blocks", { method: "POST", body: JSON.stringify(payload) });
  }
  async function apiPatchComboBlock(id, payload) {
    return api(`/api/admin/combo-blocks/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  async function apiDeleteComboBlock(id) {
    return api(`/api/admin/combo-blocks/${id}`, { method: "DELETE" });
  }
  async function apiGetComboBlockProductFlags(productIds) {
    if (!Array.isArray(productIds) || productIds.length === 0) return { data: [] };
    const ids = [...new Set(productIds.map((id) => Number(id)).filter(Number.isFinite))];
    if (ids.length === 0) return { data: [] };
    return api(`/api/admin/combo-blocks/product-flags?ids=${ids.join(",")}`);
  }

  async function apiGetCombos() {
    return api("/api/admin/combos");
  }
  async function apiGetCombo(id) {
    return api(`/api/admin/combos/${id}`);
  }
  async function apiGetComboSetBlocks(comboId) {
    return api(`/api/admin/combos/${comboId}/blocks`);
  }
  async function apiPostCombo(payload) {
    return api("/api/admin/combos", { method: "POST", body: JSON.stringify(payload) });
  }
  async function apiPatchCombo(id, payload) {
    return api(`/api/admin/combos/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }
  async function apiPutComboBlocks(comboId, blocks) {
    return api(`/api/admin/combos/${comboId}/blocks`, { method: "PUT", body: JSON.stringify({ blocks }) });
  }
  async function apiDeleteCombo(id) {
    return api(`/api/admin/combos/${id}`, { method: "DELETE" });
  }

  async function apiGetProductOptionAssignments(productId) {
    return api(`/api/admin/products/${productId}/option-assignments`);
  }

  async function apiGetProductVariants(productId) {
    return api(`/api/admin/products/${productId}/variants`);
  }

  async function apiAddProductOptionAssignments(productId, groupIds) {
    return api(`/api/admin/products/${productId}/option-assignments`, {
      method: "POST",
      body: JSON.stringify({ group_ids: groupIds }),
    });
  }

  async function apiDisableProductOptionAssignment(productId, groupId) {
    return api(`/api/admin/products/${productId}/option-assignments/${groupId}`, { method: "PATCH" });
  }

  async function apiSetProductOptionItemExclusions(productId, groupId, excludedItemIds) {
    return api(`/api/admin/products/${productId}/option-assignments/${groupId}/item-exclusions`, {
      method: "PUT",
      body: JSON.stringify({ excluded_item_ids: excludedItemIds }),
    });
  }

  async function apiSetProductVariantValueExclusions(productId, groupId, excludedValueIndexes) {
    return api(`/api/admin/products/${productId}/variant-assignments/${groupId}/value-exclusions`, {
      method: "PUT",
      body: JSON.stringify({ excluded_value_indexes: excludedValueIndexes }),
    });
  }

  async function apiDeleteProduct(id) {
    return api(`/api/prod_products/${id}`, { method: "DELETE" });
  }

  async function apiGetUnits({ all } = {}) {
    const qs = all ? "?all=1" : "";
    return api(`/api/admin/units${qs}`);
  }

  async function apiCreateUnit(payload) {
    return api("/api/admin/units", { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiUpdateUnit(id, payload) {
    return api(`/api/admin/units/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async function apiDeleteUnit(id) {
    return api(`/api/admin/units/${id}`, { method: "DELETE" });
  }

  async function apiGetUnitConversions() {
    return api("/api/admin/unit-conversions?all=1");
  }

  async function apiGetProductUnitLinks(productId) {
    return api(`/api/admin/products/${productId}/unit-links`);
  }

  async function apiUpsertProductUnitLink(productId, payload) {
    return api(`/api/admin/products/${productId}/unit-links`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function apiDeleteProductUnitLink(productId, unitId) {
    return api(`/api/admin/products/${productId}/unit-links/${unitId}`, { method: "DELETE" });
  }

  async function apiGetProductIngredients(productId) {
    return api(`/api/admin/products/${productId}/ingredients`);
  }

  async function apiGetProductsUsingAsIngredient(ingredientId) {
    return api(`/api/admin/products/used-as-ingredient/${ingredientId}`);
  }

  async function apiGenerateProductComposition(productId) {
    return api(`/api/admin/products/${productId}/generate-composition`, { method: "POST" });
  }

  async function apiGetProductDependentRecalcPreview(productId) {
    return api(`/api/admin/products/${productId}/dependent-recalc-preview`);
  }

  async function apiGetProduct(id) {
    return api(`/api/prod_products/${id}`);
  }

  async function apiPatchProductRecalc(id, payload) {
    return api(`/api/prod_products/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
  }

  async function apiRecalculateProductDependents(payload) {
    return api("/api/admin/products/recalculate-dependents", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function apiGetProductDependentRecalcValues(productIds) {
    return api("/api/admin/products/dependent-recalc-values", {
      method: "POST",
      body: JSON.stringify({ product_ids: productIds }),
    });
  }

  async function apiAddProductIngredient(productId, payload) {
    return api(`/api/admin/products/${productId}/ingredients`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async function apiUpdateProductIngredient(productId, ingredientId, payload) {
    return api(`/api/admin/products/${productId}/ingredients/${ingredientId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  async function apiDeleteProductIngredient(productId, ingredientId) {
    return api(`/api/admin/products/${productId}/ingredients/${ingredientId}`, { method: "DELETE" });
  }

  // ---------------- Accordion (height fix) ----------------

  const accordionContainers = new Set();

  function initAccordionItems(container) {
    if (!container) return;
    $$(".acc-item", container).forEach((item) => {
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      if (!trigger || !panel) return;

      const open = panel.classList.contains("is-open") || trigger.classList.contains("is-open");
      trigger.classList.toggle("is-open", open);
      panel.classList.toggle("is-open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });
  }

  function bindAccordionContainer(container) {
    if (!container) return;
    initAccordionItems(container);
    if (container.__accordionBound) return;
    container.__accordionBound = true;
    accordionContainers.add(container);

    container.addEventListener("click", (e) => {
      const trigger = e.target.closest("[data-acc-trigger]");
      if (!trigger || !container.contains(trigger)) return;

      const item = trigger.closest(".acc-item");
      const panel = item && item.querySelector("[data-acc-panel]");
      if (!panel) return;

      const open = !panel.classList.contains("is-open");
      panel.classList.toggle("is-open", open);
      trigger.classList.toggle("is-open", open);
      panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
    });
  }

  function refreshOpenAccordions() {
    accordionContainers.forEach((container) => {
      $$(".acc-panel.is-open", container).forEach((panel) => {
        panel.style.maxHeight = panel.scrollHeight + "px";
      });
    });
  }

  // ---------------- Horizontal scroll helpers ----------------

  function bindHorizontalScroll(container) {
    if (!container || container.__horizontalScrollBound) return;
    container.__horizontalScrollBound = true;

    container.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      container.scrollLeft += e.deltaY;
      e.preventDefault();
    }, { passive: false });

    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;

    container.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDown = true;
      startX = e.pageX - container.offsetLeft;
      scrollLeft = container.scrollLeft;
      container.classList.add("is-dragging");
    });

    container.addEventListener("mouseleave", () => {
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mouseup", () => {
      isDown = false;
      container.classList.remove("is-dragging");
    });

    container.addEventListener("mousemove", (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - container.offsetLeft;
      const walk = x - startX;
      container.scrollLeft = scrollLeft - walk;
    });

    container.addEventListener("scroll", () => {
      state.optionPanel.pickerTabsScrollLeft = container.scrollLeft;
    });
  }

  function closeProductsFilterDropdown() {
    state.productsToolbarFilterOpen = false;
    if (productsFilterDropdown) productsFilterDropdown.classList.add("hidden");
    if (productsFilterWrap) productsFilterWrap.classList.remove("is-open");
  }

  function applyProductsToolbarLocalFilters() {
    if (state.mode === "products") {
      renderProductsList();
    } else if (state.mode === "options") {
      renderAllOptionGroupsLists();
    } else if (state.mode === "variants") {
      renderVariantGroupsList(variantsGroupsList, variantsGroupsEmpty);
    }
    syncProductsBulkFooter();
  }

  function renderProductsFilterDropdown() {
    if (!productsFilterDropdown) return;
    if (!isProductsToolbarModeVisible()) {
      productsFilterDropdown.innerHTML = "";
      return;
    }

    const mode = state.mode;
    const defs = PRODUCTS_TOOLBAR_FILTER_DEFINITIONS[mode] || [];
    const filters = normalizeProductsToolbarFilters(mode, getProductsToolbarState(mode)?.filters);
    productsFilterDropdown.innerHTML = `
      <div class="products-filter-menu">
        ${defs.map((item) => `
          <label class="products-filter-option">
            <input type="checkbox" data-products-filter-key="${item.key}" ${filters[item.key] ? "checked" : ""} />
            <span class="products-filter-option-text">${escapeHtml(item.label)}</span>
          </label>
        `).join("")}
      </div>
    `;

    productsFilterDropdown.querySelectorAll("input[data-products-filter-key]").forEach((input) => {
      input.addEventListener("change", () => {
        const toolbarState = getProductsToolbarState(mode);
        if (!toolbarState) return;
        const key = String(input.dataset.productsFilterKey || "");
        toolbarState.filters[key] = input.checked;
        toolbarState.filters = normalizeProductsToolbarFilters(mode, toolbarState.filters);
        persistProductsToolbarFilters();
        renderProductsFilterDropdown();
        applyProductsToolbarLocalFilters();
      });
    });
  }

  function syncProductsToolbar() {
    const isVisible = isProductsToolbarModeVisible();
    if (productsToolbarControls) {
      productsToolbarControls.classList.toggle("is-toolbar-mode-hidden", !isVisible);
    }
    if (productsSearchWrap) {
      productsSearchWrap.classList.toggle("hidden", !isVisible);
    }
    if (productsFilterWrap) {
      productsFilterWrap.classList.toggle("hidden", !isVisible);
    }

    if (!isVisible) {
      if (productsSearchWrap) productsSearchWrap.classList.remove("is-open");
      if (productsSearchInput) productsSearchInput.value = "";
      closeProductsFilterDropdown();
      return;
    }

    const toolbarState = getProductsToolbarState();
    if (productsSearchWrap) {
      productsSearchWrap.classList.toggle("is-open", Boolean(toolbarState?.searchOpen));
    }
    if (productsSearchInput) {
      productsSearchInput.placeholder = getProductsToolbarSearchPlaceholder(state.mode);
      productsSearchInput.value = toolbarState?.query || "";
    }
    renderProductsFilterDropdown();
    if (productsFilterDropdown) {
      productsFilterDropdown.classList.toggle("hidden", !state.productsToolbarFilterOpen);
    }
    if (productsFilterWrap) {
      productsFilterWrap.classList.toggle("is-open", Boolean(state.productsToolbarFilterOpen));
    }
  }

  function scheduleProductsToolbarSearchReload() {
    if (productsToolbarSearchTimer) {
      clearTimeout(productsToolbarSearchTimer);
      productsToolbarSearchTimer = null;
    }
    if (state.mode !== "products") return;
    productsToolbarSearchTimer = setTimeout(() => {
      productsToolbarSearchTimer = null;
      if (state.mode !== "products") return;
      refreshProductsOnly(true).catch(console.error);
    }, PRODUCTS_TOOLBAR_SEARCH_DEBOUNCE_MS);
  }

  function handleProductsToolbarSearchInput() {
    const toolbarState = getProductsToolbarState();
    if (!toolbarState || !productsSearchInput) return;
    toolbarState.query = normalizeProductsToolbarQuery(productsSearchInput.value);
    if (state.mode === "products") {
      scheduleProductsToolbarSearchReload();
      return;
    }
    applyProductsToolbarLocalFilters();
  }

  async function closeProductsToolbarSearch() {
    const toolbarState = getProductsToolbarState();
    if (!toolbarState) return;
    const hadQuery = Boolean(toolbarState.query);
    toolbarState.searchOpen = false;
    toolbarState.query = "";
    if (productsToolbarSearchTimer) {
      clearTimeout(productsToolbarSearchTimer);
      productsToolbarSearchTimer = null;
    }
    syncProductsToolbar();
    if (!hadQuery) return;
    if (state.mode === "products") {
      await refreshProductsOnly(true);
      return;
    }
    applyProductsToolbarLocalFilters();
  }

  function openProductsToolbarSearch() {
    const toolbarState = getProductsToolbarState();
    if (!toolbarState) return;
    toolbarState.searchOpen = true;
    syncProductsToolbar();
    if (productsSearchInput) {
      requestAnimationFrame(() => {
        productsSearchInput.focus();
        productsSearchInput.select();
      });
    }
  }

  // ---------------- Views ----------------

  function showView(name) {
    $$(".content-view").forEach((v) => v.classList.add("hidden"));
    const target = document.querySelector(`.content-view[data-view-content="${name}"]`);
    if (target) target.classList.remove("hidden");
  }

  function setToolbarTitle(text, iconClass) {
    if (toolbarText) {
      toolbarText.classList.remove("products-category-toolbar-chips");
      toolbarText.parentElement?.classList.remove("products-category-toolbar-title");
      toolbarText.textContent = text || "";
    }
    if (toolbarIcon && iconClass) {
      toolbarIcon.className = "fas " + iconClass;
      toolbarIcon.removeAttribute("role");
      toolbarIcon.removeAttribute("tabindex");
      toolbarIcon.removeAttribute("title");
      toolbarIcon.removeAttribute("aria-label");
    }
  }

  function getCategoryHeaderItems(categoryId) {
    const id = Number(categoryId || 0);
    if (!(id > 0)) return [];
    const current = state.categories.find((c) => Number(c.id) === id);
    if (!current) return [];
    const parentId = Number(current.parent_id || 0);
    const parent = parentId > 0
      ? state.categories.find((c) => Number(c.id) === parentId)
      : current;
    if (!parent) return [];
    const children = state.categories
      .filter((c) => Number(c.parent_id) === Number(parent.id))
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    return [parent, ...children];
  }

  function getCategoryNavActiveId(categoryId) {
    const current = state.categories.find((c) => Number(c.id) === Number(categoryId || 0));
    const parentId = Number(current?.parent_id || 0);
    return parentId > 0 ? parentId : Number(current?.id || 0);
  }

  function renderProductsCategoryToolbarChips(categoryId) {
    if (!toolbarText) return;
    const items = getCategoryHeaderItems(categoryId);
    if (!items.length) {
      setToolbarTitle("Товары", "fa-box");
      return;
    }

    const activeId = Number(categoryId || 0);
    toolbarText.parentElement?.classList.add("products-category-toolbar-title");
    toolbarText.classList.add("products-category-toolbar-chips");
    toolbarText.innerHTML = items.map((item) => {
      const isActive = Number(item.id) === activeId;
      return `<button class="chip products-category-toolbar-chip ${isActive ? "is-active" : ""}" type="button" data-products-category-chip="${Number(item.id)}">${escapeHtml(item.title || "")}</button>`;
    }).join("");
    const parent = items[0] || null;
    const canCreateSubcategory = parent && String(parent.code || "") !== "all";
    if (toolbarIcon && canCreateSubcategory) {
      toolbarIcon.className = "fas fa-ellipsis-v products-category-toolbar-menu";
      toolbarIcon.setAttribute("role", "button");
      toolbarIcon.setAttribute("tabindex", "0");
      toolbarIcon.setAttribute("title", "Добавить подкатегорию");
      toolbarIcon.setAttribute("aria-label", "Добавить подкатегорию");
    } else if (toolbarIcon) {
      toolbarIcon.className = "fas fa-box";
      toolbarIcon.removeAttribute("role");
      toolbarIcon.removeAttribute("tabindex");
      toolbarIcon.removeAttribute("title");
      toolbarIcon.removeAttribute("aria-label");
    }

    if (!toolbarText.dataset.wheelBound) {
      toolbarText.dataset.wheelBound = "1";
      toolbarText.addEventListener("wheel", (event) => {
        if (!toolbarText.classList.contains("products-category-toolbar-chips")) return;
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        toolbarText.scrollLeft += event.deltaY;
      }, { passive: false });
    }
  }

  function closeCreateSubcategoryModal() {
    document.querySelectorAll(".product-photo-grid-modal-overlay[data-create-subcategory-modal='1']").forEach((el) => el.remove());
  }

  function openCreateSubcategoryModal() {
    const items = getCategoryHeaderItems(state.currentCategoryId);
    const parent = items[0] || null;
    const parentId = Number(parent?.id || 0);
    if (!(parentId > 0) || String(parent?.code || "") === "all") return;

    closeCreateSubcategoryModal();
    const overlay = document.createElement("div");
    overlay.className = "product-photo-grid-modal-overlay";
    overlay.setAttribute("data-create-subcategory-modal", "1");
    const card = document.createElement("div");
    card.className = "product-photo-grid-modal-card create-subcategory-modal-card";
    card.innerHTML = `
      <div class="product-photo-grid-modal-head">
        <div class="product-photo-grid-modal-title create-subcategory-modal-title">Введите название подкатегории</div>
        <button type="button" class="product-photo-grid-modal-close" aria-label="Закрыть"><i class="fas fa-times"></i></button>
      </div>
      <div class="product-photo-grid-modal-body create-subcategory-modal-body">
        <input class="create-subcategory-modal-input" type="text" autocomplete="off" />
      </div>
      <div class="product-photo-grid-modal-foot">
        <button type="button" class="btn" data-role="cancel">Отмена</button>
        <button type="button" class="btn btn-primary" data-role="save">Сохранить</button>
      </div>
    `;

    const input = card.querySelector(".create-subcategory-modal-input");
    const saveBtn = card.querySelector('[data-role="save"]');
    const close = () => closeCreateSubcategoryModal();
    const save = async () => {
      const title = String(input?.value || "").trim();
      if (!title) {
        input?.focus();
        return;
      }
      if (saveBtn) saveBtn.disabled = true;
      try {
        await api("/api/prod_categories", {
          method: "POST",
          body: JSON.stringify({
            parent_id: parentId,
            title,
            code: `subcat-${parentId}-${Date.now().toString(36)}`,
            is_active: 1,
            site_visibility: 1,
            cart_visibility: 0,
            checkout_visibility: 1,
          }),
        });
        close();
        await loadCategories();
        renderCategoriesNav();
        renderProductsCategoryToolbarChips(state.currentCategoryId);
        showToast("Подкатегория добавлена", "success");
      } catch (e) {
        console.error(e);
        showToast("Не удалось добавить подкатегорию.");
        if (saveBtn) saveBtn.disabled = false;
      }
    };

    card.querySelector(".product-photo-grid-modal-close")?.addEventListener("click", close);
    card.querySelector('[data-role="cancel"]')?.addEventListener("click", close);
    saveBtn?.addEventListener("click", save);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
    });
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => input?.focus());
  }

  function syncActiveMenuItems() {
    if (!productsAccordion) return;
    
    // Убираем класс is-active у всех пунктов меню
    $$(".stage-item", productsAccordion).forEach((item) => {
      item.classList.remove("is-active");
    });
    
    // Активируем пункт меню в зависимости от state.mode
    if (state.mode === "categories") {
      const addCategoryBtn = $("#addCategoryBtn");
      if (addCategoryBtn) addCategoryBtn.classList.add("is-active");
    } else if (state.mode === "options") {
      const btn = productsAccordion.querySelector('[data-view="options"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "variants") {
      const btn = productsAccordion.querySelector('[data-view="variants"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "auto-add") {
      const btn = productsAccordion.querySelector('[data-view="auto-add"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "units") {
      const btn = productsAccordion.querySelector('[data-view="units"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "allergens") {
      const btn = productsAccordion.querySelector('[data-view="allergens"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "diets") {
      const btn = productsAccordion.querySelector('[data-view="diets"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "combo-blocks") {
      const btn = productsAccordion.querySelector('[data-view="combo-blocks"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "stock-in") {
      const btn = productsAccordion.querySelector('[data-view="stock-in"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "stock-out") {
      const btn = productsAccordion.querySelector('[data-view="stock-out"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "stock-movements") {
      const btn = productsAccordion.querySelector('[data-view="stock-movements"]');
      if (btn) btn.classList.add("is-active");
    }
    // Для режима "products" активация категории обрабатывается отдельно в renderCategoriesNav()
  }

  function getCurrentCategory() {
    return state.categories.find((c) => c.id === state.currentCategoryId) || null;
  }

  function enterProductsMode(categoryId) {
    state.mode = "products";
    if (categoryId) state.currentCategoryId = categoryId;
    const cat = getCurrentCategory();
    if (cat) renderProductsCategoryToolbarChips(cat.id);
    else setToolbarTitle("Товары", "fa-box");
    showView("products");
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    syncProductsBulkFooter();
    schedulePersistProductsCache();
  }

  function enterCategoriesMode() {
    state.mode = "categories";
    clearProductsBulkSelection();
    setToolbarTitle("Категории", "fa-th-large");
    showView("categories");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
  }

  function enterOptionsMode() {
    state.mode = "options";
    clearProductsBulkSelection();
    state.optionPanel.returnTo = null;
    setToolbarTitle("Опции товара", "fa-sliders-h");
    showView("options");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
  }

  function enterVariantsMode() {
    state.mode = "variants";
    clearProductsBulkSelection();
    state.variantPanel.returnTo = null;
    setToolbarTitle("Варианты товара", "fa-cubes");
    showView("variants");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
  }

  async function enterAutoAddMode() {
    state.mode = "auto-add";
    clearProductsBulkSelection();
    setToolbarTitle("Автодобавления", "fa-cart-plus");
    showView("auto-add");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadAutoAddManagement();
    renderAutoAddGroupsList();
  }

  async function enterUnitsMode() {
    state.mode = "units";
    clearProductsBulkSelection();
    state.unitPanel.returnTo = null;
    setToolbarTitle("Единицы измерения", "fa-ruler");
    showView("units");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadUnitsManagement();
    await loadUnitConversions();
    renderUnitsList();
  }

  async function enterComboBlocksMode() {
    state.mode = "combo-blocks";
    clearProductsBulkSelection();
    setToolbarTitle("Блоки комбо", "fa-layer-group");
    showView("combo-blocks");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadComboBlocks();
    renderComboBlocksList();
  }

  async function loadComboBlocks() {
    try {
      const res = await apiGetComboBlocks();
      state.comboBlocks = Array.isArray(res?.data) ? res.data : [];
    } catch (e) {
      console.error("loadComboBlocks", e);
      state.comboBlocks = [];
    }
  }

  function renderComboBlocksList() {
    if (!comboBlocksList || !comboBlocksEmptyHint) return;
    const blocks = state.comboBlocks || [];
    if (blocks.length === 0) {
      comboBlocksList.innerHTML = "";
      comboBlocksEmptyHint.classList.remove("hidden");
      return;
    }
    comboBlocksEmptyHint.classList.add("hidden");
    comboBlocksList.innerHTML = blocks.map((b) => `
      <div class="stage-item order-row" data-block-id="${b.id}" type="button">
        <span class="stage-meta stage-text"><b>${escapeHtml(b.title || "")}</b><small>${(b.products_count ?? 0)} т.</small></span>
        <span class="acc-spacer"></span>
      </div>
    `).join("");
    comboBlocksList.querySelectorAll("[data-block-id]").forEach((row) => {
      row.addEventListener("click", () => openComboBlock(Number(row.dataset.blockId)));
    });
  }

  async function openComboBlock(blockId) {
    const block = state.comboBlocks.find((b) => Number(b.id) === blockId);
    if (!block) return;
    let blockData = block;
    try {
      const res = await apiGetComboBlock(blockId);
      if (res?.data) blockData = res.data;
    } catch (e) {
      console.error("openComboBlock", e);
    }
    const products = Array.isArray(blockData.products)
      ? blockData.products.map((p) => ({ product_id: p.product_id, name: p.product_name || p.name, sort_order: p.sort_order ?? 0, is_default: p.is_default ? 1 : 0, photo: p.product_photo || null, price: p.product_price ?? p.price ?? 0, has_variants: p.has_variants ? 1 : 0, has_changeable_composition: p.has_changeable_composition ? 1 : 0 }))
      : [];
    const tabId = `combo-block-${blockId}`;
    ensureTab({
      type: "combo",
      id: tabId,
      title: blockData.title || "Блок",
      onActivate: () => {
        state.selectedComboBlockId = blockId;
        state.comboBlockDraft = { title: blockData.title, sort_order: blockData.sort_order ?? 0, min_select: blockData.min_select ?? 1, max_select: blockData.max_select ?? 1 };
        state.comboBlockProducts = products;
        showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "view" });
        showProductFooterView();
      },
      activate: true,
    });
    state.comboPanel.tabKey = buildTabKey("combo", tabId);
    state.selectedComboBlockId = blockId;
    state.comboBlockDraft = { title: blockData.title, sort_order: blockData.sort_order ?? 0, min_select: blockData.min_select ?? 1, max_select: blockData.max_select ?? 1 };
    state.comboBlockProducts = products;
    showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "view" });
    showProductFooterView();
  }

  async function saveComboBlock() {
    const title = (comboBlockTitleInput?.value ?? "").trim();
    if (!title) {
      comboBlockTitleInput?.focus();
      alert("Введите название блока.");
      return;
    }
    const sortOrder = parseInt(comboBlockSortOrderInput?.value, 10) || 0;
    const minSelect = Math.max(0, parseInt(comboBlockMinSelectInput?.value, 10) || 1);
    const maxSelect = Math.max(1, parseInt(comboBlockMaxSelectInput?.value, 10) || 1);
    const products = (state.comboBlockProducts || []).map((p, i) => ({
      product_id: p.product_id,
      sort_order: p.sort_order ?? i,
      is_default: p.is_default ? 1 : 0,
    }));
    const tabKey = state.comboPanel.tabKey;
    const isNew = tabKey && tabKey.includes("new-combo-block-");
    try {
      if (isNew) {
        const res = await apiPostComboBlock({ title, sort_order: sortOrder, min_select: minSelect, max_select: Math.max(minSelect, maxSelect), products });
        const block = res?.data;
        if (!block || !block.id) throw new Error("Нет ответа от сервера");
        const oldKey = tabKey;
        replaceTabKey(oldKey, {
          type: "combo",
          id: `combo-block-${block.id}`,
          title: block.title || title,
          onActivate: () => {
            state.selectedComboBlockId = block.id;
            state.comboBlockDraft = { title: block.title, sort_order: block.sort_order ?? 0, min_select: block.min_select ?? 1, max_select: block.max_select ?? 1 };
            state.comboBlockProducts = [];
            showComboBlockDetails({ block: state.comboBlockDraft, products: [] }, { mode: "view" });
            apiGetComboBlock(block.id).then((r) => {
              if (r?.data?.products) state.comboBlockProducts = r.data.products.map((p) => ({ product_id: p.product_id, name: p.product_name, sort_order: p.sort_order, is_default: p.is_default ? 1 : 0, photo: p.product_photo || null, price: p.product_price ?? 0, has_variants: p.has_variants ? 1 : 0, has_changeable_composition: p.has_changeable_composition ? 1 : 0 }));
              renderComboBlockProductsList();
            });
            showProductFooterView();
          },
        });
        state.comboPanel.tabKey = buildTabKey("combo", `combo-block-${block.id}`);
        state.selectedComboBlockId = block.id;
        state.comboBlockDraft = { title: block.title || title, sort_order: block.sort_order ?? sortOrder };
        editingCombos.delete(String(tabKey).split(":")[1]);
        await loadComboBlocks();
        renderComboBlocksList();
        showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "view" });
        showProductFooterView();
      } else {
        const id = state.selectedComboBlockId;
        if (!id) throw new Error("Блок не выбран");
        await apiPatchComboBlock(id, { title, sort_order: sortOrder, min_select: minSelect, max_select: Math.max(minSelect, maxSelect), products });
        await loadComboBlocks();
        renderComboBlocksList();
        const block = state.comboBlocks.find((b) => Number(b.id) === Number(id));
        if (block) {
          const tab = tabsState.tabs.find((t) => t.key === state.comboPanel.tabKey);
          if (tab) tab.title = block.title || title;
          renderTabs();
        }
        state.comboBlockDraft = { title, sort_order: sortOrder, min_select: minSelect, max_select: Math.max(minSelect, maxSelect) };
        showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "view" });
        showProductFooterView();
      }
    } catch (e) {
      console.error("saveComboBlock", e);
      alert("Ошибка при сохранении блока: " + (e && e.message ? e.message : "Неизвестная ошибка"));
    }
  }

  // ---------------- Load ----------------

  async function loadCategories() {
    const res = await api(`/api/prod_categories?tenant_id=${TENANT_ID}`);
    state.categories = Array.isArray(res.data) ? res.data : [];
    state.allCategoryId = (state.categories.find((c) => c.code === "all") || {}).id || null;

    if (!state.currentCategoryId) {
      state.currentCategoryId = state.allCategoryId || (state.categories[0] && state.categories[0].id) || null;
    }
    schedulePersistProductsCache();
  }

  async function loadCombosForCategory(categoryId) {
    const cat = state.categories.find((c) => Number(c.id) === Number(categoryId));
    const categoryCode =
      cat && cat.code && String(cat.code).trim() && cat.code !== "all"
        ? String(cat.code).trim()
        : null;
    try {
      const combosRes = await apiGetCombos();
      const allCombos = Array.isArray(combosRes?.data) ? combosRes.data : [];
      if (categoryCode) {
        state.combosInCategory = allCombos.filter((c) => String(c.category_code || "").trim() === categoryCode);
      } else {
        state.combosInCategory = allCombos;
      }
    } catch (e) {
      state.combosInCategory = [];
    }
    schedulePersistProductsCache();
  }

  function buildProductsListQuery(categoryId, offset, limit) {
    const qs = new URLSearchParams();
    qs.set("tenant_id", String(TENANT_ID));
    qs.set("category_id", String(categoryId));
    qs.set("offset", String(offset));
    qs.set("limit", String(limit));
    qs.set("list", "1");
    const searchQuery = normalizeProductsToolbarQuery(state.productsToolbar?.products?.query || "");
    if (searchQuery) qs.set("q", searchQuery);
    return qs;
  }

  async function loadMoreProducts() {
    if (state.productsLoading || !state.productsHasMore) return;
    const cid = state.currentCategoryId;
    if (!cid) return;

    state.productsLoading = true;
    syncProductsBulkFooter();
    const token = productsRequestToken;
    const prevOffset = state.productsOffset;
    try {
      const qs = buildProductsListQuery(cid, state.productsOffset, PRODUCTS_PAGE_LIMIT);
      const res = await api(`/api/prod_products?${qs.toString()}`);
      if (token !== productsRequestToken) return;

      const chunkRaw = Array.isArray(res.data) ? res.data : [];
      const knownIds = new Set((state.products || []).map((p) => Number(p.id)));
      const append = chunkRaw
        .filter((p) => !knownIds.has(Number(p.id)));

      const appendIds = append
        .map((p) => Number(p?.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      if (appendIds.length > 0) {
        try {
          const flagsRes = await apiGetComboBlockProductFlags(appendIds);
          const flagsList = Array.isArray(flagsRes?.data) ? flagsRes.data : [];
          const flagsByPid = new Map(flagsList.map((f) => [Number(f.product_id), f]));
          append.forEach((p) => {
            const flags = flagsByPid.get(Number(p?.id));
            if (!flags) return;
            p.has_variants = flags.has_variants ? 1 : 0;
          });
        } catch (_) {}
      }

      state.products = (state.products || []).concat(append);
      state.productsOffset += chunkRaw.length;
      state.productsTotal = Number(res.total || 0);
      state.productsHasMore = chunkRaw.length > 0 && state.productsOffset < state.productsTotal;

      if (prevOffset === 0) {
        renderProductsList();
      } else {
        appendProductRowsToList(append);
      }
    } finally {
      if (token === productsRequestToken) {
        state.productsLoading = false;
        syncProductsBulkFooter();
        syncProductRowsSortability();
        setCachedCategoryProducts(cid, {
          products: state.products,
          productsOffset: state.productsOffset,
          productsTotal: state.productsTotal,
          productsHasMore: state.productsHasMore,
          combosInCategory: state.combosInCategory,
        });
        schedulePersistProductsCache();
        if (state.mode === "products") {
          maybeLoadMoreProductsOnScroll();
        }
      }
    }
  }

  async function ensureProductsScrollable() {
    if (!productsScrollEl) return;
    let guard = 0;
    while (
      state.mode === "products" &&
      state.productsHasMore &&
      !state.productsLoading &&
      productsScrollEl.scrollHeight <= (productsScrollEl.clientHeight + 20) &&
      guard < 5
    ) {
      guard += 1;
      await loadMoreProducts();
    }
  }

  async function loadProducts(categoryId, { forceReload = false } = {}) {
    const cid = categoryId || state.currentCategoryId;
    productsRequestToken += 1;
    clearProductsBulkSelection();
    state.productRowVariantsExpanded.clear();
    state.productRowVariantsCache.clear();
    state.productRowVariantsLoading.clear();
    if (!cid) {
      state.products = [];
      state.productsOffset = 0;
      state.productsTotal = 0;
      state.productsHasMore = false;
      state.productsLoading = false;
      state.combosInCategory = [];
      renderProductsList();
      schedulePersistProductsCache();
      return;
    }

    if (!forceReload) {
      const cached = getCachedCategoryProducts(cid);
      if (cached) {
        state.products = Array.isArray(cached.products) ? cached.products : [];
        state.productsOffset = Math.max(0, Number(cached.productsOffset || 0));
        state.productsTotal = Math.max(state.productsOffset, Number(cached.productsTotal || 0));
        state.productsHasMore = Boolean(cached.productsHasMore);
        state.productsLoading = false;
        state.combosInCategory = Array.isArray(cached.combosInCategory) ? cached.combosInCategory : [];
        renderProductsList();
        schedulePersistProductsCache();
        return;
      }
    }

    state.products = [];
    state.productsOffset = 0;
    state.productsTotal = 0;
    state.productsHasMore = true;
    state.productsLoading = false;
    state.combosInCategory = [];
    renderProductsList();

    await loadCombosForCategory(cid);
    renderProductsList();
    await loadMoreProducts();
    await ensureProductsScrollable();
    setCachedCategoryProducts(cid, {
      products: state.products,
      productsOffset: state.productsOffset,
      productsTotal: state.productsTotal,
      productsHasMore: state.productsHasMore,
      combosInCategory: state.combosInCategory,
    });
    schedulePersistProductsCache();
  }

  function maybeLoadMoreProductsOnScroll() {
    if (!productsScrollEl) return;
    if (state.mode !== "products") return;
    if (state.productsLoading || !state.productsHasMore) return;
    const nearBottom =
      (productsScrollEl.scrollTop + productsScrollEl.clientHeight) >=
      (productsScrollEl.scrollHeight - PRODUCTS_SCROLL_THRESHOLD_PX);
    if (nearBottom) {
      loadMoreProducts().catch(console.error);
    }
  }

  async function loadOptionGroups() {
    const res = await apiGetOptionGroups();
    state.optionGroups = Array.isArray(res.data) ? res.data : [];
  }

  async function loadVariantGroups() {
    const res = await apiGetVariantGroups();
    state.variantGroups = Array.isArray(res.data) ? res.data : [];
  }

  function makeOptionGroupCacheKey(groupId, productId = null) {
    const safeGroupId = Number(groupId) || 0;
    const safeProductId = Number(productId) || 0;
    return `${safeGroupId}:${safeProductId}`;
  }

  function getCachedOptionGroupDetails(groupId, { productId = null } = {}) {
    return state.optionGroupCache.get(makeOptionGroupCacheKey(groupId, productId)) || null;
  }

  async function loadOptionGroupDetails(id, { productId = null } = {}) {
    const res = await apiGetOptionGroup(id, { productId });
    state.optionGroupDetails = res.data || null;
    if (res.data) {
      state.optionGroupCache.set(makeOptionGroupCacheKey(id, productId), res.data);
    }
  }

  async function loadVariantGroupDetails(id) {
    const res = await apiGetVariantGroup(id);
    const data = res.data || null;

    if (data && data.tiers) {
      // Ensure tiers have discount_type for rendering (API returns only discount_percent)
      data.tiers = data.tiers.map(tier => ({
        ...tier,
        discount_type: tier.discount_type || "percent",
        discount_percent: tier.discount_percent != null ? tier.discount_percent : 0,
        discount_value: tier.discount_value != null ? tier.discount_value : (tier.discount_percent || 0),
      }));
    }
    state.variantGroupDetails = data;
  }

  async function ensureVariantGroupDetails(groupId) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return null;
    if (state.variantGroupCache.has(id)) return state.variantGroupCache.get(id);
    const res = await apiGetVariantGroup(id);
    const details = res.data || null;
    if (details) state.variantGroupCache.set(id, details);
    return details;
  }

  async function loadProductOptionAssignments(productId, { forceReload = false } = {}) {
    const id = Number(productId || 0);
    if (!(id > 0)) {
      state.selectedProductOptionAssignments = [];
      return;
    }

    if (!forceReload) {
      const cached = getCachedProductDetails(id);
      if (cached) {
        state.selectedProductOptionAssignments = Array.isArray(cached.optionAssignments) ? cached.optionAssignments : [];
        return;
      }
    }

    const res = await apiGetProductOptionAssignments(id);
    state.selectedProductOptionAssignments = Array.isArray(res.data) ? res.data : [];
    const cached = getCachedProductDetails(id);
    setCachedProductDetails(id, {
      product: cached?.product || state.products.find((x) => Number(x?.id || 0) === id) || null,
      categories: cached?.categories || state.selectedProductCategories || [],
      optionAssignments: state.selectedProductOptionAssignments,
    });
    schedulePersistProductsCache();
  }

  async function ensureOptionGroupDetails(groupId, { productId = null } = {}) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return null;
    const cacheKey = makeOptionGroupCacheKey(id, productId);
    if (state.optionGroupCache.has(cacheKey)) return state.optionGroupCache.get(cacheKey);
    const res = await apiGetOptionGroup(id, { productId });
    const details = res.data || null;
    if (details) state.optionGroupCache.set(cacheKey, details);
    return details;
  }

  async function loadCatalogCategories() {
    const res = await apiGetCatalogCategories();
    state.catalogCategories = Array.isArray(res.data) ? res.data : [];
  }

  async function loadUnitsManagement() {
    const res = await apiGetUnits({ all: true });
    state.units = Array.isArray(res.data) ? res.data : [];
    schedulePersistProductsCache();
  }

  async function loadUnitConversions() {
    const res = await apiGetUnitConversions();
    state.unitConversions = Array.isArray(res.data) ? res.data : [];
    schedulePersistProductsCache();
  }

  async function loadUnitDetails(id) {
    const unit = state.units.find((u) => Number(u.id) === Number(id));
    if (!unit) {
      state.unitDetails = null;
      return;
    }
    const conversions = loadUnitConversionsForUnit(id);
    state.unitDetails = {
      unit,
      conversions,
    };
  }

  function loadUnitConversionsForUnit(unitId) {
    if (!state.unitConversions || !Array.isArray(state.unitConversions)) return [];
    const id = Number(unitId);
    if (!Number.isFinite(id)) return [];
    
    const unit = state.units.find((u) => Number(u.id) === id);
    if (!unit) return [];
    
    const conversions = [];
    
    // Прямые конверсии (где эта единица - from_unit_id)
    state.unitConversions
      .filter((conv) => Number(conv.from_unit_id) === id)
      .forEach((conv) => {
        const toUnit = state.units.find((u) => Number(u.id) === Number(conv.to_unit_id));
        if (toUnit) {
          conversions.push({
            id: conv.id,
            from_unit_id: id,
            to_unit_id: Number(conv.to_unit_id),
            from_unit: unit,
            to_unit: toUnit,
            factor: Number(conv.factor) || 1,
            is_direct: true,
          });
        }
      });
    
    // Обратные конверсии (где эта единица - to_unit_id)
    state.unitConversions
      .filter((conv) => Number(conv.to_unit_id) === id)
      .forEach((conv) => {
        const fromUnit = state.units.find((u) => Number(u.id) === Number(conv.from_unit_id));
        if (fromUnit) {
          const factor = Number(conv.factor) || 1;
          conversions.push({
            id: conv.id,
            from_unit_id: id,
            to_unit_id: Number(conv.from_unit_id),
            from_unit: unit,
            to_unit: fromUnit,
            factor: factor !== 0 ? 1 / factor : 0,
            is_direct: false,
          });
        }
      });
    
    return conversions;
  }

  function getUnitRowValues(row) {
    const id = Number(row.dataset.unitId);
    const title = row.querySelector("[data-unit-field='title']")?.value || "";
    const shortTitle = row.querySelector("[data-unit-field='short_title']")?.value || "";
    const code = row.querySelector("[data-unit-field='code']")?.value || "";
    const sort = row.querySelector("[data-unit-field='sort_order']")?.value;
    const isActive = row.querySelector("[data-unit-active]")?.checked ? 1 : 0;
    return {
      id,
      title: String(title).trim(),
      short_title: String(shortTitle).trim() || null,
      code: String(code).trim(),
      sort_order: sort === "" || sort == null ? null : Number(sort),
      is_active: isActive,
    };
  }

  function countUnitConversions(unitId) {
    if (!state.unitConversions || !Array.isArray(state.unitConversions)) return 0;
    const id = Number(unitId);
    if (!Number.isFinite(id)) return 0;
    return state.unitConversions.filter(
      (conv) => Number(conv.from_unit_id) === id || Number(conv.to_unit_id) === id
    ).length;
  }

  function renderUnitsList() {
    if (!unitsListEl || !unitsEmptyHint) return;
    const list = state.units
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    if (!list.length) {
      unitsListEl.innerHTML = "";
      unitsEmptyHint.classList.remove("hidden");
      return;
    }

    unitsEmptyHint.classList.add("hidden");
    const isActive = (id) => Number(id) === Number(state.selectedUnitId);
    const disableSwitch = state.unitPanel.mode !== "view" || state.unitPanel.activeToggleBusy;
    
    unitsListEl.innerHTML = list.map((unit) => {
      const conversionsCount = countUnitConversions(unit.id);
      const unitIsActive = isActive(unit.id);
      return `
        <div class="options-row ${unitIsActive ? "is-active" : ""}" data-unit-id="${unit.id}">
          <div>
            <div class="options-row-title">${escapeHtml(unit.title || "")}</div>
            <div class="options-row-meta">${escapeHtml(unit.short_title || "")}</div>
          </div>
          <div class="options-row-meta">Конверсии: ${conversionsCount}</div>
          <div class="options-row-meta">
            <label class="switch switch-compact options-row-active">
              <input class="switch-input" type="checkbox" data-unit-active-id="${unit.id}" ${unit.is_active ? "checked" : ""} ${disableSwitch ? "disabled" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span class="switch-text">Активна</span>
            </label>
          </div>
        </div>
      `;
    }).join("");

    unitsListEl.querySelectorAll("[data-unit-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.unitId);
        if (!Number.isFinite(id)) return;
        const unit = state.units.find((u) => Number(u.id) === id);
        openUnitTab(id, unit?.title || "Единица измерения", { activate: true });
      });
    });

    unitsListEl.querySelectorAll("[data-unit-active-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const id = Number(input.dataset.unitActiveId);
        if (!Number.isFinite(id)) return;
        const unit = state.units.find((u) => Number(u.id) === id);
        if (!unit) return;
        try {
          await apiUpdateUnit(id, { ...unit, is_active: input.checked ? 1 : 0 });
          await loadUnitsManagement();
          renderUnitsList();
        } catch (e) {
          console.error("Failed to toggle unit active", e);
          input.checked = !input.checked;
          alert("Ошибка при изменении статуса единицы измерения");
        }
      });
    });
  }

  function showUnitDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.unitPanel.level = "group";
    state.unitPanel.mode = mode || "view";
    state.unitPanel.itemsDirty = false;
    state.unitPanel.pickerSelection = null;
    
    // Сохраняем tabKey для существующей единицы (если не в режиме создания)
    if (details && details.unit && details.unit.id && mode !== "create") {
      const unitId = Number(details.unit.id);
      if (Number.isFinite(unitId)) {
        // Проверяем, существует ли уже таб для этой единицы
        const existingTabKey = buildTabKey("unit", unitId);
        const existingTab = tabsState.tabs.find((t) => t.key === existingTabKey);
        if (existingTab) {
          state.unitPanel.tabKey = existingTabKey;
        } else {
          // Создаем таб, если его еще нет
          openUnitTab(unitId, details.unit.title || "Единица измерения", { activate: false });
        }
      }
    }
    
    if (state.unitPanel.mode === "view") {
      state.unitDraft = null;
      state.unitPanel.snapshotData = null;
    } else if (state.unitPanel.mode === "edit" && details) {
      if (!state.unitPanel.snapshotData) {
        state.unitPanel.snapshotData = JSON.parse(JSON.stringify(details));
      }
      if (!state.unitDraft) {
        state.unitDraft = {
          unit: { ...details.unit },
          conversions: details.conversions ? details.conversions.map(c => ({ ...c })) : [],
        };
      }
    } else if (state.unitPanel.mode === "create") {
      state.unitDraft = {
        unit: { title: "", short_title: "", is_active: 1 },
        conversions: [],
      };
    }
    
    hideAllDetailPanels();
    if (optionEmpty) optionEmpty.classList.add("hidden");
    if (unitInfo) unitInfo.classList.remove("hidden");
    
    renderUnitGroupLevel();
    showProductFooter();
  }

  function renderUnitGroupLevel() {
    if (!unitLevelGroup || !unitLevelPicker) return;
    unitLevelPicker.classList.add("hidden");
    unitLevelGroup.classList.remove("hidden");
    
    const isEdit = state.unitPanel.mode === "edit" || state.unitPanel.mode === "create";
    const data = isEdit && state.unitDraft ? state.unitDraft : state.unitDetails;
    
    if (!data) return;
    
    // Заполняем форму
    if (unitTitleInput) {
      unitTitleInput.value = data.unit?.title || "";
      unitTitleInput.disabled = !isEdit;
    }
    if (unitShortTitleInput) {
      unitShortTitleInput.value = data.unit?.short_title || "";
      unitShortTitleInput.disabled = !isEdit;
    }
    if (unitIsActiveInput) {
      unitIsActiveInput.checked = data.unit?.is_active ? true : false;
      unitIsActiveInput.disabled = !isEdit;
    }
    
    // Рендерим конверсии
    renderUnitConversionsList();
    
    // Показываем/скрываем кнопку добавления конверсии
    if (unitConversionsAddBtn) {
      unitConversionsAddBtn.classList.toggle("hidden", !isEdit);
    }
  }

  function renderUnitConversionsList() {
    if (!unitConversionsList) return;
    
    const isEdit = state.unitPanel.mode === "edit" || state.unitPanel.mode === "create";
    const data = isEdit && state.unitDraft ? state.unitDraft : state.unitDetails;
    
    if (!data || !data.unit) {
      unitConversionsList.innerHTML = "";
      return;
    }
    
    const conversions = data.conversions || [];
    const currentUnit = data.unit;
    
    if (!conversions.length) {
      unitConversionsList.innerHTML = '<div class="muted" style="padding: 16px; text-align: center;">Нет конверсий</div>';
      return;
    }
    
    unitConversionsList.innerHTML = conversions.map((conv, idx) => {
      const fromUnit = conv.from_unit || currentUnit;
      const toUnit = conv.to_unit;
      const factor = conv.factor || 1;
      const conversionId = conv.id || `temp-${idx}`;
      
      return `
        <div class="unit-conversion-row" data-conversion-id="${conversionId}" data-conversion-index="${idx}">
          <div class="unit-conversion-from">${escapeHtml(fromUnit.short_title || fromUnit.title || "")}</div>
          <div class="unit-conversion-arrow">→</div>
          <div class="unit-conversion-to">${escapeHtml(toUnit.short_title || toUnit.title || "")}</div>
          <input 
            class="control unit-conversion-factor" 
            type="number" 
            step="0.000001" 
            data-conversion-factor="${idx}" 
            value="${factor}" 
            ${isEdit ? "" : "disabled"}
            placeholder="1" 
          />
          ${isEdit ? `<button class="btn btn-icon unit-conversion-delete" type="button" data-conversion-delete="${idx}" title="Удалить" aria-label="Удалить">
            <i class="fas fa-times"></i>
          </button>` : ""}
        </div>
      `;
    }).join("");
    
    // Обработчики для изменения коэффициента
    if (isEdit) {
      unitConversionsList.querySelectorAll("[data-conversion-factor]").forEach((input) => {
        input.addEventListener("input", () => {
          const idx = Number(input.dataset.conversionFactor);
          if (!state.unitDraft || !state.unitDraft.conversions) return;
          const factor = Number(input.value) || 0;
          if (state.unitDraft.conversions[idx]) {
            state.unitDraft.conversions[idx].factor = factor;
          }
        });
      });
      
      // Обработчики для удаления конверсии
      unitConversionsList.querySelectorAll("[data-conversion-delete]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.conversionDelete);
          if (!state.unitDraft || !state.unitDraft.conversions) return;
          state.unitDraft.conversions.splice(idx, 1);
          renderUnitConversionsList();
        });
      });
    }
  }

  function showProductFooter() {
    const footer = $("#productInfoFooter");
    if (!footer) return;
    
    if (state.unitPanel.mode === "view") {
      showProductFooterView();
    } else {
      showProductFooterEdit();
    }
  }

  async function openUnitPicker() {
    if (!state.unitDraft) return;
    state.unitPanel.level = "picker";
    state.unitPanel.pickerSelection = null;
    state.unitPanel.pickerQuery = "";
    if (unitPickerSearch) unitPickerSearch.value = "";
    await refreshUnitPickerList();
    renderUnitPickerLevel();
  }

  async function refreshUnitPickerList() {
    if (!unitPickerList) return;
    const query = (unitPickerSearch?.value || "").trim().toLowerCase();
    const currentUnitId = state.selectedUnitId;
    
    const filtered = state.units
      .filter((u) => {
        if (Number(u.id) === Number(currentUnitId)) return false;
        if (!query) return true;
        const title = String(u.title || "").toLowerCase();
        const shortTitle = String(u.short_title || "").toLowerCase();
        return title.includes(query) || shortTitle.includes(query);
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    
    unitPickerList.innerHTML = filtered.map((unit) => {
      const isSelected = state.unitPanel.pickerSelection === Number(unit.id);
      return `
        <div class="option-picker-row ${isSelected ? "is-selected" : ""}" data-unit-picker-id="${unit.id}">
          <div class="option-picker-meta">
            <div class="options-row-title">${escapeHtml(unit.title || "")}</div>
            <div class="options-row-meta">${escapeHtml(unit.short_title || "")}</div>
          </div>
        </div>
      `;
    }).join("");
    
    unitPickerList.querySelectorAll("[data-unit-picker-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.unitPickerId);
        if (!Number.isFinite(id)) return;
        state.unitPanel.pickerSelection = id;
        refreshUnitPickerList();
      });
    });
  }

  function renderUnitPickerLevel() {
    if (!unitLevelPicker || !unitLevelGroup) return;
    unitLevelGroup.classList.add("hidden");
    unitLevelPicker.classList.remove("hidden");
    showProductFooterEdit();
    
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn) {
      if (!unitPickerSavedFooterState) {
        unitPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: footerCancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: footerCancelBtn.classList.contains("is-fullwidth"),
        };
        unitPickerSavedHandlers = {
          cancel: footerCancelBtn.onclick,
          save: footerSaveBtn.onclick,
        };
      }
      
      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");
      
      footerCancelBtn.classList.remove("is-confirm");
      footerCancelBtn.classList.add("is-fullwidth");
      if (!footerCancelBtn.dataset.pickerOriginalHtml) {
        footerCancelBtn.dataset.pickerOriginalHtml = footerCancelBtn.innerHTML;
      }
      footerCancelBtn.textContent = "Отменить";
      footerCancelBtn.title = "Отменить";
      footerCancelBtn.setAttribute("aria-label", "Отменить");
    }
    
    if (footerCancelBtn) {
      footerCancelBtn.dataset.pickerType = "unit";
    }
    if (footerSaveBtn) {
      footerSaveBtn.dataset.pickerType = "unit";
    }
    
    window._closeUnitPickerFn = () => {
      if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
      if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
      delete window._closeUnitPickerFn;
      delete window._saveUnitPickerFn;
      restoreUnitPickerFooter();
      state.unitPanel.level = "group";
      renderUnitGroupLevel();
    };
    
    window._saveUnitPickerFn = async () => {
      await applyUnitPickerSelection();
    };
  }

  function restoreUnitPickerFooter() {
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn && unitPickerSavedFooterState) {
      if (unitPickerSavedFooterState.footerHidden) {
        footer.classList.add("hidden");
      } else {
        footer.classList.remove("hidden");
      }
      if (unitPickerSavedFooterState.viewHidden) {
        footerView.classList.add("hidden");
      } else {
        footerView.classList.remove("hidden");
      }
      if (unitPickerSavedFooterState.editHidden) {
        footerEditMode.classList.add("hidden");
      } else {
        footerEditMode.classList.remove("hidden");
      }
      if (footerDeleteBtn) {
        if (unitPickerSavedFooterState.deleteBtnHidden) {
          footerDeleteBtn.classList.add("hidden");
        } else {
          footerDeleteBtn.classList.remove("hidden");
        }
      }
      if (footerMoreBtn) {
        if (unitPickerSavedFooterState.moreBtnHidden) {
          footerMoreBtn.classList.add("hidden");
        } else {
          footerMoreBtn.classList.remove("hidden");
        }
      }
      
      if (unitPickerSavedFooterState.cancelBtnIsConfirm) {
        footerCancelBtn.classList.add("is-confirm");
      } else {
        footerCancelBtn.classList.remove("is-confirm");
      }
      if (unitPickerSavedFooterState.cancelBtnIsFullwidth) {
        footerCancelBtn.classList.add("is-fullwidth");
      } else {
        footerCancelBtn.classList.remove("is-fullwidth");
      }
      
      if (footerCancelBtn.dataset.pickerOriginalHtml) {
        footerCancelBtn.innerHTML = footerCancelBtn.dataset.pickerOriginalHtml;
        delete footerCancelBtn.dataset.pickerOriginalHtml;
      }
      
      if (unitPickerSavedHandlers) {
        footerCancelBtn.onclick = unitPickerSavedHandlers.cancel;
        footerSaveBtn.onclick = unitPickerSavedHandlers.save;
      }
      
      unitPickerSavedFooterState = null;
      unitPickerSavedHandlers = null;
    }
  }

  async function applyUnitPickerSelection() {
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
    if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
    delete window._closeUnitPickerFn;
    delete window._saveUnitPickerFn;
    restoreUnitPickerFooter();
    
    const selectedId = state.unitPanel.pickerSelection;
    if (!selectedId || !Number.isFinite(selectedId)) {
      state.unitPanel.level = "group";
      renderUnitGroupLevel();
      return;
    }
    
    const selectedUnit = state.units.find((u) => Number(u.id) === Number(selectedId));
    if (!selectedUnit || !state.unitDraft) {
      state.unitPanel.level = "group";
      renderUnitGroupLevel();
      return;
    }
    
    // Добавляем конверсию в черновик
    if (!state.unitDraft.conversions) {
      state.unitDraft.conversions = [];
    }
    
    const currentUnitId = state.selectedUnitId;
    state.unitDraft.conversions.push({
      tempId: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      from_unit_id: Number(currentUnitId),
      to_unit_id: Number(selectedId),
      from_unit: state.unitDraft.unit,
      to_unit: selectedUnit,
      factor: 1,
      isNew: true,
    });
    
    state.unitPanel.level = "group";
    renderUnitGroupLevel();
  }

  function syncUnitDraftFromForm() {
    if (!state.unitDraft) return;
    if (unitTitleInput) {
      state.unitDraft.unit.title = unitTitleInput.value.trim();
    }
    if (unitShortTitleInput) {
      state.unitDraft.unit.short_title = unitShortTitleInput.value.trim() || null;
    }
    if (unitIsActiveInput) {
      state.unitDraft.unit.is_active = unitIsActiveInput.checked ? 1 : 0;
    }
  }

  async function saveUnit() {
    if (!state.unitDraft) return;
    
    syncUnitDraftFromForm();
    
    if (!state.unitDraft.unit.title) {
      if (unitTitleInput) unitTitleInput.focus();
      alert("Название единицы измерения обязательно");
      return;
    }
    
    try {
      let unitId;
      
      if (state.unitPanel.mode === "create") {
        const res = await apiCreateUnit(state.unitDraft.unit);
        unitId = res.id;
        state.selectedUnitId = unitId;
      } else if (state.unitPanel.mode === "edit") {
        unitId = Number(state.selectedUnitId);
        await apiUpdateUnit(unitId, state.unitDraft.unit);
      } else {
        return;
      }
      
      // Сохраняем конверсии
      if (state.unitDraft.conversions && Array.isArray(state.unitDraft.conversions)) {
        // Загружаем текущие конверсии для единицы
        await loadUnitConversions();
        const existingConversions = loadUnitConversionsForUnit(unitId);
        const existingIds = new Set(existingConversions.map(c => c.id).filter(id => id && !String(id).startsWith("temp")));
        
        // Удаляем конверсии, которые были удалены
        for (const existing of existingConversions) {
          if (existing.id && !existing.id.toString().startsWith("temp")) {
            const stillExists = state.unitDraft.conversions.some(
              c => (c.id && c.id === existing.id) || 
                   (c.from_unit_id === existing.from_unit_id && c.to_unit_id === existing.to_unit_id)
            );
            if (!stillExists) {
              try {
                await api(`/api/admin/unit-conversions/${existing.id}`, { method: "DELETE" });
              } catch (e) {
                console.error("Failed to delete conversion", e);
              }
            }
          }
        }
        
        // Создаем/обновляем конверсии
        for (const conv of state.unitDraft.conversions) {
          if (conv.is_direct === false) continue; // Пропускаем обратные конверсии
          
          const payload = {
            from_unit_id: Number(conv.from_unit_id),
            to_unit_id: Number(conv.to_unit_id),
            factor: Number(conv.factor) || 1,
          };
          
          if (conv.id && !String(conv.id).startsWith("temp")) {
            // Обновляем существующую конверсию
            try {
              await api(`/api/admin/unit-conversions/${conv.id}`, {
                method: "PUT",
                body: JSON.stringify(payload),
              });
            } catch (e) {
              console.error("Failed to update conversion", e);
            }
          } else {
            // Создаем новую конверсию
            try {
              await api("/api/admin/unit-conversions", {
                method: "POST",
                body: JSON.stringify(payload),
              });
            } catch (e) {
              console.error("Failed to create conversion", e);
            }
          }
        }
      }
      
      // Загружаем актуальные данные с сервера
      await loadUnitsManagement();
      await loadUnitConversions();
      await loadUnitDetails(unitId);
      renderUnitsList();
      
      // Заменяем временный таб на постоянный (если был создан новый)
      if (state.unitPanel.tabKey && state.unitPanel.mode === "create") {
        const unit = state.unitDetails?.unit;
        if (unit && unit.id) {
          replaceTabKey(state.unitPanel.tabKey, {
            type: "unit",
            id: unit.id,
            title: unit.title || "Единица измерения",
            onActivate: async () => {
              state.selectedUnitId = unit.id;
              await loadUnitDetails(unit.id);
              renderUnitsList();
              showUnitDetails(state.unitDetails, { mode: "view" });
            },
          });
          state.unitPanel.tabKey = buildTabKey("unit", unit.id);
        }
      }
      
      // Очищаем черновик
      state.unitDraft = null;
      state.unitPanel.snapshotData = null;
      
      // Переключаемся в режим просмотра
      state.unitPanel.mode = "view";
      showUnitDetails(state.unitDetails, { mode: "view" });
    } catch (e) {
      console.error("Failed to save unit", e);
      alert("Ошибка при сохранении единицы измерения");
    }
  }

  function cancelUnitEdit() {
    if (state.unitPanel.level === "picker") {
      if (window._closeUnitPickerFn) {
        window._closeUnitPickerFn();
      }
      return;
    }
    
    if (state.unitPanel.mode === "create") {
      // Закрываем таб, если он был создан
      if (state.unitPanel.tabKey) {
        closeTab(state.unitPanel.tabKey);
      }
      state.selectedUnitId = null;
      state.unitDetails = null;
      state.unitDraft = null;
      state.unitPanel.tabKey = null;
      showDetailsEmpty();
      return;
    }
    
    // Восстанавливаем из snapshot
    if (state.unitPanel.snapshotData) {
      state.unitDetails = JSON.parse(JSON.stringify(state.unitPanel.snapshotData));
    }
    
    state.unitDraft = null;
    state.unitPanel.snapshotData = null;
    state.unitPanel.mode = "view";
    showUnitDetails(state.unitDetails, { mode: "view" });
  }

  function renderConversionsList() {
    if (!conversionsList || !conversionsEmptyHint) return;
    const list = state.unitConversions
      .slice()
      .sort((a, b) => a.id - b.id);

    if (!list.length) {
      conversionsList.innerHTML = "";
      conversionsEmptyHint.classList.remove("hidden");
      return;
    }
    conversionsEmptyHint.classList.add("hidden");

    conversionsList.innerHTML = list.map((conv) => {
      const fromUnit = state.units.find((u) => Number(u.id) === Number(conv.from_unit_id));
      const toUnit = state.units.find((u) => Number(u.id) === Number(conv.to_unit_id));
      return `
        <div class="conversion-row" data-conv-id="${conv.id}">
          <div>${escapeHtml(fromUnit?.short_title || fromUnit?.code || fromUnit?.title || "—")}</div>
          <div>→</div>
          <div>${escapeHtml(toUnit?.short_title || toUnit?.code || toUnit?.title || "—")}</div>
          <input class="control" type="number" step="0.000001" data-conv-factor value="${conv.factor}" />
          <label class="switch switch-compact">
            <input class="switch-input" type="checkbox" data-conv-active ${conv.is_active ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
          <button class="btn btn-sm" type="button" data-conv-save>Сохранить</button>
          <button class="btn btn-sm unit-delete" type="button" data-conv-delete title="Удалить">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
    }).join("");

    conversionsList.querySelectorAll("[data-conv-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-conv-id]");
        if (!row) return;
        const id = Number(row.dataset.convId);
        const factor = Number(row.querySelector("[data-conv-factor]")?.value);
        const active = row.querySelector("[data-conv-active]")?.checked ? 1 : 0;
        const conv = state.unitConversions.find((c) => Number(c.id) === id);
        if (!conv) return;
        if (!Number.isFinite(factor) || factor <= 0) return;
        try {
          await api("/api/admin/unit-conversions/" + id, {
            method: "PUT",
            body: JSON.stringify({
              from_unit_id: conv.from_unit_id,
              to_unit_id: conv.to_unit_id,
              factor,
              is_active: active,
            }),
          });
          await loadUnitConversions();
          renderConversionsList();
        } catch (e) {
          console.error("Failed to update conversion", e);
          alert("Ошибка при сохранении конверсии");
        }
      });
    });

    conversionsList.querySelectorAll("[data-conv-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const row = btn.closest("[data-conv-id]");
        if (!row) return;
        const id = Number(row.dataset.convId);
        if (!Number.isFinite(id)) return;
        if (!confirm("Удалить конверсию?")) return;
        try {
          await api("/api/admin/unit-conversions/" + id, { method: "DELETE" });
          await loadUnitConversions();
          renderConversionsList();
        } catch (e) {
          console.error("Failed to delete conversion", e);
          alert("Ошибка при удалении конверсии");
        }
      });
    });
  }

  // ---------------- Render: left nav ----------------

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function looksLikeUrl(v) {
    const s = String(v || "").trim();
    return (
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("blob:") ||
      s.startsWith("data:") ||
      s.startsWith("/static/") ||
      s.startsWith("/uploads/")
    );
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function getSelectionLabel(type) {
    if (type === "multiple_group") return "Несколько (лимит группы)";
    if (type === "multiple_item") return "Несколько (лимит на товар)";
    return type === "multiple" ? "Несколько" : "Один";
  }

  function getSelectionUiTypeFromItems(items = []) {
    const hasItemLimits = items.some((item) => {
      const min = item.qty_min ?? 1;
      const max = item.qty_max ?? 1;
      return min !== 1 || max !== 1;
    });
    return hasItemLimits ? "multiple_item" : "multiple_group";
  }

  function getSelectionUiTypeFromGroup(group, items = []) {
    if (!group || group.selection_type !== "multiple") return "single";
    return getSelectionUiTypeFromItems(items);
  }

  function getSelectionPayloadType(selectionUi) {
    return selectionUi === "single" ? "single" : "multiple";
  }

function getOptionGroupUiValues(group, items = []) {
  if (!group) return null;
  return {
    title: group.title || "",
    selection_type: getSelectionUiTypeFromGroup(group, items),
    min_select: group.min_select ?? 0,
    max_select: group.max_select == null ? null : Number(group.max_select),
    is_active: group.is_active ? 1 : 0,
    is_required: (group.selection_type === "single" ? (group.is_required ? 1 : 0) : 0),
    allow_variants: group.allow_variants ? 1 : 0,
    out_of_stock_action: group.out_of_stock_action == null ? 1 : Number(group.out_of_stock_action),
    sort_order: group.sort_order ?? 0,
  };
}

function buildOptionGroupPayload(formValues) {
  const selectionUi = formValues.selection_type;

  const payloadType = getSelectionPayloadType(selectionUi); // single | multiple

  return {
    ...formValues,
    selection_type: payloadType,
    min_select: selectionUi === "multiple_group" ? formValues.min_select : 0,
    max_select: selectionUi === "multiple_group" ? formValues.max_select : null,

    // ✅ только single
    is_required: payloadType === "single" ? (formValues.is_required ? 1 : 0) : 0,
  };
}

  function renderCategoryIcon(icon, className = "stage-icon") {
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      return `<span class="${className}"><img src="${escapeHtml(v)}" alt="" /></span>`;
    }
    const cls = v || "fas fa-folder";
    return `<span class="${className}"><i class="${escapeHtml(cls)}"></i></span>`;
  }

  function renderCategoriesNav() {
    if (!categoriesNav) return;

    const list = state.categories
      .filter((c) => c.parent_id == null)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    categoriesNav.innerHTML = list.map((c) => {
      const isActive = state.mode === "products" && Number(c.id) === getCategoryNavActiveId(state.currentCategoryId);
      return `
        <button class="stage-item ${isActive ? "is-active" : ""}" type="button" data-category-id="${c.id}">
          ${renderCategoryIcon(c.icon, "stage-icon")}
          <span class="stage-meta stage-text"><b>${escapeHtml(c.title)}</b></span>
          <span class="acc-spacer"></span>
        </button>
      `;
    }).join("");

    // ✅ после рендера: аккордеон должен раскрыться до конца
    requestAnimationFrame(refreshOpenAccordions);
  }

  function renderOptionGroupsList(listEl = optionsGroupsList, emptyEl = optionsGroupsEmpty) {
    if (!listEl || !emptyEl) return;
    const list = getFilteredOptionGroups()
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    if (!list.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");
    listEl.innerHTML = list.map((group) => {
      const maxLabel = group.max_select == null ? "∞" : group.max_select;
      const isActive = group.id === state.selectedOptionGroupId;
      const disableSwitch = state.optionPanel.mode !== "view" || state.optionPanel.activeToggleBusy;
      return `
        <div class="options-row ${isActive ? "is-active" : ""}" data-option-group-id="${group.id}">
          <div>
            <div class="options-row-title">${escapeHtml(group.title || "")}</div>
            <div class="options-row-meta">Тип: ${escapeHtml(getSelectionLabel(group.selection_type))}</div>
          </div>
          <div class="options-row-meta">Лимит: ${escapeHtml(maxLabel)}</div>
          <div class="options-row-meta">Пункты: ${group.items_count ?? 0}</div>
          <div class="options-row-meta">Назначения: ${group.assignments_count ?? 0}</div>
          <div class="options-row-meta">
            <label class="switch switch-compact options-row-active">
              <input class="switch-input" type="checkbox" data-option-active-id="${group.id}" ${group.is_active ? "checked" : ""} ${disableSwitch ? "disabled" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span class="switch-text">Активна</span>
            </label>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll("[data-option-group-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.optionGroupId);
        if (!Number.isFinite(id)) return;
        state.selectedOptionGroupId = id;
        state.optionPanel.returnTo = null;
        await loadOptionGroupDetails(id);
        renderAllOptionGroupsLists();
        showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
        const group = state.optionGroups.find((g) => Number(g.id) === id);
        openOptionGroupTab(id, group?.title || "Опция", { activate: false });
      });
    });

    listEl.querySelectorAll("[data-option-active-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const id = Number(input.dataset.optionActiveId);
        if (!Number.isFinite(id)) return;
        handleOptionListActiveToggle(id, input.checked);
      });
    });
  }

  function renderAllOptionGroupsLists() {
    renderOptionGroupsList();
    // Не рендерим варианты здесь, только опции
  }

  function formatAutoAddRuleSummary(item) {
    const parts = [];
    const defQty = Number(item.default_qty || 0);
    const minQty = Number(item.min_qty || 0);
    const maxQty = item.max_qty != null ? Number(item.max_qty) : null;
    const freeFirst = Number(item.free_first_qty || 0);
    const freePer = item.free_per_amount != null ? Number(item.free_per_amount) : null;
    const freePerQty = Number(item.free_per_amount_qty || 0);
    const maxFree = item.max_free_qty != null ? Number(item.max_free_qty) : null;

    if (defQty > 0) parts.push(`по умолчанию ${defQty} шт.`);
    if (minQty > 0 && minQty !== defQty) parts.push(`мин ${minQty} шт.`);
    if (maxQty != null) parts.push(`макс ${maxQty} шт.`);
    if (freeFirst > 0) parts.push(`первые ${freeFirst} бесплатно`);
    if (freePer && freePer > 0 && freePerQty > 0) parts.push(`${freePerQty} бесплатно / ${formatMoney(freePer)}`);
    if (maxFree != null) parts.push(`лимит бесплатно ${maxFree} шт.`);
    if (item.price_override != null) parts.push(`цена ${formatMoney(item.price_override)}`);
    return parts.join(" • ") || "—";
  }

  async function loadAutoAddManagement() {
    try {
      const res = await apiGetAutoAddGroups();
      const data = res.data || {};
      state.autoAddGroups = Array.isArray(data.groups) ? data.groups : [];
      state.autoAddItems = Array.isArray(data.items) ? data.items : [];
    } catch (e) {
      console.error("Failed to load auto-add groups", e);
      state.autoAddGroups = [];
      state.autoAddItems = [];
    }
  }

  function renderAutoAddGroupsList(listEl = autoAddGroupsList, emptyEl = autoAddGroupsEmpty) {
    if (!listEl || !emptyEl) return;

    const groups = state.autoAddGroups
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    if (!groups.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");

    const itemsByGroup = new Map();
    state.autoAddItems.forEach((item) => {
      const gid = Number(item.group_id);
      if (!Number.isFinite(gid)) return;
      if (!itemsByGroup.has(gid)) itemsByGroup.set(gid, []);
      itemsByGroup.get(gid).push(item);
    });

    const disableSwitch = state.autoAddPanel.mode !== "view";

    listEl.innerHTML = groups.map((group) => {
      const items = itemsByGroup.get(Number(group.id)) || [];
      const isActive = Number(group.id) === Number(state.selectedAutoAddGroupId);
      return `
        <div class="options-row ${isActive ? "is-active" : ""}" data-auto-group-id="${group.id}">
          <div>
            <div class="options-row-title">${escapeHtml(group.title || "")}</div>
            ${group.description ? `<div class="options-row-meta">${escapeHtml(group.description)}</div>` : ""}
          </div>
          <div class="options-row-meta">Товаров: ${items.length}</div>
          <div class="options-row-meta">Сортировка: ${group.sort_order ?? 0}</div>
          <div class="options-row-meta">
            <label class="switch switch-compact options-row-active">
              <input class="switch-input" type="checkbox" data-auto-group-active-id="${group.id}" ${group.is_active ? "checked" : ""} ${disableSwitch ? "disabled" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span class="switch-text">Активна</span>
            </label>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll("[data-auto-group-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.autoGroupId);
        if (!Number.isFinite(id)) return;
        state.selectedAutoAddGroupId = id;
        const details = buildAutoAddGroupDetails(id);
        if (!details) {
          await loadAutoAddManagement();
          state.autoAddGroupDetails = buildAutoAddGroupDetails(id);
        } else {
          state.autoAddGroupDetails = details;
        }
        renderAutoAddGroupsList();
        if (state.autoAddGroupDetails) {
          showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
        }
        const group = state.autoAddGroups.find((g) => Number(g.id) === id);
        openAutoAddGroupTab(id, group?.title || "Автодобавление", { activate: false });
      });
    });

    listEl.querySelectorAll("[data-auto-group-active-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        if (disableSwitch) return;
        const id = Number(input.dataset.autoGroupActiveId);
        if (!Number.isFinite(id)) return;
        const group = state.autoAddGroups.find((g) => Number(g.id) === id);
        if (!group) return;
        try {
          await apiPatchAutoAddGroup(id, { is_active: input.checked ? 1 : 0 });
          await loadAutoAddManagement();
          renderAutoAddGroupsList();
        } catch (e) {
          console.error("Failed to toggle auto-add group", e);
          input.checked = !input.checked;
          alert("Не удалось обновить статус автодобавления.");
        }
      });
    });
  }

function buildAutoAddGroupDetails(groupId) {
    const group = state.autoAddGroups.find((g) => Number(g.id) === Number(groupId));
    if (!group) return null;
    const items = state.autoAddItems
      .filter((item) => Number(item.group_id) === Number(groupId))
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
    return { group, items };
  }

  function isAutoAddEditable() {
    return state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create";
  }

  function getAutoAddItemsSource() {
    if (state.autoAddPanel.mode === "create" || state.autoAddPanel.mode === "edit") {
      return state.autoAddDraft?.items || [];
    }
    return state.autoAddGroupDetails?.items || [];
  }

  function getAutoAddGroupFormValues() {
    return {
      title: (autoAddGroupTitleInput?.value || "").trim(),
      description: (autoAddGroupDescInput?.value || "").trim() || null,
      sort_order: autoAddGroupSortInput?.value ? Number(autoAddGroupSortInput.value) : 0,
      is_active: autoAddGroupIsActiveInput?.checked ? 1 : 0,
      min_cart_amount: autoAddMinAmountInput?.value === "" || autoAddMinAmountInput?.value == null
        ? null
        : Number(autoAddMinAmountInput.value),
      max_cart_amount: autoAddMaxAmountInput?.value === "" || autoAddMaxAmountInput?.value == null
        ? null
        : Number(autoAddMaxAmountInput.value),
      include_auto_in_total: autoAddIncludeAutoTotalInput?.checked ? 1 : 0,
      max_items_qty: autoAddMaxItemsQtyInput?.value === "" || autoAddMaxItemsQtyInput?.value == null
        ? null
        : Number(autoAddMaxItemsQtyInput.value),
      allow_customer_qty: autoAddAllowCustomerQtyInput?.checked ? 1 : 0,
      allow_customer_remove: autoAddAllowCustomerRemoveInput?.checked ? 1 : 0,
    };
  }

  function syncAutoAddDraftGroupFromForm() {
    if (!state.autoAddDraft) return;
    state.autoAddDraft.group = { ...state.autoAddDraft.group, ...getAutoAddGroupFormValues() };
  }

  function persistAutoAddEditState() {
    if (state.autoAddPanel.mode !== "edit" || !state.selectedAutoAddGroupId || !state.autoAddDraft) return;
    editingAutoAdds.set(state.selectedAutoAddGroupId, {
      mode: "edit",
      autoAddDraft: deepClone(state.autoAddDraft),
      snapshotData: deepClone(state.autoAddPanel.snapshotData),
    });
  }

  function setAutoAddGroupFormDisabled(disabled) {
    if (autoAddGroupTitleInput) autoAddGroupTitleInput.disabled = disabled;
    if (autoAddGroupDescInput) autoAddGroupDescInput.disabled = disabled;
    if (autoAddGroupSortInput) autoAddGroupSortInput.disabled = disabled;
    if (autoAddGroupIsActiveInput) autoAddGroupIsActiveInput.disabled = disabled;
    if (autoAddMinAmountInput) autoAddMinAmountInput.disabled = disabled;
    if (autoAddMaxAmountInput) autoAddMaxAmountInput.disabled = disabled;
    if (autoAddIncludeAutoTotalInput) autoAddIncludeAutoTotalInput.disabled = disabled;
    if (autoAddMaxItemsQtyInput) autoAddMaxItemsQtyInput.disabled = disabled;
    if (autoAddAllowCustomerQtyInput) autoAddAllowCustomerQtyInput.disabled = disabled;
    if (autoAddAllowCustomerRemoveInput) autoAddAllowCustomerRemoveInput.disabled = disabled;
  }

  function fillAutoAddGroupForm(group) {
    if (!autoAddGroupForm || !group) return;
    if (autoAddGroupTitleInput) autoAddGroupTitleInput.value = group.title || "";
    if (autoAddGroupDescInput) autoAddGroupDescInput.value = group.description || "";
    if (autoAddGroupSortInput) autoAddGroupSortInput.value = group.sort_order ?? 0;
    if (autoAddGroupIsActiveInput) autoAddGroupIsActiveInput.checked = Number(group.is_active || 0) === 1;
    if (autoAddMinAmountInput) {
      autoAddMinAmountInput.value = group.min_cart_amount != null ? group.min_cart_amount : "";
    }
    if (autoAddMaxAmountInput) {
      autoAddMaxAmountInput.value = group.max_cart_amount != null ? group.max_cart_amount : "";
    }
    if (autoAddIncludeAutoTotalInput) {
      autoAddIncludeAutoTotalInput.checked = Number(group.include_auto_in_total || 0) === 1;
    }
    if (autoAddMaxItemsQtyInput) {
      autoAddMaxItemsQtyInput.value = group.max_items_qty != null ? group.max_items_qty : "";
    }
    if (autoAddAllowCustomerQtyInput) {
      const allowQty = group.allow_customer_qty == null ? 1 : group.allow_customer_qty;
      autoAddAllowCustomerQtyInput.checked = Number(allowQty) === 1;
    }
    if (autoAddAllowCustomerRemoveInput) {
      const allowRemove = group.allow_customer_remove == null ? 1 : group.allow_customer_remove;
      autoAddAllowCustomerRemoveInput.checked = Number(allowRemove) === 1;
    }
  }

  function getAutoAddItemKey(item) {
    return String(item?.tempId ?? item?.id ?? item?.product_id ?? "");
  }

  function getAutoAddDraftItemByKey(key) {
    if (!state.autoAddDraft || !Array.isArray(state.autoAddDraft.items)) return null;
    return state.autoAddDraft.items.find(
      (item) => String(item.tempId ?? item.id ?? item.product_id) === String(key)
    );
  }

  function createAutoAddDraftItem() {
    const index = Array.isArray(state.autoAddDraft?.items) ? state.autoAddDraft.items.length : 0;
    return {
      tempId: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      product_id: null,
      product_name: "",
      default_qty: 1,
      min_qty: 1,
      max_qty: null,
      price_override: null,
      free_first_qty: 0,
      free_per_amount: null,
      free_per_amount_qty: 1,
      max_free_qty: null,
      sort_order: index * 10,
      is_active: 1,
    };
  }

  function buildAutoAddItemPayload(item, idx = 0) {
    return {
      product_id: Number(item.product_id),
      default_qty: Math.max(0, Number(item.default_qty || 0)),
      min_qty: Math.max(0, Number(item.min_qty || 0)),
      max_qty: item.max_qty != null && item.max_qty !== "" ? Math.max(0, Number(item.max_qty)) : null,
      price_override: item.price_override != null && item.price_override !== "" ? Number(item.price_override) : null,
      free_first_qty: Math.max(0, Number(item.free_first_qty || 0)),
      free_per_amount: item.free_per_amount != null && item.free_per_amount !== "" ? Number(item.free_per_amount) : null,
      free_per_amount_qty: Math.max(1, Number(item.free_per_amount_qty || 1)),
      max_free_qty: item.max_free_qty != null && item.max_free_qty !== "" ? Number(item.max_free_qty) : null,
      sort_order: item.sort_order != null && item.sort_order !== "" ? Number(item.sort_order) : idx * 10,
      is_active: item.is_active === 0 ? 0 : 1,
    };
  }

  function renderAutoAddItems(items) {
    if (!autoAddItemsList) return;
    const editable = isAutoAddEditable();

    if (!items.length) {
      autoAddItemsList.innerHTML = `<div class="empty-hint">Пока нет товаров...</div>`;
      return;
    }

    autoAddItemsList.innerHTML = items.map((item, idx) => {
      const key = getAutoAddItemKey(item) || `auto-${idx}`;
      const safeName = escapeHtml(item.product_name || "");
      const selectedLabel = safeName || "Не выбран";
      const defaultQty = item.default_qty ?? 1;
      const minQty = item.min_qty ?? 1;
      const maxQty = item.max_qty ?? "";
      const priceOverride = item.price_override ?? "";
      const freeFirst = item.free_first_qty ?? 0;
      const freePerAmount = item.free_per_amount ?? "";
      const freePerQty = item.free_per_amount_qty ?? 1;
      const maxFree = item.max_free_qty ?? "";
      const sortOrder = item.sort_order ?? 0;
      const isActive = item.is_active === 0 ? "" : "checked";
      const disabled = editable ? "" : "disabled";

      return `
        <div class="option-item-row auto-add-item-card" data-auto-item-key="${key}">
          <div class="auto-add-item-header">
            <div class="auto-add-item-title">
              <label class="field-label">Товар *</label>
              <input class="control auto-add-item-search" type="search" placeholder="Начните вводить название..." data-auto-item-search="${key}" value="${safeName}" ${disabled} />
              <div class="options-list auto-add-search-results" data-auto-item-results="${key}"></div>
              <div class="options-row-meta auto-add-item-selected" data-auto-item-selected="${key}">${selectedLabel}</div>
            </div>
            <div class="auto-add-item-actions">
              <label class="switch switch-compact">
                <input class="switch-input" type="checkbox" data-auto-item-field="is_active" data-auto-item-key="${key}" ${isActive} ${disabled} />
                <span class="switch-ui" aria-hidden="true"></span>
                <span class="switch-text">Активен</span>
              </label>
              ${editable ? `
                <button class="btn btn-icon auto-add-item-remove" type="button" data-auto-item-remove="${key}" title="Удалить" aria-label="Удалить товар">
                  <i class="fas fa-times"></i>
                </button>
              ` : ""}
            </div>
          </div>
          <div class="form-row-3 auto-add-item-row">
            <div>
              <label class="field-label">По умолчанию</label>
              <input class="control" type="number" min="0" data-auto-item-field="default_qty" data-auto-item-key="${key}" value="${defaultQty}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Мин.</label>
              <input class="control" type="number" min="0" data-auto-item-field="min_qty" data-auto-item-key="${key}" value="${minQty}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Макс.</label>
              <input class="control" type="number" min="0" data-auto-item-field="max_qty" data-auto-item-key="${key}" value="${maxQty}" ${disabled} />
            </div>
          </div>
          <div class="form-row-3 auto-add-item-row">
            <div>
              <label class="field-label">Цена (override)</label>
              <input class="control" type="number" min="0" step="0.01" data-auto-item-field="price_override" data-auto-item-key="${key}" value="${priceOverride}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Первые бесплатно</label>
              <input class="control" type="number" min="0" data-auto-item-field="free_first_qty" data-auto-item-key="${key}" value="${freeFirst}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Бесплатно за сумму</label>
              <input class="control" type="number" min="0" step="1" data-auto-item-field="free_per_amount" data-auto-item-key="${key}" value="${freePerAmount}" ${disabled} />
            </div>
          </div>
          <div class="form-row-3 auto-add-item-row">
            <div>
              <label class="field-label">Кол-во за сумму</label>
              <input class="control" type="number" min="1" data-auto-item-field="free_per_amount_qty" data-auto-item-key="${key}" value="${freePerQty}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Лимит бесплатно</label>
              <input class="control" type="number" min="0" data-auto-item-field="max_free_qty" data-auto-item-key="${key}" value="${maxFree}" ${disabled} />
            </div>
            <div>
              <label class="field-label">Сортировка</label>
              <input class="control" type="number" min="0" data-auto-item-field="sort_order" data-auto-item-key="${key}" value="${sortOrder}" ${disabled} />
            </div>
          </div>
        </div>
      `;
    }).join("");

    bindAutoAddItemsListEvents();
  }

  function bindAutoAddItemsListEvents() {
    if (!autoAddItemsList || autoAddItemsList.__bound) return;
    autoAddItemsList.__bound = true;

    autoAddItemsList.addEventListener("input", (event) => {
      if (!isAutoAddEditable()) return;
      const target = event.target;
      const searchInput = target.closest("[data-auto-item-search]");
      if (searchInput) {
        const key = searchInput.dataset.autoItemSearch;
        const row = searchInput.closest("[data-auto-item-key]");
        const resultsEl = row ? row.querySelector("[data-auto-item-results]") : null;
        scheduleAutoAddSearch(key, searchInput.value || "", resultsEl);
        return;
      }

      const fieldInput = target.closest("[data-auto-item-field]");
      if (!fieldInput) return;
      const field = fieldInput.dataset.autoItemField;
      const key = fieldInput.dataset.autoItemKey;
      const item = getAutoAddDraftItemByKey(key);
      if (!item || !field) return;

      if (field === "default_qty") {
        item.default_qty = Math.max(0, Number(fieldInput.value || 0));
      } else if (field === "min_qty") {
        item.min_qty = Math.max(0, Number(fieldInput.value || 0));
      } else if (field === "max_qty") {
        item.max_qty = fieldInput.value === "" ? null : Math.max(0, Number(fieldInput.value || 0));
      } else if (field === "price_override") {
        item.price_override = fieldInput.value === "" ? null : Number(fieldInput.value || 0);
      } else if (field === "free_first_qty") {
        item.free_first_qty = Math.max(0, Number(fieldInput.value || 0));
      } else if (field === "free_per_amount") {
        item.free_per_amount = fieldInput.value === "" ? null : Number(fieldInput.value || 0);
      } else if (field === "free_per_amount_qty") {
        item.free_per_amount_qty = Math.max(1, Number(fieldInput.value || 1));
      } else if (field === "max_free_qty") {
        item.max_free_qty = fieldInput.value === "" ? null : Math.max(0, Number(fieldInput.value || 0));
      } else if (field === "sort_order") {
        item.sort_order = fieldInput.value === "" ? 0 : Number(fieldInput.value || 0);
      }
      state.autoAddPanel.itemsDirty = true;
      persistAutoAddEditState();
    });

    autoAddItemsList.addEventListener("change", (event) => {
      if (!isAutoAddEditable()) return;
      const target = event.target;
      const fieldInput = target.closest("[data-auto-item-field]");
      if (!fieldInput) return;
      const field = fieldInput.dataset.autoItemField;
      const key = fieldInput.dataset.autoItemKey;
      const item = getAutoAddDraftItemByKey(key);
      if (!item || !field) return;
      if (field === "is_active") {
        item.is_active = fieldInput.checked ? 1 : 0;
        state.autoAddPanel.itemsDirty = true;
        persistAutoAddEditState();
      }
    });

    autoAddItemsList.addEventListener("click", (event) => {
      if (!isAutoAddEditable()) return;
      const removeBtn = event.target.closest("[data-auto-item-remove]");
      if (removeBtn) {
        const key = removeBtn.dataset.autoItemRemove;
        const item = getAutoAddDraftItemByKey(key);
        if (!item || !state.autoAddDraft) return;
        if (item.id) {
          state.autoAddDraft.removedItemIds = Array.isArray(state.autoAddDraft.removedItemIds)
            ? state.autoAddDraft.removedItemIds
            : [];
          state.autoAddDraft.removedItemIds.push(item.id);
        }
        state.autoAddDraft.items = state.autoAddDraft.items.filter(
          (x) => String(x.tempId ?? x.id ?? x.product_id) !== String(key)
        );
        state.autoAddPanel.itemsDirty = true;
        renderAutoAddItems(getAutoAddItemsSource());
        persistAutoAddEditState();
        return;
      }

      const pickBtn = event.target.closest("[data-auto-pick-id]");
      if (pickBtn) {
        const key = pickBtn.dataset.autoItemKey;
        const productId = Number(pickBtn.dataset.autoPickId || 0);
        const productName = pickBtn.dataset.autoPickName || "";
        const productPrice = pickBtn.dataset.autoPickPrice ? Number(pickBtn.dataset.autoPickPrice) : null;
        const item = getAutoAddDraftItemByKey(key);
        if (!item) return;
        item.product_id = productId;
        item.product_name = productName;
        if (Number.isFinite(productPrice)) {
          item.product_price = productPrice;
        }
        const row = pickBtn.closest("[data-auto-item-key]");
        if (row) {
          const searchInput = row.querySelector("[data-auto-item-search]");
          const selectedEl = row.querySelector("[data-auto-item-selected]");
          const resultsEl = row.querySelector("[data-auto-item-results]");
          if (searchInput) searchInput.value = productName;
          if (selectedEl) selectedEl.textContent = productName || "Не выбран";
          if (resultsEl) resultsEl.innerHTML = "";
        }
        state.autoAddPanel.itemsDirty = true;
        persistAutoAddEditState();
      }
    });
  }

  function scheduleAutoAddSearch(key, query, resultsEl) {
    if (!resultsEl) return;
    if (autoAddSearchTimers.has(key)) {
      clearTimeout(autoAddSearchTimers.get(key));
    }
    const q = String(query || "").trim();
    if (!q || q.length < 2) {
      resultsEl.innerHTML = "";
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await apiGetCatalogProducts({ query: q });
        const list = Array.isArray(res.data) ? res.data : [];
        resultsEl.innerHTML = list.map((p) => {
          const priceLabel = formatMoney(p.price || 0);
          return `
            <button class="options-row auto-add-pick-row" type="button" data-auto-item-key="${key}" data-auto-pick-id="${p.id}" data-auto-pick-name="${escapeHtml(p.name || "")}" data-auto-pick-price="${p.price || 0}">
              <div>
                <div class="options-row-title">${escapeHtml(p.name || "")}</div>
                <div class="options-row-meta">${priceLabel}</div>
              </div>
            </button>
          `;
        }).join("");
      } catch (e) {
        console.error("Auto-add search failed", e);
      }
    }, 300);
    autoAddSearchTimers.set(key, timer);
  }

  function renderAutoAddHeader() {
    if (state.autoAddPanel.level === "empty") {
      if (productInfoHeader) productInfoHeader.classList.add("hidden");
      return;
    }
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("product");
    if (productHeaderActions) productHeaderActions.classList.add("hidden");
    const isPicker = state.autoAddPanel.level === "picker";
    const groupTitle = String(state.autoAddDraft?.group?.title || state.autoAddGroupDetails?.group?.title || "").trim();
    const fallbackTitle = state.autoAddPanel.mode === "create" ? "Новое условие" : "—";
    if (productTitle) {
      productTitle.textContent = isPicker ? "Выбор товаров для автодобавления" : (groupTitle || fallbackTitle);
    }
    if (productSku) {
      productSku.textContent = isPicker ? `Выбрано: ${state.autoAddPanel.pickerSelection.size}` : "Автодобавления";
    }
  }

  function renderAutoAddPickerTabs() {
    if (!autoAddPickerTabs) return;
    const lastScroll = Number.isFinite(state.autoAddPanel.pickerTabsScrollLeft)
      ? state.autoAddPanel.pickerTabsScrollLeft
      : autoAddPickerTabs.scrollLeft;
    autoAddPickerTabs.innerHTML = state.catalogCategories.map((cat) => {
      const active = Number(cat.id) === Number(state.autoAddPanel.pickerCategoryId);
      return `
        <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
          ${escapeHtml(cat.title || "")}
        </button>
      `;
    }).join("");

    bindHorizontalScroll(autoAddPickerTabs);
    requestAnimationFrame(() => {
      autoAddPickerTabs.scrollLeft = lastScroll;
    });

    autoAddPickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.autoAddPanel.pickerCategoryId = Number(btn.dataset.catId);
        renderAutoAddPickerTabs();
        await refreshAutoAddPickerProducts();
      });
    });
  }

  function renderAutoAddPickerList() {
    if (!autoAddPickerList) return;
    autoAddPickerList.innerHTML = state.autoAddPanel.pickerProducts.map((product) => {
      const id = Number(product.id);
      const checked = Number.isFinite(id) && state.autoAddPanel.pickerSelection.has(id);
      return `
        <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${Number.isFinite(id) ? id : ""}">
          <div class="option-picker-title">${escapeHtml(product.name || "")}</div>
          <div class="option-picker-price">Цена: ${product.price != null ? formatPriceInteger(product.price) : "—"}</div>
          <input class="option-picker-checkbox" type="checkbox" data-product-id="${Number.isFinite(id) ? id : ""}" ${checked ? "checked" : ""} />
        </div>
      `;
    }).join("");

    autoAddPickerList.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.productId);
        if (!Number.isFinite(id)) return;
        if (state.autoAddPanel.pickerSelection.has(id)) {
          state.autoAddPanel.pickerSelection.delete(id);
        } else {
          state.autoAddPanel.pickerSelection.add(id);
        }
        renderAutoAddPickerList();
        renderAutoAddHeader();
      });
    });

    updateAutoAddPickerSelectAllState();
  }

  function updateAutoAddPickerSelectAllState() {
    if (!autoAddPickerSelectAll || !autoAddPickerSelectAllLabel) return;
    const products = state.autoAddPanel.pickerProducts || [];
    const ids = products
      .map((product) => Number(product.id))
      .filter((id) => Number.isFinite(id));
    const selectedCount = ids.filter((id) => state.autoAddPanel.pickerSelection.has(id)).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const noneSelected = selectedCount === 0;
    autoAddPickerSelectAll.checked = allSelected;
    autoAddPickerSelectAll.indeterminate = !allSelected && !noneSelected;
    autoAddPickerSelectAll.disabled = ids.length === 0;
    const label = allSelected ? "Сбросить все" : "Выделить все";
    autoAddPickerSelectAllLabel.textContent = label;
    autoAddPickerSelectAll.setAttribute("aria-label", label);
  }

  async function refreshAutoAddPickerProducts() {
    const res = await apiGetCatalogProducts({
      categoryId: state.autoAddPanel.pickerCategoryId,
      query: state.autoAddPanel.pickerQuery,
    });
    state.autoAddPanel.pickerProducts = Array.isArray(res.data)
      ? res.data.map((product) => {
          const id = Number(product.id);
          return Number.isFinite(id) ? { ...product, id } : product;
        })
      : [];
    renderAutoAddPickerList();
  }

  async function openAutoAddPicker() {
    syncAutoAddDraftGroupFromForm();
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }
    state.autoAddPanel.level = "picker";
    const existingSelection = new Set();
    getAutoAddItemsSource().forEach((item) => {
      const id = Number(item.product_id ?? item.id);
      if (Number.isFinite(id) && id > 0) existingSelection.add(id);
    });
    state.autoAddPanel.pickerSelection = existingSelection;
    state.autoAddPanel.pickerInitialSelection = new Set(existingSelection);
    state.autoAddPanel.pickerCategoryId = state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null;
    state.autoAddPanel.pickerQuery = "";
    if (autoAddPickerSearch) autoAddPickerSearch.value = "";
    await refreshAutoAddPickerProducts();
    renderAutoAddPickerLevel();
  }

  async function applyAutoAddPickerSelection() {
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
    if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
    delete window._closeAutoAddPickerFn;
    delete window._saveAutoAddPickerFn;
    restoreAutoAddPickerFooter();

    if (isSameSelection(state.autoAddPanel.pickerSelection, state.autoAddPanel.pickerInitialSelection)) {
      state.autoAddPanel.level = "group";
      renderAutoAddGroupLevel();
      return;
    }
    const selectedIds = Array.from(state.autoAddPanel.pickerSelection);
    if (!selectedIds.length) {
      state.autoAddPanel.level = "group";
      renderAutoAddGroupLevel();
      return;
    }
    if (!state.autoAddDraft) {
      state.autoAddPanel.level = "group";
      renderAutoAddGroupLevel();
      return;
    }

    const existing = new Set(
      state.autoAddDraft.items
        .map((x) => Number(x.product_id))
        .filter((pid) => Number.isFinite(pid) && pid > 0)
    );
    const emptySlots = state.autoAddDraft.items.filter((x) => !Number(x.product_id));
    let emptyIndex = 0;
    state.autoAddPanel.pickerProducts.forEach((product) => {
      const id = Number(product.id);
      if (!Number.isFinite(id)) return;
      if (!state.autoAddPanel.pickerSelection.has(id)) return;
      if (existing.has(id)) return;
      let target = emptySlots[emptyIndex] || null;
      if (target) {
        emptyIndex += 1;
      } else {
        target = createAutoAddDraftItem();
        state.autoAddDraft.items.push(target);
      }
      target.product_id = id;
      target.product_name = product.name;
      target.product_price = product.price;
    });
    state.autoAddPanel.itemsDirty = true;
    persistAutoAddEditState();

    state.autoAddPanel.level = "group";
    if (state.autoAddPanel.level === "picker") {
      renderAutoAddPickerLevel();
    } else {
      renderAutoAddGroupLevel();
    }
  }

  function renderAutoAddPickerLevel() {
    if (!autoAddLevelPicker) return;
    if (autoAddLevelGroup) autoAddLevelGroup.classList.add("hidden");
    autoAddLevelPicker.classList.remove("hidden");
    renderAutoAddPickerTabs();
    renderAutoAddPickerList();
    renderAutoAddHeader();
    showProductFooterEdit();

    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn) {
      if (!autoAddPickerSavedFooterState) {
        autoAddPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: footerCancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: footerCancelBtn.classList.contains("is-fullwidth"),
        };
        autoAddPickerSavedHandlers = {
          cancel: footerCancelBtn.onclick,
          save: footerSaveBtn.onclick,
        };
      }

      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");

      footerCancelBtn.classList.remove("is-confirm");
      footerCancelBtn.classList.add("is-fullwidth");
      if (!footerCancelBtn.dataset.pickerOriginalHtml) {
        footerCancelBtn.dataset.pickerOriginalHtml = footerCancelBtn.innerHTML;
      }
      footerCancelBtn.textContent = "Отменить";
      footerCancelBtn.title = "Отменить";
      footerCancelBtn.setAttribute("aria-label", "Отменить");
    }
    if (footerCancelBtn) footerCancelBtn.dataset.pickerType = "auto-add";
    if (footerSaveBtn) footerSaveBtn.dataset.pickerType = "auto-add";
    window._closeAutoAddPickerFn = () => {
      if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
      if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
      delete window._closeAutoAddPickerFn;
      delete window._saveAutoAddPickerFn;
      restoreAutoAddPickerFooter();
      state.autoAddPanel.level = "group";
      renderAutoAddGroupLevel();
    };
    window._saveAutoAddPickerFn = async () => {
      await applyAutoAddPickerSelection();
    };
  }

  function restoreAutoAddPickerFooter() {
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (!footer || !footerView || !footerEditMode || !footerCancelBtn || !footerSaveBtn || !autoAddPickerSavedFooterState) return;

    if (autoAddPickerSavedFooterState.footerHidden) {
      footer.classList.add("hidden");
    } else {
      footer.classList.remove("hidden");
    }
    if (autoAddPickerSavedFooterState.viewHidden) {
      footerView.classList.add("hidden");
    } else {
      footerView.classList.remove("hidden");
    }
    if (autoAddPickerSavedFooterState.editHidden) {
      footerEditMode.classList.add("hidden");
    } else {
      footerEditMode.classList.remove("hidden");
    }

    if (footerDeleteBtn) {
      if (autoAddPickerSavedFooterState.deleteBtnHidden) {
        footerDeleteBtn.classList.add("hidden");
      } else {
        footerDeleteBtn.classList.remove("hidden");
      }
    }
    if (footerMoreBtn) {
      if (autoAddPickerSavedFooterState.moreBtnHidden) {
        footerMoreBtn.classList.add("hidden");
      } else {
        footerMoreBtn.classList.remove("hidden");
      }
    }

    if (autoAddPickerSavedFooterState.cancelBtnIsFullwidth) {
      footerCancelBtn.classList.add("is-fullwidth");
    } else {
      footerCancelBtn.classList.remove("is-fullwidth");
    }
    if (autoAddPickerSavedFooterState.cancelBtnIsConfirm) {
      footerCancelBtn.classList.add("is-confirm");
    } else {
      footerCancelBtn.classList.remove("is-confirm");
    }
    if (footerCancelBtn.dataset.pickerOriginalHtml) {
      footerCancelBtn.innerHTML = footerCancelBtn.dataset.pickerOriginalHtml;
      delete footerCancelBtn.dataset.pickerOriginalHtml;
    }

    if (autoAddPickerSavedHandlers) {
      footerCancelBtn.onclick = autoAddPickerSavedHandlers.cancel;
      footerSaveBtn.onclick = autoAddPickerSavedHandlers.save;
    }

    autoAddPickerSavedFooterState = null;
    autoAddPickerSavedHandlers = null;
  }

  function closeAutoAddPicker() {
    state.autoAddPanel.level = "group";
    state.autoAddPanel.pickerSelection = new Set();
    renderAutoAddGroupLevel();
  }

  function renderAutoAddGroupLevel() {
    const editable = isAutoAddEditable();
    const data = editable ? state.autoAddDraft : state.autoAddGroupDetails;
    if (!data) return;
    state.autoAddPanel.level = "group";
    if (autoAddLevelGroup) autoAddLevelGroup.classList.remove("hidden");
    if (autoAddLevelPicker) autoAddLevelPicker.classList.add("hidden");

    fillAutoAddGroupForm(data.group);
    setAutoAddGroupFormDisabled(!editable);

    if (autoAddItemsAddBtn) autoAddItemsAddBtn.classList.toggle("hidden", !editable);
    renderAutoAddItems(getAutoAddItemsSource());
    renderAutoAddHeader();

    if (state.autoAddPanel.mode === "view") {
      showProductFooterView();
    } else {
      showProductFooterEdit();
    }
  }

  function showAutoAddDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.autoAddPanel.level = "group";
    state.autoAddPanel.mode = mode || "view";
    state.autoAddPanel.itemsDirty = false;
    if (state.autoAddPanel.mode === "view") {
      state.autoAddDraft = null;
      state.autoAddPanel.snapshotData = null;
    }

    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    if (editProductBtn) editProductBtn.classList.add("hidden");

    hideProductFooter();

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    autoAddEmpty && autoAddEmpty.classList.add("hidden");
    hideAllDetailPanels();
    autoAddGroupInfo && autoAddGroupInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && autoAddGroupInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(autoAddGroupInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && autoAddGroupInfo && autoAddGroupInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(autoAddGroupInfo);
      }
      closeSheet();
    }

    renderAutoAddGroupLevel();
  }

  function openAutoAddGroupTab(groupId, title, { activate = true } = {}) {
    if (!Number.isFinite(groupId)) return;
    ensureTab({
      type: "auto-add",
      id: groupId,
      title: title || "Автодобавление",
      onActivate: async () => {
        await loadAutoAddManagement();
        state.selectedAutoAddGroupId = groupId;
        state.autoAddGroupDetails = buildAutoAddGroupDetails(groupId);
        renderAutoAddGroupsList();

        if (editingAutoAdds.has(groupId)) {
          const editingState = editingAutoAdds.get(groupId);
          state.autoAddPanel.mode = editingState.mode;
          state.autoAddDraft = deepClone(editingState.autoAddDraft);
          state.autoAddPanel.snapshotData = deepClone(editingState.snapshotData);
          showAutoAddDetails(state.autoAddGroupDetails, { mode: editingState.mode });
        } else {
          state.autoAddPanel.mode = "view";
          state.autoAddDraft = null;
          state.autoAddPanel.snapshotData = null;
          showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
        }
      },
      activate,
    });
  }

  function startAutoAddCreate() {
    state.autoAddPanel.mode = "create";
    state.autoAddPanel.itemsDirty = false;
    state.autoAddDraft = {
      group: {
        title: "",
        description: "",
        sort_order: 0,
        is_active: 1,
        min_cart_amount: null,
        max_cart_amount: null,
        include_auto_in_total: 0,
        max_items_qty: null,
        allow_customer_qty: 1,
        allow_customer_remove: 1,
      },
      items: [createAutoAddDraftItem()],
      removedItemIds: [],
    };

    const tabId = `new-auto-add-${Date.now()}`;
    ensureTab({
      type: "auto-add",
      id: tabId,
      title: "Новое условие",
      onActivate: () => {
        showAutoAddDetails({ group: state.autoAddDraft.group, items: state.autoAddDraft.items }, { mode: "create" });
        showProductFooterEdit();
      },
      activate: true,
    });

    state.autoAddPanel.tabKey = buildTabKey("auto-add", tabId);
    showAutoAddDetails({ group: state.autoAddDraft.group, items: state.autoAddDraft.items }, { mode: "create" });
    showProductFooterEdit();
  }

  function startAutoAddEdit({ silent = false } = {}) {
    if (!state.autoAddGroupDetails?.group) return;
    state.autoAddPanel.snapshotData = deepClone({
      group: state.autoAddGroupDetails.group,
      items: state.autoAddGroupDetails.items || [],
    });
    state.autoAddDraft = deepClone({
      group: state.autoAddGroupDetails.group,
      items: state.autoAddGroupDetails.items || [],
      removedItemIds: [],
    });
    state.autoAddPanel.mode = "edit";

    if (state.selectedAutoAddGroupId) {
      editingAutoAdds.set(state.selectedAutoAddGroupId, {
        mode: "edit",
        autoAddDraft: deepClone(state.autoAddDraft),
        snapshotData: deepClone(state.autoAddPanel.snapshotData),
      });
    }

    if (silent) return;
    renderAutoAddGroupLevel();
  }

  function cancelAutoAddEdit() {
    if (state.autoAddPanel.mode === "create") {
      if (state.autoAddPanel.tabKey) {
        closeTab(state.autoAddPanel.tabKey);
      }
      state.autoAddDraft = null;
      state.autoAddPanel.mode = "view";
      state.autoAddPanel.tabKey = null;
      state.selectedAutoAddGroupId = null;
      hideProductFooter();
      showDetailsEmpty();
      return;
    }
    if (state.autoAddPanel.mode === "edit" && state.selectedAutoAddGroupId) {
      editingAutoAdds.delete(state.selectedAutoAddGroupId);
      (async () => {
        state.autoAddPanel.mode = "view";
        state.autoAddDraft = null;
        state.autoAddPanel.snapshotData = null;
        await loadAutoAddManagement();
        state.autoAddGroupDetails = buildAutoAddGroupDetails(state.selectedAutoAddGroupId);
        showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
      })();
    }
  }

  async function saveAutoAddGroup() {
    if (!autoAddGroupForm || !state.autoAddDraft) return;
    const groupValues = getAutoAddGroupFormValues();

    if (!groupValues.title) {
      autoAddGroupTitleInput?.focus();
      return;
    }

    const items = Array.isArray(state.autoAddDraft.items) ? state.autoAddDraft.items : [];
    for (const item of items) {
      const pid = Number(item.product_id || 0);
      if (!Number.isFinite(pid) || pid <= 0) {
        alert("Выберите товар для автодобавления.");
        return;
      }
    }

    if (state.autoAddPanel.mode === "create") {
      const res = await apiCreateAutoAddGroup(groupValues);
      const groupId = res.id;
      await Promise.all(items.map((item, idx) => apiCreateAutoAddItem(groupId, buildAutoAddItemPayload(item, idx))));

      await loadAutoAddManagement();
      state.selectedAutoAddGroupId = groupId;
      state.autoAddGroupDetails = buildAutoAddGroupDetails(groupId);
      renderAutoAddGroupsList();

      if (state.autoAddPanel.tabKey) {
        replaceTabKey(state.autoAddPanel.tabKey, {
          type: "auto-add",
          id: groupId,
          title: groupValues.title || "Автодобавление",
          onActivate: async () => {
            await loadAutoAddManagement();
            state.selectedAutoAddGroupId = groupId;
            state.autoAddGroupDetails = buildAutoAddGroupDetails(groupId);
            renderAutoAddGroupsList();
            showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
          },
        });
        state.autoAddPanel.tabKey = null;
      }

      state.autoAddPanel.mode = "view";
      state.autoAddDraft = null;
      state.autoAddPanel.snapshotData = null;
      showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
      return;
    }

    if (state.selectedAutoAddGroupId) {
      const groupId = state.selectedAutoAddGroupId;
      await apiPatchAutoAddGroup(groupId, groupValues);

      const removedIds = Array.isArray(state.autoAddDraft.removedItemIds) ? state.autoAddDraft.removedItemIds : [];
      const createItems = items.filter((item) => !item.id);
      const updateItems = items.filter((item) => item.id);

      await Promise.all([
        ...removedIds.map((id) => apiDeleteAutoAddItem(id)),
        ...createItems.map((item, idx) => apiCreateAutoAddItem(groupId, buildAutoAddItemPayload(item, idx))),
        ...updateItems.map((item, idx) => apiPatchAutoAddItem(item.id, buildAutoAddItemPayload(item, idx))),
      ]);

      await loadAutoAddManagement();
      state.autoAddGroupDetails = buildAutoAddGroupDetails(groupId);
      renderAutoAddGroupsList();
      editingAutoAdds.delete(groupId);

      state.autoAddPanel.mode = "view";
      state.autoAddDraft = null;
      state.autoAddPanel.snapshotData = null;
      showAutoAddDetails(state.autoAddGroupDetails, { mode: "view" });
    }
  }

function openAutoAddGroupModal({ mode, group } = {}) {
    const isEdit = mode === "edit";
    const title = isEdit ? "Редактировать автодобавление" : "Новое автодобавление";
    const g = group || {};

    const content = `
      <div class="form-grid">
        <div>
          <label class="field-label">Название *</label>
          <input class="control" id="autoAddGroupTitle" type="text" value="${escapeHtml(g.title || "")}" />
        </div>
        <div>
          <label class="field-label">Описание</label>
          <input class="control" id="autoAddGroupDesc" type="text" value="${escapeHtml(g.description || "")}" />
        </div>
        <div class="form-row-2">
          <label class="switch">
            <input class="switch-input" id="autoAddGroupActive" type="checkbox" ${g.is_active ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text">Активна</span>
          </label>
          <div>
            <label class="field-label">Сортировка</label>
            <input class="control" id="autoAddGroupSort" type="number" value="${g.sort_order ?? 0}" />
          </div>
        </div>
      </div>
    `;

    window.AppModal?.open({
      title,
      content,
      onSave: async ({ body }) => {
        const nameInput = body.querySelector("#autoAddGroupTitle");
        const descInput = body.querySelector("#autoAddGroupDesc");
        const activeInput = body.querySelector("#autoAddGroupActive");
        const sortInput = body.querySelector("#autoAddGroupSort");

        const titleValue = (nameInput?.value || "").trim();
        if (!titleValue) {
          alert("Название обязательно");
          return false;
        }

        const payload = {
          title: titleValue,
          description: (descInput?.value || "").trim() || null,
          is_active: activeInput?.checked ? 1 : 0,
          sort_order: sortInput?.value ? Number(sortInput.value) : 0,
        };

        if (isEdit) await apiPatchAutoAddGroup(g.id, payload);
        else await apiCreateAutoAddGroup(payload);

        await loadAutoAddManagement();
        renderAutoAddGroupsList();
      }
    });
  }

  function openAutoAddItemModal({ mode, groupId, item } = {}) {
    const isEdit = mode === "edit";
    const it = item || {};
    const title = isEdit ? "Редактировать товар автодобавления" : "Добавить товар";

    const content = `
      <div class="form-grid">
        <div>
          <label class="field-label">Товар *</label>
          <input class="control" id="autoAddItemSearch" type="search" placeholder="Начните вводить название..." value="${escapeHtml(it.product_name || "")}" />
          <div class="options-list auto-add-search-results" id="autoAddItemResults"></div>
          <div class="options-row-meta" id="autoAddItemSelected">${escapeHtml(it.product_name || "Не выбран")}</div>
          <input type="hidden" id="autoAddItemProductId" value="${it.product_id || ""}" />
        </div>
        <div class="form-row-3">
          <div>
            <label class="field-label">По умолчанию</label>
            <input class="control" id="autoAddItemDefaultQty" type="number" min="0" value="${it.default_qty ?? 0}" />
          </div>
          <div>
            <label class="field-label">Мин.</label>
            <input class="control" id="autoAddItemMinQty" type="number" min="0" value="${it.min_qty ?? 0}" />
          </div>
          <div>
            <label class="field-label">Макс.</label>
            <input class="control" id="autoAddItemMaxQty" type="number" min="0" value="${it.max_qty ?? ""}" />
          </div>
        </div>
        <div class="form-row-3">
          <div>
            <label class="field-label">Цена (override)</label>
            <input class="control" id="autoAddItemPrice" type="number" min="0" step="0.01" value="${it.price_override ?? ""}" />
          </div>
          <div>
            <label class="field-label">Первые бесплатно</label>
            <input class="control" id="autoAddItemFreeFirst" type="number" min="0" value="${it.free_first_qty ?? 0}" />
          </div>
          <div>
            <label class="field-label">Бесплатно за сумму</label>
            <input class="control" id="autoAddItemFreePerAmount" type="number" min="0" step="1" value="${it.free_per_amount ?? ""}" />
          </div>
        </div>
        <div class="form-row-3">
          <div>
            <label class="field-label">Кол-во за сумму</label>
            <input class="control" id="autoAddItemFreePerQty" type="number" min="1" value="${it.free_per_amount_qty ?? 1}" />
          </div>
          <div>
            <label class="field-label">Лимит бесплатно</label>
            <input class="control" id="autoAddItemMaxFree" type="number" min="0" value="${it.max_free_qty ?? ""}" />
          </div>
          <div>
            <label class="field-label">Сортировка</label>
            <input class="control" id="autoAddItemSort" type="number" value="${it.sort_order ?? 0}" />
          </div>
        </div>
        <div>
          <label class="switch">
            <input class="switch-input" id="autoAddItemActive" type="checkbox" ${it.is_active === 0 ? "" : "checked"} />
            <span class="switch-ui" aria-hidden="true"></span>
            <span class="switch-text">Активен</span>
          </label>
        </div>
      </div>
    `;

    window.AppModal?.open({
      title,
      content,
      onSave: async ({ body }) => {
        const productIdInput = body.querySelector("#autoAddItemProductId");
        const productId = Number(productIdInput?.value || 0);
        if (!Number.isFinite(productId) || productId <= 0) {
          alert("Выберите товар");
          return false;
        }

        const payload = {
          product_id: productId,
          default_qty: Number(body.querySelector("#autoAddItemDefaultQty")?.value || 0),
          min_qty: Number(body.querySelector("#autoAddItemMinQty")?.value || 0),
          max_qty: body.querySelector("#autoAddItemMaxQty")?.value ? Number(body.querySelector("#autoAddItemMaxQty").value) : null,
          price_override: body.querySelector("#autoAddItemPrice")?.value ? Number(body.querySelector("#autoAddItemPrice").value) : null,
          free_first_qty: Number(body.querySelector("#autoAddItemFreeFirst")?.value || 0),
          free_per_amount: body.querySelector("#autoAddItemFreePerAmount")?.value ? Number(body.querySelector("#autoAddItemFreePerAmount").value) : null,
          free_per_amount_qty: Number(body.querySelector("#autoAddItemFreePerQty")?.value || 1),
          max_free_qty: body.querySelector("#autoAddItemMaxFree")?.value ? Number(body.querySelector("#autoAddItemMaxFree").value) : null,
          sort_order: body.querySelector("#autoAddItemSort")?.value ? Number(body.querySelector("#autoAddItemSort").value) : 0,
          is_active: body.querySelector("#autoAddItemActive")?.checked ? 1 : 0,
        };

        if (isEdit) await apiPatchAutoAddItem(it.id, payload);
        else await apiCreateAutoAddItem(groupId, payload);

        await loadAutoAddManagement();
        renderAutoAddGroupsList();
      },
      onClose: () => {}
    });

    const body = window.AppModal?.body;
    if (!body) return;
    const searchInput = body.querySelector("#autoAddItemSearch");
    const resultsEl = body.querySelector("#autoAddItemResults");
    const selectedEl = body.querySelector("#autoAddItemSelected");
    const productIdInput = body.querySelector("#autoAddItemProductId");

    let searchTimer = null;

    async function runSearch() {
      const q = (searchInput?.value || "").trim();
      if (!q || q.length < 2) {
        if (resultsEl) resultsEl.innerHTML = "";
        return;
      }
      const res = await apiGetCatalogProducts({ query: q });
      const list = Array.isArray(res.data) ? res.data : [];
      if (!resultsEl) return;
      resultsEl.innerHTML = list.map((p) => {
        const priceLabel = formatMoney(p.price || 0);
        return `<button class="options-row auto-add-pick-row" type="button" data-pick-id="${p.id}" data-pick-name="${escapeHtml(p.name || "")}"><div><div class="options-row-title">${escapeHtml(p.name || "")}</div><div class="options-row-meta">${priceLabel}</div></div></button>`;
      }).join("");

      resultsEl.querySelectorAll("[data-pick-id]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const pid = Number(btn.dataset.pickId);
          const name = btn.dataset.pickName || "";
          if (productIdInput) productIdInput.value = String(pid || "");
          if (selectedEl) selectedEl.textContent = name || "Не выбран";
          if (searchInput) searchInput.value = name || "";
          if (resultsEl) resultsEl.innerHTML = "";
        });
      });
    }

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(runSearch, 300);
      });
    }
  }

  function renderVariantGroupsList(listEl, emptyEl) {
    if (!listEl) listEl = variantsGroupsList;
    if (!emptyEl) emptyEl = variantsGroupsEmpty;
    if (!listEl) return;

    const groups = getFilteredVariantGroups();
    const disableSwitch = state.variantPanel.mode === "edit";

    emptyEl?.classList.toggle("hidden", groups.length > 0);
    listEl.classList.toggle("hidden", groups.length === 0);

    listEl.innerHTML = groups.map((group) => {
      const isActive = Number(group.is_active || 0) === 1;
      const values = Array.isArray(group.values) ? group.values : [];
      const valuesText = values.length > 0 ? values.join(", ") : "нет значений";

      return `
        <div class="options-row ${isActive ? "is-active" : ""}" data-variant-group-id="${group.id}">
          <div>
            <div class="options-row-title">${escapeHtml(group.title || "")}</div>
            <div class="options-row-meta">Значения: ${escapeHtml(valuesText)}</div>
          </div>
          <div class="options-row-meta">Назначения: ${group.assignments_count ?? 0}</div>
          <div class="options-row-meta">
            <label class="switch switch-compact options-row-active">
              <input class="switch-input" type="checkbox" data-variant-active-id="${group.id}" ${group.is_active ? "checked" : ""} ${disableSwitch ? "disabled" : ""} />
              <span class="switch-ui" aria-hidden="true"></span>
              <span class="switch-text">Активна</span>
            </label>
          </div>
        </div>
      `;
    }).join("");

    listEl.querySelectorAll("[data-variant-group-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.variantGroupId);
        if (!Number.isFinite(id)) return;
        const group = state.variantGroups.find((g) => Number(g.id) === id);
        openVariantGroupTab(id, group?.title || "Вариант", { activate: true });
      });
    });

    listEl.querySelectorAll("[data-variant-active-id]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", (event) => {
        event.stopPropagation();
        const id = Number(input.dataset.variantActiveId);
        if (!Number.isFinite(id)) return;
        // TODO: Реализовать переключение активности варианта
        showToast("Переключение активности вариантов пока не реализовано");
      });
    });
  }

  // ---------------- Products list ----------------

  function initials(name) {
    const t = String(name || "").trim();
    if (!t) return "PR";
    const parts = t.split(/\s+/).slice(0, 2);
    return parts.map((p) => p[0]).join("").toUpperCase();
  }

  function formatMoney(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    return `${n.toFixed(0)} ₽`;
  }

  function formatQuantity(v, decimals = 3) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    const fixed = n.toFixed(decimals);
    return fixed.replace(/\.?0+$/, "");
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

  function formatPriceInteger(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "—";
    // format price as integer in UI
    return n.toFixed(0);
  }

  /** Для инпутов: целые без дробной части, дробные — с запятой и без лишних нулей */
  function formatNumberForInput(v) {
    if (v === "" || v == null) return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    if (Number.isInteger(n)) return String(n);
    let s = String(n).replace(/0+$/, "").replace(/\.$/, "");
    return s.replace(".", ",");
  }

  /** Парсинг из инпута: и точка, и запятая как десятичный разделитель */
  function parseNumberFromInput(str) {
    const s = String(str || "").trim().replace(",", ".");
    if (s === "") return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function formatNumberForInputFixed(v, decimals = 2) {
    if (v === "" || v == null) return "";
    const n = Number(v);
    if (!Number.isFinite(n)) return "";
    const places = Math.max(0, Number(decimals) || 0);
    return n.toFixed(places).replace(/\.?0+$/, "").replace(".", ",");
  }

  function calcPriceFromMargin(cost, marginPercent) {
    const costNum = Number(cost);
    const marginNum = Number(marginPercent);
    if (!Number.isFinite(costNum) || costNum < 0) return null;
    if (!Number.isFinite(marginNum) || marginNum >= 100) return null;
    return Math.round((costNum / (1 - marginNum / 100)) * 100) / 100;
  }

  function calcMarginFromPrice(cost, price) {
    const costNum = Number(cost);
    const priceNum = Number(price);
    if (!Number.isFinite(costNum) || !Number.isFinite(priceNum) || costNum < 0 || priceNum <= 0) return null;
    return Math.round((((priceNum - costNum) / priceNum) * 100) * 100) / 100;
  }

  function normalizeLimitedDecimalInput(value, decimals = 2) {
    const places = Math.max(0, Number(decimals) || 0);
    let raw = String(value || "").replace(/\./g, ",").replace(/[^\d,]/g, "");
    const firstComma = raw.indexOf(",");
    if (firstComma !== -1) {
      raw = raw.slice(0, firstComma + 1) + raw.slice(firstComma + 1).replace(/,/g, "");
      const parts = raw.split(",");
      raw = `${parts[0]},${String(parts[1] || "").slice(0, places)}`;
    }
    return raw;
  }

  function setHeaderMode(mode) {
    if (productHeaderActions) productHeaderActions.classList.toggle("hidden", mode !== "product");
    if (optionHeaderActions) optionHeaderActions.classList.toggle("hidden", mode !== "option");
  }

  function formatOptionLimits(min, max) {
    const minLabel = min == null ? 0 : min;
    const maxLabel = max == null ? "∞" : max;
    return `Мин: ${minLabel} · Макс: ${maxLabel}`;
  }

  function renderOptionItemsSummary(items) {
    if (!items.length) {
      return `<div class="empty-hint">Пока нет пунктов...</div>`;
    }
    return `
      <div class="option-summary-list">
        ${items.map((item) => {
          const basePrice = item.product_price != null ? formatMoney(item.product_price) : "—";
          const hasOverride = item.price_mode === "fixed" && item.price_value != null;
          const overridePrice = hasOverride ? formatMoney(item.price_value) : "";
          const qtyMin = item.qty_min ?? 1;
          const qtyMax = item.qty_max ?? 1;
          const limitLabel = `Лимиты: ${qtyMin}–${qtyMax}`;
          return `
            <div class="option-summary-row">
              <div>
                <div class="option-summary-title">${escapeHtml(item.product_name || item.name || "")}</div>
                <div class="option-summary-meta">${limitLabel}</div>
              </div>
              <div class="option-summary-price">
                ${hasOverride ? `<s>${basePrice}</s>` : `<span>${basePrice}</span>`}
                ${hasOverride ? `<span>${overridePrice}</span>` : ""}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function getVisibleOptionItems(items) {
    return (Array.isArray(items) ? items : []).filter((item) => item?.is_excluded_for_product !== true);
  }

  function renderProductScopedOptionItemsSummary(items, { removable = false, groupId = null } = {}) {
    const visibleItems = getVisibleOptionItems(items);
    if (!visibleItems.length) {
      return `<div class="empty-hint">РџРѕРєР° РЅРµС‚ РїСѓРЅРєС‚РѕРІ...</div>`;
    }
    return `
      <div class="option-summary-list">
        ${visibleItems.map((item) => {
          const basePrice = item.product_price != null ? formatMoney(item.product_price) : "вЂ”";
          const hasOverride = item.price_mode === "fixed" && item.price_value != null;
          const overridePrice = hasOverride ? formatMoney(item.price_value) : "";
          const qtyMin = item.qty_min ?? 1;
          const qtyMax = item.qty_max ?? 1;
          const limitLabel = `Р›РёРјРёС‚С‹: ${qtyMin}вЂ“${qtyMax}`;
          const removeButton = removable && Number.isFinite(Number(groupId)) && Number.isFinite(Number(item.id))
            ? `<button class="option-row-remove option-summary-remove" type="button" data-product-option-item-remove="${groupId}:${item.id}" title="\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u0443\u043d\u043a\u0442 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430" aria-label="\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u0443\u043d\u043a\u0442 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430"><i class="fas fa-times"></i></button>`
            : "";
          return `
            <div class="option-summary-row ${removeButton ? "is-removable" : ""}">
              <div>
                <div class="option-summary-title">${escapeHtml(item.product_name || item.name || "")}</div>
                <div class="option-summary-meta">${limitLabel}</div>
              </div>
              <div class="option-summary-price-wrap">
                <div class="option-summary-price">
                  ${hasOverride ? `<s>${basePrice}</s>` : `<span>${basePrice}</span>`}
                  ${hasOverride ? `<span>${overridePrice}</span>` : ""}
                </div>
                ${removeButton}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderProductScopedOptionItemsSummary(items, { removable = false, groupId = null } = {}) {
    const visibleItems = getVisibleOptionItems(items);
    if (!visibleItems.length) {
      return `<div class="empty-hint">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u043f\u0443\u043d\u043a\u0442\u043e\u0432...</div>`;
    }
    return `
      <div class="option-summary-list">
        ${visibleItems.map((item) => {
          const basePrice = item.product_price != null ? formatMoney(item.product_price) : "\u2014";
          const hasOverride = item.price_mode === "fixed" && item.price_value != null;
          const overridePrice = hasOverride ? formatMoney(item.price_value) : "";
          const qtyMin = item.qty_min ?? 1;
          const qtyMax = item.qty_max ?? 1;
          const limitLabel = `\u041b\u0438\u043c\u0438\u0442\u044b: ${qtyMin}\u2013${qtyMax}`;
          const removeButton = removable && Number.isFinite(Number(groupId)) && Number.isFinite(Number(item.id))
            ? `<button class="option-row-remove option-summary-remove" type="button" data-product-option-item-remove="${groupId}:${item.id}" title="\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u0443\u043d\u043a\u0442 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430" aria-label="\u0423\u0431\u0440\u0430\u0442\u044c \u043f\u0443\u043d\u043a\u0442 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430"><i class="fas fa-times"></i></button>`
            : "";
          return `
            <div class="option-summary-row ${removeButton ? "is-removable" : ""}">
              <div>
                <div class="option-summary-title">${escapeHtml(item.product_name || item.name || "")}</div>
                <div class="option-summary-meta">${limitLabel}</div>
              </div>
              <div class="option-summary-price-wrap">
                <div class="option-summary-price">
                  ${hasOverride ? `<s>${basePrice}</s>` : `<span>${basePrice}</span>`}
                  ${hasOverride ? `<span>${overridePrice}</span>` : ""}
                </div>
                ${removeButton}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderVariantValuesSummary(values, tiers, defaultValueIndex = null, { isEditable = false, groupId = null, valueIndexMap = null, removableValueIndexes = null } = {}) {
    const list = Array.isArray(values) ? values : [];
    if (!list.length) {
      return `<div class="empty-hint">Пока нет значений...</div>`;
    }
    const tierMap = new Map();
    (Array.isArray(tiers) ? tiers : []).forEach((tier) => {
      const idx = Number(tier.sort_order);
      if (Number.isFinite(idx)) tierMap.set(idx, tier);
    });
    const defaultIdx = defaultValueIndex != null ? Number(defaultValueIndex) : null;
    const normalizedValueIndexMap = Array.isArray(valueIndexMap) && valueIndexMap.length === list.length
      ? valueIndexMap.map((mappedIndex, idx) => {
          const numericIndex = Number(mappedIndex);
          return Number.isFinite(numericIndex) && numericIndex >= 0 ? numericIndex : idx;
        })
      : list.map((_, idx) => idx);
    const removableIndexSet = removableValueIndexes instanceof Set
      ? removableValueIndexes
      : new Set(
          (Array.isArray(removableValueIndexes) ? removableValueIndexes : [])
            .map((mappedIndex) => Number(mappedIndex))
            .filter((mappedIndex) => Number.isFinite(mappedIndex) && mappedIndex >= 0)
        );
    const formatSignedPercent = (storedValue) => {
      const num = Number(storedValue || 0);
      const uiValue = Number.isFinite(num) ? -num : 0;
      if (!uiValue) return "+0";
      return `${uiValue > 0 ? "+" : ""}${uiValue}`;
    };

    return `
      <div class="option-summary-list">
        ${list.map((value, idx) => {
          const tier = tierMap.get(idx) || {};
          const discountRaw = tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0);
          const discount = Number(discountRaw) || 0;
          const uiSigned = Number.isFinite(discount) ? -discount : 0;
          const mappedValueIndex = normalizedValueIndexMap[idx];
          const metaLabel = uiSigned < 0
            ? `Скидка: ${formatSignedPercent(discount)}%`
            : (uiSigned > 0 ? `Надбавка: ${formatSignedPercent(discount)}%` : "Без изменения");
          const isDefault = defaultIdx !== null && idx === defaultIdx;
          const starIcon = isDefault 
            ? '<i class="fas fa-star" style="color: #ff7a00; margin-right: 8px;"></i>'
            : '<i class="far fa-star" style="color: #888; margin-right: 8px;"></i>';
          
          // Если редактируем и есть groupId, делаем звёздочку кликабельной
          const starElement = isEditable && groupId != null
            ? `<button type="button" class="variant-star-btn-inline" data-variant-star-group="${groupId}" data-variant-star-index="${idx}" style="background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; margin-right: 8px;" title="${isDefault ? 'Вариант по умолчанию' : 'Установить как вариант по умолчанию'}" aria-label="${isDefault ? 'Вариант по умолчанию' : 'Установить как вариант по умолчанию'}">${starIcon}</button>`
            : `<span style="margin-right: 8px;">${starIcon}</span>`;
          
          return `
            <div class="option-summary-row">
              <div style="display: flex; align-items: center;">
                ${starElement}
                <div>
                  <div class="option-summary-title">${escapeHtml(value)}</div>
                  <div class="option-summary-meta">${metaLabel}</div>
                </div>
              </div>
              <div class="option-summary-price">
                <span>${uiSigned !== 0 ? `${formatSignedPercent(discount)}%` : ""}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderVariantValuesSummary(values, tiers, defaultValueIndex = null, { isEditable = false, groupId = null, valueIndexMap = null, removableValueIndexes = null } = {}) {
    const list = Array.isArray(values) ? values : [];
    if (!list.length) {
      return `<div class="empty-hint">\u041f\u043e\u043a\u0430 \u043d\u0435\u0442 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439...</div>`;
    }
    const tierMap = new Map();
    (Array.isArray(tiers) ? tiers : []).forEach((tier) => {
      const idx = Number(tier?.sort_order);
      if (Number.isFinite(idx)) tierMap.set(idx, tier);
    });
    const defaultIdx = defaultValueIndex != null ? Number(defaultValueIndex) : null;
    const normalizedValueIndexMap = Array.isArray(valueIndexMap) && valueIndexMap.length === list.length
      ? valueIndexMap.map((mappedIndex, idx) => {
          const numericIndex = Number(mappedIndex);
          return Number.isFinite(numericIndex) && numericIndex >= 0 ? numericIndex : idx;
        })
      : list.map((_, idx) => idx);
    const removableIndexSet = removableValueIndexes instanceof Set
      ? removableValueIndexes
      : new Set(
          (Array.isArray(removableValueIndexes) ? removableValueIndexes : [])
            .map((mappedIndex) => Number(mappedIndex))
            .filter((mappedIndex) => Number.isFinite(mappedIndex) && mappedIndex >= 0)
        );
    const formatSignedPercent = (storedValue) => {
      const num = Number(storedValue || 0);
      const uiValue = Number.isFinite(num) ? -num : 0;
      if (!uiValue) return "+0";
      return `${uiValue > 0 ? "+" : ""}${uiValue}`;
    };

    return `
      <div class="option-summary-list">
        ${list.map((value, idx) => {
          const tier = tierMap.get(idx) || {};
          const discountRaw = tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0);
          const discount = Number(discountRaw) || 0;
          const uiSigned = Number.isFinite(discount) ? -discount : 0;
          const mappedValueIndex = normalizedValueIndexMap[idx];
          const metaLabel = uiSigned < 0
            ? `\u0421\u043a\u0438\u0434\u043a\u0430: ${formatSignedPercent(discount)}%`
            : (uiSigned > 0 ? `\u041d\u0430\u0434\u0431\u0430\u0432\u043a\u0430: ${formatSignedPercent(discount)}%` : "\u0411\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f");
          const isDefault = defaultIdx !== null && idx === defaultIdx;
          const starIcon = isDefault
            ? '<i class="fas fa-star" style="color: #ff7a00; margin-right: 8px;"></i>'
            : '<i class="far fa-star" style="color: #888; margin-right: 8px;"></i>';
          const starElement = isEditable && groupId != null
            ? `<button type="button" class="variant-star-btn-inline" data-variant-star-group="${groupId}" data-variant-star-index="${mappedValueIndex}" style="background: none; border: none; padding: 0; cursor: pointer; display: inline-flex; align-items: center; margin-right: 8px;" title="${isDefault ? '\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e' : '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u043a \u0432\u0430\u0440\u0438\u0430\u043d\u0442 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e'}" aria-label="${isDefault ? '\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e' : '\u0423\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043a\u0430\u043a \u0432\u0430\u0440\u0438\u0430\u043d\u0442 \u043f\u043e \u0443\u043c\u043e\u043b\u0447\u0430\u043d\u0438\u044e'}">${starIcon}</button>`
            : `<span style="margin-right: 8px;">${starIcon}</span>`;
          const removeButton = isEditable && groupId != null && removableIndexSet.has(mappedValueIndex)
            ? `<button class="option-row-remove option-summary-remove" type="button" data-product-variant-value-remove="${groupId}:${mappedValueIndex}" title="\u0423\u0431\u0440\u0430\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430" aria-label="\u0423\u0431\u0440\u0430\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435 \u0443 \u044d\u0442\u043e\u0433\u043e \u0442\u043e\u0432\u0430\u0440\u0430"><i class="fas fa-times"></i></button>`
            : "";

          return `
            <div class="option-summary-row ${removeButton ? "is-removable" : ""}">
              <div style="display: flex; align-items: center;">
                ${starElement}
                <div>
                  <div class="option-summary-title">${escapeHtml(value)}</div>
                  <div class="option-summary-meta">${metaLabel}</div>
                </div>
              </div>
              <div class="option-summary-price-wrap">
                <div class="option-summary-price">
                  <span>${uiSigned !== 0 ? `${formatSignedPercent(discount)}%` : ""}</span>
                </div>
                ${removeButton}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function getProductListUnitLabel(product) {
    const unitId = Number(product?.base_unit_id || product?.unit_id || 0);
    if (!Number.isFinite(unitId) || unitId <= 0) return "";
    const unit = (Array.isArray(state.units) ? state.units : []).find((u) => Number(u?.id) === unitId);
    return unit ? String(unit.short_title || unit.title || unit.code || "").trim() : "";
  }

  function toReadonlyProductFieldValue(value) {
    if (value == null || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    return formatNumberForInput(n);
  }

  function getProductRowEditableValue(product, field) {
    if (!product) return "";
    if (field === "stock") return product.stock_qty != null ? formatNumberForInput(product.stock_qty) : "";
    if (field === "cost_price") return product.cost_price != null ? formatNumberForInput(product.cost_price) : "";
    if (field === "price") return product.price != null ? formatNumberForInput(product.price) : "";
    if (field === "old_price") return product.old_price != null ? formatNumberForInput(product.old_price) : "";
    return "";
  }

  function getProductRowDisplayValue(product, field) {
    if (!product) return "—";
    if (field === "stock") {
      const unitLabel = getProductListUnitLabel(product);
      const stockValue = toReadonlyProductFieldValue(product.stock_qty);
      return stockValue && unitLabel ? `${stockValue} ${unitLabel}` : (stockValue || "∞");
    }
    if (field === "cost_price") return toReadonlyProductFieldValue(product.cost_price) || "—";
    if (field === "price") return toReadonlyProductFieldValue(product.price) || "—";
    if (field === "old_price") return toReadonlyProductFieldValue(product.old_price) || "—";
    return "—";
  }

  function parseProductRowInlineNumber(field, value, product) {
    if (field !== "stock") return parseNumberFromInput(value);
    const unitLabel = String(getProductListUnitLabel(product) || "").trim();
    let normalized = String(value || "").trim();
    if (unitLabel) normalized = normalized.replace(unitLabel, "").trim();
    normalized = normalized.replace(/[^\d,.\-]/g, "");
    return parseNumberFromInput(normalized);
  }

  function applyInlineProductValue(product, field, value) {
    if (!product) return;
    if (field === "stock") product.stock_qty = value;
    if (field === "cost_price") product.cost_price = value;
    if (field === "price") product.price = value;
    if (field === "old_price") product.old_price = value;
    if (field === "is_active") product.is_active = value ? 1 : 0;
    if (field === "site_visibility") product.site_visibility = value ? 1 : 0;
    if (field === "fulfillment_mode") product.fulfillment_mode = normalizeProductFulfillmentMode(value);
  }

  function getInlineProductComparableValue(product, field) {
    if (!product) return null;
    if (field === "stock") return product.stock_qty != null ? Number(product.stock_qty) : null;
    if (field === "cost_price") return product.cost_price != null ? Number(product.cost_price) : null;
    if (field === "price") return product.price != null ? Number(product.price) : 0;
    if (field === "old_price") return product.old_price != null ? Number(product.old_price) : null;
    if (field === "is_active") return Boolean(product.is_active);
    if (field === "site_visibility") return Boolean(product.site_visibility);
    return null;
  }

  function syncProductRowInlineControl(row, product, field) {
    if (!row || !product || !field) return;
    const control = row.querySelector(`[data-inline-field="${field}"]`);
    if (!control) return;
    if (field === "is_active" || field === "site_visibility") {
      control.checked = Boolean(product.site_visibility);
      if (field === "is_active") control.checked = Boolean(product.is_active);
      return;
    }
    control.value = getProductRowDisplayValue(product, field);
  }

  function syncProductRowFulfillmentControl(row, product) {
    if (!row || !product) return;
    const button = row.querySelector("[data-fulfillment-toggle]");
    if (!button) return;
    const mode = normalizeProductFulfillmentMode(product.fulfillment_mode);
    button.dataset.mode = mode;
    const text = button.querySelector("span");
    if (text) text.textContent = getProductFulfillmentModeLabel(mode);
  }

  function syncProductEditorFulfillmentControl(productId, mode) {
    if (Number(state.selectedProductId || 0) !== Number(productId || 0)) return;
    const form = document.querySelector("#productEditorForm");
    if (!form || !form.fulfillment_mode) return;
    const normalized = normalizeProductFulfillmentMode(mode);
    form.fulfillment_mode.value = normalized;
    const text = document.querySelector("#peFulfillmentModeText");
    if (text) text.textContent = getProductFulfillmentModeLabel(normalized);
    document.querySelectorAll("#peFulfillmentModeMenu [data-value]").forEach((option) => {
      option.classList.toggle("is-selected", normalizeProductFulfillmentMode(option.dataset.value) === normalized);
    });
  }

  function syncProductRowSelectionUI(root = productsList) {
    if (!root) return;
    $$(".order-row.product-row[data-id]", root).forEach((row) => {
      const id = Number(row.dataset.id);
      const selected = state.selectedProductIds.has(id);
      row.classList.toggle("is-selected", selected);
      const checkbox = row.querySelector(".product-row-select-input");
      if (checkbox) checkbox.checked = selected;
    });
  }

  function getCurrentProductGroupIds() {
    return filterProductsCollection(state.products)
      .map((product) => Number(product?.id))
      .filter(Number.isFinite);
  }

  function closeProductsBulkMenu() {
    if (!productsBulkMenu || !productsBulkMenuWrap) return;
    productsBulkMenu.classList.add("hidden");
    productsBulkMenuWrap.classList.remove("is-open");
  }

  function countSelectedProductsBulkActions() {
    const actions = state.productsBulkActions || {};
    return Object.values(actions).reduce((acc, value) => acc + (value ? 1 : 0), 0);
  }

  function setProductsBulkAction(actionKey, nextValue) {
    const actions = state.productsBulkActions || (state.productsBulkActions = getDefaultProductsBulkActions());
    actions[actionKey] = Boolean(nextValue);
    if (actionKey === "activate" && actions.activate) actions.deactivate = false;
    if (actionKey === "deactivate" && actions.deactivate) actions.activate = false;
    if (actionKey === "show" && actions.show) actions.hide = false;
    if (actionKey === "hide" && actions.hide) actions.show = false;
    if (actionKey === "infinite_stock" && actions.infinite_stock) actions.zero_stock = false;
    if (actionKey === "zero_stock" && actions.zero_stock) actions.infinite_stock = false;
    if (actionKey === "fulfillment_stock" && actions.fulfillment_stock) actions.fulfillment_made_to_order = false;
    if (actionKey === "fulfillment_made_to_order" && actions.fulfillment_made_to_order) actions.fulfillment_stock = false;
  }

  function resetProductsBulkActions() {
    state.productsBulkActions = getDefaultProductsBulkActions();
    if (productsBulkMenu) {
      productsBulkMenu.querySelectorAll("input[data-bulk-action]").forEach((input) => {
        input.checked = false;
      });
    }
  }

  function syncProductsBulkActionsUi() {
    if (productsBulkMenu) {
      productsBulkMenu.querySelectorAll("input[data-bulk-action]").forEach((input) => {
        const key = String(input.dataset.bulkAction || "");
        input.checked = Boolean(state.productsBulkActions?.[key]);
      });
    }
    if (productsBulkActionsSelectedCount) {
      productsBulkActionsSelectedCount.textContent = String(countSelectedProductsBulkActions());
    }
    if (productsBulkApplyBtn) {
      productsBulkApplyBtn.disabled = state.productsBulkApplying || countSelectedProductsBulkActions() === 0 || state.selectedProductIds.size === 0;
    }
    if (productsBulkCancelBtn) {
      productsBulkCancelBtn.disabled = state.productsBulkApplying;
    }
    if (productsBulkMenuToggleBtn) {
      productsBulkMenuToggleBtn.disabled = state.productsBulkApplying;
    }
  }

  function buildProductsBulkPayload() {
    const actions = state.productsBulkActions || {};
    const payload = {};
    if (actions.activate) payload.is_active = 1;
    if (actions.deactivate) payload.is_active = 0;
    if (actions.show) payload.site_visibility = 1;
    if (actions.hide) payload.site_visibility = 0;
    if (actions.infinite_stock) payload.stock = null;
    if (actions.zero_stock) payload.stock = 0;
    if (actions.fulfillment_stock) payload.fulfillment_mode = "stock";
    if (actions.fulfillment_made_to_order) payload.fulfillment_mode = "made_to_order";
    return payload;
  }

  function applyProductsBulkPayloadToLocalProduct(product, payload) {
    if (!product || !payload) return;
    if (Object.prototype.hasOwnProperty.call(payload, "is_active")) applyInlineProductValue(product, "is_active", payload.is_active);
    if (Object.prototype.hasOwnProperty.call(payload, "site_visibility")) applyInlineProductValue(product, "site_visibility", payload.site_visibility);
    if (Object.prototype.hasOwnProperty.call(payload, "stock")) applyInlineProductValue(product, "stock", payload.stock);
    if (Object.prototype.hasOwnProperty.call(payload, "fulfillment_mode")) applyInlineProductValue(product, "fulfillment_mode", payload.fulfillment_mode);
  }

  function syncProductRowAfterBulkPayload(product, payload) {
    if (!productsList || !product || !payload) return;
    const id = Number(product.id || 0);
    if (!(id > 0)) return;
    const row = productsList.querySelector(`.order-row.product-row[data-id="${id}"]`);
    if (!filterProductsCollection([product]).length) {
      if (row) row.remove();
      return;
    }
    if (!row) return;
    if (Object.prototype.hasOwnProperty.call(payload, "is_active")) syncProductRowInlineControl(row, product, "is_active");
    if (Object.prototype.hasOwnProperty.call(payload, "site_visibility")) syncProductRowInlineControl(row, product, "site_visibility");
    if (Object.prototype.hasOwnProperty.call(payload, "stock")) syncProductRowInlineControl(row, product, "stock");
    if (Object.prototype.hasOwnProperty.call(payload, "fulfillment_mode")) syncProductRowFulfillmentControl(row, product);
  }

  function syncProductsBulkFooter() {
    if (!productsBulkFooter) return;
    const visibleGroupIds = getCurrentProductGroupIds();
    const selectedCount = state.mode === "products"
      ? visibleGroupIds.filter((id) => state.selectedProductIds.has(id)).length
      : state.selectedProductIds.size;
    const shouldShow = state.mode === "products" && selectedCount > 0;
    productsBulkFooter.classList.toggle("hidden", !shouldShow);
    if (!shouldShow) closeProductsBulkMenu();
    if (productsBulkSelectedCount) {
      productsBulkSelectedCount.textContent = String(selectedCount);
    }
    if (productsBulkToggleAllInput) {
      const selectedInGroup = visibleGroupIds.filter((id) => state.selectedProductIds.has(id)).length;
      productsBulkToggleAllInput.checked = visibleGroupIds.length > 0 && selectedInGroup === visibleGroupIds.length;
      productsBulkToggleAllInput.indeterminate = selectedInGroup > 0 && selectedInGroup < visibleGroupIds.length;
      productsBulkToggleAllInput.disabled = state.productsLoading || visibleGroupIds.length === 0;
    }
    if (productsBulkActions) {
      productsBulkActions.classList.toggle("hidden", !shouldShow);
    }
    syncProductsBulkActionsUi();
  }

  function clearProductsBulkSelection() {
    if (!state.selectedProductIds.size) {
      resetProductsBulkActions();
      closeProductsBulkMenu();
      syncProductsBulkFooter();
      return;
    }
    state.selectedProductIds.clear();
    resetProductsBulkActions();
    closeProductsBulkMenu();
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
  }

  function toggleProductCardSelection(productId, forceSelected = null) {
    const id = Number(productId);
    if (!Number.isFinite(id)) return;
    if (forceSelected === true) {
      state.selectedProductIds.add(id);
    } else if (forceSelected === false) {
      state.selectedProductIds.delete(id);
    } else if (state.selectedProductIds.has(id)) {
      state.selectedProductIds.delete(id);
    } else {
      state.selectedProductIds.add(id);
    }
    if (state.selectedProductIds.size === 0) {
      resetProductsBulkActions();
      closeProductsBulkMenu();
    }
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
  }

  async function toggleAllProductCardsInCategory() {
    if (state.mode !== "products") return;
    while (state.productsLoading) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    while (state.productsHasMore) {
      await loadMoreProducts();
    }
    const groupIds = getCurrentProductGroupIds();
    const allSelected = groupIds.length > 0 && groupIds.every((id) => state.selectedProductIds.has(id));
    groupIds.forEach((id) => {
      if (allSelected) state.selectedProductIds.delete(id);
      else state.selectedProductIds.add(id);
    });
    if (state.selectedProductIds.size === 0) {
      resetProductsBulkActions();
      closeProductsBulkMenu();
    }
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
  }

  function buildProductRowHtml(product, canSortProducts) {
    const active = Number(product.id) === Number(state.selectedProductId) ? "is-active" : "";
    const selected = state.selectedProductIds.has(Number(product.id)) ? "is-selected" : "";
    const stockValue = getProductRowDisplayValue(product, "stock");
    const stockUnitHint = getProductListUnitLabel(product);
    const costValue = getProductRowDisplayValue(product, "cost_price");
    const priceValue = getProductRowDisplayValue(product, "price");
    const fulfillmentMode = normalizeProductFulfillmentMode(product.fulfillment_mode);
    const fulfillmentLabel = getProductFulfillmentModeLabel(fulfillmentMode);
    const hasVariants = Number(product?.has_variants || 0) > 0;
    const isVariantsExpanded = hasVariants && state.productRowVariantsExpanded.has(Number(product.id));
    const variantsRows = state.productRowVariantsCache.get(Number(product.id));
    const variantsLoading = state.productRowVariantsLoading.has(Number(product.id));
    const variantsInlineHtml = (() => {
      if (!isVariantsExpanded) return "";
      let itemsHtml = "";
      if (variantsRows === undefined || variantsLoading) {
        itemsHtml = `<div class="product-row-variants-item is-muted">Загрузка вариантов...</div>`;
      } else if (Array.isArray(variantsRows) && variantsRows.length) {
        itemsHtml = variantsRows.map((item) => {
          const text = String(item?.text || "").trim();
          const photo = String(item?.photo || "").trim();
          const photoHtml = photo
            ? `<img class="product-row-variants-photo" src="${escapeHtml(photo)}" alt="" />`
            : `<div class="product-row-variants-photo product-row-variants-photo-placeholder" aria-hidden="true"></div>`;
          const assignmentId = Number(item?.assignmentId || 0);
          const valueIndex = Number(item?.valueIndex);
          const isDefault = item?.isDefault === true;
          const starIcon = isDefault ? "fas fa-star" : "far fa-star";
          const starClass = isDefault ? "is-active" : "";
          const starHtml = Number.isFinite(assignmentId) && assignmentId > 0 && Number.isFinite(valueIndex)
            ? `<button class="product-row-variant-default-btn ${starClass}" type="button" data-variant-default-btn data-assignment-id="${assignmentId}" data-variant-index="${valueIndex}" aria-label="${isDefault ? "Вариант по умолчанию" : "Сделать вариантом по умолчанию"}"><i class="${starIcon}"></i></button>`
            : `<span class="product-row-variant-default-btn is-disabled" aria-hidden="true"><i class="far fa-star"></i></span>`;
          return `<div class="product-row-variants-item">${starHtml}${photoHtml}<div class="product-row-variants-text">${escapeHtml(text)}</div></div>`;
        }).join("");
      } else {
        itemsHtml = `<div class="product-row-variants-item is-muted">Варианты не заданы</div>`;
      }
      return `<div class="product-row-variants-inline"><div class="product-row-variants-list">${itemsHtml}</div></div>`;
    })();
    const hasPhoto = Array.isArray(product.photos) && product.photos.length > 0;
    const avatar = hasPhoto
      ? `<img class="product-thumb" src="${escapeHtml(product.photos[0])}" alt="" />`
      : `<div class="product-avatar">${escapeHtml(initials(product.name))}</div>`;

    return `
      <div class="order-row product-row ${active} ${selected}" data-id="${product.id}" draggable="${canSortProducts ? "true" : "false"}">
        <label class="product-row-select-control" aria-label="Выбрать товар">
          <input class="product-row-select-input" type="checkbox" ${selected ? "checked" : ""} tabindex="-1" />
          <span class="product-row-select-box" aria-hidden="true"></span>
        </label>
        <div class="product-row-photo-select" aria-hidden="true">
          ${avatar}
        </div>
        <div class="product-main-head">
          <div class="product-title">${escapeHtml(product.name)}</div>
        </div>
        <div class="product-row-switch-field field-wrap">
          <label class="switch switch-compact product-row-switch" aria-label="Активен">
            <input class="switch-input" type="checkbox" data-inline-field="is_active" ${Number(product.is_active) ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
        </div>
        <div class="product-row-switch-field field-wrap">
          <label class="switch switch-compact product-row-switch" aria-label="Виден на сайте">
            <input class="switch-input" type="checkbox" data-inline-field="site_visibility" ${Number(product.site_visibility) ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
        </div>
        <div class="product-row-fulfillment-field field-wrap">
          <button class="product-row-fulfillment-toggle" type="button" data-fulfillment-toggle data-mode="${escapeHtml(fulfillmentMode)}" aria-label="Режим продажи товара">
            <span>${escapeHtml(fulfillmentLabel)}</span>
          </button>
        </div>
        <div class="product-row-field product-row-field--stock field-wrap">
          <div class="product-row-stock-input-wrap">
            <input class="control control-sm product-row-input product-row-inline-input" type="text" inputmode="decimal" data-inline-field="stock" value="${escapeHtml(stockValue)}" placeholder="—" aria-label="Остаток" />
            <span class="product-row-stock-unit-hint">${escapeHtml(stockUnitHint)}</span>
          </div>
        </div>
        <div class="product-row-field field-wrap">
          <input class="control control-sm product-row-input product-row-inline-input" type="text" inputmode="decimal" data-inline-field="cost_price" value="${escapeHtml(costValue)}" placeholder="—" aria-label="Себестоимость" />
        </div>
        <div class="product-row-field field-wrap">
          <input class="control control-sm product-row-input product-row-inline-input" type="text" inputmode="decimal" data-inline-field="price" value="${escapeHtml(priceValue)}" placeholder="—" aria-label="Цена" />
        </div>
        <div class="product-row-variants-indicator">
          ${hasVariants
            ? `<button class="product-row-variants-toggle" type="button" data-variants-toggle data-product-id="${Number(product.id)}" aria-expanded="${isVariantsExpanded ? "true" : "false"}" aria-label="${isVariantsExpanded ? "Свернуть варианты" : "Показать варианты"}"><i class="fas fa-chevron-${isVariantsExpanded ? "up" : "down"}"></i></button>`
            : ""}
        </div>
        ${variantsInlineHtml}
      </div>
    `;
  }

  function productBelongsToCurrentCategory(categoryIds) {
    const cid = Number(state.currentCategoryId || 0);
    if (!(cid > 0)) return false;
    if (Number(state.allCategoryId || 0) === cid) return true;
    return (Array.isArray(categoryIds) ? categoryIds : [])
      .map((id) => Number(id || 0))
      .some((id) => id === cid);
  }

  function upsertSavedProductInList(product, categoryIds) {
    if (!product || !productsList) return;
    const productId = Number(product.id || 0);
    if (!(productId > 0)) return;
    const existingIndex = (state.products || []).findIndex((p) => Number(p.id) === productId);
    const previous = existingIndex >= 0 ? state.products[existingIndex] : null;
    const merged = { ...(previous || {}), ...product };
    const shouldKeepInCategory = productBelongsToCurrentCategory(categoryIds);
    const shouldShow = shouldKeepInCategory && filterProductsCollection([merged]).length > 0;
    const existingRow = productsList.querySelector(`.order-row.product-row[data-id="${productId}"]`);

    if (shouldKeepInCategory) {
      if (existingIndex >= 0) state.products[existingIndex] = merged;
      else state.products.push(merged);
    } else if (existingIndex >= 0) {
      state.products.splice(existingIndex, 1);
    }

    if (!shouldShow) {
      if (existingRow) existingRow.remove();
      syncProductsListEmptyState();
      syncProductsBulkFooter();
      setCachedCategoryProducts(state.currentCategoryId, {
        products: state.products,
        productsOffset: state.productsOffset,
        productsTotal: state.productsTotal,
        productsHasMore: state.productsHasMore,
        combosInCategory: state.combosInCategory,
      });
      return;
    }

    const canSortProducts = !state.productsHasMore && !state.productsLoading;
    const template = document.createElement("template");
    template.innerHTML = buildProductRowHtml(merged, canSortProducts).trim();
    const nextRow = template.content.firstElementChild;
    if (!nextRow) return;

    if (existingRow) {
      existingRow.replaceWith(nextRow);
    } else {
      const firstComboRow = productsList.querySelector(".order-row.combo-row");
      if (firstComboRow) firstComboRow.before(nextRow);
      else productsList.appendChild(nextRow);
    }
    bindProductRowClickHandlers(productsList);
    bindProductRowInlineEditors(productsList);
    syncProductRowsSortability();
    syncProductsListEmptyState();
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
    setCachedCategoryProducts(state.currentCategoryId, {
      products: state.products,
      productsOffset: state.productsOffset,
      productsTotal: state.productsTotal,
      productsHasMore: state.productsHasMore,
      combosInCategory: state.combosInCategory,
    });
  }

  function buildComboRowHtml(combo) {
    const title = (combo?.title || "").trim() || "Комбо";
    const comboId = Number(combo?.id || 0);
    const gridPlaceholder = `<div class="combo-row-photo-grid" data-combo-grid-id="${comboId}">${buildComboRowPhotoGridHtml(getCachedComboRowPhotos(comboId) || [])}</div>`;
    return `
        <div class="order-row combo-row" data-combo-id="${comboId}" draggable="false">
          ${gridPlaceholder}
          <div class="combo-row-content">
            <span class="product-title">${escapeHtml(title)}</span>
            <span class="pill combo-row-pill">Комбо</span>
            <span class="muted combo-row-muted">Комбо-набор</span>
          </div>
          <div class="product-right"></div>
        </div>
      `;
  }

  function comboBelongsToCurrentCategory(combo) {
    const cid = Number(state.currentCategoryId || 0);
    if (!(cid > 0)) return false;
    if (Number(state.allCategoryId || 0) === cid) return true;
    const cat = state.categories.find((c) => Number(c.id) === cid);
    const categoryCode = cat && cat.code && String(cat.code).trim() && cat.code !== "all"
      ? String(cat.code).trim()
      : "";
    return Boolean(categoryCode) && String(combo?.category_code || "").trim() === categoryCode;
  }

  function upsertSavedComboInList(combo) {
    if (!combo || !productsList) return;
    const comboId = Number(combo.id || 0);
    if (!(comboId > 0)) return;
    const shouldShow = !shouldHideProductCombos() && comboBelongsToCurrentCategory(combo);
    const existingIndex = (state.combosInCategory || []).findIndex((c) => Number(c.id) === comboId);
    const existingRow = productsList.querySelector(`.order-row.combo-row[data-combo-id="${comboId}"]`);

    if (shouldShow) {
      if (existingIndex >= 0) state.combosInCategory[existingIndex] = { ...state.combosInCategory[existingIndex], ...combo };
      else state.combosInCategory.push(combo);
    } else if (existingIndex >= 0) {
      state.combosInCategory.splice(existingIndex, 1);
    }

    if (!shouldShow) {
      if (existingRow) existingRow.remove();
      syncProductsListEmptyState();
      setCachedCategoryProducts(state.currentCategoryId, {
        products: state.products,
        productsOffset: state.productsOffset,
        productsTotal: state.productsTotal,
        productsHasMore: state.productsHasMore,
        combosInCategory: state.combosInCategory,
      });
      return;
    }

    const template = document.createElement("template");
    template.innerHTML = buildComboRowHtml(combo).trim();
    const nextRow = template.content.firstElementChild;
    if (!nextRow) return;
    if (existingRow) existingRow.replaceWith(nextRow);
    else productsList.appendChild(nextRow);
    bindComboRowClickHandlers(productsList);
    hydrateComboRowThumbs();
    syncProductsListEmptyState();
    setCachedCategoryProducts(state.currentCategoryId, {
      products: state.products,
      productsOffset: state.productsOffset,
      productsTotal: state.productsTotal,
      productsHasMore: state.productsHasMore,
      combosInCategory: state.combosInCategory,
    });
  }

  function getProductRowPhotoUrl(product) {
    const photos = Array.isArray(product?.photos) ? product.photos : [];
    const first = photos.length ? String(photos[0] || "").trim() : "";
    return first || "";
  }

  function buildProductVariantsRows(product, groups) {
    const productName = String(product?.name || "").trim();
    const productPhoto = getProductRowPhotoUrl(product);
    const out = [];
    (Array.isArray(groups) ? groups : []).forEach((group) => {
      const unit = String(group?.unit_short_title || group?.unit_code || group?.unit_title || "").trim();
      const values = Array.isArray(group?.values) ? group.values : [];
      const assignmentId = Number(group?.assignment_id || 0);
      const rawDefaultIdx = group?.assignment_default_value_index ?? group?.default_value_index;
      const defaultValueIndex = rawDefaultIdx != null ? Number(rawDefaultIdx) : null;
      values.forEach((rawValue, valueIndex) => {
        const value = String(rawValue ?? "").trim();
        if (!value) return;
        const text = unit ? `${value} ${unit} ${productName}` : `${value} ${productName}`;
        out.push({
          text,
          photo: productPhoto,
          assignmentId,
          valueIndex: Number(valueIndex),
          defaultValueIndex,
          isDefault: Number.isFinite(defaultValueIndex) ? Number(defaultValueIndex) === Number(valueIndex) : false,
        });
      });
    });
    return out;
  }

  async function ensureProductRowVariantsLoaded(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return [];
    if (state.productRowVariantsCache.has(pid)) return state.productRowVariantsCache.get(pid) || [];
    if (state.productRowVariantsLoading.has(pid)) return [];
    const product = (state.products || []).find((p) => Number(p?.id) === pid);
    if (!product) return [];
    state.productRowVariantsLoading.add(pid);
    try {
      const res = await apiGetProductVariants(pid);
      const groups = Array.isArray(res?.data) ? res.data : [];
      const rows = buildProductVariantsRows(product, groups);
      state.productRowVariantsCache.set(pid, rows);
      return rows;
    } catch (_) {
      state.productRowVariantsCache.set(pid, []);
      return [];
    } finally {
      state.productRowVariantsLoading.delete(pid);
    }
  }

  async function toggleProductRowVariants(productId) {
    const pid = Number(productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    const product = (state.products || []).find((p) => Number(p?.id) === pid);
    if (!product || Number(product?.has_variants || 0) <= 0) return;
    if (state.productRowVariantsExpanded.has(pid)) {
      state.productRowVariantsExpanded.delete(pid);
      renderProductsList();
      return;
    }
    state.productRowVariantsExpanded.add(pid);
    renderProductsList();
    await ensureProductRowVariantsLoaded(pid);
    renderProductsList();
  }

  async function setProductRowDefaultVariant(assignmentId, variantIndex) {
    const aid = Number(assignmentId);
    const idx = Number(variantIndex);
    if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(idx) || idx < 0) return;
    await apiPatchVariantAssignment(aid, { default_value_index: idx });
    state.productRowVariantsCache.forEach((rows, pid) => {
      if (!Array.isArray(rows)) return;
      let touched = false;
      const updated = rows.map((row) => {
        if (Number(row?.assignmentId || 0) !== aid) return row;
        touched = true;
        const rowIndex = Number(row?.valueIndex);
        return {
          ...row,
          defaultValueIndex: idx,
          isDefault: Number.isFinite(rowIndex) ? rowIndex === idx : false,
        };
      });
      if (touched) state.productRowVariantsCache.set(pid, updated);
    });
    renderProductsList();
  }

  async function toggleProductRowFulfillment(productId, button) {
    const id = Number(productId || 0);
    if (!(id > 0) || !button || button.dataset.saving === "1") return;
    const product = state.products.find((x) => Number(x.id) === id);
    if (!product) return;

    const previousMode = normalizeProductFulfillmentMode(product.fulfillment_mode);
    const nextMode = previousMode === "made_to_order" ? "stock" : "made_to_order";

    button.dataset.saving = "1";
    button.disabled = true;
    try {
      if (nextMode === "made_to_order") {
        const ingredientsRes = await apiGetProductIngredients(id);
        const ingredients = Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : [];
        if (!ingredients.length) {
          showToast("Не удалось сменить режим продажи: добавьте состав товара.");
          return;
        }
      }

      await api(`/api/prod_products/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ fulfillment_mode: nextMode }),
      });
      applyInlineProductValue(product, "fulfillment_mode", nextMode);
      syncProductRowFulfillmentControl(button.closest(".product-row"), product);
      syncProductEditorFulfillmentControl(id, nextMode);
      clearCachedProductDetails(id);
      clearCachedProductView(id);
      setCachedCategoryProducts(state.currentCategoryId, {
        products: state.products,
        productsOffset: state.productsOffset,
        productsTotal: state.productsTotal,
        productsHasMore: state.productsHasMore,
        combosInCategory: state.combosInCategory,
      });
    } catch (e) {
      showToast("Не удалось сменить режим продажи.");
    } finally {
      button.dataset.saving = "";
      button.disabled = false;
    }
  }

  function syncProductsListEmptyState() {
    if (!productsEmptyHint) return;
    const combos = shouldHideProductCombos() ? [] : (state.combosInCategory ?? []);
    const empty = filterProductsCollection(state.products).length === 0 && combos.length === 0;
    productsEmptyHint.style.display = empty ? "block" : "none";
  }

  function bindProductRowClickHandlers(root = productsList) {
    if (!root) return;
    $$(".order-row.product-row[data-id]", root).forEach((row) => {
      if (row.dataset.boundClick === "1") return;
      row.dataset.boundClick = "1";
      row.addEventListener("click", async (event) => {
        if (Date.now() < productRowsDragSuppressClickUntil) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const variantsToggleBtn = event.target.closest("[data-variants-toggle]");
        if (variantsToggleBtn) {
          event.preventDefault();
          event.stopPropagation();
          const toggleProductId = Number(variantsToggleBtn.dataset.productId || row.dataset.id);
          await toggleProductRowVariants(toggleProductId);
          return;
        }
        const variantDefaultBtn = event.target.closest("[data-variant-default-btn]");
        if (variantDefaultBtn) {
          event.preventDefault();
          event.stopPropagation();
          const assignmentId = Number(variantDefaultBtn.dataset.assignmentId || 0);
          const variantIndex = Number(variantDefaultBtn.dataset.variantIndex || -1);
          variantDefaultBtn.setAttribute("disabled", "disabled");
          try {
            await setProductRowDefaultVariant(assignmentId, variantIndex);
          } catch (e) {
            alert("Ошибка сохранения варианта по умолчанию: " + (e.message || "Неизвестная ошибка"));
          } finally {
            variantDefaultBtn.removeAttribute("disabled");
          }
          return;
        }
        if (event.target.closest(".product-row-select-control")) {
          event.preventDefault();
          event.stopPropagation();
          const id = Number(row.dataset.id);
          toggleProductCardSelection(id);
          return;
        }
        const fulfillmentToggle = event.target.closest("[data-fulfillment-toggle]");
        if (fulfillmentToggle) {
          event.preventDefault();
          event.stopPropagation();
          await toggleProductRowFulfillment(Number(row.dataset.id), fulfillmentToggle);
          return;
        }
        if (event.target.closest(".product-row-field") || event.target.closest(".product-row-switch") || event.target.closest(".product-row-switch-field")) {
          return;
        }
        const id = Number(row.dataset.id);
        const p = state.products.find((x) => Number(x.id) === id);
        if (!p) return;
        await openProductById(id);
        openProductTab(p, { activate: false });
      });
    });
  }

  function bindProductRowInlineEditors(root = productsList) {
    if (!root) return;
    $$(".order-row.product-row[data-id]", root).forEach((row) => {
      if (row.dataset.boundInlineEditing === "1") return;
      row.dataset.boundInlineEditing = "1";
      const productId = Number(row.dataset.id);
      const product = state.products.find((x) => Number(x.id) === productId);
      if (!product) return;

      const fulfillmentToggle = row.querySelector("[data-fulfillment-toggle]");
      if (fulfillmentToggle) {
        fulfillmentToggle.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          await toggleProductRowFulfillment(productId, fulfillmentToggle);
        });
      }

      row.querySelectorAll('[data-inline-field="is_active"], [data-inline-field="site_visibility"]').forEach((switchInput) => {
        const field = switchInput.dataset.inlineField;
        switchInput.addEventListener("click", (event) => event.stopPropagation());
        switchInput.addEventListener("change", async () => {
          const previousValue = Boolean(field === "is_active" ? product.is_active : product.site_visibility);
          const nextValue = Boolean(switchInput.checked);
          switchInput.disabled = true;
          try {
            await api(`/api/prod_products/${productId}`, {
              method: "PATCH",
              body: JSON.stringify({ [field]: nextValue ? 1 : 0 }),
            });
            applyInlineProductValue(product, field, nextValue ? 1 : 0);
            upsertSavedProductInList(product, [state.currentCategoryId]);
          } catch (e) {
            switchInput.checked = previousValue;
            alert("Ошибка сохранения статуса товара: " + (e.message || "Неизвестная ошибка"));
          } finally {
            switchInput.disabled = false;
          }
        });
      });

      row.querySelectorAll(".product-row-inline-input[data-inline-field]").forEach((input) => {
        const field = input.dataset.inlineField;
        input.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("focus", () => {
          input.dataset.inlineOriginal = getProductRowEditableValue(product, field);
          input.dataset.inlineCancelled = "";
          input.value = getProductRowEditableValue(product, field);
          input.select();
        });
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            input.dataset.inlineCancelled = "1";
            input.value = getProductRowDisplayValue(product, field);
            input.blur();
          }
        });
        input.addEventListener("blur", async () => {
          if (input.dataset.inlineSaving === "1") return;
          if (input.dataset.inlineCancelled === "1") {
            input.dataset.inlineCancelled = "";
            input.value = getProductRowDisplayValue(product, field);
            return;
          }

          const draftValue = String(input.value ?? "").trim();
          const normalizedValue = parseProductRowInlineNumber(field, draftValue, product);
          const previousComparable = getInlineProductComparableValue(product, field);
          const nextComparable = field === "price"
            ? (normalizedValue != null ? Number(normalizedValue) : 0)
            : (normalizedValue != null ? Number(normalizedValue) : null);

          if (previousComparable === nextComparable) {
            input.value = getProductRowDisplayValue(product, field);
            return;
          }

          const payload = {};
          payload[field] = field === "price" ? (normalizedValue ?? 0) : normalizedValue;

          input.dataset.inlineSaving = "1";
          input.disabled = true;
          try {
            await api(`/api/prod_products/${productId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
            applyInlineProductValue(product, field, payload[field]);
            if (field === "stock") {
              upsertSavedProductInList(product, [state.currentCategoryId]);
            } else {
              syncProductRowInlineControl(row, product, field);
            }
          } catch (e) {
            input.value = getProductRowDisplayValue(product, field);
            alert("Ошибка сохранения поля товара: " + (e.message || "Неизвестная ошибка"));
          } finally {
            input.dataset.inlineSaving = "";
            input.disabled = false;
          }
        });
      });
    });
  }

  function bindComboRowClickHandlers(root = productsList) {
    if (!root) return;
    $$(".order-row.combo-row[data-combo-id]", root).forEach((row) => {
      if (row.dataset.boundClick === "1") return;
      row.dataset.boundClick = "1";
      row.addEventListener("click", async () => {
        const comboId = Number(row.dataset.comboId);
        if (!Number.isFinite(comboId)) return;
        const tabKey = buildTabKey("combo-set", String(comboId));
        if (tabsState.tabs.some((t) => t.key === tabKey)) {
          await setActiveTabKey(tabKey);
          return;
        }
        await openComboSetView(comboId);
      });
    });
  }

  function hydrateComboRowThumbs() {
    if (!productsList) return;
    const combos = state.combosInCategory ?? [];
    combos.forEach((combo) => {
      const comboId = Number(combo.id);
      if (!Number.isFinite(comboId)) return;
      getFirstFourBlockPhotosForCombo(comboId).then((urls) => {
        const row = productsList.querySelector(`.combo-row[data-combo-id="${comboId}"]`);
        const grid = row?.querySelector(".combo-row-photo-grid[data-combo-grid-id]");
        if (grid) grid.innerHTML = buildComboRowPhotoGridHtml(urls);
      });
    });
  }

  function persistProductOrderFromDom() {
    const ordered = $$(".order-row.product-row[data-id]", productsList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
    return api("/api/sort/prod_products", {
      method: "POST",
      body: JSON.stringify({ category_id: state.currentCategoryId, orderedProductIds: ordered }),
    });
  }

  function getProductRowsListInDomOrder() {
    return $$(".order-row.product-row[data-id]", productsList);
  }

  function getProductRowsDragGroup(anchorRow) {
    const anchorId = Number(anchorRow?.dataset.id);
    if (!Number.isFinite(anchorId)) return [];
    const rows = getProductRowsListInDomOrder();
    if (!state.selectedProductIds.has(anchorId) || state.selectedProductIds.size < 2) {
      return [anchorRow];
    }
    const selectedRows = rows.filter((row) => state.selectedProductIds.has(Number(row.dataset.id)));
    return selectedRows.length ? selectedRows : [anchorRow];
  }

  function clearProductRowsDragVisuals() {
    if (productRowsDragState.placeholder?.parentNode) {
      productRowsDragState.placeholder.parentNode.removeChild(productRowsDragState.placeholder);
    }
    productRowsDragState.dragRows.forEach((row) => row.classList.remove("is-drag-hidden"));
    productRowsDragState.placeholder = null;
    productRowsDragState.ghost = null;
    productRowsDragState.dragRows = [];
    productsList?.classList.remove("is-product-dragging");
  }

  function stopProductRowsAutoScroll() {
    if (productRowsDragState.scrollRAF) {
      cancelAnimationFrame(productRowsDragState.scrollRAF);
      productRowsDragState.scrollRAF = 0;
    }
  }

  function updateProductRowsPlaceholderPosition(clientY) {
    if (!productsList || !productRowsDragState.placeholder) return;
    const placeholder = productRowsDragState.placeholder;
    const candidates = getProductRowsListInDomOrder().filter((row) => !row.classList.contains("is-drag-hidden"));
    let target = null;
    for (const row of candidates) {
      const rect = row.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) {
        target = row;
        break;
      }
    }
    if (target) {
      if (placeholder !== target.previousElementSibling) {
        productsList.insertBefore(placeholder, target);
      }
      return;
    }
    const firstComboRow = productsList.querySelector(".order-row.combo-row");
    if (firstComboRow) {
      if (placeholder.nextElementSibling !== firstComboRow) {
        productsList.insertBefore(placeholder, firstComboRow);
      }
    } else {
      productsList.appendChild(placeholder);
    }
  }

  function startProductRowsAutoScroll() {
    if (productRowsDragState.scrollRAF) return;
    const step = () => {
      productRowsDragState.scrollRAF = 0;
      if (!productRowsDragState.active || !productsScrollEl) return;
      const rect = productsScrollEl.getBoundingClientRect();
      const edge = 56;
      let delta = 0;
      if (productRowsDragState.currentY < rect.top + edge) {
        delta = -Math.max(4, Math.round((rect.top + edge - productRowsDragState.currentY) / 6));
      } else if (productRowsDragState.currentY > rect.bottom - edge) {
        delta = Math.max(4, Math.round((productRowsDragState.currentY - (rect.bottom - edge)) / 6));
      }
      if (delta !== 0) {
        productsScrollEl.scrollTop += delta;
        updateProductRowsPlaceholderPosition(productRowsDragState.currentY);
        productRowsDragState.scrollRAF = requestAnimationFrame(step);
      }
    };
    productRowsDragState.scrollRAF = requestAnimationFrame(step);
  }

  function activateProductRowsDrag() {
    if (!productsList || productRowsDragState.active || !productRowsDragState.anchorRow) return;
    const dragRows = getProductRowsDragGroup(productRowsDragState.anchorRow);
    if (!dragRows.length) return;

    const firstRect = dragRows[0].getBoundingClientRect();
    const lastRect = dragRows[dragRows.length - 1].getBoundingClientRect();
    const placeholder = document.createElement("div");
    placeholder.className = "product-rows-drag-placeholder";
    const groupHeight = Math.max(24, Math.round(lastRect.bottom - firstRect.top));
    placeholder.style.setProperty("--drag-group-height", `${groupHeight}px`);

    dragRows[0].before(placeholder);
    dragRows.forEach((row) => row.classList.add("is-drag-hidden"));

    productRowsDragState.active = true;
    productRowsDragState.dragRows = dragRows;
    productRowsDragState.placeholder = placeholder;
    productRowsDragState.ghost = null;
    productsList.classList.add("is-product-dragging");
    updateProductRowsPlaceholderPosition(productRowsDragState.currentY || productRowsDragState.startY);
    startProductRowsAutoScroll();
  }

  function moveProductRowsDragGhost(clientX, clientY) {
    return;
  }

  async function finishProductRowsDrag(cancelled = false) {
    stopProductRowsAutoScroll();
    const wasActive = productRowsDragState.active;
    const dragRows = productRowsDragState.dragRows.slice();
    const placeholder = productRowsDragState.placeholder;
    try {
      if (!cancelled && wasActive && productsList && placeholder && dragRows.length) {
        dragRows.forEach((row) => productsList.insertBefore(row, placeholder));
        if (!productRowsDragState.saving) {
          productRowsDragState.saving = true;
          try {
            await persistProductOrderFromDom();
          } catch (e) {
            console.error(e);
            try {
              await refreshAll();
            } catch (refreshError) {
              console.error(refreshError);
            }
          } finally {
            productRowsDragState.saving = false;
          }
        }
        productRowsDragSuppressClickUntil = Date.now() + 180;
      }
    } finally {
      clearProductRowsDragVisuals();
      productRowsDragState.armed = false;
      productRowsDragState.active = false;
      productRowsDragState.pointerId = null;
      productRowsDragState.anchorRow = null;
      productRowsDragState.startX = 0;
      productRowsDragState.startY = 0;
      productRowsDragState.currentY = 0;
    }
  }

  function bindProductRowsDragSort(enable) {
    if (!productsList) return;
    productRowsDragState.enabled = Boolean(enable);
    if (productsList.dataset.productDragBound === "1") return;
    productsList.dataset.productDragBound = "1";

    productsList.addEventListener("pointerdown", (event) => {
      if (!productRowsDragState.enabled) return;
      if (productRowsDragState.saving) return;
      if (event.button !== 0) return;
      if (event.target.closest("[data-variants-toggle]") || event.target.closest("[data-variant-default-btn]") || event.target.closest("[data-fulfillment-toggle]") || event.target.closest(".product-row-select-control") || event.target.closest(".product-row-field") || event.target.closest(".product-row-switch") || event.target.closest(".product-row-switch-field") || event.target.closest(".product-row-inline-input")) {
        return;
      }
      const row = event.target.closest(".order-row.product-row[data-id]");
      if (!row) return;
      if (productsList.querySelector(".order-row.product-row.is-dragging")) return;

      productRowsDragState.armed = true;
      productRowsDragState.active = false;
      productRowsDragState.pointerId = event.pointerId;
      productRowsDragState.startX = event.clientX;
      productRowsDragState.startY = event.clientY;
      productRowsDragState.currentY = event.clientY;
      productRowsDragState.anchorRow = row;

      const moveHandler = (moveEvent) => {
        if (moveEvent.pointerId !== productRowsDragState.pointerId) return;
        productRowsDragState.currentY = moveEvent.clientY;
        const dx = Math.abs(moveEvent.clientX - productRowsDragState.startX);
        const dy = Math.abs(moveEvent.clientY - productRowsDragState.startY);
        if (!productRowsDragState.active && (dx > 6 || dy > 6)) {
          activateProductRowsDrag();
        }
        if (!productRowsDragState.active) return;
        moveEvent.preventDefault();
        updateProductRowsPlaceholderPosition(moveEvent.clientY);
        startProductRowsAutoScroll();
      };

      const upHandler = async (upEvent) => {
        if (upEvent.pointerId !== productRowsDragState.pointerId) return;
        window.removeEventListener("pointermove", moveHandler, true);
        window.removeEventListener("pointerup", upHandler, true);
        window.removeEventListener("pointercancel", upHandler, true);
        await finishProductRowsDrag(!productRowsDragState.active);
      };

      productRowsDragState.moveHandler = moveHandler;
      productRowsDragState.upHandler = upHandler;
      window.addEventListener("pointermove", moveHandler, true);
      window.addEventListener("pointerup", upHandler, true);
      window.addEventListener("pointercancel", upHandler, true);
    });
  }

  function syncProductRowsSortability() {
    if (!productsList) return;
    const canSortProducts = !state.productsHasMore && !state.productsLoading;
    $$(".order-row.product-row[data-id]", productsList).forEach((row) => {
      row.setAttribute("draggable", "false");
    });
    bindProductRowsDragSort(canSortProducts);
  }

  function appendProductRowsToList(items) {
    if (!productsList) return;
    const list = filterProductsCollection(items);
    if (!list.length) {
      syncProductRowsSortability();
      syncProductsListEmptyState();
      syncProductRowSelectionUI(productsList);
      syncProductsBulkFooter();
      return;
    }
    const canSortProducts = !state.productsHasMore && !state.productsLoading;
    const html = list.map((product) => buildProductRowHtml(product, canSortProducts)).join("");
    const template = document.createElement("template");
    template.innerHTML = html.trim();
    const firstComboRow = productsList.querySelector(".order-row.combo-row");
    if (firstComboRow) {
      firstComboRow.before(template.content);
    } else {
      productsList.appendChild(template.content);
    }
    bindProductRowClickHandlers(productsList);
    bindProductRowInlineEditors(productsList);
    syncProductRowsSortability();
    syncProductsListEmptyState();
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
  }

  function renderProductsList() {
    if (!productsList) return;
    const canSortProducts = !state.productsHasMore && !state.productsLoading;
    const visibleProducts = filterProductsCollection(state.products);
    const productRows = visibleProducts.map((product) => buildProductRowHtml(product, canSortProducts));
    const combos = shouldHideProductCombos() ? [] : (state.combosInCategory ?? []);
    const comboRows = combos.map((c) => {
      const title = (c.title || "").trim() || "Комбо";
      const gridPlaceholder = `<div class="combo-row-photo-grid" data-combo-grid-id="${c.id}">${buildComboRowPhotoGridHtml([])}</div>`;
      return `
        <div class="order-row combo-row" data-combo-id="${c.id}" draggable="false">
          ${gridPlaceholder}
          <div class="combo-row-content">
            <span class="product-title">${escapeHtml(title)}</span>
            <span class="pill combo-row-pill">Комбо</span>
            <span class="muted combo-row-muted">Комбо-набор</span>
          </div>
          <div class="product-right"></div>
        </div>
      `;
    });

    productsList.innerHTML = productRows.join("") + comboRows.join("");
    bindProductRowClickHandlers(productsList);
    bindProductRowInlineEditors(productsList);
    bindComboRowClickHandlers(productsList);
    hydrateComboRowThumbs();
    syncProductRowsSortability();
    syncProductsListEmptyState();
    syncProductRowSelectionUI(productsList);
    syncProductsBulkFooter();
  }

  // ---------------- Categories main list ----------------

  function renderCategoriesMainList() {
    if (!categoriesMainList) return;

    const list = state.categories
      .filter((c) => c.parent_id == null)
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    function categorySwitchHtml(field, checked, label) {
      return `
        <div class="category-row-switch-field field-wrap">
          <label class="switch switch-compact category-row-switch" aria-label="${escapeHtml(label)}">
            <input class="switch-input" type="checkbox" data-category-toggle="${escapeHtml(field)}" ${Number(checked) ? "checked" : ""} />
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
        </div>
      `;
    }

    categoriesMainList.innerHTML = list.map((c) => {
      const active = c.id === state.selectedCategoryId ? "is-active" : "";
      return `
        <div class="order-row category-row ${active}" data-id="${c.id}" draggable="true">
          <div class="category-row-icon">
            ${renderCategoryIcon(c.icon, "category-icon")}
          </div>
          <div class="category-row-title">
            <div class="order-line"><b>${escapeHtml(c.title)}</b></div>
          </div>
          ${categorySwitchHtml("is_active", c.is_active, "Активен")}
          ${categorySwitchHtml("site_visibility", c.site_visibility, "На сайте")}
          ${categorySwitchHtml("checkout_visibility", c.checkout_visibility !== 0, "При заказе")}
          ${categorySwitchHtml("cart_visibility", c.cart_visibility, "В корзине")}
        </div>
      `;
    }).join("");

    const empty = list.length === 0;
    if (categoriesEmptyHint) categoriesEmptyHint.style.display = empty ? "block" : "none";

    makeSortable(categoriesMainList, ".order-row", async () => {
      const ordered = $$(".order-row", categoriesMainList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
      await api("/api/sort/prod_categories", { method: "POST", body: JSON.stringify({ orderedIds: ordered }) });
      await refreshAll();
      enterCategoriesMode();
      renderCategoriesMainList();
    });

    // click select
    $$(".category-row", categoriesMainList).forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest(".category-row-switch")) return;
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (!cat) return;
        state.selectedCategoryId = id;
        $$(".category-row", categoriesMainList).forEach((x) => x.classList.toggle("is-active", Number(x.dataset.id) === id));
        showCategoryDetails(cat);
      });

      // dblclick edit
      row.addEventListener("dblclick", () => {
        const id = Number(row.dataset.id);
        const cat = state.categories.find((x) => x.id === id);
        if (cat) openCategoryEditor({ mode: "edit", category: cat });
      });
    });

    categoriesMainList.querySelectorAll("[data-category-toggle]").forEach((input) => {
      input.addEventListener("click", (event) => event.stopPropagation());
      input.addEventListener("change", async (event) => {
        event.stopPropagation();
        const checkbox = event.currentTarget;
        const row = checkbox.closest(".category-row[data-id]");
        const id = Number(row?.dataset.id || 0);
        const field = String(checkbox.dataset.categoryToggle || "");
        const allowedFields = new Set(["is_active", "site_visibility", "checkout_visibility", "cart_visibility"]);
        if (!(id > 0) || !allowedFields.has(field)) return;
        const cat = state.categories.find((x) => Number(x.id) === id);
        if (!cat) return;

        const previous = Number(cat[field]) ? 1 : 0;
        const next = checkbox.checked ? 1 : 0;
        checkbox.disabled = true;
        cat[field] = next;

        const payload = {
          tenant_id: TENANT_ID,
          title: cat.title || "",
          code: cat.code || "",
          icon: cat.icon || "",
          sort_order: cat.sort_order == null ? null : Number(cat.sort_order),
          is_active: Number(cat.is_active) ? 1 : 0,
          site_visibility: Number(cat.site_visibility) ? 1 : 0,
          cart_visibility: Number(cat.cart_visibility) ? 1 : 0,
          checkout_visibility: Number(cat.checkout_visibility) ? 1 : 0,
        };

        try {
          await api(`/api/prod_categories/${id}`, { method: "PUT", body: JSON.stringify(payload) });
        } catch (e) {
          cat[field] = previous;
          checkbox.checked = Boolean(previous);
          showToast("Не удалось сохранить категорию.");
        } finally {
          checkbox.disabled = false;
        }
      });
    });
  }

  // ---------------- Details (right) ----------------

  function openSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.add("is-open");
    sheetBackdrop.classList.add("is-active");
    document.body.classList.add("sheet-open");
  }

  function closeSheet() {
    if (!sheet || !sheetBackdrop) return;
    sheet.classList.remove("is-open");
    sheetBackdrop.classList.remove("is-active");
    document.body.classList.remove("sheet-open");
  }

  function renderInfoChips() {
    if (!infoCategoryChips) return;

    const cats = state.selectedProductCategories || [];
    const chips = cats
      .filter((c) => c.code !== "all")
      .map((c) => `<span class="chip">${escapeHtml(c.title)}</span>`)
      .join("");

    // "+" chip — просто открываем edit модалку (там можно выбрать категории)
    infoCategoryChips.innerHTML = `
      ${chips}
      <button type="button" class="chip chip-plus" id="infoChipPlus"><i class="fas fa-plus"></i></button>
    `;

    const plus = $("#infoChipPlus");
    if (plus) plus.addEventListener("click", () => {
      const p = state.products.find((x) => x.id === state.selectedProductId);
      if (p) openProductModal({ mode: "edit", product: p });
    });
  }

  function renderInfoPhotos(photos) {
    const arr = Array.isArray(photos) ? photos : [];
    if (!infoMainPhoto || !infoPhotoPlaceholder || !infoPhotoThumbs) return;

    const infoPhotoPrev = $("#infoPhotoPrev");
    const infoPhotoNext = $("#infoPhotoNext");
    const infoPhotoDots = $("#infoPhotoDots");
    const infoThumbsPrev = $("#infoThumbsPrev");
    const infoThumbsNext = $("#infoThumbsNext");

    infoPhotoThumbs.innerHTML = "";

    if (!arr.length) {
      infoMainPhoto.src = "";
      infoMainPhoto.classList.add("hidden");
      infoPhotoPlaceholder.classList.remove("hidden");
      if (infoPhotoPrev) infoPhotoPrev.classList.add("hidden");
      if (infoPhotoNext) infoPhotoNext.classList.add("hidden");
      if (infoPhotoDots) infoPhotoDots.classList.add("hidden");
      if (infoThumbsPrev) infoThumbsPrev.classList.add("hidden");
      if (infoThumbsNext) infoThumbsNext.classList.add("hidden");
      return;
    }

    infoPhotoPlaceholder.classList.add("hidden");
    infoMainPhoto.classList.remove("hidden");
    infoMainPhoto.src = arr[0];

    // Показываем стрелки если фото больше 1
    const showNav = arr.length > 1;
    if (infoPhotoPrev) infoPhotoPrev.classList.toggle("hidden", !showNav);
    if (infoPhotoNext) infoPhotoNext.classList.toggle("hidden", !showNav);
    if (infoPhotoDots) infoPhotoDots.classList.toggle("hidden", !showNav);
    if (infoThumbsPrev) infoThumbsPrev.classList.toggle("hidden", !showNav);
    if (infoThumbsNext) infoThumbsNext.classList.toggle("hidden", !showNav);

    // Точки-индикаторы
    if (infoPhotoDots && showNav) {
      infoPhotoDots.innerHTML = arr.map((_, idx) => 
        `<span class="photo-dot ${idx === 0 ? "is-active" : ""}" data-dot-idx="${idx}"></span>`
      ).join("");
    }

    // Миниатюры
    infoPhotoThumbs.innerHTML = arr.map((url, idx) => {
      return `<button type="button" class="img-thumb ${idx === 0 ? "is-active" : ""}" data-idx="${idx}">
        <img src="${escapeHtml(url)}" alt="" />
      </button>`;
    }).join("");

    let currentIdx = 0;

    function setActivePhoto(idx) {
      if (idx < 0 || idx >= arr.length) return;
      currentIdx = idx;
      infoMainPhoto.src = arr[idx];
      
      // Обновляем активную миниатюру
      $$(".img-thumb", infoPhotoThumbs).forEach((thumb, i) => {
        thumb.classList.toggle("is-active", i === idx);
      });

      // Обновляем точки
      if (infoPhotoDots) {
        $$(".photo-dot", infoPhotoDots).forEach((dot, i) => {
          dot.classList.toggle("is-active", i === idx);
        });
      }

      // Прокручиваем миниатюры к активной
      const activeThumb = infoPhotoThumbs.querySelector(`[data-idx="${idx}"]`);
      if (activeThumb && infoPhotoThumbs) {
        const containerRect = infoPhotoThumbs.getBoundingClientRect();
        const thumbRect = activeThumb.getBoundingClientRect();
        
        if (thumbRect.left < containerRect.left) {
          infoPhotoThumbs.scrollLeft -= (containerRect.left - thumbRect.left + 10);
        } else if (thumbRect.right > containerRect.right) {
          infoPhotoThumbs.scrollLeft += (thumbRect.right - containerRect.right + 10);
        }
      }
    }

    // Клик на миниатюру
    $$(".img-thumb", infoPhotoThumbs).forEach((b) => {
      b.addEventListener("click", () => {
        const idx = Number(b.dataset.idx);
        if (Number.isFinite(idx)) setActivePhoto(idx);
      });
    });

    // Навигация стрелками на главном фото
    if (infoPhotoPrev) {
      infoPhotoPrev.addEventListener("click", () => {
        setActivePhoto((currentIdx - 1 + arr.length) % arr.length);
      });
    }

    if (infoPhotoNext) {
      infoPhotoNext.addEventListener("click", () => {
        setActivePhoto((currentIdx + 1) % arr.length);
      });
    }

    // Клик на точки
    if (infoPhotoDots) {
      infoPhotoDots.addEventListener("click", (e) => {
        const dot = e.target.closest(".photo-dot[data-dot-idx]");
        if (dot) {
          const idx = Number(dot.dataset.dotIdx);
          if (Number.isFinite(idx)) setActivePhoto(idx);
        }
      });
    }

    // Листание миниатюр стрелками
    if (infoThumbsPrev) {
      infoThumbsPrev.addEventListener("click", () => {
        infoPhotoThumbs.scrollBy({ left: -80, behavior: "smooth" });
      });
    }

    if (infoThumbsNext) {
      infoThumbsNext.addEventListener("click", () => {
        infoPhotoThumbs.scrollBy({ left: 80, behavior: "smooth" });
      });
    }
  }

  function renderProductOptionsAccordion() {
    if (!productOptionsAccordion) return;
    const assignments = state.selectedProductOptionAssignments.filter((a) => a.is_active);
    const productId = Number(state.selectedProductId || 0);
    if (!assignments.length) {
      productOptionsAccordion.innerHTML = `<div class="empty-hint">Опции не назначены...</div>`;
      return;
    }

    productOptionsAccordion.innerHTML = assignments.map((assignment) => {
      const groupId = Number(assignment.group_id);
      const details = getCachedOptionGroupDetails(groupId, { productId });
      const typeLabel = getSelectionLabel(assignment.selection_type);
      const limitsLabel = formatOptionLimits(assignment.min_select, assignment.max_select);
      const itemsHtml = details ? renderOptionItemsSummary(details.items || []) : `<div class="muted">Раскройте, чтобы загрузить пункты.</div>`;
      return `
        <div class="acc-item" data-option-group="${groupId}">
          <button class="stage-item acc-trigger" type="button" data-acc-trigger>
            <span class="stage-meta stage-text">
              <b>${escapeHtml(assignment.title || "")}</b>
              <small>${escapeHtml(typeLabel)} · ${escapeHtml(limitsLabel)}</small>
            </span>
            <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
          </button>
          <div class="acc-panel" data-acc-panel>
            <div class="acc-panel-inner">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;
    }).join("");

    bindAccordionContainer(productOptionsAccordion);

    productOptionsAccordion.querySelectorAll(".acc-item").forEach((item) => {
      const groupId = Number(item.dataset.optionGroup);
      if (!Number.isFinite(groupId)) return;
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      if (!trigger || !panel) return;
      trigger.addEventListener("click", async () => {
        if (state.optionGroupCache.has(groupId)) return;
        const details = await ensureOptionGroupDetails(groupId);
        if (!details) return;
        const inner = panel.querySelector(".acc-panel-inner");
        if (inner) {
          inner.innerHTML = `
            ${renderOptionItemsSummary(details.items || [])}
          `;
        }
        refreshOpenAccordions();
      }, { once: true });
    });

    refreshOpenAccordions();
  }

  async function renderProductIngredientsAccordion(productId) {
    if (!productIngredientsAccordion) return;
    if (!productId) {
      productIngredientsAccordion.innerHTML = `<div class="empty-hint">Состав не задан...</div>`;
      return;
    }
    try {
      const list = await ensureProductIngredientsCached(
        productId,
        state.products.find((p) => Number(p.id) === Number(productId)) || getCachedProductDetails(productId)?.product || null
      );
      if (!list.length) {
        productIngredientsAccordion.innerHTML = `<div class="empty-hint">Состав не задан...</div>`;
        return;
      }

      const pcsUnitId = state.units.find((u) => u.code === "pcs")?.id || null;
      const buildSummary = (ing) => {
        const isVariable = Number(ing.is_variable) === 1;
        const qty = Number(ing.quantity || 0);
        const hasVariable = isVariable && (ing.quantity_min != null || ing.quantity_max != null);
        const rangeLabel = hasVariable
          ? `${ing.quantity_min != null ? formatQuantity(ing.quantity_min) : formatQuantity(qty)} - ${ing.quantity_max != null ? formatQuantity(ing.quantity_max) : "∞"}${ing.quantity_step != null ? `, шаг ${formatQuantity(ing.quantity_step)}` : ""}`
          : `${formatQuantity(qty)}`;
        const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || "";
        const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
        const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
        const catalogPriceBase = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
        const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogPriceBase;
        const fromUnitId = Number(ing.unit_id || 0);
        let qtyInBase = null;
        if (baseUnitId && fromUnitId) {
          if (Number(fromUnitId) === Number(baseUnitId)) {
            qtyInBase = qty;
          } else if (String(baseUnitId) === String(pcsUnitId)) {
            qtyInBase = null;
          } else if (String(fromUnitId) === String(pcsUnitId)) {
            qtyInBase = ing.ingredient_pcs_factor != null ? qty * Number(ing.ingredient_pcs_factor) : null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? qty * factor : null;
          }
        }
        const totalPrice = qtyInBase == null ? null : priceBase * qtyInBase;
        const priceLabel = qtyInBase == null ? "—" : formatMoney(priceBase);
        const totalLabel = totalPrice == null ? "—" : formatMoney(totalPrice);
        return `${rangeLabel} ${unitLabel} × ${priceLabel} = ${totalLabel}`;
      };

      productIngredientsAccordion.innerHTML = list.map((ing) => {
        const ingredientPhoto = ing.ingredient_photos && Array.isArray(ing.ingredient_photos) && ing.ingredient_photos.length > 0 ? ing.ingredient_photos[0] : null;
        return `
          <div class="acc-item">
            <div class="stage-item ingredient-acc-trigger">
              ${ingredientPhoto ? `<div class="ingredient-acc-photo" data-ing-open-product="${ing.ingredient_id}" title="Открыть товар"><img src="${escapeHtml(ingredientPhoto)}" alt="" /></div>` : `<div class="ingredient-acc-photo" data-ing-open-product="${ing.ingredient_id}" title="Открыть товар"></div>`}
              <span class="stage-meta stage-text">
                <b>${escapeHtml(ing.ingredient_name || "")}</b>
                <small>${buildSummary(ing)}</small>
              </span>
            </div>
          </div>
        `;
      }).join("");
      productIngredientsAccordion.querySelectorAll("[data-ing-open-product]").forEach((photo) => {
        photo.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const ingredientId = Number(photo.dataset.ingOpenProduct);
          if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
          const ing = list.find((item) => Number(item.ingredient_id) === ingredientId);
          await openProductById(ingredientId);
          openProductTab({ id: ingredientId, name: ing?.ingredient_name || "Товар" }, { activate: false });
        });
      });
    } catch (e) {
      console.error("Failed to load ingredients for view", e);
      productIngredientsAccordion.innerHTML = `<div class="empty-hint">Ошибка загрузки состава</div>`;
    }
  }

  function showProductDetails(p) {
    if (!p) return;

    // Close any open sub-panels from product edit (composition, option picker, variant picker)
    // so selecting another product always closes them and opens the new product
    if (typeof window._closeIngredientPickerFn === "function") {
      window._closeIngredientPickerFn();
    }
    if (typeof window._closeOptionPickerFn === "function") {
      window._closeOptionPickerFn();
    }
    if (typeof window._closeVariantPickerFn === "function") {
      window._closeVariantPickerFn();
    }

    state.selectedProductId = p.id;
    if (productsList) {
      $$(".order-row", productsList).forEach((x) =>
        x.classList.toggle("is-active", Number(x.dataset.id) === Number(p.id))
      );
    }

    // Save current editing state if switching to another product
    if (currentNavigationState?.type === "product-edit" && currentNavigationState?.product?.id) {
      const currentProductId = currentNavigationState.product.id;
      if (currentProductId !== p.id && editingProducts.has(currentProductId)) {
        // Update existing editing state with current navigation state
        const currentEditingState = editingProducts.get(currentProductId);
        editingProducts.set(currentProductId, {
          navigationState: currentNavigationState,
          draft: currentEditingState.draft,
          draftIngredients: currentEditingState.draftIngredients
        });
      }
    }

    // Check if this product is being edited
    if (editingProducts.has(p.id)) {
      // Restore editing state instead of showing details
      const editingState = editingProducts.get(p.id);
      pushNavigationState(editingState.navigationState);
      showProductFooterEdit();
      return;
    }

    // Ensure tab exists for view mode so tab bar matches content
    openProductTab(p, { activate: false });

    // Clear navigation stack when selecting a new product (not being edited)
    clearNavigationStack();

    state.optionPanel.returnTo = null;
    openProductModal({ mode: "view", product: p, host: productInfo || null });
    
    // Update header buttons to view mode
    if (editProductBtn) {
      editProductBtn.innerHTML = '<i class="fas fa-pen"></i>';
      editProductBtn.title = "Редактировать";
      editProductBtn.setAttribute("aria-label", "Редактировать");
    }
    if (closeProductInfoBtn) {
      closeProductInfoBtn.title = "Закрыть";
      closeProductInfoBtn.setAttribute("aria-label", "Закрыть");
    }

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    hideAllDetailPanels();
    productInfo && productInfo.classList.remove("hidden");
    if (productInfoBody) productInfoBody.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("product");
    
    // Show footer in view mode
    showProductFooterView();

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && productInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(productInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && productInfo && productInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(productInfo);
      }
      closeSheet();
    }
  }

  function renderCategoryPreview(icon) {
    if (!categoryIconImg || !categoryIconPlaceholder) return;
    const v = String(icon || "").trim();
    if (looksLikeUrl(v)) {
      categoryIconImg.src = v;
      categoryIconImg.classList.remove("hidden");
      categoryIconPlaceholder.classList.add("hidden");
      categoryIconPlaceholder.textContent = "Нет изображения";
      return;
    }
    categoryIconImg.src = "";
    categoryIconImg.classList.add("hidden");
    categoryIconPlaceholder.classList.remove("hidden");
    categoryIconPlaceholder.innerHTML = v ? `<i class="${escapeHtml(v)}"></i>` : "Нет изображения";
  }

  function getOrCreateCategoryViewState(categoryId) {
    const id = Number(categoryId || 0);
    if (!(id > 0)) return null;
    const existing = categoryViewStates.get(id);
    if (existing && existing.wrapper instanceof HTMLElement && existing.form instanceof HTMLFormElement) {
      return existing;
    }

    const template = document.querySelector("#tplCategoryEditor");
    if (!template) return null;
    const content = template.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.className = "product-editor-wrapper category-editor-wrapper category-editor-view-wrapper";
    wrapper.appendChild(content);
    const form = wrapper.querySelector("#categoryEditorForm");
    if (!form) return null;

    const viewState = {
      id,
      wrapper,
      form,
      iconPreview: wrapper.querySelector("#ceIconPreview"),
      iconPlaceholder: wrapper.querySelector("#ceIconPlaceholder"),
      iconUploadBtn: wrapper.querySelector("#ceIconUploadBtn"),
      iconDeleteBtn: wrapper.querySelector("#ceIconDeleteBtn"),
      subcategoriesSection: wrapper.querySelector("[data-category-subcategories]"),
      subcategoriesList: wrapper.querySelector("[data-category-subcategory-list]"),
      subcategoryAddBtn: wrapper.querySelector("[data-category-subcategory-add]"),
    };

    // View mode: same layout as edit mode, but controls are inactive.
    $$("input, select, textarea, button", form).forEach((el) => {
      if (el.tagName === "BUTTON") {
        el.disabled = true;
      } else if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "radio" || el.type === "file") {
        el.disabled = true;
      } else {
        el.readOnly = true;
      }
    });

    if (viewState.iconUploadBtn) {
      viewState.iconUploadBtn.classList.remove("hidden");
      viewState.iconUploadBtn.disabled = true;
    }
    if (viewState.iconDeleteBtn) {
      viewState.iconDeleteBtn.classList.remove("hidden");
      viewState.iconDeleteBtn.disabled = true;
    }
    if (viewState.subcategoriesSection) {
      viewState.subcategoriesSection.classList.remove("hidden");
      viewState.subcategoriesSection.classList.add("category-editor-subcategories--view");
    }
    if (viewState.subcategoryAddBtn) {
      viewState.subcategoryAddBtn.classList.add("hidden");
      viewState.subcategoryAddBtn.disabled = true;
    }

    categoryViewStates.set(id, viewState);
    return viewState;
  }

  function renderCategoryViewState(cat) {
    if (!cat || !Number.isFinite(Number(cat.id))) return false;
    const id = Number(cat.id);
    const viewState = getOrCreateCategoryViewState(id);
    if (!viewState) return false;

    const form = viewState.form;
    const titleInput = form.querySelector("#ce_title");
    const codeInput = form.querySelector("#ce_code");
    const iconInput = form.querySelector("#ce_icon");
    const sortInput = form.querySelector("#ce_sort");
    const activeInput = form.querySelector("input[name='is_active']");
    const visibilityInput = form.querySelector("input[name='site_visibility']");
    const cartVisibilityInput = form.querySelector("input[name='cart_visibility']");
    const checkoutVisibilityInput = form.querySelector("input[name='checkout_visibility']");

    if (titleInput) titleInput.value = cat.title || "";
    if (codeInput) codeInput.value = cat.code || "";
    if (iconInput) iconInput.value = cat.icon || "";
    if (sortInput) sortInput.value = cat.sort_order != null ? String(cat.sort_order) : "";
    if (activeInput) activeInput.checked = Boolean(cat.is_active);
    if (visibilityInput) visibilityInput.checked = Boolean(cat.site_visibility);
    if (cartVisibilityInput) cartVisibilityInput.checked = Boolean(cat.cart_visibility);
    if (checkoutVisibilityInput) checkoutVisibilityInput.checked = cat.checkout_visibility !== 0;

    const iconValue = String(cat.icon || "").trim();
    if (viewState.iconPreview && viewState.iconPlaceholder) {
      if (looksLikeUrl(iconValue)) {
        viewState.iconPreview.src = iconValue;
        viewState.iconPreview.classList.remove("hidden");
        viewState.iconPlaceholder.classList.add("hidden");
        viewState.iconPlaceholder.textContent = "No image";
      } else {
        viewState.iconPreview.src = "";
        viewState.iconPreview.classList.add("hidden");
        viewState.iconPlaceholder.classList.remove("hidden");
        viewState.iconPlaceholder.innerHTML = iconValue ? `<i class="${escapeHtml(iconValue)}"></i>` : "No image";
      }
    }

    if (viewState.subcategoriesList) {
      const subcategories = state.categories
        .filter((item) => Number(item.parent_id) === Number(cat.id))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
      viewState.subcategoriesList.innerHTML = subcategories.length
        ? subcategories.map((item) => `
            <div class="category-editor-subcategory-row category-editor-subcategory-row--view">
              <span class="category-editor-subcategory-photo" aria-hidden="true">
                ${looksLikeUrl(item.icon) ? `<img src="${escapeHtml(item.icon)}" alt="" />` : `<i class="${escapeHtml(item.icon || "fas fa-folder")}"></i>`}
              </span>
              <input class="control" type="text" value="${escapeHtml(item.title || "")}" readonly tabindex="-1" />
            </div>
          `).join("")
        : '<div class="category-editor-subcategory-empty">Подкатегории не заданы</div>';
    }

    const navigationState = {
      type: "category-view",
      category: cat,
      content: viewState.wrapper,
      savedTitle: cat.title || "",
      savedSku: "Category",
      tabKey: buildTabKey("category", id),
    };
    currentNavigationState = navigationState;
    showNavigationState(navigationState);
    return true;
  }

  function showCategoryDetails(cat) {
    if (!cat) return;

    // Save current editing state if switching to another category
    if (currentNavigationState?.type === "category-edit" && currentNavigationState?.category?.id) {
      const currentCategoryId = currentNavigationState.category.id;
      if (currentCategoryId !== cat.id && editingCategories.has(currentCategoryId)) {
        // Update existing editing state with current navigation state
        const currentEditingState = editingCategories.get(currentCategoryId);
        editingCategories.set(currentCategoryId, {
          navigationState: currentNavigationState
        });
      }
    }

    // Check if this category is being edited
    if (editingCategories.has(cat.id)) {
      // Restore editing state instead of showing details
      const editingState = editingCategories.get(cat.id);
      pushNavigationState(editingState.navigationState);
      showProductFooterEdit();
      return;
    }

    state.selectedCategoryId = Number(cat.id) || null;
    state.optionPanel.returnTo = null;
    productTitle.textContent = cat.title || "—";
    productSku.textContent = "Категория";
    if (editProductBtn) {
      editProductBtn.classList.remove("hidden");
      editProductBtn.title = "Редактировать категорию";
      editProductBtn.setAttribute("aria-label", "Редактировать категорию");
    }

    // Open tab for category
    openCategoryTab(cat, { activate: false });
    if (renderCategoryViewState(cat)) {
      productEmpty && productEmpty.classList.add("hidden");
      categoryEmpty && categoryEmpty.classList.add("hidden");
      if (productInfoHeader) productInfoHeader.classList.remove("hidden");
      setHeaderMode("product");
      showProductFooterView();
      const isMobileView = window.matchMedia("(max-width: 768px)").matches;
      if (isMobileView && sheetHost && productInfo) {
        sheetHost.innerHTML = "";
        sheetHost.appendChild(productInfo);
        openSheet();
      } else {
        closeSheet();
      }
      return;
    }
    
    // Show footer in view mode
    showProductFooterView();

    if (categoryStatus) categoryStatus.textContent = cat.is_active ? "Активна" : "Выключена";
    if (categoryVisibility) categoryVisibility.textContent = cat.site_visibility ? "Показывается" : "Скрыта";
    if (categoryCartVisibility) categoryCartVisibility.textContent = cat.cart_visibility ? "Показывается" : "Скрыта";
    renderCategoryPreview(cat.icon);

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    hideAllDetailPanels();
    categoryInfo && categoryInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("product");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && categoryInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(categoryInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(categoryInfo);
      }
      closeSheet();
    }
  }

  function getOptionGroupSelectionType() {
    if (optionGroupSelectionInput?.value) return optionGroupSelectionInput.value;
    if ((state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") && state.optionDraft?.group) {
      return state.optionDraft.group.selection_type || "single";
    }
    if (state.optionGroupDetails?.group) {
      return getSelectionUiTypeFromGroup(state.optionGroupDetails.group, state.optionGroupDetails.items || []);
    }
    return "single";
  }

  function isOptionEditable() {
    return state.optionPanel.mode === "edit" || state.optionPanel.mode === "create";
  }

  function getOptionItemsSource() {
    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") return state.optionDraft?.items || [];
    return state.optionGroupDetails?.items || [];
  }

  function getOptionAssignmentsSource() {
    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") return state.optionDraft?.assignments || [];
    return state.optionGroupDetails?.assignments || [];
  }

function getOptionGroupFormValues() {
  const selectionUi = getOptionGroupSelectionType();

  // берём текущее (на случай если свича нет)
  const fallbackActive = state.optionDraft?.group?.is_active ?? state.optionGroupDetails?.group?.is_active ?? 1;
  const fallbackRequired = state.optionDraft?.group?.is_required ?? state.optionGroupDetails?.group?.is_required ?? 1;
  const fallbackAllowVariants = state.optionDraft?.group?.allow_variants ?? state.optionGroupDetails?.group?.allow_variants ?? 0;
  const fallbackOutOfStockAction =
    state.optionDraft?.group?.out_of_stock_action ?? state.optionGroupDetails?.group?.out_of_stock_action ?? 1;

  const activeEl = document.getElementById("optionGroupIsActive");
  const requiredEl = document.getElementById("optionGroupIsRequired");
  const allowVariantsEl = document.getElementById("optionGroupAllowVariants");
  const outOfStockActionEl = document.getElementById("optionGroupOutOfStockAction");

  const isActive =
    activeEl && activeEl.type === "checkbox"
      ? (activeEl.checked ? 1 : 0)
      : (fallbackActive ? 1 : 0);

  // ✅ required только для single
  const isRequired =
    selectionUi === "single"
      ? (
          requiredEl && requiredEl.type === "checkbox"
            ? (requiredEl.checked ? 1 : 0)
            : (fallbackRequired ? 1 : 0)
        )
      : 0;

  const allowVariants =
    allowVariantsEl && allowVariantsEl.type === "checkbox"
      ? (allowVariantsEl.checked ? 1 : 0)
      : (fallbackAllowVariants ? 1 : 0);

  const outOfStockAction =
    outOfStockActionEl && outOfStockActionEl.type === "checkbox"
      ? (outOfStockActionEl.checked ? 1 : 0)
      : (fallbackOutOfStockAction ? 1 : 0);

  return {
    title: String(optionGroupTitleInput?.value || "").trim(),
    selection_type: selectionUi,
    min_select: optionGroupMinInput?.value === "" ? 0 : Number(optionGroupMinInput?.value),
    max_select: optionGroupMaxInput?.value === "" ? null : Number(optionGroupMaxInput?.value),
    is_active: isActive,
    is_required: isRequired,
    allow_variants: allowVariants,
    out_of_stock_action: outOfStockAction,
    sort_order: optionGroupSortInput?.value === "" ? 0 : Number(optionGroupSortInput?.value),
  };
}

  function isOptionGroupDirty() {
    if (state.optionPanel.mode !== "edit") return true;
    if (!state.optionPanel.snapshotData) return true;
    const snapshot = state.optionPanel.snapshotData;
    const current = {
      group: getOptionGroupFormValues(),
      items: getOptionItemsSource(),
      assignments: getOptionAssignmentsSource(),
    };
    const baseline = {
      group: getOptionGroupUiValues(snapshot.group, snapshot.items || []),
      items: snapshot.items || [],
      assignments: snapshot.assignments || [],
    };
    return JSON.stringify(current) !== JSON.stringify(baseline);
  }

  function syncOptionDraftGroupFromForm() {
    if ((state.optionPanel.mode !== "create" && state.optionPanel.mode !== "edit") || !state.optionDraft) return;
    state.optionDraft.group = getOptionGroupFormValues();
  }

  function setOptionGroupFormDisabled(disabled) {
    if (!optionGroupForm) return;
    $$("input, select, textarea", optionGroupForm).forEach((el) => {
      el.disabled = disabled;
    });
  }

function fillOptionGroupForm(group, items = []) {
  if (!group) return;

  if (optionGroupTitleInput) optionGroupTitleInput.value = group.title || "";

  if (optionGroupSelectionInput) {
    const selType = group.selection_type || "single";
    // Поддерживаем как БД-типы (single/multiple), так и UI-типы (single/multiple_group/multiple_item)
    if (selType === "multiple") {
      // БД-тип "multiple" — определяем UI-тип по items
      optionGroupSelectionInput.value = getSelectionUiTypeFromGroup(group, items);
    } else if (selType === "multiple_group" || selType === "multiple_item") {
      // Уже UI-тип
      optionGroupSelectionInput.value = selType;
    } else {
      optionGroupSelectionInput.value = "single";
    }
  }

  if (optionGroupMinInput) optionGroupMinInput.value = group.min_select ?? 0;
  if (optionGroupMaxInput) optionGroupMaxInput.value = group.max_select == null ? "" : String(group.max_select);
  if (optionGroupSortInput) optionGroupSortInput.value = group.sort_order ?? 0;

  // ✅ свич "Активна"
  const activeEl = document.getElementById("optionGroupIsActive");
  if (activeEl && activeEl.type === "checkbox") {
    activeEl.checked = Boolean(group.is_active);
  }

  // ✅ свич "Обязательная" (только single)
  // Проверяем оба формата: БД-тип "single" и UI-тип "single"
  const requiredEl = document.getElementById("optionGroupIsRequired");
  if (requiredEl && requiredEl.type === "checkbox") {
    const isSingle = group.selection_type === "single";
    requiredEl.checked = isSingle ? Boolean(group.is_required ?? 1) : false;
  }

  // ✅ свич "Варианты у пунктов"
  const allowVariantsEl = document.getElementById("optionGroupAllowVariants");
  if (allowVariantsEl && allowVariantsEl.type === "checkbox") {
    allowVariantsEl.checked = Boolean(group.allow_variants ?? 0);
  }

  const outOfStockActionEl = document.getElementById("optionGroupOutOfStockAction");
  if (outOfStockActionEl && outOfStockActionEl.type === "checkbox") {
    outOfStockActionEl.checked = Number(group.out_of_stock_action ?? 1) === 1;
  }
}

function updateOptionGroupSelectionUi() {
  const selectionType = getOptionGroupSelectionType();

  if (optionGroupLimitsRow) {
    optionGroupLimitsRow.classList.toggle("hidden", selectionType !== "multiple_group");
  }

  // ✅ "Обязательная" показываем только при single
  const requiredWrap = document.getElementById("optionGroupIsRequiredWrap");
  if (requiredWrap) {
    requiredWrap.classList.toggle("hidden", selectionType !== "single");
  } else {
    // если у тебя нет wrap-обёртки — хотя бы сам чекбокс скрываем
    const requiredEl = document.getElementById("optionGroupIsRequired");
    if (requiredEl) requiredEl.closest("label")?.classList.toggle("hidden", selectionType !== "single");
  }

  // если переключили на multiple — сбрасываем чекбокс required
  if (selectionType !== "single") {
    const requiredEl = document.getElementById("optionGroupIsRequired");
    if (requiredEl && requiredEl.type === "checkbox") requiredEl.checked = false;
  }
}

  function showToast(message, type = "error") {
    const existing = document.querySelector(".app-toast");
    if (existing) existing.remove();
    const toast = document.createElement("div");
    toast.className = `app-toast ${type === "error" ? "is-error" : ""}`.trim();
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    setTimeout(() => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    }, 2800);
  }

  async function handleOptionListActiveToggle(groupId, nextChecked) {
    if (state.optionPanel.activeToggleBusy) return;
    const group = state.optionGroups.find((g) => Number(g.id) === Number(groupId));
    if (!group) return;
    const prev = Boolean(group.is_active);
    group.is_active = nextChecked ? 1 : 0;
    if (state.optionGroupDetails?.group && Number(state.optionGroupDetails.group.id) === Number(groupId)) {
      state.optionGroupDetails.group.is_active = group.is_active;
      if (state.optionDraft?.group) state.optionDraft.group.is_active = group.is_active;
    }
    renderAllOptionGroupsLists();
    state.optionPanel.activeToggleBusy = true;
    try {
      await apiPatchOptionGroup(groupId, { is_active: nextChecked ? 1 : 0 });
      await loadOptionGroups();
      renderAllOptionGroupsLists();
    } catch (e) {
      group.is_active = prev ? 1 : 0;
      if (state.optionGroupDetails?.group && Number(state.optionGroupDetails.group.id) === Number(groupId)) {
        state.optionGroupDetails.group.is_active = group.is_active;
        if (state.optionDraft?.group) state.optionDraft.group.is_active = group.is_active;
      }
      renderAllOptionGroupsLists();
      showToast("Не удалось обновить статус опции.");
    } finally {
      state.optionPanel.activeToggleBusy = false;
    }
  }

  function renderOptionHeader() {
    if (state.optionPanel.level === "empty") {
      if (productInfoHeader) productInfoHeader.classList.add("hidden");
      return;
    }

    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    const mode = state.optionPanel.mode;
    const level = state.optionPanel.level;
    const isPicker = level === "picker";
    const groupTitle = state.optionGroupDetails?.group?.title || "Новая группа";
    if (productTitle) {
      productTitle.textContent = isPicker
        ? (state.optionPanel.pickerMode === "assignments" ? "Выбор товаров для назначений" : "Выбор товаров для пунктов")
        : groupTitle;
    }
    if (productSku) {
      if (isPicker) {
        productSku.textContent = `Выбрано: ${state.optionPanel.pickerSelection.size}`;
      } else if (mode === "create") {
        productSku.textContent = "Создание группы опций";
      } else {
        const selectionLabel = getSelectionLabel(getOptionGroupSelectionType());
        productSku.textContent = `Тип: ${selectionLabel}`;
      }
    }

    if (optionHeaderBackBtn) {
      optionHeaderBackBtn.classList.toggle("hidden", !isPicker);
    }
    if (optionHeaderDeleteBtn) {
      optionHeaderDeleteBtn.classList.toggle("hidden", mode !== "edit" || isPicker);
    }
    if (optionHeaderPrimaryBtn) {
      const icon = optionHeaderPrimaryBtn.querySelector("i");
      if (isPicker) {
        const count = state.optionPanel.pickerSelection.size;
        const label = count ? `Добавить (${count})` : "Готово";
        optionHeaderPrimaryBtn.title = label;
        optionHeaderPrimaryBtn.setAttribute("aria-label", label);
        if (icon) icon.className = "fas fa-check";
        optionHeaderPrimaryBtn.disabled = false;
      } else if (mode === "view") {
        optionHeaderPrimaryBtn.title = "Редактировать";
        optionHeaderPrimaryBtn.setAttribute("aria-label", "Редактировать");
        if (icon) icon.className = "fas fa-pen";
        optionHeaderPrimaryBtn.disabled = false;
      } else {
        optionHeaderPrimaryBtn.title = "Сохранить";
        optionHeaderPrimaryBtn.setAttribute("aria-label", "Сохранить");
        if (icon) icon.className = "fas fa-check";
        const formValid = optionGroupForm ? optionGroupForm.checkValidity() : true;
        const itemLimitsValid = optionItemsList ? !optionItemsList.querySelector(".is-invalid") : true;
        optionHeaderPrimaryBtn.disabled = !formValid || !itemLimitsValid;
      }
    }

    if (optionHeaderCloseBtn) {
      const label = mode === "view" ? "Закрыть" : "Отмена изменений";
      optionHeaderCloseBtn.title = label;
      optionHeaderCloseBtn.setAttribute("aria-label", label);
    }
  }

  function validateItemQtyBounds(row) {
    const minInput = row.querySelector('input[data-item-field="qty_min"]');
    const maxInput = row.querySelector('input[data-item-field="qty_max"]');
    if (!minInput || !maxInput) return;
    const min = minInput.value === "" ? 0 : Number(minInput.value);
    const max = maxInput.value === "" ? 0 : Number(maxInput.value);
    const invalid = Number.isFinite(min) && Number.isFinite(max) && min > max;
    const message = invalid ? "Минимум не может быть больше максимума." : "";
    [minInput, maxInput].forEach((input) => {
      input.setCustomValidity(message);
      input.classList.toggle("is-invalid", invalid);
    });
  }

  function renderOptionItems(items) {
    if (!optionItemsList) return;
    const editable = isOptionEditable();
    if (optionItemsCount) optionItemsCount.textContent = `(${items.length})`;
    if (!items.length) {
      optionItemsList.innerHTML = `<div class="empty-hint">Пока нет пунктов...</div>`;
      return;
    }

    const selectionType = getOptionGroupSelectionType();
    const showItemLimits = selectionType === "multiple_item";
    const isDraft = state.optionPanel.mode === "create";
    optionItemsList.innerHTML = items.map((item) => {
      const itemKey = item.tempId ?? item.id ?? item.target_product_id;
      const catalogPrice = item.product_price != null ? formatPriceInteger(item.product_price) : "—";
      const overrideValue = isDraft ? item.newPrice : item.price_value;
      const hasOverride = isDraft
        ? overrideValue !== "" && overrideValue != null
        : item.price_mode === "fixed" && item.price_value != null;
      const priceValue = hasOverride ? formatPriceInteger(overrideValue) : "";
      const qtyMin = item.qty_min ?? 1;
      const qtyMax = item.qty_max ?? 1;
      const qtyControls = showItemLimits
        ? `
          <div class="option-item-qty">
            <label class="option-item-qty-field">
              <span class="option-item-qty-label">мин</span>
              <input class="control" type="number" min="1" aria-label="Минимум, шт." data-item-field="qty_min" data-item-id="${itemKey}" value="${qtyMin}" ${editable ? "" : "disabled"} />
            </label>
            <label class="option-item-qty-field">
              <span class="option-item-qty-label">макс</span>
              <input class="control" type="number" min="1" aria-label="Максимум, шт." data-item-field="qty_max" data-item-id="${itemKey}" value="${qtyMax}" ${editable ? "" : "disabled"} />
            </label>
          </div>
        `
        : "";

      return `
        <div class="option-item-row">
          <div class="option-item-title">
            <div class="options-row-title">${escapeHtml(item.product_name || item.name || "")}</div>
          </div>
          ${qtyControls}
          <div class="option-item-price">
            ${!editable
              ? `
                ${hasOverride
                  ? `<span class="option-item-price-value is-muted">${catalogPrice}</span>
                     <span class="option-item-price-value is-accent">${priceValue}</span>`
                  : `<span class="option-item-price-value is-accent">${catalogPrice}</span>`}
              `
              : `
                <span class="option-item-price-value ${hasOverride ? "is-muted" : "is-accent"}">${catalogPrice}</span>
                <input class="control" type="number" step="1" min="0" aria-label="Новая цена" data-item-field="price" data-item-id="${itemKey}" value="${priceValue}" />
              `}
          </div>
          ${editable ? `
            <button class="option-row-remove" type="button" data-item-remove="${itemKey}" title="Удалить" aria-label="Удалить пункт"><i class="fas fa-times"></i></button>
          ` : ""}
        </div>
      `;
    }).join("");

    if (editable && showItemLimits) {
      // ensure min/max are valid on initial render
      optionItemsList.querySelectorAll(".option-item-row").forEach((row) => validateItemQtyBounds(row));
    }

    if (!editable) {
      refreshOpenAccordions();
      return;
    }

    optionItemsList.querySelectorAll("[data-item-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.itemRemove;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          state.optionDraft.items = state.optionDraft.items.filter(
            (x) => String(x.tempId ?? x.id ?? x.target_product_id) !== String(id)
          );
          state.optionPanel.itemsDirty = true;
          renderOptionItems(getOptionItemsSource());
          renderOptionHeader();
        }
      });
    });

    optionItemsList.querySelectorAll("input[data-item-field]").forEach((input) => {
      input.addEventListener("input", () => {
        const field = input.dataset.itemField;
        const id = input.dataset.itemId;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          const item = state.optionDraft.items.find(
            (x) => String(x.tempId ?? x.id ?? x.target_product_id) === String(id)
          );
          if (!item || !field) return;
          if (field === "price") {
            if (state.optionPanel.mode === "create") {
              item.newPrice = input.value === "" ? "" : Number(input.value);
            } else {
              const hasPrice = input.value !== "";
              item.price_mode = hasPrice ? "fixed" : "from_target";
              item.price_value = hasPrice ? Number(input.value) : null;
            }
          } else if (field === "qty_min") {
            item.qty_min = input.value === "" ? 1 : Number(input.value);
          } else if (field === "qty_max") {
            item.qty_max = input.value === "" ? 1 : Number(input.value);
          }
          state.optionPanel.itemsDirty = true;
          if (field === "qty_min" || field === "qty_max") {
            validateItemQtyBounds(input.closest(".option-item-row"));
            renderOptionHeader();
          }
          return;
        }
      });
    });
    refreshOpenAccordions();
  }

  function renderOptionAssignments(assignments) {
    if (!optionAssignmentsList) return;
    const editable = isOptionEditable();
    if (optionAssignmentsCount) optionAssignmentsCount.textContent = `(${assignments.length})`;
    if (!assignments.length) {
      optionAssignmentsList.innerHTML = `<div class="empty-hint">Пока нет назначений...</div>`;
      return;
    }

    optionAssignmentsList.innerHTML = assignments.map((assignment) => {
      const assignmentKey = assignment.tempId ?? assignment.id;
      return `
        <div class="option-assignment-row">
          <div class="option-assignment-title">
            <div class="options-row-title">${escapeHtml(assignment.product_name || assignment.name || "")}</div>
          </div>
          ${editable ? `<button class="option-row-remove" type="button" data-assignment-remove="${assignmentKey}" title="Удалить" aria-label="Удалить назначение"><i class="fas fa-times"></i></button>` : ""}
        </div>
      `;
    }).join("");

    if (!editable) {
      refreshOpenAccordions();
      return;
    }

    optionAssignmentsList.querySelectorAll("[data-assignment-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.assignmentRemove;
        if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
          state.optionDraft.assignments = state.optionDraft.assignments.filter(
            (x) => String(x.tempId ?? x.id ?? x.assign_id) !== String(id)
          );
          state.optionPanel.itemsDirty = true;
          renderOptionAssignments(getOptionAssignmentsSource());
          renderOptionHeader();
        }
      });
    });
    refreshOpenAccordions();
  }

  function renderOptionGroupLevel() {
    if (!optionLevelGroup) return;
    const editable = isOptionEditable();
    optionLevelGroup.classList.remove("hidden");
    if (optionLevelPicker) optionLevelPicker.classList.add("hidden");

    if (state.optionPanel.mode === "create" || state.optionPanel.mode === "edit") {
      fillOptionGroupForm(state.optionDraft.group, state.optionDraft.items || []);
    } else if (state.optionGroupDetails?.group) {
      fillOptionGroupForm(state.optionGroupDetails.group, state.optionGroupDetails.items || []);
    }

    if (state.optionPanel.mode === "view") {
      state.optionPanel.formSnapshot = null;
      state.optionPanel.snapshotMode = null;
      state.optionPanel.snapshotData = null;
      state.optionPanel.itemsDirty = false;
    } else if (state.optionPanel.snapshotMode !== state.optionPanel.mode) {
      state.optionPanel.formSnapshot = getOptionGroupFormValues();
      state.optionPanel.snapshotMode = state.optionPanel.mode;
    }

    setOptionGroupFormDisabled(!editable);
    if (optionItemsAddBtn) optionItemsAddBtn.classList.toggle("hidden", !editable);
    if (optionAssignmentsAddBtn) optionAssignmentsAddBtn.classList.toggle("hidden", !editable);

    updateOptionGroupSelectionUi();
    // fix: re-render items after picker apply; missing call kept list empty.
    renderOptionItems(getOptionItemsSource());
    renderOptionAssignments(getOptionAssignmentsSource());
    renderOptionHeader();

    // Show footer based on mode
    if (state.optionPanel.mode === "view") {
      showProductFooterView();
    } else {
      showProductFooterEdit();
    }
  }

  function renderVariantGroupLevel() {
    if (!variantLevelGroup) return;
    const editable = isVariantEditable();
    variantLevelGroup.classList.remove("hidden");

    if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit") {
      fillVariantGroupForm(state.variantDraft.group, state.variantDraft.tiers || []);
    } else if (state.variantGroupDetails?.group) {
      fillVariantGroupForm(state.variantGroupDetails.group, state.variantGroupDetails.tiers || []);
    }

    if (state.variantPanel.mode === "view") {
      state.variantPanel.formSnapshot = null;
      state.variantPanel.snapshotMode = null;
      state.variantPanel.snapshotData = null;
      state.variantPanel.itemsDirty = false;
    } else if (state.variantPanel.snapshotMode !== state.variantPanel.mode) {
      state.variantPanel.formSnapshot = getVariantGroupFormValues();
      state.variantPanel.snapshotMode = state.variantPanel.mode;
    }

    setVariantGroupFormDisabled(!editable);
    if (variantItemsAddBtn) variantItemsAddBtn.classList.toggle("hidden", !editable);
    if (variantAssignmentsAddBtn) variantAssignmentsAddBtn.classList.toggle("hidden", !editable);

    // Ensure variantLevelGroup is visible
    if (variantLevelGroup) variantLevelGroup.classList.remove("hidden");
    if (optionLevelPicker) optionLevelPicker.classList.add("hidden");
    
    renderVariantItems(getVariantItemsSource());
    renderVariantAssignments(getVariantAssignmentsSource());
    renderVariantHeader();

    // Show footer based on mode
    if (state.variantPanel.mode === "view") {
      showProductFooterView();
    } else {
      showProductFooterEdit();
    }
  }

  function isVariantEditable() {
    return state.variantPanel.mode === "edit" || state.variantPanel.mode === "create";
  }

  function getVariantItemsSource() {
    if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit") {
      return state.variantDraft?.tiers || [];
    }
    return state.variantGroupDetails?.tiers || [];
  }

  function getVariantAssignmentsSource() {
    if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit") {
      return state.variantDraft?.assignments || [];
    }
    return state.variantGroupDetails?.assignments || [];
  }

  function fillVariantGroupForm(group, tiers) {
    if (!variantGroupForm || !group) return;
    if (variantGroupTitleInput) variantGroupTitleInput.value = group.title || "";
    if (variantGroupUnitIdInput) {
      variantGroupUnitIdInput.value = group.unit_id || "";
      // Fill units dropdown if not already filled
      if (variantGroupUnitIdInput.options.length <= 1) {
        const units = state.units || [];
        const options = units.map((u) => `<option value="${u.id}">${escapeHtml(u.title || u.code || "")}</option>`).join("");
        variantGroupUnitIdInput.innerHTML = '<option value="">Не выбрано</option>' + options;
        variantGroupUnitIdInput.value = group.unit_id || "";
      }
    }
    if (variantGroupSortInput) variantGroupSortInput.value = group.sort_order || 0;
    if (variantGroupIsActive) variantGroupIsActive.checked = (group.is_active || 0) === 1;
    
    // Store tiers in draft
    if (!state.variantDraft) state.variantDraft = { group: {}, tiers: [], assignments: [] };
    state.variantDraft.tiers = tiers || [];
    
    // Store values array for rendering - always update from group
    state.variantDraft.group.values = Array.isArray(group.values) ? group.values : [];
    
    // Store default value index
    // Всегда берем свежее значение из group при заполнении формы
    // Это гарантирует, что при повторном редактировании будет использоваться актуальное значение с сервера
    state.variantDraft.group.default_value_index = group.default_value_index != null ? Number(group.default_value_index) : null;
    
    // Синхронизируем скрытый input для совместимости (dropdown скрыт, выбор через звездочки)
    if (variantGroupDefaultValueIndexInput) {
      const defaultIdx = state.variantDraft.group.default_value_index != null 
        ? String(state.variantDraft.group.default_value_index) 
        : "";
      variantGroupDefaultValueIndexInput.value = defaultIdx;
    }
  }
  
  function handleDefaultValueIndexChange() {
    if (!variantGroupDefaultValueIndexInput) return;
    const defaultIdxValue = variantGroupDefaultValueIndexInput.value || "";
    const defaultIdx = defaultIdxValue === "" ? null : Number(defaultIdxValue);
    
    // Update draft
    if (state.variantDraft) {
      state.variantDraft.group.default_value_index = defaultIdx;
    }
    
    // Re-render variant items to update stars
    const tiers = getVariantItemsSource();
    renderVariantItems(tiers);
  }
  
  function updateVariantGroupDefaultValueIndexDropdown() {
    if (!variantGroupDefaultValueIndexInput) return;
    const values = (state.variantDraft?.group?.values || state.variantGroupDetails?.group?.values || []);
    const currentValue = variantGroupDefaultValueIndexInput.value;
    const currentDefaultIdx = state.variantDraft?.group?.default_value_index != null 
      ? Number(state.variantDraft.group.default_value_index) 
      : (state.variantGroupDetails?.group?.default_value_index != null 
        ? Number(state.variantGroupDetails.group.default_value_index) 
        : null);
    
    variantGroupDefaultValueIndexInput.innerHTML = '<option value="">Не выбран</option>' + 
      values.map((val, idx) => `<option value="${idx}">${escapeHtml(String(val) || `Вариант ${idx + 1}`)}</option>`).join("");
    
    // Устанавливаем значение из draft или details, если оно валидно
    if (currentDefaultIdx != null && currentDefaultIdx >= 0 && currentDefaultIdx < values.length) {
      variantGroupDefaultValueIndexInput.value = String(currentDefaultIdx);
    } else if (currentValue && Number(currentValue) >= 0 && Number(currentValue) < values.length) {
      variantGroupDefaultValueIndexInput.value = currentValue;
    } else {
      variantGroupDefaultValueIndexInput.value = "";
    }
  }

  function getVariantGroupFormValues() {
    if (!variantGroupForm) return {};
    // Берем значение из draft, а не из скрытого dropdown
    const defaultIdx = state.variantDraft?.group?.default_value_index != null 
      ? Number(state.variantDraft.group.default_value_index)
      : null;

    return {
      title: variantGroupTitleInput?.value || "",
      unit_id: variantGroupUnitIdInput?.value || null,
      sort_order: Number(variantGroupSortInput?.value || 0),
      is_active: variantGroupIsActive?.checked ? 1 : 0,
      default_value_index: defaultIdx,
    };
  }

  function setVariantGroupFormDisabled(disabled) {
    if (!variantGroupForm) return;
    $$("input, select, textarea", variantGroupForm).forEach((el) => {
      el.disabled = disabled;
    });
    if (variantGroupIsActive) variantGroupIsActive.disabled = disabled;
  }

  // Храним флаг сохранения для предотвращения множественных запросов
  let isSavingDefaultIndex = false;
  
  function renderVariantItems(tiers) {
    if (!variantItemsList) return;
    const values = (state.variantDraft?.group?.values || state.variantGroupDetails?.group?.values || []);
    
    // Get current default value index (from draft or details, not from dropdown)
    let defaultIdx = null;
    defaultIdx = (state.variantDraft?.group?.default_value_index != null) 
      ? Number(state.variantDraft.group.default_value_index)
      : ((state.variantGroupDetails?.group?.default_value_index != null)
        ? Number(state.variantGroupDetails.group.default_value_index)
        : null);
    
    // Синхронизируем скрытый input для совместимости (dropdown скрыт, выбор через звездочки)
    if (variantGroupDefaultValueIndexInput) {
      if (defaultIdx != null && defaultIdx >= 0 && defaultIdx < values.length) {
        variantGroupDefaultValueIndexInput.value = String(defaultIdx);
      } else {
        variantGroupDefaultValueIndexInput.value = "";
      }
    }
    
    const formatSignedDiscount = (storedValue) => {
      const num = Number(storedValue || 0);
      const uiValue = Number.isFinite(num) ? -num : 0;
      if (!uiValue) return "+0";
      return `${uiValue > 0 ? "+" : ""}${uiValue}`;
    };

    variantItemsList.innerHTML = values.map((value, idx) => {
      const tier = tiers.find(t => Number(t.sort_order) === idx) || { discount_type: "percent", discount_percent: 0, discount_value: 0 };
      const discountType = tier.discount_type || "percent";
      const discountValue = discountType === "percent" 
        ? (tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0))
        : (tier.discount_value != null ? tier.discount_value : (tier.discount_percent || 0));
      const displayDiscount = formatSignedDiscount(discountValue);
      
      const isDefault = defaultIdx !== null && idx === defaultIdx;
      const starIcon = isDefault 
        ? '<i class="fas fa-star" style="color: #ff7a00; font-size: 16px;"></i>'
        : '<i class="far fa-star" style="color: #888; font-size: 16px;"></i>';
      
      return `
        <div class="option-item-row variant-item-row" data-variant-item-index="${idx}">
          <div class="option-item-col" style="display: flex; align-items: center; justify-content: center; padding-right: 8px; min-width: 32px;">
            ${isVariantEditable() ? `<button type="button" class="variant-star-btn" data-variant-star="${idx}" style="background: none; border: none; padding: 4px; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="${isDefault ? 'Вариант по умолчанию' : 'Установить как вариант по умолчанию'}" aria-label="${isDefault ? 'Вариант по умолчанию' : 'Установить как вариант по умолчанию'}">${starIcon}</button>` : starIcon}
          </div>
          <div class="option-item-col">
            <input class="control" type="text" data-variant-value="${idx}" value="${escapeHtml(value)}" placeholder="Значение" ${isVariantEditable() ? "" : "disabled"} />
          </div>
          <div class="option-item-col">
            <select class="control" data-variant-discount-type="${idx}" ${isVariantEditable() ? "" : "disabled"}>
              <option value="percent" ${discountType === "percent" ? "selected" : ""}>Процент</option>
              <option value="fixed" ${discountType === "fixed" ? "selected" : ""}>Фикс</option>
            </select>
          </div>
          <div class="option-item-col">
            <input class="control" type="text" inputmode="decimal" data-variant-discount="${idx}" value="${displayDiscount}" placeholder="+0" ${isVariantEditable() ? "" : "disabled"} />
          </div>
          ${isVariantEditable() ? `<button class="option-row-remove" type="button" data-variant-remove="${idx}" title="Удалить" aria-label="Удалить вариант"><i class="fas fa-times"></i></button>` : ""}
        </div>
      `;
    }).join("");
    
    // Bind events
    variantItemsList.querySelectorAll("[data-variant-value]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = Number(input.dataset.variantValue);
        if (!state.variantDraft) state.variantDraft = { group: { values: [] }, tiers: [], assignments: [] };
        if (!state.variantDraft.group.values) state.variantDraft.group.values = [];
        state.variantDraft.group.values[idx] = input.value;
      });
    });
    
    variantItemsList.querySelectorAll("[data-variant-discount-type]").forEach((select) => {
      select.addEventListener("change", () => {
        const idx = Number(select.dataset.variantDiscountType);
        if (!state.variantDraft || !state.variantDraft.tiers) return;
        if (!state.variantDraft.tiers[idx]) {
          state.variantDraft.tiers[idx] = { sort_order: idx, discount_type: "percent", discount_value: 0 };
        }
        state.variantDraft.tiers[idx].discount_type = select.value;
        // Update discount input based on type
        const discountInput = variantItemsList.querySelector(`[data-variant-discount="${idx}"]`);
        if (discountInput && state.variantDraft.tiers[idx]) {
          const discountValue = state.variantDraft.tiers[idx].discount_type === "percent" 
            ? (state.variantDraft.tiers[idx].discount_percent || 0)
            : (state.variantDraft.tiers[idx].discount_value || 0);
          const uiValue = Number.isFinite(Number(discountValue)) ? -Number(discountValue) : 0;
          discountInput.value = uiValue === 0 ? "+0" : `${uiValue > 0 ? "+" : ""}${uiValue}`;
        }
      });
    });
    
    variantItemsList.querySelectorAll("[data-variant-discount]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = Number(input.dataset.variantDiscount);
        if (!state.variantDraft || !state.variantDraft.tiers) return;
        if (!state.variantDraft.tiers[idx]) {
          state.variantDraft.tiers[idx] = { sort_order: idx, discount_type: "percent", discount_value: 0 };
        }
        const discountType = state.variantDraft.tiers[idx].discount_type || "percent";
        const raw = String(input.value || "").trim();
        const hasSign = /^[+-]/.test(raw);
        const normalized = raw.replace(",", ".");
        const parsed = Number(normalized);
        if (!raw || !hasSign || !Number.isFinite(parsed)) {
          input.classList.add("is-invalid");
          return;
        }
        input.classList.remove("is-invalid");
        const storedValue = -parsed;
        if (discountType === "percent") {
          state.variantDraft.tiers[idx].discount_percent = storedValue;
        } else {
          state.variantDraft.tiers[idx].discount_value = storedValue;
        }
      });
    });
    
    // Bind star click events for setting default variant
    // Используем делегирование событий на родительском элементе для предотвращения дублирования обработчиков
    // Сначала удаляем старый обработчик, если он был
    if (variantItemsList._defaultStarHandler) {
      variantItemsList.removeEventListener("click", variantItemsList._defaultStarHandler);
    }
    
    // Создаем новый обработчик с делегированием
    variantItemsList._defaultStarHandler = async (e) => {
      const btn = e.target.closest("[data-variant-star]");
      if (!btn) return;
      
      e.stopPropagation();
      e.preventDefault();

      // Защита от множественных кликов
      if (isSavingDefaultIndex) return;
      
      const variantIdxRaw = btn.dataset.variantStar;
      const variantIdx = Number(variantIdxRaw);
      if (!Number.isFinite(variantIdx)) return;
      
      // Инициализируем draft, если его нет
      if (!state.variantDraft) {
        if (state.variantGroupDetails?.group) {
          state.variantDraft = {
            group: { ...state.variantGroupDetails.group },
            tiers: [...(state.variantGroupDetails.tiers || [])],
            assignments: [...(state.variantGroupDetails.assignments || [])]
          };
        } else {
          return; // Нет данных для работы
        }
      }
      
      // Защита от множественных кликов
      isSavingDefaultIndex = true;
      btn.style.opacity = "0.5";
      btn.style.pointerEvents = "none";
      
      // Убеждаемся, что draft.group существует
      if (!state.variantDraft.group) {
        state.variantDraft.group = {};
      }
      
      // Проверяем валидность индекса
      const values = state.variantDraft.group.values || [];
      if (variantIdx < 0 || variantIdx >= values.length) {
        isSavingDefaultIndex = false;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        showToast("Неверный индекс варианта", "error");
        return;
      }

      // Проверяем, не устанавливаем ли мы то же значение
      const currentDefaultIdx = state.variantDraft.group.default_value_index;
      if (currentDefaultIdx === variantIdx) {
        isSavingDefaultIndex = false;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        return;
      }
      
      // Устанавливаем выбранный вариант как дефолтный
      state.variantDraft.group.default_value_index = variantIdx;

      // Обновляем скрытый input для совместимости
      if (variantGroupDefaultValueIndexInput) {
        variantGroupDefaultValueIndexInput.value = String(variantIdx);
      }
      
      // Автосохранение в БД, если редактируем существующую группу
      let groupId = state.selectedVariantGroupId;
      // Fallback: если groupId не установлен, берем из details
      if (!groupId && state.variantGroupDetails?.group?.id) {
        groupId = Number(state.variantGroupDetails.group.id);
        state.selectedVariantGroupId = groupId; // Сохраняем для будущих кликов
      }
      const mode = state.variantPanel?.mode;
      const isEditMode = (mode === "edit" || mode === "view") && groupId && Number.isFinite(groupId);

      if (isEditMode) {
        try {
          // Используем отдельный endpoint для сохранения default_value_index
          await apiSetVariantGroupDefaultIndex(groupId, variantIdx);

          // Проверяем, что значение действительно сохранилось - перезагружаем данные
          await loadVariantGroupDetails(groupId);

          // Обновляем значение в загруженных деталях группы
          if (state.variantGroupDetails?.group) {
            state.variantGroupDetails.group.default_value_index = variantIdx;
          }
          
          // Также обновляем в списке групп для синхронизации
          const groupInList = state.variantGroups?.find(g => Number(g.id) === groupId);
          if (groupInList) {
            groupInList.default_value_index = variantIdx;
          }
          
          // Обновляем draft для синхронизации
          if (state.variantDraft?.group) {
            state.variantDraft.group.default_value_index = variantIdx;
          }
        } catch (error) {
          showToast("Не удалось сохранить вариант по умолчанию", "error");
          // Откатываем изменения в draft при ошибке
          state.variantDraft.group.default_value_index = currentDefaultIdx;
          // Перерисовываем для восстановления состояния
          renderVariantItems(getVariantItemsSource());
          isSavingDefaultIndex = false;
          btn.style.opacity = "1";
          btn.style.pointerEvents = "auto";
          return;
        }
      } else {
        // В режиме создания новой группы - только помечаем как измененное
        if (state.variantPanel) {
          state.variantPanel.itemsDirty = true;
        }
      }
      
      // Перерисовываем варианты для обновления звездочек
      renderVariantItems(getVariantItemsSource());
      
      // Сбрасываем флаг сохранения
      isSavingDefaultIndex = false;
      btn.style.opacity = "1";
      btn.style.pointerEvents = "auto";
    };
    
    // Добавляем обработчик с делегированием событий
    variantItemsList.addEventListener("click", variantItemsList._defaultStarHandler);
    
    variantItemsList.querySelectorAll("[data-variant-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.variantRemove);
        if (!state.variantDraft || !state.variantDraft.group.values) return;
        
        const currentDefaultIdx = state.variantDraft.group.default_value_index != null 
          ? Number(state.variantDraft.group.default_value_index) 
          : null;
        
        state.variantDraft.group.values.splice(idx, 1);
        state.variantDraft.tiers = state.variantDraft.tiers.filter((t, i) => i !== idx).map((t, i) => ({ ...t, sort_order: i }));
        
        // Если удалили дефолтный вариант, устанавливаем первый оставшийся как дефолтный
        if (currentDefaultIdx === idx && state.variantDraft.group.values.length > 0) {
          state.variantDraft.group.default_value_index = 0;
          if (variantGroupDefaultValueIndexInput) {
            variantGroupDefaultValueIndexInput.value = "0";
          }
        } else if (currentDefaultIdx === idx && state.variantDraft.group.values.length === 0) {
          // Если удалили последний вариант - сбрасываем дефолт
          state.variantDraft.group.default_value_index = null;
          if (variantGroupDefaultValueIndexInput) {
            variantGroupDefaultValueIndexInput.value = "";
          }
        } else if (currentDefaultIdx != null && currentDefaultIdx > idx) {
          // Если удалили вариант перед дефолтным - сдвигаем индекс дефолтного
          state.variantDraft.group.default_value_index = currentDefaultIdx - 1;
          if (variantGroupDefaultValueIndexInput) {
            variantGroupDefaultValueIndexInput.value = String(currentDefaultIdx - 1);
          }
        }
        
        renderVariantItems(getVariantItemsSource());
      });
    });
    refreshOpenAccordions();
  }

  function renderVariantAssignments(assignments) {
    if (!variantAssignmentsList) return;
    const values = (state.variantDraft?.group?.values || state.variantGroupDetails?.group?.values || []);
    const groupDefaultIdx = (state.variantDraft?.group?.default_value_index != null ? state.variantDraft.group.default_value_index : 
                            (state.variantGroupDetails?.group?.default_value_index != null ? state.variantGroupDetails.group.default_value_index : null));
    
    variantAssignmentsList.innerHTML = assignments.map((assignment) => {
      const productName = assignment.product_name || "Товар";
      const assignmentDefaultIdx = assignment.default_value_index != null ? Number(assignment.default_value_index) : null;
      const currentDefaultIdx = assignmentDefaultIdx != null ? assignmentDefaultIdx : groupDefaultIdx;
      return `
        <div class="option-assignment-row" data-variant-assignment-id="${assignment.id}">
          <div class="option-assignment-col">${escapeHtml(productName)}</div>
          ${isVariantEditable() ? `
            <div class="option-assignment-col">
              <select class="control control-sm" data-variant-assignment-default="${assignment.id}" style="min-width: 120px;">
                <option value="" ${currentDefaultIdx == null ? "selected" : ""}>Как у группы</option>
                ${values.map((val, idx) => `<option value="${idx}" ${currentDefaultIdx === idx ? "selected" : ""}>${escapeHtml(String(val))}</option>`).join("")}
              </select>
            </div>
          ` : ""}
          ${isVariantEditable() ? `<button class="btn btn-icon" type="button" data-variant-assignment-remove="${assignment.id}" title="Удалить"><i class="fas fa-times"></i></button>` : ""}
        </div>
      `;
    }).join("");
    
    // Bind events for default value index changes
    if (isVariantEditable()) {
      variantAssignmentsList.querySelectorAll("[data-variant-assignment-default]").forEach((select) => {
        select.addEventListener("change", async () => {
          const assignmentId = Number(select.dataset.variantAssignmentDefault);
          const defaultIdxValue = select.value || "";
          const defaultIdx = defaultIdxValue === "" ? null : Number(defaultIdxValue);
          try {
            await apiPatchVariantAssignment(assignmentId, { default_value_index: defaultIdx });
            // Find assignment to get variant_group_id
            const assignment = state.variantGroupDetails?.assignments?.find(a => Number(a.id) === assignmentId);
            if (assignment) {
              // Update assignment in state
              assignment.default_value_index = defaultIdx;
            }
            // Reload variant group details to get updated assignments
            if (state.selectedVariantGroupId) {
              await loadVariantGroupDetails(state.selectedVariantGroupId);
              renderVariantAssignments(state.variantGroupDetails?.assignments || []);
            }
            // Note: Stars in product variants list will be updated when product is opened/refreshed
            // or when variant accordion is expanded (it reads from draft.productVariants)
          } catch (e) {
            console.error("Failed to update variant assignment default", e);
            showToast("Не удалось обновить вариант по умолчанию");
          }
        });
      });
    }
    
    refreshOpenAccordions();
  }

  function renderVariantHeader() {
    // TODO: Implement variant header with tabs if needed
  }

  function restoreOptionPanelPickerFooter() {
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const cancelBtn = $("#productFooterCancelBtn");
    const saveBtn = $("#productFooterSaveBtn");
    const deleteBtn = $("#productFooterDeleteEditBtn");
    const moreBtn = $("#productFooterMoreEditBtn");
    if (!footer || !footerView || !footerEditMode || !cancelBtn || !saveBtn || !optionPanelPickerSavedFooterState) return;

    if (optionPanelPickerSavedFooterState.footerHidden) {
      footer.classList.add("hidden");
    } else {
      footer.classList.remove("hidden");
    }
    if (optionPanelPickerSavedFooterState.viewHidden) {
      footerView.classList.add("hidden");
    } else {
      footerView.classList.remove("hidden");
    }
    if (optionPanelPickerSavedFooterState.editHidden) {
      footerEditMode.classList.add("hidden");
    } else {
      footerEditMode.classList.remove("hidden");
    }

    if (deleteBtn) {
      if (optionPanelPickerSavedFooterState.deleteBtnHidden) {
        deleteBtn.classList.add("hidden");
      } else {
        deleteBtn.classList.remove("hidden");
      }
    }
    if (moreBtn) {
      if (optionPanelPickerSavedFooterState.moreBtnHidden) {
        moreBtn.classList.add("hidden");
      } else {
        moreBtn.classList.remove("hidden");
      }
    }

    if (optionPanelPickerSavedFooterState.cancelBtnIsFullwidth) {
      cancelBtn.classList.add("is-fullwidth");
    } else {
      cancelBtn.classList.remove("is-fullwidth");
    }
    if (optionPanelPickerSavedFooterState.cancelBtnIsConfirm) {
      cancelBtn.classList.add("is-confirm");
    } else {
      cancelBtn.classList.remove("is-confirm");
    }
    if (cancelBtn.dataset.pickerOriginalHtml) {
      cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
      delete cancelBtn.dataset.pickerOriginalHtml;
    }

    if (optionPanelPickerSavedHandlers) {
      cancelBtn.onclick = optionPanelPickerSavedHandlers.cancel;
      saveBtn.onclick = optionPanelPickerSavedHandlers.save;
    }

    optionPanelPickerSavedFooterState = null;
    optionPanelPickerSavedHandlers = null;
  }

  function restoreVariantPickerFooter() {
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const cancelBtn = $("#productFooterCancelBtn");
    const saveBtn = $("#productFooterSaveBtn");
    const deleteBtn = $("#productFooterDeleteEditBtn");
    const moreBtn = $("#productFooterMoreEditBtn");
    if (!footer || !footerView || !footerEditMode || !cancelBtn || !saveBtn || !variantPickerSavedFooterState) return;

    if (variantPickerSavedFooterState.footerHidden) {
      footer.classList.add("hidden");
    } else {
      footer.classList.remove("hidden");
    }
    if (variantPickerSavedFooterState.viewHidden) {
      footerView.classList.add("hidden");
    } else {
      footerView.classList.remove("hidden");
    }
    if (variantPickerSavedFooterState.editHidden) {
      footerEditMode.classList.add("hidden");
    } else {
      footerEditMode.classList.remove("hidden");
    }

    if (deleteBtn) {
      if (variantPickerSavedFooterState.deleteBtnHidden) {
        deleteBtn.classList.add("hidden");
      } else {
        deleteBtn.classList.remove("hidden");
      }
    }
    if (moreBtn) {
      if (variantPickerSavedFooterState.moreBtnHidden) {
        moreBtn.classList.add("hidden");
      } else {
        moreBtn.classList.remove("hidden");
      }
    }

    if (variantPickerSavedFooterState.cancelBtnIsFullwidth) {
      cancelBtn.classList.add("is-fullwidth");
    } else {
      cancelBtn.classList.remove("is-fullwidth");
    }
    if (variantPickerSavedFooterState.cancelBtnIsConfirm) {
      cancelBtn.classList.add("is-confirm");
    } else {
      cancelBtn.classList.remove("is-confirm");
    }
    if (cancelBtn.dataset.pickerOriginalHtml) {
      cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
      delete cancelBtn.dataset.pickerOriginalHtml;
    }

    if (variantPickerSavedHandlers) {
      cancelBtn.onclick = variantPickerSavedHandlers.cancel;
      saveBtn.onclick = variantPickerSavedHandlers.save;
    }

    variantPickerSavedFooterState = null;
    variantPickerSavedHandlers = null;
  }

  async function openOptionGroupFromProduct(groupId, { closeModal } = {}) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return;
    state.selectedOptionGroupId = id;
    await loadOptionGroupDetails(id);
    const fromEdit = currentNavigationState?.type === "product-edit";
    state.optionPanel.returnTo = fromEdit
      ? { type: "product-edit" }
      : (state.selectedProductId ? { type: "product", id: state.selectedProductId } : null);
    if (fromEdit) {
      pushNavigationState({ type: "option-edit" });
    } else {
      showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
    }
    if (closeModal && window.AppModal) {
      window.AppModal.close("navigate");
    }
  }

  function renderOptionPickerTabs() {
    if (!optionPickerTabs) return;
    const lastScroll = Number.isFinite(state.optionPanel.pickerTabsScrollLeft)
      ? state.optionPanel.pickerTabsScrollLeft
      : optionPickerTabs.scrollLeft;
    optionPickerTabs.innerHTML = state.catalogCategories.map((cat) => {
      const active = Number(cat.id) === Number(state.optionPanel.pickerCategoryId);
      return `
        <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
          ${escapeHtml(cat.title || "")}
        </button>
      `;
    }).join("");

    bindHorizontalScroll(optionPickerTabs);
    requestAnimationFrame(() => {
      optionPickerTabs.scrollLeft = lastScroll;
    });

    optionPickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.optionPanel.pickerCategoryId = Number(btn.dataset.catId);
        renderOptionPickerTabs();
        await refreshOptionPickerProducts();
      });
    });
  }

  function renderOptionPickerList() {
    if (!optionPickerList) return;
    optionPickerList.innerHTML = state.optionPanel.pickerProducts.map((product) => {
      const checked = state.optionPanel.pickerSelection.has(product.id);
      return `
        <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${product.id}">
          <div class="option-picker-title">${escapeHtml(product.name || "")}</div>
          <div class="option-picker-price">Цена: ${product.price != null ? formatPriceInteger(product.price) : "—"}</div>
          <input class="option-picker-checkbox" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
        </div>
      `;
    }).join("");

    optionPickerList.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.productId);
        if (!Number.isFinite(id)) return;
        if (state.optionPanel.pickerSelection.has(id)) {
          state.optionPanel.pickerSelection.delete(id);
        } else {
          state.optionPanel.pickerSelection.add(id);
        }
        renderOptionPickerList();
        renderOptionHeader();
      });
    });

    updateOptionPickerSelectAllState();
  }

  function updateOptionPickerSelectAllState() {
    if (!optionPickerSelectAll || !optionPickerSelectAllLabel) return;
    const products = state.optionPanel.pickerProducts || [];
    const ids = products.map((product) => product.id);
    const selectedCount = ids.filter((id) => state.optionPanel.pickerSelection.has(id)).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const noneSelected = selectedCount === 0;
    optionPickerSelectAll.checked = allSelected;
    optionPickerSelectAll.indeterminate = !allSelected && !noneSelected;
    optionPickerSelectAll.disabled = ids.length === 0;
    const label = allSelected ? "Сбросить все" : "Выделить все";
    optionPickerSelectAllLabel.textContent = label;
    optionPickerSelectAll.setAttribute("aria-label", label);
  }

  async function refreshOptionPickerProducts() {
    const res = await apiGetCatalogProducts({
      categoryId: state.optionPanel.pickerCategoryId,
      query: state.optionPanel.pickerQuery,
    });
    state.optionPanel.pickerProducts = Array.isArray(res.data) ? res.data : [];
    renderOptionPickerList();
  }

  async function openOptionPicker(mode) {
    syncOptionDraftGroupFromForm();
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }
    state.optionPanel.level = "picker";
    state.optionPanel.pickerMode = mode;
    const existingSelection = new Set();
    if (mode === "items") {
      getOptionItemsSource().forEach((item) => {
        const id = Number(item.target_product_id ?? item.id);
        if (Number.isFinite(id)) existingSelection.add(id);
      });
    } else {
      getOptionAssignmentsSource().forEach((assignment) => {
        const id = Number(assignment.assign_id ?? assignment.id);
        if (Number.isFinite(id)) existingSelection.add(id);
      });
    }
    // keep selection on reopen
    state.optionPanel.pickerSelection = existingSelection;
    state.optionPanel.pickerInitialSelection = new Set(existingSelection);
    state.optionPanel.pickerCategoryId = state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null;
    state.optionPanel.pickerQuery = "";
    if (optionPickerSearch) optionPickerSearch.value = "";
    await refreshOptionPickerProducts();
    renderOptionPickerLevel();
  }

  function isSameSelection(a, b) {
    if (a.size !== b.size) return false;
    for (const id of a) {
      if (!b.has(id)) return false;
    }
    return true;
  }

  async function applyOptionPickerSelection() {
    // Clear picker footer data attributes before closing
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
    if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
    delete window._closeOptionPickerFn;
    delete window._saveOptionPickerFn;
    restoreOptionPanelPickerFooter();
    
    if (isSameSelection(state.optionPanel.pickerSelection, state.optionPanel.pickerInitialSelection)) {
      // close picker silently if nothing changed
      state.optionPanel.level = "group";
      renderOptionGroupLevel();
      return;
    }
    const selectedIds = Array.from(state.optionPanel.pickerSelection);
    if (!selectedIds.length) {
      state.optionPanel.level = "group";
      renderOptionGroupLevel();
      return;
    }

    if (state.optionPanel.pickerMode === "items") {
      if (state.optionPanel.mode === "create") {
        const existing = new Set(state.optionDraft.items.map((x) => x.id));
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.items.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            id: product.id,
            name: product.name,
            product_name: product.name,
            product_price: product.price,
            newPrice: "",
            qty_min: 1,
            qty_max: 1,
          });
        });
        state.optionPanel.itemsDirty = true;
      } else if (state.optionPanel.mode === "edit") {
        const existing = new Set(
          state.optionDraft.items.map((x) => Number(x.target_product_id ?? x.id)).filter(Number.isFinite)
        );
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.items.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            target_product_id: product.id,
            name: product.name,
            product_name: product.name,
            product_price: product.price,
            price_mode: "from_target",
            price_value: null,
            qty_min: 1,
            qty_max: 1,
            isNew: true,
          });
        });
        state.optionPanel.itemsDirty = true;
      }
    } else {
      if (state.optionPanel.mode === "create") {
        const existing = new Set(state.optionDraft.assignments.map((x) => x.id));
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.assignments.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            id: product.id,
            name: product.name,
            product_name: product.name,
            priority: 0,
            sort_order: 0,
          });
        });
        state.optionPanel.itemsDirty = true;
      } else if (state.optionPanel.mode === "edit") {
        const existing = new Set(
          state.optionDraft.assignments.map((x) => Number(x.assign_id ?? x.id)).filter(Number.isFinite)
        );
        state.optionPanel.pickerProducts.forEach((product) => {
          if (!state.optionPanel.pickerSelection.has(product.id)) return;
          if (existing.has(product.id)) return;
          state.optionDraft.assignments.push({
            tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            assign_id: product.id,
            name: product.name,
            product_name: product.name,
            priority: 0,
            sort_order: 0,
            isNew: true,
          });
        });
        state.optionPanel.itemsDirty = true;
      }
    }

    state.optionPanel.level = "group";
    renderOptionGroupLevel();
  }

  function renderOptionPickerLevel() {
    if (!optionLevelPicker) return;
    if (optionLevelGroup) optionLevelGroup.classList.add("hidden");
    optionLevelPicker.classList.remove("hidden");
    renderOptionPickerTabs();
    renderOptionPickerList();
    renderOptionHeader();
    showProductFooterEdit();
    
    // Switch footer to picker mode
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn) {
      if (!optionPanelPickerSavedFooterState) {
        optionPanelPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: footerCancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: footerCancelBtn.classList.contains("is-fullwidth"),
        };
        optionPanelPickerSavedHandlers = {
          cancel: footerCancelBtn.onclick,
          save: footerSaveBtn.onclick,
        };
      }

      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");

      footerCancelBtn.classList.remove("is-confirm");
      footerCancelBtn.classList.add("is-fullwidth");
      if (!footerCancelBtn.dataset.pickerOriginalHtml) {
        footerCancelBtn.dataset.pickerOriginalHtml = footerCancelBtn.innerHTML;
      }
      footerCancelBtn.textContent = "Отменить";
      footerCancelBtn.title = "Отменить";
      footerCancelBtn.setAttribute("aria-label", "Отменить");
    }
    if (footerCancelBtn) {
      footerCancelBtn.dataset.pickerType = "option";
    }
    if (footerSaveBtn) {
      footerSaveBtn.dataset.pickerType = "option";
    }
    window._closeOptionPickerFn = () => {
      // Clear picker footer data attributes
      if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
      if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
      delete window._closeOptionPickerFn;
      delete window._saveOptionPickerFn;
      restoreOptionPanelPickerFooter();
      
      state.optionPanel.level = "group";
      renderOptionGroupLevel();
    };
    window._saveOptionPickerFn = async () => {
      await applyOptionPickerSelection();
    };
  }

  function showOptionGroupDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.optionPanel.level = "group";
    state.optionPanel.mode = mode || "view";
    state.optionPanel.itemsDirty = false;
    state.optionPanel.pickerSelection = new Set();
    if (state.optionPanel.mode === "view") {
      state.optionDraft = null;
      state.optionPanel.snapshotData = null;
    }
    if (productTitle) productTitle.textContent = details?.group?.title || "—";
    if (productSku) productSku.textContent = "Опции товара";
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    if (editProductBtn) editProductBtn.classList.add("hidden");
    if (currentNavigationState?.type === "product-edit" && productInfoBody && currentNavigationState.content) {
      if (productInfoBody.contains(currentNavigationState.content)) {
        productInfoBody.removeChild(currentNavigationState.content);
      }
    }
    
    hideProductFooter();

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    hideAllDetailPanels();
    optionGroupInfo && optionGroupInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && optionGroupInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(optionGroupInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && optionGroupInfo && optionGroupInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(optionGroupInfo);
      }
      closeSheet();
    }

    renderOptionGroupLevel();
  }

  function showVariantGroupDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.variantPanel.level = "group";
    state.variantPanel.mode = mode || "view";
    state.variantPanel.itemsDirty = false;
    state.variantPanel.pickerSelection = new Set();
    if (state.variantPanel.mode === "view") {
      // Инициализируем draft из details вместо null, чтобы можно было сохранять default_value_index
      if (details?.group) {
        state.variantDraft = {
          group: { ...details.group },
          tiers: [...(details.tiers || [])],
          assignments: [...(details.assignments || [])]
        };
      } else {
        state.variantDraft = null;
      }
      state.variantPanel.snapshotData = null;
    }
    if (productTitle) productTitle.textContent = details?.group?.title || "—";
    if (productSku) productSku.textContent = "Варианты товара";
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    if (editProductBtn) editProductBtn.classList.add("hidden");
    if (currentNavigationState?.type === "product-edit" && productInfoBody && currentNavigationState.content) {
      if (productInfoBody.contains(currentNavigationState.content)) {
        productInfoBody.removeChild(currentNavigationState.content);
      }
    }
    
    hideProductFooter();

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    hideAllDetailPanels();
    variantGroupInfo && variantGroupInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && variantGroupInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(variantGroupInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && variantGroupInfo && variantGroupInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(variantGroupInfo);
      }
      closeSheet();
    }

    renderVariantGroupLevel();
  }

  function showComboBlockDetails(details, { mode }) {
    if (!details && mode !== "create") return;
    state.comboPanel.level = "group";
    state.comboPanel.mode = mode || "view";
    if (comboBlockLevelGroup) comboBlockLevelGroup.classList.remove("hidden");
    if (comboBlockLevelPicker) comboBlockLevelPicker.classList.add("hidden");
    const block = details?.block || {};
    const products = details?.products ?? [];
    state.comboBlockProducts = Array.isArray(products) ? products : [];
    if (productTitle) productTitle.textContent = block.title || "Новый блок комбо";
    if (productSku) productSku.textContent = "Блоки комбо";
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");
    setHeaderMode("option");
    if (editProductBtn) editProductBtn.classList.add("hidden");
    hideProductFooter();

    productEmpty && productEmpty.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
    optionEmpty && optionEmpty.classList.add("hidden");
    comboEmpty && comboEmpty.classList.add("hidden");
    hideAllDetailPanels();
    comboInfo && comboInfo.classList.remove("hidden");
    if (productInfoHeader) productInfoHeader.classList.remove("hidden");

    if (comboBlockTitleInput) comboBlockTitleInput.value = block.title ?? "";
    if (comboBlockSortOrderInput) comboBlockSortOrderInput.value = block.sort_order ?? 0;
    if (comboBlockMinSelectInput) comboBlockMinSelectInput.value = block.min_select ?? 1;
    if (comboBlockMaxSelectInput) comboBlockMaxSelectInput.value = block.max_select ?? 1;

    const isViewMode = (mode || state.comboPanel.mode) === "view";
    if (comboBlockTitleInput) comboBlockTitleInput.readOnly = isViewMode;
    if (comboBlockSortOrderInput) comboBlockSortOrderInput.readOnly = isViewMode;
    if (comboBlockMinSelectInput) comboBlockMinSelectInput.readOnly = isViewMode;
    if (comboBlockMaxSelectInput) comboBlockMaxSelectInput.readOnly = isViewMode;
    const comboBlockProductsAddBtn = document.getElementById("comboBlockProductsAddBtn");
    if (comboBlockProductsAddBtn) comboBlockProductsAddBtn.classList.toggle("hidden", isViewMode);

    renderComboBlockProductsList();
    // Всегда разворачиваем аккордеон "Товары в блоке" при открытии блока
    openComboBlockProductsAccordion();

    if (mode === "view") showProductFooterView();
    else showProductFooterEdit();

    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile && sheetHost && comboInfo) {
      sheetHost.innerHTML = "";
      sheetHost.appendChild(comboInfo);
      openSheet();
    } else {
      if (detailsDesktopHost && comboInfo && comboInfo.parentElement !== detailsDesktopHost) {
        detailsDesktopHost.appendChild(comboInfo);
      }
      closeSheet();
    }
  }

  function renderComboBlockProductsList() {
    if (!comboBlockProductsList) return;
    const items = state.comboBlockProducts || [];
    if (items.length === 0) {
      comboBlockProductsList.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Товаров пока нет. Нажмите «Добавить товар».</div>";
      return;
    }
const isViewMode = state.comboPanel.mode === "view";
    comboBlockProductsList.classList.toggle("is-view-mode", isViewMode);
    comboBlockProductsList.innerHTML = items.map((item, idx) => {
      const name = item.name || `Товар #${item.product_id}`;
      const defaultBadge = item.is_default ? " <span class=\"muted\">(по умолчанию)</span>" : "";
      const photoUrl = item.photo || "";
      const thumb = photoUrl ? `<img class="combo-block-product-thumb" src="${escapeHtml(photoUrl)}" alt="" />` : "<span class=\"combo-block-product-thumb combo-block-product-thumb-placeholder\"><i class=\"fas fa-image\"></i></span>";
      const priceNum = Number(item.price);
      const priceStr = Number.isFinite(priceNum) ? formatPriceInteger(priceNum) + " Р" : "";
      const starBtn = isViewMode ? "" : `<button class="btn btn-icon btn-ghost combo-block-product-star" type="button" data-set-default title="${item.is_default ? "По умолчанию" : "Сделать по умолчанию"}"><i class="${item.is_default ? "fas" : "far"} fa-star"></i></button>`;
      const removeBtn = isViewMode ? "" : `<button class="option-row-remove" type="button" data-remove title="Удалить" aria-label="Удалить"><i class="fas fa-times"></i></button>`;
      return `
        <div class="combo-block-product-row-wrapper" data-idx="${idx}">
          <div class="option-item-row combo-block-product-row" data-product-id="${item.product_id}" data-idx="${idx}">
            <button class="combo-block-product-chevron" type="button" data-combo-chevron aria-expanded="false" title="Подробнее"><i class="fas fa-chevron-down"></i></button>
            ${thumb}
            <span class="option-item-title">${escapeHtml(name)}${defaultBadge}</span>
            <span class="combo-block-product-price" data-product-id="${item.product_id}">${priceStr ? escapeHtml(priceStr) : ""}</span>
            ${starBtn}
            ${removeBtn}
          </div>
          <div class="combo-block-product-details" hidden data-product-id="${item.product_id}">
            <div class="combo-block-product-details-inner"></div>
          </div>
        </div>
      `;
    }).join("");
    comboBlockProductsList.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".combo-block-product-row-wrapper");
        const idx = parseInt(row?.dataset?.idx, 10);
        if (!Number.isFinite(idx)) return;
        state.comboBlockProducts.splice(idx, 1);
        renderComboBlockProductsList();
      });
    });
    comboBlockProductsList.querySelectorAll("[data-set-default]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const row = btn.closest(".combo-block-product-row-wrapper");
        const idx = parseInt(row?.dataset?.idx, 10);
        if (!Number.isFinite(idx)) return;
        state.comboBlockProducts.forEach((p, i) => { p.is_default = i === idx ? 1 : 0; });
        renderComboBlockProductsList();
      });
    });
    comboBlockProductsList.querySelectorAll("[data-combo-chevron]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest(".combo-block-product-row-wrapper");
        const details = wrapper?.querySelector(".combo-block-product-details");
        const wasExpanded = details?.getAttribute("hidden") == null;
        if (details) details.hidden = wasExpanded;
        if (btn) {
          btn.setAttribute("aria-expanded", wasExpanded ? "false" : "true");
          const icon = btn.querySelector("i");
          if (icon) icon.className = wasExpanded ? "fas fa-chevron-down" : "fas fa-chevron-up";
        }
        if (!wasExpanded) {
          await loadComboBlockProductDetails(wrapper, { scrollIntoView: true });
        }
      });
    });

    // Предзагружаем состав и пересчёт цены для товаров с настраиваемым составом,
    // чтобы сразу показывать корректную цену без раскрытия.
    comboBlockProductsList.querySelectorAll(".combo-block-product-row-wrapper").forEach((wrapper) => {
      const idx = parseInt(wrapper.dataset.idx ?? "-1", 10);
      if (!Number.isFinite(idx) || idx < 0) return;
      const item = (state.comboBlockProducts || [])[idx];
      if (item && item.has_changeable_composition) {
        loadComboBlockProductDetails(wrapper, { scrollIntoView: false });
      }
    });
  }

  async function loadComboBlockProductDetails(wrapper, { scrollIntoView = false } = {}) {
    if (!wrapper) return;
    const details = wrapper.querySelector(".combo-block-product-details");
    const inner = details?.querySelector(".combo-block-product-details-inner");
    const productId = details?.dataset?.productId ? Number(details.dataset.productId) : null;
    if (!details || !inner || !Number.isFinite(productId)) return;
    if (!inner.dataset.loaded) {
      inner.dataset.loaded = "1";
      inner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Загрузка…</div>";
      try {
        if (!state.unitConversions || state.unitConversions.length === 0) {
          const convRes = await apiGetUnitConversions();
          state.unitConversions = Array.isArray(convRes?.data) ? convRes.data : [];
        }
        const [productRes, variantsRes, ingredientsRes] = await Promise.all([
          apiGetProduct(productId),
          apiGetProductVariants(productId),
          apiGetProductIngredients(productId),
        ]);
        const product = productRes?.data || null;
        const variants = (variantsRes?.data && Array.isArray(variantsRes.data)) ? variantsRes.data : [];
        const ingredients = (ingredientsRes?.data && Array.isArray(ingredientsRes.data)) ? ingredientsRes.data : [];
        inner.innerHTML = buildComboBlockProductDetailsHtml(product, variants, ingredients);
        attachComboBlockProductDetailsHandlers(inner, wrapper, productId, product, variants, ingredients);
      } catch (err) {
        inner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Ошибка загрузки</div>";
      }
    }
    if (scrollIntoView && details) {
      requestAnimationFrame(() => {
        details.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  function parseVariantValueNumber(value) {
    const s = String(value ?? "").replace(",", ".");
    const match = s.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function getComboBlockVariantUnitPrice(product, variants, selectedIndex) {
    if (!product) return Number(product?.price || 0);
    const basePrice = Number(product.price || 0);
    if (!Array.isArray(variants) || !variants.length) return basePrice;
    const idx = Number(selectedIndex);
    if (!Number.isFinite(idx) || idx < 0) return basePrice;
    const group = variants[0];
    const baseUnitId = Number(product.base_unit_id || product.unit_id || group.unit_id || 0);
    const baseQty = Number(product.base_qty || 1) || 1;
    const variantUnitId = Number(group.unit_id || 0);
    if (!Number.isFinite(baseUnitId) || !Number.isFinite(variantUnitId)) return basePrice;
    const value = Array.isArray(group.values) ? group.values[idx] : null;
    const numericValue = parseVariantValueNumber(value);
    if (!Number.isFinite(numericValue)) return basePrice;
    const factor = getConversionFactor(variantUnitId, baseUnitId);
    if (factor == null) return basePrice;
    const qtyInBase = numericValue * Number(factor || 0);
    if (!Number.isFinite(qtyInBase) || qtyInBase <= 0) return basePrice;
    let unitPrice = basePrice * (qtyInBase / baseQty);
    const tiers = Array.isArray(group.discount_tiers) ? group.discount_tiers : [];
    const tier = tiers.find((t) => Number(t.sort_order) === idx);
    const discountPercent = Number(tier?.discount_percent || 0) || 0;
    if (discountPercent !== 0) unitPrice = unitPrice * (1 - discountPercent / 100);
    return unitPrice;
  }

  function getComboBlockQtyInBase(ing, qty) {
    const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
    const fromUnitId = Number(ing.unit_id || 0);
    if (!baseUnitId || !fromUnitId) return null;
    if (Number(fromUnitId) === Number(baseUnitId)) return Number(qty || 0);
    const factor = getConversionFactor(fromUnitId, baseUnitId);
    return factor != null ? Number(qty || 0) * factor : null;
  }

  function getComboBlockIngredientPriceDiff(ingredients, ingredientState) {
    let currentTotal = 0;
    let baseTotal = 0;
    const variableIngredients = ingredients.filter((i) => Number(i.is_variable) === 1);
    variableIngredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const currentQty = ingredientState.get(ingId) ?? Number(ing.quantity ?? 1);
      const baseQty = Number(ing.quantity ?? 1);
      const ingredientBaseQty = ing.ingredient_base_qty != null && Number(ing.ingredient_base_qty) > 0 ? Number(ing.ingredient_base_qty) : 1;
      const ingredientPrice = Number(ing.ingredient_price || 0);
      const catalogBasePrice = ingredientBaseQty > 0 && ingredientPrice > 0 ? ingredientPrice / ingredientBaseQty : (ingredientPrice > 0 ? ingredientPrice : 0);
      const pricePerUnit = ing.price_override != null && Number(ing.price_override) >= 0 ? Number(ing.price_override) : catalogBasePrice;
      const currentQtyInBase = getComboBlockQtyInBase(ing, currentQty);
      const baseQtyInBase = getComboBlockQtyInBase(ing, baseQty);
      if (currentQtyInBase != null && Number.isFinite(pricePerUnit)) currentTotal += pricePerUnit * currentQtyInBase;
      if (baseQtyInBase != null && Number.isFinite(pricePerUnit)) baseTotal += pricePerUnit * baseQtyInBase;
    });
    return currentTotal - baseTotal;
  }

  // Расчёт полной цены товара по текущему состоянию состава (как calcTotalPriceFromIngredientsGlobal),
  // но на основе массива ingredients и локального состояния quantity (ingredientState).
  function getComboBlockIngredientsTotalPrice(product, ingredients, ingredientState) {
    if (!Array.isArray(ingredients) || ingredients.length === 0) return null;
    let total = 0;
    let hasValidPrice = false;
    const pcsUnitId = state.units.find((u) => u.code === "pcs")?.id || null;
    ingredients.forEach((ing) => {
      const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
      const catalogBasePrice = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
      const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogBasePrice;

      const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
      const fromUnitId = Number(ing.unit_id || 0);
      let qty = ingredientState?.get(Number(ing.ingredient_id));
      if (qty == null) qty = Number(ing.quantity || 0);
      let qtyInBase = null;

      if (!baseUnitId || !fromUnitId) {
        qtyInBase = null;
      } else if (Number(fromUnitId) === Number(baseUnitId)) {
        qtyInBase = qty;
      } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
        if (Number(baseUnitId) === Number(pcsUnitId)) {
          qtyInBase = qty;
        } else if (ing.ingredient_pcs_factor != null) {
          qtyInBase = qty * Number(ing.ingredient_pcs_factor);
        } else {
          qtyInBase = null;
        }
      } else if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
        qtyInBase = null;
      } else {
        const factor = getConversionFactor(fromUnitId, baseUnitId);
        qtyInBase = factor != null ? qty * factor : null;
      }

      if (qtyInBase != null) {
        total += priceBase * qtyInBase;
        hasValidPrice = true;
      }
    });
    if (!hasValidPrice || total === 0) return null;
    // Скругляем как в calcTotalsFromComposition / recalcPrice
    return Math.round(total);
  }

  function buildComboBlockProductDetailsHtml(product, variants, ingredients) {
    const parts = [];
    const hasLetters = (v) => /[a-zа-я]/i.test(String(v || ""));
    const formatVariantValue = (val, unitLabel) => {
      const valueText = String(val ?? "").trim();
      if (!valueText) return "";
      if (!unitLabel || hasLetters(valueText)) return escapeHtml(valueText);
      return escapeHtml(valueText + " " + unitLabel);
    };
    const defaultVariantIndex = (variants[0] && (variants[0].default_value_index != null || variants[0].assignment_default_value_index != null))
      ? (Number(variants[0].assignment_default_value_index ?? variants[0].default_value_index) ?? 0)
      : 0;
    if (variants.length > 0) {
      variants.forEach((vg, gIdx) => {
        const unitLabel = (vg.unit_short_title || vg.unit_code || "").trim();
        const title = (vg.title || "Варианты").trim();
        const values = Array.isArray(vg.values) ? vg.values : [];
        if (values.length === 0) return;
        const defIdx = gIdx === 0 ? defaultVariantIndex : 0;
        parts.push("<div class=\"combo-block-product-detail combo-block-detail-section\" data-variant-group-index=\"" + gIdx + "\">");
        parts.push("<div class=\"combo-block-detail-label\">" + escapeHtml(title) + "</div>");
        parts.push("<div class=\"combo-block-detail-chips\">");
        values.forEach((val, vIdx) => {
          const label = formatVariantValue(val, unitLabel);
          if (!label) return;
          const isSelected = gIdx === 0 && vIdx === defIdx;
          parts.push("<button type=\"button\" class=\"combo-block-detail-chip" + (isSelected ? " is-selected" : "") + "\" data-variant-value-index=\"" + vIdx + "\">" + label + "</button>");
        });
        parts.push("</div></div>");
      });
    }
    const variableIngredients = ingredients.filter((i) => Number(i.is_variable) === 1);
    if (variableIngredients.length > 0) {
      parts.push("<div class=\"combo-block-product-detail combo-block-detail-section\">");
      parts.push("<div class=\"combo-block-detail-label\">Состав (можно настроить):</div>");
      parts.push("<div class=\"combo-block-detail-ingredients\">");
      const pcsUnitId = state.units.find((u) => u.code === "pcs")?.id || null;
      variableIngredients.forEach((ing) => {
        const qty = Number(ing.quantity) ?? 0;
        const unit = (ing.unit_short_title || ing.unit_title || ing.unit_code || "").trim();
        const name = (ing.ingredient_name || "").trim() || "—";
        const ingId = Number(ing.ingredient_id);
        const photos = Array.isArray(ing.ingredient_photos) ? ing.ingredient_photos : [];
        const photoUrl = photos.length > 0 ? (photos[0].url || photos[0]) : "";
        const thumb = photoUrl ? "<img class=\"combo-block-ingredient-thumb\" src=\"" + escapeHtml(photoUrl) + "\" alt=\"\" />" : "<span class=\"combo-block-ingredient-thumb combo-block-ingredient-thumb-placeholder\"><i class=\"fas fa-image\"></i></span>";

        // Строка с диапазоном количества и шагом — как в редакторе состава
        const isVariable = Number(ing.is_variable) === 1;
        const hasVariable = isVariable && (ing.quantity_min != null || ing.quantity_max != null);
        const rangeLabel = hasVariable
          ? `${ing.quantity_min != null ? formatQuantity(ing.quantity_min) : formatQuantity(qty)} - ${ing.quantity_max != null ? formatQuantity(ing.quantity_max) : "∞"}${ing.quantity_step != null ? `, шаг ${formatQuantity(ing.quantity_step)}` : ""}`
          : `${formatQuantity(qty)}`;
        const unitLabel = unit || (ing.unit_short_title || ing.unit_title || ing.unit_code || "");

        // Цена как в админке состава
        const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id;
        const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
        const catalogPriceBase = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
        const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogPriceBase;
        const fromUnitId = Number(ing.unit_id || 0);
        let qtyInBase = null;
        if (baseUnitId && fromUnitId) {
          if (Number(fromUnitId) === Number(baseUnitId)) {
            qtyInBase = qty;
          } else if (String(baseUnitId) === String(pcsUnitId)) {
            qtyInBase = null;
          } else if (String(fromUnitId) === String(pcsUnitId)) {
            qtyInBase = ing.ingredient_pcs_factor != null ? qty * Number(ing.ingredient_pcs_factor) : null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? qty * factor : null;
          }
        }
        const totalPrice = qtyInBase == null ? null : priceBase * qtyInBase;
        const priceLabel = qtyInBase == null ? "—" : formatMoney(priceBase);
        const totalLabel = totalPrice == null ? "—" : formatMoney(totalPrice);
        const summary = `${rangeLabel} ${unitLabel} × ${priceLabel} = ${totalLabel}`;

        parts.push("<div class=\"combo-block-detail-ingredient-row\" data-ingredient-id=\"" + ingId + "\">");
        parts.push(thumb);
        parts.push("<span class=\"combo-block-ingredient-name\">" + escapeHtml(name) + "<br><small class=\"combo-block-ingredient-meta\">" + escapeHtml(summary) + "</small></span>");
        parts.push("<div class=\"combo-block-ingredient-qty-wrap\"><button type=\"button\" class=\"combo-block-ingredient-btn combo-block-ingredient-minus\" aria-label=\"Меньше\">−</button><span class=\"combo-block-ingredient-qty\">" + qty + " " + escapeHtml(unit) + "</span><button type=\"button\" class=\"combo-block-ingredient-btn combo-block-ingredient-plus\" aria-label=\"Больше\">+</button></div>");
        parts.push("</div>");
      });
      parts.push("</div></div>");
    }
    if (parts.length === 0) {
      return "<div class=\"combo-block-product-detail muted\">Нет вариантов и изменяемого состава</div>";
    }
    return parts.join("");
  }

  function attachComboBlockProductDetailsHandlers(inner, wrapper, productId, product, variants, ingredients) {
    const priceEl = wrapper?.querySelector(".combo-block-product-price[data-product-id=\"" + productId + "\"]");
    const priceCell = wrapper?.querySelector(".combo-set-price-cell");
    const variableIngredients = ingredients.filter((i) => Number(i.is_variable) === 1);
    const defaultVariantIndex = (variants[0] && (variants[0].default_value_index != null || variants[0].assignment_default_value_index != null))
      ? (Number(variants[0].assignment_default_value_index ?? variants[0].default_value_index) ?? 0)
      : 0;
    let variantSelectedIndex = defaultVariantIndex;
    const ingredientState = new Map();
    variableIngredients.forEach((ing) => {
      ingredientState.set(Number(ing.ingredient_id), Number(ing.quantity ?? 0));
    });
    function updatePriceDisplay() {
      if (!priceEl && !priceCell) return;
      // Полная цена по составу — как в карточке товара
      let total = getComboBlockIngredientsTotalPrice(product, ingredients, ingredientState);
      // Если состав не задан или нет данных,fallback к цене товара / вариантам
      if (total == null) {
        const basePrice = getComboBlockVariantUnitPrice(product, variants, variantSelectedIndex);
        total = Math.round(Number(basePrice) || 0);
      }
      const rounded = Math.round(total);
      const inComboSet = wrapper?.closest("#comboSetBlocksList");
      if (inComboSet && priceCell) {
        const discountEl = document.getElementById("comboSetDiscount");
        const discountPercent = Number(discountEl?.value) || 0;
        const oldStr = formatPriceInteger(rounded) + " Р";
        const newNum = discountPercent > 0 ? rounded * (1 - discountPercent / 100) : rounded;
        const newStr = formatPriceInteger(Math.round(newNum)) + " Р";
        if (discountPercent > 0) {
          priceCell.innerHTML = `<span class="combo-set-price-wrap"><span class="combo-set-price-old" data-base-price="${rounded}">${oldStr}</span> <span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${rounded}">${newStr}</span></span>`;
        } else {
          priceCell.innerHTML = `<span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${rounded}">${oldStr}</span>`;
        }
        return;
      }
      if (priceEl) priceEl.textContent = formatPriceInteger(rounded) + " Р";
    }
    inner.querySelectorAll(".combo-block-detail-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const groupSection = btn.closest("[data-variant-group-index]");
        const groupIndex = groupSection ? parseInt(groupSection.dataset.variantGroupIndex, 10) : 0;
        if (groupIndex !== 0) return;
        const idx = parseInt(btn.dataset.variantValueIndex, 10);
        if (!Number.isFinite(idx)) return;
        variantSelectedIndex = idx;
        inner.querySelectorAll(".combo-block-detail-chip").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        updatePriceDisplay();
      });
    });
    variableIngredients.forEach((ing) => {
      const ingId = Number(ing.ingredient_id);
      const row = inner.querySelector(".combo-block-detail-ingredient-row[data-ingredient-id=\"" + ingId + "\"]");
      if (!row) return;
      const qtyDisplay = row.querySelector(".combo-block-ingredient-qty");
      const minusBtn = row.querySelector(".combo-block-ingredient-minus");
      const plusBtn = row.querySelector(".combo-block-ingredient-plus");
      const defaultQty = Number(ing.quantity ?? 0);
      const isVariable = Number(ing.is_variable) === 1;
      const rawMin = ing.quantity_min != null && Number.isFinite(Number(ing.quantity_min)) ? Number(ing.quantity_min) : null;
      const min = rawMin !== null ? rawMin : (isVariable ? 0 : defaultQty);
      const max = ing.quantity_max != null ? Number(ing.quantity_max) : defaultQty;
      const step = ing.quantity_step != null ? Number(ing.quantity_step) : 1;
      const unitLabel = (ing.unit_short_title || ing.unit_title || ing.unit_code || "").trim();
      function updateQtyDisplay() {
        const q = ingredientState.get(ingId) ?? defaultQty;
        if (qtyDisplay) qtyDisplay.textContent = q + " " + unitLabel;
      }
      function setQty(newQty) {
        let v = newQty;
        if (step > 0) {
          const stepsFromMin = Math.round((v - min) / step);
          v = min + (stepsFromMin * step);
        }
        v = Math.max(min, Math.min(max, v));
        ingredientState.set(ingId, v);
        updateQtyDisplay();
        updatePriceDisplay();
      }
      if (minusBtn) minusBtn.addEventListener("click", () => setQty((ingredientState.get(ingId) ?? defaultQty) - step));
      if (plusBtn) plusBtn.addEventListener("click", () => setQty((ingredientState.get(ingId) ?? defaultQty) + step));
      updateQtyDisplay();
    });
    updatePriceDisplay();
  }

  function openComboBlockProductsAccordion() {
    if (!comboBlockProductsList) return;
    const item = comboBlockProductsList.closest(".acc-item");
    const trigger = item?.querySelector("[data-acc-trigger]");
    const panel = item?.querySelector("[data-acc-panel]");
    if (!panel || !trigger) return;
    if (panel.classList.contains("is-open")) {
      requestAnimationFrame(() => { panel.style.maxHeight = panel.scrollHeight + "px"; });
      return;
    }
    panel.classList.add("is-open");
    trigger.classList.add("is-open");
    panel.style.maxHeight = panel.scrollHeight + "px";
  }

  async function openComboBlockProductPicker() {
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }
    state.comboPanel.level = "picker";
    // Предзаполняем выбор уже добавленными товарами блока,
    // чтобы в списке они сразу были выделены
    const existingSelection = new Set();
    (state.comboBlockProducts || []).forEach((p) => {
      const id = Number(p.product_id);
      if (Number.isFinite(id)) existingSelection.add(id);
    });
    const list = state.catalogCategories || [];
    const hasAllCategory = list.some((c) => c.code === "all" || (c.title || "").trim() === "Все товары");
    state.comboPanel.pickerCategoryId = hasAllCategory && list[0] ? Number(list[0].id) : null;
    state.comboPanel.pickerQuery = "";
    // хранить текущее и начальное состояние выбора — как в вариантах/опциях
    state.comboPanel.pickerSelection = existingSelection;
    state.comboPanel.pickerInitialSelection = new Set(existingSelection);
    if (comboBlockPickerSearch) comboBlockPickerSearch.value = "";
    await refreshComboBlockPickerProducts();
    if (comboBlockLevelGroup) comboBlockLevelGroup.classList.add("hidden");
    if (comboBlockLevelPicker) comboBlockLevelPicker.classList.remove("hidden");
    renderComboBlockPickerTabs();
    renderComboBlockPickerList();
    showProductFooterEdit();
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn) {
      if (!comboBlockPickerSavedFooterState) {
        comboBlockPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: footerCancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: footerCancelBtn.classList.contains("is-fullwidth"),
        };
        comboBlockPickerSavedHandlers = { cancel: footerCancelBtn.onclick, save: footerSaveBtn.onclick };
      }
      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");
      footerCancelBtn.classList.remove("is-confirm");
      footerCancelBtn.classList.add("is-fullwidth");
      if (!footerCancelBtn.dataset.pickerOriginalHtml) footerCancelBtn.dataset.pickerOriginalHtml = footerCancelBtn.innerHTML;
      footerCancelBtn.textContent = "Отменить";
      footerSaveBtn.textContent = "Сохранить";
      footerCancelBtn.dataset.pickerType = "combo";
      footerSaveBtn.dataset.pickerType = "combo";
      window._closeComboBlockPickerFn = () => {
        if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
        if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
        delete window._closeComboBlockPickerFn;
        delete window._saveComboBlockPickerFn;
        restoreComboBlockPickerFooter();
        state.comboPanel.level = "group";
        if (comboBlockLevelGroup) comboBlockLevelGroup.classList.remove("hidden");
        if (comboBlockLevelPicker) comboBlockLevelPicker.classList.add("hidden");
      };
      window._saveComboBlockPickerFn = applyComboBlockPickerSelection;
      footerCancelBtn.onclick = window._closeComboBlockPickerFn;
      footerSaveBtn.onclick = async () => { await window._saveComboBlockPickerFn(); };
    }
  }

  function restoreComboBlockPickerFooter() {
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (!footer || !footerView || !footerEditMode || !footerCancelBtn || !footerSaveBtn || !comboBlockPickerSavedFooterState) return;
    if (comboBlockPickerSavedFooterState.footerHidden) footer.classList.add("hidden"); else footer.classList.remove("hidden");
    if (comboBlockPickerSavedFooterState.viewHidden) footerView.classList.add("hidden"); else footerView.classList.remove("hidden");
    if (comboBlockPickerSavedFooterState.editHidden) footerEditMode.classList.add("hidden"); else footerEditMode.classList.remove("hidden");
    if (footerDeleteBtn) (comboBlockPickerSavedFooterState.deleteBtnHidden ? footerDeleteBtn.classList.add("hidden") : footerDeleteBtn.classList.remove("hidden"));
    if (footerMoreBtn) (comboBlockPickerSavedFooterState.moreBtnHidden ? footerMoreBtn.classList.add("hidden") : footerMoreBtn.classList.remove("hidden"));
    if (comboBlockPickerSavedFooterState.cancelBtnIsFullwidth) footerCancelBtn.classList.add("is-fullwidth"); else footerCancelBtn.classList.remove("is-fullwidth");
    if (comboBlockPickerSavedFooterState.cancelBtnIsConfirm) footerCancelBtn.classList.add("is-confirm"); else footerCancelBtn.classList.remove("is-confirm");
    if (footerCancelBtn.dataset.pickerOriginalHtml) { footerCancelBtn.innerHTML = footerCancelBtn.dataset.pickerOriginalHtml; delete footerCancelBtn.dataset.pickerOriginalHtml; }
    footerSaveBtn.textContent = "Сохранить";
    if (comboBlockPickerSavedHandlers) { footerCancelBtn.onclick = comboBlockPickerSavedHandlers.cancel; footerSaveBtn.onclick = comboBlockPickerSavedHandlers.save; }
    comboBlockPickerSavedFooterState = null;
    comboBlockPickerSavedHandlers = null;
  }

  async function applyComboBlockPickerSelection() {
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
    if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
    delete window._closeComboBlockPickerFn;
    delete window._saveComboBlockPickerFn;
    restoreComboBlockPickerFooter();
    state.comboPanel.level = "group";
    if (comboBlockLevelGroup) comboBlockLevelGroup.classList.remove("hidden");
    if (comboBlockLevelPicker) comboBlockLevelPicker.classList.add("hidden");

    // Итоговый набор выбранных ID — именно он определяет, какие товары останутся в блоке
    const selectedIds = new Set(Array.from(state.comboPanel.pickerSelection || []).map((id) => Number(id)));
    const pickerProducts = state.comboPanel.pickerProducts || [];

    const oldProducts = state.comboBlockProducts || [];
    const oldById = new Map(oldProducts.map((p) => [Number(p.product_id), p]));

    const newProducts = [];
    const addedIds = [];

    // 1) Сначала переносим уже существующие товары блока, которые остались выделены
    for (const p of oldProducts) {
      const pid = Number(p.product_id);
      if (!Number.isFinite(pid) || !selectedIds.has(pid)) continue;
      newProducts.push({ ...p });
      selectedIds.delete(pid); // чтобы не обрабатывать как "новый"
    }

    // 2) Добавляем новые товары, которые были выбраны, но раньше не входили в блок
    for (const product of pickerProducts) {
      const pid = Number(product.id);
      if (!Number.isFinite(pid) || !selectedIds.has(pid)) continue;
      const photos = product.photos || product.photos_json;
      const photo = Array.isArray(photos) && photos.length > 0 ? photos[0] : null;
      newProducts.push({
        product_id: product.id,
        name: product.name || "",
        sort_order: newProducts.length,
        is_default: 0,
        photo: photo || null,
        price: Number(product.price) || 0,
        has_variants: Number(product.has_variants) ? 1 : 0,
        has_changeable_composition: Number(product.has_changeable_composition) ? 1 : 0,
      });
      addedIds.push(pid);
    }

    // Пересчитать sort_order последовательно
    newProducts.forEach((p, idx) => { p.sort_order = idx; });

    // Гарантировать, что есть один товар "по умолчанию"
    let hasDefault = newProducts.some((p) => p.is_default);
    if (!hasDefault && newProducts.length > 0) {
      newProducts[0].is_default = 1;
      hasDefault = true;
    }

    state.comboBlockProducts = newProducts;

    if (addedIds.length > 0) {
      try {
        const res = await apiGetComboBlockProductFlags(addedIds);
        const flagsList = Array.isArray(res?.data) ? res.data : [];
        const flagsByPid = new Map(flagsList.map((f) => [Number(f.product_id), f]));
        newProducts.forEach((p) => {
          const fid = Number(p.product_id);
          const flags = flagsByPid.get(fid);
          if (flags) {
            p.has_variants = flags.has_variants ? 1 : 0;
            p.has_changeable_composition = flags.has_changeable_composition ? 1 : 0;
          }
        });
      } catch (_) {}
    }
    renderComboBlockProductsList();
    openComboBlockProductsAccordion();
  }

  function closeComboBlockProductPicker() {
    if (window._closeComboBlockPickerFn) window._closeComboBlockPickerFn();
  }

  async function refreshComboBlockPickerProducts() {
    const res = await apiGetCatalogProducts({
      categoryId: state.comboPanel.pickerCategoryId,
      query: state.comboPanel.pickerQuery,
    });
    state.comboPanel.pickerProducts = Array.isArray(res?.data) ? res.data : [];
  }

  function renderComboBlockPickerTabs() {
    if (!comboBlockPickerTabs) return;
    const list = state.catalogCategories || [];
    const isAllCat = (c) => c.code === "all" || (c.title || "").trim() === "Все товары";
    const hasAllCategory = list.some(isAllCat);
    const categories = hasAllCategory
      ? (() => {
          const allCat = list.find(isAllCat);
          const rest = list.filter((c) => !isAllCat(c));
          return allCat ? [allCat, ...rest] : [{ id: null, title: "Все товары" }, ...list];
        })()
      : [{ id: null, title: "Все товары" }].concat(list);
    const lastScroll = Number.isFinite(state.comboPanel.pickerTabsScrollLeft) ? state.comboPanel.pickerTabsScrollLeft : comboBlockPickerTabs.scrollLeft;
    comboBlockPickerTabs.innerHTML = categories.map((cat) => {
      const active = (cat.id == null && state.comboPanel.pickerCategoryId == null) || Number(cat.id) === Number(state.comboPanel.pickerCategoryId);
      return `<button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id == null ? "" : cat.id}">${escapeHtml(cat.title || "")}</button>`;
    }).join("");
    if (typeof bindHorizontalScroll === "function") bindHorizontalScroll(comboBlockPickerTabs);
    requestAnimationFrame(() => { comboBlockPickerTabs.scrollLeft = lastScroll; });
    comboBlockPickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const v = btn.dataset.catId;
        state.comboPanel.pickerCategoryId = v === "" ? null : Number(v);
        renderComboBlockPickerTabs();
        await refreshComboBlockPickerProducts();
        renderComboBlockPickerList();
      });
    });
  }

  function updateComboBlockPickerSelectAllState() {
    if (!comboBlockPickerSelectAll || !comboBlockPickerSelectAllLabel) return;
    const products = state.comboPanel.pickerProducts || [];
    const ids = products.map((p) => Number(p.id));
    const selectedCount = ids.filter((id) => Number.isFinite(id) && state.comboPanel.pickerSelection.has(id)).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const noneSelected = selectedCount === 0;
    comboBlockPickerSelectAll.checked = allSelected;
    comboBlockPickerSelectAll.indeterminate = !allSelected && !noneSelected;
    comboBlockPickerSelectAll.disabled = ids.length === 0;
    const label = allSelected ? "Сбросить все" : "Выделить все";
    comboBlockPickerSelectAllLabel.textContent = label;
  }

  function renderComboBlockPickerList() {
    if (!comboBlockPickerList) return;
    const products = state.comboPanel.pickerProducts || [];
    const query = (comboBlockPickerSearch?.value ?? "").trim().toLowerCase();
    const filtered = query ? products.filter((p) => (p.name || "").toLowerCase().includes(query)) : products;
    comboBlockPickerList.innerHTML = filtered.map((product) => {
      const pid = Number(product.id);
      const checked = Number.isFinite(pid) && state.comboPanel.pickerSelection.has(pid);
      return `
        <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${product.id}">
          <div class="option-picker-title">${escapeHtml(product.name || "")}</div>
          <div class="option-picker-price">Цена: ${product.price != null ? formatPriceInteger(product.price) : "—"}</div>
          <input class="option-picker-checkbox" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
        </div>
      `;
    }).join("");
    comboBlockPickerList.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.productId);
        if (!Number.isFinite(id)) return;
        if (state.comboPanel.pickerSelection.has(id)) state.comboPanel.pickerSelection.delete(id);
        else state.comboPanel.pickerSelection.add(id);
        renderComboBlockPickerList();
      });
    });
    comboBlockPickerList.querySelectorAll(".option-picker-checkbox").forEach((cb) => {
      cb.addEventListener("click", (e) => e.stopPropagation());
    });
    updateComboBlockPickerSelectAllState();
  }

  async function openVariantPicker(mode) {
    if (!state.variantDraft) state.variantDraft = { group: {}, tiers: [], assignments: [] };
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }
    state.variantPanel.level = "picker";
    state.variantPanel.pickerMode = mode;
    const existingSelection = new Set();
    getVariantAssignmentsSource().forEach((assignment) => {
      const id = Number(assignment.assign_id ?? assignment.id);
      if (Number.isFinite(id)) existingSelection.add(id);
    });
    // keep selection on reopen
    state.variantPanel.pickerSelection = existingSelection;
    state.variantPanel.pickerInitialSelection = new Set(existingSelection);
    state.variantPanel.pickerCategoryId = state.catalogCategories[0] ? Number(state.catalogCategories[0].id) : null;
    state.variantPanel.pickerQuery = "";
    if (optionPickerSearch) optionPickerSearch.value = "";
    await refreshVariantPickerProducts();
    renderVariantPickerLevel();
  }

  async function refreshVariantPickerProducts() {
    const res = await apiGetCatalogProducts({
      categoryId: state.variantPanel.pickerCategoryId,
      query: state.variantPanel.pickerQuery,
    });
    state.variantPanel.pickerProducts = Array.isArray(res.data) ? res.data : [];
    renderVariantPickerList();
  }

  function renderVariantPickerList() {
    if (!optionPickerList) return;
    optionPickerList.innerHTML = state.variantPanel.pickerProducts.map((product) => {
      const checked = state.variantPanel.pickerSelection.has(product.id);
      return `
        <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${product.id}">
          <div class="option-picker-title">${escapeHtml(product.name || "")}</div>
          <div class="option-picker-price">Цена: ${product.price != null ? formatPriceInteger(product.price) : "—"}</div>
          <input class="option-picker-checkbox" type="checkbox" data-product-id="${product.id}" ${checked ? "checked" : ""} />
        </div>
      `;
    }).join("");

    optionPickerList.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = Number(row.dataset.productId);
        if (!Number.isFinite(id)) return;
        if (state.variantPanel.pickerSelection.has(id)) {
          state.variantPanel.pickerSelection.delete(id);
        } else {
          state.variantPanel.pickerSelection.add(id);
        }
        renderVariantPickerList();
        renderVariantHeader();
      });
    });

    updateVariantPickerSelectAllState();
  }

  function updateVariantPickerSelectAllState() {
    if (!optionPickerSelectAll || !optionPickerSelectAllLabel) return;
    const products = state.variantPanel.pickerProducts || [];
    const ids = products.map((product) => product.id);
    const selectedCount = ids.filter((id) => state.variantPanel.pickerSelection.has(id)).length;
    const allSelected = ids.length > 0 && selectedCount === ids.length;
    const noneSelected = selectedCount === 0;
    optionPickerSelectAll.checked = allSelected;
    optionPickerSelectAll.indeterminate = !allSelected && !noneSelected;
    optionPickerSelectAll.disabled = ids.length === 0;
    const label = allSelected ? "Сбросить все" : "Выделить все";
    optionPickerSelectAllLabel.textContent = label;
    optionPickerSelectAll.setAttribute("aria-label", label);
  }

  function renderVariantPickerLevel() {
    if (!optionLevelPicker) return;
    // Hide variant group form, show picker
    if (variantLevelGroup) variantLevelGroup.classList.add("hidden");
    // Ensure variantGroupInfo is visible (it should contain picker now)
    if (variantGroupInfo) {
      variantGroupInfo.classList.remove("hidden");
      // Move picker to variantGroupInfo if needed for proper display
      if (optionLevelPicker.parentElement !== variantGroupInfo) {
        variantGroupInfo.appendChild(optionLevelPicker);
      }
    }
    optionLevelPicker.classList.remove("hidden");
    renderVariantPickerTabs();
    renderVariantPickerList();
    renderVariantHeader();
    showProductFooterEdit();
    
    // Switch footer to picker mode
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerDeleteBtn = $("#productFooterDeleteEditBtn");
    const footerMoreBtn = $("#productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && footerCancelBtn && footerSaveBtn) {
      if (!variantPickerSavedFooterState) {
        variantPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: footerCancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: footerCancelBtn.classList.contains("is-fullwidth"),
        };
        variantPickerSavedHandlers = {
          cancel: footerCancelBtn.onclick,
          save: footerSaveBtn.onclick,
        };
      }

      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");

      footerCancelBtn.classList.remove("is-confirm");
      footerCancelBtn.classList.add("is-fullwidth");
      if (!footerCancelBtn.dataset.pickerOriginalHtml) {
        footerCancelBtn.dataset.pickerOriginalHtml = footerCancelBtn.innerHTML;
      }
      footerCancelBtn.textContent = "Отменить";
      footerCancelBtn.title = "Отменить";
      footerCancelBtn.setAttribute("aria-label", "Отменить");
    }
    if (footerCancelBtn) footerCancelBtn.dataset.pickerType = "variant";
    if (footerSaveBtn) footerSaveBtn.dataset.pickerType = "variant";
    window._closeVariantPickerFn = () => {
      // Clear picker footer data attributes
      if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
      if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
      delete window._closeVariantPickerFn;
      delete window._saveVariantPickerFn;
      restoreVariantPickerFooter();
      
      state.variantPanel.level = "group";
      renderVariantGroupLevel();
    };
    window._saveVariantPickerFn = async () => {
      await applyVariantPickerSelection();
    };
  }

  function renderVariantPickerTabs() {
    if (!optionPickerTabs) return;
    const lastScroll = Number.isFinite(state.variantPanel.pickerTabsScrollLeft)
      ? state.variantPanel.pickerTabsScrollLeft
      : optionPickerTabs.scrollLeft;
    optionPickerTabs.innerHTML = state.catalogCategories.map((cat) => {
      const active = Number(cat.id) === Number(state.variantPanel.pickerCategoryId);
      return `
        <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
          ${escapeHtml(cat.title || "")}
        </button>
      `;
    }).join("");

    bindHorizontalScroll(optionPickerTabs);
    requestAnimationFrame(() => {
      optionPickerTabs.scrollLeft = lastScroll;
    });

    optionPickerTabs.querySelectorAll("[data-cat-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        state.variantPanel.pickerCategoryId = Number(btn.dataset.catId);
        renderVariantPickerTabs();
        await refreshVariantPickerProducts();
      });
    });
  }

  async function applyVariantPickerSelection() {
    // Clear picker footer data attributes before closing
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    if (footerCancelBtn) delete footerCancelBtn.dataset.pickerType;
    if (footerSaveBtn) delete footerSaveBtn.dataset.pickerType;
    delete window._closeVariantPickerFn;
    delete window._saveVariantPickerFn;
    restoreVariantPickerFooter();
    
    if (isSameSelection(state.variantPanel.pickerSelection, state.variantPanel.pickerInitialSelection)) {
      // close picker silently if nothing changed
      state.variantPanel.level = "group";
      renderVariantGroupLevel();
      return;
    }
    const selectedIds = Array.from(state.variantPanel.pickerSelection);
    if (!selectedIds.length) {
      state.variantPanel.level = "group";
      renderVariantGroupLevel();
      return;
    }

    if (state.variantPanel.mode === "create") {
      const existing = new Set(state.variantDraft.assignments.map((x) => x.id));
      state.variantPanel.pickerProducts.forEach((product) => {
        if (!state.variantPanel.pickerSelection.has(product.id)) return;
        if (existing.has(product.id)) return;
        state.variantDraft.assignments.push({
          tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          id: product.id,
          name: product.name,
          product_name: product.name,
          priority: 0,
          sort_order: 0,
        });
      });
      state.variantPanel.itemsDirty = true;
    } else if (state.variantPanel.mode === "edit") {
      const existing = new Set(
        state.variantDraft.assignments.map((x) => Number(x.assign_id ?? x.id)).filter(Number.isFinite)
      );
      state.variantPanel.pickerProducts.forEach((product) => {
        if (!state.variantPanel.pickerSelection.has(product.id)) return;
        if (existing.has(product.id)) return;
        state.variantDraft.assignments.push({
          tempId: `${product.id}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          assign_id: product.id,
          name: product.name,
          product_name: product.name,
          priority: 0,
          sort_order: 0,
          isNew: true,
        });
      });
      state.variantPanel.itemsDirty = true;
    }

    state.variantPanel.level = "group";
    renderVariantGroupLevel();
  }

  function syncVariantDiscountInputs() {
    if (!variantItemsList) return true;
    const inputs = Array.from(variantItemsList.querySelectorAll("[data-variant-discount]"));
    for (const input of inputs) {
      const idx = Number(input.dataset.variantDiscount);
      const raw = String(input.value || "").trim();
      const hasSign = /^[+-]/.test(raw);
      const normalized = raw.replace(",", ".");
      const parsed = Number(normalized);
      if (!raw || !hasSign || !Number.isFinite(parsed)) {
        input.classList.add("is-invalid");
        showToast("Укажите знак + или - в значении варианта.");
        input.focus();
        return false;
      }
      input.classList.remove("is-invalid");
      if (!state.variantDraft) state.variantDraft = { group: { values: [] }, tiers: [], assignments: [] };
      if (!state.variantDraft.tiers) state.variantDraft.tiers = [];
      if (!state.variantDraft.tiers[idx]) {
        state.variantDraft.tiers[idx] = { sort_order: idx, discount_type: "percent", discount_value: 0 };
      }
      const discountType = state.variantDraft.tiers[idx].discount_type || "percent";
      const storedValue = -parsed;
      if (discountType === "percent") {
        state.variantDraft.tiers[idx].discount_percent = storedValue;
      } else {
        state.variantDraft.tiers[idx].discount_value = storedValue;
      }
    }
    return true;
  }

  async function saveVariantGroup() {
    if (!variantGroupForm) return;
    const formValues = getVariantGroupFormValues();

    // Важно: default_value_index может быть 0 (первый вариант), поэтому проверяем !== undefined и !== null
    const defaultIdx = formValues.default_value_index !== undefined && formValues.default_value_index !== null
      ? Number(formValues.default_value_index)
      : null;
    
    const payload = {
      title: formValues.title,
      unit_id: formValues.unit_id || null,
      sort_order: formValues.sort_order || 0,
      is_active: formValues.is_active || 0,
      default_value_index: defaultIdx,
    };

    if (!payload.title) {
      variantGroupTitleInput?.focus();
      return;
    }

    if (!syncVariantDiscountInputs()) {
      return;
    }

    if (state.variantPanel.mode === "create") {
      // Prepare tiers payload - match values array with tiers
      const values = state.variantDraft.group.values || [];
      const tiers = state.variantDraft.tiers || [];
      const tiersPayload = values.map((value, idx) => {
        const tier = tiers.find(t => Number(t.sort_order) === idx) || { discount_type: "percent", discount_percent: 0 };
        const discountType = tier.discount_type || "percent";
        const discountValue = discountType === "percent" 
          ? (tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0))
          : (tier.discount_value != null ? tier.discount_value : (tier.discount_percent || 0));
        return {
          sort_order: idx,
          min_quantity: 1, // API expects min_quantity
          discount_percent: discountType === "percent" ? discountValue : 0,
        };
      });

      // API expects assignments as array of IDs, not objects
      const assignmentsPayload = (state.variantDraft.assignments || [])
        .map((item) => Number(item.assign_id ?? item.id))
        .filter((id) => Number.isFinite(id) && id > 0);

      try {
        const res = await apiCreateVariantGroup({
          group: { ...payload, values: values }, // API expects 'values' as array, not 'values_json'
          tiers: tiersPayload,
          assignments: assignmentsPayload,
        });
        if (!res || !res.ok || !res.id) {
          throw new Error(res?.error || "Ошибка при создании варианта");
        }
        state.selectedVariantGroupId = res.id;
        await loadVariantGroups();
        await loadVariantGroupDetails(res.id);
        renderVariantGroupsList();
        
        // Replace temporary tab with real one
        if (state.variantPanel.tabKey) {
          replaceTabKey(state.variantPanel.tabKey, {
            type: "variant",
            id: res.id,
            title: payload.title || "Вариант",
          onActivate: async () => {
            state.selectedVariantGroupId = res.id;
            await loadVariantGroupDetails(res.id);
            renderVariantGroupsList();
            showVariantGroupDetails(state.variantGroupDetails, { mode: state.variantPanel.mode || "view" });
          },
        });
        state.variantPanel.tabKey = null;
      }
      
        state.variantDraft = null;
        state.variantPanel.itemsDirty = false;
        showVariantGroupDetails(state.variantGroupDetails, { mode: "view" });
        return;
      } catch (e) {
        const message = e && e.message ? e.message : "Не удалось сохранить вариант.";
        showToast(message);
        console.error("Error saving variant group:", e);
        return;
      }
    }

    if (state.selectedVariantGroupId) {
      if (state.variantPanel.mode !== "edit") return;
      const groupId = state.selectedVariantGroupId;
      const values = state.variantDraft?.group?.values || [];
      const tiers = state.variantDraft?.tiers || [];
      const tiersPayload = values.map((value, idx) => {
        const tier = tiers.find(t => Number(t.sort_order) === idx) || { discount_type: "percent", discount_percent: 0 };
        const discountType = tier.discount_type || "percent";
        const discountValue = discountType === "percent" 
          ? (tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0))
          : (tier.discount_value != null ? tier.discount_value : (tier.discount_percent || 0));
        return {
          id: tier.id,
          sort_order: idx,
          min_quantity: tier.min_quantity ?? 1,
          discount_percent: discountType === "percent" ? discountValue : 0,
        };
      });
      const existingTierIds = new Set((state.variantGroupDetails?.tiers || [])
        .map((t) => Number(t.id))
        .filter(Number.isFinite));
      const payloadTierIds = new Set(tiersPayload.map((t) => Number(t.id)).filter(Number.isFinite));
      const deleteTierIds = Array.from(existingTierIds).filter((id) => !payloadTierIds.has(id));

      const existingAssignments = state.variantGroupDetails?.assignments || [];
      const currentProductIds = new Set(
        (state.variantDraft?.assignments || [])
          .map((a) => Number(a.assign_id ?? a.product_id ?? a.id))
          .filter(Number.isFinite)
      );
      const existingProductIds = new Set(
        existingAssignments.map((a) => Number(a.product_id ?? a.assign_id ?? a.id)).filter(Number.isFinite)
      );
      const toAdd = Array.from(currentProductIds).filter((id) => !existingProductIds.has(id));
      const toRemove = existingAssignments.filter((a) => {
        const productId = Number(a.product_id ?? a.assign_id ?? a.id);
        return Number.isFinite(productId) && !currentProductIds.has(productId);
      });

      try {
        const patchPayload = { ...payload, values };
        await apiPatchVariantGroup(groupId, patchPayload);
        await apiSaveVariantGroupTiers(groupId, { tiers: tiersPayload, delete_ids: deleteTierIds });
        if (toAdd.length) {
          await apiAddVariantGroupAssignments(groupId, toAdd);
        }
        for (const assignment of toRemove) {
          if (assignment.id) {
            await apiDeleteVariantAssignment(assignment.id);
          }
        }

        await loadVariantGroups();
        await loadVariantGroupDetails(groupId);
        renderVariantGroupsList();
        
        // Очищаем кеш редактирования после успешного сохранения
        if (state.selectedVariantGroupId) {
          editingVariants.delete(state.selectedVariantGroupId);
        }
        
        state.variantDraft = null;
        state.variantPanel.itemsDirty = false;
        state.variantPanel.snapshotData = null;
        
        showVariantGroupDetails(state.variantGroupDetails, { mode: "view" });
        return;
      } catch (e) {
        const message = e && e.message ? e.message : "Не удалось сохранить вариант.";
        showToast(message);
        console.error("Error saving variant group:", e);
        return;
      }
    }
  }

  function startOptionCreate() {
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.optionDraft = {
      group: {
        title: "",
        selection_type: "single",
        min_select: 0,
        max_select: null,
        sort_order: 0,
        is_active: 1,
      },
      items: [],
      assignments: [],
    };
    state.optionPanel.itemsDirty = false;
    renderAllOptionGroupsLists();
    
    // Create tab with temporary ID for new option
    const tabId = `new-option-${Date.now()}`;
    ensureTab({
      type: "option",
      id: tabId,
      title: "Новая опция",
      onActivate: () => {
        if (editingOptions.has(tabId)) {
          const es = editingOptions.get(tabId);
          state.optionDraft = es.optionDraft ? deepClone(es.optionDraft) : state.optionDraft;
          state.optionPanel.snapshotData = es.snapshotData ? deepClone(es.snapshotData) : null;
        }
        showOptionGroupDetails({ group: (state.optionDraft || {}).group || {} }, { mode: "create" });
        showProductFooterEdit();
      },
      activate: true,
    });
    
    // Store tab key in state for later replacement
    state.optionPanel.tabKey = buildTabKey("option", tabId);
    
    showOptionGroupDetails({ group: state.optionDraft.group }, { mode: "create" });
  }

  function startVariantCreate() {
    state.selectedVariantGroupId = null;
    state.variantGroupDetails = null;
    state.variantDraft = {
      group: {
        title: "",
        unit_id: null,
        values: [],
        sort_order: 0,
        is_active: 1,
      },
      tiers: [],
      assignments: [],
    };
    state.variantPanel.itemsDirty = false;
    renderVariantGroupsList();
    
    // Create tab with temporary ID for new variant
    const tabId = `new-variant-${Date.now()}`;
    ensureTab({
      type: "variant",
      id: tabId,
      title: "Новый вариант",
      onActivate: () => {
        if (editingVariants.has(tabId)) {
          const es = editingVariants.get(tabId);
          state.variantDraft = es.variantDraft ? deepClone(es.variantDraft) : state.variantDraft;
          state.variantPanel.snapshotData = es.snapshotData ? deepClone(es.snapshotData) : null;
        }
        showVariantGroupDetails({ group: (state.variantDraft || {}).group || {} }, { mode: "create" });
        showProductFooterEdit();
      },
      activate: true,
    });
    
    // Store tab key in state for later replacement
    state.variantPanel.tabKey = buildTabKey("variant", tabId);
    
    showVariantGroupDetails({ group: state.variantDraft.group }, { mode: "create" });
    showProductFooterEdit();
  }

  function startComboBlockCreate() {
    state.comboBlockDraft = { title: "", sort_order: 0, min_select: 1, max_select: 1 };
    state.comboBlockProducts = [];
    state.comboPanel.mode = "create";

    const tabId = `new-combo-block-${Date.now()}`;
    ensureTab({
      type: "combo",
      id: tabId,
      title: "Новый блок комбо",
      onActivate: () => {
        if (editingCombos.has(tabId)) {
          const es = editingCombos.get(tabId);
          state.comboBlockDraft = es.blockDraft ? deepClone(es.blockDraft) : state.comboBlockDraft;
          state.comboBlockProducts = es.products ? deepClone(es.products) : state.comboBlockProducts;
        }
        showComboBlockDetails({ block: state.comboBlockDraft || {}, products: state.comboBlockProducts }, { mode: "create" });
        showProductFooterEdit();
      },
      activate: true,
    });

    state.comboPanel.tabKey = buildTabKey("combo", tabId);
    showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "create" });
    showProductFooterEdit();
  }

  function startOptionEdit({ silent = false } = {}) {
    if (!state.optionGroupDetails?.group) return;
    state.optionPanel.snapshotData = deepClone({
      group: state.optionGroupDetails.group,
      items: state.optionGroupDetails.items || [],
      assignments: state.optionGroupDetails.assignments || [],
    });
    state.optionDraft = deepClone({
      group: state.optionGroupDetails.group,
      items: state.optionGroupDetails.items || [],
      assignments: state.optionGroupDetails.assignments || [],
    });
    state.optionPanel.mode = "edit";
    
    // Store editing state for this option
    if (state.selectedOptionGroupId) {
      editingOptions.set(state.selectedOptionGroupId, {
        mode: "edit",
        optionDraft: deepClone(state.optionDraft),
        snapshotData: deepClone(state.optionPanel.snapshotData)
      });
    }
    
    if (silent) return;
    
    // Update footer to edit mode
    renderOptionGroupLevel();
  }

  function startVariantEdit({ silent = false } = {}) {
    if (!state.variantGroupDetails?.group) return;
    
    // Всегда создаем новый draft из свежих данных, игнорируя кеш
    // Сначала очищаем старый кеш для этого варианта
    if (state.selectedVariantGroupId) {
      editingVariants.delete(state.selectedVariantGroupId);
    }
    
    // Создаем snapshot и draft из свежих данных
    state.variantPanel.snapshotData = deepClone({
      group: state.variantGroupDetails.group,
      tiers: state.variantGroupDetails.tiers || [],
      assignments: state.variantGroupDetails.assignments || [],
    });
    state.variantDraft = deepClone({
      group: state.variantGroupDetails.group,
      tiers: state.variantGroupDetails.tiers || [],
      assignments: state.variantGroupDetails.assignments || [],
    });
    state.variantPanel.mode = "edit";
    
    // Store editing state for this variant (для отслеживания, что редактирование активно)
    if (state.selectedVariantGroupId) {
      editingVariants.set(state.selectedVariantGroupId, {
        mode: "edit",
        variantDraft: deepClone(state.variantDraft),
        snapshotData: deepClone(state.variantPanel.snapshotData)
      });
    }
    
    if (silent) return;
    
    // Update footer to edit mode
    renderVariantGroupLevel();
  }

  function cancelVariantEdit() {
    if (state.variantPanel.mode === "create") {
      if (state.variantPanel.tabKey) {
        closeTab(state.variantPanel.tabKey);
      }
      state.variantDraft = null;
      state.variantPanel.mode = null;
      state.variantPanel.tabKey = null;
      state.selectedVariantGroupId = null;
      hideProductFooter();
      return;
    }
    if (state.variantPanel.mode === "edit" && state.selectedVariantGroupId) {
      // Очищаем кеш редактирования при отмене
      editingVariants.delete(state.selectedVariantGroupId);
      (async () => {
        state.variantPanel.mode = "view";
        state.variantDraft = null;
        state.variantPanel.itemsDirty = false;
        await loadVariantGroupDetails(state.selectedVariantGroupId);
        showVariantGroupDetails(state.variantGroupDetails, { mode: "view" });
      })();
    }
  }

  function cancelVariantEdit() {
    if (state.variantPanel.mode === "edit") {
      if (state.selectedVariantGroupId) {
        editingVariants.delete(state.selectedVariantGroupId);
      }
      state.variantPanel.mode = "view";
      state.variantPanel.itemsDirty = false;
      state.variantDraft = null;
      state.variantPanel.snapshotData = null;
      hideProductFooter();
      return;
    }
    if (state.variantPanel.mode === "create") {
      state.variantPanel.mode = "view";
      state.variantDraft = null;
      state.variantPanel.tabKey = null;
      state.selectedVariantGroupId = null;
      state.variantGroupDetails = null;
      state.variantPanel.itemsDirty = false;
      state.variantPanel.snapshotData = null;
      hideProductFooter();
      renderVariantGroupsList();
    }
  }

  function cancelOptionEdit() {
    if (state.optionPanel.mode === "edit") {
      // Remove from editing state when canceling
      if (state.selectedOptionGroupId) {
        editingOptions.delete(state.selectedOptionGroupId);
      }
      if (state.optionPanel.returnTo?.type === "product-edit") {
        closeOptionDetails();
        return;
      }
      // return to view without closing the panel
      state.optionPanel.mode = "view";
      state.optionPanel.itemsDirty = false;
      state.optionDraft = null;
      state.optionPanel.snapshotData = null;
      hideProductFooter();
      renderOptionGroupLevel();
      return;
    }
    if (state.optionPanel.mode === "create") {
      closeOptionDetails();
    }
  }

  async function saveOptionGroup() {
    if (!optionGroupForm) return;
    const formValues = getOptionGroupFormValues();
    const selectionUi = formValues.selection_type;
    const payload = buildOptionGroupPayload(formValues);

    if (!payload.title) {
      optionGroupTitleInput?.focus();
      return;
    }

    if (state.optionPanel.mode === "create") {
      const itemsPayload = state.optionDraft.items.map((item, idx) => {
        const isFixed = item.newPrice !== "" && item.newPrice != null;
        return {
          target_product_id: item.id,
          price_mode: isFixed ? "fixed" : "from_target",
          price_value: isFixed ? Number(item.newPrice) : null,
          qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
          qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
          sort_order: idx * 10,
        };
      });

      const assignmentsPayload = state.optionDraft.assignments.map((item, idx) => ({
        assign_id: item.id,
        priority: item.priority ?? 0,
        sort_order: item.sort_order ?? idx * 10,
      }));

      const res = await apiCreateOptionGroup({
        group: payload,
        items: itemsPayload,
        assignments: assignmentsPayload,
      });
      state.selectedOptionGroupId = res.id;
      await loadOptionGroups();
      await loadOptionGroupDetails(res.id);
      renderAllOptionGroupsLists();
      
      // Replace temporary tab with real one
      if (state.optionPanel.tabKey) {
        replaceTabKey(state.optionPanel.tabKey, {
          type: "option",
          id: res.id,
          title: res.title || "Опция",
          onActivate: async () => {
            state.selectedOptionGroupId = res.id;
            await loadOptionGroupDetails(res.id);
            renderAllOptionGroupsLists();
            
            // Check if this option is being edited
            if (editingOptions.has(res.id)) {
              const editingState = editingOptions.get(res.id);
              state.optionPanel.mode = editingState.mode;
              state.optionDraft = deepClone(editingState.optionDraft);
              state.optionPanel.snapshotData = deepClone(editingState.snapshotData);
              showOptionGroupDetails(state.optionGroupDetails, { mode: editingState.mode });
            } else {
              showOptionGroupDetails(state.optionGroupDetails, { mode: state.optionPanel.mode || "view" });
            }
          },
        });
        state.optionPanel.tabKey = null;
      }
      
      state.optionDraft = null;
      state.optionPanel.itemsDirty = false;
      showOptionGroupDetails(state.optionGroupDetails, { mode: "view" });
      return;
    }

    if (state.selectedOptionGroupId) {
      if (!isOptionGroupDirty()) {
        state.optionPanel.mode = "view";
        state.optionPanel.itemsDirty = false;
        state.optionDraft = null;
        state.optionPanel.snapshotData = null;
      hideProductFooter();
        renderOptionGroupLevel();
        return;
      }

      const snapshot = state.optionPanel.snapshotData;
      const snapshotGroup = getOptionGroupUiValues(snapshot?.group, snapshot?.items || []);
      const groupChanged = JSON.stringify(formValues) !== JSON.stringify(snapshotGroup);
      
      // Проверяем, изменился ли тип выбора (для обновления qty_min/qty_max всех items)
      const snapshotSelectionUi = snapshotGroup?.selection_type || "single";
      const selectionTypeChanged = selectionUi !== snapshotSelectionUi;

      const draftItems = state.optionDraft?.items || [];
      const draftAssignments = state.optionDraft?.assignments || [];
      const snapshotItems = snapshot?.items || [];
      const snapshotAssignments = snapshot?.assignments || [];

      const normalizeItem = (item) => ({
        price_mode: item.price_mode ?? "from_target",
        price_value: item.price_value ?? null,
        qty_min: item.qty_min ?? 1,
        qty_max: item.qty_max ?? 1,
      });

      const snapshotItemMap = new Map(snapshotItems.filter((item) => item.id).map((item) => [String(item.id), item]));
      const draftItemMap = new Map(draftItems.filter((item) => item.id && !item.isNew).map((item) => [String(item.id), item]));

      const removedItems = snapshotItems.filter((item) => item.id && !draftItemMap.has(String(item.id)));
      const addedItems = draftItems.filter((item) => item.isNew || !item.id);
      const updatedItems = [];
      draftItemMap.forEach((item, key) => {
        const prev = snapshotItemMap.get(key);
        if (!prev) return;
        // Если тип изменился — все items нужно обновить (для корректных qty_min/qty_max)
        if (selectionTypeChanged || JSON.stringify(normalizeItem(item)) !== JSON.stringify(normalizeItem(prev))) {
          updatedItems.push(item);
        }
      });

      const snapshotAssignmentMap = new Map(
        snapshotAssignments.filter((assignment) => assignment.id).map((assignment) => [String(assignment.id), assignment])
      );
      const draftAssignmentMap = new Map(
        draftAssignments.filter((assignment) => assignment.id && !assignment.isNew).map((assignment) => [String(assignment.id), assignment])
      );

      const removedAssignments = snapshotAssignments.filter(
        (assignment) => assignment.id && !draftAssignmentMap.has(String(assignment.id))
      );
      const addedAssignments = draftAssignments.filter((assignment) => assignment.isNew || !assignment.id);

      try {
        if (groupChanged) {
          await apiPatchOptionGroup(state.selectedOptionGroupId, payload);
        }

        if (addedItems.length) {
          const itemsPayload = addedItems.map((item, idx) => ({
            target_product_id: item.target_product_id ?? item.id,
            price_mode: item.price_mode ?? "from_target",
            price_value: item.price_value ?? null,
            qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
            qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
            sort_order: idx * 10,
          }));
          await apiAddGroupItems(state.selectedOptionGroupId, itemsPayload);
        }

        for (const item of updatedItems) {
          await apiPatchItem(item.id, {
            price_mode: item.price_mode ?? "from_target",
            price_value: item.price_value ?? null,
            qty_min: selectionUi === "multiple_item" ? (item.qty_min ?? 1) : 1,
            qty_max: selectionUi === "multiple_item" ? (item.qty_max ?? 1) : 1,
          });
        }

        for (const item of removedItems) {
          await apiDeleteItem(item.id);
        }

        if (addedAssignments.length) {
          const assignIds = addedAssignments
            .map((assignment) => Number(assignment.assign_id ?? assignment.id))
            .filter(Number.isFinite);
          if (assignIds.length) {
            await apiAddGroupAssignments(state.selectedOptionGroupId, assignIds);
          }
        }

        for (const assignment of removedAssignments) {
          await apiDeleteAssignment(assignment.id);
        }

        await loadOptionGroups();
        await loadOptionGroupDetails(state.selectedOptionGroupId);
        renderAllOptionGroupsLists();
        
        // Remove from editing state after successful save
        if (state.selectedOptionGroupId) {
          editingOptions.delete(state.selectedOptionGroupId);
        }
        
        state.optionPanel.mode = "view";
        state.optionPanel.itemsDirty = false;
        state.optionDraft = null;
        state.optionPanel.snapshotData = null;
        hideProductFooter();
        renderOptionGroupLevel();
        if (state.optionPanel.returnTo?.type === "product-edit") {
          closeOptionDetails();
        }
      } catch (e) {
        const message = e && e.message ? e.message : "Не удалось сохранить изменения.";
        showToast(message);
      }
    }
  }

  function confirmOptionGroupDelete() {
    if (!state.selectedOptionGroupId || !window.AppModal) return;
    const groupId = state.selectedOptionGroupId;
    window.AppModal.open({
      title: "Удалить опцию?",
      content: `<div class="modal-text">Опция будет удалена без возможности восстановления.</div>`,
      saveText: "Удалить",
      cancelText: "Отмена",
      onSave: async () => {
        try {
          await apiDeleteOptionGroup(groupId);
          state.optionGroupCache.delete(groupId);
          await loadOptionGroups();
          closeOptionDetails();
          return true;
        } catch (e) {
          const message = e && e.message ? e.message : "Не удалось удалить опцию.";
          alert(message);
          return false;
        }
      },
    });
  }

  function confirmCategoryDelete() {
    if (!state.selectedCategoryId || !window.AppModal) return;
    const categoryId = state.selectedCategoryId;
    const category = state.categories.find((c) => c.id === categoryId);
    const categoryName = category ? category.title : "категорию";
    
    window.AppModal.open({
      title: "Удалить категорию?",
      content: `<div class="modal-text">Категория "<strong>${escapeHtml(categoryName)}</strong>" будет отключена. Товары в этой категории сохранятся.</div>`,
      saveText: "Отключить",
      cancelText: "Отмена",
      onSave: async () => {
        try {
          // Soft delete: устанавливаем is_active=0
          await api(`/api/prod_categories/${categoryId}`, {
            method: "PUT",
            body: JSON.stringify({ is_active: 0 }),
          });
          // Удаляем из списка
          state.categories = state.categories.filter((c) => c.id !== categoryId);
          state.selectedCategoryId = null;
          await refreshAll();
          showDetailsEmpty();
          return true;
        } catch (e) {
          const message = e && e.message ? e.message : "Не удалось отключить категорию.";
          alert(message);
          return false;
        }
      },
    });
  }

  function confirmProductDelete() {
    if (!state.selectedProductId || !window.AppModal) return;
    const productId = state.selectedProductId;
    const product = state.products.find((p) => p.id === productId);
    const productName = product ? product.name : "товар";
    
    window.AppModal.open({
      title: "Удалить товар?",
      content: `<div class="modal-text">Товар "<strong>${escapeHtml(productName)}</strong>" будет удален. Данные о товаре в заказах сохранятся для отчетов.</div>`,
      saveText: "Удалить",
      cancelText: "Отмена",
      onSave: async () => {
        try {
          await apiDeleteProduct(productId);
          // Удаляем из списка
          state.products = state.products.filter((p) => p.id !== productId);
          clearCachedProductView(productId);
          clearCachedProductDetails(productId);
          state.selectedProductId = null;
          clearProductSelection();
          // Перезагружаем товары для текущей категории
          await loadProducts(state.currentCategoryId, { forceReload: true });
          renderProductsList();
          return true;
        } catch (e) {
          const message = e && e.message ? e.message : "Не удалось удалить товар.";
          alert(message);
          return false;
        }
      },
    });
  }

  function closeOptionPicker() {
    state.optionPanel.level = "group";
    state.optionPanel.pickerSelection = new Set();
    renderOptionGroupLevel();
  }

  function closeOptionDetails() {
    const returnTo = state.optionPanel.returnTo;
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.optionDraft = null;
    state.optionPanel.level = "empty";
    state.optionPanel.mode = "view";
    state.optionPanel.returnTo = null;
    state.optionPanel.formSnapshot = null;
    state.optionPanel.snapshotMode = null;
    state.optionPanel.snapshotData = null;
    state.optionPanel.itemsDirty = false;
    renderAllOptionGroupsLists();
    if (returnTo && returnTo.type === "product-edit") {
      popNavigationState();
      return;
    }
    if (returnTo && returnTo.type === "product") {
      const p = state.products.find((x) => x.id === returnTo.id);
      if (p) {
        showProductDetails(p);
        return;
      }
    }
    showDetailsEmpty();
  }

  function hideAllDetailPanels() {
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.add("hidden");
    variantGroupInfo && variantGroupInfo.classList.add("hidden");
    autoAddGroupInfo && autoAddGroupInfo.classList.add("hidden");
    unitInfo && unitInfo.classList.add("hidden");
    comboInfo && comboInfo.classList.add("hidden");
    const comboSetInfo = document.getElementById("comboSetInfo");
    if (comboSetInfo) comboSetInfo.classList.add("hidden");
    const stockDocDetail = document.getElementById("stockDocDetail");
    if (stockDocDetail) stockDocDetail.classList.add("hidden");
  }

  function showDetailsEmpty() {
    const showCategory = state.mode === "categories";
    const showOption = state.mode === "options";
    const showAutoAdd = state.mode === "auto-add";
    const showUnit = state.mode === "units";
    const showCombo = state.mode === "combo-blocks";
    const showStock = state.mode === "stock-in" || state.mode === "stock-out" || state.mode === "stock-movements";
    hideAllDetailPanels();
    if (productInfoBody) {
      productInfoBody.querySelectorAll(".product-editor-wrapper").forEach((wrapper) => wrapper.classList.add("hidden"));
    }
    if (productInfoHeader) productInfoHeader.classList.add("hidden");
    setHeaderMode("product");
    if (productEmpty) productEmpty.classList.toggle("hidden", showCategory || showOption || showAutoAdd || showUnit || showCombo || showStock);
    if (categoryEmpty) categoryEmpty.classList.toggle("hidden", !showCategory);
    if (optionEmpty) optionEmpty.classList.toggle("hidden", !showOption);
    if (autoAddEmpty) autoAddEmpty.classList.toggle("hidden", !showAutoAdd);
    if (comboEmpty) comboEmpty.classList.toggle("hidden", !showCombo);
    if (stockDocEmpty) stockDocEmpty.classList.toggle("hidden", !showStock);
    if (editProductBtn && (showOption || showAutoAdd || showUnit || showCombo || showStock)) editProductBtn.classList.add("hidden");
    hideProductFooter();
    closeSheet();
  }

  function setComboSetFormReadOnly(readOnly) {
    const comboSetInfo = document.getElementById("comboSetInfo");
    const ids = ["comboSetTitle", "comboSetDescription", "comboSetDiscount", "comboSetSortOrder", "comboSetIsActive"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        if (el.type === "checkbox") el.disabled = readOnly;
        else el.readOnly = readOnly;
      }
    });
    if (comboSetInfo) comboSetInfo.classList.toggle("combo-set-view-mode", readOnly);
  }

  function activateComboSetTab() {
    hideAllDetailPanels();
    if (productInfoHeader) productInfoHeader.classList.add("hidden");
    if (productEmpty) productEmpty.classList.add("hidden");
    if (comboEmpty) comboEmpty.classList.add("hidden");
    setHeaderMode("product");
    const productEditorWrapper = productInfoBody && productInfoBody.querySelector(".product-editor-wrapper");
    if (productEditorWrapper) productEditorWrapper.classList.add("hidden");
    const comboSetInfo = document.getElementById("comboSetInfo");
    if (comboSetInfo) comboSetInfo.classList.remove("hidden");
    fillComboSetFormFromState();
    renderComboSetBlocksList();
    closeComboSetBlockPicker();
    const isView = state.comboSetPanel?.mode === "view";
    setComboSetFormReadOnly(isView);
    if (isView) {
      showProductFooterView();
    } else {
      showProductFooterEdit();
      const footerCancelBtn = document.getElementById("productFooterCancelBtn");
      const footerSaveBtn = document.getElementById("productFooterSaveBtn");
      const footerDeleteBtn = document.getElementById("productFooterDeleteEditBtn");
      if (footerCancelBtn) {
        resetTwoStepButton(footerCancelBtn);
        delete footerCancelBtn.dataset.pickerType;
        delete footerCancelBtn.dataset.pickerOriginalHtml;
        footerCancelBtn.classList.remove("is-confirm");
        footerCancelBtn.classList.remove("is-fullwidth");
        footerCancelBtn.innerHTML = "<i class=\"fas fa-times\"></i>";
        footerCancelBtn.title = "Отменить";
        footerCancelBtn.setAttribute("aria-label", "Отменить");
      }
      if (footerSaveBtn) {
        footerSaveBtn.textContent = "Сохранить";
        footerSaveBtn.onclick = saveComboSet;
      }
      if (footerDeleteBtn) footerDeleteBtn.classList.remove("hidden");
    }
  }

  function openComboSetCreate() {
    state.comboSetPanel = state.comboSetPanel || {
      mode: "create",
      comboId: null,
      blocks: [],
      blockPickerOpen: false,
      blockPickerSelection: new Set(),
    };
    state.comboSetPanel.mode = "create";
    state.comboSetPanel.comboId = null;
    state.comboSetPanel.blocks = [];
    state.comboSetPanel.blockPickerOpen = false;
    state.comboSetPanel.blockPickerSelection = new Set();
    state.comboSetPanel.photos = [];
    state.comboSetPanel.activePhotoIdx = -1;
    if (state.mode === "products" && state.currentCategoryId) {
      state.comboSetPanel.categoryIds = [state.currentCategoryId];
    } else {
      state.comboSetPanel.categoryIds = [];
    }
    state.comboSetPanel.formInitialized = false;
    const tabId = "new-combo-set-" + Date.now();
    ensureTab({
      type: "combo-set",
      id: tabId,
      title: "Новый комбо-набор",
      onActivate: activateComboSetTab,
      activate: true,
    });
  }

  async function openComboSetView(comboId, { forceReload = false } = {}) {
    const id = Number(comboId);
    if (!Number.isFinite(id)) return;
    if (forceReload) {
      clearCachedComboSetDetails(id);
      clearCachedComboRowPhotos(id);
    }
    const tabKey = buildTabKey("combo-set", String(id));
    if (
      !forceReload &&
      tabsState.activeKey === tabKey &&
      state.comboSetPanel?.mode === "view" &&
      Number(state.comboSetPanel?.comboId) === id
    ) {
      return;
    }
    try {
      let combo = null;
      let blocks = [];
      const cached = !forceReload ? getCachedComboSetDetails(id) : null;
      if (cached?.combo) {
        combo = cached.combo;
        blocks = Array.isArray(cached.blocks) ? cached.blocks : [];
      } else {
        const [comboRes, blocksRes] = await Promise.all([
          apiGetCombo(id),
          apiGetComboSetBlocks(id),
        ]);
        combo = comboRes?.data;
        if (!combo) return;
        const blocksRows = Array.isArray(blocksRes?.data) ? blocksRes.data : [];
        blocks = blocksRows.map((r) => ({
          block_id: r.block_id,
          block_title: r.block_title,
          sort_order: r.sort_order ?? 0,
        }));
        setCachedComboSetDetails(id, { combo, blocks });
      }
      if (!combo) return;
      state.comboSetPanel = state.comboSetPanel || {};
      state.comboSetPanel.mode = "view";
      state.comboSetPanel.comboId = id;
      state.comboSetPanel.combo = combo;
      state.comboSetPanel.blocks = blocks;
      state.comboSetPanel.blockPickerOpen = false;
      state.comboSetPanel.blockPickerSelection = new Set();
      state.comboSetPanel.photos = combo.image_url ? [{ kind: "url", url: String(combo.image_url).trim() }] : [];
      state.comboSetPanel.activePhotoIdx = state.comboSetPanel.photos.length ? 0 : -1;
      const code = (combo.category_code || "").trim();
      const catByCode = state.categories.find((c) => String(c.code || "").trim() === code);
      state.comboSetPanel.categoryIds = catByCode ? [Number(catByCode.id)] : [];
      state.comboSetPanel.formInitialized = true;
      ensureTab({
        type: "combo-set",
        id: String(id),
        title: (combo.title || "").trim() || "Комбо",
        onActivate: activateComboSetTab,
        activate: true,
      });
    } catch (e) {
      console.error("openComboSetView", e);
      if (typeof toast !== "undefined") toast("Ошибка загрузки комбо-набора");
    }
  }

  async function openComboSetEdit(comboId, { forceReload = false } = {}) {
    const id = Number(comboId);
    if (!Number.isFinite(id)) return;
    if (forceReload) {
      clearCachedComboSetDetails(id);
      clearCachedComboRowPhotos(id);
    }
    try {
      let combo = null;
      let blocks = [];
      const cached = !forceReload ? getCachedComboSetDetails(id) : null;
      if (cached?.combo) {
        combo = cached.combo;
        blocks = Array.isArray(cached.blocks) ? cached.blocks : [];
      } else {
        const [comboRes, blocksRes] = await Promise.all([
          apiGetCombo(id),
          apiGetComboSetBlocks(id),
        ]);
        combo = comboRes?.data;
        if (!combo) return;
        const blocksRows = Array.isArray(blocksRes?.data) ? blocksRes.data : [];
        blocks = blocksRows.map((r) => ({
          block_id: r.block_id,
          block_title: r.block_title,
          sort_order: r.sort_order ?? 0,
        }));
        setCachedComboSetDetails(id, { combo, blocks });
      }
      if (!combo) return;
      state.comboSetPanel = state.comboSetPanel || {};
      state.comboSetPanel.mode = "edit";
      state.comboSetPanel.comboId = id;
      state.comboSetPanel.combo = combo;
      state.comboSetPanel.blocks = blocks;
      state.comboSetPanel.blockPickerOpen = false;
      state.comboSetPanel.blockPickerSelection = new Set();
      state.comboSetPanel.photos = combo.image_url ? [{ kind: "url", url: String(combo.image_url).trim() }] : [];
      state.comboSetPanel.activePhotoIdx = state.comboSetPanel.photos.length ? 0 : -1;
      const code = (combo.category_code || "").trim();
      const catByCode = state.categories.find((c) => String(c.code || "").trim() === code);
      state.comboSetPanel.categoryIds = catByCode ? [Number(catByCode.id)] : [];
      state.comboSetPanel.formInitialized = true;
      ensureTab({
        type: "combo-set",
        id: String(id),
        title: (combo.title || "").trim() || "Комбо",
        onActivate: activateComboSetTab,
        activate: true,
      });
    } catch (e) {
      console.error("openComboSetEdit", e);
      if (typeof toast !== "undefined") toast("Ошибка загрузки комбо-набора");
    }
  }

  function fillComboSetFormFromState() {
    const titleEl = document.getElementById("comboSetTitle");
    const descEl = document.getElementById("comboSetDescription");
    const discountEl = document.getElementById("comboSetDiscount");
    const sortEl = document.getElementById("comboSetSortOrder");
    const activeEl = document.getElementById("comboSetIsActive");
    if (state.comboSetPanel.mode === "create" || !state.comboSetPanel.comboId) {
      if (!state.comboSetPanel.formInitialized) {
        if (titleEl) titleEl.value = "";
        if (descEl) descEl.value = "";
        if (discountEl) discountEl.value = "0";
        if (sortEl) sortEl.value = "0";
        if (activeEl) activeEl.checked = true;
        state.comboSetPanel.photos = [];
        state.comboSetPanel.activePhotoIdx = -1;
        state.comboSetPanel.categoryIds = [];
        state.comboSetPanel.formInitialized = true;
      } else {
        state.comboSetPanel.categoryIds = state.comboSetPanel.categoryIds ?? [];
        state.comboSetPanel.photos = state.comboSetPanel.photos ?? [];
        state.comboSetPanel.activePhotoIdx = typeof state.comboSetPanel.activePhotoIdx === "number" ? state.comboSetPanel.activePhotoIdx : -1;
      }
      renderComboSetPhotos();
      renderComboSetCategoryChips();
      return;
    }
    const combo = state.comboSetPanel.combo || {};
    if (titleEl) titleEl.value = combo.title ?? "";
    if (descEl) descEl.value = combo.description ?? "";
    if (discountEl) discountEl.value = combo.discount_percent ?? 0;
    if (sortEl) sortEl.value = combo.sort_order ?? 0;
    if (activeEl) activeEl.checked = combo.is_active !== 0;
    const url = combo.image_url ? String(combo.image_url).trim() : "";
    state.comboSetPanel.photos = url ? [{ kind: "url", url }] : [];
    state.comboSetPanel.activePhotoIdx = state.comboSetPanel.photos.length ? 0 : -1;
    const code = (combo.category_code || "").trim();
    const cat = state.categories.find((c) => String(c.code || "").trim() === code);
    state.comboSetPanel.categoryIds = cat ? [Number(cat.id)] : [];
    renderComboSetPhotos();
    renderComboSetCategoryChips();
  }

  function refreshComboSetBlockCardPrices() {
    const discountEl = document.getElementById("comboSetDiscount");
    const discountPercent = Number(discountEl?.value) || 0;
    const listEl = document.getElementById("comboSetBlocksList");
    if (!listEl) return;
    listEl.querySelectorAll(".combo-set-price-cell").forEach((cell) => {
      const priceEl = cell.querySelector(".combo-block-product-price");
      const oldEl = cell.querySelector(".combo-set-price-old");
      const basePrice = priceEl ? Number(priceEl.dataset.basePrice) : (oldEl ? Number(oldEl.dataset.basePrice) : NaN);
      if (!Number.isFinite(basePrice)) return;
      const oldStr = formatPriceInteger(basePrice) + " Р";
      const newNum = discountPercent > 0 ? basePrice * (1 - discountPercent / 100) : basePrice;
      const newStr = formatPriceInteger(Math.round(newNum)) + " Р";
      const productId = priceEl?.dataset?.productId ?? "";
      if (discountPercent > 0) {
        cell.innerHTML = `<span class="combo-set-price-wrap"><span class="combo-set-price-old" data-base-price="${basePrice}">${oldStr}</span> <span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${basePrice}">${newStr}</span></span>`;
      } else {
        cell.innerHTML = `<span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${basePrice}">${oldStr}</span>`;
      }
    });
  }

  function getComboSetFormPayload() {
    const titleEl = document.getElementById("comboSetTitle");
    const descEl = document.getElementById("comboSetDescription");
    const discountEl = document.getElementById("comboSetDiscount");
    const sortEl = document.getElementById("comboSetSortOrder");
    const activeEl = document.getElementById("comboSetIsActive");
    const photos = state.comboSetPanel?.photos ?? [];
    const firstUrl = photos.length && photos[0].url ? photos[0].url : null;
    const categoryIds = state.comboSetPanel?.categoryIds ?? [];
    const firstCat = categoryIds.length ? state.categories.find((c) => Number(c.id) === Number(categoryIds[0])) : null;
    const categoryCode = firstCat ? (firstCat.code || null) : null;
    return {
      title: titleEl?.value?.trim() ?? "",
      description: descEl?.value?.trim() || null,
      discount_percent: Number(discountEl?.value) || 0,
      category_code: categoryCode,
      image_url: firstUrl,
      sort_order: Number(sortEl?.value) || 0,
      is_active: activeEl?.checked ? 1 : 0,
    };
  }

  function buildComboSetPhotoGridHtml(urls) {
    const four = Array(4).fill(null).map((_, i) => urls[i] || null);
    return `<div class="combo-set-photo-grid" aria-hidden="true">${four.map((url) => {
      if (url && String(url).trim()) return `<div class="combo-set-photo-grid-cell"><img src="${escapeHtml(url)}" alt="" /></div>`;
      return `<div class="combo-set-photo-grid-cell combo-set-photo-grid-cell-empty"></div>`;
    }).join("")}</div><small class="combo-set-photo-grid-hint">Перетащите файлы сюда</small>`;
  }

  async function loadComboSetFirstFourBlockPhotos() {
    const blocks = (state.comboSetPanel?.blocks ?? []).slice(0, 4);
    const urls = [];
    for (const b of blocks) {
      const blockId = Number(b.block_id);
      if (!Number.isFinite(blockId)) { urls.push(null); continue; }
      try {
        const res = await apiGetComboBlock(blockId);
        const products = Array.isArray(res?.data?.products) ? res.data.products : [];
        const first = products[0];
        const photo = first && (first.product_photo != null) ? String(first.product_photo).trim() : null;
        urls.push(photo || null);
      } catch (e) {
        urls.push(null);
      }
    }
    while (urls.length < 4) urls.push(null);
    return urls.slice(0, 4);
  }

  async function getFirstFourBlockPhotosForCombo(comboId) {
    if (!Number.isFinite(comboId)) return [null, null, null, null];
    const cached = getCachedComboRowPhotos(comboId);
    if (cached) return cached;
    try {
      const blocksRes = await apiGetComboSetBlocks(comboId);
      const blocks = Array.isArray(blocksRes?.data) ? blocksRes.data : [];
      const firstFour = blocks.slice(0, 4);
      const urls = [];
      for (const b of firstFour) {
        const blockId = Number(b.block_id);
        if (!Number.isFinite(blockId)) { urls.push(null); continue; }
        try {
          const res = await apiGetComboBlock(blockId);
          const products = Array.isArray(res?.data?.products) ? res.data.products : [];
          const first = products[0];
          const photo = first && (first.product_photo != null) ? String(first.product_photo).trim() : null;
          urls.push(photo || null);
        } catch (e) {
          urls.push(null);
        }
      }
      while (urls.length < 4) urls.push(null);
      const normalized = urls.slice(0, 4);
      setCachedComboRowPhotos(comboId, normalized);
      return normalized;
    } catch (e) {
      return [null, null, null, null];
    }
  }

  function buildComboRowPhotoGridHtml(urls) {
    const four = Array(4).fill(null).map((_, i) => urls[i] || null);
    return four.map((url) => {
      if (url && String(url).trim()) return `<div class="combo-row-photo-grid-cell"><img src="${escapeHtml(url)}" alt="" /></div>`;
      return `<div class="combo-row-photo-grid-cell combo-row-photo-grid-cell-empty"></div>`;
    }).join("");
  }

  function formatComboSetFileSize(bytes) {
    if (!bytes || bytes <= 0) return "";
    if (bytes < 1024) return String(bytes) + " B";
    const kb = bytes / 1024;
    if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  function isComboSetImageFile(file) {
    if (!file) return false;
    const mime = String(file.type || "").toLowerCase();
    if (mime.startsWith("image/")) return true;
    const name = String(file.name || "").toLowerCase();
    return /\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif)$/i.test(name);
  }

  function pickComboSetImageFiles(input) {
    return Array.from(input || []).filter((f) => isComboSetImageFile(f));
  }

  async function extractComboSetImagesFromDataTransfer(dt) {
    try {
      if (!dt) return [];
      const direct = pickComboSetImageFiles(dt.files || []);
      if (direct.length) return direct;
      const rawFiles = Array.from(dt.files || []).filter((f) => f && Number(f.size) > 0);
      if (rawFiles.length) return rawFiles;
      const items = Array.from(dt.items || []);
      const itemFiles = items.map((it) => it && it.getAsFile && it.getAsFile()).filter((f) => isComboSetImageFile(f));
      return itemFiles;
    } catch {
      return [];
    }
  }

  function extractComboSetImagesFromClipboard(cb) {
    try {
      if (!cb) return [];
      const direct = pickComboSetImageFiles(cb.files || []);
      if (direct.length) return direct;
      const items = Array.from(cb.items || []);
      return items.map((it) => it && it.getAsFile && it.getAsFile()).filter((f) => isComboSetImageFile(f));
    } catch {
      return [];
    }
  }

  let comboSetPhotoUploadSeq = 0;
  async function addComboSetFilesAndUploadNow(files) {
    if (!state.comboSetPanel) return;
    const photos = state.comboSetPanel.photos || (state.comboSetPanel.photos = []);
    const canAdd = Math.max(0, 1 - photos.length);
    const selected = pickComboSetImageFiles(files).slice(0, canAdd);
    if (!selected.length) return;

    const placeholders = selected.map((f) => {
      const preview = URL.createObjectURL(f);
      return {
        kind: "file",
        file: f,
        preview,
        fileSize: Number(f.size || 0),
        __uploading: true,
        __uploadKey: `combo_up_${Date.now()}_${comboSetPhotoUploadSeq++}`,
      };
    });
    placeholders.forEach((ph) => photos.push(ph));
    if (state.comboSetPanel.activePhotoIdx < 0) state.comboSetPanel.activePhotoIdx = 0;
    renderComboSetPhotos();

    try {
      const uploadResult = await apiUploadImages(selected);
      const urls = Array.isArray(uploadResult?.urls) ? uploadResult.urls : [];
      const sizes = Array.isArray(uploadResult?.sizes) ? uploadResult.sizes : [];
      placeholders.forEach((ph, idx) => {
        const at = photos.findIndex((x) => x && x.__uploadKey === ph.__uploadKey);
        if (at < 0) return;
        const url = urls[idx];
        if (!url) {
          photos.splice(at, 1);
          try { URL.revokeObjectURL(ph.preview); } catch {}
          return;
        }
        photos[at] = {
          kind: "url",
          url,
          fileSize: Number(sizes[idx]) > 0 ? Number(sizes[idx]) : (ph.fileSize || 0),
        };
        try { URL.revokeObjectURL(ph.preview); } catch {}
      });
      if (!photos.length) state.comboSetPanel.activePhotoIdx = -1;
      else if (state.comboSetPanel.activePhotoIdx < 0 || state.comboSetPanel.activePhotoIdx >= photos.length) state.comboSetPanel.activePhotoIdx = 0;
      renderComboSetPhotos();
    } catch {
      placeholders.forEach((ph) => {
        const at = photos.findIndex((x) => x && x.__uploadKey === ph.__uploadKey);
        if (at >= 0) photos.splice(at, 1);
        try { URL.revokeObjectURL(ph.preview); } catch {}
      });
      if (!photos.length) state.comboSetPanel.activePhotoIdx = -1;
      renderComboSetPhotos();
      if (typeof toast !== "undefined") toast("\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438 \u0444\u043e\u0442\u043e");
    }
  }

  let comboSetPhotoModalEscHandler = null;
  let comboSetPhotoModalPasteHandler = null;
  function closeComboSetPhotoModal() {
    const open = document.querySelectorAll(".product-photo-grid-modal-overlay[data-combo-photo-modal='1']");
    open.forEach((el) => el.remove());
    if (comboSetPhotoModalEscHandler) {
      document.removeEventListener("keydown", comboSetPhotoModalEscHandler);
      comboSetPhotoModalEscHandler = null;
    }
    if (comboSetPhotoModalPasteHandler) {
      document.removeEventListener("paste", comboSetPhotoModalPasteHandler);
      comboSetPhotoModalPasteHandler = null;
    }
  }

  function openComboSetPhotoGridModal() {
    if (!state.comboSetPanel) return;
    closeComboSetPhotoModal();
    const isView = state.comboSetPanel.mode === "view";
    const overlay = document.createElement("div");
    overlay.className = "product-photo-grid-modal-overlay";
    overlay.setAttribute("data-combo-photo-modal", "1");
    const card = document.createElement("div");
    card.className = "product-photo-grid-modal-card";
    card.innerHTML = `
      <div class="product-photo-grid-modal-head">
        <div class="product-photo-grid-modal-title">\u0424\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438 \u043a\u043e\u043c\u0431\u043e</div>
        <button type="button" class="product-photo-grid-modal-close" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c"><i class="fas fa-times"></i></button>
      </div>
      <div class="product-photo-grid-modal-body">
        <div class="product-photo-grid-modal-grid"></div>
      </div>
      <div class="product-photo-grid-modal-foot">
        <button type="button" class="btn" data-role="close">\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>
      </div>
    `;
    const grid = card.querySelector(".product-photo-grid-modal-grid");
    const modalFileInput = document.createElement("input");
    modalFileInput.type = "file";
    modalFileInput.accept = "image/*";
    modalFileInput.multiple = true;
    modalFileInput.className = "hidden";
    card.appendChild(modalFileInput);
    const modalBody = card.querySelector(".product-photo-grid-modal-body");
    if (modalBody) {
      const dropHint = document.createElement("div");
      dropHint.className = "product-photo-grid-modal-drop-hint";
      dropHint.textContent = "\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u043e\u0442\u043e \u0441\u044e\u0434\u0430 \u0438\u043b\u0438 \u043e\u0442\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0434\u043b\u044f \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438";
      modalBody.appendChild(dropHint);
    }
    const extractModalDropFiles = async (dt) => {
      try {
        if (!dt) return [];
        const dtFiles = Array.from(dt.files || []);
        if (dtFiles.length) return dtFiles;
        return await extractComboSetImagesFromDataTransfer(dt);
      } catch {
        return [];
      }
    };
    let clearFileDragState = () => {};
    const renderGrid = () => {
      if (!grid || !state.comboSetPanel) return;
      const photos = state.comboSetPanel.photos || [];
      const photosHtml = photos.map((ph, idx) => {
        const src = ph && ph.kind === "file" ? ph.preview : ph?.url;
        if (!src) return `<div class="product-photo-grid-modal-tile is-empty"></div>`;
        const localSize = ph && ph.kind === "file" && ph.file && Number(ph.file.size) > 0 ? Number(ph.file.size) : 0;
        const resolvedSize = Number(ph?.fileSize) > 0 ? Number(ph.fileSize) : localSize;
        const sizeLabel = resolvedSize > 0 ? formatComboSetFileSize(resolvedSize) : "";
        const removeBtn = isView ? "" : `<button type="button" class="product-photo-grid-modal-remove" data-role="remove-photo" data-photo-idx="${idx}" aria-label="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u043e\u0442\u043e"><i class="fas fa-times"></i></button>`;
        const dragAttr = isView ? "" : ` draggable="true"`;
        return `
          <div class="product-photo-grid-modal-item" data-photo-idx="${idx}"${dragAttr}>
            <div class="product-photo-grid-modal-tile">
              <img src="${escapeHtml(String(src))}" alt="">
              ${removeBtn}
            </div>
            <div class="product-photo-grid-modal-size">${escapeHtml(sizeLabel)}</div>
          </div>
        `;
      }).join("");
      const canAddMore = photos.length < 1;
      const addTileHtml = (!isView && canAddMore) ? `<button type="button" class="product-photo-grid-modal-tile product-photo-grid-modal-tile--add" data-role="add-photo" aria-label="\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0444\u043e\u0442\u043e"><i class="fas fa-plus"></i></button>` : "";
      grid.innerHTML = photosHtml + addTileHtml;
    };

    const onClose = () => closeComboSetPhotoModal();
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    renderGrid();
    card.querySelector(".product-photo-grid-modal-close")?.addEventListener("click", onClose);
    card.querySelector('[data-role="close"]')?.addEventListener("click", onClose);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) onClose(); });
    if (!isView) {
      let externalDragDepth = 0;
      const hasExternalFilePayload = (dt) => {
        if (!dt) return false;
        const types = Array.from(dt.types || []).map((t) => String(t));
        if (dt.files && dt.files.length > 0) return true;
        return (
          types.includes("Files") ||
          types.includes("application/x-moz-file") ||
          types.includes("public.file-url")
        );
      };
      const setFileDragState = (active) => {
        card.classList.toggle("is-file-drag-over", !!active);
      };
      clearFileDragState = () => {
        externalDragDepth = 0;
        setFileDragState(false);
      };
      const onFileDragEnter = (e) => {
        if (!hasExternalFilePayload(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        externalDragDepth += 1;
        setFileDragState(true);
      };
      const onFileDragOver = (e) => {
        if (!hasExternalFilePayload(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        setFileDragState(true);
      };
      const onFileDragLeave = (e) => {
        if (!hasExternalFilePayload(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        externalDragDepth = Math.max(0, externalDragDepth - 1);
        if (!externalDragDepth) setFileDragState(false);
      };
      const onFileDrop = async (e) => {
        if (!hasExternalFilePayload(e.dataTransfer)) return;
        e.preventDefault();
        e.stopPropagation();
        clearFileDragState();
        try {
          const files = await extractModalDropFiles(e.dataTransfer);
          if (!files.length) return;
          await addComboSetFilesAndUploadNow(files);
          renderGrid();
        } catch {}
      };
      overlay.addEventListener("dragenter", onFileDragEnter, true);
      card.addEventListener("dragenter", onFileDragEnter, true);
      overlay.addEventListener("dragover", onFileDragOver);
      card.addEventListener("dragover", onFileDragOver);
      overlay.addEventListener("dragleave", onFileDragLeave, true);
      card.addEventListener("dragleave", onFileDragLeave, true);
      overlay.addEventListener("drop", onFileDrop);
      card.addEventListener("drop", onFileDrop);
    }
    if (!isView && grid) {
      let dragPhotoIdx = -1;
      let dragOverIdx = -1;
      grid.addEventListener("dragstart", (e) => {
        const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
        if (!item) return;
        const idx = Number(item.getAttribute("data-photo-idx"));
        if (!Number.isFinite(idx) || idx < 0) return;
        dragPhotoIdx = idx;
        item.classList.add("is-dragging");
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", String(idx));
        }
      });
      grid.addEventListener("dragover", (e) => {
        if (dragPhotoIdx < 0) {
          const hasExternalPayload =
            (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) ||
            (e.dataTransfer && e.dataTransfer.types && (
              Array.from(e.dataTransfer.types).includes("Files") ||
              Array.from(e.dataTransfer.types).includes("text/uri-list") ||
              Array.from(e.dataTransfer.types).includes("text/html") ||
              Array.from(e.dataTransfer.types).includes("text/plain")
            ));
          if (hasExternalPayload) e.preventDefault();
          return;
        }
        const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
        if (!item) return;
        const idx = Number(item.getAttribute("data-photo-idx"));
        if (!Number.isFinite(idx) || idx < 0 || idx === dragPhotoIdx) return;
        e.preventDefault();
        dragOverIdx = idx;
        item.classList.add("is-drop-target");
      });
      grid.addEventListener("dragleave", (e) => {
        const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
        if (!item) return;
        item.classList.remove("is-drop-target");
      });
      grid.addEventListener("drop", async (e) => {
        if (dragPhotoIdx < 0) {
          e.preventDefault();
          e.stopPropagation();
          clearFileDragState();
          try {
            const files = await extractModalDropFiles(e.dataTransfer);
            if (!files.length) return;
            await addComboSetFilesAndUploadNow(files);
            renderGrid();
          } catch {}
          return;
        }
        const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
        if (!state.comboSetPanel) return;
        const photos = state.comboSetPanel.photos || [];
        let dropIdx = item ? Number(item.getAttribute("data-photo-idx")) : -1;
        if ((!Number.isFinite(dropIdx) || dropIdx < 0) && Number.isFinite(dragOverIdx) && dragOverIdx >= 0) {
          dropIdx = dragOverIdx;
        }
        if (!Number.isFinite(dropIdx) || dropIdx < 0) {
          const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
          if (target) {
            const at = Number(target.getAttribute("data-photo-idx"));
            if (Number.isFinite(at) && at >= 0) dropIdx = at;
          }
        }
        if (item) item.classList.remove("is-drop-target");
        if (!Number.isFinite(dragPhotoIdx) || dragPhotoIdx < 0 || !Number.isFinite(dropIdx) || dropIdx < 0 || dropIdx === dragPhotoIdx) return;
        e.preventDefault();
        const [moved] = photos.splice(dragPhotoIdx, 1);
        photos.splice(dropIdx, 0, moved);
        if (state.comboSetPanel.activePhotoIdx === dragPhotoIdx) {
          state.comboSetPanel.activePhotoIdx = dropIdx;
        } else if (state.comboSetPanel.activePhotoIdx === dropIdx) {
          state.comboSetPanel.activePhotoIdx = dragPhotoIdx;
        } else if (dragPhotoIdx < state.comboSetPanel.activePhotoIdx && dropIdx >= state.comboSetPanel.activePhotoIdx) {
          state.comboSetPanel.activePhotoIdx--;
        } else if (dragPhotoIdx > state.comboSetPanel.activePhotoIdx && dropIdx <= state.comboSetPanel.activePhotoIdx) {
          state.comboSetPanel.activePhotoIdx++;
        }
        dragPhotoIdx = -1;
        renderComboSetPhotos();
        renderGrid();
      });
      grid.addEventListener("dragend", () => {
        dragPhotoIdx = -1;
        dragOverIdx = -1;
        clearFileDragState();
        grid.querySelectorAll(".product-photo-grid-modal-item.is-dragging").forEach((el) => el.classList.remove("is-dragging"));
        grid.querySelectorAll(".product-photo-grid-modal-item.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
      });
    }
    card.addEventListener("click", (e) => {
      if (isView || !state.comboSetPanel) return;
      const removeBtn = e.target.closest?.('[data-role="remove-photo"]');
      if (removeBtn) {
        const idx = Number(removeBtn.getAttribute("data-photo-idx"));
        const photos = state.comboSetPanel.photos || [];
        if (Number.isFinite(idx) && idx >= 0 && idx < photos.length) {
          const removed = photos.splice(idx, 1);
          if (removed[0] && removed[0].kind === "file") {
            try { URL.revokeObjectURL(removed[0].preview); } catch {}
          }
          state.comboSetPanel.activePhotoIdx = photos.length ? 0 : -1;
          renderComboSetPhotos();
          renderGrid();
        }
        return;
      }
      if (e.target.closest?.('[data-role="add-photo"]')) {
        modalFileInput.click();
      }
    });
    if (!isView) {
      modalFileInput.addEventListener("change", async () => {
        if (modalFileInput.files && modalFileInput.files.length) {
          await addComboSetFilesAndUploadNow(modalFileInput.files);
          renderGrid();
        }
        modalFileInput.value = "";
      });
      comboSetPhotoModalPasteHandler = async (e) => {
        const files = extractComboSetImagesFromClipboard(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        await addComboSetFilesAndUploadNow(files);
        renderGrid();
      };
      document.addEventListener("paste", comboSetPhotoModalPasteHandler);
    }
    comboSetPhotoModalEscHandler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", comboSetPhotoModalEscHandler);
  }

  function renderComboSetPhotos() {
    const photos = state.comboSetPanel?.photos ?? [];
    const activeIdx = typeof state.comboSetPanel?.activePhotoIdx === "number" ? state.comboSetPanel.activePhotoIdx : -1;
    const total = Math.min(photos.length, 1);
    const mainEl = document.getElementById("comboSetPhotoMain");
    const placeholderEl = document.getElementById("comboSetPhotoPlaceholder");
    const prevBtn = document.getElementById("comboSetPhotoPrev");
    const nextBtn = document.getElementById("comboSetPhotoNext");
    const dotsEl = document.getElementById("comboSetPhotoDots");
    const thumbsEl = document.getElementById("comboSetPhotoThumbs");
    const thumbsWrapper = document.getElementById("comboSetPhotoThumbsWrapper");
    const counterEl = document.getElementById("comboSetPhotosCounter");
    if (counterEl) counterEl.textContent = total + "/1";
    if (!total) {
      if (mainEl) { mainEl.src = ""; mainEl.classList.add("hidden"); }
      if (placeholderEl) {
        placeholderEl.classList.remove("hidden");
        const blocks = (state.comboSetPanel?.blocks ?? []).slice(0, 4);
        const urls = blocks.map(() => null);
        placeholderEl.innerHTML = buildComboSetPhotoGridHtml(urls);
        loadComboSetFirstFourBlockPhotos().then((urls) => {
          const el = document.getElementById("comboSetPhotoPlaceholder");
          if (el && state.comboSetPanel?.photos?.length === 0) el.innerHTML = buildComboSetPhotoGridHtml(urls);
        });
      }
      if (prevBtn) prevBtn.classList.add("hidden");
      if (nextBtn) nextBtn.classList.add("hidden");
      if (dotsEl) dotsEl.classList.add("hidden");
      if (thumbsWrapper) thumbsWrapper.classList.add("hidden");
      if (thumbsEl) thumbsEl.innerHTML = "";
      return;
    }
    const active = photos[activeIdx >= 0 && activeIdx < total ? activeIdx : 0];
    const src = active.kind === "url" ? active.url : (active.preview || "");
    if (mainEl) { mainEl.src = src; mainEl.classList.remove("hidden"); }
    if (placeholderEl) placeholderEl.classList.add("hidden");
    const showNav = total > 1;
    if (prevBtn) prevBtn.classList.toggle("hidden", !showNav);
    if (nextBtn) nextBtn.classList.toggle("hidden", !showNav);
    if (dotsEl) { dotsEl.classList.toggle("hidden", !showNav); dotsEl.innerHTML = photos.slice(0, 1).map((_, i) => `<span class="photo-dot ${i === (activeIdx >= 0 ? activeIdx : 0) ? "is-active" : ""}" data-combo-set-dot="${i}"></span>`).join(""); }
    if (thumbsEl) {
      thumbsEl.innerHTML = photos.slice(0, 1).map((p, i) => {
        const s = (p.kind === "url" ? p.url : (p.preview || "")).replace(/'/g, "\\'");
        return `<div class="img-thumb ${i === (activeIdx >= 0 ? activeIdx : 0) ? "is-active" : ""}" data-combo-set-thumb="${i}" style="background-image:url('${s}')"></div>`;
      }).join("");
    }
    if (thumbsWrapper) thumbsWrapper.classList.toggle("hidden", total === 0);
  }

  let comboSetCategoryPickerSelection = null;
  let comboSetCategoryPickerSavedFooterState = null;
  let comboSetCategoryPickerSavedHandlers = null;

  function renderComboSetCategoryChips() {
    const chipsEl = document.getElementById("comboSetCategoryChips");
    if (!chipsEl) return;
    const categoryIds = state.comboSetPanel?.categoryIds ?? [];
    const list = categoryIds
      .map((id) => state.categories.find((c) => Number(c.id) === Number(id)))
      .filter(Boolean)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
      .filter((c) => c.code !== "all");
    const chips = list
      .map((c) => `
        <span class="chip">
          ${escapeHtml(c.title || "")}
          <button class="chip-remove" type="button" data-combo-set-cat-remove="${c.id}">
            <i class="fas fa-times"></i>
          </button>
        </span>
      `)
      .join("");
    chipsEl.innerHTML = chips + '<button type="button" class="chip chip-plus" id="comboSetCategoryChipPlus"><i class="fas fa-plus"></i></button>';
    chipsEl.querySelectorAll("[data-combo-set-cat-remove]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.getAttribute("data-combo-set-cat-remove"));
        if (!Number.isFinite(id)) return;
        const arr = state.comboSetPanel.categoryIds || [];
        const idx = arr.indexOf(id);
        if (idx !== -1) arr.splice(idx, 1);
        renderComboSetCategoryChips();
      });
    });
    const plus = document.getElementById("comboSetCategoryChipPlus");
    if (plus) plus.addEventListener("click", () => openComboSetCategoryPicker());
  }

  function closeComboSetCategoryPicker() {
    // Восстанавливает футер после пикера категорий. saveBtn.onclick = saveComboSet.
    // Критично: addEventListener на Save должен вызывать stopImmediatePropagation при pickerType=category,
    // иначе этот restore произойдёт до завершения клика и saveComboSet закроет всю карточку.
    comboSetCategoryPickerSelection = null;
    const panel = document.getElementById("productInfoPanel");
    if (panel) {
      const overlay = panel.querySelector("#comboSetCategoryPickerOverlay");
      if (overlay) overlay.remove();
    }
    const cancelBtn = document.getElementById("productFooterCancelBtn");
    const saveBtn = document.getElementById("productFooterSaveBtn");
    if (cancelBtn) delete cancelBtn.dataset.pickerType;
    if (saveBtn) delete saveBtn.dataset.pickerType;
    delete window._closeComboSetCategoryPickerFn;
    delete window._saveComboSetCategoryPickerFn;
    const footer = document.getElementById("productInfoFooter");
    const footerView = document.getElementById("productFooterView");
    const footerEditMode = document.getElementById("productFooterEditMode");
    const footerDeleteBtn = document.getElementById("productFooterDeleteEditBtn");
    const footerMoreBtn = document.getElementById("productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && cancelBtn && saveBtn && comboSetCategoryPickerSavedFooterState) {
      if (comboSetCategoryPickerSavedFooterState.footerHidden) footer.classList.add("hidden");
      else footer.classList.remove("hidden");
      if (comboSetCategoryPickerSavedFooterState.viewHidden) footerView.classList.add("hidden");
      else footerView.classList.remove("hidden");
      if (comboSetCategoryPickerSavedFooterState.editHidden) footerEditMode.classList.add("hidden");
      else footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.toggle("hidden", !!comboSetCategoryPickerSavedFooterState.deleteBtnHidden);
      if (footerMoreBtn) footerMoreBtn.classList.toggle("hidden", !!comboSetCategoryPickerSavedFooterState.moreBtnHidden);
      cancelBtn.classList.remove("is-fullwidth");
      if (comboSetCategoryPickerSavedFooterState.cancelBtnIsConfirm) cancelBtn.classList.add("is-confirm");
      else cancelBtn.classList.remove("is-confirm");
      if (cancelBtn.dataset.pickerOriginalHtml) { cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml; delete cancelBtn.dataset.pickerOriginalHtml; }
      cancelBtn.title = ""; cancelBtn.setAttribute("aria-label", "");
      if (comboSetCategoryPickerSavedHandlers) {
        cancelBtn.onclick = comboSetCategoryPickerSavedHandlers.cancel;
        saveBtn.onclick = comboSetCategoryPickerSavedHandlers.save;
      }
    }
    comboSetCategoryPickerSavedFooterState = null;
    comboSetCategoryPickerSavedHandlers = null;
  }

  function openComboSetCategoryPicker() {
    comboSetCategoryPickerSelection = new Set(state.comboSetPanel?.categoryIds ?? []);
    const pickerOverlay = document.createElement("div");
    pickerOverlay.className = "picker-overlay";
    pickerOverlay.id = "comboSetCategoryPickerOverlay";
    const pickerContent = document.createElement("div");
    pickerContent.className = "picker-overlay-content";
    pickerContent.innerHTML = `
      <div class="picker-overlay-header">
        <div class="panel-title">Категории</div>
      </div>
      <div class="picker-overlay-body">
        <div class="info-card">
          <div class="option-picker-search" style="margin-bottom: 16px;">
            <input class="control" id="comboSetCategoryPickerSearch" type="search" placeholder="Поиск по названию" />
          </div>
          <div class="option-picker-list" id="comboSetCategoryPickerList"></div>
        </div>
      </div>
    `;
    pickerOverlay.appendChild(pickerContent);
    const searchInput = pickerContent.querySelector("#comboSetCategoryPickerSearch");
    const listContent = pickerContent.querySelector("#comboSetCategoryPickerList");
    function renderList() {
      const query = String(searchInput?.value || "").trim().toLowerCase();
      const list = (state.categories || [])
        .slice()
        .filter((c) => !query || String(c.title || "").toLowerCase().includes(query))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
      if (!listContent) return;
      listContent.innerHTML = list.map((c) => {
        const id = Number(c.id);
        const isAll = c.code === "all";
        const checked = comboSetCategoryPickerSelection.has(id);
        const iconHtml = typeof renderCategoryIcon === "function" ? renderCategoryIcon(c.icon, "category-picker-icon") : "";
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""} ${isAll ? "is-disabled" : ""}" data-cat-id="${id}" ${isAll ? 'data-disabled="true"' : ""}>
            ${iconHtml}
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(c.title || "")}</div>
            </div>
          </div>
        `;
      }).join("");
      listContent.querySelectorAll(".option-picker-row[data-cat-id]").forEach((row) => {
        row.addEventListener("click", () => {
          if (row.dataset.disabled === "true") return;
          const id = Number(row.dataset.catId);
          if (!Number.isFinite(id)) return;
          if (comboSetCategoryPickerSelection.has(id)) comboSetCategoryPickerSelection.delete(id);
          else comboSetCategoryPickerSelection.add(id);
          renderList();
        });
      });
    }
    if (searchInput) searchInput.addEventListener("input", renderList);
    renderList();
    const panel = document.getElementById("productInfoPanel");
    if (panel) {
      const existing = panel.querySelector("#comboSetCategoryPickerOverlay");
      if (existing) existing.remove();
      panel.appendChild(pickerOverlay);
    }
    const footer = document.getElementById("productInfoFooter");
    const footerView = document.getElementById("productFooterView");
    const footerEditMode = document.getElementById("productFooterEditMode");
    const cancelBtn = document.getElementById("productFooterCancelBtn");
    const saveBtn = document.getElementById("productFooterSaveBtn");
    const footerDeleteBtn = document.getElementById("productFooterDeleteEditBtn");
    const footerMoreBtn = document.getElementById("productFooterMoreEditBtn");
    if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
      comboSetCategoryPickerSavedFooterState = {
        footerHidden: footer.classList.contains("hidden"),
        viewHidden: footerView.classList.contains("hidden"),
        editHidden: footerEditMode.classList.contains("hidden"),
        deleteBtnHidden: footerDeleteBtn ? footerDeleteBtn.classList.contains("hidden") : false,
        moreBtnHidden: footerMoreBtn ? footerMoreBtn.classList.contains("hidden") : false,
        cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm"),
      };
      // Сохраняем исходные обработчики, чтобы полностью вернуть поведение после закрытия пикера
      comboSetCategoryPickerSavedHandlers = { cancel: cancelBtn.onclick, save: saveBtn.onclick };
      footer.classList.remove("hidden");
      footerView.classList.add("hidden");
      footerEditMode.classList.remove("hidden");
      if (footerDeleteBtn) footerDeleteBtn.classList.add("hidden");
      if (footerMoreBtn) footerMoreBtn.classList.add("hidden");
      cancelBtn.classList.remove("is-confirm");
      cancelBtn.classList.add("is-fullwidth");
      if (!cancelBtn.dataset.pickerOriginalHtml) cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
      cancelBtn.textContent = "Отменить";
      cancelBtn.title = "Отменить";
      cancelBtn.setAttribute("aria-label", "Отменить");
      cancelBtn.dataset.pickerType = "category";
      saveBtn.dataset.pickerType = "category";
      window._closeComboSetCategoryPickerFn = closeComboSetCategoryPicker;
      window._saveComboSetCategoryPickerFn = () => {
        // Применяет выбранные категории в state, закрывает пикер. НЕ вызывает saveComboSet.
        // Гарантируем, что берём актуальный выбор из UI даже если
        // внутренний Set по какой‑то причине не обновился.
        let selection = comboSetCategoryPickerSelection;
        if (!selection) {
          selection = new Set();
          if (listContent) {
            listContent
              .querySelectorAll(".option-picker-row.is-selected[data-cat-id]")
              .forEach((row) => {
                const id = Number(row.dataset.catId);
                if (Number.isFinite(id)) selection.add(id);
              });
          }
        }
        state.comboSetPanel.categoryIds = Array.from(selection || []);
        renderComboSetCategoryChips();
        closeComboSetCategoryPicker();
      };
      // В режиме пикера "Отменить" только закрывает его, не трогая сохранение комбо.
      cancelBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (window._closeComboSetCategoryPickerFn) window._closeComboSetCategoryPickerFn();
      };
      // В режиме пикера "Сохранить" применяет выбранные категории и закрывает пикер, НЕ закрывая карточку комбо.
      // ВАЖНО: saveBtn.onclick ОБЯЗАТЕЛЬНО менять — иначе клик вызовет saveComboSet и закроет всё. См. addEventListener выше.
      saveBtn.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        if (window._saveComboSetCategoryPickerFn) window._saveComboSetCategoryPickerFn();
      };
    }
  }

  async function renderComboSetBlockPanelContent(panelInner, blockId) {
    if (!panelInner || !Number.isFinite(blockId)) return;
    if (panelInner.dataset.loaded === "1") return;
    panelInner.dataset.loaded = "1";
    panelInner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Загрузка…</div>";
    let blockData;
    try {
      const res = await apiGetComboBlock(blockId);
      blockData = res?.data || null;
    } catch (e) {
      panelInner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Ошибка загрузки блока</div>";
      return;
    }
    const products = Array.isArray(blockData?.products) ? blockData.products : [];
    const items = products.map((p) => ({
      product_id: p.product_id,
      name: p.product_name || `Товар #${p.product_id}`,
      sort_order: p.sort_order ?? 0,
      is_default: p.is_default ? 1 : 0,
      photo: p.product_photo || null,
      price: p.product_price ?? 0,
      has_variants: p.has_variants ? 1 : 0,
      has_changeable_composition: p.has_changeable_composition ? 1 : 0,
    }));
    if (items.length === 0) {
      panelInner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">В блоке пока нет товаров</div>";
      return;
    }
    const isViewMode = true;
    panelInner.innerHTML = "<div class=\"option-items-table combo-set-block-products-list is-view-mode\"></div>";
    const table = panelInner.querySelector(".combo-set-block-products-list");
    const discountEl = document.getElementById("comboSetDiscount");
    const discountPercent = Number(discountEl?.value) || 0;
    const getPriceHtml = (basePrice, productId) => {
      const oldNum = Number(basePrice);
      if (!Number.isFinite(oldNum)) return `<span class="combo-block-product-price" data-product-id="${productId}" data-base-price="">—</span>`;
      const newNum = discountPercent > 0 ? oldNum * (1 - discountPercent / 100) : oldNum;
      const oldStr = formatPriceInteger(oldNum) + " Р";
      const newStr = formatPriceInteger(Math.round(newNum)) + " Р";
      if (discountPercent > 0) {
        return `<span class="combo-set-price-wrap"><span class="combo-set-price-old" data-base-price="${oldNum}">${oldStr}</span> <span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${oldNum}">${newStr}</span></span>`;
      }
      return `<span class="combo-block-product-price" data-product-id="${productId}" data-base-price="${oldNum}">${oldStr}</span>`;
    };
    table.innerHTML = items.map((item, idx) => {
      const name = item.name || `Товар #${item.product_id}`;
      const defaultBadge = item.is_default ? " <span class=\"muted\">(по умолчанию)</span>" : "";
      const photoUrl = item.photo || "";
      const thumb = photoUrl ? `<img class="combo-block-product-thumb" src="${escapeHtml(photoUrl)}" alt="" />` : "<span class=\"combo-block-product-thumb combo-block-product-thumb-placeholder\"><i class=\"fas fa-image\"></i></span>";
      const basePrice = Number(item.price);
      const priceHtml = getPriceHtml(basePrice, item.product_id);
      const starBtn = isViewMode ? "" : "";
      const removeBtn = "";
      return `
        <div class="combo-block-product-row-wrapper" data-idx="${idx}">
          <div class="option-item-row combo-block-product-row" data-product-id="${item.product_id}" data-idx="${idx}">
            <button class="combo-block-product-chevron" type="button" data-combo-chevron aria-expanded="false" title="Подробнее"><i class="fas fa-chevron-down"></i></button>
            ${thumb}
            <span class="option-item-title">${escapeHtml(name)}${defaultBadge}</span>
            <span class="combo-set-price-cell">${priceHtml}</span>
            ${starBtn}
            ${removeBtn}
          </div>
          <div class="combo-block-product-details" hidden data-product-id="${item.product_id}">
            <div class="combo-block-product-details-inner"></div>
          </div>
        </div>
      `;
    }).join("");
    table.querySelectorAll("[data-combo-chevron]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const wrapper = btn.closest(".combo-block-product-row-wrapper");
        const details = wrapper?.querySelector(".combo-block-product-details");
        const inner = details?.querySelector(".combo-block-product-details-inner");
        const productId = details?.dataset?.productId ? Number(details.dataset.productId) : null;
        const wasExpanded = details?.getAttribute("hidden") == null;
        if (details) details.hidden = wasExpanded;
        if (btn) {
          btn.setAttribute("aria-expanded", wasExpanded ? "false" : "true");
          const icon = btn.querySelector("i");
          if (icon) icon.className = wasExpanded ? "fas fa-chevron-down" : "fas fa-chevron-up";
        }
        if (!wasExpanded && details) {
          requestAnimationFrame(() => {
            details.scrollIntoView({ behavior: "smooth", block: "nearest" });
          });
        }
        if (!wasExpanded && inner && Number.isFinite(productId)) {
          if (!inner.dataset.loaded) {
            inner.dataset.loaded = "1";
            inner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Загрузка…</div>";
            try {
              if (!state.unitConversions || state.unitConversions.length === 0) {
                const convRes = await apiGetUnitConversions();
                state.unitConversions = Array.isArray(convRes?.data) ? convRes.data : [];
              }
              const [productRes, variantsRes, ingredientsRes] = await Promise.all([
                apiGetProduct(productId),
                apiGetProductVariants(productId),
                apiGetProductIngredients(productId),
              ]);
              const product = productRes?.data || null;
              const variants = (variantsRes?.data && Array.isArray(variantsRes.data)) ? variantsRes.data : [];
              const ingredients = (ingredientsRes?.data && Array.isArray(ingredientsRes.data)) ? ingredientsRes.data : [];
              inner.innerHTML = buildComboBlockProductDetailsHtml(product, variants, ingredients);
              attachComboBlockProductDetailsHandlers(inner, wrapper, productId, product, variants, ingredients);
              requestAnimationFrame(() => {
                if (details) details.scrollIntoView({ behavior: "smooth", block: "nearest" });
                const accPanel = panelInner.closest("[data-acc-panel]");
                if (accPanel && accPanel.classList.contains("is-open")) accPanel.style.maxHeight = accPanel.scrollHeight + "px";
              });
            } catch (err) {
              inner.innerHTML = "<div class=\"muted\" style=\"padding:8px;\">Ошибка загрузки</div>";
            }
          }
        }
      });
    });
  }

  function renderComboSetBlocksList() {
    const listEl = document.getElementById("comboSetBlocksList");
    if (!listEl) return;
    const blocks = state.comboSetPanel?.blocks ?? [];
    listEl.innerHTML = blocks.map((b, idx) => {
      const title = (b.block_title || b.title || "").trim() || `Блок #${b.block_id}`;
      return `
        <div class="acc-item combo-set-block-acc-item" data-combo-set-block-index="${idx}" data-block-id="${b.block_id}">
          <div class="acc-header combo-set-block-acc-header">
            <button type="button" class="acc-trigger" data-acc-trigger>
              <span class="combo-set-block-trigger-text">
                <span class="option-item-title">${escapeHtml(title)}</span>
                <span class="option-item-meta">#${b.block_id}</span>
              </span>
              <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
            </button>
            <button type="button" class="btn btn-icon option-row-remove" data-remove-combo-set-block="${idx}" title="Удалить" aria-label="Удалить"><i class="fas fa-times"></i></button>
          </div>
          <div class="acc-panel" data-acc-panel>
            <div class="acc-panel-inner combo-set-block-panel-inner"></div>
          </div>
        </div>
      `;
    }).join("");
    listEl.querySelectorAll("[data-remove-combo-set-block]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute("data-remove-combo-set-block"));
        if (!Number.isFinite(idx) || idx < 0) return;
        state.comboSetPanel.blocks.splice(idx, 1);
        state.comboSetPanel.blocks.forEach((b, i) => { b.sort_order = i; });
        renderComboSetBlocksList();
      });
    });
    listEl.querySelectorAll(".combo-set-block-acc-item").forEach((item) => {
      const trigger = item.querySelector("[data-acc-trigger]");
      const panel = item.querySelector("[data-acc-panel]");
      const panelInner = panel?.querySelector(".combo-set-block-panel-inner");
      const blockId = item.dataset.blockId ? Number(item.dataset.blockId) : null;
      if (!trigger || !panel || !panelInner || !Number.isFinite(blockId)) return;
      trigger.addEventListener("click", async (e) => {
        e.stopPropagation();
        const open = !panel.classList.contains("is-open");
        if (open) {
          await renderComboSetBlockPanelContent(panelInner, blockId);
        }
        panel.classList.toggle("is-open", open);
        trigger.classList.toggle("is-open", open);
        panel.style.maxHeight = open ? panel.scrollHeight + "px" : "0px";
      });
    });
  }

  let comboSetBlockPickerOverlay = null;
  let comboSetBlockPickerSavedFooterState = null;
  let comboSetBlockPickerSavedHandlers = null;

  async function openComboSetBlockPicker() {
    state.comboSetPanel.blockPickerOpen = true;
    state.comboSetPanel.blockPickerSelection = new Set();
    let res;
    try {
      res = await apiGetComboBlocks();
    } catch (e) {
      res = { ok: false, data: [] };
    }
    const blocks = res?.ok ? (res.data || []) : [];
    state.comboSetPanel.blockPickerBlocks = blocks;

    const pickerOverlay = document.createElement("div");
    pickerOverlay.className = "picker-overlay";
    comboSetBlockPickerOverlay = pickerOverlay;

    const pickerContent = document.createElement("div");
    pickerContent.className = "picker-overlay-content";
    pickerContent.innerHTML = `
      <div class="picker-overlay-header">
        <div class="panel-title">Блоки комбо</div>
      </div>
      <div class="picker-overlay-body">
        <div class="info-card">
          <div class="option-picker-search" style="margin-bottom: 16px;">
            <input class="control" id="comboSetBlockPickerSearchInput" type="search" placeholder="Поиск по названию" />
          </div>
          <div class="option-picker-list" id="comboSetBlockPickerListContent"></div>
        </div>
      </div>
    `;
    pickerOverlay.appendChild(pickerContent);

    const searchInput = pickerContent.querySelector("#comboSetBlockPickerSearchInput");
    const listContent = pickerContent.querySelector("#comboSetBlockPickerListContent");

    function renderList() {
      const query = String(searchInput?.value || "").trim().toLowerCase();
      const blocksFiltered = (state.comboSetPanel?.blockPickerBlocks ?? []).filter(
        (b) => !query || String(b.title || "").toLowerCase().includes(query)
      );
      const selectedId = state.comboSetPanel?.blockPickerSelectedId ?? null;
      if (!listContent) return;
      if (!blocksFiltered.length) {
        listContent.innerHTML = `<div class="empty-hint">Нет блоков</div>`;
        return;
      }
      listContent.innerHTML = blocksFiltered.map((b) => {
        const id = Number(b.id);
        const selected = Number.isFinite(id) && id === selectedId;
        const title = (b.title || "").trim() || `Блок #${id}`;
        return `
          <div class="option-picker-row ${selected ? "is-selected" : ""}" data-block-id="${id}">
            <div class="option-picker-title">${escapeHtml(title)}</div>
            <input class="option-picker-checkbox" type="radio" name="combo-set-block-picker" ${selected ? "checked" : ""} />
          </div>
        `;
      }).join("");
      listContent.querySelectorAll(".option-picker-row[data-block-id]").forEach((row) => {
        row.addEventListener("click", () => {
          const id = Number(row.dataset.blockId);
          if (!Number.isFinite(id)) return;
          state.comboSetPanel.blockPickerSelectedId = id;
          renderList();
        });
      });
    }

    if (searchInput) searchInput.addEventListener("input", renderList);
    renderList();

    const productInfoPanel = $("#productInfoPanel");
    if (productInfoPanel) {
      const existing = productInfoPanel.querySelector(".picker-overlay[data-combo-set-block-picker]");
      if (existing) existing.remove();
      pickerOverlay.setAttribute("data-combo-set-block-picker", "1");
      productInfoPanel.appendChild(pickerOverlay);

      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");

      if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
        comboSetBlockPickerSavedFooterState = {
          footerHidden: footer.classList.contains("hidden"),
          viewHidden: footerView.classList.contains("hidden"),
          editHidden: footerEditMode.classList.contains("hidden"),
          deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
          moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
          cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm"),
          cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
          cancelHtml: cancelBtn.innerHTML,
          cancelTitle: cancelBtn.title || "",
          cancelAria: cancelBtn.getAttribute("aria-label") || "",
          saveHtml: saveBtn.innerHTML,
          saveTitle: saveBtn.title || "",
          saveAria: saveBtn.getAttribute("aria-label") || "",
        };
        comboSetBlockPickerSavedHandlers = { cancel: cancelBtn.onclick, save: saveBtn.onclick };
        footer.classList.remove("hidden");
        footerView.classList.add("hidden");
        footerEditMode.classList.remove("hidden");
        if (deleteBtn) deleteBtn.classList.add("hidden");
        if (moreBtn) moreBtn.classList.add("hidden");
        cancelBtn.classList.remove("is-confirm");
        cancelBtn.classList.add("is-fullwidth");
        cancelBtn.textContent = "Отменить";
        cancelBtn.title = "Отменить";
        cancelBtn.setAttribute("aria-label", "Отменить");
        cancelBtn.onclick = () => closeComboSetBlockPicker();
        saveBtn.textContent = "Сохранить";
        saveBtn.onclick = () => applyComboSetBlockPickerSelection();
      }
    }
  }

  function closeComboSetBlockPicker() {
    state.comboSetPanel.blockPickerOpen = false;
    if (comboSetBlockPickerOverlay && comboSetBlockPickerOverlay.parentNode) {
      comboSetBlockPickerOverlay.remove();
      comboSetBlockPickerOverlay = null;
    }
    const productInfoPanel = $("#productInfoPanel");
    if (productInfoPanel) {
      const existing = productInfoPanel.querySelector(".picker-overlay[data-combo-set-block-picker]");
      if (existing) existing.remove();
    }
    const footer = $("#productInfoFooter");
    const footerView = $("#productFooterView");
    const footerEditMode = $("#productFooterEditMode");
    const cancelBtn = $("#productFooterCancelBtn");
    const saveBtn = $("#productFooterSaveBtn");
    const deleteBtn = $("#productFooterDeleteEditBtn");
    const moreBtn = $("#productFooterMoreEditBtn");
    if (comboSetBlockPickerSavedFooterState && footer && footerView && footerEditMode && cancelBtn && saveBtn) {
      if (comboSetBlockPickerSavedFooterState.footerHidden) footer.classList.add("hidden");
      else footer.classList.remove("hidden");
      if (comboSetBlockPickerSavedFooterState.viewHidden) footerView.classList.add("hidden");
      else footerView.classList.remove("hidden");
      if (comboSetBlockPickerSavedFooterState.editHidden) footerEditMode.classList.add("hidden");
      else footerEditMode.classList.remove("hidden");
      if (deleteBtn && comboSetBlockPickerSavedFooterState.deleteBtnHidden) deleteBtn.classList.add("hidden");
      else if (deleteBtn) deleteBtn.classList.remove("hidden");
      if (moreBtn && comboSetBlockPickerSavedFooterState.moreBtnHidden) moreBtn.classList.add("hidden");
      else if (moreBtn) moreBtn.classList.remove("hidden");
      if (comboSetBlockPickerSavedFooterState.cancelBtnIsFullwidth) cancelBtn.classList.add("is-fullwidth");
      else cancelBtn.classList.remove("is-fullwidth");
      cancelBtn.innerHTML = comboSetBlockPickerSavedFooterState.cancelHtml || "×";
      cancelBtn.title = comboSetBlockPickerSavedFooterState.cancelTitle || "";
      cancelBtn.setAttribute("aria-label", comboSetBlockPickerSavedFooterState.cancelAria || "");
      cancelBtn.onclick = comboSetBlockPickerSavedHandlers?.cancel || null;
      saveBtn.innerHTML = comboSetBlockPickerSavedFooterState.saveHtml || "Сохранить";
      saveBtn.title = comboSetBlockPickerSavedFooterState.saveTitle || "";
      saveBtn.setAttribute("aria-label", comboSetBlockPickerSavedFooterState.saveAria || "");
      saveBtn.onclick = comboSetBlockPickerSavedHandlers?.save || null;
    }
    renderComboSetBlocksList();
  }

  function applyComboSetBlockPickerSelection() {
    const selectedId = state.comboSetPanel?.blockPickerSelectedId;
    if (!Number.isFinite(selectedId)) {
      if (typeof toast !== "undefined") toast("Выберите блок");
      return;
    }
    const blocks = state.comboSetPanel?.blockPickerBlocks ?? [];
    const block = blocks.find((b) => Number(b.id) === selectedId);
    if (!block) return;
    const list = state.comboSetPanel.blocks || [];
    const nextOrder = list.length;
    list.push({
      block_id: Number(block.id),
      block_title: (block.title || "").trim() || `Блок #${block.id}`,
      sort_order: nextOrder,
    });
    closeComboSetBlockPicker();
    renderComboSetBlocksList();
  }

  async function saveComboSet() {
    const payload = getComboSetFormPayload();
    if (!payload.title) {
      if (typeof toast !== "undefined") toast("Укажите название комбо-набора");
      return;
    }
    const blocksPayload = (state.comboSetPanel?.blocks ?? []).map((b, i) => ({ block_id: b.block_id, sort_order: i }));
    if (state.comboSetPanel.mode === "create") {
      try {
        const res = await apiPostCombo({ ...payload, blocks: blocksPayload });
        if (res && res.ok === true && res.data) {
          if (typeof toast !== "undefined") toast("Комбо-набор создан");
          const newComboId = res.data.id;
          const activeKey = tabsState?.activeKey;
          if (activeKey && activeKey.startsWith("combo-set:")) {
            closeTab(activeKey);
          }
          if (state.mode === "products") upsertSavedComboInList(res.data);
          if (Number.isFinite(newComboId)) {
            clearCachedComboSetDetails(newComboId);
            clearCachedComboRowPhotos(newComboId);
            await openComboSetView(newComboId, { forceReload: true });
          }
          return;
        }
        if (typeof toast !== "undefined") toast("Ошибка сохранения");
      } catch (e) {
        console.error("saveComboSet create", e);
        if (typeof toast !== "undefined") toast("Ошибка сохранения");
      }
      return;
    }
    const comboId = state.comboSetPanel?.comboId;
    if (!Number.isFinite(comboId)) {
      if (typeof toast !== "undefined") toast("Ошибка: набор не найден");
      return;
    }
    try {
      const [patchRes, blocksRes] = await Promise.all([
        apiPatchCombo(comboId, payload),
        apiPutComboBlocks(comboId, blocksPayload),
      ]);
      if (typeof toast !== "undefined") toast("Комбо-набор сохранён");
      const combo = patchRes?.data;
      const blocksRows = Array.isArray(blocksRes?.data) ? blocksRes.data : [];
      const blocks = blocksRows.map((r) => ({
        block_id: r.block_id,
        block_title: r.block_title,
        sort_order: r.sort_order ?? 0,
      }));
      state.comboSetPanel.mode = "view";
      state.comboSetPanel.combo = combo || state.comboSetPanel.combo;
      state.comboSetPanel.blocks = blocks;
      state.comboSetPanel.photos = combo?.image_url ? [{ kind: "url", url: String(combo.image_url).trim() }] : state.comboSetPanel.photos ?? [];
      state.comboSetPanel.activePhotoIdx = state.comboSetPanel.photos.length ? 0 : -1;
      const code = (combo?.category_code || "").trim();
      const catByCode = state.categories.find((c) => String(c.code || "").trim() === code);
      state.comboSetPanel.categoryIds = catByCode ? [Number(catByCode.id)] : [];
      setCachedComboSetDetails(comboId, {
        combo: state.comboSetPanel.combo,
        blocks: state.comboSetPanel.blocks,
      });
      clearCachedComboRowPhotos(comboId);
      const tab = tabsState.tabs.find((t) => t.key === `combo-set:${comboId}`);
      if (tab && combo?.title) tab.title = (combo.title || "").trim() || "Комбо";
      activateComboSetTab();
      if (state.mode === "products" && combo) upsertSavedComboInList(combo);
    } catch (e) {
      console.error("saveComboSet update", e);
      if (typeof toast !== "undefined") toast("Ошибка сохранения");
    }
  }

  function cancelComboSet() {
    const comboId = state.comboSetPanel?.comboId;
    const isNewTab = tabsState?.activeKey && String(tabsState.activeKey).includes("new-combo-set-");
    if (Number.isFinite(comboId) && !isNewTab) {
      state.comboSetPanel.mode = "view";
      activateComboSetTab();
    } else {
      closeComboSetPanel();
      const activeKey = tabsState?.activeKey;
      if (activeKey && activeKey.startsWith("combo-set:")) {
        closeTab(activeKey);
      }
    }
  }

  function closeComboSetPanel() {
    const comboSetInfo = document.getElementById("comboSetInfo");
    if (comboSetInfo) comboSetInfo.classList.add("hidden");
    hideProductFooter();
    state.comboSetPanel = { mode: "create", comboId: null, blocks: [], blockPickerOpen: false, blockPickerSelection: new Set() };
  }

  // ---------------- Product Footer ----------------

  function saveCurrentTabEditingStateBeforeSwitch(currentTab) {
    if (!currentTab) return;
    const [type, idStr] = currentTab.key.split(":");
    const isTempTab = idStr.startsWith("new-");
    const id = isTempTab ? idStr : (type === "option" ? Number(idStr) : Number(idStr));

    if (type === "product") {
      if (currentNavigationState?.type === "product-edit" && currentNavigationState?.product?.id) {
        const productId = currentNavigationState.product.id;
        const currentEditingState = editingProducts.get(productId) || {};
        editingProducts.set(productId, {
          navigationState: currentNavigationState,
          draft: currentEditingState.draft,
          draftIngredients: currentEditingState.draftIngredients
        });
      }
    } else if (type === "option" && Number.isFinite(id)) {
      if (state.optionPanel.mode === "edit" || state.optionPanel.mode === "create") {
        if (state.selectedOptionGroupId === id || state.optionPanel.tabKey === currentTab.key) {
          editingOptions.set(id, {
            mode: state.optionPanel.mode || "view",
            optionDraft: state.optionDraft ? deepClone(state.optionDraft) : null,
            snapshotData: state.optionPanel.snapshotData ? deepClone(state.optionPanel.snapshotData) : null
          });
        }
      }
    } else if (type === "option" && isTempTab) {
      if (state.optionPanel.mode === "create" && state.optionPanel.tabKey === currentTab.key) {
        editingOptions.set(idStr, {
          mode: "create",
          optionDraft: state.optionDraft ? deepClone(state.optionDraft) : null,
          snapshotData: state.optionPanel.snapshotData ? deepClone(state.optionPanel.snapshotData) : null
        });
      }
    } else if (type === "variant" && Number.isFinite(id)) {
      if (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create") {
        if (state.selectedVariantGroupId === id || state.variantPanel.tabKey === currentTab.key) {
          editingVariants.set(id, {
            mode: state.variantPanel.mode || "view",
            variantDraft: state.variantDraft ? deepClone(state.variantDraft) : null,
            snapshotData: state.variantPanel.snapshotData ? deepClone(state.variantPanel.snapshotData) : null
          });
        }
      }
    } else if (type === "variant" && isTempTab) {
      if (state.variantPanel.mode === "create" && state.variantPanel.tabKey === currentTab.key) {
        editingVariants.set(idStr, {
          mode: "create",
          variantDraft: state.variantDraft ? deepClone(state.variantDraft) : null,
          snapshotData: state.variantPanel.snapshotData ? deepClone(state.variantPanel.snapshotData) : null
        });
      }
    } else if (type === "category" && Number.isFinite(id)) {
      if (currentNavigationState?.type === "category-edit" && currentNavigationState?.category?.id === id) {
        editingCategories.set(id, { navigationState: currentNavigationState });
      }
    } else if (type === "auto-add" && (Number.isFinite(id) || isTempTab)) {
      if (state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create") {
        const storeId = isTempTab ? idStr : id;
        if (state.selectedAutoAddGroupId === id || state.autoAddPanel.tabKey === currentTab.key) {
          editingAutoAdds.set(storeId, {
            mode: state.autoAddPanel.mode || "view",
            autoAddDraft: state.autoAddDraft ? deepClone(state.autoAddDraft) : null,
            snapshotData: state.autoAddPanel.snapshotData ? deepClone(state.autoAddPanel.snapshotData) : null
          });
        }
      }
    } else if (type === "combo") {
      if (state.comboPanel.mode === "create" || state.comboPanel.mode === "edit") {
        if (state.comboPanel.tabKey === currentTab.key && (comboBlockTitleInput || comboBlockForm)) {
          const blockDraft = {
            title: comboBlockTitleInput?.value ?? "",
            sort_order: parseInt(comboBlockSortOrderInput?.value, 10) || 0,
            min_select: Math.max(0, parseInt(comboBlockMinSelectInput?.value, 10) || 1),
            max_select: Math.max(1, parseInt(comboBlockMaxSelectInput?.value, 10) || 1),
          };
          state.comboBlockDraft = blockDraft;
          editingCombos.set(idStr, {
            mode: state.comboPanel.mode || "view",
            blockDraft: deepClone(blockDraft),
            products: deepClone(state.comboBlockProducts || [])
          });
        }
      }
    }
  }

  function saveTabFooterState(tab) {
    if (!tab) return;
    const footer = $("#productInfoFooter");
    const viewMode = $("#productFooterView");
    const editMode = $("#productFooterEditMode");
    
    if (!footer || !viewMode || !editMode) return;
    
    // Определяем текущий режим футера
    let mode = "hidden";
    if (!footer.classList.contains("hidden")) {
      if (!viewMode.classList.contains("hidden")) {
        mode = "view";
      } else if (!editMode.classList.contains("hidden")) {
        mode = "edit";
      }
    }
    
    // Сохраняем состояние футера в таб
    if (!tab.footerState) {
      tab.footerState = {};
    }
    tab.footerState.mode = mode;
  }

  function restoreTabFooterState(tab) {
    if (!tab || !tab.footerState) return;
    
    const mode = tab.footerState.mode;
    if (mode === "view") {
      showProductFooterView();
    } else if (mode === "edit") {
      showProductFooterEdit();
    } else {
      hideProductFooter();
    }
  }

  function updateActiveTabFooterState() {
    if (!tabsState.activeKey) return;
    const activeTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
    if (activeTab) {
      saveTabFooterState(activeTab);
    }
  }

  function showProductFooterView() {
    const footer = $("#productInfoFooter");
    const viewMode = $("#productFooterView");
    const editMode = $("#productFooterEditMode");
    const blockChips = $("#productFooterBlockChips");
    if (!footer || !viewMode || !editMode) return;
    
    resetFooterConfirmButtons();
    footer.classList.remove("hidden");
    viewMode.classList.remove("hidden");
    editMode.classList.add("hidden");
    if (blockChips) {
      blockChips.classList.add("hidden");
      blockChips.innerHTML = "";
    }
    
    // Обновляем состояние футера активного таба
    updateActiveTabFooterState();
  }

  function showProductFooterEdit() {
    const footer = $("#productInfoFooter");
    const viewMode = $("#productFooterView");
    const editMode = $("#productFooterEditMode");
    if (!footer || !viewMode || !editMode) return;
    
    resetFooterConfirmButtons();
    footer.classList.remove("hidden");
    viewMode.classList.add("hidden");
    editMode.classList.remove("hidden");
    
    // Обновляем состояние футера активного таба
    updateActiveTabFooterState();
  }

  function hideProductFooter() {
    const footer = $("#productInfoFooter");
    const blockChips = $("#productFooterBlockChips");
    resetFooterConfirmButtons();
    if (footer) footer.classList.add("hidden");
    if (blockChips) {
      blockChips.classList.add("hidden");
      blockChips.innerHTML = "";
    }
    
    // Обновляем состояние футера активного таба
    updateActiveTabFooterState();
  }

  function resetTwoStepButton(btn) {
    if (!btn) return;
    btn.classList.remove("is-confirm");
    if (btn.dataset.originalHtml != null) {
      btn.innerHTML = btn.dataset.originalHtml;
    }
    if (btn.dataset.originalTitle != null) {
      btn.title = btn.dataset.originalTitle;
    }
    if (btn.dataset.originalAria != null) {
      btn.setAttribute("aria-label", btn.dataset.originalAria);
    }
  }

  function resetFooterConfirmButtons() {
    resetTwoStepButton($("#productFooterDeleteBtn"));
    resetTwoStepButton($("#productFooterDeleteEditBtn"));
    resetTwoStepButton($("#productFooterCancelBtn"));
    // Сбрасываем текст и dataset кнопок после stock-doc режима
    const saveBtn = $("#productFooterSaveBtn");
    if (saveBtn) {
      saveBtn.textContent = "Сохранить";
      delete saveBtn.dataset.pickerType;
    }
    const cancelBtn = $("#productFooterCancelBtn");
    if (cancelBtn) {
      cancelBtn.classList.remove("hidden");
      cancelBtn.classList.remove("is-fullwidth");
      delete cancelBtn.dataset.pickerType;
    }
    const editBtn = $("#productFooterEditBtn");
    if (editBtn) {
      editBtn.textContent = "Редактировать";
      editBtn.disabled = false;
    }
    const deleteBtn = $("#productFooterDeleteBtn");
    if (deleteBtn) deleteBtn.classList.remove("hidden");
    const deleteEditBtn = $("#productFooterDeleteEditBtn");
    if (deleteEditBtn) deleteEditBtn.classList.remove("hidden");
    const moreBtn = $("#productFooterMoreBtn");
    if (moreBtn) moreBtn.classList.remove("hidden");
    const moreEditBtn = $("#productFooterMoreEditBtn");
    if (moreEditBtn) moreEditBtn.classList.remove("hidden");
  }

  // ---------------- Tabs ----------------

  const tabsState = {
    tabs: [],
    activeKey: null,
  };

  function buildTabKey(type, id) {
    return `${type}:${id}`;
  }

  function renderTabs() {
    if (!productTabsHeader || !productTabs) return;
    const hasTabs = tabsState.tabs.length > 0;
    productTabsHeader.classList.toggle("hidden", !hasTabs);
    if (!hasTabs) {
      productTabs.innerHTML = "";
      return;
    }

    productTabs.innerHTML = tabsState.tabs.map((tab) => {
      const isActive = tab.key === tabsState.activeKey;
      return `
        <div class="product-tab ${isActive ? "is-active" : ""}" data-tab-key="${tab.key}">
          <span class="product-tab-title">${escapeHtml(tab.title || "Без названия")}</span>
          <button class="product-tab-close" type="button" data-tab-close="${tab.key}" aria-label="Закрыть">×</button>
        </div>
      `;
    }).join("");
  }

  async function setActiveTabKey(key, { activate = true } = {}) {
    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    if (tabsState.activeKey === key) {
      renderTabs();
      return;
    }
    
    // Сохраняем состояние редактирования и футера текущего активного таба перед переключением
    if (tabsState.activeKey && tabsState.activeKey !== key) {
      const currentTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
      if (currentTab) {
        saveCurrentTabEditingStateBeforeSwitch(currentTab);
        saveTabFooterState(currentTab);
      }
    }
    
    tabsState.activeKey = key;
    renderTabs();
    
    // Восстанавливаем состояние футера нового активного таба ДО вызова onActivate
    // Это позволяет onActivate переопределить состояние, если нужно
    if (tab.footerState && tab.footerState.mode !== "hidden") {
      restoreTabFooterState(tab);
    }
    
    if (activate && typeof tab.onActivate === "function") {
      const result = tab.onActivate();
      // Ждём завершения async onActivate перед обновлением футера
      if (result != null && typeof result.then === "function") {
        await result;
      }
      // После onActivate обновляем состояние футера в табе (на случай если onActivate изменил его)
      updateActiveTabFooterState();
    }
  }

  function ensureTab({ type, id, title, onActivate, activate = true }) {
    const key = buildTabKey(type, id);
    let tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) {
      tab = { 
        key, 
        type, 
        id, 
        title, 
        onActivate,
        footerState: { mode: "hidden" } // Инициализируем состояние футера
      };
      tabsState.tabs.push(tab);
    } else {
      tab.title = title;
      tab.onActivate = onActivate || tab.onActivate;
      // Если footerState еще не инициализирован, инициализируем
      if (!tab.footerState) {
        tab.footerState = { mode: "hidden" };
      }
    }
    setActiveTabKey(key, { activate });
    return tab;
  }

  async function closeTab(key) {
    const idx = tabsState.tabs.findIndex((t) => t.key === key);
    if (idx === -1) return;
    const tab = tabsState.tabs[idx];
    const wasActive = tabsState.activeKey === key;
    
    // Сохраняем состояние футера перед закрытием активного таба
    if (wasActive) {
      saveTabFooterState(tab);
    }
    
    // Cleanup editing state if closing active tab in edit mode
    if (wasActive) {
      // Parse tab key to get type and id (format: "type:id")
      const [type, idStr] = key.split(":");
      const isTempTab = idStr.startsWith("new-");
      const id = isTempTab ? idStr : (type === "option" ? Number(idStr) : Number(idStr));
      
      // Check if we're in edit/create mode for this tab
      let shouldCleanup = false;
      
      if (type === "product") {
        // Check if product is being edited
        if (isTempTab || (Number.isFinite(id) && editingProducts.has(id))) {
          shouldCleanup = true;
        } else if (currentNavigationState?.type === "product-edit") {
          const productId = currentNavigationState?.product?.id;
          if (productId === id) {
            shouldCleanup = true;
          }
        }
      } else if (type === "category") {
        // Check if category is being edited
        if (isTempTab || (Number.isFinite(id) && editingCategories.has(id))) {
          shouldCleanup = true;
        } else if (currentNavigationState?.type === "category-edit") {
          const categoryId = currentNavigationState?.category?.id;
          if (categoryId === id) {
            shouldCleanup = true;
          }
        }
      } else if (type === "option") {
        // Check if option is being edited
        if (isTempTab || (Number.isFinite(id) && editingOptions.has(id))) {
          shouldCleanup = true;
        } else if (state.optionPanel.mode === "edit" || state.optionPanel.mode === "create") {
          if (state.selectedOptionGroupId === id || state.optionPanel.tabKey === key) {
            shouldCleanup = true;
          }
        }
      } else if (type === "variant") {
        // Check if variant is being edited
        if (isTempTab || (Number.isFinite(id) && editingVariants.has(id))) {
          shouldCleanup = true;
        } else if (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create") {
          if (state.selectedVariantGroupId === id || state.variantPanel.tabKey === key) {
            shouldCleanup = true;
          }
        }
      } else if (type === "auto-add") {
        // Check if auto-add is being edited
        if (isTempTab || (Number.isFinite(id) && editingAutoAdds.has(id))) {
          shouldCleanup = true;
        } else if (state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create") {
          if (state.selectedAutoAddGroupId === id || state.autoAddPanel.tabKey === key) {
            shouldCleanup = true;
          }
        }
      } else if (type === "unit") {
        // Check if unit is being edited
        if (isTempTab || (state.unitPanel.mode === "edit" || state.unitPanel.mode === "create")) {
          if (state.selectedUnitId === id || state.unitPanel.tabKey === key) {
            shouldCleanup = true;
          }
        }
      } else if (type === "combo") {
        if (state.comboPanel.tabKey === key || editingCombos.has(idStr)) {
          shouldCleanup = true;
        }
      } else if (type === "combo-set") {
        shouldCleanup = true;
      } else if (type === "stock-doc") {
        shouldCleanup = true;
      }

      if (shouldCleanup) {
        // Call onClose if exists (for products and categories)
        if (currentNavigationState?.onClose) {
          currentNavigationState.onClose();
        }
        if (type === "combo-set") {
          closeComboSetPanel();
        }
        
        // For options, call cancelOptionEdit if in edit/create mode
        if (type === "option" && (state.optionPanel.mode === "edit" || state.optionPanel.mode === "create")) {
          if (Number.isFinite(id) && editingOptions.has(id)) {
            // Cancel edit mode
            cancelOptionEdit();
          } else if (isTempTab) {
            // Cancel create mode
            state.optionPanel.mode = "view";
            state.optionDraft = null;
            state.optionPanel.tabKey = null;
          }
        }
        
        // For variants, cancel edit/create mode
        if (type === "variant" && (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create")) {
          cancelVariantEdit();
        }

        // For auto-add, cancel edit/create mode
        if (type === "auto-add" && (state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create")) {
          if (Number.isFinite(id) && editingAutoAdds.has(id)) {
            state.autoAddPanel.mode = "view";
            state.autoAddDraft = null;
            state.autoAddPanel.snapshotData = null;
            editingAutoAdds.delete(id);
          } else if (isTempTab) {
            state.autoAddPanel.mode = "view";
            state.autoAddDraft = null;
            state.autoAddPanel.tabKey = null;
          }
        }
        
        // For units, cancel edit/create mode
        if (type === "unit" && (state.unitPanel.mode === "edit" || state.unitPanel.mode === "create")) {
          cancelUnitEdit();
          state.unitPanel.tabKey = null;
        }

        // For combo block, cancel create/edit mode
        if (type === "combo" && (state.comboPanel.mode === "edit" || state.comboPanel.mode === "create")) {
          state.comboPanel.mode = "view";
          state.comboBlockDraft = null;
          state.comboBlockProducts = [];
          state.comboPanel.tabKey = null;
        }

        // For stock-doc, clear detail state and close picker overlay
        if (type === "stock-doc") {
          state.stockDocDetail = null;
          closeStockPicker();
        }

        // Remove from editing Maps
        if (type === "product" && Number.isFinite(id)) {
          editingProducts.delete(id);
        } else if (type === "category" && Number.isFinite(id)) {
          editingCategories.delete(id);
        } else if (type === "option" && Number.isFinite(id)) {
          editingOptions.delete(id);
        } else if (type === "variant" && Number.isFinite(id)) {
          editingVariants.delete(id);
        } else if (type === "auto-add" && Number.isFinite(id)) {
          editingAutoAdds.delete(id);
        } else if (type === "combo") {
          editingCombos.delete(idStr);
        }
        
        // Clear navigation state
        clearNavigationStack();
        currentNavigationState = null;
        
        // Remove only dynamic content (product editor wrapper), keep static panels so combo-set tab can still show
        const productInfoBody = $("#productInfoBody");
        if (productInfoBody && type !== "combo-set") {
          const wrapper = productInfoBody.querySelector(".product-editor-wrapper");
          if (wrapper) wrapper.remove();
        }
      }
    }
    
    tabsState.tabs.splice(idx, 1);
    if (wasActive) {
      const next = tabsState.tabs[idx] || tabsState.tabs[idx - 1];
      if (next) {
        await setActiveTabKey(next.key);
      } else {
        tabsState.activeKey = null;
        renderTabs();
        showDetailsEmpty();
      }
      return;
    }
    renderTabs();
  }

  function replaceTabKey(oldKey, { type, id, title, onActivate }) {
    const idx = tabsState.tabs.findIndex((t) => t.key === oldKey);
    if (idx === -1) {
      ensureTab({ type, id, title, onActivate });
      return;
    }
    const newKey = buildTabKey(type, id);
    tabsState.tabs[idx] = { key: newKey, type, id, title, onActivate };
    if (tabsState.activeKey === oldKey) {
      tabsState.activeKey = newKey;
    }
    renderTabs();
  }

  async function openProductById(productId, { forceReload = false } = {}) {
    if (!Number.isFinite(Number(productId))) return;
    const id = Number(productId);
    if (!(state.productOpenInflight instanceof Map)) state.productOpenInflight = new Map();
    const inflightKey = `${id}:${forceReload ? 1 : 0}`;
    const inflight = state.productOpenInflight.get(inflightKey);
    if (inflight) return inflight;
    const task = (async () => {
    if (forceReload) {
      clearCachedProductView(id);
      clearCachedProductDetails(id);
    }
    const activeProductTabKey = buildTabKey("product", id);
    if (
      !forceReload &&
      Number(state.selectedProductId) === id &&
      tabsState.activeKey === activeProductTabKey &&
      !editingProducts.has(id)
    ) {
      if (productsList) {
        $$(".order-row", productsList).forEach((x) =>
          x.classList.toggle("is-active", Number(x.dataset.id) === id)
        );
      }
      return;
    }
    const cachedDetails = !forceReload ? getCachedProductDetails(id) : null;
    let p = state.products.find((x) => Number(x.id) === id);
    if (!p && cachedDetails?.product) {
      p = cachedDetails.product;
    }
    if (!forceReload && p && !p.nutrition_per_100g) {
      try {
        const res = await apiGetProduct(id);
        if (res && res.data) p = res.data;
      } catch (e) {
        console.warn('openProductById: failed to fetch full product', id, e);
      }
    }
    if (!p) {
      // Товар из другой категории — загружаем по API (чтобы табы работали при смене категории)
      try {
        const res = await apiGetProduct(id);
        if (res && res.data) p = res.data;
      } catch (e) {
        console.warn('openProductById: failed to fetch product', id, e);
        return;
      }
    }
    if (!p) return;
    state.selectedProductId = id;
    if (productsList) {
      $$(".order-row", productsList).forEach((x) =>
        x.classList.toggle("is-active", Number(x.dataset.id) === id)
      );
    }

    if (cachedDetails && !forceReload) {
      state.selectedProductCategories = Array.isArray(cachedDetails.categories) ? cachedDetails.categories : [];
      state.selectedProductOptionAssignments = Array.isArray(cachedDetails.optionAssignments) ? cachedDetails.optionAssignments : [];
      showProductDetails(p);
      setCachedProductDetails(id, {
        product: p,
        categories: state.selectedProductCategories,
        optionAssignments: state.selectedProductOptionAssignments,
        ingredients: cachedDetails.ingredients,
      });
      schedulePersistProductsCache();
      return;
    }

    const catRes = await api(`/api/prod_products/${id}/categories?tenant_id=${TENANT_ID}`);
    state.selectedProductCategories = Array.isArray(catRes.data) ? catRes.data : [];
    await loadProductOptionAssignments(id, { forceReload: true });
    showProductDetails(p);
    setCachedProductDetails(id, {
      product: p,
      categories: state.selectedProductCategories,
      optionAssignments: state.selectedProductOptionAssignments,
      ingredients: cachedDetails?.ingredients || null,
    });
    schedulePersistProductsCache();
    })().finally(() => {
      state.productOpenInflight.delete(inflightKey);
    });
    state.productOpenInflight.set(inflightKey, task);
    return task;
  }

  function openProductTab(product, { activate = true } = {}) {
    if (!product) return;
    const productId = product.id;
    if (productId == null) return;
    ensureTab({
      type: "product",
      id: productId,
      title: product.name || "Товар",
      onActivate: () => {
        openProductById(productId);
      },
      activate,
    });
  }

  async function collectParentProductIds(productId, visited = new Set()) {
    const id = Number(productId || 0);
    if (!Number.isFinite(id) || id <= 0 || visited.has(id)) return [];
    visited.add(id);
    let directIds = [];
    try {
      const res = await apiGetProductsUsingAsIngredient(id);
      directIds = Array.isArray(res?.product_ids) ? res.product_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0) : [];
    } catch (e) {
      console.error("Failed to load parent products", e);
      return [];
    }
    const result = new Set();
    for (const parentId of directIds) {
      if (visited.has(parentId)) continue;
      result.add(parentId);
      const upperIds = await collectParentProductIds(parentId, visited);
      upperIds.forEach((upperId) => result.add(upperId));
    }
    return Array.from(result);
  }

  async function invalidateProductParents(productId) {
    const parentIds = await collectParentProductIds(productId);
    parentIds.forEach((parentId) => {
      clearCachedProductDetails(parentId);
      clearCachedProductView(parentId);
    });
    const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey);
    const activeProductId = activeTab?.type === "product" ? Number(activeTab.id || 0) : 0;
    if (parentIds.includes(activeProductId) && !editingProducts.has(activeProductId)) {
      await openProductById(activeProductId, { forceReload: true });
    }
    return parentIds;
  }

  let productDependentRecalcEscHandler = null;
  const productIngredientsLoadPromises = new Map();

  async function ensureProductIngredientsCached(productId, productHint = null) {
    const id = Number(productId || 0);
    if (!Number.isFinite(id) || id <= 0) return [];
    const cached = getCachedProductDetails(id);
    if (Array.isArray(cached?.ingredients)) return cached.ingredients;
    if (productIngredientsLoadPromises.has(id)) return productIngredientsLoadPromises.get(id);
    const promise = apiGetProductIngredients(id)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : [];
        setCachedProductDetails(id, {
          product: productHint || cached?.product || state.products.find((p) => Number(p.id) === id) || null,
          ingredients: list,
        });
        return list;
      })
      .finally(() => {
        productIngredientsLoadPromises.delete(id);
      });
    productIngredientsLoadPromises.set(id, promise);
    return promise;
  }

  function closeProductDependentRecalcModal() {
    document.querySelectorAll(".product-photo-grid-modal-overlay[data-product-dependent-recalc-modal='1']").forEach((el) => el.remove());
    if (productDependentRecalcEscHandler) {
      document.removeEventListener("keydown", productDependentRecalcEscHandler);
      productDependentRecalcEscHandler = null;
    }
  }

  function formatRecalcValue(value, suffix = "") {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return `${formatNumberForInputFixed(n, 2)}${suffix}`;
  }

  function calcCachedProductCompositionTotals(product, ingredients) {
    if (!product || !Array.isArray(ingredients) || !ingredients.length) return null;
    const pcsUnitId = state.units.find((u) => u.code === "pcs")?.id || null;
    const recipeBaseUnitId = Number(product.base_unit_id || product.unit_id || 0);
    const variant = product.default_variant || null;
    const variantQty = variant?.default_value != null ? Number(variant.default_value) : null;
    const normQty = Number(product.base_qty || 0);
    let measureUnitId = recipeBaseUnitId;
    let targetQty = normQty > 0 ? normQty : null;
    if (targetQty == null && Number.isFinite(variantQty) && variantQty > 0) {
      targetQty = variantQty;
      measureUnitId = Number(variant.unit_id || 0);
    }
    if (targetQty != null && pcsUnitId && Number(measureUnitId) === Number(pcsUnitId) && product.product_pcs_factor != null && product.product_pcs_base_unit_id) {
      measureUnitId = Number(product.product_pcs_base_unit_id);
      targetQty *= Number(product.product_pcs_factor);
    }
    let cost = 0;
    let price = 0;
    let weight = 0;
    let hasCost = false;
    let hasPrice = false;
    let hasWeight = false;
    const lines = [];
    ingredients.forEach((ing) => {
      const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
      const fromUnitId = Number(ing.unit_id || 0);
      const qty = Number(ing.quantity || 0);
      let qtyInBase = null;
      if (baseUnitId && fromUnitId) {
        if (Number(fromUnitId) === Number(baseUnitId)) {
          qtyInBase = qty;
        } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
          if (Number(baseUnitId) === Number(pcsUnitId)) qtyInBase = qty;
          else if (ing.ingredient_pcs_factor != null) qtyInBase = qty * Number(ing.ingredient_pcs_factor);
        } else if (!(pcsUnitId && Number(baseUnitId) === Number(pcsUnitId))) {
          const factor = getConversionFactor(fromUnitId, baseUnitId);
          if (factor != null) qtyInBase = qty * factor;
        }
      }
      let qtyInMeasureUnit = null;
      if (measureUnitId && fromUnitId) {
        if (Number(fromUnitId) === Number(measureUnitId)) {
          qtyInMeasureUnit = qty;
        } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId) && ing.ingredient_pcs_factor != null) {
          qtyInMeasureUnit = qty * Number(ing.ingredient_pcs_factor);
        } else {
          const factor = getConversionFactor(fromUnitId, measureUnitId);
          if (factor != null) qtyInMeasureUnit = qty * factor;
        }
      }
      if (qtyInMeasureUnit != null) {
        weight += qtyInMeasureUnit;
        hasWeight = true;
      }
      if (qtyInBase == null) return;
      const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
      const costBase = baseQty > 0 ? Number(ing.ingredient_cost_price || 0) / baseQty : Number(ing.ingredient_cost_price || 0);
      const catalogPriceBase = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
      const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogPriceBase;
      const lineCost = costBase * qtyInBase;
      const linePrice = priceBase * qtyInBase;
      cost += lineCost;
      price += linePrice;
      hasCost = true;
      hasPrice = true;
      lines.push({
        name: ing.ingredient_name || "",
        quantity: qty,
        unit: ing.unit_short_title || ing.unit_title || ing.unit_code || "",
        cost: Math.round(lineCost * 100) / 100,
        price: Math.round(linePrice * 100) / 100,
      });
    });
    const scale = hasWeight && weight > 0 && targetQty > 0 ? targetQty / weight : 1;
    const costPrice = hasCost ? Math.round(cost * scale * 100) / 100 : null;
    const salePrice = hasPrice ? Math.round(price * scale * 100) / 100 : null;
    return {
      cost_price: costPrice,
      price: salePrice,
      margin_percent: calcMarginFromPrice(costPrice, salePrice),
      base_qty: hasWeight ? Math.round(weight * scale * 1000) / 1000 : null,
      scale,
      breakdown: lines.map((line) => ({
        ...line,
        cost: Math.round(line.cost * scale * 100) / 100,
        price: Math.round(line.price * scale * 100) / 100,
      })),
    };
  }

  function valuesDifferentForRecalc(a, b, precision = 0.001) {
    const an = Number(a);
    const bn = Number(b);
    const aEmpty = a == null || a === "";
    const bEmpty = b == null || b === "";
    if (aEmpty && bEmpty) return false;
    if (Number.isFinite(an) || Number.isFinite(bn)) {
      if (!Number.isFinite(an) || !Number.isFinite(bn)) return true;
      return Math.abs(an - bn) > precision;
    }
    return String(a ?? "").trim() !== String(b ?? "").trim();
  }

  function normalizeIngredientForRecalcCompare(ing) {
    return {
      ingredient_id: Number(ing?.ingredient_id || 0),
      quantity: Number(ing?.quantity || 0),
      unit_id: Number(ing?.unit_id || ing?.ingredient_unit_id || 0),
      is_variable: ing?.is_variable ? 1 : 0,
      quantity_min: ing?.is_variable ? (ing.quantity_min != null ? Number(ing.quantity_min) : null) : null,
      quantity_max: ing?.is_variable ? (ing.quantity_max != null ? Number(ing.quantity_max) : null) : null,
      quantity_step: ing?.is_variable ? (ing.quantity_step != null ? Number(ing.quantity_step) : null) : null,
      price_override: ing?.price_override != null ? Number(ing.price_override) : null,
      sort_order: Number(ing?.sort_order || 0),
    };
  }

  function ingredientsChangedForRecalc(initialSnapshot, currentDraft) {
    const initial = initialSnapshot instanceof Map ? initialSnapshot : new Map();
    const current = currentDraft instanceof Map ? currentDraft : new Map();
    if (initial.size !== current.size) return true;
    for (const [ingredientId, ing] of current.entries()) {
      const snapshot = initial.get(ingredientId);
      if (!snapshot) return true;
      if (JSON.stringify(normalizeIngredientForRecalcCompare(ing)) !== JSON.stringify(normalizeIngredientForRecalcCompare(snapshot))) {
        return true;
      }
    }
    return false;
  }

  function buildProductDependentRecalcChanges(product, payload, initialSnapshot, currentDraft) {
    if (!product || !payload) return null;
    const ingredientsChanged = ingredientsChangedForRecalc(initialSnapshot, currentDraft);
    const nameChanged = String(product.name || "").trim() !== String(payload.name || "").trim();
    const clientCompositionChanged = String(product.client_composition || "").trim() !== String(payload.client_composition || "").trim();
    const unitChanged = valuesDifferentForRecalc(product.base_unit_id ?? product.unit_id, payload.base_unit_id ?? payload.unit_id, 0);
    const baseQtyChanged = valuesDifferentForRecalc(product.base_qty, payload.base_qty);
    const nutritionChanged = ["nutrition_protein_100g", "nutrition_fat_100g", "nutrition_carbs_100g"]
      .some((field) => valuesDifferentForRecalc(product[field], payload[field]));
    const costChanged = valuesDifferentForRecalc(product.cost_price, payload.cost_price)
      || normalizeProductValueSource(product.cost_price_source) !== normalizeProductValueSource(payload.cost_price_source);
    const priceChanged = valuesDifferentForRecalc(product.price, payload.price)
      || normalizeProductValueSource(product.price_source) !== normalizeProductValueSource(payload.price_source);
    const baseAffectsComposition = ingredientsChanged || unitChanged || baseQtyChanged;
    const fields = {
      nutrition: nutritionChanged || baseAffectsComposition,
      composition: ingredientsChanged || nameChanged || clientCompositionChanged || unitChanged,
      cost_price: costChanged || baseAffectsComposition,
      price: priceChanged || baseAffectsComposition,
    };
    const labels = [];
    if (fields.nutrition) labels.push("КБЖУ");
    if (fields.composition) labels.push("состав");
    if (fields.cost_price) labels.push("себестоимость");
    if (fields.price) labels.push("цена");
    return { fields, labels, hasChanges: labels.length > 0 };
  }

  function getRecalcUnitLabel(item) {
    return item?.unit_short_title || item?.unit_title || item?.unit_code || "";
  }

  function getRecalcVariantLabel(item) {
    const variant = item?.default_variant;
    if (!variant || variant.default_value == null) return "";
    const unit = variant.unit_short_title || variant.unit_title || variant.unit_code || "";
    const value = formatQuantity(variant.default_value);
    const title = String(variant.title || "").trim();
    return `${title ? `${title}: ` : ""}${value}${unit ? ` ${unit}` : ""}`;
  }

  function getRecalcBasisLabels(item) {
    const unit = getRecalcUnitLabel(item);
    const normQty = Number(item?.base_qty || 0);
    const labels = [];
    if (normQty > 0) labels.push(`Норма: ${formatQuantity(normQty)}${unit ? ` ${unit}` : ""}`);
    const variantLabel = getRecalcVariantLabel(item);
    if (variantLabel) labels.push(`Вариант по умолчанию: ${variantLabel}`);
    if (normQty > 0 && variantLabel) labels.push("Считаем по норме");
    return labels;
  }

  function renderRecalcBreakdown(calculated) {
    const lines = Array.isArray(calculated?.breakdown) ? calculated.breakdown.slice(0, 4) : [];
    if (!lines.length) return "";
    return lines.map((line) => {
      const unit = line.unit ? ` ${line.unit}` : "";
      return `${line.name || "Ингредиент"}: ${formatQuantity(line.quantity)}${unit} = себест. ${formatRecalcValue(line.cost, " ₽")}, цена ${formatRecalcValue(line.price, " ₽")}`;
    }).join("\n");
  }

  function openProductDependentRecalcModal(items) {
    const list = (Array.isArray(items) ? items : [])
      .filter((item) => Number(item?.product_id) > 0)
      .sort((a, b) => Number(a.depth || 0) - Number(b.depth || 0));
    if (!list.length) return;
    closeProductDependentRecalcModal();
    const overlay = document.createElement("div");
    overlay.className = "product-photo-grid-modal-overlay";
    overlay.setAttribute("data-product-dependent-recalc-modal", "1");
    const card = document.createElement("div");
    card.className = "product-photo-grid-modal-card product-recalc-modal-card";
    const fieldDefs = [
      { key: "nutrition", label: "КБЖУ", defaultOn: (item) => item.changed_fields ? Boolean(item.changed_fields.nutrition) : true },
      { key: "composition", label: "Состав", defaultOn: (item) => item.changed_fields ? Boolean(item.changed_fields.composition) : true },
      { key: "cost_price", label: "Себест.", defaultOn: (item) => item.changed_fields ? Boolean(item.changed_fields.cost_price) && normalizeProductValueSource(item?.sources?.cost_price) === "auto" : normalizeProductValueSource(item?.sources?.cost_price) === "auto" },
      { key: "price", label: "Цена", defaultOn: (item) => item.changed_fields ? Boolean(item.changed_fields.price) && normalizeProductValueSource(item?.sources?.price) === "auto" : normalizeProductValueSource(item?.sources?.price) === "auto" },
    ];
    card.innerHTML = `
      <div class="product-photo-grid-modal-head">
        <div class="product-photo-grid-modal-title">Пересчитать связанные товары</div>
        <button type="button" class="product-photo-grid-modal-close" aria-label="Закрыть"><i class="fas fa-times"></i></button>
      </div>
      <div class="product-photo-grid-modal-body">
        <div class="product-recalc-modal-list">
          ${list.map((item, index) => {
            const path = Array.isArray(item.paths) && item.paths.length
              ? item.paths[0].join(" > ")
              : String(item.name || "");
            const sources = item.sources || {};
            const isAuto = normalizeProductValueSource(sources.cost_price) === "auto" && normalizeProductValueSource(sources.price) === "auto";
            const photo = item.photo || "";
            const reasonText = Array.isArray(item.change_labels) && item.change_labels.length
              ? `Изменилось: ${item.change_labels.join(", ")}`
              : "";
            const basisLabels = getRecalcBasisLabels(item);
            return `
              <div class="product-recalc-modal-row" data-recalc-index="${index}">
                <div class="product-recalc-modal-main">
                  <div class="product-recalc-modal-left">
                    <label class="product-recalc-modal-row-head">
                      <input type="checkbox" data-role="row-check" checked>
                      <span class="product-recalc-modal-photo">${photo ? `<img src="${escapeHtml(photo)}" alt="" />` : ""}</span>
                      <span>
                        <strong>${escapeHtml(item.name || "Товар")}</strong>
                        <small>${escapeHtml(path)}</small>
                        ${basisLabels.map((label) => `<em class="product-recalc-modal-basis">${escapeHtml(label)}</em>`).join("")}
                        ${reasonText ? `<em class="product-recalc-modal-reasons">${escapeHtml(reasonText)}</em>` : ""}
                      </span>
                    </label>
                    <div class="product-recalc-modal-fields">
                      ${fieldDefs.map((field) => {
                        const checked = field.defaultOn(item) ? " checked" : "";
                        const source = sources[field.key];
                        const badge = source === "manual" && ["cost_price", "price"].includes(field.key)
                          ? `<span class="product-recalc-modal-badge">ручное</span>`
                          : "";
                        return `<label class="product-recalc-modal-field"><input type="checkbox" data-role="field-check" data-field="${field.key}"${checked}>${escapeHtml(field.label)}${badge}</label>`;
                      }).join("")}
                    </div>
                  </div>
                  <div class="product-nutrition-card product-price-card product-recalc-price-card ${isAuto ? "is-auto" : ""}">
                    <div class="product-nutrition-head">
                      <div>
                        <div class="product-nutrition-title">Цена</div>
                        <div class="product-nutrition-subtitle" data-role="price-source-hint">${isAuto ? "Считается из состава" : "Ручной ввод"}</div>
                      </div>
                      <div class="product-price-source-toggle">
                        <button class="product-price-source-btn ${isAuto ? "is-active" : ""}" type="button" data-role="source-auto">Из состава</button>
                        <button class="product-price-source-btn ${!isAuto ? "is-active" : ""}" type="button" data-role="source-manual">Ручное</button>
                      </div>
                    </div>
                    <div class="product-price-grid">
                      <div class="field-wrap product-nutrition-field product-price-field">
                        <label class="field-label">Себест.</label>
                        <input class="control" data-role="cost-input" type="text" inputmode="decimal" autocomplete="off" />
                        <small data-role="cost-preview">Себест.: ${escapeHtml(formatRecalcValue(item.current?.cost_price, " ₽"))} → считается...</small>
                      </div>
                      <div class="field-wrap product-nutrition-field product-price-field">
                        <label class="field-label">Маржа %</label>
                        <input class="control" data-role="margin-input" type="text" inputmode="decimal" autocomplete="off" />
                        <small data-role="margin-preview">Маржа: ${escapeHtml(formatRecalcValue(item.current?.margin_percent, "%"))} → считается...</small>
                      </div>
                      <div class="field-wrap product-nutrition-field product-price-field">
                        <label class="field-label">Цена</label>
                        <input class="control" data-role="price-input" type="text" inputmode="decimal" autocomplete="off" />
                        <small data-role="price-preview">Цена: ${escapeHtml(formatRecalcValue(item.current?.price, " ₽"))} → считается...</small>
                      </div>
                    </div>
                    <div class="product-recalc-modal-breakdown" data-role="breakdown"></div>
                  </div>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
      <div class="product-photo-grid-modal-foot">
        <button type="button" class="btn" data-role="close">Закрыть</button>
        <button type="button" class="btn btn-primary" data-role="confirm">Пересчитать</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    list.forEach((item) => {
      const productId = Number(item.product_id);
      if (!Number.isFinite(productId) || productId <= 0) return;
      const cached = getCachedProductDetails(productId);
      setCachedProductDetails(productId, {
        product: {
          ...(cached?.product || {}),
          id: productId,
          name: item.name || cached?.product?.name || "",
          base_qty: item.base_qty ?? cached?.product?.base_qty,
          base_unit_id: item.base_unit_id ?? cached?.product?.base_unit_id,
          unit_id: item.unit_id ?? cached?.product?.unit_id,
          default_variant: item.default_variant ?? cached?.product?.default_variant,
          product_pcs_factor: item.product_pcs_factor ?? cached?.product?.product_pcs_factor,
          product_pcs_base_unit_id: item.product_pcs_base_unit_id ?? cached?.product?.product_pcs_base_unit_id,
          price: item.current?.price ?? cached?.product?.price,
          cost_price: item.current?.cost_price ?? cached?.product?.cost_price,
          margin_percent: item.current?.margin_percent ?? cached?.product?.margin_percent,
          price_source: item.sources?.price ?? cached?.product?.price_source,
          cost_price_source: item.sources?.cost_price ?? cached?.product?.cost_price_source,
        },
      });
    });
    const roundMoney = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
    };
    const virtualValues = new Map();
    const getRowByIndex = (index) => card.querySelector(`.product-recalc-modal-row[data-recalc-index="${index}"]`);
    const getIngredientsForItem = (item) => {
      const cached = getCachedProductDetails(item?.product_id);
      return Array.isArray(cached?.ingredients) ? cached.ingredients : [];
    };
    const calcItemFromComposition = (item) => {
      const ingredients = getIngredientsForItem(item);
      if (!ingredients.length) return item.calculated || {};
      const cached = getCachedProductDetails(item?.product_id);
      const productForCalc = {
        ...(cached?.product || {}),
        id: item.product_id,
        base_qty: item.base_qty ?? cached?.product?.base_qty,
        base_unit_id: item.base_unit_id ?? cached?.product?.base_unit_id,
        unit_id: item.unit_id ?? cached?.product?.unit_id,
        default_variant: item.default_variant ?? cached?.product?.default_variant,
        product_pcs_factor: item.product_pcs_factor ?? cached?.product?.product_pcs_factor,
        product_pcs_base_unit_id: item.product_pcs_base_unit_id ?? cached?.product?.product_pcs_base_unit_id,
      };
      const patched = ingredients.map((ing) => {
        const next = { ...ing };
        const virtual = virtualValues.get(Number(next.ingredient_id));
        if (virtual) {
          next.ingredient_cost_price = virtual.cost_price ?? next.ingredient_cost_price;
          next.ingredient_price = virtual.price ?? next.ingredient_price;
          next.margin_percent = virtual.margin_percent ?? next.margin_percent;
        }
        return next;
      });
      return calcCachedProductCompositionTotals(productForCalc, patched) || item.calculated || {};
    };
    const setItemSourceMode = (item, mode) => {
      const source = mode === "auto" ? "auto" : "manual";
      item.sources = item.sources || {};
      item.sources.cost_price = source;
      item.sources.price = source;
    };
    const syncRowSourceMode = (row, item) => {
      const isAuto = normalizeProductValueSource(item?.sources?.cost_price) === "auto" && normalizeProductValueSource(item?.sources?.price) === "auto";
      row.querySelector(".product-recalc-price-card")?.classList.toggle("is-auto", isAuto);
      row.querySelector('[data-role="source-auto"]')?.classList.toggle("is-active", isAuto);
      row.querySelector('[data-role="source-manual"]')?.classList.toggle("is-active", !isAuto);
      const hint = row.querySelector('[data-role="price-source-hint"]');
      if (hint) hint.textContent = isAuto ? "Считается из состава" : "Ручной ввод";
      row.querySelectorAll('[data-role="cost-input"],[data-role="margin-input"],[data-role="price-input"]').forEach((input) => {
        input.readOnly = isAuto;
      });
    };
    const renderCalculatedValues = () => {
      card.querySelectorAll(".product-recalc-modal-row").forEach((row) => {
        const index = Number(row.getAttribute("data-recalc-index"));
        const item = list[index];
        if (!item) return;
        const calculated = item.calculated || {};
        const cost = roundMoney(calculated.cost_price);
        const price = roundMoney(calculated.price);
        const margin = calculated.margin_percent != null ? roundMoney(calculated.margin_percent) : calcMarginFromPrice(cost, price);
        const costEl = row.querySelector('[data-role="cost-preview"]');
        const priceEl = row.querySelector('[data-role="price-preview"]');
        const marginEl = row.querySelector('[data-role="margin-preview"]');
        const costInput = row.querySelector('[data-role="cost-input"]');
        const priceInput = row.querySelector('[data-role="price-input"]');
        const marginInput = row.querySelector('[data-role="margin-input"]');
        const breakdownEl = row.querySelector('[data-role="breakdown"]');
        if (costInput) costInput.value = cost != null ? formatNumberForInputFixed(cost, 2) : "";
        if (priceInput) priceInput.value = price != null ? formatNumberForInputFixed(price, 2) : "";
        if (marginInput) marginInput.value = margin != null ? formatNumberForInputFixed(margin, 2) : "";
        if (costEl) {
          costEl.textContent = `Себест.: ${formatRecalcValue(item.current?.cost_price, " ₽")} → ${formatRecalcValue(cost, " ₽")}`;
        }
        if (priceEl) {
          priceEl.textContent = `Цена: ${formatRecalcValue(item.current?.price, " ₽")} → ${formatRecalcValue(price, " ₽")}`;
        }
        if (marginEl) marginEl.textContent = `Маржа: ${formatRecalcValue(item.current?.margin_percent, "%")} → ${formatRecalcValue(margin, "%")}`;
        if (breakdownEl) breakdownEl.textContent = renderRecalcBreakdown(calculated);
        syncRowSourceMode(row, item);
      });
    };
    const recalcModalCascade = () => {
      virtualValues.clear();
      list.forEach((item, index) => {
        const row = getRowByIndex(index);
        const isAuto = normalizeProductValueSource(item?.sources?.cost_price) === "auto" && normalizeProductValueSource(item?.sources?.price) === "auto";
        if (isAuto) {
          item.calculated = calcItemFromComposition(item);
        } else if (row) {
          item.calculated = {
            ...(item.calculated || {}),
            cost_price: parseNumberFromInput(row.querySelector('[data-role="cost-input"]')?.value),
            price: parseNumberFromInput(row.querySelector('[data-role="price-input"]')?.value),
            margin_percent: parseNumberFromInput(row.querySelector('[data-role="margin-input"]')?.value),
          };
        }
        virtualValues.set(Number(item.product_id), item.calculated || {});
      });
      renderCalculatedValues();
    };
    (async () => {
      try {
        const missingIds = [];
        list.forEach((item) => {
          const productId = Number(item.product_id);
          const cached = getCachedProductDetails(productId);
          const totals = calcCachedProductCompositionTotals(
            {
              ...(cached?.product || {}),
              id: productId,
              base_qty: item.base_qty ?? cached?.product?.base_qty,
              base_unit_id: item.base_unit_id ?? cached?.product?.base_unit_id,
              unit_id: item.unit_id ?? cached?.product?.unit_id,
              default_variant: item.default_variant ?? cached?.product?.default_variant,
              product_pcs_factor: item.product_pcs_factor ?? cached?.product?.product_pcs_factor,
              product_pcs_base_unit_id: item.product_pcs_base_unit_id ?? cached?.product?.product_pcs_base_unit_id,
            },
            cached?.ingredients
          );
          if (totals) {
            item.calculated = totals;
          } else if (Number.isFinite(productId) && productId > 0) {
            missingIds.push(productId);
          }
        });
        for (const productId of missingIds.slice()) {
          try {
            const ingredientRes = await apiGetProductIngredients(productId);
            const ingredients = Array.isArray(ingredientRes?.data) ? ingredientRes.data : [];
            if (ingredients.length) {
              const item = list.find((row) => Number(row.product_id) === Number(productId));
              setCachedProductDetails(productId, {
                product: {
                  ...(getCachedProductDetails(productId)?.product || {}),
                  id: productId,
                  name: item?.name || "",
                  base_qty: item?.base_qty,
                  base_unit_id: item?.base_unit_id,
                  unit_id: item?.unit_id,
                  default_variant: item?.default_variant || null,
                  product_pcs_factor: item?.product_pcs_factor,
                  product_pcs_base_unit_id: item?.product_pcs_base_unit_id,
                },
                ingredients,
              });
            }
          } catch (e) {
            console.warn("Failed to prefetch dependent ingredients", productId, e);
          }
        }
        recalcModalCascade();
        const stillMissingIds = missingIds.filter((productId) => !getIngredientsForItem({ product_id: productId }).length);
        if (!stillMissingIds.length) {
          if (document.body.contains(card)) recalcModalCascade();
          return;
        }
        const res = await apiGetProductDependentRecalcValues(stillMissingIds);
        const byId = new Map((Array.isArray(res?.items) ? res.items : []).map((item) => [Number(item.product_id), item.calculated || {}]));
        list.forEach((item) => {
          if (!item.calculated) item.calculated = byId.get(Number(item.product_id)) || {};
        });
        if (document.body.contains(card)) recalcModalCascade();
      } catch (e) {
        console.error("Failed to load dependent recalc values", e);
        card.querySelectorAll('[data-role="cost-preview"], [data-role="price-preview"]').forEach((el) => {
          el.textContent = el.textContent.replace("считается...", "не удалось посчитать");
        });
      }
    })();
    list.forEach((item, index) => {
      item.calculated = {
        cost_price: item.current?.cost_price ?? null,
        price: item.current?.price ?? null,
        margin_percent: item.current?.margin_percent ?? null,
        ...(item.calculated || {}),
      };
      const row = getRowByIndex(index);
      if (!row) return;
      row.querySelector('[data-role="source-auto"]')?.addEventListener("click", () => {
        setItemSourceMode(item, "auto");
        const costCheck = row.querySelector('[data-field="cost_price"]');
        const priceCheck = row.querySelector('[data-field="price"]');
        if (costCheck) costCheck.checked = true;
        if (priceCheck) priceCheck.checked = true;
        recalcModalCascade();
      });
      row.querySelector('[data-role="source-manual"]')?.addEventListener("click", () => {
        setItemSourceMode(item, "manual");
        const costCheck = row.querySelector('[data-field="cost_price"]');
        const priceCheck = row.querySelector('[data-field="price"]');
        if (costCheck) costCheck.checked = true;
        if (priceCheck) priceCheck.checked = true;
        recalcModalCascade();
      });
      const costInput = row.querySelector('[data-role="cost-input"]');
      const priceInput = row.querySelector('[data-role="price-input"]');
      const marginInput = row.querySelector('[data-role="margin-input"]');
      costInput?.addEventListener("input", () => {
        setItemSourceMode(item, "manual");
        const costCheck = row.querySelector('[data-field="cost_price"]');
        if (costCheck) costCheck.checked = true;
        const margin = calcMarginFromPrice(parseNumberFromInput(costInput.value), parseNumberFromInput(priceInput?.value));
        if (marginInput && margin != null) marginInput.value = formatNumberForInputFixed(margin, 2);
        recalcModalCascade();
      });
      priceInput?.addEventListener("input", () => {
        setItemSourceMode(item, "manual");
        const priceCheck = row.querySelector('[data-field="price"]');
        if (priceCheck) priceCheck.checked = true;
        const margin = calcMarginFromPrice(parseNumberFromInput(costInput?.value), parseNumberFromInput(priceInput.value));
        if (marginInput && margin != null) marginInput.value = formatNumberForInputFixed(margin, 2);
        recalcModalCascade();
      });
      marginInput?.addEventListener("input", () => {
        setItemSourceMode(item, "manual");
        const priceCheck = row.querySelector('[data-field="price"]');
        if (priceCheck) priceCheck.checked = true;
        const nextValue = normalizeLimitedDecimalInput(marginInput.value, 2);
        if (marginInput.value !== nextValue) marginInput.value = nextValue;
        const price = calcPriceFromMargin(parseNumberFromInput(costInput?.value), parseNumberFromInput(marginInput.value));
        if (priceInput && price != null) priceInput.value = formatNumberForInputFixed(price, 2);
        recalcModalCascade();
      });
    });
    recalcModalCascade();
    const onClose = () => closeProductDependentRecalcModal();
    card.querySelector(".product-photo-grid-modal-close")?.addEventListener("click", onClose);
    card.querySelector('[data-role="close"]')?.addEventListener("click", onClose);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) onClose();
    });
    card.querySelector('[data-role="confirm"]')?.addEventListener("click", async () => {
      const selected = [];
      card.querySelectorAll(".product-recalc-modal-row").forEach((row) => {
        const index = Number(row.getAttribute("data-recalc-index"));
        const item = list[index];
        if (!item || !row.querySelector('[data-role="row-check"]')?.checked) return;
        const fields = {};
        row.querySelectorAll('[data-role="field-check"]').forEach((checkbox) => {
          fields[String(checkbox.getAttribute("data-field") || "")] = Boolean(checkbox.checked);
        });
        if (!Object.values(fields).some(Boolean)) return;
        selected.push({
          product_id: Number(item.product_id),
          depth: Number(item.depth || 0),
          fields,
          sources: item.sources || {},
          calculated: item.calculated || null,
        });
      });
      if (!selected.length) {
        onClose();
        return;
      }
      const confirmBtn = card.querySelector('[data-role="confirm"]');
      if (confirmBtn) confirmBtn.disabled = true;
      try {
        const res = await apiRecalculateProductDependents({ items: selected });
        const updatedIds = Array.isArray(res?.updated_ids) ? res.updated_ids.map(Number).filter((id) => Number.isFinite(id)) : selected.map((item) => item.product_id);
        const updatedProducts = Array.isArray(res?.products) ? res.products : [];
        updatedProducts.forEach((product) => {
          const productId = Number(product.id);
          const existingIndex = (state.products || []).findIndex((item) => Number(item.id) === productId);
          if (existingIndex >= 0) {
            state.products[existingIndex] = { ...state.products[existingIndex], ...product };
            const row = productsList?.querySelector(`.order-row.product-row[data-id="${productId}"]`);
            if (row) {
              const canSortProducts = !state.productsHasMore && !state.productsLoading;
              const template = document.createElement("template");
              template.innerHTML = buildProductRowHtml(state.products[existingIndex], canSortProducts).trim();
              const nextRow = template.content.firstElementChild;
              if (nextRow) {
                row.replaceWith(nextRow);
                bindProductRowClickHandlers(productsList);
                bindProductRowInlineEditors(productsList);
              }
            }
          }
          const cached = getCachedProductDetails(product.id);
          setCachedProductDetails(product.id, { product: { ...(cached?.product || {}), ...product } });
          clearCachedProductView(product.id);
        });
        if (state.productDetailsCache instanceof Map) {
          state.productDetailsCache.forEach((cached) => {
            if (!Array.isArray(cached?.ingredients)) return;
            cached.ingredients.forEach((ing) => {
              const updated = updatedProducts.find((product) => Number(product.id) === Number(ing.ingredient_id));
              if (!updated) return;
              ing.ingredient_price = updated.price;
              ing.ingredient_cost_price = updated.cost_price;
              ing.margin_percent = updated.margin_percent;
            });
          });
        }
        const activeTab = tabsState.tabs.find((tab) => tab.key === tabsState.activeKey);
        const activeProductId = activeTab?.type === "product" ? Number(activeTab.id || 0) : 0;
        const activeUpdated = updatedProducts.find((product) => Number(product.id) === activeProductId);
        if (activeUpdated && !editingProducts.has(activeProductId)) {
          showProductDetails({ ...(getCachedProductDetails(activeProductId)?.product || {}), ...activeUpdated });
        }
        showToast("Связанные товары пересчитаны", "success");
        onClose();
      } catch (e) {
        console.error("Failed to recalculate dependent products", e);
        showToast("Не удалось пересчитать связанные товары");
        if (confirmBtn) confirmBtn.disabled = false;
      }
    });
    productDependentRecalcEscHandler = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", productDependentRecalcEscHandler);
  }

  function openOptionGroupTab(groupId, title, { activate = true } = {}) {
    if (!Number.isFinite(groupId)) return;
    ensureTab({
      type: "option",
      id: groupId,
      title: title || "Опция",
      onActivate: async () => {
        // Save current option's editing state when switching to another option tab
        const prevId = state.selectedOptionGroupId;
        if (prevId != null && prevId !== groupId && (state.optionPanel.mode === "edit" || state.optionPanel.mode === "create" || editingOptions.has(prevId))) {
          editingOptions.set(prevId, {
            mode: state.optionPanel.mode || "view",
            optionDraft: state.optionDraft ? deepClone(state.optionDraft) : null,
            snapshotData: state.optionPanel.snapshotData ? deepClone(state.optionPanel.snapshotData) : null
          });
        }

        state.selectedOptionGroupId = groupId;
        await loadOptionGroupDetails(groupId);
        renderAllOptionGroupsLists();

        // Restore edit state when switching back to an option tab that was being edited
        if (editingOptions.has(groupId)) {
          const editingState = editingOptions.get(groupId);
          state.optionPanel.mode = editingState.mode;
          state.optionDraft = deepClone(editingState.optionDraft);
          state.optionPanel.snapshotData = deepClone(editingState.snapshotData);
          showOptionGroupDetails(state.optionGroupDetails, { mode: editingState.mode });
        } else {
          showOptionGroupDetails(state.optionGroupDetails, { mode: state.optionPanel.mode || "view" });
        }
      },
      activate,
    });
  }

  function openVariantGroupTab(groupId, title, { activate = true } = {}) {
    if (!Number.isFinite(groupId)) return;
    ensureTab({
      type: "variant",
      id: groupId,
      title: title || "Вариант",
      onActivate: async () => {
        // Save current variant's editing state when switching to another variant tab
        const prevId = state.selectedVariantGroupId;
        if (prevId != null && prevId !== groupId && (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create" || editingVariants.has(prevId))) {
          editingVariants.set(prevId, {
            mode: state.variantPanel.mode || "view",
            variantDraft: state.variantDraft ? deepClone(state.variantDraft) : null,
            snapshotData: state.variantPanel.snapshotData ? deepClone(state.variantPanel.snapshotData) : null
          });
        }

        state.selectedVariantGroupId = groupId;
        await loadVariantGroupDetails(groupId);
        renderVariantGroupsList();

        // Restore edit state when switching back to a variant tab that was being edited
        if (editingVariants.has(groupId)) {
          const editingState = editingVariants.get(groupId);
          state.variantPanel.mode = editingState.mode;
          state.variantDraft = deepClone(editingState.variantDraft);
          state.variantPanel.snapshotData = editingState.snapshotData ? deepClone(editingState.snapshotData) : null;
          showVariantGroupDetails(state.variantGroupDetails, { mode: editingState.mode });
        } else {
          showVariantGroupDetails(state.variantGroupDetails, { mode: state.variantPanel.mode || "view" });
        }
      },
      activate,
    });
  }

  function openUnitTab(unitId, title, { activate = true } = {}) {
    if (!Number.isFinite(unitId)) return;
    ensureTab({
      type: "unit",
      id: unitId,
      title: title || "Единица измерения",
      onActivate: async () => {
        state.selectedUnitId = unitId;
        await loadUnitDetails(unitId);
        renderUnitsList();
        showUnitDetails(state.unitDetails, { mode: state.unitPanel.mode || "view" });
      },
      activate,
    });
  }

  function openCategoryTab(category, { activate = true } = {}) {
    if (!category || !category.id) return;
    const categoryId = Number(category.id);
    ensureTab({
      type: "category",
      id: categoryId,
      title: category.title || "Категория",
      onActivate: () => {
        state.selectedCategoryId = categoryId;
        // Check if this category is being edited
        if (editingCategories.has(categoryId)) {
          const editingState = editingCategories.get(categoryId);
          pushNavigationState(editingState.navigationState);
          showProductFooterEdit();
          return;
        }
        const latestCategory = state.categories.find((c) => Number(c.id) === categoryId) || category;
        showCategoryDetails(latestCategory);
      },
      activate,
    });
  }

  function attachTwoStepButton(btn, onConfirm, confirmText) {
    if (!btn) return;
    if (btn.__twoStepBound) return;
    btn.__twoStepBound = true;
    let armed = false;
    let timer = null;

    const reset = () => {
      armed = false;
      btn.classList.remove("is-confirm");
      if (btn.dataset.originalHtml != null) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
      if (btn.dataset.originalTitle != null) {
        btn.title = btn.dataset.originalTitle;
      }
      if (btn.dataset.originalAria != null) {
        btn.setAttribute("aria-label", btn.dataset.originalAria);
      }
      if (timer) clearTimeout(timer);
      timer = null;
    };

    const arm = () => {
      armed = true;
      btn.classList.add("is-confirm");
      if (confirmText) {
        if (btn.dataset.originalHtml == null) {
          btn.dataset.originalHtml = btn.innerHTML;
        }
        if (btn.dataset.originalTitle == null) {
          btn.dataset.originalTitle = btn.title || "";
        }
        if (btn.dataset.originalAria == null) {
          btn.dataset.originalAria = btn.getAttribute("aria-label") || "";
        }
        btn.textContent = confirmText;
        btn.title = confirmText;
        btn.setAttribute("aria-label", confirmText);
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(reset, 6500);
    };

    btn.addEventListener("click", () => {
      // If picker is open, bypass two-step and call onConfirm immediately
      if (btn.dataset.pickerType) {
        if (onConfirm) onConfirm();
        return;
      }
      // Normal two-step logic
      if (!armed) {
        arm();
        return;
      }
      reset();
      if (onConfirm) onConfirm();
    });

    document.addEventListener(
      "click",
      (e) => {
        if (!armed) return;
        if (btn.contains(e.target)) return;
        reset();
      },
      true
    );
  }

  function clearProductSelection() {
    state.selectedProductId = null;
    state.selectedCategoryId = null;
    state.selectedProductCategories = [];
    state.selectedOptionGroupId = null;
    state.optionGroupDetails = null;
    state.selectedAutoAddGroupId = null;
    state.autoAddGroupDetails = null;
    state.selectedProductOptionAssignments = [];
    state.optionPanel.level = "empty";
    state.optionPanel.mode = "view";
    state.optionPanel.pickerSelection = new Set();
    state.optionPanel.returnTo = null;
    state.optionPanel.snapshotData = null;
    state.optionDraft = null;
    state.autoAddPanel.level = "empty";
    state.autoAddPanel.mode = "view";
    state.autoAddPanel.snapshotData = null;
    state.autoAddPanel.pickerSelection = new Set();
    state.autoAddPanel.pickerInitialSelection = new Set();
    state.autoAddPanel.pickerCategoryId = null;
    state.autoAddPanel.pickerProducts = [];
    state.autoAddPanel.pickerQuery = "";
    state.autoAddDraft = null;
    
    // Clear navigation stack
    clearNavigationStack();
    
    showDetailsEmpty();
    if (productsList) $$(".order-row", productsList).forEach((x) => x.classList.remove("is-active"));
    if (categoriesMainList) $$(".order-row", categoriesMainList).forEach((x) => x.classList.remove("is-active"));
    if (optionsGroupsList) $$(".options-row", optionsGroupsList).forEach((x) => x.classList.remove("is-active"));
    if (autoAddGroupsList) $$(".options-row", autoAddGroupsList).forEach((x) => x.classList.remove("is-active"));
    schedulePersistProductsCache();
  }

  // ---------------- Modal: product (chips + photos) ----------------

  function openProductModal({ mode, product, host } = {}) {
    const isEdit = mode === "edit";
    const isCreate = mode === "create";
    const isView = mode === "view";
    const isEditable = isEdit || isCreate;
    const useHost = Boolean(host);
    const tabId = product && product.id ? product.id : `new-${Date.now()}`;
    const tabKey = buildTabKey("product", tabId);
    const viewProductId = isView && Number.isFinite(Number(product?.id)) ? Number(product.id) : null;

    if (isView && useHost && viewProductId && host) {
      const cachedView = getCachedProductView(viewProductId);
      if (cachedView) {
        host.innerHTML = "";
        host.appendChild(cachedView);
        if (productTitle) productTitle.textContent = product?.name || "-";
        if (productSku) productSku.textContent = product?.sku ? `SKU: ${product.sku}` : "SKU: -";
        return;
      }
    }

    const defaultSelected = new Set();
    if (state.allCategoryId) defaultSelected.add(state.allCategoryId);
    if (isCreate) {
      if (state.currentCategoryId && state.currentCategoryId !== state.allCategoryId) defaultSelected.add(state.currentCategoryId);
    }

    const cachedProductDetails = product?.id ? getCachedProductDetails(product.id) : null;
    const initialSelectedCategories = (
      Number(state.selectedProductId) === Number(product?.id)
        ? state.selectedProductCategories
        : cachedProductDetails?.categories
    );
    if (Array.isArray(initialSelectedCategories)) {
      initialSelectedCategories.forEach((category) => {
        const categoryId = Number(category?.id ?? category);
        if (Number.isFinite(categoryId) && categoryId > 0) defaultSelected.add(categoryId);
      });
    }

    const initialPhotos = product && Array.isArray(product.photos) ? product.photos.slice(0, 10) : [];

    const draft = {
      categories: defaultSelected,   // Set<number>
      photos: initialPhotos.map((url) => ({ kind: "url", url })), // {kind:'url'|'file', url|file, preview}
      activePhotoIdx: initialPhotos.length > 0 ? 0 : -1,
      blocksConfig: normalizeProductBlocksConfig(product?.blocks_config),
      valueSources: {
        cost_price: normalizeProductValueSource(product?.cost_price_source),
        price: normalizeProductValueSource(product?.price_source),
        base_qty: normalizeProductValueSource(product?.base_qty_source),
      },
      nutritionProblems: Array.isArray(product?.nutrition_problems) ? product.nutrition_problems : [],
      nutritionIncomplete: Boolean(product?.nutrition_incomplete),
      optionGroups: new Set(),
      initialOptionGroups: new Set(),
      variantGroupId: null,
      initialVariantGroupId: null,
      initialVariantAssignments: [],
    };

    // Initialize draftIngredients early (used in editing state)
    const draftIngredients = new Map();
    const initialIngredientsSnapshot = new Map();

    function snapshotIngredients() {
      initialIngredientsSnapshot.clear();
      draftIngredients.forEach((item, key) => {
        initialIngredientsSnapshot.set(key, deepClone(item));
      });
    }

    // если edit/view — подгружаем категории товара
    const loadCatsPromise = (async () => {
      if ((!isEdit && !isView) || !product) return;
      const res = await api(`/api/prod_products/${product.id}/categories?tenant_id=${TENANT_ID}`);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.forEach((c) => draft.categories.add(Number(c.id)));
    })();

    const loadOptionsPromise = (async () => {
      await loadOptionGroups();
      if ((!isEdit && !isView) || !product) return;
      const res = await apiGetProductOptionAssignments(product.id);
      const arr = Array.isArray(res.data) ? res.data : [];
      arr.filter((a) => a.is_active).forEach((a) => {
        draft.optionGroups.add(Number(a.group_id));
        draft.initialOptionGroups.add(Number(a.group_id));
      });
    })();

    const loadVariantsPromise = (async () => {
      await loadVariantGroups();
      if ((!isEdit && !isView) || !product) return;
      const res = await apiGetProductVariants(product.id);
      const arr = Array.isArray(res.data) ? res.data : [];
      // Store variant data with default_value_index for later use (per-product override aware)
      draft.productVariants = arr.map((v) => ({
        id: Number(v.id),
        default_value_index: v.default_value_index != null ? Number(v.default_value_index) : null,
      }));
      draft.initialVariantAssignments = arr
        .map((v) => ({
          assignment_id: Number(v.assignment_id),
          group_id: Number(v.id),
        }))
        .filter((v) => Number.isFinite(v.assignment_id) && Number.isFinite(v.group_id));
      const first = arr[0];
      const firstId = first ? Number(first.id) : null;
      if (Number.isFinite(firstId)) {
        draft.variantGroupId = firstId;
        draft.initialVariantGroupId = firstId;
      } else {
        draft.variantGroupId = null;
        draft.initialVariantGroupId = null;
      }
    })();

    // Обработчик клавиатуры для навигации фото
    let keyboardHandler = null;
    let globalPhotoDropHandlers = null;
    let globalPhotoPasteHandler = null;

    // Clone template content
    const template = document.querySelector("#tplProductEditor");
    if (!template) return;
    const content = template.content.cloneNode(true);
    const body = content.querySelector("#productEditorForm")?.parentElement || content;
    
    // Create wrapper for right panel
    const wrapper = document.createElement("div");
    wrapper.className = "product-editor-wrapper";
    if (isView) wrapper.classList.add("product-editor-view");
    wrapper.appendChild(body);

    if (isEditable && productInfo && !useHost) {
      productInfo.innerHTML = "";
    }

    // Save title and SKU for restoration
    const savedTitle = productTitle ? productTitle.textContent : "";
    const savedSku = productSku ? productSku.textContent : "";

    // Update title and SKU in header for editor
    if (productTitle) {
      if (isView && product) {
        productTitle.textContent = product.name || "—";
      } else if (isEdit && product) {
        productTitle.textContent = product.name || "Редактировать товар";
      } else {
        productTitle.textContent = "Новый товар";
      }
    }
    if (productSku) {
      if ((isEdit || isView) && product) {
        productSku.textContent = `Артикул: ${product.sku || "—"}`;
      } else {
        productSku.textContent = "Артикул: —";
      }
    }

    if (useHost && host) {
      host.innerHTML = "";
      host.appendChild(wrapper);
      if (isView && viewProductId) {
        setCachedProductView(viewProductId, wrapper);
      }
    }

    // Create navigation state
    const navigationState = useHost ? null : {
      type: isEditable ? "product-edit" : "product-view",
      content: wrapper,
      isEdit: isEdit,
      product: product,
      savedTitle: savedTitle,
      savedSku: savedSku,
      tabKey: tabKey,
      onSave: isEditable ? async () => {
        try {
          // Find form in the wrapper (which is now in DOM) or in document
          const form = $("#productEditorForm", wrapper) || document.querySelector("#productEditorForm");
          if (!form) {
            console.error('Product editor form not found');
            alert('Ошибка: форма редактирования не найдена');
            return false;
          }

          const fulfillmentMode = normalizeProductFulfillmentMode(form.fulfillment_mode?.value);
          if (fulfillmentMode === "made_to_order" && draftIngredients.size === 0) {
            showToast('Для режима "Под заказ" добавьте состав товара.');
            return false;
          }

          // сначала грузим новые фото (если есть)
          const newFiles = draft.photos.filter((x) => x.kind === "file").map((x) => x.file);
          let newUrls = [];
          let newSizes = [];
          if (newFiles.length) {
            try {
              const uploadResult = await apiUploadImages(newFiles);
              newUrls = uploadResult.urls;
              newSizes = uploadResult.sizes;
            } catch (e) {
              console.error('Failed to upload images', e);
              alert('Ошибка при загрузке фотографий');
              return false;
            }
          }

          // финальный список URL (сохраняем порядок)
          let urlIdx = 0;
          const finalUrls = draft.photos
            .map((x) => (x.kind === "url" ? x.url : newUrls[urlIdx++]))
            .filter(Boolean)
            .slice(0, 10);

          const baseUnitId = form.base_unit_id?.value === "" ? null : Number(form.base_unit_id?.value);
          
          // Сохраняем себестоимость и цену как введено в форме (пересчёт только через меню «три точки»)
          const costPriceValue = parseNumberFromInput(form.cost_price.value) ?? 0;
          const marginPercentValue = parseNumberFromInput(form.margin_percent?.value);
          const priceValue = parseNumberFromInput(form.price.value) ?? 0;
          const payload = {
            tenant_id: TENANT_ID,
            name: String(form.name.value || "").trim(),
            sku: String(form.sku.value || "").trim(),
            description_short: String(form.description_short.value || "").trim(),
            description: String(form.description.value || "").trim(),
            client_composition: String(form.client_composition?.value || "").trim(),
            tech_process: String(form.tech_process?.value || "").trim(),
            nutrition_protein_100g: parseNumberFromInput(form.querySelector("#pe_nutrition_protein")?.value),
            nutrition_fat_100g: parseNumberFromInput(form.querySelector("#pe_nutrition_fat")?.value),
            nutrition_carbs_100g: parseNumberFromInput(form.querySelector("#pe_nutrition_carbs")?.value),
            show_description_short: form.show_description_short?.checked ? 1 : 0,
            show_description: form.show_description?.checked ? 1 : 0,
            show_client_composition: form.show_client_composition?.checked ? 1 : 0,
            show_tech_process: form.show_tech_process?.checked ? 1 : 0,
            price: priceValue,
            old_price: parseNumberFromInput(form.old_price.value),
            cost_price: costPriceValue,
            price_source: normalizeProductValueSource(draft.valueSources?.price),
            margin_percent: marginPercentValue,
            cost_price_source: normalizeProductValueSource(draft.valueSources?.cost_price),
            unit_id: baseUnitId,
            base_unit_id: baseUnitId,
            base_qty: parseNumberFromInput(form.base_qty?.value),
            base_qty_source: normalizeProductValueSource(draft.valueSources?.base_qty),
            stock: parseNumberFromInput(form.stock?.value),
            is_active: form.is_active.checked ? 1 : 0,
            site_visibility: form.site_visibility.checked ? 1 : 0,
            fulfillment_mode: fulfillmentMode,

            // ✅ категории из chips
            category_ids: Array.from(draft.categories).filter((id) => Number.isFinite(id)),
            blocks_config: normalizeProductBlocksConfig(draft.blocksConfig),

            // ✅ фото JSON
            photos_json: finalUrls
          };

          if (!payload.name) {
            form.name.focus();
            return false;
          }

          let productId = product && product.id;
          let saveResult = null;
          const dependentRecalcChanges = isEdit && product
            ? buildProductDependentRecalcChanges(product, payload, initialIngredientsSnapshot, draftIngredients)
            : null;
          
          // Сохранение товара
          try {
            if (isEdit && product) {
              saveResult = await api(`/api/prod_products/${product.id}`, { method: "PUT", body: JSON.stringify(payload) });
            } else {
              const created = await api("/api/prod_products", { method: "POST", body: JSON.stringify(payload) });
              saveResult = created;
              productId = created && created.id;
            }
          } catch (e) {
            console.error('Failed to save product', e);
            alert('Ошибка при сохранении товара: ' + (e.message || 'Неизвестная ошибка'));
            return false;
          }

          if (!productId) {
            alert('Не удалось получить ID товара после сохранения');
            return false;
          }

          try {
            if (pcsUnitId && baseUnitId === pcsUnitId) {
              await savePcsToUnitLink(productId);
            } else {
              await savePcsLink(productId, baseUnitId);
            }
          } catch (e) {
            console.error("Failed to save pcs link", e);
          }

          // Сохранение опций
          try {
            const selected = new Set(Array.from(draft.optionGroups).filter((x) => Number.isFinite(x)));
            if (isEdit) {
              const toAdd = Array.from(selected).filter((id) => !draft.initialOptionGroups.has(id));
              const toRemove = Array.from(draft.initialOptionGroups).filter((id) => !selected.has(id));
              if (toAdd.length) {
                await apiAddProductOptionAssignments(productId, toAdd);
              }
              for (const gid of toRemove) {
                await apiDisableProductOptionAssignment(productId, gid);
              }
            } else if (selected.size) {
              await apiAddProductOptionAssignments(productId, Array.from(selected));
            }
          } catch (e) {
            console.error('Failed to save options', e);
            // Не критично, продолжаем
          }

          // Сохранение варианта (одна группа на товар)
          try {
            const selectedVariantId = Number(draft.variantGroupId);
            const hasSelectedVariant = Number.isFinite(selectedVariantId) && selectedVariantId > 0;
            const initialAssignments = Array.isArray(draft.initialVariantAssignments) ? draft.initialVariantAssignments : [];
            const initialId = Number(draft.initialVariantGroupId);
            const hasInitial = Number.isFinite(initialId) && initialId > 0;
            const needsSync = isEdit && ((hasSelectedVariant ? selectedVariantId !== initialId : hasInitial) || initialAssignments.length > 1);

            if (isEdit) {
              if (needsSync) {
                for (const assignment of initialAssignments) {
                  if (Number.isFinite(assignment.assignment_id)) {
                    await apiDeleteVariantAssignment(assignment.assignment_id);
                  }
                }
                if (hasSelectedVariant) {
                  await apiAddVariantGroupAssignments(selectedVariantId, [productId]);
                }
              }
            } else if (hasSelectedVariant) {
              await apiAddVariantGroupAssignments(selectedVariantId, [productId]);
            }
          } catch (e) {
            console.error('Failed to save variants', e);
            // Не критично, продолжаем
          }

          // Save ingredients from draft
          if (!isEdit && draftIngredients.size > 0) {
            for (const ing of draftIngredients.values()) {
              try {
                await apiAddProductIngredient(productId, {
                  ingredient_id: ing.ingredient_id,
                  quantity: ing.quantity,
                  unit_id: Number(ing.unit_id || ing.ingredient_unit_id || 0),
                  quantity_min: ing.is_variable ? ing.quantity_min : null,
                  quantity_max: ing.is_variable ? ing.quantity_max : null,
                  quantity_step: ing.is_variable ? ing.quantity_step : null,
                  price_override: ing.price_override,
                  is_variable: ing.is_variable ? 1 : 0,
                });
              } catch (e) {
                console.error('Failed to save ingredient', e);
                // Не критично для отдельных ингредиентов
              }
            }
          }

          if (isEdit) {
            const normalizeIngredient = (ing) => ({
              quantity: Number(ing.quantity || 0),
              unit_id: Number(ing.unit_id || ing.ingredient_unit_id || 0),
              is_variable: ing.is_variable ? 1 : 0,
              quantity_min: ing.is_variable ? (ing.quantity_min != null ? Number(ing.quantity_min) : null) : null,
              quantity_max: ing.is_variable ? (ing.quantity_max != null ? Number(ing.quantity_max) : null) : null,
              quantity_step: ing.is_variable ? (ing.quantity_step != null ? Number(ing.quantity_step) : null) : null,
              price_override: ing.price_override != null ? Number(ing.price_override) : null,
              sort_order: Number(ing.sort_order || 0),
            });

            const currentIds = new Set(Array.from(draftIngredients.keys()));
            const initialIds = new Set(Array.from(initialIngredientsSnapshot.keys()));
            const toAdd = Array.from(currentIds).filter((id) => !initialIds.has(id));
            const toRemove = Array.from(initialIds).filter((id) => !currentIds.has(id));
            const toUpdate = Array.from(currentIds).filter((id) => initialIds.has(id));

            try {
              for (const ingredientId of toAdd) {
                const ing = draftIngredients.get(ingredientId);
                if (!ing) continue;
                await apiAddProductIngredient(productId, {
                  ingredient_id: ing.ingredient_id,
                  ...normalizeIngredient(ing),
                });
              }

              for (const ingredientId of toUpdate) {
                const ing = draftIngredients.get(ingredientId);
                const snapshot = initialIngredientsSnapshot.get(ingredientId);
                if (!ing || !snapshot) continue;
                const normalizedCurrent = normalizeIngredient(ing);
                const normalizedSnapshot = normalizeIngredient(snapshot);
                if (JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedSnapshot)) {
                  continue;
                }
                await apiUpdateProductIngredient(productId, ingredientId, normalizedCurrent);
              }

              for (const ingredientId of toRemove) {
                await apiDeleteProductIngredient(productId, ingredientId);
              }

              snapshotIngredients();
            } catch (e) {
              console.error('Failed to save ingredients', e);
              alert('Ошибка при сохранении состава');
            }
          }

          const savedIngredientsForCache = Array.from(draftIngredients.values()).map((ing) => deepClone(ing));
          let savedProductForView = {
            ...(product || {}),
            ...payload,
            id: productId,
            photos: finalUrls,
            photos_json: JSON.stringify(finalUrls),
            stock_qty: payload.stock,
            blocks_config: normalizeProductBlocksConfig(draft.blocksConfig),
            nutrition_per_100g: {
              kcal: parseNumberFromInput(form.querySelector("#pe_nutrition_kcal")?.value),
              protein: payload.nutrition_protein_100g,
              fat: payload.nutrition_fat_100g,
              carbs: payload.nutrition_carbs_100g,
            },
          };
          upsertSavedProductInList(savedProductForView, payload.category_ids);
          if (state.productDetailsCache instanceof Map) {
            state.productDetailsCache.forEach((cached) => {
              if (!Array.isArray(cached?.ingredients)) return;
              cached.ingredients.forEach((ing) => {
                if (Number(ing?.ingredient_id) !== Number(productId)) return;
                ing.ingredient_name = savedProductForView.name;
                ing.ingredient_price = savedProductForView.price;
                ing.ingredient_cost_price = savedProductForView.cost_price;
                ing.margin_percent = savedProductForView.margin_percent;
                ing.ingredient_base_unit_id = savedProductForView.base_unit_id;
                ing.ingredient_base_qty = savedProductForView.base_qty;
                ing.nutrition_protein_100g = savedProductForView.nutrition_protein_100g;
                ing.nutrition_fat_100g = savedProductForView.nutrition_fat_100g;
                ing.nutrition_carbs_100g = savedProductForView.nutrition_carbs_100g;
                ing.nutrition_per_100g = savedProductForView.nutrition_per_100g;
              });
            });
          }
          const existingCachedDetails = getCachedProductDetails(productId);
          setCachedProductDetails(productId, {
            product: savedProductForView,
            categories: Array.isArray(existingCachedDetails?.categories) && existingCachedDetails.categories.length
              ? existingCachedDetails.categories
              : Array.from(draft.categories).map((id) => ({ id: Number(id) })).filter((item) => Number.isFinite(item.id)),
            optionAssignments: Array.isArray(existingCachedDetails?.optionAssignments) && existingCachedDetails.optionAssignments.length
              ? existingCachedDetails.optionAssignments
              : state.selectedProductOptionAssignments,
            ingredients: savedIngredientsForCache,
          });
          clearCachedProductView(productId);

          // Return to product details if editing
          if (isEdit && product) {
            // Remove from editing state BEFORE showing details (important!)
            if (productId && editingProducts.has(productId)) {
              editingProducts.delete(productId);
            }
            
            // Clear navigation FIRST to ensure clean state
            clearNavigationStack();
            currentNavigationState = null;
            
            // Find updated product in state
            let updatedProduct = savedProductForView || state.products.find(p => p.id === productId);
            
            // If product not found (e.g., it's in a different category), try to reload it
            if (!updatedProduct && productId) {
              try {
                // First try: reload products from current category
                await refreshProductsOnly(true);
                updatedProduct = state.products.find(p => p.id === productId);
                
                // Second try: if still not found, load from "all" category
                if (!updatedProduct && state.allCategoryId) {
                  const allRes = await api(`/api/prod_products?tenant_id=${TENANT_ID}&category_id=${state.allCategoryId}`);
                  const allProducts = Array.isArray(allRes.data) ? allRes.data : [];
                  updatedProduct = allProducts.find(p => p.id === productId);
                  // If found in "all", add it to current state
                  if (updatedProduct) {
                    state.products.push(updatedProduct);
                  }
                }
              } catch (e) {
                console.error('Failed to reload product', e);
              }
            }
            
            if (updatedProduct) {
              // Show product details (this will update header buttons)
              // Ensure product is NOT in editingProducts when showing details
              if (editingProducts.has(productId)) {
                editingProducts.delete(productId);
              }
              // Double check that navigation is cleared
              if (currentNavigationState) {
                currentNavigationState = null;
              }
              ensureTab({
                type: "product",
                id: updatedProduct.id,
                title: updatedProduct.name || "Товар",
                onActivate: () => {
                  openProductById(updatedProduct.id);
                },
                activate: false,
              });
              clearCachedProductView(updatedProduct.id);
              showProductDetails(updatedProduct);
              showProductFooterView();
            } else {
              // Product not found - show empty state
              showDetailsEmpty();
            }
          } else if (productId) {
            // New product - remove from editing state if it was there
            if (editingProducts.has(productId)) {
              editingProducts.delete(productId);
            }
            
            // Clear navigation
            clearNavigationStack();
            currentNavigationState = null;
            // New product - find it and show details
            const newProduct = savedProductForView || state.products.find(p => p.id === productId);
            if (newProduct) {
              clearNavigationStack();
              // Сначала заменяем таб «Новый товар» на таб с реальным id, чтобы showProductDetails не добавил дубликат
              replaceTabKey(tabKey, {
                type: "product",
                id: newProduct.id,
                title: newProduct.name || "Товар",
                onActivate: () => {
                  openProductById(newProduct.id);
                },
              });
              showProductDetails(newProduct);
              showProductFooterView();
            } else {
              clearNavigationStack();
            }
          } else {
            // No product ID - clear navigation
            clearNavigationStack();
          }

          let dependentItems = [];
          if (productId && dependentRecalcChanges?.hasChanges) {
            try {
              const previewRes = await apiGetProductDependentRecalcPreview(productId);
              dependentItems = Array.isArray(previewRes?.items) ? previewRes.items : [];
            } catch (e) {
              console.error("Failed to load dependent product preview", e);
              dependentItems = Array.isArray(saveResult?.dependent_recalc?.items)
                ? saveResult.dependent_recalc.items
                : [];
            }
          }
          if (dependentItems.length && dependentRecalcChanges?.hasChanges) {
            dependentItems = dependentItems.map((item) => ({
              ...item,
              changed_fields: dependentRecalcChanges.fields,
              change_labels: dependentRecalcChanges.labels,
            }));
          }
          if (dependentItems.length) {
            openProductDependentRecalcModal(dependentItems);
          }
          
          if (window.__productEditorRecalc) window.__productEditorRecalc = null;
          if (window.__productEditorBlocks) window.__productEditorBlocks = null;
          return true;
        } catch (e) {
          console.error('Unexpected error in onSave', e);
          alert('Неожиданная ошибка при сохранении: ' + (e.message || 'Неизвестная ошибка'));
          return false;
        }
      } : null,
      onClose: () => {
        // Remove from editing state when canceling
        if (product && product.id && editingProducts.has(product.id)) {
          editingProducts.delete(product.id);
        }
        // Сбрасываем пересчёт из меню «три точки»
        if (window.__productEditorRecalc) {
          window.__productEditorRecalc = null;
        }
        if (window.__productEditorBlocks) {
          window.__productEditorBlocks = null;
        }
        // Удаляем обработчик клавиатуры при закрытии
        if (keyboardHandler) {
          document.removeEventListener("keydown", keyboardHandler);
          keyboardHandler = null;
        }
        if (globalPhotoDropHandlers) {
          document.removeEventListener("dragover", globalPhotoDropHandlers.docDragOver);
          document.removeEventListener("drop", globalPhotoDropHandlers.docDrop);
          globalPhotoDropHandlers = null;
        }
        if (globalPhotoPasteHandler) {
          document.removeEventListener("paste", globalPhotoPasteHandler);
          globalPhotoPasteHandler = null;
        }
        closeProductPhotoModal();
      }
    };
    
    if (!useHost) {
      // Store editing state for this product (only for existing products)
      if (isEdit && product && product.id) {
        editingProducts.set(product.id, {
          navigationState: navigationState,
          draft: draft,
          draftIngredients: draftIngredients
        });
      }

      // Ensure tab exists for editor
      if (isEdit && product && product.id) {
        ensureTab({
          type: "product",
          id: product.id,
          title: product.name || "Товар",
          onActivate: () => {
            openProductById(product.id);
          },
          activate: false,
        });
      } else {
        ensureTab({
          type: "product",
          id: tabId,
          title: "Новый товар",
          onActivate: () => {
            currentNavigationState = navigationState;
            showNavigationState(navigationState);
            showProductFooterEdit();
          },
          activate: true,
        });
      }
      
      // Push to navigation stack
      pushNavigationState(navigationState);
      
      // Show footer in edit mode
      if (isEditable) {
        showProductFooterEdit();
      } else {
        showProductFooterView();
      }
    }

    const form = $("#productEditorForm", wrapper);
    if (!form) return;

    // prefill
    if ((isEdit || isView) && product) {
      form.name.value = product.name || "";
      form.sku.value = product.sku || "";
      form.description_short.value = product.description_short || "";
      form.description.value = product.description || "";
      if (form.client_composition) form.client_composition.value = product.client_composition || "";
      if (form.tech_process) form.tech_process.value = product.tech_process || "";
      if (form.show_description_short) form.show_description_short.checked = Number(product.show_description_short ?? 1) === 1;
      if (form.show_description) form.show_description.checked = Number(product.show_description ?? 1) === 1;
      if (form.show_client_composition) form.show_client_composition.checked = Number(product.show_client_composition ?? 1) === 1;
      if (form.show_tech_process) form.show_tech_process.checked = Number(product.show_tech_process ?? 1) === 1;
      const nutritionSource = product.nutrition_per_100g || product;
      const nutritionProteinInput = $("#pe_nutrition_protein", wrapper);
      const nutritionFatInput = $("#pe_nutrition_fat", wrapper);
      const nutritionCarbsInput = $("#pe_nutrition_carbs", wrapper);
      const nutritionKcalInput = $("#pe_nutrition_kcal", wrapper);
      if (nutritionProteinInput) nutritionProteinInput.value = nutritionSource.protein != null ? formatNumberForInputFixed(nutritionSource.protein, 2) : (product.nutrition_protein_100g != null ? formatNumberForInputFixed(product.nutrition_protein_100g, 2) : "");
      if (nutritionFatInput) nutritionFatInput.value = nutritionSource.fat != null ? formatNumberForInputFixed(nutritionSource.fat, 2) : (product.nutrition_fat_100g != null ? formatNumberForInputFixed(product.nutrition_fat_100g, 2) : "");
      if (nutritionCarbsInput) nutritionCarbsInput.value = nutritionSource.carbs != null ? formatNumberForInputFixed(nutritionSource.carbs, 2) : (product.nutrition_carbs_100g != null ? formatNumberForInputFixed(product.nutrition_carbs_100g, 2) : "");
      if (nutritionKcalInput) nutritionKcalInput.value = nutritionSource.kcal != null ? formatNumberForInputFixed(nutritionSource.kcal, 2) : (product.nutrition_kcal_100g != null ? formatNumberForInputFixed(product.nutrition_kcal_100g, 2) : "");
      draft.blocksConfig = normalizeProductBlocksConfig(product.blocks_config);
      form.price.value = product.price != null ? formatNumberForInput(product.price) : "";
      form.old_price.value = product.old_price != null ? formatNumberForInput(product.old_price) : "";
      form.cost_price.value = product.cost_price != null ? formatNumberForInput(product.cost_price) : "";
      if (form.margin_percent) {
        const marginValue = product.margin_percent != null
          ? Number(product.margin_percent)
          : calcMarginFromPrice(product.cost_price, product.price);
        form.margin_percent.value = marginValue != null ? formatNumberForInputFixed(marginValue, 2) : "";
      }
      if (form.base_unit_id) {
        form.base_unit_id.value = product.base_unit_id || product.unit_id || "";
      }
      if (form.base_qty) {
        form.base_qty.value = product.base_qty != null ? formatNumberForInput(product.base_qty) : "";
      }
      if (form.stock) {
        form.stock.value = product.stock_qty != null ? formatNumberForInput(product.stock_qty) : "";
      }
      form.is_active.checked = Boolean(product.is_active);
      form.site_visibility.checked = Boolean(product.site_visibility);
      if (form.fulfillment_mode) {
        form.fulfillment_mode.value = normalizeProductFulfillmentMode(product.fulfillment_mode);
      }
    } else {
      if (form.cost_price) {
        form.cost_price.value = formatNumberForInput(0);
      }
      if (form.margin_percent) {
        form.margin_percent.value = "";
      }
      if (form.fulfillment_mode) {
        form.fulfillment_mode.value = "stock";
      }
    }

    const fulfillmentWrap = $("#peFulfillmentModeWrap", wrapper);
    const fulfillmentTrigger = $("#peFulfillmentModeTrigger", wrapper);
    const fulfillmentMenu = $("#peFulfillmentModeMenu", wrapper);
    const fulfillmentText = $("#peFulfillmentModeText", wrapper);
    const fulfillmentSelect = form.fulfillment_mode || $("#pe_fulfillment_mode", wrapper);

    function syncFulfillmentModeSelect() {
      if (!fulfillmentSelect) return;
      const value = normalizeProductFulfillmentMode(fulfillmentSelect.value);
      fulfillmentSelect.value = value;
      if (fulfillmentText) fulfillmentText.textContent = getProductFulfillmentModeLabel(value);
      if (fulfillmentMenu) {
        fulfillmentMenu.querySelectorAll("[data-value]").forEach((option) => {
          option.classList.toggle("is-selected", String(option.dataset.value || "") === value);
        });
      }
    }

    function closeFulfillmentModeMenu() {
      fulfillmentWrap?.classList.remove("is-open");
      fulfillmentMenu?.classList.add("hidden");
      fulfillmentTrigger?.setAttribute("aria-expanded", "false");
    }

    if (fulfillmentTrigger && fulfillmentMenu && fulfillmentSelect) {
      syncFulfillmentModeSelect();
      fulfillmentTrigger.disabled = isView;
      fulfillmentTrigger.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (isView) return;
        const nextOpen = !fulfillmentWrap?.classList.contains("is-open");
        fulfillmentWrap?.classList.toggle("is-open", nextOpen);
        fulfillmentMenu.classList.toggle("hidden", !nextOpen);
        fulfillmentTrigger.setAttribute("aria-expanded", nextOpen ? "true" : "false");
        if (nextOpen) {
          setTimeout(() => document.addEventListener("click", closeFulfillmentModeMenu, { once: true }), 0);
        }
      });
      fulfillmentMenu.querySelectorAll("[data-value]").forEach((option) => {
        option.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (isView) return;
          fulfillmentSelect.value = normalizeProductFulfillmentMode(option.dataset.value);
          syncFulfillmentModeSelect();
          closeFulfillmentModeMenu();
        });
      });
    }

    if (isView) {
      $$("input, select, textarea", form).forEach((el) => {
        if (el.tagName === "SELECT" || el.type === "checkbox" || el.type === "file") {
          el.disabled = true;
        } else {
          el.readOnly = true;
        }
      });
    }

    // Нормализация числовых инпутов: точка/запятая → запятая при вводе; при blur — целые без дробной части, дробные без лишних нулей
    (function bindNumericInputBehavior(container) {
      const inputs = container.querySelectorAll("[data-numeric-input]");
      inputs.forEach(function(el) {
        el.addEventListener("input", function() {
          if (this.value && this.value.indexOf(".") !== -1) this.value = this.value.replace(/\./g, ",");
        });
        el.addEventListener("blur", function() {
          const num = parseNumberFromInput(this.value);
          this.value = num === null ? "" : formatNumberForInput(num);
        });
      });
    })(wrapper);

    const ui = {
      chips: $("#peCategoryChips", wrapper),
      variantAccordion: $("#peVariantAccordion", wrapper),
      variantManageBtn: $("#peVariantManageBtn", wrapper),
      optionAccordion: $("#peOptionAccordion", wrapper),
      optionManageBtn: $("#peOptionManageBtn", wrapper),
      optionBackdrop: $("#peOptionBackdrop", wrapper),
      optionModal: $("#peOptionModal", wrapper),
      optionClose: $("#peOptionClose", wrapper),
      optionList: $("#peOptionList", wrapper),
      optionSearch: $("#peOptionSearch", wrapper),
      optionCancel: $("#peOptionCancel", wrapper),
      optionApply: $("#peOptionApply", wrapper),

      photosInput: $("#pePhotosInput", wrapper),
      addPhotosBtn: $("#peAddPhotosBtn", wrapper),
      photoMain: $("#pePhotoMain", wrapper),
      photoMainContainer: $("#pePhotoMainContainer", wrapper),
      photoPlaceholder: $("#pePhotoPlaceholder", wrapper),
      thumbs: $("#pePhotoThumbs", wrapper),
      thumbsPrev: $("#peThumbsPrev", wrapper),
      thumbsNext: $("#peThumbsNext", wrapper),
      counter: $("#pePhotosCounter", wrapper),
      photoPrev: $("#pePhotoPrev", wrapper),
      photoNext: $("#pePhotoNext", wrapper),
      photoDots: $("#pePhotoDots", wrapper),
      photoSizeBadge: null,
      baseUnitSelect: $("#pe_base_unit_id", wrapper),
      baseQtyInput: $("#pe_base_qty", wrapper),
      pcsLinkWrap: $("#pePcsLinkWrap", wrapper),
      pcsFactorInput: $("#pe_pcs_factor", wrapper),
      pcsBaseLabel: $("#pePcsBaseLabel", wrapper),
      pcsToUnitWrap: $("#pePcsToUnitWrap", wrapper),
      pcsToUnitFactorInput: $("#pe_pcs_to_unit_factor", wrapper),
      pcsToUnitSelect: $("#pe_pcs_to_unit_id", wrapper),
      ingredientAccordion: $("#peIngredientAccordion", wrapper),
      ingredientAddBtn: $("#peIngredientAddBtn", wrapper),
      ingredientSearch: $("#peIngredientSearch", wrapper),
      ingredientCostTotal: $("#peIngredientCostTotal", wrapper),
      ingredientPriceTotal: $("#peIngredientPriceTotal", wrapper),
      ingredientWeightTotal: $("#peIngredientWeightTotal", wrapper),
      priceBlock: $("#pePriceBlock", wrapper),
      priceSourceHint: $("#pePriceSourceHint", wrapper),
      priceSourceAutoBtn: $("#pePriceSourceAuto", wrapper),
      priceSourceManualBtn: $("#pePriceSourceManual", wrapper),
      nutritionBlock: $("#peNutritionBlock", wrapper),
      nutritionWarning: $("#peNutritionWarning", wrapper),
      nutritionKcalInput: $("#pe_nutrition_kcal", wrapper),
      nutritionProteinInput: $("#pe_nutrition_protein", wrapper),
      nutritionFatInput: $("#pe_nutrition_fat", wrapper),
      nutritionCarbsInput: $("#pe_nutrition_carbs", wrapper),
      generateCompositionBtn: $("#peGenerateCompositionBtn", wrapper),
      clientCompositionInput: $("#pe_client_composition", wrapper),
      ingredientBackdrop: $("#peIngredientBackdrop", wrapper),
      ingredientModal: $("#peIngredientModal", wrapper),
      ingredientModalClose: $("#peIngredientModalClose", wrapper),
      ingredientModalCancel: $("#peIngredientModalCancel", wrapper),
      ingredientModalCreate: $("#peIngredientModalCreate", wrapper),
      ingredientModalSearch: $("#peIngredientModalSearch", wrapper),
      ingredientModalList: $("#peIngredientModalList", wrapper),
      costPriceInput: $("#pe_cost_price", wrapper),
      marginPercentInput: $("#pe_margin_percent", wrapper),
      priceInput: $("#pe_price", wrapper),
      discountAccordion: $("#peDiscountAccordion", wrapper),
      discountEmpty: $("#peDiscountEmpty", wrapper),
      descriptionBlock: $("#peDescriptionAccordion", wrapper),
      variantBlock: $("#peVariantBlock", wrapper),
      optionBlock: $("#peOptionBlock", wrapper),
      ingredientBlock: $("#peIngredientBlock", wrapper),
      promotionsBlock: $("#pePromotionsBlock", wrapper),
    };

    function isCompositionPriceMode() {
      return normalizeProductValueSource(draft.valueSources?.cost_price) === "auto"
        && normalizeProductValueSource(draft.valueSources?.price) === "auto";
    }

    function getMarginPercentValue() {
      return parseNumberFromInput(ui.marginPercentInput?.value);
    }

    function updatePriceFromCostAndMargin(costOverride = null) {
      if (!ui.priceInput) return null;
      const cost = costOverride != null ? costOverride : parseNumberFromInput(ui.costPriceInput?.value);
      const price = calcPriceFromMargin(cost, getMarginPercentValue());
      if (price != null) {
        ui.priceInput.value = formatNumberForInputFixed(price, 2);
      }
      return price;
    }

    function updateMarginFromCostAndPrice() {
      if (!ui.marginPercentInput) return null;
      const margin = calcMarginFromPrice(
        parseNumberFromInput(ui.costPriceInput?.value),
        parseNumberFromInput(ui.priceInput?.value)
      );
      if (margin != null) {
        ui.marginPercentInput.value = formatNumberForInputFixed(margin, 2);
      }
      return margin;
    }

    function applyCompositionPriceValues() {
      if (!isCompositionPriceMode()) return;
      const cost = calcTotalCostFromIngredientsGlobal();
      const price = calcTotalPriceFromIngredientsGlobal();
      if (cost != null && ui.costPriceInput) {
        ui.costPriceInput.value = formatNumberForInput(Math.round(cost * 100) / 100);
      }
      if (price != null && ui.priceInput) {
        ui.priceInput.value = formatNumberForInput(Math.round(price * 100) / 100);
      }
      const margin = calcMarginFromPrice(cost, price);
      if (margin != null && ui.marginPercentInput) {
        ui.marginPercentInput.value = formatNumberForInputFixed(margin, 2);
      }
    }

    function syncPriceSourceMode({ applyValues = false } = {}) {
      const isAuto = isCompositionPriceMode();
      ui.priceBlock?.classList.toggle("is-auto", isAuto);
      ui.priceSourceAutoBtn?.classList.toggle("is-active", isAuto);
      ui.priceSourceManualBtn?.classList.toggle("is-active", !isAuto);
      if (ui.priceSourceHint) {
        ui.priceSourceHint.textContent = isAuto ? "Считается из состава" : "Ручной ввод";
      }
      if (ui.costPriceInput) ui.costPriceInput.readOnly = isView || isAuto;
      if (ui.marginPercentInput) ui.marginPercentInput.readOnly = isView || isAuto;
      if (ui.priceInput) ui.priceInput.readOnly = isView || isAuto;
      if (ui.priceSourceAutoBtn) ui.priceSourceAutoBtn.disabled = isView;
      if (ui.priceSourceManualBtn) ui.priceSourceManualBtn.disabled = isView;
      if (applyValues) applyCompositionPriceValues();
    }

    function setPriceSourceMode(mode) {
      const isAuto = mode === "auto";
      draft.valueSources.cost_price = isAuto ? "auto" : "manual";
      draft.valueSources.price = isAuto ? "auto" : "manual";
      syncPriceSourceMode({ applyValues: isAuto });
    }

    if (!isView) {
      ui.costPriceInput?.addEventListener("input", () => {
        draft.valueSources.cost_price = "manual";
        draft.valueSources.price = "manual";
        updateMarginFromCostAndPrice();
        syncPriceSourceMode();
      });
      ui.priceInput?.addEventListener("input", () => {
        draft.valueSources.cost_price = "manual";
        draft.valueSources.price = "manual";
        updateMarginFromCostAndPrice();
        syncPriceSourceMode();
      });
      ui.priceInput?.addEventListener("blur", () => {
        const num = parseNumberFromInput(ui.priceInput.value);
        ui.priceInput.value = num == null ? "" : formatNumberForInputFixed(num, 2);
        updateMarginFromCostAndPrice();
        syncPriceSourceMode();
      });
      ui.marginPercentInput?.addEventListener("input", () => {
        const nextValue = normalizeLimitedDecimalInput(ui.marginPercentInput.value, 2);
        if (ui.marginPercentInput.value !== nextValue) ui.marginPercentInput.value = nextValue;
        draft.valueSources.cost_price = "manual";
        draft.valueSources.price = "manual";
        updatePriceFromCostAndMargin();
        syncPriceSourceMode();
      });
      ui.marginPercentInput?.addEventListener("blur", () => {
        const num = parseNumberFromInput(ui.marginPercentInput.value);
        ui.marginPercentInput.value = num == null ? "" : formatNumberForInputFixed(num, 2);
        updatePriceFromCostAndMargin();
      });
      ui.baseQtyInput?.addEventListener("input", () => {
        draft.valueSources.base_qty = "manual";
      });
      ui.priceSourceAutoBtn?.addEventListener("click", () => setPriceSourceMode("auto"));
      ui.priceSourceManualBtn?.addEventListener("click", () => setPriceSourceMode("manual"));
    }
    syncPriceSourceMode({ applyValues: true });

    const descriptionAccordion = $("#peDescriptionAccordion", wrapper);
    if (descriptionAccordion) {
      bindAccordionContainer(descriptionAccordion);
    }

    function syncProductFooterBlockChips() {
      const chips = $("#productFooterBlockChips");
      if (!chips) return;
      if (isView) {
        chips.classList.add("hidden");
        chips.innerHTML = "";
        return;
      }
      const blocksConfig = normalizeProductBlocksConfig(draft.blocksConfig);
      chips.classList.remove("hidden");
      chips.innerHTML = PRODUCT_FOOTER_BLOCK_CHIP_DEFINITIONS.map(({ key, label }) => {
        const isActive = Boolean(blocksConfig[key]);
        const hasWarning = key === "nutrition" && draft.nutritionIncomplete;
        return `<button class="product-footer-block-chip ${isActive ? "is-active" : ""} ${hasWarning ? "has-warning" : ""}" type="button" data-product-footer-block-chip="${key}">${escapeHtml(label)}${hasWarning ? '<span class="product-footer-block-chip-warning">!</span>' : ''}</button>`;
      }).join("");
      chips.querySelectorAll("[data-product-footer-block-chip]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = String(button.dataset.productFooterBlockChip || "");
          if (Object.prototype.hasOwnProperty.call(draft.blocksConfig, key)) {
            draft.blocksConfig[key] = !Boolean(draft.blocksConfig[key]);
          }
          syncProductBlocksVisibility();
        });
      });
      if (!chips.dataset.wheelBound) {
        chips.dataset.wheelBound = "1";
        chips.addEventListener("wheel", (event) => {
          if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
          event.preventDefault();
          chips.scrollLeft += event.deltaY;
        }, { passive: false });
      }
    }

    function syncProductBlocksVisibility() {
      const blocksConfig = normalizeProductBlocksConfig(draft.blocksConfig);
      draft.blocksConfig = blocksConfig;
      const blocksMap = {
        description: ui.descriptionBlock,
        variants: ui.variantBlock,
        options: ui.optionBlock,
        ingredients: ui.ingredientBlock,
        promotions: ui.promotionsBlock,
        nutrition: ui.nutritionBlock,
      };
      Object.entries(blocksMap).forEach(([key, element]) => {
        if (!element) return;
        element.classList.toggle("hidden", !blocksConfig[key]);
      });
      if (!isView) {
        window.__productEditorBlocks = {
          definitions: PRODUCT_BLOCK_DEFINITIONS.slice(),
          getConfig: () => ({ ...draft.blocksConfig }),
          setBlock: (key, value) => {
            if (!Object.prototype.hasOwnProperty.call(draft.blocksConfig, key)) return;
            draft.blocksConfig[key] = Boolean(value);
            syncProductBlocksVisibility();
          },
        };
      }
      syncProductFooterBlockChips();
    }
    syncProductBlocksVisibility();

    if (ui.generateCompositionBtn && !isView) {
      ui.generateCompositionBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        const productId = Number(product?.id || 0);
        if (!Number.isFinite(productId) || productId <= 0) {
          showToast("Сначала сохраните товар");
          return;
        }
        ui.generateCompositionBtn.disabled = true;
        try {
          const res = await apiGenerateProductComposition(productId);
          const text = String(res?.data?.client_composition || "");
          if (ui.clientCompositionInput) {
            ui.clientCompositionInput.value = text;
            ui.clientCompositionInput.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (product) product.client_composition = text;
          clearCachedProductDetails(productId);
          clearCachedProductView(productId);
          showToast("Состав сгенерирован", "success");
        } catch (e) {
          if (e?.message === "NO_INGREDIENTS") {
            showToast("Состав товара не заполнен");
          } else {
            console.error("Failed to generate product composition", e);
            showToast("Не удалось сгенерировать состав");
          }
        } finally {
          ui.generateCompositionBtn.disabled = false;
        }
      });
    }

    function calcNutritionKcalFromInputs() {
      const protein = parseNumberFromInput(ui.nutritionProteinInput?.value);
      const fat = parseNumberFromInput(ui.nutritionFatInput?.value);
      const carbs = parseNumberFromInput(ui.nutritionCarbsInput?.value);
      if (protein == null || fat == null || carbs == null) return null;
      return Math.round((protein * 4 + fat * 9 + carbs * 4) * 100) / 100;
    }

    function syncNutritionKcalInput() {
      if (!ui.nutritionKcalInput) return;
      const kcal = calcNutritionKcalFromInputs();
      ui.nutritionKcalInput.value = kcal == null ? "" : formatNumberForInputFixed(kcal, 2);
    }

    function closeNutritionProblemPopover() {
      document.querySelectorAll(".product-nutrition-popover").forEach((el) => el.remove());
    }

    function showNutritionProblemPopover(anchor, problems) {
      closeNutritionProblemPopover();
      const list = Array.isArray(problems) ? problems : [];
      const popover = document.createElement("div");
      popover.className = "product-nutrition-popover";
      const items = list.length ? list : [{ message: "Не заполнено КБЖУ" }];
      popover.innerHTML = `
        <div class="product-nutrition-popover-title">Не заполнено КБЖУ</div>
        <div class="product-nutrition-popover-list">
          ${items.map((problem) => {
            const path = Array.isArray(problem.path) ? problem.path.filter(Boolean).join(" > ") : "";
            const text = path || problem.product_name || problem.message || "Не заполнено КБЖУ";
            return `<div class="product-nutrition-popover-item">${escapeHtml(text)}</div>`;
          }).join("")}
        </div>
      `;
      document.body.appendChild(popover);
      const rect = anchor?.getBoundingClientRect?.() || { left: 16, bottom: 16 };
      const left = Math.min(window.innerWidth - popover.offsetWidth - 12, Math.max(12, rect.left));
      const top = Math.min(window.innerHeight - popover.offsetHeight - 12, Math.max(12, rect.bottom + 8));
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      setTimeout(() => {
        document.addEventListener("click", closeNutritionProblemPopover, { once: true });
      }, 0);
    }

    function syncNutritionWarning() {
      if (!ui.nutritionWarning) return;
      ui.nutritionWarning.classList.toggle("hidden", !draft.nutritionIncomplete);
    }

    function getProductOutputGramsFromDraft(totalGrams) {
      const gramUnit = unitsList.find((u) => String(u.code || "").toLowerCase() === "g");
      const gramUnitId = Number(gramUnit?.id || 0);
      const baseUnitId = Number(ui.baseUnitSelect?.value || 0);
      const baseQty = parseNumberFromInput(form.base_qty?.value);
      if (!gramUnitId || !baseUnitId || baseQty == null || baseQty <= 0) return totalGrams;
      if (pcsUnitId && baseUnitId === Number(pcsUnitId) && Number(ui.pcsToUnitSelect?.value || 0) === gramUnitId) {
        const draftFactor = parseNumberFromInput(ui.pcsToUnitFactorInput?.value);
        if (draftFactor != null && draftFactor > 0) return baseQty * draftFactor;
      }
      const link = productUnitLinks.find((l) => Number(l.unit_id) === baseUnitId && Number(l.base_unit_id) === gramUnitId);
      const linkFactor = link && Number(link.factor) ? Number(link.factor) : null;
      const factor = linkFactor ?? getConversionFactor(baseUnitId, gramUnitId);
      return factor != null ? baseQty * factor : totalGrams;
    }

    function syncDraftNutritionFromIngredients() {
      if (!draftIngredients || draftIngredients.size === 0) {
        syncNutritionKcalInput();
        return;
      }
      let protein = 0;
      let fat = 0;
      let carbs = 0;
      let totalGrams = 0;
      let hasValue = false;
      draftIngredients.forEach((ing) => {
        const qtyGrams = getIngredientQuantityInGrams(ing);
        if (qtyGrams == null) return;
        totalGrams += qtyGrams;
        const nutrition = ing.nutrition_per_100g && typeof ing.nutrition_per_100g === "object"
          ? ing.nutrition_per_100g
          : {
              protein: ing.nutrition_protein_100g,
              fat: ing.nutrition_fat_100g,
              carbs: ing.nutrition_carbs_100g,
            };
        const p = nutrition.protein != null ? Number(nutrition.protein) : null;
        const f = nutrition.fat != null ? Number(nutrition.fat) : null;
        const c = nutrition.carbs != null ? Number(nutrition.carbs) : null;
        if (p != null && Number.isFinite(p)) { protein += p * qtyGrams / 100; hasValue = true; }
        if (f != null && Number.isFinite(f)) { fat += f * qtyGrams / 100; hasValue = true; }
        if (c != null && Number.isFinite(c)) { carbs += c * qtyGrams / 100; hasValue = true; }
      });
      if (!hasValue) {
        syncNutritionKcalInput();
        return;
      }
      const outputGrams = getProductOutputGramsFromDraft(totalGrams);
      const base = outputGrams && outputGrams > 0 ? outputGrams : totalGrams;
      if (!base || base <= 0) return;
      if (ui.nutritionProteinInput) ui.nutritionProteinInput.value = formatNumberForInputFixed(protein / base * 100, 2);
      if (ui.nutritionFatInput) ui.nutritionFatInput.value = formatNumberForInputFixed(fat / base * 100, 2);
      if (ui.nutritionCarbsInput) ui.nutritionCarbsInput.value = formatNumberForInputFixed(carbs / base * 100, 2);
      syncNutritionKcalInput();
    }

    [ui.nutritionProteinInput, ui.nutritionFatInput, ui.nutritionCarbsInput].forEach((input) => {
      input?.addEventListener("input", () => {
        const nextValue = normalizeLimitedDecimalInput(input.value, 2);
        if (input.value !== nextValue) input.value = nextValue;
        syncNutritionKcalInput();
      });
      input?.addEventListener("blur", () => {
        const num = parseNumberFromInput(input.value);
        input.value = num == null ? "" : formatNumberForInputFixed(num, 2);
        syncNutritionKcalInput();
      });
    });
    ui.nutritionWarning?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showNutritionProblemPopover(ui.nutritionWarning, draft.nutritionProblems);
    });
    syncNutritionKcalInput();
    syncNutritionWarning();

    function openCatPicker() {
      if (isView) return;
      
      // Initialize selection from current draft
      categoryPickerSelection = new Set(draft.categories);
      
      // Create category picker overlay for right panel
      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";
      pickerOverlay.id = "categoryPickerOverlay";
      
      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";
      
      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">Категории</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" id="categoryPickerSearchInput" type="search" placeholder="Поиск по названию" />
            </div>
            <div class="option-picker-list" id="categoryPickerListContent"></div>
          </div>
        </div>
      `;
      
      pickerOverlay.appendChild(pickerContent);

      const searchInput = pickerContent.querySelector("#categoryPickerSearchInput");
      const listContent = pickerContent.querySelector("#categoryPickerListContent");
      const expandedCategoryIds = new Set();

      function renderList() {
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const allCategories = state.categories
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
        const childrenByParent = new Map();
        allCategories.forEach((c) => {
          const parentId = Number(c.parent_id || 0);
          if (!(parentId > 0)) return;
          if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
          childrenByParent.get(parentId).push(c);
        });
        const parents = allCategories.filter((c) => c.parent_id == null);
        const list = [];
        parents.forEach((parent) => {
          const parentId = Number(parent.id);
          const children = childrenByParent.get(parentId) || [];
          const parentMatches = !query || String(parent.title || "").toLowerCase().includes(query);
          const matchingChildren = children.filter((child) => !query || String(child.title || "").toLowerCase().includes(query));
          if (!parentMatches && !matchingChildren.length) return;

          list.push({ category: parent, level: 0, hasChildren: children.length > 0 });
          if (query || expandedCategoryIds.has(parentId)) {
            (query ? matchingChildren : children).forEach((child) => {
              list.push({ category: child, level: 1, hasChildren: false });
            });
          }
        });

        if (!listContent) return;
        listContent.innerHTML = list.map(({ category: c, level, hasChildren }) => {
          const id = Number(c.id);
          const isAll = c.code === "all";
          const checked = categoryPickerSelection.has(id);
          const iconHtml = renderCategoryIcon(c.icon, "category-picker-icon");
          const expanded = expandedCategoryIds.has(id) || Boolean(query);
          const chevronHtml = hasChildren
            ? `<button class="category-picker-chevron ${expanded ? "is-expanded" : ""}" type="button" data-cat-expand="${id}" aria-label="${expanded ? "Свернуть подкатегории" : "Показать подкатегории"}"><i class="fas fa-chevron-right"></i></button>`
            : "";
          return `
            <div class="option-picker-row category-picker-row ${checked ? "is-selected" : ""} ${isAll ? "is-disabled" : ""} ${level ? "is-child" : ""}" data-cat-id="${id}" data-cat-level="${level}" ${isAll ? 'data-disabled="true"' : ''}>
              ${iconHtml}
              <div class="option-picker-meta">
                <div class="options-row-title">${escapeHtml(c.title || "")}</div>
              </div>
              ${chevronHtml}
            </div>
          `;
        }).join("");

        listContent.querySelectorAll(".option-picker-row[data-cat-id]").forEach((row) => {
          row.addEventListener("click", (event) => {
            const expandBtn = event.target.closest("[data-cat-expand]");
            if (expandBtn) {
              event.preventDefault();
              event.stopPropagation();
              const expandId = Number(expandBtn.dataset.catExpand);
              if (!Number.isFinite(expandId)) return;
              if (expandedCategoryIds.has(expandId)) expandedCategoryIds.delete(expandId);
              else expandedCategoryIds.add(expandId);
              renderList();
              return;
            }
            if (row.dataset.disabled === "true") return;
            const id = Number(row.dataset.catId);
            if (!Number.isFinite(id)) return;
            if (categoryPickerSelection.has(id)) {
              categoryPickerSelection.delete(id);
              state.categories
                .filter((item) => Number(item.parent_id) === id)
                .forEach((item) => categoryPickerSelection.delete(Number(item.id)));
            }
            else {
              categoryPickerSelection.add(id);
              const category = state.categories.find((item) => Number(item.id) === id);
              const parentId = Number(category?.parent_id || 0);
              if (parentId > 0) categoryPickerSelection.add(parentId);
            }
            renderList();
          });
        });
      }

      if (searchInput) {
        searchInput.addEventListener("input", renderList);
      }

      renderList();

      // Insert overlay into #productInfoPanel
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector("#categoryPickerOverlay");
        if (existingPicker) {
          existingPicker.remove();
        }
        productInfoPanel.appendChild(pickerOverlay);

        // Switch footer to edit mode for picker
        const footer = $("#productInfoFooter");
        const footerView = $("#productFooterView");
        const footerEditMode = $("#productFooterEditMode");
        const cancelBtn = $("#productFooterCancelBtn");
        const saveBtn = $("#productFooterSaveBtn");
        const deleteBtn = $("#productFooterDeleteEditBtn");
        const moreBtn = $("#productFooterMoreEditBtn");
        
        if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
          // Save current footer state
          if (!categoryPickerSavedFooterState) {
            categoryPickerSavedFooterState = {
              footerHidden: footer.classList.contains("hidden"),
              viewHidden: footerView.classList.contains("hidden"),
              editHidden: footerEditMode.classList.contains("hidden"),
              deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
              moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
              cancelBtnClasses: cancelBtn.className,
              cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
              cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm")
            };
            categoryPickerSavedHandlers = {
              cancel: cancelBtn.onclick,
              save: saveBtn.onclick
            };
          }
          
          // Switch to edit mode footer
          footer.classList.remove("hidden");
          footerView.classList.add("hidden");
          footerEditMode.classList.remove("hidden");
          
          // Hide delete and more buttons
          if (deleteBtn) deleteBtn.classList.add("hidden");
          if (moreBtn) moreBtn.classList.add("hidden");
          
          // Make cancel button full-width
          cancelBtn.classList.remove("is-confirm");
          cancelBtn.classList.add("is-fullwidth");
          if (!cancelBtn.dataset.pickerOriginalHtml) {
            cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
          }
          cancelBtn.textContent = "Отменить";
          cancelBtn.title = "Отменить";
          cancelBtn.setAttribute("aria-label", "Отменить");
          
          // Set data attributes for picker handlers
          cancelBtn.dataset.pickerType = "category";
          saveBtn.dataset.pickerType = "category";
          window._closeCategoryPickerFn = () => {
            closeCatPicker();
          };
          window._saveCategoryPickerFn = async () => {
            // Update draft with new selection
            draft.categories = new Set(categoryPickerSelection || []);
            renderCategoryChips();
            closeCatPicker();
          };
        }
      }
    }

    function closeCatPicker() {
      categoryPickerSelection = null;
      
      // Remove picker overlay
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector("#categoryPickerOverlay");
        if (existingPicker) {
          existingPicker.remove();
        }
      }
      
      // Clear picker data attributes
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeCategoryPickerFn;
      delete window._saveCategoryPickerFn;
      
      // Restore footer to original state
      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      
      if (footer && footerView && footerEditMode && cancelBtn && saveBtn && categoryPickerSavedFooterState) {
        if (categoryPickerSavedFooterState.footerHidden) {
          footer.classList.add("hidden");
        } else {
          footer.classList.remove("hidden");
        }
        if (categoryPickerSavedFooterState.viewHidden) {
          footerView.classList.add("hidden");
        } else {
          footerView.classList.remove("hidden");
        }
        if (categoryPickerSavedFooterState.editHidden) {
          footerEditMode.classList.add("hidden");
        } else {
          footerEditMode.classList.remove("hidden");
        }
        
        if (deleteBtn) {
          if (categoryPickerSavedFooterState.deleteBtnHidden) {
            deleteBtn.classList.add("hidden");
          } else {
            deleteBtn.classList.remove("hidden");
          }
        }
        if (moreBtn) {
          if (categoryPickerSavedFooterState.moreBtnHidden) {
            moreBtn.classList.add("hidden");
          } else {
            moreBtn.classList.remove("hidden");
          }
        }
        
        cancelBtn.classList.remove("is-fullwidth");
        if (categoryPickerSavedFooterState.cancelBtnIsConfirm) {
          cancelBtn.classList.add("is-confirm");
        }
        if (cancelBtn.dataset.pickerOriginalHtml) {
          cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
          delete cancelBtn.dataset.pickerOriginalHtml;
        }
        cancelBtn.title = "";
        cancelBtn.setAttribute("aria-label", "");
      }
      
      categoryPickerSavedFooterState = null;
      categoryPickerSavedHandlers = null;
    }

    function renderCategoryChips() {
      const selected = Array.from(draft.categories)
        .map((id) => state.categories.find((c) => Number(c.id) === Number(id)))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      const chips = selected
        .filter((c) => c.code !== "all")
        .map((c) => {
          if (isView) {
            return `<span class="chip">${escapeHtml(c.title)}</span>`;
          }
          return `
            <span class="chip">
              ${escapeHtml(c.title)}
              <button class="chip-remove" type="button" data-cat-remove="${c.id}">
                <i class="fas fa-times"></i>
              </button>
            </span>
          `;
        })
        .join("");

      ui.chips.innerHTML = isView
        ? chips
        : `
          ${chips}
          <button type="button" class="chip chip-plus" id="peChipPlus"><i class="fas fa-plus"></i></button>
        `;

      if (isView) return;

      const plus = $("#peChipPlus", ui.chips);
      if (plus) plus.addEventListener("click", () => {
        openCatPicker();
      });

      ui.chips.querySelectorAll("[data-cat-remove]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.catRemove);
          if (!Number.isFinite(id)) return;
          draft.categories.delete(id);
          renderCategoryChips();
        });
      });
    }

    function openOptionPicker() {
      // Initialize selection if not set
      if (!optionPickerSelection) {
        optionPickerSelection = new Set(draft.optionGroups);
      }
      
      // Create option picker overlay for right panel
      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";
      
      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";
      
      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">Опции</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" id="optionPickerSearchInput" type="search" placeholder="Поиск по названию" />
            </div>
            <div class="option-picker-list" id="optionPickerListContent"></div>
          </div>
        </div>
      `;
      
      pickerOverlay.appendChild(pickerContent);

      const searchInput = pickerContent.querySelector("#optionPickerSearchInput");
      const listContent = pickerContent.querySelector("#optionPickerListContent");

      function renderList() {
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const groups = state.optionGroups
          .filter((g) => g.is_active)
          .filter((g) => !query || String(g.title || "").toLowerCase().includes(query))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

        if (!listContent) return;
        listContent.innerHTML = groups.map((g) => {
          const checked = optionPickerSelection.has(g.id);
          return `
            <div class="option-picker-row ${checked ? "is-selected" : ""}" data-option-id="${g.id}">
              <div class="option-picker-meta">
                <div class="options-row-title">${escapeHtml(g.title || "")}</div>
                <div class="options-row-meta">${escapeHtml(getSelectionLabel(g.selection_type))}</div>
              </div>
              <input class="option-picker-checkbox" type="checkbox" data-option-id="${g.id}" ${checked ? "checked" : ""} />
            </div>
          `;
        }).join("");

        listContent.querySelectorAll(".option-picker-row[data-option-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const id = Number(row.dataset.optionId);
            if (!Number.isFinite(id)) return;
            if (optionPickerSelection.has(id)) optionPickerSelection.delete(id);
            else optionPickerSelection.add(id);
            renderList();
            if (applyBtn) applyBtn.textContent = "Добавить";
          });
        });
      }

      if (searchInput) {
        searchInput.addEventListener("input", renderList);
      }

      renderList();

      // Insert overlay directly into #productInfoPanel (right column) instead of using navigation
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        // Remove existing picker overlay if any
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
        
        // Insert picker overlay into panel
        productInfoPanel.appendChild(pickerOverlay);

        // Switch footer to edit mode for picker
      const footer = $("#productInfoFooter");
        const footerView = $("#productFooterView");
        const footerEditMode = $("#productFooterEditMode");
        const cancelBtn = $("#productFooterCancelBtn");
        const saveBtn = $("#productFooterSaveBtn");
        
        const deleteBtn = $("#productFooterDeleteEditBtn");
        const moreBtn = $("#productFooterMoreEditBtn");
        
        if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
          // Save current footer state
          if (!optionPickerSavedFooterState) {
            optionPickerSavedFooterState = {
              footerHidden: footer.classList.contains("hidden"),
              viewHidden: footerView.classList.contains("hidden"),
              editHidden: footerEditMode.classList.contains("hidden"),
              deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
              moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
              cancelBtnClasses: cancelBtn.className,
              cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
              cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm")
            };
            optionPickerSavedHandlers = {
              cancel: cancelBtn.onclick,
              save: saveBtn.onclick
            };
          }
          
          // Switch to edit mode footer
          footer.classList.remove("hidden");
          footerView.classList.add("hidden");
          footerEditMode.classList.remove("hidden");
          
          // Hide delete and more buttons
          if (deleteBtn) deleteBtn.classList.add("hidden");
          if (moreBtn) moreBtn.classList.add("hidden");
          
          // Make cancel button full-width with text visible immediately
          cancelBtn.classList.remove("is-confirm");
          cancelBtn.classList.add("is-fullwidth");
          // Save original HTML if not saved
          if (!cancelBtn.dataset.pickerOriginalHtml) {
            cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
          }
          // Set text "Отменить" immediately
          cancelBtn.textContent = "Отменить";
          cancelBtn.title = "Отменить";
          cancelBtn.setAttribute("aria-label", "Отменить");
          
          // Set data attributes and store functions for picker handlers
          cancelBtn.dataset.pickerType = "option";
          saveBtn.dataset.pickerType = "option";
          window._closeOptionPickerFn = () => {
            closeOptionPicker();
          };
          window._saveOptionPickerFn = async () => {
            const oldSelection = new Set(draft.optionGroups);
            const newSelection = new Set(optionPickerSelection || []);
            
            // Find options to add and remove
            const toAdd = Array.from(newSelection).filter(id => !oldSelection.has(id));
            const toRemove = Array.from(oldSelection).filter(id => !newSelection.has(id));
            
            if (isEdit && product) {
              // For existing products: save to database immediately
              try {
                // Add new options
                if (toAdd.length > 0) {
                  await apiAddProductOptionAssignments(product.id, toAdd);
                }
                
                // Remove options
                for (const groupId of toRemove) {
                  await apiDisableProductOptionAssignment(product.id, groupId);
                }
              } catch (e) {
                console.error('Failed to save options', e);
                alert('Ошибка при сохранении опций');
                return;
              }
            }
            
            // Update draft
            draft.optionGroups = newSelection;
            renderOptionAccordion();
            closeOptionPicker();
          };
        }
      }
    }

    function closeOptionPicker() {
      optionPickerSelection = null;
      // Remove picker overlay from right panel
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
      }
      
      // Clear picker data attributes
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeOptionPickerFn;
      delete window._saveOptionPickerFn;
      
      // Restore footer to original state
          const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      
      if (footer && footerView && footerEditMode && cancelBtn && saveBtn && optionPickerSavedFooterState) {
        // Restore footer visibility
        if (optionPickerSavedFooterState.footerHidden) {
          footer.classList.add("hidden");
        } else {
          footer.classList.remove("hidden");
        }
        if (optionPickerSavedFooterState.viewHidden) {
          footerView.classList.add("hidden");
        } else {
          footerView.classList.remove("hidden");
        }
        if (optionPickerSavedFooterState.editHidden) {
          footerEditMode.classList.add("hidden");
        } else {
          footerEditMode.classList.remove("hidden");
        }
        
        // Restore delete and more buttons visibility
        if (deleteBtn) {
          if (optionPickerSavedFooterState.deleteBtnHidden) {
            deleteBtn.classList.add("hidden");
          } else {
            deleteBtn.classList.remove("hidden");
          }
        }
        if (moreBtn) {
          if (optionPickerSavedFooterState.moreBtnHidden) {
            moreBtn.classList.add("hidden");
          } else {
            moreBtn.classList.remove("hidden");
          }
        }
        
        // Restore cancel button style and content
        cancelBtn.classList.remove("is-fullwidth");
        if (optionPickerSavedFooterState.cancelBtnIsConfirm) {
          cancelBtn.classList.add("is-confirm");
        }
        // Restore original HTML
        if (cancelBtn.dataset.pickerOriginalHtml) {
          cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
          delete cancelBtn.dataset.pickerOriginalHtml;
        }
        
        // Restore button handlers
        if (optionPickerSavedHandlers) {
          cancelBtn.onclick = optionPickerSavedHandlers.cancel;
          saveBtn.onclick = optionPickerSavedHandlers.save;
        }
      }
      
      // Clear saved state
      optionPickerSavedFooterState = null;
      optionPickerSavedHandlers = null;
    }

    let optionPickerSelection = null;
    let optionPickerSavedFooterState = null;
    let optionPickerSavedHandlers = null;
    const optionDetailsCache = new Map();
    let productOptionItemsPickerState = null;
    let productOptionItemsPickerSavedFooterState = null;
    let productOptionItemsPickerSavedHandlers = null;

    let categoryPickerSelection = null;
    let categoryPickerSavedFooterState = null;
    let categoryPickerSavedHandlers = null;

    let productVariantPickerSelection = null;
    let productVariantPickerSavedFooterState = null;
    let productVariantPickerSavedHandlers = null;
    let productVariantValuesPickerState = null;
    let productVariantValuesPickerSavedFooterState = null;
    let productVariantValuesPickerSavedHandlers = null;
    const variantDetailsCache = new Map();

    function getProductScopedOptionDetailsCacheKey(groupId) {
      const safeGroupId = Number(groupId) || 0;
      const safeProductId = Number(product?.id || 0);
      return `${safeGroupId}:${safeProductId}`;
    }

    function getCachedProductScopedOptionDetails(groupId) {
      const cacheKey = getProductScopedOptionDetailsCacheKey(groupId);
      return optionDetailsCache.get(cacheKey) || state.optionGroupCache.get(cacheKey) || null;
    }

    function setCachedProductScopedOptionDetails(groupId, details) {
      const cacheKey = getProductScopedOptionDetailsCacheKey(groupId);
      optionDetailsCache.set(cacheKey, details);
      state.optionGroupCache.set(cacheKey, details);
    }

    function clearCachedProductScopedOptionDetails(groupId) {
      const cacheKey = getProductScopedOptionDetailsCacheKey(groupId);
      optionDetailsCache.delete(cacheKey);
      state.optionGroupCache.delete(cacheKey);
    }

    function getProductOptionPickerVisibleItems() {
      if (!productOptionItemsPickerState) return [];
      const query = String(productOptionItemsPickerState.query || "").trim().toLowerCase();
      const categoryId = Number(productOptionItemsPickerState.categoryId || 0);
      return (Array.isArray(productOptionItemsPickerState.items) ? productOptionItemsPickerState.items : [])
        .filter((item) => {
          if (categoryId > 0) {
            const categoryIds = Array.isArray(item.category_ids) ? item.category_ids.map((id) => Number(id)) : [];
            if (!categoryIds.includes(categoryId)) return false;
          }
          if (!query) return true;
          return String(item.product_name || item.name || "").toLowerCase().includes(query);
        });
    }

    function updateProductOptionPickerSelectAllState(overlay) {
      if (!overlay || !productOptionItemsPickerState) return;
      const input = overlay.querySelector("[data-product-option-picker-select-all]");
      const label = overlay.querySelector("[data-product-option-picker-select-all-label]");
      if (!input || !label) return;
      const items = getProductOptionPickerVisibleItems();
      const ids = items
        .map((item) => Number(item.id))
        .filter((id) => Number.isFinite(id) && id > 0);
      const selectedCount = ids.filter((id) => productOptionItemsPickerState.selection.has(id)).length;
      const allSelected = ids.length > 0 && selectedCount === ids.length;
      const noneSelected = selectedCount === 0;
      input.checked = allSelected;
      input.indeterminate = !allSelected && !noneSelected;
      input.disabled = ids.length === 0;
      const text = allSelected ? "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0432\u0441\u0435" : "\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0435";
      label.textContent = text;
      input.setAttribute("aria-label", text);
    }

    function renderProductOptionPickerTabs(overlay) {
      if (!overlay || !productOptionItemsPickerState) return;
      const tabsEl = overlay.querySelector("[data-product-option-picker-tabs]");
      if (!tabsEl) return;
      const itemCategoryIds = new Set();
      (Array.isArray(productOptionItemsPickerState.items) ? productOptionItemsPickerState.items : []).forEach((item) => {
        (Array.isArray(item.category_ids) ? item.category_ids : []).forEach((categoryId) => {
          const id = Number(categoryId);
          if (Number.isFinite(id) && id > 0) itemCategoryIds.add(id);
        });
      });
      const tabs = [{ id: 0, title: "\u0412\u0441\u0435 \u0442\u043e\u0432\u0430\u0440\u044b" }].concat(
        state.catalogCategories
          .filter((category) => itemCategoryIds.has(Number(category.id)))
          .filter((category) => {
            const title = String(category?.title || "").trim();
            const code = String(category?.code || "").trim().toLowerCase();
            return code !== "all" && title !== "\u0412\u0441\u0435 \u0442\u043e\u0432\u0430\u0440\u044b";
          })
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
      );
      tabsEl.innerHTML = tabs.map((tab) => {
        const active = Number(productOptionItemsPickerState.categoryId || 0) === Number(tab.id || 0);
        return `
          <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-product-option-picker-cat="${tab.id || 0}">
            ${escapeHtml(tab.title || "")}
          </button>
        `;
      }).join("");
      if (typeof bindHorizontalScroll === "function") bindHorizontalScroll(tabsEl);
      tabsEl.querySelectorAll("[data-product-option-picker-cat]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const nextCategoryId = Number(btn.dataset.productOptionPickerCat || 0);
          productOptionItemsPickerState.categoryId = Number.isFinite(nextCategoryId) ? nextCategoryId : 0;
          renderProductOptionPickerTabs(overlay);
          renderProductOptionPickerList(overlay);
        });
      });
    }

    function renderProductOptionPickerList(overlay) {
      if (!overlay || !productOptionItemsPickerState) return;
      const listEl = overlay.querySelector("[data-product-option-picker-list]");
      if (!listEl) return;
      const items = getProductOptionPickerVisibleItems();
      if (!items.length) {
        listEl.innerHTML = '<div class="empty-hint">\u041d\u0435\u0442 \u043f\u0443\u043d\u043a\u0442\u043e\u0432 \u0434\u043b\u044f \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f</div>';
        updateProductOptionPickerSelectAllState(overlay);
        return;
      }
      listEl.innerHTML = items.map((item) => {
        const itemId = Number(item.id);
        const checked = productOptionItemsPickerState.selection.has(itemId);
        const photoList = Array.isArray(item.product_photos_json) ? item.product_photos_json : [];
        const productPhoto = photoList.length ? photoList[0] : null;
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-option-picker-item="${itemId}">
            ${productPhoto ? `<div class="option-picker-photo"><img src="${escapeHtml(productPhoto)}" alt="" /></div>` : '<div class="option-picker-photo"></div>'}
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(item.product_name || item.name || "")}</div>
              <div class="options-row-meta">${item.product_price != null ? formatMoney(item.product_price) : "вЂ”"}</div>
            </div>
            <input class="option-picker-checkbox" type="checkbox" data-product-option-picker-checkbox="${itemId}" ${checked ? "checked" : ""} />
          </div>
        `;
      }).join("");
      listEl.querySelectorAll("[data-product-option-picker-item]").forEach((row) => {
        row.addEventListener("click", () => {
          const itemId = Number(row.dataset.productOptionPickerItem);
          if (!Number.isFinite(itemId) || itemId <= 0) return;
          if (productOptionItemsPickerState.selection.has(itemId)) {
            productOptionItemsPickerState.selection.delete(itemId);
          } else {
            productOptionItemsPickerState.selection.add(itemId);
          }
          renderProductOptionPickerList(overlay);
        });
      });
      updateProductOptionPickerSelectAllState(overlay);
    }

    function restoreProductOptionItemsPickerFooter() {
      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (!footer || !footerView || !footerEditMode || !cancelBtn || !saveBtn || !productOptionItemsPickerSavedFooterState) return;

      if (productOptionItemsPickerSavedFooterState.footerHidden) footer.classList.add("hidden");
      else footer.classList.remove("hidden");
      if (productOptionItemsPickerSavedFooterState.viewHidden) footerView.classList.add("hidden");
      else footerView.classList.remove("hidden");
      if (productOptionItemsPickerSavedFooterState.editHidden) footerEditMode.classList.add("hidden");
      else footerEditMode.classList.remove("hidden");
      if (deleteBtn) {
        if (productOptionItemsPickerSavedFooterState.deleteBtnHidden) deleteBtn.classList.add("hidden");
        else deleteBtn.classList.remove("hidden");
      }
      if (moreBtn) {
        if (productOptionItemsPickerSavedFooterState.moreBtnHidden) moreBtn.classList.add("hidden");
        else moreBtn.classList.remove("hidden");
      }
      if (productOptionItemsPickerSavedFooterState.cancelBtnIsFullwidth) cancelBtn.classList.add("is-fullwidth");
      else cancelBtn.classList.remove("is-fullwidth");
      if (productOptionItemsPickerSavedFooterState.cancelBtnIsConfirm) cancelBtn.classList.add("is-confirm");
      else cancelBtn.classList.remove("is-confirm");
      if (cancelBtn.dataset.pickerOriginalHtml) {
        cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
        delete cancelBtn.dataset.pickerOriginalHtml;
      }
      if (productOptionItemsPickerSavedHandlers) {
        cancelBtn.onclick = productOptionItemsPickerSavedHandlers.cancel;
        saveBtn.onclick = productOptionItemsPickerSavedHandlers.save;
      }
      productOptionItemsPickerSavedFooterState = null;
      productOptionItemsPickerSavedHandlers = null;
    }

    function closeProductOptionItemsPicker() {
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const overlay = productInfoPanel.querySelector(".picker-overlay[data-product-option-items-picker]");
        if (overlay) overlay.remove();
      }
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeProductOptionItemsPickerFn;
      delete window._saveProductOptionItemsPickerFn;
      restoreProductOptionItemsPickerFooter();
      productOptionItemsPickerState = null;
    }

    async function applyProductOptionItemsPickerSelection() {
      if (!productOptionItemsPickerState || !product || !product.id) return;
      const excludedItemIds = (Array.isArray(productOptionItemsPickerState.items) ? productOptionItemsPickerState.items : [])
        .map((item) => Number(item.id))
        .filter((itemId) => Number.isFinite(itemId) && itemId > 0 && !productOptionItemsPickerState.selection.has(itemId));
      await apiSetProductOptionItemExclusions(product.id, productOptionItemsPickerState.groupId, excludedItemIds);
      const details = await ensureOptionGroupDetails(productOptionItemsPickerState.groupId, { productId: product.id });
      if (details) {
        const nextDetails = {
          ...details,
          items: (Array.isArray(details.items) ? details.items : []).map((item) => ({
            ...item,
            is_excluded_for_product: excludedItemIds.includes(Number(item.id)),
          })),
          product_scope: {
            product_id: Number(product.id),
            excluded_item_ids: excludedItemIds,
            visible_item_ids: (Array.isArray(details.items) ? details.items : [])
              .map((item) => Number(item.id))
              .filter((itemId) => Number.isFinite(itemId) && itemId > 0 && !excludedItemIds.includes(itemId)),
          },
        };
        setCachedProductScopedOptionDetails(productOptionItemsPickerState.groupId, nextDetails);
      }
      closeProductOptionItemsPicker();
      await renderOptionAccordion();
    }

    async function openProductOptionItemsPicker(groupId) {
      const numericGroupId = Number(groupId);
      if (!Number.isFinite(numericGroupId) || numericGroupId <= 0 || !isEdit || !product || !product.id) return;
      if (!state.catalogCategories.length) {
        await loadCatalogCategories();
      }
      const details = await ensureOptionGroupDetails(numericGroupId, { productId: product.id });
      if (!details) return;
      setCachedProductScopedOptionDetails(numericGroupId, details);
      const items = Array.isArray(details.items) ? details.items : [];
      const selection = new Set(
        items
          .filter((item) => item?.is_excluded_for_product !== true)
          .map((item) => Number(item.id))
          .filter((itemId) => Number.isFinite(itemId) && itemId > 0)
      );
      productOptionItemsPickerState = {
        groupId: numericGroupId,
        categoryId: 0,
        query: "",
        items,
        selection,
      };

      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";
      pickerOverlay.dataset.productOptionItemsPicker = "1";
      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";
      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">\u041f\u0443\u043d\u043a\u0442\u044b</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-tabs" data-product-option-picker-tabs></div>
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" type="search" data-product-option-picker-search placeholder="\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e" />
            </div>
            <label class="option-picker-select-all">
              <input type="checkbox" data-product-option-picker-select-all />
              <span data-product-option-picker-select-all-label>\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0435</span>
            </label>
            <div class="option-picker-list" data-product-option-picker-list></div>
          </div>
        </div>
      `;
      pickerOverlay.appendChild(pickerContent);

      const searchInput = pickerOverlay.querySelector("[data-product-option-picker-search]");
      const selectAllInput = pickerOverlay.querySelector("[data-product-option-picker-select-all]");
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          productOptionItemsPickerState.query = searchInput.value || "";
          renderProductOptionPickerList(pickerOverlay);
        });
      }
      if (selectAllInput) {
        selectAllInput.addEventListener("change", () => {
          const visibleItems = getProductOptionPickerVisibleItems();
          const ids = visibleItems
            .map((item) => Number(item.id))
            .filter((itemId) => Number.isFinite(itemId) && itemId > 0);
          const selectedCount = ids.filter((itemId) => productOptionItemsPickerState.selection.has(itemId)).length;
          const allSelected = ids.length > 0 && selectedCount === ids.length;
          if (allSelected) ids.forEach((itemId) => productOptionItemsPickerState.selection.delete(itemId));
          else ids.forEach((itemId) => productOptionItemsPickerState.selection.add(itemId));
          renderProductOptionPickerList(pickerOverlay);
        });
      }

      renderProductOptionPickerTabs(pickerOverlay);
      renderProductOptionPickerList(pickerOverlay);

      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) existingPicker.remove();
        productInfoPanel.appendChild(pickerOverlay);
      }

      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
        if (!productOptionItemsPickerSavedFooterState) {
          productOptionItemsPickerSavedFooterState = {
            footerHidden: footer.classList.contains("hidden"),
            viewHidden: footerView.classList.contains("hidden"),
            editHidden: footerEditMode.classList.contains("hidden"),
            deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
            moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
            cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm"),
            cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
          };
          productOptionItemsPickerSavedHandlers = {
            cancel: cancelBtn.onclick,
            save: saveBtn.onclick,
          };
        }
        footer.classList.remove("hidden");
        footerView.classList.add("hidden");
        footerEditMode.classList.remove("hidden");
        if (deleteBtn) deleteBtn.classList.add("hidden");
        if (moreBtn) moreBtn.classList.add("hidden");
        cancelBtn.classList.remove("is-confirm");
        cancelBtn.classList.add("is-fullwidth");
        if (!cancelBtn.dataset.pickerOriginalHtml) {
          cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
        }
        cancelBtn.textContent = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";
        cancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";
        cancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");
        cancelBtn.dataset.pickerType = "product-option-items";
        saveBtn.dataset.pickerType = "product-option-items";
        window._closeProductOptionItemsPickerFn = () => {
          closeProductOptionItemsPicker();
        };
        window._saveProductOptionItemsPickerFn = async () => {
          await applyProductOptionItemsPickerSelection();
        };
      }
    }

    function getCachedProductScopedVariantDetails(groupId) {
      return variantDetailsCache.get(Number(groupId)) || null;
    }

    function setCachedProductScopedVariantDetails(groupId, details) {
      variantDetailsCache.set(Number(groupId), details);
    }

    function clearCachedProductScopedVariantDetails(groupId) {
      variantDetailsCache.delete(Number(groupId));
    }

    function syncDraftProductVariantDefault(groupId, details) {
      const numericGroupId = Number(groupId);
      const resolvedDefaultValueIndex = Number(details?.product_scope?.resolved_default_value_index);
      if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) return;
      if (!Number.isFinite(resolvedDefaultValueIndex) || resolvedDefaultValueIndex < 0) return;
      if (!Array.isArray(draft.productVariants)) draft.productVariants = [];
      const existing = draft.productVariants.find((variant) => Number(variant.id) === numericGroupId);
      if (existing) existing.default_value_index = resolvedDefaultValueIndex;
      else draft.productVariants.push({ id: numericGroupId, default_value_index: resolvedDefaultValueIndex });
    }

    async function ensureProductScopedVariantGroupDetails(groupId) {
      const numericGroupId = Number(groupId);
      if (!Number.isFinite(numericGroupId) || numericGroupId <= 0) return null;
      const cached = getCachedProductScopedVariantDetails(numericGroupId);
      if (cached) return cached;
      const res = await apiGetVariantGroup(numericGroupId, { productId: product?.id || null });
      const details = res.data || null;
      if (details) {
        setCachedProductScopedVariantDetails(numericGroupId, details);
        syncDraftProductVariantDefault(numericGroupId, details);
      }
      return details;
    }

    function getProductScopedVariantSummaryPayload(groupId, group, details) {
      const scoped = details?.product_scope;
      if (scoped && Array.isArray(scoped.visible_values)) {
        const visibleIndexes = Array.isArray(scoped.visible_value_indexes) ? scoped.visible_value_indexes : [];
        const resolvedVisibleIndex = scoped.resolved_default_visible_index != null
          ? Number(scoped.resolved_default_visible_index)
          : null;
        return {
          values: scoped.visible_values,
          tiers: Array.isArray(scoped.visible_tiers) ? scoped.visible_tiers : [],
          defaultIdx: Number.isFinite(resolvedVisibleIndex) && resolvedVisibleIndex >= 0 ? resolvedVisibleIndex : null,
          valueIndexMap: visibleIndexes,
          removableValueIndexes: visibleIndexes,
        };
      }

      const variantData = draft.productVariants?.find((variant) => Number(variant.id) === Number(groupId));
      return {
        values: details?.group?.values || group?.values || [],
        tiers: details?.tiers || details?.discount_tiers || [],
        defaultIdx: variantData?.default_value_index != null
          ? Number(variantData.default_value_index)
          : (details?.group?.default_value_index != null ? Number(details.group.default_value_index) : null),
        valueIndexMap: null,
        removableValueIndexes: null,
      };
    }

    function getProductVariantValuePickerVisibleItems() {
      if (!productVariantValuesPickerState) return [];
      const query = String(productVariantValuesPickerState.query || "").trim().toLowerCase();
      return (Array.isArray(productVariantValuesPickerState.valuesMeta) ? productVariantValuesPickerState.valuesMeta : [])
        .filter((item) => !query || String(item?.value || "").toLowerCase().includes(query));
    }

    function updateProductVariantValuePickerSelectAllState(overlay) {
      if (!overlay || !productVariantValuesPickerState) return;
      const input = overlay.querySelector("[data-product-variant-picker-select-all]");
      const label = overlay.querySelector("[data-product-variant-picker-select-all-label]");
      if (!input || !label) return;
      const items = getProductVariantValuePickerVisibleItems();
      const ids = items
        .map((item) => Number(item.index))
        .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0);
      const selectedCount = ids.filter((valueIndex) => productVariantValuesPickerState.selection.has(valueIndex)).length;
      const allSelected = ids.length > 0 && selectedCount === ids.length;
      const noneSelected = selectedCount === 0;
      input.checked = allSelected;
      input.indeterminate = !allSelected && !noneSelected;
      input.disabled = ids.length === 0;
      const text = allSelected ? "\u0421\u0431\u0440\u043e\u0441\u0438\u0442\u044c \u0432\u0441\u0435" : "\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0435";
      label.textContent = text;
      input.setAttribute("aria-label", text);
    }

    function renderProductVariantValuePickerList(overlay) {
      if (!overlay || !productVariantValuesPickerState) return;
      const listEl = overlay.querySelector("[data-product-variant-picker-list]");
      if (!listEl) return;
      const items = getProductVariantValuePickerVisibleItems();
      if (!items.length) {
        listEl.innerHTML = '<div class="empty-hint">\u041d\u0435\u0442 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439 \u0434\u043b\u044f \u043e\u0442\u043e\u0431\u0440\u0430\u0436\u0435\u043d\u0438\u044f</div>';
        updateProductVariantValuePickerSelectAllState(overlay);
        return;
      }
      const formatMetaLabel = (discountPercent) => {
        const numericDiscount = Number(discountPercent || 0);
        const uiValue = Number.isFinite(numericDiscount) ? -numericDiscount : 0;
        if (uiValue < 0) return `\u0421\u043a\u0438\u0434\u043a\u0430: ${uiValue}%`;
        if (uiValue > 0) return `\u041d\u0430\u0434\u0431\u0430\u0432\u043a\u0430: +${uiValue}%`;
        return "\u0411\u0435\u0437 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u044f";
      };
      listEl.innerHTML = items.map((item) => {
        const valueIndex = Number(item.index);
        const checked = productVariantValuesPickerState.selection.has(valueIndex);
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-variant-picker-item="${valueIndex}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(item.value || "")}</div>
              <div class="options-row-meta">${escapeHtml(formatMetaLabel(item.discount_percent))}</div>
            </div>
            <input class="option-picker-checkbox" type="checkbox" data-product-variant-picker-checkbox="${valueIndex}" ${checked ? "checked" : ""} />
          </div>
        `;
      }).join("");
      listEl.querySelectorAll("[data-product-variant-picker-item]").forEach((row) => {
        row.addEventListener("click", () => {
          const valueIndex = Number(row.dataset.productVariantPickerItem);
          if (!Number.isFinite(valueIndex) || valueIndex < 0) return;
          if (productVariantValuesPickerState.selection.has(valueIndex)) {
            productVariantValuesPickerState.selection.delete(valueIndex);
          } else {
            productVariantValuesPickerState.selection.add(valueIndex);
          }
          renderProductVariantValuePickerList(overlay);
        });
      });
      updateProductVariantValuePickerSelectAllState(overlay);
    }

    function restoreProductVariantValuesPickerFooter() {
      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (!footer || !footerView || !footerEditMode || !cancelBtn || !saveBtn || !productVariantValuesPickerSavedFooterState) return;

      if (productVariantValuesPickerSavedFooterState.footerHidden) footer.classList.add("hidden");
      else footer.classList.remove("hidden");
      if (productVariantValuesPickerSavedFooterState.viewHidden) footerView.classList.add("hidden");
      else footerView.classList.remove("hidden");
      if (productVariantValuesPickerSavedFooterState.editHidden) footerEditMode.classList.add("hidden");
      else footerEditMode.classList.remove("hidden");
      if (deleteBtn) {
        if (productVariantValuesPickerSavedFooterState.deleteBtnHidden) deleteBtn.classList.add("hidden");
        else deleteBtn.classList.remove("hidden");
      }
      if (moreBtn) {
        if (productVariantValuesPickerSavedFooterState.moreBtnHidden) moreBtn.classList.add("hidden");
        else moreBtn.classList.remove("hidden");
      }
      if (productVariantValuesPickerSavedFooterState.cancelBtnIsFullwidth) cancelBtn.classList.add("is-fullwidth");
      else cancelBtn.classList.remove("is-fullwidth");
      if (productVariantValuesPickerSavedFooterState.cancelBtnIsConfirm) cancelBtn.classList.add("is-confirm");
      else cancelBtn.classList.remove("is-confirm");
      if (cancelBtn.dataset.pickerOriginalHtml) {
        cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
        delete cancelBtn.dataset.pickerOriginalHtml;
      }
      if (productVariantValuesPickerSavedHandlers) {
        cancelBtn.onclick = productVariantValuesPickerSavedHandlers.cancel;
        saveBtn.onclick = productVariantValuesPickerSavedHandlers.save;
      }
      productVariantValuesPickerSavedFooterState = null;
      productVariantValuesPickerSavedHandlers = null;
    }

    function closeProductVariantValuesPicker() {
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const overlay = productInfoPanel.querySelector(".picker-overlay[data-product-variant-values-picker]");
        if (overlay) overlay.remove();
      }
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeProductVariantValuesPickerFn;
      delete window._saveProductVariantValuesPickerFn;
      restoreProductVariantValuesPickerFooter();
      productVariantValuesPickerState = null;
    }

    async function applyProductVariantValueSelection(groupId, selection) {
      const numericGroupId = Number(groupId);
      if (!Number.isFinite(numericGroupId) || numericGroupId <= 0 || !product || !product.id) return;
      const details = await ensureProductScopedVariantGroupDetails(numericGroupId);
      const allIndexes = Array.isArray(details?.values_meta)
        ? details.values_meta
            .map((item) => Number(item.index))
            .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0)
        : [];
      const excludedValueIndexes = allIndexes.filter((valueIndex) => !selection.has(valueIndex));
      await apiSetProductVariantValueExclusions(product.id, numericGroupId, excludedValueIndexes);
      clearCachedProductScopedVariantDetails(numericGroupId);
      const refreshed = await ensureProductScopedVariantGroupDetails(numericGroupId);
      if (refreshed) syncDraftProductVariantDefault(numericGroupId, refreshed);
    }

    async function applyProductVariantValuesPickerSelection() {
      if (!productVariantValuesPickerState) return;
      try {
        await applyProductVariantValueSelection(productVariantValuesPickerState.groupId, productVariantValuesPickerState.selection);
        closeProductVariantValuesPicker();
        await renderVariantAccordion();
      } catch (error) {
        console.error("Failed to save product variant value selection", error);
        const message = error?.message === "AT_LEAST_ONE_VALUE_REQUIRED"
          ? "\u041d\u0443\u0436\u043d\u043e \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435"
          : "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0439 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430";
        if (typeof showToast === "function") showToast(message);
        else alert(message);
      }
    }

    async function openProductVariantValuesPicker(groupId) {
      const numericGroupId = Number(groupId);
      if (!Number.isFinite(numericGroupId) || numericGroupId <= 0 || !isEdit || !product || !product.id) return;
      const details = await ensureProductScopedVariantGroupDetails(numericGroupId);
      if (!details) return;
      const valuesMeta = Array.isArray(details.values_meta) ? details.values_meta : [];
      productVariantValuesPickerState = {
        groupId: numericGroupId,
        query: "",
        valuesMeta,
        selection: new Set(
          valuesMeta
            .filter((item) => item?.is_excluded_for_product !== true)
            .map((item) => Number(item.index))
            .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0)
        ),
      };

      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";
      pickerOverlay.dataset.productVariantValuesPicker = "1";
      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";
      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u044f</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" type="search" data-product-variant-picker-search placeholder="\u041f\u043e\u0438\u0441\u043a \u043f\u043e \u043d\u0430\u0437\u0432\u0430\u043d\u0438\u044e" />
            </div>
            <label class="option-picker-select-all">
              <input type="checkbox" data-product-variant-picker-select-all />
              <span data-product-variant-picker-select-all-label>\u0412\u044b\u0434\u0435\u043b\u0438\u0442\u044c \u0432\u0441\u0435</span>
            </label>
            <div class="option-picker-list" data-product-variant-picker-list></div>
          </div>
        </div>
      `;
      pickerOverlay.appendChild(pickerContent);

      const searchInput = pickerOverlay.querySelector("[data-product-variant-picker-search]");
      const selectAllInput = pickerOverlay.querySelector("[data-product-variant-picker-select-all]");
      if (searchInput) {
        searchInput.addEventListener("input", () => {
          productVariantValuesPickerState.query = searchInput.value || "";
          renderProductVariantValuePickerList(pickerOverlay);
        });
      }
      if (selectAllInput) {
        selectAllInput.addEventListener("change", () => {
          const visibleItems = getProductVariantValuePickerVisibleItems();
          const ids = visibleItems
            .map((item) => Number(item.index))
            .filter((valueIndex) => Number.isFinite(valueIndex) && valueIndex >= 0);
          const selectedCount = ids.filter((valueIndex) => productVariantValuesPickerState.selection.has(valueIndex)).length;
          const allSelected = ids.length > 0 && selectedCount === ids.length;
          if (allSelected) ids.forEach((valueIndex) => productVariantValuesPickerState.selection.delete(valueIndex));
          else ids.forEach((valueIndex) => productVariantValuesPickerState.selection.add(valueIndex));
          renderProductVariantValuePickerList(pickerOverlay);
        });
      }

      renderProductVariantValuePickerList(pickerOverlay);

      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) existingPicker.remove();
        productInfoPanel.appendChild(pickerOverlay);
      }

      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
        if (!productVariantValuesPickerSavedFooterState) {
          productVariantValuesPickerSavedFooterState = {
            footerHidden: footer.classList.contains("hidden"),
            viewHidden: footerView.classList.contains("hidden"),
            editHidden: footerEditMode.classList.contains("hidden"),
            deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
            moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
            cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm"),
            cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
          };
          productVariantValuesPickerSavedHandlers = {
            cancel: cancelBtn.onclick,
            save: saveBtn.onclick,
          };
        }
        footer.classList.remove("hidden");
        footerView.classList.add("hidden");
        footerEditMode.classList.remove("hidden");
        if (deleteBtn) deleteBtn.classList.add("hidden");
        if (moreBtn) moreBtn.classList.add("hidden");
        cancelBtn.classList.remove("is-confirm");
        cancelBtn.classList.add("is-fullwidth");
        if (!cancelBtn.dataset.pickerOriginalHtml) {
          cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
        }
        cancelBtn.textContent = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";
        cancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";
        cancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");
        cancelBtn.dataset.pickerType = "product-variant-values";
        saveBtn.dataset.pickerType = "product-variant-values";
        window._closeProductVariantValuesPickerFn = () => {
          closeProductVariantValuesPicker();
        };
        window._saveProductVariantValuesPickerFn = async () => {
          await applyProductVariantValuesPickerSelection();
        };
      }
    }

    async function refreshProductVariants(productId) {
      if (!productId) return;
      const res = await apiGetProductVariants(productId);
      const arr = Array.isArray(res.data) ? res.data : [];
      // Store variant data with default_value_index for later use
      if (!draft.productVariants) draft.productVariants = [];
      draft.productVariants = arr.map(v => ({
        id: Number(v.id),
        default_value_index: v.default_value_index != null ? Number(v.default_value_index) : null,
      }));
      draft.initialVariantAssignments = arr
        .map((v) => ({
          assignment_id: Number(v.assignment_id),
          group_id: Number(v.id),
        }))
        .filter((v) => Number.isFinite(v.assignment_id) && Number.isFinite(v.group_id));
      const first = arr[0];
      const firstId = first ? Number(first.id) : null;
      if (Number.isFinite(firstId)) {
        draft.variantGroupId = firstId;
        draft.initialVariantGroupId = firstId;
      } else {
        draft.variantGroupId = null;
        draft.initialVariantGroupId = null;
      }
    }

    async function bindVariantStarHandlers(container, groupId) {
      if (!container || !isEdit || !product || !product.id) return;
      
      container.querySelectorAll("[data-variant-star-group]").forEach((btn) => {
        const btnGroupId = Number(btn.dataset.variantStarGroup);
        const variantIndex = Number(btn.dataset.variantStarIndex);
        
        if (!Number.isFinite(btnGroupId) || !Number.isFinite(variantIndex) || btnGroupId !== groupId) return;
        
        // Remove existing handler to avoid duplicates
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        
        newBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          
          // Find assignment_id for this variant group
          const assignment = draft.initialVariantAssignments.find(a => Number(a.group_id) === groupId);
          if (!assignment || !Number.isFinite(assignment.assignment_id)) {
            console.error("Assignment not found for variant group", groupId);
            return;
          }
          
          try {
            // Update assignment with new default_value_index
            await apiPatchVariantAssignment(assignment.assignment_id, { default_value_index: variantIndex });
            
            // Update draft.productVariants
            if (!draft.productVariants) draft.productVariants = [];
            let variantData = draft.productVariants.find(v => Number(v.id) === groupId);
            if (variantData) {
              variantData.default_value_index = variantIndex;
            } else {
              draft.productVariants.push({
                id: groupId,
                default_value_index: variantIndex
              });
            }
            
            // Reload variant data to ensure consistency
            await refreshProductVariants(product.id);
            
            // Re-render the accordion content
            const details = getCachedProductScopedVariantDetails(groupId) || await ensureProductScopedVariantGroupDetails(groupId);
            if (details) {
              const group = state.variantGroups.find((item) => Number(item.id) === groupId);
              const summaryPayload = getProductScopedVariantSummaryPayload(groupId, group, details);
              container.innerHTML = renderVariantValuesSummary(summaryPayload.values, summaryPayload.tiers, summaryPayload.defaultIdx, {
                isEditable: isEdit,
                groupId,
                valueIndexMap: summaryPayload.valueIndexMap,
                removableValueIndexes: summaryPayload.removableValueIndexes,
              });
              bindVariantStarHandlers(container, groupId);
            }
            
            // toast removed: too noisy in UI
          } catch (e) {
            console.error("Failed to update variant default value", e);
            showToast("Не удалось обновить вариант по умолчанию");
          }
        });
      });
    }

    function restoreProductVariantPickerFooter() {
      const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (!footer || !footerView || !footerEditMode || !cancelBtn || !saveBtn || !productVariantPickerSavedFooterState) return;

      if (productVariantPickerSavedFooterState.footerHidden) {
        footer.classList.add("hidden");
      } else {
        footer.classList.remove("hidden");
      }
      if (productVariantPickerSavedFooterState.viewHidden) {
        footerView.classList.add("hidden");
      } else {
        footerView.classList.remove("hidden");
      }
      if (productVariantPickerSavedFooterState.editHidden) {
        footerEditMode.classList.add("hidden");
      } else {
        footerEditMode.classList.remove("hidden");
      }

      if (deleteBtn) {
        if (productVariantPickerSavedFooterState.deleteBtnHidden) {
          deleteBtn.classList.add("hidden");
        } else {
          deleteBtn.classList.remove("hidden");
        }
      }
      if (moreBtn) {
        if (productVariantPickerSavedFooterState.moreBtnHidden) {
          moreBtn.classList.add("hidden");
        } else {
          moreBtn.classList.remove("hidden");
        }
      }

      if (productVariantPickerSavedFooterState.cancelBtnIsFullwidth) {
        cancelBtn.classList.add("is-fullwidth");
      } else {
        cancelBtn.classList.remove("is-fullwidth");
      }
      if (productVariantPickerSavedFooterState.cancelBtnIsConfirm) {
        cancelBtn.classList.add("is-confirm");
      } else {
        cancelBtn.classList.remove("is-confirm");
      }
      if (cancelBtn.dataset.pickerOriginalHtml) {
        cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
        delete cancelBtn.dataset.pickerOriginalHtml;
      }

      if (productVariantPickerSavedHandlers) {
        cancelBtn.onclick = productVariantPickerSavedHandlers.cancel;
        saveBtn.onclick = productVariantPickerSavedHandlers.save;
      }

      productVariantPickerSavedFooterState = null;
      productVariantPickerSavedHandlers = null;
    }

    function closeProductVariantPicker() {
      productVariantPickerSelection = null;
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
      }

      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeVariantPickerFn;
      delete window._saveVariantPickerFn;
      restoreProductVariantPickerFooter();
    }

    async function openProductVariantPicker() {
      if (!state.variantGroups.length) {
        await loadVariantGroups();
      }
      if (productVariantPickerSelection == null) {
        productVariantPickerSelection = draft.variantGroupId;
      }

      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";

      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";

      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">Варианты</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" id="variantPickerSearchInput" type="search" placeholder="Поиск по названию" />
            </div>
            <div class="option-picker-list" id="variantPickerListContent"></div>
          </div>
        </div>
      `;

      pickerOverlay.appendChild(pickerContent);

      const searchInput = pickerContent.querySelector("#variantPickerSearchInput");
      const listContent = pickerContent.querySelector("#variantPickerListContent");

      function renderList() {
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const baseUnitId = Number(ui.baseUnitSelect?.value || 0);
        if (!Number.isFinite(baseUnitId) || baseUnitId <= 0) {
          if (listContent) {
            listContent.innerHTML = `<div class="empty-hint">Выберите базовую единицу измерения</div>`;
          }
          return;
        }
        const groups = state.variantGroups
          .filter((g) => g.is_active)
          .filter((g) => !query || String(g.title || "").toLowerCase().includes(query))
          .filter((g) => {
            const unitId = Number(g.unit_id);
            if (!Number.isFinite(unitId) || unitId <= 0) return false;
            return getConversionFactor(baseUnitId, unitId) != null;
          })
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

        if (!listContent) return;
        if (!groups.length) {
          listContent.innerHTML = `<div class="empty-hint">Нет вариантов с подходящей единицей измерения</div>`;
          return;
        }
        listContent.innerHTML = groups.map((g) => {
          const selected = Number(productVariantPickerSelection) === Number(g.id);
          const values = Array.isArray(g.values) ? g.values : [];
          const valuesText = values.length ? values.join(", ") : "нет значений";
          return `
            <div class="option-picker-row ${selected ? "is-selected" : ""}" data-variant-id="${g.id}">
              <div class="option-picker-meta">
                <div class="options-row-title">${escapeHtml(g.title || "")}</div>
                <div class="options-row-meta">Значения: ${escapeHtml(valuesText)}</div>
              </div>
              <input class="option-picker-checkbox" type="radio" name="variant-picker" ${selected ? "checked" : ""} />
            </div>
          `;
        }).join("");

        listContent.querySelectorAll(".option-picker-row[data-variant-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const id = Number(row.dataset.variantId);
            if (!Number.isFinite(id)) return;
            productVariantPickerSelection = id;
            renderList();
          });
        });
      }

      if (searchInput) {
        searchInput.addEventListener("input", renderList);
      }

      renderList();

      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
        productInfoPanel.appendChild(pickerOverlay);

        const footer = $("#productInfoFooter");
        const footerView = $("#productFooterView");
        const footerEditMode = $("#productFooterEditMode");
        const cancelBtn = $("#productFooterCancelBtn");
        const saveBtn = $("#productFooterSaveBtn");
        const deleteBtn = $("#productFooterDeleteEditBtn");
        const moreBtn = $("#productFooterMoreEditBtn");

        if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
          if (!productVariantPickerSavedFooterState) {
            productVariantPickerSavedFooterState = {
              footerHidden: footer.classList.contains("hidden"),
              viewHidden: footerView.classList.contains("hidden"),
              editHidden: footerEditMode.classList.contains("hidden"),
              deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
              moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
              cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm"),
              cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
            };
            productVariantPickerSavedHandlers = {
              cancel: cancelBtn.onclick,
              save: saveBtn.onclick,
            };
          }

          footer.classList.remove("hidden");
          footerView.classList.add("hidden");
          footerEditMode.classList.remove("hidden");
          if (deleteBtn) deleteBtn.classList.add("hidden");
          if (moreBtn) moreBtn.classList.add("hidden");

          cancelBtn.classList.remove("is-confirm");
          cancelBtn.classList.add("is-fullwidth");
          if (!cancelBtn.dataset.pickerOriginalHtml) {
            cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
          }
          cancelBtn.textContent = "Отменить";
          cancelBtn.title = "Отменить";
          cancelBtn.setAttribute("aria-label", "Отменить");
        }

        if (cancelBtn) cancelBtn.dataset.pickerType = "variant";
        if (saveBtn) saveBtn.dataset.pickerType = "variant";

        window._closeVariantPickerFn = () => {
          closeProductVariantPicker();
        };

        window._saveVariantPickerFn = async () => {
          const selectedId = Number(productVariantPickerSelection);
          const hasSelected = Number.isFinite(selectedId) && selectedId > 0;
          if (isEdit && product && product.id) {
            const shouldChange = hasSelected && selectedId !== Number(draft.initialVariantGroupId);
            const shouldClear = !hasSelected && draft.initialVariantAssignments.length > 0;
            if (shouldChange || shouldClear) {
              for (const assignment of draft.initialVariantAssignments) {
                if (Number.isFinite(assignment.assignment_id)) {
                  await apiDeleteVariantAssignment(assignment.assignment_id);
                }
              }
              if (hasSelected) {
                await apiAddVariantGroupAssignments(selectedId, [product.id]);
              }
              await refreshProductVariants(product.id);
            }
          } else {
            draft.variantGroupId = hasSelected ? selectedId : null;
            draft.initialVariantGroupId = null;
          }
          renderVariantAccordion();
          closeProductVariantPicker();
        };
      }
    }

    async function renderVariantAccordion() {
      if (!ui.variantAccordion) return;
      const groupId = Number(draft.variantGroupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        ui.variantAccordion.innerHTML = `<div class="empty-hint">Вариант не выбран...</div>`;
        return;
      }
      const group = state.variantGroups.find((g) => Number(g.id) === groupId);
      if (!group) {
        ui.variantAccordion.innerHTML = `<div class="empty-hint">Вариант не найден...</div>`;
        return;
      }
      const unitLabel = getUnitLabel(group.unit_id);
      const unitMeta = unitLabel ? `Ед.: ${unitLabel}` : "Ед.: —";
      const details = variantDetailsCache.get(groupId);
      const values = details?.group?.values || group.values || [];
      const tiers = details?.tiers || details?.discount_tiers || [];
      // Get default value index from variant data (per-product override or group default)
      const variantData = draft.productVariants?.find(v => Number(v.id) === groupId);
      const defaultIdx = variantData?.default_value_index != null ? Number(variantData.default_value_index) : 
                        (details?.group?.default_value_index != null ? Number(details.group.default_value_index) : null);
      const itemsHtml = details ? renderVariantValuesSummary(values, tiers, defaultIdx, { isEditable: isEdit, groupId: groupId }) : `<div class="muted">Раскройте, чтобы загрузить значения.</div>`;

      const actionsHtml = isView
        ? `<span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>`
        : `
          <button class="btn btn-icon btn-sm btn-ghost" type="button" data-variant-edit="${groupId}" title="Изменить" onclick="event.stopPropagation();">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-ghost" type="button" data-variant-delete="${groupId}" title="Удалить" onclick="event.stopPropagation();">
            <i class="fas fa-trash"></i>
          </button>
          <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
        `;

      ui.variantAccordion.innerHTML = `
        <div class="acc-item" data-variant-group="${groupId}">
          <div class="stage-item acc-trigger" role="button" tabindex="0" data-acc-trigger>
            <span class="stage-meta stage-text">
              <b>${escapeHtml(group.title || "")}</b>
              <small>${escapeHtml(unitMeta)}</small>
            </span>
            <div class="option-actions-inline">
              ${actionsHtml}
            </div>
          </div>
          <div class="acc-panel" data-acc-panel>
            <div class="acc-panel-inner">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;

      bindAccordionContainer(ui.variantAccordion);

      if (!isView) {
        ui.variantAccordion.querySelectorAll("[data-variant-edit]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.variantEdit);
            if (!Number.isFinite(id)) return;
            const groupItem = state.variantGroups.find((g) => Number(g.id) === id);
            await loadVariantGroupDetails(id);
            if (!state.variantGroupDetails?.group) return;
            state.selectedVariantGroupId = id;
            startVariantEdit({ silent: true });
            openVariantGroupTab(id, groupItem?.title || "Вариант", { activate: true });
          });
        });

        ui.variantAccordion.querySelectorAll("[data-variant-delete]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (isEdit && product && product.id) {
              for (const assignment of draft.initialVariantAssignments) {
                if (Number.isFinite(assignment.assignment_id)) {
                  await apiDeleteVariantAssignment(assignment.assignment_id);
                }
              }
              await refreshProductVariants(product.id);
            } else {
              draft.variantGroupId = null;
              draft.initialVariantGroupId = null;
              draft.initialVariantAssignments = [];
            }
            variantDetailsCache.delete(groupId);
            renderVariantAccordion();
          });
        });
      }

      ui.variantAccordion.querySelectorAll(".acc-item").forEach((item) => {
        const id = Number(item.dataset.variantGroup);
        if (!Number.isFinite(id)) return;
        const trigger = item.querySelector("[data-acc-trigger]");
        const panel = item.querySelector("[data-acc-panel]");
        if (!trigger || !panel) return;
        trigger.addEventListener("click", async () => {
          if (variantDetailsCache.has(id)) return;
          const details = await ensureVariantGroupDetails(id);
          if (details) variantDetailsCache.set(id, details);
          const inner = panel.querySelector(".acc-panel-inner");
          if (inner) {
            // Get default value index from variant data (per-product override or group default)
            const variantData = draft.productVariants?.find(v => Number(v.id) === id);
            const defaultIdx = variantData?.default_value_index != null ? Number(variantData.default_value_index) : 
                              (details?.group?.default_value_index != null ? Number(details.group.default_value_index) : null);
            inner.innerHTML = renderVariantValuesSummary(details?.group?.values || [], details?.tiers || [], defaultIdx, { isEditable: isEdit, groupId: id });
            
            // Bind star click handlers if in edit mode
            if (isEdit) {
              bindVariantStarHandlers(inner, id);
            }
          }
          refreshOpenAccordions();
        }, { once: true });
      });

      // Bind star click handlers for initially rendered content if in edit mode
      if (isEdit && details) {
        const inner = ui.variantAccordion.querySelector(".acc-panel-inner");
        if (inner) {
          bindVariantStarHandlers(inner, groupId);
        }
      }

      refreshOpenAccordions();
    }

    async function renderVariantAccordion() {
      if (!ui.variantAccordion) return;
      const groupId = Number(draft.variantGroupId);
      if (!Number.isFinite(groupId) || groupId <= 0) {
        ui.variantAccordion.innerHTML = `<div class="empty-hint">\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u043d\u0435 \u0432\u044b\u0431\u0440\u0430\u043d...</div>`;
        return;
      }
      const group = state.variantGroups.find((item) => Number(item.id) === groupId);
      if (!group) {
        ui.variantAccordion.innerHTML = `<div class="empty-hint">\u0412\u0430\u0440\u0438\u0430\u043d\u0442 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d...</div>`;
        return;
      }

      const unitLabel = getUnitLabel(group.unit_id);
      const unitMeta = unitLabel ? `\u0415\u0434.: ${unitLabel}` : "\u0415\u0434.: \u2014";
      const details = getCachedProductScopedVariantDetails(groupId);
      const summaryPayload = details ? getProductScopedVariantSummaryPayload(groupId, group, details) : null;
      const itemsHtml = summaryPayload
        ? renderVariantValuesSummary(summaryPayload.values, summaryPayload.tiers, summaryPayload.defaultIdx, {
            isEditable: isEdit,
            groupId,
            valueIndexMap: summaryPayload.valueIndexMap,
            removableValueIndexes: summaryPayload.removableValueIndexes,
          })
        : `<div class="muted">\u0420\u0430\u0441\u043a\u0440\u043e\u0439\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f.</div>`;

      const actionsHtml = isView
        ? `<span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>`
        : `
          ${isEdit && product && product.id ? `<button class="btn btn-icon btn-sm" type="button" data-product-variant-values-open="${groupId}" title="\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c/\u0441\u043a\u0440\u044b\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f" onclick="event.stopPropagation();"><i class="fas fa-plus"></i></button>` : ""}
          <button class="btn btn-icon btn-sm btn-ghost" type="button" data-variant-edit="${groupId}" title="\u0418\u0437\u043c\u0435\u043d\u0438\u0442\u044c" onclick="event.stopPropagation();">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn btn-icon btn-sm btn-ghost" type="button" data-variant-delete="${groupId}" title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c" onclick="event.stopPropagation();">
            <i class="fas fa-trash"></i>
          </button>
          <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
        `;

      ui.variantAccordion.innerHTML = `
        <div class="acc-item" data-variant-group="${groupId}">
          <div class="stage-item acc-trigger" role="button" tabindex="0" data-acc-trigger>
            <span class="stage-meta stage-text">
              <b>${escapeHtml(group.title || "")}</b>
              <small>${escapeHtml(unitMeta)}</small>
            </span>
            <div class="option-actions-inline">
              ${actionsHtml}
            </div>
          </div>
          <div class="acc-panel" data-acc-panel>
            <div class="acc-panel-inner">
              ${itemsHtml}
            </div>
          </div>
        </div>
      `;

      bindAccordionContainer(ui.variantAccordion);

      if (!isView) {
        ui.variantAccordion.querySelectorAll("[data-product-variant-values-open]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.productVariantValuesOpen);
            if (!Number.isFinite(id) || id <= 0) return;
            await openProductVariantValuesPicker(id);
          });
        });

        ui.variantAccordion.querySelectorAll("[data-variant-edit]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.variantEdit);
            if (!Number.isFinite(id)) return;
            const groupItem = state.variantGroups.find((item) => Number(item.id) === id);
            await loadVariantGroupDetails(id);
            if (!state.variantGroupDetails?.group) return;
            state.selectedVariantGroupId = id;
            startVariantEdit({ silent: true });
            openVariantGroupTab(id, groupItem?.title || "\u0412\u0430\u0440\u0438\u0430\u043d\u0442", { activate: true });
          });
        });

        ui.variantAccordion.querySelectorAll("[data-variant-delete]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (isEdit && product && product.id) {
              for (const assignment of draft.initialVariantAssignments) {
                if (Number.isFinite(assignment.assignment_id)) {
                  await apiDeleteVariantAssignment(assignment.assignment_id);
                }
              }
              await refreshProductVariants(product.id);
            } else {
              draft.variantGroupId = null;
              draft.initialVariantGroupId = null;
              draft.initialVariantAssignments = [];
            }
            clearCachedProductScopedVariantDetails(groupId);
            renderVariantAccordion();
          });
        });

        ui.variantAccordion.querySelectorAll("[data-product-variant-value-remove]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const [groupIdRaw, valueIndexRaw] = String(btn.dataset.productVariantValueRemove || "").split(":");
            const scopedGroupId = Number(groupIdRaw);
            const valueIndex = Number(valueIndexRaw);
            if (!Number.isFinite(scopedGroupId) || scopedGroupId <= 0) return;
            if (!Number.isFinite(valueIndex) || valueIndex < 0) return;
            try {
              const scopedDetails = getCachedProductScopedVariantDetails(scopedGroupId)
                || await ensureProductScopedVariantGroupDetails(scopedGroupId);
              const visibleIndexes = Array.isArray(scopedDetails?.product_scope?.visible_value_indexes)
                ? scopedDetails.product_scope.visible_value_indexes
                    .map((idx) => Number(idx))
                    .filter((idx) => Number.isFinite(idx) && idx >= 0)
                : [];
              const nextSelection = new Set(visibleIndexes.filter((idx) => idx !== valueIndex));
              await applyProductVariantValueSelection(scopedGroupId, nextSelection);
              await renderVariantAccordion();
            } catch (error) {
              console.error("Failed to exclude variant value for product", error);
              const message = error?.message === "AT_LEAST_ONE_VALUE_REQUIRED"
                ? "\u041d\u0443\u0436\u043d\u043e \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0445\u043e\u0442\u044f \u0431\u044b \u043e\u0434\u043d\u043e \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u0435"
                : "\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043a\u0440\u044b\u0442\u0438\u0438 \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u0430";
              if (typeof showToast === "function") showToast(message);
              else alert(message);
            }
          });
        });
      }

      ui.variantAccordion.querySelectorAll(".acc-item").forEach((item) => {
        const id = Number(item.dataset.variantGroup);
        if (!Number.isFinite(id)) return;
        const trigger = item.querySelector("[data-acc-trigger]");
        const panel = item.querySelector("[data-acc-panel]");
        if (!trigger || !panel) return;
        trigger.addEventListener("click", async () => {
          if (getCachedProductScopedVariantDetails(id)) return;
          const scopedDetails = await ensureProductScopedVariantGroupDetails(id);
          const inner = panel.querySelector(".acc-panel-inner");
          if (inner) {
            const nextSummary = scopedDetails ? getProductScopedVariantSummaryPayload(id, group, scopedDetails) : null;
            inner.innerHTML = nextSummary
              ? renderVariantValuesSummary(nextSummary.values, nextSummary.tiers, nextSummary.defaultIdx, {
                  isEditable: isEdit,
                  groupId: id,
                  valueIndexMap: nextSummary.valueIndexMap,
                  removableValueIndexes: nextSummary.removableValueIndexes,
                })
              : `<div class="muted">\u0420\u0430\u0441\u043a\u0440\u043e\u0439\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f.</div>`;
            if (isEdit) bindVariantStarHandlers(inner, id);
          }
          refreshOpenAccordions();
        });
      });

      if (isEdit && summaryPayload) {
        const inner = ui.variantAccordion.querySelector(".acc-panel-inner");
        if (inner) bindVariantStarHandlers(inner, groupId);
      }

      refreshOpenAccordions();
    }

    if (ui.variantManageBtn && !isView) {
      ui.variantManageBtn.addEventListener("click", () => {
        openProductVariantPicker();
      });
    }

    if (ui.optionManageBtn && !isView) {
      ui.optionManageBtn.addEventListener("click", () => {
        optionPickerSelection = new Set(draft.optionGroups);
        openOptionPicker();
      });
    }

    function renderOptionPickerList(pickerSelection) {
      if (!ui.optionList) return;
      const query = String(ui.optionSearch.value || "").trim().toLowerCase();
      const groups = state.optionGroups
        .filter((g) => g.is_active)
        .filter((g) => !query || String(g.title || "").toLowerCase().includes(query))
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      ui.optionList.innerHTML = groups.map((g) => {
        const checked = pickerSelection.has(g.id);
        return `
          <div class="option-picker-row ${checked ? "is-selected" : ""}" data-option-id="${g.id}">
            <div class="option-picker-meta">
              <div class="options-row-title">${escapeHtml(g.title || "")}</div>
              <div class="options-row-meta">${escapeHtml(getSelectionLabel(g.selection_type))}</div>
            </div>
            <input class="option-picker-checkbox" type="checkbox" data-option-id="${g.id}" ${checked ? "checked" : ""} />
          </div>
        `;
      }).join("");

      ui.optionList.querySelectorAll(".option-picker-row[data-option-id]").forEach((row) => {
        row.addEventListener("click", () => {
          const id = Number(row.dataset.optionId);
          if (!Number.isFinite(id)) return;
          if (pickerSelection.has(id)) pickerSelection.delete(id);
          else pickerSelection.add(id);
          renderOptionPickerList(pickerSelection);
          if (ui.optionApply) ui.optionApply.textContent = "Добавить";
        });
      });
    }

    async function renderOptionAccordion() {
      if (!ui.optionAccordion) return;
      const selected = Array.from(draft.optionGroups)
        .map((id) => state.optionGroups.find((g) => Number(g.id) === Number(id)))
        .filter(Boolean)
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

      if (!selected.length) {
        ui.optionAccordion.innerHTML = `<div class="empty-hint">Опции не выбраны...</div>`;
        return;
      }

      ui.optionAccordion.innerHTML = selected.map((g) => {
        const details = getCachedProductScopedOptionDetails(g.id);
        const limitsLabel = formatOptionLimits(g.min_select, g.max_select);
        const itemsHtml = details ? renderProductScopedOptionItemsSummary(details.items || [], { removable: Boolean(isEdit && product && product.id), groupId: g.id }) : `<div class="muted">\u0420\u0430\u0441\u043a\u0440\u043e\u0439\u0442\u0435, \u0447\u0442\u043e\u0431\u044b \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u0443\u043d\u043a\u0442\u044b.</div>`;
        const actionsHtml = isView
          ? `<span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>`
          : `
            <button class="btn btn-icon btn-sm" type="button" data-option-edit="${g.id}" title="Изменить" onclick="event.stopPropagation();">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-icon btn-sm" type="button" data-option-delete="${g.id}" title="Удалить" onclick="event.stopPropagation();">
              <i class="fas fa-trash"></i>
            </button>
            <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
          `;
        return `
          <div class="acc-item" data-option-group="${g.id}">
            <div class="stage-item acc-trigger" role="button" tabindex="0" data-acc-trigger>
              <span class="stage-meta stage-text">
                <b>${escapeHtml(g.title || "")}</b>
                <small>${escapeHtml(getSelectionLabel(g.selection_type))} · ${escapeHtml(limitsLabel)}</small>
              </span>
              <div class="option-actions-inline">
                ${actionsHtml}
              </div>
            </div>
            <div class="acc-panel" data-acc-panel>
              <div class="acc-panel-inner">
                ${itemsHtml}
              </div>
            </div>
          </div>
        `;
      }).join("");

      bindAccordionContainer(ui.optionAccordion);

      if (!isView) {
        if (isEdit && product && product.id) {
          ui.optionAccordion.querySelectorAll(".acc-item").forEach((item) => {
            const groupId = Number(item.dataset.optionGroup);
            if (!Number.isFinite(groupId) || groupId <= 0) return;
            const actionsEl = item.querySelector(".option-actions-inline");
            if (!actionsEl || actionsEl.querySelector(`[data-option-items-picker-open="${groupId}"]`)) return;
            const addBtn = document.createElement("button");
            addBtn.className = "btn btn-icon btn-sm";
            addBtn.type = "button";
            addBtn.dataset.optionItemsPickerOpen = String(groupId);
            addBtn.title = "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c/\u0441\u043a\u0440\u044b\u0442\u044c \u043f\u0443\u043d\u043a\u0442\u044b";
            addBtn.setAttribute("aria-label", "\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c/\u0441\u043a\u0440\u044b\u0442\u044c \u043f\u0443\u043d\u043a\u0442\u044b");
            addBtn.innerHTML = '<i class="fas fa-plus"></i>';
            addBtn.addEventListener("click", async (e) => {
              e.stopPropagation();
              await openProductOptionItemsPicker(groupId);
            });
            actionsEl.prepend(addBtn);
          });
        }

        // Handle Edit button
        ui.optionAccordion.querySelectorAll("[data-option-edit]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.optionEdit);
            if (!Number.isFinite(id)) return;
            // Ensure selectedProductId is set for return navigation
            if (isEdit && product && product.id && !state.selectedProductId) {
              state.selectedProductId = product.id;
            }
            const groupItem = state.optionGroups.find((g) => Number(g.id) === id);
            await loadOptionGroupDetails(id);
            if (!state.optionGroupDetails?.group) return;
            state.selectedOptionGroupId = id;
            startOptionEdit({ silent: true });
            openOptionGroupTab(id, groupItem?.title || "Опция", { activate: true });
          });
        });

        // Handle Delete button
        ui.optionAccordion.querySelectorAll("[data-option-delete]").forEach((btn) => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const id = Number(btn.dataset.optionDelete);
            if (!Number.isFinite(id)) return;
            
            if (isEdit && product && product.id) {
              // For existing products: delete via API
              try {
                await apiDisableProductOptionAssignment(product.id, id);
                draft.optionGroups.delete(id);
                draft.initialOptionGroups.delete(id);
                clearCachedProductScopedOptionDetails(id);
                renderOptionAccordion();
              } catch (e) {
                console.error('Failed to delete option', e);
                alert('Ошибка при удалении опции');
              }
            } else {
              // For new products: just remove from draft
              draft.optionGroups.delete(id);
              clearCachedProductScopedOptionDetails(id);
              renderOptionAccordion();
            }
          });
        });

        if (isEdit && product && product.id) {
          ui.optionAccordion.querySelectorAll("[data-product-option-item-remove]").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const [groupIdRaw, itemIdRaw] = String(btn.dataset.productOptionItemRemove || "").split(":");
              const groupId = Number(groupIdRaw);
              const itemId = Number(itemIdRaw);
              if (!Number.isFinite(groupId) || groupId <= 0) return;
              if (!Number.isFinite(itemId) || itemId <= 0) return;
              try {
                const details = getCachedProductScopedOptionDetails(groupId)
                  || await ensureOptionGroupDetails(groupId, { productId: product.id });
                const currentExcluded = new Set(
                  Array.isArray(details?.product_scope?.excluded_item_ids)
                    ? details.product_scope.excluded_item_ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
                    : []
                );
                currentExcluded.add(itemId);
                await apiSetProductOptionItemExclusions(product.id, groupId, Array.from(currentExcluded));
                clearCachedProductScopedOptionDetails(groupId);
                const refreshedDetails = await ensureOptionGroupDetails(groupId, { productId: product.id });
                if (refreshedDetails) setCachedProductScopedOptionDetails(groupId, refreshedDetails);
                await renderOptionAccordion();
              } catch (error) {
                console.error("Failed to exclude option item for product", error);
                alert("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u0440\u0438 \u0441\u043a\u0440\u044b\u0442\u0438\u0438 \u043f\u0443\u043d\u043a\u0442\u0430 \u043e\u043f\u0446\u0438\u0438");
              }
            });
          });
        }
      }

      ui.optionAccordion.querySelectorAll(".acc-item").forEach((item) => {
        const groupId = Number(item.dataset.optionGroup);
        if (!Number.isFinite(groupId)) return;
        const trigger = item.querySelector("[data-acc-trigger]");
        const panel = item.querySelector("[data-acc-panel]");
        if (!trigger || !panel) return;
        trigger.addEventListener("click", async () => {
          if (getCachedProductScopedOptionDetails(groupId)) return;
          const details = await ensureOptionGroupDetails(groupId, { productId: product?.id || null });
          if (details) setCachedProductScopedOptionDetails(groupId, details);
          const inner = panel.querySelector(".acc-panel-inner");
          if (inner) {
            inner.innerHTML = `
              ${renderProductScopedOptionItemsSummary(details?.items || [], { removable: Boolean(isEdit && product && product.id), groupId })}
            `;
          }
          refreshOpenAccordions();
        });
      });

      refreshOpenAccordions();
    }

    function formatFileSize(bytes) {
      if (!bytes || bytes <= 0) return "";
      if (bytes < 1024) return bytes + " B";
      const kb = bytes / 1024;
      if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + " KB";
      return (kb / 1024).toFixed(1) + " MB";
    }

    const photoSizeCache = {};
    async function fetchPhotoSize(url) {
      if (photoSizeCache[url] !== undefined) return photoSizeCache[url];
      try {
        // HEAD может не вернуть content-length из кэша — fallback на blob
        let size = 0;
        const headRes = await fetch(url, { method: "HEAD" });
        const cl = headRes.headers.get("content-length");
        if (cl && Number(cl) > 0) {
          size = Number(cl);
        } else {
          const blobRes = await fetch(url);
          const blob = await blobRes.blob();
          size = blob.size;
        }
        photoSizeCache[url] = size;
        return size;
      } catch {
        photoSizeCache[url] = 0;
        return 0;
      }
    }

    function renderPhotos() {
      const total = draft.photos.length;
      if (ui.counter) ui.counter.textContent = `${total}/10`;

      // Нормализуем activePhotoIdx
      if (draft.activePhotoIdx < 0 || draft.activePhotoIdx >= total) {
        draft.activePhotoIdx = total > 0 ? 0 : -1;
      }

      // Рендерим миниатюры с drag handles
      ui.thumbs.innerHTML = draft.photos.map((ph, idx) => {
        const src = ph.kind === "url" ? ph.url : ph.preview;
        const dragAttr = isView ? "" : 'draggable="true"';
        const removeHtml = isView ? "" : `<span class="img-del" data-del="${idx}" title="Удалить"><i class="fas fa-times"></i></span>`;
        const dragHtml = isView ? "" : `<span class="img-drag-handle" title="Перетащите для изменения порядка"><i class="fas fa-grip-vertical"></i></span>`;
        return `
          <div class="img-thumb-wrapper" ${dragAttr} data-idx="${idx}">
            <button type="button" class="img-thumb ${idx === draft.activePhotoIdx ? "is-active" : ""}" data-idx="${idx}">
              <img src="${escapeHtml(src)}" alt="" />
              ${removeHtml}
              ${dragHtml}
            </button>
          </div>
        `;
      }).join("");

      function showFileSize(text) {
        if (!ui.photoSizeBadge) return;
        ui.photoSizeBadge.textContent = text;
        ui.photoSizeBadge.style.display = total ? "" : "none";
      }

      // Главное фото
      if (!total) {
        ui.photoMain.src = "";
        ui.photoMain.classList.add("hidden");
        ui.photoPlaceholder.classList.remove("hidden");
        if (ui.photoPrev) ui.photoPrev.classList.add("hidden");
        if (ui.photoNext) ui.photoNext.classList.add("hidden");
        if (ui.photoDots) ui.photoDots.classList.add("hidden");
        showFileSize("");
      } else {
        const active = draft.photos[draft.activePhotoIdx] || draft.photos[0];
        const src = active.kind === "url" ? active.url : active.preview;
        ui.photoPlaceholder.classList.add("hidden");
        ui.photoMain.classList.remove("hidden");
        ui.photoMain.src = src;

        // Размер файла
        if (active.fileSize) {
          showFileSize(formatFileSize(active.fileSize));
        } else if (active.kind === "url" && active.url) {
          showFileSize("...");
          fetchPhotoSize(active.url).then((size) => {
            if (size && draft.photos[draft.activePhotoIdx] === active) {
              active.fileSize = size;
              showFileSize(formatFileSize(size));
            }
          });
        } else if (active.kind === "file" && active.file) {
          showFileSize(formatFileSize(active.file.size || 0));
        } else {
          showFileSize("...");
        }

        // Показываем стрелки если фото больше 1
        const showNav = total > 1;
        if (ui.photoPrev) ui.photoPrev.classList.toggle("hidden", !showNav);
        if (ui.photoNext) ui.photoNext.classList.toggle("hidden", !showNav);
        if (ui.photoDots) ui.photoDots.classList.toggle("hidden", !showNav);
      }

      // Точки-индикаторы
      if (ui.photoDots && total > 1) {
        ui.photoDots.innerHTML = draft.photos.map((_, idx) => 
          `<span class="photo-dot ${idx === draft.activePhotoIdx ? "is-active" : ""}" data-dot-idx="${idx}"></span>`
        ).join("");
      }

      // Обработчики миниатюр
      ui.thumbs.onclick = (e) => {
        const del = e.target.closest("[data-del]");
        if (del) {
          e.stopPropagation();
          const idx = Number(del.dataset.del);
          if (!Number.isFinite(idx)) return;
          const removed = draft.photos.splice(idx, 1);
          if (removed[0] && removed[0].kind === "file") {
            try { URL.revokeObjectURL(removed[0].preview); } catch {}
          }
          draft.activePhotoIdx = Math.max(0, Math.min(draft.activePhotoIdx, draft.photos.length - 1));
          renderPhotos();
          return;
        }

        const btn = e.target.closest(".img-thumb[data-idx]");
        if (!btn) return;
        const idx = Number(btn.dataset.idx);
        if (!Number.isFinite(idx)) return;
        draft.activePhotoIdx = idx;
        renderPhotos();
      };

      // Обработчики точек
      if (ui.photoDots) {
        ui.photoDots.onclick = (e) => {
          const dot = e.target.closest(".photo-dot[data-dot-idx]");
          if (!dot) return;
          const idx = Number(dot.dataset.dotIdx);
          if (Number.isFinite(idx) && idx >= 0 && idx < total) {
            draft.activePhotoIdx = idx;
            renderPhotos();
          }
        };
      }

      // Листание миниатюр стрелками
      if (ui.thumbsPrev && ui.thumbs) {
        ui.thumbsPrev.addEventListener("click", () => {
          ui.thumbs.scrollBy({ left: -80, behavior: "smooth" });
        });
      }

      if (ui.thumbsNext && ui.thumbs) {
        ui.thumbsNext.addEventListener("click", () => {
          ui.thumbs.scrollBy({ left: 80, behavior: "smooth" });
        });
      }

      // Прокручиваем к активной миниатюре при изменении
      if (ui.thumbs && total > 0) {
        const activeThumb = ui.thumbs.querySelector(`[data-idx="${draft.activePhotoIdx}"]`);
        if (activeThumb) {
          const containerRect = ui.thumbs.getBoundingClientRect();
          const thumbRect = activeThumb.getBoundingClientRect();
          
          if (thumbRect.left < containerRect.left) {
            ui.thumbs.scrollLeft -= (containerRect.left - thumbRect.left + 10);
          } else if (thumbRect.right > containerRect.right) {
            ui.thumbs.scrollLeft += (thumbRect.right - containerRect.right + 10);
          }
        }
      }

      // Инициализация drag & drop для изменения порядка
      if (!isView) initPhotoDragAndDrop();
    }

    function initPhotoDragAndDrop() {
      if (!ui.thumbs) return;
      
      const wrappers = ui.thumbs.querySelectorAll(".img-thumb-wrapper");
      wrappers.forEach((wrapper) => {
        wrapper.addEventListener("dragstart", (e) => {
          const idx = Number(wrapper.dataset.idx);
          if (Number.isFinite(idx)) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
            wrapper.classList.add("is-dragging");
          }
        });

        wrapper.addEventListener("dragend", () => {
          wrapper.classList.remove("is-dragging");
          wrappers.forEach((w) => w.classList.remove("drag-over"));
        });

        wrapper.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          const idx = Number(wrapper.dataset.idx);
          const dragIdx = Number(e.dataTransfer.getData("text/plain"));
          if (Number.isFinite(idx) && Number.isFinite(dragIdx) && idx !== dragIdx) {
            wrapper.classList.add("drag-over");
          }
        });

        wrapper.addEventListener("dragleave", () => {
          wrapper.classList.remove("drag-over");
        });

        wrapper.addEventListener("drop", (e) => {
          e.preventDefault();
          wrapper.classList.remove("drag-over");
          
          const dragIdx = Number(e.dataTransfer.getData("text/plain"));
          const dropIdx = Number(wrapper.dataset.idx);
          
          if (!Number.isFinite(dragIdx) || !Number.isFinite(dropIdx) || dragIdx === dropIdx) return;
          
          // Перемещаем фото
          const [moved] = draft.photos.splice(dragIdx, 1);
          draft.photos.splice(dropIdx, 0, moved);
          
          // Обновляем activePhotoIdx
          if (draft.activePhotoIdx === dragIdx) {
            draft.activePhotoIdx = dropIdx;
          } else if (draft.activePhotoIdx === dropIdx) {
            draft.activePhotoIdx = dragIdx;
          } else if (dragIdx < draft.activePhotoIdx && dropIdx >= draft.activePhotoIdx) {
            draft.activePhotoIdx--;
          } else if (dragIdx > draft.activePhotoIdx && dropIdx <= draft.activePhotoIdx) {
            draft.activePhotoIdx++;
          }
          
          renderPhotos();
        });
      });
    }

    function navigatePhoto(direction) {
      const total = draft.photos.length;
      if (total <= 1) return;
      
      if (direction === "prev") {
        draft.activePhotoIdx = (draft.activePhotoIdx - 1 + total) % total;
      } else if (direction === "next") {
        draft.activePhotoIdx = (draft.activePhotoIdx + 1) % total;
      }
      renderPhotos();
    }

    function isLikelyImageFile(file) {
      if (!file) return false;
      const mime = String(file.type || "").toLowerCase();
      if (mime.startsWith("image/")) return true;
      const name = String(file.name || "").toLowerCase();
      return /\.(jpe?g|png|webp|gif|bmp|svg|heic|heif|avif)$/i.test(name);
    }

    function pickImageFiles(input) {
      return Array.from(input || []).filter((f) => isLikelyImageFile(f));
    }

    function addFiles(files) {
      const existingCount = draft.photos.length;
      const canAdd = Math.max(0, 10 - existingCount);
      const take = pickImageFiles(files).slice(0, canAdd);

      for (const f of take) {
        const preview = URL.createObjectURL(f);
        draft.photos.push({ kind: "file", file: f, preview, fileSize: f.size });
      }
      // Устанавливаем активное фото на первое, если его не было
      if (draft.photos.length && draft.activePhotoIdx < 0) {
        draft.activePhotoIdx = 0;
      }
      renderPhotos();
    }

    let photoUploadSeq = 0;
    async function addFilesAndUploadNow(files) {
      const existingCount = draft.photos.length;
      const canAdd = Math.max(0, 10 - existingCount);
      const selected = pickImageFiles(files).slice(0, canAdd);
      if (!selected.length) return;

      const placeholders = selected.map((f) => {
        const preview = URL.createObjectURL(f);
        return {
          kind: "file",
          file: f,
          preview,
          fileSize: f.size,
          __uploading: true,
          __uploadKey: `up_${Date.now()}_${photoUploadSeq++}`
        };
      });
      placeholders.forEach((ph) => draft.photos.push(ph));
      if (draft.photos.length && draft.activePhotoIdx < 0) draft.activePhotoIdx = 0;
      renderPhotos();

      try {
        const uploadResult = await apiUploadImages(selected);
        const urls = Array.isArray(uploadResult?.urls) ? uploadResult.urls : [];
        const sizes = Array.isArray(uploadResult?.sizes) ? uploadResult.sizes : [];

        placeholders.forEach((ph, idx) => {
          const at = draft.photos.findIndex((x) => x && x.__uploadKey === ph.__uploadKey);
          if (at < 0) return;
          const url = urls[idx];
          if (!url) {
            draft.photos.splice(at, 1);
            try { URL.revokeObjectURL(ph.preview); } catch {}
            return;
          }
          draft.photos[at] = {
            kind: "url",
            url,
            fileSize: Number(sizes[idx]) > 0 ? Number(sizes[idx]) : (ph.fileSize || 0)
          };
          try { URL.revokeObjectURL(ph.preview); } catch {}
        });

        if (!draft.photos.length) {
          draft.activePhotoIdx = -1;
        } else if (draft.activePhotoIdx < 0 || draft.activePhotoIdx >= draft.photos.length) {
          draft.activePhotoIdx = 0;
        }
        renderPhotos();
      } catch (err) {
        placeholders.forEach((ph) => {
          const at = draft.photos.findIndex((x) => x && x.__uploadKey === ph.__uploadKey);
          if (at >= 0) draft.photos.splice(at, 1);
          try { URL.revokeObjectURL(ph.preview); } catch {}
        });
        if (!draft.photos.length) draft.activePhotoIdx = -1;
        renderPhotos();
        alert('Ошибка загрузки фотографий');
      }
    }

    let productPhotoModalEscHandler = null;
    function closeProductPhotoModal() {
      const open = document.querySelectorAll(".product-photo-grid-modal-overlay[data-product-photo-modal='1']");
      open.forEach((el) => el.remove());
      if (productPhotoModalEscHandler) {
        document.removeEventListener("keydown", productPhotoModalEscHandler);
        productPhotoModalEscHandler = null;
      }
    }

    function openProductPhotoGridModal() {
      closeProductPhotoModal();
      const overlay = document.createElement("div");
      overlay.className = "product-photo-grid-modal-overlay";
      overlay.setAttribute("data-product-photo-modal", "1");
      const card = document.createElement("div");
      card.className = "product-photo-grid-modal-card";
      card.innerHTML = `
        <div class="product-photo-grid-modal-head">
          <div class="product-photo-grid-modal-title">\u0424\u043e\u0442\u043e\u0433\u0440\u0430\u0444\u0438\u0438 \u0442\u043e\u0432\u0430\u0440\u0430</div>
          <button type="button" class="product-photo-grid-modal-close" aria-label="\u0417\u0430\u043a\u0440\u044b\u0442\u044c"><i class="fas fa-times"></i></button>
        </div>
        <div class="product-photo-grid-modal-body">
          <div class="product-photo-grid-modal-grid"></div>
        </div>
        <div class="product-photo-grid-modal-foot">
          <button type="button" class="btn" data-role="close">\u0417\u0430\u043a\u0440\u044b\u0442\u044c</button>
        </div>
      `;
      const grid = card.querySelector(".product-photo-grid-modal-grid");
      const modalBody = card.querySelector(".product-photo-grid-modal-body");
      if (modalBody) {
        const dropHint = document.createElement("div");
        dropHint.className = "product-photo-grid-modal-drop-hint";
        dropHint.textContent = "\u041f\u0435\u0440\u0435\u0442\u0430\u0449\u0438\u0442\u0435 \u0444\u043e\u0442\u043e \u0441\u044e\u0434\u0430 \u0438\u043b\u0438 \u043e\u0442\u043f\u0443\u0441\u0442\u0438\u0442\u0435 \u0434\u043b\u044f \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438";
        modalBody.appendChild(dropHint);
      }
      const renderGrid = () => {
        if (!grid) return;
        draft.photos.forEach((ph) => {
          if (!ph || ph.kind !== "url" || !ph.url || Number(ph.fileSize) > 0) return;
          fetchPhotoSize(ph.url).then((size) => {
            if (!size || Number(ph.fileSize) === Number(size)) return;
            ph.fileSize = Number(size);
            if (document.body.contains(card)) renderGrid();
          });
        });
        const photosHtml = draft.photos.map((ph, idx) => {
          const src = ph && ph.kind === "file" ? ph.preview : ph?.url;
          if (!src) return `<div class="product-photo-grid-modal-tile is-empty"></div>`;
          const localSize = ph && ph.kind === "file" && ph.file && Number(ph.file.size) > 0 ? Number(ph.file.size) : 0;
          const resolvedSize = Number(ph?.fileSize) > 0 ? Number(ph.fileSize) : localSize;
          const sizeLabel = resolvedSize > 0 ? formatFileSize(resolvedSize) : "";
          const removeBtn = isView
            ? ""
            : `<button type="button" class="product-photo-grid-modal-remove" data-role="remove-photo" data-photo-idx="${idx}" aria-label="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0444\u043e\u0442\u043e"><i class="fas fa-times"></i></button>`;
          const dragAttr = isView ? "" : ` draggable="true"`;
          return `
            <div class="product-photo-grid-modal-item" data-photo-idx="${idx}"${dragAttr}>
              <div class="product-photo-grid-modal-tile">
                <img src="${escapeHtml(String(src))}" alt="">
                ${removeBtn}
              </div>
              <div class="product-photo-grid-modal-size">${escapeHtml(sizeLabel)}</div>
            </div>
          `;
        }).join("");
        const addTileHtml = isView
          ? ""
          : `<button type="button" class="product-photo-grid-modal-tile product-photo-grid-modal-tile--add" data-role="add-photo" aria-label="\u0414\u043e\u0431\u0430\u0432\u0438\u0442\u044c \u0444\u043e\u0442\u043e"><i class="fas fa-plus"></i></button>`;
        grid.innerHTML = photosHtml + addTileHtml;
      };
      const extractModalDropFiles = async (dt) => {
        try {
          if (!dt) return [];
          const dtFiles = Array.from(dt.files || []);
          if (dtFiles.length) return dtFiles;
          if (typeof extractImagesFromDataTransfer === "function") {
            return await extractImagesFromDataTransfer(dt);
          }
          return [];
        } catch {
          return [];
        }
      };
      let clearFileDragState = () => {};

      const onClose = () => closeProductPhotoModal();
      overlay.appendChild(card);
      document.body.appendChild(overlay);
      renderGrid();
      card.querySelector(".product-photo-grid-modal-close")?.addEventListener("click", onClose);
      card.querySelector('[data-role="close"]')?.addEventListener("click", onClose);
      overlay.addEventListener("click", (e) => { if (e.target === overlay) onClose(); });
      if (!isView) {
        let externalDragDepth = 0;
        const hasExternalFilePayload = (dt) => {
          if (!dt) return false;
          const types = Array.from(dt.types || []).map((t) => String(t));
          if (dt.files && dt.files.length > 0) return true;
          return (
            types.includes("Files") ||
            types.includes("application/x-moz-file") ||
            types.includes("public.file-url")
          );
        };
        const setFileDragState = (active) => {
          card.classList.toggle("is-file-drag-over", !!active);
        };
        clearFileDragState = () => {
          externalDragDepth = 0;
          setFileDragState(false);
        };
        const onFileDragEnter = (e) => {
          if (!hasExternalFilePayload(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          externalDragDepth += 1;
          setFileDragState(true);
        };
        const onFileDragOver = (e) => {
          if (!hasExternalFilePayload(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          setFileDragState(true);
        };
        const onFileDragLeave = (e) => {
          if (!hasExternalFilePayload(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          externalDragDepth = Math.max(0, externalDragDepth - 1);
          if (!externalDragDepth) setFileDragState(false);
        };
        const onFileDrop = async (e) => {
          if (!hasExternalFilePayload(e.dataTransfer)) return;
          e.preventDefault();
          e.stopPropagation();
          clearFileDragState();
          try {
            const files = await extractModalDropFiles(e.dataTransfer);
            if (!files.length) return;
            await addFilesAndUploadNow(files);
            renderGrid();
          } catch {}
        };
        overlay.addEventListener("dragenter", onFileDragEnter, true);
        card.addEventListener("dragenter", onFileDragEnter, true);
        overlay.addEventListener("dragover", onFileDragOver);
        card.addEventListener("dragover", onFileDragOver);
        overlay.addEventListener("dragleave", onFileDragLeave, true);
        card.addEventListener("dragleave", onFileDragLeave, true);
        overlay.addEventListener("drop", onFileDrop);
        card.addEventListener("drop", onFileDrop);
      }
      if (!isView && grid) {
        let dragPhotoIdx = -1;
        grid.addEventListener("dragstart", (e) => {
          const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
          if (!item) return;
          const idx = Number(item.getAttribute("data-photo-idx"));
          if (!Number.isFinite(idx) || idx < 0) return;
          dragPhotoIdx = idx;
          item.classList.add("is-dragging");
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", String(idx));
          }
        });
        grid.addEventListener("dragover", (e) => {
          if (dragPhotoIdx < 0) {
            const hasExternalPayload =
              (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) ||
              (e.dataTransfer && e.dataTransfer.types && (
                Array.from(e.dataTransfer.types).includes("Files") ||
                Array.from(e.dataTransfer.types).includes("text/uri-list") ||
                Array.from(e.dataTransfer.types).includes("text/html") ||
                Array.from(e.dataTransfer.types).includes("text/plain")
              ));
            if (hasExternalPayload) {
              e.preventDefault();
            }
            return;
          }
          const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
          if (!item) return;
          const idx = Number(item.getAttribute("data-photo-idx"));
          if (!Number.isFinite(idx) || idx < 0 || idx === dragPhotoIdx) return;
          e.preventDefault();
          item.classList.add("is-drop-target");
        });
        grid.addEventListener("dragleave", (e) => {
          const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
          if (!item) return;
          item.classList.remove("is-drop-target");
        });
        grid.addEventListener("drop", async (e) => {
          if (dragPhotoIdx < 0) {
            e.preventDefault();
            e.stopPropagation();
            clearFileDragState();
            try {
              const files = await extractModalDropFiles(e.dataTransfer);
              if (!files.length) return;
              await addFilesAndUploadNow(files);
              renderGrid();
            } catch {}
            return;
          }
          const item = e.target.closest?.(".product-photo-grid-modal-item[data-photo-idx]");
          if (!item) return;
          const dropIdx = Number(item.getAttribute("data-photo-idx"));
          item.classList.remove("is-drop-target");
          if (!Number.isFinite(dragPhotoIdx) || dragPhotoIdx < 0 || !Number.isFinite(dropIdx) || dropIdx < 0 || dropIdx === dragPhotoIdx) return;
          e.preventDefault();
          const [moved] = draft.photos.splice(dragPhotoIdx, 1);
          draft.photos.splice(dropIdx, 0, moved);
          if (draft.activePhotoIdx === dragPhotoIdx) {
            draft.activePhotoIdx = dropIdx;
          } else if (draft.activePhotoIdx === dropIdx) {
            draft.activePhotoIdx = dragPhotoIdx;
          } else if (dragPhotoIdx < draft.activePhotoIdx && dropIdx >= draft.activePhotoIdx) {
            draft.activePhotoIdx--;
          } else if (dragPhotoIdx > draft.activePhotoIdx && dropIdx <= draft.activePhotoIdx) {
            draft.activePhotoIdx++;
          }
          dragPhotoIdx = -1;
          renderPhotos();
          renderGrid();
        });
        grid.addEventListener("dragend", () => {
          dragPhotoIdx = -1;
          clearFileDragState();
          grid.querySelectorAll(".product-photo-grid-modal-item.is-dragging").forEach((el) => el.classList.remove("is-dragging"));
          grid.querySelectorAll(".product-photo-grid-modal-item.is-drop-target").forEach((el) => el.classList.remove("is-drop-target"));
        });
      }
      card.addEventListener("click", (e) => {
        if (isView) return;
        const removeBtn = e.target.closest?.('[data-role="remove-photo"]');
        if (removeBtn) {
          const idx = Number(removeBtn.getAttribute("data-photo-idx"));
          if (Number.isFinite(idx) && idx >= 0 && idx < draft.photos.length) {
            const removed = draft.photos.splice(idx, 1);
            if (removed[0] && removed[0].kind === "file") {
              try { URL.revokeObjectURL(removed[0].preview); } catch {}
            }
            draft.activePhotoIdx = draft.photos.length ? 0 : -1;
            renderPhotos();
            renderGrid();
          }
          return;
        }
        if (e.target.closest?.('[data-role="add-photo"]') && ui.photosInput) {
          ui.photosInput.click();
        }
      });
      productPhotoModalEscHandler = (e) => { if (e.key === "Escape") onClose(); };
      document.addEventListener("keydown", productPhotoModalEscHandler);
    }

    // Загрузка фото через кнопку
    if (!isView) {
      const isEditorActive = () => {
        if (!document.body.contains(wrapper)) return false;
        if (wrapper.getClientRects().length === 0) return false;
        return true;
      };
      const parseImageUrlsFromText = (text) => {
        if (!text || typeof text !== "string") return [];
        const result = [];
        const seen = new Set();
        const push = (value) => {
          if (!value) return;
          const raw = String(value).trim();
          if (!raw || seen.has(raw)) return;
          const low = raw.toLowerCase();
          const isDataImage = low.startsWith("data:image/");
          const isHttp = low.startsWith("http://") || low.startsWith("https://");
          if (!(isDataImage || isHttp)) return;
          seen.add(raw);
          result.push(raw);
        };
        text.split(/\r?\n/).forEach(push);
        const imgSrcRe = /<img[^>]+src=["']([^"']+)["']/gi;
        let m;
        while ((m = imgSrcRe.exec(text)) !== null) push(m[1]);
        return result;
      };
      const fetchImageAsFile = async (url, idx = 0) => {
        try {
          const res = await fetch(url, { credentials: "omit", mode: "cors" });
          if (!res.ok) return null;
          const blob = await res.blob();
          if (!isLikelyImageFile({ type: blob.type || "" })) return null;
          const lowType = String(blob.type || "").toLowerCase();
          const ext = lowType.includes("png")
            ? "png"
            : lowType.includes("webp")
              ? "webp"
              : lowType.includes("gif")
                ? "gif"
                : "jpg";
          return new File([blob], `drop-${Date.now()}-${idx}.${ext}`, { type: blob.type || "image/jpeg" });
        } catch {
          return null;
        }
      };
      const fileFromItemEntry = (item) => new Promise((resolve) => {
        try {
          if (!item || typeof item.webkitGetAsEntry !== "function") return resolve(null);
          const entry = item.webkitGetAsEntry();
          if (!entry || !entry.isFile || typeof entry.file !== "function") return resolve(null);
          entry.file(
            (file) => resolve(file || null),
            () => resolve(null)
          );
        } catch {
          resolve(null);
        }
      });
      const extractImagesFromDataTransfer = async (dt) => {
        try {
          if (!dt) return [];
          const anyFiles = Array.from(dt.files || []);
          if (anyFiles.length) {
            return anyFiles;
          }
          const direct = pickImageFiles(dt.files || []);
          if (direct.length) return direct;
          const rawFiles = Array.from(dt.files || []).filter((f) => f && Number(f.size) > 0);
          if (rawFiles.length) return rawFiles;
          const items = Array.from(dt.items || []);
          const itemFiles = items.map((it) => it && it.getAsFile && it.getAsFile()).filter((f) => isLikelyImageFile(f));
          if (itemFiles.length) return itemFiles;
          const entryFiles = (await Promise.all(items.map((it) => fileFromItemEntry(it)))).filter((f) => isLikelyImageFile(f));
          if (entryFiles.length) return entryFiles;
          const payload = [];
          const uriList = dt.getData && dt.getData("text/uri-list");
          const plain = dt.getData && dt.getData("text/plain");
          const html = dt.getData && dt.getData("text/html");
          if (uriList) payload.push(uriList);
          if (plain) payload.push(plain);
          if (html) payload.push(html);
          const urls = parseImageUrlsFromText(payload.join("\n"));
          if (!urls.length) return [];
          const fetched = await Promise.all(urls.slice(0, 6).map((u, idx) => fetchImageAsFile(u, idx)));
          return fetched.filter((f) => isLikelyImageFile(f));
        } catch {
          return [];
        }
      };
      const extractImagesFromClipboard = (cb) => {
        try {
          if (!cb) return [];
          const direct = pickImageFiles(cb.files || []);
          if (direct.length) return direct;
          const items = Array.from(cb.items || []);
          return items.map((it) => it && it.getAsFile && it.getAsFile()).filter((f) => isLikelyImageFile(f));
        } catch {
          return [];
        }
      };

      if (ui.addPhotosBtn) ui.addPhotosBtn.addEventListener("click", () => ui.photosInput.click());
      if (ui.photosInput) {
        ui.photosInput.addEventListener("change", async () => {
          if (ui.photosInput.files && ui.photosInput.files.length) {
            try {
              await addFilesAndUploadNow(ui.photosInput.files);
            } catch {}
          }
          ui.photosInput.value = "";
          if (document.querySelector(".product-photo-grid-modal-overlay[data-product-photo-modal='1']")) {
            openProductPhotoGridModal();
          }
        });
      }

      // Drag & Drop загрузка на область главного фото
      if (ui.photoMainContainer) {
        ui.photoMainContainer.addEventListener("dragover", (e) => {
          e.preventDefault();
          e.stopPropagation();
          ui.photoMainContainer.classList.add("drag-over");
        });

        ui.photoMainContainer.addEventListener("dragleave", () => {
          ui.photoMainContainer.classList.remove("drag-over");
        });

        ui.photoMainContainer.addEventListener("drop", async (e) => {
          e.preventDefault();
          e.stopPropagation();
          ui.photoMainContainer.classList.remove("drag-over");
          
          const files = await extractImagesFromDataTransfer(e.dataTransfer);
          if (files.length) {
            void addFilesAndUploadNow(files).catch(() => {});
          }
        });
      }

      const docDragOver = (e) => {
        if (!isEditorActive()) return;
        e.preventDefault();
      };
      const docDrop = async (e) => {
        if (!isEditorActive()) return;
        if (e.defaultPrevented) return;
        e.preventDefault();
        try {
          const files = await extractImagesFromDataTransfer(e.dataTransfer);
          if (!files.length) return;
          void addFilesAndUploadNow(files).then(() => {
            if (document.querySelector(".product-photo-grid-modal-overlay[data-product-photo-modal='1']")) {
              openProductPhotoGridModal();
            }
          }).catch(() => {});
        } catch {}
      };
      globalPhotoDropHandlers = { docDragOver, docDrop };
      document.addEventListener("dragover", docDragOver);
      document.addEventListener("drop", docDrop);

      globalPhotoPasteHandler = (e) => {
        if (!isEditorActive()) return;
        const files = extractImagesFromClipboard(e.clipboardData);
        if (!files.length) return;
        e.preventDefault();
        void addFilesAndUploadNow(files).then(() => {
          if (document.querySelector(".product-photo-grid-modal-overlay[data-product-photo-modal='1']")) {
            openProductPhotoGridModal();
          }
        }).catch(() => {});
      };
      document.addEventListener("paste", globalPhotoPasteHandler);
    }

    // Навигация стрелками
    if (ui.photoPrev) {
      ui.photoPrev.addEventListener("click", () => navigatePhoto("prev"));
    }
    if (ui.photoNext) {
      ui.photoNext.addEventListener("click", () => navigatePhoto("next"));
    }
    if (ui.photoMainContainer) {
      ui.photoMainContainer.addEventListener("click", (e) => {
        if (e.target.closest("#pePhotoPrev, #pePhotoNext, .photo-dot")) return;
        openProductPhotoGridModal();
      });
    }

    // Навигация клавиатурой
    const handleKeydown = (e) => {
      // Проверяем, что модалка открыта и мы не в поле ввода
      const modal = document.getElementById("appModal");
      if (!modal || !modal.classList.contains("is-open")) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
      
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigatePhoto("prev");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigatePhoto("next");
      }
    };
    
    if (!isView) {
      keyboardHandler = handleKeydown;
      document.addEventListener("keydown", keyboardHandler);
    }

    // Category picker uses overlay now, old handlers removed
    if (!isView) {
      if (ui.optionClose) ui.optionClose.addEventListener("click", closeOptionPicker);
      if (ui.optionCancel) ui.optionCancel.addEventListener("click", closeOptionPicker);
      if (ui.optionBackdrop) ui.optionBackdrop.addEventListener("click", closeOptionPicker);
      if (ui.optionSearch) {
        ui.optionSearch.addEventListener("input", () => {
          renderOptionPickerList(optionPickerSelection || new Set(draft.optionGroups));
        });
      }
    }

    // ========== INGREDIENTS ==========
    let unitsList = [];
    let ingredientsList = [];
    // draftIngredients already defined above

    let pcsUnitId = null;
    let productUnitLinks = [];
    const ingredientUnitLinksCache = new Map();

    function getUnitLabel(unitId) {
      const unit = unitsList.find(u => Number(u.id) === Number(unitId));
      return unit?.short_title || unit?.code || unit?.title || "";
    }

    async function loadIngredientUnitLinks(ingredientId) {
      const id = Number(ingredientId || 0);
      if (!Number.isFinite(id) || id <= 0) return [];
      if (ingredientUnitLinksCache.has(id)) return ingredientUnitLinksCache.get(id);
      try {
        const res = await apiGetProductUnitLinks(id);
        const links = Array.isArray(res?.data) ? res.data : [];
        ingredientUnitLinksCache.set(id, links);
        return links;
      } catch {
        ingredientUnitLinksCache.set(id, []);
        return [];
      }
    }

    function updatePcsLinkVisibility() {
      if (!ui.pcsLinkWrap || !ui.baseUnitSelect) return;
      const baseUnitId = Number(ui.baseUnitSelect.value || 0);
      const isPcsBase = pcsUnitId && baseUnitId === pcsUnitId;
      if (!baseUnitId || isPcsBase) {
        ui.pcsLinkWrap.classList.add("hidden");
        if (ui.pcsBaseLabel) ui.pcsBaseLabel.textContent = "—";
        if (ui.pcsFactorInput) ui.pcsFactorInput.value = "";
        return;
      }
      ui.pcsLinkWrap.classList.remove("hidden");
      if (ui.pcsBaseLabel) ui.pcsBaseLabel.textContent = getUnitLabel(baseUnitId);
      if (ui.pcsFactorInput) {
        const link = productUnitLinks.find((l) => Number(l.unit_id) === Number(pcsUnitId) && Number(l.base_unit_id) === baseUnitId);
        ui.pcsFactorInput.value = link?.factor != null ? String(link.factor) : "";
      }
    }

    // Конвертер для штучных товаров: 1 штука = X [ед.] — показывается только при Ед. изм = Штука
    function updatePcsToUnitVisibility() {
      if (!ui.pcsToUnitWrap || !ui.pcsToUnitFactorInput || !ui.pcsToUnitSelect || !ui.baseUnitSelect) return;
      const baseUnitId = Number(ui.baseUnitSelect.value || 0);
      const isPcsBase = pcsUnitId && baseUnitId === pcsUnitId;
      if (!isPcsBase) {
        ui.pcsToUnitWrap.classList.add("hidden");
        return;
      }
      ui.pcsToUnitWrap.classList.remove("hidden");
      // Заполняем список единиц (все кроме штуки)
      const otherUnits = unitsList.filter((u) => Number(u.id) !== Number(pcsUnitId));
      ui.pcsToUnitSelect.innerHTML = '<option value="">—</option>' + otherUnits.map((u) =>
        `<option value="${u.id}">${escapeHtml(u.title || u.short_title || u.code)}</option>`
      ).join("");
      // Загружаем сохранённую связь: unit_id=pcs, base_unit_id=любая другая единица
      const link = productUnitLinks.find((l) => Number(l.unit_id) === Number(pcsUnitId) && Number(l.base_unit_id) !== Number(pcsUnitId));
      if (link) {
        ui.pcsToUnitFactorInput.value = link.factor != null ? formatNumberForInput(link.factor) : "";
        ui.pcsToUnitSelect.value = String(link.base_unit_id);
      } else {
        ui.pcsToUnitFactorInput.value = "";
        ui.pcsToUnitSelect.value = "";
      }
    }

    async function loadProductUnitLinks() {
      if ((!isEdit && !isView) || !product || !product.id) return;
      try {
        const res = await apiGetProductUnitLinks(product.id);
        productUnitLinks = Array.isArray(res.data) ? res.data : [];
        updatePcsLinkVisibility();
        updatePcsToUnitVisibility();
      } catch (e) {
        console.error("Failed to load product unit links", e);
      }
    }

    async function savePcsToUnitLink(productId) {
      if (!productId || !pcsUnitId) return;
      const factorValue = ui.pcsToUnitFactorInput?.value;
      const factor = parseNumberFromInput(factorValue);
      const baseUnitId = Number(ui.pcsToUnitSelect?.value || 0);
      if (!baseUnitId || baseUnitId === pcsUnitId || !factor || !Number.isFinite(factor)) {
        try {
          await apiDeleteProductUnitLink(productId, pcsUnitId);
        } catch {}
        return;
      }
      await apiUpsertProductUnitLink(productId, {
        unit_id: pcsUnitId,
        base_unit_id: baseUnitId,
        factor,
      });
    }

    async function savePcsLink(productId, baseUnitId) {
      if (!productId || !pcsUnitId) return;
      const factorValue = ui.pcsFactorInput?.value;
      const factor = factorValue === "" || factorValue == null ? null : Number(factorValue);
      if (!baseUnitId || baseUnitId === pcsUnitId) {
        try {
          await apiDeleteProductUnitLink(productId, pcsUnitId);
        } catch {}
        return;
      }
      if (!factor || !Number.isFinite(factor)) {
        try {
          await apiDeleteProductUnitLink(productId, pcsUnitId);
        } catch {}
        return;
      }
      await apiUpsertProductUnitLink(productId, {
        unit_id: pcsUnitId,
        base_unit_id: baseUnitId,
        factor,
      });
    }

    function getIngredientUnitLinkFactor(ing, fromUnitId, toUnitId) {
      const from = Number(fromUnitId || 0);
      const to = Number(toUnitId || 0);
      if (!from || !to) return null;
      if (from === to) return 1;
      const links = Array.isArray(ing?.ingredient_unit_links) ? ing.ingredient_unit_links : [];
      const direct = links.find((link) => Number(link.unit_id) === from && Number(link.base_unit_id) === to);
      if (direct && Number(direct.factor)) return Number(direct.factor);
      const inverse = links.find((link) => Number(link.unit_id) === to && Number(link.base_unit_id) === from);
      if (inverse && Number(inverse.factor)) return 1 / Number(inverse.factor);
      return null;
    }

    function getIngredientQuantityInBase(ing) {
      const baseUnitId = ing?.ingredient_base_unit_id || ing?.ingredient_unit_id || ing?.unit_id;
      const fromUnitId = Number(ing?.unit_id || 0);
      if (!baseUnitId || !fromUnitId) return null;
      if (Number(fromUnitId) === Number(baseUnitId)) return Number(ing.quantity || 0);
      const linkFactor = getIngredientUnitLinkFactor(ing, fromUnitId, baseUnitId);
      if (linkFactor != null) return Number(ing.quantity || 0) * linkFactor;
      if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId) && ing.ingredient_pcs_factor != null) {
        return Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
      }
      const factor = getConversionFactor(fromUnitId, baseUnitId);
      return factor != null ? Number(ing.quantity || 0) * factor : null;
    }

    function getIngredientQuantityInGrams(ing) {
      const gramUnit = unitsList.find((u) => String(u.code || "").toLowerCase() === "g");
      const gramUnitId = Number(gramUnit?.id || 0);
      const fromUnitId = Number(ing?.unit_id || 0);
      if (!gramUnitId || !fromUnitId) return null;
      if (fromUnitId === gramUnitId) return Number(ing.quantity || 0);
      const directFactor = getConversionFactor(fromUnitId, gramUnitId);
      if (directFactor != null) return Number(ing.quantity || 0) * directFactor;
      const linkFactor = getIngredientUnitLinkFactor(ing, fromUnitId, gramUnitId);
      if (linkFactor != null) return Number(ing.quantity || 0) * linkFactor;
      const qtyInBase = getIngredientQuantityInBase(ing);
      const baseUnitId = ing?.ingredient_base_unit_id || ing?.ingredient_unit_id || ing?.unit_id;
      const baseToGram = getConversionFactor(baseUnitId, gramUnitId) ?? getIngredientUnitLinkFactor(ing, baseUnitId, gramUnitId);
      return qtyInBase != null && baseToGram != null ? qtyInBase * baseToGram : null;
    }

    async function loadUnits() {
      try {
        const res = await apiGetUnits();
        unitsList = Array.isArray(res.data) ? res.data : [];
        pcsUnitId = unitsList.find(u => u.code === "pcs")?.id || null;
        if (ui.baseUnitSelect) {
          ui.baseUnitSelect.innerHTML = '<option value="">—</option>' + unitsList.map(u => 
            `<option value="${u.id}">${escapeHtml(u.title || u.short_title || u.code)}</option>`
          ).join('');
          if ((isEdit || isView) && product) {
            ui.baseUnitSelect.value = product.base_unit_id || product.unit_id || "";
          } else if (pcsUnitId) {
            ui.baseUnitSelect.value = pcsUnitId;
          }
        }
        updatePcsLinkVisibility();
        updatePcsToUnitVisibility();
      } catch (e) {
        console.error('Failed to load units', e);
      }
    }

    // Функция для расчёта общей себестоимости из ингредиентов (доступна на уровне openProductModal)
    function calcTotalCostFromIngredientsGlobal() {
      let total = 0;
      let hasValidCost = false;
      if (draftIngredients && draftIngredients.size > 0) {
        draftIngredients.forEach(ing => {
          // Получаем базовое количество и базовую единицу ингредиента
          const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
          const costBase = baseQty > 0 ? Number(ing.ingredient_cost_price || 0) / baseQty : Number(ing.ingredient_cost_price || 0);
          
          // Преобразуем quantity в базовые единицы (логика из getQtyInBase в renderIngredientAccordion)
          const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
          const fromUnitId = Number(ing.unit_id || 0);
          let qtyInBase = null;
          
          if (!baseUnitId || !fromUnitId) {
            qtyInBase = null;
          } else if (Number(fromUnitId) === Number(baseUnitId)) {
            qtyInBase = Number(ing.quantity || 0);
          } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
            // Ингредиент в штуках: для себестоимости qtyInBase = количество в шт (costBase уже за 1 шт)
            if (Number(baseUnitId) === Number(pcsUnitId)) {
              qtyInBase = Number(ing.quantity || 0);
            } else if (ing.ingredient_pcs_factor != null) {
              qtyInBase = Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
            } else {
              qtyInBase = null;
            }
          } else if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
            qtyInBase = null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? Number(ing.quantity || 0) * factor : null;
          }
          
          qtyInBase = getIngredientQuantityInBase(ing);
          if (qtyInBase != null) {
            const cost = costBase * qtyInBase;
            total += cost;
            hasValidCost = true;
          }
        });
      }
      return hasValidCost ? total : null;
    }

    // Функция для расчёта общей цены из ингредиентов (доступна на уровне openProductModal)
    function calcTotalPriceFromIngredientsGlobal() {
      let total = 0;
      let hasValidPrice = false;
      if (draftIngredients && draftIngredients.size > 0) {
        draftIngredients.forEach(ing => {
          // Получаем базовое количество и базовую единицу ингредиента
          const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
          // Используем price_override если есть, иначе ingredient_price из каталога
          const catalogBasePrice = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
          const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogBasePrice;
          
          // Преобразуем quantity в базовые единицы (логика из getQtyInBase в renderIngredientAccordion)
          const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
          const fromUnitId = Number(ing.unit_id || 0);
          let qtyInBase = null;
          
          if (!baseUnitId || !fromUnitId) {
            qtyInBase = null;
          } else if (Number(fromUnitId) === Number(baseUnitId)) {
            qtyInBase = Number(ing.quantity || 0);
          } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
            if (Number(baseUnitId) === Number(pcsUnitId)) {
              qtyInBase = Number(ing.quantity || 0);
            } else if (ing.ingredient_pcs_factor != null) {
              qtyInBase = Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
            } else {
              qtyInBase = null;
            }
          } else if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
            qtyInBase = null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? Number(ing.quantity || 0) * factor : null;
          }
          
          qtyInBase = getIngredientQuantityInBase(ing);
          if (qtyInBase != null) {
            const price = priceBase * qtyInBase;
            total += price;
            hasValidPrice = true;
          }
        });
      }
      return hasValidPrice ? total : null;
    }

    // Сумма веса состава в базовой единице товара (рецепта)
    function calcTotalWeightInBaseUnitGlobal() {
      const baseUnitId = Number(ui.baseUnitSelect?.value || 0);
      if (!baseUnitId || !draftIngredients || draftIngredients.size === 0) return null;
      let total = 0;
      let hasValid = false;
      draftIngredients.forEach(ing => {
        const fromUnitId = Number(ing.unit_id || 0);
        if (!fromUnitId) return;
        if (Number(fromUnitId) === Number(baseUnitId)) {
          total += Number(ing.quantity || 0);
          hasValid = true;
          return;
        }
        if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId) && ing.ingredient_pcs_factor != null) {
          total += Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
          hasValid = true;
          return;
        }
        const factor = getConversionFactor(fromUnitId, baseUnitId);
        if (factor != null) {
          total += Number(ing.quantity || 0) * factor;
          hasValid = true;
        }
      });
      return hasValid ? total : null;
    }

    /** Расчёт себестоимости, цены и веса по массиву ингредиентов (формат API). Для пересчёта блюд, где текущий товар в составе. */
    function calcTotalsFromComposition(recipeBaseUnitId, ingredientsArray) {
      if (!Array.isArray(ingredientsArray) || ingredientsArray.length === 0) return null;
      let cost = 0, price = 0, weight = 0;
      let hasCost = false, hasPrice = false, hasWeight = false;
      const baseUnitIdNum = Number(recipeBaseUnitId || 0);
      ingredientsArray.forEach(ing => {
        const baseUnitId = ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
        const fromUnitId = Number(ing.unit_id || 0);
        let qtyInIngBase = null;
        if (baseUnitId && fromUnitId) {
          if (Number(fromUnitId) === Number(baseUnitId)) {
            qtyInIngBase = Number(ing.quantity || 0);
          } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
            if (Number(baseUnitId) === Number(pcsUnitId)) qtyInIngBase = Number(ing.quantity || 0);
            else if (ing.ingredient_pcs_factor != null) qtyInIngBase = Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
          } else if (pcsUnitId && Number(baseUnitId) !== Number(pcsUnitId)) {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInIngBase = factor != null ? Number(ing.quantity || 0) * factor : null;
          }
        }
        if (qtyInIngBase != null) {
          const baseQty = ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1;
          const costBase = baseQty > 0 ? Number(ing.ingredient_cost_price || 0) / baseQty : Number(ing.ingredient_cost_price || 0);
          const catalogPriceBase = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
          const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogPriceBase;
          cost += costBase * qtyInIngBase;
          price += priceBase * qtyInIngBase;
          hasCost = true;
          hasPrice = true;
        }
        if (baseUnitIdNum && fromUnitId) {
          let w = null;
          if (Number(fromUnitId) === baseUnitIdNum) w = Number(ing.quantity || 0);
          else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId) && ing.ingredient_pcs_factor != null) w = Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor);
          else { const f = getConversionFactor(fromUnitId, baseUnitIdNum); if (f != null) w = Number(ing.quantity || 0) * f; }
          if (w != null) { weight += w; hasWeight = true; }
        }
      });
      return (hasCost || hasPrice || hasWeight) ? { cost: hasCost ? Math.round(cost * 100) / 100 : null, price: hasPrice ? Math.round(price * 100) / 100 : null, weight: hasWeight ? Math.round(weight * 1000) / 1000 : null } : null;
    }

    // Функция для обновления placeholder себестоимости (доступна на уровне openProductModal)
    function updateCostPricePlaceholderGlobal() {
      const costInput = ui.costPriceInput;
      const calculatedCost = calcTotalCostFromIngredientsGlobal();
      
      // Обновляем placeholder себестоимости товара
      if (costInput) {
        costInput.placeholder = calculatedCost != null ? formatMoney(calculatedCost) : "0";
        if (isCompositionPriceMode() && calculatedCost != null) {
          costInput.value = formatNumberForInput(Math.round(calculatedCost * 100) / 100);
        }
      }
      
      // Обновляем отображение суммы себестоимости состава
      const ingredientCostTotalEl = ui.ingredientCostTotal || document.getElementById("peIngredientCostTotal");
      if (ingredientCostTotalEl) {
        const displayValue = calculatedCost != null && calculatedCost > 0 ? formatMoney(calculatedCost) : "0 ₽";
        // Если это span (chip), обновляем textContent, иначе value (для input)
        if (ingredientCostTotalEl.tagName === "SPAN") {
          ingredientCostTotalEl.textContent = displayValue;
        } else {
          ingredientCostTotalEl.value = displayValue;
        }
      }
    }

    // Функция для обновления placeholder цены (доступна на уровне openProductModal)
    function updatePricePlaceholderGlobal() {
      const priceInput = ui.priceInput;
      const calculatedPrice = calcTotalPriceFromIngredientsGlobal();
      const calculatedCost = calcTotalCostFromIngredientsGlobal();
      
      // Обновляем placeholder цены товара
      if (priceInput) {
        priceInput.placeholder = calculatedPrice != null ? formatMoney(calculatedPrice) : "0";
        if (isCompositionPriceMode() && calculatedPrice != null) {
          priceInput.value = formatNumberForInputFixed(calculatedPrice, 2);
        }
      }
      const margin = calcMarginFromPrice(calculatedCost, calculatedPrice);
      if (isCompositionPriceMode() && margin != null && ui.marginPercentInput) {
        ui.marginPercentInput.value = formatNumberForInputFixed(margin, 2);
      }
      
      // Обновляем отображение суммы цены состава
      const ingredientPriceTotalEl = ui.ingredientPriceTotal || document.getElementById("peIngredientPriceTotal");
      if (ingredientPriceTotalEl) {
        const displayValue = calculatedPrice != null && calculatedPrice > 0 ? formatMoney(calculatedPrice) : "0 ₽";
        // Если это span (chip), обновляем textContent, иначе value (для input)
        if (ingredientPriceTotalEl.tagName === "SPAN") {
          ingredientPriceTotalEl.textContent = displayValue;
        } else {
          ingredientPriceTotalEl.value = displayValue;
        }
      }
    }

    // Обновление отображения суммы веса состава
    function updateWeightTotalDisplayGlobal() {
      const total = calcTotalWeightInBaseUnitGlobal();
      const el = ui.ingredientWeightTotal || document.getElementById("peIngredientWeightTotal");
      if (!el) return;
      const baseUnitId = Number(ui.baseUnitSelect?.value || 0);
      const unitLabel = baseUnitId ? getUnitLabel(baseUnitId) : "";
      if (total == null) {
        el.textContent = "—";
        return;
      }
      const value = Math.round(total * 1000) / 1000;
      el.textContent = unitLabel ? `${value} ${unitLabel}` : String(value);
    }

    // Регистрируем пересчёт для меню «три точки» в футере (пересчёт по нажатию пункта меню)
    window.__productEditorRecalc = {
      recalcCost: function() {
        const v = calcTotalCostFromIngredientsGlobal();
        if (v != null && ui.costPriceInput) {
          ui.costPriceInput.value = formatNumberForInput(Math.round(v * 100) / 100);
          draft.valueSources.cost_price = "auto";
          updateCostPricePlaceholderGlobal();
        }
      },
      recalcPrice: function() {
        const cost = calcTotalCostFromIngredientsGlobal();
        const v = calcTotalPriceFromIngredientsGlobal();
        if (v != null && ui.priceInput) {
          ui.priceInput.value = formatNumberForInputFixed(v, 2);
          draft.valueSources.price = "auto";
          const margin = calcMarginFromPrice(cost, v);
          if (margin != null && ui.marginPercentInput) ui.marginPercentInput.value = formatNumberForInputFixed(margin, 2);
          updatePricePlaceholderGlobal();
        }
      },
      recalcWeight: function() {
        const v = calcTotalWeightInBaseUnitGlobal();
        if (v != null && ui.baseQtyInput) {
          ui.baseQtyInput.value = formatNumberForInput(Math.round(v * 1000) / 1000);
          draft.valueSources.base_qty = "auto";
          updateWeightTotalDisplayGlobal();
        }
      },
      /** Пересчитать в составе: все блюда, где этот товар — ингредиент: пересчитать и сохранить у них себестоимость, цену и вес */
      recalcAllFromComposition: async function() {
        const ingredientId = product?.id;
        if (!ingredientId) return;
        try {
          const res = await apiGetProductsUsingAsIngredient(ingredientId);
          const productIds = res?.product_ids || [];
          if (productIds.length === 0) {
            alert("Нет блюд с этим товаром в составе.");
            return;
          }
          let updated = 0;
          for (const productId of productIds) {
            const prodRes = await apiGetProduct(productId);
            const prod = prodRes?.data;
            if (!prod) continue;
            const ingRes = await apiGetProductIngredients(productId);
            const ingredients = Array.isArray(ingRes?.data) ? ingRes.data : [];
            const totals = calcTotalsFromComposition(prod.base_unit_id, ingredients);
            if (!totals) continue;
            const payload = {};
            if (totals.cost != null) { payload.cost_price = totals.cost; payload.cost_price_source = "auto"; }
            if (totals.price != null) { payload.price = totals.price; payload.price_source = "auto"; }
            if (totals.weight != null) { payload.base_qty = totals.weight; payload.base_qty_source = "auto"; }
            if (Object.keys(payload).length === 0) continue;
            await apiPatchProductRecalc(productId, payload);
            updated++;
          }
          alert(updated > 0 ? `Обновлено товаров: ${updated}` : "Не удалось пересчитать ни один товар.");
        } catch (e) {
          console.error("recalcAllFromComposition", e);
          alert("Ошибка при пересчёте: " + (e?.message || "неизвестная ошибка"));
        }
      }
    };

    async function loadIngredients() {
      if ((!isEdit && !isView) || !product) return;
      try {
        const cachedDetails = getCachedProductDetails(product.id);
        const loadedIngredients = await ensureProductIngredientsCached(product.id, cachedDetails?.product || product);
        ingredientsList = deepClone(loadedIngredients);
        draftIngredients.clear();
        ingredientsList.forEach(ing => {
          // Используем unit_id из prod_product_ingredients (единица в составе), 
          // если его нет - используем ingredient_unit_id (базовая единица товара) как fallback
          const unitId = Number(ing.unit_id || ing.ingredient_unit_id || 0);
          const unit = unitsList.find(u => Number(u.id) === unitId);
          draftIngredients.set(Number(ing.ingredient_id), {
            id: Number(ing.id),
            ingredient_id: Number(ing.ingredient_id),
            ingredient_name: ing.ingredient_name,
            ingredient_price: Number(ing.ingredient_price || 0),
            ingredient_cost_price: ing.ingredient_cost_price != null ? Number(ing.ingredient_cost_price) : 0,
            ingredient_base_unit_id: ing.ingredient_base_unit_id != null ? Number(ing.ingredient_base_unit_id) : null,
            ingredient_base_qty: ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : null,
            ingredient_pcs_factor: ing.ingredient_pcs_factor != null ? Number(ing.ingredient_pcs_factor) : null,
            ingredient_photos: Array.isArray(ing.ingredient_photos) ? ing.ingredient_photos : [],
            nutrition_incomplete: Boolean(ing.nutrition_incomplete),
            nutrition_problems: Array.isArray(ing.nutrition_problems) ? ing.nutrition_problems : [],
            nutrition_per_100g: ing.nutrition_per_100g && typeof ing.nutrition_per_100g === "object" ? ing.nutrition_per_100g : null,
            nutrition_kcal_100g: ing.nutrition_kcal_100g != null ? Number(ing.nutrition_kcal_100g) : null,
            nutrition_protein_100g: ing.nutrition_protein_100g != null ? Number(ing.nutrition_protein_100g) : null,
            nutrition_fat_100g: ing.nutrition_fat_100g != null ? Number(ing.nutrition_fat_100g) : null,
            nutrition_carbs_100g: ing.nutrition_carbs_100g != null ? Number(ing.nutrition_carbs_100g) : null,
            ingredient_unit_id: Number(ing.ingredient_unit_id || 0),
            quantity: Number(ing.quantity || 1),
            unit_id: unitId,
            // Используем unit из unitsList (если найден), иначе используем данные из API (unit_code, unit_title, unit_short_title)
            unit_code: unit?.code || ing.unit_code,
            unit_title: unit?.title || ing.unit_title,
            unit_short_title: unit?.short_title || ing.unit_short_title,
            quantity_min: ing.quantity_min != null ? Number(ing.quantity_min) : null,
            quantity_max: ing.quantity_max != null ? Number(ing.quantity_max) : null,
            quantity_step: ing.quantity_step != null ? Number(ing.quantity_step) : null,
            price_override: ing.price_override != null ? Number(ing.price_override) : null,
            is_variable: Number(ing.is_variable) === 1,
            sort_order: Number(ing.sort_order || 0),
          });
        });
        await Promise.all(Array.from(draftIngredients.values()).map(async (ing) => {
          ing.ingredient_unit_links = await loadIngredientUnitLinks(ing.ingredient_id);
          if (pcsUnitId && ing.ingredient_pcs_factor == null) {
            const recipeBaseUnitId = Number(ui.baseUnitSelect?.value || 0);
            const link = ing.ingredient_unit_links.find((l) => Number(l.unit_id) === Number(pcsUnitId) && Number(l.base_unit_id) === recipeBaseUnitId);
            if (link && link.factor != null) ing.ingredient_pcs_factor = Number(link.factor);
          }
        }));
        renderIngredientAccordion();
        updateCostPricePlaceholderGlobal();
        updatePricePlaceholderGlobal();
        updateWeightTotalDisplayGlobal();
        syncDraftNutritionFromIngredients();
        snapshotIngredients();
      } catch (e) {
        console.error('Failed to load ingredients', e);
      }
    }

    // Загрузка скидок для товара
    let productDiscountsList = [];
    
    async function loadProductDiscounts() {
      if ((!isEdit && !isView) || !product) return;
      try {
        const res = await api(`/api/prod_products/${product.id}/discounts`);
        productDiscountsList = Array.isArray(res.data) ? res.data : [];
        renderProductDiscountsAccordion();
      } catch (e) {
        console.error('Failed to load product discounts', e);
      }
    }

    function renderProductDiscountsAccordion() {
      if (!ui.discountAccordion) return;
      
      if (productDiscountsList.length === 0) {
        ui.discountAccordion.innerHTML = '';
        if (ui.discountEmpty) ui.discountEmpty.classList.remove('hidden');
        return;
      }
      
      if (ui.discountEmpty) ui.discountEmpty.classList.add('hidden');
      
      ui.discountAccordion.innerHTML = productDiscountsList.map(d => {
        const valueText = d.discount_type === 'percent' 
          ? `${d.discount_value}%`
          : d.discount_type === 'fixed'
            ? `-${d.discount_value}₽`
            : `${d.discount_value}₽`;
        
        const linkTypeText = d.link_type === 'direct' ? 'Напрямую' : `Категория: ${d.category_title || '—'}`;
        const statusClass = d.is_active ? '' : 'inactive';
        
        return `
          <div class="discount-row" style="margin-bottom:8px;">
            <div class="discount-row-icon"><i class="fas fa-percentage"></i></div>
            <div class="discount-row-info">
              <div class="discount-row-title">${escapeHtml(d.title)}</div>
              <div class="discount-row-meta">${escapeHtml(linkTypeText)} • ${valueText}</div>
            </div>
            <div class="discount-row-status ${statusClass}"></div>
          </div>
        `;
      }).join('');
    }

    function renderIngredientAccordion() {
      if (!ui.ingredientAccordion) return;
      if (draftIngredients.size === 0) {
        ui.ingredientAccordion.innerHTML = '<div class="empty-hint">Состав не задан...</div>';
        return;
      }

      const sorted = Array.from(draftIngredients.values())
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id);

      const getIngredientBaseUnitId = (ing) => ing.ingredient_base_unit_id || ing.ingredient_unit_id || ing.unit_id;
      const getIngredientBaseQty = (ing) => (ing.ingredient_base_qty != null ? Number(ing.ingredient_base_qty) : 1);

      const getQtyInBase = (ing) => {
        return getIngredientQuantityInBase(ing);
      };

      const getAllowedUnits = (ing) => {
        const baseUnitId = getIngredientBaseUnitId(ing);
        if (!baseUnitId) return unitsList;
        return unitsList.filter((u) => {
          if (Number(u.id) === Number(baseUnitId)) return true;
          if (getIngredientUnitLinkFactor(ing, u.id, baseUnitId) != null) return true;
          if (pcsUnitId && Number(u.id) === Number(pcsUnitId)) {
            return ing.ingredient_pcs_factor != null;
          }
          return getConversionFactor(u.id, baseUnitId) != null;
        });
      };

      const buildIngredientSummary = (ing) => {
        const isVariable = Boolean(ing.is_variable);
        const hasVariable = isVariable && (ing.quantity_min != null || ing.quantity_max != null);
        const qtyValue = Number(ing.quantity || 0);
        const rangeLabel = hasVariable 
          ? `${ing.quantity_min != null ? formatQuantity(ing.quantity_min) : formatQuantity(qtyValue)} - ${ing.quantity_max != null ? formatQuantity(ing.quantity_max) : '∞'}${ing.quantity_step != null ? `, шаг ${formatQuantity(ing.quantity_step)}` : ''}`
          : `${formatQuantity(qtyValue)}`;
        const unitLabel = ing.unit_short_title || ing.unit_title || ing.unit_code || '';
        const baseQty = getIngredientBaseQty(ing);
        const catalogBasePrice = baseQty > 0 ? Number(ing.ingredient_price || 0) / baseQty : Number(ing.ingredient_price || 0);
        const priceBase = ing.price_override != null ? Number(ing.price_override) : catalogBasePrice;
        const qtyInBase = getQtyInBase(ing);
        const totalPrice = qtyInBase == null ? null : priceBase * qtyInBase;
        const priceLabel = qtyInBase == null ? "—" : formatMoney(priceBase);
        const totalLabel = totalPrice == null ? "—" : formatMoney(totalPrice);
        return `${rangeLabel} ${unitLabel} × ${priceLabel} = ${totalLabel}`;
      };

      const calcIngredientCostTotal = (ing) => {
        const baseQty = getIngredientBaseQty(ing);
        const costBase = baseQty > 0 ? Number(ing.ingredient_cost_price || 0) / baseQty : Number(ing.ingredient_cost_price || 0);
        const qtyInBase = getQtyInBase(ing);
        return qtyInBase == null ? null : costBase * qtyInBase;
      };

      const calcTotalCostFromIngredients = () => {
        let total = 0;
        let hasValidCost = false;
        draftIngredients.forEach(ing => {
          const cost = calcIngredientCostTotal(ing);
          if (cost != null) {
            total += cost;
            hasValidCost = true;
          }
        });
        return hasValidCost ? total : null;
      };

      ui.ingredientAccordion.innerHTML = sorted.map(ing => {
        const isVariable = Boolean(ing.is_variable);
        const costTotal = calcIngredientCostTotal(ing);
        const allowedUnits = getAllowedUnits(ing);

        const ingredientPhoto = ing.ingredient_photos && ing.ingredient_photos.length > 0 ? ing.ingredient_photos[0] : null;
        const disabledAttr = isView ? "disabled" : "";
        const nutritionWarningHtml = ing.nutrition_incomplete
          ? `<span class="product-nutrition-warning ingredient-nutrition-warning" role="button" tabindex="0" data-ing-nutrition-warning="${ing.ingredient_id}" title="КБЖУ не заполнено">!</span>`
          : "";
        const controlsHtml = isView
          ? `${nutritionWarningHtml}<span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>`
          : `
              ${nutritionWarningHtml}
              <label class="switch switch-compact ingredient-variable-switch">
                <input class="switch-input" type="checkbox" data-ing-variable="${ing.ingredient_id}" ${isVariable ? 'checked' : ''} />
                <span class="switch-ui" aria-hidden="true"></span>
              </label>
              <span class="btn btn-sm ingredient-remove-btn" data-ing-remove="${ing.ingredient_id}" title="Удалить" aria-label="Удалить">
                <i class="fas fa-trash"></i>
              </span>
              <span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>
            `;
        return `
          <div class="acc-item" data-ingredient-id="${ing.ingredient_id}">
            <button class="stage-item acc-trigger ingredient-acc-trigger" type="button" data-acc-trigger>
              ${ingredientPhoto ? `<div class="ingredient-acc-photo" data-ing-open-product="${ing.ingredient_id}" title="Открыть товар"><img src="${escapeHtml(ingredientPhoto)}" alt="" /></div>` : `<div class="ingredient-acc-photo" data-ing-open-product="${ing.ingredient_id}" title="Открыть товар"></div>`}
              <span class="stage-meta stage-text">
                <b>${escapeHtml(ing.ingredient_name || '')}</b>
                <small data-ing-summary="${ing.ingredient_id}">${buildIngredientSummary(ing)}</small>
              </span>
              <span class="ingredient-acc-controls">
                ${controlsHtml}
              </span>
            </button>
            <div class="acc-panel" data-acc-panel>
              <div class="acc-panel-inner">
                <div class="ingredient-fields ingredient-fields-compact">
                  <div class="ingredient-inline-row">
                    <div class="ingredient-field ingredient-field-qty">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Кол-во</span>
                        <input class="control" type="number" step="0.001" min="0"
                          data-ing-qty="${ing.ingredient_id}" value="${ing.quantity}" ${disabledAttr} />
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-unit">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Ед.</span>
                        <select class="control" data-ing-unit="${ing.ingredient_id}" ${disabledAttr}>
                          ${allowedUnits.map(u => 
                            `<option value="${u.id}" ${u.id === ing.unit_id ? 'selected' : ''}>${escapeHtml(u.short_title || u.code || u.title || '')}</option>`
                          ).join('')}
                        </select>
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-price">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Цена</span>
                        <input class="control" type="number" step="0.01" min="0"
                          data-ing-price="${ing.ingredient_id}" value="${ing.price_override != null ? ing.price_override : ''}" placeholder="${formatMoney((getIngredientBaseQty(ing) > 0 ? Number(ing.ingredient_price || 0) / getIngredientBaseQty(ing) : Number(ing.ingredient_price || 0)))}" ${disabledAttr} />
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-cost">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Себест.</span>
                        <input class="control" type="text" data-ing-cost="${ing.ingredient_id}" value="${costTotal == null ? "—" : formatMoney(costTotal)}" readonly ${disabledAttr} />
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-min ingredient-variable-field" style="${isVariable ? '' : 'display: none;'}">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Мин</span>
                        <input class="control" type="number" step="0.001" min="0"
                          data-ing-min="${ing.ingredient_id}" value="${ing.quantity_min != null ? ing.quantity_min : ''}" ${disabledAttr} />
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-max ingredient-variable-field" style="${isVariable ? '' : 'display: none;'}">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Макс</span>
                        <input class="control" type="number" step="0.001" min="0"
                          data-ing-max="${ing.ingredient_id}" value="${ing.quantity_max != null ? ing.quantity_max : ''}" ${disabledAttr} />
                      </div>
                    </div>
                    <div class="ingredient-field ingredient-field-step ingredient-variable-field" style="${isVariable ? '' : 'display: none;'}">
                      <div class="ingredient-control-wrap">
                        <span class="ingredient-control-label">Шаг</span>
                        <input class="control" type="number" step="0.001" min="0"
                          data-ing-step="${ing.ingredient_id}" value="${ing.quantity_step != null ? ing.quantity_step : ''}" ${disabledAttr} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      bindAccordionContainer(ui.ingredientAccordion);
      updateCostPricePlaceholderGlobal();
      updatePricePlaceholderGlobal();
      updateWeightTotalDisplayGlobal();

      ui.ingredientAccordion.querySelectorAll("[data-ing-nutrition-warning]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const ingredientId = Number(btn.dataset.ingNutritionWarning);
          const ing = draftIngredients.get(ingredientId);
          showNutritionProblemPopover(btn, ing?.nutrition_problems || []);
        });
        btn.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          const ingredientId = Number(btn.dataset.ingNutritionWarning);
          const ing = draftIngredients.get(ingredientId);
          showNutritionProblemPopover(btn, ing?.nutrition_problems || []);
        });
      });
      ui.ingredientAccordion.querySelectorAll("[data-ing-open-product]").forEach((photo) => {
        photo.addEventListener("click", async (event) => {
          event.preventDefault();
          event.stopPropagation();
          const ingredientId = Number(photo.dataset.ingOpenProduct);
          if (!Number.isFinite(ingredientId) || ingredientId <= 0) return;
          const ing = draftIngredients.get(ingredientId);
          await openProductById(ingredientId);
          openProductTab({ id: ingredientId, name: ing?.ingredient_name || "Товар" }, { activate: false });
        });
      });

      if (isView) return;

      const parseNumOrNull = (value) => {
        if (value == null || value === "") return null;
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
      };

      const updateIngredientItem = (ingredientId) => {
        const ing = draftIngredients.get(ingredientId);
        const item = ui.ingredientAccordion.querySelector(`[data-ingredient-id="${ingredientId}"]`);
        if (!ing || !item) return;
        const summary = item.querySelector(`[data-ing-summary="${ingredientId}"]`);
        if (summary) summary.textContent = buildIngredientSummary(ing);
        const costInput = item.querySelector(`[data-ing-cost="${ingredientId}"]`);
        const costTotal = calcIngredientCostTotal(ing);
        if (costInput) costInput.value = costTotal == null ? "—" : formatMoney(costTotal);
        updateCostPricePlaceholderGlobal();
        updatePricePlaceholderGlobal();
        updateWeightTotalDisplayGlobal();
        syncDraftNutritionFromIngredients();
      };

      // Toggle variable fields on switch change
      ui.ingredientAccordion.querySelectorAll("[data-ing-variable]").forEach(cb => {
        const switchWrap = cb.closest(".ingredient-variable-switch");
        if (switchWrap) {
          switchWrap.addEventListener("click", (event) => event.stopPropagation());
        }
        cb.addEventListener("click", (event) => event.stopPropagation());
        cb.addEventListener("change", () => {
          const ingredientId = Number(cb.dataset.ingVariable);
          const isVariable = cb.checked;
          const ing = draftIngredients.get(ingredientId);
          if (ing) {
            ing.is_variable = isVariable;
          }
          const item = ui.ingredientAccordion.querySelector(`[data-ingredient-id="${ingredientId}"]`);
          if (item) {
            const variableFields = item.querySelectorAll(".ingredient-variable-field");
            variableFields.forEach(field => {
              field.style.display = isVariable ? "" : "none";
            });
            refreshOpenAccordions();
          }
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-qty]").forEach(input => {
        input.addEventListener("input", () => {
          const ingredientId = Number(input.dataset.ingQty);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          const value = Number(input.value);
          ing.quantity = Number.isFinite(value) ? value : 0;
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-unit]").forEach(select => {
        select.addEventListener("change", () => {
          const ingredientId = Number(select.dataset.ingUnit);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          const unitId = Number(select.value);
          if (Number.isFinite(unitId)) {
            ing.unit_id = unitId;
            const unit = unitsList.find(u => Number(u.id) === unitId);
            if (unit) {
              ing.unit_code = unit.code;
              ing.unit_title = unit.title;
              ing.unit_short_title = unit.short_title;
            }
          }
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-price]").forEach(input => {
        input.addEventListener("input", () => {
          const ingredientId = Number(input.dataset.ingPrice);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          ing.price_override = parseNumOrNull(input.value);
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-min]").forEach(input => {
        input.addEventListener("input", () => {
          const ingredientId = Number(input.dataset.ingMin);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          ing.quantity_min = parseNumOrNull(input.value);
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-max]").forEach(input => {
        input.addEventListener("input", () => {
          const ingredientId = Number(input.dataset.ingMax);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          ing.quantity_max = parseNumOrNull(input.value);
          updateIngredientItem(ingredientId);
        });
      });

      ui.ingredientAccordion.querySelectorAll("[data-ing-step]").forEach(input => {
        input.addEventListener("input", () => {
          const ingredientId = Number(input.dataset.ingStep);
          const ing = draftIngredients.get(ingredientId);
          if (!ing) return;
          ing.quantity_step = parseNumOrNull(input.value);
          updateIngredientItem(ingredientId);
        });
      });

      // Remove handlers
      ui.ingredientAccordion.querySelectorAll("[data-ing-remove]").forEach(btn => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          const ingredientId = Number(btn.dataset.ingRemove);
          draftIngredients.delete(ingredientId);
          renderIngredientAccordion();
          syncDraftNutritionFromIngredients();
        });
      });
    }

    function openIngredientPicker() {
      // Initialize selection from current ingredients
      ingredientPickerSelection = new Set(Array.from(draftIngredients.keys()));
      
      // Create ingredient picker overlay for right panel
      const pickerOverlay = document.createElement("div");
      pickerOverlay.className = "picker-overlay";
      
      const pickerContent = document.createElement("div");
      pickerContent.className = "picker-overlay-content";
      
      pickerContent.innerHTML = `
        <div class="picker-overlay-header">
          <div class="panel-title">Состав</div>
        </div>
        <div class="picker-overlay-body">
          <div class="info-card">
            <div class="option-picker-tabs" id="ingredientPickerTabs"></div>
            <div class="option-picker-search" style="margin-bottom: 16px;">
              <input class="control" id="ingredientPickerSearchInput" type="search" placeholder="Поиск товара..." />
            </div>
            <div class="option-picker-list" id="ingredientPickerListContent"></div>
          </div>
        </div>
      `;
      
      pickerOverlay.appendChild(pickerContent);
      
      const searchInput = pickerContent.querySelector("#ingredientPickerSearchInput");
      const listContent = pickerContent.querySelector("#ingredientPickerListContent");
      const tabsEl = pickerContent.querySelector("#ingredientPickerTabs");
      let ingredientPickerCategoryId = null;

      async function renderTabs() {
        if (!tabsEl) return;
        if (!state.catalogCategories.length) {
          await loadCatalogCategories();
        }
        const categories = [{ id: "", title: "Все" }, ...state.catalogCategories];
        tabsEl.innerHTML = categories.map((cat) => {
          const active = ingredientPickerCategoryId == null
            ? cat.id === ""
            : Number(cat.id) === Number(ingredientPickerCategoryId);
          return `
            <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
              ${escapeHtml(cat.title || "")}
            </button>
          `;
        }).join("");

        bindHorizontalScroll(tabsEl);
        tabsEl.querySelectorAll("[data-cat-id]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const raw = btn.dataset.catId;
            ingredientPickerCategoryId = raw === "" ? null : Number(raw);
            renderTabs();
            await renderList();
            // Keep footer visible after switching category tab (it can disappear when list re-renders)
            const footer = $("#productInfoFooter");
            if (footer) {
              footer.classList.remove("hidden");
              const footerEditMode = $("#productFooterEditMode");
              if (footerEditMode) footerEditMode.classList.remove("hidden");
              const cancelBtn = $("#productFooterCancelBtn");
              const saveBtn = $("#productFooterSaveBtn");
              if (cancelBtn) cancelBtn.dataset.pickerType = "ingredient";
              if (saveBtn) saveBtn.dataset.pickerType = "ingredient";
            }
          });
        });
      }

      async function renderList() {
        if (!listContent) return;
        const query = String(searchInput?.value || "").trim().toLowerCase();
        
        try {
          const categoryId = Number.isFinite(ingredientPickerCategoryId) ? ingredientPickerCategoryId : null;
          const res = await apiGetCatalogProducts({ query, categoryId });
          const raw = Array.isArray(res.data) ? res.data : [];
          // Deduplicate by id (API may return same product multiple times e.g. per category)
          const seenIds = new Set();
          const products = raw.filter(p => {
            const id = Number(p.id);
            if (seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
          });

          listContent.innerHTML = products
            .filter(p => Number(p.is_active) !== 0)
            .filter(p => !query || String(p.name || "").toLowerCase().includes(query))
            .map(p => {
              const id = Number(p.id);
              const checked = ingredientPickerSelection.has(id);
              const productPhoto = p.photos_json && Array.isArray(p.photos_json) && p.photos_json.length > 0 ? p.photos_json[0] : null;
              return `
                <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${id}">
                  ${productPhoto ? `<div class="option-picker-photo"><img src="${escapeHtml(productPhoto)}" alt="" /></div>` : '<div class="option-picker-photo"></div>'}
                  <div class="option-picker-meta">
                    <div class="options-row-title">${escapeHtml(p.name || "")}</div>
                    <div class="options-row-meta">${formatMoney(p.price || 0)}</div>
                  </div>
                  <input class="option-picker-checkbox" type="checkbox" data-product-id="${id}" ${checked ? "checked" : ""} />
                </div>
              `;
            }).join('');

          listContent.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
            row.addEventListener("click", () => {
              const id = Number(row.dataset.productId);
              if (!Number.isFinite(id)) return;
              if (ingredientPickerSelection.has(id)) {
                ingredientPickerSelection.delete(id);
              } else {
                ingredientPickerSelection.add(id);
              }
              renderList();
            });
          });
        } catch (e) {
          console.error('Failed to load products', e);
          listContent.innerHTML = '<div class="empty-hint">Ошибка загрузки товаров</div>';
        }
      }

      if (searchInput) {
        searchInput.addEventListener("input", renderList);
      }

      renderTabs();
      renderList();
      
      // Insert overlay directly into #productInfoPanel (right column) instead of using navigation
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        // Remove existing picker overlay if any
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
        
        // Insert picker overlay into panel
        productInfoPanel.appendChild(pickerOverlay);

        // Switch footer to edit mode for picker
      const footer = $("#productInfoFooter");
        const footerView = $("#productFooterView");
        const footerEditMode = $("#productFooterEditMode");
        const cancelBtn = $("#productFooterCancelBtn");
        const saveBtn = $("#productFooterSaveBtn");
        
        const deleteBtn = $("#productFooterDeleteEditBtn");
        const moreBtn = $("#productFooterMoreEditBtn");
        
        if (footer && footerView && footerEditMode && cancelBtn && saveBtn) {
          // Save current footer state
          if (!ingredientPickerSavedFooterState) {
            ingredientPickerSavedFooterState = {
              footerHidden: footer.classList.contains("hidden"),
              viewHidden: footerView.classList.contains("hidden"),
              editHidden: footerEditMode.classList.contains("hidden"),
              deleteBtnHidden: deleteBtn ? deleteBtn.classList.contains("hidden") : false,
              moreBtnHidden: moreBtn ? moreBtn.classList.contains("hidden") : false,
              cancelBtnClasses: cancelBtn.className,
              cancelBtnIsFullwidth: cancelBtn.classList.contains("is-fullwidth"),
              cancelBtnIsConfirm: cancelBtn.classList.contains("is-confirm")
            };
            ingredientPickerSavedHandlers = {
              cancel: cancelBtn.onclick,
              save: saveBtn.onclick
            };
          }
          
          // Switch to edit mode footer
          footer.classList.remove("hidden");
          footerView.classList.add("hidden");
          footerEditMode.classList.remove("hidden");
          
          // Hide delete and more buttons
          if (deleteBtn) deleteBtn.classList.add("hidden");
          if (moreBtn) moreBtn.classList.add("hidden");
          
          // Make cancel button full-width with text visible immediately
          cancelBtn.classList.remove("is-confirm");
          cancelBtn.classList.add("is-fullwidth");
          // Save original HTML if not saved
          if (!cancelBtn.dataset.pickerOriginalHtml) {
            cancelBtn.dataset.pickerOriginalHtml = cancelBtn.innerHTML;
          }
          // Set text "Отменить" immediately
          cancelBtn.textContent = "Отменить";
          cancelBtn.title = "Отменить";
          cancelBtn.setAttribute("aria-label", "Отменить");
          
          // Set data attributes and store functions for picker handlers
          cancelBtn.dataset.pickerType = "ingredient";
          saveBtn.dataset.pickerType = "ingredient";
          window._closeIngredientPickerFn = () => {
            closeIngredientPicker();
          };
          window._saveIngredientPickerFn = async () => {
            const oldSelection = new Set(Array.from(draftIngredients.keys()));
            const newSelection = ingredientPickerSelection;
            
            // Find items to add and remove
            const toAdd = Array.from(newSelection).filter(id => !oldSelection.has(id));
            const toRemove = Array.from(oldSelection).filter(id => !newSelection.has(id));
            
            try {
              const res = await apiGetCatalogProducts({});
              const catalogProducts = Array.isArray(res.data) ? res.data : [];
              const productMap = new Map(catalogProducts.map(p => [Number(p.id), p]));

              // Remove from draft
              for (const productId of toRemove) {
                draftIngredients.delete(productId);
              }

              // Add to draft
              let nextSort = 0;
              draftIngredients.forEach((item) => {
                nextSort = Math.max(nextSort, Number(item.sort_order || 0));
              });

              for (const productId of toAdd) {
                const selectedProduct = productMap.get(productId);
                let fullProduct = selectedProduct;
                try {
                  const productRes = await apiGetProduct(productId);
                  if (productRes?.data) fullProduct = productRes.data;
                } catch (_) {}
                const ingredientUnitLinks = await loadIngredientUnitLinks(productId);
                let unitId = null;

                if (fullProduct && fullProduct.unit_id) {
                  unitId = Number(fullProduct.unit_id);
                } else if (unitsList.length > 0) {
                  unitId = unitsList[0].id;
                }

                if (!unitId) {
                  console.warn('No unit_id for product', productId);
                  continue;
                }

                const productName = fullProduct?.name || '';
                const productPrice = Number(fullProduct?.price || 0);
                const productCostPrice = Number(fullProduct?.cost_price || 0);
                const productPhotos = Array.isArray(fullProduct?.photos) ? fullProduct.photos : (Array.isArray(fullProduct?.photos_json) ? fullProduct.photos_json : []);
                const baseUnitId = Number(fullProduct?.base_unit_id || fullProduct?.unit_id || unitId || 0);
                const baseQty = fullProduct?.base_qty != null ? Number(fullProduct.base_qty) : null;
                const unit = unitsList.find(u => u.id === (baseUnitId || unitId));

                let ingredientPcsFactor = null;
                if (pcsUnitId && baseUnitId === pcsUnitId) {
                  const recipeBaseUnitId = Number(ui.baseUnitSelect?.value || 0);
                  if (recipeBaseUnitId && recipeBaseUnitId !== pcsUnitId) {
                    const link = ingredientUnitLinks.find((l) => Number(l.unit_id) === Number(pcsUnitId) && Number(l.base_unit_id) === recipeBaseUnitId);
                    if (link && link.factor != null) ingredientPcsFactor = Number(link.factor);
                  }
                }

                nextSort += 10;
                draftIngredients.set(productId, {
                  id: 0,
                  ingredient_id: productId,
                  ingredient_name: productName,
                  ingredient_price: productPrice,
                  ingredient_cost_price: productCostPrice,
                  ingredient_base_unit_id: baseUnitId || null,
                  ingredient_base_qty: baseQty,
                  ingredient_pcs_factor: ingredientPcsFactor,
                  ingredient_unit_links: ingredientUnitLinks,
                  ingredient_photos: productPhotos,
                  nutrition_per_100g: fullProduct?.nutrition_per_100g && typeof fullProduct.nutrition_per_100g === "object" ? fullProduct.nutrition_per_100g : null,
                  nutrition_kcal_100g: fullProduct?.nutrition_kcal_100g != null ? Number(fullProduct.nutrition_kcal_100g) : null,
                  nutrition_protein_100g: fullProduct?.nutrition_protein_100g != null ? Number(fullProduct.nutrition_protein_100g) : null,
                  nutrition_fat_100g: fullProduct?.nutrition_fat_100g != null ? Number(fullProduct.nutrition_fat_100g) : null,
                  nutrition_carbs_100g: fullProduct?.nutrition_carbs_100g != null ? Number(fullProduct.nutrition_carbs_100g) : null,
                  ingredient_unit_id: baseUnitId || unitId,
                  quantity: 1,
                  unit_id: baseUnitId || unitId,
                  unit_code: unit?.code || '',
                  unit_title: unit?.title || '',
                  unit_short_title: unit?.short_title || '',
                  quantity_min: null,
                  quantity_max: null,
                  quantity_step: null,
                  price_override: null,
                  is_variable: false,
                  sort_order: nextSort,
                });
              }

              renderIngredientAccordion();
              updateCostPricePlaceholderGlobal();
              updatePricePlaceholderGlobal();
              updateWeightTotalDisplayGlobal();
              syncDraftNutritionFromIngredients();
            } catch (e) {
              console.error('Failed to save ingredients', e);
              alert('Ошибка при сохранении состава');
              return;
            }
            
            closeIngredientPicker();
          };
        }
      }
    }

    function closeIngredientPicker() {
      ingredientPickerSelection = null;
      // Remove picker overlay from right panel
      const productInfoPanel = $("#productInfoPanel");
      if (productInfoPanel) {
        const existingPicker = productInfoPanel.querySelector(".picker-overlay");
        if (existingPicker) {
          existingPicker.remove();
        }
      }
      
      // Clear picker data attributes
      const cancelBtn = $("#productFooterCancelBtn");
      const saveBtn = $("#productFooterSaveBtn");
      if (cancelBtn) delete cancelBtn.dataset.pickerType;
      if (saveBtn) delete saveBtn.dataset.pickerType;
      delete window._closeIngredientPickerFn;
      delete window._saveIngredientPickerFn;
      
      // Restore footer to original state
          const footer = $("#productInfoFooter");
      const footerView = $("#productFooterView");
      const footerEditMode = $("#productFooterEditMode");
      
      const deleteBtn = $("#productFooterDeleteEditBtn");
      const moreBtn = $("#productFooterMoreEditBtn");
      
      if (footer && footerView && footerEditMode && cancelBtn && saveBtn && ingredientPickerSavedFooterState) {
        // Restore footer visibility
        if (ingredientPickerSavedFooterState.footerHidden) {
          footer.classList.add("hidden");
        } else {
          footer.classList.remove("hidden");
        }
        if (ingredientPickerSavedFooterState.viewHidden) {
          footerView.classList.add("hidden");
        } else {
          footerView.classList.remove("hidden");
        }
        if (ingredientPickerSavedFooterState.editHidden) {
          footerEditMode.classList.add("hidden");
        } else {
          footerEditMode.classList.remove("hidden");
        }
        
        // Restore delete and more buttons visibility
        if (deleteBtn) {
          if (ingredientPickerSavedFooterState.deleteBtnHidden) {
            deleteBtn.classList.add("hidden");
          } else {
            deleteBtn.classList.remove("hidden");
          }
        }
        if (moreBtn) {
          if (ingredientPickerSavedFooterState.moreBtnHidden) {
            moreBtn.classList.add("hidden");
          } else {
            moreBtn.classList.remove("hidden");
          }
        }
        
        // Restore cancel button style and content
        cancelBtn.classList.remove("is-fullwidth");
        if (ingredientPickerSavedFooterState.cancelBtnIsConfirm) {
          cancelBtn.classList.add("is-confirm");
        }
        // Restore original HTML
        if (cancelBtn.dataset.pickerOriginalHtml) {
          cancelBtn.innerHTML = cancelBtn.dataset.pickerOriginalHtml;
          delete cancelBtn.dataset.pickerOriginalHtml;
        }
        
        // Restore button handlers
        if (ingredientPickerSavedHandlers) {
          cancelBtn.onclick = ingredientPickerSavedHandlers.cancel;
          saveBtn.onclick = ingredientPickerSavedHandlers.save;
        }
      }
      
      // Clear saved state
      ingredientPickerSavedFooterState = null;
      ingredientPickerSavedHandlers = null;
    }

    let ingredientPickerSelection = null;
    let ingredientPickerSavedFooterState = null;
    let ingredientPickerSavedHandlers = null;

    async function renderIngredientPickerList() {
      if (!ui.ingredientModalList) return;
      const query = String(ui.ingredientModalSearch?.value || "").trim().toLowerCase();
      
      try {
        const res = await apiGetCatalogProducts({ query });
        const raw = Array.isArray(res.data) ? res.data : [];
        const existingIds = new Set(Array.from(draftIngredients.keys()));
        // Deduplicate by id (API may return same product multiple times)
        const seenIds = new Set();
        const products = raw.filter(p => {
          const id = Number(p.id);
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });

        ui.ingredientModalList.innerHTML = products
          .filter(p => Number(p.is_active) !== 0)
          .filter(p => !existingIds.has(Number(p.id)))
          .filter(p => !query || String(p.name || "").toLowerCase().includes(query))
          .map(p => {
            const id = Number(p.id);
            const productPhoto = p.photos_json && Array.isArray(p.photos_json) && p.photos_json.length > 0 ? p.photos_json[0] : null;
            return `
              <div class="option-picker-row" data-product-id="${id}">
                ${productPhoto ? `<div class="option-picker-photo"><img src="${escapeHtml(productPhoto)}" alt="" /></div>` : '<div class="option-picker-photo"></div>'}
                <div class="option-picker-meta">
                  <div class="options-row-title">${escapeHtml(p.name || "")}</div>
                  <div class="options-row-meta">${formatMoney(p.price || 0)}</div>
                </div>
                <button class="btn btn-sm" type="button" data-add-ingredient="${id}">Добавить</button>
              </div>
            `;
          }).join('');

        ui.ingredientModalList.querySelectorAll("[data-add-ingredient]").forEach(btn => {
          btn.addEventListener("click", async () => {
            const productId = Number(btn.dataset.addIngredient);
            if (!Number.isFinite(productId)) return;
            closeIngredientPicker();
            
            // Find the product to get its unit_id from the catalog
            const res = await apiGetCatalogProducts({});
            const catalogProducts = Array.isArray(res.data) ? res.data : [];
            const selectedProduct = catalogProducts.find(p => Number(p.id) === productId);
            let fullProduct = selectedProduct;
            try {
              const productRes = await apiGetProduct(productId);
              if (productRes?.data) fullProduct = productRes.data;
            } catch (_) {}
            const ingredientUnitLinks = await loadIngredientUnitLinks(productId);
            let unitId = null;
            
            if (fullProduct && fullProduct.unit_id) {
              unitId = Number(fullProduct.unit_id);
            } else if (unitsList.length > 0) {
              unitId = unitsList[0].id;
            }
            
            if (!unitId) {
              alert('Нет доступных единиц измерения');
              return;
            }

            // Get product name and price from catalog
            const productName = fullProduct?.name || '';
            const productPrice = Number(fullProduct?.price || 0);
            const productCostPrice = Number(fullProduct?.cost_price || 0);
            const productPhotos = Array.isArray(fullProduct?.photos) ? fullProduct.photos : (Array.isArray(fullProduct?.photos_json) ? fullProduct.photos_json : []);
            const baseUnitId = Number(fullProduct?.base_unit_id || fullProduct?.unit_id || unitId || 0);
            const baseQty = fullProduct?.base_qty != null ? Number(fullProduct.base_qty) : null;

            let nextSort = 0;
            draftIngredients.forEach((item) => {
              nextSort = Math.max(nextSort, Number(item.sort_order || 0));
            });
            nextSort += 10;

            let ingredientPcsFactor = null;
            if (pcsUnitId && baseUnitId === pcsUnitId) {
              const recipeBaseUnitId = Number(ui.baseUnitSelect?.value || 0);
              if (recipeBaseUnitId && recipeBaseUnitId !== pcsUnitId) {
                const link = ingredientUnitLinks.find((l) => Number(l.unit_id) === Number(pcsUnitId) && Number(l.base_unit_id) === recipeBaseUnitId);
                if (link && link.factor != null) ingredientPcsFactor = Number(link.factor);
              }
            }

            const unit = unitsList.find(u => u.id === (baseUnitId || unitId));
            draftIngredients.set(productId, {
              id: 0,
              ingredient_id: productId,
              ingredient_name: productName,
              ingredient_price: productPrice,
              ingredient_cost_price: productCostPrice,
              ingredient_base_unit_id: baseUnitId || null,
              ingredient_base_qty: baseQty,
              ingredient_pcs_factor: ingredientPcsFactor,
              ingredient_unit_links: ingredientUnitLinks,
              ingredient_photos: productPhotos,
              nutrition_per_100g: fullProduct?.nutrition_per_100g && typeof fullProduct.nutrition_per_100g === "object" ? fullProduct.nutrition_per_100g : null,
              nutrition_kcal_100g: fullProduct?.nutrition_kcal_100g != null ? Number(fullProduct.nutrition_kcal_100g) : null,
              nutrition_protein_100g: fullProduct?.nutrition_protein_100g != null ? Number(fullProduct.nutrition_protein_100g) : null,
              nutrition_fat_100g: fullProduct?.nutrition_fat_100g != null ? Number(fullProduct.nutrition_fat_100g) : null,
              nutrition_carbs_100g: fullProduct?.nutrition_carbs_100g != null ? Number(fullProduct.nutrition_carbs_100g) : null,
              ingredient_unit_id: baseUnitId || unitId,
              quantity: 1,
              unit_id: baseUnitId || unitId,
              unit_code: unit?.code || '',
              unit_title: unit?.title || '',
              unit_short_title: unit?.short_title || '',
              quantity_min: null,
              quantity_max: null,
              quantity_step: null,
              price_override: null,
              is_variable: false,
              sort_order: nextSort,
            });
            renderIngredientAccordion();
            updateCostPricePlaceholderGlobal();
            updatePricePlaceholderGlobal();
            updateWeightTotalDisplayGlobal();
            syncDraftNutritionFromIngredients();
          });
        });
      } catch (e) {
        console.error('Failed to load products', e);
        ui.ingredientModalList.innerHTML = '<div class="empty-hint">Ошибка загрузки товаров</div>';
      }
    }

    if (ui.ingredientAddBtn && !isView) {
      ui.ingredientAddBtn.addEventListener("click", () => {
        openIngredientPicker();
      });
    }

    if (!isView) {
      if (ui.ingredientModalClose) ui.ingredientModalClose.addEventListener("click", closeIngredientPicker);
      if (ui.ingredientModalCancel) ui.ingredientModalCancel.addEventListener("click", closeIngredientPicker);
      if (ui.ingredientBackdrop) ui.ingredientBackdrop.addEventListener("click", closeIngredientPicker);
      if (ui.ingredientModalSearch) {
        ui.ingredientModalSearch.addEventListener("input", renderIngredientPickerList);
      }
      if (ui.ingredientModalCreate) {
        ui.ingredientModalCreate.addEventListener("click", () => {
          closeIngredientPicker();
          // Можно открыть модальное окно создания товара
          alert('Функция создания товара из состава будет добавлена позже');
        });
      }
    }

    if (ui.baseUnitSelect && !isView) {
      ui.baseUnitSelect.addEventListener("change", () => {
        updatePcsLinkVisibility();
        updatePcsToUnitVisibility();
        updateWeightTotalDisplayGlobal();
        syncDraftNutritionFromIngredients();
      });
    }
    [ui.baseQtyInput, ui.pcsFactorInput, ui.pcsToUnitFactorInput, ui.pcsToUnitSelect].forEach((input) => {
      input?.addEventListener("input", syncDraftNutritionFromIngredients);
      input?.addEventListener("change", syncDraftNutritionFromIngredients);
    });

    // ========== END INGREDIENTS ==========

    // init UI after categories loaded (for edit/view)
    (async () => {
      await loadCatsPromise;
      await loadOptionsPromise;
      await loadVariantsPromise;
      await loadUnits();
      await loadUnitConversions();
      await loadProductUnitLinks();
      renderCategoryChips();
      renderVariantAccordion();
      renderOptionAccordion();
      renderPhotos();
      if ((isEdit || isView) && product) {
        await loadIngredients();
        await loadProductDiscounts();
      } else {
        // При создании нового товара инициализируем поле себестоимости состава
        updateCostPricePlaceholderGlobal();
        updatePricePlaceholderGlobal();
        updateWeightTotalDisplayGlobal();
      }
      requestAnimationFrame(refreshOpenAccordions);
    })();
  }

  // ---------------- Category editor (right panel) ----------------

  function openCategoryEditor({ mode, category }) {
    const isEdit = mode === "edit";
    const cat = isEdit ? category : null;
    const tabId = isEdit && cat && cat.id ? cat.id : `new-category-${Date.now()}`;
    const tabKey = buildTabKey("category", tabId);

    const draft = {
      iconFile: null,
      iconPreview: "",
      deletedSubcategoryIds: [],
      subcategories: isEdit && cat
        ? state.categories
          .filter((item) => Number(item.parent_id) === Number(cat.id))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)
          .map((item) => ({ id: Number(item.id), title: String(item.title || ""), icon: String(item.icon || "") }))
        : [],
    };

    // Clone template content
    const template = document.querySelector("#tplCategoryEditor");
    if (!template) return;
    const content = template.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.className = "product-editor-wrapper category-editor-wrapper";
    wrapper.appendChild(content);

    // Get form and UI elements
    const form = wrapper.querySelector("#categoryEditorForm");
    if (!form) return;

    const ui = {
      iconPreview: wrapper.querySelector("#ceIconPreview"),
      iconPlaceholder: wrapper.querySelector("#ceIconPlaceholder"),
      iconFileInput: wrapper.querySelector("#ceIconFile"),
      iconUploadBtn: null,
      iconDeleteBtn: null,
    };

    const subcategoriesSection = wrapper.querySelector("[data-category-subcategories]");
    const subcategoriesList = wrapper.querySelector("[data-category-subcategory-list]");
    const subcategoryAddBtn = wrapper.querySelector("[data-category-subcategory-add]");
    const canHaveSubcategories = !isEdit || String(cat?.code || "") !== "all";

    function renderSubcategoryInputs() {
      if (!subcategoriesList) return;
      subcategoriesList.innerHTML = draft.subcategories.map((item, index) => `
        <div class="category-editor-subcategory-row" data-subcategory-index="${index}">
          <button class="category-editor-subcategory-photo" type="button" data-subcategory-photo aria-label="Загрузить иконку подкатегории">
            ${looksLikeUrl(item.icon) ? `<img src="${escapeHtml(item.icon)}" alt="" />` : `<i class="${escapeHtml(item.icon || "fas fa-plus")}"></i>`}
          </button>
          <input class="control" type="text" value="${escapeHtml(item.title)}" placeholder="Название подкатегории" data-subcategory-title />
          <button class="category-editor-subcategory-remove" type="button" data-subcategory-remove aria-label="Удалить подкатегорию">
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      `).join("");

      subcategoriesList.querySelectorAll("[data-subcategory-title]").forEach((input) => {
        input.addEventListener("input", () => {
          const row = input.closest("[data-subcategory-index]");
          const index = Number(row?.dataset.subcategoryIndex);
          if (!Number.isInteger(index) || !draft.subcategories[index]) return;
          draft.subcategories[index].title = input.value;
        });
      });

      subcategoriesList.querySelectorAll("[data-subcategory-remove]").forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("[data-subcategory-index]");
          const index = Number(row?.dataset.subcategoryIndex);
          if (!Number.isInteger(index)) return;
          const item = draft.subcategories[index];
          const id = Number(item?.id || 0);
          if (id > 0 && !draft.deletedSubcategoryIds.includes(id)) draft.deletedSubcategoryIds.push(id);
          draft.subcategories.splice(index, 1);
          renderSubcategoryInputs();
        });
      });

      subcategoriesList.querySelectorAll("[data-subcategory-photo]").forEach((button) => {
        button.addEventListener("click", () => {
          const row = button.closest("[data-subcategory-index]");
          const index = Number(row?.dataset.subcategoryIndex);
          if (!Number.isInteger(index) || !draft.subcategories[index]) return;
          openCategoryPhotoGridModal({ subcategoryIndex: index });
        });
      });
    }

    if (canHaveSubcategories && subcategoriesSection) {
      subcategoriesSection.classList.remove("hidden");
      renderSubcategoryInputs();
      subcategoryAddBtn?.addEventListener("click", () => {
        draft.subcategories.push({ id: null, title: "", icon: "" });
        renderSubcategoryInputs();
        subcategoriesList?.querySelector("[data-subcategory-index]:last-child [data-subcategory-title]")?.focus();
      });
    }

    // Fill form if editing
    if (isEdit && cat) {
      const titleInput = form.querySelector("#ce_title");
      const codeInput = form.querySelector("#ce_code");
      const iconInput = form.querySelector("#ce_icon");
      const sortInput = form.querySelector("#ce_sort");
      const activeInput = form.querySelector("input[name='is_active']");
      const visibilityInput = form.querySelector("input[name='site_visibility']");
      const cartVisibilityInput = form.querySelector("input[name='cart_visibility']");
      const checkoutVisibilityInput = form.querySelector("input[name='checkout_visibility']");

      if (titleInput) titleInput.value = cat.title || "";
      if (codeInput) codeInput.value = cat.code || "";
      if (iconInput) iconInput.value = cat.icon || "";
      if (sortInput) sortInput.value = cat.sort_order != null ? String(cat.sort_order) : "";
      if (activeInput) activeInput.checked = Boolean(cat.is_active);
      if (visibilityInput) visibilityInput.checked = Boolean(cat.site_visibility);
      if (cartVisibilityInput) cartVisibilityInput.checked = Boolean(cat.cart_visibility);
      if (checkoutVisibilityInput) checkoutVisibilityInput.checked = cat.checkout_visibility !== 0;
    }

    function renderIconPreview(value) {
      if (!ui.iconPreview || !ui.iconPlaceholder) return;
      const v = String(value || "").trim();
      if (looksLikeUrl(v)) {
        ui.iconPreview.src = v;
        ui.iconPreview.classList.remove("hidden");
        ui.iconPlaceholder.classList.add("hidden");
        ui.iconPlaceholder.textContent = "Нет изображения";
        if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.remove("hidden");
        return;
      }
      ui.iconPreview.src = "";
      ui.iconPreview.classList.add("hidden");
      ui.iconPlaceholder.classList.remove("hidden");
      ui.iconPlaceholder.innerHTML = v ? `<i class="${escapeHtml(v)}"></i>` : "Нет изображения";
      if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.add("hidden");
    }

    const initialIcon = isEdit && cat ? (cat.icon || "") : "";
    renderIconPreview(initialIcon);

    function getCategoryIconValue(target = {}) {
      const subcategoryIndex = Number(target?.subcategoryIndex);
      if (Number.isInteger(subcategoryIndex) && draft.subcategories[subcategoryIndex]) {
        return String(draft.subcategories[subcategoryIndex].icon || "").trim();
      }
      return String(form.querySelector("#ce_icon")?.value || "").trim();
    }

    function setCategoryIconValue(value, target = {}) {
      const subcategoryIndex = Number(target?.subcategoryIndex);
      if (Number.isInteger(subcategoryIndex) && draft.subcategories[subcategoryIndex]) {
        draft.subcategories[subcategoryIndex].icon = String(value || "").trim();
        renderSubcategoryInputs();
        return;
      }
      const iconInput = form.querySelector("#ce_icon");
      if (iconInput) iconInput.value = String(value || "").trim();
      if (draft.iconPreview) {
        try { URL.revokeObjectURL(draft.iconPreview); } catch {}
      }
      draft.iconPreview = "";
      draft.iconFile = null;
      renderIconPreview(value);
    }

    const categoryIconSizeCache = {};
    function formatCategoryIconSize(bytes) {
      if (!bytes || bytes <= 0) return "";
      if (bytes < 1024) return bytes + " B";
      const kb = bytes / 1024;
      if (kb < 1024) return kb.toFixed(kb < 10 ? 1 : 0) + " KB";
      return (kb / 1024).toFixed(1) + " MB";
    }

    async function fetchCategoryIconSize(url) {
      const key = String(url || "");
      if (!key) return 0;
      if (categoryIconSizeCache[key] !== undefined) return categoryIconSizeCache[key];
      try {
        let size = 0;
        const headRes = await fetch(key, { method: "HEAD" });
        const contentLength = headRes.headers.get("content-length");
        if (contentLength && Number(contentLength) > 0) {
          size = Number(contentLength);
        } else {
          const blobRes = await fetch(key);
          const blob = await blobRes.blob();
          size = blob.size;
        }
        categoryIconSizeCache[key] = size;
        return size;
      } catch {
        categoryIconSizeCache[key] = 0;
        return 0;
      }
    }

    let categoryPhotoModalEscHandler = null;
    let categoryPhotoModalPasteHandler = null;
    let categoryPhotoModalTarget = {};
    function closeCategoryPhotoGridModal() {
      document.querySelectorAll(".product-photo-grid-modal-overlay[data-category-photo-modal='1']").forEach((el) => el.remove());
      categoryPhotoModalTarget = {};
      if (categoryPhotoModalEscHandler) {
        document.removeEventListener("keydown", categoryPhotoModalEscHandler);
        categoryPhotoModalEscHandler = null;
      }
      if (categoryPhotoModalPasteHandler) {
        document.removeEventListener("paste", categoryPhotoModalPasteHandler);
        categoryPhotoModalPasteHandler = null;
      }
    }

    function openCategoryPhotoGridModal(target = {}) {
      const modalTarget = target && typeof target === "object" ? target : {};
      categoryPhotoModalTarget = modalTarget;
      closeCategoryPhotoGridModal();
      categoryPhotoModalTarget = modalTarget;
      const overlay = document.createElement("div");
      overlay.className = "product-photo-grid-modal-overlay";
      overlay.setAttribute("data-category-photo-modal", "1");
      const card = document.createElement("div");
      card.className = "product-photo-grid-modal-card";
      card.innerHTML = `
        <div class="product-photo-grid-modal-head">
          <div class="product-photo-grid-modal-title">Фото категории</div>
          <button type="button" class="product-photo-grid-modal-close" aria-label="Закрыть"><i class="fas fa-times"></i></button>
        </div>
        <div class="product-photo-grid-modal-body">
          <div class="product-photo-grid-modal-grid"></div>
        </div>
        <div class="product-photo-grid-modal-foot">
          <button type="button" class="btn" data-role="close">Закрыть</button>
        </div>
      `;
      const grid = card.querySelector(".product-photo-grid-modal-grid");
      const modalBody = card.querySelector(".product-photo-grid-modal-body");
      if (modalBody) {
        const dropHint = document.createElement("div");
        dropHint.className = "product-photo-grid-modal-drop-hint";
        dropHint.textContent = "Перетащите фото сюда или отпустите для загрузки";
        modalBody.appendChild(dropHint);
      }
      const isCategoryImageFile = (file) => {
        if (!file) return false;
        const type = String(file.type || "").toLowerCase();
        if (type.startsWith("image/")) return true;
        return /\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(String(file.name || ""));
      };
      const parseCategoryImageUrlsFromText = (text) => {
        if (!text || typeof text !== "string") return [];
        const result = [];
        const seen = new Set();
        const push = (value) => {
          const raw = String(value || "").trim();
          if (!raw || seen.has(raw)) return;
          const low = raw.toLowerCase();
          if (!low.startsWith("data:image/") && !low.startsWith("http://") && !low.startsWith("https://")) return;
          seen.add(raw);
          result.push(raw);
        };
        text.split(/\r?\n/).forEach(push);
        const imgSrcRe = /<img[^>]+src=["']([^"']+)["']/gi;
        let match;
        while ((match = imgSrcRe.exec(text)) !== null) push(match[1]);
        return result;
      };
      const fetchCategoryImageAsFile = async (url, idx = 0) => {
        try {
          const response = await fetch(url, { credentials: "omit", mode: "cors" });
          if (!response.ok) return null;
          const blob = await response.blob();
          if (!String(blob.type || "").toLowerCase().startsWith("image/")) return null;
          const lowType = String(blob.type || "").toLowerCase();
          const ext = lowType.includes("png")
            ? "png"
            : lowType.includes("webp")
              ? "webp"
              : lowType.includes("gif")
                ? "gif"
                : "jpg";
          return new File([blob], `category-drop-${Date.now()}-${idx}.${ext}`, { type: blob.type || "image/jpeg" });
        } catch {
          return null;
        }
      };
      const fileFromCategoryItemEntry = (item) => new Promise((resolve) => {
        try {
          if (!item || typeof item.webkitGetAsEntry !== "function") return resolve(null);
          const entry = item.webkitGetAsEntry();
          if (!entry || !entry.isFile || typeof entry.file !== "function") return resolve(null);
          entry.file((file) => resolve(file || null), () => resolve(null));
        } catch {
          resolve(null);
        }
      });
      const extractCategoryImagesFromDataTransfer = async (dt) => {
        try {
          if (!dt) return [];
          const dtFiles = Array.from(dt.files || []).filter((file) => isCategoryImageFile(file));
          if (dtFiles.length) return dtFiles;
          const items = Array.from(dt.items || []);
          const itemFiles = items.map((item) => item && item.getAsFile && item.getAsFile()).filter((file) => isCategoryImageFile(file));
          if (itemFiles.length) return itemFiles;
          const entryFiles = (await Promise.all(items.map((item) => fileFromCategoryItemEntry(item)))).filter((file) => isCategoryImageFile(file));
          if (entryFiles.length) return entryFiles;
          const payload = [];
          const uriList = dt.getData && dt.getData("text/uri-list");
          const plain = dt.getData && dt.getData("text/plain");
          const html = dt.getData && dt.getData("text/html");
          if (uriList) payload.push(uriList);
          if (plain) payload.push(plain);
          if (html) payload.push(html);
          const urls = parseCategoryImageUrlsFromText(payload.join("\n"));
          if (!urls.length) return [];
          const fetched = await Promise.all(urls.slice(0, 1).map((url, idx) => fetchCategoryImageAsFile(url, idx)));
          return fetched.filter((file) => isCategoryImageFile(file));
        } catch {
          return [];
        }
      };
      const extractCategoryImagesFromClipboard = (clipboardData) => {
        try {
          if (!clipboardData) return [];
          const direct = Array.from(clipboardData.files || []).filter((file) => isCategoryImageFile(file));
          if (direct.length) return direct;
          const items = Array.from(clipboardData.items || []);
          return items.map((item) => item && item.getAsFile && item.getAsFile()).filter((file) => isCategoryImageFile(file));
        } catch {
          return [];
        }
      };
      const renderGrid = () => {
        const iconValue = getCategoryIconValue(modalTarget);
        const iconSize = Number(categoryIconSizeCache[iconValue] || 0);
        const sizeLabel = formatCategoryIconSize(iconSize);
        const photoHtml = iconValue
          ? `
            <div class="product-photo-grid-modal-item" data-photo-idx="0">
              <div class="product-photo-grid-modal-tile">
                <img src="${escapeHtml(iconValue)}" alt="">
                <button type="button" class="product-photo-grid-modal-remove" data-role="remove-photo" aria-label="Удалить фото"><i class="fas fa-times"></i></button>
              </div>
              <div class="product-photo-grid-modal-size">${escapeHtml(sizeLabel)}</div>
            </div>
          `
          : "";
        const addTileHtml = `<button type="button" class="product-photo-grid-modal-tile product-photo-grid-modal-tile--add" data-role="add-photo" aria-label="Добавить фото"><i class="fas fa-plus"></i></button>`;
        if (grid) grid.innerHTML = photoHtml + addTileHtml;
        if (iconValue && categoryIconSizeCache[iconValue] === undefined) {
          fetchCategoryIconSize(iconValue).then(() => {
            if (getCategoryIconValue(modalTarget) === iconValue && document.body.contains(card)) renderGrid();
          });
        }
      };
      const uploadFiles = async (files) => {
        const selected = Array.from(files || []).filter((file) => isCategoryImageFile(file)).slice(0, 1);
        if (!selected.length) return;
        const result = await apiUploadImages(selected);
        const url = Array.isArray(result?.urls) ? result.urls[0] : "";
        if (!url) throw new Error("UPLOAD_ERROR");
        const size = Array.isArray(result?.sizes) ? Number(result.sizes[0] || 0) : 0;
        if (size > 0) categoryIconSizeCache[url] = size;
        setCategoryIconValue(url, modalTarget);
        renderGrid();
      };
      const close = () => closeCategoryPhotoGridModal();

      overlay.appendChild(card);
      document.body.appendChild(overlay);
      renderGrid();

      card.querySelector(".product-photo-grid-modal-close")?.addEventListener("click", close);
      card.querySelector('[data-role="close"]')?.addEventListener("click", close);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) close();
      });
      card.addEventListener("click", async (event) => {
        if (event.target.closest('[data-role="remove-photo"]')) {
          setCategoryIconValue("", modalTarget);
          renderGrid();
          return;
        }
        if (event.target.closest('[data-role="add-photo"]') && ui.iconFileInput) {
          ui.iconFileInput.click();
        }
      });
      let categoryDragDepth = 0;
      const hasCategoryExternalPayload = (dt) => {
        if (!dt) return false;
        const types = Array.from(dt.types || []).map((type) => String(type));
        if (dt.files && dt.files.length > 0) return true;
        return (
          types.includes("Files") ||
          types.includes("application/x-moz-file") ||
          types.includes("public.file-url") ||
          types.includes("text/uri-list") ||
          types.includes("text/html") ||
          types.includes("text/plain")
        );
      };
      const clearCategoryDragState = () => {
        categoryDragDepth = 0;
        card.classList.remove("is-file-drag-over");
      };
      const onCategoryDragEnter = (event) => {
        if (!hasCategoryExternalPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        categoryDragDepth += 1;
        card.classList.add("is-file-drag-over");
      };
      const onCategoryDragOver = (event) => {
        if (!hasCategoryExternalPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
        card.classList.add("is-file-drag-over");
      };
      const onCategoryDragLeave = (event) => {
        if (!hasCategoryExternalPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        categoryDragDepth = Math.max(0, categoryDragDepth - 1);
        if (!categoryDragDepth) card.classList.remove("is-file-drag-over");
      };
      const onCategoryDrop = async (event) => {
        if (!hasCategoryExternalPayload(event.dataTransfer)) return;
        event.preventDefault();
        event.stopPropagation();
        clearCategoryDragState();
        try {
          const files = await extractCategoryImagesFromDataTransfer(event.dataTransfer);
          if (!files.length) return;
          await uploadFiles(files);
        } catch {
          showToast("Не удалось загрузить фото категории.");
        }
      };
      overlay.addEventListener("dragenter", onCategoryDragEnter, true);
      card.addEventListener("dragenter", onCategoryDragEnter, true);
      overlay.addEventListener("dragover", onCategoryDragOver);
      card.addEventListener("dragover", onCategoryDragOver);
      overlay.addEventListener("dragleave", onCategoryDragLeave, true);
      card.addEventListener("dragleave", onCategoryDragLeave, true);
      overlay.addEventListener("drop", onCategoryDrop);
      card.addEventListener("drop", onCategoryDrop);
      categoryPhotoModalPasteHandler = (event) => {
        const files = extractCategoryImagesFromClipboard(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void uploadFiles(files).catch(() => {
          showToast("Не удалось загрузить фото категории.");
        });
      };
      document.addEventListener("paste", categoryPhotoModalPasteHandler);
      categoryPhotoModalEscHandler = (event) => {
        if (event.key === "Escape") close();
      };
      document.addEventListener("keydown", categoryPhotoModalEscHandler);
    }

    // Setup icon upload
    if (ui.iconUploadBtn && ui.iconFileInput) {
      ui.iconUploadBtn.addEventListener("click", () => ui.iconFileInput.click());
      ui.iconFileInput.addEventListener("change", () => {
        const file = ui.iconFileInput.files && ui.iconFileInput.files[0];
        ui.iconFileInput.value = "";
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
          alert("Можно загрузить только JPG, PNG или WEBP");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          alert("Размер файла не должен превышать 5MB");
          return;
        }
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconFile = file;
        draft.iconPreview = URL.createObjectURL(file);
        renderIconPreview(draft.iconPreview);
      });
    }

    // Setup icon delete
    if (ui.iconDeleteBtn) {
      ui.iconDeleteBtn.addEventListener("click", () => {
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconPreview = "";
        draft.iconFile = null;
        const iconInput = form.querySelector("#ce_icon");
        if (iconInput) iconInput.value = "";
        renderIconPreview("");
      });
    }

    if (ui.iconFileInput) {
      ui.iconFileInput.addEventListener("change", async () => {
        const files = Array.from(ui.iconFileInput.files || []);
        ui.iconFileInput.value = "";
        if (!files.length) return;
        try {
          const result = await apiUploadImages(files.slice(0, 1));
          const url = Array.isArray(result?.urls) ? result.urls[0] : "";
          if (!url) throw new Error("UPLOAD_ERROR");
          const size = Array.isArray(result?.sizes) ? Number(result.sizes[0] || 0) : 0;
          if (size > 0) categoryIconSizeCache[url] = size;
          const uploadTarget = categoryPhotoModalTarget;
          setCategoryIconValue(url, uploadTarget);
          if (document.querySelector(".product-photo-grid-modal-overlay[data-category-photo-modal='1']")) {
            closeCategoryPhotoGridModal();
            openCategoryPhotoGridModal(uploadTarget);
          }
        } catch {
          showToast("Не удалось загрузить фото категории.");
        }
      });
    }

    const categoryPreviewBox = wrapper.querySelector(".category-editor-preview");
    if (categoryPreviewBox) {
      categoryPreviewBox.setAttribute("role", "button");
      categoryPreviewBox.setAttribute("tabindex", "0");
      categoryPreviewBox.addEventListener("click", openCategoryPhotoGridModal);
      categoryPreviewBox.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openCategoryPhotoGridModal();
      });
    }

    // Setup navigation state
    const navigationState = {
      type: "category-edit",
      category: cat,
      content: wrapper,
      savedTitle: isEdit && cat ? cat.title : null,
      savedSku: "Category",
      tabKey: tabKey,
      onSave: async () => {
        if (!form) return false;
        
        const titleInput = form.querySelector("#ce_title");
        const codeInput = form.querySelector("#ce_code");
        const sortInput = form.querySelector("#ce_sort");
        const activeInput = form.querySelector("input[name='is_active']");
        const visibilityInput = form.querySelector("input[name='site_visibility']");
        const cartVisibilityInput = form.querySelector("input[name='cart_visibility']");
        const checkoutVisibilityInput = form.querySelector("input[name='checkout_visibility']");

        let iconValue = String(form.querySelector("#ce_icon")?.value || "").trim();
        if (draft.iconFile) {
          iconValue = await apiUploadCategoryIcon(draft.iconFile);
        }

        const payload = {
          tenant_id: TENANT_ID,
          title: String(titleInput?.value || "").trim(),
          code: String(codeInput?.value || "").trim(),
          icon: iconValue,
          sort_order: sortInput?.value === "" ? null : Number(sortInput?.value),
          is_active: activeInput?.checked ? 1 : 0,
          site_visibility: visibilityInput?.checked ? 1 : 0,
          cart_visibility: cartVisibilityInput?.checked ? 1 : 0,
          checkout_visibility: checkoutVisibilityInput?.checked ? 1 : 0,
        };

        if (!payload.title) {
          if (titleInput) titleInput.focus();
          return false;
        }

        try {
          let savedCategory = null;
          let savedCategoryId = isEdit && cat ? Number(cat.id) : null;
          if (isEdit && cat) {
            await api(`/api/prod_categories/${cat.id}`, { method: "PUT", body: JSON.stringify(payload) });
            savedCategory = cat; // Keep reference to updated category
          } else {
            const res = await api("/api/prod_categories", { method: "POST", body: JSON.stringify(payload) });
            savedCategory = res; // New category from API response
            savedCategoryId = Number(res?.id || 0);
          }

          if (canHaveSubcategories && savedCategoryId > 0) {
            for (const subcategoryId of draft.deletedSubcategoryIds) {
              const id = Number(subcategoryId || 0);
              if (!(id > 0)) continue;
              await api(`/api/prod_categories/${id}`, { method: "DELETE" });
            }

            for (const [index, item] of draft.subcategories.entries()) {
              const title = String(item.title || "").trim();
              const icon = String(item.icon || "").trim();
              if (!title) continue;

              if (item.id) {
                const existing = state.categories.find((categoryItem) => Number(categoryItem.id) === Number(item.id));
                if (!existing) continue;
                const existingIcon = String(existing.icon || "").trim();
                if (title === String(existing.title || "").trim() && icon === existingIcon) continue;
                await api(`/api/prod_categories/${item.id}`, {
                  method: "PUT",
                  body: JSON.stringify({
                    title,
                    code: existing.code || "",
                    icon,
                    sort_order: existing.sort_order == null ? null : Number(existing.sort_order),
                    is_active: Number(existing.is_active) ? 1 : 0,
                    site_visibility: Number(existing.site_visibility) ? 1 : 0,
                    cart_visibility: Number(existing.cart_visibility) ? 1 : 0,
                    checkout_visibility: Number(existing.checkout_visibility) ? 1 : 0,
                  }),
                });
                continue;
              }

              await api("/api/prod_categories", {
                method: "POST",
                body: JSON.stringify({
                  parent_id: savedCategoryId,
                  title,
                  code: `subcat-${savedCategoryId}-${Date.now().toString(36)}-${index}`,
                  icon,
                  is_active: 1,
                  site_visibility: 1,
                  cart_visibility: 0,
                  checkout_visibility: 1,
                }),
              });
            }
          }
          await refreshAll();
          if (isEdit && cat && cat.id) {
            editingCategories.delete(cat.id);
          }
          if (savedCategoryId > 0) {
            savedCategory = state.categories.find((categoryItem) => Number(categoryItem.id) === savedCategoryId) || savedCategory;
          }
          // Update navigation state with saved category reference
          navigationState.category = savedCategory;
          
          // Remove from editing state after successful save
          // For new categories, replace temporary tab with real one
          if (!isEdit && savedCategory && savedCategory.id) {
            replaceTabKey(tabKey, {
              type: "category",
              id: savedCategory.id,
              title: savedCategory.title || "Категория",
              onActivate: () => {
                state.selectedCategoryId = savedCategory.id;
                // Check if this category is being edited
                if (editingCategories.has(savedCategory.id)) {
                  const editingState = editingCategories.get(savedCategory.id);
                  pushNavigationState(editingState.navigationState);
                  return;
                }
                const updatedCat = state.categories.find(c => c.id === savedCategory.id);
                if (updatedCat) {
                  showCategoryDetails(updatedCat);
                }
              },
            });
          }

          if (savedCategory && savedCategory.id) {
            showCategoryDetails(savedCategory);
          }
          
          return true;
        } catch (e) {
          console.error('Error saving category', e);
          alert('Ошибка при сохранении категории: ' + (e.message || 'Неизвестная ошибка'));
          return false;
        }
      },
      onClose: () => {
        // Cleanup icon preview URL
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        // Remove from editing state when canceling
        if (isEdit && cat && cat.id) {
          editingCategories.delete(cat.id);
        }
        // Return to category details view if editing
        if (isEdit && cat) {
          const updatedCat = state.categories.find(c => c.id === cat.id);
          if (updatedCat) {
            showCategoryDetails(updatedCat);
          } else {
            showDetailsEmpty();
          }
        } else {
          showDetailsEmpty();
        }
      }
    };

    // Create tab for category (existing or new)
    if (isEdit && cat) {
      ensureTab({
        type: "category",
        id: cat.id,
        title: cat.title || "Категория",
        onActivate: () => {
          state.selectedCategoryId = cat.id;
          const updatedCat = state.categories.find(c => c.id === cat.id);
          if (updatedCat) {
            showCategoryDetails(updatedCat);
          }
        },
        activate: true,
      });
    } else {
      // New category - create tab with temporary ID
      ensureTab({
        type: "category",
        id: tabId,
        title: "Новая категория",
        onActivate: () => {
          currentNavigationState = navigationState;
          showNavigationState(navigationState);
          showProductFooterEdit();
        },
        activate: true,
      });
    }

    pushNavigationState(navigationState, false);
    
    // Update header title
    if (productTitle) {
      productTitle.textContent = isEdit && cat ? cat.title : "Новая категория";
    }
    if (productSku) {
      productSku.textContent = "Категория";
    }
    
    // Show footer in edit mode
    showProductFooterEdit();
  }

  // ---------------- Modal: category (legacy, kept for compatibility) ----------------

  function openCategoryModal({ mode, category }) {
    const isEdit = mode === "edit";
    const draft = {
      iconFile: null,
      iconPreview: "",
    };

    window.AppModal.open({
      title: isEdit ? "Редактировать категорию" : "Новая категория",
      content: "#tplCategoryEditor",
      onSave: async ({ body }) => {
        const form = $("#categoryEditorForm", body);
        if (!form) return false;

        let iconValue = String(form.icon.value || "").trim();
        if (draft.iconFile) {
          iconValue = await apiUploadCategoryIcon(draft.iconFile);
        }

        const payload = {
          tenant_id: TENANT_ID,
          title: String(form.title.value || "").trim(),
          code: String(form.code.value || "").trim(),
          icon: iconValue,
          sort_order: form.sort_order.value === "" ? null : Number(form.sort_order.value),
          is_active: form.is_active.checked ? 1 : 0,
          site_visibility: form.site_visibility.checked ? 1 : 0,
          cart_visibility: form.cart_visibility?.checked ? 1 : 0,
          checkout_visibility: form.checkout_visibility?.checked ? 1 : 0,
        };

        if (!payload.title) {
          form.title.focus();
          return false;
        }

        if (isEdit && category) {
          await api(`/api/prod_categories/${category.id}`, { method: "PUT", body: JSON.stringify(payload) });
        } else {
          await api("/api/prod_categories", { method: "POST", body: JSON.stringify(payload) });
        }

        await refreshAll();
        return true;
      },
    });

    const form = $("#categoryEditorForm", window.AppModal.body);
    if (!form) return;

    const ui = {
      iconPreview: $("#ceIconPreview", window.AppModal.body),
      iconPlaceholder: $("#ceIconPlaceholder", window.AppModal.body),
      iconFileInput: $("#ceIconFile", window.AppModal.body),
      iconUploadBtn: $("#ceIconUploadBtn", window.AppModal.body),
      iconDeleteBtn: $("#ceIconDeleteBtn", window.AppModal.body),
    };

    if (isEdit && category) {
      form.title.value = category.title || "";
      form.code.value = category.code || "";
      form.icon.value = category.icon || "";
      form.sort_order.value = category.sort_order != null ? String(category.sort_order) : "";
      form.is_active.checked = Boolean(category.is_active);
      form.site_visibility.checked = Boolean(category.site_visibility);
      if (form.cart_visibility) form.cart_visibility.checked = Boolean(category.cart_visibility);
      if (form.checkout_visibility) form.checkout_visibility.checked = category.checkout_visibility !== 0;
    }

    function renderIconPreview(value) {
      if (!ui.iconPreview || !ui.iconPlaceholder) return;
      const v = String(value || "").trim();
      if (looksLikeUrl(v)) {
        ui.iconPreview.src = v;
        ui.iconPreview.classList.remove("hidden");
        ui.iconPlaceholder.classList.add("hidden");
        ui.iconPlaceholder.textContent = "Нет изображения";
        if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.remove("hidden");
        return;
      }
      ui.iconPreview.src = "";
      ui.iconPreview.classList.add("hidden");
      ui.iconPlaceholder.classList.remove("hidden");
      ui.iconPlaceholder.innerHTML = v ? `<i class="${escapeHtml(v)}"></i>` : "Нет изображения";
      if (ui.iconDeleteBtn) ui.iconDeleteBtn.classList.add("hidden");
    }

    renderIconPreview(form.icon.value);

    if (ui.iconUploadBtn && ui.iconFileInput) {
      ui.iconUploadBtn.addEventListener("click", () => ui.iconFileInput.click());
      ui.iconFileInput.addEventListener("change", () => {
        const file = ui.iconFileInput.files && ui.iconFileInput.files[0];
        ui.iconFileInput.value = "";
        if (!file) return;
        const allowed = ["image/jpeg", "image/png", "image/webp"];
        if (!allowed.includes(file.type)) {
          alert("Можно загрузить только JPG, PNG или WEBP");
          return;
        }
        if (file.size > 5 * 1024 * 1024) {
          alert("Размер файла не должен превышать 5MB");
          return;
        }
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconFile = file;
        draft.iconPreview = URL.createObjectURL(file);
        renderIconPreview(draft.iconPreview);
      });
    }

    if (ui.iconDeleteBtn) {
      ui.iconDeleteBtn.addEventListener("click", () => {
        if (draft.iconPreview) {
          try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        }
        draft.iconPreview = "";
        draft.iconFile = null;
        form.icon.value = "";
        renderIconPreview("");
      });
    }

    form.icon.addEventListener("input", () => {
      if (draft.iconPreview) {
        try { URL.revokeObjectURL(draft.iconPreview); } catch {}
        draft.iconPreview = "";
        draft.iconFile = null;
      }
      renderIconPreview(form.icon.value);
    });
  }

  // ---------------- Sortable (HTML5) ----------------

  function makeSortable(container, itemSelector, onDropPersist) {
    if (!container || container.__sortableBound) return;
    container.__sortableBound = true;

    let draggingEl = null;

    function getAfterElement(y) {
      const elements = $$(itemSelector + ":not(.is-dragging)", container);
      let closest = { offset: Number.NEGATIVE_INFINITY, element: null };
      for (const el of elements) {
        const box = el.getBoundingClientRect();
        const offset = y - (box.top + box.height / 2);
        if (offset < 0 && offset > closest.offset) closest = { offset, element: el };
      }
      return closest.element;
    }

    container.addEventListener("dragstart", (e) => {
      const target = e.target && e.target.closest(itemSelector);
      if (!target) return;
      draggingEl = target;
      target.classList.add("is-dragging");
      e.dataTransfer.effectAllowed = "move";
    });

    container.addEventListener("dragend", async () => {
      if (!draggingEl) return;
      draggingEl.classList.remove("is-dragging");
      draggingEl = null;

      if (typeof onDropPersist === "function") {
        try {
          await onDropPersist();
        } catch (e) {
          console.error(e);
          await refreshAll();
        }
      }
    });

    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!draggingEl) return;
      const after = getAfterElement(e.clientY);
      if (after == null) container.appendChild(draggingEl);
      else container.insertBefore(draggingEl, after);
    });
  }

  // ---------------- Refresh ----------------

  async function refreshProductsOnly(forceReload = false) {
    await loadProducts(state.currentCategoryId, { forceReload: Boolean(forceReload) });
    if (state.selectedProductId && !state.productsHasMore && !state.products.some((p) => p.id === state.selectedProductId)) {
      clearProductSelection();
    }
  }

  async function refreshAll() {
    await loadCategories();
    renderCategoriesNav();

    if (state.selectedCategoryId && !state.categories.some((c) => c.id === state.selectedCategoryId)) {
      state.selectedCategoryId = null;
      showDetailsEmpty();
    }

    if (state.mode === "categories") {
      renderCategoriesMainList();
      return;
    }
    if (state.mode === "options") {
      await loadOptionGroups();
      renderAllOptionGroupsLists();
      if (state.selectedOptionGroupId && !state.optionGroups.some((g) => g.id === state.selectedOptionGroupId)) {
        state.selectedOptionGroupId = null;
        state.optionGroupDetails = null;
        state.optionPanel.level = "empty";
        showDetailsEmpty();
      } else if (state.selectedOptionGroupId && state.optionPanel.mode !== "create") {
        await loadOptionGroupDetails(state.selectedOptionGroupId);
        if (state.optionPanel.level !== "empty") {
          showOptionGroupDetails(state.optionGroupDetails, { mode: state.optionPanel.mode });
        }
      }
      return;
    }
    if (state.mode === "auto-add") {
      await loadAutoAddManagement();
      renderAutoAddGroupsList();
      if (state.selectedAutoAddGroupId && !state.autoAddGroups.some((g) => Number(g.id) === Number(state.selectedAutoAddGroupId))) {
        state.selectedAutoAddGroupId = null;
        state.autoAddGroupDetails = null;
        showDetailsEmpty();
      } else if (state.selectedAutoAddGroupId && state.autoAddPanel.mode !== "create") {
        state.autoAddGroupDetails = buildAutoAddGroupDetails(state.selectedAutoAddGroupId);
        if (state.autoAddPanel.level !== "empty") {
          showAutoAddDetails(state.autoAddGroupDetails, { mode: state.autoAddPanel.mode });
        }
      }
      return;
    }
    if (state.mode === "variants") {
      await loadVariantGroups();
      renderVariantGroupsList(variantsGroupsList, variantsGroupsEmpty);
      return;
    }
    if (state.mode === "units") {
      await loadUnitsManagement();
      await loadUnitConversions();
      renderUnitsList();
      if (state.selectedUnitId && !state.units.some((u) => Number(u.id) === Number(state.selectedUnitId))) {
        state.selectedUnitId = null;
        state.unitDetails = null;
        showDetailsEmpty();
      } else if (state.selectedUnitId && state.unitPanel.mode !== "create") {
        await loadUnitDetails(state.selectedUnitId);
        if (state.unitPanel.level !== "empty") {
          showUnitDetails(state.unitDetails, { mode: state.unitPanel.mode });
        }
      }
      return;
    }
    if (state.mode === "products") {
      await refreshProductsOnly(true);
    }
  }

  // ---------------- Events ----------------

  function bindEvents() {
    if (productTabs) {
      productTabs.addEventListener("click", (e) => {
        const closeBtn = e.target.closest("[data-tab-close]");
        if (closeBtn) {
          e.stopPropagation();
          const key = closeBtn.dataset.tabClose;
          if (key) closeTab(key);
          return;
        }
        const tabEl = e.target.closest("[data-tab-key]");
        if (tabEl) {
          const key = tabEl.dataset.tabKey;
          if (key) setActiveTabKey(key);
        }
      });
      productTabs.addEventListener("wheel", (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          productTabs.scrollLeft += e.deltaY;
        }
      }, { passive: false });
    }

    if (categoriesNav) {
      categoriesNav.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-category-id]");
        if (!btn) return;
        const id = Number(btn.dataset.categoryId);
        if (!Number.isFinite(id)) return;

        enterProductsMode(id);
        renderCategoriesNav();
        await refreshProductsOnly();
      });
    }

    if (toolbarText) {
      toolbarText.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-products-category-chip]");
        if (!btn) return;
        const id = Number(btn.dataset.productsCategoryChip);
        if (!Number.isFinite(id) || id <= 0 || id === Number(state.currentCategoryId || 0)) return;

        enterProductsMode(id);
        renderCategoriesNav();
        await refreshProductsOnly();
      });
    }

    if (toolbarIcon) {
      toolbarIcon.addEventListener("click", () => {
        if (!toolbarIcon.classList.contains("products-category-toolbar-menu")) return;
        openCreateSubcategoryModal();
      });
      toolbarIcon.addEventListener("keydown", (event) => {
        if (!toolbarIcon.classList.contains("products-category-toolbar-menu")) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openCreateSubcategoryModal();
      });
    }

    if (productsSearchToggle) {
      productsSearchToggle.addEventListener("click", () => {
        const toolbarState = getProductsToolbarState();
        if (!toolbarState) return;
        if (toolbarState.searchOpen) {
          closeProductsToolbarSearch().catch(console.error);
        } else {
          openProductsToolbarSearch();
        }
      });
    }

    if (productsSearchInput) {
      productsSearchInput.addEventListener("input", handleProductsToolbarSearchInput);
      productsSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeProductsToolbarSearch().catch(console.error);
        }
      });
    }

    if (productsFilterToggle) {
      productsFilterToggle.addEventListener("click", (event) => {
        if (!isProductsToolbarModeVisible()) return;
        event.preventDefault();
        event.stopPropagation();
        state.productsToolbarFilterOpen = !state.productsToolbarFilterOpen;
        syncProductsToolbar();
      });
    }

    if (productsFilterDropdown) {
      productsFilterDropdown.addEventListener("click", (event) => event.stopPropagation());
    }

    if (productsScrollEl) {
      productsScrollEl.addEventListener("scroll", maybeLoadMoreProductsOnScroll, { passive: true });
    }

    if (productsBulkToggleAllInput) {
      productsBulkToggleAllInput.addEventListener("change", async () => {
        productsBulkToggleAllInput.disabled = true;
        try {
          await toggleAllProductCardsInCategory();
        } finally {
          syncProductsBulkFooter();
        }
      });
    }

    if (productsBulkMenuToggleBtn && productsBulkMenu && productsBulkMenuWrap) {
      productsBulkMenuToggleBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const nextOpen = productsBulkMenu.classList.contains("hidden");
        productsBulkMenu.classList.toggle("hidden", !nextOpen);
        productsBulkMenuWrap.classList.toggle("is-open", nextOpen);
      });
    }

    if (productsBulkMenu) {
      productsBulkMenu.addEventListener("click", (event) => event.stopPropagation());
      productsBulkMenu.addEventListener("change", (event) => {
        const input = event.target?.closest?.("input[data-bulk-action]");
        if (!input) return;
        const key = String(input.dataset.bulkAction || "");
        if (!key) return;
        setProductsBulkAction(key, input.checked);
        productsBulkMenu.querySelectorAll("input[data-bulk-action]").forEach((itemInput) => {
          const itemKey = String(itemInput.dataset.bulkAction || "");
          itemInput.checked = Boolean(state.productsBulkActions?.[itemKey]);
        });
        syncProductsBulkActionsUi();
      });
    }

    if (productsBulkCancelBtn) {
      productsBulkCancelBtn.addEventListener("click", () => {
        if (state.productsBulkApplying) return;
        resetProductsBulkActions();
        closeProductsBulkMenu();
        syncProductsBulkFooter();
      });
    }

    if (productsBulkApplyBtn) {
      productsBulkApplyBtn.addEventListener("click", async () => {
        if (state.productsBulkApplying) return;
        const payload = buildProductsBulkPayload();
        if (!Object.keys(payload).length) return;
        const ids = Array.from(state.selectedProductIds).map((id) => Number(id)).filter(Number.isFinite);
        if (!ids.length) return;
        state.productsBulkApplying = true;
        syncProductsBulkActionsUi();
        const skippedNoIngredients = [];
        const failedNames = [];
        try {
          for (const id of ids) {
            const product = state.products.find((item) => Number(item?.id) === id);
            if (!product) {
              failedNames.push(String(id));
              continue;
            }

            if (
              normalizeProductFulfillmentMode(payload.fulfillment_mode) === "made_to_order" &&
              normalizeProductFulfillmentMode(product.fulfillment_mode) !== "made_to_order"
            ) {
              try {
                const ingredientsRes = await apiGetProductIngredients(id);
                const ingredients = Array.isArray(ingredientsRes?.data) ? ingredientsRes.data : [];
                if (!ingredients.length) {
                  skippedNoIngredients.push(product.name || String(id));
                  continue;
                }
              } catch (e) {
                skippedNoIngredients.push(product.name || String(id));
                continue;
              }
            }

            try {
              await api(`/api/prod_products/${id}`, {
                method: "PATCH",
                body: JSON.stringify(payload),
              });
            } catch (e) {
              failedNames.push(product.name || String(id));
              continue;
            }

            applyProductsBulkPayloadToLocalProduct(product, payload);
            syncProductRowAfterBulkPayload(product, payload);
            if (Object.prototype.hasOwnProperty.call(payload, "fulfillment_mode")) {
              syncProductEditorFulfillmentControl(id, payload.fulfillment_mode);
              clearCachedProductDetails(id);
              clearCachedProductView(id);
            }
          }
          syncProductsListEmptyState();
          setCachedCategoryProducts(state.currentCategoryId, {
            products: state.products,
            productsOffset: state.productsOffset,
            productsTotal: state.productsTotal,
            productsHasMore: state.productsHasMore,
            combosInCategory: state.combosInCategory,
          });
          if (skippedNoIngredients.length) {
            const suffix = skippedNoIngredients.length === 1 ? `: ${skippedNoIngredients[0]}` : ` (${skippedNoIngredients.length})`;
            showToast(`У товара не поменялся режим продажи, нужно заполнить состав${suffix}`);
          }
          if (failedNames.length) {
            const suffix = failedNames.length === 1 ? `: ${failedNames[0]}` : ` (${failedNames.length})`;
            showToast(`Не удалось применить действие к товару${suffix}`);
          }
          resetProductsBulkActions();
          closeProductsBulkMenu();
          syncProductsBulkFooter();
        } catch (e) {
          alert("Ошибка массового применения: " + (e.message || "Неизвестная ошибка"));
        } finally {
          state.productsBulkApplying = false;
          syncProductsBulkActionsUi();
        }
      });
    }

    if (addCategoryBtn) {
      addCategoryBtn.addEventListener("click", () => {
        enterCategoriesMode();
        renderCategoriesMainList();
      });
    }

    if (addMainBtn) {
      addMainBtn.addEventListener("click", (e) => {
        if (state.mode === "products") {
          if (addMainWrapper && addMainDropdown) {
            addMainWrapper.classList.toggle("is-open");
            e.stopPropagation();
          }
          return;
        }
        if (state.mode === "categories") return openCategoryEditor({ mode: "create" });
        if (state.mode === "options") return startOptionCreate();
        if (state.mode === "variants") return startVariantCreate();
        if (state.mode === "auto-add") return startAutoAddCreate();
        if (state.mode === "combo-blocks") return startComboBlockCreate();
        if (state.mode === "units") {
          state.selectedUnitId = null;
          state.unitDetails = null;
          state.unitDraft = {
            unit: { title: "", short_title: "", is_active: 1 },
            conversions: [],
          };
          state.unitPanel.mode = "create";
          showUnitDetails(null, { mode: "create" });
        }
      });
    }

    if (addMainDropdown && addMainWrapper) {
      addMainDropdown.addEventListener("click", (e) => {
        const item = e.target.closest("[data-add-action]");
        if (!item) return;
        addMainWrapper.classList.remove("is-open");
        const action = item.getAttribute("data-add-action");
        if (action === "product") openProductModal({ mode: "create" });
        else if (action === "combo") openComboSetCreate();
      });
      document.addEventListener("click", () => {
        addMainWrapper.classList.remove("is-open");
        closeProductsFilterDropdown();
        closeProductsBulkMenu();
      });
      addMainWrapper.addEventListener("click", (e) => e.stopPropagation());
    }

    // left other views
    if (productsAccordion) {
      productsAccordion.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-view]");
        if (!btn) return;
        const view = btn.getAttribute("data-view");
        const leavingProducts = state.mode === "products" && view !== "products";
        if (leavingProducts) {
          suspendProductNavigationIfNeeded();
        }
        if (view === "options") {
          enterOptionsMode();
          loadOptionGroups().then(renderOptionGroupsList);
          return;
        }
        if (view === "variants") {
          enterVariantsMode();
          loadVariantGroups().then(() => {
            renderVariantGroupsList(variantsGroupsList, variantsGroupsEmpty);
          });
          return;
        }
        if (view === "auto-add") {
          enterAutoAddMode();
          return;
        }
        if (view === "units") {
          enterUnitsMode();
          loadUnitsManagement().then(() => {
            renderUnitsList();
            loadUnitConversions();
          });
          return;
        }
        if (view === "combo-blocks") {
          enterComboBlocksMode();
          return;
        }
        if (view === "stock-in") {
          enterStockInMode();
          return;
        }
        if (view === "stock-out") {
          enterStockOutMode();
          return;
        }
        if (view === "stock-movements") {
          enterStockMovementsMode();
          return;
        }
        if (view === "products") {
          enterProductsMode();
          if (!restoreSuspendedProductNavigation()) {
            clearProductSelection();
          }
          return;
        }
        const viewMeta = {
          "allergens":          { title: "Аллергены",  icon: "fa-exclamation-triangle" },
          "diets":              { title: "Типы диет",  icon: "fa-heartbeat" },
          "stock-in":           { title: "Приход",     icon: "fa-plus-square" },
          "stock-out":          { title: "Списания",   icon: "fa-minus-square" },
          "stock-movements":    { title: "История",    icon: "fa-history" },
          "production-plan":    { title: "План",       icon: "fa-clipboard-list" },
          "production-history": { title: "История",    icon: "fa-history" },
        };
        state.mode = view;
        const meta = viewMeta[view];
        setToolbarTitle(meta?.title || view, meta?.icon);
        showView(view);
        clearProductsBulkSelection();
        clearProductSelection();
        syncActiveMenuItems();
      });
    }

    if (closeProductInfoBtn) {
      closeProductInfoBtn.addEventListener("click", () => {
        // Check if we're in edit mode
        if (currentNavigationState?.type === "product-edit") {
          // Cancel editing
          const navState = currentNavigationState;
          if (navState?.onClose) {
            navState.onClose();
          }
          // Remove from editing state
          if (navState?.product?.id && editingProducts.has(navState.product.id)) {
            editingProducts.delete(navState.product.id);
          }
          clearNavigationStack();
          // If editing existing product, show its details
          if (navState?.isEdit && navState?.product) {
            const p = state.products.find(pr => pr.id === navState.product.id);
            if (p) {
              showProductDetails(p);
            }
          }
        } else {
          // Close panel
          clearProductSelection();
        }
      });
    }
    if (sheetCloseBtn) sheetCloseBtn.addEventListener("click", clearProductSelection);
    if (sheetBackdrop) sheetBackdrop.addEventListener("click", clearProductSelection);

    // Выпадающее меню для товара
    if (productMoreBtn && productDropdown) {
      const productDeleteBtn = $("#productDeleteBtn");
      
      // Закрытие меню при клике вне его
      document.addEventListener("click", (e) => {
        if (productDropdown && !productDropdown.contains(e.target) && !productMoreBtn.contains(e.target)) {
          productDropdown.classList.add("hidden");
          productMoreBtn.setAttribute("aria-expanded", "false");
        }
      });

      // Открытие/закрытие меню
      productMoreBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !productDropdown.classList.contains("hidden");
        productDropdown.classList.toggle("hidden", isOpen);
        productMoreBtn.setAttribute("aria-expanded", String(!isOpen));
      });

      // Удаление товара
      if (productDeleteBtn) {
        productDeleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          productDropdown.classList.add("hidden");
          productMoreBtn.setAttribute("aria-expanded", "false");
          confirmProductDelete();
        });
      }
    }

    if (editProductBtn) {
      editProductBtn.addEventListener("click", async () => {
        // Check if we're in edit mode
        if (currentNavigationState?.type === "product-edit") {
          // Save changes
          if (currentNavigationState?.onSave) {
            // Get productId before clearing state
            const productId = currentNavigationState?.product?.id;
            
            try {
              const result = await currentNavigationState.onSave();
              if (result === true) {
                // Save successful - onSave handles navigation and clears navigation stack
                // Clear currentNavigationState since onSave calls clearNavigationStack()
                currentNavigationState = null;
                
                // Remove from editing state if it was stored
                if (productId && editingProducts.has(productId)) {
                  editingProducts.delete(productId);
                }
                
                // Ensure button icon is updated to edit mode (pencil)
                if (editProductBtn) {
                  editProductBtn.innerHTML = '<i class="fas fa-pen"></i>';
                  editProductBtn.title = "Редактировать";
                  editProductBtn.setAttribute("aria-label", "Редактировать");
                }
              } else {
                // Save failed - result is false
                console.warn('Save returned false, check form validation or errors');
              }
            } catch (e) {
              console.error('Error saving product', e);
              alert('Ошибка при сохранении товара: ' + (e.message || 'Неизвестная ошибка'));
            }
          } else {
            console.error('onSave function not found in navigationState');
            alert('Ошибка: функция сохранения не найдена');
          }
        } else {
          // Open editor
          // Если сейчас открыт экран опций/вариантов (и кнопка по какой-то причине видима),
          // редактируем именно активную сущность, а не товар из другого таба.
          if (state.mode === "options" && state.selectedOptionGroupId && state.optionPanel.mode === "view" && state.optionGroupDetails) {
            startOptionEdit();
            return;
          }
          if (state.mode === "variants" && state.selectedVariantGroupId && state.variantPanel.mode === "view" && state.variantGroupDetails) {
            startVariantEdit();
            return;
          }
          if (state.mode === "categories") {
            const cat = state.categories.find((x) => x.id === state.selectedCategoryId);
            if (cat) openCategoryEditor({ mode: "edit", category: cat });
            return;
          }
          const p = state.products.find((x) => x.id === state.selectedProductId);
          if (p) {
            // Check if this product is already being edited
            if (editingProducts.has(p.id)) {
              // Restore editing state
              const editingState = editingProducts.get(p.id);
              pushNavigationState(editingState.navigationState);
              // Restore draft if needed
              if (editingState.draft) {
                // Draft will be restored by openProductModal if needed
              }
            } else {
              // Open new editor
              try {
                await ensureProductIngredientsCached(p.id, p);
              } catch (e) {
                console.warn("Failed to warm product ingredients cache before edit", e);
              }
              openProductModal({ mode: "edit", product: p });
            }
          }
        }
      });
    }

    // Footer buttons
    const footerDeleteBtn = $("#productFooterDeleteBtn");
    const footerEditBtn = $("#productFooterEditBtn");
    const footerMoreBtn = $("#productFooterMoreBtn");
    const footerDeleteEditBtn = $("#productFooterDeleteEditBtn");
    const footerCancelBtn = $("#productFooterCancelBtn");
    const footerSaveBtn = $("#productFooterSaveBtn");
    const footerMoreEditBtn = $("#productFooterMoreEditBtn");

    // View mode buttons
    if (footerDeleteBtn) {
      attachTwoStepButton(footerDeleteBtn, () => {
        // Check current mode and delete accordingly
        if (state.mode === "categories" && state.selectedCategoryId) {
          confirmCategoryDelete();
        } else if (state.mode === "options" && state.selectedOptionGroupId) {
          // Delete option immediately without modal (two-step already confirmed)
          const groupId = state.selectedOptionGroupId;
          (async () => {
            try {
              await apiDeleteOptionGroup(groupId);
              state.optionGroupCache.delete(groupId);
              await loadOptionGroups();
              closeOptionDetails();
            } catch (e) {
              const message = e && e.message ? e.message : "Не удалось удалить опцию.";
              alert(message);
            }
          })();
        } else if (state.mode === "variants" && state.selectedVariantGroupId) {
          // Delete variant group immediately without modal (two-step already confirmed)
          const groupId = state.selectedVariantGroupId;
          (async () => {
            try {
              await apiDeleteVariantGroup(groupId);
              state.variantGroupCache.delete(groupId);
              await loadVariantGroups();
              state.selectedVariantGroupId = null;
              state.variantGroupDetails = null;
              variantGroupInfo?.classList.add("hidden");
              renderVariantGroupsList();
            } catch (e) {
              const message = e && e.message ? e.message : "Не удалось удалить вариант.";
              alert(message);
            }
          })();
        } else if (state.mode === "auto-add" && state.selectedAutoAddGroupId) {
          const groupId = state.selectedAutoAddGroupId;
          (async () => {
            if (!confirm("Удалить условие и все товары в нем?")) return;
            try {
              await apiDeleteAutoAddGroup(groupId);
              editingAutoAdds.delete(groupId);
              if (tabsState.tabs.some((t) => t.key === buildTabKey("auto-add", groupId))) {
                closeTab(buildTabKey("auto-add", groupId));
              }
              await loadAutoAddManagement();
              state.selectedAutoAddGroupId = null;
              state.autoAddGroupDetails = null;
              renderAutoAddGroupsList();
              showDetailsEmpty();
            } catch (e) {
              const message = e && e.message ? e.message : "Не удалось удалить условие.";
              alert(message);
            }
          })();
        } else if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:") && state.comboSetPanel?.mode === "view" && Number.isFinite(state.comboSetPanel?.comboId)) {
          const comboId = state.comboSetPanel.comboId;
          (async () => {
            try {
              await apiDeleteCombo(comboId);
              clearCachedComboSetDetails(comboId);
              clearCachedComboRowPhotos(comboId);
              if (typeof toast !== "undefined") toast("Комбо-набор удалён");
              closeComboSetPanel();
              if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:")) closeTab(tabsState.activeKey);
              await refreshProductsOnly(true);
              showDetailsEmpty();
            } catch (e) {
              console.error("deleteCombo", e);
              if (typeof toast !== "undefined") toast("Не удалось удалить комбо-набор");
            }
          })();
        } else if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:") && state.comboSetPanel?.mode === "view" && Number.isFinite(state.comboSetPanel?.comboId)) {
          const comboId = state.comboSetPanel.comboId;
          (async () => {
            try {
              await apiDeleteCombo(comboId);
              if (typeof toast !== "undefined") toast("Комбо-набор удалён");
              closeComboSetPanel();
              if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:")) closeTab(tabsState.activeKey);
              await refreshProductsOnly(true);
              showDetailsEmpty();
            } catch (e) {
              console.error("deleteCombo", e);
              if (typeof toast !== "undefined") toast("Не удалось удалить комбо-набор");
            }
          })();
        } else if (state.selectedProductId) {
          confirmProductDelete();
        }
      }, "Удалить");
    }

    if (footerEditBtn) {
      footerEditBtn.addEventListener("click", async () => {
        // Check current mode and edit accordingly
        if (state.mode === "categories" && state.selectedCategoryId) {
          const cat = state.categories.find((x) => x.id === state.selectedCategoryId);
          if (cat) {
            openCategoryEditor({ mode: "edit", category: cat });
          }
        } else if (state.mode === "options" && state.selectedOptionGroupId) {
          if (state.optionPanel.mode === "view" && state.optionGroupDetails) {
            startOptionEdit();
          }
        } else if (state.mode === "variants" && state.selectedVariantGroupId) {
          if (state.variantPanel.mode === "view" && state.variantGroupDetails) {
            startVariantEdit();
          }
        } else if (state.mode === "auto-add" && state.selectedAutoAddGroupId) {
          if (state.autoAddPanel.mode === "view" && state.autoAddGroupDetails) {
            startAutoAddEdit();
          }
        } else if (state.mode === "combo-blocks" && state.selectedComboBlockId) {
          if (state.comboPanel.mode === "view") {
            state.comboPanel.mode = "edit";
            showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "edit" });
            showProductFooterEdit();
          }
        } else if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:") && state.comboSetPanel?.comboId && state.comboSetPanel?.mode === "view") {
          state.comboSetPanel.mode = "edit";
          activateComboSetTab();
        } else {
          // Products mode - existing logic
        const p = state.products.find((x) => x.id === state.selectedProductId);
        if (p) {
          if (editingProducts.has(p.id)) {
            const editingState = editingProducts.get(p.id);
            pushNavigationState(editingState.navigationState);
          } else {
            try {
              await ensureProductIngredientsCached(p.id, p);
            } catch (e) {
              console.warn("Failed to warm product ingredients cache before edit", e);
            }
            openProductModal({ mode: "edit", product: p });
            }
          }
        }
      });
    }

    if (footerMoreBtn) {
      // Placeholder for future actions
      footerMoreBtn.addEventListener("click", () => {
        // TODO: Add actions menu
      });
    }

    // Edit mode buttons
    if (footerDeleteEditBtn) {
      attachTwoStepButton(footerDeleteEditBtn, () => {
        if ((state.mode === "stock-in" || state.mode === "stock-out") && state.stockDocDetail) {
          const docId = state.stockDocDetail.id;
          (async () => {
            try {
              await apiDeleteStockDocument(docId);
              state.stockDocDetail = null;
              const tabKey = buildTabKey("stock-doc", docId);
              if (tabsState.tabs.some((t) => t.key === tabKey)) {
                closeTab(tabKey);
              }
              showDetailsEmpty();
              if (state.mode === "stock-in") {
                await loadStockDocuments("in");
                renderStockDocList(stockInList, stockInEmpty, "in");
              } else if (state.mode === "stock-out") {
                await loadStockDocuments("out");
                renderStockDocList(stockOutList, stockOutEmpty, "out");
              }
            } catch (err) {
              alert("Ошибка: " + (err.message || "Не удалось удалить"));
            }
          })();
          return;
        }
        if (state.mode === "auto-add" && state.selectedAutoAddGroupId) {
          const groupId = state.selectedAutoAddGroupId;
          (async () => {
            if (!confirm("Удалить условие и все товары в нем?")) return;
            try {
              await apiDeleteAutoAddGroup(groupId);
              editingAutoAdds.delete(groupId);
              if (tabsState.tabs.some((t) => t.key === buildTabKey("auto-add", groupId))) {
                closeTab(buildTabKey("auto-add", groupId));
              }
              await loadAutoAddManagement();
              state.selectedAutoAddGroupId = null;
              state.autoAddGroupDetails = null;
              renderAutoAddGroupsList();
              showDetailsEmpty();
            } catch (e) {
              const message = e && e.message ? e.message : "Не удалось удалить условие.";
              alert(message);
            }
          })();
          return;
        }
        if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:")) {
          if (Number.isFinite(state.comboSetPanel?.comboId)) {
            const comboId = state.comboSetPanel.comboId;
            (async () => {
              try {
                await apiDeleteCombo(comboId);
                clearCachedComboSetDetails(comboId);
                clearCachedComboRowPhotos(comboId);
                if (typeof toast !== "undefined") toast("Комбо-набор удалён");
                closeComboSetPanel();
                if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:")) {
                  closeTab(tabsState.activeKey);
                }
                await refreshProductsOnly(true);
                showDetailsEmpty();
              } catch (e) {
                console.error("deleteCombo", e);
                if (typeof toast !== "undefined") toast("Не удалось удалить комбо-набор");
              }
            })();
          } else {
            cancelComboSet();
          }
          return;
        }
        if (currentNavigationState?.product?.id) {
          confirmProductDelete();
        }
      }, "Удалить");
    }

    if (footerCancelBtn) {
      attachTwoStepButton(footerCancelBtn, () => {
        // Check if picker is open - priority over product edit
        if (footerCancelBtn.dataset.pickerType === "stock-picker") {
          closeStockPicker();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "option") {
          const closeFn = window._closeOptionPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "product-option-items") {
          const closeFn = window._closeProductOptionItemsPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "product-variant-values") {
          const closeFn = window._closeProductVariantValuesPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "ingredient") {
          const closeFn = window._closeIngredientPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "variant") {
          const closeFn = window._closeVariantPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "auto-add") {
          const closeFn = window._closeAutoAddPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "category") {
          if (window._closeComboSetCategoryPickerFn) {
            window._closeComboSetCategoryPickerFn();
            return;
          }
          const closeFn = window._closeCategoryPickerFn;
          if (closeFn) closeFn();
          return;
        }
        if (footerCancelBtn.dataset.pickerType === "combo") {
          const closeFn = window._closeComboBlockPickerFn;
          if (closeFn) closeFn();
          return;
        }
        // Combo-set tab cancel
        if (tabsState.activeKey && tabsState.activeKey.startsWith("combo-set:")) {
          cancelComboSet();
          return;
        }
        // Combo block edit cancel — сбросить черновик, перезагрузить блок, режим просмотра
        if (state.mode === "combo-blocks" && state.comboPanel.mode === "edit" && state.selectedComboBlockId) {
          (async () => {
            try {
              const r = await apiGetComboBlock(state.selectedComboBlockId);
              if (r?.data) {
                const block = r.data;
                state.comboBlockDraft = { title: block.title, sort_order: block.sort_order ?? 0, min_select: block.min_select ?? 1, max_select: block.max_select ?? 1 };
                state.comboBlockProducts = Array.isArray(block.products)
                  ? block.products.map((p) => ({ product_id: p.product_id, name: p.product_name || p.name, sort_order: p.sort_order ?? 0, is_default: p.is_default ? 1 : 0, photo: p.product_photo || null, price: p.product_price ?? 0, has_variants: p.has_variants ? 1 : 0, has_changeable_composition: p.has_changeable_composition ? 1 : 0 }))
                  : [];
                state.comboPanel.mode = "view";
                showComboBlockDetails({ block: state.comboBlockDraft, products: state.comboBlockProducts }, { mode: "view" });
              }
            } catch (e) {
              console.error("cancelComboBlockEdit", e);
            }
          })();
          return;
        }
        // Combo block create cancel — закрыть таб
        if (state.mode === "combo-blocks" && state.comboPanel.mode === "create") {
          if (state.comboPanel.tabKey) closeTab(state.comboPanel.tabKey);
          return;
        }
        // Variant edit/create cancel
        if (state.mode === "variants" && (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create")) {
          cancelVariantEdit();
          return;
        }
        // Option edit cancel
        if (state.mode === "options" && state.optionPanel.mode === "edit" && state.selectedOptionGroupId) {
          cancelOptionEdit();
          return;
        }
        // Auto-add edit/create cancel
        if (state.mode === "auto-add" && (state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create")) {
          cancelAutoAddEdit();
          return;
        }
        // Category edit cancel
        if (currentNavigationState?.type === "category-edit") {
          if (currentNavigationState?.onClose) {
            currentNavigationState.onClose();
          }
          clearNavigationStack();
          return;
        }
        // Normal product edit cancel
        if (currentNavigationState?.type === "product-edit") {
          if (currentNavigationState?.onClose) {
            currentNavigationState.onClose();
          }
          const navState = currentNavigationState;
          if (navState?.product?.id && editingProducts.has(navState.product.id)) {
            editingProducts.delete(navState.product.id);
          }
          clearNavigationStack();
          if (navState?.isEdit && navState?.product) {
            const p = state.products.find(pr => pr.id === navState.product.id);
            if (p) {
              showProductDetails(p);
            }
          }
        }
      }, "Отменить");
    }

    if (footerSaveBtn) {
      footerSaveBtn.addEventListener("click", async (e) => {
        // ВАЖНО: Пикер категорий комбо — обрабатываем ПЕРВЫМ. stopImmediatePropagation
        // обязателен, иначе closeComboSetCategoryPicker восстановит onclick=saveComboSet
        // и тот же клик вызовет saveComboSet → закроет всю карточку комбо. НЕ МЕНЯТЬ порядок.
        if (footerSaveBtn.dataset.pickerType === "category") {
          if (window._saveComboSetCategoryPickerFn) {
            e.preventDefault();
            e.stopImmediatePropagation();
            window._saveComboSetCategoryPickerFn();
            return;
          }
        }
        if (footerSaveBtn.dataset.pickerType === "option") {
          const saveFn = window._saveOptionPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "product-option-items") {
          const saveFn = window._saveProductOptionItemsPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "product-variant-values") {
          const saveFn = window._saveProductVariantValuesPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "ingredient") {
          const saveFn = window._saveIngredientPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "variant") {
          const saveFn = window._saveVariantPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "auto-add") {
          const saveFn = window._saveAutoAddPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "category") {
          const saveFn = window._saveCategoryPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "combo") {
          const saveFn = window._saveComboBlockPickerFn;
          if (saveFn) {
            await saveFn();
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "stock-doc-post") {
          if (!state.stockDocDetail) return;
          if (!confirm("Провести документ? Остатки будут обновлены.")) return;
          try {
            await apiPostStockDocument(state.stockDocDetail.id);
            await openStockDocDetail(state.stockDocDetail.id);
            if (state.mode === "stock-in") {
              await loadStockDocuments("in");
              renderStockDocList(stockInList, stockInEmpty, "in");
            } else if (state.mode === "stock-out") {
              await loadStockDocuments("out");
              renderStockDocList(stockOutList, stockOutEmpty, "out");
            }
          } catch (err) {
            alert("Ошибка: " + (err.message || "Не удалось провести"));
          }
          return;
        }
        if (footerSaveBtn.dataset.pickerType === "stock-picker") {
          await saveStockPickerSelection();
          return;
        }
        // Combo block edit/create save
        if (state.mode === "combo-blocks" && (state.comboPanel.mode === "edit" || state.comboPanel.mode === "create")) {
          try {
            await saveComboBlock();
          } catch (e) {
            console.error("Error saving combo block", e);
            alert("Ошибка при сохранении блока: " + (e && e.message ? e.message : "Неизвестная ошибка"));
          }
          return;
        }
        // Variant edit/create save
        if (state.mode === "variants" && (state.variantPanel.mode === "edit" || state.variantPanel.mode === "create")) {
          try {
            await saveVariantGroup();
          } catch (e) {
            console.error('Error saving variant', e);
            const message = e && e.message ? e.message : 'Ошибка при сохранении варианта';
            alert(message);
          }
          return;
        }
        // Option edit/create save
        if (state.mode === "options" && (state.optionPanel.mode === "edit" || state.optionPanel.mode === "create")) {
          try {
            await saveOptionGroup();
          } catch (e) {
            console.error('Error saving option', e);
            alert('Ошибка при сохранении опции: ' + (e.message || 'Неизвестная ошибка'));
          }
          return;
        }
        // Auto-add edit/create save
        if (state.mode === "auto-add" && (state.autoAddPanel.mode === "edit" || state.autoAddPanel.mode === "create")) {
          try {
            await saveAutoAddGroup();
          } catch (e) {
            console.error("Error saving auto-add", e);
            alert("Ошибка при сохранении автодобавления: " + (e.message || "Неизвестная ошибка"));
          }
          return;
        }
        // Category edit save
        if (currentNavigationState?.type === "category-edit" && currentNavigationState?.onSave) {
          try {
            const navState = currentNavigationState;
            const wasEdit = navState.category && navState.category.id;
            const result = await currentNavigationState.onSave();
            if (result === true) {
              clearNavigationStack();
              // After saving, show category details (tab replacement is handled in onSave)
              const savedCategory = navState.category;
              if (savedCategory && savedCategory.id) {
                const updatedCat = state.categories.find(c => c.id === savedCategory.id);
                if (updatedCat) {
                  showCategoryDetails(updatedCat);
                }
              }
            }
          } catch (e) {
            console.error('Error saving category', e);
            alert('Ошибка при сохранении категории: ' + (e.message || 'Неизвестная ошибка'));
          }
          return;
        }
        // Normal product edit save
        if (currentNavigationState?.type === "product-edit" && currentNavigationState?.onSave) {
          const productId = currentNavigationState?.product?.id;
          try {
            const result = await currentNavigationState.onSave();
            if (result === true) {
              currentNavigationState = null;
              if (productId && editingProducts.has(productId)) {
                editingProducts.delete(productId);
              }
              if (editProductBtn) {
                editProductBtn.innerHTML = '<i class="fas fa-pen"></i>';
                editProductBtn.title = "Редактировать";
                editProductBtn.setAttribute("aria-label", "Редактировать");
              }
            }
          } catch (e) {
            console.error('Error saving product', e);
            alert('Ошибка при сохранении товара: ' + (e.message || 'Неизвестная ошибка'));
          }
        }
      });
    }

    if (footerMoreEditBtn) {
      footerMoreEditBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const isProductEdit = currentNavigationState?.type === "product-edit";
        const recalc = window.__productEditorRecalc;
        if (!isProductEdit || !recalc) return;

        const closeDropdown = () => {
          const existing = document.getElementById("productFooterMoreDropdown");
          if (existing) existing.remove();
          document.removeEventListener("click", closeDropdown);
          document.removeEventListener("touchstart", closeDropdown);
        };

        const existing = document.getElementById("productFooterMoreDropdown");
        if (existing) {
          closeDropdown();
          return;
        }

        const dropdown = document.createElement("div");
        dropdown.id = "productFooterMoreDropdown";
        dropdown.className = "product-footer-more-dropdown";
        dropdown.innerHTML = `
          <button type="button" class="product-footer-more-dropdown-item" data-action="recalc-cost">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            <span>Пересчитать себестоимость</span>
          </button>
          <button type="button" class="product-footer-more-dropdown-item" data-action="recalc-price">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            <span>Пересчитать стоимость</span>
          </button>
          <button type="button" class="product-footer-more-dropdown-item" data-action="recalc-weight">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            <span>Пересчет веса</span>
          </button>
          <button type="button" class="product-footer-more-dropdown-item" data-action="recalc-composition">
            <i class="fas fa-sync-alt" aria-hidden="true"></i>
            <span>Пересчитать в составе</span>
          </button>
        `;
        function positionDropdown() {
          const rect = footerMoreEditBtn.getBoundingClientRect();
          const dropdownRect = dropdown.getBoundingClientRect();
          let left = rect.right - dropdownRect.width;
          left = Math.max(8, Math.min(left, window.innerWidth - dropdownRect.width - 8));
          dropdown.style.left = `${left}px`;
          dropdown.style.top = `${rect.top - dropdownRect.height - 8}px`;
        }

        dropdown.querySelector("[data-action=recalc-cost]").addEventListener("click", () => {
          if (window.__productEditorRecalc?.recalcCost) window.__productEditorRecalc.recalcCost();
          closeDropdown();
        });
        dropdown.querySelector("[data-action=recalc-price]").addEventListener("click", () => {
          if (window.__productEditorRecalc?.recalcPrice) window.__productEditorRecalc.recalcPrice();
          closeDropdown();
        });
        dropdown.querySelector("[data-action=recalc-weight]").addEventListener("click", () => {
          if (window.__productEditorRecalc?.recalcWeight) window.__productEditorRecalc.recalcWeight();
          closeDropdown();
        });
        dropdown.querySelector("[data-action=recalc-composition]").addEventListener("click", () => {
          if (window.__productEditorRecalc?.recalcAllFromComposition) window.__productEditorRecalc.recalcAllFromComposition();
          closeDropdown();
        });

        document.body.appendChild(dropdown);
        positionDropdown();

        requestAnimationFrame(() => {
          document.addEventListener("click", closeDropdown);
          document.addEventListener("touchstart", closeDropdown);
        });
      });
    }

    if (optionItemsAddBtn) {
      optionItemsAddBtn.addEventListener("click", () => {
        if (state.optionPanel.mode === "create" || state.selectedOptionGroupId) {
          openOptionPicker("items");
        }
      });
    }

    if (optionAssignmentsAddBtn) {
      optionAssignmentsAddBtn.addEventListener("click", () => {
        if (state.optionPanel.mode === "create" || state.selectedOptionGroupId) {
          openOptionPicker("assignments");
        }
      });
    }

    if (variantItemsAddBtn) {
      variantItemsAddBtn.addEventListener("click", () => {
        if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit" || state.selectedVariantGroupId) {
          if (!state.variantDraft) state.variantDraft = { group: { values: [] }, tiers: [], assignments: [] };
          if (!state.variantDraft.group) state.variantDraft.group = { values: [] };
          if (!state.variantDraft.group.values) state.variantDraft.group.values = [];
          if (!state.variantDraft.tiers) state.variantDraft.tiers = [];
          
          const wasEmpty = state.variantDraft.group.values.length === 0;
          const newIndex = state.variantDraft.group.values.length;
          state.variantDraft.group.values.push("");
          state.variantDraft.tiers.push({
            sort_order: newIndex,
            discount_type: "percent",
            discount_value: 0,
          });
          
          // Если это первый вариант - автоматически устанавливаем его как дефолтный
          if (wasEmpty) {
            state.variantDraft.group.default_value_index = 0;
            if (variantGroupDefaultValueIndexInput) {
              variantGroupDefaultValueIndexInput.value = "0";
            }
          }
          
          renderVariantItems(getVariantItemsSource());
        }
      });
    }

    if (variantAssignmentsAddBtn) {
      variantAssignmentsAddBtn.addEventListener("click", () => {
        if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit" || state.selectedVariantGroupId) {
          openVariantPicker("assignments");
        }
      });
    }

    if (autoAddItemsAddBtn) {
      autoAddItemsAddBtn.addEventListener("click", () => {
        if (state.autoAddPanel.mode === "create" || state.autoAddPanel.mode === "edit") {
          openAutoAddPicker();
        }
      });
    }

    if (comboBlockProductsAddBtn) {
      comboBlockProductsAddBtn.addEventListener("click", () => {
        if (state.comboPanel.mode === "create" || state.comboPanel.mode === "edit" || state.selectedComboBlockId) {
          openComboBlockProductPicker();
        }
      });
    }
    const comboSetBlocksAddBtn = document.getElementById("comboSetBlocksAddBtn");
    if (comboSetBlocksAddBtn) {
      comboSetBlocksAddBtn.addEventListener("click", () => {
        if (state.comboSetPanel) openComboSetBlockPicker();
      });
    }
    const comboSetDiscountEl = document.getElementById("comboSetDiscount");
    if (comboSetDiscountEl) {
      comboSetDiscountEl.addEventListener("input", () => { if (typeof refreshComboSetBlockCardPrices === "function") refreshComboSetBlockCardPrices(); });
      comboSetDiscountEl.addEventListener("change", () => { if (typeof refreshComboSetBlockCardPrices === "function") refreshComboSetBlockCardPrices(); });
    }
    const comboSetAddPhotosBtn = document.getElementById("comboSetAddPhotosBtn");
    const comboSetPhotosInput = document.getElementById("comboSetPhotosInput");
    const comboSetPhotoMainContainer = document.getElementById("comboSetPhotoMainContainer");
    const comboSetPhotoPrev = document.getElementById("comboSetPhotoPrev");
    const comboSetPhotoNext = document.getElementById("comboSetPhotoNext");
    const comboSetInfoPanel = document.getElementById("comboSetInfo");
    if (comboSetAddPhotosBtn && comboSetPhotosInput) {
      comboSetAddPhotosBtn.addEventListener("click", () => comboSetPhotosInput.click());
      comboSetPhotosInput.addEventListener("change", async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = "";
        if (!files.length || !state.comboSetPanel) return;
        await addComboSetFilesAndUploadNow(files);
        if (document.querySelector(".product-photo-grid-modal-overlay[data-combo-photo-modal='1']")) {
          openComboSetPhotoGridModal();
        }
      });
    }
    if (comboSetPhotoMainContainer) {
      comboSetPhotoMainContainer.addEventListener("dragover", (e) => { e.preventDefault(); e.currentTarget.classList.add("drag-over"); });
      comboSetPhotoMainContainer.addEventListener("dragleave", (e) => { e.currentTarget.classList.remove("drag-over"); });
      comboSetPhotoMainContainer.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("drag-over");
        const files = await extractComboSetImagesFromDataTransfer(e.dataTransfer);
        if (!files.length || !state.comboSetPanel) return;
        await addComboSetFilesAndUploadNow(files);
        if (document.querySelector(".product-photo-grid-modal-overlay[data-combo-photo-modal='1']")) {
          openComboSetPhotoGridModal();
        }
      });
      comboSetPhotoMainContainer.addEventListener("click", (e) => {
        if (!state.comboSetPanel) return;
        if (e.target.closest("#comboSetPhotoPrev, #comboSetPhotoNext, [data-combo-set-dot]")) return;
        openComboSetPhotoGridModal();
      });
    }
    if (comboSetInfoPanel) {
      comboSetInfoPanel.addEventListener("click", (e) => {
        if (!state.comboSetPanel) return;
        const n = (state.comboSetPanel.photos || []).length;
        if (e.target.closest("#comboSetPhotoPrev")) {
          if (n > 1) { state.comboSetPanel.activePhotoIdx = (state.comboSetPanel.activePhotoIdx - 1 + n) % n; renderComboSetPhotos(); }
          return;
        }
        if (e.target.closest("#comboSetPhotoNext")) {
          if (n > 1) { state.comboSetPanel.activePhotoIdx = (state.comboSetPanel.activePhotoIdx + 1) % n; renderComboSetPhotos(); }
          return;
        }
        const t = e.target.closest("[data-combo-set-thumb]");
        if (t) { const idx = Number(t.getAttribute("data-combo-set-thumb")); if (Number.isFinite(idx)) { state.comboSetPanel.activePhotoIdx = idx; renderComboSetPhotos(); } return; }
        const d = e.target.closest("[data-combo-set-dot]");
        if (d) { const idx = Number(d.getAttribute("data-combo-set-dot")); if (Number.isFinite(idx)) { state.comboSetPanel.activePhotoIdx = idx; renderComboSetPhotos(); } }
      });
    }
    if (comboBlockPickerSearch) {
      comboBlockPickerSearch.addEventListener("input", () => {
        state.comboPanel.pickerQuery = comboBlockPickerSearch.value || "";
        refreshComboBlockPickerProducts().then(() => renderComboBlockPickerList());
      });
    }
    if (comboBlockPickerSelectAll) {
      comboBlockPickerSelectAll.addEventListener("click", () => {
        const products = state.comboPanel.pickerProducts || [];
        const ids = products.map((p) => Number(p.id)).filter(Number.isFinite);
        const allSelected = ids.length > 0 && ids.every((id) => state.comboPanel.pickerSelection.has(id));
        if (allSelected) {
          ids.forEach((id) => state.comboPanel.pickerSelection.delete(id));
        } else {
          ids.forEach((id) => state.comboPanel.pickerSelection.add(id));
        }
        renderComboBlockPickerList();
      });
    }

    if (variantGroupForm) {
      variantGroupForm.addEventListener("input", () => {
        if (!state.variantDraft) state.variantDraft = { group: {}, tiers: [], assignments: [] };
        const values = Array.isArray(state.variantDraft.group?.values) ? state.variantDraft.group.values : [];
        state.variantDraft.group = { ...getVariantGroupFormValues(), values };
      });
      variantGroupForm.addEventListener("change", () => {
        if (!state.variantDraft) state.variantDraft = { group: {}, tiers: [], assignments: [] };
        const values = Array.isArray(state.variantDraft.group?.values) ? state.variantDraft.group.values : [];
        state.variantDraft.group = { ...getVariantGroupFormValues(), values };
      });
    }

    if (optionGroupForm) {
      optionGroupForm.addEventListener("input", () => {
        syncOptionDraftGroupFromForm();
        renderOptionHeader();
      });
      optionGroupForm.addEventListener("change", () => {
        syncOptionDraftGroupFromForm();
        renderOptionHeader();
      });
    }

    if (autoAddGroupForm) {
      autoAddGroupForm.addEventListener("input", () => {
        syncAutoAddDraftGroupFromForm();
        persistAutoAddEditState();
        renderAutoAddHeader();
      });
      autoAddGroupForm.addEventListener("change", () => {
        syncAutoAddDraftGroupFromForm();
        persistAutoAddEditState();
        renderAutoAddHeader();
      });
    }

    if (optionGroupSelectionInput) {
      optionGroupSelectionInput.addEventListener("change", () => {
        syncOptionDraftGroupFromForm();
        updateOptionGroupSelectionUi();
        // show qty controls immediately for selection type switch
        renderOptionItems(getOptionItemsSource());
        renderOptionHeader();
      });
    }

    if (optionPickerSearch) {
      optionPickerSearch.addEventListener("input", async () => {
        // Check if we're in variant mode
        if (state.variantPanel.level === "picker") {
          state.variantPanel.pickerQuery = optionPickerSearch.value;
          await refreshVariantPickerProducts();
          return;
        }
        // Options mode
        state.optionPanel.pickerQuery = optionPickerSearch.value;
        await refreshOptionPickerProducts();
      });
    }

    if (optionPickerSelectAll) {
      optionPickerSelectAll.addEventListener("change", () => {
        // Check if we're in variant mode
        if (state.variantPanel.level === "picker") {
          const products = state.variantPanel.pickerProducts || [];
          const ids = products.map((product) => product.id);
          const selectedCount = ids.filter((id) => state.variantPanel.pickerSelection.has(id)).length;
          const allSelected = ids.length > 0 && selectedCount === ids.length;
          if (allSelected) {
            ids.forEach((id) => state.variantPanel.pickerSelection.delete(id));
          } else {
            ids.forEach((id) => state.variantPanel.pickerSelection.add(id));
          }
          renderVariantPickerList();
          renderVariantHeader();
          return;
        }
        // Options mode
        const products = state.optionPanel.pickerProducts || [];
        const ids = products.map((product) => product.id);
        const selectedCount = ids.filter((id) => state.optionPanel.pickerSelection.has(id)).length;
        const allSelected = ids.length > 0 && selectedCount === ids.length;
        if (allSelected) {
          ids.forEach((id) => state.optionPanel.pickerSelection.delete(id));
        } else {
          ids.forEach((id) => state.optionPanel.pickerSelection.add(id));
        }
        renderOptionPickerList();
        renderOptionHeader();
      });
    }

    if (autoAddPickerSearch) {
      autoAddPickerSearch.addEventListener("input", async () => {
        state.autoAddPanel.pickerQuery = autoAddPickerSearch.value;
        await refreshAutoAddPickerProducts();
      });
    }

    if (autoAddPickerSelectAll) {
      autoAddPickerSelectAll.addEventListener("change", () => {
        const products = state.autoAddPanel.pickerProducts || [];
        const ids = products.map((product) => product.id);
        const selectedCount = ids.filter((id) => state.autoAddPanel.pickerSelection.has(id)).length;
        const allSelected = ids.length > 0 && selectedCount === ids.length;
        if (allSelected) {
          ids.forEach((id) => state.autoAddPanel.pickerSelection.delete(id));
        } else {
          ids.forEach((id) => state.autoAddPanel.pickerSelection.add(id));
        }
        renderAutoAddPickerList();
        renderAutoAddHeader();
      });
    }

    if (optionHeaderPrimaryBtn) {
      optionHeaderPrimaryBtn.addEventListener("click", async () => {
        // Check if we're in variant mode
        if (state.variantPanel.level === "picker") {
          await applyVariantPickerSelection();
          return;
        }
        if (state.variantPanel.mode === "view") {
          startVariantEdit();
          return;
        }
        if (state.variantPanel.mode === "create" || state.variantPanel.mode === "edit") {
          await saveVariantGroup();
          return;
        }
        // Options mode
        if (state.optionPanel.level === "picker") {
          await applyOptionPickerSelection();
          return;
        }
        if (state.optionPanel.mode === "view") {
          startOptionEdit();
          return;
        }
        await saveOptionGroup();
      });
    }

    if (optionHeaderBackBtn) {
      optionHeaderBackBtn.addEventListener("click", () => {
        // Check if we're in variant mode
        if (state.variantPanel.level === "picker") {
          state.variantPanel.level = "group";
          renderVariantGroupLevel();
          return;
        }
        // Options mode
        if (state.optionPanel.level === "picker") {
          closeOptionPicker();
          return;
        }
        closeOptionDetails();
      });
    }

    if (optionHeaderDeleteBtn) {
      optionHeaderDeleteBtn.addEventListener("click", () => {
        // Check if we're in variant mode
        if (state.variantPanel.mode === "edit") {
          // TODO: confirmVariantGroupDelete - implement later
          return;
        }
        // Options mode
        if (state.optionPanel.mode !== "edit") return;
        confirmOptionGroupDelete();
      });
    }

    if (optionHeaderCloseBtn) {
      optionHeaderCloseBtn.addEventListener("click", () => {
        // Check if we're in variant mode
        if (state.variantPanel.level === "picker") {
          state.variantPanel.level = "group";
          renderVariantGroupLevel();
          return;
        }
        if (state.variantPanel.mode !== "view") {
          cancelVariantEdit();
          return;
        }
        // Options mode
        if (state.optionPanel.level === "picker") {
          closeOptionPicker();
          return;
        }
        if (state.optionPanel.mode !== "view") {
          cancelOptionEdit();
          return;
        }
        closeOptionDetails();
      });
    }

    // Unit handlers
    if (unitConversionsAddBtn) {
      unitConversionsAddBtn.addEventListener("click", () => {
        if (state.unitPanel.mode === "create" || state.unitPanel.mode === "edit") {
          openUnitPicker();
        }
      });
    }

    if (unitPickerSearch) {
      unitPickerSearch.addEventListener("input", async () => {
        state.unitPanel.pickerQuery = unitPickerSearch.value;
        await refreshUnitPickerList();
      });
    }

    if (unitForm) {
      unitForm.addEventListener("input", () => {
        if (state.unitPanel.mode === "create" || state.unitPanel.mode === "edit") {
          syncUnitDraftFromForm();
        }
      });
      unitForm.addEventListener("change", () => {
        if (state.unitPanel.mode === "create" || state.unitPanel.mode === "edit") {
          syncUnitDraftFromForm();
        }
      });
    }

    // Footer button handlers for units
    const unitFooterSaveBtn = $("#productFooterSaveBtn");
    const unitFooterCancelBtn = $("#productFooterCancelBtn");
    const unitFooterDeleteBtn = $("#productFooterDeleteBtn");
    const unitFooterEditBtn = $("#productFooterEditBtn");
    const unitFooterDeleteEditBtn = $("#productFooterDeleteEditBtn");

    if (unitFooterSaveBtn) {
      const originalSaveHandler = unitFooterSaveBtn.onclick;
      unitFooterSaveBtn.addEventListener("click", async (e) => {
        if (unitFooterSaveBtn.dataset.pickerType === "unit") {
          if (window._saveUnitPickerFn) {
            await window._saveUnitPickerFn();
          }
          return;
        }
        if (state.mode === "units" && (state.unitPanel.mode === "create" || state.unitPanel.mode === "edit")) {
          e.preventDefault();
          e.stopPropagation();
          await saveUnit();
          return;
        }
        if (originalSaveHandler) {
          originalSaveHandler.call(unitFooterSaveBtn, e);
        }
      });
    }

    if (unitFooterCancelBtn) {
      const originalCancelHandler = unitFooterCancelBtn.onclick;
      // Attach two-step confirmation for cancel button when in units mode
      attachTwoStepButton(unitFooterCancelBtn, () => {
        if (unitFooterCancelBtn.dataset.pickerType === "unit") {
          if (window._closeUnitPickerFn) {
            window._closeUnitPickerFn();
          }
          return;
        }
        if (state.mode === "units" && (state.unitPanel.mode === "create" || state.unitPanel.mode === "edit")) {
          cancelUnitEdit();
          return;
        }
        if (originalCancelHandler) {
          originalCancelHandler.call(unitFooterCancelBtn, new Event("click"));
        }
      }, "Отменить");
    }

    if (unitFooterEditBtn) {
      unitFooterEditBtn.addEventListener("click", () => {
        if (state.mode === "units" && state.unitPanel.mode === "view" && state.selectedUnitId) {
          state.unitPanel.mode = "edit";
          if (!state.unitPanel.snapshotData && state.unitDetails) {
            state.unitPanel.snapshotData = JSON.parse(JSON.stringify(state.unitDetails));
          }
          if (!state.unitDraft && state.unitDetails) {
            state.unitDraft = {
              unit: { ...state.unitDetails.unit },
              conversions: state.unitDetails.conversions ? state.unitDetails.conversions.map(c => ({ ...c })) : [],
            };
          }
          showUnitDetails(state.unitDetails, { mode: "edit" });
        }
      });
    }

    if (unitFooterDeleteBtn || unitFooterDeleteEditBtn) {
      const deleteHandler = async () => {
        if (state.mode === "units" && state.selectedUnitId) {
          try {
            await apiDeleteUnit(state.selectedUnitId);
            // Закрываем таб, если он был открыт
            if (state.unitPanel.tabKey) {
              closeTab(state.unitPanel.tabKey);
            }
            state.selectedUnitId = null;
            state.unitDetails = null;
            state.unitPanel.tabKey = null;
            await loadUnitsManagement();
            await loadUnitConversions();
            renderUnitsList();
            showDetailsEmpty();
          } catch (e) {
            console.error("Failed to delete unit", e);
            alert("Ошибка при удалении единицы измерения");
          }
        }
      };
      if (unitFooterDeleteBtn) {
        attachTwoStepButton(unitFooterDeleteBtn, deleteHandler, "Подтвердить удаление");
      }
      if (unitFooterDeleteEditBtn) {
        attachTwoStepButton(unitFooterDeleteEditBtn, deleteHandler, "Подтвердить удаление");
      }
    }

    // Add unit button handler
    if (addMainBtn) {
      const originalAddHandler = addMainBtn.onclick;
      addMainBtn.addEventListener("click", () => {
        if (state.mode === "stock-in") {
          createNewStockDocument("in");
          return;
        }
        if (state.mode === "stock-out") {
          createNewStockDocument("out");
          return;
        }
        if (state.mode === "units") {
          state.selectedUnitId = null;
          state.unitDetails = null;
          state.unitDraft = {
            unit: { title: "", short_title: "", is_active: 1 },
            conversions: [],
          };
          state.unitPanel.mode = "create";
          
          // Create tab with temporary ID for new unit
          const tabId = `new-unit-${Date.now()}`;
          ensureTab({
            type: "unit",
            id: tabId,
            title: "Новая единица измерения",
            onActivate: () => {
              showUnitDetails(null, { mode: "create" });
              showProductFooterEdit();
            },
            activate: true,
          });
          
          // Store tab key in state for later replacement
          state.unitPanel.tabKey = buildTabKey("unit", tabId);
          
          showUnitDetails(null, { mode: "create" });
          return;
        }
        if (originalAddHandler) {
          originalAddHandler.call(addMainBtn);
        }
      });
    }

    window.addEventListener("resize", () => {
      refreshOpenAccordions();
      const isMobile = window.matchMedia("(max-width: 768px)").matches;
      if (!isMobile && detailsDesktopHost) {
        if (productInfo && productInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(productInfo);
        }
        if (categoryInfo && categoryInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(categoryInfo);
        }
        if (optionGroupInfo && optionGroupInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(optionGroupInfo);
        }
        if (autoAddGroupInfo && autoAddGroupInfo.parentElement !== detailsDesktopHost) {
          detailsDesktopHost.appendChild(autoAddGroupInfo);
        }
        closeSheet();
      }
    });
  }

  // ---------------- Init ----------------

  // =============================================
  // STOCK API
  // =============================================
  async function apiGetStockDocuments(params = {}) {
    const qs = new URLSearchParams();
    if (params.type) qs.set("type", params.type);
    if (params.status) qs.set("status", params.status);
    const q = qs.toString();
    return api(`/api/admin/stock/documents${q ? "?" + q : ""}`);
  }

  async function apiGetStockDocument(id) {
    return api(`/api/admin/stock/documents/${id}`);
  }

  async function apiCreateStockDocument(payload) {
    return api("/api/admin/stock/documents", { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiUpdateStockDocument(id, payload) {
    return api(`/api/admin/stock/documents/${id}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async function apiDeleteStockDocument(id) {
    return api(`/api/admin/stock/documents/${id}`, { method: "DELETE" });
  }

  async function apiAddStockItem(docId, payload) {
    return api(`/api/admin/stock/documents/${docId}/items`, { method: "POST", body: JSON.stringify(payload) });
  }

  async function apiUpdateStockItem(docId, itemId, payload) {
    return api(`/api/admin/stock/documents/${docId}/items/${itemId}`, { method: "PUT", body: JSON.stringify(payload) });
  }

  async function apiDeleteStockItem(docId, itemId) {
    return api(`/api/admin/stock/documents/${docId}/items/${itemId}`, { method: "DELETE" });
  }

  async function apiPostStockDocument(id) {
    return api(`/api/admin/stock/documents/${id}/post`, { method: "POST" });
  }

  // =============================================
  // STOCK MODES
  // =============================================
  async function enterStockInMode() {
    state.mode = "stock-in";
    clearProductsBulkSelection();
    setToolbarTitle("Приход", "fa-plus-square");
    showView("stock-in");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadStockDocuments("in");
    renderStockDocList(stockInList, stockInEmpty, "in");
  }

  async function enterStockOutMode() {
    state.mode = "stock-out";
    clearProductsBulkSelection();
    setToolbarTitle("Списания", "fa-minus-square");
    showView("stock-out");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadStockDocuments("out");
    renderStockDocList(stockOutList, stockOutEmpty, "out");
  }

  async function enterStockMovementsMode() {
    state.mode = "stock-movements";
    clearProductsBulkSelection();
    setToolbarTitle("История", "fa-history");
    showView("stock-movements");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    syncProductsToolbar();
    await loadStockDocuments(); // все типы
    renderStockDocList(stockMovementsList, stockMovementsEmpty);
  }

  async function loadStockDocuments(type) {
    try {
      const params = {};
      if (type) params.type = type;
      const res = await apiGetStockDocuments(params);
      state.stockDocuments = Array.isArray(res.data) ? res.data : [];
    } catch (e) {
      console.error("loadStockDocuments error:", e);
      state.stockDocuments = [];
    }
  }

  // =============================================
  // STOCK RENDER
  // =============================================
  function formatStockDate(dateStr) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(2);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}.${mm}.${yy} ${hh}:${mi}`;
  }

  function getStockDocTypeMeta(type) {
    if (type === "in") {
      return { icon: "fa-plus-square", label: "Приход" };
    }
    if (type === "order") {
      return { icon: "fa-receipt", label: "Заказ" };
    }
    return { icon: "fa-minus-square", label: "Списание" };
  }

  function formatStockMoney(value) {
    return `${(Number(value) || 0).toFixed(0)} ₽`;
  }

  function formatStockInputValue(value, { emptyZero = false } = {}) {
    if (value == null || value === "") return "";
    const n = Number(value);
    if (!Number.isFinite(n)) return "";
    if (emptyZero && n === 0) return "";
    if (Number.isInteger(n)) return String(n);
    return String(n).replace(/\.?0+$/, "");
  }

  function getStockProductBaseUnitId(item) {
    const id = Number(item?.product_base_unit_id || item?.base_unit_id || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function getStockProductPrimaryUnitId(item) {
    const id = Number(item?.product_unit_id || item?.unit_id || 0);
    return Number.isFinite(id) && id > 0 ? id : 0;
  }

  function getAllowedStockUnitsForItem(item) {
    const allUnits = Array.isArray(state.units) ? state.units : [];
    if (!allUnits.length) return [];

    const currentUnitId = Number(item?.unit_id || 0);
    const baseUnitId = getStockProductBaseUnitId(item);
    const primaryUnitId = getStockProductPrimaryUnitId(item);
    const anchorUnitId = baseUnitId || primaryUnitId || (Number.isFinite(currentUnitId) && currentUnitId > 0 ? currentUnitId : 0);

    if (!anchorUnitId) return allUnits.slice();

    const allowedIds = new Set();
    if (baseUnitId) allowedIds.add(baseUnitId);
    if (primaryUnitId) allowedIds.add(primaryUnitId);
    if (Number.isFinite(currentUnitId) && currentUnitId > 0) allowedIds.add(currentUnitId);

    allUnits.forEach((unit) => {
      const unitId = Number(unit?.id || 0);
      if (!unitId || allowedIds.has(unitId)) return;
      const toAnchor = getConversionFactor(unitId, anchorUnitId);
      const fromAnchor = getConversionFactor(anchorUnitId, unitId);
      if ((toAnchor != null && toAnchor > 0) || (fromAnchor != null && fromAnchor > 0)) {
        allowedIds.add(unitId);
      }
    });

    const byId = new Map(allUnits.map((u) => [Number(u.id), u]));
    return [...allowedIds]
      .map((id) => byId.get(Number(id)))
      .filter(Boolean)
      .sort((a, b) => (Number(a.sort_order || 0) - Number(b.sort_order || 0)) || (Number(a.id || 0) - Number(b.id || 0)));
  }

  function buildStockUnitOptions(item) {
    const optionsUnits = getAllowedStockUnitsForItem(item);
    const selectedUnitId = Number(item?.unit_id || 0);
    if (!optionsUnits.length) {
      return '<option value="">—</option>';
    }
    return optionsUnits
      .map((u) => {
        const unitId = Number(u.id || 0);
        const isSelected = Number.isFinite(selectedUnitId) && selectedUnitId > 0 && unitId === selectedUnitId;
        const label = u.short_title || u.title || u.code || "";
        return `<option value="${unitId}" ${isSelected ? "selected" : ""}>${escapeHtml(label)}</option>`;
      })
      .join("");
  }

  function getStockNormValue(record) {
    const n = Number(record?.product_base_qty ?? record?.base_qty ?? 0);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function getStockNormLabel(record) {
    const norm = getStockNormValue(record);
    if (!norm) return "";
    const baseUnitId = getStockProductBaseUnitId(record) || getStockProductPrimaryUnitId(record);
    const unit = (state.units || []).find((u) => Number(u.id) === Number(baseUnitId));
    const unitLabel = unit ? (unit.short_title || unit.title || unit.code || "") : "";
    const normText = formatStockInputValue(norm);
    return unitLabel ? `${normText} ${unitLabel}` : normText;
  }

  function roundStockPrice(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
  }

  function getStockLineTotals(qty, costPrice, salePrice, purchasePrice = null, purchaseTotal = null) {
    const q = Number(qty || 0);
    const c = Number(costPrice || 0);
    const s = Number(salePrice || 0);
    const p = purchasePrice == null || purchasePrice === "" ? Number.NaN : Number(purchasePrice);
    const t = purchaseTotal == null || purchaseTotal === "" ? Number.NaN : Number(purchaseTotal);
    const safeQty = Number.isFinite(q) && q > 0 ? q : 0;
    const safeCost = Number.isFinite(c) ? c : 0;
    const safeSale = Number.isFinite(s) ? s : 0;
    const safePurchase = Number.isFinite(p) ? p : null;
    const safeSpent = Number.isFinite(t)
      ? roundStockPrice(t)
      : (Number.isFinite(safePurchase) && safeQty > 0 ? roundStockPrice(safeQty * safePurchase) : null);
    return {
      total_cost: roundStockPrice(safeQty * safeCost),
      total_price: roundStockPrice(safeQty * safeSale),
      total_spent: safeSpent,
    };
  }

  function getStockFactorToBaseUnit(fromUnitId, record) {
    const fromId = Number(fromUnitId || 0);
    const baseUnitId = getStockProductBaseUnitId(record) || getStockProductPrimaryUnitId(record);
    if (!fromId || !baseUnitId) return null;
    if (fromId === Number(baseUnitId)) return 1;

    const generalFactor = getConversionFactor(fromId, baseUnitId);
    if (generalFactor != null && Number(generalFactor) > 0) {
      return Number(generalFactor);
    }

    const primaryUnitId = getStockProductPrimaryUnitId(record);
    const norm = getStockNormValue(record);
    if (norm && primaryUnitId && fromId === Number(primaryUnitId)) {
      return norm;
    }

    return null;
  }

  function getStockUnitPriceByConversion(record, sourcePrice, fromUnitId, toUnitId) {
    const source = Number(sourcePrice);
    const fromId = Number(fromUnitId || 0);
    const toId = Number(toUnitId || 0);
    if (!Number.isFinite(source) || source < 0) return null;
    if (!fromId || !toId) return null;
    if (fromId === toId) return roundStockPrice(source);

    const fromFactor = getStockFactorToBaseUnit(fromId, record);
    const toFactor = getStockFactorToBaseUnit(toId, record);
    if (!Number.isFinite(Number(fromFactor)) || Number(fromFactor) <= 0) return null;
    if (!Number.isFinite(Number(toFactor)) || Number(toFactor) <= 0) return null;

    const sourcePerBase = source / Number(fromFactor);
    return roundStockPrice(sourcePerBase * Number(toFactor));
  }

  function getStockUnitPricesForRecord(record, unitId) {
    const targetUnitId = Number(unitId || record?.unit_id || 0);
    if (!Number.isFinite(targetUnitId) || targetUnitId <= 0) return null;

    const norm = getStockNormValue(record) || 1;
    const costTotal = Number(record?.product_cost_price ?? record?.cost_price ?? 0);
    const saleTotal = Number(record?.product_price ?? record?.price ?? 0);
    const factorToBase = getStockFactorToBaseUnit(targetUnitId, record);

    if (!Number.isFinite(Number(factorToBase)) || Number(factorToBase) <= 0) {
      return null;
    }

    const costPerBase = costTotal / norm;
    const salePerBase = saleTotal / norm;
    return {
      cost_price: roundStockPrice(costPerBase * Number(factorToBase)),
      price: roundStockPrice(salePerBase * Number(factorToBase)),
    };
  }

  function renderStockDocList(listEl, emptyEl, filterType) {
    if (!listEl || !emptyEl) return;

    const docs = filterType
      ? state.stockDocuments.filter((d) => d.type === filterType)
      : state.stockDocuments;

    if (!docs.length) {
      listEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
      return;
    }

    emptyEl.classList.add("hidden");

    listEl.innerHTML = docs
      .map((doc) => {
        const typeMeta = getStockDocTypeMeta(doc.type);
        const typeIcon = typeMeta.icon;
        const typeLabel = typeMeta.label;
        const date = formatStockDate(doc.status === "posted" ? doc.posted_at : doc.created_at);
        const itemsCount = doc.items_count || 0;
        const totalSum = doc.type === "order"
          ? Number(doc.order_total_price || doc.total_sale_sum || 0)
          : (doc.type === "in"
              ? Number(doc.total_spent_sum ?? doc.total_cost_sum ?? doc.total_sale_sum ?? 0)
              : Number(doc.total_cost_sum || doc.total_sale_sum || 0));
        const docNumber = doc.type === "order"
          ? (doc.order_id ? `#${doc.order_id}` : `#${doc.number || doc.id}`)
          : `№${doc.number || doc.id}`;

        return `
          <div class="options-row stock-doc-row" data-stock-doc-id="${doc.id}">
            <div>
              <div class="options-row-title"><i class="fas ${typeIcon}"></i> ${typeLabel} ${docNumber}</div>
              <div class="options-row-meta">${escapeHtml(doc.comment || "")}</div>
            </div>
            <div class="options-row-meta">${itemsCount} поз.</div>
            <div class="options-row-meta">${formatStockMoney(totalSum)}</div>
            <div class="options-row-meta">${date}</div>
          </div>
        `;
      })
      .join("");

    // Клик по документу — открыть детали
    listEl.querySelectorAll("[data-stock-doc-id]").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.stockDocId);
        if (!Number.isFinite(id)) return;
        await openStockDocDetail(id);
      });
    });
  }

  // =============================================
  // STOCK DOCUMENT DETAIL (right panel) — tabs + footer
  // =============================================
  let stockPickerSelection = new Set();
  let stockPickerDocId = null;
  let stockPickerProductsMap = new Map();

  async function openStockDocDetail(id) {
    try {
      const res = await apiGetStockDocument(id);
      state.stockDocDetail = res.data;
      const doc = res.data;
      const typeLabel = getStockDocTypeMeta(doc.type).label;
      const docNumber = doc.type === "order"
        ? `#${doc.order?.id || doc.order_id || doc.number || doc.id}`
        : `№${doc.number || doc.id}`;
      const tabTitle = `${typeLabel} ${docNumber}`;

      ensureTab({
        type: "stock-doc",
        id: doc.id,
        title: tabTitle,
        onActivate: async () => {
          const freshRes = await apiGetStockDocument(doc.id);
          state.stockDocDetail = freshRes.data;
          renderStockDocDetail();
          showStockDocFooter();
        },
        activate: true,
      });

      renderStockDocDetail();
      showStockDocFooter();
    } catch (e) {
      console.error("openStockDocDetail error:", e);
    }
  }

  function showStockDocFooter() {
    const doc = state.stockDocDetail;
    if (!doc) return;

    const footer = $("#productInfoFooter");
    const viewMode = $("#productFooterView");
    const editMode = $("#productFooterEditMode");
    if (!footer || !viewMode || !editMode) return;

    resetFooterConfirmButtons();

    if (doc.status === "draft") {
      // Черновик: показываем edit mode с кнопкой "Провести"
      footer.classList.remove("hidden");
      viewMode.classList.add("hidden");
      editMode.classList.remove("hidden");

      const saveBtn = $("#productFooterSaveBtn");
      if (saveBtn) {
        saveBtn.textContent = "Провести";
        saveBtn.dataset.pickerType = "stock-doc-post";
      }
      const cancelBtn = $("#productFooterCancelBtn");
      if (cancelBtn) cancelBtn.classList.add("hidden");
      const deleteBtn = $("#productFooterDeleteEditBtn");
      if (deleteBtn) deleteBtn.classList.remove("hidden");
      const moreBtn = $("#productFooterMoreEditBtn");
      if (moreBtn) moreBtn.classList.add("hidden");
    } else {
      // Проведён: показываем view mode, но readonly
      footer.classList.remove("hidden");
      viewMode.classList.remove("hidden");
      editMode.classList.add("hidden");

      const editBtn = $("#productFooterEditBtn");
      if (editBtn) {
        editBtn.textContent = "Проведён";
        editBtn.disabled = true;
      }
      const deleteViewBtn = $("#productFooterDeleteBtn");
      if (deleteViewBtn) deleteViewBtn.classList.add("hidden");
      const moreViewBtn = $("#productFooterMoreBtn");
      if (moreViewBtn) moreViewBtn.classList.add("hidden");
    }

    updateActiveTabFooterState();
  }

  function stockGetItemPhoto(item) {
    try {
      const photos = JSON.parse(item?.photos_json || "[]");
      return photos[0]?.url || photos[0] || "";
    } catch {
      return "";
    }
  }

  function stockGetOrderItemPhoto(item) {
    const photos = Array.isArray(item?.photos) ? item.photos : [];
    return photos[0] || "";
  }

  function renderOrderReceiptItems(orderItems) {
    const safeItems = Array.isArray(orderItems) ? orderItems : [];
    if (!safeItems.length) return '<div class="empty-hint">Нет позиций заказа</div>';

    return safeItems.map((item) => {
      const isCombo = String(item?.type || "") === "combo";
      const title = escapeHtml(item?.name || item?.combo_title || "Позиция");
      const qty = Number(item?.qty || 0);
      const lineTotal = Number(item?.line_total || 0);
      const unitPrice = qty > 0 ? lineTotal / qty : Number(item?.price || 0);
      const photo = stockGetOrderItemPhoto(item);
      const imgTag = photo
        ? `<img src="${escapeHtml(photo)}" class="stock-item-photo" alt="" />`
        : `<div class="stock-item-photo-empty"><i class="fas fa-box"></i></div>`;

      const details = [];
      if (isCombo) {
        const selections = Array.isArray(item?.selections) ? item.selections : [];
        selections.forEach((sel) => {
          const selName = escapeHtml(sel?.product_name || "Выбор");
          const variant = String(sel?.variant_label || "").trim();
          const variantTitle = variant ? ` (${escapeHtml(variant)})` : "";
          details.push(`<div class="stock-item-meta">• ${selName}${variantTitle}</div>`);
          const ingredients = Array.isArray(sel?.ingredients_display) ? sel.ingredients_display : [];
          ingredients.forEach((ing) => {
            const ingName = escapeHtml(ing?.name || "Ингредиент");
            const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
            const ingUnit = escapeHtml(String(ing?.unit || "").trim());
            details.push(`<div class="stock-item-meta" style="padding-left:16px">- ${ingName}: ${ingQty}${ingUnit ? " " + ingUnit : ""}</div>`);
          });
        });
      } else {
        const variants = Array.isArray(item?.variants) ? item.variants : [];
        if (variants.length) {
          const v = variants[0];
          const vLabel = escapeHtml(String(v?.label || v?.value || "").trim());
          if (vLabel) details.push(`<div class="stock-item-meta">Вариант: ${vLabel}</div>`);
        }
        const options = Array.isArray(item?.options) ? item.options : [];
        options.forEach((opt) => {
          const optName = escapeHtml(opt?.title || "Опция");
          const optQty = Number(opt?.qty || 1);
          details.push(`<div class="stock-item-meta">+ ${optName} × ${optQty}</div>`);
        });
        const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
        ingredients.forEach((ing) => {
          const ingName = escapeHtml(ing?.name || "Ингредиент");
          const ingQty = Number(ing?.quantity ?? ing?.qty ?? 0);
          const ingUnit = escapeHtml(String(ing?.unit_label || "").trim());
          details.push(`<div class="stock-item-meta">• ${ingName}: ${ingQty}${ingUnit ? " " + ingUnit : ""}</div>`);
        });
      }

      return `
        <div class="stock-item-row">
          ${imgTag}
          <div class="stock-item-info">
            <div class="stock-item-name">${title}</div>
            <div class="stock-item-meta">${qty} × ${unitPrice.toFixed(2)} ₽ = ${lineTotal.toFixed(0)} ₽</div>
            ${details.join("")}
          </div>
        </div>
      `;
    }).join("");
  }

  function renderStockDocDetail() {
    const doc = state.stockDocDetail;
    if (!doc) return;

    const body = $("#productInfoBody");
    if (!body) return;

    hideAllDetailPanels();
    if (stockDocEmpty) stockDocEmpty.classList.add("hidden");

    let detailEl = $("#stockDocDetail");
    if (!detailEl) {
      detailEl = document.createElement("div");
      detailEl.id = "stockDocDetail";
      body.appendChild(detailEl);
    }
    detailEl.classList.remove("hidden");

    const isDraft = doc.status === "draft";
    const typeMeta = getStockDocTypeMeta(doc.type);
    const typeLabel = typeMeta.label;
    const items = Array.isArray(doc.items) ? doc.items : [];
    const allowSpentAccounting = doc.type === "in";
    const draftItemsById = new Map(items.map((item) => [Number(item?.id), item]));
    const totalCostSum = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.cost_price || 0), 0);
    const totalSaleSum = items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.price || 0), 0);
    const totalSpentSum = items.reduce((s, i) => s + Number(i?.purchase_total || 0), 0);
    const orderData = doc.type === "order" ? (doc.order || null) : null;
    const orderItems = Array.isArray(orderData?.items) ? orderData.items : [];
    const orderTotal = Number(orderData?.total_price || doc.order_total_price || totalSaleSum || 0);

    let itemsHtml = "";
    let itemsTitle = "Товары";
    let addItemButton = isDraft ? `<button class="btn btn-icon btn-sm" id="stockAddItemBtn" title="Добавить товар"><i class="fas fa-plus"></i></button>` : "";

    if (doc.type === "order" && !isDraft) {
      itemsTitle = "Позиции заказа";
      addItemButton = "";
      itemsHtml = renderOrderReceiptItems(orderItems);
    } else if (items.length) {
      itemsHtml = items.map((item) => {
        const photo = stockGetItemPhoto(item);
        const normLabel = getStockNormLabel(item);
        const lineTotals = getStockLineTotals(item.qty, item.cost_price, item.price, item.purchase_price, item.purchase_total);
        const imgTag = photo
          ? `<img src="${escapeHtml(photo)}" class="stock-item-photo" alt="" />`
          : `<div class="stock-item-photo-empty"><i class="fas fa-box"></i></div>`;

        if (isDraft) {
          return `
            <div class="stock-item-row stock-item-editable" data-stock-item-id="${item.id}">
              <div class="stock-item-header">
                ${imgTag}
                <div class="stock-item-name">${escapeHtml(item.product_name || "Товар #" + item.product_id)}</div>
                <button class="btn btn-icon btn-sm stock-item-del" data-del-item="${item.id}" title="Удалить"><i class="fas fa-times"></i></button>
              </div>
              ${normLabel ? `<div class="stock-item-meta">Норма: ${escapeHtml(normLabel)}</div>` : ""}
              <div class="stock-item-fields">
                <div class="stock-item-field">
                  <label class="field-label">Кол-во</label>
                  <input class="control control-sm" type="number" min="0" step="any" data-field="qty" data-item-id="${item.id}" value="${formatStockInputValue(item.qty, { emptyZero: true })}" placeholder="0" />
                </div>
                <div class="stock-item-field">
                  <label class="field-label">Ед. изм.</label>
                  <select class="control control-sm" data-field="unit_id" data-item-id="${item.id}">
                    ${buildStockUnitOptions(item)}
                  </select>
                </div>
                <div class="stock-item-field">
                  <label class="field-label">Себест.</label>
                  <input class="control control-sm" type="number" min="0" step="any" data-field="cost_price" data-item-id="${item.id}" value="${formatStockInputValue(item.cost_price)}" placeholder="0" />
                </div>
                <div class="stock-item-field">
                  <label class="field-label">Цена</label>
                  <input class="control control-sm" type="number" min="0" step="any" data-field="price" data-item-id="${item.id}" value="${formatStockInputValue(item.price)}" placeholder="0" />
                </div>
                ${allowSpentAccounting ? `
                <div class="stock-item-field">
                  <label class="field-label">Закуп.</label>
                  <input class="control control-sm" type="number" min="0" step="any" data-field="purchase_price" data-item-id="${item.id}" value="${formatStockInputValue(item.purchase_price)}" placeholder="0" />
                </div>
                ` : ""}
                <div class="stock-item-field">
                  <label class="field-label">Итог себест.</label>
                  <input class="control control-sm" type="number" min="0" step="0.01" data-total-field="total_cost" data-item-id="${item.id}" value="${formatStockInputValue(lineTotals.total_cost, { emptyZero: true })}" placeholder="0" />
                </div>
                <div class="stock-item-field">
                  <label class="field-label">Итог цена</label>
                  <input class="control control-sm" type="number" min="0" step="0.01" data-total-field="total_price" data-item-id="${item.id}" value="${formatStockInputValue(lineTotals.total_price, { emptyZero: true })}" placeholder="0" />
                </div>
                ${allowSpentAccounting ? `
                <div class="stock-item-field">
                  <label class="field-label">Итог потрачено</label>
                  <input class="control control-sm" type="number" min="0" step="0.01" data-total-field="total_spent" data-item-id="${item.id}" value="${formatStockInputValue(item.purchase_total, { emptyZero: true })}" placeholder="0" />
                </div>
                ` : ""}
              </div>
            </div>
          `;
        }

        const sum = Number(item.qty || 0) * Number(item.cost_price || 0);
        return `
          <div class="stock-item-row" data-stock-item-id="${item.id}">
            ${imgTag}
            <div class="stock-item-info">
              <div class="stock-item-name">${escapeHtml(item.product_name || "Товар #" + item.product_id)}</div>
              <div class="stock-item-meta">${Number(item.qty)} ${escapeHtml(item.unit_short || "шт")} × ${Number(item.cost_price || 0)} ₽ = ${sum.toFixed(0)} ₽</div>
            </div>
          </div>
        `;
      }).join("");
    } else {
      itemsHtml = '<div class="empty-hint">Нет позиций</div>';
    }

    const headerNumber = doc.type === "order"
      ? `#${orderData?.id || doc.order_id || doc.number || doc.id}`
      : `№${doc.number || doc.id}`;
    const positionsCount = (doc.type === "order" && !isDraft) ? orderItems.length : items.length;

    detailEl.innerHTML = `
      <div class="info-card">
        <div class="kv-row"><span class="kv-label">${typeLabel} ${headerNumber}</span></div>
        <div class="kv-row"><span class="kv-label">Дата</span><span class="kv-value">${formatStockDate(doc.posted_at || doc.created_at)}</span></div>
        <div class="kv-row"><span class="kv-label">Автор</span><span class="kv-value">${escapeHtml(doc.created_by_name || "—")}</span></div>
        ${doc.comment ? `<div class="kv-row"><span class="kv-label">Комментарий</span><span class="kv-value">${escapeHtml(doc.comment)}</span></div>` : ""}
        ${doc.type === "order" && orderData?.public_id ? `<div class="kv-row"><span class="kv-label">Публичный №</span><span class="kv-value">${escapeHtml(orderData.public_id)}</span></div>` : ""}
        <div class="kv-row"><span class="kv-label">Позиций</span><span class="kv-value">${positionsCount}</span></div>
        ${doc.type === "order"
          ? `<div class="kv-row"><span class="kv-label">Сумма заказа</span><span class="kv-value"><b>${formatStockMoney(orderTotal)}</b></span></div>`
          : `<div class="kv-row"><span class="kv-label">Себестоимость</span><span class="kv-value"><b>${formatStockMoney(totalCostSum)}</b></span></div>`}
        ${allowSpentAccounting
          ? `<div class="kv-row"><span class="kv-label">Потрачено</span><span class="kv-value"><b>${formatStockMoney(totalSpentSum)}</b></span></div>`
          : ""}
        ${doc.type === "order"
          ? `<div class="kv-row"><span class="kv-label">Себестоимость списания</span><span class="kv-value"><b>${formatStockMoney(totalCostSum)}</b></span></div>`
          : ""}
      </div>

      <div class="info-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="kv-label">${itemsTitle}</div>
          ${addItemButton}
        </div>
        <div class="stock-items-list">${itemsHtml}</div>
      </div>
    `;

    if (!isDraft) return;

    items.forEach((item) => {
      const sel = detailEl.querySelector(`select[data-item-id="${item.id}"]`);
      if (sel && item.unit_id) sel.value = String(item.unit_id);
    });

    const addItemBtn = $("#stockAddItemBtn");
    if (addItemBtn) {
      addItemBtn.addEventListener("click", () => {
        openStockItemPicker(doc.id);
      });
    }

    function updateStockDraftTotals(itemId) {
      if (!Number.isFinite(itemId)) return;
      const qtyEl = detailEl.querySelector(`[data-field="qty"][data-item-id="${itemId}"]`);
      const costEl = detailEl.querySelector(`[data-field="cost_price"][data-item-id="${itemId}"]`);
      const saleEl = detailEl.querySelector(`[data-field="price"][data-item-id="${itemId}"]`);
      const purchaseEl = detailEl.querySelector(`[data-field="purchase_price"][data-item-id="${itemId}"]`);
      const totalCostEl = detailEl.querySelector(`[data-total-field="total_cost"][data-item-id="${itemId}"]`);
      const totalPriceEl = detailEl.querySelector(`[data-total-field="total_price"][data-item-id="${itemId}"]`);
      const totalSpentEl = detailEl.querySelector(`[data-total-field="total_spent"][data-item-id="${itemId}"]`);

      const qty = Number(qtyEl?.value) || 0;
      const cost = Number(costEl?.value) || 0;
      const sale = Number(saleEl?.value) || 0;
      const purchaseRaw = purchaseEl ? String(purchaseEl.value || "").trim() : "";
      const purchase = purchaseRaw === "" ? Number.NaN : Number(purchaseRaw);
      const totalSpentRaw = totalSpentEl ? String(totalSpentEl.value || "").trim() : "";
      const totalSpent = totalSpentRaw === "" ? Number.NaN : Number(totalSpentRaw);

      if (purchaseEl && totalSpentRaw !== "" && Number.isFinite(totalSpent) && Number.isFinite(qty) && qty > 0) {
        purchaseEl.value = formatStockInputValue(roundStockPrice(totalSpent / qty));
      }

      const totals = getStockLineTotals(qty, cost, sale, purchase, totalSpent);

      if (totalCostEl) totalCostEl.value = formatStockInputValue(totals.total_cost, { emptyZero: true });
      if (totalPriceEl) totalPriceEl.value = formatStockInputValue(totals.total_price, { emptyZero: true });
    }

    function updateStockDraftUnitPriceFromTotal(itemId, totalField) {
      if (!Number.isFinite(itemId)) return false;
      const qtyEl = detailEl.querySelector(`[data-field="qty"][data-item-id="${itemId}"]`);
      const costEl = detailEl.querySelector(`[data-field="cost_price"][data-item-id="${itemId}"]`);
      const saleEl = detailEl.querySelector(`[data-field="price"][data-item-id="${itemId}"]`);
      const purchaseEl = detailEl.querySelector(`[data-field="purchase_price"][data-item-id="${itemId}"]`);
      const totalCostEl = detailEl.querySelector(`[data-total-field="total_cost"][data-item-id="${itemId}"]`);
      const totalPriceEl = detailEl.querySelector(`[data-total-field="total_price"][data-item-id="${itemId}"]`);
      const totalSpentEl = detailEl.querySelector(`[data-total-field="total_spent"][data-item-id="${itemId}"]`);

      const qty = Number(qtyEl?.value) || 0;
      if (!Number.isFinite(qty) || qty <= 0) return false;

      if (totalField === "total_cost" && totalCostEl && costEl) {
        const totalCost = Number(totalCostEl.value) || 0;
        costEl.value = formatStockInputValue(roundStockPrice(totalCost / qty));
        return true;
      }

      if (totalField === "total_price" && totalPriceEl && saleEl) {
        const totalPrice = Number(totalPriceEl.value) || 0;
        saleEl.value = formatStockInputValue(roundStockPrice(totalPrice / qty));
        return true;
      }

      if (totalField === "total_spent" && totalSpentEl && purchaseEl) {
        const totalSpentRaw = String(totalSpentEl.value || "").trim();
        if (totalSpentRaw === "") {
          purchaseEl.value = "";
          return true;
        }
        const totalSpent = Number(totalSpentRaw);
        if (!Number.isFinite(totalSpent)) return false;
        purchaseEl.value = formatStockInputValue(roundStockPrice(totalSpent / qty));
        return true;
      }

      return false;
    }

    let stockItemSaveTimer = null;
    function queueStockItemSave(itemId) {
      if (!Number.isFinite(itemId)) return;
      clearTimeout(stockItemSaveTimer);
      stockItemSaveTimer = setTimeout(async () => {
        const qtyEl = detailEl.querySelector(`[data-field="qty"][data-item-id="${itemId}"]`);
        const unitEl = detailEl.querySelector(`[data-field="unit_id"][data-item-id="${itemId}"]`);
        const costEl = detailEl.querySelector(`[data-field="cost_price"][data-item-id="${itemId}"]`);
        const saleEl = detailEl.querySelector(`[data-field="price"][data-item-id="${itemId}"]`);
        const purchaseEl = detailEl.querySelector(`[data-field="purchase_price"][data-item-id="${itemId}"]`);
        const totalSpentEl = detailEl.querySelector(`[data-total-field="total_spent"][data-item-id="${itemId}"]`);
        const payload = {};
        if (qtyEl) payload.qty = Number(qtyEl.value) || 0;
        if (unitEl) payload.unit_id = Number(unitEl.value) || null;
        if (costEl) payload.cost_price = Number(costEl.value) || 0;
        if (saleEl) payload.price = Number(saleEl.value) || 0;
        if (purchaseEl) {
          const purchaseRaw = String(purchaseEl.value || "").trim();
          payload.purchase_price = purchaseRaw === "" ? null : (Number(purchaseEl.value) || 0);
        }
        if (totalSpentEl) {
          const totalSpentRaw = String(totalSpentEl.value || "").trim();
          payload.purchase_total = totalSpentRaw === "" ? null : (Number(totalSpentEl.value) || 0);
        }
        try {
          await apiUpdateStockItem(doc.id, itemId, payload);
        } catch (err) {
          console.error("Ошибка сохранения позиции:", err);
        }
      }, 400);
    }

    detailEl.querySelectorAll("[data-field][data-item-id]").forEach((input) => {
      const field = String(input.dataset.field || "");
      if (field === "qty" || field === "cost_price" || field === "price" || field === "purchase_price") {
        input.addEventListener("input", () => {
          const itemId = Number(input.dataset.itemId);
          updateStockDraftTotals(itemId);
        });
      }

      input.addEventListener("change", () => {
        const itemId = Number(input.dataset.itemId);
        if (!Number.isFinite(itemId)) return;

        if (String(input.dataset.field || "") === "unit_id") {
          const unitEl = detailEl.querySelector(`[data-field="unit_id"][data-item-id="${itemId}"]`);
          const costEl = detailEl.querySelector(`[data-field="cost_price"][data-item-id="${itemId}"]`);
          const saleEl = detailEl.querySelector(`[data-field="price"][data-item-id="${itemId}"]`);
          const purchaseEl = detailEl.querySelector(`[data-field="purchase_price"][data-item-id="${itemId}"]`);
          const totalSpentEl = detailEl.querySelector(`[data-total-field="total_spent"][data-item-id="${itemId}"]`);
          const qtyEl = detailEl.querySelector(`[data-field="qty"][data-item-id="${itemId}"]`);
          const targetUnitId = Number(unitEl?.value || 0);
          const currentItem = draftItemsById.get(itemId);
          if (currentItem && Number.isFinite(targetUnitId) && targetUnitId > 0) {
            const recalculated = getStockUnitPricesForRecord(currentItem, targetUnitId);
            currentItem.unit_id = targetUnitId;
            if (recalculated) {
              currentItem.cost_price = recalculated.cost_price;
              currentItem.price = recalculated.price;
              if (costEl) costEl.value = formatStockInputValue(recalculated.cost_price);
              if (saleEl) saleEl.value = formatStockInputValue(recalculated.price);
            }
            if (purchaseEl) {
              const totalSpentRaw = totalSpentEl ? String(totalSpentEl.value || "").trim() : "";
              const qty = Number(qtyEl?.value) || 0;
              if (totalSpentRaw !== "" && Number.isFinite(Number(totalSpentRaw)) && qty > 0) {
                const recalculatedPurchase = roundStockPrice(Number(totalSpentRaw) / qty);
                purchaseEl.value = formatStockInputValue(recalculatedPurchase);
                currentItem.purchase_price = recalculatedPurchase;
              }
            }
          }
        }

        updateStockDraftTotals(itemId);
        queueStockItemSave(itemId);
      });
    });

    detailEl.querySelectorAll("[data-total-field][data-item-id]").forEach((input) => {
      input.addEventListener("input", () => {
        const itemId = Number(input.dataset.itemId);
        const totalField = String(input.dataset.totalField || "");
        if (!Number.isFinite(itemId)) return;
        updateStockDraftUnitPriceFromTotal(itemId, totalField);
      });

      input.addEventListener("change", () => {
        const itemId = Number(input.dataset.itemId);
        const totalField = String(input.dataset.totalField || "");
        if (!Number.isFinite(itemId)) return;
        updateStockDraftUnitPriceFromTotal(itemId, totalField);
        updateStockDraftTotals(itemId);
        queueStockItemSave(itemId);
      });
    });

    items.forEach((item) => {
      updateStockDraftTotals(Number(item?.id));
    });

    detailEl.querySelectorAll("[data-del-item]").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const itemId = Number(btn.dataset.delItem);
        try {
          await apiDeleteStockItem(doc.id, itemId);
          await openStockDocDetail(doc.id);
        } catch (err) {
          alert("Ошибка удаления позиции");
        }
      });
    });
  }

  // =============================================
  // STOCK ITEM PICKER — overlay с категориями и чекбоксами
  // =============================================
  async function openStockItemPicker(docId) {
    stockPickerDocId = docId;
    stockPickerSelection = new Set();
    stockPickerProductsMap = new Map();
    const existingProductIds = new Set(
      (Array.isArray(state.stockDocDetail?.items) ? state.stockDocDetail.items : [])
        .map((item) => Number(item?.product_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    );

    // Загружаем категории если ещё не загружены
    if (!state.catalogCategories.length) {
      await loadCatalogCategories();
    }

    // Удаляем старый overlay если есть
    const productInfoPanel = $("#productInfoPanel");
    if (!productInfoPanel) return;
    const existingPicker = productInfoPanel.querySelector(".picker-overlay");
    if (existingPicker) existingPicker.remove();

    // Создаём overlay
    const pickerOverlay = document.createElement("div");
    pickerOverlay.className = "picker-overlay";

    const pickerContent = document.createElement("div");
    pickerContent.className = "picker-overlay-content";

    pickerContent.innerHTML = `
      <div class="picker-overlay-header">
        <div class="panel-title">Добавить товары</div>
      </div>
      <div class="picker-overlay-body">
        <div class="info-card">
          <div class="option-picker-tabs" id="stockPickerTabs"></div>
          <div class="option-picker-search" style="margin-bottom: 16px;">
            <input class="control" id="stockPickerSearchInput" type="search" placeholder="Поиск товара..." />
          </div>
          <div class="option-picker-list" id="stockPickerListContent"></div>
        </div>
      </div>
    `;

    pickerOverlay.appendChild(pickerContent);
    productInfoPanel.appendChild(pickerOverlay);

    const searchInput = pickerContent.querySelector("#stockPickerSearchInput");
    const listContent = pickerContent.querySelector("#stockPickerListContent");
    const tabsEl = pickerContent.querySelector("#stockPickerTabs");
    let stockPickerCategoryId = null;

    async function renderTabs() {
      if (!tabsEl) return;
      const categories = [{ id: "", title: "Все" }, ...state.catalogCategories];
      tabsEl.innerHTML = categories.map((cat) => {
        const active = stockPickerCategoryId == null
          ? cat.id === ""
          : Number(cat.id) === Number(stockPickerCategoryId);
        return `
          <button class="option-picker-tab chip ${active ? "is-active" : ""}" type="button" data-cat-id="${cat.id}">
            ${escapeHtml(cat.title || "")}
          </button>
        `;
      }).join("");

      bindHorizontalScroll(tabsEl);
      tabsEl.querySelectorAll("[data-cat-id]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const raw = btn.dataset.catId;
          stockPickerCategoryId = raw === "" ? null : Number(raw);
          renderTabs();
          await renderList();
        });
      });
    }

    async function renderList() {
      if (!listContent) return;
      const query = String(searchInput?.value || "").trim().toLowerCase();

      try {
        const categoryId = Number.isFinite(stockPickerCategoryId) ? stockPickerCategoryId : null;
        const res = await apiGetCatalogProducts({ query, categoryId });
        const raw = Array.isArray(res.data) ? res.data : [];
        const seenIds = new Set();
        const products = raw.filter(p => {
          const id = Number(p.id);
          if (seenIds.has(id)) return false;
          seenIds.add(id);
          return true;
        });
        products.forEach((p) => {
          const id = Number(p?.id || 0);
          if (Number.isFinite(id) && id > 0) {
            stockPickerProductsMap.set(id, p);
          }
        });

        const availableProducts = products
          .filter((p) => !existingProductIds.has(Number(p.id)));

        listContent.innerHTML = availableProducts
          .filter(p => Number(p.is_active) !== 0)
          .filter(p => !query || String(p.name || "").toLowerCase().includes(query))
          .map(p => {
            const id = Number(p.id);
            const checked = stockPickerSelection.has(id);
            const productPhoto = p.photos_json && Array.isArray(p.photos_json) && p.photos_json.length > 0 ? p.photos_json[0] : null;
            const unitLabel = (() => {
              const u = state.units.find((u) => Number(u.id) === Number(p.unit_id || p.base_unit_id));
              return u ? u.short_title || u.title : "шт";
            })();
            return `
              <div class="option-picker-row ${checked ? "is-selected" : ""}" data-product-id="${id}">
                ${productPhoto ? `<div class="option-picker-photo"><img src="${escapeHtml(productPhoto)}" alt="" /></div>` : '<div class="option-picker-photo"></div>'}
                <div class="option-picker-meta">
                  <div class="options-row-title">${escapeHtml(p.name || "")}</div>
                  <div class="options-row-meta">${unitLabel} · ${Number(p.cost_price || p.price || 0)} ₽</div>
                </div>
                <input class="option-picker-checkbox" type="checkbox" data-product-id="${id}" ${checked ? "checked" : ""} />
              </div>
            `;
          }).join('');

        if (!listContent.innerHTML.trim()) {
          listContent.innerHTML = '<div class="empty-hint">Все товары уже добавлены</div>';
          return;
        }

        listContent.querySelectorAll(".option-picker-row[data-product-id]").forEach((row) => {
          row.addEventListener("click", () => {
            const id = Number(row.dataset.productId);
            if (!Number.isFinite(id)) return;
            if (stockPickerSelection.has(id)) {
              stockPickerSelection.delete(id);
            } else {
              stockPickerSelection.add(id);
            }
            renderList();
          });
        });
      } catch (e) {
        console.error('Failed to load products for stock picker', e);
        listContent.innerHTML = '<div class="empty-hint">Ошибка загрузки товаров</div>';
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", renderList);
    }

    await renderTabs();
    await renderList();

    // Переключаем футер на режим "Отменить" / "Сохранить"
    const footer = $("#productInfoFooter");
    const editMode = $("#productFooterEditMode");
    const viewMode = $("#productFooterView");
    if (footer) footer.classList.remove("hidden");
    if (viewMode) viewMode.classList.add("hidden");
    if (editMode) editMode.classList.remove("hidden");

    const saveBtn = $("#productFooterSaveBtn");
    if (saveBtn) {
      saveBtn.textContent = "Сохранить";
      saveBtn.dataset.pickerType = "stock-picker";
    }
    const cancelBtn = $("#productFooterCancelBtn");
    if (cancelBtn) {
      cancelBtn.classList.remove("hidden");
      cancelBtn.classList.add("is-fullwidth");
      cancelBtn.textContent = "Отменить";
      cancelBtn.dataset.pickerType = "stock-picker";
    }
    const deleteBtn = $("#productFooterDeleteEditBtn");
    if (deleteBtn) deleteBtn.classList.add("hidden");
    const moreBtn = $("#productFooterMoreEditBtn");
    if (moreBtn) moreBtn.classList.add("hidden");
  }

  function closeStockPicker() {
    const productInfoPanel = $("#productInfoPanel");
    if (productInfoPanel) {
      const overlay = productInfoPanel.querySelector(".picker-overlay");
      if (overlay) overlay.remove();
    }
    // Восстанавливаем футер документа
    showStockDocFooter();
  }

  async function saveStockPickerSelection() {
    if (!stockPickerDocId || !stockPickerSelection.size) {
      closeStockPicker();
      return;
    }

    const products = state.products || [];
    const existingProductIds = new Set(
      (Array.isArray(state.stockDocDetail?.items) ? state.stockDocDetail.items : [])
        .map((item) => Number(item?.product_id))
        .filter((id) => Number.isFinite(id) && id > 0)
    );
    try {
      for (const productId of stockPickerSelection) {
        if (existingProductIds.has(productId)) continue;
        const product = stockPickerProductsMap.get(productId) || products.find((p) => Number(p.id) === productId);
        const defaultUnitId = Number(product?.base_unit_id || product?.unit_id || 0);
        const recalculated = getStockUnitPricesForRecord(product || null, defaultUnitId);
        const defaultCostPrice = recalculated ? Number(recalculated.cost_price || 0) : (product ? Number(product.cost_price || 0) : 0);
        const defaultSalePrice = recalculated ? Number(recalculated.price || 0) : (product ? Number(product.price || 0) : 0);
        try {
          await apiAddStockItem(stockPickerDocId, {
            product_id: productId,
            qty: 0,
            unit_id: Number.isFinite(defaultUnitId) && defaultUnitId > 0 ? defaultUnitId : null,
            cost_price: defaultCostPrice,
            price: defaultSalePrice,
            purchase_price: null,
            purchase_total: null,
          });
          existingProductIds.add(productId);
        } catch (itemErr) {
          if (String(itemErr?.message || "") === "ITEM_ALREADY_EXISTS") {
            existingProductIds.add(productId);
            continue;
          }
          throw itemErr;
        }
      }
      closeStockPicker();
      await openStockDocDetail(stockPickerDocId);
    } catch (e) {
      alert("Ошибка: " + (e.message || "Не удалось добавить товары"));
    }
  }

  // =============================================
  // STOCK: Создание нового документа через кнопку +
  // =============================================
  async function createNewStockDocument(type) {
    try {
      const res = await apiCreateStockDocument({ type });
      if (res.id) {
        const typeLabel = type === "in" ? "Новый приход" : "Новое списание";
        ensureTab({
          type: "stock-doc",
          id: res.id,
          title: typeLabel,
          onActivate: async () => {
            const freshRes = await apiGetStockDocument(res.id);
            state.stockDocDetail = freshRes.data;
            renderStockDocDetail();
            showStockDocFooter();
          },
          activate: true,
        });

        const freshRes = await apiGetStockDocument(res.id);
        state.stockDocDetail = freshRes.data;
        renderStockDocDetail();
        showStockDocFooter();

        // Обновить список
        if (type === "in") {
          await loadStockDocuments("in");
          renderStockDocList(stockInList, stockInEmpty, "in");
        } else {
          await loadStockDocuments("out");
          renderStockDocList(stockOutList, stockOutEmpty, "out");
        }
      }
    } catch (e) {
      alert("Ошибка создания документа: " + (e.message || ""));
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    bindAccordionContainer(productsAccordion);
    bindAccordionContainer(optionGroupInfo);
    bindAccordionContainer(variantGroupInfo);
    bindAccordionContainer(autoAddGroupInfo);
    if (unitInfo) {
      bindAccordionContainer(unitInfo);
    }
    if (comboInfo) {
      bindAccordionContainer(comboInfo);
    }
    bindEvents();

    await loadUnitsManagement();
    await loadUnitConversions();
    await refreshAll();
    enterProductsMode(state.currentCategoryId);
    schedulePersistProductsCache(0);

    // ✅ гарантированно "до конца"
    requestAnimationFrame(refreshOpenAccordions);
  });

  // Слушать изменение Филиалы
  document.addEventListener('tenantStoreChanged', async (event) => {
    console.log('Филиал изменен (products):', event.detail.store);
    // Перезагрузить товары и категории для новой точки
    await refreshAll();
  });
})();
