(function () {
  const STORAGE_KEY = 'theme';
  const root = document.documentElement;

  function getTenantFromStorage() {
    try {
      const t = localStorage.getItem('tenant');
      return t ? JSON.parse(t) : null;
    } catch {
      return null;
    }
  }

  function applyBrand(theme) {
    const tenant = getTenantFromStorage();
    const logoImg = document.getElementById('headerLogoImg');
    const logoFallback = document.getElementById('headerLogoFallback');
    const brandNameEl = document.getElementById('headerBrandName');
    const favicon = document.getElementById('appFavicon');
    const appleIcon = document.getElementById('appAppleTouchIcon');
    const manifest = document.getElementById('appManifest');

    if (tenant) {
      const brandName = tenant.name || tenant.site_name || '';
      if (brandNameEl && brandName) {
        brandNameEl.textContent = brandName;
      }
      if (logoFallback && brandName) {
        logoFallback.textContent = String(brandName).trim().slice(0, 1).toUpperCase();
      }

      const logo =
        theme === 'dark'
          ? (tenant.logo_dark_url || tenant.logo_light_url)
          : (tenant.logo_light_url || tenant.logo_dark_url);

      if (logoImg && logo) {
        logoImg.src = logo;
        logoImg.classList.remove('hidden');
        if (logoFallback) logoFallback.classList.add('hidden');
      } else if (logoImg) {
        logoImg.classList.add('hidden');
        if (logoFallback) logoFallback.classList.remove('hidden');
      }

      const fav =
        theme === 'dark'
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
        const ver = tenant.updated_at ? encodeURIComponent(String(tenant.updated_at)) : '';
        manifest.href = `/manifest.json${ver ? `?v=${ver}` : ''}`;
      }
    }
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) {
        // moon for light, sun for dark (so it shows what you'll switch to)
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
    applyBrand(theme);
  }

  // init theme (prefer saved, else system)
  const saved = localStorage.getItem(STORAGE_KEY);
  const systemPrefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (systemPrefersDark ? 'dark' : 'light');
  applyTheme(initial);

  // handle toggle button (if present)
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.addEventListener('click', function () {
      const current = root.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(STORAGE_KEY, next);
      applyTheme(next);
    });
  }
})();
