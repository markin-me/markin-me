SET @reward_type_has_mixed = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mkt_discounts'
    AND COLUMN_NAME = 'reward_type'
    AND COLUMN_TYPE LIKE '%''mixed''%'
);

SET @sql = IF(
  @reward_type_has_mixed = 0,
  "ALTER TABLE `mkt_discounts`
     MODIFY COLUMN `reward_type` enum('discount','bonus','gift','product_discount','mixed') NOT NULL DEFAULT 'discount' AFTER `activation_mode`",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @mechanic_type_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mkt_discounts'
    AND COLUMN_NAME = 'mechanic_type'
);

SET @sql = IF(
  @mechanic_type_exists = 0,
  "ALTER TABLE `mkt_discounts`
     ADD COLUMN `mechanic_type` enum('simple_discount','buy_x_get_y','threshold') NOT NULL DEFAULT 'simple_discount' AFTER `unique_code_usage_limit`",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @mechanic_config_exists = (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'mkt_discounts'
    AND COLUMN_NAME = 'mechanic_config_json'
);

SET @sql = IF(
  @mechanic_config_exists = 0,
  "ALTER TABLE `mkt_discounts`
     ADD COLUMN `mechanic_config_json` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `mechanic_type`",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
