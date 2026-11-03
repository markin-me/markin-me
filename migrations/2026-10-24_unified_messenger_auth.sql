CREATE TABLE IF NOT EXISTS `auth_people` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_messenger_channels` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `person_id` BIGINT UNSIGNED NOT NULL,
  `provider` ENUM('max','tg') NOT NULL,
  `provider_user_id` VARCHAR(128) NOT NULL,
  `verified_at` DATETIME NOT NULL,
  `revoked_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_messenger_provider_user` (`provider`,`provider_user_id`),
  KEY `idx_auth_messenger_person` (`person_id`,`provider`,`revoked_at`),
  CONSTRAINT `fk_auth_messenger_person`
    FOREIGN KEY (`person_id`) REFERENCES `auth_people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_account_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `person_id` BIGINT UNSIGNED NOT NULL,
  `tenant_id` INT NOT NULL,
  `account_type` ENUM('customer','employee') NOT NULL,
  `account_id` INT NOT NULL,
  `linked_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_account_scope` (`tenant_id`,`account_type`,`account_id`),
  KEY `idx_auth_account_person` (`person_id`,`tenant_id`,`account_type`),
  CONSTRAINT `fk_auth_account_person`
    FOREIGN KEY (`person_id`) REFERENCES `auth_people` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_account_messenger_links` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_link_id` BIGINT UNSIGNED NOT NULL,
  `channel_id` BIGINT UNSIGNED NOT NULL,
  `provider` ENUM('max','tg') NOT NULL,
  `verified_at` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_account_provider` (`account_link_id`,`provider`),
  UNIQUE KEY `uq_auth_account_channel` (`account_link_id`,`channel_id`),
  KEY `idx_auth_account_channel` (`channel_id`,`account_link_id`),
  CONSTRAINT `fk_auth_account_messenger_account`
    FOREIGN KEY (`account_link_id`) REFERENCES `auth_account_links` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_auth_account_messenger_channel`
    FOREIGN KEY (`channel_id`) REFERENCES `auth_messenger_channels` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_verification_challenges` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `tenant_id` INT NOT NULL,
  `account_type` ENUM('customer','employee') NOT NULL,
  `account_id` INT NOT NULL,
  `purpose` ENUM('link','login','password_reset','phone_verify') NOT NULL,
  `provider` ENUM('max','tg') NOT NULL,
  `channel_id` BIGINT UNSIGNED NULL,
  `token_hash` BINARY(32) NULL,
  `code_hash` BINARY(32) NULL,
  `code_salt` BINARY(16) NULL,
  `attempts` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 5,
  `delivery_status` ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
  `requested_ip_hash` BINARY(32) NULL,
  `completed_provider_user_id` VARCHAR(128) NULL,
  `expires_at` DATETIME NOT NULL,
  `resend_after` DATETIME NULL,
  `consumed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_challenge_public_id` (`public_id`),
  UNIQUE KEY `uq_auth_challenge_token_hash` (`token_hash`),
  KEY `idx_auth_challenge_scope` (`tenant_id`,`account_type`,`account_id`,`purpose`,`created_at`),
  KEY `idx_auth_challenge_ip` (`requested_ip_hash`,`created_at`),
  KEY `idx_auth_challenge_expiry` (`expires_at`,`consumed_at`),
  CONSTRAINT `fk_auth_challenge_channel`
    FOREIGN KEY (`channel_id`) REFERENCES `auth_messenger_channels` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_webhook_events` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `provider` ENUM('max','tg') NOT NULL,
  `event_key` VARCHAR(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `status` ENUM('processing','done') NOT NULL DEFAULT 'processing',
  `received_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `processed_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_webhook_event` (`provider`,`event_key`),
  KEY `idx_auth_webhook_received` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
