-- Additive migration. Apply manually after the payment core and reconciliation migrations.
ALTER TABLE order_refunds
  ADD UNIQUE KEY uq_order_refund_tenant_id (tenant_id,id);

ALTER TABLE payment_refunds
  ADD COLUMN order_return_id INT NULL,
  ADD COLUMN actor_user_id INT NULL,
  ADD KEY idx_payment_refund_return (tenant_id,order_return_id,id),
  ADD CONSTRAINT fk_payment_refund_return FOREIGN KEY (tenant_id,order_return_id)
    REFERENCES order_refunds(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT;
