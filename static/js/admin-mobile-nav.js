(function () {
  const MOBILE_QUERY = "(max-width: 768px)";
  const body = document.body;
  const sidebar = document.getElementById("app-sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const menuButton = document.getElementById("adminMobileMenuBtn");
  const backButton = document.getElementById("adminMobileHeaderBackBtn");
  const titleNode = document.getElementById("adminMobilePageTitle");
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
  const viewStack = [{ level: "left", title: rootTitle }];
  let currentLevel = "left";
  let mobileSubview = null;
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
  const hasOrderTabs = activePage === "orders" || activePage === "courier-screen" || activePage === "products" || activePage === "cash" || activePage === "clients" || activePage === "marketing" || activePage === "settings";
  const orderTabs = hasOrderTabs
    ? Array.prototype.slice.call(document.querySelectorAll("#orderTabs, #orderTabsCheckout, #productTabs, #cashOrderTabs, #clientTabs, #settingsRightTabs, #settingsDeliveryTabs"))
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
    const showOrdersActionsOnRoot = activePage === "orders" && level === "left";
    const showCourierActionsOnRoot = activePage === "courier-screen" && level === "left";
    const showCashActionsOnRoot = activePage === "cash" && level === "left";
    if (!isMobile() || (level !== "center" && !showOrdersActionsOnRoot && !showCourierActionsOnRoot && !showCashActionsOnRoot) || !mobileActions) return;
    const candidates = Array.prototype.slice.call(centerColumn.querySelectorAll(".toolbar-right"));
    const actions = candidates.find(visible);
    if (!actions) return;
    actionOrigin = document.createComment("mobile-toolbar-actions-origin");
    actions.parentNode.insertBefore(actionOrigin, actions);
    mobileActions.appendChild(actions);
    movedActions = actions;
  }

  function moveAccountControls() {
    if (!sidebarAccount || !isMobile()) return;
    if (brand && sidebarBrand && brand.parentNode !== sidebarBrand) {
      brand.parentNode.insertBefore(brandOrigin, brand);
      sidebarBrand.appendChild(brand);
    }
    if (themeButton && themeButton.parentNode !== sidebarAccount) {
      themeButton.parentNode.insertBefore(themeOrigin, themeButton);
      sidebarAccount.appendChild(themeButton);
    }
    if (accountMenu && accountMenu.parentNode !== sidebarAccount) {
      accountMenu.parentNode.insertBefore(accountOrigin, accountMenu);
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
    if (!mobileOrderTabs) return;
    const keepSubviewOrderTabs = Boolean(mobileSubview?.keepOrderTabs);
    const showTabs = isMobile()
      && currentLevel === "right"
      && (!mobileSubview || keepSubviewOrderTabs)
      && hasOrderTabs
      && !!mobileOrderTabs.querySelector(".product-tab");
    mobileOrderTabs.classList.toggle("hidden", !showTabs);
    titleNode.classList.toggle("hidden", showTabs && !keepSubviewOrderTabs);
  }

  function moveOrderTabs() {
    if (!mobileOrderTabs || !isMobile() || !hasOrderTabs) return;
    orderTabs.forEach(function (tabs, index) {
      if (tabs.parentNode === mobileOrderTabs) return;
      tabs.parentNode.insertBefore(orderTabOrigins[index], tabs);
      mobileOrderTabs.appendChild(tabs);
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
    titleNode.classList.remove("hidden");
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
    currentLevel = nextLevel;
    body.classList.remove("admin-mobile-view-left", "admin-mobile-view-center", "admin-mobile-view-right");
    body.classList.add("admin-mobile-pages", "admin-mobile-view-" + nextLevel);
    titleNode.textContent = String(title || rootTitle).trim() || rootTitle;
    const isRoot = nextLevel === "left";
    menuButton.classList.toggle("hidden", !isRoot);
    backButton.classList.toggle("hidden", isRoot);
    moveContextActions(nextLevel);
    moveOrderTabs();
    syncOrderTabsHeader();
    if (push) viewStack.push({ level: nextLevel, title: titleNode.textContent });

    window.requestAnimationFrame(function () {
      const column = nextLevel === "right" ? rightColumn : nextLevel === "center" ? centerColumn : leftColumn;
      const scrollable = column.querySelector(".panel-body");
      if (scrollable) scrollable.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }

  function goBack() {
    if (mobileSubview) {
      const subview = mobileSubview;
      mobileSubview = null;
      if (viewStack.length > 1 && viewStack[viewStack.length - 1]?.subview) viewStack.pop();
      if (typeof subview.onBack === "function") subview.onBack();
      const previousSubviewView = viewStack[viewStack.length - 1] || { level: "right", title: rootTitle };
      showLevel(previousSubviewView.level, previousSubviewView.title, false);
      return;
    }
    if (viewStack.length > 1) viewStack.pop();
    const previous = viewStack[viewStack.length - 1] || { level: "left", title: rootTitle };
    showLevel(previous.level, previous.title, false);
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
    if (nestedControl && nestedControl !== item) return null;
    return item;
  }

  menuButton.addEventListener("click", function () {
    if (sidebar.classList.contains("is-open")) closeSidebar();
    else openSidebar();
  });
  backButton.addEventListener("click", goBack);
  if (overlay) overlay.addEventListener("click", closeSidebar);

  leftColumn.addEventListener("click", function (event) {
    if (!isMobile() || hasDedicatedMobileNavigation) return;
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
    if (!isMobile() || hasDedicatedMobileNavigation) return;
    const item = isCenterDetailTarget(event.target);
    if (!item) return;
    const title = itemTitle(item) || readText(centerColumn.querySelector(".toolbar-title")) || rootTitle;
    window.setTimeout(function () {
      if (currentLevel === "center" && !body.classList.contains("modal-open") && !body.classList.contains("sheet-open")) {
        showLevel("right", title, true);
      }
    }, 40);
  });

  function syncViewport() {
    if (isMobile()) {
      moveAccountControls();
      if (hasDedicatedMobileNavigation) {
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
    restoreAccountControls();
    restoreOrderTabs();
    closeSidebar();
    body.classList.remove("admin-mobile-pages", "admin-mobile-view-left", "admin-mobile-view-center", "admin-mobile-view-right");
    menuButton.classList.add("hidden");
    backButton.classList.add("hidden");
  }

  window.addEventListener("resize", syncViewport);
  window.addEventListener("pageshow", syncViewport);
  window.__adminMobilePages = {
    openCenter: function (title) {
      if (!isMobile() || hasDedicatedMobileNavigation) return false;
      if (currentLevel !== "center") {
        showLevel("center", title || rootTitle, true);
      } else {
        showLevel("center", title || rootTitle, false);
      }
      return true;
    },
    openRight: function (title) {
      if (!isMobile() || hasDedicatedMobileNavigation) return false;
      if (currentLevel !== "right") {
        showLevel("right", resolveRightTitle(title), true);
      } else {
        moveOrderTabs();
        syncOrderTabsHeader();
      }
      return true;
    },
    openSubview: function (title, onBack, options) {
      if (!isMobile() || hasDedicatedMobileNavigation || (currentLevel !== "center" && currentLevel !== "right")) return false;
      const sourceLevel = currentLevel;
      mobileSubview = {
        title: String(title || "").trim() || rootTitle,
        onBack: typeof onBack === "function" ? onBack : null,
        keepOrderTabs: options?.keepOrderTabs === true,
      };
      if (!viewStack[viewStack.length - 1]?.subview) {
        viewStack.push({ level: sourceLevel, title: mobileSubview.title, subview: true });
      }
      titleNode.textContent = mobileSubview.title;
      titleNode.classList.remove("hidden");
      if (mobileOrderTabs) mobileOrderTabs.classList.toggle("hidden", !mobileSubview.keepOrderTabs);
      menuButton.classList.add("hidden");
      backButton.classList.remove("hidden");
      return true;
    },
    closeSubview: function () {
      if (!mobileSubview) return false;
      mobileSubview = null;
      if (viewStack.length > 1 && viewStack[viewStack.length - 1]?.subview) viewStack.pop();
      const previous = viewStack[viewStack.length - 1] || { level: "right", title: rootTitle };
      showLevel(previous.level, previous.title, false);
      return true;
    },
    back: goBack,
  };
  syncViewport();
})();
