-- Granular navigation/action RBAC. Legacy keys remain only for rollback and are not used by the new server checks.
INSERT INTO `system_permissions`
  (`permission_key`, `group_key`, `label`, `description`, `allowed_access_rules`, `sort_order`)
VALUES
  ('cash.access', 'cash', 'Доступ: Касса', NULL, 'all,stores', 1000),
  ('cash.journal.access', 'cash', 'Доступ: Журнал заказов', NULL, 'all,stores', 1001),
  ('cash.journal.read', 'cash', 'Чтение: Журнал заказов', NULL, 'all,stores', 1002),
  ('cash.journal.update', 'cash', 'Исправление: Журнал заказов', NULL, 'all,stores', 1003),
  ('cash.money.access', 'cash', 'Доступ: Движение денег', NULL, 'all,stores', 1004),
  ('cash.money.read', 'cash', 'Чтение: Движение денег', NULL, 'all,stores', 1005),
  ('cash.expenses.access', 'cash', 'Доступ: Документы расходов', NULL, 'all,stores', 1006),
  ('cash.expenses.read', 'cash', 'Чтение: Документы расходов', NULL, 'all,stores', 1007),
  ('cash.expenses.create', 'cash', 'Создание: Документы расходов', NULL, 'all,stores', 1008),
  ('cash.expenses.delete', 'cash', 'Удаление: Документы расходов', NULL, 'all,stores', 1009),
  ('products.access', 'products', 'Доступ: Товары', NULL, 'all,stores', 1010),
  ('products.catalog.access', 'products', 'Доступ: Товары', NULL, 'all,stores', 1011),
  ('products.catalog.read', 'products', 'Чтение: Товары', NULL, 'all,stores', 1012),
  ('products.catalog.create', 'products', 'Создание: Товары', NULL, 'all,stores', 1013),
  ('products.catalog.update', 'products', 'Исправление: Товары', NULL, 'all,stores', 1014),
  ('products.catalog.delete', 'products', 'Удаление: Товары', NULL, 'all,stores', 1015),
  ('products.cost.read', 'products', 'Просмотр себестоимости', NULL, 'all,stores', 1016),
  ('products.categories.access', 'products', 'Доступ: Категории', NULL, 'all,stores', 1017),
  ('products.categories.read', 'products', 'Чтение: Категории', NULL, 'all,stores', 1018),
  ('products.categories.create', 'products', 'Создание: Категории', NULL, 'all,stores', 1019),
  ('products.categories.update', 'products', 'Исправление: Категории', NULL, 'all,stores', 1020),
  ('products.categories.delete', 'products', 'Удаление: Категории', NULL, 'all,stores', 1021),
  ('products.variants.access', 'products', 'Доступ: Варианты товара', NULL, 'all,stores', 1022),
  ('products.variants.read', 'products', 'Чтение: Варианты товара', NULL, 'all,stores', 1023),
  ('products.variants.create', 'products', 'Создание: Варианты товара', NULL, 'all,stores', 1024),
  ('products.variants.update', 'products', 'Исправление: Варианты товара', NULL, 'all,stores', 1025),
  ('products.variants.delete', 'products', 'Удаление: Варианты товара', NULL, 'all,stores', 1026),
  ('products.options.access', 'products', 'Доступ: Опции товара', NULL, 'all,stores', 1027),
  ('products.options.read', 'products', 'Чтение: Опции товара', NULL, 'all,stores', 1028),
  ('products.options.create', 'products', 'Создание: Опции товара', NULL, 'all,stores', 1029),
  ('products.options.update', 'products', 'Исправление: Опции товара', NULL, 'all,stores', 1030),
  ('products.options.delete', 'products', 'Удаление: Опции товара', NULL, 'all,stores', 1031),
  ('products.auto_add.access', 'products', 'Доступ: Автодобавления', NULL, 'all,stores', 1032),
  ('products.auto_add.read', 'products', 'Чтение: Автодобавления', NULL, 'all,stores', 1033),
  ('products.auto_add.create', 'products', 'Создание: Автодобавления', NULL, 'all,stores', 1034),
  ('products.auto_add.update', 'products', 'Исправление: Автодобавления', NULL, 'all,stores', 1035),
  ('products.auto_add.delete', 'products', 'Удаление: Автодобавления', NULL, 'all,stores', 1036),
  ('products.units.access', 'products', 'Доступ: Единицы измерения', NULL, 'all,stores', 1037),
  ('products.units.read', 'products', 'Чтение: Единицы измерения', NULL, 'all,stores', 1038),
  ('products.units.create', 'products', 'Создание: Единицы измерения', NULL, 'all,stores', 1039),
  ('products.units.update', 'products', 'Исправление: Единицы измерения', NULL, 'all,stores', 1040),
  ('products.units.delete', 'products', 'Удаление: Единицы измерения', NULL, 'all,stores', 1041),
  ('products.allergens.access', 'products', 'Доступ: Аллергены', NULL, 'all,stores', 1042),
  ('products.diets.access', 'products', 'Доступ: Типы диет', NULL, 'all,stores', 1043),
  ('products.combo_blocks.access', 'products', 'Доступ: Блоки комбо', NULL, 'all,stores', 1044),
  ('products.combo_blocks.read', 'products', 'Чтение: Блоки комбо', NULL, 'all,stores', 1045),
  ('products.combo_blocks.create', 'products', 'Создание: Блоки комбо', NULL, 'all,stores', 1046),
  ('products.combo_blocks.update', 'products', 'Исправление: Блоки комбо', NULL, 'all,stores', 1047),
  ('products.combo_blocks.delete', 'products', 'Удаление: Блоки комбо', NULL, 'all,stores', 1048),
  ('stock.receipts.access', 'stock', 'Доступ: Приход', NULL, 'all,stores', 1049),
  ('stock.receipts.read', 'stock', 'Чтение: Приход', NULL, 'all,stores', 1050),
  ('stock.receipts.create', 'stock', 'Создание: Приход', NULL, 'all,stores', 1051),
  ('stock.receipts.update', 'stock', 'Исправление: Приход', NULL, 'all,stores', 1052),
  ('stock.receipts.delete', 'stock', 'Удаление: Приход', NULL, 'all,stores', 1053),
  ('stock.receipts.post', 'stock', 'Проведение приходов', NULL, 'all,stores', 1054),
  ('stock.writeoffs.access', 'stock', 'Доступ: Списания', NULL, 'all,stores', 1055),
  ('stock.writeoffs.read', 'stock', 'Чтение: Списания', NULL, 'all,stores', 1056),
  ('stock.writeoffs.create', 'stock', 'Создание: Списания', NULL, 'all,stores', 1057),
  ('stock.writeoffs.update', 'stock', 'Исправление: Списания', NULL, 'all,stores', 1058),
  ('stock.writeoffs.delete', 'stock', 'Удаление: Списания', NULL, 'all,stores', 1059),
  ('stock.writeoffs.post', 'stock', 'Проведение списаний', NULL, 'all,stores', 1060),
  ('stock.history.access', 'stock', 'Доступ: История', NULL, 'all,stores', 1061),
  ('stock.history.read', 'stock', 'Чтение: История', NULL, 'all,stores', 1062),
  ('production.plan.access', 'production', 'Доступ: План', NULL, 'all', 1063),
  ('production.history.access', 'production', 'Доступ: История производства', NULL, 'all', 1064),
  ('orders.access', 'orders', 'Доступ: Заказы', NULL, 'all,stores,own,assigned', 1065),
  ('orders.list.access', 'orders', 'Доступ: Заказы', NULL, 'all,stores,own,assigned', 1066),
  ('orders.list.read', 'orders', 'Чтение: Заказы', NULL, 'all,stores,own,assigned', 1067),
  ('orders.list.update', 'orders', 'Исправление: Заказы', NULL, 'all,stores,own,assigned', 1068),
  ('courier.access', 'courier', 'Доступ: Экран курьера', NULL, 'all,stores,assigned', 1069),
  ('courier.orders.access', 'courier', 'Доступ: Заказы курьера', NULL, 'all,stores,assigned', 1070),
  ('courier.orders.read', 'courier', 'Чтение: Заказы курьера', NULL, 'all,stores,assigned', 1071),
  ('courier.orders.update', 'courier', 'Исправление: Заказы курьера', NULL, 'all,stores,assigned', 1072),
  ('new_order.access', 'new_order', 'Доступ: Новый заказ', NULL, 'all,stores', 1073),
  ('new_order.create.access', 'new_order', 'Доступ: Создание заказа', NULL, 'all,stores', 1074),
  ('new_order.create', 'new_order', 'Создание: Создание заказа', NULL, 'all,stores', 1075),
  ('marketing.access', 'marketing', 'Доступ: Маркетинг', NULL, 'all,stores,own,assigned', 1076),
  ('marketing.clients.access', 'marketing', 'Доступ: Клиенты', NULL, 'all,stores,own,assigned', 1077),
  ('marketing.clients.read', 'marketing', 'Чтение: Клиенты', NULL, 'all,stores,own,assigned', 1078),
  ('marketing.clients.create', 'marketing', 'Создание: Клиенты', NULL, 'all,stores', 1079),
  ('marketing.clients.update', 'marketing', 'Исправление: Клиенты', NULL, 'all,stores', 1190),
  ('marketing.clients.shop_session', 'marketing', 'Вход в клиентский кабинет', NULL, 'all,stores', 1191),
  ('marketing.clients.benefits', 'marketing', 'Выдача клиентских преимуществ', NULL, 'all,stores', 1192),
  ('marketing.segments.access', 'marketing', 'Доступ: Выборки', NULL, 'all,stores', 1080),
  ('marketing.segments.read', 'marketing', 'Чтение: Выборки', NULL, 'all,stores', 1081),
  ('marketing.segments.create', 'marketing', 'Создание: Выборки', NULL, 'all,stores', 1082),
  ('marketing.segments.update', 'marketing', 'Исправление: Выборки', NULL, 'all,stores', 1083),
  ('marketing.segments.delete', 'marketing', 'Удаление: Выборки', NULL, 'all,stores', 1084),
  ('marketing.discounts.access', 'marketing', 'Доступ: Скидки', NULL, 'all,stores', 1085),
  ('marketing.discounts.read', 'marketing', 'Чтение: Скидки', NULL, 'all,stores', 1086),
  ('marketing.discounts.create', 'marketing', 'Создание: Скидки', NULL, 'all,stores', 1087),
  ('marketing.discounts.update', 'marketing', 'Исправление: Скидки', NULL, 'all,stores', 1088),
  ('marketing.discounts.delete', 'marketing', 'Удаление: Скидки', NULL, 'all,stores', 1089),
  ('marketing.discounts.codes', 'marketing', 'Управление промокодами', NULL, 'all,stores', 1090),
  ('marketing.discounts.restore', 'marketing', 'Восстановление скидок', NULL, 'all,stores', 1091),
  ('marketing.banners.access', 'marketing', 'Доступ: Баннеры', NULL, 'all,stores', 1092),
  ('marketing.banners.read', 'marketing', 'Чтение: Баннеры', NULL, 'all,stores', 1093),
  ('marketing.banners.create', 'marketing', 'Создание: Баннеры', NULL, 'all,stores', 1094),
  ('marketing.banners.update', 'marketing', 'Исправление: Баннеры', NULL, 'all,stores', 1095),
  ('marketing.banners.delete', 'marketing', 'Удаление: Баннеры', NULL, 'all,stores', 1096),
  ('marketing.bonus_base.access', 'marketing', 'Доступ: Базовый тариф', NULL, 'all,stores', 1097),
  ('marketing.bonus_base.read', 'marketing', 'Чтение: Базовый тариф', NULL, 'all,stores', 1098),
  ('marketing.bonus_base.update', 'marketing', 'Исправление: Базовый тариф', NULL, 'all,stores', 1099),
  ('marketing.bonus_paid.access', 'marketing', 'Доступ: Платный тариф', NULL, 'all,stores', 1100),
  ('marketing.bonus_paid.read', 'marketing', 'Чтение: Платный тариф', NULL, 'all,stores', 1101),
  ('marketing.bonus_paid.update', 'marketing', 'Исправление: Платный тариф', NULL, 'all,stores', 1102),
  ('marketing.referrals.access', 'marketing', 'Доступ: Рефералы', NULL, 'all,stores', 1103),
  ('marketing.referrals.read', 'marketing', 'Чтение: Рефералы', NULL, 'all,stores', 1104),
  ('marketing.referrals.update', 'marketing', 'Исправление: Рефералы', NULL, 'all,stores', 1105),
  ('marketing.bonus_programs.access', 'marketing', 'Доступ: Бонусы', NULL, 'all,stores', 1106),
  ('marketing.bonus_programs.read', 'marketing', 'Чтение: Бонусы', NULL, 'all,stores', 1107),
  ('marketing.bonus_settings.access', 'marketing', 'Доступ: Настройки бонусов', NULL, 'all,stores', 1109),
  ('marketing.bonus_settings.read', 'marketing', 'Чтение: Настройки бонусов', NULL, 'all,stores', 1110),
  ('marketing.bonus_settings.update', 'marketing', 'Исправление: Настройки бонусов', NULL, 'all,stores', 1111),
  ('marketing.subscription_history.access', 'marketing', 'Доступ: История подписок', NULL, 'all,stores', 1112),
  ('marketing.subscription_history.read', 'marketing', 'Чтение: История подписок', NULL, 'all,stores', 1113),
  ('marketing.subscription_plans.access', 'marketing', 'Доступ: Настройка подписки', NULL, 'all,stores', 1114),
  ('marketing.subscription_plans.read', 'marketing', 'Чтение: Настройка подписки', NULL, 'all,stores', 1115),
  ('marketing.subscription_plans.create', 'marketing', 'Создание: Настройка подписки', NULL, 'all,stores', 1116),
  ('marketing.subscription_plans.update', 'marketing', 'Исправление: Настройка подписки', NULL, 'all,stores', 1117),
  ('marketing.subscription_info.access', 'marketing', 'Доступ: Информация', NULL, 'all,stores', 1118),
  ('marketing.subscription_info.read', 'marketing', 'Чтение: Информация', NULL, 'all,stores', 1119),
  ('marketing.subscription_info.update', 'marketing', 'Исправление: Информация', NULL, 'all,stores', 1120),
  ('marketing.broadcasts.access', 'marketing', 'Доступ: Promo рассылки', NULL, 'all,stores', 1121),
  ('marketing.broadcasts.read', 'marketing', 'Чтение: Promo рассылки', NULL, 'all,stores', 1122),
  ('marketing.broadcasts.create', 'marketing', 'Создание: Promo рассылки', NULL, 'all,stores', 1123),
  ('marketing.broadcasts.update', 'marketing', 'Исправление: Promo рассылки', NULL, 'all,stores', 1124),
  ('marketing.broadcasts.delete', 'marketing', 'Удаление: Promo рассылки', NULL, 'all,stores', 1125),
  ('team.access', 'team', 'Доступ: Команда', NULL, 'all', 1126),
  ('team.employees.access', 'team', 'Доступ: Сотрудники', NULL, 'all', 1127),
  ('team.employees.read', 'team', 'Чтение: Сотрудники', NULL, 'all', 1128),
  ('team.employees.create', 'team', 'Создание: Сотрудники', NULL, 'all', 1129),
  ('team.employees.update', 'team', 'Исправление: Сотрудники', NULL, 'all', 1130),
  ('team.employee_documents.read', 'team', 'Чтение кадровых документов', NULL, 'all', 1131),
  ('team.employee_documents.create', 'team', 'Создание кадровых документов', NULL, 'all', 1132),
  ('team.employee_documents.update', 'team', 'Исправление кадровых документов', NULL, 'all', 1133),
  ('team.employees.reset_password', 'team', 'Сброс пароля сотрудника', NULL, 'all', 1134),
  ('team.roles.access', 'team', 'Доступ: Роли и права', NULL, 'all', 1135),
  ('team.roles.read', 'team', 'Чтение: Роли и права', NULL, 'all', 1136),
  ('team.roles.create', 'team', 'Создание ролей', NULL, 'all', 1137),
  ('team.roles.update', 'team', 'Исправление ролей', NULL, 'all', 1138),
  ('team.roles.delete', 'team', 'Удаление ролей', NULL, 'all', 1139),
  ('team.roles.permissions', 'team', 'Управление разрешениями', NULL, 'all', 1140),
  ('chat.access', 'chat', 'Доступ: Чаты', NULL, 'all', 1141),
  ('chat.threads.access', 'chat', 'Доступ: Чат поддержки', NULL, 'all', 1142),
  ('chat.threads.read', 'chat', 'Чтение: Чат поддержки', NULL, 'all', 1143),
  ('chat.threads.create', 'chat', 'Создание: Чат поддержки', NULL, 'all', 1144),
  ('chat.threads.update', 'chat', 'Исправление: Чат поддержки', NULL, 'all', 1145),
  ('chat.threads.delete', 'chat', 'Удаление: Чат поддержки', NULL, 'all', 1146),
  ('settings.access', 'settings', 'Доступ: Настройки', NULL, 'all', 1147),
  ('settings.company.access', 'settings', 'Доступ: Компания', NULL, 'all', 1148),
  ('settings.company.read', 'settings', 'Чтение: Компания', NULL, 'all', 1149),
  ('settings.company.update', 'settings', 'Исправление: Компания', NULL, 'all', 1150),
  ('settings.stores.access', 'settings', 'Доступ: Филиалы', NULL, 'all', 1151),
  ('settings.stores.read', 'settings', 'Чтение: Филиалы', NULL, 'all', 1152),
  ('settings.stores.create', 'settings', 'Создание: Филиалы', NULL, 'all', 1153),
  ('settings.stores.update', 'settings', 'Исправление: Филиалы', NULL, 'all', 1154),
  ('settings.stores.integrations', 'settings', 'Интеграции филиалов', NULL, 'all', 1155),
  ('settings.delivery.access', 'settings', 'Доступ: Доставка', NULL, 'all', 1156),
  ('settings.delivery.read', 'settings', 'Чтение: Доставка', NULL, 'all', 1157),
  ('settings.delivery.create', 'settings', 'Создание: Доставка', NULL, 'all', 1158),
  ('settings.delivery.update', 'settings', 'Исправление: Доставка', NULL, 'all', 1159),
  ('settings.delivery.delete', 'settings', 'Удаление: Доставка', NULL, 'all', 1160),
  ('settings.site.access', 'settings', 'Доступ: Сайт', NULL, 'all', 1161),
  ('settings.site.read', 'settings', 'Чтение: Сайт', NULL, 'all', 1162),
  ('settings.site.update', 'settings', 'Исправление: Сайт', NULL, 'all', 1163),
  ('settings.site.domains', 'settings', 'Управление доменами и сертификатами', NULL, 'all', 1164),
  ('settings.chat.access', 'settings', 'Доступ: Чат поддержки', NULL, 'all', 1165),
  ('settings.chat.read', 'settings', 'Чтение: Чат поддержки', NULL, 'all', 1166),
  ('settings.chat.update', 'settings', 'Исправление: Чат поддержки', NULL, 'all', 1167),
  ('settings.api.access', 'settings', 'Доступ: API', NULL, 'all', 1168),
  ('settings.api.read', 'settings', 'Чтение: API', NULL, 'all', 1169),
  ('settings.api.create', 'settings', 'Создание: API', NULL, 'all', 1170),
  ('settings.api.update', 'settings', 'Исправление: API', NULL, 'all', 1171),
  ('settings.api.regenerate', 'settings', 'Регенерация API-ключей', NULL, 'all', 1172),
  ('settings.print_templates.access', 'settings', 'Доступ: Шаблоны печати', NULL, 'all', 1173),
  ('settings.print_templates.read', 'settings', 'Чтение: Шаблоны печати', NULL, 'all', 1174),
  ('settings.print_templates.update', 'settings', 'Исправление: Шаблоны печати', NULL, 'all', 1175),
  ('settings.production_zones.access', 'settings', 'Доступ: Производственные зоны', NULL, 'all', 1176),
  ('settings.production_zones.read', 'settings', 'Чтение: Производственные зоны', NULL, 'all', 1177),
  ('settings.production_zones.create', 'settings', 'Создание: Производственные зоны', NULL, 'all', 1178),
  ('settings.production_zones.update', 'settings', 'Исправление: Производственные зоны', NULL, 'all', 1179),
  ('settings.system.access', 'settings', 'Доступ: Системные', NULL, 'all', 1180),
  ('settings.system.read', 'settings', 'Чтение: Системные', NULL, 'all', 1181),
  ('settings.system.update', 'settings', 'Исправление: Системные', NULL, 'all', 1182),
  ('settings.system.integrations', 'settings', 'Системные интеграции', NULL, 'all', 1183)
