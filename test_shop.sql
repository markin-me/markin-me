-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Хост: 10.0.231.119
-- Время создания: Фев 05 2026 г., 14:29
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
(1, 1, 'admin@test.ru', NULL, '$2a$10$c2.HUSbW1ssrMsF03XsC6eMSkXR6FtMqOPLpSUgkUIQRibqfk9.zO', 'Владелец', 'owner', 1, '2026-02-03 10:47:37', '2026-01-21 13:15:27', '2026-02-03 07:47:37');

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
(4, 1, 1, NULL, '79835549121', 'Александр', '1986-09-11', NULL, NULL, '2026-01-27', 0, 0.00, NULL, NULL, 1, '2026-01-27 10:45:42', '2026-01-31 10:56:43');

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
(1, 1, 1, 1, 'Деповская', '48', '2', '3', '45', 'Это мой дом', 0, 1, '2026-01-07 07:43:03', '2026-01-31 07:29:15'),
(2, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 1, 1, '2026-01-07 16:48:49', '2026-01-31 07:29:15'),
(3, 1, 1, 1, 'Октябрьская', '25', '1', '4', '45', 'бьюти салон', 0, 0, '2026-01-07 16:49:26', '2026-01-07 16:49:42'),
(4, 1, 1, 1, '4444', '3', NULL, NULL, NULL, NULL, 0, 0, '2026-01-23 17:47:27', '2026-01-23 17:52:54'),
(5, 1, 1, 4, 'гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 10:46:37', '2026-01-27 10:47:45'),
(6, 1, 1, 4, 'Клочкова', '19', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 14:18:44', '2026-01-27 14:34:21'),
(7, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 14:35:10', '2026-01-27 15:20:15'),
(8, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 15:03:26', '2026-01-27 15:20:13'),
(9, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 0, 0, '2026-01-27 15:20:07', '2026-01-28 04:27:56'),
(10, 1, 1, 1, 'энгельса 2 кв', '23', NULL, NULL, NULL, NULL, 0, 0, '2026-01-29 12:27:39', '2026-01-29 12:27:44'),
(11, 1, 1, 4, 'Гоголя', '7', NULL, NULL, NULL, NULL, 1, 1, '2026-01-31 10:57:15', '2026-01-31 10:57:15');

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
(34, 1, 1, 1, '34175369124e49fd81ebef4e3979094e', '2026-01-30 14:27:40', '2026-03-01 14:27:40', 1),
(35, 1, 1, 1, '7281983cf0d04b0b9dc485e2da1f89d8', '2026-01-31 10:28:15', '2026-03-02 10:28:15', 1),
(36, 1, 1, 1, 'bf8a3492986b49ccb73896fe302a630c', '2026-01-31 12:06:15', '2026-03-02 12:06:15', 1),
(37, 1, 1, 4, 'd8ed3182ffae4274975e3d4945d60988', '2026-01-31 13:57:14', '2026-03-02 13:57:14', 1),
(38, 1, 1, 1, 'c953e0d1adf44ab29b831ce5d050aa9b', '2026-02-01 10:45:10', '2026-03-03 10:45:10', 1),
(39, 1, 1, 1, 'dcfccff68ab641a58835320852c86b67', '2026-02-01 10:51:02', '2026-03-03 10:51:02', 1),
(40, 1, 1, 1, 'fe63d546e9c244288369e4ecfb9d06ca', '2026-02-01 15:03:47', '2026-03-03 15:03:47', 1),
(41, 1, 1, 1, 'd5ed8bca40df4f65bf3b6bbd100cab8f', '2026-02-01 15:06:18', '2026-03-03 15:06:18', 1),
(42, 1, 1, 1, '2388e12d2fee441281f6922583569301', '2026-02-01 15:15:08', '2026-03-03 15:15:08', 1),
(43, 1, 1, 4, '69809d533b9b4924bdb132718d1943bc', '2026-02-02 07:13:40', '2026-03-04 07:13:40', 1),
(44, 1, 1, 1, '4e3c623d3cdf4b35b29c15e3f8af5909', '2026-02-02 21:32:58', '2026-03-04 21:32:58', 1),
(45, 1, 1, 1, '9828fd118a964f1488581dd2fc4cb3ed', '2026-02-03 09:15:43', '2026-03-05 09:15:43', 1),
(46, 1, 1, 1, 'fc8b38f560154018bf2afcee0bf13edd', '2026-02-03 10:41:48', '2026-03-05 10:41:48', 1);

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
(118, 'ccbc7779-a371-46ec-ad8e-e65d30eaa18b', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 1000.00, '[{\"product_id\":13,\"name\":\"Куринная котлета\",\"qty\":1,\"price\":163,\"old_price\":0,\"line_total\":533,\"photos\":[\"/static/uploads/products/1/fe6e72ac1ce743c145b235225287a820.webp\"],\"options\":[{\"id\":90,\"title\":\"Гречка с овощами\",\"price\":89,\"qty\":1,\"variant_group_id\":4,\"variant_value_index\":2,\"variant_label\":\"350 г\",\"variant_price_diff\":118.66666666666669}],\"variants\":[{\"variant_group_id\":5,\"variant_value_index\":1,\"group_title\":\"Горячего (Штук)\",\"value\":\"2 шт\",\"label\":\"2 шт\",\"price_diff\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 533.00, 0.00, '2026-02-01 14:45:27', 4, 1, 1, 1, 0, NULL, 'web', 1),
(119, '51ad9c92-afe8-451e-8344-fbea5f922106', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":300,\"old_price\":0,\"line_total\":300,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.9492003046458491,\"total\":142.38004569687737},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":163,\"total\":163}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":300,\"old_price\":0,\"line_total\":510,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":200,\"price\":0.9492003046458491,\"total\":189.84006092916982},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":2,\"price\":163,\"total\":326}],\"auto_add\":0},{\"product_id\":37,\"name\":\"Солянка мясная сборная\",\"qty\":2,\"price\":249,\"old_price\":0,\"line_total\":390,\"photos\":[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\"],\"ingredients\":[{\"ingredient_id\":71,\"name\":\"Долька лимона\",\"quantity\":1,\"price\":15,\"total\":15}],\"variants\":[{\"variant_group_id\":8,\"variant_value_index\":0,\"group_title\":\"Супа (Грамм)\",\"value\":\"250 г\",\"label\":\"250 г\",\"price_diff\":0}],\"auto_add\":0}]', 1200.00, 0.00, '2026-02-01 14:47:12', 4, 1, 2, 1, 0, '2026-02-01 16:00:00', 'web', 1),
(120, '2a93119d-1b95-43cb-bf41-0a11c5e00e3d', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":52,\"name\":\"Картофельная запеканка\",\"qty\":1,\"price\":299,\"old_price\":0,\"line_total\":299,\"photos\":[\"/static/uploads/products/1/0a4cf805e0a90b6fdec73539e1104d7c.jpg\"],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":37,\"name\":\"Солянка мясная сборная\",\"qty\":1,\"price\":249,\"old_price\":0,\"line_total\":195,\"photos\":[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\"],\"ingredients\":[{\"ingredient_id\":71,\"name\":\"Долька лимона\",\"quantity\":1,\"price\":15,\"total\":15}],\"variants\":[{\"variant_group_id\":8,\"variant_value_index\":0,\"group_title\":\"Супа (Грамм)\",\"value\":\"250 г\",\"label\":\"250 г\",\"price_diff\":0}],\"auto_add\":0}]', 494.00, 0.00, '2026-02-01 14:51:27', 4, 1, 2, 1, 0, '2026-02-01 16:30:00', 'web', 1),
(121, '97f68369-6cef-44ae-9c7f-afaf54d0ead5', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":37,\"name\":\"Солянка мясная сборная\",\"qty\":1,\"price\":249,\"old_price\":0,\"line_total\":195,\"photos\":[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\"],\"ingredients\":[{\"ingredient_id\":71,\"name\":\"Долька лимона\",\"quantity\":1,\"price\":15,\"total\":15}],\"variants\":[{\"variant_group_id\":8,\"variant_value_index\":0,\"group_title\":\"Супа (Грамм)\",\"value\":\"250 г\",\"label\":\"250 г\",\"price_diff\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 254.00, 59.00, '2026-02-01 15:25:18', 4, 1, 1, 1, 0, NULL, 'web', 1),
(122, '4d30a335-6642-4eb1-960f-b15df5f5ebc1', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":300,\"old_price\":0,\"line_total\":300,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.9492003046458491,\"total\":142.38004569687737},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":163,\"total\":163}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 359.00, 59.00, '2026-02-02 12:26:59', 4, 1, 1, 1, 0, NULL, 'web', 1),
(123, '5566dff1-1246-43e5-9868-a1aa5f153716', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":300,\"old_price\":0,\"line_total\":300,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.9492003046458491,\"total\":142.38004569687737},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":163,\"total\":163}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 359.00, 59.00, '2026-02-02 12:30:52', 4, 1, 1, 1, 0, NULL, 'web', 1),
(124, '408a8144-299f-4e85-ba26-6ac38e673413', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":2,\"price\":300,\"old_price\":0,\"line_total\":600,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.9492003046458491,\"total\":142.38004569687737},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":163,\"total\":163}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 600.00, 0.00, '2026-02-02 06:13:22', 4, 1, 1, 1, 0, NULL, 'web', 1),
(125, '9af0e2c7-5af9-4fda-87e7-ae4da865532d', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":41,\"name\":\"Котлета по-домашнемй с гречкой\",\"qty\":1,\"price\":374,\"old_price\":0,\"line_total\":374,\"photos\":[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"],\"ingredients\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"price\":0.5933333333333334,\"total\":89},{\"ingredient_id\":26,\"name\":\"Котлета по-домашнему\",\"quantity\":1,\"price\":149,\"total\":149}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 433.00, 59.00, '2026-02-02 06:47:24', 4, 1, 1, 1, 0, NULL, 'web', 1),
(126, '4110aa5e-23c8-42d4-90ff-f412d84404bd', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":41,\"name\":\"Котлета по-домашнемй с гречкой\",\"qty\":1,\"price\":374,\"old_price\":0,\"line_total\":374,\"photos\":[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"],\"ingredients\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"price\":0.5933333333333334,\"total\":89},{\"ingredient_id\":26,\"name\":\"Котлета по-домашнему\",\"quantity\":1,\"price\":149,\"total\":149}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 433.00, 59.00, '2026-02-02 07:24:53', 4, 1, 1, 1, 0, NULL, 'web', 1),
(127, '89590ff5-c3d4-4efd-87a3-9f256133d9a9', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":43,\"name\":\"Котлета по-киевски с пюре\",\"qty\":1,\"price\":364,\"old_price\":0,\"line_total\":364,\"photos\":[\"/static/uploads/products/1/09cd5b0d1aed7a48097d4dc409448df0.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":27,\"name\":\"Котлета по-киевски\",\"quantity\":1,\"price\":249,\"total\":249}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":14,\"name\":\"Пюре с куриной котлетой\",\"qty\":1,\"price\":278,\"old_price\":0,\"line_total\":278,\"photos\":[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":13,\"name\":\"Куринная котлета\",\"quantity\":1,\"price\":163,\"total\":163}],\"auto_add\":0}]', 642.00, 0.00, '2026-02-02 07:30:13', 4, 1, 1, 1, 0, NULL, 'web', 1),
(128, '992de4bb-2ba8-4cce-958b-ab7e72a4b7b2', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":40,\"name\":\"Жареная картошка\",\"qty\":1,\"price\":200,\"old_price\":0,\"line_total\":200,\"photos\":[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"],\"ingredients\":[{\"ingredient_id\":15,\"name\":\"Картофель\",\"quantity\":250,\"price\":0.8,\"total\":200},{\"ingredient_id\":65,\"name\":\"Лук репчатый\",\"quantity\":0,\"price\":1000,\"total\":0},{\"ingredient_id\":66,\"name\":\"Шампиньоны\",\"quantity\":0,\"price\":2500,\"total\":0},{\"ingredient_id\":68,\"name\":\"Масло с зеленью\",\"quantity\":0,\"price\":2700,\"total\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 259.00, 59.00, '2026-02-02 07:45:00', 4, 1, 1, 1, 0, NULL, 'web', 1),
(129, 'cefed2c6-cc9f-4da9-b5ff-256c698c41e4', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":40,\"name\":\"Жареная картошка\",\"qty\":1,\"price\":200,\"old_price\":0,\"line_total\":200,\"photos\":[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"],\"ingredients\":[{\"ingredient_id\":15,\"name\":\"Картофель\",\"quantity\":250,\"price\":0.8,\"total\":200},{\"ingredient_id\":65,\"name\":\"Лук репчатый\",\"quantity\":0,\"price\":1000,\"total\":0},{\"ingredient_id\":66,\"name\":\"Шампиньоны\",\"quantity\":0,\"price\":2500,\"total\":0},{\"ingredient_id\":68,\"name\":\"Масло с зеленью\",\"quantity\":0,\"price\":2700,\"total\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 259.00, 59.00, '2026-02-02 07:50:21', 4, 1, 1, 1, 0, NULL, 'web', 1),
(130, 'a84a2fb8-d2e7-4206-8361-f5c6ab41f246', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":40,\"name\":\"Жареная картошка\",\"qty\":1,\"price\":200,\"old_price\":0,\"line_total\":200,\"photos\":[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"],\"ingredients\":[{\"ingredient_id\":15,\"name\":\"Картофель\",\"quantity\":250,\"price\":0.8,\"total\":200},{\"ingredient_id\":65,\"name\":\"Лук репчатый\",\"quantity\":0,\"price\":1000,\"total\":0},{\"ingredient_id\":66,\"name\":\"Шампиньоны\",\"quantity\":0,\"price\":2500,\"total\":0},{\"ingredient_id\":68,\"name\":\"Масло с зеленью\",\"quantity\":0,\"price\":2700,\"total\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":39,\"name\":\"Тефтели с пюре\",\"qty\":1,\"price\":204,\"old_price\":0,\"line_total\":204,\"photos\":[\"/static/uploads/products/1/97f3015b45f4aad749bb4bae10190c93.jpg\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":7,\"name\":\"Тефтели с рисом\",\"quantity\":1,\"price\":89,\"total\":89}],\"auto_add\":0}]', 404.00, 0.00, '2026-02-02 07:51:23', 4, 1, 1, 1, 0, NULL, 'web', 1),
(131, 'c7b000e3-54fa-430f-a3cc-71cea1ff7017', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":7,\"name\":\"Первое+второе\",\"qty\":1,\"price\":608,\"old_price\":0,\"line_total\":608,\"photos\":[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\",\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\"],\"selections\":[{\"product_id\":37,\"product_name\":\"Солянка мясная сборная\",\"product_photo\":\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[{\"ingredient_id\":71,\"name\":\"Долька лимона\",\"quantity\":0,\"qty\":0,\"unit\":\"шт\"}]},{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":250,\"qty\":250,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":2,\"qty\":2,\"unit\":\"шт\"}]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"type\":\"combo\",\"combo_id\":8,\"name\":\"Первое+второе+напиток\",\"qty\":1,\"price\":452,\"old_price\":0,\"line_total\":452,\"photos\":[\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/982378c58c89cbeee716a8e782a77987.jpg\"],\"selections\":[{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]},{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":81,\"product_name\":\"Морс Малина\",\"product_photo\":\"/static/uploads/products/1/982378c58c89cbeee716a8e782a77987.jpg\",\"variant_label\":\"500\",\"variant_group_title\":\"Объем напитка\",\"variant_unit\":\"мл\",\"ingredients_display\":[]}],\"auto_add\":0}]', 1060.00, 0.00, '2026-02-03 14:20:04', 4, 1, 3, 1, 0, '2026-02-04 10:00:00', 'web', 1),
(132, '0b7ece46-a1e9-4595-befa-96b0ceccb414', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":41,\"name\":\"Котлета по-домашнемй с гречкой\",\"qty\":2,\"price\":374,\"old_price\":0,\"line_total\":748,\"photos\":[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"],\"ingredients\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"price\":0.5933333333333334,\"total\":89},{\"ingredient_id\":26,\"name\":\"Котлета по-домашнему\",\"quantity\":1,\"price\":149,\"total\":149}],\"auto_add\":0}]', 748.00, 0.00, '2026-02-04 09:21:08', 4, 1, 1, 1, 0, NULL, 'web', 1),
(133, '08b7fa87-6b0c-4bd1-97ea-dfaa54f39d48', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 59.00, 59.00, '2026-02-04 09:23:35', 4, 1, 1, 1, 0, NULL, 'web', 1),
(134, 'aa9c6c93-2522-4ba0-996b-32d716caf61a', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":1,\"price\":411,\"old_price\":0,\"line_total\":411,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":2,\"price\":313,\"old_price\":0,\"line_total\":626,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}],\"auto_add\":0},{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":1,\"price\":411,\"old_price\":0,\"line_total\":411,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0}]', 1448.00, 0.00, '2026-02-04 09:35:17', 4, 1, 1, 1, 0, NULL, 'web', 1),
(135, '0b78624a-5bb7-43b4-aad8-ff5618644ff9', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":1,\"price\":411,\"old_price\":0,\"line_total\":411,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":2,\"price\":313,\"old_price\":0,\"line_total\":626,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}],\"auto_add\":0}]', 1037.00, 0.00, '2026-02-04 10:11:48', 4, 1, 1, 1, 0, NULL, 'web', 1),
(136, '6cced4b1-1056-4821-b53f-17a2e132837c', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":1,\"price\":411,\"old_price\":0,\"line_total\":411,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":8,\"name\":\"Макароны с тефтелями\",\"qty\":1,\"price\":328,\"old_price\":0,\"line_total\":328,\"photos\":[\"/static/uploads/products/1/d47962e1e258c2369161a1c86ccf0e3b.jpg\"],\"ingredients\":[{\"ingredient_id\":23,\"name\":\"Макароны\",\"quantity\":150,\"price\":0.6,\"total\":90},{\"ingredient_id\":7,\"name\":\"Тефтели с рисом\",\"quantity\":2,\"price\":89,\"total\":178}],\"auto_add\":0}]', 739.00, 0.00, '2026-02-04 10:12:24', 4, 1, 1, 1, 0, NULL, 'web', 1),
(137, 'f5821a1c-14ad-40fa-8f23-96547f53bad3', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":2,\"price\":313,\"old_price\":0,\"line_total\":626,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 626.00, 0.00, '2026-02-04 10:14:21', 4, 1, 1, 1, 0, NULL, 'web', 1),
(138, '25cad03e-d391-4d64-b080-73eca81e34f8', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":2,\"price\":411,\"old_price\":0,\"line_total\":822,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 822.00, 0.00, '2026-02-04 10:18:36', 4, 1, 1, 1, 0, NULL, 'web', 1),
(139, '9276be66-29bb-4b40-a656-6a75b05763ee', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":3,\"price\":411,\"old_price\":0,\"line_total\":1233,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0},{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":1,\"price\":313,\"old_price\":0,\"line_total\":313,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}],\"auto_add\":0}]', 1546.00, 0.00, '2026-02-04 11:52:28', 4, 1, 1, 1, 0, NULL, 'web', 1),
(140, 'adcc8b37-7de6-4a05-98dc-43a205fd2b4a', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":3,\"name\":\"Пюре с сосисками\",\"qty\":1,\"price\":313,\"old_price\":0,\"line_total\":390,\"photos\":[\"/static/uploads/products/1/cbffc8a00b3f750e1cef0127ddda7aff.png\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":250,\"price\":0.7689489718202589,\"total\":192.23724295506472},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":2,\"price\":99,\"total\":198}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":2,\"price\":15,\"old_price\":0,\"line_total\":15,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 405.00, 0.00, '2026-02-04 15:59:01', 4, 1, 3, 1, 0, '2026-02-05 10:00:00', 'web', 1),
(141, '0ce237ce-90a5-4086-b28a-e750baf7a27b', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"type\":\"combo\",\"combo_id\":9,\"name\":\"Второе+суп\",\"qty\":1,\"price\":505,\"old_price\":0,\"line_total\":505,\"photos\":[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"/static/uploads/products/1/982378c58c89cbeee716a8e782a77987.jpg\"],\"selections\":[{\"product_id\":42,\"product_name\":\"Баварская колбаска с гречкой\",\"product_photo\":\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\",\"variant_label\":\"\",\"variant_group_title\":\"\",\"variant_unit\":\"\",\"ingredients_display\":[{\"ingredient_id\":21,\"name\":\"Гречка с овощами\",\"quantity\":150,\"qty\":150,\"unit\":\"г\"},{\"ingredient_id\":25,\"name\":\"Баварская колбаска\",\"quantity\":1,\"qty\":1,\"unit\":\"шт\"}]},{\"product_id\":38,\"product_name\":\"Гороховый с копченостями\",\"product_photo\":\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\",\"variant_label\":\"250\",\"variant_group_title\":\"Супа (Грамм)\",\"variant_unit\":\"г\",\"ingredients_display\":[]},{\"product_id\":81,\"product_name\":\"Морс Малина\",\"product_photo\":\"/static/uploads/products/1/982378c58c89cbeee716a8e782a77987.jpg\",\"variant_label\":\"500\",\"variant_group_title\":\"Объем напитка\",\"variant_unit\":\"мл\",\"ingredients_display\":[]}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 505.00, 0.00, '2026-02-04 16:00:20', 4, 1, 3, 1, 0, '2026-02-05 10:00:00', 'web', 1),
(142, '27316289-7095-4a29-b66b-b443a7122016', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":29,\"name\":\"Яичница\",\"qty\":3,\"price\":148,\"old_price\":0,\"line_total\":444,\"photos\":[\"/static/uploads/products/1/21cf271eb4118f623ca344c23a8208b0.png\"],\"ingredients\":[{\"ingredient_id\":70,\"name\":\"Яйцо жареное\",\"quantity\":1,\"price\":49,\"total\":49},{\"ingredient_id\":28,\"name\":\"Сосиски жареные\",\"quantity\":1,\"price\":99,\"total\":99}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 444.00, 0.00, '2026-02-04 16:03:37', 4, 1, 3, 1, 0, '2026-02-05 10:00:00', 'web', 1),
(143, 'c641b214-ef45-4528-88d3-b683a830e0d3', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":40,\"name\":\"Жареная картошка\",\"qty\":1,\"price\":200,\"old_price\":0,\"line_total\":200,\"photos\":[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"],\"ingredients\":[{\"ingredient_id\":65,\"name\":\"Лук репчатый\",\"quantity\":0,\"price\":1000,\"total\":0},{\"ingredient_id\":66,\"name\":\"Шампиньоны\",\"quantity\":0,\"price\":2500,\"total\":0},{\"ingredient_id\":68,\"name\":\"Масло с зеленью\",\"quantity\":0,\"price\":2700,\"total\":0}],\"variants\":[{\"variant_group_id\":4,\"variant_value_index\":1,\"group_title\":\"Гарнира (Грамм)\",\"value\":\"250 г\",\"label\":\"250 г\",\"price_diff\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 259.00, 59.00, '2026-02-04 16:22:14', 4, 1, 3, 1, 0, '2026-02-05 10:00:00', 'web', 1),
(144, '693023da-a6b5-40d2-8bc3-fc19845ce4ab', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":8,\"name\":\"Макароны с тефтелями\",\"qty\":1,\"price\":328,\"old_price\":0,\"line_total\":328,\"photos\":[\"/static/uploads/products/1/d47962e1e258c2369161a1c86ccf0e3b.jpg\"],\"ingredients\":[{\"ingredient_id\":23,\"name\":\"Макароны\",\"quantity\":150,\"price\":0.6,\"total\":90},{\"ingredient_id\":7,\"name\":\"Тефтели с рисом\",\"quantity\":2,\"price\":89,\"total\":178}],\"auto_add\":0}]', 387.00, 59.00, '2026-02-05 04:48:57', 4, 1, 1, 1, 0, NULL, 'web', 1),
(145, 'f420dd5d-a466-4bc6-bdeb-678ce236cf73', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":40,\"name\":\"Жареная картошка\",\"qty\":1,\"price\":200,\"old_price\":0,\"line_total\":200,\"photos\":[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"],\"ingredients\":[{\"ingredient_id\":65,\"name\":\"Лук репчатый\",\"quantity\":0,\"price\":1000,\"total\":0},{\"ingredient_id\":66,\"name\":\"Шампиньоны\",\"quantity\":0,\"price\":2500,\"total\":0},{\"ingredient_id\":68,\"name\":\"Масло с зеленью\",\"quantity\":0,\"price\":2700,\"total\":0}],\"variants\":[{\"variant_group_id\":4,\"variant_value_index\":1,\"group_title\":\"Гарнира (Грамм)\",\"value\":\"250 г\",\"label\":\"250 г\",\"price_diff\":0}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 259.00, 59.00, '2026-02-05 04:49:25', 4, 1, 1, 1, 0, NULL, 'web', 1),
(146, 'a2a061b6-293f-4ca6-90c2-eae70460b985', 1, 1, 1, 'Максим', '79021461966', NULL, 'Октябрьская 25, подъезд 1, этаж 4, кв 45', NULL, 1, NULL, 0, 0.00, '[{\"product_id\":39,\"name\":\"Тефтели с пюре\",\"qty\":1,\"price\":204,\"old_price\":0,\"line_total\":204,\"photos\":[\"/static/uploads/products/1/97f3015b45f4aad749bb4bae10190c93.jpg\"],\"ingredients\":[{\"ingredient_id\":12,\"name\":\"Картофельное пюре\",\"quantity\":150,\"price\":0.7689489718202589,\"total\":115.34234577303883},{\"ingredient_id\":7,\"name\":\"Тефтели с рисом\",\"quantity\":1,\"price\":89,\"total\":89}],\"auto_add\":0},{\"product_id\":59,\"name\":\"Приборы\",\"qty\":1,\"price\":15,\"old_price\":0,\"line_total\":0,\"photos\":[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"],\"auto_add\":0}]', 263.00, 59.00, '2026-02-05 04:51:33', 4, 1, 1, 1, 0, NULL, 'web', 1);

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

INSERT INTO `prod_auto_add_groups` (`id`, `tenant_id`, `title`, `description`, `min_cart_amount`, `max_cart_amount`, `include_auto_in_total`, `max_items_qty`, `allow_customer_qty`, `allow_customer_remove`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 'Приборы', NULL, 1.00, NULL, 1, NULL, 1, 1, 1, 0, '2026-01-29 18:25:55', '2026-01-30 05:14:26');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_auto_add_items`
--

CREATE TABLE `prod_auto_add_items` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_auto_add_items` (`id`, `tenant_id`, `group_id`, `product_id`, `default_qty`, `min_qty`, `max_qty`, `price_override`, `free_first_qty`, `free_per_amount`, `free_per_amount_qty`, `max_free_qty`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(3, 1, 1, 59, 1, 1, NULL, NULL, 1, 500.00, 1, NULL, 1, 0, '2026-01-30 05:07:19', '2026-02-03 13:06:31');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_categories`
--

CREATE TABLE `prod_categories` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
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

INSERT INTO `prod_categories` (`id`, `tenant_id`, `code`, `title`, `icon`, `site_visibility`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 'all', 'Все товары', '/static/uploads/categories/91156401f285b03bed37f9561f1b2fe4.jpg', 1, 1, 0, '2026-01-03 07:37:51', '2026-02-01 13:33:35'),
(2, 1, 'burgers', 'Салаты', '/static/uploads/categories/887417257c45dc1bd3fd5de970168993.jpg', 1, 1, 60, '2026-01-03 07:37:51', '2026-02-02 13:46:04'),
(3, 1, 'drinks', 'Закуски', '/static/uploads/categories/43b5da1647bd1900bca78cb0f3cb4f84.jpg', 1, 1, 70, '2026-01-03 07:37:51', '2026-02-02 13:46:12'),
(4, 1, 'cat-mk239ojm', 'Горячее', '/static/uploads/categories/53c6650bd9db23a988886c53c50751ad.jpg', 1, 1, 50, '2026-01-06 04:27:59', '2026-02-02 13:46:04'),
(5, 1, 'cat-mk2a0iyv', 'Гарнир', '/static/uploads/categories/3663ec08dafff609f21e780ac206741a.jpg', 1, 1, 40, '2026-01-06 07:36:49', '2026-02-02 13:46:04'),
(6, 1, 'cat-mk2nkp4p', 'Супы', '/static/uploads/categories/05aee622a14776d699ab77bb592237f8.jpg', 1, 1, 30, '2026-01-06 13:56:26', '2026-02-02 13:46:04'),
(7, 1, 'cat-mk57sj5q', 'Вторые блюда', '/static/uploads/categories/fb33b457cb3ce9aaa9933358cc2c200c.jpg', 1, 1, 20, '2026-01-08 08:57:56', '2026-02-02 13:46:04'),
(8, 1, 'cat-mkgtrfi2', 'Продукты', '/static/uploads/categories/1c1701f8a4e90f2cf1ff4658c979054c.jpg', 0, 1, 110, '2026-01-16 11:58:24', '2026-02-02 13:46:12'),
(9, 1, 'cat-ml0f74l8', 'Упаковка', '/static/uploads/categories/9e53e3abcb5b7277987201dc695eea54.jpg', 0, 1, 120, '2026-01-30 05:06:05', '2026-02-02 13:46:12'),
(10, 1, 'cat-ml1571gc', 'Полуфабрикаты', '/static/uploads/categories/5eeb0ff37c3ebe08b2915228a6bd8d16.jpg', 0, 1, 100, '2026-01-30 17:13:50', '2026-02-02 13:46:12'),
(11, 1, 'cat-ml3cdrkt', 'Добавки', '/static/uploads/categories/4fcd1ca6979a2e7c69567b5c529c398f.jpg', 1, 1, 90, '2026-02-01 06:10:35', '2026-02-02 13:46:12'),
(12, 1, 'cat-ml3kiwci', 'Напитки', '/static/uploads/categories/cc3d5680c613a5c597a6472ecdfac683.jpg', 1, 1, 80, '2026-02-01 09:58:30', '2026-02-02 13:46:12'),
(13, 1, 'cat-ml5837lr', 'Комбо обеды', '/static/uploads/categories/1780ce6a60e0245c74a8e84967292bbd.png', 1, 1, 10, '2026-02-02 13:45:56', '2026-02-02 13:46:11');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_combos`
--

CREATE TABLE `prod_combos` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Название комбо, напр. Второе + суп или салат',
  `description` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Подпись: На обед, На обед и ужин',
  `discount_percent` decimal(5,2) NOT NULL DEFAULT '0.00' COMMENT 'Скидка в % на всё комбо',
  `category_code` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Категория каталога: lunch, breakfast и т.д.',
  `image_url` varchar(500) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Картинка карточки в каталоге',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Комбо-наборы';

--
-- Дамп данных таблицы `prod_combos`
--

INSERT INTO `prod_combos` (`id`, `tenant_id`, `title`, `description`, `discount_percent`, `category_code`, `image_url`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(9, 1, 'Второе+суп', 'е6776', 5.00, 'cat-ml5837lr', NULL, 1, 0, '2026-02-04 09:27:29', '2026-02-04 11:34:46');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_combo_blocks`
--

CREATE TABLE `prod_combo_blocks` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `title` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Название блока для админки',
  `sort_order` int NOT NULL DEFAULT '0',
  `min_select` int UNSIGNED NOT NULL DEFAULT '1' COMMENT 'Минимум товаров в блоке',
  `max_select` int UNSIGNED NOT NULL DEFAULT '1' COMMENT 'Максимум товаров в блоке',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Блоки комбо (слоты выбора)';

--
-- Дамп данных таблицы `prod_combo_blocks`
--

INSERT INTO `prod_combo_blocks` (`id`, `tenant_id`, `title`, `sort_order`, `min_select`, `max_select`, `created_at`, `updated_at`) VALUES
(2, 1, 'Суп', 0, 1, 1, '2026-02-02 12:21:10', '2026-02-02 12:21:10'),
(3, 1, 'Второе', 0, 1, 1, '2026-02-02 12:52:42', '2026-02-02 12:52:42'),
(4, 1, 'Напиток', 0, 1, 1, '2026-02-03 06:18:28', '2026-02-03 06:18:28');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_combo_block_products`
--

CREATE TABLE `prod_combo_block_products` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `block_id` bigint UNSIGNED NOT NULL,
  `product_id` bigint UNSIGNED NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `is_default` tinyint(1) NOT NULL DEFAULT '0' COMMENT 'Товар по умолчанию в блоке (один на блок)',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Товары в блоке комбо';

--
-- Дамп данных таблицы `prod_combo_block_products`
--

INSERT INTO `prod_combo_block_products` (`id`, `tenant_id`, `block_id`, `product_id`, `sort_order`, `is_default`, `created_at`, `updated_at`) VALUES
(38, 1, 3, 42, 0, 1, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(39, 1, 3, 48, 6, 1, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(40, 1, 3, 40, 7, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(41, 1, 3, 52, 8, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(42, 1, 3, 41, 9, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(43, 1, 3, 50, 10, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(44, 1, 3, 46, 11, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(45, 1, 3, 43, 12, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(46, 1, 3, 51, 13, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(47, 1, 3, 9, 14, 0, '2026-02-02 13:36:18', '2026-02-02 13:36:18'),
(48, 1, 3, 8, 15, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(49, 1, 3, 14, 20, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(50, 1, 3, 3, 21, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(51, 1, 3, 45, 23, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(52, 1, 3, 49, 24, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(53, 1, 3, 44, 25, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(54, 1, 3, 39, 26, 0, '2026-02-02 13:36:19', '2026-02-02 13:36:19'),
(57, 1, 2, 38, 1, 1, '2026-02-02 17:16:41', '2026-02-02 17:16:41'),
(58, 1, 2, 37, 5, 1, '2026-02-02 17:16:42', '2026-02-02 17:16:42'),
(59, 1, 4, 81, 0, 1, '2026-02-03 06:18:28', '2026-02-03 06:18:28'),
(60, 1, 4, 80, 1, 1, '2026-02-03 06:18:28', '2026-02-03 06:18:28');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_combo_set_blocks`
--

CREATE TABLE `prod_combo_set_blocks` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `combo_id` bigint UNSIGNED NOT NULL,
  `block_id` bigint UNSIGNED NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Блоки в комбо-наборе (один блок можно добавить несколько раз)';

--
-- Дамп данных таблицы `prod_combo_set_blocks`
--

INSERT INTO `prod_combo_set_blocks` (`id`, `tenant_id`, `combo_id`, `block_id`, `sort_order`, `created_at`, `updated_at`) VALUES
(71, 1, 9, 3, 0, '2026-02-04 11:51:22', '2026-02-04 11:51:22'),
(72, 1, 9, 2, 1, '2026-02-04 11:51:22', '2026-02-04 11:51:22'),
(73, 1, 9, 4, 2, '2026-02-04 11:51:22', '2026-02-04 11:51:22');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_assignments`
--

CREATE TABLE `prod_option_assignments` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_option_assignments` (`id`, `tenant_id`, `group_id`, `assign_type`, `assign_id`, `priority`, `sort_order`, `out_of_stock_action`, `is_active`, `selection_type`, `min_select`, `max_select`, `created_at`, `updated_at`) VALUES
(119, 1, 14, 'product', 21, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(120, 1, 14, 'product', 22, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(121, 1, 14, 'product', 12, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(122, 1, 14, 'product', 23, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(123, 1, 14, 'product', 6, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(124, 1, 15, 'product', 25, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(125, 1, 15, 'product', 30, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(126, 1, 15, 'product', 26, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(127, 1, 15, 'product', 27, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(128, 1, 15, 'product', 13, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(129, 1, 15, 'product', 31, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(130, 1, 15, 'product', 4, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(131, 1, 15, 'product', 24, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(132, 1, 15, 'product', 28, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(133, 1, 15, 'product', 7, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-30 08:22:32', '2026-01-30 08:22:32'),
(135, 1, 16, 'product', 40, 0, 0, 1, 0, 'single', NULL, NULL, '2026-01-31 00:45:06', '2026-01-31 03:41:10'),
(136, 1, 15, 'product', 29, 0, 0, 1, 1, 'single', NULL, NULL, '2026-01-31 11:43:58', '2026-01-31 11:43:58'),
(139, 1, 17, 'product', 38, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 07:49:29', '2026-02-01 07:49:29'),
(140, 1, 17, 'product', 37, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 07:49:29', '2026-02-01 07:49:29'),
(141, 1, 18, 'product', 38, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 09:34:32', '2026-02-01 09:34:32'),
(142, 1, 18, 'product', 37, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 09:34:32', '2026-02-01 09:34:32'),
(143, 1, 19, 'product', 55, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 11:00:59', '2026-02-01 11:00:59'),
(144, 1, 19, 'product', 56, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 11:01:06', '2026-02-01 11:01:06'),
(145, 1, 19, 'product', 54, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 11:01:14', '2026-02-01 11:01:14'),
(146, 1, 19, 'product', 86, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 11:01:20', '2026-02-01 11:01:20'),
(147, 1, 20, 'product', 53, 0, 0, 1, 1, 'single', NULL, NULL, '2026-02-01 11:05:29', '2026-02-01 11:05:29');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_exclusions`
--

CREATE TABLE `prod_option_exclusions` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_option_groups` (`id`, `tenant_id`, `title`, `selection_type`, `min_select`, `max_select`, `is_active`, `sort_order`, `created_at`, `updated_at`, `is_required`, `allow_variants`, `out_of_stock_action`) VALUES
(14, 1, 'Горячее', 'single', 0, NULL, 1, 0, '2026-01-30 08:22:11', '2026-01-30 08:22:11', 0, 1, 1),
(15, 1, 'Гарнир', 'single', 0, NULL, 1, 0, '2026-01-30 08:22:31', '2026-01-30 08:22:31', 0, 1, 1),
(16, 1, 'Добавки для жареной картошки', 'multiple', 0, NULL, 1, 0, '2026-01-31 00:45:05', '2026-01-31 00:46:04', 0, 0, 1),
(17, 1, 'Соус к супу', 'single', 0, NULL, 1, 0, '2026-02-01 06:22:27', '2026-02-01 09:28:59', 0, 1, 1),
(18, 1, 'Добавки', 'multiple', 0, NULL, 1, 0, '2026-02-01 09:31:30', '2026-02-01 09:31:30', 0, 0, 1),
(19, 1, 'Соус', 'multiple', 0, NULL, 1, 0, '2026-02-01 10:44:46', '2026-02-01 10:44:46', 0, 1, 1),
(20, 1, 'Сладкий соус', 'multiple', 0, NULL, 1, 0, '2026-02-01 10:47:54', '2026-02-01 10:53:04', 0, 1, 1);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_items`
--

CREATE TABLE `prod_option_items` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_option_items` (`id`, `tenant_id`, `group_id`, `title`, `description`, `target_type`, `target_product_id`, `target_category_id`, `price_mode`, `price_value`, `qty_min`, `qty_max`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(79, 1, 14, NULL, NULL, 'product', 25, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(80, 1, 14, NULL, NULL, 'product', 30, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(81, 1, 14, NULL, NULL, 'product', 26, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(82, 1, 14, NULL, NULL, 'product', 27, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(83, 1, 14, NULL, NULL, 'product', 13, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(84, 1, 14, NULL, NULL, 'product', 31, NULL, 'from_target', 0.00, 1, 1, 1, 50, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(85, 1, 14, NULL, NULL, 'product', 4, NULL, 'from_target', 0.00, 1, 1, 1, 60, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(86, 1, 14, NULL, NULL, 'product', 24, NULL, 'from_target', 0.00, 1, 1, 1, 70, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(87, 1, 14, NULL, NULL, 'product', 28, NULL, 'from_target', 0.00, 1, 1, 1, 80, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(88, 1, 14, NULL, NULL, 'product', 7, NULL, 'from_target', 0.00, 1, 1, 1, 90, '2026-01-30 08:22:11', '2026-01-30 08:22:11'),
(90, 1, 15, NULL, NULL, 'product', 21, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(91, 1, 15, NULL, NULL, 'product', 22, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(92, 1, 15, NULL, NULL, 'product', 12, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(93, 1, 15, NULL, NULL, 'product', 23, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(94, 1, 15, NULL, NULL, 'product', 6, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-01-30 08:22:31', '2026-01-30 08:22:31'),
(95, 1, 16, NULL, NULL, 'product', 68, NULL, 'fixed', 30.00, 1, 1, 1, 0, '2026-01-31 00:45:05', '2026-01-31 00:45:05'),
(96, 1, 16, NULL, NULL, 'product', 65, NULL, 'fixed', 30.00, 1, 1, 1, 10, '2026-01-31 00:45:05', '2026-01-31 00:45:05'),
(97, 1, 16, NULL, NULL, 'product', 66, NULL, 'fixed', 80.00, 1, 1, 1, 20, '2026-01-31 00:45:05', '2026-01-31 00:45:05'),
(98, 1, 17, NULL, NULL, 'product', 73, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-02-01 06:22:27', '2026-02-01 06:22:27'),
(100, 1, 17, NULL, NULL, 'product', 72, NULL, 'from_target', 0.00, 1, 1, 1, 20, '2026-02-01 06:22:27', '2026-02-01 06:22:27'),
(103, 1, 18, NULL, NULL, 'product', 58, NULL, 'from_target', 0.00, 0, 5, 1, 0, '2026-02-01 09:31:30', '2026-02-01 09:35:09'),
(104, 1, 18, NULL, NULL, 'product', 57, NULL, 'from_target', 0.00, 0, 5, 1, 10, '2026-02-01 09:31:30', '2026-02-01 09:35:09'),
(105, 1, 19, NULL, NULL, 'product', 79, NULL, 'from_target', 0.00, 1, 1, 1, 0, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(106, 1, 19, NULL, NULL, 'product', 73, NULL, 'from_target', 0.00, 1, 1, 1, 10, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(108, 1, 19, NULL, NULL, 'product', 75, NULL, 'from_target', 0.00, 1, 1, 1, 30, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(109, 1, 19, NULL, NULL, 'product', 72, NULL, 'from_target', 0.00, 1, 1, 1, 40, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(110, 1, 19, NULL, NULL, 'product', 74, NULL, 'from_target', 0.00, 1, 1, 1, 50, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(111, 1, 19, NULL, NULL, 'product', 77, NULL, 'from_target', 0.00, 1, 1, 1, 60, '2026-02-01 10:44:46', '2026-02-01 10:44:46'),
(112, 1, 19, NULL, NULL, 'product', 78, NULL, 'from_target', 0.00, 1, 1, 1, 70, '2026-02-01 10:44:46', '2026-02-01 10:44:46');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_option_overrides`
--

CREATE TABLE `prod_option_overrides` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_products` (`id`, `tenant_id`, `name`, `sku`, `description_short`, `description`, `price`, `old_price`, `cost_price`, `unit_id`, `photos_json`, `is_active`, `site_visibility`, `created_at`, `updated_at`, `base_unit_id`, `base_qty`) VALUES
(3, 1, 'Пюре с сосисками', NULL, NULL, NULL, 313.34, NULL, 76.21, 6, '[\"/static/uploads/products/1/aa9767ad1415f1cc4dfac5f9310d9cc8.webp\"]', 1, 1, '2026-01-05 15:54:34', '2026-02-05 06:17:36', 6, NULL),
(4, 1, 'Минтай в кляре', NULL, NULL, NULL, 149.00, 179.00, 0.00, NULL, '[\"/static/uploads/products/1/446502b1bce3809a4303e8c7f4345d51.jpg\"]', 1, 0, '2026-01-06 04:28:49', '2026-02-01 10:21:36', NULL, NULL),
(6, 1, 'Рис с овощами', NULL, NULL, NULL, 800.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/b7d5215763b1e8b3a3a05564c83352f0.jpg\"]', 1, 1, '2026-01-06 07:37:17', '2026-02-01 14:26:48', 2, NULL),
(7, 1, 'Тефтели с рисом', NULL, NULL, NULL, 89.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/09c238e8cea082a8ce2a57359b649b7d.jpg\"]', 1, 1, '2026-01-06 13:56:46', '2026-02-01 14:27:01', 1, NULL),
(8, 1, 'Макароны с тефтелями', NULL, NULL, NULL, 328.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/d47962e1e258c2369161a1c86ccf0e3b.jpg\"]', 1, 1, '2026-01-08 03:44:37', '2026-01-31 02:14:53', 6, NULL),
(9, 1, 'Макароны с печенью', NULL, NULL, NULL, 456.00, 678.00, 0.00, NULL, '[\"/static/uploads/products/1/59e45a1798151b95d447fad186c77ff0.jpg\"]', 1, 0, '2026-01-08 03:45:00', '2026-01-31 01:03:37', NULL, NULL),
(10, 1, 'Котлета с пюрешкой', NULL, '', '', 299.00, 319.00, NULL, NULL, '[\"/static/uploads/products/1/48df187f637a1df0f3e763d1191989d8.jpg\"]', 0, 0, '2026-01-08 08:58:27', '2026-01-30 17:06:00', NULL, NULL),
(11, 1, 'Фрикадельки с пюрешкой', NULL, '', '', 599.00, 768.00, 100.00, 6, '[\"/static/uploads/products/1/c7ee582d4fddf82778bdf23b8ab25754.jpg\"]', 0, 0, '2026-01-08 08:58:54', '2026-01-30 17:05:58', 6, NULL),
(12, 1, 'Картофельное пюре', NULL, NULL, NULL, 1009.63, NULL, 141.93, 3, '[\"/static/uploads/products/1/9fdc3cffd1457f84af2705bfc55c33a2.webp\"]', 1, 1, '2026-01-16 10:32:24', '2026-02-02 07:28:30', 3, 1313.000),
(13, 1, 'Куринная котлета', NULL, NULL, NULL, 163.00, NULL, 55.00, 1, '[\"/static/uploads/products/1/fe6e72ac1ce743c145b235225287a820.webp\"]', 1, 1, '2026-01-16 10:33:13', '2026-01-31 07:11:39', 1, NULL),
(14, 1, 'Пюре с куриной котлетой', NULL, NULL, NULL, 278.34, NULL, 71.21, 3, '[\"/static/uploads/products/1/8d7527fdbc8e7476d39e29192a4d70d0.webp\"]', 1, 1, '2026-01-16 10:34:30', '2026-02-02 07:29:03', 3, 230.000),
(15, 1, 'Картофель', NULL, NULL, NULL, 800.00, NULL, 100.00, 2, '[\"/static/uploads/products/1/6ec0482c5b64bc892b95d4d799d278b3.webp\"]', 1, 0, '2026-01-16 11:58:13', '2026-02-02 07:28:25', 2, 1.000),
(16, 1, 'Масло сливочное', NULL, NULL, NULL, 300.00, NULL, 60.00, 3, '[\"/static/uploads/products/1/fd170c1d0a9402b11b304e7090e1ee7c.webp\"]', 1, 0, '2026-01-16 12:01:19', '2026-01-31 07:13:11', 3, 180.000),
(17, 1, 'Молоко', NULL, NULL, NULL, 500.00, NULL, 100.00, 2, '[\"/static/uploads/products/1/6e18cdc9e15ef0c2622e9a619b1c3725.webp\"]', 1, 0, '2026-01-16 12:02:03', '2026-01-31 06:49:43', 2, NULL),
(19, 1, 'Соль', NULL, NULL, NULL, 100.00, NULL, 20.00, 2, NULL, 1, 0, '2026-01-18 06:44:53', '2026-01-31 06:50:28', 2, 1.000),
(20, 1, 'Фарш куринный', NULL, NULL, NULL, 0.00, NULL, 400.00, 2, NULL, 1, 0, '2026-01-18 06:57:10', '2026-01-18 14:10:29', 2, NULL),
(21, 1, 'Гречка с овощами', NULL, NULL, NULL, 89.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/ccbfd8c94a01992063130008a89452ca.webp\"]', 1, 1, '2026-01-19 18:06:45', '2026-01-30 04:05:41', 3, 150.000),
(22, 1, 'Капуста тушеная', NULL, NULL, NULL, 600.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/a754a7149715face9e71daac3d651b59.webp\"]', 1, 1, '2026-01-30 03:38:43', '2026-01-30 03:38:43', 2, NULL),
(23, 1, 'Макароны', NULL, NULL, NULL, 600.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/88477d849f60e18b430295f8e12b1061.webp\"]', 1, 1, '2026-01-30 03:39:10', '2026-01-30 03:39:10', 2, NULL),
(24, 1, 'Рыбная котлета из минтая', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b57692ae543dfefaef1ff04d093746c7.jfif\"]', 1, 1, '2026-01-30 03:40:14', '2026-01-30 03:40:14', 1, NULL),
(25, 1, 'Баварская колбаска', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/387546b338d9cb3fbf5adda71fa61519.webp\"]', 1, 1, '2026-01-30 03:41:09', '2026-01-30 03:41:09', 1, NULL),
(26, 1, 'Котлета по-домашнему', NULL, NULL, NULL, 149.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/e3a21ea69d96f7637126a0d427e6e7b7.webp\"]', 1, 1, '2026-01-30 03:42:24', '2026-01-30 03:42:24', 1, NULL),
(27, 1, 'Котлета по-киевски', NULL, NULL, NULL, 249.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/bf6db8b58873e88c6a06615686aeabfa.png\"]', 1, 1, '2026-01-30 03:42:52', '2026-01-30 03:42:52', 1, NULL),
(28, 1, 'Сосиски жареные', NULL, NULL, NULL, 99.00, NULL, 30.00, 1, '[\"/static/uploads/products/1/fb8fa795484d8d02002ca0295c2cfa3a.webp\"]', 1, 1, '2026-01-30 03:43:12', '2026-01-31 06:31:46', 1, NULL),
(29, 1, 'Яичница', NULL, NULL, NULL, 148.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/21cf271eb4118f623ca344c23a8208b0.png\"]', 1, 1, '2026-01-30 03:43:48', '2026-01-31 01:08:24', 6, 1.000),
(30, 1, 'Гуляш по-домашнему', NULL, NULL, NULL, 1700.00, NULL, 0.00, 2, '[\"/static/uploads/products/1/fb107bf5f71465962515485460bd1f54.jpg\"]', 1, 1, '2026-01-30 03:44:31', '2026-01-30 03:44:31', 2, NULL),
(31, 1, 'Куринная отбивная под грибами и сыром', NULL, NULL, NULL, 299.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b1ad1993f478652c9cf4c5b666628506.jpg\"]', 1, 1, '2026-01-30 03:45:02', '2026-01-30 03:45:02', 1, NULL),
(32, 1, 'С фасолью и колбасой', NULL, NULL, NULL, 125.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/a671cb2deb671b500456cef6dc1b842b.jpg\"]', 1, 1, '2026-01-30 03:46:09', '2026-02-01 09:38:22', 3, 100.000),
(33, 1, 'Сельдь под шубой', NULL, NULL, NULL, 249.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/081b9b17d7ada6c7f05bee5b4cb88acd.jpg\"]', 1, 1, '2026-01-30 03:46:45', '2026-01-30 03:46:45', 1, NULL),
(34, 1, 'Капуста с морковью', NULL, NULL, NULL, 100.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/3ef69553bf0a38d941634905d3dff105.webp\"]', 1, 1, '2026-01-30 03:47:13', '2026-02-01 09:38:45', 3, 100.000),
(35, 1, 'Цезарь с креветкой', NULL, NULL, NULL, 349.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/b71c731e70cb2f94b121626a77885936.jpg\"]', 1, 1, '2026-01-30 03:47:38', '2026-02-02 03:36:58', 6, NULL),
(36, 1, 'Цезарь с курицей', NULL, NULL, NULL, 299.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/9decb5d87640438c04a911b98bba274c.webp\"]', 1, 1, '2026-01-30 03:47:56', '2026-02-02 03:38:50', 6, NULL),
(37, 1, 'Солянка мясная сборная', NULL, NULL, NULL, 249.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/2b04b5dc060e31f2d05231fe302a535d.jpg\"]', 1, 1, '2026-01-30 03:49:20', '2026-01-30 06:40:50', 3, 350.000),
(38, 1, 'Гороховый с копченостями', NULL, NULL, NULL, 249.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/e890061b5c382a1199525afb7b2cfcdf.jpg\"]', 1, 1, '2026-01-30 03:49:52', '2026-01-30 06:41:05', 3, 350.000),
(39, 1, 'Тефтели с пюре', NULL, NULL, NULL, 204.34, NULL, 16.21, 6, '[\"/static/uploads/products/1/97f3015b45f4aad749bb4bae10190c93.jpg\"]', 1, 1, '2026-01-30 03:54:41', '2026-02-02 07:29:03', 6, NULL),
(40, 1, 'Жареная картошка', NULL, NULL, NULL, 200.00, NULL, 25.00, 3, '[\"/static/uploads/products/1/2987a8ec41f868a8261a8e1a2313dde6.jpg\"]', 1, 1, '2026-01-30 03:55:41', '2026-02-02 07:28:31', 3, 250.000),
(41, 1, 'Котлета по-домашнемй с гречкой', NULL, NULL, NULL, 374.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/e18d03a9efaf88344660c8676bcf65c6.jpg\"]', 1, 1, '2026-01-30 04:03:38', '2026-01-30 04:03:38', 6, NULL),
(42, 1, 'Баварская колбаска с гречкой', NULL, NULL, NULL, 238.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/7d1a8f6e36ba24bb8981c2b67eeb8b93.jpg\"]', 1, 1, '2026-01-30 04:07:21', '2026-01-30 04:07:21', 6, NULL),
(43, 1, 'Котлета по-киевски с пюре', NULL, NULL, NULL, 364.34, NULL, 16.21, 6, '[\"/static/uploads/products/1/09cd5b0d1aed7a48097d4dc409448df0.png\"]', 1, 1, '2026-01-30 04:08:36', '2026-02-02 07:29:04', 6, NULL),
(44, 1, 'Сосиски с пюре', NULL, NULL, NULL, 313.34, NULL, 76.21, 6, '[\"/static/uploads/products/1/768d3eb176242147482721b65ee6b822.png\"]', 1, 1, '2026-01-30 04:09:24', '2026-02-02 07:29:04', 6, NULL),
(45, 1, 'Сосиски с гречкой', NULL, NULL, NULL, 346.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/d7ae63615faac2fb6fa3581f243a4813.png\"]', 1, 1, '2026-01-30 04:10:23', '2026-01-30 04:12:29', 6, NULL),
(46, 1, 'Котлета по-киевски с гречкой', NULL, NULL, NULL, 397.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/dbdaec8d6696e654a6d6abdf7408e089.png\"]', 1, 1, '2026-01-30 04:11:50', '2026-01-30 04:11:50', 6, NULL),
(47, 1, 'Вареники с картошкой', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/bfc21614af87135437c0610179da3978.jpg\"]', 1, 1, '2026-01-30 04:15:13', '2026-01-31 00:54:34', 1, NULL),
(48, 1, 'Гуляш с гречкой', NULL, NULL, NULL, 284.33, NULL, 0.00, 6, '[\"/static/uploads/products/1/428a06fdcda49526849c7850e7b8b3d0.jpg\"]', 1, 1, '2026-01-30 04:17:25', '2026-01-30 04:17:25', 6, NULL),
(49, 1, 'Сосиски с макаронами', NULL, NULL, NULL, 348.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/a9de0b28320bebd41869cfba80a52580.jpg\"]', 1, 1, '2026-01-30 04:18:29', '2026-01-30 04:18:47', 6, NULL),
(50, 1, 'Котлета по-домашнему с макаронами', NULL, NULL, NULL, 299.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/29016460b03c5583754ab1c4e0cf17b3.jpg\"]', 1, 1, '2026-01-30 04:19:40', '2026-01-30 04:19:40', 1, NULL),
(51, 1, 'Куриная отбивная под грибами и сыром с пюре', NULL, NULL, NULL, 414.34, NULL, 16.21, 6, '[\"/static/uploads/products/1/2cb08d751796be51255796d4e3bcd314.webp\"]', 1, 1, '2026-01-30 04:20:59', '2026-02-02 07:29:05', 6, NULL),
(52, 1, 'Картофельная запеканка', NULL, NULL, NULL, 299.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/0a4cf805e0a90b6fdec73539e1104d7c.jpg\"]', 1, 1, '2026-01-30 04:21:29', '2026-01-30 04:21:29', 6, NULL),
(53, 1, 'Блины', NULL, NULL, NULL, 49.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/c0c9947e944f3029a3430b9c00685d0f.png\"]', 1, 1, '2026-01-30 04:44:16', '2026-01-31 00:56:51', 1, 1.000),
(54, 1, 'Драники', NULL, NULL, NULL, 222.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b88188e14c42f2d2490a7058d9b9b281.webp\"]', 1, 1, '2026-01-30 04:44:45', '2026-02-01 11:02:13', 1, 3.000),
(55, 1, 'Картофель фри', NULL, NULL, NULL, 112.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/1282e197cceeacfc88d3fd20a1f45f47.webp\"]', 1, 1, '2026-01-30 04:45:49', '2026-01-31 00:59:33', 3, 100.000),
(56, 1, 'Картофель по-деревенски', NULL, NULL, NULL, 133.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/d375080a4e6492a8a12e92d636e75840.jpg\"]', 1, 1, '2026-01-30 04:46:10', '2026-01-31 00:59:19', 3, 100.000),
(57, 1, 'Сухарики в специях', NULL, NULL, NULL, 10.00, NULL, 10.00, 1, '[\"/static/uploads/products/1/55202e6f48fdedcbb0157c92b0ee0e2f.webp\"]', 1, 1, '2026-01-30 04:46:40', '2026-02-01 06:21:47', 1, NULL),
(58, 1, 'Пампушка', NULL, NULL, NULL, 20.00, NULL, 10.00, 1, '[\"/static/uploads/products/1/43a3491f4c955849c818ddfb71178a65.webp\"]', 1, 1, '2026-01-30 04:46:53', '2026-02-01 06:21:40', 1, NULL),
(59, 1, 'Приборы', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/14c44e5ce024bc2f9824aca52360ef00.jpg\"]', 1, 1, '2026-01-30 05:06:15', '2026-01-30 09:06:46', 1, NULL),
(60, 1, 'Рисовая каша', NULL, NULL, NULL, 147.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/153c88657fdd858ab5860be0b0234402.png\"]', 1, 1, '2026-01-30 17:00:24', '2026-01-31 01:02:17', 3, 250.000),
(61, 1, 'Форель жаренная с рисом', NULL, NULL, NULL, 0.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/d53b0401773c632303b94943e227534e.jpg\"]', 1, 0, '2026-01-30 17:00:57', '2026-01-31 01:01:34', 6, NULL),
(62, 1, 'Пельмени с курицей', NULL, NULL, NULL, 18.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/d3b6ac736bb3667dd303ab87e9b72071.png\"]', 1, 1, '2026-01-30 17:01:36', '2026-01-31 00:54:15', 1, 1.000),
(63, 1, 'Минтай в кляре с рисом', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/d606e6871abdb2754aa6c0cf1759a027.jpg\"]', 1, 0, '2026-01-30 17:02:03', '2026-01-31 01:01:26', 1, NULL),
(64, 1, 'Оливье с колбасой', NULL, NULL, NULL, 0.00, NULL, 0.00, 6, '[\"/static/uploads/products/1/7cdb7d669231e38b2b889176d5534b45.jpg\"]', 1, 0, '2026-01-30 17:02:46', '2026-02-01 09:39:02', 6, NULL),
(65, 1, 'Лук репчатый', NULL, NULL, NULL, 1000.00, NULL, 50.00, 2, '[\"/static/uploads/products/1/1d35cdbc0dea217811e93d312175a2de.webp\"]', 1, 1, '2026-01-30 17:12:34', '2026-01-31 03:36:36', 2, 1.000),
(66, 1, 'Шампиньоны', NULL, NULL, NULL, 2500.00, NULL, 500.00, 2, '[\"/static/uploads/products/1/4146751d5654eab88f6cfad823346d4a.webp\"]', 1, 1, '2026-01-30 17:13:30', '2026-01-31 08:48:01', 2, 1.000),
(67, 1, 'Зелень', NULL, NULL, NULL, 4500.00, NULL, 1500.00, 2, '[\"/static/uploads/products/1/2dd88004253216016208e1d5ea1b1ff3.webp\"]', 1, 1, '2026-01-30 17:14:51', '2026-01-31 03:38:33', 2, 1.000),
(68, 1, 'Масло с зеленью', NULL, NULL, NULL, 567.00, NULL, 153.00, 2, '[\"/static/uploads/products/1/7cac7ff81b39af1fa25c315f67035240.jfif\"]', 1, 1, '2026-01-30 17:17:37', '2026-01-31 07:13:08', 2, 0.210),
(69, 1, 'Масло с зеленью', NULL, NULL, NULL, 567.00, NULL, 153.00, 1, '[\"/static/uploads/products/1/83a34b7b52298ef41ad403008058aced.jfif\"]', 0, 0, '2026-01-30 17:26:58', '2026-01-31 07:13:09', 1, NULL),
(70, 1, 'Яйцо жареное', NULL, NULL, NULL, 49.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/f51ecac79400f6c268f47cc1a62c3a45.webp\"]', 1, 1, '2026-01-31 01:06:51', '2026-01-31 01:06:51', 1, NULL),
(71, 1, 'Долька лимона', NULL, NULL, NULL, 15.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/f70d557bca4d166a85da717a5c058484.webp\"]', 1, 1, '2026-02-01 06:09:14', '2026-02-01 06:09:14', 1, NULL),
(72, 1, 'Сметана', NULL, NULL, NULL, 25.00, NULL, 10.00, 3, '[\"/static/uploads/products/1/615f6fa0e798d1f241ff78e1ec44d64f.jpg\"]', 1, 1, '2026-02-01 06:17:20', '2026-02-01 09:29:31', 3, 25.000),
(73, 1, 'Майонез', NULL, NULL, NULL, 25.00, NULL, 10.00, 3, '[\"/static/uploads/products/1/8dcc75da764dbb7c418bd365d477425d.jpg\"]', 1, 1, '2026-02-01 06:17:54', '2026-02-01 09:29:49', 3, 25.000),
(74, 1, 'Сырный соус', NULL, NULL, NULL, 35.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/5f00c1a5f592fb2731db1ba2ddc1ff98.jpg\"]', 1, 1, '2026-02-01 09:46:16', '2026-02-02 03:35:57', 3, 25.000),
(75, 1, 'Сливочно-грибной', NULL, NULL, NULL, 35.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/56dc3555cf87f0e66318fbf402cd5758.jpg\"]', 1, 1, '2026-02-01 09:46:40', '2026-02-01 09:46:40', 3, 25.000),
(76, 1, 'Сгущеное молоко', NULL, NULL, NULL, 35.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/2f6f537d4f3d5be82255ba2459d171f2.jpg\"]', 1, 1, '2026-02-01 09:47:37', '2026-02-01 09:47:37', 3, 25.000),
(77, 1, 'Хренадер', NULL, NULL, NULL, 35.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/ee92de8abb891004517a469fff7c8aff.jpg\"]', 1, 0, '2026-02-01 09:48:29', '2026-02-01 11:02:38', 3, 25.000),
(78, 1, 'Цезарь соус', NULL, NULL, NULL, 35.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/621be0a81988bb8f2573689d22397895.jpg\"]', 1, 1, '2026-02-01 09:49:53', '2026-02-02 03:36:06', 3, 25.000),
(79, 1, 'Кетчуп', NULL, NULL, NULL, 25.00, NULL, 0.00, 3, '[\"/static/uploads/products/1/5ccd28dab8631b53aa791f2bd15b6747.jpg\"]', 1, 1, '2026-02-01 09:50:14', '2026-02-01 09:50:14', 3, 25.000),
(80, 1, 'Морс Облепиха', NULL, NULL, NULL, 99.00, NULL, 0.00, 5, '[\"/static/uploads/products/1/3f2df68c60f9d630ba91fce90dd7369f.jpg\"]', 1, 1, '2026-02-01 09:59:15', '2026-02-01 10:00:15', 5, 500.000),
(81, 1, 'Морс Малина', NULL, NULL, NULL, 99.00, NULL, 0.00, 5, '[\"/static/uploads/products/1/982378c58c89cbeee716a8e782a77987.jpg\"]', 1, 1, '2026-02-01 10:00:06', '2026-02-01 10:00:06', 5, 500.000),
(82, 1, 'Греческий', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/a52f45f8366046a94b731ab55f1ee936.png\"]', 1, 0, '2026-02-01 10:11:59', '2026-02-01 10:11:59', 1, NULL),
(83, 1, 'Рис', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/2935c1e79639d6d8c9d114aa5ff07ab3.png\"]', 1, 0, '2026-02-01 10:12:27', '2026-02-01 10:12:27', 1, NULL),
(84, 1, 'Спагетти', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/a167de7a15ba5d245e99ad73e65d7517.png\"]', 1, 0, '2026-02-01 10:12:46', '2026-02-01 10:12:46', 1, NULL),
(85, 1, 'Болоньезе по-нашему', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/5861f4c8e46516d15ca109db9de43b88.jpg\"]', 1, 0, '2026-02-01 10:13:20', '2026-02-01 10:13:20', 1, NULL),
(86, 1, 'Наггетсы', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/b8a43e5429b39792c22ec39523e6f017.jpg\"]', 1, 0, '2026-02-01 10:14:00', '2026-02-01 10:14:00', 1, NULL),
(87, 1, 'Окрошка', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/da434b3b10465699d878a28b05c469cf.jpg\"]', 1, 0, '2026-02-01 10:14:24', '2026-02-01 10:14:24', 1, NULL),
(88, 1, 'Крем суп грибной', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/f65dbfcc570c3587c9066de78d67819d.jpg\"]', 1, 0, '2026-02-01 10:14:38', '2026-02-01 10:14:38', 1, NULL),
(89, 1, 'Щи из свежей капусты', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/c376e3c036ad61d5267795099ac54b8f.jpg\"]', 1, 0, '2026-02-01 10:15:42', '2026-02-01 10:15:42', 1, NULL),
(90, 1, 'Плов с курицей', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/2d7da075c990e42c05136a88c76ad41e.png\"]', 1, 0, '2026-02-01 10:17:43', '2026-02-01 10:17:43', 1, NULL),
(91, 1, 'Гречка по-купечески', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/1e95a87893cae77b83bc9f02e6de379b.png\"]', 1, 0, '2026-02-01 10:18:24', '2026-02-01 10:18:24', 1, NULL),
(92, 1, 'Гречка', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/bfd5846dfff38b7e41ec7d9ef85e5985.png\"]', 1, 0, '2026-02-01 10:18:55', '2026-02-01 10:19:01', 1, NULL),
(93, 1, 'Баварская закуска', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/728d3d52f5e3acce4809e6165a699cc3.jpg\"]', 1, 0, '2026-02-01 10:19:30', '2026-02-01 10:19:30', 1, NULL),
(94, 1, 'Соус болоньезе с куриным фаршем', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/0256b20b8ab7edf941570d4275c3b32c.png\"]', 1, 0, '2026-02-01 10:19:59', '2026-02-01 10:19:59', 1, NULL),
(95, 1, 'Овсяная каша', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/014c9780c015a6e6c6987ba5bc94e266.png\"]', 1, 0, '2026-02-01 10:20:31', '2026-02-01 10:20:31', 1, NULL),
(96, 1, 'Печень куриная', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/75a8ec06dfb6816c2e04e6e82864524d.jpg\"]', 1, 0, '2026-02-01 10:20:55', '2026-02-01 10:20:55', 1, NULL),
(97, 1, 'Жареная форель', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/71e5f7a14397e136067b913353e33dae.jpg\"]', 1, 0, '2026-02-01 10:21:16', '2026-02-01 10:21:16', 1, NULL),
(98, 1, 'Сливочная уха с форелью', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/cbf8bfe2b41b83b485242800daa857ee.jpg\"]', 1, 0, '2026-02-01 10:22:37', '2026-02-01 10:22:37', 1, NULL),
(99, 1, 'Борщ с мясом', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/3211ff813a8bb58dca455f501ebca27a.png\"]', 1, 0, '2026-02-01 10:22:51', '2026-02-01 10:22:51', 1, NULL),
(100, 1, 'Бифштекс', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/12140ce40409a0d0d31c3b093a761a2c.jpg\"]', 1, 0, '2026-02-01 10:27:58', '2026-02-01 10:27:58', 1, NULL),
(101, 1, 'Котлета говяжья', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, '[\"/static/uploads/products/1/ddf5205b5221596340c7108d07c32252.jpg\"]', 1, 0, '2026-02-01 10:28:23', '2026-02-01 10:28:23', 1, NULL),
(102, 1, 'Малиновое варенье', NULL, NULL, NULL, 0.00, NULL, 0.00, 1, NULL, 1, 0, '2026-02-01 10:54:52', '2026-02-01 10:54:52', 1, NULL);

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_categories`
--

CREATE TABLE `prod_product_categories` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL,
  `product_id` bigint UNSIGNED NOT NULL,
  `category_id` bigint UNSIGNED NOT NULL,
  `sort_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Дамп данных таблицы `prod_product_categories`
--

INSERT INTO `prod_product_categories` (`id`, `tenant_id`, `product_id`, `category_id`, `sort_order`, `created_at`, `updated_at`) VALUES
(1, 1, 1, 1, 30, '2026-01-03 10:03:50', '2026-01-17 11:06:00'),
(3, 1, 1, 2, 10, '2026-01-03 11:03:56', '2026-01-03 11:03:56'),
(5, 1, 2, 1, 40, '2026-01-03 12:54:21', '2026-01-17 11:06:00'),
(17, 1, 3, 1, 30, '2026-01-05 15:54:34', '2026-01-31 05:01:32'),
(19, 1, 4, 1, 40, '2026-01-06 04:28:49', '2026-01-31 05:01:32'),
(20, 1, 4, 4, 0, '2026-01-06 04:28:49', '2026-01-17 13:30:29'),
(21, 1, 5, 1, 70, '2026-01-06 04:35:32', '2026-01-17 11:05:57'),
(22, 1, 5, 3, 20, '2026-01-06 04:35:32', '2026-01-06 04:35:32'),
(23, 1, 6, 1, 50, '2026-01-06 07:37:17', '2026-01-31 05:01:32'),
(25, 1, 7, 1, 60, '2026-01-06 13:56:46', '2026-01-31 05:01:32'),
(27, 1, 8, 1, 70, '2026-01-08 03:44:37', '2026-01-31 05:01:32'),
(29, 1, 9, 1, 80, '2026-01-08 03:45:00', '2026-01-31 05:01:32'),
(40, 1, 10, 1, 120, '2026-01-08 08:58:27', '2026-01-17 11:05:53'),
(41, 1, 10, 7, 0, '2026-01-08 08:58:27', '2026-01-10 06:49:08'),
(42, 1, 11, 1, 130, '2026-01-08 08:58:54', '2026-01-17 11:05:53'),
(43, 1, 11, 7, 10, '2026-01-08 08:58:54', '2026-01-10 06:49:08'),
(44, 1, 3, 7, 0, '2026-01-08 08:59:50', '2026-01-30 17:03:40'),
(48, 1, 1, 7, 30, '2026-01-10 06:59:14', '2026-01-10 06:59:14'),
(51, 1, 9, 7, 10, '2026-01-11 05:12:04', '2026-01-30 17:03:40'),
(53, 1, 6, 5, 0, '2026-01-11 05:16:44', '2026-01-17 13:31:19'),
(54, 1, 12, 1, 20, '2026-01-16 10:32:24', '2026-01-17 11:06:00'),
(55, 1, 13, 1, 10, '2026-01-16 10:33:13', '2026-01-17 11:05:59'),
(56, 1, 14, 1, 0, '2026-01-16 10:34:30', '2026-01-17 11:05:48'),
(57, 1, 15, 1, 90, '2026-01-16 11:58:13', '2026-01-31 05:01:32'),
(58, 1, 15, 8, 0, '2026-01-16 11:59:07', '2026-01-17 13:34:01'),
(59, 1, 16, 1, 100, '2026-01-16 12:01:19', '2026-01-31 05:01:32'),
(60, 1, 16, 8, 10, '2026-01-16 12:01:19', '2026-01-17 13:34:01'),
(61, 1, 17, 1, 110, '2026-01-16 12:02:03', '2026-01-31 05:01:33'),
(62, 1, 17, 8, 20, '2026-01-16 12:02:03', '2026-01-17 13:34:01'),
(63, 1, 12, 5, 10, '2026-01-16 12:02:38', '2026-01-17 13:31:19'),
(166, 1, 18, 1, 170, '2026-01-16 16:26:17', '2026-01-16 16:26:17'),
(579, 1, 19, 1, 120, '2026-01-18 06:44:53', '2026-01-31 05:01:33'),
(580, 1, 20, 1, 130, '2026-01-18 06:57:10', '2026-01-31 05:01:33'),
(599, 1, 19, 8, 30, '2026-01-18 14:10:17', '2026-01-18 14:10:17'),
(600, 1, 20, 8, 40, '2026-01-18 14:10:29', '2026-01-18 14:10:29'),
(601, 1, 14, 7, 20, '2026-01-19 14:51:00', '2026-01-30 17:03:40'),
(638, 1, 21, 1, 140, '2026-01-19 18:06:45', '2026-01-31 05:01:33'),
(639, 1, 21, 5, 20, '2026-01-19 18:06:45', '2026-01-19 18:06:45'),
(640, 1, 13, 4, 10, '2026-01-19 18:07:23', '2026-01-19 18:07:23'),
(641, 1, 7, 4, 20, '2026-01-19 18:08:00', '2026-01-19 18:08:00'),
(642, 1, 22, 1, 150, '2026-01-30 03:38:43', '2026-01-31 05:01:34'),
(643, 1, 22, 5, 30, '2026-01-30 03:38:43', '2026-01-30 03:38:43'),
(644, 1, 23, 1, 160, '2026-01-30 03:39:11', '2026-01-31 05:01:34'),
(645, 1, 23, 5, 40, '2026-01-30 03:39:11', '2026-01-30 03:39:11'),
(646, 1, 24, 1, 170, '2026-01-30 03:40:14', '2026-01-31 05:01:34'),
(647, 1, 24, 4, 30, '2026-01-30 03:40:14', '2026-01-30 03:40:14'),
(648, 1, 25, 1, 180, '2026-01-30 03:41:10', '2026-01-31 05:01:34'),
(649, 1, 25, 4, 40, '2026-01-30 03:41:10', '2026-01-30 03:41:10'),
(650, 1, 26, 1, 190, '2026-01-30 03:42:25', '2026-01-31 05:01:34'),
(651, 1, 26, 4, 50, '2026-01-30 03:42:25', '2026-01-30 03:42:25'),
(652, 1, 27, 1, 200, '2026-01-30 03:42:52', '2026-01-31 05:01:34'),
(653, 1, 27, 4, 60, '2026-01-30 03:42:52', '2026-01-30 03:42:52'),
(654, 1, 28, 1, 210, '2026-01-30 03:43:12', '2026-01-31 05:01:34'),
(655, 1, 28, 4, 70, '2026-01-30 03:43:12', '2026-01-30 03:43:12'),
(656, 1, 29, 1, 220, '2026-01-30 03:43:49', '2026-01-31 05:01:34'),
(658, 1, 30, 1, 230, '2026-01-30 03:44:31', '2026-01-31 05:01:34'),
(659, 1, 30, 4, 90, '2026-01-30 03:44:31', '2026-01-30 03:44:31'),
(660, 1, 31, 1, 240, '2026-01-30 03:45:03', '2026-01-31 05:01:34'),
(661, 1, 31, 4, 100, '2026-01-30 03:45:03', '2026-01-30 03:45:03'),
(662, 1, 32, 1, 250, '2026-01-30 03:46:10', '2026-01-31 05:01:35'),
(663, 1, 32, 2, 20, '2026-01-30 03:46:10', '2026-01-30 03:46:10'),
(664, 1, 33, 1, 260, '2026-01-30 03:46:46', '2026-01-31 05:01:35'),
(665, 1, 33, 2, 30, '2026-01-30 03:46:46', '2026-01-30 03:46:46'),
(666, 1, 34, 1, 270, '2026-01-30 03:47:13', '2026-01-31 05:01:35'),
(667, 1, 34, 2, 40, '2026-01-30 03:47:13', '2026-01-30 03:47:13'),
(668, 1, 35, 1, 280, '2026-01-30 03:47:39', '2026-01-31 05:01:35'),
(669, 1, 35, 2, 50, '2026-01-30 03:47:39', '2026-01-30 03:47:39'),
(670, 1, 36, 1, 290, '2026-01-30 03:47:56', '2026-01-31 05:01:35'),
(671, 1, 36, 2, 60, '2026-01-30 03:47:56', '2026-01-30 03:47:56'),
(672, 1, 8, 7, 30, '2026-01-30 03:48:39', '2026-01-30 17:03:40'),
(673, 1, 37, 1, 300, '2026-01-30 03:49:20', '2026-01-31 05:01:35'),
(674, 1, 37, 6, 10, '2026-01-30 03:49:20', '2026-01-30 03:49:20'),
(675, 1, 38, 1, 310, '2026-01-30 03:49:52', '2026-01-31 05:01:35'),
(676, 1, 38, 6, 20, '2026-01-30 03:49:52', '2026-01-30 03:49:52'),
(677, 1, 39, 1, 320, '2026-01-30 03:54:41', '2026-01-31 05:01:35'),
(678, 1, 39, 7, 40, '2026-01-30 03:54:42', '2026-01-30 17:03:40'),
(679, 1, 40, 1, 330, '2026-01-30 03:55:42', '2026-01-31 05:01:36'),
(680, 1, 40, 7, 50, '2026-01-30 03:55:42', '2026-01-30 17:03:40'),
(681, 1, 41, 1, 340, '2026-01-30 04:03:38', '2026-01-31 05:01:36'),
(682, 1, 41, 7, 60, '2026-01-30 04:03:39', '2026-01-30 17:03:40'),
(683, 1, 42, 1, 350, '2026-01-30 04:07:22', '2026-01-31 05:01:36'),
(684, 1, 42, 7, 70, '2026-01-30 04:07:22', '2026-01-30 17:03:40'),
(685, 1, 43, 1, 360, '2026-01-30 04:08:37', '2026-01-31 05:01:36'),
(686, 1, 43, 7, 80, '2026-01-30 04:08:37', '2026-01-30 17:03:41'),
(687, 1, 44, 1, 370, '2026-01-30 04:09:25', '2026-01-31 05:01:36'),
(688, 1, 44, 7, 100, '2026-01-30 04:09:25', '2026-01-31 01:12:01'),
(689, 1, 45, 1, 380, '2026-01-30 04:10:23', '2026-01-31 05:01:36'),
(690, 1, 45, 7, 110, '2026-01-30 04:10:23', '2026-01-31 01:12:01'),
(691, 1, 46, 1, 390, '2026-01-30 04:11:50', '2026-01-31 05:01:36'),
(692, 1, 46, 7, 120, '2026-01-30 04:11:50', '2026-01-31 01:12:01'),
(693, 1, 47, 1, 400, '2026-01-30 04:15:13', '2026-01-31 05:01:36'),
(694, 1, 47, 7, 130, '2026-01-30 04:15:14', '2026-01-31 01:12:01'),
(695, 1, 48, 1, 410, '2026-01-30 04:17:26', '2026-01-31 05:01:37'),
(696, 1, 48, 7, 150, '2026-01-30 04:17:26', '2026-01-31 01:12:01'),
(697, 1, 49, 1, 420, '2026-01-30 04:18:29', '2026-01-31 05:01:37'),
(698, 1, 49, 7, 160, '2026-01-30 04:18:29', '2026-01-31 01:12:01'),
(699, 1, 50, 1, 430, '2026-01-30 04:19:40', '2026-01-31 05:01:37'),
(700, 1, 50, 7, 170, '2026-01-30 04:19:41', '2026-01-31 01:12:01'),
(701, 1, 51, 1, 440, '2026-01-30 04:20:59', '2026-01-31 05:01:38'),
(702, 1, 51, 7, 180, '2026-01-30 04:20:59', '2026-01-31 01:11:58'),
(703, 1, 52, 1, 450, '2026-01-30 04:21:29', '2026-01-31 05:01:38'),
(704, 1, 52, 7, 190, '2026-01-30 04:21:29', '2026-01-31 01:11:58'),
(710, 1, 53, 1, 460, '2026-01-30 04:44:16', '2026-01-31 05:01:38'),
(711, 1, 53, 7, 200, '2026-01-30 04:44:16', '2026-01-31 01:11:58'),
(712, 1, 54, 1, 470, '2026-01-30 04:44:45', '2026-01-31 05:01:38'),
(714, 1, 55, 1, 480, '2026-01-30 04:45:49', '2026-01-31 05:01:38'),
(715, 1, 55, 3, 30, '2026-01-30 04:45:49', '2026-01-30 04:45:49'),
(716, 1, 56, 1, 490, '2026-01-30 04:46:11', '2026-01-31 05:01:38'),
(717, 1, 56, 3, 40, '2026-01-30 04:46:11', '2026-01-30 04:46:11'),
(718, 1, 57, 1, 500, '2026-01-30 04:46:41', '2026-01-31 05:01:38'),
(720, 1, 58, 1, 510, '2026-01-30 04:46:53', '2026-01-31 05:01:38'),
(722, 1, 59, 1, 520, '2026-01-30 05:06:15', '2026-01-31 05:01:39'),
(723, 1, 59, 9, 10, '2026-01-30 05:06:15', '2026-01-30 05:06:15'),
(724, 1, 60, 1, 530, '2026-01-30 17:00:24', '2026-01-31 05:01:39'),
(725, 1, 60, 7, 210, '2026-01-30 17:00:24', '2026-01-31 01:11:59'),
(726, 1, 61, 1, 540, '2026-01-30 17:00:57', '2026-01-31 05:01:39'),
(727, 1, 61, 7, 220, '2026-01-30 17:00:57', '2026-01-31 01:11:59'),
(728, 1, 62, 1, 550, '2026-01-30 17:01:36', '2026-01-31 05:01:39'),
(729, 1, 62, 7, 140, '2026-01-30 17:01:36', '2026-01-31 01:12:01'),
(730, 1, 63, 1, 560, '2026-01-30 17:02:03', '2026-01-31 05:01:39'),
(731, 1, 63, 7, 230, '2026-01-30 17:02:03', '2026-01-31 01:11:59'),
(732, 1, 64, 1, 570, '2026-01-30 17:02:46', '2026-01-31 05:01:39'),
(759, 1, 64, 2, 70, '2026-01-30 17:03:52', '2026-01-30 17:03:52'),
(760, 1, 54, 3, 70, '2026-01-30 17:04:06', '2026-01-30 17:04:06'),
(761, 1, 65, 1, 580, '2026-01-30 17:12:34', '2026-01-31 05:01:40'),
(762, 1, 65, 8, 50, '2026-01-30 17:12:34', '2026-01-30 17:12:34'),
(763, 1, 66, 1, 590, '2026-01-30 17:13:30', '2026-01-31 05:01:40'),
(764, 1, 66, 8, 60, '2026-01-30 17:13:31', '2026-01-30 17:13:31'),
(765, 1, 67, 1, 600, '2026-01-30 17:14:52', '2026-01-31 05:01:40'),
(766, 1, 67, 8, 70, '2026-01-30 17:14:52', '2026-01-30 17:14:52'),
(767, 1, 68, 1, 610, '2026-01-30 17:17:37', '2026-01-31 05:01:40'),
(768, 1, 68, 10, 10, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(769, 1, 69, 1, 660, '2026-01-30 17:26:58', '2026-01-30 17:26:58'),
(770, 1, 69, 10, 20, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(840, 1, 70, 1, 620, '2026-01-31 01:06:52', '2026-01-31 05:01:41'),
(841, 1, 70, 10, 30, '2026-01-31 01:06:52', '2026-01-31 01:06:52'),
(842, 1, 29, 7, 90, '2026-01-31 01:10:44', '2026-01-31 01:12:01'),
(954, 1, 71, 1, 670, '2026-02-01 06:09:14', '2026-02-01 06:09:14'),
(955, 1, 71, 10, 40, '2026-02-01 06:09:14', '2026-02-01 06:09:14'),
(956, 1, 72, 1, 680, '2026-02-01 06:17:20', '2026-02-01 06:17:20'),
(957, 1, 72, 11, 20, '2026-02-01 06:17:20', '2026-02-01 09:50:37'),
(958, 1, 73, 1, 690, '2026-02-01 06:17:54', '2026-02-01 06:17:54'),
(959, 1, 73, 11, 30, '2026-02-01 06:17:54', '2026-02-01 09:50:37'),
(960, 1, 58, 11, 0, '2026-02-01 06:20:49', '2026-02-01 09:50:36'),
(961, 1, 57, 11, 10, '2026-02-01 06:21:01', '2026-02-01 09:50:37'),
(962, 1, 74, 1, 700, '2026-02-01 09:46:16', '2026-02-01 09:46:16'),
(963, 1, 74, 11, 40, '2026-02-01 09:46:16', '2026-02-01 09:50:37'),
(964, 1, 75, 1, 710, '2026-02-01 09:46:40', '2026-02-01 09:46:40'),
(965, 1, 75, 11, 50, '2026-02-01 09:46:41', '2026-02-01 09:50:38'),
(966, 1, 76, 1, 720, '2026-02-01 09:47:37', '2026-02-01 09:47:37'),
(967, 1, 76, 11, 60, '2026-02-01 09:47:38', '2026-02-01 09:50:38'),
(968, 1, 77, 1, 730, '2026-02-01 09:48:30', '2026-02-01 09:48:30'),
(969, 1, 77, 11, 70, '2026-02-01 09:48:30', '2026-02-01 09:50:38'),
(970, 1, 78, 1, 740, '2026-02-01 09:49:53', '2026-02-01 09:49:53'),
(971, 1, 78, 11, 80, '2026-02-01 09:49:54', '2026-02-01 09:50:38'),
(972, 1, 79, 1, 750, '2026-02-01 09:50:15', '2026-02-01 09:50:15'),
(973, 1, 79, 11, 90, '2026-02-01 09:50:15', '2026-02-01 09:50:38'),
(1014, 1, 80, 1, 760, '2026-02-01 09:59:15', '2026-02-01 09:59:15'),
(1015, 1, 80, 12, 10, '2026-02-01 09:59:16', '2026-02-01 09:59:16'),
(1016, 1, 81, 1, 770, '2026-02-01 10:00:06', '2026-02-01 10:00:06'),
(1017, 1, 81, 12, 20, '2026-02-01 10:00:07', '2026-02-01 10:00:07'),
(1018, 1, 82, 1, 780, '2026-02-01 10:11:59', '2026-02-01 10:11:59'),
(1019, 1, 82, 2, 80, '2026-02-01 10:11:59', '2026-02-01 10:11:59'),
(1020, 1, 83, 1, 790, '2026-02-01 10:12:27', '2026-02-01 10:12:27'),
(1021, 1, 83, 5, 50, '2026-02-01 10:12:27', '2026-02-01 10:12:27'),
(1022, 1, 84, 1, 800, '2026-02-01 10:12:46', '2026-02-01 10:12:46'),
(1023, 1, 84, 5, 60, '2026-02-01 10:12:46', '2026-02-01 10:12:46'),
(1024, 1, 85, 1, 810, '2026-02-01 10:13:20', '2026-02-01 10:13:20'),
(1025, 1, 85, 7, 240, '2026-02-01 10:13:21', '2026-02-01 10:13:21'),
(1026, 1, 86, 1, 820, '2026-02-01 10:14:00', '2026-02-01 10:14:00'),
(1027, 1, 86, 3, 80, '2026-02-01 10:14:00', '2026-02-01 10:14:00'),
(1028, 1, 87, 1, 830, '2026-02-01 10:14:25', '2026-02-01 10:14:25'),
(1029, 1, 87, 6, 30, '2026-02-01 10:14:25', '2026-02-01 10:14:25'),
(1030, 1, 88, 1, 840, '2026-02-01 10:14:39', '2026-02-01 10:14:39'),
(1031, 1, 88, 6, 40, '2026-02-01 10:14:39', '2026-02-01 10:14:39'),
(1032, 1, 89, 1, 850, '2026-02-01 10:15:42', '2026-02-01 10:15:42'),
(1033, 1, 89, 6, 50, '2026-02-01 10:15:42', '2026-02-01 10:15:42'),
(1034, 1, 90, 1, 860, '2026-02-01 10:17:43', '2026-02-01 10:17:43'),
(1035, 1, 90, 7, 250, '2026-02-01 10:17:44', '2026-02-01 10:17:44'),
(1036, 1, 91, 1, 870, '2026-02-01 10:18:25', '2026-02-01 10:18:25'),
(1037, 1, 91, 7, 260, '2026-02-01 10:18:25', '2026-02-01 10:18:25'),
(1038, 1, 92, 1, 880, '2026-02-01 10:18:55', '2026-02-01 10:18:55'),
(1039, 1, 92, 5, 70, '2026-02-01 10:18:55', '2026-02-01 10:18:55'),
(1040, 1, 93, 1, 890, '2026-02-01 10:19:30', '2026-02-01 10:19:30'),
(1041, 1, 93, 2, 90, '2026-02-01 10:19:31', '2026-02-01 10:19:31'),
(1042, 1, 94, 1, 900, '2026-02-01 10:19:59', '2026-02-01 10:19:59'),
(1043, 1, 94, 4, 110, '2026-02-01 10:19:59', '2026-02-01 10:19:59'),
(1044, 1, 95, 1, 910, '2026-02-01 10:20:32', '2026-02-01 10:20:32'),
(1045, 1, 95, 7, 270, '2026-02-01 10:20:32', '2026-02-01 10:20:32'),
(1046, 1, 96, 1, 920, '2026-02-01 10:20:55', '2026-02-01 10:20:55'),
(1047, 1, 96, 4, 120, '2026-02-01 10:20:56', '2026-02-01 10:20:56'),
(1048, 1, 97, 1, 930, '2026-02-01 10:21:17', '2026-02-01 10:21:17'),
(1049, 1, 97, 4, 130, '2026-02-01 10:21:17', '2026-02-01 10:21:17'),
(1050, 1, 98, 1, 940, '2026-02-01 10:22:38', '2026-02-01 10:22:38'),
(1051, 1, 98, 6, 60, '2026-02-01 10:22:38', '2026-02-01 10:22:38'),
(1052, 1, 99, 1, 950, '2026-02-01 10:22:52', '2026-02-01 10:22:52'),
(1053, 1, 99, 6, 70, '2026-02-01 10:22:52', '2026-02-01 10:22:52'),
(1054, 1, 100, 1, 960, '2026-02-01 10:27:58', '2026-02-01 10:27:58'),
(1055, 1, 100, 7, 280, '2026-02-01 10:27:59', '2026-02-01 10:27:59'),
(1056, 1, 101, 1, 970, '2026-02-01 10:28:23', '2026-02-01 10:28:23'),
(1057, 1, 101, 4, 140, '2026-02-01 10:28:23', '2026-02-01 10:28:23'),
(1058, 1, 102, 1, 980, '2026-02-01 10:54:53', '2026-02-01 10:54:53'),
(1059, 1, 102, 11, 100, '2026-02-01 10:54:53', '2026-02-01 10:54:53');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_ingredients`
--

CREATE TABLE `prod_product_ingredients` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_product_ingredients` (`id`, `tenant_id`, `product_id`, `ingredient_id`, `quantity`, `unit_id`, `quantity_min`, `quantity_max`, `quantity_step`, `price_override`, `is_variable`, `sort_order`, `created_at`, `updated_at`) VALUES
(5, 1, 12, 15, 1.000, 2, NULL, NULL, NULL, NULL, 0, 10, '2026-01-16 12:57:50', '2026-01-18 06:33:31'),
(12, 1, 14, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 10, '2026-01-17 11:08:20', '2026-02-01 11:39:14'),
(13, 1, 14, 13, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-17 11:08:20', '2026-01-17 11:09:30'),
(16, 1, 12, 17, 250.000, 3, NULL, NULL, NULL, NULL, 0, 20, '2026-01-18 06:33:31', '2026-01-31 06:56:25'),
(17, 1, 12, 16, 50.000, 3, NULL, NULL, NULL, NULL, 0, 30, '2026-01-18 06:33:31', '2026-01-31 06:56:25'),
(18, 1, 12, 19, 13.000, 3, NULL, NULL, NULL, NULL, 0, 40, '2026-01-18 06:45:16', '2026-01-31 06:56:25'),
(19, 1, 13, 20, 120.000, 3, NULL, NULL, NULL, NULL, 0, 10, '2026-01-18 06:57:37', '2026-01-18 06:57:37'),
(20, 1, 8, 23, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 10, '2026-01-30 03:52:21', '2026-02-01 11:04:09'),
(21, 1, 8, 7, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-30 03:52:22', '2026-01-30 04:14:14'),
(22, 1, 3, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 10, '2026-01-30 03:53:29', '2026-02-01 11:03:27'),
(23, 1, 3, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 20, '2026-01-30 03:53:30', '2026-01-30 04:14:32'),
(24, 1, 39, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 03:54:42', '2026-01-31 00:40:00'),
(25, 1, 39, 7, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 03:54:42', '2026-01-31 00:40:00'),
(26, 1, 41, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:03:39', '2026-01-30 04:03:39'),
(27, 1, 41, 26, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:03:39', '2026-01-30 04:03:39'),
(28, 1, 42, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:07:22', '2026-01-30 04:07:22'),
(29, 1, 42, 25, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:07:23', '2026-01-30 04:07:23'),
(30, 1, 43, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:08:37', '2026-02-01 10:03:48'),
(31, 1, 43, 27, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:08:38', '2026-01-30 04:08:38'),
(32, 1, 44, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:09:25', '2026-02-01 10:04:13'),
(33, 1, 44, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:09:26', '2026-01-30 04:12:44'),
(34, 1, 45, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:10:24', '2026-02-01 10:04:28'),
(35, 1, 45, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:10:24', '2026-01-30 04:12:30'),
(36, 1, 46, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:11:51', '2026-02-01 10:05:10'),
(37, 1, 46, 27, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:11:51', '2026-01-30 04:11:51'),
(38, 1, 48, 21, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:17:26', '2026-02-01 10:05:58'),
(39, 1, 48, 30, 90.000, 3, 90.000, 300.000, 30.000, NULL, 1, 0, '2026-01-30 04:17:27', '2026-02-01 10:05:58'),
(40, 1, 49, 23, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:18:30', '2026-02-01 10:06:20'),
(41, 1, 49, 28, 2.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:18:30', '2026-01-30 04:18:30'),
(42, 1, 50, 23, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:19:41', '2026-02-01 10:06:44'),
(43, 1, 50, 26, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 0, '2026-01-30 04:19:41', '2026-01-30 04:19:41'),
(44, 1, 51, 12, 150.000, 3, 150.000, 350.000, 100.000, NULL, 1, 0, '2026-01-30 04:20:59', '2026-02-01 10:06:56'),
(45, 1, 51, 31, 1.000, 1, 1.000, 2.000, 1.000, NULL, 1, 0, '2026-01-30 04:21:00', '2026-01-30 04:21:00'),
(46, 1, 68, 67, 30.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(47, 1, 68, 16, 180.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:17:38', '2026-01-30 17:17:38'),
(52, 1, 69, 67, 30.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(53, 1, 69, 16, 180.000, 3, NULL, NULL, NULL, NULL, 0, 0, '2026-01-30 17:26:59', '2026-01-30 17:26:59'),
(54, 1, 29, 70, 1.000, 1, 1.000, 4.000, 1.000, NULL, 1, 10, '2026-01-31 01:08:25', '2026-01-31 01:08:25'),
(55, 1, 29, 28, 1.000, 1, 0.000, 4.000, 1.000, NULL, 1, 20, '2026-01-31 01:08:25', '2026-01-31 01:08:25'),
(56, 1, 40, 68, 0.000, 3, 0.000, 10.000, 10.000, NULL, 1, 50, '2026-01-31 02:44:24', '2026-02-01 10:02:52'),
(57, 1, 40, 15, 250.000, 3, NULL, NULL, NULL, NULL, 0, 20, '2026-01-31 02:44:24', '2026-02-02 12:48:28'),
(58, 1, 40, 65, 0.000, 3, 0.000, 30.000, 30.000, NULL, 1, 30, '2026-01-31 02:44:24', '2026-02-01 10:02:52'),
(59, 1, 40, 66, 0.000, 3, 0.000, 30.000, 30.000, NULL, 1, 40, '2026-01-31 02:44:24', '2026-02-01 10:02:52'),
(60, 1, 37, 71, 0.000, 1, 0.000, 1.000, 1.000, NULL, 1, 10, '2026-02-01 06:10:04', '2026-02-01 06:10:04'),
(61, 1, 32, 73, 15.000, 3, 15.000, 35.000, 10.000, 0.00, 1, 10, '2026-02-01 09:38:22', '2026-02-02 03:34:50'),
(62, 1, 32, 57, 1.000, 1, 0.000, 1.000, 1.000, 0.00, 1, 20, '2026-02-02 03:34:50', '2026-02-02 03:34:50'),
(63, 1, 35, 78, 50.000, 3, 50.000, 50.000, 50.000, 0.00, 1, 10, '2026-02-02 03:36:58', '2026-02-02 03:36:58'),
(64, 1, 35, 57, 1.000, 1, 0.000, 1.000, 1.000, 0.00, 1, 20, '2026-02-02 03:36:58', '2026-02-02 03:36:58'),
(65, 1, 36, 78, 50.000, 3, 50.000, 50.000, 50.000, 0.00, 1, 10, '2026-02-02 03:38:50', '2026-02-02 03:38:50'),
(66, 1, 36, 57, 1.000, 1, 0.000, 1.000, 1.000, 0.00, 1, 20, '2026-02-02 03:38:50', '2026-02-02 03:38:50');

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
(150, 1, 1, 70, NULL, '2026-01-31 01:06:52', '2026-01-31 01:06:52'),
(204, 1, 1, 71, NULL, '2026-02-01 06:09:14', '2026-02-01 06:09:14'),
(206, 1, 1, 72, NULL, '2026-02-01 06:17:20', '2026-02-01 06:17:20'),
(207, 1, 1, 73, NULL, '2026-02-01 06:17:54', '2026-02-01 06:17:54'),
(220, 1, 1, 74, NULL, '2026-02-01 09:46:16', '2026-02-01 09:46:16'),
(221, 1, 1, 75, NULL, '2026-02-01 09:46:41', '2026-02-01 09:46:41'),
(222, 1, 1, 76, NULL, '2026-02-01 09:47:38', '2026-02-01 09:47:38'),
(223, 1, 1, 77, NULL, '2026-02-01 09:48:30', '2026-02-01 09:48:30'),
(224, 1, 1, 78, NULL, '2026-02-01 09:49:54', '2026-02-01 09:49:54'),
(225, 1, 1, 79, NULL, '2026-02-01 09:50:15', '2026-02-01 09:50:15'),
(226, 1, 1, 80, NULL, '2026-02-01 09:59:16', '2026-02-01 09:59:16'),
(227, 1, 1, 81, NULL, '2026-02-01 10:00:07', '2026-02-01 10:00:07'),
(241, 1, 1, 82, NULL, '2026-02-01 10:11:59', '2026-02-01 10:11:59'),
(242, 1, 1, 83, NULL, '2026-02-01 10:12:28', '2026-02-01 10:12:28'),
(243, 1, 1, 84, NULL, '2026-02-01 10:12:46', '2026-02-01 10:12:46'),
(244, 1, 1, 85, NULL, '2026-02-01 10:13:21', '2026-02-01 10:13:21'),
(245, 1, 1, 86, NULL, '2026-02-01 10:14:00', '2026-02-01 10:14:00'),
(246, 1, 1, 87, NULL, '2026-02-01 10:14:25', '2026-02-01 10:14:25'),
(247, 1, 1, 88, NULL, '2026-02-01 10:14:39', '2026-02-01 10:14:39'),
(248, 1, 1, 89, NULL, '2026-02-01 10:15:42', '2026-02-01 10:15:42'),
(249, 1, 1, 90, NULL, '2026-02-01 10:17:44', '2026-02-01 10:17:44'),
(250, 1, 1, 91, NULL, '2026-02-01 10:18:25', '2026-02-01 10:18:25'),
(251, 1, 1, 92, NULL, '2026-02-01 10:18:55', '2026-02-01 10:18:55'),
(253, 1, 1, 93, NULL, '2026-02-01 10:19:31', '2026-02-01 10:19:31'),
(254, 1, 1, 94, NULL, '2026-02-01 10:20:00', '2026-02-01 10:20:00'),
(255, 1, 1, 95, NULL, '2026-02-01 10:20:32', '2026-02-01 10:20:32'),
(256, 1, 1, 96, NULL, '2026-02-01 10:20:56', '2026-02-01 10:20:56'),
(257, 1, 1, 97, NULL, '2026-02-01 10:21:17', '2026-02-01 10:21:17'),
(259, 1, 1, 98, NULL, '2026-02-01 10:22:38', '2026-02-01 10:22:38'),
(260, 1, 1, 99, NULL, '2026-02-01 10:22:52', '2026-02-01 10:22:52'),
(261, 1, 1, 100, NULL, '2026-02-01 10:27:59', '2026-02-01 10:27:59'),
(262, 1, 1, 101, NULL, '2026-02-01 10:28:23', '2026-02-01 10:28:23'),
(263, 1, 1, 102, NULL, '2026-02-01 10:54:53', '2026-02-01 10:54:53');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_product_unit_links`
--

CREATE TABLE `prod_product_unit_links` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
  `product_id` bigint UNSIGNED NOT NULL,
  `unit_id` bigint UNSIGNED NOT NULL COMMENT 'Связанная единица (например шт)',
  `base_unit_id` bigint UNSIGNED NOT NULL COMMENT 'Базовая единица товара',
  `factor` decimal(18,6) NOT NULL COMMENT 'Сколько base_unit в 1 unit',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Дамп данных таблицы `prod_product_unit_links`
--

INSERT INTO `prod_product_unit_links` (`id`, `tenant_id`, `product_id`, `unit_id`, `base_unit_id`, `factor`, `created_at`, `updated_at`) VALUES
(2, 1, 13, 1, 3, 80.000000, '2026-01-31 06:02:28', '2026-01-31 06:02:28'),
(3, 1, 28, 1, 3, 60.000000, '2026-01-31 06:31:37', '2026-01-31 06:31:37');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_units`
--

CREATE TABLE `prod_units` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_units` (`id`, `tenant_id`, `code`, `title`, `short_title`, `sort_order`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 'pcs', 'Штука', 'шт', 1, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(2, 1, 'kg', 'Килограмм', 'кг', 2, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(3, 1, 'g', 'Грамм', 'г', 3, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(4, 1, 'l', 'Литр', 'л', 4, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(5, 1, 'ml', 'Миллилитр', 'мл', 5, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09'),
(6, 1, 'portion', 'Порция', 'порц', 6, 1, '2026-01-16 11:23:09', '2026-01-16 11:23:09');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_unit_conversions`
--

CREATE TABLE `prod_unit_conversions` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_unit_conversions` (`id`, `tenant_id`, `from_unit_id`, `to_unit_id`, `factor`, `is_active`, `created_at`, `updated_at`) VALUES
(1, 1, 2, 3, 1000.000000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(2, 1, 3, 2, 0.001000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(3, 1, 4, 5, 1000.000000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58'),
(4, 1, 5, 4, 0.001000, 1, '2026-01-17 13:04:58', '2026-01-17 13:04:58');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_assignments`
--

CREATE TABLE `prod_variant_assignments` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_variant_assignments` (`id`, `tenant_id`, `product_id`, `variant_group_id`, `sort_order`, `is_active`, `default_value_index`, `created_at`, `updated_at`) VALUES
(18, 1, 38, 8, 0, 1, NULL, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(19, 1, 37, 8, 0, 1, NULL, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(20, 1, 30, 6, 0, 1, NULL, '2026-01-30 08:27:47', '2026-01-30 08:27:47'),
(21, 1, 25, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:30'),
(22, 1, 26, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:31'),
(23, 1, 27, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:33'),
(24, 1, 13, 5, 0, 1, 0, '2026-01-30 08:28:19', '2026-01-30 08:28:35'),
(25, 1, 31, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:37'),
(26, 1, 4, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:38'),
(27, 1, 24, 5, 0, 1, 0, '2026-01-30 08:28:20', '2026-01-30 08:28:40'),
(28, 1, 28, 5, 0, 1, NULL, '2026-01-30 08:28:20', '2026-01-30 08:28:20'),
(29, 1, 7, 5, 0, 1, NULL, '2026-01-30 08:28:20', '2026-01-30 08:28:20'),
(31, 1, 21, 4, 0, 1, 0, '2026-01-30 08:29:09', '2026-02-01 14:23:46'),
(32, 1, 22, 4, 0, 1, 0, '2026-01-30 08:29:09', '2026-02-01 14:23:54'),
(33, 1, 12, 4, 0, 1, 0, '2026-01-30 08:29:09', '2026-02-01 14:23:37'),
(34, 1, 23, 4, 0, 1, 0, '2026-01-30 08:29:10', '2026-02-01 14:24:10'),
(35, 1, 6, 4, 0, 1, 0, '2026-01-30 08:29:10', '2026-02-01 14:23:28'),
(36, 1, 56, 7, 0, 1, NULL, '2026-01-30 08:29:36', '2026-01-30 08:29:36'),
(37, 1, 55, 7, 0, 1, NULL, '2026-01-30 08:29:36', '2026-01-30 08:29:36'),
(38, 1, 34, 9, 0, 1, NULL, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(39, 1, 32, 9, 0, 1, 0, '2026-01-30 08:38:53', '2026-02-01 09:38:16'),
(44, 1, 47, 10, 0, 1, 0, '2026-01-31 00:53:18', '2026-02-01 10:05:20'),
(45, 1, 62, 10, 0, 1, 0, '2026-01-31 00:54:10', '2026-02-01 10:05:32'),
(46, 1, 53, 11, 0, 1, NULL, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(47, 1, 54, 11, 0, 1, NULL, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(48, 1, 60, 12, 0, 1, NULL, '2026-01-31 01:02:57', '2026-01-31 01:02:57'),
(49, 1, 72, 13, 0, 1, 1, '2026-02-01 06:20:15', '2026-02-01 14:29:04'),
(50, 1, 73, 13, 0, 1, NULL, '2026-02-01 06:20:27', '2026-02-01 06:20:27'),
(51, 1, 79, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(52, 1, 76, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(53, 1, 75, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(54, 1, 74, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(55, 1, 77, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(56, 1, 78, 13, 0, 1, NULL, '2026-02-01 09:52:07', '2026-02-01 09:52:07'),
(57, 1, 81, 14, 0, 1, NULL, '2026-02-01 10:01:00', '2026-02-01 10:01:00'),
(58, 1, 80, 14, 0, 1, NULL, '2026-02-01 10:01:00', '2026-02-01 10:01:00'),
(59, 1, 40, 4, 0, 1, NULL, '2026-02-02 12:48:20', '2026-02-02 12:48:20');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_discount_tiers`
--

CREATE TABLE `prod_variant_discount_tiers` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_variant_discount_tiers` (`id`, `tenant_id`, `variant_group_id`, `min_quantity`, `discount_percent`, `sort_order`, `created_at`, `updated_at`) VALUES
(13, 1, 4, 1.000, -10.00, 0, '2026-01-30 08:23:46', '2026-01-30 08:23:46'),
(14, 1, 4, 1.000, 0.00, 1, '2026-01-30 08:23:46', '2026-01-30 08:23:46'),
(15, 1, 4, 1.000, 0.00, 2, '2026-01-30 08:23:47', '2026-01-30 08:23:47'),
(16, 1, 5, 1.000, -10.00, 0, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(17, 1, 5, 1.000, 0.00, 1, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(18, 1, 5, 1.000, 0.00, 2, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(19, 1, 5, 1.000, 0.00, 3, '2026-01-30 08:24:40', '2026-01-30 08:24:40'),
(20, 1, 6, 1.000, -10.00, 0, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(21, 1, 6, 1.000, 0.00, 1, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(22, 1, 6, 1.000, 0.00, 2, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(23, 1, 6, 1.000, 0.00, 3, '2026-01-30 08:25:21', '2026-01-30 08:25:21'),
(24, 1, 7, 1.000, -10.00, 0, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(25, 1, 7, 1.000, 0.00, 1, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(26, 1, 7, 1.000, 0.00, 2, '2026-01-30 08:26:40', '2026-01-30 08:26:40'),
(27, 1, 8, 1.000, -10.00, 0, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(28, 1, 8, 1.000, 0.00, 1, '2026-01-30 08:27:32', '2026-01-30 08:27:32'),
(29, 1, 9, 1.000, -10.00, 0, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(30, 1, 9, 1.000, 0.00, 1, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(31, 1, 9, 1.000, 0.00, 2, '2026-01-30 08:38:53', '2026-01-30 08:38:53'),
(32, 1, 10, 1.000, -10.00, 0, '2026-01-30 16:59:21', '2026-01-30 16:59:21'),
(33, 1, 10, 1.000, 0.00, 1, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(34, 1, 10, 1.000, 0.00, 2, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(35, 1, 10, 1.000, 0.00, 3, '2026-01-30 16:59:22', '2026-01-30 16:59:22'),
(36, 1, 11, 1.000, 0.00, 0, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(37, 1, 11, 1.000, 0.00, 1, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(38, 1, 11, 1.000, 0.00, 2, '2026-01-31 00:56:17', '2026-01-31 00:56:17'),
(39, 1, 12, 1.000, 0.00, 0, '2026-01-31 01:02:43', '2026-01-31 01:02:43'),
(40, 1, 12, 1.000, 0.00, 1, '2026-01-31 01:02:44', '2026-01-31 01:02:44'),
(41, 1, 13, 1.000, 0.00, 0, '2026-02-01 06:20:03', '2026-02-01 09:30:16'),
(42, 1, 13, 1.000, 0.00, 1, '2026-02-01 06:20:03', '2026-02-01 06:20:03'),
(43, 1, 13, 1.000, 0.00, 2, '2026-02-01 06:20:03', '2026-02-01 06:20:03'),
(44, 1, 14, 1.000, 0.00, 0, '2026-02-01 10:01:00', '2026-02-01 10:01:00');

-- --------------------------------------------------------

--
-- Структура таблицы `prod_variant_groups`
--

CREATE TABLE `prod_variant_groups` (
  `id` bigint UNSIGNED NOT NULL,
  `tenant_id` bigint UNSIGNED NOT NULL DEFAULT '1',
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

INSERT INTO `prod_variant_groups` (`id`, `tenant_id`, `title`, `unit_id`, `values`, `default_value_index`, `selection_type`, `is_active`, `sort_order`, `created_at`, `updated_at`) VALUES
(4, 1, 'Гарнира (Грамм)', 3, '[\"150\",\"250\",\"350\"]', 1, 'single', 1, 0, '2026-01-30 08:23:46', '2026-01-30 16:57:13'),
(5, 1, 'Горячего (Штук)', 1, '[\"1\",\"2\",\"3\",\"4\"]', 1, 'single', 1, 0, '2026-01-30 08:24:40', '2026-01-30 16:57:06'),
(6, 1, 'Горячего (Грамм)', 3, '[\"90\",\"120\",\"150\",\"180\"]', 0, 'single', 1, 0, '2026-01-30 08:25:21', '2026-01-30 16:56:57'),
(7, 1, 'Порция (Грамм)', 3, '[\"100\",\"200\",\"300\"]', 0, 'single', 1, 0, '2026-01-30 08:25:49', '2026-01-30 16:56:50'),
(8, 1, 'Супа (Грамм)', 3, '[\"250\",\"350\"]', 0, 'single', 1, 0, '2026-01-30 08:27:32', '2026-01-30 16:56:42'),
(9, 1, 'Салата (Грамм)', 3, '[\"100\",\"150\",\"200\"]', 0, 'single', 1, 0, '2026-01-30 08:38:53', '2026-01-30 16:57:25'),
(10, 1, 'Порция (Штук)', 1, '[\"10\",\"15\",\"20\",\"25\"]', 1, 'single', 1, 0, '2026-01-30 16:58:04', '2026-01-30 16:59:21'),
(11, 1, 'Порция (Штук)', 1, '[\"3\",\"5\",\"7\"]', 0, 'single', 1, 0, '2026-01-31 00:56:16', '2026-01-31 00:56:16'),
(12, 1, 'Каши (Грамм)', 3, '[\"250\",\"350\"]', 0, 'single', 1, 0, '2026-01-31 01:02:43', '2026-01-31 01:02:43'),
(13, 1, 'Соус (Грамм)', 3, '[\"25\",\"50\",\"80\"]', 1, 'single', 1, 0, '2026-02-01 06:20:03', '2026-02-01 14:29:00'),
(14, 1, 'Объем напитка', 5, '[\"500\"]', 0, 'single', 1, 0, '2026-02-01 10:01:00', '2026-02-01 10:01:00');

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
(1, 1, 'По щам - на Партсъезда', 'main', 'ул. 22-го Партсъезда 4', '79021461966', '+7', 1, 1, '2026-01-25 15:25:51', '2026-02-02 06:19:32', 'Новоалтайск', 1),
(1, 2, 'Точка 2', 'store-2', 'ул. Неизвестная', NULL, '+7', 0, 1, '2026-01-26 15:53:11', '2026-01-31 07:36:17', 'Новоалтайск', 1);

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
(1, 1, 0, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 1, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 2, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 3, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 4, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 5, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 1, 6, '10:00:00', '20:00:00', 0, '2026-02-02 06:19:35', '2026-02-02 06:19:35'),
(1, 2, 0, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 1, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 2, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 3, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 4, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 5, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 6, '10:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17');

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
(1, 1, 0, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 1, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 2, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 3, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 4, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 5, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 1, 6, '08:00:00', '20:00:00', 0, '2026-02-02 06:19:34', '2026-02-02 06:19:34'),
(1, 2, 0, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 1, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 2, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 3, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 4, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 5, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17'),
(1, 2, 6, '08:00:00', '20:00:00', 0, '2026-01-31 07:36:17', '2026-01-31 07:36:17');

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
(1, 1, 'По щам - домашняя еда с доставкой', NULL, 'posham', 'admin@test.ru', '$2a$10$c2.HUSbW1ssrMsF03XsC6eMSkXR6FtMqOPLpSUgkUIQRibqfk9.zO', 'admin@test.ru', 1, '2026-01-21 13:07:16', '2026-02-02 07:51:02', '/static/uploads/tenants/1/2bcab539a2056f905b05b2fe1e6175ca.png', '/static/uploads/tenants/1/1c30d7740e24c5295301e5190bb9a8a1.png', '/static/uploads/tenants/1/87a8ced908be6c4daaed371594cfde4c.png', '/static/uploads/tenants/1/ae6927d41ab198580ec4c62af9f32e14.png', '/static/uploads/tenants/1/0a831832a7329001b3146abea34abf26.png', '/static/uploads/tenants/1/92b6768e0ba0233bdbdf6b5a9723e8bd.png', 'down', 0, NULL, 'По щам', NULL, NULL, '/static/uploads/tenants/1/sounds/3cded567d63fabaed72171f6093a0c1e.mp3', '/static/uploads/tenants/1/sounds/e0b30de53ccb7cdd20fa32c0fbb800db.mp3', '/static/uploads/tenants/1/sounds/fb3304169927ffa0144d4967880f0873.mp3');

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
  ADD KEY `idx_auto_add_groups_tenant` (`tenant_id`);

--
-- Индексы таблицы `prod_auto_add_items`
--
ALTER TABLE `prod_auto_add_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_auto_add_items_tenant` (`tenant_id`),
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
-- Индексы таблицы `prod_combos`
--
ALTER TABLE `prod_combos`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prod_combos_tenant` (`tenant_id`),
  ADD KEY `idx_prod_combos_active_sort` (`is_active`,`sort_order`);

--
-- Индексы таблицы `prod_combo_blocks`
--
ALTER TABLE `prod_combo_blocks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_prod_combo_blocks_tenant` (`tenant_id`);

--
-- Индексы таблицы `prod_combo_block_products`
--
ALTER TABLE `prod_combo_block_products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_prod_combo_block_products_block_product` (`block_id`,`product_id`),
  ADD KEY `idx_prod_combo_block_products_block` (`block_id`),
  ADD KEY `idx_prod_combo_block_products_product` (`product_id`);

--
-- Индексы таблицы `prod_combo_set_blocks`
--
ALTER TABLE `prod_combo_set_blocks`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_combo_set_blocks_combo` (`combo_id`),
  ADD KEY `idx_combo_set_blocks_block` (`block_id`),
  ADD KEY `idx_combo_set_blocks_tenant` (`tenant_id`);

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
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=12;

--
-- AUTO_INCREMENT для таблицы `cust_customer_sessions`
--
ALTER TABLE `cust_customer_sessions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=47;

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
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=14;

--
-- AUTO_INCREMENT для таблицы `prod_combos`
--
ALTER TABLE `prod_combos`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- AUTO_INCREMENT для таблицы `prod_combo_blocks`
--
ALTER TABLE `prod_combo_blocks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT для таблицы `prod_combo_block_products`
--
ALTER TABLE `prod_combo_block_products`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=61;

--
-- AUTO_INCREMENT для таблицы `prod_combo_set_blocks`
--
ALTER TABLE `prod_combo_set_blocks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=74;

--
-- AUTO_INCREMENT для таблицы `prod_option_assignments`
--
ALTER TABLE `prod_option_assignments`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=148;

--
-- AUTO_INCREMENT для таблицы `prod_option_exclusions`
--
ALTER TABLE `prod_option_exclusions`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_option_groups`
--
ALTER TABLE `prod_option_groups`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=21;

--
-- AUTO_INCREMENT для таблицы `prod_option_items`
--
ALTER TABLE `prod_option_items`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=113;

--
-- AUTO_INCREMENT для таблицы `prod_option_overrides`
--
ALTER TABLE `prod_option_overrides`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT для таблицы `prod_products`
--
ALTER TABLE `prod_products`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=103;

--
-- AUTO_INCREMENT для таблицы `prod_product_categories`
--
ALTER TABLE `prod_product_categories`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=1060;

--
-- AUTO_INCREMENT для таблицы `prod_product_ingredients`
--
ALTER TABLE `prod_product_ingredients`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=67;

--
-- AUTO_INCREMENT для таблицы `prod_product_stocks`
--
ALTER TABLE `prod_product_stocks`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=289;

--
-- AUTO_INCREMENT для таблицы `prod_product_unit_links`
--
ALTER TABLE `prod_product_unit_links`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

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
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=60;

--
-- AUTO_INCREMENT для таблицы `prod_variant_discount_tiers`
--
ALTER TABLE `prod_variant_discount_tiers`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=45;

--
-- AUTO_INCREMENT для таблицы `prod_variant_groups`
--
ALTER TABLE `prod_variant_groups`
  MODIFY `id` bigint UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=15;

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
-- Ограничения внешнего ключа таблицы `prod_combo_block_products`
--
ALTER TABLE `prod_combo_block_products`
  ADD CONSTRAINT `fk_prod_combo_block_products_block` FOREIGN KEY (`block_id`) REFERENCES `prod_combo_blocks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_prod_combo_block_products_product` FOREIGN KEY (`product_id`) REFERENCES `prod_products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

--
-- Ограничения внешнего ключа таблицы `prod_combo_set_blocks`
--
ALTER TABLE `prod_combo_set_blocks`
  ADD CONSTRAINT `fk_combo_set_blocks_block` FOREIGN KEY (`block_id`) REFERENCES `prod_combo_blocks` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_combo_set_blocks_combo` FOREIGN KEY (`combo_id`) REFERENCES `prod_combos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
