ALTER TABLE `ten_delivery_settings`
  ADD COLUMN `eta_minutes` int unsigned DEFAULT NULL AFTER `name`;

CREATE TABLE `ten_delivery_setting_price_tiers` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `delivery_setting_id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `min_order_amount` decimal(10,2) NOT NULL DEFAULT '0.00',
  `delivery_cost` decimal(10,2) NOT NULL DEFAULT '0.00',
  `sort_order` int unsigned NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tenant_setting` (`tenant_id`,`delivery_setting_id`),
  KEY `idx_tenant_setting_sort` (`tenant_id`,`delivery_setting_id`,`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `ten_delivery_setting_price_tiers`
  (`delivery_setting_id`, `tenant_id`, `min_order_amount`, `delivery_cost`, `sort_order`)
SELECT
  `id`,
  `tenant_id`,
  COALESCE(`min_order_amount`, 0),
  COALESCE(`delivery_cost`, 0),
  0
FROM `ten_delivery_settings`;

INSERT INTO `ten_delivery_setting_price_tiers`
  (`delivery_setting_id`, `tenant_id`, `min_order_amount`, `delivery_cost`, `sort_order`)
SELECT
  `id`,
  `tenant_id`,
  `free_delivery_from`,
  0,
  1
FROM `ten_delivery_settings`
WHERE `free_delivery_from` IS NOT NULL;
