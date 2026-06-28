const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const os = require('os');
const { execFile } = require('child_process');
const { domainToASCII, domainToUnicode } = require('url');
const chatTempRuntime = require('../chatTemp');
const { getEffectiveTelegramBotConfig } = require('../../data/system-settings');
const { geocodeStoreAddress } = require('../../data/map-geocoder');
const {
  ensureTenantMapConfigColumns,
  getTenantMapConfigRow,
  normalizeTenantMapConfig,
  saveTenantMapConfig,
} = require('../../data/tenant-map-config');
const {
  normalizeLocalAddressText,
  searchLocalAddressSuggest,
  resolveLocalityByInput,
  getLocalAddressIndexRowBySourceKey,
} = require('../../data/local-address-index');
const {
  normalizeHouseToken: normalizeAddressServiceHouseToken,
  isHouseToken: isAddressServiceHouseToken,
  extractHouseToken: extractAddressServiceHouseToken,
  removeHouseToken: removeAddressServiceHouseToken,
} = require('../../services/address-service/src/normalization');
const {
  isAddressServiceConfigured,
  resolveAddress: resolveAddressThroughService,
} = require('../../data/address-service-client');
const {
  buildLegacyDeliveryPriceTiers,
  deriveLegacyDeliveryFieldsFromTiers,
  normalizeDeliveryEtaMinutes: normalizeDeliveryEtaMinutesShared,
  normalizeDeliveryMoney: normalizeDeliveryMoneyShared,
  normalizeDeliveryPriceTiersForOutput,
  sanitizeDeliveryPriceTiers,
} = require('../../data/delivery-price-tiers');

