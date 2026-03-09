ALTER TABLE `order_orders`
  ADD COLUMN `is_paid` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0 - не оплачен, 1 - оплачен' AFTER `payment_id`;
