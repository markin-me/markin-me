ALTER TABLE `ten_tenants`
  ADD COLUMN `img_webp_aggressive` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Aggressive recompression for product WebP uploads' AFTER `img_main_width`;

