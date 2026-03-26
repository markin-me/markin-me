ALTER TABLE `order_orders`
  ADD COLUMN `benefits_meta_json` LONGTEXT NULL AFTER `discounts_json`;

CREATE TABLE IF NOT EXISTS `mkt_discount_order_accruals` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` INT UNSIGNED NOT NULL,
  `store_id` INT UNSIGNED NOT NULL DEFAULT '0',
  `order_id` INT UNSIGNED NOT NULL,
  `customer_id` INT UNSIGNED NOT NULL DEFAULT '0',
  `discount_id` INT UNSIGNED NOT NULL,
  `status_id` INT UNSIGNED NOT NULL DEFAULT '0',
  `increment_value` DECIMAL(12,2) NOT NULL DEFAULT '0.00',
  `details_json` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_discount_order_accruals_order_discount` (`tenant_id`, `order_id`, `discount_id`),
  KEY `idx_mkt_discount_order_accruals_customer` (`tenant_id`, `customer_id`),
  KEY `idx_mkt_discount_order_accruals_discount` (`tenant_id`, `discount_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
