ALTER TABLE `app_users`
  DROP INDEX `uq_app_users_email`,
  MODIFY COLUMN `email` VARCHAR(255) NULL DEFAULT NULL,
  ADD COLUMN `login` VARCHAR(100) NULL DEFAULT NULL AFTER `tenant_id`,
  ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 0 AFTER `password_hash`,
  ADD COLUMN `comment` TEXT NULL AFTER `name`,
  ADD UNIQUE INDEX `uq_app_users_tenant_login` (`tenant_id`, `login`),
  ADD UNIQUE INDEX `uq_app_users_tenant_id_id` (`tenant_id`, `id`);

CREATE TABLE `system_permissions` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `permission_key` VARCHAR(100) NOT NULL,
  `group_key` VARCHAR(50) NOT NULL,
  `label` VARCHAR(150) NOT NULL,
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `allowed_access_rules` VARCHAR(100) NOT NULL DEFAULT 'all',
  `sort_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_system_permissions_key` (`permission_key`),
  KEY `idx_system_permissions_group_sort` (`group_key`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `tenant_roles` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `tenant_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` VARCHAR(255) NULL DEFAULT NULL,
  `start_route` VARCHAR(255) NOT NULL DEFAULT '/dashboard/orders',
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  `is_owner` TINYINT(1) NOT NULL DEFAULT 0,
  `system_key` VARCHAR(50) NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tenant_roles_name` (`tenant_id`, `name`),
  UNIQUE KEY `uq_tenant_roles_system_key` (`tenant_id`, `system_key`),
  UNIQUE KEY `uq_tenant_roles_tenant_id_id` (`tenant_id`, `id`),
  CONSTRAINT `fk_tenant_roles_tenant`
    FOREIGN KEY (`tenant_id`) REFERENCES `ten_tenants` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `role_permissions` (
  `tenant_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  `permission_id` INT NOT NULL,
  `access_rule` ENUM('all','stores','own','assigned') NOT NULL DEFAULT 'all',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `role_id`, `permission_id`),
  KEY `idx_role_permissions_permission` (`permission_id`),
  CONSTRAINT `fk_role_permissions_role`
    FOREIGN KEY (`tenant_id`, `role_id`) REFERENCES `tenant_roles` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_role_permissions_permission`
    FOREIGN KEY (`permission_id`) REFERENCES `system_permissions` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_roles` (
  `tenant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `user_id`, `role_id`),
  KEY `idx_user_roles_role` (`tenant_id`, `role_id`),
  CONSTRAINT `fk_user_roles_user`
    FOREIGN KEY (`tenant_id`, `user_id`) REFERENCES `app_users` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_roles_role`
    FOREIGN KEY (`tenant_id`, `role_id`) REFERENCES `tenant_roles` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `user_stores` (
  `tenant_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `store_id` INT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `user_id`, `store_id`),
  KEY `idx_user_stores_store` (`tenant_id`, `store_id`),
  CONSTRAINT `fk_user_stores_user`
    FOREIGN KEY (`tenant_id`, `user_id`) REFERENCES `app_users` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_user_stores_store`
    FOREIGN KEY (`tenant_id`, `store_id`) REFERENCES `ten_stores` (`tenant_id`, `id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `order_orders`
  ADD COLUMN `assigned_user_id` INT NULL DEFAULT NULL AFTER `customer_id`,
  ADD COLUMN `created_by_user_id` INT NULL DEFAULT NULL AFTER `assigned_user_id`,
  ADD KEY `idx_order_orders_assigned_user` (`tenant_id`, `store_id`, `assigned_user_id`),
  ADD KEY `idx_order_orders_created_by_user` (`tenant_id`, `store_id`, `created_by_user_id`),
  ADD CONSTRAINT `fk_order_orders_assigned_user`
    FOREIGN KEY (`tenant_id`, `assigned_user_id`) REFERENCES `app_users` (`tenant_id`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `fk_order_orders_created_by_user`
    FOREIGN KEY (`tenant_id`, `created_by_user_id`) REFERENCES `app_users` (`tenant_id`, `id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `system_permissions`
  (`permission_key`, `group_key`, `label`, `description`, `allowed_access_rules`, `sort_order`)
VALUES
  ('orders.view', 'orders', 'Просмотр заказов', NULL, 'all,stores,own,assigned', 10),
  ('orders.edit', 'orders', 'Редактирование заказа', NULL, 'all,stores,own,assigned', 20),
  ('orders.status', 'orders', 'Изменение статуса', NULL, 'all,stores,assigned', 30),
  ('orders.assign', 'orders', 'Назначение исполнителя', NULL, 'all,stores', 40),
  ('orders.cancel', 'orders', 'Отмена заказа', NULL, 'all,stores,own,assigned', 50),
  ('orders.refund', 'orders', 'Возврат оплаты', NULL, 'all,stores', 60),
  ('clients.view', 'clients', 'Просмотр клиентов', NULL, 'all,stores,own,assigned', 110),
  ('clients.edit', 'clients', 'Редактирование клиентов', NULL, 'all,stores', 120),
  ('products.view', 'products', 'Просмотр товаров', NULL, 'all,stores', 210),
  ('products.edit', 'products', 'Редактирование товаров', NULL, 'all,stores', 220),
  ('stock.view', 'stock', 'Просмотр остатков', NULL, 'all,stores', 310),
  ('stock.edit', 'stock', 'Изменение остатков', NULL, 'all,stores', 320),
  ('finance.view', 'finance', 'Просмотр выручки', NULL, 'all,stores', 410),
  ('finance.cost', 'finance', 'Просмотр себестоимости', NULL, 'all,stores', 420),
  ('users.view', 'team', 'Просмотр сотрудников', NULL, 'all', 510),
  ('users.manage', 'team', 'Управление сотрудниками', NULL, 'all', 520),
  ('roles.manage', 'team', 'Управление ролями', NULL, 'all', 530),
  ('settings.view', 'settings', 'Просмотр настроек', NULL, 'all', 610),
  ('settings.manage', 'settings', 'Изменение настроек', NULL, 'all', 620),
  ('billing.manage', 'billing', 'Управление биллингом', NULL, 'all', 710);

INSERT INTO `tenant_roles`
  (`tenant_id`, `name`, `description`, `start_route`, `is_system`, `is_owner`, `system_key`)
SELECT `id`, 'Владелец', 'Системная роль с полным доступом', '/dashboard/products', 1, 1, 'owner'
FROM `ten_tenants`;

INSERT INTO `tenant_roles`
  (`tenant_id`, `name`, `description`, `start_route`, `is_system`, `is_owner`, `system_key`)
SELECT DISTINCT `tenant_id`, 'Администратор', 'Администрирование компании', '/dashboard/orders', 1, 0, 'admin'
FROM `app_users` WHERE `role` = 'admin';

INSERT INTO `tenant_roles`
  (`tenant_id`, `name`, `description`, `start_route`, `is_system`, `is_owner`, `system_key`)
SELECT DISTINCT `tenant_id`, 'Менеджер', 'Работа с заказами и клиентами', '/dashboard/orders', 1, 0, 'manager'
FROM `app_users` WHERE `role` = 'manager';

INSERT INTO `tenant_roles`
  (`tenant_id`, `name`, `description`, `start_route`, `is_system`, `is_owner`, `system_key`)
SELECT DISTINCT `tenant_id`, 'Доставщик', 'Работа с назначенными заказами', '/dashboard/courier-screen', 1, 0, 'courier'
FROM `app_users` WHERE `role` = 'courier';

INSERT INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT r.`tenant_id`, r.`id`, p.`id`, 'all'
FROM `tenant_roles` r
CROSS JOIN `system_permissions` p
WHERE r.`system_key` IN ('owner', 'admin');

INSERT INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT r.`tenant_id`, r.`id`, p.`id`, 'all'
FROM `tenant_roles` r
JOIN `system_permissions` p ON p.`permission_key` IN
  ('orders.view','orders.edit','orders.status','orders.assign','clients.view','clients.edit','products.view','stock.view')
WHERE r.`system_key` = 'manager';

INSERT INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT r.`tenant_id`, r.`id`, p.`id`, 'assigned'
FROM `tenant_roles` r
JOIN `system_permissions` p ON p.`permission_key` IN ('orders.view','orders.status','clients.view')
WHERE r.`system_key` = 'courier';

INSERT INTO `user_roles` (`tenant_id`, `user_id`, `role_id`)
SELECT u.`tenant_id`, u.`id`, r.`id`
FROM `app_users` u
JOIN `tenant_roles` r
  ON r.`tenant_id` = u.`tenant_id`
 AND r.`system_key` = u.`role`;
