-- NEWORDER.PERF.5: persistent create-order idempotency schema.

ALTER TABLE `order_orders`
  ADD COLUMN `submission_scope_store_id` BIGINT UNSIGNED NULL AFTER `store_id`,
  ADD COLUMN `submission_id` CHAR(36) NULL AFTER `submission_scope_store_id`,
  ADD COLUMN `submission_fingerprint` CHAR(64) NULL AFTER `submission_id`,
  ADD UNIQUE KEY `uq_order_submission` (`tenant_id`, `submission_scope_store_id`, `submission_id`);
