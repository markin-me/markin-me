'use strict';

// Isolated API tests; no database connection and no application server.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const identity = require('../api/helpers/employeeIdentity');

const grants = ['team.employees.read', 'team.employees.create', 'team.employees.update',
  'team.employees.reset_password', 'team.roles.update', 'team.roles.permissions', 'team.roles.delete'];
const actor = (id = 1, owner = true) => ({ tenantId: 10, userId: id,
  activeRoleId: owner ? 100 : 101, activeRole: { is_owner: owner }, permissions: new Set(grants) });
const employee = (id, roleIds = [100]) => ({ id, tenant_id: 10, role: 'manager',
  role_ids: roleIds, store_ids: [], name: `Employee ${id}`, first_name: 'Иван', last_name: 'Иванов',
  login: `employee${id}@company`, login_local: `employee${id}`, email: null,
  employee_status: 'active', is_active: 1, auth_version: 0 });
const copy = (value) => JSON.parse(JSON.stringify(value));

function database(users = [employee(1), employee(2, [100, 101])]) {
  let data = { users: copy(users), suffix: 'company', nextId: 3,
    roles: [{ id: 100, tenant_id: 10, is_owner: 1, is_system: 1 },
      { id: 101, tenant_id: 10, is_owner: 0, is_system: 0 },
      { id: 102, tenant_id: 10, is_owner: 0, is_system: 0 },
      { id: 103, tenant_id: 10, is_owner: 0, is_system: 0 }],
    roleGrants: {
      101: [{ permission_id: 1, permission_key: 'team.roles.permissions', access_rule: 'all' },
        { permission_id: 2, permission_key: 'orders.list.read', access_rule: 'stores' }],
      102: [{ permission_id: 2, access_rule: 'stores' }],
      103: [{ permission_id: 2, access_rule: 'all' }],
    },
    permissions: [1, 2], rolePermissions: [1, 2] };
  let queue = Promise.resolve();
  const calls = [];
  const isOwner = (user) => user.role === 'owner' || data.roles.some((role) =>
    role.tenant_id === user.tenant_id && role.is_owner === 1 && user.role_ids.includes(role.id));
  const publicRow = (user) => ({ ...copy(user), is_owner: Number(isOwner(user)) });

  async function query(sql, values = [], connection = null) {
    sql = sql.replace(/\s+/g, ' ').trim();
    calls.push({ sql, values });
    if (sql.startsWith('SELECT login_suffix')) {
      const before = queue;
      let release;
      queue = new Promise((resolve) => { release = resolve; });
      await before;
      connection.unlock = release;
      connection.snapshot = copy(data);
      return [[{ login_suffix: data.suffix, corporate_logins_enabled: 1 }]];
    }
    if (sql.startsWith('SELECT') && sql.includes('FROM app_users u')) {
      let found = data.users.filter((user) => user.tenant_id === values[0]);
      if (sql.includes('u.id=?')) found = found.filter((user) => user.id === values[1]);
      if (sql.includes('u.email=?')) found = found.filter((user) => user.email === values[1]);
      if (sql.includes('u.login_local IS NOT NULL')) found = found.filter((user) => user.login_local && isOwner(user));
      if (sql.includes('AS is_owner') || sql.includes('u.login_local IS NOT NULL')) {
        assert.ok(sql.includes("u.role='owner'"), 'legacy owner must be checked');
        assert.ok(sql.includes('ur.tenant_id=u.tenant_id'), 'owner assignment must be tenant-scoped');
      }
      return [found.map(publicRow)];
    }
    if (sql.startsWith('SELECT r.id, r.is_owner FROM user_roles')) {
      const user = data.users.find((item) => item.tenant_id === values[0] && item.id === values[1]);
      return [data.roles.filter((role) => role.tenant_id === values[0] && user.role_ids.includes(role.id))];
    }
    if (sql.startsWith('SELECT ur.user_id')) {
      return [data.users.filter((user) => user.tenant_id === values[0] && values.slice(1).includes(user.id))
        .flatMap((user) => data.roles.filter((role) => role.tenant_id === user.tenant_id && user.role_ids.includes(role.id))
          .map((role) => ({ ...role, user_id: user.id, name: role.is_owner ? 'Owner' : 'Manager' })))];
    }
    if (sql.startsWith('SELECT store_id FROM user_stores')) {
      const user = data.users.find((item) => item.tenant_id === values[0] && item.id === values[1]);
      return [user.store_ids.map((store_id) => ({ store_id }))];
    }
    if (sql.startsWith('SELECT us.user_id')) return [[]];
    if (sql.startsWith('SELECT id FROM app_users')) return [[]];
    if (sql.startsWith('SELECT id FROM tenant_roles')) {
      return [data.roles.filter((role) => role.tenant_id === values[0] && values.slice(1).includes(role.id)
        && (!sql.includes('is_owner=1') || role.is_owner === 1))];
    }
    if (sql.startsWith('SELECT id, is_system, is_owner FROM tenant_roles')) {
      return [data.roles.filter((role) => role.tenant_id === values[0] && role.id === values[1])];
    }
    if (sql.startsWith('SELECT id, allowed_access_rules FROM system_permissions')) {
      return [data.permissions.map((id) => ({ id, allowed_access_rules: 'all' }))];
    }
    if (sql === 'SELECT id FROM system_permissions') return [data.permissions.map((id) => ({ id }))];
    if (sql.startsWith('SELECT permission_id, access_rule FROM role_permissions')) {
      return [data.rolePermissions.map((permission_id) => ({ permission_id, access_rule: 'all' }))];
    }
    if (sql.startsWith('SELECT rp.permission_id, p.permission_key')) {
      const user = data.users.find((item) => item.id === values[0] && item.tenant_id === values[1]);
      return [user?.role_ids.includes(values[2]) ? data.roleGrants[values[2]] || [] : []];
    }
    if (sql.startsWith('SELECT rp.permission_id, rp.access_rule FROM role_permissions')) {
      return [values.slice(1).flatMap((roleId) => data.roleGrants[roleId] || [])];
    }
    if (sql === 'SELECT COUNT(*) AS total FROM system_permissions') return [[{ total: data.permissions.length }]];
    if (sql.startsWith('SELECT COUNT(*) AS total, SUM(')) return [[{ total: data.rolePermissions.length, restricted: 0 }]];
    if (sql.startsWith('UPDATE tenant_roles')) return [{ affectedRows: 1 }];
    if (sql.startsWith('DELETE FROM role_permissions')) { data.rolePermissions = []; return [{ affectedRows: 2 }]; }
    if (sql.startsWith('INSERT INTO app_users')) {
      const user = employee(data.nextId++, []);
      Object.assign(user, { tenant_id: values[0], login: values[1], login_local: values[2],
        name: values[4], last_name: values[5], first_name: values[6], patronymic: values[7],
        is_active: values[12], employee_status: values[13] });
      data.users.push(user);
      return [{ insertId: user.id }];
    }
    if (sql.startsWith('DELETE FROM user_roles') || sql.startsWith('DELETE FROM user_stores')) {
      const user = data.users.find((item) => item.tenant_id === values[0] && item.id === values[1]);
      const field = sql.includes('user_roles') ? 'role_ids' : 'store_ids';
      user[field] = sql.includes('role_id NOT IN') ? user[field].filter((id) => values.slice(2).includes(id)) : [];
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('INSERT INTO user_roles') || sql.startsWith('INSERT INTO user_stores')) {
      const user = data.users.find((item) => item.tenant_id === values[0] && item.id === values[1]);
      user[sql.includes('user_roles') ? 'role_ids' : 'store_ids'].push(values[2]);
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE app_users SET employee_status')) {
      const user = data.users.find((item) => item.tenant_id === values[2] && item.id === values[3]);
      user.employee_status = values[0]; user.is_active = values[1]; user.auth_version++;
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE app_users SET name=')) {
      const user = data.users.find((item) => item.tenant_id === values[13] && item.id === values[14]);
      Object.assign(user, { name: values[0], last_name: values[1], first_name: values[2],
        patronymic: values[3], phone: values[4], login: values[5], login_local: values[6], comment: values[7] });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE app_users SET password_hash')) return [{ affectedRows: 1 }];
    if (sql.startsWith('UPDATE ten_tenants SET login_suffix')) { data.suffix = values[0]; return [{ affectedRows: 1 }]; }
    if (sql.startsWith('UPDATE app_users SET login=NULL')) {
      data.users.filter((user) => user.tenant_id === values[0] && user.login_local).forEach((user) => { user.login = null; });
      return [{ affectedRows: 1 }];
    }
    if (sql.startsWith('UPDATE app_users SET login=CONCAT')) {
      data.users.filter((user) => user.tenant_id === values[2] && user.login_local)
        .forEach((user) => { user.login = user.login_local + values[0] + values[1]; });
      return [{ affectedRows: 1 }];
    }
    throw new Error(`Unexpected SQL in isolated test: ${sql}`);
  }
  return { calls, get data() { return data; }, query,
    async getConnection() {
      const connection = { unlock: null, async beginTransaction() { connection.snapshot = copy(data); },
        query(sql, values) { return query(sql, values, connection); },
        async commit() { connection.snapshot = null; connection.unlock?.(); connection.unlock = null; },
        async rollback() {
          if (connection.snapshot) data = connection.snapshot;
          connection.snapshot = null; connection.unlock?.(); connection.unlock = null;
        }, release() { assert.equal(connection.unlock, null, 'transaction must finish before release'); } };
      return connection;
    } };
}

function api(db) {
  const filename = path.resolve(__dirname, '../api/admin/team.js');
  const originalRequire = createRequire(filename);
  const getPermissionGrant = async (user, key) => user.fullAccess || user.permissions?.has(key) ? { access_rule: 'all' } : null;
  const loaded = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module: loaded, exports: loaded.exports, console, Buffer, process,
    require(name) {
      if (name === '../middleware/auth') return { getPermissionGrant, revokeUserStreams() {} };
      if (name === 'bcryptjs') return { hash: async () => 'test-hash' };
      return originalRequire(name);
    } }, { filename });
  const router = loaded.exports({ db, helpers: { strOrNull: (value) => value == null || value === '' ? null : String(value).trim() },
    requirePermission: (key) => async (req, res, next) => await getPermissionGrant(req.user, key)
      ? next() : res.status(403).json({ ok: false, error: 'FORBIDDEN' }) });
  return async (method, route, body = {}, user = actor(), id = 2) => {
    const handlers = router.stack.find((layer) => layer.route?.path === route && layer.route.methods[method]).route.stack;
    const req = { user, body, params: { id }, headers: {}, secure: true };
    const res = { code: 200, status(code) { this.code = code; return this; }, json(value) { this.body = value; return this; } };
    async function next(index) { if (index < handlers.length) await handlers[index].handle(req, res, () => next(index + 1)); }
    await next(0);
    return res;
  };
}

