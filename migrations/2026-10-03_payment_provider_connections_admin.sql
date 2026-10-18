ALTER TABLE payment_provider_connections
  ADD COLUMN verification_status ENUM('not_checked','verified','failed','stale') NOT NULL DEFAULT 'not_checked',
  ADD COLUMN configuration JSON NULL,
  ADD COLUMN credentials_encrypted JSON NULL,
  ADD COLUMN credentials_version INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN scope_type ENUM('all','selected') NOT NULL DEFAULT 'selected',
  ADD COLUMN revision INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN archived_at DATETIME(6) NULL,
  ADD UNIQUE KEY uq_payment_connection_tenant_id (tenant_id,id),
  ADD KEY idx_payment_connection_routing (tenant_id,provider,environment,enabled,archived_at),
  ADD CONSTRAINT chk_payment_connection_revision CHECK (revision>0);

CREATE TABLE payment_connection_stores (
  tenant_id INT NOT NULL,
  connection_id INT NOT NULL,
  store_id INT NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (tenant_id,connection_id,store_id),
  KEY idx_payment_connection_store (tenant_id,store_id),
  CONSTRAINT fk_payment_assignment_connection FOREIGN KEY (tenant_id,connection_id)
    REFERENCES payment_provider_connections(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT fk_payment_assignment_store FOREIGN KEY (tenant_id,store_id)
    REFERENCES ten_stores(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_connection_guards (
  tenant_id INT NOT NULL,
  PRIMARY KEY (tenant_id),
  CONSTRAINT fk_payment_connection_guard_tenant FOREIGN KEY (tenant_id)
    REFERENCES ten_tenants(id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE payment_connection_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  connection_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  type VARCHAR(64) NOT NULL,
  request_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_payment_connection_audit (tenant_id,connection_id,id),
  CONSTRAINT fk_payment_connection_audit FOREIGN KEY (tenant_id,connection_id)
    REFERENCES payment_provider_connections(tenant_id,id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TRIGGER payment_connection_audit_no_update BEFORE UPDATE ON payment_connection_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment connection audit is append-only';

CREATE TRIGGER payment_connection_audit_no_delete BEFORE DELETE ON payment_connection_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Payment connection audit is append-only';
