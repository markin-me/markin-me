ALTER TABLE `ten_tenants`
  ADD COLUMN `max_mini_app_enabled` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Enable MAX mini app link in bot auth message';
