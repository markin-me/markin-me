ALTER TABLE `cust_customers`
  ADD COLUMN `max_user_id` varchar(128) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT 'MAX user id linked by phone';

ALTER TABLE `cust_customers`
  ADD UNIQUE KEY `uq_cust_tenant_max_user` (`tenant_id`,`max_user_id`);
