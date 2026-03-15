const fs = require('fs');
const path = require('path');

const SYSTEM_SETTINGS_DIR = __dirname;
const SYSTEM_SETTINGS_FILE = path.join(SYSTEM_SETTINGS_DIR, 'system-settings.json');

function hasOwn(target, key) {
  return Boolean(target) && Object.prototype.hasOwnProperty.call(target, key);
}

function normalizeString(value) {
  if (value == null) return '';
  return String(value).trim();
}

function normalizeTelegramBotUsername(value) {
  let username = normalizeString(value);
  if (!username) return '';

  username = username.replace(/^https?:\/\/t\.me\//i, '');
  username = username.replace(/^@+/, '');
  const queryIndex = username.indexOf('?');
  if (queryIndex >= 0) username = username.slice(0, queryIndex);
  const slashIndex = username.indexOf('/');
  if (slashIndex >= 0) username = username.slice(0, slashIndex);

  return username.trim();
}

function normalizeTelegramBotToken(value) {
  return normalizeString(value);
}

function normalizeTelegramWebhookUrl(value) {
  return normalizeString(value);
}

function normalizeMapProviderName(value) {
  return normalizeString(value);
}

function normalizeMapTileUrl(value) {
  return normalizeString(value);
}

function normalizeMapAttribution(value) {
  return normalizeString(value);
}

function normalizeMapSubdomains(value) {
  const raw = normalizeString(value);
  if (!raw) return '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

function normalizeMapMaxZoom(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return Math.min(22, Math.max(0, rounded));
}

function normalizeMapGeocoderProviderName(value) {
  return normalizeString(value);
}

function normalizeMapGeocoderSearchUrl(value) {
  return normalizeString(value);
}

function normalizeMapGeocoderCountryCode(value) {
  const raw = normalizeString(value).toLowerCase();
  if (!raw) return '';
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .join(',');
}

function normalizeMapGeocoderLanguage(value) {
  return normalizeString(value);
}

function normalizeMapGeocoderResultLimit(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  return Math.min(10, Math.max(1, rounded));
}

function normalizeMapStoreAddressEnabled(value) {
  return Boolean(value);
}

function readSystemSettings() {
  try {
    if (!fs.existsSync(SYSTEM_SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SYSTEM_SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (e) {
    console.error('System settings read error:', e.message || e);
    return null;
  }
}

function writeSystemSettings(nextState, options = {}) {
  try {
    if (!fs.existsSync(SYSTEM_SETTINGS_DIR)) {
      fs.mkdirSync(SYSTEM_SETTINGS_DIR, { recursive: true });
    }

    const currentState = readSystemSettings() || {};
    const defaults = options && typeof options.defaults === 'object' && options.defaults
      ? options.defaults
      : {};
    const sourceState = { ...defaults, ...currentState };
    const payload = {
      telegram_env_enabled: hasOwn(nextState, 'telegram_env_enabled')
        ? Boolean(nextState.telegram_env_enabled)
        : Boolean(sourceState.telegram_env_enabled),
      telegram_tenant_enabled: hasOwn(nextState, 'telegram_tenant_enabled')
        ? Boolean(nextState.telegram_tenant_enabled)
        : Boolean(sourceState.telegram_tenant_enabled),
      updated_at: new Date().toISOString(),
    };

    if (hasOwn(currentState, 'telegram_bot_username') || hasOwn(nextState, 'telegram_bot_username')) {
      payload.telegram_bot_username = hasOwn(nextState, 'telegram_bot_username')
        ? normalizeTelegramBotUsername(nextState.telegram_bot_username)
        : normalizeTelegramBotUsername(currentState.telegram_bot_username);
    }

    if (hasOwn(currentState, 'telegram_bot_token') || hasOwn(nextState, 'telegram_bot_token')) {
      payload.telegram_bot_token = hasOwn(nextState, 'telegram_bot_token')
        ? normalizeTelegramBotToken(nextState.telegram_bot_token)
        : normalizeTelegramBotToken(currentState.telegram_bot_token);
    }

    if (hasOwn(currentState, 'telegram_webhook_url') || hasOwn(nextState, 'telegram_webhook_url')) {
      payload.telegram_webhook_url = hasOwn(nextState, 'telegram_webhook_url')
        ? normalizeTelegramWebhookUrl(nextState.telegram_webhook_url)
        : normalizeTelegramWebhookUrl(currentState.telegram_webhook_url);
    }

    if (hasOwn(currentState, 'provider_name') || hasOwn(nextState, 'provider_name')) {
      payload.provider_name = hasOwn(nextState, 'provider_name')
        ? normalizeMapProviderName(nextState.provider_name)
        : normalizeMapProviderName(currentState.provider_name);
    }

    if (hasOwn(currentState, 'tile_url') || hasOwn(nextState, 'tile_url')) {
      payload.tile_url = hasOwn(nextState, 'tile_url')
        ? normalizeMapTileUrl(nextState.tile_url)
        : normalizeMapTileUrl(currentState.tile_url);
    }

    if (hasOwn(currentState, 'attribution') || hasOwn(nextState, 'attribution')) {
      payload.attribution = hasOwn(nextState, 'attribution')
        ? normalizeMapAttribution(nextState.attribution)
        : normalizeMapAttribution(currentState.attribution);
    }

    if (hasOwn(currentState, 'max_zoom') || hasOwn(nextState, 'max_zoom')) {
      payload.max_zoom = hasOwn(nextState, 'max_zoom')
        ? normalizeMapMaxZoom(nextState.max_zoom)
        : normalizeMapMaxZoom(currentState.max_zoom);
    }

    if (hasOwn(currentState, 'subdomains') || hasOwn(nextState, 'subdomains')) {
      payload.subdomains = hasOwn(nextState, 'subdomains')
        ? normalizeMapSubdomains(nextState.subdomains)
        : normalizeMapSubdomains(currentState.subdomains);
    }

    if (hasOwn(currentState, 'geocoder_provider_name') || hasOwn(nextState, 'geocoder_provider_name')) {
      payload.geocoder_provider_name = hasOwn(nextState, 'geocoder_provider_name')
        ? normalizeMapGeocoderProviderName(nextState.geocoder_provider_name)
        : normalizeMapGeocoderProviderName(currentState.geocoder_provider_name);
    }

    if (hasOwn(currentState, 'geocoder_search_url') || hasOwn(nextState, 'geocoder_search_url')) {
      payload.geocoder_search_url = hasOwn(nextState, 'geocoder_search_url')
        ? normalizeMapGeocoderSearchUrl(nextState.geocoder_search_url)
        : normalizeMapGeocoderSearchUrl(currentState.geocoder_search_url);
    }

    if (hasOwn(currentState, 'geocoder_country_code') || hasOwn(nextState, 'geocoder_country_code')) {
      payload.geocoder_country_code = hasOwn(nextState, 'geocoder_country_code')
        ? normalizeMapGeocoderCountryCode(nextState.geocoder_country_code)
        : normalizeMapGeocoderCountryCode(currentState.geocoder_country_code);
    }

    if (hasOwn(currentState, 'geocoder_language') || hasOwn(nextState, 'geocoder_language')) {
      payload.geocoder_language = hasOwn(nextState, 'geocoder_language')
        ? normalizeMapGeocoderLanguage(nextState.geocoder_language)
        : normalizeMapGeocoderLanguage(currentState.geocoder_language);
    }

    if (hasOwn(currentState, 'geocoder_result_limit') || hasOwn(nextState, 'geocoder_result_limit')) {
      payload.geocoder_result_limit = hasOwn(nextState, 'geocoder_result_limit')
        ? normalizeMapGeocoderResultLimit(nextState.geocoder_result_limit)
        : normalizeMapGeocoderResultLimit(currentState.geocoder_result_limit);
    }

    if (hasOwn(currentState, 'store_address_map_enabled') || hasOwn(nextState, 'store_address_map_enabled')) {
      payload.store_address_map_enabled = hasOwn(nextState, 'store_address_map_enabled')
        ? normalizeMapStoreAddressEnabled(nextState.store_address_map_enabled)
        : normalizeMapStoreAddressEnabled(currentState.store_address_map_enabled);
    }

    fs.writeFileSync(SYSTEM_SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf8');
    return payload;
  } catch (e) {
    console.error('System settings write error:', e.message || e);
    return null;
  }
}

function getBootstrappedPollingState(defaults = {}) {
  const fromFile = readSystemSettings();
  const nextState = {
    telegram_env_enabled: Boolean(defaults.telegram_env_enabled),
    telegram_tenant_enabled: Boolean(defaults.telegram_tenant_enabled),
  };

  if (fromFile && hasOwn(fromFile, 'telegram_env_enabled')) {
    nextState.telegram_env_enabled = Boolean(fromFile.telegram_env_enabled);
  }
  if (fromFile && hasOwn(fromFile, 'telegram_tenant_enabled')) {
    nextState.telegram_tenant_enabled = Boolean(fromFile.telegram_tenant_enabled);
  }

  return nextState;
}

function getEffectiveTelegramBotConfig(sourceState = readSystemSettings()) {
  const source = sourceState && typeof sourceState === 'object' ? sourceState : {};
  const username = hasOwn(source, 'telegram_bot_username')
    ? normalizeTelegramBotUsername(source.telegram_bot_username)
    : normalizeTelegramBotUsername(process.env.TELEGRAM_BOT_USERNAME);
  const token = hasOwn(source, 'telegram_bot_token')
    ? normalizeTelegramBotToken(source.telegram_bot_token)
    : normalizeTelegramBotToken(process.env.TELEGRAM_BOT_TOKEN);
  const webhookUrl = hasOwn(source, 'telegram_webhook_url')
    ? normalizeTelegramWebhookUrl(source.telegram_webhook_url)
    : normalizeTelegramWebhookUrl(process.env.TELEGRAM_WEBHOOK_URL);

  return {
    telegram_bot_username: username,
    telegram_bot_token: token,
    telegram_webhook_url: webhookUrl,
  };
}

function getEffectiveMapProviderConfig(sourceState = readSystemSettings()) {
  const source = sourceState && typeof sourceState === 'object' ? sourceState : {};
  const maxZoom = normalizeMapMaxZoom(source.max_zoom);
  const geocoderResultLimit = normalizeMapGeocoderResultLimit(source.geocoder_result_limit);

  return {
    provider_name: normalizeMapProviderName(source.provider_name),
    tile_url: normalizeMapTileUrl(source.tile_url),
    attribution: normalizeMapAttribution(source.attribution),
    max_zoom: maxZoom == null ? 22 : maxZoom,
    subdomains: normalizeMapSubdomains(source.subdomains),
    geocoder_provider_name: normalizeMapGeocoderProviderName(source.geocoder_provider_name),
    geocoder_search_url: normalizeMapGeocoderSearchUrl(source.geocoder_search_url),
    geocoder_country_code: normalizeMapGeocoderCountryCode(source.geocoder_country_code) || 'ru',
    geocoder_language: normalizeMapGeocoderLanguage(source.geocoder_language) || 'ru',
    geocoder_result_limit: geocoderResultLimit == null ? 5 : geocoderResultLimit,
    store_address_map_enabled: normalizeMapStoreAddressEnabled(source.store_address_map_enabled),
  };
}

module.exports = {
  readSystemSettings,
  writeSystemSettings,
  getBootstrappedPollingState,
  getEffectiveTelegramBotConfig,
  getEffectiveMapProviderConfig,
  normalizeTelegramBotUsername,
  normalizeTelegramBotToken,
  normalizeTelegramWebhookUrl,
  normalizeMapProviderName,
  normalizeMapTileUrl,
  normalizeMapAttribution,
  normalizeMapMaxZoom,
  normalizeMapSubdomains,
  normalizeMapGeocoderProviderName,
  normalizeMapGeocoderSearchUrl,
  normalizeMapGeocoderCountryCode,
  normalizeMapGeocoderLanguage,
  normalizeMapGeocoderResultLimit,
  normalizeMapStoreAddressEnabled,
};
