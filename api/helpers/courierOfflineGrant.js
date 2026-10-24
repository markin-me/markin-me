'use strict';

const { createHmac, createPrivateKey, createPublicKey, sign } = require('crypto');

// Separate signing purpose/key. Never export the seed or the JWT signing secret.
let signingKey;
function key() {
  const secret = process.env.COURIER_OFFLINE_SIGNING_SECRET || process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw Object.assign(new Error('OFFLINE_SIGNING_KEY_UNAVAILABLE'), { status: 503 });
  if (!signingKey) {
    const seed = createHmac('sha256', secret).update('crm:courier-offline-grant:ed25519:v1').digest();
    signingKey = createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
    seed.fill(0);
  }
  return signingKey;
}
function publicJwk() {
  if (process.env.COURIER_OFFLINE_UNLOCK !== '1') return null;
  try { return createPublicKey(key()).export({ format: 'jwk' }); }
  catch (_) { return null; } // No grant is issued when secure signing is unavailable.
}
function issue(context, tokenBinding, body, origin) {
  if (process.env.COURIER_OFFLINE_UNLOCK !== '1') throw Object.assign(new Error('OFFLINE_UNLOCK_DISABLED'), { status: 503 });
  const local = context.local_context;
  const storeId = String(body.storeId || '');
  const permitted = name => context.permissions.some(p => p === '*' || p.key === name && ['all', 'stores', 'assigned'].includes(p.access_rule));
  if (!local?.courierOfflineV2 || local.principal?.type !== 'user'
      || !['courier.access', 'courier.orders.read', 'courier.orders.update'].every(permitted)
      || !/^[1-9][0-9]*$/.test(storeId) || !context.stores.some(s => String(s.id) === storeId)) {
    throw Object.assign(new Error('OFFLINE_GRANT_FORBIDDEN'), { status: 403 });
  }
  if (!/^[a-f0-9]{64}$/.test(body.deviceId || '')) throw Object.assign(new Error('INVALID_DEVICE_BINDING'), { status: 400 });
  let lifetime = 86400000;
  // Only the isolated diagnostic instance can shorten a real grant for expiry acceptance.
  if (process.env.CRM_DIAGNOSTIC_INSTANCE === '1' && process.env.COURIER_OFFLINE_GRANT_TTL_MS) {
    lifetime = Number(process.env.COURIER_OFFLINE_GRANT_TTL_MS);
    if (!Number.isSafeInteger(lifetime) || lifetime < 60000 || lifetime > 86400000) throw Object.assign(new Error('INVALID_DIAGNOSTIC_GRANT_TTL'), { status: 503 });
  }
  if (process.env.CRM_DIAGNOSTIC_INSTANCE === '1' && body.diagnosticExpiresInMs !== undefined) {
    const shortened = Number(body.diagnosticExpiresInMs);
    if (!Number.isSafeInteger(shortened) || shortened < 60000 || shortened > lifetime) throw Object.assign(new Error('INVALID_DIAGNOSTIC_GRANT_TTL'), { status: 400 });
    lifetime = shortened;
  }
  const now = Date.now();
  const grant = { version: 1, audience: 'courier-offline', origin, deviceId: body.deviceId,
    storeId, issuedAt: now, expiresAt: Math.min(now + lifetime, local.expiresAt),
    tokenBinding, localContext: local, operations: ['status', 'non_delivery', 'damage'],
    metadata: { roles: context.roles, active_role: context.active_role, permissions: context.permissions,
      stores: context.stores.filter(s => String(s.id) === storeId) } };
  const payload = Buffer.from(JSON.stringify(grant));
  return { payload: payload.toString('base64url'), signature: sign(null, payload, key()).toString('base64url') };
}
module.exports = { publicJwk, issue };
