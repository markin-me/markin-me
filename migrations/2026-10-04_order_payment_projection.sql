-- Apply manually after 2026-10-04_checkout_online_payment.sql.
ALTER TABLE order_orders
  ADD COLUMN payment_projection JSON NULL,
  ADD COLUMN payment_satisfied_at DATETIME(6) NULL,
  ADD COLUMN payment_refresh_after DATETIME(6) NULL,
  ADD COLUMN manual_paid_at DATETIME(6) NULL,
  ADD COLUMN manual_paid_by INT NULL;

CREATE TABLE order_payment_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  actor_user_id INT NOT NULL,
  type ENUM('manual_paid','manual_unpaid') NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  created_at DATETIME(6) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_order_payment_audit (tenant_id,store_id,order_id,id),
  CONSTRAINT fk_order_payment_audit_order FOREIGN KEY (order_id) REFERENCES order_orders(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT chk_order_payment_audit_amount CHECK (amount>=0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
CREATE TRIGGER order_payment_audit_no_update BEFORE UPDATE ON order_payment_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Order payment audit is append-only';
CREATE TRIGGER order_payment_audit_no_delete BEFORE DELETE ON order_payment_audit FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Order payment audit is append-only';
