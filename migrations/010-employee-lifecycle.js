'use strict';

// Additive and idempotent. Run only before deploying the lifecycle-aware code.
module.exports = async function migrateEmployeeLifecycle(db) {
  for (const [name, definition] of [
    ['employee_status', "ENUM('active','blocked','archived') NOT NULL DEFAULT 'active'"],
    ['auth_version', 'INT UNSIGNED NOT NULL DEFAULT 0'],
  ]) {
    const [columns] = await db.query('SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?', ['app_users', name]);
    if (!columns.length) await db.query(`ALTER TABLE app_users ADD COLUMN \`${name}\` ${definition}`);
  }
  await db.query("UPDATE app_users SET employee_status='blocked' WHERE employee_status='active' AND is_active=0");
  await db.query("UPDATE app_users SET is_active=0 WHERE employee_status IN ('blocked','archived') AND is_active<>0");
  const [indexes] = await db.query('SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?', ['app_users', 'idx_app_users_employee_status']);
  if (!indexes.length) await db.query('ALTER TABLE app_users ADD INDEX idx_app_users_employee_status (tenant_id, employee_status, id)');
};
