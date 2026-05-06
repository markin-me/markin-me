-- Миграция для расширения настроек бонусной программы и добавления групп категорий

-- 1. Добавление полей в основную таблицу настроек
ALTER TABLE `mkt_bonus_program_settings`
ADD COLUMN `bonus_program_name_base` VARCHAR(255) DEFAULT 'Бонусная программа' AFTER `allow_redeem_and_accrue`,
ADD COLUMN `bonus_program_logo_base` VARCHAR(255) DEFAULT NULL AFTER `bonus_program_name_base`,
ADD COLUMN `bonus_program_name_paid` VARCHAR(255) DEFAULT 'Привилегии Plus' AFTER `bonus_program_logo_base`,
ADD COLUMN `bonus_program_logo_paid` VARCHAR(255) DEFAULT NULL AFTER `bonus_program_name_paid`,
ADD COLUMN `bonus_coin_name` VARCHAR(50) DEFAULT 'Бонусы' AFTER `bonus_program_logo_paid`,
ADD COLUMN `bonus_coin_logo` VARCHAR(255) DEFAULT NULL AFTER `bonus_coin_name`;

-- 2. Создание таблицы для групп любимых категорий
CREATE TABLE IF NOT EXISTS `mkt_bonus_category_groups` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `bonus_percent` DECIMAL(5,2) NOT NULL DEFAULT '0.00',
  `categories_limit` INT NOT NULL DEFAULT '1',
  `category_ids` JSON NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_bonus_groups_tenant_id` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;



ALTER TABLE mkt_bonus_levels
  ADD COLUMN requirement_bonus_accrued DECIMAL(14,2) DEFAULT NULL AFTER requirement_referrals,
  ADD COLUMN requirement_bonus_redeemed DECIMAL(14,2) DEFAULT NULL AFTER requirement_bonus_accrued,
  ADD COLUMN retention_bonus_accrued DECIMAL(14,2) DEFAULT NULL AFTER retention_referrals,
  ADD COLUMN retention_bonus_redeemed DECIMAL(14,2) DEFAULT NULL AFTER retention_bonus_accrued;

ALTER TABLE ten_tenants
  ADD COLUMN site_menu_items_json TEXT DEFAULT NULL COMMENT 'Tenant storefront menu items JSON';







