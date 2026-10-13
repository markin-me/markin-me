const jwt = require('jsonwebtoken');
const db = require('../../db');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

function readToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) return authHeader.substring(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function unauthorized(res, error, status = 401) {
  return res.status(status).json({ ok: false, error });
}

async function loadVerifiedUser(decoded) {
  const userId = Number(decoded.userId || 0);
  const tenantId = Number(decoded.tenantId || 0);
  if (!(userId > 0) || !(tenantId > 0)) return null;

  const [users] = await db.query(
    `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.is_active, u.must_change_password,
            t.is_active AS tenant_active
     FROM app_users u
     JOIN ten_tenants t ON t.id=u.tenant_id
     WHERE u.id=? AND u.tenant_id=?
     LIMIT 1`,
    [userId, tenantId]
  );
  return users[0] || null;
}

async function resolveActiveRole(user, requestedRoleId) {
  const [roles] = await db.query(
    `SELECT r.id, r.name, r.start_route, r.is_owner
     FROM user_roles ur
     JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
     WHERE ur.tenant_id=? AND ur.user_id=?
     ORDER BY r.is_owner DESC, r.name, r.id`,
    [user.tenant_id, user.id]
  );

  if (!roles.length) return { error: 'ROLE_NOT_ASSIGNED' };
  const activeRoleId = Number(requestedRoleId || 0);
  if (activeRoleId > 0) {
    const role = roles.find((item) => Number(item.id) === activeRoleId);
    return role ? { role, roles } : { error: 'ACTIVE_ROLE_INVALID' };
  }
  if (roles.length === 1) return { role: roles[0], roles };
  return { error: 'ROLE_SELECTION_REQUIRED', roles };
}

async function authMiddleware(req, res, next) {
  try {
    if (req._authVerified && req.user) return next();
    const token = readToken(req);
    if (!token) return unauthorized(res, 'NO_TOKEN');

    const decoded = jwt.verify(token, JWT_SECRET);
    const tenantId = Number(decoded.tenantId || 0);
    if (!(tenantId > 0)) return unauthorized(res, 'INVALID_TOKEN');

    if (!decoded.userId && (decoded.loginType === 'tenant' || decoded.role === 'owner')) {
      const [tenants] = await db.query(
        'SELECT id, email, name, is_active FROM ten_tenants WHERE id=? LIMIT 1',
        [tenantId]
      );
      const tenant = tenants[0];
      if (!tenant || Number(tenant.is_active) !== 1) return unauthorized(res, 'TENANT_BLOCKED', 403);
      req.user = {
        userId: null,
        tenantId,
        email: tenant.email,
        activeRoleId: null,
        principalType: 'tenant',
        fullAccess: true,
      };
      req._authVerified = true;
      return next();
    }

    const user = await loadVerifiedUser(decoded);
    if (!user) return unauthorized(res, 'USER_NOT_FOUND');
    if (Number(user.is_active) !== 1) return unauthorized(res, 'USER_BLOCKED', 403);
    if (Number(user.tenant_active) !== 1) return unauthorized(res, 'TENANT_BLOCKED', 403);

    const active = await resolveActiveRole(user, decoded.activeRoleId);
    if (active.error) return unauthorized(res, active.error, 403);

    req.user = {
      userId: Number(user.id),
      tenantId: Number(user.tenant_id),
      email: user.email,
      login: user.login,
      name: user.name,
      activeRoleId: Number(active.role.id),
      activeRole: active.role,
      principalType: 'user',
      fullAccess: false,
    };
    req._authVerified = true;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return unauthorized(res, 'INVALID_TOKEN');
    if (error.name === 'TokenExpiredError') return unauthorized(res, 'TOKEN_EXPIRED');
    console.error('Ошибка проверки токена:', error);
    return res.status(500).json({ ok: false, error: 'AUTH_ERROR' });
  }
}

async function getPermissionGrant(user, permissionKey) {
  if (user && user.fullAccess === true) return { access_rule: 'all' };
  const tenantId = Number(user && user.tenantId || 0);
  const roleId = Number(user && user.activeRoleId || 0);
  if (!(tenantId > 0) || !(roleId > 0)) return null;
  const [rows] = await db.query(
    `SELECT rp.access_rule
     FROM role_permissions rp
     JOIN system_permissions p ON p.id=rp.permission_id
     JOIN user_roles ur
       ON ur.tenant_id=rp.tenant_id AND ur.role_id=rp.role_id AND ur.user_id=?
     WHERE rp.tenant_id=? AND rp.role_id=? AND p.permission_key=?
     LIMIT 1`,
    [Number(user.userId || 0), tenantId, roleId, permissionKey]
  );
  return rows[0] || null;
}

async function userHasStore(user, storeId) {
  if (user && user.fullAccess === true) return true;
  const normalizedStoreId = Number(storeId || 0);
  if (!(normalizedStoreId > 0)) return false;
  const [rows] = await db.query(
    `SELECT 1 FROM user_stores
     WHERE tenant_id=? AND user_id=? AND store_id=?
     LIMIT 1`,
    [Number(user.tenantId), Number(user.userId), normalizedStoreId]
  );
  return rows.length > 0;
}

async function can(user, permissionKey, resource = null) {
  if (!user || !permissionKey) return { allowed: false, error: 'FORBIDDEN' };
  const grant = await getPermissionGrant(user, permissionKey);
  if (!grant) return { allowed: false, error: 'FORBIDDEN' };
  const accessRule = String(grant.access_rule || 'all');
  if (!resource) return { allowed: true, accessRule };

  const resourceTenantId = Number(resource.tenant_id ?? resource.tenantId ?? 0);
  if (resourceTenantId > 0 && resourceTenantId !== Number(user.tenantId)) {
    return { allowed: false, error: 'TENANT_MISMATCH', accessRule };
  }
  if (accessRule === 'all') return { allowed: true, accessRule };
  if (accessRule === 'stores') {
    const allowed = await userHasStore(user, resource.store_id ?? resource.storeId);
    return { allowed, error: allowed ? null : 'STORE_FORBIDDEN', accessRule };
  }
  if (accessRule === 'own') {
    const ownerId = Number(resource.user_id ?? resource.userId ?? resource.created_by_user_id ?? 0);
    const allowed = ownerId > 0 && ownerId === Number(user.userId);
    return { allowed, error: allowed ? null : 'RESOURCE_FORBIDDEN', accessRule };
  }
  if (accessRule === 'assigned') {
    const assignedId = Number(resource.assigned_user_id ?? resource.assignedUserId ?? resource.courier_id ?? 0);
    const allowed = assignedId > 0 && assignedId === Number(user.userId);
    return { allowed, error: allowed ? null : 'RESOURCE_FORBIDDEN', accessRule };
  }
  return { allowed: false, error: 'FORBIDDEN', accessRule };
}

function requirePermission(permissionKey) {
  return async function permissionMiddleware(req, res, next) {
    try {
      const result = await can(req.user, permissionKey);
      if (!result.allowed) return unauthorized(res, result.error || 'FORBIDDEN', 403);
      req.permission = { key: permissionKey, accessRule: result.accessRule };
      return next();
    } catch (error) {
      console.error('Ошибка проверки permission:', error);
      return res.status(500).json({ ok: false, error: 'AUTHORIZATION_ERROR' });
    }
  };
}

function optionalAuthMiddleware(req, res, next) {
  try {
    const token = readToken(req);
    if (token) {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        email: decoded.email,
        activeRoleId: decoded.activeRoleId || null,
      };
    }
  } catch (_) {}
  next();
}

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  requirePermission,
  getPermissionGrant,
  userHasStore,
  can,
};
