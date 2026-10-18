CREATE TABLE payment_provider_connections (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  name VARCHAR(150) NOT NULL,
  environment ENUM('test','live') NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_connection_scope (tenant_id,id,provider,environment),
  KEY idx_payment_connection_list (tenant_id,enabled,id),
  CONSTRAINT fk_payment_connection_tenant FOREIGN KEY (tenant_id) REFERENCES ten_tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_payment_connection_enabled CHECK (enabled IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_payments (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  provider_connection_id INT NOT NULL,
  provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  environment ENUM('test','live') NOT NULL,
  channel VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  method VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('created','pending','waiting_for_confirmation','paid','cancelled','failed','partially_refunded','refunded') NOT NULL,
  provider_payment_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  idempotency_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  confirmation_url VARCHAR(2048) NULL,
  captured_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  provider_data JSON NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  paid_at DATETIME(6) NULL,
  cancelled_at DATETIME(6) NULL,
  failed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_scope (tenant_id,id,provider_connection_id),
  UNIQUE KEY uq_payment_idempotency (tenant_id,idempotency_key),
  UNIQUE KEY uq_payment_external (provider_connection_id,provider_payment_id),
  KEY idx_payment_order (tenant_id,store_id,order_id,id),
  KEY idx_payment_due (tenant_id,status,created_at,id),
  KEY idx_payment_connection (tenant_id,provider_connection_id,provider,environment),
  KEY idx_payment_order_fk (order_id),
  CONSTRAINT fk_payment_store FOREIGN KEY (tenant_id,store_id) REFERENCES ten_stores(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_order FOREIGN KEY (order_id) REFERENCES order_orders(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_connection FOREIGN KEY (tenant_id,provider_connection_id,provider,environment)
    REFERENCES payment_provider_connections(tenant_id,id,provider,environment) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_payment_amounts CHECK (amount>0 AND captured_amount>=0 AND captured_amount<=amount AND refunded_amount>=0 AND refunded_amount<=captured_amount),
  CONSTRAINT chk_payment_financial_state CHECK (
    (status IN ('created','pending','waiting_for_confirmation','cancelled','failed') AND captured_amount=0 AND refunded_amount=0)
    OR (status='paid' AND captured_amount=amount AND refunded_amount=0)
    OR (status='partially_refunded' AND captured_amount=amount AND refunded_amount>0 AND refunded_amount<captured_amount)
    OR (status='refunded' AND captured_amount=amount AND refunded_amount=captured_amount))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_events (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  payment_id INT NOT NULL,
  provider_connection_id INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  previous_status VARCHAR(32) NULL,
  new_status VARCHAR(32) NOT NULL,
  source ENUM('system','provider','admin','reconciliation') NOT NULL,
  provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  provider_event_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  metadata JSON NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payment_event_history (tenant_id,payment_id,id),
  KEY idx_payment_event_scope (tenant_id,payment_id,provider_connection_id),
  CONSTRAINT fk_payment_event FOREIGN KEY (tenant_id,payment_id,provider_connection_id)
    REFERENCES payment_payments(tenant_id,id,provider_connection_id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_refunds (
  id INT NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  payment_id INT NOT NULL,
  provider_connection_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency CHAR(3) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('created','pending','succeeded','failed','cancelled') NOT NULL,
  provider_refund_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NULL,
  idempotency_key VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  completed_at DATETIME(6) NULL,
  failed_at DATETIME(6) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_refund_idempotency (tenant_id,idempotency_key),
  UNIQUE KEY uq_payment_refund_external (provider_connection_id,provider_refund_id),
  KEY idx_payment_refund_payment (tenant_id,payment_id,provider_connection_id),
  CONSTRAINT fk_payment_refund_payment FOREIGN KEY (tenant_id,payment_id,provider_connection_id)
    REFERENCES payment_payments(tenant_id,id,provider_connection_id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_payment_refund_amount CHECK (amount>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TRIGGER payment_events_no_update BEFORE UPDATE ON payment_events FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment events are append-only';

CREATE TRIGGER payment_events_no_delete BEFORE DELETE ON payment_events FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment events are append-only';
