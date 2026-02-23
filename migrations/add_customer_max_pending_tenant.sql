ALTER TABLE `cust_customer_max_pending`
  ADD COLUMN `tenant_id` int NOT NULL DEFAULT 1 AFTER `id`;

ALTER TABLE `cust_customer_max_pending`
  DROP INDEX `uq_cust_max_pending_user`,
  ADD UNIQUE KEY `uq_cust_max_pending_tenant_user` (`tenant_id`,`max_user_id`);

ALTER TABLE `cust_customer_max_pending`
  ADD KEY `idx_cust_max_pending_tenant_exp` (`tenant_id`,`expires_at`);
