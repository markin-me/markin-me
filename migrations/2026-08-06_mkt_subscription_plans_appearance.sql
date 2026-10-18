ALTER TABLE `mkt_subscription_plans`
  ADD COLUMN `icon_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `description`,
  ADD COLUMN `theme_color` char(7) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL DEFAULT '#ff6b00' AFTER `icon_url`;
