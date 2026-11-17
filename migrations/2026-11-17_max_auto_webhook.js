'use strict';

module.exports = async function migrateMaxAutoWebhook(db) {
  const [[scope]] = await db.query('SELECT DATABASE() name');
  if (scope.name !== 'a1186497_test') throw new Error('MAX_WEBHOOK_DB_SCOPE_REFUSED');
  await db.query(`CREATE TABLE IF NOT EXISTS auth_max_webhook_bots (
    bot_key BINARY(32) NOT NULL PRIMARY KEY,
    bot_id VARCHAR(32) NULL,
    username VARCHAR(128) NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'pending',
    webhook_url VARCHAR(512) NULL,
    secret_fingerprint BINARY(32) NULL,
    token_checked_at DATETIME(6) NULL,
    registered_at DATETIME(6) NULL,
    verified_at DATETIME(6) NULL,
    checked_at DATETIME(6) NULL,
    next_attempt_at DATETIME(6) NULL,
    attempts INT UNSIGNED NOT NULL DEFAULT 0,
    last_error_code VARCHAR(80) NULL,
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    KEY idx_max_webhook_due (status,next_attempt_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
};
