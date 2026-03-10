SET @idx_scheduled_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_orders'
    AND INDEX_NAME = 'idx_order_orders_dashboard_status_scheduled'
);

SET @sql = IF(
  @idx_scheduled_exists = 0,
  "ALTER TABLE `order_orders`
     ADD INDEX `idx_order_orders_dashboard_status_scheduled` (`tenant_id`,`store_id`,`is_active`,`status_id`,`scheduled_at`,`id`)",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_created_exists = (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'order_orders'
    AND INDEX_NAME = 'idx_order_orders_dashboard_status_created'
);

SET @sql = IF(
  @idx_created_exists = 0,
  "ALTER TABLE `order_orders`
     ADD INDEX `idx_order_orders_dashboard_status_created` (`tenant_id`,`store_id`,`is_active`,`status_id`,`created_at`,`id`)",
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