const statusBody = (status, expected_status = 'active') => ({ status, expected_status, confirmed: true });
const profileBody = (extra = {}) => ({ first_name: 'Иван', last_name: 'Петров', role_ids: [100, 101], store_ids: [], login: 'employee2', ...extra });

test('all owner status transitions are forbidden, regardless of target active role or legacy ownership', async () => {
  for (const legacy of [false, true]) for (const activeRoleId of [100, 101]) {
    for (const [before, after] of [['active', 'blocked'], ['active', 'archived'], ['blocked', 'active'], ['archived', 'active']]) {
      const target = employee(2, legacy ? [101] : [100, 101]);
      Object.assign(target, { role: legacy ? 'owner' : 'manager', activeRoleId, employee_status: before });
      const db = database([employee(1), target]);
      const result = await api(db)('put', '/users/:id/status', statusBody(after, before));
      assert.equal(result.code, 403); assert.equal(result.body.error, 'OWNER_STATUS_CHANGE_FORBIDDEN');
      assert.equal(db.data.users[1].employee_status, before); assert.equal(db.data.users[1].auth_version, 0);
      assert.ok(!db.calls.some(({ sql }) => sql.startsWith('UPDATE app_users')));
    }
  }
});

test('owner role removal, bulk replacement, credentials and store changes are forbidden', async () => {
  for (const changes of [{ role_ids: [101] }, { role_ids: [] },
    { is_active: false }, { employee_status: 'archived' }, { login: 'replacement' }, { store_ids: [77] },
    { reset_password: 'ValidPassword1234', confirm_reset: true }]) {
    const db = database();
    const before = copy(db.data);
    const result = await api(db)('put', '/users/:id', profileBody(changes));
    assert.equal(result.code, 403, JSON.stringify(changes)); assert.deepEqual(db.data, before);
  }
});

