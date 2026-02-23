CREATE TABLE IF NOT EXISTS `cust_customer_max_login_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `login_token` varchar(80) COLLATE utf8mb4_general_ci NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_max_login_token` (`login_token`),
  KEY `idx_cust_max_login_tenant_customer` (`tenant_id`,`customer_id`),
  KEY `idx_cust_max_login_expires` (`expires_at`),
  CONSTRAINT `fk_cust_max_login_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
