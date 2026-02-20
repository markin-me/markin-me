ALTER TABLE `ten_tenants`
  ADD COLUMN `img_webp_quality` tinyint UNSIGNED NOT NULL DEFAULT 82 COMMENT 'WebP quality for product photos (1-100)',
  ADD COLUMN `img_thumb_quality` tinyint UNSIGNED NOT NULL DEFAULT 72 COMMENT 'WebP quality for thumbnail (1-100)',
  ADD COLUMN `img_thumb_width` smallint UNSIGNED NOT NULL DEFAULT 480 COMMENT 'Thumbnail max width in px',
  ADD COLUMN `img_delete_original` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Delete original file after WebP conversion';
