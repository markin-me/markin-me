-- Apply manually after the Payment Core, provider and Order projection migrations.
ALTER TABLE payment_payments
  ADD COLUMN version INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN refresh_lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  ADD COLUMN refresh_lease_until DATETIME(6) NULL,
  ADD KEY idx_payment_webhook_lookup (provider,provider_payment_id),
  ADD CONSTRAINT chk_payment_version CHECK (version>0);

CREATE TABLE payment_webhook_inbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  event_type VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  object_id VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  references_json JSON NULL,
  payload_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('pending','processing','done','dead') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  duplicate_count INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(6) NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(6) NULL,
  error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  processed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_webhook_semantic (provider,event_type,object_id),
  KEY idx_payment_webhook_work (status,available_at,lease_until,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_event_outbox (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  payment_id INT NOT NULL,
  payment_version INT UNSIGNED NOT NULL,
  status ENUM('pending','processing','done','dead') NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  available_at DATETIME(6) NOT NULL,
  lease_token CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NULL,
  lease_until DATETIME(6) NULL,
  error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  processed_at DATETIME(6) NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payment_delivery_event (event_id),
  UNIQUE KEY uq_payment_delivery_version (tenant_id,payment_id,payment_version),
  KEY idx_payment_delivery_created (created_at,id),
  KEY idx_payment_delivery_work (status,available_at,lease_until,id),
  CONSTRAINT fk_payment_delivery_payment FOREIGN KEY (payment_id) REFERENCES payment_payments(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Main Backend owns these two tables, including their transactions.
CREATE TABLE order_payment_received_events (
  event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  payment_id INT NOT NULL,
  payment_version INT UNSIGNED NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (event_id),
  KEY idx_order_payment_received (tenant_id,store_id,order_id,payment_id,payment_version),
  CONSTRAINT fk_order_payment_received FOREIGN KEY (order_id) REFERENCES order_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE order_payment_release_effects (
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  effect ENUM('print','telegram','max','push') NOT NULL,
  status ENUM('pending','sending','done','uncertain') NOT NULL DEFAULT 'pending',
  error_code VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NULL,
  created_at DATETIME(6) NOT NULL,
  updated_at DATETIME(6) NOT NULL,
  PRIMARY KEY (tenant_id,store_id,order_id,effect),
  KEY idx_order_payment_release_work (status,updated_at,order_id),
  CONSTRAINT fk_order_payment_release FOREIGN KEY (order_id) REFERENCES order_orders(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
