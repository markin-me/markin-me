-- Restore all registered permissions for owner roles. Safe to run again.
INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
SELECT r.tenant_id, r.id, p.id, 'all'
FROM tenant_roles r
CROSS JOIN system_permissions p
WHERE r.is_owner=1
ON DUPLICATE KEY UPDATE access_rule='all';