module.exports = function makeAdminTenantRouter({ db, helpers, ordersEvents }) {
  const router = express.Router();
  const devPwaTunnelStatePath = path.resolve(__dirname, '../../tmp/dev-pwa-tunnel.json');
  const DEV_PWA_TUNNEL_VALIDATE_CACHE_MS = 30_000;
  let devPwaTunnelValidationCache = {
    key: '',
    expiresAt: 0,
    value: null
  };
  const subdomainRe = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
  const tenantChatColumns = [
    {
      name: 'chat_welcome_message',
      sql: "text DEFAULT NULL COMMENT 'Welcome text shown in customer chat'"
    },
    {
      name: 'chat_welcome_enabled',
      sql: "tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Enable welcome message in customer chat'"
    },
    {
      name: 'chat_assistant_name',
      sql: "varchar(160) DEFAULT NULL COMMENT 'Virtual assistant display name'"
    },
    {
      name: 'chat_operator_name',
      sql: "varchar(160) DEFAULT NULL COMMENT 'Operator display name'"
    },
    {
      name: 'chat_quick_questions_json',
      sql: "text DEFAULT NULL COMMENT 'JSON array of chat quick questions'"
    },
    {
      name: 'chat_quick_questions_enabled',
      sql: "tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Enable quick questions grid in customer chat'"
    },
    {
      name: 'chat_assistant_gender',
      sql: "char(1) DEFAULT NULL COMMENT 'Virtual assistant gender: m/f'"
    },
    {
      name: 'chat_widget_enabled',
      sql: "tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Show customer chat button in storefront'"
    },
    {
      name: 'chat_guest_thread_ttl_days',
      sql: "smallint unsigned DEFAULT NULL COMMENT 'Guest chat TTL in days'"
    },
    {
      name: 'chat_thread_ttl_days',
      sql: "smallint unsigned DEFAULT NULL COMMENT 'All chats TTL in days (0/null = keep forever)'"
    }
  ];
  const tenantMapProviderColumns = [
    {
      name: 'map_provider_accounts_json',
      sql: "text DEFAULT NULL COMMENT 'JSON list of tenant map provider accounts'"
    }
  ];
  const tenantPwaColumns = [
    {
      name: 'pwa_qr_badge_text',
      sql: "varchar(120) DEFAULT NULL COMMENT 'Custom PWA QR card badge text'"
    },
    {
      name: 'site_menu_items_json',
      sql: "text DEFAULT NULL COMMENT 'Tenant storefront menu items JSON'"
    }
  ];
  const MAP_PROVIDER_KEEP_VALUE = '__saved__';
  const MAP_PROVIDER_API_KEY_PLACEHOLDER_TEST_RE = /(\{\{\s*api[_-]?key\s*\}\}|\{\s*api[_-]?key\s*\}|%API[_-]?KEY%|\$API[_-]?KEY\$)/i;
  const MAP_PROVIDER_API_KEY_PLACEHOLDER_REPLACE_RE = /(\{\{\s*api[_-]?key\s*\}\}|\{\s*api[_-]?key\s*\}|%API[_-]?KEY%|\$API[_-]?KEY\$)/gi;
  const MAP_PROVIDER_API_KEY_QUERY_PARAM_TEST_RE = /([?&](?:apikey|api_key|access_token)=)([^&#]*)/i;
  const MAP_PROVIDER_API_KEY_QUERY_PARAM_REPLACE_RE = /([?&](?:apikey|api_key|access_token)=)([^&#]*)/gi;
  const DELIVERY_ZONE_DEFAULT_COLOR = '#ff7a00';
  const DELIVERY_ZONE_MAX_NAME_LENGTH = 255;
  const DELIVERY_ZONE_MAX_PRICE_TIERS = 20;
  const deliveryZoneTables = Object.freeze({
    zones: 'ten_delivery_zones',
    stores: 'ten_delivery_zone_stores',
    tiers: 'ten_delivery_zone_price_tiers',
  });
  const deliverySettingPriceTiersTable = 'ten_delivery_setting_price_tiers';
  let tenantChatColumnsReady = false;
  let ensureTenantChatColumnsPromise = null;
  let tenantMapProviderColumnsReady = false;
  let ensureTenantMapProviderColumnsPromise = null;
  let tenantPwaColumnsReady = false;
  let ensureTenantPwaColumnsPromise = null;
  let deliveryZoneTablesReady = false;
  let ensureDeliveryZoneTablesPromise = null;
  let orderDeliveryTypeColumnsReady = false;
  let ensureOrderDeliveryTypeColumnsPromise = null;
  let tenantDomainsTableReady = false;
  let ensureTenantDomainsTablePromise = null;
  const tenantDomainColumns = [
    { name: 'is_enabled', sql: 'TINYINT(1) NOT NULL DEFAULT 1 AFTER domain_ascii' }
  ];

  async function publishTenantChatWidgetChanged(tenantId, enabled) {
    try {
      if (!ordersEvents || typeof ordersEvents.publish !== 'function') return;
      const [storeRows] = await db.query(
        `SELECT id
         FROM ten_stores
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );
      const seen = new Set();
      const storeIds = Array.isArray(storeRows)
        ? storeRows
          .map((row) => Number(row && row.id))
          .filter((storeId) => Number.isFinite(storeId) && storeId > 0)
        : [];
      if (!storeIds.length) storeIds.push(1);
      for (const storeId of storeIds) {
        if (seen.has(storeId)) continue;
        seen.add(storeId);
        ordersEvents.publish(tenantId, storeId, 'tenant.chat_widget.changed', {
          tenant_id: Number(tenantId),
          store_id: Number(storeId),
          chat_widget_enabled: enabled ? 1 : 0,
        });
      }
    } catch (err) {
      console.error('РћС€РёР±РєР° РїСѓР±Р»РёРєР°С†РёРё storefront chat_widget change:', err);
    }
  }
  let storeAddressIdentityColumnsReady = false;
  let ensureStoreAddressIdentityColumnsPromise = null;

  function normalizeSubdomain(value) {
    if (value === undefined || value === null) return null;
    const s = String(value).trim().toLowerCase();
    return s === '' ? null : s;
  }

  function normalizeCustomDomain(value) {
    if (value === undefined) return { provided: false };
    if (value === null) return { provided: true, unicode: null, ascii: null };

    let host = String(value).trim().toLowerCase();
    if (!host) return { provided: true, unicode: null, ascii: null };

    host = host.replace(/^https?:\/\//i, '');
    host = host.split('/')[0].split('?')[0].split('#')[0].trim();
    host = host.replace(/\.+$/, '');
    host = host.replace(/^\.+/, '');
    if (!host) return { provided: true, unicode: null, ascii: null };

    if (host.includes(':')) {
      const idx = host.lastIndexOf(':');
      const maybePort = host.slice(idx + 1);
      if (/^\d+$/.test(maybePort)) {
        host = host.slice(0, idx).trim();
      }
    }

    const ascii = String(domainToASCII(host) || '').trim().toLowerCase();
    if (!ascii) {
      return { provided: true, invalid: true };
    }

    return { provided: true, unicode: host, ascii };
  }

  function firstHeaderValue(raw, fallback = '') {
    if (!raw) return fallback;
    if (Array.isArray(raw)) return String(raw[0]).trim();
    return String(raw).split(',')[0].trim();
  }

  function parseEnvList(value) {
    return String(value || '')
      .split(',')
      .map((item) => String(item || '').trim())
      .filter(Boolean);
  }

  function normalizePublicHost(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
      const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return String(parsed.host || '').trim().toLowerCase();
    } catch (_) {
      return raw
        .replace(/^https?:\/\//i, '')
        .split('/')[0]
        .trim()
        .toLowerCase();
    }
  }

  function parseHostParts(value) {
    const normalized = normalizePublicHost(value);
    if (!normalized) {
      return {
        host: '',
        hostname: '',
        port: ''
      };
    }
    try {
      const parsed = new URL(`http://${normalized}`);
      return {
        host: String(parsed.host || normalized).trim().toLowerCase(),
        hostname: String(parsed.hostname || '').trim().toLowerCase(),
        port: String(parsed.port || '').trim()
      };
    } catch (_) {
      const ipv6Match = normalized.match(/^\[([^\]]+)\](?::(\d+))?$/);
      if (ipv6Match) {
        return {
          host: normalized,
          hostname: String(ipv6Match[1] || '').trim().toLowerCase(),
          port: String(ipv6Match[2] || '').trim()
        };
      }

      const lastColonIndex = normalized.lastIndexOf(':');
      if (lastColonIndex > -1 && normalized.indexOf(':') === lastColonIndex) {
        return {
          host: normalized,
          hostname: normalized.slice(0, lastColonIndex).trim().toLowerCase(),
          port: normalized.slice(lastColonIndex + 1).trim()
        };
      }

      return {
        host: normalized,
        hostname: normalized,
        port: ''
      };
    }
  }

  function isPrivateIpv4Host(hostname) {
    if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(hostname || ''))) return false;
    const parts = String(hostname || '')
      .split('.')
      .map((item) => Number(item));
    if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item) || item < 0 || item > 255)) {
      return false;
    }
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    return false;
  }

  function isLocalDevHostname(hostname) {
    const normalized = String(hostname || '').trim().toLowerCase();
    if (!normalized) return false;
    if (
      normalized === 'localhost'
      || normalized.endsWith('.localhost')
      || normalized === '::1'
      || normalized === '0.0.0.0'
    ) return true;
    return isPrivateIpv4Host(normalized);
  }

  function isLikelyVirtualInterface(name) {
    const normalized = String(name || '').trim().toLowerCase();
    if (!normalized) return false;
    return [
      'outline',
      'tap',
      'tun',
      'vpn',
      'wireguard',
      'tailscale',
      'zerotier',
      'hamachi',
      'vbox',
      'virtualbox',
      'vmware',
      'hyper-v',
      'vethernet',
      'docker',
      'podman',
      'wsl'
    ].some((token) => normalized.includes(token));
  }

  function scoreLocalIpv4Interface(name, host) {
    const normalizedName = String(name || '').trim().toLowerCase();
    const normalizedHost = String(host || '').trim().toLowerCase();
    let score = 0;

    if (normalizedHost.startsWith('192.168.')) score += 300;
    else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(normalizedHost)) score += 200;
    else if (normalizedHost.startsWith('10.')) score += 100;

    if (
      normalizedName.includes('wi-fi')
      || normalizedName.includes('wifi')
      || normalizedName.includes('wlan')
      || normalizedName.includes('wireless')
      || normalizedName.includes('Р±РµСЃРїСЂРѕРІРѕРґ')
    ) {
      score += 1000;
    }

    if (
      normalizedName.includes('ethernet')
      || normalizedName.includes('lan')
      || normalizedName.includes('Р»РѕРєР°Р»СЊРЅ')
    ) {
      score += 800;
    }

    if (isLikelyVirtualInterface(normalizedName)) {
      score -= 5000;
    }

    return score;
  }

  function getLocalIpv4Hosts() {
    const seenHosts = new Set();
    const physical = [];
    const virtual = [];
    const interfaces = os.networkInterfaces();

    Object.entries(interfaces || {}).forEach(([name, items]) => {
      (Array.isArray(items) ? items : []).forEach((item) => {
        if (!item || item.internal) return;
        if (String(item.family || '').toUpperCase() !== 'IPV4') return;

        const host = normalizePublicHost(item.address);
        if (!host || host === '0.0.0.0' || seenHosts.has(host)) return;

        seenHosts.add(host);

        const entry = {
          host,
          interface_name: String(name || '').trim(),
          score: scoreLocalIpv4Interface(name, host)
        };

        if (isLikelyVirtualInterface(name)) {
          virtual.push(entry);
        } else {
          physical.push(entry);
        }
      });
    });

    const preferred = physical.length ? physical : virtual;
    preferred.sort((a, b) => b.score - a.score || a.host.localeCompare(b.host));
    return preferred;
  }

  function resolveTenantSubdomainBaseHost(req) {
    const candidates = [
      process.env.TENANT_SUBDOMAIN_BASE_DOMAIN,
      process.env.TENANT_BASE_DOMAIN,
      process.env.APP_BASE_DOMAIN,
      process.env.PUBLIC_BASE_DOMAIN,
      process.env.SITE_BASE_DOMAIN
    ];
    for (const candidate of candidates) {
      const host = normalizePublicHost(candidate);
      if (host) return host;
    }
    if (req) {
      const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host'], req.get('host') || '');
      const fallbackHost = normalizePublicHost(forwardedHost);
      if (fallbackHost) return fallbackHost;
    }
    return 'posham-admin.ru';
  }

  function resolveTenantSubdomainProtocol(req, baseHost) {
    const explicit = String(process.env.TENANT_SUBDOMAIN_PROTOCOL || '').trim().toLowerCase();
    if (explicit === 'http' || explicit === 'https') return explicit;
    if (String(process.env.TENANT_SUBDOMAIN_HTTPS_ENABLED || '').trim() === '1') return 'https';
    const host = String(baseHost || '').trim().toLowerCase();
    const forwardedProto = firstHeaderValue(req && req.headers ? req.headers['x-forwarded-proto'] : '', '');
    const currentProtocol = String(forwardedProto || (req && req.protocol) || '').trim().toLowerCase().replace(/:$/, '');
    if (!host) return currentProtocol === 'https' ? 'https' : 'http';
    if (host.includes('localhost') || /^\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?$/.test(host)) {
      return currentProtocol === 'https' ? 'https' : 'http';
    }
    if (currentProtocol === 'http' || currentProtocol === 'https') return currentProtocol;
    return 'https';
  }

  function buildTenantSubdomainUrl(tenant, req) {
    const subdomain = helpers.strOrNull(tenant && tenant.subdomain);
    if (!subdomain) return null;
    const baseHost = resolveTenantSubdomainBaseHost(req);
    if (!baseHost) return null;
    const protocol = resolveTenantSubdomainProtocol(req, baseHost);
    return `${protocol}://${subdomain}.${baseHost}`;
  }

  function buildTenantPwaInstallUrlForHost(host, req, options = {}) {
    const normalizedHost = normalizePublicHost(host);
    if (!normalizedHost) return null;
    const explicitProtocol = String(options.protocol || '').trim().toLowerCase().replace(/:$/, '');
    const protocol = explicitProtocol === 'http' || explicitProtocol === 'https'
      ? explicitProtocol
      : resolveTenantSubdomainProtocol(req, normalizedHost);
    try {
      const targetUrl = new URL(`${protocol}://${normalizedHost}/shop/install-app`);
      targetUrl.searchParams.set('source', String(options.source || 'qr').trim() || 'qr');
      const tenantId = Number(options.tenantId || 0) || 0;
      if (tenantId > 0) {
        targetUrl.searchParams.set('tenant_id', String(tenantId));
      }
      if (options.dev) {
        targetUrl.searchParams.set('dev', '1');
      }
      return targetUrl.toString();
    } catch (_) {
      return null;
    }
  }

  function normalizeAbsoluteBaseUrl(rawValue, options = {}) {
    const input = String(rawValue || '').trim();
    if (!input) return null;
    try {
      const parsed = new URL(input);
      const protocol = String(parsed.protocol || '').trim().toLowerCase();
      if (protocol !== 'http:' && protocol !== 'https:') return null;
      if (options.httpsOnly && protocol !== 'https:') return null;
      const host = normalizePublicHost(parsed.host);
      if (!host) return null;
      return `${protocol}//${host}`;
    } catch (_) {
      return null;
    }
  }

  function buildTenantPwaInstallUrlForBaseUrl(baseUrl, options = {}) {
    const normalizedBaseUrl = normalizeAbsoluteBaseUrl(baseUrl);
    if (!normalizedBaseUrl) return null;
    try {
      const targetUrl = new URL('/shop/install-app', `${normalizedBaseUrl}/`);
      targetUrl.searchParams.set('source', String(options.source || 'qr').trim() || 'qr');
      const tenantId = Number(options.tenantId || 0) || 0;
      if (tenantId > 0) {
        targetUrl.searchParams.set('tenant_id', String(tenantId));
      }
      if (options.dev) {
        targetUrl.searchParams.set('dev', '1');
      }
      return targetUrl.toString();
    } catch (_) {
      return null;
    }
  }

  function readDevPwaTunnelState() {
    const envBaseUrl = normalizeAbsoluteBaseUrl(process.env.DEV_PWA_PUBLIC_BASE_URL, { httpsOnly: true });
    if (envBaseUrl) {
      try {
        const parsed = new URL(`${envBaseUrl}/`);
        return {
          base_url: envBaseUrl,
          host: parsed.host,
          label: `HTTPS tunnel: ${parsed.host}`
        };
      } catch (_) {
        return null;
      }
    }

    try {
      const payload = JSON.parse(fs.readFileSync(devPwaTunnelStatePath, 'utf8'));
      const baseUrl = normalizeAbsoluteBaseUrl(payload && (payload.public_url || payload.url || payload.base_url), {
        httpsOnly: true
      });
      if (!baseUrl) return null;
      const parsed = new URL(`${baseUrl}/`);
      return {
        base_url: baseUrl,
        host: parsed.host,
        label: `HTTPS tunnel: ${parsed.host}`
      };
    } catch (_) {
      return null;
    }
  }

  async function getReachableDevPwaTunnelState() {
    const state = readDevPwaTunnelState();
    if (!state || !state.base_url) return null;

    const cacheKey = String(state.base_url || '').trim();
    if (
      cacheKey
      && devPwaTunnelValidationCache.key === cacheKey
      && devPwaTunnelValidationCache.expiresAt > Date.now()
    ) {
      return devPwaTunnelValidationCache.value;
    }

    let nextValue = null;
    try {
      const parsed = new URL(`${cacheKey}/`);
      await dns.lookup(parsed.hostname);
      nextValue = state;
    } catch (_) {
      nextValue = null;
    }

    devPwaTunnelValidationCache = {
      key: cacheKey,
      expiresAt: Date.now() + DEV_PWA_TUNNEL_VALIDATE_CACHE_MS,
      value: nextValue
    };

    return nextValue;
  }

  function buildTenantPwaInstallTargets(tenant, req, domains = []) {
    const targets = [];
    const seenHosts = new Set();

    function pushTarget(rawTarget) {
      if (!rawTarget || typeof rawTarget !== 'object') return;
      const id = String(rawTarget.id || '').trim();
      const host = normalizePublicHost(rawTarget.host);
      const label = String(rawTarget.label || rawTarget.host || '').trim();
      const url = String(rawTarget.url || '').trim();
      if (!id || !host || !label || !url || seenHosts.has(host)) return;
      seenHosts.add(host);
      targets.push({
        id,
        kind: String(rawTarget.kind || '').trim() || 'domain',
        label,
        host,
        url,
        domain_id: Number(rawTarget.domain_id || 0) || null
      });
    }

    const enabledDomains = Array.isArray(domains)
      ? domains.filter((item) => item && item.is_enabled !== false && helpers.strOrNull(item.domain_ascii))
      : [];

    for (const item of enabledDomains) {
      const host = helpers.strOrNull(item.domain_ascii);
      const url = buildTenantPwaInstallUrlForHost(host, req);
      if (!url) continue;
      pushTarget({
        id: `domain:${Number(item.id || 0) || host}`,
        kind: 'domain',
        label: helpers.strOrNull(item.domain) || host,
        host,
        url,
        domain_id: Number(item.id || 0) || null
      });
    }

    const subdomainUrl = buildTenantSubdomainUrl(tenant, req);
    if (subdomainUrl) {
      try {
        const parsed = new URL(subdomainUrl);
        if (isLocalDevHostname(parsed.hostname)) {
          return targets;
        }
        const installUrl = new URL(parsed.origin + '/shop/install-app');
        installUrl.searchParams.set('source', 'qr');
        pushTarget({
          id: 'subdomain',
          kind: 'subdomain',
          label: helpers.strOrNull(tenant && tenant.subdomain)
            ? `${String(tenant.subdomain).trim()}.${parsed.host.replace(/:\d+$/, '')}`
            : parsed.host,
          host: parsed.host,
          url: installUrl.toString()
        });
      } catch (_) {}
    }

    return targets;
  }

  function buildTenantPwaDevInstallTargets(tenant, req, options = {}) {
    const tenantId = Number(tenant && tenant.id || 0) || 0;
    if (!(tenantId > 0) || !req) return [];

    const forwardedProto = firstHeaderValue(req.headers['x-forwarded-proto'], req.protocol || 'http');
    const forwardedHost = firstHeaderValue(req.headers['x-forwarded-host'], req.get('host') || 'localhost:3000');
    const currentHost = parseHostParts(forwardedHost);
    const protocol = String(forwardedProto || '').trim().toLowerCase().replace(/:$/, '') === 'https'
      ? 'https'
      : 'http';

    const isLocalDevHost = isLocalDevHostname(currentHost.hostname);

    const targets = [];
    const seenHosts = new Set();
    const tunnelState = options && Object.prototype.hasOwnProperty.call(options, 'tunnelState')
      ? options.tunnelState
      : readDevPwaTunnelState();

    function pushTarget(rawTarget) {
      if (!rawTarget || typeof rawTarget !== 'object') return;
      const id = String(rawTarget.id || '').trim();
      const host = normalizePublicHost(rawTarget.host);
      const label = String(rawTarget.label || rawTarget.host || '').trim();
      const kind = String(rawTarget.kind || '').trim() || 'dev-lan';
      const explicitUrl = String(rawTarget.url || '').trim();
      if (!id || !host || !label || seenHosts.has(host)) return;
      const url = explicitUrl || buildTenantPwaInstallUrlForHost(host, req, {
        protocol,
        tenantId,
        dev: true
      });
      if (!url) return;
      seenHosts.add(host);
      targets.push({
        id,
        kind,
        label,
        host,
        url,
        domain_id: null
      });
    }

    const portSuffix = currentHost.port ? `:${currentHost.port}` : '';
    const isLoopbackHost = currentHost.hostname === 'localhost' || currentHost.hostname === '127.0.0.1' || currentHost.hostname === '::1';

    if (tunnelState && tunnelState.base_url && tunnelState.host) {
      pushTarget({
        id: `dev-tunnel:${tunnelState.host}`,
        kind: 'dev-tunnel',
        label: tunnelState.label,
        host: tunnelState.host,
        url: buildTenantPwaInstallUrlForBaseUrl(tunnelState.base_url, {
          tenantId,
          dev: true
        })
      });
    }

    if (!isLocalDevHost) {
      return targets;
    }

    if (currentHost.host && !isLoopbackHost && currentHost.hostname !== '0.0.0.0') {
      pushTarget({
        id: `dev-current:${currentHost.host}`,
        kind: 'dev-current',
        label: `РўРµРєСѓС‰РёР№ Р°РґСЂРµСЃ: ${currentHost.host}`,
        host: currentHost.host
      });
    }

    getLocalIpv4Hosts().forEach((item) => {
      const host = normalizePublicHost(item && item.host);
      if (!host) return;
      const fullHost = `${host}${portSuffix}`;
      const interfaceName = String(item && item.interface_name || '').trim();
      pushTarget({
        id: `dev-lan:${fullHost}`,
        kind: 'dev-lan',
        label: interfaceName ? `${interfaceName}: ${fullHost}` : `LAN: ${fullHost}`,
        host: fullHost
      });
    });

    if (!targets.length && currentHost.host && isLoopbackHost) {
      pushTarget({
        id: `dev-local:${currentHost.host}`,
        kind: 'dev-localhost',
        label: `Р­С‚РѕС‚ РєРѕРјРїСЊСЋС‚РµСЂ: ${currentHost.host}`,
        host: currentHost.host
      });
    }

    return targets;
  }

  function parseCommandArgs(value) {
    const raw = String(value || '').trim();
    if (!raw) return [];
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || '').trim()).filter(Boolean);
        }
      } catch (_) {}
    }
    return raw.split(/\s+/).map((item) => String(item || '').trim()).filter(Boolean);
  }

  function getTenantDomainSetup(req = null) {
    const aRecords = parseEnvList(
      process.env.TENANT_DOMAIN_A_RECORDS
      || process.env.TENANT_DOMAIN_A_RECORD
      || '141.8.198.215'
    );
    const subdomainBaseHost = resolveTenantSubdomainBaseHost(req);
    const subdomainProtocol = resolveTenantSubdomainProtocol(req, subdomainBaseHost);
    return {
      a_records: aRecords,
      auto_connect_enabled: process.env.TENANT_DOMAIN_AUTOCONNECT_ENABLED === '1',
      auto_connect_include_www: process.env.TENANT_DOMAIN_AUTOCONNECT_INCLUDE_WWW !== '0',
      check_path: '/.well-known/tenant-domain-check',
      subdomain_base_host: subdomainBaseHost,
      subdomain_protocol: subdomainProtocol,
      subdomain_https_enabled: subdomainProtocol === 'https'
    };
  }

  function isMissingTenantDomainsTableError(err) {
    return Boolean(
      err
      && (
        err.code === 'ER_NO_SUCH_TABLE'
        || /ten_tenant_domains/i.test(String(err.message || ''))
      )
    );
  }

  async function ensureTenantDomainsTable() {
    if (tenantDomainsTableReady) return;
    if (ensureTenantDomainsTablePromise) return ensureTenantDomainsTablePromise;
    ensureTenantDomainsTablePromise = (async () => {
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS ten_tenant_domains (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id BIGINT UNSIGNED NOT NULL,
            domain VARCHAR(255) NOT NULL,
            domain_ascii VARCHAR(255) NOT NULL,
            is_enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_tenant_domains_ascii (domain_ascii),
            KEY idx_tenant_domains_tenant (tenant_id),
            KEY idx_tenant_domains_enabled (tenant_id, is_enabled, id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        const [columnRows] = await db.query('SHOW COLUMNS FROM ten_tenant_domains');
        const existing = new Set(
          (Array.isArray(columnRows) ? columnRows : [])
            .map((row) => String(row?.Field || '').trim())
            .filter(Boolean)
        );
        for (const column of tenantDomainColumns) {
          if (existing.has(column.name)) continue;
          try {
            await db.query(`ALTER TABLE ten_tenant_domains ADD COLUMN \`${column.name}\` ${column.sql}`);
            existing.add(column.name);
          } catch (err) {
            if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
              existing.add(column.name);
              continue;
            }
            throw err;
          }
        }
        tenantDomainsTableReady = true;
      } finally {
        if (!tenantDomainsTableReady) {
          ensureTenantDomainsTablePromise = null;
        }
      }
    })();
    return ensureTenantDomainsTablePromise;
  }

  function normalizeTenantDomainRow(row) {
    if (!row || typeof row !== 'object') return null;
    const rawDomain = helpers.strOrNull(row.domain);
    const rawDomainAscii = helpers.strOrNull(row.domain_ascii);
    const displayDomain = helpers.strOrNull(
      domainToUnicode(rawDomain || rawDomainAscii || '') || rawDomain || rawDomainAscii
    );
    return {
      id: Number(row.id || 0) || 0,
      tenant_id: Number(row.tenant_id || 0) || 0,
      domain: displayDomain,
      domain_ascii: rawDomainAscii,
      is_enabled: Number(row.is_enabled) !== 0,
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  async function getTenantDomainsRaw(tenantId) {
    await ensureTenantDomainsTable();
    const [rows] = await db.query(
      `SELECT id, tenant_id, domain, domain_ascii, is_enabled, created_at, updated_at
       FROM ten_tenant_domains
       WHERE tenant_id=?
       ORDER BY is_enabled DESC, id ASC`,
      [tenantId]
    );
    return Array.isArray(rows) ? rows.map(normalizeTenantDomainRow).filter(Boolean) : [];
  }

  async function syncTenantPrimaryDomain(tenantId, options = {}) {
    await ensureTenantDomainsTable();
    const providedLegacyDomain = Object.prototype.hasOwnProperty.call(options, 'legacyDomain')
      ? helpers.strOrNull(options.legacyDomain)
      : undefined;
    const providedLegacyAscii = Object.prototype.hasOwnProperty.call(options, 'legacyAscii')
      ? helpers.strOrNull(options.legacyAscii)
      : undefined;

    let legacyDomain = providedLegacyDomain;
    let legacyAscii = providedLegacyAscii;
    if (legacyDomain === undefined || legacyAscii === undefined) {
      const [tenantRows] = await db.query(
        'SELECT custom_domain, custom_domain_ascii FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const currentTenant = tenantRows[0] || {};
      if (legacyDomain === undefined) legacyDomain = helpers.strOrNull(currentTenant.custom_domain);
      if (legacyAscii === undefined) legacyAscii = helpers.strOrNull(currentTenant.custom_domain_ascii);
    }

    if (legacyAscii) {
      const [sameDomainRows] = await db.query(
        'SELECT id, tenant_id FROM ten_tenant_domains WHERE domain_ascii=? LIMIT 1',
        [legacyAscii]
      );
      const sameDomain = sameDomainRows[0] || null;
      if (!sameDomain) {
        await db.query(
          'INSERT INTO ten_tenant_domains (tenant_id, domain, domain_ascii, is_enabled) VALUES (?, ?, ?, 1)',
          [tenantId, legacyDomain || legacyAscii, legacyAscii]
        );
      } else if (Number(sameDomain.tenant_id) === Number(tenantId)) {
        await db.query(
          'UPDATE ten_tenant_domains SET domain=? WHERE id=?',
          [legacyDomain || legacyAscii, sameDomain.id]
        );
      }
    }

    let domains = await getTenantDomainsRaw(tenantId);
    if (!domains.length) {
      await db.query(
        'UPDATE ten_tenants SET custom_domain=NULL, custom_domain_ascii=NULL WHERE id=?',
        [tenantId]
      );
      return [];
    }

    const primary = domains.find((item) => item.is_enabled) || null;
    await db.query(
      'UPDATE ten_tenants SET custom_domain=?, custom_domain_ascii=? WHERE id=?',
      [
        primary ? (primary.domain || primary.domain_ascii) : null,
        primary ? primary.domain_ascii : null,
        tenantId
      ]
    );

    domains.sort((a, b) => {
      if (a.is_enabled && !b.is_enabled) return -1;
      if (!a.is_enabled && b.is_enabled) return 1;
      return Number(a.id || 0) - Number(b.id || 0);
    });
    return domains;
  }

  async function ensureTenantDomainAvailable(tenantId, domainAscii, ignoreId = null) {
    await ensureTenantDomainsTable();
    const params = [domainAscii];
    let sql = 'SELECT id, tenant_id FROM ten_tenant_domains WHERE domain_ascii=?';
    if (ignoreId !== null && ignoreId !== undefined) {
      sql += ' AND id<>?';
      params.push(ignoreId);
    }
    sql += ' LIMIT 1';
    const [domainRows] = await db.query(sql, params);
    const takenDomain = domainRows[0] || null;
    if (takenDomain && Number(takenDomain.tenant_id) !== Number(tenantId)) {
      return false;
    }
    const [legacyRows] = await db.query(
      'SELECT id FROM ten_tenants WHERE custom_domain_ascii=? AND id<>? LIMIT 1',
      [domainAscii, tenantId]
    );
    return legacyRows.length === 0;
  }

  async function addOrReuseTenantDomain(tenantId, normalizedDomain) {
    await ensureTenantDomainsTable();
    const includeDomain = normalizedDomain && normalizedDomain.provided && normalizedDomain.ascii;
    if (!includeDomain) {
      throw new Error('INVALID_CUSTOM_DOMAIN');
    }

    const domainUnicode = normalizedDomain.unicode || normalizedDomain.ascii;
    const domainAscii = normalizedDomain.ascii;
    const available = await ensureTenantDomainAvailable(tenantId, domainAscii);
    if (!available) {
      const err = new Error('CUSTOM_DOMAIN_TAKEN');
      err.code = 'CUSTOM_DOMAIN_TAKEN';
      throw err;
    }

    const [existingRows] = await db.query(
      'SELECT id FROM ten_tenant_domains WHERE tenant_id=? AND domain_ascii=? LIMIT 1',
      [tenantId, domainAscii]
    );
    let domainId = existingRows[0] ? Number(existingRows[0].id) : 0;
    if (domainId > 0) {
      await db.query(
        'UPDATE ten_tenant_domains SET domain=?, is_enabled=1 WHERE id=?',
        [domainUnicode, domainId]
      );
    } else {
      const [insertResult] = await db.query(
        'INSERT INTO ten_tenant_domains (tenant_id, domain, domain_ascii, is_enabled) VALUES (?, ?, ?, 1)',
        [tenantId, domainUnicode, domainAscii]
      );
      domainId = Number(insertResult.insertId || 0);
    }

    const domains = await syncTenantPrimaryDomain(tenantId);
    return domains.find((item) => Number(item.id) === Number(domainId)) || null;
  }

  async function removeTenantDomain(tenantId, domainId) {
    await ensureTenantDomainsTable();
    await db.query(
      'DELETE FROM ten_tenant_domains WHERE tenant_id=? AND id=? LIMIT 1',
      [tenantId, domainId]
    );
    return syncTenantPrimaryDomain(tenantId, { legacyDomain: null, legacyAscii: null });
  }

  async function setTenantDomainEnabled(tenantId, domainId, isEnabled) {
    await ensureTenantDomainsTable();
    await db.query(
      'UPDATE ten_tenant_domains SET is_enabled=? WHERE tenant_id=? AND id=? LIMIT 1',
      [isEnabled ? 1 : 0, tenantId, domainId]
    );
    return syncTenantPrimaryDomain(tenantId);
  }

  async function buildTenantResponse(tenant, req) {
    if (!tenant) return null;
    const domains = await syncTenantPrimaryDomain(Number(tenant.id), {
      legacyDomain: tenant.custom_domain,
      legacyAscii: tenant.custom_domain_ascii
    });
    const primaryDomain = domains.find((item) => item.is_enabled) || null;
    const nextTenant = {
      ...tenant,
      custom_domain: primaryDomain ? (primaryDomain.domain || primaryDomain.domain_ascii) : null,
      custom_domain_ascii: primaryDomain ? primaryDomain.domain_ascii : null
    };
    const siteMenuItems = serializeSiteMenuItems(nextTenant.site_menu_items_json);
    delete nextTenant.site_menu_items_json;
    const forwardedProto = req.headers['x-forwarded-proto'];
    const forwardedHost = req.headers['x-forwarded-host'];
    const protocol = firstHeaderValue(forwardedProto, req.protocol || 'https');
    const hostHeader = firstHeaderValue(forwardedHost, req.get('host') || 'localhost:3000');
    const baseUrl = `${protocol}://${hostHeader}`;
    const subdomainShopUrl = buildTenantSubdomainUrl(nextTenant, req);
    const pwaInstallTargets = buildTenantPwaInstallTargets(nextTenant, req, domains);
    const reachableDevTunnelState = await getReachableDevPwaTunnelState();
    const pwaInstallDevTargets = buildTenantPwaDevInstallTargets(nextTenant, req, {
      tunnelState: reachableDevTunnelState
    });
    return {
      ...nextTenant,
      site_menu_items: siteMenuItems,
      domains,
      subdomain_shop_url: subdomainShopUrl,
      pwa_install_targets: pwaInstallTargets,
      pwa_install_dev_targets: pwaInstallDevTargets,
      telegram_mini_app_url: `${baseUrl}/tg-app?tenant_id=${tenant.id}`,
      max_mini_app_url: `${baseUrl}/max-app?tenant_id=${tenant.id}`,
      domain_setup: getTenantDomainSetup(req)
    };
  }

  function requestRemote(protocol, options) {
    const client = protocol === 'https' ? https : http;
    return new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: Number(res.statusCode || 0),
            headers: res.headers || {},
            body: Buffer.concat(chunks).toString('utf8')
          });
        });
      });
      req.on('error', reject);
      req.setTimeout(Number(options.timeout || 5000), () => {
        req.destroy(new Error('timeout'));
      });
      req.end();
    });
  }

  async function performTenantDomainCheck({ tenantId, domainAscii }) {
    const result = {
      dns: false,
      http: false,
      ssl: false,
      dns_detail: '',
      http_detail: '',
      ssl_detail: ''
    };
    const setup = getTenantDomainSetup();
    const expectedARecords = Array.isArray(setup.a_records) ? setup.a_records : [];
    let resolvedAddresses = [];

    try {
      resolvedAddresses = await dns.resolve4(domainAscii);
      const matchingAddress = resolvedAddresses.find((address) => expectedARecords.includes(address));
      if (matchingAddress) {
        result.dns = true;
        result.dns_detail = `A-Р·Р°РїРёСЃРё РЅР°СЃС‚СЂРѕРµРЅС‹: ${resolvedAddresses.join(', ')}`;
      } else {
        result.dns_detail = expectedARecords.length
          ? `РћР¶РёРґР°РµРј IP ${expectedARecords.join(', ')}`
          : `РќР°Р№РґРµРЅС‹ IP: ${resolvedAddresses.join(', ')}`;
      }
    } catch (e) {
      result.dns_detail = e && e.code === 'ENOTFOUND' ? 'A-Р·Р°РїРёСЃСЊ РЅРµ РЅР°Р№РґРµРЅР°' : 'РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРѕРІРµСЂРёС‚СЊ A-Р·Р°РїРёСЃСЊ';
    }

    if (result.dns) {
      try {
        const httpResponse = await requestRemote('http', {
          hostname: domainAscii,
          port: 80,
          path: '/',
          timeout: 5000
        });
        if (httpResponse.statusCode >= 200 && httpResponse.statusCode < 400) {
          result.http = true;
          result.http_detail = httpResponse.statusCode >= 300
            ? 'Р•СЃС‚СЊ СЂРµРґРёСЂРµРєС‚ РЅР° СЃР°Р№С‚'
            : 'РЎР°Р№С‚ РѕС‚РІРµС‡Р°РµС‚';
        } else {
          result.http_detail = `HTTP ${httpResponse.statusCode}`;
        }
      } catch (e) {
        result.http_detail = e && e.message === 'timeout' ? 'РЎР°Р№С‚ РЅРµ РѕС‚РІРµС‚РёР» РІРѕРІСЂРµРјСЏ' : 'РЎР°Р№С‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ';
      }

      try {
        const httpsResponse = await requestRemote('https', {
          hostname: domainAscii,
          port: 443,
          path: setup.check_path,
          timeout: 5000,
          rejectUnauthorized: true
        });
        let payload = null;
        try {
          payload = JSON.parse(String(httpsResponse.body || '{}'));
        } catch (_) {}
        if (
          httpsResponse.statusCode >= 200
          && httpsResponse.statusCode < 300
          && payload
          && payload.ok
          && Number(payload.tenant_id) === Number(tenantId)
        ) {
          result.ssl = true;
          result.ssl_detail = 'РЎРµСЂС‚РёС„РёРєР°С‚ Р°РєС‚РёРІРµРЅ';
        } else {
          result.ssl_detail = 'РЎРµСЂС‚РёС„РёРєР°С‚ РµС‰Рµ РЅРµ РіРѕС‚РѕРІ';
        }
      } catch (e) {
        result.ssl_detail = 'РЎРµСЂС‚РёС„РёРєР°С‚ РµС‰Рµ РЅРµ РіРѕС‚РѕРІ';
      }
    } else {
      result.http_detail = 'РЎРЅР°С‡Р°Р»Р° РЅР°СЃС‚СЂРѕР№С‚Рµ A-Р·Р°РїРёСЃРё';
      result.ssl_detail = 'РЎРЅР°С‡Р°Р»Р° РЅР°СЃС‚СЂРѕР№С‚Рµ A-Р·Р°РїРёСЃРё';
    }

    return result;
  }

  function runTenantDomainAutomation({ domainAscii, includeWww, disconnect = false }) {
    const runnerBin = String(process.env.TENANT_DOMAIN_AUTOCONNECT_RUNNER || '').trim();
    const runnerArgs = parseCommandArgs(process.env.TENANT_DOMAIN_AUTOCONNECT_RUNNER_ARGS);
    const scriptPath = path.join(process.cwd(), 'scripts', 'connect-tenant-domain.js');
    const command = runnerBin || process.execPath;
    const args = runnerBin
      ? runnerArgs.slice()
      : [scriptPath];
    args.push(`--domain=${domainAscii}`);
    if (disconnect) {
      args.push('--disconnect');
    }
    if (includeWww) args.push('--include-www');
    return new Promise((resolve, reject) => {
      execFile(command, args, { timeout: 180000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
          reject(err);
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  }

  function normalizeChatAssistantGender(value) {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const raw = String(value).trim().toLowerCase();
    if (!raw) return null;
    if (raw === 'm' || raw === 'male' || raw === 'man' || raw === 'Рј' || raw === 'РјСѓР¶' || raw === 'РјСѓР¶СЃРєРѕР№') {
      return 'm';
    }
    if (raw === 'f' || raw === 'female' || raw === 'woman' || raw === 'Р¶' || raw === 'Р¶РµРЅ' || raw === 'Р¶РµРЅСЃРєРёР№') {
      return 'f';
    }
    return '__invalid__';
  }

  const CHAT_QUICK_ORDER_ID = 'order';
  const CHAT_QUICK_ORDER_QUESTION = '\u0413\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437?';
  const CHAT_QUICK_QUESTIONS_MAX = 6;
  const CHAT_QUICK_DEFAULT_ITEMS = Object.freeze([
    {
      id: CHAT_QUICK_ORDER_ID,
      type: 'order',
      question: CHAT_QUICK_ORDER_QUESTION,
      answer: '',
      enabled: true,
    },
    {
      id: 'quality',
      type: 'custom',
      question: '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430',
      answer:
        '\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. ' +
        '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, ' +
        '\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.',
      enabled: true,
    },
    {
      id: 'completeness',
      type: 'custom',
      question: '\u0412\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430',
      answer:
        '\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, ' +
        '\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.',
      enabled: true,
    },
    {
      id: 'other',
      type: 'custom',
      question: '\u0414\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441',
      answer:
        '\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.',
      enabled: true,
    },
  ]);
  const CHAT_QUICK_DEFAULT_ANSWER_BY_KEY = Object.freeze({
    '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0443 \u0442\u043e\u0432\u0430\u0440\u0430':
      '\u041e\u0447\u0435\u043d\u044c \u0436\u0430\u043b\u044c, \u0447\u0442\u043e \u0442\u0430\u043a \u043f\u043e\u043b\u0443\u0447\u0438\u043b\u043e\u0441\u044c. ' +
      '\u041d\u0430\u043f\u0438\u0448\u0438\u0442\u0435, \u043f\u043e\u0436\u0430\u043b\u0443\u0439\u0441\u0442\u0430, ' +
      '\u043a\u0430\u043a\u043e\u0439 \u0442\u043e\u0432\u0430\u0440 \u0438 \u0447\u0442\u043e \u0438\u043c\u0435\u043d\u043d\u043e \u043d\u0435 \u0442\u0430\u043a.',
    '\u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e \u043a\u043e\u043c\u043f\u043b\u0435\u043a\u0442\u0430\u0446\u0438\u0438 \u0437\u0430\u043a\u0430\u0437\u0430':
      '\u041f\u043e\u043d\u044f\u043b. \u041f\u043e\u0434\u0441\u043a\u0430\u0436\u0438\u0442\u0435, ' +
      '\u0447\u0435\u0433\u043e \u043d\u0435 \u0445\u0432\u0430\u0442\u0430\u0435\u0442 \u0438\u043b\u0438 \u0447\u0442\u043e \u0431\u044b\u043b\u043e \u043b\u0438\u0448\u043d\u0438\u043c.',
    '\u0434\u0440\u0443\u0433\u043e\u0439 \u0432\u043e\u043f\u0440\u043e\u0441':
      '\u042f \u043d\u0430 \u0441\u0432\u044f\u0437\u0438. \u041e\u043f\u0438\u0448\u0438\u0442\u0435 \u0432\u0430\u0448 \u0432\u043e\u043f\u0440\u043e\u0441 \u043f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435.',
  });

  function cloneDefaultChatQuickItems() {
    return CHAT_QUICK_DEFAULT_ITEMS.map((item) => ({
      id: String(item.id || ''),
      type: item.id === CHAT_QUICK_ORDER_ID ? 'order' : 'custom',
      question: String(item.question || ''),
      answer: item.id === CHAT_QUICK_ORDER_ID ? '' : String(item.answer || ''),
      enabled: item.enabled !== false,
    }));
  }

  function normalizeChatQuickQuestionKey(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/\u0451/g, '\u0435')
      .replace(/[!?.,;:()[\]{}"'`~]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeChatQuickQuestionText(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160);
  }

  function normalizeChatQuickQuestionAnswer(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/\s+\n/g, '\n')
      .trim()
      .slice(0, 1200);
  }

  function normalizeChatQuickQuestionEnabled(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback !== false;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback !== false;
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
    return helpers.toBool(value, fallback !== false);
  }

  function normalizeChatQuickQuestionId(rawValue, index) {
    const source = String(rawValue || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 48);
    if (source && source !== CHAT_QUICK_ORDER_ID) return source;
    return `custom-${index + 1}`;
  }

  function isOrderQuickQuestionLike(value) {
    const normalized = normalizeChatQuickQuestionKey(value);
    if (!normalized) return false;
    return normalized.includes('\u0433\u0434\u0435 \u043c\u043e\u0439 \u0437\u0430\u043a\u0430\u0437')
      || normalized.includes('\u0433\u0434\u0435 \u0437\u0430\u043a\u0430\u0437');
  }

  function getDefaultChatQuickQuestionAnswer(value) {
    const key = normalizeChatQuickQuestionKey(value);
    return String(CHAT_QUICK_DEFAULT_ANSWER_BY_KEY[key] || '');
  }

  function sanitizeChatQuickQuestionsConfig(rawValue, options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const fallbackToDefault = opts.fallbackToDefault !== false;

    let parsed = [];
    if (Array.isArray(rawValue)) {
      parsed = rawValue;
    } else if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) {
        parsed = [];
      } else {
        try {
          const value = JSON.parse(trimmed);
          if (!Array.isArray(value)) {
            return { ok: false, error: 'BAD_CHAT_QUESTIONS' };
          }
          parsed = value;
        } catch {
          parsed = trimmed.split(/\r?\n/);
        }
      }
    } else if (rawValue && typeof rawValue === 'object' && Array.isArray(rawValue.items)) {
      parsed = rawValue.items;
    } else if (rawValue === null || rawValue === undefined) {
      parsed = [];
    } else {
      return { ok: false, error: 'BAD_CHAT_QUESTIONS' };
    }

    if (!parsed.length && fallbackToDefault) {
      return { ok: true, items: cloneDefaultChatQuickItems() };
    }

    const maxCustomItems = Math.max(0, CHAT_QUICK_QUESTIONS_MAX - 1);
    const customCandidates = [];
    let orderEnabled = true;
    let orderDefined = false;

    parsed.forEach((item, index) => {
      if (customCandidates.length >= maxCustomItems) return;

      if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
        const question = normalizeChatQuickQuestionText(item);
        if (!question) return;
        if (isOrderQuickQuestionLike(question) && index === 0) {
          orderEnabled = true;
          orderDefined = true;
          return;
        }
        customCandidates.push({
          id: '',
          question,
          answer: getDefaultChatQuickQuestionAnswer(question),
          enabled: true,
        });
        return;
      }

      if (!item || typeof item !== 'object') return;

      const source = item;
      const question = normalizeChatQuickQuestionText(
        source.question ?? source.label ?? source.title ?? source.text ?? ''
      );
      const rawId = String(source.id ?? source.key ?? source.code ?? '').trim();
      const rawType = String(source.type ?? '').trim().toLowerCase();
      const isOrder = (
        rawId === CHAT_QUICK_ORDER_ID
        || rawType === CHAT_QUICK_ORDER_ID
        || normalizeChatQuickQuestionEnabled(source.is_order, false)
        || (index === 0 && isOrderQuickQuestionLike(question))
      );

      if (isOrder) {
        orderEnabled = normalizeChatQuickQuestionEnabled(
          source.enabled ?? source.is_enabled ?? source.active,
          true
        );
        orderDefined = true;
        return;
      }

      if (!question) return;
      const hasExplicitAnswer = (
        Object.prototype.hasOwnProperty.call(source, 'answer')
        || Object.prototype.hasOwnProperty.call(source, 'reply')
        || Object.prototype.hasOwnProperty.call(source, 'response')
        || Object.prototype.hasOwnProperty.call(source, 'message')
      );

      let answer = normalizeChatQuickQuestionAnswer(
        source.answer ?? source.reply ?? source.response ?? source.message ?? ''
      );
      if (!answer && !hasExplicitAnswer) answer = getDefaultChatQuickQuestionAnswer(question);

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

    const uniqueIds = new Set([CHAT_QUICK_ORDER_ID]);
    const customItems = [];
    customCandidates.slice(0, maxCustomItems).forEach((item, index) => {
      let id = normalizeChatQuickQuestionId(item.id, index);
      if (uniqueIds.has(id)) {
        let seq = index + 1;
        while (uniqueIds.has(`custom-${seq}`)) seq += 1;
        id = `custom-${seq}`;
      }
      uniqueIds.add(id);
      customItems.push({
        id,
        type: 'custom',
        question: String(item.question || ''),
        answer: normalizeChatQuickQuestionAnswer(item.answer || ''),
        enabled: item.enabled !== false,
      });
    });

    const normalizedItems = [
      {
        id: CHAT_QUICK_ORDER_ID,
        type: 'order',
        question: CHAT_QUICK_ORDER_QUESTION,
        answer: '',
        enabled: orderDefined ? orderEnabled !== false : true,
      },
      ...customItems,
    ];

    return { ok: true, items: normalizedItems };
  }

  function isSameChatQuickQuestionsConfig(a, b) {
    const left = Array.isArray(a) ? a : [];
    const right = Array.isArray(b) ? b : [];
    if (left.length !== right.length) return false;
    for (let idx = 0; idx < left.length; idx += 1) {
      const l = left[idx] || {};
      const r = right[idx] || {};
      if (String(l.id || '') !== String(r.id || '')) return false;
      if (String(l.type || '') !== String(r.type || '')) return false;
      if (String(l.question || '') !== String(r.question || '')) return false;
      if (String(l.answer || '') !== String(r.answer || '')) return false;
      if ((l.enabled !== false) !== (r.enabled !== false)) return false;
    }
    return true;
  }

  function normalizeMapProviderAccountString(value, maxLength = 1024) {
    if (value === undefined || value === null) return '';
    return String(value).trim().slice(0, maxLength);
  }

  function normalizeMapProviderAccountId(value, index = 0) {
    const source = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 64);
    if (source) return source;
    return `map-account-${index + 1}`;
  }

  function normalizeMapProviderAccountBoolean(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return fallback;
    if (normalized === '1' || normalized === 'true' || normalized === 'on' || normalized === 'yes') return true;
    if (normalized === '0' || normalized === 'false' || normalized === 'off' || normalized === 'no') return false;
    return helpers.toBool(value, fallback);
  }

  function cloneMapProviderAccount(account, index = 0) {
    const source = account && typeof account === 'object' ? account : {};
    return {
      id: normalizeMapProviderAccountId(source.id, index),
      api_key: normalizeMapProviderAccountString(source.api_key, 1024),
      login: normalizeMapProviderAccountString(source.login, 320) || null,
      password: normalizeMapProviderAccountString(source.password, 320) || null,
      is_active: normalizeMapProviderAccountBoolean(source.is_active, false),
    };
  }

  function parseTenantMapProviderAccounts(rawValue) {
    if (Array.isArray(rawValue)) {
      return rawValue;
    }
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) return [];
      try {
        const parsed = JSON.parse(trimmed);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    }
    return [];
  }

  function sanitizeTenantMapProviderAccounts(rawValue) {
    const parsed = parseTenantMapProviderAccounts(rawValue);
    if (parsed.length > 20) {
      return { ok: false, error: 'MAP_PROVIDER_ACCOUNTS_LIMIT_EXCEEDED' };
    }

    const normalized = [];
    const seenIds = new Set();
    let activeIndex = -1;

    for (let index = 0; index < parsed.length; index += 1) {
      const source = parsed[index];
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        return { ok: false, error: 'BAD_MAP_PROVIDER_ACCOUNTS' };
      }

      const next = cloneMapProviderAccount(source, index);
      if (!next.api_key) {
        return { ok: false, error: 'MAP_PROVIDER_API_KEY_REQUIRED' };
      }

      let nextId = next.id;
      let suffix = 2;
      while (seenIds.has(nextId)) {
        nextId = `${next.id}-${suffix}`;
        suffix += 1;
      }
      seenIds.add(nextId);
      next.id = nextId;

      if (next.is_active && activeIndex === -1) {
        activeIndex = normalized.length;
      }
      next.is_active = false;
      normalized.push(next);
    }

    if (normalized.length && activeIndex === -1) {
      activeIndex = 0;
    }
    if (activeIndex >= 0 && normalized[activeIndex]) {
      normalized[activeIndex].is_active = true;
    }

    return { ok: true, items: normalized };
  }

  function maskMapProviderSecret(value) {
    const raw = normalizeMapProviderAccountString(value, 1024);
    if (!raw) return '';
    if (raw.length <= 2) return `${raw[0]}вЂў`;
    if (raw.length <= 8) return `${raw.slice(0, 1)}вЂўвЂўвЂўвЂў${raw.slice(-1)}`;
    return `${raw.slice(0, 4)}вЂўвЂўвЂўвЂў${raw.slice(-4)}`;
  }

  function serializeTenantMapProviderAccountsForClient(rawValue) {
    const sanitized = sanitizeTenantMapProviderAccounts(rawValue);
    if (!sanitized.ok) return [];
    return sanitized.items.map((item) => ({
      id: String(item.id || ''),
      is_active: item.is_active === true,
      api_key: String(item.api_key || ''),
      api_key_masked: maskMapProviderSecret(item.api_key),
      has_login: Boolean(item.login),
      has_password: Boolean(item.password),
    }));
  }

  const defaultSiteMenuItems = Object.freeze([
    { key: 'my-orders', title: 'РњРѕРё Р·Р°РєР°Р·С‹', icon_class: 'fas fa-receipt', enabled: true, sort_order: 0 },
    { key: 'favorites', title: 'РР·Р±СЂР°РЅРЅРѕРµ', icon_class: 'fas fa-heart', enabled: true, sort_order: 1 },
    { key: 'benefits', title: 'Р’С‹РіРѕРґС‹', icon_class: 'fas fa-tags', enabled: true, sort_order: 2 },
    { key: 'promocodes', title: 'РџСЂРѕРјРѕРєРѕРґС‹', icon_class: 'fas fa-ticket-alt', enabled: true, sort_order: 3 },
    { key: 'discounts', title: 'РЎРєРёРґРєРё', icon_class: 'fas fa-percent', enabled: true, sort_order: 4 },
    { key: 'gifts', title: 'РџРѕРґР°СЂРєРё', icon_class: 'fas fa-gift', enabled: true, sort_order: 5 },
    { key: 'addresses', title: 'РђРґСЂРµСЃР°', icon_class: 'fas fa-map-marker-alt', enabled: true, sort_order: 6 },
    { key: 'bought-before', title: 'РЈР¶Рµ РїРѕРєСѓРїР°Р»Рё', icon_class: 'fas fa-shopping-bag', enabled: true, sort_order: 7 },
    { key: 'tasks', title: 'Р—Р°РґР°РЅРёСЏ', icon_class: 'fas fa-tasks', enabled: true, sort_order: 8 },
    { key: 'product-rating', title: 'РћС†РµРЅРєР° С‚РѕРІР°СЂРѕРІ', icon_class: 'fas fa-star-half-alt', enabled: true, sort_order: 9 },
  ]);

  function normalizeSiteMenuItems(rawValue, { fallbackToDefault = true } = {}) {
    let parsed = rawValue;
    if (typeof rawValue === 'string') {
      const trimmed = rawValue.trim();
      if (!trimmed) parsed = [];
      else {
        try {
          parsed = JSON.parse(trimmed);
        } catch (_) {
          parsed = [];
        }
      }
    }
    const incoming = Array.isArray(parsed) ? parsed : [];
    const byKey = new Map();
    incoming.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const key = String(item.key || '').trim();
      if (!key) return;
      byKey.set(key, item);
    });
    const normalized = defaultSiteMenuItems.map((defaults) => {
      const item = byKey.get(defaults.key) || {};
      const title = helpers.strOrNull(item.title);
      const iconUrl = helpers.strOrNull(item.icon_url);
      return {
        key: defaults.key,
        title: title ? title.slice(0, 80) : defaults.title,
        enabled: item.enabled === undefined ? Boolean(defaults.enabled) : helpers.toBool(item.enabled, true),
        icon_url: iconUrl ? iconUrl.slice(0, 512) : null,
        icon_class: defaults.icon_class,
        sort_order: Number(defaults.sort_order) || 0,
      };
    });
    return fallbackToDefault || incoming.length ? normalized : [];
  }

  function serializeSiteMenuItems(rawValue) {
    return normalizeSiteMenuItems(rawValue, { fallbackToDefault: true });
  }

  function serializeTenantForClient(tenant, extra = {}) {
    if (!tenant || typeof tenant !== 'object') return null;
    const source = { ...tenant };
    delete source.map_provider_accounts_json;
    delete source.site_menu_items_json;
    return { ...source, ...extra };
  }

  function buildTenantMapProviderResponse(tenantRow) {
    const config = normalizeTenantMapConfig(tenantRow);
    return {
      enabled: Boolean(config.store_address_map_enabled),
      provider_name: String(config.provider_name || '').trim(),
      items: serializeTenantMapProviderAccountsForClient(tenantRow && tenantRow.map_provider_accounts_json),
    };
  }

  function getActiveTenantMapProviderAccount(rawValue) {
    const sanitized = sanitizeTenantMapProviderAccounts(rawValue);
    if (!sanitized.ok || !sanitized.items.length) return null;
    return sanitized.items.find((item) => item && item.is_active === true) || sanitized.items[0] || null;
  }

  function resolveTenantMapTileUrl(tileUrl, apiKey) {
    const rawTileUrl = normalizeMapProviderAccountString(tileUrl, 4096);
    const normalizedApiKey = normalizeMapProviderAccountString(apiKey, 1024);
    const hasPlaceholder = MAP_PROVIDER_API_KEY_PLACEHOLDER_TEST_RE.test(rawTileUrl);
    const queryParamMatch = rawTileUrl.match(MAP_PROVIDER_API_KEY_QUERY_PARAM_TEST_RE);
    const queryParamValue = queryParamMatch ? String(queryParamMatch[2] || '').trim() : '';
    const requiresQueryParamReplacement = Boolean(queryParamMatch) && (
      !queryParamValue || MAP_PROVIDER_API_KEY_PLACEHOLDER_TEST_RE.test(queryParamValue)
    );
    const requiresApiKey = hasPlaceholder || requiresQueryParamReplacement;

    if (!requiresApiKey) {
      return {
        tile_url: rawTileUrl,
        requires_api_key: false,
        has_active_api_key: Boolean(normalizedApiKey),
        resolved_with_active_api_key: false,
      };
    }

    if (!normalizedApiKey) {
      return {
        tile_url: '',
        requires_api_key: true,
        has_active_api_key: false,
        resolved_with_active_api_key: false,
      };
    }

    const encodedApiKey = encodeURIComponent(normalizedApiKey);
    const resolvedTileUrl = rawTileUrl
      .replace(MAP_PROVIDER_API_KEY_PLACEHOLDER_REPLACE_RE, encodedApiKey)
      .replace(MAP_PROVIDER_API_KEY_QUERY_PARAM_REPLACE_RE, `$1${encodedApiKey}`);

    return {
      tile_url: resolvedTileUrl,
      requires_api_key: true,
      has_active_api_key: true,
      resolved_with_active_api_key: true,
    };
  }

  function buildTenantResolvedMapConfigResponse(tenantRow) {
    const baseConfig = normalizeTenantMapConfig(tenantRow);
    const activeAccount = getActiveTenantMapProviderAccount(tenantRow && tenantRow.map_provider_accounts_json);
    const resolvedTile = resolveTenantMapTileUrl(baseConfig.tile_url, activeAccount && activeAccount.api_key);
    const maxZoomValue = Number(baseConfig.max_zoom);
    const geocoderResultLimitValue = Number(baseConfig.geocoder_result_limit);

    return {
      provider_name: String(baseConfig.provider_name || '').trim(),
      tile_url: String(resolvedTile.tile_url || '').trim(),
      attribution: String(baseConfig.attribution || '').trim(),
      max_zoom: Number.isFinite(maxZoomValue) ? maxZoomValue : 22,
      subdomains: String(baseConfig.subdomains || '').trim(),
      geocoder_provider_name: String(baseConfig.geocoder_provider_name || '').trim(),
      geocoder_search_url: String(baseConfig.geocoder_search_url || '').trim(),
      geocoder_country_code: String(baseConfig.geocoder_country_code || 'ru').trim() || 'ru',
      geocoder_language: String(baseConfig.geocoder_language || 'ru').trim() || 'ru',
      geocoder_result_limit: Number.isFinite(geocoderResultLimitValue) ? geocoderResultLimitValue : 5,
      store_address_map_enabled: Boolean(baseConfig.store_address_map_enabled),
      delivery_zone_polygon_provider: String(baseConfig.delivery_zone_polygon_provider || 'Leaflet-Geoman').trim() || 'Leaflet-Geoman',
      delivery_zone_polygon_enabled: Boolean(baseConfig.store_address_map_enabled),
      tenant_api_key_required: Boolean(resolvedTile.requires_api_key),
      tenant_api_key_configured: Boolean(activeAccount && activeAccount.api_key),
      tenant_api_key_missing: Boolean(
        baseConfig.store_address_map_enabled
        && resolvedTile.requires_api_key
        && !(activeAccount && activeAccount.api_key)
      ),
      tenant_active_account_id: activeAccount ? String(activeAccount.id || '') : null,
      tenant_tile_url_resolved: Boolean(resolvedTile.resolved_with_active_api_key),
    };
  }

  function mergeTenantMapProviderAccountsWithExisting(nextItems, currentItems) {
    const currentSanitized = sanitizeTenantMapProviderAccounts(currentItems);
    const currentById = new Map(
      currentSanitized.ok
        ? currentSanitized.items.map((item) => [String(item.id || ''), item])
        : []
    );

    return parseTenantMapProviderAccounts(nextItems).map((item, index) => {
      const source = item && typeof item === 'object' ? { ...item } : {};
      const sourceId = normalizeMapProviderAccountId(source.id, index);
      const current = currentById.get(sourceId);
      if (!current) return source;

      if (String(source.api_key || '').trim() === MAP_PROVIDER_KEEP_VALUE) {
        source.api_key = current.api_key;
      }
      if (String(source.login || '').trim() === MAP_PROVIDER_KEEP_VALUE) {
        source.login = current.login;
      }
      if (String(source.password || '').trim() === MAP_PROVIDER_KEEP_VALUE) {
        source.password = current.password;
      }

      return source;
    });
  }

  function makePrintApiToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  async function ensureStoreExists(tenantId, storeId) {
    const [rows] = await db.query(
      'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
      [tenantId, storeId]
    );
    return rows.length ? Number(rows[0].id) : null;
  }

  async function ensureTenantChatColumns() {
    if (tenantChatColumnsReady) return true;
    if (ensureTenantChatColumnsPromise) return ensureTenantChatColumnsPromise;

    ensureTenantChatColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM ten_tenants');
      const existing = new Set(
        (Array.isArray(columnRows) ? columnRows : [])
          .map((row) => String(row?.Field || '').trim())
          .filter(Boolean)
      );

      for (const column of tenantChatColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE ten_tenants ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      tenantChatColumnsReady = tenantChatColumns.every((column) => existing.has(column.name));
      return tenantChatColumnsReady;
    })()
      .catch((err) => {
        ensureTenantChatColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (tenantChatColumnsReady) {
          ensureTenantChatColumnsPromise = null;
        }
      });

    return ensureTenantChatColumnsPromise;
  }

  async function ensureTenantMapProviderColumns() {
    return ensureTenantMapConfigColumns(db);
  }

  async function ensureTenantPwaColumns() {
    if (tenantPwaColumnsReady) return true;
    if (ensureTenantPwaColumnsPromise) return ensureTenantPwaColumnsPromise;

    ensureTenantPwaColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM ten_tenants');
      const existing = new Set(
        (Array.isArray(columnRows) ? columnRows : [])
          .map((row) => String(row?.Field || '').trim())
          .filter(Boolean)
      );

      for (const column of tenantPwaColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE ten_tenants ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      tenantPwaColumnsReady = tenantPwaColumns.every((column) => existing.has(column.name));
      return tenantPwaColumnsReady;
    })()
      .catch((err) => {
        ensureTenantPwaColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (tenantPwaColumnsReady) {
          ensureTenantPwaColumnsPromise = null;
        }
      });

    return ensureTenantPwaColumnsPromise;
  }

  async function ensureDeliveryZoneTables() {
    if (deliveryZoneTablesReady) return true;
    if (ensureDeliveryZoneTablesPromise) return ensureDeliveryZoneTablesPromise;

    ensureDeliveryZoneTablesPromise = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS \`${deliveryZoneTables.zones}\` (
          id bigint unsigned NOT NULL AUTO_INCREMENT,
          tenant_id bigint unsigned NOT NULL,
          name varchar(255) NOT NULL,
          color varchar(16) NOT NULL DEFAULT '${DELIVERY_ZONE_DEFAULT_COLOR}',
          eta_minutes int unsigned DEFAULT NULL,
          is_active tinyint(1) NOT NULL DEFAULT 1,
          geometry_json longtext NOT NULL COMMENT 'GeoJSON MultiPolygon',
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_tenant_id (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS \`${deliveryZoneTables.stores}\` (
          id bigint unsigned NOT NULL AUTO_INCREMENT,
          delivery_zone_id bigint unsigned NOT NULL,
          store_id bigint unsigned NOT NULL,
          tenant_id bigint unsigned NOT NULL,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uniq_zone_store (delivery_zone_id, store_id),
          KEY idx_tenant_zone (tenant_id, delivery_zone_id),
          KEY idx_tenant_store (tenant_id, store_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS \`${deliveryZoneTables.tiers}\` (
          id bigint unsigned NOT NULL AUTO_INCREMENT,
          delivery_zone_id bigint unsigned NOT NULL,
          tenant_id bigint unsigned NOT NULL,
          min_order_amount decimal(10,2) NOT NULL DEFAULT 0.00,
          delivery_cost decimal(10,2) NOT NULL DEFAULT 0.00,
          sort_order int unsigned NOT NULL DEFAULT 0,
          created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_tenant_zone (tenant_id, delivery_zone_id),
          KEY idx_tenant_zone_sort (tenant_id, delivery_zone_id, sort_order)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
      `);

      deliveryZoneTablesReady = true;
      return true;
    })()
      .catch((err) => {
        ensureDeliveryZoneTablesPromise = null;
        throw err;
      })
      .finally(() => {
        if (deliveryZoneTablesReady) {
          ensureDeliveryZoneTablesPromise = null;
        }
      });

    return ensureDeliveryZoneTablesPromise;
  }

  function normalizeDeliveryZoneText(value, maxLength = DELIVERY_ZONE_MAX_NAME_LENGTH) {
    const raw = value == null ? '' : String(value).trim();
    if (!raw) return '';
    return raw.slice(0, maxLength);
  }

  function normalizeDeliveryZoneColor(value) {
    const raw = String(value || '').trim();
    if (!raw) return DELIVERY_ZONE_DEFAULT_COLOR;
    if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(raw)) {
      const [, r, g, b] = raw.toLowerCase();
      return `#${r}${r}${g}${g}${b}${b}`;
    }
    return DELIVERY_ZONE_DEFAULT_COLOR;
  }

  function normalizeDeliveryZoneEtaMinutes(value) {
    return normalizeDeliveryEtaMinutesShared(value);
  }

  function normalizeDeliveryZoneMoney(value) {
    return normalizeDeliveryMoneyShared(value);
  }

  function normalizeDeliveryZoneCoordinate(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    if (numeric < min || numeric > max) return null;
    return Number(numeric.toFixed(7));
  }

  function normalizeDeliveryZonePoint(point) {
    if (!Array.isArray(point) || point.length < 2) return null;
    const lng = normalizeDeliveryZoneCoordinate(point[0], -180, 180);
    const lat = normalizeDeliveryZoneCoordinate(point[1], -90, 90);
    if (lat === null || lng === null) return null;
    return [lng, lat];
  }

  function closeDeliveryZoneRing(points) {
    if (!Array.isArray(points) || !points.length) return points;
    const first = points[0];
    const last = points[points.length - 1];
    if (!first || !last) return points;
    if (first[0] === last[0] && first[1] === last[1]) return points;
    return points.concat([[first[0], first[1]]]);
  }

  function normalizeDeliveryZoneRing(ring) {
    if (!Array.isArray(ring)) return null;
    const normalized = ring
      .map((point) => normalizeDeliveryZonePoint(point))
      .filter(Boolean);
    const closed = closeDeliveryZoneRing(normalized);
    return Array.isArray(closed) && closed.length >= 4 ? closed : null;
  }

  function normalizeDeliveryZonePolygon(polygon) {
    if (!Array.isArray(polygon)) return null;
    const rings = polygon
      .map((ring) => normalizeDeliveryZoneRing(ring))
      .filter(Boolean);
    return rings.length ? rings : null;
  }

  function normalizeDeliveryZoneGeometry(rawValue) {
    let source = rawValue;
    if (typeof source === 'string') {
      try {
        source = JSON.parse(source);
      } catch (_) {
        return null;
      }
    }
    if (!source || typeof source !== 'object') return null;
    if (source.type === 'Feature') {
      source = source.geometry;
    }
    if (!source || typeof source !== 'object') return null;
    let type = String(source.type || '').trim();
    let coordinates = source.coordinates;

    if (type === 'Polygon') {
      type = 'MultiPolygon';
      coordinates = [coordinates];
    }
    if (type !== 'MultiPolygon' || !Array.isArray(coordinates)) return null;

    const polygons = coordinates
      .map((polygon) => normalizeDeliveryZonePolygon(polygon))
      .filter(Boolean);
    if (!polygons.length) return null;

    return {
      type: 'MultiPolygon',
      coordinates: polygons,
    };
  }

  function normalizeDeliveryZonePriceTier(rawTier) {
    const source = sanitizeDeliveryPriceTiers([rawTier], {
      requiredError: 'DELIVERY_ZONE_PRICE_TIERS_REQUIRED',
      limitError: 'DELIVERY_ZONE_PRICE_TIERS_LIMIT',
    });
    return source.ok && source.items[0] ? source.items[0] : null;
  }

  function sanitizeDeliveryZonePriceTiers(rawTiers) {
    return sanitizeDeliveryPriceTiers(rawTiers, {
      requiredError: 'DELIVERY_ZONE_PRICE_TIERS_REQUIRED',
      limitError: 'DELIVERY_ZONE_PRICE_TIERS_LIMIT',
    });
  }

  async function sanitizeDeliveryZoneStoreIds(tenantId, rawStoreIds) {
    const uniqueStoreIds = Array.from(new Set(
      (Array.isArray(rawStoreIds) ? rawStoreIds : [])
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    ));
    if (!uniqueStoreIds.length) {
      return { ok: false, error: 'DELIVERY_ZONE_STORE_REQUIRED' };
    }

    const placeholders = uniqueStoreIds.map(() => '?').join(', ');
    const [rows] = await db.query(
      `SELECT id FROM ten_stores WHERE tenant_id=? AND id IN (${placeholders})`,
      [tenantId, ...uniqueStoreIds]
    );
    const existing = new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => Number(row && row.id))
        .filter((value) => Number.isFinite(value) && value > 0)
    );
    if (existing.size !== uniqueStoreIds.length) {
      return { ok: false, error: 'DELIVERY_ZONE_STORE_NOT_FOUND' };
    }
    return { ok: true, items: uniqueStoreIds };
  }

  async function sanitizeDeliveryZonePayload(tenantId, payload) {
    const source = payload && typeof payload === 'object' ? payload : {};
    const name = normalizeDeliveryZoneText(source.name);
    if (!name) {
      return { ok: false, error: 'DELIVERY_ZONE_NAME_REQUIRED' };
    }

    const geometry = normalizeDeliveryZoneGeometry(source.geometry);
    if (!geometry) {
      return { ok: false, error: 'DELIVERY_ZONE_GEOMETRY_REQUIRED' };
    }

    const storeIdsResult = await sanitizeDeliveryZoneStoreIds(tenantId, source.store_ids);
    if (!storeIdsResult.ok) return storeIdsResult;

    const tiersResult = sanitizeDeliveryZonePriceTiers(source.price_tiers);
    if (!tiersResult.ok) return tiersResult;

    return {
      ok: true,
      item: {
        name,
        color: normalizeDeliveryZoneColor(source.color),
        eta_minutes: normalizeDeliveryZoneEtaMinutes(source.eta_minutes),
        is_active: helpers.toBool(source.is_active, true) ? 1 : 0,
        geometry,
        store_ids: storeIdsResult.items,
        price_tiers: tiersResult.items,
      },
    };
  }

  function serializeDeliveryZoneRow(row, extras = {}) {
    const source = row && typeof row === 'object' ? row : {};
    return {
      id: Number(source.id || 0),
      tenant_id: Number(source.tenant_id || 0),
      name: String(source.name || '').trim(),
      color: normalizeDeliveryZoneColor(source.color),
      eta_minutes: source.eta_minutes == null ? null : Number(source.eta_minutes),
      is_active: Number(source.is_active) === 1 ? 1 : 0,
      geometry: normalizeDeliveryZoneGeometry(source.geometry_json),
      created_at: source.created_at || null,
      updated_at: source.updated_at || null,
      store_ids: Array.isArray(extras.store_ids) ? extras.store_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0) : [],
      price_tiers: Array.isArray(extras.price_tiers)
        ? extras.price_tiers.map((tier, index) => ({
          min_order_amount: normalizeDeliveryZoneMoney(tier && tier.min_order_amount) ?? 0,
          delivery_cost: normalizeDeliveryZoneMoney(tier && tier.delivery_cost) ?? 0,
          sort_order: tier && tier.sort_order != null ? Number(tier.sort_order) : index,
        }))
        : [],
    };
  }

  async function loadDeliveryZonesForTenant(tenantId) {
    await ensureDeliveryZoneTables();
    const [rows] = await db.query(
      `SELECT id, tenant_id, name, color, eta_minutes, is_active, geometry_json, created_at, updated_at
       FROM \`${deliveryZoneTables.zones}\`
       WHERE tenant_id=?
       ORDER BY id ASC`,
      [tenantId]
    );

    const zoneIds = (Array.isArray(rows) ? rows : [])
      .map((row) => Number(row && row.id))
      .filter((value) => Number.isFinite(value) && value > 0);
    const storeMap = new Map();
    const tiersMap = new Map();

    if (zoneIds.length) {
      const placeholders = zoneIds.map(() => '?').join(', ');
      const [storeRows] = await db.query(
        `SELECT delivery_zone_id, store_id
         FROM \`${deliveryZoneTables.stores}\`
         WHERE tenant_id=? AND delivery_zone_id IN (${placeholders})`,
        [tenantId, ...zoneIds]
      );
      (Array.isArray(storeRows) ? storeRows : []).forEach((row) => {
        const zoneId = Number(row && row.delivery_zone_id);
        const storeId = Number(row && row.store_id);
        if (!Number.isFinite(zoneId) || !Number.isFinite(storeId)) return;
        if (!storeMap.has(zoneId)) storeMap.set(zoneId, []);
        storeMap.get(zoneId).push(storeId);
      });

      const [tierRows] = await db.query(
        `SELECT delivery_zone_id, min_order_amount, delivery_cost, sort_order
         FROM \`${deliveryZoneTables.tiers}\`
         WHERE tenant_id=? AND delivery_zone_id IN (${placeholders})
         ORDER BY delivery_zone_id ASC, sort_order ASC, id ASC`,
        [tenantId, ...zoneIds]
      );
      (Array.isArray(tierRows) ? tierRows : []).forEach((row) => {
        const zoneId = Number(row && row.delivery_zone_id);
        if (!Number.isFinite(zoneId)) return;
        if (!tiersMap.has(zoneId)) tiersMap.set(zoneId, []);
        tiersMap.get(zoneId).push({
          min_order_amount: row.min_order_amount,
          delivery_cost: row.delivery_cost,
          sort_order: row.sort_order,
        });
      });
    }

    return (Array.isArray(rows) ? rows : []).map((row) => serializeDeliveryZoneRow(row, {
      store_ids: storeMap.get(Number(row && row.id)) || [],
      price_tiers: tiersMap.get(Number(row && row.id)) || [],
    }));
  }

  async function loadDeliveryZoneForTenant(tenantId, zoneId) {
    const items = await loadDeliveryZonesForTenant(tenantId);
    return items.find((item) => Number(item && item.id) === Number(zoneId)) || null;
  }

  async function ensureOrderDeliveryTypeColumns() {
    if (orderDeliveryTypeColumnsReady) return true;
    if (ensureOrderDeliveryTypeColumnsPromise) return ensureOrderDeliveryTypeColumnsPromise;

    ensureOrderDeliveryTypeColumnsPromise = (async () => {
      const [columnRows] = await db.query('SHOW COLUMNS FROM order_delivery_types');
      const existing = new Set((columnRows || []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
      const requiredColumns = [
        {
          name: 'require_client_data',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'РћР±СЏР·Р°С‚РµР»СЊРЅС‹ Р»Рё РґР°РЅРЅС‹Рµ РєР»РёРµРЅС‚Р° (РёРјСЏ/С‚РµР»РµС„РѕРЅ)'",
        },
        {
          name: 'show_on_site',
          sql: "TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'РџРѕРєР°Р·С‹РІР°С‚СЊ СЃРїРѕСЃРѕР± РЅР° СЃР°Р№С‚Рµ'",
        },
      ];

      for (const column of requiredColumns) {
        if (existing.has(column.name)) continue;
        try {
          await db.query(`ALTER TABLE order_delivery_types ADD COLUMN \`${column.name}\` ${column.sql}`);
          existing.add(column.name);
        } catch (err) {
          if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
            existing.add(column.name);
            continue;
          }
          throw err;
        }
      }

      orderDeliveryTypeColumnsReady = requiredColumns.every((column) => existing.has(column.name));
      return orderDeliveryTypeColumnsReady;
    })()
      .catch((err) => {
        ensureOrderDeliveryTypeColumnsPromise = null;
        throw err;
      })
      .finally(() => {
        if (orderDeliveryTypeColumnsReady) {
          ensureOrderDeliveryTypeColumnsPromise = null;
        }
      });

    return ensureOrderDeliveryTypeColumnsPromise;
  }

  const listConfigs = {
    'order-statuses': {
      table: 'order_statuses',
      hasFinal: true
    },
    'order-payments': {
      table: 'order_payments',
      hasFinal: false
    },
    'order-delivery': {
      table: 'order_delivery_types',
      hasFinal: false,
      defaultField: 'is_default',
      detailFields: ['require_client_data', 'show_on_site'],
      patchFields: {
        require_client_data: (value) => (helpers.toBool(value, true) ? 1 : 0),
        show_on_site: (value) => (helpers.toBool(value, true) ? 1 : 0),
      }
    },
    'order-time-options': {
      table: 'order_time_options',
      hasFinal: false,
      hasTimeWindowSettings: true,
      detailFields: ['description', 'has_time_window', 'starts_at', 'ends_at', 'step_minutes', 'lead_minutes'],
      patchFields: {
        description: (value) => helpers.strOrNull(value),
        has_time_window: (value) => (helpers.toBool(value, false) ? 1 : 0),
        starts_at: (value) => helpers.strOrNull(value),
        ends_at: (value) => helpers.strOrNull(value),
        step_minutes: (value) => {
          const n = helpers.numOrNull(value);
          return Number.isFinite(n) ? n : 30;
        },
        lead_minutes: (value) => {
          const n = helpers.numOrNull(value);
          return Number.isFinite(n) ? n : 0;
        }
      }
    }
  };

  function getListConfig(type) {
    return listConfigs[type] || null;
  }

  async function removeTenantUploadUrl(tenantId, url) {
    const raw = helpers.strOrNull(url);
    if (!tenantId || !raw || raw.startsWith('http://') || raw.startsWith('https://')) return;
    const prefix = `/static/uploads/tenants/${tenantId}/`;
    if (!raw.startsWith(prefix)) return;
    const relative = raw.slice('/static/uploads/'.length).split(/[?#]/)[0];
    if (!relative || relative.includes('..')) return;
    const filePath = path.resolve(__dirname, '..', '..', 'static', 'uploads', relative);
    const uploadsRoot = path.resolve(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId));
    if (!filePath.startsWith(uploadsRoot + path.sep)) return;
    try {
      await fs.promises.unlink(filePath);
    } catch (err) {
      if (!err || err.code !== 'ENOENT') {
        console.warn('Failed to remove tenant upload:', err && err.message ? err.message : err);
      }
    }
  }

  function collectSiteMenuIconUrls(value) {
    let items = [];
    if (Array.isArray(value)) {
      items = value;
    } else if (typeof value === 'string' && value.trim()) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) items = parsed;
      } catch {
        items = [];
      }
    }
    const urls = new Set();
    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const url = helpers.strOrNull(item.icon_url);
      if (url) urls.add(url);
    });
    return urls;
  }

  function normalizeStoreTime(value) {
    if (value === undefined || value === null) return null;
    const asStr = String(value);
    return asStr.length > 8 ? asStr.slice(0, 8) : asStr;
  }

  function organizeStoreHours(rows) {
    const map = new Map();
    if (!Array.isArray(rows)) return map;
    rows.forEach((row) => {
      const storeId = Number(row.store_id);
      if (!Number.isFinite(storeId)) return;
      if (!map.has(storeId)) map.set(storeId, []);
      map.get(storeId).push({
        day_of_week: Number(row.day_of_week),
        opens_at: normalizeStoreTime(row.opens_at),
        closes_at: normalizeStoreTime(row.closes_at),
        is_closed: Number(row.is_closed) === 1 ? 1 : 0
      });
    });
    for (const list of map.values()) {
      list.sort((a, b) => a.day_of_week - b.day_of_week);
    }
    return map;
  }

  async function loadStoreHoursForStores(tenantId, storeIds) {
    if (!Array.isArray(storeIds)) return [];
    const ids = Array.from(new Set(storeIds.map((id) => Number(id)).filter((v) => Number.isFinite(v) && v > 0)));
    if (!ids.length) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await db.query(
      `SELECT tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed
       FROM ten_store_hours
       WHERE tenant_id=? AND store_id IN (${placeholders})
       ORDER BY store_id ASC, day_of_week ASC`,
      [tenantId, ...ids]
    );
    return rows;
  }

