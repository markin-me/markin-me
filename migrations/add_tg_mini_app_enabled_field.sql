ALTER TABLE `ten_tenants`
  ADD COLUMN `tg_mini_app_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Enable Telegram mini app link in bot auth message';
ALTER TABLE `ten_tenants`
  ADD COLUMN `tg_login_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Enable customer login via Telegram';
