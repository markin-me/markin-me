(function () {
  "use strict";

  let loadPromise = null;
  const passportPayloads = new Map();
  const passportRequests = new Map();

  function normalizeIds(productIds) {
    return Array.from(new Set((Array.isArray(productIds) ? productIds : [productIds])
      .map((id) => Number(id || 0))
      .filter((id) => Number.isFinite(id) && id > 0)));
  }

  async function fetchPassports(productIds) {
    const ids = normalizeIds(productIds);
    const missingIds = ids.filter((id) => !passportPayloads.has(id) && !passportRequests.has(id));
    if (missingIds.length) {
      const request = fetch("/api/public/products/batch/passports", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: missingIds }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`PRODUCT_PASSPORTS_HTTP_${response.status}`);
          return response.json();
        })
        .then((json) => {
          const data = json && typeof json.data === "object" ? json.data : {};
          Object.keys(data).forEach((rawId) => {
            const id = Number(rawId || 0);
            const payload = data[rawId] || null;
            if (id > 0 && payload && typeof payload === "object") passportPayloads.set(id, payload);
          });
        })
        .finally(() => {
          missingIds.forEach((id) => passportRequests.delete(id));
        });
      missingIds.forEach((id) => passportRequests.set(id, request));
    }
    await Promise.all(Array.from(new Set(ids.map((id) => passportRequests.get(id)).filter(Boolean))));
  }

  function applyPassports(productIds) {
    if (typeof window.__applySharedProductPassportPayloads !== "function") return;
    const payload = {};
    passportPayloads.forEach((value, id) => {
      payload[id] = value;
    });
    window.__applySharedProductPassportPayloads(payload);
  }

  function loadScript(src, marker) {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) {
      if (existing.dataset.loaded === "1") return Promise.resolve();
      return new Promise((resolve, reject) => {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
      });
    }
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.setAttribute(marker, "1");
      script.addEventListener("load", () => {
        script.dataset.loaded = "1";
        resolve();
      }, { once: true });
      script.addEventListener("error", reject, { once: true });
      document.head.appendChild(script);
    });
  }

  async function ensureRenderer() {
    if (typeof window.__mountSharedProductDetails === "function") return;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
      if (typeof window.ensureShopLateLoaded === "function") {
        await window.ensureShopLateLoaded();
      } else {
        await loadScript("/static/js/shop-core.js?v=20260806-product-passport-preload", "data-shared-product-core");
        await loadScript("/static/js/shop-late.js?v=20260806-subscription-item-quantity", "data-shared-product-late");
      }
      if (typeof window.__mountSharedProductDetails !== "function") {
        throw new Error("PRODUCT_DETAILS_RENDERER_UNAVAILABLE");
      }
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
    return loadPromise;
  }

  async function mount(options = {}) {
    const productId = Number(options.productId || options.product?.id || 0);
    await Promise.all([
      ensureRenderer(),
      productId > 0 ? fetchPassports([productId]) : Promise.resolve(),
    ]);
    applyPassports([productId]);
    const host = options.container || null;
    if (!host) throw new Error("INVALID_PRODUCT_DETAILS_TARGET");
    let target = host;
    if (options.mode === "subscription" && typeof host.attachShadow === "function") {
      const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
      shadow.innerHTML = "";
      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "/static/css/shared-product-details.css?v=20260806-subscription-item-quantity";
      const icons = document.createElement("link");
      icons.rel = "stylesheet";
      icons.href = "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css";
      const root = document.createElement("div");
      root.className = "shared-product-details-root";
      shadow.append(styles, icons, root);
      target = root;
    }
    return window.__mountSharedProductDetails({ ...options, container: target });
  }

  async function preload() {
    await ensureRenderer();
  }

  async function prefetch(productIds = []) {
    const ids = normalizeIds(productIds);
    await Promise.all([ensureRenderer(), fetchPassports(ids)]);
    applyPassports(ids);
    if (typeof window.__prefetchSharedProductDetails !== "function") return;
    return window.__prefetchSharedProductDetails(ids);
  }

  async function getSummaries(productIds = []) {
    const ids = normalizeIds(productIds);
    await Promise.all([ensureRenderer(), fetchPassports(ids)]);
    applyPassports(ids);
    if (typeof window.__getSharedProductListSummaries !== "function") return {};
    return window.__getSharedProductListSummaries(ids);
  }

  async function getPassport(productId) {
    const id = Number(productId || 0);
    if (!(id > 0)) return null;
    await fetchPassports([id]);
    return passportPayloads.get(id) || null;
  }

  window.SharedProductDetails = Object.freeze({ mount, preload, prefetch, getSummaries, getPassport });
})();