async function saveStoreHours(tenantId, storeId, hours) {
  if (!Number.isFinite(Number(storeId))) return;
  const entries = Array.isArray(hours) ? hours : [];
  const normalized = [];
  for (const entry of entries) {
    const day = helpers.numOrNull(entry.day_of_week);
    if (day === null || day < 0 || day > 6) continue;
    normalized.push([
      tenantId,
      storeId,
      day,
      helpers.strOrNull(entry.opens_at),
      helpers.strOrNull(entry.closes_at),
      helpers.toBool(entry.is_closed, false) ? 1 : 0
    ]);
  }
  await db.query('DELETE FROM ten_store_hours WHERE tenant_id=? AND store_id=?', [tenantId, storeId]);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => '(?,?,?,?,?,?)').join(',');
  await db.query(
    `INSERT INTO ten_store_hours (tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed)
     VALUES ${placeholders}`,
    normalized.flat()
  );
}

async function loadStoreDeliveryHoursForStores(tenantId, storeIds) {
  if (!Array.isArray(storeIds)) return [];
  const ids = Array.from(new Set(storeIds.map((id) => Number(id)).filter((v) => Number.isFinite(v) && v > 0)));
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed
     FROM ten_store_delivery_hours
     WHERE tenant_id=? AND store_id IN (${placeholders})
     ORDER BY store_id ASC, day_of_week ASC`,
    [tenantId, ...ids]
  );
  return rows;
}

async function saveStoreDeliveryHours(tenantId, storeId, hours) {
  if (!Number.isFinite(Number(storeId))) return;
  const entries = Array.isArray(hours) ? hours : [];
  const normalized = [];
  for (const entry of entries) {
    const day = helpers.numOrNull(entry.day_of_week);
    if (day === null || day < 0 || day > 6) continue;
    normalized.push([
      tenantId,
      storeId,
      day,
      helpers.strOrNull(entry.opens_at),
      helpers.strOrNull(entry.closes_at),
      helpers.toBool(entry.is_closed, false) ? 1 : 0
    ]);
  }
  await db.query('DELETE FROM ten_store_delivery_hours WHERE tenant_id=? AND store_id=?', [tenantId, storeId]);
  if (!normalized.length) return;
  const placeholders = normalized.map(() => '(?,?,?,?,?,?)').join(',');
  await db.query(
    `INSERT INTO ten_store_delivery_hours (tenant_id, store_id, day_of_week, opens_at, closes_at, is_closed)
     VALUES ${placeholders}`,
    normalized.flat()
  );
}

function normalizeStoreCoordinateValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(7)) : null;
}

function parseStoreCoordinate(value, axis) {
  const numeric = helpers.numOrNull(value);
  if (numeric === null) return { value: null };
  const limit = axis === 'lat' ? 90 : 180;
  if (numeric < -limit || numeric > limit) {
    return { error: axis === 'lat' ? 'INVALID_LAT' : 'INVALID_LNG' };
  }
  return { value: Number(Number(numeric).toFixed(7)) };
}

async function ensureStoreAddressIdentityColumns() {
  if (storeAddressIdentityColumnsReady) return true;
  if (ensureStoreAddressIdentityColumnsPromise) return ensureStoreAddressIdentityColumnsPromise;

  ensureStoreAddressIdentityColumnsPromise = (async () => {
    const [columnRows] = await db.query('SHOW COLUMNS FROM ten_stores');
    const existing = new Set((Array.isArray(columnRows) ? columnRows : []).map((row) => String(row?.Field || '').trim()).filter(Boolean));
    const requiredColumns = [
      { name: 'address_ref', sql: "VARCHAR(255) NULL AFTER address" },
      { name: 'address_raw_input', sql: "VARCHAR(512) NULL AFTER address_ref" },
      { name: 'address_normalized_display', sql: "VARCHAR(512) NULL AFTER address_raw_input" },
      { name: 'address_street', sql: "VARCHAR(255) NULL AFTER address_normalized_display" },
      { name: 'address_house', sql: "VARCHAR(128) NULL AFTER address_street" },
      { name: 'address_context_locality', sql: "VARCHAR(255) NULL AFTER address_house" },
    ];

    for (const column of requiredColumns) {
      if (existing.has(column.name)) continue;
      try {
        await db.query(`ALTER TABLE ten_stores ADD COLUMN \`${column.name}\` ${column.sql}`);
        existing.add(column.name);
      } catch (err) {
        if (String(err?.code || '') === 'ER_DUP_FIELDNAME') {
          existing.add(column.name);
          continue;
        }
        throw err;
      }
    }

    storeAddressIdentityColumnsReady = requiredColumns.every((column) => existing.has(column.name));
    return storeAddressIdentityColumnsReady;
  })()
    .catch((err) => {
      ensureStoreAddressIdentityColumnsPromise = null;
      throw err;
    })
    .finally(() => {
      if (storeAddressIdentityColumnsReady) {
        ensureStoreAddressIdentityColumnsPromise = null;
      }
    });

  return ensureStoreAddressIdentityColumnsPromise;
}

function normalizeStoreRecord(store) {
  if (!store || typeof store !== 'object') return store;
  return {
    ...store,
    lat: normalizeStoreCoordinateValue(store.lat),
    lng: normalizeStoreCoordinateValue(store.lng),
    address_ref: helpers.strOrNull(store.address_ref),
    address_raw_input: helpers.strOrNull(store.address_raw_input),
    address_normalized_display: helpers.strOrNull(store.address_normalized_display),
    address_street: helpers.strOrNull(store.address_street),
    address_house: helpers.strOrNull(store.address_house),
    address_context_locality: helpers.strOrNull(store.address_context_locality),
  };
}

function getStoreGeocodingHttpStatus(errorCode) {
  if (errorCode === 'ADDRESS_REQUIRED' || errorCode === 'CITY_REQUIRED' || errorCode === 'CITY_SELECTION_REQUIRED' || errorCode === 'HOUSE_REQUIRED' || errorCode === 'GEOCODER_NOT_CONFIGURED') return 400;
  if (errorCode === 'ADDRESS_NOT_FOUND' || errorCode === 'ADDRESS_CITY_NOT_FOUND' || errorCode === 'ADDRESS_COORDINATES_NOT_FOUND') return 400;
  if (errorCode === 'ADDRESS_SELECTION_REQUIRED') return 409;
  if (errorCode === 'ADDRESS_SERVICE_NOT_CONFIGURED' || errorCode === 'ADDRESS_SERVICE_UNAVAILABLE' || errorCode === 'ADDRESS_SERVICE_TIMEOUT') return 503;
  if (errorCode === 'ADDRESS_CONFIRMATION_REQUIRED') return 409;
  return 502;
}

