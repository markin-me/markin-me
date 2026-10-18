-- Additive Order-owned payment gate. Apply manually, after the Payment Core/Service migrations.
ALTER TABLE ten_tenants ADD COLUMN online_receipt_config JSON NULL;

ALTER TABLE order_orders
  ADD COLUMN online_payment_required TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN online_payment_status ENUM('pending','paid','not_required') NULL,
  ADD COLUMN online_payment_total DECIMAL(10,2) NULL,
  ADD KEY idx_order_payment_gate (tenant_id,store_id,online_payment_required,online_payment_status,id),
  ADD CONSTRAINT chk_order_online_payment_gate CHECK (
    online_payment_required IN (0,1) AND (online_payment_total IS NULL OR online_payment_total>=0));
