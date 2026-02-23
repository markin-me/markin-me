ALTER TABLE `ten_tenants`
  ADD COLUMN `max_bot_id` varchar(150) DEFAULT NULL COMMENT 'MAX bot username or id for deep links';
