INSERT INTO `system_permissions`
  (`permission_key`, `group_key`, `label`, `description`, `allowed_access_rules`, `sort_order`)
VALUES
  ('finance.manage', 'finance', 'Изменение кассовых данных', NULL, 'all,stores', 430),
  ('chat.view', 'chat', 'Просмотр чатов поддержки', NULL, 'all', 810),
  ('chat.manage', 'chat', 'Работа с чатами поддержки', NULL, 'all', 820)
ON DUPLICATE KEY UPDATE
  `group_key` = VALUES(`group_key`),
  `label` = VALUES(`label`),
  `description` = VALUES(`description`),
  `allowed_access_rules` = VALUES(`allowed_access_rules`),
  `sort_order` = VALUES(`sort_order`);

INSERT IGNORE INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT rp.`tenant_id`, rp.`role_id`, target.`id`, rp.`access_rule`
FROM `role_permissions` rp
JOIN `system_permissions` source ON source.`id` = rp.`permission_id`
JOIN `system_permissions` target ON target.`permission_key` = 'finance.manage'
WHERE source.`permission_key` = 'finance.view';

INSERT IGNORE INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT rp.`tenant_id`, rp.`role_id`, target.`id`, 'all'
FROM `role_permissions` rp
JOIN `system_permissions` source ON source.`id` = rp.`permission_id`
JOIN `system_permissions` target ON target.`permission_key` = 'chat.view'
WHERE source.`permission_key` = 'clients.view';

INSERT IGNORE INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT rp.`tenant_id`, rp.`role_id`, target.`id`, 'all'
FROM `role_permissions` rp
JOIN `system_permissions` source ON source.`id` = rp.`permission_id`
JOIN `system_permissions` target ON target.`permission_key` = 'chat.manage'
WHERE source.`permission_key` = 'clients.edit';
