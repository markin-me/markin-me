-- Additive only: old identities and authentication history are not changed.
-- A Telegram identity is not evidence that the user started this tenant's bot.
CREATE TABLE IF NOT EXISTS auth_telegram_bot_contacts (
  tenant_id BIGINT UNSIGNED NOT NULL,
  bot_key BINARY(32) NOT NULL,
  provider_user_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reachable TINYINT(1) NOT NULL DEFAULT 1,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id, bot_key, provider_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
