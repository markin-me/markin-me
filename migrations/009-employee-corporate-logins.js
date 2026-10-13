'use strict';

// Run through migrate.js. Additive, resumable DDL; no existing login/name is rewritten.
module.exports = async function migrateEmployeeCorporateLogins(db) {
  const { transliterate } = require('../api/helpers/employeeIdentity');
  async function column(table, name, definition) {
    const [rows] = await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', [table, name]);
    if (!rows.length) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${name}\` ${definition}`);
  }
  await column('ten_tenants', 'login_suffix', 'VARCHAR(48) CHARACTER SET ascii COLLATE ascii_general_ci NULL');
  await column('ten_tenants', 'corporate_logins_enabled', 'TINYINT(1) NOT NULL DEFAULT 0');
  for (const name of ['last_name', 'first_name', 'patronymic']) await column('app_users', name, 'VARCHAR(80) NULL');
  await column('app_users', 'login_local', 'VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NULL');
  await column('app_users', 'login_legacy', 'VARCHAR(128) NULL');
  await column('app_users', 'employee_photo', 'MEDIUMBLOB NULL');
  await column('app_users', 'photo_revision', 'CHAR(32) CHARACTER SET ascii NULL');
  const [[nameColumn]] = await db.query("SELECT CHARACTER_MAXIMUM_LENGTH AS size FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_users' AND COLUMN_NAME='name'");
  if (Number(nameColumn.size) < 300) await db.query('ALTER TABLE app_users MODIFY COLUMN name VARCHAR(300) NULL');
  const [[loginColumn]] = await db.query("SELECT CHARACTER_MAXIMUM_LENGTH AS size FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_users' AND COLUMN_NAME='login'");
  if (Number(loginColumn.size) < 128) await db.query('ALTER TABLE app_users MODIFY COLUMN login VARCHAR(128) NULL');
  async function uniqueIndex(table, name, columns) {
    const [rows] = await db.query('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?', [table, name]);
    if (!rows.length) await db.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${name}\` (${columns})`);
  }
  await uniqueIndex('ten_tenants', 'uq_tenants_login_suffix', 'login_suffix');
  await uniqueIndex('app_users', 'uq_app_users_tenant_login_local', 'tenant_id, login_local');
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tenants] = await conn.query('SELECT id, login_suffix FROM ten_tenants ORDER BY id FOR UPDATE');
    for (const tenant of tenants) {
      if (!tenant.login_suffix) {
        let candidate = `tenant-${tenant.id}`;
        for (let number = 1; ; number += 1) {
          const [taken] = await conn.query('SELECT id FROM ten_tenants WHERE login_suffix=? AND id<>?', [candidate, tenant.id]);
          if (!taken.length) break;
          candidate = `tenant-${tenant.id}-${number}`;
        }
        await conn.query('UPDATE ten_tenants SET login_suffix=? WHERE id=? AND login_suffix IS NULL', [candidate, tenant.id]);
      }
      const [users] = await conn.query(`SELECT u.id, u.login, u.email, u.role, u.login_local,
        EXISTS(SELECT 1 FROM user_roles ur JOIN tenant_roles r ON r.tenant_id=ur.tenant_id AND r.id=ur.role_id WHERE ur.tenant_id=u.tenant_id AND ur.user_id=u.id AND r.is_owner=1) AS is_owner
        FROM app_users u WHERE u.tenant_id=? ORDER BY u.id FOR UPDATE`, [tenant.id]);
      const used = new Set(users.filter(user => user.login_local).map(user => user.login_local.toLowerCase()));
      for (const user of users) {
        if (user.login_local || (!user.login && (user.role === 'owner' || Number(user.is_owner) === 1))) continue;
        await conn.query('UPDATE app_users SET login_legacy=login WHERE tenant_id=? AND id=? AND login_legacy IS NULL', [tenant.id, user.id]);
        const raw = String(user.login || user.email?.split('@')[0] || '').trim().toLowerCase();
        const base = (/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(raw) ? raw : transliterate(raw).slice(0, 58).replace(/-+$/g, '')) || `employee-${user.id}`;
        let local = base;
        for (let number = 2; used.has(local); number += 1) local = `${base.slice(0, 58)}${number}`;
        used.add(local);
        await conn.query('UPDATE app_users SET login_local=? WHERE tenant_id=? AND id=? AND login_local IS NULL', [local, tenant.id, user.id]);
      }
    }
    await conn.query("INSERT INTO system_permissions (permission_key, group_key, label, allowed_access_rules, sort_order) VALUES ('settings.company.login_suffix','settings','Смена суффикса логинов','all',1193) ON DUPLICATE KEY UPDATE label=VALUES(label)");
    await conn.query("INSERT IGNORE INTO role_permissions (tenant_id, role_id, permission_id, access_rule) SELECT r.tenant_id, r.id, p.id, 'all' FROM tenant_roles r JOIN system_permissions p ON p.permission_key='settings.company.login_suffix' WHERE r.is_owner=1");
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
};
