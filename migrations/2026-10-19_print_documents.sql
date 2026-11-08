-- Run manually before deploying the new print rules and queue writer.
-- Reapplicable; preserves the identity of legacy jobs that omit job_key.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='prod_store_print_rules' AND COLUMN_NAME='auto_print')=0,
 'ALTER TABLE prod_store_print_rules ADD COLUMN auto_print TINYINT NOT NULL DEFAULT 1, ADD COLUMN item_scope VARCHAR(16) NOT NULL DEFAULT ''zone'', ADD COLUMN config_version INT NOT NULL DEFAULT 1', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_jobs' AND COLUMN_NAME='job_key')=0,
 'ALTER TABLE print_jobs ADD COLUMN job_key VARCHAR(160) NULL, ADD COLUMN legacy_order_key INT GENERATED ALWAYS AS (CASE WHEN job_key IS NULL THEN order_id ELSE NULL END) STORED, DROP INDEX uniq_print_job_order, ADD UNIQUE KEY uniq_print_job_order (tenant_id,store_id,legacy_order_key), ADD UNIQUE KEY uq_print_job_key (tenant_id,store_id,job_key)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Manual retry snapshots preserve the previous failure before a new attempt.
CREATE TABLE IF NOT EXISTS print_job_retries (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  attempts INT NOT NULL,
  last_error TEXT NULL,
  created_at DATETIME NOT NULL,
  KEY idx_print_job_retries (tenant_id, job_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Order-grouped queue, soft removal, and independent manual print attempts.
SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_jobs' AND COLUMN_NAME='deleted_at')=0,
 'ALTER TABLE print_jobs ADD COLUMN deleted_at DATETIME NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @s = IF((SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_jobs' AND COLUMN_NAME='retry_of_job_id')=0,
 'ALTER TABLE print_jobs ADD COLUMN retry_of_job_id BIGINT UNSIGNED NULL', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @s = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='print_jobs' AND INDEX_NAME='idx_print_jobs_parent')=0,
 'ALTER TABLE print_jobs ADD KEY idx_print_jobs_parent (tenant_id,store_id,token_id,retry_of_job_id)', 'SELECT 1');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;

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
