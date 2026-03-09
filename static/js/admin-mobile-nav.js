(function () {
  const body = document.body;
  const mobileShell = document.getElementById("adminMobileShell");
  const shell = document.getElementById("adminMobileNavShell");
  const railShell = document.getElementById("adminMobileRailShell");
  const railNav = document.getElementById("adminMobileRail");
  const mainContainer = document.querySelector(".main-container");
  const sidebar = document.getElementById("app-sidebar");

  if (!body || !mobileShell || !shell || !railShell || !railNav) return;

  const MOBILE_MEDIA = "(max-width: 768px)";
  const activePage = String(body.dataset.adminActivePage || "").trim();
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
      href: "/dashboard/chat",
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

  const ADAPTERS = {
    orders: resolveOrdersModel,
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

    if (!mobile) return;
    centerActiveItem(nav, nav.querySelector(".admin-mobile-nav-link.is-active"), "auto");
  }

  function renderRailModel(model) {
    if (!model || !Array.isArray(model.items) || !model.items.length || !isMobile()) {
      railNav.innerHTML = "";
      railShell.classList.add("hidden");
      railShell.setAttribute("aria-hidden", "true");
      return;
    }

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
