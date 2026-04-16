SET NAMES utf8mb4;

ALTER TABLE `mkt_discounts`
  MODIFY COLUMN `mechanic_type` ENUM('simple_discount','buy_x_get_y','threshold','loyalty_progress') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'simple_discount';

ALTER TABLE `cust_customer_sessions`
  DROP INDEX `uniq_token`,
  DROP INDEX `idx_tenant_customer`;

ALTER TABLE `ten_tenant_domains`
  DROP INDEX `idx_tenant_domains_primary`,
  DROP COLUMN `is_primary`;

UPDATE `order_statuses`
SET `title` = 'Новые'
WHERE `code` = 'new'
  AND `title` <> 'Новые';

UPDATE `order_statuses`
SET `title` = 'Готовятся'
WHERE `code` = 'cooking'
  AND `title` <> 'Готовятся';

UPDATE `order_statuses`
SET `title` = 'Доставлены'
WHERE `code` = 'delivered'
  AND `title` <> 'Доставлены';

UPDATE `order_statuses`
SET `title` = 'Отменены'
WHERE `code` = 'canceled'
  AND `title` <> 'Отменены';

UPDATE `order_time_options`
SET `sort` = 1
WHERE `code` = 'asap'
  AND `sort` <> 1;

UPDATE `order_time_options`
SET `sort` = 2
WHERE `code` = 'at_time'
  AND `sort` <> 2;

UPDATE `order_time_options`
SET `sort` = 3
WHERE `code` = 'on_date'
  AND `sort` <> 3;
