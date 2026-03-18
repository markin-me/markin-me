SET @tenant_domains_has_primary_idx := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ten_tenant_domains'
    AND INDEX_NAME = 'idx_tenant_domains_primary'
);

SET @tenant_domains_drop_primary_idx_sql := IF(
  @tenant_domains_has_primary_idx > 0,
  'ALTER TABLE ten_tenant_domains DROP INDEX idx_tenant_domains_primary',
  'SELECT 1'
);

PREPARE tenant_domains_drop_primary_idx_stmt FROM @tenant_domains_drop_primary_idx_sql;
EXECUTE tenant_domains_drop_primary_idx_stmt;
DEALLOCATE PREPARE tenant_domains_drop_primary_idx_stmt;

SET @tenant_domains_has_primary_column := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'ten_tenant_domains'
    AND COLUMN_NAME = 'is_primary'
);

SET @tenant_domains_drop_primary_column_sql := IF(
  @tenant_domains_has_primary_column > 0,
  'ALTER TABLE ten_tenant_domains DROP COLUMN is_primary',
  'SELECT 1'
);

PREPARE tenant_domains_drop_primary_column_stmt FROM @tenant_domains_drop_primary_column_sql;
EXECUTE tenant_domains_drop_primary_column_stmt;
DEALLOCATE PREPARE tenant_domains_drop_primary_column_stmt;
