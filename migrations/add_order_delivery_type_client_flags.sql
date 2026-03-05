ALTER TABLE order_delivery_types
  ADD COLUMN require_client_data TINYINT(1) NOT NULL DEFAULT 1 AFTER is_default;

ALTER TABLE order_delivery_types
  ADD COLUMN show_on_site TINYINT(1) NOT NULL DEFAULT 1 AFTER require_client_data;

UPDATE order_delivery_types
SET require_client_data = 1
WHERE require_client_data IS NULL;

UPDATE order_delivery_types
SET show_on_site = 1
WHERE show_on_site IS NULL;
