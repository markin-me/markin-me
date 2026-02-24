ALTER TABLE `ten_tenants`
  ADD COLUMN `max_login_enabled` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Enable customer login via MAX';

