'use strict';

const BASE_ACTION_LABELS = Object.freeze({
  read: 'Чтение',
  create: 'Создание',
  update: 'Исправление',
  delete: 'Удаление',
});

function node(id, parentId, navKey, label, accessKey, actions = {}, specialActions = []) {
  return Object.freeze({ id, parentId, navKey, label, accessKey, actions: Object.freeze(actions), specialActions: Object.freeze(specialActions) });
}

const NAVIGATION_RBAC_NODES = Object.freeze([
  node('cash', null, 'cash', 'Касса', 'cash.access'),
  node('cash.journal', 'cash', 'cash', 'Журнал заказов', 'cash.journal.access', { read: 'cash.journal.read', update: 'cash.journal.update' }),
  node('cash.money', 'cash', 'cash', 'Движение денег', 'cash.money.access', { read: 'cash.money.read' }),
  node('cash.expenses', 'cash', 'cash', 'Документы расходов', 'cash.expenses.access', { read: 'cash.expenses.read', create: 'cash.expenses.create', delete: 'cash.expenses.delete' }),

  node('products', null, 'products', 'Товары', 'products.access'),
  node('products.catalog', 'products', 'products', 'Товары', 'products.catalog.access', { read: 'products.catalog.read', create: 'products.catalog.create', update: 'products.catalog.update', delete: 'products.catalog.delete' }, [
    { key: 'products.cost.read', label: 'Просмотр себестоимости' },
  ]),
  node('products.categories', 'products.catalog', 'products', 'Категории', 'products.categories.access', { read: 'products.categories.read', create: 'products.categories.create', update: 'products.categories.update', delete: 'products.categories.delete' }),
  node('products.modifications', 'products', 'products', 'Модификации', null),
  node('products.variants', 'products.modifications', 'products', 'Варианты товара', 'products.variants.access', { read: 'products.variants.read', create: 'products.variants.create', update: 'products.variants.update', delete: 'products.variants.delete' }),
  node('products.options', 'products.modifications', 'products', 'Опции товара', 'products.options.access', { read: 'products.options.read', create: 'products.options.create', update: 'products.options.update', delete: 'products.options.delete' }),
  node('products.auto_add', 'products.modifications', 'products', 'Автодобавления', 'products.auto_add.access', { read: 'products.auto_add.read', create: 'products.auto_add.create', update: 'products.auto_add.update', delete: 'products.auto_add.delete' }),
  node('products.units', 'products.modifications', 'products', 'Единицы измерения', 'products.units.access', { read: 'products.units.read', create: 'products.units.create', update: 'products.units.update', delete: 'products.units.delete' }),
  node('products.allergens', 'products.modifications', 'products', 'Аллергены', 'products.allergens.access'),
  node('products.diets', 'products.modifications', 'products', 'Типы диет', 'products.diets.access'),
  node('products.combo_blocks', 'products.modifications', 'products', 'Блоки комбо', 'products.combo_blocks.access', { read: 'products.combo_blocks.read', create: 'products.combo_blocks.create', update: 'products.combo_blocks.update', delete: 'products.combo_blocks.delete' }),
  node('products.stock', 'products', 'products', 'Склад', null),
  node('stock.receipts', 'products.stock', 'products', 'Приход', 'stock.receipts.access', { read: 'stock.receipts.read', create: 'stock.receipts.create', update: 'stock.receipts.update', delete: 'stock.receipts.delete' }, [
    { key: 'stock.receipts.post', label: 'Проведение приходов' },
  ]),
  node('stock.writeoffs', 'products.stock', 'products', 'Списания', 'stock.writeoffs.access', { read: 'stock.writeoffs.read', create: 'stock.writeoffs.create', update: 'stock.writeoffs.update', delete: 'stock.writeoffs.delete' }, [
    { key: 'stock.writeoffs.post', label: 'Проведение списаний' },
  ]),
  node('stock.history', 'products.stock', 'products', 'История', 'stock.history.access', { read: 'stock.history.read' }),
  node('products.production', 'products', 'products', 'Производство', null),
  node('production.plan', 'products.production', 'products', 'План', 'production.plan.access'),
  node('production.history', 'products.production', 'products', 'История производства', 'production.history.access'),

  node('orders', null, 'orders', 'Заказы', 'orders.access'),
  node('orders.list', 'orders', 'orders', 'Заказы', 'orders.list.access', { read: 'orders.list.read', update: 'orders.list.update' }, [
    { key: 'orders.status', label: 'Изменение статуса' },
    { key: 'orders.assign', label: 'Назначение курьера' },
    { key: 'orders.cancel', label: 'Отмена заказа' },
    { key: 'orders.refund', label: 'Возврат оплаты' },
  ]),

  node('courier', null, 'courier-screen', 'Экран курьера', 'courier.access'),
  node('courier.orders', 'courier', 'courier-screen', 'Заказы курьера', 'courier.orders.access', { read: 'courier.orders.read' }, [
    { key: 'courier.orders.update', label: 'Изменение статуса' },
    { key: 'courier.orders.accept_payment', label: 'Приём оплаты' },
  ]),

  node('new_order', null, 'new-order', 'Новый заказ', 'new_order.access'),
  node('new_order.create', 'new_order', 'new-order', 'Создание заказа', 'new_order.create.access', { create: 'new_order.create' }),

  node('marketing', null, 'clients', 'Маркетинг', 'marketing.access'),
  node('marketing.clients', 'marketing', 'clients', 'Клиенты', 'marketing.clients.access', { read: 'marketing.clients.read', create: 'marketing.clients.create', update: 'marketing.clients.update' }, [
    { key: 'marketing.clients.shop_session', label: 'Вход в клиентский кабинет' },
    { key: 'marketing.clients.benefits', label: 'Выдача клиентских преимуществ' },
  ]),
  node('marketing.segments', 'marketing.clients', 'clients', 'Выборки', 'marketing.segments.access', { read: 'marketing.segments.read', create: 'marketing.segments.create', update: 'marketing.segments.update', delete: 'marketing.segments.delete' }),
  node('marketing.discounts', 'marketing', 'clients', 'Скидки', 'marketing.discounts.access', { read: 'marketing.discounts.read', create: 'marketing.discounts.create', update: 'marketing.discounts.update', delete: 'marketing.discounts.delete' }, [
    { key: 'marketing.discounts.codes', label: 'Управление промокодами' },
    { key: 'marketing.discounts.restore', label: 'Восстановление скидок' },
  ]),
  node('marketing.banners', 'marketing', 'clients', 'Баннеры', 'marketing.banners.access', { read: 'marketing.banners.read', create: 'marketing.banners.create', update: 'marketing.banners.update', delete: 'marketing.banners.delete' }),
  node('marketing.bonus', 'marketing', 'clients', 'Бонусы', null),
  node('marketing.bonus_base', 'marketing.bonus', 'clients', 'Базовый тариф', 'marketing.bonus_base.access', { read: 'marketing.bonus_base.read', update: 'marketing.bonus_base.update' }),
  node('marketing.bonus_paid', 'marketing.bonus', 'clients', 'Платный тариф', 'marketing.bonus_paid.access', { read: 'marketing.bonus_paid.read', update: 'marketing.bonus_paid.update' }),
  node('marketing.referrals', 'marketing.bonus', 'clients', 'Рефералы', 'marketing.referrals.access', { read: 'marketing.referrals.read', update: 'marketing.referrals.update' }),
  node('marketing.bonus_programs', 'marketing.bonus', 'clients', 'Бонусы', 'marketing.bonus_programs.access', { read: 'marketing.bonus_programs.read' }),
  node('marketing.bonus_settings', 'marketing.bonus', 'clients', 'Настройки бонусов', 'marketing.bonus_settings.access', { read: 'marketing.bonus_settings.read', update: 'marketing.bonus_settings.update' }),
  node('marketing.subscriptions', 'marketing', 'clients', 'Подписка', null),
  node('marketing.subscription_history', 'marketing.subscriptions', 'clients', 'История подписок', 'marketing.subscription_history.access', { read: 'marketing.subscription_history.read' }),
  node('marketing.subscription_plans', 'marketing.subscriptions', 'clients', 'Настройка подписки', 'marketing.subscription_plans.access', { read: 'marketing.subscription_plans.read', create: 'marketing.subscription_plans.create', update: 'marketing.subscription_plans.update' }),
  node('marketing.subscription_info', 'marketing.subscriptions', 'clients', 'Информация', 'marketing.subscription_info.access', { read: 'marketing.subscription_info.read', update: 'marketing.subscription_info.update' }),
  node('marketing.broadcasts', 'marketing', 'clients', 'Promo рассылки', 'marketing.broadcasts.access', { read: 'marketing.broadcasts.read', create: 'marketing.broadcasts.create', update: 'marketing.broadcasts.update', delete: 'marketing.broadcasts.delete' }),

  node('team', null, 'team', 'Команда', 'team.access'),
  node('team.employees', 'team', 'team', 'Сотрудники', 'team.employees.access', { read: 'team.employees.read', create: 'team.employees.create', update: 'team.employees.update' }, [
    { key: 'team.employee_documents.read', label: 'Чтение кадровых документов' },
    { key: 'team.employee_documents.create', label: 'Создание кадровых документов' },
    { key: 'team.employee_documents.update', label: 'Исправление кадровых документов' },
    { key: 'team.employees.reset_password', label: 'Сброс пароля сотрудника' },
  ]),
  node('team.roles', 'team', 'team', 'Роли и права', 'team.roles.access', { read: 'team.roles.read' }, [
    { key: 'team.roles.create', label: 'Создание ролей' },
    { key: 'team.roles.update', label: 'Исправление ролей' },
    { key: 'team.roles.delete', label: 'Удаление ролей' },
    { key: 'team.roles.permissions', label: 'Управление разрешениями' },
  ]),

  node('chat', null, 'chat', 'Чаты', 'chat.access'),
  node('chat.threads', 'chat', 'chat', 'Чат поддержки', 'chat.threads.access', { read: 'chat.threads.read', create: 'chat.threads.create', update: 'chat.threads.update', delete: 'chat.threads.delete' }),

  node('settings', null, 'settings', 'Настройки', 'settings.access'),
  node('settings.company', 'settings', 'settings', 'Компания', 'settings.company.access', { read: 'settings.company.read', update: 'settings.company.update' }, [
    { key: 'settings.company.login_suffix', label: 'Смена суффикса логинов' },
  ]),
  node('settings.stores', 'settings', 'settings', 'Филиалы', 'settings.stores.access', { read: 'settings.stores.read', create: 'settings.stores.create', update: 'settings.stores.update' }, [
    { key: 'settings.stores.integrations', label: 'Интеграции филиалов' },
  ]),
  node('settings.delivery', 'settings', 'settings', 'Доставка', 'settings.delivery.access', { read: 'settings.delivery.read', create: 'settings.delivery.create', update: 'settings.delivery.update', delete: 'settings.delivery.delete' }),
  node('settings.site', 'settings', 'settings', 'Сайт', 'settings.site.access', { read: 'settings.site.read', update: 'settings.site.update' }, [
    { key: 'settings.site.domains', label: 'Управление доменами и сертификатами' },
  ]),
  node('settings.chat', 'settings', 'settings', 'Чат поддержки', 'settings.chat.access', { read: 'settings.chat.read', update: 'settings.chat.update' }),
  node('settings.payments', 'settings', 'settings', 'Платежи', 'settings.payments.access', { read: 'settings.payments.read' }, [
    { key: 'settings.payments.manage', label: 'Управление платежами и подключениями' },
  ]),
  node('settings.api', 'settings', 'settings', 'API', 'settings.api.access', { read: 'settings.api.read', create: 'settings.api.create', update: 'settings.api.update' }, [
    { key: 'settings.api.regenerate', label: 'Регенерация API-ключей' },
  ]),
  node('settings.print_templates', 'settings', 'settings', 'Шаблоны печати', 'settings.print_templates.access', { read: 'settings.print_templates.read', update: 'settings.print_templates.update' }),
  node('settings.production_zones', 'settings', 'settings', 'Производственные зоны', 'settings.production_zones.access', { read: 'settings.production_zones.read', create: 'settings.production_zones.create', update: 'settings.production_zones.update' }),
  node('settings.system', 'settings', 'settings', 'Системные', 'settings.system.access', { read: 'settings.system.read', update: 'settings.system.update' }, [
    { key: 'settings.system.integrations', label: 'Системные интеграции' },
  ]),
]);

