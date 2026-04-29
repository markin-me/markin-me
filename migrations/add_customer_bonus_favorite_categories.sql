CREATE TABLE IF NOT EXISTS mkt_customer_bonus_favorite_categories (
  id bigint UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id int NOT NULL,
  customer_id int NOT NULL,
  level_id int UNSIGNED NOT NULL,
  category_id bigint UNSIGNED NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_bonus_favorite_category (tenant_id, customer_id, level_id, category_id),
  KEY idx_customer_bonus_favorite_level (tenant_id, customer_id, level_id),
  KEY idx_customer_bonus_favorite_category (tenant_id, category_id),
  CONSTRAINT fk_customer_bonus_favorite_customer
    FOREIGN KEY (customer_id) REFERENCES cust_customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_customer_bonus_favorite_level
    FOREIGN KEY (level_id) REFERENCES mkt_bonus_levels (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
