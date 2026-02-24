CREATE TABLE IF NOT EXISTS `cust_customer_tg_link_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `link_token` varchar(96) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_tg_user_id` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_tg_token` (`link_token`),
  KEY `idx_cust_tg_token_lookup` (`tenant_id`,`customer_id`,`expires_at`,`used_at`),
  CONSTRAINT `fk_cust_tg_token_customer` FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