const NODE_BY_ID = new Map(NAVIGATION_RBAC_NODES.map((item) => [item.id, item]));

function permissionForNodeAction(nodeId, action) {
  const item = NODE_BY_ID.get(nodeId);
  if (!item) return null;
  if (action === 'access') return item.accessKey || null;
  return item.actions[action] || null;
}

function methodAction(method) {
  const normalized = String(method || 'GET').toUpperCase();
  if (normalized === 'GET' || normalized === 'HEAD') return 'read';
  if (normalized === 'POST') return 'create';
  if (normalized === 'PUT' || normalized === 'PATCH') return 'update';
  if (normalized === 'DELETE') return 'delete';
  return null;
}

function resolveAdminPermission({ path, method, headers = {}, query = {}, body = {} }) {
  const route = String(path || '').toLowerCase();
  const action = methodAction(method);
  const context = String(headers['x-rbac-context'] || '').trim().toLowerCase();
  const byAction = (nodeId, overrideAction = action) => permissionForNodeAction(nodeId, overrideAction) || 'rbac.action_not_supported';

  if (route.startsWith('/team')) return null;
  if (route === '/payment-connections' || route.startsWith('/payment-connections/')) {
    return route.startsWith('/payment-connections/operations') || action !== 'read'
      ? 'settings.payments.manage' : 'settings.payments.read';
  }
  if (route.startsWith('/orders')) {
    if (route.includes('/cash-summary') || route.includes('/cash-day')) return byAction('cash.journal', 'read');
    if (context === 'new-order' && (route === '/orders/statuses' || route === '/orders/benefits/preview')) return 'new_order.create';
    if (context === 'courier') {
      if (action === 'read') return 'courier.orders.read';
      if (String(method || '').toUpperCase() === 'PUT' && /^\/orders\/[^/]+\/paid$/.test(route)) return 'courier.orders.accept_payment';
      if (String(method || '').toUpperCase() === 'PUT' && /^\/orders\/[^/]+\/status$/.test(route)) return 'courier.orders.update';
      return 'courier.unsupported';
    }
    if (/^\/orders\/[^/]+\/payment\/refresh$/.test(route) && String(method).toUpperCase() === 'POST') {
      return context === 'cash' ? 'cash.journal.read' : 'orders.list.read';
    }
    if (route.includes('/refund')) return 'orders.refund';
    if (context === 'cash') return byAction('cash.journal');
    if (route === '/orders/benefits/preview') return 'orders.list.read';
    if (route.includes('/assignee')) return 'orders.assign';
    if (action === 'update' && (/\/status$/.test(route) || route.endsWith('/paid'))) return 'orders.status';
    if (action === 'delete') return 'orders.cancel';
    if (route.includes('/print-item-label')) return 'orders.list.read';
    return byAction('orders.list');
  }
  if (route.startsWith('/stock')) return null;
  if (route === '/clients/filters/preview-count') return byAction('marketing.segments', 'read');
  if (route.startsWith('/clients/filters')) return byAction('marketing.segments');
  if (route.startsWith('/clients')) {
    if (context === 'chat' && action === 'read' && /^\/clients\/[^/]+(?:\/orders(?:\/header-candidate)?)?$/.test(route)) {
      return 'chat.threads.read';
    }
    if (/^\/clients\/[^/]+\/shop-session$/.test(route)) return 'marketing.clients.shop_session';
    if (/^\/clients\/[^/]+\/benefits\/issue$/.test(route)) return 'marketing.clients.benefits';
    if (action !== 'read' && route !== '/clients') return 'marketing.clients.update';
    return byAction('marketing.clients');
  }
  if (route.startsWith('/discounts')) {
    if (route.includes('/promo-codes')) return 'marketing.discounts.codes';
    if (route.endsWith('/restore')) return 'marketing.discounts.restore';
    if (route.endsWith('/toggle')) return 'marketing.discounts.update';
    return byAction('marketing.discounts');
  }
  if (route.startsWith('/important-messages')) {
    if (route.endsWith('/state')) return 'marketing.broadcasts.update';
    return byAction('marketing.broadcasts');
  }
  if (route.startsWith('/subscriptions/history')) return byAction('marketing.subscription_history', 'read');
  if (route.startsWith('/subscriptions/plans')) return byAction('marketing.subscription_plans');
  if (route.startsWith('/subscriptions/storefront-settings')) return byAction('marketing.subscription_info');
  if (/^\/bonus\/customers\/[^/]+\/join$/.test(route)) return 'marketing.clients.benefits';
  if (route.startsWith('/bonus/customers')) return 'marketing.clients.read';
  if (route.startsWith('/bonus')) {
    const bonusNode = String(headers['x-rbac-node'] || '').trim();
    const allowed = new Set(['marketing.bonus_base', 'marketing.bonus_paid', 'marketing.referrals', 'marketing.bonus_programs', 'marketing.bonus_settings']);
    return byAction(allowed.has(bonusNode) ? bonusNode : 'marketing.bonus_settings');
  }
  if (context === 'new-order') {
    const newOrderCatalogRead = action === 'read' && (
      route.startsWith('/catalog') || route.startsWith('/products') || route.startsWith('/prod_')
    );
    const newOrderCatalogCalculation = action === 'create'
      && /^\/catalog\/(product-targets|product-summaries|product-passports)$/.test(route);
    if (newOrderCatalogRead || newOrderCatalogCalculation) return 'new_order.create';
  }
  if (route.startsWith('/new-order') || route.startsWith('/checkout-constructor')) return 'new_order.create';
  if (route.startsWith('/sort/prod_categories')) return 'products.categories.update';
  if (route.startsWith('/sort/prod_products')) return 'products.catalog.update';
  if (route.startsWith('/upload/category')) return 'products.categories.create';
  if (route.startsWith('/upload/product')) return 'products.catalog.create';
  if (/^\/catalog\/(product-targets|product-summaries|product-passports)/.test(route)) return 'products.catalog.read';
  if (route.startsWith('/catalog/combos')) return 'products.combo_blocks.read';
  if (route.startsWith('/catalog/categories') || route.startsWith('/prod_categories')) return byAction('products.categories');
  if (/^\/products\/[^/]+\/variants/.test(route)) return byAction('products.variants');
  if (/^\/products\/[^/]+\/variant-assignments/.test(route)) return byAction('products.variants');
  if (/^\/products\/[^/]+\/option-assignments/.test(route)) return byAction('products.options');
  if (/^\/products\/[^/]+\/unit-links/.test(route)) return byAction('products.units');
  if (route.startsWith('/variants')) return byAction('products.variants');
  if (route.startsWith('/options')) return byAction('products.options');
  if (route.startsWith('/auto-add')) return byAction('products.auto_add');
  if (route.startsWith('/units') || route.startsWith('/unit-conversions')) return byAction('products.units');
  if (route.startsWith('/combo-blocks') || route.startsWith('/combos')) return byAction('products.combo_blocks');
  if (route.startsWith('/catalog') || route.startsWith('/products') || route.startsWith('/prod_products')) return byAction('products.catalog');
  if (route.startsWith('/analytics/receipts/recognize')) return 'cash.expenses.create';
  if (route.startsWith('/analytics/expense-documents')) return byAction('cash.expenses');
  if (route.startsWith('/analytics')) return byAction('cash.money');
  if (route.startsWith('/tenant/upload')) {
    const uploadNode = String(headers['x-rbac-node'] || '').trim();
    if (uploadNode === 'marketing.banners') return 'marketing.banners.update';
    if (uploadNode === 'marketing.bonus_settings') return 'marketing.bonus_settings.update';
    if (uploadNode === 'marketing.broadcasts') return 'marketing.broadcasts.update';
    if (uploadNode === 'marketing.subscription_info') return 'marketing.subscription_info.update';
    if (uploadNode === 'settings.site') return 'settings.site.update';
    if (uploadNode === 'settings.chat') return 'settings.chat.update';
    if (uploadNode === 'settings.print_templates') return 'settings.print_templates.update';
    if (uploadNode === 'settings.system') return 'settings.system.update';
    return 'settings.company.update';
  }
  if (route.startsWith('/tenant/list-icon')) return 'settings.system.update';
  if (route.startsWith('/tenant/delivery-zones') || route.startsWith('/tenant/delivery-settings')) return byAction('settings.delivery');
  if (route.startsWith('/tenant/order-')) {
    if (context === 'new-order' && action === 'read') return 'new_order.create';
    if (context === 'orders' && action === 'read') return 'orders.list.read';
    if (context === 'cash' && action === 'read') return 'cash.journal.read';
    const settingsNode = String(headers['x-rbac-node'] || '').trim();
    return byAction(settingsNode === 'settings.system' ? 'settings.system' : 'settings.company');
  }
  if (route.startsWith('/tenant/stores')) {
    if (route.includes('/telegram') || route.includes('/max')) return 'settings.stores.integrations';
    return byAction('settings.stores');
  }
  if (route.startsWith('/tenant/print-api')) {
    if (route.includes('/regenerate')) return 'settings.api.regenerate';
    return byAction('settings.api');
  }
  if (route.startsWith('/tenant/print-templates')) return byAction('settings.print_templates');
  if (route.startsWith('/tenant/production-zones')) {
    if (context === 'products' && action === 'read') return 'products.catalog.read';
    return byAction('settings.production_zones');
  }
  if (route.startsWith('/tenant/domains') || route.startsWith('/tenant/certificate') || route.startsWith('/tenant/renew-certificate') || route.startsWith('/tenant/connect-domain') || route.startsWith('/tenant/check-domain')) return 'settings.site.domains';
  if (route === '/tenant/map-provider-config' && action === 'read') {
    if (context === 'new-order') return 'new_order.create';
    if (context === 'orders') return 'orders.list.read';
    if (String(headers['x-rbac-node'] || '').trim() === 'settings.delivery') return 'settings.delivery.read';
  }
  if (route.startsWith('/tenant/telegram') || route.startsWith('/tenant/map-provider')) return 'settings.system.integrations';
  if (route === '/tenant/current-time' || route === '/tenant/password') return null;
  if (route.startsWith('/system')) {
    const settingsNode = String(headers['x-rbac-node'] || '').trim();
    if (settingsNode === 'settings.delivery') return byAction('settings.delivery');
    if (settingsNode === 'settings.stores'
        && /^\/system\/(map-geocode|address-suggest|address-suggest-local|delivery-zone-polygon)/.test(route)) {
      return byAction('settings.stores');
    }
    return 'settings.system.integrations';
  }
  if (route.startsWith('/tenant')) {
    if (route === '/tenant' && Object.prototype.hasOwnProperty.call(body, 'online_receipt_config') && action !== 'read') {
      return 'settings.payments.manage';
    }
    if (route === '/tenant/login-suffix') return action === 'read' ? 'settings.company.read' : 'settings.company.login_suffix';
    const settingsNode = String(headers['x-rbac-node'] || '').trim();
    if (route === '/tenant' && action === 'read') {
      if (context === 'new-order') return 'new_order.create';
      if (context === 'orders') return 'orders.list.read';
      const selectedNode = NODE_BY_ID.get(settingsNode);
      if (selectedNode && ['settings', 'clients'].includes(selectedNode.navKey)) return byAction(settingsNode, 'read');
      if (context === 'marketing') return 'marketing.clients.read';
    }
    const allowed = new Set(['settings.company', 'settings.site', 'settings.chat', 'settings.system', 'marketing.broadcasts']);
    return byAction(allowed.has(settingsNode) ? settingsNode : 'settings.company');
  }
  if (route.startsWith('/presence')) {
    const presenceNode = String(query.rbac_node || '').trim();
    if (presenceNode === 'chat.threads') return 'chat.threads.read';
    if (presenceNode === 'settings.company') return 'settings.company.read';
    return 'marketing.clients.read';
  }
  return null;
}

module.exports = {
  BASE_ACTION_LABELS,
  NAVIGATION_RBAC_NODES,
  NODE_BY_ID,
  methodAction,
  permissionForNodeAction,
  resolveAdminPermission,
};
