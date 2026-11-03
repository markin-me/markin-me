'use strict';

// Explicit invocation only. Creates a test-DB backup before any DDL.
module.exports = async function migrateMessengerServiceCleanup(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('MESSENGER_CLEANUP_DB_SCOPE_REFUSED');

  const fs = require('fs');
  const path = require('path');
  const mysql = require('mysql2');
  const tables = ['auth_verification_challenges', 'auth_browser_requests'];
  const statements = ['-- Snapshot before messenger service cleanup migration', 'USE `a1186497_test`;'];
  const counts = {};
  const conn = await db.getConnection();
  try {
    await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for (const table of tables) {
      const [[ddl]] = await conn.query(`SHOW CREATE TABLE \`${table}\``);
      statements.push(`${ddl['Create Table']};`);
      const [rows] = await conn.query({ sql: `SELECT * FROM \`${table}\``, dateStrings: true });
      counts[table] = rows.length;
      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map(key => mysql.escape(row[key] && typeof row[key] === 'object' && !Buffer.isBuffer(row[key]) ? JSON.stringify(row[key]) : row[key]));
        statements.push(`INSERT INTO \`${table}\` (${columns.map(key => mysql.escapeId(key)).join(',')}) VALUES (${values.join(',')});`);
      }
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const directory = path.resolve(__dirname, '../tmp/backups');
  fs.mkdirSync(directory, { recursive: true });
  const backup = path.join(directory, `a1186497_test_messenger_cleanup_${Date.now()}.sql`);
  fs.writeFileSync(backup, `${statements.join('\n')}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  if (!fs.statSync(backup).size) throw new Error('MESSENGER_CLEANUP_BACKUP_FAILED');

  await db.query(`CREATE TABLE IF NOT EXISTS auth_service_operations (
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tenant_id INT NOT NULL,
    provider ENUM('tg','max') NOT NULL,
    source_type ENUM('challenge','browser','interaction') NOT NULL,
    source_public_id CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    operation_kind ENUM('otp','link','browser','interaction') NOT NULL,
    status ENUM('pending','success','error','cancelled','expired') NOT NULL DEFAULT 'pending',
    expires_at DATETIME(6) NOT NULL,
    completed_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (operation_id),
    UNIQUE KEY uq_auth_service_operation_source (source_type,source_public_id),
    KEY idx_auth_service_operation_expiry (status,expires_at),
    KEY idx_auth_service_operation_tenant (tenant_id,provider,created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await db.query(`CREATE TABLE IF NOT EXISTS auth_service_messages (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    operation_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    tenant_id INT NOT NULL,
    provider ENUM('tg','max') NOT NULL,
    chat_id VARCHAR(128) NOT NULL,
    message_id VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    message_type ENUM('service','marketing') NOT NULL,
    sent_at DATETIME(6) NOT NULL,
    delete_after DATETIME(6) NOT NULL,
    available_at DATETIME(6) NOT NULL,
    status ENUM('pending','processing','deleted','failed') NOT NULL DEFAULT 'pending',
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(6) NULL,
    last_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
    deleted_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_service_message (tenant_id,provider,chat_id,message_id),
    KEY idx_auth_service_message_queue (status,available_at,id),
    KEY idx_auth_service_message_operation (operation_id,status),
    CONSTRAINT fk_auth_service_message_operation FOREIGN KEY (operation_id)
      REFERENCES auth_service_operations (operation_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  return { backup, counts };
};
