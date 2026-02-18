CREATE TABLE IF NOT EXISTS `chat_threads` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `meta_name` VARCHAR(160) NOT NULL DEFAULT '',
  `meta_phone` VARCHAR(60) NOT NULL DEFAULT '',
  `meta_last_welcome_day` VARCHAR(10) NOT NULL DEFAULT '',
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_chat_threads_tenant_client` (`tenant_id`, `client_id`),
  KEY `idx_chat_threads_tenant_updated` (`tenant_id`, `updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `client_id` BIGINT UNSIGNED NOT NULL,
  `message_id` VARCHAR(120) NOT NULL,
  `direction` ENUM('in','out') NOT NULL,
  `text` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL,
  `edited_at` DATETIME(3) NULL DEFAULT NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `is_pinned` TINYINT(1) NOT NULL DEFAULT 0,
  `reaction_legacy` VARCHAR(20) NOT NULL DEFAULT '',
  `reaction_in` VARCHAR(20) NOT NULL DEFAULT '',
  `reaction_out` VARCHAR(20) NOT NULL DEFAULT '',
  `reply_to_json` TEXT NULL DEFAULT NULL,
  `attachment_json` LONGTEXT NULL DEFAULT NULL,
  `delivery_status` VARCHAR(16) NOT NULL DEFAULT '',
  `delivered_at` DATETIME(3) NULL DEFAULT NULL,
  `read_at` DATETIME(3) NULL DEFAULT NULL,
  `created_row_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_row_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_chat_messages_tenant_client_message` (`tenant_id`, `client_id`, `message_id`),
  KEY `idx_chat_messages_tenant_client_created` (`tenant_id`, `client_id`, `created_at`, `id`),
  KEY `idx_chat_messages_tenant_client_unread` (`tenant_id`, `client_id`, `direction`, `is_read`),
  CONSTRAINT `fk_chat_messages_thread` FOREIGN KEY (`tenant_id`, `client_id`)
    REFERENCES `chat_threads` (`tenant_id`, `client_id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
