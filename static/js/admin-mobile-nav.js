(function () {
  const body = document.body;
  const mobileShell = document.getElementById("adminMobileShell");
  const mobileShellHandle = document.getElementById("adminMobileShellHandle");
  const shell = document.getElementById("adminMobileNavShell");
  const railShell = document.getElementById("adminMobileRailShell");
  const railNav = document.getElementById("adminMobileRail");
  const mainContainer = document.querySelector(".main-container");
  const sidebar = document.getElementById("app-sidebar");

  if (!body || !mobileShell || !mobileShellHandle || !shell || !railShell || !railNav) return;

  const MOBILE_MEDIA = "(max-width: 768px)";
  const MOBILE_SHELL_DRAWER_ENABLED = false;
  const activePage = String(body.dataset.adminActivePage || "").trim();
  const chatHref = String(body.dataset.adminChatUrl || "/dashboard/chat").trim() || "/dashboard/chat";
  const mediaQuery = window.matchMedia(MOBILE_MEDIA);

  const NAV_ITEMS = [
    { key: "cash", href: "/dashboard/cash", label: "Касса", icon: "fa-cash-register" },
    { key: "products", href: "/dashboard/products", label: "Товары", icon: "fa-box" },
    { key: "orders", href: "/dashboard/orders", label: "Заказы", icon: "fa-shopping-cart" },
    { key: "courier-screen", href: "/dashboard/courier-screen", label: "Экран курьера", icon: "fa-truck" },
    { key: "new-order", href: "/dashboard/new-order", label: "Новый заказ", icon: "fa-plus-circle" },
    { key: "clients", href: "/dashboard/clients", label: "Маркетинг", icon: "fa-bullhorn" },
    { key: "team", href: "/dashboard/team", label: "Команда", icon: "fa-user-tie" },
    {
      key: "chat",
      href: chatHref,
      label: "Чаты",
      icon: "fa-comments",
      id: "mobileChatNavLink",
      badgeId: "mobileChatUnreadBadge",
      hidden: body.dataset.adminChatEnabled === "0",
    },
    { key: "settings", href: "/dashboard/settings", label: "Настройки", icon: "fa-cog" },
  ];

  let bottomNav = null;
  let railSyncRaf = 0;
  let bodyObserver = null;
  let sourceObserver = null;
  let shellCollapsed = false;
  let shellDragPointerId = null;
  let shellDragTouchId = null;
  let shellDragStartX = 0;
  let shellDragStartY = 0;
  let shellDragMaxOffset = 0;
  let shellDragCurrentOffset = 0;
  let shellDragBaseOffset = 0;
  let shellDragAxis = "";
  let shellDragMoved = false;
  let shellDragStartedCollapsed = false;
  let shellSuppressClickUntil = 0;

  const MOBILE_SHELL_STATE_KEY = "admin-mobile-shell-collapsed";
  const MOBILE_SHELL_DRAG_LOCK_PX = 3;
  const MOBILE_SHELL_DRAG_TRIGGER_PX = 18;
  const MOBILE_SHELL_METRICS_EVENT = "admin-mobile-shell-metrics-change";
  const MOBILE_SHELL_CLICK_SUPPRESS_MS = 360;
  const MOBILE_SHELL_SNAP_MIN_MS = 320;
  const MOBILE_SHELL_SNAP_MAX_MS = 620;
  const MOBILE_SHELL_SNAP_EXPAND_BASE_MS = 420;
  const MOBILE_SHELL_SNAP_COLLAPSE_BASE_MS = 360;
  const MOBILE_SHELL_FADE_MIN_MS = 220;
  const MOBILE_SHELL_FADE_RATIO = 0.72;
  const MOBILE_SHELL_SNAP_EXPAND_EASE = "cubic-bezier(.22,1,.36,1)";
  const MOBILE_SHELL_SNAP_COLLAPSE_EASE = "cubic-bezier(.3,.78,.22,1)";

  const ADAPTERS = {
    orders: resolveOrdersModel,
    "courier-screen": resolveOrdersModel,
    cash: function () {
      return buildListModel({
        root: document.getElementById("cashJournalFilters"),
        itemSelector: "[data-cash-section]",
      });
    },
    settings: function () {
      return buildListModel({
        root: document.querySelector(".settings-stage-list"),
        itemSelector: "[data-settings-section]",
      });
    },
    products: function () {
      return buildAccordionModel(document.getElementById("productsAccordion"));
    },
    clients: function () {
      return buildAccordionModel(document.getElementById("clientsAccordion"));
    },
    "new-order": function () {
      return buildListModel({
        root: document.getElementById("newOrderCategoriesList"),
        itemSelector: ".stage-item",
      });
    },
  };

  function isMobile() {
    return !!(mediaQuery && mediaQuery.matches);
  }

  function canUseShellSwipe() {
    if (!MOBILE_SHELL_DRAWER_ENABLED) return false;
    if (!isMobile()) return false;
    if (body.classList.contains("sidebar-open")) return false;
    if (body.classList.contains("sheet-open")) return false;
    if (body.classList.contains("modal-open")) return false;
    return true;
  }

  function readStoredShellCollapsed() {
    if (!MOBILE_SHELL_DRAWER_ENABLED) return false;
    try {
      return localStorage.getItem(MOBILE_SHELL_STATE_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  function persistShellCollapsed(value) {
    if (!MOBILE_SHELL_DRAWER_ENABLED) {
      try {
        localStorage.removeItem(MOBILE_SHELL_STATE_KEY);
      } catch (_err) {}
      return;
    }
    try {
      localStorage.setItem(MOBILE_SHELL_STATE_KEY, value ? "1" : "0");
    } catch (_err) {}
  }

  function getShellHandleZoneHeight() {
    const styles = window.getComputedStyle(mobileShell);
    const raw = parseFloat(styles.getPropertyValue("--admin-mobile-shell-handle-zone-h"));
    return Number.isFinite(raw) && raw > 0 ? raw : 22;
  }

  function getShellCollapsedVisibleHeight() {
    const styles = window.getComputedStyle(mobileShell);
    const raw = parseFloat(styles.getPropertyValue("--admin-mobile-shell-collapsed-visible-h"));
    const handleZone = getShellHandleZoneHeight();
    if (!Number.isFinite(raw) || raw <= 0) return handleZone;
    return Math.max(handleZone, raw);
  }

  function getShellCollapsedOffset() {
    const rect = mobileShell.getBoundingClientRect();
    const collapsedVisibleHeight = getShellCollapsedVisibleHeight();
    return Math.max(0, Math.round(Math.max(0, rect.height - collapsedVisibleHeight)));
  }

  function syncShellHandleState() {
    mobileShellHandle.setAttribute("aria-expanded", shellCollapsed ? "false" : "true");
    mobileShell.setAttribute("data-collapsed", shellCollapsed ? "1" : "0");
  }

  function clearShellSnapMotion() {
    mobileShell.style.removeProperty("--admin-mobile-shell-snap-duration");
    mobileShell.style.removeProperty("--admin-mobile-shell-snap-ease");
    mobileShell.style.removeProperty("--admin-mobile-shell-fade-duration");
  }

  function setShellSnapMotion(nextCollapsed, fromOffsetOverride) {
    if (!MOBILE_SHELL_DRAWER_ENABLED) {
      clearShellSnapMotion();
      return;
    }
    if (!isMobile()) {
      clearShellSnapMotion();
      return;
    }

    const maxOffset = getShellCollapsedOffset();
    const nextOffset = nextCollapsed ? maxOffset : 0;
    const rawFrom = Number(fromOffsetOverride);
    const fallbackFrom = shellCollapsed ? maxOffset : 0;
    const fromOffset = Number.isFinite(rawFrom)
      ? Math.max(0, Math.min(maxOffset, Math.round(rawFrom)))
      : fallbackFrom;
    const distance = Math.max(0, Math.abs(nextOffset - fromOffset));
    const progress = maxOffset > 0 ? Math.min(1, distance / maxOffset) : 1;
    const baseDuration = nextCollapsed
      ? MOBILE_SHELL_SNAP_COLLAPSE_BASE_MS
      : MOBILE_SHELL_SNAP_EXPAND_BASE_MS;
    const duration = Math.max(
      MOBILE_SHELL_SNAP_MIN_MS,
      Math.min(MOBILE_SHELL_SNAP_MAX_MS, Math.round(baseDuration + (progress * 180)))
    );
    const fadeDuration = Math.max(
      MOBILE_SHELL_FADE_MIN_MS,
      Math.round(duration * MOBILE_SHELL_FADE_RATIO)
    );

    mobileShell.style.setProperty("--admin-mobile-shell-snap-duration", `${duration}ms`);
    mobileShell.style.setProperty(
      "--admin-mobile-shell-snap-ease",
      nextCollapsed ? MOBILE_SHELL_SNAP_COLLAPSE_EASE : MOBILE_SHELL_SNAP_EXPAND_EASE
    );
    mobileShell.style.setProperty("--admin-mobile-shell-fade-duration", `${fadeDuration}ms`);
  }

  function syncShellLiveMetrics(offsetOverride) {
    const dragging = shellDragPointerId != null
      || shellDragTouchId != null
      || mobileShell.classList.contains("is-shell-dragging");
    const freezeChatLayoutDuringDrag = dragging && activePage === "chat";
    if (!isMobile()) {
      body.style.removeProperty("--admin-mobile-shell-live-offset");
      body.style.removeProperty("--admin-mobile-shell-visible-height");
      document.dispatchEvent(new CustomEvent(MOBILE_SHELL_METRICS_EVENT, {
        detail: {
          collapsed: false,
          dragging: false,
          liveOffset: 0,
          maxOffset: 0,
          visibleHeight: 0,
        },
      }));
      return;
    }

    const handleZone = getShellHandleZoneHeight();
    const collapsedVisibleHeight = getShellCollapsedVisibleHeight();
    const measuredHeight = Math.max(0, Number(mobileShell.getBoundingClientRect().height || 0));
    const shellHeight = Math.max(
      collapsedVisibleHeight,
      dragging && shellDragMaxOffset > 0
        ? shellDragMaxOffset + collapsedVisibleHeight
        : measuredHeight,
    );
    const maxOffset = Math.max(
      0,
      dragging && shellDragMaxOffset > 0
        ? shellDragMaxOffset
        : (shellHeight - collapsedVisibleHeight),
    );
    const rawOffset = Number.isFinite(Number(offsetOverride))
      ? Number(offsetOverride)
      : (shellCollapsed ? maxOffset : 0);
    const liveOffset = Math.max(0, Math.min(maxOffset, rawOffset));
    const visibleHeight = Math.max(collapsedVisibleHeight, Math.max(0, shellHeight - liveOffset));

    if (!freezeChatLayoutDuringDrag) {
      body.style.setProperty("--admin-mobile-shell-live-offset", `${Number(liveOffset.toFixed(3))}px`);
      body.style.setProperty("--admin-mobile-shell-visible-height", `${Number(visibleHeight.toFixed(3))}px`);
    }
    document.dispatchEvent(new CustomEvent(MOBILE_SHELL_METRICS_EVENT, {
      detail: {
        collapsed: shellCollapsed,
        dragging,
        liveOffset,
        maxOffset,
        visibleHeight,
      },
    }));
  }

  function applyShellCollapsedState(nextCollapsed, options) {
    const config = options && typeof options === "object" ? options : {};
    const targetCollapsed = MOBILE_SHELL_DRAWER_ENABLED && nextCollapsed === true;
    if (config.skipAnimation === true) {
      clearShellSnapMotion();
    } else {
      setShellSnapMotion(targetCollapsed, config.fromOffset);
    }
    shellCollapsed = targetCollapsed;
    body.classList.toggle("admin-mobile-shell-collapsed", shellCollapsed);
    syncShellHandleState();
    if (config.skipPersist !== true) {
      persistShellCollapsed(shellCollapsed);
    }
    if (config.keepDragOffset !== true) {
      mobileShell.classList.remove("is-shell-dragging");
      mobileShell.style.removeProperty("--admin-mobile-shell-base-offset");
    }
    syncShellLiveMetrics(shellCollapsed ? getShellCollapsedOffset() : 0);
  }

  function resetShellDrag() {
    shellDragPointerId = null;
    shellDragTouchId = null;
    shellDragStartX = 0;
    shellDragStartY = 0;
    shellDragMaxOffset = 0;
    shellDragCurrentOffset = 0;
    shellDragBaseOffset = 0;
    shellDragAxis = "";
    shellDragMoved = false;
    shellDragStartedCollapsed = false;
    mobileShell.classList.remove("is-shell-dragging");
    mobileShell.style.removeProperty("--admin-mobile-shell-base-offset");
  }

  function beginShellDrag(clientX, clientY) {
    shellDragStartX = Number(clientX || 0);
    shellDragStartY = Number(clientY || 0);
    shellDragMaxOffset = getShellCollapsedOffset();
    shellDragBaseOffset = shellCollapsed ? shellDragMaxOffset : 0;
    shellDragCurrentOffset = shellDragBaseOffset;
    shellDragAxis = "";
    shellDragMoved = false;
    shellDragStartedCollapsed = shellCollapsed;
    mobileShell.classList.add("is-shell-dragging");
    mobileShell.style.setProperty(
      "--admin-mobile-shell-base-offset",
      `${Number(shellDragBaseOffset.toFixed(3))}px`,
    );
    syncShellLiveMetrics(shellDragBaseOffset);
  }

  function updateShellDrag(clientX, clientY) {
    if (!canUseShellSwipe()) return false;
    const deltaX = Number(clientX || 0) - shellDragStartX;
    const deltaY = Number(clientY || 0) - shellDragStartY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    if (!shellDragAxis) {
      if (absX < MOBILE_SHELL_DRAG_LOCK_PX && absY < MOBILE_SHELL_DRAG_LOCK_PX) return false;
      shellDragAxis = absY >= absX ? "y" : "x";
    }
    if (shellDragAxis !== "y") return false;
    if (!shellDragMoved && absY < MOBILE_SHELL_DRAG_LOCK_PX) return false;
    shellDragMoved = true;
    const maxOffset = shellDragMaxOffset > 0 ? shellDragMaxOffset : getShellCollapsedOffset();
    shellDragCurrentOffset = Math.max(0, Math.min(maxOffset, shellDragBaseOffset + deltaY));
    mobileShell.style.setProperty(
      "--admin-mobile-shell-base-offset",
      `${Number(shellDragCurrentOffset.toFixed(3))}px`,
    );
    syncShellLiveMetrics(shellDragCurrentOffset);
    return true;
  }

  function finishShellDrag(cancelled) {
    const hadActiveDrag = shellDragPointerId != null || shellDragTouchId != null;
    if (!hadActiveDrag) return;
    if (!shellDragMoved) {
      resetShellDrag();
      return;
    }
    const maxOffset = shellDragMaxOffset > 0 ? shellDragMaxOffset : getShellCollapsedOffset();
    const threshold = Math.max(MOBILE_SHELL_DRAG_TRIGGER_PX, Math.round(maxOffset * 0.32));
    const releasedOffset = shellDragCurrentOffset;
    let nextCollapsed = shellDragStartedCollapsed;
    const shouldSuppressClick = shellDragMoved;

    if (!cancelled && shellDragMoved) {
      if (shellDragStartedCollapsed) {
        nextCollapsed = shellDragCurrentOffset > Math.max(0, maxOffset - threshold);
      } else {
        nextCollapsed = shellDragCurrentOffset >= threshold;
      }
    }

    resetShellDrag();
    if (shouldSuppressClick) {
      shellSuppressClickUntil = Date.now() + MOBILE_SHELL_CLICK_SUPPRESS_MS;
    }
    applyShellCollapsedState(nextCollapsed, {
      skipPersist: false,
      fromOffset: releasedOffset,
    });
  }

  function resolveTrackedTouch(touchList, trackedId) {
    if (trackedId == null || !touchList) return null;
    for (let index = 0; index < touchList.length; index += 1) {
      const touch = touchList[index];
      if (touch && touch.identifier === trackedId) return touch;
    }
    return null;
  }

  function isChatEnabled() {
    try {
      const tenant = JSON.parse(localStorage.getItem("tenant") || "{}");
      const rawValue = tenant && tenant.chat_widget_enabled;
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return body.dataset.adminChatEnabled !== "0";
      }
      if (rawValue === false || rawValue === 0) return false;
      const normalized = String(rawValue).trim().toLowerCase();
      if (!normalized) return true;
      if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;
      return true;
    } catch (err) {
      return body.dataset.adminChatEnabled !== "0";
    }
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function readText(el) {
    return String((el && el.textContent) || "").replace(/\s+/g, " ").trim();
  }

  function isElementHidden(el) {
    if (!el) return true;
    if (el.hidden) return true;
    if (el.classList && el.classList.contains("hidden")) return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    return false;
  }

  function centerActiveItem(container, item, behavior) {
    if (!container || !item) return;
    window.requestAnimationFrame(function () {
      const itemLeft = item.offsetLeft || 0;
      const targetLeft = Math.max(
        0,
        itemLeft - Math.max(0, (container.clientWidth - item.offsetWidth) / 2)
      );
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ left: targetLeft, behavior: behavior || "auto" });
        return;
      }
      container.scrollLeft = targetLeft;
    });
  }

  function normalizeFaClass(rawClass, fallbackClass) {
    const value = String(rawClass || "").trim();
    if (!value) return "fas " + String(fallbackClass || "fa-circle");
    if (/^fa[srlbd]\s+fa-[a-z0-9-]+$/i.test(value)) return value;
    if (/^fa-[a-z0-9-]+$/i.test(value)) return "fas " + value;
    return value;
  }

  function extractFontAwesomeClass(iconNode, fallbackClass) {
    if (!iconNode) return normalizeFaClass(fallbackClass, "fa-circle");

    const classes = Array.prototype.slice.call(iconNode.classList || []);
    const styleClass = classes.find(function (className) {
      return /^fa[srlbd]$/i.test(className);
    }) || "fas";
    const iconClass = classes.find(function (className) {
      return /^fa-[a-z0-9-]+$/i.test(className);
    }) || String(fallbackClass || "fa-circle");

    return normalizeFaClass(styleClass + " " + iconClass, fallbackClass);
  }

  function renderBottomNavIcon(item) {
    const sidebarIcon = sidebar && sidebar.querySelector('[data-nav-key="' + item.key + '"] .nav-icon');
    const iconClass = extractFontAwesomeClass(sidebarIcon, item.icon);
    return '<i class="' + escapeHtml(iconClass) + '" aria-hidden="true"></i>';
  }

  function extractIconMarkup(sourceEl) {
    if (!sourceEl) return "";

    const wrapper = sourceEl.querySelector(".stage-icon, .order-icon, .discount-row-icon");
    if (wrapper) return wrapper.outerHTML;

    const iconNode = sourceEl.querySelector("img, i");
    if (iconNode) return iconNode.outerHTML;

    return "";
  }

  function extractLabel(sourceEl, fallbackLabel) {
    if (!sourceEl) return String(fallbackLabel || "");

    const preferred = sourceEl.querySelector(
      ".stage-text strong, .stage-text b, .stage-meta strong, .stage-meta b, strong, b"
    );
    if (preferred && readText(preferred)) {
      return readText(preferred);
    }

    const textEl = sourceEl.querySelector(".stage-text, .stage-meta");
    if (textEl && readText(textEl)) {
      return readText(textEl);
    }

    return readText(sourceEl) || String(fallbackLabel || "");
  }

  function extractKey(sourceEl, index) {
    if (!sourceEl) return "item-" + String(index || 0);

    const candidates = [
      sourceEl.getAttribute("data-status-id"),
      sourceEl.getAttribute("data-cash-section"),
      sourceEl.getAttribute("data-settings-section"),
      sourceEl.getAttribute("data-view"),
      sourceEl.getAttribute("data-category-id"),
      sourceEl.getAttribute("data-filter"),
      sourceEl.getAttribute("data-id"),
      sourceEl.id,
    ];

    for (let i = 0; i < candidates.length; i += 1) {
      const value = String(candidates[i] || "").trim();
      if (value) return value;
    }

    return "item-" + String(index || 0);
  }

  function buildItemFromElement(sourceEl, index, fallbackIconName) {
    if (!sourceEl || isElementHidden(sourceEl) || sourceEl.disabled) return null;

    return {
      key: extractKey(sourceEl, index),
      label: extractLabel(sourceEl, "Раздел"),
      active:
        sourceEl.classList.contains("is-active") ||
        sourceEl.classList.contains("active-nav") ||
        sourceEl.getAttribute("aria-current") === "page" ||
        sourceEl.getAttribute("aria-selected") === "true",
      iconMarkup: extractIconMarkup(sourceEl, fallbackIconName || "fa-circle"),
      sourceEl: sourceEl,
    };
  }

  function resolvePanelTitle(root) {
    if (!root) return "";
    const panel = root.closest(".panel");
    if (!panel) return "";
    const titleEl = panel.querySelector(".panel-title");
    return readText(titleEl);
  }

  function buildListModel(config) {
    const root = config && config.root;
    if (!root || isElementHidden(root)) return null;

    const nodes = Array.prototype.slice.call(root.querySelectorAll(config.itemSelector || ".stage-item"));
    const items = nodes
      .map(function (node, index) {
        return buildItemFromElement(node, index, config.fallbackIcon || "circle");
      })
      .filter(Boolean);

    if (!items.length) return null;

    return {
      title: config.title || resolvePanelTitle(root) || "Разделы",
      items: items,
    };
  }

  function getOpenAccordionPanel(root) {
    if (!root) return null;
    const panels = Array.prototype.slice.call(root.querySelectorAll("[data-acc-panel]"));
    if (!panels.length) return null;

    let panel = panels.find(function (item) {
      return item.classList.contains("is-open");
    });

    if (!panel) {
      panel = panels.find(function (item) {
        return !!item.querySelector(".stage-item.is-active:not([data-acc-trigger]):not(.acc-trigger)");
      });
    }

    return panel || panels[0] || null;
  }

  function buildAccordionModel(root) {
    if (!root || isElementHidden(root)) return null;

    const panel = getOpenAccordionPanel(root);
    if (!panel) return null;

    const buttons = Array.prototype.slice
      .call(panel.querySelectorAll(".stage-item"))
      .filter(function (node) {
        return !node.matches("[data-acc-trigger], .acc-trigger");
      });

    const items = buttons
      .map(function (node, index) {
        return buildItemFromElement(node, index, "circle");
      })
      .filter(Boolean);

    if (!items.length) return null;

    return {
      title: resolvePanelTitle(root) || "Разделы",
      items: items,
    };
  }

  function resolveOrdersModel() {
    const checkoutRoot = document.getElementById("ordersCheckoutLeftPane");
    const checkoutList = document.getElementById("newOrderCategoriesList");
    if (checkoutRoot && !isElementHidden(checkoutRoot) && checkoutList) {
      return buildListModel({
        root: checkoutList,
        itemSelector: ".stage-item",
        title: resolvePanelTitle(checkoutList),
      });
    }

    return buildListModel({
      root: document.getElementById("ordersStagesList"),
      itemSelector: ".stage-item",
    });
  }

  function getActiveAdapter() {
    if (!activePage) return null;
    return ADAPTERS[activePage] || null;
  }

  function ensureBottomNavBuilt() {
    if (bottomNav) return bottomNav;

    bottomNav = document.createElement("nav");
    bottomNav.className = "admin-mobile-nav no-scrollbar";
    bottomNav.id = "adminMobileNav";
    bottomNav.setAttribute("aria-label", "Навигация админки");

    bottomNav.innerHTML = NAV_ITEMS.map(function (item) {
      const isChatItem = item.key === "chat";
      const hiddenClass = item.hidden ? " hidden" : "";
      return (
        '<div class="admin-mobile-nav-item' + hiddenClass + '" data-nav-item="' + escapeHtml(item.key) + '">' +
        '<a href="' + escapeHtml(item.href) + '"' +
        (item.id ? ' id="' + escapeHtml(item.id) + '"' : "") +
        ' class="admin-mobile-nav-link" data-nav-key="' + escapeHtml(item.key) + '"' +
        ' aria-label="' + escapeHtml(item.label) + '"' +
        ' title="' + escapeHtml(item.label) + '">' +
        renderBottomNavIcon(item) +
        (isChatItem
          ? '<span class="admin-mobile-nav-badge hidden" id="' + escapeHtml(item.badgeId) + '" aria-live="polite" aria-atomic="true"></span>'
          : "") +
        "</a></div>"
      );
    }).join("");

    shell.innerHTML = "";
    shell.appendChild(bottomNav);

    const chatLink = bottomNav.querySelector('.admin-mobile-nav-link[data-nav-key="chat"]');
    if (chatLink && chatLink.dataset.mobileChatToggleBound !== "1") {
      chatLink.dataset.mobileChatToggleBound = "1";
      chatLink.addEventListener("click", function (event) {
        if (activePage !== "chat" || !isMobile()) return;
        const chatMobileApi = window.__adminChatMobileApi;
        if (!chatMobileApi || typeof chatMobileApi.toggleClientsPanel !== "function") return;
        event.preventDefault();
        chatMobileApi.toggleClientsPanel();
      });
    }

    return bottomNav;
  }

  function syncBottomNav() {
    const nav = ensureBottomNavBuilt();
    if (!nav) return;

    const mobile = isMobile();
    mobileShell.classList.toggle("hidden", !mobile);
    mobileShell.setAttribute("aria-hidden", mobile ? "false" : "true");

    const tenantChatEnabled = isChatEnabled();

    Array.prototype.forEach.call(nav.querySelectorAll(".admin-mobile-nav-link"), function (link) {
      const key = String(link.getAttribute("data-nav-key") || "");
      const isActive = key === activePage;
      link.classList.toggle("is-active", isActive);
      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }

      if (key === "chat") {
        const item = link.closest(".admin-mobile-nav-item");
        if (item) item.classList.toggle("hidden", !tenantChatEnabled);
      }
    });

    if (!mobile) {
      mobileShell.classList.remove("is-single-row");
      mobileShell.classList.remove("is-shell-dragging");
      mobileShell.style.removeProperty("--admin-mobile-shell-base-offset");
      clearShellSnapMotion();
      syncShellLiveMetrics(0);
      return;
    }
    applyShellCollapsedState(shellCollapsed, {
      skipPersist: true,
      skipAnimation: true,
    });
    centerActiveItem(nav, nav.querySelector(".admin-mobile-nav-link.is-active"), "auto");
  }

  function renderRailModel(model) {
    if (!model || !Array.isArray(model.items) || !model.items.length || !isMobile()) {
      mobileShell.classList.add("is-single-row");
      railNav.innerHTML = "";
      railShell.classList.add("hidden");
      railShell.setAttribute("aria-hidden", "true");
      syncShellLiveMetrics(shellDragPointerId != null || shellDragTouchId != null ? shellDragCurrentOffset : undefined);
      return;
    }

    mobileShell.classList.remove("is-single-row");
    railNav.innerHTML = model.items.map(function (item) {
      return (
        '<button type="button" class="admin-mobile-rail-link' + (item.active ? " is-active" : "") + '"' +
        ' data-rail-key="' + escapeHtml(item.key) + '"' +
        ' aria-label="' + escapeHtml(item.label) + '"' +
        ' title="' + escapeHtml(item.label) + '">' +
        (item.iconMarkup || "") +
        '<span class="admin-mobile-rail-label">' + escapeHtml(item.label) + "</span>" +
        "</button>"
      );
    }).join("");

    railShell.classList.remove("hidden");
    railShell.setAttribute("aria-hidden", "false");

    Array.prototype.forEach.call(railNav.querySelectorAll(".admin-mobile-rail-link"), function (button) {
      button.addEventListener("click", function () {
        const key = String(button.getAttribute("data-rail-key") || "");
        const target = model.items.find(function (item) {
          return String(item.key) === key;
        });
        if (!target || !target.sourceEl) return;

        try {
          target.sourceEl.click();
        } catch (err) {}

        scheduleRailSync();
        window.setTimeout(scheduleRailSync, 80);
        window.setTimeout(scheduleRailSync, 260);
      });
    });

    centerActiveItem(railNav, railNav.querySelector(".admin-mobile-rail-link.is-active"), "smooth");
    syncShellLiveMetrics(shellDragPointerId != null || shellDragTouchId != null ? shellDragCurrentOffset : undefined);
  }

  function syncRailNow() {
    if (!isMobile()) {
      renderRailModel(null);
      return;
    }

    const adapter = getActiveAdapter();
    if (!adapter) {
      renderRailModel(null);
      return;
    }

    renderRailModel(adapter());
  }

  function scheduleRailSync() {
    if (railSyncRaf) return;
    railSyncRaf = window.requestAnimationFrame(function () {
      railSyncRaf = 0;
      syncRailNow();
    });
  }

  function bindObservers() {
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    if (sourceObserver) {
      sourceObserver.disconnect();
      sourceObserver = null;
    }

    bodyObserver = new MutationObserver(function (mutations) {
      let needsRailSync = false;
      mutations.forEach(function (mutation) {
        if (mutation.type === "attributes") {
          if (mutation.target === body && mutation.attributeName === "data-admin-chat-enabled") {
            syncBottomNav();
          }
          if (mutation.target === body && mutation.attributeName === "class") {
            needsRailSync = true;
          }
        }
      });
      if (needsRailSync) scheduleRailSync();
    });
    bodyObserver.observe(body, { attributes: true, attributeFilter: ["class", "data-admin-chat-enabled"] });

    if (!mainContainer) return;

    sourceObserver = new MutationObserver(function () {
      scheduleRailSync();
    });
    sourceObserver.observe(mainContainer, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-current", "aria-selected", "src"],
    });
  }

  function bindShellGestures() {
    if (!MOBILE_SHELL_DRAWER_ENABLED) {
      resetShellDrag();
      return;
    }
    if (mobileShell.dataset.dragBound === "1") return;
    mobileShell.dataset.dragBound = "1";

    mobileShell.addEventListener("pointerdown", function (event) {
      if (!canUseShellSwipe()) return;
      if (event.button !== 0) return;
      if (shellDragTouchId != null) return;
      if (activePage === "chat" && !(event.target && event.target.closest && event.target.closest("#adminMobileShellHandle"))) {
        return;
      }
      shellDragPointerId = event.pointerId;
      beginShellDrag(event.clientX, event.clientY);
    });

    mobileShell.addEventListener("pointermove", function (event) {
      if (shellDragPointerId == null || event.pointerId !== shellDragPointerId) return;
      if (!updateShellDrag(event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    mobileShell.addEventListener("touchstart", function (event) {
      if (!canUseShellSwipe()) return;
      if (event.touches.length !== 1) return;
      if (shellDragPointerId != null) return;
      if (activePage === "chat" && !(event.target && event.target.closest && event.target.closest("#adminMobileShellHandle"))) {
        return;
      }
      const touch = event.touches[0];
      shellDragTouchId = touch.identifier;
      beginShellDrag(touch.clientX, touch.clientY);
    }, { passive: true });

    mobileShell.addEventListener("touchmove", function (event) {
      const touch = resolveTrackedTouch(event.touches, shellDragTouchId)
        || resolveTrackedTouch(event.changedTouches, shellDragTouchId);
      if (!touch) return;
      if (!updateShellDrag(touch.clientX, touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    }, { passive: false });

    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (eventName) {
      mobileShell.addEventListener(eventName, function () {
        finishShellDrag(eventName !== "pointerup");
      }, { passive: true });
    });

    mobileShell.addEventListener("touchend", function () {
      finishShellDrag(false);
    }, { passive: true });

    mobileShell.addEventListener("touchcancel", function () {
      finishShellDrag(true);
    }, { passive: true });

    mobileShell.addEventListener("click", function (event) {
      if (Date.now() >= shellSuppressClickUntil) return;
      event.preventDefault();
      event.stopPropagation();
    }, true);

    mobileShellHandle.addEventListener("click", function (event) {
      if (!canUseShellSwipe()) return;
      if (Date.now() < shellSuppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (mobileShell.classList.contains("is-shell-dragging")) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      event.preventDefault();
      applyShellCollapsedState(!shellCollapsed, {
        skipPersist: false,
        fromOffset: shellCollapsed ? getShellCollapsedOffset() : 0,
      });
    });
  }

  function bindShellMotionCleanup() {
    if (mobileShell.dataset.motionCleanupBound === "1") return;
    mobileShell.dataset.motionCleanupBound = "1";

    mobileShell.addEventListener("transitionend", function (event) {
      if (event.target !== mobileShell) return;
      if (event.propertyName !== "transform") return;
      if (mobileShell.classList.contains("is-shell-dragging")) return;
      clearShellSnapMotion();
    });
  }

  shellCollapsed = MOBILE_SHELL_DRAWER_ENABLED ? readStoredShellCollapsed() : false;
  bindShellGestures();
  bindShellMotionCleanup();
  ensureBottomNavBuilt();
  syncBottomNav();
  bindObservers();
  scheduleRailSync();

  if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", function () {
      syncBottomNav();
      scheduleRailSync();
    });
  } else {
    window.addEventListener("resize", function () {
      syncBottomNav();
      scheduleRailSync();
    });
  }

  window.addEventListener("pageshow", function () {
    syncBottomNav();
    scheduleRailSync();
  });

  window.addEventListener("tenantDataChanged", function () {
    syncBottomNav();
    scheduleRailSync();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    syncBottomNav();
    scheduleRailSync();
  });
})();
