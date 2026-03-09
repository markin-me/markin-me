ALTER TABLE `mkt_discounts`
  ADD COLUMN `activation_mode` enum('auto','promo_code') NOT NULL DEFAULT 'auto' AFTER `is_active`;

ALTER TABLE `mkt_discounts`
  ADD COLUMN `reward_type` enum('discount','bonus','gift','product_discount','mixed') NOT NULL DEFAULT 'discount' AFTER `activation_mode`;

ALTER TABLE `mkt_discounts`
  ADD COLUMN `promo_code_mode` enum('shared','unique') DEFAULT NULL AFTER `reward_type`;

ALTER TABLE `mkt_discounts`
  ADD COLUMN `unique_code_usage_limit` int UNSIGNED DEFAULT NULL AFTER `promo_code_mode`;

ALTER TABLE `mkt_discounts`
  ADD COLUMN `mechanic_type` enum('simple_discount','buy_x_get_y','threshold') NOT NULL DEFAULT 'simple_discount' AFTER `unique_code_usage_limit`;

ALTER TABLE `mkt_discounts`
  ADD COLUMN `mechanic_config_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `mechanic_type`;

CREATE TABLE IF NOT EXISTS `mkt_discount_promo_codes` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `discount_id` int UNSIGNED NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code_mode` enum('shared','unique') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'unique',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `usage_limit` int UNSIGNED DEFAULT NULL,
  `usage_count` int UNSIGNED NOT NULL DEFAULT '0',
  `assigned_customer_id` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_discount_promo_codes_code` (`tenant_id`,`store_id`,`code`),
  KEY `idx_mkt_discount_promo_codes_discount` (`tenant_id`,`discount_id`),
  KEY `idx_mkt_discount_promo_codes_mode` (`tenant_id`,`store_id`,`code_mode`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `mkt_discount_usage`
  ADD COLUMN `promo_code_id` int UNSIGNED DEFAULT NULL AFTER `discount_id`;
