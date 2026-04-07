(() => {
  const context = window.__SHOP_INSTALL_PAGE_CONTEXT__ || {};
  const titleEl = document.getElementById("shopInstallPageTitle");
  const appNameEl = document.getElementById("shopInstallPageAppName");
  const actionBtn = document.getElementById("shopInstallPageActionBtn");
  const openBtn = document.getElementById("shopInstallPageOpenBtn");
  const textEl = document.getElementById("shopInstallPageText");
  const stepsEl = document.getElementById("shopInstallPageSteps");
  const siteLinkEl = document.getElementById("shopInstallPageSiteLink");
  const loaderEl = document.getElementById("shopInstallPageLoader");
  const hintEl = document.getElementById("shopInstallPageHint");
  const splashEl = document.getElementById("shopInstallPageSplash");
  const splashLoaderEl = document.getElementById("shopInstallPageSplashLoader");

  if (!titleEl || !appNameEl || !actionBtn || !openBtn) return;

  const appTitle = String(context.title || "Витрина").trim() || "Витрина";
  const shopUrl = String(context.shopUrl || "/").trim() || "/";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const pwaPresence = window.__SHOP_PWA_PRESENCE__ || null;
  let deferredPrompt = null;
  let redirected = false;
  let suppressInstalledRedirect = false;
  let iosToolbarHintEl = null;
  const splashStartedAt = Date.now();
  const minSplashMs = 850;

  function isStandalone() {
    return Boolean(
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
      || window.navigator.standalone === true
    );
  }

  function setSplashMode(mode) {
    if (!splashEl) return;
    const isLoading = mode === "loading";
    splashEl.classList.remove("hidden");
    splashEl.classList.toggle("is-loading", isLoading);
    splashEl.setAttribute("aria-hidden", "false");
    if (splashLoaderEl) {
      splashLoaderEl.classList.toggle("hidden", !isLoading);
      splashLoaderEl.setAttribute("aria-hidden", isLoading ? "false" : "true");
    }
  }

  function hideSplash() {
    if (!splashEl) return;
    splashEl.classList.add("hidden");
    splashEl.classList.remove("is-loading");
    splashEl.setAttribute("aria-hidden", "true");
    if (splashLoaderEl) {
      splashLoaderEl.classList.add("hidden");
      splashLoaderEl.setAttribute("aria-hidden", "true");
    }
  }

  async function waitForMinimumSplash() {
    const remainingMs = minSplashMs - (Date.now() - splashStartedAt);
    if (remainingMs > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, remainingMs));
    }
  }

  function redirectToShop(options = {}) {
    if (redirected) return;
    redirected = true;
    const useLoadingSplash = Boolean(options.loading);
    const delayMs = Number(options.delayMs || 0);
    if (useLoadingSplash) {
      setSplashMode("loading");
    }
    window.setTimeout(() => {
      window.location.replace(shopUrl);
    }, useLoadingSplash ? Math.max(delayMs, 280) : 0);
  }

  function markRecentPresence(reason) {
    if (!pwaPresence || typeof pwaPresence.markPresence !== "function") return;
    pwaPresence.markPresence(reason || "install-page");
  }

  function hasRecentPresence() {
    if (!isAndroid || !pwaPresence || typeof pwaPresence.hasRecentPresence !== "function") return false;
    return Boolean(pwaPresence.hasRecentPresence());
  }

  function looksLikeInstalledShopApp(entry) {
    if (!entry || typeof entry !== "object") return false;

    const platform = String(entry.platform || "").trim().toLowerCase();
    const id = String(entry.id || "").trim();
    const url = String(entry.url || "").trim();

    if (platform && platform !== "webapp") return false;
    if (id && /^\/pwa\/shop\//.test(id)) return true;

    try {
      const parsedUrl = url ? new URL(url, window.location.origin) : null;
      return Boolean(parsedUrl && parsedUrl.origin === window.location.origin && parsedUrl.pathname === "/manifest.json");
    } catch (_) {
      return false;
    }
  }

  async function detectInstalledApp() {
    if (isStandalone()) {
      markRecentPresence("standalone");
      redirectToShop({ loading: isAndroid && !isIOS, delayMs: 820 });
      return true;
    }
    if (hasRecentPresence()) {
      redirectToShop({ loading: isAndroid && !isIOS, delayMs: 820 });
      return true;
    }
    if (typeof navigator.getInstalledRelatedApps !== "function") return false;

    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(relatedApps) && relatedApps.some(looksLikeInstalledShopApp)) {
        markRecentPresence("related-apps");
        redirectToShop({ loading: isAndroid && !isIOS, delayMs: 820 });
        return true;
      }
    } catch (_) {}

    return false;
  }

  function hideAuxiliaryBlocks() {
    [textEl, stepsEl, loaderEl, hintEl].forEach((node) => {
      if (!node) return;
      node.classList.add("hidden");
      if (node.hasAttribute("aria-hidden")) {
        node.setAttribute("aria-hidden", "true");
      }
    });
  }

  async function waitForStandaloneActivation(timeoutMs = 4500) {
    if (!isAndroid) return false;
    if (isStandalone()) {
      markRecentPresence("standalone");
      return true;
    }

    const startedAt = Date.now();
    while ((Date.now() - startedAt) < timeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      if (isStandalone()) {
        markRecentPresence("standalone");
        return true;
      }
    }

    return false;
  }

  function setAndroidCheckingState(active) {
    if (!isAndroid || isIOS) return;
    actionBtn.classList.toggle("hidden", active);
    openBtn.classList.toggle("hidden", active);
    if (!loaderEl) return;
    loaderEl.classList.toggle("hidden", !active);
    loaderEl.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function mountIosToolbarHint() {
    if (!isIOS || iosToolbarHintEl || !document.body) return;
    iosToolbarHintEl = document.createElement("div");
    iosToolbarHintEl.className = "shop-install-ios-toolbar-hint";
    iosToolbarHintEl.setAttribute("aria-hidden", "true");
    iosToolbarHintEl.innerHTML = [
      "<div class=\"shop-install-ios-toolbar-hint__bubble\">",
      "<span class=\"shop-install-ios-toolbar-hint__label\">Кнопка «Поделиться»</span>",
      "<span class=\"shop-install-share-icon-wrap\" aria-hidden=\"true\">",
      "<img class=\"shop-install-share-icon\" src=\"/static/assets/ios-safari-share.png\" alt=\"\" />",
      "</span>",
      "</div>",
      "<div class=\"shop-install-ios-toolbar-hint__arrow\"></div>"
    ].join("");
    document.body.appendChild(iosToolbarHintEl);
  }

  function pulseIosToolbarHint() {
    if (!iosToolbarHintEl) return;
    iosToolbarHintEl.classList.remove("is-pulsing");
    void iosToolbarHintEl.offsetWidth;
    iosToolbarHintEl.classList.add("is-pulsing");
  }

  function renderIosSteps() {
    if (!stepsEl) return;
    stepsEl.innerHTML = [
      "Нажмите на кнопку «Поделиться» в самом низу.",
      "Выберите «На экран Домой» и подтвердите добавление."
    ].map((item, index) => (
      `<div class="shop-install-page__step"><span>${index + 1}</span><div>${item}</div></div>`
    )).join("");
    stepsEl.classList.remove("hidden");
  }

  function showIosInstallHint() {
    if (!hintEl) return;
    hintEl.textContent = "Нажмите на кнопку «Поделиться» в самом низу, затем выберите «На экран Домой».";
    hintEl.classList.remove("hidden");
  }

  async function handleInstall() {
    if (isIOS && !deferredPrompt) {
      showIosInstallHint();
      pulseIosToolbarHint();
      return;
    }

    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      suppressInstalledRedirect = Boolean(choice && choice.outcome === "accepted");
      deferredPrompt = null;
    } catch (_) {
      deferredPrompt = null;
      suppressInstalledRedirect = false;
    }
  }

  titleEl.textContent = "Установка приложения";
  appNameEl.textContent = appTitle;
  actionBtn.textContent = "Установить";
  openBtn.textContent = "Отмена";
  openBtn.href = shopUrl;
  if (siteLinkEl) {
    siteLinkEl.textContent = "Оформить заказ на сайте";
    siteLinkEl.href = shopUrl;
  }
  hideAuxiliaryBlocks();

  if (isIOS) {
    actionBtn.classList.add("hidden");
    openBtn.classList.add("hidden");
    if (siteLinkEl) {
      siteLinkEl.classList.remove("hidden");
    }
    renderIosSteps();
    mountIosToolbarHint();
    pulseIosToolbarHint();
  }

  actionBtn.addEventListener("click", handleInstall);
  openBtn.addEventListener("click", (event) => {
    event.preventDefault();
    redirectToShop();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markRecentPresence("appinstalled");
    if (suppressInstalledRedirect) return;
    redirectToShop();
  });

  async function init() {
    if (isStandalone()) {
      markRecentPresence("standalone");
      redirectToShop({ loading: isAndroid && !isIOS, delayMs: 820 });
      return;
    }

    if (isAndroid && !isIOS) {
      setSplashMode("logo");
      setAndroidCheckingState(true);
      if (await detectInstalledApp()) return;
      if (await waitForStandaloneActivation()) {
        redirectToShop({ loading: true, delayMs: 820 });
        return;
      }
      await waitForMinimumSplash();
      hideSplash();
      setAndroidCheckingState(false);
      if (siteLinkEl) {
        siteLinkEl.classList.remove("hidden");
      }
      return;
    }

    if (await detectInstalledApp()) return;
    await waitForMinimumSplash();
    hideSplash();
    if (!isIOS) {
      actionBtn.classList.remove("hidden");
      openBtn.classList.remove("hidden");
    }
    if (siteLinkEl) {
      siteLinkEl.classList.remove("hidden");
    }
  }

  void init();
})();
