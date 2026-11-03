-- Reference DDL. Use the companion JS migration for guarded, repeatable application.
-- Explicit permission and a verified backup of structure/data are required.
-- No customer/employee records are changed. Existing requests default to no approval.
ALTER TABLE auth_browser_requests
  ADD COLUMN contact_phone VARCHAR(20) NULL,
  ADD COLUMN contact_name VARCHAR(100) NULL,
  ADD COLUMN contact_verified_at DATETIME NULL,
  ADD COLUMN ownership_customer_id INT NULL,
  ADD COLUMN ownership_status ENUM('none','requested','approved','denied') NOT NULL DEFAULT 'none',
  ADD COLUMN ownership_method ENUM('messenger','admin') NULL,
  ADD COLUMN ownership_channel_id BIGINT UNSIGNED NULL,
  ADD COLUMN ownership_requested_at DATETIME NULL,
  ADD COLUMN ownership_reviewed_at DATETIME NULL,
  ADD COLUMN ownership_reviewer_id INT NULL,
  ADD COLUMN ownership_note VARCHAR(500) NULL,
  ADD INDEX idx_browser_contact (provider,provider_user_id,state,expires_at),
  ADD INDEX idx_browser_review (tenant_id,ownership_customer_id,ownership_status,expires_at);
-- Rollback: first deploy the previous compatible application; wait until all requests expire.
-- Export the request/decision audit before any column removal. With separate approval,
-- remove only these two indexes and the eleven columns added above; keep customer,
-- employee, identity, session and order data. Do not run DROP automatically.
