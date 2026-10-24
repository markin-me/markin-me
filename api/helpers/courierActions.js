'use strict';

// Domain commands, not order/financial statuses. Reports record facts only.
const REPORTS = new Set(['non_delivery', 'damage']);
const MAX_TEXT = 2000;
// Gate is configuration only; tenant identity MUST come from verified auth.
function enabled(tenantId) {
  const allowed = process.env.COURIER_OFFLINE_V2_TENANT_ID;
  return process.env.COURIER_OFFLINE_V2 === '1' && typeof allowed === 'string'
    && /^[1-9][0-9]*$/.test(allowed) && Number.isSafeInteger(Number(allowed))
    && Number.isSafeInteger(Number(tenantId)) && Number(tenantId) === Number(allowed);
}
function validRevision(value) {
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)
    && BigInt(value) <= 18446744073709551615n;
}
function validScope(req, tenantId, storeId) {
  const header = req.headers['x-store-id'];
  return Number.isSafeInteger(Number(tenantId)) && Number(tenantId) > 0
    && Number(req.user?.tenantId) === Number(tenantId)
    && typeof header === 'string' && /^[1-9][0-9]*$/.test(header)
    && Number.isSafeInteger(Number(header)) && Number(header) === Number(storeId);
}
function validIntent(req, key) {
  const body = req.body || {}, intent = body.courier_intent;
  if (!intent || req.rbacContext !== 'courier' || req.permission?.key !== 'courier.orders.update'
    || !(Number(req.user?.userId) > 0) || intent.version !== 2
    || !['status', ...REPORTS].includes(intent.operation)
    || intent.actor_user_id !== Number(req.user.userId)
    || intent.active_role_id !== Number(req.user.activeRoleId || 0)
    || intent.id !== key || typeof intent.id !== 'string' || !/^[a-z0-9-]{16,128}$/.test(intent.id)
    || !validRevision(intent.base_revision) || !/^[a-f0-9]{64}$/.test(intent.base_state || '')
    || !Number.isSafeInteger(intent.base_status_id) || intent.base_status_id <= 0
    || !Number.isSafeInteger(intent.created_at) || intent.created_at <= 0 || intent.created_at > Date.now() + 300000
    || Object.keys(intent).some(name => !['version', 'operation', 'actor_user_id', 'active_role_id', 'id',
      'base_state', 'base_revision', 'base_status_id', 'created_at'].includes(name))) return false;
  if (intent.operation === 'status') {
    return Number.isSafeInteger(body.status_id) && body.status_id > 0
      && Object.keys(body).every(name => ['status_id', 'courier_intent'].includes(name));
  }
  const field = intent.operation === 'non_delivery' ? 'reason' : 'comment';
  return typeof body[field] === 'string' && body[field] === body[field].trim()
    && body[field].length > 0 && body[field].length <= MAX_TEXT
    && Buffer.byteLength(body[field], 'utf8') <= MAX_TEXT * 4
    && Object.keys(body).every(name => [field, 'courier_intent'].includes(name));
}
function event(intent, row, tenantId, storeId, state, body) {
  return { ...intent, tenant_id: tenantId, store_id: storeId, order_id: Number(row.id), state,
    ...(intent.operation === 'status' ? { status_id: body.status_id }
      : intent.operation === 'non_delivery' ? { reason: body.reason } : { comment: body.comment }),
    observed: { revision: String(row.courier_revision), status_id: Number(row.status_id),
      assigned_user_id: Number(row.assigned_user_id || 0), is_paid: Number(row.is_paid || 0) } };
}
module.exports = { enabled, validRevision, validScope, validIntent, event, REPORTS };
