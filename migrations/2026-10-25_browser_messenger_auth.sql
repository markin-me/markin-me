-- Additive: browser-bound requests reuse existing identities, customers and sessions.
CREATE TABLE IF NOT EXISTS auth_browser_requests (
  public_id CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  token_hash BINARY(32) NOT NULL UNIQUE,
  browser_hash BINARY(32) NOT NULL,
  ip_hash BINARY(32) NOT NULL,
  tenant_id INT NOT NULL,
  account_type ENUM('customer','employee') NOT NULL,
  provider ENUM('tg','max') NOT NULL,
  purpose ENUM('login','password_reset') NOT NULL DEFAULT 'login',
  state ENUM('pending','started','confirmed','consumed','cancelled') NOT NULL DEFAULT 'pending',
  provider_user_id VARCHAR(128) NULL,
  account_id INT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_browser_rate (ip_hash,created_at),
  KEY idx_browser_scope (tenant_id,account_type,provider,expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
