CREATE TABLE IF NOT EXISTS ten_tenant_domains (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT UNSIGNED NOT NULL,
  domain VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  domain_ascii VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenant_domains_ascii (domain_ascii),
  KEY idx_tenant_domains_tenant (tenant_id),
  KEY idx_tenant_domains_enabled (tenant_id, is_enabled, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO ten_tenant_domains (tenant_id, domain, domain_ascii, is_enabled)
SELECT t.id, t.custom_domain, t.custom_domain_ascii, 1
FROM ten_tenants t
WHERE t.custom_domain_ascii IS NOT NULL
  AND t.custom_domain_ascii <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM ten_tenant_domains d
    WHERE d.domain_ascii COLLATE utf8mb4_general_ci = t.custom_domain_ascii COLLATE utf8mb4_general_ci
  );
