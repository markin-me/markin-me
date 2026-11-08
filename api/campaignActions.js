'use strict';

const fs = require('fs');
const path = require('path');

function normalizeHttpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

function normalizeHost(value) {
  const url = normalizeHttpsUrl(value);
  if (url) return new URL(url).host;
  return String(value || '').trim().replace(/^https?:\/\//i, '').split('/')[0].toLowerCase();
}

async function resolveTenantShopBaseUrl(db, tenantId) {
  const [[tenant]] = await db.query(
    'SELECT subdomain,custom_domain,custom_domain_ascii FROM ten_tenants WHERE id=? AND is_active=1 LIMIT 1',
    [tenantId]
  );
  if (!tenant) throw Object.assign(new Error('TENANT_NOT_FOUND'), { status: 404, code: 'TENANT_NOT_FOUND' });
  if (String(process.env.DB_NAME || '').trim() === 'a1186497_test') {
    try {
      const state = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'tmp', 'dev-pwa-tunnel.json'), 'utf8'));
      const expectedPort = Number(process.env.PORT || process.env.APP_PORT || 3108);
      const tunnelUrl = Number(state?.port || 0) === expectedPort ? normalizeHttpsUrl(state?.public_url) : '';
      if (tunnelUrl) return tunnelUrl;
    } catch {}
  }
  const customDomain = normalizeHost(tenant.custom_domain_ascii || tenant.custom_domain);
  if (customDomain) return `https://${customDomain}`;
  const baseHost = normalizeHost(
    process.env.TENANT_SUBDOMAIN_BASE_DOMAIN
    || process.env.TENANT_BASE_DOMAIN
    || process.env.APP_BASE_DOMAIN
    || process.env.PUBLIC_BASE_DOMAIN
    || process.env.SITE_BASE_DOMAIN
  );
  const subdomain = String(tenant.subdomain || '').trim().toLowerCase();
  if (baseHost) return `https://${subdomain ? `${subdomain}.` : ''}${baseHost}`;
  const configuredBaseUrl = normalizeHttpsUrl(
    process.env.PUBLIC_BASE_URL || process.env.SITE_BASE_URL || process.env.APP_BASE_URL
  );
  return configuredBaseUrl;
}

function normalizeActionType(message) {
  const actionType = String(message?.action_type || '').trim().toLowerCase();
  return ['promo_code', 'product', 'product_collection'].includes(actionType) ? actionType : 'none';
}

function buildCampaignUrl(baseUrl, message, storeId) {
  if (!baseUrl) return '';
  const url = new URL('/shop', `${baseUrl}/`);
  url.searchParams.set('open_important_messages', '1');
  url.searchParams.set('important_message_id', String(Number(message.id)));
  url.searchParams.set('important_store_id', String(Number(storeId)));
  return url.href;
}

function buildProductUrl(campaignUrl, productId) {
  const url = new URL(campaignUrl);
  url.searchParams.set('important_product_id', String(Number(productId)));
  return url.href;
}

async function prepareCampaignAction(db, { tenantId, storeId, message }) {
  const actionType = normalizeActionType(message);
  const explicitUrl = normalizeHttpsUrl(message?.link_url);
  const requiresCampaignUrl = actionType !== 'none';
  const shopBaseUrl = requiresCampaignUrl ? await resolveTenantShopBaseUrl(db, tenantId) : '';
  const campaignUrl = requiresCampaignUrl ? buildCampaignUrl(shopBaseUrl, message, storeId) : '';
  if (requiresCampaignUrl && !campaignUrl) {
    throw Object.assign(new Error('CAMPAIGN_ACTION_URL_UNAVAILABLE'), { status: 409, code: 'CAMPAIGN_ACTION_URL_UNAVAILABLE' });
  }
  const labels = {
    promo_code: 'Забрать',
    product: 'Заказать',
    product_collection: 'Открыть подборку',
  };
  const buttons = [];
  if (campaignUrl) buttons.push({ type: actionType, text: labels[actionType], url: campaignUrl });
  if (actionType === 'product_collection') {
    for (const product of (Array.isArray(message.products) ? message.products : [])) {
      const productId = Number(product?.id || 0);
      if (!(productId > 0)) continue;
      const title = String(product?.title || `Товар ${productId}`).trim();
      buttons.push({
        type: 'product',
        product_id: productId,
        text: `Заказать: ${title}`.slice(0, 64),
        url: buildProductUrl(campaignUrl, productId),
      });
    }
  }
  if (explicitUrl && explicitUrl !== campaignUrl) buttons.push({ type: 'link', text: 'Открыть', url: explicitUrl });
  return {
    type: actionType,
    requires_auth: actionType === 'promo_code',
    target: actionType === 'product'
      ? { product_id: Number(message.product_id || 0) }
      : actionType === 'product_collection'
        ? { product_ids: (Array.isArray(message.product_ids) ? message.product_ids : []).map(Number).filter((id) => id > 0) }
        : actionType === 'promo_code'
          ? { promo_code_mode: String(message.promo_code_mode || 'none') }
          : null,
    buttons,
  };
}

module.exports = { prepareCampaignAction };
