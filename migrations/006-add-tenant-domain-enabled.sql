SET @tenant_domains_has_enabled := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ten_tenant_domains'
    AND COLUMN_NAME = 'is_enabled'
);

SET @tenant_domains_add_enabled_sql := IF(
  @tenant_domains_has_enabled = 0,
  'ALTER TABLE ten_tenant_domains ADD COLUMN is_enabled TINYINT(1) NOT NULL DEFAULT 1 AFTER domain_ascii',
  'SELECT 1'
);

PREPARE tenant_domains_add_enabled_stmt FROM @tenant_domains_add_enabled_sql;
EXECUTE tenant_domains_add_enabled_stmt;
DEALLOCATE PREPARE tenant_domains_add_enabled_stmt;

SET @tenant_domains_has_enabled_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ten_tenant_domains'
    AND INDEX_NAME = 'idx_tenant_domains_enabled'
);

SET @tenant_domains_add_enabled_idx_sql := IF(
  @tenant_domains_has_enabled_idx = 0,
  'ALTER TABLE ten_tenant_domains ADD KEY idx_tenant_domains_enabled (tenant_id, is_enabled, id)',
  'SELECT 1'
);

PREPARE tenant_domains_add_enabled_idx_stmt FROM @tenant_domains_add_enabled_idx_sql;
EXECUTE tenant_domains_add_enabled_idx_stmt;
DEALLOCATE PREPARE tenant_domains_add_enabled_idx_stmt;

UPDATE ten_tenant_domains
SET is_enabled = 1
WHERE is_enabled IS NULL;
