'use strict';

const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');

// Only catalogue photos are eligible. Never read customer uploads or remote URLs.
async function blurredCataloguePhoto(tenantId, items) {
  const item = Array.isArray(items) ? items[0] : null;
  const source = item?.photos?.[0] || item?.product_photo || item?.photo;
  const prefix = `/static/uploads/products/${Number(tenantId)}/`;
  if (typeof source !== 'string' || !source.startsWith(prefix)) return null;
  const root = path.resolve(__dirname, '../..', `static/uploads/products/${Number(tenantId)}`);
  const file = path.resolve(root, source.slice(prefix.length));
  if (!file.startsWith(root + path.sep)) return null;
  try {
    const realRoot = await fs.realpath(root);
    const realFile = await fs.realpath(file);
    if (!realFile.startsWith(realRoot + path.sep)) return null;
    const output = await sharp(realFile, {limitInputPixels: 16 * 1024 * 1024})
      .rotate().resize(12, 12, {fit: 'cover'}).blur(3)
      .png().toBuffer();
    return `data:image/png;base64,${output.toString('base64')}`;
  } catch (error) {
    // No original is substituted when a safe derivative cannot be produced.
    console.warn('RESTRICTED_ORDER_PHOTO_UNAVAILABLE', {code: error.code || error.name});
    return null;
  }
}

async function restrictedOrder(tenantId, order) {
  let items = order.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  const photo = await blurredCataloguePhoto(tenantId, items);
  // Whitelist: no spread of the full order, original photos or item counts.
  return {
    id: Number(order.id), privacy_restricted: true,
    status_title: order.status_title || null,
    status_code: order.status_code || null,
    status_is_final: Number(order.status_is_final || 0),
    status_color: order.status_color || null,
    address: '••••••••••••', total_price: null,
    items: [{name: '••••••', product_name: '••••••', quantity: null, qty: null,
      price: null, total_price: null, photos: photo ? [photo] : []}],
  };
}

module.exports = {restrictedOrder};