test('additional roles can be added and removed without changing ownership or account status', async () => {
  const db = database(); const run = api(db);
  const added = await run('put', '/users/:id', profileBody({ role_ids: [100, 101, 102] }));
  assert.equal(added.code, 200); assert.equal(added.body.user.is_owner, true);
  assert.deepEqual(db.data.users[1].role_ids, [100, 101, 102]);
  const removed = await run('put', '/users/:id', profileBody({ role_ids: [100] }));
  assert.equal(removed.code, 200); assert.equal(removed.body.user.is_owner, true);
  assert.deepEqual(db.data.users[1].role_ids, [100]);
  assert.equal(db.data.users[1].employee_status, 'active');
  assert.equal(db.data.users[1].is_active, 1); assert.equal(db.data.users[1].auth_version, 0);
  const roleDeletes = db.calls.filter(({ sql }) => sql.startsWith('DELETE FROM user_roles'));
  assert.ok(roleDeletes.every(({ sql, values }) => sql.includes('role_id NOT IN') && values.slice(2).includes(100)));
  assert.ok(!db.calls.some(({ sql, values }) => sql.startsWith('INSERT INTO user_roles') && values[2] === 100));
  assert.equal((await run('put', '/users/:id/status', statusBody('blocked'))).code, 403);
});

