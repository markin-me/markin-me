const express = require('express');
const bcrypt = require('bcryptjs');
const { getPermissionGrant } = require('../middleware/auth');

const VALID_ACCESS_RULES = new Set(['all', 'stores', 'own', 'assigned']);
const VALID_START_ROUTES = new Set([
  '/dashboard/cash',
  '/dashboard/products',
  '/dashboard/orders',
  '/dashboard/courier-screen',
  '/dashboard/new-order',
  '/dashboard/clients',
  '/dashboard/chat',
  '/dashboard/team',
  '/dashboard/settings',
]);

module.exports = function makeAdminTeamRouter({ db, helpers, requirePermission }) {
  const router = express.Router();

  function tenantId(req) {
    return Number(req.user && req.user.tenantId || 0);
  }

  function uniqueIds(value) {
    return Array.from(new Set((Array.isArray(value) ? value : [])
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item > 0)));
  }

  function normalizeLogin(value) {
    return String(value || '').trim().toLowerCase();
  }

  function normalizeStartRoute(value) {
    const route = String(value || '').trim();
    return VALID_START_ROUTES.has(route) ? route : null;
  }

  function teamError(res, status, error, details) {
    return res.status(status).json({ ok: false, error, ...(details ? { details } : {}) });
  }

  async function requireAnyPermission(req, res, next) {
    try {
      if (req.user && req.user.fullAccess === true) return next();
      for (const key of ['users.view', 'users.manage', 'roles.manage']) {
        if (await getPermissionGrant(req.user, key)) return next();
      }
      return teamError(res, 403, 'FORBIDDEN');
    } catch (error) {
      console.error('TEAM_PERMISSION_CHECK_FAILED:', error);
      return teamError(res, 500, 'AUTHORIZATION_ERROR');
    }
  }

  async function verifyRoleIds(queryable, currentTenantId, roleIds) {
    if (!roleIds.length) return false;
    const [rows] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND id IN (${roleIds.map(() => '?').join(',')})`,
      [currentTenantId, ...roleIds]
    );
    return rows.length === roleIds.length;
  }

  async function includesOwnerRole(queryable, currentTenantId, roleIds) {
    if (!roleIds.length) return false;
    const [rows] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND is_owner=1 AND id IN (${roleIds.map(() => '?').join(',')})
       LIMIT 1`,
      [currentTenantId, ...roleIds]
    );
    return rows.length > 0;
  }

  function actorCanAssignOwner(req) {
    return Boolean(req.user?.fullAccess || req.user?.activeRole?.is_owner);
  }

  async function verifyStoreIds(queryable, currentTenantId, storeIds) {
    if (!storeIds.length) return true;
    const [rows] = await queryable.query(
      `SELECT id FROM ten_stores
       WHERE tenant_id=? AND id IN (${storeIds.map(() => '?').join(',')})`,
      [currentTenantId, ...storeIds]
    );
    return rows.length === storeIds.length;
  }

  async function loadUsers(queryable, currentTenantId, onlyUserId = null) {
    const params = [currentTenantId];
    const userFilter = Number(onlyUserId) > 0 ? ' AND u.id=?' : '';
    if (userFilter) params.push(Number(onlyUserId));
    const [users] = await queryable.query(
      `SELECT u.id, u.name, u.login, u.email, u.comment, u.is_active, u.must_change_password,
              u.last_login_at, u.created_at
       FROM app_users u
       WHERE u.tenant_id=?${userFilter}
       ORDER BY u.is_active DESC, u.name, u.id`,
      params
    );
    if (!users.length) return [];
    const ids = users.map((user) => Number(user.id));
    const placeholders = ids.map(() => '?').join(',');
    const [roles] = await queryable.query(
      `SELECT ur.user_id, r.id, r.name, r.is_owner
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
       WHERE ur.tenant_id=? AND ur.user_id IN (${placeholders})
       ORDER BY r.is_owner DESC, r.name, r.id`,
      [currentTenantId, ...ids]
    );
    const [stores] = await queryable.query(
      `SELECT us.user_id, s.id, s.name
       FROM user_stores us
       JOIN ten_stores s ON s.tenant_id=us.tenant_id AND s.id=us.store_id
       WHERE us.tenant_id=? AND us.user_id IN (${placeholders})
       ORDER BY s.name, s.id`,
      [currentTenantId, ...ids]
    );
    return users.map((user) => ({
      ...user,
      id: Number(user.id),
      is_active: Number(user.is_active) === 1,
      must_change_password: Number(user.must_change_password) === 1,
      roles: roles.filter((role) => Number(role.user_id) === Number(user.id)).map((role) => ({
        id: Number(role.id), name: role.name, is_owner: Number(role.is_owner) === 1,
      })),
      stores: stores.filter((store) => Number(store.user_id) === Number(user.id)).map((store) => ({
        id: Number(store.id), name: store.name,
      })),
    }));
  }

  async function loadRoles(queryable, currentTenantId, onlyRoleId = null) {
    const params = [currentTenantId];
    const roleFilter = Number(onlyRoleId) > 0 ? ' AND r.id=?' : '';
    if (roleFilter) params.push(Number(onlyRoleId));
    const [roles] = await queryable.query(
      `SELECT r.id, r.name, r.description, r.start_route, r.is_system, r.is_owner, r.system_key,
              COUNT(DISTINCT ur.user_id) AS users_count
       FROM tenant_roles r
       LEFT JOIN user_roles ur ON ur.tenant_id=r.tenant_id AND ur.role_id=r.id
       WHERE r.tenant_id=?${roleFilter}
       GROUP BY r.id
       ORDER BY r.is_owner DESC, r.is_system DESC, r.name, r.id`,
      params
    );
    if (!roles.length) return [];
    const ids = roles.map((role) => Number(role.id));
    const placeholders = ids.map(() => '?').join(',');
    const [permissions] = await queryable.query(
      `SELECT rp.role_id, p.id, p.permission_key, p.group_key, p.label, rp.access_rule
       FROM role_permissions rp
       JOIN system_permissions p ON p.id=rp.permission_id
       WHERE rp.tenant_id=? AND rp.role_id IN (${placeholders})
       ORDER BY p.sort_order, p.id`,
      [currentTenantId, ...ids]
    );
    const [users] = await queryable.query(
      `SELECT ur.role_id, u.id, u.name, u.login, u.is_active
       FROM user_roles ur
       JOIN app_users u ON u.tenant_id=ur.tenant_id AND u.id=ur.user_id
       WHERE ur.tenant_id=? AND ur.role_id IN (${placeholders})
       ORDER BY u.name, u.id`,
      [currentTenantId, ...ids]
    );
    return roles.map((role) => ({
      ...role,
      id: Number(role.id),
      users_count: Number(role.users_count || 0),
      is_system: Number(role.is_system) === 1,
      is_owner: Number(role.is_owner) === 1,
      permissions: permissions.filter((permission) => Number(permission.role_id) === Number(role.id)).map((permission) => ({
        id: Number(permission.id),
        key: permission.permission_key,
        group_key: permission.group_key,
        label: permission.label,
        access_rule: permission.access_rule,
      })),
      users: users.filter((user) => Number(user.role_id) === Number(role.id)).map((user) => ({
        id: Number(user.id), name: user.name, login: user.login, is_active: Number(user.is_active) === 1,
      })),
    }));
  }

  async function replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds) {
    await conn.query('DELETE FROM user_roles WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
    for (const roleId of roleIds) {
      await conn.query(
        'INSERT INTO user_roles (tenant_id, user_id, role_id) VALUES (?, ?, ?)',
        [currentTenantId, userId, roleId]
      );
    }
    await conn.query('DELETE FROM user_stores WHERE tenant_id=? AND user_id=?', [currentTenantId, userId]);
    for (const storeId of storeIds) {
      await conn.query(
        'INSERT INTO user_stores (tenant_id, user_id, store_id) VALUES (?, ?, ?)',
        [currentTenantId, userId, storeId]
      );
    }
  }

  async function wouldRemoveLastOwner(conn, currentTenantId, userId, nextRoleIds, nextActive) {
    const [ownerRoles] = await conn.query(
      'SELECT id FROM tenant_roles WHERE tenant_id=? AND is_owner=1',
      [currentTenantId]
    );
    const ownerIds = new Set(ownerRoles.map((role) => Number(role.id)));
    const retainsOwner = nextActive && nextRoleIds.some((roleId) => ownerIds.has(roleId));
    if (retainsOwner) return false;
    const [rows] = await conn.query(
      `SELECT DISTINCT ur.user_id
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id AND r.is_owner=1
       JOIN app_users u ON u.tenant_id=ur.tenant_id AND u.id=ur.user_id AND u.is_active=1
       WHERE ur.tenant_id=? AND ur.user_id<>?
       FOR UPDATE`,
      [currentTenantId, userId]
    );
    return rows.length === 0;
  }

  router.get('/bootstrap', requireAnyPermission, async (req, res) => {
    try {
      const currentTenantId = tenantId(req);
      const [users, roles, storesResult, permissionsResult] = await Promise.all([
        loadUsers(db, currentTenantId),
        loadRoles(db, currentTenantId),
        db.query('SELECT id, name, is_active FROM ten_stores WHERE tenant_id=? ORDER BY is_active DESC, name, id', [currentTenantId]),
        db.query('SELECT id, permission_key, group_key, label, description, allowed_access_rules FROM system_permissions ORDER BY sort_order, id'),
      ]);
      const stores = storesResult[0].map((store) => ({ ...store, id: Number(store.id), is_active: Number(store.is_active) === 1 }));
      const permissions = permissionsResult[0].map((permission) => ({
        id: Number(permission.id),
        key: permission.permission_key,
        group_key: permission.group_key,
        label: permission.label,
        description: permission.description || '',
        allowed_access_rules: String(permission.allowed_access_rules || 'all').split(',').filter(Boolean),
      }));
      return res.json({ ok: true, users, roles, stores, permissions, start_routes: Array.from(VALID_START_ROUTES) });
    } catch (error) {
      console.error('TEAM_BOOTSTRAP_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  router.get('/users/:id', requireAnyPermission, async (req, res) => {
    try {
      const users = await loadUsers(db, tenantId(req), Number(req.params.id));
      if (!users.length) return teamError(res, 404, 'USER_NOT_FOUND');
      return res.json({ ok: true, user: users[0] });
    } catch (error) {
      console.error('TEAM_USER_READ_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  router.post('/users', requirePermission('users.manage'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const login = normalizeLogin(req.body.login);
      const password = helpers.strOrNull(req.body.temporary_password);
      const comment = helpers.strOrNull(req.body.comment);
      const roleIds = uniqueIds(req.body.role_ids);
      const storeIds = uniqueIds(req.body.store_ids);
      const isActive = req.body.is_active === false || Number(req.body.is_active) === 0 ? 0 : 1;
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (!/^[a-z0-9._-]{3,64}$/.test(login)) return teamError(res, 400, 'INVALID_LOGIN');
      if (!password || password.length < 6) return teamError(res, 400, 'PASSWORD_TOO_SHORT');
      if (password.length > 256) return teamError(res, 400, 'PASSWORD_TOO_LONG');
      if (!roleIds.length) return teamError(res, 400, 'ROLE_REQUIRED');

      await conn.beginTransaction();
      if (!await verifyRoleIds(conn, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_ROLE');
      }
      if (await includesOwnerRole(conn, currentTenantId, roleIds) && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (!await verifyStoreIds(conn, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_STORE');
      }
      const [existing] = await conn.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND login=? LIMIT 1',
        [currentTenantId, login]
      );
      if (existing.length) {
        await conn.rollback();
        return teamError(res, 409, 'LOGIN_EXISTS');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await conn.query(
        `INSERT INTO app_users
          (tenant_id, login, email, password_hash, must_change_password, name, comment, role, is_active)
         VALUES (?, ?, NULL, ?, 1, ?, ?, 'manager', ?)`,
        [currentTenantId, login, passwordHash, name, comment, isActive]
      );
      const userId = Number(result.insertId);
      await replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds);
      await conn.commit();
      const users = await loadUsers(db, currentTenantId, userId);
      return res.status(201).json({ ok: true, user: users[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'LOGIN_EXISTS');
      console.error('TEAM_USER_CREATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.put('/users/:id', requirePermission('users.manage'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      const name = helpers.strOrNull(req.body.name);
      const login = normalizeLogin(req.body.login);
      const comment = helpers.strOrNull(req.body.comment);
      const roleIds = uniqueIds(req.body.role_ids);
      const storeIds = uniqueIds(req.body.store_ids);
      const isActive = req.body.is_active === false || Number(req.body.is_active) === 0 ? 0 : 1;
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (!roleIds.length) return teamError(res, 400, 'ROLE_REQUIRED');

      await conn.beginTransaction();
      const [existingUsers] = await conn.query(
        `SELECT u.id, u.email,
                EXISTS(
                  SELECT 1 FROM user_roles ur
                  JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
                  WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1
                ) AS is_owner
         FROM app_users u
         WHERE u.tenant_id=? AND u.id=? LIMIT 1 FOR UPDATE`,
        [currentTenantId, userId]
      );
      if (!existingUsers.length) {
        await conn.rollback();
        return teamError(res, 404, 'USER_NOT_FOUND');
      }
      if (Number(existingUsers[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (!await verifyRoleIds(conn, currentTenantId, roleIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_ROLE');
      }
      if (await includesOwnerRole(conn, currentTenantId, roleIds) && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      if (login && !/^[a-z0-9._-]{3,64}$/.test(login)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_LOGIN');
      }
      if (!login && !existingUsers[0].email) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_LOGIN');
      }
      if (!await verifyStoreIds(conn, currentTenantId, storeIds)) {
        await conn.rollback();
        return teamError(res, 400, 'INVALID_STORE');
      }
      if (await wouldRemoveLastOwner(conn, currentTenantId, userId, roleIds, isActive === 1)) {
        await conn.rollback();
        return teamError(res, 409, 'LAST_OWNER_REQUIRED');
      }
      const [loginOwner] = login ? await conn.query(
        'SELECT id FROM app_users WHERE tenant_id=? AND login=? AND id<>? LIMIT 1',
        [currentTenantId, login, userId]
      ) : [[]];
      if (loginOwner.length) {
        await conn.rollback();
        return teamError(res, 409, 'LOGIN_EXISTS');
      }
      await conn.query(
        `UPDATE app_users SET name=?, login=?, comment=?, is_active=?
         WHERE tenant_id=? AND id=?`,
        [name, login || null, comment, isActive, currentTenantId, userId]
      );
      await replaceUserRelations(conn, currentTenantId, userId, roleIds, storeIds);
      await conn.commit();
      const users = await loadUsers(db, currentTenantId, userId);
      return res.json({ ok: true, user: users[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'LOGIN_EXISTS');
      console.error('TEAM_USER_UPDATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.post('/users/:id/reset-password', requirePermission('users.manage'), async (req, res) => {
    try {
      const currentTenantId = tenantId(req);
      const userId = Number(req.params.id);
      const password = helpers.strOrNull(req.body.temporary_password);
      if (!(userId > 0)) return teamError(res, 400, 'INVALID_USER');
      if (!password || password.length < 6) return teamError(res, 400, 'PASSWORD_TOO_SHORT');
      if (password.length > 256) return teamError(res, 400, 'PASSWORD_TOO_LONG');
      const [users] = await db.query(
        `SELECT u.id,
                EXISTS(
                  SELECT 1 FROM user_roles ur
                  JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
                  WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1
                ) AS is_owner
         FROM app_users u
         WHERE u.tenant_id=? AND u.id=? LIMIT 1`,
        [currentTenantId, userId]
      );
      if (!users.length) return teamError(res, 404, 'USER_NOT_FOUND');
      if (Number(users[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const [result] = await db.query(
        `UPDATE app_users SET password_hash=?, must_change_password=1
         WHERE tenant_id=? AND id=?`,
        [passwordHash, currentTenantId, userId]
      );
      if (!result.affectedRows) return teamError(res, 404, 'USER_NOT_FOUND');
      return res.json({ ok: true });
    } catch (error) {
      console.error('TEAM_PASSWORD_RESET_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  router.get('/roles/:id', requireAnyPermission, async (req, res) => {
    try {
      const roles = await loadRoles(db, tenantId(req), Number(req.params.id));
      if (!roles.length) return teamError(res, 404, 'ROLE_NOT_FOUND');
      return res.json({ ok: true, role: roles[0] });
    } catch (error) {
      console.error('TEAM_ROLE_READ_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    }
  });

  async function replaceRolePermissions(conn, currentTenantId, roleId, grants) {
    const normalized = Array.isArray(grants) ? grants : [];
    const permissionIds = uniqueIds(normalized.map((grant) => grant.permission_id));
    if (permissionIds.length) {
      const [rows] = await conn.query(
        `SELECT id, allowed_access_rules FROM system_permissions
         WHERE id IN (${permissionIds.map(() => '?').join(',')})`,
        permissionIds
      );
      if (rows.length !== permissionIds.length) return { ok: false, error: 'INVALID_PERMISSION' };
      const byId = new Map(rows.map((row) => [Number(row.id), row]));
      for (const grant of normalized) {
        const permissionId = Number(grant.permission_id);
        if (!permissionIds.includes(permissionId)) continue;
        const accessRule = String(grant.access_rule || 'all');
        const allowed = String(byId.get(permissionId).allowed_access_rules || 'all').split(',');
        if (!VALID_ACCESS_RULES.has(accessRule) || !allowed.includes(accessRule)) {
          return { ok: false, error: 'INVALID_ACCESS_RULE' };
        }
      }
    }
    await conn.query('DELETE FROM role_permissions WHERE tenant_id=? AND role_id=?', [currentTenantId, roleId]);
    for (const permissionId of permissionIds) {
      const grant = normalized.find((item) => Number(item.permission_id) === permissionId);
      await conn.query(
        `INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
         VALUES (?, ?, ?, ?)`,
        [currentTenantId, roleId, permissionId, String(grant.access_rule || 'all')]
      );
    }
    return { ok: true };
  }

  router.post('/roles', requirePermission('roles.manage'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const name = helpers.strOrNull(req.body.name);
      const description = helpers.strOrNull(req.body.description);
      const startRoute = normalizeStartRoute(req.body.start_route);
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (description && description.length > 255) return teamError(res, 400, 'DESCRIPTION_TOO_LONG');
      if (!startRoute) return teamError(res, 400, 'INVALID_START_ROUTE');
      await conn.beginTransaction();
      const [result] = await conn.query(
        `INSERT INTO tenant_roles
          (tenant_id, name, description, start_route, is_system, is_owner, system_key)
         VALUES (?, ?, ?, ?, 0, 0, NULL)`,
        [currentTenantId, name, description, startRoute]
      );
      const roleId = Number(result.insertId);
      const permissionsResult = await replaceRolePermissions(conn, currentTenantId, roleId, req.body.permissions);
      if (!permissionsResult.ok) {
        await conn.rollback();
        return teamError(res, 400, permissionsResult.error);
      }
      await conn.commit();
      const roles = await loadRoles(db, currentTenantId, roleId);
      return res.status(201).json({ ok: true, role: roles[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'ROLE_NAME_EXISTS');
      console.error('TEAM_ROLE_CREATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.put('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const roleId = Number(req.params.id);
      const name = helpers.strOrNull(req.body.name);
      const description = helpers.strOrNull(req.body.description);
      const startRoute = normalizeStartRoute(req.body.start_route);
      if (!(roleId > 0)) return teamError(res, 400, 'INVALID_ROLE');
      if (!name) return teamError(res, 400, 'NAME_REQUIRED');
      if (name.length > 100) return teamError(res, 400, 'NAME_TOO_LONG');
      if (description && description.length > 255) return teamError(res, 400, 'DESCRIPTION_TOO_LONG');
      if (!startRoute) return teamError(res, 400, 'INVALID_START_ROUTE');
      await conn.beginTransaction();
      const [roles] = await conn.query(
        'SELECT id, is_owner FROM tenant_roles WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE',
        [currentTenantId, roleId]
      );
      if (!roles.length) {
        await conn.rollback();
        return teamError(res, 404, 'ROLE_NOT_FOUND');
      }
      if (Number(roles[0].is_owner) === 1 && !actorCanAssignOwner(req)) {
        await conn.rollback();
        return teamError(res, 403, 'OWNER_ROLE_FORBIDDEN');
      }
      await conn.query(
        `UPDATE tenant_roles SET name=?, description=?, start_route=?
         WHERE tenant_id=? AND id=?`,
        [name, description, startRoute, currentTenantId, roleId]
      );
      const permissionsResult = await replaceRolePermissions(conn, currentTenantId, roleId, req.body.permissions);
      if (!permissionsResult.ok) {
        await conn.rollback();
        return teamError(res, 400, permissionsResult.error);
      }
      if (Number(roles[0].is_owner) === 1) {
        const [permissionCount] = await conn.query(
          'SELECT COUNT(*) AS total FROM system_permissions'
        );
        const [rolePermissionCount] = await conn.query(
          `SELECT COUNT(*) AS total,
                  SUM(CASE WHEN access_rule<>'all' THEN 1 ELSE 0 END) AS restricted
           FROM role_permissions WHERE tenant_id=? AND role_id=?`,
          [currentTenantId, roleId]
        );
        if (Number(rolePermissionCount[0].total) !== Number(permissionCount[0].total)
            || Number(rolePermissionCount[0].restricted || 0) > 0) {
          await conn.rollback();
          return teamError(res, 409, 'OWNER_REQUIRES_FULL_ACCESS');
        }
      }
      await conn.commit();
      const updated = await loadRoles(db, currentTenantId, roleId);
      return res.json({ ok: true, role: updated[0] });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      if (error.code === 'ER_DUP_ENTRY') return teamError(res, 409, 'ROLE_NAME_EXISTS');
      console.error('TEAM_ROLE_UPDATE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  router.delete('/roles/:id', requirePermission('roles.manage'), async (req, res) => {
    const conn = await db.getConnection();
    try {
      const currentTenantId = tenantId(req);
      const roleId = Number(req.params.id);
      await conn.beginTransaction();
      const [roles] = await conn.query(
        `SELECT id, is_system, is_owner FROM tenant_roles
         WHERE tenant_id=? AND id=? LIMIT 1 FOR UPDATE`,
        [currentTenantId, roleId]
      );
      const role = roles[0];
      if (!role) {
        await conn.rollback();
        return teamError(res, 404, 'ROLE_NOT_FOUND');
      }
      if (Number(role.is_system) === 1 || Number(role.is_owner) === 1) {
        await conn.rollback();
        return teamError(res, 409, 'SYSTEM_ROLE_PROTECTED');
      }
      const [assigned] = await conn.query(
        'SELECT COUNT(*) AS total FROM user_roles WHERE tenant_id=? AND role_id=?',
        [currentTenantId, roleId]
      );
      if (Number(assigned[0].total) > 0) {
        await conn.rollback();
        return teamError(res, 409, 'ROLE_HAS_USERS');
      }
      await conn.query('DELETE FROM tenant_roles WHERE tenant_id=? AND id=?', [currentTenantId, roleId]);
      await conn.commit();
      return res.json({ ok: true });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      console.error('TEAM_ROLE_DELETE_FAILED:', error);
      return teamError(res, 500, 'DB_ERROR');
    } finally {
      conn.release();
    }
  });

  return router;
};
