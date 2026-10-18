-- Apply manually after 2026-10-10_payment_webhooks.sql. Worker remains OFF by default.
ALTER TABLE payment_payments
  ADD COLUMN reconciliation_state ENUM('scheduled','retryable','manual_review','done') NOT NULL DEFAULT 'scheduled',
  ADD COLUMN next_reconcile_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD COLUMN last_reconciled_at DATETIME(6) NULL,
  ADD COLUMN reconcile_attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN last_reconcile_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN reconcile_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN reconcile_lease_until DATETIME(6) NULL,
  ADD COLUMN refresh_available_at DATETIME(6) NULL,
  ADD KEY idx_payment_reconcile_due (reconciliation_state,next_reconcile_at,id),
  ADD KEY idx_payment_reconcile_lease (reconciliation_state,reconcile_lease_until,id);

ALTER TABLE payment_provider_connections
  ADD COLUMN reconcile_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN reconcile_lease_until DATETIME(6) NULL,
  ADD COLUMN reconcile_retry_after DATETIME(6) NULL,
  ADD COLUMN reconcile_error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN reconcile_blocked_at DATETIME(6) NULL,
  ADD COLUMN reconcile_blocked_revision INT UNSIGNED NULL;

ALTER TABLE payment_provider_operations
  ADD COLUMN request_snapshot LONGTEXT NULL,
  ADD COLUMN recovery_attempt_count INT UNSIGNED NOT NULL DEFAULT 0,
  ADD KEY idx_payment_operation_recovery (tenant_id,payment_id,status,operation,lease_until);

UPDATE payment_payments SET reconciliation_state='done',next_reconcile_at=NULL
WHERE status IN ('paid','cancelled','failed','partially_refunded','refunded');
