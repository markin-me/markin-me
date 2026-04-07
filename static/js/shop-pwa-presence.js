(() => {
  const STORAGE_KEY = "shop-pwa-presence.v1";
  const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

  function isStandalone() {
    try {
      return Boolean(
        (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
        || window.navigator.standalone === true
      );
    } catch (_) {
      return false;
    }
  }

  function markPresence(reason = "runtime") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ts: Date.now(),
        reason: String(reason || "runtime").slice(0, 40)
      }));
    } catch (_) {}
  }

  function readPresence() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const ts = Number(parsed && parsed.ts);
      if (!Number.isFinite(ts) || ts <= 0) return null;
      if ((Date.now() - ts) > MAX_AGE_MS) {
        window.localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function hasRecentPresence() {
    return Boolean(readPresence());
  }

  const standaloneMedia = window.matchMedia ? window.matchMedia("(display-mode: standalone)") : null;

  if (isStandalone()) {
    markPresence("startup");
  }

  if (standaloneMedia) {
    const onChange = (event) => {
      if (event && event.matches) {
        markPresence("media");
      }
    };
    if (typeof standaloneMedia.addEventListener === "function") {
      standaloneMedia.addEventListener("change", onChange);
    } else if (typeof standaloneMedia.addListener === "function") {
      standaloneMedia.addListener(onChange);
    }
  }

  window.addEventListener("pageshow", () => {
    if (isStandalone()) {
      markPresence("pageshow");
    }
  });

  window.addEventListener("appinstalled", () => {
    markPresence("appinstalled");
  });

  window.__SHOP_PWA_PRESENCE__ = {
    isStandalone,
    markPresence,
    hasRecentPresence
  };
})();
