-- ADM.PWA.4.3: durable idempotency for Courier status/payment mutations.

CREATE TABLE IF NOT EXISTS `order_mutation_idempotency` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` BIGINT UNSIGNED NOT NULL,
  `store_id` BIGINT UNSIGNED NOT NULL,
  `actor_user_id` BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `operation` VARCHAR(64) NOT NULL,
  `idempotency_key` VARCHAR(128) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `state` ENUM('processing', 'completed') NOT NULL DEFAULT 'processing',
  `order_id` BIGINT UNSIGNED NOT NULL,
  `response_status` SMALLINT UNSIGNED NULL,
  `response_json` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_mutation_idempotency_scope`
    (`tenant_id`, `store_id`, `actor_user_id`, `operation`, `idempotency_key`),
  KEY `idx_order_mutation_idempotency_cleanup`
    (`tenant_id`, `store_id`, `state`, `updated_at`),
  KEY `idx_order_mutation_idempotency_created` (`created_at`),
  KEY `idx_order_mutation_idempotency_order` (`tenant_id`, `store_id`, `order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
