(() => {



  function formatValue(key, value) {



    if (key == "password_hash") return "••••••";



    if (key == "is_active") return Number(value) == 1 ? "Да" : "Нет";



    if (value === null || value === undefined || value === "") return "—";



    return String(value);



  }







  function getTimezones() {



    const list = [];



    for (let i = -12; i <= 14; i += 1) {



      if (i === 0) {



        list.push("+0");



      } else if (i > 0) {



        list.push(`+${i}`);



      } else {



        list.push(String(i));



      }



    }



    return list;



  }







  function fillTimezoneSelect(current, selectId = "tenantTimezoneSelect") {



    const select = typeof selectId === "string" ? document.getElementById(selectId) : selectId;



    if (!select) return;







    const list = getTimezones();



    select.innerHTML = "";



    list.forEach((tz) => {



      const opt = document.createElement("option");



      opt.value = tz;



      opt.textContent = tz;



      select.appendChild(opt);



    });







    let normalized = current;



    if (current === "UTC") normalized = "+0";



    if (current === "Europe/Moscow") normalized = "+3";



    if (current === "Europe/Kaliningrad") normalized = "+2";



    if (current === "Europe/Samara") normalized = "+4";



    if (current === "Asia/Yekaterinburg") normalized = "+5";



    if (current === "Asia/Omsk") normalized = "+6";



    if (current === "Asia/Novosibirsk") normalized = "+7";



    if (current === "Asia/Irkutsk") normalized = "+8";



    if (current === "Asia/Yakutsk") normalized = "+9";



    if (current === "Asia/Vladivostok") normalized = "+10";



    if (current === "Asia/Magadan") normalized = "+11";



    if (current === "Asia/Kamchatka") normalized = "+12";







    if (normalized && list.includes(normalized)) {



      select.value = normalized;



    } else {



      select.value = "+0";



    }



  }







  async function saveTimezone(tz) {



    try {



      const res = await authFetch("/api/admin/tenant", {



        method: "PUT",



        body: JSON.stringify({ timezone: tz })



      });



      const data = await res.json();



      if (!data || !data.ok) return;



      if (data.tenant) {



        updateTenantCache(data.tenant);



        applyBrandFromTenant(data.tenant);



        fillTimezoneSelect(tz, "tenantTimezoneSelect");



        fillTimezoneSelect(tz, "brandTimezoneSelect");



      }



    } catch (err) {



      console.error("Не удалось сохранить часовой пояс:", err);



    }



  }







  function updateTenantCache(tenant) {



    try {



      if (tenant) {



        localStorage.setItem("tenant", JSON.stringify(tenant));



        document.dispatchEvent(new CustomEvent("tenantDataChanged", { detail: { tenant } }));



      }



    } catch {}



  }







  function getActiveStoreIdFromStorage() {



    if (typeof window === "undefined") return 1;



    const stored = localStorage.getItem("activeStoreId");



    const n = Number(stored);



    return Number.isFinite(n) && n > 0 ? n : 1;



  }







  function setActiveStoreIdToStorage(id) {



    if (typeof window === "undefined") return;



    localStorage.setItem("activeStoreId", String(id));



  }







  let activeStoreId = getActiveStoreIdFromStorage();



  let tenantStockDeductMode = "on_create";



  let tenantStockDeductStatusId = null;



  let domainSetup = null;



  let domainDraftMode = false;



  let domainManageMode = false;



  let domainCancelConfirm = false;



  let domainOriginalValue = "";



  let domainAsciiValue = "";



  let tenantDomains = [];



  let selectedTenantDomainId = null;

  let tenantPwaInstallTargets = [];
  let tenantPwaInstallDevTargets = [];

  let selectedTenantPwaTargetId = null;
  let selectedTenantPwaDevTargetId = null;
  let tenantPwaDesignerSourceMode = "dev";
  let tenantPwaDesignerCardRatio = "1:1";
  let tenantPwaDesignerBackgroundPresetId = "warm-sun";
  let tenantPwaDesignerBackgroundGradientEnabled = true;
  let tenantPwaDesignerBackgroundCustomColor = "";
  let tenantPwaDesignerBackgroundImage = "";
  let tenantPwaDesignerQrStyle = "square";
  let tenantPwaDesignerQrColor = "#111827";
  let tenantPwaDesignerCornerRadius = 30;
  let tenantPwaDesignerBadgeText = "";
  let tenantPwaDesignerUseSiteLogo = false;
  let tenantPwaDesignerQrInstance = null;
  let tenantPwaDesignerQrRenderMode = "styled";
  let tenantPwaDesignerQrPreviewRenderSeq = 0;
  let tenantPwaDesignerRenderRafId = 0;
  let tenantPwaDesignerPreviewRafId = 0;
  let tenantPwaDesignerExpanded = false;
  let tenantPwaDesignerExpandedLayoutRafId = 0;
  let tenantPwaDesignerBadgeEditing = false;
  let tenantPwaDesignerBadgeSaveSeq = 0;
  let tenantPwaDesignerBadgeCommitTs = 0;

  let runDomainStatusCheck = null;

  let domainEnabledDraft = null;

  let chatSoundsDraftMode = false;



  let telegramDraftMode = false;



  let telegramCancelConfirm = false;



  let telegramOriginal = {



    telegram_bot_username: "",



    telegram_bot_token: "",



    tg_mini_app_enabled: 1,



    tg_login_enabled: 0



  };



  let telegramDraft = { ...telegramOriginal };



  let maxDraftMode = false;



  let maxCancelConfirm = false;



  let maxOriginal = {



    max_bot_id: "",



    max_bot_token: "",



    max_mini_app_enabled: 1,



    max_login_enabled: 0



  };



  let maxDraft = { ...maxOriginal };



  let siteDraftMode = false;



  let siteCancelConfirm = false;



  let siteOriginal = {



    site_name: "",



    site_description: "",



    subdomain: "",



    favicon_light_url: ""



  };



  let siteDraft = { ...siteOriginal };



  let chatSidebarBadgeScriptPromise = null;







  function ensureChatSidebarBadgeScriptLoaded() {



    if (window.__chatSidebarBadgeLoaded === true) return Promise.resolve(true);



    if (chatSidebarBadgeScriptPromise) return chatSidebarBadgeScriptPromise;







    const scriptUrl = String(window.__chatSidebarBadgeUrl || "").trim();



    if (!scriptUrl) return Promise.resolve(false);







    const existing = document.querySelector('script[data-chat-sidebar-badge="1"]');



    if (existing) {



      chatSidebarBadgeScriptPromise = new Promise((resolve) => {



        if (window.__chatSidebarBadgeLoaded === true) {



          resolve(true);



          return;



        }



        existing.addEventListener("load", () => {



          window.__chatSidebarBadgeLoaded = true;



          resolve(true);



        }, { once: true });



        existing.addEventListener("error", () => {



          chatSidebarBadgeScriptPromise = null;



          resolve(false);



        }, { once: true });



      });



      return chatSidebarBadgeScriptPromise;



    }







    chatSidebarBadgeScriptPromise = new Promise((resolve) => {



      const script = document.createElement("script");



      script.src = scriptUrl;



      script.async = false;



      script.dataset.chatSidebarBadge = "1";



      script.onload = () => {



        window.__chatSidebarBadgeLoaded = true;



        resolve(true);



      };



      script.onerror = () => {



        chatSidebarBadgeScriptPromise = null;



        resolve(false);



      };



      document.body.appendChild(script);



    });







    return chatSidebarBadgeScriptPromise;



  }



  let systemTelegramDraftMode = false;



  let systemTelegramCancelConfirm = false;



  let systemTelegramOriginal = {



    telegram_bot_username: "",



    telegram_bot_token: "",



    telegram_webhook_url: "",



    telegram_env_enabled: false,



    telegram_tenant_enabled: false



  };



  let systemTelegramDraft = { ...systemTelegramOriginal };



  let systemMaxDraftMode = false;

  let systemMaxCancelConfirm = false;

  let systemMaxOriginal = {

    max_bot_id: "",

    max_bot_token: "",

    max_webhook_url: "",

    max_env_enabled: false

  };

  let systemMaxDraft = { ...systemMaxOriginal };

  let systemMapDraftMode = false;



  let systemMapCancelConfirm = false;



  let systemMapOriginal = {



    provider_name: "",



    tile_url: "",



    attribution: "",



    max_zoom: 22,



    subdomains: "",



    geocoder_provider_name: "",



    geocoder_search_url: "",



    geocoder_country_code: "ru",



    geocoder_language: "ru",



    geocoder_result_limit: 5,



    store_address_map_enabled: false,



    delivery_zone_polygon_provider: "Leaflet-Geoman"



  };



  let systemMapDraft = { ...systemMapOriginal };



  let systemDeliveryZonePolygonDraftMode = false;



  let systemDeliveryZonePolygonCancelConfirm = false;



  let systemDeliveryZonePolygonOriginal = {



    delivery_zone_polygon_provider: "Leaflet-Geoman",



    delivery_zone_polygon_enabled: false



  };



  let systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



  let deliveryLeafletMap = null;



  let deliveryLeafletTileLayer = null;



  let deliveryLeafletSearchMarker = null;



  let deliveryLeafletBranchMarkersLayer = null;



  let deliveryLeafletZonePassiveLayer = null;



  let deliveryLeafletZoneEditLayer = null;



  let deliveryLeafletZoneDraftLayer = null;



  let deliveryLeafletZoneVertexLayer = null;



  let deliveryLeafletZoneMidpointLayer = null;



  let storeLeafletMap = null;



  let storeLeafletTileLayer = null;



  let storeLeafletMarker = null;



  let storeLeafletClickBound = false;



  let deliveryMapConfigCache = null;



  let storeAddressMapModeCache = false;



  let deliveryMapAccountsLoaded = false;



  let deliveryMapAccountsLoadingPromise = null;



  let deliveryMapAccountsProviderName = "";



  let deliveryMapAccountsOriginal = [];



  let deliveryMapAccountsDraft = [];



  let deliveryMapAccountsAddMode = false;



  let deliveryMapAccountsAddDraft = null;



  let deliveryMapAccountsEditId = "";



  let deliveryMapAccountsEditDraft = null;



  const deliveryMapAccountsRevealState = new Map();



  const DELIVERY_MAP_CONFIG_TAB_KEY = "delivery:map-config";



  const DELIVERY_ZONE_CREATE_TAB_KEY = "delivery-zone:create";



  let selectedDeliveryStoreCity = null;



  let selectedDeliveryStoreCityLocation = null;



  let searchedMapCity = null;



  let deliveryCreateMenuOpen = false;



  const deliveryMapSearchPopoverState = {



    open: false,



    items: [],



    status: "",



    mode: "idle"



  };



  const deliveryMapCityLocationCache = new Map();



  const deliveryZonesState = {



    loaded: false,



    items: [],



    selectedId: null,



    snapshot: null,



    mode: "view",



    drawMode: "idle",



    hoverLatLng: null,



    mapFocusedKey: "",



    editLayerKey: "",



    pointMenuOpen: false,



    pointMenuLatLng: null,



    contextMenuOpen: false,



    contextMenuLatLng: null,



    contextMenuZoneId: 0



  };



  let deliveryStoreCityLocationRequestKey = "";



  const DELIVERY_MAP_DEFAULT_CENTER = [61.524, 105.3188];



  const DELIVERY_MAP_DEFAULT_ZOOM = 3;



  const DELIVERY_ZONE_MIDPOINT_MIN_ZOOM = 15;



  const DELIVERY_ZONE_PRESET_COLORS = Object.freeze([



    "#ff7a00",



    "#f59e0b",



    "#facc15",



    "#ef4444",



    "#f43f5e",



    "#ec4899",



    "#d946ef",



    "#8b5cf6",



    "#6366f1",



    "#3b82f6",



    "#06b6d4",



    "#14b8a6",



    "#10b981",



    "#22c55e",



    "#84cc16",



  ]);



  const deliveryZonePanelUiState = {



    infoPopoverOpen: false,



    colorPopoverOpen: false,



    colorEditorOpen: false,



  };







  function applyBrandFromTenant(tenant) {



    if (!tenant) return;



    const theme = document.documentElement.getAttribute("data-theme") || "light";



    const logoImg = document.getElementById("headerLogoImg");



    const logoFallback = document.getElementById("headerLogoFallback");



    const brandNameEl = document.getElementById("headerBrandName");



    const favicon = document.getElementById("appFavicon");



    const appleIcon = document.getElementById("appAppleTouchIcon");



    const manifest = document.getElementById("appManifest");







    const brandName = tenant.name || tenant.site_name || "";



    if (brandNameEl && brandName) {



      brandNameEl.textContent = brandName;



    }



    if (logoFallback && brandName) {



      logoFallback.textContent = String(brandName).trim().slice(0, 1).toUpperCase();



    }







    const logo =



      theme === "dark"



        ? (tenant.logo_dark_url || tenant.logo_light_url)



        : (tenant.logo_light_url || tenant.logo_dark_url);







    if (logoImg && logo) {



      logoImg.src = logo;



      logoImg.classList.remove("hidden");



      if (logoFallback) logoFallback.classList.add("hidden");



    } else if (logoImg) {



      logoImg.classList.add("hidden");



      if (logoFallback) logoFallback.classList.remove("hidden");



    }







    const fav =



      theme === "dark"



        ? (tenant.favicon_dark_url || tenant.favicon_light_url)



        : (tenant.favicon_light_url || tenant.favicon_dark_url);







    if (favicon && fav) {



      favicon.href = fav;



    }







    const apple =



      tenant.apple_touch_icon_url ||



      tenant.logo_light_url ||



      tenant.logo_dark_url ||



      tenant.favicon_light_url ||



      tenant.favicon_dark_url;







    if (appleIcon && apple) {



      appleIcon.href = apple;



    }







    if (manifest && typeof window.updateAppManifestBranding === "function") {



      window.updateAppManifestBranding(tenant);



    }



  }







  var _shopUrl = "";



  var _subdomainShopUrl = "";







  function updateShopLink(tenant) {



    const customDomain = tenant && tenant.custom_domain ? String(tenant.custom_domain).trim() : "";



    const subdomain = tenant && tenant.subdomain ? String(tenant.subdomain).trim() : "";



    const setup = tenant && tenant.domain_setup ? tenant.domain_setup : null;



    const configuredSubdomainUrl = tenant && tenant.subdomain_shop_url ? String(tenant.subdomain_shop_url).trim() : "";



    const configuredProtocol = setup && setup.subdomain_protocol ? `${String(setup.subdomain_protocol).trim().replace(/:$/, "")}:` : "";



    const configuredBaseHost = setup && setup.subdomain_base_host ? String(setup.subdomain_base_host).trim() : "";



    const fallbackHostname = String(window.location.hostname || "");



    const fallbackIsLocal = fallbackHostname.endsWith("localhost");



    const fallbackPort = fallbackIsLocal && window.location.port ? `:${window.location.port}` : "";



    const fallbackProtocol = window.location.protocol || "http:";



    const fallbackBaseHost = configuredBaseHost || `${fallbackHostname}${fallbackPort}`;



    const subdomainProtocol = configuredProtocol || fallbackProtocol;



    _subdomainShopUrl = configuredSubdomainUrl || (subdomain ? `${subdomainProtocol}//${subdomain}.${fallbackBaseHost}` : "");



    if (customDomain) {



      _shopUrl = `${window.location.protocol || "https:"}//${customDomain}`;



      return;



    }



    _shopUrl = _subdomainShopUrl;



  }







  function renderSubdomainLinkParts() {



    var suffix = document.getElementById("subdomainSuffix");



    var prefix = document.getElementById("subdomainPrefix");



    var input = document.getElementById("subdomainInput");



    var wrap = input ? input.closest(".control-subdomain-wrap") : null;



    var setup = domainSetup || {};



    var hostname = String(setup.subdomain_base_host || window.location.hostname || "localhost").trim();



    var protocol = String(setup.subdomain_protocol || "").trim().replace(/:$/, "");



    var fallbackProtocol = String(window.location.protocol || "http:").replace(/:$/, "");



    var isLocal = hostname.endsWith("localhost") && !hostname.includes(":");



    var port = !setup.subdomain_base_host && isLocal && window.location.port ? ":" + window.location.port : "";



    if (prefix) prefix.textContent = (protocol || fallbackProtocol) + "://";



    if (suffix) suffix.textContent = "." + hostname + port;



    if (wrap && input && !wrap.dataset.subdomainClickBound) {



      wrap.dataset.subdomainClickBound = "1";



      wrap.addEventListener("click", function () { input.focus(); });



    }



  }







  function normalizeDomainList(value) {



    if (Array.isArray(value)) {



      return value.map((item) => String(item || "").trim()).filter(Boolean);



    }



    if (typeof value === "string") {



      return value



        .split(",")



        .map((item) => String(item || "").trim())



        .filter(Boolean);



    }



    return [];



  }







  function applyDomainSetupLegacy(tenant) {



    domainSetup = tenant && tenant.domain_setup ? tenant.domain_setup : null;



    const aRecords = normalizeDomainList(domainSetup && domainSetup.a_records);



    const primaryARecord = aRecords[0] || "141.8.198.215";



    const aRootEl = document.getElementById("domainARecordRoot");



    const aWwwEl = document.getElementById("domainARecordWww");



    const connectBtn = document.getElementById("domainConnectBtn");



    const connectHint = document.getElementById("domainConnectHint");



    const autoConnectEnabled = !!(domainSetup && domainSetup.auto_connect_enabled);







    if (aRootEl) aRootEl.textContent = primaryARecord;



    if (aWwwEl) aWwwEl.textContent = primaryARecord;



    if (connectBtn) connectBtn.disabled = !domainManageMode || !autoConnectEnabled || !domainOriginalValue;



    if (connectHint) {



      if (!autoConnectEnabled) {



        connectHint.textContent = "Автоподключение домена временно недоступно.";



      } else if (domainOriginalValue) {



        connectHint.textContent = "Сначала нажмите «Проверить домен», затем «Подключить автоматически».";



      } else {



        connectHint.textContent = "Сначала сохраните домен и пропишите две A-записи.";



      }



    }



  }







  function normalizeTenantDomains(value) {



    if (!Array.isArray(value)) return [];



    return value.map((item) => {



      if (!item || typeof item !== "object") return null;



      const id = Number(item.id || 0) || 0;



      const domain = String(item.domain || "").trim();



      const domainAscii = String(item.domain_ascii || "").trim().toLowerCase();



      if (!id || !domainAscii) return null;



      return {



        id,



        domain,



        domain_ascii: domainAscii,



        is_enabled: Number(item.is_enabled) !== 0 && item.is_enabled !== false



      };



    }).filter(Boolean).sort((a, b) => {



      if (a.is_enabled && !b.is_enabled) return -1;



      if (!a.is_enabled && b.is_enabled) return 1;



      return a.id - b.id;



    });



  }







  function normalizeTenantPwaInstallTargets(value) {

    if (!Array.isArray(value)) return [];

    return value.map((item) => {

      if (!item || typeof item !== "object") return null;

      const id = String(item.id || "").trim();
      const url = String(item.url || "").trim();
      const host = String(item.host || "").trim().toLowerCase();
      const label = String(item.label || item.host || "").trim();
      const kind = String(item.kind || "").trim().toLowerCase() || "domain";
      const domainId = Number(item.domain_id || 0) || null;

      if (!id || !url || !host || !label) return null;

      return {
        id,
        url,
        host,
        label,
        kind,
        domain_id: domainId
      };

    }).filter(Boolean);

  }

  function getFirstEnabledTenantDomain() {



    const primary = tenantDomains.find((item) => item.is_enabled) || tenantDomains[0] || null;



    if (primary) return primary;



    const fallbackDomain = String(domainOriginalValue || "").trim();



    const fallbackDomainAscii = String(domainAsciiValue || "").trim();



    if (!fallbackDomain && !fallbackDomainAscii) return null;



    return {



      id: "primary-domain",



      domain: fallbackDomain,



      domain_ascii: fallbackDomainAscii,



      is_enabled: true,



      is_primary_fallback: true



    };



  }







  function getSelectedTenantDomain() {



    if (selectedTenantDomainId) {



      const selected = tenantDomains.find((item) => item.id === selectedTenantDomainId);



      if (selected) return selected;



    }



    return getFirstEnabledTenantDomain();



  }







  function getDefaultTenantPwaInstallTarget() {

    const selectedDomain = getSelectedTenantDomain();
    const selectedDomainId = Number(selectedDomain && selectedDomain.id || 0) || 0;

    if (selectedDomainId > 0) {
      const preferred = tenantPwaInstallTargets.find((item) => item.id === `domain:${selectedDomainId}`);
      if (preferred) return preferred;
    }

    return tenantPwaInstallTargets[0] || null;

  }

  function getSelectedTenantPwaInstallTarget() {

    if (selectedTenantPwaTargetId) {
      const selected = tenantPwaInstallTargets.find((item) => item.id === selectedTenantPwaTargetId);
      if (selected) return selected;
    }

    return getDefaultTenantPwaInstallTarget();

  }

  function getDefaultTenantPwaDevInstallTarget() {

    const tunnelTarget = tenantPwaInstallDevTargets.find((item) => item && item.kind === "dev-tunnel");
    if (tunnelTarget) return tunnelTarget;

    return tenantPwaInstallDevTargets[0] || null;

  }

  function getSelectedTenantPwaDevInstallTarget() {

    if (selectedTenantPwaDevTargetId) {
      const selected = tenantPwaInstallDevTargets.find((item) => item.id === selectedTenantPwaDevTargetId);
      if (selected) return selected;
    }

    return getDefaultTenantPwaDevInstallTarget();

  }

  function syncSelectedTenantPwaInstallTarget() {

    const selected = getSelectedTenantPwaInstallTarget();
    selectedTenantPwaTargetId = selected ? selected.id : null;
    return selected;

  }

  function syncSelectedTenantPwaDevInstallTarget() {

    const selected = getSelectedTenantPwaDevInstallTarget();
    selectedTenantPwaDevTargetId = selected ? selected.id : null;
    return selected;

  }

  function syncTenantPwaTargetFromSelectedDomain() {

    const selectedDomain = getSelectedTenantDomain();
    const selectedDomainId = Number(selectedDomain && selectedDomain.id || 0) || 0;

    if (selectedDomainId > 0) {
      const matched = tenantPwaInstallTargets.find((item) => item.id === `domain:${selectedDomainId}`);
      if (matched) {
        selectedTenantPwaTargetId = matched.id;
        return matched;
      }
    }

    return syncSelectedTenantPwaInstallTarget();

  }

  const TENANT_PWA_QR_CARD_RATIOS = [
    { id: "1:1", label: "1:1", widthUnits: 1, heightUnits: 1, exportWidth: 1080, exportHeight: 1080 },
    { id: "1:2", label: "1:2", widthUnits: 1, heightUnits: 2, exportWidth: 1080, exportHeight: 2160 },
    { id: "2:1", label: "2:1", widthUnits: 2, heightUnits: 1, exportWidth: 2160, exportHeight: 1080 },
    { id: "3:4", label: "3:4", widthUnits: 3, heightUnits: 4, exportWidth: 1200, exportHeight: 1600 },
    { id: "4:3", label: "4:3", widthUnits: 4, heightUnits: 3, exportWidth: 1600, exportHeight: 1200 },
    { id: "9:16", label: "9:16", widthUnits: 9, heightUnits: 16, exportWidth: 1080, exportHeight: 1920 },
    { id: "16:9", label: "16:9", widthUnits: 16, heightUnits: 9, exportWidth: 1600, exportHeight: 900 }
  ];

  const TENANT_PWA_QR_BG_PRESETS = [
    { id: "warm-sun", label: "Теплый", swatch: "linear-gradient(135deg,#fff7ed 0%,#fdba74 100%)", fill: "linear-gradient(135deg,#fff7ed 0%,#fdba74 100%)", text: "#7c2d12", muted: "rgba(124,45,18,.72)", chipBg: "rgba(255,255,255,.62)", chipText: "#b45309" },
    { id: "midnight", label: "Ночь", swatch: "linear-gradient(135deg,#0f172a 0%,#334155 100%)", fill: "linear-gradient(135deg,#0f172a 0%,#334155 100%)", text: "#f8fafc", muted: "rgba(248,250,252,.78)", chipBg: "rgba(255,255,255,.14)", chipText: "#e2e8f0" },
    { id: "mint", label: "Mint", swatch: "linear-gradient(135deg,#ecfdf5 0%,#86efac 100%)", fill: "linear-gradient(135deg,#ecfdf5 0%,#86efac 100%)", text: "#14532d", muted: "rgba(20,83,45,.72)", chipBg: "rgba(255,255,255,.62)", chipText: "#15803d" },
    { id: "berry", label: "Berry", swatch: "linear-gradient(135deg,#7f1d1d 0%,#fda4af 100%)", fill: "linear-gradient(135deg,#7f1d1d 0%,#fda4af 100%)", text: "#fff1f2", muted: "rgba(255,241,242,.82)", chipBg: "rgba(255,255,255,.14)", chipText: "#ffe4e6" },
    { id: "sky", label: "Sky", swatch: "linear-gradient(135deg,#eff6ff 0%,#60a5fa 100%)", fill: "linear-gradient(135deg,#eff6ff 0%,#60a5fa 100%)", text: "#172554", muted: "rgba(23,37,84,.72)", chipBg: "rgba(255,255,255,.7)", chipText: "#1d4ed8" },
    { id: "graphite", label: "Graphite", swatch: "linear-gradient(135deg,#111827 0%,#f97316 100%)", fill: "linear-gradient(135deg,#111827 0%,#f97316 100%)", text: "#fff7ed", muted: "rgba(255,247,237,.84)", chipBg: "rgba(255,255,255,.16)", chipText: "#fed7aa" }
  ];

  const TENANT_PWA_QR_COLOR_PRESETS = [
    { id: "ink", label: "Ink", value: "#111827" },
    { id: "orange", label: "Orange", value: "#ea580c" },
    { id: "blue", label: "Blue", value: "#1d4ed8" },
    { id: "green", label: "Green", value: "#15803d" },
    { id: "rose", label: "Rose", value: "#be123c" },
    { id: "violet", label: "Violet", value: "#6d28d9" }
  ];

  function findTenantPwaDesignerRatioConfig(id) {
    return TENANT_PWA_QR_CARD_RATIOS.find((item) => item.id === id) || TENANT_PWA_QR_CARD_RATIOS[0];
  }

  function findTenantPwaDesignerBackgroundPreset(id) {
    return TENANT_PWA_QR_BG_PRESETS.find((item) => item.id === id) || TENANT_PWA_QR_BG_PRESETS[0];
  }

  function ensureTenantPwaDesignerSourceMode() {
    tenantPwaDesignerSourceMode = "dev";
  }

  function isTenantPwaInstallTargetHttps(item) {
    const rawUrl = String(item && item.url || "").trim();
    if (!rawUrl) return false;
    try {
      return new URL(rawUrl, window.location.origin).protocol === "https:";
    } catch (_) {
      return /^https:\/\//i.test(rawUrl);
    }
  }

  function getTenantPwaDesignerTargets() {
    const sourceTargets = tenantPwaDesignerSourceMode === "dev" ? tenantPwaInstallDevTargets : tenantPwaInstallTargets;
    return sourceTargets.filter(isTenantPwaInstallTargetHttps);
  }

  function getSelectedTenantPwaDesignerTarget() {
    const targets = getTenantPwaDesignerTargets();
    if (!targets.length) return null;
    if (tenantPwaDesignerSourceMode === "dev") {
      const selected = selectedTenantPwaDevTargetId
        ? targets.find((item) => item.id === selectedTenantPwaDevTargetId)
        : null;
      if (selected) {
        selectedTenantPwaDevTargetId = selected.id;
        return selected;
      }
      const preferredTarget = targets.find((item) => item && item.kind === "dev-tunnel") || targets[0];
      selectedTenantPwaDevTargetId = preferredTarget ? preferredTarget.id : null;
      return preferredTarget || null;
    }
    const selected = selectedTenantPwaTargetId
      ? targets.find((item) => item.id === selectedTenantPwaTargetId)
      : null;
    if (selected) {
      selectedTenantPwaTargetId = selected.id;
      return selected;
    }
    const fallbackTarget = targets[0] || null;
    selectedTenantPwaTargetId = fallbackTarget ? fallbackTarget.id : null;
    return fallbackTarget;
  }

  function getTenantPwaDesignerLogoUrl() {
    const tenantInfo = getTenantPwaDesignerTenantInfo();
    return tenantPwaDesignerUseSiteLogo
      ? String(tenantInfo.logoUrl || "").trim()
      : "";
  }

  function isTenantPwaDesignerPanelVisible() {
    const panelEl = document.getElementById("settingsPwaQrPanel");
    return !!(panelEl && !panelEl.classList.contains("hidden"));
  }

  function setTenantPwaDesignerQrLoading(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    containerEl.classList.remove("is-empty");
    containerEl.classList.add("is-loading");
  }

  function setTenantPwaDesignerQrEmpty(containerEl) {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    containerEl.classList.remove("is-loading");
    containerEl.classList.add("is-empty");
  }

  function isTenantPwaDesignerDesktopExpandedMode() {
    return !window
      || !window.matchMedia
      || window.matchMedia("(min-width: 769px)").matches;
  }

  function getTenantPwaDesignerExpandedViewportBounds() {
    if (!window || !document) return null;
    if (!isTenantPwaDesignerDesktopExpandedMode()) {
      const headerHeight = Math.max(
        0,
        parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 0
      );
      const top = Math.round(Math.max(0, headerHeight));
      return {
        overlay: {
          left: 0,
          top,
          width: Math.max(320, window.innerWidth),
          height: Math.max(320, window.innerHeight - top)
        },
        focus: {
          left: 0,
          top,
          width: Math.max(320, window.innerWidth),
          height: Math.max(320, window.innerHeight - top)
        }
      };
    }
    const sidebarEl = document.querySelector(".app-sidebar");
    const leftColEl = document.querySelector(".page-col-left");
    const centerColEl = document.querySelector(".page-col-center");
    if (!leftColEl || !centerColEl) return null;
    const sidebarRect = sidebarEl && typeof sidebarEl.getBoundingClientRect === "function"
      ? sidebarEl.getBoundingClientRect()
      : null;
    const leftRect = leftColEl.getBoundingClientRect();
    const centerRect = centerColEl.getBoundingClientRect();
    const inset = 10;
    const overlayLeft = Math.round(Math.max(12, ((sidebarRect && sidebarRect.left) || leftRect.left) + inset));
    const overlayTop = Math.round(
      Math.max(12, Math.min((sidebarRect && sidebarRect.top) || leftRect.top, leftRect.top, centerRect.top) + inset)
    );
    const overlayRight = Math.round(Math.min(window.innerWidth - 12, centerRect.right - inset));
    const overlayBottom = Math.round(
      Math.min(
        window.innerHeight - 12,
        Math.max((sidebarRect && sidebarRect.bottom) || leftRect.bottom, leftRect.bottom, centerRect.bottom) - inset
      )
    );
    const focusLeft = Math.round(Math.max(12, leftRect.left + inset));
    const focusTop = Math.round(Math.max(12, Math.min(leftRect.top, centerRect.top) + inset));
    const focusRight = Math.round(Math.min(window.innerWidth - 12, centerRect.right - inset));
    const focusBottom = Math.round(Math.min(window.innerHeight - 12, Math.max(leftRect.bottom, centerRect.bottom) - inset));
    return {
      overlay: {
        left: overlayLeft,
        top: overlayTop,
        width: Math.max(320, overlayRight - overlayLeft),
        height: Math.max(320, overlayBottom - overlayTop)
      },
      focus: {
        left: focusLeft,
        top: focusTop,
        width: Math.max(320, focusRight - focusLeft),
        height: Math.max(320, focusBottom - focusTop)
      }
    };
  }

  function setTenantPwaDesignerExpandedLayerVisibility(visible) {
    const layerEl = ensureTenantPwaDesignerExpandedLayerMounted();
    const triggerEl = document.getElementById("tenantQrDesignerStage");
    if (!layerEl) return;
    layerEl.classList.toggle("hidden", !visible);
    layerEl.setAttribute("aria-hidden", visible ? "false" : "true");
    if (triggerEl) {
      triggerEl.setAttribute("aria-expanded", visible ? "true" : "false");
      triggerEl.setAttribute("aria-label", visible ? "Закрыть увеличенное превью QR" : "Открыть увеличенное превью QR");
      triggerEl.setAttribute("title", visible ? "Свернуть превью" : "Увеличить превью");
    }
  }

  function ensureTenantPwaDesignerExpandedLayerMounted() {
    const layerEl = document.getElementById("tenantQrDesignerExpandedLayer");
    if (!layerEl || !document || !document.body) return layerEl;
    if (layerEl.parentElement !== document.body) {
      document.body.appendChild(layerEl);
    }
    return layerEl;
  }

  function clearTenantPwaDesignerExpandedMirror() {
    const shellEl = document.getElementById("tenantQrDesignerExpandedShell");
    if (!shellEl) return;
    shellEl.querySelectorAll('.tenant-qr-card-stage.is-expanded').forEach((node) => node.remove());
  }

  function cloneTenantPwaDesignerCanvasNode(sourceCanvas) {
    if (!sourceCanvas || typeof document === "undefined") return null;
    const clonedCanvas = document.createElement("canvas");
    clonedCanvas.className = sourceCanvas.className;
    clonedCanvas.style.cssText = sourceCanvas.style.cssText;
    clonedCanvas.width = Number(sourceCanvas.width) || 0;
    clonedCanvas.height = Number(sourceCanvas.height) || 0;
    Object.keys(sourceCanvas.dataset || {}).forEach((key) => {
      clonedCanvas.dataset[key] = sourceCanvas.dataset[key];
    });
    const context = typeof clonedCanvas.getContext === "function" ? clonedCanvas.getContext("2d") : null;
    if (context) {
      try {
        context.clearRect(0, 0, clonedCanvas.width, clonedCanvas.height);
        context.drawImage(sourceCanvas, 0, 0);
      } catch (_) {}
    }
    return clonedCanvas;
  }

  function buildTenantPwaDesignerExpandedMountChildren(sourceMount) {
    if (!sourceMount || typeof document === "undefined") return null;
    const fragment = document.createDocumentFragment();
    Array.from(sourceMount.childNodes || []).forEach((childNode) => {
      if (childNode && childNode.nodeType === Node.ELEMENT_NODE && childNode.tagName === "CANVAS") {
        const clonedCanvas = cloneTenantPwaDesignerCanvasNode(childNode);
        if (clonedCanvas) fragment.appendChild(clonedCanvas);
        return;
      }
      fragment.appendChild(childNode.cloneNode(true));
    });
    return fragment;
  }

  function syncTenantPwaDesignerExpandedQrMount(sourceMount, targetMount) {
    if (!sourceMount || !targetMount) return;
    if (sourceMount.classList.contains("is-loading")) return;
    targetMount.className = sourceMount.className;
    targetMount.style.cssText = sourceMount.style.cssText;
    const fragment = buildTenantPwaDesignerExpandedMountChildren(sourceMount);
    if (!fragment) return;
    targetMount.replaceChildren(fragment);
  }

  function syncTenantPwaDesignerExpandedMirrorContent(sourceStage, targetStage) {
    if (!sourceStage || !targetStage) return targetStage;
    const preservedStageGeometry = {
      left: targetStage.style.left,
      top: targetStage.style.top,
      width: targetStage.style.width,
      height: targetStage.style.height,
      transform: targetStage.style.transform
    };
    targetStage.style.cssText = sourceStage.style.cssText;
    if (preservedStageGeometry.left) targetStage.style.left = preservedStageGeometry.left;
    if (preservedStageGeometry.top) targetStage.style.top = preservedStageGeometry.top;
    if (preservedStageGeometry.width) targetStage.style.width = preservedStageGeometry.width;
    if (preservedStageGeometry.height) targetStage.style.height = preservedStageGeometry.height;
    if (preservedStageGeometry.transform) targetStage.style.transform = preservedStageGeometry.transform;
    targetStage.className = "tenant-qr-card-stage is-expanded";

    const sourceCard = sourceStage.querySelector(".tenant-qr-card");
    const targetCard = targetStage.querySelector(".tenant-qr-card");
    if (sourceCard && targetCard) {
      targetCard.className = sourceCard.className;
      targetCard.style.cssText = sourceCard.style.cssText;
    }

    const sourceBg = sourceStage.querySelector(".tenant-qr-card__bg");
    const targetBg = targetStage.querySelector(".tenant-qr-card__bg");
    if (sourceBg && targetBg) {
      targetBg.className = sourceBg.className;
      targetBg.style.cssText = sourceBg.style.cssText;
    }

    const sourceContent = sourceStage.querySelector(".tenant-qr-card__content");
    const targetContent = targetStage.querySelector(".tenant-qr-card__content");
    if (sourceContent && targetContent) {
      targetContent.className = sourceContent.className;
      targetContent.style.cssText = sourceContent.style.cssText;
    }

    const sourceLayout = sourceStage.querySelector(".tenant-qr-card__layout");
    const targetLayout = targetStage.querySelector(".tenant-qr-card__layout");
    if (sourceLayout && targetLayout) {
      targetLayout.className = sourceLayout.className;
      targetLayout.style.cssText = sourceLayout.style.cssText;
    }

    const syncTextNode = (selector) => {
      const sourceEl = sourceStage.querySelector(selector);
      const targetEl = targetStage.querySelector(selector);
      if (!sourceEl || !targetEl) return;
      targetEl.className = sourceEl.className;
      targetEl.style.cssText = sourceEl.style.cssText;
      targetEl.textContent = sourceEl.textContent;
    };
    syncTextNode(".tenant-qr-card__eyebrow");
    syncTextNode(".tenant-qr-card__title");
    syncTextNode(".tenant-qr-card__domain");

    const sourceShell = sourceStage.querySelector(".tenant-qr-card__qr-shell");
    const targetShell = targetStage.querySelector(".tenant-qr-card__qr-shell");
    if (sourceShell && targetShell) {
      targetShell.className = sourceShell.className;
      targetShell.style.cssText = sourceShell.style.cssText;
    }

    const sourceMount = sourceStage.querySelector(".tenant-qr-card__qr");
    const targetMount = targetStage.querySelector(".tenant-qr-card__qr");
    if (sourceMount && targetMount) {
      syncTenantPwaDesignerExpandedQrMount(sourceMount, targetMount);
    }

    return targetStage;
  }

  function syncTenantPwaDesignerExpandedMirror() {
    const stageEl = document.getElementById("tenantQrDesignerStage");
    const shellEl = document.getElementById("tenantQrDesignerExpandedShell");
    if (!stageEl || !shellEl) return null;
    let cloneEl = shellEl.querySelector('.tenant-qr-card-stage.is-expanded');
    if (!cloneEl) {
      cloneEl = stageEl.cloneNode(true);
      cloneEl.removeAttribute("id");
      cloneEl.removeAttribute("role");
      cloneEl.removeAttribute("tabindex");
      cloneEl.removeAttribute("title");
      cloneEl.setAttribute("aria-hidden", "true");
      cloneEl.classList.remove("tenant-qr-card-stage--trigger");
      cloneEl.classList.add("is-expanded");
      cloneEl.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      cloneEl.querySelectorAll("[role]").forEach((node) => node.removeAttribute("role"));
      cloneEl.querySelectorAll("[tabindex]").forEach((node) => node.removeAttribute("tabindex"));
      cloneEl.querySelectorAll("[aria-label]").forEach((node) => node.removeAttribute("aria-label"));
      cloneEl.querySelectorAll("[title]").forEach((node) => node.removeAttribute("title"));
      shellEl.appendChild(cloneEl);
    }
    return syncTenantPwaDesignerExpandedMirrorContent(stageEl, cloneEl);
  }

  function closeTenantPwaDesignerExpanded() {
    tenantPwaDesignerExpanded = false;
    if (tenantPwaDesignerExpandedLayoutRafId && window && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(tenantPwaDesignerExpandedLayoutRafId);
      tenantPwaDesignerExpandedLayoutRafId = 0;
    }
    const layerEl = document.getElementById("tenantQrDesignerExpandedLayer");
    const shellEl = document.getElementById("tenantQrDesignerExpandedShell");
    if (layerEl) {
      layerEl.style.left = "";
      layerEl.style.top = "";
      layerEl.style.width = "";
      layerEl.style.height = "";
    }
    if (shellEl) {
      shellEl.style.left = "";
      shellEl.style.top = "";
      shellEl.style.width = "";
      shellEl.style.height = "";
    }
    clearTenantPwaDesignerExpandedMirror();
    setTenantPwaDesignerExpandedLayerVisibility(false);
  }

  function openTenantPwaDesignerExpanded() {
    const selectedTarget = getSelectedTenantPwaDesignerTarget();
    if (!selectedTarget || !selectedTarget.url || !isTenantPwaDesignerPanelVisible()) return;
    tenantPwaDesignerExpanded = true;
    setTenantPwaDesignerExpandedLayerVisibility(true);
    renderTenantPwaDesigner();
  }

  function syncTenantPwaDesignerExpandedLayout() {
    const layerEl = ensureTenantPwaDesignerExpandedLayerMounted();
    const viewportEl = document.getElementById("tenantQrDesignerExpandedViewport");
    const shellEl = document.getElementById("tenantQrDesignerExpandedShell");
    const stageEl = document.getElementById("tenantQrDesignerStage");
    if (!tenantPwaDesignerExpanded || !layerEl || !viewportEl || !shellEl || !stageEl) return null;
    const expandedStageEl = shellEl.querySelector('.tenant-qr-card-stage.is-expanded') || syncTenantPwaDesignerExpandedMirror();
    if (!expandedStageEl) return null;
    const bounds = getTenantPwaDesignerExpandedViewportBounds();
    if (!bounds) return null;
    const isDesktop = isTenantPwaDesignerDesktopExpandedMode();
    layerEl.classList.toggle("is-mobile", !isDesktop);
    layerEl.style.left = `${bounds.overlay.left}px`;
    layerEl.style.top = `${bounds.overlay.top}px`;
    layerEl.style.width = `${bounds.overlay.width}px`;
    layerEl.style.height = `${bounds.overlay.height}px`;
    if (shellEl) {
      shellEl.style.left = "50%";
      shellEl.style.top = "50%";
    }
    const viewportRect = viewportEl.getBoundingClientRect();
    const availableWidth = Math.max(
      260,
      (isDesktop ? bounds.focus.width : viewportRect.width) - (isDesktop ? 72 : 32)
    );
    const availableHeight = Math.max(
      260,
      (isDesktop ? bounds.focus.height : viewportRect.height) - (isDesktop ? 72 : 96)
    );
    const naturalWidth = Math.max(1, Number(stageEl.offsetWidth) || 1);
    const naturalHeight = Math.max(1, Number(stageEl.offsetHeight) || 1);
    const scale = Math.max(1, Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight));
    shellEl.style.width = `${Math.round(naturalWidth * scale)}px`;
    shellEl.style.height = `${Math.round(naturalHeight * scale)}px`;
    expandedStageEl.style.left = "50%";
    expandedStageEl.style.top = "50%";
    expandedStageEl.style.width = `${naturalWidth}px`;
    expandedStageEl.style.height = `${naturalHeight}px`;
    expandedStageEl.style.transform = `translate(-50%, -50%) scale(${scale})`;
    return { maxWidth: availableWidth, maxHeight: availableHeight, scale };
  }

  function scheduleTenantPwaDesignerExpandedLayoutSync() {
    if (tenantPwaDesignerExpandedLayoutRafId && window && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(tenantPwaDesignerExpandedLayoutRafId);
      tenantPwaDesignerExpandedLayoutRafId = 0;
    }
    if (!tenantPwaDesignerExpanded) return;
    if (!window || typeof window.requestAnimationFrame !== "function") {
      syncTenantPwaDesignerExpandedLayout();
      return;
    }
    tenantPwaDesignerExpandedLayoutRafId = window.requestAnimationFrame(() => {
      tenantPwaDesignerExpandedLayoutRafId = 0;
      syncTenantPwaDesignerExpandedLayout();
    });
  }

  function applyTenantPwaDesignerCardState(cardEl, bgEl, titleEl, eyebrowEl, domainEl, tenantInfo, domainText, options = {}) {
    if (!cardEl || !bgEl) return;
    const safeTenantInfo = tenantInfo && typeof tenantInfo === "object" ? tenantInfo : getTenantPwaDesignerTenantInfo();
    applyTenantPwaDesignerCardRatio(cardEl, options);
    applyTenantPwaDesignerCardBackground(cardEl, bgEl);
    if (eyebrowEl) {
      const textEl = eyebrowEl.querySelector(".tenant-qr-card__eyebrow-text");
      const badgeText = getTenantPwaDesignerBadgeText();
      if (textEl) textEl.textContent = badgeText;
      else eyebrowEl.textContent = badgeText;
    }
    if (titleEl) titleEl.textContent = safeTenantInfo.title;
    if (domainEl) {
      domainEl.textContent = "";
      domainEl.hidden = true;
    }
    if (window && typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(() => {
        fitTenantPwaDesignerEyebrow(cardEl, eyebrowEl);
        fitTenantPwaDesignerTitle(cardEl, titleEl);
      });
    }
  }

  function scheduleTenantPwaDesignerPreviewRender(containerEl, url) {
    if (!containerEl) return;
    if (tenantPwaDesignerPreviewRafId && window && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(tenantPwaDesignerPreviewRafId);
      tenantPwaDesignerPreviewRafId = 0;
    }
    setTenantPwaDesignerQrLoading(containerEl);
    const runPreviewRender = () => {
      tenantPwaDesignerPreviewRafId = 0;
      if (!isTenantPwaDesignerPanelVisible()) return;
      const rendered = renderTenantPwaDesignerQrPreview(containerEl, url);
      containerEl.classList.toggle("is-loading", !rendered);
      if (tenantPwaDesignerExpanded) {
        syncTenantPwaDesignerExpandedMirror();
        scheduleTenantPwaDesignerExpandedLayoutSync();
      }
    };
    if (!window || typeof window.requestAnimationFrame !== "function") {
      window.setTimeout(runPreviewRender, 0);
      return;
    }
    tenantPwaDesignerPreviewRafId = window.requestAnimationFrame(() => {
      tenantPwaDesignerPreviewRafId = window.requestAnimationFrame(runPreviewRender);
    });
  }

  function scheduleTenantPwaDesignerRender() {
    if (tenantPwaDesignerRenderRafId && window && typeof window.cancelAnimationFrame === "function") {
      window.cancelAnimationFrame(tenantPwaDesignerRenderRafId);
      tenantPwaDesignerRenderRafId = 0;
    }
    if (!window || typeof window.requestAnimationFrame !== "function") {
      renderTenantPwaDesigner();
      return;
    }
    tenantPwaDesignerRenderRafId = window.requestAnimationFrame(() => {
      tenantPwaDesignerRenderRafId = 0;
      renderTenantPwaDesigner();
    });
  }

  function getTenantPwaDesignerTenantInfo() {
    const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;
    const siteNameInput = document.querySelector('[data-site-input="site_name"]');
    const liveSiteName = String((siteNameInput && siteNameInput.value) || "").trim();
    const readTenantAssetInputValue = (key) => {
      const input = document.querySelector(`[data-tenant-input="${key}"]`);
      return String((input && input.value) || "").trim();
    };
    const title = liveSiteName
      || String((tenant && (tenant.site_name || tenant.name)) || "").trim()
      || "Витрина";
    const logoUrl = String(
      readTenantAssetInputValue("apple_touch_icon_url")
      || readTenantAssetInputValue("logo_light_url")
      || readTenantAssetInputValue("logo_dark_url")
      || readTenantAssetInputValue("favicon_light_url")
      || readTenantAssetInputValue("favicon_dark_url")
      || (tenant && (
        tenant.apple_touch_icon_url
        || tenant.logo_light_url
        || tenant.logo_dark_url
        || tenant.favicon_light_url
        || tenant.favicon_dark_url
      )) || ""
    ).trim();
    return { title, logoUrl };
  }

  function escapeCssUrlValue(value) {
    return String(value || "").replace(/"/g, '\\"');
  }

  function sanitizeTenantPwaDesignerFileName(value) {
    const raw = String(value || "").trim().toLowerCase();
    return raw
      .replace(/[^a-zа-я0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      || "qr-card";
  }

  function readImageFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        resolve("");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("READ_FILE_FAILED"));
      reader.readAsDataURL(file);
    });
  }

  function waitForTenantPwaQrImageAssets(rootEl, timeoutMs = 1800) {
    if (!rootEl || typeof rootEl.querySelectorAll !== "function") {
      return Promise.resolve();
    }
    const pendingImages = Array.from(rootEl.querySelectorAll("img")).filter((img) => (
      img
      && !(img.complete && Number(img.naturalWidth || 0) > 0)
    ));
    if (!pendingImages.length) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      let isResolved = false;
      const finish = () => {
        if (isResolved) return;
        isResolved = true;
        resolve();
      };
      const timeoutId = window.setTimeout(finish, Math.max(200, Number(timeoutMs) || 1800));
      let remaining = pendingImages.length;
      const handleDone = () => {
        remaining -= 1;
        if (remaining <= 0) {
          window.clearTimeout(timeoutId);
          finish();
        }
      };
      pendingImages.forEach((img) => {
        img.addEventListener("load", handleDone, { once: true });
        img.addEventListener("error", handleDone, { once: true });
      });
    });
  }

  function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadDataUrl(dataUrl, fileName) {
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function pulseTenantPwaDesignerButton(btn, html) {
    if (!btn || !html) return;
    const original = btn.innerHTML;
    btn.innerHTML = html;
    setTimeout(() => {
      btn.innerHTML = original;
    }, 1400);
  }

  function getTenantPwaDesignerBackgroundBaseColor(presetId) {
    switch (String(presetId || "").trim()) {
      case "midnight":
        return "#334155";
      case "mint":
        return "#86efac";
      case "berry":
        return "#fb7185";
      case "sky":
        return "#60a5fa";
      case "graphite":
        return "#111827";
      case "warm-sun":
      default:
        return "#fdba74";
    }
  }

  function getTenantPwaDesignerActiveBackgroundColor() {
    const customColor = String(tenantPwaDesignerBackgroundCustomColor || "").trim();
    return customColor || getTenantPwaDesignerBackgroundBaseColor(tenantPwaDesignerBackgroundPresetId);
  }

  function clampTenantPwaDesignerValue(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeTenantPwaDesignerBadgeText(value, fallback = "УСТАНОВКА ПРИЛОЖЕНИЯ") {
    const normalized = String(value || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 56);
    return normalized || fallback;
  }

  function getTenantPwaDesignerBadgeText() {
    if (tenantPwaDesignerBadgeText) {
      return normalizeTenantPwaDesignerBadgeText(tenantPwaDesignerBadgeText);
    }
    const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;
    return normalizeTenantPwaDesignerBadgeText(tenant && tenant.pwa_qr_badge_text);
  }

  async function saveTenantPwaDesignerBadgeText() {
    const nextText = normalizeTenantPwaDesignerBadgeText(tenantPwaDesignerBadgeText);
    const saveSeq = ++tenantPwaDesignerBadgeSaveSeq;
    try {
      const response = await authFetch("/api/admin/tenant", {
        method: "PUT",
        body: JSON.stringify({ pwa_qr_badge_text: nextText })
      });
      const data = await response.json();
      if (!data || !data.ok || !data.tenant) return;
      if (saveSeq !== tenantPwaDesignerBadgeSaveSeq) return;
      if (typeof updateTenantCache === "function") {
        updateTenantCache(data.tenant);
      }
    } catch (_) {}
  }

  function setTenantPwaDesignerBadgeEditing(active) {
    const eyebrowEl = document.getElementById("tenantQrDesignerCardEyebrow");
    const textEl = document.getElementById("tenantQrDesignerCardEyebrowText");
    const inputEl = document.getElementById("tenantQrDesignerCardEyebrowInput");
    if (!eyebrowEl || !textEl || !inputEl) return;
    tenantPwaDesignerBadgeEditing = !!active;
    eyebrowEl.classList.toggle("is-editing", tenantPwaDesignerBadgeEditing);
    textEl.classList.toggle("hidden", tenantPwaDesignerBadgeEditing);
    inputEl.classList.toggle("hidden", !tenantPwaDesignerBadgeEditing);
    if (tenantPwaDesignerBadgeEditing) {
      inputEl.value = getTenantPwaDesignerBadgeText();
      inputEl.focus();
      inputEl.select();
      return;
    }
    textEl.textContent = getTenantPwaDesignerBadgeText();
  }

  function commitTenantPwaDesignerBadgeEdit(save = true) {
    if (!tenantPwaDesignerBadgeEditing) return;
    const inputEl = document.getElementById("tenantQrDesignerCardEyebrowInput");
    const previousText = getTenantPwaDesignerBadgeText();
    const nextText = normalizeTenantPwaDesignerBadgeText(inputEl && inputEl.value);
    tenantPwaDesignerBadgeText = nextText;
    setTenantPwaDesignerBadgeEditing(false);
    tenantPwaDesignerBadgeCommitTs = Date.now();
    renderTenantPwaDesigner();
    if (save && nextText !== previousText) {
      void saveTenantPwaDesignerBadgeText();
    }
  }

  function mixTenantPwaDesignerHexColors(primary, secondary, weight) {
    const safeWeight = clampTenantPwaDesignerValue(Number(weight) || 0, 0, 1);
    const normalize = (value) => {
      const raw = String(value || "").trim().replace(/^#/, "");
      const hex = raw.length === 3
        ? raw.split("").map((chunk) => `${chunk}${chunk}`).join("")
        : raw.padEnd(6, "0").slice(0, 6);
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16)
      };
    };
    const left = normalize(primary);
    const right = normalize(secondary);
    const toHex = (value) => Math.round(value).toString(16).padStart(2, "0");
    const r = left.r + (right.r - left.r) * safeWeight;
    const g = left.g + (right.g - left.g) * safeWeight;
    const b = left.b + (right.b - left.b) * safeWeight;
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function getTenantPwaDesignerColorLuma(hexColor) {
    const color = mixTenantPwaDesignerHexColors(hexColor, hexColor, 0);
    const raw = color.replace(/^#/, "");
    const rgb = [0, 2, 4].map((offset) => parseInt(raw.slice(offset, offset + 2), 16) / 255);
    const linear = rgb.map((channel) => (
      channel <= 0.03928
        ? channel / 12.92
        : Math.pow((channel + 0.055) / 1.055, 2.4)
    ));
    return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
  }

  function buildTenantPwaDesignerBackgroundStyle() {
    const baseColor = getTenantPwaDesignerActiveBackgroundColor();
    const isGradient = !!tenantPwaDesignerBackgroundGradientEnabled;
    const hasCustomImage = !!tenantPwaDesignerBackgroundImage;
    if (hasCustomImage) {
      return {
        fill: "linear-gradient(135deg,#111827 0%,#334155 100%)",
        text: "#ffffff",
        muted: "rgba(255,255,255,.84)",
        chipBg: "rgba(255,255,255,.16)",
        chipText: "#ffffff",
        swatch: baseColor
      };
    }
    const startColor = mixTenantPwaDesignerHexColors(baseColor, "#ffffff", 0.32);
    const endColor = mixTenantPwaDesignerHexColors(baseColor, "#0f172a", 0.18);
    const fill = isGradient
      ? `linear-gradient(135deg,${startColor} 0%,${endColor} 100%)`
      : baseColor;
    const sampleColor = isGradient
      ? mixTenantPwaDesignerHexColors(startColor, endColor, 0.5)
      : baseColor;
    const isDark = getTenantPwaDesignerColorLuma(sampleColor) < 0.42;
    return {
      fill,
      text: isDark ? "#f8fafc" : "#111827",
      muted: isDark ? "rgba(248,250,252,.82)" : "rgba(17,24,39,.68)",
      chipBg: isDark ? "rgba(255,255,255,.16)" : "rgba(255,255,255,.62)",
      chipText: isDark ? "#ffffff" : mixTenantPwaDesignerHexColors(baseColor, "#7c2d12", 0.45),
      swatch: fill
    };
  }

  function getTenantPwaDesignerBackgroundSwatch(presetId) {
    return getTenantPwaDesignerBackgroundBaseColor(presetId);
  }

  function fitTenantPwaDesignerTitle(cardEl, titleEl) {
    if (!cardEl || !titleEl) return;
    const ratio = findTenantPwaDesignerRatioConfig(tenantPwaDesignerCardRatio);
    const contentScale = Number(cardEl.style.getPropertyValue("--tenant-qr-content-scale")) || 1;
    const isHorizontal = ratio.widthUnits > ratio.heightUnits;
    const isSquare = ratio.widthUnits === ratio.heightUnits;
    const isVerticalTall = !isHorizontal && ratio.heightUnits / Math.max(ratio.widthUnits, 1) >= 1.75;
    const maxSize = Math.max(
      12,
      Math.round((isHorizontal ? 30 : isVerticalTall ? 28 : isSquare ? 30 : 36) * contentScale)
    );
    const minSize = Math.max(
      10,
      Math.round((isHorizontal ? 14 : isVerticalTall ? 16 : isSquare ? 16 : 18) * contentScale)
    );
    let nextSize = maxSize;
    titleEl.style.fontSize = `${nextSize}px`;
    while (nextSize > minSize && titleEl.scrollWidth > titleEl.clientWidth + 1) {
      nextSize -= 1;
      titleEl.style.fontSize = `${nextSize}px`;
    }
  }

  function fitTenantPwaDesignerEyebrow(cardEl, eyebrowEl) {
    if (!cardEl || !eyebrowEl) return;
    const ratio = findTenantPwaDesignerRatioConfig(tenantPwaDesignerCardRatio);
    const contentScale = Number(cardEl.style.getPropertyValue("--tenant-qr-content-scale")) || 1;
    const isHorizontal = ratio.widthUnits > ratio.heightUnits;
    const isSquare = ratio.widthUnits === ratio.heightUnits;
    const isVerticalTall = !isHorizontal && ratio.heightUnits / Math.max(ratio.widthUnits, 1) >= 1.75;
    const maxSize = Math.max(
      6,
      Math.round((isHorizontal ? 9 : isVerticalTall ? 9 : isSquare ? 10 : 11) * contentScale)
    );
    const minSize = Math.max(
      4,
      Math.round((isHorizontal ? 5 : isVerticalTall ? 6 : isSquare ? 7 : 8) * contentScale)
    );
    const baseLetterSpacing = isHorizontal ? 0.03 : isVerticalTall ? 0.03 : isSquare ? 0.05 : 0.08;
    const minLetterSpacing = isHorizontal ? 0 : 0.01;
    let nextSize = maxSize;
    let nextLetterSpacing = baseLetterSpacing;
    eyebrowEl.style.fontSize = `${nextSize}px`;
    eyebrowEl.style.letterSpacing = `${nextLetterSpacing}em`;
    while (
      eyebrowEl.scrollWidth > eyebrowEl.clientWidth + 1
      && (nextSize > minSize || nextLetterSpacing > minLetterSpacing)
    ) {
      if (nextSize > minSize) {
        nextSize -= 1;
        eyebrowEl.style.fontSize = `${nextSize}px`;
        continue;
      }
      nextLetterSpacing = Math.max(
        minLetterSpacing,
        Number((nextLetterSpacing - 0.01).toFixed(3))
      );
      eyebrowEl.style.letterSpacing = `${nextLetterSpacing}em`;
    }
  }

  function renderTenantPwaDesignerStaticControls() {
    const ratioGroupEl = document.getElementById("tenantQrDesignerRatioGroup");
    const bgPaletteEl = document.getElementById("tenantQrDesignerBgPalette");
    const bgGradientBtn = document.getElementById("tenantQrDesignerBackgroundGradientBtn");
    const backgroundColorInput = document.getElementById("tenantQrDesignerBackgroundColorInput");
    const colorPaletteEl = document.getElementById("tenantQrDesignerColorPalette");
    const styleSelect = document.getElementById("tenantQrDesignerStyleSelect");
    const colorInput = document.getElementById("tenantQrDesignerColorInput");
    const cornerRadiusInput = document.getElementById("tenantQrDesignerCornerRadiusInput");

    if (ratioGroupEl) {
      ratioGroupEl.innerHTML = TENANT_PWA_QR_CARD_RATIOS.map((item) => `
        <button
          class="tenant-qr-ratio-btn${tenantPwaDesignerCardRatio === item.id ? " is-active" : ""}"
          type="button"
          data-tenant-qr-ratio="${item.id}"
        >${item.label}</button>
      `).join("");
    }

    if (bgPaletteEl) {
      const activeBgColor = getTenantPwaDesignerActiveBackgroundColor().toLowerCase();
      bgPaletteEl.innerHTML = TENANT_PWA_QR_BG_PRESETS.map((item) => `
        <button
          class="tenant-qr-swatch tenant-qr-swatch--bg${!tenantPwaDesignerBackgroundImage && activeBgColor === getTenantPwaDesignerBackgroundBaseColor(item.id).toLowerCase() ? " is-active" : ""}"
          type="button"
          data-tenant-qr-bg="${item.id}"
          title="${item.label}"
          aria-label="${item.label}"
          style="background:${getTenantPwaDesignerBackgroundSwatch(item.id)}"
        ></button>
      `).join("");
    }

    if (bgGradientBtn) {
      bgGradientBtn.textContent = tenantPwaDesignerBackgroundGradientEnabled ? "Градиент: вкл" : "Градиент: выкл";
      bgGradientBtn.classList.toggle("is-active", tenantPwaDesignerBackgroundGradientEnabled);
    }

    if (colorPaletteEl) {
      colorPaletteEl.innerHTML = TENANT_PWA_QR_COLOR_PRESETS.map((item) => `
        <button
          class="tenant-qr-swatch${tenantPwaDesignerQrColor.toLowerCase() === item.value.toLowerCase() ? " is-active" : ""}"
          type="button"
          data-tenant-qr-color="${item.value}"
          title="${item.label}"
          aria-label="${item.label}"
          style="background:${item.value}"
        ></button>
      `).join("");
    }

    if (styleSelect) styleSelect.value = tenantPwaDesignerQrStyle;
    if (colorInput) colorInput.value = tenantPwaDesignerQrColor;
    if (backgroundColorInput) backgroundColorInput.value = getTenantPwaDesignerActiveBackgroundColor();
    if (cornerRadiusInput) {
      const maxCornerRadius = getTenantPwaDesignerCornerRadiusLimit();
      tenantPwaDesignerCornerRadius = normalizeTenantPwaDesignerCornerRadius(
        tenantPwaDesignerCornerRadius,
        tenantPwaDesignerCornerRadius,
        maxCornerRadius
      );
      cornerRadiusInput.max = String(maxCornerRadius);
      cornerRadiusInput.value = String(tenantPwaDesignerCornerRadius);
    }
  }

  function getTenantPwaDesignerCardMetrics(maxWidth = 224, maxHeight = 252) {
    const ratio = findTenantPwaDesignerRatioConfig(tenantPwaDesignerCardRatio);
    const safeMaxWidth = Math.max(120, Number(maxWidth) || 224);
    const safeMaxHeight = Math.max(120, Number(maxHeight) || 252);
    const unitScale = Math.min(safeMaxWidth / ratio.widthUnits, safeMaxHeight / ratio.heightUnits);
    const cardWidth = Math.round(ratio.widthUnits * unitScale);
    const cardHeight = Math.round(ratio.heightUnits * unitScale);
    return { ratio, cardWidth, cardHeight };
  }

  function getTenantPwaDesignerCornerRadiusLimit() {
    const metrics = getTenantPwaDesignerCardMetrics();
    return Math.max(0, Math.round(Math.min(metrics.cardWidth, metrics.cardHeight) / 2));
  }

  function normalizeTenantPwaDesignerCornerRadius(rawValue, fallback = 30, maxValue = getTenantPwaDesignerCornerRadiusLimit()) {
    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) return fallback;
    return Math.max(0, Math.min(Math.max(0, Number(maxValue) || 0), Math.round(numericValue)));
  }

  function bindTenantPwaDesignerStepper(inputEl, minusEl, plusEl, onChange) {
    if (!inputEl || inputEl.dataset.tenantQrStepperBound === "1") return;
    inputEl.dataset.tenantQrStepperBound = "1";
    const normalizeValue = (rawValue) => {
      const parsedMin = Number(inputEl.min);
      const parsedMax = Number(inputEl.max);
      const safeMin = inputEl.min !== "" && Number.isFinite(parsedMin) ? parsedMin : 0;
      const safeMax = inputEl.max !== "" && Number.isFinite(parsedMax)
        ? parsedMax
        : getTenantPwaDesignerCornerRadiusLimit();
      const safeStep = Math.max(1, Number(inputEl.step) || 1);
      const numericValue = Number(rawValue);
      const fallbackValue = normalizeTenantPwaDesignerCornerRadius(inputEl.value, tenantPwaDesignerCornerRadius, safeMax);
      if (!Number.isFinite(numericValue)) return fallbackValue;
      const steppedValue = safeMin + Math.round((numericValue - safeMin) / safeStep) * safeStep;
      return Math.max(safeMin, Math.min(safeMax, steppedValue));
    };
    const applyValue = (rawValue) => {
      const nextValue = normalizeValue(rawValue);
      inputEl.value = String(nextValue);
      if (typeof onChange === "function") onChange(nextValue);
    };
    const syncInput = () => applyValue(inputEl.value);
    inputEl.addEventListener("input", syncInput);
    inputEl.addEventListener("change", syncInput);
    const bindRepeatButton = (buttonEl, direction) => {
      if (!buttonEl) return;
      let holdTimeoutId = 0;
      let holdIntervalId = 0;
      let ignoreClickUntil = 0;
      const stopHold = () => {
        window.clearTimeout(holdTimeoutId);
        window.clearInterval(holdIntervalId);
        holdTimeoutId = 0;
        holdIntervalId = 0;
        buttonEl.classList.remove("is-pressed");
      };
      const stepOnce = () => {
        const safeStep = Math.max(1, Number(inputEl.step) || 1);
        applyValue(normalizeValue(inputEl.value) + (direction * safeStep));
      };
      buttonEl.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button !== 0) return;
        event.preventDefault();
        ignoreClickUntil = Date.now() + 600;
        buttonEl.classList.add("is-pressed");
        stepOnce();
        try {
          if (buttonEl.setPointerCapture && event.pointerId != null) {
            buttonEl.setPointerCapture(event.pointerId);
          }
        } catch (_) {}
        holdTimeoutId = window.setTimeout(() => {
          holdIntervalId = window.setInterval(stepOnce, 80);
        }, 320);
      });
      ["pointerup", "pointercancel", "lostpointercapture"].forEach((eventName) => {
        buttonEl.addEventListener(eventName, stopHold);
      });
      buttonEl.addEventListener("click", (event) => {
        if (Date.now() <= ignoreClickUntil) {
          event.preventDefault();
          return;
        }
        stepOnce();
      });
    };
    bindRepeatButton(minusEl, -1);
    bindRepeatButton(plusEl, 1);
  }

  function applyTenantPwaDesignerCardRatio(cardEl, options = {}) {
    if (!cardEl) return;
    const safeOptions = options && typeof options === "object" ? options : {};
    const baseMetrics = getTenantPwaDesignerCardMetrics();
    const metrics = getTenantPwaDesignerCardMetrics(safeOptions.maxWidth, safeOptions.maxHeight);
    const { ratio, cardWidth, cardHeight } = metrics;
    const isHorizontal = ratio.widthUnits > ratio.heightUnits;
    const isVertical = ratio.heightUnits > ratio.widthUnits;
    const isSquare = !isHorizontal && !isVertical;
    const isVerticalTall = isVertical && ratio.heightUnits / Math.max(ratio.widthUnits, 1) >= 1.75;
    const baseScale = Math.min(cardWidth / 224, cardHeight / 224);
    const contentScale = isVerticalTall
      ? Math.max(0.42, Math.min(1, baseScale * 0.82))
      : isVertical
        ? Math.max(0.48, Math.min(1, baseScale * 0.9))
        : isHorizontal
          ? Math.max(0.58, Math.min(1, baseScale * 0.94))
          : Math.max(0.54, Math.min(0.92, baseScale * 0.92));
    const qrShellSize = isVerticalTall
      ? Math.min(cardWidth * 0.56, cardHeight * 0.4, 152 * contentScale + 10)
      : isVertical
        ? Math.min(cardWidth * 0.62, cardHeight * 0.48, 184 * contentScale + 16)
        : isHorizontal
          ? Math.min(cardWidth * 0.42, cardHeight * 0.78, 206 * contentScale)
          : Math.min(cardWidth * 0.58, cardHeight * 0.58, 190 * contentScale);
    cardEl.style.width = `${cardWidth}px`;
    cardEl.style.height = `${cardHeight}px`;
    cardEl.style.setProperty("--tenant-qr-content-scale", contentScale.toFixed(3));
    cardEl.style.setProperty("--tenant-qr-shell-size", `${Math.round(qrShellSize)}px`);
    const defaultMinSide = Math.max(1, Math.min(baseMetrics.cardWidth, baseMetrics.cardHeight));
    const currentMinSide = Math.max(1, Math.min(cardWidth, cardHeight));
    const cardRadiusScale = currentMinSide / defaultMinSide;
    const cardRadius = normalizeTenantPwaDesignerCornerRadius(
      tenantPwaDesignerCornerRadius * cardRadiusScale,
      30,
      Math.round(currentMinSide / 2)
    );
    cardEl.style.setProperty("--tenant-qr-card-radius", `${cardRadius}px`);
    cardEl.style.removeProperty("--tenant-qr-shell-radius");
    cardEl.classList.toggle("is-horizontal", isHorizontal);
    cardEl.classList.toggle("is-vertical", isVertical);
    cardEl.classList.toggle("is-vertical-tall", isVerticalTall);
    cardEl.classList.toggle("is-square", isSquare);
  }

  function applyTenantPwaDesignerCardBackground(cardEl, bgEl) {
    if (!cardEl || !bgEl) return;
    const hasCustomImage = !!tenantPwaDesignerBackgroundImage;
    const backgroundStyle = buildTenantPwaDesignerBackgroundStyle();
    bgEl.style.background = backgroundStyle.fill;
    bgEl.style.backgroundImage = hasCustomImage
      ? `linear-gradient(180deg, rgba(15,23,42,.16), rgba(15,23,42,.08)), url("${escapeCssUrlValue(tenantPwaDesignerBackgroundImage)}")`
      : backgroundStyle.fill;
    bgEl.style.backgroundSize = hasCustomImage ? "cover" : "cover";
    bgEl.style.backgroundPosition = hasCustomImage ? "center" : "center";
    cardEl.style.setProperty("--tenant-qr-card-text", backgroundStyle.text);
    cardEl.style.setProperty("--tenant-qr-card-muted", backgroundStyle.muted);
    cardEl.style.setProperty("--tenant-qr-chip-bg", backgroundStyle.chipBg);
    cardEl.style.setProperty("--tenant-qr-chip-text", backgroundStyle.chipText);
  }

  function buildTenantPwaDesignerQrOptions(url, config) {
    const tenantInfo = getTenantPwaDesignerTenantInfo();
    const logoImage = tenantPwaDesignerUseSiteLogo && tenantInfo.logoUrl
      ? String(tenantInfo.logoUrl)
      : "";
    const safeConfig = config && typeof config === "object" ? config : {};
    const rawSize = Number(safeConfig.size);
    const rawMargin = Number(safeConfig.margin);
    const size = Math.max(128, Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 360);
    const margin = Math.max(0, Number.isFinite(rawMargin) ? rawMargin : 16);
    const type = String(safeConfig.type || "svg").trim() || "svg";
    const roundSize = safeConfig.roundSize !== undefined ? !!safeConfig.roundSize : true;
    const imageOptions = {
      hideBackgroundDots: true,
      imageSize: 0.28,
      margin: Math.max(4, Math.round(size * 0.018)),
      crossOrigin: logoImage ? "anonymous" : undefined
    };
    return {
      width: size,
      height: size,
      type,
      data: String(url || ""),
      margin,
      qrOptions: { errorCorrectionLevel: "H" },
      dotsOptions: {
        color: tenantPwaDesignerQrColor,
        type: tenantPwaDesignerQrStyle,
        roundSize
      },
      cornersSquareOptions: {
        color: tenantPwaDesignerQrColor,
        type: "square"
      },
      cornersDotOptions: {
        color: tenantPwaDesignerQrColor,
        type: "square"
      },
      backgroundOptions: {
        color: "#ffffff"
      },
      image: logoImage || undefined,
      imageOptions
    };
  }

  function getTenantPwaDesignerQrPreviewSize(containerEl) {
    if (!containerEl || typeof containerEl.getBoundingClientRect !== "function") {
      return 168;
    }
    const rect = containerEl.getBoundingClientRect();
    const parentRect = containerEl.parentElement && typeof containerEl.parentElement.getBoundingClientRect === "function"
      ? containerEl.parentElement.getBoundingClientRect()
      : null;
    const bounds = [
      rect.width,
      rect.height,
      parentRect ? parentRect.width : null,
      parentRect ? parentRect.height : null
    ].filter((value) => Number.isFinite(value) && value > 0);
    const baseSize = bounds.length ? Math.min(...bounds) : 168;
    const safeSize = Math.max(96, Math.floor(baseSize));
    return safeSize % 2 === 0 ? safeSize : safeSize - 1;
  }

  function renderTenantPwaDesignerQrPreview(containerEl, url) {
    if (!containerEl) return false;
    tenantPwaDesignerQrRenderMode = "basic";
    tenantPwaDesignerQrInstance = null;
    if (!url) {
      setTenantPwaDesignerQrEmpty(containerEl);
      return false;
    }
    const previewSize = getTenantPwaDesignerQrPreviewSize(containerEl);
    return renderTenantPwaQrImage(containerEl, url, {
      displaySize: previewSize,
      renderScale: 1,
      colorDark: tenantPwaDesignerQrColor,
      logoUrl: getTenantPwaDesignerLogoUrl()
    });
  }

  function renderTenantPwaDesigner() {
    const sourceSelect = document.getElementById("tenantQrDesignerSourceSelect");
    const sourceHint = document.getElementById("tenantQrDesignerSourceHint");
    const targetSelect = document.getElementById("tenantQrDesignerTargetSelect");
    const targetHint = document.getElementById("tenantQrDesignerTargetHint");
    const previewWrap = document.getElementById("tenantQrDesignerPreviewWrap");
    const emptyEl = document.getElementById("tenantQrDesignerEmpty");
    const hintEl = document.getElementById("tenantQrDesignerHint");
    const linkboxEl = document.getElementById("tenantQrDesignerLinkbox");
    const urlEl = document.getElementById("tenantQrDesignerUrl");
    const actionsEl = document.getElementById("tenantQrDesignerActions");
    const cardEl = document.getElementById("tenantQrDesignerCard");
    const bgEl = document.getElementById("tenantQrDesignerCardBg");
    const qrMount = document.getElementById("tenantQrDesignerQrMount");
    const cardTitleEl = document.getElementById("tenantQrDesignerCardTitle");
    const cardEyebrowEl = document.getElementById("tenantQrDesignerCardEyebrow");
    const cardDomainEl = document.getElementById("tenantQrDesignerCardDomain");
    const logoToggleEl = document.getElementById("tenantQrDesignerUseSiteLogoToggle");
    const expandedLayerEl = document.getElementById("tenantQrDesignerExpandedLayer");
    const isVisible = isTenantPwaDesignerPanelVisible();

    if (!targetSelect || !cardEl || !bgEl || !qrMount) return;
    if (!isVisible && tenantPwaDesignerExpanded) {
      closeTenantPwaDesignerExpanded();
    }

    ensureTenantPwaDesignerSourceMode();
    renderTenantPwaDesignerStaticControls();

    const sourceOptions = [
      { id: "prod", label: "Рабочая витрина" },
      { id: "dev", label: "DEV / локальная сборка" }
    ];
    if (sourceSelect) {
      sourceSelect.innerHTML = sourceOptions.map((item) => `
        <option value="${item.id}"${tenantPwaDesignerSourceMode === item.id ? " selected" : ""}>${item.label}</option>
      `).join("");
    }

    const targets = getTenantPwaDesignerTargets();
    const selectedTarget = getSelectedTenantPwaDesignerTarget();
    const hasTargets = !!selectedTarget;

    if (targetSelect) {
      targetSelect.innerHTML = targets.map((item) => {
        const prefix = tenantPwaDesignerSourceMode === "dev"
          ? (item.kind === "dev-tunnel" ? "[HTTPS] " : item.kind === "dev-localhost" ? "[LOCAL] " : "")
          : (item.kind === "subdomain" ? "Субдомен: " : "Домен: ");
        const selectedAttr = selectedTarget && selectedTarget.id === item.id ? " selected" : "";
        return `<option value="${item.id}"${selectedAttr}>${prefix}${item.label}</option>`;
      }).join("");
      targetSelect.disabled = !hasTargets;
      if (selectedTarget) targetSelect.value = selectedTarget.id;
    }

    if (sourceHint) {
      sourceHint.textContent = tenantPwaDesignerSourceMode === "dev"
        ? "DEV QR подходит для LAN-проверки или HTTPS tunnel, если нужно тестировать установку локальной сборки."
        : "Рабочий QR ведет на подключенный домен витрины и подходит для реальной публикации.";
    }

    if (emptyEl) emptyEl.classList.toggle("hidden", hasTargets);
    if (previewWrap) previewWrap.classList.remove("hidden");
    if (actionsEl) actionsEl.classList.toggle("hidden", !hasTargets);
    if (linkboxEl) linkboxEl.classList.toggle("hidden", !hasTargets);

    const tenantInfo = getTenantPwaDesignerTenantInfo();
    if (logoToggleEl) {
      const hasSiteLogo = !!tenantInfo.logoUrl;
      if (!hasSiteLogo) tenantPwaDesignerUseSiteLogo = false;
      logoToggleEl.checked = hasSiteLogo && tenantPwaDesignerUseSiteLogo;
      logoToggleEl.disabled = !hasSiteLogo;
      logoToggleEl.title = hasSiteLogo ? "" : "Сначала загрузите логотип сайта";
    }

    if (!hasTargets) {
      if (urlEl) {
        urlEl.textContent = "";
        urlEl.removeAttribute("href");
      }
      if (targetHint) {
        targetHint.textContent = tenantPwaDesignerSourceMode === "dev"
          ? "Откройте tenant UI на localhost или LAN-адресе, чтобы появились DEV-цели."
          : "Подключите рабочий домен или используйте субдомен tenant-а.";
      }
      if (hintEl) {
        hintEl.textContent = "Пока нет доступной ссылки для генерации QR-карточки.";
      }
      if (targetHint) {
        targetHint.textContent = "";
      }
      if (tenantPwaDesignerPreviewRafId && window && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(tenantPwaDesignerPreviewRafId);
        tenantPwaDesignerPreviewRafId = 0;
      }
      applyTenantPwaDesignerCardState(
        cardEl,
        bgEl,
        cardTitleEl,
        cardEyebrowEl,
        cardDomainEl,
        tenantInfo,
        "HTTPS недоступен"
      );
      setTenantPwaDesignerQrEmpty(qrMount);
      if (tenantPwaDesignerExpanded && expandedLayerEl) {
        setTenantPwaDesignerExpandedLayerVisibility(true);
        syncTenantPwaDesignerExpandedMirror();
        scheduleTenantPwaDesignerExpandedLayoutSync();
      }
      tenantPwaDesignerQrInstance = null;
      return;
    }

    const selectedUrl = String(selectedTarget.url || "");
    let selectedHost = selectedTarget.label || selectedUrl;
    try {
      const parsed = new URL(selectedUrl, window.location.origin);
      selectedHost = parsed.host || selectedHost;
    } catch (_) {}

    applyTenantPwaDesignerCardState(
      cardEl,
      bgEl,
      cardTitleEl,
      cardEyebrowEl,
      cardDomainEl,
      tenantInfo,
      selectedHost
    );
    if (urlEl) {
      urlEl.textContent = selectedUrl;
      urlEl.href = selectedUrl;
    }

    if (targetHint) {
      targetHint.textContent = tenantPwaDesignerSourceMode === "dev"
        ? ""
        : selectedTarget.kind === "subdomain"
          ? "Ссылка ведет на subdomain tenant-а."
          : "Ссылка ведет на подключенный рабочий домен.";
    }

    if (!isVisible) {
      if (tenantPwaDesignerPreviewRafId && window && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(tenantPwaDesignerPreviewRafId);
        tenantPwaDesignerPreviewRafId = 0;
      }
      setTenantPwaDesignerQrEmpty(qrMount);
      tenantPwaDesignerQrInstance = null;
      return;
    }

    scheduleTenantPwaDesignerPreviewRender(qrMount, selectedUrl);
    if (tenantPwaDesignerExpanded && expandedLayerEl) {
      setTenantPwaDesignerExpandedLayerVisibility(true);
      syncTenantPwaDesignerExpandedMirror();
      scheduleTenantPwaDesignerExpandedLayoutSync();
    } else if (expandedLayerEl) {
      setTenantPwaDesignerExpandedLayerVisibility(false);
    }
  }

  async function downloadTenantPwaDesignerCard() {
    const cardEl = document.getElementById("tenantQrDesignerCard");
    const selectedTarget = getSelectedTenantPwaDesignerTarget();
    const htmlToImage = window.htmlToImage;
    if (!cardEl || !selectedTarget || !selectedTarget.url || !htmlToImage || typeof htmlToImage.toPng !== "function") {
      alert("Не удалось сохранить карточку.");
      return;
    }
    const tenantInfo = getTenantPwaDesignerTenantInfo();
    const ratio = findTenantPwaDesignerRatioConfig(tenantPwaDesignerCardRatio);
    try {
      const dataUrl = await htmlToImage.toPng(cardEl, {
        cacheBust: true,
        pixelRatio: 1,
        canvasWidth: ratio.exportWidth,
        canvasHeight: ratio.exportHeight
      });
      downloadDataUrl(
        dataUrl,
        `${sanitizeTenantPwaDesignerFileName(tenantInfo.title)}-${tenantPwaDesignerCardRatio.replace(":", "x")}-card.png`
      );
    } catch (err) {
      console.error("tenant qr designer save card error:", err);
      alert("Не удалось сохранить карточку.");
    }
  }

  function downloadTenantPwaDesignerQr() {
    downloadTenantPwaDesignerQrSafe();
  }

  async function downloadTenantPwaDesignerQrSafe() {
    const selectedTarget = getSelectedTenantPwaDesignerTarget();
    const tenantInfo = getTenantPwaDesignerTenantInfo();
    if (!selectedTarget || !selectedTarget.url) {
      alert("Не удалось сохранить QR.");
      return;
    }
    const fileName = `${sanitizeTenantPwaDesignerFileName(tenantInfo.title)}-qr.png`;
    const logoUrl = getTenantPwaDesignerLogoUrl();
    const qrSize = 1400;
    const htmlToImage = window.htmlToImage;
    if (!document.body) {
      alert("Не удалось сохранить QR.");
      return;
    }
    const mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "-10000px";
    mount.style.top = "0";
    mount.style.width = `${qrSize}px`;
    mount.style.height = `${qrSize}px`;
    mount.style.padding = "0";
    mount.style.margin = "0";
    mount.style.background = "#ffffff";
    mount.style.pointerEvents = "none";
    mount.style.opacity = "1";
    document.body.appendChild(mount);
    try {
      const rendered = renderTenantPwaQrImage(mount, selectedTarget.url, {
        displaySize: qrSize,
        renderSize: qrSize,
        colorDark: tenantPwaDesignerQrColor,
        logoUrl
      });
      if (!rendered) throw new Error("QR_RENDER_FAILED");
      if (logoUrl && htmlToImage && typeof htmlToImage.toPng === "function") {
        await waitForTenantPwaQrImageAssets(mount);
        const dataUrl = await htmlToImage.toPng(mount, {
          cacheBust: true,
          pixelRatio: 1,
          canvasWidth: qrSize,
          canvasHeight: qrSize,
          backgroundColor: "#ffffff"
        });
        downloadDataUrl(dataUrl, fileName);
        return;
      }
      const renderEl = mount.querySelector('[data-tenant-qr-render="1"]');
      const canvasEl = renderEl && renderEl.tagName === "CANVAS"
        ? renderEl
        : mount.querySelector("canvas");
      const imageEl = renderEl && renderEl.tagName === "IMG"
        ? renderEl
        : mount.querySelector('img[data-tenant-qr-render="1"]');
      if (canvasEl && typeof canvasEl.toDataURL === "function") {
        downloadDataUrl(canvasEl.toDataURL("image/png"), fileName);
        return;
      }
      if (imageEl && imageEl.src) {
        downloadDataUrl(imageEl.src, fileName);
        return;
      }
      throw new Error("QR_EXPORT_FAILED");
    } catch (err) {
      console.error("tenant qr designer save qr error:", err);
      alert("Не удалось сохранить QR.");
    } finally {
      mount.remove();
    }
  }

  function downloadTenantPwaQrPng(url, fileName, size = 1400) {
    if (!document.body) return false;
    const mount = document.createElement("div");
    mount.style.position = "fixed";
    mount.style.left = "-10000px";
    mount.style.top = "0";
    mount.style.width = `${Math.max(128, Number(size) || 1400)}px`;
    mount.style.height = `${Math.max(128, Number(size) || 1400)}px`;
    mount.style.pointerEvents = "none";
    mount.style.opacity = "0";
    document.body.appendChild(mount);
    try {
      const rendered = renderTenantPwaQrImage(mount, url, {
        displaySize: Math.max(128, Number(size) || 1400),
        renderSize: Math.max(128, Number(size) || 1400)
      });
      if (!rendered) return false;
      const renderEl = mount.querySelector('[data-tenant-qr-render="1"]');
      const canvasEl = renderEl && renderEl.tagName === "CANVAS"
        ? renderEl
        : mount.querySelector("canvas");
      const imageEl = renderEl && renderEl.tagName === "IMG"
        ? renderEl
        : mount.querySelector('img[data-tenant-qr-render="1"], img');
      if (canvasEl && typeof canvasEl.toDataURL === "function") {
        downloadDataUrl(canvasEl.toDataURL("image/png"), fileName);
        return true;
      }
      if (imageEl && imageEl.src) {
        downloadDataUrl(imageEl.src, fileName);
        return true;
      }
      return false;
    } catch (err) {
      console.error("tenant qr safe export error:", err);
      return false;
    } finally {
      mount.remove();
    }
  }

  function renderTenantPwaQrImage(containerEl, url, options = {}) {

    if (!containerEl) return false;

    containerEl.innerHTML = "";

    const QrCodeCtor = window.QRCode;
    const safeUrl = String(url || "").trim();
    if (typeof QrCodeCtor !== "function" || !safeUrl) return false;
    const displaySize = Math.max(96, Math.round(Number(options.displaySize || options.size) || 136));
    const renderScale = Math.max(1, Number(options.renderScale) || 1);
    const renderSize = Math.max(
      displaySize,
      Math.round(Number(options.renderSize) || (displaySize * renderScale))
    );
    const colorDark = String(options.colorDark || "#111827").trim() || "#111827";
    const colorLight = String(options.colorLight || "#ffffff").trim() || "#ffffff";
    const logoUrl = String(options.logoUrl || "").trim();
    const logoBadgeSize = logoUrl
      ? Math.max(22, Math.round(displaySize * 0.18))
      : 0;
    const logoBadgeBorderSize = Math.max(2, Math.round(logoBadgeSize * 0.08));
    const logoBadgeInnerPadding = Math.max(3, Math.round(logoBadgeSize * 0.12));

    containerEl.style.position = "relative";
    containerEl.style.isolation = "isolate";

    try {
      const correctLevel = QrCodeCtor.CorrectLevel
        ? (logoUrl && QrCodeCtor.CorrectLevel.H !== undefined
          ? QrCodeCtor.CorrectLevel.H
          : QrCodeCtor.CorrectLevel.M)
        : undefined;
      new QrCodeCtor(containerEl, {
        text: safeUrl,
        width: renderSize,
        height: renderSize,
        colorDark,
        colorLight,
        correctLevel
      });
      const syncRenderedNodes = () => {
        const childNodes = Array.from(containerEl.children || []);
        const canvasEl = childNodes.find((node) => node && node.tagName === "CANVAS");
        const imageEl = childNodes.find((node) => (
          node
          && node.tagName === "IMG"
          && node.getAttribute("data-tenant-qr-logo-img") !== "1"
        ));
        if (canvasEl && canvasEl.style) {
          canvasEl.setAttribute("data-tenant-qr-render", "1");
          canvasEl.style.display = "block";
          canvasEl.style.width = "100%";
          canvasEl.style.height = "100%";
          canvasEl.style.maxWidth = `${displaySize}px`;
          canvasEl.style.maxHeight = `${displaySize}px`;
        }
        if (imageEl) {
          if (canvasEl) {
            imageEl.setAttribute("aria-hidden", "true");
            imageEl.remove();
          } else if (imageEl.style) {
            imageEl.setAttribute("data-tenant-qr-render", "1");
            imageEl.style.display = "block";
            imageEl.style.width = "100%";
            imageEl.style.height = "100%";
            imageEl.style.maxWidth = `${displaySize}px`;
            imageEl.style.maxHeight = `${displaySize}px`;
          }
        }
        const existingLogoBadge = containerEl.querySelector('[data-tenant-qr-logo="1"]');
        if (existingLogoBadge) existingLogoBadge.remove();
        if (!logoUrl) return;
        const logoBadgeEl = document.createElement("div");
        logoBadgeEl.setAttribute("data-tenant-qr-logo", "1");
        logoBadgeEl.style.position = "absolute";
        logoBadgeEl.style.left = "50%";
        logoBadgeEl.style.top = "50%";
        logoBadgeEl.style.width = `${logoBadgeSize}px`;
        logoBadgeEl.style.height = `${logoBadgeSize}px`;
        logoBadgeEl.style.transform = "translate(-50%, -50%)";
        logoBadgeEl.style.display = "flex";
        logoBadgeEl.style.alignItems = "center";
        logoBadgeEl.style.justifyContent = "center";
        logoBadgeEl.style.borderRadius = "999px";
        logoBadgeEl.style.background = "#ffffff";
        logoBadgeEl.style.boxSizing = "border-box";
        logoBadgeEl.style.border = `${logoBadgeBorderSize}px solid #ffffff`;
        logoBadgeEl.style.padding = `${logoBadgeInnerPadding}px`;
        logoBadgeEl.style.overflow = "hidden";
        logoBadgeEl.style.pointerEvents = "none";
        logoBadgeEl.style.zIndex = "2";
        const logoImgEl = document.createElement("img");
        logoImgEl.setAttribute("data-tenant-qr-logo-img", "1");
        logoImgEl.alt = "";
        logoImgEl.decoding = "async";
        logoImgEl.referrerPolicy = "no-referrer";
        if (/^https?:\/\//i.test(logoUrl)) {
          logoImgEl.crossOrigin = "anonymous";
        }
        logoImgEl.src = logoUrl;
        logoImgEl.style.display = "block";
        logoImgEl.style.width = "100%";
        logoImgEl.style.height = "100%";
        logoImgEl.style.objectFit = "contain";
        logoBadgeEl.appendChild(logoImgEl);
        containerEl.appendChild(logoBadgeEl);
      };
      syncRenderedNodes();
      if (window && typeof window.requestAnimationFrame === "function") {
        window.requestAnimationFrame(syncRenderedNodes);
      }
      return true;
    } catch (err) {
      console.error("tenant qr render error:", err);
      containerEl.innerHTML = "";
      return false;
    }

  }

  function syncSelectedTenantDomain() {



    const selected = getSelectedTenantDomain();



    selectedTenantDomainId = selected ? selected.id : null;



    return selected;



  }

  function getDomainEnabledState(item) {
    const itemId = Number(item && item.id || 0);
    const fallback = !!(item && item.is_enabled !== false);
    if (!domainEnabledDraft || !itemId || !domainEnabledDraft.has(itemId)) return fallback;
    return !!domainEnabledDraft.get(itemId);
  }

  function snapshotDomainEnabledDraft() {
    domainEnabledDraft = new Map(
      tenantDomains
        .filter((item) => Number(item && item.id || 0) > 0)
        .map((item) => [Number(item.id), !!(item.is_enabled !== false)])
    );
  }







  function renderTenantDomains() {

    const listEl = document.getElementById("domainList");

    const connectedHintEl = document.getElementById("domainConnectedHint");

    const primaryHintEl = document.getElementById("domainPrimaryHint");

    const selected = syncSelectedTenantDomain();

    const fallbackDomainLabel = String(domainOriginalValue || domainAsciiValue || "").trim();

    const effectiveDomains = tenantDomains.length
      ? tenantDomains
      : (fallbackDomainLabel
        ? [{
            id: "primary-domain",
            domain: String(domainOriginalValue || "").trim(),
            domain_ascii: String(domainAsciiValue || "").trim(),
            is_enabled: true,
            is_primary_fallback: true
          }]
        : []);

    if (listEl) {
      if (!effectiveDomains.length) {
        listEl.innerHTML = '';
      } else {
        listEl.innerHTML = effectiveDomains.map((item) => {
          const label = item.domain || item.domain_ascii;
          const isEnabled = getDomainEnabledState(item);
          const isSelected = selected
            ? selected.id === item.id
            : Boolean(item.is_primary_fallback);
          const canShowManageActions = !item.is_primary_fallback;
          const canUseToggleActions = domainManageMode && !item.is_primary_fallback;
          const canUseDeleteActions = domainManageMode && !item.is_primary_fallback;
          return `
            <div class="domain-managed-item${isEnabled ? "" : " is-disabled"}${isSelected ? " is-selected" : ""}" data-domain-id="${item.id}">
              <div class="domain-managed-meta">
                <span class="domain-managed-domain">${label}</span>
                <span class="domain-managed-status${isEnabled ? "" : " is-disabled"}">${isEnabled ? "\u0421\u0430\u0439\u0442 \u0432\u043a\u043b\u044e\u0447\u0435\u043d" : "\u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0437\u0430\u0433\u043b\u0443\u0448\u043a\u0430"}</span>
              </div>
              ${canShowManageActions ? `
              <div class="domain-managed-actions">
                <label class="switch domain-managed-switch" data-domain-action="toggle" title="${isEnabled ? "\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d" : "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d"}" aria-label="${isEnabled ? "\u0412\u044b\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d" : "\u0412\u043a\u043b\u044e\u0447\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d"}" aria-disabled="${canUseToggleActions ? "false" : "true"}">
                  <input class="switch-input" type="checkbox" ${isEnabled ? "checked" : ""} data-domain-action="toggle" ${canUseToggleActions ? "" : "disabled"} />
                  <span class="switch-ui" aria-hidden="true"></span>
                </label>
                <button class="domain-managed-btn is-danger${canUseDeleteActions ? "" : " is-hidden-ghost"}" type="button" data-domain-action="delete" title="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d" aria-label="\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d" ${canUseDeleteActions ? "" : "disabled"}><i class="fas fa-trash"></i></button>
              </div>
              ` : ""}
            </div>
          `;
        }).join("");
      }
    }

    if (connectedHintEl) {
      const enabledDomains = effectiveDomains.filter((item) => item.is_enabled !== false);
      if (effectiveDomains.length) {
        connectedHintEl.textContent = enabledDomains.length
          ? `\u0412\u043a\u043b\u044e\u0447\u0435\u043d\u043e \u0434\u043e\u043c\u0435\u043d\u043e\u0432: ${enabledDomains.length}. \u0412\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u043d\u044b\u0435 \u0434\u043e\u043c\u0435\u043d\u044b \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u044e\u0442 \u0437\u0430\u0433\u043b\u0443\u0448\u043a\u0443.`
          : "\u0412\u0441\u0435 \u0434\u043e\u043c\u0435\u043d\u044b \u0441\u0435\u0439\u0447\u0430\u0441 \u0432\u044b\u043a\u043b\u044e\u0447\u0435\u043d\u044b. \u0414\u043b\u044f \u043d\u0438\u0445 \u043f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u0442\u0441\u044f \u0437\u0430\u0433\u043b\u0443\u0448\u043a\u0430.";
        connectedHintEl.classList.remove("hidden");
      } else {
        connectedHintEl.textContent = "";
        connectedHintEl.classList.add("hidden");
      }
    }

    if (primaryHintEl) {
      primaryHintEl.textContent = "";
      primaryHintEl.classList.add("hidden");
    }
  }

  function renderTenantPwaInstallQr() {
    scheduleTenantPwaDesignerRender();
    return;

    const selectEl = document.getElementById("tenantPwaQrTargetSelect");
    const openBtn = document.getElementById("tenantPwaQrOpenBtn");
    const copyBtn = document.getElementById("tenantPwaQrCopyBtn");
    const previewEl = document.getElementById("tenantPwaQrPreview");
    const emptyEl = document.getElementById("tenantPwaQrEmpty");
    const qrEl = document.getElementById("tenantPwaQrImage");
    const urlEl = document.getElementById("tenantPwaQrUrl");
    const hintEl = document.getElementById("tenantPwaQrHint");
    const selected = syncSelectedTenantPwaInstallTarget();
    const hasTargets = !!selected;

    if (selectEl) {
      selectEl.innerHTML = tenantPwaInstallTargets.map((item) => {
        const tag = item.kind === "subdomain" ? "Субдомен" : "Домен";
        const selectedAttr = selected && selected.id === item.id ? " selected" : "";
        return `<option value="${item.id}"${selectedAttr}>${tag}: ${item.label}</option>`;
      }).join("");
      selectEl.disabled = !hasTargets;
      if (selected) selectEl.value = selected.id;
    }

    if (previewEl) previewEl.classList.toggle("hidden", !hasTargets);
    if (emptyEl) emptyEl.classList.toggle("hidden", hasTargets);
    if (openBtn) openBtn.disabled = !hasTargets;
    if (copyBtn) copyBtn.disabled = !hasTargets;

    if (!hasTargets) {
      if (qrEl) qrEl.innerHTML = "";
      if (urlEl) urlEl.textContent = "";
      return;
    }

    if (urlEl) urlEl.textContent = String(selected.url || "");
    if (hintEl) {
      hintEl.textContent = selected.kind === "subdomain"
        ? "Этот QR открывает install-страницу витрины на субдомене tenant-а."
        : "Этот QR открывает install-страницу витрины на выбранном подключенном домене.";
    }

    if (qrEl) {
      const rendered = renderTenantPwaQrImage(qrEl, selected.url);
      if (!rendered && hintEl) {
        hintEl.textContent = "Не удалось собрать QR РІ браузере. Ссылка ниже всё равно готова, её можно открыть или скопировать.";
      }
    }

  }




  function renderTenantPwaDevInstallQr() {
    scheduleTenantPwaDesignerRender();
    return;

    const selectEl = document.getElementById("tenantPwaDevQrTargetSelect");
    const openBtn = document.getElementById("tenantPwaDevQrOpenBtn");
    const copyBtn = document.getElementById("tenantPwaDevQrCopyBtn");
    const previewEl = document.getElementById("tenantPwaDevQrPreview");
    const emptyEl = document.getElementById("tenantPwaDevQrEmpty");
    const qrEl = document.getElementById("tenantPwaDevQrImage");
    const urlEl = document.getElementById("tenantPwaDevQrUrl");
    const hintEl = document.getElementById("tenantPwaDevQrHint");
    const selected = syncSelectedTenantPwaDevInstallTarget();
    const hasTargets = !!selected;

    if (selectEl) {
      selectEl.innerHTML = tenantPwaInstallDevTargets.map((item) => {
        const kindLabel = item.kind === "dev-tunnel"
          ? "[HTTPS] "
          : item.kind === "dev-localhost"
            ? "[LOCAL] "
            : "";
        const selectedAttr = selected && selected.id === item.id ? " selected" : "";
        return `<option value="${item.id}"${selectedAttr}>${kindLabel}${item.label}</option>`;
      }).join("");
      selectEl.disabled = !hasTargets;
      if (selected) selectEl.value = selected.id;
    }

    if (previewEl) previewEl.classList.toggle("hidden", !hasTargets);
    if (emptyEl) emptyEl.classList.toggle("hidden", hasTargets);
    if (openBtn) openBtn.disabled = !hasTargets;
    if (copyBtn) copyBtn.disabled = !hasTargets;

    if (!hasTargets) {
      if (qrEl) qrEl.innerHTML = "";
      if (urlEl) urlEl.textContent = "";
      return;
    }

    if (urlEl) urlEl.textContent = String(selected.url || "");
    let isInsecureLanUrl = false;
    try {
      const parsed = new URL(String(selected.url || ""), window.location.origin);
      const host = String(parsed.hostname || "").trim().toLowerCase();
      isInsecureLanUrl = parsed.protocol === "http:" && host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
    } catch (_) {}
    if (hintEl) {
      hintEl.textContent = selected.kind === "dev-tunnel"
        ? "Этот DEV QR использует HTTPS tunnel. Телефон откроет локальную витрину через защищенный адрес, и браузер сможет показать установку PWA."
        : selected.kind === "dev-current"
        ? "Этот DEV QR использует текущий адрес, по которому открыта админка."
        : selected.kind === "dev-localhost"
          ? "Этот DEV QR откроется только на этом же компьютере."
          : "Этот DEV QR использует LAN IP. Телефон и компьютер должны быть РІ одной сети.";
    }

    if (hintEl && isInsecureLanUrl) {
      hintEl.textContent = "Этот DEV QR откроет локальную витрину, но браузер не покажет нативную установку PWA на LAN IP по HTTP. Для install prompt нужен HTTPS-домен.";
    }

    if (qrEl) {
      const rendered = renderTenantPwaQrImage(qrEl, selected.url);
      if (!rendered && hintEl) {
        hintEl.textContent = "Не удалось собрать DEV QR РІ браузере. Ссылку ниже все равно можно открыть или скопировать.";
      }
    }

  }

  function getCurrentDomainValue() {



    const domainInputEl = document.getElementById("domainInput");



    const inputValue = String((domainInputEl && domainInputEl.value) || "").trim();



    if (domainDraftMode && inputValue) return inputValue;



    const selected = getSelectedTenantDomain();



    return selected ? String(selected.domain || selected.domain_ascii || "").trim() : inputValue;



  }







  function applyDomainSetup(tenant) {



    domainSetup = tenant && tenant.domain_setup ? tenant.domain_setup : null;



    tenantDomains = normalizeTenantDomains(tenant && tenant.domains);

    tenantPwaInstallTargets = normalizeTenantPwaInstallTargets(tenant && tenant.pwa_install_targets);
    if (selectedTenantPwaTargetId && !tenantPwaInstallTargets.some((item) => item.id === selectedTenantPwaTargetId)) {
      selectedTenantPwaTargetId = null;
    }
    tenantPwaInstallDevTargets = normalizeTenantPwaInstallTargets(tenant && tenant.pwa_install_dev_targets);
    if (selectedTenantPwaDevTargetId && !tenantPwaInstallDevTargets.some((item) => item.id === selectedTenantPwaDevTargetId)) {
      selectedTenantPwaDevTargetId = null;
    }
    const preferredDevTunnelTarget = tenantPwaInstallDevTargets.find((item) => item && item.kind === "dev-tunnel");
    if (preferredDevTunnelTarget && selectedTenantPwaDevTargetId !== preferredDevTunnelTarget.id) {
      selectedTenantPwaDevTargetId = preferredDevTunnelTarget.id;
    }



    const fallbackDomain = String(tenant && tenant.custom_domain || "").trim();



    const fallbackDomainAscii = String(tenant && tenant.custom_domain_ascii || "").trim();



    const primaryDomain = getFirstEnabledTenantDomain();



    domainOriginalValue = primaryDomain



      ? String(primaryDomain.domain || "")



      : fallbackDomain;



    domainAsciiValue = primaryDomain



      ? String(primaryDomain.domain_ascii || "")



      : fallbackDomainAscii;



    const aRecords = normalizeDomainList(domainSetup && domainSetup.a_records);



    const primaryARecord = aRecords[0] || "141.8.198.215";



    const aRootEl = document.getElementById("domainARecordRoot");



    const aWwwEl = document.getElementById("domainARecordWww");



    const connectBtn = document.getElementById("domainConnectBtn");



    const connectHint = document.getElementById("domainConnectHint");



    const autoConnectEnabled = !!(domainSetup && domainSetup.auto_connect_enabled);







    if (aRootEl) aRootEl.textContent = primaryARecord;



    if (aWwwEl) aWwwEl.textContent = primaryARecord;



    renderTenantDomains();
    renderTenantPwaInstallQr();
    renderTenantPwaDevInstallQr();



    renderSubdomainLinkParts();



    if (connectBtn) connectBtn.disabled = !domainManageMode || !autoConnectEnabled || !getCurrentDomainValue();



    if (connectHint) {



      if (!autoConnectEnabled) {



        connectHint.textContent = "Автоподключение домена временно недоступно.";



      } else if (tenantDomains.length) {



        connectHint.textContent = "Сначала нажмите «Проверить домен», затем «Подключить автоматически».";



      } else {



        connectHint.textContent = "Сначала добавьте домен и пропишите две A-записи.";



      }



    }



  }







  async function updateTenantFields(payload) {



    try {



      const res = await authFetch("/api/admin/tenant", {



        method: "PUT",



        body: JSON.stringify(payload)



      });



      const data = await res.json();



      return data || null;



    } catch (err) {



      console.error("Не удалось обновить профиль:", err);



      return null;



    }



  }







  async function uploadTenantAsset(field, file) {



    const token = typeof getAuthToken === "function" ? getAuthToken() : null;



    const form = new FormData();



    form.append("file", file);



    form.append("field", field);







    const res = await fetch("/api/admin/tenant/upload", {



      method: "POST",



      headers: token ? { Authorization: `Bearer ${token}` } : {},



      body: form



    });



    const data = await res.json();



    return data || null;



  }







  async function uploadTenantSound(field, file) {



    const token = typeof getAuthToken === "function" ? getAuthToken() : null;



    const form = new FormData();



    form.append("file", file);



    form.append("field", field);







    const res = await fetch("/api/admin/tenant/upload-sound", {



      method: "POST",



      headers: token ? { Authorization: `Bearer ${token}` } : {},



      body: form



    });



    const data = await res.json();



    return data || null;



  }







  function setPreviewFromValue(key, value) {



    const img = document.querySelector(`[data-upload-preview=\"${key}\"]`);



    if (!img) return;



    if (value) {



      img.src = value;



      img.classList.remove("hidden");



    } else {



      img.removeAttribute("src");



      img.classList.add("hidden");



    }



  }







  function updateSiteFavicon(url) {



    const preview = document.getElementById("siteFaviconPreview");



    const delBtn = document.getElementById("siteFaviconDeleteBtn");



    const uploadBtn = document.getElementById("siteFaviconUploadBtn");



    if (preview) {



      if (url) {



        preview.src = url;



        preview.classList.remove("hidden");



      } else {



        preview.removeAttribute("src");



        preview.classList.add("hidden");



      }



    }



    if (delBtn) delBtn.classList.toggle("hidden", !url);



    if (uploadBtn) uploadBtn.style.borderStyle = url ? "solid" : "dashed";



  }







  function setSoundPreview(key, url) {



    const label = document.querySelector(`[data-sound-label=\"${key}\"]`);



    const playBtn = document.querySelector(`[data-sound-play=\"${key}\"]`);



    if (label) label.textContent = url ? "Файл загружен" : "Файл не выбран";



    if (playBtn) playBtn.classList.toggle("hidden", !url);



  }







  async function loadTenantProfile() {



    try {



      const res = await authFetch("/api/admin/tenant");



      const data = await res.json();



      if (!data || !data.ok || !data.tenant) return;







      const tenant = data.tenant;



      tenantStockDeductMode = tenant.order_stock_deduct_mode || "on_create";



      tenantStockDeductStatusId = tenant.order_stock_deduct_status_id != null



        ? Number(tenant.order_stock_deduct_status_id)



        : null;



      updateTenantCache(tenant);



      applyBrandFromTenant(tenant);



      updateShopLink(tenant);











      const fields = document.querySelectorAll("[data-tenant-field]");



      fields.forEach((el) => {



        const key = el.getAttribute("data-tenant-field");



        el.textContent = formatValue(key, tenant[key]);



      });







      const inputs = document.querySelectorAll("[data-tenant-input]");



      inputs.forEach((el) => {



        const key = el.getAttribute("data-tenant-input");



        if (key in tenant) el.value = tenant[key] ?? "";



        setPreviewFromValue(key, tenant[key]);



        if (key === "sound_new_order_url" || key === "sound_order_cancelled_url" || key === "sound_new_message_url") {



          setSoundPreview(key, tenant[key]);



        }



      });



      if (!chatSoundsDraftMode && typeof updateChatSoundsOriginalFromCurrentForm === "function") {
        updateChatSoundsOriginalFromCurrentForm();
      }



      if (typeof applyChatSettingsFromTenant === "function") {
        applyChatSettingsFromTenant(tenant);
      }



      siteOriginal = {



        site_name: String(tenant.site_name || ""),



        site_description: String(tenant.site_description || ""),



        subdomain: String(tenant.subdomain || ""),



        favicon_light_url: String(tenant.favicon_light_url || "")



      };



      siteDraft = { ...siteOriginal };



      siteDraftMode = false;



      siteCancelConfirm = false;



      const siteNameInput = document.querySelector('[data-site-input="site_name"]');



      const siteDescriptionInput = document.querySelector('[data-site-input="site_description"]');



      const subdomainInputEl = document.getElementById("subdomainInput");



      if (siteNameInput) {



        siteNameInput.disabled = true;



        siteNameInput.readOnly = true;



      }



      if (siteDescriptionInput) {



        siteDescriptionInput.disabled = true;



        siteDescriptionInput.readOnly = true;



      }



      if (subdomainInputEl) {



        subdomainInputEl.disabled = true;



        subdomainInputEl.readOnly = true;



      }



      const siteUploadBtnEl = document.getElementById("siteFaviconUploadBtn");



      const siteDeleteBtnEl = document.getElementById("siteFaviconDeleteBtn");



      if (siteUploadBtnEl) siteUploadBtnEl.disabled = true;



      if (siteDeleteBtnEl) siteDeleteBtnEl.disabled = true;



      const siteFooterViewEl = document.getElementById("settingsSiteFooterView");



      const siteFooterEditEl = document.getElementById("settingsSiteFooterEdit");



      if (siteFooterViewEl) siteFooterViewEl.classList.remove("hidden");



      if (siteFooterEditEl) siteFooterEditEl.classList.add("hidden");



      const siteCancelBtnEl = document.getElementById("settingsSiteCancelBtn");



      if (siteCancelBtnEl) {



        siteCancelBtnEl.classList.remove("is-confirm");



        siteCancelBtnEl.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



        siteCancelBtnEl.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



        siteCancelBtnEl.innerHTML = '<i class="fas fa-times"></i>';



      }



      domainOriginalValue = String(tenant.custom_domain || "");



      domainAsciiValue = String(tenant.custom_domain_ascii || "");



      applyDomainSetup(tenant);



      const settingsPriceRoundingModeInput = document.getElementById("settingsPriceRoundingMode");



      const settingsPriceRoundingPrecisionInput = document.getElementById("settingsPriceRoundingPrecision");



      if (settingsPriceRoundingModeInput && !settingsPriceRoundingModeInput.value) {



        settingsPriceRoundingModeInput.value = "none";



      }



      if (settingsPriceRoundingPrecisionInput && !settingsPriceRoundingPrecisionInput.value) {



        settingsPriceRoundingPrecisionInput.value = "2";



      }







      const stockDeductModeSelect = document.getElementById("settingsOrderStockDeductMode");



      if (stockDeductModeSelect) {



        stockDeductModeSelect.value = tenantStockDeductMode;



      }



      const stockDeductStatusSelect = document.getElementById("settingsOrderStockDeductStatus");



      if (stockDeductStatusSelect) {



        stockDeductStatusSelect.dataset.pendingValue = tenantStockDeductStatusId != null



          ? String(tenantStockDeductStatusId)



          : "";



      }



      if (typeof window.__refreshOrderStockDeductControls === "function") {



        window.__refreshOrderStockDeductControls(tenantStockDeductStatusId);



      }







      fillTimezoneSelect(tenant.timezone, "tenantTimezoneSelect");



      fillTimezoneSelect(tenant.timezone, "brandTimezoneSelect");







      // Telegram bot fields



      const tgBotUsernameInput = document.getElementById("tenantTelegramBotUsername");



      const tgBotTokenInput = document.getElementById("tenantTelegramBotToken");



      const tgMiniAppEnabledInput = document.getElementById("tenantTelegramMiniAppEnabled");



      const tgLoginEnabledInput = document.getElementById("tenantTelegramLoginEnabled");



      const maxBotIdInput = document.getElementById("tenantMaxBotId");



      const maxBotTokenInput = document.getElementById("tenantMaxBotToken");



      const maxMiniAppEnabledInput = document.getElementById("tenantMaxMiniAppEnabled");



      const maxLoginEnabledInput = document.getElementById("tenantMaxLoginEnabled");



      if (tgBotUsernameInput) {



        tgBotUsernameInput.value = tenant.telegram_bot_username || "";



      }



      if (tgBotTokenInput) {



        tgBotTokenInput.value = tenant.telegram_bot_token || "";



      }



      if (tgMiniAppEnabledInput) {



        tgMiniAppEnabledInput.checked = Number(tenant.tg_mini_app_enabled ?? 1) === 1;



      }



      if (tgLoginEnabledInput) {



        const hasRequired = !!(String(tenant.telegram_bot_username || "").trim() && String(tenant.telegram_bot_token || "").trim());



        tgLoginEnabledInput.checked = Number(tenant.tg_login_enabled ?? 0) === 1;



        tgLoginEnabledInput.disabled = !hasRequired;



        tgLoginEnabledInput.title = hasRequired ? "" : "Сначала заполните имя бота и токен Telegram";



      }



      telegramOriginal = {



        telegram_bot_username: String(tenant.telegram_bot_username || ""),



        telegram_bot_token: String(tenant.telegram_bot_token || ""),



        tg_mini_app_enabled: Number(tenant.tg_mini_app_enabled ?? 1) === 1 ? 1 : 0,



        tg_login_enabled: Number(tenant.tg_login_enabled ?? 0) === 1 ? 1 : 0



      };



      telegramDraft = { ...telegramOriginal };



      // Безопасный сброс Telegram-режима прямо здесь:



      // loadTenantProfile вызывается раньше, чем инициализируются нижние const-переменные.



      telegramDraftMode = false;



      telegramCancelConfirm = false;



      if (tgBotUsernameInput) {



        tgBotUsernameInput.disabled = true;



        tgBotUsernameInput.readOnly = true;



      }



      if (tgBotTokenInput) {



        tgBotTokenInput.disabled = true;



        tgBotTokenInput.readOnly = true;



      }



      if (tgMiniAppEnabledInput) tgMiniAppEnabledInput.disabled = true;



      if (tgLoginEnabledInput) tgLoginEnabledInput.disabled = true;



      const telegramFooterViewEl = document.getElementById("settingsTelegramFooterView");



      const telegramFooterEditEl = document.getElementById("settingsTelegramFooterEdit");



      if (telegramFooterViewEl) telegramFooterViewEl.classList.remove("hidden");



      if (telegramFooterEditEl) telegramFooterEditEl.classList.add("hidden");



      const telegramCancelBtnEl = document.getElementById("settingsTelegramCancelBtn");



      if (telegramCancelBtnEl) {



        telegramCancelBtnEl.classList.remove("is-confirm");



        telegramCancelBtnEl.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



        telegramCancelBtnEl.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



        telegramCancelBtnEl.innerHTML = '<i class="fas fa-times"></i>';



      }



      if (maxBotIdInput) {



        maxBotIdInput.value = tenant.max_bot_id || "";



      }



      if (maxBotTokenInput) {



        maxBotTokenInput.value = tenant.max_bot_token || "";



      }



      if (maxMiniAppEnabledInput) {



        maxMiniAppEnabledInput.checked = Number(tenant.max_mini_app_enabled ?? 1) === 1;



      }



      if (maxLoginEnabledInput) {



        const hasRequired = !!(String(tenant.max_bot_id || "").trim() && String(tenant.max_bot_token || "").trim());



        maxLoginEnabledInput.checked = Number(tenant.max_login_enabled || 0) === 1;



        maxLoginEnabledInput.disabled = !hasRequired;



        maxLoginEnabledInput.title = hasRequired ? "" : "Сначала заполните ID бота и токен MAX";



      }



      maxOriginal = {



        max_bot_id: String(tenant.max_bot_id || ""),



        max_bot_token: String(tenant.max_bot_token || ""),



        max_mini_app_enabled: Number(tenant.max_mini_app_enabled ?? 1) === 1 ? 1 : 0,



        max_login_enabled: Number(tenant.max_login_enabled ?? 0) === 1 ? 1 : 0



      };



      maxDraft = { ...maxOriginal };



      maxDraftMode = false;



      maxCancelConfirm = false;



      if (maxBotIdInput) {



        maxBotIdInput.disabled = true;



        maxBotIdInput.readOnly = true;



      }



      if (maxBotTokenInput) {



        maxBotTokenInput.disabled = true;



        maxBotTokenInput.readOnly = true;



      }



      if (maxMiniAppEnabledInput) maxMiniAppEnabledInput.disabled = true;



      if (maxLoginEnabledInput) maxLoginEnabledInput.disabled = true;



      const maxFooterViewEl = document.getElementById("settingsMaxFooterView");



      const maxFooterEditEl = document.getElementById("settingsMaxFooterEdit");



      if (maxFooterViewEl) maxFooterViewEl.classList.remove("hidden");



      if (maxFooterEditEl) maxFooterEditEl.classList.add("hidden");



      const maxCancelBtnEl = document.getElementById("settingsMaxCancelBtn");



      if (maxCancelBtnEl) {



        maxCancelBtnEl.classList.remove("is-confirm");



        maxCancelBtnEl.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



        maxCancelBtnEl.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



        maxCancelBtnEl.innerHTML = '<i class="fas fa-times"></i>';



      }







      // Telegram mini app link



      const tgMiniAppInput = document.getElementById("tenantTelegramMiniAppInput");



      if (tgMiniAppInput && tenant.telegram_mini_app_url) {



        tgMiniAppInput.value = tenant.telegram_mini_app_url;



      }



      const maxMiniAppInput = document.getElementById("tenantMaxMiniAppInput");



      if (maxMiniAppInput && tenant.max_mini_app_url) {



        maxMiniAppInput.value = tenant.max_mini_app_url;



      }







      // Фавикон РІ панели «Данные сайта»



      updateSiteFavicon(tenant.favicon_light_url);







      const chatWidgetToggle = document.getElementById("settingsChatWidgetEnabledSwitch");



      if (chatWidgetToggle) {



        const rawChatWidgetEnabled = tenant ? tenant.chat_widget_enabled : undefined;



        const normalizedChatWidgetEnabled = String(rawChatWidgetEnabled == null ? "" : rawChatWidgetEnabled).trim().toLowerCase();



        chatWidgetToggle.checked = !(



          rawChatWidgetEnabled === 0



          || rawChatWidgetEnabled === false



          || normalizedChatWidgetEnabled === "0"



          || normalizedChatWidgetEnabled === "false"



        );



      }







      const applyChatSettingsFromTenantFn = (



        typeof window !== "undefined"



        && typeof window.__applyChatSettingsFromTenant === "function"



      )



        ? window.__applyChatSettingsFromTenant



        : null;



      if (applyChatSettingsFromTenantFn) {



        applyChatSettingsFromTenantFn(tenant);



      }







      // Фото товаров — заполнить настройки конвертации



      if (typeof window.__applyImagesSettings === "function") {



        window.__applyImagesSettings(tenant);



      }



    } catch (err) {
      const errMessage = err && err.message ? String(err.message) : String(err || "");
      const errStack = err && err.stack ? String(err.stack) : "";
      console.error("Не удалось загрузить профиль tenant:", errMessage, errStack);
    }



  }







  async function fetchStores() {



    try {



      const res = await authFetch("/api/admin/tenant/stores");



      const data = await res.json();



      return data || null;



    } catch (err) {



      console.error("Не удалось загрузить Филиалы:", err);



      return null;



    }



  }







  async function createStore(payload) {



    try {



      const res = await authFetch("/api/admin/tenant/stores", {



        method: "POST",



        body: JSON.stringify(payload)



      });



      const data = await res.json();



      return data || null;



    } catch (err) {



      console.error("Не удалось создать точку продаж:", err);



      return null;



    }



  }







  async function updateStore(id, payload) {



    try {



      const res = await authFetch(`/api/admin/tenant/stores/${encodeURIComponent(id)}`, {



        method: "PATCH",



        body: JSON.stringify(payload)



      });



      const data = await res.json();



      return data || null;



    } catch (err) {



      console.error("Не удалось обновить точку продаж:", err);



      return null;



    }



  }







  document.addEventListener("DOMContentLoaded", () => {



    const settingsSectionButtons = document.querySelectorAll("[data-settings-section]");



    const settingsCenterIcon = document.getElementById("settingsCenterIcon");



    const settingsCenterTitle = document.getElementById("settingsCenterTitle");



    const settingsCenterSubtitle = document.getElementById("settingsCenterSubtitle");



    const settingsTenantCards = document.getElementById("settingsTenantCards");



    const settingsStoresEmpty = document.getElementById("settingsStoresEmpty");



    const settingsCardsPanel = document.getElementById("settingsCardsPanel");



    const siteSectionPanel = document.getElementById("sitePanel");



    const systemSectionPanel = document.getElementById("systemPanel");



    const apiSectionPanel = document.getElementById("apiPanel");



    const deliveryPanel = document.getElementById("deliveryPanel");



    const storesPanel = document.getElementById("storesPanel");



    const storesList = document.getElementById("storesList");



    const storesEmpty = document.getElementById("storesEmpty");



    const settingsAddOrderBtn = document.getElementById("settingsAddOrderBtn");



    const settingsCreateMenuWrap = document.getElementById("settingsCreateMenuWrap");



    const settingsDeliveryCreateMenu = document.getElementById("settingsDeliveryCreateMenu");



    const settingsDeliveryCreateConditionBtn = document.getElementById("settingsDeliveryCreateConditionBtn");



    const settingsDeliveryCreateZoneBtn = document.getElementById("settingsDeliveryCreateZoneBtn");



    const settingsDeliveryMapSearchToolbar = document.getElementById("settingsDeliveryMapSearchToolbar");



    const settingsDeliveryMapSearchWrap = document.getElementById("settingsDeliveryMapSearchWrap");



    const settingsDeliveryMapSearchPopover = document.getElementById("settingsDeliveryMapSearchPopover");



    const settingsDeliveryMapSearchClear = document.getElementById("settingsDeliveryMapSearchClear");



    const settingsDeliveryMapBlock = document.getElementById("settingsDeliveryMapBlock");



    const settingsDeliveryMapCanvas = document.getElementById("settingsDeliveryMapCanvas");



    const settingsDeliveryMapEmpty = document.getElementById("settingsDeliveryMapEmpty");



    const settingsDeliveryMapSearchInput = document.getElementById("settingsDeliveryMapSearchInput");



    const settingsDeliveryMapSearchStatus = document.getElementById("settingsDeliveryMapSearchStatus");



    const settingsDeliveryMapResults = document.getElementById("settingsDeliveryMapResults");



    const settingsDeliveryCitySelector = document.getElementById("settingsDeliveryCitySelector");



    const settingsDeliveryCityChip = document.getElementById("settingsDeliveryCityChip");



    const settingsDeliveryCityChipText = document.getElementById("settingsDeliveryCityChipText");



    const settingsDeliveryCityDropdown = document.getElementById("settingsDeliveryCityDropdown");



    const settingsDeliveryMapConfigBtn = document.getElementById("settingsDeliveryMapConfigBtn");



    const settingsChatWidgetSwitchWrap = document.getElementById("settingsChatWidgetSwitchWrap");



    const settingsChatWidgetEnabledSwitch = document.getElementById("settingsChatWidgetEnabledSwitch");



    const settingsTenantCardItems = settingsTenantCards



      ? Array.from(settingsTenantCards.querySelectorAll(".settings-card"))



      : [];







    function normalizeChatWidgetEnabledValue(rawValue) {



      if (rawValue === undefined || rawValue === null || rawValue === "") return true;



      if (rawValue === false || rawValue === 0) return false;



      const normalized = String(rawValue).trim().toLowerCase();



      if (!normalized) return true;



      if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;



      if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;



      const numeric = Number(normalized);



      if (Number.isFinite(numeric)) return numeric !== 0;



      return true;



    }







    function normalizeChatToggleEnabledValue(rawValue) {



      if (rawValue === undefined || rawValue === null || rawValue === "") return true;



      if (rawValue === false || rawValue === 0) return false;



      const normalized = String(rawValue).trim().toLowerCase();



      if (!normalized) return true;



      if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;



      if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;



      const numeric = Number(normalized);



      if (Number.isFinite(numeric)) return numeric !== 0;



      return true;



    }







    function normalizeChatWelcomeEnabledValue(rawValue) {



      return normalizeChatToggleEnabledValue(rawValue);



    }







    function normalizeChatQuickQuestionsEnabledValue(rawValue) {



      return normalizeChatToggleEnabledValue(rawValue);



    }







    function syncDeliveryMapConfigButtonVisibility(section) {



      if (!settingsDeliveryMapConfigBtn) return;



      const activeSection = typeof section === "string"



        ? section



        : String(document.body.getAttribute("data-settings-section") || "");



      settingsDeliveryMapConfigBtn.classList.toggle(



        "hidden",



        activeSection !== "delivery" || !isStoreAddressMapModeEnabled()



      );



    }







    function closeDeliveryCreateMenu() {



      deliveryCreateMenuOpen = false;



      if (settingsDeliveryCreateMenu) settingsDeliveryCreateMenu.classList.add("hidden");



    }







    function syncDeliveryCreateMenuAvailability() {



      if (!settingsDeliveryCreateZoneBtn) return;



      settingsDeliveryCreateZoneBtn.classList.toggle("hidden", !isDeliveryZoneFeatureAvailable());



    }







    function openDeliveryCreateMenu() {



      syncDeliveryCreateMenuAvailability();



      if (!settingsDeliveryCreateMenu) return;



      deliveryCreateMenuOpen = true;



      settingsDeliveryCreateMenu.classList.remove("hidden");



    }







    function syncSettingsToolbarControls(section) {



      const isChats = section === "chats";



      const isDelivery = section === "delivery";



      const isApi = section === "api";



      if (settingsChatWidgetSwitchWrap) {



        settingsChatWidgetSwitchWrap.classList.toggle("hidden", !isChats);



      }



      if (settingsDeliveryMapSearchToolbar) {



        settingsDeliveryMapSearchToolbar.classList.toggle("hidden", !isDelivery);



      }



      syncDeliveryMapConfigButtonVisibility(section);



      if (settingsDeliveryCitySelector && !isDelivery) {



        settingsDeliveryCitySelector.classList.add("hidden");



      }



      if (settingsAddOrderBtn) {



        settingsAddOrderBtn.classList.toggle("hidden", section === "site" || section === "system" || isChats || isApi);



        if (isDelivery) {



          settingsAddOrderBtn.title = "Новая настройка доставки";



          settingsAddOrderBtn.setAttribute("aria-label", "Новая настройка доставки");



        } else {



          settingsAddOrderBtn.title = "Новый филиал";



          settingsAddOrderBtn.setAttribute("aria-label", "Новая точка продаж");



        }



      }



      if (isDelivery) {



        renderDeliveryCitySelector();



        if (settingsAddOrderBtn) {



          settingsAddOrderBtn.title = "Добавить";



          settingsAddOrderBtn.setAttribute("aria-label", "Добавить");



        }



        syncDeliveryCreateMenuAvailability();



      } else {



        closeDeliveryCityDropdown();



        closeDeliveryMapSearchPopover();



        closeDeliveryCreateMenu();



      }



    }







    function syncSettingsSectionPanels(section) {



      const isStores = section === "stores";



      const isSite = section === "site";



      const isSystem = section === "system";



      const isDelivery = section === "delivery";



      const isApi = section === "api";



      const hideTenantCards = isStores || isSite || isSystem || isDelivery || isApi;



      if (settingsTenantCards) settingsTenantCards.classList.toggle("hidden", hideTenantCards);



      if (settingsCardsPanel) settingsCardsPanel.classList.toggle("hidden", hideTenantCards);



      if (storesPanel) storesPanel.classList.toggle("hidden", !isStores);



      if (siteSectionPanel) siteSectionPanel.classList.toggle("hidden", !isSite);



      if (systemSectionPanel) systemSectionPanel.classList.toggle("hidden", !isSystem);



      if (deliveryPanel) deliveryPanel.classList.toggle("hidden", !isDelivery);



      if (apiSectionPanel) apiSectionPanel.classList.toggle("hidden", !isApi);



    }







    function syncSettingsCenterHeading(section) {



      if (settingsCenterTitle) {



        settingsCenterTitle.textContent =



          section === "stores"



            ? "Филиалы"



            : section === "site"



              ? "Сайт"



              : section === "chats"



                ? "Настройки чата"



                : section === "api"



                  ? "Настройка принтера"



                  : section === "system"



                    ? "Системные"



                    : section === "delivery"



                      ? "Доставка"



                      : "Компания";



      }



      if (settingsCenterSubtitle) {



        settingsCenterSubtitle.textContent =



          section === "stores"



            ? "Загрузка..."



            : section === "chats"



              ? "Звуки, помощник и сообщения"



              : section === "api"



                ? "Для печати заказов"



                : section === "delivery"



                  ? "Загрузка..."



                  : "";



      }



    }







    function applySettingsCardsFilterBySection(section) {



      const isChats = section === "chats";



      settingsTenantCardItems.forEach((card) => {



        const isChatCard = card.getAttribute("data-settings-chat-card") === "1";



        const shouldShow = isChats ? isChatCard : !isChatCard;



        card.classList.toggle("hidden", !shouldShow);



      });



    }







    function syncSettingsCenterHeadingVisual(section) {



      if (settingsCenterIcon) {



        settingsCenterIcon.className =



          section === "stores"



            ? "fas fa-shop"



            : section === "site"



              ? "fas fa-globe"



              : section === "chats"



                ? "fas fa-comments"



                : section === "api"



                  ? "fas fa-plug"



                  : section === "system"



                    ? "fas fa-sliders-h"



                    : section === "delivery"



                      ? "fas fa-truck"



                      : "fas fa-store";



      }



      if (section === "chats") {



        if (settingsCenterTitle) settingsCenterTitle.textContent = "Чат";



        if (settingsCenterSubtitle) settingsCenterSubtitle.textContent = "";



      }



      if (section === "api") {



        if (settingsCenterTitle) settingsCenterTitle.textContent = "API";



        if (settingsCenterSubtitle) settingsCenterSubtitle.textContent = "";



      }



    }







    const initialSettingsSection = document.body.getAttribute("data-settings-section") || "tenant";



    applySettingsCardsFilterBySection(initialSettingsSection);



    syncSettingsCenterHeading(initialSettingsSection);



    syncSettingsCenterHeadingVisual(initialSettingsSection);



    syncSettingsToolbarControls(initialSettingsSection);



    syncSettingsSectionPanels(initialSettingsSection);



    if (initialSettingsSection === "chats") {



      ensureChatSidebarBadgeScriptLoaded().catch(() => {});



    }







    if (settingsChatWidgetEnabledSwitch) {



      const cachedTenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;



      settingsChatWidgetEnabledSwitch.checked = normalizeChatWidgetEnabledValue(



        cachedTenant ? cachedTenant.chat_widget_enabled : undefined



      );



    }







    settingsSectionButtons.forEach((btn) => {



      btn.addEventListener("click", () => {



        settingsSectionButtons.forEach((el) => el.classList.remove("is-active"));



        btn.classList.add("is-active");



        const section = btn.getAttribute("data-settings-section") || "";



        document.body.setAttribute("data-settings-section", section);



        const isStores = section === "stores";



        const isSite = section === "site";



        const isChats = section === "chats";



        const isApi = section === "api";



        const isSystem = section === "system";



        if (isChats) {



          ensureChatSidebarBadgeScriptLoaded().catch(() => {});



        }



        if (settingsCenterTitle) {



          settingsCenterTitle.textContent = isStores



            ? "Филиалы"



            : isSite



              ? "Сайт"



              : isChats



                ? "\u0427\u0430\u0442\u044b"



                : isApi



                  ? "API"



                  : "Компания";



        }



        if (settingsCenterSubtitle) {



          settingsCenterSubtitle.textContent = isStores ? "Загрузка..." : "";



        }



        if (settingsCenterTitle && isApi) {



          settingsCenterTitle.textContent = "API";



        }



        if (settingsCenterSubtitle && isApi) {



          settingsCenterSubtitle.textContent = "Настройка принтера для печати заказов";



        }



        if (settingsCenterTitle && isSystem) {



          settingsCenterTitle.textContent = "\u0421\u0438\u0441\u0442\u0435\u043c\u043d\u044b\u0435";



        }



        if (isChats || isApi) {



          syncSettingsCenterHeading(section);



        }



        syncSettingsCenterHeadingVisual(section);



        applySettingsCardsFilterBySection(section);



        if (settingsTenantCards) settingsTenantCards.classList.toggle("hidden", isStores || isSite || isSystem);



        if (settingsStoresEmpty) settingsStoresEmpty.classList.add("hidden");



        if (settingsCardsPanel) settingsCardsPanel.classList.toggle("hidden", isStores || isSite || isSystem);



        if (storesPanel) storesPanel.classList.toggle("hidden", !isStores);



        if (siteSectionPanel) siteSectionPanel.classList.toggle("hidden", !isSite);



        if (systemSectionPanel) systemSectionPanel.classList.toggle("hidden", !isSystem);



        syncSettingsSectionPanels(section);



        syncSettingsToolbarControls(section);







        if (isStores) {



          const hasStoreTab = rightTabs && rightTabs.querySelector("[data-right-tab^=\"store-\"]");



          if (rightDefault) rightDefault.classList.add("hidden");



          if (hasStoreTab) {



            if (rightHeader) rightHeader.classList.remove("hidden");



            if (rightTabs) rightTabs.classList.remove("hidden");



            setActiveRightTab(hasStoreTab.getAttribute("data-right-tab"));



          } else {



            setActiveRightTab("");



            if (rightHeader) rightHeader.classList.add("hidden");



            if (rightTabs) rightTabs.classList.add("hidden");



            if (settingsStoreEmpty) settingsStoreEmpty.classList.remove("hidden");



            showStorePanel(false);



          }



          loadStores();



        } else {



          setActiveRightTab("");



          if (rightHeader) rightHeader.classList.add("hidden");



          if (rightTabs) rightTabs.classList.add("hidden");



          if (settingsStoreEmpty) settingsStoreEmpty.classList.add("hidden");



          if (settingsStorePanel) settingsStorePanel.classList.add("hidden");



          closeStoreAddressSuggestPopover();



          if (rightDefault) rightDefault.classList.remove("hidden");



        }



      });



    });







    const logoCard = document.getElementById("settingsLogoCard");



    const siteCard = document.getElementById("settingsSiteCard");
    const pwaQrCard = document.getElementById("settingsPwaQrCard");



    const brandCard = document.getElementById("settingsBrandCard");



    const orderStatusesCard = document.getElementById("settingsOrderStatusesCard");



    const orderPaymentsCard = document.getElementById("settingsOrderPaymentsCard");



    const orderDeliveryCard = document.getElementById("settingsOrderDeliveryCard");



    const orderTimeOptionsCard = document.getElementById("settingsOrderTimeOptionsCard");



    const soundsCard = document.getElementById("settingsSoundsCard");



    const chatAssistantNameCard = document.getElementById("settingsChatAssistantNameCard");



    const chatOperatorNameCard = document.getElementById("settingsChatOperatorNameCard");



    const chatMessageSettingsCard = document.getElementById("settingsChatMessageSettingsCard");



    const notificationsCard = document.getElementById("settingsNotificationsCard");



    const imagesCard = document.getElementById("settingsImagesCard");



    const printApiCard = document.getElementById("settingsPrintApiCard");



    const systemPollingCard = document.getElementById("settingsSystemPollingCard");



    const systemMapCard = document.getElementById("settingsSystemMapCard");



    const systemDeliveryZonePolygonCard = document.getElementById("settingsSystemDeliveryZonePolygonCard");



    const systemTelegramBotCard = document.getElementById("settingsSystemTelegramBotCard");
    const systemMaxBotCard = document.getElementById("settingsSystemMaxBotCard");



    const telegramAppCard = document.getElementById("settingsTelegramAppCard");



    const maxAppCard = document.getElementById("settingsMaxAppCard");



    const rightDefault = document.getElementById("settingsRightDefault");



    const logoPanel = document.getElementById("settingsLogoPanel");



    const sitePanel = document.getElementById("settingsSitePanel");



    const domainPanel = document.getElementById("settingsDomainPanel");
    const pwaQrPanel = document.getElementById("settingsPwaQrPanel");



    const telegramAppPanel = document.getElementById("settingsTelegramAppPanel");



    const maxAppPanel = document.getElementById("settingsMaxAppPanel");



    const brandPanel = document.getElementById("settingsBrandPanel");



    const orderStatusesPanel = document.getElementById("settingsOrderStatusesPanel");



    const orderPaymentsPanel = document.getElementById("settingsOrderPaymentsPanel");



    const orderDeliveryPanel = document.getElementById("settingsOrderDeliveryPanel");



    const orderTimeOptionsPanel = document.getElementById("settingsOrderTimeOptionsPanel");



    const soundsPanel = document.getElementById("settingsSoundsPanel");



    const chatAssistantNamePanel = document.getElementById("settingsChatAssistantNamePanel");



    const chatOperatorNamePanel = document.getElementById("settingsChatOperatorNamePanel");



    const chatMessageSettingsPanel = document.getElementById("settingsChatMessageSettingsPanel");



    const imagesPanel = document.getElementById("settingsImagesPanel");



    const printApiPanel = document.getElementById("settingsPrintApiPanel");



    const systemPollingPanel = document.getElementById("settingsSystemPollingPanel");



    const systemMapPanel = document.getElementById("settingsSystemMapPanel");



    const systemDeliveryZonePolygonPanel = document.getElementById("settingsSystemDeliveryZonePolygonPanel");



    const systemTelegramBotPanel = document.getElementById("settingsSystemTelegramBotPanel");
    const systemMaxBotPanel = document.getElementById("settingsSystemMaxBotPanel");



    const settingsNotificationsPanel = document.getElementById("settingsNotificationsPanel");



    const globalTelegramBindings = document.getElementById("globalTelegramBindings");



    const globalTelegramConnectBlock = document.getElementById("globalTelegramConnectBlock");



    const globalTelegramApiKey = document.getElementById("globalTelegramApiKey");



    const globalTelegramSecretKey = document.getElementById("globalTelegramSecretKey");



    const globalTelegramAddBtn = document.getElementById("globalTelegramAddBtn");



    const globalTelegramToggleBtn = document.getElementById("globalTelegramToggleBtn");



    const globalTelegramCancelBtn = document.getElementById("globalTelegramCancelBtn");



    const settingsPriceRoundingMode = document.getElementById("settingsPriceRoundingMode");



    const settingsPriceRoundingPrecision = document.getElementById("settingsPriceRoundingPrecision");



    const settingsOrderStockDeductMode = document.getElementById("settingsOrderStockDeductMode");



    const settingsOrderStockDeductStatus = document.getElementById("settingsOrderStockDeductStatus");



    const settingsOrderStockDeductStatusField = document.getElementById("settingsOrderStockDeductStatusField");



    const settingsChatWelcomeSection = document.getElementById("settingsChatWelcomeSection");



    const settingsChatWelcomeRow = document.getElementById("settingsChatWelcomeRow");



    const settingsChatWelcomeBody = document.getElementById("settingsChatWelcomeBody");



    const settingsChatWelcomeExpandBtn = document.getElementById("settingsChatWelcomeExpandBtn");



    const settingsChatWelcomeMessageInput = document.getElementById("settingsChatWelcomeMessageInput");



    const settingsChatWelcomeEnabledSwitch = document.getElementById("settingsChatWelcomeEnabledSwitch");



    const settingsChatAssistantNameInput = document.getElementById("settingsChatAssistantNameInput");



    const settingsChatAssistantEditBtn = document.getElementById("settingsChatAssistantEditBtn");



    const settingsChatAssistantCancelBtn = document.getElementById("settingsChatAssistantCancelBtn");



    const settingsChatAssistantFooterView = document.getElementById("settingsChatAssistantFooterView");



    const settingsChatAssistantFooterEdit = document.getElementById("settingsChatAssistantFooterEdit");



    const settingsChatAssistantNameSaveBtn = document.getElementById("settingsChatAssistantNameSaveBtn");



    const settingsChatAssistantGenderOptions = document.getElementById("settingsChatAssistantGenderOptions");



    const settingsChatOperatorNameInput = document.getElementById("settingsChatOperatorNameInput");



    const settingsChatOperatorEditBtn = document.getElementById("settingsChatOperatorEditBtn");



    const settingsChatOperatorCancelBtn = document.getElementById("settingsChatOperatorCancelBtn");



    const settingsChatOperatorFooterView = document.getElementById("settingsChatOperatorFooterView");



    const settingsChatOperatorFooterEdit = document.getElementById("settingsChatOperatorFooterEdit");



    const settingsChatOperatorNameSaveBtn = document.getElementById("settingsChatOperatorNameSaveBtn");



    const settingsChatHotQuestionsGrid = document.getElementById("settingsChatHotQuestionsGrid");



    const settingsChatQuickQuestionsSection = document.getElementById("settingsChatQuickQuestionsSection");



    const settingsChatQuickQuestionsJson = document.getElementById("settingsChatQuickQuestionsJson");



    const settingsChatQuickQuestionsEnabledSwitch = document.getElementById("settingsChatQuickQuestionsEnabledSwitch");



    const settingsChatQuickQuestionsAddBtn = document.getElementById("settingsChatQuickQuestionsAddBtn");



    const settingsChatThreadTtlDaysInput = document.getElementById("settingsChatThreadTtlDaysInput");



    const settingsChatGuestThreadTtlDaysInput = document.getElementById("settingsChatGuestThreadTtlDaysInput");



    const settingsChatMessageEditBtn = document.getElementById("settingsChatMessageEditBtn");



    const settingsChatMessageCancelBtn = document.getElementById("settingsChatMessageCancelBtn");



    const settingsChatMessageFooterView = document.getElementById("settingsChatMessageFooterView");



    const settingsChatMessageFooterEdit = document.getElementById("settingsChatMessageFooterEdit");



    const settingsChatMessageSettingsSaveBtn = document.getElementById("settingsChatMessageSettingsSaveBtn");



    const settingsSoundsEditBtn = document.getElementById("settingsSoundsEditBtn");



    const settingsSoundsCancelBtn = document.getElementById("settingsSoundsCancelBtn");



    const settingsSoundsFooterView = document.getElementById("settingsSoundsFooterView");



    const settingsSoundsFooterEdit = document.getElementById("settingsSoundsFooterEdit");



    const settingsSoundsSaveBtn = document.getElementById("settingsSoundsSaveBtn");



    const rightTabs = document.getElementById("settingsRightTabs");



    const rightHeader = rightTabs ? rightTabs.closest(".settings-right-header") : null;



    if (rightTabs) {



      rightTabs.addEventListener("wheel", (e) => {



        if (e.deltaY !== 0) {



          e.preventDefault();



          rightTabs.scrollLeft += e.deltaY;



        }



      }, { passive: false });



    }



    const settingsStoreEmpty = document.getElementById("settingsStoreEmpty");



    const settingsStorePanel = document.getElementById("settingsStorePanel");



    const settingsStoreSubtitle = document.getElementById("settingsStoreSubtitle");



    const settingsStoreName = document.getElementById("settingsStoreName");



    const settingsStoreCode = document.getElementById("settingsStoreCode");



    const settingsStoreCity = document.getElementById("settingsStoreCity");



    const settingsStoreCityWrap = document.getElementById("settingsStoreCityWrap");



    const settingsStoreCityTrigger = document.getElementById("settingsStoreCityTrigger");



    const settingsStoreCityPopover = document.getElementById("settingsStoreCityPopover");



    const settingsStoreCityStatus = document.getElementById("settingsStoreCityStatus");



    const settingsStoreCityResults = document.getElementById("settingsStoreCityResults");



    const settingsStoreAddressLookupField = document.getElementById("settingsStoreAddressLookupField");



    const settingsStoreAddressLookup = document.getElementById("settingsStoreAddressLookup");



    const settingsStoreAddressLookupWrap = document.getElementById("settingsStoreAddressLookupWrap");



    const settingsStoreAddressLookupPopover = document.getElementById("settingsStoreAddressLookupPopover");



    const settingsStoreAddressLookupStatus = document.getElementById("settingsStoreAddressLookupStatus");



    const settingsStoreAddressLookupResults = document.getElementById("settingsStoreAddressLookupResults");



    const settingsStoreLocality = document.getElementById("settingsStoreLocality");



    const settingsStoreFloor = document.getElementById("settingsStoreFloor");



    const settingsStoreApartment = document.getElementById("settingsStoreApartment");



    const settingsStoreCabinet = document.getElementById("settingsStoreCabinet");



    const settingsStoreAddressComment = document.getElementById("settingsStoreAddressComment");



    const settingsStoreAddress = document.getElementById("settingsStoreAddress");



    const settingsStoreAddressWrap = document.getElementById("settingsStoreAddressWrap");



    const settingsStoreAddressPopover = document.getElementById("settingsStoreAddressPopover");



    const settingsStoreAddressStatus = document.getElementById("settingsStoreAddressStatus");



    const settingsStoreAddressResults = document.getElementById("settingsStoreAddressResults");



    const settingsStoreHouse = document.getElementById("settingsStoreHouse");



    const settingsStoreHouseWrap = document.getElementById("settingsStoreHouseWrap");



    const settingsStoreHousePopover = document.getElementById("settingsStoreHousePopover");



    const settingsStoreHouseStatus = document.getElementById("settingsStoreHouseStatus");



    const settingsStoreHouseResults = document.getElementById("settingsStoreHouseResults");



    const settingsStoreAddressMapBtn = document.getElementById("settingsStoreAddressMapBtn");



    const settingsStoreAddressMapHint = document.getElementById("settingsStoreAddressMapHint");



    const settingsStoreAddressMapModal = document.getElementById("settingsStoreAddressMapModal");



    const settingsStoreAddressMapCloseBtn = document.getElementById("settingsStoreAddressMapCloseBtn");



    const settingsStoreAddressMapStatus = document.getElementById("settingsStoreAddressMapStatus");



    const settingsStoreAddressMapCanvas = document.getElementById("settingsStoreAddressMapCanvas");



    const settingsStoreAddressMapCoords = document.getElementById("settingsStoreAddressMapCoords");



    const settingsStoreAddressMapApplyBtn = document.getElementById("settingsStoreAddressMapApplyBtn");



    const settingsStoreAddressMapResetBtn = document.getElementById("settingsStoreAddressMapResetBtn");



    const settingsStoreAddressMapSubtitle = document.getElementById("settingsStoreAddressMapSubtitle");



    const settingsStorePhone = document.getElementById("settingsStorePhone");



    const settingsStoreTimezoneSelector = document.getElementById("settingsStoreTimezoneSelector");



    const settingsStoreTimezoneSelect = document.getElementById("settingsStoreTimezoneSelect");



    const settingsStoreTimezoneTrigger = document.getElementById("settingsStoreTimezoneTrigger");



    const settingsStoreTimezoneValue = document.getElementById("settingsStoreTimezoneValue");



    const settingsStoreTimezoneMenu = document.getElementById("settingsStoreTimezoneMenu");



    const settingsStoreActive = document.getElementById("settingsStoreActive");



    const settingsStoreSaveBtn = document.getElementById("settingsStoreSaveBtn");



    const settingsStoreSaveText = document.getElementById("settingsStoreSaveText");



    const settingsStoreResetBtn = document.getElementById("settingsStoreResetBtn");



    const settingsStoreHoursSwitch = document.getElementById("settingsStoreHoursSameSwitch");



    const settingsStoreHoursContainer = document.getElementById("settingsStoreHoursContainer");



    const settingsStoreDeliveryHoursSwitch = document.getElementById("settingsStoreDeliveryHoursSameSwitch");



    const settingsStoreDeliveryHoursContainer = document.getElementById("settingsStoreDeliveryHoursContainer");



    const settingsPrintApiStore = document.getElementById("settingsPrintApiStore");



    const settingsPrintApiToken = document.getElementById("settingsPrintApiToken");



    const settingsPrintApiGenerateBtn = document.getElementById("settingsPrintApiGenerateBtn");



    const settingsPrintApiCopyToken = document.getElementById("settingsPrintApiCopyToken");



    const settingsPrintApiCheckBtn = document.getElementById("settingsPrintApiCheckBtn");



    const settingsPrintApiPrinterStatus = document.getElementById("settingsPrintApiPrinterStatus");



    const settingsPrintApiPrinterName = document.getElementById("settingsPrintApiPrinterName");



    const settingsPrintApiNotifyNewOrder = document.getElementById("settingsPrintApiNotifyNewOrder");



    const settingsPrintApiNotifyNewMessage = document.getElementById("settingsPrintApiNotifyNewMessage");



    const settingsPrintApiOrderSoundUploadBtn = document.getElementById("settingsPrintApiOrderSoundUploadBtn");



    const settingsPrintApiOrderSoundPlayBtn = document.getElementById("settingsPrintApiOrderSoundPlayBtn");



    const settingsPrintApiOrderSoundClearBtn = document.getElementById("settingsPrintApiOrderSoundClearBtn");



    const settingsPrintApiOrderSoundFile = document.getElementById("settingsPrintApiOrderSoundFile");



    const settingsPrintApiOrderSoundUrl = document.getElementById("settingsPrintApiOrderSoundUrl");



    const settingsPrintApiOrderSoundLabel = document.getElementById("settingsPrintApiOrderSoundLabel");



    const settingsPrintApiMessageSoundUploadBtn = document.getElementById("settingsPrintApiMessageSoundUploadBtn");



    const settingsPrintApiMessageSoundPlayBtn = document.getElementById("settingsPrintApiMessageSoundPlayBtn");



    const settingsPrintApiMessageSoundClearBtn = document.getElementById("settingsPrintApiMessageSoundClearBtn");



    const settingsPrintApiMessageSoundFile = document.getElementById("settingsPrintApiMessageSoundFile");



    const settingsPrintApiMessageSoundUrl = document.getElementById("settingsPrintApiMessageSoundUrl");



    const settingsPrintApiMessageSoundLabel = document.getElementById("settingsPrintApiMessageSoundLabel");



    const settingsPrintApiEditBtn = document.getElementById("settingsPrintApiEditBtn");



    const settingsPrintApiCancelBtn = document.getElementById("settingsPrintApiCancelBtn");



    const settingsPrintApiFooterView = document.getElementById("settingsPrintApiFooterView");



    const settingsPrintApiFooterEdit = document.getElementById("settingsPrintApiFooterEdit");



    const settingsPrintApiSaveSettingsBtn = document.getElementById("settingsPrintApiSaveSettingsBtn");



    const settingsPollingEnvEnabled = document.getElementById("settingsPollingEnvEnabled");



    const settingsPollingTenantEnabled = document.getElementById("settingsPollingTenantEnabled");



    const settingsSystemMapProviderName = document.getElementById("settingsSystemMapProviderName");



    const settingsSystemMapTileUrl = document.getElementById("settingsSystemMapTileUrl");



    const settingsSystemMapAttribution = document.getElementById("settingsSystemMapAttribution");



    const settingsSystemMapMaxZoom = document.getElementById("settingsSystemMapMaxZoom");



    const settingsSystemMapSubdomains = document.getElementById("settingsSystemMapSubdomains");



    const settingsSystemMapGeocoderProviderName = document.getElementById("settingsSystemMapGeocoderProviderName");



    const settingsSystemMapGeocoderSearchUrl = document.getElementById("settingsSystemMapGeocoderSearchUrl");



    const settingsSystemMapGeocoderCountryCode = document.getElementById("settingsSystemMapGeocoderCountryCode");



    const settingsSystemMapGeocoderLanguage = document.getElementById("settingsSystemMapGeocoderLanguage");



    const settingsSystemMapGeocoderResultLimit = document.getElementById("settingsSystemMapGeocoderResultLimit");



    const settingsSystemMapStoreAddressEnabled = document.getElementById("settingsSystemMapStoreAddressEnabled");



    const settingsSystemMapEditBtn = document.getElementById("settingsSystemMapEditBtn");



    const settingsSystemMapSaveBtn = document.getElementById("settingsSystemMapSaveBtn");



    const settingsSystemMapCancelBtn = document.getElementById("settingsSystemMapCancelBtn");



    const settingsSystemMapFooterView = document.getElementById("settingsSystemMapFooterView");



    const settingsSystemMapFooterEdit = document.getElementById("settingsSystemMapFooterEdit");



    let settingsSystemMapPolygonProvider = document.getElementById("settingsSystemMapPolygonProvider");



    const settingsSystemDeliveryZonePolygonEnabled = document.getElementById("settingsSystemDeliveryZonePolygonEnabled");



    const settingsSystemDeliveryZonePolygonProvider = document.getElementById("settingsSystemDeliveryZonePolygonProvider");



    const settingsSystemDeliveryZonePolygonEditBtn = document.getElementById("settingsSystemDeliveryZonePolygonEditBtn");



    const settingsSystemDeliveryZonePolygonSaveBtn = document.getElementById("settingsSystemDeliveryZonePolygonSaveBtn");



    const settingsSystemDeliveryZonePolygonCancelBtn = document.getElementById("settingsSystemDeliveryZonePolygonCancelBtn");



    const settingsSystemDeliveryZonePolygonFooterView = document.getElementById("settingsSystemDeliveryZonePolygonFooterView");



    const settingsSystemDeliveryZonePolygonFooterEdit = document.getElementById("settingsSystemDeliveryZonePolygonFooterEdit");



    const settingsSystemTelegramBotUsername = document.getElementById("settingsSystemTelegramBotUsername");



    const settingsSystemTelegramBotToken = document.getElementById("settingsSystemTelegramBotToken");



    const settingsSystemTelegramWebhookUrl = document.getElementById("settingsSystemTelegramWebhookUrl");



    const settingsSystemTelegramEditBtn = document.getElementById("settingsSystemTelegramEditBtn");



    const settingsSystemTelegramSaveBtn = document.getElementById("settingsSystemTelegramSaveBtn");



    const settingsSystemTelegramCancelBtn = document.getElementById("settingsSystemTelegramCancelBtn");



    const settingsSystemTelegramFooterView = document.getElementById("settingsSystemTelegramFooterView");



    const settingsSystemTelegramFooterEdit = document.getElementById("settingsSystemTelegramFooterEdit");

    const settingsSystemMaxBotId = document.getElementById("settingsSystemMaxBotId");

    const settingsSystemMaxBotToken = document.getElementById("settingsSystemMaxBotToken");

    const settingsSystemMaxWebhookUrl = document.getElementById("settingsSystemMaxWebhookUrl");

    const settingsSystemMaxPollingEnabled = document.getElementById("settingsSystemMaxPollingEnabled");

    const settingsSystemMaxEditBtn = document.getElementById("settingsSystemMaxEditBtn");

    const settingsSystemMaxSaveBtn = document.getElementById("settingsSystemMaxSaveBtn");

    const settingsSystemMaxCancelBtn = document.getElementById("settingsSystemMaxCancelBtn");

    const settingsSystemMaxFooterView = document.getElementById("settingsSystemMaxFooterView");

    const settingsSystemMaxFooterEdit = document.getElementById("settingsSystemMaxFooterEdit");



    const settingsStoreTelegramList = document.getElementById("settingsStoreTelegramList");



    const settingsStoreTelegramApiKey = document.getElementById("settingsStoreTelegramApiKey");



    const settingsStoreTelegramSecretKey = document.getElementById("settingsStoreTelegramSecretKey");



    const settingsStoreTelegramAddByKeysBtn = document.getElementById("settingsStoreTelegramAddByKeysBtn");



    const settingsStoreTelegramToggleBtn = document.getElementById("settingsStoreTelegramToggleBtn");



    const settingsStoreTelegramConnectBlock = document.getElementById("settingsStoreTelegramConnectBlock");



    const settingsStoreTelegramCancelBtn = document.getElementById("settingsStoreTelegramCancelBtn");

    const settingsStoreMaxList = document.getElementById("settingsStoreMaxList");

    const settingsStoreMaxApiKey = document.getElementById("settingsStoreMaxApiKey");

    const settingsStoreMaxSecretKey = document.getElementById("settingsStoreMaxSecretKey");

    const settingsStoreMaxAddByKeysBtn = document.getElementById("settingsStoreMaxAddByKeysBtn");

    const settingsStoreMaxToggleBtn = document.getElementById("settingsStoreMaxToggleBtn");

    const settingsStoreMaxConnectBlock = document.getElementById("settingsStoreMaxConnectBlock");

    const settingsStoreMaxCancelBtn = document.getElementById("settingsStoreMaxCancelBtn");



    const STORE_ADDRESS_ALLOWED_ROOT_CITIES = Object.freeze([



      "Новоалтайск",



      "Барнаул",



      "Новосибирск",



    ]);



    const STORE_ADDRESS_ALLOWED_ROOT_CITY_KEYS = new Set(



      STORE_ADDRESS_ALLOWED_ROOT_CITIES.map((cityName) => String(cityName || "").trim().toLowerCase().replace(/ё/g, "е"))



    );



    const STORE_ADDRESS_ALLOWED_ROOT_CITY_COORDS = Object.freeze({



      [normalizeStoreCitySearchKey("Новоалтайск")]: Object.freeze({ lat: 53.412156, lng: 83.9320738 }),



      [normalizeStoreCitySearchKey("Барнаул")]: Object.freeze({ lat: 53.3475493, lng: 83.7788448 }),



      [normalizeStoreCitySearchKey("Новосибирск")]: Object.freeze({ lat: 55.028191, lng: 82.9211489 }),



    });







    const storesState = {



      loaded: false,



      items: [],



      selectedId: null,



      snapshot: null,



      mode: "view"



    };



    const storeAddressSuggestFields = {



      city: {



        input: settingsStoreCity,



        wrap: settingsStoreCityWrap,



        popover: settingsStoreCityPopover,



        status: settingsStoreCityStatus,



        results: settingsStoreCityResults,



        minQuery: 0,



      },



      lookup: {



        input: settingsStoreAddressLookup,



        wrap: settingsStoreAddressLookupWrap,



        popover: settingsStoreAddressLookupPopover,



        status: settingsStoreAddressLookupStatus,



        results: settingsStoreAddressLookupResults,



        minQuery: 2,



      },



      address: {



        input: settingsStoreAddress,



        wrap: settingsStoreAddressWrap,



        popover: settingsStoreAddressPopover,



        status: settingsStoreAddressStatus,



        results: settingsStoreAddressResults,



        minQuery: 3,



      },



      house: {



        input: settingsStoreHouse,



        wrap: settingsStoreHouseWrap,



        popover: settingsStoreHousePopover,



        status: settingsStoreHouseStatus,



        results: settingsStoreHouseResults,



        minQuery: 1,



      },



    };



    const storeAddressSuggestState = {



      city: createStoreAddressSuggestStageState(),



      lookup: createStoreAddressSuggestStageState(),



      address: createStoreAddressSuggestStageState(),



      house: createStoreAddressSuggestStageState(),



    };



    const storeAddressSelectionState = {



      city: "",



      address: "",



      street: "",



      house: "",



      manualOverride: false,



      resolvedCity: null,



      selectedStreet: null,



      selectedAddress: null,



      typedHousePart: "",



      contextLocality: "",



      sourceKey: "",



      objectType: "",



    };



    const storeAddressSuggestCache = {



      cities: new Map(),



      addressesByCity: new Map(),



    };



    const storeAddressMapState = {



      customLat: null,



      customLng: null,



      fallbackLat: null,



      fallbackLng: null,



      fallbackSource: "",



      pendingLat: null,



      pendingLng: null,



      open: false,



    };



    const storeTabs = new Map();



    let activeRightTabId = "";



  const DELIVERY_TAB_ID = "delivery-settings";



  let printApiRefreshTimer = null;



  let printApiConnectionCheckInFlight = false;



  let printApiAutoRefreshDelayMs = 5000;



  const PRINT_API_AUTO_REFRESH_MIN_MS = 5000;



  const PRINT_API_AUTO_REFRESH_MAX_MS = 30000;



  let printApiDraftMode = false;






  let chatAssistantDraftMode = false;



  let chatOperatorDraftMode = false;



  let chatMessageDraftMode = false;



  let printApiSettingsDirty = false;



  let printApiDirtyStoreId = 0;



  let printApiOriginal = {



    store_id: 0,



    token: "",



    printer_status: "Нажмите \"Проверить подключение\"",



    printer_name: "Статус не проверен",



    notify_new_order_enabled: 1,



    notify_new_message_enabled: 1,



    sound_new_order_url: "",



    sound_new_message_url: ""



  };



  let chatSoundsOriginal = {



    sound_new_order_url: "",



    sound_order_cancelled_url: "",



    sound_new_message_url: ""



  };



  let chatAssistantOriginal = {



    chat_assistant_name: "",



    chat_assistant_gender: "m",



    chat_welcome_message: "",



    chat_welcome_enabled: 1,



    chat_quick_questions_json: "",



    chat_quick_questions_enabled: 1



  };



  let chatOperatorOriginal = {



    chat_operator_name: ""



  };



  let chatMessageOriginal = {



    chat_thread_ttl_days: "0",



    chat_guest_thread_ttl_days: "7"



  };



  const DELIVERY_CREATE_TAB_KEY = "delivery:new";



    const STORE_HOUR_DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];



    const STORE_DAY_LABELS = {



      0: "Вс",



      1: "Пн",



      2: "Вт",



      3: "Ср",



      4: "Чт",



      5: "Пт",



      6: "Сб"



    };



    const STORE_HOURS_GLOBAL_KEY = "global";



    const storeHoursState = {



      useGlobal: false,



      values: {}



    };



    const deliveryHoursState = {



      useGlobal: false,



      values: {}



    };



    const DEFAULT_CHAT_ASSISTANT_NAME = "\u041d\u044f\u043c-\u041d\u044f\u043c";



    const DEFAULT_CHAT_ASSISTANT_GENDER = "m";



    const DEFAULT_CHAT_GUEST_THREAD_TTL_DAYS = 7;



    const DEFAULT_CHAT_WELCOME_MESSAGE =



      "\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n" +



      "\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f " +



      "\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 " +



      "\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 " +



      "\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.";



    const CHAT_QUICK_ORDER_ID = "order";



    const CHAT_QUICK_ORDER_QUESTION = "\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?";



    const DEFAULT_CHAT_QUICK_QUESTION_ITEMS = [



      {



        id: CHAT_QUICK_ORDER_ID,



        type: "order",



        question: CHAT_QUICK_ORDER_QUESTION,



        answer: "",



        enabled: true,



      },



      {



        id: "quality",



        type: "custom",



        question: "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430",



        answer:



          "\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. " +



          "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, " +



          "\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.",



        enabled: true,



      },



      {



        id: "completeness",



        type: "custom",



        question: "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430",



        answer:



          "\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, " +



          "\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.",



        enabled: true,



      },



      {



        id: "other",



        type: "custom",



        question: "\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441",



        answer:



          "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.",



        enabled: true,



      },



    ];



    const CHAT_QUICK_QUESTIONS_MAX = 6;



    const CHAT_ASSISTANT_GENDER_STORAGE_KEY = "settings_chat_assistant_gender";







    function getChatAssistantGenderStorageKey() {



      const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;



      const tenantId = Number(tenant && tenant.id ? tenant.id : 0);



      return tenantId > 0



        ? `${CHAT_ASSISTANT_GENDER_STORAGE_KEY}:${tenantId}`



        : CHAT_ASSISTANT_GENDER_STORAGE_KEY;



    }







    function normalizeChatAssistantGenderValue(rawValue) {



      if (rawValue === undefined || rawValue === null || rawValue === "") {



        return DEFAULT_CHAT_ASSISTANT_GENDER;



      }



      const normalized = String(rawValue).trim().toLowerCase();



      if (normalized === "f" || normalized === "female" || normalized === "\u0436") return "f";



      return DEFAULT_CHAT_ASSISTANT_GENDER;



    }







    function normalizeChatGuestThreadTtlDays(rawValue) {



      if (rawValue === undefined || rawValue === null || rawValue === "") return DEFAULT_CHAT_GUEST_THREAD_TTL_DAYS;



      const parsed = Number(rawValue);



      if (!Number.isFinite(parsed)) return DEFAULT_CHAT_GUEST_THREAD_TTL_DAYS;



      const whole = Math.trunc(parsed);



      if (whole < 1) return 1;



      if (whole > 365) return 365;



      return whole;



    }







    function normalizeChatThreadTtlDays(rawValue) {



      if (rawValue === undefined || rawValue === null || rawValue === "") return 0;



      const parsed = Number(rawValue);



      if (!Number.isFinite(parsed)) return 0;



      const whole = Math.trunc(parsed);



      if (whole < 0) return 0;



      if (whole > 365) return 365;



      return whole;



    }







    function readStoredChatAssistantGender() {



      if (typeof window === "undefined" || !window.localStorage) return "";



      try {



        const rawValue = window.localStorage.getItem(getChatAssistantGenderStorageKey());



        if (rawValue === null || rawValue === undefined || rawValue === "") return "";



        return normalizeChatAssistantGenderValue(rawValue);



      } catch {



        return "";



      }



    }







    function writeStoredChatAssistantGender(rawValue) {



      if (typeof window === "undefined" || !window.localStorage) return;



      try {



        const value = normalizeChatAssistantGenderValue(rawValue);



        window.localStorage.setItem(getChatAssistantGenderStorageKey(), value);



      } catch {}



    }







    function getSelectedChatAssistantGender() {



      if (!settingsChatAssistantGenderOptions) {



        const stored = readStoredChatAssistantGender();



        return normalizeChatAssistantGenderValue(stored || DEFAULT_CHAT_ASSISTANT_GENDER);



      }



      const checked = settingsChatAssistantGenderOptions.querySelector(



        'input[name="settingsChatAssistantGender"]:checked'



      );



      if (checked) return normalizeChatAssistantGenderValue(checked.value);



      const stored = readStoredChatAssistantGender();



      return normalizeChatAssistantGenderValue(stored || DEFAULT_CHAT_ASSISTANT_GENDER);



    }







    function setSelectedChatAssistantGender(rawValue, options = {}) {



      const opts = options && typeof options === "object" ? options : {};



      const value = normalizeChatAssistantGenderValue(rawValue);



      if (settingsChatAssistantGenderOptions) {



        const target = settingsChatAssistantGenderOptions.querySelector(



          `input[name="settingsChatAssistantGender"][value="${value}"]`



        );



        if (target) target.checked = true;



      }



      if (opts.persist !== false) {



        writeStoredChatAssistantGender(value);



      }



    }







    function cloneDefaultChatQuickQuestionItems() {



      return DEFAULT_CHAT_QUICK_QUESTION_ITEMS.map((item) => ({



        id: String(item.id || ""),



        type: item.id === CHAT_QUICK_ORDER_ID ? "order" : "custom",



        question: String(item.question || ""),



        answer: item.id === CHAT_QUICK_ORDER_ID ? "" : String(item.answer || ""),



        enabled: item.enabled !== false,



      }));



    }







    function normalizeChatQuickQuestionKey(value) {



      return String(value || "")



        .toLowerCase()



        .replace(/\u0451/g, "\u0435")



        .replace(/[!?.,;:()[\]{}"'`~]+/g, " ")



        .replace(/\s+/g, " ")



        .trim();



    }







    function normalizeChatQuickQuestionText(value) {



      return String(value === undefined || value === null ? "" : value)



        .replace(/\s+/g, " ")



        .trim()



        .slice(0, 160);



    }







    function normalizeChatQuickQuestionAnswer(value) {



      return String(value === undefined || value === null ? "" : value)



        .replace(/\s+\n/g, "\n")



        .trim()



        .slice(0, 1200);



    }







    function normalizeChatQuickQuestionEnabled(value, fallback) {



      if (value === undefined || value === null || value === "") return fallback !== false;



      if (typeof value === "boolean") return value;



      const normalized = String(value).trim().toLowerCase();



      if (!normalized) return fallback !== false;



      if (normalized === "1" || normalized === "true" || normalized === "on" || normalized === "yes") return true;



      if (normalized === "0" || normalized === "false" || normalized === "off" || normalized === "no") return false;



      const numeric = Number(normalized);



      if (Number.isFinite(numeric)) return numeric !== 0;



      return fallback !== false;



    }







    function normalizeChatQuickQuestionId(value, index) {



      const source = String(value || "")



        .trim()



        .toLowerCase()



        .replace(/[^a-z0-9_-]+/g, "-")



        .replace(/-{2,}/g, "-")



        .replace(/^[-_]+|[-_]+$/g, "")



        .slice(0, 48);



      if (source && source !== CHAT_QUICK_ORDER_ID) return source;



      return `custom-${index + 1}`;



    }







    function isOrderQuickQuestionLike(value) {



      const normalized = normalizeChatQuickQuestionKey(value);



      if (!normalized) return false;



      return normalized.includes("\u0433\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437")



        || normalized.includes("\u0433\u0434\u0435 \u0437\u0430\u043a\u0430\u0437");



    }







    function getDefaultQuickQuestionAnswer(value) {



      const key = normalizeChatQuickQuestionKey(value);



      if (key === "\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430") {



        return (



          "\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. " +



          "\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, " +



          "\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a."



        );



      }



      if (key === "\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430") {



        return (



          "\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, " +



          "\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c."



        );



      }



      if (key === "\u0434\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441") {



        return (



          "\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. " +



          "\u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435."



        );



      }



      return "";



    }







    function normalizeChatQuickQuestionItems(rawValue, options = {}) {



      const opts = options && typeof options === "object" ? options : {};



      const fallbackToDefault = opts.fallbackToDefault !== false;







      let parsed = [];



      if (Array.isArray(rawValue)) {



        parsed = rawValue;



      } else if (typeof rawValue === "string") {



        const trimmed = rawValue.trim();



        if (!trimmed) {



          parsed = [];



        } else {



          try {



            const next = JSON.parse(trimmed);



            parsed = Array.isArray(next) ? next : [];



          } catch {



            parsed = [];



          }



        }



      } else if (rawValue && typeof rawValue === "object" && Array.isArray(rawValue.items)) {



        parsed = rawValue.items;



      }







      if (!parsed.length && fallbackToDefault) {



        return cloneDefaultChatQuickQuestionItems();



      }







      const maxCustomItems = Math.max(0, CHAT_QUICK_QUESTIONS_MAX - 1);



      const customCandidates = [];



      let orderEnabled = true;



      let orderDefined = false;







      parsed.forEach((item, index) => {



        if (customCandidates.length >= maxCustomItems) return;







        if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {



          const question = normalizeChatQuickQuestionText(item);



          if (!question) return;



          if (index === 0 && isOrderQuickQuestionLike(question)) {



            orderDefined = true;



            orderEnabled = true;



            return;



          }



          customCandidates.push({



            id: "",



            question,



            answer: getDefaultQuickQuestionAnswer(question),



            enabled: true,



          });



          return;



        }







        if (!item || typeof item !== "object") return;



        const source = item;



        const question = normalizeChatQuickQuestionText(



          source.question ?? source.label ?? source.title ?? source.text ?? ""



        );



        const rawId = String(source.id ?? source.key ?? source.code ?? "").trim();



        const rawType = String(source.type ?? "").trim().toLowerCase();



        const isOrder = (



          rawId === CHAT_QUICK_ORDER_ID



          || rawType === CHAT_QUICK_ORDER_ID



          || normalizeChatQuickQuestionEnabled(source.is_order, false)



          || (index === 0 && isOrderQuickQuestionLike(question))



        );



        if (isOrder) {



          orderDefined = true;



          orderEnabled = normalizeChatQuickQuestionEnabled(



            source.enabled ?? source.is_enabled ?? source.active,



            true



          );



          return;



        }



        if (!question) return;



        const hasExplicitAnswer = (



          Object.prototype.hasOwnProperty.call(source, "answer")



          || Object.prototype.hasOwnProperty.call(source, "reply")



          || Object.prototype.hasOwnProperty.call(source, "response")



          || Object.prototype.hasOwnProperty.call(source, "message")



        );



        let answer = normalizeChatQuickQuestionAnswer(



          source.answer ?? source.reply ?? source.response ?? source.message ?? ""



        );



        if (!answer && !hasExplicitAnswer) answer = getDefaultQuickQuestionAnswer(question);



        customCandidates.push({



          id: rawId,



          question,



          answer,



          enabled: normalizeChatQuickQuestionEnabled(



            source.enabled ?? source.is_enabled ?? source.active,



            true



          ),



        });



      });







      const usedIds = new Set([CHAT_QUICK_ORDER_ID]);



      const customItems = [];



      customCandidates.slice(0, maxCustomItems).forEach((item, index) => {



        let id = normalizeChatQuickQuestionId(item.id, index);



        if (usedIds.has(id)) {



          let seq = index + 1;



          while (usedIds.has(`custom-${seq}`)) seq += 1;



          id = `custom-${seq}`;



        }



        usedIds.add(id);



        customItems.push({



          id,



          type: "custom",



          question: normalizeChatQuickQuestionText(item.question),



          answer: normalizeChatQuickQuestionAnswer(item.answer),



          enabled: item.enabled !== false,



        });



      });







      return [



        {



          id: CHAT_QUICK_ORDER_ID,



          type: "order",



          question: CHAT_QUICK_ORDER_QUESTION,



          answer: "",



          enabled: orderDefined ? orderEnabled !== false : true,



        },



        ...customItems,



      ];



    }







    function isSameChatQuickQuestionItems(a, b) {



      const left = Array.isArray(a) ? a : [];



      const right = Array.isArray(b) ? b : [];



      if (left.length !== right.length) return false;



      for (let idx = 0; idx < left.length; idx += 1) {



        const l = left[idx] || {};



        const r = right[idx] || {};



        if (String(l.id || "") !== String(r.id || "")) return false;



        if (String(l.type || "") !== String(r.type || "")) return false;



        if (normalizeChatQuickQuestionText(l.question) !== normalizeChatQuickQuestionText(r.question)) return false;



        if (normalizeChatQuickQuestionAnswer(l.answer) !== normalizeChatQuickQuestionAnswer(r.answer)) return false;



        if ((l.enabled !== false) !== (r.enabled !== false)) return false;



      }



      return true;



    }







    function serializeChatQuickQuestionItems(items) {



      return JSON.stringify(



        (Array.isArray(items) ? items : []).map((item) => ({



          id: String(item && item.id ? item.id : ""),



          type: String(item && item.type ? item.type : "custom"),



          question: normalizeChatQuickQuestionText(item && item.question ? item.question : ""),



          answer: normalizeChatQuickQuestionAnswer(item && item.answer ? item.answer : ""),



          enabled: item && item.enabled !== false,



        }))



      );



    }







    function getSettingsChatQuickQuestionRows() {



      if (!settingsChatHotQuestionsGrid) return [];



      return Array.from(settingsChatHotQuestionsGrid.querySelectorAll("[data-chat-quick-row]"));



    }







    function getChatQuickQuestionRowBody(row) {



      if (!row) return null;



      return row.querySelector("[data-chat-quick-body]");



    }







    function isChatQuickQuestionRowExpandable(row) {



      return !!getChatQuickQuestionRowBody(row);



    }







    function setChatQuickQuestionRowExpanded(row, expanded) {



      if (!row || !isChatQuickQuestionRowExpandable(row)) return;



      const body = getChatQuickQuestionRowBody(row);



      const expandBtn = row.querySelector("[data-chat-quick-expand]");



      const isExpanded = !!expanded;



      row.classList.toggle("is-expanded", isExpanded);



      row.classList.toggle("is-collapsed", !isExpanded);



      if (body) body.hidden = !isExpanded;



      if (expandBtn) {



        expandBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");



        expandBtn.setAttribute("title", isExpanded ? "Collapse" : "Expand");



      }



    }







    function toggleChatQuickQuestionRowExpanded(row) {



      if (!row || !isChatQuickQuestionRowExpandable(row)) return;



      const rows = getSettingsChatQuickQuestionRows().filter((item) => isChatQuickQuestionRowExpandable(item));



      const shouldExpand = !row.classList.contains("is-expanded");



      rows.forEach((item) => {



        if (item === row) return;



        setChatQuickQuestionRowExpanded(item, false);



      });



      setChatQuickQuestionRowExpanded(row, shouldExpand);



    }







    function setChatWelcomeExpanded(expanded) {



      if (!settingsChatWelcomeRow || !settingsChatWelcomeBody) return;



      const isExpanded = !!expanded;



      settingsChatWelcomeRow.classList.toggle("is-expanded", isExpanded);



      settingsChatWelcomeRow.classList.toggle("is-collapsed", !isExpanded);



      settingsChatWelcomeBody.hidden = !isExpanded;



      if (settingsChatWelcomeExpandBtn) {



        settingsChatWelcomeExpandBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");



        settingsChatWelcomeExpandBtn.setAttribute("title", isExpanded ? "Collapse" : "Expand");



      }



    }







    function toggleChatWelcomeExpanded() {



      if (!settingsChatWelcomeRow || !settingsChatWelcomeBody) return;



      if (!chatAssistantDraftMode) return;



      const shouldExpand = !settingsChatWelcomeRow.classList.contains("is-expanded");



      setChatWelcomeExpanded(shouldExpand);



    }







    function isChatWelcomeEnabledInUi() {



      return settingsChatWelcomeEnabledSwitch ? settingsChatWelcomeEnabledSwitch.checked : true;



    }







    function isChatQuickQuestionsEnabledInUi() {



      return settingsChatQuickQuestionsEnabledSwitch ? settingsChatQuickQuestionsEnabledSwitch.checked : true;



    }







    function updateChatQuickQuestionControlsState() {



      const quickControlsEnabled = chatAssistantDraftMode && isChatQuickQuestionsEnabledInUi();



      if (settingsChatQuickQuestionsAddBtn) {



        settingsChatQuickQuestionsAddBtn.disabled = !quickControlsEnabled;



      }



      if (!settingsChatQuickQuestionsAddBtn) return;



      const rows = getSettingsChatQuickQuestionRows();



      settingsChatQuickQuestionsAddBtn.disabled = !quickControlsEnabled || rows.length >= CHAT_QUICK_QUESTIONS_MAX;



    }







    function syncChatAssistantHierarchyUi() {



      const draftEnabled = chatAssistantDraftMode;



      if (settingsChatAssistantNameInput) {



        settingsChatAssistantNameInput.disabled = !draftEnabled;



        settingsChatAssistantNameInput.readOnly = !draftEnabled;



      }



      if (settingsChatAssistantGenderOptions) {



        settingsChatAssistantGenderOptions



          .querySelectorAll('input[name="settingsChatAssistantGender"]')



          .forEach((input) => {



            input.disabled = !draftEnabled;



          });



      }



      if (settingsChatWelcomeEnabledSwitch) {



        settingsChatWelcomeEnabledSwitch.disabled = !draftEnabled;



      }



      if (settingsChatWelcomeExpandBtn) {



        settingsChatWelcomeExpandBtn.disabled = !draftEnabled;



      }



      const welcomeEnabled = draftEnabled && isChatWelcomeEnabledInUi();



      if (settingsChatWelcomeSection) {



        settingsChatWelcomeSection.classList.toggle("is-disabled", !welcomeEnabled);



      }



      if (settingsChatWelcomeMessageInput) {



        settingsChatWelcomeMessageInput.disabled = !welcomeEnabled;



      }



      if (settingsChatQuickQuestionsEnabledSwitch) {



        settingsChatQuickQuestionsEnabledSwitch.disabled = !draftEnabled;



      }



      const quickEnabled = draftEnabled && isChatQuickQuestionsEnabledInUi();



      if (settingsChatQuickQuestionsSection) {



        settingsChatQuickQuestionsSection.classList.toggle("is-disabled", !quickEnabled);



      }



      if (settingsChatHotQuestionsGrid) {



        settingsChatHotQuestionsGrid.classList.toggle("is-disabled", !quickEnabled);



        settingsChatHotQuestionsGrid



          .querySelectorAll("input, textarea, button, select")



          .forEach((el) => {



            el.disabled = !quickEnabled;



          });



      }



      updateChatQuickQuestionControlsState();



    }







    function createChatQuickQuestionRow(item, index) {



      const rowItem = item && typeof item === "object" ? item : {};



      const type = String(rowItem.type || "").toLowerCase() === "order" ? "order" : "custom";



      const row = document.createElement("div");



      row.className = "settings-chat-question-row";



      if (type === "order") row.classList.add("is-system");



      row.setAttribute("data-chat-quick-row", "1");



      row.setAttribute("data-chat-quick-type", type);



      row.setAttribute("data-chat-quick-id", String(rowItem.id || (type === "order" ? CHAT_QUICK_ORDER_ID : "")));







      const header = document.createElement("div");



      header.className = "settings-chat-question-row-head";







      const questionInput = document.createElement("input");



      questionInput.className = "control settings-chat-question-input";



      questionInput.type = "text";



      questionInput.setAttribute("data-chat-quick-question", "1");



      questionInput.placeholder = type === "order"



        ? CHAT_QUICK_ORDER_QUESTION



        : `\u0412\u043e\u043f\u0440\u043e\u0441 ${index + 1}`;



      questionInput.value = type === "order"



        ? CHAT_QUICK_ORDER_QUESTION



        : normalizeChatQuickQuestionText(rowItem.question);



      if (type === "order") {



        questionInput.readOnly = true;



        questionInput.classList.add("is-readonly");



      }







      const controls = document.createElement("div");



      controls.className = "settings-chat-question-row-controls";







      let expandBtn = null;



      if (type !== "order") {



        expandBtn = document.createElement("button");



        expandBtn.type = "button";



        expandBtn.className = "settings-chat-question-expand-btn";



        expandBtn.setAttribute("data-chat-quick-expand", "1");



        expandBtn.setAttribute("aria-label", "Toggle answer");



        expandBtn.setAttribute("aria-expanded", "false");



        expandBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';



        expandBtn.addEventListener("click", (event) => {



          event.preventDefault();



          event.stopPropagation();



          toggleChatQuickQuestionRowExpanded(row);



        });



      }







      const switchLabel = document.createElement("label");



      switchLabel.className = "switch settings-chat-question-switch";



      const switchInput = document.createElement("input");



      switchInput.className = "switch-input";



      switchInput.type = "checkbox";



      switchInput.setAttribute("data-chat-quick-enabled", "1");



      switchInput.checked = rowItem.enabled !== false;



      const switchUi = document.createElement("span");



      switchUi.className = "switch-ui";



      switchUi.setAttribute("aria-hidden", "true");



      switchLabel.appendChild(switchInput);



      switchLabel.appendChild(switchUi);



      controls.appendChild(switchLabel);







      if (type !== "order") {



        const removeBtn = document.createElement("button");



        removeBtn.type = "button";



        removeBtn.className = "settings-chat-question-delete-btn";



        removeBtn.setAttribute("data-chat-quick-delete", "1");



        removeBtn.setAttribute("aria-label", "\u0423\u0434\u0430\u043b\u0438\u0442\u044c \u0432\u043e\u043f\u0440\u043e\u0441");



        removeBtn.innerHTML = '<i class="fas fa-times"></i>';



        removeBtn.addEventListener("click", () => {



          row.remove();



          updateChatQuickQuestionControlsState();



        });



        controls.appendChild(removeBtn);



      }







      if (expandBtn) header.appendChild(expandBtn);



      header.appendChild(questionInput);



      header.appendChild(controls);



      row.appendChild(header);







      if (type !== "order") {



        const body = document.createElement("div");



        body.className = "settings-chat-question-row-body";



        body.setAttribute("data-chat-quick-body", "1");



        const answerInput = document.createElement("textarea");



        answerInput.className = "textarea settings-chat-question-answer";



        answerInput.rows = 3;



        answerInput.setAttribute("data-chat-quick-answer", "1");



        answerInput.placeholder = "\u041e\u0442\u0432\u0435\u0442 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a\u0430";



        answerInput.value = normalizeChatQuickQuestionAnswer(rowItem.answer);



        body.appendChild(answerInput);



        row.appendChild(body);



        setChatQuickQuestionRowExpanded(row, false);



      }







      return row;



    }







    function renderChatQuickQuestionRows(items) {



      if (!settingsChatHotQuestionsGrid) return;



      settingsChatHotQuestionsGrid.innerHTML = "";



      const list = Array.isArray(items) ? items : [];



      list.forEach((item, index) => {



        settingsChatHotQuestionsGrid.appendChild(createChatQuickQuestionRow(item, index));



      });



      updateChatQuickQuestionControlsState();



      syncChatAssistantHierarchyUi();



    }







    function appendChatQuickQuestionRow() {



      if (!settingsChatHotQuestionsGrid) return null;



      if (!chatAssistantDraftMode) return null;



      if (!isChatQuickQuestionsEnabledInUi()) return null;



      const rows = getSettingsChatQuickQuestionRows();



      if (rows.length >= CHAT_QUICK_QUESTIONS_MAX) return null;



      const row = createChatQuickQuestionRow(



        {



          id: "",



          type: "custom",



          question: "",



          answer: "",



          enabled: true,



        },



        rows.length



      );



      settingsChatHotQuestionsGrid.appendChild(row);



      updateChatQuickQuestionControlsState();



      syncChatAssistantHierarchyUi();



      return row.querySelector("[data-chat-quick-question]");



    }







    function collectChatQuickQuestionsFromRows() {



      const rows = getSettingsChatQuickQuestionRows();



      const out = [];



      rows.forEach((row, index) => {



        const type = String(row.getAttribute("data-chat-quick-type") || "custom").toLowerCase();



        const enabledInput = row.querySelector("[data-chat-quick-enabled]");



        const enabled = enabledInput ? enabledInput.checked : true;



        if (type === "order") {



          out.push({



            id: CHAT_QUICK_ORDER_ID,



            type: "order",



            question: CHAT_QUICK_ORDER_QUESTION,



            answer: "",



            enabled,



          });



          return;



        }







        const questionInput = row.querySelector("[data-chat-quick-question]");



        const answerInput = row.querySelector("[data-chat-quick-answer]");



        const question = normalizeChatQuickQuestionText(questionInput ? questionInput.value : "");



        if (!question) return;



        const answer = normalizeChatQuickQuestionAnswer(answerInput ? answerInput.value : "");



        const rawId = row.getAttribute("data-chat-quick-id");



        out.push({



          id: normalizeChatQuickQuestionId(rawId, index),



          type: "custom",



          question,



          answer,



          enabled,



        });



      });







      return normalizeChatQuickQuestionItems(out, { fallbackToDefault: false });



    }







    function buildChatQuickQuestionsPayloadValue(items) {



      const normalizedItems = normalizeChatQuickQuestionItems(items, { fallbackToDefault: false });



      const defaultItems = cloneDefaultChatQuickQuestionItems();



      return isSameChatQuickQuestionItems(normalizedItems, defaultItems)



        ? null



        : serializeChatQuickQuestionItems(normalizedItems);



    }







    function applyChatQuickQuestionsToInputs(rawValue) {



      const items = normalizeChatQuickQuestionItems(rawValue, { fallbackToDefault: true });



      renderChatQuickQuestionRows(items);



      if (settingsChatQuickQuestionsJson) {



        settingsChatQuickQuestionsJson.value = serializeChatQuickQuestionItems(items);



      }



    }







    function getChatOperatorFallbackName() {



      const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;



      const name = tenant && tenant.name ? String(tenant.name).trim() : "";



      return name || "";



    }







    function updateChatSoundsOriginalFromCurrentForm() {



      chatSoundsOriginal = {



        sound_new_order_url: String((document.querySelector('[data-tenant-input="sound_new_order_url"]') || {}).value || ""),



        sound_order_cancelled_url: String((document.querySelector('[data-tenant-input="sound_order_cancelled_url"]') || {}).value || ""),



        sound_new_message_url: String((document.querySelector('[data-tenant-input="sound_new_message_url"]') || {}).value || "")



      };



    }







    function applyChatSoundsOriginalState() {



      const applyField = (key, value) => {



        const input = document.querySelector(`[data-tenant-input="${key}"]`);



        if (input) input.value = String(value || "");



        setSoundPreview(key, value || "");



      };



      applyField("sound_new_order_url", chatSoundsOriginal.sound_new_order_url);



      applyField("sound_order_cancelled_url", chatSoundsOriginal.sound_order_cancelled_url);



      applyField("sound_new_message_url", chatSoundsOriginal.sound_new_message_url);



    }







    function setChatSoundsDraftMode(enabled) {



      chatSoundsDraftMode = Boolean(enabled);



      document.querySelectorAll("[data-sound-upload], [data-sound-delete], [data-sound-play]").forEach((el) => {



        el.disabled = !chatSoundsDraftMode;



      });



      if (settingsSoundsFooterView) settingsSoundsFooterView.classList.toggle("hidden", chatSoundsDraftMode);



      if (settingsSoundsFooterEdit) settingsSoundsFooterEdit.classList.toggle("hidden", !chatSoundsDraftMode);



    }







    function updateChatAssistantOriginalFromCurrentForm() {



      chatAssistantOriginal = {



        chat_assistant_name: String((settingsChatAssistantNameInput && settingsChatAssistantNameInput.value) || ""),



        chat_assistant_gender: String(getSelectedChatAssistantGender() || DEFAULT_CHAT_ASSISTANT_GENDER),



        chat_welcome_message: String((settingsChatWelcomeMessageInput && settingsChatWelcomeMessageInput.value) || ""),



        chat_welcome_enabled: settingsChatWelcomeEnabledSwitch && settingsChatWelcomeEnabledSwitch.checked ? 1 : 0,



        chat_quick_questions_json: String((settingsChatQuickQuestionsJson && settingsChatQuickQuestionsJson.value) || ""),



        chat_quick_questions_enabled: settingsChatQuickQuestionsEnabledSwitch && settingsChatQuickQuestionsEnabledSwitch.checked ? 1 : 0



      };



    }







    function applyChatAssistantOriginalState() {



      if (settingsChatAssistantNameInput) {



        settingsChatAssistantNameInput.value = String(chatAssistantOriginal.chat_assistant_name || DEFAULT_CHAT_ASSISTANT_NAME);



      }



      setSelectedChatAssistantGender(



        chatAssistantOriginal.chat_assistant_gender || DEFAULT_CHAT_ASSISTANT_GENDER,



        { persist: false }



      );



      if (settingsChatWelcomeMessageInput) {



        settingsChatWelcomeMessageInput.value = String(



          chatAssistantOriginal.chat_welcome_message || DEFAULT_CHAT_WELCOME_MESSAGE



        );



      }



      if (settingsChatWelcomeEnabledSwitch) {



        settingsChatWelcomeEnabledSwitch.checked = Number(chatAssistantOriginal.chat_welcome_enabled || 0) === 1;



      }



      applyChatQuickQuestionsToInputs(chatAssistantOriginal.chat_quick_questions_json || null);



      if (settingsChatQuickQuestionsEnabledSwitch) {



        settingsChatQuickQuestionsEnabledSwitch.checked = Number(chatAssistantOriginal.chat_quick_questions_enabled || 0) === 1;



      }



      syncChatAssistantHierarchyUi();



    }







    function setChatAssistantDraftMode(enabled) {



      chatAssistantDraftMode = Boolean(enabled);



      if (settingsChatAssistantFooterView) settingsChatAssistantFooterView.classList.toggle("hidden", chatAssistantDraftMode);



      if (settingsChatAssistantFooterEdit) settingsChatAssistantFooterEdit.classList.toggle("hidden", !chatAssistantDraftMode);



      syncChatAssistantHierarchyUi();



    }







    function updateChatOperatorOriginalFromCurrentForm() {



      chatOperatorOriginal = {



        chat_operator_name: String((settingsChatOperatorNameInput && settingsChatOperatorNameInput.value) || "")



      };



    }







    function applyChatOperatorOriginalState() {



      if (settingsChatOperatorNameInput) {



        settingsChatOperatorNameInput.value = String(chatOperatorOriginal.chat_operator_name || "");



      }



    }







    function setChatOperatorDraftMode(enabled) {



      chatOperatorDraftMode = Boolean(enabled);



      if (settingsChatOperatorNameInput) {



        settingsChatOperatorNameInput.disabled = !chatOperatorDraftMode;



        settingsChatOperatorNameInput.readOnly = !chatOperatorDraftMode;



      }



      if (settingsChatOperatorFooterView) settingsChatOperatorFooterView.classList.toggle("hidden", chatOperatorDraftMode);



      if (settingsChatOperatorFooterEdit) settingsChatOperatorFooterEdit.classList.toggle("hidden", !chatOperatorDraftMode);



    }







    function updateChatMessageOriginalFromCurrentForm() {



      chatMessageOriginal = {



        chat_thread_ttl_days: String((settingsChatThreadTtlDaysInput && settingsChatThreadTtlDaysInput.value) || "0"),



        chat_guest_thread_ttl_days: String((settingsChatGuestThreadTtlDaysInput && settingsChatGuestThreadTtlDaysInput.value) || "7")



      };



    }







    function applyChatMessageOriginalState() {



      if (settingsChatThreadTtlDaysInput) {



        settingsChatThreadTtlDaysInput.value = String(chatMessageOriginal.chat_thread_ttl_days || "0");



      }



      if (settingsChatGuestThreadTtlDaysInput) {



        settingsChatGuestThreadTtlDaysInput.value = String(chatMessageOriginal.chat_guest_thread_ttl_days || "7");



      }



    }







    function setChatMessageDraftMode(enabled) {



      chatMessageDraftMode = Boolean(enabled);



      if (settingsChatThreadTtlDaysInput) {



        settingsChatThreadTtlDaysInput.disabled = !chatMessageDraftMode;



        settingsChatThreadTtlDaysInput.readOnly = !chatMessageDraftMode;



      }



      if (settingsChatGuestThreadTtlDaysInput) {



        settingsChatGuestThreadTtlDaysInput.disabled = !chatMessageDraftMode;



        settingsChatGuestThreadTtlDaysInput.readOnly = !chatMessageDraftMode;



      }



      if (settingsChatMessageFooterView) settingsChatMessageFooterView.classList.toggle("hidden", chatMessageDraftMode);



      if (settingsChatMessageFooterEdit) settingsChatMessageFooterEdit.classList.toggle("hidden", !chatMessageDraftMode);



    }







    applyChatQuickQuestionsToInputs(null);



    setSelectedChatAssistantGender(readStoredChatAssistantGender() || DEFAULT_CHAT_ASSISTANT_GENDER, { persist: false });



    setChatWelcomeExpanded(false);



    syncChatAssistantHierarchyUi();







    function applyChatSettingsFromTenant(tenant) {



      const assistantValue = tenant && tenant.chat_assistant_name ? String(tenant.chat_assistant_name).trim() : "";



      if (settingsChatAssistantNameInput) {



        settingsChatAssistantNameInput.value = assistantValue || DEFAULT_CHAT_ASSISTANT_NAME;



      }







      const tenantGenderRaw = tenant ? tenant.chat_assistant_gender : undefined;



      const tenantGenderPresent = !(



        tenantGenderRaw === undefined



        || tenantGenderRaw === null



        || String(tenantGenderRaw).trim() === ""



      );



      setSelectedChatAssistantGender(



        tenantGenderPresent



          ? tenantGenderRaw



          : (readStoredChatAssistantGender() || getSelectedChatAssistantGender())



      );







      const welcomeValueRaw = tenant && tenant.chat_welcome_message != null



        ? String(tenant.chat_welcome_message)



        : "";



      const welcomeValue = welcomeValueRaw.trim();



      if (settingsChatWelcomeMessageInput) {



        settingsChatWelcomeMessageInput.value = welcomeValue || DEFAULT_CHAT_WELCOME_MESSAGE;



      }



      if (settingsChatWelcomeEnabledSwitch) {



        settingsChatWelcomeEnabledSwitch.checked = normalizeChatWelcomeEnabledValue(



          tenant ? tenant.chat_welcome_enabled : undefined



        );



      }



      const operatorFallback = getChatOperatorFallbackName() || "\u041e\u043f\u0435\u0440\u0430\u0442\u043e\u0440";



      if (settingsChatOperatorNameInput) {



        settingsChatOperatorNameInput.placeholder = operatorFallback;



        const customValue = tenant && tenant.chat_operator_name ? String(tenant.chat_operator_name).trim() : "";



        settingsChatOperatorNameInput.value = customValue || operatorFallback;



      }



      if (settingsChatWidgetEnabledSwitch) {



        settingsChatWidgetEnabledSwitch.checked = normalizeChatWidgetEnabledValue(



          tenant ? tenant.chat_widget_enabled : undefined



        );



      }







      if (settingsChatThreadTtlDaysInput) {



        const ttlDaysRaw = tenant ? tenant.chat_thread_ttl_days : undefined;



        settingsChatThreadTtlDaysInput.value = String(normalizeChatThreadTtlDays(ttlDaysRaw));



      }



      if (settingsChatGuestThreadTtlDaysInput) {



        const ttlDaysRaw = tenant ? tenant.chat_guest_thread_ttl_days : undefined;



        settingsChatGuestThreadTtlDaysInput.value = String(normalizeChatGuestThreadTtlDays(ttlDaysRaw));



      }







      applyChatQuickQuestionsToInputs(



        tenant



          ? (tenant.quick_questions_config ?? tenant.chat_quick_questions_json)



          : null



      );



      if (settingsChatQuickQuestionsEnabledSwitch) {



        settingsChatQuickQuestionsEnabledSwitch.checked = normalizeChatQuickQuestionsEnabledValue(



          tenant ? tenant.chat_quick_questions_enabled : undefined



        );



      }



      syncChatAssistantHierarchyUi();



      if (!chatAssistantDraftMode) {



        updateChatAssistantOriginalFromCurrentForm();



      }



      if (!chatOperatorDraftMode) {



        updateChatOperatorOriginalFromCurrentForm();



      }



      if (!chatMessageDraftMode) {



        updateChatMessageOriginalFromCurrentForm();



      }



    }







    if (typeof window !== "undefined") {



      window.__applyChatSettingsFromTenant = applyChatSettingsFromTenant;



    }



    loadTenantProfile();







    function getDayKey(day) {



      return day === null ? STORE_HOURS_GLOBAL_KEY : `day-${day}`;



    }







    function getDefaultHoursEntry() {



      return { opens_at: "", closes_at: "", is_closed: false };



    }







    function getHoursEntry(key) {



      return storeHoursState.values[key] || getDefaultHoursEntry();



    }







    function updateHoursEntry(key, updates) {



      const next = { ...getHoursEntry(key), ...updates };



      storeHoursState.values[key] = next;



    }







    function ensureGlobalHoursEntry() {



      const key = STORE_HOURS_GLOBAL_KEY;



      if (!storeHoursState.values[key]) {



        const fallbackKey = getDayKey(STORE_HOUR_DAY_ORDER[0]);



        storeHoursState.values[key] = { ...getHoursEntry(fallbackKey) };



      }



      return storeHoursState.values[key];



    }







    function renderStoreHoursRows() {



      if (!settingsStoreHoursContainer) return;



      settingsStoreHoursContainer.innerHTML = "";



      const rows = storeHoursState.useGlobal



        ? [{ day: null, label: "Ежедневно" }]



        : STORE_HOUR_DAY_ORDER.map((day) => ({



            day,



            label: STORE_DAY_LABELS[day] || String(day)



          }));



      rows.forEach((config) => {



        const key = getDayKey(config.day);



        const entry = getHoursEntry(key);



        const row = document.createElement("div");



        row.className = "store-hours-row";



        if (config.day === null) {



          row.classList.add("store-hours-row--global");



        }



        row.dataset.day = config.day === null ? "global" : String(config.day);







        const dayLabel = document.createElement("div");



        dayLabel.className = "store-hours-day";



        dayLabel.textContent = config.label;







        const inputsWrap = document.createElement("div");



        inputsWrap.className = "store-hours-inputs";







        const openInput = document.createElement("input");



        openInput.type = "time";



        openInput.className = "control store-hours-input";



        openInput.value = entry.opens_at || "";



        openInput.disabled = entry.is_closed;



        openInput.addEventListener("input", () => {



          updateHoursEntry(key, { opens_at: openInput.value });



        });







        const closeInput = document.createElement("input");



        closeInput.type = "time";



        closeInput.className = "control store-hours-input";



        closeInput.value = entry.closes_at || "";



        closeInput.disabled = entry.is_closed;



        closeInput.addEventListener("input", () => {



          updateHoursEntry(key, { closes_at: closeInput.value });



        });







        inputsWrap.appendChild(openInput);



        inputsWrap.appendChild(closeInput);







        const closedSwitch = createSwitch("", entry.is_closed, (checked) => {



          updateHoursEntry(key, { is_closed: checked });



          openInput.disabled = checked;



          closeInput.disabled = checked;



        });



        closedSwitch.classList.add("store-hours-switch-control");



        const switchWrap = document.createElement("div");



        switchWrap.className = "store-hours-switch-wrap";



        const switchLabel = document.createElement("div");



        switchLabel.className = "store-hours-switch-text";



        switchLabel.textContent = "Выходной";



        switchWrap.appendChild(closedSwitch);



        switchWrap.appendChild(switchLabel);







        row.appendChild(dayLabel);



        row.appendChild(inputsWrap);



        if (config.day !== null) {



          row.appendChild(switchWrap);



        } else {



          row.dataset.noSwitch = "1";



        }



        settingsStoreHoursContainer.appendChild(row);



    });



    }







    function getDeliveryHoursEntry(key) {



      return deliveryHoursState.values[key] || getDefaultHoursEntry();



    }







    function updateDeliveryHoursEntry(key, updates) {



      const next = { ...getDeliveryHoursEntry(key), ...updates };



      deliveryHoursState.values[key] = next;



    }







    function ensureDeliveryGlobalEntry() {



      const key = STORE_HOURS_GLOBAL_KEY;



      if (!deliveryHoursState.values[key]) {



        const fallbackKey = getDayKey(STORE_HOUR_DAY_ORDER[0]);



        deliveryHoursState.values[key] = { ...getDeliveryHoursEntry(fallbackKey) };



      }



      return deliveryHoursState.values[key];



    }







    function renderDeliveryHoursRows() {



      if (!settingsStoreDeliveryHoursContainer) return;



      settingsStoreDeliveryHoursContainer.innerHTML = "";



      const rows = deliveryHoursState.useGlobal



        ? [{ day: null, label: "Ежедневно" }]



        : STORE_HOUR_DAY_ORDER.map((day) => ({



            day,



            label: STORE_DAY_LABELS[day] || String(day)



          }));



      rows.forEach((config) => {



        const key = getDayKey(config.day);



        const entry = getDeliveryHoursEntry(key);



        const row = document.createElement("div");



        row.className = "store-hours-row";



        if (config.day === null) {



          row.classList.add("store-hours-row--global");



        }



        row.dataset.day = config.day === null ? "global" : String(config.day);







        const dayLabel = document.createElement("div");



        dayLabel.className = "store-hours-day";



        dayLabel.textContent = config.label;







        const inputsWrap = document.createElement("div");



        inputsWrap.className = "store-hours-inputs";







        const openInput = document.createElement("input");



        openInput.type = "time";



        openInput.className = "control store-hours-input";



        openInput.value = entry.opens_at || "";



        openInput.disabled = entry.is_closed;



        openInput.addEventListener("input", () => {



          updateDeliveryHoursEntry(key, { opens_at: openInput.value });



        });







        const closeInput = document.createElement("input");



        closeInput.type = "time";



        closeInput.className = "control store-hours-input";



        closeInput.value = entry.closes_at || "";



        closeInput.disabled = entry.is_closed;



        closeInput.addEventListener("input", () => {



          updateDeliveryHoursEntry(key, { closes_at: closeInput.value });



        });







        inputsWrap.appendChild(openInput);



        inputsWrap.appendChild(closeInput);







        const closedSwitch = createSwitch("", entry.is_closed, (checked) => {



          updateDeliveryHoursEntry(key, { is_closed: checked });



          openInput.disabled = checked;



          closeInput.disabled = checked;



        });



        closedSwitch.classList.add("store-hours-switch-control");



        const switchWrap = document.createElement("div");



        switchWrap.className = "store-hours-switch-wrap";



        const switchLabel = document.createElement("div");



        switchLabel.className = "store-hours-switch-text";



        switchLabel.textContent = "Выходной";



        switchWrap.appendChild(closedSwitch);



        switchWrap.appendChild(switchLabel);







        row.appendChild(dayLabel);



        row.appendChild(inputsWrap);



        if (config.day !== null) {



          row.appendChild(switchWrap);



        } else {



          row.dataset.noSwitch = "1";



        }



        settingsStoreDeliveryHoursContainer.appendChild(row);



      });



    }







    function setStoreHoursUseGlobal(flag) {



      storeHoursState.useGlobal = Boolean(flag);



      if (storeHoursState.useGlobal) {



        ensureGlobalHoursEntry();



      }



      if (settingsStoreHoursSwitch) {



        settingsStoreHoursSwitch.checked = storeHoursState.useGlobal;



      }



      renderStoreHoursRows();



    }







    function setDeliveryHoursUseGlobal(flag) {



      deliveryHoursState.useGlobal = Boolean(flag);



      if (deliveryHoursState.useGlobal) {



        ensureDeliveryGlobalEntry();



      }



      if (settingsStoreDeliveryHoursSwitch) {



        settingsStoreDeliveryHoursSwitch.checked = deliveryHoursState.useGlobal;



      }



      renderDeliveryHoursRows();



    }







    function applyStoreHours(store) {



      storeHoursState.values = {};



      if (Array.isArray(store?.hours)) {



        store.hours.forEach((hour) => {



          const day = Number(hour.day_of_week);



          if (!Number.isFinite(day)) return;



          storeHoursState.values[getDayKey(day)] = {



            opens_at: hour.opens_at || "",



            closes_at: hour.closes_at || "",



            is_closed: Number(hour.is_closed) === 1



          };



        });



      }



      storeHoursState.useGlobal = Number(store?.use_global_hours) === 1;



      if (storeHoursState.useGlobal) {



        ensureGlobalHoursEntry();



      }



      if (settingsStoreHoursSwitch) {



        settingsStoreHoursSwitch.checked = storeHoursState.useGlobal;



      }



      renderStoreHoursRows();



    }







    function applyDeliveryHours(store) {



      deliveryHoursState.values = {};



      if (Array.isArray(store?.delivery_hours)) {



        store.delivery_hours.forEach((hour) => {



          const day = Number(hour.day_of_week);



          if (!Number.isFinite(day)) return;



          deliveryHoursState.values[getDayKey(day)] = {



            opens_at: hour.opens_at || "",



            closes_at: hour.closes_at || "",



            is_closed: Number(hour.is_closed) === 1



          };



        });



      }



      deliveryHoursState.useGlobal = Number(store?.use_delivery_hours) === 1;



      if (deliveryHoursState.useGlobal) {



        ensureDeliveryGlobalEntry();



      }



      if (settingsStoreDeliveryHoursSwitch) {



        settingsStoreDeliveryHoursSwitch.checked = deliveryHoursState.useGlobal;



      }



      renderDeliveryHoursRows();



    }







    function resetStoreHoursState() {



      storeHoursState.useGlobal = false;



      storeHoursState.values = {};



      if (settingsStoreHoursSwitch) {



        settingsStoreHoursSwitch.checked = false;



      }



      renderStoreHoursRows();



    }







    function resetDeliveryHoursState() {



      deliveryHoursState.useGlobal = false;



      deliveryHoursState.values = {};



      if (settingsStoreDeliveryHoursSwitch) {



        settingsStoreDeliveryHoursSwitch.checked = false;



      }



      renderDeliveryHoursRows();



    }







    function buildStoreHoursPayload() {



      const entries = [];



      const baseOrder = STORE_HOUR_DAY_ORDER;



      const globalEntry = storeHoursState.values[STORE_HOURS_GLOBAL_KEY] || getDefaultHoursEntry();



      baseOrder.forEach((day) => {



        const key = storeHoursState.useGlobal ? STORE_HOURS_GLOBAL_KEY : getDayKey(day);



        const entry = storeHoursState.useGlobal ? globalEntry : getHoursEntry(key);



        entries.push({



          day_of_week: day,



          opens_at: entry.opens_at || null,



          closes_at: entry.closes_at || null,



          is_closed: entry.is_closed ? 1 : 0



        });



      });



      return entries;



    }







    function buildDeliveryHoursPayload() {



      const entries = [];



      const baseOrder = STORE_HOUR_DAY_ORDER;



      const globalEntry = deliveryHoursState.values[STORE_HOURS_GLOBAL_KEY] || getDefaultHoursEntry();



      baseOrder.forEach((day) => {



        const key = deliveryHoursState.useGlobal ? STORE_HOURS_GLOBAL_KEY : getDayKey(day);



        const entry = deliveryHoursState.useGlobal ? globalEntry : getDeliveryHoursEntry(key);



        entries.push({



          day_of_week: day,



          opens_at: entry.opens_at || null,



          closes_at: entry.closes_at || null,



          is_closed: entry.is_closed ? 1 : 0



        });



      });



      return entries;



    }







    async function loadSystemPollingSettings() {



      try {



        const res = await authFetch("/api/admin/system/polling");



        const data = await res.json();



        if (!data || !data.ok || !data.data) return;



        if (settingsPollingEnvEnabled) {



          settingsPollingEnvEnabled.checked = Boolean(data.data.telegram_env_enabled);



        }



        if (settingsPollingTenantEnabled) {



          settingsPollingTenantEnabled.checked = Boolean(data.data.telegram_tenant_enabled);



        }



      } catch (err) {



        console.error("Failed to load system polling settings:", err);



      }



    }







    async function loadSystemTelegramSettings() {



      try {



        const res = await authFetch("/api/admin/system/telegram-bot");



        const data = await res.json();



        if (!data || !data.ok || !data.data) return;



        systemTelegramOriginal = {



          telegram_bot_username: String(data.data.telegram_bot_username || ""),



          telegram_bot_token: String(data.data.telegram_bot_token || ""),



          telegram_webhook_url: String(data.data.telegram_webhook_url || ""),



          telegram_env_enabled: Boolean(data.data.telegram_env_enabled),



          telegram_tenant_enabled: Boolean(data.data.telegram_tenant_enabled)



        };



        systemTelegramDraft = { ...systemTelegramOriginal };



        applySystemTelegramFormValues(systemTelegramOriginal);



        setSystemTelegramDraftMode(false);



      } catch (err) {



        console.error("Failed to load system telegram settings:", err);



      }



    }







    async function saveSystemPollingSettings(payload) {



      try {



        const res = await authFetch("/api/admin/system/polling", {



          method: "PUT",



          body: JSON.stringify(payload || {})



        });



        const data = await res.json();



        if (!data || !data.ok || !data.data) return null;



        if (settingsPollingEnvEnabled) {



          settingsPollingEnvEnabled.checked = Boolean(data.data.telegram_env_enabled);



        }



        if (settingsPollingTenantEnabled) {



          settingsPollingTenantEnabled.checked = Boolean(data.data.telegram_tenant_enabled);



        }



        return data.data;



      } catch (err) {



        console.error("Failed to save system polling settings:", err);



        return null;



      }



    }







    async function saveSystemTelegramSettings(payload) {



      try {



        const res = await authFetch("/api/admin/system/telegram-bot", {



          method: "PUT",



          body: JSON.stringify(payload || {})



        });



        const data = await res.json();



        if (!data || !data.ok || !data.data) return null;



        systemTelegramOriginal = {



          telegram_bot_username: String(data.data.telegram_bot_username || ""),



          telegram_bot_token: String(data.data.telegram_bot_token || ""),



          telegram_webhook_url: String(data.data.telegram_webhook_url || ""),



          telegram_env_enabled: Boolean(data.data.telegram_env_enabled),



          telegram_tenant_enabled: Boolean(data.data.telegram_tenant_enabled)



        };



        systemTelegramDraft = { ...systemTelegramOriginal };



        applySystemTelegramFormValues(systemTelegramOriginal);



        setSystemTelegramDraftMode(false);



        return data.data;



      } catch (err) {



        console.error("Failed to save system telegram settings:", err);



        return null;



      }



    }







    async function loadSystemMaxSettings() {

      try {

        const res = await authFetch("/api/admin/system/max-bot");

        const data = await res.json();

        if (!data || !data.ok || !data.data) return;

        systemMaxOriginal = {

          max_bot_id: String(data.data.max_bot_id || ""),

          max_bot_token: String(data.data.max_bot_token || ""),

          max_webhook_url: String(data.data.max_webhook_url || ""),

          max_env_enabled: Boolean(data.data.max_env_enabled)

        };

        systemMaxDraft = { ...systemMaxOriginal };

        applySystemMaxFormValues(systemMaxOriginal);

        setSystemMaxDraftMode(false);

      } catch (err) {

        console.error("Failed to load system MAX settings:", err);

      }

    }

    async function saveSystemMaxSettings(payload) {

      try {

        const res = await authFetch("/api/admin/system/max-bot", {

          method: "PUT",

          body: JSON.stringify(payload || {})

        });

        const data = await res.json();

        if (!data || !data.ok || !data.data) return null;

        systemMaxOriginal = {

          max_bot_id: String(data.data.max_bot_id || ""),

          max_bot_token: String(data.data.max_bot_token || ""),

          max_webhook_url: String(data.data.max_webhook_url || ""),

          max_env_enabled: Boolean(data.data.max_env_enabled)

        };

        systemMaxDraft = { ...systemMaxOriginal };

        applySystemMaxFormValues(systemMaxOriginal);

        setSystemMaxDraftMode(false);

        return data.data;

      } catch (err) {

        console.error("Failed to save system MAX settings:", err);

        return null;

      }

    }

    function normalizeSystemMapConfig(values) {



      const source = values && typeof values === "object" ? values : {};



      const providerName = String(source.provider_name || "").trim();



      const tileUrl = String(source.tile_url || "").trim();



      const attribution = String(source.attribution || "").trim();



      const subdomains = String(source.subdomains || "").trim();



      const hasPrimaryConfig = Boolean(providerName || tileUrl || attribution || subdomains);



      const maxZoomRaw = source.max_zoom;



      const maxZoomValue = !hasPrimaryConfig



        ? ""



        : (maxZoomRaw == null || maxZoomRaw === "" ? 22 : Number(maxZoomRaw));



      const geocoderProviderName = String(source.geocoder_provider_name || "").trim();



      const geocoderSearchUrl = String(source.geocoder_search_url || "").trim();



      const geocoderCountryCode = String(source.geocoder_country_code || "").trim() || "ru";



      const geocoderLanguage = String(source.geocoder_language || "").trim() || "ru";



      const geocoderResultLimitRaw = source.geocoder_result_limit;



      const geocoderResultLimitValue = geocoderResultLimitRaw == null || geocoderResultLimitRaw === ""



        ? 5



        : Number(geocoderResultLimitRaw);



      const storeAddressMapEnabled = Boolean(source.store_address_map_enabled);



      const tenantApiKeyRequired = Boolean(source.tenant_api_key_required);



      const tenantApiKeyConfigured = Boolean(source.tenant_api_key_configured);



      const tenantApiKeyMissing = Boolean(source.tenant_api_key_missing);



      const tenantActiveAccountId = String(source.tenant_active_account_id || "").trim();



      const tenantTileUrlResolved = Boolean(source.tenant_tile_url_resolved);



      const deliveryZonePolygonProvider = String(source.delivery_zone_polygon_provider || "").trim() || "Leaflet-Geoman";



      return {



        provider_name: providerName,



        tile_url: tileUrl,



        attribution,



        max_zoom: maxZoomValue === ""



          ? ""



          : (Number.isFinite(maxZoomValue) ? Math.max(0, Math.min(22, Math.round(maxZoomValue))) : 22),



        subdomains,



        geocoder_provider_name: geocoderProviderName,



        geocoder_search_url: geocoderSearchUrl,



        geocoder_country_code: geocoderCountryCode,



        geocoder_language: geocoderLanguage,



        geocoder_result_limit: Number.isFinite(geocoderResultLimitValue)



          ? Math.max(1, Math.min(10, Math.round(geocoderResultLimitValue)))



          : 5,



        store_address_map_enabled: storeAddressMapEnabled,



        tenant_api_key_required: tenantApiKeyRequired,



        tenant_api_key_configured: tenantApiKeyConfigured,



        tenant_api_key_missing: tenantApiKeyMissing,



        tenant_active_account_id: tenantActiveAccountId,



        tenant_tile_url_resolved: tenantTileUrlResolved,



        delivery_zone_polygon_provider: deliveryZonePolygonProvider,



      };



    }







    function normalizeSystemDeliveryZonePolygonConfig(values) {



      const source = values && typeof values === "object" ? values : {};



      const provider = String(



        source.delivery_zone_polygon_provider



        || source.provider



        || ""



      ).trim() || "Leaflet-Geoman";



      return {



        delivery_zone_polygon_provider: provider,



        delivery_zone_polygon_enabled: Boolean(source.delivery_zone_polygon_enabled),



      };



    }







    function isStoreAddressMapModeEnabled(config = null) {



      if (config && typeof config === "object") {



        return Boolean(config.store_address_map_enabled);



      }



      if (systemMapDraftMode) {



        return Boolean(systemMapDraft && systemMapDraft.store_address_map_enabled);



      }



      return Boolean(storeAddressMapModeCache || (systemMapOriginal && systemMapOriginal.store_address_map_enabled));



    }







    function isDeliveryZoneFeatureAvailable(config = null) {



      return isStoreAddressMapModeEnabled(config);



    }







    function hasConfiguredMap(config) {



      return Boolean(config && String(config.tile_url || "").trim());



    }







    function hasConfiguredMapGeocoder(config) {



      return Boolean(config && String(config.geocoder_search_url || "").trim());



    }







    function buildMapNotConfiguredMessage(config, mode = "preview") {



      const normalized = config && typeof config === "object" ? config : {};



      if (normalized.tenant_api_key_missing) {



        return mode === "store"



          ? "Добавьте и выберите активный API key РІ разделе «Доставка -> Настройка карты», чтобы открыть карту филиала."



          : "Добавьте и выберите активный API key РІ разделе «Доставка -> Настройка карты», чтобы показать подложку здесь.";



      }



      return mode === "store"



        ? "Сначала настройте карту РІ разделе «Системные -> Карта»."



        : "Заполните параметры провайдера РІ разделе «Системные -> Карта», чтобы показать подложку здесь.";



    }







    async function fetchTenantMapConfig() {



      try {



        const res = await authFetch("/api/admin/tenant/map-provider-config");



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось загрузить resolved-конфигурацию карты tenant:", err);



        return null;



      }



    }







    async function syncStoreAddressModeFromTenantConfig(forceReload = false) {



      if (systemMapDraftMode) {



        storeAddressMapModeCache = Boolean(systemMapDraft && systemMapDraft.store_address_map_enabled);



        applyStoreAddressModeUi();



        syncStoreAddressInputAvailability();



        return storeAddressMapModeCache;



      }



      let config = null;



      if (!forceReload && deliveryMapConfigCache) {



        config = normalizeSystemMapConfig(deliveryMapConfigCache);



      } else {



        const data = await fetchTenantMapConfig();



        config = normalizeSystemMapConfig(data && data.data ? data.data : null);



        deliveryMapConfigCache = { ...config };



      }



      storeAddressMapModeCache = Boolean(config && config.store_address_map_enabled);



      applyStoreAddressModeUi();



      syncStoreAddressInputAvailability();



      return storeAddressMapModeCache;



    }







    function parseMapSubdomains(value) {



      const raw = String(value || "").trim();



      if (!raw) return [];



      return raw



        .split(",")



        .map((item) => item.trim())



        .filter(Boolean);



    }







    function resetSystemMapCancelButton() {



      if (!settingsSystemMapCancelBtn) return;



      systemMapCancelConfirm = false;



      settingsSystemMapCancelBtn.classList.remove("is-confirm");



      settingsSystemMapCancelBtn.title = "Отменить";



      settingsSystemMapCancelBtn.setAttribute("aria-label", "Отменить");



      settingsSystemMapCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function resetSystemDeliveryZonePolygonCancelButton() {



      if (!settingsSystemDeliveryZonePolygonCancelBtn) return;



      systemDeliveryZonePolygonCancelConfirm = false;



      settingsSystemDeliveryZonePolygonCancelBtn.classList.remove("is-confirm");



      settingsSystemDeliveryZonePolygonCancelBtn.title = "Отменить";



      settingsSystemDeliveryZonePolygonCancelBtn.setAttribute("aria-label", "Отменить");



      settingsSystemDeliveryZonePolygonCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function readSystemDeliveryZonePolygonFormValues() {



      return {



        delivery_zone_polygon_provider: String((settingsSystemDeliveryZonePolygonProvider && settingsSystemDeliveryZonePolygonProvider.value) || "").trim(),



        delivery_zone_polygon_enabled: Boolean(settingsSystemDeliveryZonePolygonEnabled && settingsSystemDeliveryZonePolygonEnabled.checked),



      };



    }







    function applySystemDeliveryZonePolygonFormValues(values) {



      const config = normalizeSystemDeliveryZonePolygonConfig(values);



      if (settingsSystemDeliveryZonePolygonProvider) settingsSystemDeliveryZonePolygonProvider.value = config.delivery_zone_polygon_provider;



      if (settingsSystemDeliveryZonePolygonEnabled) settingsSystemDeliveryZonePolygonEnabled.checked = Boolean(config.delivery_zone_polygon_enabled);



    }







    function readSystemMapFormValues() {



      return {



        provider_name: String((settingsSystemMapProviderName && settingsSystemMapProviderName.value) || "").trim(),



        tile_url: String((settingsSystemMapTileUrl && settingsSystemMapTileUrl.value) || "").trim(),



        attribution: String((settingsSystemMapAttribution && settingsSystemMapAttribution.value) || "").trim(),



        max_zoom: String((settingsSystemMapMaxZoom && settingsSystemMapMaxZoom.value) || "").trim(),



        subdomains: String((settingsSystemMapSubdomains && settingsSystemMapSubdomains.value) || "").trim(),



        geocoder_provider_name: String((settingsSystemMapGeocoderProviderName && settingsSystemMapGeocoderProviderName.value) || "").trim(),



        geocoder_search_url: String((settingsSystemMapGeocoderSearchUrl && settingsSystemMapGeocoderSearchUrl.value) || "").trim(),



        geocoder_country_code: String((settingsSystemMapGeocoderCountryCode && settingsSystemMapGeocoderCountryCode.value) || "").trim(),



        geocoder_language: String((settingsSystemMapGeocoderLanguage && settingsSystemMapGeocoderLanguage.value) || "").trim(),



        geocoder_result_limit: String((settingsSystemMapGeocoderResultLimit && settingsSystemMapGeocoderResultLimit.value) || "").trim(),



        store_address_map_enabled: Boolean(settingsSystemMapStoreAddressEnabled && settingsSystemMapStoreAddressEnabled.checked),



        delivery_zone_polygon_provider: String((settingsSystemMapPolygonProvider && settingsSystemMapPolygonProvider.value) || "").trim(),



      };



    }







    function applySystemMapFormValues(values) {



      const config = normalizeSystemMapConfig(values);



      if (settingsSystemMapProviderName) settingsSystemMapProviderName.value = config.provider_name;



      if (settingsSystemMapTileUrl) settingsSystemMapTileUrl.value = config.tile_url;



      if (settingsSystemMapAttribution) settingsSystemMapAttribution.value = config.attribution;



      if (settingsSystemMapMaxZoom) settingsSystemMapMaxZoom.value = String(config.max_zoom);



      if (settingsSystemMapSubdomains) settingsSystemMapSubdomains.value = config.subdomains;



      if (settingsSystemMapGeocoderProviderName) settingsSystemMapGeocoderProviderName.value = config.geocoder_provider_name;



      if (settingsSystemMapGeocoderSearchUrl) settingsSystemMapGeocoderSearchUrl.value = config.geocoder_search_url;



      if (settingsSystemMapGeocoderCountryCode) settingsSystemMapGeocoderCountryCode.value = config.geocoder_country_code;



      if (settingsSystemMapGeocoderLanguage) settingsSystemMapGeocoderLanguage.value = config.geocoder_language;



      if (settingsSystemMapGeocoderResultLimit) settingsSystemMapGeocoderResultLimit.value = String(config.geocoder_result_limit);



      if (settingsSystemMapStoreAddressEnabled) settingsSystemMapStoreAddressEnabled.checked = Boolean(config.store_address_map_enabled);



      ensureSystemMapPolygonField();



      if (settingsSystemMapPolygonProvider) settingsSystemMapPolygonProvider.value = config.delivery_zone_polygon_provider;



    }







    function setSystemMapDraftMode(enabled) {



      systemMapDraftMode = Boolean(enabled);



      if (settingsSystemMapProviderName) {



        settingsSystemMapProviderName.disabled = !systemMapDraftMode;



        settingsSystemMapProviderName.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapTileUrl) {



        settingsSystemMapTileUrl.disabled = !systemMapDraftMode;



        settingsSystemMapTileUrl.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapAttribution) {



        settingsSystemMapAttribution.disabled = !systemMapDraftMode;



        settingsSystemMapAttribution.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapMaxZoom) {



        settingsSystemMapMaxZoom.disabled = !systemMapDraftMode;



        settingsSystemMapMaxZoom.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapSubdomains) {



        settingsSystemMapSubdomains.disabled = !systemMapDraftMode;



        settingsSystemMapSubdomains.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapGeocoderProviderName) {



        settingsSystemMapGeocoderProviderName.disabled = !systemMapDraftMode;



        settingsSystemMapGeocoderProviderName.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapGeocoderSearchUrl) {



        settingsSystemMapGeocoderSearchUrl.disabled = !systemMapDraftMode;



        settingsSystemMapGeocoderSearchUrl.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapGeocoderCountryCode) {



        settingsSystemMapGeocoderCountryCode.disabled = !systemMapDraftMode;



        settingsSystemMapGeocoderCountryCode.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapGeocoderLanguage) {



        settingsSystemMapGeocoderLanguage.disabled = !systemMapDraftMode;



        settingsSystemMapGeocoderLanguage.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapGeocoderResultLimit) {



        settingsSystemMapGeocoderResultLimit.disabled = !systemMapDraftMode;



        settingsSystemMapGeocoderResultLimit.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapStoreAddressEnabled) {



        settingsSystemMapStoreAddressEnabled.disabled = !systemMapDraftMode;



      }



      ensureSystemMapPolygonField();



      if (settingsSystemMapPolygonProvider) {



        settingsSystemMapPolygonProvider.disabled = !systemMapDraftMode;



        settingsSystemMapPolygonProvider.readOnly = !systemMapDraftMode;



      }



      if (settingsSystemMapFooterView) {



        settingsSystemMapFooterView.classList.toggle("hidden", systemMapDraftMode);



      }



      if (settingsSystemMapFooterEdit) {



        settingsSystemMapFooterEdit.classList.toggle("hidden", !systemMapDraftMode);



      }



      if (!systemMapDraftMode) {



        resetSystemMapCancelButton();



      }



    }







    function setSystemDeliveryZonePolygonDraftMode(enabled) {



      systemDeliveryZonePolygonDraftMode = Boolean(enabled);



      if (settingsSystemDeliveryZonePolygonProvider) {



        settingsSystemDeliveryZonePolygonProvider.disabled = !systemDeliveryZonePolygonDraftMode;



        settingsSystemDeliveryZonePolygonProvider.readOnly = !systemDeliveryZonePolygonDraftMode;



      }



      if (settingsSystemDeliveryZonePolygonEnabled) {



        settingsSystemDeliveryZonePolygonEnabled.disabled = !systemDeliveryZonePolygonDraftMode;



      }



      if (settingsSystemDeliveryZonePolygonFooterView) {



        settingsSystemDeliveryZonePolygonFooterView.classList.toggle("hidden", systemDeliveryZonePolygonDraftMode);



      }



      if (settingsSystemDeliveryZonePolygonFooterEdit) {



        settingsSystemDeliveryZonePolygonFooterEdit.classList.toggle("hidden", !systemDeliveryZonePolygonDraftMode);



      }



      if (!systemDeliveryZonePolygonDraftMode) {



        resetSystemDeliveryZonePolygonCancelButton();



      }



    }







    function cancelSystemMapDraft() {



      systemMapDraft = { ...systemMapOriginal };



      deliveryMapConfigCache = null;



      storeAddressMapModeCache = Boolean(systemMapOriginal.store_address_map_enabled);



      applySystemMapFormValues(systemMapOriginal);



      applyStoreAddressModeUi();



      syncStoreAddressInputAvailability();



      setSystemMapDraftMode(false);



    }







    function cancelSystemDeliveryZonePolygonDraft() {



      systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



      applySystemDeliveryZonePolygonFormValues(systemDeliveryZonePolygonOriginal);



      setSystemDeliveryZonePolygonDraftMode(false);



      syncDeliveryCreateMenuAvailability();



    }







    function clearDeliveryMapSearchMarker() {



      if (deliveryLeafletSearchMarker && deliveryLeafletMap) {



        deliveryLeafletMap.removeLayer(deliveryLeafletSearchMarker);



      }



      deliveryLeafletSearchMarker = null;



    }







    function closeDeliveryMapSearchPopover() {



      deliveryMapSearchPopoverState.open = false;



      deliveryMapSearchPopoverState.items = [];



      deliveryMapSearchPopoverState.status = "";



      deliveryMapSearchPopoverState.mode = "idle";



      renderDeliveryMapSearchPopover();



    }







    function getDeliveryMapSearchScopeLabel(scope) {



      return String(scope || "").trim() === "global" ? "Весь мир" : "Россия";



    }







    function getDeliveryMapSearchResultTypeLabel(item) {



      return String(item && item.result_type || "").trim() === "address" ? "Адрес" : "Город";



    }







    function renderDeliveryMapSearchPopover() {



      if (!settingsDeliveryMapSearchPopover || !settingsDeliveryMapSearchStatus || !settingsDeliveryMapResults) return;



      const isVisible = deliveryMapSearchPopoverState.open && (



        deliveryMapSearchPopoverState.mode !== "idle" ||



        deliveryMapSearchPopoverState.items.length > 0



      );



      settingsDeliveryMapSearchPopover.classList.toggle("hidden", !isVisible);







      const statusText = String(deliveryMapSearchPopoverState.status || "").trim();



      settingsDeliveryMapSearchStatus.textContent = statusText;



      settingsDeliveryMapSearchStatus.classList.toggle("hidden", !statusText);



      settingsDeliveryMapSearchStatus.classList.toggle("is-error", deliveryMapSearchPopoverState.mode === "error");



      settingsDeliveryMapSearchStatus.classList.toggle("is-loading", deliveryMapSearchPopoverState.mode === "loading");







      settingsDeliveryMapResults.innerHTML = "";



      const list = Array.isArray(deliveryMapSearchPopoverState.items) ? deliveryMapSearchPopoverState.items : [];



      if (!list.length) {



        settingsDeliveryMapResults.classList.add("hidden");



        return;



      }



      list.forEach((item) => {



        const button = document.createElement("button");



        button.type = "button";



        button.className = "settings-delivery-map-result";







        const title = document.createElement("div");



        title.className = "settings-delivery-map-result-title";



        title.textContent = item.label || "Без названия";







        const meta = document.createElement("div");



        meta.className = "settings-delivery-map-result-meta";



        meta.textContent = `${getDeliveryMapSearchResultTypeLabel(item)} • ${getDeliveryMapSearchScopeLabel(item.scope)}`;







        button.appendChild(title);



        button.appendChild(meta);



        button.addEventListener("click", () => {



          searchedMapCity = createSelectedMapCity(item, { mode: "search" });



          if (settingsDeliveryMapSearchInput) {



            settingsDeliveryMapSearchInput.value = item.label || item.city_name || "";



            syncDeliveryMapSearchClearButton();



          }



          closeDeliveryMapSearchPopover();



          refreshDeliveryMapSelection();



        });



        settingsDeliveryMapResults.appendChild(button);



      });



      settingsDeliveryMapResults.classList.remove("hidden");



    }







    function syncDeliveryMapSearchClearButton() {



      if (!settingsDeliveryMapSearchClear) return;



      const hasValue = Boolean(String((settingsDeliveryMapSearchInput && settingsDeliveryMapSearchInput.value) || "").trim());



      const isVisible = hasValue && !(settingsDeliveryMapSearchInput && settingsDeliveryMapSearchInput.disabled);



      settingsDeliveryMapSearchClear.classList.toggle("is-visible", isVisible);



      settingsDeliveryMapSearchClear.disabled = !isVisible;



      settingsDeliveryMapSearchClear.setAttribute("aria-hidden", isVisible ? "false" : "true");



    }







    function setDeliveryMapSearchStatus(message, mode = "idle") {



      deliveryMapSearchPopoverState.status = String(message || "").trim();



      deliveryMapSearchPopoverState.mode = String(mode || "idle").trim() || "idle";



      if (deliveryMapSearchPopoverState.mode !== "idle" || deliveryMapSearchPopoverState.items.length) {



        deliveryMapSearchPopoverState.open = true;



      }



      renderDeliveryMapSearchPopover();



    }







    function renderDeliveryMapResults(items) {



      deliveryMapSearchPopoverState.items = Array.isArray(items) ? items.slice() : [];



      if (deliveryMapSearchPopoverState.items.length) {



        deliveryMapSearchPopoverState.open = true;



        if (deliveryMapSearchPopoverState.mode === "idle" || deliveryMapSearchPopoverState.mode === "loading" || deliveryMapSearchPopoverState.mode === "empty") {



          deliveryMapSearchPopoverState.mode = "ready";



        }



      }



      renderDeliveryMapSearchPopover();



    }







    function setDeliveryMapSearchEnabled(enabled) {



      const nextEnabled = Boolean(enabled);



      if (settingsDeliveryMapSearchInput) settingsDeliveryMapSearchInput.disabled = !nextEnabled;



      if (!nextEnabled) {



        closeDeliveryMapSearchPopover();



      }



      syncDeliveryMapSearchClearButton();



    }







    function syncDeliveryMapToolbarInteractivity() {



      const canSearch = Boolean(hasConfiguredMapGeocoder(deliveryMapConfigCache) && !isDeliveryZonePlacingMode());



      setDeliveryMapSearchEnabled(canSearch);



      if (settingsDeliveryCityChip) {



        settingsDeliveryCityChip.disabled = isDeliveryZonePlacingMode();



      }



      if (isDeliveryZonePlacingMode()) {



        closeDeliveryCityDropdown();



      }



    }







    function normalizeDeliveryMapCityName(value) {



      return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");



    }







    function createSelectedMapCity(item, overrides = {}) {



      const source = item && typeof item === "object" ? item : {};



      const lat = Number(source.lat);



      const lng = Number(source.lng);



      const cityName = String(overrides.city_name || source.city_name || source.label || "").trim();



      const label = String(overrides.label || cityName || source.label || "").trim();



      const popupLabel = String(overrides.popup_label || source.popup_label || source.label || label || cityName).trim();



      return {



        mode: String(overrides.mode || source.mode || "search").trim() || "search",



        label: label || cityName,



        popup_label: popupLabel || label || cityName,



        city_name: cityName || label,



        lat: Number.isFinite(lat) ? lat : null,



        lng: Number.isFinite(lng) ? lng : null,



        bounding_box: Array.isArray(source.bounding_box) ? source.bounding_box.slice() : null,



        scope: String(overrides.scope || source.scope || "").trim() || "country",



        result_type: String(overrides.result_type || source.result_type || "city").trim() || "city"



      };



    }







    function getDeliveryMapCityOptions() {



      const uniqueCities = new Set();



      (storesState.items || []).forEach((store) => {



        const city = String(store && store.city || "").trim();



        if (city) uniqueCities.add(city);



      });



      return Array.from(uniqueCities).sort((left, right) => left.localeCompare(right, "ru"));



    }







    function getSelectedDeliveryStoreCityLabel() {



      return String(selectedDeliveryStoreCity || "").trim();



    }







    function getActiveDeliveryMapCityName() {



      if (searchedMapCity && searchedMapCity.city_name) {



        return String(searchedMapCity.city_name).trim();



      }



      return getSelectedDeliveryStoreCityLabel();



    }







    function getActiveDeliveryMapLabel() {



      if (searchedMapCity && searchedMapCity.label) {



        return String(searchedMapCity.label).trim();



      }



      return getSelectedDeliveryStoreCityLabel();



    }







    function getActiveDeliveryMapViewport() {



      return searchedMapCity || selectedDeliveryStoreCityLocation || null;



    }







    function updateDeliveryCityChipText() {



      if (!settingsDeliveryCityChipText) return;



      settingsDeliveryCityChipText.textContent = getSelectedDeliveryStoreCityLabel() || "Город";



    }







    function closeDeliveryCityDropdown() {



      if (settingsDeliveryCitySelector) settingsDeliveryCitySelector.classList.remove("is-open");



      if (settingsDeliveryCityChip) settingsDeliveryCityChip.setAttribute("aria-expanded", "false");



    }







    function renderDeliveryCitySelector() {



      if (!settingsDeliveryCitySelector || !settingsDeliveryCityChip || !settingsDeliveryCityDropdown) return;



      const cityOptions = getDeliveryMapCityOptions();



      const isDelivery = document.body.getAttribute("data-settings-section") === "delivery";



      if (!cityOptions.length) {



        settingsDeliveryCitySelector.classList.add("hidden");



        settingsDeliveryCityDropdown.innerHTML = "";



        closeDeliveryCityDropdown();



        return;



      }







      const selectedCityKey = normalizeDeliveryMapCityName(selectedDeliveryStoreCity);



      const matchedCity = cityOptions.find((city) => normalizeDeliveryMapCityName(city) === selectedCityKey);



      if (!matchedCity) {



        selectedDeliveryStoreCity = cityOptions[0];



        selectedDeliveryStoreCityLocation = null;



        deliveryStoreCityLocationRequestKey = "";



      }







      settingsDeliveryCitySelector.classList.toggle("hidden", !isDelivery);



      settingsDeliveryCityChip.disabled = isDeliveryZonePlacingMode();



      updateDeliveryCityChipText();



      settingsDeliveryCityDropdown.innerHTML = "";







      cityOptions.forEach((city) => {



        const option = document.createElement("button");



        option.type = "button";



        option.className = "new-order-right-select-option" + (normalizeDeliveryMapCityName(city) === normalizeDeliveryMapCityName(selectedDeliveryStoreCity) ? " is-selected" : "");



        option.textContent = city;



        option.setAttribute("role", "option");



        option.setAttribute("aria-selected", normalizeDeliveryMapCityName(city) === normalizeDeliveryMapCityName(selectedDeliveryStoreCity) ? "true" : "false");



        option.addEventListener("click", (event) => {



          event.stopPropagation();



          closeDeliveryCityDropdown();



          selectDeliveryMapCity(city);



        });



        settingsDeliveryCityDropdown.appendChild(option);



      });



    }







    function clearDeliveryMapBranchMarkers() {



      if (deliveryLeafletBranchMarkersLayer) {



        deliveryLeafletBranchMarkersLayer.clearLayers();



      }



    }







    function getDeliveryMapStoresWithCoordinates() {



      return (storesState.items || [])



        .map((store) => {



          const lat = Number(store && store.lat);



          const lng = Number(store && store.lng);



          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;



          return {



            ...store,



            lat,



            lng



          };



        })



        .filter(Boolean);



    }







    function getVisibleDeliveryMapStores() {



      const stores = getDeliveryMapStoresWithCoordinates();



      const selectedCityKey = normalizeDeliveryMapCityName(getActiveDeliveryMapCityName());



      if (!selectedCityKey) return [];



      return stores.filter((store) => normalizeDeliveryMapCityName(store.city) === selectedCityKey);



    }







    function buildDeliveryMapStorePopup(store) {



      const wrapper = document.createElement("div");



      const title = document.createElement("div");



      title.style.fontWeight = "700";



      title.textContent = store.name || `Филиал #${store.id}`;



      wrapper.appendChild(title);



      if (store.city) {



        const city = document.createElement("div");



        city.textContent = store.city;



        wrapper.appendChild(city);



      }



      if (store.address) {



        const address = document.createElement("div");



        address.textContent = store.address;



        wrapper.appendChild(address);



      }



      return wrapper;



    }







    function renderDeliveryMapBranchMarkers() {



      if (!deliveryLeafletMap || !window.L) return [];



      if (!deliveryLeafletBranchMarkersLayer) {



        deliveryLeafletBranchMarkersLayer = window.L.layerGroup().addTo(deliveryLeafletMap);



      }



      deliveryLeafletBranchMarkersLayer.clearLayers();



      const stores = getVisibleDeliveryMapStores();



      const interactive = !isDeliveryZonePlacingMode();



      stores.forEach((store) => {



        const marker = window.L.marker([store.lat, store.lng], { interactive });



        if (interactive) {



          marker.bindPopup(buildDeliveryMapStorePopup(store));



        }



        deliveryLeafletBranchMarkersLayer.addLayer(marker);



      });



      return stores;



    }







    function fitDeliveryMapToStores(stores) {



      if (!deliveryLeafletMap || !window.L) return false;



      const list = Array.isArray(stores) ? stores : [];



      if (!list.length) return false;



      if (list.length === 1) {



        deliveryLeafletMap.setView([list[0].lat, list[0].lng], 13);



        return true;



      }



      const bounds = window.L.latLngBounds(list.map((store) => [store.lat, store.lng]));



      deliveryLeafletMap.fitBounds(bounds, { padding: [24, 24] });



      return true;



    }







    function updateDeliveryMapStatusFromSelection() {



      if (deliveryMapSearchPopoverState.open) {



        renderDeliveryMapSearchPopover();



      }



    }







    function refreshDeliveryMapSelection() {



      renderDeliveryCitySelector();



      if (!deliveryLeafletMap || !window.L) return;



      const stores = renderDeliveryMapBranchMarkers();



      if (searchedMapCity) {



        const focused = focusDeliveryMapLocation(searchedMapCity, {



          showMarker: true,



          popupLabel: searchedMapCity.popup_label || searchedMapCity.label



        });



        if (!focused && !fitDeliveryMapToStores(stores)) {



          deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



        }



        updateDeliveryMapStatusFromSelection();



        return;



      }







      clearDeliveryMapSearchMarker();



      if (fitDeliveryMapToStores(stores)) {



        updateDeliveryMapStatusFromSelection();



        return;



      }







      const activeViewport = getActiveDeliveryMapViewport();



      if (activeViewport && focusDeliveryMapLocation(activeViewport, { showMarker: false })) {



        updateDeliveryMapStatusFromSelection();



        return;



      }







      if (getSelectedDeliveryStoreCityLabel()) {



        ensureSelectedDeliveryStoreCityLocation();



      }



      deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      updateDeliveryMapStatusFromSelection();



    }







    function syncDeliveryMapStoresState() {



      const cityOptions = getDeliveryMapCityOptions();



      if (!cityOptions.length) {



        selectedDeliveryStoreCity = null;



        selectedDeliveryStoreCityLocation = null;



        deliveryStoreCityLocationRequestKey = "";



      } else {



        const selectedCityKey = normalizeDeliveryMapCityName(selectedDeliveryStoreCity);



        const matchedCity = cityOptions.find((city) => normalizeDeliveryMapCityName(city) === selectedCityKey);



        const nextSelectedCity = matchedCity || cityOptions[0];



        if (nextSelectedCity !== selectedDeliveryStoreCity) {



          selectedDeliveryStoreCity = nextSelectedCity;



          selectedDeliveryStoreCityLocation = null;



          deliveryStoreCityLocationRequestKey = "";



        }



      }



      renderDeliveryCitySelector();



      if (document.body.getAttribute("data-settings-section") === "delivery") {



        refreshDeliveryMapSelection();



      }



    }







    async function resolveDeliveryMapCityLocation(cityName) {



      const normalizedCity = String(cityName || "").trim();



      if (!normalizedCity) return null;



      const cacheKey = normalizeDeliveryMapCityName(normalizedCity);



      if (deliveryMapCityLocationCache.has(cacheKey)) {



        return deliveryMapCityLocationCache.get(cacheKey);



      }



      const fallback = createSelectedMapCity({



        label: normalizedCity,



        city_name: normalizedCity,



        popup_label: normalizedCity,



        mode: "store"



      });



      if (!hasConfiguredMapGeocoder(deliveryMapConfigCache)) {



        return fallback;



      }



      try {



        const res = await authFetch(`/api/admin/system/map-geocode?q=${encodeURIComponent(normalizedCity)}`);



        const data = await res.json();



        const items = Array.isArray(data && data.data && data.data.items) ? data.data.items : [];



        if (!items.length) return fallback;



        const resolved = createSelectedMapCity(items[0], {



          mode: "store",



          label: normalizedCity,



          city_name: normalizedCity,



          popup_label: items[0].label || normalizedCity



        });



        deliveryMapCityLocationCache.set(cacheKey, resolved);



        return resolved;



      } catch (err) {



        console.error("Failed to resolve delivery city on map:", err);



        return fallback;



      }



    }







    async function ensureSelectedDeliveryStoreCityLocation() {



      const cityName = getSelectedDeliveryStoreCityLabel();



      if (!cityName || searchedMapCity) return;



      const requestKey = normalizeDeliveryMapCityName(cityName);



      if (!requestKey) return;



      if (



        selectedDeliveryStoreCityLocation &&



        normalizeDeliveryMapCityName(selectedDeliveryStoreCityLocation.city_name) === requestKey



      ) {



        return;



      }



      if (deliveryStoreCityLocationRequestKey === requestKey) return;



      deliveryStoreCityLocationRequestKey = requestKey;



      const resolved = await resolveDeliveryMapCityLocation(cityName);



      if (deliveryStoreCityLocationRequestKey !== requestKey) return;



      deliveryStoreCityLocationRequestKey = "";



      if (searchedMapCity) return;



      if (normalizeDeliveryMapCityName(selectedDeliveryStoreCity) !== requestKey) return;



      selectedDeliveryStoreCityLocation = resolved;



      if (document.body.getAttribute("data-settings-section") === "delivery") {



        refreshDeliveryMapSelection();



      }



    }







    function selectDeliveryMapCity(cityName) {



      closeDeliveryMapSearchPopover();



      searchedMapCity = null;



      deliveryStoreCityLocationRequestKey = "";



      if (settingsDeliveryMapSearchInput) {



        settingsDeliveryMapSearchInput.value = "";



        syncDeliveryMapSearchClearButton();



      }



      const normalizedCity = String(cityName || "").trim();



      if (!normalizedCity) {



        selectedDeliveryStoreCity = null;



        selectedDeliveryStoreCityLocation = null;



        refreshDeliveryMapSelection();



        return;



      }



      const matchedCity = getDeliveryMapCityOptions().find((city) => normalizeDeliveryMapCityName(city) === normalizeDeliveryMapCityName(normalizedCity));



      const nextCity = matchedCity || normalizedCity;



      if (normalizeDeliveryMapCityName(nextCity) !== normalizeDeliveryMapCityName(selectedDeliveryStoreCity)) {



        selectedDeliveryStoreCityLocation = null;



      }



      selectedDeliveryStoreCity = nextCity;



      refreshDeliveryMapSelection();



    }







    function normalizeDeliveryMapBounds(bounds) {



      if (!Array.isArray(bounds) || bounds.length < 4) return null;



      const south = Number(bounds[0]);



      const north = Number(bounds[1]);



      const west = Number(bounds[2]);



      const east = Number(bounds[3]);



      if (![south, north, west, east].every(Number.isFinite)) return null;



      return [[south, west], [north, east]];



    }







    function focusDeliveryMapLocation(item, options = {}) {



      if (!deliveryLeafletMap || !window.L || !item) return false;



      const lat = Number(item.lat);



      const lng = Number(item.lng);



      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;



      clearDeliveryMapSearchMarker();



      const bounds = normalizeDeliveryMapBounds(item.bounding_box);



      if (bounds) {



        deliveryLeafletMap.fitBounds(bounds, { padding: [24, 24] });



      } else {



        deliveryLeafletMap.setView([lat, lng], 10);



      }



      if (options.showMarker === false) {



        return true;



      }



      deliveryLeafletSearchMarker = window.L.marker([lat, lng]);



      deliveryLeafletSearchMarker.addTo(deliveryLeafletMap);



      const popupLabel = String(options.popupLabel || item.popup_label || item.label || "").trim();



      if (popupLabel) {



        deliveryLeafletSearchMarker.bindPopup(popupLabel);



      }



      return true;



    }







    async function loadSystemMapSettings() {



      try {



        const res = await authFetch("/api/admin/system/map-provider");



        const data = await res.json();



        if (!data || !data.ok || !data.data) return;



        systemMapOriginal = normalizeSystemMapConfig(data.data);



        systemMapDraft = { ...systemMapOriginal };



        systemDeliveryZonePolygonOriginal = {



          delivery_zone_polygon_provider: systemMapOriginal.delivery_zone_polygon_provider || "Leaflet-Geoman",



          delivery_zone_polygon_enabled: Boolean(systemMapOriginal.store_address_map_enabled)



        };



        systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



        deliveryMapConfigCache = null;



        storeAddressMapModeCache = Boolean(systemMapOriginal.store_address_map_enabled);



        applySystemMapFormValues(systemMapOriginal);



        applyStoreAddressModeUi();



        syncDeliveryMapConfigAvailability();



        setSystemMapDraftMode(false);



      } catch (err) {



        console.error("Failed to load system map settings:", err);



      }



    }







    async function saveSystemMapSettings(payload) {



      try {



        const res = await authFetch("/api/admin/system/map-provider", {



          method: "PUT",



          body: JSON.stringify(payload || {})



        });



        const data = await res.json();



        if (!data || !data.ok || !data.data) return null;



        systemMapOriginal = normalizeSystemMapConfig(data.data);



        systemMapDraft = { ...systemMapOriginal };



        systemDeliveryZonePolygonOriginal = {



          delivery_zone_polygon_provider: systemMapOriginal.delivery_zone_polygon_provider || "Leaflet-Geoman",



          delivery_zone_polygon_enabled: Boolean(systemMapOriginal.store_address_map_enabled)



        };



        systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



        deliveryMapConfigCache = null;



        storeAddressMapModeCache = Boolean(systemMapOriginal.store_address_map_enabled);



        applySystemMapFormValues(systemMapOriginal);



        applyStoreAddressModeUi();



        syncDeliveryMapConfigAvailability();



        setSystemMapDraftMode(false);



        return data.data;



      } catch (err) {



        console.error("Failed to save system map settings:", err);



        return null;



      }



    }







    async function loadSystemDeliveryZonePolygonSettings() {



      try {



        const res = await authFetch("/api/admin/system/delivery-zone-polygon");



        const data = await res.json();



        if (!data || !data.ok || !data.data) return;



        systemDeliveryZonePolygonOriginal = normalizeSystemDeliveryZonePolygonConfig(data.data);



        systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



        applySystemDeliveryZonePolygonFormValues(systemDeliveryZonePolygonOriginal);



        setSystemDeliveryZonePolygonDraftMode(false);



        syncDeliveryCreateMenuAvailability();



      } catch (err) {



        console.error("Failed to load delivery zone polygon settings:", err);



      }



    }







    async function saveSystemDeliveryZonePolygonSettings(payload) {



      try {



        const res = await authFetch("/api/admin/system/delivery-zone-polygon", {



          method: "PUT",



          body: JSON.stringify(payload || {})



        });



        const data = await res.json();



        if (!data || !data.ok || !data.data) return null;



        systemDeliveryZonePolygonOriginal = normalizeSystemDeliveryZonePolygonConfig(data.data);



        systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



        applySystemDeliveryZonePolygonFormValues(systemDeliveryZonePolygonOriginal);



        setSystemDeliveryZonePolygonDraftMode(false);



        syncDeliveryCreateMenuAvailability();



        return data.data;



      } catch (err) {



        console.error("Failed to save delivery zone polygon settings:", err);



        return null;



      }



    }







    function showDeliveryMapEmpty(message) {



      closeDeliveryMapSearchPopover();



      if (settingsDeliveryMapEmpty) {



        settingsDeliveryMapEmpty.classList.remove("hidden");



        const textEl = settingsDeliveryMapEmpty.querySelector(".settings-delivery-map-empty-text");



        if (textEl && message) textEl.textContent = message;



      }



      if (settingsDeliveryMapCanvas) {



        settingsDeliveryMapCanvas.classList.add("hidden");



      }



      if (deliveryLeafletTileLayer && deliveryLeafletMap) {



        deliveryLeafletMap.removeLayer(deliveryLeafletTileLayer);



        deliveryLeafletTileLayer = null;



      }



      clearDeliveryMapSearchMarker();



      clearDeliveryMapBranchMarkers();



      setDeliveryMapSearchEnabled(false);



    }







    function showDeliveryMapCanvas() {



      if (settingsDeliveryMapEmpty) settingsDeliveryMapEmpty.classList.add("hidden");



      if (settingsDeliveryMapCanvas) settingsDeliveryMapCanvas.classList.remove("hidden");



    }







    function destroyDeliveryMapPreview() {



      if (deliveryLeafletMap) {



        deliveryLeafletMap.remove();



        deliveryLeafletMap = null;



      }



      deliveryLeafletTileLayer = null;



      deliveryLeafletSearchMarker = null;



      deliveryLeafletBranchMarkersLayer = null;



    }







    function applyDeliveryMapConfig(config, options = {}) {



      if (!settingsDeliveryMapCanvas || !window.L) return false;



      const normalized = normalizeSystemMapConfig(config);



      const maxZoom = normalized.max_zoom;



      const tileOptions = {



        attribution: normalized.attribution || "",



        maxZoom,



      };



      const subdomains = parseMapSubdomains(normalized.subdomains);



      if (subdomains.length) {



        tileOptions.subdomains = subdomains;



      }







      showDeliveryMapCanvas();







      if (!deliveryLeafletMap) {



        deliveryLeafletMap = window.L.map(settingsDeliveryMapCanvas, {



          zoomControl: true,



          attributionControl: true,



        }).setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      }







      if (deliveryLeafletTileLayer) {



        deliveryLeafletMap.removeLayer(deliveryLeafletTileLayer);



        deliveryLeafletTileLayer = null;



      }







      deliveryLeafletTileLayer = window.L.tileLayer(normalized.tile_url, tileOptions);



      deliveryLeafletTileLayer.addTo(deliveryLeafletMap);



      if (options.resetView) {



        closeDeliveryMapSearchPopover();



        clearDeliveryMapSearchMarker();



        clearDeliveryMapBranchMarkers();



        deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      }



      window.setTimeout(() => {



        if (deliveryLeafletMap) deliveryLeafletMap.invalidateSize();



      }, 0);



      return true;



    }







    async function searchDeliveryMapCities() {



      const query = String((settingsDeliveryMapSearchInput && settingsDeliveryMapSearchInput.value) || "").trim();



      closeDeliveryCityDropdown();



      deliveryMapSearchPopoverState.open = true;



      if (!query) {



        renderDeliveryMapResults([]);



        setDeliveryMapSearchStatus("Введите город или адрес для поиска", "empty");



        return;



      }



      if (!hasConfiguredMapGeocoder(deliveryMapConfigCache)) {



        renderDeliveryMapResults([]);



        setDeliveryMapSearchStatus("Настройте геокодер РІ разделе «Системные -> Карта».", "error");



        return;



      }



      if (!deliveryLeafletMap) {



        renderDeliveryMapResults([]);



        setDeliveryMapSearchStatus("Карта ещё не готова.", "error");



        return;



      }







      setDeliveryMapSearchEnabled(false);



      renderDeliveryMapResults([]);



      setDeliveryMapSearchStatus("Ищем город или адрес...", "loading");



      try {



        const res = await authFetch(`/api/admin/system/map-geocode?q=${encodeURIComponent(query)}`);



        const data = await res.json();



        if (!data || !data.ok || !data.data) {



          renderDeliveryMapResults([]);



          setDeliveryMapSearchStatus("Не удалось выполнить поиск.", "error");



          return;



        }



        const items = Array.isArray(data.data.items) ? data.data.items : [];



        if (!items.length) {



          renderDeliveryMapResults([]);



          setDeliveryMapSearchStatus("Ничего не найдено.", "empty");



          return;



        }



        renderDeliveryMapResults(items);



        setDeliveryMapSearchStatus(`Поиск: ${data.data.scope_label || "Россия"}`, "ready");



      } catch (err) {



        console.error("Failed to search city on delivery map:", err);



        renderDeliveryMapResults([]);



        setDeliveryMapSearchStatus("Не удалось выполнить поиск.", "error");



      } finally {



        setDeliveryMapSearchEnabled(hasConfiguredMapGeocoder(deliveryMapConfigCache));



      }



    }







    async function refreshDeliveryMapPreview(forceReload = false) {



      if (!settingsDeliveryMapBlock || !settingsDeliveryMapCanvas || !settingsDeliveryMapEmpty) return;



      if (!forceReload && deliveryMapConfigCache) {



        storeAddressMapModeCache = Boolean(deliveryMapConfigCache.store_address_map_enabled);



        syncDeliveryMapConfigAvailability();



        if (!hasConfiguredMap(deliveryMapConfigCache)) {



          showDeliveryMapEmpty(buildMapNotConfiguredMessage(deliveryMapConfigCache));



          return;



        }



        if (!window.L) {



          showDeliveryMapEmpty("Leaflet не подключён. Проверьте локальные assets карты.");



          return;



        }



        applyDeliveryMapConfig(deliveryMapConfigCache, { resetView: forceReload });



        setDeliveryMapSearchEnabled(hasConfiguredMapGeocoder(deliveryMapConfigCache));



        refreshDeliveryMapSelection();



        syncDeliveryMapConfigAvailability();



        return;



      }







      try {



        const data = await fetchTenantMapConfig();



        const config = normalizeSystemMapConfig(data && data.data ? data.data : null);



        deliveryMapConfigCache = { ...config };



        storeAddressMapModeCache = Boolean(config.store_address_map_enabled);



        syncDeliveryMapConfigAvailability();



        if (!hasConfiguredMap(config)) {



          showDeliveryMapEmpty(buildMapNotConfiguredMessage(config));



          return;



        }



        if (!window.L) {



          showDeliveryMapEmpty("Leaflet не подключён. Проверьте локальные assets карты.");



          return;



        }



        applyDeliveryMapConfig(config, { resetView: forceReload });



        setDeliveryMapSearchEnabled(hasConfiguredMapGeocoder(config));



        refreshDeliveryMapSelection();



        syncDeliveryMapConfigAvailability();



      } catch (err) {



        console.error("Failed to refresh delivery map preview:", err);



        showDeliveryMapEmpty("Не удалось загрузить настройку карты tenant.");



      }



    }







    function normalizeStoreMapCoordinate(value) {



      const numeric = Number(value);



      return Number.isFinite(numeric) ? Number(numeric.toFixed(7)) : null;



    }







    function hasStoreAddressMapPoint(lat, lng) {



      const normalizedLat = normalizeStoreMapCoordinate(lat);



      const normalizedLng = normalizeStoreMapCoordinate(lng);



      return normalizedLat !== null && normalizedLng !== null && !(normalizedLat === 0 && normalizedLng === 0);



    }







    function getStoreAddressMapDisplayPoint() {



      if (hasStoreAddressMapPoint(storeAddressMapState.customLat, storeAddressMapState.customLng)) {



        return {



          lat: normalizeStoreMapCoordinate(storeAddressMapState.customLat),



          lng: normalizeStoreMapCoordinate(storeAddressMapState.customLng),



          manual: true,



          source: "manual",



        };



      }



      if (hasStoreAddressMapPoint(storeAddressMapState.fallbackLat, storeAddressMapState.fallbackLng)) {



        return {



          lat: normalizeStoreMapCoordinate(storeAddressMapState.fallbackLat),



          lng: normalizeStoreMapCoordinate(storeAddressMapState.fallbackLng),



          manual: false,



          source: String(storeAddressMapState.fallbackSource || "").trim() || "address",



        };



      }



      return null;



    }







    function getStoreAddressMapSourceLabel(source) {



      if (source === "city") return "от выбранного города";



      if (source === "street") return "от выбранной улицы";



      if (source === "house") return "от выбранного дома";



      return "по текущему адресу";



    }







    function getStoreAddressMapZoom(point) {



      if (!point) return 17;



      if (point.manual) return 18;



      if (point.source === "city") return 12;



      if (point.source === "street") return 16;



      return 17;



    }







    function renderStoreAddressMapHint() {



      if (!settingsStoreAddressMapHint) return;



      const point = getStoreAddressMapDisplayPoint();



      if (point && point.manual) {



        settingsStoreAddressMapHint.textContent = `Точка вручную уточнена: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}.`;



        return;



      }



      if (point) {



        settingsStoreAddressMapHint.textContent = `Базовая точка ${getStoreAddressMapSourceLabel(point.source)}: ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}.`;



        return;



      }



      settingsStoreAddressMapHint.textContent = "Карта уточняет только координату. Текст адреса остаётся как РІ полях выше.";



    }







    function setStoreAddressMapModalStatus(message, mode = "idle") {



      if (!settingsStoreAddressMapStatus) return;



      const text = String(message || "").trim();



      settingsStoreAddressMapStatus.textContent = text;



      settingsStoreAddressMapStatus.classList.toggle("hidden", !text);



      settingsStoreAddressMapStatus.classList.toggle("is-error", mode === "error");



    }







    function renderStoreAddressMapCoords() {



      if (!settingsStoreAddressMapCoords) return;



      if (!hasStoreAddressMapPoint(storeAddressMapState.pendingLat, storeAddressMapState.pendingLng)) {



        settingsStoreAddressMapCoords.textContent = "Координата ещё не выбрана.";



        return;



      }



      const lat = normalizeStoreMapCoordinate(storeAddressMapState.pendingLat);



      const lng = normalizeStoreMapCoordinate(storeAddressMapState.pendingLng);



      settingsStoreAddressMapCoords.textContent = `Широта ${lat.toFixed(6)}, долгота ${lng.toFixed(6)}.`;



    }







    function updateStoreAddressMapButtonState() {



      if (!settingsStoreAddressMapBtn) return;



      if (!isStoreAddressMapModeEnabled()) {



        settingsStoreAddressMapBtn.disabled = true;



        renderStoreAddressMapHint();



        return;



      }



      settingsStoreAddressMapBtn.disabled = false;



      renderStoreAddressMapHint();



    }







    function clearStoreAddressMapState(options = {}) {



      const clearFallback = options && options.clearFallback === true;



      const keepPending = options && options.keepPending === true;



      storeAddressMapState.customLat = null;



      storeAddressMapState.customLng = null;



      if (clearFallback) {



        storeAddressMapState.fallbackLat = null;



        storeAddressMapState.fallbackLng = null;



        storeAddressMapState.fallbackSource = "";



      }



      if (!keepPending) {



        storeAddressMapState.pendingLat = null;



        storeAddressMapState.pendingLng = null;



      }



      renderStoreAddressMapCoords();



      renderStoreAddressMapHint();



    }







    function setStoreAddressMapFallback(lat, lng, options = {}) {



      const normalizedLat = normalizeStoreMapCoordinate(lat);



      const normalizedLng = normalizeStoreMapCoordinate(lng);



      const forcePending = options && options.forcePending === true;



      const hasPoint = hasStoreAddressMapPoint(normalizedLat, normalizedLng);



      storeAddressMapState.fallbackLat = hasPoint ? normalizedLat : null;



      storeAddressMapState.fallbackLng = hasPoint ? normalizedLng : null;



      storeAddressMapState.fallbackSource = hasPoint



        ? String(options && options.source || "").trim()



        : "";



      if (forcePending || !hasStoreAddressMapPoint(storeAddressMapState.pendingLat, storeAddressMapState.pendingLng)) {



        storeAddressMapState.pendingLat = storeAddressMapState.fallbackLat;



        storeAddressMapState.pendingLng = storeAddressMapState.fallbackLng;



      }



      renderStoreAddressMapCoords();



      renderStoreAddressMapHint();



    }







    function setStoreAddressMapCustomPoint(lat, lng) {



      storeAddressMapState.customLat = normalizeStoreMapCoordinate(lat);



      storeAddressMapState.customLng = normalizeStoreMapCoordinate(lng);



      storeAddressMapState.pendingLat = storeAddressMapState.customLat;



      storeAddressMapState.pendingLng = storeAddressMapState.customLng;



      renderStoreAddressMapCoords();



      renderStoreAddressMapHint();



    }







    function setStoreAddressMapPendingPoint(lat, lng) {



      storeAddressMapState.pendingLat = normalizeStoreMapCoordinate(lat);



      storeAddressMapState.pendingLng = normalizeStoreMapCoordinate(lng);



      renderStoreAddressMapCoords();



    }







    function getStoreAddressMapBasePoint() {



      const selectedAddress = storeAddressSelectionState.selectedAddress;



      if (selectedAddress && hasStoreAddressMapPoint(selectedAddress.lat, selectedAddress.lng)) {



        return {



          lat: normalizeStoreMapCoordinate(selectedAddress.lat),



          lng: normalizeStoreMapCoordinate(selectedAddress.lng),



          source: "house",



        };



      }



      const selectedStreet = storeAddressSelectionState.selectedStreet;



      if (selectedStreet && hasStoreAddressMapPoint(selectedStreet.lat, selectedStreet.lng)) {



        return {



          lat: normalizeStoreMapCoordinate(selectedStreet.lat),



          lng: normalizeStoreMapCoordinate(selectedStreet.lng),



          source: "street",



        };



      }



      const resolvedCity = storeAddressSelectionState.resolvedCity;



      if (resolvedCity && hasStoreAddressMapPoint(resolvedCity.lat, resolvedCity.lng)) {



        return {



          lat: normalizeStoreMapCoordinate(resolvedCity.lat),



          lng: normalizeStoreMapCoordinate(resolvedCity.lng),



          source: "city",



        };



      }



      return null;



    }







    function syncStoreAddressMapBasePoint(options = {}) {



      const basePoint = getStoreAddressMapBasePoint();



      setStoreAddressMapFallback(



        basePoint && basePoint.lat,



        basePoint && basePoint.lng,



        {



          source: basePoint ? basePoint.source : "",



          forcePending: options && options.forcePending === true,



        }



      );



    }







    function syncStoreAddressMapFromSelection(item, source = "") {



      storeAddressMapState.customLat = null;



      storeAddressMapState.customLng = null;



      const fallbackSource = String(source || "").trim()



        || (String(item && item.stage || "").trim() === "city"



          ? "city"



          : (String(item && item.stage || "").trim() === "house" ? "house" : "street"));



      setStoreAddressMapFallback(item && item.lat, item && item.lng, {



        source: fallbackSource,



        forcePending: true,



      });



    }







    function buildStoreAddressMapQuery() {



      const city = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const street = normalizeStoreAddressSuggestValue(settingsStoreAddress && settingsStoreAddress.value);



      const house = normalizeStoreAddressSuggestValue(settingsStoreHouse && settingsStoreHouse.value);



      const address = buildStoreCombinedAddressValue(



        city,



        storeAddressSelectionState.contextLocality,



        street,



        house



      );



      return [city, address].filter(Boolean).join(", ");



    }







    async function ensureStoreAddressMapConfig() {



      if (deliveryMapConfigCache) {



        storeAddressMapModeCache = Boolean(deliveryMapConfigCache.store_address_map_enabled);



        return deliveryMapConfigCache;



      }



      const data = await fetchTenantMapConfig();



      const config = normalizeSystemMapConfig(data && data.data ? data.data : null);



      deliveryMapConfigCache = { ...config };



      storeAddressMapModeCache = Boolean(config.store_address_map_enabled);



      return config;



    }







    function applyStoreAddressMapConfig(config) {



      if (!settingsStoreAddressMapCanvas || !window.L) return false;



      const normalized = normalizeSystemMapConfig(config);



      const tileOptions = {



        attribution: normalized.attribution || "",



        maxZoom: normalized.max_zoom,



      };



      const subdomains = parseMapSubdomains(normalized.subdomains);



      if (subdomains.length) {



        tileOptions.subdomains = subdomains;



      }



      if (!storeLeafletMap) {



        storeLeafletMap = window.L.map(settingsStoreAddressMapCanvas, {



          zoomControl: true,



          attributionControl: true,



        }).setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      }



      if (storeLeafletTileLayer) {



        storeLeafletMap.removeLayer(storeLeafletTileLayer);



        storeLeafletTileLayer = null;



      }



      storeLeafletTileLayer = window.L.tileLayer(normalized.tile_url, tileOptions);



      storeLeafletTileLayer.addTo(storeLeafletMap);



      if (!storeLeafletClickBound) {



        storeLeafletMap.on("click", (event) => {



          const nextLat = event && event.latlng ? event.latlng.lat : null;



          const nextLng = event && event.latlng ? event.latlng.lng : null;



          if (!hasStoreAddressMapPoint(nextLat, nextLng)) return;



          setStoreAddressMapPendingPoint(nextLat, nextLng);



          if (!storeLeafletMarker) {



            storeLeafletMarker = window.L.marker([nextLat, nextLng], { draggable: true }).addTo(storeLeafletMap);



            storeLeafletMarker.on("dragend", () => {



              const position = storeLeafletMarker.getLatLng();



              setStoreAddressMapPendingPoint(position.lat, position.lng);



            });



          } else {



            storeLeafletMarker.setLatLng([nextLat, nextLng]);



          }



        });



        storeLeafletClickBound = true;



      }



      window.setTimeout(() => {



        if (storeLeafletMap) storeLeafletMap.invalidateSize();



      }, 0);



      return true;



    }







    async function resolveStoreAddressMapLocation(query) {



      const normalizedQuery = String(query || "").trim();



      if (!normalizedQuery || !hasConfiguredMapGeocoder(deliveryMapConfigCache)) return null;



      const res = await authFetch(`/api/admin/system/map-geocode?q=${encodeURIComponent(normalizedQuery)}`);



      const data = await res.json();



      if (!data || !data.ok || !data.data) return null;



      const items = Array.isArray(data.data.items) ? data.data.items : [];



      const first = items.find((item) => hasStoreAddressMapPoint(item && item.lat, item && item.lng));



      if (!first) return null;



      return {



        lat: normalizeStoreMapCoordinate(first.lat),



        lng: normalizeStoreMapCoordinate(first.lng),



        label: String(first.label || normalizedQuery).trim(),



      };



    }







    function showStoreAddressMapPoint(lat, lng, zoom = 17) {



      if (!storeLeafletMap || !window.L || !hasStoreAddressMapPoint(lat, lng)) return false;



      const normalizedLat = normalizeStoreMapCoordinate(lat);



      const normalizedLng = normalizeStoreMapCoordinate(lng);



      if (!storeLeafletMarker) {



        storeLeafletMarker = window.L.marker([normalizedLat, normalizedLng], { draggable: true }).addTo(storeLeafletMap);



        storeLeafletMarker.on("dragend", () => {



          const position = storeLeafletMarker.getLatLng();



          setStoreAddressMapPendingPoint(position.lat, position.lng);



        });



      } else {



        storeLeafletMarker.setLatLng([normalizedLat, normalizedLng]);



      }



      storeLeafletMap.setView([normalizedLat, normalizedLng], zoom);



      setStoreAddressMapPendingPoint(normalizedLat, normalizedLng);



      return true;



    }







    function closeStoreAddressMapDialog() {



      storeAddressMapState.open = false;



      setStoreAddressMapModalStatus("", "idle");



      document.body.classList.remove("store-map-modal-open");



      if (settingsStoreAddressMapModal) settingsStoreAddressMapModal.classList.add("hidden");



    }







    async function openStoreAddressMapDialog() {



      if (!settingsStoreAddressMapModal || !settingsStoreAddressMapCanvas) return;



      try {



        const config = await ensureStoreAddressMapConfig();



        if (!hasConfiguredMap(config)) {



          setStoreAddressMapModalStatus(buildMapNotConfiguredMessage(config, "store"), "error");



          document.body.classList.add("store-map-modal-open");



          if (settingsStoreAddressMapModal) settingsStoreAddressMapModal.classList.remove("hidden");



          return;



        }



        if (!window.L) {



          setStoreAddressMapModalStatus("Leaflet не подключён. Проверьте локальные assets карты.", "error");



          document.body.classList.add("store-map-modal-open");



          if (settingsStoreAddressMapModal) settingsStoreAddressMapModal.classList.remove("hidden");



          return;



        }



        document.body.classList.add("store-map-modal-open");



        if (settingsStoreAddressMapModal) settingsStoreAddressMapModal.classList.remove("hidden");



        storeAddressMapState.open = true;



        setStoreAddressMapModalStatus("", "idle");



        if (!applyStoreAddressMapConfig(config)) {



          setStoreAddressMapModalStatus("Не удалось инициализировать карту.", "error");



          return;



        }



        const query = buildStoreAddressMapQuery();



        if (settingsStoreAddressMapSubtitle) {



          settingsStoreAddressMapSubtitle.textContent = query



            ? `Кликните по карте или перетащите маркер. Базовый адрес: ${query}.`



            : "Кликните по карте или перетащите маркер, чтобы уточнить координату.";



        }



        const displayPoint = getStoreAddressMapDisplayPoint();



        if (displayPoint && showStoreAddressMapPoint(displayPoint.lat, displayPoint.lng, getStoreAddressMapZoom(displayPoint))) {



          return;



        }



        const resolvedAddress = await resolveStoreAddressMapLocation(query);



        if (resolvedAddress && showStoreAddressMapPoint(resolvedAddress.lat, resolvedAddress.lng, 17)) {



          setStoreAddressMapFallback(resolvedAddress.lat, resolvedAddress.lng);



          return;



        }



        const fallbackCity = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



        const resolvedCity = fallbackCity ? await resolveStoreAddressMapLocation(fallbackCity) : null;



        if (resolvedCity && showStoreAddressMapPoint(resolvedCity.lat, resolvedCity.lng, 12)) {



          setStoreAddressMapFallback(resolvedCity.lat, resolvedCity.lng);



          return;



        }



        if (storeLeafletMarker) {



          storeLeafletMap.removeLayer(storeLeafletMarker);



          storeLeafletMarker = null;



        }



        storeLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



        setStoreAddressMapPendingPoint(null, null);



      } catch (error) {



        console.error("Failed to open store map:", error);



        setStoreAddressMapModalStatus("Не удалось открыть карту филиала.", "error");



        document.body.classList.add("store-map-modal-open");



        if (settingsStoreAddressMapModal) settingsStoreAddressMapModal.classList.remove("hidden");



      }



    }







    function applyStoreAddressMapSelection() {



      if (!hasStoreAddressMapPoint(storeAddressMapState.pendingLat, storeAddressMapState.pendingLng)) {



        setStoreAddressMapModalStatus("Сначала выберите точку на карте.", "error");



        return;



      }



      setStoreAddressMapCustomPoint(storeAddressMapState.pendingLat, storeAddressMapState.pendingLng);



      closeStoreAddressMapDialog();



    }



    function toggleRightPanelFooter(viewEl, editEl, isVisible) {



      const footerEl = (viewEl && viewEl.closest(".panel-footer"))



        || (editEl && editEl.closest(".panel-footer"));



      if (footerEl) footerEl.classList.toggle("hidden", !isVisible);



    }







    function setActiveRightTab(tabId) {



      activeRightTabId = tabId;



      const section = document.body.getAttribute("data-settings-section");



      const isDeliverySection = section === "delivery";



      if (rightTabs) {



        rightTabs.querySelectorAll(".product-tab").forEach((tab) => {



          tab.classList.toggle("is-active", tab.getAttribute("data-right-tab") === tabId);



        });



      }







      if (rightDefault) rightDefault.classList.toggle("hidden", tabId !== "" || isDeliverySection);



      if (logoPanel) logoPanel.classList.toggle("hidden", tabId !== "logo");



      if (sitePanel) sitePanel.classList.toggle("hidden", tabId !== "site");



      if (domainPanel) domainPanel.classList.toggle("hidden", tabId !== "domain");
      if (pwaQrPanel) pwaQrPanel.classList.toggle("hidden", tabId !== "pwa-qr");
      if (tabId !== "pwa-qr" && tenantPwaDesignerExpanded) {
        closeTenantPwaDesignerExpanded();
      }



      if (telegramAppPanel) telegramAppPanel.classList.toggle("hidden", tabId !== "telegram-app");



      if (maxAppPanel) maxAppPanel.classList.toggle("hidden", tabId !== "max-app");



      if (brandPanel) brandPanel.classList.toggle("hidden", tabId !== "brand");



      if (orderStatusesPanel) orderStatusesPanel.classList.toggle("hidden", tabId !== "order-statuses");



      if (orderPaymentsPanel) orderPaymentsPanel.classList.toggle("hidden", tabId !== "order-payments");



      if (orderDeliveryPanel) orderDeliveryPanel.classList.toggle("hidden", tabId !== "order-delivery");



      if (orderTimeOptionsPanel) orderTimeOptionsPanel.classList.toggle("hidden", tabId !== "order-time-options");



      if (soundsPanel) soundsPanel.classList.toggle("hidden", tabId !== "sounds");



      if (chatAssistantNamePanel) chatAssistantNamePanel.classList.toggle("hidden", tabId !== "chat-assistant-name");



      if (chatOperatorNamePanel) chatOperatorNamePanel.classList.toggle("hidden", tabId !== "chat-operator-name");



      if (chatMessageSettingsPanel) chatMessageSettingsPanel.classList.toggle("hidden", tabId !== "chat-message-settings");



      if (settingsNotificationsPanel) settingsNotificationsPanel.classList.toggle("hidden", tabId !== "notifications");



      if (imagesPanel) imagesPanel.classList.toggle("hidden", tabId !== "images");



      if (printApiPanel) printApiPanel.classList.toggle("hidden", tabId !== "print-api");



      if (systemMapPanel) systemMapPanel.classList.toggle("hidden", tabId !== "system-map");



      if (systemDeliveryZonePolygonPanel) systemDeliveryZonePolygonPanel.classList.toggle("hidden", tabId !== "system-delivery-zone-polygon");



      if (systemTelegramBotPanel) systemTelegramBotPanel.classList.toggle("hidden", tabId !== "system-telegram-bot");

      if (systemMaxBotPanel) systemMaxBotPanel.classList.toggle("hidden", tabId !== "system-max-bot");



      if (systemPollingPanel) systemPollingPanel.classList.toggle("hidden", tabId !== "system-polling");



      toggleRightPanelFooter(settingsSoundsFooterView, settingsSoundsFooterEdit, tabId === "sounds");



      toggleRightPanelFooter(settingsPrintApiFooterView, settingsPrintApiFooterEdit, tabId === "print-api");



      toggleRightPanelFooter(domainFooterView, domainFooterEdit, tabId === "domain");



      if (settingsStorePanel) settingsStorePanel.classList.toggle("hidden", !tabId.startsWith("store-"));



      if (!tabId.startsWith("store-")) {



        closeStoreAddressSuggestPopover();



      }



      if (settingsStoreEmpty) {



        const shouldShow = section === "stores" && tabId === "";



        settingsStoreEmpty.classList.toggle("hidden", !shouldShow);



      }







      if (tabId === "order-statuses" || tabId === "order-payments" || tabId === "order-delivery" || tabId === "order-time-options") {



        ensureListLoaded(tabId);



      }



      if (tabId.startsWith("store-")) {



        applyStoreTabState(tabId);



      }



      if (tabId === "print-api") {



        ensurePrintApiReady();



      } else {



        stopPrintApiAutoRefresh();



      }



      if (tabId === "system-map") {



        loadSystemMapSettings();



      }



      if (tabId === "system-delivery-zone-polygon") {



        loadSystemDeliveryZonePolygonSettings();



      }



      if (tabId === "system-telegram-bot") {



        loadSystemTelegramSettings();



      }



      if (tabId === "system-max-bot") {

        loadSystemMaxSettings();

      }

      if (tabId === "system-polling") {



        loadSystemPollingSettings();



      }



      if (tabId === "notifications") {



        loadNotificationsOverview();



      }



    }







    function ensureTab(tabId, titleText) {



      if (!rightTabs) return;



      let tab = rightTabs.querySelector(`[data-right-tab=\"${tabId}\"]`);



      if (!tab) {



        tab = document.createElement("button");



        tab.type = "button";



        tab.className = "product-tab";



        tab.setAttribute("data-right-tab", tabId);







        const title = document.createElement("span");



        title.className = "product-tab-title";



        title.textContent = titleText;







        const closeBtn = document.createElement("button");



        closeBtn.type = "button";



        closeBtn.className = "product-tab-close";



        closeBtn.setAttribute("aria-label", "Закрыть");



        closeBtn.innerHTML = '<i class="fas fa-times"></i>';







        tab.appendChild(title);



        tab.appendChild(closeBtn);







        tab.addEventListener("click", (e) => {



          const isClose = e.target.closest(".product-tab-close");



          if (isClose) return;



          setActiveRightTab(tabId);



        });







        closeBtn.addEventListener("click", (e) => {



          e.stopPropagation();



          tab.remove();



          if (rightTabs.children.length === 0 && rightHeader) {



            rightHeader.classList.add("hidden");



            rightTabs.classList.add("hidden");



          }



          setActiveRightTab("");



          if (tabId === "logo" && logoCard) logoCard.classList.remove("is-active");



          if (tabId === "site" && siteCard) siteCard.classList.remove("is-active");



          if (tabId === "domain" && domainCard) domainCard.classList.remove("is-active");
          if (tabId === "pwa-qr" && pwaQrCard) pwaQrCard.classList.remove("is-active");



          if (tabId === "telegram-app" && telegramAppCard) telegramAppCard.classList.remove("is-active");



          if (tabId === "max-app" && maxAppCard) maxAppCard.classList.remove("is-active");



          if (tabId === "brand" && brandCard) brandCard.classList.remove("is-active");



          if (tabId === "order-statuses" && orderStatusesCard) orderStatusesCard.classList.remove("is-active");



          if (tabId === "order-payments" && orderPaymentsCard) orderPaymentsCard.classList.remove("is-active");



          if (tabId === "order-delivery" && orderDeliveryCard) orderDeliveryCard.classList.remove("is-active");



          if (tabId === "order-time-options" && orderTimeOptionsCard) orderTimeOptionsCard.classList.remove("is-active");



          if (tabId === "sounds" && soundsCard) soundsCard.classList.remove("is-active");



          if (tabId === "chat-assistant-name" && chatAssistantNameCard) chatAssistantNameCard.classList.remove("is-active");



          if (tabId === "chat-operator-name" && chatOperatorNameCard) chatOperatorNameCard.classList.remove("is-active");



          if (tabId === "chat-message-settings" && chatMessageSettingsCard) chatMessageSettingsCard.classList.remove("is-active");



          if (tabId === "notifications" && notificationsCard) notificationsCard.classList.remove("is-active");



          if (tabId === "images" && imagesCard) imagesCard.classList.remove("is-active");



          if (tabId === "print-api" && printApiCard) printApiCard.classList.remove("is-active");



          if (tabId === "system-map" && systemMapCard) systemMapCard.classList.remove("is-active");



          if (tabId === "system-delivery-zone-polygon" && systemDeliveryZonePolygonCard) systemDeliveryZonePolygonCard.classList.remove("is-active");



          if (tabId === "system-telegram-bot" && systemTelegramBotCard) systemTelegramBotCard.classList.remove("is-active");



          if (tabId === "system-polling" && systemPollingCard) systemPollingCard.classList.remove("is-active");



          if (tabId.startsWith("store-")) {



            storeTabs.delete(tabId);



            if (activeRightTabId === tabId) {



              activeRightTabId = "";



              const nextTab = rightTabs.querySelector(".product-tab");



              if (nextTab) {



                setActiveRightTab(nextTab.getAttribute("data-right-tab"));



                return;



              }



            }



            storesState.selectedId = null;



            storesState.snapshot = null;



            storesState.mode = "view";



            renderStoresList(storesState.items);



            showStorePanel(false);



          }



        });







        rightTabs.appendChild(tab);



      } else if (titleText) {



        const titleEl = tab.querySelector(".product-tab-title");



        if (titleEl) titleEl.textContent = titleText;



      }







      if (rightHeader) rightHeader.classList.remove("hidden");



      rightTabs.classList.remove("hidden");



      setActiveRightTab(tabId);



      if (tabId === "logo" && logoCard) logoCard.classList.add("is-active");



      if (tabId === "site" && siteCard) siteCard.classList.add("is-active");



      if (tabId === "domain" && domainCard) domainCard.classList.add("is-active");
      if (tabId === "pwa-qr" && pwaQrCard) pwaQrCard.classList.add("is-active");
      if (tabId === "pwa-qr") scheduleTenantPwaDesignerRender();



      if (tabId === "telegram-app" && telegramAppCard) telegramAppCard.classList.add("is-active");



      if (tabId === "max-app" && maxAppCard) maxAppCard.classList.add("is-active");



      if (tabId === "brand" && brandCard) brandCard.classList.add("is-active");



      if (tabId === "order-statuses" && orderStatusesCard) orderStatusesCard.classList.add("is-active");



      if (tabId === "order-payments" && orderPaymentsCard) orderPaymentsCard.classList.add("is-active");



      if (tabId === "order-delivery" && orderDeliveryCard) orderDeliveryCard.classList.add("is-active");



      if (tabId === "order-time-options" && orderTimeOptionsCard) orderTimeOptionsCard.classList.add("is-active");



      if (tabId === "sounds" && soundsCard) soundsCard.classList.add("is-active");



      if (tabId === "chat-assistant-name" && chatAssistantNameCard) chatAssistantNameCard.classList.add("is-active");



      if (tabId === "chat-operator-name" && chatOperatorNameCard) chatOperatorNameCard.classList.add("is-active");



      if (tabId === "chat-message-settings" && chatMessageSettingsCard) chatMessageSettingsCard.classList.add("is-active");



      if (tabId === "notifications" && notificationsCard) notificationsCard.classList.add("is-active");



      if (tabId === "images" && imagesCard) imagesCard.classList.add("is-active");



      if (tabId === "print-api" && printApiCard) printApiCard.classList.add("is-active");



      if (tabId === "system-map" && systemMapCard) systemMapCard.classList.add("is-active");



      if (tabId === "system-delivery-zone-polygon" && systemDeliveryZonePolygonCard) systemDeliveryZonePolygonCard.classList.add("is-active");



      if (tabId === "system-telegram-bot" && systemTelegramBotCard) systemTelegramBotCard.classList.add("is-active");



      if (tabId === "system-polling" && systemPollingCard) systemPollingCard.classList.add("is-active");



    }







    if (logoCard) {



      logoCard.addEventListener("click", () => {



        ensureTab("logo", "Логотип и фавикон");



      });



    }







    if (siteCard) {



      siteCard.addEventListener("click", () => {



        ensureTab("site", "Данные сайта");



      });



    }







    const domainCard = document.getElementById("settingsDomainCard");



    const domainInputEl = document.getElementById("domainInput");



    const domainNewFieldEl = document.getElementById("domainNewField");



    const domainInstructionFieldEl = document.getElementById("domainInstructionField");



    const domainActionFieldEl = document.getElementById("domainActionField");



    const domainCheckResultsEl = document.getElementById("domainCheckResults");



    const domainAddWrapEl = document.getElementById("settingsDomainAddWrap");



    const domainEditBtn = document.getElementById("settingsDomainEditBtn");



    const domainAddBtn = document.getElementById("settingsDomainAddBtn");



    const domainAddInlineBtn = document.getElementById("domainAddInlineBtn");
    const domainCancelInlineBtn = document.getElementById("domainCancelInlineBtn");



    const domainSaveBtn = document.getElementById("settingsDomainSaveBtn");



    const domainCancelBtn = document.getElementById("settingsDomainCancelBtn");



    const domainFooterView = document.getElementById("settingsDomainFooterView");



    const domainFooterEdit = document.getElementById("settingsDomainFooterEdit");



    const domainConnectedHintEl = document.getElementById("domainConnectedHint");



    const domainAsciiInfoHintEl = document.getElementById("domainAsciiInfoHint");



    const domainAsciiInfoBtn = document.getElementById("domainAsciiInfoBtn");



    const domainSubdomainInputEl = document.getElementById("subdomainInput");

    const tenantPwaQrTargetSelect = document.getElementById("tenantPwaQrTargetSelect");
    const tenantPwaQrOpenBtn = document.getElementById("tenantPwaQrOpenBtn");
    const tenantPwaQrCopyBtn = document.getElementById("tenantPwaQrCopyBtn");
    const tenantPwaDevQrTargetSelect = document.getElementById("tenantPwaDevQrTargetSelect");
    const tenantPwaDevQrOpenBtn = document.getElementById("tenantPwaDevQrOpenBtn");
    const tenantPwaDevQrCopyBtn = document.getElementById("tenantPwaDevQrCopyBtn");
    const tenantQrDesignerSourceSelect = document.getElementById("tenantQrDesignerSourceSelect");
    const tenantQrDesignerTargetSelect = document.getElementById("tenantQrDesignerTargetSelect");
    const tenantQrDesignerRatioGroup = document.getElementById("tenantQrDesignerRatioGroup");
    const tenantQrDesignerStyleSelect = document.getElementById("tenantQrDesignerStyleSelect");
    const tenantQrDesignerColorInput = document.getElementById("tenantQrDesignerColorInput");
    const tenantQrDesignerBackgroundColorInput = document.getElementById("tenantQrDesignerBackgroundColorInput");
    const tenantQrDesignerCornerRadiusInput = document.getElementById("tenantQrDesignerCornerRadiusInput");
    const tenantQrDesignerCornerRadiusMinus = document.getElementById("tenantQrDesignerCornerRadiusMinus");
    const tenantQrDesignerCornerRadiusPlus = document.getElementById("tenantQrDesignerCornerRadiusPlus");
    const tenantQrDesignerColorPalette = document.getElementById("tenantQrDesignerColorPalette");
    const tenantQrDesignerBgPalette = document.getElementById("tenantQrDesignerBgPalette");
    const tenantQrDesignerBackgroundGradientBtn = document.getElementById("tenantQrDesignerBackgroundGradientBtn");
    const tenantQrDesignerBackgroundInput = document.getElementById("tenantQrDesignerBackgroundInput");
    const tenantQrDesignerBackgroundUploadBtn = document.getElementById("tenantQrDesignerBackgroundUploadBtn");
    const tenantQrDesignerUseSiteLogoToggle = document.getElementById("tenantQrDesignerUseSiteLogoToggle");
    const tenantQrDesignerLogoInput = null;
    const tenantQrDesignerLogoUploadBtn = null;
    const tenantQrDesignerUseSiteLogoBtn = null;
    const tenantQrDesignerLogoResetBtn = null;
    const tenantQrDesignerCopyBtn = document.getElementById("tenantQrDesignerCopyBtn");
    const tenantQrDesignerSaveCardBtn = document.getElementById("tenantQrDesignerSaveCardBtn");
    const tenantQrDesignerSaveQrBtn = document.getElementById("tenantQrDesignerSaveQrBtn");
    const tenantQrDesignerStage = document.getElementById("tenantQrDesignerStage");
    const tenantQrDesignerCardEyebrow = document.getElementById("tenantQrDesignerCardEyebrow");
    const tenantQrDesignerCardEyebrowInput = document.getElementById("tenantQrDesignerCardEyebrowInput");
    const tenantQrDesignerExpandedCloseBtn = document.getElementById("tenantQrDesignerExpandedCloseBtn");
    const tenantQrDesignerExpandedLayer = document.getElementById("tenantQrDesignerExpandedLayer");



    if (domainCard) {



      domainCard.addEventListener("click", () => {



        ensureTab("domain", "Домен");



      });



    }



    if (pwaQrCard) {

      pwaQrCard.addEventListener("click", () => {

        ensureTab("pwa-qr", "QR для установки PWA");

      });

    }

    function resetDomainCancelButton() {



      if (!domainCancelBtn) return;



      domainCancelConfirm = false;



      domainCancelBtn.classList.remove("is-confirm");



      domainCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



      domainCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



      domainCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function toAsciiHostForDisplay(hostValue) {



      const raw = String(hostValue || "").trim();



      if (!raw) return "";



      try {



        const parsed = new URL(`http://${raw}`);



        return String(parsed.hostname || "").trim().toLowerCase();



      } catch (_) {



        return raw.toLowerCase();



      }



    }







    function renderDomainViewState() {



      const autoConnectEnabled = !!(domainSetup && domainSetup.auto_connect_enabled);



      const activeDomainValue = getCurrentDomainValue();



      if (domainInputEl) {



        if (domainDraftMode) {



          // keep typed value while adding a new domain



        } else {



          const selected = getSelectedTenantDomain();



          domainInputEl.value = selected



            ? String(selected.domain || selected.domain_ascii || "")



            : (domainOriginalValue || domainAsciiValue || "");



        }



      }



      if (domainNewFieldEl) domainNewFieldEl.classList.toggle("hidden", !domainDraftMode);



      if (domainInstructionFieldEl) domainInstructionFieldEl.classList.remove("hidden");



      if (domainActionFieldEl) domainActionFieldEl.classList.remove("hidden");



      if (domainCheckResultsEl) domainCheckResultsEl.classList.remove("hidden");



      if (domainInputEl) {



        domainInputEl.readOnly = !domainDraftMode;



        domainInputEl.disabled = !domainDraftMode;



      }



      if (domainFooterView) domainFooterView.classList.toggle("hidden", domainDraftMode || domainManageMode);



      if (domainFooterEdit) domainFooterEdit.classList.toggle("hidden", !(domainDraftMode || domainManageMode));



      if (domainAddWrapEl) domainAddWrapEl.classList.toggle("hidden", domainDraftMode);



      if (domainAddBtn) {
        domainAddBtn.classList.toggle("hidden", domainDraftMode);
        domainAddBtn.disabled = !domainManageMode;
        domainAddBtn.setAttribute("aria-disabled", domainManageMode ? "false" : "true");
      }

      if (domainSubdomainInputEl) {
        domainSubdomainInputEl.readOnly = !domainManageMode;
        domainSubdomainInputEl.disabled = !domainManageMode;
      }

      if (domainSaveBtn) {
        domainSaveBtn.classList.toggle("hidden", !(domainDraftMode || domainManageMode));
        domainSaveBtn.textContent = "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c";
      }

      if (domainAddInlineBtn) {
        domainAddInlineBtn.classList.toggle("hidden", !domainDraftMode);
      }
      if (domainCancelInlineBtn) {
        domainCancelInlineBtn.classList.toggle("hidden", !domainDraftMode);
      }

      renderTenantDomains();
      renderTenantPwaInstallQr();
      renderTenantPwaDevInstallQr();

      const connectBtnEl = document.getElementById("domainConnectBtn");
      if (connectBtnEl) {
        connectBtnEl.disabled = !domainManageMode || !autoConnectEnabled || !activeDomainValue;
      }

      const checkBtnEl = document.getElementById("domainCheckBtn");
      if (checkBtnEl) checkBtnEl.disabled = !domainManageMode || !activeDomainValue;
    }

    function setDomainDraftMode(enabled) {
      domainDraftMode = Boolean(enabled);
      if (domainDraftMode) domainManageMode = true;
      if (domainAsciiInfoHintEl && !domainDraftMode) domainAsciiInfoHintEl.classList.add("hidden");
      resetDomainCancelButton();
      renderDomainViewState();
    }

    function setDomainManageMode(enabled) {
      domainManageMode = Boolean(enabled);
      if (domainManageMode) {
        domainDraftMode = false;
        snapshotDomainEnabledDraft();
      } else {
        domainEnabledDraft = null;
      }
      resetDomainCancelButton();
      renderDomainViewState();
    }

    function cancelDomainDraft() {
      if (domainInputEl) domainInputEl.value = "";
      if (domainDraftMode) {
        setDomainManageMode(true);
      } else {
        setDomainManageMode(false);
      }
    }

    async function submitDomainFromInput() {
      if (!domainInputEl) return false;

      const value = String(domainInputEl.value || "").trim();
      if (!value) {
        alert("\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0434\u043e\u043c\u0435\u043d.");
        return false;
      }

      let data = null;
      try {
        const res = await authFetch("/api/admin/tenant/domains", {
          method: "POST",
          body: JSON.stringify({ domain: value })
        });
        data = await res.json();
      } catch (err) {
        data = null;
      }

      if (!data || !data.ok) {
        if (data && data.error === "CUSTOM_DOMAIN_TAKEN") {
          alert("\u042d\u0442\u043e\u0442 \u0434\u043e\u043c\u0435\u043d \u0443\u0436\u0435 \u043f\u0440\u0438\u0432\u044f\u0437\u0430\u043d \u043a \u0434\u0440\u0443\u0433\u043e\u043c\u0443 \u0442\u0435\u043d\u0430\u043d\u0442\u0443.");
        } else if (data && data.error === "INVALID_CUSTOM_DOMAIN") {
          alert("\u041d\u0435\u043a\u043e\u0440\u0440\u0435\u043a\u0442\u043d\u044b\u0439 \u0434\u043e\u043c\u0435\u043d. \u041f\u0440\u043e\u0432\u0435\u0440\u044c\u0442\u0435 \u0444\u043e\u0440\u043c\u0430\u0442.");
        } else {
          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0434\u043e\u043c\u0435\u043d.");
        }
        return false;
      }

      if (data.tenant) {
        updateTenantCache(data.tenant);
        applyBrandFromTenant(data.tenant);
        updateShopLink(data.tenant);
        const nextDomains = normalizeTenantDomains(data.tenant.domains);
        const added = nextDomains.find((item) => item.domain_ascii === toAsciiHostForDisplay(value));
        selectedTenantDomainId = added ? added.id : selectedTenantDomainId;
        applyDomainSetup(data.tenant);
      }

      if (domainInputEl) domainInputEl.value = "";
      setDomainManageMode(true);
      return true;
    }

    async function submitSubdomainFromInputIfChanged() {
      if (!domainSubdomainInputEl) return true;
      const nextSubdomain = String(domainSubdomainInputEl.value || "").trim().toLowerCase();
      const currentSubdomain = String((siteOriginal && siteOriginal.subdomain) || "").trim().toLowerCase();
      if (nextSubdomain === currentSubdomain) return true;

      const data = await updateTenantFields({ subdomain: nextSubdomain || null });
      if (!data || !data.ok) {
        if (data && data.error === "INVALID_SUBDOMAIN") {
          alert("Субдомен: только латиница, цифры и дефис.");
        } else if (data && data.error === "SUBDOMAIN_TAKEN") {
          alert("Субдомен уже занят.");
        } else {
          alert("Не удалось сохранить субдомен.");
        }
        await loadTenantProfile();
        return false;
      }

      if (data.tenant) {
        updateTenantCache(data.tenant);
        applyBrandFromTenant(data.tenant);
        updateShopLink(data.tenant);
        applyDomainSetup(data.tenant);
        siteOriginal = {
          ...siteOriginal,
          subdomain: String(data.tenant.subdomain || "")
        };
        siteDraft = {
          ...siteDraft,
          subdomain: String(data.tenant.subdomain || "")
        };
      }
      return true;
    }

    async function submitDomainEnabledDraftIfChanged() {
      if (!domainEnabledDraft) return true;
      const changed = tenantDomains.filter((item) => {
        const itemId = Number(item && item.id || 0);
        if (!itemId || !domainEnabledDraft.has(itemId)) return false;
        return !!(item.is_enabled !== false) !== !!domainEnabledDraft.get(itemId);
      });
      if (!changed.length) return true;

      for (const item of changed) {
        const itemId = Number(item.id || 0);
        const nextEnabled = !!domainEnabledDraft.get(itemId);
        let data = null;
        try {
          const res = await authFetch(`/api/admin/tenant/domains/${itemId}`, {
            method: "PATCH",
            body: JSON.stringify({ is_enabled: nextEnabled ? 1 : 0 })
          });
          data = await res.json();
        } catch (_) {
          data = null;
        }
        if (!data || !data.ok || !data.tenant) {
          alert("Не удалось сохранить состояние доменов.");
          await loadTenantProfile();
          return false;
        }
        updateTenantCache(data.tenant);
        applyBrandFromTenant(data.tenant);
        updateShopLink(data.tenant);
        applyDomainSetup(data.tenant);
      }

      snapshotDomainEnabledDraft();
      return true;
    }

    if (domainEditBtn) {
      domainEditBtn.addEventListener("click", () => {
        setDomainManageMode(true);
      });
    }

    if (domainAddBtn) {
      domainAddBtn.addEventListener("click", () => {
        setDomainDraftMode(true);
        if (domainInputEl) domainInputEl.value = "";
        if (domainAsciiInfoHintEl) domainAsciiInfoHintEl.classList.add("hidden");
        if (domainInputEl) domainInputEl.focus();
      });
    }

    if (domainAddInlineBtn) {
      domainAddInlineBtn.addEventListener("click", async () => {
        if (!domainDraftMode) return;
        await submitDomainFromInput();
      });
    }

    if (domainCancelInlineBtn) {
      domainCancelInlineBtn.addEventListener("click", () => {
        if (!domainDraftMode) return;
        if (domainInputEl) domainInputEl.value = "";
        if (domainAsciiInfoHintEl) domainAsciiInfoHintEl.classList.add("hidden");
        setDomainManageMode(true);
      });
    }

    if (domainCancelBtn) {
      domainCancelBtn.addEventListener("click", () => {
        if (!domainDraftMode && !domainManageMode) return;
        cancelDomainDraft();
      });
    }

    if (domainSaveBtn) {
      domainSaveBtn.addEventListener("click", async () => {
        const idleText = String(domainSaveBtn.textContent || "Сохранить");
        domainSaveBtn.disabled = true;
        domainSaveBtn.textContent = "Сохранение...";
        try {
          if (domainManageMode && !domainDraftMode) {
            const domainsSaved = await submitDomainEnabledDraftIfChanged();
            if (!domainsSaved) return;
            const subdomainSaved = await submitSubdomainFromInputIfChanged();
            if (subdomainSaved) setDomainManageMode(false);
            return;
          }

          if (!domainDraftMode || !domainInputEl) return;
          const saved = await submitDomainFromInput();
          if (saved) {
            const subdomainSaved = await submitSubdomainFromInputIfChanged();
            if (subdomainSaved) setDomainManageMode(false);
          }
        } finally {
          domainSaveBtn.disabled = false;
          domainSaveBtn.textContent = idleText || "Сохранить";
        }
      });
    }

    if (domainAsciiInfoBtn) {



      domainAsciiInfoBtn.addEventListener("click", () => {



        if (!domainAsciiInfoHintEl) return;



        const currentlyHidden = domainAsciiInfoHintEl.classList.contains("hidden");



        if (!currentlyHidden) {



          domainAsciiInfoHintEl.classList.add("hidden");



          return;



        }



        domainAsciiInfoHintEl.textContent =



          "\u0414\u043e\u043c\u0435\u043d \u0432 \u043f\u043e\u043b\u0435 \u043f\u043e\u043a\u0430\u0437\u0430\u043d \u0432 ASCII (punycode). "



          + "\u042d\u0442\u043e \u0442\u0435\u0445\u043d\u0438\u0447\u0435\u0441\u043a\u0438\u0439 \u0444\u043e\u0440\u043c\u0430\u0442 \u0434\u043b\u044f DNS/SSL \u0438 \u0441\u0442\u0430\u0431\u0438\u043b\u044c\u043d\u043e\u0433\u043e \u0440\u043e\u0443\u0442\u0438\u043d\u0433\u0430 IDN-\u0434\u043e\u043c\u0435\u043d\u043e\u0432.";



        domainAsciiInfoHintEl.classList.remove("hidden");



      });



    }







    if (tenantPwaQrTargetSelect) {
      tenantPwaQrTargetSelect.addEventListener("change", () => {
        selectedTenantPwaTargetId = String(tenantPwaQrTargetSelect.value || "").trim() || null;
        renderTenantPwaInstallQr();
      });
    }

    if (tenantPwaQrOpenBtn) {
      tenantPwaQrOpenBtn.addEventListener("click", () => {
        const selectedTarget = getSelectedTenantPwaInstallTarget();
        if (!selectedTarget || !selectedTarget.url) return;
        window.open(selectedTarget.url, "_blank");
      });
    }

    if (tenantPwaQrCopyBtn) {
      const copyBtnOriginalHtml = tenantPwaQrCopyBtn.innerHTML;
      tenantPwaQrCopyBtn.addEventListener("click", () => {
        const selectedTarget = getSelectedTenantPwaInstallTarget();
        if (!selectedTarget || !selectedTarget.url || !navigator.clipboard) return;
        navigator.clipboard.writeText(selectedTarget.url).then(() => {
          tenantPwaQrCopyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано';
          setTimeout(() => {
            tenantPwaQrCopyBtn.innerHTML = copyBtnOriginalHtml;
          }, 1500);
        }).catch(() => {
          alert("Не удалось скопировать ссылку.");
        });
      });
    }

    if (tenantPwaDevQrTargetSelect) {
      tenantPwaDevQrTargetSelect.addEventListener("change", () => {
        selectedTenantPwaDevTargetId = String(tenantPwaDevQrTargetSelect.value || "").trim() || null;
        renderTenantPwaDevInstallQr();
      });
    }

    if (tenantPwaDevQrOpenBtn) {
      tenantPwaDevQrOpenBtn.addEventListener("click", () => {
        const selectedTarget = getSelectedTenantPwaDevInstallTarget();
        if (!selectedTarget || !selectedTarget.url) return;
        window.open(selectedTarget.url, "_blank");
      });
    }

    if (tenantPwaDevQrCopyBtn) {
      const copyBtnOriginalHtml = tenantPwaDevQrCopyBtn.innerHTML;
      tenantPwaDevQrCopyBtn.addEventListener("click", () => {
        const selectedTarget = getSelectedTenantPwaDevInstallTarget();
        if (!selectedTarget || !selectedTarget.url || !navigator.clipboard) return;
        navigator.clipboard.writeText(selectedTarget.url).then(() => {
          tenantPwaDevQrCopyBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано';
          setTimeout(() => {
            tenantPwaDevQrCopyBtn.innerHTML = copyBtnOriginalHtml;
          }, 1500);
        }).catch(() => {
          alert("Не удалось скопировать ссылку.");
        });
      });
    }

    if (tenantQrDesignerSourceSelect) {
      tenantQrDesignerSourceSelect.addEventListener("change", () => {
        tenantPwaDesignerSourceMode = String(tenantQrDesignerSourceSelect.value || "prod").trim() === "dev" ? "dev" : "prod";
        if (tenantPwaDesignerSourceMode === "prod") {
          syncTenantPwaTargetFromSelectedDomain();
        } else {
          syncSelectedTenantPwaDevInstallTarget();
        }
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerTargetSelect) {
      tenantQrDesignerTargetSelect.addEventListener("change", () => {
        const nextValue = String(tenantQrDesignerTargetSelect.value || "").trim() || null;
        if (tenantPwaDesignerSourceMode === "dev") {
          selectedTenantPwaDevTargetId = nextValue;
        } else {
          selectedTenantPwaTargetId = nextValue;
        }
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerRatioGroup) {
      tenantQrDesignerRatioGroup.addEventListener("click", (event) => {
        const btn = event.target && event.target.closest("[data-tenant-qr-ratio]");
        if (!btn) return;
        tenantPwaDesignerCardRatio = String(btn.getAttribute("data-tenant-qr-ratio") || "1:1").trim() || "1:1";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerStyleSelect) {
      tenantQrDesignerStyleSelect.addEventListener("change", () => {
        tenantPwaDesignerQrStyle = String(tenantQrDesignerStyleSelect.value || "rounded").trim() || "rounded";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerColorInput) {
      tenantQrDesignerColorInput.addEventListener("input", () => {
        tenantPwaDesignerQrColor = String(tenantQrDesignerColorInput.value || "#111827").trim() || "#111827";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerBackgroundColorInput) {
      tenantQrDesignerBackgroundColorInput.addEventListener("input", () => {
        tenantPwaDesignerBackgroundCustomColor = String(tenantQrDesignerBackgroundColorInput.value || "").trim();
        tenantPwaDesignerBackgroundImage = "";
        renderTenantPwaDesigner();
      });
    }

    bindTenantPwaDesignerStepper(
      tenantQrDesignerCornerRadiusInput,
      tenantQrDesignerCornerRadiusMinus,
      tenantQrDesignerCornerRadiusPlus,
      (nextValue) => {
        tenantPwaDesignerCornerRadius = normalizeTenantPwaDesignerCornerRadius(nextValue, 30);
        renderTenantPwaDesigner();
      }
    );

    if (tenantQrDesignerColorPalette) {
      tenantQrDesignerColorPalette.addEventListener("click", (event) => {
        const btn = event.target && event.target.closest("[data-tenant-qr-color]");
        if (!btn) return;
        tenantPwaDesignerQrColor = String(btn.getAttribute("data-tenant-qr-color") || "#111827").trim() || "#111827";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerBgPalette) {
      tenantQrDesignerBgPalette.addEventListener("click", (event) => {
        const btn = event.target && event.target.closest("[data-tenant-qr-bg]");
        if (!btn) return;
        tenantPwaDesignerBackgroundPresetId = String(btn.getAttribute("data-tenant-qr-bg") || "warm-sun").trim() || "warm-sun";
        tenantPwaDesignerBackgroundCustomColor = "";
        tenantPwaDesignerBackgroundImage = "";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerBackgroundGradientBtn) {
      tenantQrDesignerBackgroundGradientBtn.addEventListener("click", () => {
        tenantPwaDesignerBackgroundGradientEnabled = !tenantPwaDesignerBackgroundGradientEnabled;
        tenantPwaDesignerBackgroundImage = "";
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerBackgroundUploadBtn && tenantQrDesignerBackgroundInput) {
      tenantQrDesignerBackgroundUploadBtn.addEventListener("click", () => {
        tenantQrDesignerBackgroundInput.click();
      });
    }

    if (tenantQrDesignerBackgroundInput) {
      tenantQrDesignerBackgroundInput.addEventListener("change", async () => {
        const file = tenantQrDesignerBackgroundInput.files && tenantQrDesignerBackgroundInput.files[0];
        if (!file) return;
        try {
          tenantPwaDesignerBackgroundImage = await readImageFileAsDataUrl(file);
          renderTenantPwaDesigner();
        } catch (err) {
          console.error("tenant qr background upload error:", err);
          alert("Не удалось загрузить фон.");
        } finally {
          tenantQrDesignerBackgroundInput.value = "";
        }
      });
    }

    if (tenantQrDesignerUseSiteLogoToggle) {
      tenantQrDesignerUseSiteLogoToggle.addEventListener("change", () => {
        tenantPwaDesignerUseSiteLogo = !!tenantQrDesignerUseSiteLogoToggle.checked;
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerLogoUploadBtn && tenantQrDesignerLogoInput) {
      tenantQrDesignerLogoUploadBtn.addEventListener("click", () => {
        tenantQrDesignerLogoInput.click();
      });
    }

    if (tenantQrDesignerLogoInput) {
      tenantQrDesignerLogoInput.addEventListener("change", async () => {
        const file = tenantQrDesignerLogoInput.files && tenantQrDesignerLogoInput.files[0];
        if (!file) return;
        try {
          tenantPwaDesignerLogoImage = await readImageFileAsDataUrl(file);
          renderTenantPwaDesigner();
        } catch (err) {
          console.error("tenant qr logo upload error:", err);
          alert("Не удалось загрузить логотип.");
        } finally {
          tenantQrDesignerLogoInput.value = "";
        }
      });
    }

    if (tenantQrDesignerUseSiteLogoBtn) {
      tenantQrDesignerUseSiteLogoBtn.addEventListener("click", () => {
        const tenantInfo = getTenantPwaDesignerTenantInfo();
        if (!tenantInfo.logoUrl) {
          alert("У сайта пока нет логотипа для вставки РІ центр QR.");
          return;
        }
        tenantPwaDesignerLogoImage = tenantInfo.logoUrl;
        renderTenantPwaDesigner();
      });
    }

    if (tenantQrDesignerLogoResetBtn) {
      tenantQrDesignerLogoResetBtn.addEventListener("click", () => {
        tenantPwaDesignerLogoImage = "";
        renderTenantPwaDesigner();
      });
    }


    if (tenantQrDesignerCopyBtn) {
      tenantQrDesignerCopyBtn.addEventListener("click", async () => {
        const selectedTarget = getSelectedTenantPwaDesignerTarget();
        if (!selectedTarget || !selectedTarget.url || !navigator.clipboard) return;
        try {
          await navigator.clipboard.writeText(String(selectedTarget.url || ""));
          pulseTenantPwaDesignerButton(tenantQrDesignerCopyBtn, '<i class="fas fa-check"></i>');
        } catch (_) {
          alert("Не удалось скопировать ссылку.");
        }
      });
    }

    if (tenantQrDesignerSaveCardBtn) {
      tenantQrDesignerSaveCardBtn.addEventListener("click", () => {
        downloadTenantPwaDesignerCard();
      });
    }

    if (tenantQrDesignerSaveQrBtn) {
      tenantQrDesignerSaveQrBtn.addEventListener("click", () => {
        downloadTenantPwaDesignerQrSafe();
      });
    }

    if (tenantQrDesignerCardEyebrow) {
      const startBadgeEdit = (event) => {
        if (event) {
          event.preventDefault();
          event.stopPropagation();
        }
        setTenantPwaDesignerBadgeEditing(true);
      };
      tenantQrDesignerCardEyebrow.addEventListener("click", startBadgeEdit);
      tenantQrDesignerCardEyebrow.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        startBadgeEdit(event);
      });
    }

    if (tenantQrDesignerCardEyebrowInput) {
      tenantQrDesignerCardEyebrowInput.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      tenantQrDesignerCardEyebrowInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitTenantPwaDesignerBadgeEdit(true);
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          commitTenantPwaDesignerBadgeEdit(false);
        }
      });
      tenantQrDesignerCardEyebrowInput.addEventListener("blur", () => {
        window.setTimeout(() => {
          commitTenantPwaDesignerBadgeEdit(true);
        }, 0);
      });
    }

    if (document && !document.__tenantPwaDesignerBadgeOutsideClickBound) {
      document.__tenantPwaDesignerBadgeOutsideClickBound = true;
      document.addEventListener("pointerdown", (event) => {
        if (!tenantPwaDesignerBadgeEditing) return;
        const eyebrowEl = document.getElementById("tenantQrDesignerCardEyebrow");
        if (eyebrowEl && eyebrowEl.contains(event.target)) return;
        commitTenantPwaDesignerBadgeEdit(true);
      });
    }

    if (tenantQrDesignerStage) {
      tenantQrDesignerStage.addEventListener("click", (event) => {
        const targetEl = event && event.target;
        if ((Date.now() - tenantPwaDesignerBadgeCommitTs) < 220) return;
        if (tenantPwaDesignerBadgeEditing) {
          commitTenantPwaDesignerBadgeEdit(true);
          return;
        }
        if (targetEl && targetEl.closest && targetEl.closest("#tenantQrDesignerCardEyebrow")) return;
        if (tenantPwaDesignerExpanded) {
          closeTenantPwaDesignerExpanded();
          return;
        }
        openTenantPwaDesignerExpanded();
      });
      tenantQrDesignerStage.addEventListener("keydown", (event) => {
        if (tenantPwaDesignerBadgeEditing) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        if (tenantPwaDesignerExpanded) {
          closeTenantPwaDesignerExpanded();
          return;
        }
        openTenantPwaDesignerExpanded();
      });
    }

    if (tenantQrDesignerExpandedCloseBtn) {
      tenantQrDesignerExpandedCloseBtn.addEventListener("click", () => {
        closeTenantPwaDesignerExpanded();
      });
    }

    if (tenantQrDesignerExpandedLayer) {
      tenantQrDesignerExpandedLayer.addEventListener("click", (event) => {
        if (!tenantPwaDesignerExpanded) return;
        const targetEl = event && event.target;
        if (!targetEl || !targetEl.closest) return;
        const eyebrowEl = targetEl.closest(".tenant-qr-card__eyebrow");
        if (!eyebrowEl) return;
        event.preventDefault();
        event.stopPropagation();
        setTenantPwaDesignerBadgeEditing(true);
      });
    }

    if (window && !window.__tenantPwaDesignerExpandedBound) {
      window.__tenantPwaDesignerExpandedBound = true;
      window.addEventListener("resize", () => {
        if (!tenantPwaDesignerExpanded) return;
        scheduleTenantPwaDesignerExpandedLayoutSync();
        renderTenantPwaDesigner();
      });
      window.addEventListener("scroll", () => {
        if (!tenantPwaDesignerExpanded) return;
        scheduleTenantPwaDesignerExpandedLayoutSync();
      }, true);
      window.addEventListener("keydown", (event) => {
        if (event.key !== "Escape" || !tenantPwaDesignerExpanded) return;
        closeTenantPwaDesignerExpanded();
      });
    }


    const tenantQrDesignerSiteNameInput = document.querySelector('[data-site-input="site_name"]');
    if (tenantQrDesignerSiteNameInput) {
      tenantQrDesignerSiteNameInput.addEventListener("input", () => {
        renderTenantPwaDesigner();
      });
    }

    setDomainDraftMode(false);







    const domainListEl = document.getElementById("domainList");



    if (domainListEl) {



      domainListEl.addEventListener("click", async (event) => {



        const actionBtn = event.target.closest("[data-domain-action]");



        const itemEl = event.target.closest("[data-domain-id]");



        if (!itemEl) return;



        const domainId = Number(itemEl.getAttribute("data-domain-id") || 0);



        if (!domainId) return;



        selectedTenantDomainId = domainId;
        syncTenantPwaTargetFromSelectedDomain();







        if (!actionBtn) {



          renderDomainViewState();

          if (typeof runDomainStatusCheck === "function") {
            runDomainStatusCheck({ allowReadOnly: true });
          }



          return;



        }

        if (actionBtn.disabled || actionBtn.getAttribute("aria-disabled") === "true") {
          return;
        }







        const action = actionBtn.getAttribute("data-domain-action");



        if (action === "toggle") {
          const currentItem = tenantDomains.find((item) => Number(item.id || 0) === domainId);
          const currentEnabledDraft = currentItem ? getDomainEnabledState(currentItem) : !itemEl.classList.contains("is-disabled");
          const nextEnabledDraft = actionBtn.matches(".switch-input")
            ? !!actionBtn.checked
            : !currentEnabledDraft;
          if (!domainEnabledDraft) snapshotDomainEnabledDraft();
          if (domainEnabledDraft) domainEnabledDraft.set(domainId, nextEnabledDraft);
          renderDomainViewState();
          return;



          const nextEnabled = actionBtn.matches(".switch-input")



            ? !!actionBtn.checked



            : itemEl.classList.contains("is-disabled");



          const res = await authFetch(`/api/admin/tenant/domains/${domainId}`, {



            method: "PATCH",



            body: JSON.stringify({ is_enabled: nextEnabled ? 1 : 0 })



          });



          const data = await res.json();



          if (data && data.ok && data.tenant) {



            updateTenantCache(data.tenant);



            applyBrandFromTenant(data.tenant);



            updateShopLink(data.tenant);



            applyDomainSetup(data.tenant);



            renderDomainViewState();



          } else {



            renderDomainViewState();



            alert("Не удалось изменить состояние домена.");



          }



          return;



        }







        if (action === "delete") {



          if (!window.confirm("Удалить домен?")) return;



          const res = await authFetch(`/api/admin/tenant/domains/${domainId}`, {



            method: "DELETE"



          });



          const data = await res.json();



          if (data && data.ok && data.tenant) {



            updateTenantCache(data.tenant);



            applyBrandFromTenant(data.tenant);



            updateShopLink(data.tenant);



            applyDomainSetup(data.tenant);



            renderDomainViewState();



            await loadTenantProfile();



          } else {



            alert("Не удалось удалить домен.");



          }



        }



      });



    }







    if (telegramAppCard) {



      telegramAppCard.addEventListener("click", () => {



        ensureTab("telegram-app", "Мини-приложение Telegram");



      });



    }







    if (maxAppCard) {



      maxAppCard.addEventListener("click", () => {



        ensureTab("max-app", "Мини-приложение MAX");



      });



    }







    if (systemMapCard) {



      systemMapCard.addEventListener("click", () => {



        ensureTab("system-map", "Карта");



      });



    }







    if (systemDeliveryZonePolygonCard) {



      systemDeliveryZonePolygonCard.addEventListener("click", () => {



        ensureTab("system-delivery-zone-polygon", "Полигоны доставки");



      });



    }







    if (systemTelegramBotCard) {



      systemTelegramBotCard.addEventListener("click", () => {



        ensureTab("system-telegram-bot", "Telegram \u0431\u043e\u0442");



      });



    }







    if (systemMaxBotCard) {

      systemMaxBotCard.addEventListener("click", () => {

        ensureTab("system-max-bot", "MAX \u0431\u043e\u0442");

      });

    }

    if (systemPollingCard) {



      systemPollingCard.addEventListener("click", () => {



        ensureTab("system-polling", "\u041f\u043e\u043b\u043b\u0438\u043d\u0433");



      });



    }







    if (settingsSystemMapEditBtn) {



      settingsSystemMapEditBtn.addEventListener("click", () => {



        systemMapDraft = { ...systemMapOriginal };



        applySystemMapFormValues(systemMapDraft);



        setSystemMapDraftMode(true);



        if (settingsSystemMapProviderName) {



          settingsSystemMapProviderName.focus();



          settingsSystemMapProviderName.select();



        }



      });



    }







    if (settingsSystemMapCancelBtn) {
      settingsSystemMapCancelBtn.addEventListener("click", () => {
        if (!systemMapDraftMode) return;
        cancelSystemMapDraft();
      });
    }







    if (settingsSystemMapSaveBtn) {



      settingsSystemMapSaveBtn.addEventListener("click", async () => {



        if (!systemMapDraftMode) return;



        const nextDraft = readSystemMapFormValues();



        const hasTileValue = Boolean(



          nextDraft.provider_name



          || nextDraft.tile_url



          || nextDraft.attribution



          || nextDraft.max_zoom



          || nextDraft.subdomains



        );



        const hasGeocoderValue = Boolean(



          nextDraft.geocoder_provider_name



          || nextDraft.geocoder_search_url



        );



        if (hasTileValue && !nextDraft.tile_url) {



          alert("Укажите tile URL для карты.");



          if (settingsSystemMapTileUrl) settingsSystemMapTileUrl.focus();



          return;



        }



        if (hasTileValue && (!nextDraft.tile_url.includes("{z}") || !nextDraft.tile_url.includes("{x}") || !nextDraft.tile_url.includes("{y}"))) {



          alert("Tile URL должен содержать шаблоны {z}, {x}, {y}.");



          if (settingsSystemMapTileUrl) settingsSystemMapTileUrl.focus();



          return;



        }



        const maxZoomValue = nextDraft.max_zoom === "" ? 22 : Number(nextDraft.max_zoom);



        if (!Number.isFinite(maxZoomValue) || maxZoomValue < 0 || maxZoomValue > 22) {



          alert("MAX ZOOM должен быть числом от 0 до 22.");



          if (settingsSystemMapMaxZoom) settingsSystemMapMaxZoom.focus();



          return;



        }



        if (hasGeocoderValue && !nextDraft.geocoder_search_url) {



          alert("Укажите URL поиска городов.");



          if (settingsSystemMapGeocoderSearchUrl) settingsSystemMapGeocoderSearchUrl.focus();



          return;



        }



        if (nextDraft.geocoder_search_url && !/^https?:\/\//i.test(nextDraft.geocoder_search_url)) {



          alert("GEOCODER SEARCH URL должен начинаться с http:// или https://");



          if (settingsSystemMapGeocoderSearchUrl) settingsSystemMapGeocoderSearchUrl.focus();



          return;



        }



        const geocoderResultLimitValue = nextDraft.geocoder_result_limit === "" ? 5 : Number(nextDraft.geocoder_result_limit);



        if (!Number.isFinite(geocoderResultLimitValue) || geocoderResultLimitValue < 1 || geocoderResultLimitValue > 10) {



          alert("RESULT LIMIT должен быть числом от 1 до 10.");



          if (settingsSystemMapGeocoderResultLimit) settingsSystemMapGeocoderResultLimit.focus();



          return;



        }



        systemMapDraft = normalizeSystemMapConfig({



          ...nextDraft,



          max_zoom: hasTileValue ? maxZoomValue : "",



          geocoder_result_limit: geocoderResultLimitValue



        });



        const saved = await saveSystemMapSettings(systemMapDraft);



        if (!saved) {



          alert("Не удалось сохранить настройки карты.");



          return;



        }



        if (document.body.getAttribute("data-settings-section") === "delivery") {



          refreshDeliveryMapPreview(true);



        }



      });



    }







    if (settingsSystemDeliveryZonePolygonEditBtn) {



      settingsSystemDeliveryZonePolygonEditBtn.addEventListener("click", () => {



        systemDeliveryZonePolygonDraft = { ...systemDeliveryZonePolygonOriginal };



        applySystemDeliveryZonePolygonFormValues(systemDeliveryZonePolygonDraft);



        setSystemDeliveryZonePolygonDraftMode(true);



        if (settingsSystemDeliveryZonePolygonProvider) {



          settingsSystemDeliveryZonePolygonProvider.focus();



          settingsSystemDeliveryZonePolygonProvider.select();



        }



      });



    }







    if (settingsSystemDeliveryZonePolygonCancelBtn) {
      settingsSystemDeliveryZonePolygonCancelBtn.addEventListener("click", () => {
        if (!systemDeliveryZonePolygonDraftMode) return;
        cancelSystemDeliveryZonePolygonDraft();
      });
    }







    if (settingsSystemDeliveryZonePolygonSaveBtn) {



      settingsSystemDeliveryZonePolygonSaveBtn.addEventListener("click", async () => {



        if (!systemDeliveryZonePolygonDraftMode) return;



        const nextDraft = normalizeSystemDeliveryZonePolygonConfig(readSystemDeliveryZonePolygonFormValues());



        systemDeliveryZonePolygonDraft = { ...nextDraft };



        const saved = await saveSystemDeliveryZonePolygonSettings(systemDeliveryZonePolygonDraft);



        if (!saved) {



          alert("Не удалось сохранить настройки полигонов доставки.");



        }



      });



    }







    if (settingsSystemTelegramEditBtn) {



      settingsSystemTelegramEditBtn.addEventListener("click", () => {



        systemTelegramDraft = { ...systemTelegramOriginal };



        applySystemTelegramFormValues(systemTelegramDraft);



        setSystemTelegramDraftMode(true);



        if (settingsSystemTelegramBotUsername) {



          settingsSystemTelegramBotUsername.focus();



          settingsSystemTelegramBotUsername.select();



        }



      });



    }







    if (settingsSystemTelegramCancelBtn) {
      settingsSystemTelegramCancelBtn.addEventListener("click", () => {
        if (!systemTelegramDraftMode) return;
        cancelSystemTelegramDraft();
      });
    }







    if (settingsSystemTelegramSaveBtn) {



      settingsSystemTelegramSaveBtn.addEventListener("click", async () => {



        if (!systemTelegramDraftMode) return;



        systemTelegramDraft = readSystemTelegramFormValues();



        const hasAnyValue = Boolean(



          systemTelegramDraft.telegram_bot_username



          || systemTelegramDraft.telegram_bot_token



          || systemTelegramDraft.telegram_webhook_url



        );



        if (hasAnyValue && !systemTelegramDraft.telegram_bot_token) {



          alert("Сначала заполните token Telegram-бота или очистите всю конфигурацию.");



          if (settingsSystemTelegramBotToken) settingsSystemTelegramBotToken.focus();



          return;



        }



        const saved = await saveSystemTelegramSettings({



          telegram_bot_username: systemTelegramDraft.telegram_bot_username || "",



          telegram_bot_token: systemTelegramDraft.telegram_bot_token || "",



          telegram_webhook_url: systemTelegramDraft.telegram_webhook_url || "",



          telegram_env_enabled: systemTelegramDraft.telegram_env_enabled ? 1 : 0,



          telegram_tenant_enabled: systemTelegramDraft.telegram_tenant_enabled ? 1 : 0



        });



        if (!saved) {



          alert("Не удалось сохранить системные настройки Telegram-бота.");



        }



      });



    }







    if (settingsSystemMaxEditBtn) {

      settingsSystemMaxEditBtn.addEventListener("click", () => {

        systemMaxDraft = { ...systemMaxOriginal };

        applySystemMaxFormValues(systemMaxDraft);

        setSystemMaxDraftMode(true);

        if (settingsSystemMaxBotId) {

          settingsSystemMaxBotId.focus();

          settingsSystemMaxBotId.select();

        }

      });

    }

    if (settingsSystemMaxCancelBtn) {
      settingsSystemMaxCancelBtn.addEventListener("click", () => {
        if (!systemMaxDraftMode) return;
        cancelSystemMaxDraft();
      });
    }

    if (settingsSystemMaxSaveBtn) {

      settingsSystemMaxSaveBtn.addEventListener("click", async () => {

        if (!systemMaxDraftMode) return;

        systemMaxDraft = readSystemMaxFormValues();

        const hasAnyValue = Boolean(

          systemMaxDraft.max_bot_id

          || systemMaxDraft.max_bot_token

          || systemMaxDraft.max_webhook_url

        );

        if (hasAnyValue && !systemMaxDraft.max_bot_token) {

          alert("Сначала заполните token MAX-бота или очистите всю конфигурацию.");

          if (settingsSystemMaxBotToken) settingsSystemMaxBotToken.focus();

          return;

        }

        if (systemMaxDraft.max_webhook_url && !/^https:\/\//i.test(systemMaxDraft.max_webhook_url)) {

          alert("WEBHOOK URL для MAX должен начинаться с https://");

          if (settingsSystemMaxWebhookUrl) settingsSystemMaxWebhookUrl.focus();

          return;

        }

        const saved = await saveSystemMaxSettings({

          max_bot_id: systemMaxDraft.max_bot_id || "",

          max_bot_token: systemMaxDraft.max_bot_token || "",

          max_webhook_url: systemMaxDraft.max_webhook_url || "",

          max_env_enabled: systemMaxDraft.max_env_enabled ? 1 : 0

        });

        if (!saved) {

          alert("Не удалось сохранить системные настройки MAX-бота.");

        }

      });

    }

    [



      settingsSystemMapProviderName,



      settingsSystemMapTileUrl,



      settingsSystemMapAttribution,



      settingsSystemMapMaxZoom,



      settingsSystemMapSubdomains,



      settingsSystemMapGeocoderProviderName,



      settingsSystemMapGeocoderSearchUrl,



      settingsSystemMapGeocoderCountryCode,



      settingsSystemMapGeocoderLanguage,



      settingsSystemMapGeocoderResultLimit,



      settingsSystemMapPolygonProvider



    ].forEach((input) => {



      if (!input) return;



      input.addEventListener("input", () => {



        if (!systemMapDraftMode) return;



        resetSystemMapCancelButton();



      });



    });







    [



      settingsSystemDeliveryZonePolygonProvider



    ].forEach((input) => {



      if (!input) return;



      input.addEventListener("input", () => {



        if (!systemDeliveryZonePolygonDraftMode) return;



        resetSystemDeliveryZonePolygonCancelButton();



      });



    });







    if (settingsSystemDeliveryZonePolygonEnabled) {



      settingsSystemDeliveryZonePolygonEnabled.addEventListener("change", () => {



        if (!systemDeliveryZonePolygonDraftMode) return;



        resetSystemDeliveryZonePolygonCancelButton();



      });



    }







    [



      settingsSystemTelegramBotUsername,



      settingsSystemTelegramBotToken,



      settingsSystemTelegramWebhookUrl



    ].forEach((input) => {



      if (!input) return;



      input.addEventListener("input", () => {



        if (!systemTelegramDraftMode) return;



        resetSystemTelegramCancelButton();



      });



    });







    [

      settingsSystemMaxBotId,

      settingsSystemMaxBotToken,

      settingsSystemMaxWebhookUrl

    ].forEach((input) => {

      if (!input) return;

      input.addEventListener("input", () => {

        if (!systemMaxDraftMode) return;

        resetSystemMaxCancelButton();

      });

    });

    if (settingsSystemMaxPollingEnabled) {

      settingsSystemMaxPollingEnabled.addEventListener("change", () => {

        if (!systemMaxDraftMode) {

          settingsSystemMaxPollingEnabled.checked = Boolean(systemMaxOriginal.max_env_enabled);

          return;

        }

        systemMaxDraft.max_env_enabled = settingsSystemMaxPollingEnabled.checked;

        resetSystemMaxCancelButton();

      });

    }

    if (settingsPollingEnvEnabled) {



      settingsPollingEnvEnabled.addEventListener("change", () => {



        if (!systemTelegramDraftMode) {



          settingsPollingEnvEnabled.checked = Boolean(systemTelegramOriginal.telegram_env_enabled);



          return;



        }



        systemTelegramDraft.telegram_env_enabled = settingsPollingEnvEnabled.checked;



        resetSystemTelegramCancelButton();



      });



    }







    if (settingsPollingTenantEnabled) {



      settingsPollingTenantEnabled.addEventListener("change", () => {



        if (!systemTelegramDraftMode) {



          settingsPollingTenantEnabled.checked = Boolean(systemTelegramOriginal.telegram_tenant_enabled);



          return;



        }



        systemTelegramDraft.telegram_tenant_enabled = settingsPollingTenantEnabled.checked;



        resetSystemTelegramCancelButton();



      });



    }







    // Telegram bot username — save on change



    const tgBotUsernameEl = document.getElementById("tenantTelegramBotUsername");



    const tgBotUsernameLinkBtn = document.getElementById("tenantTelegramBotUsernameLink");



    const tgBotTokenEl = document.getElementById("tenantTelegramBotToken");



    const tgBotTokenCopyBtn = document.getElementById("tenantTelegramBotTokenCopyBtn");



    const tgMiniAppEnabledEl = document.getElementById("tenantTelegramMiniAppEnabled");



    const tgLoginEnabledEl = document.getElementById("tenantTelegramLoginEnabled");



    const telegramEditBtn = document.getElementById("settingsTelegramEditBtn");



    const telegramSaveBtn = document.getElementById("settingsTelegramSaveBtn");



    const telegramCancelBtn = document.getElementById("settingsTelegramCancelBtn");



    const telegramFooterView = document.getElementById("settingsTelegramFooterView");



    const telegramFooterEdit = document.getElementById("settingsTelegramFooterEdit");



    const maxBotIdEl = document.getElementById("tenantMaxBotId");



    const maxBotTokenEl = document.getElementById("tenantMaxBotToken");



    const maxBotTokenCopyBtn = document.getElementById("tenantMaxBotTokenCopyBtn");



    const maxMiniAppEnabledEl = document.getElementById("tenantMaxMiniAppEnabled");



    const maxLoginEnabledEl = document.getElementById("tenantMaxLoginEnabled");



    const maxEditBtn = document.getElementById("settingsMaxEditBtn");



    const maxSaveBtn = document.getElementById("settingsMaxSaveBtn");



    const maxCancelBtn = document.getElementById("settingsMaxCancelBtn");



    const maxFooterView = document.getElementById("settingsMaxFooterView");



    const maxFooterEdit = document.getElementById("settingsMaxFooterEdit");



    const siteNameEl = document.querySelector('[data-site-input="site_name"]');



    const siteDescriptionEl = document.querySelector('[data-site-input="site_description"]');



    const subdomainEl = document.getElementById("subdomainInput");



    const siteUploadBtn = document.getElementById("siteFaviconUploadBtn");



    const siteDeleteBtn = document.getElementById("siteFaviconDeleteBtn");



    const siteEditBtn = document.getElementById("settingsSiteEditBtn");



    const siteSaveBtn = document.getElementById("settingsSiteSaveBtn");



    const siteCancelBtn = document.getElementById("settingsSiteCancelBtn");



    const siteFooterView = document.getElementById("settingsSiteFooterView");



    const siteFooterEdit = document.getElementById("settingsSiteFooterEdit");







    const syncMaxLoginSwitchState = function () {



      if (!maxLoginEnabledEl) return;



      var hasRequired = !!(String((maxBotIdEl && maxBotIdEl.value) || "").trim() && String((maxBotTokenEl && maxBotTokenEl.value) || "").trim());



      maxLoginEnabledEl.disabled = !hasRequired;



      maxLoginEnabledEl.title = hasRequired ? "" : "Сначала заполните ID бота и токен MAX";



      if (!hasRequired) {



        maxLoginEnabledEl.checked = false;



      }



    };



    const syncTgLoginSwitchState = function () {



      if (!tgLoginEnabledEl) return;



      var hasRequired = !!(String((tgBotUsernameEl && tgBotUsernameEl.value) || "").trim() && String((tgBotTokenEl && tgBotTokenEl.value) || "").trim());



      tgLoginEnabledEl.disabled = !hasRequired;



      tgLoginEnabledEl.title = hasRequired ? "" : "Сначала заполните имя бота и токен Telegram";



      if (!hasRequired) {



        tgLoginEnabledEl.checked = false;



      }



    };







    function resetSiteCancelButton() {



      if (!siteCancelBtn) return;



      siteCancelConfirm = false;



      siteCancelBtn.classList.remove("is-confirm");



      siteCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



      siteCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



      siteCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function readSiteFormValues() {



      return {



        site_name: String((siteNameEl && siteNameEl.value) || "").trim(),



        site_description: String((siteDescriptionEl && siteDescriptionEl.value) || "").trim(),



        subdomain: String((subdomainEl && subdomainEl.value) || "").trim().toLowerCase(),



        favicon_light_url: String(siteDraft.favicon_light_url || "")



      };



    }







    function applySiteFormValues(values) {



      if (siteNameEl) siteNameEl.value = String(values.site_name || "");



      if (siteDescriptionEl) siteDescriptionEl.value = String(values.site_description || "");



      if (subdomainEl) subdomainEl.value = String(values.subdomain || "");



      updateSiteFavicon(values.favicon_light_url || "");



      setPreviewFromValue("favicon_light_url", values.favicon_light_url || "");



    }







    function setSiteDraftMode(enabled) {



      siteDraftMode = Boolean(enabled);



      if (siteNameEl) {



        siteNameEl.disabled = !siteDraftMode;



        siteNameEl.readOnly = !siteDraftMode;



      }



      if (siteDescriptionEl) {



        siteDescriptionEl.disabled = !siteDraftMode;



        siteDescriptionEl.readOnly = !siteDraftMode;



      }



      if (subdomainEl) {



        subdomainEl.disabled = !siteDraftMode;



        subdomainEl.readOnly = !siteDraftMode;



      }



      if (siteUploadBtn) siteUploadBtn.disabled = !siteDraftMode;



      if (siteDeleteBtn) siteDeleteBtn.disabled = !siteDraftMode;



      if (siteFooterView) siteFooterView.classList.toggle("hidden", siteDraftMode);



      if (siteFooterEdit) siteFooterEdit.classList.toggle("hidden", !siteDraftMode);



      if (!siteDraftMode) resetSiteCancelButton();



    }







    function cancelSiteDraft() {



      siteDraft = { ...siteOriginal };



      applySiteFormValues(siteOriginal);



      setSiteDraftMode(false);



    }







    function resetSystemTelegramCancelButton() {



      if (!settingsSystemTelegramCancelBtn) return;



      systemTelegramCancelConfirm = false;



      settingsSystemTelegramCancelBtn.classList.remove("is-confirm");



      settingsSystemTelegramCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



      settingsSystemTelegramCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



      settingsSystemTelegramCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function readSystemTelegramFormValues() {



      return {



        telegram_bot_username: String((settingsSystemTelegramBotUsername && settingsSystemTelegramBotUsername.value) || "").trim(),



        telegram_bot_token: String((settingsSystemTelegramBotToken && settingsSystemTelegramBotToken.value) || "").trim(),



        telegram_webhook_url: String((settingsSystemTelegramWebhookUrl && settingsSystemTelegramWebhookUrl.value) || "").trim(),



        telegram_env_enabled: settingsPollingEnvEnabled && settingsPollingEnvEnabled.checked ? 1 : 0,



        telegram_tenant_enabled: settingsPollingTenantEnabled && settingsPollingTenantEnabled.checked ? 1 : 0



      };



    }







    function applySystemTelegramFormValues(values) {



      if (settingsSystemTelegramBotUsername) {



        settingsSystemTelegramBotUsername.value = String(values.telegram_bot_username || "");



      }



      if (settingsSystemTelegramBotToken) {



        settingsSystemTelegramBotToken.value = String(values.telegram_bot_token || "");



      }



      if (settingsSystemTelegramWebhookUrl) {



        settingsSystemTelegramWebhookUrl.value = String(values.telegram_webhook_url || "");



      }



      if (settingsPollingEnvEnabled) {



        settingsPollingEnvEnabled.checked = Boolean(values.telegram_env_enabled);



      }



      if (settingsPollingTenantEnabled) {



        settingsPollingTenantEnabled.checked = Boolean(values.telegram_tenant_enabled);



      }



    }







    function setSystemTelegramDraftMode(enabled) {



      systemTelegramDraftMode = Boolean(enabled);



      if (settingsSystemTelegramBotUsername) {



        settingsSystemTelegramBotUsername.disabled = !systemTelegramDraftMode;



        settingsSystemTelegramBotUsername.readOnly = !systemTelegramDraftMode;



      }



      if (settingsSystemTelegramBotToken) {



        settingsSystemTelegramBotToken.disabled = !systemTelegramDraftMode;



        settingsSystemTelegramBotToken.readOnly = !systemTelegramDraftMode;



      }



      if (settingsSystemTelegramWebhookUrl) {



        settingsSystemTelegramWebhookUrl.disabled = !systemTelegramDraftMode;



        settingsSystemTelegramWebhookUrl.readOnly = !systemTelegramDraftMode;



      }



      if (settingsPollingEnvEnabled) {



        settingsPollingEnvEnabled.disabled = !systemTelegramDraftMode;



      }



      if (settingsPollingTenantEnabled) {



        settingsPollingTenantEnabled.disabled = !systemTelegramDraftMode;



      }



      if (settingsSystemTelegramFooterView) {



        settingsSystemTelegramFooterView.classList.toggle("hidden", systemTelegramDraftMode);



      }



      if (settingsSystemTelegramFooterEdit) {



        settingsSystemTelegramFooterEdit.classList.toggle("hidden", !systemTelegramDraftMode);



      }



      if (!systemTelegramDraftMode) {



        resetSystemTelegramCancelButton();



      }



    }







    function cancelSystemTelegramDraft() {



      systemTelegramDraft = { ...systemTelegramOriginal };



      applySystemTelegramFormValues(systemTelegramOriginal);



      setSystemTelegramDraftMode(false);



    }







    function resetSystemMaxCancelButton() {

      if (!settingsSystemMaxCancelBtn) return;

      systemMaxCancelConfirm = false;

      settingsSystemMaxCancelBtn.classList.remove("is-confirm");

      settingsSystemMaxCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";

      settingsSystemMaxCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");

      settingsSystemMaxCancelBtn.innerHTML = '<i class="fas fa-times"></i>';

    }

    function readSystemMaxFormValues() {

      return {

        max_bot_id: String((settingsSystemMaxBotId && settingsSystemMaxBotId.value) || "").trim(),

        max_bot_token: String((settingsSystemMaxBotToken && settingsSystemMaxBotToken.value) || "").trim(),

        max_webhook_url: String((settingsSystemMaxWebhookUrl && settingsSystemMaxWebhookUrl.value) || "").trim(),

        max_env_enabled: Boolean(settingsSystemMaxPollingEnabled && settingsSystemMaxPollingEnabled.checked)

      };

    }

    function applySystemMaxFormValues(values) {

      if (settingsSystemMaxBotId) {

        settingsSystemMaxBotId.value = String(values.max_bot_id || "");

      }

      if (settingsSystemMaxBotToken) {

        settingsSystemMaxBotToken.value = String(values.max_bot_token || "");

      }

      if (settingsSystemMaxWebhookUrl) {

        settingsSystemMaxWebhookUrl.value = String(values.max_webhook_url || "");

      }

      if (settingsSystemMaxPollingEnabled) {

        settingsSystemMaxPollingEnabled.checked = Boolean(values.max_env_enabled);

      }

    }

    function setSystemMaxDraftMode(enabled) {

      systemMaxDraftMode = Boolean(enabled);

      if (settingsSystemMaxBotId) {

        settingsSystemMaxBotId.disabled = !systemMaxDraftMode;

        settingsSystemMaxBotId.readOnly = !systemMaxDraftMode;

      }

      if (settingsSystemMaxBotToken) {

        settingsSystemMaxBotToken.disabled = !systemMaxDraftMode;

        settingsSystemMaxBotToken.readOnly = !systemMaxDraftMode;

      }

      if (settingsSystemMaxWebhookUrl) {

        settingsSystemMaxWebhookUrl.disabled = !systemMaxDraftMode;

        settingsSystemMaxWebhookUrl.readOnly = !systemMaxDraftMode;

      }

      if (settingsSystemMaxPollingEnabled) {

        settingsSystemMaxPollingEnabled.disabled = !systemMaxDraftMode;

      }

      if (settingsSystemMaxFooterView) {

        settingsSystemMaxFooterView.classList.toggle("hidden", systemMaxDraftMode);

      }

      if (settingsSystemMaxFooterEdit) {

        settingsSystemMaxFooterEdit.classList.toggle("hidden", !systemMaxDraftMode);

      }

      if (!systemMaxDraftMode) {

        resetSystemMaxCancelButton();

      }

    }

    function cancelSystemMaxDraft() {

      systemMaxDraft = { ...systemMaxOriginal };

      applySystemMaxFormValues(systemMaxOriginal);

      setSystemMaxDraftMode(false);

    }

    function resetMaxCancelButton() {



      if (!maxCancelBtn) return;



      maxCancelConfirm = false;



      maxCancelBtn.classList.remove("is-confirm");



      maxCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



      maxCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



      maxCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function readMaxFormValues() {



      return {



        max_bot_id: String((maxBotIdEl && maxBotIdEl.value) || "").trim(),



        max_bot_token: String((maxBotTokenEl && maxBotTokenEl.value) || "").trim(),



        max_mini_app_enabled: maxMiniAppEnabledEl && maxMiniAppEnabledEl.checked ? 1 : 0,



        max_login_enabled: maxLoginEnabledEl && maxLoginEnabledEl.checked ? 1 : 0



      };



    }







    function applyMaxFormValues(values) {



      if (maxBotIdEl) maxBotIdEl.value = String(values.max_bot_id || "");



      if (maxBotTokenEl) maxBotTokenEl.value = String(values.max_bot_token || "");



      if (maxMiniAppEnabledEl) maxMiniAppEnabledEl.checked = Number(values.max_mini_app_enabled || 0) === 1;



      if (maxLoginEnabledEl) maxLoginEnabledEl.checked = Number(values.max_login_enabled || 0) === 1;



      syncMaxLoginSwitchState();



    }







    function setMaxDraftMode(enabled) {



      maxDraftMode = Boolean(enabled);



      if (maxBotIdEl) {



        maxBotIdEl.disabled = !maxDraftMode;



        maxBotIdEl.readOnly = !maxDraftMode;



      }



      if (maxBotTokenEl) {



        maxBotTokenEl.disabled = !maxDraftMode;



        maxBotTokenEl.readOnly = !maxDraftMode;



      }



      if (maxMiniAppEnabledEl) maxMiniAppEnabledEl.disabled = !maxDraftMode;



      if (maxLoginEnabledEl) maxLoginEnabledEl.disabled = !maxDraftMode;



      if (maxFooterView) maxFooterView.classList.toggle("hidden", maxDraftMode);



      if (maxFooterEdit) maxFooterEdit.classList.toggle("hidden", !maxDraftMode);



      if (!maxDraftMode) {



        resetMaxCancelButton();



      } else {



        syncMaxLoginSwitchState();



      }



    }







    function cancelMaxDraft() {



      maxDraft = { ...maxOriginal };



      applyMaxFormValues(maxOriginal);



      setMaxDraftMode(false);



    }







    function resetTelegramCancelButton() {



      if (!telegramCancelBtn) return;



      telegramCancelConfirm = false;



      telegramCancelBtn.classList.remove("is-confirm");



      telegramCancelBtn.title = "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c";



      telegramCancelBtn.setAttribute("aria-label", "\u041e\u0442\u043c\u0435\u043d\u0438\u0442\u044c");



      telegramCancelBtn.innerHTML = '<i class="fas fa-times"></i>';



    }







    function readTelegramFormValues() {



      return {



        telegram_bot_username: String((tgBotUsernameEl && tgBotUsernameEl.value) || "").trim(),



        telegram_bot_token: String((tgBotTokenEl && tgBotTokenEl.value) || "").trim(),



        tg_mini_app_enabled: tgMiniAppEnabledEl && tgMiniAppEnabledEl.checked ? 1 : 0,



        tg_login_enabled: tgLoginEnabledEl && tgLoginEnabledEl.checked ? 1 : 0



      };



    }







    function applyTelegramFormValues(values) {



      if (tgBotUsernameEl) tgBotUsernameEl.value = String(values.telegram_bot_username || "");



      if (tgBotTokenEl) tgBotTokenEl.value = String(values.telegram_bot_token || "");



      if (tgMiniAppEnabledEl) tgMiniAppEnabledEl.checked = Number(values.tg_mini_app_enabled || 0) === 1;



      if (tgLoginEnabledEl) tgLoginEnabledEl.checked = Number(values.tg_login_enabled || 0) === 1;



      syncTgLoginSwitchState();



    }







    function setTelegramDraftMode(enabled) {



      telegramDraftMode = Boolean(enabled);



      if (tgBotUsernameEl) {



        tgBotUsernameEl.disabled = !telegramDraftMode;



        tgBotUsernameEl.readOnly = !telegramDraftMode;



      }



      if (tgBotTokenEl) {



        tgBotTokenEl.disabled = !telegramDraftMode;



        tgBotTokenEl.readOnly = !telegramDraftMode;



      }



      if (tgMiniAppEnabledEl) tgMiniAppEnabledEl.disabled = !telegramDraftMode;



      if (tgLoginEnabledEl) tgLoginEnabledEl.disabled = !telegramDraftMode;



      if (telegramFooterView) telegramFooterView.classList.toggle("hidden", telegramDraftMode);



      if (telegramFooterEdit) telegramFooterEdit.classList.toggle("hidden", !telegramDraftMode);



      if (!telegramDraftMode) {



        resetTelegramCancelButton();



      } else {



        syncTgLoginSwitchState();



      }



    }







    function cancelTelegramDraft() {



      telegramDraft = { ...telegramOriginal };



      applyTelegramFormValues(telegramOriginal);



      setTelegramDraftMode(false);



    }







    if (telegramEditBtn) {



      telegramEditBtn.addEventListener("click", function () {



        telegramDraft = { ...telegramOriginal };



        applyTelegramFormValues(telegramDraft);



        setTelegramDraftMode(true);



        if (tgBotUsernameEl) {



          tgBotUsernameEl.focus();



          tgBotUsernameEl.select();



        }



      });



    }







    if (telegramCancelBtn) {
      telegramCancelBtn.addEventListener("click", function () {
        if (!telegramDraftMode) return;
        cancelTelegramDraft();
      });
    }







    if (telegramSaveBtn) {



      telegramSaveBtn.addEventListener("click", async function () {



        if (!telegramDraftMode) return;



        telegramDraft = readTelegramFormValues();



        const hasRequired = !!(telegramDraft.telegram_bot_username && telegramDraft.telegram_bot_token);



        if (telegramDraft.tg_login_enabled === 1 && !hasRequired) {



          alert("Сначала заполните имя бота и токен Telegram");



          if (tgLoginEnabledEl) tgLoginEnabledEl.checked = false;



          telegramDraft.tg_login_enabled = 0;



          return;



        }



        const payload = {



          telegram_bot_username: telegramDraft.telegram_bot_username || null,



          telegram_bot_token: telegramDraft.telegram_bot_token || null,



          tg_mini_app_enabled: telegramDraft.tg_mini_app_enabled ? 1 : 0,



          tg_login_enabled: telegramDraft.tg_login_enabled ? 1 : 0



        };



        const data = await updateTenantFields(payload);



        if (!data || !data.ok) {



          alert("Не удалось сохранить настройки Telegram.");



          return;



        }



        if (data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          telegramOriginal = {



            telegram_bot_username: String(data.tenant.telegram_bot_username || ""),



            telegram_bot_token: String(data.tenant.telegram_bot_token || ""),



            tg_mini_app_enabled: Number(data.tenant.tg_mini_app_enabled ?? 1) === 1 ? 1 : 0,



            tg_login_enabled: Number(data.tenant.tg_login_enabled ?? 0) === 1 ? 1 : 0



          };



        } else {



          telegramOriginal = { ...telegramDraft };



        }



        telegramDraft = { ...telegramOriginal };



        applyTelegramFormValues(telegramOriginal);



        setTelegramDraftMode(false);



      });



    }











    if (tgBotUsernameEl) {



      tgBotUsernameEl.addEventListener("change", function () {



        var val = tgBotUsernameEl.value.trim();



        tgBotUsernameEl.value = val;



        if (telegramDraftMode) {



          telegramDraft.telegram_bot_username = val;



        } else {



          updateTenantFields({ telegram_bot_username: val || null });



        }



        syncTgLoginSwitchState();



      });



    }







    if (tgBotUsernameLinkBtn && tgBotUsernameEl) {



      tgBotUsernameLinkBtn.addEventListener("click", function () {



        var u = tgBotUsernameEl.value.trim();



        if (u) window.open("https://t.me/" + u, "_blank");



      });



    }







    // Telegram bot token — save on blur



    if (tgBotTokenEl) {



      tgBotTokenEl.addEventListener("change", function () {



        var val = tgBotTokenEl.value.trim();



        if (telegramDraftMode) {



          telegramDraft.telegram_bot_token = val;



        } else {



          updateTenantFields({ telegram_bot_token: val || null });



        }



        syncTgLoginSwitchState();



      });



    }







    // Copy token



    if (tgBotTokenCopyBtn && tgBotTokenEl) {



      tgBotTokenCopyBtn.addEventListener("click", function () {



        navigator.clipboard.writeText(tgBotTokenEl.value).then(function () {



          var icon = tgBotTokenCopyBtn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    }







    if (siteEditBtn) {



      siteEditBtn.addEventListener("click", function () {



        siteDraft = { ...siteOriginal };



        applySiteFormValues(siteDraft);



        setSiteDraftMode(true);



        if (siteNameEl) {



          siteNameEl.focus();



          siteNameEl.select();



        }



      });



    }







    if (siteCancelBtn) {
      siteCancelBtn.addEventListener("click", function () {
        if (!siteDraftMode) return;
        cancelSiteDraft();
      });
    }







    if (siteSaveBtn) {



      siteSaveBtn.addEventListener("click", async function () {



        if (!siteDraftMode) return;



        siteDraft = readSiteFormValues();



        if (subdomainEl) subdomainEl.value = siteDraft.subdomain;



        const payload = {



          site_name: siteDraft.site_name || null,



          site_description: siteDraft.site_description || null,



          subdomain: siteDraft.subdomain || null,



          favicon_light_url: siteDraft.favicon_light_url || null



        };



        const data = await updateTenantFields(payload);



        if (!data || !data.ok) {



          if (data && data.error === "INVALID_SUBDOMAIN") {



            alert("Субдомен: только латиница, цифры и дефис.");



          } else if (data && data.error === "SUBDOMAIN_TAKEN") {



            alert("Субдомен уже занят.");



          } else {



            alert("Не удалось сохранить данные сайта.");



          }



          await loadTenantProfile();



          return;



        }



        if (data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          updateShopLink(data.tenant);



          siteOriginal = {



            site_name: String(data.tenant.site_name || ""),



            site_description: String(data.tenant.site_description || ""),



            subdomain: String(data.tenant.subdomain || ""),



            favicon_light_url: String(data.tenant.favicon_light_url || "")



          };



        } else {



          siteOriginal = { ...siteDraft };



        }



        siteDraft = { ...siteOriginal };



        applySiteFormValues(siteOriginal);



        setSiteDraftMode(false);



      });



    }







    if (maxEditBtn) {



      maxEditBtn.addEventListener("click", function () {



        maxDraft = { ...maxOriginal };



        applyMaxFormValues(maxDraft);



        setMaxDraftMode(true);



        if (maxBotIdEl) {



          maxBotIdEl.focus();



          maxBotIdEl.select();



        }



      });



    }







    if (maxCancelBtn) {
      maxCancelBtn.addEventListener("click", function () {
        if (!maxDraftMode) return;
        cancelMaxDraft();
      });
    }







    if (maxSaveBtn) {



      maxSaveBtn.addEventListener("click", async function () {



        if (!maxDraftMode) return;



        maxDraft = readMaxFormValues();



        const hasRequired = !!(maxDraft.max_bot_id && maxDraft.max_bot_token);



        if (maxDraft.max_login_enabled === 1 && !hasRequired) {



          alert("Сначала заполните ID бота и токен MAX");



          if (maxLoginEnabledEl) maxLoginEnabledEl.checked = false;



          maxDraft.max_login_enabled = 0;



          return;



        }



        const payload = {



          max_bot_id: maxDraft.max_bot_id || null,



          max_bot_token: maxDraft.max_bot_token || null,



          max_mini_app_enabled: maxDraft.max_mini_app_enabled ? 1 : 0,



          max_login_enabled: maxDraft.max_login_enabled ? 1 : 0



        };



        const data = await updateTenantFields(payload);



        if (!data || !data.ok) {



          alert("Не удалось сохранить настройки MAX.");



          return;



        }



        if (data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          maxOriginal = {



            max_bot_id: String(data.tenant.max_bot_id || ""),



            max_bot_token: String(data.tenant.max_bot_token || ""),



            max_mini_app_enabled: Number(data.tenant.max_mini_app_enabled ?? 1) === 1 ? 1 : 0,



            max_login_enabled: Number(data.tenant.max_login_enabled ?? 0) === 1 ? 1 : 0



          };



        } else {



          maxOriginal = { ...maxDraft };



        }



        maxDraft = { ...maxOriginal };



        applyMaxFormValues(maxOriginal);



        setMaxDraftMode(false);



      });



    }







    if (maxBotIdEl) {



      maxBotIdEl.addEventListener("change", function () {



        var val = maxBotIdEl.value.trim();



        if (maxDraftMode) {



          maxDraft.max_bot_id = val;



        } else {



          updateTenantFields({ max_bot_id: val || null });



        }



        syncMaxLoginSwitchState();



      });



    }







    if (maxBotTokenEl) {



      maxBotTokenEl.addEventListener("change", function () {



        var val = maxBotTokenEl.value.trim();



        if (maxDraftMode) {



          maxDraft.max_bot_token = val;



        } else {



          updateTenantFields({ max_bot_token: val || null });



        }



        syncMaxLoginSwitchState();



      });



    }







    if (maxMiniAppEnabledEl) {



      maxMiniAppEnabledEl.addEventListener("change", function () {



        if (maxDraftMode) {



          maxDraft.max_mini_app_enabled = maxMiniAppEnabledEl.checked ? 1 : 0;



        } else {



          updateTenantFields({ max_mini_app_enabled: maxMiniAppEnabledEl.checked ? 1 : 0 });



        }



      });



    }



    if (maxLoginEnabledEl) {



      maxLoginEnabledEl.addEventListener("change", function () {



        if (maxLoginEnabledEl.checked) {



          var hasRequired = !!(String((maxBotIdEl && maxBotIdEl.value) || "").trim() && String((maxBotTokenEl && maxBotTokenEl.value) || "").trim());



          if (!hasRequired) {



            maxLoginEnabledEl.checked = false;



            alert("Сначала заполните ID бота и токен MAX");



            return;



          }



        }



        if (maxDraftMode) {



          maxDraft.max_login_enabled = maxLoginEnabledEl.checked ? 1 : 0;



        } else {



          updateTenantFields({ max_login_enabled: maxLoginEnabledEl.checked ? 1 : 0 });



        }



      });



      syncMaxLoginSwitchState();



    }







    if (maxBotTokenCopyBtn && maxBotTokenEl) {



      maxBotTokenCopyBtn.addEventListener("click", function () {



        navigator.clipboard.writeText(maxBotTokenEl.value).then(function () {



          var icon = maxBotTokenCopyBtn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    }







    if (tgMiniAppEnabledEl) {



      tgMiniAppEnabledEl.addEventListener("change", function () {



        if (telegramDraftMode) {



          telegramDraft.tg_mini_app_enabled = tgMiniAppEnabledEl.checked ? 1 : 0;



        } else {



          updateTenantFields({ tg_mini_app_enabled: tgMiniAppEnabledEl.checked ? 1 : 0 });



        }



      });



    }



    if (tgLoginEnabledEl) {



      tgLoginEnabledEl.addEventListener("change", function () {



        var hasRequired = !!(String((tgBotUsernameEl && tgBotUsernameEl.value) || "").trim() && String((tgBotTokenEl && tgBotTokenEl.value) || "").trim());



        if (!hasRequired) {



          tgLoginEnabledEl.checked = false;



          alert("Сначала заполните имя бота и токен Telegram");



          return;



        }



        if (telegramDraftMode) {



          telegramDraft.tg_login_enabled = tgLoginEnabledEl.checked ? 1 : 0;



        } else {



          updateTenantFields({ tg_login_enabled: tgLoginEnabledEl.checked ? 1 : 0 });



        }



      });



      syncTgLoginSwitchState();



    }



    setSiteDraftMode(false);



    setMaxDraftMode(false);



    setTelegramDraftMode(false);



    setSystemMapDraftMode(false);



    setSystemTelegramDraftMode(false);



    setChatSoundsDraftMode(false);



    setChatAssistantDraftMode(false);



    setChatOperatorDraftMode(false);



    setChatMessageDraftMode(false);



    setPrintApiDraftMode(false);







    // Копирование ссылки Telegram mini app



    var tgMiniAppCopyBtn = document.getElementById("tenantTelegramMiniAppCopyBtn");



    var tgMiniAppCopyInput = document.getElementById("tenantTelegramMiniAppInput");



    if (tgMiniAppCopyBtn && tgMiniAppCopyInput) {



      tgMiniAppCopyBtn.addEventListener("click", function () {



        navigator.clipboard.writeText(tgMiniAppCopyInput.value).then(function () {



          var icon = tgMiniAppCopyBtn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    }







    var maxMiniAppCopyBtn = document.getElementById("tenantMaxMiniAppCopyBtn");



    var maxMiniAppCopyInput = document.getElementById("tenantMaxMiniAppInput");



    if (maxMiniAppCopyBtn && maxMiniAppCopyInput) {



      maxMiniAppCopyBtn.addEventListener("click", function () {



        navigator.clipboard.writeText(maxMiniAppCopyInput.value).then(function () {



          var icon = maxMiniAppCopyBtn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    }







    // Заполняем префикс/суффикс субдомена



    (function () {



      renderSubdomainLinkParts();



    })();







    // Subdomain actions: go to site & copy link



    var subdomainGoBtn = document.getElementById("subdomainGoBtn");



    var subdomainCopyLinkBtn = document.getElementById("subdomainCopyLinkBtn");



    if (subdomainGoBtn) {



      subdomainGoBtn.addEventListener("click", function () {



        if (_subdomainShopUrl) window.open(_subdomainShopUrl, "_blank");



      });



    }



    if (subdomainCopyLinkBtn) {



      subdomainCopyLinkBtn.addEventListener("click", function () {



        if (!_subdomainShopUrl) return;



        navigator.clipboard.writeText(_subdomainShopUrl).then(function () {



          var icon = subdomainCopyLinkBtn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    }







    document.querySelectorAll("[data-copy-domain-value]").forEach(function (btn) {



      btn.addEventListener("click", function () {



        var targetId = btn.getAttribute("data-copy-domain-value");



        var valueEl = targetId ? document.getElementById(targetId) : null;



        if (!valueEl) return;



        navigator.clipboard.writeText(valueEl.textContent.trim()).then(function () {



          var icon = btn.querySelector("i");



          if (icon) {



            icon.className = "fas fa-check";



            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);



          }



        });



      });



    });







    // Domain check button



    (function () {



      var checkBtn = document.getElementById("domainCheckBtn");



      var connectBtn = document.getElementById("domainConnectBtn");



      var connectHint = document.getElementById("domainConnectHint");



      var resultsBlock = document.getElementById("domainCheckResults");



      var domainInput = document.getElementById("domainInput");



      if (!checkBtn || !resultsBlock || !domainInput) return;







      function setCheckState(id, state, statusText) {



        var item = document.getElementById(id);



        if (!item) return;



        var icon = item.querySelector(".domain-check-icon");



        var status = item.querySelector(".domain-check-status");



        if (icon) { icon.className = "domain-check-icon is-" + state; }



        if (status) {



          status.textContent = statusText || "";



          status.classList.toggle("is-strong", state === "ok");



        }



      }







      async function runCheck(allowReadOnly) {
        if (!domainManageMode && !allowReadOnly) return;



        var domain = getCurrentDomainValue();



        if (!domain) return;







        resultsBlock.classList.remove("hidden");



        setCheckState("domainCheckDns", "pending", "Проверяем...");



        setCheckState("domainCheckHttp", "pending", "Проверяем...");



        setCheckState("domainCheckSsl", "pending", "Проверяем...");



        var shouldAnimateButton = domainManageMode && !allowReadOnly;
        if (shouldAnimateButton) checkBtn.disabled = true;



        var btnIcon = checkBtn.querySelector("i");



        if (btnIcon && shouldAnimateButton) btnIcon.className = "fas fa-spinner fa-spin";







        try {



          var res = await authFetch("/api/admin/tenant/check-domain", {



            method: "POST",



            body: JSON.stringify({ domain: domain })



          });



          var data = await res.json();



          if (data.ok && data.result) {



            var r = data.result;



            setCheckState("domainCheckDns", r.dns ? "ok" : "fail", r.dns ? r.dns_detail : r.dns_detail);



            setCheckState("domainCheckHttp", r.http ? "ok" : "fail", r.http_detail);



            setCheckState("domainCheckSsl", r.ssl ? "ok" : "fail", r.ssl_detail);



            if (connectHint) {



              if (r.ssl) {



                connectHint.textContent = "Домен уже подключен и работает по HTTPS.";



              } else if (r.dns) {



                connectHint.textContent = "DNS найден. Теперь нажмите «Подключить автоматически».";



              } else {



                connectHint.textContent = "Сначала пропишите две A-записи у регистратора домена.";



              }



            }



            if (connectBtn && domainSetup && domainSetup.auto_connect_enabled) {



              connectBtn.disabled = !domainManageMode || !r.dns;



            }



          } else {



            setCheckState("domainCheckDns", "fail", "Ошибка проверки");



            setCheckState("domainCheckHttp", "fail", "Ошибка проверки");



            setCheckState("domainCheckSsl", "fail", "Ошибка проверки");



          }



        } catch (e) {



          setCheckState("domainCheckDns", "fail", "Ошибка сети");



          setCheckState("domainCheckHttp", "fail", "Ошибка сети");



          setCheckState("domainCheckSsl", "fail", "Ошибка сети");



        }



        checkBtn.disabled = !domainManageMode || !getCurrentDomainValue();



        if (btnIcon && shouldAnimateButton) btnIcon.className = "fas fa-sync-alt";



      }

      runDomainStatusCheck = function (options) {
        var opts = options && typeof options === "object" ? options : {};
        return runCheck(!!opts.allowReadOnly);
      };

      checkBtn.addEventListener("click", async function () {
        await runCheck(false);
      });

      checkBtn.addEventListener("domain:check", async function () {
        await runCheck(true);
      });



    })();







    (function () {



      var connectBtn = document.getElementById("domainConnectBtn");



      var connectHint = document.getElementById("domainConnectHint");



      var checkBtn = document.getElementById("domainCheckBtn");



      if (!connectBtn) return;







      connectBtn.addEventListener("click", async function () {
        if (!domainManageMode) return;



        var domain = getCurrentDomainValue();



        if (domainDraftMode) {



          alert("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u0435 \u0434\u043e\u043c\u0435\u043d.");



          return;



        }



        if (domainDraftMode) {



          alert("Сначала сохраните домен.");



          return;



        }



        if (!domain) {



          alert("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0434\u043e\u0431\u0430\u0432\u044c\u0442\u0435 \u0434\u043e\u043c\u0435\u043d.");



          return;



        }



        if (!domain) {



          alert("Сначала добавьте домен.");



          return;



        }







        var originalHtml = connectBtn.innerHTML;



        connectBtn.disabled = true;



        connectBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Подключаем';



        if (connectHint) {



          connectHint.textContent = "Подключаем домен и выпускаем сертификат. Это может занять пару минут.";



        }







        try {



          var res = await authFetch("/api/admin/tenant/connect-domain", {



            method: "POST",



            body: JSON.stringify({ domain: domain })



          });



          var data = await res.json();



          if (!data || !data.ok) {



            if (connectHint) {



              connectHint.textContent = data && data.error === "DOMAIN_DNS_NOT_READY"



                ? "Сначала пропишите две A-записи и дождитесь обновления DNS."



                : "Не удалось подключить домен автоматически.";



            }



            alert(data && data.error ? String(data.error) : "Не удалось подключить домен автоматически.");



            return;



          }



          if (data.tenant) {



            updateTenantCache(data.tenant);



            applyBrandFromTenant(data.tenant);



            updateShopLink(data.tenant);



            applyDomainSetup(data.tenant);



            renderDomainViewState();



          }



          if (connectHint) {



            connectHint.textContent = "Домен подключен. Финально проверяем сайт и сертификат.";



          }



          if (checkBtn) checkBtn.click();



        } catch (err) {



          if (connectHint) {



            connectHint.textContent = "Не удалось подключить домен автоматически.";



          }



          alert("Не удалось подключить домен автоматически.");



        } finally {



          connectBtn.innerHTML = originalHtml;



          connectBtn.disabled = !domainManageMode || !(domainSetup && domainSetup.auto_connect_enabled && getCurrentDomainValue());



        }



      });



    })();







    if (brandCard) {



      brandCard.addEventListener("click", () => {



        ensureTab("brand", "Данные бренда");



      });



    }







    if (orderStatusesCard) {



      orderStatusesCard.addEventListener("click", () => {



        ensureTab("order-statuses", "Этапы заказов");



      });



    }







    if (orderPaymentsCard) {



      orderPaymentsCard.addEventListener("click", () => {



        ensureTab("order-payments", "Способы оплаты");



      });



    }







    if (orderDeliveryCard) {



      orderDeliveryCard.addEventListener("click", () => {



        ensureTab("order-delivery", "Способы получения");



      });



    }







    if (orderTimeOptionsCard) {



      orderTimeOptionsCard.addEventListener("click", () => {



        ensureTab("order-time-options", "Интервалы времени");



      });



    }







    if (soundsCard) {



      soundsCard.addEventListener("click", () => {



        ensureTab("sounds", "Звуки уведомлений");



      });



    }



    if (chatAssistantNameCard) {



      chatAssistantNameCard.addEventListener("click", () => {



        ensureTab("chat-assistant-name", "\u0412\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a");



      });



    }







    if (chatOperatorNameCard) {



      chatOperatorNameCard.addEventListener("click", () => {



        ensureTab("chat-operator-name", "\u0418\u043c\u044f \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430");



      });



    }







    if (chatMessageSettingsCard) {



      chatMessageSettingsCard.addEventListener("click", () => {



        ensureTab("chat-message-settings", "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0439");



      });



    }



    if (notificationsCard) {



      notificationsCard.addEventListener("click", () => {



        ensureTab("notifications", "Уведомления");



      });



    }







    if (imagesCard) {



      imagesCard.addEventListener("click", () => {



        ensureTab("images", "Фото товаров");



      });



    }







    if (printApiCard) {



      printApiCard.addEventListener("click", () => {



        if (rightDefault) rightDefault.classList.add("hidden");



        ensureTab("print-api", "API");



      });



    }







    if (settingsPrintApiEditBtn) {



      settingsPrintApiEditBtn.addEventListener("click", () => {



        updatePrintApiOriginalFromCurrentForm();



        clearPrintApiSettingsDirty();



        setPrintApiDraftMode(true);



      });



    }







    if (settingsPrintApiCancelBtn) {



      settingsPrintApiCancelBtn.addEventListener("click", async () => {



        if (!printApiDraftMode) return;



        await cancelPrintApiDraft();



      });



    }







    if (settingsPrintApiStore) {



      settingsPrintApiStore.addEventListener("change", () => {



        clearPrintApiSettingsDirty();



        const storeId = Number(settingsPrintApiStore.value);



        if (storeId) {



          loadPrintApiToken(storeId);



          printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;



          schedulePrintApiAutoRefresh();



        }



      });



    }







    if (settingsPrintApiCheckBtn) {



      settingsPrintApiCheckBtn.addEventListener("click", () => {



        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



        if (storeId) checkPrintApiConnection(storeId);



      });



    }







    if (settingsPrintApiGenerateBtn) {



      settingsPrintApiGenerateBtn.addEventListener("click", () => {



        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



        if (storeId) generatePrintApiToken(storeId);



      });



    }







    if (settingsPrintApiSaveSettingsBtn) {



      settingsPrintApiSaveSettingsBtn.addEventListener("click", async () => {



        if (!printApiDraftMode) return;



        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



        if (!storeId) return;



        const initialText = settingsPrintApiSaveSettingsBtn.textContent || "";



        settingsPrintApiSaveSettingsBtn.disabled = true;



        settingsPrintApiSaveSettingsBtn.textContent = "Сохранение...";



        try {



          const info = await savePrintApiNotificationSettings(storeId);



          clearPrintApiSettingsDirty();



          applyPrintApiNotificationSettings(info);



          updatePrintApiOriginalFromCurrentForm();



          setPrintApiDraftMode(false);



        } catch (err) {



          console.error("Не удалось сохранить настройки print API:", err);



          alert("Не удалось сохранить настройки уведомлений CRM_Print_Push_Bot.");



        } finally {



          settingsPrintApiSaveSettingsBtn.disabled = false;



          settingsPrintApiSaveSettingsBtn.textContent = initialText || "Сохранить";



        }



      });



    }







    if (settingsPrintApiOrderSoundUploadBtn && settingsPrintApiOrderSoundFile) {



      settingsPrintApiOrderSoundUploadBtn.addEventListener("click", () => settingsPrintApiOrderSoundFile.click());



      settingsPrintApiOrderSoundFile.addEventListener("change", async () => {



        const file = settingsPrintApiOrderSoundFile.files && settingsPrintApiOrderSoundFile.files[0];



        if (!file) return;



        try {



          const url = await uploadPrintApiSound(file, "print_sound_new_order_url");



          if (settingsPrintApiOrderSoundUrl) settingsPrintApiOrderSoundUrl.value = String(url || "");



          markPrintApiSettingsDirty();



          refreshPrintApiSoundUiFromInputs();



        } catch (err) {



          console.error("Не удалось загрузить звук нового заказа:", err);



          alert("Не удалось загрузить звук нового заказа.");



        } finally {



          settingsPrintApiOrderSoundFile.value = "";



        }



      });



    }







    if (settingsPrintApiMessageSoundUploadBtn && settingsPrintApiMessageSoundFile) {



      settingsPrintApiMessageSoundUploadBtn.addEventListener("click", () => settingsPrintApiMessageSoundFile.click());



      settingsPrintApiMessageSoundFile.addEventListener("change", async () => {



        const file = settingsPrintApiMessageSoundFile.files && settingsPrintApiMessageSoundFile.files[0];



        if (!file) return;



        try {



          const url = await uploadPrintApiSound(file, "print_sound_new_message_url");



          if (settingsPrintApiMessageSoundUrl) settingsPrintApiMessageSoundUrl.value = String(url || "");



          markPrintApiSettingsDirty();



          refreshPrintApiSoundUiFromInputs();



        } catch (err) {



          console.error("Не удалось загрузить звук нового сообщения:", err);



          alert("Не удалось загрузить звук нового сообщения.");



        } finally {



          settingsPrintApiMessageSoundFile.value = "";



        }



      });



    }







    if (settingsPrintApiOrderSoundPlayBtn) {



      settingsPrintApiOrderSoundPlayBtn.addEventListener("click", () => {



        playSoundPreview(settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "");



      });



    }



    if (settingsPrintApiMessageSoundPlayBtn) {



      settingsPrintApiMessageSoundPlayBtn.addEventListener("click", () => {



        playSoundPreview(settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : "");



      });



    }



    if (settingsPrintApiOrderSoundClearBtn) {



      settingsPrintApiOrderSoundClearBtn.addEventListener("click", () => {



        if (settingsPrintApiOrderSoundUrl) settingsPrintApiOrderSoundUrl.value = "";



        markPrintApiSettingsDirty();



        refreshPrintApiSoundUiFromInputs();



      });



    }



    if (settingsPrintApiMessageSoundClearBtn) {



      settingsPrintApiMessageSoundClearBtn.addEventListener("click", () => {



        if (settingsPrintApiMessageSoundUrl) settingsPrintApiMessageSoundUrl.value = "";



        markPrintApiSettingsDirty();



        refreshPrintApiSoundUiFromInputs();



      });



    }



    if (settingsPrintApiNotifyNewOrder) {



      settingsPrintApiNotifyNewOrder.addEventListener("change", () => {



        markPrintApiSettingsDirty();



      });



    }



    if (settingsPrintApiNotifyNewMessage) {



      settingsPrintApiNotifyNewMessage.addEventListener("change", () => {



        markPrintApiSettingsDirty();



      });



    }







    if (settingsStoreTelegramList) {



      settingsStoreTelegramList.addEventListener("click", async (e) => {



        const btn = e.target.closest("button[data-binding-id]");



        if (!btn) return;



        const bindingId = btn.getAttribute("data-binding-id");



        const storeId = storesState.selectedId;



        if (!storeId || !bindingId) return;



        if (!confirm("Отключить уведомления РІ этот чат?")) return;



        try {



          const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/telegram/" + encodeURIComponent(bindingId), { method: "DELETE" });



          const data = await res.json();



          if (data && data.ok) loadStoreTelegramBindings(storeId);



        } catch (err) {}



      });



    }

    if (settingsStoreMaxList) {

      settingsStoreMaxList.addEventListener("click", async (e) => {

        const btn = e.target.closest("button[data-binding-id]");

        if (!btn) return;

        const bindingId = btn.getAttribute("data-binding-id");

        const storeId = storesState.selectedId;

        if (!storeId || !bindingId) return;

        if (!confirm("Отключить уведомления в этот MAX-аккаунт?")) return;

        try {

          const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/max/" + encodeURIComponent(bindingId), { method: "DELETE" });

          const data = await res.json();

          if (data && data.ok) loadStoreMaxBindings(storeId);

        } catch (err) {}

      });

    }

    if (settingsPrintApiCopyToken) {



      settingsPrintApiCopyToken.addEventListener("click", async () => {



        try {



          const value = settingsPrintApiToken ? settingsPrintApiToken.value : "";



          if (value) await navigator.clipboard.writeText(value);



        } catch (err) {



          console.error("Не удалось скопировать токен:", err);



        }



      });



    }







    if (settingsStoreTelegramAddByKeysBtn) {



      settingsStoreTelegramAddByKeysBtn.addEventListener("click", async () => {



        const storeId = storesState.selectedId;



        const apiKey = settingsStoreTelegramApiKey ? settingsStoreTelegramApiKey.value.trim() : "";



        const secretKey = settingsStoreTelegramSecretKey ? settingsStoreTelegramSecretKey.value.trim() : "";



        if (!storeId || !apiKey || !secretKey) {



          alert("Введите API key и Secret key от бота.");



          return;



        }



        try {



          const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/telegram/add-by-keys", {



            method: "POST",



            headers: { "Content-Type": "application/json" },



            body: JSON.stringify({ api_key: apiKey, secret_key: secretKey })



          });



          const data = await res.json();



          if (!data || !data.ok) {



            alert(data.error === "SECRET_INVALID_OR_EXPIRED" ? "Secret key недействителен или истёк. Напишите /start боту заново." : (data.error || "Ошибка"));



            return;



          }



          if (settingsStoreTelegramApiKey) settingsStoreTelegramApiKey.value = "";



          if (settingsStoreTelegramSecretKey) settingsStoreTelegramSecretKey.value = "";



          if (settingsStoreTelegramConnectBlock) settingsStoreTelegramConnectBlock.classList.add("hidden");



          loadStoreTelegramBindings(storeId);



        } catch (e) {



          alert("Ошибка запроса");



        }



      });



    }











    function startCreateStore() {



      const tabId = `store-new-${Date.now()}`;



      storeTabs.set(tabId, { mode: "create", storeId: null, snapshot: null });



      openStoreTab(tabId, "Новая точка");



      showStorePanel(true);



      if (settingsStoreName) settingsStoreName.focus();



    }







    function normalizeStoreAddressSuggestValue(value) {



      return String(value || "").replace(/\s+/g, " ").trim();



    }







    function escapeStoreAddressSuggestRegExp(value) {



      return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");



    }







    function clearStoreAddressSuggestDebounce() {



      if (!storeAddressSuggestState.debounceTimer) return;



      clearTimeout(storeAddressSuggestState.debounceTimer);



      storeAddressSuggestState.debounceTimer = null;



    }







    function closeStoreAddressSuggestPopover() {



      clearStoreAddressSuggestDebounce();



      storeAddressSuggestState.requestSeq += 1;



      storeAddressSuggestState.open = false;



      storeAddressSuggestState.query = "";



      storeAddressSuggestState.items = [];



      storeAddressSuggestState.activeIndex = -1;



      storeAddressSuggestState.status = "";



      storeAddressSuggestState.mode = "idle";



      renderStoreAddressSuggestPopover();



    }







    function resetStoreAddressSuggestState() {



      selectedStoreAddressCityHint = "";



      closeStoreAddressSuggestPopover();



    }







    function setStoreAddressSuggestStatus(message, mode = "idle") {



      storeAddressSuggestState.status = String(message || "").trim();



      storeAddressSuggestState.mode = String(mode || "idle").trim() || "idle";



      if (storeAddressSuggestState.mode !== "idle" || storeAddressSuggestState.items.length) {



        storeAddressSuggestState.open = true;



      }



      renderStoreAddressSuggestPopover();



    }







    function setStoreAddressSuggestItems(items) {



      storeAddressSuggestState.items = Array.isArray(items) ? items.slice() : [];



      storeAddressSuggestState.activeIndex = storeAddressSuggestState.items.length ? 0 : -1;



      if (storeAddressSuggestState.items.length) {



        storeAddressSuggestState.open = true;



        if (



          storeAddressSuggestState.mode === "idle" ||



          storeAddressSuggestState.mode === "loading" ||



          storeAddressSuggestState.mode === "empty"



        ) {



          storeAddressSuggestState.mode = "ready";



        }



      }



      renderStoreAddressSuggestPopover();



    }







    function getStoreAddressSuggestionResultType(item) {



      return String(item && item.result_type || "").trim() === "address" ? "address" : "city";



    }







    function getStoreAddressShortLabel(item) {



      const label = String(item && item.label || "").trim();



      if (!label) return "";



      const parts = label.split(",").map((part) => String(part || "").trim()).filter(Boolean);



      return parts[0] || label;



    }







    function getStoreAddressSuggestionTitle(item) {



      if (getStoreAddressSuggestionResultType(item) === "city") {



        return String(item && item.city_name || "").trim() || getStoreAddressShortLabel(item) || "Город";



      }



      return getStoreAddressShortLabel(item) || String(item && item.label || "").trim() || "Адрес";



    }







    function getStoreAddressSuggestionMeta(item) {



      if (getStoreAddressSuggestionResultType(item) === "city") {



        return "Город";



      }



      const city = String(item && item.city_name || "").trim();



      return city ? `Адрес • ${city}` : "Адрес";



    }







    function getStoreAddressSuggestionValue(item) {



      const type = getStoreAddressSuggestionResultType(item);



      const city = String(item && item.city_name || "").trim();



      const shortLabel = getStoreAddressShortLabel(item) || String(item && item.label || "").trim();



      if (type === "city") {



        const cityLabel = city || shortLabel;



        return cityLabel ? `${cityLabel}, ` : "";



      }



      if (!city) return shortLabel;



      const normalizedShort = normalizeStoreAddressSuggestValue(shortLabel).toLowerCase();



      const normalizedCity = normalizeStoreAddressSuggestValue(city).toLowerCase();



      if (normalizedShort && normalizedCity && normalizedShort.startsWith(normalizedCity)) {



        return shortLabel;



      }



      return shortLabel ? `${city}, ${shortLabel}` : city;



    }







    function setStoreAddressCursorToEnd() {



      if (!settingsStoreAddress) return;



      const length = settingsStoreAddress.value.length;



      try {



        settingsStoreAddress.setSelectionRange(length, length);



      } catch (_) {}



    }







    function renderStoreAddressSuggestPopover() {



      if (!settingsStoreAddressPopover || !settingsStoreAddressStatus || !settingsStoreAddressResults) return;



      const isVisible = storeAddressSuggestState.open && (



        storeAddressSuggestState.mode !== "idle" ||



        storeAddressSuggestState.items.length > 0



      );



      settingsStoreAddressPopover.classList.toggle("hidden", !isVisible);







      const statusText = String(storeAddressSuggestState.status || "").trim();



      settingsStoreAddressStatus.textContent = statusText;



      settingsStoreAddressStatus.classList.toggle("hidden", !statusText);



      settingsStoreAddressStatus.classList.toggle("is-error", storeAddressSuggestState.mode === "error");



      settingsStoreAddressStatus.classList.toggle("is-loading", storeAddressSuggestState.mode === "loading");







      settingsStoreAddressResults.innerHTML = "";



      const items = Array.isArray(storeAddressSuggestState.items) ? storeAddressSuggestState.items : [];



      if (!items.length) {



        settingsStoreAddressResults.classList.add("hidden");



        return;



      }







      items.forEach((item, index) => {



        const button = document.createElement("button");



        button.type = "button";



        button.className = "settings-store-address-result";



        if (index === storeAddressSuggestState.activeIndex) {



          button.classList.add("is-active");



        }



        button.setAttribute("aria-selected", index === storeAddressSuggestState.activeIndex ? "true" : "false");







        const title = document.createElement("div");



        title.className = "settings-store-address-result-title";



        title.textContent = getStoreAddressSuggestionTitle(item);







        const meta = document.createElement("div");



        meta.className = "settings-store-address-result-meta";



        meta.textContent = getStoreAddressSuggestionMeta(item);







        button.appendChild(title);



        button.appendChild(meta);



        button.addEventListener("mouseenter", () => {



          if (storeAddressSuggestState.activeIndex === index) return;



          storeAddressSuggestState.activeIndex = index;



          renderStoreAddressSuggestPopover();



        });



        button.addEventListener("click", () => {



          applyStoreAddressSuggestion(item);



        });



        settingsStoreAddressResults.appendChild(button);



      });







      settingsStoreAddressResults.classList.remove("hidden");



    }







    function syncStoreAddressCityHintWithInput() {



      const normalizedValue = normalizeStoreAddressSuggestValue(settingsStoreAddress && settingsStoreAddress.value);



      if (!normalizedValue) {



        selectedStoreAddressCityHint = "";



        return;



      }



      if (!selectedStoreAddressCityHint) return;



      const cityPattern = new RegExp(`^${escapeStoreAddressSuggestRegExp(selectedStoreAddressCityHint)}(?:\\s*,|\\s|$)`, "i");



      if (!cityPattern.test(normalizedValue)) {



        selectedStoreAddressCityHint = "";



      }



    }







    function getStoreAddressRemainingInput(value) {



      const normalizedValue = normalizeStoreAddressSuggestValue(value);



      const cityHint = normalizeStoreAddressSuggestValue(selectedStoreAddressCityHint);



      if (!normalizedValue || !cityHint) return normalizedValue;



      const cityPattern = new RegExp(`^${escapeStoreAddressSuggestRegExp(cityHint)}(?:\\s*,\\s*|\\s+)`, "i");



      if (!cityPattern.test(normalizedValue)) {



        return normalizedValue;



      }



      return normalizedValue.replace(cityPattern, "").trim();



    }







    function isStoreAddressSuggestSearchReady(value) {



      const normalizedValue = normalizeStoreAddressSuggestValue(value);



      if (!normalizedValue) return false;



      const remaining = getStoreAddressRemainingInput(normalizedValue);



      if (selectedStoreAddressCityHint && remaining !== normalizedValue) {



        return remaining.length >= 3;



      }



      return normalizedValue.length >= 3;



    }







    function applyStoreAddressSuggestion(item) {



      if (!settingsStoreAddress || !item) return;



      const nextValue = getStoreAddressSuggestionValue(item);



      const resultType = getStoreAddressSuggestionResultType(item);



      if (!nextValue) return;



      settingsStoreAddress.value = nextValue;



      selectedStoreAddressCityHint = resultType === "city"



        ? (String(item.city_name || "").trim() || getStoreAddressSuggestionTitle(item))



        : "";



      closeStoreAddressSuggestPopover();



      settingsStoreAddress.focus();



      setStoreAddressCursorToEnd();



    }







    async function searchStoreAddressSuggestions(query, requestId) {



      const normalizedQuery = normalizeStoreAddressSuggestValue(query);



      if (!normalizedQuery) {



        closeStoreAddressSuggestPopover();



        return;



      }



      if (requestId !== storeAddressSuggestState.requestSeq) return;







      storeAddressSuggestState.query = normalizedQuery;



      storeAddressSuggestState.items = [];



      storeAddressSuggestState.activeIndex = -1;



      storeAddressSuggestState.open = true;



      setStoreAddressSuggestStatus("Ищем адрес…", "loading");







      try {



        const res = await authFetch(`/api/admin/system/map-geocode?q=${encodeURIComponent(normalizedQuery)}`);



        const data = await res.json();



        if (requestId !== storeAddressSuggestState.requestSeq) return;



        if (!data || !data.ok || !data.data) {



          if (data && data.error === "GEOCODER_NOT_CONFIGURED") {



            setStoreAddressSuggestItems([]);



            setStoreAddressSuggestStatus("Настройте геокодер РІ разделе «Системные -> Карта».", "error");



            return;



          }



          setStoreAddressSuggestItems([]);



          setStoreAddressSuggestStatus("Не удалось получить подсказки адреса.", "error");



          return;



        }



        let items = Array.isArray(data.data.items) ? data.data.items.slice() : [];



        if (selectedStoreAddressCityHint && getStoreAddressRemainingInput(normalizedQuery).length >= 3) {



          const addressItems = items.filter((item) => getStoreAddressSuggestionResultType(item) === "address");



          if (addressItems.length) {



            items = addressItems;



          }



        }



        if (!items.length) {



          setStoreAddressSuggestItems([]);



          setStoreAddressSuggestStatus("Ничего не найдено.", "empty");



          return;



        }



        setStoreAddressSuggestItems(items);



        setStoreAddressSuggestStatus(`Поиск: ${data.data.scope_label || "Россия"}`, "ready");



      } catch (err) {



        if (requestId !== storeAddressSuggestState.requestSeq) return;



        console.error("Не удалось получить подсказки адреса филиала:", err);



        setStoreAddressSuggestItems([]);



        setStoreAddressSuggestStatus("Не удалось получить подсказки адреса.", "error");



      }



    }







    function scheduleStoreAddressSuggestions() {



      if (!settingsStoreAddress) return;



      syncStoreAddressCityHintWithInput();



      const normalizedValue = normalizeStoreAddressSuggestValue(settingsStoreAddress.value);



      clearStoreAddressSuggestDebounce();



      storeAddressSuggestState.requestSeq += 1;



      if (!normalizedValue) {



        selectedStoreAddressCityHint = "";



        closeStoreAddressSuggestPopover();



        return;



      }



      if (!isStoreAddressSuggestSearchReady(normalizedValue)) {



        closeStoreAddressSuggestPopover();



        return;



      }



      const requestId = storeAddressSuggestState.requestSeq;



      storeAddressSuggestState.debounceTimer = setTimeout(() => {



        storeAddressSuggestState.debounceTimer = null;



        searchStoreAddressSuggestions(normalizedValue, requestId);



      }, 280);



    }







    function createStoreAddressSuggestStageState() {



      return {



        open: false,



        query: "",



        items: [],



        activeIndex: -1,



        status: "",



        mode: "idle",



        requestSeq: 0,



        debounceTimer: null,



      };



    }







    function normalizeStoreAddressSearchKey(value) {



      return String(value || "")



        .toLowerCase()



        .replace(/\u0451/g, "\u0435")



        .replace(/[.,;:()[\]{}"'`~]+/g, " ")



        .replace(/\s+/g, " ")



        .trim();



    }







    function normalizeStoreCitySearchKey(value) {



      return normalizeStoreAddressSearchKey(value)



        .replace(/\b(?:г|город)\.?\s+/g, "")



        .trim();



    }







    function normalizeStoreStreetSearchKey(value) {



      return normalizeStoreAddressSearchKey(value)



        .replace(/\b(?:улица|ул|проспект|пр-кт|просп|переулок|пер|бульвар|бул|площадь|пл|шоссе|ш|проезд|пр-д|набережная|наб|тракт|тупик|туп|аллея|линия|микрорайон|мкр)\b/g, " ")



        .replace(/\s+/g, " ")



        .trim();



    }







    function normalizeStoreAddressValueKey(value) {



      return normalizeStoreAddressSearchKey(value);



    }







    function isStoreAllowedRootCityName(value) {



      return STORE_ADDRESS_ALLOWED_ROOT_CITY_KEYS.has(normalizeStoreCitySearchKey(value));



    }







    function getStoreAllowedRootCityItems() {



      return STORE_ADDRESS_ALLOWED_ROOT_CITIES.map((cityName) => {



        const cacheKey = normalizeStoreCitySearchKey(cityName);



        return enrichStoreAddressCityItem(



          storeAddressSuggestCache.cities.get(cacheKey) || createStoreAddressCityItem(cityName)



        );



      }).filter(Boolean);



    }







    function normalizeStoreStreetSearchKey(value) {



      return normalizeStoreAddressSearchKey(value)



        .replace(/\b(?:\u0443\u043b\u0438\u0446\u0430|\u0443\u043b|\u043f\u0440\u043e\u0441\u043f\u0435\u043a\u0442|\u043f\u0440-\u043a\u0442|\u043f\u0440\u043e\u0441\u043f|\u043f\u0435\u0440\u0435\u0443\u043b\u043e\u043a|\u043f\u0435\u0440|\u0431\u0443\u043b\u044c\u0432\u0430\u0440|\u0431\u0443\u043b|\u043f\u043b\u043e\u0449\u0430\u0434\u044c|\u043f\u043b|\u0448\u043e\u0441\u0441\u0435|\u0448|\u043f\u0440\u043e\u0435\u0437\u0434|\u043f\u0440-\u0434|\u043d\u0430\u0431\u0435\u0440\u0435\u0436\u043d\u0430\u044f|\u043d\u0430\u0431|\u0442\u0440\u0430\u043a\u0442|\u0442\u0443\u043f\u0438\u043a|\u0442\u0443\u043f|\u0430\u043b\u043b\u0435\u044f|\u043b\u0438\u043d\u0438\u044f|\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d|\u043c\u043a\u0440)\b/g, " ")



        .replace(/(\d+)\s*-\s*(?:\u0433\u043e|\u0439|\u044f|\u044b\u0439|\u0430\u044f)\b/giu, "$1")



        .replace(/(\d+)(?:-\u0433\u043e|-\u0439|-\u044f|-\u044b\u0439|-\u0430\u044f)\b/giu, "$1")



        .replace(/\s+/g, " ")



        .trim();



    }







    function getStoreAddressItemType(item) {



      const rawType = String(item && item.object_type || "").trim();



      if (rawType === "city") return "city";



      if (rawType === "street") return "street";



      if (rawType === "context-locality") return "context-locality";



      return "address";



    }







    function isStoreAddressOrdinalPair(token, nextToken) {



      return /^\d+$/.test(String(token || "").trim()) && /^(й|я|ый|ая)$/.test(String(nextToken || "").trim());



    }







    const STORE_ADDRESS_BLOCKED_HOUSE_FIRST_WORDS = new Set([



      "\u043b\u0435\u0442",



      "\u0433\u043e\u0434\u0430",



      "\u0433\u043e\u0434",



      "\u0443\u043b\u0438\u0446\u0430",



      "\u0443\u043b",



      "\u043f\u0440\u043e\u0441\u043f\u0435\u043a\u0442",



      "\u043f\u0440-\u043a\u0442",



      "\u043f\u0440",



      "\u043f\u0435\u0440\u0435\u0443\u043b\u043e\u043a",



      "\u043f\u0435\u0440",



      "\u043f\u0440\u043e\u0435\u0437\u0434",



      "\u043f\u0440-\u0434",



      "\u0448\u043e\u0441\u0441\u0435",



      "\u043f\u043b\u043e\u0449\u0430\u0434\u044c",



      "\u043f\u043b",



      "\u0431\u0443\u043b\u044c\u0432\u0430\u0440",



      "\u0431\u0443\u043b",



      "\u043d\u0430\u0431\u0435\u0440\u0435\u0436\u043d\u0430\u044f",



      "\u043d\u0430\u0431",



      "\u0442\u0440\u0430\u043a\u0442",



      "\u0442\u0443\u043f\u0438\u043a",



      "\u0430\u043b\u043b\u0435\u044f",



      "\u043b\u0438\u043d\u0438\u044f",



      "\u043c\u0438\u043a\u0440\u043e\u0440\u0430\u0439\u043e\u043d",



      "\u043c\u043a\u0440",



      "\u043a\u0432\u0430\u0440\u0442\u0430\u043b",



      "\u043a\u0432-\u043b",



      "\u043f\u043e\u0441\u0435\u043b\u043e\u043a",



      "\u043f\u043e\u0441\u0451\u043b\u043e\u043a",



      "\u043f\u043e\u0441",



      "\u0441\u0435\u043b\u043e",



      "\u0434\u0435\u0440\u0435\u0432\u043d\u044f",



      "\u0442\u0435\u0440\u0440\u0438\u0442\u043e\u0440\u0438\u044f",



      "\u0440\u0430\u0439\u043e\u043d",



    ]);







    const STORE_ADDRESS_HOUSE_PATTERNS = [



      /^\d+[\u0430-\u044fa-z]?(?:[/-]\d+[\u0430-\u044fa-z]?)?$/iu,



      /^\d+[\u0430-\u044fa-z]?\u043a\d+[\u0430-\u044fa-z]?$/iu,



      /^\d+[\u0430-\u044fa-z]?\u0441\d+[\u0430-\u044fa-z]?$/iu,



      /^\d+[\u0430-\u044fa-z]?\u043b\u0438\u0442[\u0430-\u044fa-z]$/iu,



    ];







    const STORE_ADDRESS_HOUSE_PREFIX_RE = /^(?:\u0434\u043e\u043c|\u0434)$/u;



    const STORE_ADDRESS_HOUSE_CORPUS_RE = /^\u043a(?:\u043e\u0440\u043f(?:\u0443\u0441)?)?$/u;



    const STORE_ADDRESS_HOUSE_BUILDING_RE = /^(?:\u0441\u0442\u0440(?:\u043e\u0435\u043d\u0438\u0435)?|\u0441)$/u;



    const STORE_ADDRESS_HOUSE_LITERAL_RE = /^(?:\u043b\u0438\u0442(?:\u0435\u0440)?)$/u;







    function normalizeStoreAddressHouseToken(value) {



      const normalized = String(value || "")



        .toLowerCase()



        .replace(/\u0451/g, "\u0435")



        .replace(/[.,;:()[\]{}"'`~]+/g, " ")



        .replace(/\s*\/\s*/g, "/")



        .replace(/\s*-\s*/g, "-")



        .replace(/\s+/g, " ")



        .trim();



      if (!normalized) return "";







      const tokens = normalized.split(" ").filter(Boolean);



      const result = [];



      for (let index = 0; index < tokens.length; index += 1) {



        const token = tokens[index];



        if (STORE_ADDRESS_HOUSE_PREFIX_RE.test(token)) continue;



        if (STORE_ADDRESS_HOUSE_CORPUS_RE.test(token)) {



          const next = tokens[index + 1] || "";



          if (next) {



            result.push(`\u043a${next}`);



            index += 1;



          } else {



            result.push("\u043a");



          }



          continue;



        }



        if (STORE_ADDRESS_HOUSE_BUILDING_RE.test(token)) {



          const next = tokens[index + 1] || "";



          if (next) {



            result.push(`\u0441${next}`);



            index += 1;



          } else {



            result.push("\u0441");



          }



          continue;



        }



        if (STORE_ADDRESS_HOUSE_LITERAL_RE.test(token)) {



          const next = tokens[index + 1] || "";



          if (next) {



            result.push(`\u043b\u0438\u0442${next}`);



            index += 1;



          } else {



            result.push("\u043b\u0438\u0442");



          }



          continue;



        }



        result.push(token);



      }







      return result



        .join("")



        .replace(/(\d)\s+([a-z\u0430-\u044f])/giu, "$1$2")



        .trim();



    }







    function isStoreAddressStandaloneHouseToken(token) {



      const normalized = normalizeStoreAddressHouseToken(token);



      if (!normalized) return false;



      return STORE_ADDRESS_HOUSE_PATTERNS.some((pattern) => pattern.test(normalized));



    }







    function extractStoreAddressHouseCandidate(tokens, side = "end") {



      const list = Array.isArray(tokens) ? tokens : [];



      const maxSpan = Math.min(3, list.length);



      for (let span = maxSpan; span >= 1; span -= 1) {



        const candidateTokens = side === "start"



          ? list.slice(0, span)



          : list.slice(list.length - span);



        const candidate = candidateTokens.join(" ");



        const normalizedCandidate = normalizeStoreAddressHouseToken(candidate);



        if (!normalizedCandidate || !isStoreAddressStandaloneHouseToken(normalizedCandidate)) continue;







        if (side === "start") {



          const firstToken = candidateTokens[0] || "";



          const nextToken = list[span] || "";



          if (isStoreAddressOrdinalPair(firstToken, nextToken)) continue;



          if (nextToken && STORE_ADDRESS_BLOCKED_HOUSE_FIRST_WORDS.has(String(nextToken || "").trim())) continue;



          return normalizedCandidate;



        }







        const firstCandidateToken = candidateTokens[0] || "";



        const beforeCandidate = list[list.length - span - 1] || "";



        if (isStoreAddressOrdinalPair(beforeCandidate, firstCandidateToken)) continue;



        return normalizedCandidate;



      }



      return "";



    }







    function extractStoreAddressHousePart(value) {



      const tokens = normalizeStoreAddressSearchKey(value).split(" ").filter(Boolean);



      if (!tokens.length) return "";



      return extractStoreAddressHouseCandidate(tokens, "end")



        || extractStoreAddressHouseCandidate(tokens, "start")



        || "";



    }







    function removeStoreAddressHousePart(value) {



      const normalizedValue = normalizeStoreAddressSearchKey(value);



      const normalizedHouse = normalizeStoreAddressHouseToken(extractStoreAddressHousePart(normalizedValue));



      if (!normalizedValue || !normalizedHouse) return normalizedValue;



      const tokens = normalizedValue.split(" ").filter(Boolean);



      const maxSpan = Math.min(3, tokens.length);







      for (let span = 1; span <= maxSpan; span += 1) {



        const tailTokens = tokens.slice(tokens.length - span);



        if (normalizeStoreAddressHouseToken(tailTokens.join(" ")) === normalizedHouse) {



          return tokens.slice(0, tokens.length - span).join(" ").trim();



        }



      }







      for (let span = 1; span <= maxSpan; span += 1) {



        const headTokens = tokens.slice(0, span);



        if (normalizeStoreAddressHouseToken(headTokens.join(" ")) === normalizedHouse) {



          return tokens.slice(span).join(" ").trim();



        }



      }







      return normalizedValue;



    }







    function getStoreAddressDisplayValue(baseCityName, contextLocality, addressValue) {



      const baseCity = normalizeStoreAddressSuggestValue(baseCityName);



      const context = normalizeStoreAddressSuggestValue(contextLocality);



      const address = normalizeStoreAddressSuggestValue(addressValue);



      if (!address) return "";



      if (!context) return address;



      if (normalizeStoreCitySearchKey(baseCity) === normalizeStoreCitySearchKey(context)) return address;



      if (normalizeStoreAddressValueKey(address).startsWith(normalizeStoreAddressValueKey(context))) return address;



      return `${context}, ${address}`;



    }







    function getStoreResolvedRootCityName() {



      return normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      ) || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



    }







    function getStoreAddressLocalityMeta(item) {



      return normalizeStoreAddressSuggestValue(item && (item.context_locality || item.city_name));



    }







    function stripStoreAddressLocalityPrefix(localityName, addressValue) {



      const locality = normalizeStoreAddressSuggestValue(localityName);



      const address = normalizeStoreAddressSuggestValue(addressValue);



      if (!locality || !address) return address;



      const normalizedLocality = normalizeStoreAddressValueKey(locality);



      const normalizedAddress = normalizeStoreAddressValueKey(address);



      if (!normalizedLocality || !normalizedAddress.startsWith(normalizedLocality)) return address;



      const suffix = address.slice(locality.length).replace(/^[,\s]+/, "").trim();



      return suffix || address;



    }







    function getStoreAddressSuggestionSearchValue(item, stage = "address") {



      if (stage === "house") {



        return normalizeStoreAddressSuggestValue(



          item && (item.house_number || item.value || item.label || item.full_address)



        );



      }



      if (stage === "lookup") {



        return normalizeStoreAddressSuggestValue(



          item && (item.full_address || item.label || item.value)



        );



      }



      if (stage === "address") {



        return normalizeStoreAddressSuggestValue(item && (item.street_name || item.value || item.label));



      }



      const rawValue = normalizeStoreAddressSuggestValue(item && (item.full_address || item.value || item.label));



      const locality = getStoreAddressLocalityMeta(item);



      return rawValue || getStoreAddressDisplayValue("", locality, normalizeStoreAddressSuggestValue(item && (item.value || item.label)));



    }







    function isStoreAddressHouseLikeQuery(value) {



      const normalized = normalizeStoreAddressSearchKey(value);



      if (!normalized) return false;



      if (/\b(?:дом|д|корпус|корп|строение|стр|литер|кв|квартира|подъезд|под|этаж|эт)\b/.test(normalized)) {



        return true;



      }



      return Boolean(extractStoreAddressHousePart(normalized));



    }







    function getStoreAddressSuggestionTypeRank(stage, query, item) {



      if (stage !== "address" && stage !== "lookup") return 0;



      const itemType = getStoreAddressItemType(item);



      const prefersAddress = stage === "lookup" || isStoreAddressHouseLikeQuery(query);



      if (prefersAddress) {



        if (itemType === "address") return 0;



        if (itemType === "street") return 1;



        return 2;



      }



      if (itemType === "street") return 0;



      if (itemType === "context-locality") return 1;



      return 2;



    }







    function getStoreAddressSuggestionLocalityRank(stage, item) {



      if (stage !== "address" && stage !== "lookup") return 0;



      const resolvedCity = getStoreResolvedRootCityName();



      const itemLocality = getStoreAddressLocalityMeta(item);



      if (!resolvedCity || !itemLocality) return 0;



      return normalizeStoreCitySearchKey(resolvedCity) === normalizeStoreCitySearchKey(itemLocality) ? 0 : 1;



    }







    function compareStoreAddressSuggestionEntries(stage, query, left, right) {



      const leftLocalityRank = getStoreAddressSuggestionLocalityRank(stage, left.item);



      const rightLocalityRank = getStoreAddressSuggestionLocalityRank(stage, right.item);



      if (leftLocalityRank !== rightLocalityRank) return leftLocalityRank - rightLocalityRank;



      const leftTypeRank = getStoreAddressSuggestionTypeRank(stage, query, left.item);



      const rightTypeRank = getStoreAddressSuggestionTypeRank(stage, query, right.item);



      if (leftTypeRank !== rightTypeRank) return leftTypeRank - rightTypeRank;



      if (left.score !== right.score) return left.score - right.score;



      const leftLabel = getStoreAddressSuggestionSearchValue(left.item, stage);



      const rightLabel = getStoreAddressSuggestionSearchValue(right.item, stage);



      return leftLabel.localeCompare(rightLabel, "ru");



    }







    function getStoreAddressFieldConfig(stage) {



      return storeAddressSuggestFields[stage] || null;



    }







    function getStoreAddressStageState(stage) {



      return storeAddressSuggestState[stage] || null;



    }







    function getStoreAddressStageNormalizer(stage) {



      if (stage === "city") return normalizeStoreCitySearchKey;



      if (stage === "house") return normalizeStoreAddressHouseToken;



      if (stage === "lookup") return normalizeStoreAddressValueKey;



      return normalizeStoreStreetSearchKey;



    }







    function getStoreAddressCacheCityKey(city) {



      return normalizeStoreCitySearchKey(city);



    }







    function getStoreAllowedRootCityCoords(cityName) {



      const cacheKey = getStoreAddressCacheCityKey(cityName);



      if (!cacheKey) return null;



      const coords = STORE_ADDRESS_ALLOWED_ROOT_CITY_COORDS[cacheKey];



      if (!coords || !hasStoreAddressMapPoint(coords.lat, coords.lng)) return null;



      return {



        lat: normalizeStoreMapCoordinate(coords.lat),



        lng: normalizeStoreMapCoordinate(coords.lng),



      };



    }







    function enrichStoreAddressCityItem(item) {



      const selectionItem = cloneStoreAddressSelectionItem(item, "city");



      if (!selectionItem) return null;



      if (hasStoreAddressMapPoint(selectionItem.lat, selectionItem.lng)) {



        return selectionItem;



      }



      const cacheKey = getStoreAddressCacheCityKey(selectionItem.city_name || selectionItem.value || selectionItem.label);



      const cachedItem = cacheKey ? storeAddressSuggestCache.cities.get(cacheKey) : null;



      if (cachedItem && hasStoreAddressMapPoint(cachedItem.lat, cachedItem.lng)) {



        selectionItem.lat = normalizeStoreMapCoordinate(cachedItem.lat);



        selectionItem.lng = normalizeStoreMapCoordinate(cachedItem.lng);



        return selectionItem;



      }



      const fallbackCoords = getStoreAllowedRootCityCoords(selectionItem.city_name || selectionItem.value || selectionItem.label);



      if (!fallbackCoords) return selectionItem;



      selectionItem.lat = fallbackCoords.lat;



      selectionItem.lng = fallbackCoords.lng;



      return selectionItem;



    }







    function createStoreAddressCityItem(cityName) {



      const value = normalizeStoreAddressSuggestValue(cityName);



      if (!value) return null;



      const coords = getStoreAllowedRootCityCoords(value);



      return {



        stage: "city",



        label: value,



        value,



        source_key: "",



        object_type: "city",



        city_name: value,



        context_locality: value,



        normalized_city: normalizeStoreCitySearchKey(value),



        normalized_address: "",



        street_name: "",



        house_number: "",



        full_address: value,



        lat: coords ? coords.lat : null,



        lng: coords ? coords.lng : null,



      };



    }







    function createStoreAddressItem(cityName, addressValue, extra = {}) {



      const city = normalizeStoreAddressSuggestValue(cityName);



      const address = normalizeStoreAddressSuggestValue(addressValue);



      if (!city || !address) return null;



      const contextLocality = normalizeStoreAddressSuggestValue(extra && (extra.context_locality || extra.city_name || city));



      const itemType = getStoreAddressItemType(extra);



      return {



        stage: "address",



        label: address,



        value: address,



        city_name: city,



        source_key: String(extra && extra.source_key || "").trim(),



        locality_source_key: String(extra && extra.locality_source_key || "").trim(),



        street_name: normalizeStoreAddressSuggestValue(extra && extra.street_name),



        house_number: normalizeStoreAddressSuggestValue(extra && extra.house_number),



        full_address: normalizeStoreAddressSuggestValue(extra && extra.full_address) || `${city}, ${address}`,



        object_type: itemType === "city" ? "address" : itemType,



        context_locality: contextLocality,



        normalized_city: normalizeStoreCitySearchKey(extra && (extra.normalized_city || city)),



        normalized_address: normalizeStoreAddressValueKey(extra && (extra.normalized_address || address)),



        lat: extra && extra.lat !== undefined ? normalizeStoreMapCoordinate(extra.lat) : null,



        lng: extra && extra.lng !== undefined ? normalizeStoreMapCoordinate(extra.lng) : null,



      };



    }







    function cloneStoreAddressSelectionItem(item, fallbackStage = "address") {



      if (!item) return null;



      const stage = String(item.stage || fallbackStage || "address").trim() || "address";



      const cityName = normalizeStoreAddressSuggestValue(item.city_name || item.context_locality || item.value || item.label);



      const value = normalizeStoreAddressSuggestValue(item.value || item.label || item.full_address);



      return {



        stage,



        label: normalizeStoreAddressSuggestValue(item.label || value || cityName),



        value: value || cityName,



        source_key: String(item.source_key || "").trim(),



        locality_source_key: String(item.locality_source_key || "").trim(),



        object_type: stage === "city" ? "city" : getStoreAddressItemType(item),



        city_name: cityName,



        context_locality: normalizeStoreAddressSuggestValue(item.context_locality || cityName),



        normalized_city: normalizeStoreCitySearchKey(item.normalized_city || cityName),



        normalized_address: normalizeStoreAddressValueKey(item.normalized_address || value),



        street_name: normalizeStoreAddressSuggestValue(item.street_name || (stage === "address" ? value : "")),



        house_number: normalizeStoreAddressSuggestValue(item.house_number),



        full_address: normalizeStoreAddressSuggestValue(item.full_address || [cityName, value].filter(Boolean).join(", ")),



        lat: item && item.lat !== undefined ? normalizeStoreMapCoordinate(item.lat) : null,



        lng: item && item.lng !== undefined ? normalizeStoreMapCoordinate(item.lng) : null,



      };



    }







    function getStoreAddressStreetDisplayValue(item) {



      const streetLabel = normalizeStoreAddressSuggestValue(item && (item.street_name || item.value || item.label));



      const baseCity = normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      );



      const contextLocality = normalizeStoreAddressSuggestValue(item && (item.context_locality || item.city_name));



      return getStoreAddressDisplayValue(baseCity, contextLocality, streetLabel);



    }







    function getStoreStreetInputValue(item) {



      return normalizeStoreAddressSuggestValue(item && (item.street_name || item.value || item.label));



    }







    function getStoreHouseInputValue(item) {



      return normalizeStoreAddressSuggestValue(item && (item.house_number || item.house || item.value || item.label));



    }







    function getStoreLocalityInputValue() {



      return normalizeStoreAddressSuggestValue(settingsStoreLocality && settingsStoreLocality.value);



    }







    function getStoreLocalityInputValueForSelection(item, baseCityName = "") {



      const cityName = normalizeStoreAddressSuggestValue(baseCityName || (item && item.city_name));



      const contextLocality = normalizeStoreAddressSuggestValue(item && (item.context_locality || item.city_name || cityName));



      if (!contextLocality) return "";



      if (normalizeStoreCitySearchKey(cityName) === normalizeStoreCitySearchKey(contextLocality)) return "";



      return contextLocality;



    }







    function buildStoreStreetHouseValue(streetValue, houseValue) {



      const street = normalizeStoreAddressSuggestValue(streetValue);



      const house = normalizeStoreAddressSuggestValue(houseValue);



      if (!street) return "";



      return [street, house].filter(Boolean).join(", ");



    }







    function buildStoreCombinedAddressValue(baseCityName, contextLocality, streetValue, houseValue) {



      const shortAddress = buildStoreStreetHouseValue(streetValue, houseValue);



      return getStoreAddressDisplayValue(baseCityName, contextLocality, shortAddress);



    }







    function getStoreLookupStreetContinuationInfo(value) {



      const selectedStreet = storeAddressSelectionState.selectedStreet;



      if (!selectedStreet) {



        return {



          preserve: false,



          housePart: "",



          streetPart: "",



        };



      }



      const lookupValue = normalizeStoreAddressSuggestValue(value);



      if (!lookupValue) {



        return {



          preserve: false,



          housePart: "",



          streetPart: "",



        };



      }



      const rootCityName = getStoreResolvedRootCityName()



        || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const localityName = getStoreLocalityInputValueForSelection(selectedStreet, rootCityName);



      let comparableValue = lookupValue;



      if (rootCityName) {



        comparableValue = stripStoreAddressLocalityPrefix(rootCityName, comparableValue);



      }



      if (localityName) {



        comparableValue = stripStoreAddressLocalityPrefix(localityName, comparableValue);



      }



      const streetPart = removeStoreAddressHousePart(comparableValue) || comparableValue;



      const queryStreetKey = normalizeStoreStreetSearchKey(streetPart);



      const selectedStreetKey = normalizeStoreStreetSearchKey(getStoreStreetInputValue(selectedStreet));



      const preserve = Boolean(



        queryStreetKey



        && selectedStreetKey



        && (



          queryStreetKey === selectedStreetKey



          || selectedStreetKey.startsWith(queryStreetKey)



          || queryStreetKey.startsWith(selectedStreetKey)



        )



      );



      return {



        preserve,



        housePart: preserve ? extractStoreAddressHousePart(comparableValue) : "",



        streetPart,



      };



    }







    function stripStoreAddressHouseSuffix(addressValue, housePart) {



      const address = normalizeStoreAddressSuggestValue(addressValue);



      const house = normalizeStoreAddressSuggestValue(housePart);



      if (!address || !house) return address;



      const escapedHouse = house.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");



      const patterns = [



        new RegExp(`,\\s*${escapedHouse}\\s*$`, "i"),



        new RegExp(`\\s+${escapedHouse}\\s*$`, "i"),



      ];



      for (const pattern of patterns) {



        if (pattern.test(address)) {



          return normalizeStoreAddressSuggestValue(address.replace(pattern, ""));



        }



      }



      return address;



    }







    function deriveStoreAddressFormParts(store) {



      const cityName = normalizeStoreAddressSuggestValue(store && store.city);



      const contextLocality = normalizeStoreAddressSuggestValue(



        store && (store.address_context_locality || store.selected_context_locality)



      );



      const explicitStreet = normalizeStoreAddressSuggestValue(store && store.address_street);



      const explicitHouse = normalizeStoreAddressSuggestValue(store && store.address_house);



      if (explicitStreet || explicitHouse) {



        return {



          street: explicitStreet,



          house: explicitHouse,



          contextLocality,



          combined: buildStoreCombinedAddressValue(cityName, contextLocality, explicitStreet, explicitHouse),



        };



      }







      const savedAddress = normalizeStoreAddressSuggestValue(



        store && (store.address_normalized_display || store.address || "")



      );



      if (!savedAddress) {



        return {



          street: "",



          house: "",



          contextLocality,



          combined: "",



        };



      }







      const withoutLocality = contextLocality



        ? stripStoreAddressLocalityPrefix(contextLocality, savedAddress)



        : savedAddress;



      const derivedHouse = extractStoreAddressHousePart(withoutLocality);



      const derivedStreet = derivedHouse



        ? stripStoreAddressHouseSuffix(withoutLocality, derivedHouse)



        : withoutLocality;



      return {



        street: normalizeStoreAddressSuggestValue(derivedStreet),



        house: normalizeStoreAddressSuggestValue(derivedHouse),



        contextLocality,



        combined: savedAddress,



      };



    }







    function setStoreResolvedCity(item) {



      const selectionItem = enrichStoreAddressCityItem(item);



      if (!selectionItem) {



        storeAddressSelectionState.city = "";



        storeAddressSelectionState.resolvedCity = null;



        return;



      }



      storeAddressSelectionState.city = selectionItem.city_name;



      storeAddressSelectionState.resolvedCity = selectionItem;



    }







    function clearStoreResolvedCitySelection() {



      storeAddressSelectionState.city = "";



      storeAddressSelectionState.resolvedCity = null;



    }







    function clearStoreResolvedAddressSelection() {



      storeAddressSelectionState.address = "";



      storeAddressSelectionState.street = "";



      storeAddressSelectionState.house = "";



      storeAddressSelectionState.manualOverride = false;



      storeAddressSelectionState.selectedStreet = null;



      storeAddressSelectionState.selectedAddress = null;



      storeAddressSelectionState.typedHousePart = "";



      storeAddressSelectionState.contextLocality = "";



      storeAddressSelectionState.sourceKey = "";



      storeAddressSelectionState.objectType = "";



    }







    function syncStoreAddressSelectionWithInput() {



      const cityValue = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const localityValue = getStoreLocalityInputValue();



      const streetValue = normalizeStoreAddressSuggestValue(settingsStoreAddress && settingsStoreAddress.value);



      const houseValue = normalizeStoreAddressSuggestValue(settingsStoreHouse && settingsStoreHouse.value);



      const resolvedCity = storeAddressSelectionState.resolvedCity;



      if (resolvedCity && normalizeStoreCitySearchKey(cityValue) !== normalizeStoreCitySearchKey(resolvedCity.city_name)) {



        clearStoreResolvedCitySelection();



        storeAddressSelectionState.manualOverride = true;



      }







      storeAddressSelectionState.street = streetValue;



      storeAddressSelectionState.house = houseValue;



      storeAddressSelectionState.address = buildStoreCombinedAddressValue(



        cityValue,



        localityValue,



        streetValue,



        houseValue



      );



      storeAddressSelectionState.contextLocality = localityValue;



      storeAddressSelectionState.typedHousePart = houseValue;







      const selectedAddress = storeAddressSelectionState.selectedAddress;



      if (selectedAddress) {



        const selectedStreetValue = getStoreStreetInputValue(selectedAddress);



        const selectedHouseValue = getStoreHouseInputValue(selectedAddress);



        const selectedLocalityValue = getStoreLocalityInputValueForSelection(selectedAddress);



        const selectedCityValue = normalizeStoreAddressSuggestValue(selectedAddress.city_name);



        if (



          normalizeStoreCitySearchKey(cityValue) !== normalizeStoreCitySearchKey(selectedCityValue)



          || normalizeStoreAddressValueKey(streetValue) !== normalizeStoreAddressValueKey(selectedStreetValue)



          || normalizeStoreAddressHouseToken(houseValue) !== normalizeStoreAddressHouseToken(selectedHouseValue)



          || normalizeStoreCitySearchKey(localityValue) !== normalizeStoreCitySearchKey(selectedLocalityValue)



        ) {



          storeAddressSelectionState.manualOverride = true;



          storeAddressSelectionState.selectedAddress = null;



          if (



            normalizeStoreCitySearchKey(cityValue) === normalizeStoreCitySearchKey(selectedCityValue)



            && normalizeStoreAddressValueKey(streetValue) === normalizeStoreAddressValueKey(selectedStreetValue)



            && normalizeStoreCitySearchKey(localityValue) === normalizeStoreCitySearchKey(selectedLocalityValue)



            && storeAddressSelectionState.selectedStreet



          ) {



            storeAddressSelectionState.sourceKey = storeAddressSelectionState.selectedStreet.source_key || "";



            storeAddressSelectionState.objectType = "street";



          } else {



            storeAddressSelectionState.selectedStreet = null;



            storeAddressSelectionState.sourceKey = "";



            storeAddressSelectionState.objectType = "";



          }



        }



      }







      const selectedStreet = storeAddressSelectionState.selectedStreet;



      if (selectedStreet) {



        const selectedStreetValue = getStoreStreetInputValue(selectedStreet);



        const selectedLocalityValue = getStoreLocalityInputValueForSelection(selectedStreet);



        const selectedCityValue = normalizeStoreAddressSuggestValue(selectedStreet.city_name);



        const normalizedStreetValue = normalizeStoreAddressValueKey(selectedStreetValue);



        const normalizedInputStreetValue = normalizeStoreAddressValueKey(streetValue);



        if (



          normalizeStoreCitySearchKey(cityValue) !== normalizeStoreCitySearchKey(selectedCityValue)



          || !normalizedStreetValue



          || normalizedInputStreetValue !== normalizedStreetValue



          || normalizeStoreCitySearchKey(localityValue) !== normalizeStoreCitySearchKey(selectedLocalityValue)



        ) {



          storeAddressSelectionState.manualOverride = true;



          storeAddressSelectionState.selectedStreet = null;



          storeAddressSelectionState.selectedAddress = null;



          storeAddressSelectionState.sourceKey = "";



          storeAddressSelectionState.objectType = "";



        } else {



          storeAddressSelectionState.sourceKey = storeAddressSelectionState.selectedAddress



            ? (storeAddressSelectionState.selectedAddress.source_key || "")



            : (selectedStreet.source_key || "");



          storeAddressSelectionState.objectType = storeAddressSelectionState.selectedAddress ? "address" : "street";



          storeAddressSelectionState.contextLocality = localityValue;



          return;



        }



      }







      storeAddressSelectionState.address = buildStoreStreetHouseValue(streetValue, houseValue);



      storeAddressSelectionState.contextLocality = localityValue;



      storeAddressSelectionState.sourceKey = "";



      storeAddressSelectionState.objectType = "";



      storeAddressSelectionState.typedHousePart = houseValue;



    }







    function rebuildStoreAddressSuggestCache() {



      storeAddressSuggestCache.cities = new Map();



      storeAddressSuggestCache.addressesByCity = new Map();







      const items = Array.isArray(storesState.items) ? storesState.items : [];



      items.forEach((store) => {



        const cityName = normalizeStoreAddressSuggestValue(store && store.city);



        const addressValue = normalizeStoreAddressSuggestValue(store && store.address);



        const addressItem = createStoreAddressItem(cityName, addressValue);



        if (!addressItem) return;



        const cacheKey = getStoreAddressCacheCityKey(cityName);



        if (!storeAddressSuggestCache.addressesByCity.has(cacheKey)) {



          storeAddressSuggestCache.addressesByCity.set(cacheKey, new Map());



        }



        storeAddressSuggestCache.addressesByCity.get(cacheKey).set(



          normalizeStoreAddressValueKey(addressValue),



          addressItem



        );



      });



    }







    function rememberStoreAddressSuggestItems(stage, items) {



      const list = Array.isArray(items) ? items : [];



      if (stage === "city") {



        list.forEach((item) => {



          if (!isStoreAllowedRootCityName(item && (item.city_name || item.value || item.label))) return;



          const cityItem = enrichStoreAddressCityItem({



            stage: "city",



            label: item && (item.label || item.city_name || item.value),



            value: item && (item.value || item.city_name || item.label),



            city_name: item && (item.city_name || item.value || item.label),



            source_key: item && item.source_key,



            normalized_city: item && item.normalized_city,



            context_locality: item && item.context_locality,



            object_type: "city",



            lat: item && item.lat,



            lng: item && item.lng,



          });



          if (!cityItem) return;



          storeAddressSuggestCache.cities.set(normalizeStoreCitySearchKey(cityItem.value), cityItem);



        });



        return;



      }



      list.forEach((item) => {



        const addressItem = createStoreAddressItem(



          item && item.city_name,



          item && (item.value || item.label || item.full_address),



          item



        );



        if (!addressItem) return;



        const cacheBaseCity = normalizeStoreAddressSuggestValue(



          storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



        ) || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value) || addressItem.city_name;



        const cacheKey = getStoreAddressCacheCityKey(cacheBaseCity);



        if (!storeAddressSuggestCache.addressesByCity.has(cacheKey)) {



          storeAddressSuggestCache.addressesByCity.set(cacheKey, new Map());



        }



        const cacheItemKey = getStoreAddressSuggestionItemKey("address", addressItem);



        if (!cacheItemKey) return;



        storeAddressSuggestCache.addressesByCity.get(cacheKey).set(cacheItemKey, addressItem);



      });



    }







    function computeStoreAddressLevenshtein(leftValue, rightValue) {



      const left = String(leftValue || "");



      const right = String(rightValue || "");



      const rows = left.length + 1;



      const cols = right.length + 1;



      const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));



      for (let row = 0; row < rows; row += 1) matrix[row][0] = row;



      for (let col = 0; col < cols; col += 1) matrix[0][col] = col;



      for (let row = 1; row < rows; row += 1) {



        for (let col = 1; col < cols; col += 1) {



          const cost = left[row - 1] === right[col - 1] ? 0 : 1;



          matrix[row][col] = Math.min(



            matrix[row - 1][col] + 1,



            matrix[row][col - 1] + 1,



            matrix[row - 1][col - 1] + cost



          );



        }



      }



      return matrix[left.length][right.length];



    }







    function getStoreAddressSuggestionItemKey(stage, item) {



      if (stage === "city") {



        return String(item && item.source_key || "").trim()



          || normalizeStoreCitySearchKey(item && (item.city_name || item.value || item.label));



      }



      const sourceKey = String(item && item.source_key || "").trim();



      if (sourceKey) {



        return `${getStoreAddressItemType(item)}::${sourceKey}`;



      }



      return [



        normalizeStoreCitySearchKey(item && (item.context_locality || item.city_name)),



        getStoreAddressItemType(item),



        normalizeStoreAddressValueKey(item && (item.value || item.label || item.full_address)),



      ].join("::");



    }







    function getStoreAddressSuggestionScore(stage, query, item) {



      const normalizer = getStoreAddressStageNormalizer(stage);



      const queryKey = normalizer(query);



      const candidateValue = stage === "city"



        ? String(item && (item.city_name || item.value || item.label) || "")



        : getStoreAddressSuggestionSearchValue(item, stage);



      const candidateKey = normalizer(candidateValue);



      if (!queryKey || !candidateKey) return Number.POSITIVE_INFINITY;



      if (candidateKey === queryKey) return 0;



      if (candidateKey.startsWith(queryKey)) return 10 + (candidateKey.length - queryKey.length) / 100;



      const wordParts = candidateKey.split(" ").filter(Boolean);



      const wordPrefixIndex = wordParts.findIndex((part) => part.startsWith(queryKey));



      if (wordPrefixIndex >= 0) return 20 + wordPrefixIndex;



      const containsIndex = candidateKey.indexOf(queryKey);



      if (containsIndex >= 0) return 30 + containsIndex / 10;



      const compactQuery = queryKey.replace(/\s+/g, "");



      const compactCandidate = candidateKey.replace(/\s+/g, "");



      const threshold = compactQuery.length >= 10 ? 4 : compactQuery.length >= 7 ? 3 : 2;



      const sample = compactCandidate.slice(0, Math.min(compactCandidate.length, compactQuery.length + 4));



      const sampleDistance = computeStoreAddressLevenshtein(compactQuery, sample);



      if (sampleDistance <= threshold) return 50 + sampleDistance;



      let bestWordDistance = Number.POSITIVE_INFINITY;



      wordParts.forEach((part) => {



        const nextSample = part.slice(0, Math.min(part.length, compactQuery.length + 4));



        bestWordDistance = Math.min(bestWordDistance, computeStoreAddressLevenshtein(compactQuery, nextSample));



      });



      if (bestWordDistance <= threshold) return 70 + bestWordDistance;



      return Number.POSITIVE_INFINITY;



    }







    function getLocalStoreAddressSuggestItems(stage) {



      if (stage === "city") {



        return getStoreAllowedRootCityItems();



      }



      const resolvedCity = normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      ) || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const cacheKey = getStoreAddressCacheCityKey(resolvedCity);



      const cityCache = cacheKey ? storeAddressSuggestCache.addressesByCity.get(cacheKey) : null;



      const items = cityCache ? Array.from(cityCache.values()) : [];



      if (stage === "house") {



        const selectedStreetValue = normalizeStoreAddressValueKey(



          getStoreStreetInputValue(storeAddressSelectionState.selectedStreet)



        );



        return items.filter((item) => {



          if (getStoreAddressItemType(item) !== "address") return false;



          if (!selectedStreetValue) return true;



          return normalizeStoreAddressValueKey(getStoreStreetInputValue(item)) === selectedStreetValue;



        });



      }



      if (stage === "lookup") {



        return items.filter((item) => getStoreAddressItemType(item) === "address");



      }



      return items.filter((item) => {



        const itemType = getStoreAddressItemType(item);



        return itemType === "street" || itemType === "context-locality";



      });



    }







    function buildLocalStoreAddressSuggestions(stage, query) {



      if (stage === "city" && !normalizeStoreCitySearchKey(query)) {



        return getLocalStoreAddressSuggestItems(stage).slice(0, 8);



      }



      return getLocalStoreAddressSuggestItems(stage)



        .map((item) => ({



          item,



          score: getStoreAddressSuggestionScore(stage, query, item),



        }))



        .filter((entry) => Number.isFinite(entry.score))



        .sort((left, right) => compareStoreAddressSuggestionEntries(stage, query, left, right))



        .slice(0, 8)



        .map((entry) => entry.item);



    }







    function mergeStoreAddressSuggestItems(stage, query, remoteItems, localItems) {



      const merged = new Map();



      const addItems = (items, sourceBias) => {



        (Array.isArray(items) ? items : []).forEach((item, index) => {



          const key = getStoreAddressSuggestionItemKey(stage, item);



          if (!key) return;



          let score = getStoreAddressSuggestionScore(stage, query, item);



          if (!Number.isFinite(score)) score = 500 + index;



          score += sourceBias;



          const current = merged.get(key);



          if (!current || score < current.score) {



            merged.set(key, { item, score });



          }



        });



      };



      addItems(remoteItems, 0);



      addItems(localItems, 0.25);



      return Array.from(merged.values())



        .sort((left, right) => compareStoreAddressSuggestionEntries(stage, query, left, right))



        .slice(0, 8)



        .map((entry) => entry.item);



    }







    function getStoreAddressSuggestStatusText(stage, mode, remoteScopeLabel) {



      if (mode === "loading") {



        return stage === "city" ? "Ищем города…" : "Ищем адреса…";



      }



      if (mode === "local") return "Похожие варианты";



      if (mode === "ready") return `Поиск: ${remoteScopeLabel || "Россия"}`;



      if (mode === "empty") return "Ничего не найдено.";



      return "";



    }







    function getStoreAddressSuggestTitle(stage, item) {



      if (stage === "city") return String(item && (item.city_name || item.value || item.label) || "Город").trim();



      return String(item && (item.value || item.label || item.full_address) || "Адрес").trim();



    }







    function getStoreAddressSuggestMeta(stage, item) {



      if (stage === "city") return "Город";



      const cityName = String(item && item.city_name || "").trim();



      return cityName || "Адрес";



    }







    function getStoreAddressSuggestTitle(stage, item) {



      if (stage === "city") return String(item && (item.city_name || item.value || item.label) || "Город").trim();



      if (getStoreAddressItemType(item) === "street") {



        return String(item && (item.street_name || item.value || item.label) || "Улица").trim();



      }



      return String(item && (item.value || item.label || item.full_address) || "Адрес").trim();



    }







    function getStoreAddressSuggestMeta(stage, item) {



      if (stage === "city") return "Город";



      const cityName = String(item && item.city_name || "").trim();



      if (getStoreAddressItemType(item) === "street") {



        return cityName ? `Улица - ${cityName}` : "Улица";



      }



      return cityName || "Адрес";



    }







    function getStoreAddressSuggestTitle(stage, item) {



      if (stage === "city") return String(item && (item.city_name || item.value || item.label) || "\u0413\u043e\u0440\u043e\u0434").trim();



      const resolvedCity = getStoreResolvedRootCityName();



      const itemType = getStoreAddressItemType(item);



      if (itemType === "context-locality") {



        return String(item && (item.context_locality || item.value || item.label) || "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c").trim();



      }



      if (itemType === "street") {



        return String(item && (item.street_name || item.value || item.label) || "\u0423\u043b\u0438\u0446\u0430").trim();



      }



      const contextLocality = getStoreAddressLocalityMeta(item);



      const addressValue = normalizeStoreAddressSuggestValue(item && (item.value || item.label || item.full_address));



      return stripStoreAddressLocalityPrefix(



        normalizeStoreCitySearchKey(resolvedCity) === normalizeStoreCitySearchKey(contextLocality) ? "" : contextLocality,



        addressValue



      ) || "\u0410\u0434\u0440\u0435\u0441";



    }







    function getStoreAddressSuggestMeta(stage, item) {



      if (stage === "city") return "\u0413\u043e\u0440\u043e\u0434";



      const cityName = getStoreAddressLocalityMeta(item);



      const itemType = getStoreAddressItemType(item);



      if (itemType === "context-locality") {



        return cityName ? "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c \u2022 " + cityName : "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u043e\u0441\u0442\u044c";



      }



      if (itemType === "street") {



        return cityName ? "\u0423\u043b\u0438\u0446\u0430 \u2022 " + cityName : "\u0423\u043b\u0438\u0446\u0430";



      }



      if (itemType === "address") {



        return cityName ? "\u0410\u0434\u0440\u0435\u0441 \u2022 " + cityName : "\u0410\u0434\u0440\u0435\u0441";



      }



      return cityName || "\u0410\u0434\u0440\u0435\u0441";



    }







    function getStoreAddressSuggestStatusText(stage, mode, remoteScopeLabel) {



      if (mode === "loading") {



        if (stage === "city") return "\u0418\u0449\u0435\u043c \u0433\u043e\u0440\u043e\u0434\u0430\u2026";



        if (stage === "lookup") return "\u0418\u0449\u0435\u043c \u0430\u0434\u0440\u0435\u0441\u0430\u2026";



        if (stage === "house") return "\u0418\u0449\u0435\u043c \u043d\u043e\u043c\u0435\u0440 \u0434\u043e\u043c\u0430\u2026";



        return "\u0418\u0449\u0435\u043c \u0443\u043b\u0438\u0446\u0443\u2026";



      }



      if (mode === "local") return "\u041f\u043e\u0445\u043e\u0436\u0438\u0435 \u0432\u0430\u0440\u0438\u0430\u043d\u0442\u044b";



      if (mode === "ready") {



        if (stage === "city") {



          return remoteScopeLabel



            ? `\u041f\u043e\u0438\u0441\u043a: ${remoteScopeLabel}`



            : "\u0414\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 \u0433\u043e\u0440\u043e\u0434\u0430";



        }



        return `\u041f\u043e\u0438\u0441\u043a: ${remoteScopeLabel || "\u0420\u043e\u0441\u0441\u0438\u044f"}`;



      }



      if (mode === "empty") return "\u041d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u043e.";



      return "";



    }







    function getStoreAddressSuggestTitle(stage, item) {



      if (stage === "city") return String(item && (item.city_name || item.value || item.label) || "\u0413\u043e\u0440\u043e\u0434").trim();



      if (stage === "lookup") {



        const streetName = normalizeStoreAddressSuggestValue(item && (item.street_name || item.value || item.label));



        const houseName = normalizeStoreAddressSuggestValue(item && (item.house_number || item.house || ""));



        return [streetName, houseName].filter(Boolean).join(", ") || String(item && (item.label || item.value || item.full_address) || "\u0410\u0434\u0440\u0435\u0441").trim();



      }



      if (stage === "house") {



        return String(item && (item.house_number || item.value || item.label) || "\u0414\u043e\u043c").trim();



      }



      return String(item && (item.street_name || item.value || item.label) || "\u0423\u043b\u0438\u0446\u0430").trim();



    }







    function getStoreAddressSuggestMeta(stage, item) {



      if (stage === "city") return "\u0413\u043e\u0440\u043e\u0434";



      const cityName = getStoreResolvedRootCityName()



        || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value)



        || normalizeStoreAddressSuggestValue(item && item.city_name);



      const localityName = getStoreAddressLocalityMeta(item);



      if (stage === "lookup") {



        const metaParts = [cityName];



        if (localityName && normalizeStoreCitySearchKey(localityName) !== normalizeStoreCitySearchKey(cityName)) {



          metaParts.push(localityName);



        }



        const itemType = getStoreAddressItemType(item);



        metaParts.push(itemType === "street" ? "\u0423\u043b\u0438\u0446\u0430" : "\u0410\u0434\u0440\u0435\u0441");



        return metaParts.filter(Boolean).join(" \u2022 ") || "\u0410\u0434\u0440\u0435\u0441";



      }



      if (stage === "house") {



        const streetName = getStoreStreetInputValue(item);



        return Array.from(new Set([cityName, localityName, streetName].filter(Boolean))).join(" \u2022 ") || "\u0414\u043e\u043c";



      }



      return Array.from(new Set([cityName, localityName].filter(Boolean))).join(" \u2022 ") || "\u0423\u043b\u0438\u0446\u0430";



    }







    function tryAutoResolveStoreCityFromItems(rawQuery, items) {



      const queryKey = normalizeStoreCitySearchKey(rawQuery);



      if (!queryKey) return null;



      const exactMatches = (Array.isArray(items) ? items : []).filter((item) => {



        return normalizeStoreCitySearchKey(item && (item.city_name || item.value || item.label)) === queryKey;



      });



      if (exactMatches.length !== 1) return null;



      const citySelection = cloneStoreAddressSelectionItem(exactMatches[0], "city");



      if (!citySelection || !settingsStoreCity) return null;



      settingsStoreCity.value = citySelection.city_name || rawQuery;



      setStoreResolvedCity(citySelection);



      syncStoreAddressMapBasePoint({ forcePending: true });



      syncStoreAddressInputAvailability();



      return citySelection;



    }







    function focusStoreAddressInputEnd(stage) {



      const field = getStoreAddressFieldConfig(stage);



      if (!field || !field.input) return;



      const length = field.input.value.length;



      try {



        field.input.setSelectionRange(length, length);



      } catch (_) {}



    }







    function clearStoreAddressSuggestDebounce(stage) {



      const state = getStoreAddressStageState(stage);



      if (!state || !state.debounceTimer) return;



      clearTimeout(state.debounceTimer);



      state.debounceTimer = null;



    }







    function closeStoreAddressSuggestPopover(stage) {



      const normalizedStage = String(stage || "").trim();



      if (!normalizedStage) {



        Object.keys(storeAddressSuggestState).forEach((key) => closeStoreAddressSuggestPopover(key));



        return;



      }



      const state = getStoreAddressStageState(normalizedStage);



      if (!state) return;



      clearStoreAddressSuggestDebounce(normalizedStage);



      state.requestSeq += 1;



      state.open = false;



      state.query = "";



      state.items = [];



      state.activeIndex = -1;



      state.status = "";



      state.mode = "idle";



      renderStoreAddressSuggestPopover(normalizedStage);



    }







    function closeAllStoreAddressSuggestPopovers(exceptStage = "") {



      Object.keys(storeAddressSuggestState).forEach((stage) => {



        if (stage === exceptStage) return;



        closeStoreAddressSuggestPopover(stage);



      });



    }







    function resetStoreAddressSuggestState(options = {}) {



      const clearInputs = options && options.clearInputs === true;



      clearStoreResolvedCitySelection();



      clearStoreResolvedAddressSelection();



      Object.keys(storeAddressSuggestState).forEach((stage) => {



        closeStoreAddressSuggestPopover(stage);



      });



      if (clearInputs) {



        if (settingsStoreCity) settingsStoreCity.value = "";



        if (settingsStoreAddress) settingsStoreAddress.value = "";



      }



      syncStoreAddressInputAvailability();



    }







    function syncStoreAddressInputAvailability() {



      const cityReady = Boolean(storeAddressSelectionState.resolvedCity && normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value));



      if (settingsStoreAddress) settingsStoreAddress.disabled = !cityReady;



      if (!cityReady) closeStoreAddressSuggestPopover("address");



    }







    function clearStoreAddressSelectionFromStage(stage, options = {}) {



      const preserveCurrentInput = options && options.preserveCurrentInput === true;



      const order = ["city", "address"];



      const startIndex = order.indexOf(stage);



      if (startIndex < 0) return;



      for (let index = startIndex; index < order.length; index += 1) {



        const currentStage = order[index];



        storeAddressSelectionState[currentStage] = "";



        if (currentStage === "city") {



          clearStoreResolvedCitySelection();



        }



        if (currentStage === "address") {



          clearStoreResolvedAddressSelection();



        }



        closeStoreAddressSuggestPopover(currentStage);



        const shouldPreserveInput = (preserveCurrentInput && currentStage === stage)



          || (preserveCurrentInput && stage === "city" && currentStage === "address");



        if (!shouldPreserveInput) {



          const field = getStoreAddressFieldConfig(currentStage);



          if (field && field.input) field.input.value = "";



        }



      }



      syncStoreAddressInputAvailability();



    }







    function renderStoreAddressSuggestPopover(stage) {



      const field = getStoreAddressFieldConfig(stage);



      const state = getStoreAddressStageState(stage);



      if (!field || !state || !field.popover || !field.status || !field.results) return;



      const isVisible = state.open && (state.mode !== "idle" || state.items.length > 0);



      field.popover.classList.toggle("hidden", !isVisible);



      if (field.wrap) {



        field.wrap.classList.toggle("is-open", isVisible);



        const siteField = field.wrap.closest(".settings-site-field");



        if (siteField) {



          siteField.classList.toggle("is-address-suggest-open", isVisible);



        }



      }



      if (stage === "city") {



        if (field.input) field.input.setAttribute("aria-expanded", isVisible ? "true" : "false");



        if (settingsStoreCityTrigger) settingsStoreCityTrigger.setAttribute("aria-expanded", isVisible ? "true" : "false");



      }







      const statusText = String(state.status || "").trim();



      field.status.textContent = statusText;



      field.status.classList.toggle("hidden", !statusText);



      field.status.classList.toggle("is-error", state.mode === "error");



      field.status.classList.toggle("is-loading", state.mode === "loading");







      field.results.innerHTML = "";



      const items = Array.isArray(state.items) ? state.items : [];



      if (!items.length) {



        field.results.classList.add("hidden");



        return;



      }



      items.forEach((item, index) => {



        const button = document.createElement("button");



        button.type = "button";



        button.className = "settings-store-address-result";



        if (index === state.activeIndex) button.classList.add("is-active");



        button.setAttribute("aria-selected", index === state.activeIndex ? "true" : "false");







        const title = document.createElement("div");



        title.className = "settings-store-address-result-title";



        title.textContent = getStoreAddressSuggestTitle(stage, item);







        const meta = document.createElement("div");



        meta.className = "settings-store-address-result-meta";



        meta.textContent = getStoreAddressSuggestMeta(stage, item);







        button.appendChild(title);



        button.appendChild(meta);



        button.addEventListener("mouseenter", () => {



          if (state.activeIndex === index) return;



          state.activeIndex = index;



          renderStoreAddressSuggestPopover(stage);



        });



        button.addEventListener("click", () => {



          applyStoreAddressSuggestion(stage, item);



        });



        field.results.appendChild(button);



      });



      field.results.classList.remove("hidden");



    }







    function setStoreAddressSuggestStatus(stage, message, mode = "idle") {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      state.status = String(message || "").trim();



      state.mode = String(mode || "idle").trim() || "idle";



      if (state.mode !== "idle" || state.items.length) {



        state.open = true;



      }



      renderStoreAddressSuggestPopover(stage);



    }







    function setStoreAddressSuggestItems(stage, items) {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      state.items = Array.isArray(items) ? items.slice() : [];



      state.activeIndex = state.items.length ? 0 : -1;



      if (state.items.length) {



        state.open = true;



        if (state.mode === "idle" || state.mode === "loading" || state.mode === "empty") {



          state.mode = "ready";



        }



      }



      renderStoreAddressSuggestPopover(stage);



    }







    function applyStoreAddressSuggestion(stage, item) {



      if (!item) return;



      closeAllStoreAddressSuggestPopovers(stage);



      if (stage === "city") {



        const cityValue = normalizeStoreAddressSuggestValue(item.city_name || item.value || item.label);



        if (!settingsStoreCity || !cityValue) return;



        settingsStoreCity.value = cityValue;



        storeAddressSelectionState.city = cityValue;



        clearStoreAddressSelectionFromStage("address");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("city");



        if (settingsStoreAddress) settingsStoreAddress.focus();



        return;



      }



      const resolvedCity = normalizeStoreAddressSuggestValue(item.city_name);



      const addressValue = normalizeStoreAddressSuggestValue(item.value || item.label || item.full_address);



      if (!settingsStoreAddress || !addressValue) return;



      if (settingsStoreCity && resolvedCity) {



        settingsStoreCity.value = resolvedCity;



        storeAddressSelectionState.city = resolvedCity;



      }



      settingsStoreAddress.value = addressValue;



      storeAddressSelectionState.address = addressValue;



      syncStoreAddressInputAvailability();



      closeStoreAddressSuggestPopover("address");



      settingsStoreAddress.focus();



      focusStoreAddressInputEnd("address");



    }







    function applyStoreAddressSuggestion(stage, item) {



      if (!item) return;



      closeAllStoreAddressSuggestPopovers(stage);



      if (stage === "city") {



        const cityValue = normalizeStoreAddressSuggestValue(item.city_name || item.value || item.label);



        if (!settingsStoreCity || !cityValue) return;



        settingsStoreCity.value = cityValue;



        storeAddressSelectionState.city = cityValue;



        clearStoreAddressSelectionFromStage("address");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("city");



        if (settingsStoreAddress) settingsStoreAddress.focus();



        return;



      }



      const resolvedCity = normalizeStoreAddressSuggestValue(item.city_name);



      const itemType = getStoreAddressItemType(item);



      const addressValue = normalizeStoreAddressSuggestValue(



        itemType === "street"



          ? (item.street_name || item.value || item.label)



          : (item.value || item.label || item.full_address)



      );



      if (!settingsStoreAddress || !addressValue) return;



      if (settingsStoreCity && resolvedCity) {



        settingsStoreCity.value = resolvedCity;



        storeAddressSelectionState.city = resolvedCity;



      }



      settingsStoreAddress.value = addressValue;



      storeAddressSelectionState.address = itemType === "street" ? "" : addressValue;



      syncStoreAddressInputAvailability();



      closeStoreAddressSuggestPopover("address");



      settingsStoreAddress.focus();



      focusStoreAddressInputEnd("address");



    }







    async function searchStoreAddressSuggestions(stage, query, requestId) {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      const normalizedQuery = normalizeStoreAddressSuggestValue(query);



      if (!normalizedQuery) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (requestId !== state.requestSeq) return;







      const localItems = mergeStoreAddressSuggestItems(



        stage,



        normalizedQuery,



        [],



        buildLocalStoreAddressSuggestions(stage, normalizedQuery)



      );



      state.query = normalizedQuery;



      state.items = localItems.slice();



      state.activeIndex = localItems.length ? 0 : -1;



      state.open = true;



      state.mode = "loading";



      state.status = getStoreAddressSuggestStatusText(stage, "loading");



      if (stage === "city") {



        tryAutoResolveStoreCityFromItems(normalizedQuery, localItems);



      }



      renderStoreAddressSuggestPopover(stage);







      const params = new URLSearchParams({ stage, q: normalizedQuery });



      if (stage === "address") {



        params.set("city", normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value));



      }







      try {



        const res = await authFetch(`/api/admin/system/address-suggest-local?${params.toString()}`);



        const data = await res.json();



        if (requestId !== state.requestSeq) return;



        if (!data || !data.ok || !data.data) {



          if (localItems.length) {



            setStoreAddressSuggestItems(stage, localItems);



            setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



            return;



          }



          if (data && data.error === "LOCAL_ADDRESS_INDEX_NOT_READY") {



            setStoreAddressSuggestItems(stage, []);



            setStoreAddressSuggestStatus(stage, "Локальный справочник адресов ещё не загружен.", "error");



            return;



          }



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, "Не удалось получить подсказки адреса.", "error");



          return;



        }







        const remoteItems = Array.isArray(data.data.items) ? data.data.items.slice() : [];



        rememberStoreAddressSuggestItems(stage, remoteItems);



        const mergedItems = mergeStoreAddressSuggestItems(



          stage,



          normalizedQuery,



          remoteItems,



          buildLocalStoreAddressSuggestions(stage, normalizedQuery)



        );



        if (stage === "city") {



          tryAutoResolveStoreCityFromItems(normalizedQuery, mergedItems);



        }



        if (!mergedItems.length) {



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "empty"), "empty");



          return;



        }



        setStoreAddressSuggestItems(stage, mergedItems);



        if (remoteItems.length) {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "ready", data.data.scope_label), "ready");



        } else {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



        }



      } catch (err) {



        if (requestId !== state.requestSeq) return;



        console.error("Не удалось получить подсказки адреса филиала:", err);



        if (localItems.length) {



          setStoreAddressSuggestItems(stage, localItems);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



          return;



        }



        setStoreAddressSuggestItems(stage, []);



        setStoreAddressSuggestStatus(stage, "Не удалось получить подсказки адреса.", "error");



      }



    }







    function applyStoreAddressSuggestion(stage, item) {



      if (!item) return;



      closeAllStoreAddressSuggestPopovers(stage);



      if (stage === "city") {



        const citySelection = cloneStoreAddressSelectionItem(item, "city");



        const cityValue = normalizeStoreAddressSuggestValue(citySelection && (citySelection.city_name || citySelection.value || citySelection.label));



        if (!settingsStoreCity || !cityValue || !citySelection) return;



        settingsStoreCity.value = cityValue;



        setStoreResolvedCity(citySelection);



        clearStoreAddressSelectionFromStage("address");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("city");



        if (settingsStoreAddress) settingsStoreAddress.focus();



        return;



      }







      const selectionItem = cloneStoreAddressSelectionItem(item, "address");



      if (!settingsStoreAddress || !selectionItem) return;



      const itemType = getStoreAddressItemType(selectionItem);



      const resolvedCity = normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      ) || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const currentAddressInput = normalizeStoreAddressSuggestValue(settingsStoreAddress.value);



      const currentHousePart = extractStoreAddressHousePart(currentAddressInput);



      let addressValue = "";



      if (itemType === "context-locality") {



        const localityName = normalizeStoreAddressSuggestValue(



          selectionItem.context_locality || selectionItem.value || selectionItem.label



        );



        addressValue = localityName ? `${localityName}, ` : "";



      } else if (itemType === "street") {



        const streetValue = getStoreAddressStreetDisplayValue(selectionItem);



        addressValue = currentHousePart



          ? getStoreAddressDisplayValue(



            resolvedCity,



            normalizeStoreAddressSuggestValue(selectionItem.context_locality || selectionItem.city_name),



            [normalizeStoreAddressSuggestValue(selectionItem.street_name || selectionItem.value || selectionItem.label), currentHousePart].filter(Boolean).join(", ")



          )



          : streetValue;



      } else {



        addressValue = getStoreAddressDisplayValue(



          resolvedCity,



          normalizeStoreAddressSuggestValue(selectionItem.context_locality || selectionItem.city_name),



          normalizeStoreAddressSuggestValue(selectionItem.value || selectionItem.label || selectionItem.full_address)



        );



      }



      if (!addressValue) return;







      const finalAddressSelection = itemType === "address"



        ? cloneStoreAddressSelectionItem({



          ...selectionItem,



          label: addressValue,



          value: addressValue,



          normalized_address: normalizeStoreAddressValueKey(addressValue),



          full_address: addressValue,



        }, "address")



        : null;



      settingsStoreAddress.value = addressValue;



      storeAddressSelectionState.contextLocality = selectionItem.context_locality || "";



      storeAddressSelectionState.sourceKey = selectionItem.source_key || "";



      storeAddressSelectionState.objectType = itemType;



      storeAddressSelectionState.selectedAddress = finalAddressSelection;



      storeAddressSelectionState.selectedStreet = itemType === "street"



        ? selectionItem



        : (itemType === "address" && selectionItem.street_name



          ? cloneStoreAddressSelectionItem({



            ...selectionItem,



            label: selectionItem.street_name,



            value: selectionItem.street_name,



            object_type: "street",



            house_number: "",



          }, "address")



          : null);



      storeAddressSelectionState.typedHousePart = itemType === "street"



        ? currentHousePart



        : extractStoreAddressHousePart(addressValue);



      storeAddressSelectionState.address = itemType === "street" ? "" : addressValue;



      syncStoreAddressInputAvailability();



      closeStoreAddressSuggestPopover("address");



      settingsStoreAddress.focus();



      focusStoreAddressInputEnd("address");



    }







    async function searchStoreAddressSuggestions(stage, query, requestId) {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      const normalizedQuery = normalizeStoreAddressSuggestValue(query);



      if (!normalizedQuery) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (requestId !== state.requestSeq) return;







      const localItems = buildLocalStoreAddressSuggestions(stage, normalizedQuery);



      state.query = normalizedQuery;



      state.items = localItems.slice();



      state.activeIndex = localItems.length ? 0 : -1;



      state.open = true;



      state.mode = "loading";



      state.status = getStoreAddressSuggestStatusText(stage, "loading");



      renderStoreAddressSuggestPopover(stage);







      const params = new URLSearchParams({ stage, q: normalizedQuery });



      if (stage === "address") {



        params.set("city", normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value));



        const resolvedCity = storeAddressSelectionState.resolvedCity;



        if (resolvedCity && resolvedCity.source_key) {



          params.set("city_source_key", resolvedCity.source_key);



        }



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        const selectedScopeSourceKey = selectedStreet && selectedStreet.source_key



          ? selectedStreet.source_key



          : (



            storeAddressSelectionState.objectType === "context-locality"



            && storeAddressSelectionState.sourceKey



              ? storeAddressSelectionState.sourceKey



              : ""



          );



        if (selectedScopeSourceKey) {



          params.set("selected_source_key", selectedScopeSourceKey);



        }



      }







      try {



        const res = await authFetch(`/api/admin/system/address-suggest-local?${params.toString()}`);



        const data = await res.json();



        if (requestId !== state.requestSeq) return;



        if (!data || !data.ok || !data.data) {



          if (localItems.length) {



            setStoreAddressSuggestItems(stage, localItems);



            setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



            return;



          }



          if (data && data.error === "LOCAL_ADDRESS_INDEX_NOT_READY") {



            setStoreAddressSuggestItems(stage, []);



            setStoreAddressSuggestStatus(stage, "Локальный справочник адресов ещё не загружен.", "error");



            return;



          }



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, "Не удалось получить подсказки адреса.", "error");



          return;



        }







        const remoteItems = Array.isArray(data.data.items) ? data.data.items.slice() : [];



        rememberStoreAddressSuggestItems(stage, remoteItems);



        const mergedItems = mergeStoreAddressSuggestItems(



          stage,



          normalizedQuery,



          remoteItems,



          buildLocalStoreAddressSuggestions(stage, normalizedQuery)



        );



        if (!mergedItems.length) {



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "empty"), "empty");



          return;



        }



        setStoreAddressSuggestItems(stage, mergedItems);



        if (remoteItems.length) {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "ready", data.data.scope_label), "ready");



        } else {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



        }



      } catch (err) {



        if (requestId !== state.requestSeq) return;



        console.error("Не удалось получить подсказки адреса филиала:", err);



        if (localItems.length) {



          setStoreAddressSuggestItems(stage, localItems);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



          return;



        }



        setStoreAddressSuggestItems(stage, []);



        setStoreAddressSuggestStatus(stage, "Не удалось получить подсказки адреса.", "error");



      }



    }







    function scheduleStoreAddressSuggestions(stage) {



      const field = getStoreAddressFieldConfig(stage);



      const state = getStoreAddressStageState(stage);



      if (!field || !state || !field.input) return;



      if (stage === "address" && !(storeAddressSelectionState.resolvedCity && normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value))) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      const normalizedValue = normalizeStoreAddressSuggestValue(field.input.value);



      clearStoreAddressSuggestDebounce(stage);



      state.requestSeq += 1;



      if (!normalizedValue || normalizedValue.length < field.minQuery) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      closeAllStoreAddressSuggestPopovers(stage);



      const requestId = state.requestSeq;



      state.debounceTimer = setTimeout(() => {



        state.debounceTimer = null;



        searchStoreAddressSuggestions(stage, normalizedValue, requestId);



      }, 280);



    }







    function handleStoreAddressStageInput(stage) {



      if (stage === "city") {



        clearStoreAddressSelectionFromStage("city", { preserveCurrentInput: true });



      } else {



        syncStoreAddressSelectionWithInput();



      }



      scheduleStoreAddressSuggestions(stage);



    }







    function handleStoreAddressStageKeyDown(stage, event) {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      if (



        stage === "city"



        && isStoreAddressMapModeEnabled()



        && !state.open



        && (event.key === "ArrowDown" || event.key === "ArrowUp")



      ) {



        event.preventDefault();



        openStoreCityCombobox({ forceList: true });



        return;



      }



      if (event.key === "Escape") {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      const items = Array.isArray(state.items) ? state.items : [];



      if (!state.open || !items.length) return;



      if (event.key === "ArrowDown") {



        event.preventDefault();



        state.activeIndex = Math.min(items.length - 1, Math.max(state.activeIndex, 0) + 1);



        renderStoreAddressSuggestPopover(stage);



        return;



      }



      if (event.key === "ArrowUp") {



        event.preventDefault();



        state.activeIndex = Math.max(0, (state.activeIndex < 0 ? items.length : state.activeIndex) - 1);



        renderStoreAddressSuggestPopover(stage);



        return;



      }



      if (event.key === "Enter" || event.key === "Tab") {



        const activeIndex = state.activeIndex >= 0 ? state.activeIndex : 0;



        const item = items[activeIndex];



        if (!item) return;



        if (event.key === "Enter") event.preventDefault();



        applyStoreAddressSuggestion(stage, item);



      }



    }







    function getStoreCityComboboxQuery(options = {}) {



      const rawValue = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      const resolvedValue = normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      );



      if (options && options.forceList) return "";



      if (!rawValue) return "";



      if (resolvedValue && normalizeStoreCitySearchKey(rawValue) === normalizeStoreCitySearchKey(resolvedValue)) {



        return "";



      }



      return rawValue;



    }







    function openStoreCityCombobox(options = {}) {



      if (!isStoreAddressMapModeEnabled()) return;



      const field = getStoreAddressFieldConfig("city");



      const state = getStoreAddressStageState("city");



      if (!field || !field.input || !state) return;



      clearStoreAddressSuggestDebounce("city");



      state.requestSeq += 1;



      closeAllStoreAddressSuggestPopovers("city");



      const requestId = state.requestSeq;



      const query = getStoreCityComboboxQuery(options);



      state.debounceTimer = setTimeout(() => {



        state.debounceTimer = null;



        searchStoreAddressSuggestions("city", query, requestId);



      }, 60);



    }







    function bindStoreAddressField(stage) {



      const field = getStoreAddressFieldConfig(stage);



      if (!field || !field.input) return;



      field.input.addEventListener("input", () => {



        handleStoreAddressStageInput(stage);



      });



      field.input.addEventListener("focus", () => {



        if (!isStoreAddressMapModeEnabled()) return;



        if (stage === "city") {



          openStoreCityCombobox({ forceList: true });



        }



      });



      field.input.addEventListener("click", () => {



        if (!isStoreAddressMapModeEnabled()) return;



        if (stage === "city") {



          openStoreCityCombobox({ forceList: true });



        }



      });



      field.input.addEventListener("keydown", (event) => {



        handleStoreAddressStageKeyDown(stage, event);



      });



      if (field.wrap) {



        field.wrap.addEventListener("focusout", () => {



          setTimeout(() => {



            if (!field.wrap.contains(document.activeElement)) {



              if (stage === "city" && isStoreAddressMapModeEnabled()) {



                resolveStoreCitySelection({ silent: true }).catch((error) => {



                  console.error("Не удалось нормализовать город филиала:", error);



                });



              }



              closeStoreAddressSuggestPopover(stage);



            }



          }, 0);



        });



      }



    }







    if (settingsStoreCityTrigger) {



      settingsStoreCityTrigger.addEventListener("click", (event) => {



        event.preventDefault();



        if (settingsStoreCity) settingsStoreCity.focus();



        openStoreCityCombobox({ forceList: true });



      });



    }







    function hydrateStoreAddressForm(store) {



      const cityName = normalizeStoreAddressSuggestValue(store && store.city);



      const addressValue = normalizeStoreAddressSuggestValue(store && store.address);



      if (settingsStoreCity) settingsStoreCity.value = cityName;



      if (settingsStoreAddress) settingsStoreAddress.value = addressValue;



      if (settingsStoreFloor) settingsStoreFloor.value = normalizeValue(store && store.floor);



      if (settingsStoreApartment) settingsStoreApartment.value = normalizeValue(store && store.apartment);



      if (settingsStoreCabinet) settingsStoreCabinet.value = normalizeValue(store && store.cabinet);



      if (settingsStoreAddressComment) settingsStoreAddressComment.value = normalizeValue(store && store.address_comment);



      clearStoreResolvedAddressSelection();



      setStoreResolvedCity(createStoreAddressCityItem(cityName));



      storeAddressSelectionState.address = addressValue;



      syncStoreAddressInputAvailability();



      resolveStoreCitySelection({ silent: true }).catch(() => {});



    }







    function getStoreAddressFormPayload() {



      return {



        city: trimOrNull(settingsStoreCity && settingsStoreCity.value),



        address: trimOrNull(settingsStoreAddress && settingsStoreAddress.value),



        resolved_city_source_key: storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.source_key



          ? storeAddressSelectionState.resolvedCity.source_key



          : null,



        selected_source_key: storeAddressSelectionState.sourceKey || null,



        selected_object_type: storeAddressSelectionState.objectType || null,



        selected_context_locality: storeAddressSelectionState.contextLocality || null,



        typed_house_part: storeAddressSelectionState.typedHousePart || null,



        floor: trimOrNull(settingsStoreFloor && settingsStoreFloor.value),



        apartment: trimOrNull(settingsStoreApartment && settingsStoreApartment.value),



        cabinet: trimOrNull(settingsStoreCabinet && settingsStoreCabinet.value),



        address_comment: trimOrNull(settingsStoreAddressComment && settingsStoreAddressComment.value),



      };



    }







    async function resolveStoreCitySelection(options = {}) {



      const rawValue = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



      if (!rawValue) {



        clearStoreAddressSelectionFromStage("city");



        return null;



      }



      if (isStoreAddressMapModeEnabled() && !isStoreAllowedRootCityName(rawValue)) {



        clearStoreResolvedCitySelection();



        syncStoreAddressInputAvailability();



        return null;



      }



      if (



        storeAddressSelectionState.resolvedCity &&



        normalizeStoreCitySearchKey(storeAddressSelectionState.resolvedCity.city_name) === normalizeStoreCitySearchKey(rawValue)



      ) {



        if (hasStoreAddressMapPoint(



          storeAddressSelectionState.resolvedCity.lat,



          storeAddressSelectionState.resolvedCity.lng



        )) {



          return storeAddressSelectionState.resolvedCity;



        }



      }







      const localItems = buildLocalStoreAddressSuggestions("city", rawValue);



      const exactLocalItems = localItems.filter((item) => normalizeStoreCitySearchKey(item && (item.city_name || item.value || item.label)) === normalizeStoreCitySearchKey(rawValue));



      let localResolvedCity = null;



      if (exactLocalItems.length === 1) {



        const citySelection = cloneStoreAddressSelectionItem(exactLocalItems[0], "city");



        if (citySelection && settingsStoreCity) {



          settingsStoreCity.value = citySelection.city_name || rawValue;



          setStoreResolvedCity(citySelection);



          localResolvedCity = storeAddressSelectionState.resolvedCity;



          if (hasStoreAddressMapPoint(citySelection.lat, citySelection.lng)) {



            syncStoreAddressMapBasePoint({ forcePending: true });



          }



          syncStoreAddressInputAvailability();



        }



        if (citySelection && hasStoreAddressMapPoint(citySelection.lat, citySelection.lng)) {



          return storeAddressSelectionState.resolvedCity;



        }



      }







      const params = new URLSearchParams({ stage: "city", q: rawValue });



      try {



        const res = await authFetch(`/api/admin/system/address-suggest-local?${params.toString()}`);



        const data = await res.json();



        if (!data || !data.ok || !data.data) return null;



        const items = Array.isArray(data.data.items) ? data.data.items : [];



        rememberStoreAddressSuggestItems("city", items);



        const exactMatches = items.filter((item) => normalizeStoreCitySearchKey(item && (item.city_name || item.value || item.label)) === normalizeStoreCitySearchKey(rawValue));



        if (exactMatches.length === 1) {



          const citySelection = cloneStoreAddressSelectionItem(exactMatches[0], "city");



          if (citySelection && settingsStoreCity) {



            settingsStoreCity.value = citySelection.city_name || rawValue;



            setStoreResolvedCity(citySelection);



            syncStoreAddressMapBasePoint({ forcePending: true });



            syncStoreAddressInputAvailability();



          }



          return storeAddressSelectionState.resolvedCity;



        }



      } catch (error) {



        if (!(options && options.silent)) {



          console.error("Не удалось разрешить город филиала:", error);



        }



      }



      return storeAddressSelectionState.resolvedCity || localResolvedCity || null;



    }







    function resetStoreAddressSuggestState(options = {}) {



      const clearInputs = options && options.clearInputs === true;



      clearStoreResolvedCitySelection();



      clearStoreResolvedAddressSelection();



      Object.keys(storeAddressSuggestState).forEach((stage) => {



        closeStoreAddressSuggestPopover(stage);



      });



      if (clearInputs) {



        if (settingsStoreCity) settingsStoreCity.value = "";



        if (settingsStoreAddressLookup) settingsStoreAddressLookup.value = "";



        if (settingsStoreLocality) settingsStoreLocality.value = "";



        if (settingsStoreAddress) settingsStoreAddress.value = "";



        if (settingsStoreHouse) settingsStoreHouse.value = "";



      }



      clearStoreAddressMapState({ clearFallback: true });



      applyStoreAddressModeUi();



      syncStoreAddressInputAvailability();



    }







    function applyStoreAddressModeUi() {



      const mapModeEnabled = isStoreAddressMapModeEnabled();



      if (settingsStoreCity) {



        settingsStoreCity.readOnly = mapModeEnabled;



        settingsStoreCity.setAttribute("aria-haspopup", mapModeEnabled ? "listbox" : "false");



      }



      if (settingsStoreCityTrigger) {



        settingsStoreCityTrigger.classList.toggle("hidden", !mapModeEnabled);



      }



      if (settingsStoreAddressLookupField) {



        settingsStoreAddressLookupField.classList.toggle("hidden", !mapModeEnabled);



      }



      if (settingsStoreAddressMapBtn) {



        settingsStoreAddressMapBtn.closest(".settings-site-field")?.classList.toggle("hidden", !mapModeEnabled);



      }



      if (!mapModeEnabled) {



        closeStoreAddressSuggestPopover("city");



        closeStoreAddressSuggestPopover("lookup");



        closeStoreAddressSuggestPopover("address");



        closeStoreAddressSuggestPopover("house");



      }



    }







    function syncStoreAddressInputAvailability() {



      const mapModeEnabled = isStoreAddressMapModeEnabled();



      const resolvedCityName = normalizeStoreAddressSuggestValue(



        storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.city_name



      );



      const hasResolvedCity = Boolean(



        storeAddressSelectionState.resolvedCity



        && resolvedCityName



        && (!mapModeEnabled || isStoreAllowedRootCityName(resolvedCityName))



      );



      const streetSelected = Boolean(



        storeAddressSelectionState.selectedStreet



        && normalizeStoreAddressValueKey(settingsStoreAddress && settingsStoreAddress.value) === normalizeStoreAddressValueKey(



          getStoreStreetInputValue(storeAddressSelectionState.selectedStreet)



        )



      );



      if (settingsStoreAddressLookup) {



        settingsStoreAddressLookup.disabled = !mapModeEnabled || !hasResolvedCity;



      }



      if (settingsStoreAddress) settingsStoreAddress.disabled = false;



      if (settingsStoreHouse) settingsStoreHouse.disabled = false;



      updateStoreAddressMapButtonState();



      if (!mapModeEnabled) {



        closeStoreAddressSuggestPopover("city");



        closeStoreAddressSuggestPopover("lookup");



        closeStoreAddressSuggestPopover("address");



        closeStoreAddressSuggestPopover("house");



        return;



      }



      closeStoreAddressSuggestPopover("address");



      if (!streetSelected) {



        closeStoreAddressSuggestPopover("house");



      }



    }







    function clearStoreAddressSelectionFromStage(stage, options = {}) {



      const preserveCurrentInput = options && options.preserveCurrentInput === true;



      if (stage === "city") {



        clearStoreResolvedCitySelection();



        clearStoreResolvedAddressSelection();



        closeStoreAddressSuggestPopover("city");



        closeStoreAddressSuggestPopover("lookup");



        closeStoreAddressSuggestPopover("address");



        closeStoreAddressSuggestPopover("house");



        if (!preserveCurrentInput && settingsStoreCity) settingsStoreCity.value = "";



        if (settingsStoreAddressLookup) settingsStoreAddressLookup.value = "";



        if (settingsStoreLocality) settingsStoreLocality.value = "";



        if (settingsStoreAddress) settingsStoreAddress.value = "";



        if (settingsStoreHouse) settingsStoreHouse.value = "";



        clearStoreAddressMapState({ clearFallback: true });



        syncStoreAddressInputAvailability();



        return;



      }







      if (stage === "lookup") {



        const preservedLookupValue = preserveCurrentInput



          ? String((settingsStoreAddressLookup && settingsStoreAddressLookup.value) || "")



          : "";



        clearStoreResolvedAddressSelection();



        closeStoreAddressSuggestPopover("lookup");



        closeStoreAddressSuggestPopover("address");



        closeStoreAddressSuggestPopover("house");



        if (settingsStoreAddressLookup) settingsStoreAddressLookup.value = preservedLookupValue;



        if (settingsStoreLocality) settingsStoreLocality.value = "";



        if (settingsStoreAddress) settingsStoreAddress.value = "";



        if (settingsStoreHouse) settingsStoreHouse.value = "";



        storeAddressSelectionState.manualOverride = true;



        storeAddressSelectionState.street = "";



        storeAddressSelectionState.house = "";



        storeAddressSelectionState.contextLocality = "";



        storeAddressSelectionState.address = preservedLookupValue;



        syncStoreAddressInputAvailability();



        return;



      }







      if (stage === "address") {



        const preservedStreetValue = preserveCurrentInput



          ? String((settingsStoreAddress && settingsStoreAddress.value) || "")



          : "";



        clearStoreResolvedAddressSelection();



        if (settingsStoreAddressLookup) settingsStoreAddressLookup.value = "";



        closeStoreAddressSuggestPopover("address");



        closeStoreAddressSuggestPopover("house");



        if (settingsStoreAddress) settingsStoreAddress.value = preservedStreetValue;



        if (settingsStoreHouse) settingsStoreHouse.value = "";



        storeAddressSelectionState.manualOverride = true;



        storeAddressSelectionState.street = preservedStreetValue;



        storeAddressSelectionState.contextLocality = getStoreLocalityInputValue();



        storeAddressSelectionState.address = preservedStreetValue;



        syncStoreAddressInputAvailability();



        return;



      }







      if (stage === "house") {



        const preservedHouseValue = preserveCurrentInput



          ? String((settingsStoreHouse && settingsStoreHouse.value) || "")



          : "";



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        storeAddressSelectionState.selectedAddress = null;



        storeAddressSelectionState.manualOverride = true;



        storeAddressSelectionState.house = preservedHouseValue;



        storeAddressSelectionState.typedHousePart = preservedHouseValue;



        storeAddressSelectionState.sourceKey = selectedStreet



          ? (selectedStreet.source_key || "")



          : "";



        storeAddressSelectionState.objectType = selectedStreet ? "street" : "";



        storeAddressSelectionState.contextLocality = getStoreLocalityInputValue()



          || (selectedStreet ? (selectedStreet.context_locality || "") : "");



        storeAddressSelectionState.address = buildStoreCombinedAddressValue(



          normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value),



          storeAddressSelectionState.contextLocality,



          normalizeStoreAddressSuggestValue(settingsStoreAddress && settingsStoreAddress.value),



          preservedHouseValue



        );



        closeStoreAddressSuggestPopover("house");



        if (settingsStoreHouse) settingsStoreHouse.value = preservedHouseValue;



        syncStoreAddressInputAvailability();



      }



    }







    function applyStoreAddressSuggestion(stage, item) {



      if (!item) return;



      closeAllStoreAddressSuggestPopovers(stage);



      if (stage === "city") {



        const citySelection = cloneStoreAddressSelectionItem(item, "city");



        const cityValue = normalizeStoreAddressSuggestValue(citySelection && (citySelection.city_name || citySelection.value || citySelection.label));



        if (!settingsStoreCity || !cityValue || !citySelection) return;



        settingsStoreCity.value = cityValue;



        setStoreResolvedCity(citySelection);



        clearStoreAddressSelectionFromStage(isStoreAddressMapModeEnabled() ? "lookup" : "address");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("city");



        if (isStoreAddressMapModeEnabled() && settingsStoreAddressLookup) {



          settingsStoreAddressLookup.focus();



        } else if (settingsStoreAddress) {



          settingsStoreAddress.focus();



        }



        return;



      }







      if (stage === "lookup") {



        const selectionItem = cloneStoreAddressSelectionItem(item, "address");



        const itemType = getStoreAddressItemType(selectionItem);



        const cityValue = getStoreResolvedRootCityName()



          || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value)



          || normalizeStoreAddressSuggestValue(selectionItem && selectionItem.city_name);



        const effectiveContextLocality = normalizeStoreAddressSuggestValue(



          selectionItem && (selectionItem.context_locality || selectionItem.city_name || cityValue)



        );



        const localityInputValue = getStoreLocalityInputValueForSelection(selectionItem, cityValue);



        const streetValue = getStoreStreetInputValue(selectionItem);



        const houseValue = getStoreHouseInputValue(selectionItem);



        const fullAddress = buildStoreCombinedAddressValue(



          cityValue,



          effectiveContextLocality,



          streetValue,



          itemType === "address" ? houseValue : ""



        ) || normalizeStoreAddressSuggestValue(selectionItem && (selectionItem.full_address || selectionItem.value || selectionItem.label));



        const lookupValue = itemType === "street"



          ? [fullAddress, ""].join(", ").replace(/\s*,\s*$/, ", ")



          : fullAddress;



        if (!settingsStoreAddressLookup || !streetValue || !cityValue) return;



        if (settingsStoreCity) settingsStoreCity.value = cityValue;



        if (settingsStoreLocality) settingsStoreLocality.value = localityInputValue;



        settingsStoreAddressLookup.value = lookupValue || [streetValue, houseValue].filter(Boolean).join(", ");



        if (settingsStoreAddress) settingsStoreAddress.value = streetValue;



        if (settingsStoreHouse) settingsStoreHouse.value = itemType === "address" ? houseValue : "";



        setStoreResolvedCity({



          stage: "city",



          label: cityValue,



          value: cityValue,



          city_name: cityValue,



        });



        storeAddressSelectionState.street = streetValue;



        storeAddressSelectionState.house = itemType === "address" ? houseValue : "";



        storeAddressSelectionState.address = buildStoreCombinedAddressValue(



          cityValue,



          effectiveContextLocality,



          streetValue,



          itemType === "address" ? houseValue : ""



        );



        storeAddressSelectionState.selectedStreet = cloneStoreAddressSelectionItem({



          ...selectionItem,



          label: streetValue,



          value: streetValue,



          city_name: cityValue,



          context_locality: effectiveContextLocality,



          street_name: streetValue,



          house_number: "",



          object_type: "street",



        }, "address");



        storeAddressSelectionState.selectedAddress = itemType === "address"



          ? cloneStoreAddressSelectionItem({



            ...selectionItem,



            label: houseValue || streetValue,



            value: fullAddress || [streetValue, houseValue].filter(Boolean).join(", "),



            city_name: cityValue,



            context_locality: effectiveContextLocality,



            street_name: streetValue,



            house_number: houseValue,



            object_type: "address",



          }, "house")



          : null;



        storeAddressSelectionState.contextLocality = effectiveContextLocality || "";



        storeAddressSelectionState.sourceKey = selectionItem.source_key || "";



        storeAddressSelectionState.objectType = itemType === "address" ? "address" : "street";



        storeAddressSelectionState.typedHousePart = itemType === "address" ? houseValue : "";



        storeAddressSelectionState.manualOverride = false;



        syncStoreAddressMapFromSelection(selectionItem, itemType === "address" && houseValue ? "house" : "street");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("lookup");



        resolveStoreCitySelection({ silent: true }).catch(() => {});



        if (settingsStoreAddressLookup) {



          settingsStoreAddressLookup.focus();



          focusStoreAddressInputEnd("lookup");



        }



        return;



      }







      if (stage === "house") {



        const selectionItem = cloneStoreAddressSelectionItem(item, "house");



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        const streetValue = getStoreStreetInputValue(selectedStreet);



        const houseValue = getStoreHouseInputValue(selectionItem);



        if (!settingsStoreHouse || !selectedStreet || !streetValue || !houseValue) return;



        const cityValue = getStoreResolvedRootCityName()



          || normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value)



          || normalizeStoreAddressSuggestValue(selectionItem.city_name);



        const effectiveContextLocality = normalizeStoreAddressSuggestValue(



          selectionItem.context_locality || selectionItem.city_name || selectedStreet.context_locality || cityValue



        );



        const localityInputValue = getStoreLocalityInputValueForSelection(selectionItem, cityValue);



        const addressSelection = cloneStoreAddressSelectionItem({



          ...selectionItem,



          label: houseValue,



          value: houseValue,



          city_name: cityValue,



          context_locality: effectiveContextLocality,



          house_number: houseValue,



          street_name: streetValue,



        }, "house");



        if (settingsStoreCity && cityValue) settingsStoreCity.value = cityValue;



        if (settingsStoreLocality) settingsStoreLocality.value = localityInputValue;



        settingsStoreHouse.value = houseValue;



        storeAddressSelectionState.street = streetValue;



        storeAddressSelectionState.house = houseValue;



        storeAddressSelectionState.address = buildStoreCombinedAddressValue(



          cityValue,



          effectiveContextLocality,



          streetValue,



          houseValue



        );



        storeAddressSelectionState.selectedAddress = addressSelection;



        storeAddressSelectionState.contextLocality = effectiveContextLocality || "";



        storeAddressSelectionState.sourceKey = selectionItem.source_key || "";



        storeAddressSelectionState.objectType = "address";



        storeAddressSelectionState.typedHousePart = houseValue;



        storeAddressSelectionState.manualOverride = false;



        syncStoreAddressMapFromSelection(selectionItem, "house");



        syncStoreAddressInputAvailability();



        closeStoreAddressSuggestPopover("house");



        settingsStoreHouse.focus();



        focusStoreAddressInputEnd("house");



        return;



      }







      const selectionItem = cloneStoreAddressSelectionItem(item, "address");



      const streetValue = getStoreStreetInputValue(selectionItem);



      const cityValue = normalizeStoreAddressSuggestValue(selectionItem && selectionItem.city_name);



      const localityInputValue = getStoreLocalityInputValueForSelection(selectionItem);



      const effectiveContextLocality = localityInputValue || normalizeStoreAddressSuggestValue(selectionItem && selectionItem.context_locality);



      if (!settingsStoreAddress || !streetValue || !cityValue) return;



      if (settingsStoreCity) settingsStoreCity.value = cityValue;



      if (settingsStoreLocality) settingsStoreLocality.value = localityInputValue;



      settingsStoreAddress.value = streetValue;



      if (settingsStoreHouse) settingsStoreHouse.value = "";



      storeAddressSelectionState.street = streetValue;



      storeAddressSelectionState.house = "";



      storeAddressSelectionState.address = buildStoreCombinedAddressValue(cityValue, effectiveContextLocality, streetValue, "");



      storeAddressSelectionState.selectedStreet = cloneStoreAddressSelectionItem({



        ...selectionItem,



        label: streetValue,



        value: streetValue,



        street_name: streetValue,



        house_number: "",



        object_type: "street",



      }, "address");



      storeAddressSelectionState.selectedAddress = null;



      storeAddressSelectionState.contextLocality = effectiveContextLocality || "";



      storeAddressSelectionState.sourceKey = selectionItem.source_key || "";



      storeAddressSelectionState.objectType = "street";



      storeAddressSelectionState.typedHousePart = "";



      storeAddressSelectionState.manualOverride = false;



      syncStoreAddressMapFromSelection(selectionItem, "street");



      syncStoreAddressInputAvailability();



      closeStoreAddressSuggestPopover("address");



      resolveStoreCitySelection({ silent: true }).catch(() => {});



      if (settingsStoreHouse) {



        settingsStoreHouse.focus();



      } else {



        settingsStoreAddress.focus();



        focusStoreAddressInputEnd("address");



      }



    }







    async function searchStoreAddressSuggestions(stage, query, requestId) {



      const state = getStoreAddressStageState(stage);



      if (!state) return;



      const normalizedQuery = normalizeStoreAddressSuggestValue(query);



      if (!normalizedQuery && stage !== "city") {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (requestId !== state.requestSeq) return;



      const lookupContinuation = stage === "lookup"



        ? getStoreLookupStreetContinuationInfo(normalizedQuery)



        : null;



      const lookupHouseQuery = lookupContinuation && lookupContinuation.preserve



        ? normalizeStoreAddressHouseToken(lookupContinuation.housePart)



        : "";



      const lookupHouseMode = Boolean(



        stage === "lookup"



        && lookupContinuation



        && lookupContinuation.preserve



        && lookupHouseQuery



        && storeAddressSelectionState.selectedStreet



        && storeAddressSelectionState.selectedStreet.source_key



      );



      const apiStage = stage === "lookup"



        ? (lookupHouseQuery ? "house" : "address")



        : stage;



      const apiQuery = apiStage === "house" ? lookupHouseQuery : normalizedQuery;







      const localItems = stage === "lookup" || stage === "house"



        ? []



        : buildLocalStoreAddressSuggestions(stage, normalizedQuery);



      state.query = normalizedQuery;



      state.items = localItems.slice();



      state.activeIndex = localItems.length ? 0 : -1;



      state.open = true;



      state.mode = "loading";



      state.status = getStoreAddressSuggestStatusText(stage, "loading");



      renderStoreAddressSuggestPopover(stage);







      const params = new URLSearchParams({ stage: apiStage, q: apiQuery });



      if (stage === "lookup") {



        const resolvedCity = storeAddressSelectionState.resolvedCity;



        const cityValue = normalizeStoreAddressSuggestValue(resolvedCity && resolvedCity.city_name);



        if (!cityValue || !resolvedCity) {



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "empty"), "empty");



          return;



        }



        params.set("city", cityValue);



        if (



          lookupContinuation



          && lookupContinuation.preserve



          && storeAddressSelectionState.selectedStreet



          && storeAddressSelectionState.selectedStreet.source_key



        ) {



          params.set("selected_source_key", storeAddressSelectionState.selectedStreet.source_key);



        }



      } else if (stage === "house") {



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        const cityValue = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value)



          || normalizeStoreAddressSuggestValue(selectedStreet && selectedStreet.city_name);



        if (cityValue) {



          params.set("city", cityValue);



        }



      } else if (stage !== "city" && stage !== "lookup") {



        params.set("city", normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value));



        const resolvedCity = storeAddressSelectionState.resolvedCity;



        if (resolvedCity && resolvedCity.source_key) {



          params.set("city_source_key", resolvedCity.source_key);



        }



      }



      if (stage === "house") {



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        if (!selectedStreet || !selectedStreet.source_key) {



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "empty"), "empty");



          return;



        }



        params.set("selected_source_key", selectedStreet.source_key);



      }







      try {



        const res = await authFetch(`/api/admin/system/address-suggest-local?${params.toString()}`);



        const data = await res.json();



        if (requestId !== state.requestSeq) return;



        if (!data || !data.ok || !data.data) {



          if (localItems.length) {



            setStoreAddressSuggestItems(stage, localItems);



            setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



            return;



          }



          if (data && data.error === "LOCAL_ADDRESS_INDEX_NOT_READY") {



            setStoreAddressSuggestItems(stage, []);



            setStoreAddressSuggestStatus(stage, "\u041b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u0439 \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a \u0430\u0434\u0440\u0435\u0441\u043e\u0432 \u0435\u0449\u0451 \u043d\u0435 \u0437\u0430\u0433\u0440\u0443\u0436\u0435\u043d.", "error");



            return;



          }



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0430\u0434\u0440\u0435\u0441\u0430.", "error");



          return;



        }







        const remoteItems = Array.isArray(data.data.items) ? data.data.items.slice() : [];



        rememberStoreAddressSuggestItems(stage, remoteItems);



        const mergedItems = mergeStoreAddressSuggestItems(



          stage,



          normalizedQuery,



          remoteItems,



          localItems



        );



        const filteredItems = stage === "lookup"



          ? mergedItems.filter((item) => {



            const itemType = getStoreAddressItemType(item);



            if (lookupHouseMode) return itemType === "address";



            return itemType === "address" || itemType === "street";



          })



          : (stage === "house"



            ? mergedItems.filter((item) => getStoreAddressItemType(item) === "address")



            : mergedItems);



        if (!filteredItems.length) {



          if (stage === "lookup" && !lookupHouseMode && isStoreAddressHouseLikeQuery(normalizedQuery)) {



            const fallbackStreetQuery = removeStoreAddressHousePart(normalizedQuery);



            if (fallbackStreetQuery && fallbackStreetQuery !== normalizedQuery) {



              const fallbackParams = new URLSearchParams({ stage: "address", q: fallbackStreetQuery });



              const cityValue = normalizeStoreAddressSuggestValue(settingsStoreCity && settingsStoreCity.value);



              if (cityValue) fallbackParams.set("city", cityValue);



              const fallbackRes = await authFetch(`/api/admin/system/address-suggest-local?${fallbackParams.toString()}`);



              const fallbackData = await fallbackRes.json();



              if (requestId !== state.requestSeq) return;



              if (fallbackData && fallbackData.ok && fallbackData.data) {



                const fallbackItems = mergeStoreAddressSuggestItems(



                  stage,



                  fallbackStreetQuery,



                  Array.isArray(fallbackData.data.items) ? fallbackData.data.items.slice() : [],



                  []



                ).filter((item) => {



                  const itemType = getStoreAddressItemType(item);



                  return itemType === "address" || itemType === "street";



                });



                if (fallbackItems.length) {



                  setStoreAddressSuggestItems(stage, fallbackItems);



                  setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "ready", fallbackData.data.scope_label), "ready");



                  return;



                }



              }



            }



          }



          setStoreAddressSuggestItems(stage, []);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "empty"), "empty");



          return;



        }



        setStoreAddressSuggestItems(stage, filteredItems);



        if (remoteItems.length) {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "ready", data.data.scope_label), "ready");



        } else {



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



        }



      } catch (err) {



        if (requestId !== state.requestSeq) return;



        console.error("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0430\u0434\u0440\u0435\u0441\u0430 \u0444\u0438\u043b\u0438\u0430\u043b\u0430:", err);



        if (localItems.length) {



          setStoreAddressSuggestItems(stage, localItems);



          setStoreAddressSuggestStatus(stage, getStoreAddressSuggestStatusText(stage, "local"), "ready");



          return;



        }



        setStoreAddressSuggestItems(stage, []);



        setStoreAddressSuggestStatus(stage, "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u043f\u043e\u0434\u0441\u043a\u0430\u0437\u043a\u0438 \u0430\u0434\u0440\u0435\u0441\u0430.", "error");



      }



    }







    function scheduleStoreAddressSuggestions(stage) {



      const field = getStoreAddressFieldConfig(stage);



      const state = getStoreAddressStageState(stage);



      if (!field || !state || !field.input) return;



      const mapModeEnabled = isStoreAddressMapModeEnabled();



      if (!mapModeEnabled) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (



        stage === "lookup"



        && !(



          storeAddressSelectionState.resolvedCity



          && normalizeStoreAddressSuggestValue(storeAddressSelectionState.resolvedCity.city_name)



        )



      ) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (stage === "address") {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (stage === "house") {



        const selectedStreet = storeAddressSelectionState.selectedStreet;



        const streetMatchesSelection = Boolean(



          selectedStreet



          && normalizeStoreAddressValueKey(settingsStoreAddress && settingsStoreAddress.value) === normalizeStoreAddressValueKey(



            getStoreStreetInputValue(selectedStreet)



          )



        );



        if (!streetMatchesSelection || !selectedStreet || !selectedStreet.source_key) {



          closeStoreAddressSuggestPopover(stage);



          return;



        }



      }



      const normalizedValue = normalizeStoreAddressSuggestValue(field.input.value);



      clearStoreAddressSuggestDebounce(stage);



      state.requestSeq += 1;



      if (stage !== "city" && (!normalizedValue || normalizedValue.length < field.minQuery)) {



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      closeAllStoreAddressSuggestPopovers(stage);



      const requestId = state.requestSeq;



      state.debounceTimer = setTimeout(() => {



        state.debounceTimer = null;



        searchStoreAddressSuggestions(stage, normalizedValue, requestId);



      }, 280);



    }







    function handleStoreAddressStageInput(stage) {



      if (!isStoreAddressMapModeEnabled()) {



        if (stage === "city") clearStoreResolvedCitySelection();



        syncStoreAddressSelectionWithInput();



        closeStoreAddressSuggestPopover(stage);



        return;



      }



      if (stage === "city") {



        clearStoreAddressSelectionFromStage("city", { preserveCurrentInput: true });



        scheduleStoreAddressSuggestions(stage);



      } else if (stage === "lookup") {



        const lookupValue = normalizeStoreAddressSuggestValue(settingsStoreAddressLookup && settingsStoreAddressLookup.value);



        const continuation = getStoreLookupStreetContinuationInfo(lookupValue);



        if (continuation.preserve) {



          storeAddressSelectionState.selectedAddress = null;



          storeAddressSelectionState.house = "";



          storeAddressSelectionState.address = lookupValue;



          storeAddressSelectionState.typedHousePart = continuation.housePart || "";



          storeAddressSelectionState.sourceKey = storeAddressSelectionState.selectedStreet



            ? (storeAddressSelectionState.selectedStreet.source_key || "")



            : "";



          storeAddressSelectionState.objectType = storeAddressSelectionState.selectedStreet ? "street" : "";



          storeAddressSelectionState.manualOverride = false;



          if (settingsStoreHouse) settingsStoreHouse.value = "";



        } else {



          clearStoreAddressSelectionFromStage("lookup", { preserveCurrentInput: true });



        }



        scheduleStoreAddressSuggestions(stage);



      } else if (stage === "address") {



        clearStoreAddressSelectionFromStage("address", { preserveCurrentInput: true });



        syncStoreAddressSelectionWithInput();



        closeStoreAddressSuggestPopover(stage);



      } else {



        clearStoreAddressSelectionFromStage("house", { preserveCurrentInput: true });



        syncStoreAddressSelectionWithInput();



        scheduleStoreAddressSuggestions(stage);



      }



    }







    function hydrateStoreAddressForm(store) {



      const cityName = normalizeStoreAddressSuggestValue(store && store.city);



      const mapModeEnabled = isStoreAddressMapModeEnabled();



      const derivedAddress = deriveStoreAddressFormParts(store);



      if (settingsStoreCity) settingsStoreCity.value = cityName;



      if (settingsStoreAddressLookup) settingsStoreAddressLookup.value = derivedAddress.combined || "";



      if (settingsStoreLocality) settingsStoreLocality.value = getStoreLocalityInputValueForSelection({



        city_name: cityName,



        context_locality: derivedAddress.contextLocality || cityName,



      });



      if (settingsStoreAddress) settingsStoreAddress.value = derivedAddress.street;



      if (settingsStoreHouse) settingsStoreHouse.value = derivedAddress.house;



      if (settingsStoreFloor) settingsStoreFloor.value = normalizeValue(store && store.floor);



      if (settingsStoreApartment) settingsStoreApartment.value = normalizeValue(store && store.apartment);



      if (settingsStoreCabinet) settingsStoreCabinet.value = normalizeValue(store && store.cabinet);



      if (settingsStoreAddressComment) settingsStoreAddressComment.value = normalizeValue(store && store.address_comment);



      clearStoreResolvedAddressSelection();



      if (!mapModeEnabled || isStoreAllowedRootCityName(cityName)) {



        setStoreResolvedCity(createStoreAddressCityItem(cityName));



      } else {



        clearStoreResolvedCitySelection();



      }



      storeAddressSelectionState.street = derivedAddress.street;



      storeAddressSelectionState.house = derivedAddress.house;



      storeAddressSelectionState.address = derivedAddress.combined;



      storeAddressSelectionState.contextLocality = derivedAddress.contextLocality || "";



      storeAddressSelectionState.manualOverride = false;



      if (derivedAddress.street) {



        storeAddressSelectionState.selectedStreet = cloneStoreAddressSelectionItem({



          label: derivedAddress.street,



          value: derivedAddress.street,



          source_key: normalizeStoreAddressSuggestValue(store && store.address_ref),



          street_name: derivedAddress.street,



          city_name: cityName,



          context_locality: derivedAddress.contextLocality || cityName,



          object_type: "street",



          lat: store && store.lat,



          lng: store && store.lng,



        }, "address");



        storeAddressSelectionState.objectType = derivedAddress.house ? "address" : "street";



      }



      if (derivedAddress.house) {



        storeAddressSelectionState.selectedAddress = cloneStoreAddressSelectionItem({



          label: derivedAddress.house,



          value: derivedAddress.house,



          source_key: normalizeStoreAddressSuggestValue(store && store.address_ref),



          street_name: derivedAddress.street,



          house_number: derivedAddress.house,



          city_name: cityName,



          context_locality: derivedAddress.contextLocality || cityName,



          object_type: "address",



          lat: store && store.lat,



          lng: store && store.lng,



        }, "house");



        storeAddressSelectionState.typedHousePart = derivedAddress.house;



      }



      clearStoreAddressMapState({ clearFallback: true });



      if (derivedAddress.house && hasStoreAddressMapPoint(store && store.lat, store && store.lng)) {



        setStoreAddressMapFallback(store && store.lat, store && store.lng, { source: "house", forcePending: true });



      } else if (derivedAddress.street && hasStoreAddressMapPoint(store && store.lat, store && store.lng)) {



        setStoreAddressMapFallback(store && store.lat, store && store.lng, { source: "street", forcePending: true });



      } else {



        syncStoreAddressMapBasePoint({ forcePending: true });



      }



      applyStoreAddressModeUi();



      syncStoreAddressInputAvailability();



      resolveStoreCitySelection({ silent: true }).catch(() => {});



    }







    function getStoreAddressFormPayload() {



      const mapModeEnabled = isStoreAddressMapModeEnabled();



      const city = trimOrNull(settingsStoreCity && settingsStoreCity.value);



      const contextLocality = trimOrNull(settingsStoreLocality && settingsStoreLocality.value);



      const street = trimOrNull(settingsStoreAddress && settingsStoreAddress.value);



      const house = trimOrNull(settingsStoreHouse && settingsStoreHouse.value);



      const exactBindingAllowed = mapModeEnabled && !storeAddressSelectionState.manualOverride;



      return {



        city,



        address_context_locality: contextLocality,



        address_street: street,



        address_house: house,



        address: buildStoreCombinedAddressValue(city, contextLocality, street, house) || null,



        resolved_city_source_key: exactBindingAllowed && storeAddressSelectionState.resolvedCity && storeAddressSelectionState.resolvedCity.source_key



          ? storeAddressSelectionState.resolvedCity.source_key



          : null,



        selected_source_key: exactBindingAllowed && storeAddressSelectionState.selectedAddress



          ? (storeAddressSelectionState.selectedAddress.source_key || null)



          : (exactBindingAllowed && storeAddressSelectionState.selectedStreet && storeAddressSelectionState.selectedStreet.source_key



            ? storeAddressSelectionState.selectedStreet.source_key



            : null),



        selected_object_type: exactBindingAllowed && storeAddressSelectionState.selectedAddress



          ? "address"



          : (exactBindingAllowed && storeAddressSelectionState.selectedStreet ? "street" : null),



        selected_context_locality: mapModeEnabled ? contextLocality : null,



        typed_house_part: mapModeEnabled ? (house || null) : null,



        floor: trimOrNull(settingsStoreFloor && settingsStoreFloor.value),



        apartment: trimOrNull(settingsStoreApartment && settingsStoreApartment.value),



        cabinet: trimOrNull(settingsStoreCabinet && settingsStoreCabinet.value),



        address_comment: trimOrNull(settingsStoreAddressComment && settingsStoreAddressComment.value),



      };



    }







    bindStoreAddressField("city");



    bindStoreAddressField("lookup");



    bindStoreAddressField("address");



    bindStoreAddressField("house");



    if (settingsStoreLocality) {



      settingsStoreLocality.addEventListener("input", () => {



        if (storeAddressSelectionState.selectedStreet || storeAddressSelectionState.selectedAddress) {



          storeAddressSelectionState.manualOverride = true;



        }



        syncStoreAddressSelectionWithInput();



        closeStoreAddressSuggestPopover("house");



      });



    }







    function getStoreSaveErrorMessage(errorCode, fallbackMessage) {



      switch (String(errorCode || "").trim()) {



        case "CODE_TAKEN":



          return "Код уже используется. Введите другой.";



        case "NAME_REQUIRED":



          return "Название филиала обязательно.";



        case "ADDRESS_REQUIRED":



          return "Введите полный адрес филиала.";



        case "GEOCODER_NOT_CONFIGURED":



          return "Настройте геокодер РІ разделе «Системные -> Карта».";



        case "ADDRESS_NOT_FOUND":



          return "Не удалось найти адрес. Уточните адрес филиала.";



        case "ADDRESS_CITY_NOT_FOUND":



          return "Не удалось определить город по адресу. Уточните адрес филиала.";



        case "ADDRESS_COORDINATES_NOT_FOUND":



          return "Не удалось определить координаты по адресу. Уточните адрес филиала.";



        case "GEOCODER_UPSTREAM_ERROR":



          return "Сервис геокодирования временно недоступен. Попробуйте позже.";



        case "ADDRESS_SELECTION_REQUIRED":



          return "Найдено несколько похожих адресов. Выберите точный вариант из подсказок.";



        case "ADDRESS_SERVICE_NOT_CONFIGURED":



        case "ADDRESS_SERVICE_UNAVAILABLE":



        case "ADDRESS_SERVICE_TIMEOUT":



          return "Адресный сервис временно недоступен. Попробуйте позже.";



        case "INVALID_LAT":



          return "Широта должна быть РІ диапазоне от -90 до 90.";



        case "INVALID_LNG":



          return "Долгота должна быть РІ диапазоне от -180 до 180.";



        default:



          return fallbackMessage;



      }



    }







    async function submitStoreSaveWithNormalization(payload, tabData) {



      const submitStorePayload = async (nextPayload) => {



        if (tabData && tabData.mode === "create") {



          return createStore(nextPayload);



        }



        const id = tabData ? tabData.storeId : storesState.selectedId;



        if (!id) return null;



        return updateStore(id, nextPayload);



      };







      let data = await submitStorePayload(payload);



      if (data && data.ok === false && data.error === "ADDRESS_CONFIRMATION_REQUIRED" && data.normalization) {



        const previewCity = String(data.normalization.city || "").trim();



        const previewAddress = String(data.normalization.address || "").trim();



        const previewText = [previewCity, previewAddress].filter(Boolean).join(", ");



        const confirmed = window.confirm(



          `Адрес будет сохранён РІ нормализованном виде:\n\n${previewText}\n\nПродолжить сохранение?`



        );



        if (!confirmed) {



          return true;



        }



        data = await submitStorePayload({



          ...payload,



          city: previewCity || payload.city,



          address: previewAddress || payload.address,



          address_street: data.normalization.address_street || payload.address_street,



          address_house: data.normalization.address_house || payload.address_house,



          resolved_city_source_key: data.normalization.resolved_city_source_key || payload.resolved_city_source_key,



          selected_source_key: data.normalization.selected_source_key || payload.selected_source_key,



          selected_object_type: data.normalization.selected_object_type || payload.selected_object_type,



          selected_context_locality: data.normalization.selected_context_locality || payload.selected_context_locality,



          typed_house_part: data.normalization.typed_house_part || payload.typed_house_part,



          confirm_normalized: 1,



        });



      }







      if (!data || !data.ok || !data.store) {



        const fallbackMessage = tabData && tabData.mode === "create"



          ? "Не удалось создать филиал."



          : "Не удалось обновить филиал.";



        if (data && (data.error === "CITY_REQUIRED" || data.error === "CITY_SELECTION_REQUIRED")) {



          if (settingsStoreCity) settingsStoreCity.focus();



        }



        if (data && data.error === "ADDRESS_REQUIRED") {



          if (isStoreAddressMapModeEnabled() && settingsStoreAddressLookup) {



            settingsStoreAddressLookup.focus();



          } else if (settingsStoreAddress) {



            settingsStoreAddress.focus();



          }



        }



        if (data && data.error === "HOUSE_REQUIRED") {



          if (settingsStoreHouse) settingsStoreHouse.focus();



        }



        if (data && data.error === "CITY_SELECTION_REQUIRED") {



          alert("Выберите город из подсказок локального справочника.");



          return true;



        }



        if (data && data.error === "HOUSE_REQUIRED") {



          alert("После выбора улицы укажите номер дома.");



          return true;



        }



        alert(getStoreSaveErrorMessage(data && data.error, fallbackMessage));



        return true;



      }







      mergeStoreInState(data.store);



      if (tabData && tabData.mode === "create") {



        tabData.mode = "edit";



        tabData.storeId = data.store.id;



        tabData.snapshot = { ...data.store };



        storeTabs.set(activeRightTabId, tabData);



        ensureTab(activeRightTabId, data.store.name || "Филиал");



      } else if (tabData) {



        tabData.snapshot = { ...data.store };



        storeTabs.set(activeRightTabId, tabData);



        ensureTab(activeRightTabId, data.store.name || "Филиал");



      }



      selectStore(data.store);



      return true;



    }







    if (settingsAddOrderBtn) {



      settingsAddOrderBtn.addEventListener("click", () => {



        const section = document.body.getAttribute("data-settings-section");



        if (section !== "stores") return;



        startCreateStore();



      });



    }







    if (settingsStoreSaveBtn) {



      settingsStoreSaveBtn.addEventListener("click", async () => {



        const mapModeEnabled = isStoreAddressMapModeEnabled();



        const addressData = getStoreAddressFormPayload();



        const payload = {



          name: trimOrNull(settingsStoreName?.value),



          code: trimOrNull(settingsStoreCode?.value),



          city: addressData.city,



          address: addressData.address,



          address_context_locality: addressData.address_context_locality,



          address_street: addressData.address_street,



          address_house: addressData.address_house,



          resolved_city_source_key: addressData.resolved_city_source_key,



          selected_source_key: addressData.selected_source_key,



          selected_object_type: addressData.selected_object_type,



          selected_context_locality: addressData.selected_context_locality,



          typed_house_part: addressData.typed_house_part,



          floor: addressData.floor,



          apartment: addressData.apartment,



          cabinet: addressData.cabinet,



          address_comment: addressData.address_comment,



          phone: trimOrNull(settingsStorePhone?.value),



          timezone: settingsStoreTimezoneSelect ? settingsStoreTimezoneSelect.value : null,



          is_active: settingsStoreActive && settingsStoreActive.checked ? 1 : 0



        };



        if (mapModeEnabled) {



          const displayPoint = getStoreAddressMapDisplayPoint();



          if (displayPoint) {



            payload.lat = normalizeStoreMapCoordinate(displayPoint.lat);



            payload.lng = normalizeStoreMapCoordinate(displayPoint.lng);



          }



        } else if (hasStoreAddressMapPoint(storeAddressMapState.customLat, storeAddressMapState.customLng)) {



          payload.lat = normalizeStoreMapCoordinate(storeAddressMapState.customLat);



          payload.lng = normalizeStoreMapCoordinate(storeAddressMapState.customLng);



        }



        payload.use_global_hours = storeHoursState.useGlobal ? 1 : 0;



        payload.hours = buildStoreHoursPayload();



        payload.use_delivery_hours = deliveryHoursState.useGlobal ? 1 : 0;



        payload.delivery_hours = buildDeliveryHoursPayload();







        if (!payload.name) {



          alert("Введите название филиала.");



          return;



        }



        if (!payload.city) {



          alert("Введите город филиала.");



          if (settingsStoreCity) settingsStoreCity.focus();



          return;



        }



        if (!payload.address) {



          alert(mapModeEnabled ? "Введите адрес филиала и выберите вариант из подсказок." : "Введите адрес филиала.");



          if (mapModeEnabled && settingsStoreAddressLookup) {



            settingsStoreAddressLookup.focus();



          } else if (settingsStoreAddress) {



            settingsStoreAddress.focus();



          }



          return;



        }







        if (mapModeEnabled) {



          const resolvedCity = await resolveStoreCitySelection({ silent: true });



          payload.city = trimOrNull(settingsStoreCity && settingsStoreCity.value);



          payload.resolved_city_source_key = resolvedCity && resolvedCity.source_key ? resolvedCity.source_key : null;



          if (



            storeAddressSelectionState.selectedStreet &&



            !storeAddressSelectionState.selectedAddress &&



            !payload.address_house



          ) {



            alert("После выбора улицы укажите номер дома.");



            if (settingsStoreHouse) settingsStoreHouse.focus();



            return;



          }



        }







        let data = null;



        const tabData = storeTabs.get(activeRightTabId);



        await submitStoreSaveWithNormalization(payload, tabData);



        return;



        if (tabData && tabData.mode === "create") {



          data = await createStore(payload);



          if (!data || !data.ok || !data.store) {



            alert(getStoreSaveErrorMessage(data && data.error, "Не удалось создать филиал."));



            return;



          }



        } else {



          const id = tabData ? tabData.storeId : storesState.selectedId;



          if (!id) return;



          data = await updateStore(id, payload);



          if (!data || !data.ok || !data.store) {



            alert(getStoreSaveErrorMessage(data && data.error, "Не удалось обновить филиал."));



            return;



          }



        }







        mergeStoreInState(data.store);



        if (tabData && tabData.mode === "create") {



          tabData.mode = "edit";



          tabData.storeId = data.store.id;



          tabData.snapshot = { ...data.store };



          storeTabs.set(activeRightTabId, tabData);



          ensureTab(activeRightTabId, data.store.name || "Филиал");



        } else if (tabData) {



          tabData.snapshot = { ...data.store };



          storeTabs.set(activeRightTabId, tabData);



          ensureTab(activeRightTabId, data.store.name || "Филиал");



        }



        selectStore(data.store);



      });



    }







    if (settingsSystemMapStoreAddressEnabled) {



      settingsSystemMapStoreAddressEnabled.addEventListener("change", () => {



        if (!systemMapDraftMode) return;



        systemMapDraft = normalizeSystemMapConfig({



          ...readSystemMapFormValues(),



          max_zoom: String((settingsSystemMapMaxZoom && settingsSystemMapMaxZoom.value) || "").trim(),



          geocoder_result_limit: String((settingsSystemMapGeocoderResultLimit && settingsSystemMapGeocoderResultLimit.value) || "").trim(),



        });



        applyStoreAddressModeUi();



        syncStoreAddressInputAvailability();



      });



    }







    if (settingsStoreTimezoneSelect) {



      settingsStoreTimezoneSelect.addEventListener("change", () => {



        renderStoreTimezoneSelector();



      });



    }







    if (settingsStoreTimezoneTrigger) {



      settingsStoreTimezoneTrigger.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        toggleStoreTimezoneDropdown();



      });



    }







    if (settingsStoreTimezoneMenu) {



      settingsStoreTimezoneMenu.addEventListener("click", (event) => {



        const option = event.target && event.target.closest



          ? event.target.closest("[data-store-timezone-option]")



          : null;



        if (!option || !settingsStoreTimezoneSelect) return;



        event.preventDefault();



        event.stopPropagation();



        settingsStoreTimezoneSelect.value = String(option.getAttribute("data-store-timezone-option") || "");



        settingsStoreTimezoneSelect.dispatchEvent(new Event("change", { bubbles: true }));



        closeStoreTimezoneDropdown();



      });



    }







    if (settingsStoreAddressMapBtn) {



      settingsStoreAddressMapBtn.addEventListener("click", () => {



        closeAllStoreAddressSuggestPopovers();



        closeStoreTimezoneDropdown();



        openStoreAddressMapDialog();



      });



    }







    if (settingsStoreAddressMapCloseBtn) {



      settingsStoreAddressMapCloseBtn.addEventListener("click", () => {



        closeStoreAddressMapDialog();



      });



    }







    if (settingsStoreAddressMapApplyBtn) {



      settingsStoreAddressMapApplyBtn.addEventListener("click", () => {



        applyStoreAddressMapSelection();



      });



    }







    if (settingsStoreAddressMapResetBtn) {



      settingsStoreAddressMapResetBtn.addEventListener("click", () => {



        clearStoreAddressMapState({ clearFallback: false });



        closeStoreAddressMapDialog();



      });



    }







    if (settingsStoreAddressMapModal) {



      settingsStoreAddressMapModal.addEventListener("click", (event) => {



        if (event.target === settingsStoreAddressMapModal) {



          closeStoreAddressMapDialog();



        }



      });



    }







    document.addEventListener("keydown", (event) => {



      if (event.key === "Escape" && storeAddressMapState.open) {



        closeStoreAddressMapDialog();



      }



    });







    if (settingsStoreResetBtn) {



      settingsStoreResetBtn.addEventListener("click", () => {



        const tabData = storeTabs.get(activeRightTabId);



        if (tabData && tabData.mode === "create") {



          setStoreMode("create");



          return;



        }



        if (!storesState.snapshot) return;



        fillStoreForm(storesState.snapshot);



      });



    }







    if (settingsStoreHoursSwitch) {



      settingsStoreHoursSwitch.addEventListener("change", () => {



        setStoreHoursUseGlobal(settingsStoreHoursSwitch.checked);



      });



    }



    if (settingsStoreDeliveryHoursSwitch) {



      settingsStoreDeliveryHoursSwitch.addEventListener("change", () => {



        setDeliveryHoursUseGlobal(settingsStoreDeliveryHoursSwitch.checked);



      });



    }







    resetStoreHoursState();



    resetDeliveryHoursState();



    const initialSectionBtn = document.querySelector("[data-settings-section].is-active");



    if (initialSectionBtn) {



      initialSectionBtn.click();



    }







    const settingsListsState = {



      "order-statuses": { loaded: false, items: [] },



      "order-payments": { loaded: false, items: [] },



      "order-delivery": { loaded: false, items: [] },



      "order-time-options": { loaded: false, items: [] }



    };







    const settingsListsConfig = {



      "order-statuses": {



        endpoint: "/api/admin/tenant/order-statuses",



        reorderEndpoint: "/api/admin/tenant/order-statuses/reorder",



        updateEndpoint: "/api/admin/tenant/order-statuses/",



        hasFinal: true,



        iconLabel: "Иконка статуса"



      },



      "order-payments": {



        endpoint: "/api/admin/tenant/order-payments",



        reorderEndpoint: "/api/admin/tenant/order-payments/reorder",



        updateEndpoint: "/api/admin/tenant/order-payments/",



        hasFinal: false,



        iconLabel: "Иконка оплаты"



      },



    "order-delivery": {



      endpoint: "/api/admin/tenant/order-delivery-types",



      reorderEndpoint: "/api/admin/tenant/order-delivery-types/reorder",



      updateEndpoint: "/api/admin/tenant/order-delivery-types/",



      hasFinal: false,



      iconLabel: "Иконка получения",



      defaultField: "is_default"



    },



    "order-time-options": {



      endpoint: "/api/admin/tenant/order-time-options",



      reorderEndpoint: "/api/admin/tenant/order-time-options/reorder",



      updateEndpoint: "/api/admin/tenant/order-time-options/",



      hasFinal: false,



      hasTimeWindowSettings: true,



      iconLabel: "Иконка интервала",



      defaultIcons: {



        asap: "fas fa-bolt",



        at_time: "fas fa-clock",



        on_date: "fas fa-calendar-day"



      }



    }



  };







    function syncOrderStockDeductStatusVisibility() {



      if (!settingsOrderStockDeductStatusField) return;



      const mode = settingsOrderStockDeductMode ? settingsOrderStockDeductMode.value : "on_create";



      const isOnStatus = mode === "on_status";



      settingsOrderStockDeductStatusField.classList.toggle("hidden", !isOnStatus);



      if (settingsOrderStockDeductStatus) {



        settingsOrderStockDeductStatus.disabled = !isOnStatus || settingsOrderStockDeductStatus.options.length === 0;



      }



    }







    function renderOrderStockDeductStatusOptions(preferredId = null) {



      if (!settingsOrderStockDeductStatus) return;



      const statusState = settingsListsState["order-statuses"];



      const statuses = Array.isArray(statusState?.items)



        ? statusState.items.filter((item) => Number(item.is_active) === 1)



        : [];



      const pendingValue = Number(settingsOrderStockDeductStatus.dataset.pendingValue || 0);



      const currentValue = Number(settingsOrderStockDeductStatus.value || 0);



      const targetId = Number(preferredId || pendingValue || currentValue || tenantStockDeductStatusId || 0);







      settingsOrderStockDeductStatus.innerHTML = "";



      if (!statuses.length) {



        const emptyOpt = document.createElement("option");



        emptyOpt.value = "";



        emptyOpt.textContent = "Нет активных этапов";



        settingsOrderStockDeductStatus.appendChild(emptyOpt);



        settingsOrderStockDeductStatus.disabled = true;



        return;



      }







      statuses.forEach((item) => {



        const opt = document.createElement("option");



        opt.value = String(item.id);



        opt.textContent = item.title || `Этап #${item.id}`;



        settingsOrderStockDeductStatus.appendChild(opt);



      });







      const hasTarget = targetId > 0 && statuses.some((item) => Number(item.id) === targetId);



      const resolvedId = hasTarget ? targetId : Number(statuses[0].id);



      settingsOrderStockDeductStatus.value = String(resolvedId);



      settingsOrderStockDeductStatus.dataset.pendingValue = "";



    }







    function refreshOrderStockDeductControls(preferredId = null) {



      if (settingsOrderStockDeductMode && !settingsOrderStockDeductMode.value) {



        settingsOrderStockDeductMode.value = tenantStockDeductMode || "on_create";



      }



      renderOrderStockDeductStatusOptions(preferredId);



      syncOrderStockDeductStatusVisibility();



    }







    window.__refreshOrderStockDeductControls = refreshOrderStockDeductControls;











    function normalizeValue(value) {



      if (value === null || value === undefined) return "";



      return String(value);



    }







    function renderStoresList(items) {



      if (!storesList) return;



      storesList.innerHTML = "";



      if (!items.length) {



        if (storesEmpty) storesEmpty.classList.remove("hidden");



        return;



      }



      if (storesEmpty) storesEmpty.classList.add("hidden");







      items.forEach((store) => {



        const row = document.createElement("button");



        row.type = "button";



        row.className = "order-row settings-card settings-store-list-row";



        row.dataset.id = String(store.id);



        row.classList.toggle("is-selected", Number(storesState.selectedId) === Number(store.id));







        const avatar = document.createElement("div");



        avatar.className = "product-avatar";



        avatar.innerHTML = '<i class="fas fa-shop"></i>';







        const info = document.createElement("div");



        info.className = "order-col";







        const title = document.createElement("div");



        title.className = "product-title";



        title.textContent = store.name || `Точка #${store.id}`;







        info.appendChild(title);



        const status = Number(store.is_active) === 1 ? "активна" : "выключена";



        const statusEl = document.createElement("div");



        statusEl.className = "muted store-status";



        statusEl.textContent = status;



        info.appendChild(statusEl);







        row.appendChild(avatar);



        row.appendChild(info);







        row.addEventListener("click", () => selectStore(store));



        storesList.appendChild(row);



      });



    }







    function fillStoreForm(store) {



      if (!store) return;



      resetStoreAddressSuggestState();



      if (settingsStoreSubtitle) {



        settingsStoreSubtitle.textContent = "";



      }



      if (settingsStoreName) settingsStoreName.value = normalizeValue(store.name);



      if (settingsStoreCode) settingsStoreCode.value = normalizeValue(store.code);



      hydrateStoreAddressForm(store);



      if (settingsStorePhone) settingsStorePhone.value = normalizeValue(store.phone);







      const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;



      const fallbackTz = tenant?.timezone || "+0";



      const storeTz = store.timezone || fallbackTz;



      if (settingsStoreTimezoneSelect) {



        fillTimezoneSelect(storeTz, settingsStoreTimezoneSelect);



        renderStoreTimezoneSelector();



      }



      if (settingsStoreActive) settingsStoreActive.checked = Number(store.is_active) === 1;



      applyStoreHours(store);



      applyDeliveryHours(store);



      loadStoreTelegramBindings(store.id);

      loadStoreMaxBindings(store.id);



    }







    function showStorePanel(show) {



      if (settingsStorePanel) settingsStorePanel.classList.toggle("hidden", !show);



      if (!show) {



        closeStoreTimezoneDropdown();



        closeStoreAddressMapDialog();



        resetStoreAddressSuggestState({ clearInputs: true });



      }



    }







    function setStoreMode(mode, store) {



      storesState.mode = mode;



      if (settingsStoreSaveText) {



        settingsStoreSaveText.textContent = mode === "create" ? "Создать" : "Сохранить";



      }



      if (mode === "create") {



        resetStoreAddressSuggestState({ clearInputs: true });



        if (settingsStoreSubtitle) settingsStoreSubtitle.textContent = "";



        if (settingsStoreTelegramList) settingsStoreTelegramList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Сначала сохраните филиал</span></div></div>";



        if (settingsStoreTelegramConnectBlock) settingsStoreTelegramConnectBlock.classList.add("hidden");

        if (settingsStoreMaxList) settingsStoreMaxList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Сначала сохраните филиал</span></div></div>";

        if (settingsStoreMaxConnectBlock) settingsStoreMaxConnectBlock.classList.add("hidden");

        if (settingsStoreMaxApiKey) settingsStoreMaxApiKey.value = "";

        if (settingsStoreMaxSecretKey) settingsStoreMaxSecretKey.value = "";



        if (settingsStoreName) settingsStoreName.value = "";



        if (settingsStoreCode) settingsStoreCode.value = "";



        if (settingsStoreFloor) settingsStoreFloor.value = "";



        if (settingsStoreApartment) settingsStoreApartment.value = "";



        if (settingsStoreCabinet) settingsStoreCabinet.value = "";



        if (settingsStoreAddressComment) settingsStoreAddressComment.value = "";



        if (settingsStorePhone) settingsStorePhone.value = "";



        const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;



        const fallbackTz = tenant?.timezone || "+0";



        if (settingsStoreTimezoneSelect) {



          fillTimezoneSelect(fallbackTz, settingsStoreTimezoneSelect);



          renderStoreTimezoneSelector();



        }



        if (settingsStoreActive) settingsStoreActive.checked = true;



        resetStoreHoursState();



        resetDeliveryHoursState();



      } else if (store) {



        fillStoreForm(store);



      }



    }







    function renderStoreTimezoneSelector() {



      if (!settingsStoreTimezoneSelect) return;



      const options = Array.from(settingsStoreTimezoneSelect.options || []);



      const selectedValue = String(settingsStoreTimezoneSelect.value || "");



      const selectedOption = options.find((option) => String(option.value) === selectedValue) || null;







      if (settingsStoreTimezoneValue) {



        settingsStoreTimezoneValue.textContent = selectedOption ? selectedOption.textContent : "—";



      }



      if (settingsStoreTimezoneTrigger) {



        settingsStoreTimezoneTrigger.disabled = options.length === 0;



      }



      if (settingsStoreTimezoneSelector) {



        settingsStoreTimezoneSelector.classList.toggle("is-disabled", options.length === 0);



      }



      if (!settingsStoreTimezoneMenu) {



        if (!options.length) closeStoreTimezoneDropdown();



        return;



      }







      settingsStoreTimezoneMenu.innerHTML = "";



      options.forEach((option) => {



        const value = String(option.value || "");



        const item = document.createElement("button");



        item.type = "button";



        item.className = `new-order-right-select-option${value === selectedValue ? " is-selected" : ""}`;



        item.setAttribute("role", "option");



        item.setAttribute("aria-selected", value === selectedValue ? "true" : "false");



        item.setAttribute("data-store-timezone-option", value);



        item.textContent = option.textContent || value;



        settingsStoreTimezoneMenu.appendChild(item);



      });







      if (!options.length) {



        closeStoreTimezoneDropdown();



      }



    }







    function closeStoreTimezoneDropdown() {



      const timezoneField = settingsStoreTimezoneSelector && settingsStoreTimezoneSelector.closest



        ? settingsStoreTimezoneSelector.closest(".settings-store-timezone-field")



        : null;



      if (timezoneField) {



        timezoneField.classList.remove("is-open");



      }



      if (settingsStoreTimezoneSelector) {



        settingsStoreTimezoneSelector.classList.remove("is-open", "is-drop-up");



      }



      if (settingsStoreTimezoneTrigger) {



        settingsStoreTimezoneTrigger.setAttribute("aria-expanded", "false");



      }



    }







    function openStoreTimezoneDropdown() {



      if (!settingsStoreTimezoneSelector || !settingsStoreTimezoneTrigger || settingsStoreTimezoneTrigger.disabled) return;



      const timezoneField = settingsStoreTimezoneSelector.closest



        ? settingsStoreTimezoneSelector.closest(".settings-store-timezone-field")



        : null;



      const menuHeight = settingsStoreTimezoneMenu



        ? Math.min(settingsStoreTimezoneMenu.scrollHeight || 0, 230)



        : 0;



      const triggerRect = settingsStoreTimezoneTrigger.getBoundingClientRect();



      const shouldDropUp = menuHeight > 0



        && triggerRect.bottom + 8 + menuHeight > window.innerHeight - 12



        && triggerRect.top > menuHeight + 20;



      if (timezoneField) {



        timezoneField.classList.add("is-open");



      }



      settingsStoreTimezoneSelector.classList.toggle("is-drop-up", shouldDropUp);



      settingsStoreTimezoneSelector.classList.add("is-open");



      settingsStoreTimezoneTrigger.setAttribute("aria-expanded", "true");



    }







    function toggleStoreTimezoneDropdown(forceOpen) {



      if (!settingsStoreTimezoneSelector || !settingsStoreTimezoneTrigger || settingsStoreTimezoneTrigger.disabled) return;



      const shouldOpen = typeof forceOpen === "boolean"



        ? forceOpen



        : !settingsStoreTimezoneSelector.classList.contains("is-open");



      if (!shouldOpen) {



        closeStoreTimezoneDropdown();



        return;



      }



      closeAllStoreAddressSuggestPopovers();



      openStoreTimezoneDropdown();



    }







    function applyStoreTabState(tabId) {



      const data = storeTabs.get(tabId);



      if (!data) return;



      if (data.mode === "create") {



        storesState.selectedId = null;



        storesState.snapshot = null;



        setStoreMode("create");



        renderStoresList(storesState.items);



        showStorePanel(true);



        return;



      }







      const storeId = data.storeId;



      const store = storesState.items.find((s) => s.id === storeId) || data.snapshot;



      if (store) {



        storesState.selectedId = store.id;



        storesState.snapshot = { ...store };



        setStoreMode("edit", store);



      }



      renderStoresList(storesState.items);



      showStorePanel(true);



    }







    function openStoreTab(tabId, title) {



      ensureTab(tabId, title || "Филиал");



      if (rightHeader) rightHeader.classList.remove("hidden");



      if (rightTabs) rightTabs.classList.remove("hidden");



      setActiveRightTab(tabId);



    }







    function selectStore(store) {



      if (!store) return;



      const existingTabId = getStoreTabIdByStoreId(store.id);



      const tabId = existingTabId || `store-${store.id}`;



      if (!existingTabId) {



        storeTabs.set(tabId, { mode: "edit", storeId: store.id, snapshot: { ...store } });



      } else {



        storeTabs.set(tabId, { mode: "edit", storeId: store.id, snapshot: { ...store } });



      }



      openStoreTab(tabId, store.name || "Филиал");



      if (rightDefault) rightDefault.classList.add("hidden");



    }







    async function loadStores() {



      await syncStoreAddressModeFromTenantConfig();



      const data = await fetchStores();



      if (!data || !data.ok) return;



      const items = Array.isArray(data.stores) ? data.stores : [];



      storesState.loaded = true;



      storesState.items = items;



      rebuildStoreAddressSuggestCache();



      resetStoreAddressSuggestState();



      syncDeliveryMapStoresState();



      if (settingsCenterSubtitle) {



        const section = document.body.getAttribute("data-settings-section");



        if (section === "stores") {



          const count = items.length;



          settingsCenterSubtitle.textContent = count ? `Всего точек: ${count}` : "Точек пока нет";



        }



      }



      renderStoresList(items);



      const activeDeliveryTab = getActiveDeliveryTab();



      if (isDeliveryZoneTab(activeDeliveryTab)) {



        renderDeliveryZoneStoresCheckboxes(activeDeliveryTab.draft && activeDeliveryTab.draft.store_ids);



      }



      if (activeRightTabId && activeRightTabId.startsWith("store-")) {



        applyStoreTabState(activeRightTabId);



      } else if (!storesState.selectedId) {



        showStorePanel(false);



      } else {



        const current = items.find((s) => s.id === storesState.selectedId);



        if (current) {



          selectStore(current);



        } else {



          storesState.selectedId = null;



          showStorePanel(false);



        }



      }



    }







    function populatePrintApiStores(items) {



      if (!settingsPrintApiStore) return;



      settingsPrintApiStore.innerHTML = "";



      const list = Array.isArray(items) ? items : [];



      list.forEach((store) => {



        const opt = document.createElement("option");



        opt.value = String(store.id);



        opt.textContent = store.name ? `${store.name} (#${store.id})` : `Филиал #${store.id}`;



        settingsPrintApiStore.appendChild(opt);



      });



      if (list.length) {



        const preferred = storesState.selectedId || activeStoreId || list[0].id;



        settingsPrintApiStore.value = String(preferred);



      }



    }







    function setPrintApiDeviceState(statusText, printerText) {



      if (settingsPrintApiPrinterStatus) settingsPrintApiPrinterStatus.value = String(statusText || "");



      if (settingsPrintApiPrinterName) settingsPrintApiPrinterName.value = String(printerText || "");



    }







    function resetPrintApiDeviceState(options = {}) {



      const statusText = options.statusText || "Нажмите \"Проверить подключение\"";



      const printerText = options.printerText || "Статус не проверен";



      setPrintApiDeviceState(statusText, printerText);



    }







    function applyPrintApiDeviceState(info) {



      if (!info) {



        resetPrintApiDeviceState();



        return;



      }



      const printerOnline = Number(info.printer_online || 0) === 1;



      const agentOnline = Number(



        info.agent_online ?? info.connection_online ?? info.agent_running ?? 0



      ) === 1;



      const printerName = info.printer_name ? String(info.printer_name) : "";



      const agentName = info.agent_name ? String(info.agent_name) : "";



      const agentVersion = info.agent_version ? String(info.agent_version) : "";



      const connectionEstablished = agentOnline;



      const statusText = connectionEstablished ? "Соединение установлено" : "Соединение разорвано";



      const printerText = printerOnline ? (printerName || "Не определен") : "Нет подключенных принтеров";



      setPrintApiDeviceState(statusText, printerText);



    }







    function stopPrintApiAutoRefresh() {



      if (printApiRefreshTimer) {



        clearTimeout(printApiRefreshTimer);



        printApiRefreshTimer = null;



      }



    }







    function schedulePrintApiAutoRefresh() {



      stopPrintApiAutoRefresh();



      if (activeRightTabId !== "print-api") return;



      const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



      if (!storeId) return;



      printApiRefreshTimer = setTimeout(async () => {



        if (printApiConnectionCheckInFlight) {



          schedulePrintApiAutoRefresh();



          return;



        }



        try {



          printApiConnectionCheckInFlight = true;



          await checkPrintApiConnection(storeId, { silent: true });



        } finally {



          printApiConnectionCheckInFlight = false;



          schedulePrintApiAutoRefresh();



        }



      }, printApiAutoRefreshDelayMs);



    }







    function applyPrintApiNotificationSettings(info) {



      const safe = info && typeof info === "object" ? info : {};



      const applySoundFieldUi = (urlValue, labelEl, playBtn) => {



        const url = String(urlValue || "").trim();



        if (labelEl) {



          labelEl.textContent = url ? "Файл загружен" : "Файл не выбран";



        }



        if (playBtn) {



          playBtn.classList.toggle("hidden", !url);



        }



      };



      if (settingsPrintApiNotifyNewOrder) {



        settingsPrintApiNotifyNewOrder.checked = Number(safe.notify_new_order_enabled ?? 1) === 1;



      }



      if (settingsPrintApiNotifyNewMessage) {



        settingsPrintApiNotifyNewMessage.checked = Number(safe.notify_new_message_enabled ?? 1) === 1;



      }



      if (settingsPrintApiOrderSoundUrl) {



        settingsPrintApiOrderSoundUrl.value = String(safe.sound_new_order_url || "");



      }



      if (settingsPrintApiMessageSoundUrl) {



        settingsPrintApiMessageSoundUrl.value = String(safe.sound_new_message_url || "");



      }



      applySoundFieldUi(



        settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "",



        settingsPrintApiOrderSoundLabel,



        settingsPrintApiOrderSoundPlayBtn



      );



      applySoundFieldUi(



        settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : "",



        settingsPrintApiMessageSoundLabel,



        settingsPrintApiMessageSoundPlayBtn



      );



    }







    function refreshPrintApiSoundUiFromInputs() {



      applyPrintApiNotificationSettings({



        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,



        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,



        sound_new_order_url: settingsPrintApiOrderSoundUrl ? settingsPrintApiOrderSoundUrl.value : "",



        sound_new_message_url: settingsPrintApiMessageSoundUrl ? settingsPrintApiMessageSoundUrl.value : ""



      });



    }







    function markPrintApiSettingsDirty() {



      const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



      printApiSettingsDirty = true;



      printApiDirtyStoreId = Number.isFinite(storeId) && storeId > 0 ? storeId : 0;



    }







    function clearPrintApiSettingsDirty() {



      printApiSettingsDirty = false;



      printApiDirtyStoreId = 0;



    }







    function updatePrintApiOriginalFromCurrentForm() {



      printApiOriginal = {



        store_id: Number(settingsPrintApiStore && settingsPrintApiStore.value) || 0,



        token: String((settingsPrintApiToken && settingsPrintApiToken.value) || ""),



        printer_status: String((settingsPrintApiPrinterStatus && settingsPrintApiPrinterStatus.value) || ""),



        printer_name: String((settingsPrintApiPrinterName && settingsPrintApiPrinterName.value) || ""),



        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,



        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,



        sound_new_order_url: String((settingsPrintApiOrderSoundUrl && settingsPrintApiOrderSoundUrl.value) || ""),



        sound_new_message_url: String((settingsPrintApiMessageSoundUrl && settingsPrintApiMessageSoundUrl.value) || "")



      };



    }







    function applyPrintApiOriginalState() {



      if (settingsPrintApiStore && printApiOriginal.store_id) {



        settingsPrintApiStore.value = String(printApiOriginal.store_id);



      }



      if (settingsPrintApiToken) {



        settingsPrintApiToken.value = String(printApiOriginal.token || "");



      }



      setPrintApiDeviceState(printApiOriginal.printer_status, printApiOriginal.printer_name);



      applyPrintApiNotificationSettings(printApiOriginal);



      if (settingsPrintApiGenerateBtn) {



        settingsPrintApiGenerateBtn.textContent = printApiOriginal.token ? "Пересоздать токен" : "Сгенерировать токен";



      }



    }







    function setPrintApiDraftMode(enabled) {



      printApiDraftMode = Boolean(enabled);



      if (settingsPrintApiStore) settingsPrintApiStore.disabled = !printApiDraftMode;



      if (settingsPrintApiToken) {



        settingsPrintApiToken.disabled = !printApiDraftMode;



        settingsPrintApiToken.readOnly = true;



      }



      if (settingsPrintApiPrinterStatus) {



        settingsPrintApiPrinterStatus.disabled = !printApiDraftMode;



        settingsPrintApiPrinterStatus.readOnly = true;



      }



      if (settingsPrintApiPrinterName) {



        settingsPrintApiPrinterName.disabled = !printApiDraftMode;



        settingsPrintApiPrinterName.readOnly = true;



      }



      if (settingsPrintApiNotifyNewOrder) settingsPrintApiNotifyNewOrder.disabled = !printApiDraftMode;



      if (settingsPrintApiNotifyNewMessage) settingsPrintApiNotifyNewMessage.disabled = !printApiDraftMode;



      if (settingsPrintApiCopyToken) settingsPrintApiCopyToken.disabled = !printApiDraftMode;



      if (settingsPrintApiGenerateBtn) settingsPrintApiGenerateBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiCheckBtn) settingsPrintApiCheckBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiOrderSoundUploadBtn) settingsPrintApiOrderSoundUploadBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiOrderSoundPlayBtn) settingsPrintApiOrderSoundPlayBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiOrderSoundClearBtn) settingsPrintApiOrderSoundClearBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiMessageSoundUploadBtn) settingsPrintApiMessageSoundUploadBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiMessageSoundPlayBtn) settingsPrintApiMessageSoundPlayBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiMessageSoundClearBtn) settingsPrintApiMessageSoundClearBtn.disabled = !printApiDraftMode;



      if (settingsPrintApiFooterView) settingsPrintApiFooterView.classList.toggle("hidden", printApiDraftMode);



      if (settingsPrintApiFooterEdit) settingsPrintApiFooterEdit.classList.toggle("hidden", !printApiDraftMode);



    }







    async function cancelPrintApiDraft() {



      const originalStoreId = Number(printApiOriginal.store_id || 0);



      clearPrintApiSettingsDirty();



      setPrintApiDraftMode(false);



      if (settingsPrintApiStore && originalStoreId > 0) {



        settingsPrintApiStore.value = String(originalStoreId);



      }



      applyPrintApiOriginalState();



      if (activeRightTabId === "print-api" && originalStoreId > 0) {



        await loadPrintApiToken(originalStoreId);



        printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;



        schedulePrintApiAutoRefresh();



      }



    }







    async function uploadPrintApiSound(file, field) {



      if (!file) return null;



      const json = await uploadTenantSound(field, file);



      if (!json || json.ok !== true || !json.url) {



        throw new Error(json?.error || "SOUND_UPLOAD_FAILED");



      }



      return String(json.url);



    }







    async function savePrintApiNotificationSettings(storeId) {



      if (!storeId) return null;



      const payload = {



        store_id: storeId,



        notify_new_order_enabled: settingsPrintApiNotifyNewOrder && settingsPrintApiNotifyNewOrder.checked ? 1 : 0,



        notify_new_message_enabled: settingsPrintApiNotifyNewMessage && settingsPrintApiNotifyNewMessage.checked ? 1 : 0,



        sound_new_order_url: settingsPrintApiOrderSoundUrl ? String(settingsPrintApiOrderSoundUrl.value || "").trim() || null : null,



        sound_new_message_url: settingsPrintApiMessageSoundUrl ? String(settingsPrintApiMessageSoundUrl.value || "").trim() || null : null



      };



      const res = await authFetch("/api/admin/tenant/print-api", {



        method: "PUT",



        headers: { "Content-Type": "application/json" },



        body: JSON.stringify(payload)



      });



      const data = await res.json().catch(() => null);



      if (!data || data.ok !== true) throw new Error(data?.error || "PRINT_API_SETTINGS_SAVE_FAILED");



      return data.data || null;



    }







    function playSoundPreview(url) {



      const soundUrl = String(url || "").trim();



      if (!soundUrl) return;



      try {



        const audio = new Audio(soundUrl);



        audio.play().catch(() => {});



      } catch {}



    }







    async function fetchPrintApiInfo(storeId) {



      const res = await authFetch(`/api/admin/tenant/print-api?store_id=${encodeURIComponent(storeId)}&_ts=${Date.now()}`);



      const data = await res.json();



      if (!data || !data.ok) return null;



      return data.data || null;



    }







    async function loadPrintApiToken(storeId) {



      if (activeRightTabId !== "print-api") return;



      if (!settingsPrintApiToken || !storeId) return;



      try {



        const info = await fetchPrintApiInfo(storeId);



        if (!info) {



          settingsPrintApiToken.value = "";



          resetPrintApiDeviceState({



            statusText: "Сначала сгенерируйте токен",



            printerText: "Нет токена подключения"



          });



          if (settingsPrintApiGenerateBtn) {



            settingsPrintApiGenerateBtn.textContent = "Сгенерировать токен";



          }



          if (!printApiDraftMode) {



            updatePrintApiOriginalFromCurrentForm();



          }



          return;



        }



        const token = info.token ? info.token : "";



        settingsPrintApiToken.value = token;



        clearPrintApiSettingsDirty();



        applyPrintApiNotificationSettings(info);



        resetPrintApiDeviceState({



          statusText: token ? "Нажмите \"Проверить подключение\"" : "Сначала сгенерируйте токен",



          printerText: token ? "Статус не проверен" : "Нет токена подключения"



        });



        if (settingsPrintApiGenerateBtn) {



          settingsPrintApiGenerateBtn.textContent = token ? "Пересоздать токен" : "Сгенерировать токен";



        }



        if (!printApiDraftMode || !printApiSettingsDirty) {



          updatePrintApiOriginalFromCurrentForm();



        }



      } catch (err) {



        console.error("Не удалось загрузить print API:", err);



        settingsPrintApiToken.value = "";



        resetPrintApiDeviceState({



          statusText: "Не удалось загрузить токен",



          printerText: "Ошибка запроса"



        });



        if (!printApiDraftMode) {



          updatePrintApiOriginalFromCurrentForm();



        }



      }



    }







    async function generatePrintApiToken(storeId) {



      if (!storeId) return;



      try {



        const res = await authFetch("/api/admin/tenant/print-api", {



          method: "POST",



          headers: { "Content-Type": "application/json" },



          body: JSON.stringify({ store_id: storeId })



        });



        const data = await res.json();



        if (!data || !data.ok) {



          resetPrintApiDeviceState({



            statusText: "Не удалось создать токен",



            printerText: "Ошибка запроса"



          });



          return;



        }



        const token = data.data && data.data.token ? data.data.token : "";



        if (settingsPrintApiToken) settingsPrintApiToken.value = token;



        clearPrintApiSettingsDirty();



        applyPrintApiNotificationSettings(data.data || {});



        resetPrintApiDeviceState({



          statusText: token ? "Нажмите \"Проверить подключение\"" : "Сначала сгенерируйте токен",



          printerText: token ? "Статус не проверен" : "Нет токена подключения"



        });



        if (settingsPrintApiGenerateBtn) settingsPrintApiGenerateBtn.textContent = "Пересоздать токен";



        updatePrintApiOriginalFromCurrentForm();



      } catch (err) {



        console.error("Не удалось создать print API:", err);



      }



    }







    async function checkPrintApiConnection(storeId, options = {}) {



      const silent = options && options.silent === true;



      if (!storeId) return;



      if (!settingsPrintApiToken || !String(settingsPrintApiToken.value || "").trim()) {



        resetPrintApiDeviceState({



          statusText: "Сначала сгенерируйте токен",



          printerText: "Нет токена подключения"



        });



        return;



      }







      const initialText = settingsPrintApiCheckBtn ? settingsPrintApiCheckBtn.textContent : "";



      if (!silent && settingsPrintApiCheckBtn) {



        settingsPrintApiCheckBtn.disabled = true;



        settingsPrintApiCheckBtn.textContent = "Проверка...";



      }







      try {



        const info = await fetchPrintApiInfo(storeId);



        if (!info) {



          resetPrintApiDeviceState({



            statusText: "Проверка не пройдена",



            printerText: "Токен не найден"



          });



          return;



        }



        if (settingsPrintApiToken) settingsPrintApiToken.value = String(info.token || "");



        applyPrintApiDeviceState(info);



        const currentStoreId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



        const shouldPreserveDraft = printApiDraftMode || (printApiSettingsDirty



          && Number.isFinite(currentStoreId)



          && currentStoreId > 0



          && currentStoreId === printApiDirtyStoreId);



        if (!shouldPreserveDraft) {



          applyPrintApiNotificationSettings(info);



          updatePrintApiOriginalFromCurrentForm();



        }



        printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;



      } catch (err) {



        console.error("Не удалось проверить подключение print API:", err);



        printApiAutoRefreshDelayMs = Math.min(PRINT_API_AUTO_REFRESH_MAX_MS, Math.max(PRINT_API_AUTO_REFRESH_MIN_MS, printApiAutoRefreshDelayMs * 2));



        resetPrintApiDeviceState({



          statusText: "Не удалось проверить",



          printerText: "Ошибка запроса"



        });



      } finally {



        if (!silent && settingsPrintApiCheckBtn) {



          settingsPrintApiCheckBtn.disabled = false;



          settingsPrintApiCheckBtn.textContent = initialText || "Проверить подключение";



        }



      }



    }







    function ensurePrintApiReady() {



      if (activeRightTabId !== "print-api") {



        return;



      }



      const loadAndSelect = async () => {



        if (!storesState.loaded) {



          await loadStores();



        }



        populatePrintApiStores(storesState.items);



        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);



        if (storeId) {



          await loadPrintApiToken(storeId);



          printApiAutoRefreshDelayMs = PRINT_API_AUTO_REFRESH_MIN_MS;



          schedulePrintApiAutoRefresh();



        } else {



          if (settingsPrintApiToken) settingsPrintApiToken.value = "";



          resetPrintApiDeviceState({



            statusText: "Сначала выберите филиал",



            printerText: "Нет данных для проверки"



          });



        }



      };



      loadAndSelect();



    }







    function trimOrNull(value) {



      const s = String(value ?? "").trim();



      return s ? s : null;



    }







    function mergeStoreInState(store) {



      if (!store) return;



      const next = storesState.items.slice();



      const idx = next.findIndex((s) => s.id === store.id);



      if (idx >= 0) {



        next[idx] = store;



      } else {



        next.push(store);



      }



      next.sort((a, b) => a.id - b.id);



      storesState.items = next;



      rebuildStoreAddressSuggestCache();



      renderStoresList(next);



      syncDeliveryMapStoresState();



    }







    function getStoreTabIdByStoreId(storeId) {



      for (const [tabId, data] of storeTabs.entries()) {



        if (data && data.storeId === storeId) return tabId;



      }



      return null;



    }







    async function loadStoreTelegramBindings(storeId) {



      if (!settingsStoreTelegramList) return;



      settingsStoreTelegramList.innerHTML = "<div class=\"muted\">Загрузка…</div>";



      try {



        const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/telegram");



        const data = await res.json();



        if (!data || !data.ok) {



          settingsStoreTelegramList.innerHTML = "";



          return;



        }



        let bindings = data.bindings || [];



        const byChatId = new Map();



        bindings.forEach((b) => {



          const cid = b.telegram_chat_id != null ? String(b.telegram_chat_id) : "";



          if (cid && !byChatId.has(cid)) byChatId.set(cid, b);



        });



        bindings = Array.from(byChatId.values());



        settingsStoreTelegramList.innerHTML = "";



        if (bindings.length === 0) {



          settingsStoreTelegramList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Нет подключённых аккаунтов</span></div></div>";



          return;



        }



        bindings.forEach((b) => {



          const bindingEl = document.createElement("div");



          bindingEl.className = "global-telegram-binding";



          bindingEl.dataset.bindingId = b.id;







          const header = document.createElement("div");



          header.className = "global-telegram-header";







          const apiKeySpan = document.createElement("span");



          apiKeySpan.className = "global-telegram-api-key";



          apiKeySpan.textContent = "API: " + (b.telegram_chat_id || "—");



          header.appendChild(apiKeySpan);







          const actions = document.createElement("div");



          actions.className = "global-telegram-actions";







          const deleteBtn = document.createElement("button");



          deleteBtn.type = "button";



          deleteBtn.className = "btn btn-icon btn-sm btn-danger-text";



          deleteBtn.title = "Отключить";



          deleteBtn.dataset.bindingId = b.id || "";



          deleteBtn.innerHTML = "<i class=\"fas fa-times\"></i>";



          actions.appendChild(deleteBtn);







          header.appendChild(actions);



          bindingEl.appendChild(header);



          settingsStoreTelegramList.appendChild(bindingEl);



        });



      } catch (e) {



        console.error("loadStoreTelegramBindings error:", e);



        settingsStoreTelegramList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Ошибка загрузки</span></div></div>";



      }



    }

    async function loadStoreMaxBindings(storeId) {

      if (!settingsStoreMaxList) return;

      settingsStoreMaxList.innerHTML = "<div class=\"muted\">Загрузка…</div>";

      try {

        const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/max");

        const data = await res.json();

        if (!data || !data.ok) {

          settingsStoreMaxList.innerHTML = "";

          return;

        }

        let bindings = data.bindings || [];

        const byUserId = new Map();

        bindings.forEach((binding) => {

          const userId = binding.max_user_id != null ? String(binding.max_user_id).trim() : "";

          if (userId && !byUserId.has(userId)) byUserId.set(userId, binding);

        });

        bindings = Array.from(byUserId.values());

        settingsStoreMaxList.innerHTML = "";

        if (bindings.length === 0) {

          settingsStoreMaxList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Нет подключённых аккаунтов</span></div></div>";

          return;

        }

        bindings.forEach((binding) => {

          const bindingEl = document.createElement("div");

          bindingEl.className = "global-telegram-binding";

          bindingEl.dataset.bindingId = binding.id;

          const header = document.createElement("div");

          header.className = "global-telegram-header";

          const apiKeySpan = document.createElement("span");

          apiKeySpan.className = "global-telegram-api-key";

          apiKeySpan.textContent = "API: " + (binding.max_user_id || "—");

          header.appendChild(apiKeySpan);

          const actions = document.createElement("div");

          actions.className = "global-telegram-actions";

          const deleteBtn = document.createElement("button");

          deleteBtn.type = "button";

          deleteBtn.className = "btn btn-icon btn-sm btn-danger-text";

          deleteBtn.title = "Отключить";

          deleteBtn.dataset.bindingId = binding.id || "";

          deleteBtn.innerHTML = "<i class=\"fas fa-times\"></i>";

          actions.appendChild(deleteBtn);

          header.appendChild(actions);

          bindingEl.appendChild(header);

          settingsStoreMaxList.appendChild(bindingEl);

        });

      } catch (e) {

        console.error("loadStoreMaxBindings error:", e);

        settingsStoreMaxList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Ошибка загрузки</span></div></div>";

      }

    }

    if (settingsStoreMaxAddByKeysBtn) {

      settingsStoreMaxAddByKeysBtn.addEventListener("click", async () => {

        const storeId = storesState.selectedId;

        const apiKey = settingsStoreMaxApiKey ? settingsStoreMaxApiKey.value.trim() : "";

        const secretKey = settingsStoreMaxSecretKey ? settingsStoreMaxSecretKey.value.trim() : "";

        if (!storeId || !apiKey || !secretKey) {

          alert("Введите API key и Secret key от MAX-бота.");

          return;

        }

        try {

          const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/max/add-by-keys", {

            method: "POST",

            headers: { "Content-Type": "application/json" },

            body: JSON.stringify({ api_key: apiKey, secret_key: secretKey })

          });

          const data = await res.json();

          if (!data || !data.ok) {

            alert(data.error === "SECRET_INVALID_OR_EXPIRED" ? "Secret key недействителен или истёк. Напишите /start MAX-боту заново." : (data.error || "Ошибка"));

            return;

          }

          if (settingsStoreMaxApiKey) settingsStoreMaxApiKey.value = "";

          if (settingsStoreMaxSecretKey) settingsStoreMaxSecretKey.value = "";

          if (settingsStoreMaxConnectBlock) settingsStoreMaxConnectBlock.classList.add("hidden");

          loadStoreMaxBindings(storeId);

        } catch (e) {

          alert("Ошибка запроса");

        }

      });

    }

    // Обработчик "+" для показа формы добавления (филиал)



    if (settingsStoreTelegramToggleBtn) {



      settingsStoreTelegramToggleBtn.addEventListener("click", () => {



        if (settingsStoreTelegramConnectBlock) {



          settingsStoreTelegramConnectBlock.classList.toggle("hidden");



        }



      });



    }

    if (settingsStoreMaxToggleBtn) {

      settingsStoreMaxToggleBtn.addEventListener("click", () => {

        if (settingsStoreMaxConnectBlock) {

          settingsStoreMaxConnectBlock.classList.toggle("hidden");

        }

      });

    }







    // Обработчик "Отмена" для скрытия формы (филиал)



    if (settingsStoreTelegramCancelBtn) {



      settingsStoreTelegramCancelBtn.addEventListener("click", () => {



        if (settingsStoreTelegramConnectBlock) {



          settingsStoreTelegramConnectBlock.classList.add("hidden");



        }



        if (settingsStoreTelegramApiKey) settingsStoreTelegramApiKey.value = "";



        if (settingsStoreTelegramSecretKey) settingsStoreTelegramSecretKey.value = "";



      });



    }

    if (settingsStoreMaxCancelBtn) {

      settingsStoreMaxCancelBtn.addEventListener("click", () => {

        if (settingsStoreMaxConnectBlock) {

          settingsStoreMaxConnectBlock.classList.add("hidden");

        }

        if (settingsStoreMaxApiKey) settingsStoreMaxApiKey.value = "";

        if (settingsStoreMaxSecretKey) settingsStoreMaxSecretKey.value = "";

      });

    }







    async function loadNotificationsOverview() {



      await loadGlobalTelegramBindings();



    }







    async function loadGlobalTelegramBindings() {



      if (!globalTelegramBindings) return;



      globalTelegramBindings.innerHTML = "<div class=\"muted\">Загрузка…</div>";



      try {



        const res = await authFetch("/api/admin/tenant/telegram");



        const data = await res.json();



        if (!data || !data.ok) {



          globalTelegramBindings.innerHTML = "";



          return;



        }



        const bindings = data.bindings || [];



        const stores = data.stores || [];



        globalTelegramBindings.innerHTML = "";







        if (bindings.length === 0) {



          globalTelegramBindings.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Нет подключённых аккаунтов</span></div></div>";



          return;



        }







        bindings.forEach((b) => {



          const bindingEl = document.createElement("div");



          bindingEl.className = "global-telegram-binding";



          bindingEl.dataset.bindingId = b.id;







          // Компактный заголовок: API key + шестерёнка + отключить



          const header = document.createElement("div");



          header.className = "global-telegram-header";







          const apiKeySpan = document.createElement("span");



          apiKeySpan.className = "global-telegram-api-key";



          apiKeySpan.textContent = "API: " + (b.telegram_chat_id || "—");



          header.appendChild(apiKeySpan);







          const actions = document.createElement("div");



          actions.className = "global-telegram-actions";







          // Кнопка шестерёнки для раскрытия филиалов



          if (stores.length > 0) {



            const gearBtn = document.createElement("button");



            gearBtn.type = "button";



            gearBtn.className = "btn btn-icon btn-sm global-telegram-gear";



            gearBtn.title = "Настройки филиалов";



            gearBtn.dataset.globalTelegramGear = b.id;



            gearBtn.innerHTML = "<i class=\"fas fa-cog\"></i>";



            actions.appendChild(gearBtn);



          }







          // Кнопка удаления



          const deleteBtn = document.createElement("button");



          deleteBtn.type = "button";



          deleteBtn.className = "btn btn-icon btn-sm btn-danger-text";



          deleteBtn.title = "Отключить";



          deleteBtn.dataset.globalTelegramDelete = b.id;



          deleteBtn.innerHTML = "<i class=\"fas fa-times\"></i>";



          actions.appendChild(deleteBtn);







          header.appendChild(actions);



          bindingEl.appendChild(header);







          // Аккордеон с филиалами (скрыт по умолчанию)



          if (stores.length > 0) {



            const storesSection = document.createElement("div");



            storesSection.className = "global-telegram-stores hidden";



            storesSection.dataset.storesFor = b.id;







            const storesList = document.createElement("div");



            storesList.className = "global-telegram-stores-list";







            const enabledStoreIds = new Set((b.store_settings || []).filter(s => s.is_enabled).map(s => s.store_id));







            stores.forEach((store) => {



              const storeRow = document.createElement("div");



              storeRow.className = "global-telegram-store-row";



              const isEnabled = enabledStoreIds.has(store.id);



              storeRow.innerHTML = "<label class=\"toggle-switch\"><input type=\"checkbox\" data-global-telegram-store=\"" + store.id + "\" data-binding-id=\"" + b.id + "\"" + (isEnabled ? " checked" : "") + "><span class=\"toggle-slider\"></span></label><span class=\"store-name\">" + (store.name || "Филиал #" + store.id) + "</span>";



              storesList.appendChild(storeRow);



            });







            storesSection.appendChild(storesList);



            bindingEl.appendChild(storesSection);



          }







          globalTelegramBindings.appendChild(bindingEl);



        });







      } catch (e) {



        globalTelegramBindings.innerHTML = "";



      }



    }







    // Обработчик "+" для показа формы добавления



    if (globalTelegramToggleBtn) {



      globalTelegramToggleBtn.addEventListener("click", () => {



        if (globalTelegramConnectBlock) {



          globalTelegramConnectBlock.classList.toggle("hidden");



        }



      });



    }







    // Обработчик "Отмена" для скрытия формы



    if (globalTelegramCancelBtn) {



      globalTelegramCancelBtn.addEventListener("click", () => {



        if (globalTelegramConnectBlock) {



          globalTelegramConnectBlock.classList.add("hidden");



        }



        if (globalTelegramApiKey) globalTelegramApiKey.value = "";



        if (globalTelegramSecretKey) globalTelegramSecretKey.value = "";



      });



    }







    // Обработчик добавления глобального Telegram



    if (globalTelegramAddBtn) {



      globalTelegramAddBtn.addEventListener("click", async () => {



        const apiKey = globalTelegramApiKey ? globalTelegramApiKey.value.trim() : "";



        const secretKey = globalTelegramSecretKey ? globalTelegramSecretKey.value.trim() : "";



        if (!apiKey || !secretKey) {



          alert("Введите API key и Secret key от бота.");



          return;



        }



        try {



          const res = await authFetch("/api/admin/tenant/telegram/add-by-keys", {



            method: "POST",



            headers: { "Content-Type": "application/json" },



            body: JSON.stringify({ api_key: apiKey, secret_key: secretKey })



          });



          const data = await res.json();



          if (!data || !data.ok) {



            alert(data.error === "SECRET_INVALID_OR_EXPIRED" ? "Secret key недействителен или истёк. Напишите /start боту заново." : (data.error || "Ошибка"));



            return;



          }



          if (globalTelegramApiKey) globalTelegramApiKey.value = "";



          if (globalTelegramSecretKey) globalTelegramSecretKey.value = "";



          if (globalTelegramConnectBlock) globalTelegramConnectBlock.classList.add("hidden");



          await loadGlobalTelegramBindings();



        } catch (e) {



          alert("Ошибка подключения");



        }



      });



    }







    // Обработчики для глобальных Telegram привязок



    if (globalTelegramBindings) {



      globalTelegramBindings.addEventListener("click", async (e) => {



        // Шестерёнка — toggle аккордеон филиалов



        const gearBtn = e.target.closest("[data-global-telegram-gear]");



        if (gearBtn) {



          const bindingId = gearBtn.getAttribute("data-global-telegram-gear");



          const storesSection = globalTelegramBindings.querySelector("[data-stores-for=\"" + bindingId + "\"]");



          if (storesSection) {



            storesSection.classList.toggle("hidden");



            gearBtn.classList.toggle("active");



          }



          return;



        }







        // Удаление



        const deleteBtn = e.target.closest("[data-global-telegram-delete]");



        if (deleteBtn) {



          const bindingId = deleteBtn.getAttribute("data-global-telegram-delete");



          if (!bindingId) return;



          if (!confirm("Отключить Telegram?")) return;



          try {



            const res = await authFetch("/api/admin/tenant/telegram/" + encodeURIComponent(bindingId), { method: "DELETE" });



            const data = await res.json();



            if (!data || !data.ok) {



              alert(data.error || "Ошибка");



              return;



            }



            await loadGlobalTelegramBindings();



          } catch (e) {



            alert("Ошибка удаления");



          }



        }



      });







      globalTelegramBindings.addEventListener("change", async (e) => {



        const checkbox = e.target.closest("[data-global-telegram-store]");



        if (checkbox) {



          const storeId = checkbox.getAttribute("data-global-telegram-store");



          const bindingId = checkbox.getAttribute("data-binding-id");



          const isEnabled = checkbox.checked;



          if (!storeId || !bindingId) return;



          try {



            const res = await authFetch("/api/admin/tenant/telegram/" + encodeURIComponent(bindingId) + "/stores", {



              method: "POST",



              headers: { "Content-Type": "application/json" },



              body: JSON.stringify({ store_id: Number(storeId), is_enabled: isEnabled })



            });



            const data = await res.json();



            if (!data || !data.ok) {



              checkbox.checked = !isEnabled; // Откатываем



              alert(data.error || "Ошибка");



            }



          } catch (e) {



            checkbox.checked = !isEnabled;



            alert("Ошибка сохранения");



          }



        }



      });



    }







    function getSettingsListConfig(type) {



      return settingsListsConfig[type] || null;



    }







    function ensureListLoaded(type) {



      const state = settingsListsState[type];



      if (!state || state.loaded) return;



      loadSettingsList(type);



    }







    async function loadSettingsList(type) {



      const cfg = getSettingsListConfig(type);



      if (!cfg) return;



      try {



        const res = await authFetch(cfg.endpoint);



        const data = await res.json();



        if (!data || !data.ok) return;



        const items = Array.isArray(data.items) ? data.items : [];



        settingsListsState[type] = { loaded: true, items };



        renderSettingsList(type, items);



        if (type === "order-statuses") {



          refreshOrderStockDeductControls();



        }



      } catch (err) {



        console.error("Не удалось загрузить список:", type, err);



      }



    }







    async function updateSettingsItem(type, id, payload) {



      const cfg = getSettingsListConfig(type);



      if (!cfg) return null;



      try {



        const res = await authFetch(cfg.updateEndpoint + encodeURIComponent(id), {



          method: "PATCH",



          body: JSON.stringify(payload)



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось обновить запись:", err);



        return null;



      }



    }







    async function reorderSettingsList(type, ids) {



      const cfg = getSettingsListConfig(type);



      if (!cfg) return null;



      try {



        const res = await authFetch(cfg.reorderEndpoint, {



          method: "POST",



          body: JSON.stringify({ ids })



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось сохранить сортировку:", err);



        return null;



      }



    }







    async function uploadSettingsIcon(type, id, file) {



      const token = typeof getAuthToken === "function" ? getAuthToken() : null;



      const form = new FormData();



      form.append("file", file);



      form.append("type", type);



      form.append("id", String(id));







      const res = await fetch("/api/admin/tenant/list-icon", {



        method: "POST",



        headers: token ? { Authorization: `Bearer ${token}` } : {},



        body: form



      });



      const data = await res.json();



      return data || null;



    }







    function updateIconButton(btn, iconValue, fallbackIconValue = null) {



      if (!btn) return;



      btn.innerHTML = "";



      const resolvedIcon = iconValue || fallbackIconValue;



      if (resolvedIcon) {



        const isUrl = resolvedIcon.includes("/") || resolvedIcon.startsWith("http");



        if (isUrl) {



          const img = document.createElement("img");



          img.className = "settings-icon-img";



          img.src = resolvedIcon;



          img.alt = "";



          btn.appendChild(img);



        } else {



          const icon = document.createElement("i");



          const base = String(resolvedIcon).trim();



          if (base.includes(" ")) {



            icon.className = base;



          } else if (base.startsWith("fa-")) {



            icon.className = `fas ${base}`;



          } else {



            icon.className = `fas fa-${base}`;



          }



          btn.appendChild(icon);



        }



        btn.classList.add("is-filled");



      } else {



        btn.classList.remove("is-filled");



        btn.innerHTML = '<i class="fas fa-plus"></i>';



      }



    }







    function getSettingsDefaultIcon(type, item) {



      const cfg = getSettingsListConfig(type);



      if (!cfg || !cfg.defaultIcons || !item) return null;



      const code = String(item.code || "").trim().toLowerCase();



      if (!code) return null;



      return cfg.defaultIcons[code] || null;



    }







    function createSwitch(labelText, checked, onChange) {



      const label = document.createElement("label");



      label.className = "switch";







      const input = document.createElement("input");



      input.className = "switch-input";



      input.type = "checkbox";



      input.checked = Boolean(checked);







      const ui = document.createElement("span");



      ui.className = "switch-ui";



      ui.setAttribute("aria-hidden", "true");







      const textEl = document.createElement("span");



      textEl.className = "switch-text";



      textEl.textContent = labelText;







      input.addEventListener("change", () => onChange(input.checked));







      label.appendChild(input);



      label.appendChild(ui);



      label.appendChild(textEl);



      return label;



    }







    function createSettingsRow(type, item) {



      const cfg = getSettingsListConfig(type);



      const row = document.createElement("div");



      row.className = "order-row settings-row";



      row.setAttribute("draggable", "true");



      row.dataset.id = String(item.id);



      if (type === "order-time-options") row.classList.add("settings-row--time-option");



      if (type === "order-delivery") row.classList.add("settings-row--delivery");







      if (cfg.hasIcon === false) {



        row.classList.add("settings-row--no-icon");



      }







      let iconWrap = null;



      if (cfg.hasIcon !== false) {



        iconWrap = document.createElement("div");



        iconWrap.className = "settings-row-icon";







        const iconBtn = document.createElement("button");



        iconBtn.type = "button";



        iconBtn.className = "btn btn-icon btn-sm settings-icon-btn";



        iconBtn.title = cfg.iconLabel;



        const fallbackIcon = getSettingsDefaultIcon(type, item);



        if (fallbackIcon) iconBtn.dataset.fallbackIcon = fallbackIcon;



        updateIconButton(iconBtn, item.icon, fallbackIcon);



        iconWrap.appendChild(iconBtn);



      }







      const titleWrap = document.createElement("div");



      titleWrap.className = "settings-row-title";



      const titleInput = document.createElement("input");



      titleInput.className = "control";



      titleInput.type = "text";



      titleInput.value = item.title || "";



      titleInput.dataset.value = item.title || "";



      titleWrap.appendChild(titleInput);







      const switches = document.createElement("div");



      switches.className = "settings-row-switches";







      if (cfg.defaultField) {



        switches.appendChild(createSwitch("По умолчанию", Number(item[cfg.defaultField]) === 1, async (checked) => {



          const payload = { [cfg.defaultField]: checked ? 1 : 0 };



          const data = await updateSettingsItem(type, item.id, payload);



          if (!data || !data.ok) {



            alert("Не удалось сохранить значение по умолчанию.");



            return;



          }



          await loadSettingsList(type);



        }));



      }







      if (type === "order-delivery") {



        switches.appendChild(createSwitch("Клиент обязателен", Number(item.require_client_data ?? 1) === 1, async (checked) => {



          const data = await updateSettingsItem(type, item.id, { require_client_data: checked ? 1 : 0 });



          if (!data || !data.ok) {



            alert("Не удалось сохранить обязательность данных клиента.");



          }



        }));







        switches.appendChild(createSwitch("На сайте", Number(item.show_on_site ?? 1) === 1, async (checked) => {



          const data = await updateSettingsItem(type, item.id, { show_on_site: checked ? 1 : 0 });



          if (!data || !data.ok) {



            alert("Не удалось сохранить видимость на сайте.");



          }



        }));



      }







      if (cfg.hasFinal) {



        switches.appendChild(createSwitch("Финальный", Number(item.is_final) === 1, async (checked) => {



          const data = await updateSettingsItem(type, item.id, { is_final: checked ? 1 : 0 });



          if (!data || !data.ok) {



            alert("Не удалось сохранить финальный статус.");



          }



        }));



      }







      const activeSwitch = createSwitch("Активен", Number(item.is_active) === 1, async (checked) => {



        const data = await updateSettingsItem(type, item.id, { is_active: checked ? 1 : 0 });



        if (!data || !data.ok) {



          alert("Не удалось сохранить активность.");



        }



      });



      switches.appendChild(activeSwitch);







      let timeDetails = null;



      if (cfg.hasTimeWindowSettings) {



        const localItem = { ...item };



        const detailFields = [



          { key: "starts_at", label: "Начало", type: "time" },



          { key: "ends_at", label: "Конец", type: "time" },



          { key: "step_minutes", label: "Шаг (мин)", type: "number", attrs: { min: 1 } },



          { key: "lead_minutes", label: "Запас (мин)", type: "number", attrs: { min: 0 } }



        ];



        const timeInputs = {};







        const fillTimeInputs = (values) => {



          detailFields.forEach(({ key }) => {



            const input = timeInputs[key];



            if (!input) return;



            input.value = values[key] ?? "";



          });



        };







        const toggleTimeDetails = (visible) => {



          if (!timeDetails) return;



          timeDetails.style.display = visible ? "grid" : "none";



        };







        const patchTimeField = async (field, value) => {



          const data = await updateSettingsItem(type, item.id, { [field]: value });



          if (!data || !data.ok || !data.item) {



            fillTimeInputs(localItem);



            return;



          }



          Object.assign(localItem, data.item);



          fillTimeInputs(data.item);



          toggleTimeDetails(Number(data.item.has_time_window) === 1);



        };







        const timeSwitch = createSwitch("Настроить время", Number(localItem.has_time_window) === 1, async (checked) => {



          const data = await updateSettingsItem(type, item.id, { has_time_window: checked ? 1 : 0 });



          if (!data || !data.ok || !data.item) {



            toggleTimeDetails(Number(localItem.has_time_window) === 1);



            return;



          }



          Object.assign(localItem, data.item);



          fillTimeInputs(data.item);



          toggleTimeDetails(Number(data.item.has_time_window) === 1);



        });



        switches.insertBefore(timeSwitch, activeSwitch);







        timeDetails = document.createElement("div");



        timeDetails.className = "settings-row-time-details";



        timeDetails.style.display = Number(localItem.has_time_window) === 1 ? "grid" : "none";







        detailFields.forEach((fieldConfig) => {



          const fieldWrap = document.createElement("div");



          fieldWrap.className = "settings-row-time-field";







          const labelEl = document.createElement("span");



          labelEl.textContent = fieldConfig.label;



          labelEl.className = "settings-row-time-field-label";







          const inputEl = document.createElement("input");



          inputEl.type = fieldConfig.type;



          inputEl.className = "control";



          if (fieldConfig.attrs) {



            Object.entries(fieldConfig.attrs).forEach(([attr, val]) => {



              inputEl.setAttribute(attr, val);



            });



          }



          inputEl.value = localItem[fieldConfig.key] ?? "";



          inputEl.addEventListener("change", () => {



            patchTimeField(fieldConfig.key, inputEl.value || null);



          });







          fieldWrap.appendChild(labelEl);



          fieldWrap.appendChild(inputEl);



          timeDetails.appendChild(fieldWrap);



          timeInputs[fieldConfig.key] = inputEl;



        });



      }







      titleInput.addEventListener("blur", async () => {



        const next = titleInput.value.trim();



        const prev = titleInput.dataset.value || "";



        if (next === prev) return;



        const data = await updateSettingsItem(type, item.id, { title: next || null });



        if (!data || !data.ok) {



          titleInput.value = prev;



          alert("Не удалось сохранить название.");



          return;



        }



        titleInput.dataset.value = next;



      });







      if (iconWrap) {



        const iconBtn = iconWrap.querySelector(".settings-icon-btn");



        iconBtn.addEventListener("click", () => {



          iconUploadTarget = { type, id: item.id, button: iconBtn };



          iconUploadInput.click();



        });



        row.appendChild(iconWrap);



      }



      row.appendChild(titleWrap);



      row.appendChild(switches);



      if (cfg.defaultField) {



        row.classList.toggle("is-default", Number(item[cfg.defaultField]) === 1);



      } else {



        row.classList.remove("is-default");



      }



      if (timeDetails) {



        const wrapper = document.createElement("div");



        wrapper.className = "settings-row-wrapper";



        wrapper.appendChild(row);



        wrapper.appendChild(timeDetails);



        return wrapper;



      }



      return row;



    }







    function renderSettingsList(type, items) {



      const listEl = document.querySelector(`[data-settings-list="${type}"]`);



      if (!listEl) return;



      listEl.innerHTML = "";







      if (!items.length) {



        const empty = document.createElement("div");



        empty.className = "muted";



        empty.textContent = "Нет данных.";



        listEl.appendChild(empty);



        return;



      }







      items.forEach((item) => {



        listEl.appendChild(createSettingsRow(type, item));



      });







      attachDragHandlers(listEl, type);



    }







    function getDragAfterElement(container, y) {



      const draggableElements = [...container.querySelectorAll(".settings-row:not(.is-dragging)")];



      return draggableElements.reduce((closest, child) => {



        const box = child.getBoundingClientRect();



        const offset = y - box.top - box.height / 2;



        if (offset < 0 && offset > closest.offset) {



          return { offset, element: child };



        }



        return closest;



      }, { offset: Number.NEGATIVE_INFINITY, element: null }).element;



    }







    function attachDragHandlers(listEl, type) {



      if (listEl.dataset.dragReady === "1") return;



      listEl.dataset.dragReady = "1";



      let dragEl = null;



      let orderBefore = "";







      listEl.addEventListener("dragstart", (e) => {



        const row = e.target.closest(".settings-row");



        if (!row) return;



        dragEl = row;



        dragEl.classList.add("is-dragging");



        if (e.dataTransfer) {



          e.dataTransfer.effectAllowed = "move";



          try {



            e.dataTransfer.setData("text/plain", "");



          } catch {}



        }



        orderBefore = [...listEl.querySelectorAll(".settings-row")]



          .map((el) => el.dataset.id)



          .join(",");



      });







      listEl.addEventListener("dragend", async () => {



        if (!dragEl) return;



        dragEl.classList.remove("is-dragging");



        dragEl = null;



        const orderAfter = [...listEl.querySelectorAll(".settings-row")]



          .map((el) => el.dataset.id)



          .join(",");



        if (orderBefore === orderAfter) return;



        const ids = orderAfter.split(",").map((v) => Number(v)).filter((v) => Number.isFinite(v));



        const data = await reorderSettingsList(type, ids);



        if (!data || !data.ok) {



          alert("Не удалось сохранить активность.");



        }



      });







      listEl.addEventListener("dragover", (e) => {



        e.preventDefault();



        if (!dragEl) return;



        const afterElement = getDragAfterElement(listEl, e.clientY);



        if (afterElement == null) {



          listEl.appendChild(dragEl);



        } else {



          listEl.insertBefore(dragEl, afterElement);



        }



      });



    }







    const iconUploadInput = document.createElement("input");



    iconUploadInput.type = "file";



    iconUploadInput.accept = "image/*";



    iconUploadInput.className = "hidden";



    document.body.appendChild(iconUploadInput);







    let iconUploadTarget = null;



    iconUploadInput.addEventListener("change", async () => {



      if (!iconUploadTarget) return;



      const file = iconUploadInput.files && iconUploadInput.files[0];



      if (!file) return;



      const { type, id, button } = iconUploadTarget;



      const data = await uploadSettingsIcon(type, id, file);



      if (!data || !data.ok || !data.url) {



        alert("Не удалось загрузить иконку.");



        return;



      }



      updateIconButton(button, data.url, button.dataset.fallbackIcon || null);



      iconUploadInput.value = "";



      iconUploadTarget = null;



    });







    function triggerUpload(key) {



      const input = document.querySelector(`[data-upload-input=\"${key}\"]`);



      if (input) input.click();



    }







    document.querySelectorAll("[data-upload-box]").forEach((box) => {



      box.addEventListener("click", () => {



        const key = box.getAttribute("data-upload-box");



        if (key) triggerUpload(key);



      });



    });







    document.querySelectorAll("[data-upload-action]").forEach((btn) => {



      btn.addEventListener("click", () => {



        const key = btn.getAttribute("data-upload-action");



        if (key) triggerUpload(key);



      });



    });







    document.querySelectorAll("[data-delete-action]").forEach((btn) => {



      btn.addEventListener("click", async () => {



        const key = btn.getAttribute("data-delete-action");



        if (!key) return;



        const input = document.querySelector(`[data-tenant-input=\"${key}\"]`);



        if (input) input.value = "";



        setPreviewFromValue(key, "");



        const payload = { [key]: null };



        const data = await updateTenantFields(payload);



        if (data && data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



        }



      });



    });







    document.querySelectorAll("[data-upload-input]").forEach((input) => {



      input.addEventListener("change", async () => {



        if (!input.files || !input.files.length) return;



        const file = input.files[0];



        const key = input.getAttribute("data-upload-input");



        if (!key) return;







        const res = await uploadTenantAsset(key, file);



        if (res && res.url) {



          const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);



          if (hiddenInput) hiddenInput.value = res.url;



          setPreviewFromValue(key, res.url);



          if (res.tenant) {



            updateTenantCache(res.tenant);



            applyBrandFromTenant(res.tenant);



          }



        }



      });



    });







    // Фавикон РІ панели «Данные сайта»



    (function () {



      var uploadBtn = document.getElementById("siteFaviconUploadBtn");



      var fileInput = document.getElementById("siteFaviconFileInput");



      var deleteBtn = document.getElementById("siteFaviconDeleteBtn");



      if (uploadBtn && fileInput) {



        uploadBtn.addEventListener("click", function () { fileInput.click(); });



        fileInput.addEventListener("change", async function () {



          if (!fileInput.files || !fileInput.files.length) return;



          if (!siteDraftMode) {



            fileInput.value = "";



            return;



          }



          var res = await uploadTenantAsset("favicon_light_url", fileInput.files[0]);



          if (res && res.url) {



            siteDraft.favicon_light_url = String(res.url || "");



            updateSiteFavicon(res.url);



            setPreviewFromValue("favicon_light_url", res.url);



          }



          fileInput.value = "";



        });



      }



      if (deleteBtn) {



        deleteBtn.addEventListener("click", async function () {



          if (!siteDraftMode) return;



          siteDraft.favicon_light_url = "";



          updateSiteFavicon("");



          setPreviewFromValue("favicon_light_url", "");



        });



      }



    })();







    document.querySelectorAll("[data-sound-box], [data-sound-upload]").forEach((el) => {



      el.addEventListener("click", () => {



        if (!chatSoundsDraftMode) return;



        const key = el.getAttribute("data-sound-box") || el.getAttribute("data-sound-upload");



        if (key) {



          const input = document.querySelector(`[data-sound-input=\"${key}\"]`);



          if (input) input.click();



        }



      });



    });



    document.querySelectorAll("[data-sound-input]").forEach((input) => {



      input.addEventListener("change", async () => {



        if (!chatSoundsDraftMode) {



          input.value = "";



          return;



        }



        if (!input.files || !input.files.length) return;



        const file = input.files[0];



        const key = input.getAttribute("data-sound-input");



        if (!key) return;



        const res = await uploadTenantSound(key, file);



        if (res && res.url) {



          const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);



          if (hiddenInput) hiddenInput.value = res.url;



          setSoundPreview(key, res.url);



        }



        input.value = "";



      });



    });



    document.querySelectorAll("[data-sound-delete]").forEach((btn) => {



      btn.addEventListener("click", () => {



        if (!chatSoundsDraftMode) return;



        const key = btn.getAttribute("data-sound-delete");



        if (!key) return;



        const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);



        if (hiddenInput) hiddenInput.value = "";



        setSoundPreview(key, "");



      });



    });



    document.querySelectorAll("[data-sound-play]").forEach((btn) => {



      btn.addEventListener("click", (e) => {



        e.preventDefault();



        e.stopPropagation();



        if (!chatSoundsDraftMode) return;



        const key = btn.getAttribute("data-sound-play");



        if (!key) return;



        const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);



        const url = hiddenInput && hiddenInput.value ? hiddenInput.value.trim() : "";



        if (!url) return;



        const audio = new Audio(url);



        audio.play().catch(() => {});



      });



    });







    document.querySelectorAll("[data-site-input]").forEach((input) => {



      input.addEventListener("blur", async () => {



        if (!siteDraftMode) return;



        const key = input.getAttribute("data-site-input");



        if (!key) return;



        if (key === "custom_domain") return;



        let value = input.value.trim();



        if (key === "subdomain") {



          value = value.toLowerCase();



          input.value = value;



        }



        siteDraft[key] = value || "";



      });



    });







    document.querySelectorAll("[data-brand-input]").forEach((input) => {



      input.addEventListener("blur", async () => {



        const key = input.getAttribute("data-brand-input");



        if (!key) return;



        const value = input.value.trim();



        const payload = { [key]: value || null };



        const data = await updateTenantFields(payload);



        if (!data || !data.ok) {



          if (key === "email" && data && data.error === "EMAIL_TAKEN") {



            alert("\u042d\u0442\u043e\u0442 email \u0443\u0436\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f.");



          } else {



            alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435 \u0431\u0440\u0435\u043d\u0434\u0430.");



          }



          await loadTenantProfile();



          return;



        }



        if (data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



        }



      });



    });







    if (settingsPriceRoundingMode || settingsPriceRoundingPrecision) {



      const saveRounding = async () => {



        const mode = settingsPriceRoundingMode ? settingsPriceRoundingMode.value : "none";



        const precisionRaw = settingsPriceRoundingPrecision ? settingsPriceRoundingPrecision.value : "2";



        const precision = precisionRaw === "0" ? 0 : 2;



        const data = await updateTenantFields({



          price_rounding_mode: mode || "none",



          price_rounding_precision: precision



        });



        if (!data || !data.ok) {



          alert("Не удалось сохранить настройки округления.");



          await loadTenantProfile();



          return;



        }



        if (data.tenant) {



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



        }



      };







      if (settingsPriceRoundingMode) {



        settingsPriceRoundingMode.addEventListener("change", saveRounding);



      }



      if (settingsPriceRoundingPrecision) {



        settingsPriceRoundingPrecision.addEventListener("change", saveRounding);



      }



    }







    if (settingsOrderStockDeductMode || settingsOrderStockDeductStatus) {



      const saveOrderStockDeductSettings = async () => {



        const mode = settingsOrderStockDeductMode && settingsOrderStockDeductMode.value === "on_status"



          ? "on_status"



          : "on_create";



        if (mode === "on_status" && !settingsListsState["order-statuses"]?.loaded) {



          await loadSettingsList("order-statuses");



        }



        refreshOrderStockDeductControls();



        const statusId =



          mode === "on_status"



            ? Number(settingsOrderStockDeductStatus?.value || tenantStockDeductStatusId || 0) || null



            : null;







        const data = await updateTenantFields({



          order_stock_deduct_mode: mode,



          order_stock_deduct_status_id: statusId



        });



        if (!data || !data.ok || !data.tenant) {



          alert("Не удалось сохранить правило списания остатков.");



          await loadTenantProfile();



          return;



        }







        tenantStockDeductMode = data.tenant.order_stock_deduct_mode || mode;



        tenantStockDeductStatusId = data.tenant.order_stock_deduct_status_id != null



          ? Number(data.tenant.order_stock_deduct_status_id)



          : null;



        updateTenantCache(data.tenant);



        applyBrandFromTenant(data.tenant);



        if (settingsOrderStockDeductMode) {



          settingsOrderStockDeductMode.value = tenantStockDeductMode;



        }



        refreshOrderStockDeductControls(tenantStockDeductStatusId);



      };







      if (settingsOrderStockDeductMode) {



        settingsOrderStockDeductMode.addEventListener("change", saveOrderStockDeductSettings);



      }



      if (settingsOrderStockDeductStatus) {



        settingsOrderStockDeductStatus.addEventListener("change", () => {



          if (!settingsOrderStockDeductMode || settingsOrderStockDeductMode.value !== "on_status") return;



          saveOrderStockDeductSettings();



        });



      }



      refreshOrderStockDeductControls(tenantStockDeductStatusId);



    }







    const select = document.getElementById("tenantTimezoneSelect");



    if (select) {



      select.addEventListener("change", () => {



        saveTimezone(select.value);



      });



    }







    const brandSelect = document.getElementById("brandTimezoneSelect");



    if (brandSelect) {



      brandSelect.addEventListener("change", () => {



        saveTimezone(brandSelect.value);



      });



    }







    const brandPasswordBtn = document.getElementById("brandPasswordSave");



    if (brandPasswordBtn) {



      brandPasswordBtn.addEventListener("click", async () => {



        const passInput = document.getElementById("brandPassword");



        const passConfirmInput = document.getElementById("brandPasswordConfirm");



        const password = passInput ? passInput.value.trim() : "";



        const confirm = passConfirmInput ? passConfirmInput.value.trim() : "";



        if (!password || password.length < 6) {



          alert("\u041f\u0430\u0440\u043e\u043b\u044c \u0434\u043e\u043b\u0436\u0435\u043d \u0431\u044b\u0442\u044c \u043d\u0435 \u043a\u043e\u0440\u043e\u0447\u0435 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.");



          return;



        }



        if (password !== confirm) {



          alert("\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442.");



          return;



        }



        const res = await authFetch("/api/admin/tenant/password", {



          method: "POST",



          body: JSON.stringify({ password, password_confirm: confirm })



        });



        const data = await res.json();



        if (!data || !data.ok) {



          alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u043e\u0431\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c.");



          return;



        }



        if (passInput) passInput.value = "";



        if (passConfirmInput) passConfirmInput.value = "";



        alert("\u041f\u0430\u0440\u043e\u043b\u044c \u043e\u0431\u043d\u043e\u0432\u043b\u0435\u043d.");



      });



    }







    // ========================================



    // Delivery Settings



    // ========================================



    const settingsDeliveryTabsHeader = document.getElementById("settingsDeliveryTabsHeader");



    const settingsDeliveryTabsHomeBtn = document.getElementById("settingsDeliveryTabsHomeBtn");



    const settingsDeliveryTabs = document.getElementById("settingsDeliveryTabs");



    const settingsDeliveryHome = document.getElementById("settingsDeliveryHome");



    const settingsDeliveryHomeList = document.getElementById("settingsDeliveryHomeList");



    const settingsDeliveryHomeEmpty = document.getElementById("settingsDeliveryHomeEmpty");



    const settingsDeliveryZonesHomeList = document.getElementById("settingsDeliveryZonesHomeList");



    const settingsDeliveryZonesHomeEmpty = document.getElementById("settingsDeliveryZonesHomeEmpty");



    const deliverySettingsList = settingsDeliveryHomeList;



    const deliveryEmpty = settingsDeliveryHomeEmpty;



    const settingsDeliveryEmpty = settingsDeliveryHome;



    const settingsDeliveryPanel = document.getElementById("settingsDeliveryPanel");



    const settingsDeliveryFooter = document.getElementById("settingsDeliveryFooter");



    const settingsDeliveryZonePanel = document.getElementById("settingsDeliveryZonePanel");



    const settingsDeliveryZoneFooter = document.getElementById("settingsDeliveryZoneFooter");



    const settingsDeliveryMapConfigPanel = document.getElementById("settingsDeliveryMapConfigPanel");



    const settingsDeliveryMapConfigFooter = document.getElementById("settingsDeliveryMapConfigFooter");



    const appModalEl = document.getElementById("appModal");



    const appModalBodyEl = document.getElementById("appModalBody");



    const settingsDeliverySubtitle = document.getElementById("settingsDeliverySubtitle");



    const settingsDeliveryZoneSubtitle = document.getElementById("settingsDeliveryZoneSubtitle");



    const settingsDeliveryMapConfigSubtitle = document.getElementById("settingsDeliveryMapConfigSubtitle");



    const settingsDeliveryName = document.getElementById("settingsDeliveryName");



    const settingsDeliveryEtaMinutes = document.getElementById("settingsDeliveryEtaMinutes");



    const settingsDeliveryPriceTiers = document.getElementById("settingsDeliveryPriceTiers");



    const settingsDeliveryAddTierBtn = document.getElementById("settingsDeliveryAddTierBtn");



    const settingsDeliveryCost = document.getElementById("settingsDeliveryCost");



    const settingsDeliveryMinOrder = document.getElementById("settingsDeliveryMinOrder");



    const settingsDeliveryFreeFrom = document.getElementById("settingsDeliveryFreeFrom");



    const settingsDeliveryActive = document.getElementById("settingsDeliveryActive");



    const settingsDeliverySaveBtn = document.getElementById("settingsDeliverySaveBtn");



    const settingsDeliverySaveText = document.getElementById("settingsDeliverySaveText");



    const settingsDeliveryResetBtn = document.getElementById("settingsDeliveryResetBtn");



    const settingsDeliveryDeleteBtn = document.getElementById("settingsDeliveryDeleteBtn");



    const settingsDeliveryStoresTriggerBtn = document.getElementById("settingsDeliveryStoresTriggerBtn");



    const deliveryStoresList = document.getElementById("deliveryStoresList");



    const settingsDeliveryDefaultStoreSelector = document.getElementById("settingsDeliveryDefaultStoreSelector");



    const settingsDeliveryDefaultStore = document.getElementById("settingsDeliveryDefaultStore");



    const settingsDeliveryDefaultStoreTrigger = document.getElementById("settingsDeliveryDefaultStoreTrigger");



    const settingsDeliveryDefaultStoreValue = document.getElementById("settingsDeliveryDefaultStoreValue");



    const settingsDeliveryDefaultStoreMenu = document.getElementById("settingsDeliveryDefaultStoreMenu");



    const settingsDeliveryMapConfigGuide = document.getElementById("settingsDeliveryMapConfigGuide");



    const settingsDeliveryMapAccountAddBtn = document.getElementById("settingsDeliveryMapAccountAddBtn");



    const settingsDeliveryMapAccountAddWrap = document.getElementById("settingsDeliveryMapAccountAddWrap");



    const settingsDeliveryMapAccountAddApiKey = document.getElementById("settingsDeliveryMapAccountAddApiKey");



    const settingsDeliveryMapAccountAddLogin = document.getElementById("settingsDeliveryMapAccountAddLogin");



    const settingsDeliveryMapAccountAddPassword = document.getElementById("settingsDeliveryMapAccountAddPassword");



    const settingsDeliveryMapAccountAddConfirmBtn = document.getElementById("settingsDeliveryMapAccountAddConfirmBtn");



    const settingsDeliveryMapAccountAddCancelBtn = document.getElementById("settingsDeliveryMapAccountAddCancelBtn");



    const settingsDeliveryMapAccountsList = document.getElementById("settingsDeliveryMapAccountsList");



    const settingsDeliveryMapAccountsEmpty = document.getElementById("settingsDeliveryMapAccountsEmpty");



    const settingsDeliveryMapConfigSaveBtn = document.getElementById("settingsDeliveryMapConfigSaveBtn");



    const settingsDeliveryMapConfigResetBtn = document.getElementById("settingsDeliveryMapConfigResetBtn");



    const settingsDeliveryZoneInfoBtn = document.getElementById("settingsDeliveryZoneInfoBtn");



    const settingsDeliveryZoneInfoPopover = document.getElementById("settingsDeliveryZoneInfoPopover");



    const settingsDeliveryZoneGeometryHint = document.getElementById("settingsDeliveryZoneGeometryHint");



    const settingsDeliveryZoneName = document.getElementById("settingsDeliveryZoneName");



    const settingsDeliveryZoneColorWrap = document.getElementById("settingsDeliveryZoneColorWrap");



    const settingsDeliveryZoneColor = document.getElementById("settingsDeliveryZoneColor");



    const settingsDeliveryZoneColorTrigger = document.getElementById("settingsDeliveryZoneColorTrigger");



    const settingsDeliveryZoneColorPreview = document.getElementById("settingsDeliveryZoneColorPreview");



    const settingsDeliveryZoneColorValue = document.getElementById("settingsDeliveryZoneColorValue");



    const settingsDeliveryZoneColorPopover = document.getElementById("settingsDeliveryZoneColorPopover");



    const settingsDeliveryZoneColorPresets = document.getElementById("settingsDeliveryZoneColorPresets");



    const settingsDeliveryZoneColorCustomBtn = document.getElementById("settingsDeliveryZoneColorCustomBtn");



    const settingsDeliveryZoneColorEditor = document.getElementById("settingsDeliveryZoneColorEditor");



    const settingsDeliveryZoneColorEditorBackBtn = document.getElementById("settingsDeliveryZoneColorEditorBackBtn");



    const settingsDeliveryZoneColorEditorDoneBtn = document.getElementById("settingsDeliveryZoneColorEditorDoneBtn");



    const settingsDeliveryZoneColorEditorPreview = document.getElementById("settingsDeliveryZoneColorEditorPreview");



    const settingsDeliveryZoneColorEditorValue = document.getElementById("settingsDeliveryZoneColorEditorValue");



    const settingsDeliveryZoneEtaMinutes = document.getElementById("settingsDeliveryZoneEtaMinutes");



    const settingsDeliveryZoneActive = document.getElementById("settingsDeliveryZoneActive");



    const settingsDeliveryZoneStoresTriggerBtn = document.getElementById("settingsDeliveryZoneStoresTriggerBtn");



    const deliveryZoneStoresList = document.getElementById("deliveryZoneStoresList");



    const settingsDeliveryZonePriceTiers = document.getElementById("settingsDeliveryZonePriceTiers");



    const settingsDeliveryZoneAddTierBtn = document.getElementById("settingsDeliveryZoneAddTierBtn");



    const settingsDeliveryZoneEditBtn = document.getElementById("settingsDeliveryZoneEditBtn");



    const settingsDeliveryZoneSaveBtn = document.getElementById("settingsDeliveryZoneSaveBtn");



    const settingsDeliveryZoneSaveText = document.getElementById("settingsDeliveryZoneSaveText");



    const settingsDeliveryZoneResetBtn = document.getElementById("settingsDeliveryZoneResetBtn");



    const settingsDeliveryZoneDeleteBtn = document.getElementById("settingsDeliveryZoneDeleteBtn");



    const settingsDeliveryZoneMapOverlay = document.getElementById("settingsDeliveryZoneMapOverlay");



    const settingsDeliveryZoneMapHint = document.getElementById("settingsDeliveryZoneMapHint");



    const settingsDeliveryZoneUndoBtn = document.getElementById("settingsDeliveryZoneUndoBtn");



    const settingsDeliveryZoneClearPointsBtn = document.getElementById("settingsDeliveryZoneClearPointsBtn");



    const settingsDeliveryZoneAddPolygonBtn = document.getElementById("settingsDeliveryZoneAddPolygonBtn");



    const settingsDeliveryZoneRemovePolygonBtn = document.getElementById("settingsDeliveryZoneRemovePolygonBtn");



    const settingsDeliveryZonePointMenu = document.getElementById("settingsDeliveryZonePointMenu");



    const settingsDeliveryZonePointMenuFinishBtn = document.getElementById("settingsDeliveryZonePointMenuFinishBtn");



    const settingsDeliveryZonePointMenuContinueBtn = document.getElementById("settingsDeliveryZonePointMenuContinueBtn");



    const settingsDeliveryZonePointMenuRemoveLastBtn = document.getElementById("settingsDeliveryZonePointMenuRemoveLastBtn");



    const settingsDeliveryZoneContextMenu = document.getElementById("settingsDeliveryZoneContextMenu");



    const settingsDeliveryZoneContextEditBtn = document.getElementById("settingsDeliveryZoneContextEditBtn");



    const settingsDeliveryZoneContextDeleteBtn = document.getElementById("settingsDeliveryZoneContextDeleteBtn");







    function ensureSystemMapPolygonField() {



      if (systemDeliveryZonePolygonCard) {



        systemDeliveryZonePolygonCard.classList.add("hidden");



      }



      if (systemDeliveryZonePolygonPanel) {



        systemDeliveryZonePolygonPanel.classList.add("hidden");



      }



      if (settingsSystemMapPolygonProvider || !systemMapPanel) {



        return settingsSystemMapPolygonProvider;



      }



      const layout = systemMapPanel.querySelector(".settings-system-map-layout");



      if (!layout) return null;



      const group = document.createElement("div");



      group.className = "settings-system-map-group";



      group.innerHTML = `



        <div class="settings-system-map-group-title">ПОЛИГОНЫ ДОСТАВКИ</div>



        <div class="settings-site-field">



          <label class="field-label">PROVIDER</label>



          <span class="field-hint">Инструмент рисования и редактирования зон. Отдельная регистрация не нужна.</span>



          <input class="control" type="text" id="settingsSystemMapPolygonProvider" placeholder="Leaflet-Geoman" autocomplete="off" readonly onfocus="this.removeAttribute('readonly')" />



        </div>



      `;



      layout.appendChild(group);



      settingsSystemMapPolygonProvider = group.querySelector("#settingsSystemMapPolygonProvider");



      if (settingsSystemMapPolygonProvider) {



        settingsSystemMapPolygonProvider.disabled = !systemMapDraftMode;



        settingsSystemMapPolygonProvider.readOnly = !systemMapDraftMode;



        settingsSystemMapPolygonProvider.addEventListener("input", () => {



          if (!systemMapDraftMode) return;



          resetSystemMapCancelButton();



        });



      }



      return settingsSystemMapPolygonProvider;



    }







    ensureSystemMapPolygonField();







    const deliverySettingsState = {



      loaded: false,



      items: [],



      selectedId: null,



      snapshot: null,



      mode: "view"



    };



    const deliveryTabsState = {



      tabs: [],



      activeKey: ""



    };







    if (settingsDeliveryTabs) {



      settingsDeliveryTabs.addEventListener("wheel", (event) => {



        if (event.deltaY === 0) return;



        event.preventDefault();



        settingsDeliveryTabs.scrollLeft += event.deltaY;



      }, { passive: false });



    }







    function createEmptyDeliveryMapAccountDraft() {



      return {



        id: "",



        api_key: "",



        login: "",



        password: "",



        is_active: false



      };



    }







    function cloneDeliveryMapAccountDraft(draft) {



      const source = draft && typeof draft === "object" ? draft : {};



      return {



        id: String(source.id || ""),



        api_key: String(source.api_key || ""),



        login: String(source.login || ""),



        password: String(source.password || ""),



        is_active: Boolean(source.is_active)



      };



    }







    function cloneDeliveryMapAccounts(items) {



      return Array.isArray(items) ? items.map((item) => cloneDeliveryMapAccountDraft(item)) : [];



    }







    function createEmptyDeliveryZoneTierDraft() {



      return {



        min_order_amount: "",



        delivery_cost: ""



      };



    }







    function cloneDeliveryZoneTierDraft(tier) {



      const source = tier && typeof tier === "object" ? tier : {};



      return {



        min_order_amount: String(source.min_order_amount ?? ""),



        delivery_cost: String(source.delivery_cost ?? "")



      };



    }







    function normalizeDeliveryZone(zone) {



      const source = zone && typeof zone === "object" ? zone : {};



      const normalizedId = Number(source.id);



      return {



        ...source,



        id: Number.isFinite(normalizedId) ? normalizedId : 0,



        name: String(source.name || ""),



        color: String(source.color || "#ff7a00").trim() || "#ff7a00",



        eta_minutes: source.eta_minutes == null || source.eta_minutes === "" ? null : Number(source.eta_minutes) || 0,



        is_active: Number(source.is_active) === 1 ? 1 : 0,



        store_ids: Array.isArray(source.store_ids)



          ? source.store_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)



          : [],



        price_tiers: Array.isArray(source.price_tiers)



          ? source.price_tiers.map((tier) => ({



            min_order_amount: tier && tier.min_order_amount != null ? Number(tier.min_order_amount) || 0 : 0,



            delivery_cost: tier && tier.delivery_cost != null ? Number(tier.delivery_cost) || 0 : 0,



            sort_order: tier && tier.sort_order != null ? Number(tier.sort_order) || 0 : 0



          }))



          : [],



        geometry: normalizeDeliveryZoneGeometryValue(source.geometry)



      };



    }







    function createDeliveryZoneDraftFromZone(zone) {



      const normalized = normalizeDeliveryZone(zone);



      return {



        name: String(normalized.name || ""),



        color: String(normalized.color || "#ff7a00"),



        eta_minutes: normalized.eta_minutes == null ? "" : String(normalized.eta_minutes),



        is_active: Number(normalized.is_active) === 1,



        store_ids: Array.isArray(normalized.store_ids) ? normalized.store_ids.slice() : [],



        price_tiers: Array.isArray(normalized.price_tiers) && normalized.price_tiers.length



          ? normalized.price_tiers.map((tier) => cloneDeliveryZoneTierDraft(tier))



          : [createEmptyDeliveryZoneTierDraft()],



        geometry: normalizeDeliveryZoneGeometryValue(normalized.geometry)



      };



    }







    function createEmptyDeliveryZoneDraft() {



      return {



        name: "",



        color: "#ff7a00",



        eta_minutes: "",



        is_active: true,



        store_ids: [],



        price_tiers: [createEmptyDeliveryZoneTierDraft()],



        geometry: null



      };



    }







    function cloneDeliveryZoneDraft(draft) {



      const source = draft && typeof draft === "object" ? draft : {};



      return {



        name: String(source.name || ""),



        color: String(source.color || "#ff7a00"),



        eta_minutes: String(source.eta_minutes ?? ""),



        is_active: Boolean(source.is_active),



        store_ids: Array.isArray(source.store_ids) ? source.store_ids.slice() : [],



        price_tiers: Array.isArray(source.price_tiers) && source.price_tiers.length



          ? source.price_tiers.map((tier) => cloneDeliveryZoneTierDraft(tier))



          : [createEmptyDeliveryZoneTierDraft()],



        geometry: normalizeDeliveryZoneGeometryValue(source.geometry)



      };



    }







    function serializeDeliveryZoneDraft(draft) {



      const source = cloneDeliveryZoneDraft(draft);



      return JSON.stringify({



        ...source,



        store_ids: source.store_ids.slice().sort((a, b) => a - b),



      });



    }







    function createEmptyDeliveryZoneUiState(options = {}) {



      const nextMode = String(options.mode || "").trim() || "placing";



      return {



        mode: nextMode,



        draft_points: Array.isArray(options.draft_points)



          ? options.draft_points



            .map((point) => ({



              lat: Number(point && point.lat),



              lng: Number(point && point.lng),



            }))



            .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))



          : [],



        selected_polygon_index: Number.isInteger(options.selected_polygon_index)



          ? Number(options.selected_polygon_index)



          : -1,



      };



    }







    function cloneDeliveryZoneUiState(uiState) {



      const source = uiState && typeof uiState === "object" ? uiState : {};



      return createEmptyDeliveryZoneUiState(source);



    }







    function ensureDeliveryZoneTabUiState(tab) {



      if (!isDeliveryZoneTab(tab)) {



        return createEmptyDeliveryZoneUiState({ mode: "idle" });



      }



      if (!tab.uiState || typeof tab.uiState !== "object") {



        const polygonsCount = countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry);



        tab.uiState = createEmptyDeliveryZoneUiState({



          mode: polygonsCount > 0 ? "view" : "placing",



          selected_polygon_index: polygonsCount > 0 ? 0 : -1,



        });



      }



      tab.uiState = cloneDeliveryZoneUiState(tab.uiState);



      if (



        tab.uiState.mode !== "placing"



        && tab.uiState.mode !== "editing"



        && tab.uiState.mode !== "view"



        && tab.uiState.mode !== "idle"



      ) {



        tab.uiState.mode = countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry) > 0 ? "view" : "placing";



      }



      return tab.uiState;



    }







    function serializeDeliveryZoneUiState(uiState) {



      const source = cloneDeliveryZoneUiState(uiState);



      return JSON.stringify({



        mode: source.mode,



        draft_points: source.draft_points,



      });



    }







    function normalizeDeliveryZoneGeometryValue(value) {



      let source = value;



      if (typeof source === "string") {



        try {



          source = JSON.parse(source);



        } catch (_) {



          return null;



        }



      }



      if (!source || typeof source !== "object") return null;



      if (source.type === "Feature") {



        source = source.geometry;



      }



      if (!source || typeof source !== "object") return null;



      const geometryType = String(source.type || "").trim();



      if (geometryType === "Polygon" && Array.isArray(source.coordinates)) {



        return {



          type: "MultiPolygon",



          coordinates: [source.coordinates]



        };



      }



      if (geometryType !== "MultiPolygon" || !Array.isArray(source.coordinates)) return null;



      return {



        type: "MultiPolygon",



        coordinates: source.coordinates



      };



    }







    function normalizeDeliveryMapAccountSummary(item) {



      const source = item && typeof item === "object" ? item : {};



      return {



        id: String(source.id || ""),



        is_active: Boolean(source.is_active),



        api_key: String(source.api_key || ""),



        api_key_masked: String(source.api_key_masked || ""),



        has_login: Boolean(source.has_login),



        has_password: Boolean(source.has_password)



      };



    }







    function buildDeliveryMapGuideText(providerName) {



      const normalizedProvider = String(providerName || "").trim();



      if (normalizedProvider.toLowerCase() === "thunderforest") {



        return "Зарегистрируйтесь на thunderforest.com, откройте Dashboard -> API Keys, скопируйте ключ и добавьте его ниже. Логин и пароль можно сохранить рядом как памятку.";



      }



      if (normalizedProvider) {



        return `Провайдер карты: ${normalizedProvider}. Добавьте API key ниже; логин и пароль можно сохранить рядом как памятку.`;



      }



      return "Добавьте API key ниже; логин и пароль можно сохранить рядом как памятку.";



    }







    function maskDeliveryMapSecret(value) {



      const raw = String(value || "").trim();



      if (!raw || raw === "__saved__") return "";



      if (raw.length <= 2) return `${raw.slice(0, 1)}•`;



      if (raw.length <= 8) return `${raw.slice(0, 1)}••••${raw.slice(-1)}`;



      return `${raw.slice(0, 4)}••••${raw.slice(-4)}`;



    }







    function isDeliveryMapConfigTab(tab) {



      return Boolean(tab && String(tab.key || "") === DELIVERY_MAP_CONFIG_TAB_KEY);



    }







    function createDeliveryMapConfigTab() {



      return {



        key: DELIVERY_MAP_CONFIG_TAB_KEY,



        entityType: "map-config",



        id: null,



        mode: "map-config",



        snapshot: null,



        draft: null



      };



    }







    function getDeliveryMapConfigTab() {



      return getDeliveryTabByKey(DELIVERY_MAP_CONFIG_TAB_KEY);



    }







    function clearDeliveryMapRevealState() {



      deliveryMapAccountsRevealState.clear();



    }







    function resetDeliveryMapAccountsTransientState() {



      deliveryMapAccountsAddMode = false;



      deliveryMapAccountsAddDraft = createEmptyDeliveryMapAccountDraft();



      deliveryMapAccountsEditId = "";



      deliveryMapAccountsEditDraft = createEmptyDeliveryMapAccountDraft();



      clearDeliveryMapRevealState();



    }







    function buildDeliveryMapAccountClientId() {



      return `map-account-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;



    }







    function setActiveDeliveryMapDraftAccount(accountId) {



      const targetId = String(accountId || "");



      deliveryMapAccountsDraft = cloneDeliveryMapAccounts(deliveryMapAccountsDraft).map((item, index) => ({



        ...item,



        is_active: targetId ? String(item.id || "") === targetId : index === 0



      }));



    }







    function getDeliveryMapAccountDraftById(accountId) {



      return cloneDeliveryMapAccounts(deliveryMapAccountsDraft).find((item) => String(item.id || "") === String(accountId || "")) || null;



    }







    function applyDeliveryMapAccountSummaryMeta(summary, fullItem = null) {



      const source = summary && typeof summary === "object" ? summary : {};



      const revealSource = fullItem && typeof fullItem === "object" ? fullItem : null;



      return {



        id: String(source.id || (revealSource && revealSource.id) || ""),



        is_active: Boolean(source.is_active || (revealSource && revealSource.is_active)),



        api_key: String(source.api_key || (revealSource && revealSource.api_key) || ""),



        api_key_masked: String(source.api_key_masked || ""),



        has_login: Boolean(source.has_login || (revealSource && revealSource.login)),



        has_password: Boolean(source.has_password || (revealSource && revealSource.password))



      };



    }







    function getDeliveryMapRevealEntry(accountId) {



      return deliveryMapAccountsRevealState.get(String(accountId || "")) || null;



    }







    function setDeliveryMapRevealEntry(accountId, payload) {



      const key = String(accountId || "");



      if (!key) return;



      deliveryMapAccountsRevealState.set(key, payload && typeof payload === "object" ? payload : {});



    }







    function removeDeliveryMapRevealEntry(accountId) {



      deliveryMapAccountsRevealState.delete(String(accountId || ""));



    }







    if (settingsDeliveryMapSearchInput) {



      settingsDeliveryMapSearchInput.addEventListener("input", () => {



        syncDeliveryMapSearchClearButton();



        if (!String(settingsDeliveryMapSearchInput.value || "").trim()) {



          closeDeliveryMapSearchPopover();



        }



      });



      settingsDeliveryMapSearchInput.addEventListener("keydown", (event) => {



        if (event.key !== "Enter") return;



        event.preventDefault();



        searchDeliveryMapCities();



      });



    }



    if (settingsDeliveryMapSearchClear) {



      settingsDeliveryMapSearchClear.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        if (settingsDeliveryMapSearchInput) {



          settingsDeliveryMapSearchInput.value = "";



          settingsDeliveryMapSearchInput.focus();



        }



        closeDeliveryMapSearchPopover();



        if (searchedMapCity) {



          searchedMapCity = null;



          refreshDeliveryMapSelection();



        }



        syncDeliveryMapSearchClearButton();



      });



    }



    if (settingsDeliveryCityChip) {



      settingsDeliveryCityChip.addEventListener("click", (event) => {



        event.stopPropagation();



        if (settingsDeliveryCitySelector && settingsDeliveryCitySelector.classList.contains("hidden")) return;



        const isOpen = settingsDeliveryCitySelector && settingsDeliveryCitySelector.classList.contains("is-open");



        if (isOpen) {



          closeDeliveryCityDropdown();



          return;



        }



        closeDeliveryMapSearchPopover();



        renderDeliveryCitySelector();



        if (settingsDeliveryCitySelector) settingsDeliveryCitySelector.classList.add("is-open");



        settingsDeliveryCityChip.setAttribute("aria-expanded", "true");



      });



    }



    if (settingsDeliveryMapConfigBtn) {



      settingsDeliveryMapConfigBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        if (settingsDeliveryMapConfigBtn.classList.contains("hidden")) return;



        openDeliveryMapConfigTab();



      });



    }



    document.addEventListener("click", (event) => {



      const target = event.target;



      if (settingsDeliveryCitySelector && !settingsDeliveryCitySelector.contains(target)) {



        closeDeliveryCityDropdown();



      }



      if (settingsDeliveryMapSearchWrap && !settingsDeliveryMapSearchWrap.contains(target)) {



        closeDeliveryMapSearchPopover();



      }



      if (



        settingsDeliveryZoneInfoPopover



        && !settingsDeliveryZoneInfoPopover.classList.contains("hidden")



        && settingsDeliveryZoneInfoBtn



        && !settingsDeliveryZoneInfoPopover.contains(target)



        && !settingsDeliveryZoneInfoBtn.contains(target)



      ) {



        closeDeliveryZoneInfoPopover();



      }



      if (



        settingsDeliveryZoneColorWrap



        && settingsDeliveryZoneColorPopover



        && !settingsDeliveryZoneColorPopover.classList.contains("hidden")



        && !settingsDeliveryZoneColorWrap.contains(target)



      ) {



        closeDeliveryZoneColorPopover();



      }



      if (



        settingsDeliveryZonePointMenu



        && !settingsDeliveryZonePointMenu.classList.contains("hidden")



        && !settingsDeliveryZonePointMenu.contains(target)



      ) {



        closeDeliveryZonePointMenu();



      }



      if (



        settingsDeliveryZoneContextMenu



        && !settingsDeliveryZoneContextMenu.classList.contains("hidden")



        && !settingsDeliveryZoneContextMenu.contains(target)



      ) {



        closeDeliveryZoneContextMenu();



      }



      const storeAddressWraps = [settingsStoreCityWrap, settingsStoreAddressLookupWrap, settingsStoreAddressWrap, settingsStoreHouseWrap].filter(Boolean);



      if (storeAddressWraps.length && !storeAddressWraps.some((wrap) => wrap.contains(target))) {



        closeStoreAddressSuggestPopover();



      }



      if (



        settingsStoreTimezoneSelector



        && settingsStoreTimezoneSelector.classList.contains("is-open")



        && !settingsStoreTimezoneSelector.contains(target)



      ) {



        closeStoreTimezoneDropdown();



      }



    });



    document.addEventListener("keydown", (event) => {



      if (event.key !== "Escape") return;



      closeDeliveryCityDropdown();



      closeDeliveryMapSearchPopover();



      closeDeliveryZoneInfoPopover();



      closeDeliveryZoneColorPopover();



      closeDeliveryZonePointMenu();



      closeDeliveryZoneContextMenu();



      closeStoreAddressSuggestPopover();



      closeStoreTimezoneDropdown();



    });



    setDeliveryMapSearchEnabled(false);



    closeDeliveryMapSearchPopover();



    syncDeliveryMapSearchClearButton();



    renderDeliveryCitySelector();



    syncDeliveryZoneColorTrigger(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value);



    renderDeliveryZoneStoresCheckboxes([]);



    closeDeliveryZoneInfoPopover();



    closeDeliveryZoneColorPopover();



    closeStoreAddressSuggestPopover();



    syncStoreAddressInputAvailability();







    function normalizeDeliverySetting(setting) {



      const source = setting && typeof setting === "object" ? setting : {};



      const normalizedId = Number(source.id);



      const defaultStoreId = source.default_store_id == null ? null : Number(source.default_store_id);



      const etaMinutes = source.eta_minutes == null || source.eta_minutes === "" ? null : Number(source.eta_minutes);



      const priceTiers = Array.isArray(source.price_tiers) && source.price_tiers.length



        ? source.price_tiers.map((tier) => ({



          min_order_amount: tier && tier.min_order_amount != null ? Number(tier.min_order_amount) || 0 : 0,



          delivery_cost: tier && tier.delivery_cost != null ? Number(tier.delivery_cost) || 0 : 0,



          sort_order: tier && tier.sort_order != null ? Number(tier.sort_order) || 0 : 0,



        }))



        : [



          {



            min_order_amount: source.min_order_amount == null ? 0 : Number(source.min_order_amount) || 0,



            delivery_cost: source.delivery_cost == null ? 0 : Number(source.delivery_cost) || 0,



            sort_order: 0,



          },



          ...(source.free_delivery_from == null ? [] : [{



            min_order_amount: Number(source.free_delivery_from) || 0,



            delivery_cost: 0,



            sort_order: 1,



          }]),



        ];



      priceTiers.sort((left, right) => {



        if (left.min_order_amount !== right.min_order_amount) {



          return left.min_order_amount - right.min_order_amount;



        }



        if ((left.sort_order || 0) !== (right.sort_order || 0)) {



          return (left.sort_order || 0) - (right.sort_order || 0);



        }



        return left.delivery_cost - right.delivery_cost;



      });



      const firstTier = priceTiers[0] || { min_order_amount: 0, delivery_cost: 0 };



      const freeTier = priceTiers.find((tier) => Number(tier.delivery_cost || 0) <= 0) || null;



      return {



        ...source,



        id: Number.isFinite(normalizedId) ? normalizedId : 0,



        eta_minutes: Number.isFinite(etaMinutes) ? etaMinutes : null,



        delivery_cost: Number(firstTier.delivery_cost || 0),



        min_order_amount: Number(firstTier.min_order_amount || 0),



        free_delivery_from: freeTier ? Number(freeTier.min_order_amount || 0) : null,



        is_active: Number(source.is_active) === 1 ? 1 : 0,



        default_store_id: Number.isFinite(defaultStoreId) && defaultStoreId > 0 ? defaultStoreId : null,



        store_ids: Array.isArray(source.store_ids)



          ? source.store_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)



          : [],



        price_tiers: priceTiers,



      };



    }







    function createDeliveryDraftFromSetting(setting) {



      const normalized = normalizeDeliverySetting(setting);



      return {



        name: String(normalized.name || ""),



        eta_minutes: normalized.eta_minutes == null ? "" : String(normalized.eta_minutes),



        delivery_cost: normalized.delivery_cost ? String(normalized.delivery_cost) : "",



        min_order_amount: normalized.min_order_amount ? String(normalized.min_order_amount) : "",



        free_delivery_from: normalized.free_delivery_from == null ? "" : String(normalized.free_delivery_from),



        is_active: Number(normalized.is_active) === 1,



        store_ids: Array.isArray(normalized.store_ids) ? normalized.store_ids.slice() : [],



        default_store_id: normalized.default_store_id,



        price_tiers: Array.isArray(normalized.price_tiers) && normalized.price_tiers.length



          ? normalized.price_tiers.map((tier) => cloneDeliveryZoneTierDraft(tier))



          : [createEmptyDeliveryZoneTierDraft()],



      };



    }







    function createEmptyDeliveryDraft() {



      return {



        name: "",



        eta_minutes: "",



        delivery_cost: "",



        min_order_amount: "",



        free_delivery_from: "",



        is_active: true,



        store_ids: [],



        default_store_id: null,



        price_tiers: [createEmptyDeliveryZoneTierDraft()],



      };



    }







    function cloneDeliveryDraft(draft) {



      const source = draft && typeof draft === "object" ? draft : {};



      return {



        name: String(source.name || ""),



        eta_minutes: String(source.eta_minutes ?? ""),



        delivery_cost: String(source.delivery_cost || ""),



        min_order_amount: String(source.min_order_amount || ""),



        free_delivery_from: String(source.free_delivery_from || ""),



        is_active: Boolean(source.is_active),



        store_ids: Array.isArray(source.store_ids) ? source.store_ids.slice() : [],



        default_store_id: source.default_store_id == null ? null : Number(source.default_store_id),



        price_tiers: Array.isArray(source.price_tiers) && source.price_tiers.length



          ? source.price_tiers.map((tier) => cloneDeliveryZoneTierDraft(tier))



          : [createEmptyDeliveryZoneTierDraft()],



      };



    }







    function serializeDeliveryDraft(draft) {



      return JSON.stringify(cloneDeliveryDraft(draft));



    }







    function createDeliveryEditTab(setting) {



      const normalized = normalizeDeliverySetting(setting);



      return {



        key: `delivery:${normalized.id}`,



        entityType: "delivery",



        id: normalized.id,



        mode: "edit",



        snapshot: normalized,



        draft: createDeliveryDraftFromSetting(normalized)



      };



    }







    function createNewDeliveryTab() {



      return {



        key: DELIVERY_CREATE_TAB_KEY,



        entityType: "delivery",



        id: null,



        mode: "create",



        snapshot: null,



        draft: createEmptyDeliveryDraft()



      };



    }







    function isDeliveryZoneTab(tab) {



      return Boolean(tab && String(tab.entityType || "") === "zone");



    }







    function createDeliveryZoneEditTab(zone) {



      const normalized = normalizeDeliveryZone(zone);



      const polygonsCount = countDeliveryZonePolygons(normalized.geometry);



      return {



        key: `delivery-zone:${normalized.id}`,



        entityType: "zone",



        id: normalized.id,



        mode: "edit",



        snapshot: normalized,



        draft: createDeliveryZoneDraftFromZone(normalized),



        uiState: createEmptyDeliveryZoneUiState({



          mode: polygonsCount > 0 ? "view" : "placing",



          selected_polygon_index: polygonsCount > 0 ? 0 : -1,



        })



      };



    }







    function createNewDeliveryZoneTab() {



      return {



        key: DELIVERY_ZONE_CREATE_TAB_KEY,



        entityType: "zone",



        id: null,



        mode: "create",



        snapshot: null,



        draft: createEmptyDeliveryZoneDraft(),



        uiState: createEmptyDeliveryZoneUiState({ mode: "placing" })



      };



    }







    function getDeliveryTabTitle(tab) {



      if (isDeliveryMapConfigTab(tab)) return "Карта";



      if (!tab) return "Настройка доставки";



      const draftName = String(tab.draft && tab.draft.name || "").trim();



      if (draftName) return draftName;



      const snapshotName = String(tab.snapshot && tab.snapshot.name || "").trim();



      if (snapshotName) return snapshotName;



      return tab.mode === "create" ? "Новая настройка" : "Настройка доставки";



    }







    function syncDeliveryDraftLegacyFields(draft) {



      const normalized = normalizeDeliverySetting({



        delivery_cost: draft && draft.delivery_cost,



        min_order_amount: draft && draft.min_order_amount,



        free_delivery_from: draft && draft.free_delivery_from,



        price_tiers: draft && draft.price_tiers,



      });



      if (settingsDeliveryCost) settingsDeliveryCost.value = normalized.delivery_cost ? String(normalized.delivery_cost) : "";



      if (settingsDeliveryMinOrder) settingsDeliveryMinOrder.value = normalized.min_order_amount ? String(normalized.min_order_amount) : "";



      if (settingsDeliveryFreeFrom) settingsDeliveryFreeFrom.value = normalized.free_delivery_from == null ? "" : String(normalized.free_delivery_from);



    }







    function formatDeliverySettingTierSummary(setting) {



      const normalized = normalizeDeliverySetting(setting);



      const tiers = Array.isArray(normalized.price_tiers) ? normalized.price_tiers : [];



      if (!tiers.length) return "Нет тарифов";



      const firstTier = tiers[0] || {};



      const minOrder = Number(firstTier.min_order_amount) || 0;



      const deliveryCost = Number(firstTier.delivery_cost) || 0;



      return minOrder > 0



        ? `От ${minOrder} в‚Ѕ -> ${deliveryCost} в‚Ѕ`



        : `${deliveryCost} в‚Ѕ доставка`;



    }







    function buildDeliverySettingPayloadFromItem(setting, overrides = {}) {



      const normalized = normalizeDeliverySetting(setting);



      return {



        name: String(normalized.name || "").trim() || null,



        eta_minutes: normalized.eta_minutes == null || normalized.eta_minutes === "" ? null : Number(normalized.eta_minutes) || 0,



        delivery_cost: Number(normalized.delivery_cost) || 0,



        min_order_amount: Number(normalized.min_order_amount) || 0,



        free_delivery_from: normalized.free_delivery_from == null || normalized.free_delivery_from === "" ? null : Number(normalized.free_delivery_from) || 0,



        is_active: Object.prototype.hasOwnProperty.call(overrides, "is_active")



          ? (overrides.is_active ? 1 : 0)



          : (Number(normalized.is_active) === 1 ? 1 : 0),



        store_ids: Array.isArray(normalized.store_ids) ? normalized.store_ids.slice() : [],



        default_store_id: normalized.default_store_id,



        price_tiers: Array.isArray(normalized.price_tiers)



          ? normalized.price_tiers.map((tier) => ({



            min_order_amount: Number(tier && tier.min_order_amount) || 0,



            delivery_cost: Number(tier && tier.delivery_cost) || 0,



            sort_order: Number(tier && tier.sort_order) || 0,



          }))



          : [],



      };



    }







    function buildDeliveryZonePayloadFromItem(zone, overrides = {}) {



      const normalized = normalizeDeliveryZone(zone);



      return {



        name: String(normalized.name || "").trim() || null,



        color: String(normalized.color || "#ff7a00").trim() || "#ff7a00",



        eta_minutes: normalized.eta_minutes == null || normalized.eta_minutes === "" ? null : Number(normalized.eta_minutes) || 0,



        is_active: Object.prototype.hasOwnProperty.call(overrides, "is_active")



          ? (overrides.is_active ? 1 : 0)



          : (Number(normalized.is_active) === 1 ? 1 : 0),



        store_ids: Array.isArray(normalized.store_ids) ? normalized.store_ids.slice() : [],



        price_tiers: Array.isArray(normalized.price_tiers)



          ? normalized.price_tiers.map((tier) => ({



            min_order_amount: Number(tier && tier.min_order_amount) || 0,



            delivery_cost: Number(tier && tier.delivery_cost) || 0,



            sort_order: Number(tier && tier.sort_order) || 0,



          }))



          : [],



        geometry: normalizeDeliveryZoneGeometryValue(normalized.geometry),



      };



    }







    function stopDeliveryHomeActionEvent(event) {



      event.stopPropagation();



    }







    function handleDeliveryHomeRowKeydown(event, onOpen) {



      if (!event || typeof onOpen !== "function") return;



      if (event.key !== "Enter" && event.key !== " ") return;



      event.preventDefault();



      onOpen();



    }







    function createDeliveryHomeStatusSwitch(ariaLabel, checked, onChange) {



      const control = createSwitch("", checked, onChange);



      control.classList.add("settings-delivery-home-status-switch");



      const input = control.querySelector(".switch-input");



      if (input) {



        input.setAttribute("aria-label", ariaLabel);



      }



      control.addEventListener("click", stopDeliveryHomeActionEvent);



      control.addEventListener("keydown", stopDeliveryHomeActionEvent);



      control.addEventListener("pointerdown", stopDeliveryHomeActionEvent);



      return { control, input };



    }







    function upsertDeliverySettingInState(setting) {



      const normalized = normalizeDeliverySetting(setting);



      const nextItems = Array.isArray(deliverySettingsState.items) ? deliverySettingsState.items.slice() : [];



      const index = nextItems.findIndex((item) => Number(item && item.id) === normalized.id);



      if (index >= 0) {



        nextItems[index] = normalized;



      } else {



        nextItems.push(normalized);



      }



      deliverySettingsState.items = nextItems;



      return normalized;



    }







    async function toggleDeliverySettingActiveFromHome(settingId, checked) {



      const normalizedId = Number(settingId);



      if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;



      const current = (Array.isArray(deliverySettingsState.items) ? deliverySettingsState.items : [])



        .find((item) => Number(item && item.id) === normalizedId);



      if (!current) return null;



      const saveResult = await updateDeliverySetting(normalizedId, buildDeliverySettingPayloadFromItem(current, { is_active: checked }));



      if (!saveResult || !saveResult.ok || !saveResult.item) {



        return null;



      }



      upsertDeliverySettingInState(saveResult.item);



      syncDeliveryTabsWithItems(deliverySettingsState.items, deliveryZonesState.items);



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



      return normalizeDeliverySetting(saveResult.item);



    }







    async function toggleDeliveryZoneActiveFromHome(zoneId, checked) {



      const normalizedId = Number(zoneId);



      if (!Number.isFinite(normalizedId) || normalizedId <= 0) return null;



      const current = (Array.isArray(deliveryZonesState.items) ? deliveryZonesState.items : [])



        .find((item) => Number(item && item.id) === normalizedId);



      if (!current) return null;



      const saveResult = await updateDeliveryZone(normalizedId, buildDeliveryZonePayloadFromItem(current, { is_active: checked }));



      if (!saveResult || !saveResult.ok || !saveResult.item) {



        return null;



      }



      upsertDeliveryZoneInState(saveResult.item);



      syncDeliveryTabsWithItems(deliverySettingsState.items, deliveryZonesState.items);



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



      refreshDeliveryZoneLayers();



      return normalizeDeliveryZone(saveResult.item);



    }







    function getDeliveryTabByKey(key) {



      return deliveryTabsState.tabs.find((tab) => String(tab && tab.key || "") === String(key || "")) || null;



    }







    function getDeliveryTabById(id) {



      return deliveryTabsState.tabs.find((tab) => Number(tab && tab.id || 0) === Number(id || 0)) || null;



    }







    function getActiveDeliveryTab() {



      return getDeliveryTabByKey(deliveryTabsState.activeKey);



    }







    function getDeliveryTabByEntityId(entityType, id) {



      return deliveryTabsState.tabs.find((tab) => (



        String(tab && tab.entityType || "") === String(entityType || "")



        && Number(tab && tab.id || 0) === Number(id || 0)



      )) || null;



    }







    function getDeliveryTabById(id) {



      return getDeliveryTabByEntityId("delivery", id);



    }







    function getDeliveryZoneTabById(id) {



      return getDeliveryTabByEntityId("zone", id);



    }







    function getDeliveryTabTitle(tab) {



      if (isDeliveryMapConfigTab(tab)) return "Карта";



      if (isDeliveryZoneTab(tab)) {



        const zoneDraftName = String(tab && tab.draft && tab.draft.name || "").trim();



        if (zoneDraftName) return zoneDraftName;



        const zoneSnapshotName = String(tab && tab.snapshot && tab.snapshot.name || "").trim();



        if (zoneSnapshotName) return zoneSnapshotName;



        return tab && tab.mode === "create" ? "Новая зона" : "Зона доставки";



      }



      if (!tab) return "Настройка доставки";



      const draftName = String(tab.draft && tab.draft.name || "").trim();



      if (draftName) return draftName;



      const snapshotName = String(tab.snapshot && tab.snapshot.name || "").trim();



      if (snapshotName) return snapshotName;



      return tab.mode === "create" ? "Новая настройка" : "Настройка доставки";



    }







    function readDeliveryFormDraft() {



      const draft = {



        name: String(settingsDeliveryName && settingsDeliveryName.value || ""),



        eta_minutes: String(settingsDeliveryEtaMinutes && settingsDeliveryEtaMinutes.value || ""),



        delivery_cost: String(settingsDeliveryCost && settingsDeliveryCost.value || ""),



        min_order_amount: String(settingsDeliveryMinOrder && settingsDeliveryMinOrder.value || ""),



        free_delivery_from: String(settingsDeliveryFreeFrom && settingsDeliveryFreeFrom.value || ""),



        is_active: Boolean(settingsDeliveryActive && settingsDeliveryActive.checked),



        store_ids: getSelectedDeliveryStoreIds(),



        default_store_id: getSelectedDefaultDeliveryStoreId(),



        price_tiers: readDeliverySettingPriceTiersFromDom()



      };



      syncDeliveryDraftLegacyFields(draft);



      return draft;



    }







    function applyDeliveryFormDraft(tab) {



      const draft = cloneDeliveryDraft(tab && tab.draft ? tab.draft : createEmptyDeliveryDraft());



      if (settingsDeliverySubtitle) {



        const showCreateSubtitle = Boolean(tab && tab.mode === "create");



        settingsDeliverySubtitle.textContent = showCreateSubtitle ? "Новая настройка" : "";



        settingsDeliverySubtitle.classList.toggle("hidden", !showCreateSubtitle);



      }



      if (settingsDeliverySaveText) {



        settingsDeliverySaveText.textContent = tab && tab.mode === "create" ? "Создать" : "Сохранить";



      }



      if (settingsDeliveryDeleteBtn) {



        settingsDeliveryDeleteBtn.classList.toggle("hidden", !tab || tab.mode === "create");



      }



      if (settingsDeliveryName) settingsDeliveryName.value = draft.name;



      if (settingsDeliveryEtaMinutes) settingsDeliveryEtaMinutes.value = draft.eta_minutes;



      if (settingsDeliveryCost) settingsDeliveryCost.value = draft.delivery_cost;



      if (settingsDeliveryMinOrder) settingsDeliveryMinOrder.value = draft.min_order_amount;



      if (settingsDeliveryFreeFrom) settingsDeliveryFreeFrom.value = draft.free_delivery_from;



      if (settingsDeliveryActive) settingsDeliveryActive.checked = Boolean(draft.is_active);



      renderDeliverySettingPriceTiers(draft.price_tiers);



      syncDeliveryDraftLegacyFields(draft);



      renderDeliveryStoresCheckboxes(draft.store_ids, draft.default_store_id);



    }







    function updateActiveDeliveryDraft(patch = {}, options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return null;



      const nextDraft = {



        ...cloneDeliveryDraft(activeTab.draft || createEmptyDeliveryDraft()),



        ...patch,



      };



      activeTab.draft = cloneDeliveryDraft(nextDraft);



      syncDeliveryDraftLegacyFields(activeTab.draft);



      if (options.renderTiers) {



        renderDeliverySettingPriceTiers(activeTab.draft.price_tiers);



      }



      if (options.refreshTabs) {



        renderDeliveryTabs();



      }



      return activeTab.draft;



    }







    function persistActiveDeliveryDraft() {



      const activeTab = getActiveDeliveryTab();



      if (isDeliveryMapConfigTab(activeTab)) return;



      if (!activeTab || !settingsDeliveryPanel || settingsDeliveryPanel.classList.contains("hidden")) return;



      activeTab.draft = readDeliveryFormDraft();



    }







    function renderDeliveryTabs() {



      if (!settingsDeliveryTabs) return;



      settingsDeliveryTabs.innerHTML = "";



      deliveryTabsState.tabs.forEach((tab) => {



        const tabEl = document.createElement("div");



        tabEl.className = `product-tab${tab.key === deliveryTabsState.activeKey ? " is-active" : ""}`;



        tabEl.setAttribute("data-delivery-tab-key", tab.key);







        const titleEl = document.createElement("span");



        titleEl.className = "product-tab-title";



        titleEl.textContent = getDeliveryTabTitle(tab);







        const closeBtn = document.createElement("button");



        closeBtn.type = "button";



        closeBtn.className = "product-tab-close";



        closeBtn.setAttribute("data-delivery-tab-close", tab.key);



        closeBtn.setAttribute("aria-label", "Закрыть");



        closeBtn.textContent = "Г—";







        tabEl.appendChild(titleEl);



        tabEl.appendChild(closeBtn);



        settingsDeliveryTabs.appendChild(tabEl);



      });



      if (settingsDeliveryTabsHomeBtn) {



        settingsDeliveryTabsHomeBtn.classList.toggle("is-active", !deliveryTabsState.activeKey);



      }



    }







    function renderDeliveryHomeList(items) {



      if (!settingsDeliveryHomeList) return;



      settingsDeliveryHomeList.innerHTML = "";







      const list = Array.isArray(items) ? items : [];



      if (settingsDeliveryHomeEmpty) {



        settingsDeliveryHomeEmpty.classList.toggle("hidden", list.length > 0);



      }







      list.forEach((setting) => {



        const normalized = normalizeDeliverySetting(setting);



        const activeTab = getActiveDeliveryTab();



        const row = document.createElement("div");



        row.className = "delivery-home-card settings-card";



        row.setAttribute("role", "button");



        row.tabIndex = 0;



        row.dataset.id = String(normalized.id);



        row.classList.toggle("is-active", Boolean(activeTab && Number(activeTab.id || 0) === normalized.id));



        row.classList.toggle("is-disabled", Number(normalized.is_active) !== 1);







        const avatar = document.createElement("div");



        avatar.className = "product-avatar settings-delivery-home-card-avatar settings-delivery-home-card-avatar--setting";



        avatar.innerHTML = '<i class="fas fa-truck"></i>';







        const info = document.createElement("div");



        info.className = "delivery-home-card-info";







        const title = document.createElement("div");



        title.className = "delivery-home-card-title";



        title.textContent = normalized.name || `Настройка #${normalized.id}`;







        const subtitle = document.createElement("div");



        subtitle.className = "delivery-home-card-meta";



        const etaText = normalized.eta_minutes != null && normalized.eta_minutes !== ""



          ? `${normalized.eta_minutes} мин`



          : "Без времени";



        subtitle.textContent = `${formatDeliverySettingTierSummary(normalized)} • ${etaText}`;







        const action = document.createElement("div");



        action.className = "delivery-home-card-action";



        action.addEventListener("click", stopDeliveryHomeActionEvent);



        action.addEventListener("keydown", stopDeliveryHomeActionEvent);



        action.addEventListener("pointerdown", stopDeliveryHomeActionEvent);







        const switchState = createDeliveryHomeStatusSwitch(



          `Переключить активность условия доставки ${normalized.name || normalized.id}`,



          Number(normalized.is_active) === 1,



          async (nextChecked) => {



            if (switchState.input) {



              switchState.input.disabled = true;



            }



            const savedItem = await toggleDeliverySettingActiveFromHome(normalized.id, nextChecked);



            if (!savedItem) {



              if (switchState.input) {



                switchState.input.checked = !nextChecked;



                switchState.input.disabled = false;



              }



              alert("Не удалось изменить активность условия доставки.");



            }



          }



        );







        info.appendChild(title);



        info.appendChild(subtitle);



        action.appendChild(switchState.control);



        row.appendChild(avatar);



        row.appendChild(info);



        row.appendChild(action);



        row.addEventListener("click", () => {



          openDeliverySettingTab(normalized);



        });



        row.addEventListener("keydown", (event) => {



          handleDeliveryHomeRowKeydown(event, () => openDeliverySettingTab(normalized));



        });



        settingsDeliveryHomeList.appendChild(row);



      });



    }







    function countDeliveryZonePolygons(geometry) {



      const normalized = normalizeDeliveryZoneGeometryValue(geometry);



      return normalized && Array.isArray(normalized.coordinates) ? normalized.coordinates.length : 0;



    }







    function getDeliveryZoneTabUiState(tab) {



      return cloneDeliveryZoneUiState(ensureDeliveryZoneTabUiState(tab));



    }







    function setDeliveryZoneTabUiState(tab, patch = {}) {



      if (!isDeliveryZoneTab(tab)) return createEmptyDeliveryZoneUiState({ mode: "idle" });



      const current = ensureDeliveryZoneTabUiState(tab);



      tab.uiState = createEmptyDeliveryZoneUiState({



        ...current,



        ...patch,



      });



      return cloneDeliveryZoneUiState(tab.uiState);



    }







    function getActiveDeliveryZoneUiState() {



      const activeTab = getActiveDeliveryTab();



      return isDeliveryZoneTab(activeTab) ? getDeliveryZoneTabUiState(activeTab) : createEmptyDeliveryZoneUiState({ mode: "idle" });



    }







    function isDeliveryZonePlacingMode(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab)) return false;



      return String(getDeliveryZoneTabUiState(tab).mode || "") === "placing";



    }







    function isDeliveryZoneEditingMode(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab)) return false;



      return String(getDeliveryZoneTabUiState(tab).mode || "") === "editing";



    }







    function isDeliveryZoneViewMode(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab)) return false;



      return String(getDeliveryZoneTabUiState(tab).mode || "") === "view";



    }







    function getDeliveryZoneDraftPoints(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab)) return [];



      return getDeliveryZoneTabUiState(tab).draft_points || [];



    }







    function getDeliveryZoneSelectedPolygonIndex(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab)) return -1;



      const uiState = getDeliveryZoneTabUiState(tab);



      const polygonsCount = countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry);



      if (!polygonsCount) return -1;



      const rawIndex = Number(uiState.selected_polygon_index);



      if (!Number.isInteger(rawIndex) || rawIndex < 0) return 0;



      return Math.min(rawIndex, polygonsCount - 1);



    }







    function setActiveDeliveryZonePointMenu(open, latLng = null) {



      if (open) {



        closeDeliveryZoneContextMenu();



      }



      deliveryZonesState.pointMenuOpen = Boolean(open);



      deliveryZonesState.pointMenuLatLng = open && latLng ? {



        lat: Number(latLng.lat),



        lng: Number(latLng.lng),



      } : null;



      positionDeliveryZonePointMenu();



      syncDeliveryZoneMapOverlay();



    }







    function closeDeliveryZonePointMenu() {



      setActiveDeliveryZonePointMenu(false, null);



    }







    function positionDeliveryZoneContextMenu() {



      if (!settingsDeliveryZoneContextMenu) return;



      const shouldShow = Boolean(



        deliveryLeafletMap



        && settingsDeliveryMapBlock



        && deliveryZonesState.contextMenuOpen



        && deliveryZonesState.contextMenuLatLng



      );



      settingsDeliveryZoneContextMenu.classList.toggle("hidden", !shouldShow);



      if (!shouldShow) return;



      const anchor = window.L.latLng(deliveryZonesState.contextMenuLatLng.lat, deliveryZonesState.contextMenuLatLng.lng);



      const point = deliveryLeafletMap.latLngToContainerPoint(anchor);



      const mapRect = settingsDeliveryMapBlock.getBoundingClientRect();



      const menuRect = settingsDeliveryZoneContextMenu.getBoundingClientRect();



      const maxLeft = Math.max(12, mapRect.width - menuRect.width - 12);



      const maxTop = Math.max(12, mapRect.height - menuRect.height - 12);



      const left = Math.min(Math.max(12, point.x + 12), maxLeft);



      const top = Math.min(Math.max(12, point.y - 8), maxTop);



      settingsDeliveryZoneContextMenu.style.left = `${Math.round(left)}px`;



      settingsDeliveryZoneContextMenu.style.top = `${Math.round(top)}px`;



    }







    function setActiveDeliveryZoneContextMenu(open, zoneId = 0, latLng = null) {



      if (open) {



        closeDeliveryZonePointMenu();



      }



      deliveryZonesState.contextMenuOpen = Boolean(open);



      deliveryZonesState.contextMenuZoneId = open ? Number(zoneId || 0) : 0;



      deliveryZonesState.contextMenuLatLng = open && latLng ? {



        lat: Number(latLng.lat),



        lng: Number(latLng.lng),



      } : null;



      positionDeliveryZoneContextMenu();



    }







    function closeDeliveryZoneContextMenu() {



      deliveryZonesState.contextMenuOpen = false;



      deliveryZonesState.contextMenuZoneId = 0;



      deliveryZonesState.contextMenuLatLng = null;



      if (settingsDeliveryZoneContextMenu) {



        settingsDeliveryZoneContextMenu.classList.add("hidden");



      }



    }







    function getDeliveryZoneLastDraftPoint(tab = getActiveDeliveryTab()) {



      const points = getDeliveryZoneDraftPoints(tab);



      return points.length ? points[points.length - 1] : null;



    }







    function isDeliveryZoneTabDirty(tab) {



      if (!isDeliveryZoneTab(tab)) return false;



      const draft = cloneDeliveryZoneDraft(tab.draft);



      const snapshotDraft = tab.snapshot ? createDeliveryZoneDraftFromZone(tab.snapshot) : createEmptyDeliveryZoneDraft();



      if (serializeDeliveryZoneDraft(draft) !== serializeDeliveryZoneDraft(snapshotDraft)) {



        return true;



      }



      return getDeliveryZoneDraftPoints(tab).length > 0;



    }







    function formatDeliveryZoneTierSummary(zone) {



      const tiers = Array.isArray(zone && zone.price_tiers) ? zone.price_tiers : [];



      if (!tiers.length) return "Нет тарифов";



      const firstTier = tiers[0] || {};



      const minOrder = Number(firstTier.min_order_amount) || 0;



      const deliveryCost = Number(firstTier.delivery_cost) || 0;



      return minOrder > 0



        ? `От ${minOrder} в‚Ѕ в†’ ${deliveryCost} в‚Ѕ`



        : `${deliveryCost} в‚Ѕ доставка`;



    }







    function renderDeliveryZonesHomeList(items) {



      if (!settingsDeliveryZonesHomeList) return;



      settingsDeliveryZonesHomeList.innerHTML = "";



      const list = Array.isArray(items) ? items : [];



      if (settingsDeliveryZonesHomeEmpty) {



        settingsDeliveryZonesHomeEmpty.classList.toggle("hidden", list.length > 0);



      }







      list.forEach((zone) => {



        const normalized = normalizeDeliveryZone(zone);



        const activeTab = getActiveDeliveryTab();



        const row = document.createElement("div");



        row.className = "delivery-home-card settings-card settings-delivery-zone-card";



        row.setAttribute("role", "button");



        row.tabIndex = 0;



        row.dataset.id = String(normalized.id);



        row.classList.toggle("is-active", Boolean(isDeliveryZoneTab(activeTab) && Number(activeTab.id || 0) === normalized.id));



        row.classList.toggle("is-disabled", Number(normalized.is_active) !== 1);



        row.style.setProperty("--delivery-home-zone-color", normalized.color || "#ff7a00");







        const avatar = document.createElement("div");



        avatar.className = "product-avatar settings-delivery-home-card-avatar settings-delivery-home-card-avatar--zone";



        avatar.innerHTML = `<span class="delivery-home-card-swatch" style="background:${normalized.color || "#ff7a00"}"></span>`;







        const info = document.createElement("div");



        info.className = "delivery-home-card-info";







        const title = document.createElement("div");



        title.className = "delivery-home-card-title";



        title.textContent = normalized.name || `Зона #${normalized.id}`;







        const subtitle = document.createElement("div");



        subtitle.className = "delivery-home-card-meta";



        const etaText = normalized.eta_minutes != null && normalized.eta_minutes !== ""



          ? `${normalized.eta_minutes} мин`



          : "Без времени";



        subtitle.textContent = `${formatDeliveryZoneTierSummary(normalized)} • ${etaText}`;











        const action = document.createElement("div");



        action.className = "delivery-home-card-action";



        action.addEventListener("click", stopDeliveryHomeActionEvent);



        action.addEventListener("keydown", stopDeliveryHomeActionEvent);



        action.addEventListener("pointerdown", stopDeliveryHomeActionEvent);







        const switchState = createDeliveryHomeStatusSwitch(



          `Переключить активность зоны доставки ${normalized.name || normalized.id}`,



          Number(normalized.is_active) === 1,



          async (nextChecked) => {



            if (switchState.input) {



              switchState.input.disabled = true;



            }



            const savedZone = await toggleDeliveryZoneActiveFromHome(normalized.id, nextChecked);



            if (!savedZone) {



              if (switchState.input) {



                switchState.input.checked = !nextChecked;



                switchState.input.disabled = false;



              }



              alert("Не удалось изменить активность зоны доставки.");



            }



          }



        );







        info.appendChild(title);



        info.appendChild(subtitle);



        action.appendChild(switchState.control);



        row.appendChild(avatar);



        row.appendChild(info);



        row.appendChild(action);



        row.addEventListener("click", () => {



          openDeliveryZoneTab(normalized);



        });



        row.addEventListener("keydown", (event) => {



          handleDeliveryHomeRowKeydown(event, () => openDeliveryZoneTab(normalized));



        });



        settingsDeliveryZonesHomeList.appendChild(row);



      });



    }







    function renderDeliveryZoneStoresCheckboxes(storeIds = []) {



      if (!deliveryZoneStoresList) return;



      const normalizedIds = Array.from(new Set(



        (Array.isArray(storeIds) ? storeIds : [])



          .map((value) => Number(value))



          .filter((value) => Number.isFinite(value) && value > 0)



      ));



      deliveryZoneStoresList.dataset.selectedStoreIds = JSON.stringify(normalizedIds);



      deliveryZoneStoresList.innerHTML = "";



      const stores = storesState.items || [];



      if (!stores.length) {



        const empty = document.createElement("div");



        empty.className = "settings-delivery-zone-store-empty muted";



        empty.textContent = "Нет доступных филиалов";



        deliveryZoneStoresList.appendChild(empty);



        return;



      }



      if (!normalizedIds.length) {



        const empty = document.createElement("div");



        empty.className = "settings-delivery-zone-store-empty";



        empty.textContent = "Нажмите В«+В», чтобы выбрать филиалы";



        deliveryZoneStoresList.appendChild(empty);



        return;



      }



      normalizedIds.forEach((storeId) => {



        const store = stores.find((item) => Number(item && item.id) === storeId) || null;



        const row = document.createElement("div");



        row.className = "settings-delivery-zone-store-pill";



        row.setAttribute("data-zone-store-row", String(storeId));







        const icon = document.createElement("span");



        icon.className = "settings-delivery-zone-store-pill-icon";



        icon.innerHTML = '<i class="fas fa-store"></i>';







        const content = document.createElement("div");



        content.className = "settings-delivery-zone-store-pill-content";







        const title = document.createElement("span");



        title.className = "settings-delivery-zone-store-pill-title";



        title.textContent = store && store.name ? store.name : `Филиал #${storeId}`;



        content.appendChild(title);







        if (store && store.city) {



          const meta = document.createElement("span");



          meta.className = "settings-delivery-zone-store-pill-meta";



          meta.textContent = store.city;



          content.appendChild(meta);



        }







        const removeBtn = document.createElement("button");



        removeBtn.type = "button";



        removeBtn.className = "settings-delivery-zone-store-pill-remove";



        removeBtn.setAttribute("data-zone-store-remove", String(storeId));



        removeBtn.setAttribute("aria-label", `Remove store ${storeId}`);



        removeBtn.innerHTML = '<i class="fas fa-times"></i>';







        row.appendChild(icon);



        row.appendChild(content);



        row.appendChild(removeBtn);



        deliveryZoneStoresList.appendChild(row);



      });



    }







    function getSelectedDeliveryZoneStoreIds() {



      if (!deliveryZoneStoresList) return [];



      try {



        return JSON.parse(String(deliveryZoneStoresList.dataset.selectedStoreIds || "[]"))



          .map((value) => Number(value))



          .filter((value) => Number.isFinite(value) && value > 0);



      } catch (_) {



        return [];



      }



    }







    function removeDeliveryZoneStore(storeId) {



      const activeTab = getActiveDeliveryTab();



      const normalizedStoreId = Number(storeId);



      if (!isDeliveryZoneTab(activeTab) || !Number.isFinite(normalizedStoreId) || normalizedStoreId <= 0) return;



      const nextStoreIds = getSelectedDeliveryZoneStoreIds()



        .filter((selectedStoreId) => selectedStoreId !== normalizedStoreId);



      updateActiveDeliveryZoneDraft({ store_ids: nextStoreIds }, { syncMap: true });



      renderDeliveryZoneStoresCheckboxes(nextStoreIds);



    }







    function toggleDeliveryZoneStoresModalSkin(enabled) {



      if (appModalEl) {



        appModalEl.classList.toggle("cash-payment-app-modal", !!enabled);



      }



      if (appModalBodyEl) {



        appModalBodyEl.classList.toggle("settings-delivery-zone-stores-modal-body", !!enabled);



      }



    }







    function openDeliveryZoneStoresModal() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab) || !window.AppModal || typeof window.AppModal.open !== "function") return;







      const stores = Array.isArray(storesState.items) ? storesState.items.slice() : [];



      const selectedIds = new Set(getSelectedDeliveryZoneStoreIds());



      const host = document.createElement("div");



      host.className = "settings-delivery-zone-stores-modal";







      const note = document.createElement("div");



      note.className = "settings-delivery-zone-stores-modal-note";



      note.textContent = stores.length



        ? "Выберите один или несколько филиалов для этой зоны доставки."



        : "Нет доступных филиалов для выбора.";







      const list = document.createElement("div");



      list.className = "settings-delivery-zone-stores-modal-list";







      host.appendChild(note);



      host.appendChild(list);







      function renderModalList() {



        list.innerHTML = "";



        if (!stores.length) {



          const empty = document.createElement("div");



          empty.className = "settings-delivery-zone-stores-modal-empty";



          empty.textContent = "Сначала создайте филиал РІ разделе филиалов.";



          list.appendChild(empty);



          return;



        }







        stores.forEach((store) => {



          const storeId = Number(store && store.id);



          if (!Number.isFinite(storeId) || storeId <= 0) return;







          const btn = document.createElement("button");



          btn.type = "button";



          btn.className = "settings-delivery-zone-stores-modal-item";



          btn.classList.toggle("is-selected", selectedIds.has(storeId));







          const marker = document.createElement("span");



          marker.className = "settings-delivery-zone-stores-modal-item-marker";







          const content = document.createElement("span");



          content.className = "settings-delivery-zone-stores-modal-item-content";







          const title = document.createElement("span");



          title.className = "settings-delivery-zone-stores-modal-item-title";



          title.textContent = store.name || `Филиал #${storeId}`;



          content.appendChild(title);







          if (store.city) {



            const meta = document.createElement("span");



            meta.className = "settings-delivery-zone-stores-modal-item-meta";



            meta.textContent = store.city;



            content.appendChild(meta);



          }







          btn.appendChild(marker);



          btn.appendChild(content);



          btn.addEventListener("click", () => {



            if (selectedIds.has(storeId)) {



              selectedIds.delete(storeId);



            } else {



              selectedIds.add(storeId);



            }



            renderModalList();



          });



          list.appendChild(btn);



        });



      }







      renderModalList();



      toggleDeliveryZoneStoresModalSkin(true);



      window.AppModal.open({



        title: "Выбор филиалов",



        saveText: "Применить",



        cancelText: "Отмена",



        content: host,



        onSave: () => {



          const orderedIds = stores



            .map((store) => Number(store && store.id))



            .filter((storeId) => Number.isFinite(storeId) && selectedIds.has(storeId));



          updateActiveDeliveryZoneDraft({ store_ids: orderedIds }, { syncMap: true });



          renderDeliveryZoneStoresCheckboxes(orderedIds);



          return true;



        },



        onClose: () => {



          toggleDeliveryZoneStoresModalSkin(false);



        },



      });



    }







    function renderDeliveryZonePriceTiers(items) {



      if (!settingsDeliveryZonePriceTiers) return;



      const list = Array.isArray(items) && items.length ? items : [createEmptyDeliveryZoneTierDraft()];



      settingsDeliveryZonePriceTiers.innerHTML = "";







      list.forEach((tier, index) => {



        const row = document.createElement("div");



        row.className = "settings-delivery-zone-tier-row settings-delivery-zone-tier-row--zone";



        row.setAttribute("data-zone-tier-row", String(index));







        const minField = document.createElement("div");



        minField.className = "settings-site-field settings-delivery-zone-tier-field";



        minField.innerHTML = `<label class="field-label">ОТ СУММЫ</label><input class="control settings-delivery-zone-pill-control" type="number" min="0" step="1" data-zone-tier-field="min_order_amount" value="${String(tier && tier.min_order_amount != null ? tier.min_order_amount : "")}">`;







        const costField = document.createElement("div");



        costField.className = "settings-site-field settings-delivery-zone-tier-field";



        costField.innerHTML = `<label class="field-label">СТОИМОСТЬ ДОСТАВКИ</label><input class="control settings-delivery-zone-pill-control" type="number" min="0" step="1" data-zone-tier-field="delivery_cost" value="${String(tier && tier.delivery_cost != null ? tier.delivery_cost : "")}">`;







        const removeBtn = document.createElement("button");



        removeBtn.type = "button";



        removeBtn.className = "settings-delivery-zone-tier-remove";



        removeBtn.setAttribute("data-zone-tier-remove", String(index));



        removeBtn.setAttribute("aria-label", "Удалить порог");



        removeBtn.innerHTML = '<i class="fas fa-times"></i>';







        row.appendChild(minField);



        row.appendChild(costField);



        row.appendChild(removeBtn);



        settingsDeliveryZonePriceTiers.appendChild(row);



      });



    }







    function readDeliveryZonePriceTiersFromDom() {



      if (!settingsDeliveryZonePriceTiers) return [];



      return Array.from(settingsDeliveryZonePriceTiers.querySelectorAll("[data-zone-tier-row]"))



        .map((row) => ({



          min_order_amount: String((row.querySelector('[data-zone-tier-field=\"min_order_amount\"]') || {}).value || ""),



          delivery_cost: String((row.querySelector('[data-zone-tier-field=\"delivery_cost\"]') || {}).value || "")



        }));



    }







    function renderDeliverySettingPriceTiers(items) {



      if (!settingsDeliveryPriceTiers) return;



      const list = Array.isArray(items) && items.length ? items : [createEmptyDeliveryZoneTierDraft()];



      settingsDeliveryPriceTiers.innerHTML = "";







      list.forEach((tier, index) => {



        const row = document.createElement("div");



        row.className = "settings-delivery-zone-tier-row settings-delivery-zone-tier-row--zone";



        row.setAttribute("data-delivery-tier-row", String(index));







        const minField = document.createElement("div");



        minField.className = "settings-site-field settings-delivery-zone-tier-field";



        minField.innerHTML = `<label class="field-label">ОТ СУММЫ</label><input class="control settings-delivery-zone-pill-control" type="number" min="0" step="1" data-delivery-tier-field="min_order_amount" value="${String(tier && tier.min_order_amount != null ? tier.min_order_amount : "")}">`;







        const costField = document.createElement("div");



        costField.className = "settings-site-field settings-delivery-zone-tier-field";



        costField.innerHTML = `<label class="field-label">СТОИМОСТЬ ДОСТАВКИ</label><input class="control settings-delivery-zone-pill-control" type="number" min="0" step="1" data-delivery-tier-field="delivery_cost" value="${String(tier && tier.delivery_cost != null ? tier.delivery_cost : "")}">`;







        const removeBtn = document.createElement("button");



        removeBtn.type = "button";



        removeBtn.className = "settings-delivery-zone-tier-remove";



        removeBtn.setAttribute("data-delivery-tier-remove", String(index));



        removeBtn.setAttribute("aria-label", "Удалить порог");



        removeBtn.innerHTML = '<i class="fas fa-times"></i>';







        row.appendChild(minField);



        row.appendChild(costField);



        row.appendChild(removeBtn);



        settingsDeliveryPriceTiers.appendChild(row);



      });



    }







    function readDeliverySettingPriceTiersFromDom() {



      if (!settingsDeliveryPriceTiers) return [];



      return Array.from(settingsDeliveryPriceTiers.querySelectorAll("[data-delivery-tier-row]"))



        .map((row) => ({



          min_order_amount: String((row.querySelector('[data-delivery-tier-field=\"min_order_amount\"]') || {}).value || ""),



          delivery_cost: String((row.querySelector('[data-delivery-tier-field=\"delivery_cost\"]') || {}).value || "")



        }));



    }







    function buildDeliveryZoneGeometryHint(tab) {



      if (!isDeliveryZoneTab(tab)) {



        return "1. Кликайте по карте, чтобы поставить точки\n2. Следите за линией и заливкой будущей зоны\n3. Нажмите на последнюю точку и выберите «Завершить»\n4. После создания можно двигать точки мышкой";



      }



      if (isDeliveryZonePlacingMode(tab)) {



        return "1. Кликайте по карте, чтобы поставить точки\n2. После второй точки на линиях появляются точки для вставки новых вершин\n3. Нажмите на последнюю точку и выберите «Завершить»\n4. После создания можно уточнять форму зоны";



      }



      if (isDeliveryZoneEditingMode(tab)) {



        return "1. Основные точки показывают вершины выбранного полигона\n2. Точки на линиях вставляют новые вершины между существующими\n3. Потяните любую активную точку, чтобы изменить форму зоны\n4. После правки сохраните изменения";



      }



      return "1. Зона открыта РІ режиме просмотра\n2. Основные точки показывают вершины выбранного полигона\n3. Нажмите «Редактировать», чтобы включить перетаскивание точек\n4. После включения редактирования появятся и точки на линиях";



    }







    function normalizeDeliveryZoneColorValue(value) {



      const normalized = String(value || "").trim();



      return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : "#ff7a00";



    }







    function clampDeliveryZoneColorChannel(value) {



      const numeric = Number(value);



      if (!Number.isFinite(numeric)) return 0;



      return Math.min(255, Math.max(0, Math.round(numeric)));



    }







    function hexToDeliveryZoneRgb(value) {



      const normalized = normalizeDeliveryZoneColorValue(value);



      return {



        r: parseInt(normalized.slice(1, 3), 16),



        g: parseInt(normalized.slice(3, 5), 16),



        b: parseInt(normalized.slice(5, 7), 16),



      };



    }







    function rgbToDeliveryZoneHex(rgb) {



      return `#${["r", "g", "b"]



        .map((channel) => clampDeliveryZoneColorChannel(rgb && rgb[channel]).toString(16).padStart(2, "0"))



        .join("")}`;



    }







    function getDeliveryZoneColorEditorInputs() {



      if (!settingsDeliveryZoneColorEditor) return [];



      return Array.from(settingsDeliveryZoneColorEditor.querySelectorAll("[data-zone-color-channel]"));



    }







    function readDeliveryZoneColorEditorChannelValue(input) {



      if (!input) return null;



      const rawValue = String(input.value || "").trim();



      if (!rawValue.length) return null;



      return clampDeliveryZoneColorChannel(rawValue);



    }







    function closeDeliveryZoneColorEditor() {



      deliveryZonePanelUiState.colorEditorOpen = false;



      if (settingsDeliveryZoneColorEditor) {



        settingsDeliveryZoneColorEditor.classList.add("hidden");



      }



      if (settingsDeliveryZoneColorPopover) {



        settingsDeliveryZoneColorPopover.classList.remove("is-editor-open");



      }



      if (settingsDeliveryZoneColorPresets) {



        settingsDeliveryZoneColorPresets.classList.remove("hidden");



      }



      if (settingsDeliveryZoneColorCustomBtn) {



        settingsDeliveryZoneColorCustomBtn.classList.remove("hidden");



      }



    }







    function syncDeliveryZoneColorEditor(color = settingsDeliveryZoneColor && settingsDeliveryZoneColor.value) {



      const normalized = normalizeDeliveryZoneColorValue(color);



      const rgb = hexToDeliveryZoneRgb(normalized);



      if (settingsDeliveryZoneColorEditorPreview) {



        settingsDeliveryZoneColorEditorPreview.style.background = normalized;



      }



      if (settingsDeliveryZoneColorEditorValue) {



        settingsDeliveryZoneColorEditorValue.textContent = normalized.toUpperCase();



      }



      getDeliveryZoneColorEditorInputs().forEach((input) => {



        const channel = String(input.getAttribute("data-zone-color-channel") || "").toLowerCase();



        if (!Object.prototype.hasOwnProperty.call(rgb, channel)) return;



        const nextValue = String(rgb[channel]);



        if (String(input.value) !== nextValue) {



          input.value = nextValue;



        }



        if (input.getAttribute("data-zone-color-input") === "range") {



          input.style.setProperty("--zone-range-color", normalized);



        }



      });



    }







    function openDeliveryZoneColorEditor() {



      if (!settingsDeliveryZoneColorEditor || !settingsDeliveryZoneColorPopover) return;



      deliveryZonePanelUiState.colorEditorOpen = true;



      syncDeliveryZoneColorEditor(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value);



      settingsDeliveryZoneColorEditor.classList.remove("hidden");



      settingsDeliveryZoneColorPopover.classList.add("is-editor-open");



      if (settingsDeliveryZoneColorPresets) {



        settingsDeliveryZoneColorPresets.classList.add("hidden");



      }



      if (settingsDeliveryZoneColorCustomBtn) {



        settingsDeliveryZoneColorCustomBtn.classList.add("hidden");



      }



    }







    function setDeliveryZoneColorEditorChannel(channel, value) {



      const normalizedChannel = String(channel || "").toLowerCase();



      if (!["r", "g", "b"].includes(normalizedChannel)) return;



      const rgb = hexToDeliveryZoneRgb(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value);



      rgb[normalizedChannel] = clampDeliveryZoneColorChannel(value);



      setDeliveryZoneColorValue(rgbToDeliveryZoneHex(rgb), {



        syncDraft: true,



        syncMap: true,



      });



    }







    function closeDeliveryZoneInfoPopover() {



      deliveryZonePanelUiState.infoPopoverOpen = false;



      if (settingsDeliveryZoneInfoBtn) {



        settingsDeliveryZoneInfoBtn.setAttribute("aria-expanded", "false");



      }



      if (settingsDeliveryZoneInfoPopover) {



        settingsDeliveryZoneInfoPopover.classList.add("hidden");



      }



    }







    function closeDeliveryZoneColorPopover() {



      deliveryZonePanelUiState.colorPopoverOpen = false;



      closeDeliveryZoneColorEditor();



      if (settingsDeliveryZoneColorTrigger) {



        settingsDeliveryZoneColorTrigger.setAttribute("aria-expanded", "false");



      }



      if (settingsDeliveryZoneColorPopover) {



        settingsDeliveryZoneColorPopover.classList.add("hidden");



      }



    }







    function renderDeliveryZoneColorPresets(selectedColor = settingsDeliveryZoneColor && settingsDeliveryZoneColor.value) {



      if (!settingsDeliveryZoneColorPresets) return;



      const selected = normalizeDeliveryZoneColorValue(selectedColor);



      settingsDeliveryZoneColorPresets.innerHTML = "";



      DELIVERY_ZONE_PRESET_COLORS.forEach((color) => {



        const swatchBtn = document.createElement("button");



        swatchBtn.type = "button";



        swatchBtn.className = "settings-delivery-zone-color-swatch";



        swatchBtn.dataset.zoneColorPreset = color;



        swatchBtn.setAttribute("aria-label", `Выбрать цвет ${color.toUpperCase()}`);



        swatchBtn.classList.toggle("is-selected", color === selected);



        swatchBtn.style.setProperty("--zone-swatch-color", color);



        settingsDeliveryZoneColorPresets.appendChild(swatchBtn);



      });



    }







    function syncDeliveryZoneColorTrigger(color = settingsDeliveryZoneColor && settingsDeliveryZoneColor.value) {



      const normalized = normalizeDeliveryZoneColorValue(color);



      if (settingsDeliveryZoneColor) {



        settingsDeliveryZoneColor.value = normalized;



      }



      if (settingsDeliveryZoneColorPreview) {



        settingsDeliveryZoneColorPreview.style.background = normalized;



      }



      if (settingsDeliveryZoneColorValue) {



        settingsDeliveryZoneColorValue.textContent = normalized.toUpperCase();



      }



      renderDeliveryZoneColorPresets(normalized);



      syncDeliveryZoneColorEditor(normalized);



    }







    function setDeliveryZoneColorValue(color, options = {}) {



      const normalized = normalizeDeliveryZoneColorValue(color);



      syncDeliveryZoneColorTrigger(normalized);



      const activeTab = getActiveDeliveryTab();



      if (options.syncDraft !== false && isDeliveryZoneTab(activeTab)) {



        updateActiveDeliveryZoneDraft(readDeliveryZoneFormDraft(), {



          syncMap: options.syncMap !== false,



          refreshTabs: false,



        });



      }



      if (options.closePopover) {



        closeDeliveryZoneColorPopover();



      }



      return normalized;



    }







    function openDeliveryZoneInfoPopover() {



      if (!settingsDeliveryZoneInfoPopover) return;



      closeDeliveryZoneColorPopover();



      deliveryZonePanelUiState.infoPopoverOpen = true;



      settingsDeliveryZoneInfoPopover.classList.remove("hidden");



      if (settingsDeliveryZoneInfoBtn) {



        settingsDeliveryZoneInfoBtn.setAttribute("aria-expanded", "true");



      }



    }







    function toggleDeliveryZoneInfoPopover(forceOpen) {



      const shouldOpen = typeof forceOpen === "boolean"



        ? forceOpen



        : !deliveryZonePanelUiState.infoPopoverOpen;



      if (!shouldOpen) {



        closeDeliveryZoneInfoPopover();



        return;



      }



      openDeliveryZoneInfoPopover();



    }







    function openDeliveryZoneColorPopover() {



      if (!settingsDeliveryZoneColorPopover) return;



      closeDeliveryZoneInfoPopover();



      closeDeliveryZoneColorEditor();



      deliveryZonePanelUiState.colorPopoverOpen = true;



      renderDeliveryZoneColorPresets(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value);



      settingsDeliveryZoneColorPopover.classList.remove("hidden");



      if (settingsDeliveryZoneColorTrigger) {



        settingsDeliveryZoneColorTrigger.setAttribute("aria-expanded", "true");



      }



    }







    function toggleDeliveryZoneColorPopover(forceOpen) {



      const shouldOpen = typeof forceOpen === "boolean"



        ? forceOpen



        : !deliveryZonePanelUiState.colorPopoverOpen;



      if (!shouldOpen) {



        closeDeliveryZoneColorPopover();



        return;



      }



      openDeliveryZoneColorPopover();



    }







    function updateDeliveryZoneGeometryHint(tab) {



      if (!settingsDeliveryZoneGeometryHint) return;



      settingsDeliveryZoneGeometryHint.textContent = buildDeliveryZoneGeometryHint(tab);



    }







    function syncDeliveryZoneEditButton(tab = getActiveDeliveryTab()) {



      if (!settingsDeliveryZoneEditBtn) return;



      const showEdit = Boolean(



        isDeliveryZoneTab(tab)



        && tab.mode !== "create"



        && countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry) > 0



        && !isDeliveryZoneEditingMode(tab)



      );



      settingsDeliveryZoneEditBtn.classList.toggle("hidden", !showEdit);



    }







    function readDeliveryZoneFormDraft() {



      const currentGeometry = syncActiveDeliveryZoneDraftGeometryFromMap();



      return {



        name: String(settingsDeliveryZoneName && settingsDeliveryZoneName.value || ""),



        color: normalizeDeliveryZoneColorValue(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value),



        eta_minutes: String(settingsDeliveryZoneEtaMinutes && settingsDeliveryZoneEtaMinutes.value || ""),



        is_active: Boolean(settingsDeliveryZoneActive && settingsDeliveryZoneActive.checked),



        store_ids: getSelectedDeliveryZoneStoreIds(),



        price_tiers: readDeliveryZonePriceTiersFromDom(),



        geometry: currentGeometry || normalizeDeliveryZoneGeometryValue(getActiveDeliveryTab() && getActiveDeliveryTab().draft && getActiveDeliveryTab().draft.geometry)



      };



    }







    function applyDeliveryZoneFormDraft(tab) {



      const draft = cloneDeliveryZoneDraft(tab && tab.draft ? tab.draft : createEmptyDeliveryZoneDraft());



      if (settingsDeliveryZoneSubtitle) {



        const showCreateSubtitle = Boolean(tab && tab.mode === "create");



        settingsDeliveryZoneSubtitle.textContent = showCreateSubtitle ? "Новая зона" : "";



        settingsDeliveryZoneSubtitle.classList.toggle("hidden", !showCreateSubtitle);



      }



      if (settingsDeliveryZoneSaveText) {



        settingsDeliveryZoneSaveText.textContent = tab && tab.mode === "create" ? "Создать" : "Сохранить";



      }



      if (settingsDeliveryZoneDeleteBtn) {



        settingsDeliveryZoneDeleteBtn.classList.toggle("hidden", !tab || tab.mode === "create");



      }



      syncDeliveryZoneEditButton(tab);



      if (settingsDeliveryZoneName) settingsDeliveryZoneName.value = draft.name;



      syncDeliveryZoneColorTrigger(draft.color || "#ff7a00");



      if (settingsDeliveryZoneEtaMinutes) settingsDeliveryZoneEtaMinutes.value = draft.eta_minutes;



      if (settingsDeliveryZoneActive) settingsDeliveryZoneActive.checked = Boolean(draft.is_active);



      renderDeliveryZoneStoresCheckboxes(draft.store_ids);



      renderDeliveryZonePriceTiers(draft.price_tiers);



      updateDeliveryZoneGeometryHint(tab);



    }







    function openDeliveryZoneTab(zone) {



      const normalized = normalizeDeliveryZone(zone);



      let tab = getDeliveryZoneTabById(normalized.id);



      if (!tab) {



        tab = createDeliveryZoneEditTab(normalized);



        deliveryTabsState.tabs.push(tab);



      }



      setActiveDeliveryTab(tab.key);



    }







    function openNewDeliveryZoneTab() {



      let tab = getDeliveryTabByKey(DELIVERY_ZONE_CREATE_TAB_KEY);



      if (!tab) {



        tab = createNewDeliveryZoneTab();



        deliveryTabsState.tabs.push(tab);



      }



      setActiveDeliveryTab(tab.key);



    }







    function renderDeliveryWorkspace() {



      const isDeliverySection = document.body.getAttribute("data-settings-section") === "delivery";



      if (settingsDeliveryTabsHeader) settingsDeliveryTabsHeader.classList.toggle("hidden", !isDeliverySection);



      if (!isDeliverySection) {



        closeDeliveryDefaultStoreDropdown();



        closeDeliveryZoneInfoPopover();



        closeDeliveryZoneColorPopover();



        if (settingsDeliveryHome) settingsDeliveryHome.classList.add("hidden");



        if (settingsDeliveryPanel) settingsDeliveryPanel.classList.add("hidden");



        if (settingsDeliveryFooter) settingsDeliveryFooter.classList.add("hidden");



        if (settingsDeliveryZonePanel) settingsDeliveryZonePanel.classList.add("hidden");



        if (settingsDeliveryZoneFooter) settingsDeliveryZoneFooter.classList.add("hidden");



        if (settingsDeliveryMapConfigPanel) settingsDeliveryMapConfigPanel.classList.add("hidden");



        if (settingsDeliveryMapConfigFooter) settingsDeliveryMapConfigFooter.classList.add("hidden");



        syncDeliveryZoneMapEditing();



        return;



      }







      renderDeliveryTabs();



      const activeTab = getActiveDeliveryTab();



      const showHome = !activeTab;



      const showMapConfig = isDeliveryMapConfigTab(activeTab);



      const showZone = isDeliveryZoneTab(activeTab);



      if (showHome || showMapConfig || showZone) {



        closeDeliveryDefaultStoreDropdown();



      }



      if (!showZone) {



        closeDeliveryZoneInfoPopover();



        closeDeliveryZoneColorPopover();



      }



      if (settingsDeliveryHome) settingsDeliveryHome.classList.toggle("hidden", !showHome);



      if (settingsDeliveryPanel) settingsDeliveryPanel.classList.toggle("hidden", showHome || showMapConfig || showZone);



      if (settingsDeliveryFooter) settingsDeliveryFooter.classList.toggle("hidden", showHome || showMapConfig || showZone);



      if (settingsDeliveryZonePanel) settingsDeliveryZonePanel.classList.toggle("hidden", !showZone);



      if (settingsDeliveryZoneFooter) settingsDeliveryZoneFooter.classList.toggle("hidden", !showZone);



      if (settingsDeliveryMapConfigPanel) settingsDeliveryMapConfigPanel.classList.toggle("hidden", !showMapConfig);



      if (settingsDeliveryMapConfigFooter) settingsDeliveryMapConfigFooter.classList.toggle("hidden", !showMapConfig);



      if (showHome) {



        syncDeliveryZoneMapEditing();



        return;



      }



      if (showMapConfig) {



        renderDeliveryMapAccountsPanel();



        syncDeliveryZoneMapEditing();



        return;



      }



      if (showZone) {



        applyDeliveryZoneFormDraft(activeTab);



        syncDeliveryZoneMapEditing();



        return;



      }



      applyDeliveryFormDraft(activeTab);



      syncDeliveryZoneMapEditing();



    }







    function goToDeliveryHome() {



      persistActiveDeliveryDraft();



      deliveryTabsState.activeKey = "";



      deliverySettingsState.selectedId = null;



      deliverySettingsState.snapshot = null;



      deliverySettingsState.mode = "view";



      deliveryZonesState.selectedId = null;



      deliveryZonesState.snapshot = null;



      deliveryZonesState.mode = "view";



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



    }







    function setActiveDeliveryTab(key) {



      const nextTab = getDeliveryTabByKey(key);



      if (!nextTab) {



        goToDeliveryHome();



        return;



      }



      if (deliveryTabsState.activeKey && deliveryTabsState.activeKey !== nextTab.key) {



        persistActiveDeliveryDraft();



      }



      if (deliveryTabsState.activeKey !== nextTab.key) {



        closeDeliveryDefaultStoreDropdown();



        closeDeliveryZoneInfoPopover();



        closeDeliveryZoneColorPopover();



      }



      deliveryTabsState.activeKey = nextTab.key;



      if (isDeliveryZoneTab(nextTab)) {



        deliverySettingsState.selectedId = null;



        deliverySettingsState.snapshot = null;



        deliverySettingsState.mode = "view";



        deliveryZonesState.selectedId = nextTab.id || null;



        deliveryZonesState.snapshot = nextTab.snapshot ? { ...nextTab.snapshot } : null;



        deliveryZonesState.mode = nextTab.mode;



      } else {



        deliverySettingsState.selectedId = nextTab.id || null;



        deliverySettingsState.snapshot = nextTab.snapshot ? { ...nextTab.snapshot } : null;



        deliverySettingsState.mode = nextTab.mode;



        deliveryZonesState.selectedId = null;



        deliveryZonesState.snapshot = null;



        deliveryZonesState.mode = "view";



      }



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



      if (isDeliveryMapConfigTab(nextTab)) {



        loadDeliveryMapAccounts();



        if (settingsDeliveryMapAccountAddBtn) settingsDeliveryMapAccountAddBtn.focus();



        return;



      }



      if (isDeliveryZoneTab(nextTab)) {



        if (settingsDeliveryZoneName) settingsDeliveryZoneName.focus();



        return;



      }



      if (settingsDeliveryName) settingsDeliveryName.focus();



    }







    function closeDeliveryTab(key, options = {}) {



      const index = deliveryTabsState.tabs.findIndex((tab) => String(tab && tab.key || "") === String(key || ""));



      if (index < 0) return;



      closeDeliveryZoneInfoPopover();



      closeDeliveryZoneColorPopover();



      const closingTab = deliveryTabsState.tabs[index] || null;



      const wasActive = deliveryTabsState.activeKey === key;



      if (wasActive) {



        persistActiveDeliveryDraft();



      }



      if (



        !options.force



        && isDeliveryZoneTab(closingTab)



        && isDeliveryZoneTabDirty(closingTab)



        && !window.confirm("Закрыть вкладку зоны доставки без сохранения?")



      ) {



        return;



      }



      deliveryTabsState.tabs.splice(index, 1);



      if (isDeliveryMapConfigTab(closingTab)) {



        resetDeliveryMapAccountsTransientState();



      }



      if (wasActive) {



        const nextTab = deliveryTabsState.tabs[index] || deliveryTabsState.tabs[index - 1] || null;



        deliveryTabsState.activeKey = nextTab ? nextTab.key : "";



      }



      const nextActiveTab = getActiveDeliveryTab();



      if (nextActiveTab) {



        if (isDeliveryZoneTab(nextActiveTab)) {



          deliverySettingsState.selectedId = null;



          deliverySettingsState.snapshot = null;



          deliverySettingsState.mode = "view";



          deliveryZonesState.selectedId = nextActiveTab.id || null;



          deliveryZonesState.snapshot = nextActiveTab.snapshot ? { ...nextActiveTab.snapshot } : null;



          deliveryZonesState.mode = nextActiveTab.mode;



        } else {



          deliverySettingsState.selectedId = nextActiveTab.id || null;



          deliverySettingsState.snapshot = nextActiveTab.snapshot ? { ...nextActiveTab.snapshot } : null;



          deliverySettingsState.mode = nextActiveTab.mode;



          deliveryZonesState.selectedId = null;



          deliveryZonesState.snapshot = null;



          deliveryZonesState.mode = "view";



        }



      } else {



        deliverySettingsState.selectedId = null;



        deliverySettingsState.snapshot = null;



        deliverySettingsState.mode = "view";



        deliveryZonesState.selectedId = null;



        deliveryZonesState.snapshot = null;



        deliveryZonesState.mode = "view";



      }



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



    }







    function openDeliverySettingTab(setting) {



      const normalized = normalizeDeliverySetting(setting);



      let tab = getDeliveryTabById(normalized.id);



      if (!tab) {



        tab = createDeliveryEditTab(normalized);



        deliveryTabsState.tabs.push(tab);



      }



      setActiveDeliveryTab(tab.key);



    }







    function openNewDeliveryTab() {



      let tab = getDeliveryTabByKey(DELIVERY_CREATE_TAB_KEY);



      if (!tab) {



        tab = createNewDeliveryTab();



        deliveryTabsState.tabs.push(tab);



      }



      setActiveDeliveryTab(tab.key);



    }







    function openDeliveryMapConfigTab() {



      if (!isStoreAddressMapModeEnabled()) return;



      let tab = getDeliveryMapConfigTab();



      if (!tab) {



        tab = createDeliveryMapConfigTab();



        deliveryTabsState.tabs.push(tab);



      }



      setActiveDeliveryTab(tab.key);



    }







    function syncDeliveryTabsWithItems(items, zones = deliveryZonesState.items) {



      const list = Array.isArray(items) ? items.map((item) => normalizeDeliverySetting(item)) : [];



      const zoneList = Array.isArray(zones) ? zones.map((item) => normalizeDeliveryZone(item)) : [];



      const byId = new Map(list.map((item) => [item.id, item]));



      const zonesById = new Map(zoneList.map((item) => [item.id, item]));







      deliveryTabsState.tabs = deliveryTabsState.tabs



        .filter((tab) => {



          if (isDeliveryMapConfigTab(tab)) return true;



          if (tab && tab.key === DELIVERY_CREATE_TAB_KEY) return true;



          if (tab && tab.key === DELIVERY_ZONE_CREATE_TAB_KEY) return true;



          if (isDeliveryZoneTab(tab)) return zonesById.has(Number(tab.id || 0));



          return byId.has(Number(tab && tab.id || 0));



        })



        .map((tab) => {



          if (isDeliveryMapConfigTab(tab)) return tab;



          if (tab && tab.key === DELIVERY_CREATE_TAB_KEY) return tab;



          if (tab && tab.key === DELIVERY_ZONE_CREATE_TAB_KEY) return tab;



          if (isDeliveryZoneTab(tab)) {



            const freshZone = zonesById.get(Number(tab.id || 0));



            if (!freshZone) return tab;



            const previousSnapshot = tab.snapshot ? createDeliveryZoneDraftFromZone(tab.snapshot) : null;



            const nextSnapshot = createDeliveryZoneDraftFromZone(freshZone);



            const draftMatchesSnapshot = previousSnapshot && serializeDeliveryZoneDraft(tab.draft) === serializeDeliveryZoneDraft(previousSnapshot);



            return {



              ...tab,



              snapshot: freshZone,



              draft: draftMatchesSnapshot ? nextSnapshot : cloneDeliveryZoneDraft(tab.draft)



            };



          }



          const fresh = byId.get(Number(tab.id || 0));



          if (!fresh) return tab;



          const previousSnapshot = tab.snapshot ? createDeliveryDraftFromSetting(tab.snapshot) : null;



          const nextSnapshot = createDeliveryDraftFromSetting(fresh);



          const draftMatchesSnapshot = previousSnapshot && serializeDeliveryDraft(tab.draft) === serializeDeliveryDraft(previousSnapshot);



          return {



            ...tab,



            snapshot: fresh,



            draft: draftMatchesSnapshot ? nextSnapshot : cloneDeliveryDraft(tab.draft)



          };



        });



      if (deliveryTabsState.activeKey && !getDeliveryTabByKey(deliveryTabsState.activeKey)) {



        deliveryTabsState.activeKey = "";



      }



    }







    async function fetchDeliverySettings() {



      try {



        const res = await authFetch("/api/admin/tenant/delivery-settings");



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось загрузить настройки доставки:", err);



        return null;



      }



    }







    async function fetchDeliveryZones() {



      try {



        const res = await authFetch("/api/admin/tenant/delivery-zones");



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось загрузить зоны доставки:", err);



        return null;



      }



    }







    async function createDeliveryZone(payload) {



      try {



        const res = await authFetch("/api/admin/tenant/delivery-zones", {



          method: "POST",



          body: JSON.stringify(payload)



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось создать зону доставки:", err);



        return null;



      }



    }







    async function updateDeliveryZone(id, payload) {



      try {



        const res = await authFetch(`/api/admin/tenant/delivery-zones/${encodeURIComponent(id)}`, {



          method: "PUT",



          body: JSON.stringify(payload)



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось обновить зону доставки:", err);



        return null;



      }



    }







    async function deleteDeliveryZone(id) {



      try {



        const res = await authFetch(`/api/admin/tenant/delivery-zones/${encodeURIComponent(id)}`, {



          method: "DELETE"



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось удалить зону доставки:", err);



        return null;



      }



    }







    async function fetchDeliveryMapAccounts() {



      try {



        const res = await authFetch("/api/admin/tenant/map-provider-accounts");



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось загрузить настройки карты tenant:", err);



        return null;



      }



    }







    async function saveDeliveryMapAccounts(items) {



      try {



        const res = await authFetch("/api/admin/tenant/map-provider-accounts", {



          method: "PUT",



          body: JSON.stringify({ items: Array.isArray(items) ? items : [] })



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось сохранить настройки карты tenant:", err);



        return null;



      }



    }







    async function revealDeliveryMapAccount(accountId) {



      try {



        const res = await authFetch(`/api/admin/tenant/map-provider-accounts/${encodeURIComponent(accountId)}/reveal`);



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось показать данные API карты:", err);



        return null;



      }



    }







    function syncDeliveryMapGuide() {



      if (settingsDeliveryMapConfigSubtitle) {



        settingsDeliveryMapConfigSubtitle.textContent = deliveryMapAccountsProviderName



          ? `Провайдер: ${deliveryMapAccountsProviderName}`



          : "Добавьте tenant-ключи карты";



      }



      if (settingsDeliveryMapConfigGuide) {



        settingsDeliveryMapConfigGuide.textContent = buildDeliveryMapGuideText(deliveryMapAccountsProviderName);



      }



    }







    function applyDeliveryMapAddFormValues() {



      const draft = cloneDeliveryMapAccountDraft(deliveryMapAccountsAddDraft);



      if (settingsDeliveryMapAccountAddApiKey) settingsDeliveryMapAccountAddApiKey.value = draft.api_key;



      if (settingsDeliveryMapAccountAddLogin) settingsDeliveryMapAccountAddLogin.value = draft.login;



      if (settingsDeliveryMapAccountAddPassword) settingsDeliveryMapAccountAddPassword.value = draft.password;



      if (settingsDeliveryMapAccountAddWrap) settingsDeliveryMapAccountAddWrap.classList.toggle("hidden", !deliveryMapAccountsAddMode);



    }







    function openDeliveryMapAddForm() {



      deliveryMapAccountsAddMode = true;



      deliveryMapAccountsAddDraft = createEmptyDeliveryMapAccountDraft();



      applyDeliveryMapAddFormValues();



      if (settingsDeliveryMapAccountAddApiKey) settingsDeliveryMapAccountAddApiKey.focus();



    }







    function closeDeliveryMapAddForm() {



      deliveryMapAccountsAddMode = false;



      deliveryMapAccountsAddDraft = createEmptyDeliveryMapAccountDraft();



      applyDeliveryMapAddFormValues();



    }







    function updateDeliveryMapAddDraftFromInputs() {



      deliveryMapAccountsAddDraft = {



        id: "",



        api_key: String((settingsDeliveryMapAccountAddApiKey && settingsDeliveryMapAccountAddApiKey.value) || "").trim(),



        login: String((settingsDeliveryMapAccountAddLogin && settingsDeliveryMapAccountAddLogin.value) || "").trim(),



        password: String((settingsDeliveryMapAccountAddPassword && settingsDeliveryMapAccountAddPassword.value) || "").trim(),



        is_active: !deliveryMapAccountsDraft.length



      };



      return cloneDeliveryMapAccountDraft(deliveryMapAccountsAddDraft);



    }







    function buildDeliveryMapDraftPayload() {



      const draftItems = cloneDeliveryMapAccounts(deliveryMapAccountsDraft);



      return draftItems.map((item) => ({



        id: String(item.id || buildDeliveryMapAccountClientId()),



        api_key: String(item.api_key || "").trim(),



        login: String(item.login || "").trim() || null,



        password: String(item.password || "").trim() || null,



        is_active: Boolean(item.is_active)



      }));



    }







    function renderDeliveryMapAccountsPanel() {



      syncDeliveryMapGuide();



      applyDeliveryMapAddFormValues();







      if (!settingsDeliveryMapAccountsList) return;



      settingsDeliveryMapAccountsList.innerHTML = "";







      const originalSummaries = new Map(



        (Array.isArray(deliveryMapAccountsOriginal) ? deliveryMapAccountsOriginal : [])



          .map((item) => [String(item.id || ""), normalizeDeliveryMapAccountSummary(item)])



      );



      const list = cloneDeliveryMapAccounts(deliveryMapAccountsDraft);







      if (settingsDeliveryMapAccountsEmpty) {



        settingsDeliveryMapAccountsEmpty.classList.toggle("hidden", list.length > 0);



      }







      list.forEach((item) => {



        const itemId = String(item.id || "");



        const originalSummary = originalSummaries.get(itemId)



          ? normalizeDeliveryMapAccountSummary(originalSummaries.get(itemId))



          : null;



        const summary = {



          id: itemId,



          is_active: Boolean(item.is_active),



          api_key: String(item.api_key || "").trim() && String(item.api_key || "").trim() !== "__saved__"



            ? String(item.api_key || "").trim()



            : String((originalSummary && originalSummary.api_key) || ""),



          has_login: String(item.login || "").trim() === "__saved__"



            ? Boolean(originalSummary && originalSummary.has_login)



            : Boolean(String(item.login || "").trim()),



          has_password: String(item.password || "").trim() === "__saved__"



            ? Boolean(originalSummary && originalSummary.has_password)



            : Boolean(String(item.password || "").trim())



        };



        const revealEntry = getDeliveryMapRevealEntry(itemId);



        const isRevealOpen = Boolean(revealEntry && revealEntry.open);



        const isRevealLoading = Boolean(revealEntry && revealEntry.loading);



        const isEditOpen = String(deliveryMapAccountsEditId || "") === itemId;



        const editDraft = isEditOpen ? cloneDeliveryMapAccountDraft(deliveryMapAccountsEditDraft) : createEmptyDeliveryMapAccountDraft();







        const card = document.createElement("div");



        card.className = `settings-delivery-map-account-card${item.is_active ? " is-active" : ""}`;







        const row = document.createElement("div");



        row.className = "settings-delivery-map-account-row";







        const radioWrap = document.createElement("label");



        radioWrap.className = "settings-delivery-map-account-radio";



        const radio = document.createElement("input");



        radio.type = "radio";



        radio.name = "delivery-map-active-account";



        radio.checked = Boolean(item.is_active);



        radio.addEventListener("change", () => {



          setActiveDeliveryMapDraftAccount(itemId);



          renderDeliveryMapAccountsPanel();



        });



        radioWrap.appendChild(radio);







        const main = document.createElement("div");



        main.className = "settings-delivery-map-account-main";







        const key = document.createElement("div");



        key.className = "settings-delivery-map-account-key";



        key.textContent = summary.api_key || "Ключ скрыт";







        main.appendChild(key);







        const actions = document.createElement("div");



        actions.className = "settings-delivery-map-account-actions";







        const viewBtn = document.createElement("button");



        viewBtn.type = "button";



        viewBtn.className = "btn btn-icon btn-sm btn-secondary settings-delivery-map-account-icon-btn";



        viewBtn.title = isRevealOpen ? "Скрыть данные API" : "Просмотреть данные API";



        viewBtn.setAttribute("aria-label", isRevealOpen ? "Скрыть данные API" : "Просмотреть данные API");



        viewBtn.innerHTML = '<i class="fas fa-eye"></i>';



        viewBtn.disabled = isRevealLoading;



        viewBtn.addEventListener("click", async () => {



          if (isRevealOpen) {



            removeDeliveryMapRevealEntry(itemId);



            renderDeliveryMapAccountsPanel();



            return;



          }



          setDeliveryMapRevealEntry(itemId, { open: true, loading: true });



          renderDeliveryMapAccountsPanel();



          const data = await revealDeliveryMapAccount(itemId);



          if (!data || !data.ok || !data.item) {



            alert("Не удалось показать данные API.");



            removeDeliveryMapRevealEntry(itemId);



            renderDeliveryMapAccountsPanel();



            return;



          }



          setDeliveryMapRevealEntry(itemId, {



            open: true,



            loading: false,



            item: cloneDeliveryMapAccountDraft(data.item)



          });



          renderDeliveryMapAccountsPanel();



        });







        const editBtn = document.createElement("button");



        editBtn.type = "button";



        editBtn.className = "btn btn-icon btn-sm btn-secondary settings-delivery-map-account-icon-btn";



        editBtn.title = isEditOpen ? "Скрыть редактирование" : "Редактировать";



        editBtn.setAttribute("aria-label", isEditOpen ? "Скрыть редактирование" : "Редактировать");



        editBtn.innerHTML = '<i class="fas fa-pencil-alt"></i>';



        editBtn.addEventListener("click", async () => {



          if (isEditOpen) {



            deliveryMapAccountsEditId = "";



            deliveryMapAccountsEditDraft = createEmptyDeliveryMapAccountDraft();



            renderDeliveryMapAccountsPanel();



            return;



          }







          let nextDraft = cloneDeliveryMapAccountDraft(item);



          const data = await revealDeliveryMapAccount(itemId);



          if (data && data.ok && data.item) {



            nextDraft = cloneDeliveryMapAccountDraft(data.item);



          }



          deliveryMapAccountsEditId = itemId;



          deliveryMapAccountsEditDraft = nextDraft;



          renderDeliveryMapAccountsPanel();



        });







        actions.appendChild(viewBtn);



        actions.appendChild(editBtn);



        row.appendChild(radioWrap);



        row.appendChild(main);



        row.appendChild(actions);



        card.appendChild(row);







        if (isRevealOpen) {



          const reveal = document.createElement("div");



          reveal.className = "settings-delivery-map-account-reveal";



          if (isRevealLoading) {



            reveal.textContent = "Загрузка данных API...";



          } else {



            const revealedItem = cloneDeliveryMapAccountDraft(revealEntry && revealEntry.item);



            const revealFields = [



              { label: "ЛОГИН", value: revealedItem.login, type: "text" },



              { label: "ПАРОЛЬ", value: revealedItem.password, type: "text" }



            ].filter((field) => Boolean(String(field.value || "").trim()));



            if (!revealFields.length) {



              const empty = document.createElement("div");



              empty.className = "field-hint settings-delivery-map-account-reveal-empty";



              empty.textContent = "Данные входа не заполнены.";



              reveal.appendChild(empty);



            } else {



              const grid = document.createElement("div");



              grid.className = "settings-delivery-map-account-reveal-grid";



              revealFields.forEach((field) => {



                const wrap = document.createElement("div");



                wrap.className = "settings-site-field";



                const label = document.createElement("label");



                label.className = "field-label";



                label.textContent = field.label;



                const input = document.createElement("input");



                input.className = "control";



                input.type = field.type;



                input.readOnly = true;



                input.value = String(field.value || "");



                wrap.appendChild(label);



                wrap.appendChild(input);



                grid.appendChild(wrap);



              });



              reveal.appendChild(grid);



            }



          }



          card.appendChild(reveal);



        }







        if (isEditOpen) {



          const edit = document.createElement("div");



          edit.className = "settings-delivery-map-account-edit";



          const grid = document.createElement("div");



          grid.className = "settings-delivery-map-account-editor-grid";







          [



            { key: "api_key", label: "API KEY", type: "text", placeholder: "Введите API key" },



            { key: "login", label: "ЛОГИН", type: "text", placeholder: "Необязательно" },



            { key: "password", label: "ПАРОЛЬ", type: "password", placeholder: "Необязательно" }



          ].forEach((field) => {



            const wrap = document.createElement("div");



            wrap.className = "settings-site-field";



            const label = document.createElement("label");



            label.className = "field-label";



            label.textContent = field.label;



            const input = document.createElement("input");



            input.className = "control";



            input.type = field.type;



            input.placeholder = field.placeholder;



            input.value = String(editDraft[field.key] || "");



            input.addEventListener("input", () => {



              deliveryMapAccountsEditDraft = {



                ...cloneDeliveryMapAccountDraft(deliveryMapAccountsEditDraft),



                [field.key]: String(input.value || "")



              };



            });



            wrap.appendChild(label);



            wrap.appendChild(input);



            grid.appendChild(wrap);



          });







          const inlineActions = document.createElement("div");



          inlineActions.className = "settings-delivery-map-account-inline-actions";







          const cancelBtn = document.createElement("button");



          cancelBtn.type = "button";



          cancelBtn.className = "btn btn-secondary btn-sm";



          cancelBtn.textContent = "Отмена";



          cancelBtn.addEventListener("click", () => {



            deliveryMapAccountsEditId = "";



            deliveryMapAccountsEditDraft = createEmptyDeliveryMapAccountDraft();



            renderDeliveryMapAccountsPanel();



          });







          const applyBtn = document.createElement("button");



          applyBtn.type = "button";



          applyBtn.className = "btn btn-primary btn-sm";



          applyBtn.textContent = "Сохранить";



          applyBtn.addEventListener("click", () => {



            const nextDraft = cloneDeliveryMapAccountDraft(deliveryMapAccountsEditDraft);



            if (!String(nextDraft.api_key || "").trim()) {



              alert("Введите API key.");



              return;



            }



            deliveryMapAccountsDraft = cloneDeliveryMapAccounts(deliveryMapAccountsDraft).map((entry) => (



              String(entry.id || "") === itemId



                ? {



                    ...entry,



                    api_key: String(nextDraft.api_key || "").trim(),



                    login: String(nextDraft.login || "").trim(),



                    password: String(nextDraft.password || "").trim()



                  }



                : entry



            ));



            deliveryMapAccountsEditId = "";



            deliveryMapAccountsEditDraft = createEmptyDeliveryMapAccountDraft();



            removeDeliveryMapRevealEntry(itemId);



            renderDeliveryMapAccountsPanel();



          });







          inlineActions.appendChild(cancelBtn);



          inlineActions.appendChild(applyBtn);



          edit.appendChild(grid);



          edit.appendChild(inlineActions);



          card.appendChild(edit);



        }







        settingsDeliveryMapAccountsList.appendChild(card);



      });



    }







    function applyLoadedDeliveryMapAccounts(data) {



      if (typeof (data && data.enabled) === "boolean") {



        storeAddressMapModeCache = Boolean(data.enabled);



      }



      if (!isStoreAddressMapModeEnabled()) {



        syncDeliveryMapConfigAvailability();



        return;



      }



      deliveryMapAccountsLoaded = true;



      deliveryMapAccountsProviderName = String(data && data.provider_name || "").trim();



      deliveryMapAccountsOriginal = Array.isArray(data && data.items)



        ? data.items.map((item) => normalizeDeliveryMapAccountSummary(item))



        : [];



      deliveryMapAccountsDraft = deliveryMapAccountsOriginal.map((item) => ({



        id: item.id,



        api_key: item.api_key,



        login: item.has_login ? "__saved__" : "",



        password: item.has_password ? "__saved__" : "",



        api_key_masked: item.api_key_masked,



        has_login: item.has_login,



        has_password: item.has_password,



        is_active: item.is_active



      }));



      resetDeliveryMapAccountsTransientState();



      renderDeliveryMapAccountsPanel();



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryWorkspace();



    }







    async function loadDeliveryMapAccounts(force = false) {



      if (!isStoreAddressMapModeEnabled()) {



        deliveryMapAccountsLoaded = false;



        deliveryMapAccountsProviderName = "";



        deliveryMapAccountsOriginal = [];



        deliveryMapAccountsDraft = [];



        resetDeliveryMapAccountsTransientState();



        renderDeliveryMapAccountsPanel();



        return null;



      }







      if (deliveryMapAccountsLoadingPromise && !force) {



        return deliveryMapAccountsLoadingPromise;



      }







      if (deliveryMapAccountsLoaded && !force) {



        renderDeliveryMapAccountsPanel();



        return {



          ok: true,



          provider_name: deliveryMapAccountsProviderName,



          items: deliveryMapAccountsOriginal



        };



      }







      deliveryMapAccountsLoadingPromise = (async () => {



        const data = await fetchDeliveryMapAccounts();



        if (!data || !data.ok) return null;



        applyLoadedDeliveryMapAccounts(data);



        return data;



      })().finally(() => {



        deliveryMapAccountsLoadingPromise = null;



      });







      return deliveryMapAccountsLoadingPromise;



    }







    function resetDeliveryMapAccountsToOriginal() {



      deliveryMapAccountsDraft = (Array.isArray(deliveryMapAccountsOriginal) ? deliveryMapAccountsOriginal : []).map((item) => ({



        id: item.id,



        api_key: item.api_key,



        login: item.has_login ? "__saved__" : "",



        password: item.has_password ? "__saved__" : "",



        api_key_masked: item.api_key_masked,



        has_login: item.has_login,



        has_password: item.has_password,



        is_active: item.is_active



      }));



      resetDeliveryMapAccountsTransientState();



      renderDeliveryMapAccountsPanel();



    }







    function syncDeliveryMapConfigAvailability() {



      syncDeliveryMapConfigButtonVisibility();



      if (isStoreAddressMapModeEnabled()) {



        renderDeliveryHomeList(deliverySettingsState.items);



        renderDeliveryWorkspace();



        return;



      }







      deliveryTabsState.tabs = deliveryTabsState.tabs.filter((tab) => !isDeliveryMapConfigTab(tab));



      if (deliveryTabsState.activeKey === DELIVERY_MAP_CONFIG_TAB_KEY) {



        deliveryTabsState.activeKey = "";



      }



      deliveryMapAccountsLoaded = false;



      deliveryMapAccountsProviderName = "";



      deliveryMapAccountsOriginal = [];



      deliveryMapAccountsDraft = [];



      resetDeliveryMapAccountsTransientState();



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryWorkspace();



    }







    async function createDeliverySetting(payload) {



      try {



        const res = await authFetch("/api/admin/tenant/delivery-settings", {



          method: "POST",



          body: JSON.stringify(payload)



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось создать настройку доставки:", err);



        return null;



      }



    }







    async function updateDeliverySetting(id, payload) {



      try {



        const res = await authFetch(`/api/admin/tenant/delivery-settings/${encodeURIComponent(id)}`, {



          method: "PUT",



          body: JSON.stringify(payload)



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось обновить настройку доставки:", err);



        return null;



      }



    }







    async function deleteDeliverySetting(id) {



      try {



        const res = await authFetch(`/api/admin/tenant/delivery-settings/${encodeURIComponent(id)}`, {



          method: "DELETE"



        });



        const data = await res.json();



        return data || null;



      } catch (err) {



        console.error("Не удалось удалить настройку доставки:", err);



        return null;



      }



    }







    function renderDeliverySettingsList(items) {



      if (!deliverySettingsList) return;



      deliverySettingsList.innerHTML = "";



      if (!items.length) {



        if (deliveryEmpty) deliveryEmpty.classList.remove("hidden");



        return;



      }



      if (deliveryEmpty) deliveryEmpty.classList.add("hidden");







      items.forEach((setting) => {



        const row = document.createElement("button");



        row.type = "button";



        row.className = "settings-home-card settings-card";



        row.dataset.id = String(setting.id);







        const avatar = document.createElement("div");



        avatar.className = "product-avatar";



        avatar.innerHTML = '<i class="fas fa-truck"></i>';







        const info = document.createElement("div");



        info.className = "order-col";







        const title = document.createElement("div");



        title.className = "product-title";



        title.textContent = setting.name || `Настройка #${setting.id}`;







        const subtitle = document.createElement("div");



        subtitle.className = "muted";



        const normalized = normalizeDeliverySetting(setting);



        const etaText = normalized.eta_minutes != null && normalized.eta_minutes !== ""



          ? `${normalized.eta_minutes} мин`



          : "Без времени";



        subtitle.textContent = `${formatDeliverySettingTierSummary(normalized)} • ${etaText}`;







        info.appendChild(title);



        info.appendChild(subtitle);







        const action = document.createElement("div");



        action.className = "order-col";







        const badge = document.createElement("span");



        badge.className = "badge";



        badge.textContent = "Открыть";



        action.appendChild(badge);







        row.appendChild(avatar);



        row.appendChild(info);



        row.appendChild(action);







        row.addEventListener("click", () => selectDeliverySetting(setting));



        deliverySettingsList.appendChild(row);



      });



    }







    function renderDeliveryStoresCheckboxes(storeIds = [], defaultStoreId = null) {



      if (!deliveryStoresList) return;



      const normalizedIds = Array.from(new Set(



        (Array.isArray(storeIds) ? storeIds : [])



          .map((value) => Number(value))



          .filter((value) => Number.isFinite(value) && value > 0)



      ));



      const normalizedDefaultStoreId = Number(defaultStoreId);



      const nextDefaultStoreId = Number.isFinite(normalizedDefaultStoreId) && normalizedIds.includes(normalizedDefaultStoreId)



        ? normalizedDefaultStoreId



        : null;







      deliveryStoresList.dataset.selectedStoreIds = JSON.stringify(normalizedIds);



      deliveryStoresList.innerHTML = "";







      const stores = storesState.items || [];



      if (!stores.length) {



        const empty = document.createElement("div");



        empty.className = "settings-delivery-zone-store-empty muted";



        empty.textContent = "Нет доступных филиалов";



        deliveryStoresList.appendChild(empty);



        updateDeliveryDefaultStoreSelect([], null);



        return;



      }







      if (!normalizedIds.length) {



        const empty = document.createElement("div");



        empty.className = "settings-delivery-zone-store-empty";



        empty.textContent = "Нажмите В«+В», чтобы выбрать филиалы";



        deliveryStoresList.appendChild(empty);



        updateDeliveryDefaultStoreSelect([], null);



        return;



      }







      normalizedIds.forEach((storeId) => {



        const store = stores.find((item) => Number(item && item.id) === storeId) || null;



        const row = document.createElement("div");



        row.className = "settings-delivery-zone-store-pill";



        row.setAttribute("data-delivery-store-row", String(storeId));







        const icon = document.createElement("span");



        icon.className = "settings-delivery-zone-store-pill-icon";



        icon.innerHTML = '<i class="fas fa-store"></i>';







        const content = document.createElement("div");



        content.className = "settings-delivery-zone-store-pill-content";







        const title = document.createElement("span");



        title.className = "settings-delivery-zone-store-pill-title";



        title.textContent = store && store.name ? store.name : `Филиал #${storeId}`;



        content.appendChild(title);







        if (store && store.city) {



          const meta = document.createElement("span");



          meta.className = "settings-delivery-zone-store-pill-meta";



          meta.textContent = store.city;



          content.appendChild(meta);



        }







        const removeBtn = document.createElement("button");



        removeBtn.type = "button";



        removeBtn.className = "settings-delivery-zone-store-pill-remove";



        removeBtn.setAttribute("data-delivery-store-remove", String(storeId));



        removeBtn.setAttribute("aria-label", `Удалить филиал ${storeId}`);



        removeBtn.innerHTML = '<i class="fas fa-times"></i>';







        row.appendChild(icon);



        row.appendChild(content);



        row.appendChild(removeBtn);



        deliveryStoresList.appendChild(row);



      });







      updateDeliveryDefaultStoreSelect(normalizedIds, nextDefaultStoreId);



    }







    function updateDeliveryDefaultStoreSelect(storeIds, defaultStoreId) {



      if (!settingsDeliveryDefaultStore) return;



      const stores = storesState.items || [];



      const selectedStores = stores.filter((s) => storeIds.includes(s.id));



      settingsDeliveryDefaultStore.innerHTML = '<option value="">— не выбран —</option>';



      settingsDeliveryDefaultStore.disabled = selectedStores.length === 0;



      selectedStores.forEach((store) => {



        const opt = document.createElement("option");



        opt.value = store.id;



        opt.textContent = store.name || `Филиал #${store.id}`;



        if (defaultStoreId != null && store.id === defaultStoreId) opt.selected = true;



        settingsDeliveryDefaultStore.appendChild(opt);



      });



      if (defaultStoreId == null || !storeIds.includes(defaultStoreId)) {



        settingsDeliveryDefaultStore.value = "";



      }



      if (settingsDeliveryDefaultStoreTrigger) {



        settingsDeliveryDefaultStoreTrigger.disabled = selectedStores.length === 0;



      }



      if (settingsDeliveryDefaultStoreSelector) {



        settingsDeliveryDefaultStoreSelector.classList.toggle("is-disabled", selectedStores.length === 0);



      }



      if (settingsDeliveryDefaultStoreValue) {



        const selectedId = settingsDeliveryDefaultStore.value ? Number(settingsDeliveryDefaultStore.value) : null;



        const selectedStore = selectedStores.find((store) => Number(store && store.id) === selectedId) || null;



        settingsDeliveryDefaultStoreValue.textContent = selectedStore && selectedStore.name



          ? selectedStore.name



          : "— не выбран —";



      }



      if (settingsDeliveryDefaultStoreMenu) {



        settingsDeliveryDefaultStoreMenu.innerHTML = "";







        const emptyOption = document.createElement("button");



        emptyOption.type = "button";



        emptyOption.className = `new-order-right-select-option${settingsDeliveryDefaultStore.value ? "" : " is-selected"}`;



        emptyOption.setAttribute("role", "option");



        emptyOption.setAttribute("aria-selected", settingsDeliveryDefaultStore.value ? "false" : "true");



        emptyOption.setAttribute("data-delivery-default-store-option", "");



        emptyOption.textContent = "— не выбран —";



        settingsDeliveryDefaultStoreMenu.appendChild(emptyOption);







        selectedStores.forEach((store) => {



          const storeId = Number(store && store.id);



          if (!Number.isFinite(storeId) || storeId <= 0) return;



          const option = document.createElement("button");



          option.type = "button";



          option.className = `new-order-right-select-option${String(settingsDeliveryDefaultStore.value) === String(storeId) ? " is-selected" : ""}`;



          option.setAttribute("role", "option");



          option.setAttribute("aria-selected", String(settingsDeliveryDefaultStore.value) === String(storeId) ? "true" : "false");



          option.setAttribute("data-delivery-default-store-option", String(storeId));



          option.textContent = store.name || `Филиал #${storeId}`;



          settingsDeliveryDefaultStoreMenu.appendChild(option);



        });



      }



      if (!selectedStores.length) {



        closeDeliveryDefaultStoreDropdown();



      }



    }







    function closeDeliveryDefaultStoreDropdown() {



      if (settingsDeliveryDefaultStoreSelector) {



        settingsDeliveryDefaultStoreSelector.classList.remove("is-open", "is-drop-up");



      }



      if (settingsDeliveryDefaultStoreTrigger) {



        settingsDeliveryDefaultStoreTrigger.setAttribute("aria-expanded", "false");



      }



    }







    function openDeliveryDefaultStoreDropdown() {



      if (!settingsDeliveryDefaultStoreSelector || !settingsDeliveryDefaultStoreTrigger || settingsDeliveryDefaultStoreTrigger.disabled) return;



      const menuHeight = settingsDeliveryDefaultStoreMenu



        ? Math.min(settingsDeliveryDefaultStoreMenu.scrollHeight || 0, 230)



        : 0;



      const triggerRect = settingsDeliveryDefaultStoreTrigger.getBoundingClientRect();



      const shouldDropUp = menuHeight > 0



        && triggerRect.bottom + 8 + menuHeight > window.innerHeight - 12



        && triggerRect.top > menuHeight + 20;



      settingsDeliveryDefaultStoreSelector.classList.toggle("is-drop-up", shouldDropUp);



      settingsDeliveryDefaultStoreSelector.classList.add("is-open");



      settingsDeliveryDefaultStoreTrigger.setAttribute("aria-expanded", "true");



    }







    function toggleDeliveryDefaultStoreDropdown(forceOpen) {



      if (!settingsDeliveryDefaultStoreSelector || !settingsDeliveryDefaultStoreTrigger || settingsDeliveryDefaultStoreTrigger.disabled) return;



      const shouldOpen = typeof forceOpen === "boolean"



        ? forceOpen



        : !settingsDeliveryDefaultStoreSelector.classList.contains("is-open");



      if (!shouldOpen) {



        closeDeliveryDefaultStoreDropdown();



        return;



      }



      openDeliveryDefaultStoreDropdown();



    }







    if (settingsDeliveryDefaultStore) {



      settingsDeliveryDefaultStore.addEventListener("change", () => {



        updateDeliveryDefaultStoreSelect(getSelectedDeliveryStoreIds(), getSelectedDefaultDeliveryStoreId());



        updateActiveDeliveryDraft({



          store_ids: getSelectedDeliveryStoreIds(),



          default_store_id: getSelectedDefaultDeliveryStoreId(),



        });



      });



    }







    if (settingsDeliveryDefaultStoreTrigger) {



      settingsDeliveryDefaultStoreTrigger.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        toggleDeliveryDefaultStoreDropdown();



      });



    }







    if (settingsDeliveryDefaultStoreMenu) {



      settingsDeliveryDefaultStoreMenu.addEventListener("click", (event) => {



        const option = event.target && event.target.closest



          ? event.target.closest("[data-delivery-default-store-option]")



          : null;



        if (!option || !settingsDeliveryDefaultStore) return;



        event.preventDefault();



        event.stopPropagation();



        settingsDeliveryDefaultStore.value = String(option.getAttribute("data-delivery-default-store-option") || "");



        settingsDeliveryDefaultStore.dispatchEvent(new Event("change", { bubbles: true }));



        closeDeliveryDefaultStoreDropdown();



      });



    }







    document.addEventListener("click", (event) => {



      if (!settingsDeliveryDefaultStoreSelector || !settingsDeliveryDefaultStoreSelector.classList.contains("is-open")) return;



      if (settingsDeliveryDefaultStoreSelector.contains(event.target)) return;



      closeDeliveryDefaultStoreDropdown();



    });







    document.addEventListener("keydown", (event) => {



      if (event.key !== "Escape") return;



      closeDeliveryDefaultStoreDropdown();



    });







    if (settingsDeliveryStoresTriggerBtn) {



      settingsDeliveryStoresTriggerBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        openDeliveryStoresModal();



      });



    }







    if (deliveryStoresList) {



      deliveryStoresList.addEventListener("click", (event) => {



        const removeBtn = event.target && event.target.closest



          ? event.target.closest("[data-delivery-store-remove]")



          : null;



        if (!removeBtn) return;



        event.preventDefault();



        event.stopPropagation();



        removeDeliveryStore(removeBtn.getAttribute("data-delivery-store-remove"));



      });



    }







    function getSelectedDeliveryStoreIds() {



      if (!deliveryStoresList) return [];



      try {



        return JSON.parse(String(deliveryStoresList.dataset.selectedStoreIds || "[]"))



          .map((value) => Number(value))



          .filter((value) => Number.isFinite(value) && value > 0);



      } catch (_) {



        return [];



      }



    }







    function getSelectedDefaultDeliveryStoreId() {



      if (!settingsDeliveryDefaultStore || !settingsDeliveryDefaultStore.value) return null;



      const n = Number(settingsDeliveryDefaultStore.value);



      return Number.isFinite(n) && n > 0 ? n : null;



    }







    function removeDeliveryStore(storeId) {



      const activeTab = getActiveDeliveryTab();



      const normalizedStoreId = Number(storeId);



      if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



      if (!Number.isFinite(normalizedStoreId) || normalizedStoreId <= 0) return;



      const nextStoreIds = getSelectedDeliveryStoreIds()



        .filter((selectedStoreId) => selectedStoreId !== normalizedStoreId);



      const currentDefaultStoreId = getSelectedDefaultDeliveryStoreId();



      const nextDefaultStoreId = currentDefaultStoreId != null && nextStoreIds.includes(currentDefaultStoreId)



        ? currentDefaultStoreId



        : null;



      updateActiveDeliveryDraft({



        store_ids: nextStoreIds,



        default_store_id: nextDefaultStoreId,



      });



      renderDeliveryStoresCheckboxes(nextStoreIds, nextDefaultStoreId);



    }







    function openDeliveryStoresModal() {



      const activeTab = getActiveDeliveryTab();



      if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



      if (!window.AppModal || typeof window.AppModal.open !== "function") return;



      closeDeliveryDefaultStoreDropdown();







      const stores = Array.isArray(storesState.items) ? storesState.items.slice() : [];



      const selectedIds = new Set(getSelectedDeliveryStoreIds());



      const host = document.createElement("div");



      host.className = "settings-delivery-zone-stores-modal";







      const note = document.createElement("div");



      note.className = "settings-delivery-zone-stores-modal-note";



      note.textContent = stores.length



        ? "Выберите один или несколько филиалов для этой настройки доставки."



        : "Нет доступных филиалов для выбора.";







      const list = document.createElement("div");



      list.className = "settings-delivery-zone-stores-modal-list";







      host.appendChild(note);



      host.appendChild(list);







      function renderModalList() {



        list.innerHTML = "";



        if (!stores.length) {



          const empty = document.createElement("div");



          empty.className = "settings-delivery-zone-stores-modal-empty";



          empty.textContent = "Сначала создайте филиал РІ разделе филиалов.";



          list.appendChild(empty);



          return;



        }







        stores.forEach((store) => {



          const storeId = Number(store && store.id);



          if (!Number.isFinite(storeId) || storeId <= 0) return;







          const btn = document.createElement("button");



          btn.type = "button";



          btn.className = "settings-delivery-zone-stores-modal-item";



          btn.classList.toggle("is-selected", selectedIds.has(storeId));







          const marker = document.createElement("span");



          marker.className = "settings-delivery-zone-stores-modal-item-marker";







          const content = document.createElement("span");



          content.className = "settings-delivery-zone-stores-modal-item-content";







          const title = document.createElement("span");



          title.className = "settings-delivery-zone-stores-modal-item-title";



          title.textContent = store.name || `Филиал #${storeId}`;



          content.appendChild(title);







          if (store.city) {



            const meta = document.createElement("span");



            meta.className = "settings-delivery-zone-stores-modal-item-meta";



            meta.textContent = store.city;



            content.appendChild(meta);



          }







          btn.appendChild(marker);



          btn.appendChild(content);



          btn.addEventListener("click", () => {



            if (selectedIds.has(storeId)) {



              selectedIds.delete(storeId);



            } else {



              selectedIds.add(storeId);



            }



            renderModalList();



          });



          list.appendChild(btn);



        });



      }







      renderModalList();



      toggleDeliveryZoneStoresModalSkin(true);



      window.AppModal.open({



        title: "Выбор филиалов",



        saveText: "Применить",



        cancelText: "Отмена",



        content: host,



        onSave: () => {



          const orderedIds = stores



            .map((store) => Number(store && store.id))



            .filter((storeId) => Number.isFinite(storeId) && selectedIds.has(storeId));



          const currentDefaultStoreId = getSelectedDefaultDeliveryStoreId();



          const nextDefaultStoreId = currentDefaultStoreId != null && orderedIds.includes(currentDefaultStoreId)



            ? currentDefaultStoreId



            : null;



          updateActiveDeliveryDraft({



            store_ids: orderedIds,



            default_store_id: nextDefaultStoreId,



          });



          renderDeliveryStoresCheckboxes(orderedIds, nextDefaultStoreId);



          return true;



        },



        onClose: () => {



          toggleDeliveryZoneStoresModalSkin(false);



        },



      });



    }







    function fillDeliverySettingForm(setting) {



      if (!setting) return;



      const normalized = normalizeDeliverySetting(setting);



      if (settingsDeliverySubtitle) {



        settingsDeliverySubtitle.textContent = "";



        settingsDeliverySubtitle.classList.add("hidden");



      }



      if (settingsDeliveryName) settingsDeliveryName.value = normalized.name || "";



      if (settingsDeliveryEtaMinutes) settingsDeliveryEtaMinutes.value = normalized.eta_minutes == null ? "" : String(normalized.eta_minutes);



      if (settingsDeliveryActive) settingsDeliveryActive.checked = Number(normalized.is_active) === 1;



      renderDeliverySettingPriceTiers(normalized.price_tiers);



      syncDeliveryDraftLegacyFields(normalized);



      const storeIds = normalized.store_ids || [];



      const defaultStoreId = normalized.default_store_id != null ? Number(normalized.default_store_id) : null;



      renderDeliveryStoresCheckboxes(storeIds, defaultStoreId);



    }







    function setDeliveryMode(mode, setting) {



      deliverySettingsState.mode = mode;



      if (settingsDeliverySaveText) {



        settingsDeliverySaveText.textContent = mode === "create" ? "Создать" : "Сохранить";



      }



      if (settingsDeliveryDeleteBtn) {



        settingsDeliveryDeleteBtn.classList.toggle("hidden", mode === "create");



      }



      if (mode === "create") {



        if (settingsDeliverySubtitle) {



          settingsDeliverySubtitle.textContent = "Новая настройка";



          settingsDeliverySubtitle.classList.remove("hidden");



        }



        if (settingsDeliveryName) settingsDeliveryName.value = "";



        if (settingsDeliveryEtaMinutes) settingsDeliveryEtaMinutes.value = "";



        if (settingsDeliveryCost) settingsDeliveryCost.value = "";



        if (settingsDeliveryMinOrder) settingsDeliveryMinOrder.value = "";



        if (settingsDeliveryFreeFrom) settingsDeliveryFreeFrom.value = "";



        if (settingsDeliveryActive) settingsDeliveryActive.checked = true;



        renderDeliverySettingPriceTiers([createEmptyDeliveryZoneTierDraft()]);



        renderDeliveryStoresCheckboxes([], null);



      } else if (setting) {



        fillDeliverySettingForm(setting);



      }



    }







    function selectDeliverySetting(setting) {



      if (!setting) return;



      deliverySettingsState.selectedId = setting.id;



      deliverySettingsState.snapshot = { ...setting };



      setDeliveryMode("edit", setting);



      ensureTab(DELIVERY_TAB_ID, setting.name || "Настройка доставки");



    }







    async function loadDeliverySettings() {



      const data = await fetchDeliverySettings();



      if (!data || !data.ok) return;



      const items = Array.isArray(data.items) ? data.items : [];



      deliverySettingsState.loaded = true;



      deliverySettingsState.items = items;



      if (settingsCenterSubtitle) {



        const section = document.body.getAttribute("data-settings-section");



        if (section === "delivery") {



          const count = items.length;



          settingsCenterSubtitle.textContent = count ? `Настроек: ${count}` : "Настроек пока нет";



        }



      }



      renderDeliverySettingsList(items);



      if (!deliverySettingsState.selectedId) {



        setActiveRightTab("");



      } else {



        const current = items.find((s) => s.id === deliverySettingsState.selectedId);



        if (current) {



          selectDeliverySetting(current);



        } else {



          deliverySettingsState.selectedId = null;



          setActiveRightTab("");



        }



      }



    }







    function startCreateDeliverySetting() {



      deliverySettingsState.selectedId = null;



      deliverySettingsState.snapshot = null;



      setDeliveryMode("create");



      ensureTab(DELIVERY_TAB_ID, "Новая настройка");



      if (settingsDeliveryName) settingsDeliveryName.focus();



    }







    function selectDeliverySetting(setting) {



      const normalized = normalizeDeliverySetting(setting);



      openDeliverySettingTab(normalized);



      deliverySettingsState.selectedId = normalized.id;



      deliverySettingsState.snapshot = { ...normalized };



      deliverySettingsState.mode = "edit";



    }







    async function loadDeliverySettings() {



      const data = await fetchDeliverySettings();



      if (!data || !data.ok) return;



      const items = Array.isArray(data.items) ? data.items.map((item) => normalizeDeliverySetting(item)) : [];



      deliverySettingsState.loaded = true;



      deliverySettingsState.items = items;



      if (settingsCenterSubtitle && document.body.getAttribute("data-settings-section") === "delivery") {



        settingsCenterSubtitle.textContent = items.length ? `Настроек: ${items.length}` : "Настроек пока нет";



      }



      syncDeliveryTabsWithItems(items);



      renderDeliveryHomeList(items);



      renderDeliveryWorkspace();



    }







    async function loadDeliveryZones() {



      const data = await fetchDeliveryZones();



      if (!data || !data.ok) return;



      const items = Array.isArray(data.items) ? data.items.map((item) => normalizeDeliveryZone(item)) : [];



      deliveryZonesState.loaded = true;



      deliveryZonesState.items = items;



      syncDeliveryTabsWithItems(deliverySettingsState.items, items);



      renderDeliveryZonesHomeList(items);



      renderDeliveryWorkspace();



      refreshDeliveryZoneLayers();



    }







    function startCreateDeliverySetting() {



      openNewDeliveryTab();



      deliverySettingsState.selectedId = null;



      deliverySettingsState.snapshot = null;



      deliverySettingsState.mode = "create";



    }







    function startCreateDeliveryZone() {



      openNewDeliveryZoneTab();



      deliveryZonesState.selectedId = null;



      deliveryZonesState.snapshot = null;



      deliveryZonesState.mode = "create";



    }







    if (settingsDeliveryTabs) {



      settingsDeliveryTabs.addEventListener("click", (event) => {



        const closeBtn = event.target.closest("[data-delivery-tab-close]");



        if (closeBtn) {



          event.preventDefault();



          event.stopPropagation();



          closeDeliveryTab(closeBtn.getAttribute("data-delivery-tab-close"));



          return;



        }



        const tabEl = event.target.closest("[data-delivery-tab-key]");



        if (!tabEl) return;



        event.preventDefault();



        setActiveDeliveryTab(tabEl.getAttribute("data-delivery-tab-key"));



      });



    }







    if (settingsDeliveryTabsHomeBtn) {



      settingsDeliveryTabsHomeBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        goToDeliveryHome();



      });



    }







    resetDeliveryMapAccountsTransientState();







    if (settingsDeliveryMapAccountAddBtn) {



      settingsDeliveryMapAccountAddBtn.addEventListener("click", () => {



        if (deliveryMapAccountsAddMode) {



          closeDeliveryMapAddForm();



          return;



        }



        openDeliveryMapAddForm();



      });



    }







    if (settingsDeliveryMapAccountAddCancelBtn) {



      settingsDeliveryMapAccountAddCancelBtn.addEventListener("click", () => {



        closeDeliveryMapAddForm();



      });



    }







    if (settingsDeliveryMapAccountAddConfirmBtn) {



      settingsDeliveryMapAccountAddConfirmBtn.addEventListener("click", () => {



        const nextDraft = updateDeliveryMapAddDraftFromInputs();



        if (!String(nextDraft.api_key || "").trim()) {



          alert("Введите API key.");



          if (settingsDeliveryMapAccountAddApiKey) settingsDeliveryMapAccountAddApiKey.focus();



          return;



        }







        const nextItems = cloneDeliveryMapAccounts(deliveryMapAccountsDraft);



        nextItems.push({



          id: buildDeliveryMapAccountClientId(),



          api_key: String(nextDraft.api_key || "").trim(),



          login: String(nextDraft.login || "").trim(),



          password: String(nextDraft.password || "").trim(),



          is_active: nextItems.length === 0



        });



        deliveryMapAccountsDraft = nextItems;



        if (!deliveryMapAccountsDraft.some((item) => item.is_active)) {



          setActiveDeliveryMapDraftAccount(String(deliveryMapAccountsDraft[0] && deliveryMapAccountsDraft[0].id || ""));



        }



        closeDeliveryMapAddForm();



        renderDeliveryMapAccountsPanel();



      });



    }







    // Update settingsSectionButtons click handler for delivery section



    settingsSectionButtons.forEach((btn) => {



      btn.addEventListener("click", () => {



        const section = btn.getAttribute("data-settings-section") || "";



        const isDelivery = section === "delivery";



        const isSystem = section === "system";



        applySettingsCardsFilterBySection(section);



        syncSettingsToolbarControls(section);







        if (settingsCenterTitle && isDelivery) {



          settingsCenterTitle.textContent = "Доставка";



        }



        if (settingsCenterSubtitle && isDelivery) {



          settingsCenterSubtitle.textContent = "Загрузка...";



        }



        if (settingsTenantCards) settingsTenantCards.classList.toggle("hidden", isDelivery || isSystem || section === "stores" || section === "site");



        if (settingsCardsPanel) settingsCardsPanel.classList.toggle("hidden", isDelivery || isSystem || section === "stores" || section === "site");



        if (deliveryPanel) deliveryPanel.classList.toggle("hidden", !isDelivery);



        if (storesPanel) storesPanel.classList.toggle("hidden", section !== "stores");



        if (siteSectionPanel) siteSectionPanel.classList.toggle("hidden", section !== "site");



        if (systemSectionPanel) systemSectionPanel.classList.toggle("hidden", !isSystem);



        syncSettingsSectionPanels(section);







        if (isDelivery) {



          if (rightDefault) rightDefault.classList.add("hidden");



          if (rightHeader) rightHeader.classList.add("hidden");



          if (rightTabs) rightTabs.classList.add("hidden");



          if (settingsStoreEmpty) settingsStoreEmpty.classList.add("hidden");



          if (settingsStorePanel) settingsStorePanel.classList.add("hidden");



          goToDeliveryHome();



          renderDeliveryWorkspace();



          syncDeliveryMapStoresState();



          setActiveRightTab("");



          // Load stores first for delivery conditions, zones and map context.



          if (!storesState.loaded) {



            fetchStores().then((data) => {



              if (data && data.ok) {



                storesState.items = data.stores || [];



                storesState.loaded = true;



                syncDeliveryMapStoresState();



              }



              loadDeliverySettings();



              loadDeliveryZones();



              refreshDeliveryMapPreview(true);



            });



          } else {



            loadDeliverySettings();



            loadDeliveryZones();



            refreshDeliveryMapPreview(true);



          }



        } else {



          persistActiveDeliveryDraft();



          stopDeliveryZoneMapModes();



          if (settingsDeliveryTabsHeader) settingsDeliveryTabsHeader.classList.add("hidden");



          if (settingsDeliveryPanel) settingsDeliveryPanel.classList.add("hidden");



          if (settingsDeliveryFooter) settingsDeliveryFooter.classList.add("hidden");



          if (settingsDeliveryZonePanel) settingsDeliveryZonePanel.classList.add("hidden");



          if (settingsDeliveryZoneFooter) settingsDeliveryZoneFooter.classList.add("hidden");



          if (settingsDeliveryMapConfigPanel) settingsDeliveryMapConfigPanel.classList.add("hidden");



          if (settingsDeliveryMapConfigFooter) settingsDeliveryMapConfigFooter.classList.add("hidden");



          if (settingsDeliveryEmpty) settingsDeliveryEmpty.classList.add("hidden");



          closeDeliveryCreateMenu();



        }



      });



    });







    // Add new delivery setting button



    if (settingsAddOrderBtn) {



      settingsAddOrderBtn.addEventListener("click", () => {



        const section = document.body.getAttribute("data-settings-section");



        if (section === "delivery") {



          if (deliveryCreateMenuOpen) {



            closeDeliveryCreateMenu();



          } else {



            openDeliveryCreateMenu();



          }



        }



      });



    }







    if (settingsDeliverySaveBtn) {



      settingsDeliverySaveBtn.addEventListener("click", async () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab) return;



        if (isDeliveryMapConfigTab(activeTab)) {



          const payload = buildDeliveryMapDraftPayload();



          if (payload.length > 20) {



            alert("Можно сохранить не больше 20 API.");



            return;



          }



          if (payload.some((item) => !String(item.api_key || "").trim())) {



            alert("У каждого API должен быть заполнен ключ.");



            return;



          }



          const saveResult = await saveDeliveryMapAccounts(payload);



          if (!saveResult || !saveResult.ok) {



            alert("Не удалось сохранить настройки карты.");



            return;



          }



          applyLoadedDeliveryMapAccounts(saveResult);



          deliveryMapConfigCache = null;



          refreshDeliveryMapPreview(true);



          return;



        }



        const draft = readDeliveryFormDraft();



        activeTab.draft = cloneDeliveryDraft(draft);



        const tiersResult = normalizeDeliverySettingPriceTiersForSave(draft.price_tiers);



        if (!tiersResult.ok) {



          alert(tiersResult.error);



          return;



        }



        const nextPayload = {



          name: String(draft.name || "").trim() || null,



          eta_minutes: String(draft.eta_minutes || "").trim() ? Number(draft.eta_minutes) || 0 : null,



          delivery_cost: Number(draft.delivery_cost) || 0,



          min_order_amount: Number(draft.min_order_amount) || 0,



          free_delivery_from: String(draft.free_delivery_from || "").trim() ? Number(draft.free_delivery_from) : null,



          is_active: draft.is_active ? 1 : 0,



          store_ids: Array.isArray(draft.store_ids) ? draft.store_ids.slice() : [],



          default_store_id: draft.default_store_id,



          price_tiers: tiersResult.items



        };







        if (!nextPayload.name) {



          alert("Введите название настройки доставки.");



          return;



        }







        let saveResult = null;



        if (activeTab.mode === "create") {



          saveResult = await createDeliverySetting(nextPayload);



          if (!saveResult || !saveResult.ok || !saveResult.item) {



            alert("Не удалось создать настройку доставки.");



            return;



          }



          const savedItem = normalizeDeliverySetting(saveResult.item);



          activeTab.key = `delivery:${savedItem.id}`;



          activeTab.id = savedItem.id;



          activeTab.mode = "edit";



          activeTab.snapshot = savedItem;



          activeTab.draft = createDeliveryDraftFromSetting(savedItem);



          deliveryTabsState.activeKey = activeTab.key;



        } else {



          if (!activeTab.id) return;



          saveResult = await updateDeliverySetting(activeTab.id, nextPayload);



          if (!saveResult || !saveResult.ok || !saveResult.item) {



            alert("Не удалось сохранить изменения.");



            return;



          }



          const savedItem = normalizeDeliverySetting(saveResult.item);



          activeTab.snapshot = savedItem;



          activeTab.draft = createDeliveryDraftFromSetting(savedItem);



        }







        await loadDeliverySettings();



        return;



        const payload = {



          name: settingsDeliveryName?.value.trim() || null,



          delivery_cost: Number(settingsDeliveryCost?.value) || 0,



          min_order_amount: Number(settingsDeliveryMinOrder?.value) || 0,



          free_delivery_from: settingsDeliveryFreeFrom?.value ? Number(settingsDeliveryFreeFrom.value) : null,



          is_active: settingsDeliveryActive?.checked ? 1 : 0,



          store_ids: getSelectedDeliveryStoreIds(),



          default_store_id: getSelectedDefaultDeliveryStoreId()



        };







        if (!payload.name) {



          alert("Введите название настройки доставки.");



          return;



        }







        let data = null;



        if (deliverySettingsState.mode === "create") {



          data = await createDeliverySetting(payload);



          if (!data || !data.ok || !data.item) {



            alert("Не удалось создать настройку доставки.");



            return;



          }



          deliverySettingsState.selectedId = data.item.id;



          deliverySettingsState.snapshot = { ...data.item };



          setDeliveryMode("edit", data.item);



          ensureTab(DELIVERY_TAB_ID, data.item.name || "Настройка доставки");



        } else {



          const id = deliverySettingsState.selectedId;



          if (!id) return;



          data = await updateDeliverySetting(id, payload);



          if (!data || !data.ok || !data.item) {



            alert("Не удалось сохранить изменения.");



            return;



          }



          deliverySettingsState.snapshot = { ...data.item };



          fillDeliverySettingForm(data.item);



          ensureTab(DELIVERY_TAB_ID, data.item.name || "Настройка доставки");



        }







        await loadDeliverySettings();



      });



    }







    if (settingsDeliveryResetBtn) {



      settingsDeliveryResetBtn.addEventListener("click", () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab) return;



        if (isDeliveryMapConfigTab(activeTab)) {



          resetDeliveryMapAccountsToOriginal();



          return;



        }



        activeTab.draft = activeTab.mode === "create"



          ? createEmptyDeliveryDraft()



          : createDeliveryDraftFromSetting(activeTab.snapshot);



        applyDeliveryFormDraft(activeTab);



        return;



        if (deliverySettingsState.mode === "create") {



          setDeliveryMode("create");



          return;



        }



        if (!deliverySettingsState.snapshot) return;



        fillDeliverySettingForm(deliverySettingsState.snapshot);



      });



    }







    if (settingsDeliveryMapConfigSaveBtn) {



      settingsDeliveryMapConfigSaveBtn.addEventListener("click", async () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryMapConfigTab(activeTab)) return;



        const payload = buildDeliveryMapDraftPayload();



        if (payload.length > 20) {



          alert("Можно сохранить не больше 20 API.");



          return;



        }



        if (payload.some((item) => !String(item.api_key || "").trim())) {



          alert("У каждого API должен быть заполнен ключ.");



          return;



        }



        const saveResult = await saveDeliveryMapAccounts(payload);



        if (!saveResult || !saveResult.ok) {



          alert("Не удалось сохранить настройки карты.");



          return;



        }



        applyLoadedDeliveryMapAccounts(saveResult);



        deliveryMapConfigCache = null;



        refreshDeliveryMapPreview(true);



      });



    }







    if (settingsDeliveryMapConfigResetBtn) {



      settingsDeliveryMapConfigResetBtn.addEventListener("click", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryMapConfigTab(activeTab)) return;



        resetDeliveryMapAccountsToOriginal();



      });



    }







    if (settingsDeliveryDeleteBtn) {



      settingsDeliveryDeleteBtn.addEventListener("click", async () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || !activeTab.id) return;



        if (!confirm("Удалить эту настройку доставки?")) return;



        const deleteResult = await deleteDeliverySetting(activeTab.id);



        if (!deleteResult || !deleteResult.ok) {



          alert("Не удалось удалить настройку.");



          return;



        }



        closeDeliveryTab(activeTab.key);



        await loadDeliverySettings();



        return;



        const id = deliverySettingsState.selectedId;



        if (!id) return;



        if (!confirm("Удалить эту настройку доставки?")) return;



        const data = await deleteDeliverySetting(id);



        if (!data || !data.ok) {



          alert("Не удалось удалить настройку.");



          return;



        }



        deliverySettingsState.selectedId = null;



        deliverySettingsState.snapshot = null;



        setActiveRightTab("");



        await loadDeliverySettings();



      });



    }







    // --- Фото товаров (images settings) ---



    function getDeliveryZoneStoreMap() {



      return new Map(



        (Array.isArray(storesState.items) ? storesState.items : [])



          .map((store) => [Number(store && store.id), store])



          .filter(([id]) => Number.isFinite(id) && id > 0)



      );



    }







    function getDeliveryZoneStoreItems(zone) {



      const storeMap = getDeliveryZoneStoreMap();



      return (Array.isArray(zone && zone.store_ids) ? zone.store_ids : [])



        .map((storeId) => storeMap.get(Number(storeId)))



        .filter(Boolean);



    }







    function isDeliveryZoneVisible(zone) {



      const activeCityKey = normalizeDeliveryMapCityName(getActiveDeliveryMapCityName());



      if (!activeCityKey) return true;



      const storeItems = getDeliveryZoneStoreItems(zone);



      if (!storeItems.length) return false;



      return storeItems.some((store) => normalizeDeliveryMapCityName(store && store.city) === activeCityKey);



    }







    function getVisibleDeliveryZoneItems(items = deliveryZonesState.items) {



      const list = Array.isArray(items) ? items.map((item) => normalizeDeliveryZone(item)) : [];



      return list.filter((zone) => isDeliveryZoneVisible(zone));



    }







    function buildDeliveryZoneStyle(zoneLike, options = {}) {



      const zone = zoneLike && typeof zoneLike === "object" ? zoneLike : {};



      const color = String(zone.color || "#ff7a00").trim() || "#ff7a00";



      const isActive = Boolean(options.active);



      const isSelected = Boolean(options.selected);



      return {



        color,



        weight: isSelected ? 4 : (isActive ? 3 : 2),



        opacity: isSelected ? 1 : (isActive ? 0.95 : 0.78),



        fillColor: color,



        fillOpacity: isSelected ? 0.32 : (isActive ? 0.24 : 0.14),



        dashArray: isActive ? "" : "6 4",



      };



    }







    function normalizeDeliveryZoneDraftPoint(point) {



      const lat = Number(point && point.lat);



      const lng = Number(point && point.lng);



      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;



      return { lat, lng };



    }







    function cloneDeliveryZoneDraftPoints(points) {



      return Array.isArray(points)



        ? points.map((point) => normalizeDeliveryZoneDraftPoint(point)).filter(Boolean)



        : [];



    }







    function getDeliveryZoneDraftLatLngs(points) {



      return cloneDeliveryZoneDraftPoints(points).map((point) => window.L.latLng(point.lat, point.lng));



    }







    function buildDeliveryZonePolygonCoordinatesFromPoints(points) {



      const normalizedPoints = cloneDeliveryZoneDraftPoints(points);



      if (normalizedPoints.length < 3) return null;



      const ring = normalizedPoints.map((point) => [point.lng, point.lat]);



      const [firstLng, firstLat] = ring[0];



      const [lastLng, lastLat] = ring[ring.length - 1];



      if (firstLng !== lastLng || firstLat !== lastLat) {



        ring.push([firstLng, firstLat]);



      }



      return [ring];



    }







    function getDeliveryZonePolygonPointsFromGeometry(geometry, polygonIndex = 0) {



      const normalized = normalizeDeliveryZoneGeometryValue(geometry);



      if (!normalized || !Array.isArray(normalized.coordinates) || !normalized.coordinates.length) return [];



      const nextIndex = Math.max(0, Math.min(Number(polygonIndex) || 0, normalized.coordinates.length - 1));



      const polygon = normalized.coordinates[nextIndex];



      const ring = Array.isArray(polygon) && polygon.length ? polygon[0] : null;



      if (!Array.isArray(ring) || !ring.length) return [];



      const points = ring



        .map((coord) => ({



          lng: Number(Array.isArray(coord) ? coord[0] : null),



          lat: Number(Array.isArray(coord) ? coord[1] : null),



        }))



        .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));



      if (points.length > 1) {



        const first = points[0];



        const last = points[points.length - 1];



        if (first.lat === last.lat && first.lng === last.lng) {



          points.pop();



        }



      }



      return points;



    }







    function buildDeliveryZoneGeometryWithUpdatedPolygon(geometry, polygonIndex, points) {



      const normalized = normalizeDeliveryZoneGeometryValue(geometry);



      const polygonCoordinates = buildDeliveryZonePolygonCoordinatesFromPoints(points);



      if (!normalized || !Array.isArray(normalized.coordinates) || !normalized.coordinates.length || !polygonCoordinates) {



        return null;



      }



      const nextIndex = Math.max(0, Math.min(Number(polygonIndex) || 0, normalized.coordinates.length - 1));



      const nextCoordinates = normalized.coordinates.map((polygon, index) => (



        index === nextIndex ? polygonCoordinates : polygon



      ));



      return {



        type: "MultiPolygon",



        coordinates: nextCoordinates,



      };



    }







    function buildDeliveryZoneMidpointPoint(startPoint, endPoint) {



      return normalizeDeliveryZoneDraftPoint({



        lat: (Number(startPoint && startPoint.lat) + Number(endPoint && endPoint.lat)) / 2,



        lng: (Number(startPoint && startPoint.lng) + Number(endPoint && endPoint.lng)) / 2,



      });



    }







    function buildDeliveryZoneMidpointDescriptors(points, options = {}) {



      const normalizedPoints = cloneDeliveryZoneDraftPoints(points);



      const isClosed = Boolean(options.closed);



      const descriptors = [];



      if (normalizedPoints.length < 2) return descriptors;



      const limit = isClosed ? normalizedPoints.length : normalizedPoints.length - 1;



      for (let index = 0; index < limit; index += 1) {



        const nextIndex = isClosed ? (index + 1) % normalizedPoints.length : index + 1;



        const startPoint = normalizedPoints[index];



        const endPoint = normalizedPoints[nextIndex];



        if (!startPoint || !endPoint) continue;



        const midpoint = buildDeliveryZoneMidpointPoint(startPoint, endPoint);



        if (!midpoint) continue;



        descriptors.push({



          segment_index: index,



          insert_index: index + 1,



          point: midpoint,



        });



      }



      return descriptors;



    }







    function shouldShowDeliveryZoneMidpointHandles() {



      return Boolean(deliveryLeafletMap && typeof deliveryLeafletMap.getZoom === "function" && deliveryLeafletMap.getZoom() >= DELIVERY_ZONE_MIDPOINT_MIN_ZOOM);



    }







    function setDeliveryMapDraggingEnabled(enabled) {



      if (!deliveryLeafletMap || !deliveryLeafletMap.dragging) return;



      try {



        if (enabled) {



          deliveryLeafletMap.dragging.enable();



        } else {



          deliveryLeafletMap.dragging.disable();



        }



      } catch (_) {}



    }







    function buildDeliveryZoneHandleIcon(type, options = {}) {



      if (!window.L) return null;



      const handleType = type === "midpoint" ? "midpoint" : "main";



      const classes = [



        "settings-delivery-zone-handle",



        `settings-delivery-zone-handle--${handleType}`,



      ];



      if (options.last) classes.push("is-last");



      if (options.passive) classes.push("settings-delivery-zone-handle--passive");



      const boxSize = handleType === "midpoint" ? 12 : 16;



      const iconSize = boxSize + 6;



      const color = String(options.color || "#ff7a00").trim() || "#ff7a00";



      return window.L.divIcon({



        className: classes.join(" "),



        html: `<span class="settings-delivery-zone-handle-dot" style="--handle-color:${color}"></span>`,



        iconSize: [iconSize, iconSize],



        iconAnchor: [iconSize / 2, iconSize / 2],



      });



    }







    function buildDeliveryZoneMapHint(tab) {



      if (!isDeliveryZoneTab(tab)) return "";



      const pointsCount = getDeliveryZoneDraftPoints(tab).length;



      const polygonsCount = countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry);



      if (isDeliveryZonePlacingMode(tab)) {



        if (pointsCount <= 0) return "Поставьте первую точку зоны";



        if (pointsCount === 1) return "Поставьте следующую точку";



        if (pointsCount === 2) return "После второй точки на линии появится вспомогательная точка";



        return "Нажмите на последнюю точку, чтобы завершить или продолжить контур";



      }



      if (isDeliveryZoneEditingMode(tab) && polygonsCount > 0) {



        return "Тяните основные точки или точки на линиях, чтобы менять форму зоны";



      }



      if (isDeliveryZoneViewMode(tab) && polygonsCount > 0) {



        return "Нажмите «Редактировать», чтобы включить активные точки полигона";



      }



      if (polygonsCount > 0) {



        return "Зона создана. Точки можно двигать мышкой";



      }



      return "Поставьте первую точку зоны";



    }







    function positionDeliveryZonePointMenu() {



      if (!settingsDeliveryZonePointMenu) return;



      const shouldShow = Boolean(



        deliveryLeafletMap



        && settingsDeliveryMapBlock



        && deliveryZonesState.pointMenuOpen



        && deliveryZonesState.pointMenuLatLng



      );



      settingsDeliveryZonePointMenu.classList.toggle("hidden", !shouldShow);



      if (!shouldShow) return;



      const anchor = window.L.latLng(deliveryZonesState.pointMenuLatLng.lat, deliveryZonesState.pointMenuLatLng.lng);



      const point = deliveryLeafletMap.latLngToContainerPoint(anchor);



      const mapRect = settingsDeliveryMapBlock.getBoundingClientRect();



      const menuRect = settingsDeliveryZonePointMenu.getBoundingClientRect();



      const maxLeft = Math.max(12, mapRect.width - menuRect.width - 12);



      const maxTop = Math.max(12, mapRect.height - menuRect.height - 12);



      const left = Math.min(Math.max(12, point.x + 12), maxLeft);



      const top = Math.min(Math.max(12, point.y - 8), maxTop);



      settingsDeliveryZonePointMenu.style.left = `${Math.round(left)}px`;



      settingsDeliveryZonePointMenu.style.top = `${Math.round(top)}px`;



    }







    function syncDeliveryZoneMapOverlay() {



      const activeTab = getActiveDeliveryTab();



      const showOverlay = Boolean(



        document.body.getAttribute("data-settings-section") === "delivery"



        && isDeliveryZoneFeatureAvailable()



        && isDeliveryZoneTab(activeTab)



        && deliveryLeafletMap



        && settingsDeliveryMapCanvas



        && !settingsDeliveryMapCanvas.classList.contains("hidden")



      );



      if (settingsDeliveryZoneMapOverlay) {



        settingsDeliveryZoneMapOverlay.classList.toggle("hidden", !showOverlay);



      }



      if (!showOverlay) {



        deliveryZonesState.pointMenuOpen = false;



        deliveryZonesState.pointMenuLatLng = null;



        if (settingsDeliveryZonePointMenu) settingsDeliveryZonePointMenu.classList.add("hidden");



        syncDeliveryZoneEditButton(null);



        return;



      }



      const uiState = getDeliveryZoneTabUiState(activeTab);



      const pointsCount = uiState.draft_points.length;



      const polygonsCount = countDeliveryZonePolygons(activeTab && activeTab.draft && activeTab.draft.geometry);



      const selectedIndex = getDeliveryZoneSelectedPolygonIndex(activeTab);



      const isEditing = isDeliveryZoneEditingMode(activeTab);



      if (settingsDeliveryZoneMapHint) {



        settingsDeliveryZoneMapHint.textContent = buildDeliveryZoneMapHint(activeTab);



      }



      if (settingsDeliveryZoneUndoBtn) {



        settingsDeliveryZoneUndoBtn.disabled = pointsCount <= 0;



      }



      if (settingsDeliveryZoneClearPointsBtn) {



        settingsDeliveryZoneClearPointsBtn.disabled = pointsCount <= 0;



      }



      if (settingsDeliveryZoneAddPolygonBtn) {



        const canAddPolygon = polygonsCount > 0 && isEditing;



        settingsDeliveryZoneAddPolygonBtn.classList.toggle("hidden", !canAddPolygon);



      }



      if (settingsDeliveryZoneRemovePolygonBtn) {



        const canRemovePolygon = polygonsCount > 0 && isEditing && selectedIndex >= 0;



        settingsDeliveryZoneRemovePolygonBtn.classList.toggle("hidden", !canRemovePolygon);



      }



      if (settingsDeliveryZonePointMenuFinishBtn) {



        settingsDeliveryZonePointMenuFinishBtn.disabled = pointsCount < 3;



      }



      syncDeliveryZoneEditButton(activeTab);



      positionDeliveryZonePointMenu();



    }







    function setActiveDeliveryZoneUiMode(mode, options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      const current = getDeliveryZoneTabUiState(activeTab);



      const nextMode = String(mode || "").trim() || current.mode || "placing";



      const nextState = {



        ...current,



        mode: nextMode,



      };



      if (options.clearDraftPoints) {



        nextState.draft_points = [];



      }



      if (options.selectedPolygonIndex !== undefined) {



        nextState.selected_polygon_index = Number.isInteger(options.selectedPolygonIndex)



          ? Number(options.selectedPolygonIndex)



          : -1;



      }



      setDeliveryZoneTabUiState(activeTab, nextState);



      if (options.closePointMenu !== false) {



        closeDeliveryZonePointMenu();



      }



      return getDeliveryZoneTabUiState(activeTab);



    }







    function enterActiveDeliveryZoneEditMode() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      closeDeliveryZonePointMenu();



      closeDeliveryZoneContextMenu();



      const polygonsCount = countDeliveryZonePolygons(activeTab && activeTab.draft && activeTab.draft.geometry);



      if (polygonsCount <= 0) {



        startActiveDeliveryZonePolygonPlacement();



        return getDeliveryZoneTabUiState(activeTab);



      }



      const selectedIndex = getDeliveryZoneSelectedPolygonIndex(activeTab);



      setActiveDeliveryZoneUiMode("editing", {



        selectedPolygonIndex: selectedIndex >= 0 ? selectedIndex : 0,



      });



      syncDeliveryZoneMapEditing();



      return getDeliveryZoneTabUiState(activeTab);



    }







    function exitActiveDeliveryZoneEditMode(options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      const polygonsCount = countDeliveryZonePolygons(activeTab && activeTab.draft && activeTab.draft.geometry);



      const nextMode = polygonsCount > 0 && activeTab.mode === "edit" ? "view" : (polygonsCount > 0 ? "editing" : "placing");



      setActiveDeliveryZoneUiMode(nextMode, {



        selectedPolygonIndex: polygonsCount > 0 ? Math.max(0, getDeliveryZoneSelectedPolygonIndex(activeTab)) : -1,



      });



      if (options.syncMap !== false) {



        syncDeliveryZoneMapEditing();



      }



      return getDeliveryZoneTabUiState(activeTab);



    }







    function updateActiveDeliveryZoneDraftPoints(nextPoints, options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return [];



      setDeliveryZoneTabUiState(activeTab, {



        draft_points: cloneDeliveryZoneDraftPoints(nextPoints),



      });



      if (options.closePointMenu !== false) {



        closeDeliveryZonePointMenu();



      }



      return getDeliveryZoneDraftPoints(activeTab);



    }







    function replaceActiveDeliveryZoneGeometry(geometry, options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      const normalizedGeometry = normalizeDeliveryZoneGeometryValue(geometry);



      activeTab.draft = {



        ...cloneDeliveryZoneDraft(activeTab.draft),



        geometry: normalizedGeometry,



      };



      const polygonsCount = countDeliveryZonePolygons(normalizedGeometry);



      if (polygonsCount <= 0) {



        setDeliveryZoneTabUiState(activeTab, {



          mode: "placing",



          selected_polygon_index: -1,



        });



      } else if (options.keepSelection) {



        setDeliveryZoneTabUiState(activeTab, {



          mode: "editing",



          selected_polygon_index: getDeliveryZoneSelectedPolygonIndex(activeTab),



        });



      } else {



        const selectedPolygonIndex = Number.isInteger(options.selectedPolygonIndex)



          ? Number(options.selectedPolygonIndex)



          : Math.max(0, polygonsCount - 1);



        setDeliveryZoneTabUiState(activeTab, {



          mode: "editing",



          selected_polygon_index: Math.min(selectedPolygonIndex, polygonsCount - 1),



        });



      }



      return normalizedGeometry;



    }







    function startActiveDeliveryZonePolygonPlacement() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return;



      setActiveDeliveryZoneUiMode("placing", {



        clearDraftPoints: true,



      });



      deliveryZonesState.hoverLatLng = null;



      syncDeliveryZoneMapEditing();



    }







    function removeLastActiveDeliveryZoneDraftPoint() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return;



      const points = getDeliveryZoneDraftPoints(activeTab);



      if (!points.length) return;



      points.pop();



      updateActiveDeliveryZoneDraftPoints(points);



      syncDeliveryZoneMapEditing();



    }







    function clearActiveDeliveryZoneDraftPoints() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return;



      updateActiveDeliveryZoneDraftPoints([]);



      deliveryZonesState.hoverLatLng = null;



      syncDeliveryZoneMapEditing();



    }







    function finishActiveDeliveryZoneDraftPolygon() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return false;



      const points = getDeliveryZoneDraftPoints(activeTab);



      const polygonCoordinates = buildDeliveryZonePolygonCoordinatesFromPoints(points);



      if (!polygonCoordinates) return false;



      const currentGeometry = normalizeDeliveryZoneGeometryValue(activeTab.draft && activeTab.draft.geometry);



      const nextCoordinates = currentGeometry && Array.isArray(currentGeometry.coordinates)



        ? currentGeometry.coordinates.map((polygon) => Array.isArray(polygon) ? polygon.slice() : polygon)



        : [];



      nextCoordinates.push(polygonCoordinates);



      replaceActiveDeliveryZoneGeometry({



        type: "MultiPolygon",



        coordinates: nextCoordinates,



      }, {



        selectedPolygonIndex: nextCoordinates.length - 1,



      });



      updateActiveDeliveryZoneDraftPoints([]);



      deliveryZonesState.hoverLatLng = null;



      syncDeliveryZoneMapEditing();



      return true;



    }







    function deleteSelectedActiveDeliveryZonePolygon() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return false;



      const geometry = normalizeDeliveryZoneGeometryValue(activeTab.draft && activeTab.draft.geometry);



      if (!geometry || !Array.isArray(geometry.coordinates) || !geometry.coordinates.length) return false;



      const selectedIndex = getDeliveryZoneSelectedPolygonIndex(activeTab);



      if (selectedIndex < 0) return false;



      const nextCoordinates = geometry.coordinates.filter((_, index) => index !== selectedIndex);



      replaceActiveDeliveryZoneGeometry(



        nextCoordinates.length



          ? { type: "MultiPolygon", coordinates: nextCoordinates }



          : null,



        {



          selectedPolygonIndex: nextCoordinates.length ? Math.max(0, Math.min(selectedIndex, nextCoordinates.length - 1)) : -1,



        }



      );



      syncDeliveryZoneMapEditing();



      return true;



    }







    function selectActiveDeliveryZonePolygon(index) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return;



      const polygonsCount = countDeliveryZonePolygons(activeTab && activeTab.draft && activeTab.draft.geometry);



      if (!polygonsCount) return;



      closeDeliveryZoneContextMenu();



      const nextIndex = Math.max(0, Math.min(Number(index) || 0, polygonsCount - 1));



      setDeliveryZoneTabUiState(activeTab, {



        selected_polygon_index: nextIndex,



      });



      syncDeliveryZoneMapEditing();



    }







    function syncDeliveryZoneDraftGeometryIfEditing(tab = getActiveDeliveryTab()) {



      if (!isDeliveryZoneTab(tab) || isDeliveryZonePlacingMode(tab) || deliveryZonesState.editLayerKey !== tab.key) return null;



      return syncActiveDeliveryZoneDraftGeometryFromMap();



    }







    function refreshActiveDeliveryZoneDraftPreviewOnly() {



      const activeTab = getActiveDeliveryTab();



      renderActiveDeliveryZoneDraftPreview(activeTab);



      renderActiveDeliveryZoneCustomHandles(activeTab);



      syncDeliveryZoneMapOverlay();



    }







    function stopDeliveryZoneMapModes() {



      if (!deliveryLeafletMap || !deliveryLeafletMap.pm) return;



      try {



        if (typeof deliveryLeafletMap.pm.disableDraw === "function") {



          deliveryLeafletMap.pm.disableDraw();



        }



      } catch (_) {}



      try {



        if (typeof deliveryLeafletMap.pm.disableGlobalEditMode === "function") {



          deliveryLeafletMap.pm.disableGlobalEditMode();



        }



      } catch (_) {}



      try {



        if (typeof deliveryLeafletMap.pm.disableGlobalRemovalMode === "function") {



          deliveryLeafletMap.pm.disableGlobalRemovalMode();



        }



      } catch (_) {}



    }







    function clearDeliveryZoneLayers() {



      if (deliveryLeafletZonePassiveLayer) {



        deliveryLeafletZonePassiveLayer.clearLayers();



      }



      if (deliveryLeafletZoneEditLayer) {



        deliveryLeafletZoneEditLayer.clearLayers();



      }



      if (deliveryLeafletZoneDraftLayer) {



        deliveryLeafletZoneDraftLayer.clearLayers();



      }



      if (deliveryLeafletZoneVertexLayer) {



        deliveryLeafletZoneVertexLayer.clearLayers();



      }



      if (deliveryLeafletZoneMidpointLayer) {



        deliveryLeafletZoneMidpointLayer.clearLayers();



      }



      deliveryZonesState.editLayerKey = "";



    }







    function fitDeliveryZoneLayerGroup(layerGroup) {



      if (!deliveryLeafletMap || !window.L || !layerGroup || typeof layerGroup.getBounds !== "function") return false;



      const bounds = layerGroup.getBounds();



      if (!bounds || !bounds.isValid || !bounds.isValid()) return false;



      deliveryLeafletMap.fitBounds(bounds, { padding: [32, 32] });



      return true;



    }







    function bindEditableDeliveryZoneLayer(layer) {



      if (!layer) return;



      const syncGeometry = () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        syncActiveDeliveryZoneDraftGeometryFromMap();



        updateDeliveryZoneGeometryHint(activeTab);



        syncDeliveryZoneMapOverlay();



      };



      layer.off("pm:edit", syncGeometry);



      layer.on("pm:edit", syncGeometry);



      layer.off("pm:update", syncGeometry);



      layer.on("pm:update", syncGeometry);



      layer.on("pm:remove", () => {



        window.setTimeout(syncGeometry, 0);



      });



    }







    function ensureDeliveryZoneMapTools() {



      if (!deliveryLeafletMap || !window.L) return false;



      if (!deliveryLeafletZonePassiveLayer) {



        deliveryLeafletZonePassiveLayer = window.L.layerGroup().addTo(deliveryLeafletMap);



      }



      if (!deliveryLeafletZoneEditLayer) {



        deliveryLeafletZoneEditLayer = window.L.featureGroup().addTo(deliveryLeafletMap);



      }



      if (!deliveryLeafletZoneDraftLayer) {



        deliveryLeafletZoneDraftLayer = window.L.layerGroup().addTo(deliveryLeafletMap);



      }



      if (!deliveryLeafletZoneVertexLayer) {



        deliveryLeafletZoneVertexLayer = window.L.layerGroup().addTo(deliveryLeafletMap);



      }



      if (!deliveryLeafletZoneMidpointLayer) {



        deliveryLeafletZoneMidpointLayer = window.L.layerGroup().addTo(deliveryLeafletMap);



      }



      if (!deliveryLeafletMap.__deliveryZoneCustomReady) {



        deliveryLeafletMap.on("click", (event) => {



          const activeTab = getActiveDeliveryTab();



          if (!isDeliveryZoneTab(activeTab) || !isDeliveryZonePlacingMode(activeTab)) return;



          const nextPoints = getDeliveryZoneDraftPoints(activeTab);



          nextPoints.push({



            lat: Number(event && event.latlng && event.latlng.lat),



            lng: Number(event && event.latlng && event.latlng.lng),



          });



          updateActiveDeliveryZoneDraftPoints(nextPoints);



          deliveryZonesState.hoverLatLng = event && event.latlng ? {



            lat: Number(event.latlng.lat),



            lng: Number(event.latlng.lng),



          } : null;



          refreshActiveDeliveryZoneDraftPreviewOnly();



        });



        deliveryLeafletMap.on("mousemove", (event) => {



          const activeTab = getActiveDeliveryTab();



          if (!isDeliveryZoneTab(activeTab) || !isDeliveryZonePlacingMode(activeTab)) return;



          deliveryZonesState.hoverLatLng = event && event.latlng ? {



            lat: Number(event.latlng.lat),



            lng: Number(event.latlng.lng),



          } : null;



          refreshActiveDeliveryZoneDraftPreviewOnly();



        });



        deliveryLeafletMap.on("mouseout", () => {



          if (!isDeliveryZonePlacingMode()) return;



          deliveryZonesState.hoverLatLng = null;



          refreshActiveDeliveryZoneDraftPreviewOnly();



        });



        deliveryLeafletMap.on("move zoom", () => {



          positionDeliveryZonePointMenu();



          closeDeliveryZoneContextMenu();



        });



        deliveryLeafletMap.on("zoomend moveend", () => {



          renderActiveDeliveryZoneCustomHandles(getActiveDeliveryTab());



        });



        deliveryLeafletMap.__deliveryZoneCustomReady = true;



      }



      return true;



    }







    function renderPassiveDeliveryZoneLayer(zone, options = {}) {



      if (!deliveryLeafletMap || !window.L || !deliveryLeafletZonePassiveLayer) return;



      const normalized = normalizeDeliveryZone(zone);



      if (!normalized.geometry) return;



      const interactive = options.interactive !== false;



      const geoJsonLayer = window.L.geoJSON(normalized.geometry, {



        style: buildDeliveryZoneStyle(normalized),



        interactive,



      });



      geoJsonLayer.eachLayer((layer) => {



        layer.options.pmIgnore = true;



        if (typeof layer.setStyle === "function") {



          layer.setStyle(buildDeliveryZoneStyle(normalized));



        }



        if (interactive) {



          layer.on("click", () => {



            if (isDeliveryZonePlacingMode()) return;



            openDeliveryZoneTab(normalized);



          });



          layer.on("contextmenu", (event) => {



            if (event && event.originalEvent) {



              if (window.L && window.L.DomEvent && typeof window.L.DomEvent.stop === "function") {



                window.L.DomEvent.stop(event.originalEvent);



              } else {



                event.originalEvent.preventDefault();



                event.originalEvent.stopPropagation();



              }



            }



            openDeliveryZoneContextMenuForZone(normalized, event && event.latlng ? event.latlng : null);



          });



        }



        deliveryLeafletZonePassiveLayer.addLayer(layer);



      });



    }







    function mountActiveDeliveryZoneDraftOnMap(tab, options = {}) {



      if (!deliveryLeafletZoneEditLayer || !window.L) return;



      deliveryLeafletZoneEditLayer.clearLayers();



      deliveryZonesState.editLayerKey = "";



      const activeTab = tab || getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return;



      const draft = cloneDeliveryZoneDraft(activeTab.draft);



      if (!draft.geometry) return;



      const enableEditing = Boolean(options.enableEditing);



      const interactive = options.interactive !== false;



      const selectedPolygonIndex = getDeliveryZoneSelectedPolygonIndex(activeTab);



      const geoJsonLayer = window.L.geoJSON(draft.geometry, {



        style: buildDeliveryZoneStyle(draft, { active: true }),



        interactive,



      });



      let pieceIndex = 0;



      geoJsonLayer.eachLayer((layer) => {



        layer.options.pmIgnore = false;



        if (typeof layer.setStyle === "function") {



          layer.setStyle(buildDeliveryZoneStyle(draft, {



            active: true,



            selected: interactive && pieceIndex === selectedPolygonIndex,



          }));



        }



        layer.__deliveryZonePieceIndex = pieceIndex;



        layer.off("click");



        if (interactive) {



          layer.on("click", (event) => {



            if (event && event.originalEvent) {



              event.originalEvent.preventDefault();



              event.originalEvent.stopPropagation();



            }



            if (isDeliveryZonePlacingMode(activeTab)) return;



            selectActiveDeliveryZonePolygon(layer.__deliveryZonePieceIndex);



          });



          layer.on("contextmenu", (event) => {



            if (event && event.originalEvent) {



              if (window.L && window.L.DomEvent && typeof window.L.DomEvent.stop === "function") {



                window.L.DomEvent.stop(event.originalEvent);



              } else {



                event.originalEvent.preventDefault();



                event.originalEvent.stopPropagation();



              }



            }



            if (isDeliveryZonePlacingMode(activeTab)) return;



            selectActiveDeliveryZonePolygon(layer.__deliveryZonePieceIndex);



            openDeliveryZoneContextMenuForZone(activeTab.snapshot || activeTab.draft || {}, event && event.latlng ? event.latlng : null, {



              activate: false,



            });



          });



        }



        if (layer.pm && typeof layer.pm.disable === "function") {



          try {



            layer.pm.disable();



          } catch (_) {}



        }



        if (enableEditing && layer.pm && typeof layer.pm.enable === "function") {



          try {



            layer.pm.enable({



              allowSelfIntersection: true,



              snappable: true,



            });



          } catch (_) {}



        }



        if (enableEditing) {



          bindEditableDeliveryZoneLayer(layer);



        }



        deliveryLeafletZoneEditLayer.addLayer(layer);



        pieceIndex += 1;



      });



      deliveryZonesState.editLayerKey = activeTab.key;



    }







    function renderActiveDeliveryZoneDraftPreview(tab) {



      if (!deliveryLeafletZoneDraftLayer || !window.L) return;



      deliveryLeafletZoneDraftLayer.clearLayers();



      if (!isDeliveryZoneTab(tab) || !isDeliveryZonePlacingMode(tab)) return;



      const draft = cloneDeliveryZoneDraft(tab.draft);



      const draftPoints = getDeliveryZoneDraftPoints(tab);



      const latLngs = getDeliveryZoneDraftLatLngs(draftPoints);



      const hoverLatLng = deliveryZonesState.hoverLatLng



        ? window.L.latLng(deliveryZonesState.hoverLatLng.lat, deliveryZonesState.hoverLatLng.lng)



        : null;



      const previewColor = String(draft.color || "#ff7a00").trim() || "#ff7a00";







      if (latLngs.length >= 2) {



        const lineLatLngs = hoverLatLng ? latLngs.concat([hoverLatLng]) : latLngs;



        window.L.polyline(lineLatLngs, {



          color: previewColor,



          weight: 3,



          opacity: 0.92,



          dashArray: "10 8",



          interactive: false,



        }).addTo(deliveryLeafletZoneDraftLayer);



      } else if (latLngs.length === 1 && hoverLatLng) {



        window.L.polyline([latLngs[0], hoverLatLng], {



          color: previewColor,



          weight: 3,



          opacity: 0.92,



          dashArray: "10 8",



          interactive: false,



        }).addTo(deliveryLeafletZoneDraftLayer);



      }







      const previewPolygonLatLngs = latLngs.length >= 2



        ? (hoverLatLng ? latLngs.concat([hoverLatLng]) : (latLngs.length >= 3 ? latLngs : null))



        : null;



      if (previewPolygonLatLngs && previewPolygonLatLngs.length >= 3) {



        window.L.polygon(previewPolygonLatLngs, {



          color: previewColor,



          weight: 2,



          opacity: 0.8,



          dashArray: "10 8",



          fillColor: previewColor,



          fillOpacity: 0.22,



          interactive: false,



        }).addTo(deliveryLeafletZoneDraftLayer);



      }



    }







    function getActiveDeliveryZonePolygonLayer(polygonIndex = getDeliveryZoneSelectedPolygonIndex()) {



      if (!deliveryLeafletZoneEditLayer) return null;



      let foundLayer = null;



      deliveryLeafletZoneEditLayer.eachLayer((layer) => {



        if (foundLayer) return;



        if (Number(layer && layer.__deliveryZonePieceIndex) === Number(polygonIndex)) {



          foundLayer = layer;



        }



      });



      return foundLayer;



    }







    function previewActiveDeliveryZonePolygonPoints(points, polygonIndex = getDeliveryZoneSelectedPolygonIndex()) {



      const layer = getActiveDeliveryZonePolygonLayer(polygonIndex);



      if (!layer || typeof layer.setLatLngs !== "function") return;



      const latLngs = getDeliveryZoneDraftLatLngs(points);



      if (latLngs.length < 3) return;



      layer.setLatLngs([latLngs]);



      if (typeof layer.redraw === "function") {



        layer.redraw();



      }



    }







    function attachDeliveryZoneHandleDragLifecycle(marker, handlers = {}) {



      if (!marker) return;



      marker.on("dragstart", () => {



        closeDeliveryZonePointMenu();



        closeDeliveryZoneContextMenu();



        setDeliveryMapDraggingEnabled(false);



        if (typeof handlers.onStart === "function") {



          handlers.onStart();



        }



      });



      marker.on("drag", (event) => {



        if (typeof handlers.onDrag === "function") {



          handlers.onDrag(event);



        }



      });



      marker.on("dragend", (event) => {



        setDeliveryMapDraggingEnabled(true);



        if (typeof handlers.onEnd === "function") {



          handlers.onEnd(event);



        }



      });



    }







    function renderDeliveryZonePlacingHandles(tab) {



      if (!window.L || !deliveryLeafletZoneVertexLayer || !deliveryLeafletZoneMidpointLayer) return;



      const draft = cloneDeliveryZoneDraft(tab.draft);



      const points = cloneDeliveryZoneDraftPoints(getDeliveryZoneDraftPoints(tab));



      const color = String(draft.color || "#ff7a00").trim() || "#ff7a00";



      points.forEach((point, index) => {



        const isLast = index === points.length - 1;



        const marker = window.L.marker([point.lat, point.lng], {



          icon: buildDeliveryZoneHandleIcon("main", { color, last: isLast }),



          interactive: isLast,



          draggable: false,



          keyboard: false,



          bubblingMouseEvents: false,



          zIndexOffset: isLast ? 1200 : 1100,



        });



        if (isLast) {



          marker.on("click", (event) => {



            if (event && event.originalEvent) {



              if (window.L && window.L.DomEvent && typeof window.L.DomEvent.stop === "function") {



                window.L.DomEvent.stop(event.originalEvent);



              } else {



                event.originalEvent.preventDefault();



                event.originalEvent.stopPropagation();



              }



            }



            const lastPoint = getDeliveryZoneLastDraftPoint(tab);



            if (!lastPoint) return;



            setActiveDeliveryZonePointMenu(true, lastPoint);



          });



        }



        deliveryLeafletZoneVertexLayer.addLayer(marker);



      });



      if (!shouldShowDeliveryZoneMidpointHandles()) return;



      buildDeliveryZoneMidpointDescriptors(points).forEach((descriptor) => {



        const marker = window.L.marker([descriptor.point.lat, descriptor.point.lng], {



          icon: buildDeliveryZoneHandleIcon("midpoint", { color }),



          interactive: true,



          draggable: true,



          keyboard: false,



          bubblingMouseEvents: false,



          zIndexOffset: 1050,



        });



        attachDeliveryZoneHandleDragLifecycle(marker, {



          onEnd: (event) => {



            const nextPoint = normalizeDeliveryZoneDraftPoint(event && event.target && event.target.getLatLng ? event.target.getLatLng() : null);



            if (!nextPoint) {



              syncDeliveryZoneMapEditing();



              return;



            }



            const nextPoints = cloneDeliveryZoneDraftPoints(getDeliveryZoneDraftPoints(tab));



            nextPoints.splice(descriptor.insert_index, 0, nextPoint);



            updateActiveDeliveryZoneDraftPoints(nextPoints);



            syncDeliveryZoneMapEditing();



          },



        });



        deliveryLeafletZoneMidpointLayer.addLayer(marker);



      });



    }







    function renderDeliveryZoneEditingHandles(tab) {



      if (!window.L || !deliveryLeafletZoneVertexLayer || !deliveryLeafletZoneMidpointLayer) return;



      const selectedPolygonIndex = getDeliveryZoneSelectedPolygonIndex(tab);



      const points = getDeliveryZonePolygonPointsFromGeometry(tab && tab.draft && tab.draft.geometry, selectedPolygonIndex);



      if (!points.length) return;



      const color = String(tab && tab.draft && tab.draft.color || "#ff7a00").trim() || "#ff7a00";



      const isEditing = isDeliveryZoneEditingMode(tab);



      points.forEach((point, index) => {



        const marker = window.L.marker([point.lat, point.lng], {



          icon: buildDeliveryZoneHandleIcon("main", { color, passive: !isEditing }),



          interactive: isEditing,



          draggable: isEditing,



          keyboard: false,



          bubblingMouseEvents: false,



          zIndexOffset: 1100,



        });



        if (isEditing) {



          attachDeliveryZoneHandleDragLifecycle(marker, {



            onDrag: (event) => {



              const nextPoint = normalizeDeliveryZoneDraftPoint(event && event.target && event.target.getLatLng ? event.target.getLatLng() : null);



              if (!nextPoint) return;



              const previewPoints = points.map((item, itemIndex) => (



                itemIndex === index ? nextPoint : item



              ));



              previewActiveDeliveryZonePolygonPoints(previewPoints, selectedPolygonIndex);



            },



            onEnd: (event) => {



              const nextPoint = normalizeDeliveryZoneDraftPoint(event && event.target && event.target.getLatLng ? event.target.getLatLng() : null);



              if (!nextPoint) {



                syncDeliveryZoneMapEditing();



                return;



              }



              const nextPoints = points.map((item, itemIndex) => (



                itemIndex === index ? nextPoint : item



              ));



              const nextGeometry = buildDeliveryZoneGeometryWithUpdatedPolygon(tab && tab.draft && tab.draft.geometry, selectedPolygonIndex, nextPoints);



              if (nextGeometry) {



                replaceActiveDeliveryZoneGeometry(nextGeometry, { keepSelection: true });



              }



              syncDeliveryZoneMapEditing();



            },



          });



        }



        deliveryLeafletZoneVertexLayer.addLayer(marker);



      });







      if (!isEditing || !shouldShowDeliveryZoneMidpointHandles()) return;



      buildDeliveryZoneMidpointDescriptors(points, { closed: true }).forEach((descriptor) => {



        const marker = window.L.marker([descriptor.point.lat, descriptor.point.lng], {



          icon: buildDeliveryZoneHandleIcon("midpoint", { color }),



          interactive: true,



          draggable: true,



          keyboard: false,



          bubblingMouseEvents: false,



          zIndexOffset: 1050,



        });



        attachDeliveryZoneHandleDragLifecycle(marker, {



          onDrag: (event) => {



            const nextPoint = normalizeDeliveryZoneDraftPoint(event && event.target && event.target.getLatLng ? event.target.getLatLng() : null);



            if (!nextPoint) return;



            const previewPoints = points.slice();



            previewPoints.splice(descriptor.insert_index, 0, nextPoint);



            previewActiveDeliveryZonePolygonPoints(previewPoints, selectedPolygonIndex);



          },



          onEnd: (event) => {



            const nextPoint = normalizeDeliveryZoneDraftPoint(event && event.target && event.target.getLatLng ? event.target.getLatLng() : null);



            if (!nextPoint) {



              syncDeliveryZoneMapEditing();



              return;



            }



            const nextPoints = points.slice();



            nextPoints.splice(descriptor.insert_index, 0, nextPoint);



            const nextGeometry = buildDeliveryZoneGeometryWithUpdatedPolygon(tab && tab.draft && tab.draft.geometry, selectedPolygonIndex, nextPoints);



            if (nextGeometry) {



              replaceActiveDeliveryZoneGeometry(nextGeometry, { keepSelection: true });



            }



            syncDeliveryZoneMapEditing();



          },



        });



        deliveryLeafletZoneMidpointLayer.addLayer(marker);



      });



    }







    function renderActiveDeliveryZoneCustomHandles(tab = getActiveDeliveryTab()) {



      if (deliveryLeafletZoneVertexLayer) {



        deliveryLeafletZoneVertexLayer.clearLayers();



      }



      if (deliveryLeafletZoneMidpointLayer) {



        deliveryLeafletZoneMidpointLayer.clearLayers();



      }



      if (!isDeliveryZoneTab(tab) || !deliveryLeafletMap || !window.L) return;



      if (isDeliveryZonePlacingMode(tab)) {



        renderDeliveryZonePlacingHandles(tab);



        return;



      }



      if (countDeliveryZonePolygons(tab && tab.draft && tab.draft.geometry) <= 0) return;



      renderDeliveryZoneEditingHandles(tab);



    }







    function collectDeliveryZoneGeometryFromEditLayer() {



      if (!deliveryLeafletZoneEditLayer) return null;



      const coordinates = [];



      deliveryLeafletZoneEditLayer.eachLayer((layer) => {



        if (!layer || typeof layer.toGeoJSON !== "function") return;



        const feature = layer.toGeoJSON();



        const normalized = normalizeDeliveryZoneGeometryValue(feature && feature.geometry ? feature.geometry : feature);



        if (!normalized || !Array.isArray(normalized.coordinates)) return;



        normalized.coordinates.forEach((polygon) => {



          coordinates.push(polygon);



        });



      });



      if (!coordinates.length) return null;



      return {



        type: "MultiPolygon",



        coordinates,



      };



    }







    function syncActiveDeliveryZoneDraftGeometryFromMap() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      const geometry = collectDeliveryZoneGeometryFromEditLayer();



      activeTab.draft = {



        ...cloneDeliveryZoneDraft(activeTab.draft),



        geometry,



      };



      return geometry;



    }







    function refreshDeliveryZoneLayers() {



      syncDeliveryZoneMapEditing();



    }







    function openDeliveryZoneContextMenuForZone(zoneLike, latLng, options = {}) {



      const normalized = normalizeDeliveryZone(zoneLike);



      if (!normalized.id || !latLng || isDeliveryZonePlacingMode()) return;



      if (options.activate !== false) {



        openDeliveryZoneTab(normalized);



      }



      setActiveDeliveryZoneContextMenu(true, normalized.id, latLng);



    }







    function syncDeliveryZoneMapEditing() {



      const isDeliverySection = document.body.getAttribute("data-settings-section") === "delivery";



      const featureAvailable = isDeliveryZoneFeatureAvailable();



      const activeTab = getActiveDeliveryTab();



      const activeZoneTab = isDeliveryZoneTab(activeTab) ? activeTab : null;







      if (activeZoneTab) {



        syncDeliveryZoneDraftGeometryIfEditing(activeZoneTab);



      }







      if (settingsDeliveryMapBlock) {



        settingsDeliveryMapBlock.classList.toggle(



          "is-zone-editing",



          Boolean(isDeliverySection && featureAvailable && activeZoneTab && deliveryLeafletMap && isDeliveryZoneEditingMode(activeZoneTab))



        );



        settingsDeliveryMapBlock.classList.toggle(



          "is-zone-placing",



          Boolean(isDeliverySection && featureAvailable && activeZoneTab && deliveryLeafletMap && isDeliveryZonePlacingMode(activeZoneTab))



        );



      }







      if (!isDeliverySection || !featureAvailable || !deliveryLeafletMap || !window.L) {



        deliveryZonesState.drawMode = "idle";



        deliveryZonesState.hoverLatLng = null;



        deliveryZonesState.pointMenuOpen = false;



        deliveryZonesState.pointMenuLatLng = null;



        closeDeliveryZoneContextMenu();



        stopDeliveryZoneMapModes();



        clearDeliveryZoneLayers();



        if (settingsDeliveryZonePointMenu) {



          settingsDeliveryZonePointMenu.classList.add("hidden");



        }



        deliveryZonesState.mapFocusedKey = "";



        syncDeliveryMapToolbarInteractivity();



        syncDeliveryZoneMapOverlay();



        return;



      }







      if (!ensureDeliveryZoneMapTools()) return;







      deliveryLeafletZonePassiveLayer.clearLayers();



      const activeZoneId = activeZoneTab && activeZoneTab.mode === "edit" ? Number(activeZoneTab.id || 0) : 0;



      const isPlacing = Boolean(activeZoneTab && isDeliveryZonePlacingMode(activeZoneTab));



      if (!isPlacing) {



        deliveryZonesState.hoverLatLng = null;



      } else {



        closeDeliveryZoneContextMenu();



      }



      getVisibleDeliveryZoneItems().forEach((zone) => {



        if (activeZoneId > 0 && Number(zone.id || 0) === activeZoneId) return;



        renderPassiveDeliveryZoneLayer(zone, { interactive: !isPlacing });



      });







      stopDeliveryZoneMapModes();



      renderDeliveryMapBranchMarkers();



      mountActiveDeliveryZoneDraftOnMap(activeZoneTab, {



        interactive: !isPlacing,



        enableEditing: false,



      });



      renderActiveDeliveryZoneDraftPreview(activeZoneTab);



      renderActiveDeliveryZoneCustomHandles(activeZoneTab);







      if (!activeZoneTab) {



        deliveryZonesState.drawMode = "idle";



        deliveryZonesState.mapFocusedKey = "";



        closeDeliveryZoneContextMenu();



        syncDeliveryMapToolbarInteractivity();



        syncDeliveryZoneMapOverlay();



        return;



      }







      deliveryZonesState.drawMode = isPlacing ? "placing" : (isDeliveryZoneEditingMode(activeZoneTab) ? "editing" : "view");



      updateDeliveryZoneGeometryHint(activeZoneTab);



      syncDeliveryMapToolbarInteractivity();



      syncDeliveryZoneMapOverlay();







      if (countDeliveryZonePolygons(activeZoneTab.draft && activeZoneTab.draft.geometry) > 0) {



        if (deliveryZonesState.mapFocusedKey !== activeZoneTab.key) {



          fitDeliveryZoneLayerGroup(deliveryLeafletZoneEditLayer);



          deliveryZonesState.mapFocusedKey = activeZoneTab.key;



        }



        return;



      }







      deliveryZonesState.mapFocusedKey = "";



    }







    function persistActiveDeliveryDraft() {



      const activeTab = getActiveDeliveryTab();



      if (!activeTab || isDeliveryMapConfigTab(activeTab)) return;



      if (isDeliveryZoneTab(activeTab)) {



        if (!settingsDeliveryZonePanel || settingsDeliveryZonePanel.classList.contains("hidden")) return;



        activeTab.draft = cloneDeliveryZoneDraft(readDeliveryZoneFormDraft());



        activeTab.uiState = cloneDeliveryZoneUiState(getActiveDeliveryZoneUiState());



        return;



      }



      if (!settingsDeliveryPanel || settingsDeliveryPanel.classList.contains("hidden")) return;



      activeTab.draft = readDeliveryFormDraft();



    }







    function showDeliveryMapEmpty(message) {



      closeDeliveryMapSearchPopover();



      closeDeliveryZoneContextMenu();



      if (settingsDeliveryMapEmpty) {



        settingsDeliveryMapEmpty.classList.remove("hidden");



        const textEl = settingsDeliveryMapEmpty.querySelector(".settings-delivery-map-empty-text");



        if (textEl && message) textEl.textContent = message;



      }



      if (settingsDeliveryMapCanvas) {



        settingsDeliveryMapCanvas.classList.add("hidden");



      }



      if (deliveryLeafletTileLayer && deliveryLeafletMap) {



        deliveryLeafletMap.removeLayer(deliveryLeafletTileLayer);



        deliveryLeafletTileLayer = null;



      }



      stopDeliveryZoneMapModes();



      clearDeliveryZoneLayers();



      clearDeliveryMapSearchMarker();



      clearDeliveryMapBranchMarkers();



      if (settingsDeliveryMapBlock) {



        settingsDeliveryMapBlock.classList.remove("is-zone-editing");



        settingsDeliveryMapBlock.classList.remove("is-zone-placing");



      }



      if (settingsDeliveryZoneMapOverlay) settingsDeliveryZoneMapOverlay.classList.add("hidden");



      if (settingsDeliveryZonePointMenu) settingsDeliveryZonePointMenu.classList.add("hidden");



      setDeliveryMapSearchEnabled(false);



      if (settingsDeliveryCityChip) settingsDeliveryCityChip.disabled = true;



    }







    function destroyDeliveryMapPreview() {



      closeDeliveryZoneContextMenu();



      stopDeliveryZoneMapModes();



      clearDeliveryZoneLayers();



      if (deliveryLeafletMap) {



        deliveryLeafletMap.remove();



        deliveryLeafletMap = null;



      }



      deliveryLeafletTileLayer = null;



      deliveryLeafletSearchMarker = null;



      deliveryLeafletBranchMarkersLayer = null;



      deliveryLeafletZonePassiveLayer = null;



      deliveryLeafletZoneEditLayer = null;



      deliveryLeafletZoneDraftLayer = null;



      deliveryLeafletZoneVertexLayer = null;



      deliveryLeafletZoneMidpointLayer = null;



      if (settingsDeliveryMapBlock) {



        settingsDeliveryMapBlock.classList.remove("is-zone-editing");



        settingsDeliveryMapBlock.classList.remove("is-zone-placing");



      }



      if (settingsDeliveryZoneMapOverlay) settingsDeliveryZoneMapOverlay.classList.add("hidden");



      if (settingsDeliveryZonePointMenu) settingsDeliveryZonePointMenu.classList.add("hidden");



    }







    function applyDeliveryMapConfig(config, options = {}) {



      if (!settingsDeliveryMapCanvas || !window.L) return false;



      const normalized = normalizeSystemMapConfig(config);



      const maxZoom = normalized.max_zoom;



      const tileOptions = {



        attribution: normalized.attribution || "",



        maxZoom,



      };



      const subdomains = parseMapSubdomains(normalized.subdomains);



      if (subdomains.length) {



        tileOptions.subdomains = subdomains;



      }







      showDeliveryMapCanvas();







      if (!deliveryLeafletMap) {



        deliveryLeafletMap = window.L.map(settingsDeliveryMapCanvas, {



          zoomControl: true,



          attributionControl: true,



        }).setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      }







      if (deliveryLeafletTileLayer) {



        deliveryLeafletMap.removeLayer(deliveryLeafletTileLayer);



        deliveryLeafletTileLayer = null;



      }







      deliveryLeafletTileLayer = window.L.tileLayer(normalized.tile_url, tileOptions);



      deliveryLeafletTileLayer.addTo(deliveryLeafletMap);



      ensureDeliveryZoneMapTools();



      if (options.resetView) {



        closeDeliveryMapSearchPopover();



        clearDeliveryMapSearchMarker();



        clearDeliveryMapBranchMarkers();



        clearDeliveryZoneLayers();



        deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      }



      window.setTimeout(() => {



        if (deliveryLeafletMap) deliveryLeafletMap.invalidateSize();



        syncDeliveryZoneMapEditing();



      }, 0);



      return true;



    }







    function refreshDeliveryMapSelection() {



      renderDeliveryCitySelector();



      if (!deliveryLeafletMap || !window.L) return;



      const stores = renderDeliveryMapBranchMarkers();



      if (searchedMapCity) {



        const focused = focusDeliveryMapLocation(searchedMapCity, {



          showMarker: true,



          popupLabel: searchedMapCity.popup_label || searchedMapCity.label



        });



        if (!focused && !fitDeliveryMapToStores(stores)) {



          deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



        }



        updateDeliveryMapStatusFromSelection();



        refreshDeliveryZoneLayers();



        return;



      }







      clearDeliveryMapSearchMarker();



      if (fitDeliveryMapToStores(stores)) {



        updateDeliveryMapStatusFromSelection();



        refreshDeliveryZoneLayers();



        return;



      }







      const activeViewport = getActiveDeliveryMapViewport();



      if (activeViewport && focusDeliveryMapLocation(activeViewport, { showMarker: false })) {



        updateDeliveryMapStatusFromSelection();



        refreshDeliveryZoneLayers();



        return;



      }







      if (getSelectedDeliveryStoreCityLabel()) {



        ensureSelectedDeliveryStoreCityLocation();



      }



      deliveryLeafletMap.setView(DELIVERY_MAP_DEFAULT_CENTER, DELIVERY_MAP_DEFAULT_ZOOM);



      updateDeliveryMapStatusFromSelection();



      refreshDeliveryZoneLayers();



    }







    async function refreshDeliveryMapPreview(forceReload = false) {



      if (!settingsDeliveryMapBlock || !settingsDeliveryMapCanvas || !settingsDeliveryMapEmpty) return;



      if (!forceReload && deliveryMapConfigCache) {



        storeAddressMapModeCache = Boolean(deliveryMapConfigCache.store_address_map_enabled);



        syncDeliveryMapConfigAvailability();



        if (!hasConfiguredMap(deliveryMapConfigCache)) {



          showDeliveryMapEmpty(buildMapNotConfiguredMessage(deliveryMapConfigCache));



          return;



        }



        if (!window.L) {



          showDeliveryMapEmpty("Leaflet не подключён. Проверьте assets карты.");



          return;



        }



        applyDeliveryMapConfig(deliveryMapConfigCache, { resetView: forceReload });



        setDeliveryMapSearchEnabled(hasConfiguredMapGeocoder(deliveryMapConfigCache));



        refreshDeliveryMapSelection();



        syncDeliveryMapConfigAvailability();



        return;



      }







      try {



        const data = await fetchTenantMapConfig();



        const config = normalizeSystemMapConfig(data && data.data ? data.data : null);



        deliveryMapConfigCache = { ...config };



        storeAddressMapModeCache = Boolean(config.store_address_map_enabled);



        syncDeliveryMapConfigAvailability();



        if (!hasConfiguredMap(config)) {



          showDeliveryMapEmpty(buildMapNotConfiguredMessage(config));



          return;



        }



        if (!window.L) {



          showDeliveryMapEmpty("Leaflet не подключён. Проверьте assets карты.");



          return;



        }



        applyDeliveryMapConfig(config, { resetView: true });



        setDeliveryMapSearchEnabled(hasConfiguredMapGeocoder(config));



        refreshDeliveryMapSelection();



      } catch (err) {



        console.error("Failed to refresh delivery map preview:", err);



        showDeliveryMapEmpty("Не удалось загрузить настройки карты.");



      } finally {



        syncDeliveryMapConfigAvailability();



      }



    }







    function syncDeliveryMapConfigAvailability() {



      syncDeliveryMapConfigButtonVisibility();



      syncDeliveryCreateMenuAvailability();



      if (isStoreAddressMapModeEnabled()) {



        renderDeliveryHomeList(deliverySettingsState.items);



        renderDeliveryZonesHomeList(deliveryZonesState.items);



        renderDeliveryWorkspace();



        refreshDeliveryZoneLayers();



        return;



      }







      deliveryTabsState.tabs = deliveryTabsState.tabs.filter((tab) => !isDeliveryMapConfigTab(tab));



      if (deliveryTabsState.activeKey === DELIVERY_MAP_CONFIG_TAB_KEY) {



        deliveryTabsState.activeKey = "";



      }



      deliveryMapAccountsLoaded = false;



      deliveryMapAccountsProviderName = "";



      deliveryMapAccountsOriginal = [];



      deliveryMapAccountsDraft = [];



      resetDeliveryMapAccountsTransientState();



      stopDeliveryZoneMapModes();



      clearDeliveryZoneLayers();



      renderDeliveryHomeList(deliverySettingsState.items);



      renderDeliveryZonesHomeList(deliveryZonesState.items);



      renderDeliveryWorkspace();



    }







    function upsertDeliveryZoneInState(zone) {



      const normalized = normalizeDeliveryZone(zone);



      const nextItems = Array.isArray(deliveryZonesState.items) ? deliveryZonesState.items.slice() : [];



      const index = nextItems.findIndex((item) => Number(item && item.id) === normalized.id);



      if (index >= 0) {



        nextItems[index] = normalized;



      } else {



        nextItems.push(normalized);



      }



      deliveryZonesState.items = nextItems;



      return normalized;



    }







    function removeDeliveryZoneFromState(id) {



      const zoneId = Number(id);



      deliveryZonesState.items = (Array.isArray(deliveryZonesState.items) ? deliveryZonesState.items : [])



        .filter((item) => Number(item && item.id) !== zoneId);



    }







    async function deleteDeliveryZoneById(zoneId) {



      const normalizedZoneId = Number(zoneId);



      if (!Number.isFinite(normalizedZoneId) || normalizedZoneId <= 0) return false;



      const deleteResult = await deleteDeliveryZone(normalizedZoneId);



      if (!deleteResult || !deleteResult.ok) return false;







      removeDeliveryZoneFromState(normalizedZoneId);



      closeDeliveryZoneContextMenu();







      const zoneTab = getDeliveryZoneTabById(normalizedZoneId);



      if (zoneTab) {



        closeDeliveryTab(zoneTab.key, { force: true });



      } else {



        syncDeliveryTabsWithItems(deliverySettingsState.items, deliveryZonesState.items);



        renderDeliveryHomeList(deliverySettingsState.items);



        renderDeliveryZonesHomeList(deliveryZonesState.items);



        renderDeliveryWorkspace();



      }



      refreshDeliveryZoneLayers();



      return true;



    }







    function updateActiveDeliveryZoneDraft(patch = {}, options = {}) {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return null;



      const nextDraft = {



        ...cloneDeliveryZoneDraft(activeTab.draft),



        ...patch,



      };



      activeTab.draft = cloneDeliveryZoneDraft(nextDraft);



      if (options.renderTiers) {



        renderDeliveryZonePriceTiers(activeTab.draft.price_tiers);



      }



      if (options.syncMap) {



        syncDeliveryZoneMapEditing();



      }



      if (options.refreshTabs) {



        renderDeliveryTabs();



      }



      return activeTab.draft;



    }







    function normalizeDeliveryZonePriceTiersForSave(items) {



      const list = Array.isArray(items) ? items : [];



      const normalized = [];



      for (let index = 0; index < list.length; index += 1) {



        const tier = list[index] && typeof list[index] === "object" ? list[index] : {};



        const minOrderRaw = String(tier.min_order_amount ?? "").trim();



        const deliveryCostRaw = String(tier.delivery_cost ?? "").trim();



        if (!minOrderRaw && !deliveryCostRaw) continue;



        if (!minOrderRaw || !deliveryCostRaw) {



          return {



            ok: false,



            error: "Заполните обе суммы РІ каждом тарифном пороге.",



          };



        }



        const minOrder = Number(minOrderRaw);



        const deliveryCost = Number(deliveryCostRaw);



        if (!Number.isFinite(minOrder) || minOrder < 0 || !Number.isFinite(deliveryCost) || deliveryCost < 0) {



          return {



            ok: false,



            error: "Суммы тарифов должны быть положительными числами или нулём.",



          };



        }



        normalized.push({



          min_order_amount: Math.round(minOrder),



          delivery_cost: Math.round(deliveryCost),



        });



      }



      if (!normalized.length) {



        return {



          ok: false,



          error: "Добавьте хотя бы один тариф для зоны доставки.",



        };



      }



      normalized.sort((left, right) => left.min_order_amount - right.min_order_amount);



      return {



        ok: true,



        items: normalized.map((tier, index) => ({



          ...tier,



          sort_order: index,



        })),



      };



    }







    function normalizeDeliverySettingPriceTiersForSave(items) {



      const result = normalizeDeliveryZonePriceTiersForSave(items);



      if (!result.ok) {



        if (result.error === "Добавьте хотя бы один тариф для зоны доставки.") {



          return {



            ok: false,



            error: "Добавьте хотя бы один тариф для общей доставки.",



          };



        }



        return result;



      }



      return result;



    }







    function buildActiveDeliveryZoneSavePayload() {



      const activeTab = getActiveDeliveryTab();



      if (!isDeliveryZoneTab(activeTab)) return { ok: false, error: "ZONE_TAB_REQUIRED" };



      const draft = cloneDeliveryZoneDraft(readDeliveryZoneFormDraft());



      activeTab.draft = cloneDeliveryZoneDraft(draft);







      const name = String(draft.name || "").trim();



      if (!name) {



        return { ok: false, error: "Введите название зоны доставки.", focus: settingsDeliveryZoneName };



      }







      const storeIds = Array.isArray(draft.store_ids) ? draft.store_ids.slice() : [];



      if (!storeIds.length) {



        return { ok: false, error: "Выберите хотя бы один филиал для зоны.", focus: deliveryZoneStoresList };



      }







      const tiersResult = normalizeDeliveryZonePriceTiersForSave(draft.price_tiers);



      if (!tiersResult.ok) {



        return { ok: false, error: tiersResult.error, focus: settingsDeliveryZonePriceTiers };



      }







      if (getDeliveryZoneDraftPoints(activeTab).length > 0) {



        return {



          ok: false,



          error: "Завершите текущий контур через последнюю точку или очистите его.",



          focus: settingsDeliveryMapBlock,



        };



      }







      const geometry = normalizeDeliveryZoneGeometryValue(draft.geometry);



      if (!geometry || countDeliveryZonePolygons(geometry) === 0) {



        return { ok: false, error: "Поставьте точки на карте и завершите контур через последнюю точку.", focus: settingsDeliveryMapBlock };



      }



      if (!geometry || countDeliveryZonePolygons(geometry) === 0) {



        return { ok: false, error: "Нарисуйте хотя бы один полигон на карте.", focus: settingsDeliveryMapBlock };



      }







      const etaValue = String(draft.eta_minutes ?? "").trim();



      const etaMinutes = etaValue ? Number(etaValue) : null;



      if (etaValue && (!Number.isFinite(etaMinutes) || etaMinutes < 0)) {



        return { ok: false, error: "Время доставки должно быть положительным числом.", focus: settingsDeliveryZoneEtaMinutes };



      }







      return {



        ok: true,



        payload: {



          name,



          color: String(draft.color || "#ff7a00").trim() || "#ff7a00",



          eta_minutes: etaValue ? Math.round(etaMinutes) : null,



          is_active: draft.is_active ? 1 : 0,



          store_ids: storeIds,



          price_tiers: tiersResult.items,



          geometry,



        },



      };



    }







    function focusDeliveryZoneField(target) {



      if (target === deliveryZoneStoresList && settingsDeliveryZoneStoresTriggerBtn) {



        settingsDeliveryZoneStoresTriggerBtn.focus();



        return;



      }



      if (!target || typeof target.focus !== "function") return;



      target.focus();



      if (typeof target.scrollIntoView === "function") {



        target.scrollIntoView({ block: "nearest", behavior: "smooth" });



      }



    }







    if (settingsCreateMenuWrap) {



      settingsCreateMenuWrap.addEventListener("click", (event) => {



        event.stopPropagation();



      });



    }







    if (settingsDeliveryCreateConditionBtn) {



      settingsDeliveryCreateConditionBtn.addEventListener("click", () => {



        closeDeliveryCreateMenu();



        startCreateDeliverySetting();



      });



    }







    if (settingsDeliveryCreateZoneBtn) {



      settingsDeliveryCreateZoneBtn.addEventListener("click", () => {



        closeDeliveryCreateMenu();



        if (!isDeliveryZoneFeatureAvailable()) {



          alert("Зоны доставки доступны только когда включены карта и сервис полигонов.");



          return;



        }



        startCreateDeliveryZone();



      });



    }







    document.addEventListener("click", (event) => {



      if (!deliveryCreateMenuOpen) return;



      if (settingsCreateMenuWrap && settingsCreateMenuWrap.contains(event.target)) return;



      closeDeliveryCreateMenu();



    });







    document.addEventListener("keydown", (event) => {



      if (event.key !== "Escape") return;



      if (deliveryCreateMenuOpen) {



        closeDeliveryCreateMenu();



      }



    });







    if (settingsDeliveryAddTierBtn) {



      settingsDeliveryAddTierBtn.addEventListener("click", () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



        const currentTiers = readDeliverySettingPriceTiersFromDom();



        currentTiers.push(createEmptyDeliveryZoneTierDraft());



        updateActiveDeliveryDraft({ price_tiers: currentTiers }, { renderTiers: true });



      });



    }







    if (settingsDeliveryPriceTiers) {



      settingsDeliveryPriceTiers.addEventListener("click", (event) => {



        const removeButton = event.target && event.target.closest



          ? event.target.closest("[data-delivery-tier-remove]")



          : null;



        if (!removeButton) return;



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



        const index = Number(removeButton.getAttribute("data-delivery-tier-remove"));



        const currentTiers = readDeliverySettingPriceTiersFromDom();



        const nextTiers = currentTiers.filter((_, tierIndex) => tierIndex !== index);



        updateActiveDeliveryDraft(



          { price_tiers: nextTiers.length ? nextTiers : [createEmptyDeliveryZoneTierDraft()] },



          { renderTiers: true }



        );



      });







      settingsDeliveryPriceTiers.addEventListener("input", () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



        updateActiveDeliveryDraft({ price_tiers: readDeliverySettingPriceTiersFromDom() });



      });



    }







    [



      settingsDeliveryName,



      settingsDeliveryEtaMinutes,



    ].forEach((input) => {



      if (!input) return;



      input.addEventListener("input", () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



        updateActiveDeliveryDraft(readDeliveryFormDraft(), { refreshTabs: input === settingsDeliveryName });



      });



    });







    if (settingsDeliveryActive) {



      settingsDeliveryActive.addEventListener("change", () => {



        const activeTab = getActiveDeliveryTab();



        if (!activeTab || isDeliveryZoneTab(activeTab) || isDeliveryMapConfigTab(activeTab)) return;



        updateActiveDeliveryDraft(readDeliveryFormDraft());



      });



    }







    if (settingsDeliveryZoneAddTierBtn) {



      settingsDeliveryZoneAddTierBtn.addEventListener("click", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        const currentTiers = readDeliveryZonePriceTiersFromDom();



        currentTiers.push(createEmptyDeliveryZoneTierDraft());



        updateActiveDeliveryZoneDraft({ price_tiers: currentTiers }, { renderTiers: true });



      });



    }







    if (settingsDeliveryZonePriceTiers) {



      settingsDeliveryZonePriceTiers.addEventListener("click", (event) => {



        const removeButton = event.target && event.target.closest



          ? event.target.closest("[data-zone-tier-remove]")



          : null;



        if (!removeButton) return;



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        const index = Number(removeButton.getAttribute("data-zone-tier-remove"));



        const currentTiers = readDeliveryZonePriceTiersFromDom();



        const nextTiers = currentTiers.filter((_, tierIndex) => tierIndex !== index);



        updateActiveDeliveryZoneDraft(



          { price_tiers: nextTiers.length ? nextTiers : [createEmptyDeliveryZoneTierDraft()] },



          { renderTiers: true }



        );



      });







      settingsDeliveryZonePriceTiers.addEventListener("input", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        updateActiveDeliveryZoneDraft({ price_tiers: readDeliveryZonePriceTiersFromDom() });



      });



    }







    [



      settingsDeliveryZoneName,



      settingsDeliveryZoneEtaMinutes,



    ].forEach((input) => {



      if (!input) return;



      input.addEventListener("input", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        updateActiveDeliveryZoneDraft(readDeliveryZoneFormDraft(), { refreshTabs: input === settingsDeliveryZoneName });



      });



    });







    if (settingsDeliveryZoneInfoBtn) {



      settingsDeliveryZoneInfoBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        toggleDeliveryZoneInfoPopover();



      });



    }







    if (settingsDeliveryZoneColorTrigger) {



      settingsDeliveryZoneColorTrigger.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        toggleDeliveryZoneColorPopover();



      });



    }







    if (settingsDeliveryZoneColorPresets) {



      settingsDeliveryZoneColorPresets.addEventListener("click", (event) => {



        const presetBtn = event.target && event.target.closest



          ? event.target.closest("[data-zone-color-preset]")



          : null;



        if (!presetBtn) return;



        event.preventDefault();



        event.stopPropagation();



        setDeliveryZoneColorValue(presetBtn.getAttribute("data-zone-color-preset"), {



          syncDraft: true,



          syncMap: true,



          closePopover: true,



        });



      });



    }







    if (settingsDeliveryZoneColorCustomBtn) {



      settingsDeliveryZoneColorCustomBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        openDeliveryZoneColorEditor();



      });



    }







    if (settingsDeliveryZoneColor) {



      settingsDeliveryZoneColor.addEventListener("input", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        setDeliveryZoneColorValue(settingsDeliveryZoneColor.value, {



          syncDraft: true,



          syncMap: true,



        });



      });



      settingsDeliveryZoneColor.addEventListener("change", () => {



        syncDeliveryZoneColorTrigger(settingsDeliveryZoneColor.value);



      });



    }







    if (settingsDeliveryZoneColorEditor) {



      settingsDeliveryZoneColorEditor.addEventListener("input", (event) => {



        const input = event.target && event.target.closest



          ? event.target.closest("[data-zone-color-channel]")



          : null;



        const value = readDeliveryZoneColorEditorChannelValue(input);



        if (!input || value == null) return;



        setDeliveryZoneColorEditorChannel(input.getAttribute("data-zone-color-channel"), value);



      });







      settingsDeliveryZoneColorEditor.addEventListener("change", (event) => {



        const input = event.target && event.target.closest



          ? event.target.closest("[data-zone-color-channel]")



          : null;



        if (!input) return;



        const value = readDeliveryZoneColorEditorChannelValue(input);



        if (value == null) {



          syncDeliveryZoneColorEditor(settingsDeliveryZoneColor && settingsDeliveryZoneColor.value);



          return;



        }



        setDeliveryZoneColorEditorChannel(input.getAttribute("data-zone-color-channel"), value);



      });



    }







    if (settingsDeliveryZoneColorEditorBackBtn) {



      settingsDeliveryZoneColorEditorBackBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        closeDeliveryZoneColorEditor();



      });



    }







    if (settingsDeliveryZoneColorEditorDoneBtn) {



      settingsDeliveryZoneColorEditorDoneBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        closeDeliveryZoneColorPopover();



      });



    }







    if (settingsDeliveryZoneActive) {



      settingsDeliveryZoneActive.addEventListener("change", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        updateActiveDeliveryZoneDraft(readDeliveryZoneFormDraft());



      });



    }







    if (settingsDeliveryZoneStoresTriggerBtn) {



      settingsDeliveryZoneStoresTriggerBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        openDeliveryZoneStoresModal();



      });



    }







    if (deliveryZoneStoresList) {



      deliveryZoneStoresList.addEventListener("click", (event) => {



        const removeBtn = event.target && event.target.closest



          ? event.target.closest("[data-zone-store-remove]")



          : null;



        if (!removeBtn) return;



        event.preventDefault();



        event.stopPropagation();



        removeDeliveryZoneStore(removeBtn.getAttribute("data-zone-store-remove"));



      });



    }







    if (settingsDeliveryZoneUndoBtn) {



      settingsDeliveryZoneUndoBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        removeLastActiveDeliveryZoneDraftPoint();



      });



    }







    if (settingsDeliveryZoneClearPointsBtn) {



      settingsDeliveryZoneClearPointsBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        clearActiveDeliveryZoneDraftPoints();



      });



    }







    if (settingsDeliveryZoneAddPolygonBtn) {



      settingsDeliveryZoneAddPolygonBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        startActiveDeliveryZonePolygonPlacement();



      });



    }







    if (settingsDeliveryZoneRemovePolygonBtn) {



      settingsDeliveryZoneRemovePolygonBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        if (!deleteSelectedActiveDeliveryZonePolygon()) {



          alert("Сначала выберите полигон зоны на карте.");



        }



      });



    }







    if (settingsDeliveryZonePointMenuContinueBtn) {



      settingsDeliveryZonePointMenuContinueBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        closeDeliveryZonePointMenu();



      });



    }







    if (settingsDeliveryZonePointMenuRemoveLastBtn) {



      settingsDeliveryZonePointMenuRemoveLastBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        removeLastActiveDeliveryZoneDraftPoint();



      });



    }







    if (settingsDeliveryZonePointMenuFinishBtn) {



      settingsDeliveryZonePointMenuFinishBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        if (!finishActiveDeliveryZoneDraftPolygon()) {



          alert("Для завершения зоны нужно поставить минимум 3 точки.");



        }



      });



    }







    if (settingsDeliveryZoneEditBtn) {



      settingsDeliveryZoneEditBtn.addEventListener("click", () => {



        enterActiveDeliveryZoneEditMode();



      });



    }







    if (settingsDeliveryZoneContextEditBtn) {



      settingsDeliveryZoneContextEditBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        const zoneId = Number(deliveryZonesState.contextMenuZoneId || 0);



        if (!zoneId) return;



        const zone = (Array.isArray(deliveryZonesState.items) ? deliveryZonesState.items : [])



          .find((item) => Number(item && item.id) === zoneId);



        closeDeliveryZoneContextMenu();



        if (!zone) return;



        openDeliveryZoneTab(zone);



        enterActiveDeliveryZoneEditMode();



      });



    }







    if (settingsDeliveryZoneContextDeleteBtn) {



      settingsDeliveryZoneContextDeleteBtn.addEventListener("click", async (event) => {



        event.preventDefault();



        event.stopPropagation();



        const zoneId = Number(deliveryZonesState.contextMenuZoneId || 0);



        if (!zoneId) return;



        if (!confirm("Удалить эту зону доставки?")) return;



        const deleted = await deleteDeliveryZoneById(zoneId);



        if (!deleted) {



          alert("Не удалось удалить зону доставки.");



        }



      });



    }







    if (settingsDeliveryZoneSaveBtn) {



      settingsDeliveryZoneSaveBtn.addEventListener("click", async () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        const saveState = buildActiveDeliveryZoneSavePayload();



        if (!saveState.ok) {



          alert(saveState.error || "Не удалось подготовить зону доставки.");



          focusDeliveryZoneField(saveState.focus);



          return;



        }







        const idleText = settingsDeliveryZoneSaveText ? settingsDeliveryZoneSaveText.textContent : "Сохранить";



        settingsDeliveryZoneSaveBtn.disabled = true;



        if (settingsDeliveryZoneSaveText) settingsDeliveryZoneSaveText.textContent = "Сохранение...";



        try {



          let saveResult = null;



          if (activeTab.mode === "create") {



            saveResult = await createDeliveryZone(saveState.payload);



          } else if (activeTab.id) {



            saveResult = await updateDeliveryZone(activeTab.id, saveState.payload);



          }



          if (!saveResult || !saveResult.ok || !saveResult.item) {



            alert(activeTab.mode === "create"



              ? "Не удалось создать зону доставки."



              : "Не удалось сохранить изменения зоны.");



            return;



          }







          const savedZone = upsertDeliveryZoneInState(saveResult.item);



          activeTab.key = `delivery-zone:${savedZone.id}`;



          activeTab.entityType = "zone";



          activeTab.id = savedZone.id;



          activeTab.mode = "edit";



          activeTab.snapshot = savedZone;



          activeTab.draft = createDeliveryZoneDraftFromZone(savedZone);



          activeTab.uiState = createEmptyDeliveryZoneUiState({



            mode: "view",



            selected_polygon_index: 0,



          });



          deliveryTabsState.activeKey = activeTab.key;



          deliveryZonesState.selectedId = savedZone.id;



          deliveryZonesState.snapshot = { ...savedZone };



          deliveryZonesState.mode = "edit";



          deliveryZonesState.hoverLatLng = null;



          closeDeliveryZoneInfoPopover();



          closeDeliveryZoneColorPopover();



          closeDeliveryZonePointMenu();



          syncDeliveryTabsWithItems(deliverySettingsState.items, deliveryZonesState.items);



          renderDeliveryHomeList(deliverySettingsState.items);



          renderDeliveryZonesHomeList(deliveryZonesState.items);



          renderDeliveryWorkspace();



          refreshDeliveryZoneLayers();



        } finally {



          settingsDeliveryZoneSaveBtn.disabled = false;



          if (settingsDeliveryZoneSaveText) settingsDeliveryZoneSaveText.textContent = idleText || "Сохранить";



        }



      });



    }







    if (settingsDeliveryZoneResetBtn) {



      settingsDeliveryZoneResetBtn.addEventListener("click", () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab)) return;



        activeTab.draft = activeTab.mode === "create"



          ? createEmptyDeliveryZoneDraft()



          : createDeliveryZoneDraftFromZone(activeTab.snapshot);



        deliveryZonesState.mapFocusedKey = "";



        activeTab.uiState = createEmptyDeliveryZoneUiState({



          mode: countDeliveryZonePolygons(activeTab.draft.geometry) > 0



            ? (activeTab.mode === "create" ? "editing" : "view")



            : "placing",



          selected_polygon_index: countDeliveryZonePolygons(activeTab.draft.geometry) > 0 ? 0 : -1,



        });



        deliveryZonesState.hoverLatLng = null;



        closeDeliveryZoneInfoPopover();



        closeDeliveryZoneColorPopover();



        closeDeliveryZonePointMenu();



        applyDeliveryZoneFormDraft(activeTab);



        syncDeliveryZoneMapEditing();



      });



    }







    if (settingsDeliveryZoneDeleteBtn) {



      settingsDeliveryZoneDeleteBtn.addEventListener("click", async () => {



        const activeTab = getActiveDeliveryTab();



        if (!isDeliveryZoneTab(activeTab) || !activeTab.id) return;



        if (!confirm("Удалить эту зону доставки?")) return;



        const deleted = await deleteDeliveryZoneById(activeTab.id);



        if (!deleted) {



          alert("Не удалось удалить зону доставки.");



          return;



        }



      });



    }







    async function saveChatSettingsPayload(button, payload, errorText, onSuccess) {



      if (!payload || typeof payload !== "object") return;



      const idleText = button ? String(button.textContent || "") : "";



      if (button) {



        button.disabled = true;



        button.textContent = "\u0421\u043e\u0445\u0440\u0430\u043d\u0435\u043d\u0438\u0435...";



      }



      try {



        const data = await updateTenantFields(payload);



        if (!data || !data.ok || !data.tenant) {



          alert(errorText || "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0443.");



          return;



        }



        updateTenantCache(data.tenant);



        applyBrandFromTenant(data.tenant);



        applyChatSettingsFromTenant(data.tenant);



        if (typeof onSuccess === "function") onSuccess(data.tenant);



      } finally {



        if (button) {



          button.disabled = false;



          button.textContent = idleText || "\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c";



        }



      }



    }







    if (settingsSoundsEditBtn) {



      settingsSoundsEditBtn.addEventListener("click", () => {



        updateChatSoundsOriginalFromCurrentForm();



        setChatSoundsDraftMode(true);



      });



    }







    if (settingsSoundsCancelBtn) {



      settingsSoundsCancelBtn.addEventListener("click", async () => {



        const payload = {



          sound_new_order_url: String(chatSoundsOriginal.sound_new_order_url || "").trim() || null,



          sound_order_cancelled_url: String(chatSoundsOriginal.sound_order_cancelled_url || "").trim() || null,



          sound_new_message_url: String(chatSoundsOriginal.sound_new_message_url || "").trim() || null



        };



        settingsSoundsCancelBtn.disabled = true;



        settingsSoundsSaveBtn && (settingsSoundsSaveBtn.disabled = true);



        try {



          const data = await updateTenantFields(payload);



          if (!data || !data.ok || !data.tenant) {



            alert("Не удалось отменить изменения звуков.");



            return;



          }



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          if (!chatSoundsDraftMode) updateChatSoundsOriginalFromCurrentForm();



          applyChatSoundsOriginalState();



          setChatSoundsDraftMode(false);



        } finally {



          settingsSoundsCancelBtn.disabled = false;



          settingsSoundsSaveBtn && (settingsSoundsSaveBtn.disabled = false);



        }



      });



    }







    if (settingsSoundsSaveBtn) {



      settingsSoundsSaveBtn.addEventListener("click", async () => {



        if (!chatSoundsDraftMode) return;



        const payload = {



          sound_new_order_url: String((document.querySelector('[data-tenant-input="sound_new_order_url"]') || {}).value || "").trim() || null,



          sound_order_cancelled_url: String((document.querySelector('[data-tenant-input="sound_order_cancelled_url"]') || {}).value || "").trim() || null,



          sound_new_message_url: String((document.querySelector('[data-tenant-input="sound_new_message_url"]') || {}).value || "").trim() || null



        };



        const idleText = String(settingsSoundsSaveBtn.textContent || "Сохранить");



        settingsSoundsSaveBtn.disabled = true;



        settingsSoundsSaveBtn.textContent = "Сохранение...";



        if (settingsSoundsCancelBtn) settingsSoundsCancelBtn.disabled = true;



        try {



          const data = await updateTenantFields(payload);



          if (!data || !data.ok || !data.tenant) {



            alert("Не удалось сохранить звуки.");



            return;



          }



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          if (!chatSoundsDraftMode) updateChatSoundsOriginalFromCurrentForm();



          updateChatSoundsOriginalFromCurrentForm();



          setChatSoundsDraftMode(false);



        } finally {



          settingsSoundsSaveBtn.disabled = false;



          settingsSoundsSaveBtn.textContent = idleText || "Сохранить";



          if (settingsSoundsCancelBtn) settingsSoundsCancelBtn.disabled = false;



        }



      });



    }







    if (settingsChatAssistantEditBtn) {



      settingsChatAssistantEditBtn.addEventListener("click", () => {



        updateChatAssistantOriginalFromCurrentForm();



        setChatAssistantDraftMode(true);



      });



    }







    if (settingsChatAssistantCancelBtn) {



      settingsChatAssistantCancelBtn.addEventListener("click", () => {



        applyChatAssistantOriginalState();



        setChatAssistantDraftMode(false);



      });



    }







    if (settingsChatOperatorEditBtn) {



      settingsChatOperatorEditBtn.addEventListener("click", () => {



        updateChatOperatorOriginalFromCurrentForm();



        setChatOperatorDraftMode(true);



      });



    }







    if (settingsChatOperatorCancelBtn) {



      settingsChatOperatorCancelBtn.addEventListener("click", () => {



        applyChatOperatorOriginalState();



        setChatOperatorDraftMode(false);



      });



    }







    if (settingsChatMessageEditBtn) {



      settingsChatMessageEditBtn.addEventListener("click", () => {



        updateChatMessageOriginalFromCurrentForm();



        setChatMessageDraftMode(true);



      });



    }







    if (settingsChatMessageCancelBtn) {



      settingsChatMessageCancelBtn.addEventListener("click", () => {



        applyChatMessageOriginalState();



        setChatMessageDraftMode(false);



      });



    }







    if (settingsChatWidgetEnabledSwitch) {



      settingsChatWidgetEnabledSwitch.addEventListener("change", async () => {



        const nextValue = settingsChatWidgetEnabledSwitch.checked ? 1 : 0;



        const prevChecked = !settingsChatWidgetEnabledSwitch.checked;



        settingsChatWidgetEnabledSwitch.disabled = true;



        try {



          const data = await updateTenantFields({ chat_widget_enabled: nextValue });



          if (!data || !data.ok || !data.tenant) {



            settingsChatWidgetEnabledSwitch.checked = prevChecked;



            alert("\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0432\u0438\u0434\u0438\u043c\u043e\u0441\u0442\u044c \u0447\u0430\u0442\u0430.");



            return;



          }



          updateTenantCache(data.tenant);



          applyBrandFromTenant(data.tenant);



          applyChatSettingsFromTenant(data.tenant);



        } finally {



          settingsChatWidgetEnabledSwitch.disabled = false;



        }



      });



    }







    if (settingsChatAssistantGenderOptions) {



      settingsChatAssistantGenderOptions.addEventListener("change", (event) => {



        const target = event.target && event.target.closest



          ? event.target.closest('input[name="settingsChatAssistantGender"]')



          : null;



        if (!target) return;



        writeStoredChatAssistantGender(target.value);



      });



    }







    if (settingsChatWelcomeEnabledSwitch) {



      settingsChatWelcomeEnabledSwitch.addEventListener("change", () => {



        syncChatAssistantHierarchyUi();



      });



    }







    if (settingsChatWelcomeExpandBtn) {



      settingsChatWelcomeExpandBtn.addEventListener("click", (event) => {



        event.preventDefault();



        event.stopPropagation();



        toggleChatWelcomeExpanded();



      });



    }







    if (settingsChatQuickQuestionsEnabledSwitch) {



      settingsChatQuickQuestionsEnabledSwitch.addEventListener("change", () => {



        syncChatAssistantHierarchyUi();



      });



    }







    if (settingsChatAssistantNameSaveBtn && settingsChatAssistantNameInput) {



      settingsChatAssistantNameSaveBtn.addEventListener("click", async () => {



        if (!chatAssistantDraftMode) return;



        const raw = String(settingsChatAssistantNameInput.value || "").trim();



        const nameValue = raw && raw !== DEFAULT_CHAT_ASSISTANT_NAME ? raw : null;



        const selectedGender = getSelectedChatAssistantGender();



        const genderValue = selectedGender === DEFAULT_CHAT_ASSISTANT_GENDER ? null : selectedGender;



        const welcomeRaw = settingsChatWelcomeMessageInput



          ? String(settingsChatWelcomeMessageInput.value || "").trim()



          : "";



        const welcomeValue = welcomeRaw && welcomeRaw !== DEFAULT_CHAT_WELCOME_MESSAGE



          ? welcomeRaw



          : null;



        const welcomeEnabledValue = settingsChatWelcomeEnabledSwitch



          ? (settingsChatWelcomeEnabledSwitch.checked ? 1 : 0)



          : 1;



        const quickQuestionsItems = collectChatQuickQuestionsFromRows();



        const quickQuestionsPayloadValue = buildChatQuickQuestionsPayloadValue(quickQuestionsItems);



        const quickQuestionsEnabledValue = settingsChatQuickQuestionsEnabledSwitch



          ? (settingsChatQuickQuestionsEnabledSwitch.checked ? 1 : 0)



          : 1;



        await saveChatSettingsPayload(



          settingsChatAssistantNameSaveBtn,



          {



            chat_assistant_name: nameValue,



            chat_assistant_gender: genderValue,



            chat_welcome_message: welcomeValue,



            chat_welcome_enabled: welcomeEnabledValue,



            chat_quick_questions_json: quickQuestionsPayloadValue,



            chat_quick_questions_enabled: quickQuestionsEnabledValue,



          },



          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u043c\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a\u0430.",



          () => {



            updateChatAssistantOriginalFromCurrentForm();



            setChatAssistantDraftMode(false);



          }



        );



      });



    }







    if (settingsChatOperatorNameSaveBtn && settingsChatOperatorNameInput) {



      settingsChatOperatorNameSaveBtn.addEventListener("click", async () => {



        if (!chatOperatorDraftMode) return;



        const raw = String(settingsChatOperatorNameInput.value || "").trim();



        const fallback = getChatOperatorFallbackName();



        const value = raw && (!fallback || raw !== fallback) ? raw : null;



        await saveChatSettingsPayload(



          settingsChatOperatorNameSaveBtn,



          { chat_operator_name: value },



          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u043c\u044f \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430.",



          () => {



            updateChatOperatorOriginalFromCurrentForm();



            setChatOperatorDraftMode(false);



          }



        );



      });



    }







    if (settingsChatThreadTtlDaysInput) {



      settingsChatThreadTtlDaysInput.addEventListener("blur", () => {



        settingsChatThreadTtlDaysInput.value = String(



          normalizeChatThreadTtlDays(settingsChatThreadTtlDaysInput.value)



        );



      });



    }







    if (settingsChatGuestThreadTtlDaysInput) {



      settingsChatGuestThreadTtlDaysInput.addEventListener("blur", () => {



        settingsChatGuestThreadTtlDaysInput.value = String(



          normalizeChatGuestThreadTtlDays(settingsChatGuestThreadTtlDaysInput.value)



        );



      });



    }







    if (settingsChatMessageSettingsSaveBtn && settingsChatGuestThreadTtlDaysInput) {



      settingsChatMessageSettingsSaveBtn.addEventListener("click", async () => {



        if (!chatMessageDraftMode) return;



        const normalizedAllTtlDays = settingsChatThreadTtlDaysInput



          ? normalizeChatThreadTtlDays(settingsChatThreadTtlDaysInput.value)



          : 0;



        const normalizedTtlDays = normalizeChatGuestThreadTtlDays(settingsChatGuestThreadTtlDaysInput.value);



        await saveChatSettingsPayload(



          settingsChatMessageSettingsSaveBtn,



          {



            chat_thread_ttl_days: normalizedAllTtlDays,



            chat_guest_thread_ttl_days: normalizedTtlDays,



          },



          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438 \u0430\u0432\u0442\u043e\u043e\u0447\u0438\u0441\u0442\u043a\u0438 \u0447\u0430\u0442\u043e\u0432.",



          () => {



            if (settingsChatThreadTtlDaysInput) {



              settingsChatThreadTtlDaysInput.value = String(normalizedAllTtlDays);



            }



            settingsChatGuestThreadTtlDaysInput.value = String(normalizedTtlDays);



            updateChatMessageOriginalFromCurrentForm();



            setChatMessageDraftMode(false);



          }



        );



      });



    }







    if (settingsChatQuickQuestionsAddBtn) {



      settingsChatQuickQuestionsAddBtn.addEventListener("click", () => {



        const input = appendChatQuickQuestionRow();



        if (!input) return;



        input.focus();



        input.select();



      });



    }







    const imgWebpQualityInput = document.getElementById("settingsImgWebpQuality");



    const imgWebpQualityValue = document.getElementById("settingsImgWebpQualityValue");



    const imgThumbQualityInput = document.getElementById("settingsImgThumbQuality");



    const imgThumbQualityValue = document.getElementById("settingsImgThumbQualityValue");



    const imgThumbWidthInput = document.getElementById("settingsImgThumbWidth");



    const imgMainWidthInput = document.getElementById("settingsImgMainWidth");



    const imgWebpAggressiveInput = document.getElementById("settingsImgWebpAggressive");



    const imgDeleteOriginalInput = document.getElementById("settingsImgDeleteOriginal");



    const imagesSaveBtn = document.getElementById("settingsImagesSaveBtn");







    function syncRangeDisplay(input, display) {



      if (input && display) {



        display.textContent = input.value;



        input.addEventListener("input", () => { display.textContent = input.value; });



      }



    }



    syncRangeDisplay(imgWebpQualityInput, imgWebpQualityValue);



    syncRangeDisplay(imgThumbQualityInput, imgThumbQualityValue);







    window.__applyImagesSettings = function(tenant) {



      if (imgWebpQualityInput) {



        imgWebpQualityInput.value = tenant.img_webp_quality ?? 82;



        if (imgWebpQualityValue) imgWebpQualityValue.textContent = imgWebpQualityInput.value;



      }



      if (imgThumbQualityInput) {



        imgThumbQualityInput.value = tenant.img_thumb_quality ?? 72;



        if (imgThumbQualityValue) imgThumbQualityValue.textContent = imgThumbQualityInput.value;



      }



      if (imgThumbWidthInput) imgThumbWidthInput.value = tenant.img_thumb_width ?? 480;



      if (imgMainWidthInput) imgMainWidthInput.value = tenant.img_main_width ?? 1200;



      if (imgWebpAggressiveInput) imgWebpAggressiveInput.checked = (tenant.img_webp_aggressive ?? 0) == 1;



      if (imgDeleteOriginalInput) imgDeleteOriginalInput.checked = (tenant.img_delete_original ?? 1) == 1;



    };







    if (imagesSaveBtn) {



      imagesSaveBtn.addEventListener("click", async () => {



        const payload = {};



        if (imgWebpQualityInput) payload.img_webp_quality = Number(imgWebpQualityInput.value);



        if (imgThumbQualityInput) payload.img_thumb_quality = Number(imgThumbQualityInput.value);



        if (imgThumbWidthInput) payload.img_thumb_width = Number(imgThumbWidthInput.value);



        if (imgMainWidthInput) payload.img_main_width = Number(imgMainWidthInput.value);



        if (imgWebpAggressiveInput) payload.img_webp_aggressive = imgWebpAggressiveInput.checked;



        if (imgDeleteOriginalInput) payload.img_delete_original = imgDeleteOriginalInput.checked;







        imagesSaveBtn.disabled = true;



        imagesSaveBtn.textContent = "Сохранение...";



        const data = await updateTenantFields(payload);



        imagesSaveBtn.disabled = false;



        imagesSaveBtn.textContent = "Сохранить";



        if (data && data.ok && data.tenant) {



          updateTenantCache(data.tenant);



        }



      });



    }



  });



})();








