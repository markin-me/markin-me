CREATE TABLE IF NOT EXISTS `prod_product_passport_snapshots` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `store_id` INT NOT NULL,
  `product_id` BIGINT UNSIGNED NOT NULL,
  `passport_json` JSON DEFAULT NULL,
  `status` ENUM('ready','dirty','building','error') NOT NULL DEFAULT 'dirty',
  `schema_version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `source_revision` VARCHAR(64) DEFAULT NULL,
  `generated_at` TIMESTAMP NULL DEFAULT NULL,
  `last_error` VARCHAR(1000) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_prod_product_passport_snapshot` (`tenant_id`,`store_id`,`product_id`),
  KEY `idx_prod_product_passport_snapshot_queue` (`status`,`updated_at`),
  CONSTRAINT `fk_prod_product_passport_snapshot_product`
    FOREIGN KEY (`tenant_id`,`product_id`)
    REFERENCES `prod_products` (`tenant_id`,`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
