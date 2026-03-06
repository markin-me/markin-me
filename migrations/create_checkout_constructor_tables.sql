CREATE TABLE IF NOT EXISTS prod_checkout_constructor_blocks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  require_all TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checkout_ctor_blocks_tenant_id_id (tenant_id, id),
  KEY idx_checkout_ctor_blocks_tenant_active_sort (tenant_id, is_active, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS prod_checkout_constructor_block_categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  block_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_checkout_ctor_block_category (tenant_id, block_id, category_id),
  KEY idx_checkout_ctor_block_categories_tenant_block_sort (tenant_id, block_id, sort_order),
  KEY idx_checkout_ctor_block_categories_tenant_category (tenant_id, category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE prod_checkout_constructor_block_categories
  ADD CONSTRAINT fk_checkout_ctor_block_categories_block
  FOREIGN KEY (tenant_id, block_id)
  REFERENCES prod_checkout_constructor_blocks (tenant_id, id)
  ON DELETE CASCADE
  ON UPDATE CASCADE,
  ADD CONSTRAINT fk_checkout_ctor_block_categories_category
  FOREIGN KEY (tenant_id, category_id)
  REFERENCES prod_categories (tenant_id, id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;
