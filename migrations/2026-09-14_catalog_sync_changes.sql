CREATE TABLE IF NOT EXISTS catalog_changes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  operation VARCHAR(16) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_catalog_changes_scope_revision (tenant_id, store_id, id),
  KEY idx_catalog_changes_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation)
SELECT p.tenant_id, s.id, 'product', p.id, 'upsert'
  FROM prod_products p
  JOIN ten_stores s ON s.tenant_id=p.tenant_id;

INSERT INTO catalog_changes (tenant_id, store_id, entity_type, entity_id, operation)
SELECT s.tenant_id, s.id, 'category', NULL, 'upsert'
  FROM ten_stores s;
