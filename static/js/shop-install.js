(() => {
  const params = new URLSearchParams(window.location.search || "");
  const installRequested = params.get("install") === "1";
  const blockedPath = /^\/(?:telegram\/app|max-app)(?:\/|$)/.test(window.location.pathname || "");

  if (!installRequested || blockedPath) return;

  const sheetEl = document.getElementById("shopInstallSheet");
  const backdropEl = document.getElementById("shopInstallBackdrop");
  const closeBtn = document.getElementById("shopInstallCloseBtn");
  const titleEl = document.getElementById("shopInstallTitle");
  const textEl = document.getElementById("shopInstallText");
  const stepsEl = document.getElementById("shopInstallSteps");
  const loaderEl = document.getElementById("shopInstallLoader");
  const actionBtn = document.getElementById("shopInstallActionBtn");
  const continueBtn = document.getElementById("shopInstallContinueBtn");
  const hintEl = document.getElementById("shopInstallHint");

  if (!sheetEl || !titleEl || !textEl || !stepsEl || !actionBtn || !continueBtn || !hintEl) return;

  const context = window.__SHOP_INSTALL_CONTEXT__ || {};
  const appTitle = String(context.title || "Витрина").trim() || "Витрина";
  const ua = navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isYandexBrowser = /YaBrowser/i.test(ua);
  const isChromeAndroid = isAndroid
    && /Chrome\//i.test(ua)
    && !/EdgA|OPR|Opera|SamsungBrowser|YaBrowser|MiuiBrowser|HuaweiBrowser|VivoBrowser|DuckDuckGo/i.test(ua)
    && !/wv\)|; wv\b/i.test(ua);
  const isDevInstall = params.get("dev") === "1";
  const hostname = String(window.location.hostname || "").trim().toLowerCase();
  const isLoopbackHost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  const isInsecureInstallOrigin = !window.isSecureContext && window.location.protocol === "http:" && !isLoopbackHost;
  const standaloneMedia = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;
  const promptDiscoveryTimeoutMs = isAndroid ? 2600 : 1400;
  const pwaPresence = window.__SHOP_PWA_PRESENCE__ || null;
  const actionLabel = "Установить приложение";
  const cancelLabel = "Отмена";
  let deferredPrompt = null;
  let resolvedState = "checking";
  let redirected = false;
  let postInstallMonitorPromise = null;

  function getInstallTitle() {
    return `Установка приложения ${appTitle}`;
  }

  function getCleanShopUrl() {
    try {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("install");
      if (nextUrl.searchParams.get("source") === "qr") {
        nextUrl.searchParams.delete("source");
      }
      return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
    } catch (_) {
      return window.location.pathname || "/";
    }
  }

  function isStandalone() {
    return Boolean(
      (standaloneMedia && standaloneMedia.matches)
      || window.navigator.standalone === true
    );
  }

  function replaceInstallQuery() {
    try {
      window.history.replaceState({}, "", getCleanShopUrl());
    } catch (_) {}
  }

  function redirectToShop() {
    if (redirected) return;
    redirected = true;
    window.location.replace(getCleanShopUrl());
  }

  function markRecentPresence(reason) {
    if (!pwaPresence || typeof pwaPresence.markPresence !== "function") return;
    pwaPresence.markPresence(reason || "shop-install");
  }

  function hasRecentPresence() {
    if (!isAndroid || !pwaPresence || typeof pwaPresence.hasRecentPresence !== "function") return false;
    return Boolean(pwaPresence.hasRecentPresence());
  }

  function toggleSheet(visible) {
    sheetEl.classList.toggle("hidden", !visible);
    sheetEl.setAttribute("aria-hidden", visible ? "false" : "true");
    document.body.classList.toggle("shop-install-open", visible);
  }

  function closeSheet() {
    toggleSheet(false);
    replaceInstallQuery();
  }

  function getManualInstallState() {
    if (isIOS) return "ios";
    if (isAndroid && isYandexBrowser) return "android-yandex";
    if (isChromeAndroid) return "android-chrome";
    if (isAndroid) return "android";
    return "fallback";
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

  async function waitForStandaloneActivation(timeoutMs = 4600) {
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
    resolvedState = "checking";
    toggleSheet(true);
    renderState();
    postInstallMonitorPromise = (async () => {
      const activated = await waitForStandaloneActivation(timeoutMs);
      if (activated || isStandalone()) {
        redirectToShop();
        return true;
      }
      resolvedState = "installed";
      toggleSheet(true);
      renderState();
      return false;
    })();
    try {
      return await postInstallMonitorPromise;
    } finally {
      postInstallMonitorPromise = null;
    }
  }

  function renderSteps(items) {
    if (!Array.isArray(items) || !items.length) {
      stepsEl.innerHTML = "";
      stepsEl.classList.add("hidden");
      return;
    }

    stepsEl.innerHTML = items.map((item, index) => (
      `<div class="shop-install-sheet__step"><span>${index + 1}</span><div>${item}</div></div>`
    )).join("");
    stepsEl.classList.remove("hidden");
  }

  function setLoaderVisible(visible) {
    if (!loaderEl) return;
    loaderEl.classList.toggle("hidden", !visible);
    loaderEl.setAttribute("aria-hidden", visible ? "false" : "true");
  }

  function renderState() {
    let title = getInstallTitle();
    let text = "Проверяем, можно ли сразу открыть установленное приложение или показать системную установку.";
    let hint = "";
    let steps = [];
    let showAction = false;

    if (resolvedState === "prompt") {
      text = "Нажмите кнопку ниже, чтобы открыть системное окно установки приложения.";
      hint = "После установки приложение появится на экране телефона. Если Android не откроет его сам, запустите приложение вручную.";
      showAction = true;
    } else if (resolvedState === "installed") {
      text = "Приложение установлено.";
      hint = "Если приложение не открылось само, запустите его с экрана телефона.";
    } else if (resolvedState === "ios") {
      text = "На iPhone и iPad установка выполняется через меню Safari.";
      hint = "Если страница открыта не в Safari, откройте ссылку в Safari и повторите шаги.";
      steps = [
        "Нажмите кнопку «Поделиться».",
        "Выберите «На экран Домой».",
        "Подтвердите добавление приложения."
      ];
    } else if (resolvedState === "android-yandex") {
      text = "В Яндекс Браузере установка обычно делается через меню браузера.";
      hint = "Если нужен системный prompt установки, откройте эту ссылку в Chrome.";
      steps = [
        "Откройте меню Яндекс Браузера.",
        "Выберите пункт добавления приложения или ярлыка на главный экран.",
        "Подтвердите установку."
      ];
    } else if (resolvedState === "android-chrome") {
      text = "Chrome не показал системную установку автоматически.";
      hint = "Обычно это происходит, когда приложение уже установлено или установка раньше была отклонена.";
      steps = [
        "Проверьте, не установлено ли приложение уже на этом телефоне.",
        "Откройте ссылку еще раз после полной загрузки страницы.",
        "Либо установите приложение через меню Chrome."
      ];
      if (isDevInstall) {
        steps.push("Если на другом Android prompt появляется, значит сама PWA уже настроена корректно.");
      }
    } else if (resolvedState === "android") {
      text = "Если браузер не показал установку автоматически, установите приложение через меню браузера.";
      hint = "Обычно нужный пункт называется «Установить приложение» или «Добавить на главный экран».";
      steps = [
        "Откройте меню браузера.",
        "Найдите пункт установки приложения.",
        "Подтвердите установку."
      ];
    } else if (resolvedState === "insecure") {
      text = "Страница открыта по HTTP на локальном адресе, поэтому браузер не покажет системную установку PWA.";
      hint = "Для настоящей установки нужен HTTPS-домен или HTTPS tunnel.";
      steps = [
        "Для проверки интерфейса можно остаться на сайте.",
        "Для установки используйте HTTPS tunnel или домен витрины."
      ];
    } else if (resolvedState === "fallback") {
      text = "Браузер не показал системную установку автоматически.";
      hint = "На Android лучше использовать Chrome, на iPhone — Safari.";
      steps = [
        "Откройте меню браузера.",
        "Найдите пункт добавления приложения на главный экран.",
        "Подтвердите установку."
      ];
    }

    titleEl.textContent = title;
    textEl.textContent = text;
    hintEl.textContent = hint;
    hintEl.classList.toggle("hidden", !hint);
    actionBtn.textContent = actionLabel;
    actionBtn.classList.toggle("hidden", !showAction);
    continueBtn.textContent = cancelLabel;
    setLoaderVisible(isAndroid && resolvedState === "checking");
    renderSteps(steps);
  }

  function resolveState() {
    if (redirected) return;
    if (isStandalone()) {
      redirectToShop();
      return;
    }
    if (deferredPrompt) {
      resolvedState = "prompt";
    } else if (isInsecureInstallOrigin) {
      resolvedState = "insecure";
    } else {
      resolvedState = getManualInstallState();
    }
    toggleSheet(true);
    renderState();
  }

  async function handleInstallAction() {
    if (!deferredPrompt) return;

    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      deferredPrompt = null;

      if (choice && choice.outcome === "accepted") {
        void handleInstalledLaunchTransition();
        return;
      }

      resolvedState = getManualInstallState();
      renderState();
    } catch (_) {
      deferredPrompt = null;
      resolvedState = getManualInstallState();
      renderState();
    }
  }

  actionBtn.addEventListener("click", handleInstallAction);
  continueBtn.addEventListener("click", closeSheet);
  if (closeBtn) closeBtn.addEventListener("click", closeSheet);
  if (backdropEl) backdropEl.addEventListener("click", closeSheet);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    resolvedState = "prompt";
    if (!redirected) {
      toggleSheet(true);
      renderState();
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    markRecentPresence("appinstalled");
    void handleInstalledLaunchTransition();
  });

  if (isStandalone()) {
    markRecentPresence("standalone");
    redirectToShop();
    return;
  }

  toggleSheet(true);
  renderState();

  Promise.resolve().then(async () => {
    if (await detectInstalledApp()) return;
    if (isInsecureInstallOrigin || deferredPrompt) {
      resolveState();
      return;
    }
    window.setTimeout(() => {
      if (redirected || deferredPrompt || resolvedState !== "checking") return;
      resolveState();
    }, promptDiscoveryTimeoutMs);
  });
})();
