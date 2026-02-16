ALTER TABLE `prod_stock_document_items`
  ADD COLUMN `purchase_total` decimal(14,6) DEFAULT NULL COMMENT 'Фактически потрачено по позиции' AFTER `purchase_price`;

UPDATE `prod_stock_document_items`
SET `purchase_total` = (`qty` * COALESCE(`purchase_price`, `cost_price`, 0))
WHERE `purchase_total` IS NULL
  AND (`purchase_price` IS NOT NULL OR `cost_price` IS NOT NULL);
