-- Durable per-connection pause and agent acknowledgement.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_api_tokens' AND COLUMN_NAME='printing_paused')=0,
 'ALTER TABLE print_api_tokens ADD COLUMN printing_paused TINYINT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_api_tokens' AND COLUMN_NAME='print_control_version')=0,
 'ALTER TABLE print_api_tokens ADD COLUMN print_control_version BIGINT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_agents' AND COLUMN_NAME='applied_print_control_version')=0,
 'ALTER TABLE print_agents ADD COLUMN applied_print_control_version BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_jobs' AND COLUMN_NAME='printed_copies')=0,
 'ALTER TABLE print_jobs ADD COLUMN printed_copies INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
