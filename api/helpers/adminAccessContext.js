'use strict';

const { createHash } = require('crypto');

function localAccessContext(decoded, principal, permissions, stores, activeRoleId = decoded.activeRoleId, isOwner = false) {
  if ((decoded.authStage && decoded.authStage !== 'active') || !Number.isFinite(decoded.exp)) return null;
  const grants = permissions.map(item => typeof item === 'string' ? [item, 'all'] : [item.key, item.access_rule])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  const resources = stores.map(store => Number(store.id)).sort((a, b) => a - b);
  const identity = { tenantId: Number(decoded.tenantId), principal, activeRoleId: Number(activeRoleId || 0) || null,
    authVersion: Number(decoded.authVersion || 0) };
  return { ...identity, formatVersion: 1,
    accessViewId: createHash('sha256').update(JSON.stringify([identity, grants, resources, isOwner])).digest('hex'),
    confirmedAt: Date.now(), expiresAt: decoded.exp * 1000 };
}
function publicRole(role) {
  return { id: Number(role.id), name: role.name, description: role.description || '', start_route: role.start_route };
}
function publicUser(user, activeRoleId = null) {
  return { id: user.id ? Number(user.id) : null, email: user.email || null, login: user.login || null, name: user.name,
    last_name: user.last_name || null, first_name: user.first_name || null, patronymic: user.patronymic || null,
    photo_revision: user.photo_revision || null, role: user.role, tenant_id: Number(user.tenant_id),
    active_role_id: activeRoleId ? Number(activeRoleId) : null };
}
async function loadUserRoles(db, tenantId, userId) {
  const [roles] = await db.query(`SELECT r.id, r.name, r.description, r.start_route, r.is_owner
    FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
    WHERE ur.tenant_id=? AND ur.user_id=? ORDER BY r.is_owner DESC, r.name, r.id`, [tenantId, userId]);
  return roles;
}
function denied(code, status = 403) { return Object.assign(new Error(code), { code, status }); }

// verified is request-local data from authMiddleware, never a process-wide authorization cache.
async function loadAccessContext(db, decoded, verified = null) {
  if (!decoded.userId && (decoded.loginType === 'tenant' || decoded.role === 'owner')) {
    const [tenants] = verified ? [[verified.tenant]] : await db.query(
      'SELECT id, name, slug, email, is_active FROM ten_tenants WHERE id=? AND is_active=1 LIMIT 1', [decoded.tenantId]);
    const tenant = tenants[0];
    if (!tenant) throw denied('TENANT_NOT_FOUND', 401);
    const owner = verified ? verified.legacyOwner : await require('../middleware/auth').loadLegacyOwner(db, tenant.id, tenant.email);
    if (owner && (owner.employee_status !== 'active' || Number(owner.is_active) !== 1 || Number(owner.is_owner) !== 1)) throw denied('USER_BLOCKED');
    if (owner && Number(decoded.authVersion || 0) !== Number(owner.auth_version)) throw denied('SESSION_REVOKED', 401);
    const [stores] = await db.query('SELECT id, name FROM ten_stores WHERE tenant_id=? AND is_active=1 ORDER BY name, id', [tenant.id]);
    return { ok: true, user: { id: null, email: tenant.email, name: `${tenant.name} (Магазин)`, profile_name: owner?.name || null,
      last_name: owner?.last_name || null, first_name: owner?.first_name || null, patronymic: owner?.patronymic || null,
      photo_revision: owner?.photo_revision || null, tenant_id: Number(tenant.id) },
      tenant: { id: Number(tenant.id), name: tenant.name, slug: tenant.slug }, roles: [], permissions: ['*'], stores,
      local_context: localAccessContext(decoded, { type: 'tenant', id: String(tenant.id) }, ['*'], stores) };
  }
  const [users] = verified ? [[verified.user]] : await db.query(`SELECT u.id, u.tenant_id, u.email, u.login, u.name,
    u.last_name, u.first_name, u.patronymic, u.photo_revision, u.role, u.is_active, u.employee_status, u.auth_version,
    t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active
    FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id WHERE u.id=? AND u.tenant_id=? LIMIT 1`, [decoded.userId, decoded.tenantId]);
  const user = users[0];
  if (!user) throw denied('USER_NOT_FOUND', 401);
  if (user.employee_status !== 'active' || Number(user.is_active) !== 1) throw denied(user.employee_status === 'archived' ? 'USER_ARCHIVED' : 'USER_BLOCKED');
  if (Number(user.tenant_active) !== 1) throw denied('TENANT_BLOCKED');
  if (Number(decoded.authVersion || 0) !== Number(user.auth_version)) throw denied('SESSION_REVOKED', 401);
  const roles = verified ? verified.roles : await loadUserRoles(db, user.tenant_id, user.id);
  const activeRole = roles.find(role => Number(role.id) === Number(decoded.activeRoleId)) || (roles.length === 1 ? roles[0] : null);
  const [rows] = activeRole ? await db.query(`SELECT p.permission_key, rp.access_rule FROM role_permissions rp
    JOIN system_permissions p ON p.id=rp.permission_id WHERE rp.tenant_id=? AND rp.role_id=? ORDER BY p.sort_order, p.id`,
  [user.tenant_id, activeRole.id]) : [[]];
  const [stores] = await db.query(`SELECT s.id, s.name FROM user_stores us
    JOIN ten_stores s ON s.tenant_id=us.tenant_id AND s.id=us.store_id
    WHERE us.tenant_id=? AND us.user_id=? AND s.is_active=1 ORDER BY s.name, s.id`, [user.tenant_id, user.id]);
  const permissions = rows.map(row => ({ key: row.permission_key, access_rule: row.access_rule }));
  return { ok: true, user: publicUser(user, activeRole?.id), tenant: { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug },
    roles: roles.map(publicRole), active_role: activeRole ? publicRole(activeRole) : null, permissions, stores,
    local_context: activeRole && (!decoded.activeRoleId || Number(decoded.activeRoleId) === Number(activeRole.id))
      ? localAccessContext(decoded, { type: 'user', id: String(user.id) }, permissions, stores, activeRole.id, Number(activeRole.is_owner) === 1) : null };
}

module.exports = { localAccessContext, publicRole, publicUser, loadUserRoles, loadAccessContext };
