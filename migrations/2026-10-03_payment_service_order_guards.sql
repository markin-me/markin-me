CREATE TABLE payment_order_guards (
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  PRIMARY KEY (tenant_id,store_id,order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
