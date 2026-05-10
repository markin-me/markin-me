CREATE TABLE IF NOT EXISTS `mkt_bonus_modal_settings` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `modal_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `description` text COLLATE utf8mb4_unicode_ci NULL,
  `image_url` varchar(500) COLLATE utf8mb4_unicode_ci NULL,
  `is_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_bonus_modal_settings_tenant_key` (`tenant_id`,`modal_key`),
  KEY `idx_mkt_bonus_modal_settings_tenant_sort` (`tenant_id`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_customer_bonus_modal_events` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `event_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `from_level_id` int UNSIGNED NULL,
  `to_level_id` int UNSIGNED NULL,
  `confirmed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mkt_customer_bonus_modal_events_customer` (`tenant_id`,`customer_id`,`confirmed_at`,`created_at`),
  KEY `idx_mkt_customer_bonus_modal_events_type` (`tenant_id`,`event_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
