ALTER TABLE `mkt_subscription_storefront_settings`
  ADD COLUMN `info_slides_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `faq_items_json`;
