-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Хост: 127.0.0.1
-- Время создания: Янв 20 2026 г., 06:17
-- Версия сервера: 10.4.32-MariaDB
-- Версия PHP: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- База данных: `test_shop`
--

DELIMITER $$
--
-- Процедуры
--
CREATE DEFINER=`root`@`localhost` PROCEDURE `migrate_order_methods_to_delivery_types` ()   BEGIN
  DECLARE done INT DEFAULT 0;
  DECLARE fkname VARCHAR(64);

  -- Курсор: все внешние ключи, которые сидят на order_orders.method_id
  DECLARE cur CURSOR FOR
    SELECT kcu.CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE kcu
    WHERE kcu.TABLE_SCHEMA = DATABASE()
      AND kcu.TABLE_NAME = 'order_orders'
      AND kcu.COLUMN_NAME = 'method_id'
      AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      AND kcu.CONSTRAINT_NAME <> 'PRIMARY';

  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = 1;

  -- 1) Снимаем все FK с method_id (чтобы можно было переименовать колонку)
  SET done = 0;
  OPEN cur;

  read_loop: LOOP
    FETCH cur INTO fkname;
    IF done = 1 THEN
      LEAVE read_loop;
    END IF;

    SET @sql = CONCAT('ALTER TABLE `order_orders` DROP FOREIGN KEY `', fkname, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;

  CLOSE cur;

  -- 2) Переименовываем таблицу order_methods -> order_delivery_types (если нужно)
  IF EXISTS (
      SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_methods'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_delivery_types'
    )
  THEN
    RENAME TABLE `order_methods` TO `order_delivery_types`;
  END IF;

  -- 3) Переименовываем колонки в order_orders (если нужно)
  IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'method_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'delivery_type_id'
    )
  THEN
    ALTER TABLE `order_orders`
      CHANGE COLUMN `method_id` `delivery_type_id` INT(11) NULL DEFAULT NULL;
  END IF;

  IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'delivery_address'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'address'
    )
  THEN
    ALTER TABLE `order_orders`
      CHANGE COLUMN `delivery_address` `address` VARCHAR(255) NULL DEFAULT NULL;
  END IF;

  -- 4) Индекс под delivery_type_id (если нет)
  IF EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'delivery_type_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND INDEX_NAME = 'idx_orders_delivery_type_id'
    )
  THEN
    ALTER TABLE `order_orders`
      ADD INDEX `idx_orders_delivery_type_id` (`delivery_type_id`);
  END IF;

  -- 5) Вешаем новый FK на order_delivery_types (если FK на delivery_type_id ещё нет)
  IF EXISTS (
      SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_delivery_types'
    )
    AND EXISTS (
      SELECT 1 FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_orders' AND COLUMN_NAME = 'delivery_type_id'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'order_orders'
        AND COLUMN_NAME = 'delivery_type_id'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    )
  THEN
    ALTER TABLE `order_orders`
      ADD CONSTRAINT `fk_orders_delivery_type`
      FOREIGN KEY (`delivery_type_id`) REFERENCES `order_delivery_types` (`id`)
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

END$$

DELIMITER ;

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customers`
--

CREATE TABLE `cust_customers` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `status_id` int(11) DEFAULT NULL,
  `phone` varchar(20) NOT NULL,
  `name` varchar(100) DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `addresses` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`addresses`)),
  `telegram_user_id` bigint(20) DEFAULT NULL,
  `registration_date` date DEFAULT NULL,
  `total_orders` int(11) NOT NULL DEFAULT 0,
  `total_spent` decimal(10,2) NOT NULL DEFAULT 0.00,
  `last_order_date` datetime DEFAULT NULL,
  `photo` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cust_customers`
--

INSERT INTO `cust_customers` (`id`, `tenant_id`, `store_id`, `status_id`, `phone`, `name`, `birthday`, `addresses`, `telegram_user_id`, `registration_date`, `total_orders`, `total_spent`, `last_order_date`, `photo`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, '79021461966', 'Максим', '1996-03-15', NULL, NULL, '2026-01-06', 3, 1323.00, '2026-01-06 20:57:09', '/static/uploads/avatars/1768109514069-4e5f0313ad18df2d.jpg', 1, '2026-01-06 08:37:19', '2026-01-11 05:31:54'),
(2, 1, 1, NULL, '79835475559', 'Иван', NULL, NULL, NULL, '2026-01-08', 0, 0.00, NULL, NULL, 1, '2026-01-08 12:31:52', '2026-01-08 12:31:52');

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customer_addresses`
--

CREATE TABLE `cust_customer_addresses` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `customer_id` int(11) NOT NULL,
  `street` varchar(160) NOT NULL,
  `house` varchar(40) NOT NULL,
  `entrance` varchar(20) DEFAULT NULL,
  `floor` varchar(20) DEFAULT NULL,
  `apartment` varchar(20) DEFAULT NULL,
  `comment` varchar(255) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cust_customer_addresses`
--

INSERT INTO `cust_customer_addresses` (`id`, `tenant_id`, `store_id`, `customer_id`, `street`, `house`, `entrance`, `floor`, `apartment`, `comment`, `is_default`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 'Деповская', '48', '2', '3', '45', 'Это мой дом', 1, 1, '2026-01-07 07:43:03', '2026-01-15 06:54:38'),
(2, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 0, 1, '2026-01-07 16:48:49', '2026-01-15 06:54:38'),
(3, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 0, 0, '2026-01-07 16:49:26', '2026-01-07 16:49:42');

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customer_sessions`
--

CREATE TABLE `cust_customer_sessions` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) NOT NULL,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `customer_id` int(11) NOT NULL,
  `token` varchar(64) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `expires_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cust_customer_sessions`
--

INSERT INTO `cust_customer_sessions` (`id`, `tenant_id`, `store_id`, `customer_id`, `token`, `created_at`, `expires_at`, `is_active`) VALUES
(1, 1, 1, 1, '99197191c804496eb7242523b8eaf5e8', '2026-01-07 13:59:52', '2026-02-06 13:59:52', 1),
(2, 1, 1, 1, 'd889cb464fc04eefa2377798cdc4c722', '2026-01-07 14:41:31', '2026-02-06 14:41:31', 1),
(3, 1, 1, 1, 'e4c9a82afc664cd59163e382034fd6ab', '2026-01-08 19:49:06', '2026-02-07 19:49:06', 0),
(4, 1, 1, 1, '4f4f0761f17e4dea854db76a09331d83', '2026-01-09 13:58:52', '2026-02-08 13:58:52', 0),
(5, 1, 1, 1, '38636efa4f194e498211319f9fc42749', '2026-01-09 13:59:03', '2026-02-08 13:59:03', 0),
(6, 1, 1, 1, 'cb5fefe1ee594b43b0e9b19a48b882c6', '2026-01-09 19:55:30', '2026-02-08 19:55:30', 0),
(7, 1, 1, 1, 'd93adddd4ea54533a1c65154a4726198', '2026-01-10 19:49:10', '2026-02-09 19:49:10', 1),
(8, 1, 1, 1, '9f52963f34314824b84857482509ffb1', '2026-01-11 12:31:30', '2026-02-10 12:31:30', 0),
(9, 1, 1, 1, 'd2057c77c1654dad99cff1e0c42d3810', '2026-01-11 15:26:46', '2026-02-10 15:26:46', 0),
(10, 1, 1, 1, 'c4d17b85c90a4384a68b22882d505ce5', '2026-01-11 16:01:02', '2026-02-10 16:01:02', 0),
(11, 1, 1, 1, '08074b70d017441fb9ddce949692571f', '2026-01-11 16:31:05', '2026-02-10 16:31:05', 0),
(12, 1, 1, 1, 'd3cdfebbb8f34be6abbda13e3819c3aa', '2026-01-11 16:31:37', '2026-02-10 16:31:37', 0),
(13, 1, 1, 1, '5be1ee4bd6334142973579ee51d87d47', '2026-01-11 18:38:43', '2026-02-10 18:38:43', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `cust_statuses`
--

CREATE TABLE `cust_statuses` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'new | regular | subscriber | vip',
  `title` varchar(100) NOT NULL COMMENT 'Новый | Постоянный | Подписчик | VIP',
  `icon` varchar(50) DEFAULT NULL,
  `color` varchar(30) DEFAULT NULL,
  `sort` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cust_statuses`
--

INSERT INTO `cust_statuses` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `color`, `sort`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'new', 'Новый', NULL, NULL, 1, 1, '2026-01-02 19:27:29', '2026-01-02 19:27:29'),
(2, 1, 1, 'regular', 'Постоянный', NULL, NULL, 2, 1, '2026-01-02 19:27:29', '2026-01-02 19:27:29'),
(3, 1, 1, 'subscriber', 'Подписчик', NULL, NULL, 3, 1, '2026-01-02 19:27:29', '2026-01-02 19:27:29'),
(4, 1, 1, 'vip', 'VIP', NULL, NULL, 4, 1, '2026-01-02 19:27:29', '2026-01-02 19:27:29');

