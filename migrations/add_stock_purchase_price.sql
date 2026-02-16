ALTER TABLE `prod_stock_document_items`
  ADD COLUMN `purchase_price` decimal(14,6) DEFAULT NULL COMMENT 'Фактическая закупочная цена за единицу' AFTER `price`;

UPDATE `prod_stock_document_items`
SET `purchase_price` = `cost_price`
WHERE `purchase_price` IS NULL
  AND `cost_price` IS NOT NULL;
