'use strict';

// Explicitly invoked for the test database only; never part of automatic startup.
module.exports = async function migrateGuestProfileConfirmation(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('GUEST_CONFIRMATION_DB_SCOPE_REFUSED');
  const fs = require('fs');
  const path = require('path');
  const mysql = require('mysql2');
  const tables = ['cust_guest_sessions', 'auth_browser_requests', 'order_orders',
    'cust_customers', 'cust_customer_addresses', 'cust_customer_sessions',
    'cust_customer_auth_identities', 'auth_people', 'auth_messenger_channels',
    'auth_account_links', 'auth_account_messenger_links'];
  const directory = path.resolve(__dirname, '../tmp/backups');
  fs.mkdirSync(directory, { recursive: true });
  const backup = path.join(directory, `a1186497_test_guest_confirmation_${Date.now()}.sql`);
  const conn = await db.getConnection();
  const statements = ['-- Test DB snapshot before guest profile confirmation migration',
    'USE `a1186497_test`;', 'SET FOREIGN_KEY_CHECKS=0;'];
  const counts = {};
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for (const table of tables) {
      const [[ddl]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      statements.push(`DROP TABLE IF EXISTS \`${table}\`;`, ddl['Create Table'] + ';');
      const [rows] = await conn.query({ sql: `SELECT * FROM \`${table}\``, dateStrings: true });
      counts[table] = rows.length;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(key => {
          const value = row[key];
          return mysql.escape(value && typeof value === 'object' && !Buffer.isBuffer(value)
            ? JSON.stringify(value) : value);
        });
        statements.push(`INSERT INTO \`${table}\` (${columns.map(key => mysql.escapeId(key)).join(',')}) VALUES (${values.join(',')});`);
      }
    }
    await conn.commit();
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
  statements.push('SET FOREIGN_KEY_CHECKS=1;');
  fs.writeFileSync(backup, statements.join('\n') + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (!fs.statSync(backup).size) throw new Error('GUEST_CONFIRMATION_BACKUP_FAILED');

  for (const table of ['order_orders', 'auth_browser_requests']) {
    const [columns] = await db.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'guest_session_hash'`);
    if (!columns.length) await db.query(`ALTER TABLE \`${table}\` ADD COLUMN guest_session_hash BINARY(32) NULL`);
    else if (columns[0].Type !== 'binary(32)' || columns[0].Null !== 'YES') throw new Error('GUEST_HASH_SCHEMA_INCOMPATIBLE');
    const [keys] = await db.query(`SHOW INDEX FROM \`${table}\` WHERE Key_name='idx_guest_session'`);
    if (!keys.length) await db.query(`ALTER TABLE \`${table}\` ADD INDEX idx_guest_session (tenant_id,guest_session_hash)`);
    const [foreignKeys] = await db.query(`SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=?`, [table, `fk_${table}_guest_session`]);
    if (!foreignKeys.length) await db.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT fk_${table}_guest_session
      FOREIGN KEY (tenant_id,guest_session_hash) REFERENCES cust_guest_sessions (tenant_id,token_hash) ON DELETE RESTRICT ON UPDATE RESTRICT`);
  }
  const [[purpose]] = await db.query("SHOW COLUMNS FROM auth_browser_requests LIKE 'purpose'");
  if (purpose.Type === "enum('login','password_reset')") {
    await db.query("ALTER TABLE auth_browser_requests MODIFY purpose ENUM('login','password_reset','profile_link') NOT NULL DEFAULT 'login'");
  } else if (purpose.Type !== "enum('login','password_reset','profile_link')") throw new Error('AUTH_PURPOSE_SCHEMA_INCOMPATIBLE');
  return { backup, counts };
};
