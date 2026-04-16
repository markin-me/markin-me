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
  const inlineSplashEl = document.getElementById("shopSplash");

  if (!titleEl || !appNameEl || !actionBtn || !openBtn) return;

  const appTitle = String(context.title || "Витрина").trim() || "Витрина";
  const shopUrl = String(context.shopUrl || "/").trim() || "/";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isInsecureInstallOrigin = !window.isSecureContext && window.location.protocol === "http:" && !isLoopbackHost;
  const pwaPresence = window.__SHOP_PWA_PRESENCE__ || null;
  let deferredPrompt = null;
  let redirected = false;
  let iosToolbarHintEl = null;
  let primaryUiReady = false;
  let postInstallMonitorPromise = null;
  let promptDiscoveryPromise = null;
  let inlineSplashHidden = false;
  const inlineSplashStartedAt = Number(window.__SHOP_INLINE_SPLASH_STARTED_AT__ || Date.now()) || Date.now();
  const splashStartedAt = Date.now();
  const minSplashMs = 520;
  const promptWaitTimeoutMs = isAndroid ? 2600 : 1400;
  const serviceWorkerReadyTimeoutMs = 1100;
  const installPromptReloadKey = "shop-install-prompt-reloaded";
  const inlineSplashMinVisibleMs = 420;
  const inlineSplashFadeOutMs = 320;

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

  function hideInlineSplash(minVisibleMs = inlineSplashMinVisibleMs) {
    if (inlineSplashHidden || !inlineSplashEl) return;
    inlineSplashHidden = true;
    const elapsedMs = Date.now() - inlineSplashStartedAt;
    const waitMs = Math.max(0, Number(minVisibleMs || 0) - elapsedMs);
    window.setTimeout(() => {
      inlineSplashEl.classList.add("is-done");
      window.setTimeout(() => {
        try {
          inlineSplashEl.remove();
        } catch (_) {}
      }, inlineSplashFadeOutMs);
    }, waitMs);
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
    }, useLoadingSplash ? Math.max(delayMs, 0) : 0);
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
      redirectToShop();
      return true;
    }
    if (typeof navigator.getInstalledRelatedApps !== "function") return false;

    try {
      const relatedApps = await navigator.getInstalledRelatedApps();
      if (Array.isArray(relatedApps) && relatedApps.some(looksLikeInstalledShopApp)) {
        markRecentPresence("related-apps");
        redirectToShop();
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

  function revealPrimaryUi(renderState) {
    hideSplash();
    primaryUiReady = true;
    if (typeof renderState === "function") {
      renderState();
    }
    if (siteLinkEl) {
      siteLinkEl.classList.remove("hidden");
    }
  }

  function setTextBlock(node, text) {
    if (!node) return;
    const safeText = String(text || "").trim();
    node.textContent = safeText;
    node.classList.toggle("hidden", !safeText);
    if (node.hasAttribute("aria-hidden")) {
      node.setAttribute("aria-hidden", safeText ? "false" : "true");
    }
  }

  function renderStepItems(items) {
    if (!stepsEl) return;
    const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!safeItems.length) {
      stepsEl.innerHTML = "";
      stepsEl.classList.add("hidden");
      return;
    }
    stepsEl.innerHTML = safeItems.map((item, index) => (
      `<div class="shop-install-page__step"><span>${index + 1}</span><div>${item}</div></div>`
    )).join("");
    stepsEl.classList.remove("hidden");
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

  async function handleInstalledLaunchTransition(timeoutMs = 4600) {
    if (redirected) return true;
    if (postInstallMonitorPromise) return postInstallMonitorPromise;
    renderPromptWaitingState();
    postInstallMonitorPromise = (async () => {
      const activated = await waitForStandaloneActivation(timeoutMs);
      if (activated || isStandalone()) {
        redirectToShop();
        return true;
      }
      renderInstalledState();
      return false;
    })();
    try {
      return await postInstallMonitorPromise;
    } finally {
      postInstallMonitorPromise = null;
    }
  }

  function setAndroidCheckingState(active) {
    if (!isAndroid || isIOS) return;
    actionBtn.classList.toggle("hidden", active);
    openBtn.classList.toggle("hidden", active);
    if (!loaderEl) return;
    loaderEl.classList.toggle("hidden", !active);
    loaderEl.setAttribute("aria-hidden", active ? "false" : "true");
  }

  function renderPromptReadyState() {
    if (isIOS) return;
    setAndroidCheckingState(false);
    setTextBlock(textEl, "Нажмите кнопку ниже, чтобы открыть системное окно установки приложения.");
    setTextBlock(hintEl, "После установки приложение появится на экране телефона. Если Android не откроет его сам, запустите приложение вручную.");
    renderStepItems([]);
    actionBtn.classList.remove("hidden");
    openBtn.classList.remove("hidden");
  }

  function renderInstalledState() {
    if (isIOS) return;
    setAndroidCheckingState(false);
    setTextBlock(textEl, "Приложение установлено.");
    setTextBlock(hintEl, "Если Android не открыл его сам, запустите приложение с главного экрана телефона.");
    renderStepItems([
      "Проверьте, появилась ли иконка приложения на главном экране.",
      "Если приложение уже открылось, эту вкладку браузера можно просто закрыть."
    ]);
    actionBtn.classList.add("hidden");
    openBtn.classList.add("hidden");
  }

  function renderInsecureInstallState() {
    const steps = [
      "Откройте эту же витрину через HTTPS tunnel или рабочий домен.",
      "После открытия по HTTPS браузер сможет показать системную установку PWA.",
      "По LAN IP через HTTP можно только открыть сайт, но не запустить нативную установку."
    ];
    setAndroidCheckingState(false);
    setTextBlock(textEl, "Эта страница открыта по обычному HTTP на локальном адресе, поэтому браузер не может запустить системную установку приложения.");
    setTextBlock(hintEl, "Для native install нужен HTTPS-домен или HTTPS tunnel. Адреса вида 192.168.x.x подходят только для открытия локальной витрины.");
    renderStepItems(steps);
    actionBtn.classList.add("hidden");
    openBtn.classList.remove("hidden");
  }

  function renderManualInstallFallback() {

    const steps = isAndroid
      ? [
          "Откройте меню браузера.",
          "Выберите пункт «Установить приложение» или «Добавить на главный экран».",
          "Подтвердите установку."
        ]
      : [
          "Откройте меню браузера.",
          "Найдите установку приложения или добавление на главный экран.",
          "Подтвердите установку."
        ];
    const hint = isAndroid
      ? "Если это первый заход по QR, подождите пару секунд и попробуйте снова. Если системное окно так и не появится, установите приложение через меню браузера."
      : "Этот браузер не показал системное окно установки автоматически.";
    setAndroidCheckingState(false);
    setTextBlock(textEl, "Браузер пока не показал системное окно установки.");
    setTextBlock(hintEl, hint);
    renderStepItems(steps);
    actionBtn.classList.add("hidden");
    openBtn.classList.remove("hidden");
  }

  function renderPromptWaitingState() {
    if (isIOS) return;
    setTextBlock(textEl, "Подготавливаем системное окно установки…");
    setTextBlock(hintEl, "");
    renderStepItems([]);
    setAndroidCheckingState(true);
    if (isAndroid) {
      openBtn.classList.remove("hidden");
    }
    if (!isAndroid) {
      actionBtn.classList.add("hidden");
      openBtn.classList.add("hidden");
      if (loaderEl) {
        loaderEl.classList.remove("hidden");
        loaderEl.setAttribute("aria-hidden", "false");
      }
    }
  }

  async function waitForDeferredPrompt(timeoutMs) {
    const safeTimeoutMs = Math.max(300, Number(timeoutMs) || promptWaitTimeoutMs);
    const startedAt = Date.now();
    while (!deferredPrompt && (Date.now() - startedAt) < safeTimeoutMs) {
      await new Promise((resolve) => window.setTimeout(resolve, 120));
    }
    return !!deferredPrompt;
  }

  function syncPromptAvailability() {
    if (!primaryUiReady || isIOS) return;
    if (deferredPrompt) {
      renderPromptReadyState();
      return;
    }
    if (isInsecureInstallOrigin) {
      renderInsecureInstallState();
      return;
    }
    renderManualInstallFallback();
  }

  function startPromptDiscovery(timeoutMs = promptWaitTimeoutMs) {
    if (promptDiscoveryPromise) return promptDiscoveryPromise;
    promptDiscoveryPromise = (async () => {
      const promptReady = await waitForDeferredPrompt(timeoutMs);
      if (redirected || !primaryUiReady || isIOS) return promptReady;
      if (promptReady) {
        renderPromptReadyState();
      } else {
        syncPromptAvailability();
      }
      return promptReady;
    })();
    return promptDiscoveryPromise;
  }

  async function getInstallServiceWorkerRegistration() {
    if (!("serviceWorker" in navigator)) return null;
    try {
      const byScope = await navigator.serviceWorker.getRegistration("/");
      if (byScope && byScope.active) return byScope;
      if (byScope) {
        try {
          const ready = await Promise.race([
            navigator.serviceWorker.ready,
            new Promise((resolve) => window.setTimeout(() => resolve(null), serviceWorkerReadyTimeoutMs))
          ]);
          return ready || byScope;
        } catch (_) {
          return byScope;
        }
      }
    } catch (_) {}
    try {
      const registered = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      if (registered && registered.active) return registered;
      try {
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise((resolve) => window.setTimeout(() => resolve(null), serviceWorkerReadyTimeoutMs))
        ]);
        return ready || registered || null;
      } catch (_) {
        return registered || null;
      }
    } catch (_) {}
    return null;
  }

  async function maybeReloadForInstallPrompt() {
    if (isIOS || !("serviceWorker" in navigator)) return false;
    if (deferredPrompt) return false;
    const registration = await getInstallServiceWorkerRegistration();
    if (!registration) return false;
    if (navigator.serviceWorker.controller) {
      try {
        window.sessionStorage.removeItem(installPromptReloadKey);
      } catch (_) {}
      return false;
    }
    if (deferredPrompt) return false;
    let shouldReload = false;
    try {
      shouldReload = window.sessionStorage.getItem(installPromptReloadKey) !== "1";
      if (shouldReload) {
        window.sessionStorage.setItem(installPromptReloadKey, "1");
      }
    } catch (_) {
      shouldReload = false;
    }
    if (!shouldReload) return false;
    window.location.reload();
    return true;
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
    renderStepItems([
      "Нажмите на кнопку «Поделиться» в самом низу.",
      "Выберите «На экран Домой» и подтвердите добавление."
    ]);
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

    if (!deferredPrompt) {
      if (isInsecureInstallOrigin) {
        renderInsecureInstallState();
        return;
      }
      renderManualInstallFallback();
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;
      if (choice && choice.outcome === "accepted") {
        void handleInstalledLaunchTransition();
      }
    } catch (_) {
      deferredPrompt = null;
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

  hideInlineSplash();

  actionBtn.addEventListener("click", handleInstall);
  openBtn.addEventListener("click", (event) => {
    event.preventDefault();
    redirectToShop();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    if (primaryUiReady && !isIOS) {
      renderPromptReadyState();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      window.sessionStorage.removeItem(installPromptReloadKey);
    } catch (_) {}
    markRecentPresence("appinstalled");
    void handleInstalledLaunchTransition();
  });

  async function init() {
    if (isStandalone()) {
      markRecentPresence("standalone");
      redirectToShop();
      return;
    }

    if (isInsecureInstallOrigin) {
      await waitForMinimumSplash();
      hideSplash();
      primaryUiReady = true;
      renderInsecureInstallState();
      if (siteLinkEl) {
        siteLinkEl.classList.remove("hidden");
      }
      return;
    }

    if (isAndroid && !isIOS) {
      setSplashMode("logo");
      setAndroidCheckingState(true);
      if (await detectInstalledApp()) return;
      const installPromptReloadPromise = maybeReloadForInstallPrompt();
      await waitForMinimumSplash();
      if (await installPromptReloadPromise) return;
      revealPrimaryUi(() => {
        if (deferredPrompt) {
          renderPromptReadyState();
          return;
        }
        renderPromptWaitingState();
      });
      if (!deferredPrompt) {
        void startPromptDiscovery();
      }
      return;
    }

    if (await detectInstalledApp()) return;
    await waitForMinimumSplash();
    revealPrimaryUi(() => {
      if (isIOS) return;
      if (deferredPrompt) {
        renderPromptReadyState();
        return;
      }
      renderPromptWaitingState();
    });
    if (!deferredPrompt && !isIOS) {
      void startPromptDiscovery();
    }
  }

  void init();
})();
