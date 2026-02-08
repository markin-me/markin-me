ALTER TABLE print_api_tokens
  ADD COLUMN printer_name VARCHAR(255) NULL AFTER last_used_at;

ALTER TABLE print_api_tokens
  ADD COLUMN agent_name VARCHAR(255) NULL AFTER printer_name;

ALTER TABLE print_api_tokens
  ADD COLUMN agent_version VARCHAR(64) NULL AFTER agent_name;

ALTER TABLE print_api_tokens
  ADD COLUMN last_heartbeat_at DATETIME NULL AFTER agent_version;

ALTER TABLE print_api_tokens
  ADD COLUMN agent_running TINYINT(1) NOT NULL DEFAULT 0 AFTER last_heartbeat_at;
