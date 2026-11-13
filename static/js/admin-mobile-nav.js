(function () {
  const MOBILE_QUERY = "(max-width: 768px)";
  const body = document.body;
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuButton = document.getElementById("adminMobileMenuBtn");
  const backButton = document.getElementById("adminMobileHeaderBackBtn");
  const titleNode = document.getElementById("adminMobilePageTitle");
  const headerCopy = document.getElementById("adminMobileHeaderCopy");
  const mobileOrderTabs = document.getElementById("adminMobileOrderTabs");
  const mobileActions = document.getElementById("adminMobileHeaderActions");
  const sidebarBrand = document.getElementById("adminSidebarBrand");
  const sidebarAccount = document.getElementById("adminSidebarAccount");
  const leftColumn = document.querySelector(".page-col-left");
  const centerColumn = document.querySelector(".page-col-center");
  const rightColumn = document.querySelector(".page-col-right");

  if (!body || !sidebar || !menuButton || !backButton || !titleNode || !leftColumn || !centerColumn || !rightColumn) return;

  const activePage = String(body.dataset.adminActivePage || "").trim();
  const hasDedicatedMobileNavigation = activePage === "chat";
  const activeNav = sidebar.querySelector('.nav-item[data-nav-key="' + activePage + '"]');
  const rootTitle = readText(activeNav && activeNav.querySelector(".nav-text")) || readText(titleNode) || "Админка";
  const isNewOrderPage = activePage === "new-order";
  function isEditorNavigation() { return isNewOrderPage || body.classList.contains('new-order-editor-active'); }
  function usesDedicatedMobileNavigation() { return hasDedicatedMobileNavigation && !isEditorNavigation(); }
  function getRootLevel() { return isEditorNavigation() || activePage === "orders" || activePage === "courier-screen" ? "center" : "left"; }
  const ordersStages = ['orders', 'courier-screen'].includes(activePage) ? document.getElementById('ordersStagesList') : null;
  const ordersStagesOrigin = ordersStages ? document.createComment('orders-stages-origin') : null;
  function syncOrdersStagesPlacement() {
    if (!ordersStages) return;
    const destination = document.querySelector('#ordersCenterPane > .center-stack');
    if (isMobile() && destination) {
      if (!ordersStagesOrigin.parentNode) ordersStages.parentNode.insertBefore(ordersStagesOrigin, ordersStages);
      if (ordersStages.parentNode !== destination) destination.prepend(ordersStages);
    } else if (ordersStagesOrigin.parentNode) {
      ordersStagesOrigin.parentNode.insertBefore(ordersStages, ordersStagesOrigin);
      ordersStagesOrigin.remove();
    }
  }
  const catalogTabs = document.getElementById("newOrderMobileTabs");
  const catalogOpen = document.getElementById("newOrderMobileOpen");
  if (['orders', 'courier-screen'].includes(activePage) && catalogTabs) {
    const dock = catalogTabs.closest('.new-order-mobile-dock');
    if (dock) centerColumn.appendChild(dock);
    if (activePage === 'courier-screen') document.getElementById('newOrderMobileCategories')?.classList.add('hidden');
  }
  const viewStack = [{ level: getRootLevel(), title: rootTitle }];
  let currentLevel = getRootLevel();
  let mobileSubview = null;
  let closingSubview = false;
  let restoringView = false;
  let pendingRightView = null;
  let navigationRevision = 0;
  const scrollSelector = '.panel-body, .no-scrollbar, .orders-list, .products-grid, .clients-list, .team-editor-scroll';

  function captureViewScroll(view = viewStack[viewStack.length - 1]) {
    if (!view || !isMobile()) return;
    const column = view.subview?.element || (currentLevel === 'right' ? rightColumn : currentLevel === 'center' ? centerColumn : leftColumn);
    view.scroll = { x: window.scrollX, y: window.scrollY, nodes: [column, ...column.querySelectorAll(scrollSelector)].map((node, index) => ({
      id: node.id, index, top: node.scrollTop, left: node.scrollLeft,
    })) };
  }

  function restoreViewScroll(view) {
    const revision = ++navigationRevision;
    window.requestAnimationFrame(function () {
      if (revision !== navigationRevision) return;
      const column = view?.subview?.element || (currentLevel === 'right' ? rightColumn : currentLevel === 'center' ? centerColumn : leftColumn);
      const nodes = [column, ...column.querySelectorAll(scrollSelector)];
      if (view?.scroll) {
        view.scroll.nodes.forEach(function (saved) {
          const node = saved.id ? document.getElementById(saved.id) : nodes[saved.index];
          if (node && column.contains(node)) { node.scrollTop = saved.top; node.scrollLeft = saved.left; }
        });
        window.scrollTo(view.scroll.x, view.scroll.y);
      } else {
        nodes.forEach(function (node) { node.scrollTop = 0; });
        window.scrollTo(0, 0);
      }
    });
  }

  function rememberRightView(key, restore, restoreOrigin) {
    if (!isMobile() || usesDedicatedMobileNavigation() || restoringView || mobileSubview) return;
    const context = { key: String(key), restore };
    if (currentLevel !== 'right') {
      const origin = viewStack[viewStack.length - 1];
      if (currentLevel === 'center' && origin && typeof restoreOrigin === 'function') origin.restore = restoreOrigin;
      pendingRightView = context;
      return;
    }
    const current = viewStack[viewStack.length - 1];
    if (current?.key && current.key !== context.key) {
      captureViewScroll(current);
      viewStack.push({ level: 'right', title: titleNode.textContent, ...context });
    } else if (current) Object.assign(current, context);
  }

  document.addEventListener('click', function () {
    if (!restoringView) captureViewScroll();
  }, true);
  let actionOrigin = null;
  let movedActions = null;

  const themeButton = document.getElementById("theme-toggle");
  const brand = document.querySelector("#adminHeaderActions")
    ? document.querySelector("body > header .header-left .logo")
    : null;
  const accountMenu = document.querySelector("#adminHeaderActions .user-menu-wrapper");
  const brandOrigin = brand ? document.createComment("admin-brand-origin") : null;
  const themeOrigin = themeButton ? document.createComment("theme-toggle-origin") : null;
  const accountOrigin = accountMenu ? document.createComment("user-menu-origin") : null;
  const hasOrderTabs = isEditorNavigation() || activePage === "orders" || activePage === "courier-screen" || activePage === "products" || activePage === "cash" || activePage === "clients" || activePage === "marketing" || activePage === "settings" || activePage === "chat";
  const orderTabs = hasOrderTabs
    ? Array.prototype.slice.call(document.querySelectorAll("#newOrderTabs, #orderTabs, #orderTabsCheckout, #chatRightTabs, #productTabs, #cashOrderTabs, #clientTabs, #settingsRightTabs, #settingsDeliveryTabs"))
    : [];
  const orderTabOrigins = orderTabs.map(function () {
    return document.createComment("order-tabs-origin");
  });
  let orderTabsObserver = null;

  function isMobile() {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  function readText(node) {
    return String((node && node.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function itemTitle(target) {
    if (!target) return "";
    const preferred = target.querySelector(
      ".stage-text b, .stage-text strong, .stage-meta b, .stage-meta strong, .product-title, .order-title, .client-name, b, strong"
    );
    return readText(preferred) || readText(target).replace(/\s+\d+$/, "").trim();
  }

  function visible(node) {
    if (!node || node.hidden || node.classList.contains("hidden")) return false;
    return window.getComputedStyle(node).display !== "none";
  }

  function restoreContextActions() {
    if (!movedActions || !actionOrigin || !actionOrigin.parentNode) return;
    actionOrigin.parentNode.insertBefore(movedActions, actionOrigin);
    actionOrigin.remove();
    movedActions = null;
    actionOrigin = null;
  }

  function moveContextActions(level) {
    restoreContextActions();
    body.classList.remove('orders-mobile-selection');
    const showOrdersActionsOnRoot = activePage === "orders" && level === "left";
    const showCourierActionsOnRoot = activePage === "courier-screen" && level === "left";
    const showCashActionsOnRoot = activePage === "cash" && level === "left";
    if (!isMobile() || (level !== "center" && !showOrdersActionsOnRoot && !showCourierActionsOnRoot && !showCashActionsOnRoot) || !mobileActions) return;
    const selectingOrders = activePage === 'orders' && body.classList.contains('orders-selection-mode');
    const selectionActions = selectingOrders ? document.getElementById('ordersBulkActions') : null;
    body.classList.toggle('orders-mobile-selection', Boolean(selectionActions && (level === 'center' || showOrdersActionsOnRoot)));
    const candidates = Array.prototype.slice.call(centerColumn.querySelectorAll(".toolbar-right"));
    const actions = isEditorNavigation() ? document.getElementById("newOrderToolbar")
      : selectionActions || (activePage === 'orders' ? document.querySelector('#ordersToolbar .toolbar-right') : candidates.find(visible));
    if (!actions) return;
    actionOrigin = document.createComment("mobile-toolbar-actions-origin");
    actions.parentNode.insertBefore(actionOrigin, actions);
    mobileActions.appendChild(actions);
    movedActions = actions;
  }

  function moveAccountControls() {
    if (!sidebarAccount) return;
    if (brand && sidebarBrand && brand.parentNode !== sidebarBrand) {
      brand.parentNode.insertBefore(brandOrigin, brand);
      sidebarBrand.appendChild(brand);
    }
    if (themeButton && themeButton.parentNode !== sidebarAccount) {
      themeButton.parentNode.insertBefore(themeOrigin, themeButton);
      themeButton.setAttribute("data-sidebar-tooltip", "Сменить тему");
      sidebarAccount.appendChild(themeButton);
    }
    if (accountMenu && accountMenu.parentNode !== sidebarAccount) {
      accountMenu.parentNode.insertBefore(accountOrigin, accountMenu);
      const profileButton = accountMenu.querySelector("#shopProfileBtn");
      if (profileButton && !profileButton.hasAttribute("data-sidebar-tooltip")) profileButton.setAttribute("data-sidebar-tooltip", "Профиль");
      sidebarAccount.appendChild(accountMenu);
    }
  }

  function restoreAccountControls() {
    if (brand && brandOrigin && brandOrigin.parentNode) {
      brandOrigin.parentNode.insertBefore(brand, brandOrigin);
      brandOrigin.remove();
    }
    if (themeButton && themeOrigin && themeOrigin.parentNode) {
      themeOrigin.parentNode.insertBefore(themeButton, themeOrigin);
      themeOrigin.remove();
    }
    if (accountMenu && accountOrigin && accountOrigin.parentNode) {
      accountOrigin.parentNode.insertBefore(accountMenu, accountOrigin);
      accountOrigin.remove();
    }
  }

  function syncOrderTabsHeader() {
    const categoriesButton = document.getElementById('newOrderMobileCategories');
    if (categoriesButton) {
      const addOrder = activePage === 'orders' && !isEditorNavigation();
      const label = addOrder ? '\u041d\u043e\u0432\u044b\u0439 \u0437\u0430\u043a\u0430\u0437' : '\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438';
      if (categoriesButton.getAttribute('aria-label') !== label) categoriesButton.setAttribute('aria-label', label);
      const icon = categoriesButton.querySelector('i');
      const iconClass = addOrder ? 'fas fa-plus' : 'fas fa-th-large';
      if (icon && icon.className !== iconClass) icon.className = iconClass;
    }
    if (!mobileOrderTabs) return;
    if (catalogOpen) catalogOpen.disabled = !catalogTabs?.querySelector('.product-tab.is-active');
    const keepSubviewOrderTabs = Boolean(mobileSubview?.keepOrderTabs);
    const showTabs = isMobile()
      && currentLevel === "right"
      && (!mobileSubview || keepSubviewOrderTabs)
      && hasOrderTabs
      && !!mobileOrderTabs.querySelector(".product-tab");
    mobileOrderTabs.classList.toggle("hidden", !showTabs);
    (headerCopy || titleNode).classList.toggle("hidden", showTabs && !keepSubviewOrderTabs);
  }

  function moveOrderTabs() {
    if (!mobileOrderTabs || !isMobile() || !hasOrderTabs) return;
    orderTabs.forEach(function (tabs, index) {
      const hostOrderTabs = ['orders','courier-screen','chat'].includes(activePage);
      if (hostOrderTabs) {
        const headerTabsId = activePage === 'chat' ? 'chatRightTabs' : (isEditorNavigation() ? 'orderTabsCheckout' : 'orderTabs');
        if (tabs.id !== headerTabsId) {
          const origin = orderTabOrigins[index];
          if (origin?.parentNode) { origin.parentNode.insertBefore(tabs, origin); origin.remove(); }
          return;
        }
      } else if (isEditorNavigation() !== (tabs.id === 'newOrderTabs')) return;
      const destination = mobileOrderTabs;
      if (!destination || tabs.parentNode === destination) return;
      if (!orderTabOrigins[index].parentNode) tabs.parentNode.insertBefore(orderTabOrigins[index], tabs);
      destination.appendChild(tabs);
    });
    if (!orderTabsObserver) {
      orderTabsObserver = new MutationObserver(syncOrderTabsHeader);
      orderTabs.forEach(function (tabs) {
        orderTabsObserver.observe(tabs, { childList: true, subtree: true });
      });
    }
    syncOrderTabsHeader();
  }

  function restoreOrderTabs() {
    orderTabs.forEach(function (tabs, index) {
      const origin = orderTabOrigins[index];
      if (origin && origin.parentNode) {
        origin.parentNode.insertBefore(tabs, origin);
        origin.remove();
      }
    });
    if (orderTabsObserver) {
      orderTabsObserver.disconnect();
      orderTabsObserver = null;
    }
    if (mobileOrderTabs) mobileOrderTabs.classList.add("hidden");
    (headerCopy || titleNode).classList.remove("hidden");
  }

  function closeSidebar() {
    if (window.__adminSidebarApi && typeof window.__adminSidebarApi.close === "function") {
      window.__adminSidebarApi.close();
    } else {
      sidebar.classList.remove("is-open");
      if (overlay) overlay.classList.remove("is-active");
      body.classList.remove("sidebar-open");
    }
    menuButton.setAttribute("aria-expanded", "false");
  }

  function openSidebar() {
    if (window.__adminSidebarApi && typeof window.__adminSidebarApi.open === "function") {
      window.__adminSidebarApi.open();
    } else {
      sidebar.classList.add("is-open");
      if (overlay) overlay.classList.add("is-active");
      body.classList.add("sidebar-open");
    }
    menuButton.setAttribute("aria-expanded", "true");
  }

  function showLevel(level, title, push) {
    if (!isMobile()) return;
    const nextLevel = level === "right" ? "right" : level === "center" ? "center" : "left";
    const changedLevel = currentLevel !== nextLevel;
    if (changedLevel && push) captureViewScroll();
    currentLevel = nextLevel;
    body.classList.remove("admin-mobile-view-left", "admin-mobile-view-center", "admin-mobile-view-right");
    body.classList.add("admin-mobile-pages", "admin-mobile-view-" + nextLevel);
    if (isEditorNavigation()) document.dispatchEvent(new CustomEvent('neworder:editor-view'));
    titleNode.textContent = String(title || rootTitle).trim() || rootTitle;
    const isRoot = nextLevel === getRootLevel() && !mobileSubview;
    menuButton.classList.toggle("hidden", !isRoot);
    backButton.classList.toggle("hidden", isRoot);
    moveContextActions(nextLevel);
    moveOrderTabs();
    syncOrderTabsHeader();
    if (isEditorNavigation() && nextLevel === getRootLevel() && push && !mobileSubview) {
      const root = viewStack.find((view) => view.level === nextLevel && !view.subview);
      viewStack.splice(0, viewStack.length, { ...root, level: nextLevel, title: titleNode.textContent });
    }
    else if (push) viewStack.push({ level: nextLevel, title: titleNode.textContent });

    if (nextLevel === 'right' && pendingRightView) {
      Object.assign(viewStack[viewStack.length - 1], pendingRightView);
      pendingRightView = null;
    }
    if (changedLevel || push) restoreViewScroll(viewStack[viewStack.length - 1]);
  }

  function restorePreviousView() {
    const previous = viewStack[viewStack.length - 1] || { level: getRootLevel(), title: rootTitle };
    mobileSubview = previous.subview || null;
    showLevel(previous.level, previous.title, false);
    if (mobileSubview) {
      menuButton.classList.add('hidden');
      backButton.classList.remove('hidden');
    }
    restoreViewScroll(previous);
    return previous;
  }

  function goBack() {
    if (!isMobile() || restoringView) return;
    if (mobileSubview) {
      if (mobileSubview.beforeBack && mobileSubview.beforeBack() === false) return;
      const subview = mobileSubview;
      mobileSubview = null;
      if (viewStack[viewStack.length - 1]?.subview) viewStack.pop();
      closingSubview = true;
      try { if (typeof subview.onBack === 'function') subview.onBack(); }
      finally { closingSubview = false; }
      restorePreviousView();
      return;
    }
    const localBack = (currentLevel === 'right'
      ? ['settingsDeliveryZoneColorEditorBackBtn', 'clientOrderBackBtn']
      : currentLevel === 'center' ? ['clientsToolbarBackBtn'] : [])
      .map((id) => document.getElementById(id)).find((button) => button && button.getClientRects().length);
    if (localBack) { localBack.click(); return; }
    if (body.classList.contains('team-rbac-permission-mode')) {
      const returnToRole = Array.from(document.querySelectorAll('[data-rbac-return-editor]')).find((button) => button.getClientRects().length);
      if (returnToRole) { returnToRole.click(); return; }
    }
    if (usesDedicatedMobileNavigation()) {
      if (body.classList.contains('chat-mobile-right-open')) document.getElementById('chatMobileRightBackBtn')?.click();
      else if (!body.classList.contains('chat-mobile-left-open')) document.getElementById('chatMobileClientsBackBtn')?.click();
      else openSidebar();
      return;
    }
    if (viewStack.length <= 1) { openSidebar(); return; }
    const outgoing = viewStack.pop();
    const previous = restorePreviousView();
    if (outgoing.level === 'right' && typeof previous.restore === 'function') {
      restoringView = true;
      Promise.resolve().then(previous.restore).catch(console.error).finally(function () {
        restoringView = false;
        restoreViewScroll(previous);
      });
    }
  }

  function resolveRightTitle(fallback) {
    const node = rightColumn.querySelector(
      ".product-header-title, .panel-title, .toolbar-title, .order-client-name-text, [data-mobile-page-title]"
    );
    return readText(node) || String(fallback || "").trim() || rootTitle;
  }

  function isLeftNavigationTarget(target) {
    const item = target.closest(".stage-item, .chat-client-item, .chat-client-row, [data-chat-client-id]");
    if (!item || !leftColumn.contains(item)) return null;
    if (item.matches(".acc-trigger, [data-acc-trigger], .is-dashed") || item.disabled) return null;
    return item;
  }

  function isCenterDetailTarget(target) {
    const item = target.closest(
      ".settings-card, .order-row, .product-row, .client-row, .options-list > *, .orders-list > *, [data-order-id], [data-product-id], [data-client-id]"
    );
    if (!item || !centerColumn.contains(item) || item.matches(".empty-hint, .hidden") || item.closest(".toolbar")) return null;
    const nestedControl = target.closest("button, input, label, select, textarea, a");
    if (nestedControl) return null;
    return item;
  }

  menuButton.addEventListener("click", function () {
    if (sidebar.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  backButton.addEventListener("click", goBack);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  leftColumn.addEventListener("click", function (event) {
    if (!isMobile() || usesDedicatedMobileNavigation() || isEditorNavigation()) return;
    const item = isLeftNavigationTarget(event.target);
    if (!item) return;
    const title = itemTitle(item) || rootTitle;
    window.setTimeout(function () {
      if (currentLevel === "left" && !body.classList.contains("modal-open") && !body.classList.contains("sheet-open")) {
        showLevel("center", title, true);
      }
    }, 0);
  });

  centerColumn.addEventListener("click", function (event) {
    if (!isMobile() || usesDedicatedMobileNavigation() || isEditorNavigation()) return;
    const item = isCenterDetailTarget(event.target);
    if (!item) return;
    const title = itemTitle(item) || readText(centerColumn.querySelector(".toolbar-title")) || rootTitle;
    window.setTimeout(function () {
      if (currentLevel === "center" && !body.classList.contains("modal-open") && !body.classList.contains("sheet-open")) {
        showLevel("right", title, true);
      }
    }, 40);
  });

  if (catalogTabs) {
    document.getElementById("newOrderMobileCategories")?.addEventListener("click", function () {
      if (activePage === 'orders' && !isEditorNavigation()) return;
      showLevel("left", "\u041a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u0438", true);
    });
    catalogOpen?.addEventListener("click", function () {
      window.__adminMobilePages.openRight(activePage === 'courier-screen' ? "Заказ" : "Новый заказ");
    });
  }

  function syncViewport() {
    syncOrdersStagesPlacement();
    if (isMobile()) {
      ensureMobileBackEntry();
      moveAccountControls();
      if (usesDedicatedMobileNavigation()) {
        restoreContextActions();
        restoreOrderTabs();
        body.classList.remove("admin-mobile-pages", "admin-mobile-view-left", "admin-mobile-view-center", "admin-mobile-view-right");
        titleNode.textContent = rootTitle;
        menuButton.classList.remove("hidden");
        backButton.classList.add("hidden");
        return;
      }
      const current = viewStack[viewStack.length - 1] || { level: currentLevel, title: rootTitle };
      showLevel(current.level, current.title, false);
      return;
    }
    restoreContextActions();
    body.classList.remove('orders-mobile-selection');
    moveAccountControls();
    restoreOrderTabs();
    closeSidebar();
    body.classList.remove("admin-mobile-pages", "admin-mobile-view-left", "admin-mobile-view-center", "admin-mobile-view-right");
    menuButton.classList.add("hidden");
    backButton.classList.add("hidden");
  }

  document.addEventListener('ordersSelectionModeChanged', function () { moveContextActions(currentLevel); });
  window.addEventListener("resize", syncViewport);
  window.addEventListener("pageshow", syncViewport);
  window.__adminMobilePages = {
    rememberRightView,
    forgetRightView: function (key) {
      if (pendingRightView?.key === key) pendingRightView = null;
      for (let index = viewStack.length - 1; index >= 0; index -= 1) {
        if (viewStack[index].key !== key) continue;
        if (index === viewStack.length - 1) { delete viewStack[index].key; delete viewStack[index].restore; }
        else viewStack.splice(index, 1);
      }
    },
    canGoBack: function () { return Boolean(mobileSubview || (usesDedicatedMobileNavigation() ? !body.classList.contains('chat-mobile-left-open') : currentLevel !== getRootLevel())); },
    openCenter: function (title) {
      if (!isMobile() || usesDedicatedMobileNavigation()) return false;
      if (currentLevel !== "center") {
        showLevel("center", title || rootTitle, true);
      } else {
        showLevel("center", title || rootTitle, false);
      }
      return true;
    },
    openRight: function (title) {
      if (!isMobile() || usesDedicatedMobileNavigation()) return false;
      if (currentLevel !== "right") {
        showLevel("right", resolveRightTitle(title), true);
      } else {
        if (title) {
          titleNode.textContent = String(title);
          viewStack[viewStack.length - 1].title = String(title);
        }
        moveOrderTabs();
        syncOrderTabsHeader();
      }
      return true;
    },
    openSubview: function (title, onBack, options) {
      if (!isMobile() || usesDedicatedMobileNavigation() || (currentLevel !== "center" && currentLevel !== "right")) return false;
      const sourceLevel = currentLevel;
      const key = options?.key || 'subview';
      if (!mobileSubview || mobileSubview.key !== key) captureViewScroll();
      const previousSubview = mobileSubview;
      mobileSubview = {
        key,
        element: options?.element || null,
        title: String(title || "").trim() || rootTitle,
        onBack: typeof onBack === "function" ? onBack : null,
        keepOrderTabs: options?.keepOrderTabs === true,
        beforeBack: typeof options?.beforeBack === "function" ? options.beforeBack : null,
      };
      const entry = { level: sourceLevel, title: mobileSubview.title, subview: mobileSubview };
      if (previousSubview?.key === key) Object.assign(viewStack[viewStack.length - 1], entry);
      else viewStack.push(entry);
      titleNode.textContent = mobileSubview.title;
      titleNode.classList.remove("hidden");
      if (headerCopy) headerCopy.classList.remove("hidden");
      if (mobileOrderTabs) mobileOrderTabs.classList.toggle("hidden", !mobileSubview.keepOrderTabs);
      menuButton.classList.add("hidden");
      backButton.classList.remove("hidden");
      return true;
    },
    closeSubview: function () {
      if (!mobileSubview || closingSubview) return false;
      mobileSubview = null;
      if (viewStack.length > 1 && viewStack[viewStack.length - 1]?.subview) viewStack.pop();
      restorePreviousView();
      return true;
    },
    getEditorView: function () { return { level: currentLevel, title: titleNode.textContent }; },
    restoreEditorView: function (view) {
      if (!isMobile() || !isEditorNavigation() || !view || !['left','center','right'].includes(view.level)) return;
      viewStack.splice(0, viewStack.length, { level: 'center', title: 'Каталог' });
      if (view.level !== 'center') viewStack.push({ level: view.level, title: view.title });
      showLevel(view.level, view.title, false);
    },
    back: goBack,
  };
  let editorReturnView = null;
  document.addEventListener('neworder:editor-layout', function (event) {
    if (isNewOrderPage) return;
    restoreContextActions();
    restoreOrderTabs();
    if (event.detail?.active) {
      if (editorReturnView) return;
      editorReturnView = { level: currentLevel, stack: viewStack.slice() };
      viewStack.splice(0, viewStack.length, { level: 'center', title: 'Каталог' }, { level: 'right', title: 'Заказ' });
      currentLevel = 'right';
    } else if (editorReturnView) {
      currentLevel = editorReturnView.level;
      viewStack.splice(0, viewStack.length, ...editorReturnView.stack);
      editorReturnView = null;
    }
    syncViewport();
  });
  let backGesture = null;
  document.addEventListener('touchstart', function (event) {
    backGesture = null;
    if (!isMobile() || event.touches.length !== 1 || sidebar.classList.contains('is-open')) return;
    if (!mobileSubview && (body.classList.contains('modal-open') || body.classList.contains('sheet-open'))) return;
    const target = event.target;
    if (mobileSubview ? !target.closest('[data-mobile-page="1"], .admin-benefits-page, #appModal') : !rightColumn.contains(target)) return;
    if (!mobileSubview && (usesDedicatedMobileNavigation() ? !body.classList.contains('chat-mobile-right-open') : currentLevel !== 'right')) return;
    if (target.closest('input, textarea, select, [contenteditable="true"], canvas, video, .leaflet-container, [role="slider"]')) return;
    let node = target;
    while (node && node !== rightColumn) {
      if (node.scrollWidth > node.clientWidth + 2 && /auto|scroll/.test(getComputedStyle(node).overflowX)) return;
      node = node.parentElement;
    }
    const touch = event.touches[0];
    backGesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY, time: event.timeStamp };
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', function (event) {
    if (!backGesture) return;
    if (event.touches.length !== 1 || Math.abs(event.touches[0].clientY - backGesture.y) > 40) backGesture = null;
  }, { capture: true, passive: true });
  document.addEventListener('touchcancel', function () { backGesture = null; }, { capture: true, passive: true });
  document.addEventListener('touchend', function (event) {
    const gesture = backGesture;
    backGesture = null;
    if (!gesture || event.timeStamp - gesture.time > 650) return;
    const touch = Array.from(event.changedTouches).find(function (item) { return item.identifier === gesture.id; });
    if (!touch || touch.clientX - gesture.x < 80 || touch.clientX - gesture.x < Math.abs(touch.clientY - gesture.y) * 2) return;
    if (event.cancelable) event.preventDefault();
    goBack();
  }, { capture: true, passive: false });

  function ensureMobileBackEntry() {
    if (!isMobile() || history.state?.adminMobileBack) return;
    history.pushState({ ...history.state, adminMobileBack: true }, '', location.href);
  }

  window.addEventListener('popstate', function () {
    if (!isMobile()) {
      if (!window.NewOrderBridge?.hasEditingOrders() || !isEditorNavigation()) return;
      goBack();
      history.pushState({ ...history.state, orderEditor: true }, '', location.href);
      return;
    }
    // Keep the browser on this document and reuse its existing Back actions.
    history.pushState({ ...history.state, adminMobileBack: true }, '', location.href);
    goBack();
  });
  syncViewport();
})();
