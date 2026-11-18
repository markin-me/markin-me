-- MySQL. Apply manually before deploying combo block configuration.
-- Existing products keep their catalog defaults when configuration_json is NULL.
ALTER TABLE prod_combo_block_products ADD COLUMN configuration_json JSON NULL;
