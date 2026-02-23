ALTER TABLE `ten_tenants`
  ADD COLUMN `max_bot_token` varchar(255) DEFAULT NULL COMMENT 'MAX bot token for tenant authorization';
