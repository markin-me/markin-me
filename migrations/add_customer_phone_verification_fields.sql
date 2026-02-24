ALTER TABLE `cust_customers`
  ADD COLUMN `phone_verify_code` varchar(4) COLLATE utf8mb4_general_ci DEFAULT NULL COMMENT '4-digit phone verification code',
  ADD COLUMN `phone_verify_expires_at` datetime DEFAULT NULL COMMENT 'verification code expiration',
  ADD COLUMN `phone_verified_at` datetime DEFAULT NULL COMMENT 'phone verified timestamp';
