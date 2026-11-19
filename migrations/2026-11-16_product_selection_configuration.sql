-- Apply manually after 2026-11-16_auto_add_rules.sql.
-- Configuration belongs to the selected item, not to the catalog product.
ALTER TABLE prod_auto_add_items ADD COLUMN configuration_json JSON NULL;
ALTER TABLE prod_option_items ADD COLUMN configuration_json JSON NULL;
