-- Apply manually once before using per-product option composition settings.
ALTER TABLE prod_option_item_product_settings
  ADD COLUMN configuration_json JSON NULL;