-- --------------------------------------------------------

--
-- Структура таблицы `order_delivery_types`
--

CREATE TABLE `order_delivery_types` (
  `id` int(11) UNSIGNED NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'Машинный код (dine_in, takeaway, delivery)',
  `title` varchar(100) NOT NULL COMMENT 'Название способа (В зале, С собой)',
  `icon` varchar(50) DEFAULT NULL COMMENT 'Иконка (fa-utensils, fa-box, fa-truck)',
  `sort` int(11) DEFAULT 0 COMMENT 'Порядок отображения',
  `is_active` tinyint(1) DEFAULT 1 COMMENT 'Активен ли способ',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_delivery_types`
--

INSERT INTO `order_delivery_types` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `sort`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'dine_in', 'В зале', 'fa-utensils', 1, 1, '2026-01-02 18:18:07', '2026-01-02 18:18:07'),
(2, 1, 1, 'takeaway', 'С собой', 'fa-bag-shopping', 2, 1, '2026-01-02 18:18:07', '2026-01-02 18:18:07'),
(3, 1, 1, 'pickup', 'Самовывоз', 'fa-store', 3, 1, '2026-01-02 18:18:07', '2026-01-02 18:18:07'),
(4, 1, 1, 'delivery', 'Доставка', 'fa-truck', 4, 1, '2026-01-02 18:18:07', '2026-01-02 18:18:07');

-- --------------------------------------------------------

--
-- Структура таблицы `order_orders`
--

CREATE TABLE `order_orders` (
  `id` int(11) NOT NULL,
  `public_id` varchar(36) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `customer_id` int(11) DEFAULT NULL,
  `customer_name` varchar(120) DEFAULT NULL,
  `customer_phone` varchar(24) DEFAULT NULL,
  `promo_code` varchar(50) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `delivery_address_id` int(11) DEFAULT NULL,
  `comment` varchar(255) DEFAULT NULL,
  `cutlery_qty` int(11) NOT NULL DEFAULT 0,
  `change_from` decimal(10,2) DEFAULT NULL,
  `items` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`items`)),
  `total_price` decimal(10,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `delivery_type_id` int(11) DEFAULT NULL,
  `payment_id` int(11) DEFAULT NULL,
  `time_option_id` int(11) DEFAULT NULL,
  `status_id` int(10) UNSIGNED DEFAULT NULL,
  `status_sort` int(11) NOT NULL DEFAULT 0,
  `scheduled_at` datetime DEFAULT NULL,
  `created_via` varchar(20) NOT NULL DEFAULT 'web',
  `is_active` tinyint(4) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_orders`
--

INSERT INTO `order_orders` (`id`, `public_id`, `tenant_id`, `store_id`, `customer_id`, `customer_name`, `customer_phone`, `promo_code`, `address`, `delivery_address_id`, `comment`, `cutlery_qty`, `change_from`, `items`, `total_price`, `created_at`, `delivery_type_id`, `payment_id`, `time_option_id`, `status_id`, `status_sort`, `scheduled_at`, `created_via`, `is_active`) VALUES
(29, '7888fc9e-5bab-40b7-af69-dda5879c5700', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, NULL, 0, 0.00, '[{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":270,\"old_price\":0,\"line_total\":270,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.8,\"total\":120},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":150,\"total\":150}]},{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":270,\"old_price\":0,\"line_total\":460,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":200,\"price\":0.8,\"total\":160},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":2,\"price\":150,\"total\":300}]},{\"product_id\":12,\"name\":\"Картофельное пюре\",\"qty\":1,\"price\":800,\"old_price\":0,\"line_total\":310,\"photos\":[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"],\"options\":[{\"id\":60,\"title\":\"Куринная котлета\",\"price\":150,\"qty\":1}],\"variants\":[{\"variant_group_id\":2,\"variant_value_index\":1,\"group_title\":\"порц\",\"value\":\"200 г\",\"label\":\"200 г\",\"price_diff\":-640}]},{\"product_id\":13,\"name\":\"Куринная котлета\",\"qty\":1,\"price\":150,\"old_price\":0,\"line_total\":549,\"photos\":[\"/static/uploads/products/1/fe6e72ac1ce743c145b235225287a820.webp\"],\"options\":[{\"id\":30,\"title\":\"Кола\",\"price\":99,\"qty\":1},{\"id\":57,\"title\":\"Гречка с овощами\",\"price\":150,\"qty\":1}],\"variants\":[{\"variant_group_id\":1,\"variant_value_index\":1,\"group_title\":\"шт\",\"value\":\"2 шт\",\"label\":\"2 шт\",\"price_diff\":150}]}]', 1589.00, '2026-01-20 03:35:18', 4, 1, 1, 1, 0, NULL, 'web', 1),
(30, '63efc094-0d2a-4611-8400-79cb4c864fe2', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, NULL, 0, 0.00, '[{\"product_id\":12,\"name\":\"Картофельное пюре\",\"qty\":1,\"price\":800,\"old_price\":0,\"line_total\":310,\"photos\":[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"],\"options\":[{\"id\":60,\"title\":\"Куринная котлета\",\"price\":150,\"qty\":1}],\"variants\":[{\"variant_group_id\":2,\"variant_value_index\":1,\"group_title\":\"порц\",\"value\":\"200 г\",\"label\":\"200 г\",\"price_diff\":-640}]}]', 310.00, '2026-01-20 03:37:55', 4, 1, 1, 1, 0, NULL, 'web', 1),
(31, 'f09fb554-cff5-430f-a7ed-821cbf4fa5b9', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, NULL, 0, 0.00, '[{\"product_id\":12,\"name\":\"Картофельное пюре\",\"qty\":1,\"price\":800,\"old_price\":0,\"line_total\":310,\"photos\":[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"],\"options\":[{\"id\":60,\"title\":\"Куринная котлета\",\"price\":150,\"qty\":1}],\"variants\":[{\"variant_group_id\":2,\"variant_value_index\":1,\"group_title\":\"порц\",\"value\":\"200 г\",\"label\":\"200 г\",\"price_diff\":0}]}]', 310.00, '2026-01-20 03:42:44', 4, 1, 1, 1, 0, NULL, 'web', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `order_payments`
--

CREATE TABLE `order_payments` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'Системный код способа оплаты',
  `title` varchar(100) NOT NULL COMMENT 'Название (Наличные, Картой)',
  `icon` varchar(50) DEFAULT NULL COMMENT 'Иконка (fa-money-bill, fa-credit-card)',
  `sort` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_payments`
--

INSERT INTO `order_payments` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `sort`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'cash', 'Наличные', 'fa-money-bill-wave', 1, 1, '2026-01-02 19:03:40', '2026-01-02 19:03:40'),
(2, 1, 1, 'card', 'Картой', 'fa-credit-card', 2, 1, '2026-01-02 19:03:40', '2026-01-02 19:03:40'),
(3, 1, 1, 'online', 'Онлайн', 'fa-globe', 3, 1, '2026-01-02 19:03:40', '2026-01-02 19:03:40');

-- --------------------------------------------------------

--
-- Структура таблицы `order_statuses`
--

CREATE TABLE `order_statuses` (
  `id` int(11) UNSIGNED NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'Системный код статуса',
  `title` varchar(100) NOT NULL COMMENT 'Название в UI',
  `subtitle` varchar(150) DEFAULT NULL COMMENT 'Подзаголовок/описание',
  `icon` varchar(50) DEFAULT NULL COMMENT 'Иконка (FontAwesome key)',
  `color` varchar(30) DEFAULT NULL COMMENT 'Ключ цвета (orange, yellow, blue...)',
  `sort` int(11) DEFAULT 0 COMMENT 'Порядок отображения',
  `is_active` tinyint(1) DEFAULT 1 COMMENT 'Активен',
  `is_final` tinyint(1) DEFAULT 0 COMMENT 'Финальный статус',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_statuses`
--

INSERT INTO `order_statuses` (`id`, `tenant_id`, `store_id`, `code`, `title`, `subtitle`, `icon`, `color`, `sort`, `is_active`, `is_final`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'new', 'Новые', 'ожидают обработки', 'fa-plus-circle', 'orange', 1, 1, 0, '2026-01-02 18:22:30', '2026-01-02 18:22:30'),
(2, 1, 1, 'cooking', 'Готовятся', 'в работе', 'fa-fire', 'yellow', 2, 1, 0, '2026-01-02 18:22:30', '2026-01-02 18:22:30'),
(3, 1, 1, 'ready', 'Собран', 'ожидает курьера', 'fa-box', 'indigo', 3, 1, 0, '2026-01-02 18:22:30', '2026-01-02 18:22:30'),
(4, 1, 1, 'on_the_way', 'В пути', 'переданы доставке', 'fa-truck', 'blue', 4, 1, 0, '2026-01-02 18:22:30', '2026-01-02 18:22:30'),
(5, 1, 1, 'delivered', 'Доставлены', 'завершены', 'fa-check-circle', 'green', 5, 1, 1, '2026-01-02 18:22:30', '2026-01-02 18:22:30'),
(6, 1, 1, 'canceled', 'Отменены', 'аннулированы', 'fa-ban', 'red', 6, 1, 1, '2026-01-02 18:22:30', '2026-01-02 18:22:30');

-- --------------------------------------------------------

--
-- Структура таблицы `order_time_options`
--

CREATE TABLE `order_time_options` (
  `id` int(11) NOT NULL,
  `tenant_id` int(11) DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'asap | at_time | on_date',
  `title` varchar(100) NOT NULL COMMENT 'Как можно скорее | Ко времени | На дату',
  `description` varchar(150) DEFAULT NULL COMMENT 'Подсказка для пользователя',
  `sort` int(11) DEFAULT 0,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_time_options`
--

INSERT INTO `order_time_options` (`id`, `tenant_id`, `store_id`, `code`, `title`, `description`, `sort`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'asap', 'Как можно скорее', 'Начать выполнение сразу', 1, 1, '2026-01-02 19:07:20', '2026-01-02 19:07:20'),
(2, 1, 1, 'at_time', 'Ко времени', 'Приготовить к выбранному времени', 2, 1, '2026-01-02 19:07:20', '2026-01-02 19:07:20'),
(3, 1, 1, 'on_date', 'На дату', 'Приготовить на выбранную дату', 3, 1, '2026-01-02 19:07:20', '2026-01-02 19:07:20');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_categories`
--

CREATE TABLE `prod_categories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(64) NOT NULL,
  `title` varchar(255) NOT NULL,
  `icon` varchar(128) DEFAULT NULL,
  `site_visibility` tinyint(1) NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_categories`
--

INSERT INTO `prod_categories` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `site_visibility`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'all', 'Все товары', '/static/uploads/categories/6875982c13bfc85c5f048b152e9e610f.jpg', 1, 1, 0, '2026-01-03 07:37:51', '2026-01-09 12:27:23'),
(2, 1, 1, 'burgers', 'Бургеры', NULL, 1, 1, 40, '2026-01-03 07:37:51', '2026-01-16 12:02:23'),
(3, 1, 1, 'drinks', 'Напитки', NULL, 1, 1, 50, '2026-01-03 07:37:51', '2026-01-16 12:02:23'),
(4, 1, 1, 'cat-mk239ojm', 'Горячее', NULL, 1, 1, 60, '2026-01-06 04:27:59', '2026-01-16 12:02:23'),
(5, 1, 1, 'cat-mk2a0iyv', 'Гарнир', NULL, 1, 1, 20, '2026-01-06 07:36:49', '2026-01-16 12:02:23'),
(6, 1, 1, 'cat-mk2nkp4p', 'Булочки', NULL, 1, 1, 70, '2026-01-06 13:56:26', '2026-01-16 11:58:48'),
(7, 1, 1, 'cat-mk57sj5q', 'Вторые блюда', NULL, 1, 1, 30, '2026-01-08 08:57:56', '2026-01-16 12:02:23'),
(8, 1, 1, 'cat-mkgtrfi2', 'Продукты', NULL, 0, 1, 10, '2026-01-16 11:58:24', '2026-01-16 11:58:48');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_assignments`
--

CREATE TABLE `prod_option_assignments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `group_id` bigint(20) UNSIGNED NOT NULL,
  `assign_type` enum('category','product') NOT NULL,
  `assign_id` bigint(20) UNSIGNED NOT NULL,
  `priority` int(11) NOT NULL DEFAULT 0,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `selection_type` enum('single','multiple') NOT NULL DEFAULT 'single',
  `min_select` int(11) DEFAULT NULL,
  `max_select` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_assignments`
--

INSERT INTO `prod_option_assignments` (`id`, `tenant_id`, `store_id`, `group_id`, `assign_type`, `assign_id`, `priority`, `sort_order`, `is_active`, `selection_type`, `min_select`, `max_select`, `created_at`, `updated_at`) VALUES
(23, 1, 1, 4, 'product', 2, 0, 0, 1, 'single', NULL, NULL, '2026-01-10 09:04:26', '2026-01-10 09:04:26'),
(24, 1, 1, 4, 'product', 1, 0, 0, 0, 'single', NULL, NULL, '2026-01-10 09:04:26', '2026-01-16 17:38:36'),
(25, 1, 1, 4, 'product', 5, 0, 0, 1, 'single', NULL, NULL, '2026-01-10 09:04:26', '2026-01-10 09:04:26'),
(59, 1, 1, 12, 'product', 2, 0, 0, 1, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-12 18:07:16'),
(60, 1, 1, 12, 'product', 1, 0, 0, 0, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-16 15:55:04'),
(61, 1, 1, 12, 'product', 5, 0, 0, 1, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-12 18:07:16'),
(62, 1, 1, 12, 'product', 10, 0, 0, 1, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-12 18:07:16'),
(63, 1, 1, 12, 'product', 9, 0, 0, 1, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-12 18:07:16'),
(64, 1, 1, 12, 'product', 8, 0, 0, 1, 'single', NULL, NULL, '2026-01-12 18:07:16', '2026-01-12 18:07:16'),
(69, 1, 1, 4, 'product', 15, 0, 0, 0, 'single', NULL, NULL, '2026-01-16 18:32:20', '2026-01-18 06:36:13'),
(74, 1, 1, 12, 'product', 14, 0, 0, 0, 'single', NULL, NULL, '2026-01-17 17:33:52', '2026-01-18 06:56:33'),
(75, 1, 1, 11, 'product', 14, 0, 0, 0, 'single', NULL, NULL, '2026-01-17 17:34:03', '2026-01-17 17:34:08'),
(76, 1, 1, 8, 'product', 13, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 05:49:32', '2026-01-19 05:49:32'),
(78, 1, 1, 5, 'product', 13, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(79, 1, 1, 5, 'product', 4, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(80, 1, 1, 5, 'product', 7, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(81, 1, 1, 6, 'product', 12, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 18:09:04', '2026-01-19 18:09:04'),
(82, 1, 1, 6, 'product', 6, 0, 0, 1, 'single', NULL, NULL, '2026-01-19 18:09:04', '2026-01-19 18:09:04'),
(83, 1, 1, 9, 'product', 21, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(84, 1, 1, 9, 'product', 18, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(85, 1, 1, 9, 'product', 15, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(86, 1, 1, 9, 'product', 12, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(87, 1, 1, 9, 'product', 13, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(88, 1, 1, 9, 'product', 16, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(89, 1, 1, 9, 'product', 17, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(90, 1, 1, 9, 'product', 14, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(91, 1, 1, 9, 'product', 19, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(92, 1, 1, 9, 'product', 20, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:14:19', '2026-01-20 04:14:19'),
(93, 1, 1, 10, 'product', 21, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(94, 1, 1, 10, 'product', 18, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(95, 1, 1, 10, 'product', 15, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(96, 1, 1, 10, 'product', 12, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(97, 1, 1, 10, 'product', 13, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(98, 1, 1, 10, 'product', 16, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(99, 1, 1, 10, 'product', 17, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(100, 1, 1, 10, 'product', 14, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(101, 1, 1, 10, 'product', 19, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28'),
(102, 1, 1, 10, 'product', 20, 0, 0, 1, 'single', NULL, NULL, '2026-01-20 04:27:28', '2026-01-20 04:27:28');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_exclusions`
--

CREATE TABLE `prod_option_exclusions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `group_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_groups`
--

CREATE TABLE `prod_option_groups` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `title` varchar(255) NOT NULL,
  `selection_type` enum('single','multiple') NOT NULL DEFAULT 'single',
  `min_select` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `max_select` int(10) UNSIGNED DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `is_required` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_groups`
--

INSERT INTO `prod_option_groups` (`id`, `tenant_id`, `store_id`, `title`, `selection_type`, `min_select`, `max_select`, `is_active`, `sort_order`, `created_at`, `updated_at`, `is_required`) VALUES
(4, 1, 1, 'По щам', 'single', 0, NULL, 1, 0, '2026-01-10 09:03:50', '2026-01-10 09:03:50', 1),
(5, 1, 1, 'Гарнир', 'single', 0, NULL, 1, 0, '2026-01-10 10:22:35', '2026-01-19 18:08:38', 1),
(6, 1, 1, 'Горячее', 'single', 0, NULL, 1, 0, '2026-01-10 10:49:58', '2026-01-10 10:49:58', 1),
(8, 1, 1, 'Суп', 'single', 0, NULL, 1, 0, '2026-01-11 05:28:56', '2026-01-11 05:28:56', 1),
(9, 1, 1, 'Соусы', 'multiple', 0, NULL, 1, 0, '2026-01-11 11:29:52', '2026-01-20 04:13:29', 0),
(10, 1, 1, 'Комбо', 'multiple', 0, NULL, 1, 0, '2026-01-11 11:30:37', '2026-01-11 11:30:37', 1),
(11, 1, 1, 'Обязательна', 'single', 0, NULL, 1, 0, '2026-01-12 18:06:09', '2026-01-12 18:06:09', 1),
(12, 1, 1, 'Необязательна', 'single', 0, NULL, 1, 0, '2026-01-12 18:06:26', '2026-01-12 18:06:26', 0);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_items`
--

CREATE TABLE `prod_option_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `group_id` bigint(20) UNSIGNED NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `target_type` enum('custom','product','category_pick') NOT NULL DEFAULT 'custom',
  `target_product_id` bigint(20) UNSIGNED DEFAULT NULL,
  `target_category_id` bigint(20) UNSIGNED DEFAULT NULL,
  `price_mode` enum('fixed','delta','from_target') NOT NULL DEFAULT 'delta',
  `price_value` decimal(10,2) DEFAULT 0.00,
  `qty_min` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `qty_max` int(10) UNSIGNED NOT NULL DEFAULT 1,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_items`
--

INSERT INTO `prod_option_items` (`id`, `tenant_id`, `store_id`, `group_id`, `title`, `description`, `target_type`, `target_product_id`, `target_category_id`, `price_mode`, `price_value`, `qty_min`, `qty_max`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(27, 1, 1, 4, NULL, NULL, 'product', 2, NULL, 'fixed', 99.00, 1, 1, 1, 0, '2026-01-11 04:58:48', '2026-01-11 08:18:22'),
(28, 1, 1, 4, NULL, NULL, 'product', 1, NULL, 'from_target', NULL, 1, 1, 1, 10, '2026-01-11 04:59:02', '2026-01-11 04:59:02'),
(30, 1, 1, 8, NULL, NULL, 'product', 5, NULL, 'fixed', 99.00, 1, 1, 1, 0, '2026-01-11 05:28:56', '2026-01-11 05:29:22'),
(31, 1, 1, 8, NULL, NULL, 'product', 2, NULL, 'from_target', NULL, 1, 1, 1, 10, '2026-01-11 05:28:56', '2026-01-11 05:28:56'),
(32, 1, 1, 8, NULL, NULL, 'product', 1, NULL, 'from_target', NULL, 1, 1, 1, 20, '2026-01-11 05:28:56', '2026-01-11 05:28:56'),
(33, 1, 1, 9, NULL, NULL, 'product', 2, NULL, 'from_target', NULL, 1, 3, 1, 0, '2026-01-11 11:29:52', '2026-01-20 04:13:29'),
(34, 1, 1, 9, NULL, NULL, 'product', 1, NULL, 'fixed', 10.00, 1, 3, 1, 10, '2026-01-11 11:29:52', '2026-01-20 04:13:29'),
(35, 1, 1, 9, NULL, NULL, 'product', 5, NULL, 'from_target', NULL, 1, 3, 1, 20, '2026-01-11 11:29:52', '2026-01-20 04:13:29'),
(36, 1, 1, 10, NULL, NULL, 'product', 1, NULL, 'from_target', NULL, 0, 5, 1, 0, '2026-01-11 11:30:37', '2026-01-11 11:30:37'),
(37, 1, 1, 10, NULL, NULL, 'product', 10, NULL, 'from_target', NULL, 0, 5, 1, 10, '2026-01-11 11:30:37', '2026-01-20 05:13:34'),
(38, 1, 1, 10, NULL, NULL, 'product', 9, NULL, 'from_target', NULL, 0, 5, 1, 20, '2026-01-11 11:30:37', '2026-01-20 05:13:34'),
(39, 1, 1, 10, NULL, NULL, 'product', 3, NULL, 'from_target', NULL, 0, 5, 1, 30, '2026-01-11 11:30:37', '2026-01-20 05:13:34'),
(40, 1, 1, 10, NULL, NULL, 'product', 11, NULL, 'from_target', NULL, 0, 5, 1, 40, '2026-01-11 11:30:37', '2026-01-20 05:13:34'),
(43, 1, 1, 11, NULL, NULL, 'product', 2, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-12 18:06:09', '2026-01-12 18:06:09'),
(44, 1, 1, 11, NULL, NULL, 'product', 1, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-12 18:06:09', '2026-01-12 18:06:09'),
(45, 1, 1, 11, NULL, NULL, 'product', 5, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-12 18:06:09', '2026-01-12 18:06:09'),
(46, 1, 1, 11, NULL, NULL, 'product', 10, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-12 18:06:09', '2026-01-12 18:06:09'),
(47, 1, 1, 11, NULL, NULL, 'product', 9, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-12 18:06:09', '2026-01-12 18:06:09'),
(48, 1, 1, 12, NULL, NULL, 'product', 2, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(49, 1, 1, 12, NULL, NULL, 'product', 1, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(50, 1, 1, 12, NULL, NULL, 'product', 5, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(51, 1, 1, 12, NULL, NULL, 'product', 10, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(52, 1, 1, 12, NULL, NULL, 'product', 9, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(53, 1, 1, 12, NULL, NULL, 'product', 8, NULL, 'from_target', 0.00, 1, 1, 1, 50, '2026-01-12 18:06:26', '2026-01-12 18:06:26'),
(57, 1, 1, 5, NULL, NULL, 'product', 21, NULL, 'from_target', NULL, 1, 1, 1, 0, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(58, 1, 1, 5, NULL, NULL, 'product', 12, NULL, 'from_target', NULL, 1, 1, 1, 10, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(59, 1, 1, 5, NULL, NULL, 'product', 6, NULL, 'from_target', NULL, 1, 1, 1, 20, '2026-01-19 18:08:38', '2026-01-19 18:08:38'),
(60, 1, 1, 6, NULL, NULL, 'product', 13, NULL, 'from_target', NULL, 1, 1, 1, 0, '2026-01-19 18:09:04', '2026-01-19 18:09:04'),
(61, 1, 1, 6, NULL, NULL, 'product', 4, NULL, 'from_target', NULL, 1, 1, 1, 10, '2026-01-19 18:09:04', '2026-01-19 18:09:04'),
(62, 1, 1, 6, NULL, NULL, 'product', 7, NULL, 'from_target', NULL, 1, 1, 1, 20, '2026-01-19 18:09:04', '2026-01-19 18:09:04');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_overrides`
--

CREATE TABLE `prod_option_overrides` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `group_id` bigint(20) UNSIGNED NOT NULL,
  `min_select` int(10) UNSIGNED DEFAULT NULL,
  `max_select` int(10) UNSIGNED DEFAULT NULL,
  `selection_type` enum('single','multiple') DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_products`
--

CREATE TABLE `prod_products` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `name` varchar(255) NOT NULL,
  `sku` varchar(64) DEFAULT NULL,
  `description_short` varchar(500) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `price` decimal(12,2) NOT NULL DEFAULT 0.00,
  `old_price` decimal(12,2) DEFAULT NULL,
  `cost_price` decimal(12,2) DEFAULT NULL,
  `unit_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Единица измерения товара',
  `photos_json` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `site_visibility` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `base_unit_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Базовая единица измерения',
  `base_qty` decimal(12,3) DEFAULT NULL COMMENT 'Количество базовой единицы для цены'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_products`
--

INSERT INTO `prod_products` (`id`, `tenant_id`, `store_id`, `name`, `sku`, `description_short`, `description`, `price`, `old_price`, `cost_price`, `unit_id`, `photos_json`, `is_active`, `site_visibility`, `created_at`, `updated_at`, `base_unit_id`, `base_qty`) VALUES
(1, 1, 1, 'Картошка фриКартошка фриКартошка фри', NULL, '«Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 150.00, NULL, 40.00, 2, '[\"/static/uploads/products/1/a98c7ce5d7b10ac0735a059730a0d3d7.png\",\"/static/uploads/products/1/7498e3f335146d848fb50b125417f8c3.jpg\",\"/static/uploads/products/1/2cb5dcd586e080ffc086f42d357c5229.jpg\",\"/static/uploads/products/1/21ff17c8ce65941320569cdca418189d.jpg\"]', 1, 1, '2026-01-03 10:03:50', '2026-01-19 06:47:44', 2, NULL),
(2, 1, 1, 'Запеканка', NULL, '«Белка — лесной житель', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 299.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/cfd04eb2551edc8c4bf4b26f587171bd.jpg\"]', 1, 1, '2026-01-03 12:54:21', '2026-01-18 06:44:28', 6, NULL),
(3, 1, 1, 'Пюре с сосисками', NULL, '«Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 678.00, 999.00, NULL, 6, '[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"]', 1, 1, '2026-01-05 15:54:34', '2026-01-17 10:23:23', NULL, NULL),
(4, 1, 1, 'Рыбная котлета', NULL, '«Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 149.00, 179.00, NULL, NULL, '[\"/static/uploads/products/1/446502b1bce3809a4303e8c7f4345d51.jpg\"]', 1, 1, '2026-01-06 04:28:49', '2026-01-11 08:15:21', NULL, NULL),
(5, 1, 1, 'Кола', NULL, '. «Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 120.00, NULL, 0.00, NULL, '[\"/static/uploads/products/1/854b87feeafab3c82453dcaa5ff8c9e0.jpg\"]', 1, 1, '2026-01-06 04:35:32', '2026-01-19 18:02:04', NULL, NULL),
(6, 1, 1, 'Рис с овощами', NULL, '«Белка — лесной житель', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 149.00, 179.00, NULL, NULL, '[\"/static/uploads/products/1/b7d5215763b1e8b3a3a05564c83352f0.jpg\"]', 1, 1, '2026-01-06 07:37:17', '2026-01-11 08:15:38', NULL, NULL),
(7, 1, 1, 'Тефтели', NULL, '. «Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 149.00, 999.00, 0.00, 1, '[\"/static/uploads/products/1/09c238e8cea082a8ce2a57359b649b7d.jpg\"]', 1, 1, '2026-01-06 13:56:46', '2026-01-19 18:08:00', 1, NULL),
(8, 1, 1, 'Мкароны с тефтелями', NULL, '«Белка — лесной житель', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 299.00, 347.00, NULL, NULL, '[\"/static/uploads/products/1/d47962e1e258c2369161a1c86ccf0e3b.jpg\"]', 1, 1, '2026-01-08 03:44:37', '2026-01-11 08:15:58', NULL, NULL),
(9, 1, 1, 'Макароны с печенью', NULL, '«Белка — лесной житель.', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 456.00, 678.00, NULL, NULL, '[\"/static/uploads/products/1/59e45a1798151b95d447fad186c77ff0.jpg\"]', 1, 1, '2026-01-08 03:45:00', '2026-01-11 08:16:07', NULL, NULL),
(10, 1, 1, 'Котлета с пюрешкой', NULL, '«Белка — лесной житель', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 299.00, 319.00, NULL, NULL, '[\"/static/uploads/products/1/48df187f637a1df0f3e763d1191989d8.jpg\"]', 1, 1, '2026-01-08 08:58:27', '2026-01-11 08:16:15', NULL, NULL),
(11, 1, 1, 'Фрикадельки с пюрешкой', NULL, '«Белка — лесной житель', 'Описание белки. «Белка — лесной житель. У неё маленькая голова и большие красивые глаза. Ушки с кисточками на концах, а хвостик пушистый. Шерсть рыжая и густая. Белка живёт в дупле дерева. Она питается орехами и грибами, а летом запасает корм на зиму».', 599.00, 768.00, 100.00, 6, '[\"/static/uploads/products/1/c7ee582d4fddf82778bdf23b8ab25754.jpg\"]', 0, 0, '2026-01-08 08:58:54', '2026-01-17 13:15:33', 6, NULL),
(12, 1, 1, 'Картофельное пюре', NULL, NULL, NULL, 800.00, NULL, 95.00, 2, '[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"]', 1, 1, '2026-01-16 10:32:24', '2026-01-19 18:41:52', 2, 1.000),
(13, 1, 1, 'Куринная котлета', NULL, NULL, NULL, 150.00, NULL, 48.00, 1, '[\"/static/uploads/products/1/fe6e72ac1ce743c145b235225287a820.webp\"]', 1, 1, '2026-01-16 10:33:13', '2026-01-19 06:15:24', 1, NULL),
(14, 1, 1, 'Пюре с куриной котлетой', NULL, NULL, NULL, 270.00, NULL, 62.25, 6, '[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"]', 1, 1, '2026-01-16 10:34:30', '2026-01-18 08:51:25', 6, NULL),
(15, 1, 1, 'Картофель', NULL, NULL, NULL, 0.00, NULL, 40.00, 2, '[\"/static/uploads/products/1/6ec0482c5b64bc892b95d4d799d278b3.webp\"]', 1, 0, '2026-01-16 11:58:13', '2026-01-18 06:31:16', 2, NULL),
(16, 1, 1, 'Масло сливочное', NULL, NULL, NULL, 0.00, NULL, 200.00, 2, '[\"/static/uploads/products/1/fd170c1d0a9402b11b304e7090e1ee7c.webp\"]', 1, 0, '2026-01-16 12:01:19', '2026-01-18 06:32:43', 2, NULL),
(17, 1, 1, 'Молоко', NULL, NULL, NULL, 0.00, NULL, 100.00, 2, '[\"/static/uploads/products/1/6e18cdc9e15ef0c2622e9a619b1c3725.webp\"]', 1, 0, '2026-01-16 12:02:03', '2026-01-18 06:32:52', 2, NULL),
(18, 1, 1, 'карт', NULL, NULL, NULL, 78.00, NULL, NULL, NULL, NULL, 0, 0, '2026-01-16 16:26:17', '2026-01-17 13:07:55', NULL, NULL),
(19, 1, 1, 'Соль', NULL, NULL, NULL, 0.00, NULL, 100.00, 2, NULL, 1, 0, '2026-01-18 06:44:53', '2026-01-18 14:10:17', 2, 1.000),
(20, 1, 1, 'Фарш куринный', NULL, NULL, NULL, 0.00, NULL, 400.00, 2, NULL, 1, 0, '2026-01-18 06:57:10', '2026-01-18 14:10:29', 2, NULL),
(21, 1, 1, 'Гречка с овощами', NULL, NULL, NULL, 150.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/ccbfd8c94a01992063130008a89452ca.webp\"]', 1, 1, '2026-01-19 18:06:45', '2026-01-19 18:06:45', 3, 100.000);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_categories`
--

CREATE TABLE `prod_product_categories` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `category_id` bigint(20) UNSIGNED NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_product_categories`
--

INSERT INTO `prod_product_categories` (`id`, `tenant_id`, `store_id`, `product_id`, `category_id`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 1, 30, '2026-01-03 10:03:50', '2026-01-17 11:06:00'),
(3, 1, 1, 1, 2, 10, '2026-01-03 11:03:56', '2026-01-03 11:03:56'),
(5, 1, 1, 2, 1, 40, '2026-01-03 12:54:21', '2026-01-17 11:06:00'),
(10, 1, 1, 2, 2, 0, '2026-01-03 13:10:31', '2026-01-03 13:10:34'),
(17, 1, 1, 3, 1, 50, '2026-01-05 15:54:34', '2026-01-17 11:05:57'),
(19, 1, 1, 4, 1, 60, '2026-01-06 04:28:49', '2026-01-17 11:05:57'),
(20, 1, 1, 4, 4, 0, '2026-01-06 04:28:49', '2026-01-17 13:30:29'),
(21, 1, 1, 5, 1, 70, '2026-01-06 04:35:32', '2026-01-17 11:05:57'),
(22, 1, 1, 5, 3, 20, '2026-01-06 04:35:32', '2026-01-06 04:35:32'),
(23, 1, 1, 6, 1, 80, '2026-01-06 07:37:17', '2026-01-17 11:05:57'),
(25, 1, 1, 7, 1, 90, '2026-01-06 13:56:46', '2026-01-17 11:05:57'),
(27, 1, 1, 8, 1, 100, '2026-01-08 03:44:37', '2026-01-17 11:05:57'),
(28, 1, 1, 8, 6, 20, '2026-01-08 03:44:37', '2026-01-08 03:44:37'),
(29, 1, 1, 9, 1, 110, '2026-01-08 03:45:00', '2026-01-17 11:05:53'),
(40, 1, 1, 10, 1, 120, '2026-01-08 08:58:27', '2026-01-17 11:05:53'),
(41, 1, 1, 10, 7, 0, '2026-01-08 08:58:27', '2026-01-10 06:49:08'),
(42, 1, 1, 11, 1, 130, '2026-01-08 08:58:54', '2026-01-17 11:05:53'),
(43, 1, 1, 11, 7, 10, '2026-01-08 08:58:54', '2026-01-10 06:49:08'),
(44, 1, 1, 3, 7, 20, '2026-01-08 08:59:50', '2026-01-10 06:49:08'),
(48, 1, 1, 1, 7, 30, '2026-01-10 06:59:14', '2026-01-10 06:59:14'),
(51, 1, 1, 9, 7, 40, '2026-01-11 05:12:04', '2026-01-11 05:12:04'),
(53, 1, 1, 6, 5, 0, '2026-01-11 05:16:44', '2026-01-17 13:31:19'),
(54, 1, 1, 12, 1, 20, '2026-01-16 10:32:24', '2026-01-17 11:06:00'),
(55, 1, 1, 13, 1, 10, '2026-01-16 10:33:13', '2026-01-17 11:05:59'),
(56, 1, 1, 14, 1, 0, '2026-01-16 10:34:30', '2026-01-17 11:05:48'),
(57, 1, 1, 15, 1, 130, '2026-01-16 11:58:13', '2026-01-17 15:15:02'),
(58, 1, 1, 15, 8, 0, '2026-01-16 11:59:07', '2026-01-17 13:34:01'),
(59, 1, 1, 16, 1, 140, '2026-01-16 12:01:19', '2026-01-17 15:15:02'),
(60, 1, 1, 16, 8, 10, '2026-01-16 12:01:19', '2026-01-17 13:34:01'),
(61, 1, 1, 17, 1, 150, '2026-01-16 12:02:03', '2026-01-17 15:15:02'),
(62, 1, 1, 17, 8, 20, '2026-01-16 12:02:03', '2026-01-17 13:34:01'),
(63, 1, 1, 12, 5, 10, '2026-01-16 12:02:38', '2026-01-17 13:31:19'),
(166, 1, 1, 18, 1, 170, '2026-01-16 16:26:17', '2026-01-16 16:26:17'),
(579, 1, 1, 19, 1, 160, '2026-01-18 06:44:53', '2026-01-18 07:25:22'),
(580, 1, 1, 20, 1, 170, '2026-01-18 06:57:10', '2026-01-18 07:25:22'),
(599, 1, 1, 19, 8, 30, '2026-01-18 14:10:17', '2026-01-18 14:10:17'),
(600, 1, 1, 20, 8, 40, '2026-01-18 14:10:29', '2026-01-18 14:10:29'),
(601, 1, 1, 14, 7, 50, '2026-01-19 14:51:00', '2026-01-19 14:51:00'),
(638, 1, 1, 21, 1, 180, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(639, 1, 1, 21, 5, 20, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(640, 1, 1, 13, 4, 10, '2026-01-19 18:07:23', '2026-01-19 18:07:23'),
(641, 1, 1, 7, 4, 20, '2026-01-19 18:08:00', '2026-01-19 18:08:00');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_ingredients`
--

CREATE TABLE `prod_product_ingredients` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Товар, который состоит из ингредиентов',
  `ingredient_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Товар-ингредиент',
  `quantity` decimal(10,3) NOT NULL DEFAULT 1.000 COMMENT 'Базовое/начальное количество',
  `unit_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Единица измерения',
  `quantity_min` decimal(10,3) DEFAULT NULL COMMENT 'Минимальное количество (NULL = фиксированное)',
  `quantity_max` decimal(10,3) DEFAULT NULL COMMENT 'Максимальное количество',
  `quantity_step` decimal(10,3) DEFAULT NULL COMMENT 'Шаг изменения количества',
  `price_override` decimal(12,2) DEFAULT NULL COMMENT 'Переопределение цены (NULL = из каталога)',
  `is_variable` tinyint(1) NOT NULL DEFAULT 1 COMMENT 'Изменяемый состав для клиента (1=да, 0=нет)',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_product_ingredients`
--

INSERT INTO `prod_product_ingredients` (`id`, `tenant_id`, `store_id`, `product_id`, `ingredient_id`, `quantity`, `unit_id`, `quantity_min`, `quantity_max`, `quantity_step`, `price_override`, `is_variable`, `sort_order`, `created_at`, `updated_at`) VALUES
(5, 1, 1, 12, 15, 1.000, 2, NULL, NULL, NULL, NULL, 0, 10, '2026-01-16 12:57:50', '2026-01-18 06:33:31'),
(11, 1, 1, 1, 13, 1.000, 1, NULL, NULL, NULL, NULL, 0, 30, '2026-01-17 11:05:21', '2026-01-17 11:05:21'),
(12, 1, 1, 14, 12, 150.000, 3, 150.000, 350.000, 50.000, NULL, 1, 10, '2026-01-17 11:08:20', '2026-01-18 12:10:58'),
(13, 1, 1, 14, 13, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-17 11:08:20', '2026-01-17 11:09:30'),
(16, 1, 1, 12, 17, 300.000, 3, NULL, NULL, NULL, NULL, 0, 20, '2026-01-18 06:33:31', '2026-01-18 06:45:41'),
(17, 1, 1, 12, 16, 100.000, 3, NULL, NULL, NULL, NULL, 0, 30, '2026-01-18 06:33:31', '2026-01-18 06:45:41'),
(18, 1, 1, 12, 19, 50.000, 3, NULL, NULL, NULL, NULL, 0, 40, '2026-01-18 06:45:16', '2026-01-18 06:45:16'),
(19, 1, 1, 13, 20, 120.000, 3, NULL, NULL, NULL, NULL, 0, 10, '2026-01-18 06:57:37', '2026-01-18 06:57:37');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_unit_links`
--

CREATE TABLE `prod_product_unit_links` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `unit_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Связанная единица (например шт)',
  `base_unit_id` bigint(20) UNSIGNED NOT NULL COMMENT 'Базовая единица товара',
  `factor` decimal(18,6) NOT NULL COMMENT 'Сколько base_unit в 1 unit',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_units`
--

CREATE TABLE `prod_units` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `code` varchar(50) NOT NULL COMMENT 'Системный код единицы (шт, кг, г, л, мл, порц)',
  `title` varchar(100) NOT NULL COMMENT 'Название единицы (Штука, Килограмм, Грамм)',
  `short_title` varchar(20) DEFAULT NULL COMMENT 'Краткое название (шт, кг, г)',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_units`
--

INSERT INTO `prod_units` (`id`, `tenant_id`, `store_id`, `code`, `title`, `short_title`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'pcs', 'Штука', 'шт', 1, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(2, 1, 1, 'kg', 'Килограмм', 'кг', 2, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(3, 1, 1, 'g', 'Грамм', 'г', 3, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(4, 1, 1, 'l', 'Литр', 'л', 4, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(5, 1, 1, 'ml', 'Миллилитр', 'мл', 5, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(6, 1, 1, 'portion', 'Порция', 'порц', 6, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_unit_conversions`
--

CREATE TABLE `prod_unit_conversions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `from_unit_id` bigint(20) UNSIGNED NOT NULL,
  `to_unit_id` bigint(20) UNSIGNED NOT NULL,
  `factor` decimal(18,6) NOT NULL COMMENT 'Умножить значение в from_unit на factor, чтобы получить to_unit',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_unit_conversions`
--

INSERT INTO `prod_unit_conversions` (`id`, `tenant_id`, `store_id`, `from_unit_id`, `to_unit_id`, `factor`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 2, 3, 1000.000000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(2, 1, 1, 3, 2, 0.001000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(3, 1, 1, 4, 5, 1000.000000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(4, 1, 1, 5, 4, 0.001000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_assignments`
--

CREATE TABLE `prod_variant_assignments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `variant_group_id` bigint(20) UNSIGNED NOT NULL,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_assignments`
--

INSERT INTO `prod_variant_assignments` (`id`, `tenant_id`, `store_id`, `product_id`, `variant_group_id`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 13, 1, 0, 1, '2026-01-19 05:48:13', '2026-01-19 05:48:13'),
(2, 1, 1, 12, 2, 0, 1, '2026-01-19 06:17:05', '2026-01-19 06:17:05'),
(3, 1, 1, 1, 2, 0, 1, '2026-01-19 06:47:51', '2026-01-19 06:47:51'),
(4, 1, 1, 21, 2, 0, 1, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(5, 1, 1, 7, 1, 0, 1, '2026-01-19 18:07:49', '2026-01-19 18:07:49'),
(6, 1, 1, 6, 2, 0, 1, '2026-01-19 18:31:38', '2026-01-19 18:31:38');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_discount_tiers`
--

CREATE TABLE `prod_variant_discount_tiers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `variant_group_id` bigint(20) UNSIGNED NOT NULL,
  `min_quantity` decimal(10,3) NOT NULL COMMENT 'Минимальное количество для применения скидки',
  `discount_percent` decimal(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Процент скидки (0.00 - 100.00)',
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_discount_tiers`
--

INSERT INTO `prod_variant_discount_tiers` (`id`, `tenant_id`, `store_id`, `variant_group_id`, `min_quantity`, `discount_percent`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 1.000, 0.00, 0, '2026-01-18 15:54:47', '2026-01-18 15:54:47'),
(3, 1, 1, 2, 1.000, 0.00, 0, '2026-01-19 05:48:48', '2026-01-19 05:48:48'),
(4, 1, 1, 1, 1.000, 0.00, 1, '2026-01-19 06:16:18', '2026-01-19 06:16:18'),
(5, 1, 1, 1, 1.000, 0.00, 2, '2026-01-19 06:16:18', '2026-01-19 06:16:18'),
(6, 1, 1, 1, 1.000, 0.00, 3, '2026-01-19 06:16:18', '2026-01-19 06:16:18'),
(7, 1, 1, 2, 1.000, 0.00, 1, '2026-01-19 06:16:52', '2026-01-19 06:16:52'),
(8, 1, 1, 2, 1.000, 0.00, 2, '2026-01-19 06:16:52', '2026-01-19 06:16:52'),
(9, 1, 1, 2, 1.000, 0.00, 3, '2026-01-19 06:16:52', '2026-01-19 06:16:52');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_groups`
--

CREATE TABLE `prod_variant_groups` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tenant_id` bigint(20) UNSIGNED NOT NULL DEFAULT 1,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `title` varchar(255) NOT NULL,
  `unit_id` bigint(20) UNSIGNED DEFAULT NULL COMMENT 'Единица измерения для вариантов',
  `values` text DEFAULT NULL COMMENT 'JSON массив значений вариантов (например: ["1","2","3","4"] или ["150г","250г","350г"])',
  `selection_type` enum('single') NOT NULL DEFAULT 'single',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_groups`
--

INSERT INTO `prod_variant_groups` (`id`, `tenant_id`, `store_id`, `title`, `unit_id`, `values`, `selection_type`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'шт', 1, '[\"1\",\"2\",\"3\",\"4\"]', 'single', 1, 0, '2026-01-18 15:54:47', '2026-01-19 06:16:18'),
(2, 1, 1, 'порц', 3, '[\"100\",\"200\",\"300\",\"400\"]', 'single', 1, 0, '2026-01-19 05:48:48', '2026-01-19 06:16:52');

-- --------------------------------------------------------

--
-- Структура таблицы `ten_tenants`
--

CREATE TABLE `ten_tenants` (
  `id` int(11) NOT NULL,
  `store_id` int(11) NOT NULL DEFAULT 1,
  `name` varchar(100) DEFAULT 'Мой Магазин'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `ten_tenants`
--

INSERT INTO `ten_tenants` (`id`, `store_id`, `name`) VALUES
(1, 1, 'Тестовая Точка');

--
-- Индексы сохранённых таблиц
--

--
-- Индексы таблицы `cust_customers`
--
ALTER TABLE `cust_customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_cust_tenant_phone` (`tenant_id`,`phone`),
  ADD UNIQUE KEY `uq_cust_tenant_id_id` (`tenant_id`,`id`),
  ADD UNIQUE KEY `uq_cust_phone_tenant` (`tenant_id`,`phone`),
  ADD KEY `idx_cust_tenant_status` (`tenant_id`,`status_id`),
  ADD KEY `idx_cust_phone` (`phone`),
  ADD KEY `idx_cust_telegram` (`telegram_user_id`),
  ADD KEY `fk_cust_status` (`status_id`);

--
-- Индексы таблицы `cust_customer_addresses`
--
ALTER TABLE `cust_customer_addresses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_addr_tenant_id_id` (`tenant_id`,`id`),
  ADD KEY `idx_addr_tenant_customer` (`tenant_id`,`customer_id`),
  ADD KEY `idx_addr_tenant_customer_default` (`tenant_id`,`customer_id`,`is_default`);

--
-- Индексы таблицы `cust_customer_sessions`
--
ALTER TABLE `cust_customer_sessions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_token` (`token`),
  ADD KEY `idx_tenant_customer` (`tenant_id`,`customer_id`);

--
-- Индексы таблицы `cust_statuses`
--
ALTER TABLE `cust_statuses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Индексы таблицы `order_delivery_types`
--
ALTER TABLE `order_delivery_types`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD UNIQUE KEY `uq_order_methods_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_order_methods_tenant` (`tenant_id`);

--
-- Индексы таблицы `order_orders`
--
ALTER TABLE `order_orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `ux_order_orders_public_id` (`public_id`),
  ADD KEY `fk_order_status` (`status_id`),
  ADD KEY `ix_order_orders_tenant_created` (`tenant_id`,`created_at`),
  ADD KEY `ix_order_orders_tenant_customer` (`tenant_id`,`customer_id`),
  ADD KEY `ix_order_orders_tenant_status` (`tenant_id`,`status_id`),
  ADD KEY `ix_order_orders_tenant_delivery_addr` (`tenant_id`,`delivery_address_id`),
  ADD KEY `ix_order_orders_tenant_status_sort` (`tenant_id`,`status_id`,`status_sort`,`created_at`),
  ADD KEY `fk_orders_payment` (`payment_id`),
  ADD KEY `fk_orders_time_option` (`time_option_id`),
  ADD KEY `ix_order_orders_active` (`tenant_id`,`is_active`),
  ADD KEY `idx_orders_delivery_type_id` (`delivery_type_id`);

--
-- Индексы таблицы `order_payments`
--
ALTER TABLE `order_payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Индексы таблицы `order_statuses`
--
ALTER TABLE `order_statuses`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`),
  ADD UNIQUE KEY `uq_order_statuses_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_order_statuses_id` (`id`),
  ADD KEY `idx_order_statuses_tenant` (`tenant_id`);

--
-- Индексы таблицы `order_time_options`
--
ALTER TABLE `order_time_options`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Индексы таблицы `prod_categories`
--
ALTER TABLE `prod_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_categories_tenant_code` (`tenant_id`,`code`),
  ADD UNIQUE KEY `uq_prod_categories_tenant_id_id` (`tenant_id`,`id`),
  ADD KEY `idx_prod_categories_tenant_sort` (`tenant_id`,`sort_order`),
  ADD KEY `idx_prod_categories_tenant_flags` (`tenant_id`,`is_active`,`site_visibility`);

--
-- Индексы таблицы `prod_option_assignments`
--
ALTER TABLE `prod_option_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_optassign_unique` (`tenant_id`,`assign_type`,`assign_id`,`group_id`),
  ADD KEY `fk_optassign_group` (`group_id`),
  ADD KEY `idx_optassign_lookup` (`tenant_id`,`assign_type`,`assign_id`,`is_active`),
  ADD KEY `idx_optassign_group` (`tenant_id`,`group_id`),
  ADD KEY `idx_optassign_group_active_sort` (`tenant_id`,`group_id`,`is_active`,`sort_order`);

--
-- Индексы таблицы `prod_option_exclusions`
--
ALTER TABLE `prod_option_exclusions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_optexcl_unique` (`tenant_id`,`product_id`,`group_id`),
  ADD KEY `idx_optexcl_product` (`tenant_id`,`product_id`),
  ADD KEY `fk_optexcl_group` (`group_id`);

--
-- Индексы таблицы `prod_option_groups`
--
ALTER TABLE `prod_option_groups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_optgrp_tenant_active_sort` (`tenant_id`,`is_active`,`sort_order`),
  ADD KEY `idx_optgrp_tenant_title` (`tenant_id`,`title`);

--
-- Индексы таблицы `prod_option_items`
--
ALTER TABLE `prod_option_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_optitem_group_sort` (`group_id`,`is_active`,`sort_order`),
  ADD KEY `idx_optitem_tenant_type` (`tenant_id`,`target_type`,`is_active`),
  ADD KEY `idx_optitem_target_product` (`target_product_id`),
  ADD KEY `idx_optitem_target_category` (`target_category_id`);

--
-- Индексы таблицы `prod_option_overrides`
--
ALTER TABLE `prod_option_overrides`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_optover_unique` (`tenant_id`,`product_id`,`group_id`),
  ADD KEY `idx_optover_product` (`tenant_id`,`product_id`),
  ADD KEY `fk_optover_group` (`group_id`);

--
-- Индексы таблицы `prod_products`
--
ALTER TABLE `prod_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_products_tenant_id` (`tenant_id`,`id`),
  ADD UNIQUE KEY `uq_prod_products_tenant_sku` (`tenant_id`,`sku`),
  ADD KEY `idx_prod_products_tenant_active` (`tenant_id`,`is_active`,`site_visibility`),
  ADD KEY `idx_prod_products_tenant_name` (`tenant_id`,`name`),
  ADD KEY `fk_prod_products_unit` (`unit_id`);

--
-- Индексы таблицы `prod_product_categories`
--
ALTER TABLE `prod_product_categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_prodcat_tenant_product_category` (`tenant_id`,`product_id`,`category_id`),
  ADD KEY `idx_prod_prodcat_tenant_category_sort` (`tenant_id`,`category_id`,`sort_order`,`product_id`),
  ADD KEY `idx_prod_prodcat_tenant_product` (`tenant_id`,`product_id`,`category_id`);

--
-- Индексы таблицы `prod_product_ingredients`
--
ALTER TABLE `prod_product_ingredients`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_ingr_product_ingredient` (`tenant_id`,`product_id`,`ingredient_id`),
  ADD KEY `idx_prod_ingr_product` (`tenant_id`,`product_id`),
  ADD KEY `idx_prod_ingr_ingredient` (`tenant_id`,`ingredient_id`),
  ADD KEY `fk_prod_ingr_unit` (`unit_id`);

--
-- Индексы таблицы `prod_product_unit_links`
--
ALTER TABLE `prod_product_unit_links`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_link_product` (`product_id`),
  ADD KEY `idx_link_units` (`unit_id`,`base_unit_id`);

--
-- Индексы таблицы `prod_units`
--
ALTER TABLE `prod_units`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_units_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_prod_units_tenant_active` (`tenant_id`,`is_active`,`sort_order`);

--
-- Индексы таблицы `prod_unit_conversions`
--
ALTER TABLE `prod_unit_conversions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_conv_tenant` (`tenant_id`),
  ADD KEY `idx_conv_units` (`from_unit_id`,`to_unit_id`);

--
-- Индексы таблицы `prod_variant_assignments`
--
ALTER TABLE `prod_variant_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_varntassign_unique` (`tenant_id`,`product_id`,`variant_group_id`),
  ADD KEY `idx_varntassign_product` (`tenant_id`,`product_id`),
  ADD KEY `idx_varntassign_group` (`variant_group_id`);

--
-- Индексы таблицы `prod_variant_discount_tiers`
--
ALTER TABLE `prod_variant_discount_tiers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_varnttier_group_sort` (`variant_group_id`,`sort_order`),
  ADD KEY `idx_varnttier_tenant` (`tenant_id`);

--
-- Индексы таблицы `prod_variant_groups`
--
ALTER TABLE `prod_variant_groups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_varntgrp_tenant_active_sort` (`tenant_id`,`is_active`,`sort_order`),
  ADD KEY `idx_varntgrp_tenant_title` (`tenant_id`,`title`),
  ADD KEY `fk_varntgrp_unit` (`unit_id`);

--
-- Индексы таблицы `ten_tenants`
--
ALTER TABLE `ten_tenants`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT для сохранённых таблиц
--

--
-- AUTO_INCREMENT для таблицы `cust_customers`
--
ALTER TABLE `cust_customers`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT для таблицы `cust_customer_addresses`
--
ALTER TABLE `cust_customer_addresses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `cust_customer_sessions`
--
ALTER TABLE `cust_customer_sessions`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT для таблицы `cust_statuses`
--
ALTER TABLE `cust_statuses`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `order_delivery_types`
--
ALTER TABLE `order_delivery_types`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `order_orders`
--
ALTER TABLE `order_orders`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT для таблицы `order_payments`
--
ALTER TABLE `order_payments`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `order_statuses`
--
ALTER TABLE `order_statuses`
  MODIFY `id` int(11) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `order_time_options`
--
ALTER TABLE `order_time_options`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `prod_categories`
--
ALTER TABLE `prod_categories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT для таблицы `prod_option_assignments`
--
ALTER TABLE `prod_option_assignments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=103;

--
-- AUTO_INCREMENT для таблицы `prod_option_exclusions`
--
ALTER TABLE `prod_option_exclusions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_option_groups`
--
ALTER TABLE `prod_option_groups`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT для таблицы `prod_option_items`
--
ALTER TABLE `prod_option_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=63;

--
-- AUTO_INCREMENT для таблицы `prod_option_overrides`
--
ALTER TABLE `prod_option_overrides`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_products`
--
ALTER TABLE `prod_products`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=22;

--
-- AUTO_INCREMENT для таблицы `prod_product_categories`
--
ALTER TABLE `prod_product_categories`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=642;

--
-- AUTO_INCREMENT для таблицы `prod_product_ingredients`
--
ALTER TABLE `prod_product_ingredients`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT для таблицы `prod_product_unit_links`
--
ALTER TABLE `prod_product_unit_links`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT для таблицы `prod_units`
--
ALTER TABLE `prod_units`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `prod_unit_conversions`
--
ALTER TABLE `prod_unit_conversions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `prod_variant_assignments`
--
ALTER TABLE `prod_variant_assignments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `prod_variant_discount_tiers`
--
ALTER TABLE `prod_variant_discount_tiers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT для таблицы `prod_variant_groups`
--
ALTER TABLE `prod_variant_groups`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT для таблицы `ten_tenants`
--
ALTER TABLE `ten_tenants`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Ограничения внешнего ключа сохраненных таблиц
--

--
-- Ограничения внешнего ключа таблицы `cust_customers`
--
ALTER TABLE `cust_customers`
  ADD CONSTRAINT `fk_cust_status` FOREIGN KEY (`status_id`) REFERENCES `cust_statuses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `cust_customer_addresses`
--
ALTER TABLE `cust_customer_addresses`
  ADD CONSTRAINT `fk_addr_customer_tenant` FOREIGN KEY (`tenant_id`,`customer_id`) REFERENCES `cust_customers` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `order_orders`
--
ALTER TABLE `order_orders`
  ADD CONSTRAINT `fk_order_status` FOREIGN KEY (`status_id`) REFERENCES `order_statuses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_orders_customer` FOREIGN KEY (`tenant_id`,`customer_id`) REFERENCES `cust_customers` (`tenant_id`, `id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_orders_delivery_address` FOREIGN KEY (`tenant_id`,`delivery_address_id`) REFERENCES `cust_customer_addresses` (`tenant_id`, `id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_orders_payment` FOREIGN KEY (`payment_id`) REFERENCES `order_payments` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_orders_status` FOREIGN KEY (`status_id`) REFERENCES `order_statuses` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_orders_time_option` FOREIGN KEY (`time_option_id`) REFERENCES `order_time_options` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_option_assignments`
--
ALTER TABLE `prod_option_assignments`
  ADD CONSTRAINT `fk_optassign_group` FOREIGN KEY (`group_id`) REFERENCES `prod_option_groups` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_option_exclusions`
--
ALTER TABLE `prod_option_exclusions`
  ADD CONSTRAINT `fk_optexcl_group` FOREIGN KEY (`group_id`) REFERENCES `prod_option_groups` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_option_items`
--
ALTER TABLE `prod_option_items`
  ADD CONSTRAINT `fk_optitem_group` FOREIGN KEY (`group_id`) REFERENCES `prod_option_groups` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_option_overrides`
--
ALTER TABLE `prod_option_overrides`
  ADD CONSTRAINT `fk_optover_group` FOREIGN KEY (`group_id`) REFERENCES `prod_option_groups` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_products`
--
ALTER TABLE `prod_products`
  ADD CONSTRAINT `fk_prod_products_unit` FOREIGN KEY (`unit_id`) REFERENCES `prod_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_product_categories`
--
ALTER TABLE `prod_product_categories`
  ADD CONSTRAINT `fk_prod_prodcat_category` FOREIGN KEY (`tenant_id`,`category_id`) REFERENCES `prod_categories` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_product_ingredients`
--
ALTER TABLE `prod_product_ingredients`
  ADD CONSTRAINT `fk_prod_ingr_ingredient` FOREIGN KEY (`tenant_id`,`ingredient_id`) REFERENCES `prod_products` (`tenant_id`, `id`) ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_prod_ingr_product` FOREIGN KEY (`tenant_id`,`product_id`) REFERENCES `prod_products` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_prod_ingr_unit` FOREIGN KEY (`unit_id`) REFERENCES `prod_units` (`id`) ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_variant_assignments`
--
ALTER TABLE `prod_variant_assignments`
  ADD CONSTRAINT `fk_varntassign_group` FOREIGN KEY (`variant_group_id`) REFERENCES `prod_variant_groups` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_varntassign_product` FOREIGN KEY (`tenant_id`,`product_id`) REFERENCES `prod_products` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_variant_discount_tiers`
--
ALTER TABLE `prod_variant_discount_tiers`
  ADD CONSTRAINT `fk_varnttier_group` FOREIGN KEY (`variant_group_id`) REFERENCES `prod_variant_groups` (`id`) ON DELETE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_variant_groups`
--
ALTER TABLE `prod_variant_groups`
  ADD CONSTRAINT `fk_varntgrp_unit` FOREIGN KEY (`unit_id`) REFERENCES `prod_units` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
