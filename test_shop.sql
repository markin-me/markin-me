-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Хост: 10.0.231.119
-- Время создания: Янв 31 2026 г., 05:59
-- Версия сервера: 8.0.37-29
-- Версия PHP: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- База данных: `a1186497_test`
--

DELIMITER $$
--
-- Процедуры
--
CREATE DEFINER=`a1186497`@`10.0.1.23` PROCEDURE `migrate_order_methods_to_delivery_types` ()   BEGIN
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
-- Структура таблицы `app_users`
--

CREATE TABLE `app_users` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('owner','manager','courier','admin') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'manager',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `app_users`
--

INSERT INTO `app_users` (`id`, `tenant_id`, `email`, `phone`, `password_hash`, `name`, `role`, `is_active`, `last_login_at`, `created_at`, `updated_at`) VALUES
(1, 1, 'admin@test.ru', NULL, '$2a$10$c2.HUSbW1ssrMsF03XsC6eMSkXR6FtMqOPLpSUgkUIQRibqfk9.zO', 'Владелец', 'owner', 1, '2026-01-29 10:29:56', '2026-01-21 13:15:27', '2026-01-29 07:29:56');

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customers`
--

CREATE TABLE `cust_customers` (
  `id` int NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `status_id` int DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `birthday` date DEFAULT NULL,
  `addresses` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `telegram_user_id` bigint DEFAULT NULL,
  `registration_date` date DEFAULT NULL,
  `total_orders` int NOT NULL DEFAULT '0',
  `total_spent` decimal(10,2) NOT NULL DEFAULT '0.00',
  `last_order_date` datetime DEFAULT NULL,
  `photo` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ;

--
-- Дамп данных таблицы `cust_customers`
--

INSERT INTO `cust_customers` (`id`, `tenant_id`, `store_id`, `status_id`, `phone`, `name`, `birthday`, `addresses`, `telegram_user_id`, `registration_date`, `total_orders`, `total_spent`, `last_order_date`, `photo`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, '79021461966', 'Максим', '1996-03-15', NULL, NULL, '2026-01-06', 3, 1323.00, '2026-01-06 20:57:09', '/static/uploads/avatars/1769191372366-649c38532aeed34f.png', 1, '2026-01-06 08:37:19', '2026-01-23 18:02:52'),
(2, 1, 1, NULL, '79835475559', 'Иван', NULL, NULL, NULL, '2026-01-08', 0, 0.00, NULL, NULL, 1, '2026-01-08 12:31:52', '2026-01-08 12:31:52'),
(3, 1, 1, NULL, '79991114242', 'Мак', NULL, NULL, NULL, '2026-01-24', 0, 0.00, NULL, NULL, 1, '2026-01-24 14:40:43', '2026-01-24 14:40:43'),
(4, 1, 1, NULL, '79835549121', 'Александер', '1986-09-11', NULL, NULL, '2026-01-27', 0, 0.00, NULL, NULL, 1, '2026-01-27 10:45:42', '2026-01-28 04:26:51');

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customer_addresses`
--

