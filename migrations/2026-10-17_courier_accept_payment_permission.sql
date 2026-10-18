-- Enable explicitly for the courier role in Team after applying.
INSERT INTO system_permissions
  (permission_key, group_key, label, description, allowed_access_rules, sort_order)
VALUES
  ('courier.orders.accept_payment', 'courier', 'Приём оплаты',
   'Приём наличных или оплаты картой по назначенным курьеру заказам. Без отмены оплаты и возвратов.',
   'assigned', 1073)
ON DUPLICATE KEY UPDATE
  group_key=VALUES(group_key), label=VALUES(label), description=VALUES(description),
  allowed_access_rules=VALUES(allowed_access_rules), sort_order=VALUES(sort_order);

-- Restore the existing owner invariant: every registered permission with full scope.
INSERT INTO role_permissions (tenant_id, role_id, permission_id, access_rule)
SELECT r.tenant_id, r.id, p.id, 'all'
FROM tenant_roles r
CROSS JOIN system_permissions p
WHERE r.is_owner=1
ON DUPLICATE KEY UPDATE access_rule='all';
