ALTER TABLE mkt_customer_bonus_favorite_categories
  ADD COLUMN period_key varchar(7) COLLATE utf8mb4_unicode_ci NULL AFTER level_id;

UPDATE mkt_customer_bonus_favorite_categories
   SET period_key = DATE_FORMAT(created_at, '%Y-%m')
 WHERE period_key IS NULL OR period_key = '';

DELETE duplicate_rows
  FROM mkt_customer_bonus_favorite_categories duplicate_rows
  JOIN mkt_customer_bonus_favorite_categories keep_rows
    ON keep_rows.tenant_id = duplicate_rows.tenant_id
   AND keep_rows.customer_id = duplicate_rows.customer_id
   AND keep_rows.period_key = duplicate_rows.period_key
   AND keep_rows.category_id = duplicate_rows.category_id
   AND keep_rows.id < duplicate_rows.id;

ALTER TABLE mkt_customer_bonus_favorite_categories
  MODIFY period_key varchar(7) COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE mkt_customer_bonus_favorite_categories
  DROP INDEX uq_customer_bonus_favorite_category,
  ADD UNIQUE KEY uq_customer_bonus_favorite_period_category (tenant_id, customer_id, period_key, category_id),
  ADD KEY idx_customer_bonus_favorite_period (tenant_id, customer_id, period_key);
