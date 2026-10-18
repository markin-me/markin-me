CREATE TABLE `mkt_customer_notification_consents` (
  `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` bigint UNSIGNED NOT NULL,
  `customer_id` bigint UNSIGNED NOT NULL,
  `source_key` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `button_text` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `interested` tinyint(1) NOT NULL DEFAULT '0',
  `notifications_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `enabled_at` datetime(3) DEFAULT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mkt_customer_notification_consent` (`tenant_id`,`store_id`,`customer_id`,`source_key`),
  KEY `idx_mkt_customer_notification_consent_filter` (`tenant_id`,`store_id`,`source_key`,`interested`,`notifications_enabled`,`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `mkt_customer_notification_consents`
  (`tenant_id`, `store_id`, `customer_id`, `source_key`, `button_text`, `interested`, `notifications_enabled`, `enabled_at`, `revoked_at`)
SELECT
  e.`tenant_id`, e.`store_id`, e.`customer_id`, 'subscription', e.`button_text`, 1,
  IF(EXISTS(
    SELECT 1
    FROM `chat_push_subscriptions` p
    WHERE p.`tenant_id`=e.`tenant_id`
      AND p.`store_id`=e.`store_id`
      AND p.`client_id`=e.`customer_id`
      AND p.`actor`='in'
      AND p.`push_important_enabled`=1
  ), 1, 0),
  e.`created_at`,
  IF(EXISTS(
    SELECT 1
    FROM `chat_push_subscriptions` p
    WHERE p.`tenant_id`=e.`tenant_id`
      AND p.`store_id`=e.`store_id`
      AND p.`client_id`=e.`customer_id`
      AND p.`actor`='in'
      AND p.`push_important_enabled`=1
  ), NULL, NOW(3))
FROM `mkt_subscription_info_events` e
INNER JOIN (
  SELECT `tenant_id`, `store_id`, `customer_id`, MAX(`id`) AS `id`
  FROM `mkt_subscription_info_events`
  WHERE `event_type`='consent'
  GROUP BY `tenant_id`, `store_id`, `customer_id`
) latest ON latest.`id`=e.`id`;
