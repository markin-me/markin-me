CREATE TABLE IF NOT EXISTS telegram_customer_notifications (
  tenant_id INT NOT NULL,
  order_id INT NOT NULL,
  status_id INT NOT NULL,
  state ENUM('sending','sent','failed','blocked') NOT NULL DEFAULT 'sending',
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (tenant_id,order_id,status_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
