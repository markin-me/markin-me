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

    if (manifest) {
      const ver = tenant.updated_at ? encodeURIComponent(String(tenant.updated_at)) : "";
      manifest.href = `/manifest.json${ver ? `?v=${ver}` : ""}`;
    }
  }

  var _shopUrl = "";

  function updateShopLink(tenant) {
    const subdomain = tenant && tenant.subdomain ? String(tenant.subdomain).trim() : "";
    const protocol = window.location.protocol || "http:";
    const hostname = String(window.location.hostname || "");
    const isLocal = hostname.endsWith("localhost");
    const port = isLocal && window.location.port ? `:${window.location.port}` : "";
    _shopUrl = subdomain ? `${protocol}//${subdomain}.${hostname}${port}` : "";
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
      if (settingsPriceRoundingMode && !settingsPriceRoundingMode.value) {
        settingsPriceRoundingMode.value = "none";
      }
      if (settingsPriceRoundingPrecision && !settingsPriceRoundingPrecision.value) {
        settingsPriceRoundingPrecision.value = "2";
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
        tgLoginEnabledInput.title = hasRequired ? "" : "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0438\u043c\u044f \u0431\u043e\u0442\u0430 \u0438 \u0442\u043e\u043a\u0435\u043d Telegram";
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
        maxLoginEnabledInput.title = hasRequired ? "" : "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 ID \u0431\u043e\u0442\u0430 MAX \u0438 \u0442\u043e\u043a\u0435\u043d";
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

      // Фавикон в панели «Данные сайта»
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

      if (typeof applyChatSettingsFromTenant === "function") {
        applyChatSettingsFromTenant(tenant);
      }

      // Фото товаров — заполнить настройки конвертации
      if (typeof window.__applyImagesSettings === "function") {
        window.__applyImagesSettings(tenant);
      }
    } catch (err) {
      console.error("Не удалось загрузить профиль tenant:", err);
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
    loadTenantProfile();

    const settingsSectionButtons = document.querySelectorAll("[data-settings-section]");
    const settingsCenterTitle = document.getElementById("settingsCenterTitle");
    const settingsCenterSubtitle = document.getElementById("settingsCenterSubtitle");
    const settingsTenantCards = document.getElementById("settingsTenantCards");
    const settingsStoresEmpty = document.getElementById("settingsStoresEmpty");
    const settingsCardsPanel = document.getElementById("settingsCardsPanel");
    const siteSectionPanel = document.getElementById("sitePanel");
    const storesPanel = document.getElementById("storesPanel");
    const storesList = document.getElementById("storesList");
    const storesEmpty = document.getElementById("storesEmpty");
    const settingsAddOrderBtn = document.getElementById("settingsAddOrderBtn");
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

    function syncSettingsToolbarControls(section) {
      const isChats = section === "chats";
      if (settingsChatWidgetSwitchWrap) {
        settingsChatWidgetSwitchWrap.classList.toggle("hidden", !isChats);
      }
      if (settingsAddOrderBtn) {
        settingsAddOrderBtn.classList.toggle("hidden", section === "site" || isChats);
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

    applySettingsCardsFilterBySection(document.body.getAttribute("data-settings-section") || "tenant");
    syncSettingsToolbarControls(document.body.getAttribute("data-settings-section") || "tenant");

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
        if (settingsCenterTitle) {
          settingsCenterTitle.textContent = isStores
            ? "Филиалы"
            : isSite
              ? "Сайт"
              : isChats
                ? "\u0427\u0430\u0442\u044b"
                : "Компания";
        }
        if (settingsCenterSubtitle) {
          settingsCenterSubtitle.textContent = isStores ? "Загрузка..." : "";
        }
        applySettingsCardsFilterBySection(section);
        if (settingsTenantCards) settingsTenantCards.classList.toggle("hidden", isStores || isSite);
        if (settingsStoresEmpty) settingsStoresEmpty.classList.add("hidden");
        if (settingsCardsPanel) settingsCardsPanel.classList.toggle("hidden", isStores || isSite);
        if (storesPanel) storesPanel.classList.toggle("hidden", !isStores);
        if (siteSectionPanel) siteSectionPanel.classList.toggle("hidden", !isSite);
        syncSettingsToolbarControls(section);

        if (isStores) {
          const hasStoreTab = rightTabs && rightTabs.querySelector("[data-right-tab^=\"store-\"]");
          if (rightDefault) rightDefault.classList.add("hidden");
          if (hasStoreTab) {
            if (rightHeader) rightHeader.classList.remove("hidden");
            if (rightTabs) rightTabs.classList.remove("hidden");
            setActiveRightTab(hasStoreTab.getAttribute("data-right-tab"));
          } else {
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
          if (rightDefault) rightDefault.classList.remove("hidden");
        }
      });
    });

    const logoCard = document.getElementById("settingsLogoCard");
    const siteCard = document.getElementById("settingsSiteCard");
    const brandCard = document.getElementById("settingsBrandCard");
    const orderStatusesCard = document.getElementById("settingsOrderStatusesCard");
    const orderPaymentsCard = document.getElementById("settingsOrderPaymentsCard");
    const orderDeliveryCard = document.getElementById("settingsOrderDeliveryCard");
    const orderTimeOptionsCard = document.getElementById("settingsOrderTimeOptionsCard");
    const soundsCard = document.getElementById("settingsSoundsCard");
    const chatWelcomeCard = document.getElementById("settingsChatWelcomeCard");
    const chatAssistantNameCard = document.getElementById("settingsChatAssistantNameCard");
    const chatOperatorNameCard = document.getElementById("settingsChatOperatorNameCard");
    const chatHotQuestionsCard = document.getElementById("settingsChatHotQuestionsCard");
    const notificationsCard = document.getElementById("settingsNotificationsCard");
    const imagesCard = document.getElementById("settingsImagesCard");
    const printApiCard = document.getElementById("settingsPrintApiCard");
    const telegramAppCard = document.getElementById("settingsTelegramAppCard");
    const maxAppCard = document.getElementById("settingsMaxAppCard");
    const rightDefault = document.getElementById("settingsRightDefault");
    const logoPanel = document.getElementById("settingsLogoPanel");
    const sitePanel = document.getElementById("settingsSitePanel");
    const domainPanel = document.getElementById("settingsDomainPanel");
    const telegramAppPanel = document.getElementById("settingsTelegramAppPanel");
    const maxAppPanel = document.getElementById("settingsMaxAppPanel");
    const brandPanel = document.getElementById("settingsBrandPanel");
    const orderStatusesPanel = document.getElementById("settingsOrderStatusesPanel");
    const orderPaymentsPanel = document.getElementById("settingsOrderPaymentsPanel");
    const orderDeliveryPanel = document.getElementById("settingsOrderDeliveryPanel");
    const orderTimeOptionsPanel = document.getElementById("settingsOrderTimeOptionsPanel");
    const soundsPanel = document.getElementById("settingsSoundsPanel");
    const chatWelcomePanel = document.getElementById("settingsChatWelcomePanel");
    const chatAssistantNamePanel = document.getElementById("settingsChatAssistantNamePanel");
    const chatOperatorNamePanel = document.getElementById("settingsChatOperatorNamePanel");
    const chatHotQuestionsPanel = document.getElementById("settingsChatHotQuestionsPanel");
    const imagesPanel = document.getElementById("settingsImagesPanel");
    const printApiPanel = document.getElementById("settingsPrintApiPanel");
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
    const settingsChatWelcomeMessageInput = document.getElementById("settingsChatWelcomeMessageInput");
    const settingsChatWelcomeSaveBtn = document.getElementById("settingsChatWelcomeSaveBtn");
    const settingsChatAssistantNameInput = document.getElementById("settingsChatAssistantNameInput");
    const settingsChatAssistantNameSaveBtn = document.getElementById("settingsChatAssistantNameSaveBtn");
    const settingsChatAssistantGenderOptions = document.getElementById("settingsChatAssistantGenderOptions");
    const settingsChatOperatorNameInput = document.getElementById("settingsChatOperatorNameInput");
    const settingsChatOperatorNameSaveBtn = document.getElementById("settingsChatOperatorNameSaveBtn");
    const settingsChatHotQuestionsGrid = document.getElementById("settingsChatHotQuestionsGrid");
    const settingsChatQuickQuestionsJson = document.getElementById("settingsChatQuickQuestionsJson");
    const settingsChatQuickQuestionsAddBtn = document.getElementById("settingsChatQuickQuestionsAddBtn");
    const settingsChatQuickQuestionsSaveBtn = document.getElementById("settingsChatQuickQuestionsSaveBtn");
    const settingsChatQuickQuestionsResetBtn = document.getElementById("settingsChatQuickQuestionsResetBtn");
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
    const settingsStoreAddress = document.getElementById("settingsStoreAddress");
    const settingsStoreCity = document.getElementById("settingsStoreCity");
    const settingsStorePhone = document.getElementById("settingsStorePhone");
    const settingsStoreTimezoneSelect = document.getElementById("settingsStoreTimezoneSelect");
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
    const settingsPrintApiPrinterStatus = document.getElementById("settingsPrintApiPrinterStatus");
    const settingsPrintApiPrinterName = document.getElementById("settingsPrintApiPrinterName");
    const settingsStoreTelegramList = document.getElementById("settingsStoreTelegramList");
    const settingsStoreTelegramApiKey = document.getElementById("settingsStoreTelegramApiKey");
    const settingsStoreTelegramSecretKey = document.getElementById("settingsStoreTelegramSecretKey");
    const settingsStoreTelegramAddByKeysBtn = document.getElementById("settingsStoreTelegramAddByKeysBtn");
    const settingsStoreTelegramToggleBtn = document.getElementById("settingsStoreTelegramToggleBtn");
    const settingsStoreTelegramConnectBlock = document.getElementById("settingsStoreTelegramConnectBlock");
    const settingsStoreTelegramCancelBtn = document.getElementById("settingsStoreTelegramCancelBtn");

    const storesState = {
      loaded: false,
      items: [],
      selectedId: null,
      snapshot: null,
      mode: "view"
    };
    const storeTabs = new Map();
    let activeRightTabId = "";
    let printApiRefreshTimer = null;
    const DELIVERY_TAB_ID = "delivery-settings";
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
    const DEFAULT_CHAT_WELCOME_MESSAGE =
      "\u041f\u0440\u0438\u0432\u0435\u0442! \u042f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0439 \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a \u041d\u044f\u043c-\u041d\u044f\u043c!\n" +
      "\u0415\u0441\u043b\u0438 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u0437\u0430\u043a\u0430\u0437\u0443, \u0442\u043e \u0441\u0435\u0433\u043e\u0434\u043d\u044f " +
      "\u0441\u0442\u0430\u043b\u043a\u0438\u0432\u0430\u0435\u043c\u0441\u044f \u0441\u043e \u0441\u043b\u043e\u0436\u043d\u043e\u0441\u0442\u044f\u043c\u0438 \u0438\u0437-\u0437\u0430 " +
      "\u043f\u043e\u0433\u043e\u0434\u043d\u044b\u0445 \u0443\u0441\u043b\u043e\u0432\u0438\u0439: \u043c\u043e\u0436\u0435\u043c \u0432\u0435\u0437\u0442\u0438 \u043f\u043e\u043a\u0443\u043f\u043a\u0443 " +
      "\u0447\u0443\u0442\u044c \u0434\u043e\u043b\u044c\u0448\u0435.";
    const DEFAULT_CHAT_QUICK_QUESTIONS = [
      "\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?",
      "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430",
      "\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430",
      "\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441"
    ];
    const CHAT_QUICK_QUESTIONS_MIN = DEFAULT_CHAT_QUICK_QUESTIONS.length;
    const CHAT_QUICK_QUESTIONS_MAX = 6;

    function normalizeChatAssistantGenderValue(rawValue) {
      if (rawValue === undefined || rawValue === null || rawValue === "") {
        return DEFAULT_CHAT_ASSISTANT_GENDER;
      }
      const normalized = String(rawValue).trim().toLowerCase();
      if (normalized === "f" || normalized === "female" || normalized === "\u0436") return "f";
      return DEFAULT_CHAT_ASSISTANT_GENDER;
    }

    function getSelectedChatAssistantGender() {
      if (!settingsChatAssistantGenderOptions) return DEFAULT_CHAT_ASSISTANT_GENDER;
      const checked = settingsChatAssistantGenderOptions.querySelector(
        'input[name="settingsChatAssistantGender"]:checked'
      );
      return normalizeChatAssistantGenderValue(checked ? checked.value : DEFAULT_CHAT_ASSISTANT_GENDER);
    }

    function setSelectedChatAssistantGender(rawValue) {
      if (!settingsChatAssistantGenderOptions) return;
      const value = normalizeChatAssistantGenderValue(rawValue);
      const target = settingsChatAssistantGenderOptions.querySelector(
        `input[name="settingsChatAssistantGender"][value="${value}"]`
      );
      if (target) target.checked = true;
    }

    function parseChatQuickQuestions(rawValue) {
      const fallback = DEFAULT_CHAT_QUICK_QUESTIONS.slice();
      if (!rawValue) return fallback;

      let parsed = [];
      if (Array.isArray(rawValue)) {
        parsed = rawValue;
      } else if (typeof rawValue === "string") {
        try {
          const next = JSON.parse(rawValue);
          if (Array.isArray(next)) {
            parsed = next;
          }
        } catch (err) {
          parsed = [];
        }
      }

      const normalized = parsed
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
        .slice(0, CHAT_QUICK_QUESTIONS_MAX);
      return normalized.length ? normalized : fallback;
    }

    function getSettingsChatQuickQuestionInputs() {
      if (!settingsChatHotQuestionsGrid) return [];
      return Array.from(settingsChatHotQuestionsGrid.querySelectorAll("[data-chat-quick-input]"));
    }

    function getChatQuickQuestionPlaceholder(index) {
      if (index >= 0 && index < DEFAULT_CHAT_QUICK_QUESTIONS.length) {
        return DEFAULT_CHAT_QUICK_QUESTIONS[index];
      }
      return `\u0412\u043e\u043f\u0440\u043e\u0441 ${index + 1}`;
    }

    function updateChatQuickQuestionControlsState() {
      if (!settingsChatQuickQuestionsAddBtn) return;
      const inputs = getSettingsChatQuickQuestionInputs();
      settingsChatQuickQuestionsAddBtn.disabled = inputs.length >= CHAT_QUICK_QUESTIONS_MAX;
    }

    function reindexChatQuickQuestionInputs() {
      const inputs = getSettingsChatQuickQuestionInputs();
      inputs.forEach((input, index) => {
        input.setAttribute("data-chat-quick-input", String(index));
        input.placeholder = getChatQuickQuestionPlaceholder(index);
      });
      updateChatQuickQuestionControlsState();
      return inputs;
    }

    function createChatQuickQuestionInput(value, index) {
      const pill = document.createElement("label");
      pill.className = "settings-chat-question-pill";

      const input = document.createElement("input");
      input.className = "control settings-chat-question-input";
      input.type = "text";
      input.setAttribute("data-chat-quick-input", String(index));
      input.placeholder = getChatQuickQuestionPlaceholder(index);
      input.value = String(value ?? "").trim();

      pill.appendChild(input);
      return { pill, input };
    }

    function ensureChatQuickQuestionInputsCount(count) {
      if (!settingsChatHotQuestionsGrid) return [];
      const safeCount = Number.isFinite(Number(count)) ? Number(count) : CHAT_QUICK_QUESTIONS_MIN;
      const target = Math.max(CHAT_QUICK_QUESTIONS_MIN, Math.min(CHAT_QUICK_QUESTIONS_MAX, safeCount));
      let inputs = getSettingsChatQuickQuestionInputs();

      while (inputs.length < target) {
        const { pill } = createChatQuickQuestionInput("", inputs.length);
        settingsChatHotQuestionsGrid.appendChild(pill);
        inputs = getSettingsChatQuickQuestionInputs();
      }

      while (inputs.length > target) {
        const lastInput = inputs[inputs.length - 1];
        const wrapper = lastInput ? lastInput.closest(".settings-chat-question-pill") : null;
        if (wrapper) wrapper.remove();
        else if (lastInput) lastInput.remove();
        inputs = getSettingsChatQuickQuestionInputs();
      }

      return reindexChatQuickQuestionInputs();
    }

    function appendChatQuickQuestionInput() {
      if (!settingsChatHotQuestionsGrid) return null;
      const inputs = getSettingsChatQuickQuestionInputs();
      if (inputs.length >= CHAT_QUICK_QUESTIONS_MAX) return null;
      const { pill, input } = createChatQuickQuestionInput("", inputs.length);
      settingsChatHotQuestionsGrid.appendChild(pill);
      reindexChatQuickQuestionInputs();
      return input;
    }

    function getChatOperatorFallbackName() {
      const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;
      const name = tenant && tenant.name ? String(tenant.name).trim() : "";
      return name || "";
    }

    function applyChatQuickQuestionsToInputs(rawValue) {
      if (!settingsChatHotQuestionsGrid) return;
      const list = parseChatQuickQuestions(rawValue);
      const inputs = ensureChatQuickQuestionInputsCount(list.length);
      inputs.forEach((input, index) => {
        input.value = list[index] || "";
      });
      if (settingsChatQuickQuestionsJson) {
        settingsChatQuickQuestionsJson.value = JSON.stringify(list);
      }
      updateChatQuickQuestionControlsState();
    }

    function collectChatQuickQuestionsFromInputs() {
      return getSettingsChatQuickQuestionInputs()
        .map((input) => String(input && input.value ? input.value : "").trim())
        .filter(Boolean)
        .slice(0, CHAT_QUICK_QUESTIONS_MAX);
    }

    reindexChatQuickQuestionInputs();

    function applyChatSettingsFromTenant(tenant) {
      const assistantValue = tenant && tenant.chat_assistant_name ? String(tenant.chat_assistant_name).trim() : "";
      if (settingsChatAssistantNameInput) {
        settingsChatAssistantNameInput.value = assistantValue || DEFAULT_CHAT_ASSISTANT_NAME;
      }

      setSelectedChatAssistantGender(
        tenant ? tenant.chat_assistant_gender : DEFAULT_CHAT_ASSISTANT_GENDER
      );

      const welcomeValue = tenant && tenant.chat_welcome_message ? String(tenant.chat_welcome_message) : "";
      if (settingsChatWelcomeMessageInput) {
        settingsChatWelcomeMessageInput.value = welcomeValue || DEFAULT_CHAT_WELCOME_MESSAGE;
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

      applyChatQuickQuestionsToInputs(tenant ? tenant.chat_quick_questions_json : null);
    }

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
      if (telegramAppPanel) telegramAppPanel.classList.toggle("hidden", tabId !== "telegram-app");
      if (maxAppPanel) maxAppPanel.classList.toggle("hidden", tabId !== "max-app");
      if (brandPanel) brandPanel.classList.toggle("hidden", tabId !== "brand");
      if (orderStatusesPanel) orderStatusesPanel.classList.toggle("hidden", tabId !== "order-statuses");
      if (orderPaymentsPanel) orderPaymentsPanel.classList.toggle("hidden", tabId !== "order-payments");
      if (orderDeliveryPanel) orderDeliveryPanel.classList.toggle("hidden", tabId !== "order-delivery");
      if (orderTimeOptionsPanel) orderTimeOptionsPanel.classList.toggle("hidden", tabId !== "order-time-options");
      if (soundsPanel) soundsPanel.classList.toggle("hidden", tabId !== "sounds");
      if (chatWelcomePanel) chatWelcomePanel.classList.toggle("hidden", tabId !== "chat-welcome");
      if (chatAssistantNamePanel) chatAssistantNamePanel.classList.toggle("hidden", tabId !== "chat-assistant-name");
      if (chatOperatorNamePanel) chatOperatorNamePanel.classList.toggle("hidden", tabId !== "chat-operator-name");
      if (chatHotQuestionsPanel) chatHotQuestionsPanel.classList.toggle("hidden", tabId !== "chat-hot-questions");
      if (settingsNotificationsPanel) settingsNotificationsPanel.classList.toggle("hidden", tabId !== "notifications");
      if (imagesPanel) imagesPanel.classList.toggle("hidden", tabId !== "images");
      if (printApiPanel) printApiPanel.classList.toggle("hidden", tabId !== "print-api");
      if (settingsDeliveryPanel) settingsDeliveryPanel.classList.toggle("hidden", tabId !== DELIVERY_TAB_ID);
      if (settingsStorePanel) settingsStorePanel.classList.toggle("hidden", !tabId.startsWith("store-"));
      if (settingsStoreEmpty) {
        const shouldShow = section === "stores" && tabId === "";
        settingsStoreEmpty.classList.toggle("hidden", !shouldShow);
      }
      if (settingsDeliveryEmpty) {
        const shouldShow = isDeliverySection && tabId === "";
        settingsDeliveryEmpty.classList.toggle("hidden", !shouldShow);
      }

      if (tabId === "order-statuses" || tabId === "order-payments" || tabId === "order-delivery" || tabId === "order-time-options") {
        ensureListLoaded(tabId);
      }
      if (tabId.startsWith("store-")) {
        applyStoreTabState(tabId);
      }
      if (tabId === "print-api") {
        ensurePrintApiReady();
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
          if (tabId === "telegram-app" && telegramAppCard) telegramAppCard.classList.remove("is-active");
          if (tabId === "max-app" && maxAppCard) maxAppCard.classList.remove("is-active");
          if (tabId === "brand" && brandCard) brandCard.classList.remove("is-active");
          if (tabId === "order-statuses" && orderStatusesCard) orderStatusesCard.classList.remove("is-active");
          if (tabId === "order-payments" && orderPaymentsCard) orderPaymentsCard.classList.remove("is-active");
          if (tabId === "order-delivery" && orderDeliveryCard) orderDeliveryCard.classList.remove("is-active");
          if (tabId === "order-time-options" && orderTimeOptionsCard) orderTimeOptionsCard.classList.remove("is-active");
          if (tabId === "sounds" && soundsCard) soundsCard.classList.remove("is-active");
          if (tabId === "chat-welcome" && chatWelcomeCard) chatWelcomeCard.classList.remove("is-active");
          if (tabId === "chat-assistant-name" && chatAssistantNameCard) chatAssistantNameCard.classList.remove("is-active");
          if (tabId === "chat-operator-name" && chatOperatorNameCard) chatOperatorNameCard.classList.remove("is-active");
          if (tabId === "chat-hot-questions" && chatHotQuestionsCard) chatHotQuestionsCard.classList.remove("is-active");
          if (tabId === "notifications" && notificationsCard) notificationsCard.classList.remove("is-active");
          if (tabId === "images" && imagesCard) imagesCard.classList.remove("is-active");
          if (tabId === "print-api" && printApiCard) printApiCard.classList.remove("is-active");
          if (tabId === DELIVERY_TAB_ID) {
            deliverySettingsState.selectedId = null;
            deliverySettingsState.snapshot = null;
            deliverySettingsState.mode = "view";
            setActiveRightTab("");
          }
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
      if (tabId === "telegram-app" && telegramAppCard) telegramAppCard.classList.add("is-active");
      if (tabId === "max-app" && maxAppCard) maxAppCard.classList.add("is-active");
      if (tabId === "brand" && brandCard) brandCard.classList.add("is-active");
      if (tabId === "order-statuses" && orderStatusesCard) orderStatusesCard.classList.add("is-active");
      if (tabId === "order-payments" && orderPaymentsCard) orderPaymentsCard.classList.add("is-active");
      if (tabId === "order-delivery" && orderDeliveryCard) orderDeliveryCard.classList.add("is-active");
      if (tabId === "order-time-options" && orderTimeOptionsCard) orderTimeOptionsCard.classList.add("is-active");
      if (tabId === "sounds" && soundsCard) soundsCard.classList.add("is-active");
      if (tabId === "chat-welcome" && chatWelcomeCard) chatWelcomeCard.classList.add("is-active");
      if (tabId === "chat-assistant-name" && chatAssistantNameCard) chatAssistantNameCard.classList.add("is-active");
      if (tabId === "chat-operator-name" && chatOperatorNameCard) chatOperatorNameCard.classList.add("is-active");
      if (tabId === "chat-hot-questions" && chatHotQuestionsCard) chatHotQuestionsCard.classList.add("is-active");
      if (tabId === "notifications" && notificationsCard) notificationsCard.classList.add("is-active");
      if (tabId === "images" && imagesCard) imagesCard.classList.add("is-active");
      if (tabId === "print-api" && printApiCard) printApiCard.classList.add("is-active");
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
    if (domainCard) {
      domainCard.addEventListener("click", () => {
        ensureTab("domain", "Домен");
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

    // Telegram bot username — save on change
    const tgBotUsernameEl = document.getElementById("tenantTelegramBotUsername");
    const tgBotUsernameLinkBtn = document.getElementById("tenantTelegramBotUsernameLink");
    const tgBotTokenEl = document.getElementById("tenantTelegramBotToken");
    const tgBotTokenCopyBtn = document.getElementById("tenantTelegramBotTokenCopyBtn");
    const tgMiniAppEnabledEl = document.getElementById("tenantTelegramMiniAppEnabled");
    const tgLoginEnabledEl = document.getElementById("tenantTelegramLoginEnabled");
    const maxBotIdEl = document.getElementById("tenantMaxBotId");
    const maxBotTokenEl = document.getElementById("tenantMaxBotToken");
    const maxBotTokenCopyBtn = document.getElementById("tenantMaxBotTokenCopyBtn");
    const maxMiniAppEnabledEl = document.getElementById("tenantMaxMiniAppEnabled");
    const maxLoginEnabledEl = document.getElementById("tenantMaxLoginEnabled");

    const syncMaxLoginSwitchState = function () {
      if (!maxLoginEnabledEl) return;
      var hasRequired = !!(String((maxBotIdEl && maxBotIdEl.value) || "").trim() && String((maxBotTokenEl && maxBotTokenEl.value) || "").trim());
      maxLoginEnabledEl.disabled = !hasRequired;
      maxLoginEnabledEl.title = hasRequired ? "" : "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 ID \u0431\u043e\u0442\u0430 MAX \u0438 \u0442\u043e\u043a\u0435\u043d";
      if (!hasRequired) {
        maxLoginEnabledEl.checked = false;
      }
    };
    const syncTgLoginSwitchState = function () {
      if (!tgLoginEnabledEl) return;
      var hasRequired = !!(String((tgBotUsernameEl && tgBotUsernameEl.value) || "").trim() && String((tgBotTokenEl && tgBotTokenEl.value) || "").trim());
      tgLoginEnabledEl.disabled = !hasRequired;
      tgLoginEnabledEl.title = hasRequired ? "" : "\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0438\u043c\u044f \u0431\u043e\u0442\u0430 \u0438 \u0442\u043e\u043a\u0435\u043d Telegram";
      if (!hasRequired) {
        tgLoginEnabledEl.checked = false;
      }
    };

    if (tgBotUsernameEl) {
      tgBotUsernameEl.addEventListener("change", function () {
        var val = tgBotUsernameEl.value.trim().replace(/^@/, "");
        tgBotUsernameEl.value = val;
        updateTenantFields({ telegram_bot_username: val || null });
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
        updateTenantFields({ telegram_bot_token: val || null });
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

    if (maxBotIdEl) {
      maxBotIdEl.addEventListener("change", function () {
        var val = maxBotIdEl.value.trim();
        updateTenantFields({ max_bot_id: val || null });
        syncMaxLoginSwitchState();
      });
    }

    if (maxBotTokenEl) {
      maxBotTokenEl.addEventListener("change", function () {
        var val = maxBotTokenEl.value.trim();
        updateTenantFields({ max_bot_token: val || null });
        syncMaxLoginSwitchState();
      });
    }

    if (maxLoginEnabledEl) {
      maxLoginEnabledEl.addEventListener("change", function () {
        if (maxLoginEnabledEl.checked) {
          var hasRequired = !!(String((maxBotIdEl && maxBotIdEl.value) || "").trim() && String((maxBotTokenEl && maxBotTokenEl.value) || "").trim());
          if (!hasRequired) {
            maxLoginEnabledEl.checked = false;
            alert("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 ID \u0431\u043e\u0442\u0430 MAX \u0438 \u0442\u043e\u043a\u0435\u043d");
            return;
          }
        }
        updateTenantFields({ max_login_enabled: maxLoginEnabledEl.checked ? 1 : 0 });
      });
      syncMaxLoginSwitchState();
    }

    if (maxMiniAppEnabledEl) {
      maxMiniAppEnabledEl.addEventListener("change", function () {
        updateTenantFields({ max_mini_app_enabled: maxMiniAppEnabledEl.checked ? 1 : 0 });
      });
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
        updateTenantFields({ tg_mini_app_enabled: tgMiniAppEnabledEl.checked ? 1 : 0 });
      });
    }

    if (tgLoginEnabledEl) {
      tgLoginEnabledEl.addEventListener("change", function () {
        var hasRequired = !!(String((tgBotUsernameEl && tgBotUsernameEl.value) || "").trim() && String((tgBotTokenEl && tgBotTokenEl.value) || "").trim());
        if (!hasRequired) {
          tgLoginEnabledEl.checked = false;
          alert("\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0437\u0430\u043f\u043e\u043b\u043d\u0438\u0442\u0435 \u0438\u043c\u044f \u0431\u043e\u0442\u0430 \u0438 \u0442\u043e\u043a\u0435\u043d Telegram");
          return;
        }
        updateTenantFields({ tg_login_enabled: tgLoginEnabledEl.checked ? 1 : 0 });
      });
      syncTgLoginSwitchState();
    }

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
      var suffix = document.getElementById("subdomainSuffix");
      var prefix = document.getElementById("subdomainPrefix");
      var input = document.getElementById("subdomainInput");
      var wrap = input ? input.closest(".control-subdomain-wrap") : null;
      var hostname = location.hostname || "localhost";
      var isLocal = hostname.endsWith("localhost");
      var port = isLocal && location.port ? ":" + location.port : "";
      if (prefix) prefix.textContent = location.protocol + "//";
      if (suffix) suffix.textContent = "." + hostname + port;
      if (wrap && input) wrap.addEventListener("click", function () { input.focus(); });
    })();

    // Subdomain actions: go to site & copy link
    var subdomainGoBtn = document.getElementById("subdomainGoBtn");
    var subdomainCopyLinkBtn = document.getElementById("subdomainCopyLinkBtn");
    if (subdomainGoBtn) {
      subdomainGoBtn.addEventListener("click", function () {
        if (_shopUrl) window.open(_shopUrl, "_blank");
      });
    }
    if (subdomainCopyLinkBtn) {
      subdomainCopyLinkBtn.addEventListener("click", function () {
        if (!_shopUrl) return;
        navigator.clipboard.writeText(_shopUrl).then(function () {
          var icon = subdomainCopyLinkBtn.querySelector("i");
          if (icon) {
            icon.className = "fas fa-check";
            setTimeout(function () { icon.className = "fas fa-copy"; }, 1500);
          }
        });
      });
    }

    // NS copy buttons
    document.querySelectorAll("[data-copy-ns]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var nsEl = btn.previousElementSibling;
        if (!nsEl) return;
        navigator.clipboard.writeText(nsEl.textContent.trim()).then(function () {
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
      var resultsBlock = document.getElementById("domainCheckResults");
      var domainInput = document.getElementById("domainInput");
      if (!checkBtn || !resultsBlock || !domainInput) return;

      function setCheckState(id, state, statusText) {
        var item = document.getElementById(id);
        if (!item) return;
        var icon = item.querySelector(".domain-check-icon");
        var status = item.querySelector(".domain-check-status");
        if (icon) { icon.className = "domain-check-icon is-" + state; }
        if (status) { status.textContent = statusText || ""; }
      }

      checkBtn.addEventListener("click", async function () {
        var domain = domainInput.value.trim();
        if (!domain) return;

        resultsBlock.classList.remove("hidden");
        setCheckState("domainCheckDns", "pending", "Проверяем...");
        setCheckState("domainCheckHttp", "pending", "Проверяем...");
        setCheckState("domainCheckSsl", "pending", "Проверяем...");
        checkBtn.disabled = true;
        var btnIcon = checkBtn.querySelector("i");
        if (btnIcon) btnIcon.className = "fas fa-spinner fa-spin";

        try {
          var token = typeof getAuthToken === "function" ? getAuthToken() : null;
          var res = await fetch("/api/admin/tenant/check-domain", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
            body: JSON.stringify({ domain: domain })
          });
          var data = await res.json();
          if (data.ok && data.result) {
            var r = data.result;
            setCheckState("domainCheckDns", r.dns ? "ok" : "fail", r.dns ? r.dns_detail : r.dns_detail);
            setCheckState("domainCheckHttp", r.http ? "ok" : "fail", r.http_detail);
            setCheckState("domainCheckSsl", r.ssl ? "ok" : "fail", r.ssl_detail);
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
        checkBtn.disabled = false;
        if (btnIcon) btnIcon.className = "fas fa-sync-alt";
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
    if (chatWelcomeCard) {
      chatWelcomeCard.addEventListener("click", () => {
        ensureTab("chat-welcome", "\u041f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0435\u043d\u043d\u043e\u0435 \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u0435");
      });
    }

    if (chatAssistantNameCard) {
      chatAssistantNameCard.addEventListener("click", () => {
        ensureTab("chat-assistant-name", "\u0418\u043c\u044f \u0432\u0438\u0440\u0442\u0443\u0430\u043b\u044c\u043d\u043e\u0433\u043e \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a\u0430");
      });
    }

    if (chatOperatorNameCard) {
      chatOperatorNameCard.addEventListener("click", () => {
        ensureTab("chat-operator-name", "\u0418\u043c\u044f \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430");
      });
    }

    if (chatHotQuestionsCard) {
      chatHotQuestionsCard.addEventListener("click", () => {
        ensureTab("chat-hot-questions", "\u0421\u0435\u0442\u043a\u0430 \u0433\u043e\u0440\u044f\u0447\u0438\u0445 \u0432\u043e\u043f\u0440\u043e\u0441\u043e\u0432");
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
        ensureTab("print-api", "API");
      });
    }

    if (settingsPrintApiStore) {
      settingsPrintApiStore.addEventListener("change", () => {
        const storeId = Number(settingsPrintApiStore.value);
        if (storeId) loadPrintApiToken(storeId);
      });
    }

    if (settingsPrintApiGenerateBtn) {
      settingsPrintApiGenerateBtn.addEventListener("click", () => {
        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);
        if (storeId) generatePrintApiToken(storeId);
      });
    }

    if (settingsStoreTelegramList) {
      settingsStoreTelegramList.addEventListener("click", async (e) => {
        const btn = e.target.closest("button[data-binding-id]");
        if (!btn) return;
        const bindingId = btn.getAttribute("data-binding-id");
        const storeId = storesState.selectedId;
        if (!storeId || !bindingId) return;
        if (!confirm("Отключить уведомления в этот чат?")) return;
        try {
          const res = await authFetch("/api/admin/tenant/stores/" + encodeURIComponent(storeId) + "/telegram/" + encodeURIComponent(bindingId), { method: "DELETE" });
          const data = await res.json();
          if (data && data.ok) loadStoreTelegramBindings(storeId);
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

    if (settingsAddOrderBtn) {
      settingsAddOrderBtn.addEventListener("click", () => {
        const section = document.body.getAttribute("data-settings-section");
        if (section !== "stores") return;
        startCreateStore();
      });
    }

    if (settingsStoreSaveBtn) {
      settingsStoreSaveBtn.addEventListener("click", async () => {
        const payload = {
          name: trimOrNull(settingsStoreName?.value),
          code: trimOrNull(settingsStoreCode?.value),
          address: trimOrNull(settingsStoreAddress?.value),
          city: trimOrNull(settingsStoreCity?.value),
          phone: trimOrNull(settingsStorePhone?.value),
          timezone: settingsStoreTimezoneSelect ? settingsStoreTimezoneSelect.value : null,
          is_active: settingsStoreActive && settingsStoreActive.checked ? 1 : 0
        };
        payload.use_global_hours = storeHoursState.useGlobal ? 1 : 0;
        payload.hours = buildStoreHoursPayload();
        payload.use_delivery_hours = deliveryHoursState.useGlobal ? 1 : 0;
        payload.delivery_hours = buildDeliveryHoursPayload();

        if (!payload.name) {
          alert("Введите название Филиалы.");
          return;
        }

        let data = null;
        const tabData = storeTabs.get(activeRightTabId);
        if (tabData && tabData.mode === "create") {
          data = await createStore(payload);
          if (!data || !data.ok || !data.store) {
            if (data && data.error === "CODE_TAKEN") {
              alert("Код уже используется. Введите другой.");
            } else {
              alert("Не удалось создать филиал.");
            }
            return;
          }
        } else {
          const id = tabData ? tabData.storeId : storesState.selectedId;
          if (!id) return;
          data = await updateStore(id, payload);
          if (!data || !data.ok || !data.store) {
            if (data && data.error === "CODE_TAKEN") {
              alert("Код уже используется. Введите другой.");
            } else if (data && data.error === "NAME_REQUIRED") {
              alert("Название обязательно.");
            } else {
              alert("Не удалось обновить филиал.");
            }
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
        row.className = "order-row product-row settings-card";
        row.dataset.id = String(store.id);

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

        const action = document.createElement("div");
        action.className = "order-col";

        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Открыть";
        action.appendChild(badge);

        row.appendChild(avatar);
        row.appendChild(info);
        row.appendChild(action);

        row.addEventListener("click", () => selectStore(store));
        storesList.appendChild(row);
      });
    }

    function fillStoreForm(store) {
      if (!store) return;
      if (settingsStoreSubtitle) {
        const codePart = store.code ? ` • ${store.code}` : "";
        settingsStoreSubtitle.textContent = `ID ${store.id}${codePart}`;
      }
      if (settingsStoreName) settingsStoreName.value = normalizeValue(store.name);
      if (settingsStoreCode) settingsStoreCode.value = normalizeValue(store.code);
      if (settingsStoreAddress) settingsStoreAddress.value = normalizeValue(store.address);
      if (settingsStoreCity) settingsStoreCity.value = normalizeValue(store.city);
      if (settingsStorePhone) settingsStorePhone.value = normalizeValue(store.phone);

      const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;
      const fallbackTz = tenant?.timezone || "+0";
      const storeTz = store.timezone || fallbackTz;
      if (settingsStoreTimezoneSelect) {
        fillTimezoneSelect(storeTz, settingsStoreTimezoneSelect);
      }
      if (settingsStoreActive) settingsStoreActive.checked = Number(store.is_active) === 1;
      applyStoreHours(store);
      applyDeliveryHours(store);
      loadStoreTelegramBindings(store.id);
    }

    function showStorePanel(show) {
      if (settingsStorePanel) settingsStorePanel.classList.toggle("hidden", !show);
    }

    function setStoreMode(mode, store) {
      storesState.mode = mode;
      if (settingsStoreSaveText) {
        settingsStoreSaveText.textContent = mode === "create" ? "Создать" : "Сохранить";
      }
      if (mode === "create") {
        if (settingsStoreSubtitle) settingsStoreSubtitle.textContent = "Новая точка";
        if (settingsStoreTelegramList) settingsStoreTelegramList.innerHTML = "<div class=\"global-telegram-binding\"><div class=\"global-telegram-header\"><span class=\"muted\">Сначала сохраните филиал</span></div></div>";
        if (settingsStoreTelegramConnectBlock) settingsStoreTelegramConnectBlock.classList.add("hidden");
        if (settingsStoreName) settingsStoreName.value = "";
        if (settingsStoreCode) settingsStoreCode.value = "";
        if (settingsStoreAddress) settingsStoreAddress.value = "";
        if (settingsStoreCity) settingsStoreCity.value = "";
        if (settingsStorePhone) settingsStorePhone.value = "";
        const tenant = typeof getAuthTenant === "function" ? getAuthTenant() : null;
        const fallbackTz = tenant?.timezone || "+0";
        if (settingsStoreTimezoneSelect) {
          fillTimezoneSelect(fallbackTz, settingsStoreTimezoneSelect);
        }
        if (settingsStoreActive) settingsStoreActive.checked = true;
        resetStoreHoursState();
        resetDeliveryHoursState();
      } else if (store) {
        fillStoreForm(store);
      }
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
      const data = await fetchStores();
      if (!data || !data.ok) return;
      const items = Array.isArray(data.stores) ? data.stores : [];
      storesState.loaded = true;
      storesState.items = items;
      if (settingsCenterSubtitle) {
        const section = document.body.getAttribute("data-settings-section");
        if (section === "stores") {
          const count = items.length;
          settingsCenterSubtitle.textContent = count ? `Всего точек: ${count}` : "Точек пока нет";
        }
      }
      renderStoresList(items);
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

    function resetPrintApiDeviceState() {
      if (settingsPrintApiPrinterStatus) settingsPrintApiPrinterStatus.value = "Соединение разорвано";
      if (settingsPrintApiPrinterName) settingsPrintApiPrinterName.value = "Не подключенных принтеров";
      // agent hint removed
    }

    function applyPrintApiDeviceState(info) {
      if (!info) {
        resetPrintApiDeviceState();
        return;
      }
      const printerOnline = Number(info.printer_online || 0) === 1;
      const agentRunning = Number(info.agent_running || 0) === 1;
      const printerName = info.printer_name ? String(info.printer_name) : "";
      const agentName = info.agent_name ? String(info.agent_name) : "";
      const agentVersion = info.agent_version ? String(info.agent_version) : "";
      const connectionEstablished = agentRunning;
      const statusText = connectionEstablished ? "Соединение установлено" : "Соединение разорвано";
      if (settingsPrintApiPrinterStatus) settingsPrintApiPrinterStatus.value = statusText;
      if (settingsPrintApiPrinterName) {
        settingsPrintApiPrinterName.value = printerOnline ? (printerName || "Не определен") : "Нет подключенных принтеров";
      }
    }

    async function loadPrintApiToken(storeId) {
      if (!settingsPrintApiToken || !storeId) return;
      try {
        const res = await authFetch(`/api/admin/tenant/print-api?store_id=${encodeURIComponent(storeId)}&_ts=${Date.now()}`);
        const data = await res.json();
        if (!data || !data.ok) {
          resetPrintApiDeviceState();
          return;
        }
        const token = data.data && data.data.token ? data.data.token : "";
        settingsPrintApiToken.value = token;
        applyPrintApiDeviceState(data.data || null);
        if (settingsPrintApiGenerateBtn) {
          settingsPrintApiGenerateBtn.textContent = token ? "Пересоздать токен" : "Сгенерировать токен";
        }
      } catch (err) {
        console.error("Не удалось загрузить print API:", err);
        resetPrintApiDeviceState();
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
          resetPrintApiDeviceState();
          return;
        }
        const token = data.data && data.data.token ? data.data.token : "";
        if (settingsPrintApiToken) settingsPrintApiToken.value = token;
        applyPrintApiDeviceState(data.data || null);
        if (settingsPrintApiGenerateBtn) settingsPrintApiGenerateBtn.textContent = "Пересоздать токен";
      } catch (err) {
        console.error("Не удалось создать print API:", err);
      }
    }

    function stopPrintApiRefresh() {
      if (!printApiRefreshTimer) return;
      clearInterval(printApiRefreshTimer);
      printApiRefreshTimer = null;
    }

    function startPrintApiRefresh() {
      stopPrintApiRefresh();
      printApiRefreshTimer = setInterval(() => {
        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);
        if (storeId) loadPrintApiToken(storeId);
      }, 3000);
    }

    function ensurePrintApiReady() {
      const loadAndSelect = async () => {
        if (!storesState.loaded) {
          await loadStores();
        }
        populatePrintApiStores(storesState.items);
        const storeId = Number(settingsPrintApiStore && settingsPrintApiStore.value);
        if (storeId) {
          await loadPrintApiToken(storeId);
        } else {
          resetPrintApiDeviceState();
        }
      };
      loadAndSelect();
      startPrintApiRefresh();
    }

    ensurePrintApiReady();

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
      renderStoresList(next);
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

    // Обработчик "+" для показа формы добавления (филиал)
    if (settingsStoreTelegramToggleBtn) {
      settingsStoreTelegramToggleBtn.addEventListener("click", () => {
        if (settingsStoreTelegramConnectBlock) {
          settingsStoreTelegramConnectBlock.classList.toggle("hidden");
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

    // Фавикон в панели «Данные сайта»
    (function () {
      var uploadBtn = document.getElementById("siteFaviconUploadBtn");
      var fileInput = document.getElementById("siteFaviconFileInput");
      var deleteBtn = document.getElementById("siteFaviconDeleteBtn");
      if (uploadBtn && fileInput) {
        uploadBtn.addEventListener("click", function () { fileInput.click(); });
        fileInput.addEventListener("change", async function () {
          if (!fileInput.files || !fileInput.files.length) return;
          var res = await uploadTenantAsset("favicon_light_url", fileInput.files[0]);
          if (res && res.url) {
            updateSiteFavicon(res.url);
            setPreviewFromValue("favicon_light_url", res.url);
            if (res.tenant) { updateTenantCache(res.tenant); applyBrandFromTenant(res.tenant); }
          }
          fileInput.value = "";
        });
      }
      if (deleteBtn) {
        deleteBtn.addEventListener("click", async function () {
          var payload = { favicon_light_url: null };
          var data = await updateTenantFields(payload);
          updateSiteFavicon("");
          setPreviewFromValue("favicon_light_url", "");
          if (data && data.tenant) { updateTenantCache(data.tenant); applyBrandFromTenant(data.tenant); }
        });
      }
    })();

    document.querySelectorAll("[data-sound-box], [data-sound-upload]").forEach((el) => {
      el.addEventListener("click", () => {
        const key = el.getAttribute("data-sound-box") || el.getAttribute("data-sound-upload");
        if (key) {
          const input = document.querySelector(`[data-sound-input=\"${key}\"]`);
          if (input) input.click();
        }
      });
    });
    document.querySelectorAll("[data-sound-input]").forEach((input) => {
      input.addEventListener("change", async () => {
        if (!input.files || !input.files.length) return;
        const file = input.files[0];
        const key = input.getAttribute("data-sound-input");
        if (!key) return;
        const res = await uploadTenantSound(key, file);
        if (res && res.url) {
          const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);
          if (hiddenInput) hiddenInput.value = res.url;
          setSoundPreview(key, res.url);
          if (res.tenant) {
            updateTenantCache(res.tenant);
            applyBrandFromTenant(res.tenant);
          }
        }
        input.value = "";
      });
    });
    document.querySelectorAll("[data-sound-delete]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const key = btn.getAttribute("data-sound-delete");
        if (!key) return;
        const hiddenInput = document.querySelector(`[data-tenant-input=\"${key}\"]`);
        if (hiddenInput) hiddenInput.value = "";
        setSoundPreview(key, "");
        const payload = { [key]: null };
        const data = await updateTenantFields(payload);
        if (data && data.tenant) {
          updateTenantCache(data.tenant);
          applyBrandFromTenant(data.tenant);
        }
      });
    });
    document.querySelectorAll("[data-sound-play]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
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
        const key = input.getAttribute("data-site-input");
        if (!key) return;
        let value = input.value.trim();
        if (key === "subdomain") {
          value = value.toLowerCase();
          input.value = value;
        }
        const payload = { [key]: value || null };
        const data = await updateTenantFields(payload);
        if (!data || !data.ok) {
          if (key === "subdomain") {
            if (data && data.error === "INVALID_SUBDOMAIN") {
              alert("Субдомен: только латиница, цифры и дефис.");
            } else if (data && data.error === "SUBDOMAIN_TAKEN") {
              alert("Субдомен уже занят.");
            } else {
              alert("Не удалось сохранить субдомен.");
            }
            await loadTenantProfile();
          }
          return;
        }
        if (data.tenant) {
          updateTenantCache(data.tenant);
          applyBrandFromTenant(data.tenant);
          if (key === "subdomain" || key === "custom_domain") {
            updateShopLink(data.tenant);
          }
          if (key === "subdomain") {
            input.value = data.tenant.subdomain || "";
          }
        }
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
    const deliveryPanel = document.getElementById("deliveryPanel");
    const deliverySettingsList = document.getElementById("deliverySettingsList");
    const deliveryEmpty = document.getElementById("deliveryEmpty");
    const settingsDeliveryEmpty = document.getElementById("settingsDeliveryEmpty");
    const settingsDeliveryPanel = document.getElementById("settingsDeliveryPanel");
    const settingsDeliverySubtitle = document.getElementById("settingsDeliverySubtitle");
    const settingsDeliveryName = document.getElementById("settingsDeliveryName");
    const settingsDeliveryCost = document.getElementById("settingsDeliveryCost");
    const settingsDeliveryMinOrder = document.getElementById("settingsDeliveryMinOrder");
    const settingsDeliveryFreeFrom = document.getElementById("settingsDeliveryFreeFrom");
    const settingsDeliveryActive = document.getElementById("settingsDeliveryActive");
    const settingsDeliverySaveBtn = document.getElementById("settingsDeliverySaveBtn");
    const settingsDeliverySaveText = document.getElementById("settingsDeliverySaveText");
    const settingsDeliveryResetBtn = document.getElementById("settingsDeliveryResetBtn");
    const settingsDeliveryDeleteBtn = document.getElementById("settingsDeliveryDeleteBtn");
    const deliveryStoresList = document.getElementById("deliveryStoresList");
    const settingsDeliveryDefaultStore = document.getElementById("settingsDeliveryDefaultStore");

    const deliverySettingsState = {
      loaded: false,
      items: [],
      selectedId: null,
      snapshot: null,
      mode: "view"
    };

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
        row.className = "order-row product-row settings-card";
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
        const costText = setting.delivery_cost > 0 ? `${setting.delivery_cost} ₽` : "Бесплатно";
        const storesCount = Array.isArray(setting.store_ids) ? setting.store_ids.length : 0;
        subtitle.textContent = `${costText} • ${storesCount} филиал(ов)`;

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
      deliveryStoresList.innerHTML = "";

      const stores = storesState.items || [];
      if (!stores.length) {
        deliveryStoresList.innerHTML = '<div class="muted">Нет филиалов</div>';
        updateDeliveryDefaultStoreSelect([], null);
        return;
      }

      stores.forEach((store) => {
        const label = document.createElement("label");
        label.className = "switch delivery-store-switch";

        const input = document.createElement("input");
        input.className = "switch-input";
        input.type = "checkbox";
        input.value = store.id;
        input.checked = storeIds.includes(store.id);

        const ui = document.createElement("span");
        ui.className = "switch-ui";

        const text = document.createElement("span");
        text.className = "switch-text";
        text.textContent = store.name || `Филиал #${store.id}`;

        label.appendChild(input);
        label.appendChild(ui);
        label.appendChild(text);
        deliveryStoresList.appendChild(label);
      });

      updateDeliveryDefaultStoreSelect(storeIds, defaultStoreId);
    }

    function updateDeliveryDefaultStoreSelect(storeIds, defaultStoreId) {
      if (!settingsDeliveryDefaultStore) return;
      const stores = storesState.items || [];
      const selectedStores = stores.filter((s) => storeIds.includes(s.id));
      settingsDeliveryDefaultStore.innerHTML = '<option value="">— не выбран —</option>';
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
    }

    if (deliveryStoresList) {
      deliveryStoresList.addEventListener("change", () => {
        const selected = getSelectedDeliveryStoreIds();
        const currentDefault = settingsDeliveryDefaultStore && settingsDeliveryDefaultStore.value ? Number(settingsDeliveryDefaultStore.value) : null;
        const keepDefault = currentDefault != null && selected.includes(currentDefault) ? currentDefault : null;
        updateDeliveryDefaultStoreSelect(selected, keepDefault);
      });
    }

    function getSelectedDeliveryStoreIds() {
      if (!deliveryStoresList) return [];
      const checkboxes = deliveryStoresList.querySelectorAll("input[type=\"checkbox\"]:checked");
      return Array.from(checkboxes).map((cb) => Number(cb.value)).filter((v) => Number.isFinite(v));
    }

    function getSelectedDefaultDeliveryStoreId() {
      if (!settingsDeliveryDefaultStore || !settingsDeliveryDefaultStore.value) return null;
      const n = Number(settingsDeliveryDefaultStore.value);
      return Number.isFinite(n) && n > 0 ? n : null;
    }

    function fillDeliverySettingForm(setting) {
      if (!setting) return;
      if (settingsDeliverySubtitle) {
        settingsDeliverySubtitle.textContent = `ID ${setting.id}`;
      }
      if (settingsDeliveryName) settingsDeliveryName.value = setting.name || "";
      if (settingsDeliveryCost) settingsDeliveryCost.value = setting.delivery_cost || "";
      if (settingsDeliveryMinOrder) settingsDeliveryMinOrder.value = setting.min_order_amount || "";
      if (settingsDeliveryFreeFrom) settingsDeliveryFreeFrom.value = setting.free_delivery_from || "";
      if (settingsDeliveryActive) settingsDeliveryActive.checked = Number(setting.is_active) === 1;
      const storeIds = setting.store_ids || [];
      const defaultStoreId = setting.default_store_id != null ? Number(setting.default_store_id) : null;
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
        if (settingsDeliverySubtitle) settingsDeliverySubtitle.textContent = "Новая настройка";
        if (settingsDeliveryName) settingsDeliveryName.value = "";
        if (settingsDeliveryCost) settingsDeliveryCost.value = "";
        if (settingsDeliveryMinOrder) settingsDeliveryMinOrder.value = "";
        if (settingsDeliveryFreeFrom) settingsDeliveryFreeFrom.value = "";
        if (settingsDeliveryActive) settingsDeliveryActive.checked = true;
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

    // Update settingsSectionButtons click handler for delivery section
    settingsSectionButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const section = btn.getAttribute("data-settings-section") || "";
        const isDelivery = section === "delivery";
        applySettingsCardsFilterBySection(section);
        syncSettingsToolbarControls(section);

        if (settingsCenterTitle && isDelivery) {
          settingsCenterTitle.textContent = "Доставка";
        }
        if (settingsCenterSubtitle && isDelivery) {
          settingsCenterSubtitle.textContent = "Загрузка...";
        }
        if (settingsTenantCards) settingsTenantCards.classList.toggle("hidden", isDelivery || section === "stores" || section === "site");
        if (settingsCardsPanel) settingsCardsPanel.classList.toggle("hidden", isDelivery || section === "stores" || section === "site");
        if (deliveryPanel) deliveryPanel.classList.toggle("hidden", !isDelivery);
        if (storesPanel) storesPanel.classList.toggle("hidden", section !== "stores");
        if (siteSectionPanel) siteSectionPanel.classList.toggle("hidden", section !== "site");

        if (isDelivery) {
          if (rightDefault) rightDefault.classList.add("hidden");
          if (rightHeader) rightHeader.classList.add("hidden");
          if (rightTabs) rightTabs.classList.add("hidden");
          if (settingsStoreEmpty) settingsStoreEmpty.classList.add("hidden");
          if (settingsStorePanel) settingsStorePanel.classList.add("hidden");
          setActiveRightTab("");

          // Load stores first for checkboxes, then load delivery settings
          if (!storesState.loaded) {
            fetchStores().then((data) => {
              if (data && data.ok) {
                storesState.items = data.stores || [];
                storesState.loaded = true;
              }
              loadDeliverySettings();
            });
          } else {
            loadDeliverySettings();
          }
        } else {
          if (settingsDeliveryPanel) settingsDeliveryPanel.classList.add("hidden");
          if (settingsDeliveryEmpty) settingsDeliveryEmpty.classList.add("hidden");
        }
      });
    });

    // Add new delivery setting button
    if (settingsAddOrderBtn) {
      settingsAddOrderBtn.addEventListener("click", () => {
        const section = document.body.getAttribute("data-settings-section");
        if (section === "delivery") {
          startCreateDeliverySetting();
        }
      });
    }

    if (settingsDeliverySaveBtn) {
      settingsDeliverySaveBtn.addEventListener("click", async () => {
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
        if (deliverySettingsState.mode === "create") {
          setDeliveryMode("create");
          return;
        }
        if (!deliverySettingsState.snapshot) return;
        fillDeliverySettingForm(deliverySettingsState.snapshot);
      });
    }

    if (settingsDeliveryDeleteBtn) {
      settingsDeliveryDeleteBtn.addEventListener("click", async () => {
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

    if (settingsChatWelcomeSaveBtn && settingsChatWelcomeMessageInput) {
      settingsChatWelcomeSaveBtn.addEventListener("click", async () => {
        const raw = String(settingsChatWelcomeMessageInput.value || "").trim();
        const value = raw && raw !== DEFAULT_CHAT_WELCOME_MESSAGE ? raw : null;
        await saveChatSettingsPayload(
          settingsChatWelcomeSaveBtn,
          { chat_welcome_message: value },
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0438\u0435."
        );
      });
    }

    if (settingsChatAssistantNameSaveBtn && settingsChatAssistantNameInput) {
      settingsChatAssistantNameSaveBtn.addEventListener("click", async () => {
        const raw = String(settingsChatAssistantNameInput.value || "").trim();
        const nameValue = raw && raw !== DEFAULT_CHAT_ASSISTANT_NAME ? raw : null;
        const selectedGender = getSelectedChatAssistantGender();
        const genderValue = selectedGender === DEFAULT_CHAT_ASSISTANT_GENDER ? null : selectedGender;
        await saveChatSettingsPayload(
          settingsChatAssistantNameSaveBtn,
          {
            chat_assistant_name: nameValue,
            chat_assistant_gender: genderValue,
          },
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u043c\u044f \u043f\u043e\u043c\u043e\u0449\u043d\u0438\u043a\u0430."
        );
      });
    }

    if (settingsChatOperatorNameSaveBtn && settingsChatOperatorNameInput) {
      settingsChatOperatorNameSaveBtn.addEventListener("click", async () => {
        const raw = String(settingsChatOperatorNameInput.value || "").trim();
        const fallback = getChatOperatorFallbackName();
        const value = raw && (!fallback || raw !== fallback) ? raw : null;
        await saveChatSettingsPayload(
          settingsChatOperatorNameSaveBtn,
          { chat_operator_name: value },
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0438\u043c\u044f \u043e\u043f\u0435\u0440\u0430\u0442\u043e\u0440\u0430."
        );
      });
    }

    if (settingsChatQuickQuestionsResetBtn) {
      settingsChatQuickQuestionsResetBtn.addEventListener("click", () => {
        const raw = settingsChatQuickQuestionsJson ? settingsChatQuickQuestionsJson.value : null;
        applyChatQuickQuestionsToInputs(raw);
      });
    }

    if (settingsChatQuickQuestionsAddBtn) {
      settingsChatQuickQuestionsAddBtn.addEventListener("click", () => {
        const input = appendChatQuickQuestionInput();
        if (!input) return;
        input.focus();
        input.select();
      });
    }

    if (settingsChatQuickQuestionsSaveBtn) {
      settingsChatQuickQuestionsSaveBtn.addEventListener("click", async () => {
        const list = collectChatQuickQuestionsFromInputs();
        const normalizedList = list.length ? list : DEFAULT_CHAT_QUICK_QUESTIONS.slice();
        const serialized = JSON.stringify(normalizedList);
        const payloadValue = serialized === JSON.stringify(DEFAULT_CHAT_QUICK_QUESTIONS) ? null : serialized;

        await saveChatSettingsPayload(
          settingsChatQuickQuestionsSaveBtn,
          { chat_quick_questions_json: payloadValue },
          "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0441\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u0433\u043e\u0440\u044f\u0447\u0438\u0435 \u0432\u043e\u043f\u0440\u043e\u0441\u044b.",
          () => {
            applyChatQuickQuestionsToInputs(payloadValue || null);
          }
        );
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
