-- Explicit device removal and printer rediscovery after disconnect/reconnect.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_agents' AND COLUMN_NAME='removed_at')=0,
 'ALTER TABLE print_agents ADD COLUMN removed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_printers' AND COLUMN_NAME='removed_at')=0,
 'ALTER TABLE print_printers ADD COLUMN removed_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_printers' AND COLUMN_NAME='rediscovery_armed')=0,
 'ALTER TABLE print_printers ADD COLUMN rediscovery_armed TINYINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
