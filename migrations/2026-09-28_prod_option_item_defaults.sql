ALTER TABLE prod_option_items
  ADD COLUMN default_selected TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN default_variant_group_id BIGINT UNSIGNED NULL,
  ADD COLUMN default_variant_value_index INT NULL;

CREATE TABLE prod_option_item_product_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  group_id BIGINT UNSIGNED NOT NULL,
  option_item_id BIGINT UNSIGNED NOT NULL,
  default_selected TINYINT(1) NULL,
  variant_override_enabled TINYINT(1) NOT NULL DEFAULT 0,
  default_variant_group_id BIGINT UNSIGNED NULL,
  default_variant_value_index INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_option_item_product_setting_scope (tenant_id, product_id, group_id, option_item_id),
  KEY idx_option_item_product_setting_group (tenant_id, group_id),
  KEY fk_option_item_product_setting_product (product_id),
  KEY fk_option_item_product_setting_group (group_id),
  KEY fk_option_item_product_setting_item (option_item_id),
  CONSTRAINT fk_option_item_product_setting_product FOREIGN KEY (product_id) REFERENCES prod_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_option_item_product_setting_group FOREIGN KEY (group_id) REFERENCES prod_option_groups (id) ON DELETE CASCADE,
  CONSTRAINT fk_option_item_product_setting_item FOREIGN KEY (option_item_id) REFERENCES prod_option_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
