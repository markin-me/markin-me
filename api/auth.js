const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const employeeIdentity = require('./helpers/employeeIdentity');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';

module.exports = function makeAuthRouter({ db, helpers }) {
  const router = express.Router();
  const loginAttempts = new Map();
  router.use(['/login', '/change-password'], (req, res, next) => {
    if (!employeeIdentity.secureTransport(req)) return res.status(426).json({ ok: false, error: 'HTTPS_REQUIRED' });
    const now = Date.now();
    for (const [key, item] of loginAttempts) if (item.until <= now) loginAttempts.delete(key);
    const key = req.ip;
    const item = loginAttempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    item.count += 1;
    if (loginAttempts.size >= 10000 && !loginAttempts.has(key)) return res.status(429).json({ ok: false, error: 'LOGIN_RATE_LIMITED' });
    loginAttempts.set(key, item);
    if (item.count > 100) {
      res.set('Retry-After', String(Math.ceil((item.until - now) / 1000)));
      return res.status(429).json({ ok: false, error: 'LOGIN_RATE_LIMITED' });
    }
    next();
  });

  function signUserToken(user, options = {}) {
    return jwt.sign({
      userId: user.id || null,
      tenantId: Number(user.tenant_id),
      email: user.email || null,
      login: user.login || null,
      activeRoleId: options.activeRoleId || null,
      loginType: options.loginType || 'user',
      authStage: options.authStage || 'active',
    }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  }

  function readRequestToken(req) {
    const header = String(req.headers.authorization || '');
    if (header.startsWith('Bearer ')) return header.slice(7);
    return req.cookies?.token || req.body?.token || null;
  }

  function publicRole(role) {
    return {
      id: Number(role.id),
      name: role.name,
      description: role.description || '',
      start_route: role.start_route,
    };
  }

  function publicUser(user, activeRoleId = null) {
    return {
      id: user.id ? Number(user.id) : null,
      email: user.email || null,
      login: user.login || null,
      name: user.name,
      role: user.role,
      tenant_id: Number(user.tenant_id),
      active_role_id: activeRoleId ? Number(activeRoleId) : null,
    };
  }

  async function loadUserRoles(queryable, tenantId, userId) {
    const [roles] = await queryable.query(
      `SELECT r.id, r.name, r.description, r.start_route, r.is_owner
       FROM user_roles ur
       JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id
       WHERE ur.tenant_id=? AND ur.user_id=?
       ORDER BY r.is_owner DESC, r.name, r.id`,
      [tenantId, userId]
    );
    return roles;
  }

  async function ensureOwnerRole(queryable, tenantId, userId) {
    let [roles] = await queryable.query(
      `SELECT id FROM tenant_roles
       WHERE tenant_id=? AND system_key='owner'
       LIMIT 1`,
      [tenantId]
    );
    let roleId = roles[0] ? Number(roles[0].id) : 0;
    if (!roleId) {
      const [result] = await queryable.query(
        `INSERT INTO tenant_roles
          (tenant_id, name, description, start_route, is_system, is_owner, system_key)
         VALUES (?, 'Владелец', 'Системная роль с полным доступом', '/dashboard/products', 1, 1, 'owner')`,
        [tenantId]
      );
      roleId = Number(result.insertId);
    }
    await queryable.query(
      `INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
       SELECT ?, ?, id, 'all' FROM system_permissions
       ON DUPLICATE KEY UPDATE access_rule='all'`,
      [tenantId, roleId]
    );
    await queryable.query(
      `INSERT INTO user_roles (tenant_id, user_id, role_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role_id=VALUES(role_id)`,
      [tenantId, userId, roleId]
    );
    return roleId;
  }

  async function buildSuccessfulAuth(user, tenant, queryable = db) {
    const roles = await loadUserRoles(queryable, user.tenant_id, user.id);
    if (!roles.length) return { status: 403, body: { ok: false, error: 'ROLE_NOT_ASSIGNED' } };

    if (roles.length > 1) {
      return {
        status: 200,
        body: {
          ok: true,
          next: 'select-role',
          token: signUserToken(user, { authStage: 'role-selection' }),
          user: publicUser(user),
          tenant,
          roles: roles.map(publicRole),
        },
      };
    }

    const role = roles[0];
    return {
      status: 200,
      body: {
        ok: true,
        next: 'dashboard',
        redirect: role.start_route,
        token: signUserToken(user, { activeRoleId: role.id }),
        user: publicUser(user, role.id),
        tenant,
        roles: [publicRole(role)],
        active_role: publicRole(role),
      },
    };
  }

  router.post('/register', async (req, res) => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const email = helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);
      const name = helpers.strOrNull(req.body.name);
      const shopName = helpers.strOrNull(req.body.shop_name) || 'Мой Магазин';
      const slug = helpers.strOrNull(req.body.slug);

      if (!email || !email.includes('@')) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'INVALID_EMAIL' });
      }
      if (!password || password.length < 6) {
        await conn.rollback();
        return res.status(400).json({ ok: false, error: 'PASSWORD_TOO_SHORT' });
      }

      const [existingUsers] = await conn.query('SELECT id FROM app_users WHERE email=? LIMIT 1', [email]);
      const [existingTenants] = await conn.query('SELECT id FROM ten_tenants WHERE email=? LIMIT 1', [email]);
      if (existingUsers.length || existingTenants.length) {
        await conn.rollback();
        return res.status(409).json({ ok: false, error: 'EMAIL_EXISTS' });
      }

      let finalSlug = slug;
      if (!finalSlug) {
        const base = shopName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        finalSlug = base || 'shop';
        let counter = 1;
        let candidate = finalSlug;
        while (true) {
          const [exists] = await conn.query('SELECT id FROM ten_tenants WHERE slug=? LIMIT 1', [candidate]);
          if (!exists.length) { finalSlug = candidate; break; }
          candidate = `${finalSlug}-${counter++}`;
        }
      } else {
        const [exists] = await conn.query('SELECT id FROM ten_tenants WHERE slug=? LIMIT 1', [finalSlug]);
        if (exists.length) {
          await conn.rollback();
          return res.status(409).json({ ok: false, error: 'SLUG_EXISTS' });
        }
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const [tenantResult] = await conn.query(
        `INSERT INTO ten_tenants (name, slug, subdomain, email, password_hash, is_active)
         VALUES (?, ?, ?, ?, ?, 1)`,
        [shopName, finalSlug, null, email, passwordHash]
      );
      const tenantId = Number(tenantResult.insertId);
      const generatedSubdomain = `shop-${tenantId}`;
      await conn.query('UPDATE ten_tenants SET subdomain=? WHERE id=?', [generatedSubdomain, tenantId]);
      let loginSuffix = `tenant-${tenantId}`;
      for (let number = 1; ; number += 1) {
        const [taken] = await conn.query('SELECT id FROM ten_tenants WHERE login_suffix=?', [loginSuffix]);
        if (!taken.length) break;
        loginSuffix = `tenant-${tenantId}-${number}`;
      }
      await conn.query('UPDATE ten_tenants SET login_suffix=?, corporate_logins_enabled=1 WHERE id=?', [loginSuffix, tenantId]);

      const [userResult] = await conn.query(
        `INSERT INTO app_users
          (tenant_id, email, login, password_hash, must_change_password, name, role, is_active)
         VALUES (?, ?, NULL, ?, 0, ?, 'owner', 1)`,
        [tenantId, email, passwordHash, name || 'Владелец']
      );
      const userId = Number(userResult.insertId);
      const ownerRoleId = await ensureOwnerRole(conn, tenantId, userId);
      await helpers.ensureDefaultCategories(conn, tenantId);
      await conn.commit();

      const user = { id: userId, tenant_id: tenantId, email, login: null, name: name || 'Владелец', role: 'owner' };
      const tenant = { id: tenantId, name: shopName, slug: finalSlug, subdomain: generatedSubdomain };
      return res.json({
        ok: true,
        next: 'dashboard',
        redirect: '/dashboard/products',
        token: signUserToken(user, { activeRoleId: ownerRoleId }),
        user: publicUser(user, ownerRoleId),
        tenant,
      });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      console.error('Ошибка регистрации:', error);
      return res.status(500).json({ ok: false, error: 'REGISTRATION_ERROR' });
    } finally {
      conn.release();
    }
  });

  router.post('/login', async (req, res) => {
    try {
      const credential = helpers.strOrNull(req.body.login) || helpers.strOrNull(req.body.email);
      const password = helpers.strOrNull(req.body.password);
      if (!credential || !password) return res.status(400).json({ ok: false, error: 'LOGIN_PASSWORD_REQUIRED' });

      const corporate = /^([a-z0-9._-]+)@([a-z0-9-]+)$/i.exec(credential);
      let params;
      let identityFilter;
      if (corporate) {
        params = [corporate[1].toLowerCase(), corporate[2].toLowerCase()];
        identityFilter = 'u.login_local=? AND t.login_suffix=?';
      } else {
        if (!credential.includes('@')) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        params = [credential];
        identityFilter = `(u.email=? AND (u.role='owner' OR EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1)))`;
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.password_hash, u.must_change_password,
                u.name, u.role, u.is_active, t.name AS tenant_name, t.slug AS tenant_slug,
                t.is_active AS tenant_active
         FROM app_users u
         JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE (${identityFilter})
         ORDER BY u.id
         LIMIT 2`,
        params
      );

      if (users.length > 1) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });

      if (users.length === 1) {
        const user = users[0];
        if (!await bcrypt.compare(password, user.password_hash)) {
          return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
        }
        if (Number(user.is_active) !== 1) return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
        if (Number(user.tenant_active) !== 1) return res.status(403).json({ ok: false, error: 'TENANT_BLOCKED' });
        await db.query('UPDATE app_users SET last_login_at=NOW() WHERE id=? AND tenant_id=?', [user.id, user.tenant_id]);
        const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
        const auth = await buildSuccessfulAuth(user, tenant);
        return res.status(auth.status).json(auth.body);
      }

      if (corporate || !credential.includes('@')) return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      const [tenants] = await db.query(
        `SELECT id AS tenant_id, email, password_hash, name AS tenant_name, slug AS tenant_slug, is_active
         FROM ten_tenants WHERE email=? LIMIT 1`,
        [credential]
      );
      const tenant = tenants[0];
      if (!tenant || Number(tenant.is_active) !== 1 || !tenant.password_hash
          || !await bcrypt.compare(password, tenant.password_hash)) {
        return res.status(401).json({ ok: false, error: 'INVALID_CREDENTIALS' });
      }
      const tokenUser = { id: null, tenant_id: tenant.tenant_id, email: tenant.email, login: null, name: `${tenant.tenant_name} (Магазин)`, role: 'owner' };
      return res.json({
        ok: true,
        next: 'dashboard',
        redirect: '/dashboard/products',
        token: signUserToken(tokenUser, { loginType: 'tenant' }),
        user: publicUser(tokenUser),
        tenant: { id: Number(tenant.tenant_id), name: tenant.tenant_name, slug: tenant.tenant_slug },
      });
    } catch (error) {
      console.error('Ошибка входа:', error);
      return res.status(500).json({ ok: false, error: 'LOGIN_ERROR' });
    }
  });

  router.post('/change-password', async (req, res) => {
    try {
      const token = readRequestToken(req);
      const currentPassword = typeof req.body.current_password === 'string' ? req.body.current_password : '';
      const newPassword = req.body.new_password;
      if (!employeeIdentity.secureTransport(req)) return res.status(426).json({ ok: false, error: 'HTTPS_REQUIRED' });
      try { employeeIdentity.validatePassword(newPassword); } catch (error) { return res.status(400).json({ ok: false, error: error.code }); }
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      if (!currentPassword) return res.status(400).json({ ok: false, error: 'CURRENT_PASSWORD_REQUIRED' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!(Number(decoded.userId) > 0) || !(Number(decoded.tenantId) > 0)) {
        return res.status(403).json({ ok: false, error: 'PASSWORD_CHANGE_NOT_ALLOWED' });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.role, u.is_active,
                u.password_hash, u.must_change_password, t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user || Number(user.is_active) !== 1 || Number(user.tenant_active) !== 1) {
        return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
      }
      if (!await bcrypt.compare(currentPassword, user.password_hash)) {
        return res.status(400).json({ ok: false, error: 'CURRENT_PASSWORD_INVALID' });
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      const [updated] = await db.query(
        'UPDATE app_users SET password_hash=?, must_change_password=0 WHERE id=? AND tenant_id=? AND password_hash=? AND is_active=1',
        [passwordHash, user.id, user.tenant_id, user.password_hash]
      );
      if (!updated.affectedRows) return res.status(409).json({ ok: false, error: 'PASSWORD_CHANGE_CONFLICT' });
      user.must_change_password = 0;
      const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
      const auth = await buildSuccessfulAuth(user, tenant);
      return res.status(auth.status).json(auth.body);
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('PASSWORD_CHANGE_FAILED:', error.code || error.name);
      return res.status(500).json({ ok: false, error: 'PASSWORD_CHANGE_ERROR' });
    }
  });

  router.post('/active-role', async (req, res) => {
    try {
      const token = readRequestToken(req);
      const roleId = Number(req.body.role_id || 0);
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      if (!(roleId > 0)) return res.status(400).json({ ok: false, error: 'ROLE_REQUIRED' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.userId || !(Number(decoded.tenantId) > 0)) {
        return res.status(403).json({ ok: false, error: 'ROLE_SWITCH_NOT_ALLOWED' });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.role, u.is_active, u.must_change_password,
                t.name AS tenant_name, t.slug AS tenant_slug, t.is_active AS tenant_active
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user || Number(user.is_active) !== 1 || Number(user.tenant_active) !== 1) {
        return res.status(403).json({ ok: false, error: 'USER_BLOCKED' });
      }
      const roles = await loadUserRoles(db, user.tenant_id, user.id);
      const selected = roles.find((role) => Number(role.id) === roleId);
      if (!selected) return res.status(403).json({ ok: false, error: 'ROLE_NOT_ASSIGNED' });
      const tenant = { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug };
      return res.json({
        ok: true,
        token: signUserToken(user, { activeRoleId: selected.id }),
        user: publicUser(user, selected.id),
        tenant,
        roles: roles.map(publicRole),
        active_role: publicRole(selected),
        redirect: selected.start_route,
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('Ошибка переключения роли:', error);
      return res.status(500).json({ ok: false, error: 'ROLE_SWITCH_ERROR' });
    }
  });

  router.get('/me', async (req, res) => {
    try {
      const token = readRequestToken(req);
      if (!token) return res.status(401).json({ ok: false, error: 'NO_TOKEN' });
      const decoded = jwt.verify(token, JWT_SECRET);
      if (!decoded.userId && (decoded.loginType === 'tenant' || decoded.role === 'owner')) {
        const [tenants] = await db.query('SELECT id, name, slug, email FROM ten_tenants WHERE id=? AND is_active=1 LIMIT 1', [decoded.tenantId]);
        const tenant = tenants[0];
        if (!tenant) return res.status(404).json({ ok: false, error: 'TENANT_NOT_FOUND' });
        const [stores] = await db.query('SELECT id, name FROM ten_stores WHERE tenant_id=? AND is_active=1 ORDER BY name, id', [tenant.id]);
        return res.json({ ok: true, user: { id: null, email: tenant.email, name: `${tenant.name} (Магазин)`, tenant_id: Number(tenant.id) }, tenant: { id: Number(tenant.id), name: tenant.name, slug: tenant.slug }, roles: [], permissions: ['*'], stores });
      }
      const [users] = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.login, u.name, u.role, u.is_active, u.must_change_password,
                t.name AS tenant_name, t.slug AS tenant_slug
         FROM app_users u JOIN ten_tenants t ON t.id=u.tenant_id
         WHERE u.id=? AND u.tenant_id=? AND u.is_active=1 AND t.is_active=1 LIMIT 1`,
        [decoded.userId, decoded.tenantId]
      );
      const user = users[0];
      if (!user) return res.status(404).json({ ok: false, error: 'USER_NOT_FOUND' });
      const roles = await loadUserRoles(db, user.tenant_id, user.id);
      const activeRole = roles.find((role) => Number(role.id) === Number(decoded.activeRoleId))
        || (roles.length === 1 ? roles[0] : null);
      const [permissionRows] = activeRole ? await db.query(
        `SELECT p.permission_key, rp.access_rule
         FROM role_permissions rp
         JOIN system_permissions p ON p.id=rp.permission_id
         WHERE rp.tenant_id=? AND rp.role_id=?
         ORDER BY p.sort_order, p.id`,
        [user.tenant_id, activeRole.id]
      ) : [[]];
      const [stores] = await db.query(
        `SELECT s.id, s.name
         FROM user_stores us
         JOIN ten_stores s ON s.tenant_id=us.tenant_id AND s.id=us.store_id
         WHERE us.tenant_id=? AND us.user_id=? AND s.is_active=1
         ORDER BY s.name, s.id`,
        [user.tenant_id, user.id]
      );
      return res.json({
        ok: true,
        user: publicUser(user, activeRole && activeRole.id),
        tenant: { id: Number(user.tenant_id), name: user.tenant_name, slug: user.tenant_slug },
        roles: roles.map(publicRole),
        active_role: activeRole ? publicRole(activeRole) : null,
        permissions: permissionRows.map((permission) => ({ key: permission.permission_key, access_rule: permission.access_rule })),
        stores,
      });
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return res.status(401).json({ ok: false, error: 'INVALID_TOKEN' });
      }
      console.error('Ошибка получения данных пользователя:', error);
      return res.status(500).json({ ok: false, error: 'DB_ERROR' });
    }
  });

  return router;
};
