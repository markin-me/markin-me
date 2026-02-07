-- Add print templates support
CREATE TABLE IF NOT EXISTS print_templates (
  id INT PRIMARY KEY AUTO_INCREMENT,
  tenant_id INT NOT NULL,
  store_id INT NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT 'Default',
  template_html LONGTEXT,
  is_active TINYINT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_default (tenant_id, store_id),
  KEY idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default template for each tenant/store
INSERT INTO print_templates (tenant_id, store_id, title, template_html, is_active)
SELECT DISTINCT ten_stores.tenant_id, ten_stores.id, 'Default Receipt', '', 1
FROM ten_stores
LEFT JOIN print_templates pt ON pt.tenant_id = ten_stores.tenant_id AND pt.store_id = ten_stores.id
WHERE pt.id IS NULL
ON DUPLICATE KEY UPDATE is_active=1;
