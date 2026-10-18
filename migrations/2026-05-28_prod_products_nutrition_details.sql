ALTER TABLE `prod_products`
  ADD COLUMN `nutrition_protein_100g` DECIMAL(10,3) NULL AFTER `fulfillment_mode`,
  ADD COLUMN `nutrition_fat_100g` DECIMAL(10,3) NULL AFTER `nutrition_protein_100g`,
  ADD COLUMN `nutrition_carbs_100g` DECIMAL(10,3) NULL AFTER `nutrition_fat_100g`,
  ADD COLUMN `client_composition` TEXT COLLATE utf8mb4_unicode_ci NULL AFTER `nutrition_carbs_100g`,
  ADD COLUMN `tech_process` TEXT COLLATE utf8mb4_unicode_ci NULL AFTER `client_composition`,
  ADD COLUMN `show_description_short` TINYINT(1) NOT NULL DEFAULT 1 AFTER `tech_process`,
  ADD COLUMN `show_description` TINYINT(1) NOT NULL DEFAULT 1 AFTER `show_description_short`,
  ADD COLUMN `show_client_composition` TINYINT(1) NOT NULL DEFAULT 1 AFTER `show_description`,
  ADD COLUMN `show_tech_process` TINYINT(1) NOT NULL DEFAULT 1 AFTER `show_client_composition`;
