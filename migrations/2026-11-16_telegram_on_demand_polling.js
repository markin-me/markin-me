'use strict';

// Explicit, additive, repeatable test migration. No tokens or user data are copied.
module.exports = async function migrateTelegramOnDemandPolling(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('TELEGRAM_POLLING_DB_SCOPE_REFUSED');
  // Fail before DDL if prerequisite cleanup/browser migrations are absent.
  for (const table of ['auth_browser_requests', 'auth_verification_challenges', 'auth_service_operations', 'auth_service_messages']) {
    await db.query(`SELECT 1 FROM ${table} LIMIT 0`);
  }
  await db.query(`CREATE TABLE IF NOT EXISTS auth_telegram_polling (
    bot_key BINARY(32) NOT NULL,
    next_offset BIGINT UNSIGNED NOT NULL DEFAULT 0,
    owner CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
    lease_until DATETIME(6) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (bot_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const [columns] = await db.query('SHOW COLUMNS FROM auth_service_messages');
  for (const [name, definition] of [
    ['has_reply_keyboard', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['has_inline_keyboard', 'TINYINT UNSIGNED NOT NULL DEFAULT 0'],
    ['controls_cleared_at', 'DATETIME(6) NULL'],
    ['cleanup_message_id', 'BIGINT UNSIGNED NULL'],
  ]) {
    if (!columns.some(c => c.Field === name)) await db.query(`ALTER TABLE auth_service_messages ADD COLUMN ${name} ${definition}`);
  }
  for (const [table, name, fields] of [
    ['auth_browser_requests', 'idx_auth_browser_polling', 'provider,state,expires_at,tenant_id'],
    ['auth_verification_challenges', 'idx_auth_challenge_polling', 'provider,purpose,delivery_status,consumed_at,expires_at,tenant_id'],
  ]) {
    const [indexes] = await db.query(`SHOW INDEX FROM ${table} WHERE Key_name=?`, [name]);
    if (!indexes.length) await db.query(`ALTER TABLE ${table} ADD INDEX ${name} (${fields})`);
  }
};