ON DUPLICATE KEY UPDATE
  `group_key`=VALUES(`group_key`), `label`=VALUES(`label`),
  `description`=VALUES(`description`), `allowed_access_rules`=VALUES(`allowed_access_rules`),
  `sort_order`=VALUES(`sort_order`);

-- Preserve the operations each role could actually perform before the granular cutover.
INSERT IGNORE INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT legacy_grant.`tenant_id`, legacy_grant.`role_id`, target.`id`, legacy_grant.`access_rule`
FROM `role_permissions` legacy_grant
JOIN `system_permissions` legacy ON legacy.`id`=legacy_grant.`permission_id`
JOIN (
  SELECT 'finance.view' AS legacy_key, 'cash.access' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.journal.access' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.journal.read' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.money.access' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.money.read' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.expenses.access' AS target_key
  UNION ALL
  SELECT 'finance.view' AS legacy_key, 'cash.expenses.read' AS target_key
  UNION ALL
  SELECT 'finance.manage' AS legacy_key, 'cash.journal.update' AS target_key
  UNION ALL
  SELECT 'finance.manage' AS legacy_key, 'cash.expenses.create' AS target_key
  UNION ALL
  SELECT 'finance.manage' AS legacy_key, 'cash.expenses.delete' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.catalog.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.catalog.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.categories.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.categories.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.variants.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.variants.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.options.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.options.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.auto_add.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.auto_add.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.units.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.units.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.allergens.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.diets.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.combo_blocks.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'products.combo_blocks.read' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'production.plan.access' AS target_key
  UNION ALL
  SELECT 'products.view' AS legacy_key, 'production.history.access' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.catalog.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.catalog.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.catalog.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.categories.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.categories.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.categories.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.variants.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.variants.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.variants.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.options.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.options.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.options.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.auto_add.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.auto_add.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.auto_add.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.units.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.units.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.units.delete' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.combo_blocks.create' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.combo_blocks.update' AS target_key
  UNION ALL
  SELECT 'products.edit' AS legacy_key, 'products.combo_blocks.delete' AS target_key
  UNION ALL
  SELECT 'finance.cost' AS legacy_key, 'products.cost.read' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'products.access' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.receipts.access' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.receipts.read' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.writeoffs.access' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.writeoffs.read' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.history.access' AS target_key
  UNION ALL
  SELECT 'stock.view' AS legacy_key, 'stock.history.read' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.receipts.create' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.receipts.update' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.receipts.delete' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.writeoffs.create' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.writeoffs.update' AS target_key
  UNION ALL
  SELECT 'stock.edit' AS legacy_key, 'stock.writeoffs.delete' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'orders.access' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'orders.list.access' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'orders.list.read' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'courier.access' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'courier.orders.access' AS target_key
  UNION ALL
  SELECT 'orders.view' AS legacy_key, 'courier.orders.read' AS target_key
  UNION ALL
  SELECT 'orders.edit' AS legacy_key, 'orders.list.update' AS target_key
  UNION ALL
  SELECT 'orders.edit' AS legacy_key, 'new_order.access' AS target_key
  UNION ALL
  SELECT 'orders.edit' AS legacy_key, 'new_order.create.access' AS target_key
  UNION ALL
  SELECT 'orders.edit' AS legacy_key, 'new_order.create' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.clients.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.clients.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.segments.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.segments.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.discounts.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.discounts.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.banners.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.banners.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_base.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_base.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_paid.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_paid.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.referrals.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.referrals.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_programs.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_programs.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_settings.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.bonus_settings.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_history.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_history.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_plans.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_plans.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_info.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.subscription_info.read' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.broadcasts.access' AS target_key
  UNION ALL
  SELECT 'clients.view' AS legacy_key, 'marketing.broadcasts.read' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.clients.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.clients.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.segments.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.segments.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.segments.delete' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.discounts.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.discounts.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.discounts.delete' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.banners.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.banners.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.banners.delete' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.bonus_base.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.bonus_paid.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.referrals.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.bonus_settings.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.subscription_plans.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.subscription_plans.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.subscription_info.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.broadcasts.create' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.broadcasts.update' AS target_key
  UNION ALL
  SELECT 'clients.edit' AS legacy_key, 'marketing.broadcasts.delete' AS target_key
  UNION ALL
  SELECT 'users.view' AS legacy_key, 'team.access' AS target_key
  UNION ALL
  SELECT 'users.view' AS legacy_key, 'team.employees.access' AS target_key
  UNION ALL
  SELECT 'users.view' AS legacy_key, 'team.employees.read' AS target_key
  UNION ALL
  SELECT 'users.manage' AS legacy_key, 'team.access' AS target_key
  UNION ALL
  SELECT 'users.manage' AS legacy_key, 'team.employees.access' AS target_key
  UNION ALL
  SELECT 'users.manage' AS legacy_key, 'team.employees.create' AS target_key
  UNION ALL
  SELECT 'users.manage' AS legacy_key, 'team.employees.update' AS target_key
  UNION ALL
  SELECT 'employee_documents.manage' AS legacy_key, 'team.access' AS target_key
  UNION ALL
  SELECT 'employee_documents.manage' AS legacy_key, 'team.employees.access' AS target_key
  UNION ALL
  SELECT 'employee_documents.manage' AS legacy_key, 'team.employee_documents.read' AS target_key
  UNION ALL
  SELECT 'employee_documents.manage' AS legacy_key, 'team.employee_documents.create' AS target_key
  UNION ALL
  SELECT 'employee_documents.manage' AS legacy_key, 'team.employee_documents.update' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.access' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.access' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.read' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.create' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.update' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.delete' AS target_key
  UNION ALL
  SELECT 'roles.manage' AS legacy_key, 'team.roles.permissions' AS target_key
  UNION ALL
  SELECT 'chat.view' AS legacy_key, 'chat.access' AS target_key
  UNION ALL
  SELECT 'chat.view' AS legacy_key, 'chat.threads.access' AS target_key
  UNION ALL
  SELECT 'chat.view' AS legacy_key, 'chat.threads.read' AS target_key
  UNION ALL
  SELECT 'chat.manage' AS legacy_key, 'chat.threads.create' AS target_key
  UNION ALL
  SELECT 'chat.manage' AS legacy_key, 'chat.threads.update' AS target_key
  UNION ALL
  SELECT 'chat.manage' AS legacy_key, 'chat.threads.delete' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.company.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.company.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.stores.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.stores.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.delivery.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.delivery.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.site.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.site.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.chat.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.chat.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.api.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.api.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.print_templates.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.print_templates.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.production_zones.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.production_zones.read' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.system.access' AS target_key
  UNION ALL
  SELECT 'settings.view' AS legacy_key, 'settings.system.read' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.company.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.stores.create' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.stores.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.delivery.create' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.delivery.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.delivery.delete' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.site.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.chat.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.api.create' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.api.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.print_templates.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.production_zones.create' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.production_zones.update' AS target_key
  UNION ALL
  SELECT 'settings.manage' AS legacy_key, 'settings.system.update' AS target_key
) permission_map ON permission_map.legacy_key=legacy.`permission_key`
JOIN `system_permissions` target ON target.`permission_key`=permission_map.target_key
WHERE FIND_IN_SET(legacy_grant.`access_rule`, target.`allowed_access_rules`) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM `role_permissions` granular_grant
    JOIN `system_permissions` granular_permission ON granular_permission.`id`=granular_grant.`permission_id`
    WHERE granular_grant.`tenant_id`=legacy_grant.`tenant_id`
      AND granular_grant.`role_id`=legacy_grant.`role_id`
      AND granular_permission.`sort_order` BETWEEN 1000 AND 1999
  );

-- The owner invariant includes every registered permission, including explicitly sensitive operations.
INSERT INTO `role_permissions` (`tenant_id`, `role_id`, `permission_id`, `access_rule`)
SELECT role.`tenant_id`, role.`id`, permission.`id`, 'all'
FROM `tenant_roles` role
CROSS JOIN `system_permissions` permission
WHERE role.`is_owner`=1
ON DUPLICATE KEY UPDATE `access_rule`='all';
