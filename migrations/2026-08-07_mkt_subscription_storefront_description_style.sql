ALTER TABLE `mkt_subscription_storefront_settings`
  ADD COLUMN `description_font_size` tinyint UNSIGNED NOT NULL DEFAULT '12' AFTER `description`,
  ADD COLUMN `description_color` char(7) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '#7651c9' AFTER `description_font_size`;
