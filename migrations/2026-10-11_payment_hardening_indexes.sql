-- Additive operational indexes. Apply manually; no financial data changes.
ALTER TABLE payment_payments
  ADD KEY idx_payment_ops_window (tenant_id,created_at,id),
  ADD KEY idx_payment_ops_attention (tenant_id,reconciliation_state,id);
ALTER TABLE payment_provider_operations
  ADD KEY idx_payment_ops_backlog (tenant_id,status,created_at,id);
ALTER TABLE payment_refunds
  ADD KEY idx_payment_refund_ops_backlog (tenant_id,status,created_at,id);
ALTER TABLE payment_event_outbox
  ADD KEY idx_payment_outbox_ops_backlog (tenant_id,status,created_at,id);
