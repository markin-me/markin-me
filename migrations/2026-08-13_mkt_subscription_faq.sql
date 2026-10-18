ALTER TABLE `mkt_subscription_storefront_settings`
  ADD COLUMN `faq_title` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'Часто задаваемые вопросы' AFTER `button_icon_url`,
  ADD COLUMN `faq_items_json` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `faq_title`;
