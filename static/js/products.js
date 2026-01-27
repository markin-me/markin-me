(function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const TENANT_ID = 1;

  // left
  const categoriesNav = $("#categoriesNav");
  const addCategoryBtn = $("#addCategoryBtn");
  const productsAccordion = $("#productsAccordion");

  // center
  const toolbarText = $("#productsToolbarText");
  const addMainBtn = $("#addMainBtn");
  const productsList = $("#productsList");
  const productsEmptyHint = $("#productsEmptyHint");
  const categoriesMainList = $("#categoriesMainList");
  const categoriesEmptyHint = $("#categoriesEmptyHint");
  const optionsGroupsList = $("#optionsGroupsList");
  const optionsGroupsEmpty = $("#optionsGroupsEmpty");
  const variantsGroupsList = $("#variantsGroupsList");
  const variantsGroupsEmpty = $("#variantsGroupsEmpty");
  const unitsListEl = $("#unitsList");
  const unitsEmptyHint = $("#unitsEmptyHint");
  
  // Unit info panel elements
  const unitInfo = $("#unitInfo");
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
  const optionGroupInfo = $("#optionGroupInfo");
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
    // Completely clear navigation stack and return to empty state
    navigationStack.length = 0;
    currentNavigationState = null;
    if (productInfoBody) {
      productInfoBody.innerHTML = "";
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
    
    // Clear productInfoBody to avoid duplicate content
    if (productInfoBody && (state.type === "product-edit" || state.type === "product-view" || state.type === "category-edit" || state.type === "option-picker" || state.type === "ingredient-picker" || state.type === "option-edit")) {
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
    if (state.type === "product-edit" || state.type === "product-view" || state.type === "category-edit") {
      if (state.content) {
        // Ensure productInfoBody exists
        const body = productInfoBody || document.querySelector("#productInfoBody");
        if (body) {
          // Clear first to avoid duplicates
          body.innerHTML = "";
          body.appendChild(state.content);
          body.classList.remove("hidden");
          // Make sure body is visible
          if (body.parentElement) {
            body.parentElement.classList.remove("hidden");
          }
          // Buttons are now in header, no need to setup footer handlers
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
  const editingOptions = new Map(); // Map<optionGroupId, { mode, optionDraft, snapshotData }>
  const editingVariants = new Map(); // Map<variantGroupId, { mode, variantDraft, snapshotData }>

  const state = {
    mode: "products", // products | categories | ...
    categories: [],
    products: [],
    currentCategoryId: null,
    allCategoryId: null,
    selectedProductId: null,
    selectedCategoryId: null,
    selectedProductCategories: [], // full objects
    optionGroups: [],
    variantGroups: [],
    selectedOptionGroupId: null,
    selectedVariantGroupId: null,
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
  };

  let variantPickerSavedFooterState = null;
  let variantPickerSavedHandlers = null;
  let optionPanelPickerSavedFooterState = null;
  let optionPanelPickerSavedHandlers = null;
  let unitPickerSavedFooterState = null;
  let unitPickerSavedHandlers = null;

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
    return data.urls || [];
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

  async function apiGetOptionGroup(id) {
    return api(`/api/admin/options/groups/${id}`);
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

  async function apiGetVariantGroup(id) {
    return api(`/api/admin/variants/groups/${id}`);
  }

  async function apiCreateVariantGroup(payload) {
    return api("/api/admin/variants/group-bundle", { method: "POST", body: JSON.stringify(payload) });
  }

  // Отдельный endpoint для сохранения только default_value_index
  async function apiSetVariantGroupDefaultIndex(groupId, index) {
    console.log('apiSetVariantGroupDefaultIndex - groupId:', groupId, 'index:', index);
    const url = `/api/admin/variants/groups/${groupId}/defaultIndex`;
    try {
      const res = await fetch(url, {
        headers: { 
          "Content-Type": "application/json", 
          "x-tenant-id": String(TENANT_ID) 
        },
        method: "PATCH",
        body: JSON.stringify({ default_value_index: index }),
      });
      
      console.log('apiSetVariantGroupDefaultIndex - response status:', res.status);
      const data = await res.json();
      console.log('apiSetVariantGroupDefaultIndex - response data:', data);
      
      if (!res.ok || !data || data.ok === false) {
        const error = new Error(data?.error || `HTTP_${res.status}`);
        console.error('apiSetVariantGroupDefaultIndex - error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('apiSetVariantGroupDefaultIndex - fetch error:', error);
      throw error;
    }
  }

  async function apiPatchVariantGroup(id, payload) {
    console.log('apiPatchVariantGroup - id:', id);
    console.log('apiPatchVariantGroup - payload:', payload);
    console.log('apiPatchVariantGroup - payload.default_value_index:', payload.default_value_index);
    const url = `/api/admin/variants/groups/${id}`;
    console.log('apiPatchVariantGroup - URL:', url);
    const body = JSON.stringify(payload);
    console.log('apiPatchVariantGroup - body string:', body);
    try {
      const res = await fetch(url, {
        headers: { "Content-Type": "application/json", "x-tenant-id": String(TENANT_ID) },
        method: "PATCH",
        body: body,
      });
      console.log('apiPatchVariantGroup - response status:', res.status);
      console.log('apiPatchVariantGroup - response ok:', res.ok);
      const data = await res.json().catch(() => null);
      console.log('apiPatchVariantGroup - response data:', data);
      if (!res.ok || !data || data.ok === false) {
        const error = new Error((data && data.error) || `HTTP_${res.status}`);
        console.error('apiPatchVariantGroup - error:', error);
        throw error;
      }
      return data;
    } catch (error) {
      console.error('apiPatchVariantGroup - fetch error:', error);
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

  // ---------------- Views ----------------

  function showView(name) {
    $$(".content-view").forEach((v) => v.classList.add("hidden"));
    const target = document.querySelector(`.content-view[data-view-content="${name}"]`);
    if (target) target.classList.remove("hidden");
  }

  function setToolbarTitle(text) {
    if (toolbarText) toolbarText.textContent = text || "";
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
    } else if (state.mode === "units") {
      const btn = productsAccordion.querySelector('[data-view="units"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "allergens") {
      const btn = productsAccordion.querySelector('[data-view="allergens"]');
      if (btn) btn.classList.add("is-active");
    } else if (state.mode === "diets") {
      const btn = productsAccordion.querySelector('[data-view="diets"]');
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
    setToolbarTitle(cat ? cat.title : "Товары");
    showView("products");
    showDetailsEmpty();
    syncActiveMenuItems();
  }

  function enterCategoriesMode() {
    state.mode = "categories";
    setToolbarTitle("Категории");
    showView("categories");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
  }

  function enterOptionsMode() {
    state.mode = "options";
    state.optionPanel.returnTo = null;
    setToolbarTitle("Опции товара");
    showView("options");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
  }

  function enterVariantsMode() {
    state.mode = "variants";
    state.variantPanel.returnTo = null;
    setToolbarTitle("Варианты товара");
    showView("variants");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
  }

  async function enterUnitsMode() {
    state.mode = "units";
    state.unitPanel.returnTo = null;
    setToolbarTitle("Единицы измерения");
    showView("units");
    clearProductSelection();
    showDetailsEmpty();
    syncActiveMenuItems();
    await loadUnitsManagement();
    await loadUnitConversions();
    renderUnitsList();
  }

  // ---------------- Load ----------------

  async function loadCategories() {
    const res = await api(`/api/prod_categories?tenant_id=${TENANT_ID}`);
    state.categories = Array.isArray(res.data) ? res.data : [];
    state.allCategoryId = (state.categories.find((c) => c.code === "all") || {}).id || null;

    if (!state.currentCategoryId) {
      state.currentCategoryId = state.allCategoryId || (state.categories[0] && state.categories[0].id) || null;
    }
  }

  async function loadProducts(categoryId) {
    const cid = categoryId || state.currentCategoryId;
    if (!cid) {
      state.products = [];
      return;
    }
    const res = await api(`/api/prod_products?tenant_id=${TENANT_ID}&category_id=${cid}`);
    const products = Array.isArray(res.data) ? res.data : [];
    // Hide items that were "deleted" via soft-delete (is_active=0 & site_visibility=0).
    state.products = products.filter(
      (p) => !(Number(p.is_active) === 0 && Number(p.site_visibility) === 0)
    );
  }

  async function loadOptionGroups() {
    const res = await apiGetOptionGroups();
    state.optionGroups = Array.isArray(res.data) ? res.data : [];
  }

  async function loadVariantGroups() {
    const res = await apiGetVariantGroups();
    state.variantGroups = Array.isArray(res.data) ? res.data : [];
  }

  async function loadOptionGroupDetails(id) {
    const res = await apiGetOptionGroup(id);
    state.optionGroupDetails = res.data || null;
  }

  async function loadVariantGroupDetails(id) {
    console.log('loadVariantGroupDetails - loading group:', id);
    const res = await apiGetVariantGroup(id);
    const data = res.data || null;
    console.log('loadVariantGroupDetails - loaded data:', {
      id,
      hasData: !!data,
      hasGroup: !!data?.group,
      groupId: data?.group?.id,
      default_value_index: data?.group?.default_value_index,
      default_value_index_type: typeof data?.group?.default_value_index,
      values: data?.group?.values,
      valuesLength: data?.group?.values?.length
    });
    
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
    console.log('loadVariantGroupDetails - stored in state.variantGroupDetails:', {
      groupId: state.variantGroupDetails?.group?.id,
      default_value_index: state.variantGroupDetails?.group?.default_value_index
    });
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

  async function loadProductOptionAssignments(productId) {
    const res = await apiGetProductOptionAssignments(productId);
    state.selectedProductOptionAssignments = Array.isArray(res.data) ? res.data : [];
  }

  async function ensureOptionGroupDetails(groupId) {
    const id = Number(groupId);
    if (!Number.isFinite(id)) return null;
    if (state.optionGroupCache.has(id)) return state.optionGroupCache.get(id);
    const res = await apiGetOptionGroup(id);
    const details = res.data || null;
    if (details) state.optionGroupCache.set(id, details);
    return details;
  }

  async function loadCatalogCategories() {
    const res = await apiGetCatalogCategories();
    state.catalogCategories = Array.isArray(res.data) ? res.data : [];
  }

  async function loadUnitsManagement() {
    const res = await apiGetUnits({ all: true });
    state.units = Array.isArray(res.data) ? res.data : [];
  }

  async function loadUnitConversions() {
    const res = await apiGetUnitConversions();
    state.unitConversions = Array.isArray(res.data) ? res.data : [];
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
    
    if (optionGroupInfo) optionGroupInfo.classList.add("hidden");
    if (variantGroupInfo) variantGroupInfo.classList.add("hidden");
    if (productInfo) productInfo.classList.add("hidden");
    if (categoryInfo) categoryInfo.classList.add("hidden");
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
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    categoriesNav.innerHTML = list.map((c) => {
      const isActive = state.mode === "products" && c.id === state.currentCategoryId;
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
    const list = state.optionGroups
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

  function renderVariantGroupsList(listEl, emptyEl) {
    if (!listEl) listEl = variantsGroupsList;
    if (!emptyEl) emptyEl = variantsGroupsEmpty;
    if (!listEl) return;

    const groups = state.variantGroups || [];
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

  function renderVariantValuesSummary(values, tiers, defaultValueIndex = null, { isEditable = false, groupId = null } = {}) {
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
    return `
      <div class="option-summary-list">
        ${list.map((value, idx) => {
          const tier = tierMap.get(idx) || {};
          const discountRaw = tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0);
          const discount = Number(discountRaw) || 0;
          const metaLabel = discount > 0 ? `Скидка: ${discount}%` : "Без скидки";
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
                <span>${discount > 0 ? `${discount}%` : ""}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderProductsList() {
    if (!productsList) return;

    productsList.innerHTML = state.products.map((p) => {
      const active = p.id === state.selectedProductId ? "is-active" : "";
      const sku = p.sku ? escapeHtml(p.sku) : "—";

      const hasPhoto = Array.isArray(p.photos) && p.photos.length > 0;
      const avatar = hasPhoto
        ? `<img class="product-thumb" src="${escapeHtml(p.photos[0])}" alt="" />`
        : `<div class="product-avatar">${escapeHtml(initials(p.name))}</div>`;

      return `
        <div class="order-row product-row ${active}" data-id="${p.id}" draggable="true">
          ${avatar}
          <div>
            <div class="product-title">${escapeHtml(p.name)}</div>
            <div class="muted" style="font-size:12px;">Артикул: ${sku}</div>
          </div>
          <div class="product-right">
            <div class="pill pill-strong">${formatMoney(p.price)}</div>
          </div>
        </div>
      `;
    }).join("");

    const empty = state.products.length === 0;
    if (productsEmptyHint) productsEmptyHint.style.display = empty ? "block" : "none";

    // click select
    $$(".order-row[data-id]", productsList).forEach((row) => {
      row.addEventListener("click", async () => {
        const id = Number(row.dataset.id);
        const p = state.products.find((x) => x.id === id);
        if (!p) return;
        await openProductById(id);
        openProductTab(p, { activate: false });
      });
    });

    // sortable persist
    makeSortable(productsList, ".order-row", async () => {
      const ordered = $$(".order-row", productsList).map((el) => Number(el.dataset.id)).filter(Number.isFinite);
      await api("/api/sort/prod_products", {
        method: "POST",
        body: JSON.stringify({ category_id: state.currentCategoryId, orderedProductIds: ordered }),
      });
    });
  }

  // ---------------- Categories main list ----------------

  function renderCategoriesMainList() {
    if (!categoriesMainList) return;

    const list = state.categories
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

    categoriesMainList.innerHTML = list.map((c) => {
      const active = c.id === state.selectedCategoryId ? "is-active" : "";
      return `
        <div class="order-row category-row ${active}" data-id="${c.id}" draggable="true">
          <div>
            ${renderCategoryIcon(c.icon, "category-icon")}
          </div>
          <div>
            <div class="order-line"><b>${escapeHtml(c.title)}</b></div>
          </div>
          <div class="pill">${c.is_active ? "Активна" : "Выключена"}</div>
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
      row.addEventListener("click", () => {
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
    if (!assignments.length) {
      productOptionsAccordion.innerHTML = `<div class="empty-hint">Опции не назначены...</div>`;
      return;
    }

    productOptionsAccordion.innerHTML = assignments.map((assignment) => {
      const groupId = Number(assignment.group_id);
      const details = state.optionGroupCache.get(groupId);
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
      const res = await apiGetProductIngredients(productId);
      const list = Array.isArray(res.data) ? res.data : [];
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
              ${ingredientPhoto ? `<div class="ingredient-acc-photo"><img src="${escapeHtml(ingredientPhoto)}" alt="" /></div>` : '<div class="ingredient-acc-photo"></div>'}
              <span class="stage-meta stage-text">
                <b>${escapeHtml(ing.ingredient_name || "")}</b>
                <small>${buildSummary(ing)}</small>
              </span>
            </div>
          </div>
        `;
      }).join("");
    } catch (e) {
      console.error("Failed to load ingredients for view", e);
      productIngredientsAccordion.innerHTML = `<div class="empty-hint">Ошибка загрузки состава</div>`;
    }
  }

  function showProductDetails(p) {
    if (!p) return;

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
    
    // Show footer in view mode
    showProductFooterView();

    if (categoryStatus) categoryStatus.textContent = cat.is_active ? "Активна" : "Выключена";
    if (categoryVisibility) categoryVisibility.textContent = cat.site_visibility ? "Показывается" : "Скрыта";
    renderCategoryPreview(cat.icon);

    productEmpty && productEmpty.classList.add("hidden");
    productInfo && productInfo.classList.add("hidden");
    categoryEmpty && categoryEmpty.classList.add("hidden");
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
    
    // Отладочный вывод
    console.log('getVariantGroupFormValues - draft.default_value_index:', state.variantDraft?.group?.default_value_index);
    console.log('getVariantGroupFormValues - defaultIdx:', defaultIdx);
    
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
    
    variantItemsList.innerHTML = values.map((value, idx) => {
      const tier = tiers.find(t => Number(t.sort_order) === idx) || { discount_type: "percent", discount_percent: 0, discount_value: 0 };
      const discountType = tier.discount_type || "percent";
      const discountValue = discountType === "percent" 
        ? (tier.discount_percent != null ? tier.discount_percent : (tier.discount_value || 0))
        : (tier.discount_value != null ? tier.discount_value : (tier.discount_percent || 0));
      
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
            <input class="control" type="number" data-variant-discount="${idx}" value="${discountValue}" placeholder="0" step="0.01" min="0" ${isVariantEditable() ? "" : "disabled"} />
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
          discountInput.value = discountValue;
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
        const value = Number(input.value) || 0;
        if (discountType === "percent") {
          state.variantDraft.tiers[idx].discount_percent = value;
        } else {
          state.variantDraft.tiers[idx].discount_value = value;
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
      if (!btn) {
        console.log('Star clicked - button not found (clicked outside star button)');
        return;
      }
      
      e.stopPropagation();
      e.preventDefault();
      
      console.log('Star clicked - BUTTON FOUND:', {
        buttonElement: btn,
        dataset: btn.dataset,
        dataVariantStar: btn.dataset.variantStar,
        buttonText: btn.textContent || btn.innerHTML,
        buttonClasses: btn.className
      });
      
      // Защита от множественных кликов
      if (isSavingDefaultIndex) {
        console.log('Star clicked - already saving, ignoring duplicate click');
        return;
      }
      
      const variantIdxRaw = btn.dataset.variantStar;
      const variantIdx = Number(variantIdxRaw);
      console.log('Star clicked - INDEX EXTRACTION:', {
        raw: variantIdxRaw,
        parsed: variantIdx,
        isFinite: Number.isFinite(variantIdx),
        type: typeof variantIdxRaw
      });
      
      if (!Number.isFinite(variantIdx)) {
        console.error('Star clicked - INVALID INDEX:', {
          raw: variantIdxRaw,
          parsed: variantIdx,
          type: typeof variantIdxRaw
        });
        return;
      }
      
      // Инициализируем draft, если его нет
      if (!state.variantDraft) {
        console.log('Star clicked - variantDraft is null, attempting to initialize from variantGroupDetails');
        if (state.variantGroupDetails?.group) {
          state.variantDraft = {
            group: { ...state.variantGroupDetails.group },
            tiers: [...(state.variantGroupDetails.tiers || [])],
            assignments: [...(state.variantGroupDetails.assignments || [])]
          };
          console.log('Star clicked - initialized variantDraft from variantGroupDetails:', {
            groupId: state.variantDraft.group.id,
            default_value_index: state.variantDraft.group.default_value_index,
            valuesCount: state.variantDraft.group.values?.length
          });
        } else {
          console.error('Star clicked - no variantDraft and no variantGroupDetails, cannot proceed', {
            hasVariantGroupDetails: !!state.variantGroupDetails,
            hasGroup: !!state.variantGroupDetails?.group
          });
          return; // Нет данных для работы
        }
      } else {
        console.log('Star clicked - variantDraft exists:', {
          groupId: state.variantDraft.group?.id,
          default_value_index: state.variantDraft.group?.default_value_index,
          valuesCount: state.variantDraft.group?.values?.length
        });
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
      console.log('Star clicked - validating index:', {
        variantIdx,
        valuesLength: values.length,
        values: values
      });
      if (variantIdx < 0 || variantIdx >= values.length) {
        console.error('Star clicked - invalid index:', {
          variantIdx,
          valuesLength: values.length,
          validRange: `0-${values.length - 1}`
        });
        isSavingDefaultIndex = false;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        showToast("Неверный индекс варианта", "error");
        return;
      }
        
      // Проверяем, не устанавливаем ли мы то же значение
      const currentDefaultIdx = state.variantDraft.group.default_value_index;
      if (currentDefaultIdx === variantIdx) {
        console.log('Star clicked - same value, skipping save:', variantIdx);
        isSavingDefaultIndex = false;
        btn.style.opacity = "1";
        btn.style.pointerEvents = "auto";
        return;
      }
      
      // Устанавливаем выбранный вариант как дефолтный
      state.variantDraft.group.default_value_index = variantIdx;
      
      console.log('Star clicked - setting default_value_index to:', variantIdx);
      console.log('Star clicked - draft after update:', state.variantDraft.group);
      
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
        console.log('Star clicked - groupId obtained from variantGroupDetails:', groupId);
      }
      const mode = state.variantPanel?.mode;
      const isEditMode = (mode === "edit" || mode === "view") && groupId && Number.isFinite(groupId);
      
      console.log('Star clicked - isEditMode check:', {
        groupId,
        mode,
        isEditMode,
        hasSelectedId: !!groupId,
        panelMode: mode
      });
      
      if (isEditMode) {
        try {
          console.log('Star clicked - attempting to save default_value_index:', variantIdx, 'for group:', groupId);
          console.log('Star clicked - FULL DIAGNOSTIC BEFORE SAVE:', {
            variantIdx,
            groupId,
            mode,
            payload: { default_value_index: variantIdx },
            currentDraftValue: state.variantDraft.group.default_value_index,
            currentDetailsValue: state.variantGroupDetails?.group?.default_value_index,
            valuesArray: state.variantDraft.group.values,
            valuesLength: state.variantDraft.group.values?.length
          });
          
          // Используем отдельный endpoint для сохранения default_value_index
          const result = await apiSetVariantGroupDefaultIndex(groupId, variantIdx);
          
          console.log('Star clicked - FULL DIAGNOSTIC AFTER SAVE:', {
            variantIdx,
            groupId,
            result,
            draftValueAfterSave: state.variantDraft.group.default_value_index,
            detailsValueAfterSave: state.variantGroupDetails?.group?.default_value_index
          });
          
          console.log('Star clicked - default_value_index saved to DB successfully:', variantIdx, 'result:', result);
          
          // Проверяем, что значение действительно сохранилось - перезагружаем данные
          console.log('Star clicked - reloading group details to verify save...');
          await loadVariantGroupDetails(groupId);
          console.log('Star clicked - VERIFICATION AFTER RELOAD:', {
            reloadedValue: state.variantGroupDetails?.group?.default_value_index,
            expectedValue: variantIdx,
            match: state.variantGroupDetails?.group?.default_value_index === variantIdx
          });
          
          // Обновляем значение в загруженных деталях группы
          if (state.variantGroupDetails?.group) {
            state.variantGroupDetails.group.default_value_index = variantIdx;
            console.log('Star clicked - updated variantGroupDetails.group.default_value_index to:', variantIdx);
          }
          
          // Также обновляем в списке групп для синхронизации
          const groupInList = state.variantGroups?.find(g => Number(g.id) === groupId);
          if (groupInList) {
            groupInList.default_value_index = variantIdx;
            console.log('Star clicked - updated group in list default_value_index to:', variantIdx);
          }
          
          // Обновляем draft для синхронизации
          if (state.variantDraft?.group) {
            state.variantDraft.group.default_value_index = variantIdx;
            console.log('Star clicked - updated variantDraft.group.default_value_index to:', variantIdx);
          }
        } catch (error) {
          console.error('Star clicked - failed to save default_value_index:', error);
          console.error('Star clicked - error details:', {
            message: error.message,
            stack: error.stack,
            groupId,
            variantIdx
          });
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
        const reason = !groupId 
          ? 'no groupId' 
          : mode !== "edit" && mode !== "view" 
            ? `mode is "${mode}", not "edit" or "view"` 
            : !Number.isFinite(groupId)
              ? 'groupId is not a valid number'
              : 'unknown';
        console.log('Star clicked - NOT saving to DB (not in edit mode):', {
          groupId,
          mode,
          reason,
          hasSelectedVariantGroupId: !!state.selectedVariantGroupId,
          hasVariantGroupDetails: !!state.variantGroupDetails,
          variantGroupDetailsGroupId: state.variantGroupDetails?.group?.id
        });
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
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
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
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.add("hidden");
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

  async function saveVariantGroup() {
    if (!variantGroupForm) return;
    const formValues = getVariantGroupFormValues();
    
    // Отладочный вывод для проверки значения
    console.log('saveVariantGroup - formValues:', formValues);
    console.log('saveVariantGroup - draft.default_value_index:', state.variantDraft?.group?.default_value_index);
    
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
    
    console.log('saveVariantGroup - formValues.default_value_index:', formValues.default_value_index);
    console.log('saveVariantGroup - defaultIdx:', defaultIdx);
    console.log('saveVariantGroup - payload:', payload);

    if (!payload.title) {
      variantGroupTitleInput?.focus();
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

    // Отладочный вывод для проверки условий
    console.log('saveVariantGroup - state.selectedVariantGroupId:', state.selectedVariantGroupId);
    console.log('saveVariantGroup - state.variantPanel.mode:', state.variantPanel.mode);
    console.log('saveVariantGroup - payload before merge:', payload);
    
    if (state.selectedVariantGroupId) {
      if (state.variantPanel.mode !== "edit") {
        console.log('saveVariantGroup - EXIT: mode is not "edit"');
        return;
      }
      const groupId = state.selectedVariantGroupId;
      const values = state.variantDraft?.group?.values || [];
      
      console.log('saveVariantGroup - groupId:', groupId);
      console.log('saveVariantGroup - values:', values);
      
      // Логируем финальный объект перед отправкой
      const finalPayload = { ...payload, values };
      console.log('saveVariantGroup - final payload for PATCH:', finalPayload);
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
        console.log('saveVariantGroup - calling apiPatchVariantGroup with:', patchPayload);
        try {
          const patchResult = await apiPatchVariantGroup(groupId, patchPayload);
          console.log('saveVariantGroup - apiPatchVariantGroup result:', patchResult);
        } catch (patchError) {
          console.error('saveVariantGroup - apiPatchVariantGroup ERROR:', patchError);
          throw patchError;
        }
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
    } else {
      console.log('saveVariantGroup - EXIT: state.selectedVariantGroupId is not set');
      console.log('saveVariantGroup - Cannot save: no group ID available');
      console.log('saveVariantGroup - Current state:', {
        selectedVariantGroupId: state.selectedVariantGroupId,
        mode: state.variantPanel.mode,
        draft: state.variantDraft
      });
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
        showOptionGroupDetails({ group: state.optionDraft.group }, { mode: "create" });
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
        showVariantGroupDetails({ group: state.variantDraft.group }, { mode: "create" });
        showProductFooterEdit();
      },
      activate: true,
    });
    
    // Store tab key in state for later replacement
    state.variantPanel.tabKey = buildTabKey("variant", tabId);
    
    showVariantGroupDetails({ group: state.variantDraft.group }, { mode: "create" });
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
          state.selectedProductId = null;
          clearProductSelection();
          // Перезагружаем товары для текущей категории
          await loadProducts(state.currentCategoryId);
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

  function showDetailsEmpty() {
    const showCategory = state.mode === "categories";
    const showOption = state.mode === "options";
    const showUnit = state.mode === "units";
    productInfo && productInfo.classList.add("hidden");
    categoryInfo && categoryInfo.classList.add("hidden");
    optionGroupInfo && optionGroupInfo.classList.add("hidden");
    variantGroupInfo && variantGroupInfo.classList.add("hidden");
    unitInfo && unitInfo.classList.add("hidden");
    if (productInfoHeader) productInfoHeader.classList.add("hidden");
    setHeaderMode("product");
    if (productEmpty) productEmpty.classList.toggle("hidden", showCategory || showOption || showUnit);
    if (categoryEmpty) categoryEmpty.classList.toggle("hidden", !showCategory);
    if (optionEmpty) optionEmpty.classList.toggle("hidden", !showOption);
    if (editProductBtn && (showOption || showUnit)) editProductBtn.classList.add("hidden");
    hideProductFooter();
    closeSheet();
  }

  // ---------------- Product Footer ----------------

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
    if (!footer || !viewMode || !editMode) return;
    
    resetFooterConfirmButtons();
    footer.classList.remove("hidden");
    viewMode.classList.remove("hidden");
    editMode.classList.add("hidden");
    
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
    resetFooterConfirmButtons();
    if (footer) footer.classList.add("hidden");
    
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

  function setActiveTabKey(key, { activate = true } = {}) {
    const tab = tabsState.tabs.find((t) => t.key === key);
    if (!tab) return;
    
    // Сохраняем состояние футера текущего активного таба перед переключением
    if (tabsState.activeKey && tabsState.activeKey !== key) {
      const currentTab = tabsState.tabs.find((t) => t.key === tabsState.activeKey);
      if (currentTab) {
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
      tab.onActivate();
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

  function closeTab(key) {
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
      } else if (type === "unit") {
        // Check if unit is being edited
        if (isTempTab || (state.unitPanel.mode === "edit" || state.unitPanel.mode === "create")) {
          if (state.selectedUnitId === id || state.unitPanel.tabKey === key) {
            shouldCleanup = true;
          }
        }
      }
      
      if (shouldCleanup) {
        // Call onClose if exists (for products and categories)
        if (currentNavigationState?.onClose) {
          currentNavigationState.onClose();
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
          if (Number.isFinite(id) && editingVariants.has(id)) {
            // Cancel edit mode - TODO: implement cancelVariantEdit
            state.variantPanel.mode = "view";
            state.variantDraft = null;
            editingVariants.delete(id);
          } else if (isTempTab) {
            // Cancel create mode
            state.variantPanel.mode = "view";
            state.variantDraft = null;
            state.variantPanel.tabKey = null;
          }
        }
        
        // For units, cancel edit/create mode
        if (type === "unit" && (state.unitPanel.mode === "edit" || state.unitPanel.mode === "create")) {
          cancelUnitEdit();
          state.unitPanel.tabKey = null;
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
        }
        
        // Clear navigation state
        clearNavigationStack();
        currentNavigationState = null;
        
        // Clear content
        const productInfoBody = $("#productInfoBody");
        if (productInfoBody) {
          productInfoBody.innerHTML = "";
        }
      }
    }
    
    tabsState.tabs.splice(idx, 1);
    if (wasActive) {
      const next = tabsState.tabs[idx] || tabsState.tabs[idx - 1];
      if (next) {
        setActiveTabKey(next.key);
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

  async function openProductById(productId) {
    if (!Number.isFinite(Number(productId))) return;
    const id = Number(productId);
    const p = state.products.find((x) => Number(x.id) === id);
    if (!p) return;
    state.selectedProductId = id;
    if (productsList) {
      $$(".order-row", productsList).forEach((x) =>
        x.classList.toggle("is-active", Number(x.dataset.id) === id)
      );
    }
    const catRes = await api(`/api/prod_products/${id}/categories?tenant_id=${TENANT_ID}`);
    state.selectedProductCategories = Array.isArray(catRes.data) ? catRes.data : [];
    await loadProductOptionAssignments(id);
    showProductDetails(p);
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

  function openOptionGroupTab(groupId, title, { activate = true } = {}) {
    if (!Number.isFinite(groupId)) return;
    ensureTab({
      type: "option",
      id: groupId,
      title: title || "Опция",
      onActivate: async () => {
        state.selectedOptionGroupId = groupId;
        await loadOptionGroupDetails(groupId);
        renderAllOptionGroupsLists();
        
        // Check if this option is being edited
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
        state.selectedVariantGroupId = groupId;
        await loadVariantGroupDetails(groupId);
        renderVariantGroupsList();
        
        // Всегда показываем свежие данные с сервера, игнорируя кеш
        // При нажатии "Редактировать" будет создан новый draft из свежих данных
        showVariantGroupDetails(state.variantGroupDetails, { mode: state.variantPanel.mode || "view" });
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
    ensureTab({
      type: "category",
      id: category.id,
      title: category.title || "Категория",
      onActivate: () => {
        state.selectedCategoryId = category.id;
        // Check if this category is being edited
        if (editingCategories.has(category.id)) {
          const editingState = editingCategories.get(category.id);
          pushNavigationState(editingState.navigationState);
          showProductFooterEdit();
          return;
        }
        showCategoryDetails(category);
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
    state.selectedProductOptionAssignments = [];
    state.optionPanel.level = "empty";
    state.optionPanel.mode = "view";
    state.optionPanel.pickerSelection = new Set();
    state.optionPanel.returnTo = null;
    state.optionPanel.snapshotData = null;
    state.optionDraft = null;
    
    // Clear navigation stack
    clearNavigationStack();
    
    showDetailsEmpty();
    if (productsList) $$(".order-row", productsList).forEach((x) => x.classList.remove("is-active"));
    if (categoriesMainList) $$(".order-row", categoriesMainList).forEach((x) => x.classList.remove("is-active"));
    if (optionsGroupsList) $$(".options-row", optionsGroupsList).forEach((x) => x.classList.remove("is-active"));
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

    const defaultSelected = new Set();
    if (state.allCategoryId) defaultSelected.add(state.allCategoryId);
    if (isCreate) {
      if (state.currentCategoryId && state.currentCategoryId !== state.allCategoryId) defaultSelected.add(state.currentCategoryId);
    }

    const initialPhotos = product && Array.isArray(product.photos) ? product.photos.slice(0, 10) : [];

    const draft = {
      categories: defaultSelected,   // Set<number>
      photos: initialPhotos.map((url) => ({ kind: "url", url })), // {kind:'url'|'file', url|file, preview}
      activePhotoIdx: initialPhotos.length > 0 ? 0 : -1,
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

          // сначала грузим новые фото (если есть)
          const newFiles = draft.photos.filter((x) => x.kind === "file").map((x) => x.file);
          let newUrls = [];
          if (newFiles.length) {
            try {
              newUrls = await apiUploadImages(newFiles);
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
          
          // Логика себестоимости: если поле пустое/0 и есть состав, использовать расчётное значение
          let costPriceValue = null;
          const costPriceInputValue = String(form.cost_price.value || "").trim();
          
          // Рассчитываем себестоимость из состава для проверки
          const calculatedCostFromIngredients = calcTotalCostFromIngredientsGlobal();
          const calculatedCost = calculatedCostFromIngredients != null ? calculatedCostFromIngredients : 0;
          
          if (costPriceInputValue === "" || costPriceInputValue === "0") {
            // Если поле пустое или "0", проверяем состав
            if (draftIngredients && draftIngredients.size > 0) {
              costPriceValue = calculatedCost;
            } else {
              // Нет состава - сохраняем 0
              costPriceValue = 0;
            }
          } else {
            // Поле заполнено вручную - проверяем разницу с расчётной
            const manualCost = Number(costPriceInputValue);
            
            // Если есть состав и введённая себестоимость отличается от расчётной - показываем модальное окно
            if (draftIngredients && draftIngredients.size > 0 && calculatedCost != null && Math.abs(manualCost - calculatedCost) > 0.01) {
              // Показываем модальное окно с предложением пересчитать
              let shouldRecalculate = false;
              
              if (!window.AppModal) {
                // Если AppModal недоступен, используем confirm как fallback
                shouldRecalculate = confirm(`Расчётная себестоимость из состава: ${formatMoney(calculatedCost)}\nТекущая себестоимость: ${formatMoney(manualCost)}\n\nПересчитать себестоимость из состава?`);
              } else {
                // Используем модальное окно - создаём Promise для ожидания ответа пользователя
                const modalPromise = new Promise((resolve) => {
                  let resolved = false;
                  window.AppModal.open({
                    title: "Пересчитать себестоимость?",
                    content: `
                      <div class="modal-text">
                        <p>У товара указана себестоимость вручную.</p>
                        <p><strong>Текущая себестоимость:</strong> ${formatMoney(manualCost)}</p>
                        <p><strong>Расчётная себестоимость из состава:</strong> ${formatMoney(calculatedCost)}</p>
                        <p>Пересчитать себестоимость из состава?</p>
                      </div>
                    `,
                    saveText: "Пересчитать",
                    cancelText: "Оставить текущую",
                    onSave: async () => {
                      resolved = true;
                      resolve(true);
                      return true;
                    },
                    onClose: () => {
                      if (!resolved) {
                        resolve(false);
                      }
                    },
                  });
                });
                
                // Ждём ответа пользователя
                shouldRecalculate = await modalPromise;
              }
              
              // Обновляем значение в зависимости от выбора пользователя
              costPriceValue = shouldRecalculate ? calculatedCost : manualCost;
            } else {
              // Нет разницы или нет состава - используем введённое значение
              costPriceValue = manualCost;
            }
          }
          
          // Логика цены: если поле пустое/0 и есть состав, использовать расчётное значение
          let priceValue = null;
          const priceInputValue = String(form.price.value || "").trim();
          
          // Рассчитываем цену из состава для проверки
          const calculatedPriceFromIngredients = calcTotalPriceFromIngredientsGlobal();
          const calculatedPrice = calculatedPriceFromIngredients != null ? calculatedPriceFromIngredients : 0;
          
          if (priceInputValue === "" || priceInputValue === "0") {
            // Если поле пустое или "0", проверяем состав
            if (draftIngredients && draftIngredients.size > 0) {
              priceValue = calculatedPrice;
            } else {
              // Нет состава - сохраняем 0
              priceValue = 0;
            }
          } else {
            // Поле заполнено вручную - проверяем разницу с расчётной
            const manualPrice = Number(priceInputValue);
            
            // Если есть состав и введённая цена отличается от расчётной - показываем модальное окно
            if (draftIngredients && draftIngredients.size > 0 && calculatedPrice != null && Math.abs(manualPrice - calculatedPrice) > 0.01) {
              // Показываем модальное окно с предложением пересчитать
              let shouldRecalculate = false;
              
              if (!window.AppModal) {
                // Если AppModal недоступен, используем confirm как fallback
                shouldRecalculate = confirm(`Расчётная цена из состава: ${formatMoney(calculatedPrice)}\nТекущая цена: ${formatMoney(manualPrice)}\n\nПересчитать цену из состава?`);
              } else {
                // Используем модальное окно - создаём Promise для ожидания ответа пользователя
                const modalPromise = new Promise((resolve) => {
                  let resolved = false;
                  window.AppModal.open({
                    title: "Пересчитать цену?",
                    content: `
                      <div class="modal-text">
                        <p>У товара указана цена вручную.</p>
                        <p><strong>Текущая цена:</strong> ${formatMoney(manualPrice)}</p>
                        <p><strong>Расчётная цена из состава:</strong> ${formatMoney(calculatedPrice)}</p>
                        <p>Пересчитать цену из состава?</p>
                      </div>
                    `,
                    saveText: "Пересчитать",
                    cancelText: "Оставить текущую",
                    onSave: async () => {
                      resolved = true;
                      resolve(true);
                      return true;
                    },
                    onClose: () => {
                      if (!resolved) {
                        resolve(false);
                      }
                    },
                  });
                });
                
                // Ждём ответа пользователя
                shouldRecalculate = await modalPromise;
              }
              
              // Обновляем значение в зависимости от выбора пользователя
              priceValue = shouldRecalculate ? calculatedPrice : manualPrice;
            } else {
              // Нет разницы или нет состава - используем введённое значение
              priceValue = manualPrice;
            }
          }
          
          const payload = {
            tenant_id: TENANT_ID,
            name: String(form.name.value || "").trim(),
            sku: String(form.sku.value || "").trim(),
            description_short: String(form.description_short.value || "").trim(),
            description: String(form.description.value || "").trim(),
            price: priceValue,
            old_price: form.old_price.value === "" ? null : Number(form.old_price.value),
            cost_price: costPriceValue,
            unit_id: baseUnitId,
            base_unit_id: baseUnitId,
            base_qty: form.base_qty?.value === "" ? null : Number(form.base_qty?.value),
            stock: form.stock?.value === "" ? null : Number(form.stock?.value),
            is_active: form.is_active.checked ? 1 : 0,
            site_visibility: form.site_visibility.checked ? 1 : 0,

            // ✅ категории из chips
            category_ids: Array.from(draft.categories).filter((id) => Number.isFinite(id)),

            // ✅ фото JSON
            photos_json: finalUrls
          };

          if (!payload.name) {
            form.name.focus();
            return false;
          }

          let productId = product && product.id;
          
          // Сохранение товара
          try {
            if (isEdit && product) {
              await api(`/api/prod_products/${product.id}`, { method: "PUT", body: JSON.stringify(payload) });
            } else {
              const created = await api("/api/prod_products", { method: "POST", body: JSON.stringify(payload) });
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
            await savePcsLink(productId, baseUnitId);
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

          // Обновление данных
          try {
            await refreshAll();
          } catch (e) {
            console.error('Failed to refresh', e);
            // Не критично, продолжаем
          }
          
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
            let updatedProduct = state.products.find(p => p.id === productId);
            
            // If product not found (e.g., it's in a different category), try to reload it
            if (!updatedProduct && productId) {
              try {
                // First try: reload products from current category
                await refreshProductsOnly();
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
            try {
              await refreshProductsOnly();
            } catch (e) {
              console.error('Failed to refresh products', e);
            }
            const newProduct = state.products.find(p => p.id === productId);
            if (newProduct) {
              clearNavigationStack();
              showProductDetails(newProduct);
              showProductFooterView();
              replaceTabKey(tabKey, {
                type: "product",
                id: newProduct.id,
                title: newProduct.name || "Товар",
                onActivate: () => {
                  openProductById(newProduct.id);
                },
              });
            } else {
              clearNavigationStack();
            }
          } else {
            // No product ID - clear navigation
            clearNavigationStack();
          }
          
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
        // Удаляем обработчик клавиатуры при закрытии
        if (keyboardHandler) {
          document.removeEventListener("keydown", keyboardHandler);
          keyboardHandler = null;
        }
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
          activate: false,
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
      form.price.value = product.price != null ? String(product.price) : "";
      form.old_price.value = product.old_price != null ? String(product.old_price) : "";
      form.cost_price.value = product.cost_price != null ? String(product.cost_price) : "";
      if (form.base_unit_id) {
        form.base_unit_id.value = product.base_unit_id || product.unit_id || "";
      }
      if (form.base_qty) {
        form.base_qty.value = product.base_qty != null ? String(product.base_qty) : "";
      }
      if (form.stock) {
        form.stock.value = product.stock_qty != null ? String(product.stock_qty) : "";
      }
      form.is_active.checked = Boolean(product.is_active);
      form.site_visibility.checked = Boolean(product.site_visibility);
    } else {
      // При создании нового товара инициализируем поле себестоимости значением "0"
      if (form.cost_price) {
        form.cost_price.value = "0";
      }
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
      baseUnitSelect: $("#pe_base_unit_id", wrapper),
      baseQtyInput: $("#pe_base_qty", wrapper),
      pcsLinkWrap: $("#pePcsLinkWrap", wrapper),
      pcsFactorInput: $("#pe_pcs_factor", wrapper),
      pcsBaseLabel: $("#pePcsBaseLabel", wrapper),
      ingredientAccordion: $("#peIngredientAccordion", wrapper),
      ingredientAddBtn: $("#peIngredientAddBtn", wrapper),
      ingredientSearch: $("#peIngredientSearch", wrapper),
      ingredientCostTotal: $("#peIngredientCostTotal", wrapper),
      ingredientPriceTotal: $("#peIngredientPriceTotal", wrapper),
      ingredientBackdrop: $("#peIngredientBackdrop", wrapper),
      ingredientModal: $("#peIngredientModal", wrapper),
      ingredientModalClose: $("#peIngredientModalClose", wrapper),
      ingredientModalCancel: $("#peIngredientModalCancel", wrapper),
      ingredientModalCreate: $("#peIngredientModalCreate", wrapper),
      ingredientModalSearch: $("#peIngredientModalSearch", wrapper),
      ingredientModalList: $("#peIngredientModalList", wrapper),
      costPriceInput: $("#pe_cost_price", wrapper),
      priceInput: $("#pe_price", wrapper),
    };

    const descriptionAccordion = $("#peDescriptionAccordion", wrapper);
    if (descriptionAccordion) {
      bindAccordionContainer(descriptionAccordion);
    }

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

      function renderList() {
        const query = String(searchInput?.value || "").trim().toLowerCase();
        const list = state.categories
          .slice()
          .filter((c) => !query || String(c.title || "").toLowerCase().includes(query))
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);

        if (!listContent) return;
        listContent.innerHTML = list.map((c) => {
          const id = Number(c.id);
          const isAll = c.code === "all";
          const checked = categoryPickerSelection.has(id);
          const iconHtml = renderCategoryIcon(c.icon, "category-picker-icon");
          return `
            <div class="option-picker-row ${checked ? "is-selected" : ""} ${isAll ? "is-disabled" : ""}" data-cat-id="${id}" ${isAll ? 'data-disabled="true"' : ''}>
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
            if (categoryPickerSelection.has(id)) categoryPickerSelection.delete(id);
            else categoryPickerSelection.add(id);
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

    let categoryPickerSelection = null;
    let categoryPickerSavedFooterState = null;
    let categoryPickerSavedHandlers = null;

    let productVariantPickerSelection = null;
    let productVariantPickerSavedFooterState = null;
    let productVariantPickerSavedHandlers = null;
    const variantDetailsCache = new Map();

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
            const details = variantDetailsCache.get(groupId);
            if (details) {
              const variantData = draft.productVariants?.find(v => Number(v.id) === groupId);
              const defaultIdx = variantData?.default_value_index != null ? Number(variantData.default_value_index) : 
                                (details?.group?.default_value_index != null ? Number(details.group.default_value_index) : null);
              container.innerHTML = renderVariantValuesSummary(details?.group?.values || [], details?.tiers || [], defaultIdx, { isEditable: isEdit, groupId: groupId });
              
              // Re-bind handlers
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
        const details = optionDetailsCache.get(g.id);
        const limitsLabel = formatOptionLimits(g.min_select, g.max_select);
        const itemsHtml = details ? renderOptionItemsSummary(details.items || []) : `<div class="muted">Раскройте, чтобы загрузить пункты.</div>`;
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
                optionDetailsCache.delete(id);
                renderOptionAccordion();
              } catch (e) {
                console.error('Failed to delete option', e);
                alert('Ошибка при удалении опции');
              }
            } else {
              // For new products: just remove from draft
              draft.optionGroups.delete(id);
              optionDetailsCache.delete(id);
              renderOptionAccordion();
            }
          });
        });
      }

      ui.optionAccordion.querySelectorAll(".acc-item").forEach((item) => {
        const groupId = Number(item.dataset.optionGroup);
        if (!Number.isFinite(groupId)) return;
        const trigger = item.querySelector("[data-acc-trigger]");
        const panel = item.querySelector("[data-acc-panel]");
        if (!trigger || !panel) return;
        trigger.addEventListener("click", async () => {
          if (optionDetailsCache.has(groupId)) return;
          const details = await ensureOptionGroupDetails(groupId);
          if (details) optionDetailsCache.set(groupId, details);
          const inner = panel.querySelector(".acc-panel-inner");
          if (inner) {
            inner.innerHTML = `
              ${renderOptionItemsSummary(details?.items || [])}
            `;
          }
          refreshOpenAccordions();
        }, { once: true });
      });

      refreshOpenAccordions();
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

      // Главное фото
      if (!total) {
        ui.photoMain.src = "";
        ui.photoMain.classList.add("hidden");
        ui.photoPlaceholder.classList.remove("hidden");
        if (ui.photoPrev) ui.photoPrev.classList.add("hidden");
        if (ui.photoNext) ui.photoNext.classList.add("hidden");
        if (ui.photoDots) ui.photoDots.classList.add("hidden");
      } else {
        const active = draft.photos[draft.activePhotoIdx] || draft.photos[0];
        const src = active.kind === "url" ? active.url : active.preview;
        ui.photoPlaceholder.classList.add("hidden");
        ui.photoMain.classList.remove("hidden");
        ui.photoMain.src = src;
        
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

    function addFiles(files) {
      const existingCount = draft.photos.length;
      const canAdd = Math.max(0, 10 - existingCount);
      const take = Array.from(files).slice(0, canAdd);

      for (const f of take) {
        const preview = URL.createObjectURL(f);
        draft.photos.push({ kind: "file", file: f, preview });
      }
      // Устанавливаем активное фото на первое, если его не было
      if (draft.photos.length && draft.activePhotoIdx < 0) {
        draft.activePhotoIdx = 0;
      }
      renderPhotos();
    }

    // Загрузка фото через кнопку
    if (!isView) {
      if (ui.addPhotosBtn) ui.addPhotosBtn.addEventListener("click", () => ui.photosInput.click());
      if (ui.photosInput) {
        ui.photosInput.addEventListener("change", () => {
          if (ui.photosInput.files && ui.photosInput.files.length) addFiles(ui.photosInput.files);
          ui.photosInput.value = "";
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

        ui.photoMainContainer.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          ui.photoMainContainer.classList.remove("drag-over");
          
          const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            addFiles(files);
          }
        });
      }
    }

    // Навигация стрелками
    if (ui.photoPrev) {
      ui.photoPrev.addEventListener("click", () => navigatePhoto("prev"));
    }
    if (ui.photoNext) {
      ui.photoNext.addEventListener("click", () => navigatePhoto("next"));
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

    function getUnitLabel(unitId) {
      const unit = unitsList.find(u => Number(u.id) === Number(unitId));
      return unit?.short_title || unit?.code || unit?.title || "";
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

    async function loadProductUnitLinks() {
      if ((!isEdit && !isView) || !product || !product.id) return;
      try {
        const res = await apiGetProductUnitLinks(product.id);
        productUnitLinks = Array.isArray(res.data) ? res.data : [];
        updatePcsLinkVisibility();
      } catch (e) {
        console.error("Failed to load product unit links", e);
      }
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
          } else if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
            qtyInBase = null;
          } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
            qtyInBase = ing.ingredient_pcs_factor != null ? Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor) : null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? Number(ing.quantity || 0) * factor : null;
          }
          
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
          } else if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
            qtyInBase = null;
          } else if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
            qtyInBase = ing.ingredient_pcs_factor != null ? Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor) : null;
          } else {
            const factor = getConversionFactor(fromUnitId, baseUnitId);
            qtyInBase = factor != null ? Number(ing.quantity || 0) * factor : null;
          }
          
          if (qtyInBase != null) {
            const price = priceBase * qtyInBase;
            total += price;
            hasValidPrice = true;
          }
        });
      }
      return hasValidPrice ? total : null;
    }

    // Функция для обновления placeholder себестоимости (доступна на уровне openProductModal)
    function updateCostPricePlaceholderGlobal() {
      const costInput = ui.costPriceInput;
      const calculatedCost = calcTotalCostFromIngredientsGlobal();
      
      // Обновляем placeholder себестоимости товара
      if (costInput) {
        costInput.placeholder = calculatedCost != null ? formatMoney(calculatedCost) : "0";
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
      
      // Обновляем placeholder цены товара
      if (priceInput) {
        priceInput.placeholder = calculatedPrice != null ? formatMoney(calculatedPrice) : "0";
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

    async function loadIngredients() {
      if ((!isEdit && !isView) || !product) return;
      try {
        const res = await apiGetProductIngredients(product.id);
        ingredientsList = Array.isArray(res.data) ? res.data : [];
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
        renderIngredientAccordion();
        updateCostPricePlaceholderGlobal();
        updatePricePlaceholderGlobal();
        snapshotIngredients();
      } catch (e) {
        console.error('Failed to load ingredients', e);
      }
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
        const baseUnitId = getIngredientBaseUnitId(ing);
        const fromUnitId = Number(ing.unit_id || 0);
        if (!baseUnitId || !fromUnitId) return null;
        if (Number(fromUnitId) === Number(baseUnitId)) return Number(ing.quantity || 0);
        if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) return null;
        if (pcsUnitId && Number(fromUnitId) === Number(pcsUnitId)) {
          return ing.ingredient_pcs_factor != null ? Number(ing.quantity || 0) * Number(ing.ingredient_pcs_factor) : null;
        }
        const factor = getConversionFactor(fromUnitId, baseUnitId);
        return factor != null ? Number(ing.quantity || 0) * factor : null;
      };

      const getAllowedUnits = (ing) => {
        const baseUnitId = getIngredientBaseUnitId(ing);
        if (!baseUnitId) return unitsList;
        return unitsList.filter((u) => {
          if (Number(u.id) === Number(baseUnitId)) return true;
          if (pcsUnitId && Number(baseUnitId) === Number(pcsUnitId)) {
            return Number(u.id) === Number(pcsUnitId);
          }
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
        const controlsHtml = isView
          ? `<span class="acc-chevron"><i class="fas fa-chevron-down"></i></span>`
          : `
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
              ${ingredientPhoto ? `<div class="ingredient-acc-photo"><img src="${escapeHtml(ingredientPhoto)}" alt="" /></div>` : '<div class="ingredient-acc-photo"></div>'}
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
          });
        });
      }

      async function renderList() {
        if (!listContent) return;
        const query = String(searchInput?.value || "").trim().toLowerCase();
        
        try {
          const categoryId = Number.isFinite(ingredientPickerCategoryId) ? ingredientPickerCategoryId : null;
          const res = await apiGetCatalogProducts({ query, categoryId });
          const products = Array.isArray(res.data) ? res.data : [];

          listContent.innerHTML = products
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
                let unitId = null;

                if (selectedProduct && selectedProduct.unit_id) {
                  unitId = Number(selectedProduct.unit_id);
                } else if (unitsList.length > 0) {
                  unitId = unitsList[0].id;
                }

                if (!unitId) {
                  console.warn('No unit_id for product', productId);
                  continue;
                }

                const productName = selectedProduct?.name || '';
                const productPrice = Number(selectedProduct?.price || 0);
                const productCostPrice = Number(selectedProduct?.cost_price || 0);
                const productPhotos = Array.isArray(selectedProduct?.photos_json) ? selectedProduct.photos_json : [];
                const baseUnitId = Number(selectedProduct?.base_unit_id || selectedProduct?.unit_id || unitId || 0);
                const baseQty = selectedProduct?.base_qty != null ? Number(selectedProduct.base_qty) : null;
                const unit = unitsList.find(u => u.id === (baseUnitId || unitId));

                nextSort += 10;
                draftIngredients.set(productId, {
                  id: 0,
                  ingredient_id: productId,
                  ingredient_name: productName,
                  ingredient_price: productPrice,
                  ingredient_cost_price: productCostPrice,
                  ingredient_base_unit_id: baseUnitId || null,
                  ingredient_base_qty: baseQty,
                  ingredient_photos: productPhotos,
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
        const products = Array.isArray(res.data) ? res.data : [];
        const existingIds = new Set(Array.from(draftIngredients.keys()));

        ui.ingredientModalList.innerHTML = products
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
            let unitId = null;
            
            if (selectedProduct && selectedProduct.unit_id) {
              unitId = Number(selectedProduct.unit_id);
            } else if (unitsList.length > 0) {
              unitId = unitsList[0].id;
            }
            
            if (!unitId) {
              alert('Нет доступных единиц измерения');
              return;
            }

            // Get product name and price from catalog
            const productName = selectedProduct?.name || '';
            const productPrice = Number(selectedProduct?.price || 0);
            const productCostPrice = Number(selectedProduct?.cost_price || 0);
            const productPhotos = Array.isArray(selectedProduct?.photos_json) ? selectedProduct.photos_json : [];
            const baseUnitId = Number(selectedProduct?.base_unit_id || selectedProduct?.unit_id || unitId || 0);
            const baseQty = selectedProduct?.base_qty != null ? Number(selectedProduct.base_qty) : null;

            let nextSort = 0;
            draftIngredients.forEach((item) => {
              nextSort = Math.max(nextSort, Number(item.sort_order || 0));
            });
            nextSort += 10;

            // Add to draft (works for both new and existing products)
            draftIngredients.set(productId, {
              id: 0,
              ingredient_id: productId,
              ingredient_name: productName,
              ingredient_price: productPrice,
              ingredient_cost_price: productCostPrice,
              ingredient_base_unit_id: baseUnitId || null,
              ingredient_base_qty: baseQty,
              ingredient_photos: productPhotos,
              ingredient_unit_id: baseUnitId || unitId,
              quantity: 1,
              unit_id: baseUnitId || unitId,
              unit_code: unitsList.find(u => u.id === (baseUnitId || unitId))?.code || '',
              unit_title: unitsList.find(u => u.id === (baseUnitId || unitId))?.title || '',
              unit_short_title: unitsList.find(u => u.id === (baseUnitId || unitId))?.short_title || '',
              quantity_min: null,
              quantity_max: null,
              quantity_step: null,
              price_override: null,
              is_variable: false,
              sort_order: nextSort,
            });
            renderIngredientAccordion();
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
      });
    }

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
      } else {
        // При создании нового товара инициализируем поле себестоимости состава
        updateCostPricePlaceholderGlobal();
        updatePricePlaceholderGlobal();
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
    };

    // Clone template content
    const template = document.querySelector("#tplCategoryEditor");
    if (!template) return;
    const content = template.content.cloneNode(true);
    const wrapper = document.createElement("div");
    wrapper.appendChild(content);

    // Get form and UI elements
    const form = wrapper.querySelector("#categoryEditorForm");
    if (!form) return;

    const ui = {
      iconPreview: wrapper.querySelector("#ceIconPreview"),
      iconPlaceholder: wrapper.querySelector("#ceIconPlaceholder"),
      iconFileInput: wrapper.querySelector("#ceIconFile"),
      iconUploadBtn: wrapper.querySelector("#ceIconUploadBtn"),
      iconDeleteBtn: wrapper.querySelector("#ceIconDeleteBtn"),
    };

    // Fill form if editing
    if (isEdit && cat) {
      const titleInput = form.querySelector("#ce_title");
      const codeInput = form.querySelector("#ce_code");
      const iconInput = form.querySelector("#ce_icon");
      const sortInput = form.querySelector("#ce_sort");
      const activeInput = form.querySelector("input[name='is_active']");
      const visibilityInput = form.querySelector("input[name='site_visibility']");
      
      if (titleInput) titleInput.value = cat.title || "";
      if (codeInput) codeInput.value = cat.code || "";
      if (iconInput) iconInput.value = cat.icon || "";
      if (sortInput) sortInput.value = cat.sort_order != null ? String(cat.sort_order) : "";
      if (activeInput) activeInput.checked = Boolean(cat.is_active);
      if (visibilityInput) visibilityInput.checked = Boolean(cat.site_visibility);
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

    // Setup navigation state
    const navigationState = {
      type: "category-edit",
      category: cat,
      content: wrapper,
      savedTitle: isEdit && cat ? cat.title : null,
      savedSku: "Категория",
      tabKey: tabKey,
      onSave: async () => {
        if (!form) return false;
        
        const titleInput = form.querySelector("#ce_title");
        const codeInput = form.querySelector("#ce_code");
        const sortInput = form.querySelector("#ce_sort");
        const activeInput = form.querySelector("input[name='is_active']");
        const visibilityInput = form.querySelector("input[name='site_visibility']");
        
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
        };

        if (!payload.title) {
          if (titleInput) titleInput.focus();
          return false;
        }

        try {
          let savedCategory = null;
          if (isEdit && cat) {
            await api(`/api/prod_categories/${cat.id}`, { method: "PUT", body: JSON.stringify(payload) });
            savedCategory = cat; // Keep reference to updated category
          } else {
            const res = await api("/api/prod_categories", { method: "POST", body: JSON.stringify(payload) });
            savedCategory = res; // New category from API response
          }
          await refreshAll();
          // Update navigation state with saved category reference
          navigationState.category = savedCategory;
          
          // Remove from editing state after successful save
          if (isEdit && cat && cat.id) {
            editingCategories.delete(cat.id);
          }
          
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

  async function refreshProductsOnly() {
    await loadProducts(state.currentCategoryId);
    renderProductsList();
    if (state.selectedProductId && !state.products.some((p) => p.id === state.selectedProductId)) {
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
      await refreshProductsOnly();
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

    if (addCategoryBtn) {
      addCategoryBtn.addEventListener("click", () => {
        enterCategoriesMode();
        renderCategoriesMainList();
      });
    }

    if (addMainBtn) {
      addMainBtn.addEventListener("click", () => {
        if (state.mode === "categories") return openCategoryEditor({ mode: "create" });
        if (state.mode === "products") return openProductModal({ mode: "create" });
        if (state.mode === "options") return startOptionCreate();
        if (state.mode === "variants") return startVariantCreate();
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
        if (view === "units") {
          enterUnitsMode();
          loadUnitsManagement().then(() => {
            renderUnitsList();
            loadUnitConversions();
          });
          return;
        }
        if (view === "products") {
          enterProductsMode();
          if (!restoreSuspendedProductNavigation()) {
            clearProductSelection();
          }
          return;
        }
        state.mode = view;
        setToolbarTitle(view === "products" ? (getCurrentCategory()?.title || "Товары") : view);
        showView(view);
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
        } else if (state.selectedProductId) {
          confirmProductDelete();
        }
      }, "Удалить");
    }

    if (footerEditBtn) {
      footerEditBtn.addEventListener("click", () => {
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
        } else {
          // Products mode - existing logic
        const p = state.products.find((x) => x.id === state.selectedProductId);
        if (p) {
          if (editingProducts.has(p.id)) {
            const editingState = editingProducts.get(p.id);
            pushNavigationState(editingState.navigationState);
          } else {
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
        if (currentNavigationState?.product?.id) {
          confirmProductDelete();
        }
      }, "Удалить");
    }

    if (footerCancelBtn) {
      attachTwoStepButton(footerCancelBtn, () => {
        // Check if picker is open - priority over product edit
        if (footerCancelBtn.dataset.pickerType === "option") {
          const closeFn = window._closeOptionPickerFn;
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
        if (footerCancelBtn.dataset.pickerType === "category") {
          const closeFn = window._closeCategoryPickerFn;
          if (closeFn) closeFn();
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
      footerSaveBtn.addEventListener("click", async () => {
        // Check if picker is open - priority over product edit
        if (footerSaveBtn.dataset.pickerType === "option") {
          const saveFn = window._saveOptionPickerFn;
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
        if (footerSaveBtn.dataset.pickerType === "category") {
          const saveFn = window._saveCategoryPickerFn;
          if (saveFn) {
            await saveFn();
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
        // Option edit save
        if (state.mode === "options" && state.optionPanel.mode === "edit" && state.selectedOptionGroupId) {
          try {
            await saveOptionGroup();
          } catch (e) {
            console.error('Error saving option', e);
            alert('Ошибка при сохранении опции: ' + (e.message || 'Неизвестная ошибка'));
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
      // Placeholder for future actions
      footerMoreEditBtn.addEventListener("click", () => {
        // TODO: Add actions menu
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
        closeSheet();
      }
    });
  }

  // ---------------- Init ----------------

  document.addEventListener("DOMContentLoaded", async () => {
    bindAccordionContainer(productsAccordion);
    bindAccordionContainer(optionGroupInfo);
    bindAccordionContainer(variantGroupInfo);
    if (unitInfo) {
      bindAccordionContainer(unitInfo);
    }
    bindEvents();

    await loadUnitsManagement();
    await loadUnitConversions();
    await refreshAll();
    enterProductsMode(state.currentCategoryId);
    await refreshProductsOnly();

    // ✅ гарантированно "до конца"
    requestAnimationFrame(refreshOpenAccordions);
  });

  // Слушать изменение точки продаж
  document.addEventListener('tenantStoreChanged', async (event) => {
    console.log('Точка продаж изменена (products):', event.detail.store);
    // Перезагрузить товары и категории для новой точки
    await refreshAll();
  });
})();



