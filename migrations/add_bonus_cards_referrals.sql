CREATE TABLE IF NOT EXISTS `mkt_bonus_program_settings` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `bonus_program_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `referral_program_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `referral_registration_reward` decimal(12,2) NOT NULL DEFAULT '0.00',
  `referral_first_purchase_reward` decimal(12,2) NOT NULL DEFAULT '0.00',
  `allow_redeem_and_accrue` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_bonus_program_settings_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_bonus_levels` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `subtitle` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `access_type` enum('conditions','join','paid') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'conditions',
  `min_spent` decimal(12,2) NOT NULL DEFAULT '0.00',
  `min_orders` int UNSIGNED NOT NULL DEFAULT '0',
  `requirement_amount` decimal(12,2) DEFAULT NULL,
  `requirement_mode` enum('and','or') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'and',
  `requirement_orders` int UNSIGNED DEFAULT NULL,
  `requirement_referral_mode` enum('and','or') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'and',
  `requirement_referrals` int UNSIGNED DEFAULT NULL,
  `requirement_period_days` int UNSIGNED DEFAULT NULL,
  `retention_strategy` enum('match','custom') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'match',
  `retention_amount` decimal(12,2) DEFAULT NULL,
  `retention_mode` enum('and','or') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'and',
  `retention_orders` int UNSIGNED DEFAULT NULL,
  `retention_referral_mode` enum('and','or') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'and',
  `retention_referrals` int UNSIGNED DEFAULT NULL,
  `cashback_percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `redeem_percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `referral_bonus_percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `favorite_categories_bonus_percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `favorite_categories_limit` int UNSIGNED NOT NULL DEFAULT '0',
  `activation_delay_value` int UNSIGNED NOT NULL DEFAULT '0',
  `activation_delay_unit` enum('immediate','hours','days') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'immediate',
  `lifetime_value` int UNSIGNED NOT NULL DEFAULT '0',
  `lifetime_unit` enum('forever','hours','days','months') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'forever',
  `qr_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `show_title_on_card` tinyint(1) NOT NULL DEFAULT '1',
  `design_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `accent_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `main_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `base_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_background_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `title_background_color` varchar(7) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title_background_opacity` tinyint UNSIGNED NOT NULL DEFAULT '90',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_bonus_levels_tenant_code` (`tenant_id`,`code`),
  KEY `idx_mkt_bonus_levels_tenant_sort` (`tenant_id`,`sort_order`),
  KEY `idx_mkt_bonus_levels_tenant_active` (`tenant_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_bonus_level_tariffs` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `level_id` int UNSIGNED NOT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `discount_percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `period_value` int UNSIGNED NOT NULL DEFAULT '1',
  `period_unit` enum('days','months','forever') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'months',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mkt_bonus_level_tariffs_level` (`tenant_id`,`level_id`,`sort_order`),
  CONSTRAINT `fk_mkt_bonus_level_tariffs_level`
    FOREIGN KEY (`level_id`) REFERENCES `mkt_bonus_levels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_bonus_level_order_ranges` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `level_id` int UNSIGNED NOT NULL,
  `amount` decimal(12,2) NOT NULL DEFAULT '0.00',
  `percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mkt_bonus_level_order_ranges_level` (`tenant_id`,`level_id`,`amount`),
  CONSTRAINT `fk_mkt_bonus_level_order_ranges_level`
    FOREIGN KEY (`level_id`) REFERENCES `mkt_bonus_levels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_bonus_level_favorite_categories` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `level_id` int UNSIGNED NOT NULL,
  `category_id` bigint UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_bonus_level_favorite_categories_level_category` (`tenant_id`,`level_id`,`category_id`),
  KEY `idx_mkt_bonus_level_favorite_categories_category` (`tenant_id`,`category_id`),
  CONSTRAINT `fk_mkt_bonus_level_favorite_categories_level`
    FOREIGN KEY (`level_id`) REFERENCES `mkt_bonus_levels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_customer_bonus_accounts` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `level_id` int UNSIGNED DEFAULT NULL,
  `balance` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_accrued` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_redeemed` decimal(14,2) NOT NULL DEFAULT '0.00',
  `total_expired` decimal(14,2) NOT NULL DEFAULT '0.00',
  `status` enum('active','paused','blocked') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'active',
  `joined_at` datetime DEFAULT NULL,
  `level_assigned_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_customer_bonus_accounts_customer` (`tenant_id`,`customer_id`),
  KEY `idx_mkt_customer_bonus_accounts_level` (`tenant_id`,`level_id`),
  KEY `fk_mkt_customer_bonus_accounts_customer` (`customer_id`),
  CONSTRAINT `fk_mkt_customer_bonus_accounts_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mkt_customer_bonus_accounts_level`
    FOREIGN KEY (`level_id`) REFERENCES `mkt_bonus_levels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_customer_bonus_transactions` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `store_id` int DEFAULT NULL,
  `account_id` int UNSIGNED DEFAULT NULL,
  `customer_id` int NOT NULL,
  `level_id` int UNSIGNED DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `referral_id` int UNSIGNED DEFAULT NULL,
  `reward_id` int UNSIGNED DEFAULT NULL,
  `type` enum('join','level_up','accrual','redeem','expire','adjustment','referral_accrual','refund') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `balance_after` decimal(14,2) DEFAULT NULL,
  `available_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `reason` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details_json` longtext COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_mkt_customer_bonus_transactions_customer` (`tenant_id`,`customer_id`,`created_at`,`id`),
  KEY `idx_mkt_customer_bonus_transactions_order` (`tenant_id`,`order_id`),
  KEY `idx_mkt_customer_bonus_transactions_store` (`tenant_id`,`store_id`,`created_at`),
  KEY `idx_mkt_customer_bonus_transactions_available` (`tenant_id`,`customer_id`,`available_at`,`expires_at`),
  KEY `fk_mkt_customer_bonus_transactions_account` (`account_id`),
  KEY `fk_mkt_customer_bonus_transactions_level` (`level_id`),
  CONSTRAINT `fk_mkt_customer_bonus_transactions_account`
    FOREIGN KEY (`account_id`) REFERENCES `mkt_customer_bonus_accounts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_customer_bonus_transactions_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mkt_customer_bonus_transactions_level`
    FOREIGN KEY (`level_id`) REFERENCES `mkt_bonus_levels` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_customer_bonus_transactions_order`
    FOREIGN KEY (`order_id`) REFERENCES `order_orders` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_referral_levels` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `invited_count` int UNSIGNED NOT NULL DEFAULT '0',
  `percent` decimal(8,4) NOT NULL DEFAULT '0.0000',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_referral_levels_tenant_code` (`tenant_id`,`code`),
  KEY `idx_mkt_referral_levels_tenant_sort` (`tenant_id`,`sort_order`),
  KEY `idx_mkt_referral_levels_tenant_active` (`tenant_id`,`is_active`,`invited_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_customer_referral_codes` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `code` varchar(96) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_customer_referral_codes_tenant_customer` (`tenant_id`,`customer_id`),
  UNIQUE KEY `uq_mkt_customer_referral_codes_tenant_code` (`tenant_id`,`code`),
  KEY `fk_mkt_customer_referral_codes_customer` (`customer_id`),
  CONSTRAINT `fk_mkt_customer_referral_codes_customer`
    FOREIGN KEY (`customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_customer_referrals` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `store_id` int DEFAULT NULL,
  `inviter_customer_id` int DEFAULT NULL,
  `referral_customer_id` int NOT NULL,
  `referral_code_id` int UNSIGNED DEFAULT NULL,
  `status` enum('registered','first_purchase_paid','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'registered',
  `registered_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `first_purchase_order_id` int DEFAULT NULL,
  `first_purchase_paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_customer_referrals_referral` (`tenant_id`,`referral_customer_id`),
  KEY `idx_mkt_customer_referrals_inviter` (`tenant_id`,`inviter_customer_id`,`status`),
  KEY `idx_mkt_customer_referrals_store` (`tenant_id`,`store_id`,`registered_at`),
  KEY `fk_mkt_customer_referrals_inviter` (`inviter_customer_id`),
  KEY `fk_mkt_customer_referrals_code` (`referral_code_id`),
  KEY `fk_mkt_customer_referrals_order` (`first_purchase_order_id`),
  CONSTRAINT `fk_mkt_customer_referrals_code`
    FOREIGN KEY (`referral_code_id`) REFERENCES `mkt_customer_referral_codes` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_customer_referrals_inviter`
    FOREIGN KEY (`inviter_customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_customer_referrals_order`
    FOREIGN KEY (`first_purchase_order_id`) REFERENCES `order_orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_customer_referrals_referral`
    FOREIGN KEY (`referral_customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mkt_referral_rewards` (
  `id` int UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `store_id` int DEFAULT NULL,
  `referral_id` int UNSIGNED NOT NULL,
  `recipient_customer_id` int NOT NULL,
  `source_customer_id` int DEFAULT NULL,
  `order_id` int DEFAULT NULL,
  `bonus_transaction_id` bigint UNSIGNED DEFAULT NULL,
  `reward_type` enum('registration','first_purchase','level_percent') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(14,2) NOT NULL DEFAULT '0.00',
  `percent` decimal(8,4) DEFAULT NULL,
  `status` enum('pending','accrued','cancelled') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `accrued_at` datetime DEFAULT NULL,
  `cancelled_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mkt_referral_rewards_recipient` (`tenant_id`,`recipient_customer_id`,`status`),
  KEY `idx_mkt_referral_rewards_referral` (`tenant_id`,`referral_id`,`reward_type`),
  KEY `idx_mkt_referral_rewards_order` (`tenant_id`,`order_id`),
  KEY `idx_mkt_referral_rewards_store` (`tenant_id`,`store_id`,`created_at`),
  KEY `fk_mkt_referral_rewards_source_customer` (`source_customer_id`),
  KEY `fk_mkt_referral_rewards_transaction` (`bonus_transaction_id`),
  CONSTRAINT `fk_mkt_referral_rewards_order`
    FOREIGN KEY (`order_id`) REFERENCES `order_orders` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_referral_rewards_recipient_customer`
    FOREIGN KEY (`recipient_customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mkt_referral_rewards_referral`
    FOREIGN KEY (`referral_id`) REFERENCES `mkt_customer_referrals` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_mkt_referral_rewards_source_customer`
    FOREIGN KEY (`source_customer_id`) REFERENCES `cust_customers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_mkt_referral_rewards_transaction`
    FOREIGN KEY (`bonus_transaction_id`) REFERENCES `mkt_customer_bonus_transactions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