CREATE TABLE `cust_customer_addresses` (
  `id` int NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int NOT NULL,
  `street` varchar(160) COLLATE utf8mb4_general_ci NOT NULL,
  `house` varchar(40) COLLATE utf8mb4_general_ci NOT NULL,
  `entrance` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `floor` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `apartment` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `comment` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `cust_customer_addresses`
--

INSERT INTO `cust_customer_addresses` (`id`, `tenant_id`, `store_id`, `customer_id`, `street`, `house`, `entrance`, `floor`, `apartment`, `comment`, `is_default`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 'Деповская', '48', '2', '3', '45', 'Это мой дом', 1, 1, '2026-01-07 07:43:03', '2026-01-30 12:06:07'),
(2, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 0, 1, '2026-01-07 16:48:49', '2026-01-30 12:06:07'),
(3, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 0, 0, '2026-01-07 16:49:26', '2026-01-07 16:49:42'),
(4, 1, 1, 1, '4444', '3', NULL, NULL, NULL, NULL, 0, 0, '2026-01-23 17:47:27', '2026-01-23 17:52:54'),
(5, 1, 1, 4, 'гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 10:46:37', '2026-01-27 10:47:45'),
(6, 1, 1, 4, 'Клочкова', '19', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 14:18:44', '2026-01-27 14:34:21'),
(7, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 14:35:10', '2026-01-27 15:20:15'),
(8, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 15:03:26', '2026-01-27 15:20:13'),
(9, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 15:20:07', '2026-01-28 04:27:56'),
(10, 1, 1, 1, 'энгельса 2 кв', '23', NULL, NULL, NULL, NULL, 0, 0, '2026-01-29 12:27:39', '2026-01-29 12:27:44');

-- --------------------------------------------------------

--
-- Структура таблицы `cust_customer_sessions`
--

CREATE TABLE `cust_customer_sessions` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_general_ci NOT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` datetime DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1'
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
(13, 1, 1, 1, '5be1ee4bd6334142973579ee51d87d47', '2026-01-11 18:38:43', '2026-02-10 18:38:43', 1),
(14, 1, 1, 1, 'da2712fcbc834e3fb0384ed57b5e3c8a', '2026-01-22 11:14:07', '2026-02-21 11:14:07', 1),
(15, 1, 1, 1, 'a5a01c5d95834b34bb714bc25c579b4e', '2026-01-22 17:18:04', '2026-02-21 17:18:04', 1),
(16, 1, 1, 1, 'fd81527de8ef459896f80198ad8c41bd', '2026-01-22 17:19:33', '2026-02-21 17:19:33', 0),
(17, 1, 1, 1, 'c42c9aec9dde45e8a926d7bc4c420fda', '2026-01-22 17:31:04', '2026-02-21 17:31:04', 1),
(18, 1, 1, 1, '41a26f238fb84bf986ef05869f4b688a', '2026-01-22 19:57:31', '2026-02-21 19:57:31', 1),
(19, 1, 1, 1, 'edeb2df3360f4b9d8423492b406cd2a2', '2026-01-22 20:10:08', '2026-02-21 20:10:08', 1),
(20, 1, 1, 1, 'e454e474e7d84124939ede1364ee7cf2', '2026-01-22 21:13:36', '2026-02-21 21:13:36', 1),
(21, 1, 1, 1, '3a88427f14424c1b863328b3f7c57f2b', '2026-01-23 21:02:14', '2026-02-22 21:02:14', 1),
(22, 1, 1, 1, 'ce8c84e7c1154c16a422f3deb89a4243', '2026-01-24 07:02:22', '2026-02-23 07:02:22', 1),
(23, 1, 1, 1, '157fd23fc9f14876897d6a395c197fba', '2026-01-24 10:32:32', '2026-02-23 10:32:32', 1),
(24, 1, 1, 1, 'e07f062bc2744a8eb618f620fce65dc7', '2026-01-24 15:48:57', '2026-02-23 15:48:57', 1),
(25, 1, 1, 1, '296a3d8dbaed4572af1b9ddc9655f771', '2026-01-25 14:14:07', '2026-02-24 14:14:07', 0),
(26, 1, 1, 1, 'b8ca9d340f4940ee90fe1a866b700a86', '2026-01-26 08:50:54', '2026-02-25 08:50:54', 1),
(27, 1, 1, 4, '1f0613b5e2d44b4b9c565e730de9a04b', '2026-01-27 13:45:42', '2026-02-26 13:45:42', 1),
(28, 1, 1, 4, 'be102fa131444db1ad877e446175e55c', '2026-01-27 13:59:47', '2026-02-26 13:59:47', 0),
(29, 1, 1, 4, 'b5376e3188224a198e89cdc9a9e6330a', '2026-01-27 17:18:43', '2026-02-26 17:18:43', 1),
(30, 1, 1, 4, '766ffa755b0348ebabc97cc95c352708', '2026-01-27 18:03:25', '2026-02-26 18:03:25', 1),
(31, 1, 1, 1, '20e9cef3102743e58341aeac68d05c14', '2026-01-29 10:45:50', '2026-02-28 10:45:50', 1),
(32, 1, 1, 1, 'd0bfd08a35244ea8911d9395ca6aa6bf', '2026-01-29 15:27:38', '2026-02-28 15:27:38', 0),
(33, 1, 1, 1, '58a7c951f5a44fc8827adebac02a7a5e', '2026-01-30 13:16:20', '2026-03-01 13:16:20', 1),
(34, 1, 1, 1, '34175369124e49fd81ebef4e3979094e', '2026-01-30 14:27:40', '2026-03-01 14:27:40', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `cust_statuses`
--

CREATE TABLE `cust_statuses` (
  `id` int NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'new | regular | subscriber | vip',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Новый | Постоянный | Подписчик | VIP',
  `icon` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `color` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sort` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  `id` int UNSIGNED NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Машинный код (dine_in, takeaway, delivery)',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Название способа (В зале, С собой)',
  `icon` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Иконка (fa-utensils, fa-box, fa-truck)',
  `sort` int DEFAULT '0' COMMENT 'Порядок отображения',
  `is_active` tinyint(1) DEFAULT '1' COMMENT 'Активен ли способ',
  `is_default` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_delivery_types`
--

INSERT INTO `order_delivery_types` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `sort`, `is_active`, `is_default`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'dine_in', 'В зале', 'fa-utensils', 1, 0, 0, '2026-01-02 18:18:07', '2026-01-25 15:30:10'),
(2, 1, 1, 'takeaway', 'С собой', 'fa-bag-shopping', 2, 0, 0, '2026-01-02 18:18:07', '2026-01-25 15:30:11'),
(3, 1, 1, 'pickup', 'Самовывоз', 'fa-store', 3, 1, 0, '2026-01-02 18:18:07', '2026-01-27 13:13:15'),
(4, 1, 1, 'delivery', 'Доставка', 'fa-truck', 4, 1, 1, '2026-01-02 18:18:07', '2026-01-27 13:13:31');

-- --------------------------------------------------------

--
-- Структура таблицы `order_orders`
--

CREATE TABLE `order_orders` (
  `id` int NOT NULL,
  `public_id` varchar(36) COLLATE utf8mb4_general_ci NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `customer_id` int DEFAULT NULL,
  `customer_name` varchar(120) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `customer_phone` varchar(24) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `promo_code` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `delivery_address_id` int DEFAULT NULL,
  `pickup_store_id` int DEFAULT NULL COMMENT 'ID точки самовывоза (для takeaway/pickup)',
  `comment` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `cutlery_qty` int NOT NULL DEFAULT '0',
  `change_from` decimal(10,2) DEFAULT NULL,
  `items` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,
  `total_price` decimal(10,2) DEFAULT NULL,
  `delivery_cost` decimal(10,2) DEFAULT '0.00',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivery_type_id` int DEFAULT NULL,
  `payment_id` int DEFAULT NULL,
  `time_option_id` int DEFAULT NULL,
  `status_id` int UNSIGNED DEFAULT NULL,
  `status_sort` int NOT NULL DEFAULT '0',
  `scheduled_at` datetime DEFAULT NULL,
  `created_via` varchar(20) COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'web',
  `is_active` tinyint NOT NULL DEFAULT '1'
) ;

--
-- Дамп данных таблицы `order_orders`
--

INSERT INTO `order_orders` (`id`, `public_id`, `tenant_id`, `store_id`, `customer_id`, `customer_name`, `customer_phone`, `promo_code`, `address`, `delivery_address_id`, `pickup_store_id`, `comment`, `cutlery_qty`, `change_from`, `items`, `total_price`, `delivery_cost`, `created_at`, `delivery_type_id`, `payment_id`, `time_option_id`, `status_id`, `status_sort`, `scheduled_at`, `created_via`, `is_active`) VALUES
(97, 'b9f77a22-4103-422c-8aee-0d440911ade2', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":1,\"price\":398,\"old_price\":0,\"line_total\":398,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":250,\"price\":0.796,\"total\":199},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}]},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":10,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]}]', 457.00, 59.00, '2026-01-30 19:49:57', 4, 1, 1, 1, 0, NULL, 'web', 1),
(98, 'b172be96-2168-4307-a8fd-aeb4e90b6376', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":41,\"name\":\"Котлета по-домашнемй с гречкой\",\"qty\":1,\"price\":374,\"old_price\":0,\"line_total\":374,\"photos\":[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"],\"ingredients\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"price\":0.5933333333333334,\"total\":89},{\"ingredient_id\":26,\"name\":\"Котлета по-домашнему\",\"quantity\":1,\"price\":149,\"total\":149}]},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":10,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]}]', 433.00, 59.00, '2026-01-30 19:53:33', 4, 1, 1, 1, 0, NULL, 'web', 1),
(99, '9afd3e35-d076-4b24-97bf-229833b1512e', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":1,\"price\":398,\"old_price\":0,\"line_total\":398,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":250,\"price\":0.796,\"total\":199},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}]},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":10,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]}]', 457.00, 59.00, '2026-01-30 19:58:45', 4, 1, 1, 1, 0, NULL, 'web', 1),
(100, '31b6718f-152b-4e1f-85b1-ebcb1ea69f4f', 1, 1, 1, 'Максим', '79021461966', NULL, 'Деповская 48, подъезд 2, этаж 3, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":56,\"name\":\"Картофель по-деревенски\",\"qty\":1,\"price\":120,\"old_price\":0,\"line_total\":132,\"photos\":[\"/static/uploads/products/1/d375080a4e6492a8a12e92d636e75840.jpg\"],\"variants\":[{\"variant_group_id\":7,\"variant_value_index\":0,\"group_title\":\"Варианты закусок (Граммы)\",\"value\":\"100 г\",\"label\":\"100 г\",\"price_diff\":0}]},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":10,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]}]', 191.00, 59.00, '2026-01-30 20:28:35', 4, 1, 1, 1, 0, NULL, 'web', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `order_payments`
--

CREATE TABLE `order_payments` (
  `id` int NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Системный код способа оплаты',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Название (Наличные, Картой)',
  `icon` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Иконка (fa-money-bill, fa-credit-card)',
  `sort` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_payments`
--

INSERT INTO `order_payments` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `sort`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'cash', 'Наличные', 'fa-money-bill-wave', 1, 1, '2026-01-02 19:03:40', '2026-01-02 19:03:40'),
(2, 1, 1, 'card', 'Картой', 'fa-credit-card', 2, 1, '2026-01-02 19:03:40', '2026-01-02 19:03:40'),
(3, 1, 1, 'online', 'Онлайн', 'fa-globe', 3, 0, '2026-01-02 19:03:40', '2026-01-25 15:29:39');

-- --------------------------------------------------------

--
-- Структура таблицы `order_statuses`
--

CREATE TABLE `order_statuses` (
  `id` int UNSIGNED NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Системный код статуса',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Название в UI',
  `subtitle` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Подзаголовок/описание',
  `icon` varchar(50) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Иконка (FontAwesome key)',
  `color` varchar(30) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Ключ цвета (orange, yellow, blue...)',
  `sort` int DEFAULT '0' COMMENT 'Порядок отображения',
  `is_active` tinyint(1) DEFAULT '1' COMMENT 'Активен',
  `is_final` tinyint(1) DEFAULT '0' COMMENT 'Финальный статус',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  `id` int NOT NULL,
  `tenant_id` int DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'asap | at_time | on_date',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Как можно скорее | Ко времени | На дату',
  `description` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Подсказка для пользователя',
  `sort` int DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `starts_at` time DEFAULT NULL COMMENT 'Время начала интервала',
  `ends_at` time DEFAULT NULL COMMENT 'Время конца интервала',
  `step_minutes` int NOT NULL DEFAULT '30' COMMENT 'Шаг в минутах',
  `lead_minutes` int NOT NULL DEFAULT '0' COMMENT 'Запас времени на подготовку заказа',
  `has_time_window` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Включать ручные настройки времени'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `order_time_options`
--

INSERT INTO `order_time_options` (`id`, `tenant_id`, `store_id`, `code`, `title`, `description`, `sort`, `is_active`, `created_at`, `updated_at`, `starts_at`, `ends_at`, `step_minutes`, `lead_minutes`, `has_time_window`) VALUES
(1, 1, 1, 'asap', 'Быстрее', 'Начать выполнение сразу', 1, 1, '2026-01-02 19:07:20', '2026-01-28 08:04:12', '10:00:00', '22:00:00', 30, 60, 0),
(2, 1, 1, 'at_time', 'Ко времени', 'Приготовить к выбранному времени', 2, 1, '2026-01-02 19:07:20', '2026-01-27 13:12:38', '10:00:00', '20:00:00', 30, 60, 1),
(3, 1, 1, 'on_date', 'На дату', 'Приготовить на выбранную дату', 3, 1, '2026-01-02 19:07:20', '2026-01-28 05:11:48', '10:00:00', '20:00:00', 30, 60, 1);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_auto_add_groups`
--

CREATE TABLE `prod_auto_add_groups` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `min_cart_amount` decimal(10,2) DEFAULT NULL,
  `max_cart_amount` decimal(10,2) DEFAULT NULL,
  `include_auto_in_total` tinyint(1) NOT NULL DEFAULT '0',
  `max_items_qty` int UNSIGNED DEFAULT NULL,
  `allow_customer_qty` tinyint(1) NOT NULL DEFAULT '1',
  `allow_customer_remove` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_auto_add_groups`
--

INSERT INTO `prod_auto_add_groups` (`id`, `tenant_id`, `store_id`, `title`, `description`, `min_cart_amount`, `max_cart_amount`, `include_auto_in_total`, `max_items_qty`, `allow_customer_qty`, `allow_customer_remove`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'Приборы', NULL, 1.00, NULL, 1, NULL, 1, 1, 1, 0, '2026-01-29 18:25:55', '2026-01-30 05:14:26');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_auto_add_items`
--

CREATE TABLE `prod_auto_add_items` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `group_id` bigint UNSIGNED NOT NULL,
  `product_id` bigint UNSIGNED NOT NULL,
  `default_qty` int UNSIGNED NOT NULL DEFAULT '1',
  `min_qty` int UNSIGNED NOT NULL DEFAULT '1',
  `max_qty` int UNSIGNED DEFAULT NULL,
  `price_override` decimal(10,2) DEFAULT NULL,
  `free_first_qty` int UNSIGNED NOT NULL DEFAULT '0',
  `free_per_amount` decimal(10,2) DEFAULT NULL,
  `free_per_amount_qty` int UNSIGNED NOT NULL DEFAULT '1',
  `max_free_qty` int UNSIGNED DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_auto_add_items`
--

INSERT INTO `prod_auto_add_items` (`id`, `tenant_id`, `store_id`, `group_id`, `product_id`, `default_qty`, `min_qty`, `max_qty`, `price_override`, `free_first_qty`, `free_per_amount`, `free_per_amount_qty`, `max_free_qty`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(3, 1, 1, 1, 59, 1, 1, NULL, NULL, 1, 500.00, 1, NULL, 1, 0, '2026-01-30 05:07:19', '2026-01-30 16:24:55');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_categories`
--

CREATE TABLE `prod_categories` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `icon` varchar(128) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `site_visibility` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_categories`
--

INSERT INTO `prod_categories` (`id`, `tenant_id`, `store_id`, `code`, `title`, `icon`, `site_visibility`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 'all', 'Все товары', '/static/uploads/categories/6875982c13bfc85c5f048b152e9e610f.jpg', 1, 1, 0, '2026-01-03 07:37:51', '2026-01-09 12:27:23'),
(2, 1, 1, 'burgers', 'Салаты', NULL, 1, 1, 50, '2026-01-03 07:37:51', '2026-01-30 04:49:18'),
(3, 1, 1, 'drinks', 'Закуски', NULL, 1, 1, 60, '2026-01-03 07:37:51', '2026-01-30 04:49:18'),
(4, 1, 1, 'cat-mk239ojm', 'Горячее', NULL, 1, 1, 40, '2026-01-06 04:27:59', '2026-01-30 04:49:18'),
(5, 1, 1, 'cat-mk2a0iyv', 'Гарнир', NULL, 1, 1, 30, '2026-01-06 07:36:49', '2026-01-30 04:49:18'),
(6, 1, 1, 'cat-mk2nkp4p', 'Супы', NULL, 1, 1, 20, '2026-01-06 13:56:26', '2026-01-30 04:49:17'),
(7, 1, 1, 'cat-mk57sj5q', 'Вторые блюда', NULL, 1, 1, 10, '2026-01-08 08:57:56', '2026-01-30 04:49:17'),
(8, 1, 1, 'cat-mkgtrfi2', 'Продукты', NULL, 0, 1, 80, '2026-01-16 11:58:24', '2026-01-30 17:13:58'),
(9, 1, 1, 'cat-ml0f74l8', 'Упаковка', NULL, 0, 1, 90, '2026-01-30 05:06:05', '2026-01-30 17:13:54'),
(10, 1, 1, 'cat-ml1571gc', 'Полуфабрикаты', NULL, 1, 1, 70, '2026-01-30 17:13:50', '2026-01-30 17:13:57');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_assignments`
--

CREATE TABLE `prod_option_assignments` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `group_id` bigint UNSIGNED NOT NULL,
  `assign_type` enum('category','product') COLLATE utf8mb4_general_ci NOT NULL,
  `assign_id` bigint UNSIGNED NOT NULL,
  `priority` int NOT NULL DEFAULT '0',
  `sort_order` int NOT NULL DEFAULT '0',
  `out_of_stock_action` tinyint(1) NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `selection_type` enum('single','multiple') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'single',
  `min_select` int DEFAULT NULL,
  `max_select` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_assignments`
--

INSERT INTO `prod_option_assignments` (`id`, `tenant_id`, `store_id`, `group_id`, `assign_type`, `assign_id`, `priority`, `sort_order`, `out_of_stock_action`, `is_active`, `selection_type`, `min_select`, `max_select`, `created_at`, `updated_at`) VALUES
(119, 1, 1, 14, 'product', 21, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(120, 1, 1, 14, 'product', 22, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(121, 1, 1, 14, 'product', 12, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(122, 1, 1, 14, 'product', 23, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(123, 1, 1, 14, 'product', 6, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(124, 1, 1, 15, 'product', 25, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(125, 1, 1, 15, 'product', 30, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(126, 1, 1, 15, 'product', 26, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(127, 1, 1, 15, 'product', 27, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(128, 1, 1, 15, 'product', 13, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(129, 1, 1, 15, 'product', 31, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(130, 1, 1, 15, 'product', 4, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(131, 1, 1, 15, 'product', 24, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(132, 1, 1, 15, 'product', 28, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(133, 1, 1, 15, 'product', 7, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(135, 1, 1, 16, 'product', 40, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-31 00:45:06', '2026-01-31 00:45:06');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_exclusions`
--

CREATE TABLE `prod_option_exclusions` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `group_id` bigint UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_groups`
--

CREATE TABLE `prod_option_groups` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `title` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `selection_type` enum('single','multiple') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'single',
  `min_select` int UNSIGNED NOT NULL DEFAULT '0',
  `max_select` int UNSIGNED DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_required` tinyint(1) NOT NULL DEFAULT '1',
  `allow_variants` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Разрешить выбор вариантов для товаров-опций (0=нет, 1=да)',
  `out_of_stock_action` tinyint(1) NOT NULL DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_groups`
--

INSERT INTO `prod_option_groups` (`id`, `tenant_id`, `store_id`, `title`, `selection_type`, `min_select`, `max_select`, `is_active`, `sort_order`, `created_at`, `updated_at`, `is_required`, `allow_variants`, `out_of_stock_action`) VALUES
(14, 1, 1, 'Горячее', 'single', 0, NULL, 1, 0, '2026-01-30 08:22:11', '2026-01-30 08:22:11', 0, 1, 1),
(15, 1, 1, 'Гарнир', 'single', 0, NULL, 1, 0, '2026-01-30 08:22:31', '2026-01-30 08:22:31', 0, 1, 1),
(16, 1, 1, 'Добавки для жареной картошки', 'multiple', 0, NULL, 1, 0, '2026-01-31 00:45:05', '2026-01-31 00:46:04', 0, 0, 1);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_items`
--

CREATE TABLE `prod_option_items` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `group_id` bigint UNSIGNED NOT NULL,
  `title` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `description` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `target_type` enum('custom','product','category_pick') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'custom',
  `target_product_id` bigint UNSIGNED DEFAULT NULL,
  `target_category_id` bigint UNSIGNED DEFAULT NULL,
  `price_mode` enum('fixed','delta','from_target') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'delta',
  `price_value` decimal(10,2) DEFAULT '0.00',
  `qty_min` int UNSIGNED NOT NULL DEFAULT '0',
  `qty_max` int UNSIGNED NOT NULL DEFAULT '1',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_option_items`
--

INSERT INTO `prod_option_items` (`id`, `tenant_id`, `store_id`, `group_id`, `title`, `description`, `target_type`, `target_product_id`, `target_category_id`, `price_mode`, `price_value`, `qty_min`, `qty_max`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(79, 1, 1, 14, NULL, NULL, 'product', 25, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(80, 1, 1, 14, NULL, NULL, 'product', 30, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(81, 1, 1, 14, NULL, NULL, 'product', 26, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(82, 1, 1, 14, NULL, NULL, 'product', 27, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(83, 1, 1, 14, NULL, NULL, 'product', 13, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(84, 1, 1, 14, NULL, NULL, 'product', 31, NULL, 'from_target', 0.00, 1, 1, 1, 50, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(85, 1, 1, 14, NULL, NULL, 'product', 4, NULL, 'from_target', 0.00, 1, 1, 1, 60, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(86, 1, 1, 14, NULL, NULL, 'product', 24, NULL, 'from_target', 0.00, 1, 1, 1, 70, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(87, 1, 1, 14, NULL, NULL, 'product', 28, NULL, 'from_target', 0.00, 1, 1, 1, 80, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(88, 1, 1, 14, NULL, NULL, 'product', 7, NULL, 'from_target', 0.00, 1, 1, 1, 90, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(90, 1, 1, 15, NULL, NULL, 'product', 21, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(91, 1, 1, 15, NULL, NULL, 'product', 22, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(92, 1, 1, 15, NULL, NULL, 'product', 12, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(93, 1, 1, 15, NULL, NULL, 'product', 23, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(94, 1, 1, 15, NULL, NULL, 'product', 6, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(95, 1, 1, 16, NULL, NULL, 'product', 68, NULL, 'fixed', 30.00, 1, 1, 1, 0, '2026-01-31 00:45:05', '2026-01-31 00:45:05'),
(96, 1, 1, 16, NULL, NULL, 'product', 65, NULL, 'fixed', 30.00, 1, 1, 1, 10, '2026-01-31 00:45:05', '2026-01-31 00:45:05'),
(97, 1, 1, 16, NULL, NULL, 'product', 66, NULL, 'fixed', 80.00, 1, 1, 1, 20, '2026-01-31 00:45:05', '2026-01-31 00:45:05');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_overrides`
--

CREATE TABLE `prod_option_overrides` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `group_id` bigint UNSIGNED NOT NULL,
  `min_select` int UNSIGNED DEFAULT NULL,
  `max_select` int UNSIGNED DEFAULT NULL,
  `selection_type` enum('single','multiple') COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sort_order` int DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_products`
--

CREATE TABLE `prod_products` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sku` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description_short` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(12,2) NOT NULL DEFAULT '0.00',
  `old_price` decimal(12,2) DEFAULT NULL,
  `cost_price` decimal(12,2) DEFAULT NULL,
  `unit_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Единица измерения товара',
  `photos_json` text COLLATE utf8mb4_unicode_ci,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `site_visibility` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `base_unit_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Базовая единица измерения',
  `base_qty` decimal(12,3) DEFAULT NULL COMMENT 'Количество базовой единицы для цены'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_products`
--

INSERT INTO `prod_products` (`id`, `tenant_id`, `store_id`, `name`, `sku`, `description_short`, `description`, `price`, `old_price`, `cost_price`, `unit_id`, `photos_json`, `is_active`, `site_visibility`, `created_at`, `updated_at`, `base_unit_id`, `base_qty`) VALUES
(3, 1, 1, 'Пюре с сосисками', NULL, NULL, NULL, 398.00, NULL, 23.75, 6, '[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"]', 1, 1, '2026-01-05 15:54:34', '2026-01-30 16:22:53', 6, NULL),
(4, 1, 1, 'Рыбная котлета', NULL, NULL, NULL, 149.00, 179.00, 0.00, NULL, '[\"/static/uploads/products/1/446502b1bce3809a4303e8c7f4345d51.jpg\"]', 1, 0, '2026-01-06 04:28:49', '2026-01-31 01:04:54', NULL, NULL),
(6, 1, 1, 'Рис с овощами', NULL, NULL, NULL, 800.00, 179.00, 0.00, 2, '[\"/static/uploads/products/1/b7d5215763b1e8b3a3a05564c83352f0.jpg\"]', 1, 1, '2026-01-06 07:37:17', '2026-01-30 16:23:20', 2, NULL),
(7, 1, 1, 'Тефтели с рисом', NULL, NULL, NULL, 89.00, 999.00, 0.00, 1, '[\"/static/uploads/products/1/09c238e8cea082a8ce2a57359b649b7d.jpg\"]', 1, 1, '2026-01-06 13:56:46', '2026-01-30 16:23:36', 1, NULL),
(8, 1, 1, 'Макароны с тефтелями', NULL, NULL, NULL, 328.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/d47962e1e258c2369161a1c86ccf0e3b.jpg\"]', 1, 1, '2026-01-08 03:44:37', '2026-01-31 02:14:53', 6, NULL),
(9, 1, 1, 'Макароны с печенью', NULL, NULL, NULL, 456.00, 678.00, 0.00, NULL, '[\"/static/uploads/products/1/59e45a1798151b95d447fad186c77ff0.jpg\"]', 1, 0, '2026-01-08 03:45:00', '2026-01-31 01:03:37', NULL, NULL),
(10, 1, 1, 'Котлета с пюрешкой', NULL, '', '', 299.00, 319.00, NULL, NULL, '[\"/static/uploads/products/1/48df187f637a1df0f3e763d1191989d8.jpg\"]', 0, 0, '2026-01-08 08:58:27', '2026-01-30 17:06:00', NULL, NULL),
(11, 1, 1, 'Фрикадельки с пюрешкой', NULL, '', '', 599.00, 768.00, 100.00, 6, '[\"/static/uploads/products/1/c7ee582d4fddf82778bdf23b8ab25754.jpg\"]', 0, 0, '2026-01-08 08:58:54', '2026-01-30 17:05:58', 6, NULL),
(12, 1, 1, 'Картофельное пюре', NULL, NULL, NULL, 199.00, NULL, 95.00, 3, '[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"]', 1, 1, '2026-01-16 10:32:24', '2026-01-30 04:38:54', 3, 250.000),
(13, 1, 1, 'Куринная котлета', NULL, NULL, NULL, 149.00, NULL, 48.00, 1, '[\"/static/uploads/products/1/fe6e72ac1ce743c145b235225287a820.webp\"]', 1, 1, '2026-01-16 10:33:13', '2026-01-30 03:41:48', 1, NULL),
(14, 1, 1, 'Пюре с куриной котлетой', NULL, NULL, NULL, 270.00, NULL, 62.25, 6, '[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"]', 1, 1, '2026-01-16 10:34:30', '2026-01-18 08:51:25', 6, NULL),
(15, 1, 1, 'Картофель', NULL, NULL, NULL, 0.00, NULL, 100.00, 2, '[\"/static/uploads/products/1/6ec0482c5b64bc892b95d4d799d278b3.webp\"]', 1, 0, '2026-01-16 11:58:13', '2026-01-30 17:28:37', 2, 1.000),
(16, 1, 1, 'Масло сливочное', NULL, NULL, NULL, 0.00, NULL, 600.00, 2, '[\"/static/uploads/products/1/fd170c1d0a9402b11b304e7090e1ee7c.webp\"]', 1, 0, '2026-01-16 12:01:19', '2026-01-30 17:17:08', 2, 1.000),
(17, 1, 1, 'Молоко', NULL, NULL, NULL, 0.00, NULL, 100.00, 2, '[\"/static/uploads/products/1/6e18cdc9e15ef0c2622e9a619b1c3725.webp\"]', 1, 0, '2026-01-16 12:02:03', '2026-01-18 06:32:52', 2, NULL),
(19, 1, 1, 'Соль', NULL, NULL, NULL, 0.00, NULL, 100.00, 2, NULL, 1, 0, '2026-01-18 06:44:53', '2026-01-18 14:10:17', 2, 1.000),
(20, 1, 1, 'Фарш куринный', NULL, NULL, NULL, 0.00, NULL, 400.00, 2, NULL, 1, 0, '2026-01-18 06:57:10', '2026-01-18 14:10:29', 2, NULL),
(21, 1, 1, 'Гречка с овощами', NULL, NULL, NULL, 89.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/ccbfd8c94a01992063130008a89452ca.webp\"]', 1, 1, '2026-01-19 18:06:45', '2026-01-30 04:05:41', 3, 150.000),
(22, 1, 1, 'Капуста тушеная', NULL, NULL, NULL, 600.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/a754a7149715face9e71daac3d651b59.webp\"]', 1, 1, '2026-01-30 03:38:43', '2026-01-30 03:38:43', 2, NULL),
(23, 1, 1, 'Макароны', NULL, NULL, NULL, 600.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/88477d849f60e18b430295f8e12b1061.webp\"]', 1, 1, '2026-01-30 03:39:10', '2026-01-30 03:39:10', 2, NULL),
(24, 1, 1, 'Рыбная котлета из минтая', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b57692ae543dfefaef1ff04d093746c7.jfif\"]', 1, 1, '2026-01-30 03:40:14', '2026-01-30 03:40:14', 1, NULL),
(25, 1, 1, 'Баварская колбаска', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/387546b338d9cb3fbf5adda71fa61519.webp\"]', 1, 1, '2026-01-30 03:41:09', '2026-01-30 03:41:09', 1, NULL),
(26, 1, 1, 'Котлета по-домашнему', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/e3a21ea69d96f7637126a0d427e6e7b7.webp\"]', 1, 1, '2026-01-30 03:42:24', '2026-01-30 03:42:24', 1, NULL),
(27, 1, 1, 'Котлета по-киевски', NULL, NULL, NULL, 249.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/bf6db8b58873e88c6a06615686aeabfa.png\"]', 1, 1, '2026-01-30 03:42:52', '2026-01-30 03:42:52', 1, NULL),
(28, 1, 1, 'Сосиски жареные', NULL, NULL, NULL, 99.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/fb8fa795484d8d02002ca0295c2cfa3a.webp\"]', 1, 1, '2026-01-30 03:43:12', '2026-01-30 03:43:12', 1, NULL),
(29, 1, 1, 'Яичница', NULL, NULL, NULL, 148.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/21cf271eb4118f623ca344c23a8208b0.png\"]', 1, 1, '2026-01-30 03:43:48', '2026-01-31 01:08:24', 6, 1.000),
(30, 1, 1, 'Гуляш по-домашнему', NULL, NULL, NULL, 1700.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/fb107bf5f71465962515485460bd1f54.jpg\"]', 1, 1, '2026-01-30 03:44:31', '2026-01-30 03:44:31', 2, NULL),
(31, 1, 1, 'Куринная отбивная под грибами и сыром', NULL, NULL, NULL, 299.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b1ad1993f478652c9cf4c5b666628506.jpg\"]', 1, 1, '2026-01-30 03:45:02', '2026-01-30 03:45:02', 1, NULL),
(32, 1, 1, 'С фасолью и колбасой', NULL, NULL, NULL, 1250.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/a671cb2deb671b500456cef6dc1b842b.jpg\"]', 1, 1, '2026-01-30 03:46:09', '2026-01-30 03:46:09', 2, NULL),
(33, 1, 1, 'Сельдь под шубой', NULL, NULL, NULL, 249.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/081b9b17d7ada6c7f05bee5b4cb88acd.jpg\"]', 1, 1, '2026-01-30 03:46:45', '2026-01-30 03:46:45', 1, NULL),
(34, 1, 1, 'Капуста с морковью', NULL, NULL, NULL, 1000.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/3ef69553bf0a38d941634905d3dff105.webp\"]', 1, 1, '2026-01-30 03:47:13', '2026-01-30 03:47:13', 2, NULL),
(35, 1, 1, 'Цезарь с креветкой', NULL, NULL, NULL, 299.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b71c731e70cb2f94b121626a77885936.jpg\"]', 1, 1, '2026-01-30 03:47:38', '2026-01-30 03:47:38', 1, NULL),
(36, 1, 1, 'Цезарь с курицей', NULL, NULL, NULL, 249.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/9decb5d87640438c04a911b98bba274c.webp\"]', 1, 1, '2026-01-30 03:47:56', '2026-01-30 03:47:56', 1, NULL),
(37, 1, 1, 'Солянка мясная сборная', NULL, NULL, NULL, 249.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\"]', 1, 1, '2026-01-30 03:49:20', '2026-01-30 06:40:50', 3, 350.000),
(38, 1, 1, 'Гороховый с копченостями', NULL, NULL, NULL, 249.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"]', 1, 1, '2026-01-30 03:49:52', '2026-01-30 06:41:05', 3, 350.000),
(39, 1, 1, 'Тефтели с пюре', NULL, NULL, NULL, 378.00, NULL, 23.75, 6, '[\"/static/uploads/products/1/97f3015b45f4aad749bb4bae10190c93.jpg\"]', 1, 1, '2026-01-30 03:54:41', '2026-01-30 04:14:01', 6, NULL),
(40, 1, 1, 'Жареная картошка', NULL, NULL, NULL, 279.00, NULL, 48.79, 3, '[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"]', 1, 1, '2026-01-30 03:55:41', '2026-01-31 02:44:23', 3, 250.000),
(41, 1, 1, 'Котлета по-домашнемй с гречкой', NULL, NULL, NULL, 374.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"]', 1, 1, '2026-01-30 04:03:38', '2026-01-30 04:03:38', 6, NULL),
(42, 1, 1, 'Баварская колбаска с гречкой', NULL, NULL, NULL, 238.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\"]', 1, 1, '2026-01-30 04:07:21', '2026-01-30 04:07:21', 6, NULL),
(43, 1, 1, 'Котлета по-киевски с пюре', NULL, NULL, NULL, 449.00, NULL, 23.75, 6, '[\"/static/uploads/products/1/09cd5b0d1aed7a48097d4dc409448df0.png\"]', 1, 1, '2026-01-30 04:08:36', '2026-01-30 04:13:25', 6, NULL),
(44, 1, 1, 'Сосиски с пюре', NULL, NULL, NULL, 398.00, NULL, 23.75, 6, '[\"/static/uploads/products/1/768d3eb176242147482721b65ee6b822.png\"]', 1, 1, '2026-01-30 04:09:24', '2026-01-30 04:13:00', 6, NULL),
(45, 1, 1, 'Сосиски с гречкой', NULL, NULL, NULL, 346.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/d7ae63615faac2fb6fa3581f243a4813.png\"]', 1, 1, '2026-01-30 04:10:23', '2026-01-30 04:12:29', 6, NULL),
(46, 1, 1, 'Котлета по-киевски с гречкой', NULL, NULL, NULL, 397.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/dbdaec8d6696e654a6d6abdf7408e089.png\"]', 1, 1, '2026-01-30 04:11:50', '2026-01-30 04:11:50', 6, NULL),
(47, 1, 1, 'Вареники с картошкой', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/bfc21614af87135437c0610179da3978.jpg\"]', 1, 1, '2026-01-30 04:15:13', '2026-01-31 00:54:34', 1, NULL),
(48, 1, 1, 'Гуляш с гречкой', NULL, NULL, NULL, 284.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/428a06fdcda49526849c7850e7b8b3d0.jpg\"]', 1, 1, '2026-01-30 04:17:25', '2026-01-30 04:17:25', 6, NULL),
(49, 1, 1, 'Сосиски с макаронами', NULL, NULL, NULL, 348.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/a9de0b28320bebd41869cfba80a52580.jpg\"]', 1, 1, '2026-01-30 04:18:29', '2026-01-30 04:18:47', 6, NULL),
(50, 1, 1, 'Котлета по-домашнему с макаронами', NULL, NULL, NULL, 299.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/29016460b03c5583754ab1c4e0cf17b3.jpg\"]', 1, 1, '2026-01-30 04:19:40', '2026-01-30 04:19:40', 1, NULL),
(51, 1, 1, 'Куриная отбивная под грибами и сыром с пюре', NULL, NULL, NULL, 499.00, NULL, 23.75, 6, '[\"/static/uploads/products/1/2cb08d751796be51255796d4e3bcd314.webp\"]', 1, 1, '2026-01-30 04:20:59', '2026-01-30 04:20:59', 6, NULL),
(52, 1, 1, 'Картофельная запеканка', NULL, NULL, NULL, 299.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/0a4cf805e0a90b6fdec73539e1104d7c.jpg\"]', 1, 1, '2026-01-30 04:21:29', '2026-01-30 04:21:29', 6, NULL),
(53, 1, 1, 'Блины', NULL, NULL, NULL, 49.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/c0c9947e944f3029a3430b9c00685d0f.png\"]', 1, 1, '2026-01-30 04:44:16', '2026-01-31 00:56:51', 1, 1.000),
(54, 1, 1, 'Драники', NULL, NULL, NULL, 74.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b88188e14c42f2d2490a7058d9b9b281.webp\"]', 1, 1, '2026-01-30 04:44:45', '2026-01-31 00:57:27', 1, 1.000),
(55, 1, 1, 'Картофель фри', NULL, NULL, NULL, 112.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/1282e197cceeacfc88d3fd20a1f45f47.webp\"]', 1, 1, '2026-01-30 04:45:49', '2026-01-31 00:59:33', 3, 100.000),
(56, 1, 1, 'Картофель по-деревенски', NULL, NULL, NULL, 133.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/d375080a4e6492a8a12e92d636e75840.jpg\"]', 1, 1, '2026-01-30 04:46:10', '2026-01-31 00:59:19', 3, 100.000),
(57, 1, 1, 'Сухарики', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/55202e6f48fdedcbb0157c92b0ee0e2f.webp\"]', 1, 1, '2026-01-30 04:46:40', '2026-01-30 04:46:40', 1, NULL),
(58, 1, 1, 'Пампушка', NULL, NULL, NULL, 20.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/43a3491f4c955849c818ddfb71178a65.webp\"]', 1, 1, '2026-01-30 04:46:53', '2026-01-30 04:46:53', 1, NULL),
(59, 1, 1, 'Приборы', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]', 1, 1, '2026-01-30 05:06:15', '2026-01-30 09:06:46', 1, NULL),
(60, 1, 1, 'Рисовая каша', NULL, NULL, NULL, 147.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/153c88657fdd858ab5860be0b0234402.png\"]', 1, 1, '2026-01-30 17:00:24', '2026-01-31 01:02:17', 3, 250.000),
(61, 1, 1, 'Форель жаренная с рисом', NULL, NULL, NULL, 0.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/d53b0401773c632303b94943e227534e.jpg\"]', 1, 0, '2026-01-30 17:00:57', '2026-01-31 01:01:34', 6, NULL),
(62, 1, 1, 'Пельмени с курицей', NULL, NULL, NULL, 18.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/d3b6ac736bb3667dd303ab87e9b72071.png\"]', 1, 1, '2026-01-30 17:01:36', '2026-01-31 00:54:15', 1, 1.000),
(63, 1, 1, 'Минтай в кляре с рисом', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/d606e6871abdb2754aa6c0cf1759a027.jpg\"]', 1, 0, '2026-01-30 17:02:03', '2026-01-31 01:01:26', 1, NULL),
(64, 1, 1, 'Оливье с колбасой', NULL, NULL, NULL, 0.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/7cdb7d669231e38b2b889176d5534b45.jpg\"]', 1, 1, '2026-01-30 17:02:46', '2026-01-30 17:02:46', 6, NULL),
(65, 1, 1, 'Лук репчатый', NULL, NULL, NULL, 0.00, NULL, 50.00, 2, '[\"/static/uploads/products/1/1d35cdbc0dea217811e93d312175a2de.webp\"]', 1, 1, '2026-01-30 17:12:34', '2026-01-30 17:12:34', 2, 1.000),
(66, 1, 1, 'Шампиньоны', NULL, NULL, NULL, 0.00, NULL, 500.00, 2, '[\"/static/uploads/products/1/4146751d5654eab88f6cfad823346d4a.webp\"]', 1, 1, '2026-01-30 17:13:30', '2026-01-30 17:13:30', 2, 1.000),
(67, 1, 1, 'Зелень', NULL, NULL, NULL, 0.00, NULL, 1500.00, 2, '[\"/static/uploads/products/1/2dd88004253216016208e1d5ea1b1ff3.webp\"]', 1, 1, '2026-01-30 17:14:51', '2026-01-30 17:14:51', 2, 1.000),
(68, 1, 1, 'Масло с зеленью', NULL, NULL, NULL, 0.00, NULL, 153.00, 2, '[\"/static/uploads/products/1/7cac7ff81b39af1fa25c315f67035240.jfif\"]', 1, 1, '2026-01-30 17:17:37', '2026-01-30 17:29:30', 2, 0.210),
(69, 1, 1, 'Масло с зеленью', NULL, NULL, NULL, 0.00, NULL, 81.00, 1, '[\"/static/uploads/products/1/83a34b7b52298ef41ad403008058aced.jfif\"]', 0, 0, '2026-01-30 17:26:58', '2026-01-30 17:27:13', 1, NULL),
(70, 1, 1, 'Яйцо жареное', NULL, NULL, NULL, 49.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/f51ecac79400f6c268f47cc1a62c3a45.webp\"]', 1, 1, '2026-01-31 01:06:51', '2026-01-31 01:06:51', 1, NULL);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_categories`
--

CREATE TABLE `prod_product_categories` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `category_id` bigint UNSIGNED NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_product_categories`
--

INSERT INTO `prod_product_categories` (`id`, `tenant_id`, `store_id`, `product_id`, `category_id`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 1, 30, '2026-01-03 10:03:50', '2026-01-17 11:06:00'),
(3, 1, 1, 1, 2, 10, '2026-01-03 11:03:56', '2026-01-03 11:03:56'),
(5, 1, 1, 2, 1, 40, '2026-01-03 12:54:21', '2026-01-17 11:06:00'),
(17, 1, 1, 3, 1, 50, '2026-01-05 15:54:34', '2026-01-17 11:05:57'),
(19, 1, 1, 4, 1, 60, '2026-01-06 04:28:49', '2026-01-17 11:05:57'),
(20, 1, 1, 4, 4, 0, '2026-01-06 04:28:49', '2026-01-17 13:30:29'),
(21, 1, 1, 5, 1, 70, '2026-01-06 04:35:32', '2026-01-17 11:05:57'),
(22, 1, 1, 5, 3, 20, '2026-01-06 04:35:32', '2026-01-06 04:35:32'),
(23, 1, 1, 6, 1, 80, '2026-01-06 07:37:17', '2026-01-17 11:05:57'),
(25, 1, 1, 7, 1, 90, '2026-01-06 13:56:46', '2026-01-17 11:05:57'),
(27, 1, 1, 8, 1, 100, '2026-01-08 03:44:37', '2026-01-17 11:05:57'),
(29, 1, 1, 9, 1, 110, '2026-01-08 03:45:00', '2026-01-17 11:05:53'),
(40, 1, 1, 10, 1, 120, '2026-01-08 08:58:27', '2026-01-17 11:05:53'),
(41, 1, 1, 10, 7, 0, '2026-01-08 08:58:27', '2026-01-10 06:49:08'),
(42, 1, 1, 11, 1, 130, '2026-01-08 08:58:54', '2026-01-17 11:05:53'),
(43, 1, 1, 11, 7, 10, '2026-01-08 08:58:54', '2026-01-10 06:49:08'),
(44, 1, 1, 3, 7, 0, '2026-01-08 08:59:50', '2026-01-30 17:03:40'),
(48, 1, 1, 1, 7, 30, '2026-01-10 06:59:14', '2026-01-10 06:59:14'),
(51, 1, 1, 9, 7, 10, '2026-01-11 05:12:04', '2026-01-30 17:03:40'),
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
(601, 1, 1, 14, 7, 20, '2026-01-19 14:51:00', '2026-01-30 17:03:40'),
(638, 1, 1, 21, 1, 180, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(639, 1, 1, 21, 5, 20, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(640, 1, 1, 13, 4, 10, '2026-01-19 18:07:23', '2026-01-19 18:07:23'),
(641, 1, 1, 7, 4, 20, '2026-01-19 18:08:00', '2026-01-19 18:08:00'),
(642, 1, 1, 22, 1, 190, '2026-01-30 03:38:43', '2026-01-30 03:38:43'),
(643, 1, 1, 22, 5, 30, '2026-01-30 03:38:43', '2026-01-30 03:38:43'),
(644, 1, 1, 23, 1, 200, '2026-01-30 03:39:11', '2026-01-30 03:39:11'),
(645, 1, 1, 23, 5, 40, '2026-01-30 03:39:11', '2026-01-30 03:39:11'),
(646, 1, 1, 24, 1, 210, '2026-01-30 03:40:14', '2026-01-30 03:40:14'),
(647, 1, 1, 24, 4, 30, '2026-01-30 03:40:14', '2026-01-30 03:40:14'),
(648, 1, 1, 25, 1, 220, '2026-01-30 03:41:10', '2026-01-30 03:41:10'),
(649, 1, 1, 25, 4, 40, '2026-01-30 03:41:10', '2026-01-30 03:41:10'),
(650, 1, 1, 26, 1, 230, '2026-01-30 03:42:25', '2026-01-30 03:42:25'),
(651, 1, 1, 26, 4, 50, '2026-01-30 03:42:25', '2026-01-30 03:42:25'),
(652, 1, 1, 27, 1, 240, '2026-01-30 03:42:52', '2026-01-30 03:42:52'),
(653, 1, 1, 27, 4, 60, '2026-01-30 03:42:52', '2026-01-30 03:42:52'),
(654, 1, 1, 28, 1, 250, '2026-01-30 03:43:12', '2026-01-30 03:43:12'),
(655, 1, 1, 28, 4, 70, '2026-01-30 03:43:12', '2026-01-30 03:43:12'),
(656, 1, 1, 29, 1, 260, '2026-01-30 03:43:49', '2026-01-30 03:43:49'),
(658, 1, 1, 30, 1, 270, '2026-01-30 03:44:31', '2026-01-30 03:44:31'),
(659, 1, 1, 30, 4, 90, '2026-01-30 03:44:31', '2026-01-30 03:44:31'),
(660, 1, 1, 31, 1, 280, '2026-01-30 03:45:03', '2026-01-30 03:45:03'),
(661, 1, 1, 31, 4, 100, '2026-01-30 03:45:03', '2026-01-30 03:45:03'),
(662, 1, 1, 32, 1, 290, '2026-01-30 03:46:10', '2026-01-30 03:46:10'),
(663, 1, 1, 32, 2, 20, '2026-01-30 03:46:10', '2026-01-30 03:46:10'),
(664, 1, 1, 33, 1, 300, '2026-01-30 03:46:46', '2026-01-30 03:46:46'),
(665, 1, 1, 33, 2, 30, '2026-01-30 03:46:46', '2026-01-30 03:46:46'),
(666, 1, 1, 34, 1, 310, '2026-01-30 03:47:13', '2026-01-30 03:47:13'),
(667, 1, 1, 34, 2, 40, '2026-01-30 03:47:13', '2026-01-30 03:47:13'),
(668, 1, 1, 35, 1, 320, '2026-01-30 03:47:39', '2026-01-30 03:47:39'),
(669, 1, 1, 35, 2, 50, '2026-01-30 03:47:39', '2026-01-30 03:47:39'),
(670, 1, 1, 36, 1, 330, '2026-01-30 03:47:56', '2026-01-30 03:47:56'),
(671, 1, 1, 36, 2, 60, '2026-01-30 03:47:56', '2026-01-30 03:47:56'),
(672, 1, 1, 8, 7, 30, '2026-01-30 03:48:39', '2026-01-30 17:03:40'),
(673, 1, 1, 37, 1, 340, '2026-01-30 03:49:20', '2026-01-30 03:49:20'),
(674, 1, 1, 37, 6, 10, '2026-01-30 03:49:20', '2026-01-30 03:49:20'),
(675, 1, 1, 38, 1, 350, '2026-01-30 03:49:52', '2026-01-30 03:49:52'),
(676, 1, 1, 38, 6, 20, '2026-01-30 03:49:52', '2026-01-30 03:49:52'),
(677, 1, 1, 39, 1, 360, '2026-01-30 03:54:41', '2026-01-30 03:54:41'),
(678, 1, 1, 39, 7, 40, '2026-01-30 03:54:42', '2026-01-30 17:03:40'),
(679, 1, 1, 40, 1, 370, '2026-01-30 03:55:42', '2026-01-30 03:55:42'),
(680, 1, 1, 40, 7, 50, '2026-01-30 03:55:42', '2026-01-30 17:03:40'),
(681, 1, 1, 41, 1, 380, '2026-01-30 04:03:38', '2026-01-30 04:03:38'),
(682, 1, 1, 41, 7, 60, '2026-01-30 04:03:39', '2026-01-30 17:03:40'),
(683, 1, 1, 42, 1, 390, '2026-01-30 04:07:22', '2026-01-30 04:07:22'),
(684, 1, 1, 42, 7, 70, '2026-01-30 04:07:22', '2026-01-30 17:03:40'),
(685, 1, 1, 43, 1, 400, '2026-01-30 04:08:37', '2026-01-30 04:08:37'),
(686, 1, 1, 43, 7, 80, '2026-01-30 04:08:37', '2026-01-30 17:03:41'),
(687, 1, 1, 44, 1, 410, '2026-01-30 04:09:25', '2026-01-30 04:09:25'),
(688, 1, 1, 44, 7, 100, '2026-01-30 04:09:25', '2026-01-31 01:12:01'),
(689, 1, 1, 45, 1, 420, '2026-01-30 04:10:23', '2026-01-30 04:10:23'),
(690, 1, 1, 45, 7, 110, '2026-01-30 04:10:23', '2026-01-31 01:12:01'),
(691, 1, 1, 46, 1, 430, '2026-01-30 04:11:50', '2026-01-30 04:11:50'),
(692, 1, 1, 46, 7, 120, '2026-01-30 04:11:50', '2026-01-31 01:12:01'),
(693, 1, 1, 47, 1, 440, '2026-01-30 04:15:13', '2026-01-30 04:15:13'),
(694, 1, 1, 47, 7, 130, '2026-01-30 04:15:14', '2026-01-31 01:12:01'),
(695, 1, 1, 48, 1, 450, '2026-01-30 04:17:26', '2026-01-30 04:17:26'),
(696, 1, 1, 48, 7, 150, '2026-01-30 04:17:26', '2026-01-31 01:12:01'),
(697, 1, 1, 49, 1, 460, '2026-01-30 04:18:29', '2026-01-30 04:18:29'),
(698, 1, 1, 49, 7, 160, '2026-01-30 04:18:29', '2026-01-31 01:12:01'),
(699, 1, 1, 50, 1, 470, '2026-01-30 04:19:40', '2026-01-30 04:19:40'),
(700, 1, 1, 50, 7, 170, '2026-01-30 04:19:41', '2026-01-31 01:12:01'),
(701, 1, 1, 51, 1, 480, '2026-01-30 04:20:59', '2026-01-30 04:20:59'),
(702, 1, 1, 51, 7, 180, '2026-01-30 04:20:59', '2026-01-31 01:11:58'),
(703, 1, 1, 52, 1, 490, '2026-01-30 04:21:29', '2026-01-30 04:21:29'),
(704, 1, 1, 52, 7, 190, '2026-01-30 04:21:29', '2026-01-31 01:11:58'),
(710, 1, 1, 53, 1, 500, '2026-01-30 04:44:16', '2026-01-30 04:44:16'),
(711, 1, 1, 53, 7, 200, '2026-01-30 04:44:16', '2026-01-31 01:11:58'),
(712, 1, 1, 54, 1, 510, '2026-01-30 04:44:45', '2026-01-30 04:44:45'),
(714, 1, 1, 55, 1, 520, '2026-01-30 04:45:49', '2026-01-30 04:45:49'),
(715, 1, 1, 55, 3, 30, '2026-01-30 04:45:49', '2026-01-30 04:45:49'),
(716, 1, 1, 56, 1, 530, '2026-01-30 04:46:11', '2026-01-30 04:46:11'),
(717, 1, 1, 56, 3, 40, '2026-01-30 04:46:11', '2026-01-30 04:46:11'),
(718, 1, 1, 57, 1, 540, '2026-01-30 04:46:41', '2026-01-30 04:46:41'),
(719, 1, 1, 57, 3, 50, '2026-01-30 04:46:41', '2026-01-30 04:46:41'),
(720, 1, 1, 58, 1, 550, '2026-01-30 04:46:53', '2026-01-30 04:46:53'),
(721, 1, 1, 58, 3, 60, '2026-01-30 04:46:54', '2026-01-30 04:46:54'),
(722, 1, 1, 59, 1, 560, '2026-01-30 05:06:15', '2026-01-30 05:06:15'),
(723, 1, 1, 59, 9, 10, '2026-01-30 05:06:15', '2026-01-30 05:06:15'),
(724, 1, 1, 60, 1, 570, '2026-01-30 17:00:24', '2026-01-30 17:00:24'),
(725, 1, 1, 60, 7, 210, '2026-01-30 17:00:24', '2026-01-31 01:11:59'),
(726, 1, 1, 61, 1, 580, '2026-01-30 17:00:57', '2026-01-30 17:00:57'),
(727, 1, 1, 61, 7, 220, '2026-01-30 17:00:57', '2026-01-31 01:11:59'),
(728, 1, 1, 62, 1, 590, '2026-01-30 17:01:36', '2026-01-30 17:01:36'),
(729, 1, 1, 62, 7, 140, '2026-01-30 17:01:36', '2026-01-31 01:12:01'),
(730, 1, 1, 63, 1, 600, '2026-01-30 17:02:03', '2026-01-30 17:02:03'),
(731, 1, 1, 63, 7, 230, '2026-01-30 17:02:03', '2026-01-31 01:11:59'),
(732, 1, 1, 64, 1, 610, '2026-01-30 17:02:46', '2026-01-30 17:02:46'),
(759, 1, 1, 64, 2, 70, '2026-01-30 17:03:52', '2026-01-30 17:03:52'),
(760, 1, 1, 54, 3, 70, '2026-01-30 17:04:06', '2026-01-30 17:04:06'),
(761, 1, 1, 65, 1, 620, '2026-01-30 17:12:34', '2026-01-30 17:12:34'),
(762, 1, 1, 65, 8, 50, '2026-01-30 17:12:34', '2026-01-30 17:12:34'),
(763, 1, 1, 66, 1, 630, '2026-01-30 17:13:30', '2026-01-30 17:13:30'),
(764, 1, 1, 66, 8, 60, '2026-01-30 17:13:31', '2026-01-30 17:13:31'),
(765, 1, 1, 67, 1, 640, '2026-01-30 17:14:52', '2026-01-30 17:14:52'),
(766, 1, 1, 67, 8, 70, '2026-01-30 17:14:52', '2026-01-30 17:14:52'),
(767, 1, 1, 68, 1, 650, '2026-01-30 17:17:37', '2026-01-30 17:17:37'),
(768, 1, 1, 68, 10, 10, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(769, 1, 1, 69, 1, 660, '2026-01-30 17:26:58', '2026-01-30 17:26:58'),
(770, 1, 1, 69, 10, 20, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(840, 1, 1, 70, 1, 670, '2026-01-31 01:06:52', '2026-01-31 01:06:52'),
(841, 1, 1, 70, 10, 30, '2026-01-31 01:06:52', '2026-01-31 01:06:52'),
(842, 1, 1, 29, 7, 90, '2026-01-31 01:10:44', '2026-01-31 01:12:01');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_ingredients`
--

CREATE TABLE `prod_product_ingredients` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL COMMENT 'Товар, который состоит из ингредиентов',
  `ingredient_id` bigint UNSIGNED NOT NULL COMMENT 'Товар-ингредиент',
  `quantity` decimal(10,3) NOT NULL DEFAULT '1.000' COMMENT 'Базовое/начальное количество',
  `unit_id` bigint UNSIGNED NOT NULL COMMENT 'Единица измерения',
  `quantity_min` decimal(10,3) DEFAULT NULL COMMENT 'Минимальное количество (NULL = фиксированное)',
  `quantity_max` decimal(10,3) DEFAULT NULL COMMENT 'Максимальное количество',
  `quantity_step` decimal(10,3) DEFAULT NULL COMMENT 'Шаг изменения количества',
  `price_override` decimal(12,2) DEFAULT NULL COMMENT 'Переопределение цены (NULL = из каталога)',
  `is_variable` tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Изменяемый состав для клиента (1=да, 0=нет)',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_product_ingredients`
--

INSERT INTO `prod_product_ingredients` (`id`, `tenant_id`, `store_id`, `product_id`, `ingredient_id`, `quantity`, `unit_id`, `quantity_min`, `quantity_max`, `quantity_step`, `price_override`, `is_variable`, `sort_order`, `created_at`, `updated_at`) VALUES
(5, 1, 1, 12, 15, 1.000, 2, NULL, NULL, NULL, NULL, 0, 10, '2026-01-16 12:57:50', '2026-01-18 06:33:31'),
(12, 1, 1, 14, 12, 150.000, 3, 150.000, 350.000, 50.000, NULL, 1, 10, '2026-01-17 11:08:20', '2026-01-18 12:10:58'),
(13, 1, 1, 14, 13, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-17 11:08:20', '2026-01-17 11:09:30'),
(16, 1, 1, 12, 17, 300.000, 3, NULL, NULL, NULL, NULL, 0, 20, '2026-01-18 06:33:31', '2026-01-18 06:45:41'),
(17, 1, 1, 12, 16, 100.000, 3, NULL, NULL, NULL, NULL, 0, 30, '2026-01-18 06:33:31', '2026-01-18 06:45:41'),
(18, 1, 1, 12, 19, 50.000, 3, NULL, NULL, NULL, NULL, 0, 40, '2026-01-18 06:45:16', '2026-01-18 06:45:16'),
(19, 1, 1, 13, 20, 120.000, 3, NULL, NULL, NULL, NULL, 0, 10, '2026-01-18 06:57:37', '2026-01-18 06:57:37'),
(20, 1, 1, 8, 23, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 10, '2026-01-30 03:52:21', '2026-01-30 04:14:14'),
(21, 1, 1, 8, 7, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-30 03:52:22', '2026-01-30 04:14:14'),
(22, 1, 1, 3, 12, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 10, '2026-01-30 03:53:29', '2026-01-30 04:14:32'),
(23, 1, 1, 3, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-30 03:53:30', '2026-01-30 04:14:32'),
(24, 1, 1, 39, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 03:54:42', '2026-01-31 00:40:00'),
(25, 1, 1, 39, 7, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 03:54:42', '2026-01-31 00:40:00'),
(26, 1, 1, 41, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:03:39', '2026-01-30 04:03:39'),
(27, 1, 1, 41, 26, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:03:39', '2026-01-30 04:03:39'),
(28, 1, 1, 42, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:07:22', '2026-01-30 04:07:22'),
(29, 1, 1, 42, 25, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:07:23', '2026-01-30 04:07:23'),
(30, 1, 1, 43, 12, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:08:37', '2026-01-30 04:13:13'),
(31, 1, 1, 43, 27, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:08:38', '2026-01-30 04:08:38'),
(32, 1, 1, 44, 12, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:09:25', '2026-01-30 04:12:44'),
(33, 1, 1, 44, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:09:26', '2026-01-30 04:12:44'),
(34, 1, 1, 45, 21, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:10:24', '2026-01-30 04:12:30'),
(35, 1, 1, 45, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:10:24', '2026-01-30 04:12:30'),
(36, 1, 1, 46, 21, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:11:51', '2026-01-30 04:11:51'),
(37, 1, 1, 46, 27, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:11:51', '2026-01-30 04:11:51'),
(38, 1, 1, 48, 21, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:17:26', '2026-01-30 04:17:26'),
(39, 1, 1, 48, 30, 80.000, 3, 90.000, 300.000, 30.000, NULL, 1, 0, '2026-01-30 04:17:27', '2026-01-30 04:17:27'),
(40, 1, 1, 49, 23, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:18:30', '2026-01-30 04:18:47'),
(41, 1, 1, 49, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:18:30', '2026-01-30 04:18:30'),
(42, 1, 1, 50, 23, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:19:41', '2026-01-30 04:19:41'),
(43, 1, 1, 50, 26, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:19:41', '2026-01-30 04:19:41'),
(44, 1, 1, 51, 12, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:20:59', '2026-01-30 04:20:59'),
(45, 1, 1, 51, 31, 1.000, 1, 1.000, 2.000, 1.000, NULL, 1, 0, '2026-01-30 04:21:00', '2026-01-30 04:21:00'),
(46, 1, 1, 68, 67, 30.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(47, 1, 1, 68, 16, 180.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(52, 1, 1, 69, 67, 30.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(53, 1, 1, 69, 16, 180.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(54, 1, 1, 29, 70, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 10, '2026-01-31 01:08:25', '2026-01-31 01:08:25'),
(55, 1, 1, 29, 28, 1.000, 1, 0.000, 4.000, 1.000, NULL, 1, 20, '2026-01-31 01:08:25', '2026-01-31 01:08:25'),
(56, 1, 1, 40, 68, 10.000, 3, 0.000, 10.000, 10.000, NULL, 1, 10, '2026-01-31 02:44:24', '2026-01-31 02:58:27'),
(57, 1, 1, 40, 15, 250.000, 3, 150.000, 350.000, 100.000, NULL, 1, 20, '2026-01-31 02:44:24', '2026-01-31 02:44:24'),
(58, 1, 1, 40, 65, 30.000, 3, 0.000, 30.000, 30.000, NULL, 1, 30, '2026-01-31 02:44:24', '2026-01-31 02:58:27'),
(59, 1, 1, 40, 66, 30.000, 3, 0.000, 30.000, 30.000, NULL, 1, 40, '2026-01-31 02:44:24', '2026-01-31 02:58:28');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_stocks`
--

CREATE TABLE `prod_product_stocks` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `qty` decimal(12,3) DEFAULT NULL COMMENT 'NULL = бесконечный остаток, 0 = нет в наличии',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_product_stocks`
--

INSERT INTO `prod_product_stocks` (`id`, `tenant_id`, `store_id`, `product_id`, `qty`, `created_at`, `updated_at`) VALUES
(3, 1, 1, 3, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(4, 1, 1, 4, 0.000, '2026-01-24 11:30:44', '2026-01-30 03:40:36'),
(6, 1, 1, 6, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(7, 1, 1, 7, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(8, 1, 1, 8, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(9, 1, 1, 9, 0.000, '2026-01-24 11:30:44', '2026-01-30 03:50:41'),
(10, 1, 1, 10, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(11, 1, 1, 11, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(12, 1, 1, 12, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(13, 1, 1, 13, NULL, '2026-01-24 11:30:44', '2026-01-24 12:03:35'),
(14, 1, 1, 14, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(15, 1, 1, 15, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(16, 1, 1, 16, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(17, 1, 1, 17, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(19, 1, 1, 19, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(20, 1, 1, 20, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(21, 1, 1, 21, NULL, '2026-01-24 11:30:44', '2026-01-24 11:30:44'),
(34, 1, 2, 13, 3.000, '2026-01-27 11:13:30', '2026-01-27 11:13:30'),
(35, 1, 1, 22, NULL, '2026-01-30 03:38:43', '2026-01-30 03:38:43'),
(36, 1, 1, 23, NULL, '2026-01-30 03:39:11', '2026-01-30 03:39:11'),
(37, 1, 1, 24, NULL, '2026-01-30 03:40:15', '2026-01-30 03:40:15'),
(40, 1, 1, 25, NULL, '2026-01-30 03:41:10', '2026-01-30 03:41:10'),
(43, 1, 1, 26, NULL, '2026-01-30 03:42:25', '2026-01-30 03:42:25'),
(44, 1, 1, 27, NULL, '2026-01-30 03:42:52', '2026-01-30 03:42:52'),
(45, 1, 1, 28, NULL, '2026-01-30 03:43:13', '2026-01-30 03:43:13'),
(46, 1, 1, 29, NULL, '2026-01-30 03:43:49', '2026-01-30 03:43:49'),
(47, 1, 1, 30, NULL, '2026-01-30 03:44:32', '2026-01-30 03:44:32'),
(48, 1, 1, 31, NULL, '2026-01-30 03:45:03', '2026-01-30 03:45:03'),
(49, 1, 1, 32, NULL, '2026-01-30 03:46:10', '2026-01-30 03:46:10'),
(50, 1, 1, 33, NULL, '2026-01-30 03:46:47', '2026-01-30 03:46:47'),
(51, 1, 1, 34, NULL, '2026-01-30 03:47:13', '2026-01-30 03:47:13'),
(52, 1, 1, 35, NULL, '2026-01-30 03:47:39', '2026-01-30 03:47:39'),
(53, 1, 1, 36, NULL, '2026-01-30 03:47:56', '2026-01-30 03:47:56'),
(55, 1, 1, 37, NULL, '2026-01-30 03:49:20', '2026-01-30 03:49:20'),
(56, 1, 1, 38, NULL, '2026-01-30 03:49:52', '2026-01-30 03:49:52'),
(60, 1, 1, 39, NULL, '2026-01-30 03:54:42', '2026-01-30 03:54:42'),
(61, 1, 1, 40, NULL, '2026-01-30 03:55:42', '2026-01-30 17:21:52'),
(62, 1, 1, 41, NULL, '2026-01-30 04:03:39', '2026-01-30 04:03:39'),
(64, 1, 1, 42, NULL, '2026-01-30 04:07:22', '2026-01-30 04:07:22'),
(65, 1, 1, 43, NULL, '2026-01-30 04:08:37', '2026-01-30 04:08:37'),
(66, 1, 1, 44, NULL, '2026-01-30 04:09:25', '2026-01-30 04:09:25'),
(67, 1, 1, 45, NULL, '2026-01-30 04:10:23', '2026-01-30 04:10:23'),
(68, 1, 1, 46, NULL, '2026-01-30 04:11:51', '2026-01-30 04:11:51'),
(80, 1, 1, 47, NULL, '2026-01-30 04:15:14', '2026-01-31 00:54:50'),
(81, 1, 1, 48, NULL, '2026-01-30 04:17:26', '2026-01-30 04:17:26'),
(82, 1, 1, 49, NULL, '2026-01-30 04:18:29', '2026-01-30 04:18:29'),
(84, 1, 1, 50, NULL, '2026-01-30 04:19:41', '2026-01-30 04:19:41'),
(85, 1, 1, 51, NULL, '2026-01-30 04:20:59', '2026-01-30 04:20:59'),
(86, 1, 1, 52, NULL, '2026-01-30 04:21:30', '2026-01-30 04:21:30'),
(89, 1, 1, 53, NULL, '2026-01-30 04:44:17', '2026-01-31 00:56:51'),
(91, 1, 1, 54, NULL, '2026-01-30 04:44:46', '2026-01-31 00:57:27'),
(92, 1, 1, 55, NULL, '2026-01-30 04:45:49', '2026-01-30 04:45:49'),
(93, 1, 1, 56, NULL, '2026-01-30 04:46:11', '2026-01-30 04:46:11'),
(94, 1, 1, 57, NULL, '2026-01-30 04:46:41', '2026-01-30 04:46:41'),
(95, 1, 1, 58, NULL, '2026-01-30 04:46:54', '2026-01-30 04:46:54'),
(96, 1, 1, 59, NULL, '2026-01-30 05:06:15', '2026-01-30 05:06:15'),
(108, 1, 1, 60, NULL, '2026-01-30 17:00:24', '2026-01-30 17:00:24'),
(109, 1, 1, 61, NULL, '2026-01-30 17:00:57', '2026-01-30 17:00:57'),
(110, 1, 1, 62, NULL, '2026-01-30 17:01:36', '2026-01-30 17:01:36'),
(111, 1, 1, 63, NULL, '2026-01-30 17:02:04', '2026-01-30 17:02:04'),
(112, 1, 1, 64, NULL, '2026-01-30 17:02:47', '2026-01-30 17:02:47'),
(116, 1, 1, 65, NULL, '2026-01-30 17:12:34', '2026-01-30 17:12:34'),
(117, 1, 1, 66, NULL, '2026-01-30 17:13:31', '2026-01-30 17:13:31'),
(118, 1, 1, 67, NULL, '2026-01-30 17:14:52', '2026-01-30 17:14:52'),
(120, 1, 1, 68, NULL, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(128, 1, 1, 69, NULL, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(150, 1, 1, 70, NULL, '2026-01-31 01:06:52', '2026-01-31 01:06:52');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_unit_links`
--

CREATE TABLE `prod_product_unit_links` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `unit_id` bigint UNSIGNED NOT NULL COMMENT 'Связанная единица (например шт)',
  `base_unit_id` bigint UNSIGNED NOT NULL COMMENT 'Базовая единица товара',
  `factor` decimal(18,6) NOT NULL COMMENT 'Сколько base_unit в 1 unit',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Структура таблицы `prod_units`
--

CREATE TABLE `prod_units` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `code` varchar(50) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Системный код единицы (шт, кг, г, л, мл, порц)',
  `title` varchar(100) COLLATE utf8mb4_general_ci NOT NULL COMMENT 'Название единицы (Штука, Килограмм, Грамм)',
  `short_title` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'Краткое название (шт, кг, г)',
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `from_unit_id` bigint UNSIGNED NOT NULL,
  `to_unit_id` bigint UNSIGNED NOT NULL,
  `factor` decimal(18,6) NOT NULL COMMENT 'Умножить значение в from_unit на factor, чтобы получить to_unit',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `variant_group_id` bigint UNSIGNED NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `default_value_index` int DEFAULT NULL COMMENT 'Индекс варианта по умолчанию для конкретного товара (NULL = использовать дефолт группы)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_assignments`
--

INSERT INTO `prod_variant_assignments` (`id`, `tenant_id`, `store_id`, `product_id`, `variant_group_id`, `sort_order`, `is_active`, `default_value_index`, `created_at`, `updated_at`) VALUES
(18, 1, 1, 38, 8, 0, 1, NULL, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(19, 1, 1, 37, 8, 0, 1, NULL, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(20, 1, 1, 30, 6, 0, 1, NULL, '2026-01-30 08:27:47', '2026-01-30 08:27:47'),
(21, 1, 1, 25, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:30'),
(22, 1, 1, 26, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:31'),
(23, 1, 1, 27, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:33'),
(24, 1, 1, 13, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:35'),
(25, 1, 1, 31, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:37'),
(26, 1, 1, 4, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:38'),
(27, 1, 1, 24, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:40'),
(28, 1, 1, 28, 5, 0, 1, NULL, '2026-01-30 08:28:20', '2026-01-30 08:28:20'),
(29, 1, 1, 7, 5, 0, 1, NULL, '2026-01-30 08:28:20', '2026-01-30 08:28:20'),
(31, 1, 1, 21, 4, 0, 1, NULL, '2026-01-30 08:29:09', '2026-01-30 08:29:09'),
(32, 1, 1, 22, 4, 0, 1, NULL, '2026-01-30 08:29:09', '2026-01-30 08:29:09'),
(33, 1, 1, 12, 4, 0, 1, NULL, '2026-01-30 08:29:09', '2026-01-30 08:29:09'),
(34, 1, 1, 23, 4, 0, 1, NULL, '2026-01-30 08:29:10', '2026-01-30 08:29:10'),
(35, 1, 1, 6, 4, 0, 1, NULL, '2026-01-30 08:29:10', '2026-01-30 08:29:10'),
(36, 1, 1, 56, 7, 0, 1, NULL, '2026-01-30 08:29:36', '2026-01-30 08:29:36'),
(37, 1, 1, 55, 7, 0, 1, NULL, '2026-01-30 08:29:36', '2026-01-30 08:29:36'),
(38, 1, 1, 34, 9, 0, 1, NULL, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(39, 1, 1, 32, 9, 0, 1, NULL, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(42, 1, 1, 40, 4, 0, 1, NULL, '2026-01-31 00:42:30', '2026-01-31 00:42:30'),
(44, 1, 1, 47, 10, 0, 1, NULL, '2026-01-31 00:53:18', '2026-01-31 00:53:18'),
(45, 1, 1, 62, 10, 0, 1, NULL, '2026-01-31 00:54:10', '2026-01-31 00:54:10'),
(46, 1, 1, 53, 11, 0, 1, NULL, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(47, 1, 1, 54, 11, 0, 1, NULL, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(48, 1, 1, 60, 12, 0, 1, NULL, '2026-01-31 01:02:57', '2026-01-31 01:02:57');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_discount_tiers`
--

CREATE TABLE `prod_variant_discount_tiers` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `variant_group_id` bigint UNSIGNED NOT NULL,
  `min_quantity` decimal(10,3) NOT NULL COMMENT 'Минимальное количество для применения скидки',
  `discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'Процент скидки (0.00 - 100.00)',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_discount_tiers`
--

INSERT INTO `prod_variant_discount_tiers` (`id`, `tenant_id`, `store_id`, `variant_group_id`, `min_quantity`, `discount_percent`, `sort_order`, `created_at`, `updated_at`) VALUES
(13, 1, 1, 4, 1.000, -10.00, 0, '2026-01-30 08:23:46', '2026-01-30 08:23:46'),
(14, 1, 1, 4, 1.000, 0.00, 1, '2026-01-30 08:23:46', '2026-01-30 08:23:46'),
(15, 1, 1, 4, 1.000, 0.00, 2, '2026-01-30 08:23:47', '2026-01-30 08:23:47'),
(16, 1, 1, 5, 1.000, -10.00, 0, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(17, 1, 1, 5, 1.000, 0.00, 1, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(18, 1, 1, 5, 1.000, 0.00, 2, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(19, 1, 1, 5, 1.000, 0.00, 3, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(20, 1, 1, 6, 1.000, -10.00, 0, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(21, 1, 1, 6, 1.000, 0.00, 1, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(22, 1, 1, 6, 1.000, 0.00, 2, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(23, 1, 1, 6, 1.000, 0.00, 3, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(24, 1, 1, 7, 1.000, -10.00, 0, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(25, 1, 1, 7, 1.000, 0.00, 1, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(26, 1, 1, 7, 1.000, 0.00, 2, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(27, 1, 1, 8, 1.000, -10.00, 0, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(28, 1, 1, 8, 1.000, 0.00, 1, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(29, 1, 1, 9, 1.000, -10.00, 0, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(30, 1, 1, 9, 1.000, 0.00, 1, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(31, 1, 1, 9, 1.000, 0.00, 2, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(32, 1, 1, 10, 1.000, -10.00, 0, '2026-01-30 16:59:21', '2026-01-30 16:59:21'),
(33, 1, 1, 10, 1.000, 0.00, 1, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(34, 1, 1, 10, 1.000, 0.00, 2, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(35, 1, 1, 10, 1.000, 0.00, 3, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(36, 1, 1, 11, 1.000, 0.00, 0, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(37, 1, 1, 11, 1.000, 0.00, 1, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(38, 1, 1, 11, 1.000, 0.00, 2, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(39, 1, 1, 12, 1.000, 0.00, 0, '2026-01-31 01:02:43', '2026-01-31 01:02:43'),
(40, 1, 1, 12, 1.000, 0.00, 1, '2026-01-31 01:02:44', '2026-01-31 01:02:44');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_groups`
--

CREATE TABLE `prod_variant_groups` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `store_id` int NOT NULL DEFAULT '1',
  `title` varchar(255) COLLATE utf8mb4_general_ci NOT NULL,
  `unit_id` bigint UNSIGNED DEFAULT NULL COMMENT 'Единица измерения для вариантов',
  `values` text COLLATE utf8mb4_general_ci COMMENT 'JSON массив значений вариантов (например: ["1","2","3","4"] или ["150г","250г","350г"])',
  `default_value_index` int DEFAULT NULL COMMENT 'Индекс варианта по умолчанию в массиве values (0-based, NULL = нет дефолта)',
  `selection_type` enum('single') COLLATE utf8mb4_general_ci NOT NULL DEFAULT 'single',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_variant_groups`
--

INSERT INTO `prod_variant_groups` (`id`, `tenant_id`, `store_id`, `title`, `unit_id`, `values`, `default_value_index`, `selection_type`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(4, 1, 1, 'Гарнира (Грамм)', 3, '[\"150\",\"250\",\"350\"]', 1, 'single', 1, 0, '2026-01-30 08:23:46', '2026-01-30 16:57:13'),
(5, 1, 1, 'Горячего (Штук)', 1, '[\"1\",\"2\",\"3\",\"4\"]', 1, 'single', 1, 0, '2026-01-30 08:24:40', '2026-01-30 16:57:06'),
(6, 1, 1, 'Горячего (Грамм)', 3, '[\"90\",\"120\",\"150\",\"180\"]', 0, 'single', 1, 0, '2026-01-30 08:25:21', '2026-01-30 16:56:57'),
(7, 1, 1, 'Порция (Грамм)', 3, '[\"100\",\"200\",\"300\"]', 0, 'single', 1, 0, '2026-01-30 08:25:49', '2026-01-30 16:56:50'),
(8, 1, 1, 'Супа (Грамм)', 3, '[\"250\",\"350\"]', 0, 'single', 1, 0, '2026-01-30 08:27:32', '2026-01-30 16:56:42'),
(9, 1, 1, 'Салата (Грамм)', 3, '[\"100\",\"150\",\"200\"]', 0, 'single', 1, 0, '2026-01-30 08:38:53', '2026-01-30 16:57:25'),
(10, 1, 1, 'Порция (Штук)', 1, '[\"10\",\"15\",\"20\",\"25\"]', 1, 'single', 1, 0, '2026-01-30 16:58:04', '2026-01-30 16:59:21'),
(11, 1, 1, 'Порция (Штук)', 1, '[\"3\",\"5\",\"7\"]', 0, 'single', 1, 0, '2026-01-31 00:56:16', '2026-01-31 00:56:16'),
(12, 1, 1, 'Каши (Грамм)', 3, '[\"250\",\"350\"]', 0, 'single', 1, 0, '2026-01-31 01:02:43', '2026-01-31 01:02:43');

-- --------------------------------------------------------

--
-- Структура таблицы `ten_delivery_settings`
--

CREATE TABLE `ten_delivery_settings` (
  `id` int NOT NULL,
  `tenant_id` int NOT NULL,
  `name` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  `delivery_cost` decimal(10,2) DEFAULT '0.00',
  `min_order_amount` decimal(10,2) DEFAULT '0.00',
  `free_delivery_from` decimal(10,2) DEFAULT NULL,
  `default_store_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

--
-- Дамп данных таблицы `ten_delivery_settings`
--

INSERT INTO `ten_delivery_settings` (`id`, `tenant_id`, `name`, `delivery_cost`, `min_order_amount`, `free_delivery_from`, `default_store_id`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 'Доставка по Новоалтайску', 59.00, 0.00, 400.00, 1, 1, '2026-01-29 11:10:45', '2026-01-30 13:27:37');

-- --------------------------------------------------------

--
-- Структура таблицы `ten_delivery_settings_stores`
--

CREATE TABLE `ten_delivery_settings_stores` (
  `delivery_setting_id` int NOT NULL,
  `store_id` int NOT NULL,
  `tenant_id` int NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

--
-- Дамп данных таблицы `ten_delivery_settings_stores`
--

INSERT INTO `ten_delivery_settings_stores` (`delivery_setting_id`, `store_id`, `tenant_id`) VALUES
(1, 1, 1);

-- --------------------------------------------------------

--
-- Структура таблицы `ten_stores`
--

CREATE TABLE `ten_stores` (
  `tenant_id` int NOT NULL,
  `id` int NOT NULL,
  `name` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  `code` varchar(150) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `address` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `timezone` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `use_global_hours` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `city` varchar(255) COLLATE utf8mb4_general_ci NOT NULL DEFAULT '',
  `use_delivery_hours` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Отдельный график доставки'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `ten_stores`
--

INSERT INTO `ten_stores` (`tenant_id`, `id`, `name`, `code`, `address`, `phone`, `timezone`, `is_active`, `use_global_hours`, `created_at`, `updated_at`, `city`, `use_delivery_hours`) VALUES
(1, 1, 'По щам - на Партсъезда', 'main', 'ул. 22-го Партсъезда 4', '79021461966', '+7', 1, 1, '2026-01-25 15:25:51', '2026-01-28 11:28:10', 'Новоалтайск', 1),
(1, 2, 'Точка 2', 'store-2', 'ул. Неизвестная', NULL, '+7', 1, 1, '2026-01-26 15:53:11', '2026-01-30 12:58:19', 'Новоалтайск', 1);

-- --------------------------------------------------------

--
-- Структура таблицы `ten_store_delivery_hours`
--

CREATE TABLE `ten_store_delivery_hours` (
  `tenant_id` int NOT NULL,
  `store_id` int NOT NULL,
  `day_of_week` tinyint NOT NULL COMMENT '0=Вс ... 6=Сб',
  `opens_at` time DEFAULT NULL,
  `closes_at` time DEFAULT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `ten_store_delivery_hours`
--

INSERT INTO `ten_store_delivery_hours` (`tenant_id`, `store_id`, `day_of_week`, `opens_at`, `closes_at`, `is_closed`, `created_at`, `updated_at`) VALUES
(1, 1, 0, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 1, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 2, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 3, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 4, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 5, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 6, '10:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 2, 0, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 1, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 2, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 3, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 4, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 5, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 6, '10:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19');

-- --------------------------------------------------------

--
-- Структура таблицы `ten_store_hours`
--

CREATE TABLE `ten_store_hours` (
  `tenant_id` int NOT NULL,
  `store_id` int NOT NULL,
  `day_of_week` tinyint NOT NULL,
  `opens_at` time DEFAULT NULL,
  `closes_at` time DEFAULT NULL,
  `is_closed` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;

--
-- Дамп данных таблицы `ten_store_hours`
--

INSERT INTO `ten_store_hours` (`tenant_id`, `store_id`, `day_of_week`, `opens_at`, `closes_at`, `is_closed`, `created_at`, `updated_at`) VALUES
(1, 1, 0, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 1, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 2, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 3, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 4, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 5, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 1, 6, '08:00:00', '20:00:00', 0, '2026-01-28 11:28:10', '2026-01-28 11:28:10'),
(1, 2, 0, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 1, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 2, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 3, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 4, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 5, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19'),
(1, 2, 6, '08:00:00', '20:00:00', 0, '2026-01-30 12:58:19', '2026-01-30 12:58:19');

-- --------------------------------------------------------

--
-- Структура таблицы `ten_tenants`
--

CREATE TABLE `ten_tenants` (
  `id` int NOT NULL,
  `store_id` int NOT NULL DEFAULT '1',
  `name` varchar(100) COLLATE utf8mb4_general_ci DEFAULT 'Мой Магазин',
  `slug` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `subdomain` varchar(100) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `logo_light_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `logo_dark_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `favicon_light_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `favicon_dark_url` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `apple_touch_icon_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `android_icon_url` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT NULL,
  `price_rounding_mode` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci DEFAULT 'none',
  `price_rounding_precision` tinyint NOT NULL DEFAULT '2',
  `timezone` varchar(64) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `site_name` varchar(150) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `site_description` text COLLATE utf8mb4_general_ci,
  `custom_domain` varchar(255) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sound_new_order_url` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sound_order_cancelled_url` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL,
  `sound_new_message_url` varchar(512) COLLATE utf8mb4_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `ten_tenants`
--

INSERT INTO `ten_tenants` (`id`, `store_id`, `name`, `slug`, `subdomain`, `email`, `password_hash`, `phone`, `is_active`, `created_at`, `updated_at`, `logo_light_url`, `logo_dark_url`, `favicon_light_url`, `favicon_dark_url`, `apple_touch_icon_url`, `android_icon_url`, `price_rounding_mode`, `price_rounding_precision`, `timezone`, `site_name`, `site_description`, `custom_domain`, `sound_new_order_url`, `sound_order_cancelled_url`, `sound_new_message_url`) VALUES
(1, 1, 'По щам - домашняя еда с доставкой', NULL, 'posham', 'admin@test.ru', '$2a$10$c2.HUSbW1ssrMsF03XsC6eMSkXR6FtMqOPLpSUgkUIQRibqfk9.zO', 'admin@test.ru', 1, '2026-01-21 13:07:16', '2026-01-30 11:29:35', '/static/uploads/tenants/1/2bcab539a2056f905b05b2fe1e6175ca.png', '/static/uploads/tenants/1/1c30d7740e24c5295301e5190bb9a8a1.png', '/static/uploads/tenants/1/87a8ced908be6c4daaed371594cfde4c.png', '/static/uploads/tenants/1/ae6927d41ab198580ec4c62af9f32e14.png', '/static/uploads/tenants/1/0a831832a7329001b3146abea34abf26.png', '/static/uploads/tenants/1/92b6768e0ba0233bdbdf6b5a9723e8bd.png', 'down', 0, NULL, 'По щам', NULL, NULL, '/static/uploads/tenants/1/sounds/916c36a6823edddb93e2c8217ad29429.mp3', '/static/uploads/tenants/1/sounds/3bd971e4aa8ef9473a3be407ebb2c0f1.mp3', '/static/uploads/tenants/1/sounds/6ae929b6d9fe383a1b6e57b4fae64435.mp3');

--
-- Индексы сохранённых таблиц
--

--
-- Индексы таблицы `app_users`
--
ALTER TABLE `app_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_app_users_email` (`email`),
  ADD UNIQUE KEY `uq_app_users_tenant_email` (`tenant_id`,`email`),
  ADD KEY `idx_app_users_tenant` (`tenant_id`),
  ADD KEY `idx_app_users_tenant_active` (`tenant_id`,`is_active`);

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
-- Индексы таблицы `prod_auto_add_groups`
--
ALTER TABLE `prod_auto_add_groups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_auto_add_groups_tenant` (`tenant_id`),
  ADD KEY `idx_auto_add_groups_store` (`store_id`);

--
-- Индексы таблицы `prod_auto_add_items`
--
ALTER TABLE `prod_auto_add_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_auto_add_items_tenant` (`tenant_id`),
  ADD KEY `idx_auto_add_items_store` (`store_id`),
  ADD KEY `idx_auto_add_items_group` (`group_id`),
  ADD KEY `idx_auto_add_items_product` (`product_id`);

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
-- Индексы таблицы `prod_product_stocks`
--
ALTER TABLE `prod_product_stocks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_product_stocks_tenant_store_product` (`tenant_id`,`store_id`,`product_id`),
  ADD KEY `idx_prod_product_stocks_tenant_store` (`tenant_id`,`store_id`),
  ADD KEY `idx_prod_product_stocks_product` (`product_id`),
  ADD KEY `fk_prod_product_stocks_product` (`tenant_id`,`product_id`);

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
-- Индексы таблицы `ten_delivery_settings`
--
ALTER TABLE `ten_delivery_settings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_tenant` (`tenant_id`);

--
-- Индексы таблицы `ten_delivery_settings_stores`
--
ALTER TABLE `ten_delivery_settings_stores`
  ADD PRIMARY KEY (`delivery_setting_id`,`store_id`,`tenant_id`),
  ADD KEY `idx_store` (`tenant_id`,`store_id`);

--
-- Индексы таблицы `ten_stores`
--
ALTER TABLE `ten_stores`
  ADD PRIMARY KEY (`tenant_id`,`id`),
  ADD UNIQUE KEY `uq_ten_stores_tenant_code` (`tenant_id`,`code`),
  ADD KEY `idx_ten_stores_tenant_active` (`tenant_id`,`is_active`);

--
-- Индексы таблицы `ten_store_delivery_hours`
--
ALTER TABLE `ten_store_delivery_hours`
  ADD PRIMARY KEY (`tenant_id`,`store_id`,`day_of_week`),
  ADD KEY `idx_ten_store_delivery_hours_store` (`tenant_id`,`store_id`);

--
-- Индексы таблицы `ten_store_hours`
--
ALTER TABLE `ten_store_hours`
  ADD PRIMARY KEY (`tenant_id`,`store_id`,`day_of_week`);

--
-- Индексы таблицы `ten_tenants`
--
ALTER TABLE `ten_tenants`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT для сохранённых таблиц
--

--
-- AUTO_INCREMENT для таблицы `app_users`
--
ALTER TABLE `app_users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT для таблицы `cust_customers`
--
ALTER TABLE `cust_customers`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `cust_customer_addresses`
--
ALTER TABLE `cust_customer_addresses`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT для таблицы `cust_customer_sessions`
--
ALTER TABLE `cust_customer_sessions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=35;

--
-- AUTO_INCREMENT для таблицы `cust_statuses`
--
ALTER TABLE `cust_statuses`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `order_delivery_types`
--
ALTER TABLE `order_delivery_types`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `order_orders`
--
ALTER TABLE `order_orders`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `order_payments`
--
ALTER TABLE `order_payments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `order_statuses`
--
ALTER TABLE `order_statuses`
  MODIFY `id` int UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `order_time_options`
--
ALTER TABLE `order_time_options`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `prod_auto_add_groups`
--
ALTER TABLE `prod_auto_add_groups`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT для таблицы `prod_auto_add_items`
--
ALTER TABLE `prod_auto_add_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT для таблицы `prod_categories`
--
ALTER TABLE `prod_categories`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=11;

--
-- AUTO_INCREMENT для таблицы `prod_option_assignments`
--
ALTER TABLE `prod_option_assignments`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=136;

--
-- AUTO_INCREMENT для таблицы `prod_option_exclusions`
--
ALTER TABLE `prod_option_exclusions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_option_groups`
--
ALTER TABLE `prod_option_groups`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=17;

--
-- AUTO_INCREMENT для таблицы `prod_option_items`
--
ALTER TABLE `prod_option_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=98;

--
-- AUTO_INCREMENT для таблицы `prod_option_overrides`
--
ALTER TABLE `prod_option_overrides`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_products`
--
ALTER TABLE `prod_products`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=71;

--
-- AUTO_INCREMENT для таблицы `prod_product_categories`
--
ALTER TABLE `prod_product_categories`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=891;

--
-- AUTO_INCREMENT для таблицы `prod_product_ingredients`
--
ALTER TABLE `prod_product_ingredients`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=60;

--
-- AUTO_INCREMENT для таблицы `prod_product_stocks`
--
ALTER TABLE `prod_product_stocks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=158;

--
-- AUTO_INCREMENT для таблицы `prod_product_unit_links`
--
ALTER TABLE `prod_product_unit_links`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT для таблицы `prod_units`
--
ALTER TABLE `prod_units`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=7;

--
-- AUTO_INCREMENT для таблицы `prod_unit_conversions`
--
ALTER TABLE `prod_unit_conversions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `prod_variant_assignments`
--
ALTER TABLE `prod_variant_assignments`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=49;

--
-- AUTO_INCREMENT для таблицы `prod_variant_discount_tiers`
--
ALTER TABLE `prod_variant_discount_tiers`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;

--
-- AUTO_INCREMENT для таблицы `prod_variant_groups`
--
ALTER TABLE `prod_variant_groups`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=13;

--
-- AUTO_INCREMENT для таблицы `ten_delivery_settings`
--
ALTER TABLE `ten_delivery_settings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT для таблицы `ten_tenants`
--
ALTER TABLE `ten_tenants`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Ограничения внешнего ключа сохраненных таблиц
--

--
-- Ограничения внешнего ключа таблицы `app_users`
--
ALTER TABLE `app_users`
  ADD CONSTRAINT `fk_app_users_tenant` FOREIGN KEY (`tenant_id`) REFERENCES `ten_tenants` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
-- Ограничения внешнего ключа таблицы `prod_product_stocks`
--
ALTER TABLE `prod_product_stocks`
  ADD CONSTRAINT `fk_prod_product_stocks_product` FOREIGN KEY (`tenant_id`,`product_id`) REFERENCES `prod_products` (`tenant_id`, `id`) ON DELETE CASCADE ON UPDATE CASCADE;

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

--
-- Ограничения внешнего ключа таблицы `ten_store_hours`
--
ALTER TABLE `ten_store_hours`
  ADD CONSTRAINT `ten_store_hours_ibfk_1` FOREIGN KEY (`tenant_id`,`store_id`) REFERENCES `ten_stores` (`tenant_id`, `id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
