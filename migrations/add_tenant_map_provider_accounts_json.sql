ALTER TABLE ten_tenants
ADD COLUMN map_provider_accounts_json TEXT DEFAULT NULL COMMENT 'JSON list of tenant map provider accounts';
