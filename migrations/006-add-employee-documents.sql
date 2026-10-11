CREATE TABLE `employee_document_profiles` (
  `tenant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `encrypted_payload` MEDIUMTEXT NOT NULL,
  `encryption_iv` VARBINARY(12) NOT NULL,
  `encryption_tag` VARBINARY(16) NOT NULL,
  `encryption_key_version` SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  `updated_by_user_id` INT NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `user_id`),
  CONSTRAINT `fk_employee_document_profiles_user`
    FOREIGN KEY (`tenant_id`, `user_id`) REFERENCES `app_users` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `system_permissions`
  (`permission_key`, `group_key`, `label`, `description`, `allowed_access_rules`, `sort_order`)
VALUES
  ('employee_documents.manage', 'team', 'Кадровые документы', 'Просмотр и изменение чувствительных реквизитов сотрудников', 'all', 525);

INSERT INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT r.`tenant_id`, r.`id`, p.`id`, 'all'
FROM `tenant_roles` r
JOIN `system_permissions` p ON p.`permission_key` = 'employee_documents.manage'
WHERE r.`system_key` IN ('owner', 'admin');
