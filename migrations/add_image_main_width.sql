ALTER TABLE `ten_tenants`
  ADD COLUMN `img_main_width` smallint UNSIGNED NOT NULL DEFAULT 1200 COMMENT 'Main product photo max width in px' AFTER `img_thumb_width`;

