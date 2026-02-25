CREATE TABLE IF NOT EXISTS `chat_threads` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `client_id` bigint UNSIGNED NOT NULL,
  `meta_name` varchar(160) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `meta_phone` varchar(60) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `meta_last_welcome_day` varchar(10) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_chat_threads_tenant_client` (`tenant_id`,`client_id`),
  KEY `idx_chat_threads_tenant_updated` (`tenant_id`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `client_id` bigint UNSIGNED NOT NULL,
  `message_id` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `direction` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL,
  `text` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL,
  `edited_at` datetime(3) DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `is_pinned` tinyint(1) NOT NULL DEFAULT '0',
  `reaction_legacy` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reaction_in` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reaction_out` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `reply_to_json` text COLLATE utf8mb4_unicode_ci,
  `attachment_json` longtext COLLATE utf8mb4_unicode_ci,
  `delivery_status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `delivered_at` datetime(3) DEFAULT NULL,
  `read_at` datetime(3) DEFAULT NULL,
  `created_row_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_row_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_chat_messages_tenant_client_message` (`tenant_id`,`client_id`,`message_id`),
  KEY `idx_chat_messages_tenant_client_created` (`tenant_id`,`client_id`,`created_at`,`id`),
  KEY `idx_chat_messages_tenant_client_unread` (`tenant_id`,`client_id`,`direction`,`is_read`),
  CONSTRAINT `fk_chat_messages_thread` FOREIGN KEY (`tenant_id`,`client_id`) REFERENCES `chat_threads` (`tenant_id`,`client_id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_push_subscriptions` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `client_id` bigint UNSIGNED NOT NULL,
  `actor` enum('in','out') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'in',
  `endpoint_hash` char(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `endpoint` varchar(1024) COLLATE utf8mb4_unicode_ci NOT NULL,
  `p256dh` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `auth` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_agent` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ux_chat_push_subscriptions_tenant_actor_client_endpoint` (`tenant_id`,`actor`,`client_id`,`endpoint_hash`),
  KEY `idx_chat_push_subscriptions_thread` (`tenant_id`,`client_id`,`actor`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cust_customer_auth_identities` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int NOT NULL,
  `provider` enum('max','tg') COLLATE utf8mb4_general_ci NOT NULL,
  `provider_user_id` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `linked_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_identity_provider_user` (`tenant_id`,`provider`,`provider_user_id`),
  UNIQUE KEY `uq_auth_identity_customer_provider` (`tenant_id`,`customer_id`,`provider`),
  KEY `idx_auth_identity_customer` (`tenant_id`,`customer_id`),
  KEY `idx_auth_identity_provider` (`tenant_id`,`provider`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cust_customer_auth_tokens` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `customer_id` int DEFAULT NULL,
  `provider` enum('max','tg') COLLATE utf8mb4_general_ci NOT NULL,
  `purpose` enum('link','login','pending') COLLATE utf8mb4_general_ci NOT NULL,
  `token` varchar(128) COLLATE utf8mb4_general_ci NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `provider_user_id` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_auth_tokens_scope_token` (`tenant_id`,`provider`,`purpose`,`token`),
  KEY `idx_auth_tokens_lookup` (`tenant_id`,`provider`,`purpose`,`expires_at`,`used_at`),
  KEY `idx_auth_tokens_customer` (`tenant_id`,`customer_id`,`provider`,`purpose`),
  KEY `idx_auth_tokens_provider_user` (`tenant_id`,`provider`,`provider_user_id`,`purpose`,`expires_at`),
  KEY `idx_auth_tokens_token` (`token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `cust_customer_favorites` (
  `id` int NOT NULL AUTO_INCREMENT,
  `tenant_id` int NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int NOT NULL,
  `item_signature` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `item_type` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'product',
  `product_id` bigint DEFAULT NULL,
  `combo_id` bigint DEFAULT NULL,
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `photo` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `item_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_cust_customer_favorites_signature` (`tenant_id`,`store_id`,`customer_id`,`item_signature`),
  KEY `idx_cust_customer_favorites_customer` (`tenant_id`,`store_id`,`customer_id`,`updated_at`),
  KEY `fk_cust_customer_favorites_customer` (`tenant_id`,`customer_id`),
  CONSTRAINT `fk_cust_customer_favorites_customer` FOREIGN KEY (`tenant_id`,`customer_id`) REFERENCES `cust_customers` (`tenant_id`,`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `prod_stock_documents` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `type` enum('in','out','order') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'in = incoming, out = write-off, order = order write-off',
  `status` enum('draft','posted') CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft' COMMENT 'draft = draft, posted = posted',
  `number` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `comment` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
  `posted_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_docs_tenant_type_status` (`tenant_id`,`type`,`status`),
  KEY `idx_stock_docs_tenant_created` (`tenant_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stock movement documents';

CREATE TABLE IF NOT EXISTS `prod_stock_document_items` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `document_id` bigint UNSIGNED NOT NULL,
  `product_id` bigint UNSIGNED NOT NULL,
  `qty` decimal(12,3) NOT NULL,
  `unit_id` bigint UNSIGNED DEFAULT NULL,
  `cost_price` decimal(14,6) DEFAULT NULL,
  `price` decimal(14,6) DEFAULT NULL,
  `purchase_price` decimal(14,6) DEFAULT NULL,
  `purchase_total` decimal(14,6) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_stock_items_document` (`document_id`),
  KEY `idx_stock_items_product` (`product_id`),
  CONSTRAINT `fk_stock_items_document` FOREIGN KEY (`document_id`) REFERENCES `prod_stock_documents` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stock_items_product` FOREIGN KEY (`product_id`) REFERENCES `prod_products` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Stock movement document items';

ALTER TABLE `cust_customer_sessions`
  MODIFY COLUMN `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  MODIFY COLUMN `token` varchar(96) COLLATE utf8mb4_general_ci NOT NULL;

ALTER TABLE `cust_customer_sessions`
  ADD COLUMN `user_agent` varchar(500) COLLATE utf8mb4_general_ci DEFAULT NULL,
  ADD COLUMN `ip_address` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  ADD COLUMN `revoked_at` datetime DEFAULT NULL;

ALTER TABLE `cust_customers`
  ADD COLUMN `max_user_id` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'MAX user id linked by phone',
  ADD COLUMN `phone_verify_code` varchar(4) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '4-digit phone verification code',
  ADD COLUMN `phone_verify_expires_at` datetime DEFAULT NULL COMMENT 'verification code expiration',
  ADD COLUMN `phone_verified_at` datetime DEFAULT NULL COMMENT 'phone verified timestamp';

ALTER TABLE `order_orders`
  ADD COLUMN `stock_deducted_at` datetime DEFAULT NULL COMMENT 'When stock was deducted for this order',
  ADD COLUMN `stock_document_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Linked stock out document id';

ALTER TABLE `prod_categories`
  ADD COLUMN `cart_visibility` tinyint(1) NOT NULL DEFAULT '0';

ALTER TABLE `ten_tenants`
  ADD COLUMN `order_stock_deduct_mode` enum('on_create','on_status') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'on_create' COMMENT 'When to deduct stock: on order creation or on selected status',
  ADD COLUMN `order_stock_deduct_status_id` int UNSIGNED DEFAULT NULL COMMENT 'Order status id that triggers stock deduction when mode=on_status',
  ADD COLUMN `img_webp_quality` tinyint UNSIGNED NOT NULL DEFAULT '82' COMMENT 'WebP quality for product photos (1-100)',
  ADD COLUMN `img_thumb_quality` tinyint UNSIGNED NOT NULL DEFAULT '72' COMMENT 'WebP quality for thumbnail (1-100)',
  ADD COLUMN `img_thumb_width` smallint UNSIGNED NOT NULL DEFAULT '480' COMMENT 'Thumbnail max width in px',
  ADD COLUMN `img_main_width` smallint UNSIGNED NOT NULL DEFAULT '1200' COMMENT 'Main product photo max width in px',
  ADD COLUMN `img_webp_aggressive` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Aggressive recompression for product WebP uploads',
  ADD COLUMN `img_delete_original` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Delete original file after WebP conversion',
  ADD COLUMN `telegram_bot_username` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Telegram bot username (without @)',
  ADD COLUMN `telegram_bot_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Telegram bot token from BotFather',
  ADD COLUMN `max_bot_token` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'MAX bot token for tenant authorization',
  ADD COLUMN `chat_welcome_message` text COLLATE utf8mb4_general_ci COMMENT 'Welcome text shown in customer chat',
  ADD COLUMN `chat_assistant_name` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Virtual assistant display name',
  ADD COLUMN `chat_operator_name` varchar(160) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Operator display name',
  ADD COLUMN `chat_quick_questions_json` text COLLATE utf8mb4_general_ci COMMENT 'JSON array of chat quick questions',
  ADD COLUMN `max_bot_id` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'MAX bot username or id for deep links',
  ADD COLUMN `max_login_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Enable customer login via MAX',
  ADD COLUMN `chat_widget_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Show customer chat button in storefront',
  ADD COLUMN `max_mini_app_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Enable MAX mini app link in bot auth message',
  ADD COLUMN `tg_mini_app_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Enable Telegram mini app link in bot auth message',
  ADD COLUMN `tg_login_enabled` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Enable customer login via Telegram',
  ADD COLUMN `chat_assistant_gender` char(1) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Virtual assistant gender: m/f',
  ADD COLUMN `chat_guest_thread_ttl_days` smallint UNSIGNED DEFAULT NULL COMMENT 'Guest chat TTL in days',
  ADD COLUMN `chat_welcome_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Enable welcome message in customer chat',
  ADD COLUMN `chat_quick_questions_enabled` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Enable quick questions grid in customer chat';

UPDATE `ten_tenants`
SET
  `chat_operator_name` = COALESCE(`chat_operator_name`, `site_name`, `name`),
  `chat_assistant_name` = COALESCE(`chat_assistant_name`, `site_name`, `name`),
  `img_webp_quality` = COALESCE(`img_webp_quality`, 82),
  `img_thumb_quality` = COALESCE(`img_thumb_quality`, 72),
  `img_thumb_width` = COALESCE(`img_thumb_width`, 480),
  `img_main_width` = COALESCE(`img_main_width`, 1200),
  `img_webp_aggressive` = COALESCE(`img_webp_aggressive`, 0),
  `img_delete_original` = COALESCE(`img_delete_original`, 1),
  `chat_widget_enabled` = COALESCE(`chat_widget_enabled`, 1),
  `chat_welcome_enabled` = COALESCE(`chat_welcome_enabled`, 1),
  `chat_quick_questions_enabled` = COALESCE(`chat_quick_questions_enabled`, 1),
  `max_login_enabled` = COALESCE(`max_login_enabled`, 0),
  `tg_login_enabled` = COALESCE(`tg_login_enabled`, 0),
  `max_mini_app_enabled` = COALESCE(`max_mini_app_enabled`, 1),
  `tg_mini_app_enabled` = COALESCE(`tg_mini_app_enabled`, 1)
WHERE 1=1;
