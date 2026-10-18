ALTER TABLE payment_provider_connections
  ADD COLUMN verified_at DATETIME(6) NULL,
  ADD COLUMN last_checked_at DATETIME(6) NULL,
  ADD COLUMN verified_revision INT UNSIGNED NULL,
  ADD COLUMN verification_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN verification_lease_until DATETIME(6) NULL,
  ADD COLUMN verification_attempt_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN provider_capabilities JSON NULL,
  ADD COLUMN capabilities_synced_at DATETIME(6) NULL;

CREATE TABLE payment_provider_operations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  payment_id INT NOT NULL,
  provider_connection_id INT NOT NULL,
  refund_id INT NULL,
  operation ENUM('create','capture','cancel','refund') NOT NULL,
  idempotency_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  provider_key CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  payload JSON NOT NULL,
  status ENUM('reserved','succeeded','failed','uncertain') NOT NULL,
  result JSON NULL,
  error_code VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_provider_operation (tenant_id,operation,idempotency_key),
  UNIQUE KEY uq_payment_provider_key (provider_connection_id,provider_key),
  KEY idx_payment_provider_history (tenant_id,payment_id,id),
  CONSTRAINT fk_payment_provider_operation FOREIGN KEY (tenant_id,payment_id,provider_connection_id)
    REFERENCES payment_payments(tenant_id,id,provider_connection_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_provider_operation_store FOREIGN KEY (tenant_id,store_id)
    REFERENCES ten_stores(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
