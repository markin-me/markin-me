-- Apply manually before using locked option items in product cards.
ALTER TABLE prod_option_item_product_settings
  ADD COLUMN is_locked TINYINT(1) NOT NULL DEFAULT 0;