function buildStoreGeocodeQuery(address, city) {
  const parts = [
    helpers.strOrNull(city),
    helpers.strOrNull(address),
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : helpers.strOrNull(address);
}

function normalizeStoreComparableStreet(value) {
  return normalizeLocalAddressText(value)
    .replace(/\b(?:СѓР»РёС†Р°|СѓР»|РїРµСЂРµСѓР»РѕРє|РїРµСЂ|РїСЂРѕСЃРїРµРєС‚|РїСЂ-РєС‚|РїСЂРѕРµР·Рґ|РїСЂ-Рґ|С€РѕСЃСЃРµ|РїР»РѕС‰Р°РґСЊ|РїР»|Р±СѓР»СЊРІР°СЂ|Р±СѓР»|РЅР°Р±РµСЂРµР¶РЅР°СЏ|РЅР°Р±|РјРёРєСЂРѕСЂР°Р№РѕРЅ|РјРєСЂ|РєРІР°СЂС‚Р°Р»|РєРІ-Р»)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStoreOrdinalAddressPair(token, nextToken) {
  return /^\d+$/.test(String(token || '').trim()) && /^(Р№|СЏ|С‹Р№|Р°СЏ)$/.test(String(nextToken || '').trim());
}

function isStoreStandaloneHouseToken(token) {
  return isAddressServiceHouseToken(token);
}

function buildStoreAddressComparableParts(value) {
  const houseToken = extractAddressServiceHouseToken(value);
  const streetText = houseToken
    ? removeAddressServiceHouseToken(value, houseToken)
    : normalizeLocalAddressText(value);
  return {
    street: normalizeStoreComparableStreet(streetText),
    house: normalizeAddressServiceHouseToken(houseToken),
  };
}

function normalizeStoreAddressComparable(value) {
  const parts = buildStoreAddressComparableParts(value);
  return [parts.street, parts.house].filter(Boolean).join('|');
}

function hasMaterialStoreNormalizationDifference(inputCity, inputAddress, normalizedCity, normalizedAddress) {
  const cityChanged = normalizeLocalAddressText(inputCity) !== normalizeLocalAddressText(normalizedCity);
  const addressChanged = normalizeStoreAddressComparable(inputAddress) !== normalizeStoreAddressComparable(normalizedAddress);
  return cityChanged || addressChanged;
}

function buildStoreNormalizationPayload(candidate) {
  return {
    city: helpers.strOrNull(candidate && candidate.city),
    address: helpers.strOrNull(candidate && candidate.address),
    address_street: helpers.strOrNull(candidate && candidate.address_street),
    address_house: helpers.strOrNull(candidate && candidate.address_house),
    resolved_city_source_key: helpers.strOrNull(candidate && candidate.resolved_city_source_key),
    selected_source_key: helpers.strOrNull(candidate && candidate.selected_source_key),
    selected_object_type: helpers.strOrNull(candidate && candidate.selected_object_type),
    selected_context_locality: helpers.strOrNull(candidate && candidate.selected_context_locality),
    typed_house_part: helpers.strOrNull(candidate && candidate.typed_house_part),
  };
}

function buildStoreSavedAddress(baseCityName, contextLocality, addressLabel) {
  const baseCity = helpers.strOrNull(baseCityName);
  const context = helpers.strOrNull(contextLocality);
  const address = helpers.strOrNull(addressLabel);
  if (!address) return null;
  if (!context) return address;
  if (normalizeLocalAddressText(baseCity) === normalizeLocalAddressText(context)) return address;
  if (normalizeLocalAddressText(address).startsWith(normalizeLocalAddressText(context))) return address;
  return `${context}, ${address}`;
}

function buildStoreStreetHouseLabel(streetValue, houseValue) {
  const street = helpers.strOrNull(streetValue);
  const house = helpers.strOrNull(houseValue);
  if (!street) return null;
  return [street, house].filter(Boolean).join(', ');
}

function isStoreAddressMapModeEnabled(config = null) {
  if (config && typeof config === 'object') {
    return Boolean(config.store_address_map_enabled);
  }
  return false;
}

function buildManualStoreLocation(address, city, options = {}) {
  const normalizedStreet = helpers.strOrNull(options.addressStreet);
  const normalizedHouse = helpers.strOrNull(options.addressHouse);
  const normalizedCity = helpers.strOrNull(city);
  const contextLocality = helpers.strOrNull(options.addressContextLocality || options.selectedContextLocality);
  const shortAddress = helpers.strOrNull(address) || buildStoreStreetHouseLabel(normalizedStreet, normalizedHouse);
  const savedAddress = buildStoreSavedAddress(normalizedCity, contextLocality || normalizedCity, shortAddress) || shortAddress;
  if (!normalizedCity) {
    return { ok: false, error: 'CITY_REQUIRED' };
  }
  if (!savedAddress) {
    return { ok: false, error: 'ADDRESS_REQUIRED' };
  }
  return {
    ok: true,
    data: {
      city: normalizedCity,
      address: savedAddress,
      lat: null,
      lng: null,
      address_ref: null,
      address_raw_input: savedAddress,
      address_normalized_display: savedAddress,
      address_street: normalizedStreet,
      address_house: normalizedHouse,
      address_context_locality: contextLocality,
      resolved_city_source_key: null,
      selected_source_key: null,
      selected_object_type: null,
      selected_context_locality: contextLocality,
      typed_house_part: helpers.strOrNull(options.typedHousePart) || normalizedHouse,
    },
  };
}

function parseAddressServiceRootCityCode(value) {
  const raw = helpers.strOrNull(value);
  if (!raw) return null;
  if (raw.startsWith('root-city:')) {
    return raw.slice('root-city:'.length) || null;
  }
  return raw;
}

async function resolveStoreLocationByAddress(address, city, options = {}) {
  const normalizedStreet = helpers.strOrNull(options.addressStreet);
  const normalizedHouse = helpers.strOrNull(options.addressHouse);
  const normalizedAddress = helpers.strOrNull(address) || buildStoreStreetHouseLabel(normalizedStreet, normalizedHouse);
  const normalizedCity = helpers.strOrNull(city);
  if (!normalizedCity) {
    return { ok: false, error: 'CITY_SELECTION_REQUIRED' };
  }
  if (!normalizedAddress) {
    return { ok: false, error: 'ADDRESS_REQUIRED' };
  }

  if (isAddressServiceConfigured()) {
    const rootCityCode = parseAddressServiceRootCityCode(options.resolvedCitySourceKey);
    const serviceResult = await resolveAddressThroughService({
      city: normalizedCity,
      city_code: rootCityCode,
      address: normalizedAddress,
      address_street: normalizedStreet,
      address_house: normalizedHouse,
      selected_source_key: helpers.strOrNull(options.selectedSourceKey),
      selected_object_type: helpers.strOrNull(options.selectedObjectType),
      selected_context_locality: helpers.strOrNull(options.selectedContextLocality),
      typed_house_part: helpers.strOrNull(options.typedHousePart),
      raw_input: normalizedAddress,
      confirm_normalized: helpers.toBool(options.confirmNormalized, false),
    });
    if (!serviceResult || !serviceResult.ok) {
      return {
        ok: false,
        error: serviceResult && serviceResult.error ? serviceResult.error : 'ADDRESS_SERVICE_UNAVAILABLE',
      };
    }
    if (serviceResult.data && serviceResult.data.needs_choice) {
      const candidates = Array.isArray(serviceResult.data.candidates) ? serviceResult.data.candidates : [];
      if (candidates.length === 1) {
        const candidate = candidates[0];
        return {
          ok: false,
          error: 'ADDRESS_CONFIRMATION_REQUIRED',
          data: {
            normalization: {
              city: normalizedCity,
              address: helpers.strOrNull(candidate && (candidate.display || candidate.value || candidate.label)),
              address_street: normalizedStreet,
              address_house: normalizedHouse,
              resolved_city_source_key: helpers.strOrNull(options.resolvedCitySourceKey),
              selected_source_key: helpers.strOrNull(candidate && candidate.source_key),
              selected_object_type: helpers.strOrNull(candidate && candidate.object_type),
              selected_context_locality: helpers.strOrNull(candidate && (candidate.context_display || candidate.context_locality || candidate.city_name)),
              typed_house_part: helpers.strOrNull(options.typedHousePart),
            },
          },
        };
      }
      return { ok: false, error: 'ADDRESS_SELECTION_REQUIRED' };
    }

    const serviceData = serviceResult.data || {};
    const resolvedDisplay = helpers.strOrNull(serviceData.normalized_display) || normalizedAddress;
    const contextLocality = helpers.strOrNull(serviceData.context_display) || normalizedCity;
    const resolvedSelectedSourceKey = helpers.strOrNull(options.selectedSourceKey)
      || helpers.strOrNull(serviceData.selected_source_key)
      || helpers.strOrNull(serviceData.address_ref);
    const resolvedSelectedObjectType = helpers.strOrNull(options.selectedObjectType)
      || helpers.strOrNull(serviceData.selected_object_type)
      || 'address';
    const resolvedTypedHousePart = helpers.strOrNull(options.typedHousePart)
      || helpers.strOrNull(serviceData.typed_house_part);
    const resolvedStreet = helpers.strOrNull(serviceData.street_display) || normalizedStreet;
    const resolvedHouse = helpers.strOrNull(serviceData.house_number) || normalizedHouse || resolvedTypedHousePart;
    let lat = normalizeStoreCoordinateValue(serviceData.lat);
    let lng = normalizeStoreCoordinateValue(serviceData.lng);
    if (lat === null || lng === null) {
      const serviceQuery = buildStoreGeocodeQuery(resolvedDisplay, contextLocality || normalizedCity);
      if (serviceQuery) {
        const geocode = await geocodeStoreAddress(serviceQuery, { sourceState: options.mapConfig || null });
        if (geocode && geocode.ok && geocode.data && geocode.data.item) {
          lat = normalizeStoreCoordinateValue(geocode.data.item.lat);
          lng = normalizeStoreCoordinateValue(geocode.data.item.lng);
        }
      }
    }
    return {
      ok: true,
      data: {
        city: normalizedCity,
        address: buildStoreSavedAddress(normalizedCity, contextLocality, resolvedDisplay) || resolvedDisplay,
        lat,
        lng,
        address_ref: helpers.strOrNull(serviceData.address_ref),
        address_raw_input: normalizedAddress,
        address_normalized_display: resolvedDisplay,
        address_street: resolvedStreet,
        address_house: resolvedHouse,
        address_context_locality: contextLocality,
        resolved_city_source_key: helpers.strOrNull(options.resolvedCitySourceKey),
        selected_source_key: resolvedSelectedSourceKey,
        selected_object_type: resolvedSelectedObjectType,
        selected_context_locality: contextLocality,
        typed_house_part: resolvedTypedHousePart,
      },
    };
  }

  const resolvedCity = await resolveLocalityByInput(normalizedCity, {
    sourceKey: helpers.strOrNull(options.resolvedCitySourceKey),
    rootOnly: true,
  });
  if (!resolvedCity) {
    return { ok: false, error: 'CITY_SELECTION_REQUIRED' };
  }

  const selectedSourceKey = helpers.strOrNull(options.selectedSourceKey);
  const selectedObjectType = helpers.strOrNull(options.selectedObjectType);
  const selectedContextLocality = helpers.strOrNull(options.selectedContextLocality);
  const typedHousePart = helpers.strOrNull(options.typedHousePart);
  const confirmNormalized = helpers.toBool(options.confirmNormalized, false);
  if (
    selectedObjectType === 'context-locality' &&
    normalizeLocalAddressText(normalizedAddress) === normalizeLocalAddressText(selectedContextLocality)
  ) {
    return { ok: false, error: 'ADDRESS_REQUIRED' };
  }
  let selectedRow = null;
  if (selectedSourceKey) {
    selectedRow = await getLocalAddressIndexRowBySourceKey(selectedSourceKey);
  }

  const createCandidate = (addressLabel, config = {}) => {
    const actualLocality = helpers.strOrNull(config.actualLocality || selectedContextLocality || resolvedCity.name) || resolvedCity.name;
    const shortAddress = helpers.strOrNull(addressLabel);
    const savedAddress = buildStoreSavedAddress(resolvedCity.name, actualLocality, shortAddress);
    return {
      city: resolvedCity.name,
      address: savedAddress,
      address_ref: helpers.strOrNull(config.selectedSourceKey),
      address_raw_input: normalizedAddress,
      address_normalized_display: savedAddress || shortAddress,
      address_street: helpers.strOrNull(config.addressStreet || normalizedStreet),
      address_house: helpers.strOrNull(config.addressHouse || normalizedHouse || config.typedHousePart),
      address_context_locality: helpers.strOrNull(actualLocality),
      lat: config.lat === undefined ? null : normalizeStoreCoordinateValue(config.lat),
      lng: config.lng === undefined ? null : normalizeStoreCoordinateValue(config.lng),
      is_exact_address: helpers.toBool(config.isExactAddress, false),
      resolved_city_source_key: helpers.strOrNull(resolvedCity.source_key),
      selected_source_key: helpers.strOrNull(config.selectedSourceKey),
      selected_object_type: helpers.strOrNull(config.selectedObjectType),
      selected_context_locality: helpers.strOrNull(actualLocality),
      typed_house_part: helpers.strOrNull(config.typedHousePart),
      lookup_city: actualLocality,
      lookup_address: shortAddress,
    };
  };

  let candidate = null;
  if (selectedRow && selectedObjectType === 'address' && String(selectedRow.object_type || '').trim() === 'address') {
    candidate = createCandidate(helpers.strOrNull(selectedRow.label), {
      actualLocality: helpers.strOrNull(selectedRow.locality_name),
      lat: selectedRow.lat,
      lng: selectedRow.lng,
      isExactAddress: true,
      selectedSourceKey: helpers.strOrNull(selectedRow.source_key),
      selectedObjectType: 'address',
    });
  } else if (
    selectedRow
    && (selectedObjectType === 'street' || selectedObjectType === 'typed-address')
    && String(selectedRow.object_type || '').trim() === 'street'
  ) {
    const streetLabel = helpers.strOrNull(selectedRow.label) || helpers.strOrNull(selectedRow.street_name);
    const normalizedStreetInput = normalizeLocalAddressText(streetLabel);
    const normalizedAddressInput = normalizeLocalAddressText(normalizedAddress);
    let housePart = typedHousePart || normalizedHouse || normalizedAddress;
    if (normalizedStreetInput && normalizedAddressInput.startsWith(normalizedStreetInput)) {
      housePart = normalizedAddress.slice(streetLabel.length).replace(/^[,\s]+/, '').trim();
    }
    if (!housePart) {
      return { ok: false, error: 'HOUSE_REQUIRED' };
    }
    const localSearch = await searchLocalAddressSuggest('house', housePart, {
      city: resolvedCity.name,
      citySourceKey: helpers.strOrNull(resolvedCity.source_key),
      selectedSourceKey: helpers.strOrNull(selectedRow.source_key),
      limit: 12,
    });
    if (localSearch && localSearch.ok) {
      const normalizedHousePart = normalizeAddressServiceHouseToken(housePart);
      const exactAddressItems = (Array.isArray(localSearch.data && localSearch.data.items) ? localSearch.data.items : [])
        .filter((item) => (
          String(item && item.object_type || '').trim() === 'address'
          && normalizeAddressServiceHouseToken(item && item.house_number) === normalizedHousePart
        ));
      if (exactAddressItems.length > 1) {
        return { ok: false, error: 'ADDRESS_SELECTION_REQUIRED' };
      }
      const exactAddressItem = exactAddressItems[0] || null;
      if (exactAddressItem) {
        candidate = createCandidate([streetLabel, helpers.strOrNull(exactAddressItem.house_number)].filter(Boolean).join(', '), {
          actualLocality: helpers.strOrNull(exactAddressItem.context_locality || exactAddressItem.city_name),
          addressStreet: streetLabel,
          addressHouse: helpers.strOrNull(exactAddressItem.house_number),
          lat: exactAddressItem.lat,
          lng: exactAddressItem.lng,
          isExactAddress: true,
          selectedSourceKey: helpers.strOrNull(exactAddressItem.source_key),
          selectedObjectType: 'address',
        });
      } else {
        candidate = createCandidate([streetLabel, housePart].filter(Boolean).join(', '), {
          actualLocality: helpers.strOrNull(selectedRow.locality_name),
          addressStreet: streetLabel,
          addressHouse: helpers.strOrNull(housePart),
          selectedSourceKey: helpers.strOrNull(selectedRow.source_key),
          selectedObjectType: 'street',
          typedHousePart: helpers.strOrNull(housePart),
        });
      }
    }
  }

  if (!candidate) {
    const localSearch = await searchLocalAddressSuggest('address', normalizedAddress, {
      city: resolvedCity.name,
      citySourceKey: resolvedCity.source_key,
      limit: 12,
    });
    if (localSearch && localSearch.ok) {
      const normalizedTypedHouse = normalizeAddressServiceHouseToken(extractAddressServiceHouseToken(normalizedAddress));
      const exactAddressItems = (Array.isArray(localSearch.data && localSearch.data.items) ? localSearch.data.items : [])
        .filter((item) => (
          String(item && item.object_type || '').trim() === 'address'
          && (!normalizedTypedHouse || normalizeAddressServiceHouseToken(item && item.house_number) === normalizedTypedHouse)
        ));
      if (exactAddressItems.length > 1) {
        return { ok: false, error: 'ADDRESS_SELECTION_REQUIRED' };
      }
      const exactAddressItem = exactAddressItems[0] || null;
      if (exactAddressItem) {
        candidate = createCandidate(helpers.strOrNull(exactAddressItem.value || exactAddressItem.label), {
          actualLocality: helpers.strOrNull(exactAddressItem.context_locality || exactAddressItem.city_name),
          lat: exactAddressItem.lat,
          lng: exactAddressItem.lng,
          isExactAddress: true,
          selectedSourceKey: helpers.strOrNull(exactAddressItem.source_key),
          selectedObjectType: 'address',
        });
      }
    }
  }

  if (!candidate) {
    candidate = createCandidate(normalizedAddress, {
      actualLocality: selectedContextLocality || resolvedCity.name,
      selectedObjectType: null,
    });
  }

  const comparableInputAddress = buildStoreSavedAddress(
    resolvedCity.name,
    selectedContextLocality || (selectedRow && helpers.strOrNull(selectedRow.locality_name)),
    normalizedAddress
  ) || normalizedAddress;

  if (!confirmNormalized && hasMaterialStoreNormalizationDifference(normalizedCity, comparableInputAddress, candidate.city, candidate.address)) {
    return {
      ok: false,
      error: 'ADDRESS_CONFIRMATION_REQUIRED',
      data: {
        normalization: buildStoreNormalizationPayload(candidate),
      },
    };
  }

  if (candidate.lat !== null && candidate.lng !== null) {
    return {
      ok: true,
      data: {
        city: candidate.city,
        address: candidate.address,
        address_ref: candidate.address_ref,
        address_raw_input: candidate.address_raw_input,
        address_normalized_display: candidate.address_normalized_display,
        lat: candidate.lat,
        lng: candidate.lng,
        resolved_city_source_key: candidate.resolved_city_source_key,
        selected_source_key: candidate.selected_source_key,
        selected_object_type: candidate.selected_object_type,
        selected_context_locality: candidate.selected_context_locality,
        typed_house_part: candidate.typed_house_part,
      },
    };
  }

  const query = buildStoreGeocodeQuery(candidate.lookup_address || candidate.address, candidate.lookup_city || candidate.city);
  if (!query) {
    return { ok: false, error: 'ADDRESS_REQUIRED' };
  }
  const geocode = await geocodeStoreAddress(query, { sourceState: options.mapConfig || null });
  if (!geocode || !geocode.ok || !geocode.data || !geocode.data.item) {
    return { ok: false, error: geocode && geocode.error ? geocode.error : 'GEOCODER_UPSTREAM_ERROR' };
  }
  const item = geocode.data.item;
  const cityName = helpers.strOrNull(item.city_name);
  const lat = normalizeStoreCoordinateValue(item.lat);
  const lng = normalizeStoreCoordinateValue(item.lng);
  if (!cityName) return { ok: false, error: 'ADDRESS_CITY_NOT_FOUND' };
  if (lat === null || lng === null) return { ok: false, error: 'ADDRESS_COORDINATES_NOT_FOUND' };
  const finalizedCandidate = candidate && candidate.is_exact_address
    ? candidate
    : {
      ...candidate,
      city: resolvedCity.name,
      address: buildStoreSavedAddress(
        resolvedCity.name,
        candidate.selected_context_locality || cityName,
        candidate.lookup_address || candidate.address || normalizedAddress
      ) || candidate.address,
    };
  if (
    !confirmNormalized &&
    finalizedCandidate &&
    hasMaterialStoreNormalizationDifference(normalizedCity, comparableInputAddress, finalizedCandidate.city, finalizedCandidate.address)
  ) {
    return {
      ok: false,
      error: 'ADDRESS_CONFIRMATION_REQUIRED',
      data: {
        normalization: buildStoreNormalizationPayload(finalizedCandidate),
      },
    };
  }
  return {
    ok: true,
    data: {
      city: finalizedCandidate.city || cityName,
      address: finalizedCandidate.address || normalizedAddress,
      address_ref: finalizedCandidate.address_ref,
      address_raw_input: finalizedCandidate.address_raw_input || normalizedAddress,
      address_normalized_display: finalizedCandidate.address_normalized_display || finalizedCandidate.address || normalizedAddress,
      address_street: finalizedCandidate.address_street || normalizedStreet,
      address_house: finalizedCandidate.address_house || normalizedHouse || finalizedCandidate.typed_house_part || null,
      address_context_locality: finalizedCandidate.address_context_locality || finalizedCandidate.selected_context_locality || null,
      lat,
      lng,
      resolved_city_source_key: finalizedCandidate.resolved_city_source_key,
      selected_source_key: finalizedCandidate.selected_source_key,
      selected_object_type: finalizedCandidate.selected_object_type,
      selected_context_locality: finalizedCandidate.selected_context_locality,
      typed_house_part: finalizedCandidate.typed_house_part,
    },
  };
}

async function fetchStoreWithHours(tenantId, storeId) {
  await ensureStoreAddressIdentityColumns();
  const [rows] = await db.query(
    `SELECT tenant_id, id, code, name, address, address_ref, address_raw_input, address_normalized_display, address_street, address_house, address_context_locality, city, floor, apartment, cabinet, address_comment, lat, lng, phone, timezone, is_active, use_global_hours, use_delivery_hours, created_at, updated_at
       FROM ten_stores
       WHERE tenant_id=? AND id=? LIMIT 1`,
    [tenantId, storeId]
  );
  if (!rows.length) return null;
  const store = normalizeStoreRecord(rows[0]);
  const hoursRows = await loadStoreHoursForStores(tenantId, [storeId]);
  const hoursMap = organizeStoreHours(hoursRows);
  store.hours = hoursMap.get(storeId) || [];
  const deliveryRows = await loadStoreDeliveryHoursForStores(tenantId, [storeId]);
  const deliveryMap = organizeStoreHours(deliveryRows);
  store.delivery_hours = deliveryMap.get(storeId) || [];
  store.use_global_hours = Number(store.use_global_hours) === 1 ? 1 : 0;
  store.use_delivery_hours = Number(store.use_delivery_hours) === 1 ? 1 : 0;
  return store;
}

  // ------------------------------
  // Upload: tenant assets (logo/favicon)
  // POST /api/admin/tenant/upload
  // form-data: { file, field }
  // ------------------------------
  const tenantAssetStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId));
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const tenantAssetUpload = multer({
    storage: tenantAssetStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/upload', tenantAssetUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const field = helpers.strOrNull(req.body.field);
      const file = req.file;

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });

      const allowed = new Set([
        'logo_light_url',
        'logo_dark_url',
        'favicon_light_url',
        'favicon_dark_url',
        'apple_touch_icon_url',
        'android_icon_url',
        'site_menu_item_icon',
        'bonus_modal_image'
      ]);
      if (!field || !allowed.has(field)) {
        return res.status(400).json({ ok: false, error: 'FIELD_INVALID' });
      }

      // РЎРѕР·РґР°С‘Рј WebP-РІР°СЂРёР°РЅС‚ Р»РѕРіРѕС‚РёРїР° / РёРєРѕРЅРєРё (РѕСЂРёРіРёРЅР°Р» РѕСЃС‚Р°РІР»СЏРµРј РєР°Рє fallback)
      await helpers.ensureWebpVariant(
        file.path || path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), file.filename)
      );

      const url = `/static/uploads/tenants/${tenantId}/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;

      if (field === 'site_menu_item_icon' || field === 'bonus_modal_image') {
        const [rows] = await db.query(
          'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        return res.json({ ok: true, url, tenant: await buildTenantResponse(rows[0] || null, req) });
      }

      await db.query(
        `UPDATE ten_tenants SET ${field}=? WHERE id=?`,
        [url, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, url, tenant: serializeTenantForClient(rows[0] || null) });
    } catch (err) {
      console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё tenant Р°СЃСЃРµС‚Р°:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Upload: Р·РІСѓРєРё СѓРІРµРґРѕРјР»РµРЅРёР№ (РјРёРЅРёРјР°Р»СЊРЅС‹Рµ РѕРіСЂР°РЅРёС‡РµРЅРёСЏ РїРѕ С„РѕСЂРјР°С‚Сѓ)
  // POST /api/admin/tenant/upload-sound
  // form-data: { file, field }  field: sound_new_order_url | sound_order_cancelled_url
  // ------------------------------
  const tenantSoundStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'sounds');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = (path.extname(file.originalname || '') || '.mp3').toLowerCase();
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const tenantSoundUpload = multer({
    storage: tenantSoundStorage,
    limits: { files: 1, fileSize: 15 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const type = (file.mimetype || '').toLowerCase();
      const isAudio = type.startsWith('audio/');
      const ext = (path.extname(file.originalname || '') || '').toLowerCase();
      const audioExt = new Set(['.mp3', '.wav', '.ogg', '.webm', '.m4a', '.aac']);
      cb(isAudio || audioExt.has(ext) ? null : new Error('ONLY_AUDIO'), isAudio || audioExt.has(ext));
    }
  });

  router.post('/upload-sound', tenantSoundUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const field = helpers.strOrNull(req.body.field);
      const file = req.file;

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });

      const allowed = new Set([
        'sound_new_order_url',
        'sound_order_cancelled_url',
        'sound_new_message_url',
        'print_sound_new_order_url',
        'print_sound_new_message_url'
      ]);
      if (!field || !allowed.has(field)) {
        return res.status(400).json({ ok: false, error: 'FIELD_INVALID' });
      }
      const tenantField = field === 'print_sound_new_order_url'
        ? 'sound_new_order_url'
        : field === 'print_sound_new_message_url'
          ? 'sound_new_message_url'
          : field;

      const url = `/static/uploads/tenants/${tenantId}/sounds/${file.filename}`;

      await db.query(
        `UPDATE ten_tenants SET ${tenantField}=? WHERE id=?`,
        [url, tenantId]
      );

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      res.json({ ok: true, url, tenant: serializeTenantForClient(rows[0] || null) });
    } catch (err) {
      console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р·РІСѓРєР°:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ РљРѕРјРїР°РЅРёСЏ (tenant) РґР»СЏ С‚РµРєСѓС‰РµРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
   */
  router.get('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      return res.json({ ok: true, tenant: await buildTenantResponse(rows[0], req) });

      const tenant = rows[0];

      // Р’С‹С‡РёСЃР»СЏРµРј СЃСЃС‹Р»РєСѓ РґР»СЏ Telegram mini app Р±РµР· С…СЂР°РЅРµРЅРёСЏ РІ Р‘Р”.
      // РџРѕРґСЃС‚СЂР°РёРІР°РµРјСЃСЏ РїРѕРґ С‚РµРєСѓС‰РёР№ РґРѕРјРµРЅ Рё РїСЂРѕС‚РѕРєРѕР» (localhost, markin-me.ru Рё С‚.Рї.).
      const forwardedProto = req.headers['x-forwarded-proto'];
      const forwardedHost = req.headers['x-forwarded-host'];

      function firstHeaderValue(raw, fallback = '') {
        if (!raw) return fallback;
        if (Array.isArray(raw)) return String(raw[0]).trim();
        return String(raw).split(',')[0].trim();
      }

      const protocol = firstHeaderValue(forwardedProto, req.protocol || 'https');
      const hostHeader = firstHeaderValue(forwardedHost, req.get('host') || 'localhost:3000');
      const baseUrl = `${protocol}://${hostHeader}`;
      const telegramMiniAppUrl = `${baseUrl}/tg-app?tenant_id=${tenant.id}`;
      const maxMiniAppUrl = `${baseUrl}/max-app?tenant_id=${tenant.id}`;

      res.json({
        ok: true,
        tenant: serializeTenantForClient(tenant, {
          telegram_mini_app_url: telegramMiniAppUrl,
          max_mini_app_url: maxMiniAppUrl
        })
      });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ tenant РїСЂРѕС„РёР»СЏ:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/map-provider-accounts', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      await ensureTenantMapProviderColumns();

      const tenantRow = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
      if (!tenantRow) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      return res.json({
        ok: true,
        ...buildTenantMapProviderResponse(tenantRow),
      });
    } catch (err) {
      console.error('Map provider accounts load error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/map-provider-config', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      await ensureTenantMapProviderColumns();

      const tenantRow = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
      if (!tenantRow) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      return res.json({
        ok: true,
        data: buildTenantResolvedMapConfigResponse(tenantRow),
      });
    } catch (err) {
      console.error('Tenant map provider config load error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/map-provider-config', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const saveResult = await saveTenantMapConfig(db, tenantId, req.body || {});
      if (!saveResult.ok) {
        const status = saveResult.error === 'TENANT_NOT_FOUND' ? 404 : 400;
        return res.status(status).json({ ok: false, error: saveResult.error || 'BAD_REQUEST' });
      }

      return res.json({
        ok: true,
        data: buildTenantResolvedMapConfigResponse(saveResult.row),
      });
    } catch (err) {
      console.error('Tenant map provider config save error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/map-provider-accounts', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      await ensureTenantMapProviderColumns();

      if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'items')) {
        return res.status(400).json({ ok: false, error: 'MAP_PROVIDER_ITEMS_REQUIRED' });
      }

      const tenantRow = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
      if (!tenantRow) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const mergedItems = mergeTenantMapProviderAccountsWithExisting(
        (req.body || {}).items,
        tenantRow.map_provider_accounts_json
      );
      const sanitized = sanitizeTenantMapProviderAccounts(mergedItems);
      if (!sanitized.ok) {
        return res.status(400).json({ ok: false, error: sanitized.error || 'BAD_MAP_PROVIDER_ACCOUNTS' });
      }

      const serializedItems = sanitized.items.length ? JSON.stringify(sanitized.items) : null;
      await db.query(
        'UPDATE ten_tenants SET map_provider_accounts_json=? WHERE id=?',
        [serializedItems, tenantId]
      );

      return res.json({
        ok: true,
        ...buildTenantMapProviderResponse({ ...tenantRow, map_provider_accounts_json: serializedItems }),
      });
    } catch (err) {
      console.error('Map provider accounts save error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/map-provider-accounts/:accountId/reveal', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const requestedId = normalizeMapProviderAccountId(req.params.accountId, 0);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      await ensureTenantMapProviderColumns();

      const [rows] = await db.query(
        'SELECT id, map_provider_accounts_json FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const sanitized = sanitizeTenantMapProviderAccounts(rows[0].map_provider_accounts_json);
      if (!sanitized.ok) {
        return res.status(404).json({ ok: false, error: 'MAP_PROVIDER_ACCOUNT_NOT_FOUND' });
      }

      const item = sanitized.items.find((entry) => String(entry.id || '') === requestedId);
      if (!item) {
        return res.status(404).json({ ok: false, error: 'MAP_PROVIDER_ACCOUNT_NOT_FOUND' });
      }

      return res.json({
        ok: true,
        item: {
          id: item.id,
          api_key: item.api_key,
          login: item.login,
          password: item.password,
          is_active: item.is_active === true,
        },
      });
    } catch (err) {
      console.error('Map provider account reveal error:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function sanitizeGeneralDeliveryPriceTiers(rawTiers) {
    return sanitizeDeliveryPriceTiers(rawTiers, {
      requiredError: 'DELIVERY_SETTING_PRICE_TIERS_REQUIRED',
      limitError: 'DELIVERY_SETTING_PRICE_TIERS_LIMIT',
    });
  }

  function serializeDeliverySettingRow(row, extras = {}) {
    const source = row && typeof row === 'object' ? row : {};
    const storeIds = Array.isArray(extras.store_ids)
      ? extras.store_ids.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0)
      : [];
    const tiers = normalizeDeliveryPriceTiersForOutput(extras.price_tiers);
    const priceTiers = tiers.length ? tiers : buildLegacyDeliveryPriceTiers(source);
    const legacy = deriveLegacyDeliveryFieldsFromTiers(priceTiers);
    const defaultStoreId = source.default_store_id == null ? null : Number(source.default_store_id);
    return {
      id: Number(source.id || 0),
      tenant_id: Number(source.tenant_id || 0),
      name: String(source.name || '').trim(),
      eta_minutes: source.eta_minutes == null ? null : Number(source.eta_minutes),
      delivery_cost: Number(legacy.delivery_cost || 0),
      min_order_amount: Number(legacy.min_order_amount || 0),
      free_delivery_from: legacy.free_delivery_from != null ? Number(legacy.free_delivery_from) : null,
      default_store_id: Number.isFinite(defaultStoreId) && defaultStoreId > 0 ? defaultStoreId : null,
      is_active: Number(source.is_active) === 1 ? 1 : 0,
      created_at: source.created_at || null,
      updated_at: source.updated_at || null,
      store_ids: storeIds,
      price_tiers: priceTiers,
    };
  }

  async function loadDeliverySettingsForTenant(tenantId, settingId = null) {
    const params = [tenantId];
    const whereParts = ['tenant_id=?'];
    if (settingId != null) {
      whereParts.push('id=?');
      params.push(settingId);
    }

    let rows = [];
    let hasEtaColumn = true;
    try {
      const [settingsRows] = await db.query(
        `SELECT id, tenant_id, name, eta_minutes, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE ${whereParts.join(' AND ')}
         ORDER BY id ASC`,
        params
      );
      rows = Array.isArray(settingsRows) ? settingsRows : [];
    } catch (error) {
      if (String(error && error.code || '') !== 'ER_BAD_FIELD_ERROR') throw error;
      hasEtaColumn = false;
      const [settingsRows] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE ${whereParts.join(' AND ')}
         ORDER BY id ASC`,
        params
      );
      rows = Array.isArray(settingsRows) ? settingsRows : [];
    }

    const settingIds = rows
      .map((row) => Number(row && row.id))
      .filter((value) => Number.isFinite(value) && value > 0);
    const storeMap = new Map();
    const tiersMap = new Map();

    if (settingIds.length) {
      const placeholders = settingIds.map(() => '?').join(',');
      const [links] = await db.query(
        `SELECT delivery_setting_id, store_id
         FROM ten_delivery_settings_stores
         WHERE tenant_id=? AND delivery_setting_id IN (${placeholders})`,
        [tenantId, ...settingIds]
      );
      (Array.isArray(links) ? links : []).forEach((link) => {
        const key = Number(link && link.delivery_setting_id);
        const storeId = Number(link && link.store_id);
        if (!Number.isFinite(key) || !Number.isFinite(storeId) || storeId <= 0) return;
        if (!storeMap.has(key)) storeMap.set(key, []);
        storeMap.get(key).push(storeId);
      });

      try {
        const [tierRows] = await db.query(
          `SELECT delivery_setting_id, min_order_amount, delivery_cost, sort_order
           FROM \`${deliverySettingPriceTiersTable}\`
           WHERE tenant_id=? AND delivery_setting_id IN (${placeholders})
           ORDER BY delivery_setting_id ASC, sort_order ASC, id ASC`,
          [tenantId, ...settingIds]
        );
        (Array.isArray(tierRows) ? tierRows : []).forEach((tier) => {
          const key = Number(tier && tier.delivery_setting_id);
          if (!Number.isFinite(key)) return;
          if (!tiersMap.has(key)) tiersMap.set(key, []);
          tiersMap.get(key).push({
            min_order_amount: tier.min_order_amount,
            delivery_cost: tier.delivery_cost,
            sort_order: tier.sort_order,
          });
        });
      } catch (error) {
        if (String(error && error.code || '') !== 'ER_NO_SUCH_TABLE') throw error;
      }
    }

    return rows.map((row) => serializeDeliverySettingRow(
      hasEtaColumn ? row : { ...row, eta_minutes: null },
      {
        store_ids: storeMap.get(Number(row && row.id)) || [],
        price_tiers: tiersMap.get(Number(row && row.id)) || [],
      }
    ));
  }

  function buildDeliverySettingPayload(body, current = null) {
    const source = body && typeof body === 'object' ? body : {};
    const snapshot = current && typeof current === 'object' ? current : null;
    const name = source.name !== undefined ? helpers.strOrNull(source.name) : (snapshot ? snapshot.name : null);
    if (!name) return { ok: false, error: 'NAME_REQUIRED' };

    const storeIds = source.store_ids !== undefined
      ? (Array.isArray(source.store_ids)
        ? Array.from(new Set(source.store_ids.map(Number).filter((value) => Number.isFinite(value) && value > 0)))
        : [])
      : (snapshot && Array.isArray(snapshot.store_ids) ? snapshot.store_ids.slice() : []);

    let defaultStoreId = source.default_store_id !== undefined
      ? helpers.numOrNull(source.default_store_id)
      : (snapshot ? snapshot.default_store_id : null);
    if (defaultStoreId != null && storeIds.length && !storeIds.includes(defaultStoreId)) {
      defaultStoreId = null;
    }

    let tiers = null;
    if (source.price_tiers !== undefined) {
      const tiersResult = sanitizeGeneralDeliveryPriceTiers(source.price_tiers);
      if (!tiersResult.ok) return tiersResult;
      tiers = tiersResult.items;
    } else if (
      source.delivery_cost !== undefined
      || source.min_order_amount !== undefined
      || source.free_delivery_from !== undefined
    ) {
      tiers = buildLegacyDeliveryPriceTiers({
        delivery_cost: source.delivery_cost !== undefined ? source.delivery_cost : (snapshot ? snapshot.delivery_cost : 0),
        min_order_amount: source.min_order_amount !== undefined ? source.min_order_amount : (snapshot ? snapshot.min_order_amount : 0),
        free_delivery_from: source.free_delivery_from !== undefined ? source.free_delivery_from : (snapshot ? snapshot.free_delivery_from : null),
      });
    } else {
      tiers = normalizeDeliveryPriceTiersForOutput(snapshot && snapshot.price_tiers);
    }

    if (!Array.isArray(tiers) || !tiers.length) {
      tiers = buildLegacyDeliveryPriceTiers({ delivery_cost: 0, min_order_amount: 0, free_delivery_from: null });
    }

    const legacy = deriveLegacyDeliveryFieldsFromTiers(tiers);
    return {
      ok: true,
      item: {
        name,
        eta_minutes: source.eta_minutes !== undefined
          ? normalizeDeliveryEtaMinutesShared(source.eta_minutes)
          : (snapshot ? snapshot.eta_minutes : null),
        delivery_cost: Number(legacy.delivery_cost || 0),
        min_order_amount: Number(legacy.min_order_amount || 0),
        free_delivery_from: legacy.free_delivery_from != null ? Number(legacy.free_delivery_from) : null,
        is_active: source.is_active !== undefined
          ? (helpers.toBool(source.is_active, true) ? 1 : 0)
          : (snapshot && Number(snapshot.is_active) === 1 ? 1 : 0),
        store_ids: storeIds,
        default_store_id: defaultStoreId,
        price_tiers: tiers,
      },
    };
  }

  async function replaceDeliverySettingStores(tenantId, settingId, storeIds) {
    await db.query(
      'DELETE FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
      [tenantId, settingId]
    );
    if (!Array.isArray(storeIds) || !storeIds.length) return;
    const linkValues = storeIds.map((storeId) => [settingId, storeId, tenantId]);
    const linkPlaceholders = linkValues.map(() => '(?, ?, ?)').join(',');
    await db.query(
      `INSERT INTO ten_delivery_settings_stores (delivery_setting_id, store_id, tenant_id) VALUES ${linkPlaceholders}`,
      linkValues.flat()
    );
  }

  async function replaceDeliverySettingPriceTiers(tenantId, settingId, priceTiers) {
    await db.query(
      `DELETE FROM \`${deliverySettingPriceTiersTable}\` WHERE tenant_id=? AND delivery_setting_id=?`,
      [tenantId, settingId]
    );
    if (!Array.isArray(priceTiers) || !priceTiers.length) return;
    const tierValues = priceTiers.map((tier) => ([
      settingId,
      tenantId,
      Number(tier.min_order_amount || 0),
      Number(tier.delivery_cost || 0),
      Number(tier.sort_order || 0),
    ]));
    const tierPlaceholders = tierValues.map(() => '(?, ?, ?, ?, ?)').join(', ');
    await db.query(
      `INSERT INTO \`${deliverySettingPriceTiersTable}\` (delivery_setting_id, tenant_id, min_order_amount, delivery_cost, sort_order) VALUES ${tierPlaceholders}`,
      tierValues.flat()
    );
  }

  /**
   * PUT /api/admin/tenant
   * РћР±РЅРѕРІР»РµРЅРёРµ РѕС‚РґРµР»СЊРЅС‹С… РїРѕР»РµР№ РїСЂРѕС„РёР»СЏ (РїРѕРєР° С‚РѕР»СЊРєРѕ timezone)
   * body: { timezone }
   */
  router.put('/', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const timezone = helpers.strOrNull(req.body.timezone);
      const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
      const email = req.body.email !== undefined ? helpers.strOrNull(req.body.email) : undefined;
      const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
      const logoLight = req.body.logo_light_url !== undefined ? helpers.strOrNull(req.body.logo_light_url) : undefined;
      const logoDark = req.body.logo_dark_url !== undefined ? helpers.strOrNull(req.body.logo_dark_url) : undefined;
      const faviconLight = req.body.favicon_light_url !== undefined ? helpers.strOrNull(req.body.favicon_light_url) : undefined;
      const faviconDark = req.body.favicon_dark_url !== undefined ? helpers.strOrNull(req.body.favicon_dark_url) : undefined;
      const appleTouchIcon = req.body.apple_touch_icon_url !== undefined ? helpers.strOrNull(req.body.apple_touch_icon_url) : undefined;
      const androidIcon = req.body.android_icon_url !== undefined ? helpers.strOrNull(req.body.android_icon_url) : undefined;
      const roundingModeRaw = req.body.price_rounding_mode !== undefined ? helpers.strOrNull(req.body.price_rounding_mode) : undefined;
      const roundingPrecisionRaw = req.body.price_rounding_precision !== undefined ? helpers.numOrNull(req.body.price_rounding_precision) : undefined;
      const stockDeductModeRaw = req.body.order_stock_deduct_mode !== undefined ? helpers.strOrNull(req.body.order_stock_deduct_mode) : undefined;
      const stockDeductStatusIdRaw = req.body.order_stock_deduct_status_id !== undefined ? helpers.numOrNull(req.body.order_stock_deduct_status_id) : undefined;
      const siteName = req.body.site_name !== undefined ? helpers.strOrNull(req.body.site_name) : undefined;
      const siteDescription = req.body.site_description !== undefined ? helpers.strOrNull(req.body.site_description) : undefined;
      const pwaQrBadgeTextRaw = req.body.pwa_qr_badge_text !== undefined ? helpers.strOrNull(req.body.pwa_qr_badge_text) : undefined;
      let siteMenuItemsJson = undefined;
      if (req.body.site_menu_items !== undefined) {
        const normalizedSiteMenuItems = normalizeSiteMenuItems(req.body.site_menu_items, { fallbackToDefault: false });
        siteMenuItemsJson = JSON.stringify(normalizedSiteMenuItems);
      }
      const subdomain = req.body.subdomain !== undefined ? normalizeSubdomain(req.body.subdomain) : undefined;
      await ensureTenantDomainsTable();

      const customDomainNormalized = normalizeCustomDomain(req.body.custom_domain);
      if (customDomainNormalized.invalid) {
        return res.status(400).json({ ok: false, error: 'INVALID_CUSTOM_DOMAIN' });
      }
      const soundNewOrder = req.body.sound_new_order_url !== undefined ? helpers.strOrNull(req.body.sound_new_order_url) : undefined;
      const soundCancelled = req.body.sound_order_cancelled_url !== undefined ? helpers.strOrNull(req.body.sound_order_cancelled_url) : undefined;
      const soundNewMessage = req.body.sound_new_message_url !== undefined ? helpers.strOrNull(req.body.sound_new_message_url) : undefined;

      const imgWebpQuality = req.body.img_webp_quality !== undefined ? helpers.numOrNull(req.body.img_webp_quality) : undefined;
      const imgThumbQuality = req.body.img_thumb_quality !== undefined ? helpers.numOrNull(req.body.img_thumb_quality) : undefined;
      const imgThumbWidth = req.body.img_thumb_width !== undefined ? helpers.numOrNull(req.body.img_thumb_width) : undefined;
      const imgMainWidth = req.body.img_main_width !== undefined ? helpers.numOrNull(req.body.img_main_width) : undefined;
      const imgWebpAggressive = req.body.img_webp_aggressive !== undefined ? (helpers.toBool(req.body.img_webp_aggressive, false) ? 1 : 0) : undefined;
      const imgDeleteOriginal = req.body.img_delete_original !== undefined ? (helpers.toBool(req.body.img_delete_original, true) ? 1 : 0) : undefined;

      const telegramBotUsername = req.body.telegram_bot_username !== undefined ? helpers.strOrNull(req.body.telegram_bot_username) : undefined;
      const telegramBotToken = req.body.telegram_bot_token !== undefined ? helpers.strOrNull(req.body.telegram_bot_token) : undefined;
      const maxBotId = req.body.max_bot_id !== undefined ? helpers.strOrNull(req.body.max_bot_id) : undefined;
      const maxBotToken = req.body.max_bot_token !== undefined ? helpers.strOrNull(req.body.max_bot_token) : undefined;
      const maxMiniAppEnabled = req.body.max_mini_app_enabled !== undefined ? (helpers.toBool(req.body.max_mini_app_enabled, false) ? 1 : 0) : undefined;
      const maxLoginEnabled = req.body.max_login_enabled !== undefined ? (helpers.toBool(req.body.max_login_enabled, false) ? 1 : 0) : undefined;
      const tgMiniAppEnabled = req.body.tg_mini_app_enabled !== undefined ? (helpers.toBool(req.body.tg_mini_app_enabled, false) ? 1 : 0) : undefined;
      const tgLoginEnabled = req.body.tg_login_enabled !== undefined ? (helpers.toBool(req.body.tg_login_enabled, false) ? 1 : 0) : undefined;
      const chatWelcomeMessage = req.body.chat_welcome_message !== undefined ? helpers.strOrNull(req.body.chat_welcome_message) : undefined;
      const chatWelcomeEnabled = req.body.chat_welcome_enabled !== undefined
        ? (helpers.toBool(req.body.chat_welcome_enabled, true) ? 1 : 0)
        : undefined;
      const chatAssistantName = req.body.chat_assistant_name !== undefined ? helpers.strOrNull(req.body.chat_assistant_name) : undefined;
      const chatOperatorName = req.body.chat_operator_name !== undefined ? helpers.strOrNull(req.body.chat_operator_name) : undefined;
      let chatAssistantGender = undefined;
      if (req.body.chat_assistant_gender !== undefined) {
        chatAssistantGender = normalizeChatAssistantGender(req.body.chat_assistant_gender);
        if (chatAssistantGender === '__invalid__') {
          return res.status(400).json({ ok: false, error: 'BAD_CHAT_ASSISTANT_GENDER' });
        }
      }
      const chatWidgetEnabled = req.body.chat_widget_enabled !== undefined
        ? (helpers.toBool(req.body.chat_widget_enabled, true) ? 1 : 0)
        : undefined;
      let chatGuestThreadTtlDays = undefined;
      if (req.body.chat_guest_thread_ttl_days !== undefined) {
        const ttlRaw = helpers.numOrNull(req.body.chat_guest_thread_ttl_days);
        if (ttlRaw === null) {
          chatGuestThreadTtlDays = null;
        } else {
          const ttl = Math.trunc(Number(ttlRaw));
          if (!Number.isFinite(ttl) || ttl < 1 || ttl > 365) {
            return res.status(400).json({ ok: false, error: 'BAD_CHAT_GUEST_THREAD_TTL_DAYS' });
          }
          chatGuestThreadTtlDays = ttl;
        }
      }
      let chatThreadTtlDays = undefined;
      if (req.body.chat_thread_ttl_days !== undefined) {
        const ttlRaw = helpers.numOrNull(req.body.chat_thread_ttl_days);
        if (ttlRaw === null) {
          chatThreadTtlDays = null;
        } else {
          const ttl = Math.trunc(Number(ttlRaw));
          if (!Number.isFinite(ttl) || ttl < 0 || ttl > 365) {
            return res.status(400).json({ ok: false, error: 'BAD_CHAT_THREAD_TTL_DAYS' });
          }
          chatThreadTtlDays = ttl === 0 ? null : ttl;
        }
      }
      let chatQuickQuestionsJson = undefined;
      if (req.body.chat_quick_questions_json !== undefined) {
        const rawQuestions = req.body.chat_quick_questions_json;
        if (rawQuestions === null) {
          chatQuickQuestionsJson = null;
        } else {
          const normalized = sanitizeChatQuickQuestionsConfig(rawQuestions, { fallbackToDefault: false });
          if (!normalized.ok) {
            return res.status(400).json({ ok: false, error: normalized.error || 'BAD_CHAT_QUESTIONS' });
          }
          const normalizedItems = normalized.items;
          const defaultItems = cloneDefaultChatQuickItems();
          chatQuickQuestionsJson = isSameChatQuickQuestionsConfig(normalizedItems, defaultItems)
            ? null
            : JSON.stringify(normalizedItems);
        }
      }
      const chatQuickQuestionsEnabled = req.body.chat_quick_questions_enabled !== undefined
        ? (helpers.toBool(req.body.chat_quick_questions_enabled, true) ? 1 : 0)
        : undefined;

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      await ensureTenantChatColumns();
      await ensureTenantMapProviderColumns();
      await ensureTenantPwaColumns();

      const [currentRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (!currentRows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const current = currentRows[0];
      const nextTimezone = timezone !== undefined ? timezone : current.timezone;
      const nextLogoLight = logoLight !== undefined ? logoLight : current.logo_light_url;
      const nextLogoDark = logoDark !== undefined ? logoDark : current.logo_dark_url;
      const nextFaviconLight = faviconLight !== undefined ? faviconLight : current.favicon_light_url;
      const nextFaviconDark = faviconDark !== undefined ? faviconDark : current.favicon_dark_url;
      const nextAppleTouchIcon = appleTouchIcon !== undefined ? appleTouchIcon : current.apple_touch_icon_url;
      const nextAndroidIcon = androidIcon !== undefined ? androidIcon : current.android_icon_url;
      const allowedRoundingModes = new Set(['none', 'down', 'up', 'nearest']);
      const sanitizedRoundingMode =
        roundingModeRaw !== undefined
          ? (allowedRoundingModes.has(roundingModeRaw) ? roundingModeRaw : 'none')
          : undefined;
      const sanitizedRoundingPrecision =
        roundingPrecisionRaw !== undefined
          ? (Number(roundingPrecisionRaw) === 0 ? 0 : 2)
          : undefined;
      const nextRoundingMode = sanitizedRoundingMode !== undefined ? sanitizedRoundingMode : current.price_rounding_mode;
      const nextRoundingPrecision =
        sanitizedRoundingPrecision !== undefined ? sanitizedRoundingPrecision : (current.price_rounding_precision ?? 2);
      const allowedStockDeductModes = new Set(['on_create', 'on_status']);
      const sanitizedStockDeductMode =
        stockDeductModeRaw !== undefined
          ? (allowedStockDeductModes.has(stockDeductModeRaw) ? stockDeductModeRaw : 'on_create')
          : undefined;
      const nextStockDeductMode = sanitizedStockDeductMode !== undefined
        ? sanitizedStockDeductMode
        : (current.order_stock_deduct_mode || 'on_create');
      let nextStockDeductStatusId = stockDeductStatusIdRaw !== undefined
        ? (Number.isFinite(Number(stockDeductStatusIdRaw)) && Number(stockDeductStatusIdRaw) > 0 ? Number(stockDeductStatusIdRaw) : null)
        : (current.order_stock_deduct_status_id != null ? Number(current.order_stock_deduct_status_id) : null);

      async function resolveFallbackDeductStatusId() {
        const [byDelivered] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1 AND code='delivered'
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        if (byDelivered.length) return Number(byDelivered[0].id);

        const [byFinal] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1 AND is_final=1 AND code<>'canceled'
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        if (byFinal.length) return Number(byFinal[0].id);

        const [firstActive] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND is_active=1
           ORDER BY sort ASC, id ASC
           LIMIT 1`,
          [tenantId]
        );
        return firstActive.length ? Number(firstActive[0].id) : null;
      }

      if (nextStockDeductStatusId != null) {
        const [statusRows] = await db.query(
          `SELECT id
           FROM order_statuses
           WHERE tenant_id=? AND store_id=1 AND id=?
           LIMIT 1`,
          [tenantId, nextStockDeductStatusId]
        );
        if (!statusRows.length) {
          return res.status(400).json({ ok: false, error: 'BAD_STOCK_DEDUCT_STATUS' });
        }
      }
      if (nextStockDeductMode === 'on_status' && !nextStockDeductStatusId) {
        nextStockDeductStatusId = await resolveFallbackDeductStatusId();
      }
      const nextSiteName = siteName !== undefined ? siteName : current.site_name;
      const nextSiteDescription = siteDescription !== undefined ? siteDescription : current.site_description;
      const nextSiteMenuItemsJson = siteMenuItemsJson !== undefined ? siteMenuItemsJson : (current.site_menu_items_json ?? null);
      const nextPwaQrBadgeText = pwaQrBadgeTextRaw !== undefined
        ? (String(pwaQrBadgeTextRaw || '').replace(/\s+/g, ' ').trim().slice(0, 56) || null)
        : (current.pwa_qr_badge_text ?? null);
      let nextSubdomain = subdomain !== undefined ? subdomain : current.subdomain;

      if (subdomain !== undefined) {
        if (!subdomain) {
          nextSubdomain = `shop-${tenantId}`;
        } else {
          if (!subdomainRe.test(subdomain)) {
            return res.status(400).json({ ok: false, error: 'INVALID_SUBDOMAIN' });
          }
          const [exists] = await db.query(
            'SELECT id FROM ten_tenants WHERE subdomain=? AND id<>? LIMIT 1',
            [subdomain, tenantId]
          );
          if (exists.length > 0) {
            return res.status(409).json({ ok: false, error: 'SUBDOMAIN_TAKEN' });
          }
        }
      }
      const nextCustomDomain = customDomainNormalized.provided
        ? customDomainNormalized.unicode
        : current.custom_domain;
      const nextCustomDomainAscii = customDomainNormalized.provided
        ? customDomainNormalized.ascii
        : (current.custom_domain_ascii || null);
      const nextSoundNewOrder = soundNewOrder !== undefined ? soundNewOrder : (current.sound_new_order_url ?? null);
      const nextSoundCancelled = soundCancelled !== undefined ? soundCancelled : (current.sound_order_cancelled_url ?? null);
      const nextSoundNewMessage = soundNewMessage !== undefined ? soundNewMessage : (current.sound_new_message_url ?? null);
      const nextName = name !== undefined ? name : current.name;
      const nextEmail = email !== undefined ? email : current.email;
      const nextPhone = phone !== undefined ? phone : current.phone;

      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      const nextImgWebpQuality = imgWebpQuality !== undefined ? clamp(imgWebpQuality ?? 82, 1, 100) : (current.img_webp_quality ?? 82);
      const nextImgThumbQuality = imgThumbQuality !== undefined ? clamp(imgThumbQuality ?? 72, 1, 100) : (current.img_thumb_quality ?? 72);
      const nextImgThumbWidth = imgThumbWidth !== undefined ? clamp(imgThumbWidth ?? 480, 100, 2000) : (current.img_thumb_width ?? 480);
      const nextImgMainWidth = imgMainWidth !== undefined ? clamp(imgMainWidth ?? 1200, 100, 4000) : (current.img_main_width ?? 1200);
      const nextImgWebpAggressive = imgWebpAggressive !== undefined ? imgWebpAggressive : (current.img_webp_aggressive ?? 0);
      const nextImgDeleteOriginal = imgDeleteOriginal !== undefined ? imgDeleteOriginal : (current.img_delete_original ?? 1);

      const nextMaxBotId = maxBotId !== undefined ? maxBotId : (current.max_bot_id ?? null);
      const nextMaxBotToken = maxBotToken !== undefined ? maxBotToken : (current.max_bot_token ?? null);
      const nextMaxMiniAppEnabled = maxMiniAppEnabled !== undefined ? maxMiniAppEnabled : (current.max_mini_app_enabled ?? 0);
      const nextMaxLoginEnabled = maxLoginEnabled !== undefined ? maxLoginEnabled : (current.max_login_enabled ?? 0);
      const nextTelegramBotUsername = telegramBotUsername !== undefined ? telegramBotUsername : (current.telegram_bot_username ?? null);
      const nextTelegramBotToken = telegramBotToken !== undefined ? telegramBotToken : (current.telegram_bot_token ?? null);
      const nextTgMiniAppEnabled = tgMiniAppEnabled !== undefined ? tgMiniAppEnabled : (current.tg_mini_app_enabled ?? 0);
      const nextTgLoginEnabled = tgLoginEnabled !== undefined ? tgLoginEnabled : (current.tg_login_enabled ?? 0);
      const nextChatWelcomeMessage = chatWelcomeMessage !== undefined ? chatWelcomeMessage : (current.chat_welcome_message ?? null);
      const nextChatWelcomeEnabled = chatWelcomeEnabled !== undefined
        ? chatWelcomeEnabled
        : (Number(current.chat_welcome_enabled) === 0 ? 0 : 1);
      const nextChatAssistantName = chatAssistantName !== undefined ? chatAssistantName : (current.chat_assistant_name ?? null);
      const nextChatOperatorName = chatOperatorName !== undefined ? chatOperatorName : (current.chat_operator_name ?? null);
      const currentChatAssistantGenderRaw = normalizeChatAssistantGender(current.chat_assistant_gender);
      const currentChatAssistantGender =
        currentChatAssistantGenderRaw === 'm' || currentChatAssistantGenderRaw === 'f'
          ? currentChatAssistantGenderRaw
          : null;
      const nextChatAssistantGender =
        chatAssistantGender !== undefined ? chatAssistantGender : currentChatAssistantGender;
      const nextChatQuickQuestionsJson = chatQuickQuestionsJson !== undefined ? chatQuickQuestionsJson : (current.chat_quick_questions_json ?? null);
      const nextChatQuickQuestionsEnabled = chatQuickQuestionsEnabled !== undefined
        ? chatQuickQuestionsEnabled
        : (Number(current.chat_quick_questions_enabled) === 0 ? 0 : 1);
      const nextChatWidgetEnabled = chatWidgetEnabled !== undefined
        ? chatWidgetEnabled
        : (Number(current.chat_widget_enabled) === 0 ? 0 : 1);
      const nextChatGuestThreadTtlDays = chatGuestThreadTtlDays !== undefined
        ? chatGuestThreadTtlDays
        : (current.chat_guest_thread_ttl_days ?? null);
      const nextChatThreadTtlDays = chatThreadTtlDays !== undefined
        ? chatThreadTtlDays
        : (current.chat_thread_ttl_days ?? null);

      if (email !== undefined && email && email !== current.email) {
        const [existsEmail] = await db.query(
          'SELECT id FROM ten_tenants WHERE email=? AND id<>? LIMIT 1',
          [email, tenantId]
        );
        if (existsEmail.length > 0) {
          return res.status(409).json({ ok: false, error: 'EMAIL_TAKEN' });
        }
      }

      if (customDomainNormalized.provided && nextCustomDomainAscii) {
        const domainAvailable = await ensureTenantDomainAvailable(tenantId, nextCustomDomainAscii);
        if (!domainAvailable) {
          return res.status(409).json({ ok: false, error: 'CUSTOM_DOMAIN_TAKEN' });
        }
      }

      const previousSiteMenuIconUrls = siteMenuItemsJson !== undefined
        ? collectSiteMenuIconUrls(current.site_menu_items_json)
        : null;
      const nextSiteMenuIconUrls = siteMenuItemsJson !== undefined
        ? collectSiteMenuIconUrls(nextSiteMenuItemsJson)
        : null;

      await db.query(
        'UPDATE ten_tenants SET name=?, email=?, phone=?, timezone=?, logo_light_url=?, logo_dark_url=?, favicon_light_url=?, favicon_dark_url=?, apple_touch_icon_url=?, android_icon_url=?, price_rounding_mode=?, price_rounding_precision=?, order_stock_deduct_mode=?, order_stock_deduct_status_id=?, site_name=?, site_description=?, pwa_qr_badge_text=?, site_menu_items_json=?, subdomain=?, custom_domain=?, custom_domain_ascii=?, sound_new_order_url=?, sound_order_cancelled_url=?, sound_new_message_url=?, img_webp_quality=?, img_thumb_quality=?, img_thumb_width=?, img_main_width=?, img_webp_aggressive=?, img_delete_original=?, max_bot_id=?, max_bot_token=?, max_mini_app_enabled=?, max_login_enabled=?, telegram_bot_username=?, telegram_bot_token=?, tg_mini_app_enabled=?, tg_login_enabled=?, chat_welcome_message=?, chat_welcome_enabled=?, chat_assistant_name=?, chat_operator_name=?, chat_assistant_gender=?, chat_quick_questions_json=?, chat_quick_questions_enabled=?, chat_widget_enabled=?, chat_guest_thread_ttl_days=?, chat_thread_ttl_days=? WHERE id=?',
        [nextName, nextEmail, nextPhone, nextTimezone, nextLogoLight, nextLogoDark, nextFaviconLight, nextFaviconDark, nextAppleTouchIcon, nextAndroidIcon, nextRoundingMode, nextRoundingPrecision, nextStockDeductMode, nextStockDeductStatusId, nextSiteName, nextSiteDescription, nextPwaQrBadgeText, nextSiteMenuItemsJson, nextSubdomain, nextCustomDomain, nextCustomDomainAscii, nextSoundNewOrder, nextSoundCancelled, nextSoundNewMessage, nextImgWebpQuality, nextImgThumbQuality, nextImgThumbWidth, nextImgMainWidth, nextImgWebpAggressive, nextImgDeleteOriginal, nextMaxBotId, nextMaxBotToken, nextMaxMiniAppEnabled, nextMaxLoginEnabled, nextTelegramBotUsername, nextTelegramBotToken, nextTgMiniAppEnabled, nextTgLoginEnabled, nextChatWelcomeMessage, nextChatWelcomeEnabled, nextChatAssistantName, nextChatOperatorName, nextChatAssistantGender, nextChatQuickQuestionsJson, nextChatQuickQuestionsEnabled, nextChatWidgetEnabled, nextChatGuestThreadTtlDays, nextChatThreadTtlDays, tenantId]
      );

      if (previousSiteMenuIconUrls && nextSiteMenuIconUrls) {
        for (const url of previousSiteMenuIconUrls) {
          if (!nextSiteMenuIconUrls.has(url)) {
            await removeTenantUploadUrl(tenantId, url);
          }
        }
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const prevChatWidgetEnabled = Number(current.chat_widget_enabled) !== 0;
      const nextChatWidgetEnabledResolved = Number(rows?.[0]?.chat_widget_enabled) !== 0;

      try {
        if (typeof chatTempRuntime.handleTenantChatWidgetStateChange === 'function') {
          await chatTempRuntime.handleTenantChatWidgetStateChange(
            tenantId,
            nextChatWidgetEnabledResolved
          );
        }
      } catch (chatRuntimeErr) {
        console.error('РћС€РёР±РєР° СЃРёРЅС…СЂРѕРЅРёР·Р°С†РёРё runtime С‡Р°С‚Р° tenant:', chatRuntimeErr);
      }

      if (prevChatWidgetEnabled !== nextChatWidgetEnabledResolved) {
        await publishTenantChatWidgetChanged(tenantId, nextChatWidgetEnabledResolved);
      }

      if (customDomainNormalized.provided) {
        if (nextCustomDomainAscii) {
          await addOrReuseTenantDomain(tenantId, customDomainNormalized);
        } else if (helpers.strOrNull(current.custom_domain_ascii)) {
          const [currentDomainRows] = await db.query(
            'SELECT id FROM ten_tenant_domains WHERE tenant_id=? AND domain_ascii=? LIMIT 1',
            [tenantId, current.custom_domain_ascii]
          );
          if (currentDomainRows.length > 0) {
            await removeTenantDomain(tenantId, Number(currentDomainRows[0].id));
          } else {
            await db.query(
              'UPDATE ten_tenants SET custom_domain=NULL, custom_domain_ascii=NULL WHERE id=?',
              [tenantId]
            );
          }
        }
      }

      res.json({ ok: true, tenant: await buildTenantResponse(rows[0] || null, req) });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ tenant РїСЂРѕС„РёР»СЏ:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/current-time
   * Returns current server time converted to the timezone of the active store
   */
  router.get('/current-time', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = req.headers['x-store-id'];

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      // РџРѕР»СѓС‡Р°РµРј timezone С„РёР»РёР°Р»Р°
      let storeTimezone = '+0';
      if (storeId) {
        const [storeRows] = await db.query(
          'SELECT timezone FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, storeId]
        );
        if (storeRows[0]?.timezone) {
          storeTimezone = storeRows[0].timezone;
        }
      }

      // Р•СЃР»Рё РЅРµС‚ timezone Сѓ С„РёР»РёР°Р»Р°, Р±РµСЂРµРј Сѓ С‚РµРЅР°РЅС‚Р°
      if (!storeTimezone || storeTimezone === '+0') {
        const [tenantRows] = await db.query(
          'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        if (tenantRows[0]?.timezone) {
          storeTimezone = tenantRows[0].timezone;
        }
      }

      // РџРѕР»СѓС‡Р°РµРј Р Р•РђР›Р¬РќРћР• UTC РІСЂРµРјСЏ (РЅРµ РѕС‚ MySQL, Р° РѕС‚ Node.js)
      const realUtcNow = Date.now();

      // Р’С‹С‡РёСЃР»СЏРµРј РІСЂРµРјСЏ С„РёР»РёР°Р»Р°
      const offsetMinutes = helpers.parseTimezoneOffsetToMinutes(storeTimezone ?? "+0");
      const offsetMs = offsetMinutes * 60 * 1000;
      const storeTime = realUtcNow + offsetMs;
      const storeDate = new Date(storeTime);

      res.json({
        ok: true,
        data: {
          storeTimezone: storeTimezone,
          utcTimestamp: realUtcNow,
          storeTimestamp: storeTime,
          localTime: {
            hours: storeDate.getUTCHours(),
            minutes: storeDate.getUTCMinutes(),
            seconds: storeDate.getUTCSeconds(),
            day: storeDate.getUTCDay(),
            date: storeDate.getUTCDate(),
            month: storeDate.getUTCMonth(),
            year: storeDate.getUTCFullYear()
          }
        }
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  async function getNextStoreId(tenantId) {
    const [rows] = await db.query(
      'SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM ten_stores WHERE tenant_id=?',
      [tenantId]
    );
    return Number(rows?.[0]?.next_id || 1);
  }

  router.get('/stores', async (req, res) => {
    try {
      await ensureStoreAddressIdentityColumns();
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT tenant_id, id, code, name, address, address_ref, address_raw_input, address_normalized_display, address_street, address_house, address_context_locality, city, floor, apartment, cabinet, address_comment, lat, lng, phone, timezone, is_active, use_global_hours, use_delivery_hours, created_at, updated_at
         FROM ten_stores
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );
      const stores = Array.isArray(rows) ? rows : [];
      const storeIds = stores.map((item) => item.id);
      const hoursRows = await loadStoreHoursForStores(tenantId, storeIds);
      const deliveryRows = await loadStoreDeliveryHoursForStores(tenantId, storeIds);
      const hoursMap = organizeStoreHours(hoursRows);
      const deliveryMap = organizeStoreHours(deliveryRows);
      const enriched = stores.map((store) => ({
        ...normalizeStoreRecord(store),
        use_global_hours: Number(store.use_global_hours) === 1 ? 1 : 0,
        use_delivery_hours: Number(store.use_delivery_hours) === 1 ? 1 : 0,
        hours: hoursMap.get(Number(store.id)) || []
        ,
        delivery_hours: deliveryMap.get(Number(store.id)) || []
      }));
      res.json({ ok: true, stores: enriched });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃРїРёСЃРєР° С‚РѕС‡РµРє РїСЂРѕРґР°Р¶:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/stores', async (req, res) => {
      try {
      await ensureStoreAddressIdentityColumns();
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const codeInput = helpers.strOrNull(req.body.code);
      const cityInput = helpers.strOrNull(req.body.city);
      const address = helpers.strOrNull(req.body.address);
      const addressStreet = helpers.strOrNull(req.body.address_street);
      const addressHouse = helpers.strOrNull(req.body.address_house);
      const addressContextLocality = helpers.strOrNull(req.body.address_context_locality);
      const resolvedCitySourceKey = helpers.strOrNull(req.body.resolved_city_source_key);
      const selectedSourceKey = helpers.strOrNull(req.body.selected_source_key);
      const selectedObjectType = helpers.strOrNull(req.body.selected_object_type);
      const selectedContextLocality = helpers.strOrNull(req.body.selected_context_locality);
      const typedHousePart = helpers.strOrNull(req.body.typed_house_part);
      const confirmNormalized = helpers.toBool(req.body.confirm_normalized, false);
      const floor = helpers.strOrNull(req.body.floor);
      const apartment = helpers.strOrNull(req.body.apartment);
      const cabinet = helpers.strOrNull(req.body.cabinet);
      const addressComment = helpers.strOrNull(req.body.address_comment);
      const latResult = req.body.lat !== undefined ? parseStoreCoordinate(req.body.lat, 'lat') : null;
      if (latResult && latResult.error) return res.status(400).json({ ok: false, error: latResult.error });
      const lngResult = req.body.lng !== undefined ? parseStoreCoordinate(req.body.lng, 'lng') : null;
      if (lngResult && lngResult.error) return res.status(400).json({ ok: false, error: lngResult.error });
      const explicitLat = latResult ? latResult.value : undefined;
      const explicitLng = lngResult ? lngResult.value : undefined;
      const phone = helpers.strOrNull(req.body.phone);
      let timezone = helpers.strOrNull(req.body.timezone);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const useGlobalHours = helpers.toBool(req.body.use_global_hours, false) ? 1 : 0;
      const useDeliveryHours = helpers.toBool(req.body.use_delivery_hours, false) ? 1 : 0;
      const hoursPayload = Array.isArray(req.body.hours) ? req.body.hours : null;
      const deliveryHoursPayload = Array.isArray(req.body.delivery_hours) ? req.body.delivery_hours : null;
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!name) {
        return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      }

      const tenantMapConfig = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
      const storeAddressMapEnabled = isStoreAddressMapModeEnabled(tenantMapConfig);

      const useResolvedMapAddress = storeAddressMapEnabled && Boolean(selectedSourceKey && selectedObjectType);
      const location = useResolvedMapAddress
        ? await resolveStoreLocationByAddress(address, cityInput, {
          addressStreet,
          addressHouse,
          resolvedCitySourceKey,
          selectedSourceKey,
          selectedObjectType,
          selectedContextLocality: addressContextLocality || selectedContextLocality,
          typedHousePart,
          confirmNormalized,
          mapConfig: tenantMapConfig,
        })
        : buildManualStoreLocation(address, cityInput, {
          addressStreet,
          addressHouse,
          addressContextLocality: addressContextLocality || selectedContextLocality,
          typedHousePart,
        });
      if (!location.ok) {
        return res.status(getStoreGeocodingHttpStatus(location.error)).json({
          ok: false,
          error: location.error,
          normalization: location.data && location.data.normalization ? location.data.normalization : undefined,
        });
      }

      if (!timezone) {
        const [tenantRows] = await db.query(
          'SELECT timezone FROM ten_tenants WHERE id=? LIMIT 1',
          [tenantId]
        );
        timezone = tenantRows?.[0]?.timezone || null;
      }

      const nextId = await getNextStoreId(tenantId);
      const code = codeInput || `store-${nextId}`;
      const [exists] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? LIMIT 1',
        [tenantId, code]
      );
      if (exists.length) {
        return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
      }

      await db.query(
        'INSERT INTO ten_stores (tenant_id, id, code, name, address, address_ref, address_raw_input, address_normalized_display, address_street, address_house, address_context_locality, city, floor, apartment, cabinet, address_comment, lat, lng, phone, timezone, is_active, use_global_hours, use_delivery_hours) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          tenantId,
          nextId,
          code,
          name,
          location.data.address,
          location.data.address_ref || null,
          location.data.address_raw_input || address,
          location.data.address_normalized_display || location.data.address,
          location.data.address_street || addressStreet,
          location.data.address_house || addressHouse,
          location.data.address_context_locality || addressContextLocality || location.data.selected_context_locality || null,
          location.data.city,
          floor,
          apartment,
          cabinet,
          addressComment,
          explicitLat !== undefined ? explicitLat : location.data.lat,
          explicitLng !== undefined ? explicitLng : location.data.lng,
          phone,
          timezone,
          isActive,
          useGlobalHours,
          useDeliveryHours,
        ]
      );

      if (hoursPayload !== null) {
        await saveStoreHours(tenantId, nextId, hoursPayload);
      }
      if (deliveryHoursPayload !== null) {
        await saveStoreDeliveryHours(tenantId, nextId, deliveryHoursPayload);
      }

      const store = await fetchStoreWithHours(tenantId, nextId);
      res.json({ ok: true, store });
      } catch (err) {
        console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ Р¤РёР»РёР°Р»С‹:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });

    router.patch('/stores/:id', async (req, res) => {
      try {
        await ensureStoreAddressIdentityColumns();
        const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
        const id = helpers.numOrNull(req.params.id);
        if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
        if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

        const [existingRows] = await db.query(
          'SELECT tenant_id, id, code, name, address, address_ref, address_raw_input, address_normalized_display, address_street, address_house, address_context_locality, city, floor, apartment, cabinet, address_comment, lat, lng, phone, timezone, is_active FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
          [tenantId, id]
        );
        if (!existingRows.length) {
          return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
        }
        const existing = existingRows[0];

        const name = req.body.name !== undefined ? helpers.strOrNull(req.body.name) : undefined;
        const code = req.body.code !== undefined ? helpers.strOrNull(req.body.code) : undefined;
        const address = req.body.address !== undefined ? helpers.strOrNull(req.body.address) : undefined;
        const addressStreet = req.body.address_street !== undefined ? helpers.strOrNull(req.body.address_street) : undefined;
        const addressHouse = req.body.address_house !== undefined ? helpers.strOrNull(req.body.address_house) : undefined;
        const addressContextLocality = req.body.address_context_locality !== undefined ? helpers.strOrNull(req.body.address_context_locality) : undefined;
        const city = req.body.city !== undefined ? helpers.strOrNull(req.body.city) : undefined;
        const resolvedCitySourceKey = req.body.resolved_city_source_key !== undefined ? helpers.strOrNull(req.body.resolved_city_source_key) : undefined;
        const selectedSourceKey = req.body.selected_source_key !== undefined ? helpers.strOrNull(req.body.selected_source_key) : undefined;
        const selectedObjectType = req.body.selected_object_type !== undefined ? helpers.strOrNull(req.body.selected_object_type) : undefined;
        const selectedContextLocality = req.body.selected_context_locality !== undefined ? helpers.strOrNull(req.body.selected_context_locality) : undefined;
        const typedHousePart = req.body.typed_house_part !== undefined ? helpers.strOrNull(req.body.typed_house_part) : undefined;
        const confirmNormalized = req.body.confirm_normalized !== undefined ? helpers.toBool(req.body.confirm_normalized, false) : false;
        const floor = req.body.floor !== undefined ? helpers.strOrNull(req.body.floor) : undefined;
        const apartment = req.body.apartment !== undefined ? helpers.strOrNull(req.body.apartment) : undefined;
        const cabinet = req.body.cabinet !== undefined ? helpers.strOrNull(req.body.cabinet) : undefined;
        const addressComment = req.body.address_comment !== undefined ? helpers.strOrNull(req.body.address_comment) : undefined;
        const latResult = req.body.lat !== undefined ? parseStoreCoordinate(req.body.lat, 'lat') : null;
        if (latResult && latResult.error) return res.status(400).json({ ok: false, error: latResult.error });
        const lngResult = req.body.lng !== undefined ? parseStoreCoordinate(req.body.lng, 'lng') : null;
        if (lngResult && lngResult.error) return res.status(400).json({ ok: false, error: lngResult.error });
        const lat = latResult ? latResult.value : undefined;
        const lng = lngResult ? lngResult.value : undefined;
        const phone = req.body.phone !== undefined ? helpers.strOrNull(req.body.phone) : undefined;
        const timezone = req.body.timezone !== undefined ? helpers.strOrNull(req.body.timezone) : undefined;
        const useGlobalHours = req.body.use_global_hours !== undefined ? (helpers.toBool(req.body.use_global_hours, false) ? 1 : 0) : undefined;
        const useDeliveryHours = req.body.use_delivery_hours !== undefined ? (helpers.toBool(req.body.use_delivery_hours, false) ? 1 : 0) : undefined;
        const hoursPayload = Array.isArray(req.body.hours) ? req.body.hours : null;
        const deliveryHoursPayload = Array.isArray(req.body.delivery_hours) ? req.body.delivery_hours : null;
        const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;

        if (name !== undefined && !name) {
          return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
        }
        if (city !== undefined && !city) {
          return res.status(400).json({ ok: false, error: 'CITY_REQUIRED' });
        }
        if (address !== undefined && !address && addressStreet === undefined) {
          return res.status(400).json({ ok: false, error: 'ADDRESS_REQUIRED' });
        }

        const tenantMapConfig = await getTenantMapConfigRow(db, tenantId, { includeAccounts: true });
        const storeAddressMapEnabled = isStoreAddressMapModeEnabled(tenantMapConfig);

        if (code !== undefined && code !== existing.code) {
          if (code) {
            const [exists] = await db.query(
              'SELECT id FROM ten_stores WHERE tenant_id=? AND code=? AND id<>? LIMIT 1',
              [tenantId, code, id]
            );
            if (exists.length) {
              return res.status(409).json({ ok: false, error: 'CODE_TAKEN' });
            }
          }
        }

        let resolvedLocation = null;
        let finalLat = lat;
        let finalLng = lng;
        const nextCityForGeocode = city !== undefined ? city : helpers.strOrNull(existing.city);
        const nextContextLocality = addressContextLocality !== undefined
          ? addressContextLocality
          : helpers.strOrNull(existing.address_context_locality);
        const nextAddressStreet = addressStreet !== undefined ? addressStreet : helpers.strOrNull(existing.address_street);
        const nextAddressHouse = addressHouse !== undefined ? addressHouse : helpers.strOrNull(existing.address_house);
        const nextAddressForGeocode = address !== undefined
          ? address
          : (buildStoreSavedAddress(
            nextCityForGeocode,
            nextContextLocality || nextCityForGeocode,
            buildStoreStreetHouseLabel(nextAddressStreet, nextAddressHouse)
          ) || helpers.strOrNull(existing.address));
        if (
          (address !== undefined && address !== helpers.strOrNull(existing.address))
          || (addressStreet !== undefined && addressStreet !== helpers.strOrNull(existing.address_street))
          || (addressHouse !== undefined && addressHouse !== helpers.strOrNull(existing.address_house))
          || (addressContextLocality !== undefined && addressContextLocality !== helpers.strOrNull(existing.address_context_locality))
          || (city !== undefined && city !== helpers.strOrNull(existing.city))
        ) {
          const useResolvedMapAddress = storeAddressMapEnabled && Boolean(selectedSourceKey && selectedObjectType);
          const location = useResolvedMapAddress
            ? await resolveStoreLocationByAddress(nextAddressForGeocode, nextCityForGeocode, {
              addressStreet: nextAddressStreet,
              addressHouse: nextAddressHouse,
              resolvedCitySourceKey,
              selectedSourceKey,
              selectedObjectType,
              selectedContextLocality: nextContextLocality || selectedContextLocality,
              typedHousePart,
              confirmNormalized,
              mapConfig: tenantMapConfig,
            })
            : buildManualStoreLocation(nextAddressForGeocode, nextCityForGeocode, {
              addressStreet: nextAddressStreet,
              addressHouse: nextAddressHouse,
              addressContextLocality: nextContextLocality,
              typedHousePart,
            });
          if (!location.ok) {
            return res.status(getStoreGeocodingHttpStatus(location.error)).json({
              ok: false,
              error: location.error,
              normalization: location.data && location.data.normalization ? location.data.normalization : undefined,
            });
          }
          resolvedLocation = location.data;
          if (storeAddressMapEnabled) {
            if (finalLat === undefined) finalLat = resolvedLocation.lat;
            if (finalLng === undefined) finalLng = resolvedLocation.lng;
          } else {
            if (finalLat === undefined) finalLat = null;
            if (finalLng === undefined) finalLng = null;
          }
        }

        const updates = [];
        const params = [];
        if (name !== undefined) {
          updates.push('name=?');
          params.push(name);
        }
        if (code !== undefined) {
          updates.push('code=?');
          params.push(code);
        }
        if (address !== undefined || resolvedLocation) {
          updates.push('address=?');
          params.push(resolvedLocation ? resolvedLocation.address : address);
        }
        if (addressStreet !== undefined || resolvedLocation) {
          updates.push('address_street=?');
          params.push(resolvedLocation ? (resolvedLocation.address_street || nextAddressStreet || null) : addressStreet);
        }
        if (addressHouse !== undefined || resolvedLocation) {
          updates.push('address_house=?');
          params.push(resolvedLocation ? (resolvedLocation.address_house || nextAddressHouse || null) : addressHouse);
        }
        if (addressContextLocality !== undefined || resolvedLocation) {
          updates.push('address_context_locality=?');
          params.push(resolvedLocation
            ? (resolvedLocation.address_context_locality || nextContextLocality || resolvedLocation.selected_context_locality || null)
            : addressContextLocality);
        }
        if (resolvedLocation) {
          updates.push('address_ref=?');
          params.push(storeAddressMapEnabled ? (resolvedLocation.address_ref || null) : null);
          updates.push('address_raw_input=?');
          params.push(resolvedLocation.address_raw_input || nextAddressForGeocode || null);
          updates.push('address_normalized_display=?');
          params.push(resolvedLocation.address_normalized_display || resolvedLocation.address || null);
          updates.push('city=?');
          params.push(resolvedLocation.city);
          updates.push('lat=?');
          params.push(finalLat);
          updates.push('lng=?');
          params.push(finalLng);
        } else if (address === undefined && addressStreet === undefined && addressHouse === undefined && city !== undefined) {
          updates.push('city=?');
          params.push(city);
        }
        if (!resolvedLocation && lat !== undefined) {
          updates.push('lat=?');
          params.push(lat);
        }
        if (!resolvedLocation && lng !== undefined) {
          updates.push('lng=?');
          params.push(lng);
        }
        if (floor !== undefined) {
          updates.push('floor=?');
          params.push(floor);
        }
        if (apartment !== undefined) {
          updates.push('apartment=?');
          params.push(apartment);
        }
        if (cabinet !== undefined) {
          updates.push('cabinet=?');
          params.push(cabinet);
        }
        if (addressComment !== undefined) {
          updates.push('address_comment=?');
          params.push(addressComment);
        }
        if (phone !== undefined) {
          updates.push('phone=?');
          params.push(phone);
        }
        if (timezone !== undefined) {
          updates.push('timezone=?');
          params.push(timezone);
        }
        if (isActive !== undefined) {
          updates.push('is_active=?');
          params.push(isActive);
        }
        if (useGlobalHours !== undefined) {
          updates.push('use_global_hours=?');
          params.push(useGlobalHours);
        }
        if (useDeliveryHours !== undefined) {
          updates.push('use_delivery_hours=?');
          params.push(useDeliveryHours);
        }

        if (updates.length) {
          params.push(tenantId, id);
          await db.query(
            `UPDATE ten_stores SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
            params
          );
        }

        if (hoursPayload !== null) {
          await saveStoreHours(tenantId, id, hoursPayload);
        }
        if (deliveryHoursPayload !== null) {
          await saveStoreDeliveryHours(tenantId, id, deliveryHoursPayload);
        }

        const store = await fetchStoreWithHours(tenantId, id);
        res.json({ ok: true, store });
      } catch (err) {
        console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ Р¤РёР»РёР°Р»С‹:', err);
        res.status(500).json({ ok: false, error: 'DB_ERROR' });
      }
    });


    // ------------------------------
  // Order settings lists (tenant-level)
  // ------------------------------
  router.get('/order-statuses', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_final
         FROM order_statuses
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃРїРёСЃРєР° СЃС‚Р°С‚СѓСЃРѕРІ:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-payments', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active
         FROM order_payments
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃРїРѕСЃРѕР±РѕРІ РѕРїР»Р°С‚С‹:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-delivery-types', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      await ensureOrderDeliveryTypeColumns();

      const [rows] = await db.query(
        `SELECT id, code, title, icon, sort, is_active, is_default, require_client_data, show_on_site
         FROM order_delivery_types
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ СЃРїРѕСЃРѕР±РѕРІ РїРѕР»СѓС‡РµРЅРёСЏ:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.get('/order-time-options', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [rows] = await db.query(
        `SELECT id, code, title, icon, description, sort, is_active,
                has_time_window, starts_at, ends_at, step_minutes, lead_minutes
         FROM order_time_options
         WHERE tenant_id=? AND store_id=1
         ORDER BY sort ASC, id ASC`,
        [tenantId]
      );
      res.json({ ok: true, items: rows || [] });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РёРЅС‚РµСЂРІР°Р»РѕРІ РІСЂРµРјРµРЅРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function patchListItem(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });
      if (type === 'order-delivery') {
        await ensureOrderDeliveryTypeColumns();
      }

      const title = req.body.title !== undefined ? helpers.strOrNull(req.body.title) : undefined;
      const icon = cfg.hasIcon !== false && req.body.icon !== undefined ? helpers.strOrNull(req.body.icon) : undefined;
      const isActive = req.body.is_active !== undefined ? (helpers.toBool(req.body.is_active, true) ? 1 : 0) : undefined;
      const isFinal = cfg.hasFinal && req.body.is_final !== undefined ? (helpers.toBool(req.body.is_final, false) ? 1 : 0) : undefined;
      const defaultField = cfg.defaultField;
      const isDefault = defaultField && req.body[defaultField] !== undefined
        ? (helpers.toBool(req.body[defaultField], false) ? 1 : 0)
        : undefined;
      const patchFields = cfg.patchFields || {};

      const updates = [];
      const params = [];
      if (title !== undefined) {
        updates.push('title=?');
        params.push(title);
      }
      if (icon !== undefined) {
        updates.push('icon=?');
        params.push(icon);
      }
      if (isActive !== undefined) {
        updates.push('is_active=?');
        params.push(isActive);
      }
      if (isFinal !== undefined) {
        updates.push('is_final=?');
        params.push(isFinal);
      }
      if (isDefault !== undefined) {
        updates.push(`${defaultField}=?`);
        params.push(isDefault);
      }

      for (const [field, parser] of Object.entries(patchFields)) {
        if (req.body[field] !== undefined) {
          updates.push(`${field}=?`);
          params.push(parser(req.body[field]));
        }
      }

      if (!updates.length) {
        return res.json({ ok: true });
      }

      let previousIcon = null;
      if (icon !== undefined) {
        const [previousRows] = await db.query(
          `SELECT icon FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
          [tenantId, id]
        );
        previousIcon = previousRows && previousRows[0] ? previousRows[0].icon : null;
      }

      if (isDefault === 1) {
        await db.query(
          `UPDATE ${cfg.table} SET ${defaultField}=0
           WHERE tenant_id=? AND store_id=1 AND id!=?`,
          [tenantId, id]
        );
      }

      params.push(tenantId, id);
      await db.query(
        `UPDATE ${cfg.table} SET ${updates.join(', ')} WHERE tenant_id=? AND store_id=1 AND id=?`,
        params
      );

      if (icon !== undefined && previousIcon && previousIcon !== icon) {
        await removeTenantUploadUrl(tenantId, previousIcon);
      }

      const baseFields = ['id', 'code', 'title'];
      if (cfg.hasIcon !== false) baseFields.push('icon');
      baseFields.push('sort', 'is_active');
      if (cfg.hasFinal) baseFields.push('is_final');
      if (cfg.defaultField) baseFields.push(cfg.defaultField);
      if (cfg.detailFields) baseFields.push(...cfg.detailFields);
      const fields = baseFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, item: rows[0] || null });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ СЃРїРёСЃРєР°:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.patch('/order-statuses/:id', (req, res) => patchListItem(req, res, 'order-statuses'));
  router.patch('/order-payments/:id', (req, res) => patchListItem(req, res, 'order-payments'));
  router.patch('/order-delivery-types/:id', (req, res) => patchListItem(req, res, 'order-delivery'));
  router.patch('/order-time-options/:id', (req, res) => patchListItem(req, res, 'order-time-options'));

  async function reorderList(req, res, type) {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const cfg = getListConfig(type);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });

      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((v) => Number.isFinite(v) && v > 0) : [];
      if (!ids.length) return res.status(400).json({ ok: false, error: 'IDS_REQUIRED' });

      const caseParts = [];
      const params = [];
      ids.forEach((id, idx) => {
        caseParts.push('WHEN ? THEN ?');
        params.push(id, (idx + 1) * 10);
      });
      const inSql = ids.map(() => '?').join(',');
      params.push(tenantId, ...ids);

      await db.query(
        `UPDATE ${cfg.table} SET sort = CASE id ${caseParts.join(' ')} ELSE sort END
         WHERE tenant_id=? AND store_id=1 AND id IN (${inSql})`,
        params
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ СЃРѕСЂС‚РёСЂРѕРІРєРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  }

  router.post('/order-statuses/reorder', (req, res) => reorderList(req, res, 'order-statuses'));
  router.post('/order-payments/reorder', (req, res) => reorderList(req, res, 'order-payments'));
  router.post('/order-delivery-types/reorder', (req, res) => reorderList(req, res, 'order-delivery'));
  router.post('/order-time-options/reorder', (req, res) => reorderList(req, res, 'order-time-options'));

  const listIconStorage = multer.diskStorage({
    destination(req, file, cb) {
      const tenantId = helpers.getTenantId(req);
      const folder = path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'lists');
      helpers.ensureDir(folder);
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
      const name = crypto.randomBytes(16).toString('hex') + ext;
      cb(null, name);
    }
  });

  const listIconUpload = multer({
    storage: listIconStorage,
    limits: { files: 1, fileSize: 5 * 1024 * 1024 },
    fileFilter(req, file, cb) {
      const ok = /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype);
      cb(ok ? null : new Error('ONLY_IMAGES'), ok);
    }
  });

  router.post('/list-icon', listIconUpload.single('file'), async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const type = helpers.strOrNull(req.body.type);
      const id = helpers.numOrNull(req.body.id);
      const file = req.file;
      const cfg = getListConfig(type);

      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!cfg) return res.status(400).json({ ok: false, error: 'TYPE_INVALID' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });
      if (!file) return res.status(400).json({ ok: false, error: 'FILE_REQUIRED' });
      if (cfg.hasIcon === false) return res.status(400).json({ ok: false, error: 'ICON_NOT_SUPPORTED' });

      const [previousRows] = await db.query(
        `SELECT icon FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );
      const previousIcon = previousRows && previousRows[0] ? previousRows[0].icon : null;

      // РЎРѕР·РґР°С‘Рј WebP-РІР°СЂРёР°РЅС‚ РёРєРѕРЅРєРё СЃРїРёСЃРєР° (РѕСЂРёРіРёРЅР°Р» РѕСЃС‚Р°С‘С‚СЃСЏ РєР°Рє fallback)
      await helpers.ensureWebpVariant(
        file.path ||
          path.join(__dirname, '..', '..', 'static', 'uploads', 'tenants', String(tenantId), 'lists', file.filename)
      );

      const url = `/static/uploads/tenants/${tenantId}/lists/${file.filename.replace(/\.(jpe?g|png|gif)$/i, '.webp')}`;
      await db.query(
        `UPDATE ${cfg.table} SET icon=? WHERE tenant_id=? AND store_id=1 AND id=?`,
        [url, tenantId, id]
      );
      if (previousIcon && previousIcon !== url) {
        await removeTenantUploadUrl(tenantId, previousIcon);
      }

      const baseIconFields = ['id', 'code', 'title', 'icon', 'sort', 'is_active'];
      if (cfg.hasFinal) baseIconFields.push('is_final');
      if (cfg.defaultField) baseIconFields.push(cfg.defaultField);
      if (cfg.detailFields) baseIconFields.push(...cfg.detailFields);
      const fields = baseIconFields.join(', ');
      const [rows] = await db.query(
        `SELECT ${fields} FROM ${cfg.table} WHERE tenant_id=? AND store_id=1 AND id=? LIMIT 1`,
        [tenantId, id]
      );

      res.json({ ok: true, url, item: rows[0] || null });
    } catch (err) {
      console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё РёРєРѕРЅРєРё:', err);
      res.status(500).json({ ok: false, error: 'UPLOAD_ERROR' });
    }
  });

  // ------------------------------
  // Delivery Zones CRUD
  // ------------------------------

  router.get('/delivery-zones', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const items = await loadDeliveryZonesForTenant(tenantId);
      return res.json({ ok: true, items });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ Р·РѕРЅ РґРѕСЃС‚Р°РІРєРё:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/delivery-zones', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const payload = await sanitizeDeliveryZonePayload(tenantId, req.body || {});
      if (!payload.ok) {
        return res.status(400).json({ ok: false, error: payload.error || 'BAD_PAYLOAD' });
      }

      const nextZone = payload.item;
      await ensureDeliveryZoneTables();
      const [result] = await db.query(
        `INSERT INTO \`${deliveryZoneTables.zones}\` (tenant_id, name, color, eta_minutes, is_active, geometry_json)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          nextZone.name,
          nextZone.color,
          nextZone.eta_minutes,
          nextZone.is_active,
          JSON.stringify(nextZone.geometry),
        ]
      );

      const zoneId = Number(result && result.insertId);
      if (nextZone.store_ids.length) {
        const values = nextZone.store_ids.map((storeId) => [zoneId, storeId, tenantId]);
        const placeholders = values.map(() => '(?, ?, ?)').join(', ');
        await db.query(
          `INSERT INTO \`${deliveryZoneTables.stores}\` (delivery_zone_id, store_id, tenant_id) VALUES ${placeholders}`,
          values.flat()
        );
      }

      if (nextZone.price_tiers.length) {
        const values = nextZone.price_tiers.map((tier) => ([
          zoneId,
          tenantId,
          tier.min_order_amount,
          tier.delivery_cost,
          tier.sort_order,
        ]));
        const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
        await db.query(
          `INSERT INTO \`${deliveryZoneTables.tiers}\` (delivery_zone_id, tenant_id, min_order_amount, delivery_cost, sort_order) VALUES ${placeholders}`,
          values.flat()
        );
      }

      const item = await loadDeliveryZoneForTenant(tenantId, zoneId);
      return res.json({ ok: true, item });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ Р·РѕРЅС‹ РґРѕСЃС‚Р°РІРєРё:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/delivery-zones/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const zoneId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!zoneId) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      const current = await loadDeliveryZoneForTenant(tenantId, zoneId);
      if (!current) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const mergedPayload = {
        name: Object.prototype.hasOwnProperty.call(req.body || {}, 'name') ? req.body.name : current.name,
        color: Object.prototype.hasOwnProperty.call(req.body || {}, 'color') ? req.body.color : current.color,
        eta_minutes: Object.prototype.hasOwnProperty.call(req.body || {}, 'eta_minutes') ? req.body.eta_minutes : current.eta_minutes,
        is_active: Object.prototype.hasOwnProperty.call(req.body || {}, 'is_active') ? req.body.is_active : current.is_active,
        geometry: Object.prototype.hasOwnProperty.call(req.body || {}, 'geometry') ? req.body.geometry : current.geometry,
        store_ids: Object.prototype.hasOwnProperty.call(req.body || {}, 'store_ids') ? req.body.store_ids : current.store_ids,
        price_tiers: Object.prototype.hasOwnProperty.call(req.body || {}, 'price_tiers') ? req.body.price_tiers : current.price_tiers,
      };
      const payload = await sanitizeDeliveryZonePayload(tenantId, mergedPayload);
      if (!payload.ok) {
        return res.status(400).json({ ok: false, error: payload.error || 'BAD_PAYLOAD' });
      }

      const nextZone = payload.item;
      await ensureDeliveryZoneTables();
      await db.query(
        `UPDATE \`${deliveryZoneTables.zones}\`
         SET name=?, color=?, eta_minutes=?, is_active=?, geometry_json=?, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [
          nextZone.name,
          nextZone.color,
          nextZone.eta_minutes,
          nextZone.is_active,
          JSON.stringify(nextZone.geometry),
          tenantId,
          zoneId,
        ]
      );

      await db.query(
        `DELETE FROM \`${deliveryZoneTables.stores}\` WHERE tenant_id=? AND delivery_zone_id=?`,
        [tenantId, zoneId]
      );
      await db.query(
        `DELETE FROM \`${deliveryZoneTables.tiers}\` WHERE tenant_id=? AND delivery_zone_id=?`,
        [tenantId, zoneId]
      );

      if (nextZone.store_ids.length) {
        const storeValues = nextZone.store_ids.map((storeId) => [zoneId, storeId, tenantId]);
        const storePlaceholders = storeValues.map(() => '(?, ?, ?)').join(', ');
        await db.query(
          `INSERT INTO \`${deliveryZoneTables.stores}\` (delivery_zone_id, store_id, tenant_id) VALUES ${storePlaceholders}`,
          storeValues.flat()
        );
      }

      if (nextZone.price_tiers.length) {
        const tierValues = nextZone.price_tiers.map((tier) => ([
          zoneId,
          tenantId,
          tier.min_order_amount,
          tier.delivery_cost,
          tier.sort_order,
        ]));
        const tierPlaceholders = tierValues.map(() => '(?, ?, ?, ?, ?)').join(', ');
        await db.query(
          `INSERT INTO \`${deliveryZoneTables.tiers}\` (delivery_zone_id, tenant_id, min_order_amount, delivery_cost, sort_order) VALUES ${tierPlaceholders}`,
          tierValues.flat()
        );
      }

      const item = await loadDeliveryZoneForTenant(tenantId, zoneId);
      return res.json({ ok: true, item });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ Р·РѕРЅС‹ РґРѕСЃС‚Р°РІРєРё:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.delete('/delivery-zones/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const zoneId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!zoneId) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      await ensureDeliveryZoneTables();
      await db.query(
        `DELETE FROM \`${deliveryZoneTables.stores}\` WHERE tenant_id=? AND delivery_zone_id=?`,
        [tenantId, zoneId]
      );
      await db.query(
        `DELETE FROM \`${deliveryZoneTables.tiers}\` WHERE tenant_id=? AND delivery_zone_id=?`,
        [tenantId, zoneId]
      );
      await db.query(
        `DELETE FROM \`${deliveryZoneTables.zones}\` WHERE tenant_id=? AND id=?`,
        [tenantId, zoneId]
      );
      return res.json({ ok: true });
    } catch (err) {
      console.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ Р·РѕРЅС‹ РґРѕСЃС‚Р°РІРєРё:', err);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Delivery Settings CRUD
  // ------------------------------

  /**
   * GET /api/admin/tenant/delivery-settings
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ СЃРїРёСЃРѕРє РЅР°СЃС‚СЂРѕРµРє РґРѕСЃС‚Р°РІРєРё СЃ РїСЂРёРІСЏР·Р°РЅРЅС‹РјРё С„РёР»РёР°Р»Р°РјРё
   */
  router.get('/delivery-settings', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      const items = await loadDeliverySettingsForTenant(tenantId);
      return res.json({ ok: true, items });

      const [settings] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=?
         ORDER BY id ASC`,
        [tenantId]
      );

      // РџРѕР»СѓС‡Р°РµРј СЃРІСЏР·Рё СЃ С„РёР»РёР°Р»Р°РјРё
      const settingIds = settings.map(s => s.id);
      let storeLinks = [];
      if (settingIds.length) {
        const placeholders = settingIds.map(() => '?').join(',');
        const [links] = await db.query(
          `SELECT delivery_setting_id, store_id
           FROM ten_delivery_settings_stores
           WHERE tenant_id=? AND delivery_setting_id IN (${placeholders})`,
          [tenantId, ...settingIds]
        );
        storeLinks = links;
      }

      // Р“СЂСѓРїРїРёСЂСѓРµРј store_id РїРѕ delivery_setting_id
      const storeMap = new Map();
      storeLinks.forEach(link => {
        if (!storeMap.has(link.delivery_setting_id)) {
          storeMap.set(link.delivery_setting_id, []);
        }
        storeMap.get(link.delivery_setting_id).push(link.store_id);
      });

      const enriched = settings.map(s => ({
        ...s,
        store_ids: storeMap.get(s.id) || [],
        default_store_id: s.default_store_id != null ? Number(s.default_store_id) : null
      }));

      res.json({ ok: true, items: enriched });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РЅР°СЃС‚СЂРѕРµРє РґРѕСЃС‚Р°РІРєРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/delivery-settings
   * РЎРѕР·РґР°С‘С‚ РЅРѕРІСѓСЋ РЅР°СЃС‚СЂРѕР№РєСѓ РґРѕСЃС‚Р°РІРєРё
   * body: { name, delivery_cost, min_order_amount, free_delivery_from, is_active, store_ids }
   */
  router.post('/delivery-settings', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const payloadResult = buildDeliverySettingPayload(req.body);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      const nextSetting = payloadResult.item;

      const [insertedSettingResult] = await db.query(
        `INSERT INTO ten_delivery_settings (tenant_id, name, eta_minutes, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          nextSetting.name,
          nextSetting.eta_minutes,
          nextSetting.delivery_cost,
          nextSetting.min_order_amount,
          nextSetting.free_delivery_from,
          nextSetting.default_store_id,
          nextSetting.is_active,
        ]
      );
      const createdSettingId = Number(insertedSettingResult && insertedSettingResult.insertId || 0);
      await replaceDeliverySettingStores(tenantId, createdSettingId, nextSetting.store_ids);
      await replaceDeliverySettingPriceTiers(tenantId, createdSettingId, nextSetting.price_tiers);

      const savedSettings = await loadDeliverySettingsForTenant(tenantId, createdSettingId);
      return res.json({ ok: true, item: savedSettings[0] || null });

      const name = helpers.strOrNull(req.body.name);
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });

      const deliveryCost = helpers.numOrNull(req.body.delivery_cost) ?? 0;
      const minOrderAmount = helpers.numOrNull(req.body.min_order_amount) ?? 0;
      const freeDeliveryFrom = helpers.numOrNull(req.body.free_delivery_from);
      const isActive = helpers.toBool(req.body.is_active, true) ? 1 : 0;
      const storeIds = Array.isArray(req.body.store_ids)
        ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0)
        : [];
      let defaultStoreId = helpers.numOrNull(req.body.default_store_id);
      if (defaultStoreId != null && !storeIds.includes(defaultStoreId)) defaultStoreId = null;

      const [result] = await db.query(
        `INSERT INTO ten_delivery_settings (tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tenantId, name, deliveryCost, minOrderAmount, freeDeliveryFrom, defaultStoreId, isActive]
      );

      const newId = result.insertId;

      // РЎРѕС…СЂР°РЅСЏРµРј СЃРІСЏР·Рё СЃ С„РёР»РёР°Р»Р°РјРё
      if (storeIds.length) {
        const linkValues = storeIds.map(storeId => [newId, storeId, tenantId]);
        const linkPlaceholders = linkValues.map(() => '(?, ?, ?)').join(',');
        await db.query(
          `INSERT INTO ten_delivery_settings_stores (delivery_setting_id, store_id, tenant_id) VALUES ${linkPlaceholders}`,
          linkValues.flat()
        );
      }

      const [rows] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, newId]
      );

      res.json({ ok: true, item: { ...rows[0], store_ids: storeIds, default_store_id: defaultStoreId } });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РЅР°СЃС‚СЂРѕР№РєРё РґРѕСЃС‚Р°РІРєРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/tenant/delivery-settings/:id
   * РћР±РЅРѕРІР»СЏРµС‚ РЅР°СЃС‚СЂРѕР№РєСѓ РґРѕСЃС‚Р°РІРєРё
   */
  router.put('/delivery-settings/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      // РџСЂРѕРІРµСЂСЏРµРј СЃСѓС‰РµСЃС‚РІРѕРІР°РЅРёРµ
      const currentItems = await loadDeliverySettingsForTenant(tenantId, id);
      const current = currentItems[0] || null;
      if (!current) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const payloadResult = buildDeliverySettingPayload(req.body, current);
      if (!payloadResult.ok) {
        return res.status(400).json({ ok: false, error: payloadResult.error });
      }
      const nextSetting = payloadResult.item;

      await db.query(
        `UPDATE ten_delivery_settings
         SET name=?, eta_minutes=?, delivery_cost=?, min_order_amount=?, free_delivery_from=?, default_store_id=?, is_active=?, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [
          nextSetting.name,
          nextSetting.eta_minutes,
          nextSetting.delivery_cost,
          nextSetting.min_order_amount,
          nextSetting.free_delivery_from,
          nextSetting.default_store_id,
          nextSetting.is_active,
          tenantId,
          id,
        ]
      );

      if (req.body.store_ids !== undefined) {
        await replaceDeliverySettingStores(tenantId, id, nextSetting.store_ids);
      }
      if (
        req.body.price_tiers !== undefined
        || req.body.delivery_cost !== undefined
        || req.body.min_order_amount !== undefined
        || req.body.free_delivery_from !== undefined
      ) {
        await replaceDeliverySettingPriceTiers(tenantId, id, nextSetting.price_tiers);
      }

      const items = await loadDeliverySettingsForTenant(tenantId, id);
      return res.json({ ok: true, item: items[0] || null });

      const [existing] = await db.query(
        'SELECT id FROM ten_delivery_settings WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, id]
      );
      if (!existing.length) {
        return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
      }

      const updates = [];
      const params = [];

      if (req.body.name !== undefined) {
        const name = helpers.strOrNull(req.body.name);
        if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
        updates.push('name=?');
        params.push(name);
      }
      if (req.body.delivery_cost !== undefined) {
        updates.push('delivery_cost=?');
        params.push(helpers.numOrNull(req.body.delivery_cost) ?? 0);
      }
      if (req.body.min_order_amount !== undefined) {
        updates.push('min_order_amount=?');
        params.push(helpers.numOrNull(req.body.min_order_amount) ?? 0);
      }
      if (req.body.free_delivery_from !== undefined) {
        updates.push('free_delivery_from=?');
        params.push(helpers.numOrNull(req.body.free_delivery_from));
      }
      if (req.body.is_active !== undefined) {
        updates.push('is_active=?');
        params.push(helpers.toBool(req.body.is_active, true) ? 1 : 0);
      }
      if (req.body.default_store_id !== undefined) {
        let storeIds = req.body.store_ids !== undefined
          ? (Array.isArray(req.body.store_ids) ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0) : [])
          : null;
        if (storeIds === null) {
          const [links] = await db.query(
            'SELECT store_id FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
            [tenantId, id]
          );
          storeIds = links.map(l => l.store_id);
        }
        let defaultStoreId = helpers.numOrNull(req.body.default_store_id);
        if (defaultStoreId != null && storeIds.length && !storeIds.includes(defaultStoreId)) defaultStoreId = null;
        updates.push('default_store_id=?');
        params.push(defaultStoreId);
      }

      if (updates.length) {
        params.push(tenantId, id);
        await db.query(
          `UPDATE ten_delivery_settings SET ${updates.join(', ')} WHERE tenant_id=? AND id=?`,
          params
        );
      }

      // РћР±РЅРѕРІР»СЏРµРј СЃРІСЏР·Рё СЃ С„РёР»РёР°Р»Р°РјРё
      if (req.body.store_ids !== undefined) {
        const storeIds = Array.isArray(req.body.store_ids)
          ? req.body.store_ids.map(Number).filter(v => Number.isFinite(v) && v > 0)
          : [];

        await db.query(
          'DELETE FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
          [tenantId, id]
        );

        if (storeIds.length) {
          const linkValues = storeIds.map(storeId => [id, storeId, tenantId]);
          const linkPlaceholders = linkValues.map(() => '(?, ?, ?)').join(',');
          await db.query(
            `INSERT INTO ten_delivery_settings_stores (delivery_setting_id, store_id, tenant_id) VALUES ${linkPlaceholders}`,
            linkValues.flat()
          );
        }
      }

      // Р’РѕР·РІСЂР°С‰Р°РµРј РѕР±РЅРѕРІР»С‘РЅРЅСѓСЋ Р·Р°РїРёСЃСЊ
      const [rows] = await db.query(
        `SELECT id, tenant_id, name, delivery_cost, min_order_amount, free_delivery_from, default_store_id, is_active, created_at, updated_at
         FROM ten_delivery_settings
         WHERE tenant_id=? AND id=? LIMIT 1`,
        [tenantId, id]
      );

      const [links] = await db.query(
        'SELECT store_id FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
        [tenantId, id]
      );

      const storeIds = links.map(l => l.store_id);
      const item = rows[0];
      res.json({ ok: true, item: { ...item, store_ids: storeIds, default_store_id: item.default_store_id != null ? Number(item.default_store_id) : null } });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РЅР°СЃС‚СЂРѕР№РєРё РґРѕСЃС‚Р°РІРєРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/delivery-settings/:id
   * РЈРґР°Р»СЏРµС‚ РЅР°СЃС‚СЂРѕР№РєСѓ РґРѕСЃС‚Р°РІРєРё
   */
  router.delete('/delivery-settings/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const id = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!id) return res.status(400).json({ ok: false, error: 'ID_REQUIRED' });

      // РЈРґР°Р»СЏРµРј СЃРІСЏР·Рё
      await db.query(
        `DELETE FROM \`${deliverySettingPriceTiersTable}\` WHERE tenant_id=? AND delivery_setting_id=?`,
        [tenantId, id]
      );
      await db.query(
        'DELETE FROM ten_delivery_settings_stores WHERE tenant_id=? AND delivery_setting_id=?',
        [tenantId, id]
      );

      // РЈРґР°Р»СЏРµРј РЅР°СЃС‚СЂРѕР№РєСѓ
      await db.query(
        'DELETE FROM ten_delivery_settings WHERE tenant_id=? AND id=?',
        [tenantId, id]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ РЅР°СЃС‚СЂРѕР№РєРё РґРѕСЃС‚Р°РІРєРё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/print-api?store_id=1
   * Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РѕРєРµРЅ РґР»СЏ РїРµС‡Р°С‚Рё РїРѕ С„РёР»РёР°Р»Сѓ
   */
  async function selectPrintApiRow(tenantId, storeId) {
    try {
      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, token, is_active, created_at, updated_at, last_used_at,
                notify_new_order_enabled, notify_new_message_enabled,
                sound_new_order_url, sound_new_message_url,
                printer_name, agent_name, agent_version, last_heartbeat_at, agent_running,
                IF(
                  last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS agent_online,
                IF(
                  agent_running=1
                  AND last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS printer_online
         FROM print_api_tokens
         WHERE tenant_id=? AND store_id=? LIMIT 1`,
        [tenantId, storeId]
      );
      return rows[0] || null;
    } catch (err) {
      if (String(err?.code || "") !== "ER_BAD_FIELD_ERROR") throw err;
      const [rows] = await db.query(
        `SELECT id, tenant_id, store_id, token, is_active, created_at, updated_at, last_used_at,
                printer_name, agent_name, agent_version, last_heartbeat_at, agent_running,
                IF(
                  last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS agent_online,
                IF(
                  agent_running=1
                  AND last_heartbeat_at IS NOT NULL
                  AND last_heartbeat_at >= DATE_SUB(NOW(), INTERVAL 15 SECOND),
                  1,
                  0
                ) AS printer_online
         FROM print_api_tokens
         WHERE tenant_id=? AND store_id=? LIMIT 1`,
        [tenantId, storeId]
      );
      const row = rows[0] || null;
      if (!row) return null;
      return {
        ...row,
        notify_new_order_enabled: 1,
        notify_new_message_enabled: 1,
        sound_new_order_url: null,
        sound_new_message_url: null
      };
    }
  }

  async function selectPrintApiPrinters(tenantId, storeId, tokenId) {
    if (!tokenId) return [];
    let [rows] = await db.query(
      `SELECT id, system_name, display_name, is_default, status, last_seen_at, updated_at
       FROM print_printers
       WHERE tenant_id=? AND store_id=? AND token_id=?
       ORDER BY is_default DESC, display_name ASC, system_name ASC`,
      [tenantId, storeId, tokenId]
    );
    if (!rows.length) {
      [rows] = await db.query(
        `SELECT id, system_name, display_name, is_default, status, last_seen_at, updated_at
         FROM print_printers
         WHERE tenant_id=? AND store_id=?
         ORDER BY is_default DESC, display_name ASC, system_name ASC`,
        [tenantId, storeId]
      );
    }
    return rows || [];
  }

  async function selectPrintApiData(tenantId, storeId) {
    const row = await selectPrintApiRow(tenantId, storeId);
    if (!row) return null;
    const printers = await selectPrintApiPrinters(tenantId, storeId, Number(row.id));
    return { ...row, printers };
  }

  router.get('/print-api', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = Number(req.query.store_id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      }
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const row = await selectPrintApiData(tenantId, storeId);
      res.json({ ok: true, data: row || null });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ print API:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/print-api
   * body: { store_id }
   * РЎРѕР·РґР°С‘С‚ РёР»Рё РїРµСЂРµСЃРѕР·РґР°С‘С‚ С‚РѕРєРµРЅ РґР»СЏ РїРµС‡Р°С‚Рё
   */
  router.post('/print-api', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = Number(req.body?.store_id || req.query?.store_id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      }
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const token = makePrintApiToken();
      await db.query(
        `INSERT INTO print_api_tokens (tenant_id, store_id, token, is_active)
         VALUES (?,?,?,1)
         ON DUPLICATE KEY UPDATE
           token=VALUES(token),
           is_active=1,
           updated_at=NOW(),
           printer_name=NULL,
           agent_name=NULL,
           agent_version=NULL,
           last_heartbeat_at=NULL,
           agent_running=0`,
        [tenantId, storeId, token]
      );

      const row = await selectPrintApiData(tenantId, storeId);
      res.json({ ok: true, data: row || null });
    } catch (err) {
      console.error('РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё print API:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * PUT /api/admin/tenant/print-api
   * body: { store_id, notify_new_order_enabled, notify_new_message_enabled, sound_new_order_url, sound_new_message_url }
   */
  router.put('/print-api', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = Number(req.body?.store_id || req.query?.store_id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      }
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const [rows] = await db.query(
        `SELECT id, token, is_active FROM print_api_tokens WHERE tenant_id=? AND store_id=? LIMIT 1`,
        [tenantId, storeId]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'PRINT_TOKEN_NOT_FOUND' });
      }

      const hasOwn = (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key);
      const parseToggle = (value, fallback) => {
        if (value === undefined) return fallback;
        if (value === true || value === "true" || value === 1 || value === "1") return 1;
        if (value === false || value === "false" || value === 0 || value === "0") return 0;
        return fallback;
      };
      const normalizeUrl = (value, fallback) => {
        if (value === undefined) return fallback;
        const next = helpers.strOrNull(value);
        return next ? String(next).slice(0, 1024) : null;
      };

      const [currentRows] = await db.query(
        `SELECT
            notify_new_order_enabled,
            notify_new_message_enabled,
            sound_new_order_url,
            sound_new_message_url
         FROM print_api_tokens
         WHERE tenant_id=? AND store_id=?
         LIMIT 1`,
        [tenantId, storeId]
      );
      const current = currentRows[0] || {};
      const notifyNewOrder = hasOwn("notify_new_order_enabled")
        ? parseToggle(req.body.notify_new_order_enabled, Number(current.notify_new_order_enabled || 0) === 1 ? 1 : 0)
        : (Number(current.notify_new_order_enabled || 0) === 1 ? 1 : 0);
      const notifyNewMessage = hasOwn("notify_new_message_enabled")
        ? parseToggle(req.body.notify_new_message_enabled, Number(current.notify_new_message_enabled || 0) === 1 ? 1 : 0)
        : (Number(current.notify_new_message_enabled || 0) === 1 ? 1 : 0);
      const soundNewOrder = hasOwn("sound_new_order_url")
        ? normalizeUrl(req.body.sound_new_order_url, current.sound_new_order_url ?? null)
        : (current.sound_new_order_url ?? null);
      const soundNewMessage = hasOwn("sound_new_message_url")
        ? normalizeUrl(req.body.sound_new_message_url, current.sound_new_message_url ?? null)
        : (current.sound_new_message_url ?? null);

      try {
        await db.query(
          `UPDATE print_api_tokens
           SET notify_new_order_enabled=?, notify_new_message_enabled=?, sound_new_order_url=?, sound_new_message_url=?, updated_at=NOW()
           WHERE tenant_id=? AND store_id=?`,
          [notifyNewOrder, notifyNewMessage, soundNewOrder, soundNewMessage, tenantId, storeId]
        );
      } catch (updateErr) {
        if (String(updateErr?.code || "") === "ER_BAD_FIELD_ERROR") {
          return res.status(409).json({ ok: false, error: 'PRINT_API_MIGRATION_REQUIRED' });
        }
        throw updateErr;
      }

      if (hasOwn("default_printer_id")) {
        const defaultPrinterId = Number(req.body.default_printer_id || 0);
        if (defaultPrinterId > 0) {
          const [printerRows] = await db.query(
            `SELECT id FROM print_printers
             WHERE id=? AND tenant_id=? AND store_id=?
             LIMIT 1`,
            [defaultPrinterId, tenantId, storeId]
          );
          if (!printerRows.length) {
            return res.status(404).json({ ok: false, error: 'PRINT_PRINTER_NOT_FOUND' });
          }
          await db.query(
            `UPDATE print_printers
             SET is_default=IF(id=?,1,0), updated_at=NOW()
             WHERE tenant_id=? AND store_id=?`,
            [defaultPrinterId, tenantId, storeId]
          );
        }
      }

      const row = await selectPrintApiData(tenantId, storeId);
      res.json({ ok: true, data: row || null });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ print API РЅР°СЃС‚СЂРѕРµРє:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  function getDefaultReceiptTemplateHtml() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Чек заказа #{{ order.id }}</title>
  <style>
    @media print {
      @page { size: 80mm auto; margin: 0; }
      body { margin: 0; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      margin: 0;
      padding: 5mm 3mm;
      font-family: 'Courier New', monospace;
      font-size: 11pt;
      font-weight: bold;
      line-height: 1.3;
      width: 80mm;
      max-width: 80mm;
      background: white;
    }
    .receipt-header { text-align: center; font-size: 16pt; margin-bottom: 10px; }
    .receipt-date { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
    .receipt-section { margin: 10px 0; }
    .receipt-divider { border-top: 1px dashed #000; margin: 10px 0; }
    .receipt-items-group-title { text-transform: uppercase; margin: 2px 0 5px; }
    .receipt-items-group-list { padding-left: 2px; }
    .receipt-items-type-divider { border-top: 1px dashed #000; margin: 8px 0; }
    .receipt-item { padding: 3px 0 2px; }
    .receipt-item + .receipt-item { border-top: 1px dotted #000; margin-top: 3px; padding-top: 4px; }
    .receipt-item-row { display: flex; align-items: flex-start; gap: 6px; }
    .receipt-item-qty, .receipt-item-price { flex-shrink: 0; }
    .receipt-item-name { flex: 1; min-width: 0; word-wrap: break-word; }
    .receipt-item-price { text-align: right; }
    .receipt-composition { margin: 2px 0 1px; font-size: 9pt; }
    .receipt-composition-item { margin: 1px 0; word-wrap: break-word; }
    .receipt-composition-item--group { margin-left: 8px; }
    .receipt-composition-item--sub { margin-left: 16px; }
    .receipt-summary-row { display: flex; justify-content: space-between; gap: 8px; margin-top: 4px; }
    .receipt-summary-label { flex: 1; }
    .receipt-summary-value { flex-shrink: 0; text-align: right; }
    .receipt-total { text-align: center; font-size: 14pt; margin: 15px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 10px 0; }
    .receipt-footer { margin-top: 20px; text-align: center; font-size: 10pt; }
    .receipt-old-price { text-decoration: line-through; margin-right: 4px; }
  </style>
</head>
<body>
  <div class="receipt-header">ЗАКАЗ #{{ order.id }}</div>
  <div class="receipt-date">{{ order.created_at }}</div>
  <div class="receipt-divider"></div>
  <div class="receipt-section">{{ order.schedule_text }}</div>
  <div class="receipt-section">
    <div>{{ customer.name }}</div>
    <div>{{ customer.phone }}</div>
  </div>
  <div class="receipt-section">
    <div>{{ delivery.type }}</div>
    <div>{{ delivery.address }}</div>
  </div>
  <div class="receipt-section">{{ order.address_comment }}</div>
  <div class="receipt-section">{{ order.comment }}</div>
  <div class="receipt-divider"></div>
  <div class="receipt-section">{{ receipt.items_html }}</div>
  <div class="receipt-divider"></div>
  <div class="receipt-section">{{ receipt.summary_html }}</div>
  <div class="receipt-footer">Спасибо за заказ!</div>
</body>
</html>`;
  }

  function getDefaultLabelTemplateHtml() {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Этикетка товара #{{ order.id }}</title>
  <style>
    @media print {
      @page { size: 58mm 60mm; margin: 0; }
      body { margin: 0; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 58mm;
      height: 60mm;
      padding: 3mm;
      font-family: 'Courier New', monospace;
      font-size: 8.5pt;
      font-weight: 700;
      line-height: 1.18;
      color: #111;
      background: #fff;
      overflow: hidden;
    }
    .label-header { display: flex; justify-content: space-between; align-items: baseline; gap: 2mm; font-size: 9pt; }
    .label-order { font-weight: 700; white-space: nowrap; }
    .label-datetime { font-weight: 700; white-space: nowrap; text-align: right; }
    .label-schedule { margin-top: 1mm; font-size: 8pt; font-weight: 700; }
    .label-item-name { margin-top: 1.25mm; font-size: 9pt; font-weight: 700; word-wrap: break-word; }
    .label-composition { margin-top: 1mm; font-size: 8pt; line-height: 1.16; }
    .label-composition-item { margin-left: 4mm; word-wrap: break-word; }
    .label-gift { margin-top: 1mm; font-size: 8pt; }
  </style>
</head>
<body>
  <div class="label-header">
    <span class="label-order">№{{ order.id }}</span>
    <span class="label-datetime">{{ order.created_at_short }}</span>
  </div>
  <div class="label-schedule">{{ order.schedule_text }}</div>
  <div class="label-item-name">{{ item.name }}</div>
  <div class="label-composition">{{ item.composition_html }}</div>
  <div class="label-gift">{{ gift.html }}</div>
</body>
</html>`;
  }

  function getDefaultPrintTemplateHtml(documentType) {
    return documentType === "label" ? getDefaultLabelTemplateHtml() : getDefaultReceiptTemplateHtml();
  }

  async function ensureDefaultPrintTemplates(tenantId) {
    const defaults = [
      { documentType: "receipt", title: "Чек заказа" },
      { documentType: "label", title: "Этикетка товара" },
    ];
    for (const item of defaults) {
      if (item.documentType === "receipt") item.title = "\u0427\u0435\u043a \u0437\u0430\u043a\u0430\u0437\u0430";
      if (item.documentType === "label") item.title = "\u042d\u0442\u0438\u043a\u0435\u0442\u043a\u0430 \u0442\u043e\u0432\u0430\u0440\u0430";
      await db.query(
        `INSERT INTO print_templates (tenant_id, store_id, document_type, title, template_html, is_active)
         VALUES (?, NULL, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           title=COALESCE(NULLIF(title,''), VALUES(title)),
           template_html=COALESCE(NULLIF(template_html,''), VALUES(template_html)),
           is_active=1`,
        [tenantId, item.documentType, item.title, getDefaultPrintTemplateHtml(item.documentType)]
      );
    }
  }

  async function selectPrintTemplatesData(tenantId) {
    await ensureDefaultPrintTemplates(tenantId);
    const [rows] = await db.query(
      `SELECT id, tenant_id, store_id, document_type, title, template_html, is_active, created_at, updated_at
       FROM print_templates
       WHERE tenant_id=? AND is_active=1
       ORDER BY FIELD(document_type,'receipt','label'), id ASC`,
      [tenantId]
    );
    return (rows || []).map((row) => {
      const documentType = String(row.document_type || "");
      if (documentType !== "receipt" && documentType !== "label") return row;
      const defaultTemplateHtml = getDefaultPrintTemplateHtml(documentType);
      const templateHtml = String(row.template_html || "");
      const legacyLabelSignature = documentType === "label" && [
        "label-header { display: flex; justify-content: center; gap: 2mm; font-size: 9pt; }",
        "label-item-row { display: flex; align-items: flex-start; gap: 2mm; margin-top: 2mm; }",
        "label-item-price { flex-shrink: 0; }"
      ].every((part) => templateHtml.includes(part));
      const normalizedTemplateHtml = legacyLabelSignature ? defaultTemplateHtml : templateHtml;
      const isCustomized = String(normalizedTemplateHtml || "").trim() !== String(defaultTemplateHtml || "").trim();
      return {
        ...row,
        default_template_html: defaultTemplateHtml,
        template_html: normalizedTemplateHtml,
        is_customized: isCustomized ? 1 : 0,
      };
    });
  }

  router.get('/print-templates', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      const templates = await selectPrintTemplatesData(tenantId);
      res.json({ ok: true, data: { templates } });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С€Р°Р±Р»РѕРЅРѕРІ РїРµС‡Р°С‚Рё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/print-templates/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const templateId = Number(req.params.id || 0);
      const title = helpers.strOrNull(req.body?.title);
      const templateHtml = String(req.body?.template_html ?? "").trim();
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(templateId) || templateId <= 0) return res.status(400).json({ ok: false, error: 'BAD_TEMPLATE_ID' });
      if (!title) return res.status(400).json({ ok: false, error: 'TITLE_REQUIRED' });
      if (!templateHtml) return res.status(400).json({ ok: false, error: 'TEMPLATE_HTML_REQUIRED' });
      const [rows] = await db.query(
        `SELECT id FROM print_templates WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1`,
        [tenantId, templateId]
      );
      if (!rows.length) return res.status(404).json({ ok: false, error: 'TEMPLATE_NOT_FOUND' });
      await db.query(
        `UPDATE print_templates
         SET title=?, template_html=?, updated_at=NOW()
         WHERE tenant_id=? AND id=?`,
        [title, templateHtml, tenantId, templateId]
      );
      const templates = await selectPrintTemplatesData(tenantId);
      res.json({ ok: true, data: { templates }, template_id: templateId });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ С€Р°Р±Р»РѕРЅР° РїРµС‡Р°С‚Рё:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  async function selectProductionZonesData(tenantId) {
    const [zoneRows] = await db.query(
      `SELECT z.id, z.name, z.description, z.sort_order, z.is_active,
              r.id AS rule_id, r.store_id, r.printer_id, r.template_id, r.is_enabled,
              s.name AS store_name,
              p.display_name AS printer_display_name,
              p.system_name AS printer_system_name,
              p.status AS printer_status,
              pt.title AS template_title
       FROM prod_production_zones z
       LEFT JOIN prod_store_print_rules r
         ON r.id=(
           SELECT rr.id
           FROM prod_store_print_rules rr
           WHERE rr.tenant_id=z.tenant_id
             AND rr.production_zone_id=z.id
             AND rr.document_type='label'
           ORDER BY rr.updated_at DESC, rr.id DESC
           LIMIT 1
         )
       LEFT JOIN ten_stores s
         ON s.tenant_id=z.tenant_id
        AND s.id=r.store_id
       LEFT JOIN print_printers p
         ON p.tenant_id=z.tenant_id
        AND p.id=r.printer_id
       LEFT JOIN print_templates pt
         ON pt.tenant_id=z.tenant_id
        AND pt.id=r.template_id
       WHERE z.tenant_id=? AND z.is_active=1
       ORDER BY z.sort_order ASC, z.name ASC, z.id ASC`,
      [tenantId]
    );
    const [storeRows] = await db.query(
      `SELECT id, name
       FROM ten_stores
       WHERE tenant_id=?
       ORDER BY name ASC, id ASC`,
      [tenantId]
    );
    const [printerRows] = await db.query(
      `SELECT id, store_id, system_name, display_name, is_default, status
       FROM print_printers
       WHERE tenant_id=? AND status='online'
       ORDER BY store_id ASC, is_default DESC, display_name ASC, system_name ASC`,
      [tenantId]
    );
    const [ruleRows] = await db.query(
      `SELECT id, store_id, production_zone_id, printer_id, template_id, copies, is_enabled
       FROM prod_store_print_rules
       WHERE tenant_id=? AND document_type='label'
       ORDER BY updated_at DESC, id DESC`,
      [tenantId]
    );
    const templates = await selectPrintTemplatesData(tenantId);
    return {
      zones: zoneRows || [],
      stores: storeRows || [],
      printers: printerRows || [],
      rules: ruleRows || [],
      templates
    };
  }

  router.get('/production-zones', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      const data = await selectProductionZonesData(tenantId);
      res.json({ ok: true, data });
    } catch (err) {
      console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРѕРёР·РІРѕРґСЃС‚РІРµРЅРЅС‹С… Р·РѕРЅ:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.post('/production-zones', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const name = helpers.strOrNull(req.body?.name);
      const storeId = Number(req.body?.store_id || 0);
      const printerId = Number(req.body?.printer_id || 0);
      const templateId = Number(req.body?.template_id || 0);
      const copies = Math.max(1, Number(req.body?.copies || 1) || 1);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      if (!Number.isFinite(printerId) || printerId <= 0) return res.status(400).json({ ok: false, error: 'BAD_PRINTER_ID' });
      if (!Number.isFinite(templateId) || templateId <= 0) return res.status(400).json({ ok: false, error: 'BAD_TEMPLATE_ID' });
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
      const [printerRows] = await db.query(
        `SELECT id FROM print_printers
         WHERE id=? AND tenant_id=? AND store_id=? AND status='online'
         LIMIT 1`,
        [printerId, tenantId, storeId]
      );
      if (!printerRows.length) return res.status(404).json({ ok: false, error: 'PRINT_PRINTER_NOT_FOUND' });
      const [templateRows] = await db.query(
        `SELECT id FROM print_templates
         WHERE id=? AND tenant_id=? AND is_active=1
         LIMIT 1`,
        [templateId, tenantId]
      );
      if (!templateRows.length) return res.status(404).json({ ok: false, error: 'PRINT_TEMPLATE_NOT_FOUND' });
      const [sortRows] = await db.query(
        `SELECT COALESCE(MAX(sort_order),0)+10 AS next_sort
         FROM prod_production_zones
         WHERE tenant_id=?`,
        [tenantId]
      );
      const sortOrder = Number(sortRows[0]?.next_sort || 10);
      let insertResult;
      try {
        [insertResult] = await db.query(
          `INSERT INTO prod_production_zones (tenant_id, name, description, sort_order, is_active)
           VALUES (?,?,?,?,1)`,
          [tenantId, name, null, sortOrder]
        );
      } catch (insertErr) {
        if (String(insertErr?.code || "") === "ER_DUP_ENTRY") {
          return res.status(409).json({ ok: false, error: 'ZONE_NAME_EXISTS' });
        }
        throw insertErr;
      }
      const zoneId = Number(insertResult.insertId || 0);
      await db.query(
        `INSERT INTO prod_store_print_rules
           (tenant_id, store_id, production_zone_id, document_type, printer_id, template_id, copies, is_enabled, sort_order)
         VALUES (?,?,?,?,?,?,?,1,0)
         ON DUPLICATE KEY UPDATE
           printer_id=VALUES(printer_id),
           template_id=VALUES(template_id),
           copies=VALUES(copies),
           is_enabled=1,
           updated_at=NOW()`,
        [tenantId, storeId, zoneId, 'label', printerId, templateId, copies]
      );
      const data = await selectProductionZonesData(tenantId);
      res.json({ ok: true, data, zone_id: zoneId });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РїСЂРѕРёР·РІРѕРґСЃС‚РІРµРЅРЅРѕР№ Р·РѕРЅС‹:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  router.put('/production-zones/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const zoneId = Number(req.params.id || 0);
      const name = helpers.strOrNull(req.body?.name);
      const storeId = Number(req.body?.store_id || 0);
      const printerId = Number(req.body?.printer_id || 0);
      const templateId = Number(req.body?.template_id || 0);
      const copies = Math.max(1, Number(req.body?.copies || 1) || 1);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!Number.isFinite(zoneId) || zoneId <= 0) return res.status(400).json({ ok: false, error: 'BAD_ZONE_ID' });
      if (!name) return res.status(400).json({ ok: false, error: 'NAME_REQUIRED' });
      if (!Number.isFinite(storeId) || storeId <= 0) return res.status(400).json({ ok: false, error: 'BAD_STORE_ID' });
      if (!Number.isFinite(printerId) || printerId <= 0) return res.status(400).json({ ok: false, error: 'BAD_PRINTER_ID' });
      if (!Number.isFinite(templateId) || templateId <= 0) return res.status(400).json({ ok: false, error: 'BAD_TEMPLATE_ID' });
      const [zoneRows] = await db.query(
        `SELECT id FROM prod_production_zones WHERE tenant_id=? AND id=? AND is_active=1 LIMIT 1`,
        [tenantId, zoneId]
      );
      if (!zoneRows.length) return res.status(404).json({ ok: false, error: 'ZONE_NOT_FOUND' });
      const storeExists = await ensureStoreExists(tenantId, storeId);
      if (!storeExists) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });
      const [printerRows] = await db.query(
        `SELECT id FROM print_printers
         WHERE id=? AND tenant_id=? AND store_id=? AND status='online'
         LIMIT 1`,
        [printerId, tenantId, storeId]
      );
      if (!printerRows.length) return res.status(404).json({ ok: false, error: 'PRINT_PRINTER_NOT_FOUND' });
      const [templateRows] = await db.query(
        `SELECT id FROM print_templates
         WHERE id=? AND tenant_id=? AND is_active=1
         LIMIT 1`,
        [templateId, tenantId]
      );
      if (!templateRows.length) return res.status(404).json({ ok: false, error: 'PRINT_TEMPLATE_NOT_FOUND' });
      try {
        await db.query(
          `UPDATE prod_production_zones
           SET name=?, description=NULL, updated_at=NOW()
           WHERE tenant_id=? AND id=?`,
          [name, tenantId, zoneId]
        );
      } catch (updateErr) {
        if (String(updateErr?.code || "") === "ER_DUP_ENTRY") {
          return res.status(409).json({ ok: false, error: 'ZONE_NAME_EXISTS' });
        }
        throw updateErr;
      }
      await db.query(
        `INSERT INTO prod_store_print_rules
           (tenant_id, store_id, production_zone_id, document_type, printer_id, template_id, copies, is_enabled, sort_order)
         VALUES (?,?,?,?,?,?,?,1,0)
         ON DUPLICATE KEY UPDATE
           printer_id=VALUES(printer_id),
           template_id=VALUES(template_id),
           copies=VALUES(copies),
           is_enabled=1,
           updated_at=NOW()`,
        [tenantId, storeId, zoneId, 'label', printerId, templateId, copies]
      );
      const data = await selectProductionZonesData(tenantId);
      res.json({ ok: true, data, zone_id: zoneId });
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРѕРёР·РІРѕРґСЃС‚РІРµРЅРЅРѕР№ Р·РѕРЅС‹:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/password
   * body: { password, password_confirm }
   */
  router.post('/password', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const password = helpers.strOrNull(req.body.password);
      const confirm = helpers.strOrNull(req.body.password_confirm);

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }
      if (password !== confirm) {
        return res.status(400).json({ ok: false, error: 'PASSWORD_MISMATCH' });
      }

      const hash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE ten_tenants SET password_hash=? WHERE id=?',
        [hash, tenantId]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('РћС€РёР±РєР° СЃРјРµРЅС‹ РїР°СЂРѕР»СЏ tenant:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Telegram: РїСЂРёРІСЏР·РєР° С‡Р°С‚РѕРІ Рє С„РёР»РёР°Р»Р°Рј
  // ------------------------------

  /**
   * POST /api/admin/tenant/stores/:id/telegram/connect
   * Р“РµРЅРµСЂРёСЂСѓРµС‚ РѕРґРЅРѕСЂР°Р·РѕРІСѓСЋ СЃСЃС‹Р»РєСѓ РґР»СЏ РїСЂРёРІСЏР·РєРё С‡Р°С‚Р° Рє С„РёР»РёР°Р»Сѓ.
   */
  router.post('/stores/:id/telegram/connect', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });

      const [storeRows] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (!storeRows.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const token = crypto.randomBytes(24).toString('hex');
      const secretKey = crypto.randomBytes(16).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.query(
        `INSERT INTO ten_store_telegram (tenant_id, store_id, connect_token, connect_token_expires_at, secret_key) VALUES (?, ?, ?, ?, ?)`,
        [tenantId, storeId, token, expiresAt, secretKey]
      );

      const botUsername = getEffectiveTelegramBotConfig().telegram_bot_username;
      const link = botUsername ? `https://t.me/${botUsername}?start=${token}` : null;

      res.json({ ok: true, token, link, expires_at: expiresAt.toISOString() });
    } catch (err) {
      console.error('Telegram connect:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/stores/:id/telegram/add-by-keys
   * РџРѕРґРєР»СЋС‡РёС‚СЊ С‡Р°С‚ РїРѕ API key (chat_id) Рё Secret key РёР· Р±РѕС‚Р° (РєР°Рє Сѓ РўРёР»СЊРґС‹).
   */
  router.post('/stores/:id/telegram/add-by-keys', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      const apiKey = req.body.api_key != null ? String(req.body.api_key).trim() : '';
      const secretKey = req.body.secret_key != null ? String(req.body.secret_key).trim() : '';
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });
      if (!apiKey || !secretKey) return res.status(400).json({ ok: false, error: 'API_KEY_AND_SECRET_REQUIRED' });

      const chatId = Number(apiKey);
      if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'INVALID_API_KEY' });

      const [storeRows] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (!storeRows.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const [pending] = await db.query(
        'SELECT id, telegram_chat_id FROM ten_telegram_pending WHERE secret_key=? AND expires_at > NOW() LIMIT 1',
        [secretKey]
      );
      if (!pending.length) return res.status(400).json({ ok: false, error: 'SECRET_INVALID_OR_EXPIRED' });
      const row = pending[0];
      if (Number(row.telegram_chat_id) !== chatId) return res.status(400).json({ ok: false, error: 'API_KEY_MISMATCH' });

      const [existing] = await db.query(
        'SELECT id FROM ten_store_telegram WHERE tenant_id=? AND store_id=? AND telegram_chat_id=? LIMIT 1',
        [tenantId, storeId, chatId]
      );
      await db.query('DELETE FROM ten_telegram_pending WHERE id=?', [row.id]);
      if (existing.length) {
        return res.json({ ok: true });
      }

      await db.query(
        'INSERT INTO ten_store_telegram (tenant_id, store_id, telegram_chat_id, secret_key) VALUES (?, ?, ?, ?)',
        [tenantId, storeId, chatId, secretKey]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('Telegram add-by-keys:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/stores/:id/telegram
   * РЎРїРёСЃРѕРє РїСЂРёРІСЏР·РѕРє Telegram РґР»СЏ С„РёР»РёР°Р»Р°.
   */
  router.get('/stores/:id/telegram', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });

      const [rows] = await db.query(
        `SELECT t.id, t.telegram_chat_id, t.secret_key, t.label, t.created_at
         FROM ten_store_telegram t
         INNER JOIN (
           SELECT telegram_chat_id, MAX(id) AS max_id
           FROM ten_store_telegram
           WHERE tenant_id=? AND store_id=? AND telegram_chat_id IS NOT NULL
           GROUP BY tenant_id, store_id, telegram_chat_id
         ) g ON t.telegram_chat_id = g.telegram_chat_id AND t.id = g.max_id
         WHERE t.tenant_id=? AND t.store_id=?
         ORDER BY t.id DESC`,
        [tenantId, storeId, tenantId, storeId]
      );
      const bindings = rows.map((r) => ({
        id: r.id,
        telegram_chat_id: r.telegram_chat_id,
        secret_key: r.secret_key || null,
        label: r.label,
        created_at: r.created_at
      }));

      res.json({ ok: true, bindings });
    } catch (err) {
      console.error('Telegram list:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/stores/:storeId/telegram/:bindingId
   * РЈРґР°Р»РёС‚СЊ РїСЂРёРІСЏР·РєСѓ.
   */
  router.delete('/stores/:storeId/telegram/:bindingId', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.storeId);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      if (!tenantId || !storeId || !bindingId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      const [result] = await db.query(
        'DELETE FROM ten_store_telegram WHERE id=? AND tenant_id=? AND store_id=? AND telegram_chat_id IS NOT NULL',
        [bindingId, tenantId, storeId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      res.json({ ok: true });
    } catch (err) {
      console.error('Telegram delete:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/stores/:id/max/add-by-keys
   * РџРѕРґРєР»СЋС‡РёС‚СЊ MAX-Р°РєРєР°СѓРЅС‚ РїРѕ API key (max_user_id) Рё Secret key РёР· СЃРёСЃС‚РµРјРЅРѕРіРѕ MAX-Р±РѕС‚Р°.
   */
  router.post('/stores/:id/max/add-by-keys', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      const apiKey = req.body.api_key != null ? String(req.body.api_key).trim() : '';
      const secretKey = req.body.secret_key != null ? String(req.body.secret_key).trim() : '';
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });
      if (!apiKey || !secretKey) return res.status(400).json({ ok: false, error: 'API_KEY_AND_SECRET_REQUIRED' });

      const [storeRows] = await db.query(
        'SELECT id FROM ten_stores WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, storeId]
      );
      if (!storeRows.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      const [pending] = await db.query(
        'SELECT id, max_user_id FROM ten_max_pending WHERE secret_key=? AND expires_at > NOW() LIMIT 1',
        [secretKey]
      );
      if (!pending.length) return res.status(400).json({ ok: false, error: 'SECRET_INVALID_OR_EXPIRED' });
      const row = pending[0];
      if (String(row.max_user_id || '').trim() !== apiKey) {
        return res.status(400).json({ ok: false, error: 'API_KEY_MISMATCH' });
      }

      const [existing] = await db.query(
        'SELECT id FROM ten_store_max WHERE tenant_id=? AND store_id=? AND max_user_id=? LIMIT 1',
        [tenantId, storeId, apiKey]
      );
      await db.query('DELETE FROM ten_max_pending WHERE id=?', [row.id]);
      if (existing.length) {
        return res.json({ ok: true });
      }

      await db.query(
        'INSERT INTO ten_store_max (tenant_id, store_id, max_user_id, secret_key) VALUES (?, ?, ?, ?)',
        [tenantId, storeId, apiKey, secretKey]
      );

      res.json({ ok: true });
    } catch (err) {
      console.error('MAX add-by-keys:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/stores/:id/max
   * РЎРїРёСЃРѕРє MAX-РїСЂРёРІСЏР·РѕРє РґР»СЏ С„РёР»РёР°Р»Р°.
   */
  router.get('/stores/:id/max', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.id);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!storeId) return res.status(400).json({ ok: false, error: 'STORE_ID_REQUIRED' });

      const [rows] = await db.query(
        `SELECT t.id, t.max_user_id, t.secret_key, t.label, t.created_at
         FROM ten_store_max t
         INNER JOIN (
           SELECT max_user_id, MAX(id) AS max_id
           FROM ten_store_max
           WHERE tenant_id=? AND store_id=? AND max_user_id IS NOT NULL AND max_user_id <> ''
           GROUP BY tenant_id, store_id, max_user_id
         ) g ON t.max_user_id = g.max_user_id AND t.id = g.max_id
         WHERE t.tenant_id=? AND t.store_id=?
         ORDER BY t.id DESC`,
        [tenantId, storeId, tenantId, storeId]
      );
      const bindings = rows.map((r) => ({
        id: r.id,
        max_user_id: r.max_user_id,
        secret_key: r.secret_key || null,
        label: r.label,
        created_at: r.created_at
      }));

      res.json({ ok: true, bindings });
    } catch (err) {
      console.error('MAX list:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/stores/:storeId/max/:bindingId
   * РЈРґР°Р»РёС‚СЊ MAX-РїСЂРёРІСЏР·РєСѓ С„РёР»РёР°Р»Р°.
   */
  router.delete('/stores/:storeId/max/:bindingId', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const storeId = helpers.numOrNull(req.params.storeId);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      if (!tenantId || !storeId || !bindingId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      const [result] = await db.query(
        'DELETE FROM ten_store_max WHERE id=? AND tenant_id=? AND store_id=? AND max_user_id IS NOT NULL AND max_user_id <> \'\'',
        [bindingId, tenantId, storeId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      res.json({ ok: true });
    } catch (err) {
      console.error('MAX delete:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * GET /api/admin/tenant/notifications
   * РЎРІРѕРґРєР° РїРѕ РІСЃРµРј С„РёР»РёР°Р»Р°Рј: РµСЃС‚СЊ Р»Рё РїСЂРёРІСЏР·РєР° Telegram.
   */
  router.get('/notifications', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [stores] = await db.query(
        'SELECT tenant_id, id, name, code FROM ten_stores WHERE tenant_id=? ORDER BY id ASC',
        [tenantId]
      );
      const [bindings] = await db.query(
        `SELECT store_id, COUNT(*) AS cnt FROM ten_store_telegram
         WHERE tenant_id=? AND telegram_chat_id IS NOT NULL GROUP BY store_id`,
        [tenantId]
      );
      const countByStore = new Map(bindings.map((b) => [Number(b.store_id), Number(b.cnt)]));

      const storesWithTelegram = stores.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        telegram_count: countByStore.get(s.id) || 0
      }));

      res.json({ ok: true, stores: storesWithTelegram });
    } catch (err) {
      console.error('Notifications overview:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // ------------------------------
  // Р“Р»РѕР±Р°Р»СЊРЅС‹Рµ Telegram-СѓРІРµРґРѕРјР»РµРЅРёСЏ РЅР° СѓСЂРѕРІРЅРµ РєРѕРјРїР°РЅРёРё
  // ------------------------------

  /**
   * GET /api/admin/tenant/telegram
   * РЎРїРёСЃРѕРє РіР»РѕР±Р°Р»СЊРЅС‹С… Telegram РїСЂРёРІСЏР·РѕРє РєРѕРјРїР°РЅРёРё + С„РёР»РёР°Р»С‹ СЃРѕ СЃС‚Р°С‚СѓСЃР°РјРё.
   */
  router.get('/telegram', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });

      const [bindings] = await db.query(
        `SELECT id, telegram_chat_id, secret_key, label, created_at
         FROM ten_tenant_telegram
         WHERE tenant_id=? AND telegram_chat_id IS NOT NULL
         ORDER BY id DESC`,
        [tenantId]
      );

      const [stores] = await db.query(
        'SELECT id, name, code FROM ten_stores WHERE tenant_id=? ORDER BY id ASC',
        [tenantId]
      );

      // Р”Р»СЏ РєР°Р¶РґРѕР№ РїСЂРёРІСЏР·РєРё РїРѕР»СѓС‡Р°РµРј РІРєР»СЋС‡С‘РЅРЅС‹Рµ С„РёР»РёР°Р»С‹
      for (const b of bindings) {
        const [enabledStores] = await db.query(
          `SELECT store_id, is_enabled FROM ten_tenant_telegram_stores
           WHERE tenant_telegram_id=?`,
          [b.id]
        );
        b.store_settings = enabledStores.map(s => ({
          store_id: s.store_id,
          is_enabled: Number(s.is_enabled) === 1
        }));
      }

      res.json({
        ok: true,
        bindings: bindings.map(b => ({
          id: b.id,
          telegram_chat_id: b.telegram_chat_id,
          secret_key: b.secret_key || null,
          label: b.label,
          created_at: b.created_at,
          store_settings: b.store_settings || []
        })),
        stores: stores.map(s => ({ id: s.id, name: s.name, code: s.code }))
      });
    } catch (err) {
      console.error('Tenant telegram list:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/telegram/add-by-keys
   * РџРѕРґРєР»СЋС‡РёС‚СЊ РіР»РѕР±Р°Р»СЊРЅС‹Р№ Telegram РїРѕ API key Рё Secret key.
   */
  router.post('/telegram/add-by-keys', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const apiKey = req.body.api_key != null ? String(req.body.api_key).trim() : '';
      const secretKey = req.body.secret_key != null ? String(req.body.secret_key).trim() : '';
      if (!tenantId) return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      if (!apiKey || !secretKey) return res.status(400).json({ ok: false, error: 'API_KEY_AND_SECRET_REQUIRED' });

      const chatId = Number(apiKey);
      if (!Number.isFinite(chatId)) return res.status(400).json({ ok: false, error: 'API_KEY_INVALID' });

      // РџСЂРѕРІРµСЂСЏРµРј secret_key РІ pending
      const [pending] = await db.query(
        'SELECT id, telegram_chat_id FROM ten_telegram_pending WHERE secret_key=? AND expires_at > NOW() LIMIT 1',
        [secretKey]
      );
      if (!pending.length) return res.status(400).json({ ok: false, error: 'SECRET_INVALID_OR_EXPIRED' });
      const row = pending[0];
      if (Number(row.telegram_chat_id) !== chatId) return res.status(400).json({ ok: false, error: 'API_KEY_MISMATCH' });

      // РџСЂРѕРІРµСЂСЏРµРј, РЅРµ РїСЂРёРІСЏР·Р°РЅ Р»Рё СѓР¶Рµ СЌС‚РѕС‚ С‡Р°С‚
      const [existing] = await db.query(
        'SELECT id FROM ten_tenant_telegram WHERE tenant_id=? AND telegram_chat_id=? LIMIT 1',
        [tenantId, chatId]
      );
      await db.query('DELETE FROM ten_telegram_pending WHERE id=?', [row.id]);
      if (existing.length) {
        return res.json({ ok: true, id: existing[0].id });
      }

      const [result] = await db.query(
        'INSERT INTO ten_tenant_telegram (tenant_id, telegram_chat_id, secret_key) VALUES (?, ?, ?)',
        [tenantId, chatId, secretKey]
      );

      res.json({ ok: true, id: result.insertId });
    } catch (err) {
      console.error('Tenant telegram add-by-keys:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * DELETE /api/admin/tenant/telegram/:bindingId
   * РЈРґР°Р»РёС‚СЊ РіР»РѕР±Р°Р»СЊРЅСѓСЋ РїСЂРёРІСЏР·РєСѓ.
   */
  router.delete('/telegram/:bindingId', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      if (!tenantId || !bindingId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      const [result] = await db.query(
        'DELETE FROM ten_tenant_telegram WHERE id=? AND tenant_id=?',
        [bindingId, tenantId]
      );
      if (result.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

      res.json({ ok: true });
    } catch (err) {
      console.error('Tenant telegram delete:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  /**
   * POST /api/admin/tenant/telegram/:bindingId/stores
   * РћР±РЅРѕРІРёС‚СЊ РЅР°СЃС‚СЂРѕР№РєРё С„РёР»РёР°Р»РѕРІ РґР»СЏ РіР»РѕР±Р°Р»СЊРЅРѕР№ РїСЂРёРІСЏР·РєРё.
   * Body: { store_id: number, is_enabled: boolean }
   */
  router.post('/telegram/:bindingId/stores', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const bindingId = helpers.numOrNull(req.params.bindingId);
      const storeId = helpers.numOrNull(req.body.store_id);
      const isEnabled = req.body.is_enabled === true || req.body.is_enabled === 1;
      if (!tenantId || !bindingId || !storeId) return res.status(400).json({ ok: false, error: 'BAD_PARAMS' });

      // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ РїСЂРёРІСЏР·РєР° РїСЂРёРЅР°РґР»РµР¶РёС‚ tenant
      const [binding] = await db.query(
        'SELECT id FROM ten_tenant_telegram WHERE id=? AND tenant_id=? LIMIT 1',
        [bindingId, tenantId]
      );
      if (!binding.length) return res.status(404).json({ ok: false, error: 'BINDING_NOT_FOUND' });

      // РџСЂРѕРІРµСЂСЏРµРј, С‡С‚Рѕ С„РёР»РёР°Р» РїСЂРёРЅР°РґР»РµР¶РёС‚ tenant
      const [store] = await db.query(
        'SELECT id FROM ten_stores WHERE id=? AND tenant_id=? LIMIT 1',
        [storeId, tenantId]
      );
      if (!store.length) return res.status(404).json({ ok: false, error: 'STORE_NOT_FOUND' });

      if (isEnabled) {
        // Upsert: РґРѕР±Р°РІР»СЏРµРј РёР»Рё РѕР±РЅРѕРІР»СЏРµРј
        await db.query(
          `INSERT INTO ten_tenant_telegram_stores (tenant_telegram_id, store_id, is_enabled)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE is_enabled=1`,
          [bindingId, storeId]
        );
      } else {
        // РЈРґР°Р»СЏРµРј Р·Р°РїРёСЃСЊ (РёР»Рё РјРѕР¶РЅРѕ РѕР±РЅРѕРІРёС‚СЊ is_enabled=0)
        await db.query(
          'DELETE FROM ten_tenant_telegram_stores WHERE tenant_telegram_id=? AND store_id=?',
          [bindingId, storeId]
        );
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('Tenant telegram stores update:', err);
      res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  // в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ РџСЂРѕРІРµСЂРєР° РїРѕРґРєР»СЋС‡РµРЅРёСЏ РґРѕРјРµРЅР° в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
  router.post('/check-domain', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const normalized = normalizeCustomDomain(req.body.domain);
      const domain = normalized.ascii || '';
      if (!domain) return res.json({ ok: false, error: 'NO_DOMAIN' });

      return res.json({
        ok: true,
        result: await performTenantDomainCheck({ tenantId, domainAscii: domain })
      });

      const dns = require('dns').promises;
      const http = require('http');
      const https = require('https');

      const result = { dns: false, http: false, ssl: false, dns_detail: '', http_detail: '', ssl_detail: '' };

      // 1. DNS check вЂ” resolve domain
      try {
        const addresses = await dns.resolve4(domain);
        if (addresses && addresses.length) {
          result.dns = true;
          result.dns_detail = addresses.join(', ');
        }
      } catch (e) {
        result.dns_detail = e.code === 'ENOTFOUND' ? 'Р”РѕРјРµРЅ РЅРµ РЅР°Р№РґРµРЅ' : (e.message || 'РћС€РёР±РєР° DNS');
      }

      // 2. HTTP check вЂ” try to reach the domain
      if (result.dns) {
        try {
          await new Promise((resolve, reject) => {
            const req2 = http.get({ hostname: domain, port: 80, path: '/', timeout: 5000 }, (resp) => {
              resolve(resp.statusCode);
            });
            req2.on('error', reject);
            req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
          });
          result.http = true;
          result.http_detail = 'РЎР°Р№С‚ РґРѕСЃС‚СѓРїРµРЅ';
        } catch (e) {
          result.http_detail = 'РЎР°Р№С‚ РЅРµРґРѕСЃС‚СѓРїРµРЅ';
        }
      } else {
        result.http_detail = 'DNS РЅРµ РЅР°СЃС‚СЂРѕРµРЅ';
      }

      // 3. SSL check вЂ” try HTTPS connection
      if (result.dns) {
        try {
          await new Promise((resolve, reject) => {
            const req2 = https.get({ hostname: domain, port: 443, path: '/', timeout: 5000, rejectUnauthorized: true }, (resp) => {
              resolve(resp.statusCode);
            });
            req2.on('error', reject);
            req2.on('timeout', () => { req2.destroy(); reject(new Error('timeout')); });
          });
          result.ssl = true;
          result.ssl_detail = 'РЎРµСЂС‚РёС„РёРєР°С‚ РґРµР№СЃС‚РІРёС‚РµР»РµРЅ';
        } catch (e) {
          if (e.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || e.code === 'CERT_HAS_EXPIRED' || e.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
            result.ssl_detail = 'РЎРµСЂС‚РёС„РёРєР°С‚ РЅРµРґРµР№СЃС‚РІРёС‚РµР»РµРЅ';
          } else if (e.message === 'timeout') {
            result.ssl_detail = 'РўР°Р№РјР°СѓС‚ СЃРѕРµРґРёРЅРµРЅРёСЏ';
          } else {
            result.ssl_detail = 'SSL РЅРµ РЅР°СЃС‚СЂРѕРµРЅ';
          }
        }
      } else {
        result.ssl_detail = 'DNS РЅРµ РЅР°СЃС‚СЂРѕРµРЅ';
      }

      res.json({ ok: true, result });
    } catch (err) {
      console.error('check-domain error:', err);
      res.status(500).json({ ok: false, error: 'CHECK_FAILED' });
    }
  });

  router.post('/domains', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const normalized = normalizeCustomDomain(req.body.domain);
      if (normalized.invalid || !normalized.provided || !normalized.ascii) {
        return res.status(400).json({ ok: false, error: 'INVALID_CUSTOM_DOMAIN' });
      }

      try {
        await addOrReuseTenantDomain(tenantId, normalized);
      } catch (err) {
        if (err && err.code === 'CUSTOM_DOMAIN_TAKEN') {
          return res.status(409).json({ ok: false, error: 'CUSTOM_DOMAIN_TAKEN' });
        }
        throw err;
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      return res.json({ ok: true, tenant: await buildTenantResponse(rows[0] || null, req) });
    } catch (err) {
      console.error('add-domain error:', err);
      return res.status(500).json({ ok: false, error: 'DOMAIN_SAVE_FAILED' });
    }
  });

  router.patch('/domains/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const domainId = Number(req.params.id);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!Number.isFinite(domainId) || domainId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_DOMAIN_ID' });
      }

      const [rows] = await db.query(
        'SELECT id FROM ten_tenant_domains WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, domainId]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'DOMAIN_NOT_FOUND' });
      }

      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'is_enabled')) {
        await setTenantDomainEnabled(tenantId, domainId, helpers.toBool(req.body.is_enabled, true));
      } else {
        return res.status(400).json({ ok: false, error: 'DOMAIN_UPDATE_EMPTY' });
      }

      const [tenantRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      return res.json({ ok: true, tenant: await buildTenantResponse(tenantRows[0] || null, req) });
    } catch (err) {
      console.error('update-domain error:', err);
      return res.status(500).json({ ok: false, error: 'DOMAIN_UPDATE_FAILED' });
    }
  });

  router.delete('/domains/:id', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const domainId = Number(req.params.id);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }
      if (!Number.isFinite(domainId) || domainId <= 0) {
        return res.status(400).json({ ok: false, error: 'BAD_DOMAIN_ID' });
      }

      const [rows] = await db.query(
        'SELECT id, domain_ascii FROM ten_tenant_domains WHERE tenant_id=? AND id=? LIMIT 1',
        [tenantId, domainId]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'DOMAIN_NOT_FOUND' });
      }

      const domainAscii = helpers.strOrNull(rows[0].domain_ascii);
      await removeTenantDomain(tenantId, domainId);

      let automation = null;
      try {
        const setup = getTenantDomainSetup();
        if (setup.auto_connect_enabled && domainAscii) {
          automation = await runTenantDomainAutomation({
            domainAscii,
            includeWww: setup.auto_connect_include_www,
            disconnect: true
          });
        }
      } catch (automationErr) {
        console.error('disconnect-domain automation error:', automationErr);
      }

      const [tenantRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      return res.json({
        ok: true,
        tenant: await buildTenantResponse(tenantRows[0] || null, req),
        automation
      });
    } catch (err) {
      console.error('delete-domain error:', err);
      return res.status(500).json({ ok: false, error: 'DOMAIN_DELETE_FAILED' });
    }
  });

  router.post('/connect-domain', async (req, res) => {
    try {
      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const setup = getTenantDomainSetup();
      if (!setup.auto_connect_enabled) {
        return res.status(403).json({ ok: false, error: 'AUTO_CONNECT_DISABLED' });
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (!rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const current = rows[0];
      const normalized = req.body.domain !== undefined
        ? normalizeCustomDomain(req.body.domain)
        : { provided: false };
      if (normalized.invalid) {
        return res.status(400).json({ ok: false, error: 'INVALID_CUSTOM_DOMAIN' });
      }

      await ensureTenantDomainsTable();

      const nextDomain = normalized.provided ? normalized.unicode : helpers.strOrNull(current.custom_domain);
      const nextDomainAscii = normalized.provided ? normalized.ascii : helpers.strOrNull(current.custom_domain_ascii);
      if (!nextDomainAscii) {
        return res.status(400).json({ ok: false, error: 'NO_DOMAIN' });
      }

      const domainAvailable = await ensureTenantDomainAvailable(tenantId, nextDomainAscii);
      if (!domainAvailable) {
        return res.status(409).json({ ok: false, error: 'CUSTOM_DOMAIN_TAKEN' });
      }

      if (normalized.provided) {
        await addOrReuseTenantDomain(tenantId, normalized);
      }

      const precheck = await performTenantDomainCheck({ tenantId, domainAscii: nextDomainAscii });
      if (!precheck.dns) {
        return res.status(409).json({ ok: false, error: 'DOMAIN_DNS_NOT_READY', result: precheck });
      }

      const automation = await runTenantDomainAutomation({
        domainAscii: nextDomainAscii,
        includeWww: setup.auto_connect_include_www
      });

      const [updatedRows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );

      return res.json({
        ok: true,
        tenant: await buildTenantResponse(updatedRows[0] || null, req),
        result: await performTenantDomainCheck({ tenantId, domainAscii: nextDomainAscii }),
        automation
      });
    } catch (err) {
      console.error('connect-domain error:', err);
      return res.status(500).json({ ok: false, error: 'CONNECT_FAILED' });
    }
  });

  router.get('/pwa-install-qr', async (req, res) => {
    try {
      let QRCode = null;
      try {
        QRCode = require('qrcode');
      } catch (requireErr) {
        return res.status(503).json({ ok: false, error: 'PWA_INSTALL_QR_UNAVAILABLE' });
      }

      const tenantId = req.user?.tenantId ?? helpers.getTenantId(req);
      const targetId = String(req.query.target || '').trim();

      if (!tenantId) {
        return res.status(400).json({ ok: false, error: 'TENANT_REQUIRED' });
      }

      const [rows] = await db.query(
        'SELECT * FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      if (!Array.isArray(rows) || !rows.length) {
        return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
      }

      const tenant = await buildTenantResponse(rows[0], req);
      const targets = Array.isArray(tenant && tenant.pwa_install_targets)
        ? tenant.pwa_install_targets
        : [];
      const selectedTarget = targets.find((item) => String(item && item.id || '') === targetId)
        || targets[0]
        || null;

      if (!selectedTarget || !selectedTarget.url) {
        return res.status(404).json({ ok: false, error: 'PWA_INSTALL_TARGET_NOT_FOUND' });
      }

      const svg = await QRCode.toString(String(selectedTarget.url), {
        type: 'svg',
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 320,
        color: {
          dark: '#111827',
          light: '#FFFFFF'
        }
      });

      res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res.send(svg);
    } catch (err) {
      console.error('tenant pwa-install-qr error:', err);
      return res.status(500).json({ ok: false, error: 'PWA_INSTALL_QR_FAILED' });
    }
  });

  return router;
};
