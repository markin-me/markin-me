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

  function applyBrandFromTenant(tenant) {
    if (!tenant) return;
    const theme = document.documentElement.getAttribute("data-theme") || "light";
    const logoImg = document.getElementById("headerLogoImg");
    const logoFallback = document.getElementById("headerLogoFallback");
    const brandNameEl = document.getElementById("headerBrandName");
    const favicon = document.getElementById("appFavicon");

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
  }

  function updateShopLink(tenant) {
    const linkEl = document.getElementById("siteSubdomainLink");
    if (!linkEl) return;
    const subdomain = tenant && tenant.subdomain ? String(tenant.subdomain).trim() : "";
    const customDomain = tenant && tenant.custom_domain ? String(tenant.custom_domain).trim() : "";
    const protocol = window.location.protocol || "http:";
    const hostname = String(window.location.hostname || "");
    const isLocal = hostname.endsWith("localhost");
    const port = window.location.port ? `:${window.location.port}` : "";

    let host = "";
    if (customDomain) {
      host = customDomain;
    } else if (subdomain) {
      host = `${subdomain}.${hostname}`;
    }

    if (!host) {
      linkEl.textContent = "—";
      linkEl.setAttribute("href", "#");
      return;
    }

    const url = `${protocol}//${host}${isLocal ? port : ""}`;
    linkEl.textContent = url;
    linkEl.setAttribute("href", url);
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

  async function loadTenantProfile() {
    try {
      const res = await authFetch("/api/admin/tenant");
      const data = await res.json();
      if (!data || !data.ok || !data.tenant) return;

      const tenant = data.tenant;
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
      });

      fillTimezoneSelect(tenant.timezone, "tenantTimezoneSelect");
      fillTimezoneSelect(tenant.timezone, "brandTimezoneSelect");
    } catch (err) {
      console.error("Не удалось загрузить профиль tenant:", err);
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    loadTenantProfile();

    const logoCard = document.getElementById("settingsLogoCard");
    const siteCard = document.getElementById("settingsSiteCard");
    const brandCard = document.getElementById("settingsBrandCard");
    const rightDefault = document.getElementById("settingsRightDefault");
    const logoPanel = document.getElementById("settingsLogoPanel");
    const sitePanel = document.getElementById("settingsSitePanel");
    const brandPanel = document.getElementById("settingsBrandPanel");
    const rightTabs = document.getElementById("settingsRightTabs");
    const rightHeader = rightTabs ? rightTabs.closest(".settings-right-header") : null;

    function setActiveRightTab(tabId) {
      if (rightTabs) {
        rightTabs.querySelectorAll(".product-tab").forEach((tab) => {
          tab.classList.toggle("is-active", tab.getAttribute("data-right-tab") === tabId);
        });
      }

      if (rightDefault) rightDefault.classList.toggle("hidden", tabId !== "");
      if (logoPanel) logoPanel.classList.toggle("hidden", tabId !== "logo");
      if (sitePanel) sitePanel.classList.toggle("hidden", tabId !== "site");
      if (brandPanel) brandPanel.classList.toggle("hidden", tabId !== "brand");
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
          if (tabId === "brand" && brandCard) brandCard.classList.remove("is-active");
        });

        rightTabs.appendChild(tab);
      }

      if (rightHeader) rightHeader.classList.remove("hidden");
      rightTabs.classList.remove("hidden");
      setActiveRightTab(tabId);
      if (tabId === "logo" && logoCard) logoCard.classList.add("is-active");
      if (tabId === "site" && siteCard) siteCard.classList.add("is-active");
      if (tabId === "brand" && brandCard) brandCard.classList.add("is-active");
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

    if (brandCard) {
      brandCard.addEventListener("click", () => {
        ensureTab("brand", "Данные бренда");
      });
    }

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
  });
})();