test('an owner using manager role delegates only within its active RBAC grants and access rules', async () => {
  const db = database([employee(1, [100, 101]), employee(2, [100, 101])]); const run = api(db);
  const manager = actor(1, false);
  assert.equal((await run('put', '/users/:id', profileBody({ role_ids: [100, 101, 102] }), manager)).code, 200);
  assert.equal((await run('put', '/users/:id', profileBody({ role_ids: [100] }), manager)).code, 200);
  const before = copy(db.data);
  const denied = await run('put', '/users/:id', profileBody({ role_ids: [100, 103] }), manager);
  assert.equal(denied.code, 403); assert.equal(denied.body.error, 'ROLE_ESCALATION_FORBIDDEN');
  assert.deepEqual(db.data, before);
});

test('removing a stronger additional role is also subject to delegation limits', async () => {
  const db = database([employee(1, [100, 101]), employee(2, [100, 101, 103])]);
  const before = copy(db.data);
  const result = await api(db)('put', '/users/:id', profileBody(), actor(1, false));
  assert.equal(result.code, 403); assert.equal(result.body.error, 'ROLE_ESCALATION_FORBIDDEN');
  assert.deepEqual(db.data, before);
});

test('additional role changes require employee editing permission and cannot replace an assigned owner role', async () => {
  const db = database(); const run = api(db); const noPermission = actor();
  noPermission.permissions.delete('team.employees.update');
  assert.equal((await run('put', '/users/:id', profileBody({ role_ids: [100] }), noPermission)).code, 403);
  db.data.roles.push({ id: 104, tenant_id: 10, is_owner: 1, is_system: 1 });
  assert.equal((await run('put', '/users/:id', profileBody({ role_ids: [104, 101] }))).code, 403);
  assert.deepEqual(db.data.users[1].role_ids, [100, 101]);
});

test('legacy ownership remains protected after all additional roles are removed', async () => {
  const target = employee(2, [101]); target.role = 'owner';
  const db = database([employee(1), target]); const run = api(db);
  const result = await run('put', '/users/:id', profileBody({ role_ids: [] }));
  assert.equal(result.code, 200); assert.equal(result.body.user.is_owner, true);
  assert.deepEqual(db.data.users[1].role_ids, []); assert.equal(db.data.users[1].role, 'owner');
  assert.equal((await run('put', '/users/:id/status', statusBody('archived'))).code, 403);
});

