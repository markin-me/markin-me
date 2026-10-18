-- Apply manually after 2026-10-11_payment_refunds.sql.
ALTER TABLE payment_order_guards ADD COLUMN closed_at DATETIME(6) NULL;
ALTER TABLE order_orders
  ADD COLUMN payment_abandoned_at DATETIME(6) NULL,
  ADD COLUMN payment_cleanup_after DATETIME(6) NULL,
  ADD KEY idx_order_payment_abandoned (online_payment_required,payment_abandoned_at,payment_cleanup_after,id);
ALTER TABLE order_payment_audit
  MODIFY COLUMN actor_user_id INT NULL,
  MODIFY COLUMN type ENUM('manual_paid','manual_unpaid','gateway_refund_retry','gateway_abandoned') NOT NULL,
  ADD CONSTRAINT chk_order_payment_audit_actor CHECK (type='gateway_abandoned' OR actor_user_id IS NOT NULL);
ALTER TABLE order_refunds
  ADD COLUMN financial_state ENUM('manual','queued','processing','succeeded','failed','manual_review') NOT NULL DEFAULT 'manual',
  ADD COLUMN financial_attempt INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN financial_error_code VARCHAR(80) NULL,
  ADD COLUMN receipt_email VARCHAR(254) NULL,
  ADD COLUMN retry_idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN retry_payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN idempotency_key VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN dispatch_after DATETIME(6) NULL,
  ADD COLUMN dispatch_lease_token CHAR(36) NULL,
  ADD COLUMN dispatch_lease_until DATETIME(6) NULL,
  ADD UNIQUE KEY uq_order_refund_request (tenant_id,store_id,idempotency_key),
  ADD KEY idx_order_refund_dispatch (financial_state,dispatch_after,id);
ALTER TABLE payment_refunds
  ADD COLUMN origin ENUM('order_return','provider_external','system') NOT NULL DEFAULT 'system',
  ADD COLUMN recovery_state ENUM('scheduled','manual_review','done') NOT NULL DEFAULT 'scheduled',
  ADD COLUMN recovery_error_code VARCHAR(80) NULL,
  ADD COLUMN receipt_registration ENUM('pending','succeeded','canceled') NULL,
  ADD COLUMN provider_reason_code VARCHAR(64) NULL,
  ADD COLUMN next_check_at DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  ADD COLUMN check_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN check_lease_token CHAR(36) NULL,
  ADD COLUMN check_lease_until DATETIME(6) NULL,
  ADD KEY idx_refund_recovery (recovery_state,next_check_at,id);
CREATE TABLE payment_operational_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  action VARCHAR(64) NOT NULL,
  entity_id VARCHAR(20) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY(id),
  KEY idx_payment_operational_audit (tenant_id,created_at,id),
  CONSTRAINT fk_payment_operational_audit_tenant FOREIGN KEY (tenant_id) REFERENCES ten_tenants(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TRIGGER payment_operational_audit_no_update BEFORE UPDATE ON payment_operational_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment operational audit is append-only';
CREATE TRIGGER payment_operational_audit_no_delete BEFORE DELETE ON payment_operational_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment operational audit is append-only';
