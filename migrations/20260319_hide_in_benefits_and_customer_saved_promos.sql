SET @db_name := DATABASE();

SET @add_hide_in_benefits_sql := IF(
  EXISTS (
    SELECT 1
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = @db_name
       AND TABLE_NAME = 'mkt_discounts'
       AND COLUMN_NAME = 'hide_in_benefits'
  ),
  'SELECT 1',
  'ALTER TABLE `mkt_discounts` ADD COLUMN `hide_in_benefits` TINYINT(1) NOT NULL DEFAULT 0 AFTER `is_active`'
);
PREPARE stmt_add_hide_in_benefits FROM @add_hide_in_benefits_sql;
EXECUTE stmt_add_hide_in_benefits;
DEALLOCATE PREPARE stmt_add_hide_in_benefits;

CREATE TABLE IF NOT EXISTS `mkt_customer_benefit_promos` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int NOT NULL,
  `promo_code_id` int UNSIGNED NOT NULL,
  `discount_id` int UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_customer_benefit_promos_customer_promo` (`tenant_id`,`store_id`,`customer_id`,`promo_code_id`),
  KEY `idx_mkt_customer_benefit_promos_customer` (`tenant_id`,`store_id`,`customer_id`),
  KEY `idx_mkt_customer_benefit_promos_promo` (`tenant_id`,`promo_code_id`),
  KEY `idx_mkt_customer_benefit_promos_discount` (`tenant_id`,`discount_id`),
  CONSTRAINT `fk_mkt_customer_benefit_promos_promo`
    FOREIGN KEY (`promo_code_id`) REFERENCES `mkt_discount_promo_codes` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mkt_customer_benefit_promos_discount`
    FOREIGN KEY (`discount_id`) REFERENCES `mkt_discounts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