test('alternate password reset endpoint also forbids changing another owner password', async () => {
  for (const legacy of [false, true]) {
    const target = employee(2, legacy ? [101] : [100]);
    if (legacy) target.role = 'owner';
    const db = database([employee(1), target]);
    const result = await api(db)('post', '/users/:id/reset-password', { temporary_password: 'ValidPassword1234', confirm_reset: true });
    assert.equal(result.code, 403); assert.equal(result.body.error, 'OWNER_ACCESS_CHANGE_FORBIDDEN');
    assert.ok(!db.calls.some(({ sql }) => sql.startsWith('UPDATE app_users')));
  }
});

test('creating owners remains permitted and active manager role cannot borrow owner powers', async () => {
  const body = { first_name: 'Пётр', last_name: 'Петров', login: 'petrov', temporary_password: 'ValidPassword1234', role_ids: [100], store_ids: [] };
  const db = database(); const run = api(db);
  const created = await run('post', '/users', body);
  assert.equal(created.code, 201); assert.equal(created.body.user.is_owner, true);
  const manager = actor(1, false); manager.assignedRoles = [100, 101];
  const denied = await run('post', '/users', { ...body, login: 'different' }, manager);
  assert.equal(denied.code, 403); assert.equal(denied.body.error, 'OWNER_ROLE_FORBIDDEN');
});

test('ordinary employees remain manageable with permission and permission denial is respected', async () => {
  const db = database([employee(1), employee(2, [101])]); const run = api(db);
  assert.equal((await run('put', '/users/:id/status', statusBody('blocked'), actor(1, false))).code, 200);
  assert.equal(db.data.users[1].employee_status, 'blocked'); assert.equal(db.data.users[1].auth_version, 1);
  const noPermission = actor(); noPermission.permissions.clear();
  assert.equal((await run('put', '/users/:id/status', statusBody('active', 'blocked'), noPermission)).code, 403);
});

test('owner profile can be edited, self password can be changed, self owner role cannot be removed', async () => {
  const db = database(); const run = api(db);
  const self = actor(2, false);
  assert.equal((await run('put', '/users/:id', profileBody(), self)).code, 200);
  assert.equal(db.data.users[1].last_name, 'Петров'); assert.deepEqual(db.data.users[1].role_ids, [100, 101]);
  assert.equal((await run('post', '/users/:id/reset-password', { temporary_password: 'ValidPassword1234', confirm_reset: true }, self)).code, 200);
  assert.equal((await run('put', '/users/:id', profileBody({ role_ids: [101] }), actor(2))).code, 403);
  assert.equal((await run('put', '/users/:id/status', statusBody('blocked'), actor(2))).code, 403);
});

test('employee API returns actual ownership across all assignments, including legacy owner flag', async () => {
  for (const legacy of [false, true]) {
    const target = employee(2, legacy ? [101] : [100, 101]);
    if (legacy) target.role = 'owner';
    const result = await api(database([employee(1), target]))('get', '/users/:id');
    assert.equal(result.code, 200); assert.equal(result.body.user.is_owner, true);
  }
});

test('another owner can edit ordinary profile fields while keeping protected assignments', async () => {
  const db = database();
  assert.equal((await api(db)('put', '/users/:id', profileBody())).code, 200);
  assert.equal(db.data.users[1].last_name, 'Петров'); assert.deepEqual(db.data.users[1].role_ids, [100, 101]);
  assert.ok(!db.calls.some(({ sql }) => sql.startsWith('DELETE FROM user_roles')));
});

test('tenant isolation and stale expected status prevent mutations', async () => {
  const foreign = employee(2); foreign.tenant_id = 20;
  const db = database([employee(1), foreign]); const before = copy(db.data);
  assert.equal((await api(db)('put', '/users/:id/status', statusBody('blocked'))).code, 404);
  assert.deepEqual(db.data, before);
  const ordinaryDb = database([employee(1), employee(2, [101])]);
  assert.equal((await api(ordinaryDb)('put', '/users/:id/status', statusBody('blocked', 'archived'))).code, 409);
});

