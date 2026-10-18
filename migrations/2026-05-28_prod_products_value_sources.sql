ALTER TABLE `prod_products`
  ADD COLUMN `cost_price_source` VARCHAR(16) NOT NULL DEFAULT 'manual' AFTER `cost_price`,
  ADD COLUMN `price_source` VARCHAR(16) NOT NULL DEFAULT 'manual' AFTER `price`,
  ADD COLUMN `base_qty_source` VARCHAR(16) NOT NULL DEFAULT 'manual' AFTER `base_qty`;
