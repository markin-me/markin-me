ALTER TABLE `prod_products`
  ADD COLUMN `margin_percent` DECIMAL(8,3) NULL AFTER `price_source`;
