CREATE TABLE IF NOT EXISTS `cust_customer_favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int NOT NULL,
  `item_signature` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `item_type` varchar(16) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'product',
  `product_id` bigint DEFAULT NULL,
  `combo_id` bigint DEFAULT NULL,
  `title` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `photo` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `item_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_customer_favorites_signature` (`tenant_id`,`store_id`,`customer_id`,`item_signature`),
  KEY `idx_cust_customer_favorites_customer` (`tenant_id`,`store_id`,`customer_id`,`updated_at`),
  CONSTRAINT `fk_cust_customer_favorites_customer`
    FOREIGN KEY (`tenant_id`, `customer_id`)
    REFERENCES `cust_customers` (`tenant_id`, `id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
