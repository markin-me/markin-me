-- SQL для добавления таблиц вариантов товаров в phpMyAdmin
-- Выполните этот SQL в вашей базе данных

-- --------------------------------------------------------

-- Структура таблицы `prod_variant_groups`
--

CREATE TABLE `prod_variant_groups` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `title` varchar(255) NOT NULL,
  `unit_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Единица измерения для вариантов',
  `values` text DEFAULT NULL COMMENT 'JSON массив значений вариантов (например: ["1","2","3","4"] или ["150г","250г","350г"])',
  `selection_type` enum('single') NOT NULL DEFAULT 'single',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_varntgrp_tenant_active_sort` (`tenant_id`,`is_active`,`sort_order`),
  KEY `idx_varntgrp_tenant_title` (`tenant_id`,`title`),
  KEY `fk_varntgrp_unit` (`unit_id`),
  CONSTRAINT `fk_varntgrp_unit` FOREIGN KEY (`unit_id`) REFERENCES `prod_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

-- Структура таблицы `prod_variant_discount_tiers`
--

CREATE TABLE `prod_variant_discount_tiers` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `variant_group_id` bigint(20) UNSIGNED NOT NULL,
  `min_quantity` decimal(10,3) NOT NULL COMMENT 'Минимальное количество для применения скидки',
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Процент скидки (0.00 - 100.00)',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_varnttier_group_sort` (`variant_group_id`,`sort_order`),
  KEY `idx_varnttier_tenant` (`tenant_id`),
  CONSTRAINT `fk_varnttier_group` FOREIGN KEY (`variant_group_id`) REFERENCES `prod_variant_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

-- Структура таблицы `prod_variant_assignments`
--

CREATE TABLE `prod_variant_assignments` (
  `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `variant_group_id` bigint(20) UNSIGNED NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_varntassign_unique` (`tenant_id`,`product_id`,`variant_group_id`),
  KEY `idx_varntassign_product` (`tenant_id`,`product_id`),
  KEY `idx_varntassign_group` (`variant_group_id`),
  CONSTRAINT `fk_varntassign_product` FOREIGN KEY (`tenant_id`,`product_id`) REFERENCES `prod_products` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_varntassign_group` FOREIGN KEY (`variant_group_id`) REFERENCES `prod_variant_groups` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;