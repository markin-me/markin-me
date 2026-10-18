-- PRINT.API.1: separate print connections, agents and printer instances.

CREATE TABLE IF NOT EXISTS print_agents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  store_id BIGINT UNSIGNED NOT NULL,
  token_id BIGINT UNSIGNED NOT NULL,
  installation_id VARCHAR(128) NULL,
  is_legacy TINYINT(1) NOT NULL DEFAULT 0,
  device_name VARCHAR(255) NULL,
  agent_version VARCHAR(64) NULL,
  printer_name VARCHAR(255) NULL,
  last_heartbeat_at DATETIME NULL,
  agent_running TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_print_agents_installation (tenant_id, store_id, installation_id),
  UNIQUE KEY uq_print_agents_legacy_connection (tenant_id, store_id, token_id, is_legacy),
  KEY idx_print_agents_connection (tenant_id, store_id, token_id),
  KEY idx_print_agents_heartbeat (tenant_id, store_id, last_heartbeat_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE print_api_tokens DROP INDEX uniq_store;

ALTER TABLE print_printers
  ADD COLUMN agent_id BIGINT UNSIGNED NULL AFTER token_id,
  DROP INDEX uq_token_printer,
  ADD UNIQUE KEY uq_agent_printer (agent_id, system_name),
  ADD KEY idx_print_printers_agent (tenant_id, store_id, agent_id);

ALTER TABLE print_jobs
  ADD COLUMN target_printer_id BIGINT UNSIGNED NULL AFTER token_id,
  ADD COLUMN target_agent_id BIGINT UNSIGNED NULL AFTER target_printer_id,
  ADD COLUMN claimed_by_agent_id BIGINT UNSIGNED NULL AFTER target_agent_id,
  ADD KEY idx_print_jobs_target_agent (tenant_id, store_id, target_agent_id, status, id);

INSERT INTO print_agents
  (tenant_id, store_id, token_id, installation_id, is_legacy, device_name, agent_version,
   printer_name, last_heartbeat_at, agent_running, created_at, updated_at)
SELECT tenant_id, store_id, id, NULL, 1, agent_name, agent_version,
       printer_name, last_heartbeat_at, agent_running, COALESCE(created_at, NOW()), COALESCE(updated_at, NOW())
FROM print_api_tokens
ON DUPLICATE KEY UPDATE
  device_name=VALUES(device_name),
  agent_version=VALUES(agent_version),
  printer_name=VALUES(printer_name),
  last_heartbeat_at=VALUES(last_heartbeat_at),
  agent_running=VALUES(agent_running),
  updated_at=VALUES(updated_at);

UPDATE print_printers p
INNER JOIN print_agents a
        ON a.tenant_id=p.tenant_id
       AND a.store_id=p.store_id
       AND a.token_id=p.token_id
       AND a.is_legacy=1
SET p.agent_id=a.id
WHERE p.agent_id IS NULL;

UPDATE print_jobs j
LEFT JOIN print_printers p
       ON p.tenant_id=j.tenant_id
      AND p.store_id=j.store_id
      AND p.id=j.target_printer_id
SET j.target_agent_id=p.agent_id
WHERE j.target_printer_id IS NOT NULL
  AND j.target_agent_id IS NULL;