test('sequential and parallel owner removal/status requests cannot revoke owner access', async () => {
  const db = database(); const run = api(db); const before = copy(db.data);
  const results = await Promise.all([
    run('put', '/users/:id', profileBody({ role_ids: [101] })),
    run('put', '/users/:id/status', statusBody('blocked')),
    run('post', '/users/:id/reset-password', { temporary_password: 'ValidPassword1234', confirm_reset: true }),
  ]);
  results.forEach((result) => assert.equal(result.code, 403)); assert.deepEqual(db.data, before);
  assert.equal((await run('put', '/users/:id/status', statusBody('archived'))).code, 403);
});

test('a concurrent promotion is visible to the status request waiting for the tenant lock', async () => {
  const db = database([employee(1), employee(2, [101])]); const run = api(db);
  const [promotion, block] = await Promise.all([
    run('put', '/users/:id', profileBody()),
    run('put', '/users/:id/status', statusBody('blocked')),
  ]);
  assert.equal(promotion.code, 200); assert.equal(promotion.body.user.is_owner, true);
  assert.equal(block.code, 403); assert.equal(block.body.error, 'OWNER_STATUS_CHANGE_FORBIDDEN');
  assert.equal(db.data.users[1].employee_status, 'active');
});

test('owner role permissions cannot be reduced and owner role cannot be deleted', async () => {
  const db = database(); const run = api(db);
  assert.equal((await run('put', '/roles/:id', { name: 'Owner', start_route: '/dashboard/orders', permissions: [] }, actor(), 100)).code, 409);
  assert.deepEqual(db.data.rolePermissions, [1, 2]);
  assert.equal((await run('delete', '/roles/:id', {}, actor(), 100)).code, 409);
});

test('suffix changes roll back if another protected owner login would change', async () => {
  const db = database(); const before = copy(db.data);
  await assert.rejects(identity.changeLoginSuffix(db, 10, 'new-company', 'company', true, actor()), { code: 'OWNER_ACCESS_CHANGE_FORBIDDEN' });
  assert.deepEqual(db.data, before);
  const ownDb = database([employee(1), employee(2, [101])]);
  assert.equal(await identity.changeLoginSuffix(ownDb, 10, 'new-company', 'company', true, actor()), 'new-company');
  assert.equal(ownDb.data.users[1].login, 'employee2@new-company');
});

test('legacy tenant identity matches its own account only, not other owners', () => {
  const legacy = { tenantId: 10, fullAccess: true, sessionUserId: 1, email: 'owner@example.org' };
  assert.equal(identity.isOwnAccount(legacy, { id: 1, tenant_id: 10, email: legacy.email }), true);
  assert.equal(identity.isOwnAccount(legacy, { id: 2, tenant_id: 10, email: legacy.email }), false);
  assert.equal(identity.isOwnAccount(legacy, { id: 1, tenant_id: 20, email: legacy.email }), false);
  assert.equal(identity.isOwnTenantCredential(legacy, 10, legacy.email), true);
  assert.equal(identity.isOwnTenantCredential({ ...legacy, email: 'different@example.org' }, 10, legacy.email), false);
});

test('legacy tenant credentials can be changed only by their actual owner and ambiguous email is rejected', async () => {
  const first = employee(1); first.email = 'owner@example.org';
  const db = database([first, employee(2)]);
  const own = { ...actor(), email: first.email };
  assert.equal(await identity.canChangeTenantCredential(db, own, 10, first.email), true);
  assert.equal(await identity.canChangeTenantCredential(db, { ...own, userId: 2 }, 10, first.email), false);
  db.data.users[1].email = first.email;
  assert.equal(await identity.canChangeTenantCredential(db, own, 10, first.email), false);
  const legacy = { tenantId: 10, fullAccess: true, email: 'legacy@example.org' };
  assert.equal(await identity.canChangeTenantCredential(db, legacy, 10, legacy.email), true);
  assert.equal(await identity.canChangeTenantCredential(db, actor(2), 10, legacy.email), false);
});
