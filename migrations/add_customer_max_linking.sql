CREATE TABLE IF NOT EXISTS `cust_customer_max_links` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `max_user_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `linked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_max_tenant_customer` (`tenant_id`,`customer_id`),
  UNIQUE KEY `uq_cust_max_tenant_user` (`tenant_id`,`max_user_id`),
  KEY `idx_cust_max_tenant_phone` (`tenant_id`,`phone`),
  CONSTRAINT `fk_cust_max_customer` FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cust_customer_max_link_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `link_token` varchar(96) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `used_max_user_id` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `used_phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_max_token` (`link_token`),
  KEY `idx_cust_max_token_lookup` (`tenant_id`,`customer_id`,`expires_at`,`used_at`),
  CONSTRAINT `fk_cust_max_token_customer` FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cust_customer_max_pending` (
  `id` int NOT NULL AUTO_INCREMENT,
  `max_user_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `link_token` varchar(96) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_max_pending_user` (`max_user_id`),
  KEY `idx_cust_max_pending_exp` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
