ALTER TABLE `ten_tenants`
  ADD COLUMN `chat_guest_thread_ttl_days` smallint unsigned DEFAULT NULL COMMENT 'Guest chat TTL in days';

