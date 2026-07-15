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

  function normalizeManifestTitle(value, fallback = '') {
    const normalized = String(value || '').replace(/\s+/g, ' ').trim();
    if (normalized) return normalized;
    return String(fallback || '').replace(/\s+/g, ' ').trim();
  }

  function getManifestContext() {
    const raw = window.__APP_MANIFEST_CONTEXT__;
    if (!raw || typeof raw !== 'object') {
      return {
        app: 'shop',
        startPath: window.location.pathname || '/shop',
        tenantId: 0,
        versionToken: '',
        installTitle: '',
        installShortName: ''
      };
    }
    const defaultAdminTitle = normalizeManifestTitle(document.title, 'Админка');
    return {
      app: raw.app === 'admin' ? 'admin' : 'shop',
      startPath: typeof raw.startPath === 'string' && raw.startPath ? raw.startPath : (window.location.pathname || '/shop'),
      tenantId: Number(raw.tenantId || 0) || 0,
      versionToken: String(raw.versionToken || ''),
      installTitle: normalizeManifestTitle(
        raw.installTitle,
        raw.app === 'admin' ? defaultAdminTitle : ''
      ),
      installShortName: normalizeManifestTitle(
        raw.installShortName,
        raw.installTitle || (raw.app === 'admin' ? defaultAdminTitle : '')
      )
    };
  }

  function buildManifestHref(options) {
    const ctx = getManifestContext();
    const url = new URL('/manifest.json', window.location.origin);
    const source = options && typeof options === 'object' ? options : {};
    const app = source.app === 'admin' ? 'admin' : ctx.app;
    const startPath = typeof source.startPath === 'string' && source.startPath
      ? source.startPath
      : ctx.startPath;
    const tenantId = Number(source.tenantId || ctx.tenantId || 0) || 0;
    const versionToken = String(
      Object.prototype.hasOwnProperty.call(source, 'versionToken')
        ? (source.versionToken || '')
        : (ctx.versionToken || '')
    ).trim();
    const installTitle = normalizeManifestTitle(
      Object.prototype.hasOwnProperty.call(source, 'installTitle')
        ? source.installTitle
        : ctx.installTitle
    );

    url.searchParams.set('app', app);
    url.searchParams.set('start', startPath);
    if (tenantId > 0) {
      url.searchParams.set('tenant_id', String(tenantId));
    }
    if (versionToken) {
      url.searchParams.set('v', versionToken);
    }
    if (app === 'admin' && installTitle) {
      url.searchParams.set('title', installTitle);
    }
    return url.pathname + url.search;
  }

  function updateManifestBranding(tenant) {
    const manifest = document.getElementById('appManifest');
    const appleTitle = document.getElementById('appAppleMobileWebAppTitle');
    const ctx = getManifestContext();
    const brandName = tenant && (tenant.name || tenant.site_name)
      ? String(tenant.name || tenant.site_name).trim()
      : '';
    const tenantId = Number(tenant && tenant.id ? tenant.id : ctx.tenantId || 0) || 0;
    const versionToken = tenant && tenant.updated_at
      ? String(tenant.updated_at)
      : ctx.versionToken;
    const installTitle = ctx.app === 'admin'
      ? normalizeManifestTitle(ctx.installTitle, document.title || 'Админка')
      : '';
    const installShortName = ctx.app === 'admin'
      ? normalizeManifestTitle(ctx.installShortName, installTitle || 'Админка')
      : '';

    window.__APP_MANIFEST_CONTEXT__ = {
      app: ctx.app,
      startPath: ctx.startPath,
      tenantId,
      versionToken,
      installTitle,
      installShortName
    };

    if (manifest) {
      manifest.href = buildManifestHref({
        app: ctx.app,
        startPath: ctx.startPath,
        tenantId,
        versionToken,
        installTitle
      });
    }

    if (appleTitle) {
      if (ctx.app === 'admin') {
        appleTitle.content = brandName ? `${brandName} Админка` : 'Админка';
      } else if (brandName) {
        appleTitle.content = brandName;
      }
      if (ctx.app === 'admin') {
        appleTitle.content = installShortName || installTitle || 'Админка';
      }
    }
  }

  window.updateAppManifestBranding = updateManifestBranding;

  function applyBrand(theme) {
    const tenant = getTenantFromStorage();
    const logoImg = document.getElementById('headerLogoImg');
    const logoFallback = document.getElementById('headerLogoFallback');
    const navLogoImg = document.getElementById('shopNavLogoImg');
    const navLogoFallback = document.getElementById('shopNavLogoFallback');
    const brandNameEl = document.getElementById('headerBrandName');
    const favicon = document.getElementById('appFavicon');
    const appleIcon = document.getElementById('appAppleTouchIcon');

    if (tenant) {
      const brandName = tenant.name || tenant.site_name || '';
      if (brandNameEl && brandName) {
        brandNameEl.textContent = brandName;
      }
      if (logoFallback && brandName) {
        logoFallback.textContent = String(brandName).trim().slice(0, 1).toUpperCase();
      }
      if (navLogoFallback && brandName) {
        navLogoFallback.textContent = String(brandName).trim().slice(0, 1).toUpperCase();
      }

      const logo =
        theme === 'dark'
          ? (tenant.logo_dark_url || tenant.logo_light_url)
          : (tenant.logo_light_url || tenant.logo_dark_url);

      if (logoImg && logo) {
        const currentLogoSrc = String(logoImg.getAttribute('src') || '');
        if (currentLogoSrc !== String(logo)) {
          logoImg.src = logo;
        }
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
        if (navLogoImg && navLogoImg.getAttribute('src') !== String(logo)) {
          navLogoImg.src = logo;
        }
        navLogoImg?.classList.remove('hidden');
        navLogoFallback?.classList.add('hidden');
      }

    updateManifestBranding(tenant);
  }

  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
      }
    }
    const themeColorMeta = document.getElementById('themeColorMeta');
    if (themeColorMeta) {
      themeColorMeta.content = theme === 'dark' ? '#1a1a1a' : '#ffffff';
    }
    applyBrand(theme);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  const initial = saved || 'light';
  applyTheme(initial);

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
